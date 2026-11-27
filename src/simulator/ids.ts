// ---------------------------------------------------------------------------------------------------------------
// The ids of what the simulator records: `sim:<scene>:<transaction>`. A prediction is recorded against its
// transaction (`s.<name>` of a scene's own list, `m.<seed>` of the equation generators, `j.<template>.<seed>` of a
// journal template) and a found mistake against its case (`x.<scenario>.<seed>`). Like a generated question's id, it
// names everything needed to make the question again, so a wrong one can wait in Mistakes and be asked again.
//
// This file is read by every screen that lists questions (content/outline.ts), so it imports nothing.
// ---------------------------------------------------------------------------------------------------------------

/** The topic of each scene, by its id: a scene's records belong to it. */
const SCENE_TOPICS: Readonly<Record<string, string>> = { ae: 'accounting-equation' };

/** The topics whose loading brings the simulator's questions with it (content/loadTopics.ts). */
export const SIM_QUESTION_TOPICS: readonly string[] = ['accounting-equation', 'journal-entries'];

export type SimSource = 's' | 'm' | 'j' | 'x';

export interface SimId {
  sceneId: string;
  /** The transaction or case id: `s.capital-cash`, `m.42`, `j.je-capital.3`, `x.wrong-side.7`. */
  itemId: string;
  source: SimSource;
}

export const simQuestionId = (sceneId: string, itemId: string): string => `sim:${sceneId}:${itemId}`;

export function parseSimId(id: string): SimId | null {
  const m = /^sim:([a-z0-9-]+):(([smjx])\.[A-Za-z0-9.~-]+)$/.exec(id);
  if (!m || !Object.hasOwn(SCENE_TOPICS, m[1])) return null;
  return { sceneId: m[1], itemId: m[2], source: m[3] as SimSource };
}

/**
 * The topic to load before a simulator question can be made again, or undefined for an id that is not one. A journal
 * template's transaction needs Journal Entries (its generator); everything else its scene's own topic.
 */
export function simTopicOf(id: string): string | undefined {
  const sim = parseSimId(id);
  if (!sim) return undefined;
  return sim.source === 'j' ? 'journal-entries' : SCENE_TOPICS[sim.sceneId];
}

/** The topic a scene's records belong to. */
export const sceneTopic = (sceneId: string): string | undefined => SCENE_TOPICS[sceneId];
