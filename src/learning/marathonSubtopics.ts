import { STAGES } from '@/content/outline';
import type { QuestionOutline, TopicOutline } from '@/content/types';
import { marathonPool, type MarathonPool } from './marathon';
import { availableForLearner, type Available } from './practice';

// ---------------------------------------------------------------------------------------------------------------
// Subtopics of a marathon: a run over one topic can keep to some of the topic's concepts. The learner ticks them on
// the Marathon screen, the choice is remembered on the device, and the run is told through the address
// (`/practice/marathon/ledger?subtopics=led-posting,led-balancing`). A run over all the topics played has no such
// choice.
// ---------------------------------------------------------------------------------------------------------------

/** How many of a subtopic's generators (or authored questions) a marathon may serve this learner now, and how many it has. */
export interface SubtopicCount {
  open: number;
  all: number;
}

/** A concept of a topic as the Marathon screen offers it. */
export interface MarathonSubtopic {
  id: string;
  title: string;
  /** Its question generators (templates). */
  generators: SubtopicCount;
  /** Its authored questions. */
  questions: SubtopicCount;
  /** False while a marathon has nothing of it to serve this learner: it is shown, but cannot be ticked. */
  ready: boolean;
}

const countByConcept = (pool: MarathonPool<QuestionOutline>) => {
  const count = (items: readonly { conceptId: string }[]) => {
    const out = new Map<string, number>();
    for (const item of items) out.set(item.conceptId, (out.get(item.conceptId) ?? 0) + 1);
    return out;
  };
  return { generators: count(pool.templates), questions: count(pool.questions) };
};

/**
 * The subtopics of a topic in the order of its pack, each with what a marathon may serve of it: counted from the
 * same pool a run is made from (`marathonPool`), for this learner (`available`, which already applies "unlock all
 * levels") and with everything the topic's levels list.
 */
export function marathonSubtopics(pack: TopicOutline, available: Available): MarathonSubtopic[] {
  const open = countByConcept(marathonPool([pack], available));
  const all = countByConcept(marathonPool([pack], availableForLearner([pack], [], [], true)));
  // The concepts that case-study levels add to a pack. A marathon never serves a question of a case, so they are not offered.
  const caseConcepts = new Set(STAGES.map((s) => s.conceptId));
  return pack.concepts
    .filter((c) => !caseConcepts.has(c.id))
    .map((c) => {
      const generators = { open: open.generators.get(c.id) ?? 0, all: all.generators.get(c.id) ?? 0 };
      const questions = { open: open.questions.get(c.id) ?? 0, all: all.questions.get(c.id) ?? 0 };
      return { id: c.id, title: c.title, generators, questions, ready: generators.open + questions.open > 0 };
    });
}

// ---------------------------------------------------------------------------------------------------------------
// The choice, as it is remembered on the device (the way "unlock all levels" is: see deviceSettings.ts).
// ---------------------------------------------------------------------------------------------------------------

/** localStorage key of the subtopics the learner has left out of a marathon, by topic: `{"ledger":["led-errors"]}`. */
export const MARATHON_SUBTOPICS_KEY = 'am.marathonSubtopics';

/**
 * The subtopic ids left out (unticked), by topic id. Only what was unticked is kept, so everything else is ticked:
 * a topic never set up, and a subtopic added to a topic after its choice was saved.
 */
export type SubtopicChoices = Readonly<Record<string, readonly string[]>>;

const noChoices = (): Record<string, string[]> => Object.create(null);

/** The choices from what is stored. Nothing stored, or anything that is not what `subtopicChoicesToStored` writes, is no choice. */
export function subtopicChoicesFromStored(raw: string | null | undefined): SubtopicChoices {
  const out = noChoices();
  if (!raw) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out;
  for (const [topicId, off] of Object.entries(parsed)) {
    if (!Array.isArray(off)) continue;
    const ids = [...new Set(off.filter((id): id is string => typeof id === 'string' && id !== ''))];
    if (ids.length > 0) out[topicId] = ids;
  }
  return out;
}

export const subtopicChoicesToStored = (choices: SubtopicChoices): string => JSON.stringify(choices);

/** The choices with one topic's set anew: `off` are the subtopics left out of it. Leaving none out forgets the topic. */
export function withSubtopicChoice(choices: SubtopicChoices, topicId: string, off: Iterable<string>): SubtopicChoices {
  const out = noChoices();
  for (const [id, ids] of Object.entries(choices)) if (id !== topicId) out[id] = [...ids];
  const ids = [...new Set(off)];
  if (ids.length > 0) out[topicId] = ids;
  return out;
}

/** The subtopics left out of a topic. */
export const subtopicsOff = (choices: SubtopicChoices, topicId: string): readonly string[] =>
  Object.hasOwn(choices, topicId) ? choices[topicId] : [];

/** The subtopics that are ticked: every one that has something to serve and was not left out, in the order shown. */
export function tickedSubtopics(subtopics: readonly MarathonSubtopic[], off: Iterable<string>): string[] {
  const out = new Set(off);
  return subtopics.filter((s) => s.ready && !out.has(s.id)).map((s) => s.id);
}

// ---------------------------------------------------------------------------------------------------------------
// The choice, as a run gets it.
// ---------------------------------------------------------------------------------------------------------------

/** The query parameter that names the subtopics of a run. It is left out when the run is over the whole topic. */
export const SUBTOPICS_PARAM = 'subtopics';

/**
 * The query value for the ticked subtopics; null when every subtopic that can be ticked is (the address is then the
 * one a marathon has always had), and also when none is, for there is no such run.
 */
export function subtopicsToQuery(subtopics: readonly MarathonSubtopic[], ticked: readonly string[]): string | null {
  const ready = subtopics.filter((s) => s.ready);
  const chosen = ready.filter((s) => ticked.includes(s.id));
  return chosen.length === 0 || chosen.length === ready.length ? null : chosen.map((s) => encodeURIComponent(s.id)).join(',');
}

/** The subtopic ids a query value names (as `useSearchParams` gives it, already decoded); null when there is no value. */
export const subtopicsFromQuery = (value: string | null | undefined): string[] | null =>
  value === null || value === undefined ? null : value.split(',').filter((id) => id !== '');

/**
 * The subtopics a run keeps to, from the ids it was asked for: those of them that are subtopics of the topic with
 * something to serve, in the order of the topic. Null is the whole topic: nothing was asked for, every subtopic that
 * can be served was, or none of what was asked for can be served (an old address, a subtopic that has since been
 * locked again). So a run is never left with nothing to ask because of its subtopics.
 */
export function chosenSubtopics(subtopics: readonly MarathonSubtopic[], asked: readonly string[] | null): string[] | null {
  if (asked === null) return null;
  const ready = subtopics.filter((s) => s.ready);
  const chosen = ready.filter((s) => asked.includes(s.id));
  return chosen.length === 0 || chosen.length === ready.length ? null : chosen.map((s) => s.id);
}

/** The pool of a run that keeps to these subtopics; the pool itself, untouched, for the whole topic (null). */
export function narrowPool<Q extends QuestionOutline>(pool: MarathonPool<Q>, conceptIds: readonly string[] | null): MarathonPool<Q> {
  if (conceptIds === null) return pool;
  const keep = new Set(conceptIds);
  return { templates: pool.templates.filter((t) => keep.has(t.conceptId)), questions: pool.questions.filter((q) => keep.has(q.conceptId)) };
}
