import type { AccountQuestion, JournalSetQuestion, McqQuestion } from '@/content/types';
import type { JournalLine } from '@/engine/journal';
import { creditor, resolveAccount } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, post, type DatedEntry } from '@/engine/books';
import type { Rng } from '@/engine/rng';
import { accountTemplate, factsTemplate, formatINR, journalSetTemplate, journalTemplate, keepFor, ledgerPeriods, mcqTemplate, numericTemplate, rupees, setHolds } from '../authoring';
import type { AccountParts, AccountTemplate, FormatRowParts, JournalSetTemplate, McqParts, NumericParts, SetTransaction, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'depreciation';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - the accounting year ends on 31 March and an asset bought on 1 April is used for the full first year;
//  - straight line (SLM) depreciation is a fixed amount each year; written down value (WDV) is a percentage of the
//    opening book value; depreciation for a part year is charged for the whole months of use;
//  - every figure is worked in whole rupees; a combination that would leave paise is rejected (null) or avoided by
//    choosing the cost from the values that come out clean.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));

const FIRMS = ['Mehta & Sons', 'Rao Enterprises', 'Lakshmi Industries', 'Kiran Works', 'Sharma Brothers', 'Anita Manufacturing Co.'];

interface Asset {
  id: 'machinery' | 'furniture' | 'vehicles';
  name: string;
  items: string[];
}
const ASSETS: Asset[] = [
  { id: 'machinery', name: 'Machinery', items: ['a lathe machine', 'a packing machine', 'a printing press', 'a stitching machine', 'a flour mill'] },
  { id: 'furniture', name: 'Furniture', items: ['office furniture', 'showroom furniture', 'furniture for its new branch'] },
  { id: 'vehicles', name: 'Vehicles', items: ['a delivery van', 'a goods carrier', 'a three-wheeler tempo'] },
];
const MACHINES = ASSETS[0].items;

const MONTH_NAMES = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
/** `1 <month>` of the accounting year that starts on 1 April `y`; month index 0 is April, 11 is March. */
const dateIn = (y: number, k: number): string => `1 ${MONTH_NAMES[k]} ${k >= 9 ? y + 1 : y}`;
/** Every "1 <month> <year>" in a prompt (the lookbehind keeps "31 March" from matching). */
const DATE_RE = new RegExp(`(?<!\\d)1 (${MONTH_NAMES.join('|')}) (20\\d\\d)`, 'g');
const dateMonths = (s: string): number[] => [...s.matchAll(DATE_RE)].map((m) => MONTH_NAMES.indexOf(m[1]));

const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
const intIn = (s: string, re: RegExp): number => Number(re.exec(s)?.[1]);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;

const METHOD_TEXT = {
  slm: 'on its original cost (straight line method)',
  wdv: 'on its written down value (reducing balance)',
};
const slmCharge = (cost: number, r: number, months = 12): number => (cost * r * months) / 1200;

/** Depreciation and closing book value of each year under WDV; null if any figure is not in whole rupees. */
function wdv(cost: number, rate: number, years: number, firstMonths = 12): { dep: number[]; bv: number[] } | null {
  const dep: number[] = [];
  const bv: number[] = [];
  let open = cost;
  for (let y = 0; y < years; y++) {
    const top = open * rate * (y === 0 ? firstMonths : 12);
    if (top % 1200 !== 0) return null;
    const d = top / 1200;
    dep.push(d);
    open -= d;
    bv.push(open);
  }
  return { dep, bv };
}

/** A cost (whole thousands, preferring rounder steps) in [min, max] for which `ok` holds, or null if none does. */
function cleanCost(rng: Rng, min: number, max: number, ok: (cost: number) => boolean): number | null {
  for (const unit of [10000, 5000, 2000, 1000]) {
    const all: number[] = [];
    for (let c = min; c <= max; c += unit) if (ok(c)) all.push(c);
    if (all.length > 0) return rng.pick(all);
  }
  return null;
}

/** A numeric question's answer and errors, in the unit's scale (100 for rupees). Null when fewer than two distinct errors remain. */
function numeric(answer: number, errs: [number, string][], scale = 100): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  const a = Math.round(answer * scale);
  if (!(a > 0)) return null;
  const seen = new Set([a]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    const p = Math.round(v * scale);
    if (p > 0 && Number.isSafeInteger(p) && !seen.has(p) && seen.add(p)) commonErrors.push({ value: p, why });
  }
  return commonErrors.length >= 2 ? { answer: a, commonErrors } : null;
}

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

/** A wrong figure that is offered only when it comes to whole rupees; otherwise 0, which `numeric` drops. */
const whole = (v: number): number => (near(v, Math.round(v)) ? Math.round(v) : 0);

/** The working, one step per line, from the cost to the book value after `n` full years. */
function fullYearsWorking(method: 'slm' | 'wdv', cost: number, r: number, n: number): string[] {
  if (method === 'slm') {
    const d = (cost * r) / 100;
    return [
      `Depreciation each year = ${r}% of ${inr(cost)} = ${inr(d)}.`,
      `Depreciation for ${n} years = ${inr(d)} x ${n} = ${inr(d * n)}; book value = ${inr(cost)} - ${inr(d * n)} = ${inr(cost - d * n)}.`,
    ];
  }
  const s = wdv(cost, r, n)!;
  return s.dep.map((d, i) => `Year ${i + 1}: ${r}% of ${inr(i === 0 ? cost : s.bv[i - 1])} = ${inr(d)}; book value ${inr(s.bv[i])}.`);
}

const profitOrLoss = (x: number): string => (x > 0 ? `Profit of ${inr(x)}` : x < 0 ? `Loss of ${inr(-x)}` : 'No profit and no loss');

const H = {
  slm: ['Straight line: the same amount every year, (cost - scrap value) / life.', 'Check that the scrap value is deducted before dividing.'],
  wdv: ['Written down value: the rate is applied to the opening book value of each year, not to the cost.', 'Book value = cost - depreciation charged so far.'],
  part: ['Count the whole months from the purchase date to 31 March, then charge months / 12 of a full year.', 'Only the first year is a part year; later years are full years.'],
  sale: ['Book value on the date of sale = cost - total depreciation charged till then.', 'Selling price above book value is a profit; below it is a loss.'],
  prov: ['With a provision account, the asset stays at cost and the depreciation collects in the provision account.', 'Book value = asset at cost - provision for depreciation.'],
  // Added in the quality pass, in place of the default pair (each template that took one is at version 2).
  entry: [
    'Depreciation is an expense: which account is debited? Then ask where the credit goes: does the firm keep a provision account or not?',
    'No provision account: credit the asset itself. A provision account is kept: credit Provision for Depreciation A/c and leave the asset at cost.',
  ],
  assetCost: [
    'Are the carriage and the installation an expense of the year, or part of what the machine cost the firm?',
    'Debit the machine with price + carriage + installation; credit the supplier with the price and Cash or Bank with what was paid now.',
  ],
  saleEntry: [
    'Find the book value of the asset first. Is the price above it or below it?',
    'Credit the asset with its book value and debit Cash or Bank with the price; the difference goes to Profit on Sale (credit) or Loss on Sale (debit).',
  ],
  saleCompound: [
    'With a provision account, the asset stands at cost. What must be taken out of the books along with it?',
    'Credit the asset at cost, debit the provision on it and debit Cash or Bank with the price; price less book value is a profit (credit) or a loss (debit).',
  ],
  disposal: [
    'Asset Disposal A/c gathers three things: the cost of the asset (debit), the provision on it (credit) and the sale price (credit).',
    'If the credits come to more than the debit, the balance is a profit, closed by debiting Asset Disposal A/c; if less, a loss, closed by crediting it.',
  ],
  method: [
    'Look at the three figures: do they fall by the same amount each year, or by a smaller amount each year?',
    'Equal charges (an equal fall in book value) mean straight line; a fixed rate on a falling balance gives a falling charge: written down value.',
  ],
  theory: [
    'Depreciation spreads the cost of a fixed asset over its useful life. Is the statement about cost, use and time, or about cash and market prices?',
    'Its amount depends on the cost, the useful life and the scrap value; it is a non-cash charge against profit, not a valuation.',
  ],
  terms: [
    'What kind of asset is it: a tangible fixed asset, an intangible asset, or a natural resource?',
    'Tangible fixed assets are depreciated, intangible assets amortised, natural resources depleted.',
  ],
  methods: [
    'Straight line: a fixed amount on cost. Written down value: a fixed rate on a falling balance. Which pattern does each statement describe?',
    'Even use (leases, patents) suits straight line; heavy early use and rising repairs (plant, machinery, vehicles) suit written down value.',
  ],
};

/** The facts of a bank, each with the hint pair given. */
const withHints = (hints: string[], facts: McqParts[]): McqParts[] => facts.map((f) => ({ ...f, hints }));

// ===============================================================================================================
// EASY
// ===============================================================================================================

const slmAnnual = numericTemplate({
  id: 'dep-slm-annual', topicId: T, conceptId: 'dep-slm', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const life = rng.pick([4, 5, 8, 10]);
    const d = rng.step(4000, 40000, 2000);
    const scrap = rng.step(5000, 40000, 5000);
    const cost = scrap + d * life;
    if (scrap * 3 > cost) return null; // a scrap value above a third of the cost does not read like a real asset
    if (rng.int(0, 2) > 0) {
      const wording = rng.int(0, 2);
      const prompt =
        wording === 0
          ? `${firm} bought ${item} for ${inr(cost)}. It is expected to last ${life} years and then be sold as scrap for ${inr(scrap)}. How much depreciation does the straight line method charge each year?`
          : wording === 1
            ? `${item.charAt(0).toUpperCase() + item.slice(1)} was bought by ${firm} for ${inr(cost)}. Its scrap value after ${life} years of use is ${inr(scrap)}. Find the yearly depreciation under the straight line method.`
            : `${firm} charges depreciation by the straight line method. The cost of ${item} was ${inr(cost)}, the scrap value is ${inr(scrap)} and the working life is ${life} years. What is the annual depreciation?`;
      const n = numeric(d, [
        [cost / life, 'Divided the whole cost by the life and forgot to deduct the scrap value first.'],
        [cost - scrap, 'Found the depreciable amount but did not divide it by the number of years.'],
        [(cost + scrap) / life, 'Added the scrap value to the cost instead of deducting it.'],
      ]);
      return n && { prompt, ...n, explanation: ['Annual depreciation = (Cost - Scrap value) / Life.', `(${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}.`], hints: H.slm };
    }
    const prompt = `${firm} depreciates ${item} by ${inr(d)} every year by the straight line method. The asset cost ${inr(cost)} and is expected to last ${life} years. What scrap value does this assume at the end of its life?`;
    const n = numeric(scrap, [
      [cost - d, 'Deducted only one year of depreciation from the cost.'],
      [d * life, 'Gave the total depreciation over the life (the depreciable amount), not what is left as scrap.'],
      [cost - d * (life - 1), 'Deducted the depreciation of one year too few before taking what is left.'],
    ]);
    return n && { prompt, ...n, explanation: [`Total depreciation over the life = ${inr(d)} x ${life} = ${inr(d * life)}.`, `Scrap value = Cost - Total depreciation = ${inr(cost)} - ${inr(d * life)} = ${inr(scrap)}.`], hints: H.slm };
  },
  verify: (q) => {
    const [x, y] = amountsIn(q.prompt);
    const life = intIn(q.prompt, /(?:last|after|life is) (\d+) years/);
    return q.answer / 100 === (x - y) / life || q.answer / 100 === y - x * life;
  },
});

const slmRateAmount = numericTemplate({
  id: 'dep-slm-rate-amount', topicId: T, conceptId: 'dep-slm', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const cost = rng.step(100000, 800000, 20000);
    const r = rng.pick([5, 8, 10, 12, 15, 20]);
    const k = rng.pick([2, 3, 4]);
    const annual = (cost * r) / 100;
    if (rng.int(0, 1) === 0) {
      const n = numeric(annual, [
        [cost - annual, 'Gave the book value after one year instead of the depreciation.'],
        [cost * r, 'Multiplied by the rate but forgot to divide by 100.'],
      ]);
      return n && {
        prompt: `${firm} charges depreciation at ${r}% a year on the cost of ${item}, which was ${inr(cost)}, by the straight line method. What is the depreciation for one year?`,
        ...n,
        explanation: [`Depreciation = ${r}% of cost = ${r}/100 x ${inr(cost)} = ${inr(annual)} every year.`],
        hints: H.slm,
      };
    }
    const n = numeric(annual * k, [
      [annual, 'Found the depreciation for one year only.'],
      [cost - annual * k, 'Gave the book value after those years instead of the total depreciation.'],
      [whole(cost * (1 - Math.pow(1 - r / 100, k))), 'Applied the rate to a falling balance, which is the written down value method, not the straight line method.'],
    ]);
    return n && {
      prompt: `${firm} depreciates ${item} costing ${inr(cost)} at ${r}% a year on cost by the straight line method. What is the total depreciation charged in the first ${k} full years of use?`,
      ...n,
      explanation: [`Yearly depreciation = ${r}% of ${inr(cost)} = ${inr(annual)}.`, `Total for ${k} years = ${inr(annual)} x ${k} = ${inr(annual * k)}.`],
      hints: H.slm,
    };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /(\d+)%/);
    const k = /first (\d+) full years/.exec(q.prompt);
    return q.answer / 100 === (cost * r * (k ? Number(k[1]) : 1)) / 100;
  },
});

const slmBookValue = numericTemplate({
  id: 'dep-slm-book-value', topicId: T, conceptId: 'dep-slm', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const life = rng.pick([5, 8, 10]);
    const d = rng.step(3000, 30000, 3000);
    const scrap = rng.step(5000, 30000, 5000);
    const cost = scrap + d * life;
    if (scrap * 3 > cost) return null;
    const n = rng.int(2, Math.min(life - 1, 6));
    const bv = cost - d * n;
    const num = numeric(bv, [
      [d * n, 'Gave the total depreciation charged instead of the book value that remains.'],
      [cost - d, 'Deducted only one year of depreciation.'],
      [cost - cost * (n / life), 'Divided the whole cost, scrap value included, by the life to get the yearly charge.'],
    ]);
    return num && {
      prompt: `${firm} bought ${item} for ${inr(cost)}. Its life is ${life} years and its scrap value is ${inr(scrap)}. Using the straight line method and charging a full year every year, what is its book value at the end of ${n} years?`,
      ...num,
      explanation: [`Annual depreciation = (${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}.`, `Depreciation for ${n} years = ${inr(d * n)}.`, `Book value = ${inr(cost)} - ${inr(d * n)} = ${inr(bv)}.`],
      hints: H.slm,
    };
  },
  verify: (q) => {
    const [cost, scrap] = amountsIn(q.prompt);
    const life = intIn(q.prompt, /life is (\d+) years/);
    const n = intIn(q.prompt, /end of (\d+) years/);
    return near(q.answer / 100, cost - ((cost - scrap) / life) * n);
  },
});

const slmRate = numericTemplate({
  id: 'dep-slm-rate', topicId: T, conceptId: 'dep-slm', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const life = rng.pick([4, 5, 8, 10]);
    const r = rng.pick([8, 9, 10, 15, 16, 18, 20].filter((x) => x * life <= 90 && x * life >= 70));
    const cost = rng.step(100000, 600000, 50000); // keeps the scrap value a round figure
    const d = (cost * r) / 100;
    const scrap = cost - d * life;
    const item = rng.pick(rng.pick(ASSETS).items);
    const n = numeric(r * 100, [
      [10000 / life, 'Divided 100% by the life, which ignores the scrap value that is never depreciated.'],
      [r * life * 100, 'Gave the percentage written off over the whole life instead of the yearly rate.'],
    ], 1);
    return n && {
      prompt: `${rng.pick(FIRMS)} bought ${item} for ${inr(cost)}. Its life is ${life} years and its scrap value is ${inr(scrap)}. Under the straight line method, what is the annual rate of depreciation as a percentage of cost?`,
      ...n,
      explanation: [`Annual depreciation = (${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}.`, `Rate = ${inr(d)} / ${inr(cost)} x 100 = ${r}%.`],
      hints: ['First find the yearly depreciation amount.', 'Rate of depreciation = yearly depreciation / cost x 100.'],
    };
  },
  verify: (q) => {
    const [cost, scrap] = amountsIn(q.prompt);
    const life = intIn(q.prompt, /life is (\d+) years/);
    return near(q.answer / 100, ((cost - scrap) / life / cost) * 100);
  },
});

const wdvFirstYear = numericTemplate({
  id: 'dep-wdv-first-year', topicId: T, conceptId: 'dep-wdv', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const cost = rng.step(50000, 500000, 10000);
    const r = rng.pick([10, 15, 20, 25, 30]);
    const dep = (cost * r) / 100;
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const base = `${firm} bought ${item} for ${inr(cost)} on 1 April, the first day of its accounting year, and charges depreciation at ${r}% a year by the written down value method.`;
    if (rng.int(0, 1) === 0) {
      const n = numeric(dep, [
        [cost - dep, 'Gave the book value at the end of the year instead of the depreciation.'],
        [cost * r, 'Multiplied by the rate but forgot to divide by 100.'],
      ]);
      return n && { prompt: `${base} What is the depreciation for the first year?`, ...n, explanation: [`First-year depreciation = ${r}% of ${inr(cost)} = ${inr(dep)}.`], hints: H.wdv };
    }
    const n = numeric(cost - dep, [
      [dep, 'Gave the depreciation instead of the book value that remains.'],
      [cost + dep, 'Added the depreciation to the cost instead of deducting it.'],
    ]);
    return n && { prompt: `${base} What is its book value at the end of the first year?`, ...n, explanation: [`Depreciation = ${r}% of ${inr(cost)} = ${inr(dep)}.`, `Book value = ${inr(cost)} - ${inr(dep)} = ${inr(cost - dep)}.`], hints: H.wdv };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /(\d+)%/);
    const ans = q.answer / 100;
    return q.prompt.endsWith('depreciation for the first year?') ? ans === (cost * r) / 100 : ans === (cost * (100 - r)) / 100;
  },
});

const wdvRate = numericTemplate({
  id: 'dep-wdv-rate', topicId: T, conceptId: 'dep-wdv', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const open = rng.step(40000, 400000, 20000);
    const r = rng.pick([5, 10, 15, 20, 25, 30, 40]);
    const dep = (open * r) / 100;
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const prompt =
      rng.int(0, 1) === 0
        ? `${firm} bought ${item} for ${inr(open)} and charged ${inr(dep)} as depreciation for the first full year under the written down value method. What is the rate of depreciation?`
        : `Under the written down value method, the book value of ${item} owned by ${firm} at the start of a year was ${inr(open)} and the depreciation charged for that year was ${inr(dep)}. What is the rate of depreciation?`;
    const n = numeric(r * 100, [
      [(100 - r) * 100, 'Gave the percentage of value that is left after depreciation instead of the rate.'],
      [(dep * 10000) / (open - dep), 'Divided the depreciation by the closing book value instead of the opening one.'],
    ], 1);
    return n && { prompt, ...n, explanation: [`Rate = Depreciation / Opening book value x 100.`, `${inr(dep)} / ${inr(open)} x 100 = ${r}%.`], hints: H.wdv };
  },
  verify: (q) => {
    const [open, dep] = amountsIn(q.prompt);
    return near(q.answer / 100, (dep / open) * 100);
  },
});

const costCapitalised = numericTemplate({
  id: 'dep-cost-capitalised', topicId: T, conceptId: 'dep-cost', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const price = rng.step(100000, 800000, 20000);
    const extras = rng.shuffle([
      ['carriage to bring it to the factory', rng.step(2000, 20000, 2000)],
      ['installation and testing', rng.step(3000, 30000, 3000)],
      ['customs duty on the imported machine', rng.step(5000, 40000, 5000)],
    ] as [string, number][]).slice(0, 2);
    const [[e1, a1], [e2, a2]] = extras;
    const total = price + a1 + a2;
    const n = numeric(total, [
      [price, 'Recorded only the invoice price and treated the extra costs as expenses.'],
      [price + a1, `Left out the ${e2}, which is also needed to make the machine ready for use.`],
      [price + a2, `Left out the ${e1}, which is also needed to make the machine ready for use.`],
    ]);
    return n && {
      prompt: `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} with an invoice price of ${inr(price)}. It also paid ${inr(a1)} for ${e1} and ${inr(a2)} for ${e2}. At what amount is the machine recorded in the books?`,
      ...n,
      explanation: ['Cost of an asset = purchase price + every cost of bringing it to the place and making it ready for use.', `${inr(price)} + ${inr(a1)} + ${inr(a2)} = ${inr(total)}.`],
      hints: ['Which payments were needed to get the machine into working condition?', 'These are capitalised: added to the asset, not charged as expenses.'],
    };
  },
  verify: (q) => {
    const [p, a, b] = amountsIn(q.prompt);
    return q.answer / 100 === p + a + b;
  },
});

const COST_ITEMS: ((x: string) => string)[] = [
  (x) => `${x} paid as carriage to bring the machine to the factory`,
  (x) => `${x} paid to engineers for installing and testing the machine`,
  (x) => `${x} spent on building a special foundation for the machine`,
  (x) => `${x} paid as customs duty on the imported machine`,
];
const RUNNING_ITEMS: [(x: string) => string, string][] = [
  [(x) => `${x} paid as wages to the operator who runs the machine every day`, 'Added a running cost to the asset; wages are an expense charged to profit and loss.'],
  [(x) => `${x} paid as annual maintenance charges after the machine starts working`, 'Treated a yearly upkeep cost as part of the cost of the asset.'],
  [(x) => `${x} spent on repairs after two years of use`, 'Capitalised a repair, which only keeps the asset working and is an expense.'],
  [(x) => `${x} paid as the insurance premium for the second year of use`, 'Treated a yearly insurance premium, a cost of keeping the machine, as part of what it cost to acquire.'],
  [(x) => `${x} paid for electricity used in the first month of production`, 'Treated the running cost of using the asset as part of what it cost to acquire.'],
];
const costItems = mcqTemplate({
  id: 'dep-cost-items', topicId: T, conceptId: 'dep-cost', difficulty: 'easy',
  generate: (rng) => {
    const pay = () => inr(rng.step(2000, 40000, 2000));
    const right = rng.pick(COST_ITEMS)(pay());
    const wrong = RUNNING_ITEMS.map(([text, why]): [string, string] => [text(pay()), why]);
    const price = inr(rng.step(100000, 800000, 20000));
    const prompt = rng.pick([
      `${rng.pick(FIRMS)} buys ${rng.pick(MACHINES)} for ${price}. Which of these payments is added to the cost on which depreciation will be charged?`,
      `A firm buys a new machine for ${price}. Which of the following payments is capitalised, that is, added to the cost of the machine?`,
    ]);
    return choice(prompt, right, wrong, 'Anything spent to bring the machine to the factory and make it ready for use is part of its cost. Running costs, upkeep and repairs are expenses of the years in which they arise.', [
      'Is the payment needed to get the machine ready, or does it arise from running it?',
      'Cost of an asset = price + carriage + installation + similar costs up to the point of use.',
    ]);
  },
});

const methodName = mcqTemplate({
  id: 'dep-method-name', topicId: T, conceptId: 'dep-compare', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const isSlm = rng.int(0, 1) === 0;
    const r = rng.pick([10, 20, 30]);
    const showBv = rng.int(0, 1) === 0;
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, 3) !== null);
    if (cost === null) return null;
    const d = (cost * r) / 100;
    const series = isSlm
      ? showBv ? [cost - d, cost - 2 * d, cost - 3 * d] : [d, d, d]
      : showBv ? wdv(cost, r, 3)!.bv : wdv(cost, r, 3)!.dep;
    const [a, b, c] = series.map(inr);
    const prompt = showBv
      ? `An asset costing ${inr(cost)} was bought on 1 April. Its book value at the end of the first three years was ${a}, ${b} and ${c}. Which method of depreciation is being used?`
      : `An asset costing ${inr(cost)} was bought on 1 April. Depreciation charged in the first three years was ${a}, ${b} and ${c}. Which method of depreciation is being used?`;
    const slmText = 'Straight line method';
    const wdvText = 'Written down value method';
    return isSlm
      ? choice(prompt, slmText, [
          [wdvText, 'Took equal yearly charges for a percentage of a falling balance; under WDV the charge falls every year.'],
          ['Revaluation method', 'Picked a method that values the asset afresh each year; it does not give a fixed yearly pattern.'],
          ['Annuity method', 'Picked a method that brings in interest on the money invested; it is not an equal yearly charge on cost.'],
        ], 'The same amount is written off every year, so the asset loses equal slices of its cost: straight line.', H.method)
      : choice(prompt, wdvText, [
          [slmText, 'Took a falling yearly charge for an equal one; the straight line method charges the same amount every year.'],
          ['Revaluation method', 'Picked a method that values the asset afresh each year; the pattern here is a fixed rate on the reducing balance.'],
          ['Annuity method', 'Picked a method that brings in interest on the money invested; the pattern here is a fixed rate on the reducing balance.'],
        ], 'The charge falls each year because the rate is applied to a shrinking book value: written down value.', H.method);
  },
  verify: (q) => {
    const a = amountsIn(q.prompt).slice(1);
    const eq = q.prompt.includes('book value') ? a[0] - a[1] === a[1] - a[2] : a[0] === a[1] && a[1] === a[2];
    return optionText(q) === (eq ? 'Straight line method' : 'Written down value method');
  },
});

const CAUSES = {
  wear: 'Wear and tear from use',
  obsolete: 'Obsolescence',
  time: 'Expiry of time (the period of a lease or a patent)',
  exhaust: 'Exhaustion of a natural resource',
  market: 'A fall in the market price of the asset',
};
type Cause = keyof typeof CAUSES;
const CAUSE_SCENARIOS: [string, Cause][] = [
  ['A printing press has run three shifts a day for years and its rollers and bearings are wearing out.', 'wear'],
  ['A delivery van has covered 1,40,000 km and its engine is weaker every year.', 'wear'],
  ['A firm replaces computers that still work because the new software no longer runs on them.', 'obsolete'],
  ['A machine in perfect condition is dropped from use because a newer model makes the same goods at half the cost.', 'obsolete'],
  ['A factory is on a 10-year lease, and with every year that passes the unexpired part of the lease becomes shorter.', 'time'],
  ['A firm owns a patent that gives it the sole right to a process for 15 years; each year there is less of that right left.', 'time'],
  ['A stone quarry is worked year after year and the stone left in the ground keeps getting less.', 'exhaust'],
  ['A mining company takes ore from a mine every year, and the reserve shrinks with each tonne removed.', 'exhaust'],
  ['The tyres, engine and gearbox of a goods carrier that runs 400 km every day are wearing out.', 'wear'],
  ['A flour mill grinds grain for 16 hours a day and its grinding stones are wearing thin.', 'wear'],
  ['A firm stops using its typewriters, although they work well, because computers do the same job much faster.', 'obsolete'],
  ['A bank replaces a cheque-sorting machine that still works because a much faster model has come on the market.', 'obsolete'],
  ['A shop is held on a 6-year lease, and with every year that passes the unexpired part of the lease gets shorter.', 'time'],
  ['A firm pays for a licence to use a brand name for 8 years, and the licence is worth less as the 8 years run out.', 'time'],
  ['An oil well gives crude oil every year, and the reserve left under the ground keeps falling.', 'exhaust'],
  ['A construction firm digs sand from a pit it has leased, and the sand left in the pit gets less every year.', 'exhaust'],
];
const CAUSE_WHY: Record<Cause, string> = {
  wear: 'Picked wear and tear, but nothing in the situation is about the physical use of the asset.',
  obsolete: 'Picked obsolescence, but the asset is not being replaced because a newer model has arrived.',
  time: 'Picked expiry of time, but the asset is not a right that runs out after a fixed period.',
  exhaust: 'Picked exhaustion, but the asset is not a natural deposit that is being extracted.',
  market: 'Picked a fall in the market price, which is not a cause of depreciation: depreciation is about use and the passing of time, not price movements.',
};
const depCause = mcqTemplate({
  id: 'dep-cause', topicId: T, conceptId: 'dep-meaning', difficulty: 'easy',
  generate: (rng) => {
    const [text, right] = rng.pick(CAUSE_SCENARIOS);
    const wrong = (Object.keys(CAUSES) as Cause[]).filter((c) => c !== right).map((c): [string, string] => [CAUSES[c], CAUSE_WHY[c]]);
    return choice(`${text} Which cause of depreciation does this describe?`, CAUSES[right], wrong, `${CAUSES[right]} is what lowers the usefulness of the asset here, so a part of its cost is charged each year.`, [
      'What is happening to the asset: use, a newer rival, a fixed period running out or a deposit running down?',
      'Market price changes are not a cause of depreciation.',
    ]);
  },
});

const PURPOSES: { q: string; right: string; wrong: [string, string][]; why: string }[] = [
  {
    q: 'What is the main reason for charging depreciation every year?',
    right: 'To spread the cost of the asset over the years in which it is used',
    wrong: [
      ['To keep cash aside in a separate fund for buying a new asset', 'Confused depreciation with a cash fund; depreciation is a book entry and does not set aside any cash.'],
      ['To show what the asset would sell for today', 'Treated depreciation as a valuation; it allocates cost and does not try to follow the market price.'],
      ['To record the money spent on repairing the asset', 'Mixed up depreciation with repairs, which are a separate expense.'],
    ],
    why: 'The asset gives service over several years, so its cost is charged to those years instead of to the year of purchase alone.',
  },
  {
    q: 'Depreciation is described as a non-cash expense because:',
    right: 'No money leaves the business when it is charged',
    wrong: [
      ['It is paid only by cheque', 'Thought the mode of payment decides the type; no payment is made at all.'],
      ['It is never shown in the profit and loss account', 'Thought non-cash means not recorded; it is charged against profit like any expense.'],
      ['It is paid at the end of the asset\'s life', 'Thought depreciation is a debt settled later; it is only a charge in the books.'],
    ],
    why: 'The cash was spent when the asset was bought. Each year\'s depreciation only moves a part of that cost into the expenses.',
  },
  {
    q: 'What does charging depreciation do to profit and to the book value of the asset?',
    right: 'It reduces both the profit and the book value of the asset',
    wrong: [
      ['It reduces the profit but raises the book value of the asset', 'Took a deduction from the asset\'s value as an addition.'],
      ['It reduces the book value only; profit is unchanged', 'Forgot that depreciation is an expense charged to profit and loss.'],
      ['It increases the profit and reduces the cash', 'Thought of depreciation as an income and as a cash payment.'],
    ],
    why: 'Depreciation is an expense, so profit falls, and the cost written off lowers the book value of the asset.',
  },
  {
    q: 'Which of these is NOT a cause of depreciation?',
    right: 'A fall in the price at which similar assets are being sold',
    wrong: [
      ['A machine is used for years and its parts wear out', 'Wear and tear is a real cause of depreciation, so it cannot be the odd one out.'],
      ['A new model makes a machine out of date', 'Obsolescence is a real cause of depreciation, so it cannot be the odd one out.'],
      ['A lease runs out after a fixed number of years', 'Expiry of time is a real cause of depreciation, so it cannot be the odd one out.'],
    ],
    why: 'Depreciation arises from use, obsolescence and the passing of time. Market price movements are not a cause.',
  },
  {
    q: 'Land is generally not depreciated because:',
    right: 'Its usefulness is not used up by the passing of time or by use',
    wrong: [
      ['It is a current asset', 'Called land a current asset; it is a fixed asset.'],
      ['It is not bought with the money of the business', 'Thought only assets bought with business money are depreciated.'],
      ['Its price always rises', 'Thought price changes decide depreciation; the reason is that land is not worn out by use or time.'],
    ],
    why: 'Land does not wear out, so no part of its cost is used up each year.',
  },
  {
    q: 'Which statement about charging depreciation is correct?',
    right: 'It is charged even in a year when the business makes a loss',
    wrong: [
      ['It is charged only in a year when the business makes a profit', 'Treated depreciation as a share of profit; it is an expense of using the asset and is charged every year.'],
      ['It is charged only in the year in which the asset is repaired', 'Linked depreciation to repairs; it is charged for the use of the asset, with or without repairs.'],
      ['It is charged only in the year in which the asset is sold', 'Thought depreciation arises only on sale; it is charged every year of use.'],
    ],
    why: 'Depreciation is the cost of using the asset in the year, so it is charged whether the year ends in profit or loss.',
  },
  {
    q: 'At what amount is a machine shown in the balance sheet after depreciation has been charged?',
    right: 'Its cost less the depreciation charged so far',
    wrong: [
      ['Its current market price', 'Used the market price; the balance sheet figure comes from cost and depreciation.'],
      ['Its original cost, whatever the depreciation', 'Ignored the depreciation, which has to be deducted from the cost.'],
      ['Its scrap value from the first day', 'Wrote the machine down to its scrap value at once instead of spreading the fall over its life.'],
    ],
    why: 'The balance sheet shows the book value: cost less the depreciation charged to date.',
  },
  {
    q: 'A machine costing ₹1,00,000 earns income for five years. Why is the cost not simply charged in the year of purchase?',
    right: 'The machine helps to earn income in every year of use, so each year should carry a share of the cost',
    wrong: [
      ['Because the cost cannot be recorded until the machine is sold', 'Thought the cost is recorded only on sale; it is recorded when the machine is bought.'],
      ['Because the cost is paid in five yearly instalments', 'Linked depreciation to the payments; it follows the years of use, however the machine is paid for.'],
      ['Because the law forbids a loss in the first year', 'Invented a rule; the reason is matching the cost with the years that earn from it.'],
    ],
    why: 'Matching the cost with the income of the years in which the asset is used is the reason for spreading it.',
  },
];
const depPurpose = mcqTemplate({
  id: 'dep-purpose', topicId: T, conceptId: 'dep-meaning', difficulty: 'easy',
  generate: (rng) => {
    const p = rng.pick(PURPOSES);
    return choice(p.q, p.right, p.wrong, p.why, ['Think about what depreciation is: a part of the cost used up in the year.', 'Depreciation is an expense and a write-down of the asset, not a cash payment.']);
  },
});

const monthsUsed = numericTemplate({
  id: 'dep-months-used', topicId: T, conceptId: 'dep-part-year', difficulty: 'easy', unit: 'number',
  generate: (rng) => {
    const y = rng.int(2021, 2025);
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const kind = rng.int(0, 2);
    const base = `The accounting year of ${firm} ends on 31 March. It charges depreciation in whole months, for the period an asset is in use.`;
    if (kind === 0) {
      const k = rng.int(1, 10);
      const m = 12 - k;
      const n = numeric(m, [
        [12, 'Charged a full year although the asset was not owned for the whole year.'],
        [k, 'Counted the months before the purchase instead of the months after it.'],
        [m - 1, 'Left out the month in which the asset was bought.'],
      ], 1);
      return n && {
        prompt: `${base} It bought ${item} on ${dateIn(y, k)}. For how many months is depreciation charged in the year ended 31 March ${y + 1}?`,
        ...n,
        explanation: [`From ${dateIn(y, k)} to 31 March ${y + 1} is ${m} months.`],
        hints: H.part,
      };
    }
    if (kind === 1) {
      const k = rng.int(2, 10);
      const n = numeric(k, [
        [12, 'Charged a full year although the asset was sold part-way through the year.'],
        [12 - k, 'Counted the months after the sale instead of the months before it.'],
        [k + 1, 'Counted the month of the sale as well, though the asset was gone on its first day.'],
      ], 1);
      return n && {
        prompt: `${base} It sold ${item}, which it had owned for several years, on ${dateIn(y, k)}. For how many months is depreciation charged in the year of sale, the year ended 31 March ${y + 1}?`,
        ...n,
        explanation: [`The year starts on 1 April ${y}. From 1 April to ${dateIn(y, k)} is ${k} months of use.`],
        hints: H.part,
      };
    }
    const k1 = rng.int(1, 5);
    const k2 = rng.int(k1 + 2, 11);
    const m = k2 - k1;
    const n = numeric(m, [
      [m + 1, 'Counted both the month of purchase and the month of sale.'],
      [12 - k1, 'Counted up to the end of the year and ignored the sale.'],
      [m - 1, 'Left out the month of purchase, although the asset was in use from the first day of it.'],
    ], 1);
    return n && {
      prompt: `${base} It bought ${item} on ${dateIn(y, k1)} and sold it on ${dateIn(y, k2)}, in the same accounting year. For how many months is depreciation charged?`,
      ...n,
      explanation: [`From ${dateIn(y, k1)} to ${dateIn(y, k2)} is ${m} months.`],
      hints: H.part,
    };
  },
  verify: (q) => {
    const dates = dateMonths(q.prompt);
    if (dates.length === 2) return q.answer === dates[1] - dates[0];
    return q.answer === (q.prompt.includes(' sold ') ? dates[0] : 12 - dates[0]);
  },
});

const journalDirect = journalTemplate({
  id: 'dep-journal-asset', topicId: T, conceptId: 'dep-accounting', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const a = rng.pick(ASSETS);
    const amt = rupees(rng.step(2000, 60000, 1000));
    const lower = a.name.toLowerCase();
    const prompt = rng.pick([
      `Depreciation on ${lower} for the year is ${formatINR(amt)}. The firm reduces the asset account directly and keeps no provision account. Pass the journal entry.`,
      `At the end of the year, ${formatINR(amt)} is to be written off the ${lower} as depreciation. The depreciation is credited to the asset account itself. Pass the entry.`,
    ]);
    return {
      prompt,
      lines: [{ accountId: 'depreciation', side: 'Dr', amount: amt }, { accountId: a.id, side: 'Cr', amount: amt }],
      explanation: ['Depreciation is an expense, so Depreciation A/c is debited.', `The asset is reduced directly, so ${a.name} A/c is credited.`],
      distractorAccounts: ['provisionForDepreciation'],
      hints: H.entry,
    };
  },
});

const journalProvision = journalTemplate({
  id: 'dep-journal-provision', topicId: T, conceptId: 'dep-accounting', difficulty: 'easy', version: 2,
  generate: (rng) => {
    const a = rng.pick(ASSETS);
    const amt = rupees(rng.step(2000, 60000, 1000));
    const lower = a.name.toLowerCase();
    const prompt = rng.pick([
      `Depreciation on ${lower} for the year is ${formatINR(amt)}. The firm keeps the asset at cost and collects depreciation in a Provision for Depreciation account. Pass the journal entry.`,
      `${formatINR(amt)} is to be charged as depreciation on ${lower} for the year. The asset stays at its original cost and a Provision for Depreciation A/c is maintained. Pass the entry.`,
    ]);
    return {
      prompt,
      lines: [{ accountId: 'depreciation', side: 'Dr', amount: amt }, { accountId: 'provisionForDepreciation', side: 'Cr', amount: amt }],
      explanation: ['Depreciation is an expense, so Depreciation A/c is debited.', `The ${lower} account is not touched; Provision for Depreciation A/c is credited.`],
      distractorAccounts: [a.id],
      hints: H.entry,
    };
  },
});

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

const slmPartYear = numericTemplate({
  id: 'dep-slm-part-year', topicId: T, conceptId: 'dep-part-year', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2025);
    const firm = rng.pick(FIRMS);
    const item = rng.pick(rng.pick(ASSETS).items);
    const k = rng.int(1, 9);
    const m = 12 - k;
    const tail = `The accounting year ends on 31 March and depreciation is charged for the period of use, in whole months from the date of purchase.`;
    if (rng.int(0, 1) === 0) {
      const life = rng.pick([4, 5, 8, 10]);
      const d = rng.step(6000, 60000, 3000);
      const scrap = rng.step(5000, 40000, 5000);
      const cost = scrap + d * life;
      const dep = (d * m) / 12;
      const n = numeric(dep, [
        [d, 'Charged a full year although the asset was used for only part of the first year.'],
        [(d * k) / 12, 'Counted the months before the purchase instead of the months of use.'],
        [whole((cost * m) / (12 * life)), 'Ignored the scrap value when finding the yearly depreciation.'],
      ]);
      return n && {
        prompt: `${firm} bought ${item} on ${dateIn(y, k)} for ${inr(cost)}. Its life is ${life} years and its scrap value is ${inr(scrap)}. ${tail} What is the depreciation by the straight line method for the year ended 31 March ${y + 1}?`,
        ...n,
        explanation: [`Annual depreciation = (${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}.`, `Months of use = ${m}, so depreciation = ${inr(d)} x ${m}/12 = ${inr(dep)}.`],
        hints: H.part,
      };
    }
    const r = rng.pick([5, 10, 12, 15, 20]);
    const cost = rng.step(60000, 480000, 12000);
    const full = (cost * r) / 100;
    const dep = slmCharge(cost, r, m);
    const n = numeric(dep, [
      [full, 'Charged a full year although the asset was used for only part of the first year.'],
      [slmCharge(cost, r, k), 'Counted the months before the purchase instead of the months of use.'],
      [slmCharge(cost, r, m - 1), 'Left out the month of purchase when counting the months of use.'],
    ]);
    return n && {
      prompt: `${firm} bought ${item} on ${dateIn(y, k)} for ${inr(cost)} and writes it off at ${r}% a year on cost by the straight line method. ${tail} What is the depreciation for the year ended 31 March ${y + 1}?`,
      ...n,
      explanation: [`Full-year depreciation = ${r}% of ${inr(cost)} = ${inr(full)}.`, `Months of use = ${m}, so depreciation = ${inr(full)} x ${m}/12 = ${inr(dep)}.`],
      hints: H.part,
    };
  },
  verify: (q) => {
    const k = dateMonths(q.prompt)[0];
    const m = 12 - k;
    const [cost, scrap] = amountsIn(q.prompt);
    if (q.prompt.includes('scrap value')) {
      const life = intIn(q.prompt, /life is (\d+) years/);
      return near(q.answer / 100, ((cost - scrap) * m) / (life * 12));
    }
    return near(q.answer / 100, (cost * intIn(q.prompt, /(\d+)% a year/) * m) / 1200);
  },
});

const wdvPartYear = numericTemplate({
  id: 'dep-wdv-part-year', topicId: T, conceptId: 'dep-part-year', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2025);
    const k = rng.int(1, 9);
    const m = 12 - k;
    const r = rng.pick([10, 15, 20, 25]);
    const cost = rng.step(60000, 480000, 12000);
    const dep = (cost * r * m) / 1200;
    const base = `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} on ${dateIn(y, k)} for ${inr(cost)} and charges depreciation at ${r}% a year by the written down value method. The accounting year ends on 31 March and depreciation is charged for the period of use, in whole months from the date of purchase.`;
    if (rng.int(0, 1) === 0) {
      const n = numeric(dep, [
        [(cost * r) / 100, 'Charged a full year although the machine was used for only part of the year.'],
        [(cost * r * k) / 1200, 'Counted the months before the purchase instead of the months of use.'],
        [(cost * r * (m - 1)) / 1200, 'Left out the month of purchase when counting the months of use.'],
      ]);
      return n && { prompt: `${base} What is the depreciation for the year ended 31 March ${y + 1}?`, ...n, explanation: [`Full-year depreciation = ${r}% of ${inr(cost)} = ${inr((cost * r) / 100)}.`, `Months of use = ${m}, so depreciation = ${inr((cost * r) / 100)} x ${m}/12 = ${inr(dep)}.`], hints: H.part };
    }
    const n = numeric(cost - dep, [
      [dep, 'Gave the depreciation instead of the book value.'],
      [cost - (cost * r) / 100, 'Deducted a full year of depreciation although the machine was used for part of the year only.'],
      [cost - (cost * r * k) / 1200, 'Counted the months before the purchase instead of the months of use.'],
    ]);
    return n && { prompt: `${base} What is its book value on 31 March ${y + 1}?`, ...n, explanation: [`Full-year depreciation = ${r}% of ${inr(cost)} = ${inr((cost * r) / 100)}.`, `Months of use = ${m}, so depreciation = ${inr((cost * r) / 100)} x ${m}/12 = ${inr(dep)}.`, `Book value = ${inr(cost)} - ${inr(dep)} = ${inr(cost - dep)}.`], hints: H.part };
  },
  verify: (q) => {
    const k = dateMonths(q.prompt)[0];
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const dep = (cost * r * (12 - k)) / 1200;
    return near(q.answer / 100, q.prompt.includes('book value') ? cost - dep : dep);
  },
});

const partYearNext = numericTemplate({
  id: 'dep-part-year-next', topicId: T, conceptId: 'dep-part-year', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const k = rng.int(2, 9);
    const m = 12 - k;
    const r = rng.pick([10, 15, 20, 25]);
    const isWdv = rng.int(0, 1) === 0;
    const cost = cleanCost(rng, 60000, 400000, (c) => (isWdv ? wdv(c, r, 2, m) !== null : (c * r * m) % 1200 === 0 && ((c - (c * r * m) / 1200) * r) % 100 === 0));
    if (cost === null) return null;
    const d1 = (cost * r * m) / 1200;
    const full = (cost * r) / 100;
    const open2 = cost - d1;
    const d2 = isWdv ? (open2 * r) / 100 : full;
    const askBv = rng.int(0, 1) === 0;
    const base = `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} for ${inr(cost)} on ${dateIn(y, k)}. The accounting year ends on 31 March. It charges depreciation at ${r}% a year ${METHOD_TEXT[isWdv ? 'wdv' : 'slm']}, for the months of use in the first year and for the full year afterwards.`;
    const q2 = askBv ? `What is the book value of the asset on 31 March ${y + 2}?` : `What is the depreciation for the second year, the year ended 31 March ${y + 2}?`;
    const n = askBv
      ? numeric(open2 - d2, [
          [cost - d1 - full, 'Applied the second-year rate to the original cost although the book value had already been reduced.'],
          [open2, 'Stopped after the part year and left out the second year.'],
          [d1 + d2, 'Gave the total depreciation instead of the book value.'],
          [whole(isWdv ? (cost - full) * (1 - r / 100) : cost - 2 * full), 'Charged a full year in the first year although the asset was used for only part of it.'],
        ])
      : isWdv
        ? numeric(d2, [
            [full, 'Applied the rate to the original cost instead of the book value at the start of the second year.'],
            [d1, 'Repeated the part-year charge for the second year.'],
            [whole((open2 * r * m) / 1200), 'Charged the second year for the same few months as the first.'],
          ])
        : numeric(d2, [
            [d1, 'Repeated the part-year charge; the second year is a full year.'],
            [(open2 * r) / 100, 'Applied the rate to the reduced book value, but the straight line method always works on cost.'],
          ]);
    return n && {
      prompt: `${base} ${q2}`,
      ...n,
      explanation: [
        `First year (${m} months): ${r}% of ${inr(cost)} = ${inr(full)} for a full year, so ${inr(full)} x ${m}/12 = ${inr(d1)}; book value ${inr(open2)}.`,
        isWdv ? `Second year (full year): ${r}% of ${inr(open2)} = ${inr(d2)}.` : `Second year (full year): ${r}% of cost = ${inr(d2)}.`,
        ...(askBv ? [`Book value = ${inr(open2)} - ${inr(d2)} = ${inr(open2 - d2)}.`] : []),
      ],
      hints: H.part,
    };
  },
  verify: (q) => {
    const k = dateMonths(q.prompt)[0];
    const m = 12 - k;
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const bv1 = cost * (1 - (r * m) / 1200);
    const dep2 = q.prompt.includes('written down') ? (bv1 * r) / 100 : (cost * r) / 100;
    return near(q.answer / 100, q.prompt.includes('book value of the asset') ? bv1 - dep2 : dep2);
  },
});

const wdvYearN = numericTemplate({
  id: 'dep-wdv-year-n', topicId: T, conceptId: 'dep-wdv', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const r = rng.pick([10, 15, 20, 25, 30]);
    const n = rng.int(2, 3);
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, n) !== null);
    if (cost === null) return null;
    const s = wdv(cost, r, n)!;
    const num = numeric(s.dep[n - 1], [
      [(cost * r) / 100, 'Applied the rate to the original cost instead of the book value at the start of the year.'],
      [s.bv[n - 1], 'Gave the book value at the end of the year instead of the depreciation.'],
      [s.dep[n - 2], 'Gave the previous year\'s depreciation.'],
    ]);
    return num && {
      prompt: `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} for ${inr(cost)} on 1 April ${y} and depreciates it at ${r}% a year on the written down value, charging full years. What is the depreciation for year ${n}, the year ending 31 March ${y + n}?`,
      ...num,
      explanation: s.dep.slice(0, n).map((d, i) => `Year ${i + 1}: ${r}% of ${inr(i === 0 ? cost : s.bv[i - 1])} = ${inr(d)}; book value ${inr(s.bv[i])}.`),
      hints: H.wdv,
    };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const n = intIn(q.prompt, /31 March (\d{4})/) - intIn(q.prompt, /1 April (\d{4})/);
    return near(q.answer / 100, cost * Math.pow(1 - r / 100, n - 1) * (r / 100));
  },
});

const wdvBookValue = numericTemplate({
  id: 'dep-wdv-book-value', topicId: T, conceptId: 'dep-wdv', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const r = rng.pick([10, 15, 20, 25, 30]);
    const n = rng.int(2, 3);
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, n) !== null);
    if (cost === null) return null;
    const s = wdv(cost, r, n)!;
    const num = numeric(s.bv[n - 1], [
      [cost - (n * cost * r) / 100, `Charged ${r}% of the original cost every year, which is the straight line method.`],
      [cost - s.bv[n - 1], 'Gave the total depreciation instead of the book value.'],
      [s.bv[n - 2], `Stopped one year early, after only ${n - 1} year${n === 2 ? '' : 's'} of depreciation.`],
    ]);
    return num && {
      prompt: `${rng.pick(FIRMS)} bought ${rng.pick(rng.pick(ASSETS).items)} for ${inr(cost)} on 1 April ${y} and depreciates it at ${r}% a year by the written down value method, charging full years. What is the book value on 31 March ${y + n}?`,
      ...num,
      explanation: s.dep.map((d, i) => `Year ${i + 1}: ${r}% of ${inr(i === 0 ? cost : s.bv[i - 1])} = ${inr(d)}; book value ${inr(s.bv[i])}.`),
      hints: H.wdv,
    };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const n = intIn(q.prompt, /on 31 March (\d{4})/) - intIn(q.prompt, /1 April (\d{4})/);
    return near(q.answer / 100, cost * Math.pow(1 - r / 100, n));
  },
});

const wdvRateTwoYears = numericTemplate({
  id: 'dep-wdv-rate-two-years', topicId: T, conceptId: 'dep-wdv', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const r = rng.pick([10, 20, 30, 40]);
    const firm = rng.pick(FIRMS);
    const item = rng.pick(MACHINES);
    if (rng.int(0, 1) === 0) {
      const cost = rng.step(100000, 500000, 10000);
      const bv2 = (cost * (100 - r) * (100 - r)) / 10000;
      const n = numeric(r * 100, [
        [((cost - bv2) * 10000) / (2 * cost), 'Divided the two-year fall in value by two, which treats the two charges as equal. Under this method the second charge is smaller.'],
        [((cost - bv2) * 10000) / cost, 'Gave the total fall over the two years as the yearly rate.'],
      ], 1);
      return n && {
        prompt: `${firm} bought ${item} for ${inr(cost)}. Under the written down value method, its book value after two full years was ${inr(bv2)}. What annual rate of depreciation was used?`,
        ...n,
        explanation: [`Book value after two years = Cost x (1 - r)^2, so (1 - r)^2 = ${inr(bv2)} / ${inr(cost)} = ${((100 - r) * (100 - r)) / 10000}.`, `1 - r = ${(100 - r) / 100}, so the rate is ${r}%.`],
        hints: ['Each year the book value is multiplied by (1 - rate).', 'After two years it has been multiplied by that factor twice.'],
      };
    }
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, 2) !== null);
    if (cost === null) return null;
    const s = wdv(cost, r, 2)!;
    const n = numeric(r * 100, [
      [(s.dep[1] * 10000) / s.dep[0], 'Divided the second charge by the first, which gives the share that is left, not the rate.'],
      [(s.dep[0] - s.dep[1]) * 10000 / s.dep[1], 'Divided the fall in the charge by the second charge instead of the first.'],
    ], 1);
    return n && {
      prompt: `${firm} depreciates ${item} by the written down value method at a fixed yearly rate. The depreciation was ${inr(s.dep[0])} in the first full year and ${inr(s.dep[1])} in the second. What is the rate of depreciation?`,
      ...n,
      explanation: ['Second-year depreciation = rate x (book value after year 1) = first-year charge x (1 - rate).', `1 - rate = ${inr(s.dep[1])} / ${inr(s.dep[0])} = ${(100 - r) / 100}.`, `Rate = ${r}%.`],
      hints: ['The second charge is the first charge reduced by the rate.', 'Rate = (first charge - second charge) / first charge.'],
    };
  },
  verify: (q) => {
    const [a, b] = amountsIn(q.prompt);
    if (q.prompt.includes('book value after two')) {
      for (let r = 1; r < 100; r++) if (a * (100 - r) * (100 - r) === b * 10000) return q.answer === r * 100;
      return false;
    }
    return near(q.answer / 100, ((a - b) / a) * 100);
  },
});

/** A whole-year sale case shared by the sale generators: asset bought on 1 April, sold on 31 March n years later. */
interface Sale {
  firm: string; item: string; y: number; method: 'slm' | 'wdv'; r: number; n: number; cost: number;
  bv: number; bvBefore: number; sold: number; text: string;
  /** How the book value on the date of sale is reached, one step per line. */
  working: string[];
}
function saleCase(rng: Rng, signed: -1 | 1 | 0 = 0): Sale | null {
  const method = rng.pick(['slm', 'wdv'] as const);
  const r = rng.pick([10, 15, 20, 25]);
  const n = rng.pick([2, 3, 4]);
  const cost = cleanCost(rng, 100000, 500000, (c) => (method === 'slm' ? (c * r) % 100 === 0 : wdv(c, r, n) !== null));
  if (cost === null) return null;
  const bv = method === 'slm' ? cost - (cost * r * n) / 100 : wdv(cost, r, n)!.bv[n - 1];
  const bvBefore = method === 'slm' ? cost - (cost * r * (n - 1)) / 100 : wdv(cost, r, n - 1)!.bv[n - 2] ?? cost;
  const sign = signed === 0 ? rng.pick([-1, 1]) : signed;
  const sold = bv + sign * rng.step(2000, 20000, 1000);
  // A used machine is not sold for its original cost or more.
  if (sold <= 0 || bv <= 0 || sold >= cost) return null;
  const y = rng.int(2020, 2024);
  const firm = rng.pick(FIRMS);
  const item = rng.pick(MACHINES);
  const text = `${firm} bought ${item} for ${inr(cost)} on 1 April ${y} and depreciates it at ${r}% a year ${METHOD_TEXT[method]}, charging full years.`;
  return { firm, item, y, method, r, n, cost, bv, bvBefore, sold, text, working: fullYearsWorking(method, cost, r, n) };
}
const bookValueFromPrompt = (p: string) => {
  const [cost] = amountsIn(p);
  const r = intIn(p, /at (\d+)% a year/);
  const n = intIn(p, /31 March (\d{4})/) - intIn(p, /1 April (\d{4})/);
  return p.includes('straight line') ? cost - (cost * r * n) / 100 : cost * Math.pow(1 - r / 100, n);
};

const saleResult = mcqTemplate({
  id: 'dep-sale-result', topicId: T, conceptId: 'dep-sale', difficulty: 'medium',
  generate: (rng) => {
    const s = saleCase(rng);
    if (!s) return null;
    const result = s.sold - s.bv;
    return choice(
      `${s.text} On 31 March ${s.y + s.n} it was sold for ${inr(s.sold)}. What was the profit or loss on sale?`,
      profitOrLoss(result),
      [
        [profitOrLoss(-result), 'Reversed the result: a selling price above the book value is a profit, below it a loss.'],
        [profitOrLoss(s.sold - s.cost), 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
        [profitOrLoss(s.sold - s.bvBefore), `Used the book value after only ${s.n - 1} year${s.n === 2 ? '' : 's'} of depreciation, so the last year's depreciation was missed.`],
        [profitOrLoss(s.sold - (s.cost - s.bv)), 'Compared the selling price with the total depreciation charged instead of the book value.'],
      ],
      `${s.working.join(' ')} The selling price of ${inr(s.sold)} is ${result > 0 ? 'more' : 'less'} than the book value of ${inr(s.bv)} on 31 March ${s.y + s.n}, so there is a ${result > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(result))}.`,
      H.sale,
    );
  },
  verify: (q) => {
    const [, sold] = amountsIn(q.prompt);
    return optionText(q) === profitOrLoss(Math.round(sold - bookValueFromPrompt(q.prompt)));
  },
});

const saleAmount = numericTemplate({
  id: 'dep-sale-amount', topicId: T, conceptId: 'dep-sale', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = saleCase(rng);
    if (!s) return null;
    const gap = Math.abs(s.sold - s.bv);
    const wording = rng.int(0, 2);
    if (wording === 2 && s.sold < s.bv) {
      const num = numeric(s.sold, [
        [s.bv + gap, 'Added the loss to the book value instead of deducting it.'],
        [s.cost - gap, 'Deducted the loss from the original cost instead of the book value.'],
        [gap, 'Gave the loss itself as the selling price.'],
      ]);
      return num && {
        prompt: `${s.text} On 31 March ${s.y + s.n} it was sold at a loss of ${inr(gap)}. What was the selling price?`,
        ...num,
        explanation: [...s.working, `Selling price = Book value - Loss = ${inr(s.bv)} - ${inr(gap)} = ${inr(s.sold)}.`],
        hints: H.sale,
      };
    }
    const profit = s.sold > s.bv;
    const num = numeric(gap, [
      [Math.abs(s.sold - s.cost), 'Compared the selling price with the original cost instead of the book value.'],
      [Math.abs(s.sold - s.bvBefore), 'Used the book value one year before the sale, so the last year\'s depreciation was missed.'],
      [s.cost - s.bv, 'Gave the total depreciation instead of the profit or loss.'],
    ]);
    return num && {
      prompt: `${s.text} On 31 March ${s.y + s.n} it was sold for ${inr(s.sold)}. What was the ${profit ? 'profit' : 'loss'} on sale?`,
      ...num,
      explanation: [
        ...s.working,
        profit
          ? `Profit = Selling price - Book value = ${inr(s.sold)} - ${inr(s.bv)} = ${inr(gap)}.`
          : `Loss = Book value - Selling price = ${inr(s.bv)} - ${inr(s.sold)} = ${inr(gap)}.`,
      ],
      hints: H.sale,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const bv = bookValueFromPrompt(q.prompt);
    return near(q.answer / 100, q.prompt.includes('selling price?') ? bv - a[1] : Math.abs(a[1] - bv));
  },
});

const totalDep = numericTemplate({
  id: 'dep-total-dep', topicId: T, conceptId: 'dep-sale', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const s = saleCase(rng);
    if (!s) return null;
    const total = s.cost - s.bv;
    const last = s.bvBefore - s.bv;
    const num = numeric(total, [
      [s.bv, 'Gave the book value at the date of sale instead of the total depreciation.'],
      [last, 'Gave only the last year\'s depreciation.'],
      [s.cost - s.sold, 'Took the fall from cost to selling price as the depreciation, but the sale price need not equal the book value.'],
    ]);
    return num && {
      prompt: `${s.text} On 31 March ${s.y + s.n} it was sold for ${inr(s.sold)}. What is the total depreciation charged on it up to the date of sale?`,
      ...num,
      explanation: [...s.working, `Total depreciation = Cost - Book value = ${inr(s.cost)} - ${inr(s.bv)} = ${inr(total)}.`, 'The selling price does not affect the depreciation already charged.'],
      hints: ['Total depreciation = cost - book value at the date of sale.', 'The selling price tells you about profit or loss, not about depreciation.'],
    };
  },
  verify: (q) => near(q.answer / 100, amountsIn(q.prompt)[0] - bookValueFromPrompt(q.prompt)),
});

const journalSale = journalTemplate({
  id: 'dep-journal-sale', topicId: T, conceptId: 'dep-sale', difficulty: 'medium', version: 2,
  generate: (rng) => {
    const a = rng.pick(ASSETS);
    const bv = rng.step(20000, 200000, 5000);
    const gap = rng.step(2000, Math.min(20000, Math.floor(bv / 4000) * 1000), 1000);
    const profit = rng.int(0, 1) === 0;
    const sold = profit ? bv + gap : bv - gap;
    const how = rng.pick(['bank', 'cash'] as const);
    const prompt = `${rng.pick(FIRMS)} owns ${rng.pick(a.items)}, which stands in the books at ${formatINR(rupees(bv))} after depreciation was charged to the asset account. It was sold for ${formatINR(rupees(sold))} ${how === 'bank' ? 'by cheque' : 'in cash'}. Pass the journal entry for the sale.`;
    const lines: JournalLine[] = profit
      ? [
          { accountId: how, side: 'Dr', amount: rupees(sold) },
          { accountId: a.id, side: 'Cr', amount: rupees(bv) },
          { accountId: 'profitOnSaleOfAsset', side: 'Cr', amount: rupees(gap) },
        ]
      : [
          { accountId: how, side: 'Dr', amount: rupees(sold) },
          { accountId: 'lossOnSaleOfAsset', side: 'Dr', amount: rupees(gap) },
          { accountId: a.id, side: 'Cr', amount: rupees(bv) },
        ];
    return {
      prompt,
      lines,
      explanation: [
        `The asset leaves the books at its book value, so ${a.name} A/c is credited with ${inr(bv)}.`,
        `The ${how === 'bank' ? 'bank' : 'cash'} received, ${inr(sold)}, is debited.`,
        profit ? `Received ${inr(gap)} more than the book value: Profit on Sale of Asset A/c is credited.` : `Received ${inr(gap)} less than the book value: Loss on Sale of Asset A/c is debited.`,
      ],
      distractorAccounts: ['assetDisposal', 'provisionForDepreciation', profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset'],
      hints: H.saleEntry,
    };
  },
});

const provisionBalance = numericTemplate({
  id: 'dep-provision-balance', topicId: T, conceptId: 'dep-accounting', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const method = rng.pick(['slm', 'wdv'] as const);
    const r = rng.pick([10, 15, 20, 25]);
    const n = rng.int(2, 3);
    const cost = cleanCost(rng, 100000, 500000, (c) => (method === 'slm' ? (c * r) % 100 === 0 : wdv(c, r, n) !== null));
    if (cost === null) return null;
    const bv = method === 'slm' ? cost - (cost * r * n) / 100 : wdv(cost, r, n)!.bv[n - 1];
    const prov = cost - bv;
    const deps = method === 'slm' ? Array.from({ length: n }, () => (cost * r) / 100) : wdv(cost, r, n)!.dep;
    const lastYear = deps[n - 1];
    const yearly = deps.map((d, i) => `Year ${i + 1}: ${r}% of ${inr(method === 'slm' || i === 0 ? cost : cost - deps.slice(0, i).reduce((a, b) => a + b, 0))} = ${inr(d)}.`);
    const sum = `${deps.map(inr).join(' + ')} = ${inr(prov)}`;
    const base = `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} for ${inr(cost)} on 1 April ${y} and depreciates it at ${r}% a year ${METHOD_TEXT[method]}, charging full years. The depreciation is credited to a Provision for Depreciation A/c every year and the machine stays in the books at cost.`;
    if (rng.int(0, 1) === 0) {
      const num = numeric(prov, [
        [lastYear, 'Gave the depreciation of the last year only, instead of the total collected in the provision account.'],
        [bv, 'Gave the book value of the machine instead of the balance of the provision account.'],
        [cost + prov, 'Added the provision to the cost instead of deducting it from the asset.'],
      ]);
      return num && { prompt: `${base} What is the balance of the Provision for Depreciation A/c on 31 March ${y + n}?`, ...num, explanation: [...yearly, `Every year's depreciation is credited to the provision account, so its balance is ${sum}.`], hints: H.prov };
    }
    const num = numeric(bv, [
      [cost, 'Showed the machine at cost; the provision for depreciation has to be deducted from it in the balance sheet.'],
      [prov, 'Gave the balance of the provision account instead of the amount at which the machine is shown.'],
      [cost - lastYear, 'Deducted only the last year\'s depreciation.'],
    ]);
    return num && { prompt: `${base} At what net amount (cost less provision) is the machine shown in the balance sheet on 31 March ${y + n}?`, ...num, explanation: [...yearly, `Provision for Depreciation A/c = ${sum}.`, `Net amount = Cost - Provision = ${inr(cost)} - ${inr(prov)} = ${inr(bv)}.`], hints: H.prov };
  },
  verify: (q) => {
    const bv = bookValueFromPrompt(q.prompt);
    const cost = amountsIn(q.prompt)[0];
    return near(q.answer / 100, q.prompt.includes('net amount') ? bv : cost - bv);
  },
});

const provisionTreatment = mcqTemplate({
  id: 'dep-provision-treatment', topicId: T, conceptId: 'dep-accounting', difficulty: 'medium',
  generate: (rng) => {
    const a = rng.pick(ASSETS);
    const d = rng.step(5000, 40000, 1000);
    const n = rng.int(2, 4);
    const cost = d * rng.pick([6, 8, 10]);
    const direct = rng.int(0, 1) === 0;
    const bv = cost - d * n;
    const prompt = `A firm bought ${a.name.toLowerCase()} costing ${inr(cost)} and charges straight line depreciation of ${inr(d)} a year. ${direct ? 'The depreciation is credited to the asset account itself.' : 'The depreciation is credited to a Provision for Depreciation A/c and the asset stays at cost.'} What is the balance of ${a.name} A/c after ${n} years?`;
    return direct
      ? choice(prompt, inr(bv), [
          [inr(cost), 'Left the asset at cost, which is correct only when a provision account is used.'],
          [inr(cost - d), 'Deducted only one year of depreciation.'],
          [inr(d * n), 'Gave the total depreciation, which is not the balance of the asset account.'],
          [inr(cost + d * n), 'Added the depreciation to the asset instead of deducting it.'],
        ], `The depreciation is credited to the asset account, so it falls by ${inr(d)} a year: ${inr(cost)} - ${n} x ${inr(d)} = ${inr(bv)}.`, H.prov)
      : choice(prompt, inr(cost), [
          [inr(bv), 'Deducted the depreciation from the asset, although a provision account carries it.'],
          [inr(d * n), 'Gave the balance of the provision account instead of the asset account.'],
          [inr(cost - d), 'Deducted the last year\'s depreciation, though the asset account is not touched.'],
          [inr(cost + d * n), 'Added the depreciation to the asset instead of leaving the account alone.'],
        ], `With a provision account, ${a.name} A/c is never credited with depreciation, so it keeps its balance of ${inr(cost)}. The ${inr(d * n)} sits in the provision account.`, H.prov);
  },
  verify: (q) => {
    const [cost, d] = amountsIn(q.prompt);
    const n = intIn(q.prompt, /after (\d+) years/);
    return optionText(q) === inr(q.prompt.includes('credited to the asset account itself') ? cost - d * n : cost);
  },
});

const compareDiff = numericTemplate({
  id: 'dep-compare-diff', topicId: T, conceptId: 'dep-compare', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const k = rng.int(1, 3);
    const [r1, r2] = rng.pick([[10, 20], [5, 10], [15, 30], [10, 10], [20, 20], [30, 30]]);
    if (r1 === r2 && k === 1) return null;
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r2, k) !== null && (c * r1) % 100 === 0);
    if (cost === null) return null;
    const slm = (cost * r1) / 100;
    const w = wdv(cost, r2, k)!.dep[k - 1];
    const num = numeric(Math.abs(slm - w), [
      [slm, 'Gave the straight line charge instead of the difference.'],
      [w, 'Gave the written down value charge instead of the difference.'],
      [slm + w, 'Added the two charges instead of finding how much they differ.'],
    ]);
    return num && {
      prompt: `Two firms each buy a machine costing ${inr(cost)} on 1 April, the first day of their accounting year. Firm A charges ${r1}% a year on cost by the straight line method; Firm B charges ${r2}% a year by the written down value method. By how much do their depreciation charges for year ${k} differ?`,
      ...num,
      explanation: [
        `Firm A: ${r1}% of ${inr(cost)} = ${inr(slm)}, the same in every year.`,
        ...fullYearsWorking('wdv', cost, r2, k).map((line) => `Firm B, year ${line.slice(5)}`),
        `Difference in year ${k} = ${inr(Math.max(slm, w))} - ${inr(Math.min(slm, w))} = ${inr(Math.abs(slm - w))}.`,
      ],
      hints: H.wdv,
    };
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r1 = intIn(q.prompt, /Firm A charges (\d+)%/);
    const r2 = intIn(q.prompt, /Firm B charges (\d+)%/);
    const k = intIn(q.prompt, /for year (\d+) differ/);
    return near(q.answer / 100, Math.abs((cost * r1) / 100 - cost * Math.pow(1 - r2 / 100, k - 1) * (r2 / 100)));
  },
});

const journalAssetCost = journalTemplate({
  id: 'dep-journal-asset-cost', topicId: T, conceptId: 'dep-cost', difficulty: 'medium', version: 2,
  generate: (rng) => {
    const supplier = rng.pick(['Rao & Co.', 'Anita Traders', 'Sharma Bros', 'Lakshmi Stores']);
    const price = rng.step(100000, 800000, 20000);
    const freight = rng.step(2000, 20000, 2000);
    const install = rng.step(3000, 30000, 3000);
    const how = rng.pick(['bank', 'cash'] as const);
    const prompt = `${rng.pick(FIRMS)} bought a machine from ${supplier} on credit for ${inr(price)}. It paid ${inr(freight)} as carriage and ${inr(install)} as installation charges ${how === 'bank' ? 'by cheque' : 'in cash'}. Pass one journal entry to record the purchase.`;
    return {
      prompt,
      lines: [
        { accountId: 'machinery', side: 'Dr', amount: rupees(price + freight + install) },
        { accountId: creditor(supplier), side: 'Cr', amount: rupees(price) },
        { accountId: how, side: 'Cr', amount: rupees(freight + install) },
      ],
      explanation: [
        `Carriage and installation are part of the cost: Machinery A/c is debited with ${inr(price)} + ${inr(freight)} + ${inr(install)} = ${inr(price + freight + install)}.`,
        `${supplier} is owed the price, ${inr(price)}: credited.`,
        `${how === 'bank' ? 'Bank' : 'Cash'} paid ${inr(freight + install)} for the extra costs: credited.`,
      ],
      distractorAccounts: ['carriageInwards', 'purchases', 'repairs'],
      hints: H.assetCost,
    };
  },
});

const compareStatement = mcqTemplate({
  id: 'dep-compare-statement', topicId: T, conceptId: 'dep-compare', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const r = rng.pick([10, 20, 25]);
    const k = rng.int(2, 3);
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, k) !== null);
    if (cost === null) return null;
    const s = wdv(cost, r, k)!;
    const slm = (cost * r) / 100;
    const text = (a: number, b: number) => `Straight line ${inr(a)}, written down value ${inr(b)}`;
    return choice(
      `A machine costing ${inr(cost)} is bought on 1 April ${y}. One firm depreciates it at ${r}% a year by the straight line method, another at ${r}% a year by the written down value method, both charging full years. What are the two charges for year ${k}?`,
      text(slm, s.dep[k - 1]),
      [
        [text(s.dep[k - 1], slm), 'Swapped the methods: it is the straight line charge that stays fixed and the written down value charge that falls.'],
        [`Both methods charge ${inr(slm)}`, 'Applied the rate to the original cost under both methods; the written down value method uses the reducing balance.'],
        [`Both methods charge ${inr(s.dep[k - 1])}`, 'Applied the reducing balance under both methods; the straight line method always works on the original cost.'],
        // In year 2 the previous year's charge equals the straight line charge, which "Both methods charge" already offers.
        ...(k > 2 ? [[text(slm, s.dep[k - 2]), 'Used the previous year\'s written down value charge for the year asked.'] as [string, string]] : []),
      ],
      `Straight line: ${r}% of ${inr(cost)} = ${inr(slm)} every year. Written down value: ${fullYearsWorking('wdv', cost, r, k).join(' ')} So the charges for year ${k} are ${inr(slm)} and ${inr(s.dep[k - 1])}.`,
      H.wdv,
    );
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year by the straight/);
    const k = intIn(q.prompt, /for year (\d+)\?/);
    const text = `Straight line ${inr((cost * r) / 100)}, written down value ${inr(Math.round(cost * Math.pow(1 - r / 100, k - 1) * (r / 100)))}`;
    return optionText(q) === text;
  },
});

const SLM_NAME = 'Straight line method';
const WDV_NAME = 'Written down value method';
const METHOD_CHOICE: { q: string; right: string; why: string; wrong: [string, string][] }[] = [
  {
    q: 'A firm wants the total of depreciation and repairs to stay about the same each year, since repairs rise as the machine ages. Which method suits this?',
    right: WDV_NAME,
    why: 'The written down value method charges more in the early years and less later, which offsets the rising repairs.',
    wrong: [
      [SLM_NAME, 'Chose the equal charge; with repairs rising, the combined burden would then grow every year.'],
      ['Either method, since both charge the same each year', 'Assumed both methods charge equally every year; only one of them reduces the charge as the asset ages.'],
      ['Neither: repairs have no bearing on the choice', 'Ignored that the method is chosen for the pattern of the charge over the years.'],
    ],
  },
  {
    q: 'A firm holds a patent with exactly five years left and wants the same charge in each of those years. Which method fits best?',
    right: SLM_NAME,
    why: 'The same fixed amount is written off in each of the five years.',
    wrong: [
      [WDV_NAME, 'Chose the reducing balance method although the firm wants an equal charge each year.'],
      ['Either method, since both give an equal charge', 'Assumed the written down value method also gives equal amounts; its charge falls every year.'],
      ['Neither: a patent is never written off', 'Forgot that a right which expires is written off over the years it lasts.'],
    ],
  },
  {
    q: 'Under which method can the book value of an asset, in principle, never fall to exactly zero?',
    right: WDV_NAME,
    why: 'A percentage of a balance that keeps shrinking always leaves something behind.',
    wrong: [
      [SLM_NAME, 'Thought an equal charge cannot exhaust the asset; it writes off cost less scrap value over the stated life.'],
      ['Both methods equally', 'Assumed both leave a balance behind; the straight line method reaches the scrap value at the end of the life.'],
      ['Neither method; every asset is written down to zero', 'Forgot that a percentage of a shrinking balance never reaches zero.'],
    ],
  },
  {
    q: "Under which method is the depreciation the same amount in every year of the asset's life?",
    right: SLM_NAME,
    why: 'It is (cost - scrap value) / life every year.',
    wrong: [
      [WDV_NAME, 'Took a falling charge for an equal one; the rate is applied to a shrinking balance.'],
      ['Both methods', 'Assumed the two methods give the same pattern each year.'],
      ['Neither: it depends on how much the asset is used each year', 'Thought the charge follows use; these two methods work on time and a fixed rate.'],
    ],
  },
  {
    q: 'An asset is bought on 1 April and depreciated at the same percentage under both methods, for full years. In which year do the two charges first differ?',
    right: 'The second year',
    why: 'In year 1 the book value is the cost, so both charges are equal. From year 2 the book value is lower, so the written down value charge is smaller.',
    wrong: [
      ['The first year', 'Thought the methods differ from the start; in year one both apply the rate to the same cost.'],
      ["The last year of the asset's life", 'Thought the charges differ only at the end of the life, but the written down value charge falls from year 2.'],
      ['They never differ', 'Assumed the same percentage always gives the same charge.'],
    ],
  },
  {
    q: 'Both methods use the same percentage on the same asset bought on 1 April. Which method charges the larger depreciation in the first year?',
    right: 'Neither: they charge the same in the first year',
    why: 'In the first year the opening book value is the cost, so a percentage of it equals the same percentage of cost.',
    wrong: [
      [WDV_NAME, 'Thought the reducing balance method front-loads the charge from the first year; the first year uses the full cost.'],
      [SLM_NAME, 'Thought a charge on cost must be larger than a charge on the balance; in year one they have the same base.'],
      ['It depends on the scrap value', 'Brought in the scrap value, which does not change a percentage charged on cost in the first year.'],
    ],
  },
  {
    q: 'A firm takes a 4-year lease and wants to write its cost off in equal amounts over the 4 years. Which method does this?',
    right: SLM_NAME,
    why: 'The same fixed amount, the cost divided by 4, is written off each year.',
    wrong: [
      [WDV_NAME, 'Chose the reducing balance method, which gives a falling charge and not equal amounts.'],
      ['Either method, since both write off the same amount every year', 'Assumed the written down value method also gives equal amounts.'],
      ['Neither: a lease cannot be written off in equal amounts', 'Forgot that a lease loses value as its term runs out and is written off over the term.'],
    ],
  },
  {
    q: 'At the same percentage rate on the same asset, for which method is the depreciation of the second full year smaller than that of the first?',
    right: WDV_NAME,
    why: 'The base for the second year is the book value after year 1, which is lower than the cost.',
    wrong: [
      [SLM_NAME, 'Thought the straight line charge also falls; it is the same amount every year.'],
      ['Both methods', 'Assumed both methods follow a falling pattern; only the reducing balance method does.'],
      ['Neither method', 'Assumed the charge stays the same under both methods.'],
    ],
  },
];
const methodChoice = mcqTemplate({
  id: 'dep-method-choice', topicId: T, conceptId: 'dep-compare', difficulty: 'medium',
  generate: (rng) => {
    const m = rng.pick(METHOD_CHOICE);
    return choice(m.q, m.right, m.wrong, m.why, ['Think of how each method picks the base for the percentage.', 'Straight line: always the cost. Written down value: the reducing balance.']);
  },
});

const costThenDep = numericTemplate({
  id: 'dep-cost-then-dep', topicId: T, conceptId: 'dep-cost', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const list = rng.step(150000, 800000, 10000);
    const t = rng.pick([5, 10]);
    const freight = rng.step(2000, 20000, 2000);
    const install = rng.step(3000, 30000, 3000);
    const maint = rng.step(5000, 20000, 1000);
    const cost = (list * (100 - t)) / 100 + freight + install;
    const life = rng.pick([4, 5]);
    const f = rng.pick([0.05, 0.1, 0.15]);
    const d = Math.round((cost * (1 - f)) / life / 1000) * 1000;
    const scrap = cost - d * life;
    if (d <= 0 || scrap <= 0) return null;
    const n = numeric(d, [
      [(list + freight + install - scrap) / life, 'Ignored the trade discount and capitalised the full list price.'],
      [((list * (100 - t)) / 100 - scrap) / life, 'Left out carriage and installation, which are part of the cost.'],
      [(cost + maint - scrap) / life, 'Capitalised the maintenance contract, which is a yearly expense and not part of the cost.'],
    ]);
    return n && {
      prompt: `${rng.pick(FIRMS)} bought a machine with a list price of ${inr(list)} at ${t}% trade discount. It paid ${inr(freight)} for carriage and ${inr(install)} for installation, and signed a maintenance contract for ${inr(maint)} a year. The machine is expected to last ${life} years with a scrap value of ${inr(scrap)}. What is the annual depreciation by the straight line method?`,
      ...n,
      explanation: [
        `Trade discount = ${t}% of ${inr(list)} = ${inr((list * t) / 100)}, so the price paid = ${inr(list)} - ${inr((list * t) / 100)} = ${inr((list * (100 - t)) / 100)}.`,
        `Cost = ${inr((list * (100 - t)) / 100)} + ${inr(freight)} + ${inr(install)} = ${inr(cost)}. The maintenance contract is a yearly expense, not part of the cost.`,
        `Annual depreciation = (${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}.`,
      ],
      hints: ['Find the cost first: price after trade discount plus carriage and installation.', 'A yearly maintenance contract is an expense, not part of the cost.'],
    };
  },
  verify: (q) => {
    const [list, freight, install, , scrap] = amountsIn(q.prompt);
    const t = intIn(q.prompt, /at (\d+)% trade discount/);
    const life = intIn(q.prompt, /last (\d+) years/);
    return near(q.answer / 100, ((list * (100 - t)) / 100 + freight + install - scrap) / life);
  },
});

const disposalStep = journalTemplate({
  id: 'dep-disposal-step', topicId: T, conceptId: 'dep-sale', difficulty: 'medium', version: 2,
  generate: (rng) => {
    const cost = rng.step(100000, 500000, 20000);
    const r = rng.pick([10, 15, 20]);
    const n = rng.int(2, 4);
    const prov = (cost * r * n) / 100;
    const sold = cost - prov + rng.pick([-1, 1]) * rng.step(2000, 20000, 1000);
    if (sold <= 0) return null;
    const how = rng.pick(['bank', 'cash'] as const);
    const intro = `A machine that cost ${inr(cost)} has a balance of ${inr(prov)} in the Provision for Depreciation A/c. It is sold for ${inr(sold)} ${how === 'bank' ? 'by cheque' : 'in cash'}. The firm uses an Asset Disposal A/c.`;
    const step = rng.int(0, 2);
    if (step === 0) {
      return {
        prompt: `${intro} Pass the entry that transfers the cost of the machine to Asset Disposal A/c.`,
        lines: [{ accountId: 'assetDisposal', side: 'Dr', amount: rupees(cost) }, { accountId: 'machinery', side: 'Cr', amount: rupees(cost) }],
        explanation: ['The machine leaves the books at its original cost: Machinery A/c is credited.', 'Asset Disposal A/c is debited with the cost.'],
        distractorAccounts: ['provisionForDepreciation', 'lossOnSaleOfAsset'],
        hints: H.disposal,
      };
    }
    if (step === 1) {
      return {
        prompt: `${intro} Pass the entry that transfers the provision for depreciation on this machine to Asset Disposal A/c.`,
        lines: [{ accountId: 'provisionForDepreciation', side: 'Dr', amount: rupees(prov) }, { accountId: 'assetDisposal', side: 'Cr', amount: rupees(prov) }],
        explanation: ['The depreciation already charged on the machine is no longer needed in the provision account: it is debited.', 'Asset Disposal A/c is credited, because it reduces the amount still to be recovered.'],
        distractorAccounts: ['depreciation', 'machinery'],
        hints: H.disposal,
      };
    }
    return {
      prompt: `${intro} Pass the entry that records the sale proceeds.`,
      lines: [{ accountId: how, side: 'Dr', amount: rupees(sold) }, { accountId: 'assetDisposal', side: 'Cr', amount: rupees(sold) }],
      explanation: [`The money received is debited to ${how === 'bank' ? 'Bank' : 'Cash'} A/c.`, 'Asset Disposal A/c is credited with the sale proceeds.'],
      distractorAccounts: ['machinery', 'profitOnSaleOfAsset'],
      hints: H.disposal,
    };
  },
});

// ===============================================================================================================
// COMPLEX
// ===============================================================================================================

const salePartYearSlm = mcqTemplate({
  id: 'dep-sale-part-slm', topicId: T, conceptId: 'dep-sale', difficulty: 'complex',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const r = rng.pick([10, 12, 15, 20]);
    const n = rng.int(1, 3);
    const e = rng.pick([3, 4, 6, 8, 9]);
    const cost = rng.step(120000, 600000, 12000);
    const months = 12 * n + e;
    const total = (cost * r * months) / 1200;
    const bv = cost - total;
    const sign = rng.pick([-1, 1]);
    const sold = bv + sign * rng.step(2000, 20000, 1000);
    if (bv <= 0 || sold <= 0) return null;
    const result = sold - bv;
    return choice(
      `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} for ${inr(cost)} on 1 April ${y}. The accounting year ends on 31 March. It charges depreciation at ${r}% a year on cost by the straight line method, for the period of use up to the date of sale. The machine was sold for ${inr(sold)} on ${dateIn(y + n, e)}. What was the profit or loss on sale?`,
      profitOrLoss(result),
      [
        [profitOrLoss(-result), 'Reversed the result: a selling price above the book value is a profit, below it a loss.'],
        [profitOrLoss(sold - (cost - (cost * r * n) / 100)), 'Charged depreciation for the full years only and left out the months of the part year before the sale.'],
        [profitOrLoss(sold - (cost - (cost * r * (n + 1)) / 100)), 'Charged a full year for the part year in which the machine was sold.'],
        [profitOrLoss(sold - cost), 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
      ],
      `Period of use = ${n} year${n === 1 ? '' : 's'} and ${e} months = ${months} months.`
        + ` Depreciation = ${r}% of ${inr(cost)} x ${months}/12 = ${inr(total)}. Book value = ${inr(bv)}. Sold for ${inr(sold)}: ${result > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(result))}.`,
      H.sale,
    );
  },
  verify: (q) => {
    const dates = [...q.prompt.matchAll(DATE_RE)].map((m) => ({ k: MONTH_NAMES.indexOf(m[1]), year: Number(m[2]) }));
    const buyYear = intIn(q.prompt, /1 April (\d{4})/);
    const months = 12 * (dates[dates.length - 1].year - buyYear - (dates[dates.length - 1].k >= 9 ? 1 : 0)) + dates[dates.length - 1].k;
    const [cost, sold] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /at (\d+)% a year/);
    return optionText(q) === profitOrLoss(Math.round(sold - (cost - (cost * r * months) / 1200)));
  },
});

const salePartYearWdv = mcqTemplate({
  id: 'dep-sale-part-wdv', topicId: T, conceptId: 'dep-sale', difficulty: 'complex',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const r = rng.pick([10, 20, 30]);
    const n = rng.int(1, 2);
    const e = rng.pick([3, 6, 9]);
    const cost = cleanCost(rng, 100000, 500000, (c) => {
      const w = wdv(c, r, n);
      return w !== null && (w.bv[n - 1] * r * e) % 1200 === 0;
    });
    if (cost === null) return null;
    const w = wdv(cost, r, n)!;
    const bvN = w.bv[n - 1];
    const bv = bvN - (bvN * r * e) / 1200;
    const sold = bv + rng.pick([-1, 1]) * rng.step(2000, 15000, 1000);
    if (sold <= 0) return null;
    const result = sold - bv;
    const bvNext = bvN - (bvN * r) / 100;
    return choice(
      `${rng.pick(FIRMS)} bought ${rng.pick(MACHINES)} for ${inr(cost)} on 1 April ${y}. The accounting year ends on 31 March. It charges depreciation at ${r}% a year by the written down value method, for the period of use up to the date of sale. The machine was sold for ${inr(sold)} on ${dateIn(y + n, e)}. What was the profit or loss on sale?`,
      profitOrLoss(result),
      [
        [profitOrLoss(-result), 'Reversed the result: a selling price above the book value is a profit, below it a loss.'],
        [profitOrLoss(sold - bvN), 'Left out the depreciation for the months of the part year before the sale.'],
        [profitOrLoss(sold - bvNext), 'Charged a full year of depreciation for the part year in which the machine was sold.'],
        [profitOrLoss(sold - cost), 'Compared the selling price with the original cost instead of the book value on the date of sale.'],
      ],
      `${fullYearsWorking('wdv', cost, r, n).join(' ')} Year of sale, ${e} months of use from 1 April: ${r}% of ${inr(bvN)} x ${e}/12 = ${inr((bvN * r * e) / 1200)}.`
        + ` Book value on the date of sale = ${inr(bv)}. Sold for ${inr(sold)}: ${result > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(result))}.`,
      H.sale,
    );
  },
  verify: (q) => {
    const [cost, sold] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const buyYear = intIn(q.prompt, /1 April (\d{4})/);
    const sale = [...q.prompt.matchAll(DATE_RE)].map((m) => ({ k: MONTH_NAMES.indexOf(m[1]), year: Number(m[2]) })).pop()!;
    const n = sale.year - buyYear - (sale.k >= 9 ? 1 : 0);
    const bv = cost * Math.pow(1 - r / 100, n) * (1 - (r * sale.k) / 1200);
    return optionText(q) === profitOrLoss(Math.round(sold - bv));
  },
});

const twoAssets = numericTemplate({
  id: 'dep-two-assets', topicId: T, conceptId: 'dep-part-year', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const r = rng.pick([10, 15, 20]);
    const k = rng.int(2, 9);
    const m = 12 - k;
    const c1 = rng.step(100000, 600000, 10000);
    const c2 = rng.step(60000, 360000, 12000);
    const inst = rng.step(6000, 30000, 6000);
    const old = (c1 * r) / 100;
    const add = ((c2 + inst) * r * m) / 1200;
    const n = numeric(old + add, [
      [old + ((c2 + inst) * r) / 100, 'Charged a full year on the new machine although it was used for only part of the year.'],
      [old + (c2 * r * m) / 1200, 'Left the installation charges out of the cost of the new machine.'],
      [old, 'Ignored the machine bought during the year.'],
    ]);
    return n && {
      prompt: `On 1 April ${y} ${rng.pick(FIRMS)} had machinery that cost ${inr(c1)}. On ${dateIn(y, k)} it bought another machine for ${inr(c2)} and paid ${inr(inst)} to install it. Depreciation is charged at ${r}% a year on cost by the straight line method, for the period of use, in whole months from the date of purchase, and the year ends on 31 March ${y + 1}. What is the total depreciation for the year?`,
      ...n,
      explanation: [
        `Old machinery: ${r}% of ${inr(c1)} = ${inr(old)} for the full year.`,
        `New machine: cost = ${inr(c2)} + ${inr(inst)} = ${inr(c2 + inst)}; used for ${m} months, so ${r}% of ${inr(c2 + inst)} x ${m}/12 = ${inr(add)}.`,
        `Total = ${inr(old)} + ${inr(add)} = ${inr(old + add)}.`,
      ],
      hints: H.part,
    };
  },
  verify: (q) => {
    const [c1, c2, inst] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const m = 12 - dateMonths(q.prompt).pop()!;
    return near(q.answer / 100, (c1 * r) / 100 + ((c2 + inst) * r * m) / 1200);
  },
});

const twoMachinesWdv = numericTemplate({
  id: 'dep-two-machines-wdv', topicId: T, conceptId: 'dep-wdv', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2021, 2023);
    const r = rng.pick([10, 20, 30]);
    const k = rng.int(2, 9);
    const m = 12 - k;
    const c1 = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, 2) !== null);
    if (c1 === null) return null;
    const c2 = rng.step(60000, 360000, 12000);
    const f = rng.step(6000, 30000, 6000);
    const a = wdv(c1, r, 2)!;
    const costB = c2 + f;
    const depB = (costB * r * m) / 1200;
    const total = a.bv[1] + costB - depB;
    const n = numeric(total, [
      [a.bv[1] + c2 - (c2 * r * m) / 1200, 'Left the carriage out of the cost of the second machine.'],
      [a.bv[1] + costB - (costB * r) / 100, 'Charged a full year on the second machine although it was used for only part of the year.'],
      [a.bv[1] + costB, 'Charged no depreciation on the second machine.'],
      [a.dep[0] + a.dep[1] + depB, 'Gave the total depreciation instead of the book value.'],
    ]);
    return n && {
      prompt: `${rng.pick(FIRMS)} bought machine A for ${inr(c1)} on 1 April ${y}. On ${dateIn(y + 1, k)} it bought machine B for ${inr(c2)} and paid ${inr(f)} to bring it to the factory. The accounting year ends on 31 March. Depreciation is charged at ${r}% a year by the written down value method, for the period of use, in whole months from the date of purchase. What is the total book value of the two machines on 31 March ${y + 2}?`,
      ...n,
      explanation: [
        `Machine A, year 1: ${r}% of ${inr(c1)} = ${inr(a.dep[0])}; book value ${inr(a.bv[0])}.`,
        `Machine A, year 2: ${r}% of ${inr(a.bv[0])} = ${inr(a.dep[1])}; book value ${inr(a.bv[1])}.`,
        `Machine B: cost = ${inr(c2)} + ${inr(f)} = ${inr(costB)}; used for ${m} months, so ${r}% of ${inr(costB)} x ${m}/12 = ${inr(depB)}; book value ${inr(costB - depB)}.`,
        `Total book value = ${inr(a.bv[1])} + ${inr(costB - depB)} = ${inr(total)}.`,
      ],
      hints: H.wdv,
    };
  },
  verify: (q) => {
    const [c1, c2, f] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const m = 12 - dateMonths(q.prompt)[1];
    return near(q.answer / 100, c1 * Math.pow(1 - r / 100, 2) + (c2 + f) * (1 - (r * m) / 1200));
  },
});

const provisionSoldShare = numericTemplate({
  id: 'dep-provision-sold-share', topicId: T, conceptId: 'dep-accounting', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const r = rng.pick([10, 15, 20]);
    const n = rng.int(2, 4);
    const total = rng.step(200000, 800000, 20000);
    const part = rng.step(40000, Math.floor((total * 0.6) / 20000) * 20000, 20000); // the machine sold is not most of the machinery
    const soldFor = part - ((part * r * n) / 100) + rng.pick([-1, 1]) * rng.step(2000, 10000, 1000);
    if (soldFor <= 0) return null;
    const share = (part * r * n) / 100;
    const rest = ((total - part) * r * n) / 100;
    const base = `${rng.pick(FIRMS)} bought machinery costing ${inr(total)} on 1 April ${y}. On every 31 March since then it has credited ${r}% of cost, by the straight line method, to a Provision for Depreciation A/c. On 31 March ${y + n}, after the depreciation for that year had been credited, one machine that cost ${inr(part)} was sold for ${inr(soldFor)}.`;
    const askRest = rng.int(0, 1) === 0;
    const num = askRest
      ? numeric(rest, [
          [(total * r * n) / 100, 'Left the provision on the machine that was sold in the account.'],
          [share, 'Gave the provision on the machine sold instead of what remains for the other machines.'],
          [((total - part) * r) / 100, 'Counted one year of depreciation only.'],
        ])
      : numeric(share, [
          [(total * r * n) / 100, 'Took the provision on all the machinery instead of the machine sold.'],
          [(part * r) / 100, 'Counted one year of depreciation only.'],
          [part - soldFor, 'Took the difference between cost and sale price as the provision; the sale price has nothing to do with depreciation already charged.'],
        ]);
    return num && {
      prompt: `${base} ${askRest ? 'What balance remains in the Provision for Depreciation A/c after the provision on the machine sold has been removed?' : 'How much has to be transferred out of the Provision for Depreciation A/c for the machine that was sold?'}`,
      ...num,
      explanation: askRest
        ? [
            `Provision before the sale = ${r}% of ${inr(total)} x ${n} years = ${inr((total * r * n) / 100)}.`,
            `Provision on the machine sold = ${r}% of ${inr(part)} x ${n} = ${inr(share)}, which is transferred out.`,
            `Balance left = ${inr((total * r * n) / 100)} - ${inr(share)} = ${inr(rest)}.`,
            'The sale price does not change the provision.',
          ]
        : [
            `1 April ${y} to 31 March ${y + n} is ${n} years.`,
            `Each year ${r}% of ${inr(part)} = ${inr((part * r) / 100)} was credited for this machine.`,
            `Over ${n} years: ${inr((part * r) / 100)} x ${n} = ${inr(share)}.`,
            'The sale price does not change the provision.',
          ],
      hints: H.prov,
    };
  },
  verify: (q) => {
    const [total, part] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /credited (\d+)% of cost/);
    const n = intIn(q.prompt, /On 31 March (\d{4})/) - intIn(q.prompt, /on 1 April (\d{4})/);
    return near(q.answer / 100, ((q.prompt.includes('What balance remains') ? total - part : part) * r * n) / 100);
  },
});

const saleRemovalCost = numericTemplate({
  id: 'dep-sale-removal-cost', topicId: T, conceptId: 'dep-sale', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const s = saleCase(rng, -1);
    if (!s) return null;
    const gap = s.bv - s.sold; // loss before expenses
    const expense = rng.step(2000, 6000, 1000);
    const loss = gap + expense;
    const num = numeric(loss, [
      [gap, 'Ignored the removal expenses, which are an extra cost of the sale and increase the loss.'],
      [gap - expense, 'Subtracted the removal expenses from the loss instead of adding them.'],
      [s.cost - s.sold + expense, 'Compared the selling price with the original cost instead of the book value.'],
    ]);
    return num && {
      prompt: `${s.text} On 31 March ${s.y + s.n} it was sold for ${inr(s.sold)}, and ${inr(expense)} was paid in cash to dismantle and remove it. What is the loss on sale?`,
      ...num,
      explanation: [
        ...s.working,
        `Net amount received = ${inr(s.sold)} - ${inr(expense)} = ${inr(s.sold - expense)}.`,
        `Loss = ${inr(s.bv)} - ${inr(s.sold - expense)} = ${inr(loss)}.`,
      ],
      hints: ['Removal expenses reduce what the sale really brings in.', H.sale[0]],
    };
  },
  verify: (q) => {
    const [, sold, expense] = amountsIn(q.prompt);
    return near(q.answer / 100, bookValueFromPrompt(q.prompt) - (sold - expense));
  },
});

const disposalResult = journalTemplate({
  id: 'dep-disposal-result', topicId: T, conceptId: 'dep-sale', difficulty: 'complex', version: 2,
  generate: (rng) => {
    const cost = rng.step(100000, 500000, 20000);
    const r = rng.pick([10, 15, 20]);
    const n = rng.int(2, 4);
    const prov = (cost * r * n) / 100;
    const gap = rng.step(2000, 20000, 1000);
    const profit = rng.int(0, 1) === 0;
    const sold = cost - prov + (profit ? gap : -gap);
    if (sold <= 0) return null;
    const prompt = `A machine that cost ${inr(cost)} and carried ${inr(prov)} in the Provision for Depreciation A/c was sold for ${inr(sold)} by cheque. The cost, the provision and the sale proceeds have already been posted to Asset Disposal A/c, which now shows a balance of ${inr(gap)}. Pass the entry that closes Asset Disposal A/c.`;
    const lines: JournalLine[] = profit
      ? [{ accountId: 'assetDisposal', side: 'Dr', amount: rupees(gap) }, { accountId: 'profitOnSaleOfAsset', side: 'Cr', amount: rupees(gap) }]
      : [{ accountId: 'lossOnSaleOfAsset', side: 'Dr', amount: rupees(gap) }, { accountId: 'assetDisposal', side: 'Cr', amount: rupees(gap) }];
    return {
      prompt,
      lines,
      explanation: [
        `Asset Disposal A/c: debit ${inr(cost)} (cost); credits ${inr(prov)} (provision) + ${inr(sold)} (sale) = ${inr(prov + sold)}.`,
        profit
          ? `Credits exceed the debit by ${inr(gap)}, so the machine fetched more than its book value: transfer the balance to Profit on Sale of Asset A/c (credit), debiting Asset Disposal A/c.`
          : `The debit exceeds the credits by ${inr(gap)}, so the machine fetched less than its book value: debit Loss on Sale of Asset A/c and credit Asset Disposal A/c.`,
      ],
      distractorAccounts: ['machinery', profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'provisionForDepreciation'],
      hints: H.disposal,
    };
  },
});

const journalCompoundSale = journalTemplate({
  id: 'dep-journal-sale-compound', topicId: T, conceptId: 'dep-sale', difficulty: 'complex', version: 2,
  generate: (rng) => {
    const cost = rng.step(100000, 500000, 20000);
    const r = rng.pick([10, 15, 20]);
    const n = rng.int(2, 4);
    const prov = (cost * r * n) / 100;
    const gap = rng.step(2000, 20000, 1000);
    const profit = rng.int(0, 1) === 0;
    const sold = cost - prov + (profit ? gap : -gap);
    if (sold <= 0) return null;
    const how = rng.pick(['bank', 'cash'] as const);
    const asset = rng.pick(ASSETS.slice(0, 2));
    const prompt = `A ${asset.id === 'machinery' ? 'machine' : 'set of furniture'} that cost ${inr(cost)} has a provision for depreciation of ${inr(prov)} against it. It was sold for ${inr(sold)} ${how === 'bank' ? 'by cheque' : 'in cash'}. Without using an Asset Disposal A/c, pass a single compound journal entry for the sale.`;
    const lines: JournalLine[] = [
      { accountId: how, side: 'Dr', amount: rupees(sold) },
      { accountId: 'provisionForDepreciation', side: 'Dr', amount: rupees(prov) },
      ...(profit ? [] : [{ accountId: 'lossOnSaleOfAsset', side: 'Dr' as const, amount: rupees(gap) }]),
      { accountId: asset.id, side: 'Cr', amount: rupees(cost) },
      ...(profit ? [{ accountId: 'profitOnSaleOfAsset', side: 'Cr' as const, amount: rupees(gap) }] : []),
    ];
    return {
      prompt,
      lines,
      explanation: [
        `The asset leaves at its cost: ${asset.name} A/c is credited with ${inr(cost)}.`,
        `The provision on it, ${inr(prov)}, is no longer needed: Provision for Depreciation A/c is debited. ${how === 'bank' ? 'Bank' : 'Cash'} is debited with ${inr(sold)} received.`,
        `Book value = ${inr(cost)} - ${inr(prov)} = ${inr(cost - prov)}. ${profit ? `Sold for ${inr(gap)} more: credit Profit on Sale of Asset A/c.` : `Sold for ${inr(gap)} less: debit Loss on Sale of Asset A/c.`}`,
      ],
      distractorAccounts: ['assetDisposal', profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'depreciation'],
      hints: H.saleCompound,
    };
  },
});

const compareBookValue = mcqTemplate({
  id: 'dep-compare-bv', topicId: T, conceptId: 'dep-compare', difficulty: 'complex',
  generate: (rng) => {
    const r = rng.pick([10, 20, 25]);
    const k = rng.int(2, 3);
    const cost = cleanCost(rng, 100000, 500000, (c) => wdv(c, r, k) !== null);
    if (cost === null) return null;
    const w = wdv(cost, r, k)!;
    const slmBv = cost - (cost * r * k) / 100;
    const diff = w.bv[k - 1] - slmBv;
    if (diff <= 0) return null;
    const lastDiff = (cost * r) / 100 - w.dep[k - 1];
    return choice(
      `Two identical machines costing ${inr(cost)} are bought on 1 April. One firm depreciates its machine at ${r}% a year on cost by the straight line method, the other at ${r}% a year by the written down value method, both charging full years. At the end of year ${k}, which firm shows the higher book value, and by how much?`,
      `The written down value firm, by ${inr(diff)}`,
      [
        [`The straight line firm, by ${inr(diff)}`, 'Mixed up the methods: the fixed charge on cost removes more value over time than a charge on the reducing balance.'],
        ['Both show the same book value', 'Assumed equal rates give equal results; the rates apply to different bases after the first year.'],
        [`The written down value firm, by ${inr(lastDiff)}`, 'Compared only the last year\'s depreciation of the two methods instead of the two book values.'],
        [`The straight line firm, by ${inr(lastDiff)}`, 'Mixed up the methods and compared only the last year\'s depreciation instead of the book values.'],
        [`The written down value firm, by ${inr((cost * r) / 100)}`, 'Gave one year\'s straight line charge as the difference between the two book values.'],
        [`The straight line firm, by ${inr(w.dep[k - 1])}`, 'Gave the last year\'s written down value charge as the difference, and mixed up the methods.'],
      ],
      `Straight line book value = ${inr(cost)} - ${k} x ${inr((cost * r) / 100)} = ${inr(slmBv)}. Written down value book value = ${inr(w.bv[k - 1])}. The written down value firm's book value is higher by ${inr(diff)}.`,
      H.wdv,
    );
  },
  verify: (q) => {
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year on cost/);
    const k = intIn(q.prompt, /end of year (\d+)/);
    return optionText(q) === `The written down value firm, by ${inr(Math.round(cost * Math.pow(1 - r / 100, k) - cost * (1 - (r * k) / 100)))}`;
  },
});

const templates: Template[] = [
  // easy
  slmAnnual, slmRateAmount, slmBookValue, slmRate, wdvFirstYear, wdvRate, costCapitalised, costItems, methodName, depCause, depPurpose, monthsUsed,
  journalDirect, journalProvision,
  // medium
  slmPartYear, wdvPartYear, partYearNext, wdvYearN, wdvBookValue, wdvRateTwoYears, totalDep, saleResult, saleAmount, journalSale,
  provisionBalance, provisionTreatment, compareDiff, journalAssetCost, compareStatement, methodChoice, costThenDep, disposalStep,
  // complex
  salePartYearSlm, salePartYearWdv, twoAssets, twoMachinesWdv, provisionSoldShare, saleRemovalCost, disposalResult, journalCompoundSale, compareBookValue,
];

// ===============================================================================================================
// SETS OF ENTRIES: one asset from its purchase onwards, a dated entry for each event of its life
// ===============================================================================================================
// The conventions are the topic's, and every set states the ones it relies on in its opening line: the accounting
// year ends on 31 March; depreciation is charged for the period of use in whole months, from the date of purchase and
// up to the date of sale; what the asset is sold for is received by cheque. An asset is bought and sold on the first
// day of a month, as everywhere in this topic, so the months of use are never in doubt. A sale is written the way the
// topic's own sale questions write it: in one entry with its profit or loss when depreciation is written off the
// asset (`dep-journal-sale`), step by step through Asset Disposal A/c when a provision is kept (`dep-disposal-step`,
// `dep-disposal-result`).

const dr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Dr', amount: rupees(n) });
const cr = (accountId: string, n: number): JournalLine => ({ accountId, side: 'Cr', amount: rupees(n) });
const acct = (id: string): string => `${resolveAccount(id).name} A/c`;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** An asset a set follows: its account, what was bought, how it is named afterwards and what was spent to make it ready. */
interface SetAsset {
  id: 'machinery' | 'furniture' | 'computers' | 'officeEquipment';
  item: string;
  the: string;
  extra: string;
}
const SET_ASSETS: SetAsset[] = [
  { id: 'machinery', item: 'a lathe machine', the: 'the machine', extra: 'carriage and installation' },
  { id: 'machinery', item: 'a packing machine', the: 'the machine', extra: 'freight and installation' },
  { id: 'machinery', item: 'a printing press', the: 'the press', extra: 'carriage and erection' },
  { id: 'furniture', item: 'showroom furniture', the: 'the furniture', extra: 'carriage and fitting' },
  { id: 'computers', item: 'a computer server', the: 'the server', extra: 'delivery and installation' },
  { id: 'officeEquipment', item: 'a photocopier', the: 'the photocopier', extra: 'delivery and installation' },
];
const SET_ASSET_IDS: string[] = [...new Set(SET_ASSETS.map((a) => a.id))];
const SUPPLIERS = ['Deccan Machine Tools', 'Bharat Engineering Co.', 'Ganga Equipment Mart', 'Malabar Agencies'];

/** How a set buys its asset: one cheque for everything, two payments, or the price on credit (settled later). */
type Buy = 'together' | 'apart' | 'credit';

/** The entries that bring the asset into the books at `price + extra`; `settle` is the date a credit price is paid. */
function buyTxs(rng: Rng, a: SetAsset, date: string, price: number, extra: number, how: Buy, settle = date): SetTransaction[] {
  const cost = price + extra;
  const why = `What is spent on ${a.extra} makes ${a.the} ready for use, so it is part of the cost and not an expense`;
  if (how === 'together') {
    return [{
      date,
      text: `Bought ${a.item} for ${inr(price)} and paid a further ${inr(extra)} for its ${a.extra}, all by cheque.`,
      lines: [dr(a.id, cost), cr('bank', cost)],
      explanation: [`${why}: ${acct(a.id)} is debited with ${inr(price)} + ${inr(extra)} = ${inr(cost)}.`, `Both payments were by cheque: Bank A/c is credited with ${inr(cost)}.`],
    }];
  }
  if (how === 'apart') {
    const by = rng.pick(['cash', 'bank'] as const);
    return [
      {
        date,
        text: `Bought ${a.item} for ${inr(price)}, paid by cheque.`,
        lines: [dr(a.id, price), cr('bank', price)],
        explanation: [`${capital(a.the)} is bought to be used, not to be sold again: ${acct(a.id)} is debited.`, 'It was paid for by cheque: Bank A/c is credited.'],
      },
      {
        date,
        text: `Paid ${inr(extra)} ${by === 'cash' ? 'in cash' : 'by cheque'} for the ${a.extra} of ${a.the}.`,
        lines: [dr(a.id, extra), cr(by, extra)],
        explanation: [`${why}: ${acct(a.id)} is debited, which brings the cost of ${a.the} to ${inr(price)} + ${inr(extra)} = ${inr(cost)}.`, `${by === 'cash' ? 'Cash goes out: Cash A/c' : 'It was paid by cheque: Bank A/c'} is credited.`],
      },
    ];
  }
  const supplier = rng.pick(SUPPLIERS);
  return [
    {
      date,
      text: `Bought ${a.item} from ${supplier} on credit for ${inr(price)} and paid ${inr(extra)} by cheque for its ${a.extra}.`,
      lines: [dr(a.id, cost), cr(creditor(supplier), price), cr('bank', extra)],
      explanation: [
        `${why}: ${acct(a.id)} is debited with ${inr(price)} + ${inr(extra)} = ${inr(cost)}.`,
        `The price of ${inr(price)} is owed to ${supplier}, whose account is credited.`,
        `Only the ${inr(extra)} was paid now: Bank A/c is credited with it.`,
      ],
    },
    {
      date: settle,
      text: `Paid ${supplier} the amount due for ${a.the} by cheque.`,
      lines: [dr(creditor(supplier), price), cr('bank', price)],
      explanation: [`The amount due to ${supplier} is the price, ${inr(price)}; the ${a.extra} were paid for at once. The account of ${supplier} is debited.`, 'It was paid by cheque: Bank A/c is credited.'],
    },
  ];
}

/** One period's depreciation: the months charged, the figure the rate is applied to and the book value after it. */
interface Charge {
  amount: number;
  months: number;
  base: number;
  close: number;
}

/**
 * The depreciation of each period, given the months of use in each (12 for a full year): on cost under the straight
 * line method, on the opening book value under written down value. Null unless every charge is in whole rupees and
 * some value is left at the end.
 */
function chargesFor(method: 'slm' | 'wdv', cost: number, rate: number, months: number[]): Charge[] | null {
  const out: Charge[] = [];
  let bv = cost;
  for (const m of months) {
    const base = method === 'slm' ? cost : bv;
    if ((base * rate * m) % 1200 !== 0) return null;
    const amount = (base * rate * m) / 1200;
    bv -= amount;
    out.push({ amount, months: m, base, close: bv });
  }
  return bv > 0 ? out : null;
}

/**
 * A cost in whole thousands from `min` to `max` for which `charges` gives a schedule, preferring the costs whose
 * charges are the roundest (whole thousands, then five hundreds, hundreds, fifties) as long as there are at least
 * three to choose from. Null if no cost gives every charge in whole tens of rupees: the seed is then rejected.
 */
function roundCost(rng: Rng, min: number, max: number, charges: (cost: number) => Charge[] | null): number | null {
  const all: [number, Charge[]][] = [];
  for (let c = min; c <= max; c += 1000) {
    const made = charges(c);
    if (made) all.push([c, made]);
  }
  const round = (unit: number) => all.filter(([, made]) => made.every((x) => x.amount % unit === 0));
  for (const unit of [1000, 500, 100, 50]) if (round(unit).length >= 3) return rng.pick(round(unit))[0];
  const tens = round(10);
  return tens.length > 0 ? rng.pick(tens)[0] : null;
}

/** The working of one charge: `period` is "the year ended 31 March 2025" for a full year, "From ... to ..." for a part. */
function chargeWorking(rate: number, cost: number, c: Charge, period: string): string {
  const on = c.base === cost ? `the cost of ${inr(cost)}` : `the written down value of ${inr(c.base)}`;
  return c.months === 12
    ? `Depreciation for ${period} = ${rate}% of ${on} = ${inr(c.amount)}.`
    : `${period} is ${c.months} months of use: ${rate}% of ${on} x ${c.months}/12 = ${inr(c.amount)}.`;
}

/** The entry for a period's depreciation, credited to the asset itself or to the provision account. */
function chargeTx(a: SetAsset, date: string, text: string, c: Charge, working: string, to: 'asset' | 'provision'): SetTransaction {
  return {
    date,
    text,
    lines: [dr('depreciation', c.amount), cr(to === 'asset' ? a.id : 'provisionForDepreciation', c.amount)],
    explanation: [
      `${working} It is an expense of the period: Depreciation A/c is debited.`,
      to === 'asset'
        ? `No provision account is kept, so ${acct(a.id)} itself is credited; ${a.the} now stands in the books at ${inr(c.close)}.`
        : `${acct(a.id)} stays at cost: the depreciation is credited to Provision for Depreciation A/c.`,
    ],
  };
}

const closeDepreciationTx = (y: number, amount: number): SetTransaction => ({
  date: `31 March ${y}`,
  text: `Transferred the depreciation of the year ended 31 March ${y} from Depreciation A/c to Profit and Loss A/c.`,
  lines: [dr('profitAndLoss', amount), cr('depreciation', amount)],
  explanation: [
    `The depreciation of the year, ${inr(amount)}, is an expense that reduces the profit of that year: Profit and Loss A/c is debited.`,
    'Depreciation A/c is credited with the same amount and so closed for the year.',
  ],
});

/**
 * The year-end entries of an asset bought on `1 <month k0>` of the year that starts on 1 April `y`. In `tail` a 'd'
 * charges the depreciation of the next year and a 't' closes Depreciation A/c for the year just charged. `first` is
 * put before the working of the first charge (how the cost was reached).
 */
function yearEndTxs(a: SetAsset, y: number, k0: number, tail: string, charges: Charge[], rate: number, cost: number, to: 'asset' | 'provision', first: string): SetTransaction[] {
  const out: SetTransaction[] = [];
  let i = 0;
  for (const step of tail) {
    if (step === 't') {
      out.push(closeDepreciationTx(y + i, charges[i - 1].amount));
      continue;
    }
    const c = charges[i++];
    const period = c.months === 12 ? `the year ended 31 March ${y + i}` : `From ${dateIn(y, k0)} to 31 March ${y + i}`;
    const working = `${i === 1 ? first : ''}${chargeWorking(rate, cost, c, period)}`;
    const text = `${to === 'asset' ? 'Charged' : 'Provided'} depreciation on ${a.the} for the year ended 31 March ${y + i}.`;
    out.push(chargeTx(a, `31 March ${y + i}`, text, c, working, to));
  }
  return out;
}

/** A round selling price near the book value and below the cost, above the book value for a profit; null if there is none. */
function sellingPrice(rng: Rng, bv: number, cost: number, profit: boolean): number | null {
  const gap = rng.step(3000, 24000, 1000);
  const sold = Math.round((profit ? bv + gap : bv - gap) / 1000) * 1000;
  return sold > 0 && sold < cost && sold !== bv && sold * 2 > bv ? sold : null;
}

// ---- the independent check of a set: the entries are walked again and every figure is worked from the dates ----

const CALENDAR = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A date of a set as a count of months; 31 March counts as the 1 April after it, so a difference is the months of use. */
function monthOf(date: string): number {
  const [day, month, year] = date.split(' ');
  return Number(year) * 12 + CALENDAR.indexOf(month) + (day === '31' ? 1 : 0);
}

/**
 * True when the entries of a set tell the life of one asset correctly. The asset comes in at what the texts say was
 * spent on it; every charge is the rate in the opening line on the cost (or on the written down value) for the months
 * between the dates; Depreciation A/c is closed with the charge of the year; and after a sale nothing is left in the
 * asset, provision or disposal accounts, while the profit or loss is the price less the book value.
 */
function assetLifeHolds(q: JournalSetQuestion): boolean {
  const rate = /at (\d+)% a year/.exec(q.prompt);
  const life = /to last (\d+) years/.exec(q.prompt);
  const scrap = life ? amountsIn(q.prompt)[0] : 0;
  const reducing = q.prompt.includes('written down value');
  const balance = new Map<string, number>(); // debits less credits, in rupees
  const of = (id: string): number => balance.get(id) ?? 0;
  const assetBalance = (): number => SET_ASSET_IDS.reduce((sum, id) => sum + of(id), 0);
  let cost = 0;
  let written = 0;
  let lastCharge = 0;
  let from: number | null = null;
  let proceeds = 0;
  let sold = false;
  for (const e of q.entries) {
    const sum = (ids: string[], side: 'Dr' | 'Cr'): number =>
      e.expected.filter((l) => ids.includes(l.accountId) && l.side === side).reduce((s, l) => s + l.amount, 0) / 100;
    const bought = sum(SET_ASSET_IDS, 'Dr');
    const charge = sum(['depreciation'], 'Dr');
    const closed = sum(['depreciation'], 'Cr');
    const received = sum(['bank'], 'Dr');
    if (e.date === undefined) return false; // every item of these sets is dated
    const at = monthOf(e.date);
    if (bought > 0) {
      if (amountsIn(e.text).reduce((s, x) => s + x, 0) !== bought) return false;
      cost += bought;
      from ??= at;
    }
    if (charge > 0) {
      if (from === null) return false;
      const months = at - from;
      const yearly = rate ? ((reducing ? cost - written : cost) * Number(rate[1])) / 100 : (cost - scrap) / Number(life?.[1]);
      if (months < 1 || months > 12 || !near(charge, (yearly * months) / 12)) return false;
      written += charge;
      lastCharge = charge;
      from = at;
    }
    if (closed > 0 && (closed !== lastCharge || sum(['profitAndLoss'], 'Dr') !== closed)) return false;
    if (received > 0) {
      if (amountsIn(e.text)[0] !== received || at !== from) return false; // depreciated up to the day of sale
      proceeds = received;
      sold = true;
    }
    for (const l of e.expected) balance.set(l.accountId, of(l.accountId) + ((l.side === 'Dr' ? 1 : -1) * l.amount) / 100);
    if (of('depreciation') < 0 || assetBalance() < 0 || of('provisionForDepreciation') > 0) return false;
  }
  if (cost <= 0 || written <= 0) return false;
  if (!sold) return assetBalance() + of('provisionForDepreciation') === cost - written;
  // Profit is a credit balance and loss a debit one, so together they are the loss less the profit.
  const loss = of('lossOnSaleOfAsset') + of('profitOnSaleOfAsset');
  return assetBalance() === 0 && of('provisionForDepreciation') === 0 && of('assetDisposal') === 0 && -loss === proceeds - (cost - written);
}

const setVerify = (q: JournalSetQuestion): boolean => setHolds()(q) && assetLifeHolds(q);

const SET_HINTS = {
  life: [
    'What does the asset stand at in the books? Everything spent to bring it in and make it ready is part of its cost.',
    'Work each charge from the opening line: the rate (or the life and scrap value), and the months the asset was used in that year.',
  ],
  sale: [
    'Before the sale, charge depreciation up to the day the asset is sold: count the months from 1 April to that day.',
    'Book value on the day of sale = cost - all the depreciation charged. The price above it is a profit, below it a loss.',
  ],
};

// 1. Straight line, written off the asset: the purchase, the yearly charge and the transfer to Profit and Loss A/c.
const SLM_SHAPES: { buy: Buy; tail: string }[] = [
  { buy: 'together', tail: 'dt' },
  { buy: 'together', tail: 'dtd' },
  { buy: 'together', tail: 'dd' },
  { buy: 'together', tail: 'ddt' },
  { buy: 'apart', tail: 'dt' },
  { buy: 'apart', tail: 'dd' },
];

const setSlmLife = journalSetTemplate({
  id: 'dep-set-slm-life', topicId: T, conceptId: 'dep-sets', difficulty: 'easy',
  generate: (rng) => {
    const y = rng.int(2021, 2024);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(SET_ASSETS);
    const { buy, tail } = rng.pick(SLM_SHAPES);
    const years = tail.split('d').length - 1;
    const extra = rng.step(4000, 24000, 2000);
    let cost: number;
    let basis: string;
    let charges: Charge[] | null;
    let rate = 0;
    let yearly = '';
    if (rng.int(0, 2) === 0) {
      // The charge from the life and the scrap value.
      const life = rng.pick([4, 5, 8, 10]);
      const d = rng.step(8000, 60000, 2000);
      const scrap = rng.step(5000, 40000, 5000);
      cost = scrap + d * life;
      if (scrap * 3 > cost) return null;
      basis = `${capital(a.the)} is expected to last ${life} years and then to fetch ${inr(scrap)} as scrap; depreciation is charged in equal yearly amounts on its cost less that scrap value (straight line method)`;
      charges = Array.from({ length: years }, (_, i) => ({ amount: d, months: 12, base: cost, close: cost - d * (i + 1) }));
      yearly = `Depreciation for a year = (${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}, the same every year.`;
    } else {
      rate = rng.pick([10, 12, 15, 20]);
      cost = rng.step(100000, 600000, 10000);
      basis = `Depreciation is charged at ${rate}% a year on cost by the straight line method`;
      charges = chargesFor('slm', cost, rate, Array.from({ length: years }, () => 12));
    }
    if (charges === null || extra * 8 > cost) return null;
    const price = cost - extra;
    const first = buy === 'together' ? `Cost = ${inr(price)} + ${inr(extra)} = ${inr(cost)}. ` : '';
    const ends = yearEndTxs(a, y, 0, tail, charges, rate, cost, 'asset', first);
    if (yearly) {
      // A charge worked from the life has its own working in place of the one from a rate.
      let i = 0;
      for (const tx of ends) {
        if (tx.lines[0].accountId !== 'depreciation') continue;
        tx.explanation[0] = `${i === 0 ? first : ''}${i === 0 ? yearly : `The straight line charge does not change: ${inr(charges[i].amount)} again.`} It is an expense of the year: Depreciation A/c is debited.`;
        i++;
      }
    }
    return {
      opening: `These transactions of ${firm} are about ${a.item} bought on 1 April ${y}, the first day of its accounting year; the year ends on 31 March. ${basis}, and is written off the asset account itself: no provision account is kept.`,
      transactions: [...buyTxs(rng, a, dateIn(y, 0), price, extra, buy), ...ends],
      hints: SET_HINTS.life,
      distractorAccounts: ['provisionForDepreciation', 'carriageInwards', 'freight', 'repairs'],
    };
  },
  verify: setVerify,
});

// 2. Written down value with a part year at purchase: every charge is worked out by the student.
const WDV_SHAPES: { buy: Buy; tail: string }[] = [
  { buy: 'together', tail: 'ddd' },
  { buy: 'together', tail: 'dtd' },
  { buy: 'together', tail: 'dtdd' },
  { buy: 'together', tail: 'ddtd' },
  { buy: 'apart', tail: 'dd' },
  { buy: 'apart', tail: 'ddd' },
  { buy: 'credit', tail: 'dd' },
  { buy: 'credit', tail: 'ddd' },
];

const setWdvPartYear = journalSetTemplate({
  id: 'dep-set-wdv-part-year', topicId: T, conceptId: 'dep-sets', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2021, 2023);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(SET_ASSETS);
    const { buy, tail } = rng.pick(WDV_SHAPES);
    const years = tail.split('d').length - 1;
    const k0 = rng.int(1, 9); // bought on the first of a month from May to January
    // Three years at 15% or 25% on a falling balance leave no round figures.
    const rate = rng.pick(years > 2 ? [10, 20] : [10, 15, 20, 25]);
    const months = [12 - k0, ...Array.from({ length: years - 1 }, () => 12)];
    const cost = roundCost(rng, 100000, 600000, (c) => chargesFor('wdv', c, rate, months));
    if (cost === null) return null;
    const charges = chargesFor('wdv', cost, rate, months)!;
    const extra = rng.step(4000, 20000, 2000);
    const price = cost - extra;
    const first = buy === 'apart' ? '' : `Cost = ${inr(price)} + ${inr(extra)} = ${inr(cost)}. `;
    // A price bought on credit is paid in the month after the purchase, well before the first year end.
    const settle = `${rng.int(5, 25)} ${MONTH_NAMES[k0 + 1]} ${k0 + 1 >= 9 ? y + 1 : y}`;
    return {
      opening: `These transactions of ${firm} are about ${a.item} bought during the year ended 31 March ${y + 1}. The accounting year ends on 31 March. Depreciation is charged at ${rate}% a year by the written down value method, in the year of purchase for the period of use in whole months from the date of purchase, and is written off the asset account itself: no provision account is kept.`,
      transactions: [...buyTxs(rng, a, dateIn(y, k0), price, extra, buy, settle), ...yearEndTxs(a, y, k0, tail, charges, rate, cost, 'asset', first)],
      hints: SET_HINTS.life,
      distractorAccounts: ['provisionForDepreciation', 'carriageInwards', 'freight', 'purchases'],
    };
  },
  verify: setVerify,
});

/** The dates and months of a life that ends in a sale: `n` year ends, then a sale on a year end or `e` months after it. */
function saleTimeline(y: number, k0: number, n: number, e: number) {
  return {
    months: [12 - k0, ...Array.from({ length: n - 1 }, () => 12), ...(e > 0 ? [e] : [])],
    saleDate: e > 0 ? dateIn(y + n, e) : `31 March ${y + n}`,
    /** The period of the charge made on the day of a sale within a year. */
    lastPeriod: `From 1 April ${y + n} to ${dateIn(y + n, e)}`,
  };
}

// 3. A provision account is kept: the purchase, the yearly charges and the sale through Asset Disposal A/c.
const DISPOSAL_SHAPES: { buy: Buy; n: number; within: boolean }[] = [
  { buy: 'together', n: 1, within: false }, // 6 entries
  { buy: 'together', n: 2, within: false }, // 7
  { buy: 'together', n: 1, within: true }, // 7
  { buy: 'apart', n: 1, within: false }, // 7
  { buy: 'apart', n: 2, within: false }, // 8
  { buy: 'apart', n: 1, within: true }, // 8
  { buy: 'together', n: 2, within: true }, // 8
  { buy: 'together', n: 3, within: false }, // 8
];

const setProvisionDisposal = journalSetTemplate({
  id: 'dep-set-provision-disposal', topicId: T, conceptId: 'dep-sets', difficulty: 'complex',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(SET_ASSETS);
    const { buy, n, within } = rng.pick(DISPOSAL_SHAPES);
    const method = rng.pick(['slm', 'slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    // An asset sold at its first year end has been used for the whole of that year.
    const k0 = n === 1 && !within ? 0 : rng.pick([0, 0, 3, 6, 9]);
    const e = within ? rng.int(2, 10) : 0;
    const t = saleTimeline(y, k0, n, e);
    const cost = roundCost(rng, 100000, 600000, (c) => chargesFor(method, c, rate, t.months));
    if (cost === null) return null;
    const charges = chargesFor(method, cost, rate, t.months)!;
    const provision = charges.reduce((sum, c) => sum + c.amount, 0);
    const bv = cost - provision;
    const profit = rng.int(0, 1) === 0;
    const sold = sellingPrice(rng, bv, cost, profit);
    if (sold === null) return null;
    const gap = Math.abs(sold - bv);
    const extra = rng.step(4000, 20000, 2000);
    const price = cost - extra;
    const first = buy === 'apart' ? '' : `Cost = ${inr(price)} + ${inr(extra)} = ${inr(cost)}. `;
    const A = acct(a.id);
    const sale: SetTransaction[] = [];
    if (within) {
      const c = charges[n];
      sale.push(chargeTx(a, t.saleDate, `Provided depreciation on ${a.the} for the current year up to this date, on which it was sold.`, c, chargeWorking(rate, cost, c, t.lastPeriod), 'provision'));
    }
    const parts = charges.map((c) => inr(c.amount)).join(' + ');
    sale.push(
      {
        date: t.saleDate,
        text: `Transferred the cost of ${a.the}, sold on this date, to Asset Disposal A/c.`,
        lines: [dr('assetDisposal', cost), cr(a.id, cost)],
        explanation: [`${capital(a.the)} leaves the books at its cost of ${inr(cost)}, the figure at which it stands in ${A}: ${A} is credited with it.`, 'Asset Disposal A/c is debited with the cost.'],
      },
      {
        date: t.saleDate,
        text: `Transferred the provision for depreciation on ${a.the} sold to Asset Disposal A/c.`,
        lines: [dr('provisionForDepreciation', provision), cr('assetDisposal', provision)],
        explanation: [
          `Depreciation provided up to the date of sale = ${charges.length > 1 ? `${parts} = ` : ''}${inr(provision)}. It is no longer needed once ${a.the} is sold: Provision for Depreciation A/c is debited with it.`,
          `Asset Disposal A/c is credited, which leaves in it the book value of ${inr(cost)} - ${inr(provision)} = ${inr(bv)}.`,
        ],
      },
      {
        date: t.saleDate,
        text: `Received a cheque for ${inr(sold)}, the price at which ${a.the} was sold.`,
        lines: [dr('bank', sold), cr('assetDisposal', sold)],
        explanation: ['The money goes into the bank: Bank A/c is debited.', 'Asset Disposal A/c is credited with the price.'],
      },
      {
        date: t.saleDate,
        text: `Closed Asset Disposal A/c by transferring the profit or loss on the sale of ${a.the}.`,
        lines: profit ? [dr('assetDisposal', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('assetDisposal', gap)],
        explanation: [
          `Asset Disposal A/c: debit ${inr(cost)} (cost); credits ${inr(provision)} (provision) + ${inr(sold)} (price) = ${inr(provision + sold)}.`,
          profit
            ? `The credits are ${inr(gap)} more, so ${a.the} fetched more than its book value of ${inr(bv)}: Asset Disposal A/c is debited and Profit on Sale of Asset A/c is credited.`
            : `The debit is ${inr(gap)} more, so ${a.the} fetched less than its book value of ${inr(bv)}: Loss on Sale of Asset A/c is debited and Asset Disposal A/c is credited.`,
        ],
      },
    );
    const how = method === 'slm' ? 'on cost by the straight line method' : 'by the written down value method (on cost less the depreciation provided so far)';
    return {
      opening: `These transactions of ${firm} are about ${a.item} that it bought and later sold. The accounting year ends on 31 March. Depreciation is charged at ${rate}% a year ${how}, for the period of use in whole months from the date of purchase to the date of sale. ${capital(a.the)} is kept at cost in ${A}, depreciation is credited to Provision for Depreciation A/c, and a sale is recorded through Asset Disposal A/c, whose balance is then transferred to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.`,
      transactions: [...buyTxs(rng, a, dateIn(y, k0), price, extra, buy), ...yearEndTxs(a, y, k0, 'd'.repeat(n), charges, rate, cost, 'provision', first), ...sale],
      hints: SET_HINTS.sale,
      distractorAccounts: [profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'profitAndLoss', 'carriageInwards', 'freight'],
    };
  },
  verify: setVerify,
});

// 4. Depreciation written off the asset, and a sale part-way through a year: one entry for the sale and its result.
const SALE_SHAPES: { buy: Buy; n: number }[] = [
  { buy: 'together', n: 1 }, // 4 entries
  { buy: 'together', n: 2 }, // 5
  { buy: 'apart', n: 1 }, // 5
];

const setSalePartYear = journalSetTemplate({
  id: 'dep-set-sale-part-year', topicId: T, conceptId: 'dep-sets', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(SET_ASSETS);
    const { buy, n } = rng.pick(SALE_SHAPES);
    const method = rng.pick(['slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    const k0 = rng.pick([0, 0, 3, 6, 9]);
    const e = rng.int(2, 10); // sold on the first of a month from June to February
    const t = saleTimeline(y, k0, n, e);
    const cost = roundCost(rng, 100000, 600000, (c) => chargesFor(method, c, rate, t.months));
    if (cost === null) return null;
    const charges = chargesFor(method, cost, rate, t.months)!;
    const written = charges.reduce((sum, c) => sum + c.amount, 0);
    const bv = cost - written;
    const profit = rng.int(0, 1) === 0;
    const sold = sellingPrice(rng, bv, cost, profit);
    if (sold === null) return null;
    const gap = Math.abs(sold - bv);
    const extra = rng.step(4000, 20000, 2000);
    const price = cost - extra;
    const first = buy === 'apart' ? '' : `Cost = ${inr(price)} + ${inr(extra)} = ${inr(cost)}. `;
    const A = acct(a.id);
    const last = charges[n];
    const how = method === 'slm' ? 'on cost by the straight line method' : 'by the written down value method';
    return {
      opening: `These transactions of ${firm} are about ${a.item} that it bought and later sold. The accounting year ends on 31 March. Depreciation is charged at ${rate}% a year ${how}, for the period of use in whole months from the date of purchase to the date of sale, and is written off the asset account itself. The firm keeps no provision account and no Asset Disposal A/c: a sale is recorded in one entry, with the profit or loss on it taken to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.`,
      transactions: [
        ...buyTxs(rng, a, dateIn(y, k0), price, extra, buy),
        ...yearEndTxs(a, y, k0, 'd'.repeat(n), charges, rate, cost, 'asset', first),
        chargeTx(a, t.saleDate, `Charged depreciation on ${a.the} for the current year up to this date, on which it was sold.`, last, chargeWorking(rate, cost, last, t.lastPeriod), 'asset'),
        {
          date: t.saleDate,
          text: `Sold ${a.the} for ${inr(sold)} and received a cheque for the price.`,
          lines: profit
            ? [dr('bank', sold), cr(a.id, bv), cr('profitOnSaleOfAsset', gap)]
            : [dr('bank', sold), dr('lossOnSaleOfAsset', gap), cr(a.id, bv)],
          explanation: [
            `The money goes into the bank: Bank A/c is debited with ${inr(sold)}.`,
            `${capital(a.the)} leaves the books at its book value on this date, ${inr(cost)} - ${charges.map((c) => inr(c.amount)).join(' - ')} = ${inr(bv)}: ${A} is credited with it, so that nothing of ${a.the} is left in the account.`,
            profit
              ? `The price is ${inr(sold)} - ${inr(bv)} = ${inr(gap)} more than the book value: Profit on Sale of Asset A/c is credited.`
              : `The price is ${inr(bv)} - ${inr(sold)} = ${inr(gap)} less than the book value: Loss on Sale of Asset A/c is debited.`,
          ],
        },
      ],
      hints: SET_HINTS.sale,
      distractorAccounts: ['assetDisposal', 'provisionForDepreciation', profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'profitAndLoss', 'carriageInwards'],
    };
  },
  verify: setVerify,
});

const sets: JournalSetTemplate[] = [setSlmLife, setWdvPartYear, setProvisionDisposal, setSalePartYear];

// ===============================================================================================================
// FORMATS: the accounts of an asset's life, which the student prepares row by row
// ===============================================================================================================
// An asset account or a provision account runs over several years: it is balanced on every 31 March and its balance
// is brought down on the next 1 April. These formats ask for the account as an examination does, over two or three
// years in one account (a period for each year, each with its own totals: `ledgerPeriods`), and for Asset Disposal
// A/c on the day of a sale. Two years where three would crowd a phone: no account has more than eleven rows. The
// first of them, the straight-line account of one machine over two full years, is the easy one; no account is asked
// for a year that has not ended yet (the last 31 March is that of 2026).
//
// The conventions are the topic's, and the data of every format states the ones it relies on: the accounting year
// ends on 31 March; depreciation is for the period of use in whole months, from the date of purchase and up to the
// date of sale; an asset is bought and sold on the first day of a month; what an asset is sold for comes by cheque.
// Where depreciation is written off the asset, the topic's sale entry debits Bank A/c with the price and Loss on Sale
// of Asset A/c with a loss and credits the asset: Machinery A/c shows "By Bank A/c" (the price) and "By Loss on Sale
// of Asset A/c". A profit is shown the same way round, "By Bank A/c" with the whole price and "To Profit on Sale of
// Asset A/c" with the profit, which is how an examination answer lays the asset account out. The topic's one-entry
// form of a sale (card 14, `dep-journal-sale`) credits the asset with its book value only, and posted as it stands
// would show "By Bank A/c" at the book value and no row for a profit; so the data of the sale format says how the
// sale is to be shown (the whole price credited to Machinery A/c, the profit or loss then transferred out of it),
// and the working says that the two rows together take out the book value, as the one entry does. Where a provision
// is kept, the sale goes through Asset Disposal A/c exactly as `dep-set-provision-disposal` journalises it.
//
// Every account is written up from dated journal entries, year by year. `verify` posts the entries of each year
// again with `post` and compares the balance at every 31 March with the book value worked by formula from the cost,
// the rate and the months of use (`bookValueAfter`), not year by year; it then checks every balance carried down and
// brought down, and that each side of each year carries exactly what the year posts to it.

const MACHINE_ASSETS = SET_ASSETS.filter((a) => a.id === 'machinery');
const DEP_AC = acct('depreciation');
const HOW = { slm: 'on cost by the straight line method', wdv: 'by the written down value method' };
/** The last and the first day of the accounting year `i` years after the one that starts on 1 April `y`. */
const endOf = (y: number, i: number): string => `31 March ${y + i + 1}`;
const startOf = (y: number, i: number): string => `1 April ${y + i}`;
const yearTitle = (y: number, i: number): string => `Year ended ${endOf(y, i)}`;
const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const twelves = (n: number): number[] => Array.from({ length: Math.max(0, n) }, () => 12);
const YEARS = ['', 'one', 'two', 'three'];

/**
 * The book value of an asset after the months of use of each year, by formula: the rate on cost for all the months
 * together (straight line), or the cost reduced year after year (written down value).
 */
function bookValueAfter(method: 'slm' | 'wdv', cost: number, rate: number, months: number[]): number {
  return Math.round(method === 'slm' ? cost - (cost * rate * sumOf(months)) / 1200 : months.reduce((bv, m) => bv * (1 - (rate * m) / 1200), cost));
}

/** What an account kept over one or more years was made from, kept for its `verify`. */
interface KeptRun {
  accountId: string;
  /** The entries of each accounting year, in order. */
  years: DatedEntry[][];
  /** The balance the account must show on each 31 March, in rupees (a debit balance positive), worked by formula. */
  closings: number[];
  /** Rows the account must show, with figures worked apart from the entries: the year (from 0), the side (0 debit, 1 credit), the particulars, rupees. */
  must?: { year: number; side: 0 | 1; label: string; amount: number }[];
}
const keptRuns = keepFor<KeptRun>();

/**
 * An account over the accounting years from the one that ends on 31 March `y + 1`: every year takes its entries, is
 * balanced on 31 March and opens the next with the balance brought down; the last balance is brought down below the
 * totals unless `bringDown` is false (an account that is closed). `details` are lines of working shown under a
 * depreciation row in the solution, by the date of the row.
 */
function runAccount(
  kept: KeptRun,
  y: number,
  rest: Omit<AccountParts, 'left' | 'right' | 'later' | 'periodTitle' | 'broughtDown'>,
  options: { details?: Record<string, string[]>; bringDown?: boolean } = {},
): AccountParts {
  const { details = {}, bringDown = true } = options;
  const last = kept.years.length - 1;
  const parts = ledgerPeriods(
    kept.years.flat(),
    kept.accountId,
    kept.years.map((_, i) => ({ closeOn: endOf(y, i), ...(i < last || bringDown ? { reopenOn: startOf(y, i + 1) } : {}), title: yearTitle(y, i) })),
  );
  const detailed = (rows: FormatRowParts[]): FormatRowParts[] =>
    rows.map((r) => (r.label === DEP_AC && r.date !== undefined && details[r.date] ? { ...r, details: details[r.date] } : r));
  keptRuns.keep(rest.data, kept);
  return {
    ...rest,
    ...parts,
    left: { ...parts.left, rows: detailed(parts.left.rows) },
    right: { ...parts.right, rows: detailed(parts.right.rows) },
    ...(parts.later ? { later: parts.later.map((p) => ({ ...p, left: detailed(p.left), right: detailed(p.right) })) } : {}),
  };
}

/**
 * True when an account kept over its years holds. Year by year: the entries of the year, posted again on top of the
 * balance brought down, leave the balance the formula gives; that balance is carried down on the shorter side (an
 * account that closes has no such row); the year opens with the balance of the year before, on its own side; and
 * each side carries exactly what the year posts to it. After the last year the balance is brought down below the
 * totals, on its own side.
 */
function runHolds(q: AccountQuestion): boolean {
  const kept = keptRuns.of(q.data);
  if (!kept) return false;
  const { accountId, years, closings, must = [] } = kept;
  if (closings.length !== years.length || (q.later?.length ?? 0) !== years.length - 1) return false;
  const rowsOf = (year: number) => (year === 0 ? [q.sides[0].rows, q.sides[1].rows] : q.later![year - 1]);
  let open = 0; // paise, a debit balance positive
  for (const [year, entries] of years.entries()) {
    const lines = entries.flatMap((e) => e.lines).filter((l) => l.accountId === accountId);
    const close = post([lines], new Map([[accountId, open]])).get(accountId) ?? 0;
    if (close !== rupees(closings[year])) return false;
    const rows = rowsOf(year);
    for (const side of [0, 1] as const) {
      // A debit balance is carried down on the credit side.
      const carried = rows[side].filter((r) => r.closing);
      const carriedHere = close !== 0 && side === (close > 0 ? 1 : 0);
      if (carriedHere ? carried.length !== 1 || carried[0].label !== BALANCE_CD || carried[0].amounts[0] !== Math.abs(close) : carried.length !== 0) return false;
      const opened = open !== 0 && side === (open > 0 ? 0 : 1) ? Math.abs(open) : 0;
      const brought = rows[side].filter((r) => r.label === BALANCE_BD);
      if (opened > 0 ? brought.length !== 1 || brought[0].amounts[0] !== opened : brought.length !== 0) return false;
      const posted = lines.filter((l) => l.side === (side === 0 ? 'Dr' : 'Cr')).reduce((s, l) => s + l.amount, 0);
      if (rows[side].filter((r) => !r.closing).reduce((s, r) => s + r.amounts[0], 0) !== posted + opened) return false;
    }
    open = close;
  }
  for (const side of [0, 1] as const) {
    const below = q.sides[side].below;
    const here = q.continued === true && open !== 0 && side === (open > 0 ? 0 : 1);
    if (here ? below.length !== 1 || below[0].label !== BALANCE_BD || below[0].amounts[0] !== Math.abs(open) : below.length !== 0) return false;
  }
  return must.every((m) => rowsOf(m.year)[m.side].some((r) => r.label === m.label && r.amounts[0] === rupees(m.amount)));
}

const FORMAT_HINTS = {
  run: [
    'Take one year at a time: the depreciation of the year, then the balance, which is carried down on 31 March and brought down on 1 April as the first row of the next year.',
    'Count the whole months of use in each year. Only the year of purchase (and the year of a sale) is a part year.',
  ],
  provision: [
    'With a provision account the machinery stays at cost in Machinery A/c. Where, then, does the depreciation of each year collect?',
    'A provision is a credit balance: it is brought down on the credit side and grows by the depreciation of each year.',
  ],
  sale: [
    'Depreciate the machine sold up to the day of sale first. Its book value on that day is what the price is compared with.',
    'After the sale nothing of the machine sold may be left in the account: the price and the profit or loss together take out its book value.',
  ],
};

/** "To Bank A/c ₹50,000": a row as the explanation quotes it. */
const quote = (prefix: 'To' | 'By', label: string, n: number): string => `"${prefix} ${label} ${inr(n)}"`;

/** How the working says a year is balanced: carried down on 31 March, brought down on 1 April (a debit balance unless `credit`). */
function balancedAt(y: number, i: number, balance: number, lastYear: boolean, credit = false): string {
  return `${quote(credit ? 'To' : 'By', BALANCE_CD, balance)} on ${endOf(y, i)}, and ${quote(credit ? 'By' : 'To', BALANCE_BD, balance)} on ${startOf(y, i + 1)}, ${lastYear ? 'below the totals' : 'the first row of the next year'}`;
}

const RUN_TASK = 'Balance it on each 31 March and bring the balance down on each 1 April.';

/**
 * Machinery A/c of a single machine over its first two years (straight line) or its first two or three (written down
 * value), depreciation written off the asset: the cost is built up from the price and what was spent to make the
 * machine ready, and every year is balanced and brought down.
 */
function oneMachineRun(rng: Rng, method: 'slm' | 'wdv'): AccountParts | null {
  // Straight line: two full years, each with the same charge (the easy account). Written down value: two or three.
  const years = method === 'slm' ? 2 : rng.pick([2, 3]);
  // The last year asked for has ended: it closes on 31 March 2026 at the latest.
  const y = rng.int(2021, 2026 - years);
  const firm = rng.pick(FIRMS);
  const a = rng.pick(MACHINE_ASSETS);
  const buy = rng.pick(['together', 'apart', 'credit'] as const);
  // Straight line: bought on 1 April, so every year is a full year. Written down value: bought from May to January.
  const k0 = method === 'slm' ? 0 : rng.int(1, 9);
  const months = [12 - k0, ...twelves(years - 1)];
  let cost: number;
  let rate = 0;
  let basis: string;
  let charges: Charge[];
  let closings: number[];
  let yearly = '';
  if (method === 'wdv') {
    // Three years at 15% or 25% on a falling balance leave no round figures.
    const r = rng.pick(years > 2 ? [10, 20] : [10, 15, 20, 25]);
    const found = roundCost(rng, 100000, 600000, (c) => chargesFor('wdv', c, r, months));
    if (found === null) return null;
    rate = r;
    cost = found;
    charges = chargesFor('wdv', cost, rate, months)!;
    closings = months.map((_, i) => bookValueAfter('wdv', found, r, months.slice(0, i + 1)));
    basis = `Depreciation is charged at ${rate}% a year by the written down value method, in the year of purchase for the period of use in whole months from the date of purchase`;
  } else if (rng.int(0, 2) === 0) {
    // The charge from the life and the scrap value.
    const life = rng.pick([5, 8, 10]);
    const d = rng.step(8000, 60000, 2000);
    const scrap = rng.step(5000, 40000, 5000);
    const total = scrap + d * life;
    if (scrap * 3 > total) return null;
    cost = total;
    charges = months.map((_, i) => ({ amount: d, months: 12, base: total, close: total - d * (i + 1) }));
    closings = months.map((_, i) => total - d * (i + 1));
    basis = `${capital(a.the)} is expected to last ${life} years and then to fetch ${inr(scrap)} as scrap; depreciation is charged in equal yearly amounts on its cost less that scrap value (straight line method)`;
    yearly = `Depreciation for a year = (${inr(cost)} - ${inr(scrap)}) / ${life} = ${inr(d)}, the same every year.`;
  } else {
    const r = rng.pick([10, 12, 15, 20]);
    const round = rng.step(100000, 600000, 10000);
    const made = chargesFor('slm', round, r, months);
    if (made === null) return null;
    rate = r;
    cost = round;
    charges = made;
    closings = months.map((_, i) => bookValueAfter('slm', round, r, months.slice(0, i + 1)));
    basis = `Depreciation is charged at ${rate}% a year on cost by the straight line method`;
  }
  const extra = rng.step(4000, 24000, 2000);
  if (extra * 8 > cost) return null;
  const price = cost - extra;
  const supplier = rng.pick(SUPPLIERS);
  const bought = dateIn(y, k0);
  // A price bought on credit is paid in the month after the purchase, well before the first year end.
  const settle = `${rng.int(5, 25)} ${MONTH_NAMES[k0 + 1]} ${k0 + 1 >= 9 ? y + 1 : y}`;
  const purchase: DatedEntry[] =
    buy === 'together'
      ? [{ date: bought, lines: [dr('machinery', cost), cr('bank', cost)] }]
      : buy === 'apart'
        ? [
            { date: bought, lines: [dr('machinery', price), cr('bank', price)] },
            { date: bought, lines: [dr('machinery', extra), cr('cash', extra)] },
          ]
        : [
            { date: bought, lines: [dr('machinery', cost), cr(creditor(supplier), price), cr('bank', extra)] },
            { date: settle, lines: [dr(creditor(supplier), price), cr('bank', price)] },
          ];
  const charge = (i: number): DatedEntry => ({ date: endOf(y, i), lines: [dr('depreciation', charges[i].amount), cr('machinery', charges[i].amount)] });
  const end = endOf(y, years - 1);
  const buyText =
    buy === 'together'
      ? `Bought ${a.item} for ${inr(price)} and paid a further ${inr(extra)} for its ${a.extra}, both by one cheque.`
      : buy === 'apart'
        ? `Bought ${a.item} for ${inr(price)}, paid by cheque, and paid ${inr(extra)} in cash for its ${a.extra}.`
        : `Bought ${a.item} from ${supplier} on credit for ${inr(price)} and paid ${inr(extra)} by cheque for its ${a.extra}.`;
  const data = [
    `${firm} closes its books on 31 March every year. ${basis}, and is written off Machinery A/c itself: no provision account is kept.`,
    `${bought}: ${buyText}`,
    ...(buy === 'credit' ? [`${settle}: Paid ${supplier} the amount due for ${a.the} by cheque.`] : []),
    `${firm} has no other machinery, and none was bought or sold up to ${end}.`,
  ].join('\n');
  const period = (i: number): string => (charges[i].months === 12 ? `the year ended ${endOf(y, i)}` : `From ${bought} to ${endOf(y, i)}`);
  const work = (i: number): string =>
    yearly ? (i === 0 ? yearly : `The straight line charge does not change: ${inr(charges[i].amount)} again.`) : chargeWorking(rate, cost, charges[i], period(i));
  return runAccount(
    { accountId: 'machinery', years: months.map((_, i) => [...(i === 0 ? purchase : []), charge(i)]), closings, must: charges.map((c, i) => ({ year: i, side: 1 as const, label: DEP_AC, amount: c.amount })) },
    y,
    {
      task: `Prepare Machinery A/c of ${firm} for the ${YEARS[years]} years ended ${end}. ${RUN_TASK}${buy === 'together' ? ' Enter what the one cheque paid as one figure.' : ''}`,
      data,
      title: 'Machinery A/c',
      // The expense account the carriage or freight is wrongly charged to, and the accounts a student reaches for in a later year.
      distractors: ['Machinery A/c', 'Provision for Depreciation A/c', 'Profit and Loss A/c', a.extra.startsWith('freight') ? 'Freight A/c' : 'Carriage Inwards A/c', 'Cash A/c', 'Purchases A/c'],
      explanation: [
        `Cost of ${a.the} = ${inr(price)} + ${inr(extra)} = ${inr(cost)}: what is spent on ${a.extra} makes ${a.the} ready for use, so it is part of the cost and not an expense.`,
        buy === 'together'
          ? `Machinery A/c is debited with the cost, paid by the one cheque: ${quote('To', 'Bank A/c', cost)}.`
          : buy === 'apart'
            ? `Machinery A/c is debited with both payments: ${quote('To', 'Bank A/c', price)} and ${quote('To', 'Cash A/c', extra)}.`
            : `Machinery A/c is debited with both parts of the cost: ${quote('To', `${supplier} A/c`, price)} for the price still owed and ${quote('To', 'Bank A/c', extra)}. Paying ${supplier} later is between the account of ${supplier} and Bank A/c: it does not touch Machinery A/c.`,
        ...charges.map(
          (c, i) =>
            `${yearTitle(y, i)}: ${work(i)} It is written off the machine itself: ${quote('By', DEP_AC, c.amount)}. That leaves ${inr(i === 0 ? cost : charges[i - 1].close)} - ${inr(c.amount)} = ${inr(c.close)}: ${balancedAt(y, i, c.close, i === years - 1)}.`,
        ),
      ],
      hints: [
        FORMAT_HINTS.run[0],
        method === 'slm' ? 'Under the straight line method the charge is the same amount every year: it is worked on the cost, not on the balance of the account.' : FORMAT_HINTS.run[1],
      ],
    },
  );
}

// 1. dep-fmt-slm-year: Machinery A/c for the first two years, straight line, written off the asset. The machine is
//    bought on 1 April, so both years are full years with the same charge: the easy format of the topic (easy)
const fmtSlmYear = accountTemplate({
  id: 'dep-fmt-slm-year', topicId: T, conceptId: 'dep-formats', difficulty: 'easy',
  generate: (rng) => oneMachineRun(rng, 'slm'),
  verify: runHolds,
});

// 2. dep-fmt-wdv-part-year: the same over two or three years under written down value, the machine bought part-way
//    through the first year (medium)
const fmtWdvPartYear = accountTemplate({
  id: 'dep-fmt-wdv-part-year', topicId: T, conceptId: 'dep-formats', difficulty: 'medium',
  generate: (rng) => oneMachineRun(rng, 'wdv'),
  verify: runHolds,
});

/** A machine of a format: bought on the first of month `k` of year `i`, with its months of use and its charges, year by year from then. */
interface RunMachine {
  name: string;
  item: string;
  cost: number;
  i: number;
  k: number;
  months: number[];
  charges: Charge[];
}

/** A machine whose every charge is in whole rupees (and as round as can be), or null when no cost in the range gives one. */
function runMachine(rng: Rng, method: 'slm' | 'wdv', rate: number, name: string, item: string, i: number, k: number, months: number[], min: number, max: number): RunMachine | null {
  const cost = roundCost(rng, min, max, (c) => chargesFor(method, c, rate, months));
  return cost === null ? null : { name, item, cost, i, k, months, charges: chargesFor(method, cost, rate, months)! };
}

/** The working of the charge of year `i` on a machine that is in use to the end of that year. */
function workIn(m: RunMachine, y: number, rate: number, i: number): string {
  const c = m.charges[i - m.i];
  const period = c.months === 12 ? `the year ended ${endOf(y, i)}` : `From ${dateIn(y + m.i, m.k)} to ${endOf(y, i)}`;
  return `${capital(m.name)}: ${chargeWorking(rate, m.cost, c, period)}`;
}

/** The book value of a machine at the end of year `i`, by formula (0 before it is bought). */
const valueAt = (m: RunMachine, method: 'slm' | 'wdv', rate: number, i: number): number => (i < m.i ? 0 : bookValueAfter(method, m.cost, rate, m.months.slice(0, i - m.i + 1)));

// 3. dep-fmt-second-machine: Machinery A/c for two or three years, a second machine bought during the period (medium)
const fmtSecondMachine = accountTemplate({
  id: 'dep-fmt-second-machine', topicId: T, conceptId: 'dep-formats', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2021, 2023);
    const firm = rng.pick(FIRMS);
    const method = rng.pick(['slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    // Both machines bought in the first of two years; the second bought in the second of two years; or in the second of three.
    const shape = rng.pick(['sameYear', 'nextYear', 'nextYear', 'threeYears'] as const);
    const years = shape === 'threeYears' ? 3 : 2;
    const iB = shape === 'sameYear' ? 0 : 1;
    const kA = shape === 'sameYear' ? 0 : rng.pick([0, 0, 3, 6]);
    const kB = rng.pick([3, 4, 6, 7, 8, 9]);
    const [itemA, itemB] = rng.shuffle(MACHINES);
    const A = runMachine(rng, method, rate, 'machine 1', itemA, 0, kA, [12 - kA, ...twelves(years - 1)], 200000, 600000);
    const B = runMachine(rng, method, rate, 'machine 2', itemB, iB, kB, [12 - kB, ...twelves(years - 1 - iB)], 100000, 400000);
    if (A === null || B === null || A.cost === B.cost) return null;
    const supplier = rng.int(0, 2) === 0 ? rng.pick(SUPPLIERS) : null;
    const dateA = dateIn(y, kA);
    const dateB = dateIn(y + iB, kB);
    const settle = `${rng.int(5, 25)} ${MONTH_NAMES[kB + 1]} ${kB + 1 >= 9 ? y + iB + 1 : y + iB}`;
    const fromB = supplier ? `${supplier} A/c` : 'Bank A/c';
    const run: DatedEntry[][] = [];
    const details: Record<string, string[]> = {};
    const explanation: string[] = [];
    const closings: number[] = [];
    const must: NonNullable<KeptRun['must']> = [];
    for (let i = 0; i < years; i++) {
      const entries: DatedEntry[] = [];
      const steps: string[] = [];
      if (i === 0) {
        entries.push({ date: dateA, lines: [dr('machinery', A.cost), cr('bank', A.cost)] });
        steps.push(`Machine 1 is debited at its cost on ${dateA}: ${quote('To', 'Bank A/c', A.cost)}.`);
      }
      if (i === iB) {
        entries.push({ date: dateB, lines: [dr('machinery', B.cost), cr(supplier ? creditor(supplier) : 'bank', B.cost)] });
        if (supplier) entries.push({ date: settle, lines: [dr(creditor(supplier), B.cost), cr('bank', B.cost)] });
        steps.push(`Machine 2 is debited at its cost on ${dateB}: ${quote('To', fromB, B.cost)}.${supplier ? ` Paying ${supplier} later does not touch Machinery A/c.` : ''}`);
      }
      const dA = A.charges[i].amount;
      const dB = i >= iB ? B.charges[i - iB].amount : 0;
      entries.push({ date: endOf(y, i), lines: [dr('depreciation', dA + dB), cr('machinery', dA + dB)] });
      steps.push(workIn(A, y, rate, i));
      if (i >= iB) {
        details[endOf(y, i)] = [`Machine 1 ${inr(dA)}`, `Machine 2 ${inr(dB)}`];
        steps.push(workIn(B, y, rate, i), `Depreciation of the year = ${inr(dA)} + ${inr(dB)} = ${inr(dA + dB)}, written off the machines: ${quote('By', DEP_AC, dA + dB)}.`);
      } else {
        steps.push(`It is written off the machine: ${quote('By', DEP_AC, dA)}.`);
      }
      const close = valueAt(A, method, rate, i) + valueAt(B, method, rate, i);
      steps.push(`The debit side is larger by ${inr(close)}: ${balancedAt(y, i, close, i === years - 1)}.`);
      run.push(entries);
      closings.push(close);
      must.push({ year: i, side: 1, label: DEP_AC, amount: dA + dB });
      explanation.push(`${yearTitle(y, i)}: ${steps.join(' ')}`);
    }
    const end = endOf(y, years - 1);
    return runAccount(
      { accountId: 'machinery', years: run, closings, must },
      y,
      {
        task: `Prepare Machinery A/c of ${firm} for the ${YEARS[years]} years ended ${end}. ${RUN_TASK} Enter the depreciation of a year on the two machines as one figure.`,
        data: [
          `${firm} closes its books on 31 March every year. Depreciation is charged at ${rate}% a year ${HOW[method]}, for the period of use in whole months from the date of purchase, and is written off Machinery A/c itself: no provision account is kept.`,
          `${dateA}: Bought machine 1 (${itemA}) for ${inr(A.cost)}, paid by cheque.`,
          `${dateB}: Bought machine 2 (${itemB}) ${supplier ? `from ${supplier} on credit for ${inr(B.cost)}` : `for ${inr(B.cost)}, paid by cheque`}.`,
          ...(supplier ? [`${settle}: Paid ${supplier} the amount due for machine 2 by cheque.`] : []),
          `${firm} has no other machinery, and none was sold up to ${end}.`,
        ].join('\n'),
        title: 'Machinery A/c',
        distractors: ['Machinery A/c', 'Provision for Depreciation A/c', 'Profit and Loss A/c', 'Cash A/c', 'Purchases A/c'],
        explanation,
        hints: ['Take the machines one at a time: how many months was each in use in the year?', FORMAT_HINTS.run[0]],
      },
      { details },
    );
  },
  verify: runHolds,
});

// 4. dep-fmt-provision: a provision is kept. Provision for Depreciation A/c for three years, or (one seed in four)
//    the other half of the examination answer, Machinery A/c for the same three years, which then stays at cost: its
//    task says that a provision account is kept, and a second machine is always bought, so that it is a fair question
//    about what the account holds and not a trap (medium)
const fmtProvision = accountTemplate({
  id: 'dep-fmt-provision', topicId: T, conceptId: 'dep-formats', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const firm = rng.pick(FIRMS);
    const method = rng.pick(['slm', 'slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    const which = rng.pick(['provision', 'provision', 'provision', 'machinery'] as const);
    const years = 3;
    const kA = rng.pick([0, 0, 3, 6, 9]);
    // A second machine bought in the second or third year: always when Machinery A/c is asked, so that it has more to show than one purchase.
    const second = which === 'machinery' || rng.int(0, 1) === 0;
    const iB = rng.pick([1, 2]);
    const kB = rng.pick([3, 4, 6, 7, 8, 9]);
    const [itemA, itemB] = rng.shuffle(MACHINES);
    const A = runMachine(rng, method, rate, second ? 'machine 1' : 'the machine', itemA, 0, kA, [12 - kA, 12, 12], 200000, 600000);
    const made = runMachine(rng, method, rate, 'machine 2', itemB, iB, kB, [12 - kB, ...twelves(years - 1 - iB)], 100000, 400000);
    if (A === null || made === null || A.cost === made.cost) return null;
    const B = second ? made : null;
    const dateA = dateIn(y, kA);
    const dateB = dateIn(y + iB, kB);
    const run: DatedEntry[][] = [];
    const details: Record<string, string[]> = {};
    const closings: number[] = [];
    const must: NonNullable<KeptRun['must']> = [];
    const explanation: string[] =
      which === 'machinery' ? ['A provision account is kept, so depreciation is never credited to Machinery A/c: the machinery stays in it at cost, and no year has a row for depreciation.'] : [];
    let held = 0; // the provision at the start of the year
    let atCost = 0; // the machinery at cost at the start of the year
    for (let i = 0; i < years; i++) {
      const entries: DatedEntry[] = [];
      const bought: string[] = [];
      if (i === 0) {
        entries.push({ date: dateA, lines: [dr('machinery', A.cost), cr('bank', A.cost)] });
        bought.push(`${capital(A.name)} is debited at its cost on ${dateA}: ${quote('To', 'Bank A/c', A.cost)}.`);
      }
      if (B && i === iB) {
        entries.push({ date: dateB, lines: [dr('machinery', B.cost), cr('bank', B.cost)] });
        bought.push(`Machine 2 is debited at its cost on ${dateB}: ${quote('To', 'Bank A/c', B.cost)}.`);
      }
      const dA = A.charges[i].amount;
      const dB = B && i >= iB ? B.charges[i - iB].amount : 0;
      const both = B !== null && i >= iB;
      entries.push({ date: endOf(y, i), lines: [dr('depreciation', dA + dB), cr('provisionForDepreciation', dA + dB)] });
      if (both) details[endOf(y, i)] = [`Machine 1 ${inr(dA)}`, `Machine 2 ${inr(dB)}`];
      run.push(entries);
      const provided = A.cost - valueAt(A, method, rate, i) + (B ? (i < iB ? 0 : B.cost - valueAt(B, method, rate, i)) : 0);
      const costNow = A.cost + (B && i >= iB ? B.cost : 0);
      if (which === 'machinery') {
        closings.push(costNow);
        explanation.push(
          `${yearTitle(y, i)}: ${i > 0 ? `The account opens with ${inr(atCost)}, the cost and not the book value. ` : ''}${bought.join(' ')}${bought.length ? ' ' : ''}The depreciation of the year, ${inr(dA + dB)}, is credited to Provision for Depreciation A/c, not here. The balance is the machinery at cost, ${inr(costNow)}: ${balancedAt(y, i, costNow, i === years - 1)}.`,
        );
      } else {
        closings.push(-provided);
        must.push({ year: i, side: 1, label: DEP_AC, amount: dA + dB });
        explanation.push(
          `${yearTitle(y, i)}: ${workIn(A, y, rate, i)}${B && both ? ` ${workIn(B, y, rate, i)} Depreciation of the year = ${inr(dA)} + ${inr(dB)} = ${inr(dA + dB)}.` : ''} It is debited to Depreciation A/c and credited here: ${quote('By', DEP_AC, dA + dB)}. The provision now stands at ${i > 0 ? `${inr(held)} + ${inr(dA + dB)} = ` : ''}${inr(provided)}, a credit balance: ${balancedAt(y, i, provided, i === years - 1, true)}.`,
        );
      }
      held = provided;
      atCost = costNow;
    }
    const end = endOf(y, years - 1);
    const how = method === 'slm' ? HOW.slm : 'by the written down value method (on cost less the depreciation provided so far)';
    const rest = {
      data: [
        `${firm} closes its books on 31 March every year. Its machinery is kept at cost in Machinery A/c: depreciation, at ${rate}% a year ${how}, for the period of use in whole months from the date of purchase, is credited to Provision for Depreciation A/c.`,
        `${dateA}: Bought ${B ? `machine 1 (${itemA})` : itemA} for ${inr(A.cost)}, paid by cheque.`,
        ...(B ? [`${dateB}: Bought machine 2 (${itemB}) for ${inr(B.cost)}, paid by cheque.`] : []),
        `${firm} has no other machinery, and none was sold up to ${end}.`,
      ].join('\n'),
      explanation,
      hints: FORMAT_HINTS.provision,
    };
    if (which === 'machinery') {
      return runAccount({ accountId: 'machinery', years: run, closings }, y, {
        ...rest,
        // The task itself says that a provision account is kept: the question is what that leaves in Machinery A/c, not a trap.
        task: `Prepare Machinery A/c of ${firm}, which keeps a Provision for Depreciation A/c, for the three years ended ${end}. ${RUN_TASK}`,
        title: 'Machinery A/c',
        distractors: ['Machinery A/c', DEP_AC, 'Provision for Depreciation A/c', 'Profit and Loss A/c', 'Cash A/c'],
      });
    }
    return runAccount(
      { accountId: 'provisionForDepreciation', years: run, closings, must },
      y,
      {
        ...rest,
        task: `Prepare Provision for Depreciation A/c of ${firm} for the three years ended ${end}. ${RUN_TASK}${B ? ' Enter the depreciation of a year on the two machines as one figure.' : ''}`,
        title: 'Provision for Depreciation A/c',
        distractors: ['Provision for Depreciation A/c', 'Machinery A/c', 'Profit and Loss A/c', 'Bank A/c'],
      },
      { details },
    );
  },
  verify: runHolds,
});

// 5. dep-fmt-sale: Machinery A/c from the purchase to the year in which a machine is sold part-way through, two or
//    three years, depreciation written off the asset: depreciation to the date of sale, the price, the profit or loss (complex)
const fmtSale = accountTemplate({
  id: 'dep-fmt-sale', topicId: T, conceptId: 'dep-formats', difficulty: 'complex',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const firm = rng.pick(FIRMS);
    const method = rng.pick(['slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    // Two machines bought in the first year, one of them sold in the second; one machine sold in the second year and
    // another bought in its place; or the only machine sold, in its second or third year.
    const variant = rng.pick(['two', 'two', 'replace', 'replace', 'single', 'single'] as const);
    /** The sale is in the accounting year `n` years after the first: the account runs over `n + 1` years. */
    const n = variant === 'single' ? rng.pick([1, 2]) : 1;
    const e = rng.int(2, 10); // sold on the first of a month from June to February
    const profit = rng.int(0, 1) === 0;
    const items = rng.shuffle(MACHINES);
    const k1 = variant === 'two' ? rng.pick([0, 0, 3, 6]) : rng.pick([0, 0, 3, 6, 9]);
    const k2 = rng.pick([3, 6, 9].filter((k) => k > k1 || variant !== 'two'));
    const soldIsFirst = variant !== 'two' || rng.int(0, 1) === 0;
    const many = variant !== 'single';
    const m1 = runMachine(rng, method, rate, many ? 'machine 1' : 'the machine', items[0], 0, k1, soldIsFirst ? [12 - k1, ...twelves(n - 1), e] : [12 - k1, ...twelves(n)], 200000, 600000);
    const m2 = variant === 'two' ? runMachine(rng, method, rate, 'machine 2', items[1], 0, k2, soldIsFirst ? [12 - k2, 12] : [12 - k2, e], 150000, 500000) : null;
    const kNew = rng.int(e, 10);
    const fresh = variant === 'replace' ? runMachine(rng, method, rate, 'machine 2', items[1], n, kNew, [12 - kNew], 150000, 500000) : null;
    if (m1 === null || (variant === 'two' && m2 === null) || (variant === 'replace' && fresh === null)) return null;
    if (m2 && m2.cost === m1.cost) return null;
    const gone = soldIsFirst ? m1 : m2!;
    const kept = variant === 'two' ? (soldIsFirst ? m2! : m1) : fresh;
    const old = [m1, ...(m2 ? [m2] : [])]; // the machines bought before the year of sale, in the order they were bought
    const last = gone.charges[gone.charges.length - 1];
    const bv = last.close;
    const sold = sellingPrice(rng, bv, gone.cost, profit);
    if (sold === null) return null;
    const gap = Math.abs(sold - bv);
    const keptCharge = kept ? kept.charges[kept.charges.length - 1] : null;
    // Two depreciation rows of the same amount on one side of a year could not be told apart.
    if (keptCharge && keptCharge.amount === last.amount) return null;
    const saleDate = dateIn(y + n, e);
    const end = endOf(y, n);
    const bought = (m: RunMachine): DatedEntry => ({ date: dateIn(y + m.i, m.k), lines: [dr('machinery', m.cost), cr('bank', m.cost)] });
    const run: DatedEntry[][] = [];
    const details: Record<string, string[]> = {};
    const closings: number[] = [];
    const explanation: string[] = [];
    for (let i = 0; i < n; i++) {
      const steps: string[] = [];
      const entries: DatedEntry[] = [];
      if (i === 0) {
        entries.push(...old.map(bought));
        steps.push(
          old.length > 1
            ? `Each machine is debited at its cost on the day it is bought: ${old.map((m) => quote('To', 'Bank A/c', m.cost)).join(' and ')}.`
            : `${capital(m1.name)} is debited at its cost: ${quote('To', 'Bank A/c', m1.cost)}.`,
        );
      }
      const ds = old.map((m) => m.charges[i].amount);
      entries.push({ date: endOf(y, i), lines: [dr('depreciation', sumOf(ds)), cr('machinery', sumOf(ds))] });
      steps.push(...old.map((m) => workIn(m, y, rate, i)));
      if (old.length > 1) {
        details[endOf(y, i)] = old.map((m, j) => `${capital(m.name)} ${inr(ds[j])}`);
        steps.push(`Depreciation of the year = ${ds.map(inr).join(' + ')} = ${inr(sumOf(ds))}: ${quote('By', DEP_AC, sumOf(ds))}.`);
      } else {
        steps.push(`It is written off the machine: ${quote('By', DEP_AC, ds[0])}.`);
      }
      const close = sumOf(old.map((m) => valueAt(m, method, rate, i)));
      steps.push(`The debit side is larger by ${inr(close)}${old.length > 1 ? ` (${old.map((m) => inr(m.charges[i].close)).join(' + ')})` : ''}: ${balancedAt(y, i, close, false)}.`);
      run.push(entries);
      closings.push(close);
      explanation.push(`${yearTitle(y, i)}: ${steps.join(' ')}`);
    }
    run.push([
      { date: saleDate, lines: [dr('depreciation', last.amount), cr('machinery', last.amount)] },
      { date: saleDate, lines: [dr('bank', sold), cr('machinery', sold)] },
      { date: saleDate, lines: profit ? [dr('machinery', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('machinery', gap)] },
      ...(fresh ? [bought(fresh)] : []),
      ...(keptCharge ? [{ date: end, lines: [dr('depreciation', keptCharge.amount), cr('machinery', keptCharge.amount)] }] : []),
    ]);
    const closing = kept ? bookValueAfter(method, kept.cost, rate, kept.months) : 0;
    closings.push(closing);
    const openOfGone = gone.charges[gone.charges.length - 2].close;
    const base = method === 'slm' ? `the cost of ${inr(gone.cost)}` : `the written down value of ${inr(last.base)}`;
    const saleSteps: string[] = [
      `${capital(gone.name)}, from ${startOf(y, n)} to ${saleDate}, is ${e} months of use: ${rate}% of ${base} x ${e}/12 = ${inr(last.amount)}, entered on the date of sale: ${quote('By', DEP_AC, last.amount)}.`,
      `Book value of ${gone.name} on ${saleDate} = ${inr(openOfGone)} - ${inr(last.amount)} = ${inr(bv)}.`,
      `The whole price is credited to Machinery A/c, as the data says: ${quote('By', 'Bank A/c', sold)}.`,
      profit
        ? `The price is ${inr(sold)} - ${inr(bv)} = ${inr(gap)} more than the book value, a profit. It is transferred out of Machinery A/c by a debit: ${quote('To', 'Profit on Sale of Asset A/c', gap)}. The two rows together take ${inr(sold)} - ${inr(gap)} = ${inr(bv)} out of the account, the book value, so that nothing of ${gone.name} is left in it: the same result as one entry for the sale that credits Machinery A/c with the book value and Profit on Sale of Asset A/c with the profit.`
        : `The price is ${inr(bv)} - ${inr(sold)} = ${inr(gap)} less than the book value, a loss. It is transferred out of Machinery A/c by a credit: ${quote('By', 'Loss on Sale of Asset A/c', gap)}. The two credits together take ${inr(sold)} + ${inr(gap)} = ${inr(bv)} out of the account, the book value, so that nothing of ${gone.name} is left in it.`,
      ...(fresh ? [`The machine bought in its place is debited at its cost: ${quote('To', 'Bank A/c', fresh.cost)}.`] : []),
    ];
    if (kept && keptCharge) {
      const on = keptCharge.base === kept.cost ? `the cost of ${inr(kept.cost)}` : `the written down value of ${inr(keptCharge.base)}`;
      saleSteps.push(
        keptCharge.months === 12
          ? `${capital(kept.name)} was in use for the whole year: ${rate}% of ${on} = ${inr(keptCharge.amount)}, on ${end}: ${quote('By', DEP_AC, keptCharge.amount)}.`
          : `${capital(kept.name)}, from ${dateIn(y + kept.i, kept.k)} to ${end}, is ${keptCharge.months} months of use: ${rate}% of ${on} x ${keptCharge.months}/12 = ${inr(keptCharge.amount)}, on ${end}: ${quote('By', DEP_AC, keptCharge.amount)}.`,
        `What is left is the book value of ${kept.name}, ${inr(closing)}: ${balancedAt(y, n, closing, true)}.`,
      );
    } else {
      saleSteps.push('The two sides of the year now agree: nothing is left in Machinery A/c, so there is no balance to carry down.');
    }
    explanation.push(`${yearTitle(y, n)}: ${saleSteps.join(' ')}`);
    return runAccount(
      {
        accountId: 'machinery',
        years: run,
        closings,
        must: [
          { year: n, side: 1, label: DEP_AC, amount: last.amount },
          { year: n, side: 1, label: 'Bank A/c', amount: sold },
          { year: n, side: profit ? 0 : 1, label: profit ? 'Profit on Sale of Asset A/c' : 'Loss on Sale of Asset A/c', amount: Math.abs(sold - bookValueAfter(method, gone.cost, rate, gone.months)) },
        ],
      },
      y,
      {
        task: kept
          ? `Prepare Machinery A/c of ${firm} for the ${YEARS[n + 1]} years ended ${end}. ${RUN_TASK} Enter the depreciation on the machine sold in a row of its own, on the date of sale${variant === 'two' ? ', and the depreciation of the first year on the two machines as one figure' : ''}.`
          : `Prepare Machinery A/c of ${firm} for the ${YEARS[n + 1]} years ended ${end}, from the purchase of the machine to its sale. Balance it on each 31 March and bring down on the next 1 April any balance that is left.`,
        data: [
          `${firm} closes its books on 31 March every year. Depreciation is charged at ${rate}% a year ${HOW[method]}, for the period of use in whole months from the date of purchase to the date of sale, and is written off Machinery A/c itself: no provision account and no Asset Disposal A/c is kept.`,
          'A sale is shown in Machinery A/c in two steps: the whole price, received by cheque, is credited to Machinery A/c, and the profit or loss on the sale is then transferred from Machinery A/c to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.',
          ...old.map((m) => `${dateIn(y + m.i, m.k)}: Bought ${many ? `${m.name} (${m.item})` : m.item} for ${inr(m.cost)}, paid by cheque.`),
          `${saleDate}: Sold ${gone.name} for ${inr(sold)}.`,
          ...(fresh ? [`${dateIn(y + n, kNew)}: Bought ${fresh.name} (${fresh.item}) in its place for ${inr(fresh.cost)}, paid by cheque.`] : []),
          `${firm} had no other machinery.`,
        ].join('\n'),
        title: 'Machinery A/c',
        distractors: ['Machinery A/c', 'Asset Disposal A/c', 'Provision for Depreciation A/c', profit ? 'Loss on Sale of Asset A/c' : 'Profit on Sale of Asset A/c', 'Cash A/c'],
        explanation,
        hints: FORMAT_HINTS.sale,
      },
      // The place for a balance brought down is shown whether or not a machine is left, so the screen does not say that none is.
      { details },
    );
  },
  verify: runHolds,
});

// 6. dep-fmt-disposal: Asset Disposal A/c on the sale of a machine when a Provision for Depreciation A/c is kept.
//    One account of four or five rows, with the depreciation provided to be worked out: a 4-mark question, as the
//    Provision for Depreciation A/c of three years is, and not a 6-mark one (medium). Where the machine costs
//    something to take out, the data says that the expense is debited to Asset Disposal A/c, so "To Cash A/c" is the
//    only row to give it (card 17 has the arithmetic: the expense lowers the profit or adds to the loss).
const fmtDisposal = accountTemplate({
  id: 'dep-fmt-disposal', topicId: T, conceptId: 'dep-formats', difficulty: 'medium',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(MACHINE_ASSETS);
    const method = rng.pick(['slm', 'slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    const n = rng.pick([1, 2, 2, 3]);
    const within = rng.int(0, 3) > 0;
    // A machine sold at its first year end has been used for the whole of that year.
    const k0 = n === 1 && !within ? 0 : rng.pick([0, 0, 3, 6, 9]);
    const e = within ? rng.int(2, 10) : 0;
    const t = saleTimeline(y, k0, n, e);
    const cost = roundCost(rng, 100000, 600000, (c) => chargesFor(method, c, rate, t.months));
    if (cost === null) return null;
    const charges = chargesFor(method, cost, rate, t.months)!;
    const provision = sumOf(charges.map((c) => c.amount));
    const bv = cost - provision;
    const sold = sellingPrice(rng, bv, cost, rng.int(0, 1) === 0);
    if (sold === null) return null;
    // Sometimes the machine costs something to take out: an expense of the sale, debited to Asset Disposal A/c.
    const removal = rng.int(0, 2) === 0 ? rng.step(1000, 5000, 500) : 0;
    const result = sold - removal - bv;
    if (result === 0) return null;
    const profit = result > 0;
    const gap = Math.abs(result);
    // Sometimes the provision on 1 April is given, and only the months up to the sale are left to work out.
    const given = within && rng.int(0, 2) === 0;
    const heldBefore = provision - charges[charges.length - 1].amount;
    const during: DatedEntry[] = [
      { date: t.saleDate, lines: [dr('assetDisposal', cost), cr('machinery', cost)] },
      { date: t.saleDate, lines: [dr('provisionForDepreciation', provision), cr('assetDisposal', provision)] },
      { date: t.saleDate, lines: [dr('bank', sold), cr('assetDisposal', sold)] },
      ...(removal ? [{ date: t.saleDate, lines: [dr('assetDisposal', removal), cr('cash', removal)] }] : []),
      { date: t.saleDate, lines: profit ? [dr('assetDisposal', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('assetDisposal', gap)] },
    ];
    const how = method === 'slm' ? HOW.slm : 'by the written down value method (on cost less the depreciation provided so far)';
    const data = [
      `${firm} closes its books on 31 March every year. Machinery is kept at cost in Machinery A/c; depreciation, at ${rate}% a year ${how}, for the period of use in whole months from the date of purchase to the date of sale, is credited to Provision for Depreciation A/c. A sale is recorded through Asset Disposal A/c, whose balance is then transferred to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.`,
      given
        ? `1 April ${y + n}: Machinery A/c showed ${a.item} at its cost of ${inr(cost)}, and Provision for Depreciation A/c showed ${inr(heldBefore)} on it.`
        : `${dateIn(y, k0)}: Bought ${a.item} for ${inr(cost)}, paid by cheque.`,
      `${t.saleDate}: Sold ${a.the} for ${inr(sold)}, received by cheque, after depreciation ${within ? 'up to this date' : 'for the year'} had been provided.`,
      ...(removal ? [`${t.saleDate}: Paid ${inr(removal)} in cash for dismantling and removing ${a.the}; this expense of the sale is debited to Asset Disposal A/c.`] : []),
    ].join('\n');
    const lastCharge = charges[charges.length - 1];
    const provisionWork = given
      ? [
          chargeWorking(rate, cost, lastCharge, t.lastPeriod),
          `Depreciation provided on ${a.the} up to the date of sale = ${inr(heldBefore)} + ${inr(lastCharge.amount)} = ${inr(provision)}.`,
        ]
      : [
          ...charges.map((c, j) => {
            const period = within && j === charges.length - 1 ? t.lastPeriod : c.months === 12 ? `the year ended ${endOf(y, j)}` : `From ${dateIn(y, k0)} to ${endOf(y, j)}`;
            return chargeWorking(rate, cost, c, period);
          }),
          `Depreciation provided on ${a.the} up to the date of sale = ${charges.length > 1 ? `${charges.map((c) => inr(c.amount)).join(' + ')} = ` : ''}${inr(provision)}.`,
        ];
    const debits = cost + removal;
    const credits = provision + sold;
    return runAccount(
      {
        accountId: 'assetDisposal',
        years: [during],
        closings: [0],
        must: [
          { year: 0, side: 0, label: 'Machinery A/c', amount: cost },
          { year: 0, side: 1, label: 'Provision for Depreciation A/c', amount: cost - bookValueAfter(method, cost, rate, t.months) },
          { year: 0, side: profit ? 0 : 1, label: profit ? 'Profit on Sale of Asset A/c' : 'Loss on Sale of Asset A/c', amount: gap },
        ],
      },
      // The accounting year of the sale: a sale on 31 March closes the year it falls in.
      within ? y + n : y + n - 1,
      {
        task: `Prepare Asset Disposal A/c of ${firm} for the sale of ${a.the} on ${t.saleDate} and close it.`,
        data,
        title: 'Asset Disposal A/c',
        distractors: ['Asset Disposal A/c', DEP_AC, profit ? 'Loss on Sale of Asset A/c' : 'Profit on Sale of Asset A/c', BALANCE_CD, BALANCE_BD, 'Cash A/c'],
        explanation: [
          `${capital(a.the)} leaves Machinery A/c at its cost, which is transferred here: ${quote('To', 'Machinery A/c', cost)}.`,
          ...provisionWork,
          `${charges.length > 1 || given ? 'All of it is transferred from the provision account, not only the charge of the last period' : 'It is transferred from the provision account'}: ${quote('By', 'Provision for Depreciation A/c', provision)}.`,
          `The price received by cheque: ${quote('By', 'Bank A/c', sold)}.`,
          ...(removal ? [`The cost of removing ${a.the} is an expense of the sale: ${quote('To', 'Cash A/c', removal)}.`] : []),
          `Debit side so far: ${removal ? `${inr(cost)} + ${inr(removal)} = ` : ''}${inr(debits)}. Credit side so far: ${inr(provision)} + ${inr(sold)} = ${inr(credits)}.`,
          profit
            ? `The credits are ${inr(gap)} more: a profit, transferred by a debit that closes the account: ${quote('To', 'Profit on Sale of Asset A/c', gap)}.`
            : `The debits are ${inr(gap)} more: a loss, transferred by a credit that closes the account: ${quote('By', 'Loss on Sale of Asset A/c', gap)}.`,
          `Check: book value on the date of sale = ${inr(cost)} - ${inr(provision)} = ${inr(bv)}; ${removal ? `net proceeds = ${inr(sold)} - ${inr(removal)} = ${inr(sold - removal)}` : `price = ${inr(sold)}`}; ${profit ? 'profit' : 'loss'} = ${inr(gap)}.`,
        ],
        hints: [
          'Asset Disposal A/c gathers three things: the cost of the machine, all the depreciation provided on it, and what the sale brought in.',
          'Total the two sides. If the credits are more, the difference is a profit; if the debits are more, a loss.',
        ],
      },
      { bringDown: false },
    );
  },
  verify: runHolds,
});

const formats: AccountTemplate[] = [fmtSlmYear, fmtWdvPartYear, fmtSecondMachine, fmtProvision, fmtSale, fmtDisposal];

/**
 * The schedules and the wording of the sets and formats above, for the chained cases of the stage "The life of an
 * asset" (`cases/asset-life.ts`), which prepare the same accounts from one case text. Nothing here makes a question.
 */
export const DEP_CHAIN = { chargesFor, roundCost, chargeWorking, quote, balancedAt, endOf, startOf, yearTitle, RUN_TASK, FORMAT_HINTS, DEP_AC, SUPPLIERS, YEARS };
export type { Charge as DepCharge };


// ---------------------------------------------------------------------------------------------------------------
// The theory of depreciation the CBSE 2025-26 syllabus names line by line, added after the check against it: the
// features and factors of depreciation, depletion and amortisation as the similar terms, the advantages of the two
// methods and the difference between them. Each question is drawn from a bank of scenarios and statements.
// ---------------------------------------------------------------------------------------------------------------

const depFeature = factsTemplate({
  id: 'dep-feature', topicId: T, conceptId: 'dep-meaning', difficulty: 'easy', version: 2,
  facts: withHints(H.theory, [
    {
      prompt: 'Which of these is a feature of depreciation?',
      correct: 'It is a gradual fall in the book value of a fixed asset over its useful life',
      distractors: [
        { text: 'It is a sudden loss of an asset, such as one destroyed by fire', why: 'A sudden loss is a loss by accident, not depreciation, which is gradual and continuing.' },
        { text: 'It is a fall in the market price of an asset', why: 'Depreciation is not a market valuation; it spreads the cost over the useful life.' },
        { text: 'It is charged on goods held for sale', why: 'Depreciation is charged on fixed assets; goods for sale (stock) are valued at cost or market price, whichever is lower.' },
      ],
      explanation: 'Depreciation is a gradual and continuing decline in the book value of fixed assets, arising from use, time or obsolescence.',
    },
    {
      prompt: 'Which of these is NOT a feature of depreciation?',
      correct: 'It is a cash expense, paid each year to the seller of the asset',
      distractors: [
        { text: 'It is a charge against profit', why: 'Depreciation is charged to the Profit and Loss Account, so this is a feature, not the odd one out.' },
        { text: 'It goes on throughout the useful life of the asset', why: 'Depreciation is a continuing process over the useful life, so this is a feature.' },
        { text: 'It applies to fixed assets only', why: 'Depreciation is charged on fixed assets, so this is a feature.' },
      ],
      explanation: 'Depreciation is a non-cash expense: the cash went out when the asset was bought, and nothing is paid when depreciation is charged.',
    },
    {
      prompt: 'Depreciation is called a non-cash expense because:',
      correct: 'No money leaves the business when it is charged',
      distractors: [
        { text: 'It is not shown in the Profit and Loss Account', why: 'It is shown there: it is a charge against profit.' },
        { text: 'It is paid by cheque, not in cash', why: 'Nothing is paid at all; the cost was paid when the asset was bought.' },
        { text: 'It is charged only on assets bought on credit', why: 'Depreciation is charged on every fixed asset, however it was paid for.' },
      ],
      explanation: 'Charging depreciation moves a part of the cost already paid into the expenses of the year; no cash moves.',
    },
    {
      prompt: 'A machine is kept idle for the whole year because of a shortage of orders. Is depreciation charged on it?',
      correct: 'Yes: its life runs out with time and it may become out of date, even when it is not used',
      distractors: [
        { text: 'No: an asset that is not used does not depreciate', why: 'Use is one cause; the passing of time and obsolescence are others.' },
        { text: 'No: depreciation is charged only when the asset earns income', why: 'Depreciation is a cost of owning the asset over its life, charged whether or not income is earned.' },
        { text: 'Only if its market price has fallen', why: 'A fall in market price is not a cause of depreciation.' },
      ],
      explanation: 'Depreciation arises from use, the passing of time and obsolescence, so an idle asset still depreciates.',
    },
    {
      prompt: 'Depreciation is charged even in a year in which the business makes a loss. Why?',
      correct: 'It is a charge against profit, not an appropriation of profit, so it is charged whether there is a profit or not',
      distractors: [
        { text: 'Because the tax law requires a loss to be shown', why: 'The reason is the nature of depreciation as a cost, not a wish to show a loss.' },
        { text: 'Because depreciation turns a loss into a profit', why: 'Depreciation is an expense; it increases a loss, it never turns it into a profit.' },
        { text: 'It is not: depreciation is charged only out of profits', why: 'Mixed depreciation up with a reserve, which is an appropriation made only out of profit.' },
      ],
      explanation: 'Like rent or salaries, depreciation is a cost of earning revenue, so it is charged in every year the asset is used.',
    },
    {
      prompt: 'Which statement about depreciation is true?',
      correct: 'It allocates the cost of a fixed asset over the years it is used',
      distractors: [
        { text: 'It sets aside cash for buying a new asset', why: 'Depreciation is a book entry; it keeps no cash aside.' },
        { text: 'It shows what the asset would fetch if sold today', why: 'Book value after depreciation is not a market value.' },
        { text: 'It is charged on land, like every fixed asset', why: 'Land does not wear out with use or time, so it is generally not depreciated.' },
      ],
      explanation: 'Depreciation is a process of allocation, not of valuation: it charges each year with its share of the cost.',
    },
  ]),
});

const depFactor = factsTemplate({
  id: 'dep-factor', topicId: T, conceptId: 'dep-meaning', difficulty: 'easy', version: 2,
  facts: withHints(H.theory, [
    {
      prompt: 'A machine is expected to be sold as scrap for ₹15,000 at the end of its life. For depreciation, this figure is the:',
      correct: 'Estimated scrap (residual) value',
      distractors: [
        { text: 'Cost of the asset', why: 'The cost is what was paid for the machine and to make it ready for use, not what it will fetch at the end.' },
        { text: 'Estimated useful life', why: 'The useful life is a number of years, not an amount.' },
        { text: 'Annual depreciation', why: 'The scrap value is what is left at the end; the yearly charge is worked from the cost less this figure.' },
      ],
      explanation: 'Scrap value is one of the three factors; it is deducted from the cost to find the depreciable cost.',
    },
    {
      prompt: 'A delivery van is expected to serve the business for 6 years. For depreciation, the 6 years are the:',
      correct: 'Estimated useful life',
      distractors: [
        { text: 'Rate of depreciation', why: 'The rate is a percentage worked from the cost, scrap value and life; the 6 years are the life itself.' },
        { text: 'Accounting period', why: 'The accounting period is the year for which accounts are made, not the life of the asset.' },
        { text: 'Scrap value', why: 'Scrap value is an amount at the end of the life, not a number of years.' },
      ],
      explanation: 'Useful life is the period over which the asset is expected to be used; the depreciable cost is spread over it.',
    },
    {
      prompt: 'A machine is bought for ₹2,00,000 and ₹10,000 is spent to install it. For depreciation, the cost of the asset is:',
      correct: '₹2,10,000, the price and the installation charges',
      distractors: [
        { text: '₹2,00,000, the price alone', why: 'Left out the installation, which is spent to make the asset ready for use and is part of its cost.' },
        { text: '₹1,90,000, the price less the installation charges', why: 'Deducted the installation charges instead of adding them.' },
        { text: '₹10,000, the installation charges alone', why: 'The installation charges are only a part of the cost.' },
      ],
      explanation: 'Cost includes everything spent to bring the asset to the place and condition for use: price, freight, installation.',
    },
    {
      prompt: 'Cost less estimated scrap value is called the:',
      correct: 'Depreciable cost',
      distractors: [
        { text: 'Book value', why: 'Book value is cost less the depreciation charged so far, not cost less scrap value.' },
        { text: 'Market value', why: 'Market value is what the asset would fetch today; it is not used to work depreciation.' },
        { text: 'Written down value', why: 'Written down value is the balance of the asset after depreciation has been written off.' },
      ],
      explanation: 'The depreciable cost is the amount spread over the useful life of the asset.',
    },
    {
      prompt: 'Which of these is NOT a factor in working out the amount of depreciation?',
      correct: 'The price at which a similar asset is selling today',
      distractors: [
        { text: 'The cost of the asset', why: 'Cost is a factor: depreciation spreads it.' },
        { text: 'The estimated useful life', why: 'Useful life is a factor: the cost is spread over it.' },
        { text: 'The estimated scrap value', why: 'Scrap value is a factor: it is deducted from the cost.' },
      ],
      explanation: 'The factors are cost, useful life and scrap value. Market prices do not enter the working.',
    },
  ]),
});

/** What the write-off of an asset's cost is called: depreciation, depletion or amortisation. */
const WRITE_OFF: { asset: string; term: 'Depreciation' | 'Depletion' | 'Amortisation' }[] = [
  { asset: 'a coal mine whose coal is being extracted', term: 'Depletion' },
  { asset: 'a stone quarry being worked', term: 'Depletion' },
  { asset: 'an oil well', term: 'Depletion' },
  { asset: 'a patent bought for 10 years', term: 'Amortisation' },
  { asset: 'a copyright on a textbook', term: 'Amortisation' },
  { asset: 'a trademark bought from another firm', term: 'Amortisation' },
  { asset: 'computer software bought for the office', term: 'Amortisation' },
  { asset: 'a delivery van', term: 'Depreciation' },
  { asset: 'factory machinery', term: 'Depreciation' },
  { asset: 'office furniture', term: 'Depreciation' },
];
const TERM_WHY: Record<'Depreciation' | 'Depletion' | 'Amortisation' | 'Obsolescence', string> = {
  Depreciation: 'Depreciation is the word for tangible fixed assets such as machinery and vehicles.',
  Depletion: 'Depletion is the word for natural resources (mines, quarries, oil wells) used up as they are extracted.',
  Amortisation: 'Amortisation is the word for intangible assets such as patents, copyrights, trademarks and software.',
  Obsolescence: 'Obsolescence is a cause of depreciation (an asset going out of date), not the name of a write-off.',
};

const depSimilarTerm = factsTemplate({
  id: 'dep-similar-term', topicId: T, conceptId: 'dep-meaning', difficulty: 'easy', version: 2,
  facts: withHints(H.terms, WRITE_OFF.map(({ asset, term }) => ({
    prompt: `The cost of ${asset} is written off over the years. What is the write-off called?`,
    correct: term,
    distractors: (['Depreciation', 'Depletion', 'Amortisation', 'Obsolescence'] as const).filter((t) => t !== term).map((t) => ({ text: t, why: `Called it ${t.toLowerCase()}: ${TERM_WHY[t]}` })),
    explanation: TERM_WHY[term],
  }))),
});

/** Three assets of different kinds, named together: the right names of their write-offs, and the usual mix-ups. */
const depSimilarTriple = factsTemplate({
  id: 'dep-similar-terms-together', topicId: T, conceptId: 'dep-meaning', difficulty: 'complex', version: 2,
  facts: withHints(H.terms, WRITE_OFF.filter((x) => x.term === 'Depletion').flatMap((mine) =>
    WRITE_OFF.filter((x) => x.term === 'Amortisation').flatMap((intangible) =>
      WRITE_OFF.filter((x) => x.term === 'Depreciation').map((tangible) => ({
        prompt: `A business owns ${mine.asset}, ${intangible.asset} and ${tangible.asset}. In that order, what is the write-off of the cost of each called?`,
        correct: 'Depletion, amortisation, depreciation',
        distractors: [
          { text: 'Depreciation, depreciation, depreciation', why: 'Used one word for every asset; the name changes with the kind of asset.' },
          { text: 'Amortisation, depletion, depreciation', why: 'Swapped depletion and amortisation: natural resources are depleted, intangible assets amortised.' },
          { text: 'Depletion, depreciation, amortisation', why: 'Swapped the intangible asset and the tangible one: intangibles are amortised, tangible assets depreciated.' },
          { text: 'Depreciation, amortisation, depletion', why: 'Took the tangible asset as the natural resource and the natural resource as the tangible asset.' },
        ],
        explanation: 'A natural resource is depleted as it is extracted, an intangible asset is amortised, and a tangible fixed asset is depreciated.',
      })),
    ),
  )),
});

const depMethodAdvantage = factsTemplate({
  id: 'dep-method-advantage', topicId: T, conceptId: 'dep-compare', difficulty: 'medium', version: 2,
  facts: withHints(H.methods, [
    {
      prompt: 'Which of these is an advantage of the straight line method?',
      correct: 'It is simple to work out, and the same charge every year makes the results of the years easy to compare',
      distractors: [
        { text: 'It charges more in the early years, when the asset is most useful', why: 'That is an advantage of the written down value method; the straight line charge is the same every year.' },
        { text: 'It keeps depreciation plus repairs fairly even over the life of the asset', why: 'That is an advantage of the written down value method, whose charge falls as repairs rise.' },
        { text: 'It never lets the book value of the asset reach nil', why: 'That is how the written down value method works, and it is not counted as an advantage of the straight line method.' },
      ],
      explanation: 'Straight line: simple, a fixed charge, the asset written down to exactly its scrap value; suits assets used evenly, such as leases and patents.',
    },
    {
      prompt: 'Which of these is an advantage of the written down value method?',
      correct: 'Depreciation plus repairs stays fairly even over the years, as the charge falls while repairs rise',
      distractors: [
        { text: 'It charges the same amount every year', why: 'That is the straight line method; under written down value the charge falls each year.' },
        { text: 'It charges the least depreciation in the first year, when the asset is new', why: 'Turned it round: the written down value charge is heaviest in the first year and falls after.' },
        { text: 'It is the simplest method to work out', why: 'Simplicity is counted in favour of the straight line method.' },
      ],
      explanation: 'Written down value: a heavier charge in the early years, an even total of depreciation and repairs, accepted by the income tax law; suits plant, machinery and vehicles.',
    },
    {
      prompt: 'Why is the written down value method said to match the use of an asset like machinery?',
      correct: 'A machine gives most service in its early years, when this method charges the most',
      distractors: [
        { text: 'Because the charge is the same every year', why: 'That describes the straight line method.' },
        { text: 'Because the machine is worth nothing at the end', why: 'Under written down value the book value never becomes nil.' },
        { text: 'Because the market price of machinery falls each year', why: 'Depreciation does not follow market prices.' },
      ],
      explanation: 'The falling charge of the written down value method follows the falling usefulness of such assets.',
    },
    {
      prompt: 'A 5-year lease is written off by the straight line method. Which advantage of the method fits it?',
      correct: 'The lease gives the same benefit every year, and the method charges the same amount every year',
      distractors: [
        { text: 'The charge is heaviest in the first year, when the lease is most useful', why: 'That describes the written down value method; a lease is used evenly.' },
        { text: 'Repairs to a lease rise every year', why: 'A lease needs no repairs; that argument is for machinery and the written down value method.' },
        { text: 'The method is the one the income tax law accepts', why: 'That is said of the written down value method.' },
      ],
      explanation: 'Even use, even charge: the straight line method suits assets such as leases and patents.',
    },
  ]),
});

const depMethodDifference = factsTemplate({
  id: 'dep-method-difference', topicId: T, conceptId: 'dep-compare', difficulty: 'medium', version: 2,
  facts: withHints(H.methods, [
    {
      prompt: 'On what is depreciation worked out each year under the two methods?',
      correct: 'Straight line: on the original cost; written down value: on the book value at the start of the year',
      distractors: [
        { text: 'Straight line: on the book value; written down value: on the original cost', why: 'Swapped the bases of the two methods.' },
        { text: 'On the original cost under both methods', why: 'The written down value method works on the reducing balance, not on the cost.' },
        { text: 'On the market value under both methods', why: 'Neither method uses the market value.' },
      ],
      explanation: 'This is the root difference: a fixed base gives a fixed charge, a falling base a falling charge.',
    },
    {
      prompt: 'How does the yearly charge behave under the two methods?',
      correct: 'Straight line: the same every year; written down value: smaller every year',
      distractors: [
        { text: 'Straight line: smaller every year; written down value: the same every year', why: 'Swapped the two methods.' },
        { text: 'Both: the same every year', why: 'The written down value charge falls because the rate is applied to a smaller balance each year.' },
        { text: 'Both: larger every year', why: 'Neither charge rises; one is fixed and the other falls.' },
      ],
      explanation: 'Under written down value a fixed rate on a falling balance gives a falling charge.',
    },
    {
      prompt: 'What happens to the book value of the asset under the two methods?',
      correct: 'Straight line: it can be brought down to nil or to scrap value; written down value: it never becomes nil',
      distractors: [
        { text: 'Straight line: it never becomes nil; written down value: it can be brought down to nil', why: 'Swapped the methods: a percentage of a balance never removes the whole balance.' },
        { text: 'It becomes nil under both methods', why: 'Under written down value something is always left.' },
        { text: 'It never changes under either method', why: 'Book value falls by the depreciation charged under both methods.' },
      ],
      explanation: 'A fixed amount can use up the whole depreciable cost; a percentage of what is left always leaves something.',
    },
    {
      prompt: 'Which pair rightly matches each method with the assets it suits?',
      correct: 'Straight line: leases and patents; written down value: plant, machinery and vehicles',
      distractors: [
        { text: 'Straight line: plant and machinery; written down value: leases and patents', why: 'Swapped them: assets used evenly suit the straight line method.' },
        { text: 'Both suit every asset equally', why: 'The choice follows the pattern of use and repairs of the asset.' },
        { text: 'Straight line: vehicles; written down value: patents', why: 'Vehicles need more repairs as they age (written down value); a patent gives even benefit (straight line).' },
      ],
      explanation: 'Even benefit favours the straight line method; heavy early use and rising repairs favour written down value.',
    },
  ]),
});

const depreciationTheory: Template[] = [depFeature, depFactor, depSimilarTerm, depMethodAdvantage, depMethodDifference, depSimilarTriple];

// The theory added after the check against the CBSE 2025-26 syllabus comes last.
const all: Template[] = [...templates, ...sets, ...formats, ...depreciationTheory];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
// Version 2: the "why" of R in the item on market prices was garbled ("That is the purpose of charging it."); it now says what depreciation does.
const assertionReason: Template = { ...assertionReasonTemplate({
  prefix: 'dep', topicId: 'depreciation', conceptId: 'dep-meaning',
  items: [
    {
      answer: 'explains',
      a: 'Depreciation is called a non-cash expense.',
      r: 'Charging it reduces the profit, but no money is paid.',
      aWhy: 'It is an expense of using the asset, and it is not a payment.',
      rWhy: 'The entry debits Depreciation A/c and credits the asset or the provision account.',
      link: 'An expense with no payment is what the name means, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Land is generally not depreciated.',
      r: 'Land is not used up by time or by use.',
      aWhy: 'Depreciation is charged on assets whose usefulness wears out or expires.',
      rWhy: 'Its useful life does not run out.',
      link: 'With nothing used up there is no cost to spread over the years, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Under the written down value method, the depreciation of a full year is highest in the first year.',
      r: 'The rate is applied to a book value that falls every year.',
      aWhy: 'The first year has the largest base, and each later charge is smaller.',
      rWhy: 'Each year starts from the book value left by the year before.',
      link: 'A fixed percentage of a falling figure falls too, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A machine costing ₹1,00,000, bought on 1 October and depreciated at 10% a year on cost, is charged ₹5,000 for the year ending 31 March.',
      r: 'In the year of purchase, depreciation is charged for the months of use only.',
      aWhy: '₹1,00,000 × 10% × 6/12 = ₹5,000.',
      rWhy: 'Depreciation follows use.',
      link: 'The machine was held for six months, which is why half of the yearly charge is taken, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Installation charges of ₹20,000 on a new machine are added to its cost.',
      r: 'All that is spent to make an asset ready for use is capitalised.',
      aWhy: 'The cost is the price paid plus such charges.',
      rWhy: 'Carriage, installation and erection are all part of the cost.',
      link: 'Installation is spent to make the machine ready for use, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A machine costing ₹1,10,000, with a scrap value of ₹10,000 and a life of 5 years, is charged ₹20,000 a year by the straight line method.',
      r: 'Under the straight line method the amount of depreciation is the same every year.',
      aWhy: '(₹1,10,000 - ₹10,000) ÷ 5 = ₹20,000.',
      rWhy: 'The charge is fixed for the life of the asset.',
      link: 'The figure comes from cost less scrap value divided by the life. R says only that it does not change.',
    },
    {
      answer: 'not-the-reason',
      a: 'Writing off the cost of a patent is called amortisation.',
      r: 'Writing off the cost of a mine is called depletion.',
      aWhy: 'Amortisation is the word for an intangible asset.',
      rWhy: 'Depletion is the word for a natural resource.',
      link: 'The name changes with the kind of asset. What a mine is called does not explain what a patent is called.',
    },
    {
      answer: 'not-the-reason',
      a: 'Depreciation A/c is closed by a transfer to the Profit and Loss A/c.',
      r: 'Depreciation reduces the book value of the asset.',
      aWhy: 'The entry is Profit and Loss A/c Dr; To Depreciation A/c.',
      rWhy: 'The asset is shown at less after each charge.',
      link: 'R is the effect on the asset. The account is closed to the Profit and Loss A/c because it is an expense of the year.',
    },
    {
      answer: 'a-only',
      a: 'An asset with a book value of ₹35,000 sold for ₹30,000 gives a loss of ₹5,000.',
      r: 'Profit or loss on sale is found by comparing the selling price with the original cost.',
      aWhy: 'Loss = ₹35,000 - ₹30,000 = ₹5,000.',
      rWhy: 'The price is compared with the book value on the date of sale, not with the original cost.',
    },
    {
      answer: 'a-only',
      a: 'A machine in good working order can still be depreciated for obsolescence.',
      r: 'Depreciation arises only from physical wear and tear.',
      aWhy: 'A newer and better model shortens its useful life, and obsolescence is a cause of depreciation.',
      rWhy: 'Obsolescence, the passage of time and the exhaustion of a natural resource are causes too.',
    },
    {
      answer: 'r-only',
      a: 'Charging depreciation puts cash aside for buying a new asset.',
      r: 'Depreciation is a book entry in which no cash moves.',
      aWhy: 'No money is set aside by the entry.',
      rWhy: 'It is an expense recorded in the books, with no payment.',
    },
    {
      answer: 'r-only',
      a: 'A fall in the market price of a machine is a cause of depreciation.',
      r: 'Depreciation spreads the cost of an asset over its useful life.',
      aWhy: 'A change in market price is not a cause; depreciation is not a valuation.',
      rWhy: 'Each year that the asset is used carries its share of the cost: that is what depreciation does, and why it is charged.',
    },
  ],
}), version: 2 };

// ===============================================================================================================
// ADDED IN THE QUALITY PASS (outside the mock papers, worksheets and Look back: `outsidePapers.ts`)
// ===============================================================================================================

// ---- Several machines over three years, one of them sold part-way through the third ----------------------------
// The board's long question: Machinery A/c (or Provision for Depreciation A/c) over three years, two or three machines
// bought on different dates, one of them sold during the third year. The conventions are the topic's (see the formats
// above) and the data states them. Every account is written up from dated entries and checked by `runHolds`, which
// posts the entries again and compares each year's balance with the book values worked by formula.

interface MultiEvent {
  /** Year from 0, and the place in it: the month index of a purchase or sale (April 0), 12 for the year end. */
  i: number;
  at: number;
  entries: DatedEntry[];
  line?: string;
}

function machinesSale(rng: Rng, to: 'asset' | 'provision'): AccountParts | null {
  const y = rng.int(2020, 2023);
  const firm = rng.pick(FIRMS);
  const method = rng.pick(['slm', 'slm', 'wdv'] as const);
  const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
  const years = 3;
  const three = rng.int(0, 1) === 0;
  const kA = rng.pick([0, 0, 3]);
  const kB = rng.pick([4, 6, 7, 9]);
  const iC = rng.pick([1, 2]);
  const kC = rng.pick([2, 3, 5, 8]);
  const e = rng.int(2, 10); // the sale, in the third year, on the first of a month from June to February
  const soldFirst = rng.int(0, 1) === 0;
  const profit = rng.int(0, 1) === 0;
  const items = rng.shuffle(MACHINES);
  const A = runMachine(rng, method, rate, 'machine 1', items[0], 0, kA, [12 - kA, 12, soldFirst ? e : 12], 200000, 600000);
  const B = runMachine(rng, method, rate, 'machine 2', items[1], 0, kB, [12 - kB, 12, soldFirst ? 12 : e], 150000, 500000);
  const C = three ? runMachine(rng, method, rate, 'machine 3', items[2], iC, kC, [12 - kC, ...twelves(years - 1 - iC)], 100000, 400000) : null;
  if (A === null || B === null || (three && C === null)) return null;
  const costs = [A.cost, B.cost, ...(C ? [C.cost] : [])];
  if (new Set(costs).size !== costs.length) return null;
  const gone = soldFirst ? A : B;
  const machines = [A, B, ...(C ? [C] : [])];
  const last = gone.charges[2];
  const bv = last.close;
  const sold = sellingPrice(rng, bv, gone.cost, profit);
  if (sold === null) return null;
  const gap = Math.abs(sold - bv);
  const provided = gone.cost - bv;
  const saleDate = dateIn(y + 2, e);
  const end = endOf(y, years - 1);
  const credit = to === 'asset' ? 'machinery' : 'provisionForDepreciation';
  /** The machines in use at the end of year i (the one sold is gone by the end of the third). */
  const held = (i: number) => machines.filter((m) => m.i <= i && !(m === gone && i === 2));
  /** The charge of year i on a machine in use at its end. */
  const chargeOf = (m: RunMachine, i: number) => m.charges[i - m.i];
  const yearEnd = (i: number) => sumOf(held(i).map((m) => chargeOf(m, i).amount));
  if (yearEnd(2) === last.amount) return null; // two depreciation rows of one figure on one side could not be told apart
  const events: MultiEvent[] = [];
  for (const m of machines) {
    events.push({
      i: m.i,
      at: m.k,
      entries: [{ date: dateIn(y + m.i, m.k), lines: [dr('machinery', m.cost), cr('bank', m.cost)] }],
      line: `${dateIn(y + m.i, m.k)}: Bought ${m.name} (${m.item}) for ${inr(m.cost)}, paid by cheque.`,
    });
  }
  const saleEntries: DatedEntry[] =
    to === 'asset'
      ? [
          { date: saleDate, lines: [dr('depreciation', last.amount), cr('machinery', last.amount)] },
          { date: saleDate, lines: [dr('bank', sold), cr('machinery', sold)] },
          { date: saleDate, lines: profit ? [dr('machinery', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('machinery', gap)] },
        ]
      : [
          { date: saleDate, lines: [dr('depreciation', last.amount), cr('provisionForDepreciation', last.amount)] },
          { date: saleDate, lines: [dr('assetDisposal', gone.cost), cr('machinery', gone.cost)] },
          { date: saleDate, lines: [dr('provisionForDepreciation', provided), cr('assetDisposal', provided)] },
          { date: saleDate, lines: [dr('bank', sold), cr('assetDisposal', sold)] },
          { date: saleDate, lines: profit ? [dr('assetDisposal', gap), cr('profitOnSaleOfAsset', gap)] : [dr('lossOnSaleOfAsset', gap), cr('assetDisposal', gap)] },
        ];
  // A machine bought in the month of the sale is entered after it.
  events.push({ i: 2, at: e - 0.5, entries: saleEntries, line: `${saleDate}: Sold ${gone.name} for ${inr(sold)}, received by cheque.` });
  for (let i = 0; i < years; i++) events.push({ i, at: 12, entries: [{ date: endOf(y, i), lines: [dr('depreciation', yearEnd(i)), cr(credit, yearEnd(i))] }] });
  events.sort((p, q) => p.i - q.i || p.at - q.at);
  const run = Array.from({ length: years }, (_, i) => events.filter((v) => v.i === i).flatMap((v) => v.entries));
  const details: Record<string, string[]> = {};
  for (let i = 0; i < years; i++) if (held(i).length > 1) details[endOf(y, i)] = held(i).map((m) => `${capital(m.name)} ${inr(chargeOf(m, i).amount)}`);
  const valueOf = (m: RunMachine, i: number) => valueAt(m, method, rate, i);
  const closings = Array.from({ length: years }, (_, i) =>
    to === 'asset' ? sumOf(held(i).map((m) => valueOf(m, i))) : -sumOf(held(i).map((m) => m.cost - valueOf(m, i))),
  );
  const soldAfter = bookValueAfter(method, gone.cost, rate, gone.months);
  const must: NonNullable<KeptRun['must']> = [
    ...Array.from({ length: years }, (_, i) => ({ year: i, side: 1 as const, label: DEP_AC, amount: yearEnd(i) })),
    { year: 2, side: 1, label: DEP_AC, amount: last.amount },
    ...(to === 'asset'
      ? [
          { year: 2, side: 1 as const, label: 'Bank A/c', amount: sold },
          { year: 2, side: (profit ? 0 : 1) as 0 | 1, label: profit ? 'Profit on Sale of Asset A/c' : 'Loss on Sale of Asset A/c', amount: Math.abs(sold - soldAfter) },
        ]
      : [{ year: 2, side: 0 as const, label: 'Asset Disposal A/c', amount: gone.cost - soldAfter }]),
  ];

  // The working, year by year.
  const explanation: string[] = [];
  let before = 0; // the balance at the start of the year (the provision, or the book value of the machines)
  for (let i = 0; i < years; i++) {
    const steps: string[] = [];
    const bought = machines.filter((m) => m.i === i);
    if (to === 'asset' && bought.length > 0) steps.push(`${bought.map((m) => `${capital(m.name)} is debited at its cost on ${dateIn(y + m.i, m.k)}: ${quote('To', 'Bank A/c', m.cost)}.`).join(' ')}`);
    if (i === 2) {
      const base = last.base === gone.cost ? `the cost of ${inr(gone.cost)}` : `the written down value of ${inr(last.base)}`;
      steps.push(`${capital(gone.name)}, from ${startOf(y, 2)} to ${saleDate}, is ${e} months of use: ${rate}% of ${base} x ${e}/12 = ${inr(last.amount)}, entered on the date of sale: ${quote('By', DEP_AC, last.amount)}.`);
      if (to === 'asset') {
        steps.push(
          `Book value of ${gone.name} on ${saleDate} = ${inr(gone.charges[1].close)} - ${inr(last.amount)} = ${inr(bv)}. The whole price is credited, as the data says: ${quote('By', 'Bank A/c', sold)}.`,
          profit
            ? `The price is ${inr(gap)} more than the book value, a profit, transferred out by a debit: ${quote('To', 'Profit on Sale of Asset A/c', gap)}. The two rows take ${inr(sold)} - ${inr(gap)} = ${inr(bv)}, the book value, out of the account.`
            : `The price is ${inr(gap)} less than the book value, a loss, transferred out by a credit: ${quote('By', 'Loss on Sale of Asset A/c', gap)}. The two credits take ${inr(sold)} + ${inr(gap)} = ${inr(bv)}, the book value, out of the account.`,
        );
      } else {
        steps.push(
          `All the depreciation provided on ${gone.name} up to the date of sale, ${gone.charges.map((c) => inr(c.amount)).join(' + ')} = ${inr(provided)}, is transferred to Asset Disposal A/c: ${quote('To', 'Asset Disposal A/c', provided)}. The price and the profit or loss go through Asset Disposal A/c, not through this account.`,
        );
      }
    }
    const h = held(i);
    steps.push(...h.map((m) => workIn(m, y, rate, i)));
    steps.push(
      h.length > 1
        ? `Depreciation at the year end = ${h.map((m) => inr(chargeOf(m, i).amount)).join(' + ')} = ${inr(yearEnd(i))}: ${quote('By', DEP_AC, yearEnd(i))}.`
        : `It is entered at the year end: ${quote('By', DEP_AC, yearEnd(i))}.`,
    );
    const close = Math.abs(closings[i]);
    steps.push(
      to === 'asset'
        ? h.length > 1
          ? `What is left is the book value of the machines in hand, ${h.map((m) => inr(valueOf(m, i))).join(' + ')} = ${inr(close)}: ${balancedAt(y, i, close, i === years - 1)}.`
          : `What is left is the book value of ${h[0].name}, ${inr(close)}: ${balancedAt(y, i, close, i === years - 1)}.`
        : `The provision on the machines in hand now stands at ${inr(close)}${i > 0 ? ` (${inr(before)} brought down, plus the depreciation of the year${i === 2 ? `, less ${inr(provided)} transferred` : ''})` : ''}, a credit balance: ${balancedAt(y, i, close, i === years - 1, true)}.`,
    );
    before = close;
    explanation.push(`${yearTitle(y, i)}: ${steps.join(' ')}`);
  }

  const lines = events.filter((v) => v.line !== undefined).map((v) => v.line!);
  const rule =
    to === 'asset'
      ? [
          `${firm} closes its books on 31 March every year. Depreciation is charged at ${rate}% a year ${HOW[method]}, for the period of use in whole months from the date of purchase to the date of sale, and is written off Machinery A/c itself: no provision account and no Asset Disposal A/c is kept.`,
          'A sale is shown in Machinery A/c in two steps: the whole price, received by cheque, is credited to Machinery A/c, and the profit or loss on the sale is then transferred from Machinery A/c to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.',
        ]
      : [
          `${firm} closes its books on 31 March every year. Machinery is kept at cost in Machinery A/c; depreciation, at ${rate}% a year ${method === 'slm' ? HOW.slm : 'by the written down value method (on cost less the depreciation provided so far)'}, for the period of use in whole months from the date of purchase to the date of sale, is credited to Provision for Depreciation A/c. A sale is recorded through Asset Disposal A/c, after depreciation up to the date of sale has been provided.`,
        ];
  const data = [...rule, ...lines, `${firm} had no other machinery.`].join('\n');
  const enter = 'Enter the depreciation on the machine sold, up to the date of sale, in a row of its own, and the depreciation at a year end on the machines then in hand as one figure.';
  return runAccount(
    { accountId: to === 'asset' ? 'machinery' : 'provisionForDepreciation', years: run, closings, must },
    y,
    to === 'asset'
      ? {
          task: `Prepare Machinery A/c of ${firm} for the three years ended ${end}. ${RUN_TASK} ${enter}`,
          data,
          title: 'Machinery A/c',
          distractors: ['Machinery A/c', 'Asset Disposal A/c', 'Provision for Depreciation A/c', profit ? 'Loss on Sale of Asset A/c' : 'Profit on Sale of Asset A/c', 'Cash A/c'],
          explanation,
          hints: [FORMAT_HINTS.sale[0], 'Take the machines one at a time in each year: the machine sold is depreciated up to its date of sale, the others up to 31 March, each for its own months of use.'],
        }
      : {
          task: `Prepare Provision for Depreciation A/c of ${firm} for the three years ended ${end}. ${RUN_TASK} ${enter}`,
          data,
          title: 'Provision for Depreciation A/c',
          distractors: ['Provision for Depreciation A/c', 'Machinery A/c', 'Bank A/c', profit ? 'Profit on Sale of Asset A/c' : 'Loss on Sale of Asset A/c', 'Profit and Loss A/c'],
          explanation,
          hints: [
            'The depreciation of every machine collects on the credit side, year after year. What happens to the part that belongs to the machine sold?',
            'Provide depreciation on the machine sold up to the date of sale; then take all that was provided on it out of the account by a debit, "To Asset Disposal A/c".',
          ],
        },
    { details },
  );
}

const fmtMachinesSale = accountTemplate({
  id: 'dep-fmt-machines-sale', topicId: T, conceptId: 'dep-formats', difficulty: 'complex',
  generate: (rng) => machinesSale(rng, 'asset'),
  verify: runHolds,
});

const fmtProvisionSale = accountTemplate({
  id: 'dep-fmt-provision-sale', topicId: T, conceptId: 'dep-formats', difficulty: 'complex',
  generate: (rng) => machinesSale(rng, 'provision'),
  verify: runHolds,
});

// ---- Dates other than the first of a month ---------------------------------------------------------------------
// The rest of the topic buys and sells on the first of a month. Board questions also use the 15th (half a month of use
// in that month) and, now and then, a count of days. Each prompt states its convention.

/** "15 October 2025": the 15th of month k (April 0) of the accounting year that starts on 1 April y. */
const midDate = (y: number, k: number): string => `15 ${MONTH_NAMES[k]} ${k >= 9 ? y + 1 : y}`;
const HALF_RULE = 'Depreciation is charged for the period of use, and a month in which the asset is bought or sold on the 15th counts as half a month.';
const H_ODD = {
  half: [
    'Count the whole months of use, then add half a month for the month in which the asset was bought or sold on the 15th.',
    'Depreciation = the charge of a full year x months of use / 12, and the months of use may end in a half.',
  ],
  days: [
    'Count the days from the date of purchase to 31 March, the day of purchase included: the rest of that month, then each later month in full.',
    'Depreciation = cost x rate x days / 365.',
  ],
  sale: [
    'Add up the months of use over the whole time the asset was held: half a month at each end and the full months between.',
    'Book value = cost - all the depreciation charged; then compare the price with the book value, never with the cost.',
  ],
};

const MONTH_RE = MONTH_NAMES.join('|');

const oddHalfMonth = numericTemplate({
  id: 'dep-odd-date-half-month', topicId: T, conceptId: 'dep-part-year', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const y = rng.int(2022, 2025);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(ASSETS);
    const item = rng.pick(a.items);
    const r = rng.pick([10, 15, 20]);
    const buying = rng.int(0, 1) === 0;
    // Bought on the 15th of May to February: the half month and the whole months after it. Sold on the 15th of May to
    // February: the whole months from April and the half month of the sale.
    const k = rng.int(1, 10);
    const half = buying ? 2 * (12 - k) - 1 : 2 * k + 1; // months of use, in half months
    const slm = buying || rng.int(0, 1) === 0;
    const base = cleanCost(rng, 100000, 600000, (c) => (c * r * half) % 2400 === 0);
    if (base === null) return null;
    const dep = (base * r * half) / 2400;
    const yearly = (base * r) / 100;
    const months = half / 2;
    const date = midDate(y, k);
    const what = slm ? `at ${r}% a year on cost by the straight line method` : `at ${r}% a year by the written down value method`;
    const prompt = buying
      ? `${firm} bought ${item} for ${inr(base)} on ${date}. It depreciates ${a.name.toLowerCase()} ${what}, and its year ends on 31 March. ${HALF_RULE} What is the depreciation for the year ending 31 March ${y + 1}?`
      : `${slm ? `${firm} had ${item} that cost ${inr(base)} some years ago.` : `On 1 April ${y} ${item} of ${firm} stood in the books at ${inr(base)}.`} It was sold on ${date}. The firm depreciates ${a.name.toLowerCase()} ${what}, and its year ends on 31 March. ${HALF_RULE} What is the depreciation for the year of sale, up to the date of sale?`;
    const errs: [number, string][] = buying
      ? [
          [whole((yearly * (12 - k)) / 12), 'Counted the month of purchase as a whole month, though the asset was bought half-way through it.'],
          [whole((yearly * (11 - k)) / 12), 'Left out the half month in which the asset was bought.'],
          [yearly, 'Charged a full year, though the asset was bought during the year.'],
          [whole((yearly * (k + 0.5)) / 12), 'Counted the months before the purchase instead of the months after it.'],
        ]
      : [
          [whole((yearly * (k + 1)) / 12), 'Counted the month of sale as a whole month, though the asset was sold half-way through it.'],
          [whole((yearly * k) / 12), 'Left out the half month of the sale.'],
          [yearly, 'Charged a full year, though the asset was sold during the year.'],
          [whole((yearly * (11.5 - k)) / 12), 'Counted the months after the sale instead of the months up to it.'],
        ];
    const n = numeric(dep, errs);
    if (n === null) return null;
    return {
      prompt,
      ...n,
      explanation: [
        buying
          ? `From ${date} to 31 March: half of ${MONTH_NAMES[k]} and ${11 - k} whole month${11 - k === 1 ? '' : 's'} after it = ${months} months of use.`
          : `From 1 April to ${date}: ${k} whole month${k === 1 ? '' : 's'} and half of ${MONTH_NAMES[k]} = ${months} months of use.`,
        `Depreciation for a full year = ${r}% of ${inr(base)} = ${inr(yearly)}.`,
        `Depreciation = ${inr(yearly)} x ${months}/12 = ${inr(dep)}.`,
      ],
      hints: H_ODD.half,
    };
  },
  verify: (q) => {
    const [base] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const m = new RegExp(`15 (${MONTH_RE}) 20\\d\\d`).exec(q.prompt);
    if (!m) return false;
    const k = MONTH_NAMES.indexOf(m[1]);
    const months = q.prompt.includes('for the year of sale') ? k + 0.5 : 12 - k - 0.5;
    return q.answer === Math.round(base * r * months * 100 / 1200);
  },
});

/** Days from `day month year` to 31 March after it, both days counted. */
function daysTo31March(day: number, month: number, year: number, endYear: number): number {
  return Math.round((Date.UTC(endYear, 2, 31) - Date.UTC(year, month, day)) / 86400000) + 1;
}
const CAL_INDEX = (name: string): number => CALENDAR.indexOf(name);

const oddDays = numericTemplate({
  id: 'dep-odd-date-days', topicId: T, conceptId: 'dep-part-year', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    // Years whose February has 28 days, so that the count is the one every student gets.
    const y = rng.pick([2022, 2024, 2025]);
    const firm = rng.pick(FIRMS);
    const a = rng.pick(ASSETS);
    const item = rng.pick(a.items);
    const r = rng.pick([10, 15, 20]);
    const k = rng.int(1, 10);
    const day = rng.pick([5, 8, 10, 12, 18, 20, 22, 24, 27]);
    const name = MONTH_NAMES[k];
    const year = k >= 9 ? y + 1 : y;
    const days = daysTo31March(day, CAL_INDEX(name), year, y + 1);
    const units = rng.int(4, 16); // the cost is a whole number of ₹36,500s, so the charge by days is in whole rupees
    const cost = 36500 * units;
    const dep = units * r * days;
    const yearly = (cost * r) / 100;
    const n = numeric(dep, [
      [units * r * (days - 1), 'Left out the day of purchase when counting the days.'],
      [yearly, 'Charged a full year, though the asset was bought during the year.'],
      [whole((yearly * (12 - k)) / 12), 'Counted whole months, taking the month of purchase as a full month, instead of the days.'],
      [whole((cost * r * days) / 36000), 'Took a year of 360 days instead of 365.'],
    ]);
    if (n === null) return null;
    return {
      prompt: `${firm} bought ${item} for ${inr(cost)} on ${day} ${name} ${year} and depreciates ${a.name.toLowerCase()} at ${r}% a year on cost. Its year ends on 31 March. For the year of purchase, depreciation is charged by days: from the date of purchase to 31 March, both days counted, out of a year of 365 days. What is the depreciation for the year ending 31 March ${y + 1}?`,
      ...n,
      explanation: [
        `Days of use: from ${day} ${name} to 31 March, both days counted = ${days} days.`,
        `Depreciation for a full year = ${r}% of ${inr(cost)} = ${inr(yearly)}.`,
        `Depreciation = ${inr(yearly)} x ${days}/365 = ${inr(dep)}.`,
      ],
      hints: H_ODD.days,
    };
  },
  verify: (q) => {
    const m = new RegExp(`on (\\d+) (${MONTH_RE}) (20\\d\\d)`).exec(q.prompt);
    const end = intIn(q.prompt, /ending 31 March (20\d\d)/);
    if (!m) return false;
    const cost = amountsIn(q.prompt)[0];
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const days = (Date.UTC(end, 2, 31) - Date.UTC(Number(m[3]), CALENDAR.indexOf(m[2]), Number(m[1]))) / 86400000 + 1;
    return q.answer === Math.round((cost * r * days * 100) / 36500);
  },
});

const oddSale = mcqTemplate({
  id: 'dep-odd-date-sale', topicId: T, conceptId: 'dep-sale', difficulty: 'complex',
  generate: (rng) => {
    const y = rng.int(2021, 2023);
    const firm = rng.pick(FIRMS);
    const item = rng.pick(MACHINES);
    const r = rng.pick([10, 15, 20]);
    const k = rng.int(1, 10); // bought on the 15th, May to February, of the first year
    const e = rng.int(1, 10); // sold on the 15th, May to February, of the third year
    const months = 12 - k - 0.5 + 12 + e + 0.5;
    const cost = cleanCost(rng, 100000, 600000, (c) => (c * r * months) % 1200 === 0 && (c * r) % 2400 === 0);
    if (cost === null) return null;
    const dep = (cost * r * months) / 1200;
    const bv = cost - dep;
    const sold = sellingPrice(rng, bv, cost, rng.int(0, 1) === 0);
    if (sold === null) return null;
    const oneMonth = (cost * r) / 1200;
    const bought = midDate(y, k);
    const saleOn = midDate(y + 2, e);
    return choice(
      `${firm} bought ${item} on ${bought} for ${inr(cost)} and sold it on ${saleOn} for ${inr(sold)}, received by cheque. Depreciation is charged at ${r}% a year on cost by the straight line method, and the year ends on 31 March. ${HALF_RULE} What is the profit or loss on the sale?`,
      profitOrLoss(sold - bv),
      [
        [profitOrLoss(bv - sold), 'Read the result the wrong way round: compare the price with the book value on the date of sale.'],
        [profitOrLoss(sold - cost), 'Compared the price with the original cost instead of the book value.'],
        [profitOrLoss(sold - (bv - oneMonth)), 'Counted the month of purchase and the month of sale as whole months, so took one month of depreciation too many.'],
        [profitOrLoss(sold - (bv + oneMonth)), 'Left out the half months of purchase and of sale, so took one month of depreciation too few.'],
        [profitOrLoss(sold - (cost - (cost * r * 3) / 100)), 'Charged three full years of depreciation, ignoring the dates of purchase and sale.'],
      ],
      `Months of use: ${12 - k - 0.5} in the year of purchase (from ${bought}), 12 in the next year and ${e + 0.5} in the year of sale (to ${saleOn}) = ${months} months. Depreciation = ${r}% of ${inr(cost)} x ${months}/12 = ${inr(dep)}. Book value on the date of sale = ${inr(cost)} - ${inr(dep)} = ${inr(bv)}. ${sold > bv ? `Profit = ${inr(sold)} - ${inr(bv)} = ${inr(sold - bv)}.` : `Loss = ${inr(bv)} - ${inr(sold)} = ${inr(bv - sold)}.`}`,
      H_ODD.sale,
    );
  },
  verify: (q) => {
    const [cost, sold] = amountsIn(q.prompt);
    const r = intIn(q.prompt, /at (\d+)% a year/);
    const dates = [...q.prompt.matchAll(new RegExp(`15 (${MONTH_RE}) (20\\d\\d)`, 'g'))].map((m) => ({ k: MONTH_NAMES.indexOf(m[1]), y: Number(m[2]) - (MONTH_NAMES.indexOf(m[1]) >= 9 ? 1 : 0) }));
    if (dates.length !== 2) return false;
    // Months from the 15th of one month to the 15th of another are a whole number: the year-months between them.
    const months = (dates[1].y - dates[0].y) * 12 + dates[1].k - dates[0].k;
    const bv = cost - (cost * r * months) / 1200;
    return optionText(q) === profitOrLoss(sold - bv);
  },
});

// ---- A set: two machines bought in one year, one sold in a later year ------------------------------------------

interface KeptMachinesSet {
  method: 'slm' | 'wdv';
  rate: number;
  costs: [number, number];
  months: [number[], number[]];
  sold: 0 | 1;
  price: number;
}
const keptMachinesSets = keepFor<KeptMachinesSet>();
const textsKey = (texts: string[]): string => texts.join('\n');

const setMachinesSale = journalSetTemplate({
  id: 'dep-set-machines-sale', topicId: T, conceptId: 'dep-sets', difficulty: 'complex',
  generate: (rng) => {
    const y = rng.int(2020, 2023);
    const firm = rng.pick(FIRMS);
    const method = rng.pick(['slm', 'wdv'] as const);
    const rate = rng.pick(method === 'slm' ? [10, 15, 20] : [10, 20]);
    const n = rng.pick([1, 2]); // the sale is in the year n years after the first
    const kA = rng.pick([0, 0, 3]);
    const kB = rng.pick([4, 6, 7, 9]);
    const e = rng.int(2, 10);
    const soldFirst = rng.int(0, 1) === 0;
    const profit = rng.int(0, 1) === 0;
    const [itemA, itemB] = rng.shuffle(MACHINES);
    const mA = [12 - kA, ...twelves(n - 1), soldFirst ? e : 12];
    const mB = [12 - kB, ...twelves(n - 1), soldFirst ? 12 : e];
    const A = runMachine(rng, method, rate, 'machine 1', itemA, 0, kA, mA, 200000, 600000);
    const B = runMachine(rng, method, rate, 'machine 2', itemB, 0, kB, mB, 150000, 500000);
    if (A === null || B === null || A.cost === B.cost) return null;
    const gone = soldFirst ? A : B;
    const kept = soldFirst ? B : A;
    const last = gone.charges[n];
    const bv = last.close;
    const sold = sellingPrice(rng, bv, gone.cost, profit);
    if (sold === null) return null;
    const gap = Math.abs(sold - bv);
    const saleDate = dateIn(y + n, e);
    const machinery = acct('machinery');
    const buy = (m: RunMachine): SetTransaction => ({
      date: dateIn(y, m.k),
      text: `Bought ${m.name} (${m.item}) for ${inr(m.cost)} and paid by cheque.`,
      lines: [dr('machinery', m.cost), cr('bank', m.cost)],
      explanation: [`A machine bought for use is an asset: ${machinery} is debited with ${inr(m.cost)}.`, 'It is paid by cheque: Bank A/c is credited.'],
    });
    const bothYears: SetTransaction[] = Array.from({ length: n }, (_, i) => {
      const a = A.charges[i];
      const b = B.charges[i];
      const period = (m: RunMachine) => (m.charges[i].months === 12 ? `the year ended ${endOf(y, i)}` : `From ${dateIn(y, m.k)} to ${endOf(y, i)}`);
      return {
        date: endOf(y, i),
        text: `Charged depreciation on both machines for the year ended ${endOf(y, i)}.`,
        lines: [dr('depreciation', a.amount + b.amount), cr('machinery', a.amount + b.amount)],
        explanation: [
          `Machine 1: ${chargeWorking(rate, A.cost, a, period(A))}`,
          `Machine 2: ${chargeWorking(rate, B.cost, b, period(B))}`,
          `Depreciation A/c is debited with ${inr(a.amount)} + ${inr(b.amount)} = ${inr(a.amount + b.amount)}, and ${machinery} is credited with it, as no provision account is kept.`,
        ],
      };
    });
    const keptLast = kept.charges[n];
    const transactions: SetTransaction[] = [
      buy(A),
      buy(B),
      ...bothYears,
      {
        date: saleDate,
        text: `Charged depreciation on ${gone.name}, sold on this date, for the current year up to this date.`,
        lines: [dr('depreciation', last.amount), cr('machinery', last.amount)],
        explanation: [
          `${capital(gone.name)}: ${chargeWorking(rate, gone.cost, last, `From ${startOf(y, n)} to ${saleDate}`)}`,
          `Depreciation A/c is debited and ${machinery} credited; ${gone.name} now stands at ${inr(bv)}.`,
        ],
      },
      {
        date: saleDate,
        text: `Sold ${gone.name} for ${inr(sold)} and received a cheque for the price.`,
        lines: profit ? [dr('bank', sold), cr('machinery', bv), cr('profitOnSaleOfAsset', gap)] : [dr('bank', sold), dr('lossOnSaleOfAsset', gap), cr('machinery', bv)],
        explanation: [
          `The money goes into the bank: Bank A/c is debited with ${inr(sold)}.`,
          `${capital(gone.name)} leaves the books at its book value on this date, ${inr(gone.cost)} - ${gone.charges.map((c) => inr(c.amount)).join(' - ')} = ${inr(bv)}: ${machinery} is credited with it.`,
          profit
            ? `The price is ${inr(gap)} more than the book value: Profit on Sale of Asset A/c is credited.`
            : `The price is ${inr(gap)} less than the book value: Loss on Sale of Asset A/c is debited.`,
        ],
      },
      {
        date: endOf(y, n),
        text: `Charged depreciation on ${kept.name}, still in use, for the year ended ${endOf(y, n)}.`,
        lines: [dr('depreciation', keptLast.amount), cr('machinery', keptLast.amount)],
        explanation: [
          `${capital(kept.name)}: ${chargeWorking(rate, kept.cost, keptLast, `the year ended ${endOf(y, n)}`)}`,
          `${capital(gone.name)} is no longer in the books, so this charge is on ${kept.name} alone.`,
        ],
      },
    ];
    keptMachinesSets.keep(textsKey(transactions.map((t) => t.text)), { method, rate, costs: [A.cost, B.cost], months: [mA, mB], sold: soldFirst ? 0 : 1, price: sold });
    const how = method === 'slm' ? 'on cost by the straight line method' : 'by the written down value method';
    return {
      opening: `${firm} bought two machines in the year that began on 1 April ${y} and sold one of them later. The accounting year ends on 31 March. Depreciation is charged at ${rate}% a year ${how}, for the period of use in whole months from the date of purchase to the date of sale, and is written off ${machinery} itself: no provision account and no Asset Disposal A/c is kept. A sale is recorded in one entry, with its profit or loss taken to Profit on Sale of Asset A/c or Loss on Sale of Asset A/c.`,
      transactions,
      hints: [
        'Keep a small schedule for each machine: its cost, its months of use in each year and its book value at each 31 March.',
        'In the year of sale, depreciate the machine sold up to the date of sale and the other machine to 31 March; then compare the price with the book value of the machine sold.',
      ],
      distractorAccounts: ['assetDisposal', 'provisionForDepreciation', profit ? 'lossOnSaleOfAsset' : 'profitOnSaleOfAsset', 'profitAndLoss'],
    };
  },
  verify: (q) => {
    if (!setHolds()(q)) return false;
    const k = keptMachinesSets.of(textsKey(q.entries.map((e) => e.text)));
    if (!k) return false;
    const ledger = post(q.entries.map((e) => e.expected));
    const other = k.sold === 0 ? 1 : 0;
    const left = bookValueAfter(k.method, k.costs[other], k.rate, k.months[other]);
    const goneValue = bookValueAfter(k.method, k.costs[k.sold], k.rate, k.months[k.sold]);
    // A loss is a debit balance and a profit a credit one: together they are the book value of the machine sold less its price.
    const result = (ledger.get('lossOnSaleOfAsset') ?? 0) + (ledger.get('profitOnSaleOfAsset') ?? 0);
    return ledger.get('machinery') === rupees(left) && result === rupees(goneValue - k.price) && (ledger.get('bank') ?? 0) === rupees(k.price - k.costs[0] - k.costs[1]);
  },
});

const added: Template[] = [fmtMachinesSale, fmtProvisionSale, oddHalfMonth, oddDays, oddSale, setMachinesSale];

const withAssertionReason: Template[] = [...all, assertionReason, ...added];

export default withAssertionReason;
