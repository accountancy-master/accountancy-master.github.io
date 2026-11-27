import { describe, expect, it, vi } from 'vitest';
import { describeTopicSize } from '@/components/topic/size';
import { renderCatalogue } from '@/content/catalogueSource';
import { ALL_PACKS, COURSES, PACKS, findQuestion, getTopicPack, packsOf, templatesForConcept, topicSize } from '@/content/registry';
import type { Level, Question, TopicPack } from '@/content/types';
import { validatePack } from '@/content/validate';
import { CASES, CASE_STAGES, TEMPLATES, buildCase, generateCaseQuestions, generateQuestion, parseCasePartId, parseGenId } from '@/generators';
import { CONFIG } from '@/learning/config';
import {
  availableForLearner,
  buildDailyChallenge,
  buildDailyMission,
  buildFreshQuestions,
  buildMistakeReview,
  buildSmartPractice,
  openMistakes,
  practiceSeed,
} from '@/learning/practice';
import { deriveProgress, scoreLevel, topicMastery } from '@/learning/progress';
import { buildLevelSession, countScored, type SessionItem } from '@/learning/sessionBuilder';
import { casePosition } from '@/play/caseStudy';
import { buildPracticeSession } from '@/play/practiceSession';
import { PRACTICE_MODES } from '@/play/practiceModes';
import { levelSeed, seedOrder } from '@/play/seed';
import { canInsertSimilar, sessionReducer, startSession } from '@/play/session';
import { similarTo } from '@/play/similar';
import { deriveTopicActivity } from '@/learning/topics';
import type { AttemptEvent, LevelResult } from '@/storage/types';
import { SAMPLE_CASE, SAMPLE_CASE_CONCEPT, SAMPLE_CASE_TOPIC, SECOND_SAMPLE_CASE } from '@/testing/sampleCase';

// The first stage is given the two sample cases, so everything here runs on a stage that has cases whatever the real
// stages hold: the registry adds the stage's level and concept, and the questions of the cases regenerate from their ids.
// The stand-in keeps the module's other exports: other stages import helpers from it.
vi.mock('@/generators/cases/accounting-cycle', async (importOriginal) => {
  const { SAMPLE_CASE, SECOND_SAMPLE_CASE } = await import('@/testing/sampleCase');
  return { ...(await importOriginal<object>()), default: [SAMPLE_CASE, SECOND_SAMPLE_CASE] };
});

const NOW = new Date(2026, 9, 5, 10).getTime();
const stage = CASE_STAGES[0];
const pack = getTopicPack(stage.topicId)!;
const level = pack.levels.at(-1)!;
const PARTS = SAMPLE_CASE.parts.length;
const caseIds = [SAMPLE_CASE.id, SECOND_SAMPLE_CASE.id];

const questionsOf = (items: SessionItem[]): Question[] => items.flatMap((i) => (i.kind === 'question' ? [i.question] : []));
const play = (n: number) => questionsOf(buildLevelSession(level, pack, levelSeed(level.order, n)));
const caseOf = (q: Question) => parseCasePartId(parseGenId(q.id)?.templateId ?? '')?.caseId;
/** True for a question that belongs to a case study, told by its id and by the case text it carries. */
const ofCase = (q: Question) => caseOf(q) !== undefined || q.context !== undefined;

describe('the sample case', () => {
  it('belongs to the stage it stands in for, and is a case as the harness wants one', () => {
    expect(stage.cases).toEqual([SAMPLE_CASE, SECOND_SAMPLE_CASE]);
    expect({ topicId: stage.topicId, conceptId: stage.conceptId }).toEqual({ topicId: SAMPLE_CASE_TOPIC, conceptId: SAMPLE_CASE_CONCEPT });
    expect(PARTS).toBe(5);
    expect(new Set(SAMPLE_CASE.parts.map((p) => p.kind))).toEqual(new Set(['journal', 'numeric', 'mcq']));
    for (let seed = 1; seed <= 100; seed++) {
      const built = buildCase(SAMPLE_CASE, seed);
      expect('invalid' in built ? built.invalid : '', `seed ${seed}`).toBe('');
    }
    // As long as a case may be: fourteen lines, one of them long enough to wrap on a phone.
    const lines = generateCaseQuestions(SAMPLE_CASE.id, 7)[0].context!.split('\n');
    expect(lines).toHaveLength(14);
    expect(lines[0].length).toBeGreaterThan(100);
  });
});

describe('the Case study level of a stage that has cases', () => {
  it('ends the ladder of the stage\'s topic, after its Look back level', () => {
    expect(pack.levels.slice(-2).map((l) => l.type)).toEqual(['look_back', 'case_study']);
    expect(level).toEqual({
      id: `${stage.topicId}-case-study-${stage.id}`,
      topicId: stage.topicId,
      order: pack.levels.length - 1,
      type: 'case_study',
      title: `Case study: ${stage.title}`,
      description: stage.description,
      cases: { caseIds },
    });
  });

  it('is added for each stage that has cases: a stage without cases adds no level and no concept', () => {
    const levels = PACKS.flatMap((p) => p.levels.filter((l) => l.type === 'case_study'));
    expect(levels).toContainEqual(level);
    expect(levels.map((l) => l.id)).toEqual(expect.arrayContaining(CASE_STAGES.filter((s) => s.cases.length > 0).map((s) => `${s.topicId}-case-study-${s.id}`)));
    expect(levels).toHaveLength(CASE_STAGES.filter((s) => s.cases.length > 0).length);
    for (const empty of CASE_STAGES.filter((s) => s.cases.length === 0)) {
      expect(ALL_PACKS.flatMap((p) => p.concepts).some((c) => c.id === empty.conceptId), empty.id).toBe(false);
    }
  });

  it('puts the stage\'s concept among the concepts of the topic, named after the stage', () => {
    expect(pack.concepts.at(-1)).toEqual({ id: stage.conceptId, topicId: stage.topicId, title: `Case study: ${stage.title}` });
    expect(pack.concepts.filter((c) => c.id === stage.conceptId)).toHaveLength(1);
    expect(PACKS.filter((p) => p.concepts.some((c) => c.id === stage.conceptId))).toEqual([pack]);
    // Every question of every case counts towards that concept, in that topic.
    for (const c of stage.cases) {
      for (const q of generateCaseQuestions(c.id, 3)) expect({ topicId: q.topicId, conceptId: q.conceptId }).toEqual({ topicId: pack.topicId, conceptId: stage.conceptId });
    }
  });

  it('leaves the pack valid, and a case of another topic or of a concept the pack lacks is reported', () => {
    for (const p of ALL_PACKS) expect(validatePack(p), p.topicId).toEqual([]);
    const without: TopicPack = { ...pack, concepts: pack.concepts.filter((c) => c.id !== stage.conceptId) };
    expect(validatePack(without)).toEqual(caseIds.map((id) => `level ${level.id}: case ${id} has unknown concept ${stage.conceptId}`));
    const other = PACKS.find((p) => p !== pack)!;
    const moved: TopicPack = { ...other, levels: [...other.levels, { ...level, topicId: other.topicId, order: other.levels.length }] };
    expect(validatePack(moved)).toEqual(caseIds.map((id) => `level ${level.id}: case ${id} belongs to topic ${stage.topicId}`));
  });

  it('is counted on the Topics screen and listed in the catalogue', () => {
    expect(topicSize(stage.topicId).cases).toBe(2);
    expect(describeTopicSize(topicSize(stage.topicId))).toMatch(/ question types · 2 case studies · \d+ set questions · \d+ rule cards$/);
    // Every other topic counts the cases of its own stage, and a topic with no stage counts none.
    for (const p of PACKS.filter((x) => x !== pack)) {
      const own = CASE_STAGES.filter((s) => s.topicId === p.topicId).reduce((n, s) => n + s.cases.length, 0);
      expect(topicSize(p.topicId).cases, p.topicId).toBe(own);
    }
    expect(renderCatalogue()).toContain(`"${level.id}"`);
  });
});

describe('the turns of the cases of a level', () => {
  it('start with the first case on the first play and go on in order, however many cases the stage has', () => {
    for (const s of CASE_STAGES.filter((x) => x.cases.length > 0)) {
      const p = getTopicPack(s.topicId)!;
      // The stage's own level: a topic that closes several stages has one for each.
      const l = p.levels.find((x) => x.id === `${s.topicId}-case-study-${s.id}`)!;
      for (const n of [0, 1, s.cases.length - 1, s.cases.length, 2 * s.cases.length + 1]) {
        const first = questionsOf(buildLevelSession(l, p, levelSeed(l.order, n)))[0];
        expect(caseOf(first), `${s.id} play ${n}`).toBe(s.cases[n % s.cases.length].id);
      }
    }
  });
});

describe('a play of a case-study level', () => {
  it('is one whole case: every question of it, in its own order, with the case above each', () => {
    for (let n = 0; n < 40; n++) {
      const seed = levelSeed(level.order, n);
      const questions = play(n);
      const caseId = caseOf(questions[0])!;
      expect(questions).toEqual(generateCaseQuestions(caseId, seed));
      expect(questions.map((q) => q.id)).toEqual(Array.from({ length: PARTS }, (_, i) => `gen:${caseId}~${i + 1}:1:${seed}`));
      expect(new Set(questions.map((q) => q.context)).size).toBe(1);
      expect(questions[0].context!.split('\n')).toHaveLength(14);
    }
  });

  it('scores every question, with the pass mark of any level', () => {
    const items = buildLevelSession(level, pack, levelSeed(level.order, 0));
    expect(items.every((i) => i.kind === 'question' && !i.extra)).toBe(true);
    expect(countScored(items)).toBe(PARTS);
    expect(level.passMark).toBeUndefined();
    expect(scoreLevel(4, PARTS, level).passed).toBe(true);
    expect(scoreLevel(3, PARTS, level).passed).toBe(false);
  });

  it('takes the cases of the stage in turn, play after play, each time with figures not seen before', () => {
    const plays = Array.from({ length: 8 }, (_, n) => play(n));
    const turns = plays.map((questions) => caseOf(questions[0]));
    for (let n = 0; n < turns.length; n++) expect(turns[n], `play ${n}`).toBe(caseIds[(caseIds.indexOf(turns[0]!) + n) % caseIds.length]);
    const ids = plays.flat().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The same case two plays later is a different case to read: other names or other amounts.
    expect(plays[2][0].context).not.toBe(plays[0][0].context);
  });

  it('is the same for the same play, and a level with one case serves it every time', () => {
    expect(play(3)).toEqual(play(3));
    const single: Level = { ...level, cases: { caseIds: [SECOND_SAMPLE_CASE.id] } };
    for (let n = 0; n < 4; n++) {
      const questions = questionsOf(buildLevelSession(single, pack, levelSeed(level.order, n)));
      expect(questions.map(caseOf)).toEqual(Array(PARTS).fill(SECOND_SAMPLE_CASE.id));
    }
  });

  it('refuses a level with no case, and one whose case does not exist', () => {
    expect(() => buildLevelSession({ ...level, cases: { caseIds: [] } }, pack, 100)).toThrow(`Level ${level.id} has no cases`);
    expect(() => buildLevelSession({ ...level, cases: { caseIds: ['case-nope'] } }, pack, 100)).toThrow('Unknown case: case-nope');
  });

  it('is seeded by its own order, like every level but a look-back', () => {
    expect(seedOrder(level, PACKS.indexOf(pack))).toBe(level.order);
  });
});

describe('a question of a case', () => {
  const questions = play(0);

  it('knows where it stands in its case', () => {
    expect(questions.map((q) => casePosition(q))).toEqual(questions.map((_, i) => ({ number: i + 1, of: PARTS })));
    expect(casePosition(generateQuestion(TEMPLATES[0].id, 7))).toBeNull();
    expect(casePosition(pack.questions[0])).toBeNull();
    expect(casePosition({ id: 'gen:case-nope~2:1:7' })).toBeNull();
  });

  it('is found again by its id, case and all, so the Mistakes screen and mistake review can show it', () => {
    for (const q of questions) expect(findQuestion(q.id)).toEqual(q);
    expect(findQuestion(questions[1].id)!.context).toBe(questions[0].context);
  });

  it('has no similar question, although one missed in any other generated question has', () => {
    const items = buildLevelSession(level, pack, levelSeed(level.order, 0));
    for (const q of questions) expect(similarTo(q, items), q.id).toBeNull();
    // The session itself would allow one after a miss: it is the case that rules it out.
    const missed = sessionReducer(startSession(items, NOW), { type: 'reveal', now: NOW });
    expect(canInsertSimilar(missed)).toBe(true);
    const ordinary = generateQuestion(TEMPLATES[0].id, 700);
    expect(similarTo(ordinary, [{ kind: 'question', question: ordinary }])).not.toBeNull();
  });
});

describe('nothing but a case-study level and mistake review serves a question of a case', () => {
  // A learner who has passed every level of every topic and played three case studies, the first with two answers wrong.
  const played = [0, 1, 2].flatMap((n) => play(n).map((q, i) => ({ q, session: `case-${n}`, correct: !(n === 0 && i < 2) })));
  const attempts: AttemptEvent[] = played.map(({ q, session, correct }, i) => ({
    id: `a${i}`, profileId: 'p', courseId: 'c', topicId: pack.topicId, conceptId: q.conceptId, questionId: q.id, difficulty: q.difficulty,
    correct, hintsUsed: 0, timeMs: 1000, at: NOW - 100_000 + i, sessionId: session, levelId: level.id, sessionKind: 'level',
  }));
  const levelResults: LevelResult[] = PACKS.flatMap((p) => p.levels).map((l, i) => ({
    id: `r${i}`, profileId: 'p', topicId: l.topicId, levelId: l.id, score: 1, passed: true, at: NOW - 200_000 + i,
  }));
  const progress = deriveProgress(attempts, levelResults, NOW);
  const attempted = attempts.map((a) => a.questionId);
  const expectNoCase = (items: SessionItem[], where: string) => {
    expect(items.length, where).toBeGreaterThan(0);
    for (const q of questionsOf(items)) expect(ofCase(q), `${where}: ${q.id}`).toBe(false);
  };

  it('keeps the questions of a case out of the templates practice draws from', () => {
    expect(TEMPLATES.some((t) => parseCasePartId(t.id))).toBe(false);
    expect(CASES.flatMap((c) => c.parts).every((p) => !TEMPLATES.includes(p))).toBe(true);
    expect(templatesForConcept(stage.conceptId)).toEqual([]);
    for (const unlockAll of [false, true]) {
      const available = availableForLearner(PACKS, progress.passedLevelIds, attempted, unlockAll);
      expect([...available.templateIds].filter((id) => parseCasePartId(id))).toEqual([]);
      expect(available.templateIds.size).toBe(new Set(PACKS.flatMap((p) => p.levels.flatMap((l) => l.generate?.templateIds ?? []))).size);
    }
  });

  it('never has one in smart practice, fresh questions, topic practice, the daily challenge or the daily mission', () => {
    const available = availableForLearner(PACKS, progress.passedLevelIds, attempted, false);
    for (let n = 0; n < 40; n++) {
      expectNoCase(buildSmartPractice(PACKS, progress, available, NOW, practiceSeed('smart', n)), `smart ${n}`);
      expectNoCase(buildSmartPractice([pack], progress, available, NOW, practiceSeed('smart', n)), `smart, this topic, ${n}`);
      expectNoCase(buildFreshQuestions(pack, progress, available, practiceSeed('fresh', n)), `fresh ${n}`);
      expectNoCase(buildDailyChallenge([pack], available, `2026-10-${String(n % 28 + 1).padStart(2, '0')}`), `daily ${n}`);
      expectNoCase(buildDailyMission([pack], progress, {}, available, NOW, practiceSeed('daily_mission', n)), `mission ${n}`);
    }
  });

  it('never has one in any practice mode as the app builds it, mistake review apart', () => {
    const activity = deriveTopicActivity(attempts, levelResults);
    for (const unlockAll of [false, true]) {
      const input = { packs: PACKS, progress, attempts, sessionResults: [], cardStates: {}, activity, now: NOW, unlockAll };
      for (const mode of PRACTICE_MODES.filter((m) => m !== 'mistakes' && m !== 'cards')) {
        expectNoCase(buildPracticeSession(mode, input), mode);
      }
      // "Practise this topic", for the topic the cases belong to.
      expectNoCase(buildPracticeSession('fresh', { ...input, topicId: pack.topicId }), 'topic practice');
    }
  });

  it('never has one in a look-back level, of the topic itself or of a later one', () => {
    // The topics of the course the cases belong to: a look-back never leaves its course.
    const course = packsOf(COURSES.find((c) => c.topics.some((t) => t.id === pack.topicId))!.id);
    const from = course.indexOf(pack);
    for (const [i, p] of course.entries()) {
      const lookBack = p.levels.find((l) => l.type === 'look_back');
      if (i < from || !lookBack) continue;
      for (let n = 0; n < 30; n++) {
        const seed = levelSeed(seedOrder(lookBack, i), n);
        // Also when the topic of the cases is the learner's weakest, so that every play asks about it.
        for (const weakestTopicIds of [[], [pack.topicId]]) {
          const items = buildLevelSession(lookBack, p, seed, { weakestTopicIds });
          expectNoCase(items, `${p.topicId} look-back ${n}`);
          if (i > from && weakestTopicIds.length > 0) expect(questionsOf(items).some((q) => q.topicId === pack.topicId)).toBe(true);
        }
      }
    }
  });

  it('shows the missed ones again in mistake review, the exact questions with their case', () => {
    const missed = play(0).slice(0, 2);
    expect(openMistakes(progress).map((m) => m.questionId)).toEqual(missed.map((q) => q.id));
    expect(questionsOf(buildMistakeReview(progress))).toEqual(missed);
    for (const q of questionsOf(buildMistakeReview(progress))) expect(q.context).toBe(missed[0].context);
  });

  it('counts the answers towards the stage\'s concept and so towards the topic', () => {
    expect(progress.concepts[stage.conceptId].mastery).toBeGreaterThan(0);
    const without = deriveProgress([], levelResults, NOW);
    expect(topicMastery(pack, progress)).toBeGreaterThan(topicMastery(pack, without));
    expect(progress.xp - without.xp).toBe(13 * CONFIG.xp.perCorrect[SAMPLE_CASE.difficulty]);
  });
});
