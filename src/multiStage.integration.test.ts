import { describe, expect, it, vi } from 'vitest';
import { buildSearchIndex } from '@/components/search/searchIndex';
import { renderCatalogue } from '@/content/catalogueSource';
import { courseCounts } from '@/content/contentCounts';
import { COURSES, OUTLINES, STAGES, TEMPLATE_OUTLINES, stagesOf } from '@/content/outline';
import { PACKS, getTopicPack, topicSize } from '@/content/registry';
import { validatePack } from '@/content/validate';
import { CASE_STAGES, TEMPLATES, parseCasePartId, parseGenId } from '@/generators';
import { stagesWithCases } from '@/learning/caseStudies';
import { marathonPool, marathonSeed, type MarathonAnswer } from '@/learning/marathon';
import { LEGACY_MIX_KINDS, casesOfTopics, mixBatch, withKinds, type MixPool } from '@/learning/marathonMix';
import { bankOf, buildPaper, type PaperBank } from '@/learning/mockPaper';
import { coursePatterns, filterPatterns, NO_FILTERS } from '@/learning/patterns';
import { availableForLearner } from '@/learning/practice';
import type { Question } from '@/content/types';

// A topic that closes three stages of case studies, whatever the real stages hold: Rectification of Errors closes
// "errors-and-suspense" (its own cases, as they are), "books-and-errors", whose file is given two sample cases here,
// and a stage that exists in these tests alone and has no case. While a stage has no case it must stay invisible
// everywhere: no level, no concept, no count, no card or page, no pattern, never fetched, never drawn on a paper.
// The stand-in keeps the module's other exports: other stages import helpers from it.
vi.mock('@/generators/cases/books-and-errors', async (importOriginal) => {
  const { sampleCaseOf } = await import('@/testing/sampleCase');
  const stage = { topicId: 'rectification-of-errors', conceptId: 'roe-integrated' };
  return { ...(await importOriginal<object>()), default: [sampleCaseOf(stage, 'case-boe-sample-one', 'A month of books and errors'), sampleCaseOf(stage, 'case-boe-sample-two', 'Another month of books and errors')] };
});
vi.mock('@/generators/cases/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/generators/cases/index')>();
  const empty = {
    id: 'test-empty-stage',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-test-empty',
    title: 'A stage with no case yet',
    description: 'Registered in these tests alone, and never given a case.',
    cases: [],
  };
  // It stands after the topic's other stages, as a new stage is registered.
  const after = real.CASE_STAGES.findLastIndex((s) => s.topicId === empty.topicId);
  return { ...real, CASE_STAGES: [...real.CASE_STAGES.slice(0, after + 1), empty, ...real.CASE_STAGES.slice(after + 1)] };
});

const C11 = 'cbse-11-accountancy';
const TOPIC = 'rectification-of-errors';
const stageOf = (id: string) => CASE_STAGES.find((s) => s.id === id)!;
const OWN = stageOf('errors-and-suspense');
const INTEGRATED = stageOf('books-and-errors');
const EMPTY = stageOf('test-empty-stage');
const caseOf = (q: Pick<Question, 'id'>) => parseCasePartId(parseGenId(q.id)?.templateId ?? '')?.caseId;
const stageOfCase = (caseId: string | undefined) => CASE_STAGES.find((s) => s.cases.some((c) => c.id === caseId))?.id;

describe('the fixture', () => {
  it('is a topic that closes two stages that have cases, then one that has none', () => {
    expect(CASE_STAGES.filter((s) => s.topicId === TOPIC).map((s) => s.id)).toEqual([OWN.id, INTEGRATED.id, EMPTY.id]);
    expect(OWN.cases.length).toBeGreaterThan(0);
    expect(INTEGRATED.cases.map((c) => c.id)).toEqual(['case-boe-sample-one', 'case-boe-sample-two']);
    expect(EMPTY.cases).toEqual([]);
  });
});

describe('the ladder of a topic that closes two stages', () => {
  it('ends with one Case study level for each stage, in the order of CASE_STAGES, after the Look back', () => {
    const pack = getTopicPack(TOPIC)!;
    const [lookBack, own, integrated] = pack.levels.slice(-3);
    expect(lookBack.type).toBe('look_back');
    expect(own).toMatchObject({ id: `${TOPIC}-case-study-${OWN.id}`, type: 'case_study', title: `Case study: ${OWN.title}`, cases: { caseIds: OWN.cases.map((c) => c.id) } });
    expect(integrated).toMatchObject({ id: `${TOPIC}-case-study-${INTEGRATED.id}`, type: 'case_study', title: `Case study: ${INTEGRATED.title}`, cases: { caseIds: INTEGRATED.cases.map((c) => c.id) } });
    expect(pack.levels.map((l) => l.order)).toEqual(pack.levels.map((_, i) => i));
    // Each stage adds its own concept, so the answers of each count towards it.
    expect(pack.concepts.filter((c) => c.id === OWN.conceptId || c.id === INTEGRATED.conceptId).map((c) => c.title)).toEqual([`Case study: ${OWN.title}`, `Case study: ${INTEGRATED.title}`]);
    expect(validatePack(pack)).toEqual([]);
  });

  it('gives no level and no concept for a stage that has no case yet', () => {
    const pack = getTopicPack(TOPIC)!;
    expect(pack.levels.filter((l) => l.type === 'case_study').map((l) => l.id)).toEqual([OWN, INTEGRATED].map((s) => `${TOPIC}-case-study-${s.id}`));
    expect(pack.concepts.some((c) => c.id === EMPTY.conceptId)).toBe(false);
  });
});

describe('loading a topic that closes two stages', () => {
  /** How often the app has fetched the file of the integrated stage. */
  const fetched = { booksAndErrors: 0 };

  /**
   * A browser tab that has loaded nothing, with the outline `npm run catalogue` would write for these stages. The
   * file of the integrated stage counts every time it is fetched.
   */
  async function freshApp() {
    vi.resetModules();
    vi.doMock('@/generators/cases/books-and-errors', async (importOriginal) => {
      fetched.booksAndErrors++;
      return { ...(await importOriginal<object>()), default: INTEGRATED.cases };
    });
    const [outline, { outlineOf }, loader, loaded, generators] = await Promise.all([
      import('@/content/outline'),
      import('@/content/outlineOf'),
      import('@/content/loadTopics'),
      import('@/content/loaded'),
      import('@/generators/loaded'),
    ]);
    outline.installOutline(outlineOf(PACKS, TEMPLATES, CASE_STAGES));
    return { ...loader, ...loaded, ...generators };
  }

  it('loads the cases of both stages with it, and gives the very pack the registry builds', async () => {
    const app = await freshApp();
    const before = fetched.booksAndErrors;
    await app.loadTopics([TOPIC]);
    expect(fetched.booksAndErrors).toBe(before + 1);
    expect(app.getTopicPack(TOPIC)).toEqual(getTopicPack(TOPIC));
    for (const stage of [OWN, INTEGRATED]) {
      for (const c of stage.cases) {
        const questions = app.generateCaseQuestions(c.id, 5);
        expect(questions.map((q) => q.topicId), c.id).toEqual(questions.map(() => TOPIC));
        expect(app.findQuestion(questions[0].id), c.id).toEqual(questions[0]);
      }
    }
  });

  it('does not fetch a stage that has no case yet: the loader has no file for this one, and the topic loads all the same', async () => {
    const app = await freshApp();
    expect(app.LOADABLE.stageIds).not.toContain(EMPTY.id);
    await app.loadTopics([TOPIC]);
    expect(app.getTopicPack(TOPIC)).toEqual(getTopicPack(TOPIC));
  });
});

describe('what lists and counts the cases of a topic that closes two stages', () => {
  it('counts the cases of both stages, and nothing of a stage that has none', () => {
    const counts = new Map(courseCounts(C11).topics.map((t) => [t.topicId, t.counts.cases]));
    expect(counts.get(TOPIC)).toBe(OWN.cases.length + INTEGRATED.cases.length);
    expect(topicSize(TOPIC).cases).toBe(OWN.cases.length + INTEGRATED.cases.length);
  });

  it('shows both stages on the Case studies screen, and gives them pages, and never the stage that has none', () => {
    const shown = stagesWithCases(stagesOf(C11)).map((s) => s.id);
    expect(shown).toEqual(expect.arrayContaining([OWN.id, INTEGRATED.id]));
    expect(shown.indexOf(INTEGRATED.id)).toBe(shown.indexOf(OWN.id) + 1);
    expect(shown).not.toContain(EMPTY.id);
    const pages = /CATALOGUE_CASE_STAGES: readonly string\[\] = (\[.*\]);/.exec(renderCatalogue())![1];
    expect(JSON.parse(pages)).toEqual(CASE_STAGES.filter((s) => s.cases.length > 0).map((s) => s.id));
    expect(JSON.parse(pages)).not.toContain(EMPTY.id);
    // And "Go to" finds the cases of both, and nothing of the empty one.
    const index = buildSearchIndex({ courses: COURSES, outlines: OUTLINES, templates: TEMPLATE_OUTLINES, stages: STAGES, cardTitles: {}, pages: [] });
    const casesOf = (stageId: string) => index.filter((e) => e.kind === 'case' && e.href.startsWith(`/cases/play/${stageId}?`)).length;
    expect([casesOf(OWN.id), casesOf(INTEGRATED.id), casesOf(EMPTY.id)]).toEqual([OWN.cases.length, INTEGRATED.cases.length, 0]);
  });

  it('offers the cases of both stages in the Playground, under the topic, and none of the stage that has none', () => {
    const cases = filterPatterns(coursePatterns(C11), { ...NO_FILTERS, topics: [TOPIC], kinds: ['case'] });
    expect(cases.map((p) => p.id)).toEqual([...OWN.cases, ...INTEGRATED.cases].map((c) => c.id));
    expect(cases.map((p) => p.stageId)).toEqual([...OWN.cases.map(() => OWN.id), ...INTEGRATED.cases.map(() => INTEGRATED.id)]);
    expect(coursePatterns(C11).some((p) => p.stageId === EMPTY.id)).toBe(false);
  });

  it('mixes the cases of both stages into a marathon of the topic', () => {
    expect(casesOfTopics(stagesOf(C11), [TOPIC]).map((c) => c.id)).toEqual([...OWN.cases, ...INTEGRATED.cases].map((c) => c.id));
    // A run of the topic serves cases of both stages, each whole (at the difficulty of the sample cases).
    const packs = [getTopicPack(TOPIC)!];
    const pool: MixPool = { ...withKinds(marathonPool(packs, availableForLearner(packs, [], [], true)), LEGACY_MIX_KINDS), cases: casesOfTopics(stagesOf(C11), [TOPIC]) };
    const served: Question[] = [];
    const answers: MarathonAnswer[] = [];
    while (served.length < 400) {
      const batch = mixBatch({ pool, seed: marathonSeed(2), difficulty: 'medium', mastery: {}, served, answers });
      if (batch.length === 0) break;
      for (const q of batch) {
        served.push(q);
        answers.push({ conceptId: q.conceptId, correct: true });
      }
    }
    const stagesServed = new Set(served.map((q) => stageOfCase(caseOf(q))).filter((id) => id !== undefined));
    expect(stagesServed).toEqual(new Set([OWN.id, INTEGRATED.id]));
  });
});

describe('a mock paper on a topic that closes two stages', () => {
  const BANK = bankOf(C11);
  const sixes = (number: number, bank: PaperBank = BANK) => buildPaper({ kind: 'full', number }, bank).entries.filter((e) => e.marks === 6);
  const stagesOn = (number: number, section: number) => sixes(number).filter((e) => e.section === section && e.caseId !== undefined).map((e) => stageOfCase(e.caseId));
  // The full paper: Accounting Process, the unit of the topic, is section 1.
  const PROCESS = 1;

  it('favours the integrated stage: its case is the first long question of the unit on two papers of three', () => {
    for (let number = 1; number <= 12; number++) {
      const stages = stagesOn(number, PROCESS);
      if (number % 3 === 0) continue;
      expect(stages[0], `paper ${number}`).toBe(INTEGRATED.id);
      // It speaks for its topic: the topic's other stage waits while the other topics have a turn.
      expect(stages, `paper ${number}`).not.toContain(OWN.id);
    }
  });

  it('draws on both stages of the topic, in one paper too, and takes the cases of each in turn', () => {
    const drawn = Array.from({ length: 30 }, (_, i) => stagesOn(i + 1, PROCESS));
    expect(drawn.some((stages) => stages.includes(OWN.id) && stages.includes(INTEGRATED.id))).toBe(true);
    const integrated = Array.from({ length: 4 }, (_, i) => sixes(i + 1).find((e) => stageOfCase(e.caseId) === INTEGRATED.id)!.caseId);
    expect(integrated).toEqual(['case-boe-sample-one', 'case-boe-sample-two', 'case-boe-sample-one', 'case-boe-sample-two']);
  });

  it('never draws a stage that has no case: it takes no turn of a case study from a stage that has one', () => {
    expect(BANK.stages.map((s) => s.id)).toContain(EMPTY.id);
    // The unit has more stages with cases than turns for a case (its last 6-mark question is a set), so every turn
    // of a case goes to a case, and none to the empty stage.
    const unit = BANK.stages.filter((s) => s.cases.length > 0 && BANK.topics.some((t) => t.id === s.topicId && t.unit === 'Accounting Process'));
    expect(unit.length).toBeGreaterThanOrEqual(3);
    for (let number = 1; number <= 30; number++) {
      const here = sixes(number).filter((e) => e.section === PROCESS);
      expect(here.filter((e) => e.caseId !== undefined), `paper ${number}`).toHaveLength(here.length - 1);
    }
    // A stage with no case changes nothing in a paper: without it the papers are the very same.
    const without: PaperBank = { ...BANK, stages: BANK.stages.filter((s) => s.id !== EMPTY.id) };
    const ids = (number: number, bank: PaperBank) => buildPaper({ kind: 'full', number }, bank).entries.map((e) => e.questions.map((q) => q.id));
    for (const number of [1, 2, 3, 4, 5, 6]) expect(ids(number, BANK), `paper ${number}`).toEqual(ids(number, without));
  });
});
