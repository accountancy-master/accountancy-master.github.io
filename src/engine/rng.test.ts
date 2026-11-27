import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('differs between seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
  it('keeps int and step within range', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      const s = r.step(1000, 5000, 500);
      expect(s % 500).toBe(0);
      expect(s).toBeGreaterThanOrEqual(1000);
      expect(s).toBeLessThanOrEqual(5000);
    }
  });
  it('shuffles without losing items', () => {
    const out = createRng(3).shuffle([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
