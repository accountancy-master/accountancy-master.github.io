import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { JOURNAL_ENTRIES } from '@/content/cbse11/journalEntries';
import type { AttemptEvent, CardReviewEvent, LevelResult, SessionResult } from '@/storage/types';
import { CONFIG } from './config';
import { dayKey } from './gamification';
import { DAY_MS } from './mastery';
import { deriveProgress, goalMet, isLevelUnlocked, levelUnlocked, scoreLevel, topicMastery, xpToday } from './progress';

const T0 = new Date(2026, 9, 4, 10).getTime();
let seq = 0;
// Each attempt is a different generated question unless a test names one: a repeat of a question id earns less XP.
const attempt = (over: Partial<AttemptEvent>): AttemptEvent => ({
  id: `a${seq++}`, profileId: 'p', courseId: 'cbse-11-accountancy', topicId: 'journal-entries', conceptId: 'je-goods',
  questionId: `gen:je-cash-sale:1:${1000 + seq}`, difficulty: 'easy', correct: true, hintsUsed: 0, timeMs: 3000, at: T0, sessionId: 's1',
  ...over,
});
const passed = (levelId: string, at: number): LevelResult => ({
  id: `r${seq++}`, profileId: 'p', topicId: 'journal-entries', levelId, score: 1, passed: true, at,
});

describe('deriveProgress', () => {
  it('is empty with no events', () => {
    const p = deriveProgress([], [], T0);
    expect(p).toMatchObject({ xp: 0, answered: 0, correct: 0, passedLevelIds: [] });
    expect(p.streak).toEqual({ count: 0, lastDay: null });
  });

  it('accumulates xp, mastery, counts and the streak', () => {
    const p = deriveProgress(
      [attempt({}), attempt({ at: T0 + 1000, difficulty: 'medium', conceptId: 'je-credit' }), attempt({ at: T0 + DAY_MS, correct: false })],
      [],
      T0 + DAY_MS,
    );
    expect(p.xp).toBe(30);
    expect(p.answered).toBe(3);
    expect(p.correct).toBe(2);
    expect(p.concepts['je-credit'].mastery).toBe(12);
    expect(p.concepts['je-goods'].mastery).toBe(0);
    expect(p.streak.count).toBe(2);
  });

  it('gives the level bonus once per level', () => {
    const p = deriveProgress([], [passed('journal-entries-level-4', T0), passed('journal-entries-level-4', T0 + 1)], T0 + 2);
    expect(p.xp).toBe(20);
    expect(p.passedLevelIds).toEqual(['journal-entries-level-4']);
  });

  it('counts a mistake as corrected only in a later session', () => {
    const wrong = attempt({ questionId: 'q1', correct: false, mistakeCode: 'sidesReversed', sessionId: 's1' });
    const retry = attempt({ questionId: 'q1', correct: true, sessionId: 's1', at: T0 + 10 });
    const later = attempt({ questionId: 'q1', correct: true, sessionId: 's2', at: T0 + 20 });
    expect(deriveProgress([wrong, retry], [], T0 + 30).questions.q1).toMatchObject({ mistakeOpen: true, mistakeCode: 'sidesReversed', attempts: 2 });
    expect(deriveProgress([wrong, retry, later], [], T0 + 30).questions.q1.mistakeOpen).toBe(false);
  });

  it('stamps when a mistake was opened, and again when it is reopened', () => {
    const wrong = attempt({ questionId: 'q1', correct: false, sessionId: 's1', at: T0 });
    const wrongAgain = attempt({ questionId: 'q1', correct: false, sessionId: 's1', at: T0 + 10 });
    const fixed = attempt({ questionId: 'q1', correct: true, sessionId: 's2', at: T0 + 20 });
    const reopened = attempt({ questionId: 'q1', correct: false, sessionId: 's3', at: T0 + 30 });
    // A second wrong answer while the mistake is already open keeps the original time.
    expect(deriveProgress([wrong, wrongAgain], [], T0 + 40).questions.q1.mistakeAt).toBe(T0);
    expect(deriveProgress([wrong, wrongAgain, fixed, reopened], [], T0 + 40).questions.q1).toMatchObject({
      mistakeOpen: true,
      mistakeAt: T0 + 30,
    });
  });

  it('counts a mistake put right in a later session as corrected, and not one still open', () => {
    const wrong = attempt({ questionId: 'q1', correct: false, sessionId: 's1', at: T0 });
    const sameSession = attempt({ questionId: 'q1', correct: true, sessionId: 's1', at: T0 + 10 });
    const fixed = attempt({ questionId: 'q1', correct: true, sessionId: 's2', at: T0 + 20 });
    const reopened = attempt({ questionId: 'q1', correct: false, sessionId: 's3', at: T0 + 30 });
    const fixedAgain = attempt({ questionId: 'q1', correct: true, sessionId: 's4', at: T0 + 40 });
    const never = attempt({ questionId: 'q2', correct: true, sessionId: 's1', at: T0 });
    const at = T0 + 50;
    expect(deriveProgress([wrong, sameSession], [], at).questions.q1.corrected ?? 0).toBe(0);
    expect(deriveProgress([wrong, sameSession, fixed], [], at).questions.q1).toMatchObject({ mistakeOpen: false, corrected: 1 });
    expect(deriveProgress([wrong, fixed, reopened], [], at).questions.q1).toMatchObject({ mistakeOpen: true, corrected: 1 });
    expect(deriveProgress([wrong, fixed, reopened, fixedAgain], [], at).questions.q1.corrected).toBe(2);
    expect(deriveProgress([never], [], at).questions.q2.corrected).toBeUndefined();
  });

  it('decays mastery when a concept is left unpractised', () => {
    const events = Array.from({ length: 6 }, (_, i) => attempt({ at: T0 + i }));
    const fresh = deriveProgress(events, [], T0 + 10).concepts['je-goods'].mastery;
    const stale = deriveProgress(events, [], T0 + 30 * DAY_MS).concepts['je-goods'].mastery;
    expect(stale).toBeLessThan(fresh);
  });

  it('does not depend on the order events are supplied in', () => {
    const events = [attempt({ at: T0 }), attempt({ at: T0 + 5, correct: false }), attempt({ at: T0 + 9 })];
    expect(deriveProgress([...events].reverse(), [], T0 + 10)).toEqual(deriveProgress(events, [], T0 + 10));
  });

  it('breaks ties between simultaneous attempts the same way in either order', () => {
    const a = attempt({ id: 'B-1', at: T0, correct: false, questionId: 'q1', mistakeCode: 'first' });
    const b = attempt({ id: 'a-1', at: T0, correct: true, questionId: 'q1', sessionId: 's2' });
    const forward = deriveProgress([a, b], [], T0);
    expect(deriveProgress([b, a], [], T0)).toEqual(forward);
    // 'B-1' sorts before 'a-1' by code unit (not by locale), so the correct retry in a later session is applied last.
    expect(forward.questions.q1).toMatchObject({ lastCorrect: true, mistakeOpen: false });
  });

  it('keeps an earlier mistake code when a later wrong answer has none', () => {
    const first = attempt({ questionId: 'q1', correct: false, mistakeCode: 'sidesReversed' });
    const second = attempt({ questionId: 'q1', correct: false, at: T0 + 10, mistakeCode: undefined });
    expect(deriveProgress([first, second], [], T0 + 20).questions.q1.mistakeCode).toBe('sidesReversed');
  });

  it('does not promote the review box for repeated practice within a minute', () => {
    const events = Array.from({ length: 5 }, (_, i) => attempt({ at: T0 + i * 10_000 }));
    expect(deriveProgress(events, [], T0 + 60_000).concepts['je-goods'].review.box).toBe(0);
  });

  it('matches a hand-computed decay-then-gain baseline', () => {
    const second = T0 + 20 * DAY_MS;
    const p = deriveProgress([attempt({}), attempt({ at: second })], [], second);
    // 8 -> 20 days idle: 6 days past grace would lose 6 (8-6=2) but the floor is 8*0.6=4.8;
    // then gain 8*(1-4.8/200)=7.808, giving 12.608.
    expect(p.concepts['je-goods'].mastery).toBeCloseTo(12.608, 5);
  });

  it('derives the same progress when two device event lists are concatenated in either order', () => {
    const deviceA = [
      attempt({ sessionId: 'dA', at: T0, conceptId: 'je-goods', questionId: 'qa1' }),
      attempt({ sessionId: 'dA', at: T0 + 2000, difficulty: 'medium', conceptId: 'je-goods', questionId: 'qa2', correct: false }),
      attempt({ sessionId: 'dA', at: T0 + 4000, conceptId: 'je-credit', questionId: 'qa3' }),
    ];
    const deviceB = [
      attempt({ sessionId: 'dB', at: T0 + 1000, difficulty: 'complex', conceptId: 'je-credit', questionId: 'qb1' }),
      attempt({ sessionId: 'dB', at: T0 + 3000, conceptId: 'je-goods', questionId: 'qb2' }),
    ];
    const ab = deriveProgress([...deviceA, ...deviceB], [], T0 + 5000);
    const ba = deriveProgress([...deviceB, ...deviceA], [], T0 + 5000);
    expect(ba).toEqual(ab);
    expect(ab.xp).toBe(deriveProgress(deviceA, [], T0 + 5000).xp + deriveProgress(deviceB, [], T0 + 5000).xp);
    expect(ab.answered).toBe(5);
  });
});

describe('level rules', () => {
  const levels = JOURNAL_ENTRIES.levels;
  it('scores against the default or the level pass mark', () => {
    expect(scoreLevel(7, 10, levels[4])).toEqual({ score: 0.7, passed: true });
    expect(scoreLevel(6, 10, levels[4])).toEqual({ score: 0.6, passed: false });
    expect(scoreLevel(9, 10, { ...levels[4], passMark: 1 }).passed).toBe(false);
    expect(scoreLevel(0, 0, levels[0])).toEqual({ score: 1, passed: true });
  });
  it('unlocks the first level and each level after a passed one', () => {
    expect(isLevelUnlocked(levels[0], levels, [])).toBe(true);
    expect(isLevelUnlocked(levels[1], levels, [])).toBe(false);
    expect(isLevelUnlocked(levels[1], levels, [levels[0].id])).toBe(true);
  });
  it('opens every level when all levels are unlocked, and follows the ladder otherwise', () => {
    for (const level of levels) expect(levelUnlocked(level, levels, [], true), level.id).toBe(true);
    expect(levelUnlocked(levels[5], levels, [], false)).toBe(false);
    expect(levelUnlocked(levels[5], levels, [levels[4].id], false)).toBe(true);
    expect(levelUnlocked(levels[0], levels, [], false)).toBe(true);
  });
  it('averages topic mastery over every concept', () => {
    const p = deriveProgress([attempt({})], [], T0);
    expect(topicMastery(JOURNAL_ENTRIES, p)).toBe(Math.round(8 / JOURNAL_ENTRIES.concepts.length));
  });
});

const session = (kind: SessionResult['kind'], day: string, at: number): SessionResult => ({
  id: `sr${seq++}`, profileId: 'p', courseId: 'cbse-11-accountancy', kind, sessionId: `ss${seq}`, day, correct: 5, total: 5, at,
});
const DAY1 = dayKey(T0);
const DAY2 = dayKey(T0 + DAY_MS);

const scored = (kind: SessionResult['kind'], day: string, correct: number, total: number, at: number): SessionResult => ({
  ...session(kind, day, at),
  correct,
  total,
});

describe('the bonus needs at least half of the scored questions right', () => {
  it('has its minimum in the config', () => {
    expect(CONFIG.xp.bonusMinScore).toBe(0.5);
  });

  it('earns the mission and challenge bonus at exactly half', () => {
    const p = deriveProgress([], [], T0, [
      scored('daily_mission', DAY1, 4, 8, T0),
      scored('daily_challenge', DAY1, 5, 10, T0 + 1),
    ]);
    expect(p.xp).toBe(80);
    expect(p.missionDoneDays).toEqual([DAY1]);
    expect(p.challengeDoneDays).toEqual([DAY1]);
  });

  it('gives no bonus below half, and leaves the day open', () => {
    const p = deriveProgress([], [], T0, [
      scored('daily_mission', DAY1, 3, 8, T0),
      scored('daily_challenge', DAY1, 2, 5, T0 + 1),
    ]);
    expect(p.xp).toBe(0);
    expect(p.xpByDay).toEqual({});
    expect(p.missionDoneDays).toEqual([]);
    expect(p.challengeDoneDays).toEqual([]);
  });

  it('gives the bonus once when a failed attempt is followed by a good one the same day', () => {
    const p = deriveProgress([], [], T0 + 100, [
      scored('daily_mission', DAY1, 1, 10, T0),
      scored('daily_mission', DAY1, 9, 10, T0 + 50),
      scored('daily_mission', DAY1, 10, 10, T0 + 60),
    ]);
    expect(p.xp).toBe(50);
    expect(p.missionDoneDays).toEqual([DAY1]);
  });

  it('still counts a session with nothing scored, and does not depend on the order supplied', () => {
    expect(deriveProgress([], [], T0, [scored('daily_mission', DAY1, 0, 0, T0)]).missionDoneDays).toEqual([DAY1]);
    const results = [scored('daily_challenge', DAY1, 0, 5, T0), scored('daily_challenge', DAY1, 5, 5, T0 + 5)];
    expect(deriveProgress([], [], T0 + 10, [...results].reverse())).toEqual(deriveProgress([], [], T0 + 10, results));
  });
});

describe('the streak counts days with a question answered or a card rated', () => {
  const rating = (at: number, id = `rv${seq++}`): CardReviewEvent => ({
    id, profileId: 'p', courseId: 'cbse-11-accountancy', topicId: 'journal-entries', cardId: 'je-card-1',
    conceptId: 'je-goods', known: true, at, sessionId: 'sc',
  });
  const DAY4 = dayKey(T0 + 3 * DAY_MS);

  it('extends the streak over a day on which only a card was rated', () => {
    // Three days apart is too long a gap on its own; a card rated in between keeps the streak going.
    const attempts = [attempt({ at: T0 }), attempt({ at: T0 + 3 * DAY_MS })];
    const without = deriveProgress(attempts, [], T0 + 3 * DAY_MS, [], []);
    expect(without.streak).toEqual({ count: 1, lastDay: DAY4 });
    const withCards = deriveProgress(attempts, [], T0 + 3 * DAY_MS, [], [rating(T0 + DAY_MS)]);
    expect(withCards.streak).toEqual({ count: 3, lastDay: DAY4 });
  });

  it('starts a streak from cards alone, without changing XP', () => {
    const p = deriveProgress([], [], T0, [], [rating(T0)]);
    expect(p.streak).toEqual({ count: 1, lastDay: DAY1 });
    expect(p.xp).toBe(0);
    expect(p.xpByDay).toEqual({});
    expect(p.answered).toBe(0);
  });

  it('does not depend on the order of attempts or card reviews', () => {
    const attempts = [attempt({ at: T0 }), attempt({ at: T0 + 2 * DAY_MS })];
    const ratings = [rating(T0 + DAY_MS), rating(T0 + 3 * DAY_MS)];
    const forward = deriveProgress(attempts, [], T0 + 3 * DAY_MS, [], ratings);
    expect(forward.streak.count).toBe(4);
    expect(deriveProgress([...attempts].reverse(), [], T0 + 3 * DAY_MS, [], [...ratings].reverse())).toEqual(forward);
  });
});

describe('replay XP rule', () => {
  const authored = (over: Partial<AttemptEvent>) => attempt({ questionId: 'je-q-002', ...over });

  it('gives full XP the first time and a fifth of it for later correct answers', () => {
    const p = deriveProgress([authored({}), authored({ at: T0 + 10, sessionId: 's2' })], [], T0 + 20);
    expect(p.xp).toBe(12);
    expect(p.xpByDay[DAY1]).toBe(12);
  });

  it('applies the hint factor before the repeat factor', () => {
    const p = deriveProgress([authored({ hintsUsed: 1 }), authored({ at: T0 + 10, sessionId: 's2' })], [], T0 + 20);
    expect(p.xp).toBe(8 + 2);
  });

  it('never reduces a hinted repeat below 1 XP, and a revealed repeat earns nothing', () => {
    const first = authored({});
    const hinted = authored({ at: T0 + 10, hintsUsed: 2, difficulty: 'easy' });
    const revealed = authored({ at: T0 + 20, hintsUsed: 3, correct: false });
    expect(deriveProgress([first, hinted], [], T0 + 30).xp).toBe(10 + 1);
    expect(deriveProgress([first, revealed], [], T0 + 30).xp).toBe(10);
  });

  it('gives a generated question full XP the first time and the repeat amount after', () => {
    const gen = (at: number) => attempt({ questionId: 'gen:je-cash-sale:1:5', at });
    expect(deriveProgress([gen(T0), gen(T0 + 10)], [], T0 + 20).xp).toBe(10 + 2);
    expect(deriveProgress([gen(T0), gen(T0 + 10), gen(T0 + 20)], [], T0 + 30).xp).toBe(10 + 2 + 2);
  });

  it('gives a generated question full XP on the first correct answer after a wrong one', () => {
    const gen = (at: number, correct = true) => attempt({ questionId: 'gen:je-cash-sale:1:5', at, correct });
    expect(deriveProgress([gen(T0, false), gen(T0 + 10), gen(T0 + 20)], [], T0 + 30).xp).toBe(10 + 2);
  });

  it('decides "first correct" for a generated question in event order, not supply order', () => {
    const early = attempt({ id: 'g1', questionId: 'gen:je-cash-sale:1:5', at: T0 });
    const late = attempt({ id: 'g2', questionId: 'gen:je-cash-sale:1:5', at: T0 + 10, sessionId: 's2' });
    expect(deriveProgress([late, early], [], T0 + 20)).toEqual(deriveProgress([early, late], [], T0 + 20));
    expect(deriveProgress([late, early], [], T0 + 20).xp).toBe(12);
  });

  it('gives full XP on the first correct answer after a wrong one', () => {
    const p = deriveProgress([authored({ correct: false }), authored({ at: T0 + 10 }), authored({ at: T0 + 20 })], [], T0 + 30);
    expect(p.xp).toBe(10 + 2);
  });

  it('decides "first correct" in event order, not supply order', () => {
    const early = authored({ id: 'e1', at: T0 });
    const late = authored({ id: 'e2', at: T0 + 10, sessionId: 's2' });
    expect(deriveProgress([late, early], [], T0 + 20)).toEqual(deriveProgress([early, late], [], T0 + 20));
  });
});

describe('partial XP rule', () => {
  const statement = (over: Partial<AttemptEvent>) =>
    attempt({ questionId: 'gen:tb-prepare:1:7', difficulty: 'medium', correct: false, mistakeCode: 'rows:ooooooooom', ...over });

  it('pays a mostly right statement in proportion to its rows, on its first answer only, and counts it as wrong', () => {
    const p = deriveProgress([statement({})], [], T0 + 10);
    expect(p.xp).toBe(18);
    expect(p.correct).toBe(0);
    expect(p.questions['gen:tb-prepare:1:7'].mistakeOpen).toBe(true);
    // A second answer of the same question that is still not right earns nothing more; a right one earns in full.
    expect(deriveProgress([statement({}), statement({ at: T0 + 10, sessionId: 's2' })], [], T0 + 20).xp).toBe(18);
    expect(deriveProgress([statement({}), statement({ at: T0 + 10, sessionId: 's2', correct: true, mistakeCode: undefined })], [], T0 + 20).xp).toBe(18 + 20);
  });

  it('pays nothing for a statement less than half right, or one that was answered before', () => {
    expect(deriveProgress([statement({ mistakeCode: 'rows:oooommmmmm' })], [], T0 + 10).xp).toBe(0);
    const wrongFirst = statement({ mistakeCode: 'rows:mmmmmmmmmm' });
    expect(deriveProgress([wrongFirst, statement({ at: T0 + 10 })], [], T0 + 20).xp).toBe(0);
  });
});

describe('daily bonuses and XP by day', () => {
  it('adds the mission bonus once per day', () => {
    const p = deriveProgress([], [], T0, [session('daily_mission', DAY1, T0), session('daily_mission', DAY1, T0 + 5)]);
    expect(p.xp).toBe(50);
    expect(p.xpByDay).toEqual({ [DAY1]: 50 });
    expect(p.missionDoneDays).toEqual([DAY1]);
  });

  it('adds mission and challenge bonuses separately on the same day', () => {
    const p = deriveProgress([], [], T0, [session('daily_mission', DAY1, T0), session('daily_challenge', DAY1, T0 + 5)]);
    expect(p.xp).toBe(80);
    expect(p.missionDoneDays).toEqual([DAY1]);
    expect(p.challengeDoneDays).toEqual([DAY1]);
  });

  it('adds the bonus again on another day, keyed by the result day', () => {
    const p = deriveProgress([], [], T0 + DAY_MS, [session('daily_mission', DAY1, T0), session('daily_mission', DAY2, T0 + DAY_MS)]);
    expect(p.xp).toBe(100);
    expect(p.xpByDay).toEqual({ [DAY1]: 50, [DAY2]: 50 });
  });

  it('ignores other session kinds for bonuses', () => {
    const p = deriveProgress([], [], T0, [session('smart', DAY1, T0), session('cards', DAY1, T0 + 1)]);
    expect(p.xp).toBe(0);
    expect(p.xpByDay).toEqual({});
    expect(p.missionDoneDays).toEqual([]);
  });

  it('keeps total xp equal to the sum of xpByDay in a mixed log', () => {
    const attempts = [
      attempt({ at: T0 }), attempt({ at: T0 + 1, difficulty: 'complex' }), attempt({ at: T0 + DAY_MS, difficulty: 'medium' }),
      attempt({ at: T0 + 2, correct: false }),
    ];
    const p = deriveProgress(attempts, [passed('journal-entries-level-1', T0 + 3)], T0 + DAY_MS, [
      session('daily_mission', DAY1, T0 + 4), session('daily_challenge', DAY2, T0 + DAY_MS + 1),
    ]);
    expect(p.xpByDay).toEqual({ [DAY1]: 10 + 30 + 20 + 50, [DAY2]: 20 + 30 });
    expect(p.xp).toBe(Object.values(p.xpByDay).reduce((a, b) => a + b, 0));
  });

  it('reports xpToday and goalMet at the boundary', () => {
    // 23 + 8 + 8 + 5 + 5 = 49
    const p49 = deriveProgress(
      [
        attempt({ difficulty: 'complex', hintsUsed: 1 }),
        attempt({ at: T0 + 1, hintsUsed: 1 }), attempt({ at: T0 + 2, hintsUsed: 1 }),
        attempt({ at: T0 + 3, hintsUsed: 2 }), attempt({ at: T0 + 4, hintsUsed: 2 }),
      ],
      [], T0 + 10,
    );
    const p50 = deriveProgress([attempt({ difficulty: 'complex' }), attempt({ at: T0 + 1, difficulty: 'medium' })], [], T0 + 10);
    expect(xpToday(p49, DAY1)).toBe(49);
    expect(xpToday(p49, DAY2)).toBe(0);
    expect(goalMet(p49, DAY1, 50)).toBe(false);
    expect(xpToday(p50, DAY1)).toBe(50);
    expect(goalMet(p50, DAY1, 50)).toBe(true);
    expect(goalMet(p50, DAY2, 50)).toBe(false);
  });

  it('does not depend on the order session results are supplied in', () => {
    const attempts = [attempt({ at: T0 }), attempt({ at: T0 + DAY_MS })];
    const results = [session('daily_mission', DAY1, T0 + 1), session('daily_challenge', DAY1, T0 + 2), session('daily_mission', DAY2, T0 + DAY_MS + 1)];
    const forward = deriveProgress(attempts, [], T0 + DAY_MS, results);
    expect(deriveProgress([...attempts].reverse(), [], T0 + DAY_MS, [...results].reverse())).toEqual(forward);
  });
});
