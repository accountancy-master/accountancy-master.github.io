import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, NumericUnit, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'accounting-ratios';

const concepts: Concept[] = [
  { id: 'ar-meaning', topicId: T, title: 'Meaning, objectives, advantages and limitations of ratio analysis' },
  { id: 'ar-liquidity', topicId: T, title: 'Liquidity ratios: current ratio and quick ratio' },
  { id: 'ar-solvency', topicId: T, title: 'Solvency ratios' },
  { id: 'ar-activity', topicId: T, title: 'Activity (turnover) ratios' },
  { id: 'ar-profitability', topicId: T, title: 'Profitability ratios' },
  { id: 'ar-effect', topicId: T, title: 'Effect of a transaction on a ratio' },
  { id: 'ar-missing', topicId: T, title: 'Finding a missing figure from a ratio' },
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
): Card => ({ id: `ar-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'ar-meaning', 'rule', 'What is an accounting ratio, and in what forms is it expressed?',
    'An arithmetical relationship between two related accounting figures. It is expressed as a pure ratio (2 : 1), a percentage (25%), a number of times (6 times) or a fraction.',
    'The two figures must have something to do with each other: current assets with current liabilities, profit with revenue. A ratio of unrelated figures means nothing.',
    'Current assets ₹4,00,000 and current liabilities ₹2,00,000 give a current ratio of 2 : 1. Gross profit ₹50,000 on revenue of ₹2,00,000 is a gross profit ratio of 25%.',
    'Writing a turnover ratio as a percentage, or a profit ratio as "times". Liquidity and solvency ratios are pure ratios (x : 1), with one exception: the interest coverage ratio, a solvency ratio, is in times. Turnover ratios are in times, profitability ratios are percentages.'),
  card(2, 'ar-meaning', 'rule', 'What are the objectives and advantages of ratio analysis?',
    'It simplifies the figures of the financial statements, shows liquidity, solvency, efficiency and profitability, allows comparison over the years and with other firms, locates weak spots, and helps in planning and forecasting.',
    'A single figure such as "profit ₹5,00,000" says little. Set against revenue or capital employed, and against last year or a competitor, it starts to tell a story.',
    'A net profit ratio of 8% this year against 12% last year points to costs that need looking into, although the profit in rupees may have gone up.',
    'Treating a ratio as an answer. It only points to where to look; the reasons have to be found from further inquiry.'),
  card(3, 'ar-meaning', 'rule', 'What are the limitations of ratio analysis?',
    'It rests on the financial statements and carries their limits: historical figures, price-level changes ignored, qualitative factors ignored, window dressing possible. Different accounting policies make firms hard to compare, there are no universal standards, and a single ratio means little by itself.',
    'Ratios are worked out from accounting figures, so whatever weakens those figures weakens the ratios.',
    'Two firms with the same machinery show different net profit ratios only because one charges depreciation by the straight line method and the other by the written down value method.',
    'Comparing the ratios of two firms without checking that they follow the same accounting policies and belong to the same industry.'),
  card(4, 'ar-meaning', 'rule', 'What are the four groups of ratios, and what does each measure?',
    'Liquidity ratios: ability to pay short-term debts. Solvency ratios: ability to meet long-term debts and interest. Activity (turnover) ratios: how efficiently resources are used. Profitability ratios: profit in relation to revenue or capital employed.',
    'Liquidity: current, quick. Solvency: debt to equity, total assets to debt, proprietary, interest coverage, debt to capital employed. Activity: inventory, trade receivables, trade payables, fixed assets, net assets and working capital turnover. Profitability: gross profit, operating, operating profit, net profit, return on investment.',
    'A bank giving a six-month loan looks at the current ratio; a debentureholder looks at the debt to equity and interest coverage ratios.',
    'Classing the operating ratio as an activity ratio because of its name. It is a profitability ratio: it shows cost as a percentage of revenue.'),
  card(5, 'ar-liquidity', 'formula', 'What is the current ratio and what goes into it?',
    'Current ratio = Current assets ÷ Current liabilities. Current assets: current investments, inventories, trade receivables, cash and cash equivalents, short-term loans and advances, other current assets. Current liabilities: short-term borrowings, trade payables, other current liabilities, short-term provisions.',
    'It shows how many rupees of current assets stand behind each rupee that falls due within a year. Current assets less current liabilities is the working capital.',
    'Current assets ₹5,00,000 and current liabilities ₹2,00,000: current ratio = 2.5 : 1; working capital = ₹3,00,000.',
    'Putting long-term borrowings among the current liabilities, or non-current investments among the current assets.'),
  card(6, 'ar-liquidity', 'formula', 'What is the quick ratio and what are quick assets?',
    'Quick ratio = Quick assets ÷ Current liabilities, where quick assets = Current assets − Inventories − Prepaid expenses. It is also called the liquid ratio or acid-test ratio.',
    'Inventories have to be sold first, and prepaid expenses never turn into cash, so both are left out. The denominator is the whole of the current liabilities.',
    'Current assets ₹5,00,000 including inventories ₹1,80,000 and prepaid expenses ₹20,000; current liabilities ₹2,00,000: quick assets ₹3,00,000, quick ratio 1.5 : 1.',
    'Leaving the inventories in (that gives the current ratio), or taking out the inventories and forgetting the prepaid expenses.'),
  card(7, 'ar-solvency', 'formula', 'What is the debt to equity ratio, and what are debt and equity?',
    "Debt to equity ratio = Debt ÷ Equity. Debt = long-term borrowings + long-term provisions. Equity = shareholders' funds = share capital + reserves and surplus.",
    "It compares the long-term funds lent by outsiders with the funds of the owners. Shareholders' funds can also be found as total assets less all outside liabilities, non-current and current.",
    'Long-term borrowings ₹4,00,000, long-term provisions ₹50,000, share capital ₹5,00,000, reserves and surplus ₹2,50,000: 4,50,000 ÷ 7,50,000 = 0.6 : 1.',
    'Counting short-term borrowings or trade payables as debt. They are current liabilities and stay out of this ratio.'),
  card(8, 'ar-solvency', 'formula', 'What are the total assets to debt ratio and the proprietary ratio?',
    "Total assets to debt ratio = Total assets ÷ Debt. Proprietary ratio = Shareholders' funds ÷ Total assets.",
    'The first shows the cover that all the assets give to the long-term lenders; the second shows what part of the assets the owners have financed. Total assets = non-current assets + current assets = total of equity and liabilities. The proprietary ratio is taken here on total assets, as CBSE marking schemes take it; it is sometimes worked on capital employed (net assets) instead, so a question says which base it uses.',
    "Total assets ₹12,00,000, debt ₹4,00,000, shareholders' funds ₹6,00,000: total assets to debt ratio 3 : 1; proprietary ratio 0.5 : 1.",
    'Using only the non-current assets as "total assets", or dividing total assets by all liabilities instead of by the long-term debt.'),
  card(9, 'ar-solvency', 'formula', 'What is the interest coverage ratio?',
    'Interest coverage ratio = Profit before interest and tax ÷ Interest on long-term debt, in times.',
    'Interest is paid out of profit before interest and tax. Starting from the profit after tax, add back the tax and then the interest.',
    'Profit after tax ₹2,10,000, tax ₹90,000, interest on debentures ₹60,000: profit before interest and tax ₹3,60,000; coverage = 3,60,000 ÷ 60,000 = 6 times.',
    'Dividing the profit after tax, or the profit before tax, by the interest without adding the interest back.'),
  card(10, 'ar-solvency', 'formula', 'How is capital employed found, and what is the debt to capital employed ratio?',
    "Capital employed = Shareholders' funds + Non-current liabilities, or = Non-current assets + Working capital. Debt to capital employed ratio = Debt ÷ Capital employed.",
    'Both routes give the same figure because total assets equal equity plus all liabilities: taking current liabilities off both sides leaves capital employed. It is also called net assets.',
    "Shareholders' funds ₹6,00,000 and long-term debt ₹2,00,000: capital employed ₹8,00,000; debt to capital employed ratio = 0.25 : 1.",
    'Adding current assets to non-current assets without deducting the current liabilities: that is total assets, not capital employed.'),
  card(11, 'ar-activity', 'formula', 'What is the inventory turnover ratio, and how is the cost of revenue from operations found?',
    'Inventory turnover ratio = Cost of revenue from operations ÷ Average inventory, in times. Average inventory = (Opening + Closing) ÷ 2. Cost of revenue from operations = Opening inventory + Net purchases + Direct expenses − Closing inventory, or = Revenue from operations − Gross profit.',
    'Inventory is carried at cost, so it is compared with cost and not with revenue. The ratio counts how many times the inventory was sold and replaced.',
    'Cost of revenue from operations ₹6,00,000, opening inventory ₹80,000, closing inventory ₹1,20,000: average ₹1,00,000; turnover 6 times.',
    'Dividing revenue from operations by the inventory, or using the closing inventory instead of the average.'),
  card(12, 'ar-activity', 'formula', 'What is the trade receivables turnover ratio, and the average collection period?',
    'Trade receivables turnover ratio = Credit revenue from operations ÷ Average trade receivables, in times. Trade receivables = debtors + bills receivable, before deducting any provision for doubtful debts. Average collection period = Days (or months) in the year ÷ the ratio.',
    'Only credit revenue creates receivables. The question must say how many days make the year (360 or 365) before a period in days can be given.',
    'Credit revenue ₹8,00,000, opening receivables ₹90,000, closing ₹1,10,000: average ₹1,00,000, turnover 8 times; with a 360-day year, collection period 45 days.',
    'Using total revenue when cash revenue is given separately, or deducting the provision for doubtful debts from the receivables.'),
  card(13, 'ar-activity', 'formula', 'What is the trade payables turnover ratio?',
    'Trade payables turnover ratio = Net credit purchases ÷ Average trade payables, in times. Trade payables = creditors + bills payable. Average payment period = Days (or months) in the year ÷ the ratio.',
    'Net credit purchases are the credit purchases less the returns out of them. Cash purchases create no payables.',
    'Total purchases ₹7,00,000, of which cash ₹2,00,000; returns ₹20,000, all out of the credit purchases; opening payables ₹70,000, closing ₹90,000: net credit purchases = 5,00,000 − 20,000 = ₹4,80,000, average ₹80,000, turnover 6 times.',
    'Using the total purchases, or the cost of revenue from operations, as the numerator.'),
  card(14, 'ar-activity', 'formula', 'What are the fixed assets, net assets and working capital turnover ratios?',
    'Fixed assets turnover ratio = Revenue from operations ÷ Net fixed assets. Net assets turnover ratio = Revenue from operations ÷ Capital employed. Working capital turnover ratio = Revenue from operations ÷ Working capital. All in times.',
    'All three have revenue from operations on top; only the base changes. Net fixed assets are cost less accumulated depreciation; net assets are the capital employed.',
    'Revenue ₹24,00,000, net fixed assets ₹6,00,000, working capital ₹2,00,000, capital employed ₹8,00,000: turnover of fixed assets 4 times, of working capital 12 times, of net assets 3 times.',
    'Using the cost of revenue from operations in these three ratios; only the inventory turnover ratio is on cost.'),
  card(15, 'ar-profitability', 'formula', 'What is the gross profit ratio?',
    'Gross profit ratio = Gross profit ÷ Revenue from operations × 100, where gross profit = revenue from operations − cost of revenue from operations.',
    'It is the margin left on what is sold before any operating expense. It is always on revenue from operations, never on cost.',
    'Revenue ₹8,00,000 and cost of revenue from operations ₹6,00,000: gross profit ₹2,00,000; ratio 25%.',
    'Working the gross profit as a percentage of cost: here that would give 33.33% instead of 25%.'),
  card(16, 'ar-profitability', 'formula', 'What are the operating ratio and the operating profit ratio?',
    'Operating ratio = (Cost of revenue from operations + Operating expenses) ÷ Revenue from operations × 100. Operating profit ratio = Operating profit ÷ Revenue from operations × 100 = 100 − Operating ratio.',
    'Operating expenses are employee benefits, office, administrative, selling and distribution expenses and depreciation. Interest on long-term borrowings, loss on sale of a fixed asset, loss by fire, and incomes such as dividend or interest received are non-operating and are left out. Operating profit = Gross profit + Operating income (if any) − Operating expenses.',
    'Revenue ₹10,00,000, cost of revenue from operations ₹6,00,000, operating expenses ₹2,00,000, interest on debentures ₹50,000: operating ratio 80%, operating profit ratio 20%. The interest is ignored.',
    'Counting interest on borrowings or a loss on sale of an asset as an operating expense.'),
  card(17, 'ar-profitability', 'formula', 'What is the net profit ratio?',
    'Net profit ratio = Net profit ÷ Revenue from operations × 100. The syllabus asks for it both on the net profit before tax and on the net profit after tax, so use the profit the question names.',
    'Net profit is what is left after every expense, operating and non-operating, and after adding the other incomes. Tax is the last deduction.',
    'Revenue ₹10,00,000, net profit before tax ₹1,50,000, tax ₹45,000: net profit ratio is 15% before tax and 10.5% after tax.',
    'Giving the ratio before tax when it is asked after tax, or the other way round.'),
  card(18, 'ar-profitability', 'formula', 'What is return on investment?',
    "Return on investment = Profit before interest and tax ÷ Capital employed × 100. Capital employed = shareholders' funds + non-current liabilities.",
    'Capital employed holds the money of both owners and long-term lenders, so the profit must be the one earned for both: before interest on long-term debt, before tax and before any dividend.',
    'Net profit before tax ₹2,40,000 after charging interest of ₹60,000 on debentures; capital employed ₹20,00,000: return = 3,00,000 ÷ 20,00,000 × 100 = 15%.',
    "Using the profit after tax, or dividing by the shareholders' funds alone."),
  card(19, 'ar-effect', 'rule', 'How do you tell the effect of a transaction on a ratio?',
    'Find what the transaction does to the numerator and to the denominator. Only the numerator up: the ratio rises. Only the denominator up: it falls. Neither changes: no change. Both change: look at whether the ratio is above, at or below 1 : 1.',
    'Write the two accounts the transaction touches, class each (current asset, current liability, non-current, equity), and see which of them sits in the ratio.',
    'Machinery bought for cash: cash, a current asset, falls; machinery is non-current. Current assets fall and current liabilities do not change, so the current ratio declines.',
    'Looking at one side of the transaction only, for example seeing the cash go out and forgetting that a current liability was paid off with it.'),
  card(20, 'ar-effect', 'shortcut', 'Both terms of a ratio change by the same amount. Which way does the ratio move?',
    'Adding the same amount to both terms pulls the ratio towards 1 : 1; taking the same amount from both pushes it away from 1 : 1. At exactly 1 : 1 it does not move.',
    'So for a current ratio above 1 : 1, paying a current liability improves it and buying goods on credit lowers it. Below 1 : 1 the two effects are reversed.',
    'Current ratio 2 : 1 (₹4,00,000 : ₹2,00,000). Pay trade payables ₹1,00,000: 3,00,000 : 1,00,000 = 3 : 1, improved. Buy goods on credit ₹2,00,000 instead: 6,00,000 : 4,00,000 = 1.5 : 1, declined.',
    'Saying "no change" because both sides moved by the same amount. That is true only when the ratio is exactly 1 : 1.'),
  card(21, 'ar-effect', 'rule', 'Which transactions leave the current ratio unchanged?',
    'Those that change neither total: one current asset turned into another (cash received from trade receivables, goods bought for cash), one current liability turned into another (a bill accepted for a creditor), and those that touch only non-current items and equity (machinery bought by issuing shares, depreciation).',
    'The current ratio reads only the two totals, current assets and current liabilities. A movement inside a total, or wholly outside both, cannot change it.',
    'Received ₹50,000 from trade receivables: cash up ₹50,000, trade receivables down ₹50,000; current assets unchanged, so the current ratio does not change.',
    'Carrying the same answer to the quick ratio. Goods bought for cash leave the current ratio alone but lower the quick ratio, because inventories are not a quick asset.'),
  card(22, 'ar-missing', 'shortcut', 'How are current liabilities found from the current ratio and working capital, or from the two liquidity ratios and inventories?',
    'If the current ratio is r : 1, working capital = (r − 1) × current liabilities. If the quick ratio is q : 1 and there are no prepaid expenses, inventories = (r − q) × current liabilities.',
    'Let the current liabilities be x. Then current assets are rx, quick assets are qx, working capital is rx − x and inventories are rx − qx.',
    'Current ratio 2.5 : 1, quick ratio 1.5 : 1, working capital ₹3,00,000: x = 3,00,000 ÷ 1.5 = ₹2,00,000; current assets ₹5,00,000; inventories = (2.5 − 1.5) × 2,00,000 = ₹2,00,000.',
    'Dividing the working capital by the ratio itself (2.5) instead of by the ratio less 1 (1.5).'),
  card(23, 'ar-missing', 'shortcut', 'How is a gross profit "on cost" turned into a gross profit ratio on revenue?',
    'Add the profit to the cost to get the revenue. A profit of 25% on cost is 25 on a revenue of 125: a gross profit ratio of 20%. A fraction 1/n on cost is 1/(n + 1) on revenue.',
    'Cost + gross profit = revenue. So with a profit on cost, revenue is more than 100; with a ratio on revenue, cost is less than 100.',
    'Revenue ₹5,00,000 and gross profit 25% on cost: gross profit = 5,00,000 × 25 ÷ 125 = ₹1,00,000; cost of revenue from operations = ₹4,00,000.',
    'Taking 25% of the revenue (₹1,25,000) as the gross profit when the 25% is on cost.'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `ar-q-${String(n).padStart(3, '0')}`;

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
function mcq(
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  prompt: string,
  correct: string,
  wrong: [string, string][],
  explanation: string,
  hints: string[],
): McqQuestion {
  const pos = n % (wrong.length + 1);
  const all: { text: string; why?: string }[] = [...wrong.map(([text, why]) => ({ text, why }))];
  all.splice(pos, 0, { text: correct });
  if (all.length === 4 && all.every((o) => arPlace(o.text) >= 0)) all.sort((x, y) => arPlace(x.text) - arPlace(y.text));
  const options = all.map((o, i) => ({ id: 'abcdefgh'[i], text: o.text, ...(o.why === undefined ? {} : { why: o.why }) }));
  return {
    id: qid(n), topicId: T, conceptId, difficulty, type: 'mcq', prompt, options,
    correct: options.find((o) => o.text === correct)!.id, hints, explanation,
  };
}

const tf = (n: number, conceptId: string, difficulty: Difficulty, prompt: string, correct: boolean, explanation: string, hints: string[]): TrueFalseQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'true_false', prompt, correct, hints, explanation,
});

/** A typed answer. Rupees are given in rupees; a ratio in times, a percentage and a number of days as they are typed (2.5, 12.5, 45). */
const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  unit: NumericUnit,
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion => {
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
  // ---- Meaning, objectives, advantages and limitations ----
  mcq(1, 'ar-meaning', 'easy', 'An accounting ratio is best described as:',
    'An arithmetical relationship between two related accounting figures',
    [
      ['The difference between two accounting figures', 'A difference is an amount, such as working capital; a ratio compares one figure with another by division.'],
      ['Any two figures taken from the financial statements', 'Missed that the two figures must be related; a ratio of unrelated figures means nothing.'],
      ['A statement of the assets and liabilities of a business', 'Described the balance sheet, from which ratios are worked out.'],
    ],
    'A ratio expresses one accounting figure in terms of another figure that is related to it.',
    ['A ratio compares; it does not add or subtract.', 'The two figures must have a meaningful connection.']),
  tf(2, 'ar-meaning', 'easy', 'An accounting ratio may be expressed as a pure ratio, a percentage, a number of times or a fraction.', true,
    'The current ratio is a pure ratio (2 : 1), the gross profit ratio a percentage, the inventory turnover ratio a number of times.',
    ['Think of how the current ratio, the gross profit ratio and the inventory turnover ratio are each written.']),
  mcq(3, 'ar-meaning', 'easy', 'Which of these ratios is expressed as a percentage?',
    'Gross profit ratio',
    [
      ['Current ratio', 'The current ratio is a pure ratio, written as x : 1.'],
      ['Inventory turnover ratio', 'A turnover ratio is expressed in times.'],
      ['Debt to equity ratio', 'The debt to equity ratio is a pure ratio, written as x : 1.'],
    ],
    'Profitability ratios are percentages; liquidity and solvency ratios are pure ratios (x : 1), except the interest coverage ratio, a solvency ratio, which is in times; turnover ratios are in times.',
    ['Which group of ratios is about profit on each ₹100 of revenue?']),
  mcq(4, 'ar-meaning', 'easy', 'Which of these is NOT an objective of ratio analysis?',
    'To record the transactions of the business in the books of account',
    [
      ['To judge the ability of the business to pay its short-term and long-term debts', 'This is an objective: liquidity and solvency ratios do exactly this.'],
      ['To compare the performance of the business with earlier years and with other firms', 'This is an objective: intra-firm and inter-firm comparison.'],
      ['To locate the weak spots of the business that need attention', 'This is an objective: ratios point to problem areas.'],
    ],
    'Recording transactions is book-keeping. Ratio analysis starts after the financial statements are ready.',
    ['Ratio analysis is a tool for analysing statements that already exist.']),
  mcq(5, 'ar-meaning', 'medium', 'Which of these is a limitation of ratio analysis?',
    'It ignores qualitative factors such as the quality of the management and the skill of the workers',
    [
      ['It makes the figures of the financial statements simpler to understand', 'This is an advantage, not a limitation.'],
      ['It helps to compare one firm with another', 'This is an advantage; the limitation is only that different accounting policies may spoil the comparison.'],
      ['It helps in forecasting and planning', 'This is an advantage, not a limitation.'],
    ],
    'Ratios are worked out from figures in rupees. What cannot be measured in money is left out of them.',
    ['Three of the options are things ratio analysis does well.']),
  tf(6, 'ar-meaning', 'medium', 'If the financial statements have been window-dressed, the ratios worked out from them will also be misleading.', true,
    'Ratios are only as reliable as the figures they are worked out from.',
    ['Where do the figures in a ratio come from?']),
  mcq(7, 'ar-meaning', 'medium', AR('The ratios of two firms in the same industry may not be comparable.', 'The two firms may follow different accounting policies, for example for depreciation or the valuation of inventory.'),
    BOTH_EXPLAINS,
    [
      [BOTH_NOT, 'Missed the link: different policies change profit and asset figures, which is exactly why the ratios stop being comparable.'],
      [A_ONLY, 'Denied the reason; firms are free to choose among accepted policies, and they often differ.'],
      [R_ONLY, 'Took the ratios of any two firms as comparable; that holds only when the figures are prepared on the same basis.'],
    ],
    'Different accounting policies give different profits and asset values from the same facts, so the ratios cannot be compared directly.',
    ['Would two firms with identical machines show the same profit if one used the straight line method and the other the written down value method?']),
  mcq(8, 'ar-meaning', 'medium', AR('A single ratio, looked at alone, tells very little about a business.', 'A ratio becomes meaningful only when it is compared with the ratio of earlier years, of other firms or of the industry.'),
    BOTH_EXPLAINS,
    [
      [BOTH_NOT, 'Missed the link: the need for comparison is the very reason a single ratio says little.'],
      [A_ONLY, 'Denied the reason; without something to compare with, a ratio cannot be called good or bad.'],
      [R_ONLY, 'Thought one ratio alone is enough to judge a business.'],
    ],
    'A current ratio of 1.8 : 1 is good or bad only against last year, the competitors or the norm of the industry.',
    ['Can you call a current ratio of 1.8 : 1 good without knowing anything else?']),
  tf(9, 'ar-meaning', 'easy', 'Ratio analysis adjusts the figures of the financial statements for changes in the price level.', false,
    'The statements are prepared at historical cost and the ratios use those figures as they are. Ignoring price-level changes is a limitation of ratio analysis.',
    ['Are assets shown in the balance sheet at today\'s prices?']),
  mcq(10, 'ar-meaning', 'medium', 'Riya compares the net profit ratios of two cement companies. One charges depreciation by the straight line method and the other by the written down value method. Which limitation of ratio analysis should Riya keep in mind?',
    'Differences in accounting policies make the ratios of two firms hard to compare',
    [
      ['Ratios ignore changes in the price level', 'A real limitation, but not the one this situation shows: the difference here is in the method of depreciation.'],
      ['Ratios ignore qualitative factors', 'A real limitation, but the situation is about two methods of depreciation, which is a quantitative policy choice.'],
      ['A ratio is only a means and not an end', 'True, but it does not explain why these two net profit ratios cannot be compared directly.'],
    ],
    'The two methods charge different amounts of depreciation in a year, so the net profits, and the net profit ratios, are not on the same footing.',
    ['What is different between the two companies in the question?']),
  mcq(11, 'ar-meaning', 'easy', 'A company compares its own gross profit ratio for each of the last five years. This is:',
    'Intra-firm comparison (trend analysis)',
    [
      ['Inter-firm comparison', 'Inter-firm comparison sets one firm against another firm; here there is only one firm.'],
      ['Window dressing', 'Window dressing is showing a better position than the true one; comparing years is plain analysis.'],
      ['Common size analysis', 'A common size statement expresses each item as a percentage of a base within one year.'],
    ],
    'Comparing the ratios of the same firm over several years is intra-firm comparison; it shows the trend.',
    ['How many firms are being compared?']),
  mcq(12, 'ar-meaning', 'medium', 'A company with a current ratio of 2 : 1 pays off a large part of its trade payables on 30 March, only so that the ratio in its balance sheet of 31 March looks better, and buys on credit again in April. Which limitation of ratio analysis does this show?',
    'Ratios can be distorted by window dressing',
    [
      ['Ratios ignore qualitative factors', 'The trouble here is not something unmeasured; it is a figure deliberately improved for a day.'],
      ['Ratios are affected by price-level changes', 'Prices play no part in this situation.'],
      ['There are no standard ratios', 'The situation is about manipulating a figure, not about the lack of a norm.'],
    ],
    'Paying current liabilities just before the year end raises a current ratio that is above 1 : 1 without any real change in liquidity: window dressing.',
    ['Was the liquidity of the company really better on 31 March?']),
  tf(13, 'ar-meaning', 'medium', 'Ratios are a means of analysis and not an end in themselves: they show where to look, but not what to do.', true,
    'A falling ratio points to a problem area. The causes and the remedy have to be found by further inquiry.',
    ['Does a low net profit ratio say why the profit is low?']),
  mcq(14, 'ar-meaning', 'medium', 'Which statement about ratio analysis is correct?',
    'It turns absolute figures into relative ones, which makes comparison over years and between firms easier',
    [
      ['It removes the need for judgement by the analyst', 'Ratios have to be interpreted; the analyst still has to judge what they mean.'],
      ['It gives correct results even if the financial statements are wrong', 'Ratios carry every error of the figures they are worked out from.'],
      ['It shows the effect of changes in the price level on the business', 'Price-level changes are ignored; this is a limitation.'],
    ],
    'A relative figure such as "profit is 12% of revenue" can be compared across years and firms of different sizes.',
    ['Three of the statements claim more than ratios can deliver.']),

  // ---- Liquidity ----
  num(15, 'ar-liquidity', 'easy', 'times', 'The current assets of a company are ₹4,50,000 and its current liabilities are ₹1,80,000. Find the current ratio as x : 1 (for 2.5 : 1 type 2.5).', 2.5,
    [[0.4, 'Divided the current liabilities by the current assets: the ratio is upside down.'], [1.5, 'Divided the working capital, ₹2,70,000, by the current liabilities.']],
    ['Current ratio = Current assets ÷ Current liabilities.', '₹4,50,000 ÷ ₹1,80,000 = 2.5 : 1.'],
    ['Which figure goes on top?', 'Current ratio = Current assets ÷ Current liabilities.']),
  num(16, 'ar-liquidity', 'medium', 'times', 'A company has current assets of ₹6,00,000, which include inventories of ₹2,40,000 and prepaid expenses of ₹20,000. Its current liabilities are ₹2,00,000. Find the quick ratio as x : 1 (for 2.5 : 1 type 2.5).', 1.7,
    [[3, 'Kept the inventories and the prepaid expenses in: that is the current ratio.'], [1.8, 'Took out the inventories but left the prepaid expenses in the quick assets.'], [0.59, 'Divided the current liabilities by the quick assets: the ratio is upside down.']],
    ['Quick assets = ₹6,00,000 - ₹2,40,000 - ₹20,000 = ₹3,40,000.', 'Quick ratio = ₹3,40,000 ÷ ₹2,00,000 = 1.7 : 1.'],
    ['Two items are left out of quick assets.', 'Quick assets = Current assets - Inventories - Prepaid expenses.']),
  tf(17, 'ar-liquidity', 'easy', 'A bank overdraft is counted among the current liabilities when the current ratio is worked out.', true,
    'A bank overdraft is a short-term borrowing, and short-term borrowings are current liabilities.',
    ['Under which head of the balance sheet is a bank overdraft shown?']),
  mcq(18, 'ar-liquidity', 'medium', 'The current ratio and the quick ratio of a company are both 1.8 : 1. What does this tell you?',
    'The company has no inventories and no prepaid expenses',
    [
      ['The company has no current liabilities', 'With no current liabilities neither ratio could be worked out at all.'],
      ['The company has no trade receivables', 'Trade receivables are in both ratios; their absence would not make the two equal.'],
      ['The company cannot pay its short-term debts', 'A quick ratio of 1.8 : 1 shows quick assets well above the current liabilities.'],
    ],
    'The two ratios differ only by the inventories and prepaid expenses. If they are equal, those items are nil.',
    ['What is in current assets but not in quick assets?']),
  mcq(19, 'ar-liquidity', 'medium', 'A trading company has a current ratio of 3 : 1 but a quick ratio of only 0.6 : 1. What is the most likely reason?',
    'A large part of its current assets is held as inventories',
    [
      ['It has large long-term borrowings', 'Long-term borrowings are in neither ratio.'],
      ['Most of its current assets are trade receivables', 'Trade receivables are quick assets; they would keep the quick ratio close to the current ratio.'],
      ['Its current liabilities are very small', 'Small current liabilities would raise both ratios, not open a gap between them.'],
    ],
    'The gap between the two ratios is the inventories (and prepaid expenses). Here they are 2.4 times the current liabilities.',
    ['Which assets separate the current ratio from the quick ratio?']),

  // ---- Solvency ----
  num(20, 'ar-solvency', 'easy', 'times', 'A company has long-term borrowings of ₹3,00,000, long-term provisions of ₹60,000, share capital of ₹4,00,000 and reserves and surplus of ₹2,00,000. Find the debt to equity ratio as x : 1 (for 2.5 : 1 type 2.5).', 0.6,
    [[0.5, 'Left the long-term provisions out of the debt.'], [0.9, "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."], [1.67, "Divided the shareholders' funds by the debt: the ratio is upside down."]],
    ['Debt = ₹3,00,000 + ₹60,000 = ₹3,60,000.', "Equity (shareholders' funds) = ₹4,00,000 + ₹2,00,000 = ₹6,00,000.", 'Debt to equity ratio = ₹3,60,000 ÷ ₹6,00,000 = 0.6 : 1.'],
    ['Debt is long-term borrowings plus long-term provisions.', "Equity is share capital plus reserves and surplus."]),
  mcq(21, 'ar-solvency', 'medium', 'A balance sheet shows long-term borrowings ₹5,00,000, short-term borrowings ₹1,00,000 and trade payables ₹2,00,000. What is the "debt" for the debt to equity ratio?',
    '₹5,00,000',
    [
      ['₹6,00,000', 'Counted the short-term borrowings; they are a current liability.'],
      ['₹8,00,000', 'Counted every outside liability, the current ones too.'],
      ['₹3,00,000', 'Took the current liabilities as the debt and left out the long-term borrowings.'],
    ],
    'Debt means the long-term debt: long-term borrowings and long-term provisions. Short-term borrowings and trade payables are current liabilities.',
    ['Which of the three items is non-current?']),
  num(22, 'ar-solvency', 'medium', 'times', 'A company earned a net profit after tax of ₹2,10,000. Tax for the year was ₹90,000 and interest on its long-term borrowings was ₹60,000. Find the interest coverage ratio in times.', 6,
    [[3.5, 'Used the profit after tax; the interest is covered by the profit before interest and tax.'], [5, 'Added back the tax but not the interest.'], [4.5, 'Added back the interest but not the tax.']],
    ['Profit before interest and tax = ₹2,10,000 + ₹90,000 + ₹60,000 = ₹3,60,000.', 'Interest coverage ratio = ₹3,60,000 ÷ ₹60,000 = 6 times.'],
    ['Add back to the profit everything that was deducted after the profit before interest and tax.', 'Interest coverage ratio = Profit before interest and tax ÷ Interest on long-term debt.']),
  tf(23, 'ar-solvency', 'medium', "A proprietary ratio (shareholders' funds to total assets) of 0.75 : 1 means that three-quarters of the total assets are financed by the shareholders' funds.", true,
    "Proprietary ratio = shareholders' funds ÷ total assets, so 0.75 : 1 means the owners finance 75% of the assets and outsiders the other 25%.",
    ['What is the numerator of the proprietary ratio?']),
  mcq(24, 'ar-solvency', 'complex', 'A bank will lend for eight years to only one of four companies. Which one gives the bank the greatest safety?',
    'Debt to equity ratio 0.5 : 1; interest coverage ratio 9 times',
    [
      ['Debt to equity ratio 2.5 : 1; interest coverage ratio 9 times', 'The coverage is the same, but debt is five times as large in relation to the owners\' funds.'],
      ['Debt to equity ratio 0.5 : 1; interest coverage ratio 2 times', 'The debt is as low, but the profit covers the interest only twice: a small fall in profit puts the interest at risk.'],
      ['Debt to equity ratio 2.5 : 1; interest coverage ratio 2 times', 'Chose the weakest on both counts: the most debt and the thinnest cover for interest.'],
    ],
    'A long-term lender is safest with a low debt to equity ratio (a large cushion of owners\' funds) and a high interest coverage ratio (interest well covered by profit).',
    ['Is a higher debt to equity ratio safer or riskier for a lender?', 'Is a higher interest coverage ratio safer or riskier?']),

  // ---- Activity ----
  num(25, 'ar-activity', 'easy', 'times', 'The cost of revenue from operations of a company is ₹6,00,000. Its opening inventory was ₹80,000 and its closing inventory is ₹1,20,000. Find the inventory turnover ratio in times.', 6,
    [[5, 'Divided by the closing inventory instead of the average inventory.'], [7.5, 'Divided by the opening inventory instead of the average inventory.'], [3, 'Added the two inventories but did not halve the total.']],
    ['Average inventory = (₹80,000 + ₹1,20,000) ÷ 2 = ₹1,00,000.', 'Inventory turnover ratio = ₹6,00,000 ÷ ₹1,00,000 = 6 times.'],
    ['Find the average inventory first.', 'Inventory turnover ratio = Cost of revenue from operations ÷ Average inventory.']),
  num(26, 'ar-activity', 'medium', 'number', 'The trade receivables turnover ratio of a company is 8 times. Taking a year as 360 days, find the average collection period in days.', 45,
    [[8, 'Gave the turnover ratio; the collection period is the days in the year divided by it.'], [2880, 'Multiplied the days in the year by the ratio instead of dividing.']],
    ['Average collection period = Days in the year ÷ Trade receivables turnover ratio.', '360 ÷ 8 = 45 days.'],
    ['The more times the receivables turn over, the fewer days each rupee stays uncollected.', 'Divide the days in the year by the ratio.']),
  mcq(27, 'ar-activity', 'medium', 'The inventory turnover ratio of a company is 6 times. It buys goods of ₹50,000 on credit and none of them is sold before the year ends. What happens to the ratio?',
    'It declines: the average inventory rises and the cost of revenue from operations does not change',
    [
      ['It improves: purchases add to the cost of revenue from operations', 'The goods are unsold, so they are in the closing inventory and not in the cost of revenue from operations.'],
      ['It does not change: the purchase is on credit', 'How the goods are paid for does not matter; the inventory has risen.'],
      ['It does not change: neither the cost nor the inventory is affected', 'Missed that the unsold goods raise the closing inventory and so the average.'],
    ],
    'Cost of revenue from operations is unchanged (purchases and closing inventory rise together), while the average inventory rises: the ratio falls.',
    ['Is the cost of the unsold goods part of the cost of revenue from operations?', 'What happens to the closing inventory?']),
  mcq(28, 'ar-activity', 'medium', 'The gross profit ratio of a company is 25%. It buys goods of ₹40,000 on credit, which remain unsold. What happens to the gross profit ratio?',
    'It does not change: neither the gross profit nor the revenue from operations changes',
    [
      ['It declines: purchases raise the cost of revenue from operations', 'Unsold goods go into the closing inventory, so the cost of revenue from operations is the same.'],
      ['It improves: more goods are available for sale', 'Goods available for sale earn nothing until they are sold.'],
      ['It declines: trade payables have risen', 'Trade payables are not in the gross profit ratio.'],
    ],
    'A purchase that is still in inventory changes neither revenue nor cost of revenue from operations, so the gross profit ratio stays at 25%.',
    ['Which two figures make the gross profit ratio?']),
  tf(29, 'ar-activity', 'easy', 'For the trade receivables turnover ratio, the provision for doubtful debts is deducted from the trade receivables.', false,
    'Trade receivables are taken at their gross amount (debtors plus bills receivable), before deducting any provision.',
    ['Is the gross or the net figure of receivables used?']),
  mcq(30, 'ar-activity', 'easy', 'A company makes both cash and credit sales. Which revenue figure is used for the trade receivables turnover ratio?',
    'Credit revenue from operations only',
    [
      ['Total revenue from operations', 'Cash revenue creates no trade receivables, so it is left out when the credit revenue is known.'],
      ['Cash revenue from operations only', 'Cash sales are collected at once; they have nothing to do with receivables.'],
      ['Cost of revenue from operations', 'Cost is used for the inventory turnover ratio, not for this one.'],
    ],
    'Trade receivables arise only from credit sales, so they are compared with the credit revenue from operations.',
    ['Which sales create debtors?']),

  // ---- Profitability ----
  num(31, 'ar-profitability', 'easy', 'percent', 'The revenue from operations of a company is ₹8,00,000 and its cost of revenue from operations is ₹6,00,000. Find the gross profit ratio as a percentage.', 25,
    [[33.33, 'Took the gross profit as a percentage of cost; the ratio is on revenue from operations.'], [75, 'Gave the cost as a percentage of revenue, not the gross profit.']],
    ['Gross profit = ₹8,00,000 - ₹6,00,000 = ₹2,00,000.', 'Gross profit ratio = ₹2,00,000 ÷ ₹8,00,000 x 100 = 25%.'],
    ['Find the gross profit first.', 'Gross profit ratio = Gross profit ÷ Revenue from operations x 100.']),
  num(32, 'ar-profitability', 'medium', 'percent', 'A company has revenue from operations of ₹8,00,000, cost of revenue from operations of ₹5,00,000, operating expenses of ₹1,40,000 and interest on debentures of ₹20,000. Find the operating ratio as a percentage.', 80,
    [[82.5, 'Counted the interest on debentures as an operating expense; it is a non-operating item.'], [17.5, 'Left out the cost of revenue from operations.'], [20, 'Gave the operating profit ratio: 100 less the operating ratio.'], [62.5, 'Left out the operating expenses.']],
    ['Operating cost = ₹5,00,000 + ₹1,40,000 = ₹6,40,000. The interest on debentures is non-operating.', 'Operating ratio = ₹6,40,000 ÷ ₹8,00,000 x 100 = 80%.'],
    ['Which of the items is not a cost of running the main business?', 'Operating ratio = (Cost of revenue from operations + Operating expenses) ÷ Revenue from operations x 100.']),
  mcq(33, 'ar-profitability', 'medium', 'Operating profit is to be found from the net profit before tax. Which of these has to be added back to the net profit?',
    'Loss on sale of a machine',
    [
      ['Dividend received on investments', 'A non-operating income was added to reach the net profit, so it has to be deducted, not added back.'],
      ['Salaries of the office staff', 'An operating expense; it is rightly deducted in reaching the operating profit.'],
      ['Depreciation on plant and machinery', 'An operating expense; it is rightly deducted in reaching the operating profit.'],
    ],
    'Operating profit = Net profit + Non-operating expenses − Non-operating incomes. A loss on sale of a fixed asset is a non-operating expense.',
    ['Which item has nothing to do with the main operations and reduced the net profit?']),
  num(34, 'ar-profitability', 'medium', 'percent', 'A company earned a net profit before tax of ₹3,00,000 after charging interest of ₹60,000 on its long-term borrowings. Its capital employed is ₹24,00,000. Find the return on investment as a percentage.', 15,
    [[12.5, 'Did not add back the interest: the return is on the profit before interest and tax.'], [10, 'Deducted the interest again instead of adding it back.']],
    ['Profit before interest and tax = ₹3,00,000 + ₹60,000 = ₹3,60,000.', 'Return on investment = ₹3,60,000 ÷ ₹24,00,000 x 100 = 15%.'],
    ['The interest has already been deducted from the profit given.', 'Return on investment = Profit before interest and tax ÷ Capital employed x 100.']),
  tf(35, 'ar-profitability', 'easy', 'If the operating ratio is 78%, the operating profit ratio is 22%.', true,
    'Operating ratio + Operating profit ratio = 100%, because revenue from operations = operating cost + operating profit.',
    ['What do the two ratios add up to?']),
  mcq(36, 'ar-profitability', 'complex', 'The gross profit ratio of a trading company fell from 30% to 24%, although its revenue from operations stayed the same. Which of these could explain the fall?',
    'The suppliers raised their prices and the company did not raise its selling prices',
    [
      ['The rent of the head office went up', 'Office rent is an operating expense; it affects the operating and net profit ratios, not the gross profit ratio.'],
      ['The company paid more interest on its debentures', 'Interest is a finance cost; it does not enter the gross profit.'],
      ['A machine was sold at a loss', 'A loss on sale of a fixed asset is non-operating; it does not enter the gross profit.'],
    ],
    'The gross profit ratio depends only on revenue from operations and the cost of revenue from operations. A higher purchase cost at the same selling price lowers it.',
    ['Which costs come before the gross profit?']),
  mcq(37, 'ar-profitability', 'medium', 'The gross profit ratio of a company is the same as last year, but its operating profit ratio has fallen. What does this point to?',
    'Operating expenses have risen in relation to revenue',
    [
      ['The cost of the goods sold has risen in relation to revenue', 'That would have lowered the gross profit ratio, which has not changed.'],
      ['More tax has been charged', 'Tax comes after the operating profit; it affects the net profit after tax.'],
      ['Interest on long-term borrowings has risen', 'Interest is non-operating; it does not enter the operating profit.'],
    ],
    'Operating profit = Gross profit − Operating expenses. With the gross margin unchanged, a lower operating margin means higher operating expenses.',
    ['What stands between the gross profit and the operating profit?']),

  // ---- Effect of a transaction ----
  mcq(38, 'ar-effect', 'medium', 'The current ratio of a company is 1.5 : 1. The directors want to improve it at once. Which of these would do so?',
    'Paying off some trade payables by cheque',
    [
      ['Buying goods on credit', 'Adds the same amount to both terms, which lowers a ratio that is above 1 : 1.'],
      ['Collecting cash from trade receivables', 'One current asset replaces another; the ratio does not change.'],
      ['Buying machinery by cheque', 'Current assets fall and current liabilities stay: the ratio declines.'],
    ],
    'Taking the same amount from both terms raises a ratio that is above 1 : 1. For example 3,00,000 : 2,00,000 becomes 2,00,000 : 1,00,000 = 2 : 1.',
    ['Which option changes both current assets and current liabilities?', 'The ratio is above 1 : 1.']),
  tf(39, 'ar-effect', 'medium', 'Paying a trade payable by cheque always improves the current ratio.', false,
    'It improves a current ratio that is above 1 : 1, leaves a ratio of exactly 1 : 1 unchanged, and lowers a ratio that is below 1 : 1.',
    ['Try it with current assets of ₹80,000 and current liabilities of ₹1,00,000.']),
  mcq(40, 'ar-effect', 'medium', 'The quick ratio of a company is 1.2 : 1. It sells goods costing ₹30,000 for ₹30,000 on credit. What happens to the quick ratio?',
    'It improves: trade receivables, a quick asset, rise and current liabilities do not change',
    [
      ['It does not change: one current asset replaces another', 'True of the current ratio; but inventories are not a quick asset, so quick assets rise.'],
      ['It declines: inventories fall', 'Inventories are not in the quick assets, so their fall does not lower the quick ratio.'],
      ['It does not change: there is no profit on the sale', 'The quick ratio does not depend on profit; trade receivables have risen.'],
    ],
    'Inventories (not a quick asset) fall and trade receivables (a quick asset) rise by ₹30,000. Quick assets rise; current liabilities are unchanged.',
    ['Are inventories part of the quick assets?']),
  mcq(41, 'ar-effect', 'complex', 'The debt to equity ratio of a company is 1 : 1. It sells for ₹40,000 a machine that stands in the books at ₹50,000. What happens to the ratio?',
    "It increases: the loss of ₹10,000 reduces the shareholders' funds and the debt does not change",
    [
      ['It does not change: neither debt nor share capital is affected', "Missed the loss on sale, which reduces reserves and surplus and so the shareholders' funds."],
      ['It decreases: cash of ₹40,000 comes in', 'Cash is not in this ratio; what matters is the effect on debt and on the shareholders\' funds.'],
      ["It decreases: the shareholders' funds fall", 'Right about what changes, wrong about its effect: a smaller denominator raises the ratio.'],
    ],
    "The loss on sale, ₹10,000, is charged to the Statement of Profit and Loss and lowers reserves and surplus. Debt ÷ a smaller equity gives a higher ratio.",
    ['Is the machine sold at its book value?', 'Where does a loss on sale end up in the balance sheet?']),
  mcq(42, 'ar-effect', 'medium', 'The operating ratio of a company is 80%. During the year it pays interest of ₹30,000 on its debentures. What is the effect of this payment on the operating ratio?',
    'No effect: interest on debentures is a non-operating expense',
    [
      ['It rises: expenses have gone up', 'Only operating expenses enter the operating ratio; interest on long-term borrowings is a finance cost.'],
      ['It falls: cash has gone down', 'Cash is not in the operating ratio.'],
      ['It rises: the net profit has fallen', 'The net profit ratio falls, but the operating ratio does not include non-operating items.'],
    ],
    'Operating ratio = (cost of revenue from operations + operating expenses) ÷ revenue from operations. Interest on debentures is in neither term.',
    ['Is interest on debentures an operating expense?']),

  // ---- Missing figures ----
  num(43, 'ar-missing', 'medium', 'rupees', 'The current ratio of a company is 3 : 1 and its working capital is ₹4,00,000. Find its current liabilities.', 200000,
    [[600000, 'Gave the current assets; the current liabilities were asked for.'], [400000, 'Took the working capital as the current liabilities.']],
    ['If the current liabilities are x, the current assets are 3x and the working capital is 3x - x = 2x.', '2x = ₹4,00,000, so the current liabilities are ₹2,00,000.'],
    ['Let the current liabilities be x.', 'Working capital = Current assets - Current liabilities = (ratio - 1) times the current liabilities.']),
  num(44, 'ar-missing', 'complex', 'rupees', 'The current ratio of a company is 2.5 : 1 and its quick ratio is 1.5 : 1. Its inventories are ₹1,50,000 and it has no prepaid expenses. Find its current assets.', 375000,
    [[150000, 'Stopped at the current liabilities; the current assets were asked for.'], [225000, 'Gave the quick assets; the current assets were asked for.']],
    ['If the current liabilities are x, the inventories are 2.5x - 1.5x = x, so x = ₹1,50,000.', 'Current assets = 2.5 x ₹1,50,000 = ₹3,75,000.'],
    ['The difference between the two ratios is the inventories.', 'Inventories = (Current ratio - Quick ratio) x Current liabilities.']),
  mcq(45, 'ar-missing', 'medium', 'The gross profit of a company is one-third of its cost of revenue from operations. What is its gross profit ratio?',
    '25%',
    [
      ['33.33%', 'Gave the profit as a percentage of cost; the gross profit ratio is on revenue from operations.'],
      ['75%', 'Gave the cost as a percentage of revenue.'],
      ['66.67%', 'Deducted one-third from 100 as if the one-third were on revenue.'],
    ],
    'If the cost is 3, the gross profit is 1 and the revenue is 4. Gross profit ratio = 1 ÷ 4 × 100 = 25%.',
    ['Add the profit to the cost to get the revenue.', 'A profit of 1/n on cost is 1/(n + 1) on revenue.']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'What a Ratio Tells You',
    description: 'See why figures are compared with each other, and the four questions that ratios answer.',
    lesson: [
      {
        type: 'text',
        heading: 'A figure alone says little',
        body: 'Two companies each earn a profit of ₹5,00,000. One did it on revenue of ₹25,00,000, the other on ₹1,00,00,000. The profit is the same, but the first keeps ₹20 out of every ₹100 it sells and the second only ₹5. Nothing in the single figure "₹5,00,000" shows this. Setting one figure against another that is related to it does. That is an accounting ratio.',
      },
      {
        type: 'text',
        heading: 'Four questions, four groups of ratios',
        body: 'Can the business pay what falls due within a year? Liquidity ratios answer this: the current ratio and the quick ratio. Can it carry its long-term debt and the interest on it? Solvency ratios: debt to equity, total assets to debt, proprietary, interest coverage and debt to capital employed. How well does it use what it has? Activity ratios, in times: the turnover of inventory, trade receivables, trade payables, fixed assets, net assets and working capital. What does it earn? Profitability ratios, in per cent: the gross profit, operating, operating profit and net profit ratios and the return on investment. Liquidity and solvency ratios are written as pure ratios (2 : 1), with one exception: the interest coverage ratio is in times, because it counts how many times the profit covers the interest.',
      },
      {
        type: 'text',
        heading: 'Every term has a fixed meaning',
        body: "A ratio is only as good as what is put into it, so each term is defined. Current assets and current liabilities are the items that turn into cash, or fall due, within twelve months of the balance sheet date or within the operating cycle of the business. Long-term borrowings are not current, but the instalment of a long-term loan that falls due within the next twelve months (the current maturities) is: Schedule III shows it under short-term borrowings, so it counts as a current liability and not as debt. Quick assets are the current assets without inventories and prepaid expenses. Debt means long-term borrowings and long-term provisions. Equity means the shareholders' funds: share capital plus reserves and surplus. Most mistakes in this topic are a figure put into the wrong term.",
      },
      {
        type: 'text',
        heading: 'Worked example: the current and quick ratios',
        body: 'A company has inventories ₹1,60,000, trade receivables ₹1,40,000, cash ₹1,00,000, trade payables ₹1,50,000 and short-term borrowings ₹50,000. Current assets = 1,60,000 + 1,40,000 + 1,00,000 = ₹4,00,000. Current liabilities = 1,50,000 + 50,000 = ₹2,00,000. Current ratio = 4,00,000 ÷ 2,00,000 = 2 : 1. Quick assets = 4,00,000 − 1,60,000 = ₹2,40,000, so the quick ratio = 2,40,000 ÷ 2,00,000 = 1.2 : 1. The company has ₹2 of current assets for every ₹1 it must pay within a year, and ₹1.20 even without selling any inventory.',
      },
      {
        type: 'working',
        title: "Worked example: debt to equity when the shareholders' funds are not given",
        lines: [
          "Shreeji Spices Ltd. of Unjha, which cleans and packs cumin and fennel, shows total assets of ₹30,00,000, long-term borrowings of ₹6,00,000, long-term provisions of ₹1,20,000 and current liabilities of ₹4,80,000. The current liabilities include ₹1,00,000 of its term loan that falls due within the next twelve months.",
          "Shareholders' funds = Total assets - every outside liability = ₹30,00,000 - ₹6,00,000 - ₹1,20,000 - ₹4,80,000 = ₹18,00,000.",
          'Debt = Long-term borrowings + Long-term provisions = ₹6,00,000 + ₹1,20,000 = ₹7,20,000.',
          'The ₹1,00,000 due within twelve months is a current maturity. It already sits in the current liabilities (under short-term borrowings), so it is not debt.',
          'Debt to equity ratio = ₹7,20,000 ÷ ₹18,00,000 = 0.4 : 1.',
        ],
        note: "Watch out: adding the current maturities to the debt gives ₹8,20,000 ÷ ₹18,00,000 = 0.46 : 1, the commonest slip with a Schedule III balance sheet. And when shareholders' funds are found from the total assets, every outside liability is taken away, the current ones too.",
      },
      {
        type: 'working',
        title: 'Worked example: inventory turnover when only the gross profit ratio is given',
        lines: [
          'Vasundhara Agro Inputs Ltd. of Guntur sells seeds and fertilisers. Its sales were ₹24,60,000 and sales returns ₹60,000. Its gross profit ratio is 25%. Inventory was ₹2,20,000 on 1 April and ₹2,60,000 on 31 March.',
          'Revenue from operations = ₹24,60,000 - ₹60,000 = ₹24,00,000.',
          'Gross profit = 25% of ₹24,00,000 = ₹6,00,000. The gross profit ratio is on revenue from operations, not on cost.',
          'Cost of revenue from operations = ₹24,00,000 - ₹6,00,000 = ₹18,00,000.',
          'Average inventory = (₹2,20,000 + ₹2,60,000) ÷ 2 = ₹2,40,000.',
          'Inventory turnover ratio = ₹18,00,000 ÷ ₹2,40,000 = 7.5 times.',
        ],
        note: 'Watch out: ₹24,00,000 ÷ ₹2,40,000 = 10 times sets revenue against inventory that is carried at cost. Had the 25% been "on cost", the gross profit would be ₹24,00,000 × 25 ÷ 125 = ₹4,80,000 instead.',
      },
      {
        type: 'table',
        title: 'Worked example: the operating cost of Ganpati Hardware Mart Ltd., Pune (revenue from operations ₹40,00,000)',
        rows: [
          { label: 'Cost of revenue from operations', amount: '₹28,00,000' },
          { label: 'Employee benefits expense', amount: '₹3,20,000' },
          { label: 'Rent, power and office expenses', amount: '₹1,60,000' },
          { label: 'Depreciation', amount: '₹1,20,000' },
          { label: 'Operating cost', amount: '₹34,00,000', total: true },
          { label: 'Left out, as non-operating: interest on debentures ₹90,000, loss on sale of an old delivery van ₹30,000, dividend received ₹20,000' },
        ],
        note: 'Operating ratio = ₹34,00,000 ÷ ₹40,00,000 × 100 = 85%. Operating profit ratio = 100% - 85% = 15% (an operating profit of ₹6,00,000). Watch out: counting the interest and the loss on sale as operating gives ₹35,20,000 and 88%; they arise from how the business is financed and from selling an asset, not from selling hardware.',
      },
      { type: 'check', questionId: qid(32) },
      {
        type: 'working',
        title: 'Worked example: one payment, two current ratios',
        lines: [
          'Annapurna Supermarts Ltd. of Indore pays ₹50,000 to its trade payables by cheque. Cash at bank (a current asset) and trade payables (a current liability) both fall by ₹50,000.',
          'If its current assets were ₹4,00,000 and its current liabilities ₹2,00,000 (2 : 1): after the payment, ₹3,50,000 ÷ ₹1,50,000 = 2.33 : 1. The ratio improves.',
          'If its current assets were ₹1,60,000 and its current liabilities ₹2,00,000 (0.8 : 1): after the payment, ₹1,10,000 ÷ ₹1,50,000 = 0.73 : 1. The ratio declines.',
          'The rule: taking the same amount off both terms pushes a ratio away from 1 : 1, and adding the same amount to both pulls it towards 1 : 1. At exactly 1 : 1 nothing moves.',
        ],
        note: 'Watch out: "both terms fall by ₹50,000, so there is no change" is true only when the ratio is exactly 1 : 1. Always ask first whether the ratio is above or below 1 : 1.',
      },
      { type: 'check', questionId: qid(39) },
      {
        type: 'text',
        heading: 'What ratios cannot do',
        body: 'Ratios come from the financial statements and carry their limits. They use historical figures and ignore price changes and everything that is not measured in money. Two firms that follow different accounting policies cannot be compared directly, and a balance sheet can be dressed up for one day. A ratio shows where to look. It does not say why, or what to do.',
      },
      { type: 'check', questionId: qid(1) },
      { type: 'check', questionId: qid(15) },
    ],
  },
  cards: {
    title: 'Ratio Formulas and Rules',
    description: 'Recall the formula of every ratio, what goes into each term, and the rules for the effect of a transaction.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'Meaning, Uses and Limits of Ratio Analysis',
      description: 'What a ratio is, why ratios are worked out, and where they can mislead.',
      questionIds: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(qid),
    },
    {
      title: 'Reading the Ratios',
      description: 'What goes into a ratio, what a ratio means, and how a change in the business shows up in it.',
      questionIds: [17, 18, 19, 21, 23, 24, 27, 28, 29, 30, 33, 35, 36, 37].map(qid),
    },
    {
      title: 'First Sums and Quick Effects',
      description: 'One sum on each main formula, and the effect of a transaction on a ratio.',
      questionIds: [16, 20, 22, 25, 26, 31, 32, 34, 38, 39, 40, 41, 42, 43, 44, 45].map(qid),
      type: 'method_recognition',
    },
  ],
  practice: [
    {
      title: 'The Groups of Ratios and Their Terms',
      description: 'Place a ratio in its group, pick the ratio that answers a question, and say what goes into each term.',
      templateIds: ['ar-classify-ratio', 'ar-purpose', 'ar-liquidity-terms', 'ar-solvency-terms', 'ar-activity-terms', 'ar-profitability-terms'],
      count: 8,
    },
    {
      title: 'Ratios from Given Figures',
      description: 'Work out each ratio when the figures are given directly.',
      templateIds: [
        'ar-current-ratio', 'ar-quick-ratio', 'ar-debt-equity', 'ar-debt-equity-whole', 'ar-total-assets-debt', 'ar-inventory-turnover', 'ar-fixed-assets-turnover',
        'ar-working-capital-turnover', 'ar-gross-profit-ratio', 'ar-net-profit-ratio', 'ar-missing-from-solvency-ratio',
      ],
      count: 10,
    },
    {
      title: 'Liquidity from a Balance Sheet (Guided)',
      description: 'Pick the current items out of a whole balance sheet, then work out the current and quick ratios.',
      templateIds: ['ar-liquidity-balance-sheet', 'ar-quick-from-current'],
      count: 6,
      guided: true,
    },
    {
      title: 'Solvency Ratios',
      description: 'Debt to equity among other liabilities, the proprietary ratio, interest coverage and debt to capital employed.',
      templateIds: ['ar-debt-equity-liabilities', 'ar-proprietary', 'ar-interest-coverage', 'ar-debt-capital-employed'],
      count: 8,
    },
    {
      title: 'Activity Ratios',
      description: 'Inventory, trade receivables and trade payables turnover, the collection period and net assets turnover.',
      templateIds: ['ar-inventory-turnover-cost', 'ar-trade-receivables-turnover', 'ar-collection-period', 'ar-trade-payables-turnover', 'ar-net-assets-turnover'],
      count: 8,
    },
    {
      title: 'Profitability Ratios',
      description: 'The operating ratio, the operating profit ratio and the return on investment.',
      templateIds: ['ar-operating-ratio', 'ar-operating-profit-ratio', 'ar-return-on-investment'],
      count: 6,
    },
    {
      title: 'Will the Ratio Improve, Decline or Not Change?',
      description: 'The effect of a transaction on the current ratio, the quick ratio and the debt to equity ratio, with the reason.',
      templateIds: ['ar-effect-current', 'ar-effect-quick', 'ar-effect-debt-equity', 'ar-effect-which-transaction'],
      count: 10,
    },
    {
      title: 'Finding a Missing Figure',
      description: 'Work back from a ratio to current assets, inventories, revenue, gross profit or operating expenses.',
      templateIds: ['ar-missing-working-capital', 'ar-missing-inventory', 'ar-missing-from-receivables-turnover', 'ar-missing-gross-profit', 'ar-missing-from-operating-ratio'],
      count: 8,
    },
    {
      title: 'Ratios from Indirect Figures',
      description: "Shareholders' funds that have to be derived, profit given after tax, a gross profit stated on cost, and capital employed from the assets side.",
      templateIds: ['ar-debt-equity-derived', 'ar-interest-coverage-after-tax', 'ar-inventory-turnover-margin', 'ar-operating-profit-from-net', 'ar-return-on-investment-assets'],
      count: 8,
    },
    {
      title: 'Harder Effects and Missing Figures',
      description: 'A current ratio at or below 1 : 1, the other solvency ratios, the new ratio after a transaction, and figures found from two ratios.',
      templateIds: [
        'ar-effect-current-at-or-below-one', 'ar-effect-assets-debt-proprietary', 'ar-effect-new-ratio', 'ar-missing-two-ratios',
        'ar-missing-revenue-from-inventory-turnover', 'ar-missing-inventory-balance',
      ],
      count: 8,
    },
  ],
  mixed: { title: 'Mixed Ratio Practice', description: 'Every kind of ratio question in this topic, shuffled the way an examination serves them.', count: 12 },
  challenge: { title: 'Challenge: Accounting Ratios', description: 'The hardest questions of the topic, against the clock.', count: 8, timerSecondsPerQuestion: 150 },
});

const pack: TopicPack = {
  topicId: T,
  concepts,
  cards,
  levels: [
    ...levels,
    ...laterLevels(T, levels, [
      {
        name: 'from-the-statements',
        type: 'complex_practice',
        title: 'Ratios from the Statements',
        description: 'The board question: a Schedule III balance sheet with its notes and an extract of the Statement of Profit and Loss, and one ratio to work out. Watch the current maturities of a loan, the prepaid expenses, the other long-term liabilities, the sales returns and the other income.',
        generate: {
          templateIds: ['ar-from-statements-current', 'ar-from-statements-quick', 'ar-from-statements-debt-equity', 'ar-from-statements-inventory-turnover', 'ar-from-statements-net-profit'],
          count: 8,
        },
      },
      {
        name: 'effect-turnover-profit',
        type: 'medium_practice',
        title: 'Effect on Turnover and Profit Ratios',
        description: 'Will the inventory turnover, gross profit, operating, interest coverage or working capital turnover ratio rise, fall or stay, and why?',
        generate: { templateIds: ['ar-effect-turnover-profit'], count: 6 },
      },
      {
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['ar-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
