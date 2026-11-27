import { describe, expect, it } from 'vitest';
// Every generator is registered first: a pack builds its ladder from its topic's templates as it is imported.
import '@/generators';
import { JOURNAL_ENTRIES } from '@/content/cbse11/journalEntries';
import { deriveCardStates } from '@/learning/cardReview';
import { CONFIG } from '@/learning/config';
import { dayKey } from '@/learning/gamification';
import { deriveProgress } from '@/learning/progress';
import type { SessionItem } from '@/learning/sessionBuilder';
import { deriveTopicActivity } from '@/learning/topics';
import type { AttemptEvent, LevelResult, SessionResult } from '@/storage/types';
import { PRACTICE_MODES } from './practiceModes';
import { buildPracticeSession } from './practiceSession';

const pack = JOURNAL_ENTRIES;
const NOW = new Date(2026, 9, 5, 10).getTime();

const passed = (upTo: number): LevelResult[] =>
  pack.levels
    .filter((l) => l.order <= upTo)
    .map((l) => ({ id: `r${l.order}`, profileId: 'p', topicId: l.topicId, levelId: l.id, score: 1, passed: true, at: NOW - 1000 }));

function build(
  mode: (typeof PRACTICE_MODES)[number],
  opts: { upTo?: number; attempts?: AttemptEvent[]; sessionResults?: SessionResult[]; now?: number; unlockAll?: boolean } = {},
): SessionItem[] {
  const attempts = opts.attempts ?? [];
  const sessionResults = opts.sessionResults ?? [];
  const now = opts.now ?? NOW;
  const levelResults = opts.upTo === undefined ? [] : passed(opts.upTo);
  return buildPracticeSession(mode, {
    packs: [pack],
    progress: deriveProgress(attempts, levelResults, now, sessionResults),
    attempts,
    sessionResults,
    cardStates: deriveCardStates([]),
    activity: deriveTopicActivity(attempts, levelResults),
    now,
    unlockAll: opts.unlockAll,
  });
}

const ids = (items: SessionItem[]) => items.map((i) => (i.kind === 'question' ? i.question.id : i.kind === 'card' ? i.card.id : 'lesson'));

const attempt = (questionId: string, sessionId: string, sessionKind: AttemptEvent['sessionKind']): AttemptEvent => ({
  id: `${sessionId}-${questionId}`,
  profileId: 'p',
  courseId: 'c',
  topicId: pack.topicId,
  conceptId: 'je-rules',
  questionId,
  difficulty: 'easy',
  correct: true,
  hintsUsed: 0,
  timeMs: 1,
  at: NOW - 500,
  sessionId,
  sessionKind,
});

describe('buildPracticeSession', () => {
  it('builds something for every mode once the early levels are passed', () => {
    for (const mode of PRACTICE_MODES) {
      if (mode === 'mistakes') continue; // nothing wrong yet
      expect(build(mode, { upTo: 4 }).length, mode).toBeGreaterThan(0);
    }
    expect(build('smart', { upTo: 4 })).toHaveLength(CONFIG.practice.smart.weak + CONFIG.practice.smart.due + CONFIG.practice.smart.fresh);
    expect(build('fresh', { upTo: 4 })).toHaveLength(CONFIG.practice.freshCount);
  });

  it('serves nothing before a level is passed, and no mistakes means an empty review', () => {
    for (const mode of ['smart', 'fresh', 'mistakes', 'daily', 'mission'] as const) expect(build(mode), mode).toEqual([]);
    // Rule cards stay open to everyone.
    expect(build('cards').length).toBeGreaterThan(0);
  });

  it('serves only what was passed or already attempted, never the next level', () => {
    const templates = (items: SessionItem[]) => ids(items).filter((id) => id.startsWith('gen:'));
    // Levels 0-4 passed: level 5 (credit transactions) has not been played, so none of its templates appears.
    for (const mode of ['smart', 'fresh', 'daily', 'mission'] as const) {
      expect(templates(build(mode, { upTo: 4 })).some((id) => /je-credit-(purchase|sale)/.test(id)), mode).toBe(false);
    }
    // Having attempted a credit sale in level 5 (not passed) makes that template available.
    const tried = [attempt('gen:je-credit-sale:1:7', 's1', 'level')];
    const served = new Set<string>();
    for (let n = 0; n < 12; n++) {
      const more = [...tried, ...Array.from({ length: n }, (_, i) => attempt(`gen:je-capital:1:${i}`, `s${i + 2}`, 'fresh'))];
      for (const id of ids(build('fresh', { upTo: 4, attempts: more }))) served.add(id);
    }
    expect([...served].some((id) => id.startsWith('gen:je-credit-sale:'))).toBe(true);
    expect([...served].some((id) => id.startsWith('gen:je-credit-purchase:'))).toBe(false);
  });

  it('offers everything the levels list when every level is unlocked, whatever was passed', () => {
    for (const mode of ['smart', 'fresh', 'daily', 'mission'] as const) {
      expect(build(mode, { unlockAll: true }).length, mode).toBeGreaterThan(0);
    }
    expect(build('smart', { unlockAll: true })).toHaveLength(CONFIG.practice.smart.weak + CONFIG.practice.smart.due + CONFIG.practice.smart.fresh);
    const gst = new Set<string>();
    for (let n = 0; n < 12; n++) {
      const attempts = Array.from({ length: n }, (_, i) => attempt(`gen:je-capital:1:${i}`, `s${i}`, 'fresh'));
      for (const id of ids(build('fresh', { unlockAll: true, attempts }))) if (id.includes('gst')) gst.add(id);
    }
    expect(gst.size).toBeGreaterThan(0);
  });

  it('gives every play of a kind new questions, and never goes back to an earlier block', () => {
    const first = ids(build('fresh', { upTo: 4 }));
    const playedOnce = [attempt('gen:x:1:1', 's1', 'fresh')];
    const second = ids(build('fresh', { upTo: 4, attempts: playedOnce }));
    const playedTwice = [...playedOnce, attempt('gen:x:1:2', 's2', 'fresh')];
    const third = ids(build('fresh', { upTo: 4, attempts: playedTwice }));
    expect(new Set([...first, ...second, ...third]).size).toBe(first.length * 3);
    // Sessions of another kind, and level attempts, do not move the count.
    expect(ids(build('fresh', { upTo: 4, attempts: [attempt('gen:x:1:3', 's9', 'smart'), attempt('je-q-002', 's8', undefined)] }))).toEqual(first);
    // A finished session counted through its result alone (cards leave no attempts).
    const result: SessionResult = { id: 'sr', profileId: 'p', courseId: 'c', kind: 'fresh', sessionId: 's1', day: dayKey(NOW), correct: 1, total: 1, at: NOW };
    expect(ids(build('fresh', { upTo: 4, sessionResults: [result] }))).toEqual(second);
  });

  it('serves the same daily challenge all day and a different one the next day', () => {
    const today = ids(build('daily', { upTo: 4 }));
    expect(ids(build('daily', { upTo: 4, now: NOW + 3_600_000 }))).toEqual(today);
    expect(ids(build('daily', { upTo: 4, now: NOW + 86_400_000 }))).not.toEqual(today);
  });

  it('starts a mission with rule cards', () => {
    const items = build('mission', { upTo: 4 });
    expect(items.slice(0, CONFIG.practice.mission.cards).every((i) => i.kind === 'card')).toBe(true);
    expect(items.slice(CONFIG.practice.mission.cards).every((i) => i.kind === 'question')).toBe(true);
  });
});
