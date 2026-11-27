// "Try it" in the ratio lab, answered on the picture, with instant feedback. Nothing is recorded.
//
// Three kinds: what a transaction does to a ratio (worked out by arithmetic on the figures on screen), a ratio
// worked out from those figures, and which term an item belongs to.

import type { Paise } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { applyDeal, dealById, type DealId } from './deals';
import { EXAMPLES, randomFigures } from './examples';
import { effectWords } from './steps';
import { linesOf, movement, plugged, ratioDef, ratioOf, shown, showValue, type Lines, type RatioFigures, type RatioId } from './model';

export interface Choice {
  id: string;
  label: string;
}

export const EFFECT_OPTIONS: Choice[] = [
  { id: 'up', label: 'Increase' },
  { id: 'down', label: 'Decrease' },
  { id: 'same', label: 'No change' },
];

/** The ratios a question on each transaction may ask about. */
const ASKED: Record<DealId, RatioId[]> = {
  payCreditors: ['current', 'quick', 'debtEquity'],
  creditPurchase: ['current', 'quick', 'inventoryTurnover', 'debtEquity'],
  cashPurchase: ['current', 'quick', 'payablesTurnover'],
  collectDebtors: ['current', 'quick', 'receivablesTurnover'],
  buyMachinery: ['current', 'quick', 'assetsToDebt', 'proprietary'],
  issueShares: ['current', 'debtEquity', 'proprietary', 'assetsToDebt'],
  issueDebentures: ['current', 'debtEquity', 'proprietary', 'assetsToDebt', 'roi'],
  redeemDebentures: ['current', 'debtEquity', 'proprietary', 'assetsToDebt'],
  shortLoan: ['current', 'quick', 'debtEquity'],
  convertDebentures: ['debtEquity', 'proprietary', 'assetsToDebt', 'roi'],
  sharesForMachinery: ['debtEquity', 'proprietary', 'assetsToDebt', 'current'],
  prepay: ['current', 'quick'],
  sellGoodsCredit: ['current', 'quick', 'grossProfit', 'inventoryTurnover', 'debtEquity'],
  depreciation: ['proprietary', 'debtEquity', 'operatingRatio', 'current'],
  badDebt: ['current', 'quick', 'netProfit', 'receivablesTurnover'],
};

const AMOUNTS: Paise[] = [2000000, 3000000, 4000000, 5000000, 6000000, 8000000, 10000000];

export interface EffectQuestion {
  kind: 'effect';
  id: string;
  ratio: RatioId;
  deal: DealId;
  x: Paise;
  prompt: string;
  options: Choice[];
  answer: 'up' | 'down' | 'same';
  why: string;
  after: RatioFigures;
}

/** What a transaction does to a ratio, on the figures given; null if no such question can be put on them. */
export function effectQuestion(f: RatioFigures, rng: Rng): EffectQuestion | null {
  for (let tries = 0; tries < 40; tries++) {
    const dealId = rng.pick(Object.keys(ASKED) as DealId[]);
    const ratio = rng.pick(ASKED[dealId]);
    const x = rng.pick(AMOUNTS);
    const deal = dealById(dealId);
    const after = applyDeal(f, deal, x);
    if (!after) continue;
    const before = linesOf(f);
    const next = linesOf(after);
    const m = movement(ratioDef(ratio), before, next);
    if (m === null) continue;
    const name = ratioDef(ratio).name;
    return {
      kind: 'effect',
      id: `effect:${dealId}:${ratio}:${x}`,
      ratio,
      deal: dealId,
      x,
      prompt: `The ${name.toLowerCase()} of ${f.company} is ${shown(ratioOf(ratioDef(ratio), before))}. The company ${deal.text(x)}. Will the ${name.toLowerCase()} increase, decrease or not change?`,
      options: EFFECT_OPTIONS,
      answer: m === 1 ? 'up' : m === -1 ? 'down' : 'same',
      why: `${deal.note(x)} ${effectWords(ratio, before, next)}`,
      after,
    };
  }
  return null;
}

export interface ComputeQuestion {
  kind: 'compute';
  id: string;
  ratio: RatioId;
  prompt: string;
  /** The right figure in hundredths, and exactly. */
  hundredths: number;
  exact: number;
  working: string;
  slips: { value: number; why: string }[];
}

/** Common slips on each ratio: the figure the slip gives, and what it is. */
function slipsOf(id: RatioId, l: Lines): { value: number | null; why: string }[] {
  const q = (n: number, d: number): number | null => (d === 0 ? null : n / d);
  const pct = (n: number, d: number): number | null => (d === 0 ? null : (n * 100) / d);
  const cl = l.currentLiabilities;
  const debt = l.longTermBorrowings + l.longTermProvisions;
  const avgInv = (l.openingInventories + l.inventories) / 2;
  const avgTr = (l.openingTradeReceivables + l.tradeReceivables) / 2;
  const avgTp = (l.openingTradePayables + l.tradePayables) / 2;
  const ce = l.shareholdersFunds + l.nonCurrentLiabilities;
  switch (id) {
    case 'current':
      return [{ value: q(cl, l.currentAssets), why: 'The ratio is upside down: current assets go on top.' }];
    case 'quick':
      return [
        { value: q(l.currentAssets - l.inventories, cl), why: 'Took out the inventories but left the prepaid expenses in the quick assets.' },
        { value: q(l.currentAssets, cl), why: 'Kept the inventories and the prepaid expenses in: that is the current ratio.' },
      ];
    case 'debtEquity':
      return [
        { value: q(debt, l.shareCapital), why: "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds." },
        { value: q(debt + cl, l.shareholdersFunds), why: 'Counted the current liabilities as debt; debt is long-term only.' },
        { value: q(l.shareholdersFunds, debt), why: 'The ratio is upside down: debt goes on top.' },
      ];
    case 'assetsToDebt':
      return [
        { value: q(l.nonCurrentAssets, debt), why: 'Used only the non-current assets as "total assets".' },
        { value: q(l.totalAssets, debt + cl), why: 'Divided by all the outside liabilities instead of the long-term debt.' },
      ];
    case 'proprietary':
      return [
        { value: q(l.totalAssets, l.shareholdersFunds), why: "The ratio is upside down: shareholders' funds go on top." },
        { value: q(l.shareholdersFunds, ce), why: 'Divided by capital employed; here the proprietary ratio is on total assets.' },
      ];
    case 'interestCoverage':
      return [
        { value: q(l.pat, l.financeCosts), why: 'Used the profit after tax; interest is paid out of the profit before interest and tax.' },
        { value: q(l.pbt, l.financeCosts), why: 'Used the profit before tax without adding the interest back.' },
      ];
    case 'inventoryTurnover':
      return [
        { value: q(l.costOfRevenue, l.inventories), why: 'Divided by the closing inventory instead of the average inventory.' },
        { value: q(l.revenue, avgInv), why: 'Used revenue from operations; inventory is at cost, so the cost of revenue from operations goes on top.' },
      ];
    case 'receivablesTurnover':
      return [
        { value: q(l.revenue, avgTr), why: 'Used the whole revenue; only credit revenue creates trade receivables.' },
        { value: q(l.creditRevenue, l.tradeReceivables), why: 'Divided by the closing trade receivables instead of the average.' },
      ];
    case 'payablesTurnover':
      return [
        { value: q(l.purchases, l.tradePayables), why: 'Divided by the closing trade payables instead of the average.' },
        { value: q(l.costOfRevenue, avgTp), why: 'Used the cost of revenue from operations instead of the net credit purchases.' },
      ];
    case 'workingCapitalTurnover':
      return [{ value: q(l.revenue, l.currentAssets), why: 'Divided by the current assets; working capital is current assets less current liabilities.' }];
    case 'grossProfit':
      return [{ value: pct(l.grossProfit, l.costOfRevenue), why: 'Worked the gross profit on cost; the ratio is on revenue from operations.' }];
    case 'operatingRatio':
      return [
        { value: pct(l.costOfRevenue, l.revenue), why: 'Left out the operating expenses.' },
        { value: pct(l.costOfRevenue + l.operatingExpenses + l.financeCosts, l.revenue), why: 'Counted the interest on borrowings as an operating expense; it is a finance cost.' },
      ];
    case 'operatingProfit':
      return [{ value: pct(l.pbit, l.revenue), why: 'Added the other income, which is non-operating.' }];
    case 'netProfit':
      return [{ value: pct(l.pbt, l.revenue), why: 'Used the profit before tax; this net profit ratio is on the profit after tax.' }];
    case 'roi':
      return [
        { value: pct(l.pat, ce), why: 'Used the profit after tax; capital employed earns the profit before interest and tax.' },
        { value: pct(l.pbit, l.shareholdersFunds), why: "Divided by the shareholders' funds alone; capital employed includes the non-current liabilities." },
      ];
  }
}

const COMPUTE_ASKED: RatioId[] = [
  'current',
  'quick',
  'debtEquity',
  'assetsToDebt',
  'proprietary',
  'interestCoverage',
  'inventoryTurnover',
  'receivablesTurnover',
  'payablesTurnover',
  'workingCapitalTurnover',
  'grossProfit',
  'operatingRatio',
  'operatingProfit',
  'netProfit',
  'roi',
];

/** A ratio to work out from the figures on screen; null if none can be worked out on them. */
export function computeQuestion(f: RatioFigures, rng: Rng): ComputeQuestion | null {
  const l = linesOf(f);
  const can = rng.shuffle(COMPUTE_ASKED).filter((id) => ratioOf(ratioDef(id), l).hundredths !== null);
  if (can.length === 0) return null;
  const id = can[0];
  const def = ratioDef(id);
  const v = ratioOf(def, l);
  const unit = def.unit === 'ratio' ? 'as x : 1 (type only x)' : def.unit === 'times' ? 'in times' : 'as a percentage (type only the number)';
  const slips = slipsOf(id, l)
    .filter((s): s is { value: number; why: string } => s.value !== null && Number.isFinite(s.value))
    .filter((s) => Math.abs(s.value - v.exact!) > 0.011);
  return {
    kind: 'compute',
    id: `compute:${id}`,
    ratio: id,
    prompt: `Work out the ${def.name.toLowerCase()} of ${f.company} from the statements, ${unit}, to two decimal places.`,
    hundredths: v.hundredths!,
    exact: v.exact!,
    working: `${def.formula}: ${plugged(v)}.`,
    slips,
  };
}

/** Reads a typed ratio: "2.5", "2.5 : 1", "2.5:1", "6.5 times", "17.33%", "−4". */
export function parseRatio(text: string): number | null {
  const t = text
    .toLowerCase()
    .replace(/−/g, '-')
    .replace(/times|%|\s/g, '')
    .replace(/:1$/, '');
  return /^-?\d+(\.\d+)?$/.test(t) || /^-?\.\d+$/.test(t) ? Number(t) : null;
}

export function markCompute(q: ComputeQuestion, typed: string): { right: boolean; why: string } {
  const read = parseRatio(typed);
  const unit = ratioDef(q.ratio).unit;
  if (read === null) return { right: false, why: 'Type a number, such as 2.5.' };
  // Right to two decimal places: the rounded figure, or anything within a hundredth of the exact one.
  if (Math.round(read * 100) === q.hundredths || Math.abs(read - q.exact) <= 0.01 + 1e-9) return { right: true, why: q.working };
  const slip = q.slips.find((s) => Math.abs(read - s.value) <= 0.01 + 1e-9);
  return { right: false, why: `${slip ? `${slip.why} ` : ''}The answer is ${showValue(unit, q.hundredths)}. ${q.working}` };
}

export const TERM_OPTIONS: Choice[] = [
  { id: 'quick', label: 'A quick asset' },
  { id: 'currentNotQuick', label: 'A current asset, not a quick asset' },
  { id: 'currentLiability', label: 'A current liability' },
  { id: 'debt', label: 'Debt (long-term)' },
  { id: 'equity', label: "Shareholders' funds" },
  { id: 'nonCurrentAsset', label: 'A non-current asset' },
];

type TermAnswer = 'quick' | 'currentNotQuick' | 'currentLiability' | 'debt' | 'equity' | 'nonCurrentAsset';

export const TERM_BANK: [item: string, answer: TermAnswer, why: string][] = [
  ['Inventories', 'currentNotQuick', 'A current asset, but it has to be sold before it turns into cash, so it is left out of the quick assets.'],
  ['Prepaid expenses', 'currentNotQuick', 'A current asset, but it will never turn into cash, so it is left out of the quick assets.'],
  ['Trade receivables', 'quick', 'Customers pay within the year: a current asset that is also a quick asset.'],
  ['Bills receivable', 'quick', 'Part of trade receivables: a quick asset.'],
  ['Cash at bank', 'quick', 'Cash and cash equivalents are the quickest asset of all.'],
  ['Marketable securities held as a current investment', 'quick', 'Current investments are quick assets: only inventories and prepaid expenses are left out.'],
  ['Bank overdraft', 'currentLiability', 'A short-term borrowing: a current liability.'],
  ['A bank loan repayable in six months', 'currentLiability', 'Due within a year: a short-term borrowing, so a current liability, not debt.'],
  ['The part of a long-term loan repayable within the next twelve months', 'currentLiability', 'Current maturities of long-term debt fall due within a year: they are shown among the current liabilities.'],
  ['Trade payables', 'currentLiability', 'Suppliers are paid within the year: a current liability.'],
  ['Outstanding salaries', 'currentLiability', 'An expense due and unpaid: a current liability (other current liabilities).'],
  ['Provision for tax', 'currentLiability', 'A short-term provision: a current liability.'],
  ['Debentures redeemable after five years', 'debt', 'A long-term borrowing: debt.'],
  ['A long-term bank loan', 'debt', 'A long-term borrowing: debt.'],
  ['Provision for employee benefits payable after a year', 'debt', 'A long-term provision: part of debt.'],
  ['Securities premium', 'equity', "Part of reserves and surplus: shareholders' funds."],
  ['General reserve', 'equity', "Part of reserves and surplus: shareholders' funds."],
  ['Surplus (balance in the Statement of Profit and Loss)', 'equity', "Part of reserves and surplus: shareholders' funds."],
  ['Equity share capital', 'equity', "The owners' capital: shareholders' funds."],
  ['Machinery', 'nonCurrentAsset', 'Property, plant and equipment: a non-current asset, in no liquidity ratio.'],
  ['Goodwill', 'nonCurrentAsset', 'An intangible asset: non-current.'],
  ['Investments held for the long term', 'nonCurrentAsset', 'Non-current investments are not current assets.'],
];

export interface TermQuestion {
  kind: 'term';
  id: string;
  item: string;
  prompt: string;
  options: Choice[];
  answer: TermAnswer;
  why: string;
}

export function termQuestion(rng: Rng): TermQuestion {
  const [item, answer, why] = rng.pick(TERM_BANK);
  return { kind: 'term', id: `term:${item}`, item, prompt: 'Where does this item go in the ratios?', options: TERM_OPTIONS, answer, why };
}


export type TryKind = 'effect' | 'compute' | 'term';
export const TRY_KINDS: TryKind[] = ['effect', 'compute', 'term'];

/** Where each kind's run of questions starts, for a seed: the same seed asks the same questions in the same order. */
export const trySeed = (seed: number, kind: TryKind): number => seed * 11 + TRY_KINDS.indexOf(kind) + 1;

export type RatioQuestion = (EffectQuestion | ComputeQuestion | TermQuestion) & { figures: RatioFigures };

/** The next question of a kind, with the figures it is asked on (a ready company or a made-up one). */
export function nextQuestion(kind: TryKind, rng: Rng): RatioQuestion {
  for (;;) {
    const figures = rng.next() < 0.4 ? rng.pick(EXAMPLES).figures : randomFigures(rng.int(1, 900_000));
    const q = kind === 'effect' ? effectQuestion(figures, rng) : kind === 'compute' ? computeQuestion(figures, rng) : termQuestion(rng);
    if (q) return { ...q, figures };
  }
}
