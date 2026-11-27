import type { Course, TopicMeta } from '../types';

const topic = (id: string, title: string, unit: string, kind: 'practical' | 'theory', description: string, whyItMatters: string): TopicMeta => ({
  id,
  courseId: 'cbse-12-accountancy',
  title,
  unit,
  kind,
  // A topic is playable, whatever this says, as soon as its pack has a level (see registry.ts).
  status: 'comingSoon',
  description,
  whyItMatters,
});

/** The four units of the syllabus, by the names the mock paper blueprints use (learning/paperBlueprints.ts). */
export const PARTNERSHIP = 'Accounting for Partnership Firms';
export const COMPANIES = 'Accounting for Companies';
export const ANALYSIS = 'Analysis of Financial Statements';
export const CASH_FLOW = 'Cash Flow Statement';
/** Part B as a school may teach it instead: the option a learner chooses in Settings (courseOptions.ts). */
export const COMPUTERISED = 'Computerised Accounting';

/**
 * CBSE Class 12 Accountancy (code 055), Part A and Part B (Analysis of Financial Statements), and the option of Part B a
 * school may teach instead, Computerised Accounting: its topic stands last, so that no topic before it moved, and a
 * learner meets it only once Computerised Accounting is chosen in Settings (courseOptions.ts). See docs/content-plan.md.
 */
export const CBSE12: Course = {
  id: 'cbse-12-accountancy',
  title: 'Class 12 Accountancy (CBSE)',
  topics: [
    topic('partnership-fundamentals', 'Fundamentals of Partnership', PARTNERSHIP, 'practical',
      'The deed, capital accounts and how the profit of a firm is shared.',
      'Every later partnership chapter starts from the capital accounts and the appropriation of profit.'),
    topic('goodwill', 'Goodwill: Nature and Valuation', PARTNERSHIP, 'practical',
      'Value goodwill by average profit, super profit and capitalisation.',
      'Goodwill is adjusted every time the partners or their shares change.'),
    topic('change-in-profit-sharing-ratio', 'Change in Profit-Sharing Ratio', PARTNERSHIP, 'practical',
      'Sacrifice and gain, goodwill, reserves and revaluation when partners change their shares.',
      'The same adjustments come back on admission and on retirement.'),
    topic('admission-of-a-partner', 'Admission of a Partner', PARTNERSHIP, 'practical',
      'New ratio, premium for goodwill, revaluation and the capitals of the new firm.',
      'A regular six-mark question, ending in a balance sheet.'),
    topic('retirement-and-death-of-a-partner', 'Retirement and Death of a Partner', PARTNERSHIP, 'practical',
      'Gaining ratio, the amount due to the partner who leaves and how it is paid.',
      'It tests goodwill, revaluation and capital accounts together.'),
    topic('dissolution-of-partnership', 'Dissolution of a Partnership Firm', PARTNERSHIP, 'practical',
      'Realisation Account, settlement of liabilities and closing the books of the firm.',
      'The Realisation Account is asked almost every year.'),
    topic('share-capital', 'Accounting for Share Capital', COMPANIES, 'practical',
      'Issue of shares, calls in arrears and in advance, forfeiture and reissue.',
      'The largest block of marks in company accounts.'),
    topic('debentures', 'Issue of Debentures', COMPANIES, 'practical',
      'Issue at par, premium and discount, with the terms of redemption, and interest.',
      'Its entries follow fixed patterns that are easy to score on.'),
    topic('company-financial-statements', 'Financial Statements of a Company', ANALYSIS, 'theory',
      'The Schedule III balance sheet and Statement of Profit and Loss, head by head.',
      'Every tool of analysis starts from where an item is shown.'),
    topic('financial-statement-analysis', 'Comparative and Common Size Statements', ANALYSIS, 'practical',
      'Compare two years line by line, and each line with the total.',
      'A short question with a fixed format.'),
    topic('accounting-ratios', 'Accounting Ratios', ANALYSIS, 'practical',
      'Liquidity, solvency, activity and profitability ratios.',
      'Ratios and the effect of a transaction on them are asked in every paper.'),
    topic('cash-flow-statement', 'Cash Flow Statement', CASH_FLOW, 'practical',
      'Cash from operating, investing and financing activities by the indirect method.',
      'The six-mark question of Part B.'),
    topic('computerised-accounting', 'Computerised Accounting System', COMPUTERISED, 'practical',
      'Accounting on a computer: the system, the spreadsheet at work, and books kept on a package.',
      'It is the whole of Part B for a school that takes the Computerised Accounting option.'),
  ],
  previews: [],
};
