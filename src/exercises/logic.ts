import type {
  AccountQuestion,
  FormatRow,
  JournalQuestion,
  JournalSetQuestion,
  McqQuestion,
  Question,
  SetEntry,
  StatementLine,
  StatementQuestion,
  TrueFalseQuestion,
} from '@/content/types';
import { compareJournal, type JournalComparison } from '@/engine/compare';
import { compareFormat, printedByLabel, printedFigures, sameAmounts, type EnteredRow, type FormatComparison, type RowVerdict } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import type { NumericValue, TypedQuestion } from '@/content/types';
import { FORMAT_CODE, ROW_RIGHT_LETTER, SET_CODE, SET_ENTRY_EMPTY, SET_ENTRY_RIGHT, rowsCounted } from './codes';
import { formatNumeric, numericKey, typedNumeric } from './numeric';

export { SET_ENTRY_EMPTY, SET_ENTRY_RIGHT, partsOfCode, rowsCounted } from './codes';

export type Response =
  | { type: 'mcq'; optionId: string }
  | { type: 'true_false'; value: boolean }
  | { type: 'journal_entry'; lines: JournalLine[] }
  /** One list of lines for every transaction of the set, in its order; an entry left out is an empty list. */
  | { type: 'journal_set'; entries: JournalLine[][] }
  /**
   * The rows of the left and of the right side, and the rows entered below the totals of each. For an account kept
   * over several periods, `later` holds the two sides of every period after the first.
   */
  | { type: 'account'; sides: [EnteredRow[], EnteredRow[]]; below: [EnteredRow[], EnteredRow[]]; later?: [EnteredRow[], EnteredRow[]][] }
  /**
   * The rows of the statement, and the final figure in paise (null when none was typed or the statement has none).
   * `finalLabel` is what the student called the final figure, where the statement leaves that to be chosen. Of a
   * statement in parts (see `statementLists`): `rows` are those of its first list and `more` those of every list
   * after it, and `subtotals` hold what was typed for each sub-total, a figure for every column (null for a
   * sub-total left empty). Where the statement prints a figure (see `printedOf`), the row or sub-total holds it as
   * it stood there: a figure for every column, as in any statement.
   */
  | { type: 'statement'; rows: EnteredRow[]; final: number | null; finalLabel?: string; more?: EnteredRow[][]; subtotals?: (number[] | null)[] }
  /** The figure in the question's unit (see `NumericUnit`); for a ratio its terms in lowest terms, in the order typed. */
  | { type: 'numeric'; value: NumericValue };

/** The answer to a long question: a set of entries, an account or a statement. */
export type LongResponse = Extract<Response, { type: 'journal_set' | 'account' | 'statement' }>;
const LONG_TYPES: readonly Response['type'][] = ['journal_set', 'account', 'statement'];

/**
 * What an attempt keeps of the answer it marks, so that the Mistakes screen can show what the student wrote: the
 * answer to a long question that was not right, as it was checked. Nothing for a right answer, and nothing for a
 * short question, whose mistake code already says what was answered: stored attempts stay small.
 */
export const answerToKeep = (response: Response, result: Pick<CheckResult, 'correct'>): LongResponse | undefined =>
  !result.correct && LONG_TYPES.includes(response.type) ? (response as LongResponse) : undefined;

export interface CheckResult {
  correct: boolean;
  /**
   * What went wrong, as a code the question type can put into words (see `describeWrong`). It is stored with the
   * attempt, so the Mistakes screen can say it later.
   */
  mistakeCode?: string;
  journal?: JournalComparison;
  /**
   * For an answer that is marked part by part (the entries of a set, the rows of a format): how many parts were
   * right. The answer as a whole is `correct` only when all of them are; a mock paper shares the marks of the
   * question by this. For a format `right` is the rows that count: those that are right less one for every extra row.
   */
  parts?: { right: number; total: number };
  /** For a set of entries: what the check found for each entry, in the order of the set. */
  set?: JournalComparison[];
  /**
   * For a format: what the check found for every list of rows, in the order of `formatLists` (the two sides of an
   * account, then the rows below the totals of each; the rows of a statement), for each sub-total of a statement in
   * parts, and for the final figure of a statement.
   */
  format?: FormatComparison & { final?: RowVerdict; subtotals?: RowVerdict[] };
}

/** The mistake codes a journal entry check can report, in words. The feedback panel and the Mistakes screen share these. */
export const MISTAKE_TEXT: Record<string, string> = {
  sidesReversed: 'The debit and credit sides are swapped.',
  wrongAccount: 'One of the accounts is not the right one.',
  wrongAmount: 'An amount is not right.',
  gstOmitted: 'GST has been left out.',
  missingLine: 'A line is missing.',
  extraLine: 'There is a line that should not be there.',
};

export const NOT_RIGHT_AMOUNT = "That's not the right amount.";
export const NOT_RIGHT_RATIO = "That's not the right ratio.";
export const NOT_RIGHT_NUMBER = "That's not the right number.";
const OPTION_CODE = 'option:';
const COMMON_ERROR_CODE = 'common:';
const OTHER_AMOUNT_CODE = 'amount';

/**
 * What a stored mistake code says about each entry of a set, in order (`SET_ENTRY_RIGHT`, `SET_ENTRY_EMPTY` or a
 * journal mistake code), or null when it is not the code of a set of this many entries.
 */
export function readSetCode(code: string | undefined, entries: number): string[] | null {
  if (!code?.startsWith(SET_CODE)) return null;
  const each = code.slice(SET_CODE.length).split(',');
  return each.length === entries ? each : null;
}

/** What heads an item of a set wherever it is shown: its date, or the label of an item that has no date. */
export const setEntryHeading = (entry: Pick<SetEntry, 'date' | 'label'>): string => entry.date ?? entry.label ?? '';

/** "4 of 5 entries right": the first thing feedback says about a set. */
export const setScoreText = (right: number, total: number): string => `${right} of ${total} entries right`;

/** The non-visual half of an exercise type. The registry in `registry.tsx` adds the screens to it. */
export interface ExerciseLogic<Q extends Question, R extends Response> {
  /** Marks a response. Wrong answers carry a `mistakeCode` when the type can say what went wrong. */
  check(q: Q, r: R): CheckResult;
  /** The right answer in words, for "Right answer: ..."; null when the solution is shown some other way. */
  correctAnswer(q: Q): string | null;
  /** A mistake code from `check`, in words; undefined when the code is not one this type knows. */
  describeWrong(q: Q, code: string): string | undefined;
  /** What the end-to-end tests need to answer this question correctly; it must survive JSON.stringify. */
  e2eExpected(q: Q): unknown;
  /**
   * For a question answered in several parts that share its marks (the entries of a set, the rows of a format): how
   * many parts, and what they are called ("entries", "rows"). Left out by a question that is one answer.
   */
  parts?(q: Q): { count: number; name: string };
}

const mcq: ExerciseLogic<McqQuestion, Extract<Response, { type: 'mcq' }>> = {
  check(q, r) {
    if (r.optionId === q.correct) return { correct: true };
    // Only a wrong option that names its mistake gets a code; the others stay a plain wrong choice.
    const why = q.options.find((o) => o.id === r.optionId)?.why;
    return why ? { correct: false, mistakeCode: OPTION_CODE + r.optionId } : { correct: false };
  },
  correctAnswer: (q) => q.options.find((o) => o.id === q.correct)?.text ?? null,
  describeWrong(q, code) {
    return code.startsWith(OPTION_CODE) ? q.options.find((o) => o.id === code.slice(OPTION_CODE.length))?.why : undefined;
  },
  e2eExpected: (q) => q.correct,
};

const trueFalse: ExerciseLogic<TrueFalseQuestion, Extract<Response, { type: 'true_false' }>> = {
  check: (q, r) => ({ correct: r.value === q.correct }),
  correctAnswer: (q) => (q.correct ? 'True' : 'False'),
  describeWrong: () => undefined,
  e2eExpected: (q) => q.correct,
};

const journal: ExerciseLogic<JournalQuestion, Extract<Response, { type: 'journal_entry' }>> = {
  check(q, r) {
    const result = compareJournal(q.expected, r.lines);
    return result.correct ? { correct: true, journal: result } : { correct: false, mistakeCode: result.mistake, journal: result };
  },
  correctAnswer: () => null,
  describeWrong: (_q, code) => (Object.hasOwn(MISTAKE_TEXT, code) ? MISTAKE_TEXT[code] : undefined),
  e2eExpected: (q) => ({ lines: q.expected }),
};

const journalSet: ExerciseLogic<JournalSetQuestion, Extract<Response, { type: 'journal_set' }>> = {
  // Every entry is compared as a single entry is. The set is right only when every entry is.
  check(q, r) {
    const set = q.entries.map((e, i) => compareJournal(e.expected, r.entries[i] ?? []));
    const parts = { right: set.filter((c) => c.correct).length, total: set.length };
    if (parts.right === parts.total) return { correct: true, parts, set };
    const codes = set.map((c, i) => (c.correct ? SET_ENTRY_RIGHT : (r.entries[i] ?? []).length === 0 ? SET_ENTRY_EMPTY : c.mistake));
    return { correct: false, mistakeCode: SET_CODE + codes.join(','), parts, set };
  },
  correctAnswer: () => null,
  describeWrong(q, code) {
    const each = readSetCode(code, q.entries.length);
    return each ? `${setScoreText(each.filter((c) => c === SET_ENTRY_RIGHT).length, each.length)}.` : undefined;
  },
  e2eExpected: (q) => ({ entries: q.entries.map((e) => e.expected) }),
  parts: (q) => ({ count: q.entries.length, name: 'entries' }),
};

// ---------------------------------------------------------------------------------------------------------------
// Formats: an account and a statement. Both are marked row by row, and their marks are shared among the rows.
// ---------------------------------------------------------------------------------------------------------------

/** One letter for what became of each expected row, in the order of the format. */
const VERDICT_LETTER: Record<RowVerdict, string> = { ok: ROW_RIGHT_LETTER, missing: 'm', amount: 'a', column: 'c', side: 's', place: 'p', label: 'l' };
const LETTER_VERDICT = new Map(Object.entries(VERDICT_LETTER).map(([verdict, letter]) => [letter, verdict as RowVerdict]));

export type FormatQuestion = AccountQuestion | StatementQuestion;

/** One expected row of a format, and where it stands: a side of an account, above or below its totals. */
export interface ExpectedRow {
  row: FormatRow;
  /** The side of an account the row is on (0 the left, 1 the right); left out for a row of a statement. */
  side?: 0 | 1;
  /** For an account kept over several periods: the period the row is in, from 0. */
  period?: number;
  /** True for a row below the totals (of the last period). */
  below?: true;
  /** True for the final figure of a statement, which is counted as a row. */
  final?: true;
  /** True for a sub-total of a statement in parts, which is counted as a row too. */
  subtotal?: true;
}

/** A sub-total of a statement: a line with a name and a figure for every column, which the student works out. */
export type Subtotal = Extract<StatementLine, { subtotal: string }>;

/** The sub-totals of a statement, in order; none for a statement that is one list of rows. */
export const subtotalsOf = (q: StatementQuestion): Subtotal[] => (q.lines ?? []).filter((line): line is Subtotal => 'subtotal' in line);

/**
 * What a row prints once it has these particulars: for every column the figure the statement prints there, or null
 * where the student types it. Undefined for particulars that print nothing: every figure of the row is then typed.
 */
export type PrintedOf = (label: string) => readonly (number | null)[] | undefined;

/**
 * The figures a statement prints in the columns it gives (`givenColumns`), by the particulars of a row. They follow
 * the particulars wherever the row is entered, so they never say where it belongs. A statement that gives no column
 * prints nothing.
 */
export function printedOf(q: Pick<StatementQuestion, 'rows' | 'givenColumns'>): PrintedOf {
  const byLabel = printedByLabel(q.rows, q.givenColumns);
  return (label) => byLabel.get(label);
}

/** For every column of a sub-total, the figure the statement prints there, or null where the student types it. */
export const subtotalPrints = (q: Pick<StatementQuestion, 'givenColumns'>, line: Subtotal): (number | null)[] =>
  printedFigures(line.amounts, q.givenColumns, line.given === true);

/** The sub-totals that count as rows: every one with a figure to type. One that is printed whole earns nothing. */
const countedSubtotals = (q: StatementQuestion): Subtotal[] => subtotalsOf(q).filter((line) => subtotalPrints(q, line).includes(null));

/**
 * Where the lists of a statement begin: the number of its first row, for every list. A statement is one list unless
 * sub-headings or sub-totals stand between its rows; each of those then starts a new list (several together start one).
 */
export function statementCuts(q: Pick<StatementQuestion, 'rows' | 'lines'>): number[] {
  const inside = (q.lines ?? []).map((line) => line.at).filter((at) => at > 0 && at < q.rows.length);
  return [0, ...new Set(inside)];
}

/** The lists of rows a statement is entered and matched in (see `statementCuts`): one, unless it is in parts. */
export function statementLists(q: Pick<StatementQuestion, 'rows' | 'lines'>): FormatRow[][] {
  const cuts = statementCuts(q);
  return cuts.map((from, k) => q.rows.slice(from, cuts[k + 1] ?? q.rows.length));
}

/** How many periods an account is kept over: one, unless it has later ones. */
export const periodCount = (q: AccountQuestion): number => 1 + (q.later?.length ?? 0);

/** What a period of an account is called. */
export const periodTitle = (q: AccountQuestion, period: number): string => q.periodTitles?.[period] ?? `Period ${period + 1}`;

/** One list of rows of an account: a side of a period, or the rows below the last totals of a side. */
export interface AccountList {
  side: 0 | 1;
  /** The period, from 0; left out for the rows below the totals. */
  period?: number;
  below?: true;
}

/**
 * The lists of an account in the order they are entered, matched and told in a mistake code: the left and the right
 * side of the first period, of each later period, and last the rows below the totals of each side.
 */
export function accountLists(q: AccountQuestion): AccountList[] {
  const periods = Array.from({ length: periodCount(q) }, (_, period) => [{ side: 0, period }, { side: 1, period }] as AccountList[]);
  return [...periods.flat(), { side: 0, below: true }, { side: 1, below: true }];
}

/**
 * The lists of rows a format is entered and matched in: those of an account (see `accountLists`), or those of a
 * statement (one, unless it is in parts: see `statementLists`).
 */
export const formatLists = (q: FormatQuestion): FormatRow[][] =>
  q.type === 'account' ? [q.sides[0].rows, q.sides[1].rows, ...(q.later ?? []).flat(), q.sides[0].below, q.sides[1].below] : statementLists(q);

/**
 * Every expected row of a format in the order a mistake code tells them in: list by list (see `formatLists`), then
 * the sub-totals of a statement in parts (those the student types anything of), and last the final figure of a
 * statement that has one.
 */
export function expectedRows(q: FormatQuestion): ExpectedRow[] {
  if (q.type === 'statement') {
    return [
      ...q.rows.map((row) => ({ row })),
      ...countedSubtotals(q).map((line) => ({ row: { label: line.subtotal, amounts: line.amounts }, subtotal: true as const })),
      ...(q.final ? [{ row: { label: q.final.label, amounts: [q.final.amount] }, final: true as const }] : []),
    ];
  }
  const lists = accountLists(q);
  const several = periodCount(q) > 1;
  return formatLists(q).flatMap((rows, k) =>
    rows.map((row): ExpectedRow => ({ row, side: lists[k].side, ...(several && lists[k].period !== undefined ? { period: lists[k].period } : {}), ...(lists[k].below ? { below: true as const } : {}) })),
  );
}

/** What a stored mistake code says about a format: what became of each expected row, and the labels of the extra rows. */
export interface FormatVerdicts {
  rows: RowVerdict[];
  /** The particulars of the rows that were entered and answer to nothing expected. */
  extras: string[];
}

/** The code of a format that was not right: a letter for each expected row, then the extra rows by their place among the labels. */
function formatCode(q: FormatQuestion, verdicts: RowVerdict[], extras: string[]): string {
  const rows = verdicts.map((v) => VERDICT_LETTER[v]).join('');
  const places = extras.map((label) => q.labels.indexOf(label)).filter((i) => i >= 0);
  return FORMAT_CODE + rows + (places.length > 0 ? `;${places.join('.')}` : '');
}

/** What a stored mistake code says about a format (see `formatCode`), or null when it is not the code of this format. */
export function readFormatCode(q: FormatQuestion, code: string | undefined): FormatVerdicts | null {
  if (!code?.startsWith(FORMAT_CODE)) return null;
  const [letters, places = ''] = code.slice(FORMAT_CODE.length).split(';');
  const rows = [...letters].map((letter) => LETTER_VERDICT.get(letter));
  if (rows.length !== expectedRows(q).length || rows.some((v) => v === undefined)) return null;
  const extras = places === '' ? [] : places.split('.').map((i) => q.labels[Number(i)]);
  return extras.some((label) => label === undefined) ? null : { rows: rows as RowVerdict[], extras };
}

/** "9 of 11 rows right": the first thing feedback says about a format. */
export const formatScoreText = (right: number, total: number): string => `${right} of ${total} rows right`;
/** "1 row should not be there.", or nothing when no extra row was entered. */
export const extraRowsText = (extra: number): string | null =>
  extra <= 0 ? null : extra === 1 ? '1 row should not be there.' : `${extra} rows should not be there.`;


/**
 * The result of a format from the comparison of its rows; `final` is what became of a statement's final figure, and
 * `subtotals` of each sub-total of a statement in parts. `counted` are those of the sub-totals that count as rows
 * (all of them, unless the statement prints one whole).
 */
function formatResult(q: FormatQuestion, cmp: FormatComparison, extras: string[], final?: RowVerdict, subtotals: RowVerdict[] = [], counted = subtotals): CheckResult {
  const verdicts = [...cmp.expected.flat(), ...counted, ...(final ? [final] : [])];
  const right = verdicts.filter((v) => v === 'ok').length;
  const correct = right === verdicts.length && cmp.extra === 0;
  const format = { ...cmp, correct, right, total: verdicts.length, ...(final ? { final } : {}), ...(subtotals.length > 0 ? { subtotals } : {}) };
  const parts = { right: rowsCounted(right, cmp.extra), total: verdicts.length };
  return correct ? { correct, parts, format } : { correct, mistakeCode: formatCode(q, verdicts, extras), parts, format };
}

/** The labels of the rows a comparison found to be extra, in the order they were entered. */
const extraLabels = (entered: EnteredRow[][], cmp: FormatComparison): string[] =>
  entered.flatMap((rows, list) => rows.filter((_, i) => cmp.entered[list]?.[i] === 'extraRow').map((r) => r.label));

const describeFormat = (q: FormatQuestion, code: string): string | undefined => {
  const read = readFormatCode(q, code);
  if (!read) return undefined;
  const extra = extraRowsText(read.extras.length);
  return `${formatScoreText(read.rows.filter((v) => v === 'ok').length, read.rows.length)}.${extra ? ` ${extra}` : ''}`;
};

const asEntered = (rows: FormatRow[]): EnteredRow[] => rows.map((r) => ({ label: r.label, amounts: r.amounts }));

const account: ExerciseLogic<AccountQuestion, Extract<Response, { type: 'account' }>> = {
  // The rows of each side are matched as a collection, and so are the rows below the totals of each side.
  check(q, r) {
    const later = Array.from({ length: periodCount(q) - 1 }, (_, i) => r.later?.[i] ?? [[], []]);
    const entered = [r.sides[0], r.sides[1], ...later.flat(), r.below[0], r.below[1]];
    const cmp = compareFormat(formatLists(q), entered, (list) => list % 2);
    return formatResult(q, cmp, extraLabels(entered, cmp));
  },
  correctAnswer: () => null,
  describeWrong: describeFormat,
  e2eExpected: (q) => ({
    sides: q.sides.map((s) => asEntered(s.rows)),
    below: q.sides.map((s) => asEntered(s.below)),
    ...(q.later ? { later: q.later.map((period) => period.map(asEntered)) } : {}),
  }),
  parts: (q) => ({ count: expectedRows(q).length, name: 'rows' }),
};

/**
 * What became of the final figure of a statement. Where the student also chooses what it is called, the wrong name
 * is `label` whatever the amount: an overdraft taken for a balance is not the right ending.
 */
function finalVerdict(final: NonNullable<StatementQuestion['final']>, r: Extract<Response, { type: 'statement' }>): RowVerdict {
  if (r.final === null && (!final.options || r.finalLabel === undefined)) return 'missing';
  if (final.options && r.finalLabel !== final.label) return 'label';
  return r.final === final.amount ? 'ok' : 'amount';
}

const statement: ExerciseLogic<StatementQuestion, Extract<Response, { type: 'statement' }>> = {
  // The final figure counts as one more row: right, wrong, or not entered. So does every sub-total of a statement in
  // parts, whose rows are matched list by list: a row entered under another sub-heading is in the wrong place.
  check(q, r) {
    const lists = formatLists(q);
    // A printed figure is not the student's to get wrong: a row stands with what its particulars print, and only
    // what is typed of it is marked. So is a sub-total, of which nothing typed is nil in every typed column.
    const printed = printedOf(q);
    const asPrinted = (row: EnteredRow): EnteredRow => {
      const figures = printed(row.label);
      return figures ? { label: row.label, amounts: row.amounts.map((a, c) => figures[c] ?? a) } : row;
    };
    const entered = lists.map((_, k) => (k === 0 ? r.rows : (r.more?.[k - 1] ?? [])).map(asPrinted));
    const cmp = compareFormat(lists, entered);
    const lines = subtotalsOf(q);
    const typedOf = lines.map((line) => subtotalPrints(q, line).map((figure) => figure === null));
    const subtotals = lines.map((line, i): RowVerdict => {
      const typed = r.subtotals?.[i];
      const mine = (figures: readonly number[]) => figures.filter((_, c) => typedOf[i][c]);
      if (!typed) return mine(line.amounts).every((a) => a === 0) ? 'ok' : 'missing';
      return typed.length === line.amounts.length && sameAmounts(mine(typed), mine(line.amounts)) ? 'ok' : 'amount';
    });
    const counted = subtotals.filter((_, i) => typedOf[i].includes(true));
    return formatResult(q, cmp, extraLabels(entered, cmp), q.final ? finalVerdict(q.final, r) : undefined, subtotals, counted);
  },
  correctAnswer: () => null,
  describeWrong: describeFormat,
  // What the tests type: the rows list by list, the sub-totals, and the kinds of the columns where they are not all
  // plain rupees (a figure is then typed in the unit of its column, a negative one with a minus sign). Where the
  // statement prints figures, every row and sub-total says which of its figures are printed and so are not typed.
  e2eExpected: (q) => {
    const printed = printedOf(q);
    const shown = (rows: FormatRow[]) =>
      rows.map((row) => {
        const figures = printed(row.label);
        return { label: row.label, amounts: row.amounts, ...(figures ? { printed: figures.map((figure) => figure !== null) } : {}) };
      });
    const [first, ...more] = formatLists(q).map(shown);
    const subtotals = subtotalsOf(q).map((line) => line.amounts);
    return {
      rows: first,
      final: q.final?.amount ?? null,
      ...(q.final?.options ? { finalLabel: q.final.label } : {}),
      ...(more.length > 0 ? { more } : {}),
      ...(subtotals.length > 0 ? { subtotals } : {}),
      ...(q.columnKinds ? { kinds: q.columnKinds } : {}),
      ...(q.givenColumns ? { printedSubtotals: subtotalsOf(q).map((line) => subtotalPrints(q, line).map((figure) => figure !== null)) } : {}),
    };
  },
  parts: (q) => ({ count: expectedRows(q).length, name: 'rows' }),
};

const numeric: ExerciseLogic<TypedQuestion, Extract<Response, { type: 'numeric' }>> = {
  // A figure is compared as the integer it is held as, a ratio term by term in the order typed. The code of a known
  // wrong answer carries it as it is compared ("common:1250000", "common:2:3").
  check(q, r) {
    const typed = numericKey(r.value);
    if (typed === numericKey(q.answer)) return { correct: true };
    const known = q.commonErrors.some((e) => numericKey(e.value) === typed);
    return { correct: false, mistakeCode: known ? COMMON_ERROR_CODE + typed : OTHER_AMOUNT_CODE };
  },
  correctAnswer: (q) => formatNumeric(q.answer, q.unit),
  describeWrong(q, code) {
    if (code === OTHER_AMOUNT_CODE) return q.unit === 'ratio' ? NOT_RIGHT_RATIO : q.unit === 'times' ? NOT_RIGHT_NUMBER : NOT_RIGHT_AMOUNT;
    if (!code.startsWith(COMMON_ERROR_CODE)) return undefined;
    const typed = code.slice(COMMON_ERROR_CODE.length);
    return q.commonErrors.find((e) => numericKey(e.value) === typed)?.why;
  },
  e2eExpected: (q) => typedNumeric(q.answer, q.unit),
};

type OfType<T extends Question['type']> = Extract<Question, { type: T }>;
type ResponseOf<T extends Question['type']> = Extract<Response, { type: T }>;

/** Every question type has exactly one entry; adding a type to `Question` fails to compile until it has one. */
export const EXERCISE_LOGIC: { [T in Question['type']]: ExerciseLogic<OfType<T>, ResponseOf<T>> } = {
  mcq,
  true_false: trueFalse,
  journal_entry: journal,
  numeric,
  journal_set: journalSet,
  account,
  statement,
};

/** The logic for a question's type, with the question and response typed loosely (the types are matched at runtime). */
export const logicFor = (q: Question): ExerciseLogic<Question, Response> =>
  EXERCISE_LOGIC[q.type] as unknown as ExerciseLogic<Question, Response>;
