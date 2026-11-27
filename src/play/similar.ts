import type { Question } from '@/content/types';
import { parseCasePartId, parseGenId } from '@/generators/ids';
import { generateQuestion } from '@/generators/loaded';
import type { SessionItem } from '@/learning/sessionBuilder';
import { similarSeed } from './seed';

/**
 * A new question from the same template as a generated one, with a seed no question of the session uses.
 * Null for an authored question, for a question of a case study (a case is played whole: one question of another
 * case would come without the rest), or when the session's block of seeds is used up.
 */
export function similarTo(question: Question, items: readonly SessionItem[]): Question | null {
  const gen = parseGenId(question.id);
  if (!gen || parseCasePartId(gen.templateId)) return null;
  const used = new Set<number>();
  for (const item of items) {
    const g = item.kind === 'question' ? parseGenId(item.question.id) : null;
    if (g) used.add(g.seed);
  }
  const seed = similarSeed(gen.seed, used);
  return seed === null ? null : generateQuestion(gen.templateId, seed);
}
