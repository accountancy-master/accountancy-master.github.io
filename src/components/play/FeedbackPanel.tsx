'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { KEEP_LINES } from '@/components/ui/Prompt';
import type { Question } from '@/content/types';
import type { CheckResult } from '@/exercises/logic';
import { MISTAKE_TEXT } from '@/exercises/logic';
import { exerciseFor } from '@/exercises/registry';
import { partialShare } from '@/learning/gamification';
import { describeWrong } from '@/play/mistakeText';

/** After a control appears where another one was (or where a tap may already be on its way), it ignores taps for this long. */
export const SETTLE_MS = 400;

/**
 * The title of the feedback. `almost` is for a long answer that is not right but has most of its parts right (one
 * that earns partial XP, see `partialShare`): it still counts as wrong.
 */
export function feedbackTitle(correct: boolean, revealed: boolean, timedOut = false, almost = false): string {
  return timedOut ? "Time's up" : revealed ? "Here's the answer" : correct ? 'Correct' : almost ? 'Almost' : 'Not quite';
}

/** True for an answer that is not right but has enough of its parts right to earn partial XP. */
export const isAlmost = (a: { correct: boolean; mistakeCode?: string } | undefined): boolean => a !== undefined && partialShare(a) !== null;

/**
 * What feedback says about an answer: the mistake in words, the right answer, the explanation and the worked
 * solution. The player's feedback panel shows it after a question, a marked mock paper under every question.
 */
export function FeedbackDetails({
  question,
  correct,
  mistakeCode,
  result,
}: {
  question: Question;
  correct: boolean;
  mistakeCode: string | undefined;
  /** The check itself, where it is at hand: a journal entry then says every mistake it found, not only the first. */
  result?: CheckResult | null;
}) {
  const exercise = exerciseFor(question);
  const { Solution } = exercise;
  const answer = correct ? null : exercise.correctAnswer(question);
  const mistake = describeWrong(question, mistakeCode);
  const also = (result?.journal?.others ?? []).map((code) => MISTAKE_TEXT[code]).filter(Boolean);
  const almost = isAlmost({ correct, mistakeCode });
  return (
    <>
      {mistake ? (
        <p data-testid="feedback-mistake" className="text-base font-bold">
          {mistake}
        </p>
      ) : null}
      {also.length > 0 ? (
        <p data-testid="feedback-also" className="text-base font-bold">
          Also: {also.join(' ')}
        </p>
      ) : null}
      {almost ? (
        <p data-testid="feedback-partial" className="text-base">
          The first answer to a question earns XP for the parts that are right. The question counts as right only when every part is right.
        </p>
      ) : null}
      {answer ? (
        <p className={`text-base ${KEEP_LINES}`}>
          <span className="font-extrabold">Right answer: </span>
          {answer}
        </p>
      ) : null}
      {exercise.solutionHasExplanation ? null : (
        <p className={`text-base ${KEEP_LINES}`}>{exercise.inputShowsSolution ?? question.explanation}</p>
      )}
      {Solution ? <Solution question={question} mistakeCode={mistakeCode} /> : null}
    </>
  );
}

export function FeedbackPanel({
  question,
  correct,
  revealed,
  timedOut = false,
  mistakeCode,
  result,
  xp,
  onContinue,
  onSimilar,
  onRetry,
}: {
  question: Question;
  correct: boolean;
  revealed: boolean;
  /** True when the question was closed by its clock: the feedback is that of a wrong answer, and says the time is up. */
  timedOut?: boolean;
  mistakeCode: string | undefined;
  /** The check of the answer, where there was one (see `FeedbackDetails`). */
  result?: CheckResult | null;
  xp: number;
  onContinue(): void;
  /** Present when a similar question may be offered. */
  onSimilar?: () => void;
  /** Present when the question may be tried again (the check of a lesson that was missed). */
  onRetry?: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  // Time that runs out puts this panel on the screen unasked, perhaps under a tap or an Enter meant for the answer:
  // for a moment its buttons take neither (a real `disabled`, as for the buttons of a question that has just appeared).
  const [settling, setSettling] = useState(timedOut);
  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settling]);
  // Checking an answer replaces the footer, so keyboard focus would be lost; put it on the first button (Try again,
  // where the question may be tried again, or Continue). The page is not scrolled to it: the question scrolls the
  // feedback into view itself (see QuestionStage).
  useEffect(() => {
    if (!settling) panelRef.current?.querySelector<HTMLButtonElement>('[data-feedback-action]')?.focus({ preventScroll: true });
  }, [settling]);
  const almost = !correct && !revealed && !timedOut && isAlmost({ correct, mistakeCode });

  const tone = correct
    ? 'border-primary bg-primary-soft'
    : revealed || almost
      ? 'border-accent bg-accent-soft'
      : 'border-danger bg-danger-soft';
  const titleTone = correct ? 'text-primary-ink' : revealed || almost ? 'text-accent-ink' : 'text-danger-deep';

  return (
    <section
      ref={panelRef}
      data-testid="feedback"
      data-correct={correct ? 'true' : 'false'}
      data-almost={almost ? 'true' : undefined}
      aria-label="Feedback"
      className={`flex flex-col gap-3 rounded-card border-2 border-b-4 p-4 ${tone}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 data-testid="feedback-title" className={`text-2xl font-extrabold ${titleTone}`}>
          {feedbackTitle(correct, revealed, timedOut, almost)}
        </h2>
        <span
          data-testid="feedback-xp"
          className="inline-flex min-h-8 items-center rounded-full bg-surface px-3 text-sm font-extrabold text-accent-ink"
        >
          +{xp} XP
        </span>
      </div>
      <FeedbackDetails question={question} correct={correct} mistakeCode={mistakeCode} result={result} />
      {onRetry ? (
        <p data-testid="retry-note" className="text-base font-bold">
          Read the explanation, then try the question again. This check is practice: the lesson is passed when you finish it.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        {onRetry ? (
          <Button size="lg" data-testid="retry-check" data-feedback-action disabled={settling} onClick={onRetry} className="w-full sm:w-auto">
            Try it again
          </Button>
        ) : null}
        <Button
          size="lg"
          variant={onRetry ? 'secondary' : 'primary'}
          data-testid="continue"
          data-feedback-action={onRetry ? undefined : true}
          disabled={settling}
          onClick={onContinue}
          className="w-full sm:w-auto"
        >
          Continue
        </Button>
        {onSimilar ? (
          <Button size="lg" variant="secondary" data-testid="try-similar" disabled={settling} onClick={onSimilar} className="w-full sm:w-auto">
            Try a similar question
          </Button>
        ) : null}
      </div>
    </section>
  );
}
