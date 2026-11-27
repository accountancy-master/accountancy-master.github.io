import type { KitAsk, KitChoice } from '@/components/simulator/labs/kit/answers';
import { createRng, type Rng } from '@/engine/rng';
import type { Paise } from '@/engine/money';
import { EXAMPLES, randomInputs } from './examples';
import { drawingsOf, endOf, GOODS_TAKEN, inr, resultOf, startOf, yearOf, type Inputs } from './model';
import { upTo, walkOf } from './walk';

// ---------------------------------------------------------------------------------------------------------------
// "Try it": quick questions on the picture. It stands at `shown` steps of the walk while a question is open and
// moves on to `reveal` once it is answered. Nothing is recorded.
// ---------------------------------------------------------------------------------------------------------------

export const IR_ASK_KINDS = ['capital', 'profit', 'net', 'where'] as const;
export type IrAskKind = (typeof IR_ASK_KINDS)[number];
export const IR_ASK_LABEL: Record<IrAskKind, string> = {
  capital: 'Capital on a date',
  profit: 'Profit or loss',
  net: 'Net profit after adjustments',
  where: 'Where does it go?',
};

export interface IrAsk extends KitAsk {
  kind: IrAskKind;
  inputs: Inputs;
  shown: number;
  reveal: number;
}

export const askRng = (seed: number, kind: IrAskKind, n: number): Rng => createRng(seed * 6007 + IR_ASK_KINDS.indexOf(kind) * 99991 + n * 37);

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

const PROFIT_TAG = (x: Paise) => ({
  label: 'A profit or a loss?',
  options: [
    { id: 'profit', text: 'Profit', why: 'The adjusted closing capital is below the opening capital: a loss.' },
    { id: 'loss', text: 'Loss', why: 'The adjusted closing capital is above the opening capital: a profit.' },
  ],
  correct: x >= 0 ? 'profit' : 'loss',
});

const NET_TAG = (x: Paise) => ({
  label: 'A net profit or a net loss?',
  options: [
    { id: 'profit', text: 'Net profit', why: 'After the adjustments the result is below nil: a net loss.' },
    { id: 'loss', text: 'Net loss', why: 'After the adjustments the result is above nil: a net profit.' },
  ],
  correct: x >= 0 ? 'profit' : 'loss',
});

export function irAsk(kind: IrAskKind, rng: Rng): IrAsk {
  if (kind === 'where') return where(rng);
  const i = randomInputs(rng);
  const r = resultOf(i);
  const walk = walkOf(i);
  if (kind === 'capital') {
    const closing = rng.next() < 0.6;
    const k = closing ? 1 : 0;
    const date = closing ? endOf(i) : startOf(i);
    const priv = i.privates[0];
    const od = i.items.find((x) => x.id === 'overdraft' && x[closing ? 'close' : 'open'] > 0);
    const biggest = i.items.filter((x) => x.side === 'liability').reduce((b, x) => (x[closing ? 'close' : 'open'] > b ? x[closing ? 'close' : 'open'] : b), 0);
    return {
      kind,
      inputs: i,
      prompt: `${i.owner} keeps incomplete records of ${i.shop}. Its assets and liabilities on ${date} are shown in the picture.${priv ? ` Also told: ${priv.label} (${priv.owned ? 'worth' : 'owing'} ${inr(priv.amount)}).` : ''} What is the capital of the business on ${date}?`,
      answer: {
        type: 'number',
        value: r.capital[k],
        mistakes: mistakesOf(r.capital[k], [
          [r.assets[k] + r.liabilities[k], 'Added the liabilities to the assets instead of deducting them.'],
          [r.assets[k], 'Gave the total of the assets and left out the liabilities.'],
          ...(priv ? [[priv.owned ? r.capital[k] + priv.amount : r.capital[k] - priv.amount, `Took in ${priv.label.toLowerCase()}: it is the proprietor's own, not the business's.`] as [Paise, string]] : []),
          ...(od ? [[r.capital[k] + 2 * od[closing ? 'close' : 'open'], 'Counted the bank overdraft as an asset: it is money owed to the bank.'] as [Paise, string]] : []),
          [r.capital[k] + 2 * biggest, 'Counted a liability as an asset.'],
        ]),
      },
      reason: `Capital = business assets - business liabilities = ${inr(r.assets[k])} - ${inr(r.liabilities[k])} = ${inr(r.capital[k])}${priv ? `; ${priv.label.toLowerCase()} stays out` : ''}.`,
      shown: upTo(walk, closing ? 'close-liabilities' : 'open-liabilities'),
      reveal: upTo(walk, closing ? 'close-capital' : 'open-capital'),
    };
  }
  if (kind === 'profit') {
    const d = i.drawings;
    const monthlyOnce = d.monthly ? r.drawings - d.cash * 11 : 0;
    const salePrice = d.goodsCost ? r.drawings - d.goodsCost + d.goodsPrice : 0;
    const x = r.before;
    return {
      kind,
      inputs: i,
      prompt: `${i.shop}: capital on ${startOf(i)} ${inr(r.capital[0])} and on ${endOf(i)} ${inr(r.capital[1])}. ${drawingsOf(d).parts.map((p) => (p.label === 'Cash drawn' && d.monthly ? `Cash drawn every month ${inr(d.cash)}` : p.label.startsWith('Salary') ? `Salary taken by the proprietor every month ${inr(d.cash)} (treated as drawings)` : p.label === GOODS_TAKEN ? `Goods taken for personal use: cost ${inr(d.goodsCost)}, sale price ${inr(d.goodsPrice)}` : `${p.label}: ${inr(p.amount)}`)).join('. ')}.${i.additional ? ` ${i.additional.label}: ${inr(i.additional.amount)}.` : ''} What is the profit or loss for the ${yearOf(i)}, before any adjustment?`,
      answer: {
        type: 'number',
        value: Math.abs(x),
        mistakes: mistakesOf(Math.abs(x), [
          [Math.abs(r.capital[1] - r.capital[0]), 'Took the change in capital as the result and left out the drawings and the capital brought in.'],
          [Math.abs(x - 2 * r.drawings), 'Deducted the drawings instead of adding them back.'],
          ...(r.additional ? [[Math.abs(x + 2 * r.additional), 'Added the additional capital instead of deducting it.'] as [Paise, string]] : []),
          ...(salePrice ? [[Math.abs(x - d.goodsCost + d.goodsPrice), 'Took the goods at their sale price: goods taken are drawings at cost.'] as [Paise, string]] : []),
          ...(monthlyOnce ? [[Math.abs(x - r.drawings + monthlyOnce), 'Added one month of the drawings instead of twelve.'] as [Paise, string]] : []),
        ]),
        tag: PROFIT_TAG(x),
      },
      reason: `Profit = closing capital + drawings - additional capital - opening capital = ${inr(r.capital[1])} + ${inr(r.drawings)}${r.additional ? ` - ${inr(r.additional)}` : ''} - ${inr(r.capital[0])} = ${x < 0 ? `-${inr(-x)}, a loss` : inr(x)}. Drawings: ${r.drawingsParts.map((p) => p.how).join(' + ')}.`,
      shown: upTo(walk, 'ladder-close'),
      reveal: upTo(walk, 'ladder-open'),
    };
  }
  // The net result: inputs with two adjustments at least.
  let j = i;
  for (let tries = 0; tries < 30 && resultOf(j).adjs.length < 2; tries++) j = randomInputs(rng);
  const rj = resultOf(j);
  const w = walkOf(j);
  const flip = (k: number) => rj.net - 2 * rj.adjs[k].effect;
  const ioc = rj.adjs.find((a) => a.key === 'ioc');
  return {
    kind: 'net',
    inputs: j,
    prompt: `${j.shop} found ${rj.before < 0 ? `a loss of ${inr(-rj.before)}` : `a profit of ${inr(rj.before)}`} by comparing its capitals. The statement of affairs on ${endOf(j)} was drawn up before these adjustments: ${rj.adjs.map((a) => a.label.replace(/^(Less|Add): /, '').toLowerCase() + (a.key === 'ioc' ? ` at ${j.adjustments.ioc}% p.a. on the capital at the beginning of the year (${inr(rj.capital[0])})` : a.key === 'dep' ? ` at ${j.adjustments.dep!.rate}% on its figure in the closing statement` : a.key === 'pdd' ? ` at ${j.adjustments.pdd}% on the debtors of the closing statement` : ` ${inr(Math.abs(a.effect))}`)).join('; ')}. What is the net profit or loss?`,
    answer: {
      type: 'number',
      value: Math.abs(rj.net),
      mistakes: mistakesOf(Math.abs(rj.net), [
        [Math.abs(rj.before), 'Made none of the adjustments.'],
        ...rj.adjs.map((a, k): [Paise, string] => [Math.abs(flip(k)), `${a.effect < 0 ? 'Added' : 'Deducted'} ${a.label.replace(/^(Less|Add): /, '').toLowerCase()}: it is ${a.effect < 0 ? 'deducted' : 'added'}.`]),
        ...(ioc ? [[Math.abs(rj.net - ioc.effect - Math.round((rj.capital[1] * j.adjustments.ioc) / 100 / 100) * 100), 'Worked the interest on the closing capital: it is on the capital at the beginning of the year.'] as [Paise, string]] : []),
      ]),
      tag: NET_TAG(rj.net),
    },
    reason: `${rj.before < 0 ? `-${inr(-rj.before)}` : inr(rj.before)} ${rj.adjs.map((a) => `${a.effect < 0 ? '-' : '+'} ${inr(Math.abs(a.effect))} (${a.label.replace(/^(Less|Add): /, '').toLowerCase()}: ${a.how})`).join(' ')} = ${rj.net < 0 ? `a net loss of ${inr(-rj.net)}` : `a net profit of ${inr(rj.net)}`}. Expenses and losses of value left out are deducted; assets left out are added.`,
    shown: upTo(w, 'ladder-open'),
    reveal: w.length,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Where does it go?
// ---------------------------------------------------------------------------------------------------------------

type Place = 'asset' | 'liability' | 'out' | 'drawings' | 'additional' | 'less' | 'add';
const PLACES: readonly { id: Place; text: string }[] = [
  { id: 'asset', text: 'Assets side of the statement of affairs' },
  { id: 'liability', text: 'Liabilities side of the statement of affairs' },
  { id: 'out', text: 'Left out: the proprietor’s own' },
  { id: 'drawings', text: 'Drawings: added back' },
  { id: 'additional', text: 'Additional capital: deducted' },
  { id: 'less', text: 'Deducted from the profit found' },
  { id: 'add', text: 'Added to the profit found' },
];

const WHERE: readonly { text: string; place: Place; why: string }[] = [
  { text: 'A bank overdraft of the business', place: 'liability', why: 'An overdraft is money the business owes the bank.' },
  { text: 'Rent of the shop still unpaid at the year end, known when the statement is drawn up', place: 'liability', why: 'An outstanding expense is owed by the business: a liability.' },
  { text: 'A loan given to the business by the proprietor’s cousin', place: 'liability', why: 'A loan must be repaid, even to a relative: it is a liability, not capital.' },
  { text: 'Bills receivable held by the business', place: 'asset', why: 'Money due to the business: an asset.' },
  { text: 'Insurance paid in advance, known when the statement is drawn up', place: 'asset', why: 'A prepaid expense is an asset.' },
  { text: 'The proprietor’s residential flat', place: 'out', why: 'It belongs to the proprietor, not the business: the business entity concept keeps it out.' },
  { text: 'A housing loan on the proprietor’s flat', place: 'out', why: 'A private debt of the proprietor: the business does not owe it.' },
  { text: 'Goods taken by the proprietor for personal use', place: 'drawings', why: 'Goods taken are drawings, at cost: they lowered the closing capital without being a loss.' },
  { text: 'School fees of the proprietor’s child, paid by a business cheque', place: 'drawings', why: 'A private expense paid by the business is drawings.' },
  { text: 'A salary the proprietor takes every month, which the business does not charge against profit', place: 'drawings', why: 'Whatever it is called, money the proprietor takes for private use is drawings.' },
  { text: 'The proprietor’s lottery prize, paid into the business bank account', place: 'additional', why: 'Private money brought in raised the closing capital without being earned: additional capital.' },
  { text: 'Shop electricity paid out of the proprietor’s private savings', place: 'additional', why: 'A business expense paid with private money is capital brought in.' },
  { text: 'Interest on capital to be allowed at 8% p.a.', place: 'less', why: 'Interest on capital is a charge against the profit, made after the comparison.' },
  { text: 'Depreciation on furniture, left out of the closing statement', place: 'less', why: 'The furniture, and so the closing capital, was overstated.' },
  { text: 'Wages outstanding, left out of the closing statement', place: 'less', why: 'A liability left out overstated the closing capital.' },
  { text: 'A provision for doubtful debts, not made in the closing statement', place: 'less', why: 'The debtors, and so the closing capital, were overstated.' },
  { text: 'Insurance paid in advance, left out of the closing statement', place: 'add', why: 'An asset left out understated the closing capital.' },
  { text: 'Commission earned but not received, left out of the closing statement', place: 'add', why: 'An income earned is an asset left out: the closing capital was understated.' },
];

const PLACE_WHY: Record<Place, string> = {
  asset: 'It is not something the business owns.',
  liability: 'It is not something the business owes.',
  out: 'It belongs to the business, or changes its capital: it is not private.',
  drawings: 'Nothing is taken out of the business for the proprietor.',
  additional: 'Nothing is brought in from the proprietor’s private means.',
  less: 'It does not lower the profit found.',
  add: 'It does not raise the profit found.',
};

function where(rng: Rng): IrAsk {
  const it = rng.pick(WHERE);
  const options: KitChoice[] = PLACES.map((p) => (p.id === it.place ? { id: p.id, text: p.text } : { id: p.id, text: p.text, why: PLACE_WHY[p.id] }));
  const ex = EXAMPLES[0].inputs;
  return {
    kind: 'where',
    inputs: ex,
    prompt: `A trader keeps incomplete records and finds the profit by the statement of affairs method. Where does this go? ${it.text}.`,
    answer: { type: 'choice', options, correct: it.place },
    reason: it.why,
    shown: walkOf(ex).length,
    reveal: walkOf(ex).length,
  };
}
