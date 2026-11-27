import { rupees, type Paise } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { problemOf, type Adjustments, type Inputs, type Item, type PrivateItem, type Side } from './model';

// ---------------------------------------------------------------------------------------------------------------
// Ready traders and traders made from a seed. Every figure is a whole number of rupees.
// ---------------------------------------------------------------------------------------------------------------

const R = rupees;
const item = (id: string, label: string, side: Side, open: number, close: number): Item => ({ id, label, side, open: R(open), close: R(close) });
const NO_ADJ: Adjustments = { ioc: 0, dep: null, pdd: 0, outstanding: null, prepaid: null, accrued: null };

export interface Example {
  id: string;
  title: string;
  inputs: Inputs;
}

/** A year of profit with drawings in cash and goods, capital brought in, and four adjustments. */
const MENON: Inputs = {
  shop: 'Menon Hardware',
  owner: 'Ravi Menon',
  year: 2025,
  items: [
    item('cash', 'Cash in hand', 'asset', 15000, 20000),
    item('bank', 'Cash at bank', 'asset', 45000, 70000),
    item('debtors', 'Debtors', 'asset', 80000, 110000),
    item('stock', 'Stock', 'asset', 120000, 160000),
    item('furniture', 'Furniture', 'asset', 50000, 50000),
    item('creditors', 'Creditors', 'liability', 60000, 75000),
    item('loan', 'Bank loan', 'liability', 0, 50000),
    item('rentDue', 'Outstanding rent', 'liability', 5000, 0),
  ],
  privates: [{ label: "The proprietor's residential flat", amount: R(2500000), owned: true }],
  drawings: { cash: R(4000), monthly: true, salary: false, goodsCost: R(6000), goodsPrice: R(7500), bill: null },
  additional: { label: 'Money from the sale of a private plot, brought into the business', amount: R(30000) },
  adjustments: { ioc: 6, dep: { itemId: 'furniture', rate: 10 }, pdd: 5, outstanding: null, prepaid: { label: 'Insurance', amount: R(2000) }, accrued: null },
};

/** A year of loss: a salary taken as drawings, a private bill paid by the business, an overdraft at the end. */
const SHEIKH: Inputs = {
  shop: 'Sheikh Tailors',
  owner: 'Fatima Sheikh',
  year: 2025,
  items: [
    item('cash', 'Cash in hand', 'asset', 8000, 6000),
    item('debtors', 'Debtors', 'asset', 40000, 30000),
    item('stock', 'Stock', 'asset', 60000, 45000),
    item('machinery', 'Machinery', 'asset', 100000, 100000),
    item('creditors', 'Creditors', 'liability', 30000, 35000),
    item('overdraft', 'Bank overdraft', 'liability', 0, 20000),
  ],
  privates: [{ label: "The proprietor's personal car", amount: R(450000), owned: true }],
  drawings: { cash: R(3000), monthly: true, salary: true, goodsCost: 0, goodsPrice: 0, bill: { label: "School fees of the proprietor's child, paid by a business cheque", amount: R(9000) } },
  additional: null,
  adjustments: { ...NO_ADJ, dep: { itemId: 'machinery', rate: 10 }, outstanding: { label: 'Wages', amount: R(3000) }, accrued: { label: 'Commission', amount: R(1500) } },
};

/** The capital falls, yet the year made a profit: the drawings were larger than it. */
const JOSHI: Inputs = {
  shop: 'Joshi Sweets',
  owner: 'Kavita Joshi',
  year: 2025,
  items: [
    item('cash', 'Cash in hand', 'asset', 30000, 25000),
    item('bank', 'Cash at bank', 'asset', 120000, 85000),
    item('stock', 'Stock', 'asset', 250000, 260000),
    item('furniture', 'Furniture', 'asset', 150000, 150000),
    item('creditors', 'Creditors', 'liability', 50000, 60000),
  ],
  privates: [{ label: "Housing loan on the proprietor's flat", amount: R(900000), owned: false }],
  drawings: { cash: R(7500), monthly: true, salary: false, goodsCost: 0, goodsPrice: 0, bill: null },
  additional: null,
  adjustments: NO_ADJ,
};

export const WATCH_EXAMPLES: readonly Example[] = [
  { id: 'menon', title: 'A profit, with adjustments', inputs: MENON },
  { id: 'sheikh', title: 'A loss', inputs: SHEIKH },
];
export const EXAMPLES: readonly Example[] = [...WATCH_EXAMPLES, { id: 'joshi', title: 'Capital falls, yet a profit', inputs: JOSHI }];

// ---------------------------------------------------------------------------------------------------------------
// Traders from a seed
// ---------------------------------------------------------------------------------------------------------------

const TRADERS: readonly [string, string][] = [
  ['Ravi Menon', 'Menon Hardware'],
  ['Gurpreet Singh', 'Singh Auto Parts'],
  ['Lakshmi Iyer', 'Iyer Provisions'],
  ['Arjun Das', 'Das Stationers'],
  ['Suresh Patil', 'Patil Mobile Care'],
  ['Anjali Reddy', 'Reddy Boutique'],
  ['Imran Qureshi', 'Qureshi Footwear'],
  ['Deepa Nair', 'Nair Bakers'],
];
const PRIVATES: readonly PrivateItem[] = [
  { label: "The proprietor's residential flat", amount: R(2800000), owned: true },
  { label: "The proprietor's personal car", amount: R(600000), owned: true },
  { label: "Jewellery of the proprietor's family", amount: R(350000), owned: true },
  { label: "Housing loan on the proprietor's flat", amount: R(1200000), owned: false },
];
const ADDITIONAL = ['Additional capital introduced during the year', "The proprietor's lottery prize, paid into the business bank account", 'A gift of money received by the proprietor, put into the business'];
const BILLS = ["Electricity bill of the proprietor's home, paid from the business cash", "Premium on the proprietor's life insurance policy, paid by the business"];

const step = (rng: Rng, lo: number, hi: number, by: number): Paise => R(rng.step(lo, hi, by));
/** A figure on the second date near the first: up or down by up to a third. */
const near = (rng: Rng, x: Paise, by: number): Paise => Math.max(0, R(Math.round(((x / 100) * rng.int(70, 135)) / 100 / by) * by));

export function randomInputs(rng: Rng): Inputs {
  for (let attempt = 0; attempt < 40; attempt++) {
    const i = tryInputs(rng);
    if (!problemOf(i)) return i;
  }
  return MENON;
}

function tryInputs(rng: Rng): Inputs {
  const [owner, shop] = rng.pick(TRADERS);
  const overdraft = rng.next() < 0.3;
  const fixed = rng.pick([
    ['furniture', 'Furniture', 20000, 100000, 1000],
    ['machinery', 'Machinery', 80000, 300000, 5000],
    ['van', 'Delivery van', 150000, 400000, 5000],
  ] as const);
  const items: Item[] = [];
  const add = (id: string, label: string, side: Side, open: Paise, close: Paise) => items.push({ id, label, side, open, close });
  const cash = step(rng, 4000, 30000, 500);
  add('cash', 'Cash in hand', 'asset', cash, near(rng, cash, 500));
  if (!overdraft) {
    const b = step(rng, 20000, 120000, 1000);
    add('bank', 'Cash at bank', 'asset', b, near(rng, b, 1000));
  }
  const d = step(rng, 30000, 150000, 1000);
  add('debtors', 'Debtors', 'asset', d, near(rng, d, 1000));
  const s = step(rng, 50000, 250000, 1000);
  add('stock', 'Stock', 'asset', s, near(rng, s, 1000));
  const f = step(rng, fixed[2], fixed[3], fixed[4]);
  add(fixed[0], fixed[1], 'asset', f, rng.next() < 0.6 ? f : f + step(rng, 10000, 50000, 5000));
  const c = step(rng, 20000, 120000, 1000);
  add('creditors', 'Creditors', 'liability', c, near(rng, c, 1000));
  if (overdraft) add('overdraft', 'Bank overdraft', 'liability', step(rng, 5000, 30000, 1000), step(rng, 5000, 40000, 1000));
  else if (rng.next() < 0.4) add('loan', 'Bank loan', 'liability', 0, step(rng, 20000, 100000, 5000));
  if (rng.next() < 0.4) add('billsPayable', 'Bills payable', 'liability', step(rng, 5000, 30000, 1000), step(rng, 5000, 30000, 1000));

  const monthly = rng.next() < 0.6;
  const goods = rng.next() < 0.5;
  const goodsCost = goods ? step(rng, 2000, 15000, 500) : 0;
  const drawings = {
    cash: monthly ? step(rng, 1500, 8000, 500) : step(rng, 20000, 90000, 1000),
    monthly,
    salary: monthly && rng.next() < 0.3,
    goodsCost,
    goodsPrice: goods ? R(((goodsCost / 100) * rng.pick([120, 125, 150])) / 100) : 0,
    bill: rng.next() < 0.3 ? { label: rng.pick(BILLS), amount: step(rng, 2000, 12000, 500) } : null,
  };
  const additional = rng.next() < 0.5 ? { label: rng.pick(ADDITIONAL), amount: step(rng, 10000, 80000, 5000) } : null;
  const keys = rng.shuffle(['ioc', 'dep', 'pdd', 'out', 'pre', 'acc'] as const).slice(0, rng.int(0, 4));
  const adjustments: Adjustments = {
    ioc: keys.includes('ioc') ? rng.pick([5, 6, 8, 10]) : 0,
    dep: keys.includes('dep') ? { itemId: fixed[0], rate: rng.pick([10, 15, 20]) } : null,
    pdd: keys.includes('pdd') ? rng.pick([2, 4, 5, 10]) : 0,
    outstanding: keys.includes('out') ? { label: rng.pick(['Salaries', 'Rent', 'Wages']), amount: step(rng, 2000, 15000, 500) } : null,
    prepaid: keys.includes('pre') ? { label: rng.pick(['Insurance', 'Rent']), amount: step(rng, 1000, 9000, 500) } : null,
    accrued: keys.includes('acc') ? { label: 'Commission', amount: step(rng, 1000, 9000, 500) } : null,
  };
  return {
    shop,
    owner,
    year: 2025,
    items,
    privates: rng.next() < 0.8 ? [rng.pick(PRIVATES)] : [],
    drawings,
    additional,
    adjustments,
  };
}
