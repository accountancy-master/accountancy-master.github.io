import { describe, expect, it } from 'vitest';
import { formatSample } from '@/content/report';
import type { StatementQuestion, TopicPack } from '@/content/types';
import { validatePack } from '@/content/validate';
import { sayFigure } from '@/engine/formats';
import { checkAnswer } from '@/exercises/checkers';
import { EXERCISE_LOGIC, answerToKeep, expectedRows, printedOf, readFormatCode, subtotalPrints, subtotalsOf, type Response } from '@/exercises/logic';
import { creditMarks } from '@/learning/mockPaper';
import { asDraft, draftResponse, readDraft, responseDraft, type Draft } from '@/play/drafts';
import { readStatement, runningTotals, startStatement, statementDisagreement } from '@/play/formatRows';
import { partCredit } from '@/play/mockSitting';
import { class12Templates } from '@/testing/class12Topic';
import { checkFormat } from '@/testing/questionChecks';
import { rightFormat, rightFormatDraft } from '@/testing/sampleFormats';
import { accountTemplate, drSide, crSide, statementTemplate } from './authoring';
import { buildInstance, generateFrom } from './engine';
import type { AccountParts, StatementParts, Template } from './types';

// A statement that prints the figures the question gives: the two years of a comparative statement. The student
// chooses the particulars of every row and types what is worked out: the totals, the tax and the two change columns.

const SEEDS = 120;
const TEMPLATES = class12Templates('partnership-fundamentals');
const template = (id: string): Template => TEMPLATES.find((t) => t.id === id)!;
const statement = (id: string, seed: number) => generateFrom(template(id), seed) as StatementQuestion;
type StatementResponse = Extract<Response, { type: 'statement' }>;
type StatementDraft = Extract<Draft, { type: 'statement' }>;
const right = (q: StatementQuestion) => structuredClone(rightFormat(q)) as StatementResponse;
const rightDraft = (q: StatementQuestion) => structuredClone(rightFormatDraft(q)) as StatementDraft;

const base: StatementParts = {
  task: 'Prepare the statement.',
  data: 'A company and its figures for the two years, one line to a line, as the question gives them.',
  title: 'Statement',
  columns: [{ name: 'Last year (₹)', given: true }, { name: 'This year (₹)', given: true }, { name: 'Change (₹)', signed: true }],
  rows: [
    { label: 'Sales', amounts: [500000, 700000, 200000] },
    { label: 'Fees', amounts: [100000, 100000, 0] },
    { label: 'Rent', amounts: [0, 50000, 50000] },
    { subtotal: 'Total income', amounts: [600000, 850000, 250000], sum: 'all' },
  ],
  distractors: ['Interest', 'Commission'],
  explanation: ['Step.'],
};
const made = (change: Partial<StatementParts> = {}) =>
  buildInstance(statementTemplate({ id: 'test-given', topicId: 'financial-statement-analysis', conceptId: 'x', difficulty: 'medium', generate: () => ({ ...base, ...change }) }), 1);
const built = (change: Partial<StatementParts> = {}): StatementQuestion => {
  const out = made(change);
  if (!('question' in out) || out.question.type !== 'statement') throw new Error(`not built: ${JSON.stringify(out)}`);
  return out.question;
};

describe('a statement that gives some of its columns', () => {
  const q = statement('s12-comparative-given', 5);

  it('says which columns are given, which row is worked out all the same, and nothing more', () => {
    expect(q.columns).toEqual(['2024-25 (₹)', '2025-26 (₹)', 'Absolute change (₹)', 'Percentage change (%)']);
    expect(q.givenColumns).toEqual([true, true, false, false]);
    // A given column is a column of its kind like any other.
    expect(q.columnKinds).toEqual(statement('s12-comparative', 5).columnKinds);
    expect(q.rows.map((r) => [r.label, r.given])).toEqual([
      ['Revenue from operations', undefined],
      ['Other income', undefined],
      ['Employee benefits expense', undefined],
      ['Other expenses', undefined],
      ['Tax', false],
    ]);
    expect(subtotalsOf(q).every((line) => !('given' in line))).toBe(true);
    // A statement that gives nothing is built exactly as it was.
    const plain = statement('s12-comparative', 5);
    expect(plain).not.toHaveProperty('givenColumns');
    expect(JSON.stringify(plain)).not.toContain('given');
    expect(printedOf(plain)('Revenue from operations')).toBeUndefined();
  });

  it('prints the figures of a row under its particulars, and leaves a sub-total to be added up', () => {
    const printed = printedOf(q);
    expect(printed('Revenue from operations')).toEqual([q.rows[0].amounts[0], q.rows[0].amounts[1], null, null]);
    expect(printed('Tax')).toBeUndefined();
    expect(printed('Finance costs')).toBeUndefined();
    expect(printed('')).toBeUndefined();
    for (const line of subtotalsOf(q)) expect(subtotalPrints(q, line)).toEqual([null, null, null, null]);
  });

  it('passes the harness over many seeds', () => {
    for (let seed = 1; seed <= SEEDS; seed++) checkFormat(statement('s12-comparative-given', seed), `s12-comparative-given seed ${seed}`);
  });

  it('counts every row and every sub-total as before: a printed figure earns nothing and costs nothing', () => {
    expect(expectedRows(q)).toHaveLength(9);
    expect(EXERCISE_LOGIC.statement.parts!(q)).toEqual({ count: 9, name: 'rows' });
    expect(checkAnswer(q, right(q))).toMatchObject({ correct: true, parts: { right: 9, total: 9 } });
  });

  it('cannot be got wrong in a printed figure: the row stands with what its particulars print', () => {
    const r = right(q);
    r.rows[0] = { ...r.rows[0], amounts: [0, 123400, ...r.rows[0].amounts.slice(2)] };
    expect(checkAnswer(q, r)).toMatchObject({ correct: true, parts: { right: 9, total: 9 } });
  });

  it('is right in a row when its particulars and its typed figures are, and still catches a typed figure that is not', () => {
    // A fall typed as a rise.
    const r = right(q);
    r.rows[1] = { ...r.rows[1], amounts: r.rows[1].amounts.map((a) => Math.abs(a)) };
    const result = checkAnswer(q, r);
    expect(result).toMatchObject({ correct: false, parts: { right: 8, total: 9 } });
    expect(result.format!.entered[0]).toEqual(['correct', 'wrongAmount']);
    expect(readFormatCode(q, result.mistakeCode)!.rows).toEqual(['ok', 'amount', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(EXERCISE_LOGIC.statement.describeWrong(q, result.mistakeCode!)).toBe('8 of 9 rows right.');
    // The change and its percentage typed in each other's columns: the figures are right, the columns are not.
    const swapped = right(q);
    const [first, second, change, percent] = swapped.rows[0].amounts;
    swapped.rows[0] = { ...swapped.rows[0], amounts: [first, second, percent, change] };
    expect(checkAnswer(q, swapped).format!.entered[0]).toEqual(['wrongColumn', 'correct']);
    // A row under the wrong sub-heading is in the wrong part, whatever it prints.
    const moved = right(q);
    moved.more![0].push(moved.rows.pop()!);
    expect(checkAnswer(q, moved).format!.entered).toEqual([['correct'], ['correct', 'correct', 'wrongPlace'], ['correct']]);
    // The wrong particulars for the figures typed: that row has a wrong amount, and the one meant is missing.
    const misnamed = right(q);
    misnamed.rows[0] = { ...misnamed.rows[1], amounts: misnamed.rows[0].amounts };
    misnamed.rows.pop();
    const mixed = checkAnswer(q, misnamed);
    expect(mixed.format!.expected[0]).toEqual(['missing', 'amount']);
    expect(mixed.parts).toEqual({ right: 7, total: 9 });
  });

  it('shares the marks of a mock paper among the rows and the sub-totals, as any statement does', () => {
    const r = right(q);
    r.subtotals = r.subtotals!.map((s, i) => (i === 0 ? null : s));
    const result = checkAnswer(q, r);
    expect(result.format!.subtotals).toEqual(['missing', 'ok', 'ok', 'ok']);
    expect(partCredit(result)).toEqual({ right: 8, total: 9 });
    expect(creditMarks(4, [partCredit(result)])).toBe(3.5);
  });
});

describe('what is typed in a statement that prints figures', () => {
  const q = statement('s12-comparative-given', 5);
  const [revenue, other] = q.rows;

  it('is read with the printed figures in their places: only the typed columns are typed', () => {
    const draft = rightDraft(q);
    // The draft of the right answer holds nothing in a printed cell.
    expect(draft.rows.map((r) => r.amounts.slice(0, 2))).toEqual([['', ''], ['', '']]);
    expect(draft.rows[0].amounts[2]).not.toBe('');
    // The tax is worked out in every column.
    expect(draft.more![1][0].amounts.every((a) => a !== '')).toBe(true);
    expect(draftResponse(q, draft)).toEqual(rightFormat(q));
  });

  it('ignores what stands in a printed cell, and reads a row as soon as its particulars are chosen', () => {
    const typed = readStatement(q, [{ label: revenue.label, amounts: ['999', 'x', '', ''] }], '');
    expect(typed.problems).toEqual([]);
    // Nothing typed is a change of nil: the row is read, and marked like any other.
    expect(typed.response.rows).toEqual([{ label: revenue.label, amounts: [revenue.amounts[0], revenue.amounts[1], 0, 0] }]);
    // A label that prints nothing is typed in every column, and needs an amount as it always did.
    expect(readStatement(q, [{ label: 'Finance costs', amounts: ['', '', '', ''] }], '').problems).toEqual(['Part 1, row 1: enter an amount.']);
    expect(readStatement(q, [{ label: 'Tax', amounts: ['', '', '', ''] }], '').problems).toEqual(['Part 1, row 1: enter an amount.']);
    expect(readStatement(q, [{ label: 'Finance costs', amounts: ['500', '', '', ''] }], '').response.rows).toEqual([{ label: 'Finance costs', amounts: [50000, 0, 0, 0] }]);
    // A figure that is none in a typed column is still a problem.
    expect(readStatement(q, [{ label: other.label, amounts: ['', '', 'x', ''] }], '').problems).toEqual(['Part 1, row 1: enter a valid amount.']);
    // A row is printed what its particulars print wherever it is entered.
    const elsewhere = readStatement(q, [], '', '', [[{ label: revenue.label, amounts: ['', '', '', ''] }]]);
    expect(elsewhere.response.more![0]).toEqual([{ label: revenue.label, amounts: [revenue.amounts[0], revenue.amounts[1], 0, 0] }]);
  });

  it('starts from a draft with nothing in a printed cell', () => {
    const start = startStatement(q, { rows: [{ label: revenue.label, amounts: ['1', '2', '3', '4'] }, { label: 'Finance costs', amounts: ['1', '2', '3', '4'] }] });
    expect(start.rows).toEqual([{ label: revenue.label, amounts: ['', '', '3', '4'] }, { label: 'Finance costs', amounts: ['1', '2', '3', '4'] }]);
  });

  it('adds a printed figure into the running total of its column', () => {
    const rows = [{ label: revenue.label, amounts: ['', '', '100', ''] }, { label: other.label, amounts: ['', '', '', ''] }, { label: '', amounts: ['5', '', '', ''] }];
    expect(runningTotals(rows, 4, q.columnKinds, printedOf(q))).toEqual([revenue.amounts[0] + other.amounts[0] + 500, revenue.amounts[1] + other.amounts[1], 10000, 0]);
    // Without them a total is what is typed, as it always was.
    expect(runningTotals(rows, 4, q.columnKinds)).toEqual([500, 0, 10000, 0]);
  });

  it('keeps the answer of an attempt and puts it back, printed figures in their places and none of them typed', () => {
    const wrong = right(q);
    wrong.subtotals = wrong.subtotals!.map((s, i) => (i === 3 ? null : s));
    const result = checkAnswer(q, wrong);
    const kept = answerToKeep(wrong, result)!;
    // The stored answer is a statement's answer like any other: the rows as they stood, a figure for every column.
    expect(JSON.parse(JSON.stringify(kept))).toEqual(wrong);
    const draft = responseDraft(kept, q) as StatementDraft;
    expect(draft.rows[0].amounts.slice(0, 2)).toEqual(['', '']);
    expect(asDraft(q, draft)).toEqual(draft);
    expect(draftResponse(q, draft)).toEqual(kept);
    expect(checkAnswer(q, draftResponse(q, draft)!).mistakeCode).toBe(result.mistakeCode);
    expect(readFormatCode(q, result.mistakeCode)!.rows.filter((v) => v !== 'ok')).toEqual(['missing']);
  });

  it('tells the tests which figures are printed, so that they type the others', () => {
    const expected = EXERCISE_LOGIC.statement.e2eExpected(q) as { rows: { label: string; amounts: number[]; printed?: boolean[] }[]; more: { printed?: boolean[] }[][]; printedSubtotals: boolean[][] };
    expect(expected.rows.map((r) => r.printed)).toEqual([[true, true, false, false], [true, true, false, false]]);
    expect(expected.rows[0].amounts).toEqual(revenue.amounts);
    // The tax prints nothing.
    expect(expected.more[1][0]).not.toHaveProperty('printed');
    expect(expected.printedSubtotals).toEqual(subtotalsOf(q).map(() => [false, false, false, false]));
    expect(EXERCISE_LOGIC.statement.e2eExpected(statement('s12-comparative', 5))).not.toHaveProperty('printedSubtotals');
  });

  it('is laid out for the reviewer with every printed figure in square brackets', () => {
    const lines = formatSample(q);
    expect(lines).toContain(` ${q.title}  [2024-25 (₹) (given) | 2025-26 (₹) (given) | Absolute change (₹) | Percentage change (%)]`);
    const kinds = q.columnKinds!;
    const shown = revenue.amounts.map((a, c) => sayFigure(a, kinds[c]));
    expect(lines).toContain(`     Revenue from operations  [${shown[0]}] | [${shown[1]}] | ${shown[2]} | ${shown[3]}`);
    expect(lines.some((l) => l.startsWith('     Tax  ₹') && l.endsWith('[worked out]'))).toBe(true);
    expect(lines.some((l) => l.startsWith('     = Total revenue  ₹') && l.endsWith('[sub-total, worked out]'))).toBe(true);
    // The report of a statement that gives nothing has no bracket of this kind.
    expect(formatSample(statement('s12-comparative', 5)).some((l) => /\[₹|\(given\)|\[worked out\]/.test(l))).toBe(false);
  });
});

describe('sub-totals and rows that are printed whole', () => {
  // Two given years and their change: the fees did not change, and the rent is new this year.
  const q = built();
  const total = subtotalsOf(q)[0];

  it('take a figure of nil as printed, and a row whose typed figures are all nil as right once its particulars are chosen', () => {
    expect(printedOf(q)('Rent')).toEqual([0, 50000, null]);
    const read = readStatement(q, [{ label: 'Sales', amounts: ['', '', '2000'] }, { label: 'Fees', amounts: ['', '', ''] }, { label: 'Rent', amounts: ['', '', '500'] }], '', '', [], [['6000', '8500', '2500']]);
    expect(read.problems).toEqual([]);
    expect(checkAnswer(q, read.response)).toMatchObject({ correct: true, parts: { right: 4, total: 4 } });
  });

  it('print a sub-total that says it is given, and mark what is typed of it', () => {
    const given = built({ rows: [...base.rows.slice(0, 3), { subtotal: 'Total income', amounts: [600000, 850000, 250000], sum: 'all', given: true }] });
    const line = subtotalsOf(given)[0];
    expect(line.given).toBe(true);
    expect(total).not.toHaveProperty('given');
    expect(subtotalPrints(given, line)).toEqual([600000, 850000, null]);
    expect(subtotalPrints(q, total)).toEqual([null, null, null]);
    const rows = [{ label: 'Sales', amounts: ['', '', '2000'] }, { label: 'Fees', amounts: ['', '', ''] }, { label: 'Rent', amounts: ['', '', '500'] }];
    // Only its change is typed: what stands in a printed cell is ignored, and the answer holds the printed figures.
    const read = readStatement(given, rows, '', '', [], [['1', '2', '2500']]);
    expect(read.response.subtotals).toEqual([[600000, 850000, 250000]]);
    expect(checkAnswer(given, read.response)).toMatchObject({ correct: true, parts: { right: 4, total: 4 } });
    expect(checkAnswer(given, { ...read.response, subtotals: [[0, 0, 250000]] }).correct).toBe(true);
    expect(checkAnswer(given, { ...read.response, subtotals: [[600000, 850000, 240000]] }).format!.subtotals).toEqual(['amount']);
    // Nothing typed is a sub-total left out, as it always was.
    const empty = readStatement(given, rows, '', '', [], [['', '', '']]);
    expect(empty.response.subtotals).toEqual([null]);
    expect(checkAnswer(given, empty.response)).toMatchObject({ correct: false, parts: { right: 3, total: 4 }, format: { subtotals: ['missing'] } });
    // Unless nothing is what it comes to: a typed figure of nil may be left blank.
    const level = built({
      rows: [{ label: 'Sales', amounts: [500000, 400000, -100000] }, { label: 'Fees', amounts: [100000, 200000, 100000] }, { label: 'Rent', amounts: [50000, 50000, 0] }, { subtotal: 'Total income', amounts: [650000, 650000, 0], sum: 'all', given: true }],
    });
    const blank = readStatement(level, [{ label: 'Sales', amounts: ['', '', '-1000'] }, { label: 'Fees', amounts: ['', '', '1000'] }, { label: 'Rent', amounts: ['', '', ''] }], '', '', [], [['', '', '']]);
    expect(checkAnswer(level, blank.response)).toMatchObject({ correct: true, parts: { right: 4, total: 4 } });
    expect(draftResponse(level, responseDraft(blank.response, level))).toEqual(blank.response);
  });

  it('do not count a sub-total that is printed whole: there is nothing of it to work out', () => {
    const columns: StatementParts['columns'] = [{ name: 'Last year (₹)', given: true }, { name: 'This year (₹)', given: true }];
    const whole = built({
      columns,
      rows: [
        { label: 'Sales', amounts: [500000, 700000] },
        { label: 'Fees', amounts: [100000, 100000] },
        { subtotal: 'Total income', amounts: [600000, 800000], sum: 'all', given: true },
        { label: 'Rent', amounts: [200000, 300000], given: false },
        { subtotal: 'Profit', amounts: [400000, 500000] },
      ],
    });
    expect(expectedRows(whole).map((e) => e.row.label)).toEqual(['Sales', 'Fees', 'Rent', 'Profit']);
    expect(EXERCISE_LOGIC.statement.parts!(whole)).toEqual({ count: 4, name: 'rows' });
    checkFormat(whole, 'a sub-total printed whole');
    // The rows that are printed whole are right by their particulars alone.
    const read = readStatement(whole, [{ label: 'Fees', amounts: ['', ''] }, { label: 'Sales', amounts: ['', ''] }], '', '', [[{ label: 'Rent', amounts: ['2000', '3000'] }]], [['', ''], ['4000', '5000']]);
    expect(read.problems).toEqual([]);
    const result = checkAnswer(whole, read.response);
    expect(result).toMatchObject({ correct: true, parts: { right: 4, total: 4 } });
    expect(result.format!.subtotals).toEqual(['ok', 'ok']);
    // A wrong profit is one row of four, and the code of the attempt has a letter for each row that counts.
    const off = checkAnswer(whole, { ...read.response, subtotals: [null, [400000, 510000]] });
    expect(off).toMatchObject({ correct: false, parts: { right: 3, total: 4 }, mistakeCode: 'rows:oooa' });
    expect(readFormatCode(whole, off.mistakeCode)!.rows).toEqual(['ok', 'ok', 'ok', 'amount']);
    expect(formatSample(whole)).toContain('     = Total income  [₹6,000] | [₹8,000]   [sub-total, given]');
  });

  it('count a printed figure in the totals that must agree', () => {
    const two = built({
      columns: [{ name: 'Debit (₹)', given: true }, 'Credit (₹)'],
      rows: [{ label: 'Cash', amounts: [300000, 0] }, { label: 'Rent', amounts: [100000, 0] }, { label: 'Capital', amounts: [0, 400000] }],
      totalsAgree: true,
    });
    expect(two.givenColumns).toEqual([true, false]);
    expect(two).not.toHaveProperty('columnKinds');
    const rows = [{ label: 'Cash', amounts: ['', ''] }, { label: 'Rent', amounts: ['', ''] }, { label: 'Capital', amounts: ['', '4000'] }];
    expect(statementDisagreement(two, rows)).toBeNull();
    expect(statementDisagreement(two, rows.slice(1))).toBe('The two columns do not agree yet.');
    expect(checkAnswer(two, draftResponse(two, { type: 'statement', rows, final: '' })!)).toMatchObject({ correct: true, parts: { right: 3, total: 3 } });
    // The capital has nothing printed in the credit column: it is typed, and a row with nothing typed there is wrong.
    expect(printedOf(two)('Capital')).toEqual([0, null]);
    expect(readDraft(two, { type: 'statement', rows: [{ label: 'Capital', amounts: ['', ''] }], final: '' })).toMatchObject({ response: { rows: [{ label: 'Capital', amounts: [0, 0] }] } });
  });
});

describe('what the engine refuses of given columns', () => {
  it('refuses a statement that gives every figure, and a line that speaks of given figures where no column is given', () => {
    const all: StatementParts['columns'] = [{ name: 'Last year (₹)', given: true }, { name: 'This year (₹)', given: true }, { name: 'Change (₹)', signed: true, given: true }];
    expect('question' in made({ columns: all })).toBe(true);
    const whole = [...base.rows.slice(0, 3), { subtotal: 'Total income', amounts: [600000, 850000, 250000], sum: 'all' as const, given: true }];
    expect(made({ columns: all, rows: whole })).toEqual({ invalid: 'every figure of every row and sub-total is given: nothing is left to work out' });
    // One row that is worked out is something to work out.
    expect('question' in made({ columns: all, rows: whole.map((r, i) => (i === 1 ? { ...r, given: false } : r)) })).toBe(true);
    const none: StatementParts['columns'] = ['Last year (₹)', 'This year (₹)', { name: 'Change (₹)', signed: true }];
    expect(made({ columns: none, rows: base.rows.map((r, i) => (i === 0 ? { ...r, given: false } : r)) })).toEqual({ invalid: '"Sales" says its figures are not given, and the statement gives no column' });
    expect(made({ columns: none, rows: whole })).toEqual({ invalid: 'the sub-total "Total income" is said to be given, and the statement gives no column' });
    // So does a row marked as given where the column was meant: the author is told, not left without printed figures.
    expect(made({ columns: none, rows: base.rows.map((r, i) => (i === 0 ? { ...r, given: true } : r)) })).toEqual({ invalid: '"Sales" says its figures are given, and the statement gives no column' });
    // Saying what is so anyway is no fault: a row that is given, a sub-total that is not.
    expect('question' in made({ rows: base.rows.map((r) => ({ ...r, given: 'subtotal' in r ? false : true })) })).toBe(true);
    expect(JSON.stringify(built({ rows: base.rows.map((r) => ({ ...r, given: 'subtotal' in r ? false : true })) }))).toBe(JSON.stringify(built()));
  });

  it('refuses two rows of one name that would print different figures', () => {
    const rows: StatementParts['rows'] = [{ label: 'Sales', amounts: [500000, 700000, 200000] }, { heading: 'Next' }, { label: 'Sales', amounts: [100000, 300000, 200000] }, { label: 'Rent', amounts: [0, 50000, 50000] }];
    expect(made({ rows })).toEqual({ invalid: 'two rows "Sales" print different figures: a printed figure follows the particulars of its row' });
    expect('question' in made({ rows, columns: ['Last year (₹)', 'This year (₹)', { name: 'Change (₹)', signed: true }] })).toBe(true);
  });

  it('refuses a given column, and a row that speaks of one, in an account: only a statement prints figures', () => {
    const parts: AccountParts = {
      task: 'Prepare the account.',
      data: 'A supplier, what was bought from it and what it was paid in the month.',
      title: 'Rao & Co. A/c',
      left: drSide([{ label: 'Cash A/c', amount: 100000 }, { label: 'Balance c/d', amount: 300000, closing: true }]),
      right: crSide([{ label: 'Purchases A/c', amount: 400000 }]),
      distractors: ['Bank A/c', 'Sales A/c'],
      explanation: ['Step.'],
    };
    const account = (change: Partial<AccountParts>) => buildInstance(accountTemplate({ id: 'test-given-account', topicId: 'ledger', conceptId: 'x', difficulty: 'easy', generate: () => ({ ...parts, ...change }) }), 1);
    expect('question' in account({})).toBe(true);
    expect(account({ columns: [{ name: 'Amount (₹)', given: true }] as unknown as string[] })).toEqual({ invalid: 'an account gives no column: only a statement prints figures' });
    expect(account({ right: crSide([{ label: 'Purchases A/c', amount: 400000, given: false }]) })).toEqual({ invalid: '"Purchases A/c" speaks of given figures: only a row of a statement does' });
  });
});

describe('an authored statement that gives columns', () => {
  const T = 'a-topic-of-no-course';
  const pack = (questions: TopicPack['questions']): TopicPack => ({ topicId: T, concepts: [{ id: 's12-formats', topicId: T, title: 'F' }], cards: [], levels: [], questions });
  const q: StatementQuestion = { ...statement('s12-comparative-given', 5), id: 'pf-q-900', topicId: T };

  it('is accepted as the engine builds it, and reported when it gives what it cannot', () => {
    expect(validatePack(pack([q]))).toEqual([]);
    expect(validatePack(pack([{ ...q, givenColumns: [true, true] }]))).toContain('question pf-q-900: 2 columns are said to be given or not, for 4 amount columns');
    expect(validatePack(pack([{ ...q, givenColumns: undefined }]))).toContain('question pf-q-900: "Tax" says its figures are not given, and the statement gives no column');
    const whole: StatementQuestion = { ...q, givenColumns: [true, true, true, true], rows: q.rows.map((row) => ({ label: row.label, amounts: row.amounts })), lines: q.lines!.map((l) => ('subtotal' in l ? { ...l, given: true as const } : l)) };
    expect(validatePack(pack([whole]))).toContain('question pf-q-900: every figure of every row and sub-total is given: nothing is left to work out');
  });
});
