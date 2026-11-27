import { describe, expect, it } from 'vitest';
// The whole question bank is registered first: nothing here loads a topic, as the app does before it plays one.
import '@/content/registry';
import { rightFormatDraft, wrongFormatDraft } from '@/testing/sampleFormats';
import type { Question } from '@/content/types';
import { typedNumeric } from '@/exercises/numeric';
import { CONFIG } from '@/learning/config';
import { xpForAttempt } from '@/learning/gamification';
import { buildPaper, paperSteps } from '@/learning/mockPaper';
import { openMistakes } from '@/learning/practice';
import { deriveProgress, mockPaperBonus } from '@/learning/progress';
import type { Draft } from '@/play/drafts';
import { startSitting, withAnswer } from '@/play/mockSitting';
import { MemoryStore } from '@/storage/memoryStore';
import type { MockPaperRecord, ProgressStore } from '@/storage/types';
import { paperOf, recordSitting, settleMockPapers } from './mockPapers';

const PAPER = buildPaper({ kind: 'topic', topicId: 'ledger', number: 1 });
const STEPS = paperSteps(PAPER);
const T0 = new Date(2026, 9, 5, 10, 0, 0).getTime();
const MIN = 60_000;

function right(q: Question): Draft {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', optionId: q.correct };
    case 'true_false':
      return { type: 'true_false', value: q.correct };
    case 'numeric':
      return { type: 'numeric', text: typedNumeric(q.answer, q.unit) };
    case 'journal_entry':
      return { type: 'journal_entry', rows: q.expected.map((l) => ({ accountId: l.accountId, side: l.side, amount: String(l.amount / 100) })) };
    case 'journal_set':
      return { type: 'journal_set', entries: q.entries.map((e) => e.expected.map((l) => ({ accountId: l.accountId, side: l.side, amount: String(l.amount / 100) }))) };
    case 'account':
    case 'statement':
      return rightFormatDraft(q);
  }
}
function wrong(q: Question): Draft {
  switch (q.type) {
    case 'mcq':
      return { type: 'mcq', optionId: q.options.find((o) => o.id !== q.correct)!.id };
    case 'true_false':
      return { type: 'true_false', value: !q.correct };
    case 'numeric':
      // A figure that is off by a hundred; a ratio with its first number one too large.
      return { type: 'numeric', text: q.unit === 'ratio' ? typedNumeric([q.answer[0] + 1, ...q.answer.slice(1)], q.unit) : typedNumeric(q.answer + 100, q.unit) };
    case 'journal_entry':
      return { type: 'journal_entry', rows: q.expected.map((l) => ({ accountId: l.accountId, side: l.side === 'Dr' ? 'Cr' : 'Dr', amount: String(l.amount / 100) })) };
    case 'journal_set':
      return {
        type: 'journal_set',
        entries: q.entries.map((e) => e.expected.map((l) => ({ accountId: l.accountId, side: l.side === 'Dr' ? 'Cr' : 'Dr', amount: String(l.amount / 100) }))),
      };
    case 'account':
    case 'statement':
      return wrongFormatDraft(q);
  }
}

/** A learner, and their paper with the first `rightCount` questions right, the next `wrongCount` wrong, the rest left out. */
async function sat(rightCount: number, wrongCount: number): Promise<{ store: ProgressStore; profileId: string; record: MockPaperRecord }> {
  const store = new MemoryStore();
  const profile = await store.createProfile('Varun', 'cbse-11-accountancy');
  let record = startSitting({ id: 'm1', sessionId: 's-mock', profile, paper: PAPER, now: T0 });
  STEPS.forEach((s, i) => {
    if (i < rightCount) record = withAnswer(record, s.question.id, right(s.question));
    else if (i < rightCount + wrongCount) record = withAnswer(record, s.question.id, wrong(s.question));
  });
  await store.putMockPaper(record);
  return { store, profileId: profile.id, record };
}

const progressOf = async (store: ProgressStore, profileId: string, now: number) =>
  deriveProgress(await store.listAttempts(profileId), await store.listLevelResults(profileId), now, await store.listSessionResults(profileId));

describe('handing a paper in', () => {
  it('stores the paper as submitted and recorded, with its marks', async () => {
    const { store, profileId, record } = await sat(6, 2);
    const done = await recordSitting(store, record, T0 + 25 * MIN);
    expect(done).toEqual({ ...record, submittedAt: T0 + 25 * MIN, marks: 6, maxMarks: 20, recorded: true });
    expect(await store.listMockPapers(profileId)).toEqual([done]);
  });

  it('puts every answered question in the event log once, and the unanswered ones nowhere', async () => {
    const { store, profileId, record } = await sat(6, 2);
    await recordSitting(store, record, T0 + 25 * MIN);
    const attempts = await store.listAttempts(profileId);
    expect(attempts.map((a) => a.questionId)).toEqual(STEPS.slice(0, 8).map((s) => s.question.id));
    expect(attempts.map((a) => a.correct)).toEqual([true, true, true, true, true, true, false, false]);
    expect(attempts.every((a) => a.sessionKind === 'mock' && a.sessionId === 's-mock' && a.hintsUsed === 0 && a.topicId === 'ledger')).toBe(true);
    expect((await store.listSessionResults(profileId)).map((r) => [r.kind, r.correct, r.total, r.day])).toEqual([['mock', 6, 20, '2026-10-05']]);

    // The wrong answers are open mistakes; a question left out is neither a mistake nor an attempt.
    const progress = await progressOf(store, profileId, T0 + 26 * MIN);
    expect(openMistakes(progress).map((m) => m.questionId).sort()).toEqual(STEPS.slice(6, 8).map((s) => s.question.id).sort());
    expect(progress.answered).toBe(8);
    expect(progress.correct).toBe(6);
    for (const s of STEPS.slice(8)) expect(progress.questions[s.question.id]).toBeUndefined();
    // Mastery moved for the concepts that were answered.
    expect(progress.concepts[STEPS[0].question.conceptId].mastery).toBeGreaterThan(0);
  });

  it('adds nothing a second time, also when it was cut short before it was marked as recorded', async () => {
    const { store, profileId, record } = await sat(6, 2);
    const done = await recordSitting(store, record, T0 + 25 * MIN);
    expect(await recordSitting(store, done, T0 + 30 * MIN)).toBe(done);
    // Cut short: the paper is stored as submitted, the events are in, but it was never marked as recorded.
    const cut: MockPaperRecord = { ...done };
    delete cut.recorded;
    await store.putMockPaper(cut);
    const settled = await settleMockPapers(store, await store.listMockPapers(profileId), T0 + 90 * MIN);
    expect(settled.changed).toBe(true);
    expect(settled.records).toEqual([done]);
    expect(await store.listAttempts(profileId)).toHaveLength(8);
    expect(await store.listSessionResults(profileId)).toHaveLength(1);
    // The moment it was handed in is kept.
    expect((await store.listMockPapers(profileId))[0].submittedAt).toBe(T0 + 25 * MIN);
  });

  it('earns the XP of its right answers by the usual rule, and the paper bonus only with half the marks', async () => {
    // Six 1-mark questions right: 6 of 20 marks, no bonus.
    const low = await sat(6, 0);
    await recordSitting(low.store, low.record, T0 + 25 * MIN);
    const questionXp = STEPS.slice(0, 6).reduce((sum, s) => sum + xpForAttempt({ correct: true, difficulty: s.question.difficulty, hintsUsed: 0 }), 0);
    expect((await progressOf(low.store, low.profileId, T0 + 26 * MIN)).xp).toBe(questionXp);

    // Everything right: 20 of 20, and the bonus of a 20-mark paper on top of the questions.
    const top = await sat(STEPS.length, 0);
    await recordSitting(top.store, top.record, T0 + 25 * MIN);
    const allXp = STEPS.reduce((sum, s) => sum + xpForAttempt({ correct: true, difficulty: s.question.difficulty, hintsUsed: 0 }), 0);
    const progress = await progressOf(top.store, top.profileId, T0 + 26 * MIN);
    expect(progress.xp).toBe(allXp + 20 * CONFIG.xp.mockBonusPerMark);
    expect(progress.xpByDay['2026-10-05']).toBe(progress.xp);
  });

  it('pays the bonus from half the marks up, by the marks the paper carries', () => {
    expect(mockPaperBonus({ correct: 9, total: 20 })).toBe(0);
    expect(mockPaperBonus({ correct: 10, total: 20 })).toBe(20 * CONFIG.xp.mockBonusPerMark);
    expect(mockPaperBonus({ correct: 39, total: 80 })).toBe(0);
    expect(mockPaperBonus({ correct: 40, total: 80 })).toBe(80 * CONFIG.xp.mockBonusPerMark);
    expect(CONFIG.xp.bonusMinScore).toBe(0.5);
  });

  it('gives the reduced XP for a question answered right before, as everywhere else', async () => {
    const { store, profileId, record } = await sat(1, 0);
    const q = STEPS[0].question;
    await store.appendAttempt({
      id: 'earlier',
      profileId,
      courseId: 'cbse-11-accountancy',
      topicId: q.topicId,
      conceptId: q.conceptId,
      questionId: q.id,
      difficulty: q.difficulty,
      correct: true,
      hintsUsed: 0,
      timeMs: 1000,
      at: T0 - MIN,
      sessionId: 's-before',
      sessionKind: 'smart',
    });
    await recordSitting(store, record, T0 + 5 * MIN);
    const full = xpForAttempt({ correct: true, difficulty: q.difficulty, hintsUsed: 0 });
    expect((await progressOf(store, profileId, T0 + 6 * MIN)).xp).toBe(full + xpForAttempt({ correct: true, difficulty: q.difficulty, hintsUsed: 0 }, true));
  });
});

describe('what happened while the app was closed', () => {
  it('is nothing for a paper that still has time', async () => {
    const { store, profileId, record } = await sat(3, 0);
    const settled = await settleMockPapers(store, [record], T0 + 39 * MIN);
    expect(settled).toEqual({ records: [record], changed: false });
    expect(await store.listAttempts(profileId)).toEqual([]);
  });

  it('is a paper submitted as it stood when its time ran out', async () => {
    const { store, profileId, record } = await sat(3, 1);
    const now = T0 + 26 * 60 * MIN;
    const settled = await settleMockPapers(store, await store.listMockPapers(profileId), now);
    expect(settled.changed).toBe(true);
    expect(settled.records).toEqual([{ ...record, submittedAt: T0 + 40 * MIN, marks: 3, maxMarks: 20, recorded: true }]);
    const attempts = await store.listAttempts(profileId);
    expect(attempts).toHaveLength(4);
    // The events are recorded when the app finds the paper, the paper itself as handed in at the end of its time.
    expect(attempts.every((a) => a.at >= now)).toBe(true);
    expect(await settleMockPapers(store, await store.listMockPapers(profileId), now + MIN)).toMatchObject({ changed: false });
  });

  it('closes a paper this version cannot build any more, with no marks and nothing in the log', async () => {
    const { store, profileId, record } = await sat(3, 0);
    const lost: MockPaperRecord = { ...record, paper: 'topic.no-such-topic.1' };
    expect(paperOf(lost)).toBeNull();
    expect(paperOf({ ...record, paper: 'gibberish' })).toBeNull();
    // A paper of a course this version does not have cannot be built either.
    expect(paperOf({ ...record, courseId: 'cbse-99-unknown' })).toBeNull();
    expect(paperOf(record)).toEqual(PAPER);
    const done = await recordSitting(store, lost, T0 + 5 * MIN);
    expect(done).toEqual({ ...lost, submittedAt: T0 + 5 * MIN, recorded: true });
    expect(await store.listAttempts(profileId)).toEqual([]);
    expect(await store.listSessionResults(profileId)).toEqual([]);
  });
});
