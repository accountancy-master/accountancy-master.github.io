import type { TopicOutline } from '@/content/types';
import { CONFIG } from '@/learning/config';
import { planPracticeSession, type PracticeInput } from '@/play/practiceSession';

export interface MissionSummary {
  cards: number;
  /** Questions in the mission. When `challenge` is a number these are the practice questions and exclude it. */
  questions: number;
  /** The challenge questions on top of `questions`, or null when the mission does not allow telling them apart. */
  challenge: number | null;
}

/**
 * What a mission would contain, counted from its items (as they are planned, or as they are served: everything that
 * is not a card is a question). A full mission is the configured practice questions plus the configured challenge
 * questions, and only then is the split known: a smaller mission has fewer practice questions and may or may not
 * have challenge ones, so its questions are counted together.
 */
export function summariseMission(items: readonly { kind: 'card' | 'question' | 'generate' | 'lesson' }[]): MissionSummary {
  const cards = items.filter((i) => i.kind === 'card').length;
  const total = items.filter((i) => i.kind === 'question' || i.kind === 'generate').length;
  const { questions, challenge } = CONFIG.practice.mission;
  if (total === questions + challenge) return { cards, questions, challenge };
  return { cards, questions: total, challenge: null };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "5 cards · 8 questions · 2 challenge questions", leaving out what the mission does not have. */
export function describeMission(m: MissionSummary): string {
  const parts: string[] = [];
  if (m.cards > 0) parts.push(plural(m.cards, 'card', 'cards'));
  if (m.questions > 0) parts.push(plural(m.questions, 'question', 'questions'));
  if (m.challenge !== null && m.challenge > 0) parts.push(plural(m.challenge, 'challenge question', 'challenge questions'));
  return parts.join(' · ');
}

/**
 * The mission as it would be played right now, or null when there is nothing to put in it. Only counted, never
 * started: it is planned from the outlines of the packs, and no question is made.
 */
export function previewMission(input: PracticeInput<TopicOutline>): MissionSummary | null {
  const items = planPracticeSession('mission', input);
  return items.length === 0 ? null : summariseMission(items);
}
