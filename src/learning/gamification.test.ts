import { describe, expect, it } from 'vitest';
import { currentStreak, dayDiff, dayKey, partialShare, rankFor, updateStreak, xpForAttempt } from './gamification';

describe('xp', () => {
  it('pays by difficulty, less with hints, nothing when wrong or revealed', () => {
    expect(xpForAttempt({ correct: true, difficulty: 'easy', hintsUsed: 0 })).toBe(10);
    expect(xpForAttempt({ correct: true, difficulty: 'complex', hintsUsed: 0 })).toBe(30);
    expect(xpForAttempt({ correct: true, difficulty: 'medium', hintsUsed: 1 })).toBe(15);
    expect(xpForAttempt({ correct: true, difficulty: 'medium', hintsUsed: 2 })).toBe(10);
    expect(xpForAttempt({ correct: true, difficulty: 'medium', hintsUsed: 3 })).toBe(0);
    expect(xpForAttempt({ correct: false, difficulty: 'complex', hintsUsed: 0 })).toBe(0);
  });
});

describe('partial XP for a long answer that is mostly right', () => {
  const tb = (code: string, over = {}) => ({ correct: false, difficulty: 'medium' as const, hintsUsed: 0, mistakeCode: code, ...over });

  it('pays in proportion to the parts right, once at least half are', () => {
    // A trial balance of 10 rows with 9 right: 90% of 20 XP.
    expect(xpForAttempt(tb('rows:ooooooooom'))).toBe(18);
    expect(xpForAttempt(tb('rows:oooooaaaaa'))).toBe(10);
    expect(xpForAttempt(tb('rows:ooooaaaaaa'))).toBe(0);
    // A set of 4 entries with 3 right.
    expect(xpForAttempt(tb('set:ok,ok,ok,sidesReversed', { difficulty: 'complex' }))).toBe(23);
    // An extra row takes one right row away.
    expect(xpForAttempt(tb('rows:ooooooooom;2'))).toBe(16);
  });

  it('applies the hint factor, never pays less than 1 XP, and pays only on the first answer to the question', () => {
    expect(xpForAttempt(tb('rows:ooooooooom', { hintsUsed: 1 }))).toBe(14);
    expect(xpForAttempt(tb('rows:om', { difficulty: 'easy', hintsUsed: 2 }))).toBe(3);
    expect(xpForAttempt(tb('rows:ooooooooom'), false, false)).toBe(0);
    // A short question that is wrong earns nothing, whatever its code.
    expect(xpForAttempt(tb('wrongAmount'))).toBe(0);
    expect(partialShare(tb('rows:oooooooooo'))).toBeNull();
    expect(partialShare({ correct: true, mistakeCode: undefined })).toBeNull();
    expect(partialShare(tb('rows:ooooooooom'))).toBeCloseTo(0.9);
  });
});

describe('ranks', () => {
  it('finds the rank and the next one', () => {
    expect(rankFor(0)).toEqual({ name: 'Beginner', xp: 0, next: { name: 'Bookkeeper', xp: 250 } });
    expect(rankFor(800).name).toBe('Ledger Keeper');
    expect(rankFor(99999).next).toBeUndefined();
  });
});

describe('streak', () => {
  it('builds day keys in local time', () => {
    expect(dayKey(new Date(2026, 9, 4, 23, 30).getTime())).toBe('2026-10-04');
    expect(dayDiff('2026-10-04', '2026-10-06')).toBe(2);
    expect(dayDiff('2026-02-28', '2026-03-01')).toBe(1);
  });
  it('starts, holds within a day, and grows on the next day', () => {
    let s = updateStreak({ count: 0, lastDay: null }, '2026-10-04');
    expect(s).toEqual({ count: 1, lastDay: '2026-10-04' });
    s = updateStreak(s, '2026-10-04');
    expect(s.count).toBe(1);
    s = updateStreak(s, '2026-10-05');
    expect(s.count).toBe(2);
  });
  it('forgives one missed day but not two', () => {
    const s = { count: 5, lastDay: '2026-10-04' };
    expect(updateStreak(s, '2026-10-06').count).toBe(6);
    expect(updateStreak(s, '2026-10-07').count).toBe(1);
  });
  it('shows zero once the streak has lapsed', () => {
    const s = { count: 5, lastDay: '2026-10-04' };
    expect(currentStreak(s, '2026-10-06')).toBe(5);
    expect(currentStreak(s, '2026-10-07')).toBe(0);
    expect(currentStreak({ count: 0, lastDay: null }, '2026-10-07')).toBe(0);
  });
  it('handles a backwards day without incrementing', () => {
    const s = { count: 5, lastDay: '2026-10-05' };
    expect(updateStreak(s, '2026-10-04')).toEqual({ count: 5, lastDay: '2026-10-05' });
    expect(currentStreak(s, '2026-10-04')).toBe(5);
  });
  it('counts correctly across year boundaries', () => {
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1);
    expect(updateStreak({ count: 3, lastDay: '2026-12-31' }, '2027-01-01').count).toBe(4);
  });
  it('calculates day difference for leap day correctly', () => {
    expect(dayDiff('2028-02-28', '2028-03-01')).toBe(2);
  });
});
