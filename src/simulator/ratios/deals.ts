// Transactions to play on the figures of the ratio lab: each one a double entry on the balance sheet (and, where
// it earns or costs something, on the statement of profit and loss), so that the balance sheet still balances.
//
// Convention, as the board's questions on the effect of a transaction take it: a profit or a loss made by the
// transaction goes to reserves and surplus in full; tax on it is ignored.

import { formatINR, type Paise } from '@/engine/money';
import type { InputLine, RatioFigures } from './model';

export type DealId =
  | 'payCreditors'
  | 'creditPurchase'
  | 'cashPurchase'
  | 'collectDebtors'
  | 'buyMachinery'
  | 'issueShares'
  | 'issueDebentures'
  | 'redeemDebentures'
  | 'shortLoan'
  | 'convertDebentures'
  | 'sharesForMachinery'
  | 'prepay'
  | 'sellGoodsCredit'
  | 'depreciation'
  | 'badDebt';

export interface Change {
  line: InputLine;
  delta: Paise;
}

export interface Deal {
  id: DealId;
  /** On a button: what the company does. */
  label: string;
  /** In a sentence: "paid ₹60,000 to its trade payables by cheque". */
  text(x: Paise): string;
  changes(x: Paise): Change[];
  /** What each line is, so why the terms move. */
  note(x: Paise): string;
}

const inr = formatINR;
/** The price of goods sold at a profit of 25% on cost. */
export const priceOf = (cost: Paise): Paise => cost + Math.round(cost / 4 / 100) * 100;

export const DEALS: Deal[] = [
  {
    id: 'payCreditors',
    label: 'Pay trade payables by cheque',
    text: (x) => `paid ${inr(x)} to its trade payables by cheque`,
    changes: (x) => [
      { line: 'cash', delta: -x },
      { line: 'tradePayables', delta: -x },
    ],
    note: (x) => `Cash, a current asset and a quick asset, falls by ${inr(x)}, and trade payables, a current liability, fall by the same amount.`,
  },
  {
    id: 'creditPurchase',
    label: 'Buy goods on credit',
    text: (x) => `bought goods for ${inr(x)} on credit, still unsold at the year end`,
    changes: (x) => [
      { line: 'inventories', delta: x },
      { line: 'tradePayables', delta: x },
    ],
    note: (x) =>
      `Inventories, a current asset but not a quick asset, rise by ${inr(x)}, and trade payables, a current liability, by the same amount. The goods are unsold, so the cost of revenue from operations does not change; purchases rise.`,
  },
  {
    id: 'cashPurchase',
    label: 'Buy goods for cash',
    text: (x) => `bought goods for ${inr(x)} by cheque, still unsold at the year end`,
    changes: (x) => [
      { line: 'inventories', delta: x },
      { line: 'cash', delta: -x },
      { line: 'cashPurchases', delta: x },
    ],
    note: (x) =>
      `Inventories rise by ${inr(x)} and cash falls by ${inr(x)}: current assets are unchanged, but quick assets fall, because inventories are not a quick asset. The goods were bought for cash, so net credit purchases and trade payables do not change.`,
  },
  {
    id: 'collectDebtors',
    label: 'Collect from trade receivables',
    text: (x) => `received ${inr(x)} from its trade receivables by cheque`,
    changes: (x) => [
      { line: 'cash', delta: x },
      { line: 'tradeReceivables', delta: -x },
    ],
    note: (x) => `Cash rises by ${inr(x)} and trade receivables fall by ${inr(x)}: both are current assets and quick assets, so neither total changes.`,
  },
  {
    id: 'buyMachinery',
    label: 'Buy machinery for cash',
    text: (x) => `bought machinery for ${inr(x)} by cheque`,
    changes: (x) => [
      { line: 'ppe', delta: x },
      { line: 'cash', delta: -x },
    ],
    note: (x) => `Cash, a current asset, falls by ${inr(x)}; machinery, a non-current asset, rises by ${inr(x)}. Total assets stay the same.`,
  },
  {
    id: 'issueShares',
    label: 'Issue equity shares for cash',
    text: (x) => `issued equity shares for ${inr(x)}, received by cheque`,
    changes: (x) => [
      { line: 'cash', delta: x },
      { line: 'shareCapital', delta: x },
    ],
    note: (x) => `Cash rises by ${inr(x)}, and share capital, part of the shareholders' funds, by ${inr(x)}. No liability changes.`,
  },
  {
    id: 'issueDebentures',
    label: 'Issue debentures for cash',
    text: (x) => `issued debentures for ${inr(x)}, received by cheque`,
    changes: (x) => [
      { line: 'cash', delta: x },
      { line: 'longTermBorrowings', delta: x },
    ],
    note: (x) => `Cash rises by ${inr(x)}, and debentures, a long-term borrowing (debt), by ${inr(x)}. No current liability changes.`,
  },
  {
    id: 'redeemDebentures',
    label: 'Redeem debentures in cash',
    text: (x) => `redeemed debentures of ${inr(x)} by cheque`,
    changes: (x) => [
      { line: 'cash', delta: -x },
      { line: 'longTermBorrowings', delta: -x },
    ],
    note: (x) => `Cash falls by ${inr(x)}, and debentures, a long-term borrowing (debt), by ${inr(x)}. No current liability changes.`,
  },
  {
    id: 'shortLoan',
    label: 'Take a six-month bank loan',
    text: (x) => `took a loan of ${inr(x)} from a bank, repayable in six months`,
    changes: (x) => [
      { line: 'cash', delta: x },
      { line: 'shortTermBorrowings', delta: x },
    ],
    note: (x) => `Cash rises by ${inr(x)} and short-term borrowings, a current liability, by ${inr(x)}. A six-month loan is not debt for the solvency ratios.`,
  },
  {
    id: 'convertDebentures',
    label: 'Convert debentures into shares',
    text: (x) => `converted debentures of ${inr(x)} into equity shares`,
    changes: (x) => [
      { line: 'longTermBorrowings', delta: -x },
      { line: 'shareCapital', delta: x },
    ],
    note: (x) => `Debt falls by ${inr(x)} and share capital rises by ${inr(x)}. No asset and no current item changes.`,
  },
  {
    id: 'sharesForMachinery',
    label: 'Buy machinery by issuing shares',
    text: (x) => `bought machinery for ${inr(x)} and paid the seller in equity shares`,
    changes: (x) => [
      { line: 'ppe', delta: x },
      { line: 'shareCapital', delta: x },
    ],
    note: (x) => `Machinery, a non-current asset, and share capital each rise by ${inr(x)}. No current item and no debt changes.`,
  },
  {
    id: 'prepay',
    label: 'Pay next year’s insurance in advance',
    text: (x) => `paid ${inr(x)} by cheque as next year’s insurance premium`,
    changes: (x) => [
      { line: 'cash', delta: -x },
      { line: 'prepaidExpenses', delta: x },
    ],
    note: (x) => `Cash falls by ${inr(x)} and prepaid expenses rise by ${inr(x)}: current assets are unchanged, but quick assets fall, because prepaid expenses are not a quick asset.`,
  },
  {
    id: 'sellGoodsCredit',
    label: 'Sell goods on credit at a profit',
    text: (x) => `sold goods costing ${inr(x)} for ${inr(priceOf(x))} on credit`,
    changes: (x) => [
      { line: 'inventories', delta: -x },
      { line: 'tradeReceivables', delta: priceOf(x) },
      { line: 'reserves', delta: priceOf(x) - x },
      { line: 'creditRevenue', delta: priceOf(x) },
      { line: 'costOfRevenue', delta: x },
    ],
    note: (x) =>
      `Inventories fall by ${inr(x)} and trade receivables rise by ${inr(priceOf(x))}: current assets rise by the profit of ${inr(priceOf(x) - x)}, quick assets by the whole ${inr(priceOf(x))}. Revenue from operations rises by ${inr(priceOf(x))} and its cost by ${inr(x)}; the profit adds to reserves and surplus.`,
  },
  {
    id: 'depreciation',
    label: 'Charge depreciation',
    text: (x) => `charged depreciation of ${inr(x)} on its machinery`,
    changes: (x) => [
      { line: 'ppe', delta: -x },
      { line: 'reserves', delta: -x },
      { line: 'operatingExpenses', delta: x },
    ],
    note: (x) => `Machinery, a non-current asset, falls by ${inr(x)}; depreciation is an operating expense, so the profit, and with it reserves and surplus, falls by ${inr(x)}. No current item and no debt changes.`,
  },
  {
    id: 'badDebt',
    label: 'Write off a bad debt',
    text: (x) => `wrote off ${inr(x)} due from a customer as a bad debt (no provision was kept)`,
    changes: (x) => [
      { line: 'tradeReceivables', delta: -x },
      { line: 'reserves', delta: -x },
      { line: 'operatingExpenses', delta: x },
    ],
    note: (x) => `Trade receivables, a current asset and a quick asset, fall by ${inr(x)}; the loss is an operating expense and lowers reserves and surplus. No liability changes.`,
  },
];

export const dealById = (id: DealId): Deal => DEALS.find((d) => d.id === id)!;

/** The figures after a transaction, or null when it would take a balance below nil (reserves and surplus may go below nil). */
export function applyDeal(f: RatioFigures, deal: Deal, x: Paise): RatioFigures | null {
  const next = { ...f };
  for (const c of deal.changes(x)) next[c.line] += c.delta;
  for (const c of deal.changes(x)) if (c.line !== 'reserves' && next[c.line] < 0) return null;
  return next;
}

/** Why a transaction cannot be played on these figures, in words; null when it can. */
export function cannotPlay(f: RatioFigures, deal: Deal, x: Paise): string | null {
  for (const c of deal.changes(x)) {
    if (c.line === 'reserves') continue;
    if (f[c.line] + c.delta < 0) return `Not enough: it needs ${inr(-c.delta)} of ${LINE_WORDS[c.line] ?? c.line}, and there is ${inr(f[c.line])}.`;
  }
  return null;
}

const LINE_WORDS: Partial<Record<InputLine, string>> = {
  cash: 'cash',
  tradePayables: 'trade payables',
  tradeReceivables: 'trade receivables',
  inventories: 'inventories',
  longTermBorrowings: 'debentures',
  ppe: 'machinery',
};
