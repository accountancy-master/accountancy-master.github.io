'use client';

import { useState } from 'react';
import { E2E_QUESTION_SECONDS_KEY } from '@/components/play/e2eClock';
import { Button } from '@/components/ui/Button';

/**
 * Test-only helper (rendered only in E2E builds): sets how many seconds a timed level gives each question from the
 * next play on, so a test can watch a question run out of time without waiting a minute and a half. Empty puts the
 * level's own time back.
 */
export function E2eChallengeClock() {
  const [seconds, setSeconds] = useState('');
  const [done, setDone] = useState(false);

  const apply = () => {
    try {
      if (seconds.trim() === '') window.localStorage.removeItem(E2E_QUESTION_SECONDS_KEY);
      else window.localStorage.setItem(E2E_QUESTION_SECONDS_KEY, seconds.trim());
      setDone(true);
    } catch {
      // No storage in this page: the clock stays as it is.
    }
  };

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-card border-2 border-dashed border-edge-deep bg-canvas p-4">
      <h2 className="text-lg font-extrabold">Challenge clock</h2>
      <label className="flex flex-col gap-1 text-base font-bold">
        Seconds for each question of a timed level (empty: the level&apos;s own time)
        <input
          type="text"
          inputMode="numeric"
          data-testid="e2e-question-seconds"
          value={seconds}
          onChange={(e) => {
            setSeconds(e.target.value);
            setDone(false);
          }}
          className="min-h-11 rounded-control border-2 border-edge-deep bg-surface px-3 text-base"
        />
      </label>
      <Button variant="secondary" data-testid="e2e-question-seconds-apply" onClick={apply} className="self-start">
        Apply
      </Button>
      {done ? (
        <p data-testid="e2e-question-seconds-done" role="status" className="font-bold text-primary-ink">
          Clock set.
        </p>
      ) : null}
    </section>
  );
}
