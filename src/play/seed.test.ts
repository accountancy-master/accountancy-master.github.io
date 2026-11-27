import { describe, expect, it } from 'vitest';
import { isValidSeed } from '@/generators';
import { COURSES, packsOf } from '@/content/registry';
import { levelSeed, playCount, practicePlayCount, seedOrder, similarSeed } from './seed';

describe('levelSeed', () => {
  it('is a valid seed, stable for the same inputs', () => {
    expect(isValidSeed(levelSeed(4, 0))).toBe(true);
    expect(levelSeed(4, 0)).toBe(levelSeed(4, 0));
  });
  it('changes with each replay and never overlaps another play of up to 100 questions', () => {
    const seen = new Set<number>();
    for (let order = 0; order < 12; order++) {
      for (let play = 0; play < 50; play++) {
        for (let slot = 0; slot < 100; slot++) seen.add(levelSeed(order, play) + slot);
      }
    }
    expect(seen.size).toBe(12 * 50 * 100);
  });
  it('rejects bad inputs', () => {
    expect(() => levelSeed(-1, 0)).toThrow('Invalid level order or play count');
    expect(() => levelSeed(1, 1.5)).toThrow('Invalid level order or play count');
  });
});

describe('seedOrder', () => {
  it("is a level's own order, for every level but a look-back", () => {
    expect(seedOrder({ order: 7, type: 'mixed_practice' }, 3)).toBe(7);
    expect(seedOrder({ order: 12, type: 'case_study' }, 3)).toBe(12);
  });
  it('gives the look-back of each topic an order of its own, above any ladder and below the ceiling of level seeds', () => {
    const orders = Array.from({ length: 40 }, (_, topicIndex) => seedOrder({ order: 12, type: 'look_back' }, topicIndex));
    expect(new Set(orders).size).toBe(orders.length);
    for (const order of orders) {
      expect(order).toBeGreaterThanOrEqual(500);
      expect(order).toBeLessThan(1000);
      expect(levelSeed(order, 9999) + 99).toBeLessThan(1_000_000_000);
    }
  });
  it('rejects a topic index that is not a place in the course', () => {
    for (const bad of [-1, 1.5, 500, NaN]) expect(() => seedOrder({ order: 3, type: 'look_back' }, bad)).toThrow('Invalid topic index');
  });
  it('keeps every look-back of a course apart from every level of every topic of it, and from each other', () => {
    // A topic stands at its place among the playable topics of its own course.
    for (const course of COURSES) {
      const packs = packsOf(course.id);
      const own = new Set<number>();
      const lookBacks: number[] = [];
      packs.forEach((pack, topicIndex) => {
        for (const level of pack.levels) {
          const order = seedOrder(level, topicIndex);
          if (level.type === 'look_back') lookBacks.push(order);
          else own.add(order);
        }
      });
      expect(lookBacks, course.id).toHaveLength(packs.filter((p) => p.levels.some((l) => l.type === 'look_back')).length);
      expect(new Set(lookBacks).size, course.id).toBe(lookBacks.length);
      for (const order of lookBacks) expect(own.has(order), course.id).toBe(false);
    }
    expect(packsOf(COURSES[0].id).filter((p) => p.levels.some((l) => l.type === 'look_back')).length).toBe(packsOf(COURSES[0].id).length - 1);
  });
});

describe('playCount', () => {
  const attempt = (levelId: string, sessionId: string, at: number) => ({ levelId, sessionId, at });
  it('is 0 for a level never played', () => {
    expect(playCount('l4', [], [])).toBe(0);
    expect(playCount('l4', [attempt('l5', 's', 1)], [{ levelId: 'l5', at: 2 }])).toBe(0);
  });
  it('counts abandoned sessions as plays', () => {
    const attempts = [attempt('l4', 's1', 1), attempt('l4', 's1', 2)];
    expect(playCount('l4', attempts, [])).toBe(1);
  });
  it('counts a finished session once, however many attempts and its result', () => {
    const attempts = [attempt('l4', 's1', 1), attempt('l4', 's1', 2)];
    expect(playCount('l4', attempts, [{ levelId: 'l4', at: 2 }])).toBe(1);
  });
  it('counts plays that left no attempts (card-only levels)', () => {
    const results = [
      { levelId: 'l1', at: 1 },
      { levelId: 'l1', at: 2 },
      { levelId: 'l2', at: 3 },
    ];
    expect(playCount('l1', [], results)).toBe(2);
  });
  it('adds sessions to results that predate every attempt, and only ever grows as plays are added', () => {
    let attempts = [attempt('l4', 's1', 10)];
    const results = [{ levelId: 'l4', at: 5 }];
    let previous = playCount('l4', attempts, results);
    expect(previous).toBe(2);
    for (const s of ['s2', 's3', 's4']) {
      attempts = [...attempts, attempt('l4', s, 20 + previous)];
      const now = playCount('l4', attempts, results);
      expect(now).toBe(previous + 1);
      previous = now;
    }
  });
});

describe('practicePlayCount', () => {
  const attempt = (sessionKind: string | undefined, sessionId: string) => ({ sessionKind, sessionId });
  const result = (kind: string, sessionId: string) => ({ kind, sessionId });

  it('counts distinct sessions of the kind, from attempts and from results', () => {
    const attempts = [attempt('smart', 'a'), attempt('smart', 'a'), attempt('smart', 'b'), attempt('fresh', 'c'), attempt(undefined, 'd')];
    expect(practicePlayCount('smart', attempts, [])).toBe(2);
    expect(practicePlayCount('fresh', attempts, [])).toBe(1);
    expect(practicePlayCount('mistakes', attempts, [])).toBe(0);
    // A finished session counts once even though it has attempts too; a card session has results only.
    expect(practicePlayCount('smart', attempts, [result('smart', 'a'), result('smart', 'e')])).toBe(3);
    expect(practicePlayCount('cards', attempts, [result('cards', 'x'), result('daily_mission', 'y')])).toBe(1);
  });
});

describe('similarSeed', () => {
  it('stays inside the session block and avoids every seed the session used', () => {
    const base = 1_000_000_000;
    const used = new Set([base, base + 1, base + 2, base + 5]);
    const seed = similarSeed(base + 1, used)!;
    expect(isValidSeed(seed)).toBe(true);
    expect(used.has(seed)).toBe(false);
    expect(Math.floor(seed / 100)).toBe(Math.floor((base + 1) / 100));
  });
  it('wraps round the block and gives up when it is full', () => {
    const base = 300;
    const used = new Set(Array.from({ length: 99 }, (_, i) => base + i + 1));
    expect(similarSeed(base + 50, used)).toBe(base);
    used.add(base);
    expect(similarSeed(base + 50, used)).toBeNull();
  });
});
