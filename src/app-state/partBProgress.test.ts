import { describe, expect, it } from 'vitest';
import type { AttemptEvent, CardReviewEvent, LevelResult } from '@/storage/types';
import { apartForChoice, deriveShared, type EventLists } from './progressLoad';

// What a learner did in a topic of the choice of Part B of Class 12 they have not made is kept apart: the course's
// mastery, levels, mistakes and practice are those of the topics they meet, and the XP of all of it still counts.

const C12 = 'cbse-12-accountancy';
const T0 = new Date(2026, 9, 5, 10, 0, 0).getTime();
const computerised = { class12PartB: 'computerised' } as const;

const attempt = (id: string, topicId: string, conceptId: string, correct: boolean): AttemptEvent => ({
  id, profileId: 'p', courseId: C12, topicId, conceptId, questionId: `${id}-q`, difficulty: 'easy', correct, hintsUsed: 0, timeMs: 1000, at: T0, sessionId: 's',
});
const passed = (id: string, topicId: string, levelId: string): LevelResult => ({ id, profileId: 'p', topicId, levelId, score: 1, passed: true, at: T0 });
const review = (id: string, topicId: string): CardReviewEvent => ({ id, profileId: 'p', courseId: C12, topicId, cardId: `${id}-card`, conceptId: 'k', known: true, at: T0, sessionId: 's' });

const lists: EventLists = {
  attempts: [attempt('a1', 'goodwill', 'gw-meaning', true), attempt('a2', 'accounting-ratios', 'ar-liquidity', false), attempt('a3', 'computerised-accounting', 'cas-overview', false)],
  levelResults: [passed('l1', 'goodwill', 'goodwill-level-0'), passed('l2', 'accounting-ratios', 'accounting-ratios-level-0'), passed('l3', 'computerised-accounting', 'computerised-accounting-level-0')],
  cardReviews: [review('r1', 'accounting-ratios'), review('r2', 'computerised-accounting')],
  sessionResults: [],
};

describe('apartForChoice', () => {
  it('gives the lists back as they are when nothing was done in a topic of the other choice', () => {
    const usual: EventLists = { ...lists, attempts: lists.attempts.slice(0, 2), levelResults: lists.levelResults.slice(0, 2), cardReviews: lists.cardReviews.slice(0, 1) };
    expect(apartForChoice(usual, C12, {}).lists).toBe(usual);
    const cas: EventLists = { ...lists, attempts: [lists.attempts[0], lists.attempts[2]], levelResults: [lists.levelResults[0]], cardReviews: [] };
    expect(apartForChoice(cas, C12, computerised).lists).toBe(cas);
  });

  it('keeps the work of the other choice out of the course, and its XP in the total', () => {
    const all = deriveShared(lists, T0, C12);
    for (const [choice, mine, other] of [[{}, 'accounting-ratios', 'computerised-accounting'], [computerised, 'computerised-accounting', 'accounting-ratios']] as const) {
      const seen = apartForChoice(lists, C12, choice);
      const shared = deriveShared(seen.lists, T0, C12, seen.courseOf);
      // The course is the topics of the choice, with Part A.
      expect(shared.events.attempts.map((a) => a.topicId)).toEqual(['goodwill', mine]);
      expect(shared.events.levelResults.map((r) => r.topicId)).toEqual(['goodwill', mine]);
      expect(shared.events.cardReviews.map((c) => c.topicId)).toEqual([mine]);
      expect(shared.progress.passedLevelIds).not.toContain(`${other}-level-0`);
      expect(Object.keys(shared.activity)).not.toContain(other);
      // Nothing earned is lost: the XP is what it is with everything in the course.
      expect(shared.progress.xp).toBe(all.progress.xp);
    }
  });
});
