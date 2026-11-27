// The walk-through of the ratio lab, and the words for what a transaction does to a ratio.

import { formatINR, type Paise } from '@/engine/money';
import { applyDeal, dealById, type DealId } from './deals';
import { decimal, linesOf, movement, plugged, RATIOS, ratioDef, ratioOf, shown, termWords, type Lines, type RatioFigures, type RatioId, type RatioValue } from './model';

export interface RatioStep {
  headline: string;
  text: string;
  /** The ratio the step is about: its dial is shown large and its terms are marked in the statements. */
  focus: RatioId | null;
  /** The figures after the step. */
  figures: RatioFigures;
  /** The figures before it, when the step is a transaction (the dials show the change). */
  before?: RatioFigures;
}

/** What a ratio says, in plain words, on these figures. */
export function meaning(v: RatioValue): string {
  if (v.hundredths === null || v.exact === null) return v.reason ?? '';
  const x = decimal(v.hundredths);
  const per100 = (left: string, after: string) =>
    v.hundredths! < 0 ? `There is a loss of ₹${decimal(-v.hundredths!)} on every ₹100 of revenue ${after}.` : `₹${x} of every ₹100 of revenue ${left}.`;
  const days = (exact: number) => Math.round(360 / exact);
  switch (v.def.id) {
    case 'current':
      return `There is ₹${x} of current assets for every ₹1 of current liabilities.`;
    case 'quick':
      return `Even without selling any inventory, there is ₹${x} of quick assets for every ₹1 due within a year.`;
    case 'debtEquity':
      return `Long-term lenders have put in ₹${x} for every ₹1 of the owners' funds. The lower it is, the safer the lenders.`;
    case 'assetsToDebt':
      return `Every ₹1 of long-term debt is covered by ₹${x} of assets.`;
    case 'proprietary':
      return `The owners have financed ${decimal(Math.round(v.exact * 10000))}% of the assets; outsiders the rest.`;
    case 'interestCoverage':
      return v.exact <= 0
        ? `There is no profit before interest and tax at all: nothing covers the year's interest.`
        : v.exact < 1
        ? `The profit before interest and tax does not cover even one year's interest: it is only ${x} times the interest.`
        : `The profit before interest and tax could pay the year's interest ${x} times over.`;
    case 'inventoryTurnover':
      return `The inventory was sold and replaced ${x} times during the year.`;
    case 'receivablesTurnover':
      return `Credit revenue is ${x} times the average trade receivables: with a 360-day year, customers take about ${days(v.exact)} days to pay.`;
    case 'payablesTurnover':
      return `Credit purchases are ${x} times the average trade payables: with a 360-day year, suppliers are paid in about ${days(v.exact)} days.`;
    case 'workingCapitalTurnover':
      return `Each ₹1 of working capital supported ₹${x} of revenue from operations.`;
    case 'grossProfit':
      return per100('is left after the cost of the goods sold', 'after the cost of the goods sold');
    case 'operatingRatio':
      return `₹${x} of every ₹100 of revenue goes on the cost of the goods sold and the operating expenses.`;
    case 'operatingProfit':
      return per100('is left as operating profit', 'after the cost of the goods sold and the operating expenses');
    case 'netProfit':
      return per100('is left after every expense and tax', 'after every expense');
    case 'roi':
      return v.hundredths < 0 ? `The capital employed lost ₹${decimal(-v.hundredths)} on every ₹100 before interest and tax.` : `Every ₹100 of capital employed earned ₹${x} before interest and tax.`;
  }
}

/** Whether the name of a term is plural ("Current assets fall") or singular ("Debt falls", "Revenue from operations rises"). */
const plural = (name: string): boolean => /(assets|liabilities|funds|receivables|payables|purchases)$/i.test(name);
const moveWords = (name: string, d: Paise): string =>
  d === 0 ? `${name}: no change` : `${name} ${d > 0 ? 'rise' : 'fall'}${plural(name) ? '' : 's'} by ${formatINR(Math.abs(d))}`;

/** Why a ratio moved (or did not) between two sets of figures: what each term did, and the verdict with the figures. */
export function effectWords(id: RatioId, before: Lines, after: Lines): string {
  const def = ratioDef(id);
  const a = ratioOf(def, before);
  const b = ratioOf(def, after);
  if (a.hundredths === null || b.hundredths === null) return `${def.name}: ${b.reason ?? a.reason}`;
  const dTop = b.top.value - a.top.value;
  const dBottom = b.bottom.value - a.bottom.value;
  const terms = dTop === 0 && dBottom === 0 ? `Neither ${a.top.name.toLowerCase()} nor ${a.bottom.name.toLowerCase()} change${plural(a.bottom.name) ? '' : 's'}` : `${moveWords(cap(a.top.name), dTop)}; ${moveWords(a.bottom.name.toLowerCase(), dBottom)}`;
  const m = movement(def, before, after);
  let rule = '';
  if (dTop !== 0 && dTop === dBottom && def.unit === 'ratio') {
    const where = a.exact! > 1 ? 'above' : a.exact! < 1 ? 'below' : 'exactly at';
    rule = ` The ratio was ${where} 1 : 1, and ${dTop > 0 ? 'adding the same amount to' : 'taking the same amount from'} both terms ${m === 1 ? 'raises' : m === -1 ? 'lowers' : 'leaves'} it${m === 0 ? ' as it was' : ''}.`;
  }
  const verdict = m === 0 ? `It stays at ${shown(a)}.` : `It ${m === 1 ? 'rises' : 'falls'} from ${shown(a)} to ${shown(b)}${shown(a) === shown(b) ? ' (a change beyond the second decimal place)' : ''}.`;
  return `${terms}.${rule} ${verdict}`;
}

const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** The transactions the walk-through ends with, and the ratio each one is watched on. */
export const WATCH_DEALS: { deal: DealId; x: Paise; focus: RatioId }[] = [
  { deal: 'payCreditors', x: 6000000, focus: 'current' },
  { deal: 'creditPurchase', x: 12000000, focus: 'current' },
  { deal: 'issueDebentures', x: 20000000, focus: 'debtEquity' },
];

export function watchSteps(start: RatioFigures): RatioStep[] {
  const l = linesOf(start);
  const steps: RatioStep[] = [
    {
      headline: `The figures of ${start.company}`,
      text: `The balance sheet at the end of the year and the statement of profit and loss for the year, in brief. Every ratio on the dials is worked out from these figures.`,
      focus: null,
      figures: start,
    },
  ];
  for (const def of RATIOS) {
    const v = ratioOf(def, l);
    steps.push({
      headline: `${def.name}: ${shown(v)}`,
      text: `${def.formula}. ${v.top.name}: ${termWords(v.top, l)}. ${v.bottom.name}: ${termWords(v.bottom, l)}. ${plugged(v)}. ${meaning(v)}`,
      focus: def.id,
      figures: start,
    });
  }
  let now = start;
  for (const w of WATCH_DEALS) {
    const deal = dealById(w.deal);
    const next = applyDeal(now, deal, w.x);
    if (!next) throw new Error(`The walk-through cannot play ${w.deal}`);
    const before = linesOf(now);
    const after = linesOf(next);
    const v = ratioOf(ratioDef(w.focus), after);
    steps.push({
      headline: `The company ${deal.text(w.x)}: the ${ratioDef(w.focus).name.toLowerCase()} is now ${shown(v)}`,
      text: `${deal.note(w.x)} ${effectWords(w.focus, before, after)}`,
      focus: w.focus,
      figures: next,
      before: now,
    });
    now = next;
  }
  return steps;
}

