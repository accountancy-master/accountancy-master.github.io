import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { SAMPLE_ACCOUNT, SAMPLE_STATEMENT, rightFormat } from '@/testing/sampleFormats';
import { SAMPLE_SET, reversed } from '@/testing/sampleSet';
import { JOURNAL_ENTRIES } from '@/content/cbse11/journalEntries';
import type { Question } from '@/content/types';
import type { Response } from '@/exercises/checkers';
import { generateQuestion } from '@/generators';
import { deriveProgress } from '@/learning/progress';
import { buildLevelSession, countScored, type SessionItem } from '@/learning/sessionBuilder';
import {
  attemptXp,
  canHint,
  canInsertSimilar,
  canRetryCheck,
  currentItem,
  scoredAttempts,
  sessionReducer,
  startSession,
  summarize,
  type SessionState,
} from './session';

const pack = JOURNAL_ENTRIES;
const T0 = 1_000_000;

const right = (q: Question): Response =>
  q.type === 'mcq'
    ? { type: 'mcq', optionId: q.correct }
    : q.type === 'true_false'
      ? { type: 'true_false', value: q.correct }
      : q.type === 'journal_entry'
        ? { type: 'journal_entry', lines: q.expected }
        : q.type === 'journal_set'
          ? { type: 'journal_set', entries: q.entries.map((e) => e.expected) }
          : q.type === 'account' || q.type === 'statement'
            ? rightFormat(q)
            : { type: 'numeric', value: q.answer };

const wrongMcq = (q: Question): Response => {
  if (q.type !== 'mcq') throw new Error('expected mcq');
  return { type: 'mcq', optionId: q.options.find((o) => o.id !== q.correct)!.id };
};

const question = (s: SessionState): Question => {
  const item = currentItem(s);
  if (item?.kind !== 'question') throw new Error('expected a question');
  return item.question;
};

describe('session reducer', () => {
  it('walks a concept level: lesson, then its check question, then done', () => {
    let s = startSession(buildLevelSession(pack.levels[0], pack, 0), T0);
    expect(currentItem(s)?.kind).toBe('lesson');
    s = sessionReducer(s, { type: 'next', now: T0 + 5000 });
    expect(currentItem(s)?.kind).toBe('question');
    s = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 + 9000 });
    expect(s.phase).toBe('feedback');
    expect(s.result?.correct).toBe(true);
    expect(s.attempts).toEqual([
      expect.objectContaining({ questionId: 'je-q-001', correct: true, hintsUsed: 0, timeMs: 4000 }),
    ]);
    s = sessionReducer(s, { type: 'next', now: T0 + 10000 });
    expect(s.phase).toBe('done');
    expect(currentItem(s)).toBeNull();
    expect(summarize(s, pack.levels[0])).toEqual({ correct: 1, total: 1, score: 1, passed: true, lesson: true });
  });

  it('passes a card-only level with nothing scored', () => {
    let s = startSession(buildLevelSession(pack.levels[1], pack, 0), T0);
    while (s.phase !== 'done') s = sessionReducer(s, { type: 'next', now: T0 });
    expect(s.attempts).toEqual([]);
    expect(summarize(s, pack.levels[1])).toEqual({ correct: 0, total: 0, score: 1, passed: true, lesson: false });
  });

  it('records a wrong answer and its mistake code, and does not allow answering twice', () => {
    let s = startSession(buildLevelSession(pack.levels[4], pack, 400), T0);
    const q = question(s);
    if (q.type !== 'journal_entry') throw new Error('expected a journal question');
    const reversed = q.expected.map((l) => ({ ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) }));
    s = sessionReducer(s, { type: 'answer', response: { type: 'journal_entry', lines: reversed }, now: T0 + 1 });
    expect(s.attempts[0]).toMatchObject({ correct: false, mistakeCode: 'sidesReversed' });
    const again = sessionReducer(s, { type: 'answer', response: right(q), now: T0 + 2 });
    expect(again).toBe(s);
  });

  it('keeps the answer with the attempt for a long question that was missed, and for no other', () => {
    const asked = (q: Question): SessionItem[] => [{ kind: 'question', question: q }];
    const answered = (q: Question, response: Response) => sessionReducer(startSession(asked(q), T0), { type: 'answer', response, now: T0 + 1 }).attempts[0];
    // A set with its second entry the wrong way round: the attempt holds the entries as they were checked.
    const entries = SAMPLE_SET.entries.map((e, i) => (i === 1 ? reversed(e.expected) : e.expected));
    const missed = answered(SAMPLE_SET, { type: 'journal_set', entries });
    expect(missed).toMatchObject({ correct: false, mistakeCode: 'set:ok,sidesReversed,ok,ok', answer: { type: 'journal_set', entries } });
    // An account with a row left out, and a statement with one.
    const account = rightFormat(SAMPLE_ACCOUNT);
    if (account.type !== 'account') throw new Error('not an account');
    const short: Response = { ...account, sides: [account.sides[0].slice(1), account.sides[1]] };
    expect(answered(SAMPLE_ACCOUNT, short).answer).toEqual(short);
    const statement = rightFormat(SAMPLE_STATEMENT);
    if (statement.type !== 'statement') throw new Error('not a statement');
    expect(answered(SAMPLE_STATEMENT, { ...statement, rows: statement.rows.slice(1) }).answer).toMatchObject({ type: 'statement', final: null });
    // Right answers keep nothing, and neither does a short question that was missed or an answer that was shown.
    expect(answered(SAMPLE_SET, right(SAMPLE_SET))).not.toHaveProperty('answer');
    expect(answered(SAMPLE_ACCOUNT, right(SAMPLE_ACCOUNT))).not.toHaveProperty('answer');
    const level = startSession(buildLevelSession(pack.levels[4], pack, 400), T0);
    const journal = question(level);
    if (journal.type !== 'journal_entry') throw new Error('expected a journal question');
    expect(sessionReducer(level, { type: 'answer', response: { type: 'journal_entry', lines: reversed(journal.expected) }, now: T0 + 1 }).attempts[0]).not.toHaveProperty('answer');
    expect(sessionReducer(startSession(asked(SAMPLE_SET), T0), { type: 'reveal', now: T0 + 1 }).attempts[0]).not.toHaveProperty('answer');
  });

  it('counts hints, caps them at the hints available, and carries them into the attempt', () => {
    let s = startSession(buildLevelSession(pack.levels[2], pack, 0), T0);
    expect(canHint(s)).toBe(true);
    s = sessionReducer(s, { type: 'hint' });
    s = sessionReducer(s, { type: 'hint' });
    expect(s.hintsUsed).toBe(2);
    expect(canHint(s)).toBe(false);
    expect(sessionReducer(s, { type: 'hint' })).toBe(s);
    s = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 + 1 });
    expect(s.attempts[0]).toMatchObject({ correct: true, hintsUsed: 2 });
  });

  it('records a revealed answer as incorrect with three hints', () => {
    let s = startSession(buildLevelSession(pack.levels[2], pack, 0), T0);
    s = sessionReducer(s, { type: 'reveal', now: T0 + 7000 });
    expect(s.phase).toBe('feedback');
    expect(s.revealed).toBe(true);
    expect(s.result).toBeNull();
    expect(s.attempts[0]).toMatchObject({ correct: false, hintsUsed: 3, timeMs: 7000 });
  });

  it('closes a question whose time ran out as a wrong answer, with nothing of what was typed', () => {
    const timed = pack.levels.find((l) => l.timerSecondsPerQuestion !== undefined)!;
    let s = startSession(buildLevelSession(timed, pack, 400), T0);
    const q = question(s);
    s = sessionReducer(s, { type: 'hint' });
    s = sessionReducer(s, { type: 'timeUp', now: T0 + 90_000 });
    expect(s).toMatchObject({ phase: 'feedback', timedOut: true, revealed: false, result: null });
    // The attempt is the one a wrong answer leaves: the same fields, the hints that were taken, and no answer kept.
    expect(s.attempts).toEqual([
      { conceptId: q.conceptId, questionId: q.id, difficulty: q.difficulty, correct: false, hintsUsed: 1, mistakeCode: undefined, timeMs: 90_000 },
    ]);
    expect(s.attemptIsExtra).toEqual([false]);
    expect(summarize(s, timed)).toMatchObject({ correct: 0, passed: false });
    // It is over: no answer after the bell, and no second bell.
    expect(sessionReducer(s, { type: 'answer', response: right(q), now: T0 + 90_001 })).toBe(s);
    expect(sessionReducer(s, { type: 'timeUp', now: T0 + 90_001 })).toBe(s);
    // A similar question is offered as after any miss, and the next question starts afresh.
    expect(canInsertSimilar(s)).toBe(q.id.startsWith('gen:'));
    s = sessionReducer(s, { type: 'next', now: T0 + 95_000 });
    expect(s).toMatchObject({ phase: 'playing', timedOut: false, hintsUsed: 0, startedAt: T0 + 95_000 });
  });

  it('lets an answer that was submitted in time stand when the clock is heard from afterwards', () => {
    let s = startSession(buildLevelSession(pack.levels[2], pack, 0), T0);
    s = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 + 1 });
    expect(sessionReducer(s, { type: 'timeUp', now: T0 + 2 })).toBe(s);
    expect(s.timedOut).toBe(false);
  });

  it('resets per-question state on the next question and scores the level', () => {
    let s = startSession(buildLevelSession(pack.levels[2], pack, 0), T0);
    s = sessionReducer(s, { type: 'hint' });
    s = sessionReducer(s, { type: 'answer', response: wrongMcq(question(s)), now: T0 + 1 });
    s = sessionReducer(s, { type: 'next', now: T0 + 2 });
    expect(s).toMatchObject({ phase: 'playing', hintsUsed: 0, revealed: false, timedOut: false, result: null, startedAt: T0 + 2 });
    while (s.phase !== 'done') {
      s = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 + 3 });
      s = sessionReducer(s, { type: 'next', now: T0 + 4 });
    }
    expect(summarize(s, pack.levels[2])).toEqual({ correct: 4, total: 5, score: 0.8, passed: true, lesson: false });
  });

  it('ignores actions that do not fit the phase', () => {
    const start = startSession(buildLevelSession(pack.levels[2], pack, 0), T0);
    const lesson = startSession(buildLevelSession(pack.levels[0], pack, 0), T0);
    expect(sessionReducer(lesson, { type: 'hint' })).toBe(lesson);
    expect(sessionReducer(lesson, { type: 'reveal', now: T0 })).toBe(lesson);
    expect(sessionReducer(lesson, { type: 'timeUp', now: T0 })).toBe(lesson);
    expect(sessionReducer(start, { type: 'next', now: T0 })).toBe(start);
  });
});

describe('rating cards and inserting a similar question', () => {
  const cards = (n: number): SessionItem[] => pack.cards.slice(0, n).map((card) => ({ kind: 'card', card }));
  const gen = (seed: number): SessionItem => ({ kind: 'question', question: generateQuestion('je-capital', seed) });
  const authored = (): SessionItem => ({ kind: 'question', question: pack.questions.find((q) => q.type === 'mcq')! });
  const wrongJournal = (q: Question): Response => {
    if (q.type !== 'journal_entry') throw new Error('expected a journal question');
    return {
      type: 'journal_entry',
      lines: q.expected.map((l) => ({ ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) })),
    };
  };

  it('starts with no card ratings', () => {
    expect(startSession(cards(1), T0).cardRatings).toEqual([]);
  });

  it('records a rating from the current card and advances like next', () => {
    let s = startSession(cards(2), T0);
    const first = pack.cards[0];
    s = sessionReducer(s, { type: 'rateCard', known: true, now: T0 + 5 });
    expect(s.cardRatings).toEqual([
      { cardId: first.id, conceptId: first.conceptId, topicId: first.topicId, known: true },
    ]);
    expect(s).toMatchObject({ index: 1, phase: 'playing', hintsUsed: 0, revealed: false, result: null, startedAt: T0 + 5 });
  });

  it('keeps two cards rated differently and finishes after the last one', () => {
    let s = startSession(cards(2), T0);
    s = sessionReducer(s, { type: 'rateCard', known: true, now: T0 });
    s = sessionReducer(s, { type: 'rateCard', known: false, now: T0 });
    expect(s.phase).toBe('done');
    expect(s.cardRatings.map((r) => [r.cardId, r.known])).toEqual([
      [pack.cards[0].id, true],
      [pack.cards[1].id, false],
    ]);
  });

  it('records nothing when a card is skipped with next', () => {
    const s = sessionReducer(startSession(cards(2), T0), { type: 'next', now: T0 });
    expect(s.index).toBe(1);
    expect(s.cardRatings).toEqual([]);
  });

  it('ignores a rating outside a card', () => {
    const onQuestion = startSession([authored()], T0);
    expect(sessionReducer(onQuestion, { type: 'rateCard', known: true, now: T0 })).toBe(onQuestion);
    const onLesson = startSession(buildLevelSession(pack.levels[0], pack, 0), T0);
    expect(sessionReducer(onLesson, { type: 'rateCard', known: true, now: T0 })).toBe(onLesson);
    const done = startSession([], T0);
    expect(sessionReducer(done, { type: 'rateCard', known: true, now: T0 })).toBe(done);
  });

  it('inserts an item right after a finished question and shows it on next', () => {
    const extra = gen(2);
    let s = startSession([gen(1), authored()], T0);
    const original = s.items;
    s = sessionReducer(s, { type: 'reveal', now: T0 });
    s = sessionReducer(s, { type: 'insertNext', item: extra });
    expect(s.items).toHaveLength(3);
    expect(s.items[1]).toEqual({ ...extra, extra: true });
    expect(s.items).not.toBe(original);
    expect(original).toHaveLength(2);
    expect(s.index).toBe(0);
    s = sessionReducer(s, { type: 'next', now: T0 + 1 });
    expect(currentItem(s)).toEqual({ ...extra, extra: true });
    expect(s.phase).toBe('playing');
  });

  it('ignores insertNext while playing, on a card, or twice for the same question', () => {
    const extra = gen(2);
    const playing = startSession([gen(1)], T0);
    expect(sessionReducer(playing, { type: 'insertNext', item: extra })).toBe(playing);
    const onCard = startSession(cards(1), T0);
    expect(sessionReducer(onCard, { type: 'insertNext', item: extra })).toBe(onCard);
    let s = sessionReducer(playing, { type: 'reveal', now: T0 });
    s = sessionReducer(s, { type: 'insertNext', item: extra });
    expect(sessionReducer(s, { type: 'insertNext', item: gen(3) })).toBe(s);
  });

  it('allows a similar question only for a generated question that was missed or revealed, once', () => {
    const wrongAnswer = (items: SessionItem[]) => {
      const s = startSession(items, T0);
      const q = (s.items[0] as { question: Question }).question;
      return sessionReducer(s, { type: 'answer', response: wrongJournal(q), now: T0 });
    };
    const missed = wrongAnswer([gen(1)]);
    expect(missed.phase).toBe('feedback');
    expect(canInsertSimilar(missed)).toBe(true);

    const revealed = sessionReducer(startSession([gen(1)], T0), { type: 'reveal', now: T0 });
    expect(canInsertSimilar(revealed)).toBe(true);

    const q = (gen(1) as { question: Question }).question;
    const correct = sessionReducer(startSession([gen(1)], T0), { type: 'answer', response: right(q), now: T0 });
    expect(canInsertSimilar(correct)).toBe(false);

    const authoredWrong = sessionReducer(startSession([authored()], T0), {
      type: 'answer',
      response: wrongMcq((authored() as { question: Question }).question),
      now: T0,
    });
    expect(authoredWrong.result?.correct).toBe(false);
    expect(canInsertSimilar(authoredWrong)).toBe(false);

    expect(canInsertSimilar(startSession([gen(1)], T0))).toBe(false);
    expect(canInsertSimilar(startSession(cards(1), T0))).toBe(false);

    const inserted = sessionReducer(missed, { type: 'insertNext', item: gen(2) });
    expect(canInsertSimilar(inserted)).toBe(false);
  });

  it('allows another similar question for the inserted question itself, even after re-renders', () => {
    let s = startSession([gen(1), authored()], T0);
    s = sessionReducer(s, { type: 'reveal', now: T0 });
    s = sessionReducer(s, { type: 'insertNext', item: gen(2) });
    expect(canInsertSimilar({ ...s })).toBe(false);
    s = sessionReducer(s, { type: 'next', now: T0 });
    s = sessionReducer(s, { type: 'reveal', now: T0 });
    expect(canInsertSimilar(s)).toBe(true);
  });

  it('does not count an inserted question in the summary', () => {
    const level = pack.levels[2];
    let s = startSession([gen(1)], T0);
    s = sessionReducer(s, { type: 'reveal', now: T0 });
    s = sessionReducer(s, { type: 'insertNext', item: gen(2) });
    s = sessionReducer(s, { type: 'next', now: T0 });
    s = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 });
    s = sessionReducer(s, { type: 'next', now: T0 });
    expect(s.phase).toBe('done');
    // The extra answer is an attempt, but the score is that of the original question alone.
    expect(s.attempts).toHaveLength(2);
    expect(summarize(s, level)).toMatchObject({ correct: 0, total: 1, score: 0, passed: false });
  });
});

describe('similar questions are extras that never cost a pass', () => {
  const level = pack.levels[4];
  const gen = (seed: number): SessionItem => ({ kind: 'question', question: generateQuestion('je-capital', seed) });
  const authored = (): SessionItem => ({ kind: 'question', question: pack.questions.find((q) => q.type === 'mcq')! });
  const wrongJournal = (q: Question): Response => {
    if (q.type !== 'journal_entry') throw new Error('expected a journal question');
    return {
      type: 'journal_entry',
      lines: q.expected.map((l) => ({ ...l, side: l.side === 'Dr' ? ('Cr' as const) : ('Dr' as const) })),
    };
  };
  const answerRight = (s: SessionState): SessionState => {
    const next = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 });
    return sessionReducer(next, { type: 'next', now: T0 });
  };
  const answerWrong = (s: SessionState): SessionState => sessionReducer(s, { type: 'answer', response: wrongJournal(question(s)), now: T0 });
  const eight = (): SessionItem[] => Array.from({ length: 8 }, (_, i) => gen(i + 1));

  it('keeps a pass when a similar question is missed after the originals scored 6 of 8', () => {
    let s = startSession(eight(), T0);
    for (let i = 0; i < 6; i++) s = answerRight(s);
    s = answerWrong(s); // the seventh original, missed
    expect(canInsertSimilar(s)).toBe(true);
    s = sessionReducer(s, { type: 'insertNext', item: gen(50) });
    s = sessionReducer(s, { type: 'next', now: T0 });
    s = answerWrong(s); // the similar question, missed in turn
    s = sessionReducer(s, { type: 'next', now: T0 });
    s = answerWrong(s); // the eighth original, missed
    s = sessionReducer(s, { type: 'next', now: T0 });
    expect(s.phase).toBe('done');
    expect(s.attempts).toHaveLength(9);
    expect(summarize(s, level)).toEqual({ correct: 6, total: 8, score: 0.75, passed: true, lesson: false });
  });

  it('does not let a right similar answer raise the score above the originals', () => {
    let s = startSession(eight(), T0);
    s = answerWrong(s);
    s = sessionReducer(s, { type: 'insertNext', item: gen(50) });
    s = sessionReducer(s, { type: 'next', now: T0 });
    s = answerRight(s); // the similar question, right
    for (let i = 0; i < 7; i++) s = answerRight(s);
    expect(s.phase).toBe('done');
    expect(s.attempts).toHaveLength(9);
    expect(summarize(s, level)).toMatchObject({ correct: 7, total: 8, score: 0.875 });
  });

  it('marks only the inserted item as an extra, and counts the originals as the scored questions', () => {
    let s = startSession(eight(), T0);
    s = answerWrong(s);
    const extra = gen(50);
    s = sessionReducer(s, { type: 'insertNext', item: extra });
    expect(s.items).toHaveLength(9);
    expect(s.items.filter((i) => i.kind === 'question' && i.extra)).toHaveLength(1);
    expect(s.items[1]).toMatchObject({ extra: true, question: (extra as { question: Question }).question });
    expect(countScored(s.items)).toBe(8);
    expect(scoredAttempts(s)).toBe(1);
    s = sessionReducer(s, { type: 'next', now: T0 });
    s = answerRight(s);
    expect(s.attempts).toHaveLength(2);
    expect(scoredAttempts(s)).toBe(1);
  });

  it('offers a similar question on the last original and still scores only the originals', () => {
    let s = startSession([gen(1)], T0);
    s = answerWrong(s);
    expect(canInsertSimilar(s)).toBe(true);
    expect(scoredAttempts(s)).toBe(countScored(s.items));
    s = sessionReducer(s, { type: 'insertNext', item: gen(50) });
    s = sessionReducer(s, { type: 'next', now: T0 });
    expect(s.phase).toBe('playing');
    s = answerRight(s);
    expect(s.phase).toBe('done');
    expect(summarize(s, level)).toMatchObject({ correct: 0, total: 1, passed: false });
  });

  it('ignores insertNext when no similar question may be offered', () => {
    const extra = gen(50);
    // A correct answer to a generated question.
    const correct = sessionReducer(startSession([gen(1)], T0), { type: 'answer', response: right((gen(1) as { question: Question }).question), now: T0 });
    expect(canInsertSimilar(correct)).toBe(false);
    expect(sessionReducer(correct, { type: 'insertNext', item: extra })).toBe(correct);
    // A wrong answer to an authored question.
    const authoredQ = (authored() as { question: Question }).question;
    const authoredWrong = sessionReducer(startSession([authored()], T0), { type: 'answer', response: wrongMcq(authoredQ), now: T0 });
    expect(canInsertSimilar(authoredWrong)).toBe(false);
    expect(sessionReducer(authoredWrong, { type: 'insertNext', item: extra })).toBe(authoredWrong);
  });
});

describe('attemptXp', () => {
  const draft = (questionId: string, correct: boolean, difficulty: 'easy' | 'medium' = 'easy', hintsUsed = 0) => ({
    conceptId: 'c',
    questionId,
    difficulty,
    correct,
    hintsUsed,
    mistakeCode: undefined,
    timeMs: 1,
  });

  it('pays the usual amount for a first correct answer, authored or generated', () => {
    const attempts = [draft('je-q-002', true), draft('gen:t:1:5', true), draft('gen:t:1:6', true, 'medium')];
    expect(attemptXp(attempts, 0, new Set())).toBe(10);
    expect(attemptXp(attempts, 1, new Set())).toBe(10);
    expect(attemptXp(attempts, 2, new Set())).toBe(20);
  });
  it('pays the reduced amount for a generated question answered right before, in an earlier session or this one', () => {
    expect(attemptXp([draft('gen:t:1:5', true)], 0, new Set(['gen:t:1:5']))).toBe(2);
    const attempts = [draft('gen:t:1:5', false), draft('gen:t:1:5', true), draft('gen:t:1:5', true, 'medium')];
    expect(attemptXp(attempts, 1, new Set())).toBe(10);
    expect(attemptXp(attempts, 2, new Set())).toBe(4);
  });
  it('pays the reduced amount for an authored question answered right before, in an earlier session or this one', () => {
    expect(attemptXp([draft('je-q-002', true)], 0, new Set(['je-q-002']))).toBe(2);
    const attempts = [draft('je-q-002', false), draft('je-q-002', true), draft('je-q-002', true)];
    expect(attemptXp(attempts, 1, new Set())).toBe(10);
    expect(attemptXp(attempts, 2, new Set())).toBe(2);
  });
  it('agrees with the totals deriveProgress gives', () => {
    const rows = [draft('je-q-002', true), draft('je-q-003', true, 'easy', 1), draft('je-q-002', true), draft('je-q-003', false)];
    const events = rows.map((r, i) => ({
      ...r,
      id: `a${i}`,
      profileId: 'p',
      courseId: 'c',
      topicId: 't',
      at: 1_000_000 + i,
      sessionId: 's',
    }));
    const sum = rows.reduce((total, _, i) => total + attemptXp(rows, i, new Set()), 0);
    expect(deriveProgress(events, [], 1_000_100).xp).toBe(sum);
  });
});

describe('the check of a lesson', () => {
  const lessonLevel = pack.levels[0];

  it('may be tried again after a miss, as an extra that is recorded but never scored, and the lesson is passed', () => {
    let s = startSession(buildLevelSession(lessonLevel, pack, 0), T0);
    s = sessionReducer(s, { type: 'next', now: T0 + 1 });
    const q = question(s);
    expect(canRetryCheck(s)).toBe(false);
    s = sessionReducer(s, { type: 'answer', response: wrongMcq(q), now: T0 + 2 });
    expect(canRetryCheck(s)).toBe(true);
    s = sessionReducer(s, { type: 'retryCheck' });
    expect(canRetryCheck(s)).toBe(false);
    expect(sessionReducer(s, { type: 'retryCheck' })).toBe(s);
    s = sessionReducer(s, { type: 'next', now: T0 + 3 });
    expect(question(s).id).toBe(q.id);
    expect(currentItem(s)).toMatchObject({ extra: true, check: true });
    s = sessionReducer(s, { type: 'answer', response: right(q), now: T0 + 4 });
    // Right the second time: nothing more to try.
    expect(canRetryCheck(s)).toBe(false);
    s = sessionReducer(s, { type: 'next', now: T0 + 5 });
    expect(s.phase).toBe('done');
    // Both answers are recorded, in order; only the first is scored.
    expect(s.attempts.map((a) => a.correct)).toEqual([false, true]);
    expect(s.attemptIsExtra).toEqual([false, true]);
    expect(summarize(s, lessonLevel)).toEqual({ correct: 0, total: 1, score: 0, passed: true, lesson: true });
  });

  it('is offered to try again once: a second miss goes on to the end of the lesson', () => {
    let s = startSession(buildLevelSession(lessonLevel, pack, 0), T0);
    s = sessionReducer(s, { type: 'next', now: T0 + 1 });
    const q = question(s);
    s = sessionReducer(s, { type: 'answer', response: wrongMcq(q), now: T0 + 2 });
    s = sessionReducer(s, { type: 'retryCheck' });
    s = sessionReducer(s, { type: 'next', now: T0 + 3 });
    s = sessionReducer(s, { type: 'answer', response: wrongMcq(q), now: T0 + 4 });
    expect(canRetryCheck(s)).toBe(false);
    expect(sessionReducer(s, { type: 'retryCheck' })).toBe(s);
    s = sessionReducer(s, { type: 'next', now: T0 + 5 });
    expect(s.phase).toBe('done');
    expect(s.attempts).toHaveLength(2);
    expect(summarize(s, lessonLevel)).toMatchObject({ correct: 0, total: 1, passed: true, lesson: true });
  });

  it('is never offered to try again for a right answer, or for a question that is not a lesson check', () => {
    let s = startSession(buildLevelSession(lessonLevel, pack, 0), T0);
    s = sessionReducer(s, { type: 'next', now: T0 + 1 });
    s = sessionReducer(s, { type: 'answer', response: right(question(s)), now: T0 + 2 });
    expect(canRetryCheck(s)).toBe(false);
    let other = startSession(buildLevelSession(pack.levels[2], pack, 0), T0);
    other = sessionReducer(other, { type: 'answer', response: wrongMcq(question(other)), now: T0 + 1 });
    expect(canRetryCheck(other)).toBe(false);
    // A level of questions is still passed by its pass mark.
    expect(summarize(other, pack.levels[2]).lesson).toBe(false);
  });
});

describe('partial XP in a session', () => {
  it('earns partial XP on the first answer to a long question only, by the rule the totals use', () => {
    const statement = rightFormat(SAMPLE_STATEMENT);
    if (statement.type !== 'statement') throw new Error('not a statement');
    const asked: SessionItem[] = [{ kind: 'question', question: SAMPLE_STATEMENT }];
    const answered = sessionReducer(startSession(asked, T0), { type: 'answer', response: { ...statement, rows: statement.rows.slice(1) }, now: T0 + 1 });
    const a = answered.attempts[0];
    expect(a.correct).toBe(false);
    const fresh = attemptXp(answered.attempts, 0, new Set(), new Set());
    const seen = attemptXp(answered.attempts, 0, new Set(), new Set([SAMPLE_STATEMENT.id]));
    expect(fresh).toBeGreaterThan(0);
    expect(seen).toBe(0);
    const event = { ...a, id: 'x', profileId: 'p', courseId: 'c', topicId: 't', sessionId: 's', at: T0 };
    expect(deriveProgress([event], [], T0 + 1).xp).toBe(fresh);
  });
});

