import { courseOfTopic } from '@/content/outline';
import type { Difficulty, McqQuestion } from '@/content/types';
import { xpForAttempt } from '@/learning/gamification';
import { newId } from '@/lib/ids';
import type { AttemptEvent, Profile, SessionKind } from '@/storage/types';

// A prediction or a found mistake is an attempt like any other answer: it earns XP by its difficulty, counts towards
// mastery of its concept, and a wrong one waits in Mistakes as its question (simulator/questions.ts).

export interface SimAnswer {
  question: McqQuestion;
  correct: boolean;
  difficulty: Difficulty;
  /** The wrong choice of the question the answer amounts to, where it is one: Mistakes then names its mistake. */
  optionId?: string | null;
  timeMs: number;
}

export function simAttempt(
  profile: Profile,
  answer: SimAnswer,
  session: { sessionId: string; sessionKind: SessionKind; levelId?: string },
): AttemptEvent {
  const q = answer.question;
  const why = answer.optionId ? q.options.find((o) => o.id === answer.optionId)?.why : undefined;
  return {
    id: newId(),
    profileId: profile.id,
    // The scene's topic belongs to a course: its records are that course's, whichever the learner is on.
    courseId: courseOfTopic(q.topicId) ?? profile.courseId,
    topicId: q.topicId,
    conceptId: q.conceptId,
    questionId: q.id,
    difficulty: answer.difficulty,
    correct: answer.correct,
    hintsUsed: 0,
    ...(answer.correct || !why ? {} : { mistakeCode: `option:${answer.optionId}` }),
    timeMs: Math.max(0, Math.round(answer.timeMs)),
    at: Date.now(),
    sessionId: session.sessionId,
    sessionKind: session.sessionKind,
    ...(session.levelId ? { levelId: session.levelId } : {}),
  };
}

/** The XP an answer earns, as the progress will count it: less for a question already answered right before. */
export const simXp = (answer: Pick<SimAnswer, 'correct' | 'difficulty'>, answeredRightBefore: boolean): number =>
  xpForAttempt({ correct: answer.correct, difficulty: answer.difficulty, hintsUsed: 0 }, answeredRightBefore);
