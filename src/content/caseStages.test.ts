import { describe, expect, it } from 'vitest';
import { CASES, CASE_STAGES, TEMPLATES, findCase } from '@/generators';
import { FORMAT_PASS_MARK } from './ladder';
import { ALL_PACKS, COURSES, PACKS, getTopicPack, packsOf, topicSize } from './registry';
import { validatePack } from './validate';

// The stages as they are: these hold while a stage has no cases, and check every stage that has some. What a stage
// with cases looks like on a fixture is in src/caseStudy.integration.test.ts.
describe('the stages of case studies and the packs they belong to', () => {
  const withCases = CASE_STAGES.filter((s) => s.cases.length > 0);
  const caseLevels = (topicId: string) => (getTopicPack(topicId)?.levels ?? []).filter((l) => l.type === 'case_study');

  it('names a topic of a course for every stage (a playable one once the stage has cases), and an id no other stage has', () => {
    const topics = new Set(COURSES.flatMap((c) => c.topics.map((t) => t.id)));
    for (const stage of CASE_STAGES) {
      expect(topics.has(stage.topicId), stage.id).toBe(true);
      expect(ALL_PACKS.some((p) => p.topicId === stage.topicId), stage.id).toBe(true);
    }
    for (const stage of withCases) expect(getTopicPack(stage.topicId), stage.id).toBeDefined();
    expect(new Set(CASE_STAGES.map((s) => s.id)).size).toBe(CASE_STAGES.length);
    // A topic may close several stages (an integrated stage beside the topic's own): they stand together, in the
    // order their levels take at the end of the topic.
    const order = CASE_STAGES.map((s) => s.topicId);
    for (const topicId of new Set(order)) {
      const at = order.flatMap((t, i) => (t === topicId ? [i] : []));
      expect(at, topicId).toEqual(at.map((_, k) => at[0] + k));
    }
  });

  it('gives every stage a concept of its own, which no author wrote into a pack and no template uses', () => {
    expect(new Set(CASE_STAGES.map((s) => s.conceptId)).size).toBe(CASE_STAGES.length);
    for (const stage of CASE_STAGES) {
      const holders = ALL_PACKS.filter((p) => p.concepts.some((c) => c.id === stage.conceptId)).map((p) => p.topicId);
      expect(holders, stage.id).toEqual(stage.cases.length > 0 ? [stage.topicId] : []);
      expect(TEMPLATES.filter((t) => t.conceptId === stage.conceptId), stage.id).toEqual([]);
    }
  });

  it("puts the concept of every stage that has cases among its topic's concepts, once, named after the stage", () => {
    for (const stage of withCases) {
      const concepts = getTopicPack(stage.topicId)!.concepts.filter((c) => c.id === stage.conceptId);
      expect(concepts, stage.id).toEqual([{ id: stage.conceptId, topicId: stage.topicId, title: `Case study: ${stage.title}` }]);
    }
  });

  it("files every case under its stage's topic and concept, with an id no other case has", () => {
    for (const stage of CASE_STAGES) {
      for (const c of stage.cases) {
        expect({ topicId: c.topicId, conceptId: c.conceptId }, c.id).toEqual({ topicId: stage.topicId, conceptId: stage.conceptId });
        expect(findCase(c.id), c.id).toBe(c);
      }
    }
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it('ends the topic of every stage that has cases with its Case study levels, one a stage, after the Look back, and adds none otherwise', () => {
    // The first topic of each course has no look-back to come before its Case study levels.
    const firsts = COURSES.map((c) => packsOf(c.id)[0]);
    for (const topicId of new Set(CASE_STAGES.map((s) => s.topicId))) {
      const pack = getTopicPack(topicId)!;
      // Every stage the topic closes that has cases, in the order of CASE_STAGES; a stage with none gives no level.
      const stages = withCases.filter((s) => s.topicId === topicId);
      const levels = stages.length === 0 ? [] : pack.levels.slice(-stages.length);
      expect(caseLevels(topicId), topicId).toEqual(levels);
      stages.forEach((stage, i) =>
        expect(levels[i], stage.id).toMatchObject({
          id: `${stage.topicId}-case-study-${stage.id}`,
          type: 'case_study',
          title: `Case study: ${stage.title}`,
          description: stage.description,
          cases: { caseIds: stage.cases.map((c) => c.id) },
        }),
      );
      if (stages.length === 0) continue;
      if (!firsts.includes(pack)) expect(pack.levels.at(-stages.length - 1)!.type, topicId).toBe('look_back');
      expect(topicSize(topicId).cases, topicId).toBe(stages.reduce((n, s) => n + s.cases.length, 0));
      expect(validatePack(pack), topicId).toEqual([]);
    }
    const staged = new Set(withCases.map((s) => s.topicId));
    for (const p of PACKS) if (!staged.has(p.topicId)) expect(caseLevels(p.topicId), p.topicId).toEqual([]);
  });

  it('keeps the levels of every topic in order, with ids no other level has', () => {
    const ids = PACKS.flatMap((p) => p.levels.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PACKS) expect(p.levels.map((l) => l.order), p.topicId).toEqual(p.levels.map((_, i) => i));
  });
});

describe('the pass mark of a Case study level', () => {
  it('is that of a format level for a stage with a chained case, and the usual one otherwise', () => {
    for (const stage of CASE_STAGES.filter((s) => s.cases.length > 0)) {
      const level = PACKS.flatMap((p) => p.levels).find((l) => l.id === `${stage.topicId}-case-study-${stage.id}`);
      const long = stage.cases.some((c) => c.parts.some((p) => ['journal_set', 'account', 'statement'].includes(p.kind)));
      expect(level?.passMark, stage.id).toBe(long ? FORMAT_PASS_MARK : undefined);
    }
  });
});
