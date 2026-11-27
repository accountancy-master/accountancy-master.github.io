import { describe, expect, it } from 'vitest';
import { formatSample } from '@/content/report';
import type { AccountQuestion, StatementQuestion, TopicPack } from '@/content/types';
import { validatePack } from '@/content/validate';
import { partnerCapital, partnerCurrent, partnerDrawings } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, columnLabel, columnarAccount, type DatedEntry } from '@/engine/books';
import { MAX_FORMAT_COLUMNS, figureProblem, parseFigure, rowProblem, sayFigure, showFigure, typedFigure, type ColumnKind } from '@/engine/formats';
import { checkAnswer } from '@/exercises/checkers';
import { EXERCISE_LOGIC, answerToKeep, expectedRows, formatLists, readFormatCode, statementCuts, subtotalsOf, type Response } from '@/exercises/logic';
import { creditMarks } from '@/learning/mockPaper';
import { asDraft, draftFilled, draftResponse, readDraft, responseDraft } from '@/play/drafts';
import { readStatement, runningTotals, startStatement, statementListName } from '@/play/formatRows';
import { partCredit } from '@/play/mockSitting';
import { parseBackup } from '@/storage/backup';
import { BACKUP_FORMAT } from '@/storage/types';
import { class12Templates } from '@/testing/class12Topic';
import { checkFormat } from '@/testing/questionChecks';
import { rightFormat, rightFormatDraft, wrongFormatDraft } from '@/testing/sampleFormats';
import { accountTemplate, columnarSides, partnerColumns, statementTemplate } from './authoring';
import { buildInstance, generateFrom } from './engine';
import type { StatementParts, Template } from './types';

const SEEDS = 120;
const TEMPLATES = class12Templates('partnership-fundamentals');
const template = (id: string): Template => TEMPLATES.find((t) => t.id === id)!;
const account = (seed: number) => generateFrom(template('s12-capital-accounts'), seed) as AccountQuestion;
const statement = (id: string, seed: number) => generateFrom(template(id), seed) as StatementQuestion;
const dr = (accountId: string, amount: number) => ({ accountId, side: 'Dr' as const, amount });
const cr = (accountId: string, amount: number) => ({ accountId, side: 'Cr' as const, amount });

describe("partners' accounts in columns", () => {
  const names = ['Asha', 'Bimal', 'Chitra'];
  const capitals = names.map(partnerCapital);
  const entries: DatedEntry[] = [
    { date: '1 October 2025', lines: [dr('bank', 5000000), cr(capitals[1], 5000000)] },
    { date: '31 March 2026', lines: [dr(capitals[0], 2000000), cr(partnerDrawings('Asha'), 2000000)] },
    { date: '31 March 2026', lines: [dr(capitals[2], 3000000), cr(partnerDrawings('Chitra'), 3000000)] },
    { date: '31 March 2026', lines: [dr('profitAndLossAppropriation', 6000000), cr(capitals[0], 3000000), cr(capitals[1], 2000000), cr(capitals[2], 1000000)] },
  ];
  const opening = { date: '1 April 2025', balances: [{ side: 'Cr' as const, amount: 30000000 }, { side: 'Cr' as const, amount: 20000000 }, null] };
  const view = columnarAccount(entries, capitals, opening);

  it('write every posting in the column of its account, and share a row among postings of one day and one name', () => {
    expect(view.credit).toEqual([
      { date: '1 April 2025', side: 'Cr', label: BALANCE_BD, amounts: [30000000, 20000000, 0] },
      { date: '1 October 2025', side: 'Cr', label: 'Bank A/c', amounts: [0, 5000000, 0] },
      { date: '31 March 2026', side: 'Cr', label: 'Profit and Loss Appropriation A/c', amounts: [3000000, 2000000, 1000000] },
    ]);
    // The drawings of two partners are one row: a partner's own account has no name in the particulars.
    expect(view.debit).toEqual([{ date: '31 March 2026', side: 'Dr', label: 'Drawings A/c', amounts: [2000000, 0, 3000000] }]);
    expect(columnLabel(partnerDrawings('Asha'))).toBe('Drawings A/c');
    expect(columnLabel(partnerCurrent('Asha'))).toBe('Current A/c');
    expect(columnLabel('bank')).toBe('Bank A/c');
  });

  it('balance every column on its own: a credit balance is carried down on the debit side, a debit one on the credit side', () => {
    // Chitra drew more than her share of profit and had no capital: her column has a debit balance.
    expect(view.balances).toEqual([{ side: 'Cr', amount: 31000000 }, { side: 'Cr', amount: 27000000 }, { side: 'Dr', amount: 2000000 }]);
    expect(view.totals).toEqual([33000000, 27000000, 3000000]);
    const sides = columnarSides(view, { closeOn: '31 March 2026', reopenOn: '1 April 2026' });
    expect(sides.left.rows.at(-1)).toEqual({ date: '31 March 2026', label: BALANCE_CD, amounts: [31000000, 27000000, 0], closing: true });
    expect(sides.right.rows.at(-1)).toEqual({ date: '31 March 2026', label: BALANCE_CD, amounts: [0, 0, 2000000], closing: true });
    expect(sides.right.below).toEqual([{ date: '1 April 2026', label: BALANCE_BD, amounts: [31000000, 27000000, 0] }]);
    expect(sides.left.below).toEqual([{ date: '1 April 2026', label: BALANCE_BD, amounts: [0, 0, 2000000] }]);
    expect(sides.broughtDown).toBe(true);
    expect(columnarSides(view, { closeOn: '31 March 2026' })).not.toHaveProperty('broughtDown');
    expect(partnerColumns(names)).toEqual(['Asha (₹)', 'Bimal (₹)', 'Chitra (₹)']);
  });

  it('start a row of its own for a second posting of one account under the same name on the same day', () => {
    const twice = columnarAccount([...entries, { date: '31 March 2026', lines: [dr(capitals[0], 500000), cr(partnerDrawings('Asha'), 500000)] }], capitals);
    expect(twice.debit.map((r) => r.amounts)).toEqual([[2000000, 0, 3000000], [500000, 0, 0]]);
  });

  it('make an account of three or four columns that the engine accepts and the harness passes', () => {
    expect(MAX_FORMAT_COLUMNS).toBe(4);
    const widths = new Set<number>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const q = account(seed);
      widths.add(q.columns.length);
      checkFormat(q, `s12-capital-accounts seed ${seed}`);
      expect(q.continued).toBe(true);
      // A row has an amount in some columns and none in the others; the closing row has one in every column.
      expect(q.sides[1].rows.some((r) => r.amounts.filter((a) => a > 0).length === 1), `seed ${seed}`).toBe(true);
      expect(q.sides[0].rows.find((r) => r.closing)!.amounts.every((a) => a > 0), `seed ${seed}`).toBe(true);
    }
    expect(widths).toEqual(new Set([3, 4]));
  });

  it('refuse an account whose sides disagree in one column, naming the column, and one with five columns', () => {
    const made = (columns: string[], fix: number) =>
      buildInstance(
        accountTemplate({
          id: 'test-columns',
          topicId: 'partnership-fundamentals',
          conceptId: 'x',
          difficulty: 'easy',
          generate: () => ({
            task: 'Prepare the capital accounts.',
            data: 'Asha, Bimal and Chitra are partners. Their capitals and drawings are given.',
            title: "Partners' Capital Accounts",
            columns,
            left: { title: 'Dr', prefix: 'To', rows: [{ label: 'Drawings A/c', amounts: columns.map(() => 100000) }, { label: 'Balance c/d', amounts: columns.map((_, c) => (c === 1 ? fix : 900000)), closing: true }] },
            right: { title: 'Cr', prefix: 'By', rows: [{ label: 'Balance b/d', amounts: columns.map(() => 1000000) }] },
            distractors: ['Cash A/c', 'Current A/c'],
            explanation: ['Step.'],
          }),
        }),
        1,
      );
    expect('question' in made(partnerColumns(names), 900000)).toBe(true);
    expect(made(partnerColumns(names), 800000)).toEqual({ invalid: 'the two sides do not agree in the column Bimal (₹): 900000 against 1000000' });
    expect(made(partnerColumns(['A', 'B', 'C', 'D', 'E']), 900000)).toEqual({ invalid: '5 amount columns, not 1 to 4' });
  });

  it('are marked row by row, a figure in the wrong column told as such, and kept as they were answered', () => {
    // A seed in which the first two partners drew different amounts.
    const seed = Array.from({ length: SEEDS }, (_, i) => i + 1).find((s) => account(s).sides[0].rows[0].amounts[0] !== account(s).sides[0].rows[0].amounts[1])!;
    const q = account(seed);
    const right = rightFormat(q);
    expect(checkAnswer(q, right)).toMatchObject({ correct: true, parts: { right: expectedRows(q).length, total: expectedRows(q).length } });
    if (right.type !== 'account') throw new Error('not an account');
    // The drawings of the first two partners typed in each other's columns.
    const [first, ...rest] = right.sides[0];
    const swapped = { ...first, amounts: [first.amounts[1], first.amounts[0], ...first.amounts.slice(2)] };
    const wrong: Response = { ...right, sides: [[swapped, ...rest], right.sides[1]] };
    const result = checkAnswer(q, wrong);
    expect(result.correct).toBe(false);
    expect(first.label).toBe('Drawings A/c');
    expect(result.format!.entered[0][0]).toBe('wrongColumn');
    expect(answerToKeep(wrong, result)).toBe(wrong);
    // The kept answer goes back into the input it was given in, a figure for every column.
    const draft = responseDraft(wrong, q);
    expect(asDraft(q, draft)).toEqual(draft);
    expect(draftResponse(q, draft)).toEqual(wrong);
    expect(draftResponse(q, rightFormatDraft(q))).toEqual(right);
    expect(checkAnswer(q, draftResponse(q, wrongFormatDraft(q))!).correct).toBe(false);
  });

  it('are laid out for the reviewer with a figure in every column', () => {
    const lines = formatSample(account(3));
    expect(lines.some((l) => l.includes("Partners' Capital Accounts  [") && l.includes(' (₹) | '))).toBe(true);
    expect(lines.some((l) => l.includes('To Drawings A/c') && l.split('|').length >= 3)).toBe(true);
    expect(lines.some((l) => l.includes('To Balance c/d [closing]'))).toBe(true);
  });
});

describe('the figures of a column of a statement', () => {
  const rupees: ColumnKind = { unit: 'rupees', adds: true };
  const signed: ColumnKind = { unit: 'rupees', signed: true, adds: true };
  const percent: ColumnKind = { unit: 'percent', signed: true, adds: false };
  const count: ColumnKind = { unit: 'number', adds: true };

  it('are read in the unit of the column, a negative one only where the column takes it', () => {
    expect(parseFigure('12,500', rupees)).toBe(1250000);
    expect(parseFigure('0', rupees)).toBeNull();
    expect(parseFigure('-500', rupees)).toBeNull();
    expect(parseFigure('12,500', signed)).toBe(1250000);
    for (const typed of ['-12,500', '- 12,500', '−12,500', '(12,500)', '( 12500 )']) expect(parseFigure(typed, signed), typed).toBe(-1250000);
    expect(parseFigure('0', signed)).toBe(0);
    expect(parseFigure('-0', signed)).toBe(0);
    expect(parseFigure('12.5', percent)).toBe(1250);
    expect(parseFigure('-16.67%', percent)).toBe(-1667);
    expect(parseFigure('(20)', percent)).toBe(-2000);
    expect(parseFigure('0.00', percent)).toBe(0);
    expect(parseFigure('12.555', percent)).toBeNull();
    expect(parseFigure('4,000', count)).toBe(4000);
    expect(parseFigure('40', count)).toBe(40);
    expect(parseFigure('-40', count)).toBeNull();
    expect(parseFigure('4.5', count)).toBeNull();
    for (const bad of ['', 'abc', '--5', '(5', '5)']) expect(parseFigure(bad, signed), bad).toBeNull();
  });

  it('are shown without a sign, a negative one in brackets, and typed back with a minus sign', () => {
    expect(showFigure(1250000)).toBe('12,500');
    expect(showFigure(0, signed)).toBe('');
    expect(showFigure(-1250000, signed)).toBe('(12,500)');
    expect(showFigure(-1667, percent)).toBe('(16.67)');
    expect(showFigure(2000, percent)).toBe('20');
    expect(showFigure(125000, count)).toBe('1,25,000');
    expect(typedFigure(-1250000, signed)).toBe('-12,500');
    expect(typedFigure(1250, percent)).toBe('12.5');
    expect(typedFigure(0, percent)).toBe('');
    expect(sayFigure(-1250000, signed)).toBe('(₹12,500)');
    expect(sayFigure(1250, percent)).toBe('12.5%');
    expect(sayFigure(-1667, percent)).toBe('(16.67)%');
    for (const [value, kind] of [[-1250000, signed], [9800000, signed], [-1667, percent], [5, percent], [4000, count]] as const) {
      expect(parseFigure(typedFigure(value, kind), kind), `${value}`).toBe(value);
      expect(parseFigure(showFigure(value, kind), kind), `${value} as shown`).toBe(value);
    }
  });

  it('must be whole rupees in a rupee column, and may be negative only in a signed one', () => {
    expect(figureProblem(-1250000, signed)).toBeNull();
    expect(figureProblem(-1250000, rupees)).toMatch(/negative/);
    expect(figureProblem(1250050, signed)).toMatch(/whole number of rupees/);
    expect(figureProblem(1667, percent)).toBeNull();
    expect(figureProblem(1.5, count)).toMatch(/whole number/);
    const row = { label: 'Other income', amounts: [5000000, 4000000, -1000000, -2000] };
    expect(rowProblem(row, 4, [rupees, rupees, signed, percent])).toBeNull();
    expect(rowProblem(row, 4)).toBe('"Other income" has amount -1000000, not a positive whole number of rupees');
    expect(rowProblem({ label: 'x', amounts: [0, 0, 0, 0] }, 4, [rupees, rupees, signed, percent])).toBe('"x" has no amount');
  });
});

describe('a comparative statement: columns of several kinds, a sub-heading and sub-totals', () => {
  const q = statement('s12-comparative', 5);

  it('declares the kind of every column, and keeps its sub-heading and sub-totals between its rows', () => {
    expect(q.columns).toEqual(['2024-25 (₹)', '2025-26 (₹)', 'Absolute change (₹)', 'Percentage change (%)']);
    expect(q.columnKinds).toEqual([
      { unit: 'rupees', adds: true },
      { unit: 'rupees', adds: true },
      { unit: 'rupees', signed: true, adds: true },
      { unit: 'percent', signed: true, adds: false },
    ]);
    expect(q.rows.map((r) => r.label)).toEqual(['Revenue from operations', 'Other income', 'Employee benefits expense', 'Other expenses']);
    expect(q.lines!.map((l) => ('heading' in l ? [l.at, l.heading] : [l.at, l.subtotal]))).toEqual([[2, 'Total revenue'], [2, 'Expenses'], [4, 'Total expenses'], [4, 'Profit before tax']]);
    // Two lists: the rows above the sub-heading, and those under it.
    expect(statementCuts(q)).toEqual([0, 2]);
    expect(formatLists(q).map((list) => list.map((r) => r.label))).toEqual([['Revenue from operations', 'Other income'], ['Employee benefits expense', 'Other expenses']]);
    expect(statementListName(q, 0)).toBe('Part 1');
    expect(statementListName(q, 1)).toBe('Expenses');
    // Other income fell: a negative change and a negative percentage.
    const other = q.rows[1].amounts;
    expect(other[2]).toBeLessThan(0);
    expect(other[3]).toBeLessThan(0);
  });

  it('counts every sub-total as a row, after the rows and in their order', () => {
    expect(expectedRows(q).map((e) => [e.row.label, e.subtotal ?? false])).toEqual([
      ['Revenue from operations', false],
      ['Other income', false],
      ['Employee benefits expense', false],
      ['Other expenses', false],
      ['Total revenue', true],
      ['Total expenses', true],
      ['Profit before tax', true],
    ]);
    expect(EXERCISE_LOGIC.statement.parts!(q)).toEqual({ count: 7, name: 'rows' });
  });

  it('passes the harness over many seeds, percentages to two decimal places and all', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const made = statement('s12-comparative', seed);
      checkFormat(made, `s12-comparative seed ${seed}`);
      for (const figures of [...made.rows.map((r) => r.amounts), ...subtotalsOf(made).map((l) => l.amounts)]) {
        expect(figures[3], `seed ${seed}`).toBe(Math.round(((figures[1] - figures[0]) * 10000) / figures[0]));
      }
    }
  });

  it('is right with its own rows and sub-totals, and loses a row for each one that is not', () => {
    const right = rightFormat(q);
    expect(checkAnswer(q, right)).toMatchObject({ correct: true, parts: { right: 7, total: 7 } });
    if (right.type !== 'statement') throw new Error('not a statement');
    // A decrease typed as an increase: the row is told to have a wrong amount.
    const [revenue, other] = right.rows;
    const flipped: Response = { ...right, rows: [revenue, { ...other, amounts: other.amounts.map((a) => Math.abs(a)) }] };
    const result = checkAnswer(q, flipped);
    expect(result).toMatchObject({ correct: false, parts: { right: 6, total: 7 } });
    expect(result.format!.entered[0]).toEqual(['correct', 'wrongAmount']);
    expect(readFormatCode(q, result.mistakeCode)!.rows).toEqual(['ok', 'amount', 'ok', 'ok', 'ok', 'ok', 'ok']);
    // A sub-total with a wrong percentage, and one left out.
    const subs = right.subtotals as number[][];
    const off: Response = { ...right, subtotals: [[...subs[0].slice(0, 3), subs[0][3] + 1], subs[1], null] };
    const marked = checkAnswer(q, off);
    expect(marked.format!.subtotals).toEqual(['amount', 'ok', 'missing']);
    expect(marked.parts).toEqual({ right: 5, total: 7 });
    expect(EXERCISE_LOGIC.statement.describeWrong(q, marked.mistakeCode!)).toBe('5 of 7 rows right.');
  });

  it('tells a row entered under the wrong sub-heading from a row that is not needed', () => {
    const right = rightFormat(q);
    if (right.type !== 'statement') throw new Error('not a statement');
    const moved: Response = { ...right, rows: [right.rows[0]], more: [[...right.more![0], right.rows[1]]] };
    const result = checkAnswer(q, moved);
    expect(result.format!.entered).toEqual([['correct'], ['correct', 'correct', 'wrongPlace']]);
    expect(readFormatCode(q, result.mistakeCode)!.rows.slice(0, 4)).toEqual(['ok', 'place', 'ok', 'ok']);
    expect(result.format!.extra).toBe(0);
  });

  it('is read from what is typed: a minus sign or brackets for a fall, a percent in the percent column', () => {
    const draft = rightFormatDraft(q);
    if (draft.type !== 'statement') throw new Error('not a statement');
    expect(draft.rows[1].amounts[2]).toMatch(/^-/);
    expect(draft.more).toHaveLength(1);
    expect(draft.subtotals).toHaveLength(3);
    expect(draftResponse(q, draft)).toEqual(rightFormat(q));
    // Brackets are read as a minus sign is.
    const bracketed = { ...draft, rows: draft.rows.map((r) => ({ ...r, amounts: r.amounts.map((a) => (a.startsWith('-') ? `(${a.slice(1)})` : a)) })) };
    expect(draftResponse(q, bracketed)).toEqual(rightFormat(q));
    // A minus sign in a column that takes none is not a figure: the row is not read, and the rest is.
    const bad = { ...draft, rows: [{ ...draft.rows[0], amounts: [`-${draft.rows[0].amounts[0]}`, ...draft.rows[0].amounts.slice(1)] }, draft.rows[1]] };
    const read = readDraft(q, bad);
    expect(read).toMatchObject({ problem: 'Part 1, row 1: enter a valid amount.' });
    expect('response' in read && read.response.type === 'statement' && read.response.rows).toHaveLength(1);
    // A sub-total that is begun is read whole; one with a figure that is none is a problem and is not marked.
    const partial = readStatement(q, draft.rows, '', '', draft.more, [[draft.subtotals![0][0], '', '', ''], ['x', '', '', ''], ['', '', '', '']]);
    expect(partial.response.subtotals).toEqual([[rightSub(q, 0)[0], 0, 0, 0], null, null]);
    expect(partial.problems).toEqual(['Total expenses: enter a valid amount.']);
  });

  it('starts empty with a list for every part, and counts as filled once a sub-total is typed', () => {
    const start = startStatement(q);
    expect(start.rows).toHaveLength(1);
    expect(start.more).toEqual([[{ label: '', amounts: ['', '', '', ''] }]]);
    expect(start.subtotals).toEqual([['', '', '', ''], ['', '', '', ''], ['', '', '', '']]);
    const empty = { type: 'statement' as const, rows: start.rows, final: '', more: start.more, subtotals: start.subtotals };
    expect(draftFilled(empty)).toBe(false);
    expect(readDraft(q, empty)).toEqual({ empty: true });
    expect(draftFilled({ ...empty, subtotals: [['5', '', '', ''], ...start.subtotals.slice(1)] })).toBe(true);
    // The running total of a column is in the unit of the column, and takes the sign of every figure.
    const draft = rightFormatDraft(q);
    if (draft.type !== 'statement') throw new Error('not a statement');
    expect(runningTotals(draft.rows, 4, q.columnKinds)).toEqual(q.rows.slice(0, 2).reduce((sum, r) => sum.map((t, c) => t + r.amounts[c]), [0, 0, 0, 0]));
  });

  it('keeps the answer of an attempt, sub-totals and negative figures included, through a backup', () => {
    const right = rightFormat(q);
    if (right.type !== 'statement') throw new Error('not a statement');
    const wrong: Response = { ...right, subtotals: [right.subtotals![0], null, right.subtotals![2]] };
    const kept = answerToKeep(wrong, checkAnswer(q, wrong))!;
    const attempt = { id: 'a1', profileId: 'p1', courseId: 'cbse-12-accountancy', topicId: q.topicId, conceptId: q.conceptId, questionId: q.id, difficulty: q.difficulty, correct: false, hintsUsed: 0, timeMs: 1, at: 1, sessionId: 's', answer: kept };
    const profile = { id: 'p1', name: 'A', courseId: 'cbse-12-accountancy', createdAt: 1 };
    const back = parseBackup(JSON.parse(JSON.stringify({ format: BACKUP_FORMAT, version: 1, profile, attempts: [attempt], levelResults: [] })));
    expect(back.attempts[0].answer).toEqual(kept);
    // And the Mistakes screen puts it back into the input, in the units of the columns.
    const draft = responseDraft(kept, q);
    expect(asDraft(q, draft)).toEqual(draft);
    expect(draftResponse(q, draft)).toEqual(kept);
  });

  it('shares the marks of a mock paper among its rows and sub-totals', () => {
    const right = rightFormat(q);
    if (right.type !== 'statement') throw new Error('not a statement');
    const off: Response = { ...right, subtotals: [null, null, null] };
    const result = checkAnswer(q, off);
    expect(result.parts).toEqual({ right: 4, total: 7 });
    expect(partCredit(result)).toEqual({ right: 4, total: 7 });
    // Four marks, four of seven parts right: 4 x 4 / 7 = 2.29, to the nearest half mark.
    expect(creditMarks(4, [partCredit(result)])).toBe(2.5);
    expect(creditMarks(4, [partCredit(checkAnswer(q, right))])).toBe(4);
  });

  it('is laid out for the reviewer with its sub-heading, its sub-totals and figures in the unit of each column', () => {
    const lines = formatSample(q);
    expect(lines).toContain('   Expenses');
    expect(lines.some((l) => l.startsWith('     = Total revenue  ₹') && l.endsWith('[sub-total, worked out]'))).toBe(true);
    expect(lines.some((l) => l.includes('Other income') && /\(₹[\d,]+\) \| \([\d.]+\)%$/.test(l))).toBe(true);
    // A statement with sub-totals has no total of the whole.
    expect(lines.some((l) => l.trimStart().startsWith('Total  '))).toBe(false);
  });
});

/** The figures of a sub-total of a statement. */
const rightSub = (q: StatementQuestion, i: number): number[] => subtotalsOf(q)[i].amounts;

describe('a cash flow statement: one signed column, three parts and the figure it ends on', () => {
  it('passes the harness, every sub-total adding up what it says it adds', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const q = statement('s12-cash-flow', seed);
      checkFormat(q, `s12-cash-flow seed ${seed}`);
      expect(q.columnKinds).toEqual([{ unit: 'rupees', signed: true, adds: true }]);
      expect(statementCuts(q)).toHaveLength(6);
      const [operating, , net] = [subtotalsOf(q)[2], subtotalsOf(q)[3], subtotalsOf(q)[5]];
      expect(operating.amounts[0], `seed ${seed}`).toBe(q.rows.slice(0, 5).reduce((sum, r) => sum + r.amounts[0], 0));
      expect(net.amounts[0], `seed ${seed}`).toBe(q.rows.slice(0, 9).reduce((sum, r) => sum + r.amounts[0], 0));
      expect(q.final!.amount, `seed ${seed}`).toBe(net.amounts[0] + q.rows[9].amounts[0]);
      // Outflows are negative figures of the rows they belong to.
      expect(q.rows.filter((r) => r.amounts[0] < 0).map((r) => r.label)).toEqual(['Increase in trade receivables', 'Income tax paid', 'Purchase of machinery', 'Dividend paid']);
    }
  });

  it('is marked list by list, sub-total by sub-total and for its final figure', () => {
    const q = statement('s12-cash-flow', 2);
    const right = rightFormat(q);
    expect(checkAnswer(q, right)).toMatchObject({ correct: true, parts: { right: 17, total: 17 } });
    expect(draftResponse(q, rightFormatDraft(q))).toEqual(right);
    if (right.type !== 'statement') throw new Error('not a statement');
    // An outflow typed as an inflow costs its row; the final figure typed wrong costs one more.
    const wrong: Response = { ...right, more: right.more!.map((list, k) => (k === 1 ? [{ ...list[0], amounts: [-list[0].amounts[0]] }] : list)), final: right.final! + 100 };
    const result = checkAnswer(q, wrong);
    expect(result.parts).toEqual({ right: 15, total: 17 });
    expect(result.format!.final).toBe('amount');
    expect(result.format!.entered[2]).toEqual(['wrongAmount']);
  });
});

describe('a balance sheet in the Schedule III form: sub-headings, totals and a column of note numbers', () => {
  const q = statement('s12-balance-sheet', 4);

  it('passes the harness, and its two totals are the same figure', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const made = statement('s12-balance-sheet', seed);
      checkFormat(made, `s12-balance-sheet seed ${seed}`);
      const totals = subtotalsOf(made).map((l) => l.amounts[0]);
      expect(totals[0], `seed ${seed}`).toBe(totals[1]);
    }
  });

  it('has plain rupee columns, a heading for the notes and a note number on the rows that have a note', () => {
    expect(q.columnKinds).toBeUndefined();
    expect(q.noteHeading).toBe('Note No.');
    expect(q.rows.map((r) => [r.label, r.note])).toEqual([
      ['Share capital', '1'],
      ['Reserves and surplus', '2'],
      ['Long-term borrowings', '3'],
      ['Trade payables', undefined],
      ['Short-term provisions', undefined],
      ['Property, plant and equipment', '4'],
      ['Inventories', undefined],
      ['Trade receivables', undefined],
      ['Cash and cash equivalents', undefined],
    ]);
    // Two sub-headings that stand together head one list.
    expect(statementCuts(q)).toEqual([0, 2, 3, 5, 6]);
    expect(statementListName(q, 0)).toBe("1. Shareholders' funds");
    expect(statementListName(q, 3)).toBe('1. Non-current assets');
    // The note is shown, never typed: the answer has no place for it.
    expect(JSON.stringify(rightFormat(q))).not.toContain('note');
    expect(formatSample(q)).toContain(`     Share capital [note 1]  ${sayFigure(q.rows[0].amounts[0])}`);
  });
});

describe('what the engine refuses of a statement in parts', () => {
  const base: StatementParts = {
    task: 'Prepare the statement.',
    data: 'A company and its figures for the year, one to a line, as the question gives them.',
    title: 'Statement',
    columns: [{ name: 'Amount (₹)', signed: true }],
    rows: [],
    distractors: ['One', 'Two'],
    explanation: ['Step.'],
  };
  const made = (change: Partial<StatementParts>) =>
    buildInstance(statementTemplate({ id: 'test-parts', topicId: 'cash-flow-statement', conceptId: 'x', difficulty: 'medium', generate: () => ({ ...base, ...change }) }), 1);
  const rows: StatementParts['rows'] = [
    { heading: 'A. Operating activities' },
    { label: 'Profit', amount: 500000 },
    { label: 'Tax paid', amount: -100000 },
    { subtotal: 'Net cash from operating activities', amount: 400000, sum: 'section' },
    { heading: 'B. Investing activities' },
    { label: 'Machinery bought', amount: -300000 },
    { subtotal: 'Net cash used in investing activities', amount: -300000, sum: 'section' },
    { subtotal: 'Net increase in cash', amount: 100000, sum: 'all' },
  ];

  it('accepts sub-totals that add up what they say, in sections, blocks or over everything above', () => {
    expect('question' in made({ rows })).toBe(true);
    const blocks: StatementParts['rows'] = [rows[0], rows[1], rows[2], { subtotal: 'First', amount: 400000, sum: 'block' }, rows[4], rows[5], { subtotal: 'Second', amount: -300000, sum: 'block' }];
    expect('question' in made({ rows: blocks })).toBe(true);
  });

  it('refuses a sub-total that is not the sum it says it is, a figure its column cannot hold, or one with no figure', () => {
    const off = rows.map((r, i) => (i === 3 ? { subtotal: 'Net cash from operating activities', amount: 450000, sum: 'section' as const } : r));
    expect(made({ rows: off })).toEqual({ invalid: 'the sub-total "Net cash from operating activities" is 450000, not the 400000 its rows add up to' });
    // Unchecked, a sub-total may be anything its author says (a difference, say).
    expect('question' in made({ rows: off.map((r) => ('subtotal' in r ? { subtotal: r.subtotal, amount: r.amount } : r)) })).toBe(true);
    expect(made({ rows: [...rows.slice(0, 3), { subtotal: 'Odd', amount: 400050 }] })).toEqual({ invalid: 'the sub-total "Odd" has a figure 400050 that is not a whole number of rupees' });
    expect(made({ rows: [...rows.slice(0, 3), { subtotal: 'Nil', amount: 0 }] })).toEqual({ invalid: 'the sub-total "Nil" has no figure' });
    expect(made({ rows: [...rows.slice(0, 3), { subtotal: 'None' }] })).toEqual({ invalid: 'the sub-total "None" has 0 figures for 1 amount columns' });
  });

  it('refuses a negative figure in a column that takes none, and totals that agree in a statement of other kinds', () => {
    const flows: StatementParts['rows'] = [{ label: 'Profit', amount: 500000 }, { label: 'Tax paid', amount: -100000 }, { label: 'Machinery bought', amount: -300000 }];
    expect('question' in made({ rows: flows })).toBe(true);
    expect(made({ rows: flows, columns: ['Amount (₹)'] })).toEqual({ invalid: '"Tax paid" has amount -100000, not a positive whole number of rupees' });
    expect(made({ rows, columns: ['Amount (₹)'] })).toEqual({
      invalid: 'the sub-total "Net cash used in investing activities" has a figure -300000 that is negative, in a column that takes no negative figure',
    });
    const two: StatementParts['rows'] = [{ label: 'A', amounts: [100000, 0] }, { label: 'B', amounts: [0, 100000] }, { label: 'C', amounts: [50000, 50000] }];
    expect('question' in made({ rows: two, columns: ['Debit (₹)', 'Credit (₹)'], totalsAgree: true })).toBe(true);
    expect(made({ rows: two, columns: ['Debit (₹)', { name: 'Credit (₹)', signed: true }], totalsAgree: true })).toEqual({
      invalid: 'only a statement of two plain rupee columns, with no sub-total, can have totals that agree',
    });
  });

  it('refuses a note number without a heading for the notes, and two rows of one part that cannot be told apart', () => {
    expect(made({ rows: [{ label: 'A', amount: 100000, note: '1' }, { label: 'B', amount: 200000 }, { label: 'C', amount: 300000 }] })).toEqual({
      invalid: 'a row has a note number, and the statement has no heading for the notes',
    });
    const twins: StatementParts['rows'] = [{ label: 'A', amount: 100000 }, { label: 'A', amount: 100000 }, { heading: 'Next' }, { label: 'B', amount: 100000 }];
    expect(made({ rows: twins })).toEqual({ invalid: 'two rows "A" with the same amounts cannot be told apart' });
    // The same row in two parts is two rows: each part is matched on its own.
    const apart: StatementParts['rows'] = [{ label: 'A', amount: 100000 }, { label: 'C', amount: 100000 }, { heading: 'Next' }, { label: 'A', amount: 100000 }];
    expect('question' in made({ rows: apart })).toBe(true);
  });

  it('builds a statement with no part and no kind exactly as it always was', () => {
    const plain = made({ columns: ['Amount (₹)'], rows: [{ label: 'A', amount: 100000 }, { label: 'B', amount: 200000 }, { label: 'C', amount: 300000 }] });
    if (!('question' in plain) || plain.question.type !== 'statement') throw new Error('not built');
    expect(Object.keys(plain.question)).not.toEqual(expect.arrayContaining(['columnKinds']));
    expect(plain.question).not.toHaveProperty('lines');
    expect(plain.question).not.toHaveProperty('noteHeading');
    expect(statementCuts(plain.question)).toEqual([0]);
    expect(EXERCISE_LOGIC.statement.e2eExpected(plain.question)).toEqual({ rows: plain.question.rows.map((r) => ({ label: r.label, amounts: r.amounts })), final: null });
    expect(rightFormat(plain.question)).toEqual({ type: 'statement', rows: plain.question.rows.map((r) => ({ label: r.label, amounts: r.amounts })), final: null });
  });
});

describe('authored formats of the new kinds', () => {
  // A topic of no course, so that the pack is checked for what is in it and for nothing a real topic has.
  const T = 'a-topic-of-no-course';
  const pack = (questions: TopicPack['questions']): TopicPack => ({ topicId: T, concepts: [{ id: 's12-basics', topicId: T, title: 'B' }, { id: 's12-formats', topicId: T, title: 'F' }], cards: [], levels: [], questions });

  it('are accepted as the engine builds them, and reported when a figure or a sub-total is not one', () => {
    const q = statement('s12-comparative', 5);
    const capital = account(3);
    expect(validatePack(pack([{ ...q, id: 'pf-q-900', topicId: T }, { ...capital, id: 'pf-q-901', topicId: T }]))).toEqual([]);
    const bad: StatementQuestion = { ...q, id: 'pf-q-900', lines: q.lines!.map((l) => ('subtotal' in l ? { ...l, amounts: [1, 2] } : l)) };
    expect(validatePack(pack([bad]))).toContain('question pf-q-900: the sub-total "Total revenue" needs a figure its columns can hold');
    const negative: StatementQuestion = { ...q, id: 'pf-q-900', columnKinds: undefined };
    expect(validatePack(pack([negative])).some((e) => e.includes('not a positive whole number of rupees'))).toBe(true);
  });
});
