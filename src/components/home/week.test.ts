import { describe, expect, it } from 'vitest';
import { barPercent, weekDays } from './week';

describe('weekDays', () => {
  it('runs Monday to Sunday around a mid-week day and marks past, today and future', () => {
    // 2026-10-07 is a Wednesday.
    const days = weekDays('2026-10-07', { '2026-10-05': 40, '2026-10-07': 30, '2026-10-12': 99 });
    expect(days.map((d) => d.day)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(days.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days.map((d) => d.state)).toEqual(['past', 'past', 'today', 'future', 'future', 'future', 'future']);
    expect(days.map((d) => d.xp)).toEqual([40, 0, 30, 0, 0, 0, 0]);
  });

  it('starts on that Monday when today is Monday and ends today-plus-six when today is Sunday', () => {
    expect(weekDays('2026-10-05', {})[0]).toMatchObject({ day: '2026-10-05', label: 'Mon', state: 'today' });
    const sunday = weekDays('2026-10-11', {});
    expect(sunday[0].day).toBe('2026-10-05');
    expect(sunday[6]).toMatchObject({ day: '2026-10-11', label: 'Sun', state: 'today' });
  });

  it('crosses month and year boundaries', () => {
    // 2026-01-01 is a Thursday; its week starts on Monday 2025-12-29.
    const days = weekDays('2026-01-01', { '2025-12-31': 12 });
    expect(days.map((d) => d.day)).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);
    expect(days[2].xp).toBe(12);
  });
});

describe('barPercent', () => {
  it('scales to the largest day, keeps a small day visible and gives an empty day nothing', () => {
    expect(barPercent(100, 100)).toBe(100);
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(1, 400)).toBeGreaterThan(0);
    expect(barPercent(1, 400)).toBeGreaterThanOrEqual(10);
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
  });
});
