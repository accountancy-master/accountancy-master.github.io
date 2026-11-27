const PLAYS_PER_LEVEL = 10_000;
const SLOTS_PER_PLAY = 100;

/** Seed base for a level session. Each replay gets a fresh, non-overlapping block of seeds. */
export function levelSeed(levelOrder: number, playCount: number): number {
  const ok = (n: number) => Number.isInteger(n) && n >= 0;
  if (!ok(levelOrder) || !ok(playCount) || playCount >= PLAYS_PER_LEVEL) {
    throw new Error('Invalid level order or play count');
  }
  return (levelOrder * PLAYS_PER_LEVEL + playCount) * SLOTS_PER_PLAY;
}

// A look-back level asks questions of other topics too, whose own levels are seeded by their order. So it is seeded
// as if its order were one that no ladder reaches, a different one for each topic: a question it asks of an earlier
// topic can then never be one that topic's levels, or another topic's look-back, gave the learner.
const LOOK_BACK_ORDERS_FROM = 500;
const LEVEL_ORDERS = 1000;

/** Simulation levels are seeded from orders of their own, after the look-backs: the n-th of a topic by 900 + n. */
const SIMULATION_ORDERS_FROM = 900;

/**
 * The order a level is seeded by. A level whose id says its place on the ladder as it was written
 * (`<topic>-level-<n>`) is seeded by that place, so that a level put before it later (a simulation level, which has
 * an id of its own) changes no question it serves; on a ladder without one, that place is its order. A look-back
 * level takes one from the range kept for look-backs by its topic's place in the course (`topicIndex`, from 0), and
 * a simulation level one from the range kept for those. Any other level is seeded by its order.
 */
export function seedOrder(level: { order: number; type: string; id?: string; topicId?: string }, topicIndex: number): number {
  const own = level.id !== undefined && level.topicId !== undefined && level.id.startsWith(level.topicId) ? level.id.slice(level.topicId.length) : '';
  if (level.type === 'simulation') {
    const n = /^-simulation-(\d+)$/.exec(own)?.[1];
    const order = SIMULATION_ORDERS_FROM + (n === undefined ? 0 : Number(n));
    return order < LEVEL_ORDERS ? order : level.order;
  }
  if (level.type !== 'look_back') {
    const place = /^-level-(\d+)$/.exec(own)?.[1];
    return place === undefined ? level.order : Number(place);
  }
  const order = LOOK_BACK_ORDERS_FROM + topicIndex;
  if (!Number.isInteger(topicIndex) || topicIndex < 0 || order >= LEVEL_ORDERS) throw new Error('Invalid topic index');
  return order;
}

/**
 * How many times this level has been started, which picks the next seed block. Counts every session that left
 * an attempt (finished or abandoned) plus results that predate any attempt for the level (card-only plays,
 * which record no attempts). It only grows, so a level never gets the same seed twice.
 */
export function playCount(
  levelId: string,
  attempts: readonly { levelId?: string; sessionId: string; at: number }[],
  results: readonly { levelId: string; at: number }[],
): number {
  const mine = attempts.filter((a) => a.levelId === levelId);
  const sessions = new Set(mine.map((a) => a.sessionId)).size;
  let firstAttempt = Infinity;
  for (const a of mine) firstAttempt = Math.min(firstAttempt, a.at);
  // A finished question level has attempts that are never later than its result, so only plays without
  // attempts are older than every attempt of the level.
  const withoutAttempts = results.filter((r) => r.levelId === levelId && r.at < firstAttempt).length;
  return sessions + withoutAttempts;
}

/**
 * How many practice sessions of this kind the learner has started, which picks the next seed block: the distinct
 * session ids of that kind among their attempts (also those of abandoned sessions) and their session results.
 * It only grows, so a kind never gets the same block twice.
 */
export function practicePlayCount(
  kind: string,
  attempts: readonly { sessionKind?: string; sessionId: string }[],
  results: readonly { kind: string; sessionId: string }[],
): number {
  const sessions = new Set<string>();
  for (const a of attempts) if (a.sessionKind === kind) sessions.add(a.sessionId);
  for (const r of results) if (r.kind === kind) sessions.add(r.sessionId);
  return sessions.size;
}

/**
 * A seed for a similar question: the next free seed in the same block of 100 as `from` (every session owns its
 * block), going round the block. Null when the whole block is taken.
 */
export function similarSeed(from: number, used: ReadonlySet<number>): number | null {
  const base = from - (from % SLOTS_PER_PLAY);
  for (let i = 1; i < SLOTS_PER_PLAY; i++) {
    const seed = base + ((from - base + i) % SLOTS_PER_PLAY);
    if (!used.has(seed)) return seed;
  }
  return null;
}
