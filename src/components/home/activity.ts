import { findOutline, topicTitle } from '@/content/outline';
import { dayDiff, dayKey } from '@/learning/gamification';
import type { LevelResult, SessionResult } from '@/storage/types';

export interface ActivityItem {
  id: string;
  at: number;
  title: string;
  detail: string;
  /** Where to do it again. */
  href: string;
  /** Passed, or a session at least half right. */
  good: boolean;
}

const SESSION_TITLE: Record<SessionResult['kind'], string> = {
  smart: 'Smart practice',
  fresh: 'Fresh questions',
  mistakes: 'Mistake review',
  cards: 'Card revision',
  daily_challenge: 'Daily challenge',
  daily_mission: 'Daily mission',
  case: 'Case study',
  mock: 'Mock paper',
  marathon: 'Marathon',
};

const SESSION_HREF: Record<SessionResult['kind'], string> = {
  smart: '/practice/smart',
  fresh: '/practice/fresh',
  mistakes: '/practice/mistakes',
  cards: '/practice/cards',
  daily_challenge: '/practice',
  daily_mission: '/practice',
  case: '/cases',
  mock: '/mock',
  marathon: '/practice/marathon',
};

/**
 * What the learner did last, newest first: levels played (passed or not) and sessions finished. A level is named by
 * its title and topic, a session by its kind and score.
 */
export function recentActivity(levelResults: readonly LevelResult[], sessionResults: readonly SessionResult[], limit = 6): ActivityItem[] {
  const levels = levelResults.map((r): ActivityItem => {
    const level = findOutline(r.topicId)?.levels.find((l) => l.id === r.levelId);
    const name = level ? `level ${level.order}, ${level.title}` : 'a level';
    return {
      id: r.id,
      at: r.at,
      title: `${r.passed ? 'Passed' : 'Played'} ${name}`,
      detail: `${topicTitle(r.topicId)} · ${Math.round(r.score * 100)}%`,
      href: `/play/${r.levelId}`,
      good: r.passed,
    };
  });
  const sessions = sessionResults.map((r): ActivityItem => {
    const marks = r.kind === 'mock' ? `${r.correct} of ${r.total} marks` : `${r.correct} of ${r.total} right`;
    const scope = r.kind === 'marathon' && r.scope && r.scope !== 'all' ? ` · ${topicTitle(r.scope)}` : '';
    return {
      id: r.id,
      at: r.at,
      title: SESSION_TITLE[r.kind],
      detail: `${marks}${scope}`,
      href: SESSION_HREF[r.kind],
      good: r.total === 0 || r.correct / r.total >= 0.5,
    };
  });
  return [...levels, ...sessions].sort((a, b) => b.at - a.at || (a.id < b.id ? -1 : 1)).slice(0, limit);
}

/** "Today", "Yesterday", "3 days ago". */
export function whenText(at: number, today: string): string {
  const days = dayDiff(dayKey(at), today);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
