import { describe, expect, it } from 'vitest';
import '@/content/registry';
import { parseCasePartId, parseGenId } from '@/generators';
import { coursePatterns, findPattern } from './patterns';
import { MARATHON_SEED_BASE } from './marathon';
import { MOCK_SEED_BASE } from './mockPaper';
import { dailySeed, practiceSeed } from './practice';
import {
  MAX_PLAYGROUND_PLAYS,
  PLAYGROUND_SEED_BASE,
  SEEDS_PER_PLAY,
  isPlaygroundSeed,
  pickPattern,
  playgroundPlayCount,
  playgroundSeed,
  playgroundUnit,
} from './playground';

const ledger = coursePatterns('cbse-11-accountancy').filter((p) => p.topicId === 'ledger');
const aCase = coursePatterns('cbse-11-accountancy').find((p) => p.kind === 'case')!;

describe('the seeds of the Playground', () => {
  it('give each play a block of its own, above every other kind of session and below the mock papers', () => {
    expect(playgroundSeed(0)).toBe(PLAYGROUND_SEED_BASE);
    expect(playgroundSeed(1)).toBe(PLAYGROUND_SEED_BASE + SEEDS_PER_PLAY);
    const last = playgroundSeed(MAX_PLAYGROUND_PLAYS - 1) + SEEDS_PER_PLAY - 1;
    expect(last).toBeLessThan(MOCK_SEED_BASE);
    expect(MOCK_SEED_BASE).toBeLessThan(MARATHON_SEED_BASE);
    expect(practiceSeed('case', 9_999) + 99).toBeLessThan(PLAYGROUND_SEED_BASE);
    expect(dailySeed('2400-01-01') + 99).toBeLessThan(PLAYGROUND_SEED_BASE);
    expect(() => playgroundSeed(-1)).toThrow();
    expect(() => playgroundSeed(MAX_PLAYGROUND_PLAYS)).toThrow();
    expect(() => playgroundSeed(1.5)).toThrow();
  });

  it('are told apart from the others', () => {
    expect(isPlaygroundSeed(PLAYGROUND_SEED_BASE)).toBe(true);
    expect(isPlaygroundSeed(playgroundSeed(7) + 123)).toBe(true);
    expect(isPlaygroundSeed(PLAYGROUND_SEED_BASE - 1)).toBe(false);
    expect(isPlaygroundSeed(MOCK_SEED_BASE)).toBe(false);
  });

  it('count the plays that left an answer, whatever kind of session recorded them', () => {
    const gen = (template: string, seed: number) => `gen:${template}:1:${seed}`;
    const attempts = [
      { sessionId: 'a', questionId: gen('led-x', playgroundSeed(0)) },
      { sessionId: 'a', questionId: gen('led-y', playgroundSeed(0) + 1) },
      { sessionId: 'b', questionId: gen('led-x', practiceSeed('fresh', 0)) },
      { sessionId: 'c', questionId: 'ledger-q-001' },
      { sessionId: 'd', questionId: gen('case-cycle-first-month~2', playgroundSeed(1) + 4) },
    ];
    expect(playgroundPlayCount(attempts)).toBe(2);
    expect(playgroundPlayCount([])).toBe(0);
  });
});

describe('choosing the next pattern of a mix', () => {
  const ids = ledger.slice(0, 6).map((p) => p.id);

  it('is the one pattern when there is one', () => {
    for (let i = 0; i < 5; i++) expect(pickPattern([ids[0]], 100, i, ids[0])).toBe(ids[0]);
  });

  it('is the same for the same seed and position, never the pattern just played, and reaches every pattern', () => {
    const seen = new Set<string>();
    let last: string | undefined;
    for (let position = 0; position < 200; position++) {
      const id = pickPattern(ids, playgroundSeed(3), position, last);
      expect(pickPattern(ids, playgroundSeed(3), position, last)).toBe(id);
      expect(id).not.toBe(last);
      expect(ids).toContain(id);
      seen.add(id);
      last = id;
    }
    expect(seen.size).toBe(ids.length);
  });

  it('throws when there is nothing to choose from', () => {
    expect(() => pickPattern([], 1, 0)).toThrow();
  });
});

describe('a unit of play', () => {
  it('is one question of a template, from the seed', () => {
    const p = ledger[0];
    const [q, ...more] = playgroundUnit(p, playgroundSeed(0) + 5);
    expect(more).toEqual([]);
    expect(parseGenId(q.id)).toMatchObject({ templateId: p.id, seed: playgroundSeed(0) + 5 });
    expect(playgroundUnit(p, playgroundSeed(0) + 5)[0]).toEqual(q);
  });

  it('is every question of a case, in order, on one seed', () => {
    const unit = playgroundUnit(aCase, playgroundSeed(0) + 2);
    expect(unit.length).toBe(findPattern(aCase.id)!.parts.length);
    unit.forEach((q, i) => {
      const gen = parseGenId(q.id)!;
      expect(gen.seed).toBe(playgroundSeed(0) + 2);
      expect(parseCasePartId(gen.templateId)).toEqual({ caseId: aCase.id, index: i });
      expect(q.context).toBeTruthy();
    });
  });
});
