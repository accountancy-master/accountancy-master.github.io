import { describe, expect, it, vi } from 'vitest';
import { findQuestion, packsOf } from '@/content/registry';
import { outlinesOf, topicsOfQuestions } from '@/content/outline';
import { CASE_STAGES, TEMPLATES } from '@/generators';
import type { TopicPack } from '@/content/types';
import { deriveCardStates } from '@/learning/cardReview';
import { buildCaseSession } from '@/learning/caseStudies';
import { buildPaper, paperTopics, type PaperRef } from '@/learning/mockPaper';
import { buildMistakeReview, makeSession, openMistakeIds, openMistakes } from '@/learning/practice';
import { deriveProgress, weakestTopics } from '@/learning/progress';
import { buildLevelSession, earlierTopicsOf, type SessionItem } from '@/learning/sessionBuilder';
import { deriveTopicActivity } from '@/learning/topics';
import type { AttemptEvent, CardReviewEvent, LevelResult } from '@/storage/types';
import { PRACTICE_MODES, type PracticeMode } from './practiceModes';
import { buildPracticeSession, planPracticeSession, preparePracticeSession, type PracticeInput } from './practiceSession';
import { levelSeed, seedOrder } from './seed';

// Every session says which topics it needs before it is made. Here each kind of session is chosen from the outlines
// (as the app chooses it, with no topic loaded), and must then be the very session the whole bank gives; and in an
// app that has loaded the topics it named and no other, it must be made without asking for anything else.

const NOW = new Date(2026, 9, 5, 10).getTime();
const DAY = 86_400_000;

// The learner of these tests is on Class 11: what they practise, play and are set papers from is that course's.
const PACKS = packsOf('cbse-11-accountancy');
const OUTLINES = outlinesOf('cbse-11-accountancy');
const [FIRST, SECOND, THIRD] = PACKS;
const LAST = PACKS[PACKS.length - 1];
const MIDDLE = PACKS[Math.floor(PACKS.length / 2)];

const passAll = (pack: TopicPack, at: number): LevelResult[] =>
  pack.levels.map((l) => ({ id: `r-${l.id}`, profileId: 'p', topicId: pack.topicId, levelId: l.id, score: 1, passed: true, at }));

const attempt = (pack: TopicPack, questionId: string, conceptId: string, correct: boolean, at: number, sessionId = 's1'): AttemptEvent => ({
  id: `a-${questionId}-${at}`,
  profileId: 'p',
  courseId: 'c',
  topicId: pack.topicId,
  conceptId,
  questionId,
  difficulty: 'easy',
  correct,
  hintsUsed: 0,
  timeMs: 1,
  at,
  sessionId,
  sessionKind: 'level',
});

const review = (pack: TopicPack, n: number, at: number): CardReviewEvent[] =>
  pack.cards.slice(0, n).map((c) => ({ id: `c-${c.id}`, profileId: 'p', courseId: 'c', topicId: pack.topicId, cardId: c.id, conceptId: c.conceptId, known: true, at, sessionId: 'cards' }));

/** A generated question of a topic that was answered wrongly: an open mistake that only that topic can show again. */
const missedGenerated = (pack: TopicPack, seed: number, at: number): AttemptEvent => {
  const t = TEMPLATES.find((x) => x.topicId === pack.topicId)!;
  return attempt(pack, `gen:${t.id}:${t.version}:${seed}`, t.conceptId, false, at, `miss-${pack.topicId}`);
};
const missedAuthored = (pack: TopicPack, at: number): AttemptEvent => attempt(pack, pack.questions[0].id, pack.questions[0].conceptId, false, at, `miss-${pack.topicId}`);

interface Learner {
  name: string;
  attempts: AttemptEvent[];
  levelResults: LevelResult[];
  cardReviews: CardReviewEvent[];
  unlockAll?: boolean;
}

const LEARNERS: Learner[] = [
  { name: 'a new learner', attempts: [], levelResults: [], cardReviews: [] },
  { name: 'a new learner on a device with every level open', attempts: [], levelResults: [], cardReviews: [], unlockAll: true },
  {
    name: 'a learner who has finished two topics that are apart, with cards due in a third and mistakes in a fourth',
    attempts: [
      attempt(SECOND, SECOND.questions[0].id, SECOND.questions[0].conceptId, true, NOW - 3 * DAY),
      attempt(LAST, LAST.questions[0].id, LAST.questions[0].conceptId, true, NOW - 2 * DAY),
      // Mistakes in a topic the learner has otherwise not played: it becomes an active one, as any attempt makes it.
      missedGenerated(MIDDLE, 41, NOW - DAY),
      missedAuthored(MIDDLE, NOW - DAY + 1),
    ],
    levelResults: [...passAll(SECOND, NOW - 3 * DAY), ...passAll(LAST, NOW - 2 * DAY)],
    // Reviewed long ago, so they are due; the topic itself was never played.
    cardReviews: review(THIRD, 3, NOW - 40 * DAY),
  },
  {
    name: 'a learner who has only revised cards and made one mistake',
    attempts: [missedGenerated(LAST, 9, NOW - DAY)],
    levelResults: [],
    cardReviews: [...review(FIRST, 2, NOW - 30 * DAY), ...review(MIDDLE, 2, NOW - 30 * DAY)],
  },
];

const inputOf = <P,>(learner: Learner, packs: readonly P[]) => ({
  packs,
  progress: deriveProgress(learner.attempts, learner.levelResults, NOW, [], learner.cardReviews),
  attempts: learner.attempts,
  sessionResults: [],
  cardStates: deriveCardStates(learner.cardReviews),
  activity: deriveTopicActivity(learner.attempts, learner.levelResults),
  now: NOW,
  unlockAll: learner.unlockAll,
});

const topicsIn = (items: SessionItem[]): string[] => {
  const found = new Set(items.flatMap((i) => (i.kind === 'question' ? [i.question.topicId] : i.kind === 'card' ? [i.card.topicId] : [])));
  return PACKS.filter((p) => found.has(p.topicId)).map((p) => p.topicId);
};

/** The app as a browser tab has it: the generated outline, and no topic until one is loaded. */
async function freshApp() {
  vi.resetModules();
  const [loader, loaded, outline, practice, levels, papers, cases] = await Promise.all([
    import('@/content/loadTopics'),
    import('@/content/loaded'),
    import('@/content/outline'),
    import('./practiceSession'),
    import('@/learning/sessionBuilder'),
    import('@/learning/mockPaper'),
    import('@/learning/caseStudies'),
  ]);
  return { ...loader, ...loaded, outline, ...practice, ...levels, ...papers, ...cases };
}

describe('a practice session says which topics it needs', () => {
  for (const learner of LEARNERS) {
    describe(learner.name, () => {
      for (const mode of PRACTICE_MODES) {
        it(`${mode}: chosen from the outlines it is the session the packs give, and it names the topics of what it serves`, () => {
          const whole = buildPracticeSession(mode, inputOf(learner, PACKS));
          const prepared = preparePracticeSession(mode, inputOf(learner, OUTLINES));
          expect(prepared.make()).toEqual(whole);
          if (mode === 'mistakes') {
            // Every open mistake is looked up before the first few are served, so every one's topic is needed.
            expect(prepared.topicIds).toEqual(topicsOfQuestions(openMistakeIds(inputOf(learner, PACKS).progress)));
          } else {
            expect(prepared.topicIds).toEqual(topicsIn(whole));
            expect(makeSession(planPracticeSession(mode, inputOf(learner, OUTLINES)), PACKS)).toEqual(whole);
          }
        });
      }

      it('every mode is made in an app that has loaded the topics the session named, and no other', async () => {
        for (const mode of PRACTICE_MODES) {
          const whole = buildPracticeSession(mode, inputOf(learner, PACKS));
          const app = await freshApp();
          const input: PracticeInput<(typeof app.outline.OUTLINES)[number]> = inputOf(learner, app.outline.OUTLINES);
          const prepared = app.preparePracticeSession(mode as PracticeMode, input);
          if (whole.some((i) => i.kind !== 'lesson') && prepared.topicIds.length > 0) expect(() => prepared.make(), mode).toThrow(/is not loaded/);
          await app.loadTopics(prepared.topicIds);
          expect(prepared.make(), mode).toEqual(whole);
          expect(PACKS.filter((p) => app.isTopicLoaded(p.topicId)).map((p) => p.topicId), mode).toEqual(prepared.topicIds);
        }
      }, 60_000);
    });
  }

  it('the learners above cover sessions over several topics, cards of a topic that was never played, and mistakes of two kinds', () => {
    const busy = LEARNERS[2];
    expect(preparePracticeSession('smart', inputOf(busy, OUTLINES)).topicIds.length).toBeGreaterThan(1);
    expect(preparePracticeSession('cards', inputOf(busy, OUTLINES)).topicIds).toContain(THIRD.topicId);
    expect(preparePracticeSession('mistakes', inputOf(busy, OUTLINES)).topicIds).toEqual([MIDDLE.topicId]);
    expect(openMistakes(inputOf(busy, PACKS).progress).map((m) => m.questionId).sort()).toEqual(openMistakeIds(inputOf(busy, PACKS).progress).sort());
    expect(buildMistakeReview(inputOf(busy, PACKS).progress)).toHaveLength(2);
    for (const m of openMistakes(inputOf(busy, PACKS).progress)) expect(findQuestion(m.questionId)).toEqual(m.question);
  });
});

describe('a level says which earlier topics it asks about', () => {
  const lookBacks = PACKS.flatMap((pack, topicIndex) => pack.levels.filter((l) => l.type === 'look_back').map((level) => ({ pack, level, topicIndex })));
  const busy = LEARNERS[2];
  const progress = deriveProgress(busy.attempts, busy.levelResults, NOW);

  it('names, for a look-back, exactly the earlier topics of the questions that play of it asks, and none for any other level', () => {
    expect(lookBacks.length).toBeGreaterThan(0);
    for (const { pack, level, topicIndex } of lookBacks) {
      for (const play of [0, 1, 7]) {
        for (const weakestTopicIds of [[], weakestTopics(PACKS.slice(0, topicIndex), progress)]) {
          const seed = levelSeed(seedOrder(level, topicIndex), play);
          const asked = new Set(buildLevelSession(level, pack, seed, { weakestTopicIds }).flatMap((i) => (i.kind === 'question' ? [i.question.topicId] : [])));
          asked.delete(pack.topicId);
          expect([...earlierTopicsOf(level, seed, { weakestTopicIds })].sort(), `${level.id} play ${play}`).toEqual([...asked].sort());
        }
      }
    }
    for (const pack of [FIRST, MIDDLE]) for (const level of pack.levels.filter((l) => l.type !== 'look_back')) expect(earlierTopicsOf(level, 100)).toEqual([]);
  });

  it('is played in an app that has loaded its own topic and those earlier ones, and no other', async () => {
    const { pack, level, topicIndex } = lookBacks[lookBacks.length - 1];
    const seed = levelSeed(seedOrder(level, topicIndex), 2);
    const whole = buildLevelSession(level, pack, seed);
    const app = await freshApp();
    await app.loadTopics([pack.topicId]);
    const loadedPack = app.getTopicPack(pack.topicId)!;
    const loadedLevel = loadedPack.levels.find((l) => l.id === level.id)!;
    const earlier = app.earlierTopicsOf(loadedLevel, seed);
    expect(earlier.length).toBeGreaterThan(0);
    expect(() => app.buildLevelSession(loadedLevel, loadedPack, seed)).toThrow(/is not loaded/);
    await app.loadTopics(earlier);
    expect(app.buildLevelSession(loadedLevel, loadedPack, seed)).toEqual(whole);
    expect(PACKS.filter((p) => app.isTopicLoaded(p.topicId)).length).toBe(1 + earlier.length);
    expect(1 + earlier.length).toBeLessThan(PACKS.length);
  });
});

describe('a mock paper says which topics it draws on', () => {
  const topicsOfPaper = (ref: PaperRef) => {
    const found = new Set(buildPaper(ref).entries.map((e) => e.topicId));
    return PACKS.filter((p) => found.has(p.topicId)).map((p) => p.topicId);
  };

  it('a topic test its topic, a half-yearly paper the first eight topics, a full paper every topic', () => {
    expect(paperTopics({ kind: 'topic', topicId: MIDDLE.topicId, number: 1 })).toEqual([MIDDLE.topicId]);
    expect(paperTopics({ kind: 'half', number: 1 })).toEqual(PACKS.slice(0, 8).map((p) => p.topicId));
    expect(paperTopics({ kind: 'full', number: 1 })).toEqual(PACKS.map((p) => p.topicId));
    expect(paperTopics({ kind: 'topic', topicId: 'no-such-topic', number: 1 })).toEqual([]);
    // What a paper asks never comes from a topic it did not name.
    for (const ref of [{ kind: 'topic', topicId: MIDDLE.topicId, number: 3 }, { kind: 'half', number: 2 }] as PaperRef[]) {
      for (const topicId of topicsOfPaper(ref)) expect(paperTopics(ref)).toContain(topicId);
    }
  });

  it('is built in an app that has loaded those topics and no other, and not before', async () => {
    for (const ref of [{ kind: 'topic', topicId: MIDDLE.topicId, number: 2 }, { kind: 'half', number: 1 }] as PaperRef[]) {
      const whole = buildPaper(ref);
      const app = await freshApp();
      expect(() => app.buildPaper(ref)).toThrow(/is not loaded/);
      await app.loadTopics(app.paperTopics(ref));
      expect(app.buildPaper(ref).entries).toEqual(whole.entries);
      expect(PACKS.filter((p) => app.isTopicLoaded(p.topicId)).map((p) => p.topicId)).toEqual(paperTopics(ref));
    }
  }, 60_000);
});

describe('a case study comes with the topic of its stage', () => {
  it('is played in an app that has loaded that topic and no other', async () => {
    const stage = CASE_STAGES.find((s) => s.cases.length > 0)!;
    const whole = buildCaseSession(stage.cases[0].id, 1_000_600_000);
    const app = await freshApp();
    const outline = app.outline.STAGES.find((s) => s.id === stage.id)!;
    expect(outline.cases.map((c) => c.id)).toEqual(stage.cases.map((c) => c.id));
    expect(() => app.buildCaseSession(outline.cases[0].id, 1_000_600_000)).toThrow(/is not loaded/);
    await app.loadTopics([outline.topicId]);
    expect(app.buildCaseSession(outline.cases[0].id, 1_000_600_000)).toEqual(whole);
    expect(PACKS.filter((p) => app.isTopicLoaded(p.topicId)).map((p) => p.topicId)).toEqual([stage.topicId]);
  });
});
