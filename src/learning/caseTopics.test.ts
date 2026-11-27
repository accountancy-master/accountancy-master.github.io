import { describe, expect, it } from 'vitest';
import { COURSES } from '@/content/registry';
import { CASE_STAGES } from '@/generators';
import { CASE_TOPICS, caseTopicIds, stageTopicIds, topicsLabel } from './caseTopics';

const caseIds = new Set(CASE_STAGES.flatMap((s) => s.cases.map((c) => c.id)));
const topicIds = COURSES.flatMap((c) => c.topics.map((t) => t.id));

describe('the topics a case study is about (display only)', () => {
  it('names only cases and topics that exist', () => {
    for (const [id, topics] of Object.entries(CASE_TOPICS)) {
      expect(caseIds.has(`case-${id}`), id).toBe(true);
      expect(topics.length, id).toBeGreaterThan(0);
      for (const t of topics) expect(topicIds, `${id}: ${t}`).toContain(t);
    }
  });

  it('files every case of the stages that span the partnership topics, so that Admission cases are found under Admission', () => {
    for (const stage of CASE_STAGES.filter((s) => s.id === 'reconstitution' || s.id === 'firm-life')) {
      for (const c of stage.cases) expect(CASE_TOPICS[c.id.replace(/^case-/, '')], c.id).toBeDefined();
    }
    const admission = CASE_STAGES.flatMap((s) => s.cases.filter((c) => caseTopicIds(c.id, s.topicId).includes('admission-of-a-partner')));
    expect(admission.length).toBeGreaterThan(0);
    expect(caseTopicIds('case-recon-chain-admission', 'retirement-and-death-of-a-partner')).toEqual(['admission-of-a-partner']);
  });

  it('keeps every other case with its stage topic, and never changes a stage', () => {
    const stage = CASE_STAGES.find((s) => s.id === 'accounting-cycle')!;
    expect(caseTopicIds(stage.cases[0].id, stage.topicId)).toEqual([stage.topicId]);
    expect(CASE_STAGES.find((s) => s.id === 'reconstitution')!.topicId).toBe('retirement-and-death-of-a-partner');
  });

  it('labels a stage by the topics of its cases, in course order', () => {
    const stage = CASE_STAGES.find((s) => s.id === 'reconstitution')!;
    const ids = stageTopicIds(stage, topicIds);
    expect(ids).toEqual(['goodwill', 'change-in-profit-sharing-ratio', 'admission-of-a-partner', 'retirement-and-death-of-a-partner']);
    expect(topicsLabel(['A'])).toBe('A');
    expect(topicsLabel(['A', 'B'])).toBe('A and B');
    expect(topicsLabel(['A', 'B', 'C'])).toBe('A to C');
  });
});
