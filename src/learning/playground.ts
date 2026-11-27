import type { Question } from '@/content/types';
import { createRng } from '@/engine/rng';
import { parseGenId } from '@/generators/ids';
import { generateCaseQuestions, generateQuestion } from '@/generators/loaded';
import type { Pattern } from './patterns';

// ---------------------------------------------------------------------------------------------------------------
// The Playground: any pattern of the course, or a mix of them, played for as long as the learner likes, with nothing
// to unlock. Every answer is an ordinary practice answer (a session of kind `fresh`), so it earns XP, moves mastery
// and puts what is missed on the Mistakes list; a play has no score and leaves no session result.
// ---------------------------------------------------------------------------------------------------------------

// Seeds. Levels stay below 1,000,000,000, practice sessions sit in the 1,000,000,000s, the daily challenge in the
// 2,000,000,000s up to about 2,010,000,000 by the year 2400, mock papers in the 3,000,000,000s and marathons from
// 3,500,000,000 (see practice.ts, mockPaper.ts, marathon.ts). The Playground takes the 2,500,000,000s: a play owns a
// block of 10,000 seeds, one for each question (or whole case) it serves.

export const PLAYGROUND_SEED_BASE = 2_500_000_000;
export const SEEDS_PER_PLAY = 10_000;
export const MAX_PLAYGROUND_PLAYS = 50_000;
// Keeps the stream that chooses a pattern apart from the stream of the question itself.
const CHOICE_SALT = 0x2f6b9a1d;

/** The first seed of a play: each play the learner answered something in takes the next block. */
export function playgroundSeed(playCount: number): number {
  if (!Number.isInteger(playCount) || playCount < 0 || playCount >= MAX_PLAYGROUND_PLAYS) throw new Error('Invalid playground play count');
  return PLAYGROUND_SEED_BASE + playCount * SEEDS_PER_PLAY;
}

export const isPlaygroundSeed = (seed: number): boolean => seed >= PLAYGROUND_SEED_BASE && seed < PLAYGROUND_SEED_BASE + MAX_PLAYGROUND_PLAYS * SEEDS_PER_PLAY;

/**
 * How many plays of the Playground have left an answer: the sessions among the attempts that answered a question made
 * from a Playground seed. A play that was left without an answer used nothing, so its block is taken by the next.
 */
export function playgroundPlayCount(attempts: readonly { sessionId: string; questionId: string }[]): number {
  const sessions = new Set<string>();
  for (const a of attempts) {
    const gen = parseGenId(a.questionId);
    if (gen && isPlaygroundSeed(gen.seed)) sessions.add(a.sessionId);
  }
  return sessions.size;
}

/**
 * The pattern at a position of a play over `ids`: drawn evenly from the seed of the play and the position, never the
 * pattern just played (`last`) when there is another. The same for the same play and position.
 */
export function pickPattern(ids: readonly string[], seed: number, position: number, last?: string): string {
  if (ids.length === 0) throw new Error('Nothing to play');
  const others = ids.filter((id) => id !== last);
  const from = others.length > 0 ? others : ids;
  return createRng((seed + position) ^ CHOICE_SALT).pick(from);
}

/**
 * What a pattern serves for one seed: one question of a template, or every question of a case study in order. Its
 * topic must be loaded (see content/loadTopics.ts).
 */
export const playgroundUnit = (pattern: Pick<Pattern, 'id' | 'kind'>, seed: number): Question[] =>
  pattern.kind === 'case' ? generateCaseQuestions(pattern.id, seed) : [generateQuestion(pattern.id, seed)];
