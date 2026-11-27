import { describe, expect, it } from 'vitest';
import { DAY_MS } from './mastery';
import { dueByDay, isDue, scheduleReview } from './srs';

const NOW = 1_000_000_000_000;

describe('review scheduling', () => {
  it('starts in the first box, due in one day', () => {
    expect(scheduleReview(undefined, true, NOW)).toEqual({ box: 0, dueAt: NOW + DAY_MS });
  });
  it('widens the gap with each correct answer up to the last box', () => {
    let s = scheduleReview(undefined, true, NOW);
    const gaps = [3, 7, 16, 35, 35];
    for (const g of gaps) {
      const answeredAt = s.dueAt;
      s = scheduleReview(s, true, answeredAt);
      expect(s.dueAt).toBe(answeredAt + g * DAY_MS);
    }
    expect(s.box).toBe(4);
  });
  it('ignores correct answers given before the review is due', () => {
    let s = scheduleReview(undefined, true, NOW);
    const first = s;
    for (let i = 1; i <= 4; i++) s = scheduleReview(s, true, NOW + i * 10_000);
    expect(s).toEqual({ box: 0, dueAt: NOW + DAY_MS });
    expect(s).toBe(first);
  });
  it('still resets immediately on a lapse before the due time', () => {
    const s = scheduleReview({ box: 2, dueAt: NOW + 7 * DAY_MS }, false, NOW + 1000);
    expect(s).toEqual({ box: 0, dueAt: NOW + 1000 });
  });
  it('makes a lapse due immediately in the first box', () => {
    const s = scheduleReview({ box: 3, dueAt: NOW + 5 * DAY_MS }, false, NOW);
    expect(s).toEqual({ box: 0, dueAt: NOW });
    expect(isDue(s, NOW)).toBe(true);
  });
  it('is not due before its day, and never due if unseen', () => {
    expect(isDue({ box: 1, dueAt: NOW + DAY_MS }, NOW)).toBe(false);
    expect(isDue(undefined, NOW)).toBe(false);
  });
});

describe('reviews fall due by local day', () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
  const scheduled = { box: 1, dueAt: at(6, 19) };

  it('is due from the start of the day it was scheduled for', () => {
    expect(isDue(scheduled, at(6, 8))).toBe(true);
    expect(isDue(scheduled, at(6, 0, 0))).toBe(true);
    expect(isDue(scheduled, at(6, 19))).toBe(true);
    expect(isDue(scheduled, at(6, 23, 59))).toBe(true);
    expect(isDue(scheduled, at(7, 8))).toBe(true);
  });

  it('is not due on the day before', () => {
    expect(isDue(scheduled, at(5, 23, 59))).toBe(false);
    expect(isDue(scheduled, at(5, 8))).toBe(false);
    expect(dueByDay(at(6, 19), at(5, 23, 59))).toBe(false);
    expect(dueByDay(at(6, 19), at(6, 0))).toBe(true);
  });

  it('keeps a lapse due at once', () => {
    const lapse = scheduleReview({ box: 3, dueAt: at(20, 9) }, false, at(5, 12));
    expect(isDue(lapse, at(5, 12))).toBe(true);
  });

  it('counts a correct answer on the due day, before the hour, as the review: it promotes the box', () => {
    const next = scheduleReview(scheduled, true, at(6, 8));
    expect(next.box).toBe(2);
    expect(next.dueAt).toBe(at(6, 8) + 7 * DAY_MS);
    expect(isDue(next, at(6, 8))).toBe(false);
    // The day before it is still early practice and changes nothing.
    expect(scheduleReview(scheduled, true, at(5, 23, 59))).toBe(scheduled);
  });
});
