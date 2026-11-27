import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { parseBackup } from './backup';
import { DexieStore } from './dexieStore';
import { MemoryStore } from './memoryStore';
import { challengeTimerOn, type AttemptEvent, type CardReviewEvent, type LevelResult, type MockPaperRecord, type ProgressStore, type SessionResult, type WrittenResult } from './types';

const attempt = (id: string, profileId: string, at: number): AttemptEvent => ({
  id, profileId, courseId: 'cbse-11-accountancy', topicId: 'journal-entries', conceptId: 'je-goods',
  questionId: 'gen:je-cash-sale:1:5', difficulty: 'easy', correct: true, hintsUsed: 0, timeMs: 4000, at, sessionId: 's1',
});
/** The answers an attempt keeps: a set with an entry left empty, an account over two periods, a statement with its ending named. */
const KEPT_SET: NonNullable<AttemptEvent['answer']> = {
  type: 'journal_set',
  entries: [[{ accountId: 'cash', side: 'Cr', amount: 500000 }, { accountId: 'capital', side: 'Dr', amount: 500000 }], [], [{ accountId: 'rent', side: 'Dr', amount: 98050 }]],
};
const KEPT_ACCOUNT: NonNullable<AttemptEvent['answer']> = {
  type: 'account',
  sides: [[{ label: 'Balance b/d', amounts: [500000] }], [{ label: 'Sales A/c', amounts: [200000] }, { label: 'Balance c/d', amounts: [300000] }]],
  below: [[{ label: 'Balance b/d', amounts: [300000] }], []],
  later: [[[{ label: 'Cash A/c', amounts: [100000, 0] }], []]],
};
const KEPT_STATEMENT: NonNullable<AttemptEvent['answer']> = { type: 'statement', rows: [{ label: 'Capital', amounts: [0, 9000000] }], final: null, finalLabel: 'Overdraft as per Pass Book' };
/** An attempt at a long question that was missed, with the answer it keeps. */
const missed = (id: string, profileId: string, at: number, answer: NonNullable<AttemptEvent['answer']>): AttemptEvent => ({
  ...attempt(id, profileId, at), questionId: `gen:x-${answer.type}:1:5`, correct: false, mistakeCode: 'set:ok,empty,wrongAmount', answer,
});

const result = (id: string, profileId: string, at: number): LevelResult => ({
  id, profileId, topicId: 'journal-entries', levelId: 'journal-entries-level-4', score: 0.9, passed: true, at,
});

const cardReview = (id: string, profileId: string, at: number): CardReviewEvent => ({
  id, profileId, courseId: 'cbse-11-accountancy', topicId: 'journal-entries', cardId: 'card-1', conceptId: 'je-goods',
  known: true, at, sessionId: 's2',
});
const sessionResult = (id: string, profileId: string, at: number): SessionResult => ({
  id, profileId, courseId: 'cbse-11-accountancy', kind: 'smart', sessionId: 's3', day: '2026-10-05', correct: 7, total: 10, at,
});

const mockPaper = (id: string, profileId: string, startedAt: number, patch: Partial<MockPaperRecord> = {}): MockPaperRecord => ({
  id, profileId, courseId: 'cbse-11-accountancy', paper: 'topic.ledger.1', sessionId: `s-${id}`, startedAt, allowedMs: 2_400_000,
  answers: { 'q-1': { type: 'mcq', optionId: 'b' }, 'gen:x:1:5': { type: 'journal_entry', rows: [{ accountId: 'cash', side: 'Dr', amount: '500' }] } },
  flagged: ['q-1'], timeMs: { 'q-1': 4200 }, current: 3, ...patch,
});

const written = (id: string, profileId: string, at: number, patch: Partial<WrittenResult> = {}): WrittenResult => ({
  id, profileId, courseId: 'cbse-11-accountancy', topicId: 'provisions-and-reserves', questionId: 'w11-pr-001', marks: 2.5, maxMarks: 3,
  ticked: [0, 2], onPaper: false, answer: 'A provision is a charge against profit.', timeMs: 90_000, at, ...patch,
});

type ProfileShape = { id: string; name: string; courseId: string; createdAt: number; dailyGoalXp?: number };
const backupFor = (profile: ProfileShape, attempts: AttemptEvent[] = [], levelResults: LevelResult[] = []) =>
  JSON.parse(JSON.stringify({ format: 'accountancy-master-backup', version: 1, profile, attempts, levelResults }));
const prof: ProfileShape = { id: 'p1', name: 'First', courseId: 'cbse-11-accountancy', createdAt: 10 };

let n = 0;
const stores: [string, () => ProgressStore][] = [
  ['MemoryStore', () => new MemoryStore()],
  ['DexieStore', () => new DexieStore(`test-db-${n++}`)],
];

describe.each(stores)('%s', (_name, make) => {
  it('creates and lists profiles', async () => {
    const store = make();
    const p = await store.createProfile('Varun', 'cbse-11-accountancy');
    expect(p.id).toBeTruthy();
    expect(await store.listProfiles()).toEqual([p]);
  });

  it('keeps attempts and level results per profile, oldest first', async () => {
    const store = make();
    const a = await store.createProfile('A', 'cbse-11-accountancy');
    const b = await store.createProfile('B', 'cbse-11-accountancy');
    await store.appendAttempt(attempt('2', a.id, 200));
    await store.appendAttempt(attempt('1', a.id, 100));
    await store.appendAttempt(attempt('3', b.id, 300));
    await store.appendLevelResult(result('r1', a.id, 250));
    expect((await store.listAttempts(a.id)).map((x) => x.id)).toEqual(['1', '2']);
    expect((await store.listAttempts(b.id)).map((x) => x.id)).toEqual(['3']);
    expect(await store.listLevelResults(a.id)).toHaveLength(1);
    expect(await store.listLevelResults(b.id)).toHaveLength(0);
  });

  it('exports a profile and merges it into another store without duplicates', async () => {
    const source = make();
    const p = await source.createProfile('Varun', 'cbse-11-accountancy');
    await source.appendAttempt(attempt('1', p.id, 100));
    await source.appendLevelResult(result('r1', p.id, 150));
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));

    const target = make();
    await target.importProfile(backup);
    await target.appendAttempt(attempt('2', p.id, 200));
    await target.importProfile(backup);
    expect((await target.listAttempts(p.id)).map((x) => x.id)).toEqual(['1', '2']);
    expect(await target.listLevelResults(p.id)).toHaveLength(1);
    expect(await target.listProfiles()).toHaveLength(1);
  });

  it('append never overwrites an existing event with the same id', async () => {
    const store = make();
    await store.appendAttempt(attempt('a1', 'p1', 100));
    await store.appendAttempt({ ...attempt('a1', 'p1', 100), correct: false });
    const attempts = await store.listAttempts('p1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].correct).toBe(true);

    await store.appendLevelResult(result('r1', 'p1', 100));
    await store.appendLevelResult({ ...result('r1', 'p1', 100), score: 0.1, passed: false });
    const results = await store.listLevelResults('p1');
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0.9);
    expect(results[0].passed).toBe(true);
  });

  it('rejects a bad backup and an unknown profile', async () => {
    const store = make();
    await expect(store.importProfile({ hello: 'world' })).rejects.toThrow('Invalid backup file');
    await expect(store.exportProfile('missing')).rejects.toThrow('Profile not found');
  });

  it('import does not overwrite an existing attempt or level result with the same id', async () => {
    const store = make();
    await store.importProfile(backupFor(prof, [attempt('a1', 'p1', 100)], [result('r1', 'p1', 100)]));
    const flipped = { ...attempt('a1', 'p1', 100), correct: false };
    const lowered = { ...result('r1', 'p1', 100), score: 0.1, passed: false };
    await store.importProfile(backupFor(prof, [flipped], [lowered]));
    expect((await store.listAttempts('p1'))[0].correct).toBe(true);
    const r = (await store.listLevelResults('p1'))[0];
    expect(r.score).toBe(0.9);
    expect(r.passed).toBe(true);
  });

  it('import skips a row whose id belongs to another local profile', async () => {
    const store = make();
    const other: ProfileShape = { id: 'p2', name: 'Other', courseId: 'cbse-11-accountancy', createdAt: 20 };
    await store.importProfile(backupFor(other, [attempt('shared', 'p2', 100)], [result('rshared', 'p2', 100)]));
    await store.importProfile(
      backupFor(prof, [attempt('shared', 'p1', 999), attempt('mine', 'p1', 50)], [result('rshared', 'p1', 999), result('rmine', 'p1', 60)]),
    );
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['mine']);
    expect((await store.listLevelResults('p1')).map((x) => x.id)).toEqual(['rmine']);
    const kept = await store.listAttempts('p2');
    expect(kept.map((x) => x.id)).toEqual(['shared']);
    expect(kept[0].at).toBe(100);
    const keptR = await store.listLevelResults('p2');
    expect(keptR.map((x) => x.id)).toEqual(['rshared']);
    expect(keptR[0].at).toBe(100);
  });

  it('import keeps the existing local profile record', async () => {
    const store = make();
    const first = await store.importProfile(backupFor(prof));
    expect(first.name).toBe('First');
    const second = await store.importProfile(backupFor({ ...prof, name: 'Renamed', createdAt: 99 }));
    expect(second).toEqual(first);
    expect(await store.listProfiles()).toEqual([first]);
  });

  it('orders equal timestamps by id and profiles by createdAt then id', async () => {
    const store = make();
    await store.appendAttempt(attempt('b', 'p1', 100));
    await store.appendAttempt(attempt('a', 'p1', 100));
    await store.appendAttempt(attempt('c', 'p1', 50));
    await store.appendLevelResult(result('rb', 'p1', 100));
    await store.appendLevelResult(result('ra', 'p1', 100));
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect((await store.listLevelResults('p1')).map((x) => x.id)).toEqual(['ra', 'rb']);

    const s2 = make();
    await s2.importProfile(backupFor({ id: 'z', name: 'Z', courseId: 'c', createdAt: 5 }));
    await s2.importProfile(backupFor({ id: 'b', name: 'B', courseId: 'c', createdAt: 9 }));
    await s2.importProfile(backupFor({ id: 'a', name: 'A', courseId: 'c', createdAt: 9 }));
    expect((await s2.listProfiles()).map((x) => x.id)).toEqual(['z', 'a', 'b']);
  });
});

describe.each(stores)('%s card reviews, session results and learner management', (_name, make) => {
  it('keeps card reviews per profile, oldest first then by id, ignoring duplicate ids', async () => {
    const store = make();
    await store.appendCardReview(cardReview('b', 'p1', 100));
    await store.appendCardReview(cardReview('a', 'p1', 100));
    await store.appendCardReview(cardReview('c', 'p1', 50));
    await store.appendCardReview(cardReview('x', 'p2', 10));
    await store.appendCardReview({ ...cardReview('a', 'p1', 100), known: false });
    const list = await store.listCardReviews('p1');
    expect(list.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(list[1].known).toBe(true);
    expect((await store.listCardReviews('p2')).map((x) => x.id)).toEqual(['x']);
  });

  it('keeps session results per profile, oldest first then by id, ignoring duplicate ids', async () => {
    const store = make();
    await store.appendSessionResult(sessionResult('b', 'p1', 100));
    await store.appendSessionResult(sessionResult('a', 'p1', 100));
    await store.appendSessionResult(sessionResult('c', 'p1', 50));
    await store.appendSessionResult(sessionResult('x', 'p2', 10));
    await store.appendSessionResult({ ...sessionResult('a', 'p1', 100), correct: 0 });
    const list = await store.listSessionResults('p1');
    expect(list.map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(list[1].correct).toBe(7);
    expect((await store.listSessionResults('p2')).map((x) => x.id)).toEqual(['x']);
  });

  it('appends events together: every kind at once, started side by side, a duplicate still ignored', async () => {
    const store = make();
    await store.appendAttempt(attempt('a1', 'p1', 10));
    await store.appendTogether(() =>
      Promise.all([
        store.appendAttempt({ ...attempt('a1', 'p1', 10), correct: false }),
        store.appendAttempt(attempt('a2', 'p1', 20)),
        store.appendCardReview(cardReview('c1', 'p1', 20)),
        store.appendLevelResult(result('r1', 'p1', 30)),
        store.appendSessionResult(sessionResult('s1', 'p1', 30)),
      ]),
    );
    const attempts = await store.listAttempts('p1');
    expect(attempts.map((x) => x.id)).toEqual(['a1', 'a2']);
    expect(attempts[0].correct).toBe(true);
    expect((await store.listCardReviews('p1')).map((x) => x.id)).toEqual(['c1']);
    expect((await store.listLevelResults('p1')).map((x) => x.id)).toEqual(['r1']);
    expect((await store.listSessionResults('p1')).map((x) => x.id)).toEqual(['s1']);
    // One after another works as well, and so does nothing at all.
    await store.appendTogether(async () => {
      await store.appendAttempt(attempt('a3', 'p1', 40));
      await store.appendLevelResult(result('r2', 'p1', 50));
    });
    await store.appendTogether(async () => undefined);
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1', 'a2', 'a3']);
    expect((await store.listLevelResults('p1')).map((x) => x.id)).toEqual(['r1', 'r2']);
  });

  it('appends together or not at all: when one of them fails, none is stored', async () => {
    const store = make();
    await store.appendAttempt(attempt('a1', 'p1', 10));
    const failing = store.appendTogether(() =>
      Promise.all([
        store.appendAttempt(attempt('a2', 'p1', 20)),
        store.appendLevelResult(result('r1', 'p1', 30)),
        Promise.reject(new Error('the result could not be made')),
      ]),
    );
    await expect(failing).rejects.toThrow('the result could not be made');
    const late = store.appendTogether(async () => {
      await store.appendAttempt(attempt('a3', 'p1', 40));
      await store.appendSessionResult(sessionResult('s1', 'p1', 50));
      throw new Error('after the appends');
    });
    await expect(late).rejects.toThrow('after the appends');
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1']);
    expect(await store.listLevelResults('p1')).toEqual([]);
    expect(await store.listSessionResults('p1')).toEqual([]);
    // The store goes on working after a failure.
    await store.appendTogether(() => Promise.all([store.appendAttempt(attempt('a2', 'p1', 20)), store.appendLevelResult(result('r1', 'p1', 30))]));
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1', 'a2']);
    expect((await store.listLevelResults('p1')).map((x) => x.id)).toEqual(['r1']);
  });

  it('updateProfile renames (trimmed), sets the daily goal and shows up in listProfiles', async () => {
    const store = make();
    const p = await store.createProfile('Varun', 'cbse-11-accountancy');
    const renamed = await store.updateProfile(p.id, { name: '  Varun K  ' });
    expect(renamed).toEqual({ ...p, name: 'Varun K' });
    const goal = await store.updateProfile(p.id, { dailyGoalXp: 50 });
    expect(goal).toEqual({ ...p, name: 'Varun K', dailyGoalXp: 50 });
    expect(await store.listProfiles()).toEqual([goal]);
  });

  it('updateProfile rejects an empty name, a bad goal and an unknown id', async () => {
    const store = make();
    const p = await store.createProfile('Varun', 'cbse-11-accountancy');
    await expect(store.updateProfile(p.id, { name: '   ' })).rejects.toThrow('Enter a name');
    await expect(store.updateProfile(p.id, { dailyGoalXp: 0 })).rejects.toThrow('Invalid daily goal');
    await expect(store.updateProfile(p.id, { dailyGoalXp: 2.5 })).rejects.toThrow('Invalid daily goal');
    await expect(store.updateProfile(p.id, { dailyGoalXp: -5 })).rejects.toThrow('Invalid daily goal');
    await expect(store.updateProfile('missing', { name: 'X' })).rejects.toThrow('Profile not found');
    expect(await store.listProfiles()).toEqual([p]);
  });

  it('keeps the challenge timer with the learner: on for a new learner, off once they switch it off, and on again', async () => {
    const store = make();
    const p = await store.createProfile('Varun', 'cbse-11-accountancy');
    expect(p).not.toHaveProperty('challengeTimer');
    expect(challengeTimerOn(p)).toBe(true);

    const off = await store.updateProfile(p.id, { challengeTimer: false });
    expect(off).toEqual({ ...p, challengeTimer: false });
    expect(challengeTimerOn(off)).toBe(false);
    // It is stored, and another setting changed afterwards leaves it as it is.
    expect(await store.listProfiles()).toEqual([off]);
    expect(await store.updateProfile(p.id, { dailyGoalXp: 20 })).toEqual({ ...p, dailyGoalXp: 20, challengeTimer: false });

    const on = await store.updateProfile(p.id, { challengeTimer: true });
    expect(challengeTimerOn(on)).toBe(true);
    expect(challengeTimerOn((await store.listProfiles())[0])).toBe(true);
    await expect(store.updateProfile(p.id, { challengeTimer: 'off' as unknown as boolean })).rejects.toThrow('Invalid challenge timer');
    expect(await store.listProfiles()).toEqual([on]);
  });

  it('a backup carries the challenge timer, and a backup made before it was a setting restores a learner who has it on', async () => {
    const source = make();
    const p = await source.createProfile('Varun', 'cbse-11-accountancy');
    await source.updateProfile(p.id, { challengeTimer: false });
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.profile.challengeTimer).toBe(false);
    expect(challengeTimerOn(await make().importProfile(backup))).toBe(false);

    delete backup.profile.challengeTimer;
    const restored = await make().importProfile(backup);
    expect(restored).not.toHaveProperty('challengeTimer');
    expect(challengeTimerOn(restored)).toBe(true);
  });

  it('deleteProfile removes the learner and every event type, leaving another learner intact', async () => {
    const store = make();
    const a = await store.createProfile('A', 'cbse-11-accountancy');
    const b = await store.createProfile('B', 'cbse-11-accountancy');
    for (const p of [a, b]) {
      await store.appendAttempt(attempt(`at-${p.id}`, p.id, 1));
      await store.appendLevelResult(result(`lr-${p.id}`, p.id, 2));
      await store.appendCardReview(cardReview(`cr-${p.id}`, p.id, 3));
      await store.appendSessionResult(sessionResult(`sr-${p.id}`, p.id, 4));
    }
    await store.deleteProfile(a.id);
    expect((await store.listProfiles()).map((x) => x.id)).toEqual([b.id]);
    expect(await store.listAttempts(a.id)).toEqual([]);
    expect(await store.listLevelResults(a.id)).toEqual([]);
    expect(await store.listCardReviews(a.id)).toEqual([]);
    expect(await store.listSessionResults(a.id)).toEqual([]);
    expect((await store.listAttempts(b.id)).map((x) => x.id)).toEqual([`at-${b.id}`]);
    expect((await store.listLevelResults(b.id)).map((x) => x.id)).toEqual([`lr-${b.id}`]);
    expect((await store.listCardReviews(b.id)).map((x) => x.id)).toEqual([`cr-${b.id}`]);
    expect((await store.listSessionResults(b.id)).map((x) => x.id)).toEqual([`sr-${b.id}`]);
    await expect(store.deleteProfile('missing')).resolves.toBeUndefined();
    expect(await store.listProfiles()).toHaveLength(1);
  });

  it('exports and imports all four event types and the daily goal into a fresh store', async () => {
    const source = make();
    const p = await source.createProfile('Varun', 'cbse-11-accountancy');
    await source.updateProfile(p.id, { dailyGoalXp: 100 });
    await source.appendAttempt({ ...attempt('a1', p.id, 1), sessionKind: 'smart' });
    await source.appendLevelResult(result('r1', p.id, 2));
    await source.appendCardReview(cardReview('c1', p.id, 3));
    await source.appendSessionResult(sessionResult('s1', p.id, 4));
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.version).toBe(1);

    const target = make();
    const imported = await target.importProfile(backup);
    expect(imported.dailyGoalXp).toBe(100);
    expect(await target.listAttempts(p.id)).toEqual(await source.listAttempts(p.id));
    expect((await target.listAttempts(p.id))[0].sessionKind).toBe('smart');
    expect(await target.listLevelResults(p.id)).toEqual(await source.listLevelResults(p.id));
    expect(await target.listCardReviews(p.id)).toEqual(await source.listCardReviews(p.id));
    expect(await target.listSessionResults(p.id)).toEqual(await source.listSessionResults(p.id));
    expect(await target.listCardReviews(p.id)).toHaveLength(1);
    expect(await target.listSessionResults(p.id)).toHaveLength(1);
  });

  it('keeps the answer of an attempt as it was given, and gives it back in a backup that restores into a fresh store', async () => {
    const source = make();
    const p = await source.createProfile('Varun', 'cbse-11-accountancy');
    await source.appendAttempt(attempt('a0', p.id, 1));
    await source.appendAttempt(missed('a1', p.id, 2, KEPT_SET));
    await source.appendAttempt(missed('a2', p.id, 3, KEPT_ACCOUNT));
    await source.appendAttempt(missed('a3', p.id, 4, KEPT_STATEMENT));
    const stored = await source.listAttempts(p.id);
    expect(stored.map((a) => a.answer)).toEqual([undefined, KEPT_SET, KEPT_ACCOUNT, KEPT_STATEMENT]);
    // An attempt that keeps none has no such field at all.
    expect(stored[0]).not.toHaveProperty('answer');
    // A second append under the same id changes nothing, with or without an answer.
    await source.appendAttempt({ ...attempt('a1', p.id, 2), correct: true });
    expect((await source.listAttempts(p.id))[1]).toEqual(missed('a1', p.id, 2, KEPT_SET));

    // Through the file a learner saves: JSON, then a fresh store, then a backup of that store again.
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.attempts.map((a: AttemptEvent) => a.answer)).toEqual([undefined, KEPT_SET, KEPT_ACCOUNT, KEPT_STATEMENT]);
    const target = make();
    await target.importProfile(backup);
    expect(await target.listAttempts(p.id)).toEqual(stored);
    expect(JSON.parse(JSON.stringify(await target.exportProfile(p.id)))).toEqual(backup);
    // Imported twice, and over an attempt that is already there: what is on the device stays as it is.
    await target.importProfile({ ...backup, attempts: [{ ...backup.attempts[1], answer: KEPT_STATEMENT }] });
    expect(await target.listAttempts(p.id)).toEqual(stored);
  });

  it('restores a backup made before answers were kept: every attempt as it was, none with an answer', async () => {
    const store = make();
    // As such a backup has them: a missed set and a missed account with their codes alone.
    const before = (a: AttemptEvent): AttemptEvent => {
      const copy = { ...a };
      delete copy.answer;
      return copy;
    };
    const old = { ...validBackup(), attempts: [attempt('a0', 'p1', 1), before(missed('a1', 'p1', 2, KEPT_SET)), before(missed('a2', 'p1', 3, KEPT_ACCOUNT))] };
    expect(JSON.stringify(old)).not.toContain('"answer"');
    await store.importProfile(JSON.parse(JSON.stringify(old)));
    const restored = await store.listAttempts('p1');
    expect(restored).toEqual(old.attempts);
    for (const a of restored) expect(a).not.toHaveProperty('answer');
    expect(restored[1]).toMatchObject({ correct: false, mistakeCode: 'set:ok,empty,wrongAmount' });
    // The same learner goes on: a new attempt that keeps its answer stands beside the old ones, and both export.
    await store.appendAttempt(missed('a3', 'p1', 4, KEPT_STATEMENT));
    const exported = await store.exportProfile('p1');
    expect(exported.attempts.map((a) => a.answer)).toEqual([undefined, undefined, undefined, KEPT_STATEMENT]);
    expect(parseBackup(JSON.parse(JSON.stringify(exported))).attempts).toEqual(exported.attempts);
  });

  it("import merges the new lists by id without overwriting or taking another profile's ids", async () => {
    const store = make();
    const other: ProfileShape = { id: 'p2', name: 'Other', courseId: 'cbse-11-accountancy', createdAt: 20 };
    const withNew = (profile: ProfileShape, cardReviews: CardReviewEvent[], sessionResults: SessionResult[]) => ({
      ...backupFor(profile), cardReviews: JSON.parse(JSON.stringify(cardReviews)), sessionResults: JSON.parse(JSON.stringify(sessionResults)),
    });
    await store.importProfile(withNew(other, [cardReview('shared', 'p2', 100)], [sessionResult('sshared', 'p2', 100)]));
    await store.importProfile(withNew(prof, [cardReview('c1', 'p1', 5)], [sessionResult('s1', 'p1', 5)]));
    await store.importProfile(withNew(
      prof,
      [{ ...cardReview('c1', 'p1', 5), known: false }, cardReview('shared', 'p1', 999), cardReview('c2', 'p1', 6)],
      [{ ...sessionResult('s1', 'p1', 5), correct: 0 }, sessionResult('sshared', 'p1', 999), sessionResult('s2', 'p1', 6)],
    ));
    const reviews = await store.listCardReviews('p1');
    expect(reviews.map((x) => x.id)).toEqual(['c1', 'c2']);
    expect(reviews[0].known).toBe(true);
    const sessions = await store.listSessionResults('p1');
    expect(sessions.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(sessions[0].correct).toBe(7);
    expect((await store.listCardReviews('p2'))[0].at).toBe(100);
    expect((await store.listSessionResults('p2'))[0].at).toBe(100);
  });

  it('still imports a Plan 1B backup with no card reviews, session results or session kinds', async () => {
    const store = make();
    const old = backupFor(prof, [attempt('a1', 'p1', 1)], [result('r1', 'p1', 2)]);
    expect(old).not.toHaveProperty('cardReviews');
    expect(old).not.toHaveProperty('sessionResults');
    expect(old.attempts[0]).not.toHaveProperty('sessionKind');
    await store.importProfile(old);
    expect(await store.listAttempts('p1')).toHaveLength(1);
    expect(await store.listLevelResults('p1')).toHaveLength(1);
    expect(await store.listCardReviews('p1')).toEqual([]);
    expect(await store.listSessionResults('p1')).toEqual([]);
    expect((await store.exportProfile('p1')).cardReviews).toEqual([]);
  });
});

describe('DexieStore upgrade', () => {
  it('opens a version 1 database under version 2 with its data intact', async () => {
    const name = `upgrade-db-${n++}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ profiles: 'id', attempts: 'id, profileId', levelResults: 'id, profileId' });
    await v1.table('profiles').put({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10 });
    await v1.table('attempts').put(attempt('a1', 'p1', 100));
    v1.close();

    const store = new DexieStore(name);
    expect(await store.listProfiles()).toEqual([{ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10 }]);
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1']);
    expect(await store.listCardReviews('p1')).toEqual([]);
    expect(await store.listSessionResults('p1')).toEqual([]);
    await store.appendCardReview(cardReview('c1', 'p1', 1));
    await store.appendSessionResult(sessionResult('s1', 'p1', 1));
    expect(await store.listCardReviews('p1')).toHaveLength(1);
    expect(await store.listSessionResults('p1')).toHaveLength(1);
  });
});

describe('MemoryStore isolation', () => {
  it('does not share references with callers', async () => {
    const store = new MemoryStore();
    const p = await store.createProfile('Varun', 'cbse-11-accountancy');
    p.name = 'mutated';
    expect((await store.listProfiles())[0].name).toBe('Varun');
    (await store.listProfiles())[0].name = 'mutated2';
    expect((await store.listProfiles())[0].name).toBe('Varun');

    const a = attempt('a1', p.id, 100);
    await store.appendAttempt(a);
    a.correct = false;
    expect((await store.listAttempts(p.id))[0].correct).toBe(true);
    (await store.listAttempts(p.id))[0].correct = false;
    expect((await store.listAttempts(p.id))[0].correct).toBe(true);

    const r = result('r1', p.id, 100);
    await store.appendLevelResult(r);
    r.score = 0;
    expect((await store.listLevelResults(p.id))[0].score).toBe(0.9);

    const backup = await store.exportProfile(p.id);
    backup.attempts[0].correct = false;
    backup.profile.name = 'x';
    expect((await store.listAttempts(p.id))[0].correct).toBe(true);
    expect((await store.listProfiles())[0].name).toBe('Varun');
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const validBackup = (): Loose => ({
  format: 'accountancy-master-backup', version: 1,
  profile: { id: 'p1', name: 'X', courseId: 'cbse-11-accountancy', createdAt: 1 },
  attempts: [attempt('a1', 'p1', 1)],
  levelResults: [result('r1', 'p1', 1)],
  cardReviews: [],
  sessionResults: [],
  mockPapers: [],
  writtenResults: [],
});

describe.each(stores)('%s mock papers', (_name, make) => {
  it('keeps a paper per learner, oldest first, and replaces it when it is stored again', async () => {
    const store = make();
    const a = await store.createProfile('A', 'cbse-11-accountancy');
    const b = await store.createProfile('B', 'cbse-11-accountancy');
    await store.putMockPaper(mockPaper('m2', a.id, 200));
    await store.putMockPaper(mockPaper('m1', a.id, 100));
    await store.putMockPaper(mockPaper('m3', b.id, 50));
    expect((await store.listMockPapers(a.id)).map((p) => p.id)).toEqual(['m1', 'm2']);
    expect((await store.listMockPapers(b.id)).map((p) => p.id)).toEqual(['m3']);
    expect(await store.listMockPapers('nobody')).toEqual([]);

    // The one record that changes: answers as the learner goes, then the marks when it is handed in.
    const later = mockPaper('m1', a.id, 100, { answers: { 'q-9': { type: 'numeric', text: '12,500' } }, flagged: [], current: 7 });
    await store.putMockPaper(later);
    expect((await store.listMockPapers(a.id))[0]).toEqual(later);
    const done = { ...later, submittedAt: 900, marks: 14.5, maxMarks: 20, recorded: true };
    await store.putMockPaper(done);
    expect(await store.listMockPapers(a.id)).toEqual([done, mockPaper('m2', a.id, 200)]);
  });

  it('removes the papers of a deleted learner and no others', async () => {
    const store = make();
    const a = await store.createProfile('A', 'cbse-11-accountancy');
    const b = await store.createProfile('B', 'cbse-11-accountancy');
    await store.putMockPaper(mockPaper('m1', a.id, 100));
    await store.putMockPaper(mockPaper('m2', b.id, 100));
    await store.deleteProfile(a.id);
    expect(await store.listMockPapers(a.id)).toEqual([]);
    expect((await store.listMockPapers(b.id)).map((p) => p.id)).toEqual(['m2']);
  });

  it('exports the papers with the learner and imports them into a fresh store', async () => {
    const source = make();
    const p = await source.createProfile('Varun', 'cbse-11-accountancy');
    await source.putMockPaper(mockPaper('m1', p.id, 100, { submittedAt: 900, marks: 14.5, maxMarks: 20, recorded: true }));
    await source.putMockPaper(mockPaper('m2', p.id, 2000));
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.mockPapers).toHaveLength(2);

    const target = make();
    await target.importProfile(backup);
    expect(await target.listMockPapers(p.id)).toEqual(await source.listMockPapers(p.id));
    // A paper already on the device is kept as it is there: it may have gone further than the backup.
    const further = mockPaper('m2', p.id, 2000, { current: 9 });
    await target.putMockPaper(further);
    await target.importProfile(backup);
    expect((await target.listMockPapers(p.id))[1]).toEqual(further);
  });

  it('imports a backup made before mock papers as a learner with none', async () => {
    const store = make();
    const old = backupFor(prof, [attempt('a1', 'p1', 1)]);
    expect(old).not.toHaveProperty('mockPapers');
    await store.importProfile(old);
    expect(await store.listMockPapers('p1')).toEqual([]);
    expect((await store.exportProfile('p1')).mockPapers).toEqual([]);
  });
});

describe('DexieStore upgrade to mock papers', () => {
  it('opens a version 2 database under version 3 with its data intact', async () => {
    const name = `upgrade-db-${n++}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ profiles: 'id', attempts: 'id, profileId', levelResults: 'id, profileId' });
    v2.version(2).stores({ cardReviews: 'id, profileId', sessionResults: 'id, profileId' });
    await v2.table('profiles').put({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10 });
    await v2.table('sessionResults').put(sessionResult('s1', 'p1', 100));
    v2.close();

    const store = new DexieStore(name);
    expect((await store.listSessionResults('p1')).map((x) => x.id)).toEqual(['s1']);
    expect(await store.listMockPapers('p1')).toEqual([]);
    await store.putMockPaper(mockPaper('m1', 'p1', 5));
    expect(await store.listMockPapers('p1')).toHaveLength(1);
  });
});

describe('parseBackup and mock papers', () => {
  it('keeps a paper with its answers as they are, and drops unknown keys', () => {
    const raw = validBackup();
    raw.mockPapers = [{ ...mockPaper('m1', 'p1', 100, { submittedAt: 900, marks: 14.5, maxMarks: 20, recorded: true }), extra: 1 }];
    const out = parseBackup(JSON.parse(JSON.stringify(raw)));
    expect(out.mockPapers).toEqual([mockPaper('m1', 'p1', 100, { submittedAt: 900, marks: 14.5, maxMarks: 20, recorded: true })]);
    expect(parseBackup({ ...validBackup(), mockPapers: [mockPaper('m2', 'p1', 5)] }).mockPapers).toEqual([mockPaper('m2', 'p1', 5)]);
  });

  it('rejects a paper that is not one', () => {
    const bad: [string, Partial<Record<keyof MockPaperRecord, unknown>>][] = [
      ['another learner', { profileId: 'someone-else' }],
      ['another course', { courseId: 'other' }],
      ['no paper', { paper: '' }],
      ['no start', { startedAt: 'now' }],
      ['no time allowed', { allowedMs: 0 }],
      ['answers not a record', { answers: [] }],
      ['flags not ids', { flagged: [3] }],
      ['time not numbers', { timeMs: { q: 'long' } }],
      ['a place that is not a count', { current: -1 }],
      ['marks below zero', { marks: -1 }],
      ['recorded not a flag', { recorded: 'yes' }],
    ];
    for (const [why, patch] of bad) {
      expect(() => parseBackup({ ...validBackup(), mockPapers: [{ ...mockPaper('m1', 'p1', 100), ...patch }] }), why).toThrow('Invalid backup file');
    }
    expect(() => parseBackup({ ...validBackup(), mockPapers: 'none' })).toThrow('Invalid backup file');
  });
});

describe('parseBackup', () => {
  it('accepts a backup without the new lists as empty, and keeps the new fields when present', () => {
    const old = validBackup();
    delete old.cardReviews;
    delete old.sessionResults;
    const parsed = parseBackup(old);
    expect(parsed.cardReviews).toEqual([]);
    expect(parsed.sessionResults).toEqual([]);

    const full = validBackup();
    full.profile.dailyGoalXp = 50;
    full.attempts[0].sessionKind = 'daily_mission';
    full.cardReviews = [{ ...cardReview('c1', 'p1', 1), extra: 1 }];
    full.sessionResults = [{ ...sessionResult('s1', 'p1', 1), extra: 2 }];
    const out = parseBackup(full);
    expect(out.profile.dailyGoalXp).toBe(50);
    expect(out.attempts[0].sessionKind).toBe('daily_mission');
    expect(out.cardReviews).toEqual([cardReview('c1', 'p1', 1)]);
    expect(out.sessionResults).toEqual([sessionResult('s1', 'p1', 1)]);
  });

  it('rejects attempts that belong to another profile', () => {
    const bad = {
      format: 'accountancy-master-backup', version: 1,
      profile: { id: 'p1', name: 'X', courseId: 'c', createdAt: 1 },
      attempts: [attempt('1', 'someone-else', 1)], levelResults: [],
    };
    expect(() => parseBackup(bad)).toThrow('Invalid backup file');
  });

  it('round-trips a valid backup and drops unknown keys', () => {
    const raw = validBackup();
    expect(parseBackup(JSON.parse(JSON.stringify(raw)))).toEqual(raw);
    const noisy = {
      ...validBackup(), extra: 1,
      profile: { ...raw.profile, extra: 2 },
      attempts: [{ ...raw.attempts[0], mistakeCode: 'm1', levelId: 'l1', extra: 3 }],
      levelResults: [{ ...raw.levelResults[0], extra: 4 }],
    };
    const out: Loose = parseBackup(noisy);
    expect(out).not.toBe(noisy);
    expect(out.profile).not.toBe(noisy.profile);
    expect(out.attempts[0]).not.toBe(noisy.attempts[0]);
    expect(out).not.toHaveProperty('extra');
    expect(out.profile).not.toHaveProperty('extra');
    expect(out.attempts[0]).not.toHaveProperty('extra');
    expect(out.levelResults[0]).not.toHaveProperty('extra');
    expect(out.attempts[0]).toMatchObject({ mistakeCode: 'm1', levelId: 'l1' });
  });

  it('keeps the answer of an attempt, built again from its known fields, and takes an attempt without one as it is', () => {
    const raw = validBackup();
    raw.attempts = [attempt('a0', 'p1', 1), missed('a1', 'p1', 2, KEPT_SET), missed('a2', 'p1', 3, KEPT_ACCOUNT), missed('a3', 'p1', 4, KEPT_STATEMENT)];
    const out = parseBackup(JSON.parse(JSON.stringify(raw)));
    expect(out).toEqual(raw);
    expect(out.attempts[0]).not.toHaveProperty('answer');
    // Nothing of the file is handed on as it came, and what the app does not know is dropped at every depth.
    const noisy: Loose = structuredClone(raw);
    noisy.attempts[1].answer.extra = 1;
    noisy.attempts[1].answer.entries[0][0].extra = 2;
    noisy.attempts[2].answer.sides[0][0].extra = 3;
    noisy.attempts[2].answer.extra = 4;
    noisy.attempts[3].answer.rows[0].date = '1 April';
    const cleaned = parseBackup(noisy);
    expect(cleaned).toEqual(raw);
    expect(cleaned.attempts[1].answer).not.toBe(noisy.attempts[1].answer);
    expect((cleaned.attempts[2].answer as Loose).sides[0][0].amounts).not.toBe(noisy.attempts[2].answer.sides[0][0].amounts);
    // An account of one period has no later ones, and a statement may end on no figure or on one.
    const onePeriod: Loose = { ...KEPT_ACCOUNT };
    delete onePeriod.later;
    raw.attempts = [missed('a1', 'p1', 2, onePeriod), missed('a2', 'p1', 3, { type: 'statement', rows: [], final: 2200000 })];
    const plain = parseBackup(JSON.parse(JSON.stringify(raw)));
    expect(plain.attempts[0].answer).toEqual(onePeriod);
    expect(plain.attempts[0].answer).not.toHaveProperty('later');
    expect(plain.attempts[1].answer).toEqual({ type: 'statement', rows: [], final: 2200000 });
    expect(plain.attempts[1].answer).not.toHaveProperty('finalLabel');
  });

  const mutate = (fn: (b: Loose) => void) => () => {
    const b = validBackup();
    fn(b);
    return b;
  };
  const cases: [string, () => unknown][] = [
    ['null', () => null],
    ['a string', () => 'backup'],
    ['wrong format', mutate((b) => { b.format = 'other'; })],
    ['wrong version', mutate((b) => { b.version = 2; })],
    ['attempts not an array', mutate((b) => { b.attempts = {}; })],
    ['levelResults not an array', mutate((b) => { b.levelResults = 'x'; })],
    ['profile missing id', mutate((b) => { delete b.profile.id; })],
    ['empty profile name', mutate((b) => { b.profile.name = ''; })],
    ['profile createdAt NaN', mutate((b) => { b.profile.createdAt = NaN; })],
    ['attempt foreign profileId', mutate((b) => { b.attempts[0].profileId = 'other'; })],
    ['level result foreign profileId', mutate((b) => { b.levelResults[0].profileId = 'other'; })],
    ['attempt courseId differs from profile', mutate((b) => { b.attempts[0].courseId = 'other-course'; })],
    ['bad difficulty', mutate((b) => { b.attempts[0].difficulty = 'hard'; })],
    ['correct: "yes"', mutate((b) => { b.attempts[0].correct = 'yes'; })],
    ['hintsUsed: -1', mutate((b) => { b.attempts[0].hintsUsed = -1; })],
    ['hintsUsed: 1.5', mutate((b) => { b.attempts[0].hintsUsed = 1.5; })],
    ['timeMs: null', mutate((b) => { b.attempts[0].timeMs = null; })],
    ['timeMs negative', mutate((b) => { b.attempts[0].timeMs = -5; })],
    ['attempt at: "1"', mutate((b) => { b.attempts[0].at = '1'; })],
    ['mistakeCode not a string', mutate((b) => { b.attempts[0].mistakeCode = 5; })],
    ['levelId not a string', mutate((b) => { b.attempts[0].levelId = 5; })],
    ['attempt missing id', mutate((b) => { delete b.attempts[0].id; })],
    ['level result missing id', mutate((b) => { delete b.levelResults[0].id; })],
    ['score: 1.5', mutate((b) => { b.levelResults[0].score = 1.5; })],
    ['score: "0.9"', mutate((b) => { b.levelResults[0].score = '0.9'; })],
    ['passed: 1', mutate((b) => { b.levelResults[0].passed = 1; })],
    ['level result at: Infinity', mutate((b) => { b.levelResults[0].at = Infinity; })],
    ['attempt sessionKind not allowed', mutate((b) => { b.attempts[0].sessionKind = 'bogus'; })],
    ['attempt sessionKind not a string', mutate((b) => { b.attempts[0].sessionKind = 5; })],
    ['cardReviews not an array', mutate((b) => { b.cardReviews = {}; })],
    ['sessionResults not an array', mutate((b) => { b.sessionResults = 'x'; })],
    ['card review foreign profileId', mutate((b) => { b.cardReviews = [cardReview('c1', 'other', 1)]; })],
    ['session result foreign profileId', mutate((b) => { b.sessionResults = [sessionResult('s1', 'other', 1)]; })],
    ['card review courseId differs from profile', mutate((b) => { b.cardReviews = [{ ...cardReview('c1', 'p1', 1), courseId: 'other-course' }]; })],
    ['session result courseId differs from profile', mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), courseId: 'other-course' }]; })],
    ['card review known: "yes"', mutate((b) => { b.cardReviews = [{ ...cardReview('c1', 'p1', 1), known: 'yes' }]; })],
    ['card review empty cardId', mutate((b) => { b.cardReviews = [{ ...cardReview('c1', 'p1', 1), cardId: '' }]; })],
    ['card review at: "1"', mutate((b) => { b.cardReviews = [{ ...cardReview('c1', 'p1', 1), at: '1' }]; })],
    ['session result bad kind', mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), kind: 'bogus' }]; })],
    ['session result kind "level"', mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), kind: 'level' }]; })],
    ["session result day '2026-1-5'", mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), day: '2026-1-5' }]; })],
    ['session result correct > total', mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), correct: 11, total: 10 }]; })],
    ['session result correct negative', mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), correct: -1 }]; })],
    ['session result total 1.5', mutate((b) => { b.sessionResults = [{ ...sessionResult('s1', 'p1', 1), correct: 1, total: 1.5 }]; })],
    ['dailyGoalXp: 0', mutate((b) => { b.profile.dailyGoalXp = 0; })],
    ['dailyGoalXp: 2.5', mutate((b) => { b.profile.dailyGoalXp = 2.5; })],
    ['dailyGoalXp: "50"', mutate((b) => { b.profile.dailyGoalXp = '50'; })],
    ['challengeTimer: "off"', mutate((b) => { b.profile.challengeTimer = 'off'; })],
    ['challengeTimer: 0', mutate((b) => { b.profile.challengeTimer = 0; })],
  ];
  it.each(cases)('rejects %s', (_label, make) => {
    expect(() => parseBackup(make())).toThrow('Invalid backup file');
  });

  const answered = (answer: unknown) => mutate((b) => { b.attempts[0].answer = answer; });
  const badAnswers: [string, () => unknown][] = [
    ['an answer that is a string', answered('cash')],
    ['an answer that is null', answered(null)],
    ['an answer that is a list', answered([KEPT_SET])],
    ['an answer of a short kind', answered({ type: 'mcq', optionId: 'b' })],
    ['an answer of no kind', answered({ entries: [] })],
    ['a set whose entries are not a list', answered({ type: 'journal_set', entries: {} })],
    ['a set with an entry that is not a list', answered({ type: 'journal_set', entries: [null] })],
    ['a set with a line that is not one', answered({ type: 'journal_set', entries: [['cash']] })],
    ['a set with a line without its account', answered({ type: 'journal_set', entries: [[{ side: 'Dr', amount: 100 }]] })],
    ['a set with a line on no side', answered({ type: 'journal_set', entries: [[{ accountId: 'cash', side: '', amount: 100 }]] })],
    ['a set with an amount as text', answered({ type: 'journal_set', entries: [[{ accountId: 'cash', side: 'Dr', amount: '100' }]] })],
    ['an account without its sides', answered({ type: 'account', below: [[], []] })],
    ['an account with three sides', answered({ type: 'account', sides: [[], [], []], below: [[], []] })],
    ['an account without its rows below the totals', answered({ type: 'account', sides: [[], []] })],
    ['an account with a row without particulars', answered({ type: 'account', sides: [[{ amounts: [100] }], []], below: [[], []] })],
    ['an account with a row without amounts', answered({ type: 'account', sides: [[{ label: 'Cash A/c' }], []], below: [[], []] })],
    ['an account with an amount as text', answered({ type: 'account', sides: [[{ label: 'Cash A/c', amounts: ['100'] }], []], below: [[], []] })],
    ['an account with an amount that is no number', answered({ type: 'account', sides: [[{ label: 'Cash A/c', amounts: [Infinity] }], []], below: [[], []] })],
    ['an account whose later periods are not a list', answered({ type: 'account', sides: [[], []], below: [[], []], later: {} })],
    ['an account with a later period of one side', answered({ type: 'account', sides: [[], []], below: [[], []], later: [[[]]] })],
    ['a statement without its rows', answered({ type: 'statement', final: null })],
    ['a statement without its final figure', answered({ type: 'statement', rows: [] })],
    ['a statement with a final figure as text', answered({ type: 'statement', rows: [], final: '500' })],
    ['a statement with a final name that is not text', answered({ type: 'statement', rows: [], final: null, finalLabel: 5 })],
  ];
  it.each(badAnswers)('rejects %s', (_label, make) => {
    expect(() => parseBackup(make())).toThrow('Invalid backup file');
  });
});

describe('DexieStore upgrade from mock papers', () => {
  it('opens a version 3 database with its data intact', async () => {
    const name = `upgrade-db-${n++}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ profiles: 'id', attempts: 'id, profileId', levelResults: 'id, profileId' });
    v3.version(2).stores({ cardReviews: 'id, profileId', sessionResults: 'id, profileId' });
    v3.version(3).stores({ mockPapers: 'id, profileId' });
    await v3.table('profiles').put({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10, dailyGoalXp: 20 });
    await v3.table('attempts').put(attempt('a1', 'p1', 100));
    await v3.table('sessionResults').put(sessionResult('s1', 'p1', 200));
    await v3.table('mockPapers').put(mockPaper('m1', 'p1', 300));
    v3.close();

    const store = new DexieStore(name);
    expect(await store.listProfiles()).toEqual([{ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10, dailyGoalXp: 20 }]);
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1']);
    expect(await store.listMockPapers('p1')).toEqual([mockPaper('m1', 'p1', 300)]);
    expect((await store.listSessionResults('p1')).map((x) => x.id)).toEqual(['s1']);
  });
});

describe('the challenge timer of a learner stored before it was a setting', () => {
  it('is on, and the learner is read as they were stored', async () => {
    const name = `old-learner-db-${n++}`;
    const made = new DexieStore(name);
    await made.listProfiles();
    // Written straight into the table, as an older version of the app wrote it.
    const raw = new Dexie(name);
    await raw.open();
    await raw.table('profiles').put({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10, dailyGoalXp: 20 });
    raw.close();

    const [old] = await new DexieStore(name).listProfiles();
    expect(old).toEqual({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10, dailyGoalXp: 20 });
    expect(challengeTimerOn(old)).toBe(true);
  });
});

describe.each(stores)('%s written answers', (_name, make) => {
  it('keeps the results per learner, oldest first, each once, and removes those of a deleted learner', async () => {
    const store = make();
    const a = await store.createProfile('A', 'cbse-11-accountancy');
    const b = await store.createProfile('B', 'cbse-11-accountancy');
    const blank = { onPaper: true, answer: undefined, ticked: [], marks: 0 };
    await store.appendWrittenResult(written('w2', a.id, 200));
    await store.appendWrittenResult(written('w1', a.id, 100, blank));
    await store.appendWrittenResult(written('w1', a.id, 999, { marks: 3 }));
    await store.appendWrittenResult(written('w3', b.id, 50));
    expect(await store.listWrittenResults(a.id)).toEqual([written('w1', a.id, 100, blank), written('w2', a.id, 200)]);
    await store.deleteProfile(a.id);
    expect(await store.listWrittenResults(a.id)).toEqual([]);
    expect((await store.listWrittenResults(b.id)).map((r) => r.id)).toEqual(['w3']);
  });

  it('are in a backup, come back from it, and a backup made before them has none', async () => {
    const source = make();
    const p = await source.createProfile('Varun', 'cbse-11-accountancy');
    await source.appendWrittenResult(written('w1', p.id, 100));
    const backup = JSON.parse(JSON.stringify(await source.exportProfile(p.id)));
    expect(backup.writtenResults).toHaveLength(1);
    const target = make();
    await target.importProfile(backup);
    await target.importProfile(backup);
    expect(await target.listWrittenResults(p.id)).toEqual(await source.listWrittenResults(p.id));

    const old = make();
    await old.importProfile(backupFor(prof, [attempt('a1', 'p1', 1)]));
    expect(await old.listWrittenResults('p1')).toEqual([]);
  });
});

describe('parseBackup and written answers', () => {
  it('keeps a result without unknown keys, and rejects one that is not a result', () => {
    const raw = { ...validBackup(), writtenResults: [{ ...written('w1', 'p1', 100), extra: 1 }] };
    expect(parseBackup(JSON.parse(JSON.stringify(raw))).writtenResults).toEqual([written('w1', 'p1', 100)]);
    const bad: [string, Partial<Record<keyof WrittenResult, unknown>>][] = [
      ['another learner', { profileId: 'someone-else' }],
      ['another course', { courseId: 'other' }],
      ['no question', { questionId: '' }],
      ['marks above the most', { marks: 4 }],
      ['marks finer than a half', { marks: 1.25 }],
      ['no most marks', { maxMarks: 0 }],
      ['ticks not places', { ticked: [-1] }],
      ['paper not a flag', { onPaper: 'no' }],
      ['an answer too long', { answer: 'x'.repeat(4001) }],
    ];
    for (const [why, patch] of bad) {
      expect(() => parseBackup({ ...validBackup(), writtenResults: [{ ...written('w1', 'p1', 100), ...patch }] }), why).toThrow('Invalid backup file');
    }
    expect(() => parseBackup({ ...validBackup(), writtenResults: 'none' })).toThrow('Invalid backup file');
  });
});

describe('DexieStore upgrade to written answers', () => {
  it('opens a version 4 database under version 5 with its data intact', async () => {
    const name = `upgrade-db-${n++}`;
    const v4 = new Dexie(name);
    v4.version(1).stores({ profiles: 'id', attempts: 'id, profileId', levelResults: 'id, profileId' });
    v4.version(2).stores({ cardReviews: 'id, profileId', sessionResults: 'id, profileId' });
    v4.version(3).stores({ mockPapers: 'id, profileId' });
    v4.version(4).stores({ syncLinks: 'profileId', syncMarks: '[kind+id], profileId', changeTimes: '[kind+id], profileId' });
    await v4.table('profiles').put({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10 });
    await v4.table('attempts').put(attempt('a1', 'p1', 100));
    v4.close();

    const store = new DexieStore(name);
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1']);
    expect(await store.listWrittenResults('p1')).toEqual([]);
    await store.appendWrittenResult(written('w1', 'p1', 5));
    expect(await store.listWrittenResults('p1')).toHaveLength(1);
  });
});

describe('DexieStore upgrade that drops the tables of version 4', () => {
  it('opens a version 5 database under version 6 with its data intact, and without those tables', async () => {
    const name = `upgrade-db-${n++}`;
    const v5 = new Dexie(name);
    v5.version(1).stores({ profiles: 'id', attempts: 'id, profileId', levelResults: 'id, profileId' });
    v5.version(2).stores({ cardReviews: 'id, profileId', sessionResults: 'id, profileId' });
    v5.version(3).stores({ mockPapers: 'id, profileId' });
    v5.version(4).stores({ syncLinks: 'profileId', syncMarks: '[kind+id], profileId', changeTimes: '[kind+id], profileId' });
    v5.version(5).stores({ writtenResults: 'id, profileId' });
    await v5.table('profiles').put({ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10, dailyGoalXp: 20 });
    await v5.table('attempts').put(attempt('a1', 'p1', 100));
    await v5.table('levelResults').put(result('r1', 'p1', 150));
    await v5.table('cardReviews').put(cardReview('c1', 'p1', 160));
    await v5.table('sessionResults').put(sessionResult('s1', 'p1', 200));
    await v5.table('mockPapers').put(mockPaper('m1', 'p1', 300));
    await v5.table('writtenResults').put(written('w1', 'p1', 400));
    await v5.table('syncLinks').put({ profileId: 'p1', userId: 'old', displayName: 'Old', token: 't', cursor: 7, stamps: {} });
    await v5.table('syncMarks').put({ kind: 'attempt', id: 'a1', profileId: 'p1' });
    await v5.table('changeTimes').put({ kind: 'mock', id: 'm1', profileId: 'p1', at: 300 });
    v5.close();

    const store = new DexieStore(name);
    expect(await store.listProfiles()).toEqual([{ id: 'p1', name: 'Old', courseId: 'cbse-11-accountancy', createdAt: 10, dailyGoalXp: 20 }]);
    expect((await store.listAttempts('p1')).map((x) => x.id)).toEqual(['a1']);
    expect((await store.listLevelResults('p1')).map((x) => x.id)).toEqual(['r1']);
    expect((await store.listCardReviews('p1')).map((x) => x.id)).toEqual(['c1']);
    expect((await store.listSessionResults('p1')).map((x) => x.id)).toEqual(['s1']);
    expect(await store.listMockPapers('p1')).toEqual([mockPaper('m1', 'p1', 300)]);
    expect(await store.listWrittenResults('p1')).toEqual([written('w1', 'p1', 400)]);
    // A backup holds the learner's progress and nothing of the dropped tables.
    const backup = await store.exportProfile('p1');
    expect(Object.keys(backup).sort()).toEqual(['attempts', 'cardReviews', 'format', 'levelResults', 'mockPapers', 'profile', 'sessionResults', 'version', 'writtenResults']);

    const opened = new Dexie(name);
    await opened.open();
    expect(opened.verno).toBe(6);
    expect(opened.tables.map((t) => t.name).sort()).toEqual(['attempts', 'cardReviews', 'levelResults', 'mockPapers', 'profiles', 'sessionResults', 'writtenResults']);
    opened.close();
  });
});

describe('parseBackup and a backup with fields it does not know', () => {
  it('ignores lists and profile fields that are not part of a backup, at the top and in the profile', async () => {
    const raw = {
      ...validBackup(),
      syncLinks: [{ profileId: 'p1', userId: 'old', token: 't' }],
      syncMarks: [{ kind: 'attempt', id: 'a1' }],
      changeTimes: [{ kind: 'mock', id: 'm1', at: 300 }],
    };
    raw.profile = { ...raw.profile, userId: 'old', lastSyncedAt: 5 };
    const parsed = parseBackup(JSON.parse(JSON.stringify(raw)));
    expect(parsed).toEqual(parseBackup(JSON.parse(JSON.stringify(validBackup()))));
    const store = new MemoryStore();
    const restored = await store.importProfile(JSON.parse(JSON.stringify(raw)));
    expect(restored).not.toHaveProperty('userId');
  });
});
