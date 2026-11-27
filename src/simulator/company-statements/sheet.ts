import { formatINR, type Paise } from '@/engine/money';
import { ANALYSIS_LABEL, ANALYSIS_MAJOR, ASSET_MAJORS, EL_MAJORS, isAssetSub, itemById, ITEMS, MAJOR, majorOf, PPE_IA, PPE_PARTS, SUB_ORDER, SUBS, type Item, type Major, type Sub } from './heads';

// ---------------------------------------------------------------------------------------------------------------
// A company's balance sheet in the Schedule III form, built from its balances (the face: one figure for each
// sub-head with the number of its note; the notes: the items that make each figure), and the two tools of analysis
// the topic financial-statement-analysis teaches, on two periods:
//  - comparative: absolute change = later figure - earlier figure; percentage change = absolute change / EARLIER
//    figure × 100 (no percentage when the earlier figure is nil);
//  - common size: each line as a percentage of the base of its own period: the total of the balance sheet, or
//    revenue from operations for the Statement of Profit and Loss (so total income is more than 100).
// A percentage is kept in hundredths and rounded to two decimal places, half away from nil, each on its own (so the
// rounded lines of a common size statement may differ from their rounded total by 0.01).
// ---------------------------------------------------------------------------------------------------------------

export type Pair = [Paise, Paise];

export interface Holding {
  id: string;
  /** The balance, always above nil; an item that is deducted (calls in arrears, an accumulated loss) is deducted by its sub-head. */
  amount: Paise;
}

export interface PlData {
  /** The two years, earlier first: "2024-25". */
  years: [string, string];
  rev: Pair;
  oi: Pair;
  /** The expenses in the order of Schedule III, by the names the topic gives them. */
  exp: { name: string; v: Pair }[];
  /** Tax, % of the profit before tax. */
  rate: number;
}

export interface Company {
  name: string;
  /** The date of the balance sheet the board builds, and the one before it. */
  dates: [string, string];
  holdings: Holding[];
  /** The figure of each sub-head on the earlier date. */
  prev: Partial<Record<Sub, Paise>>;
  pl: PlData;
}

export const signed = (h: Holding): Paise => (itemById(h.id).deducted ? -h.amount : h.amount);

// --- The face and the notes -------------------------------------------------------------------------------------------

export interface FaceRow {
  sub: Sub;
  held: { item: Item; amount: Paise }[];
  amount: Paise;
}

/** One figure for each sub-head that has a balance, in the order of the form; in a sub-head its items in the bank's order, what is deducted last. */
export function faceRows(holdings: readonly Holding[]): FaceRow[] {
  return SUB_ORDER.flatMap((sub) => {
    const mine = holdings
      .map((h) => ({ item: itemById(h.id), amount: h.amount }))
      .filter((h) => h.item.sub === sub)
      .sort((a, b) => Number(!!a.item.deducted) - Number(!!b.item.deducted) || ITEMS.indexOf(a.item) - ITEMS.indexOf(b.item));
    return mine.length > 0 ? [{ sub, held: mine, amount: mine.reduce((t, h) => t + (h.item.deducted ? -h.amount : h.amount), 0) }] : [];
  });
}

export const totalOf = (rows: readonly FaceRow[], assets: boolean): Paise => rows.filter((r) => isAssetSub(r.sub) === assets).reduce((t, r) => t + r.amount, 0);
export const majorTotal = (rows: readonly FaceRow[], m: Major): Paise => rows.filter((r) => majorOf(r.sub) === m).reduce((t, r) => t + r.amount, 0);

export type BsLine =
  | { kind: 'part'; text: string }
  | { kind: 'major'; text: string }
  /** A sub-head shown over its parts: "Property, Plant and Equipment and Intangible Assets" over the four parts. */
  | { kind: 'group'; text: string }
  | { kind: 'row'; sub: Sub; label: string; note: string; amount: Paise; part?: boolean }
  | { kind: 'total'; label: string; amount: Paise };

/** The face of the balance sheet: the two parts, the major heads that have a figure, a row for each sub-head with its note, and the totals. */
export function faceLines(rows: readonly FaceRow[]): BsLine[] {
  const out: BsLine[] = [];
  let note = 0;
  for (const [part, majors, assets] of [['I. EQUITY AND LIABILITIES', EL_MAJORS, false], ['II. ASSETS', ASSET_MAJORS, true]] as const) {
    out.push({ kind: 'part', text: part });
    for (const m of majors) {
      const mine = rows.filter((r) => majorOf(r.sub) === m);
      if (mine.length === 0) continue;
      out.push({ kind: 'major', text: MAJOR[m] });
      for (const r of mine) {
        const part = PPE_PARTS.includes(r.sub);
        if (part && r === mine.find((x) => PPE_PARTS.includes(x.sub))) out.push({ kind: 'group', text: PPE_IA });
        out.push({ kind: 'row', sub: r.sub, label: SUBS[r.sub].label, note: String(++note), amount: r.amount, ...(part ? { part } : {}) });
      }
    }
    out.push({ kind: 'total', label: 'Total', amount: totalOf(rows, assets) });
  }
  return out;
}

export interface Note {
  no: string;
  sub: Sub;
  title: string;
  lines: { label: string; amount: Paise; less: boolean }[];
  total: Paise;
}

/** The notes to accounts: the items that make each figure of the face, a deduction as "Less:". */
export function notesOf(rows: readonly FaceRow[]): Note[] {
  return rows.map((r, k) => ({
    no: String(k + 1),
    sub: r.sub,
    title: SUBS[r.sub].label,
    lines: r.held.map((h) => ({ label: `${h.item.deducted ? 'Less: ' : ''}${h.item.name}`, amount: h.amount, less: !!h.item.deducted })),
    total: r.amount,
  }));
}

// --- Percentages --------------------------------------------------------------------------------------------------------

/** `part` as a percentage of `base`, in hundredths, rounded half away from nil; null without a base above nil. */
export function pctH(part: number, base: number): number | null {
  if (!(base > 0)) return null;
  const halves = 2 * Math.abs(part) * 10000;
  return (part < 0 ? -1 : 1) * Math.floor((halves + base) / (2 * base)) || 0;
}
/** True when `part` / `base` in hundredths falls exactly half-way between two hundredths: a student might round it either way. */
export function isHalfway(part: number, base: number): boolean {
  if (!(base > 0)) return false;
  const halves = 2 * Math.abs(part) * 10000;
  return halves % base === 0 && (halves / base) % 2 === 1;
}
/** Hundredths as a percentage, as the topic writes it: "25", "12.5", "16.67", "-37.5". */
export function pcText(h: number): string {
  const a = Math.abs(h);
  const s = a % 100 === 0 ? String(a / 100) : (a / 100).toFixed(2).replace(/0$/, '');
  return `${h < 0 ? '-' : ''}${s}`;
}
export const inr = formatINR;
/** A figure with its sign: "-₹36,000". */
export const signedInr = (p: Paise): string => (p < 0 ? `-${inr(-p)}` : inr(p));

// --- Statements of two periods -------------------------------------------------------------------------------------------

export type ALine = { kind: 'heading'; text: string } | { kind: 'row' | 'subtotal'; key: string; label: string; v: Pair };

/** The figure of each sub-head on the two dates, from a company's balances and its figures of the year before. */
export function pairsOf(c: Company): Partial<Record<Sub, Pair>> {
  const later = new Map(faceRows(c.holdings).map((r) => [r.sub, r.amount]));
  const out: Partial<Record<Sub, Pair>> = {};
  for (const s of SUB_ORDER) if (later.has(s) || (c.prev[s] ?? 0) !== 0) out[s] = [c.prev[s] ?? 0, later.get(s) ?? 0];
  return out;
}

/** A balance sheet of two dates as the topic's comparative and common size statements lay it out, from the figure of each sub-head. */
export function bsFrom(pairs: Partial<Record<Sub, Pair>>): ALine[] {
  const subs = SUB_ORDER.filter((s) => pairs[s]);
  const out: ALine[] = [];
  for (const [part, majors, assets] of [['I. EQUITY AND LIABILITIES', EL_MAJORS, false], ['II. ASSETS', ASSET_MAJORS, true]] as const) {
    out.push({ kind: 'heading', text: part });
    // The heads are numbered 1, 2, 3 in the order they stand, as the topic's statements number them.
    let no = 0;
    for (const m of majors) {
      const mine = subs.filter((s) => majorOf(s) === m);
      if (mine.length === 0) continue;
      out.push({ kind: 'heading', text: `${++no}. ${ANALYSIS_MAJOR[m]}` });
      for (const s of mine) out.push({ kind: 'row', key: s, label: ANALYSIS_LABEL[s], v: pairs[s]! });
    }
    const all = subs.filter((s) => isAssetSub(s) === assets);
    out.push({ kind: 'subtotal', key: assets ? 'totalAssets' : 'totalEl', label: 'Total', v: [all.reduce((t, s) => t + pairs[s]![0], 0), all.reduce((t, s) => t + pairs[s]![1], 0)] });
  }
  return out;
}

/** The balance sheet of two dates of a company. */
export const bsTwo = (c: Company): ALine[] => bsFrom(pairsOf(c));

export interface PlWorked {
  income: Pair;
  expenses: Pair;
  pbt: Pair;
  tax: Pair;
  pat: Pair;
}
export function workPl(d: PlData): PlWorked {
  const pair = (f: (k: 0 | 1) => number): Pair => [f(0), f(1)];
  const income = pair((k) => d.rev[k] + d.oi[k]);
  const expenses = pair((k) => d.exp.reduce((t, e) => t + e.v[k], 0));
  const pbt = pair((k) => income[k] - expenses[k]);
  const tax = pair((k) => Math.max(0, Math.round((pbt[k] * d.rate) / 100)));
  return { income, expenses, pbt, tax, pat: pair((k) => pbt[k] - tax[k]) };
}

/** The Statement of Profit and Loss of two years as the topic's comparative and common size statements lay it out. */
export function plTwo(d: PlData): ALine[] {
  const w = workPl(d);
  return [
    { kind: 'row', key: 'rev', label: 'Revenue from operations', v: d.rev },
    { kind: 'row', key: 'oi', label: 'Other income', v: d.oi },
    { kind: 'subtotal', key: 'income', label: 'Total income', v: w.income },
    { kind: 'heading', text: 'Expenses' },
    ...d.exp.map((e, k): ALine => ({ kind: 'row', key: `exp${k}`, label: e.name, v: e.v })),
    { kind: 'subtotal', key: 'expenses', label: 'Total expenses', v: w.expenses },
    { kind: 'subtotal', key: 'pbt', label: 'Profit before tax', v: w.pbt },
    { kind: 'row', key: 'tax', label: `Tax (${d.rate}% of profit before tax)`, v: w.tax },
    { kind: 'subtotal', key: 'pat', label: 'Profit after tax', v: w.pat },
  ];
}

export type Figured = Extract<ALine, { kind: 'row' | 'subtotal' }>;
export const figured = (lines: readonly ALine[]): Figured[] => lines.filter((l): l is Figured => l.kind !== 'heading');

export interface Change {
  change: Paise;
  /** Hundredths of a percent, or null when the earlier figure is nil (no base to divide by). */
  pct: number | null;
}
export const changeOf = (v: Pair): Change => ({ change: v[1] - v[0], pct: v[0] > 0 ? pctH(v[1] - v[0], v[0]) : null });

/** The base of each period of a common size statement: the total of the balance sheet, or revenue from operations. */
export function basesOf(lines: readonly ALine[], statement: 'bs' | 'pl'): Pair {
  const f = figured(lines);
  return statement === 'bs' ? f.find((l) => l.key === 'totalAssets')!.v : f.find((l) => l.key === 'rev')!.v;
}
export const shareOf = (v: Pair, base: Pair): [number | null, number | null] => [pctH(v[0], base[0]), pctH(v[1], base[1])];

/** What a statement of two periods is called. */
export function titleOf(c: Company, statement: 'bs' | 'pl', tool: 'comparative' | 'common'): string {
  const what = statement === 'bs' ? `Balance Sheet of ${c.name} as at ${c.dates[0]} and ${c.dates[1]}` : `Statement of Profit and Loss of ${c.name} for the years ${c.pl.years[0]} and ${c.pl.years[1]}`;
  return `${tool === 'comparative' ? 'Comparative' : 'Common Size'} ${what}`;
}
/** The names of the two periods: "31 March 2025" or "2024-25". */
export const periodsOf = (c: Company, statement: 'bs' | 'pl'): [string, string] => (statement === 'bs' ? c.dates : c.pl.years);

/** What is wrong with the figures of two periods, or null: the two halves of the balance sheet agree on both dates, cash is not below nil, and both years have a profit before tax. */
export function problemOfFigures(pairs: Partial<Record<Sub, Pair>>, pl: PlData): string | null {
  const lines = figured(bsFrom(pairs));
  const el = lines.find((l) => l.key === 'totalEl')!.v;
  const as = lines.find((l) => l.key === 'totalAssets')!.v;
  if (lines.some((l) => l.key === 'cash' && (l.v[0] < 0 || l.v[1] < 0))) return 'Cash and cash equivalents would fall below nil: the other assets come to more than the equity and liabilities.';
  if (el[0] !== as[0] || el[1] !== as[1]) return `The two totals do not agree (${inr(el[0])} and ${inr(as[0])}; ${inr(el[1])} and ${inr(as[1])}).`;
  if (pl.rev[0] <= 0 || pl.rev[1] <= 0) return 'Revenue from operations is the base of the common size statement: it must be above nil.';
  const w = workPl(pl);
  if (w.pbt[0] <= 0 || w.pbt[1] <= 0) return 'Keep a profit before tax in both years: a loss turns the percentages of the profit lines round.';
  return null;
}
export const problemOf = (c: Company): string | null => problemOfFigures(pairsOf(c), c.pl);

/** The figures with cash and cash equivalents as the balancing figure of each date, so that the two halves agree. */
export function balancedByCash(pairs: Partial<Record<Sub, Pair>>): Partial<Record<Sub, Pair>> {
  const out: Partial<Record<Sub, Pair>> = { ...pairs };
  delete out.cash;
  const sumOf = (assets: boolean, k: 0 | 1) => SUB_ORDER.filter((s) => out[s] && isAssetSub(s) === assets).reduce((t, s) => t + out[s]![k], 0);
  out.cash = [sumOf(false, 0) - sumOf(true, 0), sumOf(false, 1) - sumOf(true, 1)];
  return out;
}
