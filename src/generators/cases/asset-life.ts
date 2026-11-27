import type { AccountQuestion, FormatRow, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, SetEntry } from '@/content/types';
import { creditor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, balanceOf, post, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { caseTemplate, formatINR, ledgerPeriods, rupees, type PeriodClosing } from '../authoring';
import { DEP_CHAIN, type DepCharge } from '../templates/depreciation';
import type { AccountParts, CaseTemplate, FormatRowParts, McqParts, NumericParts, SetTransaction } from '../types';

const T = 'depreciation';
const C = 'dep-case';

// ---------------------------------------------------------------------------------------------------------------
// Conventions, the same as in templates/depreciation.ts, and stated in the text of every case that relies on them:
//  - the accounting year ends on 31 March;
//  - depreciation is charged for the period of use, in whole months, from the date of purchase to the date of sale
//    (every purchase and sale is on the first day of a month, or a sale is on 31 March after the year's charge);
//  - the straight line method charges a rate on original cost, the written down value method on the reducing balance;
//  - depreciation is credited either to the asset account itself or to Provision for Depreciation A/c;
//  - every charge is in whole rupees: a scenario that would leave paise is rejected.
// Scenarios work in whole rupees; `rupees` turns them into paise for answers and journal lines.
// ---------------------------------------------------------------------------------------------------------------

const inr = (n: number): string => formatINR(rupees(n));
const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

type AssetId = 'machinery' | 'vehicles' | 'furniture';
type Method = 'slm' | 'wdv';

interface Business {
  trade: string;
  item: string;
  /** How the asset is referred to after its first mention. */
  short: string;
  asset: AssetId;
}
const BUSINESSES: Business[] = [
  { trade: 'a printing press', item: 'an offset printing machine', short: 'the machine', asset: 'machinery' },
  { trade: 'a flour mill', item: 'a grinding machine', short: 'the machine', asset: 'machinery' },
  { trade: 'a garment unit', item: 'an embroidery machine', short: 'the machine', asset: 'machinery' },
  { trade: 'a packaging unit', item: 'a carton-sealing machine', short: 'the machine', asset: 'machinery' },
  { trade: 'a furniture workshop', item: 'a wood-cutting machine', short: 'the machine', asset: 'machinery' },
  { trade: 'a courier service', item: 'a delivery van', short: 'the van', asset: 'vehicles' },
  { trade: 'a dairy', item: 'a refrigerated van', short: 'the van', asset: 'vehicles' },
  { trade: 'a building-material store', item: 'a mini truck', short: 'the truck', asset: 'vehicles' },
  { trade: 'a coaching centre', item: 'classroom furniture', short: 'the furniture', asset: 'furniture' },
  { trade: 'a restaurant', item: 'dining furniture', short: 'the furniture', asset: 'furniture' },
];
const MACHINE_BUSINESSES = BUSINESSES.filter((b) => b.asset === 'machinery');
const ACCOUNT_NAME: Record<AssetId, string> = { machinery: 'Machinery', vehicles: 'Vehicles', furniture: 'Furniture' };
/** Payments that bring an asset into use and so are part of its cost. */
const EXTRAS: Record<AssetId, string[]> = {
  machinery: ['carriage to the workshop', 'installation', 'its concrete foundation'],
  vehicles: ['registration', 'fitting a goods body', 'delivery from the dealer'],
  furniture: ['carriage', 'assembly and fitting'],
};
const OWNERS = ['Meena', 'Arjun', 'Fatima', 'Gurpreet', 'Kavita', 'Rahul', 'Sunita', 'Joseph', 'Lakshmi', 'Farhan', 'Deepa', 'Harish'];
const CITIES = ['Pune', 'Kochi', 'Jaipur', 'Ludhiana', 'Surat', 'Indore', 'Nagpur', 'Mysuru', 'Coimbatore', 'Lucknow', 'Bhopal', 'Madurai'];

interface Scene {
  owner: string;
  city: string;
  biz: Business;
  /** The name of the asset account: "Machinery". */
  account: string;
  /** The opening line of every case. */
  intro: string;
}
/** `shift` is the number of the case, so that one seed does not give every case the same proprietor, town and trade. */
function scene(rng: Rng, shift: number, from: Business[] = BUSINESSES): Scene {
  const owner = OWNERS[(rng.int(0, OWNERS.length - 1) + shift * 5) % OWNERS.length];
  const city = CITIES[(rng.int(0, CITIES.length - 1) + shift * 7) % CITIES.length];
  const biz = from[(rng.int(0, from.length - 1) + shift * 3) % from.length];
  return { owner, city, biz, account: ACCOUNT_NAME[biz.asset], intro: `${owner} runs ${biz.trade} in ${city}. The accounting year ends on 31 March.` };
}

interface PayMode {
  text: string;
  account: 'bank' | 'cash';
}
// A used asset fetches lakhs of rupees, so the proceeds always come through the bank.
const SALE_MODES: PayMode[] = [{ text: 'by cheque', account: 'bank' }, { text: 'by bank transfer', account: 'bank' }];

const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
/** `1 <month>` of the accounting year that starts on 1 April `y`; month index 0 is April, 11 is March. */
const dateIn = (y: number, k: number): string => `1 ${MONTHS[k]} ${k >= 9 ? y + 1 : y}`;

const METHOD_TEXT: Record<Method, string> = {
  slm: 'on original cost (straight line method)',
  wdv: 'on the written down value (reducing balance method)',
};
const PERIOD_RULE = 'It is charged for the period of use, in whole months, from the date of purchase to the date of sale.';
const direct = (account: string): string => `It is credited to ${account} A/c itself; no provision account is kept.`;

/** `r`% a year of `base` for `months` months, or null when that is not a whole number of rupees. */
const charge = (base: number, r: number, months = 12): number | null => ((base * r * months) % 1200 === 0 ? (base * r * months) / 1200 : null);

interface Schedule {
  /** The depreciation of each period. */
  dep: number[];
  /** The book value at the end of each period. */
  bv: number[];
}
/** An asset's depreciation over periods of the given months; null if a charge has paise or nothing would be left. */
function schedule(cost: number, method: Method, r: number, months: number[]): Schedule | null {
  const dep: number[] = [];
  const bv: number[] = [];
  let left = cost;
  for (const m of months) {
    const d = charge(method === 'slm' ? cost : left, r, m);
    if (d === null) return null;
    left -= d;
    if (left <= 0) return null;
    dep.push(d);
    bv.push(left);
  }
  return { dep, bv };
}

/** A cost in [min, max] for which `ok` holds, from the roundest step that has one; null if there is none. */
function pickCost(rng: Rng, min: number, max: number, ok: (cost: number) => boolean): number | null {
  for (const unit of [10000, 5000, 2000, 1000]) {
    const all: number[] = [];
    for (let c = Math.ceil(min / unit) * unit; c <= max; c += unit) if (ok(c)) all.push(c);
    if (all.length > 0) return rng.pick(all);
  }
  return null;
}

interface Sale {
  sold: number;
  /** The profit or loss, as a positive amount. */
  gap: number;
  profit: boolean;
  mode: PayMode;
}
/** A round selling price a few thousand rupees above or below the book value, and below the cost; null if none fits. */
function sale(rng: Rng, bv: number, cost: number): Sale | null {
  const profit = rng.int(0, 1) === 0;
  const away = rng.step(4000, 24000, 1000);
  const mode = rng.pick(SALE_MODES);
  const sold = Math.round((bv + (profit ? away : -away)) / 1000) * 1000;
  const gap = Math.abs(sold - bv);
  if (sold <= 0 || sold >= cost || gap < 2000 || sold > bv !== profit) return null;
  return { sold, gap, profit, mode };
}

/** A typed-amount question in whole rupees. Wrong figures with paise, or equal to the answer or each other, are dropped. */
function numeric(prompt: string, answer: number, errs: [number | null, string][], explanation: string[], hints: string[]): NumericParts | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [raw, why] of errs) {
    if (raw === null || !Number.isFinite(raw)) continue;
    const v = Math.round(raw);
    if (v <= 0 || Math.abs(raw - v) > 1e-6 || seen.has(v)) continue;
    seen.add(v);
    commonErrors.push({ value: rupees(v), why });
  }
  return commonErrors.length >= 2 ? { prompt, answer: rupees(answer), commonErrors, explanation, hints } : null;
}

/** A choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  return distractors.length >= 3 ? { prompt, correct, distractors, explanation, hints } : null;
}

const PROFIT = 'Profit, as it was sold for more than its book value';
const LOSS = 'Loss, as it was sold for less than its book value';
/** "Is the sale a profit or a loss?" The amount is left for the question that follows. */
function resultChoice(prompt: string, o: { sold: number; bv: number; cost: number; when: string }): McqParts | null {
  const profit = o.sold > o.bv;
  const reversed = 'Reversed the comparison: a selling price above the book value is a profit, and one below it is a loss.';
  const neither: [string, string] = [
    'Neither, as depreciation has already written off the fall in value',
    'Assumed that the book value is always what the asset fetches. The two differ, and the difference is the profit or loss on sale.',
  ];
  const wrong: [string, string][] = profit
    ? [
        [LOSS, reversed],
        ['Loss, as it was sold for less than its original cost', 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
        neither,
      ]
    : [
        [PROFIT, reversed],
        ['Profit, as money was received for an asset already depreciated', 'Took the sale proceeds themselves as a gain. Only the difference between the proceeds and the book value is a profit or a loss.'],
        neither,
        ...(o.sold > o.cost - o.bv
          ? [['Profit, as it was sold for more than the depreciation charged on it', 'Compared the selling price with the total depreciation charged instead of the book value.'] as [string, string]]
          : []),
      ];
  return choice(
    prompt,
    profit ? PROFIT : LOSS,
    wrong,
    `The book value on ${o.when} is ${inr(o.bv)}. The selling price of ${inr(o.sold)} is ${profit ? 'more' : 'less'} than this, so the sale gives a ${profit ? 'profit' : 'loss'}.`,
    H.sale,
  );
}

const H = {
  cost: ['Which payments were needed before the asset could be put to use?', 'Such payments are capitalised: they are added to the cost of the asset, not charged as expenses.'],
  slm: ['Straight line: the same amount every year, worked on the original cost.', 'With a life and a scrap value, yearly depreciation = (cost - scrap value) / life.'],
  wdv: ['Written down value: the rate is applied to the book value at the start of each year, not to the cost.', 'Book value = cost - depreciation charged so far.'],
  part: ['Count the whole months of use in that accounting year.', 'Depreciation for a part of a year = the full year\'s charge x months / 12.'],
  sale: ['Book value on the date of sale = cost - all the depreciation charged up to that date.', 'A selling price above the book value is a profit; below it, a loss.'],
  prov: ['With a provision account the asset account stays at cost and the depreciation collects in the provision.', 'Book value = cost - balance of Provision for Depreciation A/c.'],
  disposal: ['Asset Disposal A/c is debited with the cost and credited with the provision and the sale proceeds.', 'A debit balance left on it is a loss on sale; a credit balance is a profit.'],
  entry: ['Depreciation is an expense: which account is debited?', 'The credit goes to the asset account itself, or to Provision for Depreciation A/c when one is kept.'],
  account: ['What is still in the asset account on that date, and at what cost?', 'Depreciation is credited to the asset account itself: balance = cost - all the depreciation charged so far.'],
  compare: ['Work out the figure under each method on the same cost.', 'Depreciation is an expense: the larger the charge, the lower the profit and the lower the book value.'],
};

// ---------------------------------------------------------------------------------------------------------------
// Reading a case back from its text, for `verify`: the answer is worked again from what the student is shown.
// ---------------------------------------------------------------------------------------------------------------

const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
const intIn = (s: string, re: RegExp): number => Number(re.exec(s)?.[1]);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const lineWith = (q: { context?: string }, word: string): string => (q.context ?? '').split('\n').find((l) => l.includes(word)) ?? '';
const DATE_RE = new RegExp(`(?<!\\d)1 (${MONTHS.join('|')}) (20\\d\\d)`);
/** The first "1 <month> <year>" of a line as months counted from 1 April 2000, so that two dates can be subtracted. */
function monthOf(line: string): number {
  const m = DATE_RE.exec(line);
  if (!m) return NaN;
  const k = MONTHS.indexOf(m[1]);
  return (Number(m[2]) - 2000 - (k >= 9 ? 1 : 0)) * 12 + k;
}
/** The 31 March of a line, on the same scale: the first month of the next accounting year. */
const marchOf = (line: string): number => (intIn(line, /31 March (20\d\d)/) - 2000) * 12;
const methodOf = (line: string): Method => (line.includes('straight line') ? 'slm' : 'wdv');
const rateOf = (line: string): number => intIn(line, /(\d+)% a year/);
/**
 * The book value of an asset `to` months after 1 April 2000 when it was bought `from` months after it, worked in one
 * line from the rate (no year-by-year schedule): the check that `verify` sets against the schedule of the scenario.
 */
function bookValue(cost: number, method: Method, r: number, from: number, to: number): number {
  if (to <= from) return cost;
  if (method === 'slm') return cost * (1 - (r * (to - from)) / 1200);
  const firstEnd = Math.min(to, (Math.floor(from / 12) + 1) * 12);
  const lastStart = Math.max(firstEnd, Math.floor(to / 12) * 12);
  return cost * (1 - (r * (firstEnd - from)) / 1200) * Math.pow(1 - r / 100, (lastStart - firstEnd) / 12) * (1 - (r * (to - lastStart)) / 1200);
}
const picked = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const answerIs = (q: NumericQuestion, value: number): boolean => near(q.answer / 100, value);
/** True when the entry has a line on this side of this account for this many rupees. */
const hasLine = (q: JournalQuestion, side: 'Dr' | 'Cr', accountId: string, value: number): boolean =>
  q.expected.some((l) => l.side === side && l.accountId === accountId && near(l.amount / 100, value));

// ===============================================================================================================
// 1. EASY: straight line method, from purchase to sale
// ===============================================================================================================

const slmToSale = caseTemplate({
  id: 'case-asset-slm-to-sale',
  topicId: T,
  conceptId: C,
  difficulty: 'easy',
  title: 'From purchase to sale on the straight line',
  setup: (rng) => {
    const sc = scene(rng, 0);
    const y = rng.int(2019, 2022);
    const price = rng.step(150000, 800000, 10000);
    const [x1, x2] = rng.shuffle(EXTRAS[sc.biz.asset]);
    const a1 = rng.step(4000, 24000, 2000);
    const drawn = rng.step(3000, 15000, 1000);
    const a2 = drawn === a1 ? drawn + 1000 : drawn; // two different amounts, so each wrong cost names one payment
    const cost = price + a1 + a2;
    const byLife = rng.int(0, 1) === 0;
    let r = 0;
    let life = 0;
    let scrap = 0;
    let d: number;
    if (byLife) {
      life = rng.pick([5, 8, 10]);
      d = Math.round((cost * (100 - rng.pick([5, 10]))) / 100 / life / 1000) * 1000;
      scrap = cost - d * life;
      if (scrap <= 0) return null;
    } else {
      r = rng.pick([10, 12, 15, 20]);
      d = (cost * r) / 100;
    }
    const n = rng.int(2, byLife ? Math.min(life - 1, 4) : r === 20 ? 3 : 4);
    const bv = cost - d * n;
    const s = sale(rng, bv, cost);
    if (!s) return null;
    return { ...sc, y, price, x1, x2, a1, a2, cost, byLife, r, life, scrap, d, n, bv, ...s };
  },
  context: (s) =>
    [
      s.intro,
      `1 April ${s.y}: Bought ${s.biz.item} for ${inr(s.price)} by cheque.`,
      `1 April ${s.y}: Paid ${inr(s.a1)} for ${s.x1} and ${inr(s.a2)} for ${s.x2}, in cash.`,
      `${cap(s.biz.short)} was put to use the same day.`,
      s.byLife
        ? `Depreciation: straight line method. Expected life ${s.life} years; scrap value ${inr(s.scrap)}.`
        : `Depreciation: ${s.r}% a year ${METHOD_TEXT.slm}.`,
      direct(s.account),
      `31 March ${s.y + s.n}: Sold ${s.biz.short} for ${inr(s.sold)} ${s.mode.text}, after recording the depreciation for the year.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `At what cost is ${s.biz.short} recorded in ${s.account} A/c on 1 April ${s.y}?`,
          s.cost,
          [
            [s.price, 'Recorded only the purchase price and treated the other two payments as expenses.'],
            [s.price + s.a1, `Left out the amount paid for ${s.x2}, which is also a cost of bringing ${s.biz.short} into use.`],
            [s.price + s.a2, `Left out the amount paid for ${s.x1}, which is also a cost of bringing ${s.biz.short} into use.`],
          ],
          ['Cost of an asset = purchase price + every payment needed to bring it into use.', `${inr(s.price)} + ${inr(s.a1)} + ${inr(s.a2)} = ${inr(s.cost)}.`],
          H.cost,
        ),
      verify: (q) => answerIs(q, sum(amountsIn(lineWith(q, 'Bought'))) + sum(amountsIn(lineWith(q, 'Paid')))),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        s.byLife
          ? numeric(
              `How much depreciation is charged on ${s.biz.short} each year?`,
              s.d,
              [
                [s.cost / s.life, 'Divided the whole cost by the life without first deducting the scrap value.'],
                [(s.price - s.scrap) / s.life, 'Took the purchase price alone as the cost, leaving out the other two payments.'],
                [s.cost - s.scrap, 'Found the amount to be written off over the whole life but did not divide it by the number of years.'],
                [(s.cost + s.scrap) / s.life, 'Added the scrap value to the cost instead of deducting it.'],
              ],
              [`Cost = ${inr(s.cost)}.`, `Yearly depreciation = (Cost - Scrap value) / Life = (${inr(s.cost)} - ${inr(s.scrap)}) / ${s.life} = ${inr(s.d)}.`],
              H.slm,
            )
          : numeric(
              `How much depreciation is charged on ${s.biz.short} each year?`,
              s.d,
              [
                [(s.price * s.r) / 100, 'Applied the rate to the purchase price alone, leaving the other two payments out of the cost.'],
                [s.cost - s.d, 'Gave the book value after one year instead of the depreciation.'],
                [s.d * s.n, `Gave the depreciation of the ${s.n} years together instead of one year's charge.`],
              ],
              [`Cost = ${inr(s.cost)}.`, `Yearly depreciation = ${s.r}% of ${inr(s.cost)} = ${inr(s.d)}, the same every year.`],
              H.slm,
            ),
      verify: (q) => answerIs(q, readSlmToSale(q).d),
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the depreciation of the year ended 31 March ${s.y + 1}.`,
        lines: [dr('depreciation', s.d), cr(s.biz.asset, s.d)],
        explanation: [
          s.byLife ? `Yearly depreciation = (${inr(s.cost)} - ${inr(s.scrap)}) / ${s.life} = ${inr(s.d)}.` : `Yearly depreciation = ${s.r}% of ${inr(s.cost)} = ${inr(s.d)}.`,
          'Depreciation is an expense, so Depreciation A/c is debited.',
          `No provision account is kept, so ${s.account} A/c itself is credited.`,
        ],
        hints: H.entry,
        distractorAccounts: ['provisionForDepreciation', 'repairs'],
      }),
      verify: (q) => hasLine(q, 'Dr', 'depreciation', readSlmToSale(q).d),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the book value of ${s.biz.short} on 31 March ${s.y + s.n}, just before it is sold?`,
          s.bv,
          [
            [s.d * s.n, 'Gave the total depreciation charged instead of the book value that is left.'],
            [s.cost - s.d * (s.n - 1), `Charged depreciation for ${plural(s.n - 1, 'year')} only, missing the year that ends on the date of sale.`],
            [s.cost - s.d, 'Deducted the depreciation of one year only.'],
            [s.byLife ? null : s.cost * Math.pow(1 - s.r / 100, s.n), 'Applied the rate to a falling balance, which is the written down value method, not the straight line method.'],
            [s.byLife ? s.cost - s.scrap - s.d * s.n : null, 'Deducted the scrap value as well as the depreciation. The scrap value is what is left at the end of the life; it is not taken off the book value.'],
            [s.price - (s.byLife ? ((s.price - s.scrap) / s.life) * s.n : (s.price * s.r * s.n) / 100), 'Worked from the purchase price alone, leaving the other two payments out of the cost.'],
          ],
          [
            `Yearly depreciation = ${inr(s.d)}; 1 April ${s.y} to 31 March ${s.y + s.n} is ${s.n} years.`,
            `Total depreciation = ${inr(s.d)} x ${s.n} = ${inr(s.d * s.n)}.`,
            `Book value = ${inr(s.cost)} - ${inr(s.d * s.n)} = ${inr(s.bv)}.`,
          ],
          H.sale,
        ),
      verify: (q) => answerIs(q, readSlmToSale(q).bv),
    },
    {
      kind: 'mcq',
      make: (s) => resultChoice(`Does the sale of ${s.biz.short} give a profit or a loss?`, { sold: s.sold, bv: s.bv, cost: s.cost, when: `31 March ${s.y + s.n}` }),
      verify: (q) => {
        const r = readSlmToSale(q);
        return picked(q) === (r.sold > r.bv ? PROFIT : LOSS);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the amount of the profit or loss on the sale of ${s.biz.short}?`,
          s.gap,
          [
            [s.cost - s.sold, 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
            [Math.abs(s.sold - (s.cost - s.d * (s.n - 1))), 'Used the book value of a year earlier, so the depreciation of the last year was missed.'],
            [s.d * s.n, 'Gave the total depreciation charged instead of the profit or loss.'],
            [Math.abs(s.sold - (s.price - (s.byLife ? ((s.price - s.scrap) / s.life) * s.n : (s.price * s.r * s.n) / 100))), 'Worked the book value from the purchase price alone, leaving the other two payments out of the cost.'],
          ],
          [
            `Book value on 31 March ${s.y + s.n} = ${inr(s.cost)} - ${s.n} x ${inr(s.d)} = ${inr(s.bv)}.`,
            s.profit
              ? `Profit = Selling price - Book value = ${inr(s.sold)} - ${inr(s.bv)} = ${inr(s.gap)}.`
              : `Loss = Book value - Selling price = ${inr(s.bv)} - ${inr(s.sold)} = ${inr(s.gap)}.`,
          ],
          H.sale,
        ),
      verify: (q) => {
        const r = readSlmToSale(q);
        return answerIs(q, Math.abs(r.sold - r.bv));
      },
    },
  ],
});

/** Case 1 worked again from its text. */
function readSlmToSale(q: { context?: string }): { cost: number; d: number; bv: number; sold: number } {
  const cost = sum(amountsIn(lineWith(q, 'Bought'))) + sum(amountsIn(lineWith(q, 'Paid')));
  const rule = lineWith(q, 'Depreciation:');
  const d = rule.includes('% a year') ? (cost * rateOf(rule)) / 100 : (cost - amountsIn(rule)[0]) / intIn(rule, /life (\d+) years/);
  const saleLine = lineWith(q, ': Sold ');
  const n = intIn(saleLine, /31 March (\d{4})/) - intIn(lineWith(q, 'Bought'), /1 April (\d{4})/);
  return { cost, d, bv: cost - d * n, sold: amountsIn(saleLine)[0] };
}

// ===============================================================================================================
// 2. MEDIUM: written down value, bought and sold part-way through a year
// ===============================================================================================================

const wdvPartYears = caseTemplate({
  id: 'case-asset-wdv-part-years',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Written down value with part years',
  setup: (rng) => {
    const sc = scene(rng, 1);
    const y = rng.int(2019, 2022);
    const r = rng.pick([10, 15, 20, 25]);
    const k = rng.int(1, 9);
    const m = 12 - k;
    const full = rng.int(1, 2);
    const e = rng.pick([3, 4, 6, 8, 9]);
    const months = [m, ...Array<number>(full).fill(12), e];
    const cost = pickCost(rng, 120000, 800000, (c) => schedule(c, 'wdv', r, months) !== null);
    if (cost === null) return null;
    const life = schedule(cost, 'wdv', r, months)!;
    // In some seeds a part of the cost is a separate payment that has to be capitalised first.
    const extra = rng.int(0, 1) === 0 ? rng.step(4000, 20000, 2000) : 0;
    const x = rng.pick(EXTRAS[sc.biz.asset]);
    const ys = y + 1 + full; // the accounting year of the sale starts on 1 April of this year
    const open = life.bv[full]; // book value on that 1 April
    const dSale = life.dep[full + 1];
    const bv = life.bv[full + 1];
    const s = sale(rng, bv, cost);
    if (!s) return null;
    return { ...sc, y, r, k, m, full, e, cost, price: cost - extra, extra, x, life, ys, open, dSale, bv, ...s };
  },
  context: (s) =>
    [
      s.intro,
      `${dateIn(s.y, s.k)}: Bought ${s.biz.item} for ${inr(s.price)} by cheque.`,
      ...(s.extra ? [`${dateIn(s.y, s.k)}: Paid ${inr(s.extra)} in cash for ${s.x}.`] : []),
      `Depreciation: ${s.r}% a year ${METHOD_TEXT.wdv}.`,
      PERIOD_RULE,
      direct(s.account),
      `${dateIn(s.ys, s.e)}: ${cap(s.biz.short)} was sold for ${inr(s.sold)} ${s.mode.text}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the depreciation for the year ended 31 March ${s.y + 1}?`,
          s.life.dep[0],
          [
            [(s.cost * s.r) / 100, `Charged a full year although ${s.biz.short} was in use for only ${s.m} months of the year.`],
            [charge(s.cost, s.r, s.k), 'Counted the months before the purchase instead of the months of use.'],
            [charge(s.cost, s.r, s.m - 1), 'Left out the month of purchase when counting the months of use.'],
            [s.extra ? charge(s.price, s.r, s.m) : null, `Left the amount paid for ${s.x} out of the cost.`],
            [s.cost - s.life.dep[0], `Gave the book value on 31 March ${s.y + 1} instead of the depreciation of the year.`],
          ],
          [
            ...(s.extra ? [`Cost = ${inr(s.price)} + ${inr(s.extra)} = ${inr(s.cost)}.`] : []),
            `${dateIn(s.y, s.k)} to 31 March ${s.y + 1} is ${s.m} months.`,
            `Depreciation = ${s.r}% of ${inr(s.cost)} x ${s.m}/12 = ${inr(s.life.dep[0])}.`,
          ],
          H.part,
        ),
      verify: (q) => {
        const c = readWdvPartYears(q);
        return answerIs(q, c.cost - bookValue(c.cost, 'wdv', c.r, c.from, (Math.floor(c.from / 12) + 1) * 12));
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the depreciation of the year ended 31 March ${s.y + 2}.`,
        lines: [dr('depreciation', s.life.dep[1]), cr(s.biz.asset, s.life.dep[1])],
        explanation: [
          `Book value on 1 April ${s.y + 1} = ${inr(s.cost)} - ${inr(s.life.dep[0])} = ${inr(s.life.bv[0])}.`,
          `Depreciation for the full year = ${s.r}% of ${inr(s.life.bv[0])} = ${inr(s.life.dep[1])}: Depreciation A/c is debited.`,
          `No provision account is kept, so ${s.account} A/c itself is credited.`,
        ],
        hints: H.wdv,
        distractorAccounts: ['provisionForDepreciation', 'repairs'],
      }),
      verify: (q) => {
        const c = readWdvPartYears(q);
        const end = (Math.floor(c.from / 12) + 1) * 12;
        return hasLine(q, 'Dr', 'depreciation', bookValue(c.cost, 'wdv', c.r, c.from, end) - bookValue(c.cost, 'wdv', c.r, c.from, end + 12));
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `How is the depreciation worked out for the accounting year in which ${s.biz.short} is sold?`,
          `${s.r}% of ${inr(s.open)} for ${s.e} months`,
          [
            [`${s.r}% of ${inr(s.open)} for 12 months`, `Charged a full year although ${s.biz.short} was in use for only a part of the year of sale.`],
            [`${s.r}% of ${inr(s.cost)} for ${s.e} months`, 'Applied the rate to the original cost, which is the straight line method. Here the base is the written down value.'],
            [`${s.r}% of ${inr(s.open)} for ${12 - s.e} months`, 'Counted the months after the sale instead of the months of use before it.'],
            [`${s.r}% of ${inr(s.life.bv[s.full - 1])} for ${s.e} months`, `Used the book value of a year earlier, before the depreciation of the year ended 31 March ${s.ys} was deducted.`],
            ['No depreciation, as the asset was sold during the year', 'Left out the depreciation for the months of use in the year of sale. In this case it is charged up to the date of sale.'],
          ],
          `The year starts on 1 April ${s.ys} with a book value of ${inr(s.open)}. From then to ${dateIn(s.ys, s.e)} is ${s.e} months of use, so the charge is ${s.r}% of ${inr(s.open)} for ${s.e} months.`,
          H.part,
        ),
      verify: (q) => {
        const c = readWdvPartYears(q);
        const start = Math.floor(c.to / 12) * 12;
        return picked(q) === `${c.r}% of ${inr(Math.round(bookValue(c.cost, 'wdv', c.r, c.from, start)))} for ${c.to - start} months`;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the depreciation for the year of sale, from 1 April ${s.ys} to the date of sale?`,
          s.dSale,
          [
            [(s.open * s.r) / 100, 'Charged a full year in the year of sale.'],
            [charge(s.cost, s.r, s.e), 'Applied the rate to the original cost instead of the book value on the first day of the year.'],
            [charge(s.open, s.r, 12 - s.e), 'Counted the months after the sale instead of the months of use before it.'],
            [charge(s.life.bv[s.full - 1], s.r, s.e), `Used the book value of a year earlier, before the depreciation of the year ended 31 March ${s.ys} was deducted.`],
            [s.cost - s.bv, 'Gave the total depreciation charged since the purchase instead of the charge of the year of sale alone.'],
            [s.life.dep[s.full], `Gave the depreciation of the year ended 31 March ${s.ys}, the last full year, instead of that of the months of use in the year of sale.`],
          ],
          [...yearLines(s.cost, s.r, s.y, s.k, s.life, s.full), `1 April ${s.ys} to ${dateIn(s.ys, s.e)} is ${s.e} months: ${s.r}% of ${inr(s.open)} x ${s.e}/12 = ${inr(s.dSale)}.`],
          H.part,
        ),
      verify: (q) => {
        const c = readWdvPartYears(q);
        const start = Math.floor(c.to / 12) * 12;
        return answerIs(q, bookValue(c.cost, 'wdv', c.r, c.from, start) - bookValue(c.cost, 'wdv', c.r, c.from, c.to));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the book value of ${s.biz.short} on ${dateIn(s.ys, s.e)}, the date of sale?`,
          s.bv,
          [
            [s.open, 'Left out the depreciation for the months of use in the year of sale.'],
            [s.open - (s.open * s.r) / 100, 'Deducted a full year of depreciation in the year of sale.'],
            [s.cost - s.bv, 'Gave the total depreciation charged instead of the book value that is left.'],
            [s.cost - (charge(s.cost, s.r, s.m + 12 * s.full + s.e) ?? s.cost), 'Applied the rate to the original cost throughout, which is the straight line method.'],
            [s.cost - s.dSale, 'Deducted only the depreciation of the year of sale from the cost, leaving out the earlier years.'],
          ],
          [
            ...yearLines(s.cost, s.r, s.y, s.k, s.life, s.full),
            `Year of sale (${s.e} months): ${s.r}% of ${inr(s.open)} x ${s.e}/12 = ${inr(s.dSale)}.`,
            `Book value on the date of sale = ${inr(s.open)} - ${inr(s.dSale)} = ${inr(s.bv)}.`,
          ],
          H.sale,
        ),
      verify: (q) => {
        const c = readWdvPartYears(q);
        return answerIs(q, bookValue(c.cost, 'wdv', c.r, c.from, c.to));
      },
    },
    {
      kind: 'mcq',
      make: (s) => resultChoice(`Does the sale of ${s.biz.short} give a profit or a loss?`, { sold: s.sold, bv: s.bv, cost: s.cost, when: dateIn(s.ys, s.e) }),
      verify: (q) => {
        const c = readWdvPartYears(q);
        return picked(q) === (c.sold > bookValue(c.cost, 'wdv', c.r, c.from, c.to) ? PROFIT : LOSS);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the amount of the profit or loss on the sale of ${s.biz.short}?`,
          s.gap,
          [
            [Math.abs(s.sold - s.open), 'Left out the depreciation for the months of use in the year of sale.'],
            [Math.abs(s.sold - (s.open - (s.open * s.r) / 100)), 'Charged a full year of depreciation in the year of sale.'],
            [s.cost - s.sold, 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
            [s.cost - s.bv, 'Gave the total depreciation charged instead of the profit or loss.'],
          ],
          [
            `Book value on 1 April ${s.ys} = ${inr(s.open)}; depreciation to the date of sale = ${inr(s.dSale)}.`,
            `Book value on ${dateIn(s.ys, s.e)} = ${inr(s.open)} - ${inr(s.dSale)} = ${inr(s.bv)}.`,
            s.profit
              ? `Profit = Selling price - Book value = ${inr(s.sold)} - ${inr(s.bv)} = ${inr(s.gap)}.`
              : `Loss = Book value - Selling price = ${inr(s.bv)} - ${inr(s.sold)} = ${inr(s.gap)}.`,
          ],
          H.sale,
        ),
      verify: (q) => {
        const c = readWdvPartYears(q);
        return answerIs(q, Math.abs(c.sold - bookValue(c.cost, 'wdv', c.r, c.from, c.to)));
      },
    },
  ],
});

/** The working of a written down value asset from a part first year through `full` full years, one line a year. */
function yearLines(cost: number, r: number, y: number, k: number, life: Schedule, full: number): string[] {
  const out = [`Year ended 31 March ${y + 1} (${12 - k} months): ${r}% of ${inr(cost)} x ${12 - k}/12 = ${inr(life.dep[0])}; book value ${inr(life.bv[0])}.`];
  for (let i = 1; i <= full; i++) out.push(`Year ended 31 March ${y + 1 + i}: ${r}% of ${inr(life.bv[i - 1])} = ${inr(life.dep[i])}; book value ${inr(life.bv[i])}.`);
  return out;
}

/** Case 2 read back from its text: the cost, the rate and the months of purchase and sale. */
function readWdvPartYears(q: { context?: string }): { cost: number; r: number; from: number; to: number; sold: number } {
  const bought = lineWith(q, 'Bought');
  const sold = lineWith(q, 'was sold for');
  return { cost: sum(amountsIn(bought)) + sum(amountsIn(lineWith(q, 'Paid'))), r: rateOf(lineWith(q, 'Depreciation:')), from: monthOf(bought), to: monthOf(sold), sold: amountsIn(sold)[0] };
}

/**
 * The working of one asset, a line for each period of `months`: the first starts when the asset is bought (in the
 * accounting year that begins on 1 April `y0`), and the last is a part year up to the date of sale when `toSale`.
 */
function workLines(name: string, cost: number, method: Method, r: number, y0: number, months: number[], life: Schedule, toSale: boolean): string[] {
  return months.map((m, i) => {
    const base = method === 'slm' || i === 0 ? cost : life.bv[i - 1];
    const label = toSale && i === months.length - 1 ? `1 April ${y0 + i} to the date of sale (${m} months)` : `year ended 31 March ${y0 + i + 1}${m < 12 ? ` (${m} months)` : ''}`;
    return `${name ? `${name}, ${label}` : cap(label)}: ${r}% of ${inr(base)}${m < 12 ? ` x ${m}/12` : ''} = ${inr(life.dep[i])}${method === 'wdv' ? `; book value ${inr(life.bv[i])}` : ''}.`;
  });
}

// ===============================================================================================================
// 3. MEDIUM: Provision for Depreciation A/c and Asset Disposal A/c
// ===============================================================================================================

const provisionDisposal = caseTemplate({
  id: 'case-asset-provision-disposal',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Provision for depreciation and the disposal account',
  setup: (rng) => {
    const sc = scene(rng, 2);
    const y = rng.int(2019, 2022);
    const method = rng.pick<Method>(['slm', 'wdv']);
    const r = rng.pick(method === 'slm' ? [10, 12, 15, 20] : [10, 15, 20]);
    const k = rng.pick([0, 0, 3, 6, 9]); // bought on 1 April in some seeds, part-way through a year in others
    const ends = rng.int(2, 3); // the number of 31 Marches on which depreciation is recorded
    const e = rng.pick([0, 3, 6, 9]); // months of use in a last part year; 0 when the sale is on a 31 March
    const months = [12 - k, ...Array<number>(ends - 1).fill(12), ...(e ? [e] : [])];
    const cost = pickCost(rng, 150000, 800000, (c) => schedule(c, method, r, months) !== null);
    if (cost === null) return null;
    const life = schedule(cost, method, r, months)!;
    const prov = sum(life.dep);
    const bv = cost - prov;
    if (bv * 5 < cost) return null;
    const s = sale(rng, bv, cost);
    if (!s) return null;
    // The disposal account, posted as the firm would: its balance is the result of the sale.
    const ledger = post([
      [dr('assetDisposal', cost), cr(sc.biz.asset, cost)],
      [dr('provisionForDepreciation', prov), cr('assetDisposal', prov)],
      [dr(s.mode.account, s.sold), cr('assetDisposal', s.sold)],
    ]);
    const result = balanceOf(ledger, 'assetDisposal');
    if (!result) return null;
    const when = e ? dateIn(y + ends, e) : `31 March ${y + ends}`;
    return { ...sc, y, method, r, k, ends, e, months, cost, life, prov, bv, ...s, when, gap: result.amount / 100, profit: result.side === 'Cr', last: life.dep[life.dep.length - 1] };
  },
  context: (s) =>
    [
      s.intro,
      `${dateIn(s.y, s.k)}: Bought ${s.biz.item} for ${inr(s.cost)} by cheque.`,
      `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`,
      PERIOD_RULE,
      `It is credited to Provision for Depreciation A/c; ${s.account} A/c stays at cost.`,
      `${s.when}: Sold ${s.biz.short} for ${inr(s.sold)} ${s.mode.text}, after recording the depreciation ${s.e ? 'up to this date' : 'for the year'}.`,
      'The sale is recorded through an Asset Disposal A/c.',
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the depreciation of the year ended 31 March ${s.y + 1}.`,
        lines: [dr('depreciation', s.life.dep[0]), cr('provisionForDepreciation', s.life.dep[0])],
        explanation: [
          s.k
            ? `${dateIn(s.y, s.k)} to 31 March ${s.y + 1} is ${12 - s.k} months: ${s.r}% of ${inr(s.cost)} x ${12 - s.k}/12 = ${inr(s.life.dep[0])}.`
            : `A full year of use: ${s.r}% of ${inr(s.cost)} = ${inr(s.life.dep[0])}.`,
          'Depreciation is an expense, so Depreciation A/c is debited.',
          `${s.account} A/c stays at cost, so the credit goes to Provision for Depreciation A/c.`,
        ],
        hints: H.entry,
        distractorAccounts: [s.biz.asset, 'assetDisposal'],
      }),
      verify: (q) => hasLine(q, 'Cr', 'provisionForDepreciation', readProvisionDisposal(q).firstYear),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the balance of Provision for Depreciation A/c on ${s.when}, just before the sale is recorded?`,
          s.prov,
          [
            [s.last, s.e ? 'Gave only the depreciation of the months of use in the year of sale.' : 'Gave only the depreciation of the last year. The provision collects the charge of every year.'],
            [s.bv, 'Gave the book value, cost less provision, instead of the balance of the provision.'],
            [s.k ? sum(schedule(s.cost, s.method, s.r, [12, ...s.months.slice(1)])?.dep ?? []) : null, `Charged a full year in the year of purchase, although ${s.biz.short} was used for only ${12 - s.k} months of it.`],
            [
              s.prov - s.last,
              s.e
                ? 'Left out the depreciation for the months of use in the year of sale.'
                : `Gave the balance of a year earlier, before the depreciation of the year ended 31 March ${s.y + s.ends} was recorded.`,
            ],
            [s.cost, `Gave the balance of ${s.account} A/c, which stays at cost, instead of the balance of the provision.`],
            s.method === 'wdv'
              ? [charge(s.cost, s.r, sum(s.months)), 'Charged the rate on the original cost every year, which is the straight line method.']
              : [sum(schedule(s.cost, 'wdv', s.r, s.months)?.dep ?? []), 'Applied the rate to a reducing balance, although the case charges it on the original cost.'],
          ],
          [...workLines('', s.cost, s.method, s.r, s.y, s.months, s.life, s.e > 0), `Balance of the provision = ${s.life.dep.map(inr).join(' + ')} = ${inr(s.prov)}.`],
          H.prov,
        ),
      verify: (q) => {
        const c = readProvisionDisposal(q);
        return answerIs(q, c.cost - c.bv);
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          `What is the balance of ${s.account} A/c on ${s.when}, just before the sale is recorded?`,
          inr(s.cost),
          [
            [inr(s.bv), 'Deducted the depreciation from the asset account, although Provision for Depreciation A/c carries it.'],
            [inr(s.prov), 'Gave the balance of Provision for Depreciation A/c instead of the asset account.'],
            [inr(s.cost - s.life.dep[0]), "Deducted the first year's depreciation from the asset account, which is not touched when a provision account is kept."],
            [inr(s.cost + s.prov), 'Added the provision to the cost instead of leaving the asset account alone.'],
          ],
          `Depreciation is credited to Provision for Depreciation A/c every year, so ${s.account} A/c is never reduced. It still shows the cost, ${inr(s.cost)}.`,
          H.prov,
        ),
      verify: (q) => picked(q) === inr(readProvisionDisposal(q).cost),
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry that transfers the provision for depreciation on ${s.biz.short} to Asset Disposal A/c.`,
        lines: [dr('provisionForDepreciation', s.prov), cr('assetDisposal', s.prov)],
        explanation: [
          `Depreciation recorded up to ${s.when} = ${s.life.dep.map(inr).join(' + ')} = ${inr(s.prov)}.`,
          'The provision on an asset that is sold is no longer needed, so Provision for Depreciation A/c is debited.',
          'Asset Disposal A/c is credited: the depreciation already charged reduces what the sale has to recover.',
        ],
        hints: H.disposal,
        distractorAccounts: [s.biz.asset, 'depreciation'],
      }),
      verify: (q) => {
        const c = readProvisionDisposal(q);
        return hasLine(q, 'Dr', 'provisionForDepreciation', c.cost - c.bv);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          'What is the total of the credit side of Asset Disposal A/c, before the account is closed?',
          s.prov + s.sold,
          [
            [s.sold, 'Entered only the sale proceeds. The provision for depreciation transferred is also credited.'],
            [s.prov, 'Entered only the provision for depreciation. The sale proceeds are also credited.'],
            [s.cost, 'Gave the debit side, which carries the cost transferred from the asset account.'],
            [s.bv + s.sold, 'Credited the book value instead of the provision for depreciation.'],
          ],
          [
            `Provision for depreciation transferred = ${inr(s.prov)}.`,
            `Sale proceeds = ${inr(s.sold)}.`,
            `Credit side = ${inr(s.prov)} + ${inr(s.sold)} = ${inr(s.prov + s.sold)}. The debit side carries the cost, ${inr(s.cost)}.`,
          ],
          H.disposal,
        ),
      verify: (q) => {
        const c = readProvisionDisposal(q);
        return answerIs(q, c.cost - c.bv + c.sold);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const debitLoss = 'The debit side; the difference is a loss on sale';
        const creditProfit = 'The credit side; the difference is a profit on sale';
        const debitProfit = 'The debit side; the difference is a profit on sale';
        const creditLoss = 'The credit side; the difference is a loss on sale';
        const equal: [string, string] = ['Neither; the two sides are equal', 'Assumed that the selling price always equals the book value, so that the account closes by itself.'];
        // Each wrong option is one slip from the right one: the wrong side, the wrong meaning, or both.
        const wrong: [string, string][] = s.profit
          ? [
              [debitLoss, 'Took the cost debited to be more than the provision and the sale proceeds credited. Here it is less.'],
              [debitProfit, 'Named the wrong side. The result is a profit, but a profit shows as a heavier credit side: the provision and the sale proceeds together come to more than the cost.'],
              [creditLoss, 'Read a heavier credit side as a loss. Credits above the cost mean the sale brought in more than the book value, which is a profit.'],
              equal,
            ]
          : [
              [creditProfit, 'Took the provision and the sale proceeds credited to be more than the cost debited. Here they are less.'],
              [creditLoss, 'Named the wrong side. The result is a loss, but a loss shows as a heavier debit side: the cost is more than the provision and the sale proceeds together.'],
              [debitProfit, 'Read a heavier debit side as a profit. A heavier debit side is cost that the sale did not recover, which is a loss.'],
              equal,
            ];
        return choice(
          'Once the cost, the provision and the sale proceeds are posted to Asset Disposal A/c, which side is heavier and what does the difference show?',
          s.profit ? creditProfit : debitLoss,
          wrong,
          `Debit side: cost ${inr(s.cost)}. Credit side: ${inr(s.prov)} + ${inr(s.sold)} = ${inr(s.prov + s.sold)}. The ${s.profit ? 'credit' : 'debit'} side is heavier, which is a ${s.profit ? 'profit' : 'loss'} on sale.`,
          H.disposal,
        );
      },
      verify: (q) => {
        const c = readProvisionDisposal(q);
        return picked(q) === (c.sold > c.bv ? 'The credit side; the difference is a profit on sale' : 'The debit side; the difference is a loss on sale');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the amount of the profit or loss on the sale of ${s.biz.short}, as shown by Asset Disposal A/c?`,
          s.gap,
          [
            [s.cost - s.sold, 'Left the provision out of the account and compared the sale proceeds with the original cost.'],
            [Math.abs(s.sold - (s.bv + s.last)), s.e ? 'Left out the depreciation for the months of use in the year of sale.' : 'Used the provision of a year earlier, so the depreciation of the last year was missed.'],
            [Math.abs(s.sold - s.prov), 'Compared the sale proceeds with the provision instead of with the book value.'],
            [s.prov, 'Gave the balance of the provision instead of the result of the sale.'],
            [s.prov + s.sold, 'Gave the total of the credit side instead of the difference between the two sides.'],
          ],
          [
            `Debit side: cost ${inr(s.cost)}.`,
            `Credit side: provision ${inr(s.prov)} + sale proceeds ${inr(s.sold)} = ${inr(s.prov + s.sold)}.`,
            s.profit
              ? `Profit = ${inr(s.prov + s.sold)} - ${inr(s.cost)} = ${inr(s.gap)}, transferred to Profit on Sale of Asset A/c.`
              : `Loss = ${inr(s.cost)} - ${inr(s.prov + s.sold)} = ${inr(s.gap)}, transferred to Loss on Sale of Asset A/c.`,
          ],
          H.disposal,
        ),
      verify: (q) => {
        const c = readProvisionDisposal(q);
        return answerIs(q, Math.abs(c.sold - c.bv));
      },
    },
  ],
});

/** Case 3 read back from its text. The sale is either on a 31 March or on the first day of a month. */
function readProvisionDisposal(q: { context?: string }): { cost: number; bv: number; sold: number; firstYear: number } {
  const bought = lineWith(q, 'Bought');
  const sold = lineWith(q, ': Sold ');
  const rule = lineWith(q, 'Depreciation:');
  const cost = amountsIn(bought)[0];
  const from = monthOf(bought);
  const to = sold.startsWith('31 March') ? marchOf(sold) : monthOf(sold);
  const value = (at: number) => bookValue(cost, methodOf(rule), rateOf(rule), from, at);
  return { cost, bv: value(to), sold: amountsIn(sold)[0], firstYear: cost - value((Math.floor(from / 12) + 1) * 12) };
}

// ===============================================================================================================
// 4. COMPLEX: two machines bought on different dates, one of them sold
// ===============================================================================================================

/** One of the two machines of case 4, with its own schedule. */
interface Machine {
  name: string;
  cost: number;
  /** The months of each of its periods, the first starting when it is bought. */
  months: number[];
  life: Schedule;
  /** Its first period lies in the accounting year that begins on 1 April of this year. */
  y0: number;
  /** Its book value on the first day of the third year. */
  open: number;
  /** Its depreciation in the third year. */
  last: number;
  /** Its book value at the end of its last period. */
  bv: number;
}

const twoMachines = caseTemplate({
  id: 'case-asset-two-machines',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Two machines, one of them sold',
  setup: (rng) => {
    const sc = scene(rng, 5, MACHINE_BUSINESSES);
    const y = rng.int(2019, 2022);
    const method = rng.pick<Method>(['slm', 'wdv']);
    const r = rng.pick(method === 'slm' ? [10, 12, 15, 20] : [10, 15, 20]);
    const late = rng.int(0, 1); // machine B is bought in the first year (0) or in the second (1)
    const kB = rng.pick([2, 3, 4, 6, 8, 9]);
    const e = rng.pick([3, 4, 6, 8, 9]); // the sale is this many months into the third year
    const soldA = rng.int(0, 1) === 0;
    const monthsA = [12, 12, soldA ? e : 12];
    const monthsB = [12 - kB, ...(late ? [] : [12]), soldA ? 12 : e];
    const costA = pickCost(rng, 200000, 600000, (c) => schedule(c, method, r, monthsA) !== null);
    const costB = pickCost(rng, 120000, 400000, (c) => schedule(c, method, r, monthsB) !== null);
    if (costA === null || costB === null || costA === costB) return null;
    const install = rng.step(4000, 16000, 2000);
    const a = schedule(costA, method, r, monthsA)!;
    const b = schedule(costB, method, r, monthsB)!;
    const nB = monthsB.length;
    const A: Machine = { name: 'A', cost: costA, months: monthsA, life: a, y0: y, open: a.bv[1], last: a.dep[2], bv: a.bv[2] };
    const B: Machine = { name: 'B', cost: costB, months: monthsB, life: b, y0: y + late, open: b.bv[nB - 2], last: b.dep[nB - 1], bv: b.bv[nB - 1] };
    const [gone, kept] = soldA ? [A, B] : [B, A];
    const s = sale(rng, gone.bv, gone.cost);
    if (!s) return null;
    // A distracting fact in most seeds: routine servicing of machine A in the second year, which is an expense.
    const service = rng.int(0, 2) > 0 ? rng.step(3000, 9000, 1000) : 0;
    const kS = rng.pick([1, 5, 7, 10]);
    const saleDate = dateIn(y + 2, e);
    const events: [number, string][] = [
      [0, `1 April ${y}: Bought machine A for ${inr(costA)} by cheque.`],
      [late * 12 + kB, `${dateIn(y + late, kB)}: Bought machine B for ${inr(costB - install)} by cheque and paid ${inr(install)} in cash to install it.`],
      ...(service ? [[12 + kS, `${dateIn(y + 1, kS)}: Paid ${inr(service)} in cash for the routine servicing of machine A.`] as [number, string]] : []),
      [24 + e, `${saleDate}: Machine ${gone.name} was sold for ${inr(s.sold)} ${s.mode.text}.`],
    ];
    return {
      ...sc,
      ...s,
      y,
      method,
      r,
      late,
      kB,
      e,
      soldA,
      install,
      priceB: costB - install,
      A,
      B,
      gone,
      kept,
      service,
      saleDate,
      events: events.sort((p, q) => p[0] - q[0]).map(([, text]) => text),
      /** What a full year's charge on a machine in the third year is worked on: its cost, or its book value on 1 April. */
      base: (m: Machine) => (method === 'slm' ? m.cost : m.open),
    };
  },
  context: (s) => [s.intro, ...s.events, `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`, PERIOD_RULE, direct(s.account)].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const dA = s.A.life.dep[s.late];
        const m = 12 - s.kB;
        return numeric(
          `What is the total depreciation on the two machines for the year ended 31 March ${s.y + s.late + 1}?`,
          dA + s.B.life.dep[0],
          [
            [dA + (s.B.cost * s.r) / 100, `Charged a full year on machine B, although it was in use for only ${m} months of the year.`],
            [dA + (charge(s.priceB, s.r, m) ?? NaN), 'Left the installation charge out of the cost of machine B.'],
            [dA, 'Charged depreciation on machine A only, ignoring the machine bought during the year.'],
            [dA + (charge(s.B.cost, s.r, s.kB) ?? NaN), 'Counted the months before machine B was bought instead of its months of use.'],
            [s.method === 'wdv' && s.late ? (s.A.cost * s.r) / 100 + s.B.life.dep[0] : null, 'Charged machine A on its original cost. Under the written down value method its second year is charged on the reduced balance.'],
          ],
          [
            ...workLines('Machine A', s.A.cost, s.method, s.r, s.y, s.A.months.slice(0, s.late + 1), s.A.life, false).slice(s.method === 'wdv' ? 0 : s.late),
            `Machine B: cost = ${inr(s.priceB)} + ${inr(s.install)} = ${inr(s.B.cost)}; in use for ${m} months: ${s.r}% of ${inr(s.B.cost)} x ${m}/12 = ${inr(s.B.life.dep[0])}.`,
            `Total = ${inr(dA)} + ${inr(s.B.life.dep[0])} = ${inr(dA + s.B.life.dep[0])}.`,
          ],
          H.part,
        );
      },
      verify: (q) => {
        const c = readTwoMachines(q);
        const end = (Math.floor(c.B.from / 12) + 1) * 12;
        return answerIs(q, c.value(c.A, end - 12) - c.value(c.A, end) + c.B.cost - c.value(c.B, end));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const g = s.gone;
        return numeric(
          `What is the book value of machine ${g.name} on ${s.saleDate}, the date of its sale?`,
          g.bv,
          [
            [g.open, 'Left out the depreciation for the months of use in the year of sale.'],
            [g.open - (s.base(g) * s.r) / 100, 'Deducted a full year of depreciation in the year of sale.'],
            [g.cost - g.bv, 'Gave the total depreciation charged on the machine instead of its book value.'],
            [g.open - (charge(s.base(g), s.r, 12 - s.e) ?? NaN), 'Counted the months after the sale instead of the months of use before it.'],
            [g.cost - g.last, 'Deducted only the depreciation of the year of sale from the cost, leaving out the earlier years.'],
            [s.soldA ? null : (schedule(s.priceB, s.method, s.r, g.months)?.bv[g.months.length - 1] ?? null), 'Left the installation charge out of the cost of machine B.'],
            s.method === 'wdv'
              ? [g.cost - (charge(g.cost, s.r, sum(g.months)) ?? g.cost), 'Applied the rate to the original cost throughout, which is the straight line method.']
              : [schedule(g.cost, 'wdv', s.r, g.months)?.bv[g.months.length - 1] ?? null, 'Applied the rate to a reducing balance, although the case charges it on the original cost.'],
          ],
          [
            ...(s.soldA ? [] : [`Cost of machine B = ${inr(s.priceB)} + ${inr(s.install)} = ${inr(s.B.cost)}.`]),
            ...workLines(`Machine ${g.name}`, g.cost, s.method, s.r, g.y0, g.months, g.life, true),
            `Book value on the date of sale = ${inr(g.cost)} - ${inr(g.cost - g.bv)} = ${inr(g.bv)}.`,
          ],
          H.sale,
        );
      },
      verify: (q) => {
        const c = readTwoMachines(q);
        return answerIs(q, c.value(c.gone, c.to));
      },
    },
    {
      kind: 'mcq',
      make: (s) => resultChoice(`Does the sale of machine ${s.gone.name} give a profit or a loss?`, { sold: s.sold, bv: s.gone.bv, cost: s.gone.cost, when: s.saleDate }),
      verify: (q) => {
        const c = readTwoMachines(q);
        return picked(q) === (c.sold > c.value(c.gone, c.to) ? PROFIT : LOSS);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const g = s.gone;
        return numeric(
          `What is the amount of the profit or loss on the sale of machine ${g.name}?`,
          s.gap,
          [
            [Math.abs(s.sold - g.open), 'Left out the depreciation for the months of use in the year of sale.'],
            [Math.abs(s.sold - (g.open - (s.base(g) * s.r) / 100)), 'Charged a full year of depreciation in the year of sale.'],
            [g.cost - s.sold, 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
            [g.cost - g.bv, 'Gave the total depreciation charged on the machine instead of the profit or loss.'],
            [Math.abs(s.sold - (g.open - (charge(s.base(g), s.r, 12 - s.e) ?? NaN))), 'Counted the months after the sale instead of the months of use before it.'],
            [s.soldA ? null : Math.abs(s.sold - (schedule(s.priceB, s.method, s.r, g.months)?.bv[g.months.length - 1] ?? NaN)), 'Left the installation charge out of the cost of machine B.'],
          ],
          [
            `Book value of machine ${g.name} on 1 April ${s.y + 2} = ${inr(g.open)}; depreciation to the date of sale = ${inr(g.last)}.`,
            `Book value on ${s.saleDate} = ${inr(g.open)} - ${inr(g.last)} = ${inr(g.bv)}.`,
            s.profit
              ? `Profit = Selling price - Book value = ${inr(s.sold)} - ${inr(g.bv)} = ${inr(s.gap)}.`
              : `Loss = Book value - Selling price = ${inr(g.bv)} - ${inr(s.sold)} = ${inr(s.gap)}.`,
          ],
          H.sale,
        );
      },
      verify: (q) => {
        const c = readTwoMachines(q);
        return answerIs(q, Math.abs(c.sold - c.value(c.gone, c.to)));
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the sale of machine ${s.gone.name} on ${s.saleDate}. The depreciation up to that date has already been recorded.`,
        lines: s.profit
          ? [dr(s.mode.account, s.sold), cr('machinery', s.gone.bv), cr('profitOnSaleOfAsset', s.gap)]
          : [dr(s.mode.account, s.sold), dr('lossOnSaleOfAsset', s.gap), cr('machinery', s.gone.bv)],
        explanation: [
          `The machine leaves the books at its book value on the date of sale: Machinery A/c is credited with ${inr(s.gone.bv)}.`,
          `${s.mode.account === 'bank' ? 'Bank' : 'Cash'} A/c is debited with the ${inr(s.sold)} received.`,
          s.profit
            ? `The machine fetched ${inr(s.gap)} more than its book value: Profit on Sale of Asset A/c is credited.`
            : `The machine fetched ${inr(s.gap)} less than its book value: Loss on Sale of Asset A/c is debited.`,
        ],
        hints: H.sale,
        distractorAccounts: ['assetDisposal', 'provisionForDepreciation', s.profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset'],
      }),
      verify: (q) => {
        const c = readTwoMachines(q);
        return hasLine(q, 'Dr', 'bank', c.sold) && hasLine(q, 'Cr', 'machinery', c.value(c.gone, c.to));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const g = s.gone;
        const k = s.kept;
        const dK = k.life.dep[k.months.length - 1];
        const baseG = s.base(g);
        return numeric(
          `What is the total depreciation on the two machines for the year ended 31 March ${s.y + 3}?`,
          g.last + dK,
          [
            [dK + (baseG * s.r) / 100, `Charged a full year on machine ${g.name}, although it was in use for only ${s.e} months before the sale.`],
            [dK, `Charged nothing on machine ${g.name}, although it was in use for ${s.e} months before it was sold.`],
            [g.last, `Charged machine ${g.name} only, leaving out the full year on machine ${k.name}.`],
            [dK + (charge(baseG, s.r, 12 - s.e) ?? NaN), `Counted the months after the sale of machine ${g.name} instead of its months of use.`],
            s.method === 'wdv'
              ? [(k.cost * s.r) / 100 + (charge(g.cost, s.r, s.e) ?? NaN), `Applied the rate to the original cost of the machines. The written down value method uses their book values on 1 April ${s.y + 2}.`]
              : [(k.open * s.r) / 100 + (charge(g.open, s.r, s.e) ?? NaN), 'Applied the rate to the book values of the machines, although the case charges it on the original cost.'],
          ],
          [
            s.method === 'wdv'
              ? `Book values on 1 April ${s.y + 2}: machine ${g.name} ${inr(g.open)}, machine ${k.name} ${inr(k.open)}.`
              : `The rate is charged on cost: machine ${g.name} ${inr(g.cost)}, machine ${k.name} ${inr(k.cost)}.`,
            `Machine ${g.name}, 1 April ${s.y + 2} to the date of sale (${s.e} months): ${s.r}% of ${inr(baseG)} x ${s.e}/12 = ${inr(g.last)}.`,
            `Machine ${k.name}, full year: ${s.r}% of ${inr(s.base(k))} = ${inr(dK)}.`,
            `Total = ${inr(g.last)} + ${inr(dK)} = ${inr(g.last + dK)}.`,
          ],
          H.part,
        );
      },
      verify: (q) => {
        const c = readTwoMachines(q);
        return answerIs(q, c.value(c.gone, c.end - 12) - c.value(c.gone, c.to) + c.value(c.kept, c.end - 12) - c.value(c.kept, c.end));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const g = s.gone;
        const k = s.kept;
        return numeric(
          `What is the balance of Machinery A/c on 31 March ${s.y + 3}?`,
          k.bv,
          [
            [k.cost, `Showed machine ${k.name} at its cost, although depreciation is credited to Machinery A/c itself.`],
            [k.bv + g.bv, `Left the book value of machine ${g.name} in the account. It leaves the account on the date of sale.`],
            [k.bv + g.bv - s.sold, `Credited Machinery A/c with the sale proceeds only, leaving the ${s.profit ? 'profit' : 'loss'} on sale inside the account.`],
            [k.open, `Left out the depreciation of the year ended 31 March ${s.y + 3}.`],
            [s.service ? k.bv + s.service : null, 'Added the servicing charge to Machinery A/c. Routine servicing is an expense of the year.'],
          ],
          [
            `Machine ${g.name} left the account on ${s.saleDate}, so only machine ${k.name} remains.`,
            ...(k.name === 'B' ? [`Cost of machine B = ${inr(s.priceB)} + ${inr(s.install)} = ${inr(s.B.cost)}.`] : []),
            ...workLines(`Machine ${k.name}`, k.cost, s.method, s.r, k.y0, k.months, k.life, false),
            `Balance of Machinery A/c = ${inr(k.cost)} - ${inr(k.cost - k.bv)} = ${inr(k.bv)}.`,
          ],
          H.account,
        );
      },
      verify: (q) => {
        const c = readTwoMachines(q);
        return answerIs(q, c.value(c.kept, c.end));
      },
    },
  ],
});

interface Bought {
  cost: number;
  /** The month of purchase, counted from 1 April 2000. */
  from: number;
}
/** Case 4 read back from its text: both machines, which one was sold and when, and the end of the third year. */
function readTwoMachines(q: { context?: string }) {
  const rule = lineWith(q, 'Depreciation:');
  const lineA = lineWith(q, 'Bought machine A');
  const lineB = lineWith(q, 'Bought machine B');
  const sold = lineWith(q, 'was sold for');
  const A: Bought = { cost: amountsIn(lineA)[0], from: monthOf(lineA) };
  const B: Bought = { cost: sum(amountsIn(lineB)), from: monthOf(lineB) };
  const soldA = sold.includes('Machine A');
  return {
    A,
    B,
    gone: soldA ? A : B,
    kept: soldA ? B : A,
    to: monthOf(sold),
    sold: amountsIn(sold)[0],
    end: A.from + 36,
    /** The book value of a machine at a month. */
    value: (m: Bought, at: number) => bookValue(m.cost, methodOf(rule), rateOf(rule), m.from, at),
  };
}

// ===============================================================================================================
// 5. MEDIUM: the two methods compared on the same asset over three years
// ===============================================================================================================

const M1_LESS = 'Method 1, because it charges less depreciation in that year';
const M2_LESS = 'Method 2, because it charges less depreciation in that year';
const M1_MORE = 'Method 1, because it charges more depreciation in that year';
const M2_MORE = 'Method 2, because it charges more depreciation in that year';
const SAME_CHARGE = 'Neither: both methods charge the same amount in that year';

const methodsCompared = caseTemplate({
  id: 'case-asset-methods-compared',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Two methods on the same asset',
  setup: (rng) => {
    const sc = scene(rng, 3);
    const y = rng.int(2020, 2023);
    // The straight line method is given as a rate in most seeds and as a life and a scrap value in the others.
    const byLife = rng.int(0, 2) === 0;
    const [rS, rW] = byLife ? [0, rng.pick([15, 20, 25, 30])] : rng.pick([[10, 10], [15, 15], [20, 20], [10, 20], [10, 15], [15, 25], [15, 20], [20, 30]]);
    const life = rng.pick([5, 8, 10]);
    const ask = rng.int(2, 3); // the year whose written down value charge is asked first
    const bvOf = rng.int(1, 2); // the method whose book value is asked
    // With a life, the scrap value is a tenth of the cost.
    const slmYear = (c: number) => (byLife ? (c % (10 * life) === 0 ? (c * 9) / (10 * life) : null) : charge(c, rS));
    const cost = pickCost(rng, 200000, 800000, (c) => slmYear(c) !== null && schedule(c, 'wdv', rW, [12, 12, 12]) !== null);
    if (cost === null) return null;
    const dS = slmYear(cost)!;
    const w = schedule(cost, 'wdv', rW, [12, 12, 12])!;
    const bvS = cost - 3 * dS;
    const bvW = w.bv[2];
    if (bvS <= 0 || bvS === bvW || dS === w.dep[2]) return null;
    return { ...sc, y, byLife, rS, rW, life, scrap: byLife ? cost / 10 : 0, ask, bvOf, cost, dS, w, bvS, bvW };
  },
  context: (s) =>
    [
      s.intro,
      `1 April ${s.y}: Bought ${s.biz.item} for ${inr(s.cost)} and put it to use the same day.`,
      `${s.owner} compares two methods of depreciation for its first three years:`,
      s.byLife
        ? `Method 1: straight line method, with a life of ${s.life} years and a scrap value of ${inr(s.scrap)}.`
        : `Method 1: ${s.rS}% a year ${METHOD_TEXT.slm}.`,
      `Method 2: ${s.rW}% a year ${METHOD_TEXT.wdv}.`,
      'Every year is a full year of use.',
      `Under either method the depreciation is credited to ${s.account} A/c itself.`,
      'Sales and all other expenses are the same whichever method is used.',
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `Under Method 2, what is the depreciation for the year ended 31 March ${s.y + s.ask}?`,
          s.w.dep[s.ask - 1],
          [
            [(s.cost * s.rW) / 100, 'Applied the rate to the original cost instead of the book value at the start of the year.'],
            [s.w.bv[s.ask - 1], 'Gave the book value at the end of that year instead of the depreciation.'],
            [s.w.dep[s.ask - 2], "Gave the previous year's depreciation."],
            [s.dS, 'Gave the yearly charge of Method 1.'],
            [s.cost - s.w.bv[s.ask - 1], 'Gave the total depreciation up to that date instead of the charge of that one year.'],
          ],
          workLines('', s.cost, 'wdv', s.rW, s.y, Array<number>(s.ask).fill(12), s.w, false),
          H.wdv,
        ),
      verify: (q) => {
        const c = readMethodsCompared(q);
        const n = intIn(q.prompt, /31 March (\d{4})/) - c.year;
        return answerIs(q, c.cost * Math.pow(1 - c.rW / 100, n - 1) * (c.rW / 100));
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: "Suppose Method 1 is chosen. Pass the journal entry for one year's depreciation.",
        lines: [dr('depreciation', s.dS), cr(s.biz.asset, s.dS)],
        explanation: [
          s.byLife
            ? `Yearly depreciation = (Cost - Scrap value) / Life = (${inr(s.cost)} - ${inr(s.scrap)}) / ${s.life} = ${inr(s.dS)}.`
            : `Yearly depreciation = ${s.rS}% of ${inr(s.cost)} = ${inr(s.dS)}, the same every year.`,
          'Depreciation is an expense, so Depreciation A/c is debited.',
          `It is credited to ${s.account} A/c itself.`,
        ],
        hints: H.slm,
        distractorAccounts: ['provisionForDepreciation', 'repairs'],
      }),
      verify: (q) => hasLine(q, 'Dr', 'depreciation', readMethodsCompared(q).dS),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `Under Method 2, what is the total depreciation for the three years to 31 March ${s.y + 3}?`,
          s.cost - s.bvW,
          [
            [(3 * s.cost * s.rW) / 100, 'Charged the rate on the original cost in all three years, as the straight line method does.'],
            [s.bvW, 'Gave the book value after three years instead of the depreciation charged.'],
            [s.w.dep[0] + s.w.dep[1], 'Added the depreciation of two years only.'],
            [3 * s.dS, 'Gave the total under Method 1.'],
          ],
          [...workLines('', s.cost, 'wdv', s.rW, s.y, [12, 12, 12], s.w, false), `Total = ${s.w.dep.map(inr).join(' + ')} = ${inr(s.cost - s.bvW)}.`],
          H.wdv,
        ),
      verify: (q) => {
        const c = readMethodsCompared(q);
        return answerIs(q, c.cost * (1 - Math.pow(1 - c.rW / 100, 3)));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const d1 = s.w.dep[0];
        const more = 'Took a larger expense to mean a larger profit. Depreciation is an expense, so the method that charges more shows less profit.';
        const prompt = `Which method shows the higher profit for the first year, the year ended 31 March ${s.y + 1}?`;
        const charges = `In the first year Method 1 charges ${inr(s.dS)} and Method 2 charges ${s.rW}% of ${inr(s.cost)} = ${inr(d1)}.`;
        if (s.dS === d1) {
          return choice(
            prompt,
            SAME_CHARGE,
            [
              [M1_LESS, 'Thought the straight line charge is the lower one in the first year. Both methods apply the same rate to the full cost in that year.'],
              [M2_LESS, 'Thought the written down value charge is already lower in the first year. Its base in the first year is the full cost.'],
              [M1_MORE, 'Took the straight line charge to be the larger one in the first year, and a larger expense to mean a larger profit.'],
              [M2_MORE, 'Took the written down value charge to be the larger one in the first year, and a larger expense to mean a larger profit.'],
            ],
            `${charges} The charges are equal, so the profit is the same. They differ only from the second year.`,
            H.compare,
          );
        }
        const one = s.dS < d1; // Method 1 charges less, so it shows the higher profit
        return choice(
          prompt,
          one ? M1_LESS : M2_LESS,
          [
            [one ? M2_LESS : M1_LESS, `Took Method ${one ? 2 : 1} to have the smaller charge in the first year. Work out both charges on the cost of ${inr(s.cost)}.`],
            [one ? M2_MORE : M1_MORE, more],
            [one ? M1_MORE : M2_MORE, `Took Method ${one ? 1 : 2} to have the larger charge, and a larger expense to mean a larger profit.`],
            [SAME_CHARGE, 'Assumed that the two methods always charge the same in the first year. That holds only when both work out to the same amount on the cost.'],
          ],
          `${charges} Method ${one ? 1 : 2} charges less, and a smaller expense leaves a higher profit.`,
          H.compare,
        );
      },
      verify: (q) => {
        const c = readMethodsCompared(q);
        const d1 = (c.cost * c.rW) / 100;
        return picked(q) === (near(c.dS, d1) ? SAME_CHARGE : c.dS < d1 ? M1_LESS : M2_LESS);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        s.bvOf === 1
          ? numeric(
              `Under Method 1, what is the book value of ${s.biz.short} on 31 March ${s.y + 3}?`,
              s.bvS,
              [
                [3 * s.dS, 'Gave the total depreciation of the three years instead of the book value.'],
                [s.cost - s.dS, 'Deducted the depreciation of one year only.'],
                [s.byLife ? s.scrap : null, 'Gave the scrap value, which is reached only at the end of the whole life.'],
                [s.byLife ? s.cost - (3 * s.cost) / s.life : null, 'Divided the whole cost by the life without first deducting the scrap value.'],
                [s.byLife ? null : s.cost * Math.pow(1 - s.rS / 100, 3), 'Applied the rate to a reducing balance, which is not the straight line method.'],
                [s.cost - 2 * s.dS, 'Stopped a year early, after two years of depreciation.'],
                [s.bvW, 'Gave the book value under Method 2.'],
              ],
              [`Yearly depreciation under Method 1 = ${inr(s.dS)}.`, `Book value = ${inr(s.cost)} - 3 x ${inr(s.dS)} = ${inr(s.bvS)}.`],
              H.slm,
            )
          : numeric(
              `Under Method 2, what is the book value of ${s.biz.short} on 31 March ${s.y + 3}?`,
              s.bvW,
              [
                [s.cost - (3 * s.cost * s.rW) / 100, 'Charged the rate on the original cost every year, which is the straight line method.'],
                [s.cost - s.bvW, 'Gave the total depreciation of the three years instead of the book value.'],
                [s.w.bv[1], 'Stopped a year early, after two years of depreciation.'],
                [s.bvS, 'Gave the book value under Method 1.'],
              ],
              workLines('', s.cost, 'wdv', s.rW, s.y, [12, 12, 12], s.w, false),
              H.wdv,
            ),
      verify: (q) => {
        const c = readMethodsCompared(q);
        return answerIs(q, q.prompt.includes('Method 1') ? c.cost - 3 * c.dS : c.cost * Math.pow(1 - c.rW / 100, 3));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `On 31 March ${s.y + 3}, by how much is the book value under one method more than the book value under the other?`,
          Math.abs(s.bvS - s.bvW),
          [
            [Math.abs(s.dS - s.w.dep[2]), 'Compared only the third-year charges of the two methods instead of the two book values.'],
            [Math.abs(2 * s.dS - s.w.dep[0] - s.w.dep[1]), 'Compared the depreciation of the first two years only.'],
            [s.bvW, 'Gave the book value under Method 2 instead of the difference.'],
            [s.bvS, 'Gave the book value under Method 1 instead of the difference.'],
            [Math.abs(s.dS - s.w.dep[0]), 'Compared only the first-year charges of the two methods instead of the two book values.'],
          ],
          [
            `Method 1: ${inr(s.cost)} - 3 x ${inr(s.dS)} = ${inr(s.bvS)}.`,
            `Method 2: ${inr(s.cost)} - (${s.w.dep.map(inr).join(' + ')}) = ${inr(s.bvW)}.`,
            `Difference = ${inr(Math.max(s.bvS, s.bvW))} - ${inr(Math.min(s.bvS, s.bvW))} = ${inr(Math.abs(s.bvS - s.bvW))}. Method ${s.bvS > s.bvW ? 1 : 2} leaves the higher book value.`,
          ],
          ['Find the book value after three years under each method.', 'Book value = cost - depreciation charged so far. Take the smaller book value from the larger.'],
        ),
      verify: (q) => {
        const c = readMethodsCompared(q);
        return answerIs(q, Math.abs(c.cost - 3 * c.dS - c.cost * Math.pow(1 - c.rW / 100, 3)));
      },
    },
  ],
});

/** Case 5 read back from its text: the cost, the yearly charge of Method 1 and the rate of Method 2. */
function readMethodsCompared(q: { context?: string }): { cost: number; dS: number; rW: number; year: number } {
  const bought = lineWith(q, 'Bought');
  const one = lineWith(q, 'Method 1:');
  const cost = amountsIn(bought)[0];
  const dS = one.includes('% a year') ? (cost * rateOf(one)) / 100 : (cost - amountsIn(one)[0]) / intIn(one, /life of (\d+) years/);
  return { cost, dS, rW: rateOf(lineWith(q, 'Method 2:')), year: intIn(bought, /1 April (\d{4})/) };
}

// ===============================================================================================================
// 6. MEDIUM: what is capitalised and what is an expense, then depreciation on the correct cost
// ===============================================================================================================

const capitalOrExpense = caseTemplate({
  id: 'case-asset-capital-or-expense',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Added to the cost, or an expense?',
  setup: (rng) => {
    const sc = scene(rng, 4, MACHINE_BUSINESSES);
    const y = rng.int(2020, 2023);
    // Either a second-hand machine that is overhauled before use, or a new one that gets an addition later.
    const used = rng.int(0, 1) === 0;
    const method: Method = used ? rng.pick<Method>(['slm', 'wdv']) : 'slm';
    const r = rng.pick([10, 15, 20]);
    const k = rng.pick(used ? [3, 4, 6, 8] : [0, 3, 4, 6, 8]); // the second-hand machine always has a part first year
    const kR = rng.int(k + 1, 11); // routine repairs later in the first year
    const kA = rng.pick([3, 6, 9]); // the addition, in the second year
    const m = 12 - k;
    const start = pickCost(rng, 200000, 600000, (c) => schedule(c, method, r, [m, 12]) !== null);
    if (start === null) return null;
    const install = rng.step(4000, 12000, 1000);
    const overhaul = used ? rng.step(20000, 60000, 4000) : 0;
    const price = start - install - overhaul;
    const repairsDrawn = rng.step(3000, 9000, 1000);
    const repairs = repairsDrawn === install ? repairsDrawn + 1000 : repairsDrawn; // never the same figure as the installation
    const drawn = rng.step(40000, 120000, 20000);
    const added = used ? 0 : drawn;
    const first = schedule(start, method, r, [m, 12])!;
    const dAdd = added ? charge(added, r, 12 - kA) : 0;
    if (dAdd === null) return null;
    /** The balance of Machinery A/c after two years when the machine starts at `c0` and `add` is fitted in the second year. */
    const balance = (c0: number, add: number, addMonths = 12 - kA): number | null => {
      const s0 = schedule(c0, method, r, [m, 12]);
      const dA = add ? charge(add, r, addMonths) : 0;
      return s0 === null || dA === null ? null : s0.bv[1] + add - dA;
    };
    return {
      ...sc, y, used, method, r, k, kR, kA, m, start, install, overhaul, price, repairs, added, first, dAdd,
      d1: first.dep[0],
      d2: first.dep[1] + dAdd,
      end: first.bv[1] + added - dAdd,
      balance,
      thing: sc.biz.item.replace(/^an? /, ''),
    };
  },
  context: (s) =>
    [
      s.intro,
      `${dateIn(s.y, s.k)}: Bought a ${s.used ? 'second-hand' : 'new'} ${s.thing} for ${inr(s.price)} by cheque.`,
      s.used
        ? `${dateIn(s.y, s.k)}: Paid ${inr(s.overhaul)} to overhaul it and ${inr(s.install)} to install it, by cheque.`
        : `${dateIn(s.y, s.k)}: Paid ${inr(s.install)} to install it, by cheque.`,
      s.used ? 'The machine could not be used without the overhaul. It was put to use the same day.' : 'The machine was put to use the same day.',
      `${dateIn(s.y, s.kR)}: Paid ${inr(s.repairs)} in cash for routine repairs to the machine.`,
      ...(s.added
        ? [
            `${dateIn(s.y + 1, s.kA)}: Fitted an automatic feeder to the machine for ${inr(s.added)}, paid by cheque.`,
            'The feeder raises the output of the machine and was put to use the same day.',
          ]
        : []),
      `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`,
      'It is charged for the period of use, in whole months, from the date of purchase.',
      ...(s.added ? ['The feeder is depreciated at the same rate on its own cost, from the date it was fitted.'] : []),
      direct(s.account),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        choice(
          'Which of these payments is charged as an expense of the year instead of being added to the cost of the machine?',
          `${inr(s.repairs)} for routine repairs`,
          [
            s.used
              ? [`${inr(s.overhaul)} for the overhaul`, 'Treated the overhaul as an ordinary repair. A second-hand machine that cannot be used without it is not ready for use until it is done, so it is part of the cost.']
              : [`${inr(s.added)} for the automatic feeder`, 'Treated the feeder as a repair. It adds to what the machine can produce, so it is added to the cost.'],
            [`${inr(s.install)} for installation`, 'Treated installation as a running expense. It is a cost of bringing the machine into use.'],
            ['None of them: every payment on a machine is added to its cost', 'Capitalised the routine repairs. They only keep the machine in the condition it was already in, so they are an expense of the year.'],
            [`${inr(s.price)} paid for the machine itself`, 'Treated the purchase price as an expense. It is the main part of the cost of the asset.'],
          ],
          `Routine repairs only keep the machine working as before, so the ${inr(s.repairs)} is an expense of the year. Payments that bring the machine into use, or add to what it can do, are added to its cost.`,
          H.cost,
        ),
    },
    {
      kind: 'journal',
      make: (s) =>
        s.used
          ? {
              prompt: `Pass one journal entry for the overhaul and installation charges paid on ${dateIn(s.y, s.k)}.`,
              lines: [dr('machinery', s.overhaul + s.install), cr('bank', s.overhaul + s.install)],
              explanation: [
                `Both payments were needed before the machine could be used, so they are added to its cost: Machinery A/c is debited with ${inr(s.overhaul)} + ${inr(s.install)} = ${inr(s.overhaul + s.install)}.`,
                'They were paid by cheque, so Bank A/c is credited.',
              ],
              hints: H.cost,
              distractorAccounts: ['repairs', 'cash'],
            }
          : {
              prompt: `Pass the journal entry for the automatic feeder fitted on ${dateIn(s.y + 1, s.kA)}.`,
              lines: [dr('machinery', s.added), cr('bank', s.added)],
              explanation: [
                `The feeder adds to what the machine can produce, so it is added to the cost: Machinery A/c is debited with ${inr(s.added)}.`,
                'It was paid for by cheque, so Bank A/c is credited.',
              ],
              hints: H.cost,
              distractorAccounts: ['repairs', 'cash'],
            },
      verify: (q) => {
        const feeder = lineWith(q, 'Fitted an automatic feeder');
        return hasLine(q, 'Dr', 'machinery', feeder ? amountsIn(feeder)[0] : sum(amountsIn(lineWith(q, 'to install it'))));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `At what cost is the machine recorded in Machinery A/c when it is put to use on ${dateIn(s.y, s.k)}?`,
          s.start,
          [
            [s.price, s.used ? 'Recorded only the price paid to the seller and treated the overhaul and the installation as expenses.' : 'Recorded only the price paid to the seller and treated the installation as an expense.'],
            [s.used ? s.price + s.install : null, 'Treated the overhaul as a repair expense. It was needed to bring the machine into working order, so it is added to the cost.'],
            [s.used ? s.price + s.overhaul : null, 'Left out the installation charge, which is also a cost of bringing the machine into use.'],
            [s.start + s.repairs, 'Added the routine repairs, which are an expense of the year and were paid only later.'],
            [s.added ? s.start + s.added : null, `Added the feeder, which was fitted only on ${dateIn(s.y + 1, s.kA)}. It joins the cost from that date.`],
          ],
          [
            'Cost = purchase price + every payment needed to bring the machine into use.',
            s.used
              ? `${inr(s.price)} + ${inr(s.overhaul)} + ${inr(s.install)} = ${inr(s.start)}.`
              : `${inr(s.price)} + ${inr(s.install)} = ${inr(s.start)}.`,
          ],
          H.cost,
        ),
      verify: (q) => answerIs(q, readCapitalOrExpense(q).start),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What is the depreciation for the year ended 31 March ${s.y + 1}?`,
          s.d1,
          [
            [s.k ? (s.start * s.r) / 100 : null, `Charged a full year although the machine was in use for only ${s.m} months of the year.`],
            [charge(s.price, s.r, s.m), s.used ? 'Charged depreciation on the purchase price alone, leaving the overhaul and the installation out of the cost.' : 'Charged depreciation on the purchase price alone, leaving the installation out of the cost.'],
            [s.used ? charge(s.price + s.install, s.r, s.m) : null, 'Left the overhaul out of the cost, treating it as a repair expense.'],
            [charge(s.start + s.repairs, s.r, s.m), 'Added the routine repairs to the cost and charged depreciation on them.'],
            [s.k ? charge(s.start, s.r, s.k) : null, 'Counted the months before the purchase instead of the months of use.'],
            [s.added ? charge(s.start + s.added, s.r, s.m) : null, `Charged depreciation on the feeder as well, although it was fitted only on ${dateIn(s.y + 1, s.kA)}.`],
            [s.start - s.d1, `Gave the book value on 31 March ${s.y + 1} instead of the depreciation of the year.`],
          ],
          [
            `Cost = ${inr(s.start)}.`,
            s.k
              ? `${dateIn(s.y, s.k)} to 31 March ${s.y + 1} is ${s.m} months: ${s.r}% of ${inr(s.start)} x ${s.m}/12 = ${inr(s.d1)}.`
              : `A full year of use: ${s.r}% of ${inr(s.start)} = ${inr(s.d1)}.`,
          ],
          H.part,
        ),
      verify: (q) => {
        const c = readCapitalOrExpense(q);
        return answerIs(q, c.start - c.value(c.yearEnd));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `What total amount is charged as an expense of the year ended 31 March ${s.y + 1} on account of the machine: its depreciation and any payment that is not added to its cost?`,
          s.d1 + s.repairs,
          [
            [s.d1, 'Left out the routine repairs, which are an expense of the year.'],
            [s.repairs, 'Gave the repairs only. The depreciation of the year is also an expense.'],
            s.used
              ? [(charge(s.price + s.install, s.r, s.m) ?? NaN) + s.repairs + s.overhaul, 'Charged the overhaul to the year as an expense. It is part of the cost and reaches the expenses only through depreciation.']
              : [(charge(s.price, s.r, s.m) ?? NaN) + s.repairs + s.install, 'Charged the installation to the year as an expense. It is part of the cost and reaches the expenses only through depreciation.'],
            [charge(s.start + s.repairs, s.r, s.m), 'Added the routine repairs to the cost, so that only a part of them reached the expenses as depreciation.'],
            [s.k ? (s.start * s.r) / 100 + s.repairs : null, `Charged a full year of depreciation although the machine was in use for only ${s.m} months of the year.`],
          ],
          [
            `Depreciation for the year = ${inr(s.d1)}.`,
            `Routine repairs, which are not added to the cost = ${inr(s.repairs)}.`,
            `Total expense = ${inr(s.d1)} + ${inr(s.repairs)} = ${inr(s.d1 + s.repairs)}.`,
          ],
          ['Two kinds of expense arise on the machine in the year: its depreciation, and any payment that only keeps it working.', 'A payment added to the cost is not an expense of the year; it reaches the expenses only through depreciation.'],
        ),
      verify: (q) => {
        const c = readCapitalOrExpense(q);
        return answerIs(q, c.start - c.value(c.yearEnd) + c.repairs);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const mA = 12 - s.kA;
        const full = (s.start * s.r) / 100;
        return numeric(
          `What is the depreciation for the year ended 31 March ${s.y + 2}?`,
          s.d2,
          s.added
            ? [
                [full, 'Ignored the feeder, which is depreciated from the date it is put to use.'],
                [full + (s.added * s.r) / 100, `Charged a full year on the feeder, although it was in use for only ${mA} months of the year.`],
                [full + (charge(s.added, s.r, s.kA) ?? NaN), 'Counted the months before the feeder was fitted instead of its months of use.'],
                [s.k ? s.d1 + s.dAdd : null, 'Repeated the part-year charge on the machine. The second year is a full year for it.'],
                [s.dAdd, 'Gave the charge on the feeder alone, leaving out the full year on the machine.'],
              ]
            : s.method === 'slm'
              ? [
                  [s.k ? s.d1 : null, 'Repeated the part-year charge. The second year is a full year.'],
                  [charge(s.start - s.d1, s.r), 'Applied the rate to the reduced balance, although the case charges it on the original cost.'],
                  [charge(s.price, s.r), 'Charged depreciation on the purchase price alone, leaving the overhaul and the installation out of the cost.'],
                  [charge(s.start + s.repairs, s.r), 'Added the routine repairs to the cost and charged depreciation on them.'],
                ]
              : [
                  [full, 'Applied the rate to the original cost instead of the book value at the start of the year.'],
                  [s.k ? s.d1 : null, 'Repeated the part-year charge. The second year is a full year on the reduced balance.'],
                  [s.first.bv[1], 'Gave the book value at the end of the year instead of the depreciation.'],
                  [charge(s.start + s.repairs - (charge(s.start + s.repairs, s.r, s.m) ?? NaN), s.r), 'Added the routine repairs to the cost and charged depreciation on them.'],
                ],
          s.added
            ? [
                `Machine: ${s.r}% of ${inr(s.start)} = ${inr(s.first.dep[1])} for the full year.`,
                `Feeder: ${dateIn(s.y + 1, s.kA)} to 31 March ${s.y + 2} is ${mA} months: ${s.r}% of ${inr(s.added)} x ${mA}/12 = ${inr(s.dAdd)}.`,
                `Total = ${inr(s.first.dep[1])} + ${inr(s.dAdd)} = ${inr(s.d2)}.`,
              ]
            : s.method === 'slm'
              ? [`The second year is a full year: ${s.r}% of the cost of ${inr(s.start)} = ${inr(s.d2)}.`]
              : [`Book value on 1 April ${s.y + 1} = ${inr(s.start)} - ${inr(s.d1)} = ${inr(s.first.bv[0])}.`, `Depreciation = ${s.r}% of ${inr(s.first.bv[0])} = ${inr(s.d2)}.`],
          s.method === 'wdv' ? H.wdv : H.part,
        );
      },
      verify: (q) => {
        const c = readCapitalOrExpense(q);
        return answerIs(q, c.value(c.yearEnd) - c.value(c.yearEnd + 12) + c.added - c.addedValue(c.yearEnd + 12));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const withRepairs = s.balance(s.start + s.repairs, s.added);
        return numeric(
          `What is the balance of Machinery A/c on 31 March ${s.y + 2}?`,
          s.end,
          [
            [s.start + s.added, 'Showed the machine at its cost, although depreciation is credited to Machinery A/c itself.'],
            [s.d1 + s.d2, 'Gave the total depreciation of the two years instead of the balance of the account.'],
            withRepairs !== null
              ? [withRepairs, 'Added the routine repairs to Machinery A/c and depreciated them. They are an expense of the year in which they are paid.']
              : [s.end + s.repairs, 'Debited the routine repairs to Machinery A/c. They are an expense of the year in which they are paid.'],
            [s.used ? s.balance(s.price + s.install, 0) : null, 'Kept the overhaul out of Machinery A/c, treating it as a repair expense.'],
            [s.added ? s.balance(s.start, 0) : null, 'Kept the feeder out of Machinery A/c, treating it as a repair expense.'],
            [s.added ? s.balance(s.start, s.added, 12) : null, 'Charged a full year of depreciation on the feeder in the year it was fitted.'],
            [s.first.bv[0] + s.added, `Left out the depreciation of the year ended 31 March ${s.y + 2}.`],
          ],
          [
            `Cost on ${dateIn(s.y, s.k)} = ${inr(s.start)}${s.added ? `; feeder added on ${dateIn(s.y + 1, s.kA)} = ${inr(s.added)}` : ''}.`,
            `Depreciation: ${inr(s.d1)} for the year ended 31 March ${s.y + 1} and ${inr(s.d2)} for the year ended 31 March ${s.y + 2}.`,
            `Balance = ${inr(s.start + s.added)} - ${inr(s.d1)} - ${inr(s.d2)} = ${inr(s.end)}.`,
          ],
          H.account,
        );
      },
      verify: (q) => {
        const c = readCapitalOrExpense(q);
        return answerIs(q, c.value(c.yearEnd + 12) + c.addedValue(c.yearEnd + 12));
      },
    },
  ],
});

/** Case 6 read back from its text: what is capitalised at the start, the addition (if any) and the repairs. */
function readCapitalOrExpense(q: { context?: string }) {
  const bought = lineWith(q, 'Bought');
  const rule = lineWith(q, 'Depreciation:');
  const feeder = lineWith(q, 'Fitted an automatic feeder');
  const start = amountsIn(bought)[0] + sum(amountsIn(lineWith(q, 'to install it')));
  const from = monthOf(bought);
  const added = feeder ? amountsIn(feeder)[0] : 0;
  return {
    start,
    added,
    repairs: amountsIn(lineWith(q, 'routine repairs'))[0],
    /** The end of the first accounting year. */
    yearEnd: (Math.floor(from / 12) + 1) * 12,
    value: (at: number) => bookValue(start, methodOf(rule), rateOf(rule), from, at),
    addedValue: (at: number) => (feeder ? bookValue(added, methodOf(rule), rateOf(rule), monthOf(feeder), at) : 0),
  };
}

// ===============================================================================================================
// 7. COMPLEX: the method and the rate found from the figures, then the story carried on to the sale
// ===============================================================================================================

const SLM_SAME = 'Straight line method, as the yearly charge is the same';
const SLM_FALLS = 'Straight line method, as the yearly charge falls';
const WDV_FALLS = 'Written down value method, as the yearly charge falls';
const WDV_SAME = 'Written down value method, as the yearly charge is the same';

/** A rate in percent, with its wrong answers rounded to two decimal places (the unit counts hundredths of a percent). */
function percent(prompt: string, answer: number, errs: [number, string][], explanation: string[], hints: string[]): NumericParts | null {
  const seen = new Set([answer * 100]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [raw, why] of errs) {
    const v = Math.round(raw * 100);
    if (!Number.isFinite(raw) || v <= 0 || seen.has(v)) continue;
    seen.add(v);
    commonErrors.push({ value: v, why });
  }
  return commonErrors.length >= 2 ? { prompt, answer: answer * 100, commonErrors, explanation, hints } : null;
}

const missingFigure = caseTemplate({
  id: 'case-asset-missing-figure',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Working back to the rate',
  setup: (rng) => {
    const sc = scene(rng, 6);
    const y = rng.int(2019, 2022);
    // What the books show: two yearly charges (the cost is not known), or the cost and two year-end balances.
    const kind = rng.pick(['wdvCharges', 'wdvValues', 'slmValues'] as const);
    const method: Method = kind === 'slmValues' ? 'slm' : 'wdv';
    const r = rng.pick(method === 'slm' ? [8, 10, 12, 15] : [10, 15, 20, 25]);
    const life = rng.pick(({ 8: [10, 12], 10: [8, 9], 12: [7, 8], 15: [6] } as Record<number, number[]>)[r] ?? [5]); // leaves a scrap value of 4% to 20%
    const e = rng.pick([3, 4, 6, 8, 9]);
    const months = [12, 12, 12, e];
    const cost = pickCost(rng, 200000, 800000, (c) => schedule(c, method, r, months) !== null && (method === 'wdv' || (c * r * life) % 100 === 0));
    if (cost === null) return null;
    const life4 = schedule(cost, method, r, months)!;
    const s = sale(rng, life4.bv[3], cost);
    if (!s) return null;
    return { ...sc, ...s, y, kind, method, r, life, e, months, cost, sched: life4, d1: life4.dep[0], d2: life4.dep[1], d3: life4.dep[2], open: life4.bv[2], last: life4.dep[3], bv: life4.bv[3], scrap: cost - (cost * r * life) / 100, saleDate: dateIn(y + 3, e) };
  },
  context: (s) =>
    [
      s.intro,
      s.kind === 'wdvCharges'
        ? `1 April ${s.y}: Bought ${s.biz.item} by cheque. Its cost is not given.`
        : `1 April ${s.y}: Bought ${s.biz.item} for ${inr(s.cost)} by cheque.`,
      'Depreciation is charged at a fixed rate a year, by the same method every year.',
      direct(s.account),
      ...(s.kind === 'wdvCharges'
        ? [`Depreciation written off from ${s.account} A/c in the first two years:`, `Year ended 31 March ${s.y + 1}: ${inr(s.d1)}`, `Year ended 31 March ${s.y + 2}: ${inr(s.d2)}`]
        : [`The balance of ${s.account} A/c has been:`, `On 31 March ${s.y + 1}: ${inr(s.sched.bv[0])}`, `On 31 March ${s.y + 2}: ${inr(s.sched.bv[1])}`]),
      ...(s.kind === 'slmValues' ? [`${cap(s.biz.short)} is expected to be used for ${s.life} years in all and then sold as scrap.`] : []),
      'In a year of sale, depreciation is charged for the whole months of use up to the date of sale.',
      `${s.saleDate}: ${cap(s.biz.short)} was sold for ${inr(s.sold)} ${s.mode.text}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const charges = s.kind === 'wdvCharges'
          ? `The charges are ${inr(s.d1)} and then ${inr(s.d2)}.`
          : `The charges are ${inr(s.cost)} - ${inr(s.sched.bv[0])} = ${inr(s.d1)} and then ${inr(s.sched.bv[0])} - ${inr(s.sched.bv[1])} = ${inr(s.d2)}.`;
        const prompt = `Which method of depreciation is being used on ${s.biz.short}?`;
        return s.method === 'wdv'
          ? choice(
              prompt,
              WDV_FALLS,
              [
                [SLM_FALLS, 'Linked a falling charge to the straight line method, which writes off the same amount every year.'],
                [SLM_SAME, `Took the two yearly charges to be equal. They are ${inr(s.d1)} and ${inr(s.d2)}.`],
                [WDV_SAME, 'Took the two yearly charges to be equal, and linked an equal charge to the written down value method, whose charge falls every year.'],
              ],
              `${charges} A fixed rate that gives a smaller charge each year is being applied to a reducing balance: the written down value method.`,
              H.wdv,
            )
          : choice(
              prompt,
              SLM_SAME,
              [
                [WDV_SAME, 'Linked an equal yearly charge to the written down value method, whose charge falls every year.'],
                [WDV_FALLS, `Took the yearly charge to be falling. It is ${inr(s.d1)} in both years.`],
                [SLM_FALLS, 'Took the yearly charge to be falling, and linked a falling charge to the straight line method, which writes off the same amount every year.'],
              ],
              `${charges} The same amount is written off every year, so the rate is being applied to the original cost: the straight line method.`,
              H.slm,
            );
      },
      verify: (q) => {
        const c = readMissingFigure(q);
        return picked(q) === (c.d1 === c.d2 ? SLM_SAME : WDV_FALLS);
      },
    },
    {
      kind: 'numeric',
      unit: 'percent',
      make: (s) => {
        const hints = ['First find the depreciation of each of the two years.', 'Rate = depreciation of a year / the amount it is charged on x 100.'];
        if (s.kind === 'wdvCharges') {
          return percent(
            'What is the rate of depreciation a year?',
            s.r,
            [
              [(s.d2 / s.d1) * 100, 'Divided the second charge by the first. That gives the share of the value that is left, not the rate.'],
              [((s.d1 - s.d2) / s.d2) * 100, 'Divided the fall in the charge by the second charge instead of the first.'],
            ],
            [
              `The second charge is the rate applied to what was left after the first year, so it is the first charge reduced by the rate.`,
              `Fall in the charge = ${inr(s.d1)} - ${inr(s.d2)} = ${inr(s.d1 - s.d2)}.`,
              `Rate = ${inr(s.d1 - s.d2)} / ${inr(s.d1)} x 100 = ${s.r}%.`,
            ],
            hints,
          );
        }
        const x1 = s.sched.bv[0];
        const x2 = s.sched.bv[1];
        return percent(
          s.method === 'slm' ? 'What is the rate of depreciation a year, as a percentage of the original cost?' : 'What is the rate of depreciation a year?',
          s.r,
          [
            [(s.d1 / x1) * 100, "Divided the first year's depreciation by the balance at the end of the year instead of the cost at its start."],
            [((s.cost - x2) / s.cost) * 100, 'Gave the fall of two years as the rate of one year.'],
            s.method === 'slm'
              ? [100 / s.life, 'Divided 100% by the life, which ignores the scrap value that is never written off.']
              : [((s.cost - x2) / (2 * s.cost)) * 100, 'Averaged the fall of the two years, which treats the two charges as equal. Under this method the second charge is smaller.'],
          ],
          [`Depreciation of the first year = ${inr(s.cost)} - ${inr(x1)} = ${inr(s.d1)}.`, `Rate = ${inr(s.d1)} / ${inr(s.cost)} x 100 = ${s.r}%.`],
          hints,
        );
      },
      verify: (q) => near(q.answer / 100, readMissingFigure(q).r),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        if (s.kind === 'wdvCharges') {
          return numeric(
            `What was the original cost of ${s.biz.short}?`,
            s.cost,
            [
              [(s.d2 * 100) / s.r, 'Divided the second charge by the rate. That gives the book value at the start of the second year, not the cost.'],
              [s.d1 + s.d2, 'Added the two charges. That is the depreciation written off so far, not the cost.'],
              [(s.d1 * 100) / (100 - s.r), 'Divided the first charge by the share of the value that is left instead of by the rate.'],
              [s.sched.bv[1], 'Gave the balance left after the two charges instead of the original cost.'],
            ],
            [`The first charge is ${s.r}% of the cost.`, `Cost = ${inr(s.d1)} x 100 / ${s.r} = ${inr(s.cost)}.`],
            H.wdv,
          );
        }
        if (s.kind === 'wdvValues') {
          return numeric(
            `What will the balance of ${s.account} A/c be on 31 March ${s.y + 3}?`,
            s.open,
            [
              [s.sched.bv[1] - s.d2, 'Deducted the same amount as in the second year. Under this method the charge falls every year.'],
              [s.sched.bv[1] - s.d1, 'Charged the rate on the original cost instead of the balance at the start of the year.'],
              [s.d3, 'Gave the depreciation of the third year instead of the balance after it.'],
            ],
            [
              `Rate = ${inr(s.d1)} / ${inr(s.cost)} x 100 = ${s.r}%.`,
              `Depreciation of the third year = ${s.r}% of ${inr(s.sched.bv[1])} = ${inr(s.d3)}.`,
              `Balance = ${inr(s.sched.bv[1])} - ${inr(s.d3)} = ${inr(s.open)}.`,
            ],
            H.wdv,
          );
        }
        return numeric(
          `What scrap value do these figures assume for ${s.biz.short} at the end of the ${s.life} years?`,
          s.scrap,
          [
            [s.d1 * s.life, 'Gave the total depreciation over the life instead of what is left as scrap.'],
            [s.cost - s.d1 * (s.life - 1), 'Deducted the depreciation of one year too few.'],
            [s.sched.bv[1] - s.d1 * s.life, 'Deducted the depreciation of the whole life from the balance after two years instead of from the cost.'],
            [s.cost - s.d1, 'Deducted the depreciation of one year only.'],
            [s.cost - s.d1 * (s.life - 2), `Took the depreciation of the ${s.life - 2} years still to come from the original cost instead of from the balance after two years.`],
          ],
          [
            `Depreciation of each year = ${inr(s.cost)} - ${inr(s.sched.bv[0])} = ${inr(s.d1)}.`,
            `Over ${s.life} years = ${inr(s.d1)} x ${s.life} = ${inr(s.d1 * s.life)}.`,
            `Scrap value = ${inr(s.cost)} - ${inr(s.d1 * s.life)} = ${inr(s.scrap)}.`,
          ],
          H.slm,
        );
      },
      verify: (q) => {
        const c = readMissingFigure(q);
        if (q.prompt.includes('original cost')) return answerIs(q, c.cost);
        if (q.prompt.includes('scrap value')) return answerIs(q, c.cost - c.d1 * intIn(q.context ?? '', /used for (\d+) years/));
        return answerIs(q, c.value(36));
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the depreciation of the year ended 31 March ${s.y + 3}.`,
        lines: [dr('depreciation', s.d3), cr(s.biz.asset, s.d3)],
        explanation: [
          s.method === 'slm'
            ? `The straight line charge is the same every year: ${inr(s.d3)}.`
            : `Balance on 1 April ${s.y + 2} = ${inr(s.sched.bv[1])}; depreciation = ${s.r}% of ${inr(s.sched.bv[1])} = ${inr(s.d3)}.`,
          'Depreciation is an expense, so Depreciation A/c is debited.',
          `It is credited to ${s.account} A/c itself.`,
        ],
        hints: H.entry,
        distractorAccounts: ['provisionForDepreciation', 'repairs'],
      }),
      verify: (q) => {
        const c = readMissingFigure(q);
        return hasLine(q, 'Dr', 'depreciation', c.value(24) - c.value(36));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const base = s.method === 'slm' ? s.cost : s.open;
        return numeric(
          `What is the book value of ${s.biz.short} on ${s.saleDate}, the date of sale?`,
          s.bv,
          [
            [s.open, 'Left out the depreciation for the months of use in the year of sale.'],
            [s.open - (base * s.r) / 100, 'Deducted a full year of depreciation in the year of sale.'],
            [s.sched.bv[1] - (charge(s.method === 'slm' ? s.cost : s.sched.bv[1], s.r, s.e) ?? NaN), `Left out the depreciation of the year ended 31 March ${s.y + 3}, which the figures in the case do not show.`],
            s.method === 'wdv'
              ? [s.cost - (charge(s.cost, s.r, 36 + s.e) ?? s.cost), 'Applied the rate to the original cost throughout, which is the straight line method.']
              : [schedule(s.cost, 'wdv', s.r, s.months)?.bv[3] ?? null, 'Applied the rate to a reducing balance, although the same amount is written off every year.'],
            [s.cost - s.bv, 'Gave the total depreciation charged instead of the book value that is left.'],
          ],
          [
            ...(s.kind === 'wdvCharges' ? [`Cost = ${inr(s.d1)} x 100 / ${s.r} = ${inr(s.cost)}.`] : []),
            `Book value on 31 March ${s.y + 2} = ${inr(s.cost)} - ${inr(s.d1)} - ${inr(s.d2)} = ${inr(s.sched.bv[1])}.`,
            `Year ended 31 March ${s.y + 3}: ${s.r}% of ${inr(s.method === 'slm' ? s.cost : s.sched.bv[1])} = ${inr(s.d3)}; book value ${inr(s.open)}.`,
            `1 April ${s.y + 3} to the date of sale (${s.e} months): ${s.r}% of ${inr(base)} x ${s.e}/12 = ${inr(s.last)}.`,
            `Book value on the date of sale = ${inr(s.open)} - ${inr(s.last)} = ${inr(s.bv)}.`,
          ],
          H.sale,
        );
      },
      verify: (q) => {
        const c = readMissingFigure(q);
        return answerIs(q, c.value(c.to));
      },
    },
    {
      kind: 'mcq',
      make: (s) => resultChoice(`Does the sale of ${s.biz.short} give a profit or a loss?`, { sold: s.sold, bv: s.bv, cost: s.cost, when: s.saleDate }),
      verify: (q) => {
        const c = readMissingFigure(q);
        return picked(q) === (c.sold > c.value(c.to) ? PROFIT : LOSS);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const base = s.method === 'slm' ? s.cost : s.open;
        return numeric(
          `What is the amount of the profit or loss on the sale of ${s.biz.short}?`,
          s.gap,
          [
            [Math.abs(s.sold - s.open), 'Left out the depreciation for the months of use in the year of sale.'],
            [Math.abs(s.sold - (s.open - (base * s.r) / 100)), 'Charged a full year of depreciation in the year of sale.'],
            [Math.abs(s.sold - s.sched.bv[1]), `Used the book value on 31 March ${s.y + 2}, leaving out all the depreciation after the figures shown in the case.`],
            [s.cost - s.sold, 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
          ],
          [
            `Book value on 1 April ${s.y + 3} = ${inr(s.open)}; depreciation to the date of sale (${s.e} months) = ${inr(s.last)}.`,
            `Book value on ${s.saleDate} = ${inr(s.open)} - ${inr(s.last)} = ${inr(s.bv)}.`,
            s.profit
              ? `Profit = Selling price - Book value = ${inr(s.sold)} - ${inr(s.bv)} = ${inr(s.gap)}.`
              : `Loss = Book value - Selling price = ${inr(s.bv)} - ${inr(s.sold)} = ${inr(s.gap)}.`,
          ],
          H.sale,
        );
      },
      verify: (q) => {
        const c = readMissingFigure(q);
        return answerIs(q, Math.abs(c.sold - c.value(c.to)));
      },
    },
  ],
});

/** Case 7 read back from its text: the two charges, then the method, the rate and the cost that follow from them. */
function readMissingFigure(q: { context?: string }) {
  const lines = (q.context ?? '').split('\n');
  const bought = lineWith(q, 'Bought');
  const sold = lineWith(q, 'was sold for');
  const charges = lines.filter((l) => l.startsWith('Year ended')).map((l) => amountsIn(l)[0]);
  const balances = lines.filter((l) => l.startsWith('On 31 March')).map((l) => amountsIn(l)[0]);
  const known = amountsIn(bought)[0];
  const [d1, d2] = charges.length ? charges : [known - balances[0], balances[0] - balances[1]];
  const method: Method = d1 === d2 ? 'slm' : 'wdv';
  const r = charges.length ? ((d1 - d2) / d1) * 100 : (d1 / known) * 100;
  const cost = charges.length ? (d1 * 100) / r : known;
  const from = monthOf(bought);
  return { d1, d2, r, cost, sold: amountsIn(sold)[0], to: monthOf(sold) - from, value: (months: number) => bookValue(cost, method, r, 0, months) };
}

// ===============================================================================================================
// CHAINED CASES: the long question. One machine (or two) from its purchase onwards, and the books prepared on it
// ===============================================================================================================
// A chained case builds its dated journal entries once, in `setup`. A set of entries is those entries; an account is
// the same entries posted year by year with `ledgerPeriods`; so the parts of a case cannot disagree. The schedules,
// the layout of the accounts and the wording of the working are those of the topic's own sets and formats
// (`dep-set-*`, `dep-fmt-*`), taken from `DEP_CHAIN`; the scene and the lines of the case text are those of the cases
// above. A sale in an asset account is laid out as `dep-fmt-sale` lays it out, and the case text says so: the whole
// price credited to Machinery A/c, the profit or loss then transferred out of it.
//
// Every `verify` reads the printed case and works the rows or the entries out again from it by formula (`bookValue`:
// the cost, the rate and the months between two dates), without the entries or the yearly schedule of the scenario,
// and then compares whole lists: every row of every year on its side, every line of every entry.

const { chargesFor, roundCost, chargeWorking, quote, balancedAt, endOf, startOf, yearTitle, RUN_TASK, FORMAT_HINTS, DEP_AC, SUPPLIERS, YEARS } = DEP_CHAIN;

const NO_SALE_RULE = 'It is charged for the period of use, in whole months, from the date of purchase.';
const PROVISION_KEPT = 'It is credited to Provision for Depreciation A/c; Machinery A/c stays at cost.';
/** Said where a provision is kept and the rate is on the written down value, which no account then shows. */
const WDV_WITH_PROVISION = 'The written down value of a machine is its cost less the depreciation provided on it so far.';
const twelves = (n: number): number[] => Array.from({ length: Math.max(0, n) }, () => 12);

/** One dated entry of a chained case: what a set of entries calls it (the amounts are in the case text) and why it is made. */
interface Step extends DatedEntry {
  text: string;
  why: string[];
}
const asSet = (steps: Step[]): SetTransaction[] => steps.map((e) => ({ date: e.date, text: e.text, lines: e.lines, explanation: e.why }));

/** The balancing dates of `n` accounting years from the one that starts on 1 April `y`, the last balance brought down too. */
const yearEnds = (y: number, n: number): PeriodClosing[] =>
  Array.from({ length: n }, (_, i) => ({ closeOn: endOf(y, i), reopenOn: startOf(y, i + 1), title: yearTitle(y, i) }));

/**
 * An account over `n` accounting years from dated entries (`ledgerPeriods`). `details` are lines of working shown
 * under the depreciation row of a date in the solution: the charge on each of two machines that are entered as one figure.
 */
function yearsOf(entries: readonly DatedEntry[], accountId: string, y: number, n: number, details: Record<string, string[]> = {}): Pick<AccountParts, 'left' | 'right' | 'later' | 'periodTitle' | 'broughtDown'> {
  const parts = ledgerPeriods(entries, accountId, yearEnds(y, n));
  const detailed = (rows: FormatRowParts[]): FormatRowParts[] => rows.map((r) => (r.label === DEP_AC && r.date !== undefined && details[r.date] ? { ...r, details: details[r.date] } : r));
  return {
    ...parts,
    left: { ...parts.left, rows: detailed(parts.left.rows) },
    right: { ...parts.right, rows: detailed(parts.right.rows) },
    ...(parts.later ? { later: parts.later.map((p) => ({ ...p, left: detailed(p.left), right: detailed(p.right) })) } : {}),
  };
}

/** A machine of a chained case: bought on the first of month `k` of the accounting year `i` years after the first, with its charges from then. */
interface Unit {
  /** "the machine", "machine A". */
  name: string;
  cost: number;
  i: number;
  k: number;
  months: number[];
  charges: DepCharge[];
}
/** A machine whose every charge is in whole fifties of rupees, and as round as a cost in the range allows; null when none is. */
function unit(rng: Rng, name: string, method: Method, r: number, i: number, k: number, months: number[], min: number, max: number): Unit | null {
  const cost = roundCost(rng, min, max, (c) => chargesFor(method, c, r, months));
  if (cost === null) return null;
  const charges = chargesFor(method, cost, r, months)!;
  // A cost that leaves a charge like ₹31,080 is refused: the question is about the books, not the arithmetic.
  return charges.every((c) => c.amount % 50 === 0) ? { name, cost, i, k, months, charges } : null;
}
/** The working of the charge of year `i` on a machine that is in use to the end of that year, headed by its name unless it is the only machine. */
function workOf(m: Unit, y: number, r: number, i: number, named = true): string {
  const c = m.charges[i - m.i];
  return `${named ? `${cap(m.name)}: ` : ''}${chargeWorking(r, m.cost, c, c.months === 12 ? `the year ended ${endOf(y, i)}` : `From ${dateIn(y + m.i, m.k)} to ${endOf(y, i)}`)}`;
}

// ---- reading a chained case back: whole lists of rows and of lines, worked from the printed case ----

/** A row an account must show: its particulars and its amount in rupees. */
type Want = [label: string, amount: number];
const rowsAre = (rows: FormatRow[], want: Want[]): boolean => {
  const got = rows.map((r) => `${r.label}|${r.amounts[0]}|${r.closing === true}`).sort();
  const need = want.map(([label, n]) => `${label}|${Math.round(n * 100)}|${label === BALANCE_CD}`).sort();
  return got.length === need.length && got.every((k, i) => k === need[i]);
};
/** True when the account has exactly these rows on each side of each year, and these below its last totals. */
function accountIs(q: AccountQuestion, years: { dr: Want[]; cr: Want[] }[], below: { dr?: Want; cr?: Want } = {}): boolean {
  const periods = [[q.sides[0].rows, q.sides[1].rows], ...(q.later ?? [])];
  return (
    periods.length === years.length &&
    years.every((w, i) => rowsAre(periods[i][0], w.dr) && rowsAre(periods[i][1], w.cr)) &&
    rowsAre(q.sides[0].below, below.dr ? [below.dr] : []) &&
    rowsAre(q.sides[1].below, below.cr ? [below.cr] : [])
  );
}
/** A line an entry must have: its side, its account and its amount in rupees. */
type WantLine = [side: 'Dr' | 'Cr', accountId: string, amount: number];
const entryIs = (e: SetEntry, want: WantLine[]): boolean => {
  const got = e.expected.map((l) => `${l.side}|${l.accountId}|${l.amount}`).sort();
  const need = want.map(([side, id, n]) => `${side}|${id}|${Math.round(n * 100)}`).sort();
  return got.length === need.length && got.every((k, i) => k === need[i]);
};
/** True when the set has exactly these entries, in this order. */
const setIs = (q: JournalSetQuestion, want: WantLine[][]): boolean => q.entries.length === want.length && want.every((w, i) => entryIs(q.entries[i], w));
/** An entry of two lines for one amount. */
const pair = (debit: string, credit: string, n: number): WantLine[] => [['Dr', debit, n], ['Cr', credit, n]];

// ===============================================================================================================
// 8. MEDIUM, chained: the purchase and two years of depreciation journalised, then Machinery A/c for the two years
// ===============================================================================================================

/** How the machine of case 8 is paid for: one cheque for everything, a cheque and cash, or the price on credit (settled a month later). */
type Buy = 'together' | 'apart' | 'credit';
/** How the case text says that what made the machine ready was paid with its price: one credit to Bank A/c, one row in Machinery A/c. */
const SAME_CHEQUE = 'The same cheque paid a further';

const chainEntriesAndAccount = caseTemplate({
  id: 'case-asset-chain-entries-and-account',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'A machine journalised, then Machinery A/c',
  setup: (rng) => {
    const sc = scene(rng, 7, MACHINE_BUSINESSES);
    const y = rng.int(2021, 2024); // the second year ends on 31 March 2026 at the latest
    const method = rng.pick<Method>(['slm', 'wdv']);
    const r = rng.pick(method === 'slm' ? [10, 12, 15, 20] : [10, 15, 20, 25]);
    const k = rng.pick([0, 0, 3, 4, 6, 8, 9]); // bought on 1 April in some seeds, part-way through the year in others
    const buy = rng.pick<Buy>(['together', 'apart', 'credit']);
    const months = [12 - k, 12];
    const cost = roundCost(rng, 150000, 800000, (c) => chargesFor(method, c, r, months));
    if (cost === null) return null;
    const charges = chargesFor(method, cost, r, months)!;
    const extra = rng.step(4000, 24000, 2000);
    if (extra * 8 > cost || charges.some((c) => c.amount % 50 !== 0)) return null;
    const price = cost - extra;
    const x = rng.pick(EXTRAS.machinery);
    const supplier = rng.pick(SUPPLIERS);
    const the = sc.biz.short;
    const bought = dateIn(y, k);
    // A price bought on credit is paid in the month after the purchase, well before the first year end.
    const settle = `${rng.int(5, 25)} ${MONTHS[k + 1]} ${k + 1 >= 9 ? y + 1 : y}`;
    // In most seeds the machine is repaired in its second year: an expense, which Machinery A/c does not show. Always
    // where one cheque paid for everything, so that no set is only a purchase and two charges: a set has 4 to 6 entries.
    const repairs = buy === 'together' || rng.int(0, 2) > 0 ? rng.step(3000, 9000, 1000) : 0;
    const kR = rng.int(1, 10);
    const repaired = `${rng.int(5, 25)} ${MONTHS[kR]} ${kR >= 9 ? y + 2 : y + 1}`;
    const ready = `What is paid for ${x} makes ${the} ready for use, so it is part of the cost and not an expense`;
    const purchase: { told: string[]; steps: Step[] } =
      buy === 'together'
        ? {
            // Two short lines, not one of 130 characters: the case is read on a phone.
            told: [`${bought}: Bought ${sc.biz.item} for ${inr(price)} by cheque.`, `${SAME_CHEQUE} ${inr(extra)} for ${x}.`],
            steps: [
              {
                date: bought,
                text: `Bought ${the} and paid for ${x}, both by one cheque.`,
                lines: [dr('machinery', cost), cr('bank', cost)],
                why: [`${ready}: Machinery A/c is debited with ${inr(price)} + ${inr(extra)} = ${inr(cost)}.`, `Both were paid by the one cheque: Bank A/c is credited with ${inr(cost)}.`],
              },
            ],
          }
        : buy === 'apart'
          ? {
              told: [`${bought}: Bought ${sc.biz.item} for ${inr(price)} by cheque.`, `${bought}: Paid ${inr(extra)} in cash for ${x}.`],
              steps: [
                {
                  date: bought,
                  text: `Bought ${the}, paid for by cheque.`,
                  lines: [dr('machinery', price), cr('bank', price)],
                  why: [`${cap(the)} is bought to be used, not to be sold again: Machinery A/c is debited with the price.`, 'It was paid for by cheque: Bank A/c is credited.'],
                },
                {
                  date: bought,
                  text: `Paid in cash for ${x}.`,
                  lines: [dr('machinery', extra), cr('cash', extra)],
                  why: [`${ready}: Machinery A/c is debited, which brings the cost of ${the} to ${inr(price)} + ${inr(extra)} = ${inr(cost)}.`, 'Cash goes out: Cash A/c is credited.'],
                },
              ],
            }
          : {
              told: [
                `${bought}: Bought ${sc.biz.item} on credit from ${supplier} for ${inr(price)}.`,
                `${bought}: Paid ${inr(extra)} by cheque for ${x}.`,
                `${settle}: Paid ${supplier} the amount due by cheque.`,
              ],
              steps: [
                {
                  date: bought,
                  text: `Bought ${the} on credit from ${supplier.replace(/\.$/, '')}.`,
                  lines: [dr('machinery', price), cr(creditor(supplier), price)],
                  why: [`${cap(the)} is bought to be used, not to be sold again: Machinery A/c is debited with the price.`, `The price is owed to ${supplier}, whose account is credited.`],
                },
                {
                  date: bought,
                  text: `Paid by cheque for ${x}.`,
                  lines: [dr('machinery', extra), cr('bank', extra)],
                  why: [`${ready}: Machinery A/c is debited, which brings the cost of ${the} to ${inr(price)} + ${inr(extra)} = ${inr(cost)}.`, 'It was paid by cheque: Bank A/c is credited.'],
                },
                {
                  date: settle,
                  text: `Paid ${supplier} the amount due for ${the}, by cheque.`,
                  lines: [dr(creditor(supplier), price), cr('bank', price)],
                  why: [`The amount due to ${supplier} is the price, ${inr(price)}: the account of ${supplier} is debited.`, 'It was paid by cheque: Bank A/c is credited.'],
                },
              ],
            };
    /** The working of the charge of year `i`, as the topic's formats write it. */
    const work = (i: number): string => chargeWorking(r, cost, charges[i], charges[i].months === 12 ? `the year ended ${endOf(y, i)}` : `From ${bought} to ${endOf(y, i)}`);
    const charged = (i: number): Step => ({
      date: endOf(y, i),
      text: `Charged depreciation on ${the} for the year ended ${endOf(y, i)}.`,
      lines: [dr('depreciation', charges[i].amount), cr('machinery', charges[i].amount)],
      why: [
        `${i === 0 && buy === 'together' ? `Cost = ${inr(price)} + ${inr(extra)} = ${inr(cost)}. ` : ''}${work(i)} It is an expense of the year: Depreciation A/c is debited.`,
        `No provision account is kept, so Machinery A/c itself is credited; ${the} now stands in the books at ${inr(charges[i].close)}.`,
      ],
    });
    const repair: Step = {
      date: repaired,
      text: `Paid in cash for routine repairs to ${the}.`,
      lines: [dr('repairs', repairs), cr('cash', repairs)],
      why: [`Routine repairs only keep ${the} in the condition it was already in: they are an expense of the year, so Repairs A/c is debited and not Machinery A/c.`, 'Cash goes out: Cash A/c is credited.'],
    };
    return {
      ...sc, y, method, r, k, buy, cost, price, extra, x, supplier, the, charges, repairs, work,
      end: endOf(y, 1),
      told: [...purchase.told, ...(repairs ? [`${repaired}: Paid ${inr(repairs)} in cash for routine repairs to ${the}.`] : [])],
      steps: [...purchase.steps, charged(0), ...(repairs ? [repair] : []), charged(1)],
    };
  },
  context: (s) =>
    [
      s.intro,
      ...s.told,
      `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`,
      NO_SALE_RULE,
      direct(s.account),
      `There is no other machinery, and none was bought or sold up to ${s.end}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'journal_set',
      make: (s) => ({
        task: `Journalise the transactions of the case, and the depreciation on ${s.the} on each 31 March up to ${s.end}.`,
        transactions: asSet(s.steps),
        hints: ['Everything spent to bring the machine in and make it ready for use is part of its cost.', 'Work each charge from the rate in the case and the months the machine was in use in that year.'],
        distractorAccounts: ['provisionForDepreciation', 'repairs', 'carriageInwards', 'purchases', 'profitAndLoss'],
      }),
      verify: (q) => {
        const c = readEntriesChain(q);
        const bought: WantLine[][] = c.supplier
          ? [pair('machinery', creditor(c.supplier), c.price), pair('machinery', 'bank', c.extra), pair(creditor(c.supplier), 'bank', c.price)]
          : c.apart
            ? [pair('machinery', 'bank', c.price), pair('machinery', 'cash', c.extra)]
            : [pair('machinery', 'bank', c.cost)];
        return setIs(q, [
          ...bought,
          pair('depreciation', 'machinery', c.cost - c.bv[0]),
          ...(c.repairs ? [pair('repairs', 'cash', c.repairs)] : []),
          pair('depreciation', 'machinery', c.bv[0] - c.bv[1]),
        ]);
      },
    },
    {
      kind: 'account',
      make: (s) => ({
        task: `Prepare Machinery A/c in the books of ${s.owner} for the two years ended ${s.end}. ${RUN_TASK}${s.buy === 'together' ? ' Enter what the one cheque paid as one figure.' : ''}`,
        title: 'Machinery A/c',
        ...yearsOf(s.steps, 'machinery', s.y, 2),
        // The accounts a student reaches for: the expense the carriage or the repairs are wrongly kept out of, the provision that is not kept.
        distractors: ['Machinery A/c', 'Provision for Depreciation A/c', 'Profit and Loss A/c', 'Repairs A/c', 'Carriage Inwards A/c', 'Cash A/c', 'Purchases A/c'],
        explanation: [
          `Cost of ${s.the} = ${inr(s.price)} + ${inr(s.extra)} = ${inr(s.cost)}: what is paid for ${s.x} makes ${s.the} ready for use, so it is part of the cost and not an expense.`,
          s.buy === 'together'
            ? `Machinery A/c is debited with the cost, paid by the one cheque: ${quote('To', 'Bank A/c', s.cost)}.`
            : s.buy === 'apart'
              ? `Machinery A/c is debited with both payments: ${quote('To', 'Bank A/c', s.price)} and ${quote('To', 'Cash A/c', s.extra)}.`
              : `Machinery A/c is debited with both parts of the cost: ${quote('To', `${s.supplier} A/c`, s.price)} for the price still owed and ${quote('To', 'Bank A/c', s.extra)}. Paying ${s.supplier} later is between the account of ${s.supplier} and Bank A/c: it does not touch Machinery A/c.`,
          ...(s.repairs ? [`The routine repairs are an expense of the year, debited to Repairs A/c: Machinery A/c has no row for them.`] : []),
          ...s.charges.map(
            (c, i) =>
              `${yearTitle(s.y, i)}: ${s.work(i)} It is written off the machine itself: ${quote('By', DEP_AC, c.amount)}. That leaves ${inr(i === 0 ? s.cost : s.charges[i - 1].close)} - ${inr(c.amount)} = ${inr(c.close)}: ${balancedAt(s.y, i, c.close, i === 1)}.`,
          ),
        ],
        hints: [FORMAT_HINTS.run[0], s.method === 'slm' ? 'Under the straight line method the charge of a full year is the same every year: it is worked on the cost, not on the balance of the account.' : FORMAT_HINTS.run[1]],
      }),
      verify: (q) => {
        const c = readEntriesChain(q);
        const bought: Want[] = c.supplier ? [[`${c.supplier} A/c`, c.price], ['Bank A/c', c.extra]] : c.apart ? [['Bank A/c', c.price], ['Cash A/c', c.extra]] : [['Bank A/c', c.cost]];
        return accountIs(
          q,
          [
            { dr: bought, cr: [[DEP_AC, c.cost - c.bv[0]], [BALANCE_CD, c.bv[0]]] },
            { dr: [[BALANCE_BD, c.bv[0]]], cr: [[DEP_AC, c.bv[0] - c.bv[1]], [BALANCE_CD, c.bv[1]]] },
          ],
          { dr: [BALANCE_BD, c.bv[1]] },
        );
      },
    },
  ],
});

/** Case 8 read back from its text: what was paid and to whom, and the book value at the end of each of the two years. */
function readEntriesChain(q: { context?: string }) {
  const lines = (q.context ?? '').split('\n');
  const bought = lines.find((l) => l.includes(': Bought ')) ?? '';
  // The payment that makes the machine ready, where it has a line of its own: in cash, or by cheque beside a credit purchase.
  const apart = lines.find((l) => /: Paid ₹[\d,]+ (in cash|by cheque) for (?!routine)/.test(l));
  const rule = lineWith(q, 'Depreciation:');
  const supplier = /on credit from (.+?) for ₹/.exec(bought)?.[1];
  const price = amountsIn(bought)[0];
  const extra = amountsIn(apart ?? lineWith(q, SAME_CHEQUE))[0];
  const cost = price + extra;
  const from = monthOf(bought);
  const end = (Math.floor(from / 12) + 1) * 12;
  const value = (at: number): number => bookValue(cost, methodOf(rule), rateOf(rule), from, at);
  return {
    price,
    extra,
    cost,
    apart: apart !== undefined && supplier === undefined,
    supplier,
    repairs: amountsIn(lines.find((l) => l.includes('routine repairs')) ?? '')[0] ?? 0,
    bv: [value(end), value(end + 12)],
  };
}

// ===============================================================================================================
// 9. MEDIUM, chained: a provision is kept. Machinery A/c at cost and Provision for Depreciation A/c for three years,
//    then the net amount at which the machinery stands in the balance sheet
// ===============================================================================================================
// A second machine is always bought, in the second or the third year, as in `dep-fmt-provision`: Machinery A/c then
// has more to show than one purchase, and is a fair question about what the account holds and not a trap.

const chainProvision = caseTemplate({
  id: 'case-asset-chain-provision',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Machinery at cost and its provision for depreciation',
  setup: (rng) => {
    const sc = scene(rng, 8, MACHINE_BUSINESSES);
    const y = rng.int(2020, 2023); // the third year ends on 31 March 2026 at the latest
    const method = rng.pick<Method>(['slm', 'slm', 'wdv']);
    const r = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    const kA = rng.pick([0, 0, 3, 6, 9]);
    const iB = rng.pick([1, 2]);
    const kB = rng.pick([3, 4, 6, 7, 8, 9]);
    const A = unit(rng, 'machine A', method, r, 0, kA, [12 - kA, 12, 12], 200000, 600000);
    const B = unit(rng, 'machine B', method, r, iB, kB, [12 - kB, ...twelves(2 - iB)], 100000, 400000);
    if (A === null || B === null || A.cost === B.cost) return null;
    const dateA = dateIn(y, kA);
    const dateB = dateIn(y + iB, kB);
    const entries: DatedEntry[] = [];
    const details: Record<string, string[]> = {};
    /** Year by year: the charge on each machine, and the machinery at cost and the provision when the year ends. */
    const years: { dA: number; dB: number; dep: number; atCost: number; prov: number }[] = [];
    for (let i = 0; i < 3; i++) {
      if (i === 0) entries.push({ date: dateA, lines: [dr('machinery', A.cost), cr('bank', A.cost)] });
      if (i === iB) entries.push({ date: dateB, lines: [dr('machinery', B.cost), cr('bank', B.cost)] });
      const dA = A.charges[i].amount;
      const dB = i >= iB ? B.charges[i - iB].amount : 0;
      entries.push({ date: endOf(y, i), lines: [dr('depreciation', dA + dB), cr('provisionForDepreciation', dA + dB)] });
      if (i >= iB) details[endOf(y, i)] = [`Machine A ${inr(dA)}`, `Machine B ${inr(dB)}`];
      years.push({ dA, dB, dep: dA + dB, atCost: A.cost + (i >= iB ? B.cost : 0), prov: (years[i - 1]?.prov ?? 0) + dA + dB });
    }
    return { ...sc, y, method, r, iB, A, B, dateA, dateB, entries, details, years, end: endOf(y, 2), atCost: years[2].atCost, prov: years[2].prov };
  },
  context: (s) =>
    [
      s.intro,
      `${s.dateA}: Bought machine A for ${inr(s.A.cost)} by cheque.`,
      `${s.dateB}: Bought machine B for ${inr(s.B.cost)} by cheque.`,
      `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`,
      ...(s.method === 'wdv' ? [WDV_WITH_PROVISION] : []),
      NO_SALE_RULE,
      PROVISION_KEPT,
      `There is no other machinery, and none was sold up to ${s.end}.`,
    ].join('\n'),
  parts: [
    {
      kind: 'account',
      make: (s) => ({
        // The task itself says that a provision account is kept: the question is what that leaves in Machinery A/c.
        task: `Prepare Machinery A/c in the books of ${s.owner}, who keeps a Provision for Depreciation A/c, for the three years ended ${s.end}. ${RUN_TASK}`,
        title: 'Machinery A/c',
        ...yearsOf(s.entries, 'machinery', s.y, 3),
        distractors: ['Machinery A/c', DEP_AC, 'Provision for Depreciation A/c', 'Profit and Loss A/c', 'Cash A/c'],
        explanation: [
          'A provision account is kept, so depreciation is never credited to Machinery A/c: the machinery stays in it at cost, and no year has a row for depreciation.',
          ...s.years.map((yr, i) => {
            const bought = i === 0 ? `Machine A is debited at its cost on ${s.dateA}: ${quote('To', 'Bank A/c', s.A.cost)}. ` : i === s.iB ? `Machine B is debited at its cost on ${s.dateB}: ${quote('To', 'Bank A/c', s.B.cost)}. ` : '';
            return `${yearTitle(s.y, i)}: ${i > 0 ? `The account opens with ${inr(s.years[i - 1].atCost)}, the cost and not the book value. ` : ''}${bought}The depreciation of the year, ${inr(yr.dep)}, is credited to Provision for Depreciation A/c, not here. The balance is the machinery at cost, ${inr(yr.atCost)}: ${balancedAt(s.y, i, yr.atCost, i === 2)}.`;
          }),
        ],
        hints: FORMAT_HINTS.provision,
      }),
      verify: (q) => {
        const c = readProvisionChain(q);
        return accountIs(
          q,
          c.atCost.map((close, i) => ({
            dr: [i === 0 ? ['Bank A/c', c.A.cost] : [BALANCE_BD, c.atCost[i - 1]], ...(i === c.iB ? [['Bank A/c', c.B.cost] as Want] : [])],
            cr: [[BALANCE_CD, close]],
          })),
          { dr: [BALANCE_BD, c.atCost[2]] },
        );
      },
    },
    {
      kind: 'account',
      make: (s) => ({
        task: `Prepare Provision for Depreciation A/c in the books of ${s.owner} for the three years ended ${s.end}. ${RUN_TASK} Enter the depreciation of a year on the two machines as one figure.`,
        title: 'Provision for Depreciation A/c',
        ...yearsOf(s.entries, 'provisionForDepreciation', s.y, 3, s.details),
        distractors: ['Provision for Depreciation A/c', 'Machinery A/c', 'Profit and Loss A/c', 'Bank A/c'],
        explanation: s.years.map(
          (yr, i) =>
            `${yearTitle(s.y, i)}: ${workOf(s.A, s.y, s.r, i)}${i >= s.iB ? ` ${workOf(s.B, s.y, s.r, i)} Depreciation of the year = ${inr(yr.dA)} + ${inr(yr.dB)} = ${inr(yr.dep)}.` : ''} It is debited to Depreciation A/c and credited here: ${quote('By', DEP_AC, yr.dep)}. The provision now stands at ${i > 0 ? `${inr(s.years[i - 1].prov)} + ${inr(yr.dep)} = ` : ''}${inr(yr.prov)}, a credit balance: ${balancedAt(s.y, i, yr.prov, i === 2, true)}.`,
        ),
        hints: FORMAT_HINTS.provision,
      }),
      verify: (q) => {
        const c = readProvisionChain(q);
        return accountIs(
          q,
          c.prov.map((close, i) => ({
            dr: [[BALANCE_CD, close]],
            cr: [...(i > 0 ? [[BALANCE_BD, c.prov[i - 1]] as Want] : []), [DEP_AC, close - (i > 0 ? c.prov[i - 1] : 0)]],
          })),
          { cr: [BALANCE_BD, c.prov[2]] },
        );
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `The balance sheet on ${s.end} shows the machinery at the balance of Machinery A/c less the balance of Provision for Depreciation A/c. What is that net amount?`,
          s.atCost - s.prov,
          [
            [s.atCost, 'Showed the machinery at cost. The provision for depreciation has to be deducted from it in the balance sheet.'],
            [s.prov, 'Gave the balance of Provision for Depreciation A/c instead of the amount at which the machinery is shown.'],
            [s.atCost - s.years[2].dep, "Deducted only the last year's depreciation instead of the whole provision."],
            [s.A.charges[2].close, 'Gave the book value of machine A alone. Both machines are in Machinery A/c and in the provision.'],
            [s.atCost + s.prov, 'Added the provision to the cost instead of deducting it.'],
          ],
          [
            `Machinery A/c on ${s.end}, at cost = ${inr(s.A.cost)} + ${inr(s.B.cost)} = ${inr(s.atCost)}.`,
            `Provision for Depreciation A/c on ${s.end} = ${s.years.map((yr) => inr(yr.dep)).join(' + ')} = ${inr(s.prov)}.`,
            `Net amount = ${inr(s.atCost)} - ${inr(s.prov)} = ${inr(s.atCost - s.prov)}, the book value of the two machines.`,
          ],
          H.prov,
        ),
      verify: (q) => {
        const c = readProvisionChain(q);
        return answerIs(q, c.atCost[2] - c.prov[2]);
      },
    },
  ],
});

/** Case 9 read back from its text: the machinery at cost and the provision on each of the three 31 Marches. */
function readProvisionChain(q: { context?: string }) {
  const rule = lineWith(q, 'Depreciation:');
  const read = (name: string): Bought => {
    const line = lineWith(q, `Bought machine ${name}`);
    return { cost: amountsIn(line)[0], from: monthOf(line) };
  };
  const A = read('A');
  const B = read('B');
  const start = Math.floor(A.from / 12) * 12; // 1 April of the first year
  const ends = [12, 24, 36].map((n) => start + n);
  const value = (m: Bought, at: number): number => bookValue(m.cost, methodOf(rule), rateOf(rule), m.from, at);
  return {
    A,
    B,
    /** The accounting year, counted from 0, in which machine B is bought. */
    iB: Math.floor((B.from - start) / 12),
    atCost: ends.map((at) => A.cost + (B.from < at ? B.cost : 0)),
    prov: ends.map((at) => A.cost - value(A, at) + B.cost - value(B, at)),
  };
}

// ===============================================================================================================
// 10 and 11. COMPLEX, chained: a machine sold part-way through a later year
// ===============================================================================================================
// One story told in two sets of books. Case 10 writes depreciation off Machinery A/c: the account from the purchase to
// the year of the sale, then the entries of the day of the sale. Case 11 keeps a provision: Provision for
// Depreciation A/c over the same years, Asset Disposal A/c, then the entries of the day of the sale. They are two
// cases, and not one case that changes with the seed, because the parts of a case are of fixed kinds and case 11 has
// an account more.

/**
 * A machine bought and later sold on the first day of a month: the only machine, sold in its second or third
 * accounting year, or one of two machines bought in the first year, sold in the second. Null for a seed that gives no
 * round figures, no believable price, or two depreciation rows that could not be told apart.
 */
function saleStory(rng: Rng, shift: number) {
  const sc = scene(rng, shift, MACHINE_BUSINESSES);
  const method = rng.pick<Method>(['slm', 'wdv']);
  const r = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
  const two = rng.int(0, 4) < 3;
  /** The sale is in the accounting year `n` years after the first: the accounts run over `n + 1` years. */
  const n = two ? 1 : rng.pick([1, 2]);
  const y = rng.int(2020, 2025 - n); // the year of the sale ends on 31 March 2026 at the latest
  const e = rng.int(2, 10); // sold on the first of a month from June to February
  const kA = two ? rng.pick([0, 0, 3, 6]) : rng.pick([0, 0, 3, 6, 9]);
  const kB = two ? rng.pick([3, 6, 9].filter((k) => k > kA)) : 0;
  const soldA = !two || rng.int(0, 1) === 0;
  const A = unit(rng, two ? 'machine A' : sc.biz.short, method, r, 0, kA, soldA ? [12 - kA, ...twelves(n - 1), e] : [12 - kA, 12], 200000, 600000);
  const B = two ? unit(rng, 'machine B', method, r, 0, kB, soldA ? [12 - kB, 12] : [12 - kB, e], 150000, 500000) : null;
  if (A === null || (two && B === null) || B?.cost === A.cost) return null;
  const held = B ? [A, B] : [A]; // in the order they were bought
  const gone = soldA ? A : B!;
  const kept = B ? (soldA ? B : A) : null;
  const last = gone.charges[gone.charges.length - 1];
  const keptLast = kept ? kept.charges[kept.charges.length - 1] : null;
  // Two depreciation rows of one amount on one side of the year of the sale could not be told apart.
  if (keptLast && keptLast.amount === last.amount) return null;
  const s = sale(rng, last.close, gone.cost);
  if (!s) return null;
  const saleDate = dateIn(y + n, e);
  const end = endOf(y, n);
  const on = (c: DepCharge, m: Unit): string => (c.base === m.cost ? `the cost of ${inr(m.cost)}` : `the written down value of ${inr(c.base)}`);
  return {
    ...sc,
    ...s,
    method,
    r,
    two,
    n,
    y,
    e,
    held,
    gone,
    kept,
    last,
    keptLast,
    saleDate,
    end,
    /** The book value of the machine sold on the date of sale, and the depreciation on it up to then. */
    bv: last.close,
    written: gone.cost - last.close,
    /** Its book value on the first day of the year of the sale. */
    openOfGone: gone.charges[gone.charges.length - 2].close,
    /** The lines of the case text that tell the story, in date order. */
    told: [
      ...held.map((m) => `${dateIn(y, m.k)}: Bought ${two ? m.name : sc.biz.item} for ${inr(m.cost)} by cheque.`),
      `${saleDate}: ${cap(gone.name)} was sold for ${inr(s.sold)} ${s.mode.text}.`,
    ],
    /** The working of the charge on the machine sold, for the months of the year of the sale. */
    saleWork: `${cap(gone.name)}, from ${startOf(y, n)} to ${saleDate}, is ${e} months of use: ${r}% of ${on(last, gone)} x ${e}/12 = ${inr(last.amount)}`,
    /** The working of the full year's charge on the machine kept, in the year of the sale. */
    keptWork: kept && keptLast ? `${cap(kept.name)} was in use for the whole year: ${r}% of ${on(keptLast, kept)} = ${inr(keptLast.amount)}` : '',
    /** The working of the years before the sale, year by year: every machine, and the total where there are two. */
    before: Array.from({ length: n }, (_, i) => {
      const ds = held.map((m) => m.charges[i].amount);
      return { ds, dep: sum(ds), work: `${held.map((m) => workOf(m, y, r, i, two)).join(' ')}${two ? ` Depreciation of the year = ${ds.map(inr).join(' + ')} = ${inr(sum(ds))}.` : ''}` };
    }),
  };
}

// The topic's set of a sale (`dep-set-sale-part-year`) says that a sale is recorded in one entry; here it is recorded
// in the two entries that Machinery A/c shows, and the case says so, so that no other form of the entry can be defended.
const TWO_STEPS = [
  'A sale is recorded in two steps, each by an entry of its own.',
  'First the whole price is credited to Machinery A/c.',
  'Then the profit or loss is transferred from it to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.',
];
const SOLD_ROW_TASK = 'Enter the depreciation on the machine sold in a row of its own, on the date of sale, and the depreciation of the first year on the two machines as one figure.';
const ANY_BALANCE_TASK = 'Balance it on each 31 March and bring down on the next 1 April any balance that is left.';

const chainSale = caseTemplate({
  id: 'case-asset-chain-sale',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'A machine sold: Machinery A/c, then the entries',
  setup: (rng) => {
    const st = saleStory(rng, 9);
    if (st === null) return null;
    const { y, held, gone, last, keptLast, sold, gap, profit, bv } = st;
    const entries: DatedEntry[] = held.map((m) => ({ date: dateIn(y, m.k), lines: [dr('machinery', m.cost), cr('bank', m.cost)] }));
    const details: Record<string, string[]> = {};
    st.before.forEach((yr, i) => {
      entries.push({ date: endOf(y, i), lines: [dr('depreciation', yr.dep), cr('machinery', yr.dep)] });
      if (st.two) details[endOf(y, i)] = held.map((m, j) => `${cap(m.name)} ${inr(yr.ds[j])}`);
    });
    const charged = gone.charges.map((c) => inr(c.amount)).join(' - ');
    /** The entries of the day of the sale, in the order the case gives for a sale. */
    const steps: Step[] = [
      {
        date: st.saleDate,
        text: `Charged depreciation on ${gone.name} for the current year, up to this date.`,
        lines: [dr('depreciation', last.amount), cr('machinery', last.amount)],
        why: [`${st.saleWork}. It is an expense of the year: Depreciation A/c is debited.`, `No provision account is kept, so Machinery A/c itself is credited; ${gone.name} now stands in the books at ${inr(gone.cost)} - ${charged} = ${inr(bv)}.`],
      },
      {
        date: st.saleDate,
        text: `Received the price of ${gone.name} ${st.mode.text}.`,
        lines: [dr('bank', sold), cr('machinery', sold)],
        why: ['The money goes into the bank: Bank A/c is debited with the price.', 'The first step of a sale: the whole price is credited to Machinery A/c, as the case says, whether it is more or less than the book value.'],
      },
      {
        date: st.saleDate,
        text: `Transferred the profit or loss on the sale of ${gone.name} from Machinery A/c.`,
        lines: profit ? [dr('machinery', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('machinery', gap)],
        why: profit
          ? [
              `The price is ${inr(sold)} - ${inr(bv)} = ${inr(gap)} more than the book value: a profit. A gain is credited: Profit on Sale of Asset A/c.`,
              `Machinery A/c is debited: it was credited with ${inr(sold)}, and ${inr(sold)} - ${inr(gap)} = ${inr(bv)}, the book value, is what the two steps take out of it.`,
              `Taken together, the two entries of the sale debit Bank A/c with ${inr(sold)}, credit Machinery A/c with ${inr(bv)} and credit the profit of ${inr(gap)}: the same result as a sale recorded in one entry.`,
            ]
          : [
              `The price is ${inr(bv)} - ${inr(sold)} = ${inr(gap)} less than the book value: a loss. A loss is debited: Loss on Sale of Asset A/c.`,
              `Machinery A/c is credited: with the ${inr(sold)} of the price, ${inr(sold)} + ${inr(gap)} = ${inr(bv)}, the book value, is what the two steps take out of it.`,
              `Taken together, the two entries of the sale debit Bank A/c with ${inr(sold)} and the loss of ${inr(gap)}, and credit Machinery A/c with ${inr(bv)}: the same result as a sale recorded in one entry.`,
            ],
      },
    ];
    entries.push(...steps);
    if (keptLast) entries.push({ date: st.end, lines: [dr('depreciation', keptLast.amount), cr('machinery', keptLast.amount)] });
    return { ...st, entries, details, steps };
  },
  context: (s) =>
    [
      s.intro,
      ...s.told,
      `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`,
      PERIOD_RULE,
      'It is credited to Machinery A/c itself; no provision account and no Asset Disposal A/c is kept.',
      ...TWO_STEPS,
      'There was no other machinery.',
    ].join('\n'),
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { y, n, held, gone, kept, keptLast, sold, gap, profit, bv } = s;
        const explanation = s.before.map((yr, i) => {
          const bought =
            i > 0
              ? ''
              : s.two
                ? `Each machine is debited at its cost on the day it is bought: ${held.map((m) => quote('To', 'Bank A/c', m.cost)).join(' and ')}. `
                : `${cap(gone.name)} is debited at its cost: ${quote('To', 'Bank A/c', gone.cost)}. `;
          const close = sum(held.map((m) => m.charges[i].close));
          return `${yearTitle(y, i)}: ${bought}${yr.work} It is written off ${s.two ? 'the machines' : 'the machine'}: ${quote('By', DEP_AC, yr.dep)}. The debit side is larger by ${inr(close)}${s.two ? ` (${held.map((m) => inr(m.charges[i].close)).join(' + ')})` : ''}: ${balancedAt(y, i, close, false)}.`;
        });
        const steps = [
          `${s.saleWork}, entered on the date of sale: ${quote('By', DEP_AC, s.last.amount)}.`,
          `Book value of ${gone.name} on ${s.saleDate} = ${inr(s.openOfGone)} - ${inr(s.last.amount)} = ${inr(bv)}.`,
          `The whole price is credited to Machinery A/c, as the case says: ${quote('By', 'Bank A/c', sold)}.`,
          profit
            ? `The price is ${inr(sold)} - ${inr(bv)} = ${inr(gap)} more than the book value, a profit. It is transferred out of Machinery A/c by a debit: ${quote('To', 'Profit on Sale of Asset A/c', gap)}. The two rows together take ${inr(sold)} - ${inr(gap)} = ${inr(bv)} out of the account, the book value, so that nothing of ${gone.name} is left in it.`
            : `The price is ${inr(bv)} - ${inr(sold)} = ${inr(gap)} less than the book value, a loss. It is transferred out of Machinery A/c by a credit: ${quote('By', 'Loss on Sale of Asset A/c', gap)}. The two credits together take ${inr(sold)} + ${inr(gap)} = ${inr(bv)} out of the account, the book value, so that nothing of ${gone.name} is left in it.`,
          kept && keptLast
            ? `${s.keptWork}, on ${s.end}: ${quote('By', DEP_AC, keptLast.amount)}. What is left is the book value of ${kept.name}, ${inr(keptLast.close)}: ${balancedAt(y, n, keptLast.close, true)}.`
            : 'The two sides of the year now agree: nothing is left in Machinery A/c, so there is no balance to carry down.',
        ];
        return {
          task: kept
            ? `Prepare Machinery A/c in the books of ${s.owner} for the two years ended ${s.end}. ${RUN_TASK} ${SOLD_ROW_TASK}`
            : `Prepare Machinery A/c in the books of ${s.owner} for the ${YEARS[n + 1]} years ended ${s.end}, from the purchase of the machine to its sale. ${ANY_BALANCE_TASK}`,
          title: 'Machinery A/c',
          // The place for a balance brought down is offered whether or not a machine is left, so the screen does not say that none is.
          ...yearsOf(s.entries, 'machinery', y, n + 1, s.details),
          // Profit and Loss A/c is where a student who skips the named account sends the profit or loss; the case names the account.
          distractors: ['Machinery A/c', 'Asset Disposal A/c', 'Provision for Depreciation A/c', profit ? 'Loss on Sale of Asset A/c' : 'Profit on Sale of Asset A/c', 'Profit and Loss A/c', 'Cash A/c'],
          explanation: [...explanation, `${yearTitle(y, n)}: ${steps.join(' ')}`],
          hints: FORMAT_HINTS.sale,
        };
      },
      verify: (q) => {
        const c = readSaleChain(q);
        const all = (at: number): number => sum(c.held.map((m) => c.value(m, at)));
        // The years before the sale: the purchases or the balance brought down, the depreciation of the year, the balance.
        const years = c.ends.slice(0, -1).map((at, i) => ({
          dr: i === 0 ? c.held.map((m): Want => ['Bank A/c', m.cost]) : [[BALANCE_BD, all(c.ends[i - 1])] as Want],
          cr: [[DEP_AC, (i === 0 ? sum(c.held.map((m) => m.cost)) : all(c.ends[i - 1])) - all(at)], [BALANCE_CD, all(at)]] as Want[],
        }));
        const left = c.kept ? c.value(c.kept, c.end) : 0;
        years.push({
          dr: [[BALANCE_BD, all(c.open)], ...(c.result > 0 ? [['Profit on Sale of Asset A/c', c.result] as Want] : [])],
          cr: [
            [DEP_AC, c.depToSale],
            ['Bank A/c', c.sold],
            ...(c.result < 0 ? [['Loss on Sale of Asset A/c', -c.result] as Want] : []),
            ...(c.kept ? ([[DEP_AC, c.value(c.kept, c.open) - left], [BALANCE_CD, left]] as Want[]) : []),
          ],
        });
        return accountIs(q, years, c.kept ? { dr: [BALANCE_BD, left] } : {});
      },
    },
    {
      kind: 'journal_set',
      make: (s) => ({
        task: `Pass the journal entries on ${s.saleDate} for the depreciation on ${s.gone.name} up to that date and for its sale.`,
        transactions: asSet(s.steps),
        hints: H.sale,
        distractorAccounts: ['assetDisposal', 'provisionForDepreciation', s.profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'profitAndLoss', 'cash'],
      }),
      verify: (q) => {
        const c = readSaleChain(q);
        return setIs(q, [
          pair('depreciation', 'machinery', c.depToSale),
          pair('bank', 'machinery', c.sold),
          c.result > 0 ? pair('machinery', 'profitOnSaleOfAsset', c.result) : pair('lossOnSaleOfAsset', 'machinery', -c.result),
        ]);
      },
    },
  ],
});

const chainDisposal = caseTemplate({
  id: 'case-asset-chain-disposal',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'A machine sold: the provision, the disposal account and the entries',
  setup: (rng) => {
    rng.int(0, 9); // one draw first, so that a seed does not tell the story of case 10 again with the same figures
    const st = saleStory(rng, 10);
    if (st === null) return null;
    const { y, held, gone, last, keptLast, sold, gap, profit, bv, written } = st;
    const entries: DatedEntry[] = held.map((m) => ({ date: dateIn(y, m.k), lines: [dr('machinery', m.cost), cr('bank', m.cost)] }));
    const details: Record<string, string[]> = {};
    st.before.forEach((yr, i) => {
      entries.push({ date: endOf(y, i), lines: [dr('depreciation', yr.dep), cr('provisionForDepreciation', yr.dep)] });
      if (st.two) details[endOf(y, i)] = held.map((m, j) => `${cap(m.name)} ${inr(yr.ds[j])}`);
    });
    /** The depreciation provided on the machine sold, period by period: "₹40,000 + ₹10,000". */
    const provided = gone.charges.map((c) => inr(c.amount)).join(' + ');
    /** The entries of the day of the sale, as `dep-set-provision-disposal` journalises a sale. */
    const steps: Step[] = [
      {
        date: st.saleDate,
        text: `Provided depreciation on ${gone.name} for the current year, up to this date.`,
        lines: [dr('depreciation', last.amount), cr('provisionForDepreciation', last.amount)],
        why: [`${st.saleWork}. It is an expense of the year: Depreciation A/c is debited.`, 'Machinery A/c stays at cost: the depreciation is credited to Provision for Depreciation A/c.'],
      },
      {
        date: st.saleDate,
        text: `Transferred the cost of ${gone.name} to Asset Disposal A/c.`,
        lines: [dr('assetDisposal', gone.cost), cr('machinery', gone.cost)],
        why: [`${cap(gone.name)} leaves the books at its cost of ${inr(gone.cost)}, the figure at which it stands in Machinery A/c: Machinery A/c is credited with it.`, 'Asset Disposal A/c is debited with the cost.'],
      },
      {
        date: st.saleDate,
        text: `Transferred the provision for depreciation on ${gone.name} to Asset Disposal A/c.`,
        lines: [dr('provisionForDepreciation', written), cr('assetDisposal', written)],
        why: [
          `Depreciation provided on ${gone.name} up to the date of sale = ${provided} = ${inr(written)}. It is no longer needed once ${gone.name} is sold: Provision for Depreciation A/c is debited with it.`,
          `Asset Disposal A/c is credited, which leaves in it the book value of ${inr(gone.cost)} - ${inr(written)} = ${inr(bv)}.`,
        ],
      },
      {
        date: st.saleDate,
        text: `Received the price of ${gone.name} ${st.mode.text}.`,
        lines: [dr('bank', sold), cr('assetDisposal', sold)],
        why: ['The money goes into the bank: Bank A/c is debited.', 'Asset Disposal A/c is credited with the price.'],
      },
      {
        date: st.saleDate,
        text: `Closed Asset Disposal A/c by transferring the profit or loss on the sale of ${gone.name}.`,
        lines: profit ? [dr('assetDisposal', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('assetDisposal', gap)],
        why: [
          `Asset Disposal A/c: debit ${inr(gone.cost)} (cost); credits ${inr(written)} (provision) + ${inr(sold)} (price) = ${inr(written + sold)}.`,
          profit
            ? `The credits are ${inr(gap)} more, so ${gone.name} fetched more than its book value of ${inr(bv)}: Asset Disposal A/c is debited and Profit on Sale of Asset A/c is credited.`
            : `The debit is ${inr(gap)} more, so ${gone.name} fetched less than its book value of ${inr(bv)}: Loss on Sale of Asset A/c is debited and Asset Disposal A/c is credited.`,
        ],
      },
    ];
    entries.push(...steps);
    if (keptLast) entries.push({ date: st.end, lines: [dr('depreciation', keptLast.amount), cr('provisionForDepreciation', keptLast.amount)] });
    return { ...st, entries, details, steps, provided };
  },
  context: (s) =>
    [
      s.intro,
      ...s.told,
      `Depreciation: ${s.r}% a year ${METHOD_TEXT[s.method]}.`,
      ...(s.method === 'wdv' ? [WDV_WITH_PROVISION] : []),
      PERIOD_RULE,
      PROVISION_KEPT,
      'A sale is recorded through an Asset Disposal A/c.',
      'Its balance is then transferred to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.',
      'There was no other machinery.',
    ].join('\n'),
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const { y, n, gone, kept, keptLast, written } = s;
        let held = 0; // the provision at the start of the year
        const explanation = s.before.map((yr, i) => {
          const opened = held;
          held += yr.dep;
          return `${yearTitle(y, i)}: ${yr.work} It is debited to Depreciation A/c and credited here: ${quote('By', DEP_AC, yr.dep)}. The provision now stands at ${i > 0 ? `${inr(opened)} + ${inr(yr.dep)} = ` : ''}${inr(held)}, a credit balance: ${balancedAt(y, i, held, false, true)}.`;
        });
        const keptProv = kept && keptLast ? kept.cost - keptLast.close : 0;
        const steps = [
          `${s.saleWork}, provided on the date of sale: ${quote('By', DEP_AC, s.last.amount)}.`,
          `Depreciation provided on ${gone.name} up to the date of sale = ${s.provided} = ${inr(written)}. ${cap(gone.name)} has left the books, so the whole of it is transferred out of the provision by a debit: ${quote('To', 'Asset Disposal A/c', written)}.`,
          kept && keptLast
            ? `${s.keptWork}, on ${s.end}: ${quote('By', DEP_AC, keptLast.amount)}. What is left is the provision on ${kept.name}, ${inr(keptProv)}: ${balancedAt(y, n, keptProv, true, true)}.`
            : 'The two sides of the year now agree: nothing is left in the provision account, so there is no balance to carry down.',
        ];
        return {
          task: kept
            ? `Prepare Provision for Depreciation A/c in the books of ${s.owner} for the two years ended ${s.end}. ${RUN_TASK} ${SOLD_ROW_TASK}`
            : `Prepare Provision for Depreciation A/c in the books of ${s.owner} for the ${YEARS[n + 1]} years ended ${s.end}, from the purchase of the machine to its sale. ${ANY_BALANCE_TASK}`,
          title: 'Provision for Depreciation A/c',
          ...yearsOf(s.entries, 'provisionForDepreciation', y, n + 1, s.details),
          // Both results of a sale are on offer, so that the choices do not say which one this sale gave.
          distractors: ['Provision for Depreciation A/c', 'Machinery A/c', 'Bank A/c', 'Profit and Loss A/c', 'Profit on Sale of Asset A/c', 'Loss on Sale of Asset A/c'],
          explanation: [...explanation, `${yearTitle(y, n)}: ${steps.join(' ')}`],
          hints: [FORMAT_HINTS.provision[1], 'On the day a machine is sold, depreciate it up to that day; then all the depreciation ever provided on it leaves the provision account.'],
        };
      },
      verify: (q) => {
        const c = readSaleChain(q);
        const prov = (at: number): number => sum(c.held.map((m) => m.cost - c.value(m, at)));
        const years = c.ends.slice(0, -1).map((at, i) => ({
          dr: [[BALANCE_CD, prov(at)]] as Want[],
          cr: [...(i > 0 ? [[BALANCE_BD, prov(c.ends[i - 1])] as Want] : []), [DEP_AC, prov(at) - (i > 0 ? prov(c.ends[i - 1]) : 0)] as Want],
        }));
        const left = c.kept ? c.kept.cost - c.value(c.kept, c.end) : 0;
        years.push({
          dr: [['Asset Disposal A/c', c.gone.cost - c.bv], ...(c.kept ? [[BALANCE_CD, left] as Want] : [])],
          cr: [[BALANCE_BD, prov(c.open)], [DEP_AC, c.depToSale], ...(c.kept ? [[DEP_AC, c.value(c.kept, c.open) - c.value(c.kept, c.end)] as Want] : [])],
        });
        return accountIs(q, years, c.kept ? { cr: [BALANCE_BD, left] } : {});
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const { gone, sold, gap, profit, bv, written } = s;
        return {
          task: `Prepare Asset Disposal A/c in the books of ${s.owner} for the sale of ${gone.name} on ${s.saleDate} and close it.`,
          title: 'Asset Disposal A/c',
          ...ledgerPeriods(s.steps, 'assetDisposal', [{ closeOn: s.saleDate }]),
          distractors: ['Asset Disposal A/c', DEP_AC, profit ? 'Loss on Sale of Asset A/c' : 'Profit on Sale of Asset A/c', 'Profit and Loss A/c', BALANCE_CD, BALANCE_BD, 'Cash A/c'],
          explanation: [
            `${cap(gone.name)} leaves Machinery A/c at its cost, which is transferred here: ${quote('To', 'Machinery A/c', gone.cost)}.`,
            `Depreciation provided on ${gone.name} up to the date of sale = ${s.provided} = ${inr(written)}. All of it is transferred from the provision account, not only the charge of the last period: ${quote('By', 'Provision for Depreciation A/c', written)}.`,
            `The price received ${s.mode.text}: ${quote('By', 'Bank A/c', sold)}.`,
            `Debit side so far: ${inr(gone.cost)}. Credit side so far: ${inr(written)} + ${inr(sold)} = ${inr(written + sold)}.`,
            profit
              ? `The credits are ${inr(gap)} more: a profit, transferred by a debit that closes the account: ${quote('To', 'Profit on Sale of Asset A/c', gap)}.`
              : `The debits are ${inr(gap)} more: a loss, transferred by a credit that closes the account: ${quote('By', 'Loss on Sale of Asset A/c', gap)}.`,
            `Check: book value on the date of sale = ${inr(gone.cost)} - ${inr(written)} = ${inr(bv)}; price = ${inr(sold)}; ${profit ? 'profit' : 'loss'} = ${inr(gap)}.`,
          ],
          hints: H.disposal,
        };
      },
      verify: (q) => {
        const c = readSaleChain(q);
        return accountIs(q, [
          {
            dr: [['Machinery A/c', c.gone.cost], ...(c.result > 0 ? [['Profit on Sale of Asset A/c', c.result] as Want] : [])],
            cr: [['Provision for Depreciation A/c', c.gone.cost - c.bv], ['Bank A/c', c.sold], ...(c.result < 0 ? [['Loss on Sale of Asset A/c', -c.result] as Want] : [])],
          },
        ]);
      },
    },
    {
      kind: 'journal_set',
      make: (s) => ({
        task: `Pass the journal entries on ${s.saleDate} for the depreciation on ${s.gone.name} up to that date and for its sale through Asset Disposal A/c.`,
        transactions: asSet(s.steps),
        hints: H.disposal,
        distractorAccounts: [s.profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'profitAndLoss', 'cash'],
      }),
      verify: (q) => {
        const c = readSaleChain(q);
        const written = c.gone.cost - c.bv;
        return setIs(q, [
          pair('depreciation', 'provisionForDepreciation', c.depToSale),
          pair('assetDisposal', 'machinery', c.gone.cost),
          pair('provisionForDepreciation', 'assetDisposal', written),
          pair('bank', 'assetDisposal', c.sold),
          c.result > 0 ? pair('assetDisposal', 'profitOnSaleOfAsset', c.result) : pair('lossOnSaleOfAsset', 'assetDisposal', -c.result),
        ]);
      },
    },
  ],
});

/** Cases 10 and 11 read back from their text: the machines, which one was sold, when and for how much. */
function readSaleChain(q: { context?: string }) {
  const lines = (q.context ?? '').split('\n');
  const rule = lineWith(q, 'Depreciation:');
  const held = lines.filter((l) => l.includes(': Bought ')).map((l) => ({ name: /Bought machine ([AB]) /.exec(l)?.[1] ?? '', cost: amountsIn(l)[0], from: monthOf(l) }));
  const soldLine = lineWith(q, 'was sold for');
  const gone = held.find((m) => m.name !== '' && soldLine.includes(`Machine ${m.name} was sold`)) ?? held[0];
  const to = monthOf(soldLine);
  const start = Math.floor(held[0].from / 12) * 12; // 1 April of the first year
  /** The 31 Marches from the first year to the year of the sale, as months. */
  const ends = Array.from({ length: Math.floor(to / 12) - start / 12 + 1 }, (_, i) => start + 12 * (i + 1));
  const value = (m: Bought, at: number): number => bookValue(m.cost, methodOf(rule), rateOf(rule), m.from, at);
  const open = Math.floor(to / 12) * 12; // 1 April of the year of the sale
  const sold = amountsIn(soldLine)[0];
  return {
    held,
    gone,
    kept: held.find((m) => m !== gone) ?? null,
    ends,
    end: ends[ends.length - 1],
    open,
    value,
    sold,
    /** The book value of the machine sold on the date of sale, and its depreciation from 1 April to that date. */
    bv: value(gone, to),
    depToSale: value(gone, open) - value(gone, to),
    /** The profit on the sale; a loss is negative. */
    result: sold - value(gone, to),
  };
}

// ===============================================================================================================
// 12. MEDIUM, chained: one machine under two methods. Machinery A/c for three years under one of them, then the
//     other method's charge and the difference between the two book values (after `case-asset-methods-compared`)
// ===============================================================================================================

const chainTwoMethods = caseTemplate({
  id: 'case-asset-chain-two-methods',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Machinery A/c under one method, compared with the other',
  setup: (rng) => {
    const sc = scene(rng, 11, MACHINE_BUSINESSES);
    const y = rng.int(2020, 2023); // the third year ends on 31 March 2026 at the latest
    // The straight line method is given as a rate in most seeds and as a life and a scrap value in the others.
    const byLife = rng.int(0, 2) === 0;
    const [rS, rW] = byLife ? [0, rng.pick([15, 20, 25, 30])] : rng.pick([[10, 10], [15, 15], [20, 20], [10, 20], [10, 15], [15, 25], [15, 20], [20, 30]]);
    const life = rng.pick([5, 8, 10]);
    const shown = rng.int(1, 2); // the method Machinery A/c is prepared under; the charge of the other one is asked next
    const ask = rng.int(2, 3); // the year whose charge under the other method is asked
    // With a life, the scrap value is a tenth of the cost.
    const slmYear = (c: number) => (byLife ? (c % (10 * life) === 0 ? (c * 9) / (10 * life) : null) : charge(c, rS));
    // The charges are rows of an account here, so a cost is taken only if every one of them is in whole fifties of rupees.
    const round = (c: number): boolean => (slmYear(c) ?? 1) % 50 === 0 && (schedule(c, 'wdv', rW, [12, 12, 12])?.dep.every((d) => d % 50 === 0) ?? false);
    const cost = pickCost(rng, 200000, 800000, round);
    if (cost === null) return null;
    const dS = slmYear(cost)!;
    const w = schedule(cost, 'wdv', rW, [12, 12, 12])!;
    const bvS = cost - 3 * dS;
    const bvW = w.bv[2];
    if (bvS <= 0 || bvS === bvW || dS === w.dep[2]) return null;
    /** The charge of each year under the method shown, with the figure it is worked on and what it leaves. */
    const charges: DepCharge[] = [0, 1, 2].map((i) =>
      shown === 1 ? { amount: dS, months: 12, base: cost, close: cost - dS * (i + 1) } : { amount: w.dep[i], months: 12, base: i === 0 ? cost : w.bv[i - 1], close: w.bv[i] },
    );
    const entries: DatedEntry[] = [
      { date: `1 April ${y}`, lines: [dr('machinery', cost), cr('bank', cost)] },
      ...charges.map((c, i) => ({ date: endOf(y, i), lines: [dr('depreciation', c.amount), cr('machinery', c.amount)] })),
    ];
    return { ...sc, y, byLife, rS, rW, life, scrap: byLife ? cost / 10 : 0, shown, ask, cost, dS, w, bvS, bvW, charges, entries, end: endOf(y, 2) };
  },
  context: (s) =>
    [
      s.intro,
      // "Every year is a full year of use" below says what "put to use the same day" would: the line is kept short.
      `1 April ${s.y}: Bought ${s.biz.item} for ${inr(s.cost)} by cheque.`,
      `${s.owner} compares two methods of depreciation for its first three years:`,
      s.byLife
        ? `Method 1: straight line method, with a life of ${s.life} years and a scrap value of ${inr(s.scrap)}.`
        : `Method 1: ${s.rS}% a year ${METHOD_TEXT.slm}.`,
      `Method 2: ${s.rW}% a year ${METHOD_TEXT.wdv}.`,
      'Every year is a full year of use.',
      'Under either method the depreciation is credited to Machinery A/c itself.',
      'There is no other machinery.',
    ].join('\n'),
  parts: [
    {
      kind: 'account',
      make: (s) => ({
        task: `Prepare Machinery A/c in the books of ${s.owner} under Method ${s.shown} for the three years ended ${s.end}. ${RUN_TASK}`,
        title: 'Machinery A/c',
        ...yearsOf(s.entries, 'machinery', s.y, 3),
        distractors: ['Machinery A/c', 'Provision for Depreciation A/c', 'Profit and Loss A/c', 'Cash A/c', 'Purchases A/c'],
        explanation: [
          `${cap(s.biz.short)} is debited at its cost on 1 April ${s.y}: ${quote('To', 'Bank A/c', s.cost)}.`,
          ...s.charges.map((c, i) => {
            const work =
              s.shown === 2 || !s.byLife
                ? chargeWorking(s.shown === 1 ? s.rS : s.rW, s.cost, c, `the year ended ${endOf(s.y, i)}`)
                : i === 0
                  ? `Depreciation for a year = (Cost - Scrap value) / Life = (${inr(s.cost)} - ${inr(s.scrap)}) / ${s.life} = ${inr(s.dS)}, the same every year.`
                  : `The straight line charge does not change: ${inr(s.dS)} again.`;
            return `${yearTitle(s.y, i)}: ${work} It is written off the machine itself: ${quote('By', DEP_AC, c.amount)}. That leaves ${inr(c.close + c.amount)} - ${inr(c.amount)} = ${inr(c.close)}: ${balancedAt(s.y, i, c.close, i === 2)}.`;
          }),
        ],
        hints: [
          FORMAT_HINTS.run[0],
          s.shown === 1 ? 'Under the straight line method the charge is the same amount every year: it is worked on the cost, not on the balance of the account.' : H.wdv[0],
        ],
      }),
      verify: (q) => {
        const c = readMethodsCompared(q);
        const bv = (n: number): number => (q.prompt.includes('under Method 1') ? c.cost - n * c.dS : c.cost * Math.pow(1 - c.rW / 100, n));
        return accountIs(
          q,
          [0, 1, 2].map((i) => ({ dr: [i === 0 ? ['Bank A/c', c.cost] : [BALANCE_BD, bv(i)]], cr: [[DEP_AC, bv(i) - bv(i + 1)], [BALANCE_CD, bv(i + 1)]] })),
          { dr: [BALANCE_BD, bv(3)] },
        );
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        s.shown === 1
          ? numeric(
              `Under Method 2, what is the depreciation for the year ended 31 March ${s.y + s.ask}?`,
              s.w.dep[s.ask - 1],
              [
                [(s.cost * s.rW) / 100, 'Applied the rate to the original cost instead of the book value at the start of the year.'],
                [s.w.bv[s.ask - 1], 'Gave the book value at the end of that year instead of the depreciation.'],
                [s.w.dep[s.ask - 2], "Gave the previous year's depreciation."],
                [s.dS, 'Gave the yearly charge of Method 1.'],
                [charge(s.cost - s.dS * (s.ask - 1), s.rW), 'Applied the rate to the balance of Machinery A/c under Method 1. Under Method 2 the account would stand at a different book value.'],
                [s.cost - s.w.bv[s.ask - 1], 'Gave the total depreciation up to that date instead of the charge of that one year.'],
              ],
              workLines('', s.cost, 'wdv', s.rW, s.y, Array<number>(s.ask).fill(12), s.w, false),
              H.wdv,
            )
          : numeric(
              `Under Method 1, what is the depreciation for the year ended 31 March ${s.y + s.ask}?`,
              s.dS,
              [
                [s.w.dep[s.ask - 1], 'Gave the charge of Method 2 for that year.'],
                [s.byLife ? s.cost / s.life : null, 'Divided the whole cost by the life without first deducting the scrap value.'],
                [s.byLife ? null : charge(s.cost - s.dS * (s.ask - 1), s.rS), 'Applied the rate to a reducing balance. The straight line method charges it on the original cost every year.'],
                [s.byLife ? null : charge(s.w.bv[s.ask - 2], s.rS), 'Applied the rate to the balance of Machinery A/c under Method 2. The straight line method charges it on the original cost.'],
                [s.cost - s.dS * s.ask, 'Gave the book value at the end of that year instead of the depreciation.'],
                [s.dS * s.ask, 'Gave the total depreciation up to that date instead of the charge of that one year.'],
              ],
              [
                s.byLife
                  ? `Yearly depreciation = (Cost - Scrap value) / Life = (${inr(s.cost)} - ${inr(s.scrap)}) / ${s.life} = ${inr(s.dS)}.`
                  : `Yearly depreciation = ${s.rS}% of ${inr(s.cost)} = ${inr(s.dS)}.`,
                s.byLife ? 'The straight line method writes off the same amount in every year of the life.' : 'The straight line charge is worked on the original cost, so it is the same in every year.',
              ],
              H.slm,
            ),
      verify: (q) => {
        const c = readMethodsCompared(q);
        const n = intIn(q.prompt, /31 March (\d{4})/) - c.year;
        return answerIs(q, q.prompt.includes('Method 1') ? c.dS : c.cost * Math.pow(1 - c.rW / 100, n - 1) * (c.rW / 100));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric(
          `On 31 March ${s.y + 3}, by how much is the book value under one method more than the book value under the other?`,
          Math.abs(s.bvS - s.bvW),
          [
            [Math.abs(s.dS - s.w.dep[2]), 'Compared only the third-year charges of the two methods instead of the two book values.'],
            [Math.abs(2 * s.dS - s.w.dep[0] - s.w.dep[1]), 'Compared the depreciation of the first two years only.'],
            [s.bvW, 'Gave the book value under Method 2 instead of the difference.'],
            [s.bvS, 'Gave the book value under Method 1 instead of the difference.'],
            [Math.abs(s.dS - s.w.dep[0]), 'Compared only the first-year charges of the two methods instead of the two book values.'],
          ],
          [
            `Method 1: ${inr(s.cost)} - 3 x ${inr(s.dS)} = ${inr(s.bvS)}.`,
            `Method 2: ${inr(s.cost)} - (${s.w.dep.map(inr).join(' + ')}) = ${inr(s.bvW)}.`,
            `The balance of Machinery A/c on that date is the book value under Method ${s.shown}.`,
            `Difference = ${inr(Math.max(s.bvS, s.bvW))} - ${inr(Math.min(s.bvS, s.bvW))} = ${inr(Math.abs(s.bvS - s.bvW))}. Method ${s.bvS > s.bvW ? 1 : 2} leaves the higher book value.`,
          ],
          ['Find the book value after three years under each method.', 'Book value = cost - depreciation charged so far. Take the smaller book value from the larger.'],
        ),
      verify: (q) => {
        const c = readMethodsCompared(q);
        return answerIs(q, Math.abs(c.cost - 3 * c.dS - c.cost * Math.pow(1 - c.rW / 100, 3)));
      },
    },
  ],
});

const cases: CaseTemplate[] = [
  slmToSale, wdvPartYears, provisionDisposal, methodsCompared, capitalOrExpense, twoMachines, missingFigure,
  chainEntriesAndAccount, chainProvision, chainSale, chainDisposal, chainTwoMethods,
];

export default cases;
