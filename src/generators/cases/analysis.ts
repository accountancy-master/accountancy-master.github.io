/**
 * Case studies of the last stage of Class 12: the statements of one company read with ratios, comparative and common
 * size statements and the cash flow statement.
 *
 * The figures are drawn in whole rupees and turned into paise only where a question is returned. Every part is
 * checked another way, from the printed case: a ratio by multiplying back, a classification or an effect by the
 * arithmetic of its terms, a format by the `verify` of the examined format it reuses.
 *
 * Conventions, each stated in the case text or the question that relies on it, as the topic banks state them:
 * Schedule III as amended in 2021; the quick assets are the current assets less inventories and prepaid expenses;
 * debt is long-term borrowings and long-term provisions; the proprietary ratio is on total assets; inventory turnover
 * is on the cost of revenue from operations and the average inventory; the net profit ratio says before or after tax;
 * operating ratio + operating profit ratio = 100; a "times" answer or a percentage is given to two decimal places, and
 * a seed in which a slip comes within 0.02 of the right figure is drawn again; a percentage change is worked on the
 * earlier figure; a common size statement says that revenue from operations is 100; the cash flow statement is by the
 * indirect method, of a company that is not a financing company.
 */
import type { AccountQuestion, McqQuestion, NumericQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { caseTemplate, formatINR, rupees } from '../authoring';
import { DEALS, SPECS, effectOptions, movedBy, split, type Deal, type DealKey, type Eff, type Spec } from '../templates/accounting-ratios';
import { HEAD_SLIP, HEAD_TEXT, TRADE_OF, WORKING_ALSO, WORKING_LABELS, cashFlowStatement, cashFlowStatementHolds, machineryAccountSides, type CashFlowCase, type Head } from '../templates/cash-flow-statement';
import { splFromData, splStatement, splStatementHolds, type SplCase } from '../templates/company-financial-statements';
import { attempt, comparativeBalanceSheet, comparativeBalanceSheetHolds, drawOneExtra, drawPlData, drawTrade, drawYears, pct2, workPl, type ComparativeBsCase, type Pair, type Period, type PlData, type PlWorked } from '../templates/financial-statement-analysis';
import type { CaseAccountParts, CaseStatementParts, CaseTemplate, McqParts, NumericParts } from '../types';

const TOPIC = 'cash-flow-statement';
const CONCEPT = 'cf-case';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (rs: number): string => formatINR(rupees(rs));
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
/** A figure in hundredths as it is written: 250 is "2.5", 133 is "1.33". */
const dec = (h: number): string => String(h / 100);
/** Hundredths of a percent as text: 1250 is "12.5%". */
const pc = (h: number): string => `${dec(h)}%`;
/** Every rupee amount of a text, in the order it is printed, in whole rupees. */
const amountsIn = (s: string): number[] => (s.match(/₹\d+(?:,\d+)*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
/** The "Label: ₹amount" lines of a text, by label, in whole rupees. */
function listedIn(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of text.matchAll(/^(.+?): ₹([\d,]+)$/gm)) out.set(m[1], Number(m[2].replace(/,/g, '')));
  return out;
}
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';

const Y0 = '31 March 2025';
const Y1 = '31 March 2026';
const YEAR = '2025-26';
const AS_RATIO = 'as x : 1, to two decimal places (for 2.5 : 1 type 2.5)';
const IN_TIMES = 'in times, to two decimal places';
const AS_PERCENT = 'as a percentage, to two decimal places';

/** A quotient as two whole numbers, so that it can be rounded without error. */
type Frac = readonly [num: number, den: number];
const TIMES = 100;
const PERCENT = 10000;
/** num ÷ den x factor to the nearest whole number (hundredths of a ratio or of a percent); null at an exact half. */
function rounded([num, den]: Frac, factor: number): number | null {
  if (!(num > 0 && den > 0) || !Number.isInteger(num) || !Number.isInteger(den) || !Number.isSafeInteger(num * factor)) return null;
  const x = num * factor;
  const q = Math.floor(x / den);
  const r = x - q * den;
  if (2 * r === den) return null;
  return 2 * r > den ? q + 1 : q;
}
/** True when `answer` is the nearest whole number to num ÷ den x factor: checked by multiplying back. */
const nearest = (answer: number, [num, den]: Frac, factor: number): boolean => den > 0 && 2 * Math.abs(num * factor - answer * den) < den;

/**
 * The answer and the wrong answers of a ratio or a percentage given to two decimal places. Null when the answer
 * falls on an exact half, when a slip comes within 0.02 of it (a student who rounds loosely would be right by the
 * wrong method), or when fewer than two distinct slips remain.
 */
function figure(factor: number, right: Frac, slips: (readonly [Frac, string] | false)[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  const answer = rounded(right, factor);
  if (answer === null || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const slip of slips) {
    if (!slip) continue;
    const v = rounded(slip[0], factor);
    if (v === null || v <= 0) continue;
    if (v !== answer && Math.abs(v - answer) <= 2) return null;
    if (!seen.has(v)) {
      seen.add(v);
      commonErrors.push({ value: v, why: slip[1] });
    }
  }
  return commonErrors.length >= 2 ? { answer, commonErrors } : null;
}
/** An answer in whole rupees, with wrong answers in whole rupees (one that is not whole and positive is dropped). */
function money(answer: number, slips: (readonly [number, string] | false)[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const slip of slips) {
    if (!slip) continue;
    const [v, why] = slip;
    if (Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      commonErrors.push({ value: rupees(v), why });
    }
  }
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
}
/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) {
    if (!seen.has(text)) {
      seen.add(text);
      distractors.push({ text, why });
    }
  }
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}
/** The first draw of several whose every part can be made: a case of many figures seldom comes right at the first. */
function firstGood<S>(times: number, draw: () => S | null, ok: (s: S) => boolean): S | null {
  for (let i = 0; i < times; i++) {
    const s = draw();
    if (s !== null && ok(s)) return s;
  }
  return null;
}
/**
 * What a part keeps for its `verify`, by the text of its question. The engine makes every part of a case before it
 * verifies any, so one remembered value (as `keepFor` keeps) would not do.
 */
function keeper<T>(): { keep(key: string, value: T): void; of(key: string): T | undefined } {
  const kept = new Map<string, T>();
  return {
    keep: (key, value) => {
      if (kept.size > 4000) kept.clear();
      kept.set(key, value);
    },
    of: (key) => kept.get(key),
  };
}

/** Companies that are not financing companies, each with the trade its name suggests (the cash flow bank's list). */
const MAKERS = Object.entries(TRADE_OF);
const maker = (rng: Rng): { co: string; trade: string } => {
  const [co, trade] = rng.pick(MAKERS);
  return { co, trade };
};

const H = {
  liquidity: ['List the current assets and the current liabilities first.', 'Quick assets = current assets - inventories - prepaid expenses.'],
  solvency: ["Debt is long-term borrowings plus long-term provisions; equity is shareholders' funds (share capital plus reserves and surplus).", "The proprietary ratio here is shareholders' funds ÷ total assets."],
  activity: ['Average inventory = (opening inventory + closing inventory) ÷ 2.', 'Inventory turnover = cost of revenue from operations ÷ average inventory.'],
  profit: ['Every profitability ratio on revenue has revenue from operations as its denominator.', 'Operating ratio + operating profit ratio = 100%.'],
  effect: ['Ask which term of the ratio the transaction changes: the numerator, the denominator, both or neither.', 'When both terms change by the same amount, a ratio above 1 : 1 moves one way and a ratio below 1 : 1 the other.'],
  change: ['Absolute change = figure of the later year less figure of the earlier year.', 'Percentage change = absolute change ÷ figure of the EARLIER year × 100.'],
  share: ['In a common size Statement of Profit and Loss, revenue from operations is 100.', 'Total income = 100 + other income; profit before tax = total income - total expenses.'],
  heads: ['Operating: the main revenue-earning work. Investing: long-term assets and investments. Financing: share capital and borrowings.', 'Ask first whether cash and cash equivalents change at all.'],
};

// ===============================================================================================================
// 1. case-an-ratios-one-sheet: one balance sheet and a few lines of the Statement of Profit and Loss, and a ratio of
//    each group from them: a liquidity ratio (current or quick), a solvency ratio (debt to equity, or proprietary on
//    total assets), the inventory turnover, the net profit ratio before or after tax; then the liquidity read
//    against the usual norms. The balance sheet has long-term provisions, short-term borrowings, short-term
//    provisions, non-current investments and prepaid expenses in some seeds and not in others.
// ===============================================================================================================

const BS = {
  sc: 'Share capital',
  rs: 'Reserves and surplus',
  ltb: 'Long-term borrowings',
  ltp: 'Long-term provisions',
  stb: 'Short-term borrowings',
  tp: 'Trade payables',
  stp: 'Short-term provisions',
  ppe: 'Property, plant and equipment',
  nci: 'Non-current investments',
  inv: 'Inventories',
  tr: 'Trade receivables',
  cash: 'Cash and cash equivalents',
  prepaid: 'Other current assets (prepaid expenses)',
  openInv: `Inventories on ${Y0}`,
  revenue: 'Revenue from operations',
  cost: 'Cost of revenue from operations',
  pbt: 'Net profit before tax',
  tax: 'Tax',
} as const;

interface OneSheet {
  co: string;
  trade: string;
  sc: number;
  rs: number;
  ltb: number;
  ltp: number;
  stb: number;
  tp: number;
  stp: number;
  ppe: number;
  nci: number;
  inv: number;
  tr: number;
  cash: number;
  prepaid: number;
  openInv: number;
  revenue: number;
  cost: number;
  pbt: number;
  tax: number;
  liquid: 'current' | 'quick';
  solvent: 'debtEquity' | 'proprietary';
  afterTax: boolean;
}
/** The totals the ratios are built from. */
const totalsOf = (s: Pick<OneSheet, 'sc' | 'rs' | 'ltb' | 'ltp' | 'stb' | 'tp' | 'stp' | 'ppe' | 'nci' | 'inv' | 'tr' | 'cash' | 'prepaid'>) => {
  const ca = s.inv + s.tr + s.cash + s.prepaid;
  const cl = s.stb + s.tp + s.stp;
  const sf = s.sc + s.rs;
  const debt = s.ltb + s.ltp;
  return { ca, quick: s.tr + s.cash, cl, sf, debt, ta: s.ppe + s.nci + ca, nca: s.ppe + s.nci };
};
/** The same totals read back from the printed case. */
function sheetIn(text: string) {
  const f = listedIn(text);
  const g = (label: string): number => f.get(label) ?? 0;
  return totalsOf({ sc: g(BS.sc), rs: g(BS.rs), ltb: g(BS.ltb), ltp: g(BS.ltp), stb: g(BS.stb), tp: g(BS.tp), stp: g(BS.stp), ppe: g(BS.ppe), nci: g(BS.nci), inv: g(BS.inv), tr: g(BS.tr), cash: g(BS.cash), prepaid: g(BS.prepaid) });
}

function drawOneSheet(rng: Rng): OneSheet | null {
  const { co, trade } = maker(rng);
  const cl = rng.step(200000, 600000, 20000);
  const r = rng.pick([150, 160, 175, 180, 200, 220, 225, 240, 250, 275, 300]);
  // Gaps wide enough that a current ratio of 2 : 1 or more can stand beside a quick ratio below 1 : 1.
  const q = r - rng.pick([40, 50, 60, 75, 80, 100, 120, 125, 150].filter((gap) => r - gap >= 50));
  const ca = (cl * r) / 100;
  const quick = (cl * q) / 100;
  const slow = ca - quick;
  const prepaid = rng.int(0, 1) === 0 || slow < 100000 ? 0 : rng.step(5000, Math.min(30000, Math.floor(slow / 5 / 5000) * 5000), 5000);
  const inv = slow - prepaid;
  const owed = rng.pick([['tp'], ['tp', 'stb'], ['tp', 'stp'], ['tp', 'stb', 'stp']]);
  const parts = split(rng, cl, owed.length, 5000);
  const held = split(rng, quick, 2, 1000);
  if (!parts || !held) return null;
  const of = (key: string): number => (owed.includes(key) ? parts[owed.indexOf(key)] : 0);
  const sf = rng.step(1000000, 4000000, 100000);
  const sc = Math.floor((sf * rng.pick([50, 60, 70, 75])) / 100 / 100000) * 100000;
  const debt = Math.round((sf * rng.pick([20, 30, 40, 50, 60, 75, 90, 100, 120])) / 100 / 10000) * 10000;
  const ltp = rng.int(0, 1) === 0 || debt < 200000 ? 0 : rng.step(20000, Math.min(150000, Math.floor(debt / 4 / 10000) * 10000), 10000);
  const ta = sf + debt + cl;
  const nca = ta - ca;
  const nci = rng.int(0, 2) === 0 && nca >= 600000 ? rng.step(100000, Math.floor(nca / 4 / 50000) * 50000, 50000) : 0;
  const ppe = nca - nci;
  const gap = rng.step(10000, Math.max(10000, Math.floor(inv / 3 / 10000) * 10000), 10000);
  const openInv = rng.int(0, 1) === 0 ? inv + gap : inv - gap;
  // Inventory turned over four to nine times in the year, and a gross margin of a fifth to two fifths of revenue.
  const cost = Math.round((((inv + openInv) / 2) * rng.int(40, 90)) / 10 / 10000) * 10000;
  const revenue = Math.round((cost * 100) / rng.pick([60, 65, 70, 75, 80]) / 100000) * 100000;
  const pbt = Math.round((revenue * rng.pick([6, 8, 10, 12, 15])) / 100 / 10000) * 10000;
  const tax = (pbt * rng.pick([25, 30])) / 100;
  if (inv < 40000 || openInv < 30000 || ppe * 10 < ta * 3 || sf - sc <= 0 || revenue * 2 < ta || revenue > ta * 4) return null;
  // At most three of the five lines that are not always there, so that the case stays short enough to read on a phone.
  if ([ltp, of('stb'), of('stp'), nci, prepaid].filter((v) => v > 0).length > 3) return null;
  return {
    co, trade, sc, rs: sf - sc, ltb: debt - ltp, ltp, stb: of('stb'), tp: of('tp'), stp: of('stp'), ppe, nci, inv, tr: held[0], cash: held[1], prepaid, openInv, revenue, cost, pbt, tax,
    liquid: rng.pick(['current', 'quick'] as const), solvent: rng.pick(['debtEquity', 'proprietary'] as const), afterTax: rng.int(0, 1) === 0,
  };
}

function oneSheetText(s: OneSheet): string {
  const line = (label: string, v: number): string[] => (v > 0 ? [`${label}: ${inr(v)}`] : []);
  return [
    `${s.co}, ${s.trade}, gives the whole of its balance sheet as at ${Y1} and these figures for ${YEAR}:`,
    ...line(BS.sc, s.sc), ...line(BS.rs, s.rs), ...line(BS.ltb, s.ltb), ...line(BS.ltp, s.ltp), ...line(BS.stb, s.stb), ...line(BS.tp, s.tp), ...line(BS.stp, s.stp),
    ...line(BS.ppe, s.ppe), ...line(BS.nci, s.nci), ...line(BS.inv, s.inv), ...line(BS.tr, s.tr), ...line(BS.cash, s.cash), ...line(BS.prepaid, s.prepaid),
    `${BS.openInv}: ${inr(s.openInv)}`,
    `${BS.revenue}: ${inr(s.revenue)}`,
    `${BS.cost}: ${inr(s.cost)}`,
    `${BS.pbt}: ${inr(s.pbt)}`,
    `${BS.tax}: ${inr(s.tax)}`,
  ].join('\n');
}
const adds = (what: string, rows: [string, number][]): string => {
  const shown = rows.filter(([, v]) => v > 0);
  return shown.length === 1 ? `${what} = ${lower(shown[0][0])} ${inr(shown[0][1])}.` : `${what} = ${shown.map(([l, v]) => `${lower(l)} ${inr(v)}`).join(' + ')} = ${inr(sum(shown.map(([, v]) => v)))}.`;
};

function liquidityPart(s: OneSheet): NumericParts | null {
  const t = totalsOf(s);
  const liabilities: [string, number][] = [[BS.stb, s.stb], [BS.tp, s.tp], [BS.stp, s.stp]];
  if (s.liquid === 'current') {
    const n = figure(TIMES, [t.ca, t.cl], [
      [[t.cl, t.ca], 'Divided the current liabilities by the current assets: the ratio is upside down.'],
      [[t.quick, t.cl], s.prepaid > 0 ? 'Left the inventories and the prepaid expenses out of the current assets: that gives the quick ratio, not the current ratio.' : 'Left the inventories out of the current assets: that gives the quick ratio, not the current ratio.'],
      [[t.ca - t.cl, t.cl], 'Divided the working capital (current assets less current liabilities) by the current liabilities.'],
      s.stp > 0 && [[t.ca, t.cl - s.stp], 'Left the short-term provisions out of the current liabilities.'],
      [[t.ca, t.cl + s.ltb], 'Counted the long-term borrowings among the current liabilities; they are a non-current liability.'],
    ]);
    return n && {
      prompt: `Find the current ratio of ${s.co} as at ${Y1} ${AS_RATIO}.`,
      ...n,
      explanation: [
        adds('Current assets', [[BS.inv, s.inv], [BS.tr, s.tr], [BS.cash, s.cash], ['prepaid expenses', s.prepaid]]),
        adds('Current liabilities', liabilities),
        `Current ratio = current assets ÷ current liabilities = ${inr(t.ca)} ÷ ${inr(t.cl)} = ${dec(n.answer)} : 1.`,
      ],
      hints: H.liquidity,
    };
  }
  const n = figure(TIMES, [t.quick, t.cl], [
    [[t.ca, t.cl], s.prepaid > 0 ? 'Kept the inventories and the prepaid expenses in: that is the current ratio.' : 'Kept the inventories in: that is the current ratio.'],
    s.prepaid > 0 && [[t.quick + s.prepaid, t.cl], 'Took out the inventories but left the prepaid expenses in the quick assets.'],
    [[t.cl, t.quick], 'Divided the current liabilities by the quick assets: the ratio is upside down.'],
    [[t.quick, t.cl + s.ltb], 'Counted the long-term borrowings among the current liabilities; they are a non-current liability.'],
    s.stp > 0 && [[t.quick, t.cl - s.stp], 'Left the short-term provisions out of the current liabilities.'],
  ]);
  return n && {
    prompt: `Find the quick ratio of ${s.co} as at ${Y1}, its quick assets being the current assets less inventories and prepaid expenses, ${AS_RATIO}.`,
    ...n,
    explanation: [
      `Quick assets leave out inventories${s.prepaid > 0 ? ' and prepaid expenses' : ''}: ${adds('quick assets', [[BS.tr, s.tr], [BS.cash, s.cash]])}`,
      adds('Current liabilities', liabilities),
      `Quick ratio = quick assets ÷ current liabilities = ${inr(t.quick)} ÷ ${inr(t.cl)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.liquidity,
  };
}
const liquidityHolds = (q: NumericQuestion): boolean => {
  const t = sheetIn(q.context ?? '');
  return nearest(q.answer, [q.prompt.includes('quick ratio') ? t.quick : t.ca, t.cl], TIMES);
};

function solvencyPart(s: OneSheet): NumericParts | null {
  const t = totalsOf(s);
  if (s.solvent === 'debtEquity') {
    const n = figure(TIMES, [t.debt, t.sf], [
      [[t.sf, t.debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
      [[t.debt, s.sc], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
      [[t.debt, t.debt + t.sf], "Divided the debt by debt plus shareholders' funds: that is the debt to capital employed ratio."],
      s.ltp > 0 && [[s.ltb, t.sf], 'Left the long-term provisions out of the debt.'],
      s.stb > 0 && [[t.debt + s.stb, t.sf], 'Counted the short-term borrowings as debt; they are a current liability.'],
      [[t.debt + t.cl, t.sf], 'Counted every outside liability as debt, the current liabilities too.'],
    ]);
    return n && {
      prompt: `Find the debt to equity ratio of ${s.co} as at ${Y1}, debt being its long-term borrowings and long-term provisions and equity its shareholders' funds, ${AS_RATIO}.`,
      ...n,
      explanation: [
        adds('Debt', [[BS.ltb, s.ltb], [BS.ltp, s.ltp]]),
        adds("Shareholders' funds", [[BS.sc, s.sc], [BS.rs, s.rs]]),
        `Debt to equity ratio = ${inr(t.debt)} ÷ ${inr(t.sf)} = ${dec(n.answer)} : 1.`,
      ],
      hints: H.solvency,
    };
  }
  const n = figure(TIMES, [t.sf, t.ta], [
    [[t.ta, t.sf], "Divided the total assets by the shareholders' funds: the ratio is upside down."],
    [[s.sc, t.ta], "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
    [[t.sf + s.ltb, t.ta], "Counted the long-term borrowings in the shareholders' funds."],
    [[t.sf, t.ta - t.sf], "Divided the shareholders' funds by the outside liabilities; total assets are shareholders' funds plus every liability."],
    [[t.sf, t.nca], 'Divided by the non-current assets only; total assets include the current assets.'],
  ]);
  return n && {
    prompt: `Find the proprietary ratio of ${s.co} as at ${Y1}, worked on total assets (shareholders' funds ÷ total assets), ${AS_RATIO}.`,
    ...n,
    explanation: [
      adds("Shareholders' funds", [[BS.sc, s.sc], [BS.rs, s.rs]]),
      adds('Total assets', [[BS.ppe, s.ppe], [BS.nci, s.nci], ['current assets', t.ca]]),
      `Proprietary ratio = shareholders' funds ÷ total assets = ${inr(t.sf)} ÷ ${inr(t.ta)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.solvency,
  };
}
const solvencyHolds = (q: NumericQuestion): boolean => {
  const text = q.context ?? '';
  const t = sheetIn(text);
  // The total assets once more, from the other side: shareholders' funds and every liability.
  const sources = t.sf + t.debt + t.cl;
  return t.ta === sources && nearest(q.answer, q.prompt.includes('debt to equity') ? [t.debt, t.sf] : [t.sf, sources], TIMES);
};

function inventoryPart(s: OneSheet): NumericParts | null {
  const both = s.openInv + s.inv;
  const n = figure(TIMES, [2 * s.cost, both], [
    [[s.cost, s.inv], 'Divided by the closing inventory instead of the average inventory.'],
    [[s.cost, s.openInv], 'Divided by the opening inventory instead of the average inventory.'],
    [[s.cost, both], 'Added the opening and closing inventories but did not halve the total to get the average.'],
    [[2 * s.revenue, both], 'Used the revenue from operations; inventory is carried at cost, so the numerator is the cost of revenue from operations.'],
  ]);
  return n && {
    prompt: `Find the inventory turnover ratio of ${s.co} for ${YEAR}, on the cost of revenue from operations and the average of the opening and closing inventories, ${IN_TIMES}.`,
    ...n,
    explanation: [
      `Average inventory = (${inr(s.openInv)} + ${inr(s.inv)}) ÷ 2 = ${inr(both / 2)}; the closing inventory is the inventories of the balance sheet.`,
      `Inventory turnover ratio = cost of revenue from operations ÷ average inventory = ${inr(s.cost)} ÷ ${inr(both / 2)} = ${dec(n.answer)} times.`,
    ],
    hints: H.activity,
  };
}
const inventoryHolds = (q: NumericQuestion): boolean => {
  const f = listedIn(q.context ?? '');
  return nearest(q.answer, [2 * (f.get(BS.cost) ?? 0), (f.get(BS.openInv) ?? 0) + (f.get(BS.inv) ?? 0)], TIMES);
};

function netProfitPart(s: OneSheet): NumericParts | null {
  const pat = s.pbt - s.tax;
  const np = s.afterTax ? pat : s.pbt;
  const n = figure(PERCENT, [np, s.revenue], [
    s.afterTax ? [[s.pbt, s.revenue], 'Used the profit before tax, although the ratio is asked on the profit after tax.'] : [[pat, s.revenue], 'Deducted the tax, although the ratio is asked on the profit before tax.'],
    [[np, s.cost], 'Divided the net profit by the cost of revenue from operations instead of by the revenue from operations.'],
    [[s.tax, s.revenue], 'Gave the tax as a percentage of revenue.'],
    [[np, s.revenue - s.cost], 'Divided the net profit by the gross profit instead of by the revenue from operations.'],
  ]);
  return n && {
    prompt: `Find the net profit ratio of ${s.co} for ${YEAR} on its net profit ${s.afterTax ? 'after' : 'before'} tax, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      ...(s.afterTax ? [`Net profit after tax = ${inr(s.pbt)} - ${inr(s.tax)} = ${inr(pat)}.`] : []),
      `Net profit ratio = net profit ${s.afterTax ? 'after' : 'before'} tax ÷ revenue from operations × 100 = ${inr(np)} ÷ ${inr(s.revenue)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: H.profit,
  };
}
const netProfitHolds = (q: NumericQuestion): boolean => {
  const f = listedIn(q.context ?? '');
  const np = (f.get(BS.pbt) ?? 0) - (q.prompt.includes('after tax') ? (f.get(BS.tax) ?? 0) : 0);
  return nearest(q.answer, [np, f.get(BS.revenue) ?? 0], PERCENT);
};

/**
 * The four readings of a current ratio and a quick ratio against 2 : 1 and 1 : 1. These are levels commonly regarded as
 * satisfactory, not rules, and the question says so; which reading is right then follows from the figures alone.
 */
const READINGS: Record<string, string> = {
  'true,true': 'Both ratios are at or above these levels: its short-term debts appear well covered',
  'true,false': 'The current ratio is at or above 2 : 1 but the quick ratio is below 1 : 1: a large part of its current assets is in inventories',
  'false,true': 'The quick ratio is at or above 1 : 1 but the current ratio is below 2 : 1',
  'false,false': 'Both ratios are below these levels: it may find it hard to pay its short-term debts on time',
};
const LIQUID_NORMS = 'A current ratio of 2 : 1 and a quick ratio of 1 : 1 are commonly regarded as satisfactory. Measured against these levels, which reading of the liquidity of the company is right?';

function liquidityReading(s: OneSheet): McqParts | null {
  const t = totalsOf(s);
  // Both are exact by construction: the current liabilities are a multiple of 20,000 and the ratios multiples of 0.05.
  const r = (t.ca * 100) / t.cl;
  const q = (t.quick * 100) / t.cl;
  if (!Number.isInteger(r) || !Number.isInteger(q)) return null;
  const meets = [r >= 200, q >= 100];
  const key = (a: boolean, b: boolean): string => `${a},${b}`;
  const said = `The current ratio is ${dec(r)} : 1 and the quick ratio ${dec(q)} : 1`;
  const wrong: [string, string][] = [];
  for (const a of [true, false]) {
    for (const b of [true, false]) {
      if (a === meets[0] && b === meets[1]) continue;
      const why =
        a !== meets[0] && b !== meets[1]
          ? `Misjudged both ratios. ${said}.`
          : a !== meets[0]
            ? `Misjudged the current ratio: it is ${dec(r)} : 1, ${meets[0] ? 'at or above' : 'below'} 2 : 1.`
            : `Misjudged the quick ratio: it is ${dec(q)} : 1, ${meets[1] ? 'at or above' : 'below'} 1 : 1${s.prepaid > 0 ? ', with the inventories and the prepaid expenses left out' : ', with the inventories left out'}.`;
      wrong.push([READINGS[key(a, b)], why]);
    }
  }
  wrong.push(['It may not be able to repay its long-term borrowings', 'Read a liquidity ratio as a test of solvency; the current and quick ratios are about the short-term debts.']);
  return choice(
    LIQUID_NORMS,
    READINGS[key(meets[0], meets[1])],
    wrong,
    `Current ratio = ${inr(t.ca)} ÷ ${inr(t.cl)} = ${dec(r)} : 1, ${meets[0] ? 'at or above' : 'below'} 2 : 1. Quick ratio = ${inr(t.quick)} ÷ ${inr(t.cl)} = ${dec(q)} : 1, ${meets[1] ? 'at or above' : 'below'} 1 : 1.${meets[0] && !meets[1] ? ' A wide gap between the two ratios means that a large part of the current assets is in inventories, which take time to turn into cash.' : ''}`,
    H.liquidity,
  );
}
const liquidityReadingHolds = (q: McqQuestion): boolean => {
  const t = sheetIn(q.context ?? '');
  return optionText(q) === READINGS[`${t.ca >= 2 * t.cl},${t.quick >= t.cl}`];
};

const oneSheetMakers = [liquidityPart, solvencyPart, inventoryPart, netProfitPart, liquidityReading];

const ratiosOneSheet = caseTemplate<OneSheet>({
  id: 'case-an-ratios-one-sheet',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Ratios from one balance sheet',
  setup: (rng) => firstGood(20, () => drawOneSheet(rng), (s) => oneSheetMakers.every((m) => m(s) !== null)),
  context: oneSheetText,
  parts: [
    { kind: 'numeric', unit: 'times', make: liquidityPart, verify: liquidityHolds },
    { kind: 'numeric', unit: 'times', make: solvencyPart, verify: solvencyHolds },
    { kind: 'numeric', unit: 'times', make: inventoryPart, verify: inventoryHolds },
    { kind: 'numeric', unit: 'percent', make: netProfitPart, verify: netProfitHolds },
    { kind: 'mcq', make: liquidityReading, verify: liquidityReadingHolds },
  ],
});

// ===============================================================================================================
// 2. case-an-effect-liquidity: a current ratio and a quick ratio, with the figures behind them, and three
//    transactions; the effect of each, taken on its own, on one of the two ratios (the examined bank of transactions
//    of the ratios topic, with its readings and their slips); then one ratio after all three.
// ===============================================================================================================

/** Transactions that move the current items, or that a student wrongly thinks do. */
const EFFECT_KEYS: DealKey[] = [
  'creditPurchase', 'cashPurchase', 'payCreditors', 'collectDebtors', 'sellMachinery', 'buyMachinery', 'issueShares', 'issueDebentures', 'shortLoan',
  'sellGoodsProfit', 'sellGoodsLoss', 'prepay', 'badDebt', 'fireLoss', 'buyCurrentInvestments', 'payOutstanding', 'repayLoan', 'endorseBill', 'loanToPayCreditors',
];
const MARKS = ['(a)', '(b)', '(c)'];
interface Move {
  deal: Deal;
  text: string;
  eff: Eff;
  /** The ratio the question on it asks about. */
  on: 'current' | 'quick';
}
interface Liquid {
  co: string;
  trade: string;
  ca: number;
  inv: number;
  cl: number;
  moves: Move[];
  /** The ratio asked for after all three transactions. */
  after: 'current' | 'quick';
}
const specOf = (on: 'current' | 'quick'): Spec => (on === 'current' ? SPECS.current : SPECS.quick);
const ratioName = (on: 'current' | 'quick'): string => (on === 'current' ? 'current ratio' : 'quick ratio');
/** The ratio a question starts from, in hundredths. */
const startOf = (s: Liquid, on: 'current' | 'quick'): number => (((on === 'current' ? s.ca : s.ca - s.inv) * 100) / s.cl);

function drawLiquid(rng: Rng): Liquid | null {
  const { co, trade } = maker(rng);
  const cl = rng.step(200000, 500000, 20000);
  const r = rng.pick([150, 175, 200, 225, 250, 300]);
  const q = rng.pick([75, 80, 90, 100, 110, 120, 125, 150].filter((x) => x <= r - 50));
  const ca = (cl * r) / 100;
  const inv = ca - (cl * q) / 100;
  const keys = rng.shuffle(EFFECT_KEYS).slice(0, 3);
  const ons: ('current' | 'quick')[] = rng.pick([['current', 'quick', 'current'], ['current', 'quick', 'quick'], ['quick', 'current', 'quick'], ['quick', 'current', 'current']]);
  const moves = keys.map((key, i): Move => {
    const deal = DEALS[key](rng.step(20000, 90000, 5000), rng.step(5000, 15000, 5000));
    return { deal, text: deal.text, eff: deal.eff, on: ons[i] };
  });
  // The story must be one that can happen: what is paid out of quick assets, what leaves the inventories and what is
  // paid off the current liabilities stay well inside what the company has.
  const out = (pick: (e: Eff) => number): number => sum(moves.map((m) => Math.min(0, pick(m.eff))));
  if (-out((e) => e.quick) * 2 > ca - inv || -out((e) => e.ca - e.quick) * 2 > inv || -out((e) => e.cl) * 2 > cl) return null;
  return { co, trade, ca, inv, cl, moves, after: rng.pick(['current', 'quick'] as const) };
}
const liquidText = (s: Liquid): string =>
  [
    `${s.co}, ${s.trade}, has current assets of ${inr(s.ca)}, of which inventories are ${inr(s.inv)}, and current liabilities of ${inr(s.cl)}: a current ratio of ${dec(startOf(s, 'current'))} : 1 and a quick ratio of ${dec(startOf(s, 'quick'))} : 1. Its quick assets are its current assets less inventories and prepaid expenses, and it has no prepaid expenses as yet. It then made these transactions:`,
    ...s.moves.map((m, i) => `${MARKS[i]} The company ${m.text}.`),
  ].join('\n');

const effectKept = keeper<{ spec: Spec; eff: Eff; start: number }>();
const effectPart =
  (i: number) =>
  (s: Liquid): McqParts | null => {
    const m = s.moves[i];
    const spec = specOf(m.on);
    const start = startOf(s, m.on);
    if (!Number.isInteger(start)) return null;
    const o = effectOptions(spec, m.deal, start);
    if (!o) return null;
    const prompt = `Taken on its own, will transaction ${MARKS[i]} make the ${spec.name} of ${dec(start)} : 1 ${spec.ask}, and why?`;
    effectKept.keep(`${liquidText(s)}\n${prompt}`, { spec, eff: m.eff, start });
    return choice(prompt, o.correct, o.wrong, o.why, H.effect);
  };
const effectHolds = (q: McqQuestion): boolean => {
  const kept = effectKept.of(`${q.context ?? ''}\n${q.prompt}`);
  if (!kept) return false;
  const verdict = movedBy(kept.spec, kept.eff, kept.start);
  return optionText(q).startsWith(`${kept.spec.labels[verdict > 0 ? 0 : verdict < 0 ? 1 : 2]}:`);
};

const afterKept = keeper<Eff[]>();
function afterPart(s: Liquid): NumericParts | null {
  const total = (pick: (e: Eff) => number): number => sum(s.moves.map((m) => pick(m.eff)));
  const quick0 = s.ca - s.inv;
  const [ca1, quick1, cl1] = [s.ca + total((e) => e.ca), quick0 + total((e) => e.quick), s.cl + total((e) => e.cl)];
  const current = s.after === 'current';
  const top = (ca: number, quick: number): number => (current ? ca : quick);
  const n = figure(TIMES, [top(ca1, quick1), cl1], [
    [[top(s.ca, quick0), s.cl], 'Gave the ratio as it stood before the three transactions.'],
    ...s.moves.map((m, i) =>
      (m.eff.cl !== 0 || top(m.eff.ca, m.eff.quick) !== 0) && ([[top(ca1 - m.eff.ca, quick1 - m.eff.quick), cl1 - m.eff.cl], `Left out what transaction ${MARKS[i]} does to the ratio.`] as const),
    ),
    current ? [[quick1, cl1], 'Left the inventories and prepaid expenses out: that is the quick ratio.'] : [[ca1, cl1], 'Kept the inventories and prepaid expenses in the quick assets: that is the current ratio.'],
    [[cl1, top(ca1, quick1)], 'Divided the current liabilities by the assets: the ratio is upside down.'],
  ]);
  const prompt = `Find the ${ratioName(s.after)} of ${s.co} after all three transactions ${AS_RATIO}.`;
  afterKept.keep(`${liquidText(s)}\n${prompt}`, s.moves.map((m) => m.eff));
  const change = (v: number): string => (v === 0 ? 'no change' : `${v > 0 ? '+' : '-'} ${inr(Math.abs(v))}`);
  return n && {
    prompt,
    ...n,
    explanation: [
      ...s.moves.map((m, i) => `${MARKS[i]} ${current ? 'Current assets' : 'Quick assets'} ${change(top(m.eff.ca, m.eff.quick))}; current liabilities ${change(m.eff.cl)}.`),
      `${current ? 'Current assets' : 'Quick assets'} = ${inr(top(s.ca, quick0))} → ${inr(top(ca1, quick1))}; current liabilities = ${inr(s.cl)} → ${inr(cl1)}.`,
      `${cap(ratioName(s.after))} = ${inr(top(ca1, quick1))} ÷ ${inr(cl1)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.effect,
  };
}
const afterHolds = (q: NumericQuestion): boolean => {
  const effs = afterKept.of(`${q.context ?? ''}\n${q.prompt}`);
  if (!effs) return false;
  // The figures before the transactions from the printed case, then each transaction's effect added on.
  const [ca, inv, cl] = amountsIn((q.context ?? '').split('\n')[0]);
  const current = q.prompt.includes('current ratio');
  return nearest(q.answer, [(current ? ca : ca - inv) + sum(effs.map((e) => (current ? e.ca : e.quick))), cl + sum(effs.map((e) => e.cl))], TIMES);
};

const liquidMakers = [effectPart(0), effectPart(1), effectPart(2), afterPart];

const effectLiquidity = caseTemplate<Liquid>({
  id: 'case-an-effect-liquidity',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Transactions and the liquidity ratios',
  setup: (rng) => firstGood(20, () => drawLiquid(rng), (s) => liquidMakers.every((m) => m(s) !== null)),
  context: liquidText,
  parts: [
    { kind: 'mcq', make: effectPart(0), verify: effectHolds },
    { kind: 'mcq', make: effectPart(1), verify: effectHolds },
    { kind: 'mcq', make: effectPart(2), verify: effectHolds },
    { kind: 'numeric', unit: 'times', make: afterPart, verify: afterHolds },
  ],
});

// ===============================================================================================================
// 3. case-an-comparative-pl: two years of a Statement of Profit and Loss (the examined two-year statement of the
//    analysis topic: a maker or a dealer, one or no extra line, revenue that grows or shrinks), read for changes:
//    the percentage changes of revenue, total expenses and profit before tax on the earlier year, then what they
//    mean together.
// ===============================================================================================================

interface TwoYearsPl {
  company: string;
  per: Period;
  d: PlData;
  w: PlWorked;
}
/** The lines of a statement of two years as the data prints them: "Name: ₹a (2024-25), ₹b (2025-26)". */
const twoYears = (name: string, v: Pair, per: Period): string => `${name}: ${inr(v[0])} (${per.a}), ${inr(v[1])} (${per.b})`;
/** The lines printed that way, by name, in whole rupees. */
function pairsIn(text: string): Map<string, Pair> {
  const out = new Map<string, Pair>();
  for (const m of text.matchAll(/^(.+?): ₹([\d,]+) \([^)]+\), ₹([\d,]+) \([^)]+\)$/gm)) out.set(m[1], [Number(m[2].replace(/,/g, '')), Number(m[3].replace(/,/g, ''))]);
  return out;
}
const INCOMES = ['Revenue from operations', 'Other income'];

function drawTwoYearsPl(rng: Rng): TwoYearsPl | null {
  const t = rng.pick([20, 25, 30]);
  const trade = drawTrade(rng);
  const company = rng.pick(trade.companies);
  const { per } = drawYears(rng);
  const extras = drawOneExtra(rng);
  const d = attempt(40, () => drawPlData(rng, trade, extras, [t, t]));
  const w = d && workPl(d);
  return d && w ? { company, per, d, w } : null;
}
const twoYearsText = (s: TwoYearsPl): string =>
  [
    `${s.company} gives these figures from its Statements of Profit and Loss for ${s.per.a} and ${s.per.b}. These lines and tax are the whole of each statement.`,
    twoYears('Revenue from operations', s.d.rev, s.per),
    twoYears('Other income', s.d.oi, s.per),
    ...s.d.names.map((name, i) => twoYears(name, s.d.exp[i], s.per)),
    `Tax: ${s.d.rate[0]}% of profit before tax in both years`,
  ].join('\n');
/** The totals of a statement of two years, read back from the printed case. */
function twoYearsIn(text: string): { rev: Pair; income: Pair; expenses: Pair; pbt: Pair } {
  const lines = [...pairsIn(text)];
  const add = (pick: (name: string) => boolean): Pair => [0, 1].map((k) => sum(lines.filter(([name]) => pick(name)).map(([, v]) => v[k]))) as Pair;
  const income = add((name) => INCOMES.includes(name));
  const expenses = add((name) => !INCOMES.includes(name));
  return { rev: pairsIn(text).get('Revenue from operations') ?? [NaN, NaN], income, expenses, pbt: [income[0] - expenses[0], income[1] - expenses[1]] };
}
/** The signed percentage change of a pair on its earlier figure, in hundredths (null at an exact half). */
const changeOf = (v: Pair): number | null => pct2(v[1] - v[0], v[0]);
const signedPc = (h: number): string => (h < 0 ? `-${pc(-h)}` : pc(h));

/** A percentage change asked as its size, the direction said in the question. */
function changePart(s: TwoYearsPl, name: string, v: Pair, slips: (readonly [Frac, string] | false)[], working: string[]): NumericParts | null {
  const change = Math.abs(v[1] - v[0]);
  const up = v[1] > v[0];
  const n = figure(PERCENT, [change, v[0]], [
    [[change, v[1]], `Divided the change by the figure of ${s.per.b}. The base is the earlier year, ${s.per.a}.`],
    [[v[1], v[0]], `Gave the figure of ${s.per.b} as a percentage of the figure of ${s.per.a}; the change has to be taken first.`],
    ...slips,
  ]);
  return n && {
    prompt: `By what percentage did ${lower(name)} ${up ? 'rise' : 'fall'} in ${s.per.b}? Work the change on the figure of ${s.per.a} and give the percentage to two decimal places.`,
    ...n,
    explanation: [
      ...working,
      `${name}: ${inr(v[1])} - ${inr(v[0])} = ${up ? '' : '-'}${inr(change)}, ${up ? 'an increase' : 'a decrease'}.`,
      `Percentage change = ${inr(change)} ÷ ${inr(v[0])} × 100 = ${pc(n.answer)}${up ? '' : ', a decrease'}.`,
    ],
    hints: H.change,
  };
}
const revenueChange = (s: TwoYearsPl): NumericParts | null => changePart(s, 'Revenue from operations', s.d.rev, [], []);
function expensesChange(s: TwoYearsPl): NumericParts | null {
  // The slip of adding up the percentage changes of the lines, in hundredths.
  const added = s.d.exp.map((e) => changeOf(e));
  const total = added.every((h) => h !== null) ? Math.abs(sum(added as number[])) : 0;
  return changePart(s, 'Total expenses', s.w.expenses, [total > 0 && [[total, PERCENT], 'Added up the percentage changes of the expense lines. A total has its own change, worked on its own figures.']], [
    `Total expenses = ${s.d.exp.map((e) => inr(e[0])).join(' + ')} = ${inr(s.w.expenses[0])} in ${s.per.a}, and ${s.d.exp.map((e) => inr(e[1])).join(' + ')} = ${inr(s.w.expenses[1])} in ${s.per.b}.`,
  ]);
}
function profitChange(s: TwoYearsPl): NumericParts | null {
  const [ci, ce] = [changeOf(s.w.income), changeOf(s.w.expenses)];
  const gap = ci !== null && ce !== null ? Math.abs(ci - ce) : 0;
  return changePart(s, 'Profit before tax', s.w.pbt, [gap > 0 && [[gap, PERCENT], 'Took the change in profit before tax to be the gap between the percentage changes of total income and of total expenses.']], [
    `Total income = revenue from operations + other income = ${inr(s.w.income[0])} and ${inr(s.w.income[1])}; total expenses = ${inr(s.w.expenses[0])} and ${inr(s.w.expenses[1])}.`,
    `Profit before tax = total income - total expenses = ${inr(s.w.pbt[0])} in ${s.per.a} and ${inr(s.w.pbt[1])} in ${s.per.b}.`,
  ]);
}
/** A percentage change from the printed case, multiplied back. */
const changeHolds =
  (pick: (t: ReturnType<typeof twoYearsIn>) => Pair) =>
  (q: NumericQuestion): boolean => {
    const v = pick(twoYearsIn(q.context ?? ''));
    return q.prompt.includes(v[1] > v[0] ? ' rise in ' : ' fall in ') && nearest(q.answer, [Math.abs(v[1] - v[0]), v[0]], PERCENT);
  };

/** How total expenses moved beside revenue from operations, in words: by comparing their rates of change exactly. */
function relation(rev: Pair, exp: Pair): string | null {
  const dr = rev[1] - rev[0];
  const de = exp[1] - exp[0];
  // de/e0 against dr/r0, compared without dividing.
  const faster = de * rev[0] - dr * exp[0];
  if (dr === 0 || de === 0 || faster === 0) return null;
  if (dr > 0 && de > 0) return `Total expenses grew ${faster > 0 ? 'faster' : 'more slowly'} than revenue from operations`;
  if (dr < 0 && de < 0) return `Total expenses fell ${faster < 0 ? 'faster' : 'more slowly'} than revenue from operations`;
  return dr > 0 ? 'Total expenses fell while revenue from operations rose' : 'Total expenses rose while revenue from operations fell';
}
/** The other reading of the same movement, as a student who misreads the rates gives it. */
const OTHER_RELATION: Record<string, string> = {
  'Total expenses grew faster than revenue from operations': 'Total expenses grew more slowly than revenue from operations',
  'Total expenses grew more slowly than revenue from operations': 'Total expenses grew faster than revenue from operations',
  'Total expenses fell faster than revenue from operations': 'Total expenses fell more slowly than revenue from operations',
  'Total expenses fell more slowly than revenue from operations': 'Total expenses fell faster than revenue from operations',
  'Total expenses fell while revenue from operations rose': 'Total expenses rose while revenue from operations fell',
  'Total expenses rose while revenue from operations fell': 'Total expenses fell while revenue from operations rose',
};
function readingPart(s: TwoYearsPl): McqParts | null {
  const rel = relation(s.d.rev, s.w.expenses);
  const [pr, pe, pp] = [changeOf(s.d.rev), changeOf(s.w.expenses), changeOf(s.w.pbt)];
  if (!rel || pr === null || pe === null || pp === null) return null;
  const up = s.w.pbt[1] > s.w.pbt[0];
  const say = (r: string, rose: boolean): string => `${r}, and profit before tax ${rose ? 'rose' : 'fell'}`;
  // By the rates alone a student expects profit to rise when expenses grow more slowly than revenue (or fall faster).
  const byRates = rel.includes('more slowly') ? rel.includes('grew') : rel.includes('faster') ? rel.includes('fell') : rel.includes('fell while');
  const [dr, de] = [s.d.rev[1] - s.d.rev[0], s.w.expenses[1] - s.w.expenses[0]];
  const other = OTHER_RELATION[rel];
  // A student who compares the changes in rupees reads "faster" where expenses moved by more rupees than revenue.
  const inRupees = Math.sign(dr) === Math.sign(de) && Math.abs(de) > Math.abs(dr) !== rel.includes('faster');
  return choice(
    `Which reading of the two years of ${s.company} is right?`,
    say(rel, up),
    [
      [
        say(rel, !up),
        byRates !== up
          ? `Judged the profit by the rates of change alone. Profit before tax is total income less total expenses, worked out for each year: ${inr(s.w.pbt[0])} and ${inr(s.w.pbt[1])}.`
          : `Took profit before tax the wrong way: it was ${inr(s.w.pbt[0])} in ${s.per.a} and ${inr(s.w.pbt[1])} in ${s.per.b}.`,
      ],
      [
        say(other, up),
        inRupees
          ? `Compared the changes in rupees (${inr(Math.abs(de))} for expenses, ${inr(Math.abs(dr))} for revenue). How fast a line grows is its percentage change on its own earlier figure.`
          : `Read the two percentage changes the wrong way round: total expenses changed by ${signedPc(pe)} and revenue from operations by ${signedPc(pr)}.`,
      ],
      ['Nothing can be said about profit before tax until the tax of each year is worked out', 'Profit before tax comes before tax: it is total income less total expenses.'],
    ],
    `Revenue from operations changed by ${signedPc(pr)} and total expenses by ${signedPc(pe)}, each on its own figure of ${s.per.a}. Profit before tax went from ${inr(s.w.pbt[0])} to ${inr(s.w.pbt[1])}, a change of ${signedPc(pp)}. Other income is part of total income too, so the profit is worked out in rupees, not guessed from the rates.`,
    H.change,
  );
}
const readingHolds = (q: McqQuestion): boolean => {
  const t = twoYearsIn(q.context ?? '');
  const rel = relation(t.rev, t.expenses);
  return rel !== null && optionText(q) === `${rel}, and profit before tax ${t.pbt[1] > t.pbt[0] ? 'rose' : 'fell'}`;
};

const twoYearsMakers = [revenueChange, expensesChange, profitChange, readingPart];

const comparativePl = caseTemplate<TwoYearsPl>({
  id: 'case-an-comparative-pl',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Reading a comparative Statement of Profit and Loss',
  setup: (rng) => firstGood(20, () => drawTwoYearsPl(rng), (s) => twoYearsMakers.every((m) => m(s) !== null)),
  context: twoYearsText,
  parts: [
    { kind: 'numeric', unit: 'percent', make: revenueChange, verify: changeHolds((t) => t.rev) },
    { kind: 'numeric', unit: 'percent', make: expensesChange, verify: changeHolds((t) => t.expenses) },
    { kind: 'numeric', unit: 'percent', make: profitChange, verify: changeHolds((t) => t.pbt) },
    { kind: 'mcq', make: readingPart, verify: readingHolds },
  ],
});

// ===============================================================================================================
// 4. case-an-common-size: the common size Statements of Profit and Loss of two years (revenue from operations =
//    100), one percentage of the later year left out; find it, turn a percentage into rupees, find how far profit
//    before tax moved in rupees, and read what the shares of one line say.
// ===============================================================================================================

interface Shares {
  company: string;
  trade: string;
  a: string;
  b: string;
  names: string[];
  rev: Pair;
  /** Percentages in hundredths, each a multiple of 0.5%. */
  oi: Pair;
  exp: Pair[];
  pbt: Pair;
  missing: number;
  /** The line whose amount is asked, and the line whose shares are read. */
  amountOf: number;
  readOf: number;
}
const SHARE_MAKERS: [string, string][] = [
  ['Bhaskar Tools Ltd.', 'a maker of hand tools'],
  ['Devgiri Ceramics Ltd.', 'a maker of floor tiles'],
  ['Meenal Paints Ltd.', 'a paint manufacturer'],
  ['Jyotsna Plastics Ltd.', 'a maker of plastic containers'],
  ['Lokesh Auto Parts Ltd.', 'a maker of brake parts'],
];
const SHARE_DEALERS: [string, string][] = [
  ['Omkar Distributors Ltd.', 'a distributor of electrical goods'],
  ['Pushpak Traders Ltd.', 'a wholesaler of kitchen appliances'],
  ['Shubham Wholesale Ltd.', 'a wholesaler of cotton fabrics'],
  ['Revati Stores Ltd.', 'a chain of grocery stores'],
];
const PL_YEARS: [string, string][] = [['2023-24', '2024-25'], ['2024-25', '2025-26']];

function drawShares(rng: Rng): Shares | null {
  const dealer = rng.int(0, 2) === 0;
  const [company, trade] = rng.pick(dealer ? SHARE_DEALERS : SHARE_MAKERS);
  const [a, b] = rng.pick(PL_YEARS);
  const rev0 = 200000 * rng.int(15, 45);
  const rev1 = 200000 * Math.round((rev0 * (100 + rng.pick([-10, -5, 5, 8, 10, 12, 15, 20, 25]))) / 100 / 200000);
  const finance = rng.int(0, 1) === 0;
  const names = [dealer ? 'Purchases of stock-in-trade' : 'Cost of materials consumed', 'Employee benefits expense', ...(finance ? ['Finance costs'] : []), 'Other expenses'];
  const first = names.map((name) => 50 * (name === 'Employee benefits expense' ? rng.int(16, 32) : name === 'Finance costs' ? rng.int(4, 10) : name === 'Other expenses' ? rng.int(10, 24) : dealer ? rng.int(116, 136) : rng.int(92, 116)));
  const moved = (h: number): number => h + 50 * rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]);
  const exp = first.map((h): Pair => [h, moved(h)]);
  const oi0 = 50 * rng.int(2, 10);
  const oi: Pair = [oi0, Math.max(50, moved(oi0))];
  const pbt: Pair = [0, 1].map((k) => 10000 + oi[k] - sum(exp.map((e) => e[k]))) as Pair;
  if (rev1 === rev0 || pbt.some((p) => p < 300 || p > 2500) || pbt[0] === pbt[1] || rev0 * pbt[0] === rev1 * pbt[1]) return null;
  const [missing, amountOf, readOf] = rng.shuffle(names.map((_, i) => i)).slice(0, 3);
  return { company, trade, a, b, names, rev: [rev0, rev1], oi, exp, pbt, missing, amountOf, readOf };
}
const pctPair = (name: string, v: Pair, s: Shares, hideLater = false): string => `${name}: ${pc(v[0])} (${s.a}), ${hideLater ? 'not given' : pc(v[1])} (${s.b})`;
const sharesText = (s: Shares): string =>
  [
    `${s.company}, ${s.trade}, prepared these common size Statements of Profit and Loss for ${s.a} and ${s.b}, with revenue from operations = 100. The lines are the whole of each statement down to profit before tax.`,
    pctPair('Revenue from operations', [10000, 10000], s),
    pctPair('Other income', s.oi, s),
    ...s.names.map((name, i) => pctPair(name, s.exp[i], s, i === s.missing)),
    pctPair('Profit before tax', s.pbt, s),
    `Revenue from operations was ${inr(s.rev[0])} in ${s.a} and ${inr(s.rev[1])} in ${s.b}.`,
  ].join('\n');
/** The percentages of the printed case by line, in hundredths (NaN where one is not given), and the revenue of each year. */
function sharesIn(text: string): { lines: Map<string, number[]>; rev: number[] } {
  const lines = new Map<string, number[]>();
  for (const m of text.matchAll(/^(.+?): ([\d.]+%|not given) \([^)]+\), ([\d.]+%|not given) \([^)]+\)$/gm)) {
    const h = (x: string): number => (x === 'not given' ? NaN : Math.round(Number(x.slice(0, -1)) * 100));
    lines.set(m[1], [h(m[2]), h(m[3])]);
  }
  return { lines, rev: amountsIn(text.split('\n').at(-1) ?? '') };
}
const amountAt = (rev: number, h: number): number => (rev * h) / 10000;

function missingPart(s: Shares): NumericParts | null {
  const h = s.exp[s.missing][1];
  const name = s.names[s.missing];
  const others = s.names.map((n, i) => [n, s.exp[i][1]] as const).filter((_, i) => i !== s.missing);
  const n = figure(PERCENT, [h, PERCENT], [
    [[h - s.oi[1], PERCENT], 'Took total income as 100, leaving other income out. Total income is 100 plus other income.'],
    [[h - 2 * s.oi[1], PERCENT], 'Deducted other income instead of adding it.'],
    [[s.exp[s.missing][0], PERCENT], `Took the percentage of ${s.a}; the one of ${s.b} is asked for.`],
    [[h + s.pbt[1] - s.pbt[0], PERCENT], `Used the profit before tax of ${s.a} in place of the one of ${s.b}.`],
  ]);
  return n && {
    prompt: `What percentage of revenue from operations does the line "${name}" take in the common size statement for ${s.b}?`,
    ...n,
    explanation: [
      `Total income = 100% + other income ${pc(s.oi[1])} = ${pc(10000 + s.oi[1])}.`,
      `Total expenses = total income - profit before tax = ${pc(10000 + s.oi[1])} - ${pc(s.pbt[1])} = ${pc(10000 + s.oi[1] - s.pbt[1])}.`,
      `${name} = ${pc(10000 + s.oi[1] - s.pbt[1])} - ${others.map(([, v]) => pc(v)).join(' - ')} = ${pc(h)}.`,
    ],
    hints: H.share,
  };
}
const missingHolds = (q: NumericQuestion): boolean => {
  const { lines } = sharesIn(q.context ?? '');
  const later = [...lines].map(([name, v]) => [name, v[1]] as const);
  const known = later.filter(([, h]) => !Number.isNaN(h));
  if (later.length - known.length !== 1) return false;
  const get = (name: string): number => lines.get(name)?.[1] ?? NaN;
  // The statement adds up when the answer is put in: incomes less every expense is the profit before tax.
  const expenses = sum(known.filter(([name]) => !['Revenue from operations', 'Other income', 'Profit before tax'].includes(name)).map(([, h]) => h)) + q.answer;
  return get('Revenue from operations') + get('Other income') - expenses === get('Profit before tax');
};

function amountPart(s: Shares): NumericParts | null {
  const i = s.amountOf;
  const name = s.names[i];
  const h = s.exp[i][1];
  const n = money(amountAt(s.rev[1], h), [
    [(s.rev[1] * (10000 + s.oi[1]) * h) / 100000000, 'Applied the percentage to total income. A common size percentage is a percentage of revenue from operations.'],
    [amountAt(s.rev[0], h), `Applied the percentage to the revenue of ${s.a}; each year has its own base.`],
    [amountAt(s.rev[1], s.exp[i][0]), `Took the percentage of ${s.a}.`],
  ]);
  return n && {
    prompt: `What is the amount, in rupees, of the line "${name}" of ${s.company} for ${s.b}?`,
    ...n,
    explanation: [`${name} = ${pc(h)} of the revenue from operations of ${s.b} = ${pc(h)} of ${inr(s.rev[1])} = ${inr(amountAt(s.rev[1], h))}.`],
    hints: H.share,
  };
}
const amountHolds = (q: NumericQuestion): boolean => {
  const { lines, rev } = sharesIn(q.context ?? '');
  const line = [...lines].find(([name]) => q.prompt.includes(`the line "${name}"`));
  // Multiplied back: the answer is that share of the later revenue.
  return line !== undefined && (q.answer / 100) * 10000 === rev[1] * line[1][1];
};

function profitMovePart(s: Shares): NumericParts | null {
  const [p0, p1] = [amountAt(s.rev[0], s.pbt[0]), amountAt(s.rev[1], s.pbt[1])];
  const up = p1 > p0;
  const gap = Math.abs(s.pbt[1] - s.pbt[0]);
  const n = money(Math.abs(p1 - p0), [
    [amountAt(s.rev[1], gap), `Applied the change in the percentage, ${pc(gap)}, to the revenue of ${s.b}. Each year's profit is its own percentage of its own revenue.`],
    [amountAt(s.rev[0], gap), `Applied the change in the percentage, ${pc(gap)}, to the revenue of ${s.a}.`],
    [Math.abs(amountAt(s.rev[1] - s.rev[0], s.pbt[0])), `Worked out only what the change in revenue did at the margin of ${s.a}, leaving out the change in the margin.`],
    [p1, `Gave the profit before tax of ${s.b}, not the change in it.`],
  ]);
  return n && {
    prompt: `By how much did the profit before tax of ${s.company} ${up ? 'rise' : 'fall'} in rupees from ${s.a} to ${s.b}?`,
    ...n,
    explanation: [
      `Profit before tax of ${s.a} = ${pc(s.pbt[0])} of ${inr(s.rev[0])} = ${inr(p0)}.`,
      `Profit before tax of ${s.b} = ${pc(s.pbt[1])} of ${inr(s.rev[1])} = ${inr(p1)}.`,
      `It ${up ? 'rose' : 'fell'} by ${inr(Math.abs(p1 - p0))}.`,
    ],
    hints: H.share,
  };
}
const profitMoveHolds = (q: NumericQuestion): boolean => {
  const { lines, rev } = sharesIn(q.context ?? '');
  const pbt = lines.get('Profit before tax');
  if (!pbt) return false;
  const move = rev[1] * pbt[1] - rev[0] * pbt[0];
  return q.prompt.includes(move > 0 ? ' rise in rupees' : ' fall in rupees') && Math.abs(move) === q.answer * 100;
};

function shareReading(s: Shares): McqParts | null {
  const i = s.readOf;
  const name = s.names[i];
  const [h0, h1] = s.exp[i];
  const [x0, x1] = [amountAt(s.rev[0], h0), amountAt(s.rev[1], h1)];
  if (x0 === x1) return null;
  const shareUp = h1 > h0;
  const amountUp = x1 > x0;
  const revenueUp = s.rev[1] > s.rev[0];
  const say = (sUp: boolean, aUp: boolean): string => `Its share of revenue from operations ${sUp ? 'rose' : 'fell'} from ${pc(sUp === shareUp ? h0 : h1)} to ${pc(sUp === shareUp ? h1 : h0)}, and the amount spent on it ${aUp ? 'rose' : 'fell'}`;
  return choice(
    `What do the two common size statements say about the line "${name}"?`,
    say(shareUp, amountUp),
    [
      ...(amountUp !== shareUp
        ? [[say(shareUp, !amountUp), `Took the amount to move with its share. The revenue of the two years differs, so the amount went from ${inr(x0)} to ${inr(x1)}.`] as [string, string]]
        : revenueUp !== amountUp
          ? [[say(shareUp, !amountUp), `Took the amount to move with revenue from operations, which ${revenueUp ? 'rose' : 'fell'}. The amount is the share of each year's own revenue: ${inr(x0)}, then ${inr(x1)}.`] as [string, string]]
          : []),
      [say(!shareUp, amountUp), `Read the two years the wrong way round: ${pc(h0)} is the share of ${s.a}.`],
      [`The amount spent on it ${shareUp ? 'rose' : 'fell'} by ${pc(Math.abs(h1 - h0))}`, `Read the gap between two common size percentages as a percentage change of the amount. ${pc(Math.abs(h1 - h0))} is a difference in shares of revenue.`],
      ['Nothing can be said about the amount spent: a common size statement gives percentages only', 'The revenue of each year is given, so each amount is its percentage of that year\'s revenue.'],
    ],
    `Its share went from ${pc(h0)} in ${s.a} to ${pc(h1)} in ${s.b}. In rupees: ${pc(h0)} of ${inr(s.rev[0])} = ${inr(x0)}, and ${pc(h1)} of ${inr(s.rev[1])} = ${inr(x1)}.${shareUp !== amountUp ? ' The share and the amount moved opposite ways, because revenue itself changed.' : ''}`,
    H.share,
  );
}
const shareReadingHolds = (q: McqQuestion): boolean => {
  const { lines, rev } = sharesIn(q.context ?? '');
  const line = [...lines].find(([name]) => q.prompt.includes(`the line "${name}"`));
  if (!line) return false;
  const [h0, h1] = line[1];
  return optionText(q).startsWith(`Its share of revenue from operations ${h1 > h0 ? 'rose' : 'fell'}`) && optionText(q).endsWith(`spent on it ${rev[1] * h1 > rev[0] * h0 ? 'rose' : 'fell'}`);
};

const sharesMakers = [missingPart, amountPart, profitMovePart, shareReading];

const commonSize = caseTemplate<Shares>({
  id: 'case-an-common-size',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A common size Statement of Profit and Loss',
  setup: (rng) => firstGood(20, () => drawShares(rng), (s) => sharesMakers.every((m) => m(s) !== null)),
  context: sharesText,
  parts: [
    { kind: 'numeric', unit: 'percent', make: missingPart, verify: missingHolds },
    { kind: 'numeric', unit: 'rupees', make: amountPart, verify: amountHolds },
    { kind: 'numeric', unit: 'rupees', make: profitMovePart, verify: profitMoveHolds },
    { kind: 'mcq', make: shareReading, verify: shareReadingHolds },
  ],
});

// ===============================================================================================================
// 5. case-an-cash-flow-heads: five dealings of one company, which is not a financing company: three of one
//    section (investing or financing), one operating, and one that moves no cash but looks as if it belongs to that
//    section. Three of them are classified, then the net cash of the section is found.
// ===============================================================================================================

interface FlowItem {
  text: (x: string) => string;
  head: Head;
  /** +1 for an inflow, -1 for an outflow, 0 for a dealing that moves no cash. */
  sign: 1 | -1 | 0;
  because: string;
  /** The mistake behind a particular wrong head, where it is more telling than the general one. */
  slips?: Partial<Record<Head, string>>;
  /** Of a dealing that moves no cash: the section it is wrongly put in, and the sign it is then wrongly given. */
  looks?: { head: Head; sign: 1 | -1; why: string };
  range: readonly [number, number, number];
}
const NF_INTEREST = 'For a company that is not a financing company, interest and dividend received are a return on an investment: an investing inflow.';
const FLOW_ITEMS: FlowItem[] = [
  // Investing
  { text: (x) => `Bought machinery for ${x} and paid by cheque.`, head: 'I', sign: -1, because: 'Buying a fixed asset is an investing outflow.', slips: { O: 'Took the purchase of a fixed asset for a purchase of goods or an expense of the year.' }, range: [150000, 600000, 10000] },
  { text: (x) => `Sold an old delivery van for ${x} in cash.`, head: 'I', sign: 1, because: 'The proceeds of selling a fixed asset are an investing inflow.', slips: { O: 'Took the sale of a fixed asset for a sale of goods.' }, range: [20000, 120000, 5000] },
  { text: (x) => `Bought shares of another company for ${x}, to be held for three years.`, head: 'I', sign: -1, because: 'Buying a non-current investment is an investing outflow.', slips: { F: 'Mixed up buying the shares of another company with issuing its own shares.' }, range: [100000, 400000, 10000] },
  { text: (x) => `Received interest of ${x} on debentures held as an investment.`, head: 'I', sign: 1, because: NF_INTEREST, slips: { O: 'Took interest received for operating revenue because it is in the Statement of Profit and Loss; for a company that is not a financing company it is a return on an investment.', F: 'Mixed up interest received with interest paid on borrowings.' }, range: [10000, 60000, 5000] },
  { text: (x) => `Received a dividend of ${x} on shares held as an investment.`, head: 'I', sign: 1, because: NF_INTEREST, slips: { O: 'Took dividend received for operating revenue; for a company that is not a financing company it is a return on an investment.', F: 'Mixed up dividend received with dividend paid to its own shareholders.' }, range: [10000, 60000, 5000] },
  { text: (x) => `Received rent of ${x} from a building let out to a tenant.`, head: 'I', sign: 1, because: 'Rent from a let-out building is income from an asset held as an investment: an investing inflow.', slips: { O: 'Took rent from a let-out building for revenue from operations; the building is held as an investment.' }, range: [30000, 120000, 5000] },
  { text: (x) => `Paid ${x} for a patent.`, head: 'I', sign: -1, because: 'A patent is an intangible fixed asset; buying it is an investing outflow.', slips: { O: 'Took the cost of a patent for an expense of the year; it is an intangible fixed asset.' }, range: [50000, 300000, 10000] },
  // Financing
  { text: (x) => `Issued equity shares for cash, ${x} in all.`, head: 'F', sign: 1, because: 'Money raised from shareholders is a financing inflow.', slips: { I: 'Mixed up issuing its own shares with investing in the shares of another company.' }, range: [200000, 800000, 50000] },
  { text: (x) => `Issued 9% debentures for cash, ${x} in all.`, head: 'F', sign: 1, because: 'Money borrowed on debentures is a financing inflow.', slips: { I: 'Mixed up issuing its own debentures with investing in the debentures of another company.' }, range: [100000, 500000, 50000] },
  { text: (x) => `Repaid ${x} of a long-term bank loan.`, head: 'F', sign: -1, because: 'Repaying a borrowing is a financing outflow.', slips: { O: 'Took the repayment of a loan for an expense of the year.' }, range: [50000, 300000, 10000] },
  { text: (x) => `Paid interest of ${x} on its debentures.`, head: 'F', sign: -1, because: 'For a company that is not a financing company, interest on borrowings is the cost of finance: a financing outflow.', slips: { O: 'Took interest on borrowings for an operating expense because it is charged in the Statement of Profit and Loss; for a company that is not a financing company it is a cost of finance.', I: 'Mixed up interest paid on borrowings with interest received on investments.' }, range: [10000, 60000, 5000] },
  { text: (x) => `Paid the final dividend of ${x} proposed for the previous year.`, head: 'F', sign: -1, because: 'Dividend is paid to those who provide the share capital: a financing outflow.', slips: { O: 'Took dividend for an expense of running the business; it is paid to the providers of share capital.', I: 'Mixed up dividend paid with dividend received on investments.' }, range: [30000, 150000, 5000] },
  { text: (x) => `Drew a further ${x} on its bank overdraft.`, head: 'F', sign: 1, because: 'Bank overdraft is a short-term borrowing, so drawing more on it is a financing inflow.', slips: { O: 'Took bank overdraft for a working capital item; it is a short-term borrowing.', N: 'Took bank overdraft for a negative bank balance inside cash and cash equivalents; it is a short-term borrowing.' }, range: [20000, 100000, 5000] },
  // Operating
  { text: (x) => `Paid ${x} to its suppliers for goods bought on credit.`, head: 'O', sign: -1, because: 'Payments for goods bought for the business are part of its main revenue-earning work.', range: [200000, 800000, 10000] },
  { text: (x) => `Paid income tax of ${x} on the profit of the year.`, head: 'O', sign: -1, because: 'Income tax is an operating outflow unless it can be tied to an investing or a financing activity.', slips: { F: 'Took income tax for a distribution of profit like a dividend; tax on business profit is an operating outflow.' }, range: [30000, 200000, 5000] },
  { text: (x) => `Received a royalty of ${x} for the use of its brand name.`, head: 'O', sign: 1, because: 'Royalties, fees and commission are revenue of the business: an operating inflow.', slips: { I: 'Took a royalty for a return on an investment; royalties, fees and commission are revenue of the business.' }, range: [20000, 100000, 5000] },
  { text: (x) => `Paid salaries of ${x} to its staff.`, head: 'O', sign: -1, because: 'Payments to and for employees are operating outflows.', range: [100000, 500000, 10000] },
  // No flow of cash
  { text: (x) => `Bought machinery worth ${x} and paid the supplier by issuing equity shares.`, head: 'N', sign: 0, because: 'The machinery was paid for in shares, so no cash moved; such a dealing is left out of the statement.', slips: { I: 'Counted the machinery as bought for cash; it was paid for in shares.', F: 'Counted the shares as issued for cash; they were given in exchange for machinery.' }, looks: { head: 'I', sign: -1, why: 'Counted the machinery paid for in shares as an outflow; no cash moved.' }, range: [100000, 400000, 10000] },
  { text: (x) => `Bought treasury bills maturing in two months for ${x}.`, head: 'N', sign: 0, because: 'Treasury bills maturing within three months are cash equivalents: cash only changes its form within cash and cash equivalents.', slips: { I: 'Took a cash equivalent for an investment; an investment that matures within three months is part of cash and cash equivalents.' }, looks: { head: 'I', sign: -1, why: 'Counted the treasury bills, which are cash equivalents, as an investment bought.' }, range: [50000, 200000, 10000] },
  { text: (x) => `Converted 9% debentures of ${x} into equity shares.`, head: 'N', sign: 0, because: 'One source of finance is exchanged for another and no cash moves.', slips: { F: 'Counted the conversion as a cash repayment of debentures and a cash issue of shares; no cash moved.' }, looks: { head: 'F', sign: -1, why: 'Counted the conversion as a repayment of debentures in cash; no cash moved.' }, range: [100000, 400000, 50000] },
  { text: (x) => `Issued bonus shares of ${x} out of General Reserve.`, head: 'N', sign: 0, because: 'Reserves are turned into share capital and no cash is received.', slips: { F: 'Counted bonus shares as shares issued for cash; reserves are only turned into share capital.' }, looks: { head: 'F', sign: 1, why: 'Counted the bonus shares as shares issued for cash.' }, range: [100000, 400000, 50000] },
];
const ROMAN = ['(i)', '(ii)', '(iii)', '(iv)', '(v)'];
const SECTION: Record<'I' | 'F', string> = { I: 'investing', F: 'financing' };
const itemKey = (text: string): string => text.replace(/₹\d+(?:,\d+)*/g, '₹#');
const itemOf = (text: string): FlowItem | undefined => FLOW_ITEMS.find((i) => i.text('₹#') === itemKey(text));

interface Dealings {
  co: string;
  trade: string;
  section: 'I' | 'F';
  items: { item: FlowItem; x: number }[];
  /** The places of the items the three questions ask about, in order. */
  asked: number[];
}
function drawDealings(rng: Rng): Dealings | null {
  const { co, trade } = maker(rng);
  const section = rng.pick(['I', 'F'] as const);
  const own = rng.shuffle(FLOW_ITEMS.filter((i) => i.head === section)).slice(0, 3);
  const trap = rng.pick(FLOW_ITEMS.filter((i) => i.looks?.head === section));
  const other = rng.pick(FLOW_ITEMS.filter((i) => i.head === 'O'));
  const items = rng.shuffle([...own, trap, other]).map((item) => ({ item, x: rng.step(...item.range) }));
  if (!own.some((i) => i.sign > 0) || !own.some((i) => i.sign < 0)) return null;
  // The questions ask about the dealing that moves no cash, the operating one and one of the section, the last a
  // dealing students often misplace where there is one.
  const place = (i: FlowItem): number => items.findIndex((x) => x.item === i);
  const tricky = own.find((i) => i.slips?.O) ?? own[0];
  return { co, trade, section, items, asked: [place(trap), place(other), place(tricky)].sort((a, b) => a - b) };
}
const dealingsText = (s: Dealings): string =>
  [
    `${s.co}, ${s.trade}, is not a financing company. Among its dealings in ${YEAR}:`,
    ...s.items.map((d, i) => `${ROMAN[i]} ${d.item.text(inr(d.x))}`),
    'Cash and cash equivalents include investments that mature within three months of purchase; bank overdraft is a short-term borrowing.',
  ].join('\n');

const classifyPart =
  (n: number) =>
  (s: Dealings): McqParts | null => {
    const at = s.asked[n];
    const { item } = s.items[at];
    const wrong = (['O', 'I', 'F', 'N'] as Head[]).filter((h) => h !== item.head).map((h): [string, string] => [HEAD_TEXT[h], item.slips?.[h] ?? HEAD_SLIP[h]]);
    return choice(
      `Under which head of the Cash Flow Statement of ${s.co} is item ${ROMAN[at]} shown?`,
      HEAD_TEXT[item.head],
      wrong,
      `${item.because} ${item.head === 'N' ? 'So it appears under no head of the statement.' : `So it is shown under ${HEAD_TEXT[item.head].toLowerCase()}.`}`,
      H.heads,
    );
  };
const classifyHolds = (q: McqQuestion): boolean => {
  const label = /item (\([ivx]+\)) shown/.exec(q.prompt)?.[1];
  const line = (q.context ?? '').split('\n').find((l) => label !== undefined && l.startsWith(`${label} `));
  const item = line === undefined ? undefined : itemOf(line.slice(line.indexOf(' ') + 1));
  return item !== undefined && optionText(q) === HEAD_TEXT[item.head];
};

function sectionPart(s: Dealings): NumericParts | null {
  const mine = s.items.filter((d) => d.item.head === s.section);
  const net = sum(mine.map((d) => d.item.sign * d.x));
  if (net === 0) return null;
  const name = SECTION[s.section];
  const trap = s.items.find((d) => d.item.looks?.head === s.section)!;
  const sameWay = (v: number): number => (v * net > 0 ? Math.abs(v) : 0);
  const n = money(Math.abs(net), [
    [sameWay(net + trap.item.looks!.sign * trap.x), trap.item.looks!.why],
    ...mine.filter((d) => d.item.slips?.O).map((d): [number, string] => [sameWay(net - d.item.sign * d.x), `Left out item ${ROMAN[s.items.indexOf(d)]}, taking it for an operating item.`]),
    [sameWay(net > 0 ? sum(mine.map((d) => d.x)) : -sum(mine.map((d) => d.x))), 'Added up the figures without minding which are inflows and which are outflows.'],
  ]);
  return n && {
    prompt: `From these dealings alone, find the net cash ${net > 0 ? 'from' : 'used in'} ${name} activities.`,
    ...n,
    explanation: [
      ...mine.map((d) => `${ROMAN[s.items.indexOf(d)]} ${d.item.sign > 0 ? 'Inflow' : 'Outflow'} of ${inr(d.x)}.`),
      `Item ${ROMAN[s.items.indexOf(trap)]} moves no cash and is left out. ${trap.item.because}`,
      `Net cash ${net > 0 ? 'from' : 'used in'} ${name} activities = ${mine.map((d, i) => `${i === 0 ? (d.item.sign < 0 ? '- ' : '') : d.item.sign < 0 ? '- ' : '+ '}${inr(d.x)}`).join(' ')} = ${net < 0 ? '-' : ''}${inr(Math.abs(net))}.`,
    ],
    hints: H.heads,
  };
}
const sectionHolds = (q: NumericQuestion): boolean => {
  const head: Head = q.prompt.includes('investing activities') ? 'I' : 'F';
  const lines = (q.context ?? '').split('\n').filter((l) => /^\([ivx]+\) /.test(l)).map((l) => l.slice(l.indexOf(' ') + 1));
  const items = lines.map((l) => ({ item: itemOf(l), x: amountsIn(l)[0] }));
  if (items.some((i) => i.item === undefined)) return false;
  const net = sum(items.filter((i) => i.item!.head === head).map((i) => i.item!.sign * i.x));
  return q.prompt.includes(net > 0 ? 'net cash from' : 'net cash used in') && Math.abs(net) * 100 === q.answer;
};

const dealingsMakers = [classifyPart(0), classifyPart(1), classifyPart(2), sectionPart];

const cashFlowHeads = caseTemplate<Dealings>({
  id: 'case-an-cash-flow-heads',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Sorting the cash flows of a company',
  setup: (rng) => firstGood(20, () => drawDealings(rng), (s) => dealingsMakers.every((m) => m(s) !== null)),
  context: dealingsText,
  parts: [
    { kind: 'mcq', make: classifyPart(0), verify: classifyHolds },
    { kind: 'mcq', make: classifyPart(1), verify: classifyHolds },
    { kind: 'mcq', make: classifyPart(2), verify: classifyHolds },
    { kind: 'numeric', unit: 'rupees', make: sectionPart, verify: sectionHolds },
  ],
});

// ===============================================================================================================
// 6. case-an-two-ratios: a current ratio and a quick ratio with the inventories (and prepaid expenses in half the
//    seeds) given: the current liabilities, the current assets and the working capital; then what one transaction
//    does to the working capital and to the current ratio.
// ===============================================================================================================

interface TwoRatios {
  co: string;
  trade: string;
  r: number;
  q: number;
  cl: number;
  inv: number;
  prepaid: number;
  key: DealKey;
  x: number;
}
const WC_DEALS: DealKey[] = ['payCreditors', 'creditPurchase', 'shortLoan', 'issueShares', 'buyMachinery', 'endorseBill', 'sellMachinery', 'payOutstanding'];
function drawTwoRatios(rng: Rng): TwoRatios | null {
  const { co, trade } = maker(rng);
  const cl = rng.step(100000, 500000, 20000);
  const r = rng.pick([150, 175, 200, 225, 250, 300]);
  const q = r - rng.pick([50, 60, 75, 80, 100, 125].filter((gap) => r - gap >= 50));
  const slow = (cl * (r - q)) / 100;
  const prepaid = rng.int(0, 1) === 0 || slow < 80000 ? 0 : rng.step(5000, Math.min(30000, Math.floor(slow / 4 / 5000) * 5000), 5000);
  const key = rng.pick(WC_DEALS);
  const x = rng.step(20000, Math.max(20000, Math.floor(cl / 4 / 5000) * 5000), 5000);
  return { co, trade, r, q, cl, inv: slow - prepaid, prepaid, key, x };
}
const twoRatiosText = (s: TwoRatios): string =>
  `The current ratio of ${s.co}, ${s.trade}, is ${dec(s.r)} : 1 and its quick ratio is ${dec(s.q)} : 1, its quick assets being its current assets less inventories and prepaid expenses. Its inventories are ${inr(s.inv)}${s.prepaid > 0 ? ` and its prepaid expenses ${inr(s.prepaid)}` : ', and it has no prepaid expenses'}.`;
/** The ratios and the figures of the printed case, and the current liabilities they come to, worked another way. */
function twoRatiosIn(text: string): { r: number; q: number; slow: number; cl: number } {
  const [r, q] = [...text.matchAll(/(\d+(?:\.\d+)?) : 1/g)].map((m) => Math.round(Number(m[1]) * 100));
  const slow = sum(amountsIn(text));
  // Current assets are r x CL and quick assets q x CL, so what is not quick is (r - q) x CL.
  return { r, q, slow, cl: (slow * 100) / (r - q) };
}

function liabilitiesPart(s: TwoRatios): NumericParts | null {
  const slow = s.inv + s.prepaid;
  const n = money(s.cl, [
    s.prepaid > 0 && [(s.inv * 100) / (s.r - s.q), 'Left the prepaid expenses out: they are taken out of the current assets with the inventories.'],
    [(slow * 100) / s.r, 'Divided the inventories by the current ratio; they are divided by the difference of the two ratios.'],
    [(slow * 100) / s.q, 'Divided the inventories by the quick ratio; they are divided by the difference of the two ratios.'],
    [(slow * (s.r - s.q)) / 100, 'Multiplied by the difference of the two ratios instead of dividing by it.'],
  ]);
  return n && {
    prompt: 'Find the current liabilities of the company.',
    ...n,
    explanation: [
      `If the current liabilities are x, the current assets are ${dec(s.r)}x and the quick assets ${dec(s.q)}x.`,
      `What is not a quick asset, inventories${s.prepaid > 0 ? ' and prepaid expenses' : ''}, is ${dec(s.r)}x - ${dec(s.q)}x = ${dec(s.r - s.q)}x = ${s.prepaid > 0 ? `${inr(s.inv)} + ${inr(s.prepaid)} = ` : ''}${inr(slow)}.`,
      `So x = ${inr(slow)} ÷ ${dec(s.r - s.q)} = ${inr(s.cl)}.`,
    ],
    hints: ['Write both ratios as multiples of the current liabilities, x.', 'Current assets - quick assets = inventories + prepaid expenses.'],
  };
}
const liabilitiesHolds = (q: NumericQuestion): boolean => twoRatiosIn(q.context ?? '').cl * 100 === q.answer;

function assetsPart(s: TwoRatios): NumericParts | null {
  const ca = (s.cl * s.r) / 100;
  const n = money(ca, [
    [(s.cl * s.q) / 100, 'Gave the quick assets; the current assets include the inventories and prepaid expenses.'],
    [s.cl, 'Stopped at the current liabilities.'],
    s.prepaid > 0 && [((s.inv * 100) / (s.r - s.q)) * (s.r / 100), 'Found the current liabilities from the inventories alone, leaving the prepaid expenses out.'],
  ]);
  return n && {
    prompt: 'Find the current assets of the company.',
    ...n,
    explanation: [`Current liabilities = ${inr(s.inv + s.prepaid)} ÷ ${dec(s.r - s.q)} = ${inr(s.cl)}.`, `Current assets = ${dec(s.r)} × ${inr(s.cl)} = ${inr(ca)}.`],
    hints: ['Find the current liabilities first, from the difference of the two ratios.', 'Current assets = current ratio × current liabilities.'],
  };
}
// Put back: with these current assets the ratio is as stated, and what is not quick is what the case gives.
const assetsHolds = (q: NumericQuestion): boolean => {
  const t = twoRatiosIn(q.context ?? '');
  return q.answer === t.cl * t.r && q.answer / 100 - (t.cl * t.q) / 100 === t.slow;
};

function workingPart(s: TwoRatios): NumericParts | null {
  const ca = (s.cl * s.r) / 100;
  const quick = (s.cl * s.q) / 100;
  const n = money(ca - s.cl, [
    [quick - s.cl, 'Took the quick assets for the current assets.'],
    [ca, 'Gave the current assets; the current liabilities have to be deducted.'],
    [ca + s.cl, 'Added the current liabilities instead of deducting them.'],
  ]);
  return n && {
    prompt: 'Find the working capital of the company.',
    ...n,
    explanation: [`Current liabilities = ${inr(s.cl)}; current assets = ${dec(s.r)} × ${inr(s.cl)} = ${inr(ca)}.`, `Working capital = current assets - current liabilities = ${inr(ca)} - ${inr(s.cl)} = ${inr(ca - s.cl)}.`],
    hints: ['Working capital = current assets - current liabilities.', `It is also (current ratio - 1) × current liabilities.`],
  };
}
const workingHolds = (q: NumericQuestion): boolean => {
  const t = twoRatiosIn(q.context ?? '');
  // Another way: working capital is (current ratio - 1) times the current liabilities.
  return q.answer === t.cl * (t.r - 100);
};

const RATIO_SAYS = ['improves', 'declines', 'does not change'];
const verdictAt = (v: number): number => (v > 0 ? 0 : v < 0 ? 1 : 2);
const wcSays = (d: number): string => (d === 0 ? 'does not change' : `${d > 0 ? 'rises' : 'falls'} by ${inr(Math.abs(d))}`);
const twoRatioKept = keeper<Eff>();
function transactionPart(s: TwoRatios): McqParts | null {
  const deal = DEALS[s.key](s.x, 0);
  const spec = SPECS.current;
  const say = (e: Eff, verdict = movedBy(spec, e, s.r)): string => `Working capital ${wcSays(e.ca - e.cl)}; the current ratio ${RATIO_SAYS[verdictAt(verdict)]}`;
  const right = movedBy(spec, deal.eff, s.r);
  const both = deal.eff.ca !== 0 && deal.eff.ca === deal.eff.cl;
  const wrong: [string, string][] = [
    ...deal.slips.map(([e, why]): [string, string] => [say(e), why]),
    ...(right !== 0 ? [[say(deal.eff, -right), `Right about the working capital, wrong about the ratio: ${both ? `${deal.eff.ca > 0 ? 'adding the same amount to' : 'taking the same amount from'} both terms ${right > 0 ? 'raises' : 'lowers'} a ratio above 1 : 1` : `the change ${right > 0 ? 'raises' : 'lowers'} the ratio`}.`] as [string, string]] : []),
    ...(both ? [[say(deal.eff, 0), 'Took an equal change in both terms to leave the ratio as it was; that is so only at exactly 1 : 1.'] as [string, string]] : []),
    [`Working capital ${wcSays(deal.eff.ca + deal.eff.cl)}; the current ratio ${RATIO_SAYS[verdictAt(right)]}`, 'Added the change in the current liabilities to the working capital instead of deducting it.'],
  ];
  const prompt = `The company then ${deal.text}. What does this do to its working capital and to its current ratio?`;
  twoRatioKept.keep(`${twoRatiosText(s)}\n${prompt}`, deal.eff);
  return choice(prompt, say(deal.eff), wrong, `${deal.note} Working capital = current assets - current liabilities, so it ${wcSays(deal.eff.ca - deal.eff.cl)}; the current ratio, ${dec(s.r)} : 1 before, ${RATIO_SAYS[verdictAt(right)]}.`, H.effect);
}
const transactionHolds = (q: McqQuestion): boolean => {
  const eff = twoRatioKept.of(`${q.context ?? ''}\n${q.prompt}`);
  if (!eff) return false;
  const t = twoRatiosIn(q.context ?? '');
  const ca = (t.cl * t.r) / 100;
  // By arithmetic on the company's own figures: the new ratio against the old, and the new working capital.
  const moved = Math.sign((ca + eff.ca) * t.cl - ca * (t.cl + eff.cl));
  return optionText(q) === `Working capital ${wcSays(eff.ca - eff.cl)}; the current ratio ${RATIO_SAYS[verdictAt(moved)]}`;
};

const twoRatiosMakers = [liabilitiesPart, assetsPart, workingPart, transactionPart];

const twoRatios = caseTemplate<TwoRatios>({
  id: 'case-an-two-ratios',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Working capital from two ratios',
  setup: (rng) => firstGood(20, () => drawTwoRatios(rng), (s) => twoRatiosMakers.every((m) => m(s) !== null)),
  context: twoRatiosText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: liabilitiesPart, verify: liabilitiesHolds },
    { kind: 'numeric', unit: 'rupees', make: assetsPart, verify: assetsHolds },
    { kind: 'numeric', unit: 'rupees', make: workingPart, verify: workingHolds },
    { kind: 'mcq', make: transactionPart, verify: transactionHolds },
  ],
});

// ===============================================================================================================
// Chained cases: the 6-mark question of Part B. Each long part is the examined format of its topic, made from the
// same scenario (the case text is that format's data, with what the chain needs said once more), and checked by that
// format's own `verify`; the short parts beside it are checked from the printed case.
// ===============================================================================================================

/** What a format made alone returns, without its data: in a case the case text is the data. */
function withoutData<P extends { data: string }>(parts: P): Omit<P, 'data'> {
  const { data, ...rest } = parts;
  void data;
  return rest;
}

// ---------------------------------------------------------------------------------------------------------------
// 7. case-an-chain-cash-flow: two balance sheets and additional information (the examined statement of the cash
//    flow topic, always with a machine sold, its sale told by its price or by the profit or loss on it). Machinery
//    A/c first, its purchases the balancing figure; then the Cash Flow Statement, which takes the machinery bought
//    from that account.
// ---------------------------------------------------------------------------------------------------------------

interface CfChain {
  c: CashFlowCase;
}
const MACHINERY_LINE = 'Machinery (at cost)';
const SOLD_LINE = 'During the year a machine that had cost';
const KEPT_AT_COST = 'Machinery is kept at cost in Machinery A/c and the depreciation on it in Accumulated Depreciation A/c; the profit or loss on a sale goes to the Statement of Profit and Loss.';
function cfChainText(s: CfChain): string {
  const lines = s.c.parts.data.split('\n');
  const at = lines.indexOf('Additional information:');
  // The machinery is paid for by cheque here, as Machinery A/c of the cash flow topic writes it ("To Bank A/c").
  return [...lines.slice(0, at + 1), KEPT_AT_COST, ...lines.slice(at + 1)].join('\n').replace(' was for cash.', ' was by cheque.');
}
/** The machine sold, as the printed case tells of it: its cost, the depreciation on it, and its price. */
function soldIn(text: string): { open: number; close: number; cost: number; accumulated: number; price: number } {
  const [open, close] = amountsIn(text.split('\n').find((l) => l.startsWith(`${MACHINERY_LINE}: `)) ?? '');
  const line = text.split('\n').find((l) => l.startsWith(SOLD_LINE)) ?? '';
  const [cost, accumulated, third] = amountsIn(line);
  const price = line.includes('was sold for') ? third : cost - accumulated + (line.includes('at a profit of') ? third : -third);
  return { open, close, cost, accumulated, price };
}

function machineryChainPart(s: CfChain): CaseAccountParts | null {
  const m = s.c.m;
  const sale = m.sale;
  // Bank A/c is right, and Cash A/c wrong, only because the case says the machinery was bought and sold by cheque.
  if (!sale || !cfChainText(s).includes('was by cheque.')) return null;
  const byPrice = cfChainText(s).includes('was sold for');
  const result = sale.g > 0 ? `To ${WORKING_LABELS.profitOnSaleOfAsset} ${inr(sale.g)}` : `By ${WORKING_LABELS.lossOnSaleOfAsset} ${inr(-sale.g)}`;
  return {
    task: `Prepare Machinery A/c of ${s.c.co} for the year ended ${Y1}, with the machinery bought during the year as its balancing figure. Balance the account on ${Y1} and bring the balance down.`,
    title: 'Machinery A/c',
    ...machineryAccountSides(m),
    distractors: ['Machinery A/c', 'Depreciation A/c', 'Cash A/c', WORKING_LABELS.lossOnSaleOfAsset, WORKING_LABELS.profitOnSaleOfAsset, ...WORKING_ALSO[WORKING_LABELS.lossOnSaleOfAsset], ...WORKING_ALSO[WORKING_LABELS.profitOnSaleOfAsset]],
    explanation: [
      `The account is kept at cost. It opens with ${inr(m.open)} (To Balance b/d) and closes with ${inr(m.close)}, carried down on the credit side (By Balance c/d) and brought down on 1 April 2026.`,
      byPrice
        ? `The machine sold fetched ${inr(sale.price)}; its book value was ${inr(sale.cost)} - ${inr(sale.accumulated)} = ${inr(sale.book)}, so the sale gave a ${sale.what} of ${inr(Math.abs(sale.g))}.`
        : `Book value of the machine sold = ${inr(sale.cost)} - ${inr(sale.accumulated)} = ${inr(sale.book)}; price = book value ${sale.g > 0 ? '+ profit' : '- loss'} = ${inr(sale.book)} ${sale.g > 0 ? '+' : '-'} ${inr(Math.abs(sale.g))} = ${inr(sale.price)}.`,
      `The machine leaves the account at its cost of ${inr(sale.cost)}: By Bank A/c ${inr(sale.price)}, the price; By Accumulated Depreciation A/c ${inr(sale.accumulated)}, the depreciation on it, transferred from that account; and ${result}${sale.g > 0 ? `, a debit, since the two credits come to ${inr(sale.price + sale.accumulated)}, ${inr(sale.g)} more than the cost` : ''}.`,
      `The debit side is then short by the machinery bought, To Bank A/c, the balancing figure = ${inr(m.close)} + ${inr(sale.cost)} - ${inr(m.open)} = ${inr(m.bought)}. It is the outflow "Purchase of machinery" of the Cash Flow Statement.`,
      `Each side totals ${inr(m.open + m.bought + Math.max(sale.g, 0))}.`,
    ],
    hints: ['Opening balance + purchases = cost of the machine sold + closing balance.', 'The machine sold is credited at its cost, in three parts: the price, the depreciation on it, and a loss (or, less a profit, debited).'],
  };
}
/** Machinery A/c worked again from the printed case: each row by the rule a student uses, and nothing else. */
const machineryChainHolds = (q: AccountQuestion): boolean => {
  const t = soldIn(q.context ?? '');
  const g = t.price - (t.cost - t.accumulated);
  const rowsOf = (side: 0 | 1): string[] => q.sides[side].rows.map((r) => `${r.label}=${r.amounts[0]}`).sort();
  const want = (rows: [string, number][]): string[] => rows.filter(([, v]) => v > 0).map(([label, v]) => `${label}=${rupees(v)}`).sort();
  const bought = t.close + t.cost - t.open;
  return (
    rowsOf(0).join() === want([['Balance b/d', t.open], ['Bank A/c', bought], [WORKING_LABELS.profitOnSaleOfAsset, g]]).join() &&
    rowsOf(1).join() === want([['Bank A/c', t.price], ['Accumulated Depreciation A/c', t.accumulated], [WORKING_LABELS.lossOnSaleOfAsset, -g], ['Balance c/d', t.close]]).join() &&
    q.sides[0].below.length === 1 && q.sides[0].below[0].amounts[0] === rupees(t.close)
  );
};

function cashFlowChainPart(s: CfChain): CaseStatementParts | null {
  const parts = withoutData(s.c.parts);
  const task = parts.task.replace(', as AS 3 (Revised) lays down.', ', as AS 3 (Revised) lays down, taking the machinery bought from Machinery A/c.');
  return task === parts.task ? null : { ...parts, task };
}

const chainCashFlow = caseTemplate<CfChain>({
  id: 'case-an-chain-cash-flow',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Machinery A/c and the Cash Flow Statement',
  setup: (rng) => {
    const c = firstGood(40, () => cashFlowStatement(rng, { sale: true }), (x) => x.m.sale !== null);
    return c && { c };
  },
  context: cfChainText,
  parts: [
    { kind: 'account', make: machineryChainPart, verify: machineryChainHolds },
    { kind: 'statement', make: cashFlowChainPart, verify: cashFlowStatementHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 8. case-an-chain-spl-ratios: the list of a trading company (the examined Statement of Profit and Loss of the
//    company topic, with no loss on a sale and nothing written off, so that every expense but the finance costs is
//    an operating one); the statement first, then the gross profit ratio, the operating ratio, and the net profit
//    ratio starting from the profit for the period the statement ends on.
// ---------------------------------------------------------------------------------------------------------------

interface SplChain {
  sp: SplCase;
  trade: string;
}
const TRADERS: [string, string][] = [
  ['Pushpak Traders Ltd.', 'a wholesaler of kitchen appliances'],
  ['Omkar Distributors Ltd.', 'a distributor of electrical goods'],
  ['Shubham Wholesale Ltd.', 'a wholesaler of cotton fabrics'],
  ['Revati Stores Ltd.', 'a chain of grocery stores'],
  ['Tarini Marts Ltd.', 'a chain of department stores'],
  ['Nandini Retail Ltd.', 'a retailer of footwear'],
];
const RATIO_BASIS = 'For its ratios: cost of revenue from operations = purchases of stock-in-trade + change in inventories of stock-in-trade (opening less closing inventory), the company having no direct expenses; every expense other than finance costs is an operating expense.';
const splChainText = (s: SplChain): string =>
  [s.sp.parts.data.replace(`${s.sp.co} is a trading company.`, `${s.sp.co}, ${s.trade}, is a trading company.`), RATIO_BASIS].join('\n');
/** The figures the ratios are worked from: of the statement, or read back from the printed case. */
function splRatios(f: Map<string, number>) {
  const g = (l: string): number => f.get(l) ?? 0;
  const revenue = g('rfo');
  const cost = g('pst') + g('chg');
  const operating = cost + g('ebe') + g('dep') + g('oe');
  const pbt = revenue + g('oi') - operating - g('fc');
  return { revenue, cost, gp: revenue - cost, operating, oi: g('oi'), fc: g('fc'), ebe: g('ebe'), pbt, pat: pbt - g('tax'), tax: g('tax'), chg: g('chg'), pst: g('pst') };
}
const readSpl = (q: NumericQuestion) => {
  const f = splFromData(q.context ?? '');
  return f ? splRatios(f) : null;
};
const yearOf = (s: SplChain): string => `the year ended 31 March ${s.sp.y}`;

function grossProfitPart(s: SplChain): NumericParts | null {
  const r = splRatios(s.sp.figures);
  const n = figure(PERCENT, [r.gp, r.revenue], [
    [[r.gp, r.cost], 'Took the gross profit as a percentage of the cost of revenue from operations; the ratio is on revenue from operations.'],
    [[r.revenue - r.pst, r.revenue], 'Left the change in inventories out of the cost of revenue from operations.'],
    [[r.revenue - r.pst + r.chg, r.revenue], 'Took the change in inventories the wrong way round.'],
    [[r.gp + r.oi, r.revenue], 'Added other income to the gross profit; it is not revenue from operations.'],
    [[r.cost, r.revenue], 'Gave the cost of revenue from operations as a percentage of revenue, not the gross profit.'],
  ]);
  return n && {
    prompt: `Find the gross profit ratio of ${s.sp.co} for ${yearOf(s)}, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Cost of revenue from operations = purchases of stock-in-trade ${inr(r.pst)} ${r.chg < 0 ? '-' : '+'} change in inventories ${inr(Math.abs(r.chg))} = ${inr(r.cost)}.`,
      `Gross profit = revenue from operations ${inr(r.revenue)} - ${inr(r.cost)} = ${inr(r.gp)}.`,
      `Gross profit ratio = ${inr(r.gp)} ÷ ${inr(r.revenue)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: H.profit,
  };
}
const grossProfitHolds = (q: NumericQuestion): boolean => {
  const r = readSpl(q);
  return r !== null && nearest(q.answer, [r.gp, r.revenue], PERCENT);
};

function operatingPart(s: SplChain): NumericParts | null {
  const r = splRatios(s.sp.figures);
  const n = figure(PERCENT, [r.operating, r.revenue], [
    r.fc > 0 && [[r.operating + r.fc, r.revenue], 'Counted the finance costs as an operating expense.'],
    [[r.operating - r.cost, r.revenue], 'Left the cost of revenue from operations out of the operating cost.'],
    [[r.revenue - r.operating, r.revenue], 'Gave the operating profit ratio: 100 less the operating ratio.'],
    [[r.operating - r.oi, r.revenue], 'Deducted other income from the operating cost; a non-operating income is left out altogether.'],
    [[r.operating, r.revenue + r.oi], 'Divided by total income; the ratio is on revenue from operations.'],
  ]);
  return n && {
    prompt: `Find the operating ratio of ${s.sp.co} for ${yearOf(s)}, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Operating cost = cost of revenue from operations ${inr(r.cost)} + operating expenses (employee benefits, depreciation and other expenses) ${inr(r.operating - r.cost)} = ${inr(r.operating)}.${r.fc > 0 ? ' Finance costs are not an operating expense.' : ''} Other income is left out.`,
      `Operating ratio = ${inr(r.operating)} ÷ ${inr(r.revenue)} × 100 = ${pc(n.answer)}; the operating profit ratio is 100% less it.`,
    ],
    hints: H.profit,
  };
}
const operatingHolds = (q: NumericQuestion): boolean => {
  const r = readSpl(q);
  return r !== null && nearest(q.answer, [r.operating, r.revenue], PERCENT);
};

function netProfitChainPart(s: SplChain): NumericParts | null {
  const r = splRatios(s.sp.figures);
  const n = figure(PERCENT, [r.pat, r.revenue], [
    [[r.pbt, r.revenue], 'Used the profit before tax; the ratio is asked on the profit after tax, the profit for the period.'],
    [[r.pat, r.revenue + r.oi], 'Divided by total income; the ratio is on revenue from operations.'],
    [[r.pat, r.gp], 'Divided the net profit by the gross profit instead of by the revenue from operations.'],
    [[r.tax, r.revenue], 'Gave the tax as a percentage of revenue.'],
  ]);
  return n && {
    prompt: `Starting from the profit for the period of the Statement of Profit and Loss, find the net profit ratio of ${s.sp.co} on its profit after tax, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Profit for the period = profit before tax ${inr(r.pbt)} - tax ${inr(r.tax)} = ${inr(r.pat)}.`,
      `Net profit ratio = ${inr(r.pat)} ÷ revenue from operations ${inr(r.revenue)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: H.profit,
  };
}
const netProfitChainHolds = (q: NumericQuestion): boolean => {
  const r = readSpl(q);
  return r !== null && nearest(q.answer, [r.pat, r.revenue], PERCENT);
};

const splChainMakers = [grossProfitPart, operatingPart, netProfitChainPart];

const chainSplRatios = caseTemplate<SplChain>({
  id: 'case-an-chain-spl-ratios',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Statement of Profit and Loss and its ratios',
  setup: (rng) =>
    firstGood(
      30,
      () => {
        const [name, trade] = rng.pick(TRADERS);
        const sp = splStatement(rng, { name, trader: true, operating: true });
        return sp && { sp, trade };
      },
      (s) => splChainMakers.every((m) => m(s) !== null),
    ),
  context: splChainText,
  parts: [
    { kind: 'statement', make: (s) => withoutData(s.sp.parts), verify: splStatementHolds },
    { kind: 'numeric', unit: 'percent', make: grossProfitPart, verify: grossProfitHolds },
    { kind: 'numeric', unit: 'percent', make: operatingPart, verify: operatingHolds },
    { kind: 'numeric', unit: 'percent', make: netProfitChainPart, verify: netProfitChainHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 9. case-an-chain-comparative-bs: the balance sheets of two dates (the examined comparative balance sheet of the
//    analysis topic, its two dates printed as each line is chosen); the comparative balance sheet, then three ratios
//    for the later date: a liquidity ratio, a solvency ratio and the proprietary ratio.
// ---------------------------------------------------------------------------------------------------------------

interface BsChain {
  cb: ComparativeBsCase;
  liquid: 'current' | 'quick';
  solvent: 'debtEquity' | 'assetsDebt';
}
const NO_PREPAID_LINE = ' It holds no prepaid expenses and has no long-term provisions.';
const bsChainText = (s: BsChain): string => {
  const [first, ...rest] = s.cb.parts.data.split('\n');
  return [`${first}${NO_PREPAID_LINE}`, ...rest].join('\n');
};
/** The lines of the later balance sheet and the totals the ratios are built from, from a map of pairs by name. */
function laterSheet(f: Map<string, Pair>, k: 0 | 1) {
  const g = (name: string): number => f.get(name)?.[k] ?? 0;
  const ca = g('Inventories') + g('Trade receivables') + g('Cash and cash equivalents');
  const cl = g('Short-term borrowings') + g('Trade payables') + g('Short-term provisions');
  const sf = g('Share capital') + g('Reserves and surplus');
  const ltb = g('Long-term borrowings');
  return { ca, quick: ca - g('Inventories'), cl, sf, sc: g('Share capital'), ltb, stb: g('Short-term borrowings'), ta: ca + g('Property, plant and equipment') + g('Non-current investments'), sources: sf + ltb + cl };
}
const sheetsOf = (s: BsChain): Map<string, Pair> => new Map(s.cb.d.funds.concat(s.cb.d.assets).flatMap((h) => h.lines));
const dateOf = (s: BsChain): string => s.cb.per.b;

function bsLiquidPart(s: BsChain): NumericParts | null {
  const [now, before] = [laterSheet(sheetsOf(s), 1), laterSheet(sheetsOf(s), 0)];
  const current = s.liquid === 'current';
  const top = (t: typeof now): number => (current ? t.ca : t.quick);
  const n = figure(TIMES, [top(now), now.cl], [
    [[top(before), before.cl], `Worked the ratio for ${s.cb.per.a}; it is asked for ${dateOf(s)}.`],
    [[now.cl, top(now)], 'Divided the current liabilities by the assets: the ratio is upside down.'],
    current ? [[now.quick, now.cl], 'Left the inventories out of the current assets: that gives the quick ratio.'] : [[now.ca, now.cl], 'Kept the inventories in: that is the current ratio.'],
    [[top(now), now.cl + now.ltb], 'Counted the long-term borrowings among the current liabilities; they are a non-current liability.'],
  ]);
  return n && {
    prompt: `Find the ${current ? 'current ratio' : 'quick ratio (quick assets being the current assets less inventories and prepaid expenses)'} of the company as at ${dateOf(s)}, ${AS_RATIO}.`,
    ...n,
    explanation: [
      `As at ${dateOf(s)}: ${current ? 'current assets' : 'quick assets'} = ${inr(top(now))}${current ? '' : ' (current assets less inventories)'}; current liabilities = ${inr(now.cl)}.`,
      `${current ? 'Current ratio' : 'Quick ratio'} = ${inr(top(now))} ÷ ${inr(now.cl)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.liquidity,
  };
}
const bsLiquidHolds = (q: NumericQuestion): boolean => {
  const t = laterSheet(pairsIn(q.context ?? ''), 1);
  return nearest(q.answer, [q.prompt.includes('quick ratio') ? t.quick : t.ca, t.cl], TIMES);
};

function bsSolventPart(s: BsChain): NumericParts | null {
  const [now, before] = [laterSheet(sheetsOf(s), 1), laterSheet(sheetsOf(s), 0)];
  if (s.solvent === 'debtEquity') {
    const n = figure(TIMES, [now.ltb, now.sf], [
      [[before.ltb, before.sf], `Worked the ratio for ${s.cb.per.a}; it is asked for ${dateOf(s)}.`],
      [[now.sf, now.ltb], "Divided the shareholders' funds by the debt: the ratio is upside down."],
      [[now.ltb, now.sc], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
      [[now.ltb, now.ltb + now.sf], "Divided the debt by debt plus shareholders' funds: that is the debt to capital employed ratio."],
      now.stb > 0 && [[now.ltb + now.stb, now.sf], 'Counted the short-term borrowings as debt; they are a current liability.'],
    ]);
    return n && {
      prompt: `Find the debt to equity ratio of the company as at ${dateOf(s)}, debt being its long-term borrowings and equity its shareholders' funds, ${AS_RATIO}.`,
      ...n,
      explanation: [`Debt = long-term borrowings ${inr(now.ltb)}. Shareholders' funds = share capital + reserves and surplus = ${inr(now.sf)}.`, `Debt to equity ratio = ${inr(now.ltb)} ÷ ${inr(now.sf)} = ${dec(n.answer)} : 1.`],
      hints: H.solvency,
    };
  }
  const n = figure(TIMES, [now.ta, now.ltb], [
    [[before.ta, before.ltb], `Worked the ratio for ${s.cb.per.a}; it is asked for ${dateOf(s)}.`],
    [[now.ltb, now.ta], 'Divided the debt by the total assets: the ratio is upside down.'],
    [[now.ta - now.cl, now.ltb], 'Deducted the current liabilities from the total assets: that is the capital employed, not the total assets.'],
    now.stb > 0 && [[now.ta, now.ltb + now.stb], 'Counted the short-term borrowings as debt; they are a current liability.'],
    [[now.ta - now.ca, now.ltb], 'Left the current assets out of the total assets.'],
  ]);
  return n && {
    prompt: `Find the total assets to debt ratio of the company as at ${dateOf(s)}, debt being its long-term borrowings, ${AS_RATIO}.`,
    ...n,
    explanation: [`Total assets = the total of the balance sheet = ${inr(now.ta)}. Debt = long-term borrowings ${inr(now.ltb)}.`, `Total assets to debt ratio = ${inr(now.ta)} ÷ ${inr(now.ltb)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const bsSolventHolds = (q: NumericQuestion): boolean => {
  const t = laterSheet(pairsIn(q.context ?? ''), 1);
  return t.ta === t.sources && nearest(q.answer, q.prompt.includes('debt to equity') ? [t.ltb, t.sf] : [t.sources, t.ltb], TIMES);
};

function bsProprietaryPart(s: BsChain): NumericParts | null {
  const [now, before] = [laterSheet(sheetsOf(s), 1), laterSheet(sheetsOf(s), 0)];
  const n = figure(TIMES, [now.sf, now.ta], [
    [[before.sf, before.ta], `Worked the ratio for ${s.cb.per.a}; it is asked for ${dateOf(s)}.`],
    [[now.ta, now.sf], "Divided the total assets by the shareholders' funds: the ratio is upside down."],
    [[now.sc, now.ta], "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
    [[now.sf + now.ltb, now.ta], "Counted the long-term borrowings in the shareholders' funds."],
    [[now.sf, now.ta - now.sf], "Divided the shareholders' funds by the outside liabilities; total assets are shareholders' funds plus every liability."],
  ]);
  return n && {
    prompt: `Find the proprietary ratio of the company as at ${dateOf(s)}, worked on total assets (shareholders' funds ÷ total assets), ${AS_RATIO}.`,
    ...n,
    explanation: [`Shareholders' funds = ${inr(now.sf)}; total assets = the total of the balance sheet = ${inr(now.ta)}.`, `Proprietary ratio = ${inr(now.sf)} ÷ ${inr(now.ta)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const bsProprietaryHolds = (q: NumericQuestion): boolean => {
  const t = laterSheet(pairsIn(q.context ?? ''), 1);
  return t.ta === t.sources && nearest(q.answer, [t.sf, t.sources], TIMES);
};

/** The comparative balance sheet with the figures of the two dates printed: only the changes and the totals are typed. */
function comparativeChainPart(s: BsChain): CaseStatementParts {
  const { per, company } = s.cb;
  return {
    ...withoutData(s.cb.parts),
    task: `Prepare the Comparative Balance Sheet of ${company} as at ${per.a} and ${per.b}; the figures of the two dates are printed as each line is chosen. Give every percentage to two decimal places and show a decrease with a minus sign.`,
    columns: [{ name: `${per.a} (₹)`, given: true }, { name: `${per.b} (₹)`, given: true }, { name: 'Absolute change (₹)', signed: true }, { name: 'Percentage change (%)', unit: 'percent', signed: true }],
  };
}

const bsChainMakers = [bsLiquidPart, bsSolventPart, bsProprietaryPart];

const chainComparativeBs = caseTemplate<BsChain>({
  id: 'case-an-chain-comparative-bs',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Comparative balance sheet and its ratios',
  setup: (rng) =>
    firstGood(
      30,
      () => {
        const cb = comparativeBalanceSheet(rng);
        return cb && { cb, liquid: rng.pick(['current', 'quick'] as const), solvent: rng.pick(['debtEquity', 'assetsDebt'] as const) };
      },
      (s) => bsChainMakers.every((m) => m(s) !== null),
    ),
  context: bsChainText,
  parts: [
    { kind: 'statement', make: comparativeChainPart, verify: comparativeBalanceSheetHolds },
    { kind: 'numeric', unit: 'times', make: bsLiquidPart, verify: bsLiquidHolds },
    { kind: 'numeric', unit: 'times', make: bsSolventPart, verify: bsSolventHolds },
    { kind: 'numeric', unit: 'times', make: bsProprietaryPart, verify: bsProprietaryHolds },
  ],
});

const cases: CaseTemplate[] = [ratiosOneSheet, effectLiquidity, comparativePl, commonSize, cashFlowHeads, twoRatios, chainCashFlow, chainSplRatios, chainComparativeBs];

export default cases;

/**
 * What the integrated case studies of the company-year stage (`./company-year.ts`) reuse of this stage: a ratio or a
 * percentage to two decimal places with its slips, an amount with its slips, a choice, and the keeping of what a part
 * was made from. Only exported here; nothing in this file uses the object, so no case of this stage changes.
 */
export const AN_CASE = { figure, money, choice, rounded, nearest, firstGood, keeper, listedIn, amountsIn, TIMES, PERCENT, AS_RATIO, IN_TIMES, AS_PERCENT, H };
