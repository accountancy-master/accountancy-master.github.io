import { parseRupees } from '@/lib/money-input';
import { formatINR, type Paise } from './money';

// The formats a student prepares: a two-sided account (a ledger account, a cash book, a Trading and Profit and Loss
// Account, a Balance Sheet) and a statement (a Trial Balance, a Bank Reconciliation Statement). Both are lists of
// rows, each with its particulars and an amount for every amount column. What a row is, when a list of rows cannot
// be right, and how the rows a student entered are matched against the rows expected are all here.

/** One row of a format as an examiner expects it. */
export interface FormatRow {
  /** Shown in the solution. The student does not type dates. */
  date?: string;
  /** The particulars, one of the labels on offer: "Sales A/c", "Balance c/d". A side's "To" or "By" is not part of it. */
  label: string;
  /**
   * One amount for every amount column of the format, in paise; 0 where the row leaves the column blank. In a column
   * of a statement that declares another unit (see `ColumnKind`) the figure is in that unit, and where the column
   * allows it the figure may be negative.
   */
  amounts: Paise[];
  /** Lines of working shown under the particulars in the solution ("Less: Returns ₹2,000"). The student enters the net figure. */
  details?: string[];
  /** A closing row: balance c/d, gross profit c/d, net profit transferred to capital. */
  closing?: true;
  /** A contra entry of a cash book, marked "C" in the solution. */
  contra?: true;
  /** What the row refers to in the data, shown beside it in the solution and never typed: "(a)" for error (a). */
  ref?: string;
  /**
   * Other wordings of the particulars that are just as right: "Balance b/d" for the "Difference in trial balance" a
   * Suspense A/c opens with. They are on offer with the labels, and the row is right under any of them; the
   * solution shows `label`.
   */
  also?: string[];
  /** The number of the note to accounts the row refers to, shown in the "Note No." column of the solution and never typed. */
  note?: string;
  /**
   * False on a row of a statement that gives some of its columns (see `printedFigures`) when the student works the
   * figures of this row out all the same: the tax, a line the data gives only indirectly. Left out, the row prints
   * its figure in every given column.
   */
  given?: false;
}

/** Every wording a row is right under: its label, then its other wordings. */
export const acceptedLabels = (row: Pick<FormatRow, 'label' | 'also'>): string[] => [row.label, ...(row.also ?? [])];

/** A row as a student entered it: the particulars chosen and an amount for every column (0 where nothing was typed). */
export interface EnteredRow {
  label: string;
  amounts: Paise[];
}

/**
 * An account has up to four amount columns (a cash book has two; partners' capital accounts have one for each
 * partner) and so has a statement (a Purchases Book with taxable value, tax and total); a format has so many rows at
 * most (every side and the rows below the totals together).
 */
export const MAX_FORMAT_COLUMNS = 4;
export const MAX_STATEMENT_COLUMNS = 4;
export const MIN_FORMAT_ROWS = 3;
export const MAX_FORMAT_ROWS = 30;
/** An account may be kept over so many periods, each balanced and brought down, and then has so many rows at most in all. */
export const MAX_ACCOUNT_PERIODS = 4;
export const MAX_PERIODS_ROWS = 24;

// ---------------------------------------------------------------------------------------------------------------
// The kind of an amount column. Every column of an account, and every column of a statement that says nothing else,
// holds whole rupees that are never negative and add up to a total. A column of a statement may say otherwise: a
// percentage change is in percent and may be a decrease, an outflow of cash is a negative figure in rupees.
// ---------------------------------------------------------------------------------------------------------------

/** What the figures of a column count: paise, hundredths of a percent (1250 is 12.5%), or a plain whole number. */
export type ColumnUnit = 'rupees' | 'percent' | 'number';

export interface ColumnKind {
  unit: ColumnUnit;
  /** True where a figure may be negative (a decrease, an outflow): typed with a minus sign, shown in brackets. */
  signed?: true;
  /** False for a column whose figures do not add up to a total (a percentage change, a ratio). */
  adds: boolean;
}

/** The kind of a column that declares none: whole rupees, never negative, adding up. */
export const RUPEE_COLUMN: ColumnKind = { unit: 'rupees', adds: true };

/** True for a column as every column was before columns had kinds: what is typed in it is read as it always was. */
export const isPlainColumn = (kind: ColumnKind): boolean => kind.unit === 'rupees' && !kind.signed;

/** The kind of column `c`, from the kinds a statement declares (none for an account, and for most statements). */
export const kindOf = (kinds: readonly ColumnKind[] | undefined, c: number): ColumnKind => kinds?.[c] ?? RUPEE_COLUMN;

/** Why a figure cannot stand in a column of this kind, as the end of "<figure> ...", or null when it can. */
export function figureProblem(value: number, kind: ColumnKind): string | null {
  if (!Number.isSafeInteger(value)) return 'is not a whole number';
  if (value < 0 && !kind.signed) return 'is negative, in a column that takes no negative figure';
  if (kind.unit === 'rupees' && value % 100 !== 0) return 'is not a whole number of rupees';
  return null;
}

/** Hundredths as a number with up to two decimals: "12.5" for 1250. */
const decimals = (hundredths: number): string => (hundredths % 100 === 0 ? String(hundredths / 100) : (hundredths / 100).toFixed(2).replace(/0$/, ''));
const sized = (size: number, kind: ColumnKind): string =>
  kind.unit === 'rupees' ? formatINR(size).slice(1) : kind.unit === 'percent' ? decimals(size) : size.toLocaleString('en-IN');

/**
 * A figure as its column shows it: Indian grouping and no sign for rupees (the column is headed "(₹)"), nothing for a
 * column the row leaves blank, and a negative figure in brackets, as an examination paper prints it: "(12,500)".
 */
export function showFigure(value: number, kind: ColumnKind = RUPEE_COLUMN): string {
  if (value === 0) return '';
  return value < 0 ? `(${sized(-value, kind)})` : sized(value, kind);
}

/** A figure as it is said in a line of text: "₹12,500", "12.5%", "40", and a negative one in brackets, "(₹12,500)". */
export function sayFigure(value: number, kind: ColumnKind = RUPEE_COLUMN): string {
  if (kind.unit === 'rupees') return value < 0 ? `(${formatINR(-value)})` : formatINR(value);
  const shown = value === 0 ? '0' : showFigure(value, kind);
  return kind.unit === 'percent' ? `${shown}%` : shown;
}

/** A figure as a student types it: "12,500", "12.5", and a negative one with a minus sign, "-12,500". Nothing for a blank. */
export function typedFigure(value: number, kind: ColumnKind = RUPEE_COLUMN): string {
  if (value === 0) return '';
  return value < 0 ? `-${sized(-value, kind)}` : sized(value, kind);
}

const WHOLE = /^\d{1,3}(?:,\d{2,3})*$|^\d+$/;
const PERCENT = /^(\d+)(?:\.(\d{1,2}))?\s*%?$/;
const ZERO = /^0+(?:\.0{1,2})?\s*%?$/;

/**
 * What a student typed in a column, in the unit of the column; null when it is not a figure the column takes. A
 * plain rupee column reads what it always did ("1,25,000", "₹ 980.50"; nothing and zero are no amount). A column of
 * another kind also reads zero (a change of nil), a percent with up to two decimals, and, where the column is signed,
 * a negative figure typed with a minus sign or in brackets: "-12,500", "(12,500)".
 */
export function parseFigure(input: string, kind: ColumnKind = RUPEE_COLUMN): number | null {
  const text = input.trim();
  if (isPlainColumn(kind) && kind.unit === 'rupees') return parseRupees(text);
  const bracketed = /^\((.+)\)$/.exec(text);
  const minus = /^[-−–]\s*(.+)$/.exec(text);
  const body = (bracketed ?? minus)?.[1].trim() ?? text;
  const negative = bracketed !== null || minus !== null;
  if (negative && !kind.signed) return null;
  if (ZERO.test(body)) return 0;
  let size: number | null;
  if (kind.unit === 'rupees') size = parseRupees(body);
  else if (kind.unit === 'percent') {
    const m = PERCENT.exec(body);
    size = m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null;
  } else size = WHOLE.test(body) ? Number(body.replace(/,/g, '')) : null;
  if (size === null || !Number.isSafeInteger(size)) return null;
  return negative ? -size : size;
}

// ---------------------------------------------------------------------------------------------------------------
// Printed figures. A statement may give some of its columns: the figures of the two years of a comparative
// statement, which the data of the question states. A row then prints its figure in those columns as soon as its
// particulars are chosen, and the student types the rest (the change, the percentage). A printed figure is not
// typed, cannot be wrong and earns nothing. An account gives no column.
// ---------------------------------------------------------------------------------------------------------------

/**
 * For every column of a line of a statement, the figure it prints, or null where the student types it. `given` says
 * of every column whether the statement gives it (left out: none), and `prints` whether the line takes the given
 * columns up: a row does unless it says `given: false`, a sub-total only when it says `given: true`.
 */
export const printedFigures = (amounts: readonly number[], given: readonly boolean[] | undefined, prints: boolean): (number | null)[] =>
  amounts.map((a, c) => (prints && given?.[c] === true ? a : null));

/**
 * What the rows of a statement print, by their particulars: under its label and every other wording, the figures of
 * each row that prints any (see `printedFigures`). A printed figure follows the particulars wherever the row is
 * entered, so it says nothing about where the row belongs; a label that prints nothing (a distractor, a row that is
 * worked out) is not in the map.
 */
export function printedByLabel(rows: readonly FormatRow[], given: readonly boolean[] | undefined): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  if (!given) return out;
  for (const row of rows) {
    const figures = printedFigures(row.amounts, given, row.given !== false);
    if (figures.some((f) => f !== null)) for (const label of acceptedLabels(row)) out.set(label, figures);
  }
  return out;
}

/** A sub-total of a statement as the check of its given columns needs it. */
type GivenSubtotal = { subtotal: string; amounts: readonly number[]; given?: boolean };

/**
 * Why a statement cannot give the columns it says it gives, or null when it can (and when it gives none). It must
 * give a column to speak of given figures at all; two rows that go by the same name must print the same figures,
 * since a printed figure follows the particulars; and something must be left for the student to work out.
 */
export function givenProblem(given: readonly boolean[] | undefined, columns: number, rows: readonly FormatRow[], subtotals: readonly GivenSubtotal[]): string | null {
  if (!given) {
    const row = rows.find((r) => r.given !== undefined);
    if (row) return `"${row.label}" says its figures are not given, and the statement gives no column`;
    const line = subtotals.find((s) => s.given !== undefined);
    return line ? `the sub-total "${line.subtotal}" is said to be given, and the statement gives no column` : null;
  }
  if (given.length !== columns) return `${given.length} columns are said to be given or not, for ${columns} amount columns`;
  if (!given.some(Boolean)) return 'no column is given';
  const seen = new Map<string, string>();
  for (const row of rows) {
    const prints = printedFigures(row.amounts, given, row.given !== false).join('|');
    for (const label of new Set(acceptedLabels(row))) {
      if ((seen.get(label) ?? prints) !== prints) return `two rows "${label}" print different figures: a printed figure follows the particulars of its row`;
      seen.set(label, prints);
    }
  }
  const typed = [...rows.map((r) => printedFigures(r.amounts, given, r.given !== false)), ...subtotals.map((s) => printedFigures(s.amounts, given, s.given === true))];
  return typed.some((figures) => figures.includes(null)) ? null : 'every figure of every row and sub-total is given: nothing is left to work out';
}

/** The total of each amount column over some rows. */
export function columnTotals(rows: readonly Pick<FormatRow, 'amounts'>[], columns: number): Paise[] {
  return Array.from({ length: columns }, (_, c) => rows.reduce((sum, r) => sum + (r.amounts[c] ?? 0), 0));
}

/** True when two rows of figures are the same, column by column. */
export const sameAmounts = (a: readonly Paise[], b: readonly Paise[]) => a.length === b.length && a.every((x, i) => x === b[i]);
// The comparison below is by label and figures alone, so a negative figure and a figure in percent are matched as
// any other: -1250000 is an outflow of ₹12,500, and it is not 1250000.
/** The same figures whatever column each stands in: the mark of an amount typed in the wrong column. */
const sameFigures = (a: readonly Paise[], b: readonly Paise[]) =>
  sameAmounts([...a].filter((x) => x !== 0).sort((x, y) => x - y), [...b].filter((x) => x !== 0).sort((x, y) => x - y));

/**
 * Why a row cannot be a row of a format with this many amount columns, or null when it can. `kinds` are the kinds of
 * the columns where a statement declares them: without them every column holds whole rupees that are never negative.
 */
export function rowProblem(row: FormatRow, columns: number, kinds?: readonly ColumnKind[]): string | null {
  if (typeof row.label !== 'string' || row.label.trim() === '') return 'a row has no particulars';
  if (row.amounts.length !== columns) return `"${row.label}" has ${row.amounts.length} amounts for ${columns} amount columns`;
  for (const [c, a] of row.amounts.entries()) {
    const kind = kindOf(kinds, c);
    if (isPlainColumn(kind) && kind.unit === 'rupees') {
      if (!Number.isSafeInteger(a) || a < 0 || a % 100 !== 0) return `"${row.label}" has amount ${a}, not a positive whole number of rupees`;
    } else {
      const bad = figureProblem(a, kind);
      if (bad) return `"${row.label}" has a figure ${a} that ${bad}`;
    }
  }
  if (row.amounts.every((a) => a === 0)) return `"${row.label}" has no amount`;
  if (row.date !== undefined && row.date.trim() === '') return `"${row.label}" has an empty date`;
  if (row.ref !== undefined && row.ref.trim() === '') return `"${row.label}" has an empty reference`;
  if (row.details?.some((line) => typeof line !== 'string' || line.trim() === '')) return `"${row.label}" has an empty detail line`;
  if (row.also?.some((label) => typeof label !== 'string' || label.trim() === '')) return `"${row.label}" has an empty other wording`;
  if (row.note !== undefined && row.note.trim() === '') return `"${row.label}" has an empty note number`;
  return null;
}

/**
 * Why a list of rows that are entered and matched together (one side of an account, a statement) cannot be right, or
 * null when it can: a row that is not one, a label that is not on offer, or two rows nothing tells apart (the same
 * particulars and the same amounts: rows are matched without their dates). Another wording of a row counts as its
 * particulars here: it may not be the label, or another wording, of a row of the list with the same amounts.
 */
export function rowsProblem(rows: readonly FormatRow[], columns: number, labels: readonly string[], kinds?: readonly ColumnKind[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const bad = rowProblem(row, columns, kinds);
    if (bad) return bad;
    for (const label of new Set(acceptedLabels(row))) {
      if (!labels.includes(label)) return `"${label}" is used but not among the labels on offer`;
      const key = `${label}|${row.amounts.join('|')}`;
      if (seen.has(key)) return `two rows "${label}" with the same amounts cannot be told apart`;
      seen.add(key);
    }
  }
  return null;
}

/**
 * The labels a format offers: those of its rows, their other wordings and the distractors, each once, in the order of
 * the alphabet. A distractor that repeats a label already there is dropped.
 */
export function offeredLabels(rows: readonly Pick<FormatRow, 'label' | 'also'>[], distractors: readonly string[]): string[] {
  return [...new Set([...rows.flatMap(acceptedLabels), ...distractors])].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/** What the check found for a row the student entered. */
export type RowStatus = 'correct' | 'wrongAmount' | 'wrongColumn' | 'wrongSide' | 'wrongPlace' | 'extraRow';
/**
 * What became of a row that was expected: entered as it should be (`ok`), not entered at all (`missing`), or entered
 * with a wrong amount, with its amount in the wrong column, on the wrong side, or on the wrong side of the totals
 * (`place`: a balance brought down written above them). `label` is for the final figure of a statement alone: the
 * wrong name chosen for what the statement ends on.
 */
export type RowVerdict = 'ok' | 'missing' | 'amount' | 'column' | 'side' | 'place' | 'label';

export interface FormatComparison {
  /** Every expected row is there with its amounts where it belongs, and there is no other row. */
  correct: boolean;
  /** How many expected rows were right, of how many. */
  right: number;
  total: number;
  /** How many rows were entered that answer to no expected row. */
  extra: number;
  /** For every list of expected rows, what became of each row. */
  expected: RowVerdict[][];
  /** For every list of entered rows, what the check found for each row. */
  entered: RowStatus[][];
}

/**
 * The rows a student entered against the rows expected. A format is several lists of rows (the two sides of an
 * account, and the rows below its totals on each side; a statement is one list), and the rows of a list are matched
 * as a collection: their order is not marked. A row is right when a row with the same particulars (its label, or
 * another wording it is given) and the same amounts is expected in its list. A row that is not right is set against
 * the expected row it most likely was meant for (the same particulars and amounts in another list, then the same
 * particulars in its own list, then the same particulars anywhere), which says what is wrong with it; a row that
 * answers to nothing expected is an extra row.
 * `sideOf` says which side of the account a list is on, so that a row in the wrong list can be told "wrong side"
 * from "wrong side of the totals".
 */
export function compareFormat(
  expected: readonly (readonly FormatRow[])[],
  entered: readonly (readonly EnteredRow[])[],
  sideOf: (list: number) => number = () => 0,
): FormatComparison {
  const verdicts: RowVerdict[][] = expected.map((rows) => rows.map(() => 'missing'));
  const statuses: RowStatus[][] = expected.map((_, s) => (entered[s] ?? []).map(() => 'extraRow'));
  const lists = expected.map((_, s) => s);

  /** Sets every row still unplaced against an expected row still open that `fits`, looking in the lists `where` allows. */
  const pass = (where: (from: number, to: number) => boolean, fits: (want: FormatRow, got: EnteredRow) => boolean, verdict: (from: number, to: number, want: FormatRow, got: EnteredRow) => RowVerdict) => {
    for (const s of lists) {
      (entered[s] ?? []).forEach((got, i) => {
        if (statuses[s][i] !== 'extraRow') return;
        for (const t of lists.filter((x) => where(s, x))) {
          const k = expected[t].findIndex((want, j) => verdicts[t][j] === 'missing' && fits(want, got));
          if (k < 0) continue;
          const v = verdict(s, t, expected[t][k], got);
          verdicts[t][k] = v;
          statuses[s][i] = v === 'ok' ? 'correct' : v === 'amount' ? 'wrongAmount' : v === 'column' ? 'wrongColumn' : v === 'side' ? 'wrongSide' : 'wrongPlace';
          return;
        }
      });
    }
  };
  const sameLabel = (want: FormatRow, got: EnteredRow) => acceptedLabels(want).includes(got.label);
  const exact = (want: FormatRow, got: EnteredRow) => sameLabel(want, got) && sameAmounts(want.amounts, got.amounts);
  const elsewhere = (from: number, to: number): RowVerdict => (sideOf(from) === sideOf(to) ? 'place' : 'side');

  pass((s, t) => s === t, exact, () => 'ok');
  pass((s, t) => s !== t, exact, elsewhere);
  pass((s, t) => s === t, sameLabel, (_s, _t, want, got) => (sameFigures(want.amounts, got.amounts) ? 'column' : 'amount'));
  pass((s, t) => s !== t, sameLabel, elsewhere);

  const all = verdicts.flat();
  const right = all.filter((v) => v === 'ok').length;
  const extra = statuses.flat().filter((s) => s === 'extraRow').length;
  return { correct: right === all.length && extra === 0, right, total: all.length, extra, expected: verdicts, entered: statuses };
}
