import { useEffect } from 'react';
import type { Question } from '@/content/types';
import type { CheckResult, Response } from '@/exercises/logic';
import type { Draft, DraftOf } from '@/play/drafts';

/** What every answer input receives from the question stage. One input per question type (see the exercise registry). */
export interface AnswerInputProps<Q extends Question> {
  question: Q;
  /** True once the answer has been checked or revealed: the input is read-only and marks what was right and wrong. */
  checked: boolean;
  /** What the check found, for marking the answer; null before checking and after the answer was shown. */
  result: CheckResult | null;
  /** Called when the input goes from empty to something typed or chosen (or back), so the stage can enable Check. */
  onFilledChange(filled: boolean): void;
  /** The input hands over the function Check calls: it validates the input and, if it is fine, calls `onAnswer`. */
  registerSubmit(submit: () => void): void;
  /** An answer that is ready to be checked. */
  onAnswer(response: Response): void;
  /**
   * For a mock paper, where an answer is kept and may be changed until the paper is handed in: the answer as it was
   * left, which the input starts from. The ordinary player gives none, and the input starts empty.
   */
  draft?: DraftOf<Q>;
  /** For a mock paper: told the answer as it stands after every change to it. */
  onDraft?(draft: Draft): void;
}

/**
 * Wires a simple input to the stage: `response` is the answer as it stands now, or null when there is none yet.
 * Check is enabled while there is one, and submits it.
 */
export function useAnswerChannel(
  response: Response | null,
  { onFilledChange, registerSubmit, onAnswer }: Pick<AnswerInputProps<Question>, 'onFilledChange' | 'registerSubmit' | 'onAnswer'>,
) {
  const filled = response !== null;
  useEffect(() => {
    onFilledChange(filled);
  }, [filled, onFilledChange]);
  useEffect(() => {
    registerSubmit(() => {
      if (response) onAnswer(response);
    });
  }, [registerSubmit, response, onAnswer]);
}
