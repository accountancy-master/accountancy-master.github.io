import { describe, expect, it } from 'vitest';
import { applyAttempt, decay, hintFactor } from './mastery';

describe('mastery', () => {
  it('rises on a correct answer and falls on a wrong one', () => {
    expect(applyAttempt(0, { correct: true, difficulty: 'easy', hintsUsed: 0 })).toBe(8);
    expect(applyAttempt(50, { correct: false, difficulty: 'easy', hintsUsed: 0 })).toBe(40);
  });
  it('gives more for harder questions and less with hints', () => {
    const plain = applyAttempt(20, { correct: true, difficulty: 'medium', hintsUsed: 0 });
    const hinted = applyAttempt(20, { correct: true, difficulty: 'medium', hintsUsed: 1 });
    const hard = applyAttempt(20, { correct: true, difficulty: 'complex', hintsUsed: 0 });
    expect(hinted).toBeLessThan(plain);
    expect(hard).toBeGreaterThan(plain);
  });
  it('gives nothing when the answer was revealed', () => {
    expect(hintFactor(3)).toBe(0);
    expect(applyAttempt(30, { correct: true, difficulty: 'easy', hintsUsed: 3 })).toBe(30);
  });
  it('never jumps to full and stays within 0 to 100', () => {
    expect(applyAttempt(0, { correct: true, difficulty: 'complex', hintsUsed: 0 })).toBeLessThan(100);
    expect(applyAttempt(99.9, { correct: true, difficulty: 'complex', hintsUsed: 0 })).toBeLessThanOrEqual(100);
    expect(applyAttempt(3, { correct: false, difficulty: 'easy', hintsUsed: 0 })).toBe(0);
  });
  it('gains shrink as mastery grows', () => {
    const low = applyAttempt(10, { correct: true, difficulty: 'easy', hintsUsed: 0 }) - 10;
    const high = applyAttempt(90, { correct: true, difficulty: 'easy', hintsUsed: 0 }) - 90;
    expect(high).toBeLessThan(low);
  });
  it('decays only after the grace period and not below the floor', () => {
    expect(decay(80, 10)).toBe(80);
    expect(decay(80, 24)).toBe(70);
    expect(decay(80, 400)).toBe(48);
  });
});
