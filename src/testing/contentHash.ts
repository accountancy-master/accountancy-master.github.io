import { createHash } from 'node:crypto';
import type { CaseTemplate, Template } from '@/generators/types';
import { generateCase, generateFrom } from '@/generators/engine';

/** How many seeds of every template, and of every case, the hash covers: enough to meet every branch of a generator. */
export const HASH_TEMPLATE_SEEDS = 40;
export const HASH_CASE_SEEDS = 10;

/**
 * One hash over what these templates and cases make: every question of the first seeds, whole (its prompt, answer,
 * choices, working). Two builds that give the same hash serve the same questions, so a change to the engine, the
 * chart of accounts or the formats that was meant to leave existing content alone can prove that it did.
 */
export function contentHash(templates: readonly Template[], cases: readonly CaseTemplate[], seeds = { templates: HASH_TEMPLATE_SEEDS, cases: HASH_CASE_SEEDS }): string {
  const hash = createHash('sha256');
  for (const t of templates) {
    for (let seed = 1; seed <= seeds.templates; seed++) hash.update(JSON.stringify(generateFrom(t, seed)));
  }
  for (const c of cases) {
    for (let seed = 1; seed <= seeds.cases; seed++) hash.update(JSON.stringify(generateCase(c, seed)));
  }
  return hash.digest('hex');
}
