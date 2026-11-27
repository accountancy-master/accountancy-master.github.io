import type { Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { parseRupees } from '@/lib/money-input';

export interface JournalRow {
  accountId: string;
  side: Side | '';
  amount: string;
}

export const emptyRow = (): JournalRow => ({ accountId: '', side: '', amount: '' });

export const isBlank = (r: JournalRow) => r.accountId === '' && r.side === '' && r.amount.trim() === '';

export function rowsToLines(
  rows: JournalRow[],
): { ok: true; lines: JournalLine[]; rowIndex: number[] } | { ok: false; error: string } {
  const lines: JournalLine[] = [];
  const rowIndex: number[] = [];
  for (const [i, r] of rows.entries()) {
    if (isBlank(r)) continue;
    const at = `Line ${i + 1}`;
    if (r.accountId === '') return { ok: false, error: `${at}: choose an account.` };
    if (r.side === '') return { ok: false, error: `${at}: choose Dr or Cr.` };
    const amount = parseRupees(r.amount);
    if (amount === null) return { ok: false, error: `${at}: enter a valid amount.` };
    lines.push({ accountId: r.accountId, side: r.side, amount });
    rowIndex.push(i);
  }
  return lines.length === 0 ? { ok: false, error: 'Enter at least one line.' } : { ok: true, lines, rowIndex };
}

/** The totals of the debit and of the credit lines that can be read (a side chosen and a valid amount), in paise. */
export function entryTotals(rows: readonly JournalRow[]): { debit: number; credit: number } {
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
 * What pressing Check does to a single entry: `problem` (a line that cannot be read: nothing is checked), `confirm`
 * (the debits and credits differ and the student has not been told yet: say by how much, and check on the next press,
 * as a trial balance does), or `submit` with the lines.
 */
export function checkEntry(
  rows: JournalRow[],
  warned: boolean,
  say: (paise: number) => string,
): { problem: string } | { confirm: string } | { submit: JournalLine[]; rowIndex: number[] } {
  const read = rowsToLines(rows);
  if (!read.ok) return { problem: read.error };
  const { debit, credit } = entryTotals(rows);
  if (debit !== credit && !warned) {
    return { confirm: `Debits and credits differ by ${say(Math.abs(debit - credit))}. Press Check again to check the entry as it is.` };
  }
  return { submit: read.lines, rowIndex: read.rowIndex };
}
