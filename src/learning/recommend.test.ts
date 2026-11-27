import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { JOURNAL_ENTRIES } from '@/content/cbse11/journalEntries';
import type { CardState } from './cardReview';
import { DAY_MS } from './mastery';
import { deriveProgress, type Progress, type QuestionRecord } from './progress';
import { recommendNext } from './recommend';

const pack = JOURNAL_ENTRIES;
const NOW = new Date(2026, 9, 5, 10).getTime();
const levelIds = pack.levels.map((l) => l.id);

const progress = (over: Partial<Progress> = {}): Progress => ({ ...deriveProgress([], [], NOW), ...over });
const mistakes = (n: number): Record<string, QuestionRecord> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i): [string, QuestionRecord] => [
      `gen:je-capital:1:${i + 1}`,
      { attempts: 1, lastCorrect: false, mistakeOpen: true, mistakeAt: i },
    ]),
  );
const dueCards = (n: number): Record<string, CardState> =>
  Object.fromEntries(
    pack.cards.slice(0, n).map((c): [string, CardState] => [c.id, { review: { box: 1, dueAt: NOW - DAY_MS }, seen: 1, knownStreak: 1 }]),
  );
const recommend = (p: Progress, states: Record<string, CardState> = {}) =>
  recommendNext({ packs: [pack], progress: p, states, now: NOW });

describe('recommendNext', () => {
  it('suggests mistakes first when three or more are waiting', () => {
    expect(recommend(progress({ questions: mistakes(3) }), dueCards(6))).toEqual({
      kind: 'mistakes',
      reason: 'You have 3 mistakes waiting to be put right.',
      href: '/practice/mistakes',
    });
    expect(recommend(progress({ questions: mistakes(5) })).reason).toBe('You have 5 mistakes waiting to be put right.');
  });

  it('does not count a mistake whose question can no longer be served', () => {
    const questions = { ...mistakes(2), 'gen:je-capital:99:1': { attempts: 1, lastCorrect: false, mistakeOpen: true } };
    expect(recommend(progress({ questions })).kind).toBe('level');
  });

  it('suggests cards when five or more are due', () => {
    expect(recommend(progress({ questions: mistakes(2) }), dueCards(5))).toEqual({
      kind: 'cards',
      reason: '5 rule cards are due for revision.',
      href: '/practice/cards',
    });
  });

  it('suggests the next unlocked level otherwise', () => {
    const p = progress({ passedLevelIds: levelIds.slice(0, 2) });
    expect(recommend(p, dueCards(4))).toEqual({
      kind: 'level',
      reason: `Next in Journal Entries: ${pack.levels[2].title}`,
      href: `/play/${pack.levels[2].id}`,
    });
    expect(recommend(progress()).href).toBe(`/play/${pack.levels[0].id}`);
  });

  it('points a learner who has passed nothing at the first level, with or without every level unlocked', () => {
    const first = { kind: 'level', reason: `Next in Journal Entries: ${pack.levels[0].title}`, href: `/play/${pack.levels[0].id}` };
    expect(recommend(progress(), dueCards(4))).toEqual(first);
    expect(recommendNext({ packs: [pack], progress: progress(), states: {}, now: NOW, unlockAll: true })).toEqual(first);
  });

  it('ends the level reason with a full stop only when the title has no closing punctuation', () => {
    expect(pack.levels[2].title).toMatch(/\?$/);
    expect(pack.levels[4].title).not.toMatch(/[.?!]$/);
    expect(recommend(progress({ passedLevelIds: levelIds.slice(0, 2) })).reason).toBe('Next in Journal Entries: Which Side?');
    expect(recommend(progress({ passedLevelIds: levelIds.slice(0, 4) })).reason).toBe(
      `Next in Journal Entries: ${pack.levels[4].title}.`,
    );
  });

  it('with every level unlocked still suggests the first level not passed yet', () => {
    const p = progress({ passedLevelIds: [levelIds[0], levelIds[1], levelIds[3]] });
    expect(recommendNext({ packs: [pack], progress: p, states: {}, now: NOW, unlockAll: true }).href).toBe(
      `/play/${pack.levels[2].id}`,
    );
  });

  it('falls back to smart practice when every level is passed', () => {
    expect(recommend(progress({ passedLevelIds: levelIds }))).toEqual({
      kind: 'smart',
      reason: 'Keep your weakest ideas fresh.',
      href: '/practice/smart',
    });
  });

  it('suggests smart practice when there are no packs', () => {
    expect(recommendNext({ packs: [], progress: progress(), states: {}, now: NOW }).kind).toBe('smart');
  });
});
