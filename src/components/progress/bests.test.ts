import { describe, expect, it } from 'vitest';
import type { SessionResult } from '@/storage/types';
import { personalBests } from './bests';

const sr = (kind: SessionResult['kind'], correct: number, total: number, extra: Partial<SessionResult> = {}): SessionResult => ({
  id: `${kind}${correct}${total}`, profileId: 'p', courseId: 'c', kind, sessionId: 's', day: '2026-10-22', correct, total, at: 1, ...extra,
});

describe('personal bests', () => {
  it('are nothing for a new learner', () => {
    expect(personalBests([], {})).toEqual({ bestDayXp: 0, marathonStreak: 0, mock: null, caseStudy: null });
  });

  it('keep the best day, the longest marathon row, and the best paper and case by share right', () => {
    const bests = personalBests(
      [sr('marathon', 12, 15, { bestStreak: 9 }), sr('marathon', 30, 40, { bestStreak: 14 }), sr('mock', 50, 80), sr('mock', 18, 20), sr('case', 3, 6), sr('case', 5, 6), sr('smart', 10, 10)],
      { '2026-10-20': 40, '2026-10-21': 95 },
    );
    expect(bests).toEqual({ bestDayXp: 95, marathonStreak: 14, mock: { correct: 18, total: 20 }, caseStudy: { correct: 5, total: 6 } });
  });
});
