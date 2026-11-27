import { describe, expect, it } from 'vitest';
import { checkEntry, emptyRow, rowsToLines, type JournalRow } from './journalRows';

const row = (accountId: string, side: 'Dr' | 'Cr' | '', amount: string): JournalRow => ({ accountId, side, amount });

describe('rowsToLines', () => {
  it('converts filled rows and drops blank ones, remembering which row each line came from', () => {
    const r = rowsToLines([row('furniture', 'Dr', '5,000'), emptyRow(), row('cash', 'Cr', '5000')]);
    expect(r).toEqual({
      ok: true,
      lines: [
        { accountId: 'furniture', side: 'Dr', amount: 500000 },
        { accountId: 'cash', side: 'Cr', amount: 500000 },
      ],
      rowIndex: [0, 2],
    });
  });
  it('asks for at least one row', () => {
    expect(rowsToLines([emptyRow(), emptyRow()])).toEqual({ ok: false, error: 'Enter at least one line.' });
  });
  it('reports the first incomplete row by its position', () => {
    expect(rowsToLines([row('cash', '', '500')])).toEqual({ ok: false, error: 'Line 1: choose Dr or Cr.' });
    expect(rowsToLines([row('cash', 'Dr', '500'), row('', 'Cr', '500')])).toEqual({ ok: false, error: 'Line 2: choose an account.' });
    expect(rowsToLines([row('cash', 'Dr', 'abc')])).toEqual({ ok: false, error: 'Line 1: enter a valid amount.' });
    expect(rowsToLines([row('cash', 'Dr', '')])).toEqual({ ok: false, error: 'Line 1: enter a valid amount.' });
  });
});

describe('checkEntry', () => {
  const say = (paise: number) => `₹${paise / 100}`;
  it('asks once before checking an entry whose debits and credits differ, then checks it', () => {
    const rows = [row('capital', 'Dr', '360000'), row('cash', 'Cr', '36000')];
    expect(checkEntry(rows, false, say)).toEqual({ confirm: 'Debits and credits differ by ₹324000. Press Check again to check the entry as it is.' });
    expect(checkEntry(rows, true, say)).toMatchObject({ submit: [{ accountId: 'capital' }, { accountId: 'cash' }], rowIndex: [0, 1] });
  });

  it('checks a balanced entry at once, and says what is missing from a line it cannot read', () => {
    expect(checkEntry([row('cash', 'Dr', '100'), row('capital', 'Cr', '100')], false, say)).toHaveProperty('submit');
    expect(checkEntry([row('cash', 'Dr', '100'), row('', 'Cr', '100')], false, say)).toEqual({ problem: 'Line 2: choose an account.' });
  });
});
