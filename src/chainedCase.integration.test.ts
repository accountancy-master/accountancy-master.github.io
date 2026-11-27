import { describe, expect, it, vi } from 'vitest';
import { PACKS, findQuestion, getTopicPack } from '@/content/registry';
import type { Question } from '@/content/types';
import { validatePack } from '@/content/validate';
import { checkAnswer } from '@/exercises/checkers';
import { CASES, CASE_STAGES, TEMPLATES, generateCaseQuestions, parseCasePartId, parseGenId } from '@/generators';
import { isLongKind } from '@/generators/types';
import { buildCaseSession, casePlays, caseSeed, stageRecord } from '@/learning/caseStudies';
import { CONFIG } from '@/learning/config';
import { marathonPool } from '@/learning/marathon';
import { buildPaper, paperSteps } from '@/learning/mockPaper';
import { availableForLearner, buildDailyChallenge, buildDailyMission, buildFreshQuestions, buildMistakeReview, buildSmartPractice, openMistakes, practiceSeed } from '@/learning/practice';
import { deriveProgress, scoreLevel } from '@/learning/progress';
import { buildLevelSession, countScored, type SessionItem } from '@/learning/sessionBuilder';
import { deriveTopicActivity } from '@/learning/topics';
import { casePosition, caseStaysInReach, ownData } from '@/play/caseStudy';
import { draftResponse } from '@/play/drafts';
import { hasLongPart, markPaper } from '@/play/mockSitting';
import { buildPracticeSession } from '@/play/practiceSession';
import { PRACTICE_MODES } from '@/play/practiceModes';
import { levelSeed } from '@/play/seed';
import { currentItem, scoredAttempts, sessionReducer, startSession, summarize } from '@/play/session';
import { similarTo } from '@/play/similar';
import type { AttemptEvent, LevelResult } from '@/storage/types';
import { SAMPLE_CASE, SAMPLE_CHAIN } from '@/testing/sampleCase';
import { rightFormat, rightFormatDraft } from '@/testing/sampleFormats';

// The first stage is given a case of short questions and a chained case, so the level, the Case studies screen and
// everything that must never serve a part of a case run on a chained case whatever the real stages hold.
// The stand-in keeps the module's other exports: other stages import helpers from it.
vi.mock('@/generators/cases/accounting-cycle', async (importOriginal) => {
  const { SAMPLE_CASE, SAMPLE_CHAIN } = await import('@/testing/sampleCase');
  return { ...(await importOriginal<object>()), default: [SAMPLE_CASE, SAMPLE_CHAIN] };
});

const NOW = new Date(2026, 9, 9, 10).getTime();
const stage = CASE_STAGES[0];
const pack = getTopicPack(stage.topicId)!;
const level = pack.levels.at(-1)!;
const questionsOf = (items: SessionItem[]): Question[] => items.flatMap((i) => (i.kind === 'question' ? [i.question] : []));
/** The second play of the level: the cases take turns, so this is the chained one. */
const chain = () => buildLevelSession(level, pack, levelSeed(level.order, 1));
const ofCase = (q: Question) => parseCasePartId(parseGenId(q.id)?.templateId ?? '') !== null || q.context !== undefined;
/** The right answer to a part, as the player hands it to the check. */
const rightAnswer = (q: Question) => {
  if (q.type === 'account' || q.type === 'statement') return rightFormat(q);
  if (q.type === 'journal_set') return { type: 'journal_set' as const, entries: q.entries.map((e) => e.expected) };
  throw new Error(`not a long part: ${q.type}`);
};

describe('a chained case in its Case study level', () => {
  it('is served whole and in order like any case: a set, an account and a statement, each with the case and its place in it', () => {
    expect(level).toMatchObject({ type: 'case_study', cases: { caseIds: [SAMPLE_CASE.id, SAMPLE_CHAIN.id] } });
    expect(validatePack(pack)).toEqual([]);
    const questions = questionsOf(chain());
    expect(questions.map((q) => q.type)).toEqual(['journal_set', 'account', 'statement']);
    expect(new Set(questions.map((q) => q.context)).size).toBe(1);
    expect(questions.map((q) => casePosition(q))).toEqual([1, 2, 3].map((number) => ({ number, of: 3 })));
    for (const q of questions) expect(findQuestion(q.id), q.id).toEqual(q);
    // One panel: the case stays within reach while a part is answered, and no format has a Data panel of its own.
    expect(questions.map((q) => caseStaysInReach(q, false))).toEqual([true, true, true]);
    expect(questions.flatMap((q) => (q.type === 'account' || q.type === 'statement' ? [ownData(q)] : []))).toEqual([null, null]);
  });

  it('scores each part as one question, right only when the whole part is, and shows no similar question', () => {
    const items = chain();
    expect(countScored(items)).toBe(3);
    let state = startSession(items, NOW);
    const answers = questionsOf(items).map((q, i) => {
      const response = rightAnswer(q);
      // The account with one row missing: four of its five rows are right, and the part is wrong.
      return i === 1 && response.type === 'account' ? { ...response, sides: [response.sides[0].slice(1), response.sides[1]] as typeof response.sides } : response;
    });
    for (const response of answers) {
      const item = currentItem(state);
      if (item?.kind !== 'question') throw new Error('expected a question');
      expect(similarTo(item.question, items)).toBeNull();
      state = sessionReducer(state, { type: 'answer', response, now: NOW });
      // The check that marks the part is the one a format or a set that stands alone gets.
      expect(state.result).toEqual(checkAnswer(item.question, response));
      state = sessionReducer(state, { type: 'next', now: NOW });
    }
    expect(scoredAttempts(state)).toBe(3);
    expect(state.attempts.map((a) => a.correct)).toEqual([true, false, true]);
    expect(state.attempts[1].mistakeCode).toBe('rows:moooo');
    const summary = summarize(state, { passMark: level.passMark });
    expect(summary).toMatchObject({ correct: 2, total: 3 });
    expect(summary.passed).toBe(scoreLevel(2, 3, level).passed);
  });

  it('is not timed: no level that lists cases has a timer, and no timed level generates a part of a case', () => {
    for (const l of PACKS.flatMap((p) => p.levels)) {
      if (l.cases) expect(l.timerSecondsPerQuestion, l.id).toBeUndefined();
      if (l.timerSecondsPerQuestion !== undefined) expect((l.generate?.templateIds ?? []).filter((id) => parseCasePartId(id)), l.id).toEqual([]);
    }
  });
});

describe('a chained case on the Case studies screen', () => {
  it('is one session of three parts, and is finished and scored by its parts', () => {
    const items = buildCaseSession(SAMPLE_CHAIN.id, caseSeed(0));
    expect(questionsOf(items).map((q) => q.type)).toEqual(['journal_set', 'account', 'statement']);
    const attempts = questionsOf(items).map((q, i) => ({ questionId: q.id, sessionId: 's1', sessionKind: 'case', correct: i !== 1 }));
    const plays = casePlays(attempts);
    expect(plays).toEqual([{ caseId: SAMPLE_CHAIN.id, sessionId: 's1', fromSection: true, correct: 2, total: 3, complete: true }]);
    expect(stageRecord(stage, plays).bestByCase).toEqual({ [SAMPLE_CHAIN.id]: 2 / 3 });
    // Two parts answered is a case not yet finished.
    expect(casePlays(attempts.slice(0, 2))[0]).toMatchObject({ correct: 1, total: 3, complete: false });
  });
});

describe('nothing short or timed serves a part of a chained case', () => {
  // A learner who has passed every level and played the chained case twice, the account wrong the first time.
  const played = [1, 3].flatMap((n) => questionsOf(buildLevelSession(level, pack, levelSeed(level.order, n))).map((q, i) => ({ q, session: `chain-${n}`, correct: !(n === 1 && i === 1) })));
  const attempts: AttemptEvent[] = played.map(({ q, session, correct }, i) => ({
    id: `a${i}`, profileId: 'p', courseId: 'c', topicId: pack.topicId, conceptId: q.conceptId, questionId: q.id, difficulty: q.difficulty,
    correct, hintsUsed: 0, timeMs: 600_000, at: NOW - 100_000 + i, sessionId: session, levelId: level.id, sessionKind: 'level',
  }));
  const levelResults: LevelResult[] = PACKS.flatMap((p) => p.levels).map((l, i) => ({
    id: `r${i}`, profileId: 'p', topicId: l.topicId, levelId: l.id, score: 1, passed: true, at: NOW - 200_000 + i,
  }));
  const progress = deriveProgress(attempts, levelResults, NOW);
  const available = availableForLearner(PACKS, progress.passedLevelIds, attempts.map((a) => a.questionId), true);
  const expectNoCase = (items: SessionItem[], where: string) => {
    expect(items.length, where).toBeGreaterThan(0);
    for (const q of questionsOf(items)) expect(ofCase(q), `${where}: ${q.id}`).toBe(false);
  };

  it('keeps its parts out of everything practice may draw, with every level passed and with all unlocked', () => {
    expect(played.map((p) => p.q.type)).toEqual(['journal_set', 'account', 'statement', 'journal_set', 'account', 'statement']);
    expect(CASES.flatMap((c) => c.parts).filter((p) => isLongKind(p.kind)).length).toBeGreaterThanOrEqual(3);
    expect(CASES.flatMap((c) => c.parts).some((p) => TEMPLATES.includes(p) || available.templateIds.has(p.id))).toBe(false);
  });

  it('never has one in the daily challenge, the daily mission, smart practice or fresh questions, which stay as long as ever', () => {
    for (let n = 0; n < 40; n++) {
      const day = `2026-10-${String((n % 28) + 1).padStart(2, '0')}`;
      const challenge = buildDailyChallenge(PACKS, available, day);
      expectNoCase(challenge, `daily challenge ${day}`);
      expect(questionsOf(challenge)).toHaveLength(CONFIG.practice.dailyChallengeCount);
      const mission = buildDailyMission(PACKS, progress, {}, available, NOW, practiceSeed('daily_mission', n));
      expectNoCase(mission, `daily mission ${n}`);
      expect(questionsOf(mission)).toHaveLength(CONFIG.practice.mission.questions + CONFIG.practice.mission.challenge);
      expectNoCase(buildSmartPractice(PACKS, progress, available, NOW, practiceSeed('smart', n)), `smart ${n}`);
      expectNoCase(buildFreshQuestions(pack, progress, available, practiceSeed('fresh', n)), `fresh ${n}`);
    }
  });

  it('never has one in any practice mode as the app builds it, mistake review apart, nor in a marathon', () => {
    const activity = deriveTopicActivity(attempts, levelResults);
    for (const unlockAll of [false, true]) {
      const input = { packs: PACKS, progress, attempts, sessionResults: [], cardStates: {}, activity, now: NOW, unlockAll };
      for (const mode of PRACTICE_MODES.filter((m) => m !== 'mistakes' && m !== 'cards')) expectNoCase(buildPracticeSession(mode, input), mode);
    }
    const pool = marathonPool(PACKS, available);
    expect(pool.templates.length).toBeGreaterThan(0);
    expect(pool.templates.some((t) => parseCasePartId(t.id))).toBe(false);
    expect(pool.questions.some(ofCase)).toBe(false);
  });

  it('shows the missed part again in mistake review, the exact question with its case', () => {
    const missed = played[1].q;
    expect(openMistakes(progress).map((m) => m.questionId)).toEqual([missed.id]);
    const again = questionsOf(buildMistakeReview(progress));
    expect(again).toEqual([missed]);
    expect(again[0].context).toBe(played[0].q.context);
    expect(caseStaysInReach(again[0], false)).toBe(true);
  });
});

describe('a chained case as the 6-mark question of a mock paper', () => {
  // The stage has two cases, which take turns from paper to paper: the first full paper that sets the chained one.
  const numbers = Array.from({ length: 12 }, (_, i) => i + 1);
  const paper = numbers.map((number) => buildPaper({ kind: 'full', number })).find((p) => p.entries.some((e) => e.caseId === SAMPLE_CHAIN.id))!;
  const entry = paper.entries.find((e) => e.caseId === SAMPLE_CHAIN.id)!;

  it('is one 6-mark question with three parts, each answered on a step of its own', () => {
    expect(entry).toMatchObject({ caseId: SAMPLE_CHAIN.id, marks: 6 });
    expect(hasLongPart(entry)).toBe(true);
    expect(entry.questions).toEqual(generateCaseQuestions(SAMPLE_CHAIN.id, Number(/:(\d+)$/.exec(entry.questions[0].id)![1])));
    const steps = paperSteps(paper).filter((s) => s.entry === entry);
    expect(steps.map((s) => s.label)).toEqual(['a', 'b', 'c'].map((part) => `${entry.number}(${part})`));
    expect(steps.map((s) => s.part)).toEqual([0, 1, 2]);
  });

  it('is marked from the answers as they were stored, part by part', () => {
    const [set, account, statement] = entry.questions;
    if (set.type !== 'journal_set' || account.type !== 'account' || statement.type !== 'statement') throw new Error('unexpected kinds');
    const draft = rightFormatDraft(account);
    if (draft.type !== 'account') throw new Error('not an account');
    // What a browser stores and reads back: the answers as JSON.
    const stored = JSON.parse(JSON.stringify({ [account.id]: { ...draft, sides: [draft.sides[0].slice(1), draft.sides[1]] }, [statement.id]: rightFormatDraft(statement) })) as Record<string, unknown>;
    const marking = markPaper(paper, stored);
    const marked = marking.entries.find((e) => e.entry === entry)!;
    // The set left out, four of the five rows of the account, the statement right: 6 x (0 + 4/5 + 1) / 3 = 3.6, so 3.5.
    expect(marked.marks).toBe(3.5);
    expect(marking).toMatchObject({ marks: 3.5, maxMarks: 80, answered: 2, right: 1 });
    expect(marked.steps.map((s) => [s.response !== null, s.correct])).toEqual([[false, false], [true, false], [true, true]]);
    expect(draftResponse(statement, rightFormatDraft(statement))).toEqual(rightFormat(statement));
  });
});
