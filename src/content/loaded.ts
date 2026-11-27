import { parseGenId } from '@/generators/ids';
import { generateQuestion } from '@/generators/loaded';
import { OUTLINES, findOutline, topicOfQuestion } from './outline';
import type { Question, TopicPack } from './types';

// ---------------------------------------------------------------------------------------------------------------
// The packs that are in memory. A topic's pack is registered when the topic is loaded (loadTopics.ts; all of them at
// once by registry.ts, for tests and scripts), and from then on it and its questions are looked up here exactly as
// before. Asking for a topic that can be played but has not been loaded is a mistake of the caller, and throws:
// a screen says which topics it needs and waits for them (app-state/useTopics.ts) before it looks anything up.
// ---------------------------------------------------------------------------------------------------------------

const packs = new Map<string, TopicPack>();
const listeners = new Set<() => void>();
/** The authored questions of each loaded topic by id, indexed when first asked for. */
const authored = new Map<string, ReadonlyMap<string, Question>>();

/** Makes a topic's pack available. Its templates and cases must be registered by then (generators/loaded.ts). */
export function registerPack(pack: TopicPack): void {
  packs.set(pack.topicId, pack);
  authored.delete(pack.topicId);
  for (const notify of [...listeners]) notify();
}

/** Calls `onChange` whenever a topic has been loaded. Returns the way to stop. */
export function onTopicLoaded(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export const isTopicLoaded = (topicId: string): boolean => packs.has(topicId);

function notLoaded(topicId: string): Error {
  return new Error(`Topic ${topicId} is not loaded: load it first (see content/loadTopics.ts)`);
}

/**
 * The pack of a topic that can be played, or undefined when there is no such topic (a non-throwing lookup, for ids
 * that come from addresses and stored data). Throws for a topic that can be played and has not been loaded.
 */
export function getTopicPack(topicId: string): TopicPack | undefined {
  const pack = packs.get(topicId);
  if (!pack && findOutline(topicId)) throw notLoaded(topicId);
  return pack;
}

/** The packs of these topics, in course order. Throws when one of them has not been loaded; ids of no topic are left out. */
export function loadedPacks(topicIds: Iterable<string>): TopicPack[] {
  const wanted = new Set(topicIds);
  return OUTLINES.filter((o) => wanted.has(o.topicId)).map((o) => getTopicPack(o.topicId)!);
}

function authoredOf(pack: TopicPack): ReadonlyMap<string, Question> {
  let byId = authored.get(pack.topicId);
  if (!byId) authored.set(pack.topicId, (byId = new Map(pack.questions.map((q) => [q.id, q]))));
  return byId;
}

// A generated question is rebuilt from its id, which costs a generator run: screens that list many mistakes would
// repeat that on every render. The result depends on the id alone (ids name a template version and a seed), so it is
// kept; the cache is emptied rather than allowed to grow without bound.
const GENERATED_CACHE_MAX = 5000;
const generated = new Map<string, Question | undefined>();

function findGenerated(id: string, gen: NonNullable<ReturnType<typeof parseGenId>>): Question | undefined {
  if (generated.has(id)) return generated.get(id);
  let found: Question | undefined;
  try {
    // The id must be exactly the one the question carries.
    const q = generateQuestion(gen.templateId, gen.seed);
    found = q.id === id ? q : undefined;
  } catch {
    found = undefined;
  }
  if (generated.size >= GENERATED_CACHE_MAX) generated.clear();
  generated.set(id, found);
  return found;
}

// Questions that are not a topic's own nor a template's: those the simulator records (`sim:...`), made again from the
// id by a source the simulator installs when a topic that has them is loaded (see simulator/questionSource.ts).
const sources = new Map<string, (id: string) => Question | undefined>();

/** Makes the questions whose ids start with `prefix` available, from `source`. Installing one again replaces it. */
export function registerQuestionSource(prefix: string, source: (id: string) => Question | undefined): void {
  sources.set(prefix, source);
}

/**
 * Non-throwing lookup, for ids that come from stored data. Retired-version and malformed ids give undefined. An id
 * names its topic (an authored question's own, a generated one's through its template: see `topicOfQuestion`), and
 * that topic must have been loaded: for a question of a topic that has not been, this throws.
 */
export function findQuestion(id: string): Question | undefined {
  const topicId = topicOfQuestion(id);
  if (topicId === undefined) return undefined;
  const pack = packs.get(topicId);
  if (!pack) throw notLoaded(topicId);
  for (const [prefix, source] of sources) if (id.startsWith(prefix)) return source(id);
  const gen = parseGenId(id);
  return gen ? findGenerated(id, gen) : authoredOf(pack).get(id);
}

export function getQuestion(id: string): Question {
  const q = findQuestion(id);
  if (!q) throw new Error(`Unknown question: ${id}`);
  return q;
}
