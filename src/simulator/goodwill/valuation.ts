import { formatINR, type Paise } from '@/engine/money';
import { cmp, div, fr, mul, sub, ZERO, type Fr } from '../partnership/fraction';

// ---------------------------------------------------------------------------------------------------------------
// The valuation of goodwill, as src/content/cbse12/goodwill.ts and its templates teach it (CBSE 2025-26):
//  - the profits of past years (years ended 31 March) are first brought to normal profits: an abnormal loss is added
//    back, an abnormal gain taken out, an omitted expense charged, wrongly valued closing stock corrected in its own
//    year and the next (in the opposite direction), and repairs wrongly debited to an asset charged to profit with the
//    depreciation charged on them added back;
//  - average profit = total of the normal profits / number of years (a loss deducted); weighted average profit =
//    total of the products / total of the weights; a fair remuneration for the partners' work, when the profits were
//    arrived at without it, is deducted from the average;
//  - capital employed = assets used in the business (not goodwill, non-trade investments or fictitious assets) less
//    outside liabilities; normal profit = capital employed x normal rate / 100; super profit = average profit - normal
//    profit;
//  - goodwill = average profit x years' purchase; or super profit x years' purchase; or capitalised value of the
//    average profit (average profit x 100 / rate) - capital employed; or super profit x 100 / rate.
// Every figure is worked exactly (as a fraction of paise) and rounded half away from nil to the paisa only when it
// is shown; ready examples and questions are set so that every figure comes out in whole rupees, as a board question
// does. A method that leaves nothing (or less than nothing) gives no goodwill.
// ---------------------------------------------------------------------------------------------------------------

export type AdjKind = 'abnormalLoss' | 'abnormalGain' | 'stockOver' | 'stockUnder' | 'omittedExpense' | 'repairsCapitalised';

export interface GwAdjustment {
  kind: AdjKind;
  /** The year it belongs to, counted from the first year listed (repairs wrongly capitalised: always the last). */
  year: number;
  amount: Paise;
  /** Repairs wrongly capitalised: the rate of depreciation charged on them for that year. */
  rate?: number;
}

export type Averaging = 'simple' | 'weighted';
export type GwMethod = 'average' | 'super' | 'capAverage' | 'capSuper';
export const GW_METHODS: readonly GwMethod[] = ['average', 'super', 'capAverage', 'capSuper'];

/** What the books show on the valuation date, from which the capital employed is found. */
export interface CapitalBooks {
  /** Assets used in the business (tangible, at work in it). */
  trade: Paise;
  /** Goodwill already standing in the books. */
  goodwill: Paise;
  /** Investments that are not a part of the trade. */
  nonTrade: Paise;
  /** A fictitious asset: deferred advertisement expenditure. */
  fictitious: Paise;
  /** What is owed to outsiders. */
  outside: Paise;
}

export interface GwInputs {
  firm: string;
  /** The calendar year in which the last accounting year listed ends: 2025 for 2024-25. */
  lastYear: number;
  /** Each year's result as the books show it, oldest first; a loss is negative. */
  profits: Paise[];
  adjustments: GwAdjustment[];
  averaging: Averaging;
  /** The weight of each year, oldest first (used with the weighted average). */
  weights: number[];
  /** A fair remuneration a year, in all, for the partners' work (0 when the profits already allow for it). */
  remuneration: Paise;
  books: CapitalBooks;
  /** The normal rate of return, % a year. */
  rate: number;
  /** The number of years' purchase (whole or a half). */
  purchase: number;
  method: GwMethod;
}

export const METHOD_NAME: Record<GwMethod, string> = {
  average: 'Average profit method',
  super: 'Super profit method',
  capAverage: 'Capitalisation of average profit',
  capSuper: 'Capitalisation of super profit',
};

/** The accounting year ended 31 March `end`, as it is named: "2024-25". */
export const fy = (end: number): string => `${end - 1}-${String(end % 100).padStart(2, '0')}`;
export const yearLabels = (i: Pick<GwInputs, 'lastYear' | 'profits'>): string[] => i.profits.map((_, k) => fy(i.lastYear - i.profits.length + 1 + k));

const inr = formatINR;

/** A fraction of paise rounded half away from nil to the paisa. */
export function toPaise(x: Fr): Paise {
  const v = Math.round(Math.abs(x.n) / x.d);
  return x.n < 0 ? -v : v;
}
/** Whether a fraction of paise is a whole number of rupees. */
export const wholeRupees = (x: Fr): boolean => x.d === 1 && x.n % 100 === 0;
/** A figure as shown: ₹ in the Indian grouping, to the paisa when it is not whole. */
export const show = (x: Fr | Paise): string => inr(typeof x === 'number' ? x : toPaise(x));
/** "2.5" years' purchase. */
export const yearsText = (n: number): string => String(n);

/** One change made to a year's profit. */
export interface Delta {
  year: number;
  by: Paise;
  why: string;
  /** The adjustment it comes from. */
  from: number;
}

/** What an adjustment says, as a question gives it. */
export function adjustmentText(a: GwAdjustment, labels: readonly string[], profits?: readonly Paise[]): string {
  const y = labels[a.year];
  const x = inr(a.amount);
  // A year that ended in a loss is named as one.
  const result = profits && profits[a.year] < 0 ? 'loss' : 'profit';
  switch (a.kind) {
    case 'abnormalLoss':
      return `The ${result} of ${y} is after charging an abnormal loss of ${x} by fire.`;
    case 'abnormalGain':
      return result === 'loss' ? `The loss of ${y} is after crediting a gain of ${x} on the sale of a plot of land.` : `The profit of ${y} includes a gain of ${x} on the sale of a plot of land.`;
    case 'stockOver':
      return `The closing stock of ${y} was overvalued by ${x}.`;
    case 'stockUnder':
      return `The closing stock of ${y} was undervalued by ${x}.`;
    case 'omittedExpense':
      return `Rent of ${x} for ${y} was left out of the books altogether.`;
    case 'repairsCapitalised':
      return `In ${y}, repairs of ${x} were wrongly debited to Machinery A/c, and depreciation at ${a.rate ?? 0}% was charged on them for the year.`;
  }
}

/** A short name of an adjustment, for a chip on the picture. */
export function adjustmentShort(a: GwAdjustment): string {
  switch (a.kind) {
    case 'abnormalLoss':
      return 'Loss by fire';
    case 'abnormalGain':
      return 'Gain on sale of land';
    case 'stockOver':
      return 'Stock overvalued';
    case 'stockUnder':
      return 'Stock undervalued';
    case 'omittedExpense':
      return 'Rent omitted';
    case 'repairsCapitalised':
      return 'Repairs capitalised';
  }
}

/** The changes an adjustment makes to the yearly profits. */
export function deltasOf(a: GwAdjustment, from: number, k: number): Delta[] {
  const x = a.amount;
  switch (a.kind) {
    case 'abnormalLoss':
      return [{ year: a.year, by: x, why: 'abnormal loss added back', from }];
    case 'abnormalGain':
      return [{ year: a.year, by: -x, why: 'abnormal gain taken out', from }];
    case 'stockOver':
      return [
        { year: a.year, by: -x, why: 'closing stock overvalued', from },
        ...(a.year + 1 < k ? [{ year: a.year + 1, by: x, why: 'opening stock overvalued', from }] : []),
      ];
    case 'stockUnder':
      return [
        { year: a.year, by: x, why: 'closing stock undervalued', from },
        ...(a.year + 1 < k ? [{ year: a.year + 1, by: -x, why: 'opening stock undervalued', from }] : []),
      ];
    case 'omittedExpense':
      return [{ year: a.year, by: -x, why: 'rent omitted, now charged', from }];
    case 'repairsCapitalised':
      return [
        { year: a.year, by: -x, why: 'repairs charged to profit', from },
        { year: a.year, by: Math.round((x * (a.rate ?? 0)) / 100), why: 'depreciation on the repairs added back', from },
      ];
  }
}

export interface YearRow {
  label: string;
  /** As the books show it. */
  books: Paise;
  deltas: Delta[];
  /** After the adjustments. */
  normal: Paise;
  weight: number;
  /** normal x weight (the weighted average only). */
  product: Paise;
}

export interface Valuation {
  inputs: GwInputs;
  years: YearRow[];
  /** Total of the normal profits. */
  total: Paise;
  /** Total of the products, and of the weights. */
  products: Paise;
  weightTotal: number;
  /** The (simple or weighted) average of the normal profits, before any remuneration. */
  average: Fr;
  /** The average profit the valuation uses: after the partners' remuneration. */
  averageAfter: Fr;
  capitalEmployed: Paise;
  normalProfit: Fr;
  superProfit: Fr;
  /** Average profit x 100 / rate. */
  capitalisedValue: Fr;
  /** Goodwill by each method, as worked (nil or less means no goodwill). */
  raw: Record<GwMethod, Fr>;
  /** Goodwill by each method, nil when the working leaves nothing. */
  goodwill: Record<GwMethod, Fr>;
}

const sumP = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** The capital employed: assets used in the business less outside liabilities. */
export const capitalEmployedOf = (b: CapitalBooks): Paise => b.trade - b.outside;
/** Every asset the books show, those not employed in the business among them. */
export const totalAssetsOf = (b: CapitalBooks): Paise => b.trade + b.goodwill + b.nonTrade + b.fictitious;

export function value(inputs: GwInputs): Valuation {
  const k = inputs.profits.length;
  const labels = yearLabels(inputs);
  const all = inputs.adjustments.flatMap((a, i) => deltasOf(a, i, k));
  const weighted = inputs.averaging === 'weighted';
  const years: YearRow[] = inputs.profits.map((p, i) => {
    const deltas = all.filter((d) => d.year === i);
    const normal = p + sumP(deltas.map((d) => d.by));
    const weight = weighted ? inputs.weights[i] : 1;
    return { label: labels[i], books: p, deltas, normal, weight, product: normal * weight };
  });
  const total = sumP(years.map((y) => y.normal));
  const products = sumP(years.map((y) => y.product));
  const weightTotal = weighted ? sumP(years.map((y) => y.weight)) : k;
  const average = weighted ? fr(products, weightTotal) : fr(total, k);
  const averageAfter = sub(average, fr(inputs.remuneration));
  const capitalEmployed = capitalEmployedOf(inputs.books);
  const normalProfit = fr(capitalEmployed * inputs.rate, 100);
  const superProfit = sub(averageAfter, normalProfit);
  const capitalisedValue = div(mul(averageAfter, fr(100)), fr(inputs.rate));
  const n = purchaseFr(inputs.purchase);
  const raw: Record<GwMethod, Fr> = {
    average: mul(averageAfter, n),
    super: mul(superProfit, n),
    capAverage: sub(capitalisedValue, fr(capitalEmployed)),
    capSuper: div(mul(superProfit, fr(100)), fr(inputs.rate)),
  };
  const pos = (x: Fr): Fr => (cmp(x, ZERO) > 0 ? x : ZERO);
  const goodwill: Record<GwMethod, Fr> = { average: pos(raw.average), super: pos(raw.super), capAverage: pos(raw.capAverage), capSuper: pos(raw.capSuper) };
  return { inputs, years, total, products, weightTotal, average, averageAfter, capitalEmployed, normalProfit, superProfit, capitalisedValue, raw, goodwill };
}

/** Years' purchase as an exact fraction (2.5 is 5/2). */
export const purchaseFr = (n: number): Fr => fr(Math.round(n * 2), 2);

/** Why the inputs cannot be valued as they stand, or null. */
export function problemOf(i: GwInputs): string | null {
  const k = i.profits.length;
  if (k < 2 || k > 6) return 'Take from two to six years.';
  if (i.weights.length !== k || i.weights.some((w) => !Number.isInteger(w) || w < 1)) return 'Every weight must be a whole number of at least 1.';
  if (!(i.rate > 0 && i.rate <= 50)) return 'The normal rate of return must be above 0% and at most 50%.';
  if (!(i.purchase > 0) || Math.round(i.purchase * 2) !== i.purchase * 2) return "The years' purchase must be a whole number or a half.";
  if (i.books.trade <= i.books.outside) return 'The assets used in the business must be more than the outside liabilities, or there is no capital employed.';
  for (const a of i.adjustments) {
    if (a.year < 0 || a.year >= k) return 'An adjustment is for a year that is not listed.';
    if (a.amount <= 0) return 'An adjustment must have an amount.';
    if (a.kind === 'repairsCapitalised' && a.year !== k - 1) return 'Repairs wrongly capitalised are taken in the last year listed only.';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// The working, in words: as a student writes it under "Calculation of goodwill".
// ---------------------------------------------------------------------------------------------------------------

/** "2024-25: ₹1,20,000 + ₹30,000 (abnormal loss added back) = ₹1,50,000." */
export const yearWorking = (y: YearRow): string =>
  y.deltas.length === 0
    ? `${y.label}: ${inr(y.books)} (no adjustment).`
    : `${y.label}: ${signed(y.books)} ${y.deltas.map((d) => `${d.by >= 0 ? '+' : '-'} ${inr(Math.abs(d.by))} (${d.why})`).join(' ')} = ${signed(y.normal)}.`;

/** A result: "₹1,20,000", or "(loss) ₹20,000" written as a negative. */
export const signed = (p: Paise): string => (p < 0 ? `- ${inr(-p)}` : inr(p));

export function averageWorking(v: Valuation): string {
  const k = v.years.length;
  if (v.inputs.averaging === 'weighted') {
    return `Weighted average profit = total of the products ${signed(v.products)} / total of the weights ${v.weightTotal} = ${show(v.average)}.`;
  }
  return `Average profit = total of the normal profits ${signed(v.total)} / ${k} years = ${show(v.average)}.`;
}

export const remunerationWorking = (v: Valuation): string =>
  `Average profit after the partners' remuneration = ${show(v.average)} - ${inr(v.inputs.remuneration)} = ${show(v.averageAfter)}.`;

export function capitalWorking(v: Valuation): string {
  const b = v.inputs.books;
  const out = [b.goodwill ? `goodwill ${inr(b.goodwill)}` : '', b.nonTrade ? `non-trade investments ${inr(b.nonTrade)}` : '', b.fictitious ? `deferred advertisement expenditure ${inr(b.fictitious)}` : ''].filter(Boolean);
  return `Capital employed = assets used in the business ${inr(b.trade)}${out.length ? ` (leaving out ${out.join(', ')})` : ''} - outside liabilities ${inr(b.outside)} = ${inr(v.capitalEmployed)}.`;
}

export const normalWorking = (v: Valuation): string => `Normal profit = ${inr(v.capitalEmployed)} x ${v.inputs.rate} / 100 = ${show(v.normalProfit)}.`;

export const superWorking = (v: Valuation): string => `Super profit = ${show(v.averageAfter)} - ${show(v.normalProfit)} = ${cmp(v.superProfit, ZERO) < 0 ? `- ${show(fr(-v.superProfit.n, v.superProfit.d))}` : show(v.superProfit)}.`;

export const capitalisedWorking = (v: Valuation): string => `Capitalised value of the average profit = ${show(v.averageAfter)} x 100 / ${v.inputs.rate} = ${show(v.capitalisedValue)}.`;

/** The last line of the working: the goodwill by a method, or why there is none. */
export function goodwillWorking(v: Valuation, m: GwMethod): string {
  const n = yearsText(v.inputs.purchase);
  const none = cmp(v.raw[m], ZERO) <= 0;
  switch (m) {
    case 'average':
      return none ? 'The average profit is nil or a loss: there is no goodwill by this method.' : `Goodwill = ${show(v.averageAfter)} x ${n} years' purchase = ${show(v.goodwill.average)}.`;
    case 'super':
      return none ? 'The firm earns no more than the normal profit, so there is no super profit and no goodwill.' : `Goodwill = super profit ${show(v.superProfit)} x ${n} years' purchase = ${show(v.goodwill.super)}.`;
    case 'capAverage':
      return none
        ? `The capitalised value ${show(v.capitalisedValue)} is no more than the capital employed ${inr(v.capitalEmployed)}: there is no goodwill.`
        : `Goodwill = capitalised value ${show(v.capitalisedValue)} - capital employed ${inr(v.capitalEmployed)} = ${show(v.goodwill.capAverage)}.`;
    case 'capSuper':
      return none ? 'There is no super profit to capitalise, so there is no goodwill.' : `Goodwill = super profit ${show(v.superProfit)} x 100 / ${v.inputs.rate} = ${show(v.goodwill.capSuper)}.`;
  }
}

/** Every line of the working of the chosen method, in the order a student writes them. */
export function working(v: Valuation, m: GwMethod = v.inputs.method): string[] {
  const out = [...v.years.filter((y) => y.deltas.length > 0).map(yearWorking)];
  if (v.inputs.averaging === 'weighted') out.push(`Products: ${v.years.map((y) => `${signed(y.normal)} x ${y.weight}`).join(' + ')} = ${signed(v.products)}.`);
  out.push(averageWorking(v));
  if (v.inputs.remuneration > 0) out.push(remunerationWorking(v));
  if (m !== 'average') out.push(capitalWorking(v));
  if (m === 'super' || m === 'capSuper') out.push(normalWorking(v), superWorking(v));
  if (m === 'capAverage') out.push(capitalisedWorking(v));
  out.push(goodwillWorking(v, m));
  return out;
}

/** The figure to the paisa (for tests and the screen): goodwill by a method. */
export const goodwillPaise = (v: Valuation, m: GwMethod): Paise => toPaise(v.goodwill[m]);
