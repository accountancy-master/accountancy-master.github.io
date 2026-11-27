'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { KEEP_LINES } from '@/components/ui/Prompt';
import type { LessonBlock } from '@/content/types';
import { lessonSteps, type ShownBlock } from '@/play/lessonSteps';
import { SolutionEntry } from './SolutionEntry';

/** One block of a lesson as it is read: a text, a journal entry worked out, working step by step, or a small table. */
function Block({ block }: { block: ShownBlock }) {
  if (block.type === 'text') {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight">{block.heading}</h2>
        <p className="text-lg">{block.body}</p>
      </section>
    );
  }
  if (block.type === 'example') {
    return (
      <section
        aria-label={`Example: ${block.title}`}
        className="flex flex-col gap-3 rounded-card border-2 border-b-4 border-edge bg-surface p-4"
      >
        <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">Example</p>
        <h3 className="text-lg font-extrabold">{block.title}</h3>
        <SolutionEntry lines={block.lines} data-testid="lesson-example" />
        <p className="text-base">{block.note}</p>
      </section>
    );
  }
  if (block.type === 'working') {
    return (
      <section
        aria-label={`Example: ${block.title}`}
        className="flex flex-col gap-3 rounded-card border-2 border-b-4 border-edge bg-surface p-4"
      >
        <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">Example</p>
        <h3 className="text-lg font-extrabold">{block.title}</h3>
        <ol data-testid="lesson-working" className="flex list-decimal flex-col gap-1 pl-6 text-base">
          {block.lines.map((line, k) => (
            <li key={k} className={KEEP_LINES}>
              {line}
            </li>
          ))}
        </ol>
        {block.note ? <p className="text-base">{block.note}</p> : null}
      </section>
    );
  }
  if (block.type === 'table') {
    return (
      <section
        aria-label={`Example: ${block.title}`}
        className="flex flex-col gap-3 rounded-card border-2 border-b-4 border-edge bg-surface p-4"
      >
        <p className="text-sm font-extrabold uppercase tracking-wide text-primary-ink">Example</p>
        <h3 className="text-lg font-extrabold">{block.title}</h3>
        <div data-testid="lesson-table" role="table" className="flex flex-col text-base">
          {block.rows.map((row, k) => (
            <div
              key={k}
              role="row"
              className={`flex items-baseline justify-between gap-3 py-1 ${row.total ? 'border-t-2 border-edge font-extrabold' : row.amount === undefined ? 'font-bold' : ''}`}
            >
              <span role="cell" className="min-w-0 [overflow-wrap:anywhere]">
                {row.label}
              </span>
              {row.amount !== undefined ? (
                <span role="cell" className="shrink-0 text-right tabular-nums">
                  {row.amount}
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {block.note ? <p className="text-base">{block.note}</p> : null}
      </section>
    );
  }
  return null;
}

/**
 * A lesson, read a step at a time (see `lessonSteps`): a line that says which step of how many is on screen, with a
 * bar, then the step, then Back and Next. The last step's button goes on to the lesson's check. Each new step is shown
 * from its top, and keyboard and screen-reader focus go to it. Nothing is fetched: it reads as well offline.
 */
export function LessonView({ blocks, onContinue }: { blocks: LessonBlock[]; onContinue(): void }) {
  const steps = lessonSteps(blocks);
  const [at, setAt] = useState(0);
  const stepRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    stepRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [at]);
  const go = (to: number) => {
    moved.current = true;
    setAt(Math.max(0, Math.min(steps.length - 1, to)));
  };
  const count = steps.length;
  const last = at >= count - 1;
  const hasCheck = blocks.some((b) => b.type === 'check');

  return (
    <div data-testid="lesson" data-steps={count} className="flex flex-col gap-6">
      {count > 1 ? (
        <div className="flex flex-col gap-2">
          <p data-testid="lesson-progress" className="text-sm font-extrabold uppercase tracking-wide text-muted">
            Step {at + 1} of {count}
          </p>
          <div aria-hidden="true" className="flex gap-1">
            {steps.map((_, k) => (
              <span key={k} className={`h-1.5 min-w-0 flex-1 rounded-full ${k <= at ? 'bg-primary' : 'bg-edge'}`} />
            ))}
          </div>
        </div>
      ) : null}
      <div
        ref={stepRef}
        tabIndex={-1}
        role="group"
        aria-label={count > 1 ? `Step ${at + 1} of ${count}` : 'Lesson'}
        data-testid="lesson-step"
        data-step={at}
        className="flex flex-col gap-6 outline-none"
      >
        {(steps[at] ?? []).map((block, i) => (
          <Block key={`${at}-${i}`} block={block} />
        ))}
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {at > 0 ? (
          <Button size="lg" variant="secondary" data-testid="lesson-back" onClick={() => go(at - 1)} className="w-full sm:w-auto">
            Back
          </Button>
        ) : (
          <span className="hidden sm:block" />
        )}
        {last ? (
          <Button size="lg" data-testid="continue" onClick={onContinue} className="w-full sm:w-auto">
            {hasCheck ? 'Continue to the check' : 'Continue'}
          </Button>
        ) : (
          <Button size="lg" data-testid="lesson-next" onClick={() => go(at + 1)} className="w-full sm:w-auto">
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
