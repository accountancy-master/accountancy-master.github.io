'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useProgress } from '@/app-state/useProgress';
import { Button, buttonClasses } from '@/components/ui/Button';
import { CONFIG } from '@/learning/config';
import { rankFor } from '@/learning/gamification';
import type { PracticeMode } from '@/play/practiceModes';

/** What was played: a practice mode, or one whole case from the Case studies screen. */
type ResultsMode = PracticeMode | 'case';

const HEADING: Record<ResultsMode, string> = {
  smart: 'Practice complete',
  fresh: 'Practice complete',
  mistakes: 'Mistakes reviewed',
  cards: 'Cards revised',
  daily: 'Daily challenge complete',
  mission: 'Daily mission complete',
  case: 'Case study complete',
};

const BONUS = {
  mission: { label: 'Daily mission bonus', xp: CONFIG.xp.dailyMissionBonus },
  daily: { label: 'Daily challenge bonus', xp: CONFIG.xp.dailyChallengeBonus },
} as const;

const HOME_HREF = '/home';

/** Results of a practice session: questions correct, XP gained (with any daily bonus) and what to do next. */
export function PracticeResults({
  mode,
  correct,
  total,
  cardsRated,
  xpBefore,
  resultId,
  bonusDaysBefore,
  backTo,
  againLabel = 'Practise again',
  onAgain,
}: {
  mode: ResultsMode;
  correct: number;
  total: number;
  cardsRated: number;
  xpBefore: number;
  /** Id of this session's `SessionResult`. */
  resultId: string;
  /** The days on which this kind's bonus had been earned before the session (mission or challenge). */
  bonusDaysBefore: readonly string[];
  /** Where "back" goes when not home (practice of one topic goes back to the topic). */
  backTo?: { href: string; label: string; testId: string };
  /** What the button that starts another session says. */
  againLabel?: string;
  onAgain(): void;
}) {
  const { progress, sessionResults } = useProgress();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // Only a total that already includes this session's result is shown; never a guess in between.
  const result = sessionResults.find((r) => r.id === resultId);
  const saved = progress !== null && result !== undefined;
  const bonus = mode === 'mission' || mode === 'daily' ? BONUS[mode] : null;
  // The bonus needs at least half of the scored questions right; a session with none scored always earns it.
  const goodEnough = total === 0 || correct / total >= CONFIG.xp.bonusMinScore;
  const bonusDay = saved && bonus !== null;
  const bonusAlready = bonusDay && bonusDaysBefore.includes(result.day);
  const bonusEarned = bonusDay && !bonusAlready && goodEnough;
  const bonusMissed = bonusDay && !bonusAlready && !goodEnough;
  // The daily challenge is a once-a-day set, so it offers no second go once it has been completed today.
  const canAgain = !(mode === 'daily' && saved && progress.challengeDoneDays.includes(result.day));

  return (
    <section data-testid="results" aria-labelledby="results-heading" className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-card border-2 border-b-4 border-primary bg-primary-soft p-6 text-center">
        <h1
          id="results-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-extrabold tracking-tight text-primary-ink outline-none"
        >
          {HEADING[mode]}
        </h1>
        {total > 0 ? (
          <p data-testid="results-score" className="text-xl font-bold">
            {correct} of {total} correct
          </p>
        ) : null}
        {cardsRated > 0 ? (
          <p data-testid="results-cards" className="text-xl font-bold">
            {cardsRated} {cardsRated === 1 ? 'card' : 'cards'} revised
          </p>
        ) : null}
        {bonusEarned ? (
          <p
            data-testid="results-bonus"
            className="inline-flex min-h-8 items-center rounded-full bg-accent px-4 text-base font-extrabold text-on-accent"
          >
            {bonus.label} +{bonus.xp} XP
          </p>
        ) : null}
        {bonusMissed ? (
          <p data-testid="results-bonus-missed" className="text-base font-bold text-muted">
            Get at least half right to earn the bonus
          </p>
        ) : null}
        {bonusAlready ? (
          <p data-testid="results-bonus-done" className="text-base font-bold text-muted">
            Bonus already earned today
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="flex flex-col-reverse rounded-card border-2 border-b-4 border-edge bg-surface p-3 text-center">
          <dt className="text-sm font-bold text-muted">XP gained</dt>
          <dd data-testid="results-xp" className="text-2xl font-extrabold text-accent-ink">
            {saved ? `+${progress.xp - xpBefore} XP` : '–'}
          </dd>
        </div>
        <div className="flex flex-col-reverse rounded-card border-2 border-b-4 border-edge bg-surface p-3 text-center">
          <dt className="text-sm font-bold text-muted">Your rank</dt>
          <dd data-testid="results-rank" className="text-2xl font-extrabold">
            {saved ? rankFor(progress.xp).name : '–'}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        {canAgain ? (
          <Button size="lg" data-testid="results-retry" onClick={onAgain} className="w-full sm:flex-1">
            {againLabel}
          </Button>
        ) : null}
        <Link
          href={backTo?.href ?? HOME_HREF}
          data-testid={backTo?.testId ?? 'results-home'}
          className={buttonClasses(canAgain ? 'secondary' : 'primary', 'lg', 'w-full sm:flex-1')}
        >
          {backTo?.label ?? 'Back to home'}
        </Link>
      </div>
    </section>
  );
}
