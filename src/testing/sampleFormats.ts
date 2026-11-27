import type { AccountQuestion, FormatRow, StatementQuestion } from '@/content/types';
import { kindOf, typedFigure, type ColumnKind, type EnteredRow } from '@/engine/formats';
import { formatLists, printedOf, subtotalPrints, subtotalsOf, type Response } from '@/exercises/logic';
import type { Draft } from '@/play/drafts';
import { withoutPrinted, type FormatRowDraft } from '@/play/formatRows';

const row = (label: string, rupees: number, more: Partial<FormatRow> = {}): FormatRow => ({ label, amounts: [rupees * 100], ...more });
const two = (label: string, debit: number, credit: number): FormatRow => ({ label, amounts: [debit * 100, credit * 100] });

/**
 * A supplier's account with known rows, for tests: an opening balance, a purchase, a return and a payment, balanced
 * and brought down. Six rows above the totals and one below.
 */
export const SAMPLE_ACCOUNT: AccountQuestion = {
  id: 'sample-account',
  type: 'account',
  topicId: 'ledger',
  conceptId: 'led-formats',
  difficulty: 'easy',
  prompt: 'Prepare Rao & Co. A/c for the month, balance it on 30 Apr and bring the balance down on 1 May.',
  hints: ['One.', 'Two.'],
  explanation: 'The credit side is larger. The balance is carried down on the debit side.',
  data: 'Rao & Co. is a supplier of Asha Traders.\n• 1 Apr: balance brought down — ₹10,000\n• 4 Apr: bought goods on credit — ₹40,000\n• 9 Apr: returned goods — ₹2,000\n• 18 Apr: paid cash — ₹15,000',
  title: 'Rao & Co. A/c',
  columns: ['Amount (₹)'],
  sides: [
    {
      title: 'Dr',
      prefix: 'To',
      rows: [row('Purchases Return A/c', 2000, { date: '9 Apr' }), row('Cash A/c', 15000, { date: '18 Apr' }), row('Balance c/d', 33000, { date: '30 Apr', closing: true })],
      below: [],
    },
    {
      title: 'Cr',
      prefix: 'By',
      rows: [row('Balance b/d', 10000, { date: '1 Apr' }), row('Purchases A/c', 40000, { date: '4 Apr' })],
      below: [row('Balance b/d', 33000, { date: '1 May' })],
    },
  ],
  labels: ['Balance b/d', 'Balance c/d', 'Bank A/c', 'Cash A/c', 'Purchases A/c', 'Purchases Return A/c', 'Rao & Co. A/c', 'Sales A/c'],
  working: ['The credit side is larger.', 'The balance is carried down on the debit side.'],
};

/** A trial balance with known rows, for tests: three debit balances and two credit ones, agreeing at ₹95,000. */
export const SAMPLE_STATEMENT: StatementQuestion = {
  id: 'sample-statement',
  type: 'statement',
  topicId: 'trial-balance',
  conceptId: 'tb-formats',
  difficulty: 'easy',
  prompt: 'Prepare the Trial Balance of Ravi Textiles as on 31 March 2026.',
  hints: ['One.', 'Two.'],
  explanation: 'Assets, expenses and drawings are debit balances.',
  data: 'Ravi Textiles took these balances from its ledger:\nCash in hand: ₹30,000\nDrawings: ₹5,000\nRent paid: ₹60,000\nCapital: ₹90,000\nDiscount received: ₹5,000',
  title: 'Trial Balance of Ravi Textiles as on 31 March 2026',
  heading: 'Name of account',
  columns: ['Debit (₹)', 'Credit (₹)'],
  rows: [two('Cash in hand', 30000, 0), two('Drawings', 5000, 0), two('Rent paid', 60000, 0), two('Capital', 0, 90000), two('Discount received', 0, 5000)],
  totalsAgree: true,
  labels: ['Capital', 'Cash in hand', 'Discount received', 'Drawings', 'Rent paid', 'Sales', 'Suspense A/c'],
  working: ['Assets, expenses and drawings are debit balances.', 'Capital and incomes are credit balances.'],
};

/** A statement that ends on a figure, for tests: a Bank Reconciliation Statement in plus and minus columns. */
export const SAMPLE_BRS: StatementQuestion = {
  ...SAMPLE_STATEMENT,
  id: 'sample-brs',
  prompt: 'Prepare the Bank Reconciliation Statement as on 31 March 2026.',
  title: 'Bank Reconciliation Statement as on 31 March 2026',
  heading: 'Particulars',
  columns: ['Plus (₹)', 'Minus (₹)'],
  rows: [two('Balance as per Cash Book', 20000, 0), two('Cheques issued but not presented', 6000, 0), two('Cheques deposited but not credited', 0, 4000)],
  totalsAgree: undefined,
  final: { label: 'Balance as per Pass Book', amount: 2200000 },
  labels: ['Balance as per Cash Book', 'Bank charges', 'Cheques deposited but not credited', 'Cheques issued but not presented', 'Interest credited'],
};

/**
 * Machinery A/c kept for three years, for tests: balanced on each 31 March and brought down on 1 April, with the
 * same depreciation in two of the years. Ten rows above the totals of its three periods and one below the last.
 */
export const SAMPLE_PERIODS: AccountQuestion = {
  ...SAMPLE_ACCOUNT,
  id: 'sample-periods',
  topicId: 'depreciation',
  conceptId: 'dep-formats',
  prompt: 'Prepare Machinery A/c for the three years ended 31 March 2026 and bring the balance down on 1 April 2026.',
  data: 'Bought machinery for ₹1,00,000 by cheque on 1 April 2023.\nBought more for ₹50,000 by cheque on 1 April 2025.\nDepreciation is charged at ₹10,000 a year in the first two years and ₹15,000 in the third.',
  title: 'Machinery A/c',
  sides: [
    { title: 'Dr', prefix: 'To', rows: [row('Bank A/c', 100000, { date: '1 April 2023' })], below: [row('Balance b/d', 115000, { date: '1 April 2026' })] },
    { title: 'Cr', prefix: 'By', rows: [row('Depreciation A/c', 10000, { date: '31 March 2024' }), row('Balance c/d', 90000, { date: '31 March 2024', closing: true })], below: [] },
  ],
  later: [
    [[row('Balance b/d', 90000, { date: '1 April 2024' })], [row('Depreciation A/c', 10000, { date: '31 March 2025' }), row('Balance c/d', 80000, { date: '31 March 2025', closing: true })]],
    [
      [row('Balance b/d', 80000, { date: '1 April 2025' }), row('Bank A/c', 50000, { date: '1 April 2025' })],
      [row('Depreciation A/c', 15000, { date: '31 March 2026' }), row('Balance c/d', 115000, { date: '31 March 2026', closing: true })],
    ],
  ],
  periodTitles: ['Year ended 31 March 2024', 'Year ended 31 March 2025', 'Year ended 31 March 2026'],
  continued: true,
  labels: ['Balance b/d', 'Balance c/d', 'Bank A/c', 'Cash A/c', 'Depreciation A/c', 'Machinery A/c'],
};

/**
 * A Suspense A/c, for tests: the row it opens with is as right under other wording ("Balance b/d"), and a balance
 * is left, which is brought down below the totals under that very name. Four rows above the totals and one below.
 */
export const SAMPLE_SUSPENSE: AccountQuestion = {
  ...SAMPLE_ACCOUNT,
  id: 'sample-suspense',
  topicId: 'rectification-of-errors',
  conceptId: 'roe-formats',
  prompt: 'Prepare the Suspense A/c. Enter the difference it opened with as "Difference in trial balance"; if a balance is left, carry it down and bring it down.',
  data: 'The trial balance did not agree, and the difference was put to a Suspense A/c, which opened with a debit balance of ₹5,000.\n(a) The Sales Book was overcast by ₹2,000.\n(b) ₹4,000 received from Mohan was not posted to his account.',
  title: 'Suspense A/c',
  sides: [
    {
      title: 'Dr',
      prefix: 'To',
      rows: [row('Difference in trial balance', 5000, { date: '31 March', also: ['Balance b/d'] }), row('Sales A/c', 2000, { ref: '(a)' })],
      below: [row('Balance b/d', 3000)],
    },
    { title: 'Cr', prefix: 'By', rows: [row('Mohan A/c', 4000, { ref: '(b)' }), row('Balance c/d', 3000, { closing: true })], below: [] },
  ],
  continued: true,
  labels: ['Balance b/d', 'Balance c/d', 'Difference in trial balance', 'Mohan A/c', 'Purchases A/c', 'Sales A/c', 'Suspense A/c'],
};

/** The Bank Reconciliation Statement that leaves it to the student to say what it ends on: a balance or an overdraft. */
export const SAMPLE_BRS_CHOICE: StatementQuestion = {
  ...SAMPLE_BRS,
  id: 'sample-brs-choice',
  final: { label: 'Balance as per Pass Book', amount: 2200000, options: ['Balance as per Pass Book', 'Overdraft as per Pass Book'] },
};

/** A Purchases Book with four amount columns, for tests: taxable value, CGST, SGST and total. */
export const SAMPLE_BOOK: StatementQuestion = {
  ...SAMPLE_STATEMENT,
  id: 'sample-book',
  prompt: 'Prepare the Purchases Book for April.',
  title: 'Purchases Book',
  heading: 'Name of supplier',
  columns: ['Taxable value (₹)', 'CGST (₹)', 'SGST (₹)', 'Total (₹)'],
  rows: [
    { label: 'Rao & Co.', amounts: [4000000, 100000, 100000, 4200000], date: '4 April' },
    { label: 'Meena Suppliers', amounts: [1000000, 90000, 90000, 1180000], date: '9 April' },
    { label: 'Patel Brothers', amounts: [2000000, 50000, 50000, 2100000], date: '20 April' },
  ],
  totalsAgree: undefined,
  labels: ['Bhatia Wholesalers', 'Meena Suppliers', 'Patel Brothers', 'Rao & Co.', 'Sundaram & Co.'],
};

const entered = (rows: FormatRow[]): EnteredRow[] => rows.map((r) => ({ label: r.label, amounts: r.amounts }));
/** A figure as a test types it: plain digits for rupees, and in a column of another kind what a student would type. */
const typedOne = (a: number, c: number, kinds?: readonly ColumnKind[]): string => (a === 0 ? '' : kinds ? typedFigure(a, kindOf(kinds, c)) : String(a / 100));
const typed = (rows: FormatRow[], kinds?: readonly ColumnKind[]): FormatRowDraft[] => rows.map((r) => ({ label: r.label, amounts: r.amounts.map((a, c) => typedOne(a, c, kinds)) }));

/** The answer that is wholly right. */
export function rightFormat(q: AccountQuestion | StatementQuestion): Response {
  return q.type === 'account'
    ? {
        type: 'account',
        sides: [entered(q.sides[0].rows), entered(q.sides[1].rows)],
        below: [entered(q.sides[0].below), entered(q.sides[1].below)],
        ...(q.later ? { later: q.later.map(([left, right]): [EnteredRow[], EnteredRow[]] => [entered(left), entered(right)]) } : {}),
      }
    : rightStatement(q);
}

/** The answer to a statement that is wholly right: its rows list by list, and every sub-total. */
function rightStatement(q: StatementQuestion): Response {
  const [first, ...more] = formatLists(q).map(entered);
  const subtotals = subtotalsOf(q).map((line) => line.amounts);
  return {
    type: 'statement',
    rows: first,
    final: q.final?.amount ?? null,
    ...(q.final?.options ? { finalLabel: q.final.label } : {}),
    ...(more.length > 0 ? { more } : {}),
    ...(subtotals.length > 0 ? { subtotals } : {}),
  };
}

/** The rows a student would type for the right answer. */
export function rightFormatDraft(q: AccountQuestion | StatementQuestion): Draft {
  return q.type === 'account'
    ? {
        type: 'account',
        sides: [typed(q.sides[0].rows), typed(q.sides[1].rows)],
        below: [typed(q.sides[0].below), typed(q.sides[1].below)],
        ...(q.later ? { later: q.later.map(([left, right]): [FormatRowDraft[], FormatRowDraft[]] => [typed(left), typed(right)]) } : {}),
      }
    : rightStatementDraft(q);
}

function rightStatementDraft(q: StatementQuestion): Draft {
  const kinds = q.columnKinds;
  // A figure the statement prints is not typed: its cell is left empty.
  const printed = printedOf(q);
  const [first, ...more] = formatLists(q).map((rows) => typed(rows, kinds).map((row) => withoutPrinted(row, printed)));
  const subtotals = subtotalsOf(q).map((line) => subtotalPrints(q, line).map((figure, c) => (figure === null ? typedOne(line.amounts[c], c, kinds) : '')));
  return {
    type: 'statement',
    rows: first,
    final: q.final ? typedOne(q.final.amount, 0, kinds) : '',
    ...(q.final?.options ? { finalLabel: q.final.label } : {}),
    ...(more.length > 0 ? { more } : {}),
    ...(subtotals.length > 0 ? { subtotals } : {}),
  };
}

/** A complete answer that is not right: the first row is left out (the first row of the left side of an account). */
export function wrongFormatDraft(q: AccountQuestion | StatementQuestion): Draft {
  const draft = rightFormatDraft(q);
  if (draft.type === 'account') return { ...draft, sides: [draft.sides[0].slice(1), draft.sides[1]] };
  if (draft.type === 'statement') return { ...draft, rows: draft.rows.slice(1) };
  return draft;
}
