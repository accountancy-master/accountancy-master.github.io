import { DEFAULT_COURSE_ID as DEFAULT_COURSE } from '@/content/catalogue.generated';
import { topicShown, type CourseChoice } from '@/content/courseOptions';
import { courseOfTopicId } from '@/content/topicCourses';
import { deriveCardStates, type CardState } from '@/learning/cardReview';
import { dayKey } from '@/learning/gamification';
import { deriveProgress, deriveStreak, type Progress } from '@/learning/progress';
import { deriveTopicActivity, type TopicActivity } from '@/learning/topics';
import type { AttemptEvent, CardReviewEvent, LevelResult, SessionResult } from '@/storage/types';

export type ProgressStatus = 'idle' | 'loading' | 'ready' | 'error';

/** `ready` wins over `failed`: data already on screen stays while a later reload fails. */
export function progressStatus(s: { profileId: string | null; hasData: boolean; failed: boolean }): ProgressStatus {
  if (s.profileId === null) return 'idle';
  if (s.hasData) return 'ready';
  return s.failed ? 'error' : 'loading';
}

/**
 * Tickets for in-flight loads, kept per profile: a newer load of the same profile supersedes an older one,
 * but a stale `reload` captured for another profile can never cancel this profile's load.
 */
export function createLoadTickets() {
  const latest = new Map<string, number>();
  let counter = 0;
  return {
    begin(profileId: string): number {
      latest.set(profileId, ++counter);
      return counter;
    },
    isCurrent(profileId: string, ticket: number): boolean {
      return latest.get(profileId) === ticket;
    },
  };
}

/**
 * Load tickets plus a way to wait for a learner's newest load to settle (succeed or fail).
 * `whenSettled` never rejects. `release` / `releaseAll` free waiters at once (learner deselected, provider gone).
 */
export function createLoadCoordinator() {
  const tickets = createLoadTickets();
  // The newest load of each learner that has not settled yet, and who is waiting for it.
  const pending = new Map<string, number>();
  const waiters = new Map<string, Array<() => void>>();

  function free(profileId: string) {
    pending.delete(profileId);
    const list = waiters.get(profileId) ?? [];
    waiters.delete(profileId);
    for (const resolve of list) resolve();
  }

  return {
    begin(profileId: string): number {
      const ticket = tickets.begin(profileId);
      pending.set(profileId, ticket);
      return ticket;
    },
    isCurrent: tickets.isCurrent,
    /** Call when a load finishes either way. Only the newest load's end releases the waiters. */
    settle(profileId: string, ticket: number): void {
      if (pending.get(profileId) === ticket) free(profileId);
    },
    /** Resolves once the newest load of this learner has settled; at once if none is in flight. */
    whenSettled(profileId: string): Promise<void> {
      if (!pending.has(profileId)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const list = waiters.get(profileId) ?? [];
        list.push(resolve);
        waiters.set(profileId, list);
      });
    },
    release(profileId: string): void {
      free(profileId);
    },
    releaseAll(): void {
      for (const profileId of [...pending.keys(), ...waiters.keys()]) free(profileId);
    },
  };
}

/** The four event lists of one learner. */
export interface EventLists {
  attempts: AttemptEvent[];
  levelResults: LevelResult[];
  cardReviews: CardReviewEvent[];
  sessionResults: SessionResult[];
}

/**
 * The course an event belongs to: the one it names, and for a level result (which names none) the course of its
 * topic. A level result of a topic that is in no course now was made before there was a second course: it belongs
 * to the first.
 */
const courseOfLevelResult = (r: Pick<LevelResult, 'topicId'>, courseOf: (topicId: string) => string | undefined): string => courseOf(r.topicId) ?? DEFAULT_COURSE;

/** The events of one course, each list in its order. `courseOf` says which course a topic belongs to. */
export function eventsOfCourse(lists: EventLists, courseId: string, courseOf: (topicId: string) => string | undefined = courseOfTopicId): EventLists {
  return {
    attempts: lists.attempts.filter((a) => a.courseId === courseId),
    levelResults: lists.levelResults.filter((r) => courseOfLevelResult(r, courseOf) === courseId),
    cardReviews: lists.cardReviews.filter((c) => c.courseId === courseId),
    sessionResults: lists.sessionResults.filter((r) => r.courseId === courseId),
  };
}

/** The courses the learner has events in. */
function coursesOf(lists: EventLists, courseOf: (topicId: string) => string | undefined): Set<string> {
  return new Set([
    ...lists.attempts.map((a) => a.courseId),
    ...lists.levelResults.map((r) => courseOfLevelResult(r, courseOf)),
    ...lists.cardReviews.map((c) => c.courseId),
    ...lists.sessionResults.map((r) => r.courseId),
  ]);
}

/** What the screens read of a learner on a course: their progress, and the events it was derived from. */
export interface Shared {
  progress: Progress;
  cardStates: Record<string, CardState>;
  activity: TopicActivity;
  /** The learner's events of the course: what every screen lists, counts and takes its seeds from. */
  events: EventLists;
}

/**
 * Everything the screens read, derived from the events at `now`, for a learner on the course `courseId`.
 *
 * A learner is on one course at a time, and what they see is that course's: mastery, passed levels, mistakes, the
 * daily mission and challenge, what practice draws on, personal bests and the history of sessions all come from the
 * events of that course alone. Two things are the learner's own, whatever course they are on: their XP (the XP of
 * every course added up, day by day, so the daily goal counts everything done that day) and their streak (a day
 * counts when anything was done on it). Changing course removes nothing: the events of the other course stay
 * where they are, and this gives its progress back exactly as it was.
 */
export function deriveShared(lists: EventLists, now: number, courseId: string = DEFAULT_COURSE, courseOf: (topicId: string) => string | undefined = courseOfTopicId): Shared {
  const courses = coursesOf(lists, courseOf);
  // A learner who has only ever been on this course: everything is theirs as it is.
  const single = [...courses].every((id) => id === courseId);
  const events = single ? lists : eventsOfCourse(lists, courseId, courseOf);
  const own = deriveProgress(events.attempts, events.levelResults, now, events.sessionResults, events.cardReviews);
  let progress = own;
  if (!single) {
    // The XP of the other courses, each derived on its own, so that a question, a level and a daily bonus earn in
    // their own course what they would have earned had the learner never been on another.
    let xp = own.xp;
    const xpByDay = { ...own.xpByDay };
    for (const other of courses) {
      if (other === courseId) continue;
      const theirs = eventsOfCourse(lists, other, courseOf);
      const there = deriveProgress(theirs.attempts, theirs.levelResults, now, theirs.sessionResults, theirs.cardReviews);
      xp += there.xp;
      for (const [day, earned] of Object.entries(there.xpByDay)) xpByDay[day] = (xpByDay[day] ?? 0) + earned;
    }
    progress = { ...own, xp, xpByDay, streak: deriveStreak(lists.attempts, lists.cardReviews) };
  }
  return {
    activity: deriveTopicActivity(events.attempts, events.levelResults),
    progress,
    cardStates: deriveCardStates(events.cardReviews),
    events,
  };
}

/**
 * The events of a learner as their choice of Part B of Class 12 (content/courseOptions.ts) has them seen: what was
 * done in a topic of the choice not made is kept apart, under a course of its own, so that the course's mastery,
 * passed levels, mistakes, practice and the rest are those of the topics the learner meets, while the XP and the
 * streak, which are the learner's whatever they did, still count it (`deriveShared` adds up the XP of every course).
 * A learner with nothing in such a topic, and every learner on the default choice who never took the other, gets the
 * lists back exactly as they were.
 */
export function apartForChoice(
  lists: EventLists,
  courseId: string,
  choice: CourseChoice,
  courseOf: (topicId: string) => string | undefined = courseOfTopicId,
): { lists: EventLists; courseOf: (topicId: string) => string | undefined } {
  const hidden = (topicId: string) => courseOf(topicId) === courseId && !topicShown(topicId, choice);
  const any = lists.attempts.some((a) => hidden(a.topicId)) || lists.levelResults.some((r) => hidden(r.topicId)) || lists.cardReviews.some((c) => hidden(c.topicId));
  if (!any) return { lists, courseOf };
  const apart = `${courseId}${OTHER_CHOICE}`;
  return {
    lists: {
      attempts: lists.attempts.map((a) => (hidden(a.topicId) ? { ...a, courseId: apart } : a)),
      levelResults: lists.levelResults,
      cardReviews: lists.cardReviews.map((c) => (hidden(c.topicId) ? { ...c, courseId: apart } : c)),
      sessionResults: lists.sessionResults,
    },
    courseOf: (topicId) => (hidden(topicId) ? apart : courseOf(topicId)),
  };
}

/** What marks the course under which `apartForChoice` keeps the work of the choice not made. */
const OTHER_CHOICE = '#other-part-b';

/** True when `later` falls on a different local day than `earlier`. */
export const dayChanged = (earlier: number, later: number): boolean => dayKey(earlier) !== dayKey(later);
