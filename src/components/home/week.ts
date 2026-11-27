import { dayKey } from '@/learning/gamification';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** A day with XP is never drawn shorter than this share of the chart height. */
const MIN_BAR_PERCENT = 10;

export interface WeekDay {
  /** Local YYYY-MM-DD. */
  day: string;
  label: (typeof WEEKDAY_LABELS)[number];
  xp: number;
  state: 'past' | 'today' | 'future';
}

/** The seven days, Monday to Sunday, of the local week that contains `today` (YYYY-MM-DD). */
export function weekDays(today: string, xpByDay: Record<string, number>): WeekDay[] {
  const [y, m, d] = today.split('-').map(Number);
  const sinceMonday = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return WEEKDAY_LABELS.map((label, i) => {
    const day = dayKey(new Date(y, m - 1, d - sinceMonday + i).getTime());
    return {
      day,
      label,
      xp: xpByDay[day] ?? 0,
      // YYYY-MM-DD strings sort in date order.
      state: day < today ? 'past' : day === today ? 'today' : 'future',
    };
  });
}

/** Bar height as a percentage of the chart: scaled to the largest day, never invisible for a day with XP. */
export function barPercent(xp: number, maxXp: number): number {
  if (xp <= 0 || maxXp <= 0) return 0;
  return Math.max(MIN_BAR_PERCENT, Math.round((xp / maxXp) * 100));
}
