import type { Template } from './types';

// The ids of generated questions: `gen:<template>:<version>:<seed>`. A question of a case study is made by a
// template of its own, `<caseId>~<n>`. Nothing here needs a generator, so an id can be read before its topic is loaded.

export const isValidSeed = (seed: number): boolean => Number.isSafeInteger(seed) && seed >= 0;

export const genId = (t: Pick<Template, 'id' | 'version'>, seed: number) => `gen:${t.id}:${t.version}:${seed}`;

export function parseGenId(id: string): { templateId: string; version: number; seed: number } | null {
  const m = /^gen:([^:]+):(\d+):(\d+)$/.exec(id);
  if (!m) return null;
  const seed = Number(m[3]);
  return isValidSeed(seed) ? { templateId: m[1], version: Number(m[2]), seed } : null;
}

/**
 * True for the Assertion and Reason template of a topic (`<prefix>-assertion-reason`). It stands on a level of its own
 * and in the Playground and the Marathon, and is set in no mock paper, on no worksheet and in no Look back level, which
 * are made from what the bank holds: leaving it out keeps every paper and every worksheet code what it was.
 */
export const isAssertionReason = (templateId: string): boolean => templateId.endsWith('-assertion-reason');

/** The id of the template that makes question `index` (from 0) of a case: `<caseId>~<n>`, counted from 1. */
export const casePartId = (caseId: string, index: number) => `${caseId}~${index + 1}`;

/** The case and the position (from 0) a part-template id names, or null for an ordinary template id. */
export function parseCasePartId(templateId: string): { caseId: string; index: number } | null {
  const m = /^(.+)~([1-9]\d*)$/.exec(templateId);
  return m ? { caseId: m[1], index: Number(m[2]) - 1 } : null;
}
