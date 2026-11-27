import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { schedule, type AssetKind, type DepInputs } from './schedule';

// Ready examples of the lab, and made-up figures that come out in whole rupees.

export interface DepExample {
  id: string;
  title: string;
  inputs: DepInputs;
}

export const EXAMPLES: readonly DepExample[] = [
  {
    id: 'slm-provision-loss',
    title: 'Straight line, provision kept, sold at a loss',
    inputs: {
      asset: 'machinery', startYear: 2022, purchaseMonth: 6, price: rupees(180000), extra: rupees(20000),
      method: 'slm', slmBasis: 'life', life: 5, scrap: rupees(20000), rate: 20,
      provision: true, years: 5, sale: { year: 3, month: 9, price: rupees(75000) },
    },
  },
  {
    id: 'wdv-asset-profit',
    title: 'Written down value, written off the asset, sold at a profit',
    inputs: {
      asset: 'vehicles', startYear: 2023, purchaseMonth: 3, price: rupees(470000), extra: rupees(30000),
      method: 'wdv', slmBasis: 'rate', life: 5, scrap: 0, rate: 20,
      provision: false, years: 5, sale: { year: 2, month: 6, price: rupees(320000) },
    },
  },
  {
    id: 'slm-rate-compare',
    title: 'Straight line at 10% on cost, five full years',
    inputs: {
      asset: 'furniture', startYear: 2021, purchaseMonth: 0, price: rupees(95000), extra: rupees(5000),
      method: 'slm', slmBasis: 'rate', life: 10, scrap: 0, rate: 10,
      provision: false, years: 5, sale: null,
    },
  },
];

/** The examples played in Watch: one for each way of recording, one for each method. */
export const WATCH_EXAMPLES = EXAMPLES.slice(0, 2);

const KINDS: AssetKind[] = ['machinery', 'furniture', 'vehicles', 'computers'];

/** Made-up figures for an asset, in whole rupees, not sold. */
export function randomInputs(rng: Rng): DepInputs {
  const asset = rng.pick(KINDS);
  const startYear = rng.int(2020, 2024);
  const purchaseMonth = rng.pick([0, 0, 3, 6, 9]);
  const method = rng.pick(['slm', 'wdv'] as const);
  const slmBasis = rng.pick(['life', 'rate'] as const);
  let cost: number;
  let life = 5;
  let scrap = 0;
  let rate = rng.pick([10, 15, 20]);
  if (method === 'slm' && slmBasis === 'life') {
    life = rng.pick([4, 5, 8, 10]);
    const annual = rng.step(8000, 48000, 4000);
    scrap = rng.step(0, 40000, 5000);
    cost = annual * life + scrap;
  } else if (method === 'slm') {
    cost = rng.step(100000, 500000, 20000);
  } else {
    rate = rng.pick([10, 20]);
    cost = rng.step(100000, 500000, 100000);
  }
  const extra = Math.min(rng.step(5000, 30000, 5000), Math.floor(cost / 4000) * 1000);
  return {
    asset, startYear, purchaseMonth, price: rupees(cost - extra), extra: rupees(extra),
    method, slmBasis, life, scrap: rupees(scrap), rate,
    provision: rng.int(0, 1) === 1, years: 5, sale: null,
  };
}

/** Made-up figures with a sale in the second to fourth year, at a profit or a loss in whole thousands. */
export function randomSale(rng: Rng, base: DepInputs = randomInputs(rng)): DepInputs {
  const year = rng.int(1, 3);
  const month = rng.pick([3, 6, 9]);
  const probe = schedule({ ...base, sale: { year, month, price: rupees(1) } });
  const bv = probe.sale!.bookValue / 100;
  const gap = rng.step(2000, 20000, 1000);
  const profit = rng.int(0, 1) === 0;
  let price = Math.round((profit ? bv + gap : bv - gap) / 1000) * 1000;
  if (price <= 0 || price === bv) price = Math.round(bv / 1000) * 1000 + 1000;
  return { ...base, sale: { year, month, price: rupees(price) } };
}
