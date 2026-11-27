import type { Question } from '@/content/types';
import { kindOf, typedFigure, type ColumnKind, type EnteredRow } from '@/engine/formats';
import { formatINR } from '@/engine/money';
import { periodCount, printedOf, subtotalPrints, subtotalsOf, type LongResponse, type Response } from '@/exercises/logic';
import { numericWords, readNumeric } from '@/exercises/numeric';
import { isBlankFormatRow, readAccount, readStatement, startAccount, withoutPrinted, type FormatRowDraft } from './formatRows';
import { readSetRows, setProblemText } from './journalSet';
import { isBlank, rowsToLines, type JournalRow } from './journalRows';

/**
 * An answer as its input holds it, before it is checked: the option chosen, the text typed, the rows of an entry as
 * far as they are filled. A mock paper keeps these (not checked answers), so that nothing typed is lost when the
 * learner moves to another question or reloads, and an answer can be changed until the paper is handed in.
 */
export type Draft =
  | { type: 'mcq'; optionId: string }
  | { type: 'true_false'; value: boolean }
  | { type: 'numeric'; text: string }
  | { type: 'journal_entry'; rows: JournalRow[] }
  /** The rows of every entry of a set, in the order of its transactions. */
  | { type: 'journal_set'; entries: JournalRow[][] }
  /** The rows of the left and the right side of an account, and the rows below the totals of each. */
  | { type: 'account'; sides: [FormatRowDraft[], FormatRowDraft[]]; below: [FormatRowDraft[], FormatRowDraft[]]; later?: [FormatRowDraft[], FormatRowDraft[]][] }
  /**
   * The rows of a statement, and what is typed as its final figure ('' when nothing is, or it has none). Of a
   * statement in parts: `more` are the rows of every list after the first, and `subtotals` what is typed in every
   * column of every sub-total.
   */
  | { type: 'statement'; rows: FormatRowDraft[]; final: string; finalLabel?: string; more?: FormatRowDraft[][]; subtotals?: string[][] };

export type DraftOf<Q extends Question> = Extract<Draft, { type: Q['type'] }>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const isRow = (v: unknown): v is JournalRow =>
  isObject(v) && typeof v.accountId === 'string' && (v.side === '' || v.side === 'Dr' || v.side === 'Cr') && typeof v.amount === 'string';

/**
 * A stored answer as a draft for this question, or undefined when it is not one (nothing stored, another type of
 * question, a shape this version does not know). Stored answers come back from the device, so they are read with care.
 */
export function asDraft<Q extends Question>(question: Q, stored: unknown): DraftOf<Q> | undefined {
  if (!isObject(stored) || stored.type !== question.type) return undefined;
  const ok =
    (stored.type === 'mcq' && typeof stored.optionId === 'string') ||
    (stored.type === 'true_false' && typeof stored.value === 'boolean') ||
    (stored.type === 'numeric' && typeof stored.text === 'string') ||
    (stored.type === 'journal_entry' && Array.isArray(stored.rows) && stored.rows.every(isRow)) ||
    (stored.type === 'journal_set' && Array.isArray(stored.entries) && stored.entries.every((rows) => Array.isArray(rows) && rows.every(isRow))) ||
    (stored.type === 'account' && isPairOfLists(stored.sides) && isPairOfLists(stored.below) && (stored.later === undefined || (Array.isArray(stored.later) && stored.later.every(isPairOfLists)))) ||
    (stored.type === 'statement' &&
      isFormatList(stored.rows) &&
      typeof stored.final === 'string' &&
      (stored.finalLabel === undefined || typeof stored.finalLabel === 'string') &&
      (stored.more === undefined || (Array.isArray(stored.more) && stored.more.every(isFormatList))) &&
      (stored.subtotals === undefined || (Array.isArray(stored.subtotals) && stored.subtotals.every((s) => Array.isArray(s) && s.every((t) => typeof t === 'string')))));
  return ok ? (stored as DraftOf<Q>) : undefined;
}

const isFormatRow = (v: unknown): v is FormatRowDraft =>
  isObject(v) && typeof v.label === 'string' && Array.isArray(v.amounts) && v.amounts.every((a) => typeof a === 'string');
const isFormatList = (v: unknown): v is FormatRowDraft[] => Array.isArray(v) && v.every(isFormatRow);
const isPairOfLists = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(isFormatList);

/** True when the draft holds anything at all (an option chosen, something typed, a row begun). */
export function draftFilled(draft: Draft | undefined): boolean {
  if (!draft) return false;
  // The boxes of a ratio that are all empty read ":" or "::": nothing has been typed.
  if (draft.type === 'numeric') return draft.text.replace(/:/g, '').trim() !== '';
  if (draft.type === 'journal_entry') return draft.rows.some((r) => !isBlank(r));
  if (draft.type === 'journal_set') return draft.entries.some((rows) => rows.some((r) => !isBlank(r)));
  if (draft.type === 'account') return [...draft.sides, ...draft.below, ...(draft.later ?? []).flat()].some((rows) => rows.some((r) => !isBlankFormatRow(r)));
  if (draft.type === 'statement') {
    const rows = [draft.rows, ...(draft.more ?? [])].some((list) => list.some((r) => !isBlankFormatRow(r)));
    return rows || draft.final.trim() !== '' || (draft.finalLabel ?? '') !== '' || (draft.subtotals ?? []).some((s) => s.some((t) => t.trim() !== ''));
  }
  return true;
}

/**
 * What a draft amounts to: nothing (`empty`), an answer that can be marked (`response`), or something begun that
 * cannot be read as an answer yet (`problem`, in the words the answer inputs use: an amount that is not a number, a
 * line of an entry without its side). Only a `response` counts as answered. A set of entries is marked entry by
 * entry, so it gives a `response` as soon as one entry can be read, together with the `problem` of an entry that
 * cannot: that entry is not marked, the others are.
 */
export function readDraft(
  question: Question,
  draft: Draft | undefined,
): { response: Response; problem?: string } | { problem: string } | { empty: true } {
  if (!draft || draft.type !== question.type || !draftFilled(draft)) return { empty: true };
  switch (draft.type) {
    case 'mcq':
      return question.type === 'mcq' && question.options.some((o) => o.id === draft.optionId)
        ? { response: { type: 'mcq', optionId: draft.optionId } }
        : { empty: true };
    case 'true_false':
      return { response: { type: 'true_false', value: draft.value } };
    case 'numeric': {
      if (question.type !== 'numeric') return { empty: true };
      const value = readNumeric(question, draft.text);
      return value === null ? { problem: numericWords(question).problem } : { response: { type: 'numeric', value } };
    }
    case 'journal_entry': {
      const read = rowsToLines(draft.rows);
      return read.ok ? { response: { type: 'journal_entry', lines: read.lines } } : { problem: read.error };
    }
    case 'journal_set': {
      if (question.type !== 'journal_set') return { empty: true };
      const read = readSetRows(draft.entries, question.entries.length);
      const problem = read.problems[0] ? setProblemText(read.problems[0].entry, read.problems[0].error) : undefined;
      if (read.entries.every((lines) => lines.length === 0)) return problem ? { problem } : { empty: true };
      return { response: { type: 'journal_set', entries: read.entries }, ...(problem ? { problem } : {}) };
    }
    // A format is marked row by row, as a set is entry by entry: a row that cannot be read is not marked, the others are.
    case 'account': {
      if (question.type !== 'account') return { empty: true };
      const read = readAccount(question, startAccount(draft, question.columns.length, periodCount(question)));
      const [problem] = read.problems;
      const { sides, below, later = [] } = read.response;
      if ([...sides, ...below, ...later.flat()].every((rows) => rows.length === 0)) return problem ? { problem } : { empty: true };
      return { response: read.response, ...(problem ? { problem } : {}) };
    }
    case 'statement': {
      if (question.type !== 'statement') return { empty: true };
      const read = readStatement(question, draft.rows, draft.final, draft.finalLabel, draft.more, draft.subtotals);
      const [problem] = read.problems;
      const { rows, more = [], subtotals = [], final } = read.response;
      // Nothing that can be marked: no row of any list, no sub-total and no final figure.
      if ([rows, ...more].every((list) => list.length === 0) && final === null && subtotals.every((s) => s === null)) return problem ? { problem } : { empty: true };
      return { response: read.response, ...(problem ? { problem } : {}) };
    }
  }
}

/** An amount as it is typed: "12,500", "980.50". Nothing for a column that was left blank. */
const typedAmount = (paise: number): string => (paise === 0 ? '' : formatINR(paise).slice(1));
/** The rows as they are typed; `kinds` are the kinds of the columns of a statement that declares them. */
const typedRows = (rows: readonly EnteredRow[], kinds?: readonly ColumnKind[]): FormatRowDraft[] =>
  rows.map((r) => ({ label: r.label, amounts: r.amounts.map((a, c) => (kinds ? typedFigure(a, kindOf(kinds, c)) : typedAmount(a))) }));
const typedSides = ([left, right]: readonly [EnteredRow[], EnteredRow[]]): [FormatRowDraft[], FormatRowDraft[]] => [typedRows(left), typedRows(right)];

/**
 * The answer to a long question as its input holds it: the way back from `readDraft`. An attempt keeps the answer as
 * it was checked (see `answerToKeep`); with this the Mistakes screen shows it in the input it was given in, marked.
 * `question` is the question it answers: a statement that declares the kinds of its columns has its figures written
 * back in the unit of each column, a negative one with its minus sign, and one that prints figures has nothing
 * written into their cells.
 */
export function responseDraft(response: LongResponse, question?: Question): Draft {
  switch (response.type) {
    case 'journal_set':
      return { type: 'journal_set', entries: response.entries.map((lines) => lines.map((l) => ({ accountId: l.accountId, side: l.side, amount: typedAmount(l.amount) }))) };
    case 'account':
      return { type: 'account', sides: typedSides(response.sides), below: typedSides(response.below), ...(response.later ? { later: response.later.map(typedSides) } : {}) };
    case 'statement': {
      const statement = question?.type === 'statement' ? question : undefined;
      const kinds = statement?.columnKinds;
      const figure = (value: number, c: number): string => (kinds ? typedFigure(value, kindOf(kinds, c)) : typedAmount(value));
      // A figure the statement prints was not typed: its cell is empty, in a row and in a sub-total.
      const printed = statement ? printedOf(statement) : undefined;
      const rows = (list: readonly EnteredRow[]) => typedRows(list, kinds).map((row) => withoutPrinted(row, printed));
      const lines = statement ? subtotalsOf(statement) : [];
      const subtotal = (s: number[] | null, i: number) => (s ?? []).map((value, c) => (statement && lines[i] && subtotalPrints(statement, lines[i])[c] != null ? '' : figure(value, c)));
      return {
        type: 'statement',
        rows: rows(response.rows),
        final: response.final === null ? '' : figure(response.final, 0),
        ...(response.finalLabel === undefined ? {} : { finalLabel: response.finalLabel }),
        ...(response.more ? { more: response.more.map(rows) } : {}),
        ...(response.subtotals ? { subtotals: response.subtotals.map(subtotal) } : {}),
      };
    }
  }
}

/** The answer a draft gives, or null when it gives none (empty, or not complete). */
export function draftResponse(question: Question, draft: Draft | undefined): Response | null {
  const read = readDraft(question, draft);
  return 'response' in read ? read.response : null;
}
