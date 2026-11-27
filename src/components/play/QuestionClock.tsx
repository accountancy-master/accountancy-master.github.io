'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@/play/mockSitting';
import { clockAnnouncement, clockWarns, startQuestionClock, type QuestionClock as RunningClock } from '@/play/questionClock';

const E2E = process.env.NEXT_PUBLIC_E2E === '1';

/**
 * The countdown of one question of a level played against the clock: the time left, and a thin bar along the foot of
 * the header that shortens with it. Mounted afresh for every question, inside the session's header. It ticks by
 * itself, so the question under it is not drawn again four times a second. It waits while the page is hidden (a
 * phone call, another app) and stops for good once `stopped`: an answer was submitted. The time itself is kept in
 * play/questionClock.ts.
 */
export function QuestionClock({ seconds, stopped, onUp }: { seconds: number; stopped: boolean; onUp(): void }) {
  // Whole seconds left; null until the clock has ticked once, so that what a screen reader is told arrives as a change.
  const [ticked, setTicked] = useState<number | null>(null);
  const clock = useRef<RunningClock | null>(null);
  const latestUp = useRef(onUp);
  useEffect(() => {
    latestUp.current = onUp;
  }, [onUp]);

  useEffect(() => {
    const running = startQuestionClock({
      allowedMs: seconds * 1000,
      hidden: document.visibilityState === 'hidden',
      onTick: (leftMs) => setTicked(Math.ceil(leftMs / 1000)),
      onUp: () => latestUp.current(),
    });
    clock.current = running;
    const onVisibility = () => running.setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      running.stop();
    };
  }, [seconds]);
  useEffect(() => {
    if (stopped) clock.current?.stop();
  }, [stopped]);

  const left = ticked ?? seconds;
  const up = left <= 0;
  // A clock that an answer stopped has nothing left to warn about.
  const warning = clockWarns(left) && (!stopped || up);
  const text = formatClock(left * 1000);
  const tone = warning ? 'border-danger bg-danger-soft text-danger-deep' : stopped ? 'border-edge bg-canvas text-muted' : 'border-edge-deep bg-canvas text-ink';

  return (
    <>
      <p
        role="timer"
        aria-label={`Time left for this question: ${text}`}
        data-testid="question-clock"
        data-seconds-left={E2E ? left : undefined}
        data-warning={warning ? 'true' : 'false'}
        className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border-2 px-3 text-lg font-extrabold tabular-nums ${tone}`}
      >
        {/* The last seconds are told by the sign as well as by the colour. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
          {warning ? (
            <path d="M12 3 2.5 20h19L12 3zM12 10v4.5M12 17.5v.01" />
          ) : (
            <>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2M9 2h6" />
            </>
          )}
        </svg>
        <span aria-hidden="true">{text}</span>
      </p>
      {/* Positioned against the header, which is sticky. With reduced motion the bar moves in steps, with the figures. */}
      <div aria-hidden="true" data-testid="question-clock-bar" className="pointer-events-none absolute inset-x-0 bottom-0 h-1">
        <div
          className={`h-full rounded-r-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none ${warning ? 'bg-danger' : stopped ? 'bg-edge-deep' : 'bg-primary'}`}
          style={{ width: `${Math.min(100, Math.max(0, (left / seconds) * 100))}%` }}
        />
      </div>
      <p role="status" className="sr-only">
        {stopped || ticked === null ? '' : clockAnnouncement(left, seconds)}
      </p>
    </>
  );
}
