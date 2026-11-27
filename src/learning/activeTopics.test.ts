import { describe, expect, it } from 'vitest';
import type { Card, Level, Question, TopicPack } from '@/content/types';
import { TEMPLATES } from '@/generators';
import { templatesForConcept } from '@/content/registry';
import { buildPracticeSession, type PracticeInput } from '@/play/practiceSession';
import type { AttemptEvent, LevelResult } from '@/storage/types';
import type { CardState } from './cardReview';
import { DAY_MS } from './mastery';
import { practiceCounts } from './practice';
import { deriveProgress } from './progress';
import { nextLevel, nextStep, recommendNext } from './recommend';
import type { SessionItem } from './sessionBuilder';
import { activePacks, activeTopicIds, deriveTopicActivity, mostRecentTopicId } from './topics';

// Three fake topics built from whichever concepts have generators, so nothing here depends on what the real topics
// contain or how many there are. They are in course order A, B, C.
const NOW = new Date(2026, 9, 5, 10).getTime();
const conceptsWithGenerators = [...new Set(TEMPLATES.map((t) => t.conceptId))];

function fakePack(topicId: string, conceptId: string, levelCount = 2): TopicPack {
  const templateIds = templatesForConcept(conceptId).map((t) => t.id);
  const levels: Level[] = Array.from({ length: levelCount }, (_, order) => ({
    id: `${topicId}-level-${order}`,
    topicId,
    order,
    type: 'easy_practice',
    title: `${topicId} level ${order}`,
    description: '',
    generate: { templateIds, count: 3 },
  }));
  const cards: Card[] = [1, 2, 3].map((n) => ({
    id: `${topicId}-card-${n}`,
    topicId,
    conceptId,
    kind: 'rule',
    prompt: 'p',
    answer: 'a',
    explanation: 'e',
    example: 'x',
    commonMistake: 'm',
  }));
  return { topicId, concepts: [{ id: conceptId, topicId, title: conceptId }], cards, levels, questions: [] };
}

const [CA, CB, CC] = conceptsWithGenerators;
const A = fakePack('topic-a', CA);
const B = fakePack('topic-b', CB);
const C = fakePack('topic-c', CC);
const PACKS = [A, B, C];

const attemptIn = (pack: TopicPack, at = NOW - 1000, n = 1): AttemptEvent => ({
  id: `att-${pack.topicId}-${n}-${at}`,
  profileId: 'p',
  courseId: 'c',
  topicId: pack.topicId,
  conceptId: pack.concepts[0].id,
  questionId: `gen:${pack.levels[0].generate!.templateIds[0]}:1:${n}`,
  difficulty: 'easy',
  correct: true,
  hintsUsed: 0,
  timeMs: 1,
  at,
  sessionId: `s-${pack.topicId}`,
  sessionKind: 'smart',
});
const resultIn = (pack: TopicPack, order: number, at = NOW - 1000, passed = true): LevelResult => ({
  id: `res-${pack.topicId}-${order}-${at}`,
  profileId: 'p',
  topicId: pack.topicId,
  levelId: pack.levels[order].id,
  score: 1,
  passed,
  at,
});

function input(over: { attempts?: AttemptEvent[]; levelResults?: LevelResult[]; cardStates?: Record<string, CardState>; unlockAll?: boolean; topicId?: string } = {}): PracticeInput {
  const attempts = over.attempts ?? [];
  const levelResults = over.levelResults ?? [];
  return {
    packs: PACKS,
    progress: deriveProgress(attempts, levelResults, NOW),
    attempts,
    sessionResults: [],
    cardStates: over.cardStates ?? {},
    activity: deriveTopicActivity(attempts, levelResults),
    now: NOW,
    unlockAll: over.unlockAll ?? true,
    topicId: over.topicId,
  };
}

const questions = (items: SessionItem[]): Question[] => items.flatMap((i) => (i.kind === 'question' ? [i.question] : []));
const cards = (items: SessionItem[]) => items.flatMap((i) => (i.kind === 'card' ? [i.card] : []));
/** The fake topics a session's questions came from, found through their concept. */
const topicsOf = (items: SessionItem[]) =>
  new Set(questions(items).map((q) => PACKS.find((p) => p.concepts.some((c) => c.id === q.conceptId))!.topicId));
const dueState = (): CardState => ({ review: { box: 1, dueAt: NOW - DAY_MS }, seen: 1, knownStreak: 1 });

describe('the fake topics are usable', () => {
  it('have distinct concepts, each with generators', () => {
    expect(new Set([CA, CB, CC]).size).toBe(3);
    for (const p of PACKS) expect(p.levels[0].generate!.templateIds.length).toBeGreaterThan(0);
  });
});

describe('deriveTopicActivity', () => {
  it('records the latest attempt or level result of each topic, and nothing for a topic never played', () => {
    const activity = deriveTopicActivity(
      [attemptIn(A, 100), attemptIn(A, 300, 2), attemptIn(B, 200)],
      [resultIn(B, 0, 500), resultIn(C, 0, 50)],
    );
    expect(activity['topic-a']).toBe(300);
    expect(activity['topic-b']).toBe(500);
    expect(activity['topic-c']).toBe(50);
    expect(deriveTopicActivity([], [])).toEqual({});
  });

  it('ignores an event with no topic, and is safe for ids that are object keys', () => {
    expect(deriveTopicActivity([{ topicId: '', at: 5 }], [])).toEqual({});
    const activity = deriveTopicActivity([{ topicId: 'constructor', at: 5 }], []);
    expect(activeTopicIds(PACKS, activity)).toEqual(['topic-a']);
  });
});

describe('activeTopicIds', () => {
  it('is the first topic in course order when nothing has been played', () => {
    expect(activeTopicIds(PACKS, {})).toEqual(['topic-a']);
    expect(activeTopicIds(PACKS.slice().reverse(), {})).toEqual(['topic-c']);
  });

  it('is every topic with an attempt or a level result, in course order and not in the order played', () => {
    expect(activeTopicIds(PACKS, deriveTopicActivity([attemptIn(C)], []))).toEqual(['topic-c']);
    expect(activeTopicIds(PACKS, deriveTopicActivity([attemptIn(C, 5)], [resultIn(B, 0, 9)]))).toEqual(['topic-b', 'topic-c']);
  });

  it('counts a level result that was not passed', () => {
    expect(activeTopicIds(PACKS, deriveTopicActivity([], [resultIn(B, 0, 5, false)]))).toEqual(['topic-b']);
  });

  it('ignores topics that are not among the playable packs, and is empty with no packs', () => {
    expect(activeTopicIds(PACKS, { 'retired-topic': 5 })).toEqual(['topic-a']);
    expect(activeTopicIds([], { 'topic-a': 5 })).toEqual([]);
    expect(activePacks(PACKS, deriveTopicActivity([attemptIn(B)], [])).map((p) => p.topicId)).toEqual(['topic-b']);
  });
});

describe('mostRecentTopicId', () => {
  it('is the topic with the latest attempt or level result', () => {
    expect(mostRecentTopicId(PACKS, deriveTopicActivity([attemptIn(A, 100), attemptIn(B, 200)], []))).toBe('topic-b');
    expect(mostRecentTopicId(PACKS, deriveTopicActivity([attemptIn(B, 200)], [resultIn(A, 0, 300)]))).toBe('topic-a');
  });

  it('is the first topic when none was played, the earlier topic on a tie, and undefined with no packs', () => {
    expect(mostRecentTopicId(PACKS, {})).toBe('topic-a');
    expect(mostRecentTopicId(PACKS, { 'topic-c': 7, 'topic-b': 7 })).toBe('topic-b');
    expect(mostRecentTopicId([], {})).toBeUndefined();
  });
});

describe('smart practice, the daily mission and the daily challenge draw from the active topics only', () => {
  const modes = ['smart', 'mission', 'daily'] as const;

  it('serve a brand-new learner the first topic only, with every level unlocked', () => {
    for (const mode of modes) {
      const items = buildPracticeSession(mode, input());
      expect(questions(items).length, mode).toBeGreaterThan(0);
      expect([...topicsOf(items)], mode).toEqual(['topic-a']);
    }
  });

  it('serve the topics the learner has attempted or has a level result in, and no others', () => {
    for (const mode of modes) {
      const items = buildPracticeSession(mode, input({ attempts: [attemptIn(C)], levelResults: [resultIn(B, 0)] }));
      expect(questions(items).length, mode).toBeGreaterThan(0);
      expect([...topicsOf(items)].sort(), mode).not.toContain('topic-a');
      for (const t of topicsOf(items)) expect(['topic-b', 'topic-c'], mode).toContain(t);
    }
  });

  it('then apply the availability rule inside them: with locking on, only what a passed level lists', () => {
    // One topic whose first level lists the generators of one concept and whose second level those of another.
    const split: TopicPack = {
      ...B,
      concepts: [
        { id: CB, topicId: 'topic-b', title: CB },
        { id: CC, topicId: 'topic-b', title: CC },
      ],
      levels: [
        { ...B.levels[0], generate: { templateIds: templatesForConcept(CB).map((t) => t.id), count: 3 } },
        { ...B.levels[1], generate: { templateIds: templatesForConcept(CC).map((t) => t.id), count: 3 } },
      ],
    };
    const attempts: AttemptEvent[] = [];
    const levelResults = [resultIn(split, 0)];
    const base = { ...input({ levelResults }), packs: [split], unlockAll: false };
    for (const mode of ['smart', 'daily', 'mission'] as const) {
      const items = buildPracticeSession(mode, base);
      expect(questions(items).length, mode).toBeGreaterThan(0);
      for (const q of questions(items)) expect(q.conceptId, mode).toBe(CB);
    }
    const both = [resultIn(split, 0), resultIn(split, 1)];
    const seen = new Set(
      questions(buildPracticeSession('smart', { ...input({ levelResults: both, attempts }), packs: [split], unlockAll: false })).map((q) => q.conceptId),
    );
    expect(seen).toEqual(new Set([CB, CC]));
  });

  it('serve nothing from a topic that is active but has no passed level, with locking on', () => {
    // The only play is a failed level result: the topic is active, nothing in it is available yet.
    const failed = resultIn(B, 0, NOW - 1000, false);
    expect(buildPracticeSession('smart', { ...input({ levelResults: [failed] }), unlockAll: false })).toEqual([]);
    expect(buildPracticeSession('daily', { ...input({ levelResults: [failed] }), unlockAll: false })).toEqual([]);
  });

  it('with locking on and nothing played, serve nothing (the first topic is chosen but nothing in it is passed)', () => {
    for (const mode of modes) expect(buildPracticeSession(mode, { ...input(), unlockAll: false }), mode).toEqual([]);
  });
});

describe('rule cards: due cards from any topic, new cards from the active topics', () => {
  it('offers only the first topic’s new cards to a new learner', () => {
    const items = buildPracticeSession('cards', input());
    expect(cards(items).length).toBeGreaterThan(0);
    for (const c of cards(items)) expect(c.topicId).toBe('topic-a');
    expect(cards(items)).toHaveLength(Math.min(10, A.cards.length));
  });

  it('serves a due card of an inactive topic first, then new cards of the active topics', () => {
    const states = { 'topic-c-card-2': dueState() };
    const items = buildPracticeSession('cards', input({ cardStates: states, attempts: [attemptIn(B)] }));
    expect(cards(items).map((c) => c.id)).toEqual(['topic-c-card-2', 'topic-b-card-1', 'topic-b-card-2', 'topic-b-card-3']);
  });

  it('keeps a seen card that is not due out of the session', () => {
    const states: Record<string, CardState> = {
      'topic-a-card-1': { review: { box: 3, dueAt: NOW + 5 * DAY_MS }, seen: 2, knownStreak: 2 },
    };
    expect(cards(buildPracticeSession('cards', input({ cardStates: states }))).map((c) => c.id)).toEqual(['topic-a-card-2', 'topic-a-card-3']);
  });

  it('starts a mission with the same cards', () => {
    const states = { 'topic-c-card-1': dueState() };
    const items = buildPracticeSession('mission', input({ cardStates: states, attempts: [attemptIn(B)] }));
    expect(cards(items).map((c) => c.id)).toEqual(['topic-c-card-1', 'topic-b-card-1', 'topic-b-card-2', 'topic-b-card-3']);
    expect(items.findIndex((i) => i.kind === 'question')).toBeGreaterThan(cards(items).length - 1);
  });

  it('counts only the new cards of the active topics, and the due cards of all', () => {
    const progress = deriveProgress([], [], NOW);
    const states = { 'topic-c-card-1': dueState() };
    const activeA = activeTopicIds(PACKS, {});
    expect(practiceCounts(PACKS, progress, states, NOW, activeA)).toMatchObject({ due: 1, fresh: A.cards.length });
    const activeBC = activeTopicIds(PACKS, { 'topic-b': 1, 'topic-c': 2 });
    expect(practiceCounts(PACKS, progress, states, NOW, activeBC)).toMatchObject({ due: 1, fresh: B.cards.length + C.cards.length - 1 });
    // Without a scope every card counts, as before.
    expect(practiceCounts(PACKS, progress, {}, NOW).fresh).toBe(A.cards.length + B.cards.length + C.cards.length);
  });
});

describe('fresh questions and topic practice', () => {
  it('without a topic come from the topic played most recently', () => {
    const items = buildPracticeSession('fresh', input({ attempts: [attemptIn(A, 100)], levelResults: [resultIn(C, 0, 200)] }));
    expect(questions(items).length).toBeGreaterThan(0);
    expect([...topicsOf(items)]).toEqual(['topic-c']);
  });

  it('come from the first topic for a new learner', () => {
    expect([...topicsOf(buildPracticeSession('fresh', input()))]).toEqual(['topic-a']);
  });

  it('with a topic come from that topic only, even when the learner has not played it', () => {
    const items = buildPracticeSession('fresh', input({ attempts: [attemptIn(A)], topicId: 'topic-c' }));
    expect(questions(items).length).toBeGreaterThan(0);
    expect([...topicsOf(items)]).toEqual(['topic-c']);
  });

  it('open the topic asked for whole, whatever has been passed, and give nothing for an unknown topic', () => {
    // A topic the learner chose is practised as in the Playground: nothing passed, levels locked, and still questions.
    const fresh = buildPracticeSession('fresh', { ...input({ topicId: 'topic-b' }), unlockAll: false });
    expect(fresh.length).toBeGreaterThan(0);
    expect([...topicsOf(fresh)]).toEqual(['topic-b']);
    const passed = buildPracticeSession('fresh', { ...input({ topicId: 'topic-b', levelResults: [resultIn(B, 0)] }), unlockAll: false });
    expect([...topicsOf(passed)]).toEqual(['topic-b']);
    expect(buildPracticeSession('fresh', input({ topicId: 'nope' }))).toEqual([]);
  });

  it('keep to what the levels have opened when no topic is asked for (the topic played most recently)', () => {
    expect(buildPracticeSession('fresh', { ...input({}), unlockAll: false })).toEqual([]);
  });

  it('lean towards the concepts the learner knows least', () => {
    // One topic with two concepts; the learner knows the first well and has not touched the second.
    const [x, y] = conceptsWithGenerators;
    const ids = (c: string) => templatesForConcept(c).map((t) => t.id);
    const two: TopicPack = {
      ...A,
      concepts: [
        { id: x, topicId: 'topic-a', title: x },
        { id: y, topicId: 'topic-a', title: y },
      ],
      levels: [{ ...A.levels[0], generate: { templateIds: [...ids(x), ...ids(y)], count: 3 } }],
    };
    const base = input({ topicId: 'topic-a' });
    const progress = {
      ...base.progress,
      concepts: { [x]: { mastery: 100, lastAt: NOW, review: { box: 5, dueAt: NOW + 30 * DAY_MS } } },
    };
    const items = buildPracticeSession('fresh', { ...base, packs: [two], progress });
    expect(questions(items)).toHaveLength(10);
    expect(questions(items).filter((q) => q.conceptId === y).length).toBeGreaterThanOrEqual(8);
  });
});

describe('where to carry on: nextStep', () => {
  const passed = (...packs: TopicPack[]) => packs.flatMap((p) => p.levels.map((l) => l.id));
  const step = (passedIds: string[], levelActivity: Record<string, number> = {}, unlockAll = false) => nextStep(PACKS, passedIds, unlockAll, levelActivity);
  const next = (passedIds: string[], levelActivity: Record<string, number> = {}, unlockAll = false) => step(passedIds, levelActivity, unlockAll)?.level.id;

  it('is the first level of the first topic for a new learner, who is told to start there', () => {
    expect(next([])).toBe('topic-a-level-0');
    expect(next([], {}, true)).toBe('topic-a-level-0');
    expect(step([])).toMatchObject({ why: 'start', passed: 0, total: 2 });
    expect(nextLevel(PACKS, [])?.level.id).toBe('topic-a-level-0');
  });

  it('carries on in a topic the learner is part-way through, though an earlier topic is not started', () => {
    expect(next(['topic-b-level-0'], { 'topic-b': 5 })).toBe('topic-b-level-1');
    expect(step(['topic-b-level-0'], { 'topic-b': 5 })).toMatchObject({ why: 'continue', passed: 1, total: 2 });
    // A level played but not passed is a start in that topic too.
    expect(step([], { 'topic-c': 5 })).toMatchObject({ level: { id: 'topic-c-level-0' }, why: 'continue', passed: 0 });
    // Passed without a time known (another device, a restored backup): still part-way.
    expect(next(['topic-b-level-0'])).toBe('topic-b-level-1');
  });

  it('of two topics part-way through, follows the ladder played most recently, then the course order', () => {
    expect(next(['topic-a-level-0', 'topic-b-level-0'], { 'topic-a': 1, 'topic-b': 9 })).toBe('topic-b-level-1');
    expect(next(['topic-a-level-0', 'topic-b-level-0'], { 'topic-a': 9, 'topic-b': 1 })).toBe('topic-a-level-1');
    expect(next(['topic-a-level-0', 'topic-b-level-0'])).toBe('topic-a-level-1');
  });

  it('never jumps to a topic only because something else was played in it (a case, practice): the times are of ladders only', () => {
    // Part-way through A; B has no level played, whatever else was done in it.
    expect(next(['topic-a-level-0'], { 'topic-a': 1 })).toBe('topic-a-level-1');
  });

  it('with every level unlocked is still the first level not passed, not simply the first level', () => {
    expect(next(['topic-b-level-0'], { 'topic-b': 5 }, true)).toBe('topic-b-level-1');
    expect(next(['topic-b-level-1'], { 'topic-b': 5 }, true)).toBe('topic-b-level-0');
  });

  it('goes to the earliest unfinished topic in course order when no topic is part-way', () => {
    expect(step(passed(B), { 'topic-b': 5 })).toMatchObject({ level: { id: 'topic-a-level-0' }, why: 'next-topic' });
    expect(step(passed(A), { 'topic-a': 5 })).toMatchObject({ level: { id: 'topic-b-level-0' }, why: 'next-topic' });
    expect(next(passed(A, C), { 'topic-c': 5 })).toBe('topic-b-level-0');
  });

  it('is undefined when every level is passed', () => {
    expect(step(passed(A, B, C), { 'topic-b': 5 })).toBeUndefined();
  });
});

describe('recommendNext follows the next step', () => {
  it('suggests its next level, and the first topic’s first level to a new learner', () => {
    const progress = deriveProgress([], [resultIn(B, 0)], NOW);
    const levelActivity = deriveTopicActivity([], [resultIn(B, 0)]);
    const rec = recommendNext({ packs: PACKS, progress, states: {}, levelActivity, now: NOW });
    expect(rec).toMatchObject({ kind: 'level', href: '/play/topic-b-level-1' });

    const fresh = recommendNext({ packs: PACKS, progress: deriveProgress([], [], NOW), states: {}, now: NOW });
    expect(fresh).toMatchObject({ kind: 'level', href: '/play/topic-a-level-0' });
  });

  it('moves to the earliest unfinished topic when the one part-way is finished, and to practice when everything is', () => {
    const doneB = PACKS.flatMap((p) => (p === B ? p.levels.map((l, i) => resultIn(p, i)) : []));
    const levelActivity = deriveTopicActivity([], doneB);
    const progress = deriveProgress([], doneB, NOW);
    expect(recommendNext({ packs: PACKS, progress, states: {}, levelActivity, now: NOW }).href).toBe('/play/topic-a-level-0');

    const all = PACKS.flatMap((p) => p.levels.map((l, i) => resultIn(p, i)));
    const rec = recommendNext({ packs: PACKS, progress: deriveProgress([], all, NOW), states: {}, levelActivity: deriveTopicActivity([], all), now: NOW });
    expect(rec.kind).toBe('smart');
  });
});
