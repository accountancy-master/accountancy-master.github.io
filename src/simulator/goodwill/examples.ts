import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { cmp, fr, ZERO } from '../partnership/fraction';
import { value, wholeRupees, type AdjKind, type GwAdjustment, type GwInputs, type GwMethod, type Valuation } from './valuation';

// Ready examples of the goodwill lab, and made-up firms whose every figure comes out in whole rupees.

export interface GwExample {
  id: string;
  title: string;
  inputs: GwInputs;
}

const NO_BOOKS = { goodwill: 0, nonTrade: 0, fictitious: 0 };

export const EXAMPLES: readonly GwExample[] = [
  {
    id: 'adjusted-super',
    title: 'Adjusted profits, super profit',
    inputs: {
      firm: 'Mehra & Kapoor',
      lastYear: 2025,
      profits: [rupees(150000), rupees(120000), rupees(190000), rupees(190000)],
      adjustments: [
        { kind: 'abnormalLoss', year: 1, amount: rupees(30000) },
        { kind: 'stockOver', year: 1, amount: rupees(10000) },
        { kind: 'abnormalGain', year: 2, amount: rupees(20000) },
      ],
      averaging: 'simple',
      weights: [1, 2, 3, 4],
      remuneration: rupees(25000),
      books: { trade: rupees(1080000), goodwill: rupees(50000), nonTrade: 0, fictitious: rupees(20000), outside: rupees(280000) },
      rate: 10,
      purchase: 3,
      method: 'super',
    },
  },
  {
    id: 'weighted-capitalised',
    title: 'Weighted average, capitalised',
    inputs: {
      firm: 'Iyer & Nair',
      lastYear: 2026,
      profits: [rupees(100000), rupees(130000), rupees(180000)],
      adjustments: [{ kind: 'repairsCapitalised', year: 2, amount: rupees(20000), rate: 10 }],
      averaging: 'weighted',
      weights: [1, 2, 3],
      remuneration: 0,
      books: { trade: rupees(900000), goodwill: 0, nonTrade: rupees(100000), fictitious: 0, outside: rupees(150000) },
      rate: 15,
      purchase: 2,
      method: 'capAverage',
    },
  },
  {
    id: 'loss-no-super',
    title: 'A loss year, no super profit',
    inputs: {
      firm: 'Desai & Patel',
      lastYear: 2025,
      profits: [rupees(80000), rupees(-20000), rupees(110000), rupees(90000), rupees(140000)],
      adjustments: [],
      averaging: 'simple',
      weights: [1, 2, 3, 4, 5],
      remuneration: 0,
      books: { trade: rupees(950000), ...NO_BOOKS, outside: rupees(150000) },
      rate: 12,
      purchase: 2,
      method: 'super',
    },
  },
];

/** The examples played in Watch: the simple average with corrections and the super profit, then the weighted average capitalised. */
export const WATCH_EXAMPLES = EXAMPLES.slice(0, 2);

const FIRMS = ['Mehra & Kapoor', 'Iyer & Nair', 'Desai & Patel', 'Bose & Sen', 'Reddy & Rao', 'Gill & Sandhu', 'Joshi & Patil', 'Khan & Ansari', 'Agarwal & Jain', 'Das & Mohanty'];
const RATES = [8, 10, 12, 15, 20];
const PURCHASES = [2, 3, 4, 2.5, 1.5];

/** One adjustment of a kind, in whole thousands. */
function drawAdjustment(rng: Rng, kind: AdjKind, k: number, taken: Set<string>): GwAdjustment | null {
  const year = kind === 'repairsCapitalised' ? k - 1 : kind === 'stockOver' || kind === 'stockUnder' ? rng.int(0, k - 2) : rng.int(0, k - 1);
  const key = `${kind}-${year}`;
  if (taken.has(key)) return null;
  taken.add(key);
  if (kind === 'repairsCapitalised') return { kind, year, amount: rupees(rng.step(10000, 60000, 10000)), rate: rng.pick([10, 20]) };
  return { kind, year, amount: rupees(rng.step(5000, 40000, 5000)) };
}

/**
 * A made-up firm: three to five years, perhaps a loss year, up to two corrections, perhaps a remuneration, and a
 * capital employed that leaves a super profit of up to one and a half times the normal profit. The figures asked by
 * the method chosen (and the average) all come out in whole rupees. `method` fixes the method; null leaves it to the
 * draw.
 */
export function randomInputs(rng: Rng, method: GwMethod | null = null): GwInputs {
  for (let attempt = 0; attempt < 200; attempt++) {
    const got = draw(rng, method);
    if (got) return got;
  }
  return EXAMPLES[0].inputs;
}

function draw(rng: Rng, fixed: GwMethod | null): GwInputs | null {
  const k = rng.pick([3, 4, 4, 5]);
  const averaging = rng.int(0, 2) === 0 ? 'weighted' : 'simple';
  const weights = Array.from({ length: k }, (_, i) => i + 1);
  const method: GwMethod = fixed ?? rng.pick(['average', 'super', 'super', 'capAverage', 'capSuper']);
  // Profits in thousands, rising for a weighted average; now and then a loss year in a simple one.
  const base = rng.step(80000, 240000, 10000);
  const profits = Array.from({ length: k }, (_, i) => (averaging === 'weighted' ? base + i * rng.step(10000, 40000, 5000) : rng.step(base - 40000, base + 60000, 5000)));
  if (averaging === 'simple' && rng.int(0, 4) === 0) profits[rng.int(0, k - 2)] = -rng.step(10000, 40000, 5000);
  const taken = new Set<string>();
  const kinds: AdjKind[] = ['abnormalLoss', 'abnormalGain', 'stockOver', 'stockUnder', 'omittedExpense', 'repairsCapitalised'];
  const adjustments = rng
    .shuffle(kinds)
    .slice(0, rng.int(0, 2))
    .map((kind) => drawAdjustment(rng, kind, k, taken))
    .filter((a): a is GwAdjustment => a !== null);
  const remuneration = rng.int(0, 2) === 0 ? rng.step(12000, 60000, 6000) : 0;
  const inputs: GwInputs = {
    firm: rng.pick(FIRMS),
    lastYear: rng.pick([2024, 2025, 2026]),
    profits: profits.map(rupees),
    adjustments,
    averaging,
    weights,
    remuneration: rupees(remuneration),
    books: { trade: 0, goodwill: 0, nonTrade: 0, fictitious: 0, outside: 0 },
    rate: rng.pick(RATES),
    purchase: rng.pick(PURCHASES),
    method,
  };
  // The average in whole thousands: the first year takes up the difference.
  const probe = value({ ...inputs, books: { ...inputs.books, trade: 100 } });
  const unit = (averaging === 'weighted' ? probe.weightTotal : k) * 100000;
  const scaled = averaging === 'weighted' ? probe.products : probe.total;
  const gap = ((unit - (scaled % unit)) % unit) / (averaging === 'weighted' ? weights[0] : 1);
  if (!Number.isInteger(gap)) return null;
  inputs.profits[0] += gap;
  const v0 = value({ ...inputs, books: { ...inputs.books, trade: 100 } });
  if (v0.years.some((y) => y.normal === 0) || cmp(v0.averageAfter, fr(rupees(40000))) < 0) return null;
  const avg = v0.averageAfter.n / v0.averageAfter.d / 100;
  // Capital employed: the normal profit is what is left after a super profit of 15% to 60% of the average.
  const superShare = rng.pick([0.15, 0.25, 0.35, 0.45, 0.6]);
  const capital = Math.round(((avg * (1 - superShare)) * 100) / inputs.rate / 10000) * 10000;
  if (capital < 100000) return null;
  const outside = rng.step(50000, 300000, 10000);
  const extra = rng.int(0, 2);
  const books = {
    trade: rupees(capital + outside),
    goodwill: extra === 1 ? rupees(rng.step(20000, 100000, 10000)) : 0,
    nonTrade: extra === 2 ? rupees(rng.step(50000, 150000, 10000)) : 0,
    fictitious: extra > 0 && rng.int(0, 1) === 0 ? rupees(rng.step(10000, 40000, 5000)) : 0,
    outside: rupees(outside),
  };
  const done: GwInputs = { ...inputs, books };
  return fits(value(done)) ? done : null;
}

/** Every figure the valuation asks of its method, in whole rupees, with a super profit that is there but not huge. */
export function fits(v: Valuation): boolean {
  const m = v.inputs.method;
  const need = [v.average, v.averageAfter, v.normalProfit, v.superProfit, v.raw[m], v.capitalisedValue, v.raw.capSuper];
  const sp = v.superProfit;
  return (
    need.every(wholeRupees) &&
    cmp(sp, ZERO) > 0 &&
    // No more than one and a half times the normal profit, as the topic's questions keep it.
    cmp(sp, fr(Math.floor((v.normalProfit.n * 3) / (2 * v.normalProfit.d)))) <= 0
  );
}
