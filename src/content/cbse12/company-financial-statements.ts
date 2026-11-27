import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

// Financial Statements of a Company (Class 12, Part B). Everything follows Schedule III to the Companies Act, 2013,
// Division I, as amended with effect from 1 April 2021. The NCERT textbook still prints the form as it stood before
// that amendment, so the amended place of an item is the right answer and its older place is never offered as a
// wrong one (see the note at the head of the generator file).

const T = 'company-financial-statements';

const concepts: Concept[] = [
  { id: 'fs-meaning', topicId: T, title: 'Financial statements: meaning, nature, uses and limitations' },
  { id: 'fs-bs-form', topicId: T, title: 'The Schedule III balance sheet: its form and major heads' },
  { id: 'fs-bs-equity-liabilities', topicId: T, title: 'Equity and liabilities: sub-heads and what goes under each' },
  { id: 'fs-bs-assets', topicId: T, title: 'Assets: sub-heads and what goes under each' },
  { id: 'fs-current-non-current', topicId: T, title: 'Current and non-current: twelve months and the operating cycle' },
  { id: 'fs-spl-lines', topicId: T, title: 'Statement of Profit and Loss: its lines and what goes under each' },
  { id: 'fs-spl-amounts', topicId: T, title: 'Statement of Profit and Loss: working out a line' },
  { id: 'fs-notes-contingent', topicId: T, title: 'Notes to accounts, contingent liabilities and commitments' },
  { id: 'fs-formats', topicId: T, title: 'Preparing the balance sheet, the Statement of Profit and Loss and a note to accounts' },
];

// ---------------------------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------------------------

let cardNo = 0;
const card = (conceptId: string, kind: Card['kind'], prompt: string, answer: string, explanation: string, example: string, commonMistake: string): Card => ({
  id: `fs-card-${++cardNo}`,
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
  card('fs-meaning', 'rule', 'What are the financial statements of a company?',
    'The balance sheet, the Statement of Profit and Loss, the cash flow statement and the notes to accounts, prepared at the end of the accounting period in the form of Schedule III to the Companies Act, 2013.',
    'The balance sheet shows the financial position on a date; the Statement of Profit and Loss shows the performance for the period; the notes give the details and the accounting policies. They are the report of the directors to the shareholders, who own the company but do not run it.',
    'Balance Sheet "as at 31 March 2026"; Statement of Profit and Loss "for the year ended 31 March 2026".',
    "Counting the directors' report or the auditor's report as financial statements. They go out with the statements but are not part of them."),
  card('fs-meaning', 'rule', 'What is the nature of financial statements?',
    'They are a blend of recorded facts, accounting conventions and postulates, and personal judgements.',
    'Recorded facts are figures taken from the books, such as the cost of a machine. Conventions and postulates are the agreed rules, such as prudence and going concern. Personal judgements are the estimates and choices of the accountant, such as the life of an asset or the provision for doubtful debts.',
    'A machine stands at cost ₹10,00,000 (recorded fact), is assumed to be used for years (going concern) and is depreciated over an estimated life of 8 years (judgement).',
    'Saying the statements are exact and free of opinion. Depreciation, provisions and the valuation of inventory all rest on judgement.'),
  card('fs-meaning', 'rule', 'What are financial statements used for, and by whom?',
    'Shareholders judge the stewardship of the directors; lenders and suppliers judge whether credit is safe; prospective investors judge earning capacity; the government assesses tax and frames policy; employees judge demands for pay and bonus; the management plans and controls.',
    'The objectives follow from these uses: to give true and fair information about the resources and obligations of the business, its earning capacity and its financial position.',
    'A bank reads the balance sheet before giving a term loan: the use is "a basis for granting credit".',
    'Thinking the statements are prepared only for the tax department. Their first readers are the shareholders.'),
  card('fs-meaning', 'rule', 'What are the limitations of financial statements?',
    'Historical cost (price changes are ignored); window dressing (figures can be arranged to look better); qualitative factors are ignored (only what is measured in money is shown); personal judgement and bias; aggregate figures hide detail; they are interim reports.',
    'Each limitation comes from a rule of accounting: assets are recorded at cost, only money facts are recorded, and many figures are estimates. So the statements must be read with care.',
    'Land bought in 1998 for ₹5,00,000 still stands at ₹5,00,000 though it is now worth many times more: historical cost.',
    'Mixing window dressing with personal judgement. Window dressing is done on purpose to mislead; judgement is an honest estimate that could differ.'),
  card('fs-bs-form', 'format', 'What are the major heads of a company balance sheet as per Schedule III, in order?',
    "I. Equity and Liabilities: (1) Shareholders' Funds, (2) Share application money pending allotment, (3) Non-Current Liabilities, (4) Current Liabilities. II. Assets: (1) Non-Current Assets, (2) Current Assets.",
    'The form is vertical, with a "Note No." column and figures for the current and the previous year. The total of Equity and Liabilities equals the total of Assets.',
    "A company with only share capital of ₹10,00,000 kept in the bank: Shareholders' Funds ₹10,00,000 = Current Assets ₹10,00,000.",
    "Putting share application money pending allotment inside Shareholders' Funds. It is a major head of its own."),
  card('fs-bs-equity-liabilities', 'format', "What goes under Shareholders' Funds?",
    '(a) Share Capital, (b) Reserves and Surplus, (c) Money received against share warrants.',
    'In the note on Share Capital, calls in arrears are deducted from the subscribed capital and the balance of Forfeited Shares Account is added. Reserves and Surplus holds Securities Premium, Capital Reserve, Capital Redemption Reserve, General Reserve and the balance of the Statement of Profit and Loss; a debit balance is shown as a negative figure.',
    'Securities Premium ₹4,00,000, General Reserve ₹2,50,000 and a debit balance of the Statement of Profit and Loss of ₹1,80,000: Reserves and Surplus = 4,00,000 + 2,50,000 - 1,80,000 = ₹4,70,000.',
    'Showing a debit balance of the Statement of Profit and Loss on the assets side, or showing calls in arrears as an asset.'),
  card('fs-bs-equity-liabilities', 'format', 'What are the sub-heads of Non-Current Liabilities, with an example of each?',
    '(a) Long-term borrowings: debentures, term loans, public deposits. (b) Deferred tax liabilities (net). (c) Other long-term liabilities: premium payable on redemption of debentures. (d) Long-term provisions: provision for gratuity payable on retirement.',
    'A liability is non-current when it is not due to be settled within twelve months of the balance sheet date or within the operating cycle.',
    '9% Debentures redeemable after five years: Non-Current Liabilities, Long-term Borrowings.',
    'Showing public deposits or a mortgage loan under "other" long-term liabilities. Money borrowed is always a borrowing.'),
  card('fs-bs-equity-liabilities', 'format', 'What are the sub-heads of Current Liabilities, with examples?',
    '(a) Short-term borrowings: bank overdraft, cash credit, loans repayable on demand, current maturities of long-term borrowings. (b) Trade payables: creditors, bills payable. (c) Other current liabilities: unpaid dividend, calls in advance, outstanding expenses, interest accrued on borrowings, income received in advance. (d) Short-term provisions: provision for tax, provision for employee benefits.',
    'Schedule III as amended in 2021 shows current maturities of long-term borrowings under short-term borrowings, and the sample papers of the board follow it. Books printed from the older form show them under other current liabilities; either way they are a current liability.',
    'A term loan of ₹10,00,000 of which ₹2,00,000 is repayable within twelve months: ₹8,00,000 under long-term borrowings and ₹2,00,000 under short-term borrowings.',
    'Leaving the instalment due within twelve months under long-term borrowings, or setting the bank overdraft off against the bank balance.'),
  card('fs-bs-equity-liabilities', 'rule', 'How do you tell a provision, an outstanding amount and a reserve apart?',
    'A provision is an estimated amount set aside for a liability (provision for tax): Provisions. An outstanding amount is a known amount owed (outstanding salaries, unpaid dividend): Other Current Liabilities. A reserve is profit kept back (General Reserve): Reserves and Surplus.',
    'Ask two questions. Is anything owed to an outsider? If not, it is a reserve. Is the amount an estimate? If so, it is a provision; if it is known, it is another current liability.',
    'Provision for tax ₹3,00,000: Short-term Provisions. Unpaid dividend ₹40,000: Other Current Liabilities. General Reserve ₹5,00,000: Reserves and Surplus.',
    'Placing provision for tax under Reserves and Surplus, or unpaid dividend under Short-term Provisions.'),
  card('fs-bs-assets', 'format', 'What are the sub-heads of Non-Current Assets?',
    '(a) Property, Plant and Equipment and Intangible Assets: (i) Property, Plant and Equipment, (ii) Intangible assets, (iii) Capital work-in-progress, (iv) Intangible assets under development. (b) Non-current investments. (c) Deferred tax assets (net). (d) Long-term loans and advances. (e) Other non-current assets.',
    'Property, Plant and Equipment: land, building, machinery, furniture, vehicles, computers, livestock. Intangible assets: goodwill, patents, trademarks, software, mining rights. Long-term loans and advances include capital advances. Other non-current assets include long-term trade receivables and, since 2021, security deposits. Books printed from the older form call the first sub-head "Fixed Assets" and its first part "Tangible Assets".',
    'A factory building under construction: Capital work-in-progress. Software being developed for own use: Intangible assets under development.',
    'Showing an asset still under construction as Property, Plant and Equipment, or a capital advance as a fixed asset.'),
  card('fs-bs-assets', 'format', 'What are the sub-heads of Current Assets, with examples?',
    '(a) Current investments. (b) Inventories: raw materials, work-in-progress, finished goods, stock-in-trade, stores and spares, loose tools. (c) Trade receivables: debtors, bills receivable. (d) Cash and cash equivalents: cash on hand, balances with banks, cheques and drafts on hand. (e) Short-term loans and advances. (f) Other current assets: prepaid expenses, accrued incomes.',
    'An asset is current when it is realised, sold or used up within twelve months of the balance sheet date or within the operating cycle, or is cash.',
    'Loose tools ₹40,000 and stores and spares ₹60,000 are both shown under Inventories.',
    'Showing loose tools and stores and spares under Property, Plant and Equipment.'),
  card('fs-bs-assets', 'shortcut', 'Which names mislead when placing an item in the balance sheet?',
    'Capital work-in-progress is a fixed asset being built, not inventory. Capital advances are long-term advances, not fixed assets. Stock-in-trade is inventory, not an investment. Cash credit is a borrowing, not cash. Calls in advance are a liability, not an asset.',
    'Read what the item is, not the word that stands out. Ask: does the company own it or owe it, and when does it turn into cash or fall due?',
    '"Cash credit from bank ₹3,00,000" goes under Current Liabilities, Short-term Borrowings.',
    'Placing an item by one word of its name: "cash", "capital", "stock" or "advance".'),
  card('fs-current-non-current', 'rule', 'When is an asset or a liability current?',
    'When it is realised or settled within twelve months of the balance sheet date, or within the operating cycle of the company. Anything else is non-current.',
    'The operating cycle is the time between acquiring assets for processing and their realisation in cash. When it cannot be identified it is taken as twelve months. So the test is the longer of twelve months and the operating cycle.',
    'Operating cycle 15 months, trade receivables due in 14 months: current. Operating cycle 8 months, trade payables due in 10 months: current, because 10 months is within twelve months.',
    'Calling an item non-current as soon as it runs past twelve months, without looking at the operating cycle; or going by the original term of a loan and not the time left.'),
  card('fs-current-non-current', 'shortcut', 'How is a loan repayable in instalments shown in the balance sheet?',
    'The instalments falling due within twelve months of the balance sheet date are current maturities, shown under Short-term Borrowings. The rest of the balance is shown under Long-term Borrowings.',
    'First find the balance still owed: the loan less the instalments already paid. Then take out what falls due in the next twelve months.',
    'Loan ₹12,00,000 in 6 equal annual instalments, 2 paid: balance ₹8,00,000. Next instalment ₹2,00,000 is a short-term borrowing; ₹6,00,000 is a long-term borrowing.',
    'Leaving the whole balance under long-term borrowings, or deducting the next instalment from the original loan.'),
  card('fs-spl-lines', 'format', 'What are the lines of the Statement of Profit and Loss as per Schedule III?',
    'I. Revenue from Operations. II. Other Income. III. Total Income (I + II). IV. Expenses: Cost of materials consumed; Purchases of stock-in-trade; Changes in inventories of finished goods, work-in-progress and stock-in-trade; Employee benefits expense; Finance costs; Depreciation and amortisation expense; Other expenses; Total Expenses. V. Profit before Tax (III - IV). VI. Tax expense. VII. Profit for the period (V - VI).',
    'There is no Trading Account, no gross profit and no "To" and "By". Every expense is placed by its nature.',
    'Total income ₹20,50,000 and total expenses ₹16,50,000: profit before tax ₹4,00,000. Tax at 30% is ₹1,20,000, so the profit for the period is ₹2,80,000.',
    'Looking for a line called "wages" or "carriage". Wages are part of employee benefits expense, and carriage is one of the other expenses.'),
  card('fs-spl-lines', 'rule', 'What is revenue from operations, and what is other income?',
    'Revenue from operations is what the company earns from its main business: sale of products, sale of services and other operating revenues such as sale of scrap. Other income is everything else: interest, dividend, rent, profit on sale of a fixed asset.',
    'It depends on the business. For a finance company, interest on loans given and fees for financial services are revenue from operations. For any other company, interest and dividend are other income.',
    'Interest of ₹50,000 on a fixed deposit: other income for a trading company. Interest of ₹50,00,000 earned on loans given by a finance company: revenue from operations.',
    'Calling the sale of scrap by a manufacturer "other income", or the interest earned by a finance company "other income".'),
  card('fs-spl-lines', 'rule', 'Which expenses go under employee benefits expense, finance costs, depreciation and amortisation, and other expenses?',
    'Employee benefits expense: wages, salaries, bonus, contribution to provident fund, gratuity, staff welfare. Finance costs: interest on loans, debentures and overdraft, and discount or loss on issue of debentures written off. Depreciation and amortisation: depreciation of tangible assets and writing off of intangible ones. Other expenses: everything else, such as rent, audit fee, carriage, power, bad debts, and bank charges for services such as collecting cheques.',
    'Ask what the money was spent on: employees, borrowed money, the wearing out of an asset, or something else. Books differ on "bank charges": charges for a borrowing (a loan processing fee) are a finance cost, while charges for the services of the bank (collecting cheques, issuing drafts) are other expenses. A question names the service when it means other expenses.',
    'Wages ₹3,00,000, salaries ₹2,00,000, provident fund ₹30,000 and staff welfare ₹20,000: employee benefits expense ₹5,50,000.',
    'Treating a dividend as an expense, or interest on a loan as one of the other expenses. A dividend is a distribution of profit, and interest is a cost of borrowing.'),
  card('fs-spl-amounts', 'formula', 'How are "cost of materials consumed" and "changes in inventories" worked out?',
    'Cost of materials consumed = Opening inventory of materials + Purchases of materials - Closing inventory of materials. Changes in inventories = Opening inventory - Closing inventory of finished goods, work-in-progress and stock-in-trade.',
    'A fall in inventory (opening more than closing) is added to the expenses. A rise is shown as a negative figure, in brackets, and reduces the expenses. Raw materials never enter the changes in inventories.',
    'Finished goods: opening ₹2,00,000, closing ₹2,60,000. Change = 2,00,000 - 2,60,000 = (₹60,000), a negative figure among the expenses.',
    'Taking closing less opening, or including raw materials in the changes in inventories.'),
  card('fs-spl-amounts', 'formula', 'How much of a discount or loss on issue of debentures is a finance cost?',
    'Finance cost = Discount or loss on issue - the part written off against Securities Premium.',
    'The discount or loss is written off in the year the debentures are allotted, first against Securities Premium. Only what is left is charged to the Statement of Profit and Loss, as a finance cost.',
    'Discount on issue ₹50,000, Securities Premium ₹30,000: ₹30,000 is written off against Securities Premium and ₹20,000 is a finance cost.',
    'Charging the whole discount to the Statement of Profit and Loss when there is Securities Premium. (Some books show the charge under other expenses; the preferred place, as a cost of borrowing, is finance costs.)'),
  card('fs-notes-contingent', 'rule', 'What are notes to accounts?',
    'Numbered notes that give the details of each line of the balance sheet and of the Statement of Profit and Loss, with the accounting policies and other disclosures. They are a part of the financial statements.',
    'The face of each statement shows one figure for a sub-head and the number of its note. The note on Share Capital gives authorised, issued and subscribed capital; subscribed capital is split into fully paid and not fully paid, calls in arrears are deducted and forfeited shares are added.',
    'Balance sheet: "Reserves and Surplus, Note 2, ₹7,00,000". Note 2: Securities Premium ₹3,00,000; General Reserve ₹4,00,000.',
    'Writing the details on the face of the balance sheet, or treating the notes as optional.'),
  card('fs-notes-contingent', 'rule', 'What are contingent liabilities and commitments, and where are they shown?',
    'A contingent liability becomes payable only if an uncertain future event goes against the company: a claim not acknowledged as debt, a guarantee given, bills discounted and not yet matured. A commitment is a contract for future spending: contracts remaining to be executed on capital account, uncalled liability on partly paid shares held. Both are disclosed in the notes to accounts and are not shown in the balance sheet.',
    'They are left out of the totals because nothing is owed yet. An amount that is actually owed, or can be estimated as a present obligation, is a liability or a provision in the balance sheet.',
    'A customer sues for ₹5,00,000 and the company disputes it: a contingent liability in the notes. A machine ordered for ₹8,00,000 and not yet delivered: a commitment in the notes.',
    'Showing a contingent liability under current liabilities or provisions, or calling a contract for a machine a contingent liability.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const questions: Question[] = [];
let qNo = 0;
const nextId = () => `fs-q-${String(++qNo).padStart(3, '0')}`;
const rs = (n: number): number => n * 100;

/**
 * The hints of an authored question that brings none of its own, by its concept: a first nudge, then the step named.
 * They replace the one general pair every such question had (after the Class 12 audit).
 */
const CONCEPT_HINTS: Record<string, string[]> = {
  'fs-meaning': [
    'Recall what the statements are: a report on a past year, drawn from recorded facts, accounting conventions and personal judgements.',
    'Separate what they do (show the financial position and the profit, in the form the Companies Act lays down, for users inside and outside the company) from what they cannot (show qualitative facts, present values or the future).',
  ],
  'fs-bs-form': [
    'Picture a Schedule III balance sheet, read from the top: where the funds came from, then where they are used.',
    'Recall the major heads and the columns of each part as Schedule III, as amended in 2021, lays them down, and in what order they stand.',
  ],
  'fs-bs-equity-liabilities': [
    'Ask whether the item belongs to the shareholders or is owed to someone outside.',
    "Shareholders' Funds hold the capital and the reserves. What is owed is a borrowing, a trade payable, another liability or a provision, and goes to the non-current or the current part by the time left to settle it.",
  ],
  'fs-bs-assets': [
    'Ask what the asset is: something kept for use, an investment, goods, an amount due, or cash.',
    'Then ask how soon it turns into cash or is used up: within twelve months or the operating cycle makes it current; held for use or for longer makes it non-current.',
  ],
  'fs-current-non-current': [
    'Find the dividing line first: twelve months from the balance sheet date, or the operating cycle where that is longer.',
    'An item realised or settled within that period is current; measure the period from the balance sheet date.',
  ],
  'fs-spl-lines': [
    'Ask what the money was spent on, or where the income came from.',
    'Income of the main business is revenue from operations, and any other is other income. Pay to employees, the cost of borrowing and the wearing out of assets each have a line of their own; whatever else is spent goes to other expenses.',
  ],
  'fs-spl-amounts': [
    'Write the formula of the line before putting any figure into it.',
    'Cost of materials consumed = opening inventory + purchases - closing inventory. Changes in inventories = opening - closing of finished goods, work-in-progress and stock-in-trade.',
  ],
  'fs-notes-contingent': [
    'Ask whether anything is owed now, or will be owed only if an uncertain event happens, or only under a contract to spend later.',
    'What is owed now stands in the balance sheet. A contingent liability and a commitment are disclosed in the notes, outside the totals; a note also gives the break-up of a figure on the face of a statement.',
  ],
};

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
    hints: hints.length ? hints : CONCEPT_HINTS[conceptId],
  };
  questions.push(q);
  return id;
}

/** True or false. The explanation says which part is wrong when the statement is false. */
function tf(conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string): string {
  const id = nextId();
  const q: TrueFalseQuestion = {
    id,
    topicId: T,
    conceptId,
    difficulty,
    type: 'true_false',
    prompt,
    correct,
    explanation,
    hints: CONCEPT_HINTS[conceptId],
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

/** A typed amount, in whole rupees: the answer, the wrong answers with the mistake behind each, and the working. */
function num(conceptId: string, difficulty: Difficulty, prompt: string, answer: number, errors: [number, string][], working: string[]): string {
  const id = nextId();
  const q: NumericQuestion = {
    id,
    topicId: T,
    conceptId,
    difficulty,
    type: 'numeric',
    unit: 'rupees',
    prompt,
    answer: rs(answer),
    commonErrors: errors.map(([value, why]) => ({ value: rs(value), why })),
    working,
    explanation: working.join(' '),
    hints: ['Decide which of the figures belong under the head or line asked for.', 'Then add or deduct them in the order the statement lays down.'],
  };
  questions.push(q);
  return id;
}

// --- Meaning, nature, uses and limitations ------------------------------------------------------------------------------

mcq('fs-meaning', 'easy', 'Financial statements are the end product of:',
  'the accounting process of a period',
  [
    ['the audit of the company', 'The audit comes after: an auditor examines the statements once they are prepared.'],
    ['the budget for the coming year', 'A budget is a plan for the future. Financial statements report the period that has ended.'],
    ['the assessment of income tax', 'Tax is assessed from the statements; it does not produce them.'],
  ],
  'Transactions are recorded, classified and summarised; the summary at the end of the period is the financial statements.');
tf('fs-meaning', 'easy', 'The balance sheet of a company shows the profit it earned during the year.', false,
  'False. The balance sheet shows the financial position on a date. The profit of the year is shown by the Statement of Profit and Loss.');
const checkOne = mcq('fs-meaning', 'easy', 'Which statement of a company is headed "for the year ended 31 March 2026" and not "as at 31 March 2026"?',
  'The Statement of Profit and Loss',
  [
    ['The balance sheet', 'A balance sheet shows the position on one date, so it is headed "as at".'],
    ['Both the balance sheet and the Statement of Profit and Loss', 'Only the statement that covers a period is headed "for the year ended". The balance sheet is "as at" a date.'],
    ['Neither of them', 'The Statement of Profit and Loss covers the whole year, so it is headed "for the year ended".'],
  ],
  'Income and expenses build up over a period, so the Statement of Profit and Loss is for the year. Assets and liabilities are counted on a date, so the balance sheet is as at that date.');
ar('fs-meaning', 'medium', 'The balance sheet of a company does not show what the business is worth today.',
  'Assets are recorded at their historical cost, and later changes in prices are not recorded.', true, true, true,
  'Because assets stand at what was paid for them, perhaps years ago, the totals of a balance sheet are not the present worth of the business.');
tf('fs-meaning', 'medium', 'Financial statements are free from personal bias, because they are prepared from recorded facts alone.', false,
  'False. Besides recorded facts they rest on conventions and on personal judgements, such as the life of an asset, the method of depreciation and the provision for doubtful debts.');
mcq('fs-meaning', 'medium', 'Two companies have exactly the same transactions in a year, yet report different profits. One charges depreciation on the straight line method and the other on the written down value method. What does this show about financial statements?',
  'They are affected by the choices and judgement of those who prepare them',
  [
    ['They are affected by window dressing', 'Neither company is hiding or arranging anything. Both methods are allowed; the choice between them is a matter of judgement.'],
    ['They ignore qualitative factors', 'Depreciation is a money figure. The difference comes from the method chosen, not from something that cannot be measured.'],
    ['They are based on historical cost', 'Both companies start from the same cost. The profits differ because of the method chosen.'],
  ],
  'Where accounting allows a choice, the figures depend on the judgement of the accountant, so two sets of statements may not be comparable.');
mcq('fs-meaning', 'easy', 'Which of these is NOT an objective of financial statements?',
  'To show the price at which the shares of the company are traded',
  [
    ['To give information about the earning capacity of the business', 'This is an objective: users judge the earning capacity from the Statement of Profit and Loss.'],
    ['To give information about the resources and obligations of the business', 'This is an objective: the balance sheet lists the resources and the obligations.'],
    ['To help users judge how well the management has used the resources', 'This is an objective: the statements report on the stewardship of the directors.'],
  ],
  'The market price of a share is fixed in the stock market and appears nowhere in the financial statements.');
ar('fs-meaning', 'medium', 'The financial statements of a year are only interim reports.',
  'The exact profit of a business can be known only when it is finally wound up; the figures of any one year depend on estimates.', true, true, true,
  'The life of a business is cut into years for reporting. Depreciation, provisions and the like are estimates, so the profit of a year is not final.');
tf('fs-meaning', 'easy', 'The notes to accounts are a part of the financial statements of a company.', true,
  'True. The notes give the details of the items in the balance sheet and the Statement of Profit and Loss, and the accounting policies followed.');
mcq('fs-meaning', 'medium', 'Which of these users of financial statements is an internal user?',
  'The management of the company',
  [
    ['A bank that has given the company a loan', 'A lender is outside the company and reads the published statements.'],
    ['The income tax department', 'The government is an outside user.'],
    ['A person thinking of buying its shares', 'A prospective investor is an outside user.'],
  ],
  'The managers work inside the company and use the statements to plan and control. Lenders, the government and investors are external users.');
mcq('fs-meaning', 'medium', 'What must the financial statements of a company give, according to the Companies Act, 2013?',
  'A true and fair view of its state of affairs and of its profit or loss',
  [
    ['An exact and final measure of what the company is worth', 'The statements rest on historical cost and estimates. The law asks for a true and fair view, not an exact valuation.'],
    ['A forecast of its profit for the coming year', 'The statements report the year that has ended.'],
    ['The present market value of each of its assets', 'Assets are mostly shown at cost less depreciation, not at market value.'],
  ],
  'The balance sheet must give a true and fair view of the state of affairs, and the Statement of Profit and Loss of the profit or loss, in the form of Schedule III.');
tf('fs-meaning', 'medium', 'Window dressing makes financial statements more reliable, because it presents the figures neatly.', false,
  'False. Window dressing is the arranging of figures so that the position looks better than it is. It makes the statements less reliable.');
ar('fs-meaning', 'medium', 'Comparing the financial statements of two companies can mislead.',
  'Companies may follow different accounting policies, for example for depreciation and for the valuation of inventory.', true, true, true,
  'When the policies differ, the same facts give different figures, so a straight comparison of two companies may mislead.');
mcq('fs-meaning', 'easy', 'The resignation of a very able managing director finds no place in the financial statements. Which accounting concept is the reason?',
  'Money measurement',
  [
    ['Going concern', 'Going concern is about the business continuing. The point here is that the event cannot be stated in money.'],
    ['Consistency', 'Consistency is about using the same methods every year.'],
    ['Matching', 'Matching is about setting expenses against the revenue of the same period.'],
  ],
  'Only what can be expressed in money is recorded. This is why financial statements ignore qualitative factors.');

// --- The form of the balance sheet --------------------------------------------------------------------------------------

mcq('fs-bs-form', 'easy', 'In what order do the major heads appear under "Equity and Liabilities" in the Schedule III balance sheet?',
  "Shareholders' Funds; Share application money pending allotment; Non-Current Liabilities; Current Liabilities",
  [
    ["Current Liabilities; Non-Current Liabilities; Share application money pending allotment; Shareholders' Funds", 'Reversed the order. The funds of the owners come first and the liabilities due soonest come last.'],
    ["Shareholders' Funds; Non-Current Liabilities; Current Liabilities; Share application money pending allotment", "Put share application money last. It comes straight after Shareholders' Funds."],
    ["Share application money pending allotment; Shareholders' Funds; Non-Current Liabilities; Current Liabilities", "Put share application money first. Shareholders' Funds is the first head."],
  ],
  "The four major heads are, in order: Shareholders' Funds; Share application money pending allotment; Non-Current Liabilities; Current Liabilities.");
tf('fs-bs-form', 'easy', 'In the balance sheet of a company as per Schedule III, Assets are shown first and Equity and Liabilities below them.', false,
  'False. Part I is Equity and Liabilities and Part II is Assets.');
mcq('fs-bs-form', 'easy', 'Which columns does the balance sheet of a company have as per Schedule III?',
  'Particulars; Note No.; figures at the end of the current reporting period; figures at the end of the previous reporting period',
  [
    ['Particulars; Debit; Credit', 'Those are the columns of a trial balance.'],
    ['Liabilities; Amount; Assets; Amount', 'That is the horizontal form used by a sole trader or a firm.'],
    ['Date; Particulars; L.F.; Amount', 'Those are the columns of a journal, not of a balance sheet.'],
  ],
  'The vertical form has a column for the note number and two columns of figures, for the current year and the previous year.');
tf('fs-bs-form', 'medium', "\"Share application money pending allotment\" is shown as a part of Shareholders' Funds.", false,
  "False. It is a major head of its own, shown after Shareholders' Funds. What is part of Shareholders' Funds is \"money received against share warrants\".");
mcq('fs-bs-form', 'medium', 'Which of these headings no longer appears in the balance sheet after the 2021 amendment of Schedule III?',
  'Fixed Assets',
  [
    ['Inventories', 'Inventories is still a sub-head of Current Assets.'],
    ['Trade Payables', 'Trade Payables is still a sub-head of Current Liabilities.'],
    ['Long-term Provisions', 'Long-term Provisions is still a sub-head of Non-Current Liabilities.'],
  ],
  '"Fixed Assets" was renamed "Property, Plant and Equipment and Intangible Assets", and "Tangible Assets" became "Property, Plant and Equipment".');
ar('fs-bs-form', 'medium', 'The part of a long-term loan that is repayable within twelve months of the balance sheet date is not shown under Long-term Borrowings.',
  'A liability due to be settled within twelve months of the balance sheet date is a current liability.', true, true, true,
  'The instalment falling due within twelve months is current, so it is taken out of long-term borrowings. In Schedule III as amended in 2021 it is shown under short-term borrowings, as a current maturity of long-term borrowings.');
mcq('fs-bs-form', 'easy', 'How many major heads does the "Assets" part of the Schedule III balance sheet have?',
  'Two: Non-Current Assets and Current Assets',
  [
    ['Three: Fixed Assets, Investments and Current Assets', 'That grouping belongs to the old form. Schedule III groups every asset as non-current or current.'],
    ['Six: one for each kind of current asset', 'Those six are sub-heads of Current Assets, not major heads.'],
    ['One: Total Assets', 'The total is not a head. Assets are grouped as non-current and current.'],
  ],
  'Part II has two major heads, (1) Non-Current Assets and (2) Current Assets, each with its sub-heads.');
tf('fs-bs-form', 'easy', 'The balance sheet of a company is prepared "as at" a date and also gives the figures of the previous year.', true,
  'True. Schedule III requires the figures as at the end of the current reporting period and as at the end of the previous one, side by side.');
mcq('fs-bs-form', 'medium', 'Under which major head is "Deferred tax liabilities (net)" shown?',
  'Non-Current Liabilities',
  [
    ['Current Liabilities', 'Mixed it with provision for tax, which is a short-term provision. Deferred tax liabilities are a sub-head of Non-Current Liabilities.'],
    ["Shareholders' Funds", 'A liability is not part of the funds of the owners.'],
    ['Non-Current Assets', 'That is the place of deferred tax assets (net). A liability is shown on the other side.'],
  ],
  'Non-Current Liabilities: (a) Long-term borrowings, (b) Deferred tax liabilities (net), (c) Other long-term liabilities, (d) Long-term provisions.');

// --- Equity and liabilities ----------------------------------------------------------------------------------------------

mcq('fs-bs-equity-liabilities', 'easy', 'In which pair are both items shown under Reserves and Surplus?',
  'Capital Reserve and Securities Premium',
  [
    ['General Reserve and Provision for Tax', 'Provision for tax is a short-term provision, not a reserve.'],
    ['Securities Premium and Calls in Advance', 'Calls in advance are owed to shareholders until the call is made: other current liabilities.'],
    ['Capital Redemption Reserve and Share Application Money Pending Allotment', 'Share application money pending allotment is a major head of its own.'],
  ],
  'Reserves and Surplus holds Capital Reserve, Capital Redemption Reserve, Securities Premium, General Reserve and the balance of the Statement of Profit and Loss.');
tf('fs-bs-equity-liabilities', 'medium', 'A debit balance of the Statement of Profit and Loss is shown on the assets side, under Other Non-current Assets.', false,
  "False. It is shown as a negative figure under Reserves and Surplus, in Shareholders' Funds.");
mcq('fs-bs-equity-liabilities', 'medium', 'How are calls in arrears dealt with in the balance sheet of a company?',
  'They are deducted from the subscribed capital in the note on Share Capital',
  [
    ['They are shown under Other Current Assets', 'Showed the unpaid calls as an amount receivable. They are deducted from the subscribed capital instead.'],
    ['They are added to the subscribed capital in the note on Share Capital', 'Added what has not been received. Calls in arrears reduce the paid-up capital.'],
    ['They are shown under Other Current Liabilities', 'Mixed them with calls in advance, which are money received before a call is made.'],
  ],
  'Subscribed capital less calls in arrears gives the amount actually paid up, which is the figure of Share Capital.');
ar('fs-bs-equity-liabilities', 'medium', 'Calls in advance are shown under Other Current Liabilities.',
  'Money received on a call that has not yet been made is not part of the called-up capital and is owed to the shareholder until the call is made.', true, true, true,
  'Until the call is made the company holds the money for the shareholder, so it is a liability and not share capital.');
mcq('fs-bs-equity-liabilities', 'medium', 'A company owes ₹10,00,000 on a term loan, of which ₹2,00,000 is repayable within twelve months of the balance sheet date. How is the loan shown in a balance sheet as per Schedule III as amended in 2021?',
  '₹8,00,000 under Long-term Borrowings and ₹2,00,000 under Short-term Borrowings',
  [
    ['₹10,00,000 under Long-term Borrowings', 'Left the instalment due within twelve months with the long-term loan. It is a current maturity.'],
    ['₹2,00,000 under Long-term Borrowings and ₹8,00,000 under Short-term Borrowings', 'Turned the two parts round. It is the ₹2,00,000 repayable within twelve months that is current.'],
    ['₹10,00,000 under Short-term Borrowings', 'Took the whole loan as current. Only the part repayable within twelve months is.'],
  ],
  'The current maturity of ₹2,00,000 is a short-term borrowing; the remaining ₹8,00,000 is a long-term borrowing.');
tf('fs-bs-equity-liabilities', 'easy', 'A bank overdraft is deducted from cash and cash equivalents in the balance sheet of a company.', false,
  'False. A bank overdraft is a short-term borrowing, shown under Current Liabilities. A liability is not set off against an asset.');
mcq('fs-bs-equity-liabilities', 'medium', 'Why is unpaid dividend shown under Other Current Liabilities and not under Short-term Provisions?',
  'It is a fixed amount actually owed to shareholders, not an estimate',
  [
    ['It is payable only after twelve months', 'Unpaid dividend is payable on demand, which is why it is current. The point is that its amount is known.'],
    ['A dividend is not a liability until it is paid', 'Once a dividend is declared it is owed to the shareholders.'],
    ['It is deducted from Reserves and Surplus every year', 'It left the surplus when it was declared. What is still unpaid is a liability.'],
  ],
  'A provision is an estimated liability. A dividend declared is a known amount, so what is unpaid is another current liability.');
ar('fs-bs-equity-liabilities', 'medium', 'Provision for tax is shown under Short-term Provisions and not under Reserves and Surplus.',
  'A provision is an amount set aside for a liability, while a reserve is profit kept back in the business.', true, true, true,
  'Tax on the profit of the year is a liability whose amount is estimated, so it is a provision. A reserve belongs to the shareholders.');
tf('fs-bs-equity-liabilities', 'medium', 'Public deposits repayable after three years are shown under Other Long-term Liabilities.', false,
  'False. Deposits accepted from the public are money borrowed, so they are shown under Long-term Borrowings.');
num('fs-bs-equity-liabilities', 'medium', 'A company has Securities Premium of ₹4,00,000, General Reserve of ₹2,50,000 and a debit balance of ₹1,80,000 in the Statement of Profit and Loss. What amount is shown under Reserves and Surplus?',
  470000,
  [
    [830000, 'Added the debit balance of the Statement of Profit and Loss. It is a loss, shown as a negative figure.'],
    [650000, 'Left out the debit balance, as if it were shown on the assets side.'],
  ],
  ['Securities Premium ₹4,00,000 + General Reserve ₹2,50,000 = ₹6,50,000.', 'Less: debit balance of the Statement of Profit and Loss ₹1,80,000.', 'Reserves and Surplus = ₹4,70,000.']);
mcq('fs-bs-equity-liabilities', 'complex', "A company has Share Capital of ₹20,00,000, Securities Premium of ₹2,00,000, a debit balance of ₹5,00,000 in the Statement of Profit and Loss and share application money pending allotment of ₹2,00,000. What is the total of Shareholders' Funds?",
  '₹17,00,000',
  [
    ['₹19,00,000', "Counted the share application money pending allotment. It is a major head of its own, outside Shareholders' Funds."],
    ['₹27,00,000', 'Added the debit balance of the Statement of Profit and Loss instead of deducting it.'],
    ['₹22,00,000', 'Left out the debit balance, as if it were shown on the assets side.'],
  ],
  "Shareholders' Funds = Share Capital ₹20,00,000 + Reserves and Surplus (₹2,00,000 - ₹5,00,000 = -₹3,00,000) = ₹17,00,000. Share application money pending allotment is shown separately.");

// --- Assets ---------------------------------------------------------------------------------------------------------------

mcq('fs-bs-assets', 'easy', 'Which of these is an intangible asset?',
  'Computer software',
  [
    ['Computers', 'Computers are physical assets: Property, Plant and Equipment.'],
    ['Loose tools', 'Loose tools are shown under Inventories.'],
    ['Capital work-in-progress', 'That is a tangible asset still being built.'],
  ],
  'Software has no physical form, so it is an intangible asset, like goodwill, patents and trademarks.');
tf('fs-bs-assets', 'easy', 'Loose tools are shown under Property, Plant and Equipment.', false,
  'False. Schedule III lists loose tools under Inventories, a sub-head of Current Assets.');
mcq('fs-bs-assets', 'medium', 'Why is an advance paid to a supplier for a machine shown under Long-term Loans and Advances and not under Short-term Loans and Advances?',
  'It will not come back as cash or as goods of the operating cycle: it will turn into a fixed asset',
  [
    ['Every advance is long-term by nature', 'An advance for goods or for expenses is short-term. It is the purpose, a fixed asset, that makes this one long-term.'],
    ['The machine will be delivered after twelve months', 'The date of delivery does not decide it. A capital advance is long-term because it ends in a fixed asset.'],
    ['It is a kind of non-current investment', 'An advance to a supplier is not an investment.'],
  ],
  'A capital advance is paid for a fixed asset, so it is never realised in cash within the operating cycle. Schedule III lists it under long-term loans and advances.');
ar('fs-bs-assets', 'medium', 'Stores and spares are shown under Inventories.',
  'They are used up in running the business within the operating cycle, and are not held for use over many years.', true, true, true,
  'Because they are consumed in the ordinary course, Schedule III lists stores and spares under inventories and not with the machines they serve.');
mcq('fs-bs-assets', 'medium', 'In which pair are both items shown under Cash and Cash Equivalents?',
  'Cheques on hand and balances with banks',
  [
    ['Cash on hand and bank overdraft', 'A bank overdraft is a short-term borrowing, a liability.'],
    ['Balances with banks and current investments', 'Current investments have a sub-head of their own.'],
    ['Drafts on hand and bills receivable', 'Bills receivable are trade receivables until they are paid.'],
  ],
  'Cash and cash equivalents are cash on hand, balances with banks, and cheques and drafts on hand.');
tf('fs-bs-assets', 'medium', 'Work-in-progress of goods meant for sale and capital work-in-progress are both shown under Inventories.', false,
  'False. Work-in-progress of goods is inventory. Capital work-in-progress is a fixed asset under construction, shown under Non-Current Assets.');
mcq('fs-bs-assets', 'medium', 'Which items make up Trade Receivables?',
  'Sundry debtors and bills receivable',
  [
    ['Sundry debtors and prepaid expenses', 'Prepaid expenses are other current assets. Nothing is receivable from a customer.'],
    ['Bills receivable and advances to suppliers', 'An advance to a supplier is a short-term loan and advance.'],
    ['Sundry debtors and accrued income', 'Accrued income is another current asset. It does not arise from sales.'],
  ],
  'Trade receivables are amounts due from customers for goods sold or services rendered: debtors and bills receivable.');
mcq('fs-bs-assets', 'medium', 'Which of these is a non-current investment?',
  'Shares in a subsidiary company, to be held for many years',
  [
    ['Units of a mutual fund, to be sold in two months', 'An investment to be realised within twelve months is a current investment.'],
    ['A loan given to a subsidiary company for three years', 'A loan given is a long-term loan and advance, not an investment.'],
    ['Land used for the factory', 'Land held for use in the business is property, plant and equipment.'],
  ],
  'An investment meant to be held for more than twelve months is shown under non-current investments.');
tf('fs-bs-assets', 'easy', 'Prepaid expenses and accrued incomes are shown under Other Current Assets.', true,
  'True. Neither has a sub-head of its own, and both are realised or used up within twelve months, so they are other current assets.');
num('fs-bs-assets', 'complex', 'A company has a building of ₹10,00,000, a factory shed under construction on which ₹4,00,000 has been spent, patents of ₹2,00,000 and software under development on which ₹1,00,000 has been spent. What is the total shown against the sub-head "Property, Plant and Equipment and Intangible Assets"?',
  1700000,
  [
    [1200000, 'Counted only the assets in use and left out the two that are still being built or developed. They are parts of the same sub-head.'],
    [1400000, 'Counted only the tangible assets. Intangible assets and intangible assets under development belong to the same sub-head.'],
    [1600000, 'Left out the software under development. Intangible assets under development are the fourth part of the sub-head.'],
  ],
  ['The sub-head has four parts.', 'Property, Plant and Equipment ₹10,00,000; Intangible assets ₹2,00,000; Capital work-in-progress ₹4,00,000; Intangible assets under development ₹1,00,000.', 'Total = ₹17,00,000.']);

// --- Current and non-current ----------------------------------------------------------------------------------------------

mcq('fs-current-non-current', 'easy', 'What is the operating cycle of a company?',
  'The time between acquiring assets for processing and their realisation in cash or cash equivalents',
  [
    ['Its financial year, from 1 April to 31 March', 'The financial year is the reporting period. The operating cycle is the time the business takes to turn materials into cash.'],
    ['The period over which it repays its long-term loans', 'Loans have nothing to do with the operating cycle, which is about buying, making, selling and collecting.'],
    ['The credit period it allows to its customers', 'The credit period is only one part of the cycle, which also covers the time to make and sell the goods.'],
  ],
  'A manufacturer buys materials, makes goods, sells them and collects the money. The time this takes is the operating cycle.');
tf('fs-current-non-current', 'easy', 'When the operating cycle of a company cannot be identified, it is taken as twelve months.', true,
  'True. Schedule III says that where the normal operating cycle cannot be identified, it is assumed to be twelve months.');
const checkTwo = mcq('fs-current-non-current', 'medium', 'The operating cycle of a company is 18 months. Its trade receivables are expected to be realised 15 months after the balance sheet date. How are they classified?',
  'Current, because they will be realised within the operating cycle',
  [
    ['Non-current, because they will be realised after twelve months', 'Applied the twelve-month test alone. An asset realised within the operating cycle is current even after twelve months.'],
    ['Current, because trade receivables are always current', 'Trade receivables falling due after both twelve months and the operating cycle are non-current. These are current because 15 months is within the cycle.'],
    ['Non-current, because the operating cycle is longer than twelve months', 'A long operating cycle does not make items non-current. It lengthens the period within which they count as current.'],
  ],
  'An asset is current if it is realised within twelve months or within the operating cycle. 15 months is within the operating cycle of 18 months.');
ar('fs-current-non-current', 'medium', 'Trade payables due 14 months after the balance sheet date are a current liability for a company whose operating cycle is 16 months.',
  'A liability that is to be settled within the normal operating cycle of the company is current, even if that is later than twelve months.', true, true, true,
  '14 months is within the operating cycle of 16 months, so the trade payables are current.');
tf('fs-current-non-current', 'medium', 'A five-year loan that falls due six months after the balance sheet date is still shown under Long-term Borrowings, because its original term was five years.', false,
  'False. What counts is the time left. A loan repayable within twelve months of the balance sheet date is a current maturity, shown under Short-term Borrowings.');
mcq('fs-current-non-current', 'medium', 'Which of these does NOT make an asset a current asset?',
  'It was bought within the last twelve months',
  [
    ['It is expected to be realised within twelve months of the balance sheet date', 'This is one of the tests of a current asset.'],
    ['It is expected to be realised, sold or used up within the operating cycle', 'This is one of the tests of a current asset.'],
    ['It is cash or a cash equivalent', 'Cash and cash equivalents are current assets.'],
  ],
  'The tests look forward: when the asset will be realised. When it was bought does not matter; a machine bought last month is still non-current.');
num('fs-current-non-current', 'medium', 'A loan of ₹12,00,000 is repayable in 6 equal annual instalments. Two instalments have been paid by the balance sheet date and the third falls due eight months after it. What amount is shown under Long-term Borrowings?',
  600000,
  [
    [800000, 'Kept the whole balance under long-term borrowings. The instalment due within twelve months is a current maturity, shown under short-term borrowings.'],
    [1000000, 'Deducted the next instalment from the original loan, ignoring the two already paid.'],
    [200000, 'Gave the current maturity, which is shown under short-term borrowings.'],
  ],
  ['Each instalment = ₹12,00,000 ÷ 6 = ₹2,00,000.', 'Balance owed = ₹12,00,000 - 2 × ₹2,00,000 = ₹8,00,000.', 'Due within twelve months: ₹2,00,000 (short-term borrowings).', 'Long-term borrowings = ₹8,00,000 - ₹2,00,000 = ₹6,00,000.']);
mcq('fs-current-non-current', 'medium', 'The operating cycle of a company is 8 months. Some of its trade payables are due to be paid 10 months after the balance sheet date. How are they classified?',
  'Current, because they are due within twelve months of the balance sheet date',
  [
    ['Non-current, because they are due after the operating cycle of 8 months', 'Running past a short operating cycle does not make an item non-current. It is still due within twelve months.'],
    ['Current, because they are due within the operating cycle', '10 months is beyond the operating cycle of 8 months. They are current because of the twelve-month test.'],
    ['Non-current, because all amounts due after six months are non-current', 'There is no six-month rule. The tests are twelve months and the operating cycle.'],
  ],
  'A liability is current if it is due within twelve months or within the operating cycle. Either test is enough, and 10 months is within twelve.');

// --- The lines of the Statement of Profit and Loss ----------------------------------------------------------------------

mcq('fs-spl-lines', 'easy', 'Which is the first line of the Statement of Profit and Loss as per Schedule III?',
  'Revenue from Operations',
  [
    ['Other Income', 'Other Income is the second line.'],
    ['Total Income', 'Total Income is the sum of the first two lines.'],
    ['Cost of Materials Consumed', 'That is the first of the expenses, which come after Total Income.'],
  ],
  'The statement begins: I. Revenue from Operations, II. Other Income, III. Total Income.');
tf('fs-spl-lines', 'easy', 'In the Statement of Profit and Loss of a company, wages are added to the cost of materials consumed.', false,
  'False. Wages are pay to employees and are shown under Employee Benefits Expense.');
ar('fs-spl-lines', 'medium', 'Interest earned by a finance company on the loans it gives is shown under Revenue from Operations.',
  'Revenue from operations is the income a company earns from its main business.', true, true, true,
  'Lending is the main business of a finance company, so its interest on loans is revenue from operations. For any other company the same kind of interest is other income.');
mcq('fs-spl-lines', 'medium', 'In which pair are both items shown under Finance Costs?',
  'Interest on debentures and loss on issue of debentures written off',
  [
    ['Interest on a bank loan and bank charges for collecting cheques', 'Charges for collecting cheques pay for a service of the bank, not for money borrowed: other expenses.'],
    ['Interest on debentures and dividend paid', 'A dividend is a distribution of profit to the owners, not an expense.'],
    ['Bank charges for collecting cheques and audit fee', 'Both are other expenses. Neither is a cost of borrowing.'],
  ],
  'Finance costs are the costs of borrowing: interest, and the discount or loss on issue of debentures written off against profit.');
tf('fs-spl-lines', 'medium', 'Dividend paid to equity shareholders is shown under Finance Costs in the Statement of Profit and Loss.', false,
  'False. A dividend is a distribution of profit to the owners, not an expense. It does not appear among the expenses at all.');
mcq('fs-spl-lines', 'medium', 'In the line "Depreciation and Amortisation Expense", what does amortisation mean?',
  'Writing off the cost of an intangible asset over its useful life',
  [
    ['Writing off a debt that cannot be recovered', 'That is bad debts, one of the other expenses.'],
    ['Repaying a loan in instalments', 'Repaying a loan is not an expense at all.'],
    ['Charging depreciation on a tangible asset', 'That is depreciation. Amortisation is the same idea applied to intangible assets.'],
  ],
  'Depreciation is for tangible assets such as machinery; amortisation is for intangible assets such as patents and goodwill.');
mcq('fs-spl-lines', 'easy', 'How is the "Profit for the period" arrived at in the Statement of Profit and Loss?',
  'Profit before Tax less Tax Expense',
  [
    ['Total Income less Total Expenses', 'That gives the profit before tax. Tax has still to be deducted.'],
    ['Revenue from Operations less Total Expenses', 'Left out other income and the tax expense.'],
    ['Profit before Tax plus Other Income', 'Other income is already in the total income, and tax is deducted, not income added.'],
  ],
  'Total Income - Total Expenses = Profit before Tax. Profit before Tax - Tax Expense = Profit for the period.');
ar('fs-spl-lines', 'medium', 'The sale of scrap by a manufacturing company is shown under Revenue from Operations.',
  'Revenue from operations includes other operating revenues, which arise from the operating activities of the company apart from the sale of its products.', true, true, true,
  'Scrap arises from production, so its sale is other operating revenue, a part of revenue from operations.');
mcq('fs-spl-lines', 'complex', 'Suhana Traders Ltd. only buys finished goods and sells them as they are; it makes nothing. Which line of its Statement of Profit and Loss will have no figure?',
  'Cost of Materials Consumed',
  [
    ['Purchases of Stock-in-Trade', 'Goods bought for resale are exactly what this line carries.'],
    ['Changes in Inventories of Finished Goods, Work-in-Progress and Stock-in-Trade', 'A trading company has opening and closing stock-in-trade, so this line has a figure.'],
    ['Employee Benefits Expense', 'A trading company also pays salaries to its staff.'],
  ],
  'Cost of materials consumed is for a manufacturer, which turns raw materials into goods. A trading company shows its purchases under Purchases of Stock-in-Trade.');
tf('fs-spl-lines', 'medium', 'Carriage outwards and audit fee are both shown under Other Expenses.', true,
  'True. Neither is pay to employees, a cost of borrowing or depreciation, so both are other expenses.');

// --- Working out a line ---------------------------------------------------------------------------------------------------

num('fs-spl-amounts', 'easy', 'A manufacturing company had raw materials of ₹50,000 at the start of the year, bought raw materials for ₹4,00,000 and had ₹70,000 of them left at the end. What is the cost of materials consumed?',
  380000,
  [
    [520000, 'Added the closing inventory instead of deducting it.'],
    [420000, 'Deducted the opening inventory and added the closing one: the wrong way round.'],
    [450000, 'Forgot to deduct the closing inventory.'],
  ],
  ['Cost of materials consumed = Opening inventory + Purchases - Closing inventory.', '₹50,000 + ₹4,00,000 - ₹70,000 = ₹3,80,000.']);
num('fs-spl-amounts', 'medium', 'A company had 10% Debentures of ₹5,00,000 outstanding for the whole year. It also paid its bank ₹4,000 as charges for collecting cheques, and wrote off discount on issue of debentures of ₹10,000 against the profit of the year. What are its finance costs?',
  60000,
  [
    [64000, 'Counted the charges for collecting cheques. They pay for a service of the bank, not for money borrowed, so they are other expenses.'],
    [50000, 'Left out the discount on issue written off, which is a cost of raising the loan.'],
    [10000, 'Left out the interest on the debentures, which has to be worked out from the rate.'],
  ],
  ['Interest on debentures = 10% of ₹5,00,000 = ₹50,000.', 'Discount on issue written off = ₹10,000.', 'Finance costs = ₹50,000 + ₹10,000 = ₹60,000. The charges for collecting cheques are other expenses.']);
mcq('fs-spl-amounts', 'medium', 'The finished goods of a company were ₹2,00,000 at the start of the year and ₹2,60,000 at the end. It has no work-in-progress or stock-in-trade. What is shown against "Changes in Inventories"?',
  '₹60,000 as a negative figure, which reduces the expenses',
  [
    ['₹60,000 added to the expenses', 'Took closing less opening. The line is opening less closing, and a rise in inventory reduces the expenses.'],
    ['₹4,60,000 added to the expenses', 'Added the two inventories. The line shows the difference between them.'],
    ['₹2,60,000 as a negative figure, which reduces the expenses', 'Showed the closing inventory itself. The line shows opening less closing.'],
  ],
  'Change = opening - closing = ₹2,00,000 - ₹2,60,000 = (₹60,000). Inventory has risen, so the figure is negative.');
num('fs-spl-amounts', 'medium', 'For a year a company paid wages ₹3,00,000, salaries ₹2,00,000, its contribution to provident fund ₹30,000, staff welfare expenses ₹20,000 and audit fee ₹25,000. What is its employee benefits expense?',
  550000,
  [
    [250000, 'Left out the wages, taking them for a direct expense. All pay to employees is one line.'],
    [575000, 'Counted the audit fee. Auditors are not employees; the fee is one of the other expenses.'],
    [500000, 'Counted only wages and salaries. The provident fund contribution and staff welfare are employee benefits too.'],
  ],
  ['Employee benefits expense = Wages + Salaries + Contribution to provident fund + Staff welfare.', '₹3,00,000 + ₹2,00,000 + ₹30,000 + ₹20,000 = ₹5,50,000.', 'Audit fee is one of the other expenses.']);
num('fs-spl-amounts', 'complex', 'A company has revenue from operations of ₹20,00,000 and other income of ₹50,000. Its expenses are: cost of materials consumed ₹9,00,000, employee benefits expense ₹4,00,000, finance costs ₹60,000, depreciation ₹90,000 and other expenses ₹2,00,000. Tax is 30% of the profit before tax. What is the profit for the period?',
  280000,
  [
    [400000, 'Stopped at the profit before tax and did not deduct the tax expense.'],
    [120000, 'Gave the tax expense instead of the profit left after it.'],
    [245000, 'Left the other income out of the total income.'],
  ],
  ['Total income = ₹20,00,000 + ₹50,000 = ₹20,50,000.', 'Total expenses = ₹9,00,000 + ₹4,00,000 + ₹60,000 + ₹90,000 + ₹2,00,000 = ₹16,50,000.', 'Profit before tax = ₹20,50,000 - ₹16,50,000 = ₹4,00,000.', 'Tax = 30% of ₹4,00,000 = ₹1,20,000. Profit for the period = ₹2,80,000.']);
tf('fs-spl-amounts', 'easy', 'In the Statement of Profit and Loss, Total Income is Revenue from Operations plus Other Income.', true,
  'True. I. Revenue from Operations + II. Other Income = III. Total Income.');

// --- Notes to accounts, contingent liabilities and commitments -------------------------------------------------------

mcq('fs-notes-contingent', 'easy', 'Where are the contingent liabilities of a company shown?',
  'In the notes to accounts, not in the balance sheet itself',
  [
    ['Under Other Current Liabilities', 'A contingent liability is not actually owed yet, so it is not among the liabilities.'],
    ['Under Short-term Provisions', 'A provision is made for a present obligation. A contingent liability depends on an uncertain event.'],
    ['As a deduction from Reserves and Surplus', 'Nothing has been lost or paid, so the reserves are not touched.'],
  ],
  'Contingent liabilities and commitments are disclosed in the notes to accounts, to the extent not provided for.');
tf('fs-notes-contingent', 'easy', 'A guarantee given by a company to a bank for a loan taken by another company is shown under Current Liabilities.', false,
  'False. The company pays only if the borrower fails to, so it is a contingent liability, disclosed in the notes to accounts.');
mcq('fs-notes-contingent', 'medium', 'Which of these is a commitment and not a contingent liability?',
  'The estimated amount of contracts remaining to be executed on capital account',
  [
    ['A claim against the company not acknowledged as debt', 'It is payable only if the claim succeeds: a contingent liability.'],
    ['Bills receivable discounted and not yet matured', 'The company pays only if a bill is dishonoured: a contingent liability.'],
    ['A guarantee given for a loan taken by a subsidiary', 'The company pays only if the subsidiary fails to: a contingent liability.'],
  ],
  'A commitment is a contract for future spending, such as a machine ordered and not yet delivered. A contingent liability depends on an uncertain event.');
ar('fs-notes-contingent', 'medium', 'A claim against a company that it does not acknowledge as a debt is not shown in its balance sheet.',
  'Whether the company will have to pay depends on a future event that is uncertain, such as the decision of a court.', true, true, true,
  'Since nothing is owed unless the claim succeeds, it is a contingent liability and is only disclosed in the notes.');
mcq('fs-notes-contingent', 'medium', 'What is the purpose of the notes to accounts?',
  'To give the details of the items in the balance sheet and the Statement of Profit and Loss, and the accounting policies followed',
  [
    ["To take the place of the directors' report", "The directors' report is a separate document and is not part of the financial statements."],
    ['To list every transaction of the year', 'That is the work of the books of account. The notes explain the figures of the statements.'],
    ['To show the trial balance from which the statements were prepared', 'The trial balance is a working paper and is not published.'],
  ],
  'The statements show one figure for each line; the note with the same number gives its break-up.');
tf('fs-notes-contingent', 'medium', 'The uncalled liability on partly paid shares that a company holds as an investment is disclosed as a commitment in the notes to accounts.', true,
  'True. Schedule III lists it under commitments, with contracts remaining to be executed on capital account.');
mcq('fs-notes-contingent', 'medium', 'Some shares of a company are not fully paid, and some forfeited shares are not yet reissued. In the note on Share Capital, how is the total carried to the balance sheet arrived at?',
  'Called-up amount, less calls in arrears, plus the balance of Forfeited Shares Account as a separate line',
  [
    ['Called-up amount, plus calls in arrears, less the balance of Forfeited Shares Account', 'Reversed both. Calls in arrears are deducted and the forfeited amount is added.'],
    ['Face value of the shares, less the calls not yet made', 'That is the called-up amount. Calls in arrears and forfeited shares still have to be dealt with.'],
    ['Called-up amount, plus Securities Premium received', 'Securities Premium is shown under Reserves and Surplus, never in the note on share capital.'],
  ],
  'The note shows authorised, issued and subscribed capital. Subscribed but not fully paid capital is the called-up amount less calls in arrears. The amount forfeited on shares not yet reissued is not part of it: it is added as a separate line, and the total of the note is carried to the balance sheet.');
mcq('fs-notes-contingent', 'medium', 'The directors of a company propose a dividend for the year after the balance sheet date. It is still to be approved by the shareholders at the annual general meeting. How is it dealt with in the financial statements of that year?',
  'It is not shown as a liability in the balance sheet; it is disclosed in the notes to accounts',
  [
    ['It is shown under Short-term Provisions', 'That was the treatment in the past. A dividend proposed after the balance sheet date is no longer provided for.'],
    ['It is shown under Other Current Liabilities', 'Nothing is owed until the shareholders declare the dividend at the meeting.'],
    ['It is deducted from Share Capital', 'A dividend is paid out of profits and never reduces share capital.'],
  ],
  'A dividend becomes a liability only when the shareholders declare it. Until then the proposed dividend is disclosed in the notes.');

// ---------------------------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------------------------

const idsOf = (...c: string[]): string[] => questions.filter((q) => c.includes(q.conceptId)).map((q) => q.id);

const levels = buildLadder(T, {
  concept: {
    title: 'A Report Card for the Owners',
    description: 'What the financial statements of a company are, and how Schedule III lays out the balance sheet and the Statement of Profit and Loss.',
    lesson: [
      {
        type: 'text',
        heading: 'Owners who do not run the business',
        body: 'A company is owned by its shareholders, often thousands of them, but it is run by a few directors. So at the end of every year the directors must report to the owners. That report is the financial statements: the balance sheet, which lists what the company owns and what it owes on the last day of the year, and the Statement of Profit and Loss, which sets the income of the year against its expenses. Notes to accounts give the details behind each figure. Banks, investors, employees and the government read the same statements for their own decisions.',
      },
      {
        type: 'text',
        heading: 'One form for every company',
        body: "If each company drew up its statements in its own way, nobody could compare two of them. So the Companies Act, 2013 lays down one form, in Schedule III. The balance sheet is written from top to bottom. First comes \"Equity and Liabilities\": Shareholders' Funds (what belongs to the owners), share application money pending allotment, Non-Current Liabilities and Current Liabilities. Below it comes \"Assets\": Non-Current Assets and Current Assets. Each of these major heads has sub-heads, and every item of the trial balance has exactly one place.",
      },
      {
        type: 'text',
        heading: 'Current or non-current?',
        body: 'The form sorts everything by time. Think of a company that makes biscuits: it buys flour, bakes, sells and collects the money, all in about two months. That round trip is its operating cycle. An asset that turns into cash, or a liability that has to be paid, within twelve months of the balance sheet date or within the operating cycle is current. Everything else is non-current. When the operating cycle cannot be identified, it is taken as twelve months.',
      },
      {
        type: 'text',
        heading: 'Worked example: placing five items',
        body: 'Take five balances of a company on 31 March. (1) Machinery: held for use over years, so Non-Current Assets, Property, Plant and Equipment. (2) Loose tools: Schedule III lists them under Current Assets, Inventories. (3) A bank loan of ₹10,00,000, of which ₹2,00,000 is repayable in the coming year: ₹8,00,000 is a long-term borrowing under Non-Current Liabilities, and ₹2,00,000 is a short-term borrowing under Current Liabilities. (4) Provision for tax: an estimated amount payable within the year, so Current Liabilities, Short-term Provisions. (5) Securities Premium: it belongs to the shareholders, so Shareholders\' Funds, Reserves and Surplus. Each time the questions are the same: does the company own it or owe it, when does it fall due, and what kind of item is it?',
      },
      { type: 'check', questionId: checkTwo },
      {
        type: 'working',
        title: 'Worked example 1: a term loan repaid in instalments (Sahyadri Clinics Ltd., Pune)',
        lines: [
          'Sahyadri Clinics Ltd. took a term loan of ₹15,00,000 to equip a new clinic, repayable in 5 equal annual instalments on 30 June, the first on 30 June 2024. Every instalment has been paid on time. Show the loan in the balance sheet as at 31 March 2026.',
          'Each instalment = ₹15,00,000 ÷ 5 = ₹3,00,000.',
          'Paid by 31 March 2026: the instalments of 30 June 2024 and 30 June 2025, two in all, ₹6,00,000. Still owed: ₹15,00,000 - ₹6,00,000 = ₹9,00,000.',
          'The instalment of 30 June 2026 falls due within twelve months of the balance sheet date: ₹3,00,000 is a current maturity, shown under Current Liabilities, Short-term Borrowings.',
          'The rest, ₹9,00,000 - ₹3,00,000 = ₹6,00,000, falls due after twelve months: Non-Current Liabilities, Long-term Borrowings.',
        ],
        note: 'Watch out: go by the time left to pay, not by the original term of the loan, and start from what is still owed, not from the loan as first taken. Older books show the current maturity under other current liabilities; Schedule III as amended in 2021 puts it under short-term borrowings.',
      },
      {
        type: 'table',
        title: 'Worked example 2: the Note on Share Capital (Dhruv Learning Ltd., which runs coaching centres in Kota)',
        rows: [
          { label: 'Authorised capital: 2,00,000 equity shares of ₹10 each', amount: '₹20,00,000' },
          { label: 'Issued capital: 1,50,000 equity shares of ₹10 each', amount: '₹15,00,000' },
          { label: 'Subscribed capital' },
          { label: 'Subscribed and fully paid: 1,20,000 shares of ₹10 each', amount: '₹12,00,000' },
          { label: 'Subscribed but not fully paid: 28,000 shares of ₹10 each, ₹8 a share called up', amount: '₹2,24,000' },
          { label: 'Less: Calls in arrears', amount: '(₹6,000)' },
          { label: 'Add: Forfeited shares (2,000 shares on which ₹5 a share had been paid)', amount: '₹10,000' },
          { label: 'Share Capital, carried to the balance sheet', amount: '₹14,28,000', total: true },
        ],
        note: 'The shares add up: 1,20,000 + 28,000 + 2,000 forfeited = 1,50,000 issued. The authorised and issued capital are shown for information only; the figure carried to the balance sheet is 12,00,000 + 2,24,000 - 6,000 + 10,000 = ₹14,28,000. Watch out: the forfeited amount is a separate line added at the end, not a part of the capital not fully paid, and Securities Premium never enters this note: it belongs to Reserves and Surplus.',
      },
      {
        type: 'text',
        heading: 'The Statement of Profit and Loss',
        body: 'A company has no Trading Account and no gross profit. Its statement starts with Revenue from Operations (the income of the main business) and Other Income, which together are the Total Income. Then come the expenses, grouped by what the money was spent on: materials consumed, purchases of stock-in-trade, changes in inventories, employee benefits, finance costs, depreciation and amortisation, and other expenses. Total Income less Total Expenses is the Profit before Tax; taking away the tax expense leaves the Profit for the period.',
      },
      {
        type: 'working',
        title: 'Worked example 3: the lines of a manufacturer\'s statement (Malwa Flour Mills Ltd., Indore, year ended 31 March 2026)',
        lines: [
          'Cost of materials consumed (wheat): opening ₹4,00,000 + purchases ₹50,00,000 - closing ₹6,00,000 = ₹48,00,000.',
          'Changes in inventories of finished goods (flour): opening ₹3,00,000 - closing ₹4,50,000 = (₹1,50,000). The stock has risen, so the figure is negative and reduces the expenses.',
          'Employee benefits expense: wages ₹6,00,000 + salaries ₹4,00,000 + provident fund contribution ₹50,000 = ₹10,50,000.',
          'Finance costs: interest on 9% Debentures of ₹10,00,000 = ₹90,000. Discount on issue of debentures ₹40,000, of which ₹25,000 is written off against Securities Premium, leaves ₹15,000 for profit. Total ₹90,000 + ₹15,000 = ₹1,05,000.',
          'Other expenses: power and fuel ₹4,20,000 + rent of the godown ₹1,20,000 + audit fee ₹50,000 + bank charges for collecting cheques ₹5,000 = ₹5,95,000.',
          'Interest of ₹40,000 on a fixed deposit is other income: lending is not the business of a flour mill.',
        ],
        note: 'Watch out: raw materials go only into the cost of materials consumed, never into the changes in inventories; and charges for collecting cheques pay for a service of the bank, so they are other expenses, while charges for a borrowing would be a finance cost.',
      },
      {
        type: 'table',
        title: 'Statement of Profit and Loss of Malwa Flour Mills Ltd. for the year ended 31 March 2026',
        rows: [
          { label: 'I. Revenue from Operations', amount: '₹80,00,000' },
          { label: 'II. Other Income', amount: '₹40,000' },
          { label: 'III. Total Income (I + II)', amount: '₹80,40,000', total: true },
          { label: 'IV. Expenses' },
          { label: 'Cost of Materials Consumed', amount: '₹48,00,000' },
          { label: 'Changes in Inventories of Finished Goods', amount: '(₹1,50,000)' },
          { label: 'Employee Benefits Expense', amount: '₹10,50,000' },
          { label: 'Finance Costs', amount: '₹1,05,000' },
          { label: 'Depreciation and Amortisation Expense', amount: '₹3,00,000' },
          { label: 'Other Expenses', amount: '₹5,95,000' },
          { label: 'Total Expenses', amount: '₹67,00,000', total: true },
          { label: 'V. Profit before Tax (III - IV)', amount: '₹13,40,000', total: true },
          { label: 'VI. Tax Expense (25% of the profit before tax)', amount: '₹3,35,000' },
          { label: 'VII. Profit for the period (V - VI)', amount: '₹10,05,000', total: true },
        ],
        note: 'In an examination answer each expense line carries the number of its note, where the working above is shown. There is no gross profit: every expense is placed by what the money was spent on.',
      },
      {
        type: 'table',
        title: 'Worked example 4: Balance Sheet of Girnar Ceramics Ltd., a maker of floor tiles in Morbi, as at 31 March 2026',
        rows: [
          { label: 'I. EQUITY AND LIABILITIES' },
          { label: "Shareholders' Funds: Share Capital", amount: '₹30,00,000' },
          { label: "Shareholders' Funds: Reserves and Surplus (Note 1)", amount: '₹5,50,000' },
          { label: 'Non-Current Liabilities: Long-term Borrowings (9% Debentures)', amount: '₹10,00,000' },
          { label: 'Current Liabilities: Trade Payables', amount: '₹4,00,000' },
          { label: 'Current Liabilities: Other Current Liabilities (outstanding salaries)', amount: '₹50,000' },
          { label: 'Current Liabilities: Short-term Provisions (provision for tax)', amount: '₹1,50,000' },
          { label: 'Total', amount: '₹51,50,000', total: true },
          { label: 'II. ASSETS' },
          { label: 'Non-Current Assets: Property, Plant and Equipment (Note 2)', amount: '₹39,00,000' },
          { label: 'Current Assets: Inventories', amount: '₹5,00,000' },
          { label: 'Current Assets: Trade Receivables (Note 3)', amount: '₹4,80,000' },
          { label: 'Current Assets: Cash and Cash Equivalents', amount: '₹2,70,000' },
          { label: 'Total', amount: '₹51,50,000', total: true },
        ],
        note: 'The two totals agree. On the face, each sub-head carries one figure and the number of its note; the notes below show how three of the figures are made up.',
      },
      {
        type: 'table',
        title: 'Notes to Accounts of Girnar Ceramics Ltd. as at 31 March 2026',
        rows: [
          { label: 'Note 1: Reserves and Surplus' },
          { label: 'Securities Premium', amount: '₹4,00,000' },
          { label: 'General Reserve', amount: '₹2,00,000' },
          { label: 'Debenture Redemption Reserve', amount: '₹1,00,000' },
          { label: 'Statement of Profit and Loss (debit balance)', amount: '(₹1,50,000)' },
          { label: 'Total of Note 1', amount: '₹5,50,000', total: true },
          { label: 'Note 2: Property, Plant and Equipment' },
          { label: 'Land and building', amount: '₹15,00,000' },
          { label: 'Plant and machinery at cost ₹30,00,000, less accumulated depreciation ₹6,00,000', amount: '₹24,00,000' },
          { label: 'Total of Note 2', amount: '₹39,00,000', total: true },
          { label: 'Note 3: Trade Receivables' },
          { label: 'Sundry debtors', amount: '₹4,00,000' },
          { label: 'Bills receivable', amount: '₹1,00,000' },
          { label: 'Less: Provision for doubtful debts', amount: '(₹20,000)' },
          { label: 'Total of Note 3', amount: '₹4,80,000', total: true },
        ],
        note: 'Watch out: a debit balance of the Statement of Profit and Loss is a negative figure inside Reserves and Surplus, never an asset; accumulated depreciation and the provision for doubtful debts are deducted from the assets they belong to, not shown as liabilities; and the Debenture Redemption Reserve is a reserve, not a part of the debentures.',
      },
      {
        type: 'text',
        heading: 'What the figures cannot tell',
        body: 'Some things are kept out of the balance sheet and only disclosed in the notes: a claim the company disputes, or a guarantee it has given, may never have to be paid, so it is a contingent liability. And the statements have limits. Land bought long ago stands at its old cost; a loyal workforce has no figure at all; many figures are estimates; and figures can be dressed up to look better than they are. A careful reader keeps these limits in mind.',
      },
      { type: 'check', questionId: checkOne },
    ],
  },
  cards: {
    title: 'Heads, Lines and Rules',
    description: 'Recall the heads and sub-heads of the balance sheet, the lines of the Statement of Profit and Loss and the rules for placing an item.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'What Financial Statements Are',
      description: 'Their meaning, nature, objectives, uses and limitations.',
      questionIds: idsOf('fs-meaning'),
    },
    {
      title: 'The Balance Sheet: Form, Equity and Liabilities',
      description: "The major heads in order, and what goes under Shareholders' Funds and the liabilities.",
      questionIds: idsOf('fs-bs-form', 'fs-bs-equity-liabilities'),
    },
    {
      title: 'Assets, and Current against Non-current',
      description: 'The sub-heads of the assets, and the tests of twelve months and the operating cycle.',
      questionIds: idsOf('fs-bs-assets', 'fs-current-non-current'),
    },
    {
      title: 'The Statement of Profit and Loss and the Notes',
      description: 'The lines of the statement, working out a line, notes to accounts and contingent liabilities.',
      questionIds: idsOf('fs-spl-lines', 'fs-spl-amounts', 'fs-notes-contingent'),
    },
  ],
  practice: [
    {
      title: 'Everyday Items of the Balance Sheet',
      description: 'Place common items under their major head and sub-head, and total the inventories and the cash.',
      templateIds: ['fs-form-facts', 'fs-bs-major-head', 'fs-el-sub-head', 'fs-assets-sub-head', 'fs-total-inventories', 'fs-total-cash-equivalents'],
      count: 8,
    },
    {
      title: 'Lines of the Statement, Uses and Contingencies',
      description: 'Choose the line for an expense, work out simple lines, and tell a contingent liability from an actual one.',
      templateIds: ['fs-meaning-facts', 'fs-use-scenario', 'fs-spl-line', 'fs-spl-materials-consumed', 'fs-spl-total-income', 'fs-spl-other-expenses', 'fs-contingent-kind'],
      count: 8,
    },
    {
      title: 'Current or Non-current, Step by Step',
      description: 'Compare the due date with twelve months and the operating cycle, then name the head.',
      templateIds: ['fs-cnc-due-date', 'fs-cnc-operating-cycle', 'fs-cnc-split-amount'],
      count: 6,
      guided: true,
    },
    {
      title: 'Trickier Items of the Balance Sheet',
      description: 'Items whose names mislead, the odd one out under a head, and totals of borrowings and reserves.',
      templateIds: ['fs-el-sub-head-tricky', 'fs-assets-sub-head-tricky', 'fs-el-which-under', 'fs-assets-which-under', 'fs-total-short-term-borrowings', 'fs-total-reserves-surplus'],
      count: 8,
    },
    {
      title: 'Statement of Profit and Loss, Notes and Limitations',
      description: 'Revenue or other income, the change in inventories, totals of expense lines, the note on share capital and contingent liabilities.',
      templateIds: [
        'fs-spl-which-under', 'fs-spl-income-kind', 'fs-spl-change-inventories', 'fs-spl-employee-benefits', 'fs-spl-finance-costs',
        'fs-note-share-capital', 'fs-contingent-total', 'fs-limitation-scenario',
      ],
      count: 8,
    },
    {
      title: 'Board-Level Questions',
      description: 'Two items at once, a loan repaid in instalments, finance costs after Securities Premium, profit after tax and totals with a trap.',
      templateIds: [
        'fs-bs-two-items', 'fs-cnc-loan-instalments', 'fs-spl-finance-costs-premium', 'fs-spl-profit-before-tax',
        'fs-total-other-current-liabilities', 'fs-total-current-liabilities', 'fs-total-shareholders-funds',
      ],
      count: 7,
    },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Schedule III Mastery', description: 'The hardest questions of the topic, timed.', count: 8 },
  // Statements the student prepares, the shortest first: a note, a part of the balance sheet, the Statement of Profit
  // and Loss, the whole balance sheet. Each level serves two, in an order drawn for the play.
  formats: [
    {
      title: 'Prepare a Note to Accounts',
      description: 'The note on one sub-head of the balance sheet, or the two notes on borrowings, from a list of balances some of which belong elsewhere.',
      templateIds: ['fs-fmt-note'],
      count: 2,
    },
    {
      title: 'Prepare a Part of the Balance Sheet',
      description: 'From a jumbled list of balances, the Equity and Liabilities part or the Assets part in the form of Schedule III: each balance under its sub-head, a sub-total for each major head and the total.',
      templateIds: ['fs-fmt-bs-equity-liabilities', 'fs-fmt-bs-assets'],
      count: 2,
    },
    {
      title: 'Prepare the Statement of Profit and Loss',
      description: 'For a manufacturing or a trading company: first from a list of incomes and expenses, each placed on its line; then with the materials consumed, the change in inventories, the interest, the depreciation and the tax worked out from details.',
      templateIds: ['fs-fmt-spl', 'fs-fmt-spl-worked'],
      count: 2,
    },
    {
      title: 'Prepare the Balance Sheet',
      description: 'The whole balance sheet from twelve to sixteen balances: both parts, one figure for each sub-head, and two totals that agree. Some of what is given belongs in the notes and not on the face.',
      templateIds: ['fs-fmt-balance-sheet'],
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
        name: 'more-items',
        type: 'medium_practice',
        title: 'More Items of the Balance Sheet',
        description: 'Reserves and liabilities met less often, and the two figures found by a deduction: property, plant and equipment net of depreciation, and trade receivables net of the provision for doubtful debts.',
        generate: { templateIds: ['fs-bs-item-more', 'fs-total-trade-receivables', 'fs-total-ppe'], count: 8 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['fs-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
