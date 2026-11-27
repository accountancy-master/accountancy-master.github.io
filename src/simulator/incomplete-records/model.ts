import { formatINR, type Paise } from '@/engine/money';

// ---------------------------------------------------------------------------------------------------------------
// Profit from incomplete records by the statement of affairs method, as the topic "incomplete-records" teaches it
// (CBSE 2025-26; the conversion method is outside the syllabus):
//  - capital on a date = business assets - business liabilities, the balancing figure of the statement of affairs;
//    the proprietor's private assets and debts stay out;
//  - profit (or loss) = closing capital + drawings - additional capital - opening capital;
//  - drawings: cash taken (a monthly figure x 12; a salary the proprietor takes is drawings), goods taken at cost
//    (never at the sale price), private bills paid by the business; additional capital: money or assets brought in
//    from private sources, and a business bill paid from private money;
//  - the closing statement is drawn up before the adjustments, which are then made to the profit found: interest
//    on capital (on the capital at the beginning of the year) and depreciation, a provision for doubtful debts and an
//    outstanding expense deducted; a prepaid expense and an accrued income added. Amounts worked out by a rate
//    are rounded to the nearest rupee.
// Every figure is in paise.
// ---------------------------------------------------------------------------------------------------------------

export const inr = formatINR;
const rupee = (p: Paise): Paise => Math.round(p / 100) * 100;
const pct = (x: Paise, rate: number): Paise => rupee((x * rate) / 100);

export type Side = 'asset' | 'liability';

/** An item of the statements of affairs, with its figure on each date (nil where it is not there). */
export interface Item {
  id: string;
  label: string;
  side: Side;
  open: Paise;
  close: Paise;
}

/** Something that belongs to the proprietor privately: told, and left out. */
export interface PrivateItem {
  label: string;
  amount: Paise;
  /** Owned (a flat, a car) or owed (a housing loan). */
  owned: boolean;
}

export interface Drawings {
  /** Cash drawn: a sum for the year, or `monthly` (x 12). */
  cash: Paise;
  monthly: boolean;
  /** The cash is a monthly salary the proprietor takes (treated as drawings). */
  salary: boolean;
  /** Goods taken for personal use: at cost, with the sale price told as well. */
  goodsCost: Paise;
  goodsPrice: Paise;
  /** A private bill of the proprietor paid by the business. */
  bill: { label: string; amount: Paise } | null;
}

export interface Adjustments {
  /** Interest on capital at this rate % on the opening capital (0: none). */
  ioc: number;
  /** Depreciation at a rate % on an asset's figure in the closing statement. */
  dep: { itemId: string; rate: number } | null;
  /** A provision for doubtful debts at a rate % on the debtors of the closing statement (0: none). */
  pdd: number;
  outstanding: { label: string; amount: Paise } | null;
  prepaid: { label: string; amount: Paise } | null;
  accrued: { label: string; amount: Paise } | null;
}

export interface Inputs {
  shop: string;
  owner: string;
  /** The year begins on 1 April of this year. */
  year: number;
  items: Item[];
  privates: PrivateItem[];
  drawings: Drawings;
  additional: { label: string; amount: Paise } | null;
  adjustments: Adjustments;
}

export const startOf = (i: Inputs) => `1 April ${i.year}`;
export const endOf = (i: Inputs) => `31 March ${i.year + 1}`;
export const yearOf = (i: Inputs) => `year ended 31 March ${i.year + 1}`;

export type AdjKey = 'ioc' | 'dep' | 'pdd' | 'out' | 'pre' | 'acc';

export interface Adj {
  key: AdjKey;
  /** The row of the Statement of Profit or Loss: "Less: Depreciation on furniture". */
  label: string;
  /** What it does to the profit: negative to deduct. */
  effect: Paise;
  /** The working. */
  how: string;
  /** Why it is deducted or added. */
  why: string;
}

export interface Result {
  assets: [Paise, Paise];
  liabilities: [Paise, Paise];
  /** Capital on 1 April and on 31 March. */
  capital: [Paise, Paise];
  drawings: Paise;
  drawingsParts: { label: string; amount: Paise; how: string }[];
  additional: Paise;
  /** Closing capital + drawings - additional capital. */
  adjusted: Paise;
  /** Profit (positive) or loss (negative) before the adjustments. */
  before: Paise;
  adjs: Adj[];
  /** Net profit or loss. */
  net: Paise;
}

const total = (items: readonly Item[], side: Side, k: 'open' | 'close') => items.filter((x) => x.side === side).reduce((t, x) => t + x[k], 0);

/** The adjustments in the order of a Statement of Profit or Loss: the deductions (interest on capital first), then the additions. */
export function adjustmentsOf(i: Inputs, opening: Paise): Adj[] {
  const a = i.adjustments;
  const out: Adj[] = [];
  if (a.ioc > 0) {
    const x = pct(opening, a.ioc);
    out.push({ key: 'ioc', label: 'Less: Interest on capital', effect: -x, how: `${a.ioc}% of the opening capital ${inr(opening)} = ${inr(x)}`, why: 'A charge against the profit, credited to the capital: it moves an amount within the capital, so no statement of affairs shows it.' });
  }
  if (a.dep) {
    const item = i.items.find((x) => x.id === a.dep!.itemId);
    if (item && item.close > 0) {
      const x = pct(item.close, a.dep.rate);
      out.push({ key: 'dep', label: `Less: Depreciation on ${item.label.toLowerCase()}`, effect: -x, how: `${a.dep.rate}% of ${inr(item.close)} = ${inr(x)}`, why: `The closing statement took ${item.label.toLowerCase()} at ${inr(item.close)}, before depreciation: the asset, and so the capital, was overstated.` });
    }
  }
  if (a.pdd > 0) {
    const d = i.items.find((x) => x.id === 'debtors');
    if (d && d.close > 0) {
      const x = pct(d.close, a.pdd);
      out.push({ key: 'pdd', label: 'Less: Provision for doubtful debts', effect: -x, how: `${a.pdd}% of the debtors ${inr(d.close)} = ${inr(x)}`, why: 'The debtors were taken in full: some of them may never pay, so the asset was overstated.' });
    }
  }
  if (a.outstanding && a.outstanding.amount > 0) {
    out.push({ key: 'out', label: `Less: Outstanding ${a.outstanding.label.toLowerCase()}`, effect: -a.outstanding.amount, how: inr(a.outstanding.amount), why: 'An expense owed, left out of the liabilities: the capital was overstated.' });
  }
  if (a.prepaid && a.prepaid.amount > 0) {
    out.push({ key: 'pre', label: `Add: Prepaid ${a.prepaid.label.toLowerCase()}`, effect: a.prepaid.amount, how: inr(a.prepaid.amount), why: 'An expense paid in advance is an asset left out: the capital was understated.' });
  }
  if (a.accrued && a.accrued.amount > 0) {
    out.push({ key: 'acc', label: `Add: Accrued ${a.accrued.label.toLowerCase()}`, effect: a.accrued.amount, how: inr(a.accrued.amount), why: 'An income earned but not yet received is an asset left out: the capital was understated.' });
  }
  return out;
}

export const GOODS_TAKEN = 'Goods taken for personal use';

export function drawingsOf(d: Drawings): { total: Paise; parts: { label: string; amount: Paise; how: string }[] } {
  const parts: { label: string; amount: Paise; how: string }[] = [];
  if (d.cash > 0) {
    const x = d.monthly ? d.cash * 12 : d.cash;
    parts.push({ label: d.salary ? 'Salary taken by the proprietor (treated as drawings)' : 'Cash drawn', amount: x, how: d.monthly ? `${inr(d.cash)} × 12 = ${inr(x)}` : inr(x) });
  }
  if (d.goodsCost > 0) parts.push({ label: GOODS_TAKEN, amount: d.goodsCost, how: `${inr(d.goodsCost)} at cost (not the sale price ${inr(d.goodsPrice)})` });
  if (d.bill && d.bill.amount > 0) parts.push({ label: d.bill.label, amount: d.bill.amount, how: inr(d.bill.amount) });
  return { total: parts.reduce((t, p) => t + p.amount, 0), parts };
}

export function resultOf(i: Inputs): Result {
  const A: [Paise, Paise] = [total(i.items, 'asset', 'open'), total(i.items, 'asset', 'close')];
  const L: [Paise, Paise] = [total(i.items, 'liability', 'open'), total(i.items, 'liability', 'close')];
  const C: [Paise, Paise] = [A[0] - L[0], A[1] - L[1]];
  const d = drawingsOf(i.drawings);
  const add = i.additional?.amount ?? 0;
  const adjusted = C[1] + d.total - add;
  const before = adjusted - C[0];
  const adjs = adjustmentsOf(i, C[0]);
  return { assets: A, liabilities: L, capital: C, drawings: d.total, drawingsParts: d.parts, additional: add, adjusted, before, adjs, net: before + adjs.reduce((t, x) => t + x.effect, 0) };
}

/** Why the inputs cannot be as they are, or null. */
export function problemOf(i: Inputs): string | null {
  const r = resultOf(i);
  if (r.capital[0] <= 0) return `On ${startOf(i)} the liabilities are not less than the assets: there is no capital to begin with.`;
  if (r.capital[1] <= 0) return `On ${endOf(i)} the liabilities are not less than the assets: there is no capital at the end.`;
  if (i.items.some((x) => x.open < 0 || x.close < 0)) return 'An item cannot be below nil.';
  const bank = i.items.find((x) => x.id === 'bank');
  const od = i.items.find((x) => x.id === 'overdraft');
  if (bank && od && ((bank.open > 0 && od.open > 0) || (bank.close > 0 && od.close > 0))) return 'A business has either a balance at the bank or an overdraft on a date, not both.';
  if (i.drawings.goodsCost > 0 && i.drawings.goodsPrice < i.drawings.goodsCost) return 'The sale price of the goods taken should not be below their cost.';
  return null;
}

/** "Profit of ₹40,000", "Loss of ₹12,000", "Neither profit nor loss". */
export const resultWords = (x: Paise): string => (x > 0 ? `a profit of ${inr(x)}` : x < 0 ? `a loss of ${inr(-x)}` : 'neither a profit nor a loss');

// ---------------------------------------------------------------------------------------------------------------
// The board's formats: the Statement of Affairs in two columns and the Statement of Profit or Loss
// ---------------------------------------------------------------------------------------------------------------

export const CAPITAL_ROW = 'Capital (balancing figure)';

export interface AffairsRow {
  label: string;
  open: Paise;
  close: Paise;
  capital?: true;
  total?: true;
}
export function affairsOf(i: Inputs): { liabilities: AffairsRow[]; assets: AffairsRow[] } {
  const r = resultOf(i);
  const rows = (side: Side) => i.items.filter((x) => x.side === side && (x.open > 0 || x.close > 0)).map((x) => ({ label: x.label, open: x.open, close: x.close }));
  const totalRow: AffairsRow = { label: 'Total', open: r.assets[0], close: r.assets[1], total: true };
  return {
    liabilities: [...rows('liability'), { label: CAPITAL_ROW, open: r.capital[0], close: r.capital[1], capital: true }, totalRow],
    assets: [...rows('asset'), totalRow],
  };
}

export interface ProfitRow {
  label: string;
  amount: Paise;
  /** A sub-total line. */
  subtotal?: true;
  /** What makes the figure. */
  details?: string[];
  /** The step of the walk that writes it. */
  step: string;
}

export const PL = {
  close: 'Capital at the end of the year',
  draw: 'Add: Drawings during the year',
  add: 'Less: Additional capital introduced',
  adjusted: 'Adjusted capital at the end of the year',
  open: 'Less: Capital at the beginning of the year',
  result: 'Profit or loss for the year',
  before: 'Profit or loss before adjustments',
  net: 'Net profit or loss for the year',
};

/** The Statement of Profit or Loss, with a deduction and a loss as negative figures. */
export function profitStatement(i: Inputs): ProfitRow[] {
  const r = resultOf(i);
  const rows: ProfitRow[] = [
    { label: PL.close, amount: r.capital[1], step: 'ladder-close' },
    { label: PL.draw, amount: r.drawings, details: r.drawingsParts.map((p) => `${p.label} ${p.how}`), step: 'ladder-drawings' },
    ...(r.additional ? [{ label: PL.add, amount: -r.additional, step: 'ladder-additional' }] : []),
    { label: PL.adjusted, amount: r.adjusted, subtotal: true as const, step: r.additional ? 'ladder-additional' : 'ladder-drawings' },
    { label: PL.open, amount: -r.capital[0], step: 'ladder-open' },
    { label: r.adjs.length ? PL.before : PL.result, amount: r.before, subtotal: true as const, step: 'ladder-open' },
  ];
  if (r.adjs.length) {
    for (const a of r.adjs) rows.push({ label: a.label, amount: a.effect, details: [a.how], step: `adj-${a.key}` });
    rows.push({ label: PL.net, amount: r.net, subtotal: true, step: `adj-${r.adjs.at(-1)!.key}` });
  }
  return rows;
}
