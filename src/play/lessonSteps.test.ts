import { describe, expect, it } from 'vitest';
import '@/content/registry';
import { ALL_PACKS } from '@/content/registry';
import type { LessonBlock } from '@/content/types';
import { lessonSteps, SHORT_TEXT_WORDS } from './lessonSteps';

const text = (words: number, heading = 'H'): LessonBlock => ({ type: 'text', heading, body: Array.from({ length: words }, () => 'w').join(' ') });
const table: LessonBlock = { type: 'table', title: 'T', rows: [{ label: 'a', amount: '₹1' }] };
const working: LessonBlock = { type: 'working', title: 'W', lines: ['1', '2'] };
const example: LessonBlock = { type: 'example', title: 'E', lines: [{ accountId: 'cash', side: 'Dr', amount: 100 }, { accountId: 'capital', side: 'Cr', amount: 100 }], note: 'n' };
const check: LessonBlock = { type: 'check', questionId: 'q' };

describe('lessonSteps', () => {
  it('shows one block to a step, and leaves the checks out', () => {
    const steps = lessonSteps([text(80), text(90), table, check]);
    expect(steps.map((s) => s.map((b) => b.type))).toEqual([['text'], ['text'], ['table']]);
  });

  it('puts a short text with the worked example or table after it, and two short texts together', () => {
    const steps = lessonSteps([text(20), example, text(20), text(20), working, text(SHORT_TEXT_WORDS - 1), table, check]);
    expect(steps.map((s) => s.map((b) => b.type))).toEqual([['text', 'example'], ['text', 'text'], ['working'], ['text', 'table']]);
  });

  it('never puts two examples in one step, nor more than two blocks', () => {
    const steps = lessonSteps([text(10), example, working, table, text(5), text(5), text(5)]);
    for (const step of steps) {
      expect(step.length).toBeLessThanOrEqual(2);
      expect(step.filter((b) => b.type !== 'text').length).toBeLessThanOrEqual(1);
    }
    expect(steps.flat()).toHaveLength(7);
  });

  it('keeps every block of every lesson exactly once and in order, in steps of at most two blocks', () => {
    for (const pack of ALL_PACKS) {
      for (const level of pack.levels) {
        if (!level.lesson) continue;
        const steps = lessonSteps(level.lesson);
        expect(steps.flat()).toEqual(level.lesson.filter((b) => b.type !== 'check'));
        expect(steps.every((s) => s.length >= 1 && s.length <= 2)).toBe(true);
        // A lesson of several blocks is read in several steps, not as one wall.
        if (level.lesson.filter((b) => b.type !== 'check').length > 2) expect(steps.length).toBeGreaterThan(1);
      }
    }
  });

  it('copes with 20 blocks and with none', () => {
    const many = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? text(60) : working));
    expect(lessonSteps(many)).toHaveLength(20);
    expect(lessonSteps([check])).toEqual([]);
  });
});
