import { describe, expect, it, vi } from 'vitest';
import { CBSE11 } from '@/content/courses/cbse11';
import { COURSES, packsOf } from '@/content/registry';
import type { Question } from '@/content/types';
import { CASE_STAGES, TEMPLATES, findTemplate, generateCaseQuestions, isValidSeed, parseCasePartId, parseGenId } from '@/generators';
import { outsidePapers } from '@/generators/outsidePapers';
import { levelSeed } from '@/play/seed';
import { SAMPLE_CASE, SECOND_SAMPLE_CASE } from '@/testing/sampleCase';
import {
  MAX_PAPER_NUMBER,
  MOCK_SEED_BASE,
  buildPaper,
  caseMarks,
  courseBank,
  creditMarks,
  paperKey,
  paperSeed,
  paperSteps,
  paperTitle,
  parsePaperKey,
  sectionTopics,
  theBank,
  type MockPaper,
  type PaperBank,
  type PaperRef,
} from './mockPaper';
import { BLUEPRINTS, MARK_SOURCES, MARK_VALUES, PAPER_KINDS, STAGES_OUTSIDE_PAPERS, needsTopic, questionCount } from './paperBlueprints';
import { dailySeed, practiceSeed } from './practice';

// The first stage is given the two sample cases, so there is a stage with cases whatever the real stages hold. The
// banks below are then cut from the real bank: with that stage alone, with every stage as it is, and with none.
// The stand-in keeps the module's other exports: other stages import helpers from it.
vi.mock('@/generators/cases/accounting-cycle', async (importOriginal) => {
  const { SAMPLE_CASE, SECOND_SAMPLE_CASE } = await import('@/testing/sampleCase');
  return { ...(await importOriginal<object>()), default: [SAMPLE_CASE, SECOND_SAMPLE_CASE] };
});

// These are the papers of Class 11, set from its topics; those of Class 12 are in class12Papers.test.ts.
const PACKS = packsOf(COURSES[0].id);
const BANK = theBank();
const SAMPLE_STAGE = CASE_STAGES.find((s) => s.id === 'accounting-cycle')!;
const isSet = (t: { kind: string }) => t.kind === 'journal_set';
/** A long question: a set of journal entries, or a format (an account or a statement to prepare). */
const isLong = (t: { kind: string }) => isSet(t) || t.kind === 'account' || t.kind === 'statement';
/** The bank without its sets of journal entries and its formats: what a paper holds then depends on the cases alone. */
const WORKED: PaperBank = { ...BANK, templates: BANK.templates.filter((t) => !isLong(t)) };
/** No stage has a case: every 6-mark question falls back. */
const NO_CASES: PaperBank = { ...WORKED, stages: BANK.stages.map((s) => ({ ...s, cases: [] })) };
/** Only the stage of the samples has cases. */
const ONE_STAGE: PaperBank = { ...WORKED, stages: BANK.stages.map((s) => (s.id === SAMPLE_STAGE.id ? s : { ...s, cases: [] })) };
/** No stage at all. */
const NO_STAGES: PaperBank = { ...WORKED, stages: [] };
/** Sets of entries, and no case anywhere: every 6-mark question is a set while the section has one to give. */
const SETS_NO_CASES: PaperBank = { ...BANK, stages: BANK.stages.map((s) => ({ ...s, cases: [] })) };
const BANKS: [string, PaperBank][] = [
  ['the bank as it is', BANK],
  ['without sets of entries', WORKED],
  ['one stage with cases', ONE_STAGE],
  ['no cases', NO_CASES],
  ['no stages', NO_STAGES],
  ['sets and no cases', SETS_NO_CASES],
];
/** The template a generated question was made from. */
const templateOf = (q: Question) => findTemplate(parseGenId(q.id)?.templateId ?? '');
/** An entry of a paper, as these tests tell them apart. A chained case study has sets and formats as its parts: it is a case, not one of them. */
type Dealt = { questions: Question[]; caseId?: string };
/** True for an entry of a paper that is a set of journal entries. */
const isSetEntry = (e: Dealt) => e.caseId === undefined && e.questions[0].type === 'journal_set';
/** True for an entry of a paper that is a format. */
const isFormatEntry = (e: Dealt) => e.caseId === undefined && (e.questions[0].type === 'account' || e.questions[0].type === 'statement');
/** True for an entry that is a long question whose marks are shared: a set of entries or a format. */
const isLongEntry = (e: Dealt) => isSetEntry(e) || isFormatEntry(e);

const TOPIC = 'ledger';
const REFS: PaperRef[] = [
  { kind: 'full', number: 1 },
  { kind: 'full', number: 2 },
  { kind: 'full', number: 17 },
  { kind: 'half', number: 1 },
  { kind: 'half', number: 5 },
  { kind: 'topic', topicId: TOPIC, number: 1 },
  { kind: 'topic', topicId: 'theory-base', number: 3 },
  { kind: 'topic', topicId: 'final-accounts-adjustments', number: 2 },
];

/** What a question was made from: its template (the case, for a part of a case), or its own id when authored. */
const sourceOf = (q: Question): string => {
  const gen = parseGenId(q.id);
  if (!gen) return q.id;
  return parseCasePartId(gen.templateId)?.caseId ?? gen.templateId;
};
const countBy = <T>(items: T[], key: (item: T) => string | number): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return out;
};
const marksOf = (paper: MockPaper) => paper.entries.reduce((sum, e) => sum + e.marks, 0);
/**
 * True when every topic that closes a stage has a stage with cases: then every turn of a case study has a case to
 * give, whatever stages are still empty beside them (a stage with no case is never drawn).
 */
const everyTopicHasCases = (bank: PaperBank) => bank.stages.every((s) => bank.stages.some((o) => o.topicId === s.topicId && o.cases.length > 0));

describe('the blueprints', () => {
  it('add up, section by section and in all', () => {
    for (const kind of PAPER_KINDS) {
      const blueprint = BLUEPRINTS[kind];
      expect(blueprint.kind).toBe(kind);
      for (const section of blueprint.sections) {
        const marks = MARK_VALUES.reduce((sum, value) => sum + value * section.questions[value], 0);
        expect(marks, `${kind}: ${section.title}`).toBe(section.marks);
      }
      expect(blueprint.sections.reduce((sum, s) => sum + s.marks, 0), kind).toBe(blueprint.marks);
    }
  });

  it('are the CBSE pattern for the full paper: 80 marks in 3 hours, 34 questions of 1, 3, 4 and 6 marks', () => {
    const { full } = BLUEPRINTS;
    expect({ marks: full.marks, minutes: full.minutes, questions: questionCount(full) }).toEqual({ marks: 80, minutes: 180, questions: 34 });
    const total = (value: 1 | 3 | 4 | 6) => full.sections.reduce((n, s) => n + s.questions[value], 0);
    expect([total(1), total(3), total(4), total(6)]).toEqual([20, 6, 3, 5]);
    expect(full.sections.map((s) => [s.part, s.marks])).toEqual([['A', 12], ['A', 44], ['B', 24]]);
    expect(full.sections.map((s) => s.questions)).toEqual([
      { 1: 6, 3: 2, 4: 0, 6: 0 },
      { 1: 10, 3: 2, 4: 1, 6: 4 },
      { 1: 4, 3: 2, 4: 2, 6: 1 },
    ]);
  });

  it('are 40 marks in 90 minutes for the half-yearly paper and 20 marks in 40 minutes for a topic test', () => {
    const { half, topic } = BLUEPRINTS;
    expect({ marks: half.marks, minutes: half.minutes, questions: questionCount(half) }).toEqual({ marks: 40, minutes: 90, questions: 18 });
    expect(half.sections.map((s) => s.questions)).toEqual([{ 1: 10, 3: 4, 4: 3, 6: 1 }]);
    expect({ marks: topic.marks, minutes: topic.minutes, questions: questionCount(topic) }).toEqual({ marks: 20, minutes: 40, questions: 10 });
    expect(topic.sections.map((s) => s.questions)).toEqual([{ 1: 6, 3: 2, 4: 2, 6: 0 }]);
    expect(PAPER_KINDS.filter((k) => needsTopic(BLUEPRINTS[k]))).toEqual(['topic']);
  });

  it('take their units from the course catalogue, which has the three units of the syllabus', () => {
    const [one, two, three] = BLUEPRINTS.full.sections.map((s) => sectionTopics(s, BANK, {}).map((t) => t.id));
    expect(one).toEqual(['introduction-to-accounting', 'theory-base']);
    expect(three).toEqual(['final-accounts', 'final-accounts-adjustments', 'incomplete-records']);
    expect(two).toHaveLength(10);
    // Every playable topic is in exactly one section of the full paper.
    expect([...one, ...two, ...three].sort()).toEqual(PACKS.map((p) => p.topicId).sort());
    for (const { topics, title } of BLUEPRINTS.full.sections) {
      const unit = 'unit' in topics ? topics.unit : undefined;
      expect(CBSE11.topics.some((t) => t.unit === unit), title).toBe(true);
    }
    const half = sectionTopics(BLUEPRINTS.half.sections[0], BANK, {}).map((t) => t.id);
    expect(half).toEqual(CBSE11.topics.slice(0, 8).map((t) => t.id));
    expect(half.at(-1)).toBe('bank-reconciliation');
    expect(sectionTopics(BLUEPRINTS.topic.sections[0], BANK, { topicId: TOPIC }).map((t) => t.id)).toEqual([TOPIC]);
  });

  it('ask for as many case studies in a section as it has topics that close a stage (one, however many stages it closes)', () => {
    for (const kind of PAPER_KINDS) {
      for (const section of BLUEPRINTS[kind].sections) {
        const topics = sectionTopics(section, BANK, { topicId: TOPIC }).map((t) => t.id);
        const closing = new Set(BANK.stages.filter((s) => topics.includes(s.topicId)).map((s) => s.topicId));
        expect(closing.size, `${kind}: ${section.title}`).toBe(section.questions[6]);
      }
    }
  });
});

describe('the bank', () => {
  it('holds the playable topics in course order, their templates and authored questions, and the stages', () => {
    expect(BANK.topics.map((t) => t.id)).toEqual(COURSES[0].topics.filter((t) => PACKS.some((p) => p.topicId === t.id)).map((t) => t.id));
    // The templates and the cases are held in outline (a paper is chosen before a question is made), topic by topic
    // in the order of the generators; the authored questions are those of the packs. Nothing beyond the syllabus is in
    // the bank: a paper is set in the board's pattern.
    const ofTopic = (list: readonly { id: string; topicId: string }[]) => BANK.topics.flatMap((t) => list.filter((x) => x.topicId === t.id).map((x) => x.id));
    const within = <T extends { beyondSyllabus?: string }>(list: readonly T[]) => list.filter((x) => x.beyondSyllabus === undefined);
    // Nor are the Assertion and Reason banks, which are on levels of their own.
    expect(BANK.templates.map((t) => t.id)).toEqual(ofTopic(within(TEMPLATES).filter((t) => !outsidePapers(t.id))));
    expect(BANK.topics.flatMap((t) => BANK.questionsOf(t.id))).toEqual(within(PACKS.flatMap((p) => p.questions)).filter((q) => !outsidePapers(q.id)));
    expect(TEMPLATES.filter((t) => t.beyondSyllabus !== undefined && BANK.topics.some((x) => x.id === t.topicId)).length).toBeGreaterThan(0);
    expect(BANK.questionsOf('no-such-topic')).toEqual([]);
    const outline = (stages: readonly { id: string; topicId: string; cases: { id: string; title: string; parts: unknown[] }[] }[]) =>
      stages.map((s) => ({ id: s.id, topicId: s.topicId, cases: s.cases.map((c) => ({ id: c.id, title: c.title, parts: c.parts.length })) }));
    // The stages of the course: those that end on one of its topics, but for those that stay outside the papers.
    expect(outline(BANK.stages)).toEqual(outline(CASE_STAGES.filter((s) => BANK.topics.some((t) => t.id === s.topicId) && !STAGES_OUTSIDE_PAPERS.includes(s.id))));
    const again = courseBank(COURSES[0]);
    expect({ topics: again.topics, templates: again.templates, stages: again.stages }).toEqual({ topics: BANK.topics, templates: BANK.templates, stages: BANK.stages });
    // A part of a case is never a template of the bank: a case comes whole or not at all.
    expect(BANK.templates.some((t) => parseCasePartId(t.id))).toBe(false);
  });

  it('gives every topic something for every mark value, so every paper can be set', () => {
    for (const topic of BANK.topics) {
      const mine = BANK.templates.filter((t) => t.topicId === topic.id);
      expect(mine.some((t) => t.kind === 'mcq') || BANK.questionsOf(topic.id).some((q) => q.type === 'mcq'), topic.id).toBe(true);
      expect(mine.some((t) => t.kind !== 'mcq' && (t.difficulty === 'medium' || t.difficulty === 'easy')), topic.id).toBe(true);
      expect(mine.some((t) => t.kind !== 'mcq' && (t.difficulty === 'complex' || t.difficulty === 'medium')), topic.id).toBe(true);
    }
  });
});

describe('a paper', () => {
  it('is rebuilt exactly from its kind, topic and number', () => {
    for (const [name, bank] of BANKS) {
      for (const ref of REFS) {
        const paper = buildPaper(ref, bank);
        expect(buildPaper({ ...ref }, bank), `${name} ${paperKey(ref)}`).toEqual(paper);
        expect(paper.key).toBe(paperKey(ref));
        expect(parsePaperKey(paper.key)).toEqual(ref);
      }
    }
    // The paper a learner sat is the paper they get back from its key alone.
    const sat = buildPaper({ kind: 'full', number: 3 });
    expect(buildPaper(parsePaperKey(sat.key)!).entries.map((e) => e.questions.map((q) => q.id))).toEqual(sat.entries.map((e) => e.questions.map((q) => q.id)));
  });

  it('is another paper for another number, and for another topic', () => {
    const ids = (ref: PaperRef) => buildPaper(ref).entries.flatMap((e) => e.questions.map((q) => q.id));
    for (const kind of ['full', 'half'] as const) {
      const first = ids({ kind, number: 1 });
      for (const number of [2, 3, 4]) {
        const next = ids({ kind, number });
        expect(next).not.toEqual(first);
        // Generated questions never come back: they carry seeds of the paper's own block.
        expect(next.filter((id) => id.startsWith('gen:') && first.includes(id))).toEqual([]);
      }
    }
    expect(ids({ kind: 'topic', topicId: TOPIC, number: 1 })).not.toEqual(ids({ kind: 'topic', topicId: TOPIC, number: 2 }));
    expect(ids({ kind: 'topic', topicId: TOPIC, number: 1 })).not.toEqual(ids({ kind: 'topic', topicId: 'cash-book', number: 1 }));
  });

  it('adds up to the marks of its blueprint, whatever stages have cases', () => {
    for (const [name, bank] of BANKS) {
      for (const ref of REFS) {
        const paper = buildPaper(ref, bank);
        expect(marksOf(paper), `${name} ${paper.key}`).toBe(BLUEPRINTS[ref.kind].marks);
        expect({ marks: paper.marks, minutes: paper.minutes }).toEqual({ marks: BLUEPRINTS[ref.kind].marks, minutes: BLUEPRINTS[ref.kind].minutes });
        // Section by section too.
        BLUEPRINTS[ref.kind].sections.forEach((section, i) => {
          expect(paper.entries.filter((e) => e.section === i).reduce((sum, e) => sum + e.marks, 0), `${name} ${paper.key} ${section.title}`).toBe(section.marks);
        });
      }
    }
  });

  it('has the questions its blueprint asks for when every topic that closes a stage has cases: 34 for the full paper', () => {
    // With only the sample stage's cases, a full paper still has one case study (in Unit 2); the bank as it is has
    // as many as its stages with cases allow.
    for (const ref of REFS) {
      const paper = buildPaper(ref, BANK);
      const blueprint = BLUEPRINTS[ref.kind];
      const cases = paper.entries.filter((e) => e.caseId !== undefined).length;
      // A 6-mark set of entries stands where a stage had no case, one question for one.
      const sets = paper.entries.filter((e) => e.marks === 6 && isLongEntry(e)).length;
      const asked = blueprint.sections.reduce((n, s) => n + s.questions[6], 0);
      const withCases = blueprint.sections.reduce((n, s) => {
        const topics = sectionTopics(s, BANK, ref).map((t) => t.id);
        return n + Math.min(s.questions[6], BANK.stages.filter((st) => topics.includes(st.topicId) && st.cases.length > 0).length);
      }, 0);
      // Every stage with cases gives one, but for the stage whose turn went to a set of entries.
      expect(cases, paper.key).toBeLessThanOrEqual(withCases);
      expect(cases + sets, paper.key).toBeGreaterThanOrEqual(withCases);
      expect(paper.entries, paper.key).toHaveLength(questionCount(blueprint) + (asked - cases - sets) * (MARK_SOURCES[6].fallback.count - 1));
    }
    if (everyTopicHasCases(BANK)) {
      const full = buildPaper({ kind: 'full', number: 1 });
      expect(full.entries).toHaveLength(34);
      expect(countBy(full.entries, (e) => e.marks)).toEqual({ 1: 20, 3: 6, 4: 3, 6: 5 });
    }
  });

  it('never uses a template, an authored question or a case twice, nor a question id', () => {
    for (const [name, bank] of BANKS) {
      for (const ref of REFS) {
        const paper = buildPaper(ref, bank);
        const sources = paper.entries.map((e) => sourceOf(e.questions[0]));
        expect(new Set(sources).size, `${name} ${paper.key}`).toBe(sources.length);
        const ids = paper.entries.flatMap((e) => e.questions.map((q) => q.id));
        expect(new Set(ids).size, `${name} ${paper.key}`).toBe(ids.length);
      }
    }
  });

  it('takes each mark value from its own kind of question', () => {
    for (const [name, bank] of BANKS) {
      for (const ref of REFS) {
        const paper = buildPaper(ref, bank);
        for (const entry of paper.entries) {
          const where = `${name} ${paper.key} Q${entry.number}`;
          const [q] = entry.questions;
          const template = findTemplate(parseGenId(q.id)?.templateId ?? '');
          expect(entry.questions.every((x) => x.topicId === entry.topicId), where).toBe(true);
          if (isFormatEntry(entry)) {
            // A format: one question, of a difficulty its marks take.
            expect(entry.questions, where).toHaveLength(1);
            expect(entry.caseId, where).toBeUndefined();
            expect(['account', 'statement'], where).toContain(template?.kind);
            expect(MARK_SOURCES[entry.marks as 4 | 6].formats, where).toContain(q.difficulty);
            continue;
          }
          if (isSetEntry(entry)) {
            // A set of entries: one question, of the difficulty (so the length) its marks call for.
            expect(entry.questions, where).toHaveLength(1);
            expect(entry.caseId, where).toBeUndefined();
            expect(template?.kind, where).toBe('journal_set');
            expect(q.difficulty, where).toBe(MARK_SOURCES[entry.marks as 3 | 4 | 6].sets);
            continue;
          }
          if (entry.marks === 6) {
            // One whole case, in its own order, from one seed, of a stage of the section's topics.
            const stage = bank.stages.find((s) => s.cases.some((c) => c.id === entry.caseId))!;
            expect(stage.topicId, where).toBe(entry.topicId);
            expect(entry.caseTitle, where).toBe(stage.cases.find((c) => c.id === entry.caseId)!.title);
            expect(entry.questions, where).toEqual(generateCaseQuestions(entry.caseId!, parseGenId(q.id)!.seed));
            continue;
          }
          expect(entry.questions, where).toHaveLength(1);
          expect(entry.caseId, where).toBeUndefined();
          expect(q.context, where).toBeUndefined();
          if (entry.marks === 1) {
            expect(['mcq', 'true_false'], where).toContain(q.type);
            if (template) expect(template.kind, where).toBe('mcq');
            continue;
          }
          // 3 and 4 marks: a generated worked question, of the first difficulty the topic has.
          expect(['numeric', 'journal'], where).toContain(template?.kind);
          const [wanted, otherwise] = MARK_SOURCES[entry.marks as 3 | 4].difficulties;
          const has = bank.templates.some((t) => t.topicId === entry.topicId && t.kind !== 'mcq' && !isLong(t) && t.difficulty === wanted);
          expect(q.difficulty, where).toBe(has ? wanted : otherwise);
        }
      }
    }
  });

  it('gives a medium question for 3 marks and a complex one for 4, and the next difficulty down where a topic has none', () => {
    const paper = buildPaper({ kind: 'full', number: 4 }, WORKED);
    expect(new Set(paper.entries.filter((e) => e.marks === 3).map((e) => e.questions[0].difficulty))).toEqual(new Set(['medium']));
    expect(new Set(paper.entries.filter((e) => e.marks === 4).map((e) => e.questions[0].difficulty))).toEqual(new Set(['complex']));
    // A bank in which one topic has no complex worked question, and one in which it has only easy ones.
    const keep = (allowed: string[]): PaperBank => ({
      ...WORKED,
      templates: WORKED.templates.filter((t) => t.topicId !== TOPIC || t.kind === 'mcq' || allowed.includes(t.difficulty)),
    });
    const lean = keep(['easy', 'medium']);
    const leaner = keep(['easy']);
    const test = buildPaper({ kind: 'topic', topicId: TOPIC, number: 1 }, lean);
    expect(new Set(test.entries.filter((e) => e.marks === 4).map((e) => e.questions[0].difficulty))).toEqual(new Set(['medium']));
    // With only easy ones, the 3-mark questions are easy, and there is nothing a 4-mark question may be made from.
    expect(() => buildPaper({ kind: 'topic', topicId: TOPIC, number: 1 }, leaner)).toThrow(/no 4-mark question/);
  });

  it('spreads the questions of a section over its topics: none gets one more until every topic has had as many', () => {
    for (const [name, bank] of BANKS) {
      for (const number of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const kind of ['full', 'half'] as const) {
          const paper = buildPaper({ kind, number }, bank);
          BLUEPRINTS[kind].sections.forEach((section, i) => {
            const topics = sectionTopics(section, bank, {}).map((t) => t.id);
            const counts = countBy(paper.entries.filter((e) => e.section === i), (e) => e.topicId);
            const perTopic = topics.map((t) => counts[t] ?? 0);
            const where = `${name} ${paper.key} ${section.title}`;
            expect(Object.keys(counts).every((t) => topics.includes(t)), where).toBe(true);
            expect(Math.min(...perTopic), where).toBeGreaterThanOrEqual(1);
            expect(Math.max(...perTopic) - Math.min(...perTopic), where).toBeLessThanOrEqual(1);
          });
        }
      }
    }
  });

  it('lets the topics with more to give have the questions left over more often, without starving the others', () => {
    // The half-yearly paper with no case study: nineteen questions for eight topics. Each topic has two, and the
    // three left over (4-mark questions, dealt last) go to three topics as a third.
    const topics = sectionTopics(BLUEPRINTS.half.sections[0], NO_STAGES, {}).map((t) => t.id);
    const third: Record<string, number> = Object.fromEntries(topics.map((t) => [t, 0]));
    const PAPERS = 200;
    for (let number = 1; number <= PAPERS; number++) {
      const counts = countBy(buildPaper({ kind: 'half', number }, NO_STAGES).entries, (e) => e.topicId);
      for (const t of topics) if (counts[t] > 2) third[t]++;
    }
    expect(Object.values(third).reduce((a, b) => a + b, 0)).toBe(3 * PAPERS);
    // Nobody is starved: every topic gets a third question in some of the papers.
    for (const t of topics) expect(third[t], t).toBeGreaterThan(PAPERS / 10);
    // They go by how many complex worked templates a topic has: the topic with the most gets a third question far
    // more often than the topic with the fewest.
    const complex = (t: string) => NO_STAGES.templates.filter((x) => x.topicId === t && x.kind !== 'mcq' && x.difficulty === 'complex').length;
    const bySize = [...topics].sort((a, b) => complex(b) - complex(a));
    expect(complex(bySize[0])).toBeGreaterThan(2 * complex(bySize.at(-1)!));
    expect(third[bySize[0]]).toBeGreaterThan(1.5 * third[bySize.at(-1)!]);
  });

  it('falls back to two 3-mark questions for a stage that has no cases, so the paper still adds up', () => {
    // No cases anywhere: five case studies become ten 3-mark questions.
    for (const bank of [NO_CASES, NO_STAGES]) {
      const full = buildPaper({ kind: 'full', number: 1 }, bank);
      expect(full.entries.some((e) => e.caseId !== undefined || e.marks === 6)).toBe(false);
      expect(countBy(full.entries, (e) => e.marks)).toEqual({ 1: 20, 3: 6 + 5 * 2, 4: 3 });
      expect(full.entries).toHaveLength(34 + 5);
      expect(marksOf(full)).toBe(80);
      // Each section keeps its own marks: the two questions stand in the section of the case they replace.
      expect(BLUEPRINTS.full.sections.map((_, i) => full.entries.filter((e) => e.section === i && e.marks === 3).length)).toEqual([2, 2 + 4 * 2, 2 + 2]);
      const half = buildPaper({ kind: 'half', number: 1 }, bank);
      expect(countBy(half.entries, (e) => e.marks)).toEqual({ 1: 10, 3: 4 + 2, 4: 3 });
      expect(marksOf(half)).toBe(40);
    }
    // One stage with cases, in Unit 2. A stage with none is never drawn, so that stage takes the unit's turns while
    // it has a case to give: its two cases, and the other two turns of the unit and the one of Unit 3 fall back.
    const full = buildPaper({ kind: 'full', number: 1 }, ONE_STAGE);
    const cases = full.entries.filter((e) => e.caseId !== undefined);
    expect(cases.map((e) => [e.marks, e.section, e.topicId])).toEqual([[6, 1, SAMPLE_STAGE.topicId], [6, 1, SAMPLE_STAGE.topicId]]);
    expect(cases.map((e) => e.caseId).sort()).toEqual([SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id].sort());
    expect(countBy(full.entries, (e) => e.marks)).toEqual({ 1: 20, 3: 6 + 3 * 2, 4: 3, 6: 2 });
    expect(marksOf(full)).toBe(80);
  });

  describe('with sets of journal entries', () => {
    const JE = 'journal-entries';
    const setsOf = (bank: PaperBank, difficulty: string) => bank.templates.filter((t) => isSet(t) && t.difficulty === difficulty).map((t) => t.id);
    const setsOn = (paper: MockPaper) => paper.entries.filter(isSetEntry);
    const idOf = (e: { questions: Question[] }) => templateOf(e.questions[0])!.id;

    it('has them in the bank: easy ones for 3 marks, medium ones for 4, complex ones for 6', () => {
      expect(MARK_SOURCES[3].sets).toBe('easy');
      expect(MARK_SOURCES[4].sets).toBe('medium');
      expect(MARK_SOURCES[6].sets).toBe('complex');
      for (const d of ['easy', 'medium', 'complex']) expect(setsOf(BANK, d).length, d).toBeGreaterThan(0);
    });

    it('asks a set as a 3-, 4- or 6-mark question of its own topic, by its difficulty, and still adds up', () => {
      const seen = new Set<number>();
      for (let number = 1; number <= 60; number++) {
        // The full paper is built without cases, so that it has 6-mark sets whatever cases the stages come to hold.
        for (const ref of [{ kind: 'topic', topicId: JE, number }, { kind: 'full', number }, { kind: 'half', number }] as PaperRef[]) {
          const paper = buildPaper(ref, ref.kind === 'full' ? SETS_NO_CASES : BANK);
          expect(marksOf(paper), paper.key).toBe(BLUEPRINTS[ref.kind].marks);
          for (const e of setsOn(paper)) {
            seen.add(e.marks);
            const t = templateOf(e.questions[0])!;
            expect(t.difficulty, paper.key).toBe(MARK_SOURCES[e.marks as 3 | 4 | 6].sets);
            expect(e.topicId, paper.key).toBe(t.topicId);
            expect(e.questions[0].id, paper.key).toMatch(/^gen:/);
          }
        }
      }
      // Over sixty papers of each kind, sets turn up at every mark value.
      expect([...seen].sort()).toEqual([3, 4, 6]);
    });

    it('puts a 6-mark set where a stage has no case, one from a topic, and falls back to two 3-mark questions after that', () => {
      for (let number = 1; number <= 12; number++) {
        const full = buildPaper({ kind: 'full', number }, SETS_NO_CASES);
        const sixes = full.entries.filter((e) => e.marks === 6);
        // No case anywhere, so every 6-mark question is a set or a format, and no topic gives two of them.
        expect(sixes.every(isLongEntry), full.key).toBe(true);
        expect(new Set(sixes.map((e) => e.topicId)).size, full.key).toBe(sixes.length);
        expect(sixes.length, full.key).toBeGreaterThanOrEqual(1);
        BLUEPRINTS.full.sections.forEach((section, i) => {
          const topics = sectionTopics(section, SETS_NO_CASES, {}).map((t) => t.id);
          const able = topics.filter((t) => SETS_NO_CASES.templates.some((x) => x.topicId === t && isLong(x) && x.difficulty === 'complex')).length;
          const here = sixes.filter((e) => e.section === i);
          expect(here.length, `${full.key} ${section.title}`).toBe(Math.min(section.questions[6], able));
          // What is left of the section's 6-mark questions became two 3-mark questions each, so the section adds up.
          const threes = full.entries.filter((e) => e.section === i && e.marks === 3).length;
          expect(threes, `${full.key} ${section.title}`).toBe(section.questions[3] + (section.questions[6] - here.length) * MARK_SOURCES[6].fallback.count);
          expect(full.entries.filter((e) => e.section === i).reduce((sum, e) => sum + e.marks, 0)).toBe(section.marks);
        });
        expect(marksOf(full), full.key).toBe(80);
      }
    });

    it('gives the last 6-mark question of a section that has several to a set, and leaves the others to the case studies', () => {
      // Holds while every topic that closes a stage has a case: then nothing falls back, and what a set takes is the
      // place of a case. The stages with no case yet take no turn.
      const ALL_CASES = BANK;
      if (!everyTopicHasCases(ALL_CASES)) return;
      const withCases = ALL_CASES.stages.filter((s) => s.cases.length > 0);
      /** The stages that waited in a section with several 6-mark questions, where the set takes the last turn. */
      const skipped = new Set<string>();
      /** The stages of those sections. */
      const several = new Set<string>();
      // Sixty papers: a favoured stage goes first on two papers of three, so the others' turns come round more slowly.
      for (let number = 1; number <= 60; number++) {
        for (const kind of ['full', 'half'] as const) {
          const paper = buildPaper({ kind, number }, ALL_CASES);
          BLUEPRINTS[kind].sections.forEach((section, i) => {
            const where = `${paper.key} ${section.title}`;
            const topics = sectionTopics(section, ALL_CASES, {}).map((t) => t.id);
            const sixes = paper.entries.filter((e) => e.section === i && e.marks === 6);
            const able = topics.some((t) => ALL_CASES.templates.some((x) => x.topicId === t && isLong(x) && x.difficulty === 'complex'));
            const sets = sixes.filter(isLongEntry);
            expect(sixes, where).toHaveLength(section.questions[6]);
            expect(sets, where).toHaveLength(section.questions[6] > 1 && able ? 1 : 0);
            // The set stands last, after the cases, as it was dealt.
            if (sets.length > 0) expect(sixes.at(-1), where).toBe(sets[0]);
            const stagesHere = withCases.filter((s) => topics.includes(s.topicId));
            // Stage by stage: a topic that closes several stages may give a case of one and not of the other.
            const gave = new Set(sixes.filter((e) => e.caseId !== undefined).map((e) => withCases.find((s) => s.cases.some((c) => c.id === e.caseId))!.id));
            // A section of one 6-mark question has no set to give way to: there the stages simply take turns (a topic
            // that closes two stages, or two topics with stages, leave one waiting on every paper).
            if (section.questions[6] < 2) return;
            for (const s of stagesHere) {
              several.add(s.id);
              if (!gave.has(s.id)) skipped.add(s.id);
            }
          });
          expect(marksOf(paper), paper.key).toBe(BLUEPRINTS[kind].marks);
        }
      }
      // The stage that waits is another from paper to paper: over these papers each stage of a section that has several
      // 6-mark questions has waited, the favoured ones too.
      const unit = sectionTopics(BLUEPRINTS.full.sections[1], ALL_CASES, {}).map((t) => t.id);
      expect([...several].sort()).toEqual(withCases.filter((s) => unit.includes(s.topicId)).map((s) => s.id).sort());
      expect([...skipped].sort()).toEqual([...several].sort());
    });

    it('asks a format as a 4- or 6-mark question of its own topic, by its difficulty, and no blueprint changes its totals', () => {
      expect(MARK_SOURCES[4].formats).toEqual(['easy', 'medium']);
      expect(MARK_SOURCES[6].formats).toEqual(['complex']);
      const formats = BANK.templates.filter((t) => t.kind === 'account' || t.kind === 'statement');
      expect(new Set(formats.map((t) => t.kind))).toEqual(new Set(['account', 'statement']));
      const seen = new Set<string>();
      for (let number = 1; number <= 40; number++) {
        for (const ref of [{ kind: 'topic', topicId: TOPIC, number }, { kind: 'topic', topicId: 'trial-balance', number }, { kind: 'full', number }, { kind: 'half', number }] as PaperRef[]) {
          const paper = buildPaper(ref, ref.kind === 'full' ? SETS_NO_CASES : BANK);
          expect(marksOf(paper), paper.key).toBe(BLUEPRINTS[ref.kind].marks);
          expect(paper.entries.filter((e) => e.marks === 6 && isLongEntry(e)).map((e) => e.topicId), paper.key).toEqual([
            ...new Set(paper.entries.filter((e) => e.marks === 6 && isLongEntry(e)).map((e) => e.topicId)),
          ]);
          for (const e of paper.entries.filter(isFormatEntry)) {
            const t = templateOf(e.questions[0])!;
            seen.add(`${e.questions[0].type} ${e.marks}`);
            expect([4, 6], paper.key).toContain(e.marks);
            expect(MARK_SOURCES[e.marks as 4 | 6].formats, paper.key).toContain(t.difficulty);
            expect(e.topicId, paper.key).toBe(t.topicId);
          }
        }
      }
      // Over these papers both kinds of format turn up, at 4 marks and at 6.
      expect([...seen].sort()).toEqual(['account 4', 'account 6', 'statement 4', 'statement 6']);
    });

    it('is one step of the paper, numbered like any single question', () => {
      const paper = Array.from({ length: 60 }, (_, i) => buildPaper({ kind: 'topic', topicId: JE, number: i + 1 })).find((p) => setsOn(p).length > 0)!;
      const [entry] = setsOn(paper);
      const steps = paperSteps(paper).filter((s) => s.entry === entry);
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({ label: String(entry.number), question: entry.questions[0] });
      expect(steps[0].part).toBeUndefined();
      expect(idOf(entry)).toMatch(/^je-set-/);
    });
  });

  it('takes the cases of a stage in turn from one paper to the next', () => {
    const caseOfPaper = (number: number) => buildPaper({ kind: 'full', number }, ONE_STAGE).entries.find((e) => e.caseId !== undefined)!.caseId;
    expect([1, 2, 3, 4].map(caseOfPaper)).toEqual([SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id, SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id]);
  });

  it('is ordered as in the examination and numbered from 1: part by part, and within a part by marks', () => {
    for (const [name, bank] of BANKS) {
      for (const ref of REFS) {
        const paper = buildPaper(ref, bank);
        const where = `${name} ${paper.key}`;
        expect(paper.entries.map((e) => e.number), where).toEqual(paper.entries.map((_, i) => i + 1));
        const parts = [...new Set(BLUEPRINTS[ref.kind].sections.map((s) => s.part))];
        const rank = paper.entries.map((e) => parts.indexOf(e.part) * 10 + e.marks);
        expect(rank, where).toEqual([...rank].sort((a, b) => a - b));
        // Every entry stands in the part of its section.
        for (const e of paper.entries) expect(e.part, where).toBe(BLUEPRINTS[ref.kind].sections[e.section].part);
      }
    }
    const full = buildPaper({ kind: 'full', number: 1 }, ONE_STAGE);
    expect(full.entries.map((e) => `${e.part}${e.marks}`).join(' ')).toMatch(/^(A1 )+(A3 )+(A4 )+(A6 )+(B1 )+(B3 )+B4( B4)*$/);
    expect(buildPaper({ kind: 'half', number: 1 }).entries.every((e) => e.part === undefined)).toBe(true);
  });

  it('numbers the questions of a case as parts (a), (b), ... of one question', () => {
    const paper = buildPaper({ kind: 'full', number: 1 }, ONE_STAGE);
    const steps = paperSteps(paper);
    expect(steps.map((s) => s.index)).toEqual(steps.map((_, i) => i));
    expect(steps.map((s) => s.question)).toEqual(paper.entries.flatMap((e) => e.questions));
    const withParts = paper.entries.filter((e) => e.caseId !== undefined);
    expect(withParts.length).toBeGreaterThan(0);
    for (const entry of withParts) {
      const parts = steps.filter((s) => s.entry === entry);
      expect(parts.map((s) => s.label)).toEqual(entry.questions.map((_, i) => `${entry.number}(${'abcdefgh'[i]})`));
      expect(parts.map((s) => s.part)).toEqual(entry.questions.map((_, i) => i));
    }
    const single = steps.filter((s) => s.entry.caseId === undefined);
    expect(single.map((s) => s.label)).toEqual(single.map((s) => String(s.entry.number)));
    expect(single.every((s) => s.part === undefined)).toBe(true);
    // One step for every single question, and one for every part of a case.
    expect(steps).toHaveLength(paper.entries.length - withParts.length + withParts.reduce((n, e) => n + e.questions.length, 0));
  });

  it('is titled by its kind, its number and its topic', () => {
    expect(paperTitle({ kind: 'full', number: 3 })).toBe('Full paper 3');
    expect(paperTitle({ kind: 'half', number: 1 })).toBe('Half-yearly paper 1');
    expect(buildPaper({ kind: 'topic', topicId: TOPIC, number: 2 }).title).toBe(`Topic test 2: ${BANK.topics.find((t) => t.id === TOPIC)!.title}`);
  });

  it('cannot be built for a number, a topic or a kind that does not exist', () => {
    expect(() => buildPaper({ kind: 'full', number: 0 })).toThrow();
    expect(() => buildPaper({ kind: 'full', number: 1.5 })).toThrow();
    expect(() => buildPaper({ kind: 'full', number: MAX_PAPER_NUMBER + 1 })).toThrow();
    expect(() => buildPaper({ kind: 'topic', number: 1 })).toThrow();
    expect(() => buildPaper({ kind: 'topic', topicId: 'no-such-topic', number: 1 })).toThrow();
    expect(() => buildPaper({ kind: 'full', topicId: TOPIC, number: 1 })).toThrow();
    expect(() => buildPaper({ kind: 'weekly' as never, number: 1 })).toThrow();
  });
});

describe('the marks of a case', () => {
  it('are its marks times the share of its questions that are right, to the nearest half mark', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((right) => caseMarks(6, right, 6))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Seven questions: 6/7 of a mark each.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((right) => caseMarks(6, right, 7))).toEqual([0, 1, 1.5, 2.5, 3.5, 4.5, 5, 6]);
    expect([0, 1, 2, 3, 4].map((right) => caseMarks(6, right, 4))).toEqual([0, 1.5, 3, 4.5, 6]);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((right) => caseMarks(6, right, 8))).toEqual([0, 1, 1.5, 2.5, 3, 4, 4.5, 5.5, 6]);
    expect(caseMarks(6, 0, 0)).toBe(0);
  });

  const credit = (right: number, total = 1) => ({ right, total });

  it('are, from the credit of each question, its marks times the average credit: the same marks while every question is right or wrong', () => {
    for (let parts = 1; parts <= 8; parts++) {
      for (let right = 0; right <= parts; right++) {
        const credits = Array.from({ length: parts }, (_, i) => credit(i < right ? 1 : 0));
        expect(creditMarks(6, credits), `${right} of ${parts}`).toBe(caseMarks(6, right, parts));
      }
    }
    expect(creditMarks(6, [])).toBe(0);
  });

  it('give a long question of a chained case as much of its share as it has right, each question weighing the same', () => {
    expect(creditMarks(6, [credit(7, 7), credit(8, 8), credit(9, 9)])).toBe(6);
    expect(creditMarks(6, [credit(0, 7), credit(0, 8), credit(0, 9)])).toBe(0);
    // 6 x (6/7 + 1 + 1) / 3 = 5.71, so 5.5.
    expect(creditMarks(6, [credit(6, 7), credit(8, 8), credit(9, 9)])).toBe(5.5);
    // 6 x (1 + 1/2 + 0) / 3 = 3.
    expect(creditMarks(6, [credit(7, 7), credit(4, 8), credit(0, 9)])).toBe(3);
    // Half of a short account counts as much as half of a long one: 6 x (1/2 + 1) / 2 = 4.5.
    expect(creditMarks(6, [credit(1, 2), credit(10, 10)])).toBe(4.5);
    expect(creditMarks(6, [credit(2, 2), credit(5, 10)])).toBe(4.5);
    // A short question beside a long one is 1 or 0 of its share.
    expect(creditMarks(6, [credit(1), credit(3, 6)])).toBe(4.5);
    expect(creditMarks(6, [credit(0), credit(3, 6)])).toBe(1.5);
  });

  it('round to the nearest half mark exactly, a quarter going up, whatever the fractions', () => {
    // 6 x (7/8 + 2) / 3 = 5.75 and 6 x (5/8 + 2) / 3 = 5.25.
    expect(creditMarks(6, [credit(7, 8), credit(1), credit(1)])).toBe(6);
    expect(creditMarks(6, [credit(5, 8), credit(1), credit(1)])).toBe(5.5);
    // 6 x (1/8) / 3 = 0.25, and 6 x (1/24) / 3 is under a quarter.
    expect(creditMarks(6, [credit(1, 8), credit(0), credit(0)])).toBe(0.5);
    expect(creditMarks(6, [credit(1, 24), credit(0), credit(0)])).toBe(0);
    // Thirds add up to what they are: three parts a third right each are a third of the marks.
    expect(creditMarks(6, [credit(1, 3), credit(1, 3), credit(1, 3)])).toBe(2);
    expect(creditMarks(6, [credit(2, 3), credit(2, 6), credit(3, 9), credit(1, 3), credit(1, 3)])).toBe(2.5);
    // Sevenths and elevenths: 6 x (3/7 + 5/11 + 1) / 3 = 3.77, so 4; with 4/11, 3.58, so 3.5.
    expect(creditMarks(6, [credit(3, 7), credit(5, 11), credit(13, 13)])).toBe(4);
    expect(creditMarks(6, [credit(3, 7), credit(4, 11), credit(13, 13)])).toBe(3.5);
    // A credit is never more than the whole of its share, nor less than none of it.
    expect(creditMarks(6, [credit(9, 7), credit(-1, 3)])).toBe(3);
  });
});

describe('the seeds of a paper', () => {
  it('lie in a range of their own, above the levels, the practice sessions and the daily challenge', () => {
    const lowest = paperSeed({ kind: 'full', number: 1 });
    expect(lowest).toBeGreaterThan(MOCK_SEED_BASE);
    expect(levelSeed(999, 9999) + 99).toBeLessThan(lowest);
    for (const kind of ['smart', 'fresh', 'mistakes', 'cards', 'daily_challenge', 'daily_mission', 'case'] as const) {
      expect(practiceSeed(kind, 9999) + 99, kind).toBeLessThan(lowest);
    }
    // The daily challenge moves up by 100 a day: it stays below for the next two thousand years.
    expect(dailySeed('3999-12-31') + 99).toBeLessThan(lowest);
    // And everything stays inside 32 bits, where a seed still gives a stream of its own.
    const highest = paperSeed({ kind: 'topic', topicId: BANK.topics.at(-1)!.id, number: MAX_PAPER_NUMBER }) + 99;
    expect(highest).toBeLessThan(2 ** 32);
    expect(isValidSeed(highest)).toBe(true);
  });

  it('give every paper a block of 100 that no other paper shares', () => {
    const starts: number[] = [];
    for (const number of [1, 2, 3, 500, MAX_PAPER_NUMBER]) {
      starts.push(paperSeed({ kind: 'full', number }), paperSeed({ kind: 'half', number }));
      for (const topic of BANK.topics) starts.push(paperSeed({ kind: 'topic', topicId: topic.id, number }));
    }
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(100);
  });

  it('are the seeds of every generated question on the paper, each used once', () => {
    for (const ref of REFS) {
      const paper = buildPaper(ref);
      const base = paperSeed(ref);
      const seeds = paper.entries.flatMap((e) => (parseGenId(e.questions[0].id) ? [parseGenId(e.questions[0].id)!.seed] : []));
      expect(new Set(seeds).size, paper.key).toBe(seeds.length);
      for (const seed of seeds) {
        expect(seed, paper.key).toBeGreaterThanOrEqual(base);
        expect(seed, paper.key).toBeLessThan(base + 100);
      }
    }
  });
});

describe('the key of a paper', () => {
  it('names its kind, topic and number, and reads back', () => {
    expect(paperKey({ kind: 'full', number: 3 })).toBe('full.3');
    expect(paperKey({ kind: 'topic', topicId: 'final-accounts-adjustments', number: 12 })).toBe('topic.final-accounts-adjustments.12');
    for (const ref of REFS) expect(parsePaperKey(paperKey(ref))).toEqual(ref);
  });

  it('is refused when it is not one', () => {
    for (const key of ['', 'full', 'full.0', 'full.x', 'full.1.2', 'full.ledger.1', 'topic.1', 'topic..1', 'weekly.1', 'full.10000', 'FULL.1', ' full.1', 'topic.ledger.01']) {
      expect(parsePaperKey(key), key).toBeNull();
    }
  });
});
