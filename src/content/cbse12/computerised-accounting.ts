import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, NumericUnit, Question, TopicPack, TrueFalseQuestion } from '../types';

// Computerised Accounting: the option of Part B that a school may teach in place of Analysis of Financial Statements
// (a learner chooses it in Settings; see content/courseOptions.ts). It follows the three units of the 2025-26
// syllabus: an overview of the computerised accounting system, the electronic spreadsheet in accounting, and using a
// computerised accounting system.
const T = 'computerised-accounting';

const concepts: Concept[] = [
  { id: 'cas-overview', topicId: T, title: 'Meaning, uses, features and limitations of a computerised accounting system' },
  { id: 'cas-structure', topicId: T, title: 'Structure of the system and kinds of accounting software' },
  { id: 'cas-spreadsheet', topicId: T, title: 'The electronic spreadsheet: cells, formulas, functions and references' },
  { id: 'cas-sheet-apps', topicId: T, title: 'Accounting on a spreadsheet: depreciation, loans, bank reconciliation and ratios' },
  { id: 'cas-charts', topicId: T, title: 'Showing data in graphs and charts' },
  { id: 'cas-codification', topicId: T, title: 'Installation, codification and the hierarchy of account heads' },
  { id: 'cas-data-entry', topicId: T, title: 'Data entry through vouchers, validation and verification' },
  { id: 'cas-final-accounts', topicId: T, title: 'Adjusting, closing and opening entries, and the final accounts' },
  { id: 'cas-security', topicId: T, title: 'The need for security, and the security features of the system' },
  { id: 'cas-formats', topicId: T, title: 'Preparing a schedule as a sheet sets it out' },
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
): Card => ({ id: `cas-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'cas-overview', 'rule', 'What is a computerised accounting system?',
    'A system in which the transactions are recorded through a computer, and the accounting package itself posts them, keeps the ledgers and draws up the trial balance, the final accounts and other reports.',
    'The accountant enters each transaction once, as a voucher. Everything after that, posting, balancing, totalling and the reports, is done by the system from the data it holds, by the same rules of double entry as manual books.',
    'A sale on credit is entered as one sales voucher; the customer\'s account, the sales account and the trial balance change at once, and the balance sheet shows the new figures the next time it is opened.',
    'Thinking the computer changes the rules of accounting. Double entry, the accounting principles and the formats of the final accounts stay exactly the same.'),
  card(2, 'cas-overview', 'rule', 'What are the main features and advantages of a computerised accounting system?',
    'Speed, accuracy, reliability, up-to-date information, a real-time user interface (many users working on the same data at once), automated document production, scalability, legibility, efficiency, quality reports, MIS reports for managers, storage and retrieval of large volumes, and the interest it gives employees in their work.',
    'Each is about what the machine does better than a clerk: it does not tire, does not slip in adding or posting, keeps every balance current and can handle far more transactions without a change in procedure.',
    'The owner opens a customer\'s account at 11 a.m. and finds the sale made at 10:55 a.m. already in it: up-to-date information.',
    'Mixing up speed (the work is done quickly) with up-to-date information (balances include every entry the moment it is saved), or accuracy (no slips) with reliability (the same care every time).'),
  card(3, 'cas-overview', 'rule', 'What are the limitations of a computerised accounting system?',
    'Cost of training, opposition from the staff, disruption while the change is made, system failure, inability to check errors it was not told to look for, breaches of security, and ill effects on the health of those who work at screens all day.',
    'A computer follows its rules exactly: an entry that obeys them but is wrong in substance (rent posted to salaries) goes through, and a failure of hardware or a stolen password stops or spoils the work.',
    'A voucher posting a payment of rent to Salaries A/c balances and names ledgers that exist, so the system accepts it: an error it could not anticipate.',
    'Calling speed or accuracy a limitation. They are advantages; the limitations are about cost, people, failure and security.'),
  card(4, 'cas-structure', 'rule', 'What are the components of a computerised accounting system?',
    'Hardware (the machines), software (the operating system and the accounting package), people (those who run and use it), procedure (the rules and steps for using it) and data (the facts entered and kept).',
    'All five are needed: a package with no trained people, or people with no laid-down procedure, does not make a working system.',
    'The rule that a payment voucher above ₹50,000 needs the finance manager\'s approval before it is saved is part of the procedure; the vouchers themselves are data.',
    'Calling the accountant "software" because the accountant uses the package, or the voucher "procedure" because it follows a format.'),
  card(5, 'cas-structure', 'rule', 'How does a computerised accounting system work, and on what is it built?',
    'It works in stages: input (vouchers and opening balances keyed in), processing (posting, totalling, balancing, classifying), storage (keeping the data to use again) and output (reports on the screen or on paper). It rests on an accounting framework, the principles, codes and groups of accounts, and on an operating procedure for using it.',
    'Data goes in once; every report comes out of the same stored data, so the books and the reports always agree.',
    'Keying in a sales invoice is input; the ledger balance it changes is processing; the printed balance sheet is output.',
    'Treating posting to the ledger as input. The student types the voucher; the system does the posting.'),
  card(6, 'cas-structure', 'rule', 'How do generic, specific and tailored accounting software differ?',
    'Generic (ready-made): sold off the shelf for the usual books of small businesses; lowest cost, least training, least secrecy. Specific (customised): a standard package altered or added to for the particular needs of its user; medium cost and secrecy. Tailored (tailor-made): written for one large organisation alone; highest cost, most training, highest secrecy.',
    'The choice turns on the size of the business, how far its needs differ from the usual, how many users it has and what it can spend.',
    'A small grocery shop buys a generic package; a hotel has a standard package fitted with a room-billing module (specific); a nationalised bank has its own software written (tailored).',
    'Thinking secrecy is high with generic software: anyone can buy the same package, so it is the lowest.'),
  card(7, 'cas-spreadsheet', 'rule', 'What are the building blocks of an electronic spreadsheet?',
    'A sheet of columns (lettered A, B, C ...) and rows (numbered 1, 2, 3 ...). Each cell is named by its column and then its row (C7). A range runs from one cell to another (B2:D6). A formula starts with "=" and is worked out again whenever a cell it names changes.',
    'Inside a formula, multiplication and division are done before addition and subtraction; brackets are worked out first. Functions such as SUM and AVERAGE work on ranges.',
    'The range B2:D6 has 3 columns and 5 rows: 15 cells. =B2*C2/100 with ₹48,000 in B2 and 5 in C2 returns 2,400.',
    'Counting the cells of B2:D6 as (D - B) × (6 - 2) = 8, leaving out the first column and the first row.'),
  card(8, 'cas-spreadsheet', 'rule', 'How do relative, absolute and mixed references behave when a formula is copied?',
    'A relative reference (B2) moves with the copy by as many columns and rows as the copy moves. An absolute reference ($C$1) never moves. A mixed reference fixes only the part after the $: $A3 keeps column A but its row moves; B$2 keeps row 2 but its column moves.',
    'Use an absolute reference for a single figure every row needs, such as a rate kept in one cell.',
    'D2 holds =B2*$C$1. Copied to D5 it becomes =B5*$C$1: B2 moved down three rows, $C$1 stayed. In a table, =$A3*B$2 copied from B3 to D6 becomes =$A6*D$2.',
    'Copying =B2*C1 down the column for a rate kept in C1: the copies become =B3*C2, =B4*C3, and pick up empty cells instead of the rate.'),
  card(9, 'cas-spreadsheet', 'formula', 'What do the common functions of a spreadsheet give?',
    'SUM: the total of a range. AVERAGE: the arithmetic mean. MAX and MIN: the largest and smallest. COUNT: how many cells hold numbers. ROUND(x, n): x to n decimal places. IF(condition, value if true, value if false): one value or the other as the condition holds.',
    'Functions are written with their arguments in brackets, separated by commas: =IF(B2>=50000,B2*10/100,B2*5/100).',
    'With an order of ₹50,000 in B2, =IF(B2>=50000,B2*10/100,B2*5/100) gives ₹5,000: 50,000 is not more than 50,000, but it is equal, and >= means "more than or equal to".',
    'Reading >= as "more than": a value equal to the limit meets the condition.'),
  card(10, 'cas-sheet-apps', 'formula', 'How are depreciation schedules worked out on a spreadsheet?',
    'Straight line: =SLN(cost, salvage value, life) gives (cost - salvage value) ÷ life, the same every year. Written down value: each year\'s depreciation is the book value at the start of the year × the rate, and the next year starts from the book value less that depreciation. =DB(cost, salvage, life, period) does this with a fixed rate of 1 - (salvage value ÷ cost)^(1 ÷ life), rounded to three decimal places.',
    'A schedule has a row for each year: book value at the start, depreciation, book value at the end. Under SLN the book value reaches the salvage value at the end of the life; under DB too, or very nearly, since the rate is worked out for that and then rounded.',
    'Cost ₹1,60,000, salvage value ₹10,000, life 4 years: DB\'s rate is 1 - (10,000 ÷ 1,60,000)^(1/4) = 1 - 0.5 = 50%. Year 1 ₹80,000, year 2 ₹40,000, year 3 ₹20,000, year 4 ₹10,000; book value left ₹10,000.',
    'Charging the written down value rate on the cost every year: that gives a straight line charge.'),
  card(11, 'cas-sheet-apps', 'formula', 'How is a loan repayment schedule worked out on a spreadsheet?',
    '=PMT(rate, number of instalments, -loan) gives the equal instalment: loan × r × (1 + r)^n ÷ ((1 + r)^n - 1). The loan is entered with a minus sign because PMT shows money received and money paid with opposite signs: the loan comes in, so the instalment going out comes out positive. Each year, interest = balance at the start × r (=IPMT), principal repaid = instalment - interest (=PPMT), and balance at the end = balance at the start - principal repaid.',
    'The interest part falls and the principal part rises from year to year, because interest is charged on a falling balance. The principal parts add up to the loan. In a schedule of whole rupees the instalment (=ROUND(PMT(...),0)) and each year\'s interest are rounded to the nearest rupee, and the last instalment is adjusted: it is the balance left with that year\'s interest, so that the loan is repaid exactly.',
    'Loan ₹2,10,000 at 10% a year in 2 yearly instalments: instalment = 2,10,000 × 0.1 × 1.21 ÷ 0.21 = ₹1,21,000. Year 1: interest ₹21,000, principal ₹1,00,000, balance ₹1,10,000. Year 2: interest ₹11,000, principal ₹1,10,000, balance nil.',
    'Charging every year\'s interest on the whole loan, as if nothing had been repaid; or, in a rounded schedule, paying the equal instalment in the last year too, which leaves a few rupees owing or overpaid.'),
  card(12, 'cas-sheet-apps', 'rule', 'How is a bank reconciliation statement prepared on a spreadsheet?',
    'Put the balance as per cash book in one cell and each item of difference in a cell below it; the formula adds the items that make the pass book balance higher and deducts the others: =B2+B3-B4-B5+B6.',
    'From a debit balance of the cash book: add cheques issued but not yet presented and amounts the bank has credited alone (interest, direct deposits); deduct cheques deposited but not yet credited and amounts the bank has debited alone (charges, payments on standing instruction).',
    'Cash book ₹40,000; cheques issued not presented ₹6,000; cheques deposited not credited ₹9,000; bank charges ₹500: =B2+B3-B4-B5 gives a pass book balance of ₹36,500.',
    'Adding every item with =SUM, or giving the two timing items the opposite signs.'),
  card(13, 'cas-sheet-apps', 'shortcut', 'Why do the formulas of ratios on a sheet need brackets?',
    'Because a spreadsheet divides and multiplies before it adds and subtracts. A term that is a sum or a difference must be put in brackets: =(B2-B3)/B4, =B2/((B3+B4)/2).',
    'Write the ratio in words first, then put each term that is worked out from more than one cell inside its own brackets.',
    'Quick ratio, (current assets - inventories - prepaid expenses) ÷ current liabilities, with current assets in B2, inventories in B3, prepaid expenses in B4 and current liabilities in B5: =(B2-B3-B4)/B5. Without the brackets, =B2-B3-B4/B5 divides only the prepaid expenses.',
    'Writing the average inventory as =B2/(B3+B4)/2, which divides by the sum and then halves the result, a quarter of the right ratio.'),
  card(14, 'cas-charts', 'rule', 'Which chart suits which purpose?',
    'Line chart: how a figure changes over time. Pie chart: the parts of one whole. Column or bar chart: separate items side by side. Scatter (XY) chart: whether two measures move together.',
    'In a pie chart each slice is item ÷ total × 360°: the whole circle stands for the total.',
    'Expenses of ₹3,60,000 of which rent is ₹54,000: the slice for rent is 54,000 ÷ 3,60,000 × 360° = 54°.',
    'Using a pie chart for sales over ten years: a pie shows shares of one total, not a change over time.'),
  card(15, 'cas-codification', 'rule', 'In what order is a computerised accounting system installed and set up?',
    'Check that the computer meets the hardware and operating system the package needs; install the package; create the company (name, address, the start of its financial year and books, and a password); create the groups and ledgers with their opening balances; then enter the vouchers.',
    'Each step needs the one before it: a ledger belongs to a company and is created under a group; a voucher is posted to ledgers that already exist.',
    'Sagar Traders installs the package, creates "Sagar Traders" with its year beginning 1 April 2025, opens ledgers such as Bank and Rao & Co. under their groups, then enters the vouchers of April.',
    'Trying to enter vouchers before the ledgers they name have been created.'),
  card(16, 'cas-codification', 'rule', 'What are the methods of coding accounts?',
    'Sequential codes: numbers one after another (vouchers 1001, 1002, ...). Block codes: a range kept for each class (100-199 assets, 200-299 liabilities). Mnemonic codes: letters that remind the user of the account (SD for Sundry Debtors).',
    'A code names one account only, is quicker to key in than a name, and its digits place the account in its head and group, so reports can be built from it.',
    'Under a scheme of head, group and a two-digit serial, with Assets 1 and Current assets group 12, the third ledger opened in Current assets is 1203.',
    'Writing the serial with one digit (123) or starting it from 00 (1202).'),
  card(17, 'cas-codification', 'rule', 'How are account heads arranged in a computerised accounting system?',
    'In a hierarchy: primary groups at the top (Capital Account, Fixed Assets, Current Assets, Current Liabilities, Loans (Liability), Sales and Purchase Accounts, Direct and Indirect Expenses and Incomes), sub-groups within them (Bank Accounts, Sundry Debtors and Cash-in-hand under Current Assets; Sundry Creditors and Duties and Taxes under Current Liabilities), and ledger accounts at the bottom, to which vouchers are posted.',
    'The group decides where a ledger\'s balance appears: direct expenses and incomes in the trading account, indirect ones in the profit and loss account, the rest in the balance sheet. Packages name some groups a little differently and add sub-groups of their own; what matters is the hierarchy itself, and a ledger goes where what it holds belongs.',
    'Wages paid to factory workers are opened under Direct Expenses; the salaries of the office staff under Indirect Expenses; Rao & Co., a supplier, under Sundry Creditors.',
    'Opening outstanding salaries under Indirect Expenses: the expense is salaries, the amount still owed is a current liability.'),
  card(18, 'cas-data-entry', 'rule', 'Which voucher type records which transaction?',
    'Receipt: money in, in cash or into the bank. Payment: money out. Contra: money moved between cash and bank, or between two banks. Journal: entries with no cash or bank (adjustments, depreciation, bad debts, transfers). Sales and Purchase: goods sold and bought. Credit note: goods returned by a customer. Debit note: goods returned to a supplier.',
    'Ask first whether cash or bank is involved, and which way the money goes; then whether the transaction is about goods.',
    'Cash deposited into the bank is a contra voucher; depreciation charged on machinery is a journal voucher; a cheque received from a debtor is a receipt voucher.',
    'Recording cash deposited into the bank as a payment voucher: the money stays in the business.'),
  card(19, 'cas-data-entry', 'rule', 'What is the difference between validation and verification of data?',
    'Validation is the system checking each entry against rules as it is typed: data type, range, presence, list, format, date, balancing and duplicate checks. Verification is checking that what was entered agrees with the source document.',
    'Validation refuses impossible or incomplete data; it cannot tell that a possible figure is the wrong one. Only verification finds ₹5,400 keyed in as ₹4,500.',
    'A voucher dated 30 February is refused by the date check; a journal voucher with debits of ₹12,000 and credits of ₹10,000 by the balancing check.',
    'Expecting validation to catch a transposed amount or a sale posted to the wrong customer: both pass every rule.'),
  card(20, 'cas-final-accounts', 'rule', 'How are adjusting, closing and opening entries made in a computerised accounting system?',
    'Each is entered through a journal voucher. Adjusting entries bring in outstanding and prepaid expenses, accrued income, income received in advance and depreciation. Closing entries transfer the incomes and expenses to the profit and loss account, and the net profit or loss and the drawings to capital. The opening entry of the next year debits the assets and credits the liabilities and capital.',
    'Once the adjustments are entered the system draws up the profit and loss account and the balance sheet from the groups of the ledgers, and carries the real and personal balances into the next year.',
    'Salaries of ₹12,000 outstanding: Salaries A/c Dr ₹12,000, To Outstanding Expenses A/c ₹12,000. Net profit ₹80,000: Profit and Loss A/c Dr ₹80,000, To Capital A/c ₹80,000.',
    'Closing the asset and liability accounts at the year end: they are carried forward, not closed.'),
  card(21, 'cas-security', 'rule', 'Why does a computerised accounting system need security, and what features give it?',
    'Its data can be read, altered, deleted or lost far more quietly than paper books. Passwords keep out outsiders; user access rights let each user do only what the role allows; an audit trail records who entered, altered or deleted each voucher and when; back-up and restore guard against loss; a data vault (encryption) keeps data unreadable without the key.',
    'Security is about who may see, who may change, a record of every change, and a copy if all else fails.',
    'A clerk can enter vouchers but cannot see the profit and loss account: user access rights.',
    'Thinking a back-up keeps out intruders: it only lets the data be put back after a loss.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `cas-q-${String(n).padStart(3, '0')}`;

/**
 * The place of an Assertion-Reason option in the board's fixed order: (a) both true and R explains A, (b) both true
 * and R does not explain A, (c) A true and R false, (d) A false and R true. -1 for any other option.
 */
const arPlace = (text: string): number =>
  text.startsWith('Both A and R are true') ? (text.includes(' not ') ? 1 : 0) : text.startsWith('A is true') ? 2 : text.startsWith('A is false') ? 3 : -1;

/**
 * An mcq: the right option is put at a position that depends on n, so the answers are spread over a, b, c and d. The
 * options of an Assertion-Reason question stand in the board's order instead, whichever is right.
 */
function mcq(n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqQuestion {
  const pos = n % (wrong.length + 1);
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(pos, 0, { text: correct });
  if (all.length === 4 && all.every((o) => arPlace(o.text) >= 0)) all.sort((x, y) => arPlace(x.text) - arPlace(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return { id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options, correct: options.find((o) => o.text === correct)!.id, hints, explanation };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

/** A typed answer: rupees in rupees, a percentage or ratio as it is typed (2.5), a number as it is. */
const num = (n: number, conceptId: string, difficulty: Difficulty, unit: NumericUnit, prompt: string, answer: number, errors: [number, string][], working: string[], hints: string[]): NumericQuestion => {
  const scale = unit === 'number' ? 1 : 100;
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit, prompt, answer: Math.round(answer * scale),
    commonErrors: errors.map(([value, why]) => ({ value: Math.round(value * scale), why })), working, hints, explanation: working.join(' '),
  };
};

const AR = (assertion: string, reason: string): string => `Assertion (A): ${assertion} Reason (R): ${reason} Which is correct?`;
const BOTH_EXPLAINS = 'Both A and R are true and R is the correct explanation of A';
const BOTH_NOT = 'Both A and R are true but R is not the correct explanation of A';
const A_ONLY = 'A is true but R is false';
const R_ONLY = 'A is false but R is true';

const questions: Question[] = [
  // ---- Overview ----
  mcq(1, 'cas-overview', 'easy', 'In a computerised accounting system, which of these is done by the accountant and not by the system?',
    'Entering each transaction as a voucher',
    [
      ['Posting each transaction to the ledger accounts', 'Posting is processing: the system does it from the voucher.'],
      ['Balancing the ledger accounts', 'The system works out every balance itself.'],
      ['Drawing up the trial balance', 'The trial balance is a report the system produces from the ledgers.'],
    ],
    'The accountant enters the data once; posting, balancing and the reports are done by the system.',
    ['Which step needs a person to read a document?']),
  tf(2, 'cas-overview', 'easy', 'Keeping books on a computer changes the rules of double entry.', false,
    'The rules of debit and credit, the accounting principles and the formats of the final accounts are the same; only the recording and processing are done by the computer.',
    ['Does a sales voucher still debit one account and credit another?']),
  mcq(3, 'cas-overview', 'easy', 'Which of these is an advantage of a computerised accounting system?',
    'Reports are up to date the moment an entry is saved',
    [
      ['No training is needed by the staff', 'Training is a cost of the change: a limitation, not an advantage.'],
      ['Errors of principle can no longer happen', 'An entry to the wrong kind of account that balances is accepted: the system cannot catch it.'],
      ['Records cannot be lost', 'Data can be lost through system failure; back-ups are needed for that reason.'],
    ],
    'Since the system posts every entry at once, every balance and report includes it straight away.',
    ['Three of the options claim more than a computer can do.']),
  mcq(4, 'cas-overview', 'medium', AR('A computerised accounting system cannot catch every error.', 'It checks only what it has been told to check, so an entry that obeys every rule but is wrong in substance passes.'),
    BOTH_EXPLAINS,
    [
      [BOTH_NOT, 'Missed the link: the reason is exactly why such errors pass.'],
      [A_ONLY, 'Denied the reason, yet a voucher posting rent to Salaries A/c balances and is accepted.'],
      [R_ONLY, 'Thought the system catches every error; it catches only those its rules describe.'],
    ],
    'Inability to check unanticipated errors is a limitation: rent posted to salaries balances, names two real ledgers, and is saved.',
    ['Would the system refuse a balanced voucher that names the wrong expense account?']),
  tf(5, 'cas-overview', 'medium', 'Staff opposition is a limitation of a computerised accounting system: employees may resist the change for fear of losing their jobs.', true,
    'When books are first computerised, some staff may resist learning the system or fear it will replace them; this slows the change.',
    ['Is this about the machine or about people?']),
  mcq(6, 'cas-overview', 'medium', 'Which feature is shown when a business that grows from 2,000 to 15,000 vouchers a month keeps the same system, with one more operator?',
    'Scalability',
    [
      ['Speed', 'Speed is how quickly the work is done; the point here is coping with growth.'],
      ['Legibility', 'Legibility is about clean, readable records.'],
      ['Storage and retrieval', 'That is about keeping data and finding it again, not about coping with more transactions.'],
    ],
    'Scalability is the power of the system to handle far more transactions without a change in how the work is done.',
    ['What has changed: the number of transactions, or the time each takes?']),

  // ---- Structure and software ----
  mcq(7, 'cas-structure', 'easy', 'Which of these is NOT a component of a computerised accounting system?',
    'The auditor\'s report',
    [
      ['Procedure', 'Procedure, the rules and steps for using the system, is a component.'],
      ['People', 'People, who run and use the system, are a component.'],
      ['Data', 'Data, the facts entered and kept, is a component.'],
    ],
    'The components are hardware, software, people, procedure and data. An auditor\'s report is not part of the system.',
    ['Recall the components: hardware, software, people, procedure, data.']),
  mcq(8, 'cas-structure', 'easy', 'Printing the balance sheet from a computerised accounting system is which stage of its working?',
    'Output',
    [
      ['Input', 'Input is keying data in, such as a voucher.'],
      ['Processing', 'Processing is posting, totalling and balancing, which come before the report.'],
      ['Storage', 'Storage is keeping the data for later use.'],
    ],
    'Reports on the screen or on paper are the output of the system.',
    ['Is anything going into the system here?']),
  mcq(9, 'cas-structure', 'medium', 'A small stationery shop run by its owner wants the usual books at the lowest cost. Which kind of accounting software suits it?',
    'Generic (ready-made) software',
    [
      ['Tailored (tailor-made) software', 'Written for one large organisation: the costliest kind, far beyond what a small shop needs.'],
      ['Specific (customised) software', 'A package altered for special needs; the shop needs only the usual books.'],
      ['Software written by the owner from scratch', 'That would be tailor-made, with all its cost; a ready-made package already does what is needed.'],
    ],
    'Generic software is sold off the shelf for the usual accounting of small businesses, at the lowest cost.',
    ['Does the shop have any needs a standard package does not meet?']),
  tf(10, 'cas-structure', 'medium', 'Tailored accounting software gives more secrecy than generic software.', true,
    'No other business has the same tailor-made program, while anyone can buy the same generic package.',
    ['Who else can buy the same program?']),
  mcq(11, 'cas-structure', 'medium', 'A hotel uses a standard accounting package to which a room-billing module has been added for it. What kind of software is this?',
    'Specific (customised) software',
    [
      ['Generic (ready-made) software', 'A ready-made package is used as it comes; this one has been added to.'],
      ['Tailored (tailor-made) software', 'Tailored software is written from the start for one organisation; this is a standard package fitted to the hotel.'],
      ['Operating system software', 'An operating system runs the computer; it is not an accounting package.'],
    ],
    'A standard package altered or added to for the particular needs of its user is specific (customised) software.',
    ['Was the package written for the hotel, or fitted to it?']),
  mcq(12, 'cas-structure', 'medium', 'The two basic requirements on which every computerised accounting system rests are:',
    'An accounting framework and an operating procedure',
    [
      ['A printer and a password', 'These are a piece of hardware and a security feature, not the basis of the system.'],
      ['A spreadsheet and a database', 'These are kinds of software; the system rests on the rules of accounting and the way it is run.'],
      ['A balance sheet and a profit and loss account', 'These are its outputs, not its basis.'],
    ],
    'The accounting framework (principles, codes and groups of accounts) and a well-defined operating procedure are what every such system needs.',
    ['Think of the rules it follows and the way it is used.']),

  // ---- The spreadsheet ----
  mcq(13, 'cas-spreadsheet', 'easy', 'How is the cell where column D meets row 7 of a spreadsheet named?',
    'D7',
    [
      ['7D', 'Wrote the row before the column; a cell is named column first.'],
      ['D:7', 'A colon joins the two ends of a range, not the column and row of one cell.'],
      ['$D$7 only', '$D$7 is an absolute reference to the same cell, used in formulas; the cell itself is D7.'],
    ],
    'A cell is named by its column letter followed by its row number: D7.',
    ['Column letter first, then the row number.']),
  num(14, 'cas-spreadsheet', 'easy', 'number', 'How many cells are there in the range C3:F8?', 24,
    [[15, 'Took the differences (F - C = 3, 8 - 3 = 5), leaving out the first column and the first row.'], [10, 'Added the columns and rows instead of multiplying.']],
    ['Columns C, D, E and F: 4.', 'Rows 3 to 8: 6.', 'Cells = 4 × 6 = 24.'],
    ['Count the columns and the rows, both ends included.']),
  tf(15, 'cas-spreadsheet', 'easy', 'Every formula in a spreadsheet begins with the sign "=".', true,
    'The "=" tells the spreadsheet that what follows is to be worked out, not shown as text.',
    ['What does the sheet need to know before it calculates?']),
  num(16, 'cas-spreadsheet', 'medium', 'rupees', 'B2 holds ₹30,000 and C2 holds ₹10,000. What does the formula =B2+C2/2 return?', 35000,
    [[20000, 'Added first and then halved; a spreadsheet divides before it adds unless brackets say otherwise.'], [40000, 'Ignored the division by 2.']],
    ['Division comes before addition: C2/2 = ₹5,000.', '₹30,000 + ₹5,000 = ₹35,000.'],
    ['Which is worked out first, the division or the addition?']),
  mcq(17, 'cas-spreadsheet', 'medium', 'Cell D2 holds =B2*$C$1. It is copied to D3, D4 and D5. What does D5 hold?',
    '=B5*$C$1',
    [
      ['=B2*$C$1', 'Thought a formula is copied exactly as typed; the relative reference B2 moves down.'],
      ['=B5*$C$4', 'Moved the absolute reference too; the $ signs keep C1 fixed.'],
      ['=B5*C4', 'Ignored the $ signs altogether.'],
    ],
    'Copied three rows down, B2 becomes B5; $C$1 is absolute and stays.',
    ['How many rows does the copy move?']),
  mcq(18, 'cas-spreadsheet', 'complex', 'In a table, B3 holds =$A3*B$2. When it is copied to E7, what formula does E7 hold?',
    '=$A7*E$2',
    [
      ['=$A3*B$2', 'Thought nothing moves; only the parts after a $ are fixed.'],
      ['=$D7*E$6', 'Ignored the $ signs and moved every part.'],
      ['=$A7*B$2', 'Moved the row of $A3 but not the column of B$2, which is free to move.'],
    ],
    'The copy moves 3 columns across and 4 rows down. $A3 keeps column A and its row becomes 7; B$2 keeps row 2 and its column becomes E.',
    ['A $ fixes only the part right after it.']),
  num(19, 'cas-spreadsheet', 'medium', 'rupees', 'B2 holds sales of ₹80,000. C2 holds =IF(B2>75000,B2*5/100,B2*2/100). What does C2 show?', 4000,
    [[1600, 'Took the condition as false; ₹80,000 is more than ₹75,000.'], [76000, 'Gave the sales less the commission.']],
    ['Is ₹80,000 > ₹75,000? Yes.', 'C2 = ₹80,000 × 5 ÷ 100 = ₹4,000.'],
    ['Decide first whether the condition is true.']),
  mcq(20, 'cas-spreadsheet', 'easy', 'Which function counts how many cells of a range hold numbers?',
    'COUNT',
    [
      ['SUM', 'SUM adds the numbers; it does not count the cells.'],
      ['AVERAGE', 'AVERAGE gives the mean of the numbers.'],
      ['MAX', 'MAX gives the largest number.'],
    ],
    'COUNT gives the number of cells in a range that hold numbers.',
    ['The answer is a number of cells, not an amount.']),
  tf(21, 'cas-spreadsheet', 'medium', 'When =B2*C1 is copied from D2 to D3, it becomes =B3*C2.', true,
    'Both references are relative, so both move one row down. If C1 held a rate for every row, it should have been written $C$1.',
    ['Is there any $ in the formula?']),

  // ---- Applications ----
  num(22, 'cas-sheet-apps', 'easy', 'rupees', 'A machine costs ₹2,50,000, has a salvage value of ₹10,000 and a life of 8 years. What does =SLN(250000,10000,8) return? (SLN gives (cost - salvage value) ÷ life.)', 30000,
    [[31250, 'Ignored the salvage value.'], [240000, 'Did not divide by the life.']],
    ['SLN = (₹2,50,000 - ₹10,000) ÷ 8 = ₹30,000.'],
    ['Take the salvage value off the cost first.']),
  num(23, 'cas-sheet-apps', 'medium', 'rupees', 'A van bought for ₹4,00,000 is depreciated at 25% a year on its written down value, worked out on a sheet. What is the depreciation of the third year?', 56250,
    [[100000, 'Charged 25% on the cost every year: that is a straight line charge.'], [75000, 'Gave the depreciation of the second year.'], [225000, 'Gave the book value at the start of the third year.']],
    ['Year 1: ₹4,00,000 × 25% = ₹1,00,000; book value ₹3,00,000.', 'Year 2: ₹3,00,000 × 25% = ₹75,000; book value ₹2,25,000.', 'Year 3: ₹2,25,000 × 25% = ₹56,250.'],
    ['Charge the rate on the book value at the start of each year.']),
  num(24, 'cas-sheet-apps', 'medium', 'rupees', 'A loan of ₹2,10,000 at 10% a year is repaid in 2 equal yearly instalments. What instalment does =PMT(10%,2,-210000) return? (PMT gives loan × r × (1 + r)^n ÷ ((1 + r)^n - 1).)', 121000,
    [[126000, 'Divided the loan equally and added a full year of interest on the whole loan.'], [105000, 'Divided the loan into two and left out the interest.']],
    ['(1 + r)^n = 1.1 × 1.1 = 1.21.', 'Instalment = 2,10,000 × 0.1 × 1.21 ÷ 0.21 = ₹1,21,000.', 'The loan is entered as -210000 because PMT gives money received and money paid opposite signs: with the loan coming in as a minus figure, the instalment paid out comes out positive.'],
    ['Work out (1 + r)^n first.']),
  num(25, 'cas-sheet-apps', 'medium', 'rupees', 'A loan of ₹2,10,000 at 10% a year is repaid in 2 yearly instalments of ₹1,21,000. What is the interest part of the second instalment, as =IPMT gives it?', 11000,
    [[21000, 'Charged interest on the whole loan again; after the first instalment only ₹1,10,000 is left.'], [110000, 'Gave the principal part of the second instalment.']],
    ['Year 1: interest ₹21,000; principal ₹1,00,000; balance ₹1,10,000.', 'Year 2: interest = ₹1,10,000 × 10% = ₹11,000.'],
    ['Interest is charged on the balance at the start of the year.']),
  mcq(26, 'cas-sheet-apps', 'medium', 'In a loan repayment schedule of equal instalments, what happens to the interest part and the principal part from one instalment to the next?',
    'The interest part falls and the principal part rises',
    [
      ['Both stay the same', 'Only the instalment is equal; its split changes as the balance falls.'],
      ['The interest part rises and the principal part falls', 'Interest is charged on a falling balance, so it falls.'],
      ['Both fall', 'They add up to the same instalment, so if one falls the other must rise.'],
    ],
    'Interest is charged on a balance that falls with every instalment; the rest of the equal instalment repays more of the loan each time.',
    ['What happens to the balance on which interest is charged?']),
  num(27, 'cas-sheet-apps', 'medium', 'rupees', 'On a sheet, B2 holds the balance as per cash book, ₹48,000 (debit); B3 cheques issued but not yet presented, ₹7,500; B4 cheques deposited but not yet credited, ₹12,000; B5 bank charges in the pass book only, ₹500. What is the balance as per pass book?', 43000,
    [[53000, 'Gave every item the opposite sign.'], [68000, 'Added every item.'], [43500, 'Left out the bank charges.']],
    [
      'Start from the cash book balance in B2, ₹48,000, and work towards the pass book balance.',
      'Cheques issued but not yet presented (B3) have left the cash book but not yet the bank\'s books: the pass book is higher, so add ₹7,500.',
      'Cheques deposited but not yet credited (B4) are in the cash book but not yet in the pass book: the pass book is lower, so deduct ₹12,000.',
      'Bank charges (B5) are in the pass book only: the pass book is lower, so deduct ₹500.',
      '=B2+B3-B4-B5: ₹48,000 + ₹7,500 - ₹12,000 - ₹500 = ₹43,000.',
    ],
    ['Ask whether each item makes the pass book balance higher or lower than the cash book.']),
  mcq(28, 'cas-sheet-apps', 'medium', 'On a sheet, B2 holds current assets, B3 inventories, B4 prepaid expenses and B5 current liabilities. Which formula gives the quick ratio (current assets less inventories and prepaid expenses, divided by current liabilities)?',
    '=(B2-B3-B4)/B5',
    [
      ['=B2-B3-B4/B5', 'Left out the brackets: only the prepaid expenses would be divided.'],
      ['=(B2-B3)/B5', 'Left the prepaid expenses in the quick assets.'],
      ['=B5/(B2-B3-B4)', 'Turned the ratio upside down.'],
    ],
    'Quick ratio = (current assets - inventories - prepaid expenses) ÷ current liabilities, with the quick assets in brackets so that they are worked out before the division.',
    ['What has to be worked out before the division?']),
  num(29, 'cas-sheet-apps', 'easy', 'times', 'B2 holds current assets of ₹3,60,000 and B3 current liabilities of ₹1,60,000. What does =B2/B3 return? (For 2.5 type 2.5.)', 2.25,
    [[0.44, 'Divided B3 by B2.'], [1.25, 'Deducted the current liabilities before dividing.']],
    [
      'The current ratio is current assets ÷ current liabilities: the rupees of current assets that stand behind each rupee of current liabilities.',
      '=B2/B3 divides the current assets in B2 by the current liabilities in B3: ₹3,60,000 ÷ ₹1,60,000 = 2.25.',
      'So the current ratio is 2.25 : 1.',
    ],
    ['B2 on top.']),
  tf(30, 'cas-sheet-apps', 'medium', 'The DB function charges the same amount of depreciation every year.', false,
    'DB charges the same rate on a falling book value, so the amount falls each year; SLN charges the same amount.',
    ['On what does DB charge its rate?']),

  // ---- Charts ----
  mcq(31, 'cas-charts', 'easy', 'Which chart best shows the share of each head of expense in one year\'s total expenses?',
    'Pie chart',
    [
      ['Line chart', 'A line chart shows change over time, not shares of one total.'],
      ['Scatter (XY) chart', 'A scatter chart shows whether two measures move together.'],
      ['Column chart over ten years', 'A column chart over years compares years; the question is about parts of one total.'],
    ],
    'A pie chart shows the parts of one whole as slices of a circle.',
    ['Parts of one whole.']),
  mcq(32, 'cas-charts', 'easy', 'Which chart best shows how the sales of a business moved over the last ten years?',
    'Line chart',
    [
      ['Pie chart', 'A pie shows the shares of one total; it cannot show a trend over years.'],
      ['Scatter (XY) chart', 'A scatter chart sets two measures against each other.'],
      ['A table of ledger balances', 'A table is not a chart, and it shows the trend less clearly.'],
    ],
    'A line chart joins the figure of each year, so the rise and fall over time is seen at a glance.',
    ['Change over time.']),
  num(33, 'cas-charts', 'medium', 'number', 'Total expenses of ₹4,80,000 include rent of ₹96,000. What angle, in degrees, does the slice for rent make in a pie chart of the expenses?', 72,
    [[20, 'Gave the share as a percentage, not in degrees.'], [36, 'Measured the share against half a circle.']],
    ['Rent ÷ total = 96,000 ÷ 4,80,000 = 0.2.', 'Angle = 0.2 × 360° = 72°.'],
    ['The whole circle, 360°, stands for the total.']),
  tf(34, 'cas-charts', 'easy', 'A column chart is suited to comparing the sales of four branches in the same year.', true,
    'Columns set separate items side by side, so they can be compared at once.',
    ['Are the items separate, or parts over time?']),

  // ---- Installation, codification, hierarchy ----
  mcq(35, 'cas-codification', 'easy', 'Which is the first step in setting up a computerised accounting system once the package is installed?',
    'Creating the company, with the date its financial year begins',
    [
      ['Creating the ledger accounts', 'A ledger belongs to a company, which must exist first.'],
      ['Entering the vouchers', 'Vouchers are posted to ledgers that must already exist.'],
      ['Printing the trial balance', 'The trial balance is a report of entries not yet made.'],
    ],
    'Install, create the company, create the groups and ledgers, then enter the vouchers.',
    ['What do all ledgers and vouchers belong to?']),
  mcq(36, 'cas-codification', 'medium', 'A firm codes accounts with a digit for the major head (1 Assets), a digit for the group (12 Current assets) and a two-digit serial in the order the ledgers were opened. Its current asset ledgers were opened as Cash, Bank, Stock, Debtors. What is the code of Stock?',
    '1203',
    [
      ['1202', 'Numbered the serials from 00 instead of 01.'],
      ['123', 'Wrote the serial as one digit.'],
      ['2103', 'Wrote the group digit before the head digit.'],
    ],
    'Head 1, group 2 (code 12), serial 03 for the third ledger opened: 1203.',
    ['Head, group, then a two-digit serial from 01.']),
  mcq(37, 'cas-codification', 'easy', 'Which method of coding uses letters that remind the user of the account?',
    'Mnemonic codes',
    [
      ['Sequential codes', 'Sequential codes are numbers given one after another.'],
      ['Block codes', 'Block codes keep a range of numbers for each class of accounts.'],
      ['Check codes', 'That is not a method of coding accounts.'],
    ],
    'A mnemonic code such as SD for Sundry Debtors helps the memory.',
    ['Mnemonic means "aiding memory".']),
  mcq(38, 'cas-codification', 'medium', 'Under which group is a ledger for wages paid to factory workers created?',
    'Direct Expenses',
    [
      ['Indirect Expenses', 'Took wages, a cost of making the goods, for an office expense.'],
      ['Current Liabilities', 'Wages paid are an expense; only wages still owed would be a liability.'],
      ['Purchase Accounts', 'Purchase accounts are for goods bought.'],
    ],
    'Wages of factory workers are a cost of making the goods: a direct expense, reported in the trading account.',
    ['Is the expense part of the cost of the goods?']),
  mcq(39, 'cas-codification', 'medium', 'Sundry Debtors is a sub-group of which primary group?',
    'Current Assets',
    [
      ['Current Liabilities', 'Debtors owe the business; that is an asset, not a liability.'],
      ['Fixed Assets', 'Debtors pay within the year; they are not held for long-term use.'],
      ['Sales Accounts', 'Sales accounts record the sale; the amount still due is an asset.'],
    ],
    'Sundry Debtors, like Bank Accounts and Cash-in-hand, stands under Current Assets.',
    ['Is the amount due to or from the business?']),
  tf(40, 'cas-codification', 'medium', 'A voucher can be posted directly to a group such as Current Assets without a ledger account.', false,
    'Vouchers are posted to ledger accounts; a group only collects the ledgers created under it.',
    ['What stands at the bottom of the hierarchy?']),
  mcq(41, 'cas-codification', 'complex', AR('Outstanding salaries are opened under Current Liabilities and not under Indirect Expenses.', 'The expense of salaries is already in Salaries A/c; the amount still owed for it is a liability payable within the year.'),
    BOTH_EXPLAINS,
    [
      [BOTH_NOT, 'Missed the link: the reason is exactly why the outstanding amount is a liability.'],
      [A_ONLY, 'Denied the reason, yet the expense has been charged and only the payment is still to come.'],
      [R_ONLY, 'Rejected the assertion; the outstanding amount is a current liability.'],
    ],
    'The adjusting entry debits Salaries A/c (the expense) and credits Outstanding Salaries, a current liability.',
    ['Which account holds the expense, and which the amount owed?']),

  // ---- Data entry, validation, verification ----
  mcq(42, 'cas-data-entry', 'easy', 'Cash of ₹20,000 is deposited into the bank. Which voucher type records it?',
    'Contra voucher',
    [
      ['Payment voucher', 'No money leaves the business; it moves from cash to bank.'],
      ['Receipt voucher', 'No money comes in from outside; it only moves from cash to bank.'],
      ['Journal voucher', 'A journal voucher is for entries with no cash or bank in them.'],
    ],
    'A movement between cash and bank is a contra entry.',
    ['Does any money enter or leave the business?']),
  mcq(43, 'cas-data-entry', 'easy', 'Depreciation of ₹15,000 is charged on machinery. Which voucher type records it?',
    'Journal voucher',
    [
      ['Payment voucher', 'Depreciation is not paid to anyone.'],
      ['Contra voucher', 'No cash or bank is involved.'],
      ['Purchase voucher', 'Nothing is bought.'],
    ],
    'An entry with no cash or bank in it is made through a journal voucher.',
    ['Is cash or bank touched?']),
  mcq(44, 'cas-data-entry', 'medium', 'A voucher is about to be saved without the name of the ledger to be credited. Which validation check stops it?',
    'Presence (completeness) check',
    [
      ['Range check', 'A range check tests whether a value lies within limits; here nothing has been entered.'],
      ['Data type check', 'A type check tests the kind of data in a field; the field is empty.'],
      ['Duplicate check', 'A duplicate check stops the same document being entered twice.'],
    ],
    'A presence check makes sure a field that must be filled is not left blank.',
    ['What is wrong: the value, its kind, or its absence?']),
  tf(45, 'cas-data-entry', 'medium', 'Validation rules will catch a payment of ₹5,400 that has been keyed in as ₹4,500.', false,
    '₹4,500 is an amount of the right type within any sensible range, so every rule passes it; only verification against the voucher finds it.',
    ['Is ₹4,500 an impossible amount?']),
  mcq(46, 'cas-data-entry', 'medium', 'Goods sold on credit to Lakshmi Stores are returned by it. Which voucher records the return?',
    'Credit note',
    [
      ['Debit note', 'A debit note records goods returned to a supplier.'],
      ['Sales voucher', 'The sale has already been recorded; this is its return.'],
      ['Receipt voucher', 'No money is received.'],
    ],
    'Goods returned by a customer are recorded through a credit note: the customer\'s account is credited.',
    ['Who is returning the goods, a customer or a supplier?']),

  // ---- Adjusting, closing and opening entries ----
  mcq(47, 'cas-final-accounts', 'easy', 'Through which kind of voucher are adjusting and closing entries made in a computerised accounting system?',
    'Journal voucher',
    [
      ['Payment voucher', 'Adjusting and closing entries involve no payment.'],
      ['Contra voucher', 'A contra voucher moves money between cash and bank.'],
      ['Sales voucher', 'A sales voucher records goods sold.'],
    ],
    'Entries with no cash or bank in them, such as adjustments and closing entries, are made through a journal voucher.',
    ['Is any cash or bank involved?']),
  mcq(48, 'cas-final-accounts', 'medium', 'Which of these accounts is NOT closed by the closing entries at the year end?',
    'Machinery A/c',
    [
      ['Salaries A/c', 'An expense: it is closed to the profit and loss account.'],
      ['Commission Received A/c', 'An income: it is closed to the profit and loss account.'],
      ['Drawings A/c', 'It is closed by transfer to the capital account.'],
    ],
    'Assets and liabilities are carried forward to the next year; only nominal accounts and drawings are closed.',
    ['Which account has a balance that goes into the balance sheet?']),
  num(49, 'cas-final-accounts', 'medium', 'rupees', 'The capital of a trader at the start of the year is ₹5,00,000. The profit and loss account drawn up by the system shows a net profit of ₹1,20,000, and drawings were ₹40,000. What capital does the balance sheet show after the closing entries?', 580000,
    [[660000, 'Added the drawings instead of deducting them.'], [620000, 'Did not transfer the drawings.']],
    ['₹5,00,000 + ₹1,20,000 - ₹40,000 = ₹5,80,000.'],
    ['Closing capital = opening capital + net profit - drawings.']),
  tf(50, 'cas-final-accounts', 'easy', 'The opening entry of a new year debits the assets and credits the liabilities and the capital with their balances on the last balance sheet.', true,
    'It brings the real and personal balances into the books of the new year.',
    ['Which balances are carried forward?']),
  mcq(51, 'cas-final-accounts', 'medium', 'Insurance of ₹6,000 paid during the year belongs to the next year. What entry does the journal voucher record?',
    'Prepaid Expenses A/c Dr ₹6,000; To Insurance A/c ₹6,000',
    [
      ['Insurance A/c Dr ₹6,000; To Prepaid Expenses A/c ₹6,000', 'Reversed the entry: the part paid in advance is an asset, debited.'],
      ['Insurance A/c Dr ₹6,000; To Outstanding Expenses A/c ₹6,000', 'Treated a prepaid amount as an outstanding one.'],
      ['Prepaid Expenses A/c Dr ₹6,000; To Cash A/c ₹6,000', 'The insurance was paid already; the adjustment takes it out of this year\'s expense, not out of cash.'],
    ],
    'The prepaid part is an asset (debit) and reduces this year\'s expense (credit Insurance A/c).',
    ['Is the prepaid amount an asset or a liability?']),

  // ---- Security ----
  mcq(52, 'cas-security', 'easy', 'Which security feature records who entered, altered or deleted each voucher, and when?',
    'Audit trail',
    [
      ['Password', 'A password keeps out those who do not know it; it records nothing.'],
      ['Back-up', 'A back-up is a copy for putting data back after a loss.'],
      ['Data vault (encryption)', 'Encryption keeps data unreadable without the key.'],
    ],
    'An audit trail keeps a record of every change made to the data, by whom and when.',
    ['Which feature leaves a record behind?']),
  tf(53, 'cas-security', 'medium', 'User access rights allow a data-entry clerk to be stopped from seeing the profit and loss account.', true,
    'Access rights decide what each user can see and do, according to the role.',
    ['Can different users be given different powers?']),
  mcq(54, 'cas-security', 'medium', 'Why does a computerised accounting system need special security measures?',
    'Its data can be read, altered or lost without leaving any visible mark',
    [
      ['Its trial balance does not agree without them', 'The trial balance agrees because every voucher balances.'],
      ['It cannot add up without a password', 'Security has nothing to do with the arithmetic.'],
      ['Manual books need no security at all', 'Manual books need care too; the risks are greater and quieter with data on a computer.'],
    ],
    'Unlike a written ledger, a change to stored data leaves no trace unless the system keeps one, so access, changes and copies have to be controlled.',
    ['What can happen to data that cannot happen as easily to a written book?']),
  mcq(55, 'cas-security', 'medium', 'After the hard disk of the accounts computer fails, the books are put back from yesterday\'s copy. Which feature made this possible?',
    'Back-up and restore',
    [
      ['Audit trail', 'An audit trail records changes; it does not keep a copy of the books.'],
      ['User access rights', 'Access rights control what users may do; they do not save a copy.'],
      ['Password', 'A password guards entry; it does not protect against a failed disk.'],
    ],
    'A back-up is a copy of the data, from which it is restored after a loss.',
    ['What was needed: a record, a lock or a copy?']),
];

// ---------------------------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Books Kept by a Computer',
    description: 'What a computerised accounting system is, what a spreadsheet adds, and how books are kept on a package.',
    lesson: [
      {
        type: 'text',
        heading: 'The same accounting, done by a machine',
        body: 'A computerised accounting system keeps the books on a computer. The accountant enters each transaction once, as a voucher; the package posts it to the ledger accounts, works out the balances and draws up the trial balance, the profit and loss account and the balance sheet. The rules of double entry do not change at all: a sales voucher still debits the customer and credits sales. What changes is who does the posting, adding and balancing, and how quickly.',
      },
      {
        type: 'text',
        heading: 'What it does well, and where it can fail',
        body: 'The machine is fast, accurate and tireless; every balance is up to date the moment an entry is saved; it copes with many more transactions without a change of procedure; its records are clean and easy to read, and years of them fit on one disk. But it costs money to buy and to train people for, staff may resist it, a failure can stop the work, and it accepts any entry that obeys its rules, even rent posted to salaries. It is made of hardware, software, people, procedure and data, and works by input, processing, storage and output.',
      },
      {
        type: 'text',
        heading: 'Three kinds of software',
        body: 'A small business buys generic (ready-made) software off the shelf: cheapest, quickest to learn, least secret. A business with some special needs has a standard package altered for it: specific (customised) software. A large organisation with many users in many places has its own program written: tailored (tailor-made) software, the costliest and most secret.',
      },
      {
        type: 'text',
        heading: 'The spreadsheet as a working tool',
        body: 'A spreadsheet is a grid of cells named by column and row (B2). A formula starts with "=" and works on the cells it names, again whenever they change. A relative reference (B2) moves when the formula is copied; an absolute one ($C$1) stays. Functions do the standard work: SUM, AVERAGE, IF, ROUND, and for accounting SLN and DB for depreciation and PMT, IPMT and PPMT for a loan. So depreciation schedules, loan schedules, bank reconciliation statements and ratios are each a few formulas copied down a column.',
      },
      {
        type: 'table',
        title: 'Worked example 1: a commission formula copied down a column (C1 holds the rate, 5%)',
        rows: [
          { label: 'D2: =B2*$C$1, on sales of ₹48,000 in B2', amount: '₹2,400' },
          { label: 'D3: =B3*$C$1, on sales of ₹72,000 in B3', amount: '₹3,600' },
          { label: 'D4: =B4*$C$1, on sales of ₹56,000 in B4', amount: '₹2,800' },
          { label: 'D5: =B5*$C$1, on sales of ₹90,000 in B5', amount: '₹4,500' },
          { label: 'Total commission, =SUM(D2:D5)', amount: '₹13,300', total: true },
        ],
        note: 'Copied down one row at a time, B2 becomes B3, B4, B5, but $C$1 stays: every row reads the one rate. Watch out: written as =B2*C1 and copied, D3 would hold =B3*C2, an empty cell, and show nil.',
      },
      { type: 'check', questionId: qid(17) },
      {
        type: 'working',
        title: 'Worked example 2: the rate DB charges, and two years of depreciation',
        lines: [
          'A machine costs ₹1,00,000, its salvage value is ₹10,000 and its life 5 years: =DB(100000,10000,5,1) and =DB(100000,10000,5,2).',
          'Rate = 1 - (salvage value ÷ cost)^(1 ÷ life) = 1 - (10,000 ÷ 1,00,000)^(1 ÷ 5) = 1 - 0.630957 = 0.369043.',
          'DB rounds the rate to three decimal places: 0.369, that is 36.9%.',
          'Year 1: ₹1,00,000 × 0.369 = ₹36,900; book value ₹1,00,000 - ₹36,900 = ₹63,100.',
          'Year 2: ₹63,100 × 0.369 = ₹23,283.90; book value ₹63,100 - ₹23,283.90 = ₹39,816.10.',
        ],
        note: 'Watch out: the rate is charged on the book value at the start of each year, not on the cost, and only after it has been rounded to three decimal places; charging 36.9% of the cost every year would be a straight line charge.',
      },
      {
        type: 'working',
        title: 'Worked example 3: a bank reconciliation statement from the cells',
        lines: [
          'B2: balance as per cash book, ₹48,000 (debit). B3: cheques issued but not yet presented, ₹7,500. B4: cheques deposited but not yet credited, ₹12,000. B5: bank charges in the pass book only, ₹500. B6: interest credited in the pass book only, ₹1,200.',
          'Cheques issued but not presented have left the cash book but not the bank: the pass book is higher, so B3 is added.',
          'Cheques deposited but not credited are in the cash book only: the pass book is lower, so B4 is deducted.',
          'Bank charges lower the pass book balance (B5 deducted); interest credited raises it (B6 added).',
          '=B2+B3-B4-B5+B6 = ₹48,000 + ₹7,500 - ₹12,000 - ₹500 + ₹1,200 = ₹44,200, the balance as per pass book.',
        ],
        note: 'Watch out: =SUM(B2:B6) adds every item and gives ₹69,200. Each item needs the sign that its effect on the pass book balance calls for.',
      },
      {
        type: 'working',
        title: 'Worked example 4: a loan schedule on a sheet',
        lines: [
          'Loan ₹2,10,000 at 10% a year, repaid in 2 equal yearly instalments.',
          '=PMT(10%,2,-210000) = 2,10,000 × 0.1 × 1.21 ÷ 0.21 = ₹1,21,000. The loan is entered with a minus sign because PMT shows money received and money paid with opposite signs: the loan comes in, so the instalment paid out comes out positive.',
          'Year 1: interest ₹2,10,000 × 10% = ₹21,000; principal ₹1,21,000 - ₹21,000 = ₹1,00,000; balance ₹1,10,000.',
          'Year 2: interest ₹1,10,000 × 10% = ₹11,000; principal ₹1,10,000; balance nil.',
        ],
        note: 'The interest falls and the principal repaid rises, because interest is charged on a falling balance.',
      },
      {
        type: 'working',
        title: 'Worked example 5: a round loan, as the board sets it',
        lines: [
          'A loan of ₹5,00,000 at 10% a year is repaid in 5 equal yearly instalments; every figure of the schedule is to be in whole rupees.',
          'Instalment = =ROUND(PMT(10%,5,-500000),0). (1.1)^5 = 1.61051, so PMT = 5,00,000 × 0.1 × 1.61051 ÷ 0.61051 = ₹1,31,898.74, which is ₹1,31,899 to the nearest rupee.',
          'Year 1: interest ₹5,00,000 × 10% = ₹50,000; principal ₹1,31,899 - ₹50,000 = ₹81,899; balance ₹4,18,101.',
          'Year 2: interest ₹4,18,101 × 10% = ₹41,810.10, or ₹41,810; principal ₹90,089; balance ₹3,28,012.',
          'Year 3: interest ₹32,801.20, or ₹32,801; principal ₹99,098; balance ₹2,28,914. Year 4: interest ₹22,891.40, or ₹22,891; principal ₹1,09,008; balance ₹1,19,906.',
          'Year 5, the last: interest ₹11,990.60, or ₹11,991. The principal repaid must be the whole balance left, ₹1,19,906, so the last instalment is ₹1,19,906 + ₹11,991 = ₹1,31,897.',
        ],
        note: 'Watch out: paying the equal ₹1,31,899 in the last year too would repay ₹2 more than is owed. Rounding leaves a small difference, and the last instalment takes it up.',
      },
      {
        type: 'table',
        title: 'The same schedule laid out: instalment = interest + principal repaid, balance at the end of the year',
        rows: [
          { label: 'Year 1: ₹1,31,899 = ₹50,000 + ₹81,899', amount: '₹4,18,101' },
          { label: 'Year 2: ₹1,31,899 = ₹41,810 + ₹90,089', amount: '₹3,28,012' },
          { label: 'Year 3: ₹1,31,899 = ₹32,801 + ₹99,098', amount: '₹2,28,914' },
          { label: 'Year 4: ₹1,31,899 = ₹22,891 + ₹1,09,008', amount: '₹1,19,906' },
          { label: 'Year 5: ₹1,31,897 = ₹11,991 + ₹1,19,906', amount: 'Nil' },
          { label: 'Total: instalments ₹6,59,493 = interest ₹1,59,493 + principal ₹5,00,000', amount: '₹6,59,493', total: true },
        ],
        note: 'Check every schedule two ways: the principal repaid adds up to the loan, and the balance after the last instalment is nil.',
      },
      {
        type: 'text',
        heading: 'Keeping books on a package',
        body: 'Install the package; create the company with the start of its financial year; create the groups and ledgers, each ledger under its group (wages under Direct Expenses, a supplier under Sundry Creditors), often with a code such as 1203 for head, group and serial; then enter vouchers of the right type: receipt, payment, contra, journal, sales, purchase, credit and debit notes. Validation rules refuse impossible entries as they are typed; verification against the vouchers catches the possible but wrong ones. At the year end, adjusting, closing and opening entries are made through journal vouchers, and passwords, access rights, an audit trail and back-ups keep the data safe.',
      },
      { type: 'check', questionId: qid(1) },
    ],
  },
  cards: {
    title: 'Computerised Accounting Rules',
    description: 'Recall the features, the kinds of software, the spreadsheet rules and functions, codes, groups, vouchers, validation, entries and security.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'The System and Its Parts',
      description: 'What a computerised system does, its features and limits, its components, and the three kinds of software.',
      questionIds: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(qid),
    },
    {
      title: 'The Spreadsheet at Work',
      description: 'Cells, ranges and formulas, references that move or stay, and the functions for depreciation, loans and charts.',
      questionIds: [13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34].map(qid),
      type: 'method_recognition',
    },
    {
      title: 'Using a Computerised System',
      description: 'Setting it up, codes and groups, vouchers and validation, the year-end entries and security.',
      questionIds: [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map(qid),
    },
  ],
  practice: [
    {
      title: 'What a Computerised System Is',
      description: 'The features of the system, and its components and stages.',
      templateIds: ['cas-feature', 'cas-structure'],
      count: 8,
    },
    {
      title: 'Limits of the System and Kinds of Software',
      description: 'The limitations of a computerised system, and which kind of software fits a business.',
      templateIds: ['cas-limitation', 'cas-package'],
      count: 6,
    },
    {
      title: 'Cells, Formulas and Functions',
      description: 'Count the cells of a range, work out what a formula returns, and pick the function for a job.',
      templateIds: ['cas-range-cells', 'cas-formula-result', 'cas-function-choice'],
      count: 8,
    },
    {
      title: 'Codes, Groups and Setting Up',
      description: 'The steps of setting up a package, methods of coding, and the group each ledger is created under.',
      templateIds: ['cas-install', 'cas-code-type', 'cas-ledger-group'],
      count: 8,
    },
    {
      title: 'Vouchers, Charts and Security',
      description: 'The voucher for a transaction, the chart for a purpose, and the security feature at work.',
      templateIds: ['cas-voucher', 'cas-chart', 'cas-security', 'cas-reports'],
      count: 8,
    },
    {
      title: 'Copying Formulas (Guided)',
      description: 'What a copied formula becomes, and what an IF formula gives.',
      templateIds: ['cas-copy-formula', 'cas-if-formula'],
      count: 6,
      guided: true,
    },
    {
      title: 'Depreciation on a Sheet',
      description: 'SLN, a straight line schedule and a written down value schedule.',
      templateIds: ['cas-sln', 'cas-sln-schedule', 'cas-wdv-schedule'],
      count: 8,
    },
    {
      title: 'Loans on a Sheet',
      description: 'The equal instalment PMT gives, and the interest and principal parts of an instalment.',
      templateIds: ['cas-pmt', 'cas-loan-split'],
      count: 6,
    },
    {
      title: 'Bank Reconciliation, Ratios and Charts on a Sheet',
      description: 'The pass book balance from the cells, the formula that gives it, ratios from cells, and a slice of a pie chart.',
      templateIds: ['cas-brs-sheet', 'cas-brs-formula', 'cas-ratio-cells', 'cas-ratio-formula', 'cas-pie-angle'],
      count: 8,
    },
    {
      title: 'Ledger Codes and the Hierarchy',
      description: 'The code of a ledger, the ledger a code names, and where each group and sub-group stands.',
      templateIds: ['cas-ledger-code', 'cas-code-ledger', 'cas-hierarchy'],
      count: 8,
    },
    {
      title: 'Validation and the Year-End Entries',
      description: 'Which check refuses an entry, the adjusting and closing entries, and the capital after them.',
      templateIds: ['cas-validation', 'cas-adjusting', 'cas-adjusting-worked', 'cas-closing', 'cas-closing-capital'],
      count: 8,
    },
    {
      title: 'Harder Sheet Work',
      description: 'Mixed references, the rate DB charges and its depreciation for a given year, the balance of a loan after some instalments, and the opening entry.',
      templateIds: ['cas-mixed-reference', 'cas-mixed-value', 'cas-db-rate', 'cas-db', 'cas-loan-balance', 'cas-opening'],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Computerised Accounting Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Computerised Accounting', description: 'The hardest questions of the topic, against the clock.', count: 8, timerSecondsPerQuestion: 150 },
  formats: [
    {
      title: 'Prepare a Schedule on a Sheet',
      description: 'A straight line and a written down value depreciation schedule, and a loan repayment schedule, row by row as a sheet sets them out.',
      templateIds: ['cas-fmt-sln-schedule', 'cas-fmt-wdv-schedule', 'cas-fmt-loan-schedule'],
      count: 3,
    },
    // Added later: a level of its own (`<topicId>-formats-2`), so no level before it moves.
    {
      title: 'The Loan Repayment Schedule, as the Board Sets It',
      description: 'A round loan over four or five years: find the instalment with PMT and round it to the nearest rupee, round each year\'s interest, and adjust the last instalment so that the loan is repaid exactly.',
      templateIds: ['cas-fmt-loan-schedule-board', 'cas-fmt-loan-schedule'],
      count: 2,
    },
  ],
});

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'pmt-and-payroll',
        type: 'medium_practice',
        title: 'Writing PMT, and a Payroll Sheet',
        description: 'Write the PMT formula for yearly, monthly and rounded instalments, and work a payroll sheet whose HRA is chosen by IF, with the rates fixed by $.',
        generate: { templateIds: ['cas-pmt-formula', 'cas-payroll-if', 'cas-payroll-formula'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['cas-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
