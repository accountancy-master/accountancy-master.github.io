import { describe, expect, it, vi } from 'vitest';
import { TEMPLATES, generateQuestion } from '@/generators';
import { COURSE_IDS } from './catalogue.generated';
import { renderCatalogue, renderOutline } from './catalogueSource';
import { CBSE11 } from './courses/cbse11';
import { CBSE12 } from './courses/cbse12';
import { OUTLINES, courseOfTopic, findOutline, outlinesOf, playableCourses, stagesOf, templateOutlinesOf, topicOfQuestion } from './outline';
import { ALL_PACKS, COURSES, PACKS, findQuestion, getTopicPack, packsOf } from './registry';
import { validatePack } from './validate';

// What happens the moment a Class 12 author fills in the two files of a topic: here the sample topic is put in the
// place of two real ones (the first of the course, and the second), and nothing else is touched: the other ten
// topics are as their files are, empty or written, and nothing here depends on which. Every other test runs on the
// files as they are, whatever content the Class 12 topics have by then.
// The case stages import helpers from the topic modules: the stand-ins keep the modules' other exports.
vi.mock('@/generators/templates/partnership-fundamentals', async (importOriginal) => ({ ...(await importOriginal<object>()), default: (await import('@/testing/class12Topic')).class12Templates('partnership-fundamentals') }));
vi.mock('./cbse12/partnership-fundamentals', async () => ({ default: (await import('@/testing/class12Topic')).class12Pack('partnership-fundamentals') }));
vi.mock('@/generators/templates/goodwill', async (importOriginal) => ({ ...(await importOriginal<object>()), default: (await import('@/testing/class12Topic')).class12Templates('goodwill', 'gw') }));
vi.mock('./cbse12/goodwill', async () => ({ default: (await import('@/testing/class12Topic')).class12Pack('goodwill', 'gw') }));

const CLASS11 = CBSE11.id;
const CLASS12 = CBSE12.id;
const FIRST = 'partnership-fundamentals';
const SECOND = 'goodwill';

describe('a Class 12 topic whose pack has levels', () => {
  it('is playable at once: a pack that validates, an available topic of its course, templates that generate', () => {
    for (const topicId of [FIRST, SECOND]) {
      const pack = getTopicPack(topicId)!;
      expect(pack.levels.length, topicId).toBeGreaterThan(5);
      expect(validatePack(pack), topicId).toEqual([]);
      expect(COURSES[1].topics.find((t) => t.id === topicId)!.status, topicId).toBe('available');
    }
    // Every topic of the course can be played just when its own pack has levels: a topic that still has no content
    // keeps the status of the catalogue.
    for (const t of COURSES[1].topics) expect(t.status === 'available', t.id).toBe(getTopicPack(t.id) !== undefined);
    expect(COURSES[1].topics.filter((t) => t.status === 'available').map((t) => t.id).slice(0, 2)).toEqual([FIRST, SECOND]);
    const q = generateQuestion('s12-new-ratio', 3);
    expect(q).toMatchObject({ topicId: FIRST, type: 'numeric', unit: 'ratio' });
    expect(findQuestion(q.id)).toEqual(q);
    expect(topicOfQuestion(q.id)).toBe(FIRST);
    expect(TEMPLATES.filter((t) => t.topicId === SECOND).map((t) => t.id)).toContain('gw-new-ratio');
  });

  it('stands after every Class 11 topic in the list of all packs, and is the first of its own course', () => {
    const class11 = packsOf(CLASS11).map((p) => p.topicId);
    const class12 = packsOf(CLASS12).map((p) => p.topicId);
    expect(class12.slice(0, 2)).toEqual([FIRST, SECOND]);
    expect(class12).toEqual(CBSE12.topics.map((t) => t.id).filter((id) => class12.includes(id)));
    expect(class11.length).toBeGreaterThan(0);
    expect(class11.every((id) => courseOfTopic(id) === CLASS11)).toBe(true);
    expect(PACKS.map((p) => p.topicId)).toEqual([...class11, ...class12]);
    expect(packsOf('no-such-course')).toEqual([]);
    expect(new Set(ALL_PACKS.map((p) => p.topicId)).size).toBe(ALL_PACKS.length);
  });

  it('looks back on the Class 12 topics before it and never on Class 11: the first of the course has no Look back', () => {
    expect(getTopicPack(FIRST)!.levels.some((l) => l.type === 'look_back')).toBe(false);
    const lookBack = getTopicPack(SECOND)!.levels.find((l) => l.type === 'look_back')!;
    expect(lookBack.id).toBe('goodwill-look-back');
    expect(lookBack.lookBack!.earlier.map((t) => t.topicId)).toEqual([FIRST]);
    // And no topic of either course looks back on anything of the other.
    for (const courseId of [CLASS11, CLASS12]) {
      for (const pack of packsOf(courseId)) {
        for (const earlier of pack.levels.flatMap((l) => l.lookBack?.earlier ?? [])) expect(courseOfTopic(earlier.topicId), pack.topicId).toBe(courseId);
      }
    }
  });

  it('is in the outline under its own course, with its templates, and makes its course one a learner can choose', () => {
    expect(outlinesOf(CLASS12).map((o) => o.topicId)).toEqual(packsOf(CLASS12).map((p) => p.topicId));
    expect(outlinesOf(CLASS12).slice(0, 2).map((o) => o.topicId)).toEqual([FIRST, SECOND]);
    expect([...outlinesOf(CLASS11), ...outlinesOf(CLASS12)]).toEqual(OUTLINES);
    // The templates of the course are those of its playable topics: here the sample's, twice, and whatever else is written.
    const playable = TEMPLATES.filter((t) => courseOfTopic(t.topicId) === CLASS12 && getTopicPack(t.topicId) !== undefined).map((t) => t.id);
    expect(templateOutlinesOf(CLASS12).map((t) => t.id).sort()).toEqual([...playable].sort());
    expect(playable).toEqual(expect.arrayContaining(['s12-new-ratio', 'gw-new-ratio']));
    expect(templateOutlinesOf(CLASS11).every((t) => courseOfTopic(t.topicId) === CLASS11)).toBe(true);
    // Every stage of the course, with cases or not yet (the screens leave out those without): a topic may close several.
    expect(stagesOf(CLASS12).map((s) => s.id)).toEqual(['partnership-accounts', 'reconstitution', 'dissolution', 'firm-life', 'company-accounts', 'analysis', 'company-year', 'computerised-accounting-cases']);
    expect(stagesOf(CLASS11).map((s) => s.id)).toEqual(['accounting-cycle', 'cash-and-bank', 'errors-and-suspense', 'books-and-errors', 'asset-life', 'provisions-reserves-cases', 'final-accounts', 'whole-year', 'incomplete-records-cases', 'accounting-basics', 'concepts-in-practice']);
    expect(playableCourses().map((c) => c.id)).toEqual([CLASS11, CLASS12]);
    expect(findOutline(FIRST)!.levels.map((l) => l.id)).toEqual(getTopicPack(FIRST)!.levels.map((l) => l.id));
  });

  it('would be written into the generated catalogue and outline by `npm run catalogue`, pages and all', () => {
    const catalogue = renderCatalogue();
    expect(catalogue).toContain('"id": "partnership-fundamentals"');
    expect(catalogue).toContain('"partnership-fundamentals-formats-2"');
    expect(renderOutline()).toContain('["s12-new-ratio",1,"s12-basics","medium","numeric"]');
    expect(COURSE_IDS).toEqual([CLASS11, CLASS12]);
  });

  it('keeps every id apart from every other, across both courses', () => {
    const ids = (list: { id: string }[]) => list.map((x) => x.id);
    const once = (all: string[]) => expect(new Set(all).size).toBe(all.length);
    once(ids(TEMPLATES));
    once(ids(PACKS.flatMap((p) => p.concepts)));
    once(ids(PACKS.flatMap((p) => p.cards)));
    once(ids(PACKS.flatMap((p) => p.questions)));
    once(ids(PACKS.flatMap((p) => p.levels)));
    once(COURSES.flatMap((c) => c.topics.map((t) => t.id)));
  });
});

describe('loading a Class 12 topic in the app', () => {
  it('gives, topic by topic, the very pack the registry builds, once the outline has been generated again', async () => {
    const stages = (await import('@/generators')).CASE_STAGES;
    for (const topicId of [FIRST, SECOND]) {
      // A browser tab that has loaded nothing: fresh modules, and the outline `npm run catalogue` would write.
      vi.resetModules();
      const [outline, { outlineOf }, loader, loaded] = await Promise.all([import('./outline'), import('./outlineOf'), import('./loadTopics'), import('./loaded')]);
      outline.installOutline(outlineOf(PACKS, TEMPLATES, stages));
      expect(loaded.isTopicLoaded(topicId)).toBe(false);
      await loader.loadTopics([topicId]);
      expect(loaded.getTopicPack(topicId), topicId).toEqual(getTopicPack(topicId));
      expect(loader.LOADABLE.topicIds).toEqual(expect.arrayContaining(CBSE12.topics.map((t) => t.id)));
    }
  });
});

describe('a worked example in a lesson that is not a journal entry', () => {
  it('is a titled list of working lines, and is reported when it has no title, no line or an empty one', () => {
    const pack = getTopicPack(FIRST)!;
    const lesson = pack.levels[0].lesson!;
    const worked = lesson.find((b) => b.type === 'working');
    expect(worked).toMatchObject({ type: 'working', title: expect.stringContaining('₹90,000'), lines: expect.any(Array) });
    expect(validatePack(pack)).toEqual([]);
    const withLesson = (block: (typeof lesson)[number]) => validatePack({ ...pack, levels: pack.levels.map((l, i) => (i === 0 ? { ...l, lesson: [block] } : l)) });
    const id = pack.levels[0].id;
    expect(withLesson({ type: 'working', title: 'Sharing', lines: [] })).toContain(`level ${id}: worked example "Sharing" needs working, one non-empty line per step`);
    expect(withLesson({ type: 'working', title: 'Sharing', lines: ['One.', ' '] })).toContain(`level ${id}: worked example "Sharing" needs working, one non-empty line per step`);
    expect(withLesson({ type: 'working', title: ' ', lines: ['One.'] })).toContain(`level ${id}: a worked example has no title`);
    expect(withLesson({ type: 'working', title: 'Sharing', lines: ['One.'], note: '' })).toContain(`level ${id}: worked example "Sharing" has an empty note`);
    expect(withLesson({ type: 'working', title: 'Sharing', lines: ['One.'] })).toEqual([]);
  });

  it('or a small table of labels and figures, reported when it has no title, no figure, or an empty label, figure or note', () => {
    const pack = getTopicPack(FIRST)!;
    const lesson = pack.levels[0].lesson!;
    expect(lesson.find((b) => b.type === 'table')).toMatchObject({ type: 'table', rows: expect.arrayContaining([{ label: 'Profit shared', amount: '₹90,000', total: true }]) });
    const withLesson = (block: (typeof lesson)[number]) => validatePack({ ...pack, levels: pack.levels.map((l, i) => (i === 0 ? { ...l, lesson: [block] } : l)) });
    const id = pack.levels[0].id;
    const needsRows = `level ${id}: table "Cash" needs rows, each with a label, and a figure in at least one`;
    expect(withLesson({ type: 'table', title: 'Cash', rows: [] })).toContain(needsRows);
    expect(withLesson({ type: 'table', title: 'Cash', rows: [{ label: 'Operating activities' }] })).toContain(needsRows);
    expect(withLesson({ type: 'table', title: 'Cash', rows: [{ label: ' ', amount: '₹5,000' }] })).toContain(needsRows);
    expect(withLesson({ type: 'table', title: 'Cash', rows: [{ label: 'Cash', amount: '' }] })).toContain(needsRows);
    expect(withLesson({ type: 'table', title: '', rows: [{ label: 'Cash', amount: '₹5,000' }] })).toContain(`level ${id}: a table has no title`);
    expect(withLesson({ type: 'table', title: 'Cash', rows: [{ label: 'Cash', amount: '₹5,000' }], note: ' ' })).toContain(`level ${id}: table "Cash" has an empty note`);
    expect(withLesson({ type: 'table', title: 'Cash', rows: [{ label: 'Operating activities' }, { label: 'Cash used', amount: '(5,000)' }] })).toEqual([]);
  });
});
