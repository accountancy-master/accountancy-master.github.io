import type { JournalLine } from '@/engine/journal';
import { parseRupees } from '@/lib/money-input';
import { emptyRow, isBlank, rowsToLines, type JournalRow } from './journalRows';

// The journal of a set of entries: one block of rows for every transaction. Everything the screen decides without
// drawing anything is here.

/** How far the entry of one transaction has got. It says nothing about whether the entry is right. */
export type EntryState = 'empty' | 'progress' | 'balanced';

export const ENTRY_STATE_TEXT: Record<EntryState, string> = {
  empty: 'Empty',
  progress: 'In progress',
  balanced: 'Balanced',
};

const blankEntry = (): JournalRow[] => [emptyRow(), emptyRow()];

/**
 * The rows the journal of a set starts from: what was entered before (a mock paper's draft), cut or filled out to one
 * block per transaction, or two empty rows for each.
 */
export function startRows(draft: readonly JournalRow[][] | undefined, entries: number): JournalRow[][] {
  return Array.from({ length: entries }, (_, i) => (draft?.[i]?.length ? draft[i] : blankEntry()));
}

/** The debit and credit totals of the rows that have a side and a valid amount, in paise. */
export function rowTotals(rows: readonly JournalRow[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const r of rows) {
    const paise = r.side === '' ? null : parseRupees(r.amount);
    if (paise === null) continue;
    if (r.side === 'Dr') debit += paise;
    else credit += paise;
  }
  return { debit, credit };
}

/**
 * Empty while nothing is entered; balanced once every row begun is complete and the debits equal the credits; in
 * progress in between.
 */
export function entryState(rows: readonly JournalRow[]): EntryState {
  if (rows.every(isBlank)) return 'empty';
  const { debit, credit } = rowTotals(rows);
  return rowsToLines([...rows]).ok && debit === credit && debit !== 0 ? 'balanced' : 'progress';
}

/** A problem of one entry as the journal words it: "Entry 3, line 2: choose Dr or Cr." */
export const setProblemText = (entry: number, error: string): string => `Entry ${entry + 1}, ${error.charAt(0).toLowerCase()}${error.slice(1)}`;

export interface SetRead {
  /** The lines of every entry, in the order of the set. An entry left empty, or one that cannot be read, has none. */
  entries: JournalLine[][];
  /** For every entry, the row of its block each of its lines came from (blank rows are skipped). */
  rowIndex: number[][];
  /** The entries that are begun but cannot be read, each with what is wrong in the words of the single entry. */
  problems: { entry: number; error: string }[];
  /** How many entries have nothing in them. */
  empty: number;
}

/** The blocks of a set read as entries, one per transaction. Blocks beyond the set are ignored, missing ones are empty. */
export function readSetRows(blocks: readonly JournalRow[][], entries: number): SetRead {
  const out: SetRead = { entries: [], rowIndex: [], problems: [], empty: 0 };
  for (let i = 0; i < entries; i++) {
    const rows = blocks[i] ?? [];
    const read = rows.every(isBlank) ? null : rowsToLines([...rows]);
    if (read === null) out.empty++;
    else if (!read.ok) out.problems.push({ entry: i, error: read.error });
    out.entries.push(read?.ok ? read.lines : []);
    out.rowIndex.push(read?.ok ? read.rowIndex : []);
  }
  return out;
}

/** "2 entries are still empty.", or nothing when none is. */
export function emptyNote(empty: number): string | null {
  if (empty <= 0) return null;
  return empty === 1 ? '1 entry is still empty.' : `${empty} entries are still empty.`;
}

/**
 * What pressing Check does to the journal as it stands: `problem` (an entry that cannot be read: nothing is checked
 * and the student is told which line), `confirm` (some entries are empty and the student has not been told yet: say
 * how many and check on the next press), or `submit` with the entries to check.
 */
export function checkSet(
  blocks: readonly JournalRow[][],
  entries: number,
  warnedEmpty: boolean,
): { problem: string; entry: number } | { confirm: string } | { submit: JournalLine[][]; rowIndex: number[][] } {
  const read = readSetRows(blocks, entries);
  const [first] = read.problems;
  if (first) return { problem: setProblemText(first.entry, first.error), entry: first.entry };
  if (read.empty === entries) return { problem: 'Enter at least one entry.', entry: 0 };
  const note = emptyNote(read.empty);
  if (note && !warnedEmpty) return { confirm: `${note} Press Check again to check the journal as it is.` };
  return { submit: read.entries, rowIndex: read.rowIndex };
}
