import { topicTitle } from '@/content/outline';
import type { LevelOutline, TopicOutline } from '@/content/types';
import { CONFIG } from './config';
import { countDueCards, type CardState } from './cardReview';
import { levelUnlocked, type Progress } from './progress';
import { openMistakeIds } from './practice';
import type { TopicActivity } from './topics';

export interface Recommendation {
  kind: 'mistakes' | 'cards' | 'level' | 'smart';
  reason: string;
  href: string;
}

export { topicTitle };

/** The first level of the pack that is not passed and may be played, in level order. */
function firstOpenLevel(pack: TopicOutline, passedIds: string[], passed: ReadonlySet<string>, unlockAll: boolean): LevelOutline | undefined {
  const levels = [...pack.levels].sort((a, b) => a.order - b.order);
  return levels.find((l) => !passed.has(l.id) && levelUnlocked(l, levels, passedIds, unlockAll));
}

/** Why the next step is the one it is: see `nextStep`. */
export type NextStepWhy = 'start' | 'continue' | 'next-topic';

export interface NextStep {
  pack: TopicOutline;
  level: LevelOutline;
  why: NextStepWhy;
  /** Levels of the topic passed, and its levels in all. */
  passed: number;
  total: number;
}

/**
 * Where to carry on, in the order of the course and as far as the learner has got:
 *
 * - a topic the learner is part-way through (a level of it played or passed, a level of it still to pass): its first
 *   level not passed. Of two such topics, the one whose ladder was played most recently (`levelActivity`), and of
 *   two played as recently (or with no time known) the earlier in the course;
 * - otherwise the earliest topic in course order with a level not passed: its first such level.
 *
 * Only the ladders count: a case study, practice, the playground or a marathon in another topic never moves the next
 * step there. `packs` are the playable packs in course order; `levelActivity` says when a level of each topic was
 * last played (level results only). Undefined when every level is passed.
 */
export function nextStep(
  packs: readonly TopicOutline[],
  passedLevelIds: string[],
  unlockAll = false,
  levelActivity: TopicActivity = {},
): NextStep | undefined {
  const passed = new Set(passedLevelIds);
  const at = (topicId: string) => (Object.hasOwn(levelActivity, topicId) ? levelActivity[topicId] : -Infinity);
  let best: { step: NextStep; at: number } | undefined;
  let first: NextStep | undefined;
  for (const pack of packs) {
    const level = firstOpenLevel(pack, passedLevelIds, passed, unlockAll);
    if (!level) continue;
    const done = pack.levels.filter((l) => passed.has(l.id)).length;
    const step: NextStep = { pack, level, why: 'next-topic', passed: done, total: pack.levels.length };
    first ??= step;
    const started = done > 0 || Object.hasOwn(levelActivity, pack.topicId);
    if (started && (!best || at(pack.topicId) > best.at)) best = { step: { ...step, why: 'continue' }, at: at(pack.topicId) };
  }
  if (best) return best.step;
  if (!first) return undefined;
  // Nothing played on any ladder and nothing passed: the very start of the course.
  const fresh = passedLevelIds.length === 0 && packs.every((p) => !Object.hasOwn(levelActivity, p.topicId));
  return fresh ? { ...first, why: 'start' } : first;
}

/** The level of `nextStep`, with its topic. */
export function nextLevel(
  packs: readonly TopicOutline[],
  passedLevelIds: string[],
  unlockAll = false,
  levelActivity: TopicActivity = {},
): { pack: TopicOutline; level: LevelOutline } | undefined {
  const step = nextStep(packs, passedLevelIds, unlockAll, levelActivity);
  return step && { pack: step.pack, level: step.level };
}

/** The text with a full stop at the end, unless it already ends with punctuation (a title like "Which Side?"). */
const endSentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** What to suggest next: pending mistakes, due cards, the next level, or smart practice, in that order. */
export function recommendNext(input: {
  packs: readonly TopicOutline[];
  progress: Progress;
  states: Record<string, CardState>;
  /** When a level of each topic was last played (level results only): see `nextStep`. */
  levelActivity?: TopicActivity;
  now: number;
  unlockAll?: boolean;
}): Recommendation {
  const { packs, progress, states, levelActivity = {}, now, unlockAll = false } = input;

  const mistakes = openMistakeIds(progress).length;
  if (mistakes >= CONFIG.practice.recommend.mistakes) {
    return { kind: 'mistakes', reason: `You have ${mistakes} mistakes waiting to be put right.`, href: '/practice/mistakes' };
  }

  const due = countDueCards(packs.flatMap((p) => p.cards), states, now);
  if (due >= CONFIG.practice.recommend.dueCards) {
    return { kind: 'cards', reason: `${due} rule cards are due for revision.`, href: '/practice/cards' };
  }

  // A learner who has passed nothing gets the first level here, never practice (which has nothing to serve yet).
  const next = nextLevel(packs, progress.passedLevelIds, unlockAll, levelActivity);
  if (next) {
    return {
      kind: 'level',
      reason: `Next in ${topicTitle(next.pack.topicId)}: ${endSentence(next.level.title)}`,
      href: `/play/${next.level.id}`,
    };
  }

  return { kind: 'smart', reason: 'Keep your weakest ideas fresh.', href: '/practice/smart' };
}
