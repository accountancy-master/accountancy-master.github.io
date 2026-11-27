import { describe, expect, it } from 'vitest';
import { CASE_STAGES, TEMPLATES } from '@/generators';
import { addCounts, countTopic, courseCounts, PATTERN_GROUPS, patternGroupOf } from './contentCounts';
import { packsOf } from './registry';

describe('the content counts of a course', () => {
  for (const courseId of ['cbse-11-accountancy', 'cbse-12-accountancy']) {
    it(`count every level, card, question, pattern and case of ${courseId}, topic by topic`, () => {
      const { topics, total } = courseCounts(courseId);
      const packs = packsOf(courseId);
      expect(topics.map((t) => t.topicId)).toEqual(packs.map((p) => p.topicId));
      for (const pack of packs) {
        const c = topics.find((t) => t.topicId === pack.topicId)!.counts;
        const templates = TEMPLATES.filter((t) => t.topicId === pack.topicId);
        expect(c.levels, pack.topicId).toBe(pack.levels.length);
        expect(c.lessons).toBe(pack.levels.filter((l) => l.type === 'concept').length);
        expect(c.cards).toBe(pack.cards.length);
        expect(c.questions).toBe(pack.questions.length);
        expect(c.patterns).toBe(templates.length);
        expect(PATTERN_GROUPS.reduce((n, g) => n + c.byGroup[g], 0)).toBe(templates.length);
        expect(c.byDifficulty.easy + c.byDifficulty.medium + c.byDifficulty.complex).toBe(templates.length);
        expect(c.byGroup.formats).toBe(templates.filter((t) => t.kind === 'account' || t.kind === 'statement').length);
        expect(c.cases).toBe(CASE_STAGES.filter((s) => s.topicId === pack.topicId).reduce((n, s) => n + s.cases.length, 0));
      }
      expect(total).toEqual(addCounts(topics.map((t) => t.counts)));
      expect(total.levels).toBe(packs.reduce((n, p) => n + p.levels.length, 0));
      expect(total.patterns).toBeGreaterThan(0);
    });
  }

  it('is nothing for a course that is not known', () => {
    expect(courseCounts('nope').topics).toEqual([]);
    expect(courseCounts('nope').total.levels).toBe(0);
  });

  it('puts every kind of template in a group', () => {
    expect(patternGroupOf('journal')).toBe('entries');
    expect(patternGroupOf('journal_set')).toBe('sets');
    expect(patternGroupOf('statement')).toBe('formats');
    expect(countTopic({ levels: [], cards: [], questions: [] }, [{ kind: 'mcq', difficulty: 'easy' }], 2)).toMatchObject({ patterns: 1, cases: 2, byGroup: { choice: 1 } });
  });
});
