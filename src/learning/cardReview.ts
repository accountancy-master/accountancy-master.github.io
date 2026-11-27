import type { CardOutline } from '@/content/types';
import type { CardReviewEvent } from '@/storage/types';
import { dueByDay, scheduleReview, type ReviewState } from './srs';

export interface CardState {
  review: ReviewState;
  seen: number;
  knownStreak: number;
}

const byTime = (a: CardReviewEvent, b: CardReviewEvent) =>
  a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function deriveCardStates(reviews: CardReviewEvent[]): Record<string, CardState> {
  const states: Record<string, CardState> = {};
  for (const e of [...reviews].sort(byTime)) {
    const prev = states[e.cardId];
    states[e.cardId] = {
      review: scheduleReview(prev?.review, e.known, e.at),
      seen: (prev?.seen ?? 0) + 1,
      knownStreak: e.known ? (prev?.knownStreak ?? 0) + 1 : 0,
    };
  }
  return states;
}

/** A card beyond the syllabus of its course stands on no revision level and is never handed out for revision. */
export const isRevisable = (card: Pick<CardOutline, 'beyondSyllabus'>): boolean => card.beyondSyllabus === undefined;

/**
 * Due cards (due from the start of their day; earliest due first), then cards never seen in pack order, up to `limit`.
 * Due cards come from every topic; a card never seen is offered only when `isNewAllowed` says so (the learner's
 * active topics: nobody is handed the new cards of every topic at once). All of them by default. A card beyond the
 * syllabus is never offered, even one revised before it was marked.
 */
export function cardsToRevise<C extends CardOutline>(
  cards: readonly C[],
  states: Record<string, CardState>,
  now: number,
  limit: number,
  isNewAllowed: (card: C) => boolean = () => true,
): C[] {
  const due = cards
    .filter(isRevisable)
    .map((card, index) => ({ card, index, dueAt: states[card.id]?.review.dueAt }))
    .filter((c): c is { card: C; index: number; dueAt: number } => c.dueAt !== undefined && dueByDay(c.dueAt, now))
    .sort((a, b) => a.dueAt - b.dueAt || a.index - b.index)
    .map((c) => c.card);
  const unseen = cards.filter((c) => isRevisable(c) && !states[c.id] && isNewAllowed(c));
  return [...due, ...unseen].slice(0, Math.max(0, limit));
}

export const countDueCards = (cards: readonly CardOutline[], states: Record<string, CardState>, now: number): number =>
  cards.filter((c) => {
    if (!isRevisable(c)) return false;
    const dueAt = states[c.id]?.review.dueAt;
    return dueAt !== undefined && dueByDay(dueAt, now);
  }).length;
