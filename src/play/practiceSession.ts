import { loadedPacks } from '@/content/loaded';
import { topicsOfQuestions } from '@/content/outline';
import type { TopicOutline, TopicPack } from '@/content/types';
import type { CardState } from '@/learning/cardReview';
import { dayKey } from '@/learning/gamification';
import {
  availableForLearner,
  everythingIn,
  buildMistakeReview,
  makeSession,
  openMistakeIds,
  planCardSession,
  planDailyChallenge,
  planDailyMission,
  planFreshQuestions,
  planSmartPractice,
  plannedTopics,
  practiceSeed,
  type Planned,
} from '@/learning/practice';
import type { Progress } from '@/learning/progress';
import type { SessionItem } from '@/learning/sessionBuilder';
import { activePacks, activeTopicIds, mostRecentTopicId, type TopicActivity } from '@/learning/topics';
import type { AttemptEvent, SessionResult } from '@/storage/types';
import { kindForMode, type PracticeMode } from './practiceModes';
import { practicePlayCount } from './seed';

/** What a practice session is built from. To plan or count one, the outlines of the packs do (`P` is `TopicOutline`). */
export interface PracticeInput<P extends TopicOutline = TopicPack> {
  /** Every playable pack, in course order. */
  packs: readonly P[];
  progress: Progress;
  attempts: readonly AttemptEvent[];
  sessionResults: readonly SessionResult[];
  cardStates: Record<string, CardState>;
  /** When each topic was last played (see `deriveTopicActivity`): decides which topics are the learner's active ones. */
  activity: TopicActivity;
  now: number;
  /** The device's "unlock all levels" setting; off when left out. */
  unlockAll?: boolean;
  /** For `fresh` only: practise this topic instead of the one played most recently. */
  topicId?: string;
}

/** The modes whose session is chosen from the packs. Mistake review is not: it serves the exact open mistakes. */
export type PlannedMode = Exclude<PracticeMode, 'mistakes'>;

/**
 * What a practice session for this learner would ask right now, before any question is made (see `Planned`): enough
 * to count it, and to know which topics it draws on.
 *
 * Scope: smart practice, the daily mission and the daily challenge draw only from the learner's ACTIVE topics (see
 * `activeTopicIds`), and within them only from what they have played (the items of levels they passed, and ones they
 * already attempted) unless every level is unlocked on this device. Rule cards: those due come from any topic, and
 * cards never seen only from the active topics. Fresh questions come from one topic: `topicId` when given (open whole,
 * whatever has been passed), else the one played most recently (what its levels have opened). Each play of a kind gets its own block of seeds (counted from their attempts and
 * results), and the daily challenge is the same all day. May be empty.
 */
export function planPracticeSession(mode: PlannedMode, input: PracticeInput<TopicOutline>): Planned[] {
  const { packs, progress, attempts, sessionResults, cardStates, activity, now, unlockAll = false } = input;
  const kind = kindForMode(mode);
  const attemptedIds = attempts.map((a) => a.questionId);
  const plays = practicePlayCount(kind, attempts, sessionResults);
  const availableIn = (scope: readonly TopicOutline[]) => availableForLearner(scope, progress.passedLevelIds, attemptedIds, unlockAll);

  switch (mode) {
    case 'smart': {
      const scope = activePacks(packs, activity);
      return planSmartPractice(scope, progress, availableIn(scope), now, practiceSeed('smart', plays));
    }
    case 'fresh': {
      const topicId = input.topicId ?? mostRecentTopicId(packs, activity);
      const pack = packs.find((p) => p.topicId === topicId);
      // A topic the learner chose to practise is open whole, as in the Playground; the topic played most recently
      // serves what its levels have opened.
      const available = input.topicId !== undefined && pack ? everythingIn([pack]) : availableIn(pack ? [pack] : []);
      return pack ? planFreshQuestions(pack, progress, available, practiceSeed('fresh', plays)) : [];
    }
    case 'cards':
      return planCardSession(packs, cardStates, now, activeTopicIds(packs, activity));
    case 'daily': {
      const scope = activePacks(packs, activity);
      return planDailyChallenge(scope, availableIn(scope), dayKey(now));
    }
    case 'mission': {
      const scope = activePacks(packs, activity);
      return planDailyMission(scope, progress, cardStates, availableIn(scope), now, practiceSeed('daily_mission', plays), {
        packs,
        activeTopicIds: activeTopicIds(packs, activity),
      });
    }
  }
}

/**
 * The items of a practice session for this learner right now: the session `planPracticeSession` plans, made from the
 * packs, or for mistake review the exact open mistakes. May be empty.
 */
export function buildPracticeSession(mode: PracticeMode, input: PracticeInput): SessionItem[] {
  return mode === 'mistakes' ? buildMistakeReview(input.progress) : makeSession(planPracticeSession(mode, input), input.packs);
}

/** A practice session that has been chosen and not yet made. */
export interface PracticePlan {
  /** The topics whose content the session needs, in course order: they must be loaded before `make` is called. */
  topicIds: string[];
  /** The items of the session. The same plan always makes the same items. */
  make(): SessionItem[];
}

/**
 * The practice session for this learner right now, chosen from the outlines of the packs, so that nothing has to be
 * loaded to choose it: it says which topics it needs (those of the questions and cards it will serve, for mistake
 * review those of the open mistakes), and makes its items once they are loaded.
 */
export function preparePracticeSession(mode: PracticeMode, input: PracticeInput<TopicOutline>): PracticePlan {
  if (mode === 'mistakes') {
    return { topicIds: topicsOfQuestions(openMistakeIds(input.progress)), make: () => buildMistakeReview(input.progress) };
  }
  const plan = planPracticeSession(mode, input);
  const topicIds = plannedTopics(plan, input.packs);
  return { topicIds, make: () => makeSession(plan, loadedPacks(topicIds)) };
}
