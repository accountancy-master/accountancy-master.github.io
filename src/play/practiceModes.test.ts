import { describe, expect, it } from 'vitest';
import { SESSION_KINDS } from '@/storage/types';
import { PRACTICE_MODES, allowsSimilar, kindForMode, sessionResultDay } from './practiceModes';

describe('practice modes', () => {
  it('maps every mode to a practice session kind, mission and daily to their bonus kinds', () => {
    for (const mode of PRACTICE_MODES) {
      expect(SESSION_KINDS).toContain(kindForMode(mode));
      expect(kindForMode(mode)).not.toBe('level');
    }
    expect(kindForMode('mission')).toBe('daily_mission');
    expect(kindForMode('daily')).toBe('daily_challenge');
    expect(new Set(PRACTICE_MODES.map(kindForMode)).size).toBe(PRACTICE_MODES.length);
  });
  it('records a daily challenge for the day it was started, and every other session for the day it finished', () => {
    const evening = new Date(2026, 9, 5, 23, 50).getTime();
    const nextMorning = new Date(2026, 9, 6, 0, 10).getTime();
    expect(sessionResultDay('daily_challenge', evening, nextMorning)).toBe('2026-10-05');
    for (const kind of SESSION_KINDS.filter((k) => k !== 'daily_challenge')) {
      expect(sessionResultDay(kind, evening, nextMorning), kind).toBe('2026-10-06');
    }
    expect(sessionResultDay('daily_challenge', evening, evening)).toBe('2026-10-05');
  });
  it('offers a similar question everywhere except the daily challenge and mistake review', () => {
    expect(SESSION_KINDS.filter((k) => !allowsSimilar(k)).sort()).toEqual(['daily_challenge', 'mistakes']);
  });
});
