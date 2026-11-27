'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BeyondSyllabus } from '@/components/ui/BeyondSyllabus';
import { Button } from '@/components/ui/Button';
import { CasePanel } from '@/components/ui/CasePanel';
import { beyondSyllabusOf } from '@/content/outline';
import type { Question } from '@/content/types';
import { exerciseFor } from '@/exercises/registry';
import type { Response } from '@/exercises/logic';
import { Prompt } from '@/components/ui/Prompt';
import { caseStaysInReach } from '@/play/caseStudy';
import { canHint, type SessionAction, type SessionState } from '@/play/session';
import { FeedbackPanel, SETTLE_MS } from './FeedbackPanel';

const E2E = process.env.NEXT_PUBLIC_E2E === '1';

/** One question: the answer controls, hints, the reveal, and the feedback once it has been checked. */
export function QuestionStage({
  question,
  state,
  dispatch,
  xp,
  onNext,
  onSimilar,
  onRetry,
  caseView,
}: {
  question: Question;
  state: SessionState;
  dispatch(action: SessionAction): void;
  /** XP this answer earned, by the same rule the totals use. */
  xp: number;
  onNext(): void;
  /** Present only when a similar question may be offered now. */
  onSimilar?: () => void;
  /** Present only when the question may be tried again now (a lesson's check that was missed). */
  onRetry?: () => void;
  /** For a question of a case study: whether its case is open, the button that folds it, and where the question stands. */
  caseView?: { open: boolean; onToggle(): void; note?: string };
}) {
  const [filled, setFilled] = useState(false);
  const submitRef = useRef<(() => void) | null>(null);
  const registerSubmit = useCallback((fn: () => void) => {
    submitRef.current = fn;
  }, []);

  const feedback = state.phase === 'feedback';
  const attempt = state.attempts[state.attempts.length - 1];
  const hints = question.hints.slice(0, state.hintsUsed);
  const hintsLeft = canHint(state);

  // A short real `disabled` period (so Playwright's actionability waits still work) that guards against
  // double taps landing on a control that has just appeared in the spot of the previous one: after a question
  // appears, and after its last hint, Hint / Show answer / Check ignore taps for SETTLE_MS.
  const [settling, setSettling] = useState(true);
  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => setSettling(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settling]);
  const showHint = () => {
    if (settling || !hintsLeft) return;
    if (state.hintsUsed + 1 >= question.hints.length) setSettling(true);
    dispatch({ type: 'hint' });
  };

  // Check asks the input to validate itself; the input answers through onAnswer.
  const { Input, e2eExpected } = exerciseFor(question);
  const check = () => submitRef.current?.();
  const answer = (response: Response) => {
    if (settling) return; // Enter in an input must not bypass the Check guard.
    dispatch({ type: 'answer', response, now: Date.now() });
  };

  // Once the answer is checked, the feedback is brought into view under the bar of the player: with the question
  // above it where both fit on the screen (a short question), or from its own top (a long one), never scrolled past.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedback) revealFeedback(rootRef.current);
  }, [feedback]);

  const expectedAttr = E2E ? { 'data-expected': JSON.stringify(e2eExpected(question)) } : {};
  const beyond = beyondSyllabusOf(question);

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      <div
        data-testid="question"
        data-question-id={question.id}
        data-question-type={question.type}
        {...expectedAttr}
        className="flex flex-col gap-6"
      >
        {/* While a format or a set of a case is answered, its case stays at the top of the screen: it is the data. */}
        {question.context && caseView ? <CasePanel text={question.context} {...caseView} sticky={caseStaysInReach(question, feedback)} /> : null}
        {beyond !== undefined ? <BeyondSyllabus reason={beyond} /> : null}
        <Prompt text={question.prompt} />
        <Input
          question={question}
          checked={feedback}
          result={state.result}
          onFilledChange={setFilled}
          registerSubmit={registerSubmit}
          onAnswer={answer}
        />
      </div>

      {hints.length > 0 ? (
        <div
          data-testid="hint-text"
          className="rounded-card border-2 border-accent bg-accent-soft p-4 text-base text-accent-ink"
        >
          <p className="mb-1 font-extrabold">{hints.length === 1 ? 'Hint' : 'Hints'}</p>
          <ol className="flex list-decimal flex-col gap-1 pl-5">
            {hints.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {!feedback && !hintsLeft ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button
            variant="ghost"
            data-testid="reveal"
            aria-describedby="reveal-note"
            disabled={settling}
            onClick={() => dispatch({ type: 'reveal', now: Date.now() })}
            className="scroll-mb-32"
          >
            Show answer
          </Button>
          <p id="reveal-note" className="text-sm font-bold text-muted">
            You won&apos;t earn XP for this one.
          </p>
        </div>
      ) : null}

      {feedback && attempt ? (
        <FeedbackPanel
          question={question}
          correct={attempt.correct}
          revealed={state.revealed}
          timedOut={state.timedOut}
          mistakeCode={attempt.mistakeCode}
          result={state.result}
          xp={xp}
          onContinue={onNext}
          onSimilar={onSimilar}
          onRetry={onRetry}
        />
      ) : (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t-2 border-edge bg-surface px-4 py-3">
          <div className="flex gap-3">
            <Button
              size="lg"
              variant="secondary"
              data-testid="hint"
              disabled={!hintsLeft || settling}
              onClick={showHint}
              className="flex-1 sm:flex-none"
            >
              {hintsLeft ? `Hint (${question.hints.length - state.hintsUsed} left)` : 'No more hints'}
            </Button>
            <Button size="lg" data-testid="check" disabled={!filled || settling} onClick={check} className="flex-1 sm:ml-auto sm:flex-none">
              Check
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The space kept between the bar of the player and what is scrolled to just under it. */
const GAP_PX = 12;

/**
 * Scrolls the page so that the feedback of a question that has just been checked is in view under the bar of the
 * player (marked `data-player-bar`; the top of the window where there is none): from the question's prompt where the
 * prompt and the start of the feedback fit on the screen together, else from the top of the feedback.
 */
export function revealFeedback(root: HTMLElement | null) {
  const panel = root?.querySelector<HTMLElement>('[data-testid="feedback"]');
  if (!root || !panel) return;
  const bar = document.querySelector('[data-player-bar]')?.getBoundingClientRect().bottom ?? 0;
  const top = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
  const prompt = root.querySelector('[data-testid="prompt-head"]');
  const feedbackTop = top(panel);
  // The start of the feedback: its title and the first lines under it.
  const opening = Math.min(panel.getBoundingClientRect().height, 160);
  const room = window.innerHeight - bar - GAP_PX;
  const from = prompt && feedbackTop + opening - top(prompt) <= room ? top(prompt) : feedbackTop;
  window.scrollTo({ top: Math.max(0, from - bar - GAP_PX), behavior: 'instant' });
}
