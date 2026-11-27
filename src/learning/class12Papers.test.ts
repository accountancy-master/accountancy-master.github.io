import { describe, expect, it } from 'vitest';
import { CBSE11 } from '@/content/courses/cbse11';
import { CBSE12 } from '@/content/courses/cbse12';
// The registry first: it registers every real template and installs the outline of what there is.
import { packsOf } from '@/content/registry';
import { topicShown } from '@/content/courseOptions';
import type { McqQuestion, Question } from '@/content/types';
import { registerTemplates } from '@/generators/loaded';
import type { Template } from '@/generators/types';
import { class12Pack, class12Templates } from '@/testing/class12Topic';
import { bankOf, buildPaper, paperAvailable, paperSeed, paperSteps, paperTitle, paperTopics, sectionTopics, theBank, type MockPaper, type PaperBank } from './mockPaper';
import { BLUEPRINTS, CLASS12_BLUEPRINTS, MARK_VALUES, PAPER_KINDS, blueprintsOf, questionCount, type MarkValue, type PaperBlueprint } from './paperBlueprints';

const C11 = CBSE11.id;
const C12 = CBSE12.id;
const marksOf = (questions: Record<MarkValue, number>) => MARK_VALUES.reduce((sum, value) => sum + value * questions[value], 0);
const add = (list: Record<MarkValue, number>[]): Record<MarkValue, number> => ({ 1: 0, 3: 0, 4: 0, 6: 0, ...Object.fromEntries(MARK_VALUES.map((v) => [v, list.reduce((sum, q) => sum + q[v], 0)])) });

describe('the papers of each course, as data', () => {
  it('are three for every course: its own for Class 11 and Class 12, and those of Class 11 for a course without any', () => {
    expect(blueprintsOf(C11)).toBe(BLUEPRINTS);
    expect(blueprintsOf(C12)).toBe(CLASS12_BLUEPRINTS);
    expect(blueprintsOf('no-such-course')).toBe(BLUEPRINTS);
    for (const blueprints of [BLUEPRINTS, CLASS12_BLUEPRINTS]) expect(Object.keys(blueprints)).toEqual([...PAPER_KINDS]);
  });

  it('add up, section by section and as a whole', () => {
    for (const [course, blueprints] of [[C11, BLUEPRINTS], [C12, CLASS12_BLUEPRINTS]] as const) {
      for (const kind of PAPER_KINDS) {
        const b: PaperBlueprint = blueprints[kind];
        expect(b.kind, `${course} ${kind}`).toBe(kind);
        for (const s of b.sections) expect(marksOf(s.questions), `${course} ${kind}: ${s.title}`).toBe(s.marks);
        expect(b.sections.reduce((sum, s) => sum + s.marks, 0), `${course} ${kind}`).toBe(b.marks);
      }
      expect([blueprints.full.marks, blueprints.half.marks, blueprints.topic.marks], course).toEqual([80, 40, 20]);
      expect([blueprints.full.minutes, blueprints.half.minutes, blueprints.topic.minutes], course).toEqual([180, 90, 40]);
    }
  });

  it('set the Class 12 full paper as the board does: 34 questions, Part A of 60 marks and Part B of 20', () => {
    const { full } = CLASS12_BLUEPRINTS;
    expect(questionCount(full)).toBe(34);
    expect(add(full.sections.map((s) => s.questions))).toEqual({ 1: 20, 3: 6, 4: 3, 6: 5 });
    const part = (name: string) => full.sections.filter((s) => s.part === name);
    expect(add(part('A').map((s) => s.questions))).toEqual({ 1: 16, 3: 4, 4: 2, 6: 4 });
    expect(add(part('B').map((s) => s.questions))).toEqual({ 1: 4, 3: 2, 4: 1, 6: 1 });
    expect(part('A').reduce((sum, s) => sum + s.marks, 0)).toBe(60);
    expect(part('B').reduce((sum, s) => sum + s.marks, 0)).toBe(20);
  });

  it('give every unit of Class 12 its marks exactly, by the split of questions chosen', () => {
    expect(CLASS12_BLUEPRINTS.full.sections.map((s) => [s.part, s.title, s.marks, s.questions])).toEqual([
      ['A', 'Accounting for Partnership Firms', 36, { 1: 11, 3: 3, 4: 1, 6: 2 }],
      ['A', 'Accounting for Companies', 24, { 1: 5, 3: 1, 4: 1, 6: 2 }],
      ['B', 'Analysis of Financial Statements', 12, { 1: 2, 3: 2, 4: 1, 6: 0 }],
      ['B', 'Cash Flow Statement', 8, { 1: 2, 3: 0, 4: 0, 6: 1 }],
    ]);
    // 11 + 9 + 4 + 12, 5 + 3 + 4 + 12, 2 + 6 + 4, 2 + 6.
    expect(CLASS12_BLUEPRINTS.full.sections.map((s) => marksOf(s.questions))).toEqual([36, 24, 12, 8]);
  });

  it('draw every section of a Class 12 paper on a unit of its catalogue: the half-yearly paper on the six partnership topics', () => {
    const units = new Set(CBSE12.topics.map((t) => t.unit));
    for (const s of CLASS12_BLUEPRINTS.full.sections) expect('unit' in s.topics && units.has(s.topics.unit), s.title).toBe(true);
    const [half] = CLASS12_BLUEPRINTS.half.sections;
    expect(half).toMatchObject({ topics: { unit: 'Accounting for Partnership Firms' }, marks: 40, questions: { 1: 10, 3: 4, 4: 3, 6: 1 } });
    expect(CBSE12.topics.filter((t) => 'unit' in half.topics && t.unit === half.topics.unit).map((t) => t.id)).toEqual(CBSE12.topics.slice(0, 6).map((t) => t.id));
    expect(CLASS12_BLUEPRINTS.topic).toBe(BLUEPRINTS.topic);
  });
});

describe('the bank of each course', () => {
  it("is the course's own: Class 11 has its topics and papers, and Class 12 the topics of its own that can be played", () => {
    expect(bankOf(C11)).toBe(theBank());
    expect(bankOf(C11)).toMatchObject({ courseId: C11, blueprints: BLUEPRINTS });
    expect(bankOf(C11).topics.every((t) => CBSE11.topics.some((x) => x.id === t.id))).toBe(true);
    for (const kind of PAPER_KINDS) expect(paperAvailable(kind, bankOf(C11)), kind).toBe(true);
    const twelve = bankOf(C12);
    expect(twelve).toMatchObject({ courseId: C12, blueprints: CLASS12_BLUEPRINTS });
    // Whatever Class 12 has by now: its playable topics in its own order, their templates, and nothing of Class 11.
    // The bank is that of the default choice of Part B: Computerised Accounting, the other choice, is not in it.
    expect(twelve.topics.map((t) => t.id)).toEqual(packsOf(C12).map((p) => p.topicId).filter((id) => topicShown(id, {})));
    expect(twelve.templates.every((t) => twelve.topics.some((x) => x.id === t.topicId))).toBe(true);
    expect(twelve.topics.some((t) => bankOf(C11).topics.some((x) => x.id === t.id))).toBe(false);
    expect(paperAvailable('topic', twelve)).toBe(twelve.topics.length > 0);
    expect(bankOf('cbse-99-unknown')).toMatchObject({ topics: [], templates: [], stages: [] });
    for (const kind of PAPER_KINDS) expect(paperAvailable(kind, bankOf('cbse-99-unknown')), kind).toBe(false);
    expect(() => buildPaper({ kind: 'full', number: 1 }, bankOf('cbse-99-unknown'))).toThrow();
  });
});

// A bank of Class 12 in which every topic has the sample topic's templates and questions, under ids of its own, and
// no stage has a case yet: what the course looks like while its content is still arriving.
function sampleBank(topicIds: readonly string[] = CBSE12.topics.map((t) => t.id)): PaperBank {
  const templates: Template[] = [];
  const questions = new Map<string, Question[]>();
  for (const [i, topicId] of CBSE12.topics.map((t) => t.id).entries()) {
    if (!topicIds.includes(topicId)) continue;
    const p = `t${i}`;
    const own = class12Templates(topicId, p);
    registerTemplates(own);
    templates.push(...own);
    const pack = class12Pack(topicId, p);
    const mcq = pack.questions.find((q): q is McqQuestion => q.type === 'mcq')!;
    // A topic test asks six 1-mark questions of one topic: the sample has one authored choice question, so it is
    // given five more under other ids.
    questions.set(topicId, [...pack.questions, ...Array.from({ length: 5 }, (_, k): Question => ({ ...mcq, id: `${p}-q-9${k}`, prompt: `${mcq.prompt} (${k + 2})` }))]);
  }
  return {
    courseId: C12,
    blueprints: CLASS12_BLUEPRINTS,
    topics: CBSE12.topics.flatMap((t, courseIndex) => (topicIds.includes(t.id) ? [{ id: t.id, title: t.title, unit: t.unit, courseIndex }] : [])),
    templates: templates.map(({ id, version, topicId, conceptId, difficulty, kind }) => ({ id, version, topicId, conceptId, difficulty, kind })),
    questionsOf: (topicId) => questions.get(topicId) ?? [],
    stages: [],
  };
}

describe('a Class 12 paper built while content is still arriving', () => {
  const bank = sampleBank();
  const total = (paper: MockPaper, of: (e: MockPaper['entries'][number]) => boolean = () => true) => paper.entries.filter(of).reduce((sum, e) => sum + e.marks, 0);

  it('adds up to 80 marks, each unit to its own, with no case study to give yet', () => {
    for (const number of [1, 2, 3, 7]) {
      const paper = buildPaper({ kind: 'full', number }, bank);
      expect(paper).toMatchObject({ marks: 80, minutes: 180, title: `Full paper ${number}` });
      expect(total(paper), `paper ${number}`).toBe(80);
      expect(paper.blueprint.sections.map((_, s) => total(paper, (e) => e.section === s)), `paper ${number}`).toEqual([36, 24, 12, 8]);
      expect([total(paper, (e) => e.part === 'A'), total(paper, (e) => e.part === 'B')], `paper ${number}`).toEqual([60, 20]);
      // Every question is of a topic of the unit its section draws on.
      for (const e of paper.entries) expect(sectionTopics(paper.blueprint.sections[e.section], bank, {}).map((t) => t.id), `paper ${number} question ${e.number}`).toContain(e.topicId);
      // No case yet: a 6-mark question is a long format of a topic, or two 3-mark questions stand in its place.
      expect(paper.entries.some((e) => e.caseId !== undefined)).toBe(false);
      const ids = paper.entries.flatMap((e) => e.questions.map((q) => q.id));
      expect(new Set(ids).size, `paper ${number}`).toBe(ids.length);
      expect(paper.entries.map((e) => e.number)).toEqual(paper.entries.map((_, i) => i + 1));
    }
  });

  it('asks ratio and "times" answers, accounts in columns and statements in parts where their marks fall', () => {
    const kinds = new Set<string>();
    for (let number = 1; number <= 12; number++) {
      for (const step of paperSteps(buildPaper({ kind: 'full', number }, bank))) {
        const q = step.question;
        kinds.add(q.type === 'numeric' ? `numeric:${q.unit}` : q.type === 'account' ? `account:${q.columns.length > 2 ? 'columns' : 'plain'}` : q.type === 'statement' ? `statement:${q.lines ? 'parts' : 'plain'}` : q.type);
      }
    }
    expect([...kinds].sort()).toEqual(['account:columns', 'journal_entry', 'mcq', 'numeric:ratio', 'numeric:times', 'statement:parts']);
  });

  it('sets the half-yearly paper on the partnership topics alone, and a topic test on one topic', () => {
    const half = buildPaper({ kind: 'half', number: 1 }, bank);
    expect(total(half)).toBe(40);
    const partnership = CBSE12.topics.slice(0, 6).map((t) => t.id);
    expect(paperTopics({ kind: 'half', number: 1 }, bank)).toEqual(partnership);
    expect(half.entries.every((e) => partnership.includes(e.topicId))).toBe(true);
    const test = buildPaper({ kind: 'topic', topicId: 'debentures', number: 2 }, bank);
    expect(total(test)).toBe(20);
    expect(test.entries.every((e) => e.topicId === 'debentures')).toBe(true);
    expect(paperTitle({ kind: 'topic', topicId: 'debentures', number: 2 }, bank)).toBe('Topic test 2: Issue of Debentures');
    expect(() => buildPaper({ kind: 'topic', topicId: 'ledger', number: 1 }, bank)).toThrow('Unknown topic for a paper: ledger');
  });

  it('is the same paper for the same number, and has seeds of its own whatever the course', () => {
    expect(buildPaper({ kind: 'full', number: 4 }, bank)).toEqual(buildPaper({ kind: 'full', number: 4 }, bank));
    expect(buildPaper({ kind: 'full', number: 4 }, bank).entries.map((e) => e.questions[0].id)).not.toEqual(buildPaper({ kind: 'full', number: 5 }, bank).entries.map((e) => e.questions[0].id));
    // A paper is a paper of its course: the same reference in Class 11 is another paper, made of other questions.
    expect(paperSeed({ kind: 'full', number: 4 }, bank)).toBe(paperSeed({ kind: 'full', number: 4 }, theBank()));
    const eleven = new Set(buildPaper({ kind: 'full', number: 4 }).entries.flatMap((e) => e.questions.map((q) => q.topicId)));
    expect([...eleven].every((topicId) => CBSE11.topics.some((t) => t.id === topicId))).toBe(true);
  });

  it('waits for a unit that has no topic yet: the full paper is not offered, the others are', () => {
    const early = sampleBank(['partnership-fundamentals', 'goodwill']);
    expect(paperAvailable('full', early)).toBe(false);
    expect(paperAvailable('half', early)).toBe(true);
    expect(paperAvailable('topic', early)).toBe(true);
    expect(() => buildPaper({ kind: 'full', number: 1 }, early)).toThrow('No topic for the section "Accounting for Companies"');
    // The half-yearly paper is set from what there is: two topics give it all forty marks.
    const half = buildPaper({ kind: 'half', number: 1 }, early);
    expect(total(half)).toBe(40);
    expect(new Set(half.entries.map((e) => e.topicId))).toEqual(new Set(['partnership-fundamentals', 'goodwill']));
    expect(total(buildPaper({ kind: 'topic', topicId: 'goodwill', number: 1 }, early))).toBe(20);
  });
});
