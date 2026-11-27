import type { KitAnswer, KitChoice } from '@/components/simulator/labs/kit/answers';
import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { fr, mul } from '../partnership/fraction';
import { randomInputs } from './examples';
import { FULL, type GwStage } from './steps';
import {
  adjustmentText, averageWorking, capitalisedWorking, capitalWorking, goodwillWorking, METHOD_NAME, normalWorking, remunerationWorking, superWorking, toPaise,
  totalAssetsOf, value, yearLabels, yearWorking, type GwAdjustment, type GwInputs, type GwMethod, type Valuation,
} from './valuation';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions on the picture of a valuation. The picture stands at `stage` while the question is open
// and moves on to `reveal` once it is answered. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

export const GW_ASK_KINDS = ['average', 'super', 'goodwill', 'adjust'] as const;
export type GwAskKind = (typeof GW_ASK_KINDS)[number];

export const GW_ASK_LABEL: Record<GwAskKind, string> = {
  average: 'The average profit',
  super: 'The super profit',
  goodwill: 'Goodwill by a method',
  adjust: 'Correcting a past profit',
};

export interface GwAsk {
  kind: GwAskKind;
  prompt: string;
  inputs: GwInputs;
  stage: GwStage;
  reveal: GwStage;
  answer: KitAnswer;
  /** The working, shown with the verdict. */
  reason: string;
}

const inr = formatINR;
const NONE: GwStage = { bars: true, adjusted: 0, weights: false, average: false, remuneration: false, capital: false, normal: false, super: false, capitalised: false, goodwill: false, justAdjusted: null };

/** Wrong figures a student is likely to give, each named; those equal to the answer, to each other, or not positive are dropped. */
function mistakesOf(answer: Paise, list: [Paise, string][]): { value: Paise; why: string }[] {
  const seen = new Set([answer]);
  const out: { value: Paise; why: string }[] = [];
  for (const [v, why] of list) {
    if (v > 0 && Number.isInteger(v) && !seen.has(v)) {
      seen.add(v);
      out.push({ value: v, why });
    }
  }
  return out;
}

/** The profits of the years, one after the other: "2022-23 ₹1,20,000; 2023-24 a loss of ₹20,000". */
const profitsText = (v: Valuation): string => v.years.map((y) => `${y.label} ${y.books < 0 ? `a loss of ${inr(-y.books)}` : inr(y.books)}`).join('; ');

function averagePrompt(v: Valuation): string {
  const i = v.inputs;
  const labels = yearLabels(i);
  const parts = [`${i.firm}: the profits of the last ${v.years.length} years (each ended 31 March) were ${profitsText(v)}.`];
  if (i.adjustments.length) parts.push(i.adjustments.map((a) => adjustmentText(a, labels, i.profits)).join(' '));
  if (i.averaging === 'weighted') parts.push(`The years are given weights of ${i.weights.join(', ')}, the latest year the highest.`);
  if (i.remuneration > 0) parts.push(`The profits are before a fair remuneration of ${inr(i.remuneration)} a year for the partners' work.`);
  parts.push(`What is the ${i.averaging === 'weighted' ? 'weighted average' : 'average'} profit${i.remuneration > 0 ? ' after the remuneration' : ''}?`);
  return parts.join(' ');
}

function averageAsk(rng: Rng): GwAsk {
  // At least one correction, a weighted average or a remuneration, so the question has a step to it.
  let inputs = randomInputs(rng);
  for (let t = 0; t < 20 && inputs.adjustments.length === 0 && inputs.averaging === 'simple' && inputs.remuneration === 0; t++) inputs = randomInputs(rng);
  const v = value(inputs);
  const k = v.years.length;
  const answer = toPaise(v.averageAfter);
  const books = v.years.reduce((s, y) => s + y.books * y.weight, 0);
  const rem = inputs.remuneration;
  const mistakes = mistakesOf(answer, [
    [inputs.adjustments.length ? Math.round(books / v.weightTotal) - rem : 0, 'Averaged the profits as the books show them: each year is corrected first.'],
    [inputs.averaging === 'weighted' ? Math.round(v.total / k) - rem : 0, 'Took the simple average and ignored the weights.'],
    [inputs.averaging === 'weighted' ? Math.round(v.products / k) - rem : 0, `Divided the total of the products by ${k}, the number of years, instead of by ${v.weightTotal}, the total of the weights.`],
    [rem > 0 ? toPaise(v.average) : 0, "Did not deduct the partners' remuneration."],
    [rem > 0 ? toPaise(v.average) + rem : 0, "Added the partners' remuneration instead of deducting it."],
    [inputs.averaging === 'weighted' ? v.products : v.total, 'Added up the years but did not divide.'],
  ]);
  return {
    kind: 'average',
    prompt: averagePrompt(v),
    inputs,
    stage: { ...NONE, adjusted: 99, weights: inputs.averaging === 'weighted' },
    reveal: { ...NONE, adjusted: 99, weights: inputs.averaging === 'weighted', average: true, remuneration: rem > 0 },
    answer: { type: 'number', value: answer, mistakes },
    reason: [...v.years.filter((y) => y.deltas.length).map(yearWorking), averageWorking(v), ...(rem > 0 ? [remunerationWorking(v)] : [])].join(' '),
  };
}

/** The capital employed as the books give it, in words. */
function booksText(i: GwInputs): string {
  const b = i.books;
  const out = [b.goodwill ? `goodwill ${inr(b.goodwill)}` : '', b.nonTrade ? `non-trade investments ${inr(b.nonTrade)}` : '', b.fictitious ? `deferred advertisement expenditure ${inr(b.fictitious)}` : ''].filter(Boolean);
  return out.length
    ? `The assets total ${inr(totalAssetsOf(b))}, of which ${out.join(' and ')} ${out.length > 1 ? 'are' : 'is'} not used in the business; the outside liabilities are ${inr(b.outside)}.`
    : `The assets, all used in the business, total ${inr(b.trade)}; the outside liabilities are ${inr(b.outside)}.`;
}

function superAsk(rng: Rng): GwAsk {
  const inputs = randomInputs(rng, rng.pick(['super', 'capSuper'] as const));
  const v = value(inputs);
  const answer = toPaise(v.superProfit);
  const avg = toPaise(v.averageAfter);
  const r = inputs.rate;
  const b = inputs.books;
  const mistakes = mistakesOf(answer, [
    [avg - (b.trade * r) / 100, 'Took the normal profit on the assets without deducting the outside liabilities.'],
    [avg - ((totalAssetsOf(b) - b.outside) * r) / 100, 'Left goodwill, non-trade investments or the fictitious asset inside the capital employed.'],
    [toPaise(v.normalProfit), 'Gave the normal profit: the super profit is what the average earns above it.'],
    [Math.round((avg * r) / 100), 'Took the rate on the average profit; the rate is applied to the capital employed.'],
    [avg, 'Gave the average profit itself.'],
  ]);
  return {
    kind: 'super',
    prompt: `${inputs.firm} earns an average profit of ${inr(avg)} a year (the line on the picture). ${booksText(inputs)} The normal rate of return in the trade is ${r}%. What is the super profit?`,
    inputs,
    stage: { ...FULL, capital: false, normal: false, super: false, capitalised: false, goodwill: false },
    reveal: { ...FULL, capitalised: false, goodwill: false },
    answer: { type: 'number', value: answer, mistakes },
    reason: [capitalWorking(v), normalWorking(v), superWorking(v)].join(' '),
  };
}

function goodwillAsk(rng: Rng): GwAsk {
  const method = rng.pick<GwMethod>(['average', 'super', 'capAverage', 'capSuper']);
  const inputs = randomInputs(rng, method);
  const v = value(inputs);
  const answer = toPaise(v.goodwill[method]);
  const avg = toPaise(v.averageAfter);
  const sp = toPaise(v.superProfit);
  const n = inputs.purchase;
  const r = inputs.rate;
  const nFr = fr(Math.round(n * 2), 2);
  const times = (p: Paise) => toPaise(mul(fr(p), nFr));
  const list: Record<GwMethod, [Paise, string][]> = {
    average: [
      [avg, "Stopped at the average profit and did not multiply by the years' purchase."],
      [avg * v.years.length, `Multiplied by ${v.years.length}, the number of years averaged, instead of the years' purchase.`],
    ],
    super: [
      [times(avg), 'Multiplied the whole average profit; only the super profit is multiplied.'],
      [sp, "Stopped at the super profit and did not multiply by the years' purchase."],
      [times(toPaise(v.normalProfit)), 'Multiplied the normal profit instead of the super profit.'],
    ],
    capAverage: [
      [toPaise(v.capitalisedValue), 'Gave the capitalised value and did not deduct the capital employed.'],
      [Math.round((avg * r) / 100), `Took ${r}% of the average profit; capitalising divides it by the rate (x 100 / ${r}).`],    ],
    capSuper: [
      [Math.round((sp * r) / 100), `Took ${r}% of the super profit; capitalising divides it by the rate (x 100 / ${r}).`],
      [sp, 'Stopped at the super profit and did not capitalise it.'],
      [toPaise(v.capitalisedValue), 'Capitalised the whole average profit and did not deduct the capital employed.'],
    ],
  };
  const needsN = method === 'average' || method === 'super';
  const given = method === 'average' ? '.' : ` on a capital employed of ${inr(v.capitalEmployed)}. The normal rate of return is ${r}%.`;
  const prompt = `${inputs.firm} earns an average profit of ${inr(avg)} a year${given} What is the goodwill by the ${METHOD_NAME[method].toLowerCase()}${needsN ? ` at ${n} years' purchase` : ''}?`;
  const work = [
    ...(method === 'average' ? [] : method === 'capAverage' ? [capitalisedWorking(v)] : [normalWorking(v), superWorking(v)]),
    goodwillWorking(v, method),
  ];
  return {
    kind: 'goodwill',
    prompt,
    inputs,
    stage: { ...FULL, capital: method !== 'average', normal: false, super: false, capitalised: false, goodwill: false },
    reveal: { ...FULL, capital: method !== 'average', normal: method === 'super' || method === 'capSuper', super: method === 'super' || method === 'capSuper', capitalised: method === 'capAverage' },
    answer: { type: 'number', value: answer, mistakes: mistakesOf(answer, list[method]) },
    reason: work.join(' '),
  };
}

function adjustAsk(rng: Rng): GwAsk {
  const base = randomInputs(rng);
  const k = base.profits.length;
  const kind = rng.pick(['abnormalLoss', 'abnormalGain', 'stockOver', 'stockUnder', 'omittedExpense', 'repairsCapitalised'] as const);
  // A year that made a profit (and, for a stock error, whose next year did too), so the options can speak of "the profit".
  const ok = (y: number) => base.profits[y] > 0 && (kind !== 'stockOver' && kind !== 'stockUnder' ? true : y + 1 < k && base.profits[y + 1] > 0);
  const years = kind === 'repairsCapitalised' ? [k - 1] : [...Array(k).keys()].filter(ok);
  const year = years.length ? rng.pick(years) : kind === 'stockOver' || kind === 'stockUnder' ? k - 2 : k - 1;
  const x = rng.step(10000, 40000, 5000);
  const a: GwAdjustment = kind === 'repairsCapitalised' ? { kind, year, amount: x * 100, rate: rng.pick([10, 20]) } : { kind, year, amount: x * 100 };
  const inputs: GwInputs = { ...base, adjustments: [a], averaging: 'simple', remuneration: 0 };
  const v = value(inputs);
  const labels = yearLabels(inputs);
  const y = labels[year];
  const next = labels[year + 1];
  const X = inr(a.amount);
  const d = inr(Math.round((a.amount * (a.rate ?? 0)) / 100));
  const options: Record<typeof kind, { right: string; wrong: [string, string][] }> = {
    abnormalLoss: {
      right: `Add ${X} to the profit of ${y}`,
      wrong: [
        [`Deduct ${X} from the profit of ${y}`, 'The loss has already reduced the profit; deducting it again doubles the effect.'],
        [`Leave the profit of ${y} as it is`, 'An abnormal loss makes that year look worse than normal, so it is added back.'],
        [`Add ${X} to ${y} and deduct ${X} from the next year`, 'Only a stock error moves two years; a loss by fire belongs to its own year.'],
      ],
    },
    abnormalGain: {
      right: `Deduct ${X} from the profit of ${y}`,
      wrong: [
        [`Add ${X} to the profit of ${y}`, 'The gain is already inside the profit; adding it doubles it.'],
        [`Leave the profit of ${y} as it is`, 'A gain that will not recur makes that year look better than normal, so it is taken out.'],
        [`Deduct ${X} from ${y} and add ${X} to the next year`, 'Only a stock error moves two years; this gain belongs to its own year.'],
      ],
    },
    stockOver: {
      right: `Deduct ${X} from ${y} and add ${X} to ${next}`,
      wrong: [
        [`Deduct ${X} from ${y} only`, 'The same stock opens the next year as a debit, so the next year was understated by as much.'],
        [`Add ${X} to ${y} and deduct ${X} from ${next}`, 'Took the effect the wrong way round: overvalued closing stock overstates the profit of its year.'],
        [`Deduct ${X} from both ${y} and ${next}`, 'The two years move in opposite directions: closing stock is a credit, opening stock a debit.'],
      ],
    },
    stockUnder: {
      right: `Add ${X} to ${y} and deduct ${X} from ${next}`,
      wrong: [
        [`Add ${X} to ${y} only`, 'The same stock opens the next year as a debit, so the next year was overstated by as much.'],
        [`Deduct ${X} from ${y} and add ${X} to ${next}`, 'Took the effect the wrong way round: undervalued closing stock understates the profit of its year.'],
        [`Add ${X} to both ${y} and ${next}`, 'The two years move in opposite directions: closing stock is a credit, opening stock a debit.'],
      ],
    },
    omittedExpense: {
      right: `Deduct ${X} from the profit of ${y}`,
      wrong: [
        [`Add ${X} to the profit of ${y}`, 'An expense left out made the profit too high; charging it lowers the profit.'],
        [`Leave the profit of ${y} as it is`, 'The rent was an expense of the year: the profit is overstated without it.'],
        [`Deduct ${X} from every year`, 'The rent left out belongs to one year only.'],
      ],
    },
    repairsCapitalised: {
      right: `Deduct ${X} and add back ${d} in ${y}`,
      wrong: [
        [`Deduct ${X} only in ${y}`, 'The depreciation wrongly charged on the repairs also reduced the profit; it is added back.'],
        [`Add ${X} to the profit of ${y}`, 'The repairs were left out of the expenses, so the profit is too high: they are charged, not added.'],
        [`Deduct ${X} and deduct ${d} as well in ${y}`, 'The depreciation was charged on an amount that is not an asset; it is added back, not charged again.'],
      ],
    },
  };
  const o = options[kind];
  const choices: KitChoice[] = rng.shuffle([{ id: 'right', text: o.right }, ...o.wrong.map(([text, why], i) => ({ id: `w${i}`, text, why }))]);
  return {
    kind: 'adjust',
    prompt: `${inputs.firm} is finding the normal profits of its last ${k} years before valuing goodwill. ${adjustmentText(a, labels, inputs.profits)} How are the profits corrected?`,
    inputs,
    stage: NONE,
    reveal: { ...NONE, adjusted: 1, justAdjusted: 0 },
    answer: { type: 'choice', options: choices, correct: 'right' },
    reason: v.years.filter((r) => r.deltas.length).map(yearWorking).join(' '),
  };
}

export function gwAsk(kind: GwAskKind, rng: Rng): GwAsk {
  if (kind === 'average') return averageAsk(rng);
  if (kind === 'super') return superAsk(rng);
  if (kind === 'goodwill') return goodwillAsk(rng);
  return adjustAsk(rng);
}

/** The made-up figures of the `n`th question of a kind, from a seed: the screen and the tests draw the same. */
export const askRng = (seed: number, kind: GwAskKind, n: number): Rng => createRng(seed * 1013 + GW_ASK_KINDS.indexOf(kind) * 137 + n);

