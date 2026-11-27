import { describe, expect, it } from 'vitest';
import { checkAnswer } from '@/exercises/checkers';
import { SAMPLE_SET, reversed, rowsOf } from '@/testing/sampleSet';
import { asDraft, draftFilled, draftResponse, readDraft, responseDraft, type Draft } from './drafts';
import { emptyRow, type JournalRow } from './journalRows';
import { checkSet, emptyNote, entryState, readSetRows, rowTotals, setProblemText, startRows } from './journalSet';

const COUNT = SAMPLE_SET.entries.length;
const blank = (): JournalRow[] => [emptyRow(), emptyRow()];
const right = (): JournalRow[][] => SAMPLE_SET.entries.map((e) => rowsOf(e.expected));
const row = (accountId: string, side: JournalRow['side'], amount: string): JournalRow => ({ accountId, side, amount });

describe('the answer to a set that an attempt kept', () => {
  it('goes back into the journal as it was typed, and reads as the same answer again', () => {
    // The second entry the wrong way round, the third left empty, and an amount with paise in the last.
    const entries = SAMPLE_SET.entries.map((e, i) => (i === 1 ? reversed(e.expected) : i === 2 ? [] : e.expected));
    entries[3] = [{ accountId: 'cash', side: 'Dr', amount: 98050 }, { accountId: 'capital', side: 'Cr', amount: 12500000 }];
    const draft = responseDraft({ type: 'journal_set', entries });
    expect(draft).toMatchObject({ type: 'journal_set', entries: [rowsOf(entries[0]).map((r) => ({ ...r, amount: '2,00,000' })), expect.anything(), [], [row('cash', 'Dr', '980.50'), row('capital', 'Cr', '1,25,000')]] });
    expect(asDraft(SAMPLE_SET, JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(draftResponse(SAMPLE_SET, draft)).toEqual({ type: 'journal_set', entries });
    // Marked again it is what it was: the same entries right, the same mistake code.
    expect(checkAnswer(SAMPLE_SET, draftResponse(SAMPLE_SET, draft)!)).toEqual(checkAnswer(SAMPLE_SET, { type: 'journal_set', entries }));
  });
});

describe('the journal of a set', () => {
  it('starts with two empty rows for every transaction, or from what was entered before', () => {
    expect(startRows(undefined, 3)).toEqual([blank(), blank(), blank()]);
    const kept = [rowsOf(SAMPLE_SET.entries[0].expected)];
    // A draft shorter than the set is filled out, a longer one cut, and an entry stored without rows gets its two.
    expect(startRows(kept, 3)).toEqual([kept[0], blank(), blank()]);
    expect(startRows([...right(), blank()], COUNT)).toEqual(right());
    expect(startRows([[], kept[0]], 2)).toEqual([blank(), kept[0]]);
  });

  it('says of each entry whether it is empty, in progress or balanced, and never whether it is right', () => {
    expect(entryState(blank())).toBe('empty');
    expect(entryState([row('cash', '', ''), emptyRow()])).toBe('progress');
    expect(entryState([row('cash', 'Dr', '500'), emptyRow()])).toBe('progress');
    expect(entryState([row('cash', 'Dr', '500'), row('capital', 'Cr', '400')])).toBe('progress');
    // Balanced, but a row begun and not finished keeps it in progress.
    expect(entryState([row('cash', 'Dr', '500'), row('capital', 'Cr', '500'), row('rent', '', '')])).toBe('progress');
    expect(entryState([row('cash', 'Dr', '500'), row('capital', 'Cr', '500'), emptyRow()])).toBe('balanced');
    // A wrong entry that balances is balanced: the journal does not give the answer away.
    expect(entryState(rowsOf(reversed(SAMPLE_SET.entries[0].expected)))).toBe('balanced');
    expect(rowTotals([row('cash', 'Dr', '1,500'), row('capital', 'Cr', '500'), row('rent', '', '900'), row('sales', 'Cr', 'x')])).toEqual({ debit: 150000, credit: 50000 });
  });

  it('reads the blocks as entries, one for each transaction, keeping apart the empty ones and those it cannot read', () => {
    const blocks = [rowsOf(SAMPLE_SET.entries[0].expected), blank(), [emptyRow(), row('rent', 'Dr', '6000'), row('cash', '', '6000')], [emptyRow(), ...rowsOf(SAMPLE_SET.entries[3].expected)]];
    const read = readSetRows(blocks, COUNT);
    expect(read.entries).toEqual([SAMPLE_SET.entries[0].expected, [], [], SAMPLE_SET.entries[3].expected]);
    expect(read.empty).toBe(1);
    expect(read.problems).toEqual([{ entry: 2, error: 'Line 3: choose Dr or Cr.' }]);
    // Blank rows are skipped, and each line remembers the row it came from.
    expect(read.rowIndex).toEqual([[0, 1], [], [], [1, 2, 3]]);
    // Blocks the set does not have are ignored, and blocks it lacks are empty.
    expect(readSetRows([...right(), right()[0]], COUNT).entries).toHaveLength(COUNT);
    expect(readSetRows([], 2)).toEqual({ entries: [[], []], rowIndex: [[], []], problems: [], empty: 2 });
  });

  it('words the problem of an entry with its number, and how many entries are still empty', () => {
    expect(setProblemText(2, 'Line 3: choose Dr or Cr.')).toBe('Entry 3, line 3: choose Dr or Cr.');
    expect(emptyNote(0)).toBeNull();
    expect(emptyNote(1)).toBe('1 entry is still empty.');
    expect(emptyNote(3)).toBe('3 entries are still empty.');
  });
});

describe('Check on a set', () => {
  it('checks at once when every entry is filled in', () => {
    const next = checkSet(right(), COUNT, false);
    expect(next).toEqual({ submit: SAMPLE_SET.entries.map((e) => e.expected), rowIndex: SAMPLE_SET.entries.map((e) => e.expected.map((_, i) => i)) });
  });

  it('stops at an entry it cannot read, and names the entry and the line', () => {
    const blocks = right();
    blocks[1] = [row('purchases', 'Dr', '40000'), row('creditor:Kiran', 'Cr', 'forty')];
    expect(checkSet(blocks, COUNT, false)).toEqual({ problem: 'Entry 2, line 2: enter a valid amount.', entry: 1 });
    // Also when the student has already been told about empty entries.
    blocks[3] = blank();
    expect(checkSet(blocks, COUNT, true)).toEqual({ problem: 'Entry 2, line 2: enter a valid amount.', entry: 1 });
    expect(checkSet([blank(), blank(), blank(), blank()], COUNT, false)).toEqual({ problem: 'Enter at least one entry.', entry: 0 });
  });

  it('says how many entries are still empty before it checks, and checks on the next press', () => {
    const blocks = right();
    blocks[2] = blank();
    blocks[3] = blank();
    expect(checkSet(blocks, COUNT, false)).toEqual({ confirm: '2 entries are still empty. Press Check again to check the journal as it is.' });
    const again = checkSet(blocks, COUNT, true);
    expect('submit' in again && again.submit).toEqual([SAMPLE_SET.entries[0].expected, SAMPLE_SET.entries[1].expected, [], []]);
    blocks[2] = rowsOf(SAMPLE_SET.entries[2].expected);
    expect(checkSet(blocks, COUNT, false)).toEqual({ confirm: '1 entry is still empty. Press Check again to check the journal as it is.' });
  });
});

describe('the draft of a set', () => {
  const draft = (entries: JournalRow[][]): Draft => ({ type: 'journal_set', entries });

  it('reads back as the right answer', () => {
    const response = draftResponse(SAMPLE_SET, draft(right()))!;
    expect(response).toEqual({ type: 'journal_set', entries: SAMPLE_SET.entries.map((e) => e.expected) });
    expect(checkAnswer(SAMPLE_SET, response).correct).toBe(true);
  });

  it('is nothing while every entry is empty, and an answer as soon as one entry can be read', () => {
    expect(draftFilled(draft([blank(), blank()]))).toBe(false);
    expect(readDraft(SAMPLE_SET, draft([blank(), blank(), blank(), blank()]))).toEqual({ empty: true });
    const one = [right()[0], blank(), blank(), blank()];
    expect(draftFilled(draft(one))).toBe(true);
    expect(readDraft(SAMPLE_SET, draft(one))).toEqual({ response: { type: 'journal_set', entries: [SAMPLE_SET.entries[0].expected, [], [], []] } });
  });

  it('marks the entries that can be read and says what is wrong with one that cannot', () => {
    const blocks = right();
    blocks[2] = [row('rent', 'Dr', '6000'), row('cash', '', '6000')];
    expect(readDraft(SAMPLE_SET, draft(blocks))).toEqual({
      response: { type: 'journal_set', entries: [SAMPLE_SET.entries[0].expected, SAMPLE_SET.entries[1].expected, [], SAMPLE_SET.entries[3].expected] },
      problem: 'Entry 3, line 2: choose Dr or Cr.',
    });
    // Nothing that can be read: there is no answer yet, only the problem.
    expect(readDraft(SAMPLE_SET, draft([blank(), blank(), blocks[2], blank()]))).toEqual({ problem: 'Entry 3, line 2: choose Dr or Cr.' });
    expect(draftResponse(SAMPLE_SET, draft([blank(), blank(), blocks[2], blank()]))).toBeNull();
  });

  it('is taken from storage only in the shape of a set', () => {
    const stored = JSON.parse(JSON.stringify(draft(right())));
    expect(asDraft(SAMPLE_SET, stored)).toEqual(stored);
    expect(asDraft(SAMPLE_SET, { type: 'journal_set', entries: 'x' })).toBeUndefined();
    expect(asDraft(SAMPLE_SET, { type: 'journal_set', entries: [[{ accountId: 'cash', side: 'Xr', amount: '5' }]] })).toBeUndefined();
    expect(asDraft(SAMPLE_SET, { type: 'journal_set', entries: [{ accountId: 'cash' }] })).toBeUndefined();
    expect(asDraft(SAMPLE_SET, { type: 'journal_entry', rows: right()[0] })).toBeUndefined();
  });
});
