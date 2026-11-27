// ---------------------------------------------------------------------------------------------------------------
// The lab "Ratios on the dials": a balance sheet and a statement of profit and loss in brief, and every ratio of the
// CBSE 2025-26 syllabus worked out from them, with the terms that go into each and the figures plugged in.
//
// The definitions are those of the topic (src/content/cbse12/accounting-ratios.ts):
// - Current assets: current investments, inventories, trade receivables, cash and cash equivalents, prepaid
//   expenses (other current assets). Current liabilities: short-term borrowings (bank overdraft), trade payables,
//   other current liabilities, short-term provisions.
// - Quick assets = current assets − inventories − prepaid expenses.
// - Debt = long-term borrowings + long-term provisions. Equity = shareholders' funds = share capital + reserves and
//   surplus. Total assets = non-current assets + current assets. Capital employed = shareholders' funds +
//   non-current liabilities.
// - Proprietary ratio on total assets (as CBSE marking schemes take it).
// - Interest coverage = profit before interest and tax ÷ interest on long-term debt.
// - Inventory turnover = cost of revenue from operations ÷ average inventory; trade receivables turnover = credit
//   revenue from operations ÷ average trade receivables; trade payables turnover = net credit purchases ÷ average
//   trade payables, where net credit purchases = cost of revenue from operations + closing inventories − opening
//   inventories − purchases for cash (there are no direct expenses, and every purchase is on credit unless goods
//   are bought for cash); working capital turnover = revenue from operations ÷ closing working capital.
// - Gross profit, operating, operating profit and net profit ratios on revenue from operations; the net profit ratio
//   here is on the profit after tax. Return on investment = profit before interest and tax ÷ capital employed.
//
// A ratio is kept as an exact fraction of two whole numbers (paise), and rounded only when it is shown (to two
// decimal places, half away from nil).
// ---------------------------------------------------------------------------------------------------------------

import { formatINR, type Paise } from '@/engine/money';

export interface RatioFigures {
  company: string;
  // The balance sheet at the end of the year.
  shareCapital: Paise;
  reserves: Paise;
  longTermBorrowings: Paise;
  longTermProvisions: Paise;
  shortTermBorrowings: Paise;
  tradePayables: Paise;
  otherCurrentLiabilities: Paise;
  shortTermProvisions: Paise;
  ppe: Paise;
  nonCurrentInvestments: Paise;
  currentInvestments: Paise;
  inventories: Paise;
  tradeReceivables: Paise;
  cash: Paise;
  prepaidExpenses: Paise;
  // The statement of profit and loss for the year.
  creditRevenue: Paise;
  cashRevenue: Paise;
  costOfRevenue: Paise;
  operatingExpenses: Paise;
  otherIncome: Paise;
  /** Interest on long-term borrowings. */
  financeCosts: Paise;
  /** Tax, as a percentage of the profit before tax (none on a loss). */
  taxRate: number;
  // Balances at the start of the year (the additional information).
  openingInventories: Paise;
  openingTradeReceivables: Paise;
  openingTradePayables: Paise;
  /** Goods bought for cash during the year (nil unless the sandbox buys some): not part of net credit purchases. */
  cashPurchases: Paise;
}

export type InputLine = Exclude<keyof RatioFigures, 'company' | 'taxRate'>;
export type DerivedLine =
  | 'shareholdersFunds'
  | 'nonCurrentLiabilities'
  | 'currentLiabilities'
  | 'totalLiabilities'
  | 'nonCurrentAssets'
  | 'currentAssets'
  | 'totalAssets'
  | 'revenue'
  | 'grossProfit'
  | 'operatingProfit'
  | 'pbit'
  | 'pbt'
  | 'tax'
  | 'pat'
  | 'purchases';
export type LineId = InputLine | DerivedLine;

export const BALANCE_SHEET_LINES: InputLine[] = [
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
];
/** The side of the balance sheet each line stands on. */
export const ASSET_LINES = new Set<InputLine>(['ppe', 'nonCurrentInvestments', 'currentInvestments', 'inventories', 'tradeReceivables', 'cash', 'prepaidExpenses']);

export const LINE_LABEL: Record<LineId, string> = {
  shareCapital: 'Share capital',
  reserves: 'Reserves and surplus',
  longTermBorrowings: 'Long-term borrowings (debentures)',
  longTermProvisions: 'Long-term provisions',
  shortTermBorrowings: 'Short-term borrowings',
  tradePayables: 'Trade payables',
  otherCurrentLiabilities: 'Other current liabilities',
  shortTermProvisions: 'Short-term provisions',
  ppe: 'Property, plant and equipment (net)',
  nonCurrentInvestments: 'Non-current investments',
  currentInvestments: 'Current investments',
  inventories: 'Inventories',
  tradeReceivables: 'Trade receivables',
  cash: 'Cash and cash equivalents',
  prepaidExpenses: 'Prepaid expenses',
  creditRevenue: 'Credit revenue from operations',
  cashRevenue: 'Cash revenue from operations',
  costOfRevenue: 'Cost of revenue from operations',
  operatingExpenses: 'Operating expenses',
  otherIncome: 'Other income (non-operating)',
  financeCosts: 'Interest on long-term borrowings',
  openingInventories: 'Inventories at the start of the year',
  openingTradeReceivables: 'Trade receivables at the start of the year',
  openingTradePayables: 'Trade payables at the start of the year',
  cashPurchases: 'Purchases for cash',
  shareholdersFunds: "Shareholders' funds",
  nonCurrentLiabilities: 'Non-current liabilities',
  currentLiabilities: 'Current liabilities',
  totalLiabilities: 'Total equity and liabilities',
  nonCurrentAssets: 'Non-current assets',
  currentAssets: 'Current assets',
  totalAssets: 'Total assets',
  revenue: 'Revenue from operations',
  grossProfit: 'Gross profit',
  operatingProfit: 'Operating profit',
  pbit: 'Profit before interest and tax',
  pbt: 'Profit before tax',
  tax: 'Tax',
  pat: 'Profit after tax',
  purchases: 'Net credit purchases (worked out)',
};

/** Every line, the derived ones worked out. */
export type Lines = Record<LineId, Paise>;

export function linesOf(f: RatioFigures): Lines {
  const shareholdersFunds = f.shareCapital + f.reserves;
  const nonCurrentLiabilities = f.longTermBorrowings + f.longTermProvisions;
  const currentLiabilities = f.shortTermBorrowings + f.tradePayables + f.otherCurrentLiabilities + f.shortTermProvisions;
  const nonCurrentAssets = f.ppe + f.nonCurrentInvestments;
  const currentAssets = f.currentInvestments + f.inventories + f.tradeReceivables + f.cash + f.prepaidExpenses;
  const revenue = f.creditRevenue + f.cashRevenue;
  const grossProfit = revenue - f.costOfRevenue;
  const operatingProfit = grossProfit - f.operatingExpenses;
  const pbit = operatingProfit + f.otherIncome;
  const pbt = pbit - f.financeCosts;
  // Tax to the whole rupee.
  const tax = pbt > 0 ? Math.round((pbt / 100) * (f.taxRate / 100)) * 100 : 0;
  const { company, taxRate, ...inputs } = f;
  void company;
  void taxRate;
  return {
    ...inputs,
    shareholdersFunds,
    nonCurrentLiabilities,
    currentLiabilities,
    totalLiabilities: shareholdersFunds + nonCurrentLiabilities + currentLiabilities,
    nonCurrentAssets,
    currentAssets,
    totalAssets: nonCurrentAssets + currentAssets,
    revenue,
    grossProfit,
    operatingProfit,
    pbit,
    pbt,
    tax,
    pat: pbt - tax,
    purchases: f.costOfRevenue + f.inventories - f.openingInventories - f.cashPurchases,
  };
}

export type Group = 'liquidity' | 'solvency' | 'activity' | 'profitability';
export const GROUPS: { id: Group; title: string; asks: string }[] = [
  { id: 'liquidity', title: 'Liquidity', asks: 'Can it pay what falls due within a year?' },
  { id: 'solvency', title: 'Solvency', asks: 'Can it carry its long-term debt and the interest on it?' },
  { id: 'activity', title: 'Activity (turnover)', asks: 'How well does it use what it has?' },
  { id: 'profitability', title: 'Profitability', asks: 'What does it earn?' },
];

export type RatioId =
  | 'current'
  | 'quick'
  | 'debtEquity'
  | 'assetsToDebt'
  | 'proprietary'
  | 'interestCoverage'
  | 'inventoryTurnover'
  | 'receivablesTurnover'
  | 'payablesTurnover'
  | 'workingCapitalTurnover'
  | 'grossProfit'
  | 'operatingRatio'
  | 'operatingProfit'
  | 'netProfit'
  | 'roi';

export type Unit = 'ratio' | 'times' | 'percent';

/** A line that goes into a term, added or taken away. */
export interface Part {
  line: LineId;
  sign: 1 | -1;
}

/** One term of a ratio: its name, what makes it, and its value. An average is (start + end) ÷ 2. */
export interface Term {
  name: string;
  parts: Part[];
  value: Paise;
  /** "Inventories at the start ₹1,60,000 + at the end ₹2,40,000, ÷ 2": the term is an average of two balances. */
  average?: boolean;
}

export interface RatioDef {
  id: RatioId;
  group: Group;
  name: string;
  unit: Unit;
  formula: string;
  top(l: Lines): Term;
  bottom(l: Lines): Term;
  /** Why the ratio cannot be worked out on these figures, or null. */
  undefinedWhen(l: Lines): string | null;
  /** The face of the dial: where it starts and ends, and a mark often quoted. */
  dial: { min: number; max: number; mark?: { at: number; label: string } };
}

const sum = (l: Lines, parts: Part[]): Paise => parts.reduce((s, p) => s + p.sign * l[p.line], 0);
const term = (name: string, parts: Part[], l: Lines): Term => ({ name, parts, value: sum(l, parts) });
const avg = (name: string, open: LineId, close: LineId, l: Lines): Term => ({
  name,
  parts: [
    { line: open, sign: 1 },
    { line: close, sign: 1 },
  ],
  value: (l[open] + l[close]) / 2,
  average: true,
});
const P = (...lines: LineId[]): Part[] => lines.map((line) => ({ line, sign: 1 }));
const CA: Part[] = P('currentInvestments', 'inventories', 'tradeReceivables', 'cash', 'prepaidExpenses');
const CL: Part[] = P('shortTermBorrowings', 'tradePayables', 'otherCurrentLiabilities', 'shortTermProvisions');
const SF: Part[] = P('shareCapital', 'reserves');
const DEBT: Part[] = P('longTermBorrowings', 'longTermProvisions');
const TA: Part[] = P('ppe', 'nonCurrentInvestments', ...CA.map((p) => p.line));
const noRevenue = (l: Lines) => (l.revenue <= 0 ? 'There is no revenue from operations to compare with.' : null);

export const RATIOS: RatioDef[] = [
  {
    id: 'current',
    group: 'liquidity',
    name: 'Current ratio',
    unit: 'ratio',
    formula: 'Current assets ÷ Current liabilities',
    top: (l) => term('Current assets', CA, l),
    bottom: (l) => term('Current liabilities', CL, l),
    undefinedWhen: (l) => (l.currentLiabilities <= 0 ? 'There are no current liabilities to compare with.' : null),
    dial: { min: 0, max: 4, mark: { at: 2, label: '2 : 1, a rule of thumb' } },
  },
  {
    id: 'quick',
    group: 'liquidity',
    name: 'Quick ratio',
    unit: 'ratio',
    formula: 'Quick assets ÷ Current liabilities, where quick assets = Current assets − Inventories − Prepaid expenses',
    top: (l) => term('Quick assets', [...CA.filter((p) => p.line !== 'inventories' && p.line !== 'prepaidExpenses')], l),
    bottom: (l) => term('Current liabilities', CL, l),
    undefinedWhen: (l) => (l.currentLiabilities <= 0 ? 'There are no current liabilities to compare with.' : null),
    dial: { min: 0, max: 3, mark: { at: 1, label: '1 : 1, a rule of thumb' } },
  },
  {
    id: 'debtEquity',
    group: 'solvency',
    name: 'Debt to equity ratio',
    unit: 'ratio',
    formula: "Debt ÷ Equity: (Long-term borrowings + Long-term provisions) ÷ Shareholders' funds",
    top: (l) => term('Debt', DEBT, l),
    bottom: (l) => term("Shareholders' funds", SF, l),
    undefinedWhen: (l) => (l.shareholdersFunds <= 0 ? "Shareholders' funds are nil or below nil: the ratio has no meaning." : null),
    dial: { min: 0, max: 3 },
  },
  {
    id: 'assetsToDebt',
    group: 'solvency',
    name: 'Total assets to debt ratio',
    unit: 'ratio',
    formula: 'Total assets ÷ Debt',
    top: (l) => term('Total assets', TA, l),
    bottom: (l) => term('Debt', DEBT, l),
    undefinedWhen: (l) => (l.longTermBorrowings + l.longTermProvisions <= 0 ? 'There is no long-term debt to cover.' : null),
    dial: { min: 0, max: 8 },
  },
  {
    id: 'proprietary',
    group: 'solvency',
    name: 'Proprietary ratio',
    unit: 'ratio',
    formula: "Shareholders' funds ÷ Total assets",
    top: (l) => term("Shareholders' funds", SF, l),
    bottom: (l) => term('Total assets', TA, l),
    undefinedWhen: (l) => (l.totalAssets <= 0 ? 'There are no assets.' : null),
    dial: { min: 0, max: 1 },
  },
  {
    id: 'interestCoverage',
    group: 'solvency',
    name: 'Interest coverage ratio',
    unit: 'times',
    formula: 'Profit before interest and tax ÷ Interest on long-term debt',
    top: (l) => term('Profit before interest and tax', P('pbit'), l),
    bottom: (l) => term('Interest on long-term debt', P('financeCosts'), l),
    undefinedWhen: (l) => (l.financeCosts <= 0 ? 'There is no interest on long-term debt to cover.' : null),
    dial: { min: 0, max: 20 },
  },
  {
    id: 'inventoryTurnover',
    group: 'activity',
    name: 'Inventory turnover ratio',
    unit: 'times',
    formula: 'Cost of revenue from operations ÷ Average inventory, where average inventory = (Opening + Closing) ÷ 2',
    top: (l) => term('Cost of revenue from operations', P('costOfRevenue'), l),
    bottom: (l) => avg('Average inventory', 'openingInventories', 'inventories', l),
    undefinedWhen: (l) => (l.openingInventories + l.inventories <= 0 ? 'There is no inventory to turn over.' : null),
    dial: { min: 0, max: 20 },
  },
  {
    id: 'receivablesTurnover',
    group: 'activity',
    name: 'Trade receivables turnover ratio',
    unit: 'times',
    formula: 'Credit revenue from operations ÷ Average trade receivables',
    top: (l) => term('Credit revenue from operations', P('creditRevenue'), l),
    bottom: (l) => avg('Average trade receivables', 'openingTradeReceivables', 'tradeReceivables', l),
    undefinedWhen: (l) => (l.openingTradeReceivables + l.tradeReceivables <= 0 ? 'There are no trade receivables.' : null),
    dial: { min: 0, max: 20 },
  },
  {
    id: 'payablesTurnover',
    group: 'activity',
    name: 'Trade payables turnover ratio',
    unit: 'times',
    formula: 'Net credit purchases ÷ Average trade payables',
    top: (l) => term('Net credit purchases', P('purchases'), l),
    bottom: (l) => avg('Average trade payables', 'openingTradePayables', 'tradePayables', l),
    undefinedWhen: (l) =>
      l.openingTradePayables + l.tradePayables <= 0 ? 'There are no trade payables.' : l.purchases <= 0 ? 'Purchases work out at nil or below: the figures do not hang together.' : null,
    dial: { min: 0, max: 20 },
  },
  {
    id: 'workingCapitalTurnover',
    group: 'activity',
    name: 'Working capital turnover ratio',
    unit: 'times',
    formula: 'Revenue from operations ÷ Working capital, where working capital = Current assets − Current liabilities',
    top: (l) => term('Revenue from operations', P('creditRevenue', 'cashRevenue'), l),
    bottom: (l) => term('Working capital', [...CA, ...CL.map((p) => ({ ...p, sign: -1 as const }))], l),
    undefinedWhen: (l) => (l.currentAssets - l.currentLiabilities <= 0 ? 'Working capital is nil or below nil: the ratio has no meaning.' : null),
    dial: { min: 0, max: 20 },
  },
  {
    id: 'grossProfit',
    group: 'profitability',
    name: 'Gross profit ratio',
    unit: 'percent',
    formula: 'Gross profit ÷ Revenue from operations × 100',
    top: (l) => term('Gross profit', P('grossProfit'), l),
    bottom: (l) => term('Revenue from operations', P('creditRevenue', 'cashRevenue'), l),
    undefinedWhen: noRevenue,
    dial: { min: 0, max: 60 },
  },
  {
    id: 'operatingRatio',
    group: 'profitability',
    name: 'Operating ratio',
    unit: 'percent',
    formula: '(Cost of revenue from operations + Operating expenses) ÷ Revenue from operations × 100',
    top: (l) => term('Operating cost', P('costOfRevenue', 'operatingExpenses'), l),
    bottom: (l) => term('Revenue from operations', P('creditRevenue', 'cashRevenue'), l),
    undefinedWhen: noRevenue,
    dial: { min: 50, max: 110 },
  },
  {
    id: 'operatingProfit',
    group: 'profitability',
    name: 'Operating profit ratio',
    unit: 'percent',
    formula: 'Operating profit ÷ Revenue from operations × 100 (= 100 − operating ratio)',
    top: (l) => term('Operating profit', P('operatingProfit'), l),
    bottom: (l) => term('Revenue from operations', P('creditRevenue', 'cashRevenue'), l),
    undefinedWhen: noRevenue,
    dial: { min: -10, max: 40 },
  },
  {
    id: 'netProfit',
    group: 'profitability',
    name: 'Net profit ratio',
    unit: 'percent',
    formula: 'Net profit after tax ÷ Revenue from operations × 100',
    top: (l) => term('Net profit after tax', P('pat'), l),
    bottom: (l) => term('Revenue from operations', P('creditRevenue', 'cashRevenue'), l),
    undefinedWhen: noRevenue,
    dial: { min: -10, max: 30 },
  },
  {
    id: 'roi',
    group: 'profitability',
    name: 'Return on investment',
    unit: 'percent',
    formula: "Profit before interest and tax ÷ Capital employed × 100, where capital employed = Shareholders' funds + Non-current liabilities",
    top: (l) => term('Profit before interest and tax', P('pbit'), l),
    bottom: (l) => term('Capital employed', [...SF, ...DEBT], l),
    undefinedWhen: (l) => (l.shareholdersFunds + l.nonCurrentLiabilities <= 0 ? 'Capital employed is nil or below nil.' : null),
    dial: { min: -10, max: 40 },
  },
];

export const ratioDef = (id: RatioId): RatioDef => RATIOS.find((r) => r.id === id)!;

export interface RatioValue {
  def: RatioDef;
  top: Term;
  bottom: Term;
  /** Null when it cannot be worked out, with the reason. */
  exact: number | null;
  /** The figure shown, in hundredths (2.5 : 1 is 250; 12.5% is 1250). */
  hundredths: number | null;
  reason: string | null;
}

/** Rounds n ÷ d to hundredths, half away from nil, exactly (n and d are whole numbers). */
export function roundHundredths(n: number, d: number): number {
  // BigInt, because n × 100 of a large figure in paise is beyond the whole numbers a double holds exactly.
  const zero = BigInt(0);
  const two = BigInt(2);
  const N = BigInt(Math.round(n)) * BigInt(100);
  const D = BigInt(Math.round(d));
  const neg = N < zero !== D < zero;
  const a = N < zero ? -N : N;
  const b = D < zero ? -D : D;
  const q = (two * a + b) / (two * b);
  return Number(neg ? -q : q);
}

/** A ratio worked out on figures. An average term is kept exact: n ÷ ((a + b) ÷ 2) = 2n ÷ (a + b). */
export function ratioOf(def: RatioDef, l: Lines): RatioValue {
  const top = def.top(l);
  const bottom = def.bottom(l);
  const reason = def.undefinedWhen(l);
  if (reason) return { def, top, bottom, exact: null, hundredths: null, reason };
  const [n, d] = fraction(def, top, bottom);
  return { def, top, bottom, exact: n / d, hundredths: roundHundredths(n, d), reason: null };
}

/** The ratio as a fraction of two whole numbers (a percentage times 100 is applied when it is shown). */
export function fraction(def: RatioDef, top: Term, bottom: Term): [number, number] {
  const n = (top.value * (bottom.average ? 2 : 1)) * (def.unit === 'percent' ? 100 : 1);
  const d = bottom.average ? bottom.value * 2 : bottom.value;
  return [n, d];
}

export const allRatios = (f: RatioFigures): RatioValue[] => {
  const l = linesOf(f);
  return RATIOS.map((def) => ratioOf(def, l));
};

/** "2.5", "1.13", "-3.2", "25" from hundredths. */
export function decimal(h: number): string {
  const neg = h < 0;
  const a = Math.abs(h);
  const whole = Math.floor(a / 100);
  const frac = a % 100;
  const tail = frac === 0 ? '' : `.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
  return `${neg ? '−' : ''}${whole}${tail}`;
}

export function showValue(unit: Unit, h: number | null): string {
  if (h === null) return 'Not defined';
  const n = decimal(h);
  return unit === 'ratio' ? `${n} : 1` : unit === 'times' ? `${n} times` : `${n}%`;
}

export const shown = (v: RatioValue): string => showValue(v.def.unit, v.hundredths);

/** "₹6,00,000 ÷ ₹3,00,000 = 2 : 1", with the average written out and "× 100" for a percentage. */
export function plugged(v: RatioValue): string {
  if (v.hundredths === null) return v.reason ?? '';
  const bottom = v.bottom.average ? `${money(v.bottom.value)} (average)` : money(v.bottom.value);
  return `${money(v.top.value)} ÷ ${bottom}${v.def.unit === 'percent' ? ' × 100' : ''} = ${shown(v)}`;
}

/** "₹2,40,000" or "−₹10,000"; an average may end in fifty paise. */
export const money = (p: Paise): string => (p < 0 ? `−${formatINR(-p)}` : formatINR(p));

/** How a term is made: "Inventories ₹2,40,000 + Trade receivables ₹2,00,000 + ... = ₹6,00,000". */
export function termWords(t: Term, l: Lines): string {
  if (t.average) return `(${LINE_LABEL[t.parts[0].line].replace(' at the start of the year', '')} at the start ${money(l[t.parts[0].line])} + at the end ${money(l[t.parts[1].line])}) ÷ 2 = ${money(t.value)}`;
  const used = t.parts.filter((p) => l[p.line] !== 0);
  if (used.length === 1 && used[0].sign === 1) return `${LINE_LABEL[used[0].line]} ${money(t.value)}`;
  if (used.length === 0) return `${money(0)}`;
  const body = used.map((p, i) => `${i === 0 ? (p.sign < 0 ? '− ' : '') : p.sign < 0 ? ' − ' : ' + '}${LINE_LABEL[p.line]} ${money(l[p.line])}`).join('');
  return `${body} = ${money(t.value)}`;
}

/** Which way a ratio moved between two sets of figures: by exact arithmetic on the fractions. Null if either is undefined. */
export function movement(def: RatioDef, before: Lines, after: Lines): -1 | 0 | 1 | null {
  const a = ratioOf(def, before);
  const b = ratioOf(def, after);
  if (a.exact === null || b.exact === null) return null;
  const [n1, d1] = fraction(def, a.top, a.bottom);
  const [n2, d2] = fraction(def, b.top, b.bottom);
  // n2/d2 − n1/d1 has the sign of n2·d1 − n1·d2 when d1 and d2 are both positive (every denominator here is).
  const diff = BigInt(Math.round(n2)) * BigInt(Math.round(d1)) - BigInt(Math.round(n1)) * BigInt(Math.round(d2));
  return diff > BigInt(0) ? 1 : diff < BigInt(0) ? -1 : 0;
}

/** Whether a balance sheet balances. */
export const balances = (l: Lines): boolean => l.totalAssets === l.totalLiabilities;
