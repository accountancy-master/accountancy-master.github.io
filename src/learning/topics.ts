import type { TopicOutline } from '@/content/types';

/**
 * When each topic was last played: the time of the learner's latest attempt or level result in it. A topic with no
 * attempt and no level result is not in the record. Derived once per load of the learner's events (see
 * app-state/progressLoad.ts) and shared by everything that chooses what to practise.
 */
export type TopicActivity = Readonly<Record<string, number>>;

/** The least an event says about when it happened and where. */
interface TopicEvent {
  topicId: string;
  at: number;
}

const playedAt = (activity: TopicActivity, topicId: string): number | undefined =>
  Object.hasOwn(activity, topicId) ? activity[topicId] : undefined;

export function deriveTopicActivity(attempts: readonly TopicEvent[], levelResults: readonly TopicEvent[]): TopicActivity {
  const out: Record<string, number> = Object.create(null);
  for (const list of [attempts, levelResults]) {
    for (const e of list) {
      if (e.topicId === '' || !Number.isFinite(e.at)) continue;
      if (out[e.topicId] === undefined || e.at > out[e.topicId]) out[e.topicId] = e.at;
    }
  }
  return out;
}

/**
 * The learner's ACTIVE TOPICS: the topics in which they have at least one attempt or level result, in the order of
 * `packs` (which is course order); when there is none, the first topic in course order. Everything that picks
 * practice content (smart practice, the daily mission and challenge, new cards) draws from these and no others.
 * A topic that is not among `packs` (retired, or not playable) never counts.
 */
export function activeTopicIds(packs: readonly Pick<TopicOutline, 'topicId'>[], activity: TopicActivity): string[] {
  if (packs.length === 0) return [];
  const played = packs.filter((p) => playedAt(activity, p.topicId) !== undefined).map((p) => p.topicId);
  return played.length > 0 ? played : [packs[0].topicId];
}

/** The packs of the active topics, in the order of `packs`. */
export function activePacks<P extends Pick<TopicOutline, 'topicId'>>(packs: readonly P[], activity: TopicActivity): P[] {
  const active = new Set(activeTopicIds(packs, activity));
  return packs.filter((p) => active.has(p.topicId));
}

/**
 * The topic the learner played most recently (latest attempt or level result; on a tie the earlier topic in course
 * order), or the first topic in course order when they have played none. Undefined only when there are no packs.
 */
export function mostRecentTopicId(packs: readonly Pick<TopicOutline, 'topicId'>[], activity: TopicActivity): string | undefined {
  let best: { topicId: string; at: number } | undefined;
  for (const p of packs) {
    const at = playedAt(activity, p.topicId);
    if (at !== undefined && (best === undefined || at > best.at)) best = { topicId: p.topicId, at };
  }
  return best?.topicId ?? packs[0]?.topicId;
}
