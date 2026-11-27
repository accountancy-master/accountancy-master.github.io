import type { McqQuestion, StatementQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, formatINR, keepFor, mcqTemplate, numericTemplate, rupees, statementTemplate } from '../authoring';
import type { FormatRowParts, McqParts, NumericParts, StatementLineParts, Template } from '../types';

const T = 'goodwill';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - the accounting year ends on 31 March; a year is named "2024-25";
//  - goodwill by the average profit method = average (normal) profit x number of years' purchase;
//  - super profit = average profit - normal profit, and normal profit = capital employed x normal rate / 100;
//  - capital employed = assets used in the business (not goodwill, fictitious assets or non-trade investments) less
//    outside liabilities, which is the partners' capitals and reserves less those same three items;
//  - capitalisation of average profit: goodwill = average profit x 100 / normal rate - capital employed;
//    capitalisation of super profit: goodwill = super profit x 100 / normal rate;
//  - closing stock overvalued in a year overstates that year's profit and understates the next year's by as much;
//  - the super profit is never nil or negative, and never more than one and a half times the normal profit (superLimit);
//  - where non-trade investments are left out of capital employed beside a profit figure, the question says whether
//    their income is in that profit (and it is then taken out);
//  - every figure is worked in whole rupees; a combination that would leave paise is avoided or rejected (null).
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));

const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
const numIn = (s: string, re: RegExp): number => Number(re.exec(s)?.[1]);
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

/** Partners by surname: a firm is "Mehra & Kapoor"; the third name is for a firm of three. */
const SURNAMES: [string, string, string][] = [
  ['Mehra', 'Kapoor', 'Sethi'],
  ['Iyer', 'Nair', 'Menon'],
  ['Desai', 'Patel', 'Shah'],
  ['Bose', 'Sen', 'Ghosh'],
  ['Reddy', 'Naidu', 'Rao'],
  ['Gill', 'Sandhu', 'Brar'],
  ['Joshi', 'Kulkarni', 'Patil'],
  ['Khan', 'Siddiqui', 'Ansari'],
  ['Agarwal', 'Jain', 'Goyal'],
  ['Das', 'Mohanty', 'Sahoo'],
];
const TRADES = [
  'runs a sweet shop in Indore',
  'is a textile wholesaler in Surat',
  'runs a coaching institute in Kota',
  'runs a bakery in Pune',
  'runs a pharmacy in Lucknow',
  'runs a printing press in Sivakasi',
  'runs a furniture showroom in Jodhpur',
  'trades in spices in Kochi',
  'makes sports goods in Jalandhar',
  'runs a handloom store in Varanasi',
];
interface Firm {
  name: string;
  a: string;
  b: string;
  c: string;
  trade: string;
}
function firm(rng: Rng): Firm {
  const [a, b, c] = rng.pick(SURNAMES);
  return { name: `${a} & ${b}`, a, b, c, trade: rng.pick(TRADES) };
}
/** "Mehra & Kapoor is a partnership firm that runs a bakery in Pune." */
const intro = (f: Firm): string => `${f.name} is a partnership firm that ${f.trade}.`;

/** The accounting year that ends on 31 March `end`, as it is named: "2024-25". */
const fy = (end: number): string => `${end - 1}-${String(end % 100).padStart(2, '0')}`;
/** The last `k` accounting years, oldest first, by the year in which each ends. */
function lastYears(rng: Rng, k: number): number[] {
  const end = rng.pick([2024, 2025, 2026]);
  return Array.from({ length: k }, (_, i) => end - k + 1 + i);
}
const result = (p: number): string => (p < 0 ? `Loss ${inr(-p)}` : inr(p));
/** One year to a line: "2024-25: ₹1,20,000" or "2024-25: Loss ₹20,000". */
const yearRows = (ys: number[], ps: number[]): string => ys.map((y, i) => `${fy(y)}: ${result(ps[i])}`).join('\n');
const ROW_RE = /^\d{4}-\d{2}: (Loss )?₹([\d,]+)/gm;
/** The yearly results a prompt lists, a loss as a negative figure. */
const rowsIn = (prompt: string): number[] => [...prompt.matchAll(ROW_RE)].map((m) => (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')));
/** "Label: ₹amount" lines of a prompt, by label. */
const labelled = (prompt: string): Map<string, number> =>
  new Map([...prompt.matchAll(/^(.+?): ₹([\d,]+)$/gm)].map((m): [string, number] => [m[1], Number(m[2].replace(/,/g, ''))]));
const rows = (pairs: readonly (readonly [string, number])[]): string => pairs.map(([label, n]) => `${label}: ${inr(n)}`).join('\n');
const purchaseIn = (s: string): number => numIn(s, /(\d+(?:\.\d+)?) years' purchase/);
const rateIn = (s: string): number => numIn(s, /(\d+(?:\.\d+)?)%/);
/** "₹1,20,000 + ₹90,000 - ₹20,000": the results of the years, a loss deducted. */
const sumText = (ps: number[]): string => ps.map((p, i) => (p < 0 ? `- ${inr(-p)}` : i === 0 ? inr(p) : `+ ${inr(p)}`)).join(' ');

/** Raises one figure so that the total divides evenly by `modulus` (a total that is already positive). */
function settle(ps: number[], modulus: number, at: number, extra = 0): void {
  ps[at] += (modulus - ((sum(ps) + extra) % modulus)) % modulus;
}

/**
 * A numeric question's answer and errors, in the unit's scale (100 for rupees, 1 for a number, a percentage or
 * "times" given in hundredths). A figure that is not whole in its unit is dropped; null when the answer is not whole
 * or fewer than two distinct errors remain.
 */
function numeric(answer: number, errs: [number, string][], scale = 100): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  const exact = (v: number): number => (Number.isFinite(v) && near(v, Math.round(v)) ? Math.round(v) * scale : 0);
  const a = exact(answer);
  if (!(a > 0)) return null;
  const seen = new Set([a]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    const p = exact(v);
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

const H = {
  avg: ['Average profit = total of the profits / number of years (a loss is deducted).', "Goodwill = average profit x number of years' purchase."],
  weighted: ['Multiply each profit by its weight, add the products and divide by the total of the weights.', 'The latest year carries the highest weight.'],
  adjust: [
    'Bring every year to its normal profit first: add back an abnormal loss, take out an abnormal gain.',
    'Closing stock that is wrongly valued changes two years: its own, and the next year in the opposite direction.',
  ],
  superP: ['Normal profit = capital employed x normal rate of return / 100.', 'Super profit = average profit - normal profit.'],
  capEmp: ['Capital employed = assets used in the business - outside liabilities.', 'Goodwill, fictitious assets and non-trade investments are left out.'],
  capital: ['Capitalised value of the business = average profit x 100 / normal rate of return.', 'Goodwill = capitalised value - capital employed; or super profit x 100 / normal rate of return.'],
  nature: ['Goodwill is the value of a reputation: it cannot be seen, but a buyer pays for it.', 'Only goodwill that has been paid for is recorded in the books (AS 26).'],
};

const RATES = [8, 10, 12, 15, 18, 20];

/**
 * The largest super profit a question gives a firm whose normal profit is `normal`: one and a half times the normal
 * profit, to the step below, and never more than `cap`. A firm that earns many times the normal return of its trade
 * is not one a student meets in a textbook or a board paper.
 */
const superLimit = (normal: number, cap: number, step: number): number => Math.min(cap, Math.floor((normal * 1.5) / step) * step);

// ===============================================================================================================
// EASY
// ===============================================================================================================

const avgProfit = numericTemplate({
  id: 'gw-avg-profit', topicId: T, conceptId: 'gw-average-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4, 5]);
    const ys = lastYears(rng, k);
    const p = Array.from({ length: k }, () => rng.step(40000, 300000, 5000));
    const lossAt = rng.int(0, 2) === 0 ? rng.int(0, k - 1) : -1;
    if (lossAt >= 0) p[lossAt] = -rng.step(10000, 60000, 5000);
    settle(p, k * 5000, lossAt === 0 ? 1 : 0);
    const total = sum(p);
    const avg = total / k;
    const loss = lossAt >= 0 ? -p[lossAt] : 0;
    const n = numeric(
      avg,
      lossAt >= 0
        ? [
            [total, 'Added up the results of the years but did not divide by the number of years.'],
            [(total + 2 * loss) / k, 'Added the loss as if it were a profit; a loss is deducted from the total.'],
            [(total + loss) / (k - 1), 'Left the year of loss out and averaged only the years of profit.'],
            [(total + loss) / k, 'Ignored the loss but still divided by all the years.'],
          ]
        : [
            [total, 'Added up the profits but did not divide by the number of years.'],
            [p[k - 1], 'Gave the profit of the latest year, not the average of all the years.'],
          ],
    );
    const lead = rng.pick([
      `${intro(f)} Its accounting year ends on 31 March. The results of the last ${WORDS[k]} years were:`,
      `The Profit and Loss Accounts of ${f.name} for the last ${WORDS[k]} years, each ended 31 March, showed:`,
      `${f.name} wants the average of its results for the last ${WORDS[k]} accounting years (each ended 31 March):`,
    ]);
    return n && {
      prompt: `${lead}\n${yearRows(ys, p)}\nFind the average profit of these ${WORDS[k]} years.`,
      ...n,
      explanation: [
        `Total = ${sumText(p)} = ${inr(total)}${lossAt >= 0 ? ' (the loss is deducted)' : ''}.`,
        `Average profit = ${inr(total)} / ${k} = ${inr(avg)}.`,
      ],
      hints: H.avg,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    return r.length >= 3 && near(q.answer / 100, sum(r) / r.length);
  },
});

const avgGoodwill = numericTemplate({
  id: 'gw-avg-goodwill', topicId: T, conceptId: 'gw-average-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const n = rng.pick([2, 3, 4, 1.5, 2.5].filter((x) => x !== k));
    const ys = lastYears(rng, k);
    const p = Array.from({ length: k }, () => rng.step(50000, 320000, 10000));
    settle(p, k * 10000, rng.int(0, k - 1));
    const total = sum(p);
    const avg = total / k;
    const num = numeric(avg * n, [
      [avg, "Stopped at the average profit and did not multiply by the number of years' purchase."],
      [total * n, 'Multiplied the total profit of all the years, not the average profit.'],
      [avg * k, `Multiplied by ${k}, the number of years averaged, instead of by ${n}, the number of years' purchase.`],
      [total, 'Gave the total profit of the years as the goodwill.'],
    ]);
    const lead = rng.pick([
      `${f.name} values its goodwill at ${n} years' purchase of the average profit of the last ${WORDS[k]} years. The profits (years ended 31 March) were:`,
      `The partners of ${f.name} agree that the goodwill of the firm is ${n} years' purchase of the average profit of the last ${WORDS[k]} years, which were:`,
      `${intro(f)} Its goodwill is to be taken at ${n} years' purchase of the average profit of the past ${WORDS[k]} years:`,
    ]);
    return num && {
      prompt: `${lead}\n${yearRows(ys, p)}\nFind the value of the goodwill.`,
      ...num,
      explanation: [
        `Total profit = ${sumText(p)} = ${inr(total)}.`,
        `Average profit = ${inr(total)} / ${k} = ${inr(avg)}.`,
        `Goodwill = ${inr(avg)} x ${n} = ${inr(avg * n)}.`,
      ],
      hints: H.avg,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    return near(q.answer / 100, (sum(r) / r.length) * purchaseIn(q.prompt));
  },
});

const purchaseBasic = numericTemplate({
  id: 'gw-purchase-basic', topicId: T, conceptId: 'gw-average-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const n = rng.pick([1.5, 2, 2.5, 3, 4, 5]);
    const avg = rng.step(60000, 600000, 30000);
    const g = avg * n;
    if (rng.int(0, 1) === 0) {
      const num = numeric(g, [
        [avg, "Gave the average profit itself; goodwill is that profit multiplied by the number of years' purchase."],
        [avg / n, "Divided the average profit by the number of years' purchase instead of multiplying."],
      ]);
      const prompt = rng.pick([
        `The average profit of ${f.name} is ${inr(avg)} a year. Goodwill is valued at ${n} years' purchase of the average profit. What is the goodwill of the firm?`,
        `${intro(f)} It earns an average profit of ${inr(avg)} a year, and its goodwill is agreed at ${n} years' purchase of that profit. Find the goodwill.`,
      ]);
      return num && { prompt, ...num, explanation: ["Goodwill = Average profit x Number of years' purchase.", `${inr(avg)} x ${n} = ${inr(g)}.`], hints: H.avg };
    }
    const num = numeric(avg, [
      [g * n, "Multiplied the goodwill by the number of years' purchase instead of dividing by it."],
      [g, 'Gave the goodwill itself; the average profit is the goodwill divided by the number of years of purchase.'],
    ]);
    const prompt = rng.pick([
      `The goodwill of ${f.name} has been valued at ${inr(g)}, which is ${n} years' purchase of its average profit. What is the average profit of the firm?`,
      `${intro(f)} Its goodwill, taken at ${n} years' purchase of the average profit, comes to ${inr(g)}. Find the average profit.`,
    ]);
    return num && { prompt, ...num, explanation: ["Goodwill = Average profit x Number of years' purchase, so Average profit = Goodwill / Number of years' purchase.", `${inr(g)} / ${n} = ${inr(avg)}.`], hints: H.avg };
  },
  verify: (q) => {
    const [x] = amountsIn(q.prompt);
    const n = purchaseIn(q.prompt);
    return /average profit( of the firm)?[.?]$/.test(q.prompt) ? near(q.answer / 100, x / n) : near(q.answer / 100, x * n);
  },
});

const normalProfit = numericTemplate({
  id: 'gw-normal-profit', topicId: T, conceptId: 'gw-capital-employed', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick(RATES);
    const c = rng.step(300000, 2400000, 50000);
    const normal = (c * r) / 100;
    if (rng.int(0, 1) === 0) {
      const extra = rng.step(10000, superLimit(normal, 150000, 5000), 5000);
      if (extra === normal) return null;
      const avg = normal + extra;
      const num = numeric(normal, [
        [extra, 'Gave the super profit (average profit less normal profit); only the normal profit was asked.'],
        [(avg * r) / 100, 'Applied the normal rate to the average profit instead of to the capital employed.'],
        [avg, 'Gave the average profit the firm actually earns, not the profit that is normal for its capital.'],
      ]);
      return num && {
        prompt: `${intro(f)} Its capital employed is ${inr(c)} and it earns an average profit of ${inr(avg)} a year. The normal rate of return in this trade is ${r}%. What is the normal profit of the firm?`,
        ...num,
        explanation: ['Normal profit = Capital employed x Normal rate of return / 100.', `${inr(c)} x ${r} / 100 = ${inr(normal)}.`, 'The average profit is not needed for the normal profit.'],
        hints: H.superP,
      };
    }
    const y = rng.step(50000, 400000, 10000);
    const x = c + y;
    const num = numeric(normal, [
      [(x * r) / 100, 'Took the normal rate on the total assets without deducting the outside liabilities.'],
      [c, 'Stopped at the capital employed and did not apply the normal rate of return.'],
      [((x + y) * r) / 100, 'Added the outside liabilities to the assets instead of deducting them.'],
    ]);
    return num && {
      prompt: `The assets of ${f.name}, all of them used in the business, total ${inr(x)}, and its outside liabilities are ${inr(y)}. Firms in this trade normally earn ${r}% on capital employed. What is the normal profit of the firm?`,
      ...num,
      explanation: [`Capital employed = ${inr(x)} - ${inr(y)} = ${inr(c)}.`, `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`],
      hints: H.superP,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const r = rateIn(q.prompt);
    const c = q.prompt.includes('outside liabilities') ? a[0] - a[1] : a[0];
    return near(q.answer / 100, (c * r) / 100);
  },
});

const superProfit = numericTemplate({
  id: 'gw-super-profit', topicId: T, conceptId: 'gw-super-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick(RATES);
    const c = rng.step(300000, 2400000, 50000);
    const normal = (c * r) / 100;
    const sp = rng.step(10000, superLimit(normal, 180000, 5000), 5000);
    if (sp === normal) return null;
    const avg = normal + sp;
    const num = numeric(sp, [
      [normal, 'Gave the normal profit; the super profit is what the firm earns above it.'],
      [avg + normal, 'Added the normal profit to the average profit instead of deducting it.'],
      [avg - (avg * r) / 100, 'Took the normal rate on the average profit instead of on the capital employed.'],
    ]);
    const prompt = rng.pick([
      `${intro(f)} Its average profit is ${inr(avg)} a year on a capital employed of ${inr(c)}. The normal rate of return in this trade is ${r}%. Find the super profit.`,
      `${f.name} earns an average profit of ${inr(avg)} a year. Its capital employed is ${inr(c)}, and similar firms earn ${r}% on capital employed. What is the super profit of the firm?`,
      `Firms in the trade of ${f.name} normally earn ${r}% on capital employed. ${f.name} has a capital employed of ${inr(c)} and an average profit of ${inr(avg)} a year. By how much does its average profit exceed the normal profit?`,
    ]);
    return num && {
      prompt,
      ...num,
      explanation: [`Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`, `Super profit = Average profit - Normal profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`],
      hints: H.superP,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const [avg, c] = [Math.min(...a), Math.max(...a)];
    return near(q.answer / 100, avg - (c * rateIn(q.prompt)) / 100);
  },
});

const superGoodwillBasic = numericTemplate({
  id: 'gw-super-goodwill-basic', topicId: T, conceptId: 'gw-super-profit', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const n = rng.pick([2, 3, 4, 5]);
    const normal = rng.step(40000, 300000, 10000);
    const sp = rng.step(10000, superLimit(normal, 150000, 5000), 5000);
    if (sp === normal) return null;
    const avg = normal + sp;
    const num = numeric(sp * n, [
      [avg * n, 'Multiplied the whole average profit; under this method only the super profit is multiplied.'],
      [sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
      [normal * n, 'Multiplied the normal profit instead of the super profit.'],
    ]);
    const prompt = rng.pick([
      `${f.name} earns an average profit of ${inr(avg)} a year; the normal profit for a firm of its size is ${inr(normal)}. Goodwill is valued at ${n} years' purchase of the super profit. Find the goodwill.`,
      `${intro(f)} Its average profit is ${inr(avg)} and its normal profit is ${inr(normal)}. What is its goodwill at ${n} years' purchase of the super profit?`,
    ]);
    return num && {
      prompt,
      ...num,
      explanation: [`Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`, `Goodwill = ${inr(sp)} x ${n} = ${inr(sp * n)}.`],
      hints: H.superP,
    };
  },
  verify: (q) => {
    const [avg, normal] = amountsIn(q.prompt);
    return near(q.answer / 100, (avg - normal) * purchaseIn(q.prompt));
  },
});

const capSuperBasic = numericTemplate({
  id: 'gw-cap-super-basic', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([8, 10, 12, 15, 20, 25]);
    const g = rng.step(100000, 900000, 10000);
    const sp = (g * r) / 100;
    if (rng.int(0, 1) === 0) {
      const num = numeric(g, [
        [(sp * r) / 100, `Took ${r}% of the super profit; to capitalise, the super profit is divided by the rate, that is multiplied by 100 / ${r}.`],
        [sp, 'Gave the super profit itself; it has to be capitalised at the normal rate of return.'],
        [sp / r, 'Divided the super profit by the rate but did not multiply by 100.'],
      ]);
      return num && {
        prompt: `The super profit of ${f.name} is ${inr(sp)} a year and the normal rate of return is ${r}%. Find the goodwill by capitalisation of super profit.`,
        ...num,
        explanation: ['Goodwill = Super profit x 100 / Normal rate of return.', `${inr(sp)} x 100 / ${r} = ${inr(g)}.`],
        hints: H.capital,
      };
    }
    // Goodwill by capitalisation is at most one and a half times the capital employed (super profit against normal profit).
    const c = rng.step(Math.max(300000, Math.ceil(g / 1.5 / 50000) * 50000), 1500000, 50000);
    const normal = (c * r) / 100;
    const avg = normal + sp;
    const num = numeric(g, [
      [sp, 'Stopped at the super profit; it has to be capitalised at the normal rate of return.'],
      [c + g, 'Capitalised the whole average profit; under this method only the super profit is capitalised.'],
      [(sp * r) / 100, `Took ${r}% of the super profit instead of dividing the super profit by the rate.`],
    ]);
    return num && {
      prompt: `${intro(f)} Its average profit is ${inr(avg)} a year and its normal profit is ${inr(normal)}. The normal rate of return is ${r}%. Find the goodwill by capitalisation of super profit.`,
      ...num,
      explanation: [`Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`, `Goodwill = ${inr(sp)} x 100 / ${r} = ${inr(g)}.`],
      hints: H.capital,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const sp = a.length === 1 ? a[0] : a[0] - a[1];
    return near(q.answer / 100, (sp * 100) / rateIn(q.prompt));
  },
});

const capitalisedValue = numericTemplate({
  id: 'gw-capitalised-value', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([8, 10, 12, 15, 20, 25]);
    const v = rng.step(600000, 3000000, 50000);
    const avg = (v * r) / 100;
    if (rng.int(0, 1) === 0) {
      const num = numeric(v, [
        [(avg * r) / 100, `Took ${r}% of the average profit; to capitalise, the profit is divided by the rate, that is multiplied by 100 / ${r}.`],
        [avg / r, 'Divided the average profit by the rate but did not multiply by 100.'],
      ]);
      const prompt = rng.pick([
        `${f.name} earns an average profit of ${inr(avg)} a year. The normal rate of return in its trade is ${r}%. What is the capitalised value of the average profit, that is, the total value of the business?`,
        `${intro(f)} Its average profit is ${inr(avg)} and the normal rate of return is ${r}%. How much capital would be needed to earn this profit at the normal rate (the capitalised value of the average profit)?`,
      ]);
      return num && { prompt, ...num, explanation: ['Capitalised value = Average profit x 100 / Normal rate of return.', `${inr(avg)} x 100 / ${r} = ${inr(v)}.`], hints: H.capital };
    }
    const g = rng.step(50000, Math.min(500000, v - 300000), 10000);
    const y = rng.step(50000, 400000, 10000);
    const x = v - g + y;
    const num = numeric(g, [
      [v - x, 'Deducted the total assets; it is the net assets (assets less outside liabilities) that are deducted.'],
      [v, 'Gave the capitalised value of the business; the net assets still have to be deducted.'],
      [x - y, 'Gave the net assets; goodwill is the capitalised value less the net assets.'],
    ]);
    return num && {
      prompt: `The capitalised value of the average profit of ${f.name} is ${inr(v)}. Its assets, all of them tangible and used in the business, are ${inr(x)} and its outside liabilities are ${inr(y)}. Find the goodwill by capitalisation of average profit.`,
      ...num,
      explanation: [`Net assets (capital employed) = ${inr(x)} - ${inr(y)} = ${inr(x - y)}.`, `Goodwill = Capitalised value - Net assets = ${inr(v)} - ${inr(x - y)} = ${inr(g)}.`],
      hints: H.capital,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    return a.length === 1 ? near(q.answer / 100, (a[0] * 100) / rateIn(q.prompt)) : near(q.answer / 100, a[0] - (a[1] - a[2]));
  },
});

const capitalEmployedBasic = numericTemplate({
  id: 'gw-capital-employed-basic', topicId: T, conceptId: 'gw-capital-employed', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const y = rng.pick([2024, 2025, 2026]);
    if (rng.int(0, 1) === 0) {
      const c = rng.step(300000, 1500000, 50000);
      const creditors = rng.step(50000, 300000, 10000);
      const loan = rng.step(100000, 500000, 50000);
      const x = c + creditors + loan;
      const num = numeric(c, [
        [x, 'Gave the total assets; the outside liabilities have to be deducted.'],
        [x - creditors, 'Deducted the creditors but not the bank loan, which is also an outside liability.'],
        [x + creditors + loan, 'Added the outside liabilities to the assets instead of deducting them.'],
      ]);
      return num && {
        prompt: `On 31 March ${y} the assets of ${f.name}, all of them tangible and used in the business, were ${inr(x)}. The firm owed ${inr(creditors)} to sundry creditors and ${inr(loan)} on a bank loan. What is the capital employed?`,
        ...num,
        explanation: ['Capital employed = Assets used in the business - Outside liabilities.', `${inr(x)} - ${inr(creditors)} - ${inr(loan)} = ${inr(c)}.`],
        hints: H.capEmp,
      };
    }
    const ca = rng.step(200000, 800000, 50000);
    const cb = rng.step(150000, 600000, 50000);
    const reserve = rng.step(40000, 240000, 10000);
    const creditors = rng.step(50000, 300000, 10000);
    const num = numeric(ca + cb + reserve, [
      [ca + cb, "Left out the general reserve; it is undistributed profit and belongs to the partners as much as their capitals do."],
      [ca + cb + reserve + creditors, "Added the creditors, an outside liability, to the partners' funds."],
      [ca + cb - reserve, 'Deducted the general reserve instead of adding it.'],
    ]);
    return num && {
      prompt: `${f.name} has no goodwill, fictitious assets or non-trade investments in its books. Its Balance Sheet on 31 March ${y} showed:\n${rows([[`${f.a}'s Capital`, ca], [`${f.b}'s Capital`, cb], ['General reserve', reserve], ['Sundry creditors', creditors]])}\nFind the capital employed, taken as the partners' funds in the business.`,
      ...num,
      explanation: ["Capital employed = Partners' capitals + Reserves (less goodwill, fictitious assets and non-trade investments, of which there are none here).", `${inr(ca)} + ${inr(cb)} + ${inr(reserve)} = ${inr(ca + cb + reserve)}.`, 'Creditors are an outside liability and are not part of it.'],
      hints: H.capEmp,
    };
  },
  verify: (q) => {
    const m = labelled(q.prompt);
    if (m.size === 0) {
      const [x, y1, y2] = amountsIn(q.prompt);
      return near(q.answer / 100, x - y1 - y2);
    }
    return near(q.answer / 100, sum([...m].filter(([label]) => label !== 'Sundry creditors').map(([, v]) => v)));
  },
});

const SELLERS = ['Verma Stores', 'Lakshmi Traders', 'Kohli Enterprises', 'Fernandes & Co.', 'Thakur Agencies', 'Banerjee Brothers'];

const purchasedAmount = numericTemplate({
  id: 'gw-purchased-amount', topicId: T, conceptId: 'gw-kinds', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const seller = rng.pick(SELLERS);
    const x = rng.step(400000, 1500000, 50000);
    const y = rng.step(50000, 250000, 10000);
    const g = y + rng.step(20000, 200000, 10000);
    const price = x - y + g;
    const num = numeric(g, [
      [price - x, 'Compared the price with the assets alone and ignored the liabilities taken over.'],
      [x - y, 'Gave the net assets bought; goodwill is what is paid over and above them.'],
      [price - x - y, 'Added the liabilities to the assets instead of deducting them from the assets.'],
    ]);
    const prompt = rng.pick([
      `${f.name} bought the running business of ${seller}. It took over assets valued at ${inr(x)} and liabilities of ${inr(y)}, and paid ${inr(price)} for the business. How much goodwill does ${f.name} record in its books?`,
      `The business of ${seller}, with assets worth ${inr(x)} and liabilities of ${inr(y)}, was purchased by ${f.name} for ${inr(price)}. What is the amount of the purchased goodwill?`,
    ]);
    return num && {
      prompt,
      ...num,
      explanation: [`Net assets taken over = ${inr(x)} - ${inr(y)} = ${inr(x - y)}.`, `Purchased goodwill = Price paid - Net assets = ${inr(price)} - ${inr(x - y)} = ${inr(g)}.`, 'It has been paid for, so it is recorded in the books (AS 26).'],
      hints: ['What did the buyer get for the price: assets, less the liabilities it took over.', 'Purchased goodwill = price paid - net assets taken over.'],
    };
  },
  verify: (q) => {
    const [x, y, price] = amountsIn(q.prompt);
    return near(q.answer / 100, price - (x - y));
  },
});

interface Pooled {
  q: string;
  right: string;
  wrong: [string, string][];
  why: string;
}
const NATURE: Pooled[] = [
  {
    q: 'What kind of asset is goodwill?',
    right: 'An intangible asset',
    wrong: [
      ['A fictitious asset', 'Took an asset that cannot be seen for one that has no value; goodwill can be sold along with the business, a fictitious asset cannot.'],
      ['A tangible fixed asset', 'Treated goodwill as something physical; it cannot be seen or touched.'],
      ['A current asset', 'Treated goodwill as something held for conversion into cash within a year; it stays with the business.'],
    ],
    why: 'Goodwill has no physical form but it has a value, so it is an intangible asset and not a fictitious one.',
  },
  {
    q: 'Why is goodwill not a fictitious asset?',
    right: 'It has a value, which a buyer of the business is willing to pay for',
    wrong: [
      ['It can be seen and touched like machinery', 'Mixed up having a value with having a physical form; goodwill has no physical form.'],
      ['It always appears in the Balance Sheet', 'Self-generated goodwill is not shown in the books at all, and it is still not fictitious.'],
      ['Its value never changes', 'The value of goodwill rises and falls with the prospects of the firm.'],
    ],
    why: 'A fictitious asset (such as a debit balance of Profit and Loss A/c) has no realisable value. Goodwill is realised when the business is sold.',
  },
  {
    q: 'Which statement about the goodwill of a firm is correct?',
    right: 'It cannot be sold apart from the business itself',
    wrong: [
      ['It can be sold separately while the firm keeps the business', 'Treated goodwill like a machine that can be sold on its own; it is attached to the business as a whole.'],
      ['Once valued, its value stays fixed', 'Goodwill is not a fixed figure; it changes with profits, competition and reputation.'],
      ['It arises only when a firm makes losses', 'Reversed the idea: goodwill rests on the expectation of profits above the normal.'],
    ],
    why: 'Goodwill is inseparable from the business: it passes to the buyer only when the business itself is sold.',
  },
  {
    q: 'Goodwill is best described as the value of:',
    right: 'the reputation of a firm, which helps it earn more than the normal profit of its trade',
    wrong: [
      ['the cash and bank balances of the firm', 'Took goodwill for a liquid asset; cash is tangible and separately counted.'],
      ['the stock and debtors of the firm', 'Took goodwill for the current assets; these are valued on their own.'],
      ['the accumulated losses of the firm', 'Took goodwill for a fictitious item; losses carried forward have no value.'],
    ],
    why: 'A good name, loyal customers and similar advantages let a firm earn more than a new firm would: that earning power is goodwill.',
  },
  {
    q: 'Why is the valuation of goodwill said to be subjective?',
    right: 'It depends on estimates of future profits, so two valuers may reach different figures',
    wrong: [
      ['Goodwill has no value at all', 'Took goodwill for a fictitious asset; it has a value, though the value is a matter of judgement.'],
      ['Goodwill is always equal to the capital of the firm', 'Tied goodwill to capital; it depends on earning capacity, not on the capital invested.'],
      ['The law fixes one value of goodwill for every firm', 'No law fixes the figure; the method and the years of purchase are agreed by the partners.'],
    ],
    why: "The method, the years chosen and the number of years' purchase are matters of judgement and agreement, so the figure can differ from valuer to valuer.",
  },
  {
    q: 'A firm earns exactly the normal profit of its trade and is expected to go on doing so. What does the super profit method say about its goodwill?',
    right: 'It has no goodwill, because it earns nothing above the normal profit',
    wrong: [
      ['Its goodwill equals its normal profit', 'Valued goodwill on the normal profit; under this method only the excess over normal profit counts.'],
      ['Its goodwill equals its capital employed', 'Took the capital for goodwill; capital employed is what earns the normal profit.'],
      ["Its goodwill is two years' purchase of its average profit", 'Switched to the average profit method; the question is about the super profit method.'],
    ],
    why: 'Super profit = average profit - normal profit. When the two are equal the super profit is nil, and so is goodwill by this method.',
  },
  {
    q: 'Which of these is true of goodwill as an asset?',
    right: 'It has value only as long as the business is expected to earn good profits in future',
    wrong: [
      ['It is shown at market price in the Balance Sheet every year', 'Goodwill is not revalued and shown every year; self-generated goodwill is not shown at all.'],
      ['It wears out with use, like a machine', 'Goodwill has no physical form to wear out; its value depends on future profits.'],
      ['It is a liability that the firm owes to its customers', 'Mistook an asset for a liability; goodwill is an advantage the firm owns.'],
    ],
    why: 'Goodwill is the present value of expected future advantages: if the firm is no longer expected to do well, its goodwill falls.',
  },
];

const nature = mcqTemplate({
  id: 'gw-nature', topicId: T, conceptId: 'gw-nature', difficulty: 'easy',
  generate: (rng) => {
    if (rng.int(0, 3) === 0) {
      // Two firms of one trade: the one that earns more than the normal profit has goodwill.
      const normal = rng.step(60000, 300000, 10000);
      const more = normal + rng.step(20000, superLimit(normal, 150000, 10000), 10000);
      const [x, y] = rng.shuffle(['Firm A', 'Firm B']);
      return choice(
        `${x} and ${y} are in the same trade and have the same capital employed. The normal profit on that capital is ${inr(normal)} a year. ${x} earns ${inr(more)} a year and ${y} earns ${inr(normal)}. Which of them has goodwill?`,
        `Only ${x}, which earns more than the normal profit`,
        [
          [`Only ${y}, which earns exactly the normal profit`, 'Took earning the normal profit as a sign of goodwill; goodwill comes from earning more than the normal.'],
          ['Both firms, because both earn a profit', 'Took any profit as proof of goodwill; a profit that is merely normal gives no advantage over a new firm.'],
          ['Neither firm, because goodwill cannot be seen', 'Took an intangible asset for one without value; goodwill exists where profits exceed the normal.'],
        ],
        `${x} earns ${inr(more - normal)} a year above the normal profit. That extra earning power is its goodwill; ${y} has none.`,
        H.nature,
      );
    }
    const item = rng.pick(NATURE);
    return choice(item.q, item.right, item.wrong, item.why, H.nature);
  },
});

const FACTORS = {
  location: 'Location of the business',
  management: 'Efficiency of management',
  nature: 'Nature of the business',
  market: 'Market situation',
  special: 'Special advantages',
};
type Factor = keyof typeof FACTORS;
const FACTOR_SCENARIOS: [string, Factor][] = [
  ['A tea stall stands right outside the main gate of a busy railway station and is never short of customers.', 'location'],
  ['A stationery shop is next door to three large schools, so students buy from it every day.', 'location'],
  ['A restaurant sits on the highway at the spot where every tourist bus halts for a meal.', 'location'],
  ['The partners of a firm plan carefully, control costs and train their staff well, so the firm earns more than similar firms do.', 'management'],
  ['A firm is run by experienced and capable partners who have raised its productivity year after year.', 'management'],
  ['Two firms sell the same goods in the same market from similar premises; one earns more because it is better organised and better run.', 'management'],
  ['A firm makes common medicines, which people need in good times and bad, so its sales hardly fluctuate.', 'nature'],
  ['A firm supplies school textbooks, a line of trade with a steady demand every year and little risk.', 'nature'],
  ['A firm deals in packaged milk, a daily necessity whose demand does not depend on fashion or season.', 'nature'],
  ['Only one firm in a farming district repairs tractors; no other firm has entered the trade, so every farmer comes to it.', 'market'],
  ['A firm is the sole cable operator in a hill town; no rival serves the area.', 'market'],
  ['A firm has very few competitors in its trade and so sells at good prices without fear of losing customers.', 'market'],
  ['A firm holds an import licence of a kind that very few traders have been granted.', 'special'],
  ['A firm has a ten-year contract to supply uniforms to a large chain of schools.', 'special'],
  ['A firm has a long-term agreement that assures it raw material and electricity at low rates.', 'special'],
  ['A petrol pump stands where two national highways meet, so vehicles from four directions fill up there.', 'location'],
  ['A book shop faces the gate of a large university and is the first shop the students see.', 'location'],
  ['A firm halved its wastage after its partners brought in strict quality checks, and its profit rose although its sales did not.', 'management'],
  ['A firm keeps its skilled workers for years because its partners handle people well, so customers get the same good service every time.', 'management'],
  ['A firm sells salt and edible oil, goods that every household buys every month whatever the state of trade.', 'nature'],
  ['A firm supplies spare parts for farm pumps, for which orders come in steadily all through the year.', 'nature'],
  ['A firm is one of only two suppliers of ready-mix concrete in its city, so builders have little choice.', 'market'],
  ['No other bus operator runs on the route that a firm serves, so every passenger on it travels with that firm.', 'market'],
  ['A firm owns a registered trade mark that customers know and ask for by name.', 'special'],
  ['A firm has been allotted electricity at a concessional rate for twenty years, while its rivals pay the full tariff.', 'special'],
];
const FACTOR_WHY: Record<Factor, string> = {
  location: 'Picked location, but nothing in the situation is about where the business stands.',
  management: 'Picked efficiency of management, but the advantage described does not come from how well the firm is run.',
  nature: 'Picked the nature of the business, but the advantage described is not the kind of goods or the steadiness of their demand.',
  market: 'Picked the market situation, but the situation does not describe a monopoly or a lack of competitors.',
  special: 'Picked special advantages, but no licence, trade mark, long-term contract or assured supply is mentioned.',
};
const FACTOR_BECAUSE: Record<Factor, string> = {
  location: 'A place that customers pass or reach easily brings more sales, and so more goodwill.',
  management: 'A well-managed firm earns higher profits from the same resources, which raises its goodwill.',
  nature: 'Goods with a steady demand and little risk give stable profits, which raises goodwill.',
  market: 'A firm with a monopoly or little competition can earn high profits, which raises its goodwill.',
  special: 'A licence, a trade mark, a long-term contract or an assured supply is an advantage rivals lack, and it raises goodwill.',
};

const factor = mcqTemplate({
  id: 'gw-factor', topicId: T, conceptId: 'gw-nature', difficulty: 'easy',
  generate: (rng) => {
    const [text, right] = rng.pick(FACTOR_SCENARIOS);
    const wrong = (Object.keys(FACTORS) as Factor[]).filter((x) => x !== right).map((x): [string, string] => [FACTORS[x], FACTOR_WHY[x]]);
    const ask = rng.pick(['Which factor affecting goodwill does this show?', 'Which factor is raising the goodwill here?', 'To which factor is the goodwill of this business mainly due?']);
    return choice(`${text} ${ask}`, FACTORS[right], wrong, FACTOR_BECAUSE[right], [
      'Ask what gives this business its edge: its place, its managers, its line of trade, the lack of rivals or a special right.',
      'Factors affecting goodwill: nature of business, location, efficiency of management, market situation, special advantages.',
    ]);
  },
});

const RAISES: [string, string][] = [
  ['A new metro station opens beside its shop', 'Took a better location for a drawback; more people pass the shop, which raises goodwill.'],
  ['It wins a long-term contract to supply a large chain of hospitals', 'Took an assured contract for a drawback; it is a special advantage and raises goodwill.'],
  ['Its only competitor in the town closes down', 'Took the end of competition for a drawback; a firm without rivals can earn more, which raises goodwill.'],
  ['Its profits have risen steadily for five years', 'Took rising profits for a drawback; a rising trend of profit raises goodwill.'],
  ['It is granted a patent for its main product', 'Took a patent for a drawback; a right that rivals do not have raises goodwill.'],
  ['Its partners bring in a system that cuts wastage and costs', 'Took better management for a drawback; efficient management raises profits and goodwill.'],
];
const LOWERS: [string, string][] = [
  ['A rival opens a bigger store next door', 'Took new competition for an advantage; it takes customers away and lowers goodwill.'],
  ['Its profits have fallen year after year', 'Took falling profits for an advantage; a falling trend of profit lowers goodwill.'],
  ['The import licence on which its trade depends is cancelled', 'Took the loss of a special advantage for a gain; it lowers goodwill.'],
  ['The partner whose personal skill drew most of its customers leaves the firm', 'Took the loss of the person customers came for as an advantage; it lowers goodwill.'],
  ['Its trade becomes far riskier because fashions now change every few months', 'Took a rise in risk for an advantage; a risky, unsteady trade lowers goodwill.'],
  ['Much more capital is now needed to earn the same profit', 'Took a higher capital requirement for an advantage; the same profit on more capital leaves less above the normal return, so goodwill falls.'],
  ['The road in front of its shop is closed to traffic for good', 'Took a worse location for an advantage; fewer customers can reach the shop, which lowers goodwill.'],
];

const factorEffect = mcqTemplate({
  id: 'gw-factor-effect', topicId: T, conceptId: 'gw-nature', difficulty: 'easy',
  generate: (rng) => {
    const up = rng.int(0, 1) === 0;
    const [right] = rng.pick(up ? RAISES : LOWERS);
    const wrong = rng.shuffle(up ? LOWERS : RAISES).slice(0, 3);
    const lead = rng.pick(['Other things remaining the same, which', 'Which']);
    return choice(
      `${lead} of these would ${up ? 'raise' : 'reduce'} the goodwill of a firm?`,
      right,
      wrong,
      up
        ? 'Goodwill rises with anything that lets the firm earn more than the normal profit in future: a better location, less competition, a special advantage, better management or a rising trend of profit.'
        : 'Goodwill falls with anything that weakens future profits: more competition, a lost advantage, a falling trend of profit, higher risk or a need for more capital to earn the same profit.',
      ['Will the firm earn more, or less, than before because of this?', 'Goodwill follows the expected future profits above the normal.'],
    );
  },
});

const KINDS = {
  pr: 'Purchased goodwill, which is recorded in the books',
  pn: 'Purchased goodwill, which is not recorded in the books',
  sr: 'Self-generated goodwill, which is recorded in the books',
  sn: 'Self-generated goodwill, which is not recorded in the books',
};

const purchasedOrSelf = mcqTemplate({
  id: 'gw-purchased-or-self', topicId: T, conceptId: 'gw-kinds', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const ask = 'What kind of goodwill is this, and how is it treated under AS 26?';
    if (rng.int(0, 1) === 0) {
      const net = rng.step(400000, 1500000, 50000);
      const g = rng.step(50000, 400000, 10000);
      const text = rng.pick([
        `${f.name} bought the running business of ${rng.pick(SELLERS)} for ${inr(net + g)}. The net assets taken over were worth ${inr(net)}, so ${inr(g)} was paid for goodwill.`,
        `To take over an established shop, ${f.name} paid ${inr(net + g)} for net assets valued at ${inr(net)}. The extra ${inr(g)} was paid for the name and customers of the shop.`,
      ]);
      return choice(
        `${text} ${ask}`,
        KINDS.pr,
        [
          [KINDS.pn, 'Applied the rule for self-generated goodwill; goodwill that has been paid for has a cost and is recorded.'],
          [KINDS.sr, 'Called it self-generated although a price was paid for it to another business.'],
          [KINDS.sn, 'Called it self-generated although a price was paid for it to another business.'],
        ],
        `A price of ${inr(g)} was paid for the goodwill, so it is purchased goodwill. It has a cost that can be measured reliably, and AS 26 allows it to be recorded.`,
        H.nature,
      );
    }
    const g = rng.step(100000, 900000, 50000);
    const years = rng.pick(['fifteen', 'twenty', 'twenty-five', 'thirty']);
    const text = rng.pick([
      `Over ${years} years ${f.name} has built a loyal set of customers. The partners estimate that the goodwill of the firm is worth ${inr(g)}; nothing has been paid to anyone for it.`,
      `${f.name} has earned a fine reputation in its town through ${years} years of honest dealing. A valuer puts the goodwill at ${inr(g)}. The firm has never bought another business.`,
    ]);
    return choice(
      `${text} ${ask}`,
      KINDS.sn,
      [
        [KINDS.sr, 'Recorded goodwill that was never paid for; AS 26 does not allow self-generated goodwill in the books because it has no cost that can be measured reliably.'],
        [KINDS.pr, 'Called it purchased although no price was paid for it; it grew inside the firm.'],
        [KINDS.pn, 'Called it purchased although no price was paid for it; it grew inside the firm.'],
      ],
      'The goodwill grew inside the firm and nothing was paid for it, so it is self-generated (internally generated). AS 26 does not allow it to be recorded, because its cost cannot be measured reliably.',
      H.nature,
    );
  },
  verify: (q) => (optionText(q) === KINDS.pr) === /paid .* for (goodwill|the name)|bought the running business/.test(q.prompt),
});

const OCCASIONS = [
  'When the partners change their profit-sharing ratio',
  'When a new partner is admitted to the firm',
  'When a partner retires from the firm',
  'When a partner dies',
  'When the business is sold as a going concern',
  'When the firm is amalgamated with another firm',
];
const NOT_OCCASIONS: [string, string][] = [
  ['When the firm buys a new delivery van', 'Buying an asset changes neither the partners nor their shares, so no one has to be compensated for goodwill.'],
  ['When the firm pays the salaries of its staff', 'Took a routine expense for an occasion to value goodwill; nothing changes in who owns the firm or in what share.'],
  ['When the firm closes its books at the end of every year', 'Goodwill is not valued every year; it is valued when the partners or their shares change, or the business is sold.'],
  ['When a partner withdraws cash for household expenses', 'Drawings reduce a capital account; they do not change the shares of the partners in future profits.'],
  ['When the firm takes a loan from a bank', 'A loan brings in an outside liability; the partners and their shares stay as they were.'],
  ['When the firm changes its method of charging depreciation', 'A change of accounting method does not change who owns the firm or in what share.'],
  ['When the firm receives a large order from a customer', 'A large order may add to profit, but nobody gains or gives up a share of the firm because of it.'],
];

const needForValuation = mcqTemplate({
  id: 'gw-need', topicId: T, conceptId: 'gw-kinds', difficulty: 'easy',
  generate: (rng) => {
    const right = rng.pick(OCCASIONS);
    const wrong = rng.shuffle(NOT_OCCASIONS).slice(0, 3);
    const ask = rng.pick([
      'On which of these occasions does a partnership firm need to value its goodwill?',
      'The goodwill of a partnership firm has to be valued in which of these situations?',
      'Which of these events calls for the valuation of the goodwill of a firm?',
    ]);
    return choice(
      ask,
      right,
      wrong,
      'Goodwill is valued when the partners or their shares change (a change in the profit-sharing ratio, admission, retirement or death of a partner) or when the business is sold or amalgamated: someone then gains a share of future profits and someone gives it up.',
      ['Does the event change who shares the future profits, or in what ratio?', 'Goodwill is valued on a change in the partners or their shares, and on the sale of the business.'],
    );
  },
});

interface AdjustItem {
  text: (x: string, y: string) => string;
  add: boolean;
  because: string;
}
const ADJUST_ITEMS: AdjustItem[] = [
  { text: (x, y) => `The profit of ${y} was arrived at after charging a loss of ${x} caused by a fire in the godown.`, add: true, because: 'A loss by fire is abnormal: it is not expected to recur, so it is added back to find the normal profit.' },
  { text: (x, y) => `The profit of ${y} was arrived at after charging a loss of ${x} from a theft of goods.`, add: true, because: 'A loss by theft is abnormal: it is not expected to recur, so it is added back to find the normal profit.' },
  { text: (x, y) => `The profit of ${y} includes a gain of ${x} on the sale of a plot of land.`, add: false, because: 'A gain on the sale of a fixed asset is abnormal: it will not recur, so it is taken out of the profit.' },
  { text: (x, y) => `The profit of ${y} includes ${x} received as a one-time compensation from the municipality.`, add: false, because: 'A one-time receipt is an abnormal gain: it will not recur, so it is taken out of the profit.' },
  { text: (x, y) => `Rent of ${x} for the godown for ${y} was left out of the books altogether.`, add: false, because: 'An expense that was omitted has to be charged: the profit of the year was overstated by it.' },
  { text: (x, y) => `The closing stock of ${y} was overvalued by ${x}.`, add: false, because: 'Closing stock is on the credit side of the Trading Account, so overvalued closing stock overstates the profit of that year.' },
  { text: (x, y) => `The closing stock of ${y} was undervalued by ${x}.`, add: true, because: 'Closing stock is on the credit side of the Trading Account, so undervalued closing stock understates the profit of that year.' },
  { text: (x, y) => `Commission of ${x} earned in ${y} in the ordinary course of business was left out of the books altogether.`, add: true, because: 'A normal income that was omitted has to be brought in: the profit of the year was understated by it.' },
];

const adjustDirection = mcqTemplate({
  id: 'gw-adjust-direction', topicId: T, conceptId: 'gw-adjustments', difficulty: 'easy',
  generate: (rng) => {
    const f = firm(rng);
    const y = fy(rng.pick([2023, 2024, 2025]));
    const x = inr(rng.step(10000, 90000, 5000));
    const item = rng.pick(ADJUST_ITEMS);
    const add = `Add ${x} to the profit of ${y}`;
    const deduct = `Deduct ${x} from the profit of ${y}`;
    const wrongWay = item.add
      ? 'Took the correction the wrong way: the profit of the year was understated by this item, so the amount is added.'
      : 'Took the correction the wrong way: the profit of the year was overstated by this item, so the amount is deducted.';
    return choice(
      `${f.name} ${rng.pick(['is valuing its goodwill on the basis of the normal profits of past years.', 'is working out the normal profits of past years in order to value its goodwill.', 'has to restate its past profits before its goodwill is valued.'])} ${item.text(x, y)} What adjustment is made to the profit of ${y}?`,
      item.add ? add : deduct,
      [
        [item.add ? deduct : add, wrongWay],
        [`Make no adjustment to the profit of ${y}`, 'Took the profit as given for the normal profit; past profits are first corrected for abnormal items, omissions and errors.'],
        [`${item.add ? 'Add' : 'Deduct'} ${x} ${item.add ? 'to' : 'from'} the goodwill after it has been calculated`, 'Adjusted the final figure of goodwill; the correction belongs to the profit of the year, before the average is taken.'],
      ],
      item.because,
      H.adjust,
    );
  },
  // Read again from the wording alone: what made the profit of the year too low is added, what made it too high is deducted.
  verify: (q) => {
    const tooLow = /after charging a loss|was undervalued|Commission of/.test(q.prompt);
    const tooHigh = /includes|Rent of|was overvalued/.test(q.prompt);
    return tooLow !== tooHigh && (optionText(q) ?? '').startsWith(tooLow ? 'Add ' : 'Deduct ') && (optionText(q) ?? '').includes('the profit of');
  },
});

const METHODS = {
  avg: 'Average profit method',
  weighted: 'Weighted average profit method',
  sup: 'Super profit method',
  capAvg: 'Capitalisation of average profit',
  capSuper: 'Capitalisation of super profit',
};
type Method = keyof typeof METHODS;
const METHOD_WHY: Record<Method, string> = {
  avg: "Picked the average profit method, in which the simple average profit itself is multiplied by the number of years' purchase.",
  weighted: 'Picked the weighted average profit method, in which each profit is first multiplied by a weight; no weights are used here.',
  sup: "Picked the super profit method, in which the super profit is multiplied by a number of years' purchase.",
  capAvg: 'Picked capitalisation of average profit, in which the average profit is divided by the normal rate and the capital employed is deducted.',
  capSuper: 'Picked capitalisation of super profit, in which the super profit is divided by the normal rate of return.',
};
const VALUERS = ['Aditi', 'Farhan', 'Gurpreet', 'Kavya', 'Rohan', 'Sneha', 'Tanvi', 'Yusuf'];

const methodName = mcqTemplate({
  id: 'gw-method-name', topicId: T, conceptId: 'gw-kinds', difficulty: 'easy',
  generate: (rng) => {
    const who = rng.pick(VALUERS);
    const m = rng.pick(Object.keys(METHODS) as Method[]);
    const n = rng.pick([2, 3, 4]);
    const r = rng.pick([10, 12, 15, 20]);
    const c = rng.step(400000, 1500000, 100000);
    const normal = (c * r) / 100;
    const avg = normal + rng.step(20000, superLimit(normal, 120000, 10000), 10000);
    const does: Record<Method, string> = {
      avg: `takes the average profit of the last four years, ${inr(avg)}, and multiplies it by ${n}`,
      weighted: `multiplies the profits of the last three years by 1, 2 and 3, divides the total of the products by 6 and multiplies the result by ${n}`,
      sup: `deducts the normal profit of ${inr(normal)} from the average profit of ${inr(avg)} and multiplies the difference by ${n}`,
      capAvg: `multiplies the average profit of ${inr(avg)} by 100 / ${r}, ${r}% being the normal rate of return, and deducts the capital employed of ${inr(c)} from the result`,
      capSuper: `deducts the normal profit of ${inr(normal)} from the average profit of ${inr(avg)} and multiplies the difference by 100 / ${r}, ${r}% being the normal rate of return`,
    };
    const because: Record<Method, string> = {
      avg: "Average profit x number of years' purchase is the average profit method.",
      weighted: "Profits multiplied by weights, divided by the total of the weights and then multiplied by the years' purchase: the weighted average profit method.",
      sup: "(Average profit - normal profit) x number of years' purchase is the super profit method.",
      capAvg: 'Average profit x 100 / normal rate gives the capitalised value of the business; less capital employed, it is goodwill by capitalisation of average profit.',
      capSuper: 'Super profit x 100 / normal rate is goodwill by capitalisation of super profit.',
    };
    const wrong = (Object.keys(METHODS) as Method[]).filter((x) => x !== m).map((x): [string, string] => [METHODS[x], METHOD_WHY[x]]);
    return choice(`To value the goodwill of a firm, ${who} ${does[m]}. Which method of valuing goodwill is ${who} using?`, METHODS[m], wrong, because[m], [
      'Is an average profit or a super profit being used? Is it multiplied by years, or divided by the normal rate?',
      "Years' purchase methods multiply a profit; capitalisation methods divide a profit by the normal rate.",
    ]);
  },
  // Read again from what is done: is the normal profit deducted, is the capital employed deducted, is 100 / rate used, are there weights?
  verify: (q) => {
    const superUsed = q.prompt.includes('deducts the normal profit');
    const capitalised = q.prompt.includes('100 /');
    const m: Method = q.prompt.includes('by 1, 2 and 3') ? 'weighted' : capitalised ? (superUsed ? 'capSuper' : 'capAvg') : superUsed ? 'sup' : 'avg';
    return optionText(q) === METHODS[m];
  },
});

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

/** Profits with a trend (rising, or now and then falling), as the weighted average is used for. */
function trendProfits(rng: Rng, k: number): number[] {
  const p = [rng.step(60000, 200000, 10000)];
  for (let i = 1; i < k; i++) p.push(p[i - 1] + rng.step(10000, 60000, 5000));
  return rng.int(0, 3) === 0 ? p.reverse() : p;
}
const weightsOf = (k: number): number[] => Array.from({ length: k }, (_, i) => i + 1);
const weighted = (ps: readonly number[], ws: readonly number[]): number => sum(ps.map((p, i) => p * ws[i]));
const weightsText = (k: number): string => (k === 3 ? '1, 2 and 3' : '1, 2, 3 and 4');
/** "(₹60,000 x 1) + (₹80,000 x 2) + ..." */
const productsText = (ps: number[], ws: number[]): string => ps.map((p, i) => `(${inr(p)} x ${ws[i]})`).join(' + ');

const weightedAvg = numericTemplate({
  id: 'gw-weighted-avg', topicId: T, conceptId: 'gw-weighted', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const ys = lastYears(rng, k);
    const ws = weightsOf(k);
    const total = sum(ws);
    const p = trendProfits(rng, k);
    p[0] += (total * 1000 - (weighted(p, ws) % (total * 1000))) % (total * 1000);
    const products = weighted(p, ws);
    const avg = products / total;
    const num = numeric(avg, [
      [sum(p) / k, 'Took the simple average and ignored the weights.'],
      [products, 'Added the products but did not divide by the total of the weights.'],
      [products / k, `Divided the total of the products by ${k}, the number of years, instead of by ${total}, the total of the weights.`],
      [weighted(p, [...ws].reverse()) / total, 'Gave the highest weight to the earliest year instead of the latest.'],
    ]);
    return num && {
      prompt: `${rng.pick([
        `${f.name} uses the weighted average of its profits, with weights of ${weightsText(k)} for the years in order, the latest year carrying the highest weight. The profits (years ended 31 March) were:`,
        `The partners of ${f.name} give the profits of the last ${WORDS[k]} years weights of ${weightsText(k)}, in the order of the years, so that the latest year counts most. The profits (years ended 31 March) were:`,
        `${intro(f)} Its profits for the last ${WORDS[k]} accounting years (each ended 31 March) are to be averaged with weights of ${weightsText(k)}, the earliest year having a weight of 1:`,
      ])}\n${yearRows(ys, p)}\n${rng.pick(['Find the weighted average profit.', 'What is the weighted average profit?'])}`,
      ...num,
      explanation: [
        `Products = ${productsText(p, ws)} = ${inr(products)}.`,
        `Total of the weights = ${ws.join(' + ')} = ${total}.`,
        `Weighted average profit = ${inr(products)} / ${total} = ${inr(avg)}.`,
      ],
      hints: H.weighted,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    return near(q.answer / 100, r.reduce((acc, p, i) => acc + p * (i + 1), 0) / ((r.length * (r.length + 1)) / 2));
  },
});

const weightedGoodwill = numericTemplate({
  id: 'gw-weighted-goodwill', topicId: T, conceptId: 'gw-weighted', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const n = rng.pick([2, 3, 2.5, 1.5]);
    const ys = lastYears(rng, k);
    const ws = weightsOf(k);
    const total = sum(ws);
    const p = trendProfits(rng, k);
    p[0] += (total * 2000 - (weighted(p, ws) % (total * 2000))) % (total * 2000);
    const products = weighted(p, ws);
    const avg = products / total;
    const num = numeric(avg * n, [
      [avg, "Stopped at the weighted average profit and did not multiply by the number of years' purchase."],
      [(sum(p) / k) * n, 'Used the simple average of the profits and ignored the weights.'],
      [(products / k) * n, `Divided the total of the products by ${k}, the number of years, instead of by ${total}, the total of the weights.`],
      [products, 'Gave the total of the products as the goodwill.'],
    ]);
    const rising = p[k - 1] > p[0];
    // The first year was raised to make the average whole: a seed in which it overtakes the second year is not "rising".
    if (rising && p[0] >= p[1]) return null;
    return num && {
      prompt: `${rng.pick([
        `The profits of ${f.name} have been ${rising ? 'rising' : 'falling'}, so the partners value goodwill at ${n} years' purchase of the weighted average profit of the last ${WORDS[k]} years. The weights are ${weightsText(k)} for the years in order, the latest year having the highest weight. The profits (years ended 31 March) were:`,
        `${intro(f)} Its goodwill is to be valued at ${n} years' purchase of the weighted average profit of the last ${WORDS[k]} years, the weights being ${weightsText(k)} from the earliest year to the latest. The profits (years ended 31 March) were:`,
        `Because the profits of ${f.name} show a ${rising ? 'rising' : 'falling'} trend, the latest year is given the highest weight: the weights are ${weightsText(k)} for the years in order. Goodwill is ${n} years' purchase of the weighted average profit of these ${WORDS[k]} years (ended 31 March):`,
      ])}\n${yearRows(ys, p)}\nFind the value of the goodwill.`,
      ...num,
      explanation: [
        `Products = ${productsText(p, ws)} = ${inr(products)}.`,
        `Weighted average profit = ${inr(products)} / ${total} = ${inr(avg)}.`,
        `Goodwill = ${inr(avg)} x ${n} = ${inr(avg * n)}.`,
      ],
      hints: H.weighted,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    const wavg = r.reduce((acc, p, i) => acc + p * (i + 1), 0) / ((r.length * (r.length + 1)) / 2);
    return near(q.answer / 100, wavg * purchaseIn(q.prompt));
  },
});

const ABNORMAL_LOSSES: ((x: string, y: string) => string)[] = [
  (x, y) => `The profit of ${y} is after charging an abnormal loss of ${x} caused by a fire in the godown.`,
  (x, y) => `Goods costing ${x} were stolen in ${y}, and the loss was charged against the profit of that year.`,
  (x, y) => `The profit of ${y} is after charging a loss of ${x} caused by a flood, which is not expected to recur.`,
];
const ABNORMAL_GAINS: ((x: string, y: string) => string)[] = [
  (x, y) => `The profit of ${y} includes a gain of ${x} on the sale of a plot of land.`,
  (x, y) => `The profit of ${y} includes ${x} received as a one-time compensation from the municipality.`,
  (x, y) => `The profit of ${y} includes a gain of ${x} on the sale of an old building, which is not a normal income of the firm.`,
];

const avgAbnormal = numericTemplate({
  id: 'gw-avg-abnormal', topicId: T, conceptId: 'gw-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const n = rng.pick([2, 3, 1.5, 2.5]);
    const ys = lastYears(rng, k);
    const isLoss = rng.int(0, 1) === 0;
    const at = rng.int(0, k - 1);
    const x = k * rng.step(5000, 30000, 5000);
    const delta = isLoss ? x : -x;
    const p = Array.from({ length: k }, () => rng.step(80000, 320000, 5000));
    settle(p, k * 5000, (at + 1) % k, delta);
    if (p[at] + delta <= 0) return null;
    const adjTotal = sum(p) + delta;
    const avg = adjTotal / k;
    const item = rng.pick(isLoss ? ABNORMAL_LOSSES : ABNORMAL_GAINS)(inr(x), fy(ys[at]));
    const num = numeric(avg * n, [
      [(sum(p) / k) * n, 'Used the profits as given and did not adjust the abnormal item.'],
      [((sum(p) - delta) / k) * n, isLoss ? 'Deducted the abnormal loss a second time instead of adding it back.' : 'Added the abnormal gain instead of taking it out.'],
      [avg, "Stopped at the average normal profit and did not multiply by the number of years' purchase."],
    ]);
    return num && {
      prompt: `${rng.pick([
        `${f.name} values goodwill at ${n} years' purchase of the average normal profit of the last ${WORDS[k]} years. The profits (years ended 31 March) were:`,
        `The partners of ${f.name} agree to value goodwill at ${n} years' purchase of the average profit of the last ${WORDS[k]} years, once any abnormal item has been adjusted. The profits (years ended 31 March) were:`,
        `${intro(f)} Its goodwill is ${n} years' purchase of the average of the normal profits of the last ${WORDS[k]} years. The books show these profits (years ended 31 March):`,
      ])}\n${yearRows(ys, p)}\n${item}\nFind the value of the goodwill.`,
      ...num,
      explanation: [
        `Normal profit of ${fy(ys[at])} = ${inr(p[at])} ${isLoss ? '+' : '-'} ${inr(x)} = ${inr(p[at] + delta)} (${isLoss ? 'the abnormal loss is added back' : 'the abnormal gain is taken out'}).`,
        `Total of the normal profits = ${inr(adjTotal)}; average = ${inr(adjTotal)} / ${k} = ${inr(avg)}.`,
        `Goodwill = ${inr(avg)} x ${n} = ${inr(avg * n)}.`,
      ],
      hints: H.adjust,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    const x = amountsIn(q.prompt.split('\n')[r.length + 1])[0];
    const up = /after charging|were stolen/.test(q.prompt);
    return near(q.answer / 100, ((sum(r) + (up ? x : -x)) / r.length) * purchaseIn(q.prompt));
  },
});

const avgRemuneration = numericTemplate({
  id: 'gw-avg-remuneration', topicId: T, conceptId: 'gw-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4, 5]);
    const n = rng.pick([2, 3, 4]);
    const partners = rng.pick([2, 3]);
    const each = rng.step(60000, 180000, 12000);
    const pay = each * partners;
    const avgAfter = rng.step(60000, 400000, 10000);
    const before = avgAfter + pay;
    const perPartner = rng.int(0, 1) === 0;
    const given = rng.int(0, 1) === 0;
    const names = partners === 2 ? `${f.a} and ${f.b}` : `${f.a}, ${f.b} and ${f.c}`;
    const profit = given
      ? `The average profit of the last ${WORDS[k]} years is ${inr(before)} a year`
      : `The total profit of the last ${WORDS[k]} years is ${inr(before * k)}`;
    const fair = perPartner
      ? `A fair remuneration for the work of the partners is ${inr(each)} a year for each of the ${WORDS[partners]} partners.`
      : `A fair remuneration for the work of the partners is ${inr(pay)} a year in all.`;
    const num = numeric(avgAfter * n, [
      [before * n, 'Did not deduct the remuneration of the partners; the profit that belongs to the business is what is left after paying for their work.'],
      [(before + pay) * n, 'Added the remuneration to the average profit instead of deducting it.'],
      ...(perPartner ? [[(before - each) * n, 'Deducted the remuneration of one partner only.'] as [number, string]] : []),
      [avgAfter, "Stopped at the adjusted average profit and did not multiply by the number of years' purchase."],
      ...(given ? [] : [[(before * k - pay) * n, 'Deducted the remuneration from the total profit without first finding the average.'] as [number, string]]),
    ]);
    return num && {
      prompt: `${names} are partners in ${f.name}. ${profit}, arrived at before charging anything for the work the partners do. ${fair} Goodwill is valued at ${n} years' purchase of the average profit after this remuneration. Find the goodwill.`,
      ...num,
      explanation: [
        ...(given ? [] : [`Average profit = ${inr(before * k)} / ${k} = ${inr(before)}.`]),
        `Remuneration of the partners = ${perPartner ? `${inr(each)} x ${partners} = ` : ''}${inr(pay)} a year.`,
        `Average profit after remuneration = ${inr(before)} - ${inr(pay)} = ${inr(avgAfter)}.`,
        `Goodwill = ${inr(avgAfter)} x ${n} = ${inr(avgAfter * n)}.`,
      ],
      hints: ['A new owner would have to pay someone to do the work the partners do, so its cost comes off the profit.', "Goodwill = (average profit - partners' remuneration) x number of years' purchase."],
    };
  },
  verify: (q) => {
    const [profit, pay] = amountsIn(q.prompt);
    const years = /total profit of the last (\w+) years/.exec(q.prompt);
    const avg = years ? profit / WORDS.indexOf(years[1]) : profit;
    const each = /for each of the (\w+) partners/.exec(q.prompt);
    return near(q.answer / 100, (avg - pay * (each ? WORDS.indexOf(each[1]) : 1)) * purchaseIn(q.prompt));
  },
});

const stockNextYear = numericTemplate({
  id: 'gw-stock-next-year', topicId: T, conceptId: 'gw-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const ys = lastYears(rng, 3);
    const p = Array.from({ length: 3 }, () => rng.step(80000, 320000, 5000));
    const e = rng.int(0, 1);
    const over = rng.int(0, 1) === 0;
    const x = rng.step(5000, 40000, 5000);
    const askNext = rng.int(0, 2) > 0;
    const at = askNext ? e + 1 : e;
    // Overvalued closing stock overstates its own year and understates the next; undervalued stock does the reverse.
    const delta = (over ? -x : x) * (askNext ? -1 : 1);
    const answer = p[at] + delta;
    const word = over ? 'overvalued' : 'undervalued';
    const num = numeric(answer, [
      [p[at] - delta, askNext ? `Corrected ${fy(ys[at])} in the same direction as the year of the error; the two years move in opposite directions.` : `Took the correction the wrong way: ${word} closing stock ${over ? 'overstates' : 'understates'} the profit of its own year.`],
      [p[at], askNext ? 'Thought the error touches only the year in which the stock was wrongly valued; that closing stock is the opening stock of the next year.' : 'Left the profit as it was; closing stock is credited in the Trading Account, so an error in it changes the profit.'],
    ]);
    return num && {
      prompt: `${rng.pick([
        `${f.name} is correcting its past profits before valuing goodwill. The profits (years ended 31 March) were:`,
        `The goodwill of ${f.name} is to be valued on its past profits, which the books show as follows (years ended 31 March):`,
        `${intro(f)} Before its goodwill is valued, the profits of the last three years (ended 31 March) are being checked:`,
      ])}\n${yearRows(ys, p)}\nIt is found that the closing stock of ${fy(ys[e])} was ${word} by ${inr(x)}. What is the correct profit of ${fy(ys[at])}?`,
      ...num,
      explanation: askNext
        ? [
            `The closing stock of ${fy(ys[e])} is the opening stock of ${fy(ys[at])}, so the opening stock of ${fy(ys[at])} was ${word} by ${inr(x)}.`,
            `Opening stock is a debit in the Trading Account: ${word} opening stock ${over ? 'understates' : 'overstates'} the profit.`,
            `Correct profit of ${fy(ys[at])} = ${inr(p[at])} ${delta > 0 ? '+' : '-'} ${inr(x)} = ${inr(answer)}.`,
          ]
        : [
            `Closing stock is a credit in the Trading Account: ${word} closing stock ${over ? 'overstates' : 'understates'} the profit of ${fy(ys[at])}.`,
            `Correct profit of ${fy(ys[at])} = ${inr(p[at])} ${delta > 0 ? '+' : '-'} ${inr(x)} = ${inr(answer)}.`,
          ],
      hints: H.adjust,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    const years = [...q.prompt.matchAll(/^(\d{4}-\d{2}):/gm)].map((m) => m[1]);
    const m = /closing stock of (\d{4}-\d{2}) was (over|under)valued by ₹([\d,]+)\. What is the correct profit of (\d{4}-\d{2})/.exec(q.prompt);
    if (!m) return false;
    const x = Number(m[3].replace(/,/g, ''));
    const own = m[1] === m[4];
    // Its own year: overvalued means less profit. The next year: the reverse.
    const sign = (m[2] === 'over' ? -1 : 1) * (own ? 1 : -1);
    return near(q.answer / 100, r[years.indexOf(m[4])] + sign * x);
  },
});

const capitalisedExpense = numericTemplate({
  id: 'gw-capitalised-expense', topicId: T, conceptId: 'gw-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const end = rng.pick([2024, 2025, 2026]);
    const y = fy(end);
    const r = rng.pick([10, 15, 20]);
    const x = rng.step(20000, 120000, 10000);
    const dep = (x * r) / 100;
    const p = rng.step(150000, 500000, 10000);
    if (rng.int(0, 1) === 0) {
      const num = numeric(p - x + dep, [
        [p - x, 'Charged the repairs but did not add back the depreciation that was wrongly charged on them.'],
        [p + x - dep, 'Took the correction the wrong way: the repairs were left out of the expenses, so the profit was overstated.'],
        [p - x - dep, 'Deducted the depreciation as well; it had already been charged and is now added back.'],
      ]);
      return num && {
        prompt: `${f.name} is correcting its past profits before valuing goodwill. In ${y}, repairs of ${inr(x)} to machinery (a revenue expense) were wrongly debited to Machinery A/c, and depreciation at ${r}% was charged on this amount for the year. The profit of ${y} as shown by the books is ${inr(p)}. What is the correct profit of ${y}?`,
        ...num,
        explanation: [
          `The repairs should have been charged to profit: deduct ${inr(x)}.`,
          `Depreciation charged on them, ${r}% of ${inr(x)} = ${inr(dep)}, should not have been charged: add it back.`,
          `Correct profit = ${inr(p)} - ${inr(x)} + ${inr(dep)} = ${inr(p - x + dep)}.`,
        ],
        hints: ['An expense wrongly added to an asset was never charged to profit.', 'Depreciation charged on the wrong addition was an expense that should not have been there.'],
      };
    }
    const num = numeric(p + x - dep, [
      [p + x, 'Added back the cost of the machine but did not charge the depreciation that is now due on it.'],
      [p - x + dep, 'Took the correction the wrong way: the cost of the machine was charged as an expense, so the profit was understated.'],
      [p + x + dep, 'Added the depreciation instead of deducting it; depreciation on the machine is an expense of the year.'],
    ]);
    return num && {
      prompt: `${f.name} is correcting its past profits before valuing goodwill. A machine bought for ${inr(x)} on 1 April ${end - 1}, the first day of ${y}, was wrongly debited to Repairs A/c. Machinery is depreciated at ${r}% a year on cost. The profit of ${y} as shown by the books is ${inr(p)}. What is the correct profit of ${y}?`,
      ...num,
      explanation: [
        `The machine is a capital expenditure and should not have been charged to profit: add back ${inr(x)}.`,
        `Depreciation on it for the year, ${r}% of ${inr(x)} = ${inr(dep)}, has to be charged: deduct it.`,
        `Correct profit = ${inr(p)} + ${inr(x)} - ${inr(dep)} = ${inr(p + x - dep)}.`,
      ],
      hints: ['A capital expenditure charged as an expense made the profit too low.', 'Once the machine is an asset, the depreciation of the year has to be charged on it.'],
    };
  },
  verify: (q) => {
    const [x, p] = amountsIn(q.prompt);
    const dep = (x * rateIn(q.prompt)) / 100;
    return near(q.answer / 100, q.prompt.includes('debited to Machinery A/c') ? p - (x - dep) : p + (x - dep));
  },
});

/** A firm for the super profit and capitalisation questions: capital employed, normal rate and the profits they give. */
function superCase(rng: Rng, rates = [8, 10, 12, 15, 20]) {
  const r = rng.pick(rates);
  const c = rng.step(400000, 2400000, 50000);
  const normal = (c * r) / 100;
  const sp = rng.step(15000, superLimit(normal, 200000, 5000), 5000);
  return { r, c, normal, sp, avg: normal + sp };
}

const superGoodwill = numericTemplate({
  id: 'gw-super-goodwill', topicId: T, conceptId: 'gw-super-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, normal, sp, avg } = superCase(rng);
    if (sp === normal) return null;
    const n = rng.pick([2, 3, 4, 5, 2.5, 1.5]);
    const k = rng.pick([3, 4, 5]);
    const y = rng.step(50000, 400000, 10000);
    const byAssets = rng.int(0, 1) === 0;
    const byTotal = rng.int(0, 1) === 0;
    const profit = byTotal ? `The total profit of the last ${WORDS[k]} years is ${inr(avg * k)}` : `The average profit of the firm is ${inr(avg)} a year`;
    const capital = byAssets
      ? `Its assets, all of them used in the business, are ${inr(c + y)} and its outside liabilities are ${inr(y)}`
      : `Its capital employed is ${inr(c)}`;
    const num = numeric(sp * n, [
      [avg * n, 'Multiplied the whole average profit; under the super profit method only the profit above the normal is multiplied.'],
      [sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
      [normal * n, 'Multiplied the normal profit instead of the super profit.'],
      ...(byAssets ? [[(avg - ((c + y) * r) / 100) * n, 'Took the normal profit on the total assets without deducting the outside liabilities.'] as [number, string]] : []),
      ...(byTotal ? [[(avg * k - normal) * n, 'Deducted the normal profit from the total profit of all the years instead of from the average profit.'] as [number, string]] : []),
    ]);
    return num && {
      prompt: `${intro(f)} ${profit}. ${capital}. The normal rate of return in this trade is ${r}%. Find the goodwill at ${n} years' purchase of the super profit.`,
      ...num,
      explanation: [
        ...(byTotal ? [`Average profit = ${inr(avg * k)} / ${k} = ${inr(avg)}.`] : []),
        ...(byAssets ? [`Capital employed = ${inr(c + y)} - ${inr(y)} = ${inr(c)}.`] : []),
        `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `Goodwill = ${inr(sp)} x ${n} = ${inr(sp * n)}.`,
      ],
      hints: H.superP,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const years = /total profit of the last (\w+) years/.exec(q.prompt);
    const avg = years ? a[0] / WORDS.indexOf(years[1]) : a[0];
    const c = a.length === 3 ? a[1] - a[2] : a[1];
    return near(q.answer / 100, (avg - (c * rateIn(q.prompt)) / 100) * purchaseIn(q.prompt));
  },
});

const superFindAvg = numericTemplate({
  id: 'gw-super-find-avg', topicId: T, conceptId: 'gw-super-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, normal, sp, avg } = superCase(rng);
    if (sp === normal) return null;
    const n = rng.pick([2, 3, 4, 5]);
    const g = sp * n;
    const num = numeric(avg, [
      [sp, 'Gave the super profit; the average profit is the super profit plus the normal profit.'],
      [normal, 'Gave the normal profit; the firm earns the super profit over and above it.'],
      [normal + g, "Added the whole goodwill to the normal profit; one year's super profit is the goodwill divided by the years' purchase."],
      [normal - sp, 'Deducted the super profit from the normal profit instead of adding it.'],
    ]);
    const prompt = rng.pick([
      `The goodwill of ${f.name}, valued at ${n} years' purchase of the super profit, is ${inr(g)}. The capital employed is ${inr(c)} and the normal rate of return is ${r}%. What is the average profit of the firm?`,
      `${intro(f)} Its goodwill comes to ${inr(g)} at ${n} years' purchase of the super profit. Its capital employed is ${inr(c)}, on which ${r}% is the normal rate of return. Find the average profit the firm earns.`,
    ]);
    return num && {
      prompt,
      ...num,
      explanation: [
        `Super profit = Goodwill / Years' purchase = ${inr(g)} / ${n} = ${inr(sp)}.`,
        `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`,
        `Average profit = Normal profit + Super profit = ${inr(normal)} + ${inr(sp)} = ${inr(avg)}.`,
      ],
      hints: ["Work backwards: goodwill / years' purchase gives the super profit.", 'Average profit = normal profit + super profit.'],
    };
  },
  verify: (q) => {
    const [g, c] = amountsIn(q.prompt);
    return near(q.answer / 100, g / purchaseIn(q.prompt) + (c * rateIn(q.prompt)) / 100);
  },
});

const superFindRate = numericTemplate({
  id: 'gw-super-find-rate', topicId: T, conceptId: 'gw-super-profit', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([8, 10, 12, 15, 18, 20]);
    const s = rng.pick([2, 2.5, 3, 4, 5, 6, 7.5].filter((x) => x !== r));
    const c = rng.step(400000, 2400000, 100000);
    const sp = (c * s) / 100;
    const normal = (c * r) / 100;
    const avg = normal + sp;
    const n = rng.pick([2, 3, 4]);
    const g = sp * n;
    const num = numeric(
      r * 100,
      [
        [(r + s) * 100, 'Divided the whole average profit by the capital employed: that is the rate the firm actually earns, not the normal rate.'],
        [s * 100, 'Divided the super profit by the capital employed; the normal rate comes from the normal profit.'],
      ],
      1,
    );
    return num && {
      prompt: rng.pick([
        `The goodwill of ${f.name} is ${inr(g)}, being ${n} years' purchase of the super profit. The firm earns an average profit of ${inr(avg)} a year on a capital employed of ${inr(c)}. What normal rate of return has been used?`,
        `${intro(f)} Its goodwill, at ${n} years' purchase of the super profit, was valued at ${inr(g)}. Its average profit is ${inr(avg)} a year and its capital employed is ${inr(c)}. Find the normal rate of return used in the valuation.`,
        `By the super profit method, at ${n} years' purchase, the goodwill of ${f.name} comes to ${inr(g)}. The average profit is ${inr(avg)} a year and the capital employed is ${inr(c)}. What rate of return was taken as normal for this trade?`,
      ]),
      ...num,
      explanation: [
        `Super profit = ${inr(g)} / ${n} = ${inr(sp)}.`,
        `Normal profit = Average profit - Super profit = ${inr(avg)} - ${inr(sp)} = ${inr(normal)}.`,
        `Normal rate of return = ${inr(normal)} / ${inr(c)} x 100 = ${r}%.`,
      ],
      hints: ["Goodwill / years' purchase gives the super profit; take it from the average profit to get the normal profit.", 'Normal rate of return = normal profit / capital employed x 100.'],
    };
  },
  verify: (q) => {
    const [g, avg, c] = amountsIn(q.prompt);
    return near(q.answer / 100, ((avg - g / purchaseIn(q.prompt)) / c) * 100);
  },
});

const superFindCapital = numericTemplate({
  id: 'gw-super-find-capital', topicId: T, conceptId: 'gw-super-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([8, 10, 12, 15, 20]);
    const c = rng.step(400000, 2400000, 50000);
    const normal = (c * r) / 100;
    const capitalised = rng.step(100000, Math.min(800000, c * 1.5), 10000);
    const sp = (capitalised * r) / 100;
    if (sp === normal) return null;
    const avg = normal + sp;
    const n = rng.pick([2, 3, 4, 5]);
    const g = sp * n;
    const num = numeric(c, [
      [normal, 'Gave the normal profit; the capital employed is the capital on which that profit is the normal return.'],
      [c + capitalised, 'Capitalised the whole average profit; the capital employed earns only the normal profit.'],
      [capitalised, 'Capitalised the super profit instead of the normal profit.'],
    ]);
    return num && {
      prompt: `${intro(f)} Its goodwill, at ${n} years' purchase of the super profit, is ${inr(g)}. Its average profit is ${inr(avg)} a year and the normal rate of return is ${r}%. Find the capital employed in the firm.`,
      ...num,
      explanation: [
        `Super profit = ${inr(g)} / ${n} = ${inr(sp)}.`,
        `Normal profit = ${inr(avg)} - ${inr(sp)} = ${inr(normal)}.`,
        `Capital employed = Normal profit x 100 / Normal rate = ${inr(normal)} x 100 / ${r} = ${inr(c)}.`,
      ],
      hints: ['Find the super profit, then the normal profit.', 'Normal profit = capital employed x rate / 100, so capital employed = normal profit x 100 / rate.'],
    };
  },
  verify: (q) => {
    const [g, avg] = amountsIn(q.prompt);
    return near(q.answer / 100, ((avg - g / purchaseIn(q.prompt)) * 100) / rateIn(q.prompt));
  },
});

const superFindYears = numericTemplate({
  id: 'gw-super-find-years', topicId: T, conceptId: 'gw-super-profit', difficulty: 'medium', unit: 'times',
  // Version 2: hints of its own, naming the step the question turns on (goodwill divided by the super profit).
  version: 2,
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([8, 10, 12, 15, 20]);
    const c = rng.step(400000, 2400000, 200000);
    const normal = (c * r) / 100;
    // Super profit a quarter of the normal profit, or one and a half times it, so that the usual slips come out clean.
    // One and a half times only where the normal rate is 12% or less: the firm then earns at most 30% on its capital
    // employed, which a textbook firm with a strong goodwill does; at 15% or 20% it would be earning 37.5% or 50%.
    const sp = rng.int(0, 1) === 0 || r > 12 ? normal / 4 : (normal * 3) / 2;
    const avg = normal + sp;
    const n = rng.pick([2, 3, 4, 5]);
    const g = sp * n;
    const num = numeric(
      n * 100,
      [
        [(g / avg) * 100, 'Divided the goodwill by the average profit; under this method it is the super profit that is multiplied.'],
        [(g / normal) * 100, 'Divided the goodwill by the normal profit instead of by the super profit.'],
      ],
      1,
    );
    return num && {
      prompt: rng.pick([
        `${f.name} has valued its goodwill at ${inr(g)} by the super profit method. Its average profit is ${inr(avg)} a year, its capital employed is ${inr(c)} and the normal rate of return is ${r}%. At how many years' purchase of the super profit has the goodwill been valued?`,
        `${intro(f)} By the super profit method its goodwill comes to ${inr(g)}. The firm earns an average profit of ${inr(avg)} a year on a capital employed of ${inr(c)}, and the normal rate of return is ${r}%. How many years' purchase of the super profit does this goodwill represent?`,
      ]),
      ...num,
      explanation: [
        `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `Number of years' purchase = Goodwill / Super profit = ${inr(g)} / ${inr(sp)} = ${n}.`,
      ],
      hints: [
        'Goodwill here is a number of years of the super profit. Find the super profit first: average profit less the normal profit on the capital employed.',
        "Number of years' purchase = Goodwill / Super profit.",
      ],
    };
  },
  verify: (q) => {
    const [g, avg, c] = amountsIn(q.prompt);
    return near(q.answer / 100, g / (avg - (c * rateIn(q.prompt)) / 100));
  },
});

/** A firm for capitalisation: capital employed, the goodwill (a round figure) and the average profit that gives it. */
function capCase(rng: Rng) {
  const r = rng.pick([8, 10, 12, 15, 20]);
  const c = rng.step(400000, 2400000, 50000);
  // Goodwill of at most one and a half times the capital employed: the super profit is then at most that multiple of the normal profit.
  const g = rng.step(100000, Math.min(800000, c * 1.5), 10000);
  const normal = (c * r) / 100;
  const sp = (g * r) / 100;
  return { r, c, g, normal, sp, avg: normal + sp, value: c + g };
}

const capAvgGoodwill = numericTemplate({
  id: 'gw-cap-avg-goodwill', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, g, sp, avg, value } = capCase(rng);
    const y = rng.step(50000, 400000, 10000);
    const byAssets = rng.int(0, 2) > 0;
    const capital = byAssets
      ? `Its assets, which are all tangible and used in the business, are ${inr(c + y)} and its outside liabilities are ${inr(y)}`
      : `Its net assets (capital employed) are ${inr(c)}`;
    const num = numeric(g, [
      [value, 'Gave the capitalised value of the business; the capital employed (net assets) still has to be deducted.'],
      ...(byAssets ? [[value - (c + y), 'Deducted the total assets; it is the net assets, after outside liabilities, that are deducted.'] as [number, string]] : []),
      [sp, 'Stopped at the super profit; under this method the average profit is capitalised and the net assets are deducted.'],
      [(avg * r) / 100, `Took ${r}% of the average profit instead of dividing the average profit by the rate.`],
    ]);
    return num && {
      prompt: `${intro(f)} Its average profit is ${inr(avg)} a year. ${capital}. The normal rate of return is ${r}%. Find the goodwill by capitalisation of average profit.`,
      ...num,
      explanation: [
        `Capitalised value of average profit = ${inr(avg)} x 100 / ${r} = ${inr(value)}.`,
        ...(byAssets ? [`Net assets (capital employed) = ${inr(c + y)} - ${inr(y)} = ${inr(c)}.`] : []),
        `Goodwill = ${inr(value)} - ${inr(c)} = ${inr(g)}.`,
      ],
      hints: H.capital,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const c = a.length === 3 ? a[1] - a[2] : a[1];
    return near(q.answer / 100, (a[0] * 100) / rateIn(q.prompt) - c);
  },
});

const capSuperGoodwill = numericTemplate({
  id: 'gw-cap-super-goodwill', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, g, normal, sp, avg, value } = capCase(rng);
    const k = rng.pick([3, 4]);
    const byTotal = rng.int(0, 1) === 0;
    const profit = byTotal ? `earned a total profit of ${inr(avg * k)} over the last ${WORDS[k]} years` : `earns an average profit of ${inr(avg)} a year`;
    const num = numeric(g, [
      [sp, 'Stopped at the super profit; it has to be capitalised at the normal rate of return.'],
      [value, 'Capitalised the whole average profit and did not deduct the capital employed.'],
      [(sp * r) / 100, `Took ${r}% of the super profit instead of dividing the super profit by the rate.`],
      ...(byTotal ? [[((avg * k - normal) * 100) / r, 'Deducted the normal profit from the total profit of all the years instead of from the average profit.'] as [number, string]] : []),
    ]);
    return num && {
      prompt: `${f.name} ${profit}. Its capital employed is ${inr(c)} and the normal rate of return in its trade is ${r}%. Find the goodwill by capitalisation of super profit.`,
      ...num,
      explanation: [
        ...(byTotal ? [`Average profit = ${inr(avg * k)} / ${k} = ${inr(avg)}.`] : []),
        `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `Goodwill = Super profit x 100 / Normal rate = ${inr(sp)} x 100 / ${r} = ${inr(g)}.`,
      ],
      hints: H.capital,
    };
  },
  verify: (q) => {
    const [profit, c] = amountsIn(q.prompt);
    const years = /over the last (\w+) years/.exec(q.prompt);
    const avg = years ? profit / WORDS.indexOf(years[1]) : profit;
    // The other route: capitalise the average profit and deduct the capital employed.
    return near(q.answer / 100, (avg * 100) / rateIn(q.prompt) - c);
  },
});

const FICTITIOUS = ['Deferred advertisement expenditure', 'Profit and Loss A/c (debit balance)'];
const NON_TRADE = 'Investments (non-trade)';
const NOT_EMPLOYED = new Set(['Goodwill', NON_TRADE, ...FICTITIOUS]);
const LIABILITY_LABELS = ['Sundry creditors', 'Bills payable', 'Bank loan', 'Outstanding expenses'];

interface Extract {
  /** Every asset as the books show it, those not employed in the business among them. */
  assets: [string, number][];
  liabilities: [string, number][];
  /** The assets that are not part of capital employed: goodwill, non-trade investments, a fictitious asset. */
  out: [string, number][];
  trade: number;
  outside: number;
  capital: number;
}

/**
 * The assets and outside liabilities of a firm, with two or three items that do not count towards capital employed.
 * With `rate`, cash at bank is raised until the normal profit on the capital employed is a whole thousand, and the
 * fictitious asset is never a debit balance of Profit and Loss A/c: the question then lists the profits of three good
 * years beside it, and a firm that has earned them has no loss standing in its books. Null when the capital employed
 * comes out too small to be a going business.
 */
function drawExtract(rng: Rng, rate?: number): Extract | null {
  const big: [string, number][] = [
    ['Land and building', rng.step(300000, 900000, 50000)],
    ['Plant and machinery', rng.step(200000, 700000, 50000)],
  ];
  const small: [string, number][] = [
    ['Furniture', rng.step(20000, 120000, 10000)],
    ['Stock', rng.step(50000, 300000, 10000)],
    ['Sundry debtors', rng.step(40000, 250000, 10000)],
  ];
  const used: [string, number][] = [rng.pick(big), ...rng.shuffle(small).slice(0, rng.int(1, 2))];
  const cash: [string, number] = ['Cash at bank', rng.step(20000, 150000, 5000)];
  const outPool: [string, number][] = [
    ['Goodwill', rng.step(40000, 200000, 10000)],
    [NON_TRADE, rng.step(50000, 200000, 10000)],
    [rate ? FICTITIOUS[0] : rng.pick(FICTITIOUS), rng.step(10000, 60000, 5000)],
  ];
  const out = rng.shuffle(outPool).slice(0, rng.int(2, 3));
  const liabPool: [string, number][] = [
    ['Sundry creditors', rng.step(40000, 200000, 10000)],
    ['Bills payable', rng.step(10000, 80000, 10000)],
    ['Bank loan', rng.step(50000, 200000, 50000)],
    ['Outstanding expenses', rng.step(5000, 30000, 5000)],
  ];
  const liabilities = rng.shuffle(liabPool).slice(0, rng.int(2, 3));
  const outside = sum(liabilities.map((l) => l[1]));
  if (rate) for (let i = 0; i < 20 && ((sum(used.map((a) => a[1])) + cash[1] - outside) * rate) % 100000 !== 0; i++) cash[1] += 5000;
  const trade = sum(used.map((a) => a[1])) + cash[1];
  const capital = trade - outside;
  if (capital < 250000 || (rate && (capital * rate) % 100000 !== 0)) return null;
  return { assets: rng.shuffle([...used, cash, ...out]), liabilities, out, trade, outside, capital };
}
const extractText = (e: Extract): string => `Assets:\n${rows(e.assets)}\nOutside liabilities:\n${rows(e.liabilities)}`;
/** "goodwill, the non-trade investments and the deferred advertisement expenditure" */
function listOut(out: [string, number][]): string {
  const names = out.map(([label]) => (label === 'Goodwill' ? 'goodwill' : label === NON_TRADE ? 'the non-trade investments' : label === FICTITIOUS[0] ? 'the deferred advertisement expenditure' : 'the debit balance of Profit and Loss A/c'));
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
/** Capital employed re-read from the rows of a prompt: every asset that counts, less every outside liability. */
function capitalIn(prompt: string): number {
  let c = 0;
  for (const [label, v] of labelled(prompt)) {
    if (LIABILITY_LABELS.includes(label)) c -= v;
    else if (!NOT_EMPLOYED.has(label) && !/^\d{4}-\d{2}$/.test(label)) c += v;
  }
  return c;
}

const capitalEmployedAssets = numericTemplate({
  id: 'gw-capital-employed-assets', topicId: T, conceptId: 'gw-capital-employed', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const y = rng.pick([2024, 2025, 2026]);
    const e = drawExtract(rng);
    if (!e) return null;
    const all = e.trade + sum(e.out.map((o) => o[1]));
    const goodwill = e.out.find(([label]) => label === 'Goodwill')?.[1] ?? 0;
    const num = numeric(e.capital, [
      [all - e.outside, `Deducted the outside liabilities from all the assets, leaving in ${listOut(e.out)}.`],
      [e.trade, 'Left out the right assets but did not deduct the outside liabilities.'],
      ...(goodwill > 0 && e.out.length > 1 ? [[all - goodwill - e.outside, `Left out goodwill only, and kept in ${listOut(e.out.filter(([label]) => label !== 'Goodwill'))}.`] as [number, string]] : []),
      [all, 'Added up every asset and deducted nothing.'],
    ]);
    return num && {
      prompt: `${rng.pick([
        `${f.name} is finding its capital employed in order to value goodwill. On 31 March ${y} its books showed:`,
        `To value its goodwill by the super profit method, ${f.name} needs its capital employed. Its position on 31 March ${y} was:`,
        `These balances are taken from the books of ${f.name} on 31 March ${y}, the date on which its goodwill is to be valued:`,
      ])}\n${extractText(e)}\n${rng.pick(['Find the capital employed.', 'What is the capital employed for the valuation of goodwill?'])}`,
      ...num,
      explanation: [
        `Left out of the assets: ${listOut(e.out)}. They do not earn the trading profit of the firm.`,
        `Assets used in the business = ${e.assets.filter(([label]) => !NOT_EMPLOYED.has(label)).map(([, v]) => inr(v)).join(' + ')} = ${inr(e.trade)}.`,
        `Outside liabilities = ${e.liabilities.map(([, v]) => inr(v)).join(' + ')} = ${inr(e.outside)}.`,
        `Capital employed = ${inr(e.trade)} - ${inr(e.outside)} = ${inr(e.capital)}.`,
      ],
      hints: H.capEmp,
    };
  },
  verify: (q) => near(q.answer / 100, capitalIn(q.prompt)),
});

const capitalEmployedFunds = numericTemplate({
  id: 'gw-capital-employed-funds', topicId: T, conceptId: 'gw-capital-employed', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const y = rng.pick([2024, 2025, 2026]);
    const ca = rng.step(300000, 900000, 50000);
    const cb = rng.step(200000, 700000, 50000);
    const reserve = rng.step(40000, 240000, 10000);
    const pl = rng.int(0, 1) === 0 ? rng.step(20000, 120000, 10000) : 0;
    const outPool: [string, number][] = [
      ['Goodwill', rng.step(40000, 200000, 10000)],
      [NON_TRADE, rng.step(50000, 200000, 10000)],
      [FICTITIOUS[0], rng.step(10000, 60000, 5000)],
    ];
    const out = rng.shuffle(outPool).slice(0, rng.int(2, 3));
    const funds = ca + cb + reserve + pl;
    const less = sum(out.map((o) => o[1]));
    const goodwill = out.find(([label]) => label === 'Goodwill')?.[1] ?? 0;
    const fundRows: [string, number][] = [[`${f.a}'s Capital`, ca], [`${f.b}'s Capital`, cb], ['General reserve', reserve], ...(pl > 0 ? [['Profit and Loss A/c (credit balance)', pl] as [string, number]] : [])];
    const num = numeric(funds - less, [
      [funds, `Took the whole of the partners' funds and did not deduct ${listOut(out)}.`],
      [ca + cb - less, pl > 0 ? 'Left out the general reserve and the credit balance of Profit and Loss A/c, which belong to the partners.' : 'Left out the general reserve, which belongs to the partners.'],
      ...(goodwill > 0 ? [[funds - goodwill, `Deducted goodwill only; ${listOut(out.filter(([label]) => label !== 'Goodwill'))} must come off as well.`] as [number, string]] : []),
      [funds + less, 'Added the items that should have been deducted.'],
    ]);
    return num && {
      prompt: `${rng.pick([
        `${f.name} is finding its capital employed in order to value goodwill. Its Balance Sheet on 31 March ${y} included:`,
        `The goodwill of ${f.name} is to be valued by the super profit method. These items are from its Balance Sheet on 31 March ${y}:`,
        `${intro(f)} To find its capital employed from the liabilities side, these items are taken from its Balance Sheet on 31 March ${y}:`,
      ])}\nLiabilities side:\n${rows(fundRows)}\nAssets side:\n${rows(out)}\nAll the other assets are tangible and used in the business. Find the capital employed.`,
      ...num,
      explanation: [
        `Partners' funds = ${fundRows.map(([, v]) => inr(v)).join(' + ')} = ${inr(funds)}.`,
        `Less ${listOut(out)}: ${out.map(([, v]) => inr(v)).join(' + ')} = ${inr(less)}.`,
        `Capital employed = ${inr(funds)} - ${inr(less)} = ${inr(funds - less)}.`,
      ],
      hints: ["From the liabilities side: capital employed = partners' capitals + reserves and undistributed profits.", 'Then deduct goodwill, fictitious assets and non-trade investments.'],
    };
  },
  verify: (q) => {
    let c = 0;
    for (const [label, v] of labelled(q.prompt)) c += NOT_EMPLOYED.has(label) ? -v : v;
    return near(q.answer / 100, c);
  },
});

const yearsPurchase = numericTemplate({
  id: 'gw-years-purchase', topicId: T, conceptId: 'gw-average-profit', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const f = firm(rng);
    // The pairs for which both usual slips are exact to two decimals.
    const [k, n] = rng.pick([[3, 1.5], [4, 2], [4, 3], [5, 1.5], [5, 2], [5, 2.5], [5, 3], [5, 4]]);
    const ys = lastYears(rng, k);
    const p = Array.from({ length: k }, () => rng.step(50000, 320000, 10000));
    settle(p, k * 10000, rng.int(0, k - 1));
    const total = sum(p);
    const avg = total / k;
    const g = avg * n;
    const num = numeric(
      n * 100,
      [
        [k * 100, 'Gave the number of years whose profits were averaged, not the number of years of purchase.'],
        [(g / total) * 100, 'Divided the goodwill by the total profit of all the years instead of by the average profit.'],
      ],
      1,
    );
    return num && {
      prompt: `${rng.pick([
        `${f.name} valued its goodwill at ${inr(g)} on the basis of the average profit of the last ${WORDS[k]} years (years ended 31 March):`,
        `${intro(f)} Its goodwill was agreed at ${inr(g)}, worked on the average profit of the last ${WORDS[k]} years (years ended 31 March):`,
        `The partners of ${f.name} fixed the goodwill of the firm at ${inr(g)}, a certain number of times the average profit of these ${WORDS[k]} years (ended 31 March):`,
      ])}\n${yearRows(ys, p)}\nAt how many years' purchase of the average profit was the goodwill valued?`,
      ...num,
      explanation: [`Average profit = ${inr(total)} / ${k} = ${inr(avg)}.`, `Number of years' purchase = Goodwill / Average profit = ${inr(g)} / ${inr(avg)} = ${n}.`],
      hints: H.avg,
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    return near(q.answer / 100, amountsIn(q.prompt)[0] / (sum(r) / r.length));
  },
});

const missingYearProfit = numericTemplate({
  id: 'gw-missing-year-profit', topicId: T, conceptId: 'gw-average-profit', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const n = rng.pick([2, 3, 2.5, 1.5].filter((x) => x !== k));
    const ys = lastYears(rng, k);
    const p = Array.from({ length: k }, () => rng.step(50000, 320000, 10000));
    settle(p, k * 10000, rng.int(0, k - 1));
    const total = sum(p);
    const avg = total / k;
    const g = avg * n;
    const at = rng.int(0, k - 1);
    const known = total - p[at];
    const num = numeric(p[at], [
      [avg, `Gave the average profit, not the profit of ${fy(ys[at])}.`],
      [total, 'Gave the total profit of all the years; the profits of the known years still have to be deducted.'],
      [g - known, 'Deducted the known profits from the goodwill itself instead of from the total profit.'],
    ]);
    const listed = ys.map((y, i) => (i === at ? `${fy(y)}: not known` : `${fy(y)}: ${inr(p[i])}`)).join('\n');
    return num && {
      prompt: `${rng.pick([
        `The goodwill of ${f.name} was valued at ${inr(g)}, being ${n} years' purchase of the average profit of the last ${WORDS[k]} years (years ended 31 March). The record of one year is missing:`,
        `${intro(f)} Its goodwill came to ${inr(g)} at ${n} years' purchase of the average profit of the last ${WORDS[k]} years (ended 31 March). The profit of one of those years cannot be traced:`,
      ])}\n${listed}\nFind the profit of ${fy(ys[at])}.`,
      ...num,
      explanation: [
        `Average profit = Goodwill / Years' purchase = ${inr(g)} / ${n} = ${inr(avg)}.`,
        `Total profit of the ${WORDS[k]} years = ${inr(avg)} x ${k} = ${inr(total)}.`,
        `Profit of ${fy(ys[at])} = ${inr(total)} - ${inr(known)} (the known years) = ${inr(p[at])}.`,
      ],
      hints: ["Goodwill / years' purchase gives the average profit.", 'Average x number of years is the total; take away the years that are known.'],
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    return near(q.answer / 100, (amountsIn(q.prompt)[0] / purchaseIn(q.prompt)) * (r.length + 1) - sum(r));
  },
});

const capSame = mcqTemplate({
  id: 'gw-cap-same', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, g, sp, avg, value } = capCase(rng);
    const [one, two] = rng.shuffle(VALUERS).slice(0, 2);
    return choice(
      rng.pick([
        `${f.name} earns an average profit of ${inr(avg)} a year on a capital employed of ${inr(c)}. The normal rate of return is ${r}%. ${one} values the goodwill by capitalisation of average profit and ${two} by capitalisation of super profit. What do the two valuers get?`,
        `${intro(f)} Its average profit is ${inr(avg)} a year, its capital employed is ${inr(c)} and the normal rate of return is ${r}%. ${one} works out the goodwill by capitalisation of average profit; ${two} works it out by capitalisation of super profit. What does each of them arrive at?`,
      ]),
      `Both get ${inr(g)}`,
      [
        [`${one} gets ${inr(value)} and ${two} gets ${inr(g)}`, 'Took the capitalised value of the business as goodwill by the first method, without deducting the capital employed.'],
        [`${one} gets ${inr(g)} and ${two} gets ${inr(sp)}`, 'Left the super profit as it is under the second method instead of capitalising it at the normal rate.'],
        [`${one} gets ${inr(value)} and ${two} gets ${inr(sp)}`, 'Stopped one step short in both methods: the capital employed was not deducted, and the super profit was not capitalised.'],
        [`${one} gets ${inr(g)} and ${two} gets ${inr((sp * r) / 100)}`, `Took ${r}% of the super profit under the second method instead of dividing the super profit by the rate.`],
      ],
      `Capitalisation of average profit: ${inr(avg)} x 100 / ${r} = ${inr(value)}; less capital employed ${inr(c)} = ${inr(g)}. Capitalisation of super profit: (${inr(avg)} - ${inr((c * r) / 100)}) x 100 / ${r} = ${inr(sp)} x 100 / ${r} = ${inr(g)}. The two methods always agree.`,
      H.capital,
    );
  },
  verify: (q) => {
    const [avg, c] = amountsIn(q.prompt);
    const r = rateIn(q.prompt);
    const byAverage = (avg * 100) / r - c;
    const bySuper = ((avg - (c * r) / 100) * 100) / r;
    return near(byAverage, bySuper) && optionText(q) === `Both get ${inr(byAverage)}`;
  },
});

const capFindTerm = numericTemplate({
  id: 'gw-cap-find-term', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, g, normal, sp, avg, value } = capCase(rng);
    if (rng.int(0, 1) === 0) {
      const num = numeric(avg, [
        [sp, 'Took the normal rate on the goodwill alone: that gives only the super profit.'],
        [normal, 'Took the normal rate on the capital employed alone: that gives only the normal profit.'],
        [((c - g) * r) / 100, 'Deducted the goodwill from the capital employed instead of adding it to get the value of the business.'],
        [value, 'Gave the capitalised value of the business, not the profit that it is the capitalised value of.'],
      ]);
      return num && {
        prompt: `The goodwill of ${f.name}, found by capitalisation of average profit, is ${inr(g)}. The capital employed (net assets) is ${inr(c)} and the normal rate of return is ${r}%. What is the average profit of the firm?`,
        ...num,
        explanation: [
          `Capitalised value of the business = Capital employed + Goodwill = ${inr(c)} + ${inr(g)} = ${inr(value)}.`,
          `Average profit = Capitalised value x Normal rate / 100 = ${inr(value)} x ${r} / 100 = ${inr(avg)}.`,
        ],
        hints: ['Goodwill = capitalised value - capital employed, so capitalised value = capital employed + goodwill.', 'The average profit is the normal rate on the capitalised value.'],
      };
    }
    const num = numeric(c, [
      [value, 'Gave the capitalised value of the business; the goodwill still has to be taken off it.'],
      [value + g, 'Added the goodwill to the capitalised value instead of deducting it.'],
      [(avg * r) / 100, `Took ${r}% of the average profit instead of dividing the average profit by the rate.`],
    ]);
    return num && {
      prompt: `${f.name} earns an average profit of ${inr(avg)} a year. By capitalisation of average profit at the normal rate of return of ${r}%, its goodwill comes to ${inr(g)}. What is the capital employed (net assets) of the firm?`,
      ...num,
      explanation: [
        `Capitalised value of average profit = ${inr(avg)} x 100 / ${r} = ${inr(value)}.`,
        `Capital employed = Capitalised value - Goodwill = ${inr(value)} - ${inr(g)} = ${inr(c)}.`,
      ],
      hints: H.capital,
    };
  },
  verify: (q) => {
    const [x, y] = amountsIn(q.prompt);
    const r = rateIn(q.prompt);
    return q.prompt.startsWith('The goodwill') ? near(q.answer / 100, ((x + y) * r) / 100) : near(q.answer / 100, (x * 100) / r - y);
  },
});

const capFindRate = numericTemplate({
  id: 'gw-cap-find-rate', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([8, 10, 12, 15, 16, 20]);
    const c = rng.step(400000, 2400000, 200000);
    const part = rng.pick([4, 5, 2, 10]);
    const g = c / part;
    const value = c + g;
    const avg = (value * r) / 100;
    const num = numeric(
      r * 100,
      [
        [(avg / c) * 10000, 'Divided the average profit by the capital employed alone: that is the rate the firm actually earns, not the normal rate.'],
        [(avg / (c - g)) * 10000, 'Deducted the goodwill from the capital employed instead of adding it to get the value of the business.'],
        [(g / c) * 10000, 'Divided the goodwill by the capital employed; the rate is the average profit as a percentage of the capitalised value.'],
      ],
      1,
    );
    return num && {
      prompt: rng.pick([
        `${f.name} earns an average profit of ${inr(avg)} a year on a capital employed (net assets) of ${inr(c)}. By capitalisation of average profit its goodwill was found to be ${inr(g)}. What normal rate of return was used?`,
        `${intro(f)} Its average profit is ${inr(avg)} a year and its capital employed (net assets) is ${inr(c)}. Its goodwill, by capitalisation of average profit, came to ${inr(g)}. Find the normal rate of return used.`,
      ]),
      ...num,
      explanation: [
        `Capitalised value of the business = Capital employed + Goodwill = ${inr(c)} + ${inr(g)} = ${inr(value)}.`,
        `Normal rate of return = Average profit / Capitalised value x 100 = ${inr(avg)} / ${inr(value)} x 100 = ${r}%.`,
      ],
      hints: ['Capitalised value = capital employed + goodwill.', 'Capitalised value = average profit x 100 / rate, so rate = average profit / capitalised value x 100.'],
    };
  },
  verify: (q) => {
    const [avg, c, g] = amountsIn(q.prompt);
    return near(q.answer / 100, (avg / (c + g)) * 100);
  },
});

// ===============================================================================================================
// COMPLEX
// ===============================================================================================================

interface Delta {
  /** The year it changes, counted from the first year listed. */
  at: number;
  /** The change to that year's profit: added when positive, deducted when negative. */
  by: number;
  why: string;
}
interface Adjustment {
  kind: 'loss' | 'gain' | 'stock' | 'omitted' | 'capitalised';
  text: string;
  deltas: Delta[];
}
type AdjustmentKind = Adjustment['kind'];

/** One thing found in the past books, said for the student and as the changes it makes to the yearly profits. */
function drawAdjustment(rng: Rng, kind: AdjustmentKind, ys: number[], stockAt?: number): Adjustment {
  const k = ys.length;
  const y = (i: number): string => fy(ys[i]);
  if (kind === 'loss') {
    const at = rng.int(0, k - 1);
    const x = rng.step(10000, 60000, 5000);
    return { kind, text: rng.pick(ABNORMAL_LOSSES)(inr(x), y(at)), deltas: [{ at, by: x, why: 'abnormal loss added back' }] };
  }
  if (kind === 'gain') {
    const at = rng.int(0, k - 1);
    const x = rng.step(10000, 60000, 5000);
    return { kind, text: rng.pick(ABNORMAL_GAINS)(inr(x), y(at)), deltas: [{ at, by: -x, why: 'abnormal gain taken out' }] };
  }
  if (kind === 'stock') {
    const at = stockAt ?? rng.int(0, k - 1);
    const over = rng.int(0, 1) === 0;
    const x = rng.step(5000, 40000, 5000);
    const word = over ? 'overvalued' : 'undervalued';
    const deltas: Delta[] = [{ at, by: over ? -x : x, why: `closing stock ${word}` }];
    if (at + 1 < k) deltas.push({ at: at + 1, by: over ? x : -x, why: `opening stock ${word}` });
    return { kind, text: `The closing stock of ${y(at)} was ${word} by ${inr(x)}.`, deltas };
  }
  if (kind === 'omitted') {
    const at = rng.int(0, k - 1);
    const x = rng.step(5000, 40000, 5000);
    return { kind, text: `Rent of ${inr(x)} for the godown for ${y(at)} was left out of the books altogether.`, deltas: [{ at, by: -x, why: 'rent omitted, now charged' }] };
  }
  const r = rng.pick([10, 20]);
  const x = rng.step(20000, 100000, 10000);
  return {
    kind,
    text: `In ${y(k - 1)}, repairs of ${inr(x)} to machinery were wrongly debited to Machinery A/c, and depreciation at ${r}% was charged on this amount for the year.`,
    deltas: [
      { at: k - 1, by: -x, why: 'repairs charged to profit' },
      { at: k - 1, by: (x * r) / 100, why: 'depreciation on the repairs added back' },
    ],
  };
}

const deltasAt = (adjustments: Adjustment[], at: number): Delta[] => adjustments.flatMap((a) => a.deltas).filter((d) => d.at === at);
const adjusted = (p: number[], adjustments: Adjustment[]): number[] => p.map((v, i) => v + sum(deltasAt(adjustments, i).map((d) => d.by)));
/** The working of the normal profit of each year: "2024-25: ₹1,20,000 + ₹30,000 (abnormal loss added back) = ₹1,50,000." */
function yearWorking(ys: number[], p: number[], adjustments: Adjustment[]): string[] {
  return ys.map((y, i) => {
    const ds = deltasAt(adjustments, i);
    if (ds.length === 0) return `${fy(y)}: ${inr(p[i])} (no adjustment).`;
    return `${fy(y)}: ${inr(p[i])} ${ds.map((d) => `${d.by > 0 ? '+' : '-'} ${inr(Math.abs(d.by))} (${d.why})`).join(' ')} = ${inr(p[i] + sum(ds.map((d) => d.by)))}.`;
  });
}
const lettered = (items: string[]): string => items.map((t, i) => `(${'abcdef'[i]}) ${t}`).join('\n');

/** What an adjusted-profit question was made from, for its `verify`: the changes to the years, and what else it used. */
interface KeptAdjusted {
  deltas: Delta[];
  pay: number;
  n: number;
}
const keptAdjusted = keepFor<KeptAdjusted>();

const avgAdjusted = numericTemplate({
  id: 'gw-avg-adjusted', topicId: T, conceptId: 'gw-adjustments', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const n = rng.pick([2, 3, 2.5]);
    const ys = lastYears(rng, k);
    const withPay = rng.int(0, 1) === 0;
    const kinds = rng.shuffle<AdjustmentKind>(['loss', 'gain', 'stock', 'omitted', 'capitalised']).slice(0, withPay ? rng.int(2, 3) : rng.int(3, 4));
    const adjustments = kinds.map((kind) => drawAdjustment(rng, kind, ys));
    const pay = withPay ? rng.step(24000, 96000, 12000) : 0;
    const p = Array.from({ length: k }, () => rng.step(120000, 400000, 5000));
    const deltas = adjustments.flatMap((a) => a.deltas);
    settle(p, k * 2000, rng.int(0, k - 1), sum(deltas.map((d) => d.by)));
    const adj = adjusted(p, adjustments);
    if (adj.some((v) => v <= 0)) return null;
    const total = sum(adj);
    const avg = total / k - pay;
    if (avg <= 0) return null;
    const next = adjustments.find((a) => a.kind === 'stock')?.deltas[1];
    const loss = adjustments.find((a) => a.kind === 'loss')?.deltas[0];
    const dep = adjustments.find((a) => a.kind === 'capitalised')?.deltas[1];
    const num = numeric(avg * n, [
      [(sum(p) / k - pay) * n, 'Averaged the profits as the books show them and made none of the corrections to the years.'],
      ...(next ? [[((total - next.by) / k - pay) * n, 'Corrected the stock only in the year it was wrongly valued; the next year opens with the same wrong stock and moves the other way.'] as [number, string]] : []),
      ...(loss ? [[((total - 2 * loss.by) / k - pay) * n, 'Deducted the abnormal loss a second time instead of adding it back.'] as [number, string]] : []),
      ...(dep ? [[((total - dep.by) / k - pay) * n, 'Charged the repairs but did not add back the depreciation wrongly charged on them.'] as [number, string]] : []),
      ...(withPay ? [[(total / k) * n, "Did not deduct the remuneration of the partners from the average profit."] as [number, string]] : []),
      [avg, "Stopped at the average normal profit and did not multiply by the number of years' purchase."],
    ]);
    const items = [...adjustments.map((a) => a.text), ...(withPay ? [`The profits are before charging anything for the work of the partners; a fair remuneration for it is ${inr(pay)} a year in all.`] : [])];
    const lead = rng.pick([
      `${f.name} values its goodwill at ${n} years' purchase of the average normal profit of the last ${WORDS[k]} years${withPay ? ', after a fair remuneration to the partners' : ''}. The profits shown by the books (years ended 31 March) were:`,
      `The partners of ${f.name} agree that goodwill is ${n} years' purchase of the average profit of the last ${WORDS[k]} years, the profits being first corrected for the points below${withPay ? ' and a fair remuneration being allowed to the partners' : ''}. The profits shown by the books (years ended 31 March) were:`,
    ]);
    const prompt = `${lead}\n${yearRows(ys, p)}\n${rng.pick(['The following were found:', 'On going through the books, these points were noticed:'])}\n${lettered(items)}\nFind the value of the goodwill.`;
    keptAdjusted.keep(prompt, { deltas, pay, n });
    return num && {
      prompt,
      ...num,
      explanation: [
        ...yearWorking(ys, p, adjustments),
        `Total of the normal profits = ${inr(total)}; average = ${inr(total)} / ${k} = ${inr(total / k)}.`,
        ...(withPay ? [`Less remuneration of the partners: ${inr(total / k)} - ${inr(pay)} = ${inr(avg)}.`] : []),
        `Goodwill = ${inr(avg)} x ${n} = ${inr(avg * n)}.`,
      ],
      hints: H.adjust,
    };
  },
  verify: (q) => {
    const kept = keptAdjusted.of(q.prompt);
    const r = rowsIn(q.prompt);
    // In one sum, not year by year: every change is added to the total shown by the books.
    return kept !== undefined && purchaseIn(q.prompt) === kept.n && near(q.answer / 100, ((sum(r) + sum(kept.deltas.map((d) => d.by))) / r.length - kept.pay) * kept.n);
  },
});

const weightedAdjusted = numericTemplate({
  id: 'gw-weighted-adjusted', topicId: T, conceptId: 'gw-weighted', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const n = rng.pick([2, 3]);
    const ys = lastYears(rng, k);
    const ws = weightsOf(k);
    const total = sum(ws);
    // The stock error is never in the last year, so it always moves two years, which carry different weights.
    const stock = drawAdjustment(rng, 'stock', ys, rng.int(0, k - 2));
    const others = rng.shuffle<AdjustmentKind>(['loss', 'gain', 'capitalised', 'omitted']).slice(0, 2).map((kind) => drawAdjustment(rng, kind, ys));
    const adjustments = rng.shuffle([stock, ...others]);
    const deltas = adjustments.flatMap((a) => a.deltas);
    const p = trendProfits(rng, k).map((v) => v + 60000);
    const shift = sum(deltas.map((d) => d.by * ws[d.at]));
    p[0] += (total * 1000 - ((weighted(p, ws) + shift) % (total * 1000))) % (total * 1000);
    const adj = adjusted(p, adjustments);
    if (adj.some((v) => v <= 0)) return null;
    const products = weighted(adj, ws);
    const avg = products / total;
    const next = stock.deltas[1];
    const num = numeric(avg * n, [
      [(sum(adj) / k) * n, 'Corrected the profits but took their simple average, ignoring the weights.'],
      [(weighted(p, ws) / total) * n, 'Applied the weights to the profits as the books show them, without the corrections.'],
      [((products - next.by * ws[next.at]) / total) * n, 'Corrected the stock only in the year it was wrongly valued; the next year opens with the same wrong stock and moves the other way.'],
      [avg, "Stopped at the weighted average profit and did not multiply by the number of years' purchase."],
      [(products / k) * n, `Divided the total of the products by ${k}, the number of years, instead of by ${total}, the total of the weights.`],
    ]);
    const lead = rng.pick([
      `${f.name} values its goodwill at ${n} years' purchase of the weighted average of the normal profits of the last ${WORDS[k]} years, with weights of ${weightsText(k)} for the years in order (the latest year has the highest weight). The profits shown by the books (years ended 31 March) were:`,
      `The goodwill of ${f.name} is ${n} years' purchase of the weighted average profit of the last ${WORDS[k]} years. The profits are first corrected for the points below, and then given weights of ${weightsText(k)} from the earliest year to the latest. The profits shown by the books (years ended 31 March) were:`,
    ]);
    const prompt = `${lead}\n${yearRows(ys, p)}\n${rng.pick(['The following were found:', 'On going through the books, these points were noticed:'])}\n${lettered(adjustments.map((a) => a.text))}\nFind the value of the goodwill.`;
    keptAdjusted.keep(prompt, { deltas, pay: 0, n });
    return num && {
      prompt,
      ...num,
      explanation: [
        ...yearWorking(ys, p, adjustments),
        `Products = ${productsText(adj, ws)} = ${inr(products)}.`,
        `Weighted average profit = ${inr(products)} / ${total} = ${inr(avg)}.`,
        `Goodwill = ${inr(avg)} x ${n} = ${inr(avg * n)}.`,
      ],
      hints: [H.adjust[1], H.weighted[0]],
    };
  },
  verify: (q) => {
    const kept = keptAdjusted.of(q.prompt);
    const r = rowsIn(q.prompt);
    if (kept === undefined) return false;
    // The weighted total of the books, plus every change at the weight of its year.
    const products = r.reduce((acc, p, i) => acc + p * (i + 1), 0) + sum(kept.deltas.map((d) => d.by * (d.at + 1)));
    return near(q.answer / 100, (products / ((r.length * (r.length + 1)) / 2)) * purchaseIn(q.prompt));
  },
});

const superFull = numericTemplate({
  id: 'gw-super-full', topicId: T, conceptId: 'gw-super-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([10, 12, 15, 20]);
    const n = rng.pick([2, 3, 4]);
    const e = drawExtract(rng, r);
    if (!e) return null;
    const ys = lastYears(rng, 3);
    const normal = (e.capital * r) / 100;
    const sp = rng.step(15000, superLimit(normal, 150000, 5000), 5000);
    const avg = normal + sp;
    const item = drawAdjustment(rng, rng.pick<AdjustmentKind>(['loss', 'gain']), ys);
    const d = item.deltas[0];
    // Three normal profits around the average, then the abnormal item is put back into its year as the books show it.
    const up = rng.step(-30000, 30000, 5000);
    const down = rng.step(-30000, 30000, 5000);
    const adj = [avg + up, avg + down, avg - up - down];
    const p = adj.map((v, i) => (i === d.at ? v - d.by : v));
    if (p.some((v) => v <= 0)) return null;
    const all = e.trade + sum(e.out.map((o) => o[1]));
    const num = numeric(sp * n, [
      [(avg - ((all - e.outside) * r) / 100) * n, `Took the normal profit on all the assets less liabilities, without leaving out ${listOut(e.out)}.`],
      [(sum(p) / 3 - normal) * n, `Averaged the profits as the books show them, without correcting the abnormal ${d.by > 0 ? 'loss' : 'gain'}.`],
      [(avg - (e.trade * r) / 100) * n, 'Took the normal profit on the assets without deducting the outside liabilities.'],
      [avg * n, 'Multiplied the whole average profit; only the profit above the normal is multiplied.'],
      [sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
    ]);
    const lead = rng.pick([
      `${f.name} values its goodwill at ${n} years' purchase of the super profit. The normal rate of return is ${r}%. The profits of the last three years (ended 31 March) were:`,
      `The goodwill of ${f.name} is to be ${n} years' purchase of its super profit, taking ${r}% as the normal rate of return on capital employed. The books show these profits for the last three years (ended 31 March):`,
    ]);
    // Investments left out of the capital employed take their income out of the profit with them: say that there is none to take out.
    const noIncome = e.out.some(([label]) => label === NON_TRADE) ? ' No income from the non-trade investments is included in these profits.' : '';
    const prompt = `${lead}\n${yearRows(ys, p)}\n${item.text}${noIncome}\nOn 31 March ${ys[2]} the books showed:\n${extractText(e)}\nFind the value of the goodwill.`;
    keptAdjusted.keep(prompt, { deltas: item.deltas, pay: 0, n });
    return num && {
      prompt,
      ...num,
      explanation: [
        ...yearWorking(ys, p, [item]).filter((line) => !line.includes('no adjustment')),
        `Average normal profit = (${adj.map(inr).join(' + ')}) / 3 = ${inr(avg)}.`,
        `Capital employed = assets used in the business ${inr(e.trade)} (leaving out ${listOut(e.out)}) - outside liabilities ${inr(e.outside)} = ${inr(e.capital)}.`,
        `Normal profit = ${inr(e.capital)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `Goodwill = ${inr(sp)} x ${n} = ${inr(sp * n)}.`,
      ],
      hints: [H.capEmp[1], H.superP[1]],
    };
  },
  verify: (q) => {
    const kept = keptAdjusted.of(q.prompt);
    const r = rowsIn(q.prompt);
    if (kept === undefined || r.length !== 3) return false;
    const avg = (sum(r) + sum(kept.deltas.map((d) => d.by))) / 3;
    return near(q.answer / 100, (avg - (capitalIn(q.prompt) * rateIn(q.prompt)) / 100) * purchaseIn(q.prompt));
  },
});

const capBalanceSheet = numericTemplate({
  id: 'gw-cap-balance-sheet', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const y = rng.pick([2024, 2025, 2026]);
    const r = rng.pick([10, 12, 15, 20]);
    const bondRate = rng.pick([6, 8, 9, 10]);
    const ca = rng.step(400000, 1000000, 50000);
    const cb = rng.step(300000, 800000, 50000);
    const reserve = rng.step(60000, 240000, 10000);
    const inBooks = rng.step(40000, 160000, 10000);
    const bonds = rng.step(60000, 300000, 60000);
    const funds = ca + cb + reserve;
    const c = funds - inBooks - bonds;
    // Goodwill of at most one and a half times the capital employed, as in capCase.
    const g = rng.step(100000, Math.min(500000, c * 1.5), 10000);
    const income = (bonds * bondRate) / 100;
    const avg = ((c + g) * r) / 100;
    const shown = avg + income;
    const bondLabel = `${bondRate}% Government bonds (non-trade investments)`;
    const num = numeric(g, [
      [(shown * 100) / r - c, 'Left the interest on the non-trade investments in the profit; when the investments are left out of capital employed, their income is left out of the profit too.'],
      [g - inBooks, 'Left the goodwill appearing in the books inside the capital employed.'],
      [g - bonds, 'Took the interest out of the profit but left the non-trade investments inside the capital employed.'],
      [(shown * 100) / r - funds, "Capitalised the profit as given and deducted the whole of the partners' funds, with no adjustment for goodwill or the non-trade investments."],
      [c + g, 'Gave the capitalised value of the business; the capital employed still has to be deducted.'],
    ]);
    return num && {
      prompt: `${rng.pick([
        `${f.name} values its goodwill by capitalisation of average profit at a normal rate of return of ${r}%. Its average profit is ${inr(shown)} a year, which includes a full year's interest on the Government bonds shown below. These items are from its Balance Sheet on 31 March ${y}:`,
        `The goodwill of ${f.name} is to be found by capitalising its average profit at ${r}%, the normal rate of return. The average profit is ${inr(shown)} a year; a full year's interest on the Government bonds shown below is included in it. These items are from the Balance Sheet on 31 March ${y}:`,
      ])}\nLiabilities side:\n${rows([[`${f.a}'s Capital`, ca], [`${f.b}'s Capital`, cb], ['General reserve', reserve]])}\nAssets side:\n${rows([['Goodwill (in the books)', inBooks], [bondLabel, bonds]])}\nAll the other assets are tangible and used in the business, and there are no fictitious assets. Find the value of the goodwill.`,
      ...num,
      explanation: [
        `Interest on the bonds = ${bondRate}% of ${inr(bonds)} = ${inr(income)}. It is not a trading income: average profit from the business = ${inr(shown)} - ${inr(income)} = ${inr(avg)}.`,
        `Capitalised value = ${inr(avg)} x 100 / ${r} = ${inr(c + g)}.`,
        `Capital employed = ${inr(ca)} + ${inr(cb)} + ${inr(reserve)} - ${inr(inBooks)} (goodwill in the books) - ${inr(bonds)} (non-trade investments) = ${inr(c)}.`,
        `Goodwill = ${inr(c + g)} - ${inr(c)} = ${inr(g)}.`,
      ],
      hints: ['Non-trade investments are left out of capital employed, and so their income is left out of the profit.', 'Goodwill already in the books is not part of capital employed.'],
    };
  },
  verify: (q) => {
    const m = labelled(q.prompt);
    const shown = amountsIn(q.prompt)[0];
    let c = 0;
    let income = 0;
    for (const [label, v] of m) {
      const bond = /^(\d+)% Government bonds/.exec(label);
      if (bond) {
        c -= v;
        income = (v * Number(bond[1])) / 100;
      } else c += label.startsWith('Goodwill') ? -v : v;
    }
    return near(q.answer / 100, ((shown - income) * 100) / rateIn(q.prompt) - c);
  },
});

const compareMethods = numericTemplate({
  id: 'gw-compare-methods', topicId: T, conceptId: 'gw-capitalisation', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const { r, c, g, normal, sp, avg, value } = capCase(rng);
    const [one, two] = rng.shuffle(VALUERS).slice(0, 2);
    const base = `${f.name} earns an average profit of ${inr(avg)} a year on a capital employed of ${inr(c)}. The normal rate of return is ${r}%.`;
    if (rng.int(0, 1) === 0) {
      const n = rng.pick([2, 3, 4]);
      const byYears = sp * n;
      const num = numeric(g - byYears, [
        [g, 'Gave the goodwill by capitalisation of super profit, not the difference between the two valuations.'],
        [byYears, `Gave the goodwill at ${n} years' purchase of the super profit, not the difference between the two valuations.`],
        [value - byYears, 'Capitalised the whole average profit and did not deduct the capital employed.'],
        [g - avg * n, 'Multiplied the whole average profit by the years of purchase instead of the super profit.'],
      ]);
      return num && {
        prompt: `${base} ${one} values the goodwill by capitalisation of super profit; ${two} values it at ${n} years' purchase of the super profit. By how much is the first valuation higher than the second?`,
        ...num,
        explanation: [
          `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}; super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
          `Capitalisation of super profit: ${inr(sp)} x 100 / ${r} = ${inr(g)}.`,
          `${n} years' purchase of super profit: ${inr(sp)} x ${n} = ${inr(byYears)}.`,
          `Difference = ${inr(g)} - ${inr(byYears)} = ${inr(g - byYears)}.`,
        ],
        hints: H.capital,
      };
    }
    const n1 = rng.pick([2, 3]);
    const n2 = rng.pick([3, 4, 5].filter((x) => x > n1));
    const byAvg = avg * n1;
    const bySuper = sp * n2;
    if (byAvg <= bySuper) return null;
    const num = numeric(byAvg - bySuper, [
      [byAvg, `Gave the goodwill at ${n1} years' purchase of the average profit, not the difference between the two valuations.`],
      [bySuper, `Gave the goodwill at ${n2} years' purchase of the super profit, not the difference between the two valuations.`],
      [byAvg - normal * n2, 'Used the normal profit in place of the super profit in the second valuation.'],
      [byAvg - sp * n1, `Multiplied the super profit by ${n1}, the years of the first valuation, instead of by ${n2}.`],
    ]);
    return num && {
      prompt: `${base} ${one} values the goodwill at ${n1} years' purchase of the average profit; ${two} values it at ${n2} years' purchase of the super profit. By how much is the first valuation higher than the second?`,
      ...num,
      explanation: [
        `${n1} years' purchase of average profit: ${inr(avg)} x ${n1} = ${inr(byAvg)}.`,
        `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}; super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `${n2} years' purchase of super profit: ${inr(sp)} x ${n2} = ${inr(bySuper)}.`,
        `Difference = ${inr(byAvg)} - ${inr(bySuper)} = ${inr(byAvg - bySuper)}.`,
      ],
      hints: H.superP,
    };
  },
  verify: (q) => {
    const [avg, c] = amountsIn(q.prompt);
    const r = rateIn(q.prompt);
    const sp = avg - (c * r) / 100;
    const years = [...q.prompt.matchAll(/(\d+) years' purchase/g)].map((m) => Number(m[1]));
    return years.length === 1 ? near(q.answer / 100, (sp * 100) / r - sp * years[0]) : near(q.answer / 100, avg * years[0] - sp * years[1]);
  },
});

const superIndirect = numericTemplate({
  id: 'gw-super-indirect', topicId: T, conceptId: 'gw-super-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const y = rng.pick([2024, 2025, 2026]);
    const { r, c, normal, sp, avg } = superCase(rng, [10, 12, 15, 20]);
    const n = rng.pick([2, 3, 4]);
    const k = rng.pick([3, 4, 5]);
    const pay = rng.step(60000, 240000, 12000);
    const before = avg + pay;
    const inBooks = rng.step(40000, 200000, 20000);
    const liabilities = rng.step(100000, 500000, 10000);
    const assets = c + inBooks + liabilities;
    const ratio = rng.pick(['3:2', '2:1', '5:3', '3:1']);
    const num = numeric(sp * n, [
      [(avg - ((c + inBooks) * r) / 100) * n, 'Left the goodwill appearing in the books among the assets when finding the capital employed.'],
      [(before - normal) * n, 'Did not deduct the remuneration of the partners from the average profit.'],
      [(avg - ((assets - inBooks) * r) / 100) * n, 'Left out the goodwill but did not deduct the outside liabilities.'],
      [avg * n, 'Multiplied the whole average profit; only the profit above the normal is multiplied.'],
      [sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
    ]);
    return num && {
      prompt: `${rng.pick([`${f.a} and ${f.b} share the profits of ${f.name} in the ratio ${ratio}.`, `${f.name} was set up in ${rng.int(2005, 2016)} by ${f.a} and ${f.b}, who share profits in the ratio ${ratio}.`])} The total profit of the last ${WORDS[k]} years, before charging anything for the work of the partners, is ${inr(before * k)}; a fair remuneration for that work is ${inr(pay)} a year in all. On 31 March ${y} the assets were ${inr(assets)}, all of them tangible and used in the business except goodwill of ${inr(inBooks)} appearing in the books, and the outside liabilities were ${inr(liabilities)}. ${rng.pick([`Firms in this trade normally earn ₹${r} a year on every ₹100 of capital employed.`, `A return of ₹${r} a year on every ₹100 of capital employed is normal in this trade.`])} Find the goodwill at ${n} years' purchase of the super profit.`,
      ...num,
      explanation: [
        `Average profit = ${inr(before * k)} / ${k} = ${inr(before)}; after remuneration, ${inr(before)} - ${inr(pay)} = ${inr(avg)}.`,
        `Capital employed = ${inr(assets)} - ${inr(inBooks)} (goodwill) - ${inr(liabilities)} = ${inr(c)}.`,
        `Normal rate of return = ${r}%; normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `Goodwill = ${inr(sp)} x ${n} = ${inr(sp * n)}. The profit-sharing ratio plays no part in the valuation.`,
      ],
      hints: ['Find the average profit after remuneration, and the capital employed without the goodwill in the books.', H.superP[1]],
    };
  },
  verify: (q) => {
    const [total, pay, assets, inBooks, liabilities, rate] = amountsIn(q.prompt);
    const k = WORDS.indexOf(/last (\w+) years/.exec(q.prompt)?.[1] ?? '');
    return near(q.answer / 100, (total / k - pay - ((assets - inBooks - liabilities) * rate) / 100) * purchaseIn(q.prompt));
  },
});

const stockAverageEffect = mcqTemplate({
  id: 'gw-stock-average-effect', topicId: T, conceptId: 'gw-adjustments', difficulty: 'complex',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const ys = lastYears(rng, k);
    const isWeighted = rng.int(0, 1) === 0;
    const at = rng.int(0, k - 1);
    const last = at === k - 1;
    const over = rng.int(0, 1) === 0;
    const total = sum(weightsOf(k));
    const x = (k === 3 ? 6000 : 20000) * rng.int(1, 5);
    const word = over ? 'overvalued' : 'undervalued';
    // Overvalued closing stock: its own year falls by x on correction, the next year (if it is one of the years) rises by x.
    const sign = over ? -1 : 1;
    const change = isWeighted ? (sign * x * (at + 1) + (last ? 0 : -sign * x * (at + 2))) / total : last ? (sign * x) / k : 0;
    const say = (v: number): string => (v === 0 ? 'It does not change' : `It ${v > 0 ? 'rises' : 'falls'} by ${inr(Math.abs(v))}`);
    const wrong: [number, string][] = isWeighted
      ? [
          [0, last ? 'Expected the next year to cancel the error, but the next year is not one of the years averaged.' : 'True of a simple average only; here the two years that change carry different weights.'],
          [(sign * x * (at + 1)) / total, 'Corrected only the year in which the stock was wrongly valued.'],
          [-change, last ? `Took the correction the wrong way: ${word} closing stock ${over ? 'overstates' : 'understates'} the profit of its year.` : 'Took the net effect the wrong way round: the later year carries the higher weight.'],
          [(sign * x) / k, 'Worked a simple average: divided the correction by the number of years and ignored the weights.'],
          [(sign * x) / total, 'Gave the year of the error a weight of 1, whatever its place among the years.'],
        ]
      : last
        ? [
            [0, 'Expected the next year to cancel the error, but the next year is not one of the years averaged.'],
            [-change, `Took the correction the wrong way: ${word} closing stock ${over ? 'overstates' : 'understates'} the profit of its year.`],
            [(2 * sign * x) / k, 'Counted the correction twice: once for this year and once for a next year that is not among the years averaged.'],
            [sign * x, 'Changed the average by the whole amount; an average changes only by its share of a correction.'],
          ]
        : [
            [(sign * x) / k, 'Corrected only the year of the error and forgot that the next year opens with the same wrong stock.'],
            [(-sign * x) / k, 'Corrected only the following year and left the year of the error as it was.'],
            [(2 * sign * x) / k, 'Moved both years the same way; the year of the error and the next year move in opposite directions.'],
            [sign * x, 'Changed the average by the whole amount; an average changes only by its share of a correction.'],
          ];
    const basis = isWeighted ? `the weighted average profit (weights ${weightsText(k)}, the latest year the highest)` : 'the simple average profit';
    return choice(
      `${f.name} values goodwill on ${basis} of the ${WORDS[k]} years ${fy(ys[0])} to ${fy(ys[k - 1])}. It is now found that the closing stock of ${fy(ys[at])} was ${word} by ${inr(x)}. Once the profits are corrected, what happens to the ${isWeighted ? 'weighted average' : 'average'} profit?`,
      say(change),
      wrong.map(([v, why]): [string, string] => [say(v), why]),
      last
        ? `${fy(ys[at])} is the last of the years, so only its own profit changes: it ${over ? 'falls' : 'rises'} by ${inr(x)}${isWeighted ? ` and carries a weight of ${k}, so the weighted average moves by ${inr(x)} x ${k} / ${total} = ${inr(Math.abs(change))}` : `, and the average moves by ${inr(x)} / ${k} = ${inr(Math.abs(change))}`}.`
        : `The profit of ${fy(ys[at])} ${over ? 'falls' : 'rises'} by ${inr(x)} and that of ${fy(ys[at + 1])} ${over ? 'rises' : 'falls'} by ${inr(x)}, because the same stock opens the next year. ${isWeighted ? `Their weights are ${at + 1} and ${at + 2}, so the total of the products moves by ${inr(x)} and the weighted average by ${inr(x)} / ${total} = ${inr(Math.abs(change))}.` : 'In a simple average the two changes cancel.'}`,
      H.adjust,
    );
  },
  verify: (q) => {
    const m = /years (\d{4})-\d{2} to (\d{4})-\d{2}\. It is now found that the closing stock of (\d{4})-\d{2} was (over|under)valued by ₹([\d,]+)/.exec(q.prompt);
    if (!m) return false;
    const k = Number(m[2]) - Number(m[1]) + 1;
    const at = Number(m[3]) - Number(m[1]);
    const x = Number(m[5].replace(/,/g, ''));
    const ws = q.prompt.includes('weighted average') ? weightsOf(k) : Array.from({ length: k }, () => 1);
    // Any profits will do: correct them and see how the average moves.
    const before = Array.from({ length: k }, () => 500000);
    const after = before.map((p, i) => p + (i === at ? (m[4] === 'over' ? -x : x) : i === at + 1 ? (m[4] === 'over' ? x : -x) : 0));
    const change = (weighted(after, ws) - weighted(before, ws)) / sum(ws);
    const text = optionText(q) ?? '';
    return change === 0 ? text === 'It does not change' : text === `It ${change > 0 ? 'rises' : 'falls'} by ${inr(Math.abs(change))}`;
  },
});

const superReverse = numericTemplate({
  id: 'gw-super-reverse', topicId: T, conceptId: 'gw-super-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([10, 12, 15, 20]);
    const c = rng.step(400000, 2400000, 50000);
    const normal = (c * r) / 100;
    const capitalised = rng.step(100000, 600000, 10000);
    const sp = (capitalised * r) / 100;
    const n = rng.pick([2, 3, 4]);
    const g = sp * n;
    const k = rng.pick([3, 4]);
    const pay = rng.step(60000, 240000, 12000);
    const before = normal + sp + pay;
    const num = numeric(c, [
      [((before - sp) * 100) / r, 'Did not deduct the remuneration of the partners before finding the normal profit.'],
      [normal, 'Gave the normal profit; the capital employed is the capital on which that profit is the normal return.'],
      [((before - pay) * 100) / r, 'Capitalised the whole average profit; the capital employed earns only the normal profit.'],
      [((before - pay - g) * 100) / r, "Deducted the whole goodwill as if it were one year's super profit."],
    ]);
    return num && {
      prompt: rng.pick([
        `The goodwill of ${f.name}, at ${n} years' purchase of the super profit, is ${inr(g)}. The total profit of the last ${WORDS[k]} years was ${inr(before * k)}, before charging a fair remuneration of ${inr(pay)} a year for the work of the partners; the super profit was worked on the average profit after this remuneration. The normal rate of return is ${r}%. Find the capital employed in the firm.`,
        `${intro(f)} Its goodwill was valued at ${inr(g)}, which is ${n} years' purchase of the super profit. The firm earned ${inr(before * k)} in all over the last ${WORDS[k]} years, before allowing a fair remuneration of ${inr(pay)} a year for the work of the partners, and the average profit after this remuneration was used. The normal rate of return is ${r}%. What capital employed does this valuation imply?`,
      ]),
      ...num,
      explanation: [
        `Average profit = ${inr(before * k)} / ${k} = ${inr(before)}; after remuneration, ${inr(before)} - ${inr(pay)} = ${inr(before - pay)}.`,
        `Super profit = ${inr(g)} / ${n} = ${inr(sp)}.`,
        `Normal profit = ${inr(before - pay)} - ${inr(sp)} = ${inr(normal)}.`,
        `Capital employed = ${inr(normal)} x 100 / ${r} = ${inr(c)}.`,
      ],
      hints: ['Work backwards from the goodwill to the super profit, and from the profits to the average profit after remuneration.', 'Capital employed = normal profit x 100 / normal rate.'],
    };
  },
  verify: (q) => {
    const [g, total, pay] = amountsIn(q.prompt);
    const k = WORDS.indexOf(/last (\w+) years/.exec(q.prompt)?.[1] ?? '');
    return near(q.answer / 100, ((total / k - pay - g / purchaseIn(q.prompt)) * 100) / rateIn(q.prompt));
  },
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const gwAssertionReason = factsTemplate({
  id: 'gw-assertion-reason', topicId: 'goodwill', conceptId: 'gw-nature', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'A firm whose average profit equals its normal profit has no goodwill by the super profit method.',
      reason: "Goodwill by this method is the super profit multiplied by the years' purchase, and super profit is the excess of average profit over normal profit.",
      a: 'The super profit is nil, and nil multiplied by any number of years is nil.',
      r: "Super profit = average profit - normal profit, and goodwill = super profit × years' purchase.",
      link: 'R explains A: with no excess over the normal profit, there is nothing to multiply.',
    },
    {
      answer: 'both',
      assertion: 'A bakery on a busy station road is likely to have more goodwill than a like bakery in a quiet lane.',
      reason: 'A good location brings more customers and so raises the profit expected.',
      a: 'Location is one of the factors that affect goodwill.',
      r: 'Whatever raises the profit a firm can expect raises its goodwill.',
      link: 'R explains A: the bakery on the station road can expect the higher profit because of where it stands.',
    },
    {
      answer: 'both',
      assertion: 'A loss of ₹40,000 from a fire is added back to the profit of that year before the average profit is found.',
      reason: 'A loss from a fire is abnormal and is not expected to recur.',
      a: 'Past profits are first turned into normal profits, so the fire loss is added back.',
      r: 'A fire is a chance event, not a part of the usual working of the firm.',
      link: 'R explains A: goodwill rests on the profit to be expected, and a loss that will not recur has no place in it.',
    },
    {
      answer: 'both',
      assertion: 'The weighted average profit suits a firm whose profits have been rising year after year.',
      reason: 'It gives the latest year the highest weight, so the average leans towards the recent level of profit.',
      a: 'It is used when profits show a clear rising or falling trend.',
      r: 'The weights are highest for the latest year.',
      link: 'R explains A: a simple average would hold the older, lower profits equal to the recent ones.',
    },
    {
      answer: 'both',
      assertion: 'Non-trade investments are left out of capital employed.',
      reason: 'Capital employed measures the capital used in the trade of the firm.',
      a: 'Capital employed takes all assets except goodwill, fictitious assets and non-trade investments, less outside liabilities.',
      r: 'Normal profit is what a similar firm in the same trade would earn on that capital.',
      link: 'R explains A: non-trade investments are not used in the trade, so they are no part of that capital.',
    },
    {
      answer: 'bothNot',
      assertion: 'Goodwill cannot be sold apart from the business.',
      reason: 'The value of goodwill changes from time to time.',
      a: 'Goodwill goes with the business when the business is sold.',
      r: 'The value of goodwill follows what the business is expected to earn.',
      link: 'R does not explain A: a changing value does not stop a thing being sold alone. Goodwill cannot be, because it is tied to the business.',
    },
    {
      answer: 'bothNot',
      assertion: 'The goodwill of a firm is valued when a partner retires.',
      reason: 'Only purchased goodwill is recorded in the books.',
      a: 'The remaining partners take over the share of the partner who leaves, and goodwill measures what they pay for it.',
      r: 'AS 26 allows purchased goodwill alone to be recorded.',
      link: 'R does not explain A: R is about recording goodwill; the valuation is needed to settle between the partners.',
    },
    {
      answer: 'bothNot',
      assertion: "An average profit of ₹1,20,000 at 3 years' purchase gives goodwill of ₹3,60,000.",
      reason: 'Goodwill by capitalisation of super profit = Super profit × 100 ÷ Normal rate of return.',
      a: "Goodwill = average profit × years' purchase = ₹1,20,000 × 3 = ₹3,60,000.",
      r: 'That is the formula of the capitalisation of super profit method.',
      link: 'R does not explain A: A uses the average profit method, and R gives the formula of another method.',
    },
    {
      answer: 'aOnly',
      assertion: 'The closing stock of a year was overvalued by ₹10,000. In finding normal profits, the profit of the next year is raised by ₹10,000.',
      reason: 'An overvaluation of closing stock understates the profit of the same year.',
      a: "That closing stock is the next year's opening stock, so the next year's profit is understated and ₹10,000 is added.",
      r: 'Overvalued closing stock overstates the profit of the same year.',
    },
    {
      answer: 'aOnly',
      assertion: 'Capital employed is ₹10,00,000, the normal rate of return is 10% and the average profit is ₹1,30,000. The super profit is ₹30,000.',
      reason: 'Normal profit is found by applying the normal rate of return to the average profit.',
      a: 'Normal profit is ₹10,00,000 × 10% = ₹1,00,000, so the super profit is ₹1,30,000 - ₹1,00,000 = ₹30,000.',
      r: 'The normal rate of return is applied to the capital employed, not to the average profit.',
    },
    {
      answer: 'rOnly',
      assertion: 'The average profit is ₹1,50,000, the normal rate of return 10% and the capital employed ₹12,00,000. Goodwill by capitalisation of average profit is ₹15,00,000.',
      reason: 'The capitalised value of average profit = Average profit × 100 ÷ Normal rate of return.',
      a: 'Goodwill is the capitalised value less the capital employed: ₹15,00,000 - ₹12,00,000 = ₹3,00,000.',
      r: 'That is how the capitalised value of the average profit is found.',
    },
    {
      answer: 'rOnly',
      assertion: 'Goodwill is a fictitious asset.',
      reason: 'Goodwill has no physical form.',
      a: 'Goodwill is an intangible asset; a fictitious asset has no value, and goodwill has one when the business is sold.',
      r: 'Being without physical form is what makes goodwill intangible.',
    },
  ]),
});

// ===============================================================================================================
// ADDED AFTER THE AUDIT (outside the mock papers, the worksheets and Look back: src/generators/outsidePapers.ts)
// ===============================================================================================================

// gw-weighted-loss-year: a weighted average in which an earlier year is a loss, deducted at its weight
const weightedLossYear = numericTemplate({
  id: 'gw-weighted-loss-year', topicId: T, conceptId: 'gw-weighted', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const k = rng.pick([3, 4]);
    const ys = lastYears(rng, k);
    const ws = weightsOf(k);
    const total = sum(ws);
    const n = rng.pick([2, 3]);
    // A rising trend from a bad year: one of the earlier years (never the latest) ended in a loss.
    const p = trendProfits(rng, k).sort((x, y) => x - y).map((v) => v + 40000);
    const at = rng.int(0, k - 2);
    p[at] = -rng.step(10000, 60000, 5000);
    // The earliest year has weight 1: taking the remainder off it makes the products a multiple of ₹1,000 x the total
    // of the weights, so the weighted average is a whole ₹1,000 (a loss there only grows; a profit stays above ₹90,000).
    p[0] -= ((weighted(p, ws) % (total * 1000)) + total * 1000) % (total * 1000);
    const products = weighted(p, ws);
    const avg = products / total;
    if (avg <= 0) return null;
    const asProfit = p.map(Math.abs);
    const num = numeric(avg * n, [
      [(weighted(asProfit, ws) / total) * n, 'Added the loss as if it were a profit; a loss is deducted at its weight.'],
      [(weighted(p.map((v) => Math.max(v, 0)), ws) / total) * n, 'Left the loss year out of the products but still divided by the total of all the weights.'],
      [(sum(p) / k) * n, 'Took the simple average of the results, ignoring the weights.'],
      [avg, "Stopped at the weighted average profit and did not multiply by the number of years' purchase."],
      [(products / k) * n, `Divided the total of the products by ${k}, the number of years, instead of by ${total}, the total of the weights.`],
    ]);
    return num && {
      prompt: `${intro(f)} Its goodwill is valued at ${n} years' purchase of the weighted average profit of the last ${WORDS[k]} years, with weights of ${weightsText(k)} for the years in order (the latest year has the highest weight). The results (years ended 31 March) were:\n${yearRows(ys, p)}\nFind the value of the goodwill.`,
      ...num,
      explanation: [
        `Products: ${ys.map((y, i) => `${fy(y)} ${p[i] < 0 ? `-${inr(-p[i])}` : inr(p[i])} x ${ws[i]} = ${p[i] < 0 ? `-${inr(-p[i] * ws[i])}` : inr(p[i] * ws[i])}`).join('; ')}.`,
        `Total of the products = ${inr(products)}: the loss of ${fy(ys[at])} is deducted, at its weight of ${ws[at]}.`,
        `Weighted average profit = ${inr(products)} / ${total} = ${inr(avg)}.`,
        `Goodwill = ${inr(avg)} x ${n} = ${inr(avg * n)}.`,
      ],
      hints: ['A loss is a negative result: multiply it by its weight and deduct the product.', "Weighted average = total of the products / total of the weights (here every year's weight counts); goodwill = that average x the years' purchase."],
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    return r.some((v) => v < 0) && near(q.answer / 100, (r.reduce((acc, p, i) => acc + p * (i + 1), 0) / ((r.length * (r.length + 1)) / 2)) * purchaseIn(q.prompt));
  },
});

// gw-super-avg-capital: super profit on the average capital employed, from the opening and closing capital employed
// or from the closing capital employed less half the profit of the year
const superAvgCapital = numericTemplate({
  id: 'gw-super-avg-capital', topicId: T, conceptId: 'gw-super-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([10, 12, 15, 20]);
    const n = rng.pick([2, 3, 4]);
    const y = rng.pick([2024, 2025, 2026]);
    const average = rng.step(500000, 2000000, 100000);
    const normal = (average * r) / 100;
    const sp = rng.step(10000, superLimit(normal, 120000, 5000), 5000);
    const profit = normal + sp;
    const halfWay = rng.int(0, 1) === 0;
    // Either two dates, the year's capital growing between them; or the closing figure with the year's profit still in it.
    const growth = rng.step(40000, 300000, 20000);
    const opening = average - growth / 2;
    const closing = halfWay ? average + profit / 2 : average + growth / 2;
    if (!Number.isInteger(opening) || !Number.isInteger(closing) || (halfWay && profit % 2 !== 0)) return null;
    const num = numeric(sp * n, [
      [(profit - (closing * r) / 100) * n, 'Took the normal profit on the closing capital employed; this firm values on the average capital employed.'],
      ...(halfWay ? [] : ([[(profit - (opening * r) / 100) * n, 'Took the normal profit on the opening capital employed only.']] as [number, string][])),
      ...(halfWay ? ([[(profit - ((closing - profit) * r) / 100) * n, 'Deducted the whole profit of the year from the closing capital employed; only half of it is taken out.']] as [number, string][]) : []),
      [profit * n, 'Multiplied the whole average profit; only the profit above the normal is goodwill.'],
      [sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
    ]);
    const how = halfWay
      ? `The partners take the average capital employed as the capital employed on 31 March ${y}, ${inr(closing)}, less half the profit of the year ended on that date, the profit having been earned evenly through the year and none of it withdrawn.`
      : `The partners take the average capital employed: the mean of the capital employed on 1 April ${y - 1}, ${inr(opening)}, and on 31 March ${y}, ${inr(closing)}.`;
    return num && {
      prompt: `${intro(f)} Its goodwill is to be valued at ${n} years' purchase of the super profit, the normal rate of return being ${r}%. Its average profit, which is also the profit of the year ended 31 March ${y}, is ${inr(profit)}. ${how} Find the value of the goodwill.`,
      ...num,
      explanation: [
        halfWay
          ? `Average capital employed = ${inr(closing)} - ${inr(profit)} / 2 = ${inr(closing)} - ${inr(profit / 2)} = ${inr(average)}.`
          : `Average capital employed = (${inr(opening)} + ${inr(closing)}) / 2 = ${inr(average)}.`,
        `Normal profit = ${inr(average)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(profit)} - ${inr(normal)} = ${inr(sp)}.`,
        `Goodwill = ${inr(sp)} x ${n} = ${inr(sp * n)}.`,
      ],
      hints: ['Find the average capital employed first, in the way the partners have agreed, and take the normal profit on that.', 'Super profit = average profit - normal profit; goodwill = super profit x years\' purchase.'],
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const half = q.prompt.includes('less half the profit');
    const [profit, x, z] = amounts;
    const average = half ? x - profit / 2 : (x + z) / 2;
    return near(q.answer / 100, (profit - (average * rateIn(q.prompt)) / 100) * purchaseIn(q.prompt));
  },
});

// gw-super-nti-income: the profits include income from non-trade investments: the investments come out of capital
// employed and their income out of the average profit before the super profit is found
const superNtiIncome = numericTemplate({
  id: 'gw-super-nti-income', topicId: T, conceptId: 'gw-super-profit', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const f = firm(rng);
    const y = rng.pick([2024, 2025, 2026]);
    const ys = [y - 2, y - 1, y];
    const r = rng.pick([10, 12, 15]);
    const n = rng.pick([2, 3, 4]);
    const bondRate = rng.pick([6, 8, 9, 10]);
    const bonds = rng.step(100000, 400000, 50000);
    const income = (bonds * bondRate) / 100;
    const ca = rng.step(400000, 1000000, 50000);
    const cb = rng.step(300000, 800000, 50000);
    const reserve = rng.step(50000, 200000, 10000);
    const c = ca + cb + reserve - bonds;
    if ((c * r) % 100 !== 0) return null;
    const normal = (c * r) / 100;
    const sp = rng.step(15000, superLimit(normal, 150000, 5000), 5000);
    const trading = normal + sp;
    // Three yearly profits, each with the year's interest in it, around the trading average.
    const up = rng.step(-30000, 30000, 5000);
    const down = rng.step(-30000, 30000, 5000);
    const p = [trading + up, trading + down, trading - up - down].map((v) => v + income);
    if (p.some((v) => v <= income)) return null;
    const num = numeric(sp * n, [
      [(trading + income - normal) * n, 'Left the interest on the investments in the profit; with the investments out of capital employed, their income comes out of the profit too.'],
      [(trading - normal - (bonds * r) / 100) * n, 'Took the interest out of the profit but left the investments inside the capital employed.'],
      [(trading + income - normal - (bonds * r) / 100) * n, 'Left the investments in the capital employed and their interest in the profit.'],
      [sp, "Stopped at the super profit and did not multiply by the number of years' purchase."],
      [(trading + income) * n, 'Multiplied the whole average profit; only the profit above the normal is goodwill.'],
    ]);
    return num && {
      prompt: [
        `${intro(f)} Its goodwill is to be valued at ${n} years' purchase of the super profit, the normal rate of return being ${r}%. The profits of the last three years (ended 31 March) were:`,
        yearRows(ys, p),
        `Each profit includes ${inr(income)} of interest on ${bondRate}% Government bonds of ${inr(bonds)}, held as non-trade investments throughout the three years. On 31 March ${y}: ${f.a}'s Capital ${inr(ca)}, ${f.b}'s Capital ${inr(cb)}, General Reserve ${inr(reserve)}; the bonds are the only asset not used in the business, and there is no goodwill or fictitious asset in the books.`,
        'Find the value of the goodwill.',
      ].join('\n'),
      ...num,
      explanation: [
        `Average profit as the books show it = (${p.map(inr).join(' + ')}) / 3 = ${inr(trading + income)}.`,
        `Less the interest on the non-trade investments, ${inr(income)} a year: average trading profit = ${inr(trading)}.`,
        `Capital employed = ${inr(ca)} + ${inr(cb)} + ${inr(reserve)} - ${inr(bonds)} (non-trade investments) = ${inr(c)}.`,
        `Normal profit = ${inr(c)} x ${r} / 100 = ${inr(normal)}.`,
        `Super profit = ${inr(trading)} - ${inr(normal)} = ${inr(sp)}; goodwill = ${inr(sp)} x ${n} = ${inr(sp * n)}.`,
      ],
      hints: ['Non-trade investments do not earn the trading profit: take them out of the capital employed and their income out of the profit.', 'Average trading profit - normal profit on the capital employed = super profit; then multiply by the years\' purchase.'],
    };
  },
  verify: (q) => {
    const r = rowsIn(q.prompt);
    const tail = q.prompt.slice(q.prompt.indexOf('Each profit includes'));
    const [income, bonds, ca, cb, reserve] = amountsIn(tail);
    const avg = sum(r) / r.length - income;
    return r.length === 3 && near(q.answer / 100, (avg - ((ca + cb + reserve - bonds) * rateIn(q.prompt.split('\n')[0])) / 100) * purchaseIn(q.prompt));
  },
});

/** The row of the statement that one change to a year's profit makes: "Add: Loss by fire (abnormal)". */
function deltaLabel(a: Adjustment, d: Delta): string {
  const sign = d.by > 0 ? 'Add' : 'Less';
  if (a.kind === 'loss') return `${sign}: ${a.text.includes('fire') ? 'Loss by fire' : a.text.includes('stolen') ? 'Loss by theft' : 'Loss by flood'} (abnormal)`;
  if (a.kind === 'gain') return `${sign}: ${a.text.includes('compensation') ? 'One-time compensation received' : a.text.includes('building') ? 'Gain on sale of old building' : 'Gain on sale of land'} (abnormal)`;
  if (a.kind === 'stock') return `${sign}: ${d.why.startsWith('closing') ? 'Closing' : 'Opening'} stock ${d.why.endsWith('overvalued') ? 'overvalued' : 'undervalued'}`;
  if (a.kind === 'omitted') return `${sign}: Godown rent not charged`;
  return d.by < 0 ? `${sign}: Repairs wrongly capitalised` : `${sign}: Depreciation charged on the repairs`;
}
/** The same particulars with the other sign: the slip of adding what is deducted. */
const flipped = (label: string): string => (label.startsWith('Add: ') ? `Less: ${label.slice(5)}` : `Add: ${label.slice(6)}`);

/** What a format of goodwill was made from, for its `verify`. */
const keptValuation = keepFor<{ deltas: Delta[]; n: number; profits: number[] }>();

// gw-fmt-normal-profits: the statement of adjusted (normal) profits, year by year, then the total, the average and
// the goodwill at the years' purchase (medium)
const fmtNormalProfits = statementTemplate({
  id: 'gw-fmt-normal-profits', topicId: T, conceptId: 'gw-formats', difficulty: 'medium',
  generate: (rng) => {
    const f = firm(rng);
    const k = 3;
    const ys = lastYears(rng, k);
    const n = rng.pick([2, 3, 2.5]);
    // The stock error is never in the last year, so that it always moves two years.
    const stock = drawAdjustment(rng, 'stock', ys, rng.int(0, k - 2));
    const others = rng.shuffle<AdjustmentKind>(['loss', 'gain', 'omitted', 'capitalised']).slice(0, rng.int(1, 2)).map((kind) => drawAdjustment(rng, kind, ys));
    const adjustments = rng.shuffle([stock, ...others]);
    const deltas = adjustments.flatMap((a) => a.deltas);
    const p = Array.from({ length: k }, () => rng.step(120000, 400000, 5000));
    settle(p, k * 2000, rng.int(0, k - 1), sum(deltas.map((d) => d.by)));
    const adj = adjusted(p, adjustments);
    if (adj.some((v) => v <= 0)) return null;
    // One year's two changes of one name (a stock error and a second one) would make twin rows: never so, but check.
    const labels = (i: number) => adjustments.flatMap((a) => a.deltas.filter((d) => d.at === i).map((d) => deltaLabel(a, d)));
    if ([0, 1, 2].some((i) => new Set(labels(i)).size !== labels(i).length)) return null;
    const total = sum(adj);
    const avg = total / k;
    const goodwill = avg * n;
    if (!Number.isInteger(goodwill)) return null;
    const rows: (FormatRowParts | StatementLineParts)[] = ys.flatMap((y, i) => [
      { heading: `Profit of ${fy(y)}` },
      { label: 'Profit as shown by the books', amount: rupees(p[i]) },
      ...adjustments.flatMap((a) => a.deltas.filter((d) => d.at === i).map((d): FormatRowParts => ({ label: deltaLabel(a, d), amount: rupees(d.by) }))),
      { subtotal: `Normal profit of ${fy(y)}`, amount: rupees(adj[i]), sum: 'section' as const },
    ]);
    rows.push({ subtotal: 'Total of the normal profits', amount: rupees(total), sum: 'all' }, { subtotal: 'Average normal profit', amount: rupees(avg) });
    const used = new Set(adjustments.flatMap((a) => a.deltas.map((d) => deltaLabel(a, d))));
    const traps = [...used].map(flipped).filter((label) => !used.has(label));
    const data = [
      `${intro(f)} Its goodwill is to be valued at ${n} years' purchase of the average normal profit of the last three years. The profits shown by the books (years ended 31 March) were:`,
      yearRows(ys, p),
      'On going through the books, these points were noticed:',
      lettered(adjustments.map((a) => a.text)),
    ].join('\n');
    keptValuation.keep(data, { deltas, n, profits: p });
    return {
      task: `Prepare a statement of the normal profits of ${f.name} year by year, with their total and average, and find the goodwill. Show an amount deducted with a minus sign.`,
      data,
      title: `Statement of normal profits of ${f.name}`,
      columns: [{ name: 'Amount (₹)', signed: true }],
      rows,
      final: { label: `Goodwill at ${n} years' purchase`, amount: rupees(goodwill) },
      distractors: [...traps.slice(0, 3), 'Less: Drawings of the partners', 'Add: Interest on capital'],
      explanation: [
        ...yearWorking(ys, p, adjustments),
        `Total of the normal profits = ${adj.map(inr).join(' + ')} = ${inr(total)}.`,
        `Average normal profit = ${inr(total)} / 3 = ${inr(avg)}.`,
        `Goodwill = ${inr(avg)} x ${n} = ${inr(goodwill)}.`,
      ],
      hints: [
        'Take one year at a time: start from the profit the books show, add back what should not have been charged, take out what should not have been included.',
        'A closing stock error changes its own year and, the other way, the next year. Then total the normal profits, average them and multiply by the years\' purchase.',
      ],
    };
  },
  verify: (q: StatementQuestion) => {
    // The total of the books plus every change, in one sum; and each year's sub-total from its own rows.
    const kept = keptValuation.of(q.data);
    if (!kept) return false;
    const total = sum(kept.profits) + sum(kept.deltas.map((d) => d.by));
    const yearly = kept.profits.map((p, i) => p + sum(kept.deltas.filter((d) => d.at === i).map((d) => d.by)));
    const subs = (q.lines ?? []).flatMap((l) => ('subtotal' in l ? [l] : []));
    return (
      near((q.final?.amount ?? 0) / 100, (total / 3) * kept.n) &&
      yearly.every((v, i) => near(subs[i].amounts[0] / 100, v)) &&
      near(subs[4].amounts[0] / 100, total / 3)
    );
  },
});

/** The NCERT name of the fictitious asset an extract may carry, used in the formats of this topic. */
const SUSPENSE = 'Advertisement suspense';
const LESS = (label: string): string => `Less: ${label}`;

// gw-fmt-super-profit: the whole working of the super profit method as a statement: capital employed from the
// assets and outside liabilities, the average normal profit, the normal and super profit, then goodwill at the
// years' purchase and by capitalising the super profit (complex)
const fmtSuperProfit = statementTemplate({
  id: 'gw-fmt-super-profit', topicId: T, conceptId: 'gw-formats', difficulty: 'complex',
  generate: (rng) => {
    const f = firm(rng);
    const r = rng.pick([10, 12, 15, 20]);
    const n = rng.pick([2, 3, 4]);
    const e = drawExtract(rng, r);
    if (!e) return null;
    const ys = lastYears(rng, 3);
    const normal = (e.capital * r) / 100;
    // A super profit that capitalises to whole rupees at the normal rate.
    const choices = Array.from({ length: 30 }, (_, i) => 15000 + 5000 * i).filter((x) => x <= superLimit(normal, 150000, 5000) && (x * 100) % r === 0);
    if (choices.length === 0) return null;
    const sp = rng.pick(choices);
    const avg = normal + sp;
    const item = drawAdjustment(rng, rng.pick<AdjustmentKind>(['loss', 'gain']), ys);
    const d = item.deltas[0];
    const up = rng.step(-30000, 30000, 5000);
    const down = rng.step(-30000, 30000, 5000);
    const adj = [avg + up, avg + down, avg - up - down];
    const p = adj.map((v, i) => (i === d.at ? v - d.by : v));
    if (p.some((v) => v <= 0)) return null;
    const name = (label: string): string => (label === FICTITIOUS[0] ? SUSPENSE : label);
    const assets = e.assets.map(([label, v]): [string, number] => [name(label), v]);
    const usedAssets = assets.filter(([label]) => !NOT_EMPLOYED.has(label) && label !== SUSPENSE);
    const outNames = e.out.map(([label]) => name(label));
    const noIncome = e.out.some(([label]) => label === NON_TRADE) ? ' No income from the non-trade investments is included in these profits.' : '';
    const rows: (FormatRowParts | StatementLineParts)[] = [
      { heading: `Capital employed on 31 March ${ys[2]}` },
      ...usedAssets.map(([label, v]): FormatRowParts => ({ label, amount: rupees(v) })),
      ...e.liabilities.map(([label, v]): FormatRowParts => ({ label: LESS(label), amount: rupees(-v) })),
      { subtotal: 'Capital employed', amount: rupees(e.capital), sum: 'section' },
      { heading: 'Average normal profit' },
      ...ys.map((y, i): FormatRowParts => ({ label: `Profit of ${fy(y)}`, amount: rupees(p[i]) })),
      { label: deltaLabel(item, d), amount: rupees(d.by) },
      { subtotal: 'Total of the normal profits', amount: rupees(sum(adj)), sum: 'section' },
      { subtotal: 'Average normal profit', amount: rupees(avg) },
      { subtotal: `Normal profit at ${r}% on the capital employed`, amount: rupees(normal) },
      { subtotal: 'Super profit', amount: rupees(sp) },
      { subtotal: `Goodwill at ${n} years' purchase of the super profit`, amount: rupees(sp * n) },
    ];
    const data = [
      `${intro(f)} Its goodwill is to be valued by the super profit method, at ${n} years' purchase and also by capitalising the super profit. The normal rate of return is ${r}%. The profits of the last three years (ended 31 March) were:`,
      yearRows(ys, p),
      `${item.text}${noIncome}`,
      `On 31 March ${ys[2]} the books showed:`,
      `Assets:\n${assets.map(([label, v]) => `${label}: ${inr(v)}`).join('\n')}`,
      `Outside liabilities:\n${e.liabilities.map(([label, v]) => `${label}: ${inr(v)}`).join('\n')}`,
    ].join('\n');
    keptValuation.keep(data, { deltas: item.deltas, n, profits: p });
    return {
      task: `Prepare the working of the goodwill of ${f.name}: the capital employed, the average normal profit, the normal and the super profit, and the goodwill by both methods. Show an amount deducted with a minus sign.`,
      data,
      title: `Valuation of the goodwill of ${f.name}`,
      columns: [{ name: 'Amount (₹)', signed: true }],
      rows,
      final: { label: `Goodwill by capitalising the super profit at ${r}%`, amount: rupees((sp * 100) / r) },
      distractors: [...outNames, flipped(deltaLabel(item, d)), "Less: Partners' capitals"],
      explanation: [
        `Left out of the capital employed: ${outNames.join(', ')}. They are not used in earning the trading profit.`,
        `Capital employed = ${usedAssets.map(([, v]) => inr(v)).join(' + ')} - (${e.liabilities.map(([, v]) => inr(v)).join(' + ')}) = ${inr(e.trade)} - ${inr(e.outside)} = ${inr(e.capital)}.`,
        ...yearWorking(ys, p, [item]).filter((line) => !line.includes('no adjustment')),
        `Average normal profit = ${inr(sum(adj))} / 3 = ${inr(avg)}.`,
        `Normal profit = ${inr(e.capital)} x ${r} / 100 = ${inr(normal)}; super profit = ${inr(avg)} - ${inr(normal)} = ${inr(sp)}.`,
        `Goodwill at ${n} years' purchase = ${inr(sp)} x ${n} = ${inr(sp * n)}.`,
        `Goodwill by capitalising the super profit = ${inr(sp)} x 100 / ${r} = ${inr((sp * 100) / r)}.`,
      ],
      hints: [
        'Capital employed: only the assets used in the business, less the outside liabilities. Goodwill, non-trade investments and a fictitious asset stay out.',
        'Correct the profits, average them, take the normal profit at the normal rate on the capital employed; the super profit is the difference. Then multiply it, and capitalise it (x 100 / rate).',
      ],
    };
  },
  verify: (q: StatementQuestion) => {
    // From the data alone: capital employed re-read line by line, the profits corrected in one sum.
    const kept = keptValuation.of(q.data);
    if (!kept) return false;
    let c = 0;
    for (const [label, v] of labelled(q.data)) {
      if (LIABILITY_LABELS.includes(label)) c -= v;
      else if (!NOT_EMPLOYED.has(label) && label !== SUSPENSE && !/^\d{4}-\d{2}$/.test(label)) c += v;
    }
    const r = rateIn(q.data.slice(q.data.indexOf('normal rate of return')));
    const avg = (sum(kept.profits) + sum(kept.deltas.map((d) => d.by))) / 3;
    const sp = avg - (c * r) / 100;
    const subs = (q.lines ?? []).flatMap((l) => ('subtotal' in l ? [l.amounts[0] / 100] : []));
    return sp > 0 && near(subs[0], c) && near(subs[5], sp * kept.n) && near((q.final?.amount ?? 0) / 100, (sp * 100) / r);
  },
});

const templates: Template[] = [
  // easy
  avgProfit, avgGoodwill, purchaseBasic, normalProfit, superProfit, superGoodwillBasic, capSuperBasic, capitalisedValue, capitalEmployedBasic,
  purchasedAmount, nature, factor, factorEffect, purchasedOrSelf, needForValuation, adjustDirection, methodName,
  // medium
  weightedAvg, weightedGoodwill, avgAbnormal, avgRemuneration, stockNextYear, capitalisedExpense, superGoodwill, superFindAvg, superFindRate,
  superFindCapital, superFindYears, capAvgGoodwill, capSuperGoodwill, capitalEmployedAssets, capitalEmployedFunds, yearsPurchase,
  missingYearProfit, capSame, capFindTerm, capFindRate,
  // complex
  avgAdjusted, weightedAdjusted, superFull, capBalanceSheet, compareMethods, superIndirect, stockAverageEffect, superReverse,
  gwAssertionReason,
  // added after the audit
  weightedLossYear, superAvgCapital, superNtiIncome, fmtNormalProfits, fmtSuperProfit,
];

export default templates;
