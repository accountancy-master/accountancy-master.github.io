import { rupees } from '@/engine/money';
import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'final-accounts';

const concepts: Concept[] = [
  { id: 'fa-users', topicId: T, title: 'Users of financial statements' },
  { id: 'fa-capital-revenue', topicId: T, title: 'Capital and revenue items' },
  { id: 'fa-trading', topicId: T, title: 'Trading Account, cost of goods sold and gross profit' },
  { id: 'fa-classify', topicId: T, title: 'Direct and indirect items; where each item goes' },
  { id: 'fa-pl', topicId: T, title: 'Profit and Loss Account, net profit and operating profit' },
  { id: 'fa-balance-sheet', topicId: T, title: 'Balance Sheet and marshalling' },
  { id: 'fa-capital', topicId: T, title: 'Closing capital and closing entries' },
  { id: 'fa-whole', topicId: T, title: 'Putting the final accounts together' },
  { id: 'fa-closing-sets', topicId: T, title: 'Passing a set of closing entries' },
  { id: 'fa-formats', topicId: T, title: 'Preparing the Trading Account, the Profit and Loss Account and the Balance Sheet' },
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
): Card => ({ id: `fa-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'fa-users', 'rule', 'Who reads the final accounts, and what does each reader want to know?',
    'The owner: profit earned and capital. A lender: can interest and the loan be repaid. A supplier on credit: will the dues be paid in time. Employees: is the business stable. Tax authority: profit to be taxed. A possible investor: is it profitable enough.',
    'Final accounts are the Trading Account, the Profit and Loss Account and the Balance Sheet. Different people read the same statements for different answers.',
    'A bank deciding whether to lend looks at the Balance Sheet for liabilities and at the profit for the ability to pay interest.',
    'Saying the owner is the only user. Outsiders such as lenders and suppliers rely on the statements too.'),
  card(2, 'fa-capital-revenue', 'rule', 'How do you tell capital expenditure from revenue expenditure?',
    'Capital expenditure buys or improves a lasting asset (or is needed to bring it into use) and its benefit lasts several years. Revenue expenditure is used up in running the business within the year.',
    'Capital expenditure goes to the Balance Sheet as an asset. Revenue expenditure is charged in the Trading or Profit and Loss Account.',
    'A new van for ₹4,00,000 and ₹5,000 of freight and fitting to put it on the road: capital. Petrol and routine servicing: revenue.',
    'Treating carriage or installation on a new asset as a revenue expense. It is part of the asset\'s cost.'),
  card(3, 'fa-capital-revenue', 'rule', 'How do you tell a capital receipt from a revenue receipt?',
    'A capital receipt is money from the owner, a loan or the sale of a fixed asset: it changes capital, liabilities or assets. A revenue receipt is earned in the normal course of business: sales, commission, interest, rent.',
    'Only revenue receipts are income of the year. A loan received or the price of an old machine is not income.',
    'Bank loan ₹2,00,000: capital receipt. Sales ₹50,000 and commission ₹3,000: revenue receipts.',
    'Treating the sale of a fixed asset as sales of the business.'),
  card(4, 'fa-trading', 'formula', 'What is the cost of goods sold?',
    'Cost of goods sold = Opening stock + Net purchases + Direct expenses − Closing stock.',
    'It is the cost of the goods that were actually sold: what was available, less what is still unsold at the end. Net purchases means purchases less purchases return.',
    'Opening stock ₹20,000 + purchases ₹1,00,000 + wages ₹10,000 − closing stock ₹30,000 = ₹1,00,000.',
    'Adding the closing stock, or leaving out the direct expenses.'),
  card(5, 'fa-trading', 'formula', 'How is gross profit found?',
    'Gross profit = Net sales − Cost of goods sold. If cost is the larger, the result is a gross loss.',
    'Gross profit is the margin on trading, before any indirect expense or indirect income.',
    'Net sales ₹1,50,000 − cost of goods sold ₹1,00,000 = gross profit ₹50,000.',
    'Subtracting indirect expenses such as rent in the Trading Account.'),
  card(6, 'fa-trading', 'shortcut', 'How do you handle returns?',
    'Net sales = Sales − Sales return. Net purchases = Purchases − Purchases return. Work with the net figures.',
    'Goods sent back by customers reduce sales. Goods sent back to suppliers reduce purchases.',
    'Sales ₹3,00,000 with returns of ₹10,000: net sales ₹2,90,000.',
    'Adding a return to the figure it belongs with, or mixing up the two returns.'),
  card(7, 'fa-classify', 'rule', 'What makes an expense direct or indirect?',
    'A direct expense is a cost of buying or making the goods: wages, carriage inwards, freight, power and fuel. It is debited in the Trading Account. An indirect expense is a cost of selling or running the business: rent, salaries, advertisement, carriage outwards, discount allowed. It is debited in the Profit and Loss Account.',
    'The test is whether the cost brings the goods to a saleable state or only keeps the office and sales going. When a trial balance joins two heads, most textbooks go by the first word: "Wages and salaries" is taken to the Trading Account and "Salaries and wages" to the Profit and Loss Account.',
    'Carriage on goods bought is direct. Carriage on goods delivered to customers is indirect.',
    'Putting carriage outwards in the Trading Account because it has "carriage" in its name.'),
  card(8, 'fa-classify', 'rule', 'Where does each kind of item finally go?',
    'Trading debit: opening stock, purchases, direct expenses. Trading credit: net sales, closing stock. Profit and Loss debit: indirect expenses. Profit and Loss credit: gross profit, indirect incomes. Balance Sheet: assets, liabilities, capital (less drawings).',
    'Nominal accounts (expenses and incomes) are closed to the Trading and Profit and Loss Accounts. Real and personal account balances are carried to the Balance Sheet.',
    'Rent paid: Profit and Loss debit. Commission received: Profit and Loss credit. Debtors: Balance Sheet asset.',
    'Showing drawings as an expense. Drawings reduce capital in the Balance Sheet.'),
  card(9, 'fa-trading', 'rule', 'Where does closing stock appear in the final accounts?',
    'On the credit side of the Trading Account (reducing the cost of goods sold) and as a current asset in the Balance Sheet.',
    'It appears twice: once to find the correct cost of goods sold, and once because the unsold goods are still owned by the business. It is valued at the year end, so it is given outside the trial balance. If it is listed inside the trial balance, it has already been set off against purchases and is shown only in the Balance Sheet.',
    'Closing stock ₹30,000: credit in the Trading Account; asset ₹30,000 in the Balance Sheet.',
    'Showing it only in the Balance Sheet, which leaves the gross profit too low.'),
  card(10, 'fa-pl', 'formula', 'How is net profit found?',
    'Net profit = Gross profit − Indirect expenses + Indirect incomes. If expenses exceed gross profit plus incomes, the result is a net loss.',
    'The Profit and Loss Account starts from the gross profit, charges the running costs and adds the other incomes.',
    '₹50,000 − (₹12,000 + ₹18,000) + ₹5,000 = ₹25,000.',
    'Deducting an income, or deducting drawings. Drawings never enter the Profit and Loss Account.'),
  card(11, 'fa-pl', 'formula', 'What is operating profit?',
    'Operating profit = Net profit + Non-operating expenses − Non-operating incomes. Non-operating expenses: interest on loans, charity, a loss on the sale of a fixed asset, an abnormal loss such as loss by fire. Non-operating incomes: interest and dividends received, rent received, a profit on the sale of a fixed asset.',
    'It measures what the main activity earned, before finance costs and items that do not come from trading. It can also be built up as Gross profit − Operating expenses + Operating incomes.',
    'Net profit ₹25,000 with loan interest ₹4,000 and dividend received ₹2,000: operating profit = ₹25,000 + ₹4,000 − ₹2,000 = ₹27,000.',
    'Adjusting the net profit the wrong way. The non-operating expense is added back and the non-operating income is taken out.'),
  card(12, 'fa-pl', 'format', 'What does the Profit and Loss Account look like?',
    'Debit side: indirect expenses (rent, salaries, advertisement ...), then net profit. Credit side: gross profit, then indirect incomes (commission received, discount received ...). A gross loss goes on the debit side instead.',
    'The two sides total the same. The balancing figure is the net profit (or net loss).',
    'Dr: Rent 12,000; Salaries 18,000; Net profit 25,000 = 55,000. Cr: Gross profit 50,000; Commission 5,000 = 55,000.',
    'Putting gross profit on the debit side of a profitable year.'),
  card(13, 'fa-trading', 'format', 'What does the Trading Account look like?',
    'Debit side: opening stock, purchases less returns, direct expenses, gross profit (if the credit side is larger). Credit side: sales less returns, closing stock, gross loss (if the debit side is larger).',
    'The balancing figure is the gross profit or gross loss, transferred to the Profit and Loss Account.',
    'Dr: Opening stock 20,000; Purchases 1,00,000; Wages 10,000; Gross profit 50,000 = 1,80,000. Cr: Sales 1,50,000; Closing stock 30,000 = 1,80,000.',
    'Forgetting that the closing stock sits on the credit side.'),
  card(14, 'fa-balance-sheet', 'format', 'What does the Balance Sheet look like?',
    'Liabilities side: capital (opening + net profit − drawings), long-term liabilities, current liabilities. Assets side: fixed assets, then current assets (stock, debtors, bills receivable, bank, cash). Both sides total the same.',
    'It is a statement on a date, not an account. It shows what the business owns and what it owes, including the owner.',
    'Capital 1,15,000 + Creditors 35,000 = 1,50,000 = Furniture 60,000 + Stock 30,000 + Debtors 40,000 + Cash 20,000.',
    'Calling it an account, or showing opening capital without the profit and drawings.'),
  card(15, 'fa-balance-sheet', 'rule', 'How are assets and liabilities classified?',
    'Fixed assets are held for long use (land, building, machinery, furniture). Current assets turn into cash within the year (stock, debtors, bills receivable, bank, cash). Current liabilities are due within the year (creditors, bills payable, overdraft). Long-term liabilities fall due later (a loan for five years).',
    'The classification tells readers how much money is tied up and how soon debts must be paid.',
    'Bank loan repayable in five years is long-term; a bank overdraft is current.',
    'Treating closing stock as a fixed asset because it is held in the shop.'),
  card(16, 'fa-balance-sheet', 'rule', 'What are grouping and marshalling?',
    'Grouping puts items of a like kind under one head: fixed assets, current assets, long-term liabilities, current liabilities, capital. Marshalling arranges the groups, and the items in them, in a fixed order. Order of liquidity starts with cash and ends with land and building. Order of permanence starts with land and building and ends with cash.',
    'Grouping makes a long list readable; a set order helps readers compare statements and see quickly how liquid the business is.',
    'Order of liquidity: cash, bank, debtors, stock, furniture, machinery, building.',
    'Mixing the two orders in one Balance Sheet.'),
  card(17, 'fa-capital', 'formula', 'How is closing capital found?',
    'Closing capital = Opening capital + Additional capital + Net profit − Drawings. A net loss is deducted instead of a profit being added.',
    'Profit belongs to the owner, so it adds to capital. Drawings take value out, so they reduce it.',
    '₹1,00,000 + ₹25,000 − ₹10,000 = ₹1,15,000.',
    'Adding the drawings, or using gross profit instead of net profit.'),
  card(18, 'fa-capital', 'rule', 'What are the closing entries, in outline?',
    'Opening stock, purchases and direct expenses: Trading A/c Dr; To each of those accounts. Sales: Sales A/c Dr; To Trading A/c. Closing stock: Closing Stock A/c Dr; To Trading A/c. Gross profit: Trading A/c Dr; To Profit and Loss A/c. Indirect expenses: Profit and Loss A/c Dr; To the expense. Incomes: the income A/c Dr; To Profit and Loss A/c. Net profit: Profit and Loss A/c Dr; To Capital A/c. Drawings: Capital A/c Dr; To Drawings A/c.',
    'Closing entries clear the nominal accounts for the next year. Their balances are carried to the final accounts.',
    'Rent ₹12,000: Profit and Loss A/c Dr 12,000; To Rent A/c 12,000.',
    'Reversing the entry: a debit-balance account is closed by crediting it.'),
  card(19, 'fa-capital', 'shortcut', 'How can you check the closing capital?',
    'Closing capital = Total assets − Outside liabilities (creditors, bills payable, overdraft and loans).',
    'The Balance Sheet always balances, so what the owner is owed is what is left of the assets after outsiders are paid.',
    'Assets ₹1,50,000 − creditors ₹35,000 = closing capital ₹1,15,000.',
    'Deducting capital from the assets, or leaving the long-term loan out of the liabilities.'),
  // Added after the check against the CBSE 2025-26 syllabus (docs/syllabus-coverage.md), which names the meaning,
  // objectives and importance of financial statements and deferred revenue expenditure.
  card(20, 'fa-users', 'rule', 'What are financial statements, and why are they prepared?',
    'The statements prepared at the end of an accounting period from the trial balance: for a sole proprietor, the Trading and Profit and Loss Account (the result of the year) and the Balance Sheet (the position on the last day). Objectives: to find the profit or loss, to show the financial position, and to give the owner, lenders, tax authorities and others the information they need. Importance: they show whether the business pays its way, help plan the next year, support a loan or a tax return, and allow years to be compared.',
    'The trial balance only checks the books; the financial statements turn its balances into results that users can act on.',
    'A bank asked for a loan reads the Balance Sheet to judge the security and the Profit and Loss Account to judge whether the interest can be met.',
    'Counting the trial balance as one of the financial statements.'),
  card(21, 'fa-capital-revenue', 'rule', 'What is deferred revenue expenditure?',
    'Revenue expenditure of an unusually large amount whose benefit lasts for more than one year, such as a heavy advertising campaign to launch a product. It is written off over the years that benefit, and the part not yet written off is shown on the assets side of the balance sheet.',
    'It is revenue in nature (it buys no asset) but its benefit is spread, so the matching principle spreads the charge too. This is the treatment the CBSE syllabus asks for; under AS 26 a company now charges such outlay to the year in which it is spent, so a question on deferred revenue expenditure follows the syllabus unless it says otherwise.',
    'An advertising campaign of ₹3,00,000 expected to benefit three years: ₹1,00,000 is charged to the Profit and Loss Account each year, and ₹2,00,000 is carried forward at the end of the first year.',
    'Treating it as capital expenditure on an asset, or charging all of it to the year it is spent.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number) => `fa-q-${String(n).padStart(3, '0')}`;
const HINT_DEFAULT = ['Think about what the item is: a cost of the goods, a running cost, an income, an asset or a liability.', 'Recall the rule on the matching card.'];

function mcq(
  n: number, conceptId: string, difficulty: Difficulty, prompt: string, right: string, wrongs: [string, string][],
  explanation: string, hints: string[] = HINT_DEFAULT,
): McqQuestion {
  const options = wrongs.map(([text, why]) => ({ text, why }));
  const at = n % (options.length + 1);
  const all: { text: string; why?: string }[] = [...options];
  all.splice(at, 0, { text: right });
  const ids = 'abcdefgh';
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, hints, explanation,
    options: all.map((o, i) => ({ id: ids[i], text: o.text, ...(o.why ? { why: o.why } : {}) })),
    correct: ids[at],
  };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[] = HINT_DEFAULT): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, hints, explanation, correct,
});

const num = (
  n: number, conceptId: string, difficulty: Difficulty, prompt: string, answer: number, errors: [number, string][], working: string[],
  hints: string[] = ['Write the formula first, then put the figures in.', 'Check which items belong in this statement and which do not.'],
): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit: 'rupees', prompt, hints, explanation: working.join(' '),
  answer: rupees(answer), commonErrors: errors.map(([v, why]) => ({ value: rupees(v), why })), working,
});

const AR = [
  'Both A and R are true, and R explains A',
  'Both A and R are true, but R does not explain A',
  'A is true but R is false',
  'A is false but R is true',
];
/** The four choices stay in the order an examination paper prints them, so they are not placed by `mcq`. */
function assertionReason(n: number, conceptId: string, a: string, r: string, correctIdx: number, explanation: string, whys: string[]): McqQuestion {
  const ids = 'abcd';
  return {
    id: qid(n), topicId: T, conceptId, difficulty: 'medium', type: 'mcq',
    prompt: `Assertion (A): ${a}\nReason (R): ${r}\nWhich is correct?`,
    hints: ['Decide whether A is true by itself, then whether R is true by itself.', 'If both are true, ask whether R is the reason for A.'],
    explanation,
    options: AR.map((text, i) => ({ id: ids[i], text, ...(i === correctIdx ? {} : { why: whys[i] }) })),
    correct: ids[correctIdx],
  };
}

const questions: Question[] = [
  mcq(1, 'fa-users', 'easy', 'A bank has lent money to a business. What does it mainly want to learn from the financial statements?',
    'Whether the business can pay the interest and repay the loan',
    [['How much salary the manager draws', 'Took the bank as an insider interested in staff pay.'], ['Which goods sell best in the shop', 'Thought a lender studies the product range; that is for the management.'], ['Whether the owner has withdrawn cash for personal use', 'Looked at drawings alone and not at the ability to repay.']],
    'A lender wants to be repaid with interest, so it studies profit and the liabilities of the business.'),
  mcq(2, 'fa-users', 'easy', 'Which set of statements makes up the final accounts of a sole proprietor?',
    'Trading Account, Profit and Loss Account and Balance Sheet',
    [['Journal, Ledger and Trial Balance', 'Named the books and the trial balance, which come before the final accounts.'], ['Cash Book, Petty Cash Book and Purchases Book', 'Named subsidiary books; they record transactions and are not statements of the results.'], ['Trial Balance, Bank Reconciliation Statement and Cash Book', 'Named other statements prepared during the year, not the year-end results.']],
    'The Trading Account gives the gross profit, the Profit and Loss Account the net profit, and the Balance Sheet the position at the end of the year.'),
  tf(3, 'fa-trading', 'easy', 'The Trading Account is prepared to find the net profit of the business.', false,
    'The Trading Account finds the gross profit. The net profit comes from the Profit and Loss Account.'),
  mcq(4, 'fa-capital-revenue', 'easy', 'Which of these is capital expenditure?',
    'The price of a new machine together with its freight and installation',
    [['Repairs that keep an old machine running', 'Took routine repairs as the purchase of an asset; they only maintain what already exists.'], ['Salaries paid to the staff', 'Took a running cost as the purchase of an asset.'], ['Goods bought for resale', 'Took goods bought for sale as a lasting asset; they are a trading cost.']],
    'Expenditure on buying an asset, and on bringing it into use, benefits the business for years.'),
  tf(5, 'fa-capital-revenue', 'easy', 'Money spent on routine repairs to keep a machine working is revenue expenditure.', true,
    'Routine repairs only maintain the earning capacity; their benefit is used up within the year.'),
  tf(6, 'fa-capital-revenue', 'easy', 'The amount received from selling an old machine is a revenue receipt.', false,
    'The sale of a fixed asset is a capital receipt. It is not income from trading.'),
  mcq(7, 'fa-capital-revenue', 'easy', 'Which of these is a capital receipt?',
    'A bank loan taken for five years',
    [['Commission received for acting as an agent', 'Took an income of the year as a capital receipt.'], ['Sale of goods for cash', 'Took the regular earning of the business as a capital receipt.'], ['Interest received on a fixed deposit', 'Took interest earned as a capital receipt; it is income.']],
    'A loan of five years brings money in, but it must be paid back: it adds to the liabilities of the business and is not earned. That makes it a capital receipt. Commission, sales and interest are earned in running the business, so they are revenue receipts and go to the Trading or Profit and Loss Account.'),
  assertionReason(8, 'fa-capital-revenue',
    'Wages paid for installing a newly bought machine are capital expenditure.',
    'Costs needed to bring an asset into working condition form part of its cost.', 0,
    'Installation is needed before the machine can be used, so it is added to the machine\'s cost. R gives exactly that reason.',
    ['', 'Said R is not the reason; but the installation is capital expenditure because of R.', 'Thought R is false; it is the basic rule for the cost of an asset.', 'Thought A is false and treated installation wages as a running expense.']),
  mcq(9, 'fa-trading', 'easy', 'Which of these is NOT debited in the Trading Account?',
    'Rent of the shop',
    [['Carriage inwards', 'Took carriage inwards as an office cost; it is a direct expense and is debited in the Trading Account.'], ['Opening stock', 'Thought stock is a Balance Sheet item only; the opening stock is part of the cost of the goods.'], ['Purchases', 'Thought purchases are charged in the Profit and Loss Account; they are the main cost of goods sold.']],
    'Rent is an indirect expense and is debited in the Profit and Loss Account.'),
  mcq(10, 'fa-trading', 'easy', 'Cost of goods sold is calculated as:',
    'Opening stock + Net purchases + Direct expenses − Closing stock',
    [['Opening stock + Net purchases + Direct expenses + Closing stock', 'Added the closing stock; unsold goods must be taken out of the cost.'], ['Sales − Purchases', 'Ignored the stocks, the returns and the direct expenses.'], ['Opening stock + Net purchases + Indirect expenses − Closing stock', 'Used indirect expenses; only direct expenses belong in the cost of goods sold.']],
    'The cost of goods sold is what was available to sell, less the stock still unsold at the end.'),
  tf(11, 'fa-trading', 'easy', 'Closing stock is shown on the credit side of the Trading Account and also as an asset in the Balance Sheet.', true,
    'It reduces the cost of goods sold in the Trading Account, and it is still owned by the business, so it is also an asset.'),
  mcq(12, 'fa-trading', 'easy', 'Gross profit is:',
    'Net sales less cost of goods sold',
    [['Net sales less all the expenses of the business', 'Described the net profit, which is found after the indirect expenses.'], ['Sales less purchases', 'Ignored the opening and closing stock, the returns and the direct expenses.'], ['Cost of goods sold less net sales', 'Subtracted the wrong way round; that would be a gross loss when positive.']],
    'Gross profit is the margin on the goods sold, before any indirect expense or income.'),
  mcq(13, 'fa-classify', 'easy', 'Carriage inwards and carriage outwards are treated respectively as:',
    'A direct expense (Trading Account) and an indirect expense (Profit and Loss Account)',
    [['An indirect expense and a direct expense', 'Reversed the two: carriage inwards is on goods bought, outwards on goods sold.'], ['Both direct expenses', 'Put the cost of delivering goods to customers in the Trading Account.'], ['Both indirect expenses', 'Put the cost of bringing the purchases to the shop in the Profit and Loss Account.']],
    'Carriage inwards is part of the cost of the goods. Carriage outwards is a selling expense.'),
  tf(14, 'fa-trading', 'easy', 'Sales return is deducted from sales to find net sales.', true,
    'True. Goods sent back by customers were counted in the sales when they were sold, but the sale did not stand. So the return is deducted: sales ₹3,00,000 less returns ₹10,000 gives net sales of ₹2,90,000, the figure that goes to the credit side of the Trading Account.'),
  tf(15, 'fa-classify', 'easy', 'Wages paid to the workers who unload and stack the goods purchased are an indirect expense.', false,
    'Wages are a direct expense: they are a cost of getting the goods ready for sale, so they are debited in the Trading Account.'),
  mcq(16, 'fa-classify', 'easy', 'Which of these is an indirect income?',
    'Discount received from suppliers',
    [['Sales of goods', 'Took the main income as an indirect one; sales are credited in the Trading Account.'], ['Closing stock', 'Took the closing stock as an income; it only reduces the cost of goods sold.'], ['Capital brought in by the owner', 'Took capital as an income; it is a liability to the owner in the Balance Sheet.']],
    'Discount received is a gain that is credited in the Profit and Loss Account.'),
  mcq(17, 'fa-pl', 'easy', 'Net profit is found as:',
    'Gross profit − Indirect expenses + Indirect incomes',
    [['Gross profit + Indirect expenses − Indirect incomes', 'Swapped the expenses and the incomes.'], ['Gross profit − Indirect expenses − Indirect incomes', 'Deducted the incomes as if they were expenses.'], ['Net sales − Indirect expenses + Indirect incomes', 'Started from net sales and skipped the cost of goods sold.']],
    'The Profit and Loss Account starts from the gross profit. The indirect expenses (rent, salaries, advertisement) are its debit items, so they are deducted; the indirect incomes (commission, discount received) are its credit items, so they are added. Gross profit ₹50,000 − expenses ₹30,000 + commission ₹5,000 = net profit ₹25,000.'),
  tf(18, 'fa-pl', 'easy', 'Interest paid on a bank loan is debited to the Profit and Loss Account.', true,
    'True. Interest is the cost of using borrowed money for the year. It is not a cost of buying or making the goods, so it is not in the Trading Account; it is an indirect (financial) expense, debited to the Profit and Loss Account. The loan itself is a liability in the Balance Sheet.'),
  mcq(19, 'fa-capital', 'easy', 'At the end of the year the net profit is transferred to:',
    'The capital account of the proprietor',
    [['The Drawings account', 'Sent the profit to Drawings; drawings are the owner\'s withdrawals, not the profit.'], ['The Trading Account', 'Sent it back to the Trading Account, which comes before the Profit and Loss Account.'], ['The Sales account', 'Mixed up profit with the revenue of the business.']],
    'Profit belongs to the proprietor, so the Profit and Loss Account is closed to Capital A/c.'),
  num(20, 'fa-trading', 'medium',
    'Opening stock: ₹40,000\nPurchases: ₹2,00,000\nWages: ₹10,000\nSales: ₹3,00,000\nClosing stock: ₹50,000\nCalculate the gross profit.',
    100000,
    [[50000, 'Left out the closing stock.'], [110000, 'Left out the wages.'], [90000, 'Deducted the wages twice.']],
    ['Cost of goods sold = 40,000 + 2,00,000 + 10,000 − 50,000 = ₹2,00,000.', 'Gross profit = 3,00,000 − 2,00,000 = ₹1,00,000.']),
  num(21, 'fa-pl', 'medium',
    'Gross profit: ₹1,00,000\nSalaries: ₹30,000\nRent paid: ₹12,000\nCommission received: ₹8,000\nFind the net profit.',
    66000,
    [[58000, 'Left out the commission received.'], [50000, 'Deducted the commission as if it were an expense.'], [150000, 'Added the expenses instead of deducting them.']],
    ['Expenses = 30,000 + 12,000 = ₹42,000.', 'Net profit = 1,00,000 − 42,000 + 8,000 = ₹66,000.']),
  mcq(22, 'fa-balance-sheet', 'easy', 'In the order of liquidity, which of these assets is shown first?',
    'Cash in hand',
    [['Land and building', 'Used the order of permanence, which starts with land and building.'], ['Sundry debtors', 'Placed the debtors first; they still have to be collected in cash.'], ['Closing stock', 'Placed stock first; it has to be sold and collected before it becomes cash.']],
    'The order of liquidity starts with the asset that is most easily turned into cash.'),
  tf(23, 'fa-balance-sheet', 'easy', 'Marshalling means arranging the assets and liabilities in a fixed order in the Balance Sheet.', true,
    'True. Marshalling sets the groups, and the items in each group, in an order: the order of liquidity (cash first, land and building last) or the order of permanence (land and building first, cash last). Grouping, its partner, puts like items under one head such as fixed assets or current liabilities.'),
  mcq(24, 'fa-balance-sheet', 'easy', 'Which of these is a current liability?',
    'Bills payable',
    [['A bank loan repayable after five years', 'Took a long-term loan as due within the year.'], ['Capital', 'Took the owner\'s claim as a debt due within the year.'], ['Sundry debtors', 'Took an asset (money owed to the business) as a liability.']],
    'A bill payable falls due within a short period, so it is a current liability.'),
  tf(25, 'fa-balance-sheet', 'easy', 'Drawings are shown as an asset in the Balance Sheet.', false,
    'Drawings are deducted from capital. They are not an asset and not an expense.'),
  mcq(26, 'fa-balance-sheet', 'easy', 'Which of these is a fixed asset?',
    'Furniture used in the shop',
    [['Closing stock', 'Took goods held for sale as a fixed asset.'], ['Sundry debtors', 'Took money to be collected soon as a fixed asset.'], ['Bills receivable', 'Took a bill that will be cashed soon as a fixed asset.']],
    'Furniture is held for use in the business over many years, not for sale, so it is a fixed asset. Closing stock is held for sale, and debtors and bills receivable turn into cash within the year: all three are current assets.'),
  num(27, 'fa-capital', 'medium',
    'Opening capital: ₹3,00,000\nAdditional capital introduced: ₹50,000\nNet profit: ₹80,000\nDrawings: ₹30,000\nFind the closing capital.',
    400000,
    [[460000, 'Added the drawings instead of deducting them.'], [430000, 'Forgot to deduct the drawings.'], [350000, 'Left out the additional capital.']],
    ['Closing capital = 3,00,000 + 50,000 + 80,000 − 30,000.', '= ₹4,00,000.']),
  tf(28, 'fa-capital', 'easy', 'Net profit increases the proprietor\'s capital, and drawings reduce it.', true,
    'Profit belongs to the owner and adds to capital. Drawings take value out.'),
  mcq(29, 'fa-capital', 'medium', 'Which closing entry is passed for Sales at the end of the year?',
    'Sales A/c Dr; To Trading A/c',
    [['Trading A/c Dr; To Sales A/c', 'Reversed the entry: sales has a credit balance, so it is closed by a debit.'], ['Sales A/c Dr; To Profit and Loss A/c', 'Sent sales to the Profit and Loss Account; sales belong in the Trading Account.'], ['Capital A/c Dr; To Sales A/c', 'Sent sales straight to capital instead of through the final accounts.']],
    'An income with a credit balance is debited to close it, and the Trading Account is credited.'),
  assertionReason(30, 'fa-classify',
    'Gross profit is found before indirect expenses are charged.',
    'Indirect expenses are not connected with buying or making the goods.', 0,
    'The Trading Account only holds the costs of the goods. Indirect expenses are charged later, in the Profit and Loss Account.',
    ['', 'Said R is not the explanation; but it is the reason indirect expenses wait for the Profit and Loss Account.', 'Thought R is false, so treated rent and salaries as costs of the goods.', 'Thought A is false and put indirect expenses in the Trading Account.']),
  tf(31, 'fa-balance-sheet', 'easy', 'The Balance Sheet is an account kept in the ledger.', false,
    'It is a statement prepared on a date. It is not an account and has no debit or credit entries.'),
  mcq(32, 'fa-trading', 'easy', 'Goods sent back by customers are recorded as:',
    'Sales return',
    [['Purchases return', 'Took them as goods sent back to a supplier.'], ['Discount allowed', 'Took the return of goods as a price reduction.'], ['Carriage inwards', 'Took the return of goods as a transport cost.']],
    'Goods sent back by customers are a sales return, also called returns inwards because the goods come back in. They are deducted from sales. Goods the business sends back to its suppliers are a purchases return (returns outwards), deducted from purchases.'),
  mcq(33, 'fa-pl', 'medium', 'Operating profit leaves out interest, dividends, rent received, charity and any profit or loss on the sale of a fixed asset. Which of these is a non-operating item?',
    'Dividend received on shares held by the business',
    [['Salaries paid to the staff', 'Took a regular cost of running the business as non-operating.'], ['Advertisement expenses', 'Took a selling expense of the main activity as non-operating.'], ['Rent paid for the shop', 'Mixed up rent paid with rent received. Rent paid for the shop is a regular running cost; only rent received is non-operating.']],
    'A dividend is earned on an investment, not from buying and selling goods, so it is left out of operating profit.'),
];

// ---------------------------------------------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------------------------------------------

const SORT = ['fa-direct-indirect', 'fa-statement-side', 'fa-capital-revenue-exp', 'fa-capital-revenue-receipt', 'fa-bs-classify', 'fa-user-need', 'fa-marshalling'];
const FIRST = ['fa-net-sales', 'fa-gp-basic', 'fa-cogs-basic', 'fa-np-basic', 'fa-closing-capital-basic', 'fa-bs-assets-total'];
const TRADING = ['fa-gp-returns', 'fa-cogs-returns', 'fa-gp-missing', 'fa-gross-result', 'fa-stock-effect'];
const PROFIT = ['fa-np-from-tb', 'fa-np-missing', 'fa-operating-profit', 'fa-net-result'];
const POSITION = ['fa-bs-total-capital', 'fa-closing-capital-extra', 'fa-group-total', 'fa-working-capital', 'fa-bs-balance', 'fa-opening-capital', 'fa-closing-entry'];
const COMPLEX = [
  'fa-complex-gp', 'fa-complex-np', 'fa-complex-closing-capital', 'fa-complex-bs-total', 'fa-complex-current-assets',
  'fa-complex-operating', 'fa-complex-result', 'fa-complex-markup',
];

const levels = buildLadder(T, {
  concept: {
    title: 'What Are Final Accounts?',
    description: 'Follow one year of a small business from the cost of its goods to what it owns and owes.',
    lesson: [
      {
        type: 'text',
        heading: 'Three questions at the end of the year',
        body: 'At the end of the year the owner asks: how much did I earn on the goods themselves? How much is left after running the business? What does the business now own and owe? The Trading Account answers the first (gross profit), the Profit and Loss Account the second (net profit) and the Balance Sheet the third. Together they are the final accounts. Owners, lenders, suppliers, employees and the tax department all read them, each for a different answer.',
      },
      {
        type: 'text',
        heading: 'Capital or revenue',
        body: 'Money spent on a lasting asset, or on getting it ready for use, is capital expenditure and goes to the Balance Sheet. Money spent on running the business within the year, such as rent, salaries and routine repairs, is revenue expenditure and is charged against the year\'s profit. Receipts follow the same idea: a loan or the sale of a machine is a capital receipt; sales and commission are revenue receipts.',
      },
      {
        type: 'text',
        heading: 'The Trading Account: the story of the goods',
        body: 'Start with the stock at the beginning, add what was bought (less returns) and the direct expenses such as wages and carriage inwards, and take away the stock still unsold. That is the cost of goods sold. Opening stock ₹20,000 + purchases ₹1,00,000 + wages ₹10,000 − closing stock ₹30,000 = ₹1,00,000. Net sales of ₹1,50,000 less that cost leaves a gross profit of ₹50,000.',
      },
      {
        type: 'table',
        title: 'Joshi Hardware, Nagpur: Trading Account for the year ended 31 March 2026, in short',
        rows: [
          { label: 'Debit side' },
          { label: 'Opening stock', amount: '₹40,000' },
          { label: 'Purchases ₹3,20,000 less purchases return ₹10,000', amount: '₹3,10,000' },
          { label: 'Carriage inwards', amount: '₹8,000' },
          { label: 'Freight inwards', amount: '₹7,000' },
          { label: 'Gross profit c/d', amount: '₹1,55,000' },
          { label: 'Total', amount: '₹5,20,000', total: true },
          { label: 'Credit side' },
          { label: 'Sales ₹4,80,000 less sales return ₹15,000', amount: '₹4,65,000' },
          { label: 'Closing stock (valued on 31 March, given below the trial balance)', amount: '₹55,000' },
          { label: 'Total', amount: '₹5,20,000', total: true },
        ],
        note: 'The trial balance also lists rent ₹24,000, salaries ₹36,000, carriage outwards ₹5,000, interest on bank loan ₹6,000, charity ₹2,000, commission received ₹6,000, interest received ₹3,000, the capital, the drawings, the assets and the liabilities. None of them is a cost of the goods or a sale, so none is in the Trading Account.',
      },
      {
        type: 'working',
        title: 'Why each line of the trial balance goes where it does',
        lines: [
          'Opening stock ₹40,000: goods on hand on 1 April, part of what was there to sell, so it is debited.',
          'Purchases ₹3,20,000 less the ₹10,000 sent back to suppliers: only ₹3,10,000 of goods were kept, so the net figure is debited.',
          'Carriage inwards ₹8,000 and freight inwards ₹7,000 bring the goods to the shop: costs of the goods, debited here.',
          'Sales ₹4,80,000 less the ₹15,000 customers returned: ₹4,65,000 of sales stood, credited.',
          'Closing stock ₹55,000 is still unsold, so it is taken out of the cost by crediting it.',
          'Cost of goods sold = 40,000 + 3,10,000 + 8,000 + 7,000 − 55,000 = ₹3,10,000. Gross profit = 4,65,000 − 3,10,000 = ₹1,55,000.',
        ],
        note: 'Watch out: carriage outwards is paid to deliver goods to customers, a selling expense for the Profit and Loss Account. And if a trial balance already lists the closing stock beside "adjusted purchases", that stock is not credited again: it goes to the Balance Sheet only.',
      },
      {
        type: 'text',
        heading: 'Profit and Loss, then the Balance Sheet',
        body: 'Carry the gross profit to the Profit and Loss Account. Take away the indirect expenses (rent ₹12,000, salaries ₹18,000) and add the indirect incomes (commission ₹5,000): net profit ₹25,000. The net profit is added to the owner\'s capital and the drawings (₹10,000) are deducted: ₹1,00,000 + ₹25,000 − ₹10,000 = ₹1,15,000 closing capital. The Balance Sheet then lists what the business owns against what it owes to outsiders and to the owner, and the two sides are equal.',
      },
      {
        type: 'working',
        title: 'Joshi Hardware: net profit and operating profit',
        lines: [
          'Credit side: gross profit ₹1,55,000 brought down, commission received ₹6,000 and interest received ₹3,000 = ₹1,64,000.',
          'Debit side: rent ₹24,000, salaries ₹36,000, carriage outwards ₹5,000, interest on bank loan ₹6,000 and charity ₹2,000 = ₹73,000.',
          'Net profit = ₹1,64,000 − ₹73,000 = ₹91,000, carried to the capital.',
          'Interest on the loan and charity do not come from buying and selling hardware, and neither does the interest received: they are non-operating.',
          'Operating profit = ₹91,000 + ₹6,000 + ₹2,000 − ₹3,000 = ₹96,000. Check: ₹1,55,000 − (₹24,000 + ₹36,000 + ₹5,000) + ₹6,000 = ₹96,000.',
        ],
        note: 'Watch out: the drawings never enter the Profit and Loss Account. They are taken off the capital in the Balance Sheet.',
      },
      {
        type: 'table',
        title: 'Joshi Hardware: Balance Sheet as at 31 March 2026, grouped, in the order of permanence',
        rows: [
          { label: 'Liabilities' },
          { label: 'Capital ₹3,00,000 + net profit ₹91,000 − drawings ₹30,000', amount: '₹3,61,000' },
          { label: 'Long-term liabilities: bank loan repayable in 2031', amount: '₹60,000' },
          { label: 'Current liabilities: sundry creditors', amount: '₹45,000' },
          { label: 'Current liabilities: bills payable', amount: '₹14,000' },
          { label: 'Total', amount: '₹4,80,000', total: true },
          { label: 'Assets' },
          { label: 'Fixed assets: delivery van', amount: '₹1,50,000' },
          { label: 'Fixed assets: furniture', amount: '₹60,000' },
          { label: 'Current assets: closing stock', amount: '₹55,000' },
          { label: 'Current assets: sundry debtors', amount: '₹1,10,000' },
          { label: 'Current assets: bills receivable', amount: '₹25,000' },
          { label: 'Current assets: cash at bank', amount: '₹70,000' },
          { label: 'Current assets: cash in hand', amount: '₹10,000' },
          { label: 'Total', amount: '₹4,80,000', total: true },
        ],
        note: 'Grouping puts like items under one head (fixed assets, current assets, long-term and current liabilities); marshalling fixes the order. In the order of liquidity both lists are read from the other end: cash in hand first, and the capital last. Watch out: the closing stock is an asset here although it was not in the trial balance; the opening stock is not.',
      },
      { type: 'check', questionId: qid(9) },
      { type: 'check', questionId: qid(17) },
    ],
  },
  cards: {
    title: 'Formulas and Formats',
    description: 'Recall the formulas, the formats and the rules for sorting items.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Statements and Items',
      description: 'Users, capital and revenue items, and what belongs where.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 16].map(qid),
    },
    {
      title: 'Reading the Accounts',
      description: 'Definitions, formulas, closing entries and a few short calculations.',
      questionIds: [9, 10, 12, 13, 17, 20, 21, 24, 27, 29, 30, 33].map(qid),
      type: 'method_recognition',
    },
  ],
  practice: [
    { title: 'Sorting Items', description: 'Direct or indirect, which statement, capital or revenue, and how the Balance Sheet is arranged.', templateIds: SORT, count: 8 },
    { title: 'First Calculations', description: 'Net sales, gross profit, cost of goods sold, net profit, closing capital and total assets.', templateIds: FIRST, count: 8 },
    { title: 'Trading Account Practice', description: 'Returns, missing figures, gross profit or loss and the effect of closing stock.', templateIds: TRADING, count: 6 },
    { title: 'Profit and Loss Practice', description: 'Net profit from a list, a missing item, operating profit and the result of the account.', templateIds: PROFIT, count: 6 },
    { title: 'Balance Sheet and Capital', description: 'Totals, working capital, opening and closing capital and closing entries.', templateIds: POSITION, count: 7 },
    { title: 'Complex Final Accounts', description: 'Longer lists with returns and extra balances that do not belong, in the style of an examination.', templateIds: COMPLEX, count: 6 },
  ],
  mixed: { title: 'Mixed Practice', description: 'Everything in this topic, shuffled the way an exam serves it.', count: 10 },
  challenge: { title: 'Challenge: Final Accounts', description: 'The hardest questions of the topic, against the clock.', count: 8 },
  sets: [
    {
      title: 'Pass the Closing Entries',
      description: 'The entries of 31 March that close the ledger: into the Trading Account up to the gross profit, then into the Profit and Loss Account and capital.',
      templateIds: ['fa-set-trading-closing', 'fa-set-pl-closing'],
      count: 4,
    },
    {
      title: 'Close the Books of the Year',
      description: 'Every closing entry of one year in a single journal, from the returns to the drawings, with the gross and the net profit worked out on the way.',
      templateIds: ['fa-set-year-end-closing'],
      count: 4,
    },
  ],
  formats: [
    {
      title: 'Prepare the Trading and the Profit and Loss Account',
      description: 'From a trial balance and the closing stock, set out the Trading Account and then the Profit and Loss Account row by row, leaving out every balance that belongs elsewhere; and a Trading Account from a trial balance whose purchases are already adjusted for the stock.',
      // fa-fmt-trading-adjusted was added in the quality pass (the closing stock inside the trial balance).
      templateIds: ['fa-fmt-trading', 'fa-fmt-pl', 'fa-fmt-trading-adjusted'],
      count: 4,
    },
    {
      title: 'Prepare the Balance Sheet, and a Year That Ends in a Loss',
      description: 'The Balance Sheet, with the capital worked out and the solution set out in the order of liquidity or of permanence, and the accounts of a year in which the closing row falls on the other side.',
      templateIds: ['fa-fmt-balance-sheet', 'fa-fmt-loss'],
      count: 4,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Financial statements (meaning, objectives, importance) and deferred revenue expenditure, added after the check
// against the CBSE 2025-26 syllabus: a level of its own after every other level, with an id of its own, so no level
// a learner has passed moves.
// ---------------------------------------------------------------------------------------------------------------

const statementQuestions: Question[] = [
  tf(34, 'fa-users', 'easy', 'True or false: the trial balance is one of the financial statements.', false,
    'False. The trial balance checks the arithmetic of the ledger. The financial statements are the Trading and Profit and Loss Account and the Balance Sheet.'),
  mcq(35, 'fa-users', 'medium', 'Why do lenders and the tax department ask for the financial statements of a business?', 'They show the result of the year and the position at its end, on which their decisions rest', [
    ['They list every transaction of the year one by one', 'The statements summarise; the transactions are in the books.'],
    ['They prove that the books contain no errors', 'Even a trial balance that agrees does not prove that; the statements are not a proof of accuracy.'],
    ['They show the market value of the business', 'Assets are shown at cost less depreciation, not at market value.'],
  ], 'A lender judges security and the ability to pay from the position and the profit; the tax department works out tax on the profit.'),
  mcq(36, 'fa-capital-revenue', 'medium', 'Deferred revenue expenditure of ₹1,80,000 is to be written off over three years. How much is carried forward at the end of the first year?', '₹1,20,000', [
    ['₹60,000', 'Gave the amount written off in the year, not the balance carried forward.'],
    ['₹1,80,000', 'Carried the whole amount forward, as if nothing had been written off.'],
    ['Nil', 'Wrote off the whole amount in the first year, though its benefit lasts three.'],
  ], 'Written off each year = ₹1,80,000 ÷ 3 = ₹60,000. Carried forward = ₹1,80,000 - ₹60,000 = ₹1,20,000, on the assets side.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Distinguish and explain, added in the quality pass: a level of its own after every other level.
// ---------------------------------------------------------------------------------------------------------------

const H_DISTINGUISH = ['What question does each statement answer: the margin on the goods, the result after running the business, or the position on a date?', 'Trading Account: gross profit. Profit and Loss Account: net profit. Balance Sheet: what is owned and owed on one date.'];
const distinguishQuestions: Question[] = [
  mcq(37, 'fa-trading', 'medium', 'Which statement best tells the Trading Account apart from the Profit and Loss Account?', 'The Trading Account matches sales with the cost of the goods sold; the Profit and Loss Account matches the gross profit and other incomes with the running expenses', [
    ['The Trading Account is prepared on a date; the Profit and Loss Account for a period', 'Both are prepared for a period; only the Balance Sheet is prepared on a date.'],
    ['The Trading Account records cash items only; the Profit and Loss Account records credit items', 'Both take every item of their kind, whether paid in cash or not.'],
    ['The Trading Account shows the net profit; the Profit and Loss Account shows the gross profit', 'Swapped the two results: the Trading Account ends in the gross profit.'],
  ], 'The Trading Account deals only with the goods: opening stock, net purchases, direct expenses, net sales and closing stock, ending in the gross profit. The Profit and Loss Account starts from that gross profit, charges the indirect expenses, adds the other incomes and ends in the net profit.', H_DISTINGUISH),
  mcq(38, 'fa-pl', 'medium', 'Gross profit and net profit differ because:', 'Net profit is what is left of the gross profit after the indirect expenses, with the other incomes added', [
    ['Gross profit includes the drawings and net profit does not', 'Drawings enter neither profit; they reduce the capital.'],
    ['Gross profit is worked out before the closing stock is counted', 'The closing stock is counted in finding the gross profit itself.'],
    ['Net profit is always the larger of the two', 'Indirect expenses are usually larger than other incomes, so net profit is usually the smaller.'],
  ], 'Gross profit = net sales − cost of goods sold, the margin on trading. Net profit = gross profit − indirect expenses + indirect incomes, the result of the whole business. A shop with a gross profit of ₹1,55,000, expenses of ₹73,000 and other incomes of ₹9,000 has a net profit of ₹91,000.', H_DISTINGUISH),
  mcq(39, 'fa-balance-sheet', 'medium', 'Why is a Balance Sheet important to the owner and to outsiders?', 'It shows what the business owns and owes on the last day, from which its solvency and the owner\'s capital can be judged', [
    ['It shows the profit earned from the sale of goods during the year', 'That is the work of the Trading Account.'],
    ['It proves that the ledger has no errors', 'A Balance Sheet that agrees does not prove the books are free of errors.'],
    ['It shows the market value at which the business could be sold', 'Assets are shown at cost less depreciation, not at what they would fetch.'],
  ], 'The Balance Sheet lists the assets, the liabilities and the capital on one date. A lender judges the security for a loan from it, a supplier whether the current assets cover the current liabilities, and the owner how much of the business is truly the owner\'s.', H_DISTINGUISH),
  mcq(40, 'fa-balance-sheet', 'medium', 'How does a Balance Sheet differ from a trial balance?', 'A trial balance lists every ledger balance to check the arithmetic; a Balance Sheet shows only assets, liabilities and capital after the profit is found', [
    ['A trial balance is prepared after the Balance Sheet', 'The trial balance comes first: the final accounts are drawn from it.'],
    ['A Balance Sheet includes expenses and incomes as well', 'Expenses and incomes are closed to the Trading and Profit and Loss Account before the Balance Sheet.'],
    ['They are the same statement under two names', 'They differ in purpose and in what they hold.'],
  ], 'The trial balance holds every balance, nominal ones included, in debit and credit columns, to check that the ledger agrees. The Balance Sheet is prepared after the Trading and Profit and Loss Account and holds only the real and personal balances, with the capital after the profit and the drawings.', H_DISTINGUISH),
  mcq(41, 'fa-classify', 'medium', 'Why are direct expenses charged to the Trading Account and indirect expenses to the Profit and Loss Account?', 'Direct expenses are part of the cost of the goods, so they decide the gross profit; indirect expenses are costs of selling and running the business', [
    ['Direct expenses are paid in cash and indirect expenses on credit', 'How an expense is paid does not decide where it goes.'],
    ['Direct expenses are larger than indirect expenses', 'Size does not decide it; what the expense pays for does.'],
    ['Indirect expenses belong to the next year', 'Both belong to the year they are incurred in.'],
  ], 'Wages, carriage inwards, freight and import duty are spent to buy the goods or make them ready for sale, so they belong in the cost of goods sold. Rent of the office, salaries, advertisement and carriage outwards keep the business running and selling, so they are charged after the gross profit.', H_DISTINGUISH),
  mcq(42, 'fa-capital', 'medium', 'Why are closing entries passed at the end of the year?', 'To transfer the balances of the expense, income, purchase and sale accounts to the Trading and Profit and Loss Account, so those accounts start the next year at nil', [
    ['To carry the balances of all accounts to the next year', 'Only real and personal accounts carry their balances forward; nominal accounts are closed.'],
    ['To correct the errors found in the trial balance', 'Errors are put right by rectifying entries, not closing entries.'],
    ['To record the transactions that were left out of the journal', 'Omitted transactions are journalised as usual; closing entries only transfer balances.'],
  ], 'Each year measures its own profit, so the nominal accounts are closed into the Trading and Profit and Loss Account, which is in turn closed to the capital. Rent of ₹24,000: Profit and Loss A/c Dr ₹24,000; To Rent A/c ₹24,000.', H_DISTINGUISH),
  mcq(43, 'fa-balance-sheet', 'medium', 'What is meant by the grouping of assets and liabilities?', 'Showing items of a like kind together under one head, such as fixed assets, current assets, long-term liabilities and current liabilities', [
    ['Showing the assets in the order in which they were bought', 'The date of purchase decides nothing in a Balance Sheet.'],
    ['Adding all the assets into one figure', 'Grouping keeps the items, under heads; it does not merge them into one line.'],
    ['Arranging the items in the order of liquidity or permanence', 'That is marshalling, the partner of grouping.'],
  ], 'Grouping makes a long Balance Sheet readable: furniture, machinery and building stand under fixed assets; stock, debtors, bank and cash under current assets. Marshalling then decides the order of the groups and of the items in them.', H_DISTINGUISH),
];

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'statements-deferred',
        type: 'method_recognition',
        title: 'Financial Statements and Deferred Revenue Expenditure',
        description: 'What the financial statements are, why they are prepared and who relies on each, and deferred revenue expenditure written off over its years.',
        questionIds: statementQuestions.map((q) => q.id),
        generate: { templateIds: ['fa-statements-meaning', 'fa-statements-importance', 'fa-deferred-classify', 'fa-deferred-where', 'fa-deferred-amount'], count: 8 },
      },
      // Added in the quality pass.
      {
        name: 'heads-and-order',
        type: 'medium_practice',
        title: 'Combined Heads and the Order of the Balance Sheet',
        description: 'Joined heads such as "wages and salaries", factory and office items, duties and royalty, and the order of the assets under liquidity and permanence.',
        generate: { templateIds: ['fa-heads-combined', 'fa-marshalling-order'], count: 8 },
      },
      {
        name: 'stock-in-trial-balance',
        type: 'complex_practice',
        title: 'Closing Stock inside the Trial Balance',
        description: 'Adjusted purchases and the closing stock listed in the trial balance: the cost of goods sold and the gross profit without counting the stock twice.',
        generate: { templateIds: ['fa-complex-gp-adjusted'], count: 6 },
      },
      {
        name: 'distinguish',
        type: 'method_recognition',
        title: 'Distinguish and Explain',
        description: 'Trading Account and Profit and Loss Account, gross and net profit, the Balance Sheet and the trial balance, grouping, and why closing entries are passed.',
        questionIds: distinguishQuestions.map((q) => q.id),
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'Two statements on this topic: decide whether each is true, and whether the Reason explains the Assertion.',
        generate: { templateIds: ['fa-assertion-reason'], count: 8 },
      },
    ]),
  ],
  questions: [...questions, ...statementQuestions, ...distinguishQuestions],
};

export default pack;
