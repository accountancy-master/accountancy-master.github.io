import { describe, expect, it } from 'vitest';
// The registry first: it registers every real template and installs the outline of what there is.
import { getTopicPack, packsOf } from './registry';
import { courseFor, outlinesOf, stagesOf, templateOutlinesOf } from './outline';
import { CBSE11 } from './courses/cbse11';
import { ANALYSIS, CASH_FLOW, CBSE12, COMPUTERISED } from './courses/cbse12';
import { DEFAULT_PART_B, PART_B_COURSE, PART_B_TOPICS, choiceForTopics, choiceKey, choiceOf, partBOf, partBOfTopic, topicShown, topicsMeet } from './courseOptions';

const C12 = CBSE12.id;
const CAS = 'computerised-accounting';
const ANALYSIS_TOPICS = ['company-financial-statements', 'financial-statement-analysis', 'accounting-ratios', 'cash-flow-statement'];
const PART_A = CBSE12.topics.filter((t) => t.unit === 'Accounting for Partnership Firms' || t.unit === 'Accounting for Companies').map((t) => t.id);
const computerised = { class12PartB: 'computerised' } as const;

describe('Part B of Class 12, a choice of the learner', () => {
  it('has two choices, Analysis of Financial Statements by default, each with the topics of its units', () => {
    expect(DEFAULT_PART_B).toBe('analysis');
    expect(PART_B_COURSE).toBe(CBSE12.id);
    // The topics are named by id; they are those of the units of each choice in the catalogue, in its order.
    expect(PART_B_TOPICS.analysis).toEqual(CBSE12.topics.filter((t) => t.unit === ANALYSIS || t.unit === CASH_FLOW).map((t) => t.id));
    expect(PART_B_TOPICS.computerised).toEqual(CBSE12.topics.filter((t) => t.unit === COMPUTERISED).map((t) => t.id));
    expect(PART_B_TOPICS.analysis).toEqual(ANALYSIS_TOPICS);
    expect(PART_B_TOPICS.computerised).toEqual([CAS]);
    // Computerised Accounting stands last in the catalogue, so no topic before it moved.
    expect(CBSE12.topics.at(-1)!.id).toBe(CAS);
    expect(CBSE12.topics.at(-1)!.unit).toBe('Computerised Accounting');
    for (const id of ANALYSIS_TOPICS) expect(partBOfTopic(id)).toBe('analysis');
    expect(partBOfTopic(CAS)).toBe('computerised');
    for (const id of [...PART_A, ...CBSE11.topics.map((t) => t.id)]) expect(partBOfTopic(id), id).toBeUndefined();
  });

  it('reads a learner without a choice, or with one this version does not know, as the default', () => {
    expect(partBOf(undefined)).toBe('analysis');
    expect(partBOf(null)).toBe('analysis');
    expect(partBOf({})).toBe('analysis');
    expect(partBOf({ class12PartB: 'analysis' })).toBe('analysis');
    expect(partBOf(computerised)).toBe('computerised');
    expect(partBOf({ class12PartB: 'something-new' as never })).toBe('analysis');
    // One value for each choice, and the key of the default is empty.
    expect(choiceOf(undefined)).toBe(choiceOf({ class12PartB: 'analysis' }));
    expect(choiceOf({ class12PartB: 'computerised' })).toBe(choiceOf(computerised));
    expect(choiceKey({})).toBe('');
    expect(choiceKey(computerised)).toBe('computerised');
  });

  it('shows a learner the topics of the choice made and never those of the other; every other topic always', () => {
    for (const id of ANALYSIS_TOPICS) {
      expect(topicShown(id, {}), id).toBe(true);
      expect(topicShown(id, computerised), id).toBe(false);
    }
    expect(topicShown(CAS, {})).toBe(false);
    expect(topicShown(CAS, undefined)).toBe(false);
    expect(topicShown(CAS, computerised)).toBe(true);
    for (const id of [...PART_A, ...CBSE11.topics.map((t) => t.id)]) {
      expect(topicShown(id, {}), id).toBe(true);
      expect(topicShown(id, computerised), id).toBe(true);
    }
  });

  it('lets two topics meet unless they are of two different choices', () => {
    expect(topicsMeet('accounting-ratios', CAS)).toBe(false);
    expect(topicsMeet(CAS, 'cash-flow-statement')).toBe(false);
    expect(topicsMeet('accounting-ratios', 'cash-flow-statement')).toBe(true);
    expect(topicsMeet('goodwill', CAS)).toBe(true);
    expect(topicsMeet('journal-entries', CAS)).toBe(true);
    expect(choiceForTopics(['goodwill', 'accounting-ratios'])).toEqual({});
    expect(choiceForTopics(['goodwill', CAS])).toEqual(computerised);
    expect(choiceForTopics(['accounting-ratios', CAS])).toBeNull();
    expect(choiceForTopics([])).toEqual({});
  });
});

describe('a course as a learner has it', () => {
  it('lists every playable topic for scripts, and for a learner those of their choice, in course order', () => {
    const all = outlinesOf(C12).map((o) => o.topicId);
    expect(all).toEqual(packsOf(C12).map((p) => p.topicId));
    expect(all).toContain(CAS);
    expect(outlinesOf(C12, {}).map((o) => o.topicId)).toEqual(all.filter((id) => id !== CAS));
    expect(outlinesOf(C12, computerised).map((o) => o.topicId)).toEqual([...PART_A, CAS]);
    // The default view of Class 11 is the very list it always was.
    expect(outlinesOf(CBSE11.id, {})).toBe(outlinesOf(CBSE11.id));
    expect(outlinesOf(CBSE11.id, computerised)).toBe(outlinesOf(CBSE11.id));
    // Asked again, the same list.
    expect(outlinesOf(C12, computerised)).toBe(outlinesOf(C12, computerised));
  });

  it('keeps the case studies and templates of the topics the learner meets', () => {
    // The default choice has every stage of the course but the one of the option it has not taken.
    expect(stagesOf(C12, {}).map((s) => s.id)).toEqual(stagesOf(C12).map((s) => s.id).filter((id) => id !== 'computerised-accounting-cases'));
    expect(stagesOf(C12, computerised).map((s) => s.id)).toEqual(['partnership-accounts', 'reconstitution', 'dissolution', 'firm-life', 'company-accounts', 'computerised-accounting-cases']);
    expect(stagesOf(C12, {}).map((s) => s.id)).not.toContain('computerised-accounting-cases');
    expect(templateOutlinesOf(C12, {}).some((t) => t.topicId === CAS)).toBe(false);
    expect(templateOutlinesOf(C12, computerised).some((t) => ANALYSIS_TOPICS.includes(t.topicId))).toBe(false);
    expect(templateOutlinesOf(C12, computerised).filter((t) => t.topicId === CAS).length).toBeGreaterThan(30);
    expect(courseFor(C12, {})!.topics.map((t) => t.id)).toEqual(CBSE12.topics.map((t) => t.id).filter((id) => id !== CAS));
    expect(courseFor(C12, computerised)!.topics.map((t) => t.id)).toEqual([...PART_A, CAS]);
    expect(courseFor('no-such-course', {})).toBeUndefined();
  });

  it('looks back from Computerised Accounting on Part A alone, and never from Part B of the analysis on it', () => {
    const lookBack = getTopicPack(CAS)!.levels.find((l) => l.type === 'look_back')!;
    expect(lookBack.id).toBe(`${CAS}-look-back`);
    expect(lookBack.lookBack!.earlier.map((e) => e.topicId)).toEqual(PART_A);
    for (const id of ANALYSIS_TOPICS) {
      for (const level of getTopicPack(id)!.levels) expect(level.lookBack?.earlier.map((e) => e.topicId) ?? [], id).not.toContain(CAS);
    }
  });
});
