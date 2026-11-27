import type { McqQuestion, StatementQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { formatINR, keepFor, mcqTemplate, numericTemplate, rupees, statementTemplate } from '../authoring';
import type { FormatRowParts, McqParts, NumericParts, StatementLineParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'incomplete-records';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - the statement of affairs method only: capital = business assets - business liabilities on a date, and
//    profit (or loss) = closing capital + drawings - additional capital - opening capital. The conversion method
//    (building the missing accounts up into double entry) is outside the CBSE Class 11 syllabus and never asked;
//  - the accounting year runs from 1 April to 31 March; the proprietor's private assets and debts stay out of the
//    statement of affairs;
//  - goods taken by the proprietor are drawings at cost; a salary the proprietor takes from the business is drawings
//    (the questions say the business does not charge it against profit); a private expense paid by the business is
//    drawings and a business expense paid from private money is capital introduced;
//  - an adjustment "not in the closing statement" (depreciation, a provision for doubtful debts, an outstanding or
//    prepaid expense, an accrued income) is made to the profit found by comparing the capitals; interest on capital
//    (on the capital at the beginning of the year, at the rate given) is deducted from it, because it is a transfer
//    within the proprietor's capital that the statements cannot show. Interest on drawings is never charged: the
//    2025-26 syllabus lists interest on capital among a sole proprietor's adjustments, not interest on drawings, so
//    the templates that once drew it (version 2 of each) leave it out;
//  - every figure is a whole number of rupees; a seed that would give anything else is rejected.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const num = (s: string): number => Number(s.replace(/,/g, ''));
const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => num(x.slice(1)));
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

/** A numeric question's answer and errors in paise. Null when the answer is not positive or fewer than two distinct errors remain. */
function numeric(answer: number, errs: [number, string][]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  const a = Math.round(answer * 100);
  if (!(a > 0) || !Number.isSafeInteger(a)) return null;
  const seen = new Set([a]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    const p = Math.round(v * 100);
    if (p > 0 && Number.isSafeInteger(p) && !seen.has(p)) {
      seen.add(p);
      commonErrors.push({ value: p, why });
    }
  }
  return commonErrors.length >= 2 ? { answer: a, commonErrors } : null;
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

/** Why a result of the wrong sign is wrong: the comparison was read the wrong way round. */
const reversedWhy = (r: number): string =>
  r < 0 ? 'Read the shortfall as a profit; the adjusted closing capital is below the opening capital, so it is a loss.' : 'Read the result as a loss; the adjusted closing capital is above the opening capital, so it is a profit.';

/** "Profit of ₹40,000", "Loss of ₹12,000" or "Neither profit nor loss". */
const resultText = (r: number): string => (r > 0 ? `Profit of ${inr(r)}` : r < 0 ? `Loss of ${inr(-r)}` : 'Neither profit nor loss');

// ---------------------------------------------------------------------------------------------------------------
// The businesses, the years, and the items of a statement of affairs
// ---------------------------------------------------------------------------------------------------------------

interface Trader {
  owner: string;
  shop: string;
  trade: string;
}
const TRADERS: Trader[] = [
  { owner: 'Ravi Menon', shop: 'Menon Hardware', trade: 'a hardware shop' },
  { owner: 'Fatima Sheikh', shop: 'Sheikh Tailors', trade: 'a tailoring unit' },
  { owner: 'Gurpreet Singh', shop: 'Singh Auto Parts', trade: 'a spare-parts store' },
  { owner: 'Lakshmi Iyer', shop: 'Iyer Provisions', trade: 'a provision store' },
  { owner: 'Arjun Das', shop: 'Das Stationers', trade: 'a stationery shop' },
  { owner: 'Kavita Joshi', shop: 'Joshi Sweets', trade: 'a sweets shop' },
  { owner: 'Suresh Patil', shop: 'Patil Mobile Care', trade: 'a mobile repair shop' },
  { owner: 'Anjali Reddy', shop: 'Reddy Boutique', trade: 'a garments boutique' },
  { owner: 'Imran Qureshi', shop: 'Qureshi Footwear', trade: 'a footwear shop' },
  { owner: 'Deepa Nair', shop: 'Nair Bakers', trade: 'a bakery' },
];

/** The opening sentence: who keeps the records, and that they are not kept by double entry. */
function intro(rng: Rng, t: Trader): string {
  return rng.pick([
    `${t.owner} runs ${t.shop}, ${t.trade}, and does not keep books by double entry.`,
    `${t.owner}, the proprietor of ${t.shop}, keeps only a cash book and a list of debtors and creditors.`,
    `${t.shop} is ${t.trade} whose proprietor, ${t.owner}, keeps incomplete records.`,
  ]);
}

interface Period {
  start: string;
  end: string;
  year: string;
}
function period(rng: Rng): Period {
  const y = rng.pick([2023, 2024, 2025]);
  return { start: `1 April ${y}`, end: `31 March ${y + 1}`, year: `year ended 31 March ${y + 1}` };
}

type Side = 'asset' | 'liability' | 'private';
interface ItemKind {
  label: string;
  side: Side;
  min: number;
  max: number;
  step: number;
}
interface Item {
  label: string;
  side: Side;
  value: number;
}

const ASSET_KINDS: ItemKind[] = [
  { label: 'Cash in hand', side: 'asset', min: 4000, max: 40000, step: 500 },
  { label: 'Cash at bank', side: 'asset', min: 20000, max: 150000, step: 1000 },
  { label: 'Debtors', side: 'asset', min: 30000, max: 200000, step: 1000 },
  { label: 'Stock', side: 'asset', min: 50000, max: 300000, step: 1000 },
  { label: 'Furniture', side: 'asset', min: 20000, max: 100000, step: 1000 },
  { label: 'Machinery', side: 'asset', min: 80000, max: 400000, step: 5000 },
  { label: 'Bills receivable', side: 'asset', min: 10000, max: 60000, step: 1000 },
  { label: 'Delivery van', side: 'asset', min: 150000, max: 450000, step: 5000 },
  { label: 'Prepaid insurance', side: 'asset', min: 1000, max: 8000, step: 500 },
];
const LIABILITY_KINDS: ItemKind[] = [
  { label: 'Creditors', side: 'liability', min: 20000, max: 150000, step: 1000 },
  { label: 'Bills payable', side: 'liability', min: 10000, max: 60000, step: 1000 },
  { label: 'Bank loan', side: 'liability', min: 50000, max: 200000, step: 5000 },
  { label: 'Outstanding rent', side: 'liability', min: 2000, max: 12000, step: 500 },
  { label: 'Outstanding salaries', side: 'liability', min: 3000, max: 15000, step: 500 },
  { label: 'Bank overdraft', side: 'liability', min: 10000, max: 60000, step: 1000 },
];
/** What the proprietor owns or owes privately: never in the statement of affairs of the business. */
const PRIVATE_KINDS: ItemKind[] = [
  { label: "The proprietor's residential flat", side: 'private', min: 1500000, max: 3500000, step: 50000 },
  { label: "The proprietor's personal car", side: 'private', min: 300000, max: 900000, step: 10000 },
  { label: "Jewellery of the proprietor's family", side: 'private', min: 200000, max: 600000, step: 10000 },
  { label: "Housing loan on the proprietor's flat", side: 'private', min: 500000, max: 1500000, step: 50000 },
];
/** An asset that only the question on capital brought in as an asset uses: the laptop the proprietor brought in. */
const LAPTOP = 'Laptop';
const SIDE_OF = new Map<string, Side>([...[...ASSET_KINDS, ...LIABILITY_KINDS, ...PRIVATE_KINDS].map((k): [string, Side] => [k.label, k.side]), [LAPTOP, 'asset']]);
/** A private item that is something owned (the rest of the private items are debts). */
const PRIVATE_ASSET = (label: string): boolean => !label.startsWith('Housing loan');

const valueOf = (rng: Rng, k: ItemKind): number => rng.step(k.min, k.max, k.step);

/** Assets and liabilities of a business on one date: never cash at bank and an overdraft together. */
function drawItems(rng: Rng, nAssets: number, nLiabilities: number): Item[] {
  const assets = rng.shuffle(ASSET_KINDS).slice(0, nAssets);
  const bank = assets.some((k) => k.label === 'Cash at bank');
  const liabilities = rng.shuffle(LIABILITY_KINDS.filter((k) => !(bank && k.label === 'Bank overdraft'))).slice(0, nLiabilities);
  return [...assets, ...liabilities].map((k) => ({ label: k.label, side: k.side, value: valueOf(rng, k) }));
}
const total = (items: readonly Item[], side: Side): number => sum(items.filter((i) => i.side === side).map((i) => i.value));
const itemLine = (i: Item): string => `${i.label}: ${inr(i.value)}`;
const plus = (xs: readonly number[]): string => (xs.length === 1 ? inr(xs[0]) : `${xs.map(inr).join(' + ')} = ${inr(sum(xs))}`);

/** The items of the lines "Label: ₹x" of a text that name an asset, a liability or a private item. */
function itemsIn(text: string): Item[] {
  const out: Item[] = [];
  for (const line of text.split('\n')) {
    const m = /^(.+): ₹([\d,]+)$/.exec(line);
    const side = m ? SIDE_OF.get(m[1]) : undefined;
    if (m && side) out.push({ label: m[1], side, value: num(m[2]) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Capitals, drawings and capital introduced, one fact to a line
// ---------------------------------------------------------------------------------------------------------------

const DRAW_LUMP = 'Drawings during the year';
const DRAW_MONTHLY = 'Cash drawn by the proprietor every month';
const SALARY_MONTHLY = 'Salary taken by the proprietor every month (treated as drawings)';
const GOODS = 'Goods taken by the proprietor for personal use, at cost';
const PRIVATE_BILLS = [
  "School fees of the proprietor's child, paid by a business cheque",
  "Electricity bill of the proprietor's home, paid from the business cash",
  "Premium on the proprietor's life insurance policy, paid by the business",
];
const ADD_LABELS = [
  'Additional capital introduced during the year',
  'Money from the sale of a private plot, brought into the business',
  "The proprietor's lottery prize, paid into the business bank account",
  'A gift of money received by the proprietor, put into the business',
];
const MONTHLY = [DRAW_MONTHLY, SALARY_MONTHLY];
const PROFIT_LINE = 'Profit for the year';
const LOSS_LINE = 'Loss for the year';

const openLine = (p: Period, x: number): string => `Capital on ${p.start}: ${inr(x)}`;
const closeLine = (p: Period, x: number): string => `Capital on ${p.end}: ${inr(x)}`;

interface Drawn {
  line: string;
  total: number;
  /** The working: "₹5,000 x 12 = ₹60,000". */
  how: string;
  monthly: number;
}
/** The proprietor's cash drawings: one sum, an amount every month, or a monthly salary that the business treats as drawings. */
function cashDrawings(rng: Rng, min = 20000, max = 150000): Drawn {
  const kind = rng.pick(['lump', 'monthly', 'salary'] as const);
  if (kind === 'lump') {
    const x = rng.step(min, max, 1000);
    return { line: `${DRAW_LUMP}: ${inr(x)}`, total: x, how: inr(x), monthly: 0 };
  }
  const m = rng.step(Math.max(1000, Math.round(min / 12 / 500) * 500), Math.max(1500, Math.round(max / 12 / 500) * 500), 500);
  return { line: `${kind === 'monthly' ? DRAW_MONTHLY : SALARY_MONTHLY}: ${inr(m)}`, total: 12 * m, how: `${inr(m)} x 12 = ${inr(12 * m)}`, monthly: m };
}
interface Goods {
  line: string;
  cost: number;
  price: number;
}
function goodsDrawn(rng: Rng): Goods {
  const cost = rng.step(2000, 24000, 500);
  const price = (cost * rng.pick([120, 125, 150])) / 100;
  return { line: `${GOODS}: ${inr(cost)} (sale price ${inr(price)})`, cost, price };
}
function capitalIn(rng: Rng, min = 20000, max = 200000, step = 5000): { line: string; amount: number } {
  const amount = rng.step(min, max, step);
  return { line: `${rng.pick(ADD_LABELS)}: ${inr(amount)}`, amount };
}

interface Facts {
  opening?: number;
  closing?: number;
  profit?: number;
  loss?: number;
  drawings: number;
  additional: number;
  monthly: number;
  goodsCost: number;
  goodsPrice: number;
}
/** The capitals, drawings, capital introduced and profit stated in a text, one to a line ("Label: ₹x"). */
function factsOf(text: string): Facts {
  const f: Facts = { drawings: 0, additional: 0, monthly: 0, goodsCost: 0, goodsPrice: 0 };
  for (const line of text.split('\n')) {
    const at = line.indexOf(': ₹');
    if (at < 0) continue;
    const label = line.slice(0, at);
    const [x, y] = amountsIn(line.slice(at));
    if (label.startsWith('Capital on 1 April')) f.opening = x;
    else if (label.startsWith('Capital on 31 March')) f.closing = x;
    else if (label === DRAW_LUMP || PRIVATE_BILLS.includes(label)) f.drawings += x;
    else if (MONTHLY.includes(label)) {
      f.drawings += 12 * x;
      f.monthly += x;
    } else if (label === GOODS) {
      f.drawings += x;
      f.goodsCost += x;
      f.goodsPrice += y;
    } else if (ADD_LABELS.includes(label)) f.additional += x;
    else if (label === PROFIT_LINE) f.profit = x;
    else if (label === LOSS_LINE) f.loss = x;
  }
  return f;
}

// ---------------------------------------------------------------------------------------------------------------
// Adjustments made after the closing statement of affairs was drawn up
// ---------------------------------------------------------------------------------------------------------------

type AdjKey = 'ioc' | 'dep' | 'pdd' | 'out' | 'pre' | 'acc';
interface Adj {
  key: AdjKey;
  /** The line of the data or prompt. */
  line: string;
  /** The row of a Statement of Profit or Loss: "Less: Depreciation on furniture". */
  label: string;
  /** What it does to the profit, in rupees: negative to deduct. */
  effect: number;
  /** The working, one line. */
  how: string;
}

const DEP_ASSETS = ['furniture', 'machinery', 'the delivery van'];
const OUT_EXPENSES = ['Salaries', 'Rent', 'Wages'];
const PRE_EXPENSES = ['Insurance', 'Rent'];

/** One adjustment of each kind asked for, its figures drawn from the seed. `opening` is the capital at the beginning of the year. */
function makeAdj(rng: Rng, key: AdjKey, opening: number): Adj | null {
  switch (key) {
    case 'ioc': {
      const r = rng.pick([5, 6, 8, 10]);
      const x = (opening * r) / 100;
      if (!Number.isInteger(x)) return null;
      return {
        key,
        line: `Interest on capital is to be allowed at ${r}% p.a. on the capital at the beginning of the year.`,
        label: 'Less: Interest on capital',
        effect: -x,
        how: `Interest on capital = ${r}% of ${inr(opening)} = ${inr(x)}, deducted.`,
      };
    }
    case 'dep': {
      const asset = rng.pick(DEP_ASSETS);
      const v = rng.step(30000, 300000, 5000);
      const r = rng.pick([10, 15, 20]);
      const x = (v * r) / 100;
      return {
        key,
        line: `Depreciation on ${asset} at ${r}%, on its value of ${inr(v)} in the closing statement`,
        label: `Less: Depreciation on ${asset.replace(/^the /, '')}`,
        effect: -x,
        how: `Depreciation = ${r}% of ${inr(v)} = ${inr(x)}, deducted.`,
      };
    }
    case 'pdd': {
      const v = rng.step(40000, 250000, 5000);
      const r = rng.pick([2, 4, 5, 10]);
      const x = (v * r) / 100;
      return {
        key,
        line: `Provision for doubtful debts at ${r}% on debtors of ${inr(v)} in the closing statement`,
        label: 'Less: Provision for doubtful debts',
        effect: -x,
        how: `Provision = ${r}% of ${inr(v)} = ${inr(x)}, deducted.`,
      };
    }
    case 'out': {
      const e = rng.pick(OUT_EXPENSES);
      const x = rng.step(2000, 15000, 500);
      return { key, line: `${e} outstanding, not in the closing statement: ${inr(x)}`, label: `Less: Outstanding ${lower(e)}`, effect: -x, how: `Outstanding ${lower(e)} ${inr(x)}, a liability left out, deducted.` };
    }
    case 'pre': {
      const e = rng.pick(PRE_EXPENSES);
      const x = rng.step(1000, 9000, 500);
      return { key, line: `${e} paid in advance, not in the closing statement: ${inr(x)}`, label: `Add: Prepaid ${lower(e)}`, effect: x, how: `Prepaid ${lower(e)} ${inr(x)}, an asset left out, added.` };
    }
    case 'acc': {
      const x = rng.step(1000, 9000, 500);
      return { key, line: `Commission earned but not yet received, not in the closing statement: ${inr(x)}`, label: 'Add: Accrued commission', effect: x, how: `Accrued commission ${inr(x)}, an asset left out, added.` };
    }
  }
}

/** Several adjustments of different kinds; null when one of them does not come out in whole rupees. */
function makeAdjs(rng: Rng, keys: readonly AdjKey[], opening: number): Adj[] | null {
  const out: Adj[] = [];
  for (const k of keys) {
    const a = makeAdj(rng, k, opening);
    if (!a) return null;
    out.push(a);
  }
  return out;
}

/** The order of the adjustments in a Statement of Profit or Loss: the deductions (interest on capital first), then the additions. */
const ADJ_ORDER: AdjKey[] = ['ioc', 'dep', 'pdd', 'out', 'pre', 'acc'];
const inStatementOrder = (adjs: readonly Adj[]): Adj[] => [...adjs].sort((x, y) => ADJ_ORDER.indexOf(x.key) - ADJ_ORDER.indexOf(y.key));

/** The net effect on the profit of the adjustments stated in a text, read back from their own lines; null when none is found. */
function adjustmentsIn(text: string, opening: number): { effect: number; count: number } {
  let effect = 0;
  let count = 0;
  for (const line of text.split('\n')) {
    let m: RegExpExecArray | null;
    if ((m = /^Interest on capital is to be allowed at (\d+)% p\.a\. on the capital at the beginning of the year\.$/.exec(line))) effect -= (opening * Number(m[1])) / 100;
    else if ((m = /^Depreciation on .+ at (\d+)%, on its value of ₹([\d,]+) in the closing statement$/.exec(line))) effect -= (num(m[2]) * Number(m[1])) / 100;
    else if ((m = /^Provision for doubtful debts at (\d+)% on debtors of ₹([\d,]+) in the closing statement$/.exec(line))) effect -= (num(m[2]) * Number(m[1])) / 100;
    else if ((m = /^\w+ outstanding, not in the closing statement: ₹([\d,]+)$/.exec(line))) effect -= num(m[1]);
    else if ((m = /^\w+ paid in advance, not in the closing statement: ₹([\d,]+)$/.exec(line))) effect += num(m[1]);
    else if ((m = /^Commission earned but not yet received, not in the closing statement: ₹([\d,]+)$/.exec(line))) effect += num(m[1]);
    else continue;
    count++;
  }
  return { effect, count };
}

const H = {
  capital: ['Capital = total business assets - total business liabilities.', "Leave out anything that belongs to the proprietor privately, and remember that an overdraft or an unpaid expense is owed by the business."],
  profit: ['Profit = closing capital + drawings - additional capital - opening capital.', 'Drawings lowered the closing capital, so add them back; capital brought in raised it without being earned, so take it off.'],
  unknown: ['Write the profit formula first, then put in every figure you know.', 'Closing capital = opening capital + additional capital + profit - drawings. Solve it for the figure that is missing.'],
  drawings: ['Drawings are everything the proprietor takes out of the business for private use: cash, goods (at cost) and private bills paid by the business.', 'A monthly figure is multiplied by 12 for the year.'],
  adjust: ['First find the profit by comparing the capitals; then make each adjustment the closing statement left out.', 'An expense or a loss of value left out is deducted; an asset left out (a prepaid expense, an accrued income) is added. Interest on capital is deducted.'],
  theory: ['Incomplete records keep only some accounts (cash and personal accounts), so there is no trial balance.', 'A statement of affairs lists assets and liabilities on one date; capital is the balancing figure.'],
};

// ===============================================================================================================
// EASY
// ===============================================================================================================

// ir-capital-list: capital on one date from a list of assets and liabilities.
const capitalList = numericTemplate({
  id: 'ir-capital-list', topicId: T, conceptId: 'ir-capital', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const date = rng.pick([p.start, p.end]);
    const items = drawItems(rng, rng.int(3, 5), rng.int(1, 3));
    const A = total(items, 'asset');
    const L = total(items, 'liability');
    const c = A - L;
    if (c < 50000) return null;
    const liabilities = items.filter((i) => i.side === 'liability');
    const biggest = liabilities.reduce((b, i) => (i.value > b.value ? i : b));
    const n = numeric(c, [
      [A + L, 'Added the liabilities to the assets instead of deducting them.'],
      [A, 'Gave the total of the assets and left out the liabilities.'],
      [c + 2 * biggest.value, `Counted ${lower(biggest.label)} as an asset: it is an amount the business owes.`],
    ]);
    const asked = rng.pick([`What was the capital of the business on ${date}?`, `Find the capital of ${t.shop} on ${date}.`]);
    return (
      n && {
        prompt: `${intro(rng, t)} On ${date} its assets and liabilities were as below. ${asked}\n${rng.shuffle(items).map(itemLine).join('\n')}`,
        ...n,
        explanation: [
          `Assets: ${items.filter((i) => i.side === 'asset').map((i) => lower(i.label)).join(', ')}. Total assets = ${plus(items.filter((i) => i.side === 'asset').map((i) => i.value))}.`,
          `Liabilities: ${liabilities.map((i) => lower(i.label)).join(', ')}. Total liabilities = ${plus(liabilities.map((i) => i.value))}.`,
          `Capital = Total assets - Total liabilities = ${inr(A)} - ${inr(L)} = ${inr(c)}.`,
        ],
        hints: H.capital,
      }
    );
  },
  verify: (q) => {
    const items = itemsIn(q.prompt);
    return items.length >= 4 && q.answer === rupees(total(items, 'asset') - total(items, 'liability'));
  },
});

// ir-profit-drawings: profit from the two capitals and the drawings.
const profitDrawings = numericTemplate({
  id: 'ir-profit-drawings', topicId: T, conceptId: 'ir-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(100000, 800000, 5000);
    const profit = rng.step(30000, 250000, 1000);
    const d = cashDrawings(rng);
    const c1 = c0 + profit - d.total;
    if (c1 < 50000) return null;
    const n = numeric(profit, [
      [c1 - c0, 'Took the change in capital as the profit and left out the drawings.'],
      [c1 - c0 - d.total, 'Deducted the drawings instead of adding them back.'],
      [c0 + d.total - c1, 'Deducted the closing capital from the opening capital.'],
      [d.monthly ? c1 - c0 + d.monthly : 0, "Added one month's drawings instead of the twelve months of the year."],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} Find the profit for the ${p.year}.\n${openLine(p, c0)}\n${closeLine(p, c1)}\n${d.line}`,
        ...n,
        explanation: [
          `Drawings for the year = ${d.how}.`,
          'Profit = Closing capital + Drawings - Opening capital.',
          `${inr(c1)} + ${inr(d.total)} - ${inr(c0)} = ${inr(profit)}.`,
        ],
        hints: H.profit,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    return f.opening !== undefined && f.closing !== undefined && f.drawings > 0 && q.answer === rupees(f.closing + f.drawings - f.opening);
  },
});

// ir-profit-additional: profit when the proprietor brought in more capital.
const profitAdditional = numericTemplate({
  id: 'ir-profit-additional', topicId: T, conceptId: 'ir-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(100000, 800000, 5000);
    const profit = rng.step(30000, 250000, 1000);
    const a = capitalIn(rng);
    const c1 = c0 + profit + a.amount;
    const n = numeric(profit, [
      [c1 - c0, 'Took the whole rise in capital as profit, including the capital that was brought in.'],
      [c1 - c0 + a.amount, 'Added the additional capital instead of deducting it.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} What profit did the business make in the ${p.year}?\n${openLine(p, c0)}\n${closeLine(p, c1)}\n${a.line}`,
        ...n,
        explanation: [
          'The capital brought in raised the closing capital without being earned, so it is deducted.',
          'Profit = Closing capital - Additional capital - Opening capital.',
          `${inr(c1)} - ${inr(a.amount)} - ${inr(c0)} = ${inr(profit)}.`,
        ],
        hints: H.profit,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    return f.opening !== undefined && f.closing !== undefined && f.additional > 0 && q.answer === rupees(f.closing - f.additional - f.opening);
  },
});

// ir-closing-capital: the capital at the end from the opening capital, the result of the year, drawings and capital brought in.
const closingCapital = numericTemplate({
  id: 'ir-closing-capital', topicId: T, conceptId: 'ir-capital', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 900000, 5000);
    const loss = rng.next() < 0.3;
    const r = loss ? -rng.step(10000, 80000, 1000) : rng.step(30000, 250000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const a = rng.next() < 0.5 ? capitalIn(rng) : null;
    const add = a?.amount ?? 0;
    const c1 = c0 + r + add - d.total;
    if (c1 < 50000) return null;
    const n = numeric(c1, [
      [c1 + d.total, 'Left out the drawings, which take capital out of the business.'],
      [c1 + 2 * d.total, 'Added the drawings instead of deducting them.'],
      [add ? c1 - 2 * add : 0, 'Deducted the additional capital instead of adding it.'],
      [c1 - 2 * r, loss ? 'Added the loss as if it were a profit.' : 'Deducted the profit instead of adding it.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} What was the capital on ${p.end}?\n${openLine(p, c0)}\n${loss ? `${LOSS_LINE}: ${inr(-r)}` : `${PROFIT_LINE}: ${inr(r)}`}\n${d.line}${a ? `\n${a.line}` : ''}`,
        ...n,
        explanation: [
          `Drawings for the year = ${d.how}.`,
          `Closing capital = Opening capital${add ? ' + Additional capital' : ''} ${loss ? '- Loss' : '+ Profit'} - Drawings.`,
          `${inr(c0)}${add ? ` + ${inr(add)}` : ''} ${loss ? `- ${inr(-r)}` : `+ ${inr(r)}`} - ${inr(d.total)} = ${inr(c1)}.`,
        ],
        hints: H.unknown,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined) return false;
    const r = f.profit ?? -(f.loss ?? NaN);
    return q.answer === rupees(f.opening + r + f.additional - f.drawings);
  },
});

// ir-drawings-total: the drawings of a year in cash, in goods and as private bills paid by the business.
interface DrawScene {
  monthly: number;
  goodsCost: number;
  bill: number;
  decoy: number;
}
const keptDrawings = keepFor<DrawScene>();
const drawingsTotal = numericTemplate({
  id: 'ir-drawings-total', topicId: T, conceptId: 'ir-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const salary = rng.next() < 0.4;
    const m = rng.step(2000, 15000, 500);
    const withGoods = rng.next() < 0.75;
    const withBill = !withGoods || rng.next() < 0.6;
    const g = withGoods ? goodsDrawn(rng) : null;
    const billText = rng.pick(['the school fees of the proprietor\'s child', 'the electricity bill of the proprietor\'s home', 'the premium on the proprietor\'s life insurance policy']);
    const bill = withBill ? rng.step(3000, 30000, 500) : 0;
    const decoyText = rng.pick(['the rent of the shop', 'the wages of the shop assistant', 'the electricity bill of the shop']);
    const decoy = rng.next() < 0.6 ? rng.step(5000, 40000, 500) : 0;
    const answer = 12 * m + (g?.cost ?? 0) + bill;
    const facts = rng.shuffle([
      ...(g ? [`The proprietor took home goods costing ${inr(g.cost)}, whose sale price was ${inr(g.price)}.`] : []),
      ...(bill ? [`The business paid ${billText}, ${inr(bill)}.`] : []),
      ...(decoy ? [`The business paid ${decoyText}, ${inr(decoy)}.`] : []),
    ]);
    const first = salary
      ? `The proprietor took a salary of ${inr(m)} every month; the business does not charge it against profit, so it is drawings.`
      : `The proprietor withdrew ${inr(m)} in cash every month for household expenses.`;
    const prompt = `${t.owner} keeps incomplete records of ${t.shop}. What are the total drawings for the ${p.year}?\n${[first, ...facts].join('\n')}`;
    keptDrawings.keep(prompt, { monthly: m, goodsCost: g?.cost ?? 0, bill, decoy });
    const n = numeric(answer, [
      [g ? answer - g.cost + g.price : 0, 'Took the goods at their sale price; goods taken by the proprietor are drawings at cost.'],
      [answer - 11 * m, "Counted one month's withdrawal instead of twelve."],
      [decoy ? answer + decoy : 0, `Counted ${decoyText} as drawings; it is an expense of the business.`],
      [bill ? answer - bill : 0, `Left out ${billText}: a private expense paid by the business is drawings.`],
      [g ? answer - g.cost : 0, 'Left out the goods taken for personal use.'],
    ]);
    return (
      n && {
        prompt,
        ...n,
        explanation: [
          `${salary ? 'Salary' : 'Cash drawn'} for the year = ${inr(m)} x 12 = ${inr(12 * m)}.`,
          ...(g ? [`Goods taken are drawings at cost: ${inr(g.cost)} (not the sale price of ${inr(g.price)}).`] : []),
          ...(bill ? [`Paying ${billText} meets a private expense of the proprietor: drawings of ${inr(bill)}.`] : []),
          ...(decoy ? [`Paying ${decoyText} meets an expense of the business, so it is not drawings.`] : []),
          `Total drawings = ${plus([12 * m, ...(g ? [g.cost] : []), ...(bill ? [bill] : [])])}.`,
        ],
        hints: H.drawings,
      }
    );
  },
  verify: (q) => {
    const s = keptDrawings.of(q.prompt);
    if (!s) return false;
    const shown = amountsIn(q.prompt);
    const told = [s.monthly, s.goodsCost, s.bill, s.decoy].filter((x) => x > 0);
    return told.every((x) => shown.includes(x)) && q.answer === rupees(s.monthly * 12 + s.goodsCost + s.bill);
  },
});

// ir-total-side: the total of one side of a statement of affairs from the capital and the other side.
const totalSide = numericTemplate({
  id: 'ir-total-side', topicId: T, conceptId: 'ir-statement', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const date = rng.pick([p.start, p.end]);
    const c = rng.step(150000, 900000, 5000);
    if (rng.next() < 0.55) {
      const liabilities = rng.shuffle(LIABILITY_KINDS.filter((k) => k.label !== 'Bank overdraft')).slice(0, rng.int(2, 3)).map((k) => ({ label: k.label, side: k.side, value: valueOf(rng, k) }));
      const L = sum(liabilities.map((i) => i.value));
      const smallest = liabilities.reduce((s, i) => (i.value < s.value ? i : s));
      const n = numeric(c + L, [
        [c - L, 'Deducted the liabilities from the capital; the assets must cover both the capital and what is owed.'],
        [c, 'Gave the capital alone as the total of the assets.'],
        [c + L - smallest.value, `Left out ${lower(smallest.label)}.`],
      ]);
      return (
        n && {
          prompt: `The statement of affairs of ${t.shop} on ${date} shows a capital of ${inr(c)} as the balancing figure. The liabilities are listed below. What is the total of its assets?\n${liabilities.map(itemLine).join('\n')}`,
          ...n,
          explanation: ['Total assets = Liabilities + Capital (capital is what is left of the assets once the liabilities are met).', `Liabilities = ${plus(liabilities.map((i) => i.value))}.`, `Total assets = ${inr(L)} + ${inr(c)} = ${inr(c + L)}.`],
          hints: H.capital,
        }
      );
    }
    const L = rng.step(20000, 300000, 1000);
    const A = c + L;
    const n = numeric(L, [
      [A + c, 'Added the capital to the assets instead of deducting it.'],
      [c, 'Gave the capital as the total of the liabilities.'],
      [A, 'Gave the total of the assets.'],
    ]);
    return (
      n && {
        prompt: `On ${date} the total assets of ${t.shop} were ${inr(A)}, and its statement of affairs showed a capital of ${inr(c)}. What were its total liabilities?`,
        ...n,
        explanation: ['Capital = Total assets - Total liabilities, so Total liabilities = Total assets - Capital.', `${inr(A)} - ${inr(c)} = ${inr(L)}.`],
        hints: H.capital,
      }
    );
  },
  verify: (q) => {
    if (q.prompt.includes('What were its total liabilities?')) {
      const [A, c] = amountsIn(q.prompt);
      return q.answer === rupees(A - c);
    }
    const c = amountsIn(q.prompt.split('\n')[0])[0];
    const items = itemsIn(q.prompt);
    return items.every((i) => i.side === 'liability') && q.answer === rupees(c + total(items, 'liability'));
  },
});

// ir-formula: the relations of the statement of affairs method, asked in five forms.
const formula = mcqTemplate({
  id: 'ir-formula', topicId: T, conceptId: 'ir-profit', difficulty: 'easy',
  generate: (rng) => {
    const form = rng.pick(['profit', 'closing', 'opening', 'capital', 'loss'] as const);
    if (form === 'profit')
      return choice(
        rng.pick(['Under the statement of affairs method, how is the profit of a year found?', 'Which of these gives the profit for the year when only incomplete records are kept?']),
        'Closing capital + Drawings - Additional capital - Opening capital',
        [
          ['Closing capital - Drawings + Additional capital - Opening capital', 'Reversed both adjustments: drawings are added back and additional capital is taken off.'],
          ['Closing capital + Drawings + Additional capital - Opening capital', 'Added the additional capital; it raised the closing capital without being earned, so it is deducted.'],
          ['Closing capital - Drawings - Additional capital - Opening capital', 'Deducted the drawings; they lowered the closing capital, so they are added back.'],
          ['Opening capital + Drawings - Additional capital - Closing capital', 'Deducted the closing capital from the opening capital; a profit raises capital, so the opening capital is deducted from the closing one.'],
        ],
        'Drawings took capital out during the year and are added back; additional capital put capital in without being earned and is deducted. What is left of the rise over the opening capital is the profit.',
        H.profit,
      );
    if (form === 'closing')
      return choice(
        'When only incomplete records are kept, the capital at the end of the year equals:',
        'Opening capital + Additional capital + Profit - Drawings',
        [
          ['Opening capital + Additional capital + Profit + Drawings', 'Added the drawings; they take capital out of the business.'],
          ['Opening capital - Additional capital + Profit - Drawings', 'Deducted the additional capital; capital brought in raises the capital.'],
          ['Opening capital + Additional capital - Profit - Drawings', 'Deducted the profit; a profit adds to the capital.'],
          ['Total assets + Total liabilities at the end of the year', 'Added the liabilities; capital is what is left of the assets after the liabilities.'],
        ],
        'Capital grows by capital brought in and by profit, and falls by drawings.',
        H.unknown,
      );
    if (form === 'opening')
      return choice(
        'The capital at the beginning of the year is not known. Which relation gives it?',
        'Closing capital + Drawings - Additional capital - Profit',
        [
          ['Closing capital - Drawings + Additional capital - Profit', 'Reversed the drawings and the additional capital.'],
          ['Closing capital + Drawings - Additional capital + Profit', 'Added the profit; the profit made the closing capital larger, so it is taken off to go back to the opening capital.'],
          ['Closing capital + Drawings + Additional capital - Profit', 'Added the additional capital; it is taken off to go back to the opening capital.'],
          ['Closing capital - Profit, with nothing else', 'Left out the drawings and the additional capital, which also changed the capital during the year.'],
        ],
        'Closing capital = Opening capital + Additional capital + Profit - Drawings; turned round, Opening capital = Closing capital + Drawings - Additional capital - Profit.',
        H.unknown,
      );
    if (form === 'capital')
      return choice(
        'In a statement of affairs, how is the capital found?',
        'Total assets - Total liabilities, the balancing figure',
        [
          ['Total assets + Total liabilities', 'Added the liabilities; capital is the part of the assets the business does not owe to outsiders.'],
          ['Total liabilities - Total assets', 'Reversed the two totals; the capital of a going business is assets less liabilities.'],
          ['The balance of the capital account in the ledger', 'Assumed a capital account is kept; under incomplete records there is none, which is why the statement is drawn up.'],
          ['Opening capital + Profit, from the profit and loss account', 'Assumed a profit and loss account can be drawn from the books; the profit is what the statement is used to find.'],
        ],
        'Capital is the excess of the business assets over its liabilities, so it is the balancing figure of the statement.',
        H.capital,
      );
    return choice(
      'Under the statement of affairs method, when has the business made a loss?',
      'When closing capital + drawings - additional capital is less than the opening capital',
      [
        ['Whenever the closing capital is less than the opening capital', 'Left out the drawings: capital can fall in a year of profit if the proprietor drew more than was earned.'],
        ['When closing capital + drawings + additional capital is less than the opening capital', 'Added the additional capital instead of deducting it.'],
        ['When the drawings are more than the additional capital', 'Compared only the drawings and the capital brought in; the capitals decide the result.'],
        ['When the total liabilities are more than the drawings', 'Compared figures that do not measure the result of the year.'],
      ],
      'Adjusted closing capital (closing capital + drawings - additional capital) is compared with the opening capital: a shortfall is a loss.',
      H.profit,
    );
  },
  verify: (q) => {
    const t = optionText(q) ?? '';
    return ['Closing capital + Drawings - Additional capital - Opening capital', 'Opening capital + Additional capital + Profit - Drawings', 'Closing capital + Drawings - Additional capital - Profit', 'Total assets - Total liabilities, the balancing figure', 'When closing capital + drawings - additional capital is less than the opening capital'].includes(t);
  },
});

// ir-classify-item: how an item is treated in the statement of affairs.
type Cat = 'asset' | 'liability' | 'private' | 'capital';
const CAT_TEXT: Record<Cat, string> = {
  asset: 'An asset of the business',
  liability: 'A liability of the business',
  private: 'Left out: it is not an item of the business',
  capital: 'The capital, the balancing figure',
};
const CAT_WHY: Record<Cat, string> = {
  asset: 'Treated it as something the business owns or is owed.',
  liability: 'Treated it as something the business owes.',
  private: 'Left it out, but it belongs to the business; only the private items of the proprietor stay out.',
  capital: 'Took it for the capital, which is the balancing figure: the excess of assets over liabilities.',
};
interface Classed {
  text: (x: string) => string;
  cat: Cat;
  why?: Partial<Record<Cat, string>>;
  note: string;
}
const CLASSED: Classed[] = [
  { text: (x) => `A bank overdraft of ${x}`, cat: 'liability', why: { asset: 'Read "bank" as money in the bank; an overdraft is money the business owes the bank.' }, note: 'An overdraft is a debt to the bank.' },
  { text: (x) => `Rent of the shop, ${x}, still unpaid at the end of the year`, cat: 'liability', why: { asset: 'Treated an unpaid expense as something the business owns.' }, note: 'Rent owed is an outstanding expense, a liability.' },
  { text: (x) => `Insurance of ${x} paid for the coming year`, cat: 'asset', why: { liability: 'Treated a payment made in advance as an amount owed; the business is owed the cover it has paid for.' }, note: 'A prepaid expense is an asset.' },
  { text: (x) => `The proprietor's residential flat, worth ${x}`, cat: 'private', why: { asset: 'Counted a private asset of the proprietor; the business does not own it.' }, note: 'The flat is the proprietor\'s private property (the business entity concept).' },
  { text: (x) => `A loan of ${x} taken for the shop from a friend of the proprietor`, cat: 'liability', why: { capital: 'Treated a loan as capital; the friend is owed the money, so it is a liability.', private: 'The loan was taken for the shop, so the business owes it.' }, note: 'The business must repay the friend: a liability.' },
  { text: (x) => `Goods costing ${x} lying unsold in the shop`, cat: 'asset', note: 'Unsold goods are stock, an asset.' },
  { text: (x) => `${x} due from customers for goods sold on credit`, cat: 'asset', why: { liability: 'Reversed who owes whom: the customers owe the business.' }, note: 'Amounts due from customers are debtors, an asset.' },
  { text: (x) => `A bill of exchange for ${x} accepted by the business in favour of a supplier`, cat: 'liability', why: { asset: 'Read it as a bill receivable; the business accepted the bill, so it must pay it.' }, note: 'A bill the business has accepted is a bill payable.' },
  { text: (x) => `The proprietor's personal car, worth ${x}, used only by the family`, cat: 'private', why: { asset: 'Counted a private asset; a car used only by the family is not a business asset.' }, note: 'A car used only by the family is a private asset.' },
  { text: (x) => `A housing loan of ${x} on the proprietor's home`, cat: 'private', why: { liability: 'Counted a private debt; the business does not owe the housing loan.' }, note: 'A loan for the family home is a private debt of the proprietor.' },
  { text: (x) => `Commission of ${x} earned by the business but not yet received`, cat: 'asset', why: { liability: 'Treated income still to come in as an amount owed by the business.' }, note: 'Accrued income is an asset.' },
  { text: (x) => `Rent of ${x} received in advance from a sub-tenant of the shop`, cat: 'liability', why: { asset: 'Treated money received in advance as income earned; the business still owes the use of the space.' }, note: 'Income received in advance is a liability.' },
  { text: (x) => `Wages of ${x} owed to the shop assistant`, cat: 'liability', note: 'Wages owed are an outstanding expense, a liability.' },
  { text: (x) => `The excess of the business assets over its liabilities, ${x}`, cat: 'capital', why: { asset: 'Took the balancing figure for one more asset.' }, note: 'The excess of assets over liabilities is the capital.' },
];
const classifyItem = mcqTemplate({
  id: 'ir-classify-item', topicId: T, conceptId: 'ir-statement', difficulty: 'easy',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const c = rng.pick(CLASSED);
    const x = inr(rng.step(c.cat === 'private' ? 200000 : 2000, c.cat === 'private' ? 2000000 : 90000, 1000));
    const wrong = (Object.keys(CAT_TEXT) as Cat[]).filter((k) => k !== c.cat).map((k): [string, string] => [CAT_TEXT[k], c.why?.[k] ?? CAT_WHY[k]]);
    return choice(
      `${t.owner} is drawing up a statement of affairs of ${t.shop}. How is this item treated in it: ${lower(c.text(x))}?`,
      CAT_TEXT[c.cat],
      wrong,
      `${c.note} Only what belongs to the business, or what the business owes, goes into its statement of affairs, and the capital is the balancing figure.`,
      H.capital,
    );
  },
  verify: (q) => {
    const x = inr(amountsIn(q.prompt)[0]);
    const c = CLASSED.find((k) => q.prompt.includes(`${lower(k.text(x))}?`));
    return c !== undefined && optionText(q) === CAT_TEXT[c.cat];
  },
});

// ir-feature: the features of incomplete records, and statements that are not.
const FEATURES = [
  'Usually only the cash book and the personal accounts of debtors and creditors are kept',
  'Accounts of expenses and incomes are generally not kept',
  'No trial balance can be drawn up to check the arithmetic',
  'The way records are kept differs from one business to another',
  'Profit can only be estimated, by comparing the capital at two dates',
  'It is found mostly among small traders and sole proprietors',
  'Personal dealings of the owner are often mixed with those of the business',
];
const NOT_FEATURES: [string, string][] = [
  ['Every transaction is recorded with both its debit and its credit', 'That is double entry, the complete system; incomplete records record only some aspects.'],
  ['A trial balance is drawn up to prove the arithmetic of the books', 'Without both sides of every transaction, no trial balance can agree.'],
  ['It is the system that companies must follow', 'Companies must keep complete books by law; incomplete records suit small proprietors.'],
  ['The profit found is exact and fully reliable', 'The profit is only an estimate, found by comparing capitals.'],
  ['Real and nominal accounts are kept in full', 'Usually only cash and personal accounts are kept.'],
  ['A Trading and Profit and Loss Account is drawn straight from the ledger', 'Expenses and incomes are not fully recorded, so these accounts cannot be drawn from the books.'],
];
const feature = mcqTemplate({
  id: 'ir-feature', topicId: T, conceptId: 'ir-meaning', difficulty: 'easy',
  generate: (rng) => {
    if (rng.next() < 0.6) {
      const right = rng.pick(FEATURES);
      return choice(
        rng.pick(['Which of these is a feature of incomplete records?', 'Which statement describes accounts kept on the single entry system?']),
        right,
        rng.shuffle(NOT_FEATURES),
        'Incomplete records (single entry) keep only some accounts, usually cash and personal accounts, so the arithmetic cannot be proved and the profit can only be estimated.',
        H.theory,
      );
    }
    const [notOne, why] = rng.pick(NOT_FEATURES);
    return choice(
      'Which of these is NOT a feature of incomplete records?',
      notOne,
      rng.shuffle(FEATURES).map((f): [string, string] => [f, 'This is a feature of incomplete records; the question asks for one that is not.']),
      `${why} The other statements all describe incomplete records.`,
      H.theory,
    );
  },
  verify: (q) => {
    const t = optionText(q) ?? '';
    return q.prompt.includes('NOT') ? NOT_FEATURES.some(([s]) => s === t) : FEATURES.includes(t);
  },
});

// ir-reason-limitation: why a trader keeps incomplete records, and what it costs.
const REASONS = [
  'It is simple: no knowledge of double entry is needed',
  'It costs less, as no trained accountant has to be employed',
  'It takes less time, as fewer books are written',
  'The business is small and has few transactions',
];
const LIMITATIONS = [
  'The arithmetic cannot be checked, as no trial balance is drawn up',
  'The true profit cannot be found; it can only be estimated',
  'The true financial position cannot be shown, as not every asset and liability is recorded',
  'Errors and frauds are hard to find out',
  'The figures are hard to support before the tax authorities',
  'The results of different years are hard to compare for planning',
];
const FALSE_MERITS: [string, string][] = [
  ['It shows the exact gross profit and net profit from the books', 'Incomplete records cannot give exact profits; that is one of their drawbacks.'],
  ['It is the system the law requires of companies', 'Companies must keep complete double entry books.'],
];
const reasonLimitation = mcqTemplate({
  id: 'ir-reason-limitation', topicId: T, conceptId: 'ir-reasons', difficulty: 'easy',
  generate: (rng) => {
    if (rng.next() < 0.5) {
      return choice(
        rng.pick(['Why do many small traders keep incomplete records?', 'Which of these is a reason for keeping accounts on the single entry system?']),
        rng.pick(REASONS),
        [...rng.shuffle(LIMITATIONS).slice(0, 3).map((l): [string, string] => [l, 'This is a limitation of incomplete records, not a reason for keeping them.']), ...FALSE_MERITS],
        'Traders keep incomplete records because they are simple, cheap and quick to keep, and suit a small business with few transactions.',
        H.theory,
      );
    }
    return choice(
      rng.pick(['Which of these is a limitation of incomplete records?', 'What is a drawback of keeping accounts on the single entry system?']),
      rng.pick(LIMITATIONS),
      [...rng.shuffle(REASONS).slice(0, 3).map((r): [string, string] => [r, 'This is a reason traders choose incomplete records, an advantage and not a limitation.']), ...FALSE_MERITS.slice(1)],
      'Because only some accounts are kept, incomplete records cannot prove their arithmetic, give an exact profit or show a true financial position.',
      H.theory,
    );
  },
  verify: (q) => {
    const t = optionText(q) ?? '';
    return q.prompt.includes('reason') || q.prompt.includes('Why') ? REASONS.includes(t) : LIMITATIONS.includes(t);
  },
});

// ir-sa-vs-bs: the statement of affairs set against the balance sheet.
const SA_POINTS = [
  'It is drawn up from incomplete records, with some figures estimated',
  'Its capital is the balancing figure, the excess of assets over liabilities',
  'An asset or liability left out is hard to detect',
  'It is drawn up mainly to find the capital on a date',
];
const BS_POINTS = [
  'It is drawn up from the ledger balances of a complete double entry system',
  'Its capital is taken from the capital account in the ledger',
  'Its accuracy is supported by the books, which agree through the trial balance',
  'It is drawn up mainly to show the financial position on a date',
];
const saVsBs = mcqTemplate({
  id: 'ir-sa-vs-bs', topicId: T, conceptId: 'ir-statement', difficulty: 'easy',
  generate: (rng) => {
    const of = rng.pick(['sa', 'bs'] as const);
    const [right, other] = of === 'sa' ? [SA_POINTS, BS_POINTS] : [BS_POINTS, SA_POINTS];
    const whyOther = of === 'sa' ? 'This describes a balance sheet, which is drawn from complete books.' : 'This describes a statement of affairs, drawn up from incomplete records.';
    return choice(
      of === 'sa' ? 'Which of these is true of a statement of affairs but not of a balance sheet?' : 'Which of these is true of a balance sheet but not of a statement of affairs?',
      rng.pick(right),
      rng.shuffle(other).map((s): [string, string] => [s, whyOther]),
      'Both list assets and liabilities on a date. A balance sheet comes from complete double entry books and takes its capital from the capital account; a statement of affairs comes from incomplete records and finds the capital as the balancing figure.',
      H.theory,
    );
  },
  verify: (q) => {
    const t = optionText(q) ?? '';
    return q.prompt.includes('statement of affairs but not') ? SA_POINTS.includes(t) : BS_POINTS.includes(t);
  },
});

// ir-capital-or-drawings: which dealing is additional capital, or which is drawings.
const IS_CAPITAL = [
  (x: string) => `The proprietor sold a private plot and paid the ${x} received into the business bank account`,
  (x: string) => `The proprietor brought a personal laptop worth ${x} into the business for its own use`,
  (x: string) => `A shop repair bill of ${x} was paid by the proprietor out of private savings`,
  (x: string) => `A lottery prize of ${x} won by the proprietor was put into the business`,
];
const NOT_CAPITAL: [(x: string) => string, string][] = [
  [(x) => `A bank loan of ${x} taken by the business`, 'A loan is a liability: the bank must be repaid, so it is not capital.'],
  [(x) => `A loan of ${x} given to the business by a friend of the proprietor`, 'The friend must be repaid: a liability, not capital.'],
  [(x) => `Old furniture of the business sold for ${x}`, 'One business asset was turned into cash; the proprietor brought nothing in.'],
  [(x) => `Cash of ${x} collected from debtors`, 'Debtors paying the business change one asset into another; nothing is brought in by the proprietor.'],
];
const IS_DRAWINGS = [
  (x: string) => `A medical bill of ${x} of the proprietor's family, paid from the business cash`,
  (x: string) => `Goods costing ${x} taken home by the proprietor`,
  (x: string) => `The premium of ${x} on the proprietor's life insurance policy, paid by the business`,
  (x: string) => `Cash of ${x} taken from the till by the proprietor for a family holiday`,
];
const NOT_DRAWINGS: [(x: string) => string, string][] = [
  [(x) => `A salary of ${x} paid to the shop assistant`, 'Wages and salaries of employees are expenses of the business.'],
  [(x) => `Insurance of ${x} on the stock of the shop`, 'Insuring the stock is an expense of the business.'],
  [(x) => `A repayment of ${x} of the business's bank loan`, 'Repaying a loan lowers a liability of the business; the proprietor takes nothing.'],
  [(x) => `Rent of ${x} for the shop paid in advance`, 'Rent of the shop is a business expense (paid in advance, an asset), not drawings.'],
];
const capitalOrDrawings = mcqTemplate({
  id: 'ir-capital-or-drawings', topicId: T, conceptId: 'ir-profit', difficulty: 'easy',
  generate: (rng) => {
    const x = inr(rng.step(5000, 90000, 1000));
    if (rng.next() < 0.5) {
      return choice(
        'Which of these is additional capital introduced by the proprietor?',
        rng.pick(IS_CAPITAL)(x),
        rng.shuffle(NOT_CAPITAL).map(([f, why]): [string, string] => [f(x), why]),
        'Additional capital is money or an asset the proprietor puts into the business from private sources, including a business expense paid with private money. Loans and the sale of business assets are not capital.',
        H.profit,
      );
    }
    return choice(
      'Which of these is drawings by the proprietor?',
      rng.pick(IS_DRAWINGS)(x),
      rng.shuffle(NOT_DRAWINGS).map(([f, why]): [string, string] => [f(x), why]),
      'Drawings are cash, goods (at cost) or anything else the proprietor takes from the business for private use, including private bills the business pays.',
      H.drawings,
    );
  },
  verify: (q) => {
    const t = optionText(q) ?? '';
    const x = `₹${t.split('₹')[1]?.split(' ')[0] ?? ''}`;
    const pool = q.prompt.includes('additional capital') ? IS_CAPITAL : IS_DRAWINGS;
    return pool.some((f) => f(x) === t);
  },
});

// ir-profit-or-loss: profit or loss, and how much, when the capital moved for more than one reason.
const profitOrLoss = mcqTemplate({
  id: 'ir-profit-or-loss', topicId: T, conceptId: 'ir-profit', difficulty: 'easy',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(200000, 800000, 5000);
    const kind = rng.pick(['drawings', 'capital'] as const);
    if (kind === 'drawings') {
      // A profit that the drawings more than used up, or a loss made worse by them.
      const r = rng.next() < 0.6 ? rng.step(20000, 120000, 1000) : -rng.step(10000, 60000, 1000);
      const d = (r > 0 ? r : 0) + rng.step(10000, 80000, 1000);
      const c1 = c0 + r - d;
      return choice(
        `${t.owner}'s capital was ${inr(c0)} on ${p.start} and ${inr(c1)} on ${p.end}. The proprietor drew ${inr(d)} during the year. What was the result of the year?`,
        resultText(r),
        [
          [resultText(c1 - c0), 'Compared the two capitals and left out the drawings.'],
          [resultText(c1 - c0 - d), 'Deducted the drawings instead of adding them back.'],
          [resultText(-r), reversedWhy(r)],
          [resultText(d), 'Gave the drawings as the result.'],
        ],
        `Profit or loss = Closing capital + Drawings - Opening capital = ${inr(c1)} + ${inr(d)} - ${inr(c0)} = ${r >= 0 ? inr(r) : `-${inr(-r)}`}: a ${r >= 0 ? 'profit' : 'loss'} of ${inr(Math.abs(r))}.`,
        H.profit,
      );
    }
    const r = rng.next() < 0.5 ? rng.step(20000, 120000, 1000) : -rng.step(10000, 60000, 1000);
    const a = (r < 0 ? -r : 0) + rng.step(20000, 100000, 5000);
    const c1 = c0 + r + a;
    return choice(
      `${t.owner}'s capital rose from ${inr(c0)} on ${p.start} to ${inr(c1)} on ${p.end}. During the year the proprietor brought in a further ${inr(a)} as capital, and drew nothing. What was the result of the year?`,
      resultText(r),
      [
        [resultText(c1 - c0), 'Took the whole rise in capital as profit and left out the capital brought in.'],
        [resultText(c1 - c0 + a), 'Added the capital brought in instead of deducting it.'],
        [resultText(-r), reversedWhy(r)],
        [resultText(a), 'Gave the capital brought in as the result.'],
      ],
      `Profit or loss = Closing capital - Additional capital - Opening capital = ${inr(c1)} - ${inr(a)} - ${inr(c0)} = ${r >= 0 ? inr(r) : `-${inr(-r)}`}: a ${r >= 0 ? 'profit' : 'loss'} of ${inr(Math.abs(r))}.`,
      H.profit,
    );
  },
  verify: (q) => {
    const [c0, c1, x] = amountsIn(q.prompt);
    const r = q.prompt.includes('brought in a further') ? c1 - x - c0 : c1 + x - c0;
    return optionText(q) === resultText(r);
  },
});

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

// ir-profit-both: profit with drawings and additional capital together.
const profitBoth = numericTemplate({
  id: 'ir-profit-both', topicId: T, conceptId: 'ir-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 900000, 5000);
    const profit = rng.step(30000, 250000, 1000);
    const d = cashDrawings(rng);
    const a = capitalIn(rng);
    const c1 = c0 + profit + a.amount - d.total;
    if (c1 < 50000) return null;
    const lines = rng.next() < 0.5 ? [d.line, a.line] : [a.line, d.line];
    const n = numeric(profit, [
      [profit + 2 * a.amount, 'Added the additional capital instead of deducting it.'],
      [profit - 2 * d.total, 'Deducted the drawings instead of adding them back.'],
      [c1 - c0, 'Compared the two capitals and left out both the drawings and the additional capital.'],
      [profit + a.amount, 'Left out the additional capital.'],
      [profit - d.total, 'Left out the drawings.'],
      [d.monthly ? profit - 11 * d.monthly : 0, "Added back one month's drawings instead of twelve."],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} Find the profit for the ${p.year} from the figures below.\n${openLine(p, c0)}\n${closeLine(p, c1)}\n${lines.join('\n')}`,
        ...n,
        explanation: [
          `Drawings for the year = ${d.how}.`,
          `Adjusted closing capital = ${inr(c1)} + ${inr(d.total)} (drawings) - ${inr(a.amount)} (additional capital) = ${inr(c1 + d.total - a.amount)}.`,
          `Profit = Adjusted closing capital - Opening capital = ${inr(c1 + d.total - a.amount)} - ${inr(c0)} = ${inr(profit)}.`,
        ],
        hints: H.profit,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    return f.opening !== undefined && f.closing !== undefined && f.additional > 0 && f.drawings > 0 && q.answer === rupees(f.closing + f.drawings - f.additional - f.opening);
  },
});

// ir-loss: a loss, with drawings, additional capital or both.
const lossYear = numericTemplate({
  id: 'ir-loss', topicId: T, conceptId: 'ir-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(200000, 900000, 5000);
    const loss = rng.step(10000, 120000, 1000);
    const shape = rng.pick(['drawings', 'capital', 'both'] as const);
    const d = shape === 'capital' ? null : cashDrawings(rng, 20000, 100000);
    const a = shape === 'drawings' ? null : capitalIn(rng, 20000, 150000);
    const D = d?.total ?? 0;
    const A = a?.amount ?? 0;
    const c1 = c0 - loss + A - D;
    if (c1 < 50000) return null;
    const n = numeric(loss, [
      [A ? loss - A : 0, 'Left out the additional capital, which hides part of the loss.'],
      [D ? loss + D : 0, 'Left out the drawings, which makes the loss look larger than it is.'],
      [A ? loss - 2 * A : 0, 'Added the additional capital instead of deducting it.'],
      [D ? loss + 2 * D : 0, 'Deducted the drawings instead of adding them back.'],
      [D && A ? c0 - c1 : 0, 'Compared the two capitals and left out both the drawings and the additional capital.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} The business made a loss in the ${p.year}. Find the loss.\n${[openLine(p, c0), closeLine(p, c1), ...(d ? [d.line] : []), ...(a ? [a.line] : [])].join('\n')}`,
        ...n,
        explanation: [
          ...(d ? [`Drawings for the year = ${d.how}.`] : []),
          `Adjusted closing capital = ${inr(c1)}${D ? ` + ${inr(D)} (drawings)` : ''}${A ? ` - ${inr(A)} (additional capital)` : ''} = ${inr(c1 + D - A)}.`,
          `It is less than the opening capital of ${inr(c0)}, so there is a loss: ${inr(c0)} - ${inr(c1 + D - A)} = ${inr(loss)}.`,
        ],
        hints: H.profit,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    return f.opening !== undefined && f.closing !== undefined && q.answer === rupees(f.opening - (f.closing + f.drawings - f.additional));
  },
});

// ir-opening-capital: the capital at the beginning, worked back from the end of the year.
const openingCapital = numericTemplate({
  id: 'ir-opening-capital', topicId: T, conceptId: 'ir-capital', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 900000, 5000);
    const loss = rng.next() < 0.25;
    const r = loss ? -rng.step(10000, 70000, 1000) : rng.step(30000, 250000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const a = rng.next() < 0.6 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const c1 = c0 + r + A - d.total;
    if (c1 < 50000) return null;
    const n = numeric(c0, [
      [c1 - r, 'Took only the result of the year off the closing capital and left out the drawings and the capital brought in.'],
      [c0 - 2 * d.total, 'Deducted the drawings instead of adding them back.'],
      [A ? c0 + 2 * A : 0, 'Added the additional capital instead of deducting it.'],
      [c0 + 2 * r, loss ? 'Deducted the loss instead of adding it back.' : 'Added the profit instead of deducting it.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} The capital at the beginning of the ${p.year} is not known. Find it from the figures below.\n${[closeLine(p, c1), loss ? `${LOSS_LINE}: ${inr(-r)}` : `${PROFIT_LINE}: ${inr(r)}`, d.line, ...(a ? [a.line] : [])].join('\n')}`,
        ...n,
        explanation: [
          `Drawings for the year = ${d.how}.`,
          `Opening capital = Closing capital + Drawings${A ? ' - Additional capital' : ''} ${loss ? '+ Loss' : '- Profit'}.`,
          `${inr(c1)} + ${inr(d.total)}${A ? ` - ${inr(A)}` : ''} ${loss ? `+ ${inr(-r)}` : `- ${inr(r)}`} = ${inr(c0)}.`,
        ],
        hints: H.unknown,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.closing === undefined) return false;
    const r = f.profit ?? -(f.loss ?? NaN);
    // Walk forward from the answer: the opening capital, the capital brought in and the result, less drawings, is the closing capital.
    return q.answer / 100 + f.additional + r - f.drawings === f.closing;
  },
});

// ir-drawings-unknown: the drawings, a year's total or an equal amount every month, found from the profit.
const drawingsUnknown = numericTemplate({
  id: 'ir-drawings-unknown', topicId: T, conceptId: 'ir-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const monthly = rng.next() < 0.45;
    // With a monthly answer every figure is a multiple of ₹6,000 (the opening capital from ₹1,50,000, the profit from
    // ₹42,000, the capital brought in from ₹24,000), so that each wrong year's figure is whole rupees a month.
    const c0 = rng.step(150000, 900000, monthly ? 6000 : 5000);
    const profit = monthly ? rng.step(42000, 300000, 6000) : rng.step(40000, 300000, 1000);
    const m = rng.step(2000, 15000, 500);
    const D = monthly ? 12 * m : rng.step(20000, Math.min(200000, profit + 50000), 1000);
    // A year's total is always asked with capital brought in as well; the monthly figure with or without it.
    const a = !monthly || rng.next() < 0.5 ? (monthly ? capitalIn(rng, 24000, 198000, 6000) : capitalIn(rng, 20000, 200000, 5000)) : null;
    const A = a?.amount ?? 0;
    const c1 = c0 + profit + A - D;
    if (c1 < 50000) return null;
    const answer = monthly ? m : D;
    const per = (x: number) => (monthly ? x / 12 : x);
    const ok = (x: number) => (monthly && x % 12 !== 0 ? 0 : per(x));
    const n = numeric(answer, [
      [A ? ok(D - A) : 0, 'Left out the additional capital.'],
      [A ? ok(D - 2 * A) : 0, 'Took the additional capital off instead of adding it.'],
      [monthly ? D : 0, "Gave the whole year's drawings instead of the amount each month."],
      [ok(D - profit), 'Left out the profit.'],
      [ok(D + 2 * (c1 - c0)), 'Moved the capitals across with the wrong signs: added the closing capital and deducted the opening one.'],
    ]);
    const ask = monthly ? 'The proprietor drew the same amount at the end of every month. How much was drawn each month?' : 'How much did the proprietor draw during the year?';
    return (
      n && {
        prompt: `${intro(rng, t)} The profit for the ${p.year} was ${inr(profit)}. ${ask}\n${[openLine(p, c0), closeLine(p, c1), ...(a ? [a.line] : [])].join('\n')}`,
        ...n,
        explanation: [
          `Closing capital = Opening capital${A ? ' + Additional capital' : ''} + Profit - Drawings, so Drawings = Opening capital${A ? ' + Additional capital' : ''} + Profit - Closing capital.`,
          `${inr(c0)}${A ? ` + ${inr(A)}` : ''} + ${inr(profit)} - ${inr(c1)} = ${inr(D)}.`,
          ...(monthly ? [`Each month = ${inr(D)} / 12 = ${inr(m)}.`] : []),
        ],
        hints: H.unknown,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    const profit = amountsIn(q.prompt.split('\n')[0])[0];
    if (f.opening === undefined || f.closing === undefined) return false;
    const D = f.opening + f.additional + profit - f.closing;
    return q.prompt.includes('each month') ? q.answer * 12 === rupees(D) : q.answer === rupees(D);
  },
});

// ir-additional-unknown: the capital brought in, found from the profit.
const additionalUnknown = numericTemplate({
  id: 'ir-additional-unknown', topicId: T, conceptId: 'ir-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 900000, 5000);
    const profit = rng.step(30000, 250000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const A = rng.step(20000, 200000, 5000);
    const c1 = c0 + profit + A - d.total;
    if (c1 < 50000) return null;
    const n = numeric(A, [
      [A - d.total, 'Left out the drawings.'],
      [A - 2 * d.total, 'Deducted the drawings instead of adding them back.'],
      [A + 2 * profit, 'Added the profit instead of deducting it.'],
      [A + profit, 'Left out the profit.'],
      [d.monthly ? A - 11 * d.monthly : 0, "Counted one month's drawings instead of twelve."],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} During the ${p.year} the proprietor brought some more capital into the business, and the profit for the year was ${inr(profit)}. How much additional capital was brought in?\n${[openLine(p, c0), closeLine(p, c1), d.line].join('\n')}`,
        ...n,
        explanation: [
          `Drawings for the year = ${d.how}.`,
          'Profit = Closing capital + Drawings - Additional capital - Opening capital, so Additional capital = Closing capital + Drawings - Opening capital - Profit.',
          `${inr(c1)} + ${inr(d.total)} - ${inr(c0)} - ${inr(profit)} = ${inr(A)}.`,
        ],
        hints: H.unknown,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    const profit = amountsIn(q.prompt.split('\n')[0])[0];
    return f.opening !== undefined && f.closing !== undefined && f.opening + q.answer / 100 + profit - f.drawings === f.closing;
  },
});

// ir-capital-exclusions: capital from a list with private items and expenses owed or paid ahead.
const capitalExclusions = numericTemplate({
  id: 'ir-capital-exclusions', topicId: T, conceptId: 'ir-statement', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const date = rng.pick([p.start, p.end]);
    const items = drawItems(rng, rng.int(3, 5), rng.int(1, 3));
    const privates = rng.shuffle(PRIVATE_KINDS).slice(0, rng.int(1, 2)).map((k) => ({ label: k.label, side: k.side, value: valueOf(rng, k) }));
    const all = [...items, ...privates];
    const A = total(items, 'asset');
    const L = total(items, 'liability');
    const c = A - L;
    if (c < 50000) return null;
    const privA = sum(privates.filter((i) => PRIVATE_ASSET(i.label)).map((i) => i.value));
    const privL = sum(privates.filter((i) => !PRIVATE_ASSET(i.label)).map((i) => i.value));
    const owed = items.find((i) => i.label.startsWith('Outstanding') || i.label === 'Bank overdraft');
    const ahead = items.find((i) => i.label === 'Prepaid insurance');
    const n = numeric(c, [
      [c + privA - privL, 'Counted the private assets and debts of the proprietor as those of the business.'],
      [privA ? c + privA : 0, 'Counted the private assets of the proprietor as business assets.'],
      [owed ? c + 2 * owed.value : 0, owed ? `Counted ${lower(owed.label)} as an asset: it is owed by the business.` : ''],
      [ahead ? c - ahead.value : 0, 'Left out the prepaid insurance, which is an asset of the business.'],
      [A + L, 'Added the liabilities to the assets.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} The figures below were collected on ${date}, some of them about the proprietor's own affairs. Find the capital of the business on that date.\n${rng.shuffle(all).map(itemLine).join('\n')}`,
        ...n,
        explanation: [
          `Left out, as private: ${privates.map((i) => lower(i.label)).join(' and ')}.`,
          `Business assets = ${plus(items.filter((i) => i.side === 'asset').map((i) => i.value))}.`,
          `Business liabilities = ${plus(items.filter((i) => i.side === 'liability').map((i) => i.value))}.`,
          `Capital = ${inr(A)} - ${inr(L)} = ${inr(c)}.`,
        ],
        hints: H.capital,
      }
    );
  },
  verify: (q) => {
    const items = itemsIn(q.prompt);
    return items.some((i) => i.side === 'private') && q.answer === rupees(total(items, 'asset') - total(items, 'liability'));
  },
});

// ir-profit-goods: drawings in cash and in goods (at cost), and sometimes capital brought in.
const profitGoods = numericTemplate({
  id: 'ir-profit-goods', topicId: T, conceptId: 'ir-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 900000, 5000);
    const profit = rng.step(30000, 250000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const g = goodsDrawn(rng);
    const a = rng.next() < 0.5 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const D = d.total + g.cost;
    const c1 = c0 + profit + A - D;
    if (c1 < 50000) return null;
    const n = numeric(profit, [
      [profit - g.cost + g.price, 'Took the goods at their sale price; goods drawn are valued at cost.'],
      [profit - g.cost, 'Left out the goods taken by the proprietor.'],
      [d.monthly ? profit - 11 * d.monthly : 0, "Added back one month's cash drawings instead of twelve."],
      [A ? profit + 2 * A : 0, 'Added the additional capital instead of deducting it.'],
      [profit - 2 * D, 'Deducted the drawings instead of adding them back.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} Find the profit for the ${p.year}.\n${[openLine(p, c0), closeLine(p, c1), d.line, g.line, ...(a ? [a.line] : [])].join('\n')}`,
        ...n,
        explanation: [
          `Drawings = cash ${d.how} + goods at cost ${inr(g.cost)} = ${inr(D)}.`,
          `Profit = ${inr(c1)} + ${inr(D)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${inr(profit)}.`,
        ],
        hints: H.drawings,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    return f.goodsCost > 0 && f.opening !== undefined && f.closing !== undefined && q.answer === rupees(f.closing + f.drawings - f.additional - f.opening);
  },
});

// ir-interest-capital: the profit found, then interest on capital deducted.
const interestCapital = numericTemplate({
  id: 'ir-interest-capital', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(100000, 800000, 10000);
    const p0 = rng.step(60000, 300000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const a = rng.next() < 0.4 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const c1 = c0 + p0 + A - d.total;
    if (c1 < 50000) return null;
    const ioc = makeAdj(rng, 'ioc', c0)!;
    const I = -ioc.effect;
    const net = p0 - I;
    const r = I * 100 / c0;
    const n = numeric(net, [
      [p0, 'Stopped at the profit found from the capitals and made no adjustment.'],
      [p0 + I, 'Added the interest on capital; it is a charge against the profit.'],
      [Number.isInteger((c1 * r) / 100) ? p0 - (c1 * r) / 100 : 0, 'Worked the interest on the closing capital instead of the capital at the beginning of the year.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} Find the net profit for the ${p.year} after the adjustment given.\n${[openLine(p, c0), closeLine(p, c1), d.line, ...(a ? [a.line] : []), ioc.line].join('\n')}`,
        ...n,
        explanation: [
          `Profit before adjustments = ${inr(c1)} + ${inr(d.total)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${inr(p0)}.`,
          ioc.how,
          `Net profit = ${inr(p0)} - ${inr(I)} = ${inr(net)}.`,
        ],
        hints: H.adjust,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    return adj.count >= 1 && q.answer === rupees(f.closing + f.drawings - f.additional - f.opening + adj.effect);
  },
});

// ir-depreciation-provision: depreciation and a provision on debtors left out of the closing statement.
const depreciationProvision = numericTemplate({
  id: 'ir-depreciation-provision', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 800000, 5000);
    const p0 = rng.step(60000, 300000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const c1 = c0 + p0 - d.total;
    if (c1 < 50000) return null;
    const keys = rng.pick([['dep'], ['pdd'], ['dep', 'pdd']] as AdjKey[][]);
    const adjs = makeAdjs(rng, keys, c0);
    if (!adjs) return null;
    const cut = -sum(adjs.map((x) => x.effect));
    const net = p0 - cut;
    const askCapital = rng.next() < 0.35;
    const answer = askCapital ? c1 - cut : net;
    const errs: [number, string][] = askCapital
      ? [
          [c1, 'Kept the closing capital as the statement showed it, before the adjustment.'],
          [c1 + cut, 'Added the adjustment to the capital; a fall in the value of an asset lowers the capital.'],
          [net, 'Gave the corrected profit instead of the corrected capital.'],
        ]
      : [
          [p0, 'Made no adjustment for what the closing statement left out.'],
          [p0 + cut, 'Added the adjustment; depreciation and a provision reduce the profit.'],
          ...adjs.map((x): [number, string] => [adjs.length > 1 ? p0 + x.effect : 0, `Made only one of the two adjustments; ${lower(x.label.replace(/^Less: /, ''))} was the only one deducted.`]),
        ];
    const n = numeric(answer, errs);
    return (
      n && {
        prompt: `${intro(rng, t)} Its statement of affairs on ${p.end} was drawn up before the adjustments below. ${askCapital ? `What is the correct capital on ${p.end}?` : `Find the net profit for the ${p.year}.`}\n${[openLine(p, c0), closeLine(p, c1), d.line, ...adjs.map((x) => x.line)].join('\n')}`,
        ...n,
        explanation: askCapital
          ? [...adjs.map((x) => x.how), `Each lowers an asset, so it lowers the capital: ${inr(c1)} - ${inr(cut)} = ${inr(answer)}.`]
          : [`Profit before adjustments = ${inr(c1)} + ${inr(d.total)} - ${inr(c0)} = ${inr(p0)}.`, ...adjs.map((x) => x.how), `Net profit = ${inr(p0)} - ${inr(cut)} = ${inr(net)}.`],
        hints: H.adjust,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    if (adj.count < 1 || adj.effect >= 0) return false;
    return q.prompt.includes('correct capital') ? q.answer === rupees(f.closing + adj.effect) : q.answer === rupees(f.closing + f.drawings - f.opening + adj.effect);
  },
});

// ir-outstanding-prepaid: amounts owed, paid ahead and earned but not received, left out of the closing statement.
const outstandingPrepaid = numericTemplate({
  id: 'ir-outstanding-prepaid', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 800000, 5000);
    const p0 = rng.step(50000, 300000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const c1 = c0 + p0 - d.total;
    if (c1 < 50000) return null;
    const keys = rng.pick([['out', 'pre'], ['out', 'acc'], ['out', 'pre', 'acc'], ['pre', 'out']] as AdjKey[][]);
    const adjs = makeAdjs(rng, keys, c0);
    if (!adjs) return null;
    const eff = sum(adjs.map((x) => x.effect));
    if (eff === 0) return null;
    const minus = sum(adjs.filter((x) => x.effect < 0).map((x) => x.effect));
    const net = p0 + eff;
    const added = adjs.filter((x) => x.effect > 0).map((x) => (x.key === 'pre' ? 'the prepaid expense' : 'the accrued income'));
    const n = numeric(net, [
      [p0, 'Made no adjustment for the items left out of the closing statement.'],
      [p0 - eff, 'Reversed every adjustment: deducted the assets left out and added the liabilities.'],
      [p0 + minus, 'Deducted the outstanding expense but did not add the assets left out.'],
      [p0 - sum(adjs.map((x) => Math.abs(x.effect))), `Deducted every item, ${added.join(' and ')} as well; ${added.length > 1 ? 'they are assets' : 'it is an asset'} left out, to be added.`],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} The capital on ${p.end} was found from a statement of affairs that left out the items below. Find the net profit for the ${p.year}.\n${[openLine(p, c0), closeLine(p, c1), d.line, ...adjs.map((x) => x.line)].join('\n')}`,
        ...n,
        explanation: [`Profit before adjustments = ${inr(c1)} + ${inr(d.total)} - ${inr(c0)} = ${inr(p0)}.`, ...adjs.map((x) => x.how), `Net profit = ${inr(p0)} ${adjs.map((x) => `${x.effect < 0 ? '-' : '+'} ${inr(Math.abs(x.effect))}`).join(' ')} = ${inr(net)}.`],
        hints: H.adjust,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    return adj.count >= 2 && q.answer === rupees(f.closing + f.drawings - f.opening + adj.effect);
  },
});

// ir-adjust-direction: does an item left out of the closing statement raise or lower the profit found?
const DIRECTION = {
  minus: 'It is deducted from the profit found',
  plus: 'It is added to the profit found',
  none: 'It makes no difference to the profit',
  opening: 'It is added to the opening capital',
};
interface DirItem {
  text: (x: string) => string;
  dir: 'minus' | 'plus';
  why: string;
}
const DIR_ITEMS: DirItem[] = [
  { text: (x) => `Salaries of ${x} were outstanding at the year end and are not in the closing statement.`, dir: 'minus', why: 'An unpaid expense is a liability left out: the closing capital, and so the profit, were overstated.' },
  { text: (x) => `Insurance of ${x} paid for the next year is not in the closing statement.`, dir: 'plus', why: 'A prepaid expense is an asset left out: the closing capital, and so the profit, were understated.' },
  { text: (x) => `Depreciation of ${x} on machinery was not taken into the closing statement.`, dir: 'minus', why: 'Depreciation lowers the value of an asset; leaving it out overstated the closing capital and the profit.' },
  { text: (x) => `A provision for doubtful debts of ${x} was not taken into the closing statement.`, dir: 'minus', why: 'The provision lowers the debtors; leaving it out overstated the closing capital and the profit.' },
  { text: (x) => `Interest on capital of ${x} is to be allowed to the proprietor.`, dir: 'minus', why: 'Interest on capital is a charge against the profit; the statements of affairs cannot show it.' },
  { text: (x) => `Commission of ${x} earned but not received is not in the closing statement.`, dir: 'plus', why: 'Accrued income is an asset left out: the closing capital, and so the profit, were understated.' },
  { text: (x) => `Goods costing ${x} taken by the proprietor were left out of the drawings.`, dir: 'plus', why: 'They are drawings, and drawings are added back to the closing capital: the profit was understated.' },
  { text: (x) => `The proprietor's private car, worth ${x}, was wrongly taken into the closing statement as an asset.`, dir: 'minus', why: 'A private asset inflated the closing capital, so the profit was overstated and the car must come out.' },
];
const adjustDirection = mcqTemplate({
  id: 'ir-adjust-direction', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'medium',
  generate: (rng) => {
    const it = rng.pick(DIR_ITEMS);
    const x = inr(rng.step(2000, 40000, 500));
    const other = it.dir === 'minus' ? 'plus' : 'minus';
    return choice(
      `The profit of a business has been found by comparing its capitals at the start and the end of the year. ${it.text(x)} How is the profit corrected?`,
      DIRECTION[it.dir],
      [
        [DIRECTION[other], `Turned the effect round. ${it.why}`],
        [DIRECTION.none, 'Thought the item does not change the capital; it does, and the profit with it.'],
        [DIRECTION.opening, 'Moved it to the opening capital; it belongs to the closing position or to the year itself.'],
      ],
      `${it.why} So: ${lower(DIRECTION[it.dir])}, by ${x}.`,
      H.adjust,
    );
  },
  verify: (q) => {
    const x = inr(amountsIn(q.prompt)[0]);
    const it = DIR_ITEMS.find((i) => q.prompt.includes(i.text(x)));
    return it !== undefined && optionText(q) === DIRECTION[it.dir];
  },
});

// ir-slip-effect: by how much a slip in the working moves the profit.
interface Slip {
  text: (x: string) => string;
  effect: (x: number) => number;
  why: string;
  /** The range of the figure, in rupees, and its step: a flat is worth lakhs, prepaid rent thousands. */
  range: [number, number, number];
}
const SLIPS: Slip[] = [
  { text: (x) => `added the additional capital of ${x} instead of deducting it`, effect: (x) => 2 * x, why: 'The capital should have been taken off; adding it instead puts it in twice over.', range: [20000, 200000, 5000] },
  { text: (x) => `deducted the drawings of ${x} instead of adding them back`, effect: (x) => -2 * x, why: 'The drawings should have been added; deducting them instead takes them off twice over.', range: [20000, 150000, 1000] },
  { text: (x) => `left out the drawings of ${x}`, effect: (x) => -x, why: 'The drawings were not added back, so the profit is short by their amount.', range: [20000, 150000, 1000] },
  { text: (x) => `left out the additional capital of ${x}`, effect: (x) => x, why: 'The capital brought in was not taken off, so it was counted as profit.', range: [20000, 200000, 5000] },
  { text: (x) => `took the proprietor's private flat, worth ${x}, into the closing statement of affairs`, effect: (x) => x, why: 'A private asset raised the closing capital and so the profit by its value.', range: [1500000, 4000000, 50000] },
  { text: (x) => `showed creditors of ${x} as an asset in the closing statement of affairs`, effect: (x) => 2 * x, why: 'A liability shown as an asset raises the assets and lowers the liabilities: the closing capital is wrong by twice the amount.', range: [10000, 150000, 1000] },
  { text: (x) => `showed prepaid rent of ${x} as a liability in the closing statement of affairs`, effect: (x) => -2 * x, why: 'An asset shown as a liability lowers the closing capital by twice its amount.', range: [2000, 30000, 500] },
];
const effectText = (e: number): string => (e > 0 ? `Overstated by ${inr(e)}` : e < 0 ? `Understated by ${inr(-e)}` : 'No effect on the profit');
const slipEffect = mcqTemplate({
  id: 'ir-slip-effect', topicId: T, conceptId: 'ir-profit', difficulty: 'medium',
  generate: (rng) => {
    const s = rng.pick(SLIPS);
    const x = rng.step(...s.range);
    const e = s.effect(x);
    return choice(
      `Working out the profit of a business from its statements of affairs, a student ${s.text(inr(x))}. How does this affect the profit found?`,
      effectText(e),
      [
        [effectText(-e), 'Turned the direction of the error round.'],
        [effectText(Math.abs(e) === x ? 2 * e : e / 2), Math.abs(e) === x ? 'Doubled the error; one figure was wrong, but it was not moved to the wrong side.' : 'Counted the error once; putting an item on the wrong side moves the figure by twice its amount.'],
        [effectText(0), 'Thought the slip cancels out; it changes the capital compared, and so the profit.'],
        [effectText(-(Math.abs(e) === x ? 2 * e : e / 2)), 'Turned the direction round and got the size wrong as well.'],
      ],
      s.why,
      H.profit,
    );
  },
  verify: (q) => {
    const x = amountsIn(q.prompt)[0];
    const s = SLIPS.find((k) => q.prompt.includes(k.text(inr(x))));
    return s !== undefined && optionText(q) === effectText(s.effect(x));
  },
});

// ===============================================================================================================
// COMPLEX
// ===============================================================================================================

/** "Cash in hand: ₹12,000 on 1 April 2025; ₹15,500 on 31 March 2026", nil where the item is not there. */
const twoDateLine = (label: string, v0: number, v1: number, p: Period): string => `${label}: ${v0 ? inr(v0) : 'nil'} on ${p.start}; ${v1 ? inr(v1) : 'nil'} on ${p.end}`;
function twoDateItems(text: string): { label: string; side: Side; v0: number; v1: number }[] {
  const out: { label: string; side: Side; v0: number; v1: number }[] = [];
  for (const line of text.split('\n')) {
    const m = /^(.+): (₹[\d,]+|nil) on 1 April \d+; (₹[\d,]+|nil) on 31 March \d+$/.exec(line);
    const side = m ? SIDE_OF.get(m[1]) : undefined;
    if (m && side) out.push({ label: m[1], side, v0: m[2] === 'nil' ? 0 : num(m[2].slice(1)), v1: m[3] === 'nil' ? 0 : num(m[3].slice(1)) });
  }
  return out;
}
/** The items of a business at two dates: some exist at only one of them. Null when either capital is too small. */
function twoDates(rng: Rng, nAssets: number, nLiabilities: number): { label: string; side: Side; v0: number; v1: number }[] | null {
  const items = drawItems(rng, nAssets, nLiabilities);
  const out = items.map((i) => {
    const k = [...ASSET_KINDS, ...LIABILITY_KINDS].find((x) => x.label === i.label)!;
    const only = rng.next();
    // Most items are there at both dates; a few are new at the end (a bank loan taken) or gone by then (bills met).
    // An item there at both dates moves within believable limits over the year: 70% to 140% of its opening figure.
    const v0 = only < 0.15 ? 0 : i.value;
    const moved = Math.max(k.step, Math.round((v0 * rng.int(70, 140)) / 100 / k.step) * k.step);
    const v1 = only > 0.88 ? 0 : v0 ? moved : valueOf(rng, k);
    return { label: i.label, side: i.side, v0, v1 };
  });
  const cap = (c: 'v0' | 'v1') => sum(out.filter((i) => i.side === 'asset').map((i) => i[c])) - sum(out.filter((i) => i.side === 'liability').map((i) => i[c]));
  if (cap('v0') < 60000 || cap('v1') < 60000) return null;
  if (!out.some((i) => i.side === 'liability' && i.v0 > 0) || !out.some((i) => i.side === 'liability' && i.v1 > 0)) return null;
  return out;
}
const capOf = (items: readonly { side: Side; v0: number; v1: number }[], c: 'v0' | 'v1'): number =>
  sum(items.filter((i) => i.side === 'asset').map((i) => i[c])) - sum(items.filter((i) => i.side === 'liability').map((i) => i[c]));

// ir-profit-two-lists: both statements of affairs to draw up, then the profit.
const profitTwoLists = numericTemplate({
  id: 'ir-profit-two-lists', topicId: T, conceptId: 'ir-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const items = twoDates(rng, rng.int(4, 5), rng.int(2, 3));
    if (!items) return null;
    const c0 = capOf(items, 'v0');
    const d = cashDrawings(rng, 20000, 120000);
    const g = rng.next() < 0.5 ? goodsDrawn(rng) : null;
    const a = rng.next() < 0.5 ? capitalIn(rng) : null;
    const D = d.total + (g?.cost ?? 0);
    const A = a?.amount ?? 0;
    // The largest asset at the end takes up the difference, so that the year ends on the profit drawn. It may move
    // only within believable limits, from half to one and a half times its figure at the start (or, for an asset new
    // at the end, its figure as drawn), so that no van or machine doubles in value without a word: the profit is
    // drawn from the range those limits allow.
    const top = items.filter((i) => i.side === 'asset' && i.v1 > 0).reduce((b, i) => (i.v1 > b.v1 ? i : b));
    const ref = top.v0 || top.v1;
    const natural = capOf(items, 'v1') + D - A - c0; // the profit if the largest asset kept its figure as drawn
    const lo = Math.max(20000, Math.ceil((natural + Math.max(10000, ref / 2) - top.v1) / 1000) * 1000);
    const hi = Math.min(200000, Math.floor((natural + ref * 1.5 - top.v1) / 1000) * 1000);
    if (lo > hi) return null;
    const profit = rng.step(lo, hi, 1000);
    top.v1 += profit - natural;
    const c1 = capOf(items, 'v1');
    if (c1 < 60000) return null;
    const Lchange = sum(items.filter((i) => i.side === 'liability').map((i) => i.v1 - i.v0));
    const n = numeric(profit, [
      [profit - D, 'Left out the drawings.'],
      [A ? profit + 2 * A : 0, 'Added the additional capital instead of deducting it.'],
      [profit + Lchange, 'Compared the total assets only and left the liabilities out of both statements.'],
      [g ? profit - g.cost + g.price : 0, 'Took the goods drawn at their sale price instead of their cost.'],
      [profit - 2 * D, 'Deducted the drawings instead of adding them back.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} From the figures below, find the profit for the ${p.year}.\n${[...items.map((i) => twoDateLine(i.label, i.v0, i.v1, p)), d.line, ...(g ? [g.line] : []), ...(a ? [a.line] : [])].join('\n')}`,
        ...n,
        explanation: [
          `Capital on ${p.start} = assets ${inr(c0 + sum(items.filter((i) => i.side === 'liability').map((i) => i.v0)))} - liabilities ${inr(sum(items.filter((i) => i.side === 'liability').map((i) => i.v0)))} = ${inr(c0)}.`,
          `Capital on ${p.end} = assets ${inr(c1 + sum(items.filter((i) => i.side === 'liability').map((i) => i.v1)))} - liabilities ${inr(sum(items.filter((i) => i.side === 'liability').map((i) => i.v1)))} = ${inr(c1)}.`,
          `Drawings = ${d.how}${g ? ` + goods at cost ${inr(g.cost)} = ${inr(D)}` : ''}.`,
          `Profit = ${inr(c1)} + ${inr(D)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${inr(profit)}.`,
        ],
        hints: [...H.capital.slice(0, 1), ...H.profit.slice(0, 1)],
      }
    );
  },
  verify: (q) => {
    const items = twoDateItems(q.prompt);
    const f = factsOf(q.prompt);
    return items.length >= 6 && q.answer === rupees(capOf(items, 'v1') + f.drawings - f.additional - capOf(items, 'v0'));
  },
});

// ir-adjusted-profit: the profit found, then three or four adjustments of every kind.
const adjustedProfit = numericTemplate({
  id: 'ir-adjusted-profit', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 800000, 10000);
    const p0 = rng.step(80000, 350000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const a = rng.next() < 0.5 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const c1 = c0 + p0 + A - d.total;
    if (c1 < 50000) return null;
    const keys = rng.shuffle(['ioc', 'dep', 'pdd', 'out', 'pre', 'acc'] as AdjKey[]).slice(0, rng.int(3, 4));
    const adjs = makeAdjs(rng, keys, c0);
    if (!adjs) return null;
    const eff = sum(adjs.map((x) => x.effect));
    const net = p0 + eff;
    if (net < 10000) return null;
    const minus = sum(adjs.filter((x) => x.effect < 0).map((x) => x.effect));
    const ioc = adjs.find((x) => x.key === 'ioc');
    const n = numeric(net, [
      [p0, 'Stopped at the profit found from the capitals and made none of the adjustments.'],
      [p0 - eff, 'Turned every adjustment round.'],
      [p0 + minus, 'Made only the deductions and left out what is to be added.'],
      [ioc ? net - ioc.effect : 0, 'Left out the interest on capital.'],
      [A ? net + 2 * A : 0, 'Added the additional capital instead of deducting it.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} Find the net profit for the ${p.year}. The statement of affairs on ${p.end} was drawn up before the adjustments given were made.\n${[openLine(p, c0), closeLine(p, c1), d.line, ...(a ? [a.line] : []), ...adjs.map((x) => x.line)].join('\n')}`,
        ...n,
        explanation: [
          `Profit before adjustments = ${inr(c1)} + ${inr(d.total)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${inr(p0)}.`,
          ...adjs.map((x) => x.how),
          `Net profit = ${inr(p0)} ${adjs.map((x) => `${x.effect < 0 ? '-' : '+'} ${inr(Math.abs(x.effect))}`).join(' ')} = ${inr(net)}.`,
        ],
        hints: H.adjust,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    return adj.count >= 3 && q.answer === rupees(f.closing + f.drawings - f.additional - f.opening + adj.effect);
  },
});

// ir-missing-figure: one figure of a statement of affairs is not known; the profit of the year is.
const missingFigure = numericTemplate({
  id: 'ir-missing-figure', topicId: T, conceptId: 'ir-capital', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const atEnd = rng.next() < 0.6;
    const items = drawItems(rng, rng.int(4, 5), rng.int(1, 3));
    const unknown = items.find((i) => i.label === (atEnd ? 'Stock' : 'Cash at bank')) ?? items.find((i) => i.side === 'asset' && i.label !== 'Prepaid insurance');
    if (!unknown) return null;
    const c = total(items, 'asset') - total(items, 'liability');
    if (c < 60000) return null;
    const profit = rng.step(30000, 200000, 1000);
    const d = cashDrawings(rng, 20000, 100000);
    const a = rng.next() < 0.5 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    // At the end: the closing capital follows from the opening capital; at the start: the opening capital from the closing one.
    const other = atEnd ? c - profit - A + d.total : c + profit + A - d.total;
    if (other < 50000) return null;
    const L = total(items, 'liability');
    const date = atEnd ? p.end : p.start;
    const known = items.filter((i) => i !== unknown);
    const x = unknown.value;
    const n = numeric(x, [
      [x - L, 'Left out the liabilities when working back from the capital to the assets.'],
      [atEnd ? x + 2 * d.total : x - 2 * d.total, atEnd ? 'Added the drawings to the capital instead of deducting them.' : 'Deducted the drawings when going back to the opening capital instead of adding them.'],
      [A ? (atEnd ? x - 2 * A : x + 2 * A) : 0, atEnd ? 'Deducted the additional capital instead of adding it.' : 'Added the additional capital when going back to the opening capital instead of deducting it.'],
      [atEnd ? x - 2 * profit : x + 2 * profit, atEnd ? 'Deducted the profit instead of adding it.' : 'Added the profit when going back to the opening capital instead of deducting it.'],
    ]);
    const capLine = atEnd ? openLine(p, other) : closeLine(p, other);
    return (
      n && {
        prompt: `${intro(rng, t)} The figure of ${lower(unknown.label)} on ${date} was not recorded. The profit for the ${p.year} is known to be ${inr(profit)}. Find the figure of ${lower(unknown.label)} on ${date}.\n${[capLine, d.line, ...(a ? [a.line] : []), `Other assets and liabilities on ${date}:`, ...known.map(itemLine)].join('\n')}`,
        ...n,
        explanation: [
          `Drawings = ${d.how}.`,
          atEnd
            ? `Capital on ${p.end} = ${inr(other)}${A ? ` + ${inr(A)}` : ''} + ${inr(profit)} - ${inr(d.total)} = ${inr(c)}.`
            : `Capital on ${p.start} = ${inr(other)} + ${inr(d.total)}${A ? ` - ${inr(A)}` : ''} - ${inr(profit)} = ${inr(c)}.`,
          `Total assets = Capital + Liabilities = ${inr(c)} + ${inr(L)} = ${inr(c + L)}.`,
          `${unknown.label} = ${inr(c + L)} - other assets ${inr(total(known, 'asset'))} = ${inr(x)}.`,
        ],
        hints: H.unknown,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    const profit = amountsIn(q.prompt.split('\n')[0])[0];
    const known = itemsIn(q.prompt);
    const c = f.opening !== undefined ? f.opening + f.additional + profit - f.drawings : f.closing! + f.drawings - f.additional - profit;
    // The statement balances once the missing asset is put in.
    return Number.isFinite(c) && total(known, 'asset') + q.answer / 100 - total(known, 'liability') === c;
  },
});

// ir-salary-interest: a monthly salary taken as drawings, interest on capital, capital brought in.
const salaryInterest = numericTemplate({
  id: 'ir-salary-interest', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(200000, 800000, 10000);
    const p0 = rng.step(100000, 400000, 1000);
    const s = rng.step(3000, 15000, 500);
    const other = rng.next() < 0.5 ? rng.step(5000, 40000, 1000) : 0;
    const g = rng.next() < 0.5 ? goodsDrawn(rng) : null;
    const a = rng.next() < 0.6 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const D = 12 * s + other + (g?.cost ?? 0);
    const c1 = c0 + p0 + A - D;
    if (c1 < 50000) return null;
    const ioc = makeAdj(rng, 'ioc', c0)!;
    const net = p0 + ioc.effect;
    const I = -ioc.effect;
    const n = numeric(net, [
      [net - 12 * s, "Left the proprietor's salary out of the drawings (or charged it again as an expense); it is drawings."],
      [net - 11 * s, "Counted one month's salary instead of twelve."],
      [net + I, 'Left out the interest on capital.'],
      [net + 2 * I, 'Added the interest on capital instead of deducting it.'],
      [A ? net + 2 * A : 0, 'Added the additional capital instead of deducting it.'],
      [g ? net - g.cost + g.price : 0, 'Took the goods drawn at their sale price.'],
    ]);
    const lines = [openLine(p, c0), closeLine(p, c1), `${SALARY_MONTHLY}: ${inr(s)}`, ...(other ? [`${DRAW_LUMP}: ${inr(other)}`] : []), ...(g ? [g.line] : []), ...(a ? [a.line] : []), ioc.line];
    return (
      n && {
        prompt: `${intro(rng, t)} The business does not charge the proprietor's salary against its profit. Find the net profit for the ${p.year}.\n${lines.join('\n')}`,
        ...n,
        explanation: [
          `Drawings = salary ${inr(s)} x 12 = ${inr(12 * s)}${other ? ` + cash ${inr(other)}` : ''}${g ? ` + goods at cost ${inr(g.cost)}` : ''} = ${inr(D)}.`,
          `Profit before adjustments = ${inr(c1)} + ${inr(D)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${inr(p0)}.`,
          ioc.how,
          `Net profit = ${inr(p0)} - ${inr(I)} = ${inr(net)}.`,
        ],
        hints: [H.drawings[0], H.adjust[1]],
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined || f.monthly === 0) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    return adj.count === 1 && q.answer === rupees(f.closing + f.drawings - f.additional - f.opening + adj.effect);
  },
});

// ir-loss-adjusted: a loss once the adjustments are made, sometimes after a small profit before them.
const lossAdjusted = numericTemplate({
  id: 'ir-loss-adjusted', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(200000, 800000, 10000);
    const p0 = rng.next() < 0.5 ? rng.step(5000, 40000, 1000) : -rng.step(10000, 80000, 1000);
    const d = cashDrawings(rng, 20000, 90000);
    const a = capitalIn(rng, 20000, 150000);
    const c1 = c0 + p0 + a.amount - d.total;
    if (c1 < 50000) return null;
    const keys = rng.shuffle(['ioc', 'dep', 'pdd', 'out', 'pre'] as AdjKey[]).slice(0, rng.int(2, 3));
    const adjs = makeAdjs(rng, keys, c0);
    if (!adjs) return null;
    const eff = sum(adjs.map((x) => x.effect));
    const loss = -(p0 + eff);
    if (loss < 5000) return null;
    const n = numeric(loss, [
      [p0 < 0 ? -p0 : 0, 'Stopped at the loss found from the capitals and made none of the adjustments.'],
      [-(p0 + eff + 2 * a.amount), 'Added the additional capital instead of deducting it.'],
      [-(p0 - eff), 'Turned every adjustment round.'],
      [-(p0 + eff - d.total), 'Left out the drawings.'],
      [-(p0 - 2 * d.total + eff), 'Deducted the drawings instead of adding them back.'],
    ]);
    return (
      n && {
        prompt: `${intro(rng, t)} The statement of affairs on ${p.end} was drawn up before the adjustments below were made; after them the business shows a loss for the ${p.year}. Find the net loss.\n${[openLine(p, c0), closeLine(p, c1), d.line, a.line, ...adjs.map((x) => x.line)].join('\n')}`,
        ...n,
        explanation: [
          `Drawings = ${d.how}.`,
          `Before adjustments: ${inr(c1)} + ${inr(d.total)} - ${inr(a.amount)} - ${inr(c0)} = ${p0 >= 0 ? `a profit of ${inr(p0)}` : `a loss of ${inr(-p0)}`}.`,
          ...adjs.map((x) => x.how),
          `Result = ${p0 >= 0 ? inr(p0) : `-${inr(-p0)}`} ${adjs.map((x) => `${x.effect < 0 ? '-' : '+'} ${inr(Math.abs(x.effect))}`).join(' ')} = -${inr(loss)}: a net loss of ${inr(loss)}.`,
        ],
        hints: H.adjust,
      }
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    return adj.count >= 2 && q.answer === rupees(-(f.closing + f.drawings - f.additional - f.opening + adj.effect));
  },
});

// ir-net-result-choice: the result after two adjustments, chosen among the results of the usual slips.
const netResultChoice = mcqTemplate({
  id: 'ir-net-result-choice', version: 2, topicId: T, conceptId: 'ir-adjustments', difficulty: 'complex',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(200000, 800000, 10000);
    const p0 = rng.next() < 0.7 ? rng.step(30000, 200000, 1000) : -rng.step(10000, 60000, 1000);
    const d = cashDrawings(rng, 20000, 100000);
    const a = rng.next() < 0.6 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const c1 = c0 + p0 + A - d.total;
    if (c1 < 50000) return null;
    const keys = rng.shuffle(['ioc', 'dep', 'pdd', 'out', 'pre'] as AdjKey[]).slice(0, 2);
    const adjs = makeAdjs(rng, keys, c0);
    if (!adjs) return null;
    const eff = sum(adjs.map((x) => x.effect));
    const net = p0 + eff;
    if (net === 0) return null;
    return choice(
      `${intro(rng, t)} The statement of affairs on ${p.end} was drawn up before the adjustments given were made. What is the result of the ${p.year}?\n${[openLine(p, c0), closeLine(p, c1), d.line, ...(a ? [a.line] : []), ...adjs.map((x) => x.line)].join('\n')}`,
      resultText(net),
      [
        [resultText(p0), 'Stopped at the result found from the capitals and made none of the adjustments.'],
        [resultText(p0 - eff), 'Turned both adjustments round.'],
        [resultText(net - 2 * d.total), 'Deducted the drawings instead of adding them back.'],
        ...(A ? [[resultText(net + 2 * A), 'Added the additional capital instead of deducting it.'] as [string, string]] : []),
        [resultText(net - d.total), 'Left out the drawings.'],
      ],
      `Before adjustments: ${inr(c1)} + ${inr(d.total)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${p0 >= 0 ? inr(p0) : `-${inr(-p0)}`}. ${adjs.map((x) => x.how).join(' ')} Result: ${lower(resultText(net))}.`,
      H.adjust,
    );
  },
  verify: (q) => {
    const f = factsOf(q.prompt);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.prompt, f.opening);
    return adj.count === 2 && optionText(q) === resultText(f.closing + f.drawings - f.additional - f.opening + adj.effect);
  },
});

// ir-capital-in-kind: capital brought in as cash, as an asset and as a business bill paid privately, with a loan
// from a friend and a sale of business furniture that are not capital.
interface KindScene {
  opening: number;
  capital: number[];
  decoys: number[];
  drawings: number;
}
const keptKind = keepFor<KindScene>();
const capitalInKind = numericTemplate({
  id: 'ir-capital-in-kind', topicId: T, conceptId: 'ir-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const items = drawItems(rng, rng.int(4, 5), rng.int(1, 2));
    const cash = rng.step(20000, 150000, 5000);
    const laptop = rng.next() < 0.6 ? rng.step(20000, 70000, 1000) : 0;
    const bill = rng.next() < 0.6 ? rng.step(3000, 20000, 500) : 0;
    const loan = rng.step(20000, 100000, 5000);
    const sold = rng.next() < 0.5 ? rng.step(5000, 30000, 1000) : 0;
    const d = cashDrawings(rng, 20000, 100000);
    const A = cash + laptop + bill;
    // The friend's loan is still owed at the year end, so it stands among the liabilities of the closing statement.
    const closing = [...items, ...(laptop ? [{ label: LAPTOP, side: 'asset' as Side, value: laptop }] : []), { label: `Loan from ${rng.pick(['Vikram Verma', 'Neha Kapoor', 'Rohan Bhat', 'Asha Pillai'])}, a friend of the proprietor`, side: 'liability' as Side, value: loan }];
    const c1 = total(items, 'asset') + laptop - total(items, 'liability') - loan;
    const profit = rng.step(20000, 200000, 1000);
    const c0 = c1 + d.total - A - profit;
    if (c1 < 60000 || c0 < 60000) return null;
    const facts = rng.shuffle([
      `The proprietor sold a private plot and brought ${inr(cash)} into the business.`,
      ...(laptop ? [`The proprietor brought a personal laptop worth ${inr(laptop)} into the business for its own use.`] : []),
      ...(bill ? [`A repair bill of the shop, ${inr(bill)}, was paid by the proprietor out of private savings.`] : []),
      `A friend of the proprietor lent the business ${inr(loan)}, which is still owed.`,
      ...(sold ? [`Old furniture of the business was sold for ${inr(sold)}.`] : []),
    ]);
    const prompt = `${intro(rng, t)} Find the profit for the ${p.year}.\n${[openLine(p, c0), d.line, ...facts, `Assets and liabilities on ${p.end}:`, ...closing.map(itemLine)].join('\n')}`;
    keptKind.keep(prompt, { opening: c0, capital: [cash, laptop, bill].filter((x) => x > 0), decoys: [loan, sold].filter((x) => x > 0), drawings: d.total });
    const n = numeric(profit, [
      [profit - loan, 'Counted the loan from the friend as capital brought in; it is a liability.'],
      [profit + loan, 'Left the loan out of the closing liabilities.'],
      [laptop ? profit + laptop : 0, 'Left out the laptop brought in; capital brought in as an asset is still capital.'],
      [bill ? profit + bill : 0, 'Left out the shop bill paid from private savings; it is capital brought in.'],
      [sold ? profit - sold : 0, 'Counted the sale of business furniture as capital brought in.'],
      [profit - d.total, 'Left out the drawings.'],
    ]);
    return (
      n && {
        prompt,
        ...n,
        explanation: [
          `Capital on ${p.end} = assets ${inr(total(items, 'asset') + laptop)}${laptop ? ' (the laptop included)' : ''} - liabilities ${inr(total(items, 'liability') + loan)} (the friend's loan included) = ${inr(c1)}.`,
          `Additional capital = ${plus([cash, laptop, bill].filter((x) => x > 0))}. ${sold ? 'The loan is a liability and the sale of furniture only turns a business asset into cash: neither is capital.' : 'The loan is a liability, not capital.'}`,
          `Drawings = ${d.how}.`,
          `Profit = ${inr(c1)} + ${inr(d.total)} - ${inr(A)} - ${inr(c0)} = ${inr(profit)}.`,
        ],
        hints: H.profit,
      }
    );
  },
  verify: (q) => {
    const s = keptKind.of(q.prompt);
    if (!s) return false;
    const closing = itemsIn(q.prompt);
    const loanLine = q.prompt.split('\n').find((l) => l.startsWith('Loan from '));
    const loan = loanLine ? amountsIn(loanLine)[0] : NaN;
    const c1 = total(closing, 'asset') - total(closing, 'liability') - loan;
    return amountsIn(q.prompt).includes(s.opening) && q.answer === rupees(c1 + s.drawings - sum(s.capital) - s.opening);
  },
});

// ===============================================================================================================
// FORMATS: the statement of affairs, and the statement of profit or loss
// ===============================================================================================================

const CAPITAL_ROW = 'Capital (balancing figure)';
const TOTAL = 'Total';

function affairsRows(items: readonly { label: string; side: Side; amounts: number[] }[], capitals: number[]): (FormatRowParts | StatementLineParts)[] {
  const liabilities = items.filter((i) => i.side === 'liability');
  const assets = items.filter((i) => i.side === 'asset');
  const ofSide = (list: typeof items) => list.map((i) => ({ label: i.label, amounts: i.amounts.map(rupees) }));
  const totals = capitals.map((c, k) => rupees(c + sum(liabilities.map((i) => i.amounts[k]))));
  return [
    { heading: 'Liabilities' },
    ...ofSide(liabilities),
    { label: CAPITAL_ROW, also: ['Capital'], amounts: capitals.map(rupees) },
    { subtotal: TOTAL, amounts: totals, sum: 'all' },
    { heading: 'Assets' },
    ...ofSide(assets),
    { subtotal: TOTAL, amounts: totals, sum: 'block' },
  ];
}

/** The two totals of a statement of affairs agree, and the capital is the assets less the liabilities, column by column. */
function affairsHold(q: StatementQuestion, expected: number[]): boolean {
  const capRow = q.rows.find((r) => r.label === CAPITAL_ROW);
  const totals = (q.lines ?? []).flatMap((l) => ('subtotal' in l ? [l.amounts] : []));
  return (
    capRow !== undefined &&
    totals.length === 2 &&
    expected.every((c, k) => capRow.amounts[k] === rupees(c) && totals[0][k] === totals[1][k])
  );
}

// ir-fmt-affairs-one: the statement of affairs on one date, with a private item in the data.
const fmtAffairsOne = statementTemplate({
  id: 'ir-fmt-affairs-one', topicId: T, conceptId: 'ir-formats', difficulty: 'easy',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const date = rng.pick([p.start, p.end]);
    const items = drawItems(rng, rng.int(4, 5), rng.int(1, 3));
    const priv = rng.pick(PRIVATE_KINDS);
    const privItem: Item = { label: priv.label, side: 'private', value: valueOf(rng, priv) };
    const c = total(items, 'asset') - total(items, 'liability');
    if (c < 50000) return null;
    const otherPriv = PRIVATE_KINDS.filter((k) => k.label !== priv.label).map((k) => k.label);
    return {
      task: `Prepare the Statement of Affairs of ${t.shop} as on ${date}, showing the capital as the balancing figure.`,
      data: [`${t.owner} keeps incomplete records of ${t.shop}. These figures were collected on ${date}:`, ...rng.shuffle([...items, privItem]).map(itemLine)].join('\n'),
      title: `Statement of Affairs of ${t.shop} as on ${date}`,
      rows: affairsRows(items.map((i) => ({ label: i.label, side: i.side, amounts: [i.value] })), [c]),
      distractors: [priv.label, 'Drawings', 'Profit for the year', otherPriv[0]],
      explanation: [
        `${priv.label} belongs to the proprietor privately, so it stays out of the statement of the business.`,
        `Liabilities: ${plus(items.filter((i) => i.side === 'liability').map((i) => i.value))}.`,
        `Assets: ${plus(items.filter((i) => i.side === 'asset').map((i) => i.value))}.`,
        `Capital = ${inr(total(items, 'asset'))} - ${inr(total(items, 'liability'))} = ${inr(c)}, entered on the liabilities side so that the two totals agree at ${inr(total(items, 'asset'))}.`,
      ],
      hints: H.capital,
    };
  },
  verify: (q) => {
    const items = itemsIn(q.data);
    return items.some((i) => i.side === 'private') && affairsHold(q, [total(items, 'asset') - total(items, 'liability')]);
  },
});

// ir-fmt-affairs-two: the statements of affairs at the start and the end of the year, in two columns.
const fmtAffairsTwo = statementTemplate({
  id: 'ir-fmt-affairs-two', topicId: T, conceptId: 'ir-formats', difficulty: 'medium',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const items = twoDates(rng, rng.int(4, 5), rng.int(2, 3));
    if (!items) return null;
    const c0 = capOf(items, 'v0');
    const c1 = capOf(items, 'v1');
    const priv = rng.next() < 0.5 ? rng.pick(PRIVATE_KINDS) : null;
    const privValue = priv ? valueOf(rng, priv) : 0;
    const lines = items.map((i) => twoDateLine(i.label, i.v0, i.v1, p));
    if (priv) lines.splice(rng.int(0, lines.length), 0, twoDateLine(priv.label, privValue, privValue, p));
    return {
      task: `Prepare the Statements of Affairs of ${t.shop} as on ${p.start} and as on ${p.end} in two columns, finding the capital on each date. Leave a column blank (or 0) where an item is nil.`,
      data: [`${t.owner} keeps incomplete records of ${t.shop}. The figures on the two dates were:`, ...lines].join('\n'),
      title: `Statements of Affairs of ${t.shop}`,
      columns: [`${p.start} (₹)`, `${p.end} (₹)`],
      rows: affairsRows(items.map((i) => ({ label: i.label, side: i.side, amounts: [i.v0, i.v1] })), [c0, c1]),
      distractors: [...(priv ? [priv.label] : []), 'Drawings', 'Profit for the year', 'Additional capital'],
      explanation: [
        ...(priv ? [`${priv.label} is a private item of the proprietor and stays out.`] : []),
        `On ${p.start}: assets ${inr(c0 + sum(items.filter((i) => i.side === 'liability').map((i) => i.v0)))} - liabilities ${inr(sum(items.filter((i) => i.side === 'liability').map((i) => i.v0)))} = capital ${inr(c0)}.`,
        `On ${p.end}: assets ${inr(c1 + sum(items.filter((i) => i.side === 'liability').map((i) => i.v1)))} - liabilities ${inr(sum(items.filter((i) => i.side === 'liability').map((i) => i.v1)))} = capital ${inr(c1)}.`,
        'An item that is nil on a date is left blank in that column. In each column the capital, as the balancing figure, makes the two totals agree.',
      ],
      hints: [H.capital[0], 'Work each column on its own: the capital on each date is that date\'s assets less that date\'s liabilities.'],
    };
  },
  verify: (q) => {
    const items = twoDateItems(q.data).filter((i) => i.side !== 'private');
    return items.length >= 6 && affairsHold(q, [capOf(items, 'v0'), capOf(items, 'v1')]);
  },
});

const PL_CLOSE = 'Capital at the end of the year';
const PL_DRAW = 'Add: Drawings during the year';
const PL_ADD = 'Less: Additional capital introduced';
const PL_ADJUSTED = 'Adjusted capital at the end of the year';
const PL_OPEN = 'Less: Capital at the beginning of the year';
const PL_RESULT = 'Profit or loss for the year';
const PL_BEFORE = 'Profit or loss before adjustments';
const PL_NET = 'Net profit or loss for the year';
const PL_DISTRACTORS = ['Add: Additional capital introduced', 'Less: Drawings during the year', 'Add: Capital at the beginning of the year', 'Interest on capital'];
const SIGNED = [{ name: 'Amount (₹)', signed: true }];

/** The last sub-total of a statement, and the one called `name`. */
const subtotalOf = (q: StatementQuestion, name: string): number | undefined => (q.lines ?? []).flatMap((l) => ('subtotal' in l && l.subtotal === name ? [l.amounts[0]] : [])).at(-1);

/** The first rows of a Statement of Profit or Loss, from the closing capital to the result of the comparison. */
function comparisonRows(c1: number, d: { total: number; details: string[] }, A: number, c0: number, result: string): (FormatRowParts | StatementLineParts)[] {
  return [
    { label: PL_CLOSE, amount: rupees(c1) },
    { label: PL_DRAW, amount: rupees(d.total), details: d.details },
    ...(A ? [{ label: PL_ADD, amount: -rupees(A) }] : []),
    { subtotal: PL_ADJUSTED, amount: rupees(c1 + d.total - A), sum: 'all' },
    { label: PL_OPEN, amount: -rupees(c0) },
    { subtotal: result, amount: rupees(c1 + d.total - A - c0), sum: 'all' },
  ];
}

// ir-fmt-profit: the Statement of Profit or Loss, the closing capital worked out from a list.
const fmtProfit = statementTemplate({
  id: 'ir-fmt-profit', topicId: T, conceptId: 'ir-formats', difficulty: 'medium',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const items = drawItems(rng, rng.int(3, 5), rng.int(1, 2));
    const c1 = total(items, 'asset') - total(items, 'liability');
    if (c1 < 60000) return null;
    const d = cashDrawings(rng, 20000, 120000);
    const g = rng.next() < 0.5 ? goodsDrawn(rng) : null;
    const a = rng.next() < 0.6 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const D = d.total + (g?.cost ?? 0);
    const r = rng.next() < 0.3 ? -rng.step(10000, 60000, 1000) : rng.step(30000, 200000, 1000);
    const c0 = c1 + D - A - r;
    if (c0 < 60000) return null;
    const openingAsTotals = rng.next() < 0.5;
    const L0 = rng.step(20000, 150000, 1000);
    const openingLines = openingAsTotals ? [`Total assets on ${p.start}: ${inr(c0 + L0)}`, `Total liabilities on ${p.start}: ${inr(L0)}`] : [openLine(p, c0)];
    return {
      task: `Prepare the Statement of Profit or Loss of ${t.shop} for the ${p.year}. Show the drawings as one figure, and show a deduction, and a loss, with a minus sign.`,
      data: [`${t.owner} keeps incomplete records of ${t.shop}.`, ...openingLines, d.line, ...(g ? [g.line] : []), ...(a ? [a.line] : []), `Assets and liabilities on ${p.end}:`, ...rng.shuffle(items).map(itemLine)].join('\n'),
      title: `Statement of Profit or Loss of ${t.shop} for the ${p.year}`,
      columns: SIGNED,
      rows: comparisonRows(c1, { total: D, details: [`Cash ${d.how}`, ...(g ? [`Goods at cost ${inr(g.cost)}`] : [])] }, A, c0, PL_RESULT),
      distractors: PL_DISTRACTORS,
      explanation: [
        `Capital at the end = assets ${inr(total(items, 'asset'))} - liabilities ${inr(total(items, 'liability'))} = ${inr(c1)}.`,
        ...(openingAsTotals ? [`Capital at the beginning = ${inr(c0 + L0)} - ${inr(L0)} = ${inr(c0)}.`] : []),
        `Drawings = ${d.how}${g ? ` + goods at cost ${inr(g.cost)} = ${inr(D)}` : ''}, added back.`,
        ...(A ? [`Additional capital ${inr(A)} is deducted.`] : []),
        `Adjusted closing capital = ${inr(c1 + D - A)}; less opening capital ${inr(c0)} = ${r >= 0 ? `a profit of ${inr(r)}` : `a loss of ${inr(-r)}, shown with a minus sign`}.`,
      ],
      hints: H.profit,
    };
  },
  verify: (q) => {
    const f = factsOf(q.data);
    const items = itemsIn(q.data);
    const c1 = total(items, 'asset') - total(items, 'liability');
    const totals = /Total assets on [^:]+: ₹([\d,]+)\nTotal liabilities on [^:]+: ₹([\d,]+)/.exec(q.data);
    const c0 = totals ? num(totals[1]) - num(totals[2]) : f.opening;
    return c0 !== undefined && subtotalOf(q, PL_RESULT) === rupees(c1 + f.drawings - f.additional - c0);
  },
});

// ir-fmt-profit-adjusted: the Statement of Profit or Loss with the adjustments the closing statement left out.
const fmtProfitAdjusted = statementTemplate({
  id: 'ir-fmt-profit-adjusted', version: 2, topicId: T, conceptId: 'ir-formats', difficulty: 'complex',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 800000, 10000);
    const p0 = rng.next() < 0.85 ? rng.step(60000, 300000, 1000) : rng.step(5000, 30000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const g = rng.next() < 0.5 ? goodsDrawn(rng) : null;
    const a = rng.next() < 0.6 ? capitalIn(rng) : null;
    const A = a?.amount ?? 0;
    const D = d.total + (g?.cost ?? 0);
    const c1 = c0 + p0 + A - D;
    if (c1 < 60000) return null;
    const keys = rng.shuffle(['ioc', 'dep', 'pdd', 'out', 'pre', 'acc'] as AdjKey[]).slice(0, rng.int(3, 4));
    if (!keys.includes('ioc') && rng.next() < 0.5) keys[0] = 'ioc';
    const made = makeAdjs(rng, keys, c0);
    if (!made) return null;
    const adjs = inStatementOrder(made);
    const net = p0 + sum(adjs.map((x) => x.effect));
    if (net === 0) return null;
    return {
      task: `Prepare the Statement of Profit or Loss of ${t.shop} for the ${p.year}, with the adjustments given. Show the drawings as one figure, and show a deduction, and a loss, with a minus sign.`,
      data: [
        `${t.owner} keeps incomplete records of ${t.shop}. The capitals were found from statements of affairs.`,
        openLine(p, c0),
        closeLine(p, c1),
        d.line,
        ...(g ? [g.line] : []),
        ...(a ? [a.line] : []),
        'Adjustments, made after the statement of affairs on the closing date was drawn up:',
        ...made.map((x) => x.line),
      ].join('\n'),
      title: `Statement of Profit or Loss of ${t.shop} for the ${p.year}`,
      columns: SIGNED,
      rows: [
        ...comparisonRows(c1, { total: D, details: [`Cash ${d.how}`, ...(g ? [`Goods at cost ${inr(g.cost)}`] : [])] }, A, c0, PL_BEFORE),
        ...adjs.map((x) => ({ label: x.label, amount: rupees(x.effect) })),
        { subtotal: PL_NET, amount: rupees(net), sum: 'all' as const },
      ],
      distractors: [...PL_DISTRACTORS.slice(0, 2), 'Add: Interest on capital', 'Less: Goods taken by the proprietor', 'Less: Prepaid insurance'].filter((l) => !adjs.some((x) => x.label === l)),
      explanation: [
        `Drawings = ${d.how}${g ? ` + goods at cost ${inr(g.cost)} = ${inr(D)}` : ''}.`,
        `Before adjustments: ${inr(c1)} + ${inr(D)}${A ? ` - ${inr(A)}` : ''} - ${inr(c0)} = ${p0 >= 0 ? inr(p0) : `-${inr(-p0)}`}.`,
        ...adjs.map((x) => x.how),
        `Net result = ${inr(p0)} ${adjs.map((x) => `${x.effect < 0 ? '-' : '+'} ${inr(Math.abs(x.effect))}`).join(' ')} = ${net >= 0 ? `a net profit of ${inr(net)}` : `a net loss of ${inr(-net)}`}.`,
      ],
      hints: H.adjust,
    };
  },
  verify: (q) => {
    const f = factsOf(q.data);
    if (f.opening === undefined || f.closing === undefined) return false;
    const adj = adjustmentsIn(q.data, f.opening);
    return adj.count >= 3 && subtotalOf(q, PL_NET) === rupees(f.closing + f.drawings - f.additional - f.opening + adj.effect);
  },
});

const templates: Template[] = [
  // easy
  capitalList, profitDrawings, profitAdditional, closingCapital, drawingsTotal, totalSide, formula, classifyItem, feature, reasonLimitation, saVsBs, capitalOrDrawings, profitOrLoss,
  // medium
  profitBoth, lossYear, openingCapital, drawingsUnknown, additionalUnknown, capitalExclusions, profitGoods, interestCapital, depreciationProvision, outstandingPrepaid, adjustDirection, slipEffect,
  // complex
  profitTwoLists, adjustedProfit, missingFigure, salaryInterest, lossAdjusted, netResultChoice, capitalInKind,
];
const formats: Template[] = [fmtAffairsOne, fmtAffairsTwo, fmtProfit, fmtProfitAdjusted];

const all: Template[] = [...templates, ...formats];

/** What the case studies of the topic reuse (cases/incomplete-records-cases.ts). Nothing here changes a question above. */
export const IR_CASE = {
  TRADERS, ASSET_KINDS, LIABILITY_KINDS, PRIVATE_KINDS, PRIVATE_BILLS, ADD_LABELS, DRAW_MONTHLY, SALARY_MONTHLY, H, SIGNED,
  PL_CLOSE, PL_DRAW, PL_ADD, PL_ADJUSTED, PL_OPEN, PL_RESULT, PL_BEFORE, PL_NET, PL_DISTRACTORS, CAPITAL_ROW,
  inr, sum, num, amountsIn, optionText, lower, numeric, choice, reversedWhy, resultText, intro, period, valueOf, drawItems, total, itemLine, plus, itemsIn,
  openLine, closeLine, cashDrawings, goodsDrawn, capitalIn, factsOf, makeAdj, makeAdjs, inStatementOrder, adjustmentsIn,
  twoDateLine, twoDateItems, twoDates, capOf, affairsRows, affairsHold, comparisonRows, subtotalOf,
};
export type { Adj as IrAdj, AdjKey as IrAdjKey, Drawn as IrDrawn, Goods as IrGoods, Item as IrItem, Period as IrPeriod, Trader as IrTrader };

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'ir', topicId: 'incomplete-records', conceptId: 'ir-statement',
  items: [
    {
      answer: 'explains',
      a: 'A trial balance cannot be drawn up from incomplete records.',
      r: 'Not every transaction is recorded on both sides.',
      aWhy: 'The debit and credit balances would not agree.',
      rWhy: 'Some transactions are recorded on both sides, some on one side only and some not at all.',
      link: 'A trial balance depends on equal debits and credits, which these records do not have, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Capital is the balancing figure of a statement of affairs.',
      r: 'With no complete capital account to take it from, capital is found from the assets and the liabilities.',
      aWhy: 'It is the amount that makes the two sides agree.',
      rWhy: 'Capital = Total business assets - Total business liabilities.',
      link: 'The capital has to be worked out from the other figures, so it stands as the balancing figure. R explains A.',
    },
    {
      answer: 'explains',
      a: 'A business with assets of ₹6,00,000, and liabilities of ₹2,00,000 that include an overdraft, has a capital of ₹4,00,000.',
      r: 'Capital is the total of the business assets less the total of the business liabilities.',
      aWhy: '₹6,00,000 - ₹2,00,000 = ₹4,00,000.',
      rWhy: 'This is the accounting equation turned round.',
      link: 'The figure is that rule applied, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A bank loan of ₹50,000 taken during the year is not treated as additional capital.',
      r: 'A loan to the business is a liability.',
      aWhy: 'Additional capital is what the proprietor brings in from private sources.',
      rWhy: 'The business has to repay it to the lender.',
      link: 'The loan is owed to an outsider, so it is not the owner\'s capital, and R explains A.',
    },
    {
      answer: 'explains',
      a: 'With a capital of ₹3,00,000 at the start and ₹2,80,000 at the end, drawings of ₹50,000 and no capital brought in, the profit is ₹30,000.',
      r: 'Drawings lower the closing capital without being a loss, so they are added back.',
      aWhy: '₹2,80,000 + ₹50,000 - ₹3,00,000 = ₹30,000.',
      rWhy: 'The owner has taken the money out; the business has not lost it.',
      link: 'Capital fell only because of the drawings, and adding them back shows the profit, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'Many small traders keep incomplete records.',
      r: 'The profit can only be estimated from incomplete records.',
      aWhy: 'Such records are simple and cheap, and need no trained accountant.',
      rWhy: 'Expenses and incomes are not fully recorded.',
      link: 'R is a limitation of these records, which is no reason for keeping them. Traders keep them because they are simple and cheap.',
    },
    {
      answer: 'not-the-reason',
      a: 'Goods costing ₹3,000 taken by the proprietor are treated as drawings.',
      r: 'Private bills paid by the business are treated as drawings.',
      aWhy: 'The goods are taken out of the business for private use, at cost.',
      rWhy: 'They are the proprietor\'s own expenses.',
      link: 'R is another kind of drawings. It does not say why goods are drawings.',
    },
    {
      answer: 'not-the-reason',
      a: 'An outstanding expense of ₹4,000 stands among the liabilities in a statement of affairs.',
      r: 'A prepaid expense stands among the assets in a statement of affairs.',
      aWhy: 'The business owes the amount.',
      rWhy: 'The business has paid in advance for a benefit still to come.',
      link: 'Each is placed by what it is. Where a prepaid expense stands does not explain where an outstanding one stands.',
    },
    {
      answer: 'a-only',
      a: 'Errors and frauds are hard to find in incomplete records.',
      r: 'Incomplete records show every transaction on both sides.',
      aWhy: 'With no complete records and no trial balance, little can be checked.',
      rWhy: 'That is what they do not do; only double entry books do.',
    },
    {
      answer: 'a-only',
      a: 'Interest on capital of ₹6,000 is deducted from the profit found.',
      r: 'Interest on capital is worked on the closing capital.',
      aWhy: 'It is an adjustment made after the profit has been found by the statements of affairs.',
      rWhy: 'It is worked on the capital at the beginning of the year.',
    },
    {
      answer: 'r-only',
      a: 'A statement of affairs and a balance sheet are one document under two names.',
      r: 'A balance sheet comes from the ledger balances of complete books, and a statement of affairs from incomplete records and estimates.',
      aWhy: 'They differ in where their figures come from and in how reliable they are.',
      rWhy: 'That is the main difference between the two.',
    },
    {
      answer: 'r-only',
      a: 'Depreciation of ₹5,000 left out of the closing statement is added to the profit found.',
      r: 'Leaving out depreciation overstates an asset, and so the closing capital.',
      aWhy: 'It is deducted from the profit found.',
      rWhy: 'The asset is shown too high, so the capital worked from it is too high.',
    },
  ],
});

// ===============================================================================================================
// Added in the quality pass, after the papers, worksheets and Look back levels were set (they are in
// `outsidePapers.ts`): interest on capital brought in during the year, and a statement of affairs with the
// adjustments made inside it, as the NCERT illustrations make them.
// ===============================================================================================================

/** A date on which more capital came in, and the months from it to 31 March (the end of the year). */
const BROUGHT_IN = [
  { day: '1 July', months: 9 },
  { day: '1 August', months: 8 },
  { day: '1 October', months: 6 },
  { day: '1 December', months: 4 },
  { day: '1 January', months: 3 },
] as const;
const BROUGHT_IN_LINE = 'The additional capital was brought in on';
const IOC_PART_LINE = (r: number): string =>
  `Interest on capital is to be allowed at ${r}% p.a.: on the capital at the beginning of the year for the whole year, and on the additional capital from the day it was brought in.`;
const H_PART_YEAR = [
  'Capital that came in during the year was in the business only from the day it came in. Count those months first.',
  'Interest = opening capital × rate for 12 months + additional capital × rate × months from the day it came in ÷ 12. Deduct it from the profit found by comparing the capitals.',
];
const YEAR_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];

// ir-interest-additional-capital: interest on capital when more capital came in on a stated date (part of a year).
const keptPartYear = keepFor<{ months: number; ask: 'interest' | 'net' }>();
const interestAdditionalCapital = numericTemplate({
  id: 'ir-interest-additional-capital', topicId: T, conceptId: 'ir-adjustments', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const c0 = rng.step(150000, 800000, 10000);
    const r = rng.pick([5, 6, 8, 10, 12]);
    const when = rng.pick(BROUGHT_IN);
    const a = capitalIn(rng, 30000, 200000, 10000);
    const A = a.amount;
    const onOpening = (c0 * r) / 100;
    const onAdded = (A * r * when.months) / 1200;
    if (!Number.isInteger(onOpening) || !Number.isInteger(onAdded)) return null;
    const I = onOpening + onAdded;
    const p0 = rng.step(60000, 300000, 1000);
    const d = cashDrawings(rng, 20000, 120000);
    const c1 = c0 + p0 + A - d.total;
    if (c1 < 60000 || p0 <= I) return null;
    const ask = rng.pick(['interest', 'net', 'net'] as const);
    // The year runs from 1 April to 31 March: a day from January to March falls in the second calendar year.
    const startYear = Number(p.start.slice(-4));
    const dayOf = `${when.day} ${when.months > 3 ? startYear : startYear + 1}`;
    const fullYear = onOpening + (A * r) / 100;
    const onClosing = (c1 * r) / 100;
    const before = (A * r * (12 - when.months)) / 1200;
    const n =
      ask === 'interest'
        ? numeric(I, [
            [fullYear, 'Allowed interest on the additional capital for the whole year; it was in the business only from the day it came in.'],
            [onOpening, 'Left out the interest on the additional capital.'],
            [Number.isInteger(onClosing) ? onClosing : 0, 'Worked the interest on the closing capital.'],
            [Number.isInteger(before) ? onOpening + before : 0, 'Counted the months before the capital came in instead of the months after.'],
          ])
        : numeric(p0 - I, [
            [p0 - fullYear, 'Allowed interest on the additional capital for the whole year; it was in the business only from the day it came in.'],
            [p0 - onOpening, 'Left out the interest on the additional capital.'],
            [p0 + I, 'Added the interest on capital; it is a charge against the profit found.'],
            [p0, 'Stopped at the profit found from the capitals.'],
          ]);
    if (!n) return null;
    const prompt = [
      `${intro(rng, t)} ${ask === 'interest' ? `How much interest on capital is allowed for the ${p.year}?` : `Find the net profit for the ${p.year} after the interest on capital.`}`,
      openLine(p, c0),
      closeLine(p, c1),
      d.line,
      a.line,
      `${BROUGHT_IN_LINE} ${dayOf}.`,
      IOC_PART_LINE(r),
    ].join('\n');
    keptPartYear.keep(prompt, { months: when.months, ask });
    return {
      prompt,
      ...n,
      explanation: [
        ...(ask === 'net' ? [`Profit found = ${inr(c1)} + ${inr(d.total)} - ${inr(A)} - ${inr(c0)} = ${inr(p0)}.`] : []),
        `On the opening capital, for 12 months: ${r}% of ${inr(c0)} = ${inr(onOpening)}.`,
        `On the additional capital, from ${dayOf} to 31 March, ${when.months} months: ${inr(A)} × ${r}% × ${when.months}/12 = ${inr(onAdded)}.`,
        `Interest on capital = ${inr(onOpening)} + ${inr(onAdded)} = ${inr(I)}.`,
        ...(ask === 'net' ? [`Net profit = ${inr(p0)} - ${inr(I)} = ${inr(p0 - I)}.`] : []),
      ],
      hints: H_PART_YEAR,
    };
  },
  verify: (q) => {
    const k = keptPartYear.of(q.prompt);
    const f = factsOf(q.prompt);
    const day = new RegExp(`${BROUGHT_IN_LINE} (\\d+ \\w+) \\d{4}\\.`).exec(q.prompt)?.[1];
    const rate = Number(/allowed at (\d+)% p\.a\.:/.exec(q.prompt)?.[1]);
    if (!k || f.opening === undefined || f.closing === undefined || !day || !rate) return false;
    // The months from the first of the month named to the end of March, counted along the year.
    const months = 12 - YEAR_MONTHS.indexOf(day.split(' ')[1]);
    const interest = (f.opening * rate) / 100 + (f.additional * rate * months) / 1200;
    const found = f.closing + f.drawings - f.additional - f.opening;
    return months === k.months && q.answer === rupees(k.ask === 'interest' ? interest : found - interest);
  },
});

// ir-fmt-affairs-adjusted: the statement of affairs on the closing date with the adjustments made inside it.
const ADJ_ASSETS = [
  { label: 'Furniture', min: 30000, max: 150000 },
  { label: 'Machinery', min: 100000, max: 400000 },
  { label: 'Delivery van', min: 150000, max: 450000 },
] as const;
const OTHER_ASSETS = ['Cash in hand', 'Cash at bank', 'Stock', 'Bills receivable'];
const OTHER_LIABILITIES = ['Creditors', 'Bills payable', 'Bank loan', 'Bank overdraft'];
const BAD_LINE = 'Further bad debts to be written off';
const PDD_LINE = (r: number): string => `A provision for doubtful debts is to be made at ${r}% on the debtors that remain.`;
const DEP_LINE = (asset: string, r: number): string => `${asset} is to be depreciated by ${r}%.`;
/** "Rent is", "Salaries are". */
const isAre = (e: string): string => (e.endsWith('s') ? 'are' : 'is');
const UNPAID_LINE = (e: string, x: number): string => `${e} of ${inr(x)} for March ${isAre(e)} unpaid and not in the figures above.`;

/** The adjusted statement worked out from the printed data alone. */
function adjustedAffairs(data: string): { capital: number; debtors: number } | null {
  let assets = 0;
  let liabilities = 0;
  let debtors = 0;
  let bad = 0;
  let assetValue = 0;
  for (const line of data.split('\n')) {
    const m = /^(.+): ₹([\d,]+)$/.exec(line);
    if (!m) continue;
    if (m[1] === 'Debtors') debtors = num(m[2]);
    else if (m[1] === BAD_LINE) bad = num(m[2]);
    else if (ADJ_ASSETS.some((x) => x.label === m[1])) assetValue = num(m[2]);
    else if (OTHER_ASSETS.includes(m[1])) assets += num(m[2]);
    else if (OTHER_LIABILITIES.includes(m[1])) liabilities += num(m[2]);
  }
  const pdd = Number(/made at (\d+)% on the debtors/.exec(data)?.[1]);
  const dep = Number(/is to be depreciated by (\d+)%\./.exec(data)?.[1]);
  const unpaid = /of ₹([\d,]+) for March (?:is|are) unpaid/.exec(data);
  if (!debtors || !assetValue || !pdd || !dep || !unpaid) return null;
  // Bad debts first, the provision on what remains; the asset less its depreciation; the unpaid expense owed.
  const goodDebtors = ((debtors - bad) * (100 - pdd)) / 100;
  const asset = (assetValue * (100 - dep)) / 100;
  return { capital: assets + goodDebtors + asset - liabilities - num(unpaid[1]), debtors: goodDebtors };
}

const fmtAffairsAdjusted = statementTemplate({
  id: 'ir-fmt-affairs-adjusted', topicId: T, conceptId: 'ir-formats', difficulty: 'medium',
  generate: (rng) => {
    const t = rng.pick(TRADERS);
    const p = period(rng);
    const debtors = rng.step(60000, 250000, 1000);
    const bad = rng.step(1000, 8000, 500);
    const r = rng.pick([2, 4, 5, 10]);
    const pdd = ((debtors - bad) * r) / 100;
    const fa = rng.pick(ADJ_ASSETS);
    const value = rng.step(fa.min, fa.max, 5000);
    const depRate = rng.pick([10, 15, 20]);
    const dep = (value * depRate) / 100;
    if (!Number.isInteger(pdd) || !Number.isInteger(dep)) return null;
    const expense = rng.pick(OUT_EXPENSES);
    const unpaid = rng.step(2000, 15000, 500);
    // Two or three other assets and one or two liabilities; never cash at bank beside an overdraft.
    const kinds = (labels: string[]) => [...ASSET_KINDS, ...LIABILITY_KINDS].filter((k) => labels.includes(k.label));
    const others = rng.shuffle(kinds(OTHER_ASSETS)).slice(0, rng.int(2, 3));
    const bank = others.some((k) => k.label === 'Cash at bank');
    const owed = rng.shuffle(kinds(OTHER_LIABILITIES).filter((k) => !(bank && k.label === 'Bank overdraft'))).slice(0, rng.int(1, 2));
    const items: Item[] = [...others, ...owed].map((k) => ({ label: k.label, side: k.side, value: valueOf(rng, k) }));
    const goodDebtors = debtors - bad - pdd;
    const assetNet = value - dep;
    const assetsTotal = total(items, 'asset') + goodDebtors + assetNet;
    const liabilitiesOut = total(items, 'liability') + unpaid;
    const capital = assetsTotal - liabilitiesOut;
    if (capital < 50000) return null;
    const outLabel = `Outstanding ${lower(expense)}`;
    const data = [
      `${t.owner} keeps incomplete records of ${t.shop}. These figures were collected on ${p.end}:`,
      ...rng.shuffle([...items.map(itemLine), `Debtors: ${inr(debtors)}`, `${fa.label}: ${inr(value)}`]),
      'Adjustments, to be made in the statement itself:',
      `${BAD_LINE}: ${inr(bad)}`,
      PDD_LINE(r),
      DEP_LINE(fa.label, depRate),
      UNPAID_LINE(expense, unpaid),
    ].join('\n');
    const row = (label: string, x: number, details?: string[]): FormatRowParts => ({ label, amounts: [rupees(x)], ...(details ? { details } : {}) });
    const liabilities = items.filter((i) => i.side === 'liability');
    const assets = items.filter((i) => i.side === 'asset');
    return {
      task: `Prepare the Statement of Affairs of ${t.shop} as on ${p.end} after the adjustments given, entering each asset at its net figure and showing the capital as the balancing figure.`,
      data,
      title: `Statement of Affairs of ${t.shop} as on ${p.end}`,
      rows: [
        { heading: 'Liabilities' },
        ...liabilities.map((i) => row(i.label, i.value)),
        row(outLabel, unpaid),
        { label: CAPITAL_ROW, also: ['Capital'], amounts: [rupees(capital)] },
        { subtotal: TOTAL, amounts: [rupees(assetsTotal)], sum: 'all' },
        { heading: 'Assets' },
        row('Debtors', goodDebtors, [`Debtors ${inr(debtors)}`, `Less: Further bad debts ${inr(bad)}`, `Less: Provision for doubtful debts ${inr(pdd)}`]),
        row(fa.label, assetNet, [`${fa.label} ${inr(value)}`, `Less: Depreciation ${inr(dep)}`]),
        ...assets.map((i) => row(i.label, i.value)),
        { subtotal: TOTAL, amounts: [rupees(assetsTotal)], sum: 'block' },
      ],
      distractors: ['Provision for doubtful debts', `Depreciation on ${lower(fa.label)}`, 'Further bad debts', 'Drawings'],
      explanation: [
        `Debtors: ${inr(debtors)} - further bad debts ${inr(bad)} = ${inr(debtors - bad)}; provision ${r}% of ${inr(debtors - bad)} = ${inr(pdd)}; net debtors = ${inr(goodDebtors)}.`,
        `${fa.label}: ${inr(value)} - depreciation at ${depRate}% (${inr(dep)}) = ${inr(assetNet)}.`,
        `${expense} of ${inr(unpaid)} ${isAre(expense)} still owed: ${lower(outLabel)} ${isAre(expense)} a liability.`,
        `Assets = ${plus([goodDebtors, assetNet, ...assets.map((i) => i.value)])}. Liabilities to outsiders = ${plus([...liabilities.map((i) => i.value), unpaid])}.`,
        `Capital = ${inr(assetsTotal)} - ${inr(liabilitiesOut)} = ${inr(capital)}, entered on the liabilities side so that both totals are ${inr(assetsTotal)}.`,
        'Watch out: the provision and the depreciation are taken off the assets they belong to; they are not rows of their own on the liabilities side.',
      ],
      hints: [
        'Make each adjustment first: what is left of the debtors and of the asset, and what more does the business owe?',
        'Debtors less further bad debts, then less the provision on what remains; the asset less its depreciation; the unpaid expense among the liabilities. Capital = assets - liabilities.',
      ],
    };
  },
  verify: (q) => {
    const want = adjustedAffairs(q.data);
    const debtorsRow = q.rows.find((r) => r.label === 'Debtors');
    return want !== null && debtorsRow?.amounts[0] === rupees(want.debtors) && affairsHold(q, [want.capital]);
  },
});

/** The templates of the quality pass: no paper, worksheet or Look back level draws on them (`outsidePapers.ts`). */
const added: Template[] = [interestAdditionalCapital, fmtAffairsAdjusted];

const withAssertionReason: Template[] = [...all, assertionReason, ...added];

export default withAssertionReason;
