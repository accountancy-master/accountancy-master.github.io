// ---------------------------------------------------------------------------------------------------------------
// Exact fractions for profit-sharing ratios: a share of 3/10 stays 3/10, never 0.30000000000000004. The figures of a
// ratio question are small, so plain numbers hold every numerator and denominator exactly.
// ---------------------------------------------------------------------------------------------------------------

export interface Fr {
  /** Numerator; may be negative (a gain shown as a negative sacrifice). */
  n: number;
  /** Denominator, always positive. */
  d: number;
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export const lcm = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b));

/** A fraction in lowest terms with a positive denominator. */
export function fr(n: number, d = 1): Fr {
  if (d === 0) throw new Error('A fraction cannot have a denominator of nothing.');
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error(`Not a fraction of whole numbers: ${n}/${d}`);
  if (n === 0) return { n: 0, d: 1 };
  const g = gcd(n, d);
  const s = d < 0 ? -1 : 1;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const ZERO: Fr = { n: 0, d: 1 };
export const ONE: Fr = { n: 1, d: 1 };

export const add = (a: Fr, b: Fr): Fr => fr(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Fr, b: Fr): Fr => fr(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Fr, b: Fr): Fr => fr(a.n * b.n, a.d * b.d);
export const div = (a: Fr, b: Fr): Fr => fr(a.n * b.d, a.d * b.n);
export const cmp = (a: Fr, b: Fr): number => a.n * b.d - b.n * a.d;
export const eq = (a: Fr, b: Fr): boolean => cmp(a, b) === 0;
export const isZero = (a: Fr): boolean => a.n === 0;
export const sum = (xs: readonly Fr[]): Fr => xs.reduce(add, ZERO);
export const value = (a: Fr): number => a.n / a.d;

/** "3/10", or "1" for a whole one. */
export const frText = (a: Fr): string => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);

/** The shares of a ratio: 3:2 gives 3/5 and 2/5. */
export function sharesOf(terms: readonly number[]): Fr[] {
  const total = terms.reduce((s, t) => s + t, 0);
  return terms.map((t) => fr(t, total));
}

/**
 * The ratio of some fractions in whole numbers and lowest terms: 3/20, 2/20 gives 3:2. Zeros stay zeros (a partner
 * with no part in it); all zeros give all zeros.
 */
export function ratioOf(xs: readonly Fr[]): number[] {
  const dens = xs.filter((x) => x.n !== 0).reduce((l, x) => lcm(l, x.d), 1);
  const whole = xs.map((x) => (x.n * dens) / x.d);
  const g = whole.reduce((a, b) => gcd(a, b), 0);
  return g === 0 ? whole : whole.map((w) => w / g);
}

/** "3:2:1". */
export const ratioText = (terms: readonly number[]): string => terms.join(':');

/** Reads a ratio typed by a student: "3:2", "3 : 2", "3/2" is not a ratio. Null when it is not one. */
export function parseRatio(text: string): number[] | null {
  const parts = text.split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const terms = parts.map(Number);
  return terms.some((t) => t > 0) ? terms : null;
}

/** Whether two ratios are the same once both are in lowest terms (3:2 and 6:4 are). */
export function sameRatio(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const low = (t: readonly number[]) => {
    const g = t.reduce((x, y) => gcd(x, y), 0);
    return g === 0 ? [...t] : t.map((x) => x / g);
  };
  const la = low(a);
  const lb = low(b);
  return la.every((x, i) => x === lb[i]);
}

/** Whether a ratio is in its lowest terms (6:4 is not). */
export const inLowestTerms = (t: readonly number[]): boolean => t.reduce((x, y) => gcd(x, y), 0) === 1;
