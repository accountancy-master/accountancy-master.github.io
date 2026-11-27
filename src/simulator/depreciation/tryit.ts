import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { randomInputs, randomSale } from './examples';
import { schedule, toRupee, type DepInputs } from './schedule';
import { assetAccount, DEPRECIATION, PROFIT_AND_LOSS, PROVISION } from './story';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions asked on the picture. The picture stands at `shown` events while the question is open,
// and moves on to `reveal` once it is answered. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

const inr = formatINR;

export interface Choice {
  id: string;
  text: string;
  /** Why this option is wrong. */
  why?: string;
}

export type Answer =
  | { type: 'number'; value: Paise; mistakes: { value: Paise; why: string }[] }
  | { type: 'choice'; options: Choice[]; correct: string };

export interface DepAsk {
  kind: DepAskKind;
  prompt: string;
  inputs: DepInputs;
  shown: number;
  reveal: number;
  answer: Answer;
  /** The working, shown with the verdict. */
  reason: string;
}

export const DEP_ASK_KINDS = ['next-charge', 'book-value', 'sale-result', 'which-account'] as const;
export type DepAskKind = (typeof DEP_ASK_KINDS)[number];

export const DEP_ASK_LABEL: Record<DepAskKind, string> = {
  'next-charge': "Next year's depreciation",
  'book-value': 'Book value at the year end',
  'sale-result': 'Profit or loss on sale',
  'which-account': 'Which account is credited',
};

/** Wrong figures a student is likely to give, each named; those equal to the answer or to each other are dropped. */
function mistakesOf(answer: Paise, list: [Paise, string][]): { value: Paise; why: string }[] {
  const seen = new Set([answer]);
  const out: { value: Paise; why: string }[] = [];
  for (const [value, why] of list) {
    if (value > 0 && !seen.has(value)) {
      seen.add(value);
      out.push({ value, why });
    }
  }
  return out;
}

/** A row from the second on (so there is a history on the picture) or the first if it is a part year. */
function pickRow(rng: Rng, i: DepInputs): number {
  const s = schedule(i);
  const rows = s.rows.filter((r) => r.charge > 0).map((r) => r.index);
  const choices = rows.filter((r) => r >= 1 && r <= 3);
  if (i.purchaseMonth > 0 && rng.int(0, 2) === 0) return 0;
  return choices.length > 0 ? rng.pick(choices) : rows[0];
}

const methodWords = (i: DepInputs): string =>
  i.method === 'wdv'
    ? `at ${i.rate}% a year by the written down value method`
    : i.slmBasis === 'rate'
      ? `at ${i.rate}% a year on the original cost by the straight line method`
      : `by the straight line method, useful life ${i.life} years, scrap value ${inr(i.scrap)}`;

export function depAsk(kind: DepAskKind, rng: Rng): DepAsk {
  if (kind === 'sale-result') return saleAsk(rng);
  const inputs = randomInputs(rng);
  const s = schedule(inputs);
  const r = s.rows[pickRow(rng, inputs)];
  const A = assetAccount(s);
  const shown = r.index + 1;
  const reveal = r.index + 2;
  if (kind === 'which-account') {
    const right = inputs.provision ? PROVISION : A;
    const options: Choice[] = [
      { id: 'asset', text: A, why: inputs.provision ? `With a provision kept, ${A} stays at cost; the depreciation collects in ${PROVISION}.` : undefined },
      { id: 'provision', text: PROVISION, why: inputs.provision ? undefined : `No provision account is kept here, so the depreciation is written off ${A} itself.` },
      { id: 'depreciation', text: DEPRECIATION, why: `${DEPRECIATION} is debited: depreciation is an expense.` },
      { id: 'pl', text: PROFIT_AND_LOSS, why: `${PROFIT_AND_LOSS} is debited when depreciation is closed at the year end; it is not credited.` },
    ];
    return {
      kind,
      prompt: `${inputs.provision ? 'A Provision for Depreciation account is kept' : 'No provision account is kept: depreciation is written off the asset'}. On ${r.to} the depreciation of ${inr(r.charge)} for ${r.label} is recorded. Which account is credited?`,
      inputs,
      shown,
      reveal,
      answer: { type: 'choice', options, correct: inputs.provision ? 'provision' : 'asset' },
      reason: `Depreciation A/c Dr ${inr(r.charge)}; To ${right} ${inr(r.charge)}. ${inputs.provision ? `${A} stays at its cost of ${inr(s.cost)}; the book value is cost less provision.` : `${A} falls to the book value, ${inr(r.closing)}.`}`,
    };
  }
  const full = r.months === 12;
  const fullCharge = inputs.method === 'wdv' ? toRupee((r.opening * inputs.rate) / 100) : s.annual;
  const onCost = toRupee((s.cost * inputs.rate * r.months) / 1200);
  const noScrap = inputs.method === 'slm' && inputs.slmBasis === 'life' ? toRupee(((s.cost / inputs.life) * r.months) / 12) : 0;
  if (kind === 'next-charge') {
    const mistakes = mistakesOf(r.charge, [
      [inputs.method === 'wdv' ? onCost : 0, 'Applied the rate to the original cost: under the written down value method it is applied to the opening book value of the year.'],
      [noScrap, 'Divided the whole cost by the life: the scrap value is deducted first.'],
      [full ? 0 : fullCharge, `Charged a full year: the asset was used for only ${r.months} months of this year.`],
      [inputs.method === 'wdv' ? toRupee((s.cost * inputs.rate) / 100) : 0, 'Took the rate on the original cost for a full year: under the written down value method the charge is on the opening book value, and it falls every year.'],
      [inputs.method === 'slm' && inputs.slmBasis === 'rate' ? toRupee((r.opening * inputs.rate * r.months) / 1200) : 0, 'Applied the rate to the book value: under the straight line method it is applied to the original cost, the same amount every full year.'],
    ]);
    return {
      kind,
      prompt: `${s.info.item[0].toUpperCase()}${s.info.item.slice(1)} was bought on ${s.purchaseDate} at a cost of ${inr(s.cost)}, depreciated ${methodWords(inputs)}. What is the depreciation for ${r.label} (${r.from} to ${r.to})?`,
      inputs,
      shown,
      reveal,
      answer: { type: 'number', value: r.charge, mistakes },
      reason: r.working,
    };
  }
  // book-value
  const used = s.rows.slice(0, r.index + 1).reduce((t, x) => t + x.months, 0);
  const mistakes = mistakesOf(r.closing, [
    [s.cost - r.charge, 'Took off only this year\'s depreciation: the book value is the cost less all the depreciation charged so far.'],
    [r.opening, r.index === 0 ? 'Gave the cost: the depreciation from the date of purchase to the year end comes off it.' : 'Gave the book value at the start of the year, before this year\'s depreciation.'],
    [inputs.method === 'wdv' && r.index > 0 ? s.cost - toRupee((s.cost * inputs.rate * used) / 1200) : 0, 'Charged the rate on the original cost every year: under the written down value method it is on the opening book value.'],
    [r.writtenAfter, 'Gave the depreciation written off so far, not what is left of the cost.'],
  ]);
  return {
    kind,
    prompt: `${s.info.item[0].toUpperCase()}${s.info.item.slice(1)} was bought on ${s.purchaseDate} at a cost of ${inr(s.cost)}, depreciated ${methodWords(inputs)}. What is its book value on ${r.to}?`,
    inputs,
    shown,
    reveal,
    answer: { type: 'number', value: r.closing, mistakes },
    reason: `${r.index === 0 ? `Cost on ${r.from}` : `Book value at the start of ${r.label}`}: ${inr(r.opening)}. ${r.working} Book value on ${r.to}: ${inr(r.opening)} - ${inr(r.charge)} = ${inr(r.closing)}.`,
  };
}

function saleAsk(rng: Rng): DepAsk {
  const inputs = randomSale(rng);
  const s = schedule(inputs);
  const sale = s.sale!;
  const last = s.rows.at(-1)!;
  const name = (x: Paise) => (x > 0 ? `Profit of ${inr(x)}` : x < 0 ? `Loss of ${inr(-x)}` : 'No profit and no loss');
  const right = name(sale.result);
  const wrong: [string, string][] = [
    [name(-sale.result), sale.result < 0 ? 'The price is below the book value, so the business got less than the asset stood at: a loss.' : 'The price is above the book value, so the business got more than the asset stood at: a profit.'],
    [name(sale.price - s.cost), 'Compared the price with the original cost: it is compared with the book value on the date of sale.'],
    [name(sale.price - last.opening), `Left out the depreciation of ${inr(last.charge)} for the ${last.months} months of the year of sale.`],
    [name(sale.price - (last.opening - (inputs.method === 'wdv' ? toRupee((last.opening * inputs.rate) / 100) : Math.min(s.annual, last.opening - (inputs.slmBasis === 'life' ? inputs.scrap : 0))))), 'Charged a full year in the year of sale: depreciation runs only up to the date of sale.'],
  ];
  const options: Choice[] = [{ id: 'right', text: right }];
  for (const [text, why] of wrong) if (!options.some((o) => o.text === text)) options.push({ id: `w${options.length}`, text, why });
  const shuffled = rng.shuffle(options.slice(0, 4));
  return {
    kind: 'sale-result',
    prompt: `${s.info.item[0].toUpperCase()}${s.info.item.slice(1)} bought on ${s.purchaseDate} at a cost of ${inr(s.cost)}, depreciated ${methodWords(inputs)}, is sold on ${sale.date} for ${inr(sale.price)}. What is the result of the sale?`,
    inputs,
    shown: s.rows.length + 1,
    reveal: s.rows.length + 2,
    answer: { type: 'choice', options: shuffled, correct: 'right' },
    reason: `Depreciation written off up to ${sale.date}: ${inr(sale.written)} (${last.working.replace(/\.$/, '')} in the year of sale). Book value = ${inr(s.cost)} - ${inr(sale.written)} = ${inr(sale.bookValue)}. Price ${inr(sale.price)} - book value ${inr(sale.bookValue)}: ${right.toLowerCase()}.`,
  };
}

/** The made-up figures of the `n`th question of a kind, from a seed: the screen and the tests draw the same. */
export const askRng = (seed: number, kind: DepAskKind, n: number): Rng => createRng(seed * 1009 + DEP_ASK_KINDS.indexOf(kind) * 131 + n);
