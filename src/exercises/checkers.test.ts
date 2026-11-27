import { describe, expect, it } from 'vitest';
import { getQuestion } from '@/content/registry';
import type { TrueFalseQuestion } from '@/content/types';
import { checkAnswer } from './checkers';

describe('checkAnswer', () => {
  it('checks a multiple-choice answer', () => {
    const q = getQuestion('je-q-001');
    expect(checkAnswer(q, { type: 'mcq', optionId: 'b' })).toEqual({ correct: true });
    expect(checkAnswer(q, { type: 'mcq', optionId: 'a' })).toEqual({ correct: false });
  });

  it('checks a true/false answer', () => {
    const q: TrueFalseQuestion = {
      id: 't1', topicId: 'journal-entries', conceptId: 'je-rules', difficulty: 'easy', type: 'true_false',
      prompt: 'An increase in an asset is debited.', correct: true, hints: [], explanation: '',
    };
    expect(checkAnswer(q, { type: 'true_false', value: true }).correct).toBe(true);
    expect(checkAnswer(q, { type: 'true_false', value: false }).correct).toBe(false);
  });

  it('checks a journal entry and reports the mistake', () => {
    const q = getQuestion('gen:je-asset-purchase:1:3');
    if (q.type !== 'journal_entry') throw new Error('expected a journal question');
    expect(checkAnswer(q, { type: 'journal_entry', lines: q.expected }).correct).toBe(true);
    const reversed = q.expected.map((l) => ({ ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) }));
    const r = checkAnswer(q, { type: 'journal_entry', lines: reversed });
    expect(r.correct).toBe(false);
    expect(r.mistakeCode).toBe('sidesReversed');
    expect(r.journal?.lines).toHaveLength(2);
  });

  it('rejects a response of the wrong type', () => {
    expect(() => checkAnswer(getQuestion('je-q-001'), { type: 'true_false', value: true })).toThrow(
      'Response type true_false does not match question type mcq',
    );
  });
});
