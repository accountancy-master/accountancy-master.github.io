import { describe, expect, it } from 'vitest';
import { getTopicPack } from '@/content/registry';
import { CONFIG } from '@/learning/config';
import { xpForAttempt } from '@/learning/gamification';
import { MARATHON_ALL, marathonBatch, marathonPool, marathonSeed } from '@/learning/marathon';
import { availableForLearner } from '@/learning/practice';
import { deriveProgress } from '@/learning/progress';
import type { SessionItem } from '@/learning/sessionBuilder';
import { parseBackup } from '@/storage/backup';
import type { AttemptEvent, SessionResult } from '@/storage/types';
import {
  accuracyByConcept,
  accuracyOf,
  formatElapsed,
  marathonResult,
  marathonResultId,
  newBests,
  personalBests,
  tallyOf,
  unrecordedMarathons,
  weakestConcept,
} from './marathonRun';
import { practicePlayCount } from './seed';
import { currentItem, sessionReducer, startSession } from './session';

const PROFILE = { id: 'p1', courseId: 'cbse-11-accountancy' };
const T0 = new Date(2026, 9, 5, 18, 0, 0).getTime();
const answers = (pattern: string) => [...pattern].map((c) => ({ correct: c === '1' }));

describe('the tally of a run', () => {
  it('counts the answers, the correct ones, the streak now and the best streak of the run', () => {
    expect(tallyOf([])).toEqual({ answered: 0, correct: 0, streak: 0, bestStreak: 0 });
    expect(tallyOf(answers('1'))).toEqual({ answered: 1, correct: 1, streak: 1, bestStreak: 1 });
    expect(tallyOf(answers('0'))).toEqual({ answered: 1, correct: 0, streak: 0, bestStreak: 0 });
    expect(tallyOf(answers('1110'))).toEqual({ answered: 4, correct: 3, streak: 0, bestStreak: 3 });
    expect(tallyOf(answers('11101'))).toEqual({ answered: 5, correct: 4, streak: 1, bestStreak: 3 });
    expect(tallyOf(answers('1101111011'))).toEqual({ answered: 10, correct: 8, streak: 2, bestStreak: 4 });
    expect(tallyOf(answers('000'))).toEqual({ answered: 3, correct: 0, streak: 0, bestStreak: 0 });
  });

  it('grows with every answer and never loses the best streak', () => {
    const pattern = '110111101';
    let best = 0;
    for (let n = 0; n <= pattern.length; n++) {
      const tally = tallyOf(answers(pattern.slice(0, n)));
      expect(tally.answered).toBe(n);
      expect(tally.bestStreak).toBeGreaterThanOrEqual(best);
      expect(tally.streak).toBeLessThanOrEqual(tally.bestStreak);
      best = tally.bestStreak;
    }
  });

  it('gives accuracy as a whole percentage', () => {
    expect(accuracyOf(0, 0)).toBe(0);
    expect(accuracyOf(3, 4)).toBe(75);
    expect(accuracyOf(2, 3)).toBe(67);
    expect(accuracyOf(7, 7)).toBe(100);
  });

  it('counts the time up, in whole seconds that have passed', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(999)).toBe('0:00');
    expect(formatElapsed(7000)).toBe('0:07');
    expect(formatElapsed(65_500)).toBe('1:05');
    expect(formatElapsed(12 * 60_000 + 5000)).toBe('12:05');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
    expect(formatElapsed(-50)).toBe('0:00');
  });
});

describe('accuracy by concept', () => {
  const run = [
    { conceptId: 'a', correct: true },
    { conceptId: 'b', correct: false },
    { conceptId: 'a', correct: true },
    { conceptId: 'c', correct: false },
    { conceptId: 'b', correct: true },
    { conceptId: 'c', correct: false },
    { conceptId: 'c', correct: true },
  ];

  it('is told concept by concept, in the order they came up', () => {
    expect(accuracyByConcept(run)).toEqual([
      { conceptId: 'a', answered: 2, correct: 2 },
      { conceptId: 'b', answered: 2, correct: 1 },
      { conceptId: 'c', answered: 3, correct: 1 },
    ]);
    expect(accuracyByConcept([])).toEqual([]);
  });

  it('points out the weakest: the smallest share right, then the most misses, and none when nothing was missed', () => {
    expect(weakestConcept(accuracyByConcept(run))?.conceptId).toBe('c');
    const row = (conceptId: string, correct: number, answered: number) => ({ conceptId, correct, answered });
    expect(weakestConcept([row('a', 1, 2), row('b', 2, 4), row('c', 3, 3)])?.conceptId).toBe('b');
    expect(weakestConcept([row('a', 0, 1), row('b', 0, 3)])?.conceptId).toBe('b');
    expect(weakestConcept([row('a', 2, 2), row('b', 5, 5)])).toBeUndefined();
    expect(weakestConcept([])).toBeUndefined();
  });
});

describe('the record of a run', () => {
  const tally = tallyOf(answers('1101111011'));

  it('is a session result of its own kind, with the scope, the best streak and the time', () => {
    const result = marathonResult({ profile: PROFILE, sessionId: 's1', scope: 'ledger', tally, timeMs: 754_321.7, at: T0 });
    expect(result).toEqual({
      id: 'marathon:s1',
      profileId: 'p1',
      courseId: 'cbse-11-accountancy',
      kind: 'marathon',
      sessionId: 's1',
      day: '2026-10-05',
      correct: 8,
      total: 10,
      at: T0,
      scope: 'ledger',
      bestStreak: 4,
      timeMs: 754_322,
    });
    expect(marathonResultId('s1')).toBe(result.id);
  });

  it('goes through a backup as it is, and a result of another kind still has no such fields', () => {
    const result = marathonResult({ profile: PROFILE, sessionId: 's1', scope: MARATHON_ALL, tally, timeMs: 5000, at: T0 });
    const plain: SessionResult = { id: 'r2', profileId: 'p1', courseId: PROFILE.courseId, kind: 'smart', sessionId: 's2', day: '2026-10-05', correct: 7, total: 10, at: T0 };
    const backup = {
      format: 'accountancy-master-backup',
      version: 1,
      profile: { id: 'p1', name: 'Varun', courseId: PROFILE.courseId, createdAt: 1 },
      attempts: [],
      levelResults: [],
      sessionResults: [result, plain],
    };
    expect(parseBackup(JSON.parse(JSON.stringify(backup))).sessionResults).toEqual([result, plain]);
    for (const bad of [{ scope: '' }, { scope: 7 }, { bestStreak: -1 }, { bestStreak: 1.5 }, { timeMs: -1 }, { timeMs: 'long' }]) {
      expect(() => parseBackup({ ...backup, sessionResults: [{ ...result, ...bad }] }), JSON.stringify(bad)).toThrow('Invalid backup file');
    }
  });

  it('earns no bonus: a run earns the XP of its right answers by the usual rule, and nothing for being long', () => {
    const pack = getTopicPack('ledger')!;
    const pool = marathonPool([pack], availableForLearner([pack], [], [], true));
    const questions = marathonBatch({ pool, seed: marathonSeed(0), difficulty: 'mixed', mastery: {}, served: [], answers: [] }, 12).filter((q) => q.id.startsWith('gen:'));
    // Every question right, and the first of them answered right once more.
    const attempts: AttemptEvent[] = [...questions, questions[0]].map((q, i) => ({
      id: `a${i}`,
      profileId: 'p1',
      courseId: PROFILE.courseId,
      topicId: q.topicId,
      conceptId: q.conceptId,
      questionId: q.id,
      difficulty: q.difficulty,
      correct: true,
      hintsUsed: 0,
      timeMs: 1000,
      at: T0 + i * 1000,
      sessionId: 's1',
      sessionKind: 'marathon',
    }));
    const result = marathonResult({ profile: PROFILE, sessionId: 's1', scope: 'ledger', tally: tallyOf(attempts), timeMs: 60_000, at: T0 + 60_000 });
    const expected =
      questions.reduce((sum, q) => sum + xpForAttempt({ correct: true, difficulty: q.difficulty, hintsUsed: 0 }), 0) +
      xpForAttempt({ correct: true, difficulty: questions[0].difficulty, hintsUsed: 0 }, true);
    expect(deriveProgress(attempts, [], T0 + 61_000, [result]).xp).toBe(expected);
    expect(deriveProgress(attempts, [], T0 + 61_000, []).xp).toBe(expected);
    expect(CONFIG.xp.repeatFactor).toBeLessThan(1);
  });
});

describe('a run the app was closed on', () => {
  const attempt = (id: string, sessionId: string, topicId: string, correct: boolean, at: number, sessionKind = 'marathon'): AttemptEvent => ({
    id,
    profileId: 'p1',
    courseId: PROFILE.courseId,
    topicId,
    conceptId: 'c',
    questionId: `gen:t:1:${id}`,
    difficulty: 'easy',
    correct,
    hintsUsed: 0,
    timeMs: 1000,
    at,
    sessionId,
    sessionKind: sessionKind as AttemptEvent['sessionKind'],
  });

  it('is recorded from its answers: what was answered, the best streak, from the first answer to the last', () => {
    const attempts = [
      attempt('1', 'lost', 'ledger', true, T0 + 1000),
      attempt('2', 'lost', 'ledger', true, T0 + 9000),
      attempt('3', 'lost', 'ledger', false, T0 + 20_000),
      attempt('4', 'lost', 'ledger', true, T0 + 31_000),
      // Other sessions, and a marathon that was stopped properly.
      attempt('5', 'other', 'ledger', true, T0 + 40_000, 'smart'),
      attempt('6', 'kept', 'cash-book', true, T0 + 50_000),
    ];
    const kept = marathonResult({ profile: PROFILE, sessionId: 'kept', scope: 'cash-book', tally: tallyOf([{ correct: true }]), timeMs: 4000, at: T0 + 51_000 });
    expect(unrecordedMarathons(attempts, [kept])).toEqual([
      {
        id: 'marathon:lost',
        profileId: 'p1',
        courseId: PROFILE.courseId,
        kind: 'marathon',
        sessionId: 'lost',
        day: '2026-10-05',
        correct: 3,
        total: 4,
        at: T0 + 31_000,
        scope: 'ledger',
        bestStreak: 2,
        timeMs: 30_000,
      },
    ]);
    // Once its record is stored there is nothing left to record.
    expect(unrecordedMarathons(attempts, [kept, ...unrecordedMarathons(attempts, [kept])])).toEqual([]);
    expect(unrecordedMarathons([], [])).toEqual([]);
  });

  it('counts as a run over all topics when its questions came from more than one', () => {
    const attempts = [attempt('1', 'lost', 'ledger', true, T0), attempt('2', 'lost', 'cash-book', false, T0 + 5000)];
    expect(unrecordedMarathons(attempts, [])[0]).toMatchObject({ scope: MARATHON_ALL, correct: 1, total: 2, bestStreak: 1 });
  });

  it('still counts as a run started, so the next run gets other seeds', () => {
    const attempts = [attempt('1', 'lost', 'ledger', true, T0), attempt('2', 'again', 'ledger', true, T0 + 5000)];
    expect(practicePlayCount('marathon', attempts, [])).toBe(2);
    expect(practicePlayCount('marathon', attempts, unrecordedMarathons(attempts, []))).toBe(2);
  });
});

describe('personal bests', () => {
  const run = (sessionId: string, scope: string, pattern: string): SessionResult =>
    marathonResult({ profile: PROFILE, sessionId, scope, tally: tallyOf(answers(pattern)), timeMs: 1000, at: T0 });

  it('are the most answered in one run and the longest streak, topic by topic, from the stored results', () => {
    const results: SessionResult[] = [
      run('a', 'ledger', '1101'),
      run('b', 'ledger', '11111'),
      run('c', 'ledger', '1010101010'),
      run('d', 'cash-book', '11'),
      run('e', MARATHON_ALL, '0'),
      // Not marathons, and a marathon with nothing in it.
      { id: 'x', profileId: 'p1', courseId: PROFILE.courseId, kind: 'smart', sessionId: 'x', day: '2026-10-05', correct: 30, total: 30, at: T0 },
      run('f', 'depreciation', ''),
    ];
    expect(personalBests(results)).toEqual({
      ledger: { answered: 10, streak: 5 },
      'cash-book': { answered: 2, streak: 2 },
      [MARATHON_ALL]: { answered: 1, streak: 0 },
    });
    expect(personalBests([])).toEqual({});
    expect(personalBests(results).depreciation).toBeUndefined();
  });

  it('are beaten only by more: a first run sets both, an equal run sets neither', () => {
    const before = { answered: 10, streak: 5 };
    expect(newBests(undefined, { answered: 3, bestStreak: 2 })).toEqual({ answered: true, streak: true });
    expect(newBests(undefined, { answered: 3, bestStreak: 0 })).toEqual({ answered: true, streak: false });
    expect(newBests(before, { answered: 10, bestStreak: 5 })).toEqual({ answered: false, streak: false });
    expect(newBests(before, { answered: 11, bestStreak: 4 })).toEqual({ answered: true, streak: false });
    expect(newBests(before, { answered: 6, bestStreak: 6 })).toEqual({ answered: false, streak: true });
  });

  it('include a run in the bests once it is recorded', () => {
    const before = personalBests([run('a', 'ledger', '1101')]);
    const tally = tallyOf(answers('1111101'));
    expect(newBests(before.ledger, tally)).toEqual({ answered: true, streak: true });
    const after = personalBests([run('a', 'ledger', '1101'), run('b', 'ledger', '1111101')]);
    expect(after.ledger).toEqual({ answered: 7, streak: 5 });
    expect(newBests(after.ledger, tally)).toEqual({ answered: false, streak: false });
  });
});

describe('a session that grows as it is played', () => {
  const pack = getTopicPack('ledger')!;
  const pool = marathonPool([pack], availableForLearner([pack], [], [], true));
  const items = (from: number, count: number): SessionItem[] =>
    marathonBatch({ pool, seed: marathonSeed(0), difficulty: 'easy', mastery: {}, served: Array.from({ length: from }, (_, i) => ({ id: `x${i}` })), answers: [] }, count).map((question) => ({
      kind: 'question',
      question,
    }));

  it('takes more questions at its end while it is going, and carries on into them', () => {
    let state = startSession(items(0, 2), T0);
    state = sessionReducer(state, { type: 'reveal', now: T0 + 1 });
    state = sessionReducer(state, { type: 'next', now: T0 + 2 });
    state = sessionReducer(state, { type: 'reveal', now: T0 + 3 });
    // On the last question, answered: the next batch is added, and Next goes on instead of ending the session.
    const more = items(2, 3);
    state = sessionReducer(state, { type: 'append', items: more });
    expect(state.items).toHaveLength(5);
    expect(state.phase).toBe('feedback');
    state = sessionReducer(state, { type: 'next', now: T0 + 4 });
    expect(state.phase).toBe('playing');
    expect(currentItem(state)).toBe(more[0]);
    expect(state.attempts).toHaveLength(2);
  });

  it('adds nothing to a session that has ended, and nothing for an empty batch', () => {
    let state = startSession(items(0, 1), T0);
    expect(sessionReducer(state, { type: 'append', items: [] })).toBe(state);
    state = sessionReducer(state, { type: 'reveal', now: T0 + 1 });
    state = sessionReducer(state, { type: 'next', now: T0 + 2 });
    expect(state.phase).toBe('done');
    expect(sessionReducer(state, { type: 'append', items: items(1, 2) })).toBe(state);
  });
});
