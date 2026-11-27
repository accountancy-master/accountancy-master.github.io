import { CONFIG } from './config';
import { dayKey } from './gamification';
import { DAY_MS } from './mastery';

export interface ReviewState {
  box: number;
  dueAt: number;
}

/**
 * A review scheduled for some time on a local date is due from the start of that date. A lapse is scheduled for the
 * moment it happened, so it is due at once.
 */
export const dueByDay = (dueAt: number, now: number): boolean => dayKey(dueAt) <= dayKey(now);

export function scheduleReview(prev: ReviewState | undefined, correct: boolean, now: number): ReviewState {
  if (!correct) return { box: 0, dueAt: now };
  // Early practice (before the day the review is due) neither promotes the box nor postpones the review.
  if (prev && !dueByDay(prev.dueAt, now)) return prev;
  const gaps = CONFIG.review.gapsDays;
  const box = prev ? Math.min(prev.box + 1, gaps.length - 1) : 0;
  return { box, dueAt: now + gaps[box] * DAY_MS };
}

export const isDue = (state: ReviewState | undefined, now: number): boolean =>
  state !== undefined && dueByDay(state.dueAt, now);
