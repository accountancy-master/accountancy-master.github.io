import { buildLadder, laterLevels } from '../ladder';
import type { Card, Concept, Difficulty, McqQuestion, NumericQuestion, Question, TopicPack, TrueFalseQuestion } from '../types';

const T = 'financial-statement-analysis';

const concepts: Concept[] = [
  { id: 'fsa-meaning', topicId: T, title: 'Meaning, objectives and significance of analysis' },
  { id: 'fsa-users', topicId: T, title: 'Who uses the analysis, and for what' },
  { id: 'fsa-limitations', topicId: T, title: 'Limitations of financial statement analysis' },
  { id: 'fsa-types-tools', topicId: T, title: 'Horizontal and vertical analysis; the tools' },
  { id: 'fsa-comparative', topicId: T, title: 'Comparative statements: absolute and percentage change' },
  { id: 'fsa-common-size', topicId: T, title: 'Common size statements' },
  { id: 'fsa-reading', topicId: T, title: 'Reading comparative and common size statements' },
  { id: 'fsa-formats', topicId: T, title: 'Preparing comparative and common size statements' },
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
): Card => ({ id: `fsa-card-${n}`, topicId: T, conceptId, kind, prompt, answer, explanation, example, commonMistake });

const cards: Card[] = [
  card(1, 'fsa-meaning', 'rule', 'What is financial statement analysis?',
    'A systematic study of the figures in the financial statements: arranging them, comparing them and working out the relationships between them, so as to judge the profitability and the financial position of an enterprise. It includes interpretation, which is drawing conclusions from the comparisons.',
    'The statements record facts. Analysis turns the facts into answers to questions such as "Is the business earning enough?" and "Can it pay what it owes?"',
    'A profit of ₹6,00,000 says little by itself. A profit that is up 20% on last year, on revenue that is up 8%, says a good deal.',
    'Taking analysis to be the preparation of the statements, or an audit of them. It begins after the statements are ready and accepts them as they are.'),
  card(2, 'fsa-meaning', 'rule', 'What are the objectives of financial statement analysis?',
    'To judge the earning capacity (profitability); to judge short-term and long-term solvency; to assess the efficiency of the management; to compare the enterprise with its own past and with other enterprises; to find the reasons for a change in profit or in financial position; and to judge trends from past figures, as a starting point for planning.',
    'Each objective is a question that the bare statements do not answer until their figures are compared and related to one another.',
    'Trade receivables are up 40% while revenue is up 10%: analysis points to slower collection, a fact no single figure shows.',
    'Listing a limitation as an objective, for example "to remove the effect of price changes". Analysis does not do that. Nor does it forecast: past figures are only a guide to the future, so a trend is where planning starts, not a prediction.'),
  card(3, 'fsa-users', 'rule', 'Who uses the analysis, and what does each look for first?',
    'Management: efficiency of operations, for planning and control. Shareholders and investors: earning capacity and the safety of the investment. Long-term lenders and debentureholders: long-term solvency. Suppliers on credit: liquidity. Employees and trade unions: profits that can bear wages and bonus, and security of jobs. Government: tax and the state of industries, for policy.',
    'Everyone reads the same statements, but each with a different question, because each stands to gain or lose something different.',
    'A bank asked for a seven-year loan studies whether interest and instalments can be paid for seven years; the shop that sells the company stationery on 30 days of credit asks only about next month.',
    'Giving every user the same interest, "profit". A supplier on short credit is concerned with liquidity, not with the profit of five years hence.'),
  card(4, 'fsa-users', 'shortcut', 'Liquidity or solvency: which user asks which question?',
    'Liquidity (can dues of the next few weeks or months be paid?) is the concern of suppliers and other short-term creditors. Long-term solvency (can interest be paid and the loan repaid years later?) is the concern of banks giving term loans and of debentureholders.',
    'The length of time for which money is at risk decides the question. Owners, whose money is in for good, look at earning capacity.',
    'Goods sold on 45 days of credit: liquidity. 9% debentures redeemable after six years: long-term solvency. Equity shares: profitability.',
    'Matching a supplier with long-term solvency, or a debentureholder with day-to-day liquidity.'),
  card(5, 'fsa-limitations', 'rule', 'What are the limitations of financial statement analysis?',
    'It is historical analysis: it studies past results, with assets at historical cost and not at present values, and the past is only a guide to the future. It ignores changes in the price level. It ignores qualitative factors (skill of the management, morale, reputation). It is affected by window dressing. It is affected by differences and changes in accounting policies. Its conclusions depend on the personal judgement of the analyst. It can be no more reliable than the statements it works on.',
    'Analysis only rearranges what is in the statements. Whatever the statements leave out or distort, the analysis leaves out or distorts as well.',
    'Land bought for ₹20,00,000 long ago still stands at ₹20,00,000. Total assets, and every percentage worked on them, are understated.',
    'Believing that percentages and comparisons make the figures exact. They are only as good as the figures they start from.'),
  card(6, 'fsa-limitations', 'rule', 'What is window dressing, and why does it limit analysis?',
    'Window dressing is arranging transactions or figures near the year end so that the statements show a better position than the real one. Analysis of such statements gives a flattering and misleading picture.',
    'A balance sheet shows one day. What is done just before that day, and undone just after it, changes the picture without changing the business.',
    'A company holds back payments to suppliers until April so that cash on 31 March looks high; or repays a loan on 30 March and borrows it again on 2 April.',
    'Confusing window dressing with presenting the statements neatly in the prescribed form. It is manipulation of what the figures show.'),
  card(7, 'fsa-types-tools', 'rule', 'How do horizontal analysis and vertical analysis differ?',
    'Horizontal analysis compares the same item over two or more periods; it is also called dynamic analysis or time series analysis. Vertical analysis relates the items of the statements of one period to one another, usually to a common base; it is also called static analysis.',
    'Horizontal analysis reads across the columns of years. Vertical analysis reads down one column.',
    'Revenue of 2025-26 against revenue of 2024-25: horizontal. Employee benefits expense of 2025-26 as a percentage of revenue of 2025-26: vertical.',
    'Swapping the other names: calling vertical analysis "dynamic", or horizontal analysis "static".'),
  card(8, 'fsa-types-tools', 'rule', 'What are inter-firm and intra-firm comparison?',
    'Inter-firm comparison sets two or more enterprises side by side for the same period; it is also called cross-sectional analysis. Intra-firm comparison compares an enterprise with itself over different periods; it is also called time series analysis.',
    '"Inter" means between firms; "intra" means within one firm. A cross-sectional study always stays at one point of time; it never runs across periods.',
    'Margins of Kaveri Textiles Ltd. and Charu Garments Ltd. for 2025-26: inter-firm. Margins of Kaveri Textiles Ltd. for the last five years: intra-firm.',
    'Reading "inter" as "inside". Inter-firm comparison always needs a second firm.'),
  card(9, 'fsa-types-tools', 'rule', 'What are the tools of financial statement analysis, and what does each do?',
    'Comparative statements: the change in each line between two periods, in rupees and as a percentage (horizontal). Common size statements: each line of one period as a percentage of a common base (vertical). Ratio analysis: the relationship between two related figures as one number. Cash flow analysis: where cash came from and where it went.',
    'The tool is chosen by the question. "How much did it change?" needs comparative statements; "What share does it take?" needs common size statements.',
    '"By what percentage did finance costs rise?" Comparative statement. "What part of revenue goes on finance costs?" Common size statement.',
    'Calling the trial balance or the balance sheet a tool of analysis. They are what is analysed, not the means of analysing.'),
  card(10, 'fsa-comparative', 'format', 'What are the columns of a comparative statement?',
    'Particulars; Note No.; figures of the previous year; figures of the current year; absolute change (increase or decrease); percentage change (increase or decrease).',
    'The first two amount columns come from the statements. The last two are worked out line by line. A decrease is shown in brackets or with a minus sign.',
    'Other expenses: ₹5,00,000; ₹4,00,000; (₹1,00,000); (20%).',
    'Leaving a decrease unmarked, so that it reads as an increase; or putting the current year before the previous year.'),
  card(11, 'fsa-comparative', 'formula', 'How is the absolute change of a line found?',
    'Absolute change = figure of the current year - figure of the previous year. A positive answer is an increase; a negative one is a decrease.',
    'The change is measured from the earlier figure to the later one, never the other way.',
    'Revenue from operations ₹40,00,000 last year and ₹50,00,000 this year: 50,00,000 - 40,00,000 = ₹10,00,000, an increase.',
    'Deducting the current year from the previous year, which turns every increase into a decrease.'),
  card(12, 'fsa-comparative', 'formula', 'How is the percentage change of a line found?',
    'Percentage change = absolute change ÷ figure of the PREVIOUS year × 100.',
    'The previous year is the base from which the change is measured, so it is the figure divided by.',
    'Revenue ₹40,00,000 to ₹50,00,000: 10,00,000 ÷ 40,00,000 × 100 = 25%. Dividing by 50,00,000 would give 20%, which is wrong.',
    'Dividing the change by the current year\'s figure; or giving the current year as a percentage of the previous year (125%) in place of the change (25%).'),
  card(13, 'fsa-comparative', 'rule', 'What if a line is nil in one of the two years?',
    'Nil in the previous year: the absolute change is shown, but no percentage can be worked out, because the base is nil; the column carries a dash. Nil in the current year: the change is a decrease of the whole figure, and the percentage is 100% (a decrease).',
    'A percentage needs a base to divide by. Only a nil PREVIOUS year takes the base away.',
    'Other income nil last year, ₹50,000 this year: change ₹50,000, percentage not calculable. Other income ₹50,000 last year, nil this year: (₹50,000), (100%).',
    'Writing 100% for a line that is new this year, or 0% for either case.'),
  card(14, 'fsa-comparative', 'shortcut', 'How is a missing figure found from a percentage change?',
    'Take the previous year as 100. Current year = previous year × (100 + increase %) ÷ 100, or (100 - decrease %) ÷ 100. Previous year = current year × 100 ÷ (100 + increase %), or ÷ (100 - decrease %). Previous year = absolute change × 100 ÷ percentage change.',
    'The percentage is always a percentage of the previous year, so the previous year is 100 in every one of these.',
    'Current year ₹46,00,000 after an increase of 15%: previous year = 46,00,000 × 100 ÷ 115 = ₹40,00,000 (not 46,00,000 less 15% of it).',
    'Taking the percentage off the current year\'s figure to get back to the previous year.'),
  card(15, 'fsa-comparative', 'rule', 'How is the change of a total or a profit (total income, total expenses, profit before tax, tax, profit after tax) found?',
    'Work the derived line out for each year from the lines above it, then take its own absolute change and divide by its own previous year\'s figure. Tax at a rate is worked on the profit before tax of each year.',
    'A total has its own base. The percentages of the lines that make it up are never added or averaged. (Older papers and answer keys call total income "Total Revenue": it is the same line.)',
    'Total income ₹42,00,000 and ₹50,40,000: change ₹8,40,000, which is 20% of 42,00,000, whatever the separate percentages of revenue and other income.',
    'Adding the percentage changes of the lines to get the percentage change of their total.'),
  card(16, 'fsa-common-size', 'formula', 'How is a common size Statement of Profit and Loss prepared?',
    'Revenue from operations is taken as 100. Percentage of a line = the line ÷ revenue from operations × 100. Other income is itself a percentage of revenue from operations, so total income comes to more than 100.',
    'Every line, income or expense or profit, is measured against the main activity of the business in the same year.',
    'Revenue from operations ₹50,00,000, other income ₹2,00,000, employee benefits expense ₹7,50,000: 100%, 4% (total income 104%) and 15%.',
    'Taking total income as the base, which makes every percentage a little too small. (A few books do take total revenue as 100; the CBSE textbooks and marking schemes take revenue from operations, and a question here says so.)'),
  card(17, 'fsa-common-size', 'formula', 'How is a common size balance sheet prepared?',
    'The total of the balance sheet is taken as 100: total assets on one side, total equity and liabilities on the other (the same figure). Percentage of a line = the line ÷ total of the balance sheet × 100. Sub-totals such as current assets are percentages of the same total.',
    'Each percentage shows what part of all the resources, or of all the sources of funds, the line makes up.',
    'Total assets ₹80,00,000, inventories ₹12,00,000, non-current assets ₹48,00,000: inventories 15%, non-current assets 60%.',
    'Working a line as a percentage of its own sub-total (inventories on current assets), or taking non-current assets alone as total assets.'),
  card(18, 'fsa-common-size', 'shortcut', 'How is an amount, or the base, found from a common size percentage?',
    'Amount of a line = its percentage × the base ÷ 100. Base = amount of the line × 100 ÷ its percentage. The base is revenue from operations (Statement of Profit and Loss) or the total of the balance sheet.',
    'It is the same relationship read three ways: line ÷ base × 100 = percentage.',
    'Finance costs ₹1,20,000 stand at 4%: revenue from operations = 1,20,000 × 100 ÷ 4 = ₹30,00,000.',
    'Taking 4% of the line (₹4,800) when the base is wanted, or applying the percentage to total income.'),
  card(19, 'fsa-reading', 'rule', 'How is a comparative statement read?',
    'Compare rates of change, not rupee amounts. A line that grows faster than revenue from operations takes a larger share of it; if total expenses grow faster than revenue, a smaller part of each rupee of revenue is left as profit, even when profit in rupees still rises.',
    'A big figure moves by a big amount even at a low rate. The percentage column makes lines of different sizes comparable.',
    'Revenue up 15% (₹7,50,000) and expenses up 20% (₹7,20,000): profit rose by ₹30,000, but the margin narrowed.',
    'Picking the line with the largest rupee change as the one that grew fastest.'),
  card(20, 'fsa-reading', 'rule', 'How is a common size statement read?',
    'Each percentage is the share of the base that the line takes in that period. A higher percentage for a cost means that more of every ₹100 of revenue is used up by it and less is left as profit. A change in a share is a change in percentage points; it is not the percentage change of the amount.',
    'The amount of a line can rise while its share falls, when revenue rises faster, and the other way round.',
    'Cost of materials consumed at 55% last year and 60% this year: ₹5 more of every ₹100 of revenue goes on materials. It does not mean the amount rose by 5%.',
    'Reading "55% to 60%" as "the cost rose by 5%".'),
];

// ---------------------------------------------------------------------------------------------------------------
// Authored questions
// ---------------------------------------------------------------------------------------------------------------

const qid = (n: number): string => `fsa-q-${String(n).padStart(3, '0')}`;

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

/** A typed answer: `unit` 'rupees' takes whole rupees, 'percent' a percentage (12.5 for 12.5%); both are stored in hundredths. */
const num = (
  n: number,
  conceptId: string,
  difficulty: Difficulty,
  unit: 'rupees' | 'percent',
  prompt: string,
  answer: number,
  errors: [number, string][],
  working: string[],
  hints: string[],
): NumericQuestion => ({
  id: qid(n), topicId: T, conceptId, difficulty, type: 'numeric', unit, prompt, answer: Math.round(answer * 100),
  commonErrors: errors.map(([value, why]) => ({ value: Math.round(value * 100), why })), working, hints, explanation: working.join(' '),
});

const AR = 'Which is correct?';
const AR_BOTH_EXPLAINS = 'Both A and R are true, and R is the correct explanation of A';
const AR_BOTH_NOT = 'Both A and R are true, but R is not the correct explanation of A';
const AR_A_ONLY = 'A is true, but R is false';
const AR_R_ONLY = 'A is false, but R is true';

const questions: Question[] = [
  // ---- Meaning, objectives and significance ----
  mcq(1, 'fsa-meaning', 'easy', 'Financial statement analysis is best described as:',
    'A systematic study of the financial statements to judge the profitability and the financial position of an enterprise',
    [
      ['Recording the transactions of the year in the journal and the ledger', 'Mixed analysis up with book-keeping, which is done long before any statement exists.'],
      ['Preparing the balance sheet and the Statement of Profit and Loss in the prescribed form', 'Mixed analysis up with the preparation of the statements. Analysis begins once they are ready.'],
      ['Checking the books to report whether the statements give a true and fair view', 'That is an audit. Analysis accepts the statements and studies what they say.'],
    ],
    'Analysis takes the finished statements, compares and relates their figures, and draws conclusions about profitability and financial position.',
    ['Does analysis come before or after the statements are prepared?', 'It studies the statements; it does not write or check them.']),
  tf(2, 'fsa-meaning', 'easy', 'Financial statement analysis includes interpretation: drawing conclusions from the figures once they have been compared.', true,
    'Analysis in the wider sense covers both steps: working out the comparisons and relationships, and then interpreting them. Figures that are compared but not interpreted answer no question.',
    ['What use is a percentage if nobody says what it means?', 'Analysis and interpretation go together.']),
  mcq(3, 'fsa-meaning', 'medium', `Assertion (A): Analysis of financial statements is useful to a person deciding whether to lend to a company. Reason (R): Analysis brings out the liquidity and the solvency of the company from figures which, taken one by one, say little. ${AR}`,
    AR_BOTH_EXPLAINS,
    [
      [AR_BOTH_NOT, 'Missed the link: a lender finds the analysis useful exactly because it shows whether the company can pay.'],
      [AR_A_ONLY, 'Denied that analysis shows liquidity and solvency. Judging them is one of its objectives.'],
      [AR_R_ONLY, 'Denied that a lender has any use for the analysis. Lenders are among its main users.'],
    ],
    'A lender wants to know whether interest and principal will be paid. Analysis shows the ability to pay, which is why it is useful to the lender: R explains A.',
    ['What does a lender most want to know?', 'Does R give the reason why A is true?']),
  mcq(4, 'fsa-meaning', 'medium', 'The statements of a company show a profit of ₹12,00,000 for the year, and its directors call the year excellent. What should an analyst do before agreeing?',
    'Compare the profit with that of earlier years, with the resources used to earn it and with similar companies',
    [
      ['Agree, because ₹12,00,000 is a large sum', 'Judged a figure by its size alone. A figure means little until it is set beside another.'],
      ['Work the profit out again from the vouchers and the books', 'That is the work of an auditor. Analysis starts from the statements as they stand.'],
      ['Check the cash at bank, since a good profit and a good cash balance are the same thing', 'Took profit for cash. They differ, and a cash balance does not show how good the year was.'],
    ],
    'A single figure has nothing to be measured against. Analysis compares it with other periods, other firms and related figures before judging it.',
    ['Large compared with what?', 'Think of what a comparative statement adds to one year\'s figure.']),
  tf(5, 'fsa-meaning', 'medium', 'Only the management of a company can analyse its financial statements, because outsiders have no figures to work on.', false,
    'The financial statements of a company are published. Investors, lenders, suppliers and others analyse them from outside; management, which has more detail, analyses them from inside.',
    ['Who receives the annual report of a company?', 'Think of an investor choosing between two companies.']),

  // ---- Users ----
  tf(6, 'fsa-users', 'easy', 'A supplier who sells goods to a company on 30 days of credit is more concerned with its long-term solvency than with its liquidity.', false,
    'The supplier\'s money is at risk for 30 days, so the question is whether the company can pay its short-term dues: liquidity. Long-term solvency matters most to those who lend for years.',
    ['For how long is the supplier\'s money at risk?', 'Short credit, short-term question.']),
  mcq(7, 'fsa-users', 'easy', 'The management of a company analyses the company\'s own financial statements mainly in order to:',
    'Judge the efficiency of its operations and decide what to correct and what to plan',
    [
      ['Decide whether to grant the company a loan', 'That is the purpose of a lender, who stands outside the company.'],
      ['Assess the tax that the company must pay to the government', 'That is the purpose of the tax authorities.'],
      ['Decide whether to supply goods to the company on credit', 'That is the purpose of a supplier.'],
    ],
    'Management runs the business, so it uses analysis for planning, control and decisions: where the business is efficient and where it is not.',
    ['What does a manager do with the answer?', 'The other three options are questions outsiders ask.']),
  mcq(8, 'fsa-users', 'medium', `Assertion (A): Employees and their unions are interested in the analysis of the financial statements of their employer. Reason (R): Wage rises, bonus and the security of jobs depend on the profitability and the stability of the enterprise. ${AR}`,
    AR_BOTH_EXPLAINS,
    [
      [AR_BOTH_NOT, 'Missed the link: employees study the statements because their pay and their jobs depend on what the statements show.'],
      [AR_A_ONLY, 'Denied that pay and job security depend on the results of the enterprise.'],
      [AR_R_ONLY, 'Took employees to have no interest in the statements. They are among the users of analysis.'],
    ],
    'Employees look at profitability to support claims for wages and bonus, and at stability for the security of their jobs. R is the reason for A.',
    ['What do employees stand to gain or lose?', 'Does R explain why A is so?']),
  mcq(9, 'fsa-users', 'medium', 'Three people read the same financial statements of a company: a banker asked for a ten-year loan, a wholesaler asked for 60 days of credit, and a person thinking of buying its equity shares. What is the first concern of each, in that order?',
    'Long-term solvency; liquidity; earning capacity',
    [
      ['Liquidity; long-term solvency; earning capacity', 'Swapped the banker and the wholesaler. Ten years is a long-term question; 60 days is a short-term one.'],
      ['Earning capacity; liquidity; long-term solvency', 'Swapped the banker and the buyer of shares. A lender is paid interest whatever the profit; an owner is paid out of profit.'],
      ['Long-term solvency; earning capacity; liquidity', 'Swapped the wholesaler and the buyer of shares. The wholesaler needs to be paid in 60 days; the owner\'s return comes from profits.'],
    ],
    'A long loan depends on solvency over the years; short credit depends on liquidity; a share depends on what the company can earn.',
    ['How long is each person\'s money at risk?', 'Who is paid out of profits?']),
  tf(10, 'fsa-users', 'easy', 'The government uses the analysis of financial statements, among other things, to assess taxes and to frame policy for particular industries.', true,
    'Tax authorities check the profit on which tax is charged, and the government studies the results of industries when it decides on duties, subsidies and regulation.',
    ['Why would a ministry read company accounts?', 'Think of tax and of policy.']),

  // ---- Limitations ----
  mcq(11, 'fsa-limitations', 'easy', 'Which of the following is NOT a limitation of financial statement analysis?',
    'It allows one firm to be compared with another',
    [
      ['It ignores changes in the price level', 'This is a limitation: figures of different years are in rupees of different purchasing power.'],
      ['It does not take qualitative factors into account', 'This is a limitation: skill, morale and reputation are not measured in money.'],
      ['It can be misleading when the statements have been window dressed', 'This is a limitation: analysis repeats whatever picture the statements were made to show.'],
    ],
    'Making inter-firm comparison possible is a use of analysis. The other three are weaknesses that an analyst must keep in mind.',
    ['Three of these are weaknesses. Which is a strength?', 'What does analysis make possible?']),
  tf(12, 'fsa-limitations', 'easy', 'Financial statement analysis allows for the fall in the purchasing power of money over the years.', false,
    'Analysis works on the figures as they are recorded and ignores changes in the price level, so figures of different years are not strictly comparable.',
    ['Are rupees of ten years ago adjusted before they are compared?', 'This is one of the listed limitations.']),
  mcq(13, 'fsa-limitations', 'medium', `Assertion (A): Conclusions drawn by comparing the financial statements of two companies may mislead. Reason (R): The two companies may follow different accounting policies, for example for depreciation and for the valuation of inventories. ${AR}`,
    AR_BOTH_EXPLAINS,
    [
      [AR_BOTH_NOT, 'Missed the link: different policies are exactly what makes the two sets of figures not comparable.'],
      [AR_A_ONLY, 'Denied that companies may follow different policies. They may choose among permitted methods.'],
      [AR_R_ONLY, 'Took inter-firm comparison to be always reliable. Different policies can distort it.'],
    ],
    'Profit and asset figures depend on the methods used. When the methods differ, the figures differ for that reason alone, so R explains A.',
    ['Would two methods of depreciation give the same profit?', 'Does R give a cause of A?']),
  mcq(14, 'fsa-limitations', 'medium', 'Window dressing of financial statements means:',
    'Arranging transactions or figures near the year end so that the statements show a better position than the real one',
    [
      ['Presenting the statements in the form prescribed by Schedule III', 'Mixed it up with the prescribed form, which is a legal requirement and hides nothing.'],
      ['Rounding the figures off to the nearest thousand or lakh', 'Rounding off is permitted presentation. It does not change what the statements show.'],
      ['Showing the figures of the previous year beside those of the current year', 'Previous year\'s figures are required to be shown, and they help the reader.'],
    ],
    'Window dressing makes the statements look better than the facts, so an analysis of them is misleading.',
    ['Which option changes the picture and not just the presentation?', 'Think of something done on 30 March and undone on 2 April.']),
  tf(15, 'fsa-limitations', 'medium', 'Because analysis is done on audited financial statements, its conclusions do not depend on anyone\'s personal judgement.', false,
    'The statements rest on estimates and choices (useful lives, provisions, methods), and the analyst chooses what to compare and how to read it. Personal judgement enters at both stages.',
    ['Who decides the useful life of a machine?', 'Who decides what a change of 12% means?']),
  mcq(16, 'fsa-limitations', 'medium', 'An analyst finds that the net profit of company A is 12% of its revenue and that of company B is 9%, and concludes that A is better managed. A depreciates its assets by the straight line method and B by the written down value method. What in these facts calls for caution?',
    'The two profits are worked out under different accounting policies, so they are not strictly comparable',
    [
      ['Percentages cannot be used to compare two companies', 'Percentages are the usual way to compare companies. The trouble here lies in how the profits were worked out.'],
      ['Only one year of one company is being studied', 'Two companies are compared here, so each figure does have another beside it.'],
      ['The statements of both companies have been window dressed', 'Nothing in the facts says that the figures were arranged for the year end.'],
    ],
    'Depreciation under the two methods differs, so the profits differ for that reason alone. Comparison across different policies is a limitation of analysis.',
    ['What is different between A and B besides the percentage?', 'Would B\'s profit be the same under the straight line method?']),
  tf(17, 'fsa-limitations', 'easy', 'One limitation of financial statement analysis is that it is based on financial statements which have limitations of their own.', true,
    'Analysis adds nothing to the data. Historical cost, estimates and omissions in the statements pass straight into the analysis.',
    ['Can a calculation be better than the figures put into it?', 'Analysis only rearranges what the statements contain.']),

  // ---- Types of analysis and tools ----
  mcq(18, 'fsa-types-tools', 'easy', 'Comparative statements are a tool of:',
    'Horizontal analysis',
    [
      ['Vertical analysis', 'Vertical analysis relates the items of one period to a common base, which is what common size statements do.'],
      ['Cash flow analysis', 'Cash flow analysis traces the movement of cash. A comparative statement compares every line of two periods.'],
      ['Book-keeping', 'Book-keeping records transactions. A comparative statement is prepared from finished statements, to analyse them.'],
    ],
    'A comparative statement sets two periods side by side and measures the change in each line: it reads across periods, which is horizontal analysis.',
    ['Does it read across years or down one year?', 'It needs two periods.']),
  mcq(19, 'fsa-types-tools', 'easy', 'Common size statements are a tool of:',
    'Vertical analysis',
    [
      ['Horizontal analysis', 'Horizontal analysis compares the same item across periods, which is what comparative statements do.'],
      ['Time series analysis', 'Time series analysis follows figures across periods. A common size statement stays within one period.'],
      ['Cash flow analysis', 'Cash flow analysis traces the movement of cash. A common size statement shows each line as a share of a base.'],
    ],
    'A common size statement relates each line to a base of the same period: it reads down one column, which is vertical analysis.',
    ['Does it need a second year?', 'Each line is compared with a figure of the same statement.']),
  tf(20, 'fsa-types-tools', 'easy', 'Horizontal analysis needs the figures of at least two periods.', true,
    'It compares the same item over time, so there must be an earlier figure and a later one.',
    ['What does "change" need?', 'One period gives nothing to compare across.']),
  tf(21, 'fsa-types-tools', 'easy', 'Vertical analysis is also known as dynamic analysis.', false,
    'Vertical analysis is static analysis: it studies one period. Dynamic analysis is another name for horizontal analysis, which moves across periods.',
    ['Which kind of analysis moves through time?', 'Static means standing at one point of time.']),
  mcq(22, 'fsa-types-tools', 'medium', 'Which of these pairs is correctly matched?',
    'Time series analysis: one enterprise studied over several periods',
    [
      ['Cross-sectional analysis: one enterprise studied over several periods', 'Cross-sectional analysis sets different enterprises side by side at one point of time. A study over several periods is a time series.'],
      ['Vertical analysis: the same item compared over several years', 'That describes horizontal analysis. Vertical analysis stays within one period.'],
      ['Intra-firm comparison: two enterprises compared for the same year', 'That describes inter-firm comparison. Intra-firm comparison is of a firm with itself.'],
    ],
    'Time series analysis follows one enterprise through time (intra-firm comparison, horizontal analysis). Cross-sectional analysis compares different enterprises at one point of time (inter-firm comparison).',
    ['"Series" suggests a run of periods.', '"Intra" means within.']),
  mcq(23, 'fsa-types-tools', 'medium', `Assertion (A): A common size statement can be prepared from the figures of a single year. Reason (R): It expresses each item as a percentage of a base taken from the same statement. ${AR}`,
    AR_BOTH_EXPLAINS,
    [
      [AR_BOTH_NOT, 'Missed the link: no second year is needed precisely because the base comes from the same statement.'],
      [AR_A_ONLY, 'Denied how the statement is made. Its base is revenue from operations or the total of the balance sheet of the same period.'],
      [AR_R_ONLY, 'Took a common size statement to need two years, like a comparative statement.'],
    ],
    'Since every percentage is worked on a figure of the same period, one period is enough. R explains A.',
    ['Where does the base of 100 come from?', 'Compare with a comparative statement, which needs two years.']),
  mcq(24, 'fsa-types-tools', 'easy', 'Which of the following is NOT a tool of financial statement analysis?',
    'Trial balance',
    [
      ['Comparative statements', 'This is a tool: it measures the change in each line between two periods.'],
      ['Ratio analysis', 'This is a tool: it expresses the relationship between two related figures as one number.'],
      ['Cash flow analysis', 'This is a tool: it traces where cash came from and where it went.'],
    ],
    'A trial balance is a step in preparing the accounts. The tools of analysis are comparative statements, common size statements, ratio analysis and cash flow analysis.',
    ['Which one belongs to the preparation of accounts?', 'There are four tools in the syllabus.']),
  mcq(25, 'fsa-types-tools', 'medium', 'A lender wants to know (i) how the total assets of a borrower are made up on the last balance sheet date, and (ii) how each asset has moved since the balance sheet before it. Which tools answer (i) and (ii), in that order?',
    'Common size balance sheet; comparative balance sheet',
    [
      ['Comparative balance sheet; common size balance sheet', 'Put the tools the wrong way round. The make-up of one date is a common size question; movement between dates is a comparative one.'],
      ['Common size balance sheet for both', 'A common size balance sheet of one date shows shares of the total, not the change in each asset.'],
      ['Comparative balance sheet for both', 'A comparative balance sheet shows changes, not what share of the total each asset makes up.'],
    ],
    '(i) is about structure on one date: vertical analysis, common size. (ii) is about change between two dates: horizontal analysis, comparative.',
    ['Which question needs two dates?', 'Structure or change?']),
  tf(26, 'fsa-types-tools', 'medium', 'Two firms can be compared only if they are of about the same size.', false,
    'Common size statements (and ratios) take size out: each line becomes a percentage of a base, and percentages can be compared whatever the size of the firms.',
    ['Why are common size statements called "common size"?', 'What happens to size when every line is a percentage?']),

  // ---- Comparative statements ----
  mcq(27, 'fsa-comparative', 'easy', 'In a comparative statement, the percentage change of a line is worked out as:',
    'Absolute change ÷ figure of the previous year × 100',
    [
      ['Absolute change ÷ figure of the current year × 100', 'Took the current year as the base. A change is measured from the previous year.'],
      ['Figure of the current year ÷ figure of the previous year × 100', 'That gives the current year as a percentage of the previous year (say 125%), not the change (25%).'],
      ['Absolute change ÷ revenue from operations × 100', 'Used the base of a common size statement. A percentage change is worked on the same line of the previous year.'],
    ],
    'The previous year is the base. Percentage change = (current year - previous year) ÷ previous year × 100.',
    ['From which year is the change measured?', 'The base is the figure the line started from.']),
  num(28, 'fsa-comparative', 'easy', 'percent', 'Revenue from operations of Meenal Paints Ltd. was ₹20,00,000 in 2024-25 and ₹25,00,000 in 2025-26. What percentage increase does its comparative Statement of Profit and Loss show? Give the percentage to two decimal places if it is not a whole number.', 25,
    [[20, 'Divided the change by the figure of 2025-26. The base is the figure of 2024-25.'], [125, 'Gave the figure of 2025-26 as a percentage of that of 2024-25, in place of the change.']],
    ['Absolute change = ₹25,00,000 - ₹20,00,000 = ₹5,00,000.', 'Percentage change = ₹5,00,000 ÷ ₹20,00,000 × 100 = 25%.'],
    ['Find the change first.', 'Divide by the earlier year.']),
  num(29, 'fsa-comparative', 'easy', 'rupees', 'Employee benefits expense of Harit Agro Ltd. was ₹8,00,000 in 2024-25. Its comparative Statement of Profit and Loss shows an increase of 15% for 2025-26. What is the figure for 2025-26?', 920000,
    [[120000, 'Gave the absolute change, not the figure of 2025-26.'], [680000, 'Took the increase as a decrease.']],
    ['Absolute change = 15% of ₹8,00,000 = ₹1,20,000.', 'Figure for 2025-26 = ₹8,00,000 + ₹1,20,000 = ₹9,20,000.'],
    ['15% of which figure?', 'An increase is added to the earlier figure.']),
  mcq(30, 'fsa-comparative', 'medium', 'Which columns, after "Particulars" and "Note No.", make up a comparative balance sheet?',
    'Previous year\'s figure; current year\'s figure; absolute change; percentage change',
    [
      ['Current year\'s figure; percentage of total assets', 'That is a common size balance sheet, which has no column of change.'],
      ['Debit balance; credit balance', 'Those are the columns of a trial balance.'],
      ['Previous year\'s figure; current year\'s figure; percentage of revenue from operations', 'Mixed a comparative statement with a common size Statement of Profit and Loss.'],
    ],
    'A comparative statement has the figures of the two periods followed by the absolute change and the percentage change of each line.',
    ['It must show two periods and what happened between them.', 'Two columns of figures, two columns of change.']),
  tf(31, 'fsa-comparative', 'medium', 'Finance costs were nil last year and are ₹50,000 this year. The comparative statement shows an increase of 100% for this line.', false,
    'The absolute change is ₹50,000, but the percentage is change ÷ previous year × 100 and the previous year is nil, so no percentage can be worked out. The column is left with a dash.',
    ['What is the base?', 'Can anything be divided by nil?']),
  tf(32, 'fsa-comparative', 'medium', 'In a comparative Statement of Profit and Loss, the percentage change in total expenses is found by adding together the percentage changes of the separate expenses.', false,
    'Total expenses are worked out for each year, and the change in the total is divided by the total of the previous year. Percentages worked on different bases cannot be added.',
    ['Does each expense have the same base?', 'Work on the totals themselves.']),
  mcq(33, 'fsa-comparative', 'medium', 'Other expenses of a company fell from ₹5,00,000 to ₹4,00,000. How is this shown in the last two columns of its comparative statement?',
    '(₹1,00,000) and (20%), the brackets showing a decrease',
    [
      ['₹1,00,000 and 20%, with nothing to mark the direction', 'Left the decrease unmarked, so that it reads as an increase. A decrease is shown in brackets or with a minus sign.'],
      ['(₹1,00,000) and (25%), the brackets showing a decrease', 'Divided the change by the current year\'s ₹4,00,000. The base is the previous year\'s ₹5,00,000.'],
      ['₹1,00,000 and 25%, as an increase', 'Read the years the wrong way round: from ₹4,00,000 up to ₹5,00,000.'],
    ],
    'Change = ₹4,00,000 - ₹5,00,000 = -₹1,00,000; percentage = 1,00,000 ÷ 5,00,000 × 100 = 20%. Both are decreases and are shown in brackets.',
    ['Current year less previous year.', 'How does a statement show a negative figure?']),
  mcq(34, 'fsa-comparative', 'complex', 'The profit before tax of a company rose from ₹10,00,000 to ₹12,00,000. Tax is 30% of profit before tax in both years. What percentage change does the comparative statement show for profit after tax?',
    '20%, the same as for profit before tax',
    [
      ['14%: the 20% reduced by tax at 30%', 'Applied the tax rate to the percentage. With the same rate in both years, profit after tax is 70% of profit before tax each year, so it moves by the same percentage.'],
      ['16.67%', 'Divided the change in profit after tax by the figure of the current year. The base is the previous year.'],
      ['30%', 'Gave the rate of tax, not the change in profit after tax.'],
    ],
    'Profit after tax = 70% of profit before tax: ₹7,00,000 and ₹8,40,000. Change = ₹1,40,000; ₹1,40,000 ÷ ₹7,00,000 × 100 = 20%.',
    ['Work out profit after tax for each year.', 'Then take its own change on its own base.']),

  // ---- Common size statements ----
  tf(35, 'fsa-common-size', 'easy', 'In a common size Statement of Profit and Loss, total income is taken as 100.', false,
    'Revenue from operations is the base in the CBSE textbooks and marking schemes (a few other books take total revenue). Other income is shown as a percentage of it, so total income comes to more than 100 whenever there is other income.',
    ['What is the main activity of the business called in the statement?', 'Other income is not part of the base.']),
  num(36, 'fsa-common-size', 'easy', 'percent', 'For 2025-26, Bhaskar Tools Ltd. has revenue from operations of ₹40,00,000, other income of ₹2,00,000 and total expenses of ₹32,00,000, of which ₹22,00,000 is cost of materials consumed. At what percentage is cost of materials consumed shown in its common size Statement of Profit and Loss (revenue from operations = 100)? Give the percentage to two decimal places if it is not a whole number.', 55,
    [[52.38, 'Took total income (₹42,00,000) as the base. The base stated is revenue from operations.'], [68.75, 'Expressed the line as a percentage of total expenses.']],
    ['Revenue from operations is taken as 100.', 'Cost of materials consumed = ₹22,00,000 ÷ ₹40,00,000 × 100 = 55%.'],
    ['Which figure is the 100 of this statement?', 'Other income is not part of the base.']),
  num(37, 'fsa-common-size', 'medium', 'rupees', 'In the common size balance sheet of Charu Garments Ltd., shareholders\' funds are 55% and non-current liabilities are 25%. The rest is current liabilities. The total of the balance sheet is ₹50,00,000. Find the amount of current liabilities.', 1000000,
    [[4000000, 'Gave shareholders\' funds and non-current liabilities together (80%), not what is left for current liabilities.'], [2250000, 'Deducted only shareholders\' funds from the total and left non-current liabilities in.']],
    ['The equity and liabilities add up to 100%: current liabilities = 100% - 55% - 25% = 20%.', 'Current liabilities = 20% of ₹50,00,000 = ₹10,00,000.'],
    ['What do the percentages of one side of the balance sheet add up to?', 'Find the missing percentage first.']),
  tf(38, 'fsa-common-size', 'medium', 'In a common size balance sheet, the percentages of all the assets add up to 100.', true,
    'Each asset is a percentage of total assets, so together they make up the whole, 100. The same holds for the equity and liabilities.',
    ['What is the base?', 'Parts of a whole add up to the whole.']),
  mcq(39, 'fsa-common-size', 'medium', 'Which statement about a common size balance sheet is true?',
    'Total assets and total equity and liabilities are each shown as 100',
    [
      ['Each item is a percentage of the same item on the previous balance sheet date', 'That is the percentage change of a comparative balance sheet.'],
      ['Shareholders\' funds are taken as 100 and the other items are related to them', 'Took the owners\' part as the base. The base is the total of the balance sheet.'],
      ['Assets are shown as percentages of revenue from operations', 'Revenue from operations is the base of the common size Statement of Profit and Loss, not of the balance sheet.'],
    ],
    'The base is the total of the balance sheet, which is the same on both sides, so each side adds up to 100.',
    ['What figure is common to both sides of a balance sheet?', 'Every line is a part of that figure.']),
  mcq(40, 'fsa-common-size', 'medium', `Assertion (A): In a common size Statement of Profit and Loss, total income may be shown as more than 100%. Reason (R): The base is revenue from operations, and other income is added to it to arrive at total income. ${AR}`,
    AR_BOTH_EXPLAINS,
    [
      [AR_BOTH_NOT, 'Missed the link: total income passes 100 exactly because other income is added to a base that is already 100.'],
      [AR_A_ONLY, 'Denied what the base is. Revenue from operations is 100, and other income is a percentage of it.'],
      [AR_R_ONLY, 'Took 100 to be the largest figure a common size statement can show. Total income is revenue from operations plus other income.'],
    ],
    'Revenue from operations 100 + other income (say 4) = total income 104. R explains A.',
    ['Which line is 100?', 'What is added to it?']),
  tf(41, 'fsa-common-size', 'easy', 'A common size statement can be used to compare two companies of very different sizes.', true,
    'Every line is a percentage of a common base, so the size of the company drops out and the structures can be compared.',
    ['What is left once every figure is a percentage?', 'This is why the statement is called "common size".']),

  // ---- Reading the statements ----
  mcq(42, 'fsa-reading', 'medium', 'A comparative Statement of Profit and Loss shows revenue from operations up by 10% and cost of materials consumed up by 18%. What is the most reasonable reading?',
    'Material cost is rising faster than revenue, so it takes a larger share of revenue and needs to be looked into',
    [
      ['The company has become more efficient, since both figures have risen', 'Took any rise as good. A cost rising faster than revenue is a warning.'],
      ['Profit must have fallen in rupees', 'Not necessarily: other costs may have risen slowly, and a faster rate on a smaller figure can still be a smaller amount.'],
      ['Nothing can be read, because the amounts are not given', 'Rates of growth can be compared without the amounts. That is what the percentage column is for.'],
    ],
    'A cost that grows faster than revenue uses up more of each rupee of revenue. Whether profit fell depends on the other lines.',
    ['Compare the two rates.', 'What happens to the share of a cost that outgrows revenue?']),
  mcq(43, 'fsa-reading', 'medium', 'In the common size balance sheets of a company, non-current assets move from 60% to 45% of total assets and current assets from 40% to 55%. What does this show?',
    'A larger part of the company\'s resources is now held in current assets',
    [
      ['Non-current assets fell by 15% in amount', 'Read a fall of 15 percentage points in the share as a 15% fall in the amount. The amounts are not given.'],
      ['Current assets rose by 15% in amount', 'Read a rise of 15 percentage points in the share as a 15% rise in the amount.'],
      ['Total assets have fallen', 'A common size balance sheet shows shares of the total. It says nothing about how the total itself moved.'],
    ],
    'Common size percentages show structure: the mix of assets has shifted towards current assets. Amounts and their changes need a comparative balance sheet.',
    ['What does a common size percentage measure?', 'Share of the total, or change in the amount?']),
  tf(44, 'fsa-reading', 'medium', 'If the common size percentage of an expense falls from one year to the next, the amount of that expense must have fallen.', false,
    'The percentage is the expense divided by the revenue of the same year. If revenue grows faster than the expense, the share falls even though the amount rises.',
    ['What else changes besides the expense?', 'Try ₹20 on ₹100, then ₹30 on ₹200.']),
  mcq(45, 'fsa-reading', 'complex', 'A comparative Statement of Profit and Loss shows these percentage changes: revenue from operations +20%, employee benefits expense +5%, finance costs +60%, profit before tax +8%. Which line should the management look into first?',
    'Finance costs: they grew three times as fast as revenue from operations',
    [
      ['Revenue from operations: it is the largest figure', 'Chose by size. The question is which line moved out of step with the others.'],
      ['Employee benefits expense: it increased', 'It grew by only 5%, far slower than revenue, so its share of revenue fell.'],
      ['Profit before tax: it increased by 8%', 'A rise in profit is the outcome. The line that held profit back to 8% when revenue grew 20% is the one to examine.'],
    ],
    'A cost that grows much faster than revenue takes a growing share of it. Finance costs at +60% against revenue at +20% explain why profit rose by only 8%.',
    ['Compare each rate with the 20% of revenue.', 'Which line is furthest out of step?']),
  tf(46, 'fsa-reading', 'easy', 'A comparative statement shows how each line changed between two periods, while a common size statement shows the make-up of a single period.', true,
    'Comparative statements are horizontal (change over time); common size statements are vertical (structure at one time). The two answer different questions and are often used together.',
    ['Which one needs two periods?', 'Change or structure?']),
];

// ---------------------------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------------------------

const levels = buildLadder(T, {
  concept: {
    title: 'Making Statements Speak',
    description: 'See why figures have to be compared before they mean anything, and the two ways of comparing them.',
    lesson: [
      {
        type: 'text',
        heading: 'A figure taken alone says little',
        body: 'Kaveri Textiles Ltd. reports revenue from operations of ₹50,00,000 and a profit of ₹6,00,000. Was it a good year? Nobody can say yet. If last year\'s profit was ₹4,00,000, things look good; if it was ₹9,00,000, they do not. Financial statement analysis is the study that sets the figures of the statements beside other figures (last year\'s, another company\'s, or other lines of the same statement) and draws conclusions. Different readers want different conclusions: owners ask what the company can earn, a bank asks whether a long loan will be repaid, a supplier asks whether next month\'s bill will be paid, employees ask about wages and jobs, the government about tax, and management about where the business is efficient and where it is not.',
      },
      {
        type: 'text',
        heading: 'Two directions of comparison',
        body: 'Read across the years and you are doing horizontal analysis: the same line, this year against last year. Its tool is the comparative statement. Read down a single year and you are doing vertical analysis: each line against one base figure of the same year. Its tool is the common size statement. A company can be compared with itself over time (intra-firm) or with other companies in the same year (inter-firm). Two more tools, ratio analysis and cash flow analysis, have topics of their own after this one.',
      },
      {
        type: 'working',
        title: 'One line of a comparative statement: Kaveri Textiles Ltd., Tiruppur',
        lines: [
          'Revenue from operations was ₹40,00,000 in 2024-25 and ₹50,00,000 in 2025-26. Finance costs were ₹2,50,000 and ₹2,00,000.',
          'Absolute change = figure of the later year - figure of the earlier year. Revenue: ₹50,00,000 - ₹40,00,000 = ₹10,00,000, an increase.',
          'Percentage change = absolute change ÷ figure of the EARLIER year × 100. Revenue: ₹10,00,000 ÷ ₹40,00,000 × 100 = 25%.',
          'Finance costs: ₹2,00,000 - ₹2,50,000 = -₹50,000, a decrease. ₹50,000 ÷ ₹2,50,000 × 100 = 20%.',
          'In the statement the decrease is shown in brackets (or with a minus sign): (₹50,000) and (20%).',
        ],
        note: 'Watch out: the change is measured from where the line started, so divide by 2024-25. ₹10,00,000 ÷ ₹50,00,000 gives 20%, and ₹50,00,000 ÷ ₹40,00,000 × 100 gives 125%, which is the later year as a percentage of the earlier one, not the change.',
      },
      { type: 'check', questionId: qid(28) },
      {
        type: 'table',
        title: 'Comparative Statement of Profit and Loss of Harit Agro Ltd., Nashik (seeds and fertilisers), for the years ended 31 March 2025 and 2026',
        rows: [
          { label: 'Particulars: 2024-25 and 2025-26; absolute change (₹)', amount: '% change' },
          { label: 'I. Revenue from operations: 48,00,000 and 60,00,000; 12,00,000', amount: '25.00%' },
          { label: 'II. Other income: 2,00,000 and 1,50,000; (50,000)', amount: '(25.00%)' },
          { label: 'III. Total income (I + II): 50,00,000 and 61,50,000; 11,50,000', amount: '23.00%', total: true },
          { label: 'IV. Expenses' },
          { label: 'Cost of materials consumed: 24,00,000 and 30,00,000; 6,00,000', amount: '25.00%' },
          { label: 'Employee benefits expense: 6,00,000 and 7,50,000; 1,50,000', amount: '25.00%' },
          { label: 'Finance costs: 2,00,000 and 1,60,000; (40,000)', amount: '(20.00%)' },
          { label: 'Depreciation and amortisation expense: 3,00,000 and 3,30,000; 30,000', amount: '10.00%' },
          { label: 'Other expenses: 5,00,000 and 6,10,000; 1,10,000', amount: '22.00%' },
          { label: 'Total expenses: 40,00,000 and 48,50,000; 8,50,000', amount: '21.25%', total: true },
          { label: 'V. Profit before tax (III - IV): 10,00,000 and 13,00,000; 3,00,000', amount: '30.00%', total: true },
          { label: 'Less: Tax at 30%: 3,00,000 and 3,90,000; 90,000', amount: '30.00%' },
          { label: 'VI. Profit after tax (V - Tax): 7,00,000 and 9,10,000; 2,10,000', amount: '30.00%', total: true },
        ],
        note: 'In the examination the columns are Particulars, Note No., 2024-25, 2025-26, Absolute change and Percentage change. Each total and each profit is worked out for both years first; its change is then divided by its OWN figure of 2024-25: total income 11,50,000 ÷ 50,00,000 = 23%, total expenses 8,50,000 ÷ 40,00,000 = 21.25%. Tax at the same rate in both years makes profit before tax, tax and profit after tax move by the same 30%. Watch out: never add or average the percentages of the lines (the +25% and -25% of the two incomes do not make total income 0%).',
      },
      { type: 'check', questionId: qid(34) },
      {
        type: 'working',
        title: 'One year against one base: Devgiri Ceramics Ltd., Morbi (wall and floor tiles), 2025-26',
        lines: [
          'In a common size Statement of Profit and Loss, revenue from operations is 100. Here it is ₹50,00,000.',
          'Other income ₹2,00,000 ÷ ₹50,00,000 × 100 = 4%, so total income = 100% + 4% = 104%.',
          'Cost of materials consumed ₹30,00,000 = 60%; employee benefits expense ₹7,20,000 = 14.4%; other expenses ₹8,80,000 = 17.6%.',
          'Total expenses ₹46,00,000 = 60% + 14.4% + 17.6% = 92%.',
          'Profit before tax = ₹52,00,000 - ₹46,00,000 = ₹6,00,000, which is 12% of revenue from operations (104% - 92%).',
        ],
        note: 'Watch out: the base is revenue from operations, not total income. Dividing by ₹52,00,000 would show materials at 57.69% in place of 60%. A share tells you the make-up of one year; it does not say by how much anything changed.',
      },
      {
        type: 'table',
        title: 'Common Size Balance Sheet of Lokesh Auto Parts Ltd., Pune, as at 31 March 2025 and 2026',
        rows: [
          { label: 'Particulars: amounts on 31 March 2025 and 2026 (₹)', amount: '% of total: 2025, 2026' },
          { label: 'I. Equity and Liabilities' },
          { label: "1. Shareholders' funds: Share capital 20,00,000 and 20,00,000", amount: '50%, 40%' },
          { label: 'Reserves and surplus 6,00,000 and 10,00,000', amount: '15%, 20%' },
          { label: '2. Non-current liabilities: Long-term borrowings 8,00,000 and 12,50,000', amount: '20%, 25%' },
          { label: '3. Current liabilities: Trade payables 6,00,000 and 7,50,000', amount: '15%, 15%' },
          { label: 'Total 40,00,000 and 50,00,000', amount: '100%, 100%', total: true },
          { label: 'II. Assets' },
          { label: '1. Non-current assets: Property, plant and equipment 24,00,000 and 27,50,000', amount: '60%, 55%' },
          { label: '2. Current assets: Inventories 6,00,000 and 9,00,000', amount: '15%, 18%' },
          { label: 'Trade receivables 8,00,000 and 11,00,000', amount: '20%, 22%' },
          { label: 'Cash and cash equivalents 2,00,000 and 2,50,000', amount: '5%, 5%' },
          { label: 'Total 40,00,000 and 50,00,000', amount: '100%, 100%', total: true },
        ],
        note: 'Each date has its own base: ₹40,00,000 for 2025 and ₹50,00,000 for 2026, so each side adds up to 100% on each date. Property, plant and equipment rose by ₹3,50,000 (14.58%), yet its share fell from 60% to 55%, because total assets grew faster (25%). Share capital did not change at all, and its share fell from 50% to 40%. Watch out: a fall of 5 percentage points is not a fall of 5% in the amount, and a line of 2026 is never divided by the total of 2025.',
      },
      { type: 'check', questionId: qid(39) },
      {
        type: 'text',
        heading: 'What analysis cannot tell you',
        body: 'Analysis rearranges the figures of the statements, so it inherits their weaknesses. Assets stand at historical cost, not at today\'s values. Changes in the price level are ignored, so rupees of different years are treated alike. Qualities such as the skill of the managers or the reputation of the company are not in the figures at all. Figures may be window dressed for the year end, and two companies may use different accounting policies. Two analysts may also read the same figures differently, since what a figure means is a matter of personal judgement. And analysis is historical: it studies the past, which is only a guide to the future, so a trend it finds is a starting point for planning and not a forecast. A good analyst uses the percentages as questions to ask, not as final answers.',
      },
      { type: 'check', questionId: qid(1) },
    ],
  },
  cards: {
    title: 'Rules of Analysis, Comparative and Common Size',
    description: 'Recall who uses analysis, its limits, the two kinds of analysis and the formulas of both statements.',
    cardIds: cards.map((c) => c.id),
  },
  recognition: [
    {
      title: 'What Analysis Is and Who Uses It',
      description: 'Recognise the meaning and objectives of analysis and what each user looks for.',
      questionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(qid),
    },
    {
      title: 'Limitations, and the Kinds of Analysis',
      description: 'Recognise what analysis cannot do, and tell horizontal from vertical analysis.',
      questionIds: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map(qid),
    },
    {
      title: 'Tools and the Comparative Statement',
      description: 'Choose the right tool, and the right base for a percentage change.',
      questionIds: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34].map(qid),
    },
    {
      title: 'Common Size Statements and Reading Them',
      description: 'Choose the right base for a common size percentage and say what a percentage means.',
      questionIds: [35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46].map(qid),
    },
  ],
  practice: [
    {
      title: 'Users, Limitations and Tools',
      description: 'Match a user with a concern, a situation with a limitation, and a question with the tool that answers it.',
      templateIds: ['fsa-user-purpose', 'fsa-limitation-spot', 'fsa-horizontal-vertical', 'fsa-tool-choice', 'fsa-tool-feature', 'fsa-base-figure'],
      count: 8,
    },
    {
      title: 'First Changes and First Percentages',
      description: 'The percentage change of a balance sheet line, the figure after a change, and a line as a percentage of its base.',
      templateIds: ['fsa-bs-pct-from-change', 'fsa-current-from-pct', 'fsa-cs-pct-pl', 'fsa-cs-pct-bs'],
      count: 8,
    },
    {
      title: 'One Line of a Comparative Statement (Guided)',
      description: 'Take the change first, then divide it by the earlier year, and say which way the line moved.',
      templateIds: ['fsa-abs-change', 'fsa-pct-change', 'fsa-comparative-row'],
      count: 6,
      guided: true,
    },
    {
      title: 'Working Back, Totals and Nil Figures',
      description: 'The earlier figure from a change, the change of a total worked from its lines, and a line that is nil in one year.',
      templateIds: ['fsa-previous-from-change', 'fsa-previous-from-current', 'fsa-total-income-pct', 'fsa-total-expenses-change', 'fsa-bs-subtotal-pct', 'fsa-nil-previous', 'fsa-objective-or-not'],
      count: 8,
    },
    {
      title: 'Common Size: Amounts, Bases and Shares',
      description: 'An amount from its percentage, the base from a line, total income above 100, and a share that moves against its amount.',
      templateIds: ['fsa-cs-amount-from-pct', 'fsa-cs-base-from-line', 'fsa-cs-total-income-pct', 'fsa-cs-share-moved'],
      count: 8,
    },
    {
      title: 'Reading the Statements',
      description: 'Which line grew fastest, whether expenses outran revenue, and what a higher share of cost means.',
      templateIds: ['fsa-fastest-line', 'fsa-expenses-vs-revenue', 'fsa-cs-two-firms', 'fsa-cs-interpret'],
      count: 6,
    },
    {
      title: 'Derived Lines of a Comparative Statement',
      description: 'Profit before tax, tax and profit after tax from a small statement, and total assets from the other side of the balance sheet.',
      templateIds: ['fsa-pbt-change', 'fsa-pbt-pct', 'fsa-tax-change', 'fsa-pat-change', 'fsa-total-assets-pct'],
      count: 6,
    },
    {
      title: 'Common Size Statements of Several Lines',
      description: 'Profit as a percentage of revenue, a line against a total that has to be found, and amounts from two years of percentages.',
      templateIds: ['fsa-cs-profit-pct', 'fsa-cs-bs-derived', 'fsa-cs-to-change', 'fsa-cs-missing-line'],
      count: 6,
    },
  ],
  mixed: { title: 'Mixed Practice: Tools of Analysis', description: 'Everything in this topic, shuffled the way an examination serves it.', count: 12 },
  challenge: { title: 'Challenge: Comparative and Common Size', description: 'The hardest questions of the topic, against the clock.', count: 8, timerSecondsPerQuestion: 150 },
  formats: [
    {
      title: 'A Common Size Statement of One Year',
      description: 'A Common Size Statement of Profit and Loss of one year, down to profit before tax, with revenue from operations as 100: the first statement to prepare in full.',
      templateIds: ['fsa-fmt-common-size-year'],
      count: 2,
    },
    {
      title: 'Prepare a Comparative Statement',
      description: 'A Comparative Statement of Profit and Loss and a Comparative Balance Sheet from the figures of two years: the totals, the profit and the tax, then the absolute change and the percentage change of every line.',
      templateIds: ['fsa-fmt-comparative-pl', 'fsa-fmt-comparative-bs'],
      count: 2,
    },
    {
      title: 'Prepare a Common Size Statement of Two Periods',
      description: 'A Common Size Statement of Profit and Loss of two years, with revenue from operations as 100, and a Common Size Balance Sheet on two dates, with the total of the balance sheet as 100: every line as a percentage of the base of its own period.',
      templateIds: ['fsa-fmt-common-size-pl', 'fsa-fmt-common-size-bs'],
      count: 2,
    },
    {
      title: 'A Comparative Statement from Indirect Data',
      description: 'A Comparative Statement of Profit and Loss in which the lines have to be found first: revenue as a rise or a fall on the earlier year, expenses as a percentage of revenue or as interest on borrowings, and tax at the rate of each year.',
      templateIds: ['fsa-fmt-comparative-indirect'],
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
        name: 'assertion-reason',
        type: 'medium_practice',
        title: 'Assertion and Reason',
        description: 'The one-mark question of the board: judge the Assertion, judge the Reason, and say whether the Reason explains the Assertion.',
        generate: { templateIds: ['fsa-assertion-reason'], count: 6 },
      },
    ]),
  ],
  questions,
};

export default pack;
