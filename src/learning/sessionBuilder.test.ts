import { describe, expect, it } from 'vitest';
// The whole question bank is registered first: nothing here loads a topic, as the app does before it plays one.
import '@/content/registry';
import { STARTER_PACK } from '@/testing/starterPack';
import { buildLevelSession, countScored, lessonOnly, replayOrder, type SessionItem } from './sessionBuilder';
import { levelSeed } from '@/play/seed';

const pack = STARTER_PACK;
const level = (n: number) => pack.levels[n];
const templateSequence = (items: SessionItem[]) =>
  items.map((i) => (i.kind === 'question' ? i.question.id.split(':')[1] : ''));

describe('buildLevelSession', () => {
  it('builds a concept level as a lesson followed by its check questions', () => {
    const items = buildLevelSession(level(0), pack, 1);
    expect(items[0].kind).toBe('lesson');
    expect(items.slice(1).map((i) => i.kind)).toEqual(['question']);
    expect(countScored(items)).toBe(1);
  });

  it('builds a card level from its cards', () => {
    const items = buildLevelSession(level(1), pack, 1);
    expect(items).toHaveLength(pack.cards.length);
    expect(items.every((i) => i.kind === 'card')).toBe(true);
    expect(countScored(items)).toBe(0);
  });

  it('builds an authored-question level in the listed order', () => {
    const items = buildLevelSession(level(2), pack, 1);
    expect(items.map((i) => (i.kind === 'question' ? i.question.id : ''))).toEqual(level(2).questionIds);
  });

  it('generates the requested number of distinct questions, using every template', () => {
    const items = buildLevelSession(level(4), pack, 500);
    expect(items).toHaveLength(8);
    const ids = items.map((i) => (i.kind === 'question' ? i.question.id : ''));
    expect(new Set(ids).size).toBe(8);
    const used = new Set(ids.map((id) => id.split(':')[1]));
    expect(used.size).toBe(level(4).generate!.templateIds.length);
  });

  it('is deterministic for a seed and different for another', () => {
    expect(buildLevelSession(level(10), pack, 77)).toEqual(buildLevelSession(level(10), pack, 77));
    expect(buildLevelSession(level(10), pack, 78)).not.toEqual(buildLevelSession(level(10), pack, 77));
  });

  describe('mixed levels', () => {
    const full = () => level(10).generate!.templateIds;

    it('can serve every listed template across seeds', () => {
      const served = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) for (const t of templateSequence(buildLevelSession(level(10), pack, seed))) served.add(t);
      expect([...served].sort()).toEqual([...full()].sort());
    });

    it('serves ten distinct questions in one session', () => {
      for (let seed = 1; seed <= 20; seed++) {
        const ids = buildLevelSession(level(10), pack, seed).map((i) => (i.kind === 'question' ? i.question.id : ''));
        expect(new Set(ids).size).toBe(10);
      }
    });

    it('does not serve the same listed prefix every time', () => {
      const cycling = Array.from({ length: 10 }, (_, i) => full()[i % full().length]);
      const differs = Array.from({ length: 60 }, (_, k) => k + 1).some(
        (seed) => templateSequence(buildLevelSession(level(10), pack, seed)).join() !== cycling.join(),
      );
      expect(differs).toBe(true);
    });

    it('serves challenge level 11 templates from its list only, and all of them over seeds', () => {
      const served = new Set<string>();
      for (let seed = 1; seed <= 60; seed++) for (const t of templateSequence(buildLevelSession(level(11), pack, seed))) served.add(t);
      expect([...served].sort()).toEqual([...new Set(level(11).generate!.templateIds)].sort());
    });
  });

  it('keeps listed cycling order for a non-shuffled generated level', () => {
    const listed = level(4).generate!.templateIds;
    for (const seed of [1, 500]) {
      expect(templateSequence(buildLevelSession(level(4), pack, seed))).toEqual(
        Array.from({ length: 8 }, (_, i) => listed[i % listed.length]),
      );
    }
  });

  it('throws when a generated level lists no templates', () => {
    const empty = { ...level(4), generate: { templateIds: [], count: 3 } };
    expect(() => buildLevelSession(empty, pack, 1)).toThrow(`Level ${empty.id} has no templates`);
  });

  it('rejects a seed that is not a non-negative safe integer', () => {
    for (const bad of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => buildLevelSession(level(4), pack, bad)).toThrow(`Invalid seed: ${bad}`);
    }
  });
  it('marks the checks of a lesson, and only a lesson level is lesson-only', () => {
    const items = buildLevelSession(level(0), pack, 1);
    expect(items.filter((i) => i.kind === 'question').every((i) => i.kind === 'question' && i.check === true)).toBe(true);
    expect(lessonOnly(items)).toBe(true);
    expect(lessonOnly(buildLevelSession(level(2), pack, 1))).toBe(false);
    expect(lessonOnly(buildLevelSession(level(1), pack, 1))).toBe(false);
  });

  it('asks the authored questions in the listed order on the first play, and in another order on every replay', () => {
    const ids = (seed: number) => buildLevelSession(level(2), pack, seed).map((i) => (i.kind === 'question' ? i.question.id : ''));
    const listed = level(2).questionIds!;
    expect(listed.length).toBeGreaterThan(1);
    expect(ids(levelSeed(2, 0))).toEqual(listed);
    const orders = new Set<string>();
    for (let play = 1; play <= 8; play++) {
      const order = ids(levelSeed(2, play));
      expect([...order].sort()).toEqual([...listed].sort());
      expect(order).not.toEqual(listed);
      // The same play always gives the same order.
      expect(ids(levelSeed(2, play))).toEqual(order);
      orders.add(order.join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('never gives the listed order back from replayOrder, unless there is one question or none', () => {
    for (let seed = 0; seed < 200; seed++) expect(replayOrder(['a', 'b'], seed)).toEqual(['b', 'a']);
    expect(replayOrder(['a'], 5)).toEqual(['a']);
    expect(replayOrder([], 5)).toEqual([]);
  });
});

