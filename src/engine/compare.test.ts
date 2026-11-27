import { describe, expect, it } from 'vitest';
import { compareJournal } from './compare';
import type { JournalLine } from './journal';

const L = (accountId: string, side: 'Dr' | 'Cr', amount: number): JournalLine => ({ accountId, side, amount });
const expected = [L('furniture', 'Dr', 500000), L('cash', 'Cr', 500000)];

describe('compareJournal', () => {
  it('accepts the expected entry in any line order', () => {
    const r = compareJournal(expected, [expected[1], expected[0]]);
    expect(r.correct).toBe(true);
    expect(r.mistake).toBeUndefined();
  });
  it('accepts split lines that add up', () => {
    const r = compareJournal(expected, [L('furniture', 'Dr', 300000), L('furniture', 'Dr', 200000), L('cash', 'Cr', 500000)]);
    expect(r.correct).toBe(true);
  });
  it('diagnoses reversed sides', () => {
    const r = compareJournal(expected, [L('furniture', 'Cr', 500000), L('cash', 'Dr', 500000)]);
    expect(r.correct).toBe(false);
    expect(r.mistake).toBe('sidesReversed');
    expect(r.lines.map((l) => l.status)).toEqual(['sidesReversed', 'sidesReversed']);
  });
  it('diagnoses a wrong account', () => {
    const r = compareJournal(expected, [L('machinery', 'Dr', 500000), L('cash', 'Cr', 500000)]);
    expect(r.mistake).toBe('wrongAccount');
    expect(r.missing).toEqual([L('furniture', 'Dr', 500000)]);
  });
  it('diagnoses a wrong amount', () => {
    const r = compareJournal(expected, [L('furniture', 'Dr', 50000), L('cash', 'Cr', 50000)]);
    expect(r.mistake).toBe('wrongAmount');
    expect(r.lines.map((l) => l.status)).toEqual(['wrongAmount', 'wrongAmount']);
    expect(r.missing).toEqual([]);
  });
  it('diagnoses a missing line', () => {
    const r = compareJournal(expected, [L('furniture', 'Dr', 500000)]);
    expect(r.mistake).toBe('missingLine');
    expect(r.lines.map((l) => l.status)).toEqual(['correct']);
    expect(r.missing).toEqual([L('cash', 'Cr', 500000)]);
  });
  it('diagnoses an extra line', () => {
    const r = compareJournal(expected, [...expected, L('rent', 'Dr', 100)]);
    expect(r.mistake).toBe('extraLine');
    expect(r.lines.map((l) => l.status)).toEqual(['correct', 'correct', 'extraLine']);
    expect(r.missing).toEqual([]);
  });
  it('diagnoses omitted GST ahead of the amount error it causes', () => {
    const withGst = [L('purchases', 'Dr', 1000000), L('inputIGST', 'Dr', 180000), L('cash', 'Cr', 1180000)];
    const r = compareJournal(withGst, [L('purchases', 'Dr', 1000000), L('cash', 'Cr', 1000000)]);
    expect(r.mistake).toBe('gstOmitted');
  });
  it('reports one line per original row for split entries', () => {
    const given = [L('furniture', 'Dr', 300000), L('furniture', 'Dr', 200000), L('cash', 'Cr', 500000)];
    const r = compareJournal(expected, given);
    expect(r.correct).toBe(true);
    expect(r.lines).toHaveLength(3);
    expect(r.lines.every((l) => l.status === 'correct')).toBe(true);
    expect(r.lines[0].line).toEqual(given[0]);
  });
  it('separates a substitution from an extra line', () => {
    const r = compareJournal(expected, [L('machinery', 'Dr', 500000), L('cash', 'Cr', 500000), L('rent', 'Dr', 100)]);
    expect(r.lines.map((l) => l.status)).toEqual(['wrongAccount', 'correct', 'extraLine']);
    expect(r.missing).toEqual([L('furniture', 'Dr', 500000)]);
    expect(r.mistake).toBe('wrongAccount');
  });
  it('treats an omitted line plus a stray line as a wrong account', () => {
    const r = compareJournal(expected, [L('furniture', 'Dr', 500000), L('rent', 'Cr', 500000)]);
    expect(r.lines.map((l) => l.status)).toEqual(['correct', 'wrongAccount']);
    expect(r.missing).toEqual([L('cash', 'Cr', 500000)]);
    expect(r.mistake).toBe('wrongAccount');
  });
  it('diagnoses reversed sides even when the amount is also wrong', () => {
    const r = compareJournal(expected, [L('furniture', 'Cr', 50000), L('cash', 'Dr', 50000)]);
    expect(r.lines.map((l) => l.status)).toEqual(['sidesReversed', 'sidesReversed']);
    expect(r.mistake).toBe('sidesReversed');
  });
  it('handles the same account expected on both sides', () => {
    const exp = [L('cash', 'Dr', 1000), L('cash', 'Cr', 400), L('bank', 'Cr', 600)];
    const r = compareJournal(exp, [L('cash', 'Dr', 900), L('cash', 'Cr', 400), L('bank', 'Cr', 600)]);
    expect(r.lines.map((l) => l.status)).toEqual(['wrongAmount', 'correct', 'correct']);
    expect(r.mistake).toBe('wrongAmount');
  });
  it('handles an empty answer', () => {
    const r = compareJournal(expected, []);
    expect(r.correct).toBe(false);
    expect(r.lines).toEqual([]);
    expect(r.missing).toEqual(expected);
    expect(r.mistake).toBe('missingLine');
  });
  it('prefers gstOmitted over reversed sides', () => {
    const withGst = [L('purchases', 'Dr', 1000000), L('inputIGST', 'Dr', 180000), L('cash', 'Cr', 1180000)];
    const r = compareJournal(withGst, [L('purchases', 'Cr', 1000000), L('cash', 'Dr', 1000000)]);
    expect(r.mistake).toBe('gstOmitted');
  });
  it('says the amount a line should have, also on a line that is on the wrong side', () => {
    // The audit's entry: Capital Dr 3,60,000 and Cash Cr 36,000, for Cash Dr / Capital Cr 3,60,000.
    const want = [L('cash', 'Dr', 36000000), L('capital', 'Cr', 36000000)];
    const r = compareJournal(want, [L('capital', 'Dr', 36000000), L('cash', 'Cr', 3600000)]);
    expect(r.mistake).toBe('sidesReversed');
    expect(r.others).toEqual(['wrongAmount']);
    expect(r.lines.map((l) => [l.status, l.expectedAmount])).toEqual([
      ['sidesReversed', undefined],
      ['sidesReversed', 36000000],
    ]);
    const amount = compareJournal(expected, [L('furniture', 'Dr', 50000), L('cash', 'Cr', 500000)]);
    expect(amount.lines.map((l) => l.expectedAmount)).toEqual([500000, undefined]);
    expect(amount.others).toBeUndefined();
    expect(compareJournal(expected, expected).lines.every((l) => l.expectedAmount === undefined)).toBe(true);
  });
});
