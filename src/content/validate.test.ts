import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { JOURNAL_ENTRIES } from './cbse11/journalEntries';
import type { TopicPack } from './types';
import { validatePack } from './validate';

describe('validatePack', () => {
  it('passes the journal entries pack', () => {
    expect(validatePack(JOURNAL_ENTRIES)).toEqual([]);
  });
  it('has its ladder in order, the first twelve levels being the ones the app started with', () => {
    expect(JOURNAL_ENTRIES.levels.length).toBeGreaterThanOrEqual(12);
    expect(JOURNAL_ENTRIES.levels.map((l) => l.order)).toEqual(JOURNAL_ENTRIES.levels.map((_, i) => i));
  });

  const broken = (change: (p: TopicPack) => void): string[] => {
    const copy: TopicPack = structuredClone(JOURNAL_ENTRIES);
    change(copy);
    return validatePack(copy);
  };

  it('reports a duplicate id', () => {
    expect(broken((p) => p.cards.push(p.cards[0]))).toContain(`duplicate card id ${JOURNAL_ENTRIES.cards[0].id}`);
  });
  it('reports an unknown concept', () => {
    expect(broken((p) => (p.cards[0].conceptId = 'zzz'))[0]).toMatch(/unknown concept zzz/);
  });
  it('reports an MCQ whose answer is not an option', () => {
    expect(
      broken((p) => {
        const q = p.questions[0];
        if (q.type === 'mcq') q.correct = 'z';
      })[0],
    ).toMatch(/correct answer z is not an option/);
  });
  it('reports a level pointing at a missing question or template', () => {
    expect(broken((p) => (p.levels[2].questionIds = ['missing']))[0]).toMatch(/unknown question missing/);
    expect(broken((p) => (p.levels[4].generate = { templateIds: ['nope'], count: 3 }))[0]).toMatch(/unknown template nope/);
  });
  it('reports a generated level with no templates or a non-positive count', () => {
    const msg = 'level journal-entries-level-4: generate needs at least one template and a positive count';
    expect(broken((p) => (p.levels[4].generate = { templateIds: [], count: 3 }))).toContain(msg);
    expect(broken((p) => (p.levels[4].generate = { templateIds: ['je-capital'], count: 0 }))).toContain(msg);
  });
  it('reports a lesson example that does not balance', () => {
    const errors = broken((p) => {
      const ex = p.levels[0].lesson?.find((b) => b.type === 'example');
      if (ex?.type === 'example') ex.lines[0].amount += 1;
    });
    expect(errors).toContain('level journal-entries-level-0: example "Bought furniture for ₹5,000 cash" does not balance');
  });
  it('reports a lesson example that uses an unknown account', () => {
    const errors = broken((p) => {
      const ex = p.levels[0].lesson?.find((b) => b.type === 'example');
      if (ex?.type === 'example') ex.lines[0].accountId = 'nowhere';
    });
    expect(errors).toContain('level journal-entries-level-0: example "Bought furniture for ₹5,000 cash" uses unknown account nowhere');
  });

  describe('a look-back level', () => {
    const lookBack = (over: Partial<NonNullable<TopicPack['levels'][number]['lookBack']>> = {}) => (p: TopicPack) => {
      p.levels.push({
        id: 'journal-entries-look-back',
        topicId: p.topicId,
        order: p.levels.length,
        type: 'look_back',
        title: 'Look back',
        description: 'd',
        lookBack: { templateIds: ['je-capital'], earlier: [{ topicId: 'accounting-equation', templateIds: ['ae-effect'] }], ...over },
      });
    };
    const at = 'level journal-entries-look-back';

    it('passes with templates of its own topic and of an earlier one, or of an earlier one alone', () => {
      expect(broken(lookBack())).toEqual([]);
      expect(broken(lookBack({ templateIds: [] }))).toEqual([]);
    });
    it('needs an earlier topic, and a template in each', () => {
      const msg = `${at}: look-back needs at least one earlier topic, each with a template`;
      expect(broken(lookBack({ earlier: [] }))).toContain(msg);
      expect(broken(lookBack({ earlier: [{ topicId: 'accounting-equation', templateIds: [] }] }))).toContain(msg);
    });
    it('reports a template that does not exist, its own or an earlier one, and a question of a case study', () => {
      expect(broken(lookBack({ templateIds: ['nope'] }))).toEqual([`${at}: unknown template nope`]);
      expect(broken(lookBack({ earlier: [{ topicId: 'accounting-equation', templateIds: ['ae-effect', 'gone'] }] }))).toEqual([`${at}: unknown template gone`]);
      expect(broken(lookBack({ earlier: [{ topicId: 'trial-balance', templateIds: ['case-x~1'] }] }))).toEqual([`${at}: unknown template case-x~1`]);
    });
    it('cannot look back on its own topic', () => {
      expect(broken(lookBack({ earlier: [{ topicId: 'journal-entries', templateIds: ['je-capital'] }] }))).toEqual([
        `${at}: look-back lists its own topic as an earlier one`,
      ]);
    });
    it('is the only kind of level that lists look-back templates, and always does', () => {
      const msg = 'a look-back level, and only one, lists look-back templates';
      expect(broken((p) => (p.levels[4].lookBack = { templateIds: [], earlier: [{ topicId: 'accounting-equation', templateIds: ['ae-effect'] }] }))).toEqual([
        `level journal-entries-level-4: ${msg}`,
      ]);
      expect(broken((p) => (p.levels[4].type = 'look_back'))).toEqual([`level journal-entries-level-4: ${msg}`]);
    });
  });

  describe('a case-study level', () => {
    const caseStudy = (caseIds: string[]) => (p: TopicPack) => {
      p.levels.push({ id: 'journal-entries-case-study-x', topicId: p.topicId, order: p.levels.length, type: 'case_study', title: 'Case study: X', description: 'd', cases: { caseIds } });
    };
    const at = 'level journal-entries-case-study-x';

    it('needs at least one case', () => {
      expect(broken(caseStudy([]))).toEqual([`${at}: a case-study level needs at least one case`]);
    });
    it('reports a case that does not exist', () => {
      expect(broken(caseStudy(['case-nope']))).toEqual([`${at}: unknown case case-nope`]);
    });
    it('is the only kind of level that lists cases, and always does', () => {
      const msg = 'a case-study level, and only one, lists cases';
      expect(broken((p) => (p.levels[4].cases = { caseIds: [] }))).toContain(`level journal-entries-level-4: ${msg}`);
      expect(broken((p) => (p.levels[4].type = 'case_study'))).toEqual([`level journal-entries-level-4: ${msg}`]);
    });
    it('is content enough for a level', () => {
      expect(broken(caseStudy(['case-nope'])).some((e) => e.includes('has no content'))).toBe(false);
    });
  });
});
