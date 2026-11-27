// The ready companies of the ratio lab, made-up ones drawn from a seed, and the sandbox's controls. Every balance
// sheet balances; each ready one is worked by hand in model.test.ts.

import { createRng, type Rng } from '@/engine/rng';
import type { Paise } from '@/engine/money';
import { ASSET_LINES, linesOf, type InputLine, type RatioFigures } from './model';

const R = (rupees: number): Paise => rupees * 100;

export interface RatioExample {
  id: string;
  title: string;
  point: string;
  figures: RatioFigures;
}

export const EXAMPLES: RatioExample[] = [
  {
    id: 'steady',
    title: 'A steady company',
    point: 'Comfortable liquidity, modest debt, a fair profit.',
    figures: {
      company: 'Mehta Appliances Ltd.',
      shareCapital: R(800000),
      reserves: R(200000),
      longTermBorrowings: R(400000),
      longTermProvisions: R(100000),
      shortTermBorrowings: R(50000),
      tradePayables: R(200000),
      otherCurrentLiabilities: R(30000),
      shortTermProvisions: R(20000),
      ppe: R(1000000),
      nonCurrentInvestments: R(200000),
      currentInvestments: R(50000),
      inventories: R(240000),
      tradeReceivables: R(200000),
      cash: R(90000),
      prepaidExpenses: R(20000),
      creditRevenue: R(1800000),
      cashRevenue: R(600000),
      costOfRevenue: R(1800000),
      operatingExpenses: R(360000),
      otherIncome: R(20000),
      financeCosts: R(40000),
      taxRate: 30,
      openingInventories: R(160000),
      openingTradeReceivables: R(160000),
      openingTradePayables: R(176000),
      cashPurchases: 0,
    },
  },
  {
    id: 'tight',
    title: 'Short of liquid funds',
    point: 'Current liabilities exceed current assets: the current ratio is below 1 : 1 and working capital is negative.',
    figures: {
      company: 'Kirti Garments Ltd.',
      shareCapital: R(500000),
      reserves: R(50000),
      longTermBorrowings: R(300000),
      longTermProvisions: 0,
      shortTermBorrowings: R(100000),
      tradePayables: R(300000),
      otherCurrentLiabilities: R(80000),
      shortTermProvisions: R(20000),
      ppe: R(900000),
      nonCurrentInvestments: R(50000),
      currentInvestments: 0,
      inventories: R(200000),
      tradeReceivables: R(140000),
      cash: R(50000),
      prepaidExpenses: R(10000),
      creditRevenue: R(1200000),
      cashRevenue: R(300000),
      costOfRevenue: R(1125000),
      operatingExpenses: R(270000),
      otherIncome: 0,
      financeCosts: R(30000),
      taxRate: 30,
      openingInventories: R(175000),
      openingTradeReceivables: R(160000),
      openingTradePayables: R(275000),
      cashPurchases: 0,
    },
  },
  {
    id: 'geared',
    title: 'Heavy borrowing, a loss',
    point: 'Debt is more than twice the owners’ funds, the interest is more than the profit before interest, and the year ends in a loss.',
    figures: {
      company: 'Vasant Infra Ltd.',
      shareCapital: R(600000),
      reserves: R(-50000),
      longTermBorrowings: R(1200000),
      longTermProvisions: R(100000),
      shortTermBorrowings: R(50000),
      tradePayables: R(150000),
      otherCurrentLiabilities: R(50000),
      shortTermProvisions: 0,
      ppe: R(1600000),
      nonCurrentInvestments: 0,
      currentInvestments: R(50000),
      inventories: R(150000),
      tradeReceivables: R(200000),
      cash: R(80000),
      prepaidExpenses: R(20000),
      creditRevenue: R(800000),
      cashRevenue: R(200000),
      costOfRevenue: R(700000),
      operatingExpenses: R(240000),
      otherIncome: R(20000),
      financeCosts: R(120000),
      taxRate: 30,
      openingInventories: R(130000),
      openingTradeReceivables: R(120000),
      openingTradePayables: R(150000),
      cashPurchases: 0,
    },
  },
];

export const WATCH_EXAMPLE = EXAMPLES[0];

// ---------------------------------------------------------------------------------------------------------------
// The sandbox
// ---------------------------------------------------------------------------------------------------------------

export interface FigureSpec {
  line: InputLine | 'taxRate';
  min: number;
  max: number;
  step: number;
}

/** Cash and cash equivalents is not set directly: it takes up every change of the balance sheet, so that it balances. */
export const CONTROL_GROUPS: { id: string; title: string; figures: FigureSpec[] }[] = [
  {
    id: 'liabilities',
    title: 'Equity and liabilities',
    figures: [
      { line: 'shareCapital', min: 0, max: R(2000000), step: R(10000) },
      { line: 'reserves', min: R(-500000), max: R(1000000), step: R(10000) },
      { line: 'longTermBorrowings', min: 0, max: R(2000000), step: R(10000) },
      { line: 'longTermProvisions', min: 0, max: R(500000), step: R(10000) },
      { line: 'shortTermBorrowings', min: 0, max: R(500000), step: R(10000) },
      { line: 'tradePayables', min: 0, max: R(800000), step: R(10000) },
      { line: 'otherCurrentLiabilities', min: 0, max: R(300000), step: R(10000) },
      { line: 'shortTermProvisions', min: 0, max: R(200000), step: R(10000) },
    ],
  },
  {
    id: 'assets',
    title: 'Assets (cash takes up the difference)',
    figures: [
      { line: 'ppe', min: 0, max: R(3000000), step: R(10000) },
      { line: 'nonCurrentInvestments', min: 0, max: R(1000000), step: R(10000) },
      { line: 'currentInvestments', min: 0, max: R(500000), step: R(10000) },
      { line: 'inventories', min: 0, max: R(800000), step: R(10000) },
      { line: 'tradeReceivables', min: 0, max: R(800000), step: R(10000) },
      { line: 'prepaidExpenses', min: 0, max: R(200000), step: R(5000) },
    ],
  },
  {
    id: 'profit',
    title: 'Statement of profit and loss',
    figures: [
      { line: 'creditRevenue', min: 0, max: R(5000000), step: R(50000) },
      { line: 'cashRevenue', min: 0, max: R(2000000), step: R(50000) },
      { line: 'costOfRevenue', min: 0, max: R(5000000), step: R(50000) },
      { line: 'operatingExpenses', min: 0, max: R(1500000), step: R(10000) },
      { line: 'otherIncome', min: 0, max: R(300000), step: R(5000) },
      { line: 'financeCosts', min: 0, max: R(300000), step: R(5000) },
      { line: 'taxRate', min: 0, max: 40, step: 1 },
    ],
  },
  {
    id: 'opening',
    title: 'At the start of the year, and purchases for cash',
    figures: [
      { line: 'openingInventories', min: 0, max: R(800000), step: R(10000) },
      { line: 'openingTradeReceivables', min: 0, max: R(800000), step: R(10000) },
      { line: 'openingTradePayables', min: 0, max: R(800000), step: R(10000) },
      { line: 'cashPurchases', min: 0, max: R(1000000), step: R(10000) },
    ],
  },
];

/**
 * Sets one figure. A line of the balance sheet other than cash moves cash the other way for an asset and the same
 * way for a liability, so that the balance sheet still balances; it goes no further than the cash there is.
 */
export function setFigure(f: RatioFigures, line: InputLine | 'taxRate', value: number): RatioFigures {
  if (line === 'taxRate') return { ...f, taxRate: Math.max(0, Math.min(100, Math.round(value))) };
  const v = Math.round(value);
  if (line === 'cash' || !isBalanceSheet(line)) return { ...f, [line]: line === 'reserves' ? v : Math.max(0, v) };
  const floor = line === 'reserves' ? -Infinity : 0;
  let target = Math.max(floor, v);
  const asset = ASSET_LINES.has(line);
  // An asset can grow only by the cash there is; a liability or equity can shrink only by the cash there is.
  if (asset) target = Math.min(target, f[line] + f.cash);
  else target = Math.max(target, f[line] - f.cash);
  const delta = target - f[line];
  return { ...f, [line]: target, cash: f.cash + (asset ? -delta : delta) };
}

const BS = new Set<InputLine>([
  'shareCapital',
  'reserves',
  'longTermBorrowings',
  'longTermProvisions',
  'shortTermBorrowings',
  'tradePayables',
  'otherCurrentLiabilities',
  'shortTermProvisions',
  'ppe',
  'nonCurrentInvestments',
  'currentInvestments',
  'inventories',
  'tradeReceivables',
  'cash',
  'prepaidExpenses',
]);
export const isBalanceSheet = (line: InputLine): boolean => BS.has(line);

// ---------------------------------------------------------------------------------------------------------------
// Made-up companies
// ---------------------------------------------------------------------------------------------------------------

const COMPANIES = ['Shivalik Pumps Ltd.', 'Konark Ceramics Ltd.', 'Ganga Dairy Ltd.', 'Malwa Cotton Ltd.', 'Sundarban Foods Ltd.', 'Aravali Motors Ltd.', 'Kosi Fertilisers Ltd.', 'Vindhya Glass Ltd.'];

const at = (rng: Rng, min: number, max: number, by: number): Paise => R(rng.step(min, max, by));
const near = (rng: Rng, v: Paise): Paise => Math.max(R(10000), Math.round((v * (70 + rng.int(0, 60))) / 100 / R(10000)) * R(10000));

/** A company from a seed: its balance sheet balances, with at least ₹20,000 of cash. */
export function randomFigures(seed: number): RatioFigures {
  const rng = createRng(seed);
  const credit = at(rng, 800000, 3000000, 50000);
  const cashSales = at(rng, 0, 800000, 50000);
  const revenue = credit + cashSales;
  const margin = rng.int(20, 40);
  const longTermBorrowings = at(rng, 0, 800000, 50000);
  const f: RatioFigures = {
    company: rng.pick(COMPANIES),
    shareCapital: at(rng, 300000, 1200000, 50000),
    reserves: at(rng, 0, 400000, 10000),
    longTermBorrowings,
    longTermProvisions: at(rng, 0, 150000, 10000),
    shortTermBorrowings: at(rng, 0, 150000, 10000),
    tradePayables: at(rng, 100000, 400000, 10000),
    otherCurrentLiabilities: at(rng, 10000, 100000, 10000),
    shortTermProvisions: at(rng, 0, 60000, 10000),
    ppe: at(rng, 400000, 1500000, 50000),
    nonCurrentInvestments: at(rng, 0, 300000, 50000),
    currentInvestments: at(rng, 0, 100000, 10000),
    inventories: at(rng, 100000, 400000, 10000),
    tradeReceivables: at(rng, 100000, 400000, 10000),
    cash: 0,
    prepaidExpenses: at(rng, 0, 40000, 5000),
    creditRevenue: credit,
    cashRevenue: cashSales,
    costOfRevenue: Math.round((revenue * (100 - margin)) / 100 / R(10000)) * R(10000),
    operatingExpenses: Math.round((revenue * rng.int(8, 18)) / 100 / R(10000)) * R(10000),
    otherIncome: at(rng, 0, 40000, 5000),
    financeCosts: Math.round((longTermBorrowings * rng.int(8, 12)) / 100 / R(1000)) * R(1000),
    taxRate: rng.pick([25, 30]),
    openingInventories: 0,
    openingTradeReceivables: 0,
    openingTradePayables: 0,
    cashPurchases: 0,
  };
  f.openingInventories = near(rng, f.inventories);
  f.openingTradeReceivables = near(rng, f.tradeReceivables);
  f.openingTradePayables = near(rng, f.tradePayables);
  const l = linesOf(f);
  let cash = l.totalLiabilities - l.totalAssets;
  if (cash < R(20000)) {
    const raise = Math.ceil((R(20000) - cash) / R(50000)) * R(50000);
    f.shareCapital += raise;
    cash += raise;
  }
  return { ...f, cash };
}
