import type { Question } from '@/content/types';
import { registerQuestionSource } from '@/content/loaded';
import { getTemplate } from '@/generators/loaded';
import { equationMoveFor, journalTransactionFrom, moveTransaction } from './equation/fromGenerators';
import { parseSimId } from './ids';
import { equationMoves } from './moves';
import { mistakeQuestion, predictionQuestion } from './questions';
import { findScene } from './scenes';
import type { SimTransaction } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Makes the simulator's recorded questions again from their ids (see ids.ts), for Mistakes and its review. It is
// installed when a topic that has them is loaded (content/loadTopics.ts), and by registry.ts for tests and scripts.
// ---------------------------------------------------------------------------------------------------------------

/** The transaction an id names, or undefined when this version cannot make it. */
export function simTransaction(sceneId: string, itemId: string): SimTransaction | undefined {
  const scene = findScene(sceneId);
  if (!scene) return undefined;
  const [source, ...rest] = itemId.split('.');
  if (source === 's') return [...scene.transactions, ...scene.stories.flatMap((s) => s.transactions)].find((t) => t.id === itemId);
  if (source === 'm') {
    const seed = Number(rest[0]);
    const moves = equationMoves();
    if (!moves || rest.length !== 1 || !Number.isSafeInteger(seed) || seed < 0 || String(seed) !== rest[0]) return undefined;
    const { id, move } = equationMoveFor(moves, seed);
    return moveTransaction(seed, id, move);
  }
  if (source === 'j') {
    const [templateId, seedText] = rest;
    const seed = Number(seedText);
    if (rest.length !== 2 || !Number.isSafeInteger(seed) || seed < 0 || String(seed) !== seedText) return undefined;
    try {
      return journalTransactionFrom(getTemplate(templateId), seed) ?? undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The question a simulator id names, or undefined. */
export function simQuestion(id: string): Question | undefined {
  const sim = parseSimId(id);
  const scene = sim ? findScene(sim.sceneId) : undefined;
  if (!sim || !scene) return undefined;
  if (sim.source === 'x') {
    const [, scenarioId, seedText] = sim.itemId.split('.');
    const seed = Number(seedText);
    const scenario = scene.mistakes.find((m) => m.id === scenarioId);
    if (!scenario || !Number.isSafeInteger(seed) || seed < 0 || String(seed) !== seedText) return undefined;
    return mistakeQuestion(scene, scenario.make(seed));
  }
  const tx = simTransaction(sim.sceneId, sim.itemId);
  return tx ? predictionQuestion(scene, tx) : undefined;
}

/** Installs the source. Installing it again changes nothing. */
export function installSimQuestions(): void {
  registerQuestionSource('sim:', simQuestion);
}
