import type { Question } from '@/content/types';
import { MISTAKE_TEXT, logicFor } from '@/exercises/logic';
import { REVEALED_HINTS } from './session';

export { MISTAKE_TEXT };

export const ANSWER_SHOWN = 'Answer was shown';
export const NOT_RIGHT = 'The answer was not right.';

/** What went wrong in a checked attempt, in words, or undefined when the question's type has nothing to say about the code. */
export function describeWrong(question: Question, mistakeCode: string | undefined): string | undefined {
  return mistakeCode === undefined ? undefined : logicFor(question).describeWrong(question, mistakeCode);
}

/**
 * A missed attempt in words: that the answer was shown, the mistake its code names, or a plain line for a wrong
 * choice that has no code. Pass the question for codes that need it (a wrong option's or a common error's `why`);
 * without it only the journal codes can be worded.
 */
export function describeMistake(
  attempt: { mistakeCode?: string; hintsUsed: number } | undefined,
  question?: Question,
): string {
  if (attempt && attempt.hintsUsed >= REVEALED_HINTS) return ANSWER_SHOWN;
  const code = attempt?.mistakeCode;
  if (code === undefined) return NOT_RIGHT;
  const specific = question ? describeWrong(question, code) : Object.hasOwn(MISTAKE_TEXT, code) ? MISTAKE_TEXT[code] : undefined;
  return specific ?? NOT_RIGHT;
}
