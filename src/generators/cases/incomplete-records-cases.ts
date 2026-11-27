/**
 * Case studies of Incomplete Records, the last topic of Class 11: one small trader who keeps no double entry books,
 * followed from the figures that can be collected to the profit or loss of the year.
 *
 * The conventions are those of the topic's bank (templates/incomplete-records.ts), whose helpers these cases reuse:
 * the statement of affairs method only (capital = business assets - business liabilities; profit or loss = closing
 * capital + drawings - additional capital - opening capital); the year runs from 1 April to 31 March; private assets
 * and debts stay out; goods taken are drawings at cost; a salary the proprietor takes is drawings; a private bill paid
 * by the business is drawings and a business bill paid from private money is capital brought in; interest on capital
 * is on the capital at the beginning of the year and is deducted from the profit found. Interest on drawings is
 * outside the 2025-26 syllabus and is never charged; nothing is built up into double entry. No journal entry is asked:
 * the method records none.
 *
 * Figures are in whole rupees until they are returned. Every typed part is worked out again by its `verify` from the
 * printed case text, with the bank's own readers (`twoDateItems`, `factsOf`, `itemsIn`, `adjustmentsIn`).
 */
import type { Rng } from '@/engine/rng';
import { caseTemplate, rupees } from '../authoring';
import { IR_CASE as I, type IrAdj, type IrAdjKey, type IrDrawn, type IrGoods, type IrItem, type IrPeriod, type IrTrader } from '../templates/incomplete-records';
import type { CaseTemplate, FormatRowParts, StatementLineParts } from '../types';

const TOPIC = 'incomplete-records';
const CONCEPT = 'ir-case';
const common = { topicId: TOPIC, conceptId: CONCEPT };

const { H, inr, sum, numeric, choice, resultText, reversedWhy, lower, amountsIn } = I;
/** The text of the right option of a question. */
const optionText = (q: Parameters<typeof I.optionText>[0]): string => I.optionText(q) ?? '';

/** The printed case a question was made from. */
const ctx = (q: { context?: string }): string => q.context ?? '';
/** The amounts of the line of a text that starts with `start`, in whole rupees. */
const lineAmounts = (text: string, start: string): number[] => amountsIn(text.split('\n').find((l) => l.startsWith(start)) ?? '');

/** The slips whose figure is a whole number of rupees: a slip that gives paise is not one a student would type. */
const whole = (errs: [number, string][]): [number, string][] => errs.filter(([v]) => Number.isInteger(v));
/** The rate of an adjustment, from its own line: "at 8% p.a." is 8. */
const rateIn = (a: IrAdj): number => Number(/at (\d+)%/.exec(a.line)?.[1]);

/** The first draw that is not null: a story of many figures seldom comes right at the first try. */
function firstGood<S>(times: number, draw: () => S | null): S | null {
  for (let i = 0; i < times; i++) {
    const s = draw();
    if (s !== null) return s;
  }
  return null;
}

interface Base {
  t: IrTrader;
  p: IrPeriod;
  /** The opening sentence, drawn once. */
  who: string;
}
function base(rng: Rng): Base {
  const t = rng.pick(I.TRADERS);
  return { t, p: I.period(rng), who: I.intro(rng, t) };
}

type Dated = ReturnType<typeof I.twoDateItems>[number];
type Added = { line: string; amount: number };

const sideOf = (items: readonly Dated[], side: 'asset' | 'liability', c: 'v0' | 'v1'): number => sum(items.filter((i) => i.side === side).map((i) => i[c]));
const assetsOn = (items: readonly Dated[], c: 'v0' | 'v1'): number => sideOf(items, 'asset', c);
const debtsOn = (items: readonly Dated[], c: 'v0' | 'v1'): number => sideOf(items, 'liability', c);

/**
 * Brings the year to a result in [min, max]: the largest asset at the end takes up the difference, within believable
 * limits (half to one and a half times its figure at the start), as the bank's `ir-profit-two-lists` does. Null when
 * no such result can be had, or the closing capital would be too small.
 */
function settle(rng: Rng, items: Dated[], D: number, A: number, [min, max]: [number, number]): number | null {
  const open = items.filter((i) => i.side === 'asset' && i.v1 > 0 && i.label !== 'Cash at bank');
  if (open.length === 0) return null;
  const top = open.reduce((b, i) => (i.v1 > b.v1 ? i : b));
  const ref = top.v0 || top.v1;
  const natural = I.capOf(items, 'v1') + D - A - I.capOf(items, 'v0');
  const lo = Math.max(min, Math.ceil((natural + Math.max(10000, ref / 2) - top.v1) / 1000) * 1000);
  const hi = Math.min(max, Math.floor((natural + ref * 1.5 - top.v1) / 1000) * 1000);
  if (lo > hi) return null;
  const r = rng.step(lo, hi, 1000);
  top.v1 += r - natural;
  return I.capOf(items, 'v1') < 60000 ? null : r;
}

/** One year of a shop, with the lists of two dates, what was drawn and what was brought in. */
interface Year extends Base {
  items: Dated[];
  d: IrDrawn;
  g: IrGoods | null;
  a: Added | null;
  D: number;
  A: number;
  c0: number;
  c1: number;
  r: number;
  priv: { label: string; value: number };
}

function drawYear(rng: Rng, range: [number, number], chances: { goods: number; added: number }): Year | null {
  return firstGood(40, () => {
    const items = I.twoDates(rng, rng.int(4, 5), 2);
    if (!items || !stockHolds(items)) return null;
    const d = I.cashDrawings(rng, 24000, 120000);
    const g = rng.next() < chances.goods ? I.goodsDrawn(rng) : null;
    const a = rng.next() < chances.added ? I.capitalIn(rng) : null;
    const D = d.total + (g?.cost ?? 0);
    const A = a?.amount ?? 0;
    const r = settle(rng, items, D, A, range);
    if (r === null) return null;
    const k = rng.pick(I.PRIVATE_KINDS);
    return { ...base(rng), items, d, g, a, D, A, c0: I.capOf(items, 'v0'), c1: I.capOf(items, 'v1'), r, priv: { label: k.label, value: I.valueOf(rng, k) } };
  });
}

/** True when the list has stock on both dates, or none at all: a shop does not run out of stock on a closing date. */
const stockHolds = (items: readonly Dated[]): boolean => items.every((i) => i.label !== 'Stock' || (i.v0 > 0 && i.v1 > 0));

/** The drawings of a year written out for a working. */
const drawnHow = (s: Pick<Year, 'd' | 'g' | 'D'>): string => `${s.d.how}${s.g ? ` + goods at cost ${inr(s.g.cost)} = ${inr(s.D)}` : ''}`;
/** The lines of what was drawn and brought in. */
const moneyLines = (s: Pick<Year, 'd' | 'g' | 'a'>): string[] => [s.d.line, ...(s.g ? [s.g.line] : []), ...(s.a ? [s.a.line] : [])];
/** The lines of the two lists, the private item among them where it fell. */
function listLines(s: Pick<Year, 'items' | 'p' | 'priv'>, at: number): string[] {
  const lines = s.items.map((i) => I.twoDateLine(i.label, i.v0, i.v1, s.p));
  lines.splice(at % (lines.length + 1), 0, I.twoDateLine(s.priv.label, s.priv.value, s.priv.value, s.p));
  return lines;
}

/** The capitals, drawings, capital brought in and result of a case printed as two dated lists. */
function yearOf(text: string): { c0: number; c1: number; drawings: number; additional: number; result: number } {
  const items = I.twoDateItems(text).filter((i) => i.side !== 'private');
  const f = I.factsOf(text);
  const c0 = I.capOf(items, 'v0'), c1 = I.capOf(items, 'v1');
  return { c0, c1, drawings: f.drawings, additional: f.additional, result: c1 + f.drawings - f.additional - c0 };
}

const privateWhy = (priv: string): [string, string][] => [
  [`The figure of ${lower(priv)} did not change during the year`, 'An item stays out because of whom it belongs to, not because its figure stood still: a business asset that did not change is still listed.'],
  ['A statement of affairs lists only current assets and current liabilities', 'It lists every business asset and liability, fixed or current.'],
  ['Its value is an estimate', 'A statement of affairs is full of estimates; that is no reason to leave anything out.'],
];

// ---------------------------------------------------------------------------------------------------------------
// 1. Two lists, a year apart
// ---------------------------------------------------------------------------------------------------------------

const twoLists = caseTemplate<Year & { at: number }>({
  ...common,
  id: 'case-ir-two-lists',
  difficulty: 'easy',
  title: 'Two lists, a year apart',
  setup: (rng) => {
    const y = drawYear(rng, [30000, 180000], { goods: 0.5, added: 0.4 });
    return y && { ...y, at: rng.int(0, 9) };
  },
  context: (s) =>
    [`${s.who} The proprietor collected these figures at the start and the end of the ${s.p.year}.`, ...listLines(s, s.at), 'During the year:', ...moneyLines(s)].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A0 = assetsOn(s.items, 'v0'), L0 = debtsOn(s.items, 'v0');
        const n = numeric(s.c0, [
          [A0 + L0, 'Added the liabilities to the assets instead of deducting them.'],
          [A0, 'Gave the total of the assets and left out the liabilities.'],
          [s.priv.label.startsWith('Housing loan') ? s.c0 - s.priv.value : s.c0 + s.priv.value, `Brought ${lower(s.priv.label)} into the statement of the business.`],
        ]);
        return n && { prompt: `What was the capital of the business on ${s.p.start}?`, ...n, explanation: [`Assets on ${s.p.start} = ${inr(A0)}.`, `Liabilities on ${s.p.start} = ${inr(L0)}.`, `Capital = ${inr(A0)} - ${inr(L0)} = ${inr(s.c0)}.`], hints: H.capital };
      },
      verify: (q) => q.answer === rupees(yearOf(ctx(q)).c0),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A1 = assetsOn(s.items, 'v1'), L1 = debtsOn(s.items, 'v1');
        const n = numeric(s.c1, [
          [A1 + L1, 'Added the liabilities to the assets instead of deducting them.'],
          [A1, 'Gave the total of the assets and left out the liabilities.'],
          [s.c0, 'Gave the capital at the start of the year.'],
        ]);
        return n && { prompt: `What was the capital of the business on ${s.p.end}?`, ...n, explanation: [`Assets on ${s.p.end} = ${inr(A1)}.`, `Liabilities on ${s.p.end} = ${inr(L1)}.`, `Capital = ${inr(A1)} - ${inr(L1)} = ${inr(s.c1)}.`], hints: H.capital };
      },
      verify: (q) => q.answer === rupees(yearOf(ctx(q)).c1),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Why does "${s.priv.label}" stay out of both statements of affairs?`,
          'It belongs to the proprietor privately, not to the business',
          privateWhy(s.priv.label),
          'A statement of affairs shows the assets and liabilities of the business alone. What the proprietor owns or owes privately is kept out, on both dates.',
          H.theory,
        ),
      verify: (q) => optionText(q).includes('privately'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.D, [
          [s.d.monthly ? s.d.monthly + (s.g?.cost ?? 0) : 0, 'Took the cash of one month, not of twelve.'],
          [s.g ? s.d.total : 0, 'Left out the goods the proprietor took.'],
          [s.g ? s.d.total + s.g.price : 0, 'Took the goods at their sale price; goods are drawn at cost.'],
          [s.A ? s.D + s.A : 0, 'Added the capital brought in to the drawings.'],
          [Math.abs(s.c1 - s.c0), 'Took the change in capital as the drawings.'],
          [s.d.monthly ? 0 : 12 * s.d.total, 'Multiplied a figure of the whole year by twelve.'],
        ]);
        return n && { prompt: 'What were the total drawings of the year?', ...n, explanation: [`Cash: ${s.d.how}.`, ...(s.g ? [`Goods at cost: ${inr(s.g.cost)}; the sale price is not used.`] : []), `Total drawings = ${inr(s.D)}.`], hints: H.drawings };
      },
      verify: (q) => q.answer === rupees(I.factsOf(ctx(q)).drawings),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.r, [
          [s.c1 - s.c0, 'Took the rise in capital as the profit, leaving out the drawings and the capital brought in.'],
          [s.r - s.D, 'Left out the drawings.'],
          [s.A ? s.r + s.A : 0, 'Did not deduct the capital brought in.'],
          [s.A ? s.r + 2 * s.A : 0, 'Added the capital brought in instead of deducting it.'],
          [s.c0 + s.D - s.A - s.c1, 'Took the closing capital from the opening capital, the comparison the wrong way round.'],
        ]);
        return n && {
          prompt: `What was the profit of the ${s.p.year}?`,
          ...n,
          explanation: [`Closing capital ${inr(s.c1)} + drawings ${inr(s.D)}${s.A ? ` - capital brought in ${inr(s.A)}` : ''} = ${inr(s.c1 + s.D - s.A)}.`, `Less opening capital ${inr(s.c0)}: profit = ${inr(s.r)}.`],
          hints: H.profit,
        };
      },
      verify: (q) => q.answer === rupees(yearOf(ctx(q)).result),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. What the proprietor took out
// ---------------------------------------------------------------------------------------------------------------

interface TookOut extends Base {
  monthly: number;
  g: IrGoods;
  bills: { label: string; amount: number }[];
  staff: number;
  a: Added | null;
  c0: number;
  c1: number;
  D: number;
  A: number;
  r: number;
}

const tookOut = caseTemplate<TookOut>({
  ...common,
  id: 'case-ir-what-was-taken',
  difficulty: 'easy',
  title: 'What the proprietor took out',
  setup: (rng) => {
    const b = base(rng);
    const monthly = rng.step(2000, 12000, 500);
    const g = I.goodsDrawn(rng);
    const bills = rng.shuffle(I.PRIVATE_BILLS).slice(0, rng.int(1, 2)).map((label) => ({ label, amount: rng.step(3000, 30000, 500) }));
    const staff = rng.step(6000, 15000, 500);
    const a = rng.next() < 0.6 ? I.capitalIn(rng, 20000, 120000) : null;
    const c0 = rng.step(200000, 800000, 10000);
    const D = 12 * monthly + g.cost + sum(bills.map((x) => x.amount));
    const A = a?.amount ?? 0;
    const r = rng.next() < 0.25 ? -rng.step(8000, 50000, 1000) : rng.step(40000, 260000, 1000);
    const c1 = c0 + r + A - D;
    if (c1 < 80000) return null;
    return { ...b, monthly, g, bills, staff, a, c0, c1, D, A, r };
  },
  context: (s) =>
    [
      `${s.who} The statements of affairs of the ${s.p.year} gave these capitals.`,
      I.openLine(s.p, s.c0),
      I.closeLine(s.p, s.c1),
      'The proprietor went through the notebook of the year and listed:',
      `${I.DRAW_MONTHLY}: ${inr(s.monthly)}`,
      s.g.line,
      ...s.bills.map((b) => `${b.label}: ${inr(b.amount)}`),
      `Monthly salary of the shop assistant, paid from the business: ${inr(s.staff)}`,
      ...(s.a ? [s.a.line] : []),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(12 * s.monthly, [
          [s.monthly, 'Took the figure of one month, not of twelve.'],
          [12 * (s.monthly + s.staff), "Counted the assistant's salary as drawings; it is an expense of the business."],
          [s.monthly + s.staff, "Took one month, and added the assistant's salary as well."],
        ]);
        return n && { prompt: 'How much cash did the proprietor draw in the year?', ...n, explanation: [`${inr(s.monthly)} x 12 = ${inr(12 * s.monthly)}.`, "The assistant's salary is a business expense: it was not taken for private use."], hints: H.drawings };
      },
      verify: (q) => q.answer === rupees(12 * lineAmounts(ctx(q), I.DRAW_MONTHLY)[0]),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'At what figure do the goods the proprietor took count as drawings?',
          `${inr(s.g.cost)}, their cost`,
          [
            [`${inr(s.g.price)}, their sale price`, 'No sale took place, so no profit is counted: the goods leave the business at what they cost.'],
            [`${inr(s.g.price - s.g.cost)}, the profit given up`, 'What left the business is the goods themselves, at cost, not the margin on them.'],
            ['Nothing, as no cash left the business', 'Drawings need not be in cash: goods taken for private use reduce the capital too.'],
          ],
          'Goods taken by the proprietor are drawings at cost: that is what left the business.',
          H.drawings,
        ),
      verify: (q) => amountsIn(optionText(q))[0] === lineAmounts(ctx(q), 'Goods taken by the proprietor')[0],
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const billTotal = sum(s.bills.map((b) => b.amount));
        const n = numeric(s.D, [
          [s.D - billTotal, 'Left out the private bills paid by the business.'],
          [s.D - s.g.cost + s.g.price, 'Took the goods at their sale price.'],
          [s.D - 12 * s.monthly + s.monthly, 'Took the cash of one month, not of twelve.'],
          [s.D + 12 * s.staff, "Counted the assistant's salary as drawings."],
        ]);
        return n && {
          prompt: 'What were the total drawings of the year?',
          ...n,
          explanation: [`Cash ${inr(12 * s.monthly)} + goods at cost ${inr(s.g.cost)}${s.bills.map((b) => ` + ${lower(b.label)} ${inr(b.amount)}`).join('')} = ${inr(s.D)}.`, 'A private bill paid by the business is drawings; the wages of a person who works in the shop are not.'],
          hints: H.drawings,
        };
      },
      verify: (q) => q.answer === rupees(I.factsOf(ctx(q)).drawings),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const adjusted = s.c1 + s.D - s.A;
        const n = numeric(adjusted, [
          [s.c1 - s.D - s.A, 'Deducted the drawings; they are added back.'],
          [s.c1 + s.D + s.A, 'Added the capital brought in; it is deducted.'],
          [s.A ? s.c1 + s.D : 0, 'Did not deduct the capital brought in.'],
          [s.c1, 'Left the closing capital as it was, without adjusting it.'],
        ]);
        return n && {
          prompt: 'What is the adjusted capital at the end of the year: the closing capital with the drawings put back, less any capital brought in?',
          ...n,
          explanation: [`${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} = ${inr(adjusted)}.`, 'This is what the capital would have been had nothing been taken out or brought in.'],
          hints: H.profit,
        };
      },
      verify: (q) => {
        const f = I.factsOf(ctx(q));
        return q.answer === rupees(f.closing! + f.drawings - f.additional);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `What was the result of the ${s.p.year}?`,
          resultText(s.r),
          [
            [resultText(-s.r), reversedWhy(s.r)],
            [resultText(s.c1 - s.c0 === 0 ? s.D : s.c1 - s.c0), 'Took the change in capital as the result, leaving out the drawings and the capital brought in.'],
            [resultText(s.c1 - s.c0 + s.D), 'Did not deduct the capital brought in.'],
            [resultText(s.r - s.D), 'Left the drawings out of the comparison.'],
            [resultText(s.r - 2 * s.D), 'Deducted the drawings instead of adding them back.'],
          ],
          `Adjusted closing capital ${inr(s.c1 + s.D - s.A)} less opening capital ${inr(s.c0)}: ${lower(resultText(s.r))}.`,
          H.profit,
        ),
      verify: (q) => {
        const f = I.factsOf(ctx(q));
        return optionText(q) === resultText(f.closing! + f.drawings - f.additional - f.opening!);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Capital fell: profit or loss?
// ---------------------------------------------------------------------------------------------------------------

interface Fell extends Base {
  A0: number;
  L0: number;
  A1: number;
  L1: number;
  c0: number;
  c1: number;
  d: IrDrawn;
  g: IrGoods | null;
  a: Added | null;
  D: number;
  A: number;
  r: number;
}

const capitalFell = caseTemplate<Fell>({
  ...common,
  id: 'case-ir-capital-fell',
  difficulty: 'medium',
  title: 'Capital fell: profit or loss?',
  setup: (rng) =>
    firstGood(30, () => {
      const b = base(rng);
      const c0 = rng.step(300000, 900000, 10000);
      const d = I.cashDrawings(rng, 60000, 180000);
      const g = rng.next() < 0.5 ? I.goodsDrawn(rng) : null;
      const a = rng.next() < 0.4 ? I.capitalIn(rng, 10000, 50000) : null;
      const D = d.total + (g?.cost ?? 0);
      const A = a?.amount ?? 0;
      // The capital always falls; the drawings explain all of the fall (a profit) or only part of it (a loss).
      const r = rng.next() < 0.4 ? -rng.step(8000, 60000, 1000) : rng.step(8000, 120000, 1000);
      const fall = D - A - r;
      if (fall < 5000) return null;
      const c1 = c0 - fall;
      const L0 = rng.step(40000, 250000, 1000), L1 = rng.step(40000, 250000, 1000);
      return { ...b, A0: c0 + L0, L0, A1: c1 + L1, L1, c0, c1, d, g, a, D, A, r };
    }),
  context: (s) =>
    [
      `${s.who} The proprietor says: "My capital has fallen this year, so the shop has made a loss."`,
      `Total assets on ${s.p.start}: ${inr(s.A0)}`,
      `Total liabilities on ${s.p.start}: ${inr(s.L0)}`,
      `Total assets on ${s.p.end}: ${inr(s.A1)}`,
      `Total liabilities on ${s.p.end}: ${inr(s.L1)}`,
      ...moneyLines(s),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.c0 - s.c1, [
          [Math.abs(s.A0 - s.A1), 'Compared the total assets only, leaving out the liabilities.'],
          [Math.abs(s.L0 - s.L1), 'Compared the liabilities only.'],
          [s.D, 'Gave the drawings: they are only one reason the capital moved.'],
        ]);
        return n && { prompt: 'By how much did the capital fall during the year?', ...n, explanation: [`Capital at the start = ${inr(s.A0)} - ${inr(s.L0)} = ${inr(s.c0)}.`, `Capital at the end = ${inr(s.A1)} - ${inr(s.L1)} = ${inr(s.c1)}.`, `Fall = ${inr(s.c0)} - ${inr(s.c1)} = ${inr(s.c0 - s.c1)}.`], hints: H.capital };
      },
      verify: (q) => {
        const t = ctx(q);
        const [a0, l0, a1, l1] = amountsIn(t);
        return q.answer === rupees(a0 - l0 - (a1 - l1));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.D, [
          [s.g ? s.d.total : 0, 'Left out the goods taken.'],
          [s.g ? s.d.total + s.g.price : 0, 'Took the goods at their sale price; goods are drawn at cost.'],
          [s.d.monthly ? s.d.monthly + (s.g?.cost ?? 0) : 0, 'Took the cash of one month, not of twelve.'],
          [s.A ? s.D + s.A : 0, 'Added the capital brought in to the drawings.'],
          [Math.abs(s.c1 - s.c0), 'Took the change in capital as the drawings.'],
          [s.d.monthly ? 0 : 12 * s.d.total, 'Multiplied a figure of the whole year by twelve.'],
          [s.c0 - s.c1, 'Took the fall in capital as the drawings.'],
        ]);
        return n && { prompt: 'What were the total drawings of the year?', ...n, explanation: [`Drawings = ${drawnHow(s)}.`], hints: H.drawings };
      },
      verify: (q) => q.answer === rupees(I.factsOf(ctx(q)).drawings),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const adj = s.c1 + s.D - s.A;
        const n = numeric(adj, [
          [s.c1 - s.D - s.A, 'Deducted the drawings; they are added back.'],
          [s.A ? s.c1 + s.D + s.A : 0, 'Added the capital brought in; it is deducted.'],
          [s.A ? s.c1 + s.D : 0, 'Did not deduct the capital brought in.'],
          [s.c1 - s.A, 'Forgot to add back the drawings.'],
        ]);
        return n && { prompt: 'What is the adjusted capital at the end of the year (the closing capital with the drawings put back, less any capital brought in)?', ...n, explanation: [`${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} = ${inr(adj)}.`], hints: H.profit };
      },
      verify: (q) => {
        const t = ctx(q);
        const [, , a1, l1] = amountsIn(t);
        const f = I.factsOf(t);
        return q.answer === rupees(a1 - l1 + f.drawings - f.additional);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(Math.abs(s.r), [
          [s.c0 - s.c1, 'Took the fall in capital as the result, leaving out the drawings.'],
          [s.A ? Math.abs(s.c1 + s.D + s.A - s.c0) : 0, 'Added the capital brought in instead of deducting it.'],
          [s.A ? Math.abs(s.c1 + s.D - s.c0) : 0, 'Did not deduct the capital brought in.'],
          [s.c0 - s.c1 + s.D, 'Added the drawings to the fall instead of setting them against it.'],
        ]);
        return n && {
          prompt: `What was the amount of the profit or loss of the ${s.p.year}? Type the amount; the next question asks which it was.`,
          ...n,
          explanation: [`Adjusted closing capital = ${inr(s.c1 + s.D - s.A)}; opening capital = ${inr(s.c0)}.`, `Difference = ${inr(Math.abs(s.r))}.`],
          hints: H.profit,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const [a0, l0, a1, l1] = amountsIn(t);
        const f = I.factsOf(t);
        return q.answer === rupees(Math.abs(a1 - l1 + f.drawings - f.additional - (a0 - l0)));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'Is the proprietor right to say that the shop made a loss?',
          s.r > 0 ? `No: it made a profit of ${inr(s.r)}, and the drawings took the capital down` : `Yes: it made a loss of ${inr(-s.r)}, even with the drawings put back`,
          [
            [s.r > 0 ? `Yes: it made a loss of ${inr(s.r)}` : `No: it made a profit of ${inr(-s.r)}`, reversedWhy(s.r)],
            [s.r > 0 ? `Yes: it made a loss of ${inr(s.c0 - s.c1)}, the fall in capital` : `No: it made a profit of ${inr(s.D)}, the drawings`, s.r > 0 ? 'A fall in capital alone proves nothing: the drawings must be added back first.' : 'The drawings are taken out of the capital; they are not a profit.'],
            ['It cannot be said without a trial balance', 'The statement of affairs method needs no trial balance: the capitals, the drawings and the capital brought in are enough.'],
          ],
          s.r > 0
            ? `Adjusted closing capital ${inr(s.c1 + s.D - s.A)} is above the opening capital ${inr(s.c0)}: a profit of ${inr(s.r)}. The drawings, larger than the profit, are why the capital fell.`
            : `Adjusted closing capital ${inr(s.c1 + s.D - s.A)} is below the opening capital ${inr(s.c0)}: a loss of ${inr(-s.r)}.`,
          H.profit,
        ),
      verify: (q) => {
        const t = ctx(q);
        const [a0, l0, a1, l1] = amountsIn(t);
        const f = I.factsOf(t);
        return optionText(q).startsWith(a1 - l1 + f.drawings - f.additional > a0 - l0 ? 'No' : 'Yes');
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Money that came in
// ---------------------------------------------------------------------------------------------------------------

interface CameIn extends Base {
  c0: number;
  items: IrItem[];
  cash: number;
  laptop: number;
  bill: number;
  loan: number;
  sold: number;
  d: IrDrawn;
  A: number;
  c1: number;
  r: number;
}


const moneyCameIn = caseTemplate<CameIn>({
  ...common,
  id: 'case-ir-money-came-in',
  difficulty: 'medium',
  title: 'Money that came in',
  setup: (rng) =>
    firstGood(30, () => {
      const b = base(rng);
      const nAssets = rng.int(3, 4);
      const items = I.drawItems(rng, nAssets, nAssets === 3 ? rng.int(1, 2) : 1);
      const cash = rng.step(20000, 150000, 5000);
      const laptop = rng.next() < 0.6 ? rng.step(20000, 60000, 5000) : 0;
      const bill = rng.next() < 0.5 ? rng.step(3000, 15000, 500) : 0;
      const loan = rng.step(20000, 100000, 5000);
      const sold = rng.step(5000, 30000, 1000);
      const d = I.cashDrawings(rng, 24000, 96000);
      const A = cash + laptop + bill;
      const c1 = I.total(items, 'asset') + laptop - I.total(items, 'liability') - loan;
      const r = rng.step(30000, 200000, 1000);
      const c0 = c1 + d.total - A - r;
      if (c1 < 80000 || c0 < 80000) return null;
      return { ...b, c0, items, cash, laptop, bill, loan, sold, d, A, c1, r };
    }),
  context: (s) =>
    [
      s.who,
      I.openLine(s.p, s.c0),
      s.d.line,
      `What came into the business in the ${s.p.year}:`,
      `The proprietor sold a private plot and paid in ${inr(s.cash)}.`,
      `A friend of the proprietor lent the business ${inr(s.loan)}, and old furniture of the business was sold for ${inr(s.sold)}.`,
      ...(s.laptop ? [`The proprietor brought in a personal laptop worth ${inr(s.laptop)}, for use in the shop.`] : []),
      ...(s.bill ? [`A repair bill of the shop, ${inr(s.bill)}, was paid out of the proprietor's private savings.`] : []),
      `Assets and liabilities on ${s.p.end}, the friend's loan${s.laptop ? ' and the laptop' : ''} not yet included:`,
      ...s.items.map(I.itemLine),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Why is the friend\'s money not capital brought in?',
          'It must be paid back, so it is a liability of the business',
          [
            ['It was received in cash', 'Capital can be brought in cash too; how it arrived does not decide it. The question is whether it comes from the proprietor.'],
            ['It was received during the year', 'Capital can be brought in at any time of the year.'],
            ['It is an income of the business', 'A loan is not earned; it is owed.'],
          ],
          'Only what the proprietor brings in from private sources is capital. A loan raises the assets and the liabilities alike, and leaves the capital where it was.',
          H.profit,
        ),
      verify: (q) => optionText(q).includes('liability'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.A, [
          [s.A + s.loan, "Counted the friend's loan as capital; it is a liability."],
          [s.A + s.sold, 'Counted the sale of business furniture as capital; it only turns one asset of the business into another.'],
          [s.A + s.loan + s.sold, 'Counted everything that came in as capital.'],
          [s.laptop ? s.A - s.laptop : 0, 'Left out the laptop; capital may be brought in as an asset.'],
          [s.bill ? s.A - s.bill : 0, 'Left out the shop bill paid from private money, which is capital brought in.'],
        ]);
        return n && {
          prompt: 'How much additional capital did the proprietor bring in during the year?',
          ...n,
          explanation: [`Additional capital = ${I.plus([s.cash, s.laptop, s.bill].filter((x) => x > 0))}.`, "The friend's loan is a liability, and selling furniture of the business brings in no capital."],
          hints: ["Ask of each item: did it come from the proprietor's private means?", 'A loan is owed to someone; a sale of a business asset only changes the form of that asset.'],
        };
      },
      verify: (q) => {
        const { plot, laptop, bill } = cameInOf(ctx(q));
        return q.answer === rupees(plot + laptop + bill);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.c1, [
          [s.c1 + s.loan, "Left the friend's loan out of the closing liabilities."],
          [s.laptop ? s.c1 - s.laptop : 0, 'Left the laptop out of the closing assets.'],
          [I.total(s.items, 'asset') + I.total(s.items, 'liability'), 'Added the liabilities to the assets.'],
          [I.total(s.items, 'asset') + s.laptop, 'Gave the assets and left out every liability.'],
        ]);
        return n && {
          prompt: `What was the capital of the business on ${s.p.end}, once the list is complete?`,
          ...n,
          explanation: [s.laptop ? `Assets = ${inr(I.total(s.items, 'asset'))} + laptop ${inr(s.laptop)} = ${inr(I.total(s.items, 'asset') + s.laptop)}.` : `Assets = ${inr(I.total(s.items, 'asset'))}.`, `Liabilities = ${inr(I.total(s.items, 'liability'))} + friend's loan ${inr(s.loan)} = ${inr(I.total(s.items, 'liability') + s.loan)}.`, `Capital = ${inr(s.c1)}.`],
          hints: H.capital,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const items = I.itemsIn(t);
        const { laptop, loan } = cameInOf(t);
        return q.answer === rupees(I.total(items, 'asset') + laptop - I.total(items, 'liability') - loan);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.r, [
          [s.r + s.A, 'Did not deduct the additional capital.'],
          [s.r - s.loan, "Counted the friend's loan as capital brought in."],
          [s.r - s.sold, 'Counted the sale of furniture as capital brought in.'],
          [s.r - s.d.total, 'Left out the drawings.'],
          [s.c1 - s.c0, 'Took the rise in capital as the profit.'],
        ]);
        return n && {
          prompt: `What was the profit of the ${s.p.year}?`,
          ...n,
          explanation: [`Drawings = ${s.d.how}.`, `Profit = ${inr(s.c1)} + ${inr(s.d.total)} - ${inr(s.A)} - ${inr(s.c0)} = ${inr(s.r)}.`],
          hints: H.profit,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const items = I.itemsIn(t);
        const f = I.factsOf(t);
        const { plot, laptop, bill, loan } = cameInOf(t);
        return q.answer === rupees(I.total(items, 'asset') + laptop - I.total(items, 'liability') - loan + f.drawings - (plot + laptop + bill) - f.opening!);
      },
    },
  ],
});

/** What a "money that came in" case printed, from its lines. */
function cameInOf(text: string): { plot: number; laptop: number; bill: number; loan: number } {
  return {
    plot: lineAmounts(text, 'The proprietor sold a private plot')[0],
    laptop: lineAmounts(text, 'The proprietor brought in a personal laptop')[0] ?? 0,
    bill: lineAmounts(text, 'A repair bill of the shop')[0] ?? 0,
    loan: lineAmounts(text, 'A friend of the proprietor')[0],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 5. No figure for the opening stock
// ---------------------------------------------------------------------------------------------------------------

interface LostStock extends Year {
  stock: number;
}

const resultLine = (r: number): string => (r >= 0 ? `Profit for the year: ${inr(r)}` : `Loss for the year: ${inr(-r)}`);

const lostStock = caseTemplate<LostStock>({
  ...common,
  id: 'case-ir-lost-opening-stock',
  difficulty: 'medium',
  title: 'No figure for the opening stock',
  setup: (rng) =>
    firstGood(40, () => {
      const y = drawYear(rng, rng.next() < 0.25 ? [-60000, -8000] : [30000, 180000], { goods: 0.4, added: 0.5 });
      const stock = y?.items.find((i) => i.label === 'Stock');
      if (!y || !stock || stock.v0 === 0 || stock.v1 === 0) return null;
      return { ...y, stock: stock.v0 };
    }),
  context: (s) => {
    const lines = s.items.map((i) => (i.label === 'Stock' ? `Stock: not recorded on ${s.p.start}; ${inr(i.v1)} on ${s.p.end}` : I.twoDateLine(i.label, i.v0, i.v1, s.p)));
    return [`${s.who} The page with the stock count of ${s.p.start} is lost, but the result of the ${s.p.year} is known from the proprietor's tax papers.`, ...lines, ...moneyLines(s), resultLine(s.r)].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A1 = assetsOn(s.items, 'v1'), L1 = debtsOn(s.items, 'v1');
        const n = numeric(s.c1, [
          [A1 + L1, 'Added the liabilities to the assets.'],
          [A1, 'Left out the liabilities.'],
          [s.c1 + s.D, 'Added the drawings to the capital of the date; the capital is only assets less liabilities.'],
        ]);
        return n && { prompt: `What was the capital on ${s.p.end}?`, ...n, explanation: [`Assets ${inr(A1)} - liabilities ${inr(L1)} = ${inr(s.c1)}.`], hints: H.capital };
      },
      verify: (q) => {
        const items = closingListOf(ctx(q));
        return q.answer === rupees(items.assets - items.debts);
      },
    },
    {
      kind: 'mcq',
      make: () =>
        choice(
          'Which working gives the capital at the start of the year from the closing capital?',
          'Closing capital + drawings - additional capital - profit (or + loss)',
          [
            ['Closing capital - drawings + additional capital + profit (or - loss)', 'Every sign is the wrong way round: this runs the year forward instead of undoing it.'],
            ['Closing capital + drawings + additional capital + profit', 'Going back to the start means taking off what raised the capital.'],
            ['Closing capital - profit (or + loss), and nothing else', 'The drawings and the additional capital moved the capital as well.'],
          ],
          'Undo the year: put back what was taken out, and take off what was brought in or earned.',
          H.unknown,
        ),
      verify: (q) => optionText(q).startsWith('Closing capital + drawings - additional'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.c0, [
          [s.c1 - s.D + s.A + s.r, 'Ran the year forward instead of undoing it: every sign is reversed.'],
          [s.c1 + s.D - s.A + s.r, s.r >= 0 ? 'Added the profit; going back to the start it is taken off.' : 'Took off the loss; going back to the start it is added.'],
          [s.A ? s.c1 + s.D + s.A - s.r : 0, 'Added the capital brought in; going back it is taken off.'],
          [s.c1 - s.r, 'Took off the result alone, leaving out the drawings and the capital brought in.'],
        ]);
        return n && { prompt: `What was the capital on ${s.p.start}?`, ...n, explanation: [`Capital at the start = ${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} ${s.r >= 0 ? '-' : '+'} ${inr(Math.abs(s.r))} = ${inr(s.c0)}.`], hints: H.unknown };
      },
      verify: (q) => q.answer === rupees(openingFrom(ctx(q))),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const L0 = debtsOn(s.items, 'v0');
        const n = numeric(s.c0 + L0, [
          [s.c0, 'Gave the capital; the total assets are the capital and the liabilities together.'],
          [s.c0 - L0, 'Deducted the liabilities instead of adding them.'],
          [assetsOn(s.items, 'v0') - s.stock, 'Added up the assets listed and forgot the missing stock.'],
        ]);
        return n && { prompt: `What must the total assets on ${s.p.start} have been?`, ...n, explanation: [`Assets = capital + liabilities = ${inr(s.c0)} + ${inr(L0)} = ${inr(s.c0 + L0)}.`], hints: ['Assets = capital + liabilities on any date.', 'Add up the liabilities of the opening date first.'] };
      },
      verify: (q) => {
        const t = ctx(q);
        return q.answer === rupees(openingFrom(t) + debtsOn(I.twoDateItems(t).filter((i) => i.side !== 'private'), 'v0'));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const L0 = debtsOn(s.items, 'v0');
        const listed = assetsOn(s.items, 'v0') - s.stock;
        const n = numeric(s.stock, [
          [s.c0 - listed, 'Left the liabilities out: the total assets are the capital and the liabilities together.'],
          [s.c0 + L0, 'Gave the total assets, not the stock within them.'],
          [s.c0 + L0 - listed + (s.items.find((i) => i.label === 'Stock')?.v1 ?? 0), 'Counted the closing stock as well.'],
          [s.items.find((i) => i.label === 'Stock')?.v1 ?? 0, 'Gave the stock of the closing date.'],
        ]);
        return n && {
          prompt: `What was the stock on ${s.p.start}?`,
          ...n,
          explanation: [`Total assets on ${s.p.start} = ${inr(s.c0 + L0)}.`, `Other assets listed = ${inr(listed)}.`, `Stock = ${inr(s.c0 + L0)} - ${inr(listed)} = ${inr(s.stock)}.`],
          hints: ['Stock is what is left of the total assets once the other assets are taken off.', 'Work out the capital at the start first.'],
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const items = I.twoDateItems(t).filter((i) => i.side !== 'private');
        return q.answer === rupees(openingFrom(t) + debtsOn(items, 'v0') - assetsOn(items, 'v0'));
      },
    },
  ],
});

/** The total assets and liabilities of the closing date of a case whose stock line has no opening figure. */
function closingListOf(text: string): { assets: number; debts: number } {
  const items = I.twoDateItems(text).filter((i) => i.side !== 'private');
  const stock = /^Stock: not recorded on [^;]+; ₹([\d,]+) on /m.exec(text);
  return { assets: assetsOn(items, 'v1') + I.num(stock?.[1] ?? '0'), debts: debtsOn(items, 'v1') };
}
/** The opening capital worked back from the closing list, the drawings, the capital brought in and the result. */
function openingFrom(text: string): number {
  const { assets, debts } = closingListOf(text);
  const f = I.factsOf(text);
  return assets - debts + f.drawings - f.additional - (f.profit ?? 0) + (f.loss ?? 0);
}

// ---------------------------------------------------------------------------------------------------------------
// 6. The figure the notebook lost
// ---------------------------------------------------------------------------------------------------------------

interface Lost extends Base {
  unknown: 'drawings' | 'additional';
  A0: number;
  L0: number;
  A1: number;
  L1: number;
  c0: number;
  c1: number;
  r: number;
  D: number;
  A: number;
  /** Of the drawings: the goods at cost. Of the capital brought in: the asset brought in. */
  part: number;
  /** Of the drawings: the cash drawn each month. Of the capital brought in: the cash brought in. */
  rest: number;
}

const lostFigure = caseTemplate<Lost>({
  ...common,
  id: 'case-ir-lost-figure',
  difficulty: 'medium',
  title: 'The figure the notebook lost',
  setup: (rng) =>
    firstGood(30, () => {
      const b = base(rng);
      const unknown = rng.pick(['drawings', 'additional'] as const);
      const c0 = rng.step(250000, 800000, 10000);
      const r = rng.next() < 0.25 ? -rng.step(8000, 50000, 1000) : rng.step(40000, 240000, 1000);
      const part = unknown === 'drawings' ? rng.step(4000, 24000, 500) : rng.step(15000, 60000, 5000);
      const rest = unknown === 'drawings' ? rng.step(3000, 12000, 500) : rng.step(20000, 120000, 5000);
      const D = unknown === 'drawings' ? 12 * rest + part : rng.step(24000, 120000, 1000);
      const A = unknown === 'drawings' ? rng.step(10000, 100000, 5000) : part + rest;
      const c1 = c0 + r + A - D;
      if (c1 < 100000) return null;
      const L0 = rng.step(40000, 250000, 1000), L1 = rng.step(40000, 250000, 1000);
      return { ...b, unknown, A0: c0 + L0, L0, A1: c1 + L1, L1, c0, c1, r, D, A, part, rest };
    }),
  context: (s) =>
    [
      `${s.who} A page of the notebook for the ${s.p.year} is lost, so ${s.unknown === 'drawings' ? 'the total drawings are' : 'the additional capital is'} not known.`,
      `Total assets on ${s.p.start}: ${inr(s.A0)}`,
      `Total liabilities on ${s.p.start}: ${inr(s.L0)}`,
      `Total assets on ${s.p.end}: ${inr(s.A1)}`,
      `Total liabilities on ${s.p.end}: ${inr(s.L1)}`,
      resultLine(s.r),
      s.unknown === 'drawings' ? `Additional capital introduced during the year: ${inr(s.A)}` : `Drawings during the year: ${inr(s.D)}`,
      s.unknown === 'drawings'
        ? `The drawings were goods costing ${inr(s.part)} and an equal sum of cash every month, nothing else.`
        : `The capital brought in was a personal laptop worth ${inr(s.part)}, and the rest in cash.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.c0, [[s.A0 + s.L0, 'Added the liabilities to the assets.'], [s.A0, 'Left out the liabilities.'], [s.c1, 'Worked the closing capital.']]);
        return n && { prompt: `What was the capital on ${s.p.start}?`, ...n, explanation: [`${inr(s.A0)} - ${inr(s.L0)} = ${inr(s.c0)}.`], hints: H.capital };
      },
      verify: (q) => {
        const [a0, l0] = amountsIn(ctx(q));
        return q.answer === rupees(a0 - l0);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.c1, [[s.A1 + s.L1, 'Added the liabilities to the assets.'], [s.A1, 'Left out the liabilities.'], [s.c0, 'Worked the opening capital.']]);
        return n && { prompt: `What was the capital on ${s.p.end}?`, ...n, explanation: [`${inr(s.A1)} - ${inr(s.L1)} = ${inr(s.c1)}.`], hints: H.capital };
      },
      verify: (q) => {
        const [, , a1, l1] = amountsIn(ctx(q));
        return q.answer === rupees(a1 - l1);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        s.unknown === 'drawings'
          ? choice(
              'Which working gives the drawings?',
              'Opening capital + additional capital + profit (or - loss) - closing capital',
              [
                ['Closing capital + additional capital + profit (or - loss) - opening capital', 'The capitals are the wrong way round: drawings are what is missing from the closing capital.'],
                ['Opening capital - closing capital', 'That leaves out the profit and the capital brought in.'],
                ['Closing capital + profit (or - loss) - opening capital - additional capital', 'That runs the wrong way: it would treat the drawings as what raised the capital.'],
              ],
              'Closing capital = opening capital + additional capital + profit - drawings, so the drawings are what the first three leave after the closing capital is taken off.',
              H.unknown,
            )
          : choice(
              'Which working gives the additional capital?',
              'Closing capital + drawings - opening capital - profit (or + loss)',
              [
                ['Opening capital + drawings - closing capital - profit (or + loss)', 'The capitals are the wrong way round.'],
                ['Closing capital - opening capital', 'That leaves out the drawings and the result.'],
                ['Closing capital + drawings + opening capital + profit', 'Nothing has been taken off: this is not a difference at all.'],
              ],
              'Closing capital = opening capital + additional capital + profit - drawings, so the additional capital is what the closing capital needs beyond the others.',
              H.unknown,
            ),
      verify: (q) => optionText(q).startsWith(ctx(q).includes('total drawings are') ? 'Opening capital + additional' : 'Closing capital + drawings'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const total = s.unknown === 'drawings' ? s.D : s.A;
        const other = s.unknown === 'drawings' ? s.A : s.D;
        const n = numeric(total, [
          [Math.abs(s.c1 - s.c0), 'Took the change in capital and did nothing more.'],
          [total - other, s.unknown === 'drawings' ? 'Left the additional capital out of the formula.' : 'Left the drawings out of the formula.'],
          [total - 2 * other, s.unknown === 'drawings' ? 'Deducted the additional capital instead of adding it.' : 'Deducted the drawings instead of adding them.'],
          [s.unknown === 'drawings' ? total - 2 * s.r : total + 2 * s.r, s.r >= 0 ? 'Took the profit the wrong way in the formula.' : 'Took the loss the wrong way in the formula.'],
        ]);
        return n && {
          prompt: s.unknown === 'drawings' ? 'What were the total drawings of the year?' : 'How much additional capital was brought in during the year?',
          ...n,
          explanation:
            s.unknown === 'drawings'
              ? [`Drawings = ${inr(s.c0)} + ${inr(s.A)} ${s.r >= 0 ? '+' : '-'} ${inr(Math.abs(s.r))} - ${inr(s.c1)} = ${inr(s.D)}.`]
              : [`Additional capital = ${inr(s.c1)} + ${inr(s.D)} - ${inr(s.c0)} ${s.r >= 0 ? '-' : '+'} ${inr(Math.abs(s.r))} = ${inr(s.A)}.`],
          hints: H.unknown,
        };
      },
      verify: (q) => q.answer === rupees(lostOf(ctx(q)).value),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        if (s.unknown === 'drawings') {
          const n = numeric(s.rest, whole([
            [s.D / 12, 'Divided all the drawings by twelve, the goods among them.'],
            [s.D - s.part, 'Gave the cash of the whole year, not of one month.'],
            [(s.D + s.part) / 12, 'Added the goods to the drawings instead of taking them off.'],
          ]));
          return n && { prompt: 'How much cash did the proprietor draw every month?', ...n, explanation: [`Cash drawn in the year = ${inr(s.D)} - goods ${inr(s.part)} = ${inr(s.D - s.part)}.`, `Every month = ${inr(s.D - s.part)} ÷ 12 = ${inr(s.rest)}.`], hints: ['Take the goods out of the total drawings first.', 'Twelve equal monthly sums make up the cash of the year.'] };
        }
        const n = numeric(s.rest, [
          [s.A, 'Gave the whole of the additional capital; the laptop is part of it.'],
          [s.A + s.part, 'Added the laptop instead of taking it off.'],
          [s.part, 'Gave the laptop, not the cash.'],
        ]);
        return n && { prompt: 'How much of the additional capital was brought in as cash?', ...n, explanation: [`Cash = ${inr(s.A)} - laptop ${inr(s.part)} = ${inr(s.rest)}.`], hints: ['Capital may be brought in as an asset as well as in cash.', 'Take the asset out of the total capital brought in.'] };
      },
      verify: (q) => {
        const t = ctx(q);
        const { kind, value } = lostOf(t);
        const part = amountsIn(t.split('\n').at(-1)!)[0];
        return q.answer === rupees(kind === 'drawings' ? (value - part) / 12 : value - part);
      },
    },
  ],
});

/** The figure a "lost figure" case asks for, worked from its printed lines. */
function lostOf(text: string): { kind: 'drawings' | 'additional'; value: number } {
  const [a0, l0, a1, l1] = amountsIn(text);
  const f = I.factsOf(text);
  const result = (f.profit ?? 0) - (f.loss ?? 0);
  return text.includes('total drawings are')
    ? { kind: 'drawings', value: a0 - l0 + f.additional + result - (a1 - l1) }
    : { kind: 'additional', value: a1 - l1 + f.drawings - (a0 - l0) - result };
}

// ---------------------------------------------------------------------------------------------------------------
// 7. A bank balance and an overdraft
// ---------------------------------------------------------------------------------------------------------------

interface Overdraft extends Year {
  /** True when the overdraft is at the end of the year, false when it is at the start. */
  atEnd: boolean;
  bank: number;
  over: number;
  rent: number;
}

const overdraftYear = caseTemplate<Overdraft>({
  ...common,
  id: 'case-ir-overdraft-year',
  difficulty: 'medium',
  title: 'A bank balance and an overdraft',
  setup: (rng) =>
    firstGood(40, () => {
      const items = I.twoDates(rng, 4, 2);
      if (!items || !stockHolds(items)) return null;
      const rest = items.filter((i) => !['Cash at bank', 'Bank overdraft', 'Outstanding rent'].includes(i.label));
      // The other side of the statement is never empty: the suppliers are owed something on both dates.
      if (!rest.some((i) => i.label === 'Creditors' && i.v0 > 0 && i.v1 > 0)) {
        const others = rest.filter((i) => i.label !== 'Creditors');
        rest.length = 0;
        rest.push(...others, { label: 'Creditors', side: 'liability', v0: rng.step(30000, 120000, 1000), v1: rng.step(30000, 120000, 1000) });
      }
      const atEnd = rng.next() < 0.7;
      const bank = rng.step(20000, 120000, 1000), over = rng.step(15000, 60000, 1000), rent = rng.step(2000, 12000, 500);
      const list: Dated[] = [
        ...rest,
        atEnd ? { label: 'Cash at bank', side: 'asset', v0: bank, v1: 0 } : { label: 'Cash at bank', side: 'asset', v0: 0, v1: bank },
        atEnd ? { label: 'Bank overdraft', side: 'liability', v0: 0, v1: over } : { label: 'Bank overdraft', side: 'liability', v0: over, v1: 0 },
        { label: 'Outstanding rent', side: 'liability', v0: 0, v1: rent },
      ];
      const d = I.cashDrawings(rng, 24000, 96000);
      const a = rng.next() < 0.4 ? I.capitalIn(rng, 20000, 100000) : null;
      const r = settle(rng, list, d.total, a?.amount ?? 0, [20000, 160000]);
      if (r === null || I.capOf(list, 'v0') < 60000) return null;
      const k = rng.pick(I.PRIVATE_KINDS);
      return { ...base(rng), items: list, d, g: null, a, D: d.total, A: a?.amount ?? 0, c0: I.capOf(list, 'v0'), c1: I.capOf(list, 'v1'), r, priv: { label: k.label, value: 0 }, atEnd, bank, over, rent };
    }),
  context: (s) =>
    [
      `${s.who} These figures were collected for the ${s.p.year}.`,
      ...s.items.map((i) => I.twoDateLine(i.label, i.v0, i.v1, s.p)),
      ...moneyLines(s),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `Where does the bank overdraft of ${s.atEnd ? s.p.end : s.p.start} go in the statement of affairs of that date?`,
          'Among the liabilities: the business owes it to the bank',
          [
            ['Among the assets, as cash at bank', 'An overdraft is money owed to the bank, not money held there.'],
            ['Among the assets, as a part of cash in hand', 'Cash in hand is money the business holds; an overdraft is money it owes.'],
            ['Nowhere: only the balance at the bank is listed', 'What the business owes must be listed, or the capital is overstated.'],
          ],
          'An overdraft is an amount owed to the bank, so it stands with the liabilities and reduces the capital.',
          H.capital,
        ),
      verify: (q) => optionText(q).startsWith('Among the liabilities'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A0 = assetsOn(s.items, 'v0'), L0 = debtsOn(s.items, 'v0');
        const n = numeric(s.c0, [
          [s.atEnd ? 0 : s.c0 + 2 * s.over, 'Counted the overdraft as an asset.'],
          [s.atEnd ? 0 : s.c0 + s.over, 'Left the overdraft out.'],
          [s.atEnd ? s.c0 - s.bank : 0, 'Left out the bank balance.'],
          [s.atEnd ? s.c0 - s.over : 0, 'Took the overdraft of the closing date into the opening statement.'],
          [A0 + L0, 'Added the liabilities to the assets.'],
          [A0, 'Left out the liabilities.'],
        ]);
        return n && { prompt: `What was the capital on ${s.p.start}?`, ...n, explanation: [`Assets ${inr(A0)} - liabilities ${inr(L0)} = ${inr(s.c0)}.`], hints: H.capital };
      },
      verify: (q) => q.answer === rupees(yearOf(ctx(q)).c0),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A1 = assetsOn(s.items, 'v1'), L1 = debtsOn(s.items, 'v1');
        const n = numeric(s.c1, [
          [s.atEnd ? s.c1 + 2 * s.over : 0, 'Counted the overdraft as an asset.'],
          [s.atEnd ? s.c1 + s.over : 0, 'Left the overdraft out.'],
          [s.c1 + s.rent, 'Left out the rent that is owed.'],
          [s.c1 + 2 * s.rent, 'Counted the outstanding rent as an asset.'],
          [A1 + L1, 'Added the liabilities to the assets.'],
        ]);
        return n && { prompt: `What was the capital on ${s.p.end}?`, ...n, explanation: [`Assets ${inr(A1)} - liabilities ${inr(L1)} = ${inr(s.c1)}.`, 'Outstanding rent is an amount the business owes.'], hints: H.capital };
      },
      verify: (q) => q.answer === rupees(yearOf(ctx(q)).c1),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.r, [
          [s.atEnd ? s.r + 2 * s.over : s.r - 2 * s.over, 'Counted the overdraft as an asset.'],
          [s.r + s.rent, 'Left out the rent that is owed at the end of the year.'],
          [s.r - s.D, 'Left out the drawings.'],
          [s.A ? s.r + s.A : 0, 'Did not deduct the capital brought in.'],
        ]);
        return n && {
          prompt: `What was the profit of the ${s.p.year}?`,
          ...n,
          explanation: [`Drawings = ${s.d.how}.`, `Profit = ${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} - ${inr(s.c0)} = ${inr(s.r)}.`],
          hints: H.profit,
        };
      },
      verify: (q) => q.answer === rupees(yearOf(ctx(q)).result),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 8. Adjustments after the comparison
// ---------------------------------------------------------------------------------------------------------------

interface Adjusted extends Base {
  c0: number;
  c1: number;
  d: IrDrawn;
  a: Added | null;
  D: number;
  A: number;
  p0: number;
  adjs: IrAdj[];
  net: number;
}

const plain = (x: IrAdj): string => x.label.replace(/^(Less|Add): /, '');
/** True when the rent of one date would be both owing and paid in advance: a landlord is not owed and overpaid at once. */
const rentBothWays = (adjs: readonly IrAdj[], items: readonly IrItem[] = []): boolean =>
  adjs.some((x) => x.label === 'Add: Prepaid rent') && (adjs.some((x) => x.label === 'Less: Outstanding rent') || items.some((i) => i.label === 'Outstanding rent'));

function drawAdjusted(rng: Rng, keys: readonly IrAdjKey[], range: [number, number]): Adjusted | null {
  return firstGood(40, () => {
    const b = base(rng);
    const c0 = rng.step(200000, 800000, 10000);
    const p0 = rng.step(...range, 1000);
    const d = I.cashDrawings(rng, 24000, 120000);
    const a = rng.next() < 0.5 ? I.capitalIn(rng) : null;
    const D = d.total, A = a?.amount ?? 0;
    const c1 = c0 + p0 + A - D;
    if (c1 < 80000) return null;
    const adjs = I.makeAdjs(rng, keys, c0);
    if (!adjs || rentBothWays(adjs)) return null;
    const net = p0 + sum(adjs.map((x) => x.effect));
    return net === 0 ? null : { ...b, c0, c1, d, a, D, A, p0, adjs, net };
  });
}

const adjustedLines = (s: Adjusted): string[] => [I.openLine(s.p, s.c0), I.closeLine(s.p, s.c1), s.d.line, ...(s.a ? [s.a.line] : []), 'Adjustments, made after the statement of affairs on the closing date was drawn up:', ...s.adjs.map((x) => x.line)];
const adjustedText = (s: Adjusted, lead: string): string => [`${s.who} ${lead}`, ...adjustedLines(s)].join('\n');
/** The net result of a case in the form of `adjustedLines`, from the printed lines. */
function netOf(text: string): { before: number; net: number; opening: number; count: number } {
  const f = I.factsOf(text);
  const opening = f.opening ?? NaN;
  const before = (f.closing ?? NaN) + f.drawings - f.additional - opening;
  const adj = I.adjustmentsIn(text, opening);
  return { before, net: before + adj.effect, opening, count: adj.count };
}

const afterComparison = caseTemplate<Adjusted>({
  ...common,
  id: 'case-ir-adjust-after',
  // Version 2: the wrong options of the third question name only adjustments that are in the case.
  version: 2,
  difficulty: 'medium',
  title: 'Adjustments after the comparison',
  setup: (rng) => {
    const add: IrAdjKey = rng.pick(['pre', 'acc'] as const);
    const others = rng.shuffle(['dep', 'pdd', 'out'] as IrAdjKey[]).slice(0, rng.int(1, 2));
    return drawAdjusted(rng, ['ioc', ...others, add], [120000, 320000]);
  },
  context: (s) => adjustedText(s, `The capitals of the ${s.p.year} were found from statements of affairs.`),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.p0, [
          [s.c1 - s.c0, 'Took the change in capital, leaving out the drawings and the capital brought in.'],
          [s.p0 - s.D, 'Left out the drawings.'],
          [s.A ? s.p0 + s.A : 0, 'Did not deduct the capital brought in.'],
          [s.net > 0 ? s.net : 0, 'Went straight to the adjusted figure; this question asks for the profit before the adjustments.'],
        ]);
        return n && { prompt: 'What profit do the capitals show, before the adjustments?', ...n, explanation: [`${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} - ${inr(s.c0)} = ${inr(s.p0)}.`], hints: H.profit };
      },
      verify: (q) => q.answer === rupees(netOf(ctx(q)).before),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ioc = s.adjs.find((x) => x.key === 'ioc')!;
        const rate = rateIn(ioc);
        const n = numeric(-ioc.effect, whole([
          [(s.c1 * rate) / 100, 'Worked the interest on the closing capital; it is on the capital at the beginning of the year.'],
          [((s.c0 + s.A) * rate) / 100, 'Added the capital brought in to the capital the interest is worked on.'],
          [(s.p0 * rate) / 100, 'Worked the interest on the profit.'],
        ]));
        return n && { prompt: 'How much is the interest on capital?', ...n, explanation: [ioc.how], hints: H.adjust };
      },
      verify: (q) => {
        const t = ctx(q);
        const rate = Number(/allowed at (\d+)% p\.a\./.exec(t)?.[1]);
        return q.answer === rupees((netOf(t).opening * rate) / 100);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const up = s.adjs.find((x) => x.effect > 0)!;
        // Only the adjustments of this case, and the slip of thinking that every adjustment lowers the profit.
        const NONE = 'None of them: every adjustment is deducted from the profit found';
        const pool = [...s.adjs.filter((x) => x.effect < 0).map(plain), NONE];
        return choice(
          'Which of these adjustments raises the profit found?',
          plain(up),
          pool.map((text): [string, string] => [
            text,
            text === NONE
              ? 'Took every adjustment as a deduction; an asset the closing statement left out raises the closing capital, and so the profit.'
              : `This one is deducted: ${text === 'Interest on capital' ? 'it is a transfer within the capital that the statements cannot show' : 'it is an expense or a loss of value the closing statement left out'}.`,
          ]),
          `${plain(up)} is an asset the closing statement left out, so the closing capital and the profit were understated. Each of the others is deducted.`,
          H.adjust,
        );
      },
      verify: (q) => /^(Prepaid|Accrued)/.test(optionText(q)),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const down = s.adjs.filter((x) => x.effect < 0);
        const up = sum(s.adjs.filter((x) => x.effect > 0).map((x) => x.effect));
        const all = -sum(down.map((x) => x.effect));
        const n = numeric(all, [
          [all + up, 'Counted the prepaid or accrued item among the deductions; it is added.'],
          [all - up, 'Set the item that is added against the deductions.'],
          [all + s.adjs.find((x) => x.key === 'ioc')!.effect, 'Left out the interest on capital.'],
        ]);
        return n && { prompt: 'What is the total of the amounts deducted from the profit found?', ...n, explanation: [...down.map((x) => x.how), `Total deducted = ${inr(all)}.`], hints: H.adjust };
      },
      verify: (q) => {
        const t = ctx(q);
        const added = amountsIn(t.split('\n').filter((l) => /(paid in advance|not yet received), not in the closing statement/.test(l)).join(' '));
        const { before, net } = netOf(t);
        return q.answer === rupees(before + sum(added) - net);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const up = sum(s.adjs.filter((x) => x.effect > 0).map((x) => x.effect));
        const n = numeric(s.net, [
          [s.p0, 'Left out the adjustments.'],
          [s.p0 - sum(s.adjs.map((x) => Math.abs(x.effect))), 'Deducted every adjustment, the prepaid or accrued item too.'],
          [s.net - 2 * s.adjs.find((x) => x.key === 'ioc')!.effect, 'Added the interest on capital instead of deducting it.'],
          [s.net - up, 'Left out the item that is added.'],
        ]);
        return n && {
          prompt: `What is the net profit of the ${s.p.year}?`,
          ...n,
          explanation: [`Profit found = ${inr(s.p0)}.`, ...s.adjs.map((x) => x.how), `Net profit = ${inr(s.net)}.`],
          hints: H.adjust,
        };
      },
      verify: (q) => q.answer === rupees(netOf(ctx(q)).net),
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 9. Two years of one shop
// ---------------------------------------------------------------------------------------------------------------

interface TwoYears extends Base {
  y: number;
  caps: [number, number, number];
  debts: [number, number, number];
  D: [number, number];
  A: [number, number];
  r: [number, number];
  mid: string;
  y1: string;
  y2: string;
}

const twoYears = caseTemplate<TwoYears>({
  ...common,
  id: 'case-ir-two-years',
  difficulty: 'medium',
  title: 'Two years of one shop',
  setup: (rng) =>
    firstGood(30, () => {
      const t = rng.pick(I.TRADERS);
      const y = rng.pick([2022, 2023, 2024]);
      const c0 = rng.step(250000, 700000, 10000);
      const r: [number, number] = [rng.step(40000, 220000, 1000), rng.next() < 0.3 ? -rng.step(10000, 40000, 1000) : rng.step(40000, 220000, 1000)];
      const D: [number, number] = [rng.step(24000, 120000, 1000), rng.step(24000, 120000, 1000)];
      const A: [number, number] = [rng.next() < 0.5 ? rng.step(20000, 100000, 5000) : 0, rng.next() < 0.5 ? rng.step(20000, 100000, 5000) : 0];
      const c1 = c0 + r[0] + A[0] - D[0];
      const c2 = c1 + r[1] + A[1] - D[1];
      if (c1 < 100000 || c2 < 100000 || r[0] === r[1] || r[0] + r[1] <= 0) return null;
      const debts: [number, number, number] = [rng.step(30000, 200000, 1000), rng.step(30000, 200000, 1000), rng.step(30000, 200000, 1000)];
      return { t, who: I.intro(rng, t), p: { start: `1 April ${y}`, end: `31 March ${y + 2}`, year: '' }, y, caps: [c0, c1, c2], debts, D, A, r, mid: `31 March ${y + 1}`, y1: `${y}-${String(y + 1).slice(2)}`, y2: `${y + 1}-${String(y + 2).slice(2)}` };
    }),
  context: (s) =>
    [
      `${s.who} The figures of two years were collected.`,
      `${s.p.start}: assets ${inr(s.caps[0] + s.debts[0])}, liabilities ${inr(s.debts[0])}`,
      `${s.mid}: assets ${inr(s.caps[1] + s.debts[1])}, liabilities ${inr(s.debts[1])}`,
      `${s.p.end}: assets ${inr(s.caps[2] + s.debts[2])}, liabilities ${inr(s.debts[2])}`,
      `Drawings in ${s.y1}: ${inr(s.D[0])}`,
      `Drawings in ${s.y2}: ${inr(s.D[1])}`,
      ...(s.A[0] ? [`Additional capital brought in during ${s.y1}: ${inr(s.A[0])}`] : []),
      ...(s.A[1] ? [`Additional capital brought in during ${s.y2}: ${inr(s.A[1])}`] : []),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.caps[1], [[s.caps[1] + 2 * s.debts[1], 'Added the liabilities to the assets.'], [s.caps[1] + s.debts[1], 'Left out the liabilities.'], [s.caps[0], 'Worked the capital of the first date.'], [s.caps[2], 'Worked the capital of the last date.']]);
        return n && { prompt: `What was the capital on ${s.mid}?`, ...n, explanation: [`${inr(s.caps[1] + s.debts[1])} - ${inr(s.debts[1])} = ${inr(s.caps[1])}.`, 'The capital at the end of the first year is the capital at the start of the second.'], hints: H.capital };
      },
      verify: (q) => {
        const f = twoYearsOf(ctx(q));
        return q.answer === rupees(f.caps[1]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.r[0], [
          [s.caps[1] - s.caps[0], 'Took the rise in capital as the profit.'],
          [s.r[0] - s.D[0], 'Left out the drawings.'],
          [s.A[0] ? s.r[0] + s.A[0] : 0, 'Did not deduct the capital brought in.'],
          [s.caps[1] + s.D[1] - s.A[1] - s.caps[0], `Used the figures of ${s.y2} for the drawings and the capital brought in.`],
        ]);
        return n && { prompt: `What was the profit of ${s.y1}?`, ...n, explanation: [`${inr(s.caps[1])} + ${inr(s.D[0])}${s.A[0] ? ` - ${inr(s.A[0])}` : ''} - ${inr(s.caps[0])} = ${inr(s.r[0])}.`], hints: H.profit };
      },
      verify: (q) => q.answer === rupees(twoYearsOf(ctx(q)).r[0]),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const r = Math.abs(s.r[1]);
        const n = numeric(r, [
          [Math.abs(s.caps[2] - s.caps[1]), 'Took the change in capital as the result.'],
          [Math.abs(s.caps[2] + s.D[1] - s.A[1] - s.caps[0]), `Compared with the capital of ${s.p.start}, not with that of ${s.mid}.`],
          [s.A[1] ? Math.abs(s.caps[2] + s.D[1] - s.caps[1]) : 0, 'Did not deduct the capital brought in.'],
          [Math.abs(s.caps[2] + s.D[0] - s.A[1] - s.caps[1]), `Used the drawings of ${s.y1}.`],
        ]);
        return n && { prompt: `What was the amount of the profit or loss of ${s.y2}? Type the amount.`, ...n, explanation: [`Adjusted closing capital = ${inr(s.caps[2])} + ${inr(s.D[1])}${s.A[1] ? ` - ${inr(s.A[1])}` : ''} = ${inr(s.caps[2] + s.D[1] - s.A[1])}.`, `Less the capital on ${s.mid}, ${inr(s.caps[1])}: ${lower(resultText(s.r[1]))}.`], hints: H.profit };
      },
      verify: (q) => q.answer === rupees(Math.abs(twoYearsOf(ctx(q)).r[1])),
    },
    {
      kind: 'mcq',
      make: (s) => {
        const better = s.r[0] > s.r[1] ? s.y1 : s.y2;
        const worse = better === s.y1 ? s.y2 : s.y1;
        const [hi, lo] = [Math.max(...s.r), Math.min(...s.r)];
        return choice(
          'Which year did the better business, and what were the two results?',
          `${better}: ${lower(resultText(hi))}, against ${lower(resultText(lo))} in ${worse}`,
          [
            [`${worse}: ${lower(resultText(lo))}, against ${lower(resultText(hi))} in ${better}`, 'Read the two results the wrong way round.'],
            [`${s.caps[2] - s.caps[1] > s.caps[1] - s.caps[0] ? s.y2 : s.y1}, since its capital rose more`, 'The capital moved with the drawings and the capital brought in as well; only the result shows how the business did.'],
            [`${s.D[1] > s.D[0] ? s.y2 : s.y1}, since the proprietor drew more`, 'Drawings say what the proprietor took, not what the business earned.'],
            ...(s.A[0] === s.A[1] ? [] : [[`${s.A[1] > s.A[0] ? s.y2 : s.y1}, since more capital came in`, 'Capital brought in is not earned; it is deducted in finding the result.'] as [string, string]]),
          ],
          `The results are compared, not the capitals: ${s.y1} ${lower(resultText(s.r[0]))}, ${s.y2} ${lower(resultText(s.r[1]))}.`,
          H.profit,
        );
      },
      verify: (q) => {
        const r = twoYearsOf(ctx(q)).r;
        return optionText(q).includes(`against ${lower(resultText(Math.min(...r)))}`) && optionText(q).includes(lower(resultText(Math.max(...r))));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const both = s.r[0] + s.r[1];
        const D = s.D[0] + s.D[1], A = s.A[0] + s.A[1];
        const n = numeric(both, [
          [s.caps[2] - s.caps[0], 'Took the change in capital over the two years, leaving out the drawings and the capital brought in.'],
          [both - D, 'Left out the drawings of the two years.'],
          [both - s.D[0], `Left out the drawings of ${s.y1}.`],
          [both - s.D[1], `Left out the drawings of ${s.y2}.`],
          [A ? both + A : 0, 'Did not deduct the capital brought in.'],
          [s.r[0] + Math.abs(s.r[1]), s.r[1] < 0 ? 'Added the loss of the second year instead of setting it against the profit.' : 'Added the figures wrongly.'],
        ]);
        return n && {
          prompt: `What was the total profit of the two years taken together?`,
          ...n,
          explanation: [`From the first and last capitals: ${inr(s.caps[2])} + drawings ${inr(D)}${A ? ` - capital brought in ${inr(A)}` : ''} - ${inr(s.caps[0])} = ${inr(both)}.`, `The two results add up to the same figure.`],
          hints: ['The two years can be taken as one: compare the first capital with the last.', 'Add back the drawings of both years and take off the capital brought in during both.'],
        };
      },
      verify: (q) => {
        const f = twoYearsOf(ctx(q));
        return q.answer === rupees(f.caps[2] + f.D[0] + f.D[1] - f.A[0] - f.A[1] - f.caps[0]);
      },
    },
  ],
});

/** The three capitals, and the drawings, capital brought in and result of each year, from the printed lines. */
function twoYearsOf(text: string): { caps: number[]; D: number[]; A: number[]; r: number[] } {
  const lines = text.split('\n');
  const caps = lines.filter((l) => /: assets ₹/.test(l)).map((l) => {
    const [a, b] = amountsIn(l);
    return a - b;
  });
  const years = lines.filter((l) => l.startsWith('Drawings in ')).map((l) => /Drawings in ([\d-]+):/.exec(l)![1]);
  const D = lines.filter((l) => l.startsWith('Drawings in ')).map((l) => amountsIn(l)[0]);
  const A = years.map((y) => lineAmounts(text, `Additional capital brought in during ${y}`)[0] ?? 0);
  const r = [caps[1] + D[0] - A[0] - caps[0], caps[2] + D[1] - A[1] - caps[1]];
  return { caps, D, A, r };
}

// ---------------------------------------------------------------------------------------------------------------
// 10. The statement corrected
// ---------------------------------------------------------------------------------------------------------------

interface Corrected extends Base {
  items: IrItem[];
  asset: IrItem;
  debtors: IrItem;
  depRate: number;
  pddRate: number;
  dep: number;
  pdd: number;
  out: { name: string; amount: number } | null;
  pre: { name: string; amount: number } | null;
  d: IrDrawn;
  a: Added | null;
  c0: number;
  raw: number;
  c1: number;
  r: number;
}

const FIXED = ['Furniture', 'Machinery', 'Delivery van'];
/** A fixed asset of the list as it stands in the middle of a sentence. */
const assetName = (i: IrItem): string => (i.label === 'Delivery van' ? 'the delivery van' : i.label.toLowerCase());

const statementCorrected = caseTemplate<Corrected>({
  ...common,
  id: 'case-ir-statement-corrected',
  difficulty: 'complex',
  title: 'The statement corrected',
  setup: (rng) =>
    firstGood(60, () => {
      const nAssets = rng.int(4, 5);
      const items = I.drawItems(rng, nAssets, nAssets === 5 ? 1 : rng.int(1, 2));
      const asset = items.find((i) => FIXED.includes(i.label));
      const debtors = items.find((i) => i.label === 'Debtors');
      if (!asset || !debtors) return null;
      const depRate = rng.pick([10, 15, 20]), pddRate = rng.pick([2, 4, 5, 10]);
      const dep = (asset.value * depRate) / 100, pdd = (debtors.value * pddRate) / 100;
      if (!Number.isInteger(dep) || !Number.isInteger(pdd)) return null;
      const listed = (label: string) => items.some((i) => i.label === label);
      const out = rng.next() < 0.6 ? { name: rng.pick(['Salaries', 'Rent', 'Wages'].filter((n) => !listed(`Outstanding ${n.toLowerCase()}`))), amount: rng.step(2000, 15000, 500) } : null;
      // Rent is not both owing and paid in advance on one date.
      const rentOwing = listed('Outstanding rent') || out?.name === 'Rent';
      const prepaid = ['Insurance', 'Rent'].filter((n) => !listed(`Prepaid ${n.toLowerCase()}`) && !(n === 'Rent' && rentOwing));
      const pre = prepaid.length > 0 && rng.next() < 0.5 ? { name: rng.pick(prepaid), amount: rng.step(1000, 9000, 500) } : null;
      const d = I.cashDrawings(rng, 24000, 96000);
      const a = rng.next() < 0.4 ? I.capitalIn(rng) : null;
      const raw = I.total(items, 'asset') - I.total(items, 'liability');
      const c1 = raw - dep - pdd - (out?.amount ?? 0) + (pre?.amount ?? 0);
      const c0 = Math.round((c1 + d.total - (a?.amount ?? 0) - rng.step(20000, 180000, 1000)) / 1000) * 1000;
      const r = c1 + d.total - (a?.amount ?? 0) - c0;
      if (c1 < 80000 || c0 < 80000) return null;
      return { ...base(rng), items, asset, debtors, depRate, pddRate, dep, pdd, out, pre, d, a, c0, raw, c1, r };
    }),
  context: (s) =>
    [
      s.who,
      I.openLine(s.p, s.c0),
      s.d.line,
      ...(s.a ? [s.a.line] : []),
      `Rough list of assets and liabilities on ${s.p.end}:`,
      ...s.items.map(I.itemLine),
      `Before finding the capital on that date, depreciate ${assetName(s.asset)} by ${s.depRate}% of the figure above and provide ${s.pddRate}% of the debtors above for doubtful debts.`,
      ...(s.out ? [`${s.out.name} outstanding, not in the list: ${inr(s.out.amount)}.`] : []),
      ...(s.pre ? [`${s.pre.name} paid in advance, not in the list: ${inr(s.pre.amount)}.`] : []),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.dep, whole([[s.asset.value - s.dep, 'Gave the value after depreciation, not the depreciation.'], [s.pdd, 'Worked the provision, not the depreciation.'], [(s.asset.value * s.pddRate) / 100, 'Used the rate of the provision.']]));
        return n && { prompt: `How much depreciation is taken off ${assetName(s.asset)}?`, ...n, explanation: [`${s.depRate}% of ${inr(s.asset.value)} = ${inr(s.dep)}.`], hints: H.adjust };
      },
      verify: (q) => {
        const t = ctx(q);
        const rate = Number(/by (\d+)% of the figure above/.exec(t)?.[1]);
        const name = /depreciate (.+) by \d+%/.exec(t)?.[1] ?? '';
        const item = I.itemsIn(t).find((i) => assetName(i) === name);
        return item !== undefined && q.answer === rupees((item.value * rate) / 100);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.pdd, whole([[s.debtors.value - s.pdd, 'Gave the debtors after the provision, not the provision.'], [s.dep, 'Worked the depreciation, not the provision.'], [(s.debtors.value * s.depRate) / 100, 'Used the rate of the depreciation.']]));
        return n && { prompt: 'How much is the provision for doubtful debts?', ...n, explanation: [`${s.pddRate}% of ${inr(s.debtors.value)} = ${inr(s.pdd)}.`], hints: H.adjust };
      },
      verify: (q) => {
        const t = ctx(q);
        const rate = Number(/provide (\d+)% of the debtors/.exec(t)?.[1]);
        return q.answer === rupees((lineAmounts(t, 'Debtors:')[0] * rate) / 100);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const add = s.pre?.amount ?? 0, owe = s.out?.amount ?? 0;
        const n = numeric(s.c1, [
          [s.raw, 'Left the list as it was, without the corrections.'],
          [s.raw - s.dep - s.pdd, s.out || s.pre ? 'Made the two percentages and left out the other corrections.' : 'Added the amounts wrongly.'],
          [add ? s.c1 - 2 * add : 0, 'Deducted the prepaid expense; it is an asset left out of the list.'],
          [owe ? s.c1 + 2 * owe : 0, 'Added the outstanding expense; it is a liability left out of the list.'],
          [s.raw + s.dep + s.pdd, 'Added the depreciation and the provision instead of deducting them.'],
        ]);
        return n && {
          prompt: `What is the capital on ${s.p.end} once the list is corrected?`,
          ...n,
          explanation: [
            `Capital by the rough list = ${inr(I.total(s.items, 'asset'))} - ${inr(I.total(s.items, 'liability'))} = ${inr(s.raw)}.`,
            `Less depreciation ${inr(s.dep)} and provision ${inr(s.pdd)}.`,
            ...(s.out ? [`Less ${s.out.name.toLowerCase()} outstanding ${inr(s.out.amount)}: a liability.`] : []),
            ...(s.pre ? [`Add ${s.pre.name.toLowerCase()} paid in advance ${inr(s.pre.amount)}: an asset.`] : []),
            `Corrected capital = ${inr(s.c1)}.`,
          ],
          hints: H.capital,
        };
      },
      verify: (q) => q.answer === rupees(correctedOf(ctx(q)).c1),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const A = s.a?.amount ?? 0;
        const n = numeric(s.r, [
          [s.raw + s.d.total - A - s.c0, 'Used the capital of the rough list, without the corrections.'],
          [s.r - s.d.total, 'Left out the drawings.'],
          [A ? s.r + A : 0, 'Did not deduct the capital brought in.'],
          [s.c1 - s.c0, 'Took the change in capital as the profit.'],
        ]);
        return n && { prompt: `What was the profit of the ${s.p.year}?`, ...n, explanation: [`${inr(s.c1)} + ${inr(s.d.total)}${A ? ` - ${inr(A)}` : ''} - ${inr(s.c0)} = ${inr(s.r)}.`], hints: H.profit };
      },
      verify: (q) => {
        const t = ctx(q);
        const f = I.factsOf(t);
        return q.answer === rupees(correctedOf(t).c1 + f.drawings - f.additional - f.opening!);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'Suppose the rough list had been used for the capital, and the same corrections made afterwards to the profit found. What would the net profit be?',
          `The same, ${inr(s.r)}: each correction changes the closing capital and the profit by the same amount`,
          [
            [`${inr(s.raw + s.d.total - (s.a?.amount ?? 0) - s.c0)}: corrections made afterwards do not count`, 'That is the profit before the corrections; made afterwards they are deducted or added just the same.'],
            ['Less than before: the depreciation would be charged twice', 'It is charged once, either in the closing statement or on the profit, never both.'],
            ['Nothing can be said without the books of account', 'The two ways are the same sum in a different order.'],
          ],
          'Whether a correction goes through the closing capital or is made to the profit found, it moves the result by the same amount.',
          H.adjust,
        ),
      verify: (q) => {
        const t = ctx(q);
        const f = I.factsOf(t);
        return amountsIn(optionText(q))[0] === correctedOf(t).c1 + f.drawings - f.additional - f.opening!;
      },
    },
  ],
});

/** The corrected closing capital of a case in the form of `statementCorrected`, from the printed lines. */
function correctedOf(text: string): { c1: number } {
  const items = I.itemsIn(text);
  const rate = Number(/by (\d+)% of the figure above/.exec(text)?.[1]);
  const name = /depreciate (.+) by \d+%/.exec(text)?.[1] ?? '';
  const asset = items.find((i) => assetName(i) === name)?.value ?? NaN;
  const pdd = Number(/provide (\d+)% of the debtors/.exec(text)?.[1]);
  const debtors = lineAmounts(text, 'Debtors:')[0];
  const out = (/^\w+ outstanding, not in the list: ₹([\d,]+)\.$/m.exec(text)?.[1] ?? '0');
  const pre = (/^\w+ paid in advance, not in the list: ₹([\d,]+)\.$/m.exec(text)?.[1] ?? '0');
  return { c1: I.total(items, 'asset') - I.total(items, 'liability') - (asset * rate) / 100 - (debtors * pdd) / 100 - I.num(out) + I.num(pre) };
}

// ---------------------------------------------------------------------------------------------------------------
// 11. The proprietor's salary and interest
// ---------------------------------------------------------------------------------------------------------------

const salaryYear = caseTemplate<Adjusted & { salary: number; g: IrGoods; bill: { label: string; amount: number } }>({
  ...common,
  id: 'case-ir-salary-and-interest',
  difficulty: 'complex',
  title: "The proprietor's salary and interest",
  setup: (rng) =>
    firstGood(40, () => {
      const others = rng.shuffle(['dep', 'pdd', 'out'] as IrAdjKey[]).slice(0, rng.int(1, 2));
      const year = drawAdjusted(rng, ['ioc', ...others], rng.next() < 0.5 ? [15000, 50000] : [100000, 260000]);
      if (!year) return null;
      const salary = rng.step(3000, 12000, 500);
      const g = I.goodsDrawn(rng);
      const bill = { label: rng.pick(I.PRIVATE_BILLS), amount: rng.step(3000, 20000, 500) };
      const D = 12 * salary + g.cost + bill.amount;
      // Salary, goods and the bill are the drawings of this story: the capitals are made to fit them.
      const c1 = year.c0 + year.p0 + year.A - D;
      if (c1 < 80000 || c1 === year.c0) return null;
      return { ...year, d: { line: '', total: D, how: '', monthly: salary }, D, c1, salary, g, bill };
    }),
  context: (s) =>
    [
      `${s.who} The capitals of the ${s.p.year} were found from statements of affairs.`,
      I.openLine(s.p, s.c0),
      I.closeLine(s.p, s.c1),
      `${I.SALARY_MONTHLY}: ${inr(s.salary)}`,
      s.g.line,
      `${s.bill.label}: ${inr(s.bill.amount)}`,
      ...(s.a ? [s.a.line] : []),
      'Adjustments, made after the statement of affairs on the closing date was drawn up:',
      ...s.adjs.map((x) => x.line),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.D, [
          [s.D - 12 * s.salary, 'Left out the salary; here it is drawings.'],
          [s.D - 12 * s.salary + s.salary, 'Took the salary of one month, not of twelve.'],
          [s.D - s.g.cost + s.g.price, 'Took the goods at their sale price.'],
          [s.D - s.bill.amount, 'Left out the private bill paid by the business.'],
        ]);
        return n && { prompt: 'What were the total drawings of the year?', ...n, explanation: [`Salary ${inr(s.salary)} x 12 = ${inr(12 * s.salary)}.`, `Goods at cost ${inr(s.g.cost)}; private bill ${inr(s.bill.amount)}.`, `Total = ${inr(s.D)}.`], hints: H.drawings };
      },
      verify: (q) => q.answer === rupees(I.factsOf(ctx(q)).drawings),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.p0, [
          [s.A ? s.c1 - s.c0 + s.D : 0, 'Did not deduct the capital brought in.'],
          [Math.abs(s.c1 - s.c0), 'Took the change in capital as the profit.'],
          [s.p0 - 12 * s.salary, 'Left the salary out of the drawings.'],
        ]);
        return n && { prompt: 'What profit do the capitals show, before the adjustments?', ...n, explanation: [`${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} - ${inr(s.c0)} = ${inr(s.p0)}.`], hints: H.profit };
      },
      verify: (q) => q.answer === rupees(netOf(ctx(q)).before),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `The proprietor asks for the salary of ${inr(12 * s.salary)} to be deducted from the profit found as well. What is the right answer?`,
          'No: here it is drawings, and it has been dealt with by adding it back',
          [
            ['Yes: a salary is an expense of every business', "The case says the business treats it as drawings, so it is not charged against profit."],
            ['Yes: the salary was never in the drawings', 'It is in the drawings; adding it back and then deducting it would undo that.'],
            ['No: it should be added to the profit instead', 'It has already been added back to the closing capital; adding it again would count it twice.'],
          ],
          'A salary the proprietor takes is here drawings. Drawings are added back to the closing capital, and nothing more is done with them.',
          H.drawings,
        ),
      verify: (q) => optionText(q).startsWith('No: here it is drawings'),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ioc = s.adjs.find((x) => x.key === 'ioc')!;
        const rate = rateIn(ioc);
        const n = numeric(-ioc.effect, whole([
          [(s.c1 * rate) / 100, 'Worked the interest on the closing capital.'],
          [((s.c0 + s.A) * rate) / 100, 'Added the capital brought in to the capital the interest is worked on.'],
          [((s.c0 - s.D) * rate) / 100, 'Took the drawings off the capital before working the interest.'],
        ]));
        return n && { prompt: 'How much is the interest on capital?', ...n, explanation: [ioc.how], hints: H.adjust };
      },
      verify: (q) => {
        const t = ctx(q);
        const rate = Number(/allowed at (\d+)% p\.a\./.exec(t)?.[1]);
        return q.answer === rupees((netOf(t).opening * rate) / 100);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ded = -sum(s.adjs.map((x) => x.effect));
        const n = numeric(Math.abs(s.net), [
          [s.p0, 'Left out the adjustments.'],
          [s.p0 + ded, 'Added the adjustments instead of deducting them.'],
          [ded, 'Gave the total of the adjustments.'],
          [Math.abs(s.net - 12 * s.salary), 'Deducted the salary again, though it is drawings.'],
        ]);
        return n && {
          prompt: `What is the amount of the net profit or net loss of the ${s.p.year}? Type the amount.`,
          ...n,
          explanation: [`Profit found = ${inr(s.p0)}.`, ...s.adjs.map((x) => x.how), `${inr(s.p0)} - ${inr(ded)} = ${s.net > 0 ? `a net profit of ${inr(s.net)}` : `a net loss of ${inr(-s.net)}`}.`],
          hints: H.adjust,
        };
      },
      verify: (q) => q.answer === rupees(Math.abs(netOf(ctx(q)).net)),
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `What is the true result of the ${s.p.year}?`,
          s.net > 0 ? `Net profit of ${inr(s.net)}` : `Net loss of ${inr(-s.net)}`,
          [
            [s.net > 0 ? `Net loss of ${inr(s.net)}` : `Net profit of ${inr(-s.net)}`, s.net > 0 ? 'The profit found is more than the amounts deducted, so a profit remains.' : 'The amounts deducted are more than the profit found, so a loss remains.'],
            [`Net profit of ${inr(s.p0)}`, 'That is the profit before the adjustments.'],
            [s.c1 > s.c0 ? `Net profit of ${inr(s.c1 - s.c0)}` : `Net loss of ${inr(s.c0 - s.c1)}`, 'Took the change in capital as the result.'],
          ],
          `${inr(s.p0)} less ${inr(-sum(s.adjs.map((x) => x.effect)))} leaves ${s.net > 0 ? `a net profit of ${inr(s.net)}` : `a net loss of ${inr(-s.net)}`}.`,
          H.adjust,
        ),
      verify: (q) => {
        const { net } = netOf(ctx(q));
        return optionText(q) === (net > 0 ? `Net profit of ${inr(net)}` : `Net loss of ${inr(-net)}`);
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 12. A slip in the working
// ---------------------------------------------------------------------------------------------------------------

type SlipKey = 'stock' | 'car' | 'overdraft' | 'loan' | 'goods' | 'additional' | 'prepaid' | 'bill';
interface Slip {
  key: SlipKey;
  line: string;
  /** How much the slip overstated the profit found; negative when it understated it. */
  over: number;
  how: string;
}

interface Slipped extends Base {
  /** The figures as worked, with the slip in them. */
  c0: number;
  c1: number;
  D: number;
  A: number;
  worked: number;
  slip: Slip;
  truth: number;
}

function drawSlip(rng: Rng, key: SlipKey): Slip {
  switch (key) {
    case 'stock': {
      const told = rng.step(80000, 240000, 1000), real = told - rng.step(5000, 40000, 1000);
      return { key, line: `The closing stock was entered at ${inr(told)}; a recount shows ${inr(real)}.`, over: told - real, how: `Closing assets were ${inr(told - real)} too high.` };
    }
    case 'car': {
      const v = rng.step(100000, 400000, 10000);
      return { key, line: `The proprietor's personal car, ${inr(v)}, was counted among the closing assets.`, over: v, how: `A private asset of ${inr(v)} raised the closing capital.` };
    }
    case 'overdraft': {
      const v = rng.step(10000, 60000, 1000);
      return { key, line: `A bank overdraft of ${inr(v)} was counted among the closing assets.`, over: 2 * v, how: `Taken out of the assets (${inr(v)}) and put among the liabilities (${inr(v)}), it lowers the capital by ${inr(2 * v)}.` };
    }
    case 'loan': {
      const v = rng.step(20000, 100000, 5000);
      return { key, line: `A business loan of ${inr(v)}, still owed, was left out of the closing liabilities.`, over: v, how: `A liability of ${inr(v)} was missing, so the closing capital was that much too high.` };
    }
    case 'goods': {
      const cost = rng.step(8000, 40000, 1000), price = (cost * 125) / 100;
      return { key, line: `Goods taken by the proprietor were added to the drawings at their sale price of ${inr(price)}; they cost ${inr(cost)}.`, over: price - cost, how: `The drawings were ${inr(price - cost)} too high, and they are added back.` };
    }
    case 'additional': {
      const v = rng.step(20000, 100000, 5000);
      return { key, line: `Additional capital of ${inr(v)} was added in the working instead of being deducted.`, over: 2 * v, how: `Turning the addition into a deduction lowers the figure by ${inr(2 * v)}.` };
    }
    case 'prepaid': {
      const v = rng.step(2000, 12000, 500);
      return { key, line: `Prepaid insurance of ${inr(v)} was left out of the closing assets.`, over: -v, how: `An asset of ${inr(v)} was missing, so the closing capital was that much too low.` };
    }
    case 'bill': {
      const v = rng.step(3000, 20000, 500);
      return { key, line: `A private bill of the proprietor, ${inr(v)}, paid by the business, was left out of the drawings.`, over: -v, how: `The drawings were ${inr(v)} too low, and they are added back.` };
    }
  }
}

const SLIPS: SlipKey[] = ['stock', 'car', 'overdraft', 'loan', 'goods', 'additional', 'prepaid', 'bill'];

/** How much a slip line of `drawSlip` overstated the profit, read from the printed line. */
function overIn(line: string): number {
  const xs = amountsIn(line);
  if (/^The closing stock/.test(line) || /^Goods taken/.test(line)) return xs[0] - xs[1];
  if (/^A bank overdraft/.test(line) || /^Additional capital/.test(line)) return 2 * xs[0];
  if (/^Prepaid insurance/.test(line) || /^A private bill/.test(line)) return -xs[0];
  return xs[0];
}

const SLIP_START = 'Found afterwards: ';

const slipInWorking = caseTemplate<Slipped>({
  ...common,
  id: 'case-ir-slip-in-working',
  difficulty: 'complex',
  title: 'A slip in the working',
  setup: (rng) =>
    firstGood(30, () => {
      const b = base(rng);
      const slip = drawSlip(rng, rng.pick(SLIPS));
      const c0 = rng.step(200000, 700000, 10000);
      const D = rng.step(30000, 150000, 1000) + (slip.key === 'goods' ? amountsIn(slip.line)[0] : 0);
      const A = slip.key === 'additional' ? amountsIn(slip.line)[0] : rng.next() < 0.4 ? rng.step(20000, 100000, 5000) : 0;
      const truth = rng.step(30000, 220000, 1000);
      // The worked figure is what the slip made of the true one.
      const worked = truth + slip.over;
      // The working as printed: an added capital is printed as it was added.
      const c1 = slip.key === 'additional' ? c0 + worked - D - A : c0 + worked + A - D;
      if (worked <= 0 || c1 < 80000) return null;
      return { ...b, c0, c1, D, A, worked, slip, truth };
    }),
  context: (s) =>
    [
      `${s.who} A cousin of the proprietor worked out the profit of the ${s.p.year} like this:`,
      `Capital at the end: ${inr(s.c1)}`,
      `Add: drawings ${inr(s.D)}`,
      ...(s.A ? [`${s.slip.key === 'additional' ? 'Add' : 'Less'}: additional capital ${inr(s.A)}`] : []),
      `Less: capital at the start ${inr(s.c0)}`,
      `Profit as worked: ${inr(s.worked)}`,
      `${SLIP_START}${s.slip.line}`,
      'Nothing else is wrong.',
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'What did the slip do to the profit as worked?',
          s.slip.over > 0 ? 'It made the profit too high' : 'It made the profit too low',
          [
            [s.slip.over > 0 ? 'It made the profit too low' : 'It made the profit too high', s.slip.over > 0 ? 'The correction brings the profit down, so it was too high.' : 'The correction brings the profit up, so it was too low.'],
            ['It did not change the profit, only the capital', 'The profit is worked from the capital and the drawings, so a slip in either reaches the profit.'],
            ['It cannot be told without the books', 'The formula shows the direction: anything that raises the closing capital or the drawings raises the profit.'],
          ],
          s.slip.how,
          H.profit,
        ),
      verify: (q) => {
        const line = ctx(q).split('\n').find((l) => l.startsWith(SLIP_START))!.slice(SLIP_START.length);
        return optionText(q) === (overIn(line) > 0 ? 'It made the profit too high' : 'It made the profit too low');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const x = Math.abs(s.slip.over);
        const half = s.slip.key === 'overdraft' || s.slip.key === 'additional';
        const n = numeric(x, [
          [half ? x / 2 : 2 * x, half ? 'Corrected it only once: the figure has to come out of one place and go into the other.' : 'Counted the correction twice.'],
          [s.worked, 'Gave the profit as worked.'],
          [s.truth, 'Gave the corrected profit, not the amount of the slip.'],
        ]);
        return n && { prompt: 'By how much was the profit as worked wrong?', ...n, explanation: [s.slip.how], hints: H.profit };
      },
      verify: (q) => {
        const line = ctx(q).split('\n').find((l) => l.startsWith(SLIP_START))!.slice(SLIP_START.length);
        return q.answer === rupees(Math.abs(overIn(line)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const adjustedWorked = s.worked + s.c0;
        const right = s.truth + s.c0;
        const n = numeric(right, [
          [adjustedWorked, 'Gave the adjusted capital of the working, with the slip still in it.'],
          [adjustedWorked + s.slip.over, 'Corrected in the wrong direction.'],
          [s.truth, 'Gave the corrected profit, before the opening capital was added back.'],
        ]);
        return n && {
          prompt: 'What is the corrected adjusted capital at the end of the year (the closing capital with the drawings put back, less the capital brought in, before the opening capital is taken off)?',
          ...n,
          explanation: [`As worked: ${inr(s.worked)} + opening capital ${inr(s.c0)} = ${inr(adjustedWorked)}.`, s.slip.how, `Corrected: ${inr(right)}.`],
          hints: H.profit,
        };
      },
      verify: (q) => {
        const t = ctx(q);
        const line = t.split('\n').find((l) => l.startsWith(SLIP_START))!.slice(SLIP_START.length);
        return q.answer === rupees(lineAmounts(t, 'Profit as worked')[0] - overIn(line) + lineAmounts(t, 'Less: capital at the start')[0]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const n = numeric(s.truth, [
          [s.worked, 'Left the profit as worked.'],
          [s.worked + s.slip.over, 'Corrected in the wrong direction.'],
          [s.c1 - s.c0, 'Took the change in capital as the profit.'],
        ]);
        return n && { prompt: `What is the correct profit of the ${s.p.year}?`, ...n, explanation: [s.slip.how, `${inr(s.worked)} ${s.slip.over > 0 ? '-' : '+'} ${inr(Math.abs(s.slip.over))} = ${inr(s.truth)}.`], hints: H.profit };
      },
      verify: (q) => {
        const t = ctx(q);
        const line = t.split('\n').find((l) => l.startsWith(SLIP_START))!.slice(SLIP_START.length);
        return q.answer === rupees(lineAmounts(t, 'Profit as worked')[0] - overIn(line));
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained cases: the statements themselves. A chain stands at the end of the stage.
// ---------------------------------------------------------------------------------------------------------------

const TWO_COLUMN_SPARES = ['Drawings', 'Profit for the year', 'Additional capital'];

const chainTwoStatements = caseTemplate<Year & { at: number }>({
  ...common,
  id: 'case-ir-chain-two-statements',
  difficulty: 'complex',
  title: 'From the two statements to the result',
  setup: (rng) => {
    const y = drawYear(rng, rng.next() < 0.25 ? [-50000, -8000] : [30000, 180000], { goods: 0.5, added: 0.5 });
    return y && { ...y, at: rng.int(0, 9) };
  },
  context: (s) => [`${s.who} The figures on the two dates were:`, ...listLines(s, s.at), 'During the year:', ...moneyLines(s)].join('\n'),
  parts: [
    {
      kind: 'statement',
      make: (s) => ({
        task: `Prepare the Statements of Affairs of ${s.t.shop} as on ${s.p.start} and ${s.p.end} in two columns, finding the capital on each date. Leave a column blank (or 0) where an item is nil.`,
        title: `Statements of Affairs of ${s.t.shop}`,
        columns: [`${s.p.start} (₹)`, `${s.p.end} (₹)`],
        rows: I.affairsRows(s.items.map((i) => ({ label: i.label, side: i.side, amounts: [i.v0, i.v1] })), [s.c0, s.c1]),
        distractors: [s.priv.label, ...TWO_COLUMN_SPARES],
        explanation: [
          `${s.priv.label} is a private item of the proprietor and stays out.`,
          `On ${s.p.start}: assets ${inr(assetsOn(s.items, 'v0'))} - liabilities ${inr(debtsOn(s.items, 'v0'))} = capital ${inr(s.c0)}.`,
          `On ${s.p.end}: assets ${inr(assetsOn(s.items, 'v1'))} - liabilities ${inr(debtsOn(s.items, 'v1'))} = capital ${inr(s.c1)}.`,
        ],
        hints: H.capital,
      }),
      verify: (q) => {
        const y = yearOf(q.data);
        return I.affairsHold(q, [y.c0, y.c1]);
      },
    },
    {
      kind: 'statement',
      make: (s) => ({
        task: `Prepare the Statement of Profit or Loss of ${s.t.shop} for the ${s.p.year}, starting from the capitals of the Statements of Affairs. Show the drawings as one figure, and show a deduction, and a loss, with a minus sign.`,
        title: `Statement of Profit or Loss of ${s.t.shop} for the ${s.p.year}`,
        columns: I.SIGNED,
        rows: I.comparisonRows(s.c1, { total: s.D, details: [`Cash ${s.d.how}`, ...(s.g ? [`Goods at cost ${inr(s.g.cost)}`] : [])] }, s.A, s.c0, I.PL_RESULT),
        distractors: I.PL_DISTRACTORS,
        explanation: [
          `Drawings = ${drawnHow(s)}, added back.`,
          ...(s.A ? [`Additional capital ${inr(s.A)} is deducted.`] : []),
          `Adjusted closing capital = ${inr(s.c1 + s.D - s.A)}; less opening capital ${inr(s.c0)} = ${s.r > 0 ? `a profit of ${inr(s.r)}` : `a loss of ${inr(-s.r)}, shown with a minus sign`}.`,
        ],
        hints: H.profit,
      }),
      verify: (q) => {
        const y = yearOf(q.data);
        return I.subtotalOf(q, I.PL_RESULT) === rupees(y.result);
      },
    },
  ],
});

const isFixed = (i: IrItem): boolean => FIXED.includes(i.label);

/** A depreciation or a provision drawn by the bank, worked instead on the figure of the printed list. */
function onListed(rng: Rng, x: IrAdj, items: readonly IrItem[]): IrAdj {
  if (x.key !== 'dep' && x.key !== 'pdd') return x;
  const r = rateIn(x);
  const item = x.key === 'dep' ? rng.pick(items.filter(isFixed)) : items.find((i) => i.label === 'Debtors')!;
  const amount = (item.value * r) / 100;
  if (x.key === 'pdd') {
    return { ...x, line: `Provision for doubtful debts at ${r}% on debtors of ${inr(item.value)} in the closing statement`, effect: -amount, how: `Provision = ${r}% of ${inr(item.value)} = ${inr(amount)}, deducted.` };
  }
  const name = item.label === 'Delivery van' ? 'the delivery van' : item.label.toLowerCase();
  return { ...x, line: `Depreciation on ${name} at ${r}%, on its value of ${inr(item.value)} in the closing statement`, label: `Less: Depreciation on ${item.label.toLowerCase()}`, effect: -amount, how: `Depreciation = ${r}% of ${inr(item.value)} = ${inr(amount)}, deducted.` };
}

interface ChainAdjusted extends Adjusted {
  items: IrItem[];
  priv: { label: string; value: number };
  order: IrItem[];
}

const chainAdjusted = caseTemplate<ChainAdjusted>({
  ...common,
  id: 'case-ir-chain-adjusted',
  difficulty: 'complex',
  title: 'The closing statement and the true profit',
  setup: (rng) =>
    firstGood(40, () => {
      const items = I.drawItems(rng, rng.int(3, 4), rng.int(1, 2));
      const c1 = I.total(items, 'asset') - I.total(items, 'liability');
      if (c1 < 120000) return null;
      const b = base(rng);
      const d = I.cashDrawings(rng, 24000, 96000);
      const a = rng.next() < 0.5 ? I.capitalIn(rng) : null;
      const p0 = rng.next() < 0.2 ? rng.step(10000, 30000, 1000) : rng.step(60000, 240000, 1000);
      const c0 = c1 + d.total - (a?.amount ?? 0) - p0;
      if (c0 < 60000 || c0 % 100 !== 0) return null;
      const has = (test: (i: IrItem) => boolean) => items.some(test);
      const usable: Record<IrAdjKey, boolean> = {
        ioc: true,
        dep: has(isFixed),
        pdd: has((i) => i.label === 'Debtors'),
        out: !has((i) => i.label.startsWith('Outstanding')),
        pre: !has((i) => i.label.startsWith('Prepaid')),
        acc: true,
      };
      const keys = rng.shuffle(['dep', 'pdd', 'out', 'pre', 'acc'] as IrAdjKey[]).filter((k) => usable[k]).slice(0, rng.int(2, 3));
      // The case text stays within 14 lines: the opening line, the list and the private item, the capital, the drawings,
      // any capital brought in, the heading of the adjustments, the interest and the other adjustments.
      if (keys.length < 2 || 6 + items.length + (a ? 1 : 0) + keys.length > 14) return null;
      const adjs = I.makeAdjs(rng, ['ioc', ...keys], c0)?.map((x) => onListed(rng, x, items));
      if (!adjs || adjs.some((x) => !Number.isInteger(x.effect)) || rentBothWays(adjs, items)) return null;
      const net = p0 + sum(adjs.map((x) => x.effect));
      if (net === 0) return null;
      const k = rng.pick(I.PRIVATE_KINDS);
      const priv = { label: k.label, value: I.valueOf(rng, k) };
      return { ...b, c0, c1, d, a, D: d.total, A: a?.amount ?? 0, p0, adjs, net, items, priv, order: rng.shuffle([...items, { label: priv.label, side: 'private' as const, value: priv.value }]) };
    }),
  context: (s) =>
    [
      `${s.who} These figures were collected on ${s.p.end}:`,
      ...s.order.map(I.itemLine),
      I.openLine(s.p, s.c0),
      s.d.line,
      ...(s.a ? [s.a.line] : []),
      'Adjustments, made after the statement of affairs on the closing date was drawn up:',
      ...s.adjs.map((x) => x.line),
    ].join('\n'),
  parts: [
    {
      kind: 'statement',
      make: (s) => ({
        task: `Prepare the Statement of Affairs of ${s.t.shop} as on ${s.p.end}, before the adjustments, showing the capital as the balancing figure.`,
        title: `Statement of Affairs of ${s.t.shop} as on ${s.p.end}`,
        rows: I.affairsRows(s.items.map((i) => ({ label: i.label, side: i.side, amounts: [i.value] })), [s.c1]),
        distractors: [s.priv.label, 'Drawings', 'Profit for the year'],
        explanation: [
          `${s.priv.label} belongs to the proprietor privately and stays out.`,
          `Assets ${inr(I.total(s.items, 'asset'))} - liabilities ${inr(I.total(s.items, 'liability'))} = capital ${inr(s.c1)}.`,
          'The adjustments are made to the profit found, so they do not enter this statement.',
        ],
        hints: H.capital,
      }),
      verify: (q) => {
        const items = I.itemsIn(q.data);
        return I.affairsHold(q, [I.total(items, 'asset') - I.total(items, 'liability')]);
      },
    },
    {
      kind: 'statement',
      make: (s) => {
        const adjs = I.inStatementOrder(s.adjs);
        const rows: (FormatRowParts | StatementLineParts)[] = [
          ...I.comparisonRows(s.c1, { total: s.D, details: [`Cash ${s.d.how}`] }, s.A, s.c0, I.PL_BEFORE),
          ...adjs.map((x) => ({ label: x.label, amount: rupees(x.effect) })),
          { subtotal: I.PL_NET, amount: rupees(s.net), sum: 'all' as const },
        ];
        return {
          task: `Prepare the Statement of Profit or Loss of ${s.t.shop} for the ${s.p.year}, starting from the capital of the Statement of Affairs, with the adjustments given. Show a deduction, and a loss, with a minus sign.`,
          title: `Statement of Profit or Loss of ${s.t.shop} for the ${s.p.year}`,
          columns: I.SIGNED,
          rows,
          distractors: [...I.PL_DISTRACTORS.slice(0, 2), 'Add: Interest on capital', 'Less: Goods taken by the proprietor', 'Less: Prepaid insurance'].filter((l) => !adjs.some((x) => x.label === l)),
          explanation: [
            `Before adjustments: ${inr(s.c1)} + ${inr(s.D)}${s.A ? ` - ${inr(s.A)}` : ''} - ${inr(s.c0)} = ${inr(s.p0)}.`,
            ...adjs.map((x) => x.how),
            `Net result = ${s.net >= 0 ? `a net profit of ${inr(s.net)}` : `a net loss of ${inr(-s.net)}`}.`,
          ],
          hints: H.adjust,
        };
      },
      verify: (q) => {
        const items = I.itemsIn(q.data);
        const f = I.factsOf(q.data);
        const c1 = I.total(items, 'asset') - I.total(items, 'liability');
        const adj = I.adjustmentsIn(q.data, f.opening!);
        return adj.count >= 3 && I.subtotalOf(q, I.PL_NET) === rupees(c1 + f.drawings - f.additional - f.opening! + adj.effect);
      },
    },
  ],
});

const cases: CaseTemplate[] = [
  twoLists,
  tookOut,
  capitalFell,
  moneyCameIn,
  lostStock,
  lostFigure,
  overdraftYear,
  afterComparison,
  twoYears,
  statementCorrected,
  salaryYear,
  slipInWorking,
  // Chained cases stand last.
  chainTwoStatements,
  chainAdjusted,
];

export default cases;
