import type { Rng } from '@/engine/rng';
import type { EquationMove } from '@/generators/templates/accounting-equation';

// The transactions behind the accounting equation's effect questions, kept here once that topic has been loaded
// (content/loadTopics.ts puts them here as it loads its templates; registry.ts does for tests and scripts). The
// simulator plays them as entries. Nothing here is content: it imports types only.

export type EquationMoveDefs = readonly { id: string; make(rng: Rng): EquationMove }[];

let moves: EquationMoveDefs | null = null;

export function setEquationMoves(list: EquationMoveDefs): void {
  moves = list;
}

/** The moves, or null while the accounting-equation topic has not been loaded. */
export const equationMoves = (): EquationMoveDefs | null => moves;
