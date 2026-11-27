import { describe, expect, it } from 'vitest';
import { COURSE_IDS, DEFAULT_COURSE_ID } from '@/content/catalogue.generated';
import { CONFIG } from '@/learning/config';
import { deriveProgress } from '@/learning/progress';
import { parseBackup } from '@/storage/backup';
import { MemoryStore } from '@/storage/memoryStore';
import { BACKUP_FORMAT, applyProfilePatch, isCourseOf, type AttemptEvent, type CardReviewEvent, type LevelResult, type MockPaperRecord, type Profile, type SessionResult } from '@/storage/types';
import { deriveShared, eventsOfCourse, type EventLists } from './progressLoad';
import { BACKUP_UNKNOWN_COURSE, restoreBackupFile } from './restoreBackup';

const C11 = 'cbse-11-accountancy';
const C12 = 'cbse-12-accountancy';
const DAY_MS = 86_400_000;
const T0 = new Date(2026, 9, 5, 10, 0, 0).getTime();
const day = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const attempt = (id: string, courseId: string, topicId: string, at: number, change: Partial<AttemptEvent> = {}): AttemptEvent => ({
  id, profileId: 'p', courseId, topicId, conceptId: `${topicId}-c`, questionId: `${topicId}-q-${id}`, difficulty: 'easy', correct: true, hintsUsed: 0, timeMs: 1000, at, sessionId: `s-${id}`, ...change,
});
const level = (id: string, topicId: string, at: number): LevelResult => ({ id, profileId: 'p', topicId, levelId: `${topicId}-level-0`, score: 1, passed: true, at });
const review = (id: string, courseId: string, topicId: string, at: number): CardReviewEvent => ({ id, profileId: 'p', courseId, topicId, cardId: `${topicId}-card`, conceptId: `${topicId}-c`, known: true, at, sessionId: `s-${id}` });
const session = (id: string, courseId: string, kind: SessionResult['kind'], at: number, change: Partial<SessionResult> = {}): SessionResult => ({ id, profileId: 'p', courseId, kind, sessionId: `s-${id}`, day: day(at), correct: 8, total: 8, at, ...change });

// A learner who did three days of Class 11, then changed to Class 12 for two.
const lists: EventLists = {
  attempts: [
    attempt('a1', C11, 'ledger', T0),
    attempt('a2', C11, 'ledger', T0 + DAY_MS, { correct: false, mistakeCode: 'wrongAmount' }),
    attempt('a3', C11, 'cash-book', T0 + 2 * DAY_MS),
    attempt('b1', C12, 'goodwill', T0 + 3 * DAY_MS),
    attempt('b2', C12, 'goodwill', T0 + 4 * DAY_MS, { correct: false }),
  ],
  levelResults: [level('l1', 'ledger', T0), level('l2', 'goodwill', T0 + 3 * DAY_MS)],
  cardReviews: [review('r1', C11, 'ledger', T0), review('r2', C12, 'goodwill', T0 + 3 * DAY_MS)],
  sessionResults: [
    session('m1', C11, 'daily_mission', T0 + 2 * DAY_MS),
    session('m2', C12, 'daily_mission', T0 + 4 * DAY_MS),
    session('k1', C11, 'marathon', T0 + DAY_MS, { scope: 'ledger', bestStreak: 6, correct: 9, total: 12 }),
    session('k2', C12, 'marathon', T0 + 4 * DAY_MS, { scope: 'goodwill', bestStreak: 3, correct: 4, total: 5 }),
    session('x1', C12, 'mock', T0 + 4 * DAY_MS, { correct: 15, total: 20 }),
  ],
};
const NOW = T0 + 4 * DAY_MS + 1000;

describe('the events of a learner who has been on two courses', () => {
  it('belong to the course they name; a level result to the course of its topic', () => {
    const own = eventsOfCourse(lists, C12);
    expect(own.attempts.map((a) => a.id)).toEqual(['b1', 'b2']);
    expect(own.levelResults.map((r) => r.id)).toEqual(['l2']);
    expect(own.cardReviews.map((r) => r.id)).toEqual(['r2']);
    expect(own.sessionResults.map((r) => r.id)).toEqual(['m2', 'k2', 'x1']);
    expect(eventsOfCourse(lists, C11).levelResults.map((r) => r.id)).toEqual(['l1']);
    // A level result of a topic that is in no course was made before there was a second one: it is Class 11's.
    const old = { ...lists, levelResults: [...lists.levelResults, level('l0', 'a-retired-topic', T0)] };
    expect(eventsOfCourse(old, C11).levelResults.map((r) => r.id)).toEqual(['l1', 'l0']);
    expect(eventsOfCourse(old, C12).levelResults.map((r) => r.id)).toEqual(['l2']);
  });
});

describe('what a learner sees on the course they are on', () => {
  const on11 = deriveShared(lists, NOW, C11);
  const on12 = deriveShared(lists, NOW, C12);

  it('is that course alone: mastery, passed levels, mistakes, what was answered, activity, cards and sessions', () => {
    expect(Object.keys(on11.progress.concepts)).toEqual(['ledger-c', 'cash-book-c']);
    expect(Object.keys(on12.progress.concepts)).toEqual(['goodwill-c']);
    expect(on11.progress.passedLevelIds).toEqual(['ledger-level-0']);
    expect(on12.progress.passedLevelIds).toEqual(['goodwill-level-0']);
    expect([on11.progress.answered, on11.progress.correct]).toEqual([3, 2]);
    expect([on12.progress.answered, on12.progress.correct]).toEqual([2, 1]);
    const open = (p: typeof on11.progress) => Object.entries(p.questions).filter(([, q]) => q.mistakeOpen).map(([id]) => id);
    expect(open(on11.progress)).toEqual(['ledger-q-a2']);
    expect(open(on12.progress)).toEqual(['goodwill-q-b2']);
    expect(Object.keys(on11.activity)).toEqual(['ledger', 'cash-book']);
    expect(Object.keys(on12.activity)).toEqual(['goodwill']);
    expect(Object.keys(on11.cardStates)).toEqual(['ledger-card']);
    expect(Object.keys(on12.cardStates)).toEqual(['goodwill-card']);
    // The history of sessions: marathon bests and mock papers are of the course.
    expect(on11.events.sessionResults.filter((r) => r.kind === 'marathon').map((r) => r.bestStreak)).toEqual([6]);
    expect(on12.events.sessionResults.filter((r) => r.kind === 'marathon').map((r) => r.bestStreak)).toEqual([3]);
    expect(on11.events.sessionResults.some((r) => r.kind === 'mock')).toBe(false);
    expect(on12.events.sessionResults.filter((r) => r.kind === 'mock')).toHaveLength(1);
  });

  it('has its own daily mission: done in one course on a day, it is still to do in the other', () => {
    expect(on11.progress.missionDoneDays).toEqual([day(T0 + 2 * DAY_MS)]);
    expect(on12.progress.missionDoneDays).toEqual([day(T0 + 4 * DAY_MS)]);
  });

  it('counts XP and the streak for the learner: the same on either course, every course added up', () => {
    expect(on11.progress.xp).toBe(on12.progress.xp);
    expect(on11.progress.xpByDay).toEqual(on12.progress.xpByDay);
    expect(on11.progress.streak).toEqual(on12.progress.streak);
    // Each course earns what it would have earned alone.
    const alone = (courseId: string) => {
      const e = eventsOfCourse(lists, courseId);
      return deriveProgress(e.attempts, e.levelResults, NOW, e.sessionResults, e.cardReviews);
    };
    expect(on12.progress.xp).toBe(alone(C11).xp + alone(C12).xp);
    expect(alone(C12).xp).toBe(CONFIG.xp.perCorrect.easy + CONFIG.xp.levelPassBonus + CONFIG.xp.dailyMissionBonus + 20 * CONFIG.xp.mockBonusPerMark);
    // Five days in a row, three of them in one course and two in the other.
    expect(on12.progress.streak).toEqual({ count: 5, lastDay: day(T0 + 4 * DAY_MS) });
    expect(alone(C12).streak.count).toBe(2);
    expect(on12.progress.xpByDay[day(T0)]).toBe(alone(C11).xpByDay[day(T0)]);
  });

  it('loses nothing on a change of course: changing back gives the first course exactly as it was', () => {
    const before = deriveShared(eventsOfCourse(lists, C11), NOW, C11);
    // Everything of Class 11 but the learner's own totals is what it was before Class 12 was ever opened.
    const strip = (p: typeof on11.progress) => ({ ...p, xp: 0, xpByDay: {}, streak: null });
    expect(strip(on11.progress)).toEqual(strip(before.progress));
    expect(on11.cardStates).toEqual(before.cardStates);
    expect(on11.activity).toEqual(before.activity);
    expect(on11.events).toEqual(before.events);
  });

  it('is everything as it always was for a learner who has only been on one course', () => {
    const only = eventsOfCourse(lists, C11);
    const shared = deriveShared(only, NOW, C11);
    expect(shared.progress).toEqual(deriveProgress(only.attempts, only.levelResults, NOW, only.sessionResults, only.cardReviews));
    // The very lists that were read: nothing is copied or filtered.
    expect(shared.events).toBe(only);
    expect(deriveShared(only, NOW).progress).toEqual(shared.progress);
  });

  it('is empty on a course the learner has not begun, with their XP and streak', () => {
    const fresh = deriveShared(eventsOfCourse(lists, C11), NOW, C12);
    expect(fresh.progress.answered).toBe(0);
    expect(fresh.progress.passedLevelIds).toEqual([]);
    expect(fresh.activity).toEqual({});
    expect(fresh.progress.xp).toBe(deriveShared(eventsOfCourse(lists, C11), NOW, C11).progress.xp);
    expect(fresh.progress.streak.count).toBe(3);
  });
});

describe('the course of a learner in storage', () => {
  const profile: Profile = { id: 'p', name: 'Varun', courseId: C11, createdAt: 1 };

  it('is changed like the name and the goal, to a course the app has, and nothing else moves', async () => {
    expect(COURSE_IDS).toEqual([C11, C12]);
    expect(DEFAULT_COURSE_ID).toBe(C11);
    expect(applyProfilePatch(profile, { courseId: C12 })).toEqual({ ...profile, courseId: C12 });
    expect(() => applyProfilePatch(profile, { courseId: 'cbse-99-unknown' })).toThrow('Unknown course');
    expect(() => applyProfilePatch(profile, { courseId: '' })).toThrow('Unknown course');
    const store = new MemoryStore();
    const made = await store.createProfile('Varun', C11);
    await store.appendAttempt(attempt('a1', C11, 'ledger', T0, { profileId: made.id }));
    const changed = await store.updateProfile(made.id, { courseId: C12 });
    expect(changed).toEqual({ ...made, courseId: C12 });
    await store.appendAttempt(attempt('b1', C12, 'goodwill', T0 + 1, { profileId: made.id }));
    expect((await store.listAttempts(made.id)).map((a) => [a.id, a.courseId])).toEqual([['a1', C11], ['b1', C12]]);
    expect((await store.updateProfile(made.id, { courseId: C11 })).courseId).toBe(C11);
    expect(await store.listAttempts(made.id)).toHaveLength(2);
  });

  it('is in a backup, with the events of both courses, and comes back with them', async () => {
    const store = new MemoryStore();
    const paper: MockPaperRecord = { id: 'mp', profileId: 'p', courseId: C12, paper: 'half.1', sessionId: 's', startedAt: 1, allowedMs: 1000, answers: {}, flagged: [], timeMs: {}, current: 0 };
    const backup = { format: BACKUP_FORMAT, version: 1, profile: { ...profile, courseId: C12 }, ...lists, mockPapers: [paper], writtenResults: [] };
    const parsed = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed.attempts.map((a) => a.courseId)).toEqual([C11, C11, C11, C12, C12]);
    expect(parsed.cardReviews.map((r) => r.courseId)).toEqual([C11, C12]);
    expect(parsed.sessionResults.map((r) => r.courseId)).toEqual([C11, C12, C11, C12, C12]);
    expect(parsed.mockPapers[0].courseId).toBe(C12);
    const restored = await store.importProfile(JSON.parse(JSON.stringify(backup)));
    expect(restored.courseId).toBe(C12);
    expect(await store.exportProfile('p')).toEqual({ ...backup, attempts: [...lists.attempts], sessionResults: [...lists.sessionResults].sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1)) });
  });

  it('restores a backup made before there was a second course exactly as it was', async () => {
    // Every event of such a backup names the one course there was, and so does the learner.
    const old = { format: BACKUP_FORMAT, version: 1, profile, ...eventsOfCourse(lists, C11) };
    const parsed = parseBackup(JSON.parse(JSON.stringify(old)));
    expect(parsed.profile).toEqual(profile);
    expect(parsed.attempts).toEqual(old.attempts);
    expect(parsed.levelResults).toEqual(old.levelResults);
    expect(parsed.cardReviews).toEqual(old.cardReviews);
    expect(parsed.sessionResults).toEqual(old.sessionResults);
    expect(parsed.mockPapers).toEqual([]);
    const store = new MemoryStore();
    const file = new File([JSON.stringify(old)], 'backup.json', { type: 'application/json' });
    const outcome = await restoreBackupFile(file, store);
    expect(outcome).toMatchObject({ ok: true, profile: { id: 'p', courseId: C11 } });
    const shared = deriveShared({ attempts: await store.listAttempts('p'), levelResults: await store.listLevelResults('p'), cardReviews: await store.listCardReviews('p'), sessionResults: await store.listSessionResults('p') }, NOW, C11);
    expect(shared.progress).toEqual(deriveShared(eventsOfCourse(lists, C11), NOW, C11).progress);
  });

  it('refuses a backup with an event of a course this version does not have, and says which kind of file it is', async () => {
    expect(isCourseOf(profile, C12)).toBe(true);
    expect(isCourseOf(profile, 'cbse-10-something')).toBe(false);
    expect(isCourseOf({ courseId: 'cbse-10-something' }, 'cbse-10-something')).toBe(true);
    const odd = { format: BACKUP_FORMAT, version: 1, profile, attempts: [attempt('z', 'cbse-10-something', 't', T0)], levelResults: [] };
    expect(() => parseBackup(JSON.parse(JSON.stringify(odd)))).toThrow('Invalid backup file');
    const outcome = await restoreBackupFile(new File([JSON.stringify(odd)], 'b.json'), new MemoryStore());
    expect(outcome).toEqual({ ok: false, text: BACKUP_UNKNOWN_COURSE });
  });
});
