'use client';

import { createContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { COURSE_IDS } from '@/content/catalogue.generated';
import { dayKey } from '@/learning/gamification';
import type { CardState } from '@/learning/cardReview';
import { deriveProgress, type Progress } from '@/learning/progress';
import type { TopicActivity } from '@/learning/topics';
import type { AttemptEvent, CardReviewEvent, LevelResult, SessionResult, WrittenResult } from '@/storage/types';
import { choiceOf, topicShown } from '@/content/courseOptions';
import {
  apartForChoice,
  createLoadCoordinator,
  dayChanged,
  deriveShared,
  eventsOfCourse,
  progressStatus,
  type EventLists,
  type ProgressStatus,
} from './progressLoad';
import { useStore } from './StoreProvider';

/**
 * What the screens read of the selected learner. They are on one course at a time, and everything here is that
 * course's: the events, and the progress derived from them. Only the XP and the streak in `progress` are the
 * learner's own, earned in any course (see `deriveShared`).
 */
export interface ProgressContextValue {
  progress: Progress | null;
  attempts: AttemptEvent[];
  levelResults: LevelResult[];
  cardReviews: CardReviewEvent[];
  sessionResults: SessionResult[];
  /**
   * The learner's written answers (content/written) in the course they are on, of the topics they meet, oldest first.
   * They earn no XP and count towards no mastery: they are kept apart from the events progress is derived from.
   */
  writtenResults: WrittenResult[];
  cardStates: Record<string, CardState>;
  /** When each topic was last played (attempts and level results): which topics are the learner's active ones. */
  activity: TopicActivity;
  /** Local day (YYYY-MM-DD) at which `progress` was derived; null until data is present. */
  today: string | null;
  status: ProgressStatus;
  reload(): Promise<void>;
  /**
   * The progress and the events of the learner in any course, also one they are not on now (Home's course cards,
   * Progress by unit). For the course they are on it is `progress` itself; for another, that course's own, its XP
   * that course's alone. Null until the events are loaded. Worked out once per course and load.
   */
  courseProgress(courseId: string): { progress: Progress; events: EventLists } | null;
}

export const ProgressContext = createContext<ProgressContextValue | null>(null);

interface Loaded extends EventLists {
  profileId: string;
  written: WrittenResult[];
  /** The moment progress was last derived; refreshed on every reload and when a new local day has begun. */
  now: number;
}

const NO_ATTEMPTS: AttemptEvent[] = [];
const NO_LEVEL_RESULTS: LevelResult[] = [];
const NO_CARD_REVIEWS: CardReviewEvent[] = [];
const NO_SESSION_RESULTS: SessionResult[] = [];
const NO_WRITTEN: WrittenResult[] = [];
const NO_CARD_STATES: Record<string, CardState> = {};
const NO_ACTIVITY: TopicActivity = {};

/**
 * Loads the selected profile's stored events once and shares the derived progress with every screen. The events are
 * those of every course the learner has been on; what is shared is derived for the course they are on now, so a
 * change of course (Settings) shows the other course at once, without reading anything again.
 * Must sit inside StoreProvider. `reload()` never rejects; it reloads for all consumers at once.
 * `status`: idle (no profile), loading (first load, or a retry after an error), ready (data present,
 * also during later reloads and when a later reload fails), error (the first load failed; `reload()` retries).
 */
export function ProgressProvider({ children }: { children: ReactNode }) {
  const { store, profile } = useStore();
  const profileId = profile?.id ?? null;
  const courseId = profile?.courseId ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const loads = useRef(createLoadCoordinator());
  // The profile selected right now (null after unmount). A load whose profile is no longer selected is dropped.
  const selected = useRef<string | null>(null);

  // A different learner (also none, and back to the same one) starts from nothing: no earlier data, no earlier failure.
  const [seenProfileId, setSeenProfileId] = useState(profileId);
  if (seenProfileId !== profileId) {
    setSeenProfileId(profileId);
    setLoaded(null);
    setFailedFor(null);
  }

  useLayoutEffect(() => {
    const coordinator = loads.current;
    selected.current = profileId;
    return () => {
      selected.current = null;
      // Anyone still awaiting a reload for this learner is let go.
      if (profileId !== null) coordinator.release(profileId);
    };
  }, [profileId]);

  useEffect(() => {
    const coordinator = loads.current;
    return () => coordinator.releaseAll();
  }, []);

  const load = useCallback(async () => {
    if (profileId === null) return;
    const coordinator = loads.current;
    const ticket = coordinator.begin(profileId);
    const stillWanted = () => selected.current === profileId && coordinator.isCurrent(profileId, ticket);
    // A throw while starting the reads is a failed load too, so the chain starts from a promise.
    await Promise.resolve()
      .then(() =>
        Promise.all([
          store.listAttempts(profileId),
          store.listLevelResults(profileId),
          store.listCardReviews(profileId),
          store.listSessionResults(profileId),
          store.listWrittenResults(profileId),
        ]),
      )
      .then(([attempts, levelResults, cardReviews, sessionResults, written]) => {
        if (!stillWanted()) return;
        setLoaded({ profileId, attempts, levelResults, cardReviews, sessionResults, written, now: Date.now() });
        setFailedFor(null);
      })
      .catch(() => {
        if (stillWanted()) setFailedFor(profileId);
      })
      .finally(() => coordinator.settle(profileId, ticket));
  }, [store, profileId]);

  // What screens call. Resolves once the newest load of this learner has settled, whoever started it. Never rejects.
  const reload = useCallback((): Promise<void> => {
    if (profileId === null) return Promise.resolve();
    // A failure recorded for an earlier load must not show while this one is in flight.
    setFailedFor((f) => (f === profileId ? null : f));
    void load();
    return loads.current.whenSettled(profileId);
  }, [load, profileId]);

  useEffect(() => {
    // load() records failures in `status` and does not reject; the catch only satisfies the effect lint rule.
    load().catch(() => undefined);
  }, [load]);

  // Coming back to a tab left open past midnight: derive again so streaks and day-based numbers are right.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      setLoaded((prev) => (prev !== null && dayChanged(prev.now, now) ? { ...prev, now } : prev));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Data that belongs to a previously selected profile is never exposed.
  const current = loaded !== null && loaded.profileId === profileId ? loaded : null;
  // What was done in a topic of the choice of Part B the learner has not made is kept apart (its XP still counts).
  const choice = choiceOf(profile);
  const seen = useMemo(() => (current && courseId !== null ? apartForChoice(current, courseId, choice) : null), [current, courseId, choice]);
  const derived = useMemo(() => (current && seen && courseId !== null ? deriveShared(seen.lists, current.now, courseId, seen.courseOf) : null), [current, seen, courseId]);

  // Each course's own progress, for the screens that show every course. Two courses: worked out once per load.
  const byCourse = useMemo(() => {
    const out = new Map<string, { progress: Progress; events: EventLists }>();
    if (!current) return out;
    for (const id of COURSE_IDS) {
      if (derived && id === courseId) {
        out.set(id, { progress: derived.progress, events: derived.events });
        continue;
      }
      const events = seen ? eventsOfCourse(seen.lists, id, seen.courseOf) : eventsOfCourse(current, id);
      out.set(id, { progress: deriveProgress(events.attempts, events.levelResults, current.now, events.sessionResults, events.cardReviews), events });
    }
    return out;
  }, [current, seen, derived, courseId]);
  const courseProgress = useCallback((id: string) => byCourse.get(id) ?? null, [byCourse]);
  const written = useMemo(
    () => (current && courseId !== null ? current.written.filter((r) => r.courseId === courseId && topicShown(r.topicId, choice)) : NO_WRITTEN),
    [current, courseId, choice],
  );

  const value = useMemo<ProgressContextValue>(
    () => ({
      progress: derived?.progress ?? null,
      attempts: derived?.events.attempts ?? NO_ATTEMPTS,
      levelResults: derived?.events.levelResults ?? NO_LEVEL_RESULTS,
      cardReviews: derived?.events.cardReviews ?? NO_CARD_REVIEWS,
      sessionResults: derived?.events.sessionResults ?? NO_SESSION_RESULTS,
      writtenResults: written,
      cardStates: derived?.cardStates ?? NO_CARD_STATES,
      activity: derived?.activity ?? NO_ACTIVITY,
      today: current ? dayKey(current.now) : null,
      status: progressStatus({ profileId, hasData: current !== null, failed: failedFor === profileId }),
      reload,
      courseProgress,
    }),
    [derived, written, current, profileId, failedFor, reload, courseProgress],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}
