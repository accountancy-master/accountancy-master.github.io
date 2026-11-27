import { topicStanding, type TopicStanding } from '@/components/topics/topicFilters';
import type { TopicMeta, TopicOutline } from '@/content/types';
import type { Progress } from '@/learning/progress';

/** Questions answered in each topic, from a list of attempts. */
export function answeredByTopic(attempts: readonly { topicId: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of attempts) out.set(a.topicId, (out.get(a.topicId) ?? 0) + 1);
  return out;
}

export interface CourseSummary {
  /** Playable topics. */
  topics: number;
  started: number;
  done: number;
  levelsPassed: number;
  levels: number;
  /** The average mastery of its playable topics, 0 to 100. */
  mastery: number;
}

/** Where a learner stands in a course: its playable topics (outlines) and their progress in it. */
export function courseSummary(outlines: readonly TopicOutline[], progress: Progress, answered: ReadonlyMap<string, number>): CourseSummary {
  const standings = outlines.map((o) => topicStanding(o, progress, answered.get(o.topicId) ?? 0));
  return {
    topics: outlines.length,
    started: standings.filter((s) => s.started).length,
    done: standings.filter((s) => s.done).length,
    levelsPassed: standings.reduce((n, s) => n + s.passed, 0),
    levels: standings.reduce((n, s) => n + s.total, 0),
    mastery: standings.length === 0 ? 0 : Math.round(standings.reduce((n, s) => n + s.mastery, 0) / standings.length),
  };
}

export interface UnitBar {
  unit: string;
  topics: { topic: TopicMeta; standing: TopicStanding }[];
  /** The average mastery of its topics. */
  mastery: number;
  levelsPassed: number;
  levels: number;
}

/** The playable topics of a course by unit, in catalogue order, each unit with its average mastery and its levels. */
export function unitBars(topics: readonly TopicMeta[], outlines: readonly TopicOutline[], progress: Progress, answered: ReadonlyMap<string, number>): UnitBar[] {
  const out: UnitBar[] = [];
  for (const topic of topics) {
    const outline = outlines.find((o) => o.topicId === topic.id);
    if (!outline) continue;
    const standing = topicStanding(outline, progress, answered.get(topic.id) ?? 0);
    let bar = out.find((b) => b.unit === topic.unit);
    if (!bar) out.push((bar = { unit: topic.unit, topics: [], mastery: 0, levelsPassed: 0, levels: 0 }));
    bar.topics.push({ topic, standing });
    bar.levelsPassed += standing.passed;
    bar.levels += standing.total;
  }
  for (const bar of out) bar.mastery = Math.round(bar.topics.reduce((n, t) => n + t.standing.mastery, 0) / bar.topics.length);
  return out;
}

export interface WeakIdea {
  conceptId: string;
  title: string;
  topicId: string;
  mastery: number;
}

/**
 * The ideas the learner is weakest in: concepts they have practised (a mastery is recorded), lowest mastery first, and
 * of two equally weak the earlier in the course. Ideas not met yet are not weak, only new.
 */
export function weakestIdeas(outlines: readonly TopicOutline[], progress: Progress, limit = 6): WeakIdea[] {
  const ideas: (WeakIdea & { i: number })[] = [];
  let i = 0;
  for (const o of outlines) {
    for (const c of o.concepts) {
      const seen = progress.concepts[c.id];
      if (seen) ideas.push({ conceptId: c.id, title: c.title, topicId: o.topicId, mastery: Math.round(seen.mastery), i });
      i++;
    }
  }
  return ideas
    .sort((a, b) => a.mastery - b.mastery || a.i - b.i)
    .slice(0, limit)
    .map(({ conceptId, title, topicId, mastery }) => ({ conceptId, title, topicId, mastery }));
}
