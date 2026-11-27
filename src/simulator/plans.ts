import { createRng } from '@/engine/rng';
import { equationMoveFor, moveTransaction } from './equation/fromGenerators';
import { equationMoves } from './moves';
import type { MistakeCase, Scene } from './scenes';
import type { SimTransaction } from './types';

// What one play of the simulator serves, from its seed: the same seed always serves the same play.

/** One play of a predict level: the transactions to watch, then those to predict (the scene's own and the generators'). */
export function predictPlan(scene: Scene, seed: number, watch: number, count: number): { watch: SimTransaction[]; predict: SimTransaction[] } {
  const own = createRng(seed).shuffle(scene.transactions);
  const rest = own.slice(watch);
  const moves = equationMoves();
  let next = 0;
  const predict = Array.from({ length: count }, (_, i) => {
    // Every other one is drawn from the topic's generators, when they are there: a replay is never the same play.
    if (moves && i % 2 === 1) {
      const { id, move } = equationMoveFor(moves, seed + i);
      return moveTransaction(seed + i, id, move);
    }
    return rest[next++ % rest.length];
  });
  return { watch: own.slice(0, watch), predict };
}

/** One play of a mistakes level: different errors, each with amounts of its own. */
export function mistakesPlan(scene: Scene, seed: number, count: number): MistakeCase[] {
  const order = createRng(seed).shuffle(scene.mistakes.map((_, i) => i));
  return Array.from({ length: count }, (_, i) => scene.mistakes[order[i % order.length]].make(seed + i));
}

/** The n-th case (from 0) of an endless run of mistakes that starts at `start`: every error in turn, a new seed each time. */
export function endlessCase(scene: Scene, start: number, n: number): MistakeCase {
  const order = createRng(start).shuffle(scene.mistakes.map((_, i) => i));
  return scene.mistakes[order[n % order.length]].make(start + n);
}

/** The order the scene's own transactions come in, on a visit that starts at `start`. */
export const starterOrder = (scene: Scene, start: number): SimTransaction[] => createRng(start).shuffle(scene.transactions.map((_, i) => i)).map((i) => scene.transactions[i]);
