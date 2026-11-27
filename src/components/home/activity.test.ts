import { describe, expect, it } from 'vitest';
import { findOutline } from '@/content/outline';
import type { LevelResult, SessionResult } from '@/storage/types';
import { recentActivity, whenText } from './activity';

const JE = 'journal-entries';
const level = findOutline(JE)!.levels.find((l) => l.order === 2)!;
const lr = (id: string, at: number, passed: boolean): LevelResult => ({ id, profileId: 'p', topicId: JE, levelId: level.id, score: passed ? 0.9 : 0.4, passed, at });
const sr = (id: string, at: number, kind: SessionResult['kind'], correct: number, total: number): SessionResult => ({ id, profileId: 'p', courseId: 'cbse-11-accountancy', kind, sessionId: id, day: '2026-10-22', correct, total, at });

describe('recent activity', () => {
  it('lists levels and sessions newest first, each with where to do it again', () => {
    const items = recentActivity([lr('a', 10, true), lr('b', 30, false)], [sr('c', 20, 'smart', 7, 10), sr('d', 40, 'mock', 52, 80)]);
    expect(items.map((i) => i.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(items[0]).toMatchObject({ title: 'Mock paper', detail: '52 of 80 marks', href: '/mock', good: true });
    expect(items[1]).toMatchObject({ title: `Played level 2, ${level.title}`, href: `/play/${level.id}`, good: false });
    expect(items[1].detail).toContain('40%');
    expect(items[2]).toMatchObject({ title: 'Smart practice', detail: '7 of 10 right', href: '/practice/smart' });
    expect(items[3].title).toMatch(/^Passed level 2/);
  });

  it('keeps the newest few', () => {
    const many = Array.from({ length: 9 }, (_, i) => sr(`s${i}`, i, 'fresh', 1, 2));
    expect(recentActivity([], many, 6).map((i) => i.id)).toEqual(['s8', 's7', 's6', 's5', 's4', 's3']);
  });

  it('says when, in days', () => {
    const at = new Date(2026, 9, 22, 15).getTime();
    expect(whenText(at, '2026-10-22')).toBe('Today');
    expect(whenText(at, '2026-10-23')).toBe('Yesterday');
    expect(whenText(at, '2026-10-26')).toBe('4 days ago');
  });
});
