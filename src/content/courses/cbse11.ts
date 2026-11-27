import type { Course, TopicMeta, TopicStatus } from '../types';

const topic = (
  id: string,
  title: string,
  unit: string,
  kind: 'practical' | 'theory',
  status: TopicStatus,
  description: string,
  whyItMatters: string,
): TopicMeta => ({ id, courseId: 'cbse-11-accountancy', title, unit, kind, status, description, whyItMatters });

const PROCESS = 'Accounting Process';
const THEORY = 'Theoretical Framework';
const STATEMENTS = 'Financial Statements';
const CAPSTONE = 'Exam Preparation';

export const CBSE11: Course = {
  id: 'cbse-11-accountancy',
  title: 'Class 11 Accountancy (CBSE)',
  topics: [
    topic('introduction-to-accounting', 'Introduction to Accounting', THEORY, 'theory', 'comingSoon',
      'Meaning, objectives, users and basic terms of accounting.',
      'These terms appear in one-mark and short-answer questions throughout the paper.'),
    topic('theory-base', 'Theory Base of Accounting', THEORY, 'theory', 'comingSoon',
      'Accounting principles, assumptions and standards.',
      'Principles justify the treatment of almost every adjustment you will meet later.'),
    topic('accounting-equation', 'Accounting Equation', PROCESS, 'practical', 'comingSoon',
      'See how each transaction changes assets, liabilities and capital.',
      'The equation explains why debits always equal credits.'),
    topic('journal-entries', 'Journal Entries', PROCESS, 'practical', 'available',
      'Record any business transaction as a debit and a credit, including GST.',
      'Every later topic starts from a journal entry. Get this right and ledgers, trial balance and final accounts follow.'),
    topic('ledger', 'Ledger Posting and Balancing', PROCESS, 'practical', 'planned',
      'Post journal entries to accounts and balance them.', 'The ledger is where totals for the trial balance come from.'),
    topic('cash-book', 'Cash Book', PROCESS, 'practical', 'planned',
      'Single column, double column and petty cash books.', 'A frequent long-answer question.'),
    topic('subsidiary-books', 'Subsidiary Books', PROCESS, 'practical', 'planned',
      'Purchases, sales and returns books.', 'Shows how credit transactions are grouped before posting.'),
    topic('bank-reconciliation', 'Bank Reconciliation Statement', PROCESS, 'practical', 'planned',
      'Explain the difference between cash book and pass book balances.', 'A standard practical question with a fixed format.'),
    topic('trial-balance', 'Trial Balance', PROCESS, 'practical', 'planned',
      'List ledger balances and check that the books agree.', 'It is the starting point of final accounts.'),
    topic('rectification-of-errors', 'Rectification of Errors', PROCESS, 'practical', 'planned',
      'Find and correct errors, with and without a suspense account.', 'Tests whether you truly understand debit and credit.'),
    topic('depreciation', 'Depreciation', PROCESS, 'practical', 'planned',
      'Straight line and written down value methods.', 'High-mark practical with predictable patterns.'),
    topic('provisions-and-reserves', 'Provisions and Reserves', PROCESS, 'theory', 'planned',
      'Why and how profits are set aside.', 'Common in short-answer and distinguish-between questions.'),
    topic('final-accounts', 'Final Accounts without Adjustments', STATEMENTS, 'practical', 'planned',
      'Trading account, profit and loss account and balance sheet.', 'The largest single block of marks.'),
    topic('final-accounts-adjustments', 'Final Accounts with Adjustments', STATEMENTS, 'practical', 'planned',
      'Closing stock, outstanding and prepaid items, depreciation, bad debts.', 'The long question most students lose marks on.'),
    topic('incomplete-records', 'Incomplete Records', STATEMENTS, 'practical', 'planned',
      'Single entry, the statement of affairs and profit found by comparing capitals.', 'A regular short-answer and 4-mark question on finding capital and profit.'),
    topic('mixed-case-studies', 'Mixed Case Studies', CAPSTONE, 'practical', 'planned',
      'One business from first transaction to balance sheet.', 'Connects every chapter the way the exam does.'),
    topic('mock-exams', 'CBSE-pattern Mock Exams', CAPSTONE, 'practical', 'planned',
      'Timed full papers with marks per chapter.', 'Exam practice under real conditions.'),
  ],
  previews: [
    'Partnership: Fundamentals and Goodwill',
    'Admission of a Partner',
    'Retirement and Death of a Partner',
    'Dissolution of a Partnership Firm',
    'Share Capital',
    'Debentures',
    'Company Financial Statements',
    'Analysis of Financial Statements',
    'Accounting Ratios',
    'Cash Flow Statement',
    'Computerised Accounting',
  ].map((title) => ({ title, label: 'Class 12 – coming later' })),
};
