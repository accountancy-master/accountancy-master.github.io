import type { Paise } from '@/engine/money';

/**
 * Shares an amount (in paise) in a ratio so that the parts add up to it exactly: each part is rounded down, and the
 * paise left over go one each to the parts that lost the most in rounding (the first of them on a tie). A loss (a
 * negative amount) is shared the same way and stays negative. Weights are whole numbers, any size: the working is
 * in BigInt, so a ratio of large amounts (the interest due to each partner) is exact.
 */
export function splitByRatio(total: Paise, weights: readonly number[]): Paise[] {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (weights.some((w) => w < 0 || !Number.isInteger(w))) throw new Error('Weights must be whole numbers, none below nothing.');
  if (sumW === 0) return weights.map(() => 0);
  const sign = total < 0 ? -1 : 1;
  const abs = BigInt(Math.abs(total));
  const W = BigInt(sumW);
  const raw = weights.map((w) => abs * BigInt(w));
  const floors = raw.map((r) => r / W);
  const rems = raw.map((r, i) => ({ i, rem: r % W }));
  let left = Number(abs - floors.reduce((s, f) => s + f, BigInt(0)));
  rems.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const out = floors.map(Number);
  for (const r of rems) {
    if (left <= 0) break;
    out[r.i] += 1;
    left -= 1;
  }
  return out.map((p) => (p === 0 ? 0 : sign * p));
}

/** Whether a ratio shares this amount without any rounding to the paisa. */
export const splitsExactly = (total: Paise, weights: readonly number[]): boolean => {
  const sumW = weights.reduce((s, w) => s + w, 0);
  return sumW > 0 && weights.every((w) => (total * w) % sumW === 0);
};
