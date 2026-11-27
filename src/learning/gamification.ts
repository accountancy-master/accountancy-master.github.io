import type { Difficulty } from '@/content/types';
import { partsOfCode } from '@/exercises/codes';
import { CONFIG } from './config';
import { DAY_MS, hintFactor } from './mastery';

/**
 * The share of a long answer that earns partial XP (see `CONFIG.xp.partial`): the parts right over all the parts, read
 * from its mistake code, when the answer is not right and at least the minimum share of it is. Null otherwise.
 */
export function partialShare(a: { correct: boolean; mistakeCode?: string }): number | null {
  if (a.correct) return null;
  const parts = partsOfCode(a.mistakeCode);
  if (!parts || parts.total === 0 || parts.right >= parts.total) return null;
  const share = parts.right / parts.total;
  return share >= CONFIG.xp.partial.minShare ? share : null;
}

/**
 * The XP an answer earns. `repeat` marks a correct answer to a question (authored or generated) that was already
 * answered correctly before: it earns the replay share. A long answer that is not right earns partial XP (in
 * proportion to its parts that are right, at least 1) only when it is the first answer to its question (`firstTry`).
 */
export function xpForAttempt(
  a: { correct: boolean; difficulty: Difficulty; hintsUsed: number; mistakeCode?: string },
  repeat = false,
  firstTry = true,
): number {
  const hinted = Math.round(CONFIG.xp.perCorrect[a.difficulty] * hintFactor(a.hintsUsed));
  if (!a.correct) {
    const share = firstTry ? partialShare(a) : null;
    return share === null || hinted === 0 ? 0 : Math.max(1, Math.round(hinted * share));
  }
  if (!repeat || hinted === 0) return hinted;
  return Math.max(1, Math.round(hinted * CONFIG.xp.repeatFactor));
}

export function rankFor(xp: number): { name: string; xp: number; next?: { name: string; xp: number } } {
  const ranks = CONFIG.ranks;
  let i = 0;
  while (i + 1 < ranks.length && ranks[i + 1].xp <= xp) i++;
  const next = ranks[i + 1];
  return next ? { ...ranks[i], next: { ...next } } : { ...ranks[i] };
}

export interface Streak {
  count: number;
  lastDay: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const utc = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const dayDiff = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DAY_MS);

const MAX_GAP = 1 + CONFIG.streak.forgivenMissedDays;

export function updateStreak(s: Streak, day: string): Streak {
  if (s.lastDay === day) return s;
  if (s.lastDay === null) return { count: 1, lastDay: day };
  if (dayDiff(s.lastDay, day) <= 0) return s;
  return { count: dayDiff(s.lastDay, day) <= MAX_GAP ? s.count + 1 : 1, lastDay: day };
}

export function currentStreak(s: Streak, today: string): number {
  if (s.lastDay === null) return 0;
  if (dayDiff(s.lastDay, today) <= 0) return s.count;
  return dayDiff(s.lastDay, today) <= MAX_GAP ? s.count : 0;
}
