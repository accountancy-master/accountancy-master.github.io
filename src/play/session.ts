import type { Level } from '@/content/types';
import { checkAnswer, type CheckResult, type Response } from '@/exercises/checkers';
import { answerToKeep } from '@/exercises/logic';
import { xpForAttempt } from '@/learning/gamification';
import { scoreLevel } from '@/learning/progress';
import { countScored, lessonOnly, type SessionItem } from '@/learning/sessionBuilder';
import type { AttemptEvent } from '@/storage/types';

/** `hintsUsed` value that means the answer was shown rather than attempted. */
export const REVEALED_HINTS = 3;

export type AttemptDraft = Pick<
  AttemptEvent,
  'conceptId' | 'questionId' | 'difficulty' | 'correct' | 'hintsUsed' | 'mistakeCode' | 'answer' | 'timeMs'
>;

export interface SessionState {
  items: SessionItem[];
  index: number;
  phase: 'playing' | 'feedback' | 'done';
  hintsUsed: number;
  revealed: boolean;
  /** True when the question on screen was closed by its clock (a level played against the clock), not by an answer. */
  timedOut: boolean;
  result: CheckResult | null;
  startedAt: number;
  attempts: AttemptDraft[];
  /** Parallel to `attempts`: true for an answer to an extra (inserted similar) question, which is not scored. */
  attemptIsExtra: boolean[];
  cardRatings: CardRating[];
  /** Index of the question a similar one (or, for a lesson's check, the same one again) was last inserted for; null until one is. */
  similarInsertedFor: number | null;
}

export interface CardRating {
  cardId: string;
  conceptId: string;
  topicId: string;
  known: boolean;
}

export type SessionAction =
  | { type: 'hint' }
  | { type: 'answer'; response: Response; now: number }
  | { type: 'reveal'; now: number }
  /** The clock of the question ran out before an answer was submitted. */
  | { type: 'timeUp'; now: number }
  | { type: 'next'; now: number }
  | { type: 'rateCard'; known: boolean; now: number }
  | { type: 'insertNext'; item: SessionItem }
  /** A lesson's check that was missed is asked again, straight after its feedback, as an extra question. */
  | { type: 'retryCheck' }
  /** More items at the end of a session that is still going (a marathon makes its questions a batch at a time). */
  | { type: 'append'; items: SessionItem[] };

export function startSession(items: SessionItem[], now: number): SessionState {
  return {
    items,
    index: 0,
    phase: items.length === 0 ? 'done' : 'playing',
    hintsUsed: 0,
    revealed: false,
    timedOut: false,
    result: null,
    startedAt: now,
    attempts: [],
    attemptIsExtra: [],
    cardRatings: [],
    similarInsertedFor: null,
  };
}

export const currentItem = (s: SessionState): SessionItem | null =>
  s.phase === 'done' ? null : (s.items[s.index] ?? null);

const openQuestion = (s: SessionState) => {
  const item = currentItem(s);
  return s.phase === 'playing' && item?.kind === 'question' ? item.question : null;
};

export function canHint(s: SessionState): boolean {
  const q = openQuestion(s);
  return q !== null && s.hintsUsed < q.hints.length;
}

/**
 * True when the current finished question is a generated one that was missed or revealed and has no similar one yet.
 * The last scored question qualifies too: the inserted question is an extra, so it never changes the score.
 */
export function canInsertSimilar(s: SessionState): boolean {
  if (s.phase !== 'feedback') return false;
  const item = currentItem(s);
  if (item?.kind !== 'question' || !item.question.id.startsWith('gen:')) return false;
  if (s.similarInsertedFor === s.index) return false;
  return s.attempts[s.attempts.length - 1]?.correct === false;
}

/**
 * True when the finished question on screen is the check of a lesson that was not answered right (missed, shown or
 * out of time) and has not been tried again yet: the learner may try it once more after reading the explanation. The
 * new try is an extra, so it never changes the score; a lesson level is passed by working through it (see `summarize`).
 */
export function canRetryCheck(s: SessionState): boolean {
  if (s.phase !== 'feedback') return false;
  const item = currentItem(s);
  // The try again is itself an extra: missed again, the learner reads the answer and goes on (once more, not forever).
  if (item?.kind !== 'question' || item.check !== true || item.extra === true) return false;
  if (s.similarInsertedFor === s.index) return false;
  return s.attempts[s.attempts.length - 1]?.correct === false;
}

const onExtra = (s: SessionState): boolean => {
  const item = currentItem(s);
  return item?.kind === 'question' && item.extra === true;
};

/** How many of the answers given so far belong to the scored (original) questions. */
export const scoredAttempts = (s: SessionState): number => s.attemptIsExtra.filter((extra) => !extra).length;

const advance = (s: SessionState, now: number): SessionState => {
  const index = s.index + 1;
  return {
    ...s,
    index,
    phase: index >= s.items.length ? 'done' : 'playing',
    hintsUsed: 0,
    revealed: false,
    timedOut: false,
    result: null,
    startedAt: now,
  };
};

export function sessionReducer(s: SessionState, a: SessionAction): SessionState {
  switch (a.type) {
    case 'hint':
      return canHint(s) ? { ...s, hintsUsed: s.hintsUsed + 1 } : s;

    case 'answer': {
      const q = openQuestion(s);
      if (!q) return s;
      const result = checkAnswer(q, a.response);
      const kept = answerToKeep(a.response, result);
      const attempt: AttemptDraft = {
        conceptId: q.conceptId,
        questionId: q.id,
        difficulty: q.difficulty,
        correct: result.correct,
        hintsUsed: s.hintsUsed,
        mistakeCode: result.mistakeCode,
        ...(kept ? { answer: kept } : {}),
        timeMs: a.now - s.startedAt,
      };
      return {
        ...s,
        phase: 'feedback',
        result,
        attempts: [...s.attempts, attempt],
        attemptIsExtra: [...s.attemptIsExtra, onExtra(s)],
      };
    }

    case 'reveal': {
      const q = openQuestion(s);
      if (!q) return s;
      const attempt: AttemptDraft = {
        conceptId: q.conceptId,
        questionId: q.id,
        difficulty: q.difficulty,
        correct: false,
        hintsUsed: REVEALED_HINTS,
        mistakeCode: undefined,
        timeMs: a.now - s.startedAt,
      };
      return {
        ...s,
        phase: 'feedback',
        revealed: true,
        result: null,
        attempts: [...s.attempts, attempt],
        attemptIsExtra: [...s.attemptIsExtra, onExtra(s)],
      };
    }

    case 'timeUp': {
      const q = openQuestion(s);
      if (!q) return s;
      // Recorded as a wrong answer is. Nothing was submitted, so there is no answer to check, to name or to keep.
      const attempt: AttemptDraft = {
        conceptId: q.conceptId,
        questionId: q.id,
        difficulty: q.difficulty,
        correct: false,
        hintsUsed: s.hintsUsed,
        mistakeCode: undefined,
        timeMs: a.now - s.startedAt,
      };
      return {
        ...s,
        phase: 'feedback',
        timedOut: true,
        result: null,
        attempts: [...s.attempts, attempt],
        attemptIsExtra: [...s.attemptIsExtra, onExtra(s)],
      };
    }

    case 'next': {
      if (s.phase === 'done') return s;
      // A question must be answered or revealed before moving on.
      if (openQuestion(s)) return s;
      return advance(s, a.now);
    }

    case 'rateCard': {
      const item = currentItem(s);
      if (s.phase !== 'playing' || item?.kind !== 'card') return s;
      const { id, conceptId, topicId } = item.card;
      const rated: SessionState = {
        ...s,
        cardRatings: [...s.cardRatings, { cardId: id, conceptId, topicId, known: a.known }],
      };
      return advance(rated, a.now);
    }

    case 'insertNext': {
      if (!canInsertSimilar(s)) return s;
      // The inserted question is an extra: recorded like any attempt, but left out of the score.
      const extra: SessionItem = a.item.kind === 'question' ? { ...a.item, extra: true } : a.item;
      const items = [...s.items.slice(0, s.index + 1), extra, ...s.items.slice(s.index + 1)];
      return { ...s, items, similarInsertedFor: s.index };
    }

    case 'retryCheck': {
      if (!canRetryCheck(s)) return s;
      const item = currentItem(s)!;
      const again: SessionItem = { ...item, extra: true } as SessionItem;
      const items = [...s.items.slice(0, s.index + 1), again, ...s.items.slice(s.index + 1)];
      return { ...s, items, similarInsertedFor: s.index };
    }

    case 'append': {
      // A session that has ended stays ended: its record may already be saved.
      if (s.phase === 'done' || a.items.length === 0) return s;
      return { ...s, items: [...s.items, ...a.items] };
    }
  }
}

/**
 * The score of a session and whether it passes. Extras (inserted similar questions, a lesson's check tried again) are
 * recorded as attempts but never count towards the score. A lesson level (`lessonOnly`) is passed by working through
 * it: its checks are practice, and its score says how many were right first time. Every other session passes by its
 * pass mark, where a long question (a set, an account, a statement) counts as right only when every part of it is
 * right; the parts that are right earn XP of their own (see `xpForAttempt`), never a pass.
 */
export function summarize(
  s: SessionState,
  level: Pick<Level, 'passMark'>,
): { correct: number; total: number; score: number; passed: boolean; lesson: boolean } {
  const total = countScored(s.items);
  const correct = s.attempts.filter((x, i) => x.correct && !s.attemptIsExtra[i]).length;
  const lesson = lessonOnly(s.items);
  const scored = scoreLevel(correct, total, level);
  return { correct, total, ...scored, passed: lesson || scored.passed, lesson };
}

/**
 * XP the attempt at `index` earns, by the rule the totals use (deriveProgress): a correct answer to a question
 * (authored or generated) that was already answered correctly before, in `answeredRightBefore` (earlier sessions)
 * or earlier in this one, earns the reduced replay amount. A long answer that is not right earns its partial XP only
 * when it is the first answer to its question: not in `seenBefore` (the questions of earlier sessions' attempts), nor
 * earlier in this one.
 */
export function attemptXp(
  attempts: readonly AttemptDraft[],
  index: number,
  answeredRightBefore: ReadonlySet<string>,
  seenBefore: ReadonlySet<string> = answeredRightBefore,
): number {
  const a = attempts[index];
  const earlier = attempts.slice(0, index);
  const repeat = a.correct && (answeredRightBefore.has(a.questionId) || earlier.some((b) => b.correct && b.questionId === a.questionId));
  const firstTry = !seenBefore.has(a.questionId) && !earlier.some((b) => b.questionId === a.questionId);
  return xpForAttempt(a, repeat, firstTry);
}
