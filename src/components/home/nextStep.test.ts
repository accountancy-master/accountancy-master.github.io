import { describe, expect, it } from 'vitest';
import { masteryNote, nextStepText } from './nextStep';

describe('nextStepText', () => {
  it('tells a new learner to start here, and why', () => {
    const t = nextStepText({ why: 'start', passed: 0, total: 12 }, 'Introduction to Accounting');
    expect(t.heading).toBe('Start here');
    expect(t.action).toBe('Start');
    expect(t.reason).toContain('The course starts with Introduction to Accounting.');
  });

  it('tells a learner part-way through a topic how far they are', () => {
    expect(nextStepText({ why: 'continue', passed: 4, total: 29 }, 'Journal Entries')).toEqual({
      heading: 'Continue',
      action: 'Continue',
      reason: 'You are part-way through Journal Entries: 4 of 29 levels passed. This is the next one.',
    });
    expect(nextStepText({ why: 'continue', passed: 0, total: 29 }, 'Journal Entries').reason).toBe('You have started Journal Entries. Pass this level to open the next one.');
  });

  it('names the next topic in course order', () => {
    const t = nextStepText({ why: 'next-topic', passed: 0, total: 10 }, 'Ledger');
    expect(t.heading).toBe('Next topic');
    expect(t.reason).toBe('Ledger is the first topic, in the order of the course, that you have not finished.');
  });
});

describe('masteryNote', () => {
  it('says what the figure measures', () => {
    expect(masteryNote(0)).toBe('Mastery 0%: how well you answer each idea. It grows with right answers and fades a little without practice.');
  });
});
