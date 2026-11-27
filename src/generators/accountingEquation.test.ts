import { describe, expect, it } from 'vitest';
import { generateQuestion } from './index';

// The accounting-equation templates are the worked examples authors copy, so their output is pinned.
describe('accounting-equation templates', () => {
  it('pins ae-effect seed 1: the right option and the mistake behind each wrong one', () => {
    const q = generateQuestion('ae-effect', 1);
    if (q.type !== 'mcq') throw new Error('expected mcq');
    expect(q.prompt).toBe('A business pays shop rent of ₹5,000 for the month in cash. What happens to the accounting equation?');
    expect(q.options.find((o) => o.id === q.correct)?.text).toBe('Assets and capital both decrease by ₹5,000');
    expect(q.options.filter((o) => o.id !== q.correct).map((o) => o.why).sort()).toEqual([
      'Took rent paid as an income.',
      'Treated rent as buying an asset, so only the form of the assets changes.',
      'Treated the rent as the repayment of a liability.',
    ]);
  });

  it('pins ae-missing-item seed 4 (version 2): the answer, its working and the common errors', () => {
    const q = generateQuestion('ae-missing-item', 4);
    if (q.type !== 'numeric') throw new Error('expected numeric');
    expect(q.prompt).toBe("Hegde Computer Repairs has assets of ₹2,80,000 and liabilities of ₹80,000. What is the owner's capital?");
    expect(q.answer).toBe(20000000);
    expect(q.working).toEqual(['Assets = Liabilities + Capital, so Capital = Assets - Liabilities.', '₹2,80,000 - ₹80,000 = ₹2,00,000.']);
    expect(q.commonErrors.map((e) => e.value)).toEqual([36000000, 28000000, 8000000]);
  });

  it('serves every one of the three variants of the missing-item question', () => {
    const asked = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const q = generateQuestion('ae-missing-item', seed);
      asked.add(/owner's capital\?|liabilities\)\?|total of its assets\?/.exec(q.prompt)?.[0] ?? q.prompt);
    }
    expect(asked.size).toBe(3);
  });
});
