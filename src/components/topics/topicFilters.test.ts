import { describe, expect, it } from 'vitest';
import { deriveProgress, type Progress } from '@/learning/progress';
import { matchesFilter, matchesQuery, topicStanding, type TopicFilter, type TopicStanding } from './topicFilters';

const outline = {
  concepts: [
    { id: 'c1', topicId: 't', title: 'One' },
    { id: 'c2', topicId: 't', title: 'Two' },
  ],
  levels: [
    { id: 'l0', topicId: 't', order: 0, type: 'concept' as const, title: 'A' },
    { id: 'l1', topicId: 't', order: 1, type: 'easy_practice' as const, title: 'B' },
  ],
};

const fresh: Progress = deriveProgress([], [], 0);
const withMastery = (c1: number, passed: string[] = []): Progress => ({
  ...fresh,
  passedLevelIds: passed,
  concepts: { c1: { mastery: c1, lastAt: 0, review: { intervalDays: 1, dueAt: 0, streak: 0 } as never } },
});

const filters = (s: TopicStanding) => (['all', 'not-started', 'in-progress', 'weak', 'done'] as TopicFilter[]).filter((f) => matchesFilter(s, f));

describe('where a learner stands in a topic', () => {
  it('is not started before anything is done in it', () => {
    const s = topicStanding(outline, fresh, 0);
    expect(s).toEqual({ passed: 0, total: 2, mastery: 0, answered: 0, started: false, done: false, weak: false });
    expect(filters(s)).toEqual(['all', 'not-started']);
  });

  it('is in progress, and weak while its mastery is low, once a question is answered or a level passed', () => {
    const weak = topicStanding(outline, withMastery(30), 3);
    expect(weak).toMatchObject({ started: true, weak: true, mastery: 15 });
    expect(filters(weak)).toEqual(['all', 'in-progress', 'weak']);
    const passedOne = topicStanding(outline, withMastery(100, ['l0']), 0);
    expect(passedOne).toMatchObject({ passed: 1, mastery: 50, weak: false });
    expect(filters(passedOne)).toEqual(['all', 'in-progress']);
  });

  it('is done once every level is passed, however strong', () => {
    const done = topicStanding(outline, withMastery(10, ['l0', 'l1']), 4);
    expect(filters(done)).toEqual(['all', 'done']);
  });
});

describe('matchesQuery', () => {
  it('needs every word, in any of the texts, whatever the case and punctuation', () => {
    expect(matchesQuery('', ['Ledger'])).toBe(true);
    expect(matchesQuery('ledger post', ['Ledger', 'Posting from the journal'])).toBe(true);
    expect(matchesQuery("profit & loss", ['Trading and Profit and Loss Account'])).toBe(true);
    expect(matchesQuery('ledger cash', ['Ledger'])).toBe(false);
  });
});
