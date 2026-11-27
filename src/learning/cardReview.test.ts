import { describe, expect, it } from 'vitest';
import type { Card } from '@/content/types';
import type { CardReviewEvent } from '@/storage/types';
import { cardsToRevise, countDueCards, deriveCardStates } from './cardReview';
import { DAY_MS } from './mastery';

const T0 = new Date(2026, 9, 4, 10).getTime();
let seq = 0;
const review = (cardId: string, known: boolean, at: number): CardReviewEvent => ({
  id: `c${seq++}`, profileId: 'p', courseId: 'cbse-11-accountancy', topicId: 'journal-entries', cardId, conceptId: 'je-goods',
  known, at, sessionId: 's1',
});
const card = (id: string): Card => ({
  id, topicId: 'journal-entries', conceptId: 'je-goods', kind: 'rule', prompt: id, answer: '', explanation: '', example: '', commonMistake: '',
});

describe('deriveCardStates', () => {
  it('starts a known card in box 0 due after the first gap', () => {
    const s = deriveCardStates([review('c1', true, T0)]).c1;
    expect(s).toEqual({ review: { box: 0, dueAt: T0 + DAY_MS }, seen: 1, knownStreak: 1 });
  });

  it('does not promote on a second known in the same minute', () => {
    const s = deriveCardStates([review('c1', true, T0), review('c1', true, T0 + 30_000)]).c1;
    expect(s.review).toEqual({ box: 0, dueAt: T0 + DAY_MS });
    expect(s.seen).toBe(2);
    expect(s.knownStreak).toBe(2);
  });

  it('promotes a known review given at the due time', () => {
    const s = deriveCardStates([review('c1', true, T0), review('c1', true, T0 + DAY_MS)]).c1;
    expect(s.review.box).toBe(1);
    expect(s.review.dueAt).toBe(T0 + DAY_MS + 3 * DAY_MS);
  });

  it('resets to due now on not known and restarts the streak', () => {
    const s = deriveCardStates([review('c1', true, T0), review('c1', true, T0 + DAY_MS), review('c1', false, T0 + DAY_MS + 5)]).c1;
    expect(s.review).toEqual({ box: 0, dueAt: T0 + DAY_MS + 5 });
    expect(s.knownStreak).toBe(0);
    expect(s.seen).toBe(3);
  });

  it('folds oldest first whatever order the events arrive in', () => {
    const events = [review('c1', true, T0), review('c1', true, T0 + DAY_MS), review('c2', false, T0)];
    expect(deriveCardStates([...events].reverse())).toEqual(deriveCardStates(events));
  });
});

describe('cards fall due by local day', () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
  const cards = ['a', 'b'].map(card);
  const states = deriveCardStates([review('a', true, at(5, 19))]); // scheduled for 6 October, 19:00

  it('lists and counts a card from the morning of its day, not the evening before', () => {
    expect(states.a.review.dueAt).toBe(at(6, 19));
    expect(cardsToRevise(cards, states, at(6, 8), 10).map((c) => c.id)).toEqual(['a', 'b']);
    expect(countDueCards(cards, states, at(6, 8))).toBe(1);
    expect(cardsToRevise(cards, states, at(5, 23), 10).map((c) => c.id)).toEqual(['b']);
    expect(countDueCards(cards, states, at(5, 23))).toBe(0);
  });
});

describe('cardsToRevise and countDueCards', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map(card);
  const now = T0 + 10 * DAY_MS;
  const states = deriveCardStates([
    review('b', false, T0 + 5), // due at T0+5
    review('d', false, T0), // due at T0, earlier than b
    review('e', true, now - 1000), // seen, not due
  ]);

  it('returns due cards first by earliest due, then unseen cards in pack order', () => {
    expect(cardsToRevise(cards, states, now, 10).map((c) => c.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('respects the limit and excludes seen cards that are not yet due', () => {
    expect(cardsToRevise(cards, states, now, 3).map((c) => c.id)).toEqual(['d', 'b', 'a']);
    expect(cardsToRevise(cards, states, now, 10).map((c) => c.id)).not.toContain('e');
    expect(cardsToRevise(cards, states, now, 1).map((c) => c.id)).toEqual(['d']);
  });

  it('counts due cards only', () => {
    expect(countDueCards(cards, states, now)).toBe(2);
    expect(countDueCards(cards, {}, now)).toBe(0);
  });

  it('never offers or counts a card beyond the syllabus, even one revised before it was marked', () => {
    const marked = cards.map((c) => (c.id === 'd' || c.id === 'a' ? { ...c, beyondSyllabus: 'Goes further than the syllabus.' } : c));
    expect(cardsToRevise(marked, states, now, 10).map((c) => c.id)).toEqual(['b', 'c']);
    expect(countDueCards(marked, states, now)).toBe(1);
  });
});
