import { describe, expect, it } from 'vitest';
import { PACKS } from '@/content/registry';
import type { Level, Question, TopicPack } from '@/content/types';
import { TEMPLATES, parseCasePartId, parseGenId } from '@/generators';
import { STARTER_PACK } from '@/testing/starterPack';
import { CONFIG } from './config';
import { availableForLearner, availableItems, buildDailyChallenge, buildFreshQuestions, buildSmartPractice } from './practice';
import { deriveProgress, weakestTopics, type Progress } from './progress';
import { buildLevelSession, countScored, lookBackSize, type SessionItem } from './sessionBuilder';

const { own: OWN, earlier: EARLIER } = CONFIG.lookBack;
const NOW = new Date(2026, 9, 5, 10).getTime();
const SEEDS = Array.from({ length: 60 }, (_, i) => 1200 + i * 100);

// A look-back level on the frozen starter pack: its own mixed-level templates, and a few real templates of each of
// five other topics as the earlier ones. Which topics they are does not matter, so they are taken as they come.
const pack = STARTER_PACK;
const HOME = pack.topicId;
const topicOf = new Map(TEMPLATES.map((t) => [t.id, t.topicId]));
const OTHERS = [...new Set(TEMPLATES.map((t) => t.topicId))].filter((id) => id !== HOME).slice(0, 5);
const templatesOf = (topicId: string) => TEMPLATES.filter((t) => t.topicId === topicId).slice(0, 4).map((t) => t.id);
const lookBackLevel = (earlierTopics: string[], ownTemplates = pack.levels[10].generate!.templateIds): Level => ({
  id: `${HOME}-look-back`,
  topicId: HOME,
  order: 12,
  type: 'look_back',
  title: 'Look back',
  description: 'd',
  lookBack: { templateIds: ownTemplates, earlier: earlierTopics.map((topicId) => ({ topicId, templateIds: templatesOf(topicId) })) },
});
const level = lookBackLevel(OTHERS);

const questionsOf = (items: SessionItem[]): Question[] => items.flatMap((i) => (i.kind === 'question' ? [i.question] : []));
const templateOf = (q: Question) => parseGenId(q.id)!.templateId;
const earlierIn = (items: SessionItem[]) => questionsOf(items).filter((q) => q.topicId !== HOME);
const earlierTopics = (items: SessionItem[]) => earlierIn(items).map((q) => q.topicId);

describe('a look-back level session', () => {
  it('has the numbers of questions the configuration gives: of the topic itself, and of earlier topics', () => {
    expect(lookBackSize(level.lookBack!)).toEqual({ own: OWN, earlier: EARLIER });
    for (const seed of SEEDS) {
      const items = buildLevelSession(level, pack, seed);
      expect(items.every((i) => i.kind === 'question')).toBe(true);
      expect(items).toHaveLength(OWN + EARLIER);
      expect(countScored(items)).toBe(OWN + EARLIER);
      expect(earlierIn(items)).toHaveLength(EARLIER);
    }
  });

  it('asks only what it lists: its own templates for its own topic, and the listed templates of each earlier topic', () => {
    const { templateIds, earlier } = level.lookBack!;
    for (const seed of SEEDS) {
      for (const q of questionsOf(buildLevelSession(level, pack, seed))) {
        const listed = q.topicId === HOME ? templateIds : earlier.find((t) => t.topicId === q.topicId)!.templateIds;
        expect(listed, q.id).toContain(templateOf(q));
        expect(topicOf.get(templateOf(q)), q.id).toBe(q.topicId);
        expect(q.context, q.id).toBeUndefined();
        expect(parseCasePartId(templateOf(q)), q.id).toBeNull();
      }
    }
  });

  it('gives every question its own seed inside the block of the play', () => {
    for (const seed of SEEDS) {
      const seeds = questionsOf(buildLevelSession(level, pack, seed)).map((q) => parseGenId(q.id)!.seed);
      expect(new Set(seeds).size).toBe(OWN + EARLIER);
      for (const s of seeds) expect(Math.floor(s / 100)).toBe(seed / 100);
    }
  });

  it('takes the earlier questions from different topics while there are enough', () => {
    for (const seed of SEEDS) expect(new Set(earlierTopics(buildLevelSession(level, pack, seed))).size).toBe(EARLIER);
    const count = (list: string[], id: string) => list.filter((x) => x === id).length;
    // Fewer earlier topics than questions: every topic is asked, as evenly as the number allows.
    for (const seed of SEEDS) {
      const three = earlierTopics(buildLevelSession(lookBackLevel(OTHERS.slice(0, 3)), pack, seed));
      expect(OTHERS.slice(0, 3).map((id) => count(three, id)).sort()).toEqual([1, 1, 2]);
      const two = earlierTopics(buildLevelSession(lookBackLevel(OTHERS.slice(0, 2)), pack, seed));
      expect(OTHERS.slice(0, 2).map((id) => count(two, id))).toEqual([2, 2]);
      const one = earlierTopics(buildLevelSession(lookBackLevel(OTHERS.slice(0, 1)), pack, seed));
      expect(one).toEqual(Array(EARLIER).fill(OTHERS[0]));
    }
  });

  it('shuffles the questions of the topic and of earlier topics together', () => {
    const positions = SEEDS.map((seed) => questionsOf(buildLevelSession(level, pack, seed)).map((q) => (q.topicId === HOME ? 'o' : 'e')).join(''));
    expect(new Set(positions).size).toBeGreaterThan(10);
    expect(positions.some((p) => p.startsWith('e'))).toBe(true);
    expect(positions.some((p) => p.endsWith('o'))).toBe(true);
  });

  it('is the same for the same level, pack, seed and weakest topics, and different for another seed', () => {
    const weakest = { weakestTopicIds: [OTHERS[3], OTHERS[1]] };
    expect(buildLevelSession(level, pack, 4200)).toEqual(buildLevelSession(level, pack, 4200));
    expect(buildLevelSession(level, pack, 4200, weakest)).toEqual(buildLevelSession(level, pack, 4200, { weakestTopicIds: [OTHERS[3], OTHERS[1]] }));
    expect(buildLevelSession(level, pack, 4300)).not.toEqual(buildLevelSession(level, pack, 4200));
  });

  describe('which earlier topics it asks about', () => {
    it('spreads them by seed for a learner with no history: over the plays every earlier topic comes up', () => {
      const asked = new Set(SEEDS.flatMap((seed) => earlierTopics(buildLevelSession(level, pack, seed))));
      expect([...asked].sort()).toEqual([...OTHERS].sort());
      // No history, and a list with no topic in it, are the same thing.
      for (const seed of SEEDS.slice(0, 5)) {
        expect(buildLevelSession(level, pack, seed, { weakestTopicIds: [] })).toEqual(buildLevelSession(level, pack, seed));
      }
    });

    it('asks about the weakest topics the learner has played on every play, and fills up from the rest by seed', () => {
      const weak = [OTHERS[4], OTHERS[2]];
      const rest = new Set<string>();
      for (const seed of SEEDS) {
        const topics = earlierTopics(buildLevelSession(level, pack, seed, { weakestTopicIds: weak }));
        expect(new Set(topics).size).toBe(EARLIER);
        for (const id of weak) expect(topics, `seed ${seed}`).toContain(id);
        for (const id of topics) if (!weak.includes(id)) rest.add(id);
      }
      expect([...rest].sort()).toEqual(OTHERS.filter((id) => !weak.includes(id)).sort());
    });

    it('takes the weakest first when more topics have been played than it has questions for', () => {
      const weakestFirst = [OTHERS[2], OTHERS[0], OTHERS[4], OTHERS[1], OTHERS[3]];
      for (const seed of SEEDS) {
        const topics = earlierTopics(buildLevelSession(level, pack, seed, { weakestTopicIds: weakestFirst }));
        expect([...topics].sort()).toEqual(weakestFirst.slice(0, EARLIER).sort());
      }
    });

    it('ignores a weakest topic it does not look back on, and one named twice', () => {
      const plain = buildLevelSession(level, pack, 4200, { weakestTopicIds: [OTHERS[1]] });
      expect(buildLevelSession(level, pack, 4200, { weakestTopicIds: ['nope', HOME, OTHERS[1], OTHERS[1]] })).toEqual(plain);
    });

    it('does not change the questions of the topic itself', () => {
      const own = (items: SessionItem[]) => questionsOf(items).filter((q) => q.topicId === HOME).map((q) => q.id).sort();
      for (const seed of SEEDS.slice(0, 10)) {
        expect(own(buildLevelSession(level, pack, seed, { weakestTopicIds: [OTHERS[4]] }))).toEqual(own(buildLevelSession(level, pack, seed)));
      }
    });
  });

  it('serves every template of the topic over the plays, like a mixed level', () => {
    const served = new Set(SEEDS.flatMap((seed) => questionsOf(buildLevelSession(level, pack, seed)).filter((q) => q.topicId === HOME).map(templateOf)));
    expect([...served].sort()).toEqual([...new Set(level.lookBack!.templateIds)].sort());
  });

  it('only looks back when the topic has no template of its own', () => {
    const bare = lookBackLevel(OTHERS, []);
    expect(lookBackSize(bare.lookBack!)).toEqual({ own: 0, earlier: EARLIER });
    const items = buildLevelSession(bare, pack, 4200);
    expect(items).toHaveLength(EARLIER);
    expect(earlierIn(items)).toHaveLength(EARLIER);
  });
});

describe('weakestTopics', () => {
  const [A, B, C, D] = PACKS;
  const progressWith = (mastery: Record<string, number>): Progress => {
    const p = deriveProgress([], [], NOW);
    for (const [conceptId, value] of Object.entries(mastery)) p.concepts[conceptId] = { mastery: value, lastAt: NOW, review: { box: 0, dueAt: NOW } };
    return p;
  };
  // Every concept of the pack at the same mastery, so the mastery of the topic is that number.
  const all = (p: TopicPack, value: number) => Object.fromEntries(p.concepts.map((c) => [c.id, value]));

  it('is empty for a learner who has played nothing', () => {
    expect(weakestTopics(PACKS, progressWith({}))).toEqual([]);
  });

  it('lists the topics with an attempt, lowest mastery first', () => {
    const progress = progressWith({ ...all(A, 80), ...all(B, 20), ...all(D, 50) });
    expect(weakestTopics(PACKS, progress)).toEqual([B.topicId, D.topicId, A.topicId]);
    // Only the topics asked about count: a look-back passes the ones before its own.
    expect(weakestTopics([A, B, C], progress)).toEqual([B.topicId, A.topicId]);
  });

  it('counts a topic as played from one attempted concept, and its other concepts as not known at all', () => {
    const progress = progressWith({ ...all(A, 30), [B.concepts[0].id]: 90 });
    expect(B.concepts.length).toBeGreaterThan(3);
    expect(weakestTopics(PACKS, progress)).toEqual([B.topicId, A.topicId]);
  });

  it('puts the earlier topic first of two that are equally weak', () => {
    expect(weakestTopics(PACKS, progressWith({ ...all(C, 40), ...all(A, 40), ...all(B, 40) }))).toEqual([A.topicId, B.topicId, C.topicId]);
  });
});

describe('a look-back level and what practice may serve', () => {
  // A real look-back level, with real earlier topics: the fifth topic of the course looks back on the first four.
  const B = PACKS[4];
  const lookBack = B.levels.find((l) => l.type === 'look_back')!;
  const lookBackIds = PACKS.flatMap((p) => p.levels.filter((l) => l.type === 'look_back').map((l) => l.id));
  const session = buildLevelSession(lookBack, B, 4200);
  const fromEarlier = questionsOf(session).filter((q) => q.topicId !== B.topicId);
  const empty = { templateIds: new Set<string>(), questionIds: new Set<string>() };
  const generatedBy = (packs: TopicPack[]) => new Set(packs.flatMap((p) => p.levels.flatMap((l) => l.generate?.templateIds ?? [])));

  it('is a level that asks questions of earlier topics', () => {
    expect(fromEarlier).toHaveLength(EARLIER);
    expect(new Set(fromEarlier.map((q) => q.topicId)).size).toBe(EARLIER);
    for (const q of fromEarlier) expect(PACKS.slice(0, 4).map((p) => p.topicId)).toContain(q.topicId);
  });

  it('makes nothing available when it is passed: not of its own topic, and not of an earlier one', () => {
    expect(availableItems(B, [lookBack.id])).toEqual(empty);
    expect(availableForLearner(PACKS, lookBackIds, [], false)).toEqual(empty);
    // Passed on top of other levels, it adds nothing to what they opened.
    const passed = B.levels.slice(0, 5).map((l) => l.id);
    expect(availableItems(B, [...passed, lookBack.id])).toEqual(availableItems(B, passed));
  });

  it('lists nothing as its own, so the templates of a topic are the ones its other levels generate', () => {
    for (const p of PACKS) {
      const everything = availableItems(p, p.levels.map((l) => l.id)).templateIds;
      expect(everything, p.topicId).toEqual(generatedBy([p]));
      for (const id of everything) expect(topicOf.get(id), id).toBe(p.topicId);
    }
    // With every level unlocked on the device, the same holds over all the topics.
    expect(availableForLearner(PACKS, [], [], true).templateIds).toEqual(generatedBy(PACKS));
  });

  it('opens, by an attempt at a question of an earlier topic, that one template in its own topic and nothing else', () => {
    const q = fromEarlier[0];
    const A = PACKS.find((p) => p.topicId === q.topicId)!;
    // The rule for any attempted item: the template is one the earlier topic lists, so the attempt opens it there.
    expect(availableItems(A, [], [q.id])).toEqual({ templateIds: new Set([templateOf(q)]), questionIds: new Set() });
    // The topic of the look-back does not list it, so it is not that topic's.
    expect(availableItems(B, [lookBack.id], [q.id])).toEqual(empty);
    const all = availableForLearner(PACKS, [lookBack.id], fromEarlier.map((x) => x.id), false);
    expect(all).toEqual({ templateIds: new Set(fromEarlier.map(templateOf)), questionIds: new Set() });
  });

  it('leaves practice with only what the learner has met, after a whole look-back has been played', () => {
    const attempts = questionsOf(session).map((q, i) => ({
      id: `a${i}`, profileId: 'p', courseId: 'c', topicId: B.topicId, conceptId: q.conceptId, questionId: q.id, difficulty: q.difficulty,
      correct: true, hintsUsed: 0, timeMs: 1000, at: NOW - 1000 + i, sessionId: 's', levelId: lookBack.id, sessionKind: 'level' as const,
    }));
    const progress = deriveProgress(attempts, [{ id: 'r', profileId: 'p', topicId: B.topicId, levelId: lookBack.id, score: 1, passed: true, at: NOW }], NOW);
    expect(progress.passedLevelIds).toEqual([lookBack.id]);
    const available = availableForLearner(PACKS, progress.passedLevelIds, attempts.map((a) => a.questionId), false);
    const met = new Set(questionsOf(session).map(templateOf));
    expect(available.templateIds).toEqual(met);
    const served = [
      ...buildSmartPractice(PACKS, progress, available, NOW, 1_000_000_000),
      ...buildDailyChallenge(PACKS, available, '2026-10-05'),
      ...PACKS.flatMap((p) => buildFreshQuestions(p, progress, available, 1_000_100_000)),
    ];
    expect(served.length).toBeGreaterThan(0);
    for (const q of questionsOf(served)) expect(met, q.id).toContain(templateOf(q));
  });
});
