import { dayKey } from '@/learning/gamification';
import { MARATHON_ALL } from '@/learning/marathon';
import type { AttemptEvent, SessionResult } from '@/storage/types';

// ---------------------------------------------------------------------------------------------------------------
// A marathon run as it is counted, recorded and compared with the runs before it.
// ---------------------------------------------------------------------------------------------------------------

/** The running count of a marathon. */
export interface Tally {
  answered: number;
  correct: number;
  /** Correct answers in a row up to now. */
  streak: number;
  /** The longest such row of the run. */
  bestStreak: number;
}

export function tallyOf(answers: readonly { correct: boolean }[]): Tally {
  const tally: Tally = { answered: 0, correct: 0, streak: 0, bestStreak: 0 };
  for (const a of answers) {
    tally.answered++;
    if (a.correct) {
      tally.correct++;
      tally.streak++;
      tally.bestStreak = Math.max(tally.bestStreak, tally.streak);
    } else {
      tally.streak = 0;
    }
  }
  return tally;
}

/** Correct answers as a whole percentage of the answers given; nothing answered is 0. */
export const accuracyOf = (correct: number, answered: number): number => (answered > 0 ? Math.round((correct / answered) * 100) : 0);

const two = (n: number) => String(n).padStart(2, '0');

/** Time gone by, counting up: "0:07", "12:05", "1:02:03". Only whole seconds that have passed count. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** How a run went concept by concept, in the order the concepts first came up. */
export interface ConceptAccuracy {
  conceptId: string;
  answered: number;
  correct: number;
}

export function accuracyByConcept(answers: readonly { conceptId: string; correct: boolean }[]): ConceptAccuracy[] {
  const out: ConceptAccuracy[] = [];
  for (const a of answers) {
    let row = out.find((r) => r.conceptId === a.conceptId);
    if (!row) out.push((row = { conceptId: a.conceptId, answered: 0, correct: 0 }));
    row.answered++;
    if (a.correct) row.correct++;
  }
  return out;
}

/**
 * The concept to point out after a run: the one with the smallest share right among those that had a miss, and of
 * two level the one with more misses. Undefined when nothing was missed.
 */
export function weakestConcept(rows: readonly ConceptAccuracy[]): ConceptAccuracy | undefined {
  return rows
    .filter((r) => r.correct < r.answered)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.correct / a.r.answered - b.r.correct / b.r.answered || b.r.answered - b.r.correct - (a.r.answered - a.r.correct) || a.i - b.i)[0]?.r;
}

// ---------------------------------------------------------------------------------------------------------------
// The record of a run, and the personal bests read from the records.
// ---------------------------------------------------------------------------------------------------------------

/** The id of the session result of a run. It follows from the session, so a run can never be recorded twice. */
export const marathonResultId = (sessionId: string): string => `marathon:${sessionId}`;

/** The session result of a run that was stopped at `at` after `timeMs`. */
export function marathonResult(input: {
  profile: { id: string; courseId: string };
  sessionId: string;
  /** The topic of the run, or `MARATHON_ALL`. */
  scope: string;
  tally: Tally;
  timeMs: number;
  at: number;
}): SessionResult {
  const { profile, sessionId, scope, tally, timeMs, at } = input;
  return {
    id: marathonResultId(sessionId),
    profileId: profile.id,
    courseId: profile.courseId,
    kind: 'marathon',
    sessionId,
    day: dayKey(at),
    correct: tally.correct,
    total: tally.answered,
    at,
    scope,
    bestStreak: tally.bestStreak,
    timeMs: Math.max(0, Math.round(timeMs)),
  };
}

/**
 * The runs that were never stopped (the app was closed in the middle): for each marathon session among the attempts
 * that has no session result, the result its answers give. Every answer was stored as it was given, so nothing of
 * the run is lost; it ended with its last answer, it took from its first answer to its last, and it was a run of
 * one topic when all its questions came from one topic, else of all the topics played.
 */
export function unrecordedMarathons(
  attempts: readonly Pick<AttemptEvent, 'sessionId' | 'sessionKind' | 'topicId' | 'correct' | 'at' | 'profileId' | 'courseId'>[],
  results: readonly Pick<SessionResult, 'id'>[],
): SessionResult[] {
  const recorded = new Set(results.map((r) => r.id));
  const runs = new Map<string, typeof attempts[number][]>();
  for (const a of attempts) {
    if (a.sessionKind !== 'marathon' || recorded.has(marathonResultId(a.sessionId))) continue;
    runs.set(a.sessionId, [...(runs.get(a.sessionId) ?? []), a]);
  }
  return [...runs.entries()].map(([sessionId, answers]) => {
    const inOrder = [...answers].sort((a, b) => a.at - b.at);
    const topics = new Set(inOrder.map((a) => a.topicId));
    const first = inOrder[0];
    const last = inOrder[inOrder.length - 1];
    return marathonResult({
      profile: { id: first.profileId, courseId: first.courseId },
      sessionId,
      scope: topics.size === 1 ? first.topicId : MARATHON_ALL,
      tally: tallyOf(inOrder),
      timeMs: last.at - first.at,
      at: last.at,
    });
  });
}

/** The best a learner has done in the runs of one scope. */
export interface MarathonBest {
  /** The most questions answered in one run. */
  answered: number;
  /** The longest row of correct answers in one run. */
  streak: number;
}

/**
 * Personal bests by scope (a topic id, or `MARATHON_ALL`), from the stored session results. A scope never run is left out.
 * They are per topic whatever the run was made of: a run that kept to some of its topic's subtopics is recorded under
 * the topic like any other, and counts towards the topic's bests.
 */
export function personalBests(results: readonly Pick<SessionResult, 'kind' | 'total' | 'scope' | 'bestStreak'>[]): Record<string, MarathonBest> {
  const out: Record<string, MarathonBest> = Object.create(null);
  for (const r of results) {
    if (r.kind !== 'marathon' || r.scope === undefined || r.total <= 0) continue;
    const best = (out[r.scope] ??= { answered: 0, streak: 0 });
    best.answered = Math.max(best.answered, r.total);
    best.streak = Math.max(best.streak, r.bestStreak ?? 0);
  }
  return out;
}

/** Which of its scope's bests a run beat. A first run sets both, as long as it has anything to show. */
export function newBests(before: MarathonBest | undefined, tally: Pick<Tally, 'answered' | 'bestStreak'>): { answered: boolean; streak: boolean } {
  return {
    answered: tally.answered > (before?.answered ?? 0),
    streak: tally.bestStreak > (before?.streak ?? 0),
  };
}
