import type { NextStep } from '@/learning/recommend';

/** What the card of the next step says: its heading, the words on its button, and why it is the next step. */
export interface NextStepText {
  heading: string;
  action: string;
  reason: string;
}

/**
 * Mastery in words, beside the levels passed: what the figure measures, so that "0%" after a few levels passed does not
 * look like a mistake. It is how well the learner answers the ideas of the course, idea by idea: it grows with right
 * answers to questions (passing a level of rule cards does not move it) and fades a little without practice.
 */
export const masteryNote = (mastery: number): string =>
  `Mastery ${mastery}%: how well you answer each idea. It grows with right answers and fades a little without practice.`;

/**
 * The words of Home's first card, for the next step (`nextStep` in learning/recommend.ts): where it is, and why it is
 * the one to do now, so that a learner never wonders why Home sends them there.
 */
export function nextStepText(step: Pick<NextStep, 'why' | 'passed' | 'total'>, topic: string): NextStepText {
  switch (step.why) {
    case 'start':
      return {
        heading: 'Start here',
        action: 'Start',
        reason: `The course starts with ${topic}. Each topic is a ladder of short levels, a lesson first and then practice; pass a level to open the next.`,
      };
    case 'continue':
      return {
        heading: 'Continue',
        action: 'Continue',
        reason:
          step.passed > 0
            ? `You are part-way through ${topic}: ${step.passed} of ${step.total} levels passed. This is the next one.`
            : `You have started ${topic}. Pass this level to open the next one.`,
      };
    case 'next-topic':
      return {
        heading: 'Next topic',
        action: 'Start',
        reason: `${topic} is the first topic, in the order of the course, that you have not finished.`,
      };
  }
}
