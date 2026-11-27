import type { Difficulty } from '@/content/types';
import { CONFIG } from './config';

export const DAY_MS = 86400000;

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export const hintFactor = (hintsUsed: number): number => CONFIG.hintFactors[hintsUsed] ?? 0;

export function applyAttempt(
  mastery: number,
  a: { correct: boolean; difficulty: Difficulty; hintsUsed: number },
): number {
  if (!a.correct) return clamp(mastery - CONFIG.mastery.wrongPenalty);
  // Gains taper as mastery grows, so the last stretch needs sustained accuracy.
  const gain = CONFIG.mastery.gain[a.difficulty] * hintFactor(a.hintsUsed) * (1 - mastery / 200);
  return clamp(mastery + gain);
}

export function decay(mastery: number, daysSince: number): number {
  const { decayGraceDays, decayPerDay, decayFloorRatio } = CONFIG.mastery;
  const lost = Math.max(0, Math.floor(daysSince) - decayGraceDays) * decayPerDay;
  return Math.max(mastery * decayFloorRatio, mastery - lost);
}
