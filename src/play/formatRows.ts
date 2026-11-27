import type { AccountQuestion, StatementQuestion } from '@/content/types';
import { kindOf, parseFigure, type ColumnKind, type EnteredRow } from '@/engine/formats';
import {
  accountLists,
  formatLists,
  periodCount,
  periodTitle,
  printedOf,
  statementCuts,
  subtotalPrints,
  subtotalsOf,
  type AccountList,
  type FormatQuestion,
  type PrintedOf,
  type Response,
} from '@/exercises/logic';

// A format as it is filled in: the rows of a list as typed (the particulars chosen, the text of every amount), and
// everything the screens of an account and a statement decide without drawing anything.

/** A row as its inputs hold it: the label chosen ('' until one is) and what is typed in each amount column. */
export interface FormatRowDraft {
  label: string;
  amounts: string[];
}

/**
 * An account as it is filled in: the rows of the left and the right side, and the rows below the totals of each.
 * `later` holds the two sides of every period after the first of an account kept over several (none otherwise).
 */
export interface AccountDraftRows {
  sides: [FormatRowDraft[], FormatRowDraft[]];
  below: [FormatRowDraft[], FormatRowDraft[]];
  later?: [FormatRowDraft[], FormatRowDraft[]][];
}

/** A list of rows starts with this many empty ones, and holds this many at most. */
export const START_ROWS = 2;
export const MAX_LIST_ROWS = 20;

export const emptyFormatRow = (columns: number): FormatRowDraft => ({ label: '', amounts: Array.from({ length: columns }, () => '') });

export const isBlankFormatRow = (r: FormatRowDraft): boolean => r.label === '' && r.amounts.every((a) => a.trim() === '');

/** A stored list of rows as rows of this many columns (an amount too many is dropped, one missing is blank). */
const fitRows = (rows: readonly FormatRowDraft[] | undefined, columns: number): FormatRowDraft[] =>
  (rows ?? []).map((r) => ({ label: r.label, amounts: Array.from({ length: columns }, (_, c) => r.amounts[c] ?? '') }));

/** The rows a list starts from: what was entered before (a mock paper's draft), or `empty` blank rows. */
export function startList(draft: readonly FormatRowDraft[] | undefined, columns: number, empty = START_ROWS): FormatRowDraft[] {
  const rows = fitRows(draft, columns);
  return rows.length > 0 ? rows : Array.from({ length: empty }, () => emptyFormatRow(columns));
}

/**
 * The rows an account starts from: two empty rows on each side of every period and none below the totals, or what
 * was entered before. `periods` is how many periods the account is kept over.
 */
export function startAccount(draft: Partial<AccountDraftRows> | undefined, columns: number, periods = 1): AccountDraftRows {
  return {
    sides: [startList(draft?.sides?.[0], columns), startList(draft?.sides?.[1], columns)],
    below: [fitRows(draft?.below?.[0], columns), fitRows(draft?.below?.[1], columns)],
    later: Array.from({ length: periods - 1 }, (_, i) => [startList(draft?.later?.[i]?.[0], columns), startList(draft?.later?.[i]?.[1], columns)]),
  };
}

/** The rows of one list of an account as it is filled in (see `accountLists`). */
export function draftList(draft: AccountDraftRows, list: AccountList): FormatRowDraft[] {
  if (list.below) return draft.below[list.side];
  return list.period ? (draft.later?.[list.period - 1]?.[list.side] ?? []) : draft.sides[list.side];
}

/** The account with the rows of one list replaced. */
export function withDraftList(draft: AccountDraftRows, list: AccountList, rows: FormatRowDraft[]): AccountDraftRows {
  const pair = (was: [FormatRowDraft[], FormatRowDraft[]]): [FormatRowDraft[], FormatRowDraft[]] => (list.side === 0 ? [rows, was[1]] : [was[0], rows]);
  if (list.below) return { ...draft, below: pair(draft.below) };
  if (!list.period) return { ...draft, sides: pair(draft.sides) };
  return { ...draft, later: (draft.later ?? []).map((was, i) => (i === list.period! - 1 ? pair(was) : was)) };
}

/** What a row prints as it stands: the printed figures of the particulars chosen, or nothing while none is chosen. */
const printedIn = (row: FormatRowDraft, printed: PrintedOf | undefined) => (row.label === '' ? undefined : printed?.(row.label));

/** A row with nothing in the cells that print a figure: what is typed there, if anything was, is not the student's. */
export function withoutPrinted(row: FormatRowDraft, printed: PrintedOf | undefined): FormatRowDraft {
  const figures = printedIn(row, printed);
  return figures ? { label: row.label, amounts: row.amounts.map((a, c) => (figures[c] == null ? a : '')) } : row;
}

/**
 * The total of each amount column over the rows whose amount there can be read, in the unit of the column (paise,
 * unless a statement declares the kinds of its columns). A figure the statement prints (`printed`) counts as it is
 * printed.
 */
export function runningTotals(rows: readonly FormatRowDraft[], columns: number, kinds?: readonly ColumnKind[], printed?: PrintedOf): number[] {
  return Array.from({ length: columns }, (_, c) => rows.reduce((sum, r) => sum + (printedIn(r, printed)?.[c] ?? parseFigure(r.amounts[c] ?? '', kindOf(kinds, c)) ?? 0), 0));
}

/**
 * How the two totals of each amount column stand: `empty` while neither has anything, `agree` when they are equal,
 * `differ` otherwise. It is arithmetic only: it never says what the difference is, nor whether a row is right.
 */
export type Agreement = 'empty' | 'agree' | 'differ';
export const agreement = (a: readonly number[], b: readonly number[]): Agreement[] =>
  a.map((x, c) => (x === 0 && b[c] === 0 ? 'empty' : x === b[c] ? 'agree' : 'differ'));

/** True when something is entered and every column that has anything agrees: the totals are ruled off, as on paper. */
export const ruledOff = (states: readonly Agreement[]): boolean => states.some((s) => s === 'agree') && states.every((s) => s !== 'differ');

export interface ListRead {
  /** The rows that can be read, in their order. Blank rows are skipped. */
  rows: EnteredRow[];
  /** For every row read, the row of the list it came from. */
  rowIndex: number[];
  /** The rows that are begun but cannot be read, each with what is wrong: "row 3: choose the particulars." */
  problems: string[];
}

/**
 * A list of rows read as an answer. A row needs its particulars and an amount, and no amount that is not one.
 * `kinds` are the kinds of the columns, where a statement declares them: every figure is read in the unit of its
 * column, and a negative one only where the column takes it. `printed` are the figures a statement prints: a row
 * holds them as they are printed, whatever stands in their cells, and is read as soon as its particulars are chosen
 * (a typed figure left blank is nil, so nothing here can say whether one is still to be typed).
 */
export function readList(rows: readonly FormatRowDraft[], kinds?: readonly ColumnKind[], printed?: PrintedOf): ListRead {
  const out: ListRead = { rows: [], rowIndex: [], problems: [] };
  rows.forEach((r, i) => {
    if (isBlankFormatRow(r)) return;
    const at = `row ${i + 1}`;
    const figures = printedIn(r, printed);
    const typed = r.amounts.map((a, c) => (figures?.[c] == null ? a.trim() : ''));
    const amounts = typed.map((a, c) => figures?.[c] ?? (a === '' ? 0 : parseFigure(a, kindOf(kinds, c))));
    if (r.label === '') out.problems.push(`${at}: choose the particulars.`);
    else if (!figures && typed.every((a) => a === '')) out.problems.push(`${at}: enter an amount.`);
    else if (amounts.some((a) => a === null)) out.problems.push(`${at}: enter a valid amount.`);
    else {
      out.rows.push({ label: r.label, amounts: amounts as number[] });
      out.rowIndex.push(i);
    }
  });
  return out;
}

/**
 * What a list of an account is called where a problem is told: "Dr side", "Cr side, below the totals". In an account
 * kept over several periods the period is named too: "Dr side, Year ended 31 March 2026".
 */
export function listName(q: AccountQuestion, side: 0 | 1, below: boolean, period = 0): string {
  const where = below ? ', below the totals' : periodCount(q) > 1 ? `, ${periodTitle(q, period)}` : '';
  return `${q.sides[side].title} side${where}`;
}

const sentence = (where: string, problem: string) => `${where}, ${problem}`;

export interface FormatRead<R extends Response> {
  /** The answer as far as it can be read: rows that cannot be read are left out. */
  response: R;
  /** For every list of the format (see `formatLists`), the row of the list each row read came from. */
  rowIndex: number[][];
  /** What cannot be read, in words, the first problem first. */
  problems: string[];
  /** True when nothing at all is entered. */
  empty: boolean;
}

/** An account as it stands, read as an answer. */
export function readAccount(q: AccountQuestion, draft: AccountDraftRows): FormatRead<Extract<Response, { type: 'account' }>> {
  // In the order of `formatLists`: the two sides of every period, then the rows below the totals of each side.
  const lists = accountLists(q);
  const rows = lists.map((l) => draftList(draft, l));
  const read = rows.map((list) => readList(list));
  const last = read.length - 2;
  const later = Array.from({ length: periodCount(q) - 1 }, (_, i): [EnteredRow[], EnteredRow[]] => [read[2 + 2 * i].rows, read[3 + 2 * i].rows]);
  return {
    response: { type: 'account', sides: [read[0].rows, read[1].rows], below: [read[last].rows, read[last + 1].rows], ...(later.length > 0 ? { later } : {}) },
    rowIndex: read.map((r) => r.rowIndex),
    problems: read.flatMap((r, i) => r.problems.map((p) => sentence(listName(q, lists[i].side, lists[i].below === true, lists[i].period), p))),
    empty: rows.every((list) => list.every(isBlankFormatRow)),
  };
}

export const FINAL_PROBLEM = 'enter a valid amount.';

/** What the final figure of a statement is called where its name is left to the student and none is chosen yet. */
export const FINAL_FIGURE = 'The final figure';

/** What a list of a statement in parts is called where a problem is told: the sub-heading it stands under, or its place. */
export function statementListName(q: StatementQuestion, list: number): string {
  const from = statementCuts(q)[list] ?? 0;
  const heading = (q.lines ?? []).findLast((line) => 'heading' in line && line.at <= from);
  return heading && 'heading' in heading ? heading.heading : `Part ${list + 1}`;
}

/** A statement as it is filled in: the rows of every list, what is typed for every sub-total, and its final figure. */
export interface StatementDraftRows {
  /** The rows of the first list (the only one, unless the statement is in parts). */
  rows: FormatRowDraft[];
  /** The rows of every list after the first. */
  more: FormatRowDraft[][];
  /** What is typed in every column of every sub-total. */
  subtotals: string[][];
  final: string;
  finalLabel: string;
}

/** A statement starts with this many empty rows where it is one long list, and with this many in each list where it is in parts. */
export const STATEMENT_START_ROWS = 3;
export const STATEMENT_PART_START_ROWS = 1;

/**
 * The rows a statement starts from: empty ones in every list, or what was entered before (a mock paper's draft). A
 * cell that prints a figure starts with nothing typed in it, whatever the draft holds there.
 */
export function startStatement(q: StatementQuestion, draft?: Partial<StatementDraftRows>): StatementDraftRows {
  const n = q.columns.length;
  const lists = statementCuts(q).length;
  const empty = lists > 1 ? STATEMENT_PART_START_ROWS : STATEMENT_START_ROWS;
  const printed = printedOf(q);
  const start = (list: readonly FormatRowDraft[] | undefined) => startList(list, n, empty).map((row) => withoutPrinted(row, printed));
  return {
    rows: start(draft?.rows),
    more: Array.from({ length: lists - 1 }, (_, k) => start(draft?.more?.[k])),
    subtotals: subtotalsOf(q).map((line, i) => subtotalPrints(q, line).map((figure, c) => (figure === null ? (draft?.subtotals?.[i]?.[c] ?? '') : ''))),
    final: draft?.final ?? '',
    finalLabel: draft?.finalLabel ?? '',
  };
}

/** The rows of every list of a statement as it is filled in, in the order of `formatLists`. */
export const statementDraftLists = (draft: Pick<StatementDraftRows, 'rows' | 'more'>): FormatRowDraft[][] => [draft.rows, ...draft.more];

/**
 * A statement as it stands, read as an answer. The final figure is null when nothing is typed, or what is typed is
 * no amount. `finalLabel` is what the student called it, where the statement leaves that to be chosen ('' until it
 * is): a final figure that is begun needs both its name and its amount. Of a statement in parts, `more` are the rows
 * of every list after the first and `subtotals` what is typed for every sub-total: one that is begun is read whole
 * (a column left empty is nil), and one with a figure that cannot be read is a problem and is not marked. Where the
 * statement prints figures, a row and a sub-total hold them as printed and only the other columns are read.
 */
export function readStatement(
  q: StatementQuestion,
  rows: readonly FormatRowDraft[],
  final: string,
  finalLabel = '',
  more: readonly (readonly FormatRowDraft[])[] = [],
  subtotals: readonly (readonly string[])[] = [],
): FormatRead<Extract<Response, { type: 'statement' }>> {
  const kinds = q.columnKinds;
  const lists = statementCuts(q).length;
  const inParts = lists > 1;
  const drafts = Array.from({ length: lists }, (_, k) => (k === 0 ? rows : (more[k - 1] ?? [])));
  const printed = printedOf(q);
  const reads = drafts.map((list) => readList(list, kinds, printed));
  const read = reads[0];
  // A row that cannot be read is told with the part it is in, where the statement has parts.
  const rowProblems = reads.flatMap((r, k) => r.problems.map((p) => (inParts ? `${statementListName(q, k)}, ${p}` : `${p.charAt(0).toUpperCase()}${p.slice(1)}`)));
  const lines = subtotalsOf(q);
  const subProblems: string[] = [];
  const subRead = lines.map((line, i): number[] | null => {
    // Only what is typed begins a sub-total: one with nothing typed is left out, whatever it prints.
    const prints = subtotalPrints(q, line);
    const typedAll = prints.map((figure, c) => (figure === null ? (subtotals[i]?.[c] ?? '').trim() : ''));
    if (typedAll.every((t) => t === '')) return null;
    const figures = typedAll.map((t, c) => prints[c] ?? (t === '' ? 0 : parseFigure(t, kindOf(kinds, c))));
    if (figures.some((f) => f === null)) {
      subProblems.push(`${line.subtotal}: ${FINAL_PROBLEM}`);
      return null;
    }
    return figures as number[];
  });
  const typed = final.trim();
  const amount = q.final && typed !== '' ? parseFigure(typed, kindOf(kinds, 0)) : null;
  const choose = q.final?.options !== undefined;
  const chosen = choose && q.final!.options!.includes(finalLabel) ? finalLabel : '';
  const name = choose ? chosen || FINAL_FIGURE : (q.final?.label ?? '');
  const finalProblem = !q.final
    ? []
    : typed !== '' && amount === null
      ? [`${name}: ${FINAL_PROBLEM}`]
      : choose && typed !== '' && chosen === ''
        ? [`${FINAL_FIGURE}: choose what it is.`]
        : chosen !== '' && typed === ''
          ? [`${name}: enter an amount.`]
          : [];
  return {
    response: {
      type: 'statement',
      rows: read.rows,
      final: amount,
      ...(chosen !== '' ? { finalLabel: chosen } : {}),
      ...(inParts ? { more: reads.slice(1).map((r) => r.rows) } : {}),
      ...(lines.length > 0 ? { subtotals: subRead } : {}),
    },
    rowIndex: reads.map((r) => r.rowIndex),
    problems: [...rowProblems, ...subProblems, ...finalProblem],
    empty: drafts.every((list) => list.every(isBlankFormatRow)) && typed === '' && chosen === '' && subtotals.every((s) => s.every((t) => t.trim() === '')),
  };
}

/**
 * What pressing Check does to a format as it stands: `problem` (a row that cannot be read: nothing is checked),
 * `confirm` (the totals do not agree where they must and the student has not been told yet: say so and check on the
 * next press), or `submit` with the answer.
 */
export function checkFormat<R extends Response>(read: FormatRead<R>, disagreement: string | null, warned: boolean): { problem: string } | { confirm: string } | { submit: R; rowIndex: number[][] } {
  if (read.empty) return { problem: 'Enter at least one row.' };
  if (read.problems.length > 0) return { problem: read.problems[0] };
  if (disagreement && !warned) return { confirm: `${disagreement} Press Check again to check it as it is.` };
  return { submit: read.response, rowIndex: read.rowIndex };
}

/**
 * True when a row was entered under another wording than the one the correct format shows (a row may be right under
 * several: see `also` of a row). `lists` are the rows as entered, list by list, in the order of `formatLists`. The
 * review of an answer that is wholly right then shows the student's own rows too, ticked, under the names they chose.
 */
export function usesOtherWording(question: FormatQuestion, lists: readonly (readonly FormatRowDraft[])[]): boolean {
  const expected = formatLists(question);
  return lists.some((rows, k) => rows.some((row) => row.label !== '' && !expected[k]?.some((want) => want.label === row.label)));
}

/** How the totals of one period of an account stand, column by column. */
export function periodAgreement(q: AccountQuestion, draft: AccountDraftRows, period: number): Agreement[] {
  const n = q.columns.length;
  const side = (s: 0 | 1) => runningTotals(draftList(draft, { side: s, period }), n);
  return agreement(side(0), side(1));
}

/** For the totals of an account: what to say while they do not agree (in any period), or null when nothing needs saying. */
export function accountDisagreement(q: AccountQuestion, draft: AccountDraftRows): string | null {
  const periods = periodCount(q);
  const off = Array.from({ length: periods }, (_, p) => p).find((p) => periodAgreement(q, draft, p).includes('differ'));
  if (off === undefined) return null;
  return periods > 1 ? `${periodTitle(q, off)}: the two sides do not agree yet.` : 'The two sides do not agree yet.';
}

/** For a statement whose two columns must agree: what to say while they do not, or null. */
export function statementDisagreement(q: StatementQuestion, rows: readonly FormatRowDraft[]): string | null {
  if (!q.totalsAgree) return null;
  const totals = runningTotals(rows, q.columns.length, q.columnKinds, printedOf(q));
  return totals[0] !== totals[1] ? 'The two columns do not agree yet.' : null;
}
