import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CASE_STAGES, TEMPLATES } from '@/generators';
import { ALL_PACKS, PACKS } from './registry';

// The registry (imported above) has everything, as every other unit test wants it. The app has nothing until it
// asks: each test here starts from modules that have loaded no topic, as a browser tab does.
async function freshApp() {
  vi.resetModules();
  const [loader, loaded, generators] = await Promise.all([import('./loadTopics'), import('./loaded'), import('@/generators/loaded')]);
  return { ...loader, ...loaded, ...generators };
}

const FIRST = PACKS[0].topicId;
const LAST = PACKS[PACKS.length - 1].topicId;
const templateOf = (topicId: string) => TEMPLATES.find((t) => t.topicId === topicId)!;

describe('loading a topic', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('has a file for every topic that has a pack (playable or not yet) and every stage of case studies, and for nothing else', async () => {
    const { LOADABLE } = await freshApp();
    expect([...LOADABLE.topicIds].sort()).toEqual(ALL_PACKS.map((p) => p.topicId).sort());
    expect([...LOADABLE.stageIds].sort()).toEqual(CASE_STAGES.map((s) => s.id).sort());
  });

  it('gives, topic by topic, the very pack the registry builds from all of them', async () => {
    for (const pack of PACKS) {
      // Alone each time: a topic must not need another one to be there.
      const app = await freshApp();
      await app.loadTopics([pack.topicId]);
      expect(app.getTopicPack(pack.topicId), pack.topicId).toEqual(pack);
      // With it comes everything that is filed under the topic: an id names the topic to load, and that is enough.
      for (const t of TEMPLATES.filter((x) => x.topicId === pack.topicId)) expect(app.getTemplate(t.id).id, t.id).toBe(t.id);
      for (const stage of CASE_STAGES.filter((s) => s.topicId === pack.topicId)) {
        for (const part of stage.cases.flatMap((c) => c.parts)) expect(app.getTemplate(part.id).id, part.id).toBe(part.id);
      }
      for (const q of pack.questions) expect(app.findQuestion(q.id), q.id).toEqual(q);
    }
  }, 60_000);

  it('registers the pack, its templates and the cases of its stage, so that the usual lookups work', async () => {
    const app = await freshApp();
    const stage = CASE_STAGES.find((s) => s.cases.length > 0)!;
    expect(app.isTopicLoaded(stage.topicId)).toBe(false);
    await app.loadTopics([stage.topicId]);
    expect(app.isTopicLoaded(stage.topicId)).toBe(true);
    expect(app.topicsLoaded([stage.topicId])).toBe(true);

    const template = templateOf(stage.topicId);
    const question = app.generateQuestion(template.id, 7);
    expect(question.id).toBe(`gen:${template.id}:${template.version}:7`);
    expect(app.findQuestion(question.id)).toEqual(question);
    const authored = PACKS.find((p) => p.topicId === stage.topicId)!.questions[0];
    expect(app.findQuestion(authored.id)).toEqual(authored);
    const [part] = app.generateCaseQuestions(stage.cases[0].id, 3);
    expect(app.findQuestion(part.id)).toEqual(part);
  });

  it('loads a topic once: asked again, at the same time or later, it gives the pack it already has', async () => {
    const app = await freshApp();
    await Promise.all([app.loadTopics([FIRST]), app.loadTopics([FIRST, FIRST])]);
    const pack = app.getTopicPack(FIRST);
    await app.loadTopics([FIRST]);
    expect(app.getTopicPack(FIRST)).toBe(pack);
  });

  it('tells whoever is waiting when a topic has been loaded', async () => {
    const app = await freshApp();
    const heard = vi.fn();
    const stop = app.onTopicLoaded(heard);
    await app.loadTopics([FIRST]);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    await app.loadTopics([LAST]);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('loads several topics together, and only those', async () => {
    const app = await freshApp();
    await app.loadTopics([FIRST, LAST]);
    expect(app.loadedPacks([LAST, FIRST]).map((p) => p.topicId)).toEqual([FIRST, LAST]);
    const other = PACKS[1].topicId;
    expect(app.isTopicLoaded(other)).toBe(false);
    expect(app.topicsLoaded([FIRST, other])).toBe(false);
  });

  it('refuses a topic that does not exist', async () => {
    const app = await freshApp();
    await expect(app.loadTopics(['no-such-topic'])).rejects.toThrow('Unknown topic: no-such-topic');
  });
});

describe('a topic that has not been loaded', () => {
  it('fails loudly wherever it is looked up, and never answers with something else', async () => {
    const app = await freshApp();
    const template = templateOf(LAST);
    const authored = PACKS[PACKS.length - 1].questions[0];
    const stage = CASE_STAGES.find((s) => s.cases.length > 0)!;
    const notLoaded = (topicId: string) => new RegExp(`${topicId} (first|is not loaded)`);

    expect(() => app.getTopicPack(LAST)).toThrow(notLoaded(LAST));
    expect(() => app.loadedPacks([FIRST, LAST])).toThrow(/is not loaded/);
    expect(() => app.getTemplate(template.id)).toThrow(notLoaded(LAST));
    expect(() => app.generateQuestion(template.id, 1)).toThrow(notLoaded(LAST));
    expect(() => app.generateCaseQuestions(stage.cases[0].id, 1)).toThrow(notLoaded(stage.topicId));
    expect(() => app.findQuestion(`gen:${template.id}:${template.version}:1`)).toThrow(notLoaded(LAST));
    expect(() => app.findQuestion(`gen:${stage.cases[0].id}~1:${stage.cases[0].version}:1`)).toThrow(notLoaded(stage.topicId));
    expect(() => app.findQuestion(authored.id)).toThrow(notLoaded(LAST));
    expect(() => app.getQuestion(authored.id)).toThrow(notLoaded(LAST));
  });

  it('still says "no such thing" for what does not exist at all', async () => {
    const app = await freshApp();
    expect(app.getTopicPack('no-such-topic')).toBeUndefined();
    expect(app.findQuestion('nope')).toBeUndefined();
    expect(app.findQuestion('gen:nope:1:7')).toBeUndefined();
    expect(() => app.getTemplate('nope')).toThrow('Unknown template: nope');
    expect(() => app.generateCaseQuestions('nope', 1)).toThrow('Unknown case: nope');
  });

  it('is not disturbed by another topic being there', async () => {
    const app = await freshApp();
    await app.loadTopics([FIRST]);
    expect(() => app.getTopicPack(LAST)).toThrow(/is not loaded/);
    expect(() => app.generateQuestion(templateOf(LAST).id, 1)).toThrow(/is not loaded/);
    expect(app.generateQuestion(templateOf(FIRST).id, 1).topicId).toBe(FIRST);
  });
});
