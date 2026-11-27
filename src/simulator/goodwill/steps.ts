import { formatINR } from '@/engine/money';
import { cmp, ZERO } from '../partnership/fraction';
import {
  adjustmentText, averageWorking, capitalisedWorking, capitalWorking, goodwillWorking, METHOD_NAME, normalWorking, remunerationWorking, show, superWorking, yearWorking,
  type GwMethod, type Valuation,
} from './valuation';

// ---------------------------------------------------------------------------------------------------------------
// The walk-through of a valuation: what the picture shows after each step, and what each step says. The picture is
// the past profits as bars, corrected piece by piece, the average drawn across them, the normal profit under it and
// the super profit between the two, and last the goodwill by the method chosen.
// ---------------------------------------------------------------------------------------------------------------

export type GwStepKind = 'books' | 'adjust' | 'weights' | 'average' | 'remuneration' | 'capital' | 'normal' | 'super' | 'capitalised' | 'goodwill';

export interface GwStep {
  kind: GwStepKind;
  /** For an `adjust` step: which adjustment. */
  adjustment?: number;
  title: string;
  text: string;
}

/** What the picture holds after some steps. */
export interface GwStage {
  /** Bars drawn at all. */
  bars: boolean;
  /** How many adjustments have been made. */
  adjusted: number;
  weights: boolean;
  average: boolean;
  remuneration: boolean;
  capital: boolean;
  normal: boolean;
  super: boolean;
  capitalised: boolean;
  goodwill: boolean;
  /** The adjustment made in the last step shown, to draw out. */
  justAdjusted: number | null;
}

/** The steps a method needs after the average: the capital employed and what follows from it. */
const tail = (m: GwMethod): GwStepKind[] =>
  m === 'average' ? ['goodwill'] : m === 'capAverage' ? ['capital', 'capitalised', 'goodwill'] : ['capital', 'normal', 'super', 'goodwill'];

export function stepsOf(v: Valuation): GwStep[] {
  const i = v.inputs;
  const labels = v.years.map((y) => y.label);
  const out: GwStep[] = [];
  const k = v.years.length;
  const losses = v.years.filter((y) => y.books < 0).length;
  out.push({
    kind: 'books',
    title: 'The profits as the books show them',
    text: `${i.firm}: the results of the last ${k} years (each ended 31 March), ${v.years.map((y) => `${y.label} ${y.books < 0 ? `a loss of ${formatINR(-y.books)}` : formatINR(y.books)}`).join(', ')}.${losses ? ' A loss stands below the line and is deducted when the profits are added.' : ''} Goodwill is about the profit the firm can keep on earning, so first each year is brought to its normal profit.`,
  });
  i.adjustments.forEach((a, n) => {
    const touched = v.years.filter((y) => y.deltas.some((d) => d.from === n));
    const why: Record<typeof a.kind, string> = {
      abnormalLoss: 'It will not happen again, so it is added back.',
      abnormalGain: 'It will not recur, so it is taken out.',
      stockOver: 'Closing stock is credited in the Trading Account, so its year was overstated; it opens the next year as a debit, so that year was understated.',
      stockUnder: 'Closing stock is credited in the Trading Account, so its year was understated; it opens the next year as a debit, so that year was overstated.',
      omittedExpense: 'An expense of the year that was left out is charged now.',
      repairsCapitalised: 'Repairs are a revenue expense: they are charged, and the depreciation wrongly charged on them is added back.',
    };
    out.push({
      kind: 'adjust',
      adjustment: n,
      title: `Correction ${n + 1}: ${adjustmentText(a, labels, i.profits).replace(/\.$/, '')}`,
      text: `${why[a.kind]} ${touched.map((y) => yearWorking({ ...y, deltas: y.deltas.filter((d) => d.from <= n), normal: y.books + y.deltas.filter((d) => d.from <= n).reduce((s, d) => s + d.by, 0) })).join(' ')}`,
    });
  });
  if (i.averaging === 'weighted') {
    out.push({
      kind: 'weights',
      title: 'Weights for the years',
      text: `The profits show a ${v.years[k - 1].normal >= v.years[0].normal ? 'rising' : 'falling'} trend, so the latest years say more about the future: each year's normal profit is multiplied by its weight (${v.years.map((y) => y.weight).join(', ')}${v.years.every((y, n) => n === 0 || y.weight > v.years[n - 1].weight) ? ', the latest the highest' : ''}). Products: ${v.years.map((y) => `${formatINR(y.normal)} x ${y.weight}`).join(' + ')} = ${formatINR(v.products)}.`,
    });
  }
  out.push({
    kind: 'average',
    title: i.averaging === 'weighted' ? 'The weighted average profit' : 'The average profit',
    text: `${averageWorking(v)} ${i.averaging === 'weighted' ? 'Divided by the total of the weights, never by the number of years.' : 'One line across the bars: what the firm earns in a normal year.'}`,
  });
  if (i.remuneration > 0) {
    out.push({
      kind: 'remuneration',
      title: "Less the partners' remuneration",
      text: `The profits were arrived at without paying for the partners' work; a new owner would have to pay someone ${formatINR(i.remuneration)} a year for it. ${remunerationWorking(v)}`,
    });
  }
  for (const kind of tail(i.method)) {
    if (kind === 'capital') {
      out.push({ kind, title: 'The capital employed', text: `${capitalWorking(v)} Goodwill, non-trade investments and fictitious assets are left out: they are not at work in the business.` });
    } else if (kind === 'normal') {
      out.push({ kind, title: 'The normal profit', text: `${normalWorking(v)} This is what a firm of the same trade earns on the same capital, with no reputation of its own.` });
    } else if (kind === 'super') {
      const above = cmp(v.superProfit, ZERO) > 0;
      out.push({
        kind,
        title: 'The super profit',
        text: `${superWorking(v)} ${above ? 'Only the part of the average above the normal profit is due to goodwill.' : 'The average does not reach the normal profit: nothing is earned above it.'}`,
      });
    } else if (kind === 'capitalised') {
      out.push({ kind, title: 'The capitalised value', text: `${capitalisedWorking(v)} This is the capital that would earn the average profit at the normal rate.` });
    } else {
      out.push({ kind, title: `Goodwill: ${METHOD_NAME[i.method].toLowerCase()}`, text: `${goodwillWorking(v, i.method)}${goodwillNote(v, i.method)}` });
    }
  }
  return out;
}

function goodwillNote(v: Valuation, m: GwMethod): string {
  const nil = cmp(v.raw[m], ZERO) <= 0;
  if (nil) return '';
  if (m === 'average') return " The years' purchase is the number of years the firm is expected to go on earning this profit because of its past effort.";
  if (m === 'super') return ` That is ${show(v.superProfit)} for each of ${v.inputs.purchase} years.`;
  if (m === 'capAverage') return ' The same goodwill comes from capitalising the super profit.';
  return ' The same goodwill comes from the capitalised value of the average profit less the capital employed.';
}

/** What the picture holds after `shown` steps. */
export function stageOf(steps: readonly GwStep[], shown: number): GwStage {
  const played = steps.slice(0, Math.max(0, Math.min(shown, steps.length)));
  const has = (k: GwStepKind) => played.some((s) => s.kind === k);
  const last = played.at(-1);
  return {
    bars: has('books'),
    adjusted: played.filter((s) => s.kind === 'adjust').length,
    weights: has('weights'),
    average: has('average'),
    remuneration: has('remuneration'),
    capital: has('capital'),
    normal: has('normal'),
    super: has('super'),
    capitalised: has('capitalised'),
    goodwill: has('goodwill'),
    justAdjusted: last?.kind === 'adjust' ? last.adjustment! : null,
  };
}

/** The whole picture: every step played. */
export const FULL: GwStage = { bars: true, adjusted: 99, weights: true, average: true, remuneration: true, capital: true, normal: true, super: true, capitalised: true, goodwill: true, justAdjusted: null };

/** In Play every part of the picture is shown that the method uses. */
export function playStage(v: Valuation): GwStage {
  const m = v.inputs.method;
  return {
    ...FULL,
    weights: v.inputs.averaging === 'weighted',
    remuneration: v.inputs.remuneration > 0,
    normal: m === 'super' || m === 'capSuper',
    super: m === 'super' || m === 'capSuper',
    capital: m !== 'average',
    capitalised: m === 'capAverage',
  };
}
