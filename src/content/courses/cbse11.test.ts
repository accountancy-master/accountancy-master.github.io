import { describe, expect, it } from 'vitest';
import { CBSE11 } from './cbse11';

describe('CBSE11 course', () => {
  it('has unique topic ids', () => {
    const ids = CBSE11.topics.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('lists the topics in the order of the syllabus, grouped by unit', () => {
    expect(CBSE11.topics.map((t) => [t.unit, t.id])).toEqual([
      ['Theoretical Framework', 'introduction-to-accounting'],
      ['Theoretical Framework', 'theory-base'],
      ['Accounting Process', 'accounting-equation'],
      ['Accounting Process', 'journal-entries'],
      ['Accounting Process', 'ledger'],
      ['Accounting Process', 'cash-book'],
      ['Accounting Process', 'subsidiary-books'],
      ['Accounting Process', 'bank-reconciliation'],
      ['Accounting Process', 'trial-balance'],
      ['Accounting Process', 'rectification-of-errors'],
      ['Accounting Process', 'depreciation'],
      ['Accounting Process', 'provisions-and-reserves'],
      ['Financial Statements', 'final-accounts'],
      ['Financial Statements', 'final-accounts-adjustments'],
      ['Financial Statements', 'incomplete-records'],
      ['Exam Preparation', 'mixed-case-studies'],
      ['Exam Preparation', 'mock-exams'],
    ]);
  });
  it('keeps every unit in one run, so headings never repeat', () => {
    const units = CBSE11.topics.map((t) => t.unit);
    expect(units.filter((u, i) => i === 0 || u !== units[i - 1])).toEqual([...new Set(units)]);
  });
  it('lists planned topics', () => {
    expect(CBSE11.topics.some((t) => t.status === 'planned')).toBe(true);
  });
  it('previews Class 12 topics with a label', () => {
    expect(CBSE11.previews.length).toBeGreaterThanOrEqual(10);
    expect(CBSE11.previews.every((p) => p.label === 'Class 12 – coming later')).toBe(true);
  });
});
