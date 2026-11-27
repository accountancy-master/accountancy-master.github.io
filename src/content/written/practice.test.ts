import { describe, expect, it } from 'vitest';
import {
  ANY_WRITTEN,
  filterFromParams,
  filterQuery,
  filterWritten,
  formatMarks,
  latestOutcomes,
  marksOutOf,
  marksSpoken,
  pointsAsked,
  writtenCounts,
  writtenHref,
  writtenMarks,
  writtenQueue,
  writtenStatus,
  type WrittenOutcome,
} from './practice';

describe('writtenMarks', () => {
  it('gives marks ÷ pointsNeeded for each point ticked, up to pointsNeeded points', () => {
    const q = { marks: 3 as const, pointsNeeded: 3 };
    expect([0, 1, 2, 3, 4, 6].map((n) => writtenMarks(q, n))).toEqual([0, 1, 2, 3, 3, 3]);
  });

  it('keeps halves', () => {
    const q = { marks: 3 as const, pointsNeeded: 6 };
    expect([1, 2, 5, 6, 8].map((n) => writtenMarks(q, n))).toEqual([0.5, 1, 2.5, 3, 3]);
    expect(writtenMarks({ marks: 1, pointsNeeded: 2 }, 1)).toBe(0.5);
    expect(writtenMarks({ marks: 6, pointsNeeded: 4 }, 3)).toBe(4.5);
  });
});

describe('the marks as written', () => {
  it('writes a half as ½', () => {
    expect([0, 0.5, 1, 2.5, 3].map(formatMarks)).toEqual(['0', '½', '1', '2½', '3']);
    expect(marksOutOf(2.5, 3)).toBe('2½ / 3');
    expect(marksSpoken(2.5, 3)).toBe('2 and a half out of 3');
    expect(marksSpoken(0.5, 1)).toBe('half a mark out of 1');
    expect(marksSpoken(3, 3)).toBe('3 out of 3');
  });

  it('says how many points are asked for, as the board does', () => {
    expect(pointsAsked({ pointsNeeded: 3 })).toBe('Any three points');
    expect(pointsAsked({ pointsNeeded: 1 })).toBe('Any one point');
    expect(pointsAsked({ pointsNeeded: 12 })).toBe('Any 12 points');
  });
});

describe('the order of a practice', () => {
  const qs = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const r = (questionId: string, marks: number, at: number, id = `${questionId}${at}`): WrittenOutcome => ({ id, questionId, marks, maxMarks: 3, at });

  it('takes the latest result of each question', () => {
    const latest = latestOutcomes([r('a', 3, 1), r('a', 1, 5), r('b', 1, 2), r('b', 3, 4)]);
    expect(latest.get('a')?.marks).toBe(1);
    expect(latest.get('b')?.marks).toBe(3);
    expect(writtenStatus(latest.get('a'))).toBe('rewrite');
    expect(writtenStatus(latest.get('b'))).toBe('full');
    expect(writtenStatus(latest.get('c'))).toBe('new');
  });

  it('puts the questions to rewrite first, then the new ones, then those at full marks', () => {
    const latest = latestOutcomes([r('e', 2, 9), r('c', 1, 3), r('a', 3, 1), r('d', 3, 0)]);
    expect(writtenQueue(qs, latest).map((q) => q.id)).toEqual(['c', 'e', 'b', 'd', 'a']);
    expect(writtenCounts(qs, latest)).toEqual({ rewrite: 2, new: 1, full: 2 });
  });

  it('clears a question once it is written at full marks', () => {
    const latest = latestOutcomes([r('c', 1, 3), r('c', 3, 7)]);
    expect(writtenQueue(qs, latest).map((q) => q.id)).toEqual(['a', 'b', 'd', 'e', 'c']);
  });
});

describe('the filters', () => {
  const qs = [
    { id: '1', form: 'distinguish' as const, marks: 3 as const },
    { id: '2', form: 'features' as const, marks: 3 as const },
    { id: '3', form: 'distinguish' as const, marks: 4 as const },
  ];

  it('narrow by form and marks', () => {
    expect(filterWritten(qs, ANY_WRITTEN).map((q) => q.id)).toEqual(['1', '2', '3']);
    expect(filterWritten(qs, { form: 'distinguish', marks: 0 }).map((q) => q.id)).toEqual(['1', '3']);
    expect(filterWritten(qs, { form: 'distinguish', marks: 3 }).map((q) => q.id)).toEqual(['1']);
    expect(filterWritten(qs, { form: '', marks: 4 }).map((q) => q.id)).toEqual(['3']);
  });

  it('travel in the address, and anything unknown there is left out', () => {
    expect(filterQuery(ANY_WRITTEN)).toBe('');
    expect(filterQuery({ form: 'features', marks: 3 })).toBe('?form=features&marks=3');
    expect(writtenHref('goodwill', { form: '', marks: 4 }, { q: 'w12-gw-001' })).toBe('/written/goodwill?marks=4&q=w12-gw-001');
    expect(filterFromParams(new URLSearchParams('form=features&marks=3'))).toEqual({ form: 'features', marks: 3 });
    expect(filterFromParams(new URLSearchParams('form=essay&marks=5'))).toEqual(ANY_WRITTEN);
  });
});
