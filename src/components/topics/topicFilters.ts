import { normalise } from '@/components/search/searchIndex';
import type { TopicOutline } from '@/content/types';
import { topicMastery, type Progress } from '@/learning/progress';

/** Below this mastery a topic that has been started is a weak one. The same line "Learning" ends at (masteryWord). */
export const WEAK_MASTERY = 40;

export const TOPIC_FILTERS = ['all', 'not-started', 'in-progress', 'weak', 'done'] as const;
export type TopicFilter = (typeof TOPIC_FILTERS)[number];

export const TOPIC_FILTER_LABEL: Record<TopicFilter, string> = {
  all: 'All',
  'not-started': 'Not started',
  'in-progress': 'In progress',
  weak: 'Weak',
  done: 'Done',
};

/** Where a learner stands in a topic. */
export interface TopicStanding {
  /** Levels passed, of `total`. */
  passed: number;
  total: number;
  /** 0 to 100. */
  mastery: number;
  /** Questions answered in it. */
  answered: number;
  /** Something done in it: a level passed, a question answered. */
  started: boolean;
  /** Every level passed. */
  done: boolean;
  /** Started, not done, and mastery below WEAK_MASTERY. */
  weak: boolean;
}

export function topicStanding(outline: Pick<TopicOutline, 'levels' | 'concepts'>, progress: Progress, answered: number): TopicStanding {
  const passedIds = new Set(progress.passedLevelIds);
  const passed = outline.levels.filter((l) => passedIds.has(l.id)).length;
  const total = outline.levels.length;
  const mastery = topicMastery(outline, progress);
  const started = passed > 0 || answered > 0 || outline.concepts.some((c) => progress.concepts[c.id] !== undefined);
  const done = total > 0 && passed === total;
  return { passed, total, mastery, answered, started, done, weak: started && !done && mastery < WEAK_MASTERY };
}

export function matchesFilter(standing: TopicStanding, filter: TopicFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'not-started':
      return !standing.started;
    case 'in-progress':
      return standing.started && !standing.done;
    case 'weak':
      return standing.weak;
    case 'done':
      return standing.done;
  }
}

/** True when every word typed is in one of the texts (a title, a unit, a description, the concepts). */
export function matchesQuery(query: string, texts: readonly string[]): boolean {
  const words = normalise(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise(texts.join(' '));
  return words.every((w) => haystack.includes(w));
}
