import type { LessonBlock } from '@/content/types';

/** A block a lesson shows (every one but a check, which is played as a question after the lesson). */
export type ShownBlock = Exclude<LessonBlock, { type: 'check' }>;

/** A text this short (in words) is an introduction: it shares its step with the example after it, or with a short text. */
export const SHORT_TEXT_WORDS = 45;
/** Two short texts share a step while together they stay this short. */
const SHORT_PAIR_WORDS = 70;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const textWords = (b: ShownBlock) => (b.type === 'text' ? words(`${b.heading} ${b.body}`) : Infinity);

/**
 * The steps a lesson is read in, one at a time: one block to a step, except that a short text shares its step with
 * what follows it when that is a worked example, a table or another short text (two short texts together). A worked
 * example or a table always stands with at most the short text that leads into it, so it keeps its own layout. The
 * checks are left out. Every block is in exactly one step, in order.
 */
export function lessonSteps(blocks: readonly LessonBlock[]): ShownBlock[][] {
  const shown = blocks.filter((b): b is ShownBlock => b.type !== 'check');
  const steps: ShownBlock[][] = [];
  for (const block of shown) {
    const last = steps.at(-1);
    const lead = last?.length === 1 ? last[0] : undefined;
    const joins =
      lead !== undefined &&
      textWords(lead) <= SHORT_TEXT_WORDS &&
      (block.type !== 'text' || textWords(lead) + textWords(block) <= SHORT_PAIR_WORDS);
    if (joins) last!.push(block);
    else steps.push([block]);
  }
  return steps;
}
