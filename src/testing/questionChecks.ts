/**
 * The checks the harnesses run on a long question, whoever made it: `generators.test.ts` on every set and format of a
 * template, `cases.test.ts` on those that are one question of a case study. A failure names the question (`at`).
 */
import { expect } from 'vitest';
import type { AccountQuestion, FormatRow, JournalSetQuestion, StatementQuestion, TypedQuestion } from '@/content/types';
import { resolveAccount } from '@/engine/accounts';
import { compareJournal } from '@/engine/compare';
import {
  MAX_ACCOUNT_PERIODS,
  MAX_FORMAT_COLUMNS,
  MAX_FORMAT_ROWS,
  MAX_PERIODS_ROWS,
  MAX_STATEMENT_COLUMNS,
  MIN_FORMAT_ROWS,
  acceptedLabels,
  columnTotals,
  figureProblem,
  givenProblem,
  isPlainColumn,
  kindOf,
} from '@/engine/formats';
import { isBalanced } from '@/engine/journal';
import { EXERCISE_LOGIC, expectedRows, formatLists, subtotalsOf } from '@/exercises/logic';
import { isRatio, readNumeric, typedNumeric } from '@/exercises/numeric';
import { setDateOrder } from '@/generators/engine';
import { draftResponse } from '@/play/drafts';
import { rightFormat, rightFormatDraft } from './sampleFormats';

// A typed answer: what it is held as, that typing it reads back as itself and is marked right, and that every known
// wrong answer can be typed and is told as the mistake it names.
export function checkNumericAnswer(q: TypedQuestion, at: string) {
  if (q.unit === 'ratio') {
    expect(isRatio(q.answer), `${at}: answer ${JSON.stringify(q.answer)} is not a ratio of two to four whole numbers in lowest terms`).toBe(true);
    for (const e of q.commonErrors) {
      expect(isRatio(e.value) && e.value.length === q.answer.length, `${at}: common error ${JSON.stringify(e.value)} is not a ratio of as many terms, in lowest terms`).toBe(true);
    }
  } else {
    expect(Number.isSafeInteger(q.answer) && q.answer > 0, `${at}: answer ${q.answer}`).toBe(true);
    for (const e of q.commonErrors) expect(Number.isSafeInteger(e.value) && e.value > 0, `${at}: common error ${e.value}`).toBe(true);
  }
  const logic = EXERCISE_LOGIC.numeric;
  const typed = readNumeric(q, typedNumeric(q.answer, q.unit));
  expect(typed, `${at}: the answer cannot be typed`).toEqual(q.answer);
  expect(logic.check(q, { type: 'numeric', value: typed! }).correct, `${at}: its own answer is not marked right`).toBe(true);
  for (const e of q.commonErrors) {
    const wrong = readNumeric(q, typedNumeric(e.value, q.unit));
    expect(wrong, `${at}: a common error cannot be typed`).toEqual(e.value);
    const result = logic.check(q, { type: 'numeric', value: wrong! });
    expect(result.correct, `${at}: a common error is marked right`).toBe(false);
    expect(logic.describeWrong(q, result.mistakeCode!), `${at}: a common error is not told as its mistake`).toBe(e.why);
  }
}

// A set: every entry is checked as a single direct entry is, and the set as a whole must read as one journal.
export function checkJournalSet(
  q: JournalSetQuestion,
  at: string,
  rule: {
    /** The fewest and the most transactions the set may have, and what such a set is called in the failure. */
    entries: readonly [number, number];
    what: string;
    /** True for a set of a case study, which may leave its opening line to the case text. */
    openingOptional?: boolean;
  },
) {
  const [fewest, most] = rule.entries;
  expect(q.entries.length, `${at}: ${rule.what} has ${fewest} to ${most} transactions`).toBeGreaterThanOrEqual(fewest);
  expect(q.entries.length, `${at}: ${rule.what} has ${fewest} to ${most} transactions`).toBeLessThanOrEqual(most);
  // The prompt is the task (the usual one, or the set's own) and then the opening line.
  const [task, ...opening] = q.prompt.split('\n');
  expect(task.trim().length, `${at}: no task`).toBeGreaterThan(10);
  if (!(rule.openingOptional && opening.length === 0)) expect(opening.join(' ').trim().length, `${at}: no opening line`).toBeGreaterThan(20);
  let before = -Infinity;
  for (const [i, entry] of q.entries.entries()) {
    const here = `${at} transaction ${i + 1}`;
    expect(isBalanced(entry.expected), here).toBe(true);
    for (const line of entry.expected) {
      expect(Number.isInteger(line.amount) && line.amount > 0, here).toBe(true);
      // Whole rupees: nobody is asked to type paise.
      expect(line.amount % 100, `${here}: ${line.accountId} is not in whole rupees`).toBe(0);
      expect(() => resolveAccount(line.accountId), here).not.toThrow();
      expect(q.accountChoices, here).toContain(line.accountId);
    }
    expect(compareJournal(entry.expected, entry.expected).correct, here).toBe(true);
    expect(entry.text.trim().length, `${here}: no text`).toBeGreaterThan(10);
    expect(entry.explanation.length, `${here}: no explanation`).toBeGreaterThanOrEqual(1);
    // A dated transaction or a labelled item, never both. Only real dates are kept in order.
    expect((entry.date === undefined) !== (entry.label === undefined), `${here}: needs a date or a label, and only one`).toBe(true);
    if (entry.date !== undefined) {
      const order = setDateOrder(entry.date);
      expect(order, `${here}: "${entry.date}" is not a date`).not.toBeNull();
      expect(order!, `${here}: the dates are not in order`).toBeGreaterThanOrEqual(before);
      before = order!;
    } else {
      expect(entry.label!.trim().length, `${here}: empty label`).toBeGreaterThan(0);
    }
  }
  const texts = q.entries.map((e) => e.text);
  expect(new Set(texts).size, `${at}: two transactions have the same text`).toBe(texts.length);
  // The picker shows names: no two choices may look alike (a party that is both a debtor and a creditor would).
  const names = q.accountChoices.map((id) => resolveAccount(id).name);
  expect(new Set(names).size, `${at}: two account choices have the same name`).toBe(names.length);
}

// A format: every list of its rows can be entered and matched, the labels are on offer, the totals agree where they
// must, the task and the data are there, and the answer made of its own rows is marked wholly right.
export function checkFormat(q: AccountQuestion | StatementQuestion, at: string) {
  const n = q.columns.length;
  expect(n >= 1 && n <= (q.type === 'account' ? MAX_FORMAT_COLUMNS : MAX_STATEMENT_COLUMNS), `${at}: ${n} amount columns`).toBe(true);
  expect(q.title.trim().length, `${at}: no title`).toBeGreaterThan(3);
  expect(q.data.trim().length, `${at}: no data to work from`).toBeGreaterThan(20);
  expect(q.data, `${at}: bad text in the data`).not.toMatch(/undefined|NaN/);
  // The prompt is the task alone, one line: the data has a panel of its own.
  expect(q.prompt, `${at}: the task is one line`).not.toContain('\n');
  expect(q.working.length, `${at}: no working`).toBeGreaterThanOrEqual(1);
  const rows: FormatRow[] = formatLists(q).flat();
  expect(rows.length, `${at}: ${rows.length} rows`).toBeGreaterThanOrEqual(MIN_FORMAT_ROWS);
  expect(rows.length, `${at}: ${rows.length} rows`).toBeLessThanOrEqual(MAX_FORMAT_ROWS);
  // The kinds of the columns, where a statement declares them: a figure is then in the unit of its column, and
  // negative only where the column takes it. Every other column holds whole rupees that are never negative.
  const kinds = q.type === 'statement' ? q.columnKinds : undefined;
  if (kinds) expect(kinds, `${at}: a kind for every amount column`).toHaveLength(n);
  const figureOk = (a: number, c: number): boolean => {
    const kind = kindOf(kinds, c);
    return isPlainColumn(kind) ? Number.isSafeInteger(a) && a >= 0 && a % 100 === 0 : figureProblem(a, kind) === null;
  };
  for (const row of rows) {
    const here = `${at} row "${row.label}"`;
    for (const label of acceptedLabels(row)) expect(q.labels, `${here}: "${label}" is not on offer`).toContain(label);
    expect(row.amounts, `${here}: one amount for each column`).toHaveLength(n);
    for (const [c, a] of row.amounts.entries()) expect(figureOk(a, c), `${here}: ${a} cannot stand in the column ${q.columns[c]}`).toBe(true);
    expect(row.amounts.some((a) => a !== 0), `${here}: no amount`).toBe(true);
  }
  for (const list of formatLists(q)) {
    // Under every wording a row is right under: another wording may not be what makes two rows alike.
    const keys = list.flatMap((r) => [...new Set(acceptedLabels(r))].map((label) => `${label}|${r.amounts.join('|')}`));
    expect(new Set(keys).size, `${at}: two rows of one list cannot be told apart`).toBe(keys.length);
  }
  expect(new Set(q.labels).size, `${at}: a label is offered twice`).toBe(q.labels.length);
  expect(q.labels.length - new Set(rows.flatMap(acceptedLabels)).size, `${at}: needs at least two labels no row uses`).toBeGreaterThanOrEqual(2);
  if (q.type === 'account') {
    expect(q.sides[0].title, `${at}: the sides need different titles`).not.toBe(q.sides[1].title);
    // Period by period (an account usually has one): rows on both sides, and the two sides agreeing.
    const periods = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
    expect(periods.length, `${at}: ${periods.length} periods`).toBeLessThanOrEqual(MAX_ACCOUNT_PERIODS);
    if (q.later) expect(rows.length, `${at}: ${rows.length} rows over several periods`).toBeLessThanOrEqual(MAX_PERIODS_ROWS);
    expect(q.periodTitles?.length, `${at}: a title for every period`).toBe(q.later ? periods.length : undefined);
    for (const [left, right] of periods) {
      expect(Math.min(left.length, right.length), `${at}: a side of a period has no rows`).toBeGreaterThanOrEqual(1);
      expect(columnTotals(left, n), `${at}: the two sides do not agree`).toEqual(columnTotals(right, n));
    }
  } else {
    const totals = columnTotals(q.rows, n);
    if (q.totalsAgree) expect(totals[0], `${at}: the two columns do not agree`).toBe(totals[1]);
    const subtotals = subtotalsOf(q);
    const plain = !kinds && subtotals.length === 0;
    if (q.final) expect(q.final.amount !== 0 && figureOk(q.final.amount, 0), `${at}: the final figure`).toBe(true);
    if (q.final && n === 2 && plain) expect(q.final.amount, `${at}: the final figure is not the difference of the columns`).toBe(Math.abs(totals[0] - totals[1]));
    if (q.totalsAgree) expect(n === 2 && plain, `${at}: only two plain columns, with no sub-total, can agree`).toBe(true);
    // A statement in parts: its sub-headings and sub-totals stand in order between its rows, and every sub-total has
    // a name and a figure the column can hold, one at least.
    const lines = q.lines ?? [];
    expect(lines.map((line) => line.at), `${at}: the lines of a statement stand in order`).toEqual([...lines.map((line) => line.at)].sort((a, b) => a - b));
    for (const line of lines) {
      expect(Number.isInteger(line.at) && line.at >= 0 && line.at <= q.rows.length, `${at}: a line stands outside the rows`).toBe(true);
      expect(('heading' in line ? line.heading : line.subtotal).trim().length, `${at}: a line with no words`).toBeGreaterThan(0);
    }
    for (const line of subtotals) {
      expect(line.amounts, `${at}: sub-total "${line.subtotal}" has a figure for each column`).toHaveLength(n);
      for (const [c, a] of line.amounts.entries()) expect(figureOk(a, c), `${at}: sub-total "${line.subtotal}": ${a} cannot stand in the column ${q.columns[c]}`).toBe(true);
      expect(line.amounts.some((a) => a !== 0), `${at}: sub-total "${line.subtotal}" has no figure`).toBe(true);
    }
    if (rows.some((r) => r.note !== undefined) || subtotals.some((line) => line.note !== undefined)) expect(q.noteHeading?.trim().length ?? 0, `${at}: note numbers need a heading`).toBeGreaterThan(0);
    if (q.final?.options) {
      expect(q.final.options, `${at}: the right name of the final figure is not among those on offer`).toContain(q.final.label);
      expect(new Set(q.final.options).size, `${at}: the final figure needs another name to choose from`).toBeGreaterThanOrEqual(2);
    }
    // The figures it prints: only where it gives a column, the same under one name, and not all there is.
    expect(givenProblem(q.givenColumns, n, q.rows, subtotals), `${at}: the figures it gives`).toBeNull();
  }
  // Its own rows, entered as the answer, are every row right.
  const logic = q.type === 'account' ? EXERCISE_LOGIC.account.check(q, rightFormat(q) as never) : EXERCISE_LOGIC.statement.check(q, rightFormat(q) as never);
  expect(logic.correct, `${at}: its own rows are not marked right`).toBe(true);
  expect(logic.parts, at).toEqual({ right: expectedRows(q).length, total: expectedRows(q).length });
  // Where a statement prints figures, so is what a student types of it: the figures it does not print, and no other.
  if (q.type === 'statement' && q.givenColumns) {
    const typed = draftResponse(q, rightFormatDraft(q));
    expect(typed !== null && EXERCISE_LOGIC.statement.check(q, typed as never).correct, `${at}: its typed figures are not marked right`).toBe(true);
  }
}
