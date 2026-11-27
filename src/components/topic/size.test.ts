import { describe, expect, it } from 'vitest';
import { describeTopicSize } from './size';

describe('describeTopicSize', () => {
  it('names question types, set questions and rule cards, each in the singular for one', () => {
    expect(describeTopicSize({ generators: 35, cases: 0, questions: 62, cards: 21 })).toBe('35 question types · 62 set questions · 21 rule cards');
    expect(describeTopicSize({ generators: 1, cases: 0, questions: 1, cards: 1 })).toBe('1 question type · 1 set question · 1 rule card');
  });
  it('names the case studies of a topic that has some, after the question types', () => {
    expect(describeTopicSize({ generators: 35, cases: 6, questions: 62, cards: 21 })).toBe('35 question types · 6 case studies · 62 set questions · 21 rule cards');
    expect(describeTopicSize({ generators: 2, cases: 1, questions: 0, cards: 0 })).toBe('2 question types · 1 case study · 0 set questions · 0 rule cards');
  });
  it('never shows a developer word to a learner', () => {
    expect(describeTopicSize({ generators: 3, cases: 1, questions: 2, cards: 1 })).not.toMatch(/generator|pattern/i);
  });
});
