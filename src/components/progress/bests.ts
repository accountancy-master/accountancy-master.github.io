import type { SessionResult } from '@/storage/types';

export interface PersonalBests {
  /** The most XP earned in one day. */
  bestDayXp: number;
  /** The longest row of right answers in a marathon run. */
  marathonStreak: number;
  /** The best mock paper: marks of marks. */
  mock: { correct: number; total: number } | null;
  /** The best case study played on its own: right of asked. */
  caseStudy: { correct: number; total: number } | null;
}

const better = (a: { correct: number; total: number } | null, b: SessionResult) =>
  b.total > 0 && (a === null || b.correct / b.total > a.correct / a.total) ? { correct: b.correct, total: b.total } : a;

/** The learner's personal bests in a course, from its sessions and their XP by day. */
export function personalBests(sessionResults: readonly SessionResult[], xpByDay: Readonly<Record<string, number>>): PersonalBests {
  let marathonStreak = 0;
  let mock: PersonalBests['mock'] = null;
  let caseStudy: PersonalBests['caseStudy'] = null;
  for (const r of sessionResults) {
    if (r.kind === 'marathon') marathonStreak = Math.max(marathonStreak, r.bestStreak ?? 0);
    else if (r.kind === 'mock') mock = better(mock, r);
    else if (r.kind === 'case') caseStudy = better(caseStudy, r);
  }
  return { bestDayXp: Math.max(0, ...Object.values(xpByDay)), marathonStreak, mock, caseStudy };
}
