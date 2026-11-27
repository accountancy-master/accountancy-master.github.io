import type { AccountQuestion, JournalSetQuestion, McqQuestion, Question, StatementQuestion, TrueFalseQuestion, TypedQuestion } from '@/content/types';
import { accountLabel } from '@/engine/books';
import { kindOf, showFigure, type FormatRow } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import { formatINR } from '@/engine/money';
import { formatNumeric } from '@/exercises/numeric';

// ---------------------------------------------------------------------------------------------------------------
// How each kind of question is laid out on paper: the rows of a ruled journal, the two sides of a ledger account and
// its columns, the lines of a statement with the figures it prints, the answer line of a figure. The sheet and its
// answer key (components/worksheets) draw what these say; nothing here knows about the screen.
// ---------------------------------------------------------------------------------------------------------------

/** The columns of a journal, as an examination paper rules them. */
export const JOURNAL_HEADS = ['Date', 'Particulars', 'L.F.', 'Debit (₹)', 'Credit (₹)'] as const;

/** A ruled journal for one entry has at least this many rows. */
export const MIN_JOURNAL_ROWS = 6;

/**
 * The rows of a ruled journal for one entry of so many lines: a row for every account, one for the narration, and
 * two to spare, so that the number of rows does not give the entry away.
 */
export const journalRows = (lines: number): number => Math.max(MIN_JOURNAL_ROWS, lines + 3);

/** The rows of a ruled journal for a set: a row for every account and the narration of each entry, and two to spare. */
export const setRows = (q: Pick<JournalSetQuestion, 'entries'>): number => q.entries.reduce((n, e) => n + e.expected.length + 1, 0) + 2;

/** One line of a journal entry as the answer key writes it: debits first with "Dr", credits after them with "To". */
export interface KeyJournalLine {
  /** The date of a set's transaction (or its label, "Error 1"), on the first line of its entry. */
  date: string;
  particulars: string;
  side: 'Dr' | 'Cr';
  debit: string;
  credit: string;
}

/** An entry as the key writes it: the debit lines, then the credit lines, the amounts in rupees. */
export function keyJournalLines(lines: readonly JournalLine[], date = ''): KeyJournalLine[] {
  const ordered = [...lines.filter((l) => l.side === 'Dr'), ...lines.filter((l) => l.side === 'Cr')];
  return ordered.map((l, i) => ({
    date: i === 0 ? date : '',
    particulars: l.side === 'Dr' ? `${accountLabel(l.accountId)} ... Dr.` : `To ${accountLabel(l.accountId)}`,
    side: l.side,
    debit: l.side === 'Dr' ? formatINR(l.amount).slice(1) : '',
    credit: l.side === 'Cr' ? formatINR(l.amount).slice(1) : '',
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Ledger accounts. Two sides side by side, each with its own heads: Date, Particulars, J.F. and the amount columns
// for an account that writes "To" and "By"; Particulars and the amounts for one that does not (a Balance Sheet in
// the horizontal form), and for partners' accounts in three or four columns, which have no room for the others.
// ---------------------------------------------------------------------------------------------------------------

export interface LedgerLayout {
  /** "Dr." and "Cr.", or "Liabilities" and "Assets". */
  sideTitles: [string, string];
  /** True when each side has a Date and a J.F. column. */
  dated: boolean;
  /** The heads of one side, in order. */
  heads: string[];
  /** The amount columns, as the question names them. */
  columns: string[];
  /** Every period, with its title where the account has several, and the ruled rows it gives each side. */
  periods: { title: string | null; rows: number }[];
  /** The rows below the last totals of each side, for a balance brought down. */
  below: number;
}

/** "Dr" as a paper heads the side: "Dr."; any other title as it is. */
export const sideTitle = (title: string): string => (title === 'Dr' || title === 'Cr' ? `${title}.` : title);

/** Whether the sides of an account have a Date and a J.F. column. */
export const isDated = (q: Pick<AccountQuestion, 'sides' | 'columns'>): boolean => q.sides.every((s) => s.prefix !== undefined) && q.columns.length <= 2;

export function ledgerLayout(q: AccountQuestion): LedgerLayout {
  const dated = isDated(q);
  const periods: [FormatRow[], FormatRow[]][] = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
  const below = Math.max(q.sides[0].below.length, q.sides[1].below.length);
  return {
    sideTitles: [sideTitle(q.sides[0].title), sideTitle(q.sides[1].title)],
    dated,
    heads: dated ? ['Date', 'Particulars', 'J.F.', ...q.columns] : ['Particulars', ...q.columns],
    columns: q.columns,
    // A row to spare on each side: the longer side does not show how many rows the answer has.
    periods: periods.map(([left, right], p) => ({ title: q.periodTitles?.[p] ?? null, rows: Math.max(left.length, right.length) + 1 })),
    below: below > 0 ? below : q.continued ? 1 : 0,
  };
}

/** A row of an account as the key writes it: "To Sales A/c", "(C)" for a contra entry, its detail lines. */
export function keyParticulars(row: FormatRow, prefix?: string): string {
  return `${row.ref ? `${row.ref} ` : ''}${prefix ? `${prefix} ` : ''}${row.label}${row.contra ? ' (C)' : ''}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Statements. Their lines in order: sub-headings, the rows to fill in, sub-totals, the total, and the figure the
// statement ends on. A statement that gives some of its columns (a comparative statement) prints the particulars and
// the given figures of every row that prints any, as the app does once the row's particulars are chosen; the
// student fills in the rest. One that gives none leaves every row blank, with a row to spare in each part.
// ---------------------------------------------------------------------------------------------------------------

export type StatementSheetLine =
  | { type: 'heading'; text: string }
  /** A row: its particulars where they are printed (null to be written), and each cell's printed figure or null. */
  | { type: 'row'; label: string | null; cells: (string | null)[] }
  | { type: 'subtotal'; label: string; cells: (string | null)[] }
  | { type: 'total' }
  /** The figure it ends on: its name, or null when the student chooses it from `options`. */
  | { type: 'final'; label: string | null; options?: string[] };

export interface StatementLayout {
  /** The particulars, the note numbers where the statement has them, then the amount columns. */
  heads: string[];
  noted: boolean;
  lines: StatementSheetLine[];
}

export function statementLayout(q: StatementQuestion): StatementLayout {
  const n = q.columns.length;
  const given = q.givenColumns;
  const kinds = q.columnKinds;
  const spare = given ? 0 : 1;
  const figure = (amounts: readonly number[], prints: boolean) => amounts.map((a, c) => (prints && given?.[c] ? showFigure(a, kindOf(kinds, c)) : null));
  const out: StatementSheetLine[] = [];
  const blank = (): StatementSheetLine => ({ type: 'row', label: null, cells: Array.from({ length: n }, () => null) });
  const closeSection = () => {
    if (out.length > 0 && out[out.length - 1].type === 'row') for (let i = 0; i < spare; i++) out.push(blank());
  };
  const linesAt = (at: number) => {
    for (const line of (q.lines ?? []).filter((l) => l.at === at)) {
      closeSection();
      if ('heading' in line) out.push({ type: 'heading', text: line.heading });
      else out.push({ type: 'subtotal', label: line.subtotal, cells: figure(line.amounts, line.given === true) });
    }
  };
  q.rows.forEach((row, i) => {
    linesAt(i);
    const cells = figure(row.amounts, row.given !== false);
    out.push(cells.some((c) => c !== null) ? { type: 'row', label: row.label, cells } : blank());
  });
  linesAt(q.rows.length);
  closeSection();
  const subtotals = (q.lines ?? []).some((l) => 'subtotal' in l);
  if (!subtotals && q.columns.some((_, c) => kindOf(kinds, c).adds)) out.push({ type: 'total' });
  if (q.final) out.push(q.final.options ? { type: 'final', label: null, options: q.final.options } : { type: 'final', label: q.final.label });
  const noted = q.noteHeading !== undefined;
  return { heads: [q.heading, ...(noted ? [q.noteHeading!] : []), ...q.columns], noted, lines: out };
}

/** How many rows of a statement the student writes in: blank ones and those whose figures are partly printed. */
export const statementRowCount = (layout: StatementLayout): number => layout.lines.filter((l) => l.type === 'row').length;

// ---------------------------------------------------------------------------------------------------------------
// Answers of one figure, a choice or true or false.
// ---------------------------------------------------------------------------------------------------------------

/** The answer line of a figure: what stands before and after the blank, and for a ratio how many terms it has. */
export interface AnswerBlank {
  before: string;
  after: string;
  /** 1 for one figure; 2 to 4 for a ratio, written with ":" between the blanks. */
  terms: number;
}

export function answerBlank(q: Pick<TypedQuestion, 'unit' | 'answer'>): AnswerBlank {
  switch (q.unit) {
    case 'rupees':
      return { before: '₹', after: '', terms: 1 };
    case 'percent':
      return { before: '', after: '%', terms: 1 };
    case 'times':
      return { before: '', after: 'times', terms: 1 };
    case 'ratio':
      return { before: '', after: '', terms: (q.answer as number[]).length };
    default:
      return { before: '', after: '', terms: 1 };
  }
}

/** The answer of a figure as the key writes it: "₹12,500", "12.5%", "2.5 times", "42", "3 : 2". */
export function figureAnswer(q: Pick<TypedQuestion, 'unit' | 'answer'>): string {
  if (q.unit === 'ratio') return (q.answer as number[]).join(' : ');
  const shown = formatNumeric(q.answer, q.unit);
  return q.unit === 'times' ? `${shown} times` : shown;
}

/** The answer of a choice: "(b) Cash A/c". */
export function choiceAnswer(q: Pick<McqQuestion, 'options' | 'correct'>): string {
  const option = q.options.find((o) => o.id === q.correct);
  return option ? `(${option.id}) ${option.text}` : `(${q.correct})`;
}

/** The answer of a short question in one line, as the key writes it; null for a question answered in a format. */
export function shortAnswer(q: Question): string | null {
  if (q.type === 'mcq') return choiceAnswer(q);
  if (q.type === 'true_false') return trueFalseAnswer(q);
  if (q.type === 'numeric') return figureAnswer(q);
  return null;
}

export const trueFalseAnswer = (q: Pick<TrueFalseQuestion, 'correct'>): string => (q.correct ? 'True' : 'False');

/** The working of a question, a step to a line: its own where it has it, otherwise its explanation. */
export function workingOf(q: Question): string[] {
  if (q.type === 'numeric' || q.type === 'account' || q.type === 'statement') return q.working;
  if (q.type === 'journal_set') return [];
  return q.explanation.trim() === '' ? [] : [q.explanation];
}
