import type { McqQuestion, NumericQuestion } from '@/content/types';

/** A question whose prompt, explanation and working all hold line breaks, with one very long line. */
export const MULTILINE_SAMPLE: NumericQuestion = {
  id: 'e2e-multiline',
  type: 'numeric',
  topicId: 'e2e',
  conceptId: 'e2e',
  difficulty: 'easy',
  unit: 'rupees',
  answer: 98575000,
  commonErrors: [
    { value: 1, why: 'First slip.' },
    { value: 2, why: 'Second slip.' },
  ],
  prompt: [
    'Find the total of these balances on 31 March.',
    'Cash in hand: ₹12,000',
    'Bank: ₹1,85,000',
    'Stock: ₹2,40,500',
    'Provision for doubtful debts on sundry trade receivables and bills receivable outstanding at the year end: ₹4,50,000',
    'Debtors: ₹98,250',
  ].join('\n'),
  hints: ['One.', 'Two.'],
  explanation: 'Add every balance.\nThen check the total.',
  working: ['Cash and bank:\n₹12,000 + ₹1,85,000 = ₹1,97,000', 'Everything: ₹9,85,750'],
};

/** A multiple-choice question whose explanation holds line breaks (the feedback prints it as written). */
export const MULTILINE_MCQ: McqQuestion = {
  id: 'e2e-multiline-mcq',
  type: 'mcq',
  topicId: 'e2e',
  conceptId: 'e2e',
  difficulty: 'easy',
  prompt: 'Which total is right?',
  hints: ['One.', 'Two.'],
  options: [
    { id: 'a', text: '₹9,85,750' },
    { id: 'b', text: '₹5,35,750', why: 'Left out the provision line.' },
  ],
  correct: 'a',
  explanation: 'Add every balance.\nThen check the total.',
};
