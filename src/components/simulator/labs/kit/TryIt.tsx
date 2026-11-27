'use client';

import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------------------------------------------
// The parts of every "Try it" question: the card (what it is about, the score so far, the facts, the question,
// Check, Next), an option, a field for a figure, and the feedback (right or not, the right answer, the slip named,
// the reason). Nothing is recorded. Test ids begin with the lab's prefix: <prefix>-try, -try-score, -try-prompt,
// -try-item, -try-check, -try-next, -try-feedback (data-correct), -try-answer, -try-option-<id>, -try-tag-<id>.
// ---------------------------------------------------------------------------------------------------------------

/** The verdict as it is shown. */
export interface ShownVerdict {
  right: boolean;
  /** The right answer, said after "Not quite." (a sentence). */
  answer?: ReactNode;
  /** What was wrong with the answer given: the slip, named. */
  slip?: ReactNode;
  /** Why the right answer is right. */
  reason?: ReactNode;
  /** A word on the picture ("The picture now shows the answer."). */
  note?: ReactNode;
}

export interface Score {
  right: number;
  asked: number;
}

/** The score of a visit: how many answered, how many right. Not recorded. */
export function useScore(): [Score, (right: boolean) => void] {
  const [score, setScore] = useState<Score>({ right: 0, asked: 0 });
  return [score, (right: boolean) => setScore((s) => ({ right: s.right + (right ? 1 : 0), asked: s.asked + 1 }))];
}

export function TryCard({
  prefix,
  kind,
  question,
  title,
  progress,
  score,
  facts,
  prompt,
  item,
  children,
  verdict,
  onCheck,
  canCheck = true,
  onNext,
  nextLabel = 'Next question',
  skippable = false,
}: {
  prefix: string;
  /** The kind of question (`data-kind`). */
  kind?: string;
  /** Which question it is (`data-question`). */
  question?: string;
  /** What the question is about, in a few words. */
  title?: ReactNode;
  /** "Question 2 of 6". */
  progress?: ReactNode;
  score?: Score;
  facts?: readonly ReactNode[];
  prompt: ReactNode;
  /** The item asked about, set out on its own. */
  item?: ReactNode;
  /** The answer: options, a field, or the picture itself. */
  children?: ReactNode;
  verdict: ShownVerdict | null;
  /** Without it, the answer is marked as soon as it is given (an option tapped). */
  onCheck?(): void;
  canCheck?: boolean;
  onNext(): void;
  nextLabel?: string;
  /** "Skip" stands in for Next before an answer. */
  skippable?: boolean;
}) {
  const id = useId();
  const answered = verdict !== null;
  return (
    <section aria-labelledby={`${id}-q`} data-testid={`${prefix}-try`} data-kind={kind} data-question={question} className="flex min-w-0 flex-col gap-3 rounded-card border border-edge bg-surface p-4 shadow-card">
      {title || progress || score ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-xs font-extrabold uppercase tracking-wide text-muted">
            {title}
            {title && progress ? ' · ' : ''}
            {progress}
          </p>
          {score ? (
            <p data-testid={`${prefix}-try-score`} className="text-xs font-bold text-muted">
              {score.right} right of {score.asked} (not recorded)
            </p>
          ) : null}
        </div>
      ) : null}
      {facts && facts.length > 0 ? (
        <ul className="flex flex-col gap-0.5 rounded-control bg-sunken px-3 py-2 text-base">
          {facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : null}
      <h3 id={`${id}-q`} data-testid={`${prefix}-try-prompt`} className="text-base font-extrabold">
        {prompt}
      </h3>
      {item ? (
        <p data-testid={`${prefix}-try-item`} className="rounded-control border-2 border-dashed border-edge-deep bg-sunken px-4 py-3 text-lg font-extrabold">
          {item}
        </p>
      ) : null}
      {children}
      {!answered && (onCheck || skippable) ? (
        <div className="flex flex-wrap gap-2">
          {onCheck ? (
            <Button data-testid={`${prefix}-try-check`} onClick={onCheck} disabled={!canCheck}>
              Check
            </Button>
          ) : null}
          {skippable ? (
            <Button variant="ghost" data-testid={`${prefix}-try-next`} onClick={onNext}>
              Skip
            </Button>
          ) : null}
        </div>
      ) : null}
      <FeedbackBox prefix={prefix} verdict={verdict} />
      {answered ? (
        <div className="flex flex-wrap gap-2">
          <Button data-testid={`${prefix}-try-next`} onClick={onNext}>
            {nextLabel}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** "Right" or "Not quite", the right answer, the slip and the reason; announced politely when it appears. */
export function FeedbackBox({ prefix, verdict }: { prefix: string; verdict: ShownVerdict | null }) {
  return (
    <div role="status" aria-live="polite" data-testid={`${prefix}-try-feedback`} data-correct={verdict ? String(verdict.right) : undefined}>
      {verdict ? (
        <div className={`flex flex-col gap-1 rounded-control border-2 px-3 py-2 text-sm ${verdict.right ? 'border-primary bg-primary-soft' : 'border-danger bg-danger-soft'}`}>
          <p className={`text-base font-extrabold ${verdict.right ? 'text-primary-ink' : 'text-danger-deep'}`}>
            {verdict.right ? '✓ Right.' : '✗ Not quite.'}
            {verdict.answer ? <> {verdict.answer}</> : null}
          </p>
          {verdict.slip ? <p className="font-bold text-danger-deep">{verdict.slip}</p> : null}
          {verdict.reason ? <div className="flex flex-col gap-0.5 text-ink">{verdict.reason}</div> : null}
          {verdict.note ? <p className="text-xs font-bold text-muted">{verdict.note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A row (or grid) of options, named for a screen reader. */
export function ChoiceGroup({ label, children, className = 'flex flex-wrap gap-2' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/**
 * An option of a question: pressed when chosen (a ring as well as a colour), and once marked, ✓ on the right one and
 * ✗ on a wrong one chosen (`data-mark`).
 */
export function ChoiceButton({
  testId,
  chosen,
  mark = null,
  onClick,
  disabled,
  children,
  className = '',
}: {
  testId: string;
  chosen: boolean;
  mark?: 'right' | 'wrong' | null;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const tone =
    mark === 'right'
      ? 'border-primary bg-primary-soft text-primary-ink'
      : mark === 'wrong'
        ? 'border-danger bg-danger-soft text-danger-deep'
        : chosen
          ? 'border-primary bg-primary-soft text-ink ring-2 ring-primary'
          : 'border-edge-deep bg-surface text-ink hover:bg-sunken';
  return (
    <button
      type="button"
      aria-pressed={chosen}
      data-testid={testId}
      data-mark={mark ?? ''}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 min-w-0 rounded-control border-2 px-3 py-2 text-left text-base font-bold transition-colors disabled:cursor-default ${tone} ${className}`}
    >
      {mark === 'right' ? '✓ ' : mark === 'wrong' ? '✗ ' : ''}
      {children}
    </button>
  );
}

export type AnswerUnit = 'rupee' | 'percent' | 'ratio' | 'to-one' | 'times' | 'plain';

const UNIT_HINT: Record<AnswerUnit, string> = {
  rupee: 'such as 12,500',
  percent: 'such as 12.5',
  ratio: 'such as 3:2',
  'to-one': 'such as 1.25',
  times: 'such as 4.5',
  plain: '',
};

/** A field for a figure: ₹ before an amount, % after a percentage, ": 1" or "times" after a ratio. Enter checks. */
export function AnswerField({
  unit,
  label = 'Your answer',
  value,
  onChange,
  testId,
  disabled,
  onEnter,
  problem,
  placeholder,
}: {
  unit: AnswerUnit;
  label?: ReactNode;
  value: string;
  onChange(v: string): void;
  testId: string;
  disabled?: boolean;
  onEnter?(): void;
  /** Why what is typed cannot be read, shown under the field. */
  problem?: string | null;
  placeholder?: string;
}) {
  const id = useId();
  const after = unit === 'percent' ? '%' : unit === 'to-one' ? ': 1' : unit === 'times' ? 'times' : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <span className="flex w-full max-w-xs items-center rounded-control border-2 border-edge-deep bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-focus">
        {unit === 'rupee' ? (
          <span aria-hidden="true" className="pl-3 text-muted">
            ₹
          </span>
        ) : null}
        <input
          id={id}
          inputMode={unit === 'ratio' ? 'text' : 'decimal'}
          autoComplete="off"
          disabled={disabled}
          value={value}
          data-testid={testId}
          placeholder={placeholder ?? UNIT_HINT[unit]}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${id}-p` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          className="min-h-11 w-full min-w-0 bg-transparent px-2 text-base font-bold tabular-nums text-ink outline-none disabled:text-muted"
        />
        {after ? (
          <span aria-hidden="true" className="whitespace-nowrap pr-3 text-muted">
            {after}
          </span>
        ) : null}
      </span>
      {problem ? (
        <p id={`${id}-p`} className="text-sm font-semibold text-danger-deep">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
