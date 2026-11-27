'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Button, buttonClasses } from '@/components/ui/Button';
import { CONFIG } from '@/learning/config';

export function ResultsView({
  passed,
  correct,
  total,
  xpGained,
  rankName,
  topicId,
  nextLevelId,
  onAgain,
  lesson = false,
  passMark,
}: {
  passed: boolean;
  correct: number;
  total: number;
  /** null while the new total is not known yet (never a guess). */
  xpGained: number | null;
  rankName: string | null;
  topicId: string;
  nextLevelId: string | null;
  onAgain(): void;
  /** True for a lesson level, which is passed by working through it: its checks were practice. */
  lesson?: boolean;
  /** The share right a level needs to pass (the default pass mark when left out). */
  passMark?: number;
}) {
  const needed = Math.ceil((passMark ?? CONFIG.level.defaultPassMark) * total - 1e-9);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section data-testid="results" aria-labelledby="results-heading" className="flex flex-col gap-6">
      <div
        className={`flex flex-col items-center gap-3 rounded-card border-2 border-b-4 p-6 text-center ${
          passed ? 'border-primary bg-primary-soft' : 'border-accent bg-accent-soft'
        }`}
      >
        <h1
          id="results-heading"
          ref={headingRef}
          tabIndex={-1}
          className={`text-3xl font-extrabold tracking-tight outline-none ${passed ? 'text-primary-ink' : 'text-accent-ink'}`}
        >
          {lesson ? 'Lesson complete' : passed ? 'Level complete' : 'Not passed yet'}
        </h1>
        {/* A status, not a button: plain bold words with a mark before them. */}
        <p className={`flex items-center gap-1.5 text-base font-extrabold ${passed ? 'text-primary-ink' : 'text-accent-ink'}`}>
          <span aria-hidden="true">{passed ? '✓' : '↻'}</span>
          <span data-testid="results-passed">{passed ? 'Passed' : 'Try again'}</span>
        </p>
        {total > 0 ? (
          <p data-testid="results-score" className="text-xl font-bold">
            {lesson ? `${correct} of ${total} ${total === 1 ? 'check' : 'checks'} right first time` : `${correct} of ${total} correct`}
          </p>
        ) : null}
        {!passed && total > 0 ? (
          <p data-testid="results-needed" className="text-base font-bold">
            {needed} of {total} right passes this level. Practise again for a new set of questions.
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col-reverse rounded-card border-2 border-b-4 border-edge bg-surface p-3 text-center">
          <dt className="text-sm font-bold text-muted">XP gained</dt>
          <dd data-testid="results-xp" className="text-2xl font-extrabold text-accent-ink">
            {xpGained === null ? '–' : `+${xpGained} XP`}
          </dd>
        </div>
        <div className="flex flex-col-reverse rounded-card border-2 border-b-4 border-edge bg-surface p-3 text-center">
          <dt className="text-sm font-bold text-muted">Your rank</dt>
          <dd data-testid="results-rank" className="text-2xl font-extrabold">
            {rankName ?? '–'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        {passed && nextLevelId ? (
          <Link href={`/play/${nextLevelId}`} replace data-testid="results-next" className={buttonClasses('primary', 'lg', 'w-full sm:flex-1')}>
            Next level
          </Link>
        ) : null}
        <Button
          size="lg"
          variant={passed && nextLevelId ? 'secondary' : 'primary'}
          data-testid="results-retry"
          onClick={onAgain}
          className="w-full sm:flex-1"
        >
          Practise again
        </Button>
        <Link href={`/topics/${topicId}`} data-testid="results-topic" className={buttonClasses('secondary', 'lg', 'w-full sm:flex-1')}>
          Back to topic
        </Link>
      </div>
    </section>
  );
}
