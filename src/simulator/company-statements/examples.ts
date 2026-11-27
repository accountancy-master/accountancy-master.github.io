import { rupees } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { isAssetSub, ITEMS, SUB_ORDER, type Sub } from './heads';
import { faceRows, problemOf, totalOf, type Company, type Holding, type PlData } from './sheet';

// Ready companies of the lab, and made-up ones. The figures of a ready company are chosen so that every percentage
// of its statements comes out exact or well clear of a half-way point.

const h = (id: string, rs: number): Holding => ({ id, amount: rupees(rs) });
const pr = (a: number, b: number): [number, number] => [rupees(a), rupees(b)];
const prev = (o: Partial<Record<Sub, number>>): Partial<Record<Sub, number>> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rupees(v)]));

/** A manufacturer whose balance sheet comes to ₹40,00,000 (₹32,00,000 a year before) and whose revenue grew by a quarter. */
export const GIRNAR: Company = {
  name: 'Girnar Ltd.',
  dates: ['31 March 2025', '31 March 2026'],
  holdings: [
    h('equity', 2200000), h('arrears', 20000),
    h('sp', 200000), h('gr', 300000), h('surplus', 220000),
    h('debentures', 500000),
    h('gratuity', 80000),
    h('overdraft', 60000),
    h('creditors', 240000), h('billsPayable', 60000),
    h('salaries', 40000),
    h('tax', 120000),
    h('building', 1000000), h('plant', 1400000),
    h('goodwill', 200000),
    h('subsidiary', 300000),
    h('finished', 250000), h('looseTools', 30000),
    h('debtors', 210000),
    h('bank', 590000),
    h('prepaid', 20000),
  ],
  prev: prev({ shareCapital: 1600000, reserves: 560000, ltb: 480000, ltp: 64000, stb: 96000, tp: 240000, ocl: 48000, stp: 112000, ppe: 2000000, intangible: 200000, nci: 160000, inv: 240000, tr: 200000, cash: 368000, oca: 32000 }),
  pl: {
    years: ['2024-25', '2025-26'],
    rev: pr(4000000, 5000000),
    oi: pr(100000, 150000),
    exp: [
      { name: 'Cost of materials consumed', v: pr(2200000, 2800000) },
      { name: 'Employee benefits expense', v: pr(600000, 750000) },
      { name: 'Finance costs', v: pr(40000, 45000) },
      { name: 'Depreciation and amortisation expense', v: pr(200000, 240000) },
      { name: 'Other expenses', v: pr(360000, 415000) },
    ],
    rate: 30,
  },
};

/** A company with an accumulated loss (smaller than a year before), a building going up, capital advances and a deposit: the harder tiles. */
export const SUTLEJ: Company = {
  name: 'Sutlej Ltd.',
  dates: ['31 March 2025', '31 March 2026'],
  holdings: [
    h('equity', 3000000),
    h('sp', 300000), h('loss', 120000),
    h('termLoan', 600000), h('deposits', 400000),
    h('cashCredit', 100000), h('maturities', 100000),
    h('billsPayable', 140000),
    h('advanceCalls', 20000), h('accruedInterest', 40000),
    h('leave', 20000),
    h('plant', 2000000), h('computers', 200000),
    h('patents', 300000),
    h('construction', 800000),
    h('capitalAdvance', 200000),
    h('deposit', 50000),
    h('rawMaterials', 300000), h('wip', 100000),
    h('billsReceivable', 150000),
    h('cheques', 50000), h('bank', 400000),
    h('supplierAdvance', 50000),
  ],
  prev: prev({ shareCapital: 3000000, reserves: 120000, ltb: 1200000, stb: 100000, tp: 120000, ocl: 50000, stp: 30000, ppe: 2300000, intangible: 350000, cwip: 200000, onca: 50000, inv: 350000, tr: 180000, cash: 1090000, stla: 100000 }),
  pl: {
    years: ['2024-25', '2025-26'],
    rev: pr(3000000, 3600000),
    oi: pr(60000, 40000),
    exp: [
      { name: 'Cost of materials consumed', v: pr(1700000, 2020000) },
      { name: 'Employee benefits expense', v: pr(640000, 680000) },
      { name: 'Finance costs', v: pr(150000, 140000) },
      { name: 'Depreciation and amortisation expense', v: pr(260000, 280000) },
      { name: 'Other expenses', v: pr(270000, 440000) },
    ],
    rate: 25,
  },
};

export const COMPANIES_READY: readonly Company[] = [GIRNAR, SUTLEJ];

const NAMES = ['Aarohan Ltd.', 'Bhuvan Ltd.', 'Chetak Ltd.', 'Dhruv Ltd.', 'Ekta Ltd.', 'Himadri Ltd.', 'Kaveri Ltd.', 'Malwa Ltd.', 'Narmada Ltd.', 'Trishul Ltd.'];

/** The range of a balance in each sub-head, in whole rupees, a step of ₹10,000. */
const RANGE: Partial<Record<Sub, [number, number]>> = {
  shareCapital: [20000, 200000], reserves: [100000, 600000], warrants: [50000, 200000],
  ltb: [300000, 1500000], oltl: [20000, 100000], ltp: [40000, 200000],
  stb: [50000, 300000], tp: [80000, 400000], ocl: [20000, 120000], stp: [40000, 250000],
  ppe: [500000, 2500000], intangible: [100000, 500000], cwip: [200000, 900000], iaud: [50000, 300000],
  nci: [100000, 600000], ltla: [50000, 300000], onca: [20000, 100000],
  ci: [50000, 300000], inv: [100000, 500000], tr: [100000, 400000], cash: [50000, 400000], stla: [20000, 150000], oca: [10000, 80000],
};

/** Items a made-up company never has together. */
const CLASH: [string, string][] = [['surplus', 'loss'], ['arrears', 'advanceCalls']];

/**
 * A made-up company: the usual items (equity capital, a reserve, a long-term borrowing, a trade payable, an asset held
 * for use, an inventory, a trade receivable and a bank balance) and five to eight more, in whole multiples of
 * ₹10,000. The equity capital (whole lakhs) and the surplus are what make the two halves agree. The figures of the
 * year before and two years of the Statement of Profit and Loss come with it.
 */
export function randomCompany(rng: Rng): Company {
  for (let tries = 0; tries < 200; tries++) {
    const c = draw(rng);
    if (c && !problemOf(c)) return c;
  }
  return GIRNAR;
}

const step = (rng: Rng, [lo, hi]: [number, number]) => rng.step(lo, hi, 10000);

function draw(rng: Rng): Company | null {
  const must = ['equity', rng.pick(['sp', 'gr']), rng.pick(['debentures', 'termLoan', 'deposits']), rng.pick(['creditors', 'billsPayable']), rng.pick(['plant', 'building']), rng.pick(['rawMaterials', 'finished']), rng.pick(['debtors', 'billsReceivable']), 'bank'];
  const pool = ITEMS.filter((i) => !must.includes(i.id) && !['surplus', 'loss', 'equity', 'warrants', 'forfeited', 'premRed'].includes(i.id));
  const extra = rng.shuffle(pool).slice(0, rng.int(5, 8)).map((i) => i.id);
  const ids = [...must, ...extra].filter((id, k, all) => !CLASH.some(([a, b]) => id === b && all.slice(0, k).includes(a)));
  const holdings: Holding[] = ids.filter((id) => id !== 'equity').map((id) => {
    const sub = ITEMS.find((i) => i.id === id)!.sub;
    return { id, amount: rupees(step(rng, RANGE[sub]!)) };
  });
  // The equity capital and the surplus make the two halves agree.
  const rows = faceRows(holdings);
  const gap = (totalOf(rows, true) - totalOf(rows, false)) / 100;
  const surplusWanted = rng.step(100000, 500000, 10000);
  let capital = Math.floor((gap - surplusWanted) / 100000) * 100000;
  if (capital < 1000000) {
    const more = Math.ceil((1000000 - capital) / 500000) * 500000;
    const big = holdings.find((x) => x.id === 'plant' || x.id === 'building')!;
    big.amount += rupees(more);
    capital += more;
  }
  const surplus = (totalOf(faceRows(holdings), true) - totalOf(faceRows(holdings), false)) / 100 - capital;
  if (surplus <= 0) return null;
  holdings.unshift({ id: 'equity', amount: rupees(capital) }, { id: 'surplus', amount: rupees(surplus) });
  const later = faceRows(holdings);
  // The year before: each figure moved by up to a third, cash taking up the difference.
  const prev: Partial<Record<Sub, number>> = {};
  for (const r of later) if (r.sub !== 'cash') prev[r.sub] = rupees(Math.max(10000, Math.round(((r.amount / 100) * rng.pick([0.7, 0.75, 0.8, 0.85, 0.9, 1, 1.1, 1.2])) / 10000) * 10000));
  const el = SUB_ORDER.filter((s) => s in prev && !isAssetSub(s)).reduce((t, s) => t + prev[s]!, 0);
  const assets = SUB_ORDER.filter((s) => s in prev && isAssetSub(s)).reduce((t, s) => t + prev[s]!, 0);
  prev.cash = el - assets;
  if (prev.cash < rupees(20000)) return null;
  const pl = randomPl(rng);
  const name = rng.pick(NAMES);
  return { name, dates: ['31 March 2025', '31 March 2026'], holdings, prev, pl };
}

/** Two years of a manufacturer's Statement of Profit and Loss, with a profit in both, in multiples of ₹10,000. */
export function randomPl(rng: Rng): PlData {
  const r0 = rng.step(2000000, 8000000, 100000);
  const r1 = Math.round((r0 * rng.pick([0.85, 0.9, 1.1, 1.15, 1.2, 1.25])) / 100000) * 100000;
  const part = (r: number, lo: number, hi: number) => Math.round((r * rng.int(lo, hi)) / 100 / 10000) * 10000;
  const line = (name: string, lo: number, hi: number) => ({ name, v: pr(part(r0, lo, hi), part(r1, lo, hi)) });
  const exp = [
    line('Cost of materials consumed', 45, 58),
    line('Employee benefits expense', 10, 16),
    line('Finance costs', 1, 4),
    line('Depreciation and amortisation expense', 3, 7),
    line('Other expenses', 5, 10),
  ];
  return { years: ['2024-25', '2025-26'], rev: pr(r0, r1), oi: pr(part(r0, 1, 4), part(r1, 1, 4)), exp, rate: rng.pick([25, 30]) };
}
