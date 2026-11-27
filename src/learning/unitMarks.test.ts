import { describe, expect, it } from 'vitest';
import { CBSE11 } from '@/content/courses/cbse11';
import { CBSE12 } from '@/content/courses/cbse12';
import { unitMarksOf } from './paperBlueprints';

describe('the marks of each unit in the board paper', () => {
  it('are those of the full paper, 80 in all, for units of the catalogue', () => {
    for (const course of [CBSE11, CBSE12]) {
      const marks = unitMarksOf(course.id);
      expect(Object.values(marks).reduce((a, b) => a + b, 0), course.id).toBe(80);
      const units = new Set(course.topics.map((t) => t.unit));
      for (const unit of Object.keys(marks)) expect(units.has(unit), unit).toBe(true);
    }
    expect(unitMarksOf(CBSE12.id)['Accounting for Partnership Firms']).toBe(36);
  });
});
