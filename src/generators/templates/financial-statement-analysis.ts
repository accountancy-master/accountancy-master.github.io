import type { McqQuestion, StatementQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, formatINR, mcqTemplate, numericTemplate, rupees, statementTemplate } from '../authoring';
import type { McqParts, NumericParts, StatementParts, Template } from '../types';

const T = 'financial-statement-analysis';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - a comparative statement has two periods: absolute change = later figure less earlier figure, and percentage
//    change = absolute change / EARLIER figure x 100;
//  - a common size Statement of Profit and Loss takes revenue from operations as 100 (other income is itself a
//    percentage of it, so total income is more than 100); a common size balance sheet takes the total of the balance
//    sheet (total assets = total equity and liabilities) as 100;
//  - a typed answer is never negative: the prompt says whether the change is an increase or a decrease and asks for
//    its size, and the direction is asked on its own in the choice questions;
//  - every right percentage is exact to two decimal places (figures are chosen so); a wrong one is what the slip
//    gives when it is rounded to two decimal places, as the prompt asks; a seed in which a slip comes within 0.02 of
//    the right percentage is rejected, so that the right answer is never reached by the wrong method;
//  - every question that works a common size Statement of Profit and Loss says that revenue from operations is 100
//    (a few textbooks take total revenue), except the one that asks what the base is;
//  - lines are listed in the order of Schedule III;
//  - amounts are whole rupees here and paise in what a template returns; percentages are hundredths (12.5% is 1250).
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
/** Hundredths of a percent as text: 1250 is "12.5%", 1667 is "16.67%". */
const pc = (h: number): string => `${h % 100 === 0 ? h / 100 : (h / 100).toFixed(2).replace(/0$/, '')}%`;
/** `part` as a percentage of `base` in hundredths when that is exact to two decimal places, else null. */
const exactPct = (part: number, base: number): number | null => (base > 0 && (part * 10000) % base === 0 ? (part * 10000) / base : null);
/** `part` as a percentage of `base` in hundredths, rounded to two decimal places: what a slip comes to. */
const roundPct = (part: number, base: number): number => (base > 0 ? Math.round((part * 10000) / base) : 0);
/** `h` hundredths of a percent of an amount; 0 (which is dropped as a wrong answer) when it leaves paise. */
const share = (amount: number, h: number): number => ((amount * h) % 10000 === 0 ? (amount * h) / 10000 : 0);
const lower = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

const TWO_DP = 'Give the percentage to two decimal places if it is not a whole number.';
/** Said in every question that works a common size Statement of Profit and Loss: the base it is prepared on. */
const ON_REVENUE = '(revenue from operations = 100)';

const COMPANIES = [
  'Ananya Foods Ltd.', 'Bhaskar Tools Ltd.', 'Charu Garments Ltd.', 'Devgiri Ceramics Ltd.', 'Eklavya Sports Goods Ltd.', 'Gitanjali Paper Products Ltd.',
  'Harit Agro Ltd.', 'Ishaan Electricals Ltd.', 'Jyotsna Plastics Ltd.', 'Kaveri Textiles Ltd.', 'Lokesh Auto Parts Ltd.', 'Meenal Paints Ltd.',
];

/** The two periods of a statement, earlier then later: two years for a Statement of Profit and Loss, two dates for a balance sheet. */
export interface Period {
  a: string;
  b: string;
  /** "in 2024-25" or "as at 31 March 2025". */
  inA: string;
  inB: string;
  bs: boolean;
  /** "Statement of Profit and Loss" or "balance sheet". */
  statement: string;
}
const YEARS: [string, string][] = [['2023-24', '2024-25'], ['2024-25', '2025-26']];
const DATES: [string, string][] = [['31 March 2024', '31 March 2025'], ['31 March 2025', '31 March 2026']];
const plPeriod = (rng: Rng): Period => {
  const [a, b] = rng.pick(YEARS);
  return { a, b, inA: `in ${a}`, inB: `in ${b}`, bs: false, statement: 'Statement of Profit and Loss' };
};
const bsPeriod = (rng: Rng): Period => {
  const [a, b] = rng.pick(DATES);
  return { a, b, inA: `as at ${a}`, inB: `as at ${b}`, bs: true, statement: 'balance sheet' };
};

/** A line of a statement, with the range of its earlier figure in units of Rs 80,000. */
interface Line {
  name: string;
  min: number;
  max: number;
}
const PL_LINES: Line[] = [
  { name: 'Revenue from operations', min: 25, max: 100 },
  { name: 'Other income', min: 1, max: 5 },
  { name: 'Cost of materials consumed', min: 10, max: 50 },
  { name: 'Purchases of stock-in-trade', min: 8, max: 40 },
  { name: 'Employee benefits expense', min: 3, max: 20 },
  { name: 'Finance costs', min: 1, max: 6 },
  { name: 'Depreciation and amortisation expense', min: 1, max: 8 },
  { name: 'Other expenses', min: 2, max: 10 },
];
const BS_LINES: Line[] = [
  { name: 'Share capital', min: 10, max: 50 },
  { name: 'Reserves and surplus', min: 3, max: 25 },
  { name: 'Long-term borrowings', min: 5, max: 30 },
  { name: 'Short-term borrowings', min: 1, max: 8 },
  { name: 'Trade payables', min: 2, max: 12 },
  { name: 'Property, plant and equipment', min: 10, max: 60 },
  { name: 'Non-current investments', min: 2, max: 12 },
  { name: 'Inventories', min: 3, max: 15 },
  { name: 'Trade receivables', min: 3, max: 15 },
  { name: 'Cash and cash equivalents', min: 1, max: 6 },
];

/** The lines of the two statements in the order of Schedule III: an extract lists its lines in this order. */
const STATEMENT_ORDER = [
  'Revenue from operations', 'Other income', 'Cost of materials consumed', 'Purchases of stock-in-trade', 'Employee benefits expense', 'Finance costs',
  'Depreciation and amortisation expense', 'Other expenses',
  'Share capital', 'Reserves and surplus', 'Long-term borrowings', 'Short-term borrowings', 'Trade payables', 'Short-term provisions',
  'Property, plant and equipment', 'Non-current investments', 'Long-term loans and advances', 'Current investments', 'Inventories', 'Trade receivables',
  'Cash and cash equivalents',
];
const place = (name: string): number => STATEMENT_ORDER.indexOf(name);

/** Percentage changes, in hundredths. With an earlier figure in units of Rs 80,000 every change is a round amount. */
const INC = [500, 750, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 3000, 3500, 3750, 4000, 4500, 5000, 6000];
const DEC = [500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 3750, 4000, 5000];

/** An earlier figure, a direction and a percentage, and what follows from them. */
interface Move {
  prev: number;
  cur: number;
  change: number;
  p: number;
  up: boolean;
}
function drawMove(rng: Rng, line: Line, inc: number[] = INC, dec: number[] = DEC): Move {
  const prev = 80000 * rng.int(line.min, line.max);
  // Share capital is not shown falling: a reduction of capital is outside the course.
  const up = line.name === 'Share capital' || rng.int(0, 2) > 0;
  const p = rng.pick(up ? inc : dec);
  const change = (prev * p) / 10000;
  return { prev, cur: up ? prev + change : prev - change, change, p, up };
}

type Err = [number, string];

/** A typed answer and its wrong answers, already in the unit's scale. Null when fewer than two distinct errors remain. */
function answerOf(answer: number, errs: Err[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isSafeInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) if (Number.isSafeInteger(v) && v > 0 && !seen.has(v) && seen.add(v)) commonErrors.push({ value: v, why });
  return commonErrors.length >= 2 ? { answer, commonErrors } : null;
}
/** An answer in whole rupees, with wrong answers in whole rupees (one that is not whole is dropped). */
const money = (answer: number, errs: Err[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null =>
  answerOf(answer * 100, errs.map(([v, why]): Err => [Number.isInteger(v) ? v * 100 : 0, why]));
/**
 * An answer in hundredths of a percent. Null (the seed is rejected) when a slip comes within `margin` hundredths of the
 * right percentage: a learner who rounds loosely would then be marked right for the wrong method.
 */
const percent = (answer: number, errs: Err[], margin = 2): Pick<NumericParts, 'answer' | 'commonErrors'> | null =>
  errs.some(([v]) => v !== answer && Math.abs(v - answer) <= margin) ? null : answerOf(answer, errs);
/** The margin for a line that is worked out from several others: there the figures can be chosen to keep every slip 0.1 away. */
const DERIVED = 10;

/** A multiple-choice question; null when fewer than three distinct wrong options remain. */
function choice(prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null {
  const seen = new Set([correct]);
  const distractors: { text: string; why: string }[] = [];
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

/** A row of data under the question: the figures of the two periods of one line. */
const twoYears = (name: string, v: readonly number[], per: Period): string => `${name}: ${inr(v[0])} (${per.a}), ${inr(v[1])} (${per.b})`;

// What `verify` reads back from a prompt.
const amountsIn = (s: string): number[] => (s.match(/₹[\d,]+/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
const pctsIn = (s: string): number[] => [...s.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Math.round(Number(m[1]) * 100));
/** The rows of data under the question, in order: the name of each line and its amounts. */
const rowsIn = (prompt: string): [string, number[]][] =>
  prompt
    .split('\n')
    .slice(1)
    .map((l): [string, number[]] => [l.slice(0, l.indexOf(':')), amountsIn(l)]);
const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';

const H = {
  change: ['Absolute change = figure of the later period less figure of the earlier period.', 'Percentage change = absolute change ÷ figure of the EARLIER period × 100.'],
  back: ['Call the earlier figure 100. A rise of 20% makes the later figure 120; a fall of 20% makes it 80.', 'The percentage is always worked on the earlier figure, so that is the figure a change is divided by.'],
  derived: ['Work out the line that is asked (a total or a profit) for each period first.', 'Then take the change of that line itself. The percentages of separate lines are never added or averaged.'],
  csPl: ['In a common size Statement of Profit and Loss, revenue from operations is 100.', 'Percentage of a line = the line ÷ revenue from operations × 100. Other income is not part of the base.'],
  csBs: ['In a common size balance sheet, the total of the balance sheet is 100.', 'Total assets = non-current assets + current assets, and it equals total equity and liabilities.'],
  read: ['Compare rates of change, not rupee amounts.', 'A common size percentage is the share a line takes of the base of its own period.'],
  users: ['Ask what this user stands to gain or lose, and how soon.', 'Short credit is about liquidity; a long loan is about solvency; ownership is about earnings.'],
  tools: ['Across periods is horizontal analysis; within one period is vertical analysis.', 'Comparative statements measure change. Common size statements measure the share of each line.'],
  limits: [
    'Ask what the situation shows that the figures cannot capture: an old cost, a change in prices, something not measured in money, an arrangement at the year end, a change of method, or a matter of opinion.',
    'Name the limitation that fits it: historical cost, the price level, qualitative factors, window dressing, accounting policies or personal judgement.',
  ],
  objectives: [
    'An objective is something analysis helps a reader to judge: earning capacity, solvency, the efficiency of the management, how the business compares, why the results changed.',
    'Recording transactions and preparing the statements come before analysis. Revaluing assets, adjusting for prices and measuring morale are things analysis cannot do: those are its limitations.',
  ],
};

// ===============================================================================================================
// COMPARATIVE STATEMENTS: one line
// ===============================================================================================================

const absChange = numericTemplate({
  id: 'fsa-abs-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = rng.int(0, 2) === 0 ? bsPeriod(rng) : plPeriod(rng);
    const [x, y] = rng.shuffle(per.bs ? BS_LINES : PL_LINES);
    const draw = (l: Line): [number, number] => {
      const prev = 20000 * rng.int(l.min * 4, l.max * 4);
      const size = 10000 * rng.int(1, Math.max(2, Math.floor(prev / 40000)));
      return [prev, l.name !== 'Share capital' && rng.int(0, 2) === 0 ? prev - size : prev + size];
    };
    const vx = draw(x);
    const vy = draw(y);
    const dx = vx[1] - vx[0];
    const dy = vy[1] - vy[0];
    if (Math.abs(dx) === Math.abs(dy)) return null;
    const up = dx > 0;
    const size = Math.abs(dx);
    const ask = rng.pick([
      `By how much did ${lower(x.name)} ${up ? 'rise' : 'fall'} between the two ${per.bs ? 'dates' : 'years'}? Give the amount of the ${up ? 'increase' : 'decrease'}.`,
      `What figure stands in the "Absolute change" column of the comparative ${per.statement} against ${lower(x.name)}? It is ${up ? 'an increase' : 'a decrease'}: give its amount.`,
      `Find the absolute ${up ? 'increase' : 'decrease'} in ${lower(x.name)}.`,
    ]);
    const rows = place(x.name) < place(y.name) ? [twoYears(x.name, vx, per), twoYears(y.name, vy, per)] : [twoYears(y.name, vy, per), twoYears(x.name, vx, per)];
    const n = money(size, [
      [vx[0] + vx[1], 'Added the figures of the two periods. A change is the difference between them.'],
      [Math.abs(dy), `Worked out the change in ${lower(y.name)}, the other line of the extract.`],
      [Math.abs(dx + dy), 'Gave the change in the two lines taken together, not in the line asked for.'],
    ]);
    return n && {
      prompt: `${company} gives this extract from its ${per.bs ? 'balance sheets' : 'Statements of Profit and Loss'}. ${ask}\n${rows.join('\n')}`,
      ...n,
      explanation: [
        'Absolute change = figure of the later period less figure of the earlier period.',
        `${x.name}: ${inr(vx[1])} - ${inr(vx[0])} = ${up ? '' : '-'}${inr(size)}, ${up ? 'an increase' : 'a decrease'} of ${inr(size)}.`,
      ],
      hints: H.change,
    };
  },
  verify: (q) => {
    const first = q.prompt.split('\n')[0];
    const row = rowsIn(q.prompt).find(([name]) => first.includes(lower(name)));
    return row !== undefined && Math.abs(row[1][1] - row[1][0]) * 100 === q.answer;
  },
});

const pctChange = numericTemplate({
  id: 'fsa-pct-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const line = rng.pick(PL_LINES);
    const [a, b] = rng.pick(YEARS);
    const { prev, cur, change, p, up } = drawMove(rng, line);
    const word = up ? 'increase' : 'decrease';
    const prompt = rng.pick([
      `${company} reports ${lower(line.name)} of ${inr(prev)} for ${a} and ${inr(cur)} for ${b}. What percentage ${word} will its comparative Statement of Profit and Loss show for this line? ${TWO_DP}`,
      `In ${a} the ${lower(line.name)} of ${company} came to ${inr(prev)}; in ${b} the figure was ${inr(cur)}. Find the percentage ${word} compared with ${a}. ${TWO_DP}`,
      `${line.name} of ${company}: ${inr(prev)} in ${a}, ${inr(cur)} in ${b}. By what percentage did the figure ${up ? 'rise' : 'fall'}? ${TWO_DP}`,
    ]);
    const n = percent(p, [
      [roundPct(change, cur), `Divided the change by the figure of ${b}. The base is the earlier year, ${a}.`],
      [up ? 10000 + p : 10000 - p, `Gave the figure of ${b} as a percentage of the figure of ${a}. The change has to be taken first.`],
      [roundPct(prev, cur), `Divided the figure of ${a} by the figure of ${b}, without taking the change.`],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        `Absolute change = ${inr(cur)} - ${inr(prev)} = ${up ? '' : '-'}${inr(change)}.`,
        `Percentage change = absolute change ÷ figure of ${a} × 100 = ${inr(change)} ÷ ${inr(prev)} × 100 = ${pc(p)}${up ? '' : ', a decrease'}.`,
      ],
      hints: H.change,
    };
  },
  verify: (q) => {
    const [prev, cur] = amountsIn(q.prompt);
    return exactPct(Math.abs(cur - prev), prev) === q.answer;
  },
});

const bsPctFromChange = numericTemplate({
  id: 'fsa-bs-pct-from-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const line = rng.pick(BS_LINES);
    const [a, b] = rng.pick(DATES);
    const { prev, cur, change, p, up } = drawMove(rng, line);
    const word = up ? 'increase' : 'decrease';
    const prompt = rng.pick([
      `The balance sheet of ${company} showed ${lower(line.name)} of ${inr(prev)} as at ${a}. As at ${b} the figure was ${inr(change)} ${up ? 'higher' : 'lower'}. What percentage ${word} does the comparative balance sheet show for this line? ${TWO_DP}`,
      `The comparative balance sheet of ${company} shows ${lower(line.name)} of ${inr(prev)} as at ${a} and, against it, an absolute ${word} of ${inr(change)} as at ${b}. Find the percentage ${word} for this line. ${TWO_DP}`,
    ]);
    const n = percent(p, [
      [roundPct(change, cur), `Divided the change by the figure as at ${b}, ${inr(cur)}. The base is the figure as at ${a}.`],
      [roundPct(cur, prev), `Gave the figure as at ${b} as a percentage of the figure as at ${a}, in place of the change.`],
      [roundPct(prev, cur), `Divided the figure as at ${a} by the figure as at ${b}, without using the change.`],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        `The absolute change is given: ${inr(change)}, ${up ? 'an increase' : 'a decrease'}.`,
        `Percentage change = absolute change ÷ figure as at ${a} × 100 = ${inr(change)} ÷ ${inr(prev)} × 100 = ${pc(p)}.`,
      ],
      hints: H.change,
    };
  },
  verify: (q) => {
    const [prev, change] = amountsIn(q.prompt);
    return exactPct(change, prev) === q.answer;
  },
});

const currentFromPct = numericTemplate({
  id: 'fsa-current-from-pct', topicId: T, conceptId: 'fsa-comparative', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = rng.int(0, 1) === 0 ? bsPeriod(rng) : plPeriod(rng);
    const line = rng.pick(per.bs ? BS_LINES : PL_LINES);
    const { prev, cur, change, p, up } = drawMove(rng, line);
    const dir = up ? 'an increase' : 'a decrease';
    const prompt = per.bs
      ? `The balance sheet of ${company} as at ${per.a} showed ${lower(line.name)} of ${inr(prev)}. Its comparative balance sheet shows ${dir} of ${pc(p)} in this line as at ${per.b}. Find the figure as at ${per.b}.`
      : `${company} reported ${lower(line.name)} of ${inr(prev)} for ${per.a}. Its comparative Statement of Profit and Loss shows ${dir} of ${pc(p)} in this line for ${per.b}. Find the figure for ${per.b}.`;
    const back = (prev * 10000) / (up ? 10000 + p : 10000 - p);
    const n = money(cur, [
      [change, 'Gave the absolute change, not the figure of the later period.'],
      [up ? prev - change : prev + change, `Took the ${up ? 'increase' : 'decrease'} as ${up ? 'a decrease' : 'an increase'}.`],
      [back, `Divided by ${pc(up ? 10000 + p : 10000 - p)}, as if the figure given were the later one. It is the earlier one, the base, so the change is ${pc(p)} of it.`],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        `Absolute change = ${pc(p)} of the earlier figure = ${pc(p)} of ${inr(prev)} = ${inr(change)}.`,
        `Later figure = ${inr(prev)} ${up ? '+' : '-'} ${inr(change)} = ${inr(cur)}.`,
      ],
      hints: H.back,
    };
  },
  verify: (q) => {
    const [prev] = amountsIn(q.prompt);
    const [p] = pctsIn(q.prompt);
    return q.answer === (prev * (q.prompt.includes('an increase') ? 10000 + p : 10000 - p)) / 100;
  },
});

const previousFromChange = numericTemplate({
  id: 'fsa-previous-from-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = rng.int(0, 1) === 0 ? bsPeriod(rng) : plPeriod(rng);
    const line = rng.pick(per.bs ? BS_LINES : PL_LINES);
    const { prev, cur, change, p, up } = drawMove(rng, line);
    const dir = up ? 'an increase' : 'a decrease';
    const prompt = per.bs
      ? `The comparative balance sheet of ${company} shows that ${lower(line.name)} ${up ? 'rose' : 'fell'} by ${inr(change)} between ${per.a} and ${per.b}, ${dir} of ${pc(p)}. Find the figure as at ${per.a}.`
      : `The comparative Statement of Profit and Loss of ${company} shows that ${lower(line.name)} ${up ? 'rose' : 'fell'} by ${inr(change)} in ${per.b}, ${dir} of ${pc(p)} compared with ${per.a}. Find the figure for ${per.a}.`;
    const n = money(prev, [
      [share(change, p), `Took ${pc(p)} of the change. The change is ${pc(p)} of the earlier figure, so the change is divided by ${pc(p)}.`],
      [cur, `Gave the later figure: found the base and then ${up ? 'added' : 'deducted'} the change.`],
      [prev / 100, `Divided ${inr(change)} by ${p / 100} and did not multiply by 100.`],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        'Percentage change = absolute change ÷ earlier figure × 100, so earlier figure = absolute change × 100 ÷ percentage change.',
        `Earlier figure = ${inr(change)} × 100 ÷ ${p / 100} = ${inr(prev)}.`,
        `Check: ${pc(p)} of ${inr(prev)} = ${inr(change)}.`,
      ],
      hints: H.back,
    };
  },
  verify: (q) => {
    const [change] = amountsIn(q.prompt);
    const [p] = pctsIn(q.prompt);
    return q.answer === (change * 10000 * 100) / p;
  },
});

const previousFromCurrent = numericTemplate({
  id: 'fsa-previous-from-current', topicId: T, conceptId: 'fsa-comparative', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = rng.int(0, 1) === 0 ? bsPeriod(rng) : plPeriod(rng);
    const line = rng.pick(per.bs ? BS_LINES : PL_LINES);
    const { prev, cur, change, p, up } = drawMove(rng, line);
    const dir = up ? 'an increase' : 'a decrease';
    const factor = up ? 10000 + p : 10000 - p;
    const prompt = per.bs
      ? `The balance sheet of ${company} as at ${per.b} shows ${lower(line.name)} of ${inr(cur)}. The comparative balance sheet shows this as ${dir} of ${pc(p)} compared with the figure as at ${per.a}. What was the figure as at ${per.a}?`
      : `${company} reports ${lower(line.name)} of ${inr(cur)} for ${per.b}. Its comparative Statement of Profit and Loss shows this as ${dir} of ${pc(p)} compared with ${per.a}. What was the figure for ${per.a}?`;
    const n = money(prev, [
      [up ? cur - share(cur, p) : cur + share(cur, p), `Took ${pc(p)} of the later figure and ${up ? 'deducted' : 'added'} it. The percentage is worked on the earlier figure, which is the unknown.`],
      [change, 'Gave the absolute change, not the earlier figure.'],
      [up ? cur + share(cur, p) : cur - share(cur, p), `Applied the ${up ? 'increase' : 'decrease'} once more to the later figure instead of working back.`],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        `Take the earlier figure as 100%. After ${dir} of ${pc(p)} the later figure is ${pc(factor)} of it.`,
        `Earlier figure = ${inr(cur)} × 100 ÷ ${factor / 100} = ${inr(prev)}.`,
        `Check: ${pc(p)} of ${inr(prev)} = ${inr(change)}, and ${inr(prev)} ${up ? '+' : '-'} ${inr(change)} = ${inr(cur)}.`,
      ],
      hints: H.back,
    };
  },
  verify: (q) => {
    const [cur] = amountsIn(q.prompt);
    const [p] = pctsIn(q.prompt);
    return q.answer === (cur * 10000 * 100) / (q.prompt.includes('an increase') ? 10000 + p : 10000 - p);
  },
});

// ===============================================================================================================
// COMPARATIVE STATEMENTS: derived lines (medium)
// ===============================================================================================================

const totalIncomePct = numericTemplate({
  id: 'fsa-total-income-pct', topicId: T, conceptId: 'fsa-comparative', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const total1 = 80000 * rng.int(25, 100);
    const up = rng.int(0, 3) > 0;
    const p = rng.pick(up ? INC.filter((x) => x <= 3000) : DEC.filter((x) => x <= 2500));
    const change = (total1 * p) / 10000;
    const total2 = up ? total1 + change : total1 - change;
    const oi1 = 20000 * rng.int(2, 12);
    const oi2 = oi1 + 10000 * rng.int(-4, 8);
    const rev1 = total1 - oi1;
    const rev2 = total2 - oi2;
    if (oi2 <= 0 || oi2 === oi1 || rev2 === rev1) return null;
    const sign = up ? 1 : -1;
    const added = sign * Math.round((((rev2 - rev1) / rev1 + (oi2 - oi1) / oi1) * 10000));
    const word = up ? 'increase' : 'decrease';
    const n = percent(p, [
      [roundPct(Math.abs(rev2 - rev1), rev1), 'Worked on revenue from operations alone. Total income is revenue from operations plus other income.'],
      [roundPct(change, total2), `Divided the change in total income by the total income of ${per.b}. The base is the total income of ${per.a}.`],
      [added, 'Added the percentage changes of the two lines. The change of a total is worked on the totals themselves.'],
      [roundPct(change, rev1), `Divided the change in total income by the revenue from operations of ${per.a} instead of the total income of ${per.a}.`],
    ], DERIVED);
    return n && {
      prompt: `Find the percentage ${word} in the total income of ${company} that its comparative Statement of Profit and Loss will show. ${TWO_DP}\n${twoYears('Revenue from operations', [rev1, rev2], per)}\n${twoYears('Other income', [oi1, oi2], per)}`,
      ...n,
      explanation: [
        `Total income of ${per.a} = ${inr(rev1)} + ${inr(oi1)} = ${inr(total1)}.`,
        `Total income of ${per.b} = ${inr(rev2)} + ${inr(oi2)} = ${inr(total2)}.`,
        `Absolute change = ${inr(total2)} - ${inr(total1)} = ${up ? '' : '-'}${inr(change)}.`,
        `Percentage change = ${inr(change)} ÷ ${inr(total1)} × 100 = ${pc(p)}${up ? '' : ', a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const rows = rowsIn(q.prompt);
    const t1 = sum(rows.map(([, v]) => v[0]));
    const t2 = sum(rows.map(([, v]) => v[1]));
    return rows.length === 2 && exactPct(Math.abs(t2 - t1), t1) === q.answer;
  },
});

const MATERIAL_LINES = ['Cost of materials consumed', 'Purchases of stock-in-trade'];
/** An amount near `percent` per cent of `base`, in whole ten thousands of rupees. */
const near = (base: number, percentOfBase: number): number => 10000 * Math.round((base * percentOfBase) / 1000000);
/**
 * Three expense lines of a small Statement of Profit and Loss and their figures for a year of revenue `rev`: materials
 * or purchases, employee benefits and one more, each near the share of revenue such a line usually takes.
 */
function threeExpenses(rng: Rng, rev: number): { names: string[]; first: number[] } {
  const third = rng.pick(['Finance costs', 'Depreciation and amortisation expense', 'Other expenses']);
  // Employee benefits expense stands before finance costs, depreciation and other expenses in Schedule III.
  const others = ['Employee benefits expense', third];
  const usual = (name: string): number => (name === 'Employee benefits expense' ? rng.int(10, 20) : name === 'Other expenses' ? rng.int(6, 14) : rng.int(2, 7));
  return { names: [rng.pick(MATERIAL_LINES), ...others], first: [near(rev, rng.int(48, 60)), ...others.map((name) => near(rev, usual(name)))] };
}

const totalExpensesChange = numericTemplate({
  id: 'fsa-total-expenses-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const rev1 = 100000 * rng.int(20, 80);
    const rev2 = rev1 + 50000 * rng.pick([-4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 8, 10, 12]);
    const { names, first } = threeExpenses(rng, rev1);
    const signs = rng.shuffle([1, 1, -1]);
    const second = first.map((v, i) => v + signs[i] * 10000 * rng.int(1, Math.max(1, Math.floor(v / 50000))));
    const deltas = second.map((v, i) => v - first[i]);
    const delta = sum(deltas);
    if (Math.abs(delta) < 50000 || second.some((v) => v <= 0)) return null;
    const up = delta > 0;
    const fell = names[signs.indexOf(-1)];
    const n = money(Math.abs(delta), [
      [sum(deltas.map(Math.abs)), `Added the fall in ${lower(fell)} as though it were a rise.`],
      [Math.abs(rev2 - rev1 - delta), 'Gave the change in profit: the change in revenue from operations less the change in total expenses.'],
      [Math.abs(delta + rev2 - rev1), 'Counted revenue from operations among the expenses.'],
      [sum(second), `Gave the total expenses of ${per.b}, not the change in them.`],
    ]);
    return n && {
      prompt: `Find the ${up ? 'increase' : 'decrease'} in the total expenses of ${company} that its comparative Statement of Profit and Loss will show. These are its only expenses.\n${twoYears('Revenue from operations', [rev1, rev2], per)}\n${names.map((name, i) => twoYears(name, [first[i], second[i]], per)).join('\n')}`,
      ...n,
      explanation: [
        `Total expenses of ${per.a} = ${first.map(inr).join(' + ')} = ${inr(sum(first))}.`,
        `Total expenses of ${per.b} = ${second.map(inr).join(' + ')} = ${inr(sum(second))}.`,
        `Absolute change = ${inr(sum(second))} - ${inr(sum(first))} = ${up ? '' : '-'}${inr(Math.abs(delta))}, ${up ? 'an increase' : 'a decrease'}. Revenue from operations is not an expense.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const expenses = rowsIn(q.prompt).filter(([name]) => name !== 'Revenue from operations');
    return expenses.length === 3 && Math.abs(sum(expenses.map(([, v]) => v[1] - v[0]))) * 100 === q.answer;
  },
});

interface Group {
  name: string;
  parts: string[];
  min: number;
  max: number;
}
const BS_GROUPS: Group[] = [
  { name: "Shareholders' funds", parts: ['Share capital', 'Reserves and surplus'], min: 15, max: 60 },
  { name: 'Current assets', parts: ['Inventories', 'Trade receivables', 'Cash and cash equivalents'], min: 8, max: 40 },
  { name: 'Current liabilities', parts: ['Short-term borrowings', 'Trade payables', 'Short-term provisions'], min: 5, max: 30 },
  { name: 'Non-current assets', parts: ['Property, plant and equipment', 'Non-current investments'], min: 15, max: 70 },
];

const bsSubtotalPct = numericTemplate({
  id: 'fsa-bs-subtotal-pct', topicId: T, conceptId: 'fsa-comparative', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = bsPeriod(rng);
    const group = rng.pick(BS_GROUPS);
    const total1 = 80000 * rng.int(group.min, group.max);
    const up = rng.int(0, 3) > 0;
    const p = rng.pick(up ? INC.filter((x) => x <= 4000) : DEC.filter((x) => x <= 2500));
    const change = (total1 * p) / 10000;
    const total2 = up ? total1 + change : total1 - change;
    const weights = group.parts.length === 2 ? [rng.int(45, 70)] : [rng.int(30, 45), rng.int(25, 35)];
    const first = weights.map((w) => near(total1, w));
    // Share capital often stands unchanged from one balance sheet to the next.
    // It may rise (a fresh issue) but is never shown falling: a reduction of capital is outside the course.
    const second = first.map((v, i) =>
      group.parts[i] === 'Share capital' ? (rng.int(0, 1) === 0 ? v : v + 10000 * rng.int(1, Math.max(1, Math.floor(v / 40000)))) : v + 10000 * rng.int(-Math.floor(v / 80000), Math.floor(v / 40000)),
    );
    first.push(total1 - sum(first));
    second.push(total2 - sum(second));
    const last = group.parts.length - 1;
    if (first.some((v) => v <= 0) || second.some((v) => v <= 0) || second[last] === first[last]) return null;
    if (second[last] > 2 * first[last] || second[last] * 2 < first[last]) return null;
    const sign = up ? 1 : -1;
    const average = sign * Math.round((sum(first.map((v, i) => (second[i] - v) / v)) / first.length) * 10000);
    const word = up ? 'increase' : 'decrease';
    const n = percent(p, [
      [roundPct(change, total2), `Divided the change by the ${lower(group.name)} as at ${per.b}. The base is the figure as at ${per.a}.`],
      [roundPct(Math.abs(second[last] - first[last]), first[last]), `Worked on ${lower(group.parts[last])} alone. The percentage asked is for the whole of ${lower(group.name)}.`],
      [average, 'Averaged the percentage changes of the lines. The change of a total is worked on the totals themselves.'],
    ], DERIVED);
    return n && {
      prompt: `The ${lower(group.name)} of ${company} are made up of the lines below and nothing else. Find the percentage ${word} in ${lower(group.name)} that its comparative balance sheet will show. ${TWO_DP}\n${group.parts.map((name, i) => twoYears(name, [first[i], second[i]], per)).join('\n')}`,
      ...n,
      explanation: [
        `${group.name} as at ${per.a} = ${first.map(inr).join(' + ')} = ${inr(total1)}.`,
        `${group.name} as at ${per.b} = ${second.map(inr).join(' + ')} = ${inr(total2)}.`,
        `Absolute change = ${inr(total2)} - ${inr(total1)} = ${up ? '' : '-'}${inr(change)}.`,
        `Percentage change = ${inr(change)} ÷ ${inr(total1)} × 100 = ${pc(p)}${up ? '' : ', a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const rows = rowsIn(q.prompt);
    const t1 = sum(rows.map(([, v]) => v[0]));
    const t2 = sum(rows.map(([, v]) => v[1]));
    return exactPct(Math.abs(t2 - t1), t1) === q.answer;
  },
});

// ===============================================================================================================
// COMMON SIZE STATEMENTS: one line
// ===============================================================================================================

/** An expense line with the range of its share of revenue from operations, in whole per cent. */
interface CsLine {
  name: string;
  lo: number;
  hi: number;
}
const CS_PL: CsLine[] = [
  { name: 'Cost of materials consumed', lo: 40, hi: 60 },
  { name: 'Purchases of stock-in-trade', lo: 35, hi: 60 },
  { name: 'Employee benefits expense', lo: 8, hi: 22 },
  { name: 'Finance costs', lo: 2, hi: 6 },
  { name: 'Depreciation and amortisation expense', lo: 2, hi: 8 },
  { name: 'Other expenses', lo: 5, hi: 15 },
];
/** A share of the base in hundredths, a multiple of 0.5%: with a base in units of Rs 2,00,000 the amount is whole thousands. */
const csPct = (rng: Rng, l: CsLine): number => 50 * rng.int(l.lo * 2, l.hi * 2);

/** One year of a Statement of Profit and Loss: revenue, other income, total expenses and one expense line with its share. */
function drawCsPl(rng: Rng) {
  const rev = 200000 * rng.int(5, 40);
  const line = rng.pick(CS_PL);
  const p = csPct(rng, line);
  const oi = (rev * rng.pick([200, 250, 400, 500, 800])) / 10000;
  const expenses = (rev * rng.int(Math.max(70, Math.ceil(p / 100) + 10), 94)) / 100;
  return { rev, line, p, amt: (rev * p) / 10000, oi, expenses };
}

const CURRENT_ASSETS = ['Inventories', 'Trade receivables', 'Cash and cash equivalents', 'Current investments'];
const NON_CURRENT_ASSETS = ['Property, plant and equipment', 'Non-current investments', 'Long-term loans and advances'];

/** The assets of a balance sheet in two sub-totals, and one asset with its share of the total. */
function drawAsset(rng: Rng) {
  const total = 200000 * rng.int(5, 50);
  const n = rng.pick([40, 45, 55, 60, 65, 70]);
  const nca = (total * n) / 100;
  const current = rng.int(0, 2) > 0;
  const name = rng.pick(current ? CURRENT_ASSETS : NON_CURRENT_ASSETS);
  // One current asset is at most 30% of the total; property, plant and equipment is most of the non-current assets.
  const p = current ? 50 * rng.int(8, 2 * Math.min(95 - n, 30)) : name === 'Property, plant and equipment' ? 50 * rng.int(2 * (n - 25), 2 * (n - 5)) : 50 * rng.int(10, 2 * Math.min(n - 10, 24));
  return { total, nca, ca: total - nca, current, name, p, amt: (total * p) / 10000 };
}

const csPctPl = numericTemplate({
  id: 'fsa-cs-pct-pl', topicId: T, conceptId: 'fsa-common-size', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [, b] = rng.pick(YEARS);
    const { rev, line, p, amt, oi, expenses } = drawCsPl(rng);
    const name = lower(line.name);
    const prompt =
      rng.int(0, 1) === 0
        ? `For ${b}, ${company} has revenue from operations of ${inr(rev)}, other income of ${inr(oi)} and total expenses of ${inr(expenses)}, of which ${inr(amt)} is ${name}. At what percentage will ${name} be shown in the common size Statement of Profit and Loss ${ON_REVENUE}? ${TWO_DP}`
        : `Find the percentage at which ${name} will be shown in the common size Statement of Profit and Loss ${ON_REVENUE} of ${company} for ${b}. ${TWO_DP}\nRevenue from operations: ${inr(rev)}\nOther income: ${inr(oi)}\n${line.name}: ${inr(amt)}\nTotal expenses: ${inr(expenses)}`;
    const n = percent(p, [
      [roundPct(amt, rev + oi), 'Took total income (revenue from operations plus other income) as the base. The base stated is revenue from operations alone.'],
      [roundPct(amt, expenses), 'Expressed the line as a percentage of total expenses. Every line of the statement is a percentage of revenue from operations.'],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        'In a common size Statement of Profit and Loss, revenue from operations is taken as 100.',
        `${line.name} = ${inr(amt)} ÷ ${inr(rev)} × 100 = ${pc(p)}.`,
      ],
      hints: H.csPl,
    };
  },
  verify: (q) => {
    const v = amountsIn(q.prompt);
    return v.length === 4 && exactPct(Math.min(v[2], v[3]), v[0]) === q.answer;
  },
});

const csPctBs = numericTemplate({
  id: 'fsa-cs-pct-bs', topicId: T, conceptId: 'fsa-common-size', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [, b] = rng.pick(DATES);
    const { total, nca, ca, current, name, p, amt } = drawAsset(rng);
    const n = percent(p, [
      [
        roundPct(amt, current ? ca : nca),
        `Took ${current ? 'current assets' : 'non-current assets'}, the sub-total the line belongs to, as the base. Every line is a percentage of the total of the balance sheet.`,
      ],
      [roundPct(amt, current ? nca : ca), `Took ${current ? 'non-current assets' : 'current assets'} alone as total assets.`],
    ]);
    return n && {
      prompt: `The balance sheet of ${company} as at ${b} shows non-current assets of ${inr(nca)} and current assets of ${inr(ca)}, a total of ${inr(total)}. The figure for ${lower(name)} is ${inr(amt)}. At what percentage will ${lower(name)} appear in the common size balance sheet? ${TWO_DP}`,
      ...n,
      explanation: [
        'In a common size balance sheet, total assets (which equal total equity and liabilities) are taken as 100.',
        `${name} = ${inr(amt)} ÷ ${inr(total)} × 100 = ${pc(p)}.`,
      ],
      hints: H.csBs,
    };
  },
  verify: (q) => {
    const [nca, ca, total, amt] = amountsIn(q.prompt);
    return nca + ca === total && exactPct(amt, nca + ca) === q.answer;
  },
});

const csAmountFromPct = numericTemplate({
  id: 'fsa-cs-amount-from-pct', topicId: T, conceptId: 'fsa-common-size', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    if (rng.int(0, 1) === 0) {
      const [, b] = rng.pick(YEARS);
      const { rev, line, p, amt, oi, expenses } = drawCsPl(rng);
      const n = money(amt, [
        [share(rev + oi, p), 'Applied the percentage to total income. The base of the statement is revenue from operations alone.'],
        [share(expenses, p), 'Applied the percentage to total expenses. Every line is a percentage of revenue from operations.'],
      ]);
      return n && {
        prompt: `The common size Statement of Profit and Loss ${ON_REVENUE} of ${company} for ${b} shows ${lower(line.name)} at ${pc(p)}. Revenue from operations is ${inr(rev)}, other income is ${inr(oi)} and total expenses are ${inr(expenses)}. Find the amount of ${lower(line.name)}.`,
        ...n,
        explanation: ['The percentage of a line is a percentage of revenue from operations.', `${line.name} = ${pc(p)} of ${inr(rev)} = ${inr(amt)}.`],
        hints: H.csPl,
      };
    }
    const [, b] = rng.pick(DATES);
    const { total, nca, ca, current, name, p, amt } = drawAsset(rng);
    const n = money(amt, [
      [share(current ? ca : nca, p), `Applied the percentage to ${current ? 'current assets' : 'non-current assets'}, the sub-total the line belongs to. The base is the total of the balance sheet.`],
      [share(current ? nca : ca, p), `Applied the percentage to ${current ? 'non-current assets' : 'current assets'} alone. Total assets are non-current assets plus current assets.`],
    ]);
    return n && {
      prompt: `The common size balance sheet of ${company} as at ${b} shows ${lower(name)} at ${pc(p)}. Non-current assets are ${inr(nca)} and current assets are ${inr(ca)}. Find the amount of ${lower(name)}.`,
      ...n,
      explanation: [
        `Total assets = ${inr(nca)} + ${inr(ca)} = ${inr(total)}. This total is the base of the common size balance sheet.`,
        `${name} = ${pc(p)} of ${inr(total)} = ${inr(amt)}.`,
      ],
      hints: H.csBs,
    };
  },
  verify: (q) => {
    const v = amountsIn(q.prompt);
    const [p] = pctsIn(q.prompt);
    const base = q.prompt.includes('balance sheet') ? v[0] + v[1] : v[0];
    return q.answer === (base * p) / 100;
  },
});

const csBaseFromLine = numericTemplate({
  id: 'fsa-cs-base-from-line', topicId: T, conceptId: 'fsa-common-size', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const bs = rng.int(0, 1) === 0;
    let base: number, name: string, p: number, amt: number, prompt: string;
    if (bs) {
      const [, b] = rng.pick(DATES);
      ({ total: base, name, p, amt } = drawAsset(rng));
      prompt = `The balance sheet of ${company} as at ${b} shows ${lower(name)} of ${inr(amt)}. In the common size balance sheet this line stands at ${pc(p)}. Find the total of the balance sheet (total assets).`;
    } else {
      const [, b] = rng.pick(YEARS);
      const d = drawCsPl(rng);
      ({ rev: base, p, amt } = d);
      name = d.line.name;
      prompt = `${company} shows ${lower(name)} of ${inr(amt)} for ${b}. In its common size Statement of Profit and Loss ${ON_REVENUE} this line stands at ${pc(p)}. Find the revenue from operations of ${b}.`;
    }
    const n = money(base, [
      [share(amt, p), `Took ${pc(p)} of the line. The line is ${pc(p)} of the base, so the line is divided by ${pc(p)}.`],
      [base / 100, `Divided ${inr(amt)} by ${p / 100} and did not multiply by 100.`],
      [base - amt, 'Found the base and then deducted the line from it.'],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        `Percentage of a line = the line ÷ base × 100, so base = the line × 100 ÷ its percentage. The base is ${bs ? 'the total of the balance sheet' : 'revenue from operations'}.`,
        `Base = ${inr(amt)} × 100 ÷ ${p / 100} = ${inr(base)}.`,
        `Check: ${pc(p)} of ${inr(base)} = ${inr(amt)}.`,
      ],
      hints: bs ? H.csBs : H.csPl,
    };
  },
  verify: (q) => {
    const [amt] = amountsIn(q.prompt);
    const [p] = pctsIn(q.prompt);
    return q.answer === (amt * 10000 * 100) / p;
  },
});

const csTotalIncomePct = numericTemplate({
  id: 'fsa-cs-total-income-pct', topicId: T, conceptId: 'fsa-common-size', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [, b] = rng.pick(YEARS);
    const rev = 200000 * rng.int(5, 40);
    const q = rng.pick([200, 250, 400, 500, 750, 800, 1000, 1250]);
    const oi = (rev * q) / 10000;
    const total = rng.int(0, 2) > 0;
    const n = total
      ? percent(10000 + q, [
          [10000, 'Took total income as the base, which would make it 100. The base stated is revenue from operations, so total income comes to more than 100.'],
          [roundPct(rev, rev + oi), 'Expressed revenue from operations as a percentage of total income, the wrong way round.'],
          [q, 'Gave the percentage for other income alone, not for total income.'],
        ])
      : percent(q, [
          [roundPct(oi, rev + oi), 'Took total income as the base. Other income, like every line, is a percentage of revenue from operations.'],
          [10000 + q, 'Gave the percentage for total income, not for other income.'],
        ]);
    return n && {
      prompt: `For ${b}, ${company} has revenue from operations of ${inr(rev)} and other income of ${inr(oi)}. At what percentage is ${total ? 'total income' : 'other income'} shown in its common size Statement of Profit and Loss ${ON_REVENUE}? ${TWO_DP}`,
      ...n,
      explanation: total
        ? [
            `Total income = ${inr(rev)} + ${inr(oi)} = ${inr(rev + oi)}.`,
            `The base is revenue from operations: ${inr(rev + oi)} ÷ ${inr(rev)} × 100 = ${pc(10000 + q)}. Total income is more than 100 whenever there is other income.`,
          ]
        : ['The base is revenue from operations, which is 100.', `Other income = ${inr(oi)} ÷ ${inr(rev)} × 100 = ${pc(q)}.`],
      hints: H.csPl,
    };
  },
  verify: (q) => {
    const [rev, oi] = amountsIn(q.prompt);
    return exactPct(q.prompt.includes('is total income shown') ? rev + oi : oi, rev) === q.answer;
  },
});

// ===============================================================================================================
// COMPLEX: a small statement, and a derived line is asked
// ===============================================================================================================

const pbtChange = numericTemplate({
  id: 'fsa-pbt-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const rev1 = 100000 * rng.int(20, 80);
    const g = rng.pick([-8, -5, -4, 5, 8, 10, 12, 15, 20, 25]);
    const rev2 = near(rev1, 100 + g);
    const { names, first } = threeExpenses(rng, rev1);
    const second = first.map((v) => near(v, 100 + g + rng.int(-6, 8)));
    const oi1 = 10000 * rng.int(2, 20);
    const oi2 = oi1 + 10000 * rng.pick([-2, -1, 1, 2, 3, 4, 5]);
    const income = [rev1 + oi1, rev2 + oi2];
    const expenses = [sum(first), sum(second)];
    const pbt = [income[0] - expenses[0], income[1] - expenses[1]];
    if (oi2 <= 0 || pbt[0] <= 0 || pbt[1] <= 0 || Math.abs(pbt[1] - pbt[0]) < 50000) return null;
    const dRev = rev2 - rev1;
    const dOi = oi2 - oi1;
    const dExp = expenses[1] - expenses[0];
    const delta = pbt[1] - pbt[0];
    const up = delta > 0;
    const n = money(Math.abs(delta), [
      [Math.abs(dRev - dExp), 'Left other income out. Profit before tax = revenue from operations + other income - total expenses.'],
      [Math.abs(dRev + dOi), 'Gave the change in total income and did not deduct the change in total expenses.'],
      [Math.abs(dExp), 'Gave the change in total expenses, not in profit before tax.'],
      [Math.abs(dRev + dOi + dExp), 'Added the change in total expenses to the change in total income instead of deducting it.'],
      [pbt[1], `Gave the profit before tax of ${per.b}, not the change in it.`],
    ]);
    return n && {
      prompt: `Find the ${up ? 'increase' : 'decrease'} in the profit before tax of ${company} that its comparative Statement of Profit and Loss will show. The expenses below are its only expenses.\n${twoYears('Revenue from operations', [rev1, rev2], per)}\n${twoYears('Other income', [oi1, oi2], per)}\n${names.map((name, i) => twoYears(name, [first[i], second[i]], per)).join('\n')}`,
      ...n,
      explanation: [
        `Total income: ${inr(income[0])} in ${per.a}; ${inr(income[1])} in ${per.b}.`,
        `Total expenses: ${inr(expenses[0])} in ${per.a}; ${inr(expenses[1])} in ${per.b}.`,
        `Profit before tax = total income - total expenses: ${inr(pbt[0])} in ${per.a}; ${inr(pbt[1])} in ${per.b}.`,
        `Absolute change = ${inr(pbt[1])} - ${inr(pbt[0])} = ${up ? '' : '-'}${inr(Math.abs(delta))}, ${up ? 'an increase' : 'a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    // Another way: the change in profit is the change in each income less the change in each expense.
    const delta = sum(rowsIn(q.prompt).map(([name, v]) => (name === 'Revenue from operations' || name === 'Other income' ? 1 : -1) * (v[1] - v[0])));
    return Math.abs(delta) * 100 === q.answer;
  },
});

const pbtPct = numericTemplate({
  id: 'fsa-pbt-pct', topicId: T, conceptId: 'fsa-comparative', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const pbt1 = 80000 * rng.int(3, 15);
    const up = rng.int(0, 2) > 0;
    const p = rng.pick(up ? INC.filter((x) => x <= 5000) : DEC.filter((x) => x <= 4000));
    const change = (pbt1 * p) / 10000;
    const pbt2 = up ? pbt1 + change : pbt1 - change;
    const rev1 = pbt1 * rng.pick([6, 8, 10]);
    const g = rng.pick([-6, -4, 4, 6, 8, 10, 12, 15, 20]);
    const rev2 = near(rev1, 100 + g);
    const material = rng.pick(MATERIAL_LINES);
    const emp1 = near(rev1, rng.int(10, 18));
    const oth1 = near(rev1, rng.int(8, 14));
    const emp2 = near(emp1, 100 + g + rng.int(-5, 5));
    const oth2 = near(oth1, 100 + g + rng.int(-5, 5));
    const oi1 = 10000 * rng.int(2, 10);
    const oi2 = oi1 + 10000 * rng.pick([-1, 1, 2, 3]);
    // The materials line is what is left, so that profit before tax comes to the figures chosen.
    const mat1 = rev1 + oi1 - pbt1 - emp1 - oth1;
    const mat2 = rev2 + oi2 - pbt2 - emp2 - oth2;
    if (oi2 <= 0 || mat2 > 1.4 * mat1 || mat2 < 0.75 * mat1) return null;
    const word = up ? 'increase' : 'decrease';
    const n = percent(p, [
      [roundPct(change, pbt2), `Divided the change by the profit before tax of ${per.b}. The base is the profit before tax of ${per.a}.`],
      [roundPct(Math.abs(rev2 - rev1), rev1), 'Gave the percentage change in revenue from operations. Profit before tax has to be worked out for each year and its own change taken.'],
      [roundPct(Math.abs(pbt2 - oi2 - (pbt1 - oi1)), pbt1 - oi1), 'Left other income out of the profit of both years.'],
      [up ? 10000 + p : 10000 - p, `Gave the profit before tax of ${per.b} as a percentage of that of ${per.a}, in place of the change.`],
    ], DERIVED);
    return n && {
      prompt: `Find the percentage ${word} in the profit before tax of ${company} that its comparative Statement of Profit and Loss will show. The expenses below are its only expenses. ${TWO_DP}\n${twoYears('Revenue from operations', [rev1, rev2], per)}\n${twoYears('Other income', [oi1, oi2], per)}\n${twoYears(material, [mat1, mat2], per)}\n${twoYears('Employee benefits expense', [emp1, emp2], per)}\n${twoYears('Other expenses', [oth1, oth2], per)}`,
      ...n,
      explanation: [
        `Total income: ${inr(rev1 + oi1)} in ${per.a}; ${inr(rev2 + oi2)} in ${per.b}.`,
        `Total expenses: ${inr(mat1 + emp1 + oth1)} in ${per.a}; ${inr(mat2 + emp2 + oth2)} in ${per.b}.`,
        `Profit before tax: ${inr(pbt1)} in ${per.a}; ${inr(pbt2)} in ${per.b}. Absolute change = ${up ? '' : '-'}${inr(change)}.`,
        `Percentage change = ${inr(change)} ÷ ${inr(pbt1)} × 100 = ${pc(p)}${up ? '' : ', a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const profit = (k: number): number => sum(rowsIn(q.prompt).map(([name, v]) => (name === 'Revenue from operations' || name === 'Other income' ? v[k] : -v[k])));
    return exactPct(Math.abs(profit(1) - profit(0)), profit(0)) === q.answer;
  },
});

/** Revenue, other income and total expenses of two years, with the profit before tax of each (whole ten thousands). */
function drawTaxPl(rng: Rng) {
  const rev1 = 100000 * rng.int(20, 80);
  const g = rng.pick([-8, -5, 5, 8, 10, 12, 15, 20, 25]);
  const rev2 = near(rev1, 100 + g);
  const exp1 = near(rev1, rng.int(70, 88));
  const exp2 = near(exp1, 100 + g + rng.int(-6, 6));
  const oi1 = 10000 * rng.int(2, 15);
  const oi2 = oi1 + 10000 * rng.pick([-2, -1, 1, 2, 3, 4, 5]);
  const pbt = [rev1 + oi1 - exp1, rev2 + oi2 - exp2];
  if (oi2 <= 0 || exp2 === exp1 || pbt[0] <= 0 || pbt[1] <= 0 || Math.abs(pbt[1] - pbt[0]) < 50000) return null;
  return { rev: [rev1, rev2], oi: [oi1, oi2], exp: [exp1, exp2], pbt };
}
type TaxPl = NonNullable<ReturnType<typeof drawTaxPl>>;
const taxRows = (s: TaxPl, per: Period): string =>
  [twoYears('Revenue from operations', s.rev, per), twoYears('Other income', s.oi, per), twoYears('Total expenses', s.exp, per)].join('\n');
/** Profit before tax of each year from the rows of a prompt. */
const pbtIn = (prompt: string): number[] => [0, 1].map((k) => sum(rowsIn(prompt).map(([name, v]) => (name === 'Total expenses' ? -v[k] : v[k]))));

const taxChange = numericTemplate({
  id: 'fsa-tax-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const s = drawTaxPl(rng);
    if (!s) return null;
    const t = rng.pick([25, 30, 40, 50]);
    const tax = s.pbt.map((v) => (v * t) / 100);
    const dPbt = s.pbt[1] - s.pbt[0];
    const delta = tax[1] - tax[0];
    const up = delta > 0;
    const n = money(Math.abs(delta), [
      [Math.abs(dPbt), 'Gave the change in profit before tax and did not apply the rate of tax.'],
      [(Math.abs(dPbt) * (100 - t)) / 100, 'Gave the change in profit after tax, not in tax.'],
      [(Math.abs(s.rev[1] + s.oi[1] - s.rev[0] - s.oi[0]) * t) / 100, 'Charged tax on total income. Tax is worked on profit before tax, after total expenses are deducted.'],
      [(Math.abs(s.rev[1] - s.exp[1] - (s.rev[0] - s.exp[0])) * t) / 100, 'Left other income out of profit before tax.'],
      [tax[1], `Gave the tax of ${per.b}, not the change in it.`],
    ]);
    return n && {
      prompt: `Tax is ${t}% of profit before tax in both years. Find the ${up ? 'increase' : 'decrease'} in tax that the comparative Statement of Profit and Loss of ${company} will show.\n${taxRows(s, per)}`,
      ...n,
      explanation: [
        `Profit before tax = revenue from operations + other income - total expenses: ${inr(s.pbt[0])} in ${per.a}; ${inr(s.pbt[1])} in ${per.b}.`,
        `Tax at ${t}%: ${inr(tax[0])} in ${per.a}; ${inr(tax[1])} in ${per.b}.`,
        `Absolute change in tax = ${inr(tax[1])} - ${inr(tax[0])} = ${up ? '' : '-'}${inr(Math.abs(delta))}, ${up ? 'an increase' : 'a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const [t] = pctsIn(q.prompt);
    const pbt = pbtIn(q.prompt);
    return q.answer === Math.abs(pbt[1] - pbt[0]) * t / 100;
  },
});

const patChange = numericTemplate({
  id: 'fsa-pat-change', topicId: T, conceptId: 'fsa-comparative', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const s = drawTaxPl(rng);
    if (!s) return null;
    const t1 = rng.pick([25, 30, 40]);
    const same = rng.int(0, 2) > 0;
    const t2 = same ? t1 : rng.pick([25, 30, 40].filter((x) => x !== t1));
    const tax = [(s.pbt[0] * t1) / 100, (s.pbt[1] * t2) / 100];
    const pat = [s.pbt[0] - tax[0], s.pbt[1] - tax[1]];
    const delta = pat[1] - pat[0];
    if (delta === 0) return null;
    const up = delta > 0;
    const dPbt = Math.abs(s.pbt[1] - s.pbt[0]);
    const n = money(Math.abs(delta), [
      [dPbt, 'Gave the change in profit before tax. Tax has still to be deducted in each year.'],
      [Math.abs(tax[1] - tax[0]), 'Gave the change in tax, not in profit after tax.'],
      ...(same ? [] : [[(dPbt * (100 - t1)) / 100, `Used ${t1}% for both years. The rate for ${per.b} is ${t2}%.`] as Err]),
      [pat[1], `Gave the profit after tax of ${per.b}, not the change in it.`],
    ]);
    return n && {
      prompt: `Tax is ${same ? `${t1}% of profit before tax in both years` : `${t1}% of profit before tax in ${per.a} and ${t2}% in ${per.b}`}. Find the ${up ? 'increase' : 'decrease'} in profit after tax that the comparative Statement of Profit and Loss of ${company} will show.\n${taxRows(s, per)}`,
      ...n,
      explanation: [
        `Profit before tax = revenue from operations + other income - total expenses: ${inr(s.pbt[0])} in ${per.a}; ${inr(s.pbt[1])} in ${per.b}.`,
        `Tax: ${t1}% of ${inr(s.pbt[0])} = ${inr(tax[0])}; ${t2}% of ${inr(s.pbt[1])} = ${inr(tax[1])}.`,
        `Profit after tax: ${inr(pat[0])} in ${per.a}; ${inr(pat[1])} in ${per.b}.`,
        `Absolute change = ${inr(pat[1])} - ${inr(pat[0])} = ${up ? '' : '-'}${inr(Math.abs(delta))}, ${up ? 'an increase' : 'a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const rates = pctsIn(q.prompt.split('\n')[0]);
    const pbt = pbtIn(q.prompt);
    const after = (k: number): number => (pbt[k] * (100 * 100 - rates[Math.min(k, rates.length - 1)])) / 10000;
    return q.answer === Math.abs(after(1) - after(0)) * 100;
  },
});

const totalAssetsPct = numericTemplate({
  id: 'fsa-total-assets-pct', topicId: T, conceptId: 'fsa-comparative', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = bsPeriod(rng);
    const total1 = 80000 * rng.int(25, 125);
    const up = rng.int(0, 3) > 0;
    const p = rng.pick(up ? INC.filter((x) => x <= 4000) : DEC.filter((x) => x <= 2500));
    const change = (total1 * p) / 10000;
    const total2 = up ? total1 + change : total1 - change;
    const sf1 = near(total1, rng.int(40, 60));
    const ncl1 = near(total1, rng.int(15, 30));
    const cl1 = total1 - sf1 - ncl1;
    // Each head moves roughly with the total, so that current liabilities, the balancing figure, stay in proportion.
    const g = (up ? p : -p) / 100;
    const sf2 = near(sf1, 100 + g + rng.int(-6, 6));
    const ncl2 = near(ncl1, 100 + g + rng.int(-10, 10));
    const cl2 = total2 - sf2 - ncl2;
    if (cl1 <= 0 || cl2 <= 0 || cl2 > 2 * cl1 || 2 * cl2 < cl1 || sf2 === sf1 || ncl2 === ncl1 || cl2 === cl1) return null;
    const sign = up ? 1 : -1;
    const average = sign * Math.round((((sf2 - sf1) / sf1 + (ncl2 - ncl1) / ncl1 + (cl2 - cl1) / cl1) / 3) * 10000);
    const word = up ? 'increase' : 'decrease';
    const n = percent(p, [
      [roundPct(change, total2), `Divided the change by the total as at ${per.b}. The base is the total as at ${per.a}.`],
      [roundPct(Math.abs(sf2 - sf1), sf1), "Worked on shareholders' funds alone. Total assets equal the whole of equity and liabilities."],
      [roundPct(Math.abs(ncl2 + cl2 - ncl1 - cl1), ncl1 + cl1), "Left shareholders' funds out and took the liabilities alone as the total."],
      [average, 'Averaged the percentage changes of the three lines. The change of a total is worked on the totals themselves.'],
    ], DERIVED);
    return n && {
      prompt: `Only the equity and liabilities of ${company} are given. Find the percentage ${word} in its total assets that the comparative balance sheet will show. ${TWO_DP}\n${twoYears("Shareholders' funds", [sf1, sf2], per)}\n${twoYears('Non-current liabilities', [ncl1, ncl2], per)}\n${twoYears('Current liabilities', [cl1, cl2], per)}`,
      ...n,
      explanation: [
        'A balance sheet balances: total assets = total equity and liabilities.',
        `Total as at ${per.a} = ${inr(sf1)} + ${inr(ncl1)} + ${inr(cl1)} = ${inr(total1)}; as at ${per.b} = ${inr(sf2)} + ${inr(ncl2)} + ${inr(cl2)} = ${inr(total2)}.`,
        `Absolute change = ${up ? '' : '-'}${inr(change)}. Percentage change = ${inr(change)} ÷ ${inr(total1)} × 100 = ${pc(p)}${up ? '' : ', a decrease'}.`,
      ],
      hints: H.derived,
    };
  },
  verify: (q) => {
    const rows = rowsIn(q.prompt);
    const t1 = sum(rows.map(([, v]) => v[0]));
    const t2 = sum(rows.map(([, v]) => v[1]));
    return rows.length === 3 && exactPct(Math.abs(t2 - t1), t1) === q.answer;
  },
});

const csProfitPct = numericTemplate({
  id: 'fsa-cs-profit-pct', topicId: T, conceptId: 'fsa-common-size', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [, b] = rng.pick(YEARS);
    const rev = 200000 * rng.int(5, 40);
    const p = 50 * rng.int(16, 48);
    const pbt = (rev * p) / 10000;
    const oi = (rev * rng.pick([200, 250, 400, 500])) / 10000;
    const material = rng.pick(MATERIAL_LINES);
    const emp = near(rev, rng.int(10, 18));
    const oth = near(rev, rng.int(8, 14));
    // The materials line is what is left, so that profit before tax is the share chosen.
    const mat = rev + oi - pbt - emp - oth;
    if (mat < 0.35 * rev) return null;
    const expenses = mat + emp + oth;
    const afterTax = rng.int(0, 2) === 0;
    const t = rng.pick([20, 30, 40, 50]);
    const tax = (pbt * t) / 100;
    const pat = pbt - tax;
    const answer = afterTax ? (p * (100 - t)) / 100 : p;
    const n = afterTax
      ? percent(answer, [
          [p, 'Stopped at profit before tax and did not deduct tax.'],
          [roundPct(pat, rev + oi), 'Took total income as the base. The base is revenue from operations alone.'],
          [roundPct(tax, rev), 'Gave the percentage for tax, not for profit after tax.'],
          [roundPct(((pbt - oi) * (100 - t)) / 100, rev), 'Left other income out of the profit on which tax is worked.'],
        ])
      : percent(answer, [
          [roundPct(pbt, rev + oi), 'Took total income as the base. The base is revenue from operations alone.'],
          [roundPct(pbt - oi, rev), 'Left other income out of profit before tax.'],
          [roundPct(expenses, rev), 'Gave total expenses as a percentage of revenue from operations, not profit before tax.'],
        ]);
    return n && {
      prompt: `From these figures of ${company} for ${b}, find the percentage at which profit ${afterTax ? 'after tax' : 'before tax'} is shown in the common size Statement of Profit and Loss ${ON_REVENUE}. The expenses below are its only expenses. ${afterTax ? `Tax is ${t}% of profit before tax. ` : ''}${TWO_DP}\nRevenue from operations: ${inr(rev)}\nOther income: ${inr(oi)}\n${material}: ${inr(mat)}\nEmployee benefits expense: ${inr(emp)}\nOther expenses: ${inr(oth)}`,
      ...n,
      explanation: [
        `Total income = ${inr(rev)} + ${inr(oi)} = ${inr(rev + oi)}. Total expenses = ${inr(mat)} + ${inr(emp)} + ${inr(oth)} = ${inr(expenses)}.`,
        `Profit before tax = ${inr(rev + oi)} - ${inr(expenses)} = ${inr(pbt)}.`,
        ...(afterTax ? [`Tax = ${t}% of ${inr(pbt)} = ${inr(tax)}. Profit after tax = ${inr(pat)}.`] : []),
        `Percentage = ${inr(afterTax ? pat : pbt)} ÷ revenue from operations ${inr(rev)} × 100 = ${pc(answer)}.`,
      ],
      hints: H.csPl,
    };
  },
  verify: (q) => {
    const rows = rowsIn(q.prompt);
    const rev = rows[0][1][0];
    const pbt = sum(rows.map(([name, v]) => (name === 'Revenue from operations' || name === 'Other income' ? v[0] : -v[0])));
    const [t] = pctsIn(q.prompt.split('\n')[0]);
    // `t` is in hundredths of a percent, like every percentage read back from a prompt.
    return exactPct(q.prompt.includes('profit after tax is shown') ? (pbt * (10000 - t)) / 10000 : pbt, rev) === q.answer;
  },
});

const csBsDerived = numericTemplate({
  id: 'fsa-cs-bs-derived', topicId: T, conceptId: 'fsa-common-size', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [, b] = rng.pick(DATES);
    const total = 200000 * rng.int(8, 60);
    const s = 5 * rng.int(8, 12);
    const sf = (total * s) / 100;
    const ncl = (total * 5 * rng.int(3, 6)) / 100;
    const cl = total - sf - ncl;
    const a = rng.pick([45, 55, 60, 65]);
    const nca = (total * a) / 100;
    const ca = total - nca;
    if (rng.int(0, 1) === 0) {
      // An asset is asked, and total assets have to come from the other side of the balance sheet.
      const name = rng.pick(CURRENT_ASSETS);
      const p = 50 * rng.int(8, 2 * Math.min(95 - a, 30));
      const amt = (total * p) / 10000;
      const n = percent(p, [
        [roundPct(amt, nca), "Took non-current assets as total assets. Total assets equal total equity and liabilities: shareholders' funds plus all the liabilities."],
        [roundPct(amt, ca), 'Took current assets (the total less non-current assets) as the base. Every line is a percentage of the total of the balance sheet.'],
        [roundPct(amt, sf), "Took shareholders' funds as the base and left the liabilities out of the total."],
        [roundPct(amt, ncl + cl), "Left shareholders' funds out of the total of the balance sheet."],
      ]);
      return n && {
        prompt: `Find the percentage at which ${lower(name)} will appear in the common size balance sheet of ${company} as at ${b}. ${TWO_DP}\nShareholders' funds: ${inr(sf)}\nNon-current liabilities: ${inr(ncl)}\nCurrent liabilities: ${inr(cl)}\nNon-current assets: ${inr(nca)}\n${name}: ${inr(amt)}`,
        ...n,
        explanation: [
          `Total equity and liabilities = ${inr(sf)} + ${inr(ncl)} + ${inr(cl)} = ${inr(total)}. Total assets are the same figure, and it is the base.`,
          `${name} = ${inr(amt)} ÷ ${inr(total)} × 100 = ${pc(p)}.`,
        ],
        hints: H.csBs,
      };
    }
    // A line of equity and liabilities is asked, and the total has to come from the assets.
    const name = rng.pick(['Long-term borrowings', 'Trade payables', 'Reserves and surplus']);
    const top = name === 'Long-term borrowings' ? (100 * ncl) / total : name === 'Trade payables' ? (100 * cl) / total : s - 10;
    if (top < 6) return null;
    const p = 50 * rng.int(8, 2 * top);
    const amt = (total * p) / 10000;
    const n = percent(p, [
      [roundPct(amt, nca), 'Took non-current assets alone as the total of the balance sheet. Current assets belong to the total too.'],
      [roundPct(amt, total - sf), "Took total liabilities as the base and left shareholders' funds out."],
      [roundPct(amt, sf), "Took shareholders' funds as the base. Every line is a percentage of the total of the balance sheet."],
      [roundPct(amt, ca), 'Took current assets alone as the total of the balance sheet.'],
    ]);
    return n && {
      prompt: `Find the percentage at which ${lower(name)} will appear in the common size balance sheet of ${company} as at ${b}. ${TWO_DP}\nShareholders' funds: ${inr(sf)}\n${name}: ${inr(amt)}\nNon-current assets: ${inr(nca)}\nCurrent assets: ${inr(ca)}`,
      ...n,
      explanation: [
        `Total assets = ${inr(nca)} + ${inr(ca)} = ${inr(total)}. Total equity and liabilities are the same figure, and it is the base.`,
        `${name} = ${inr(amt)} ÷ ${inr(total)} × 100 = ${pc(p)}.`,
      ],
      hints: H.csBs,
    };
  },
  verify: (q) => {
    const v = rowsIn(q.prompt).map(([, x]) => x[0]);
    // Five rows: the three heads of equity and liabilities, non-current assets, the asset. Four: shareholders' funds, the line, the two heads of assets.
    return v.length === 5 ? exactPct(v[4], v[0] + v[1] + v[2]) === q.answer : v.length === 4 && exactPct(v[1], v[2] + v[3]) === q.answer;
  },
});

const csToChange = numericTemplate({
  id: 'fsa-cs-to-change', topicId: T, conceptId: 'fsa-common-size', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [a, b] = rng.pick(YEARS);
    const line = rng.pick(CS_PL);
    const k = rng.int(5, 35);
    const rev1 = 200000 * k;
    const rev2 = rev1 + 200000 * rng.pick([-1, 1, 1, 2, 2, 3].map((x) => x * Math.max(1, Math.floor(k / 10))));
    const p1 = csPct(rng, line);
    const p2 = p1 + 50 * rng.pick([-6, -5, -4, -3, -2, 2, 3, 4, 5, 6]);
    if (p2 <= 0 || rev2 <= 0) return null;
    const a1 = (rev1 * p1) / 10000;
    const a2 = (rev2 * p2) / 10000;
    const delta = a2 - a1;
    if (delta === 0) return null;
    const up = delta > 0;
    const gap = Math.abs(p2 - p1);
    const n = money(Math.abs(delta), [
      [share(rev2, gap), `Applied the difference between the two percentages, ${pc(gap)}, to the revenue of ${b}. Each percentage has its own base, so both amounts are worked out first.`],
      [share(rev1, gap), `Applied the difference between the two percentages, ${pc(gap)}, to the revenue of ${a}. Each percentage has its own base, so both amounts are worked out first.`],
      [share(Math.abs(rev2 - rev1), p2), `Applied the percentage of ${b} to the change in revenue from operations.`],
      [a2, `Gave the amount of ${b}, not the change.`],
    ]);
    return n && {
      prompt: `The common size Statements of Profit and Loss ${ON_REVENUE} of ${company} show ${lower(line.name)} at ${pc(p1)} for ${a} and ${pc(p2)} for ${b}. Revenue from operations was ${inr(rev1)} in ${a} and ${inr(rev2)} in ${b}. By how much did ${lower(line.name)} ${up ? 'rise' : 'fall'} in amount?`,
      ...n,
      explanation: [
        `${a}: ${pc(p1)} of ${inr(rev1)} = ${inr(a1)}.`,
        `${b}: ${pc(p2)} of ${inr(rev2)} = ${inr(a2)}.`,
        `Change = ${inr(a2)} - ${inr(a1)} = ${up ? '' : '-'}${inr(Math.abs(delta))}, ${up ? 'an increase' : 'a decrease'}.`,
      ],
      hints: H.csPl,
    };
  },
  verify: (q) => {
    const [p1, p2] = pctsIn(q.prompt);
    const [rev1, rev2] = amountsIn(q.prompt);
    return q.answer === Math.abs(rev2 * p2 - rev1 * p1) / 100;
  },
});

const csMissingLine = numericTemplate({
  id: 'fsa-cs-missing-line', version: 2, topicId: T, conceptId: 'fsa-common-size', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [, b] = rng.pick(YEARS);
    const rev = 200000 * rng.int(5, 40);
    const q = rng.pick([200, 250, 400, 500]);
    // Employee benefits expense, then one of the lines that follow it in Schedule III.
    const others = [CS_PL[2], rng.pick(CS_PL.slice(3))];
    const names = [rng.pick(MATERIAL_LINES), ...others.map((l) => l.name)].map(lower);
    const e = [50 * rng.int(112, 132), ...others.map((l) => csPct(rng, l))];
    const spent = sum(e);
    const p = 10000 + q - spent;
    // A profit before tax of 4% to 25% of revenue from operations: a margin a manufacturer or a trader might show.
    if (p < 400 || p > 2500) return null;
    const pbt = (rev * p) / 10000;
    const n = money(pbt, [
      [share(rev, 10000 - spent), 'Left other income out. Profit before tax = revenue from operations + other income - total expenses.'],
      [share(rev, 10000 - q - spent), 'Deducted other income instead of adding it.'],
      [share(rev, spent), 'Gave total expenses, not profit before tax.'],
      [share(rev + share(rev, q), p), 'Applied the percentage to total income. A common size percentage is a percentage of revenue from operations.'],
    ]);
    return n && {
      prompt: `In the common size Statement of Profit and Loss ${ON_REVENUE} of ${company} for ${b}, other income is ${pc(q)}, ${names[0]} ${pc(e[0])}, ${names[1]} ${pc(e[1])} and ${names[2]} ${pc(e[2])}. These are its only expenses. Revenue from operations is ${inr(rev)}. Find the profit before tax.`,
      ...n,
      explanation: [
        `Revenue from operations is 100%, so total income = 100% + ${pc(q)} = ${pc(10000 + q)}.`,
        `Total expenses = ${e.map(pc).join(' + ')} = ${pc(spent)}.`,
        `Profit before tax = ${pc(10000 + q)} - ${pc(spent)} = ${pc(p)} of revenue from operations = ${pc(p)} of ${inr(rev)} = ${inr(pbt)}.`,
      ],
      hints: H.csPl,
    };
  },
  verify: (q) => {
    const [oi, ...e] = pctsIn(q.prompt);
    const [rev] = amountsIn(q.prompt);
    return e.length === 3 && q.answer === (rev * (10000 + oi - sum(e))) / 100;
  },
});

// ===============================================================================================================
// READING THE STATEMENTS (choice)
// ===============================================================================================================

const comparativeRow = mcqTemplate({
  id: 'fsa-comparative-row', topicId: T, conceptId: 'fsa-comparative', difficulty: 'easy',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = rng.int(0, 1) === 0 ? bsPeriod(rng) : plPeriod(rng);
    const line = rng.pick(per.bs ? BS_LINES : PL_LINES);
    const { prev, cur, change, p, up } = drawMove(rng, line);
    const entry = (rise: boolean, h: number): string => `${rise ? 'Increase' : 'Decrease'} of ${inr(change)}; ${pc(h)}`;
    const onLater = roundPct(change, cur);
    return choice(
      `${line.name} of ${company}: ${inr(prev)} ${per.inA} and ${inr(cur)} ${per.inB}. Which entry does the comparative ${per.statement} show against this line (absolute change; percentage change)?`,
      entry(up, p),
      [
        [entry(!up, p), `Took the difference the wrong way round. The figure went from ${inr(prev)} to ${inr(cur)}, which is ${up ? 'a rise' : 'a fall'}.`],
        [entry(up, onLater), `Divided the change by the later figure, ${inr(cur)}. The base is the earlier figure, ${inr(prev)}.`],
        [entry(!up, onLater), 'Swapped the two periods: measured from the later figure back to the earlier one.'],
        [entry(up, up ? 10000 + p : 10000 - p), 'Gave the later figure as a percentage of the earlier one in place of the percentage change.'],
      ],
      `Absolute change = ${inr(cur)} - ${inr(prev)} = ${up ? '' : '-'}${inr(change)}. Percentage change = ${inr(change)} ÷ ${inr(prev)} × 100 = ${pc(p)}, ${up ? 'an increase' : 'a decrease'}.`,
      H.change,
    );
  },
  verify: (q) => {
    const [prev, cur] = amountsIn(q.prompt);
    const p = exactPct(Math.abs(cur - prev), prev);
    return p !== null && optionText(q) === `${cur > prev ? 'Increase' : 'Decrease'} of ${inr(Math.abs(cur - prev))}; ${pc(p)}`;
  },
});

const NIL_LINES: { name: string; bs: boolean }[] = [
  { name: 'Other income', bs: false },
  { name: 'Finance costs', bs: false },
  { name: 'Long-term borrowings', bs: true },
  { name: 'Non-current investments', bs: true },
  { name: 'Current investments', bs: true },
  { name: 'Short-term borrowings', bs: true },
];

const nilPrevious = mcqTemplate({
  id: 'fsa-nil-previous', topicId: T, conceptId: 'fsa-comparative', difficulty: 'medium',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const line = rng.pick(NIL_LINES);
    const per = line.bs ? bsPeriod(rng) : plPeriod(rng);
    const x = 10000 * rng.int(4, 60);
    const name = lower(line.name);
    const ask = `What does its comparative ${per.statement} show against this line?`;
    if (rng.int(0, 2) > 0) {
      return choice(
        `${company} had no ${name} ${per.inA} and ${name} of ${inr(x)} ${per.inB}. ${ask}`,
        `Absolute change: increase of ${inr(x)}. Percentage change: cannot be worked out, as the earlier figure is nil`,
        [
          [`Absolute change: increase of ${inr(x)}. Percentage change: 100%`, 'Took a line that is new as a rise of 100%. A percentage needs a base, and the base here is nil.'],
          [`Absolute change: increase of ${inr(x)}. Percentage change: 0%`, 'Wrote 0% because the earlier figure is nil. 0% would mean no change; with a nil base there is no percentage to give.'],
          [`Absolute change: nil. Percentage change: cannot be worked out`, `Dropped the absolute change as well. Only the percentage needs the earlier figure as its base; the change in rupees is ${inr(x)} less nil.`],
          [`Absolute change: decrease of ${inr(x)}. Percentage change: 100%`, 'Read the two periods the wrong way round, as if the line had fallen to nil.'],
        ],
        `Absolute change = ${inr(x)} - nil = ${inr(x)}, an increase. Percentage change = change ÷ earlier figure × 100, and the earlier figure is nil, so no percentage can be worked out: the column is left with a dash.`,
        H.change,
      );
    }
    return choice(
      `${company} had ${name} of ${inr(x)} ${per.inA} and none ${per.inB}. ${ask}`,
      `Absolute change: decrease of ${inr(x)}. Percentage change: 100% decrease`,
      [
        [`Absolute change: decrease of ${inr(x)}. Percentage change: cannot be worked out, as one figure is nil`, `Mixed this up with a nil figure in the earlier period. Here the base is ${inr(x)}, so a percentage can be worked out.`],
        [`Absolute change: decrease of ${inr(x)}. Percentage change: 0%`, 'Wrote 0% because the later figure is nil. The whole of the base has gone, which is a fall of 100%.'],
        [`Absolute change: increase of ${inr(x)}. Percentage change: 100% increase`, 'Read the two periods the wrong way round, as if the line were new.'],
        [`Absolute change: nil. Percentage change: 100% decrease`, `Left the absolute change out. It is nil less ${inr(x)}, a decrease of ${inr(x)}.`],
      ],
      `Absolute change = nil - ${inr(x)} = -${inr(x)}, a decrease. Percentage change = ${inr(x)} ÷ ${inr(x)} × 100 = 100%, a decrease. The percentage fails only when the EARLIER figure is nil.`,
      H.change,
    );
  },
  verify: (q) => {
    const [x] = amountsIn(q.prompt);
    const text = optionText(q);
    return text.includes(inr(x)) && (q.prompt.includes(' had no ') ? text.includes('increase') && text.includes('cannot be worked out') : text.includes('100% decrease'));
  },
});

/** Four lines with a part each: the highest percentage rise, the largest rupee rise, a fall, and the largest figure. */
const FAST_SETS = [
  {
    bs: false,
    winner: ['Finance costs', 'Other income'],
    rupee: ['Employee benefits expense', 'Purchases of stock-in-trade'],
    faller: ['Other expenses', 'Depreciation and amortisation expense'],
    big: ['Cost of materials consumed'],
  },
  {
    bs: true,
    winner: ['Cash and cash equivalents', 'Current investments'],
    rupee: ['Inventories', 'Trade receivables'],
    faller: ['Non-current investments', 'Long-term loans and advances'],
    big: ['Property, plant and equipment'],
  },
];

const fastestLine = mcqTemplate({
  id: 'fsa-fastest-line', topicId: T, conceptId: 'fsa-reading', difficulty: 'medium',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const set = rng.pick(FAST_SETS);
    const per = set.bs ? bsPeriod(rng) : plPeriod(rng);
    const make = (name: string, k: number, h: number): { name: string; v: [number, number]; h: number } => {
      const prev = 80000 * k;
      return { name, v: [prev, prev + (prev * h) / 10000], h };
    };
    const winner = make(rng.pick(set.winner), rng.int(2, 5), rng.pick([4000, 5000, 6000, 7500]));
    const rupee = make(rng.pick(set.rupee), rng.int(30, 50), rng.pick([1500, 2000, 2500]));
    const fall = rng.pick([2000, 2500, 3750, 5000]);
    const faller = make(rng.pick(set.faller), rng.int(5, 15), -fall);
    const big = make(rng.pick(set.big), rng.int(60, 90), rng.pick([250, 500]));
    const rise = (l: { v: [number, number] }): number => l.v[1] - l.v[0];
    if (rise(rupee) <= rise(winner) || rise(rupee) <= rise(big)) return null;
    const rows = [winner, rupee, faller, big].sort((x, y) => place(x.name) - place(y.name)).map((l) => twoYears(l.name, l.v, per));
    return choice(
      `Which of these lines of ${company} shows the highest percentage increase in its comparative ${per.statement}?\n${rows.join('\n')}`,
      winner.name,
      [
        [rupee.name, `Picked the largest increase in rupees, ${inr(rise(rupee))}. On its own base that is only ${pc(rupee.h)}.`],
        [big.name, `Picked the largest figure. Its increase is only ${pc(big.h)}.`],
        [faller.name, `Picked a line that fell, by ${pc(fall)}. A decrease is not an increase, whatever its size.`],
      ],
      `Percentage change = change ÷ earlier figure × 100. ${winner.name}: ${pc(winner.h)}. ${rupee.name}: ${pc(rupee.h)}. ${big.name}: ${pc(big.h)}. ${faller.name}: a decrease of ${pc(fall)}. The highest increase is in ${lower(winner.name)}, although its rise in rupees is not the largest.`,
      H.read,
    );
  },
  verify: (q) => {
    const best = rowsIn(q.prompt)
      .map(([name, v]): [string, number] => [name, (v[1] - v[0]) / v[0]])
      .sort((x, y) => y[1] - x[1])[0];
    return best[0] === optionText(q);
  },
});

const expensesVsRevenue = mcqTemplate({
  id: 'fsa-expenses-vs-revenue', topicId: T, conceptId: 'fsa-reading', difficulty: 'medium',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const k = rng.int(40, 90);
    const rev1 = 80000 * k;
    const exp1 = 80000 * rng.int(Math.ceil(k * 0.7), Math.floor(k * 0.9));
    const pr = rng.pick([500, 750, 1000, 1250, 1500, 2000]);
    const pe = pr + rng.pick([250, 500, 750, 1000]);
    const dRev = (rev1 * pr) / 10000;
    const dExp = (exp1 * pe) / 10000;
    const rev2 = rev1 + dRev;
    const exp2 = exp1 + dExp;
    if (rev2 <= exp2 || dRev === dExp) return null;
    const rose = dRev > dExp;
    const dProfit = Math.abs(dRev - dExp);
    const rates = (e: number, r: number): string => `Total expenses grew by ${pc(e)} against ${pc(r)} for revenue from operations`;
    const profit = (up: boolean): string => `profit before tax ${up ? 'rose' : 'fell'} by ${inr(dProfit)}`;
    return choice(
      `${company} has no other income. Which reading of its comparative Statement of Profit and Loss is correct?\n${twoYears('Revenue from operations', [rev1, rev2], per)}\n${twoYears('Total expenses', [exp1, exp2], per)}`,
      `${rates(pe, pr)}, and ${profit(rose)}`,
      [
        [
          `${rates(pe, pr)}, and ${profit(!rose)}`,
          rose
            ? `Took a faster rate of growth of expenses to mean a lower profit. Expenses grew on a smaller figure: they rose by ${inr(dExp)} and revenue by ${inr(dRev)}, so profit rose.`
            : `Took profit to have risen because revenue rose. Expenses rose by ${inr(dExp)}, more than the ${inr(dRev)} by which revenue rose.`,
        ],
        [`${rates(roundPct(dExp, exp2), roundPct(dRev, rev2))}, and ${profit(rose)}`, `Divided each change by the figure of ${per.b}. The base of a percentage change is the earlier year, ${per.a}.`],
        rose
          ? [
              `Revenue from operations grew faster than total expenses, because it rose by ${inr(dRev)} and expenses by only ${inr(dExp)}`,
              `Compared the increases in rupees. Growth is compared in percentages: ${pc(pe)} for expenses against ${pc(pr)} for revenue.`,
            ]
          : [
              'Revenue from operations grew faster than total expenses, because it is the larger figure in both years',
              `Compared the sizes of the figures. Growth is the percentage change: ${pc(pe)} for expenses against ${pc(pr)} for revenue.`,
            ],
      ],
      `Revenue from operations: ${inr(dRev)} ÷ ${inr(rev1)} × 100 = ${pc(pr)}. Total expenses: ${inr(dExp)} ÷ ${inr(exp1)} × 100 = ${pc(pe)}. Profit before tax was ${inr(rev1 - exp1)} and is ${inr(rev2 - exp2)}: it ${rose ? 'rose' : 'fell'} by ${inr(dProfit)}. Expenses grew faster than revenue, so a smaller part of each rupee of revenue is left as profit${rose ? ', even though the profit in rupees is higher' : ''}.`,
      H.read,
    );
  },
  verify: (q) => {
    const [[, rev], [, exp]] = rowsIn(q.prompt);
    const pr = exactPct(rev[1] - rev[0], rev[0]);
    const pe = exactPct(exp[1] - exp[0], exp[0]);
    const before = rev[0] - exp[0];
    const after = rev[1] - exp[1];
    const text = optionText(q);
    return pr !== null && pe !== null && text.includes(`grew by ${pc(pe)} against ${pc(pr)}`) && text.includes(`${after > before ? 'rose' : 'fell'} by ${inr(Math.abs(after - before))}`);
  },
});

/** Two companies of one industry, so that setting one beside the other means something. */
const SAME_INDUSTRY: [string, string][] = [
  ['Kaveri Textiles Ltd.', 'Narmada Textiles Ltd.'],
  ['Ananya Foods Ltd.', 'Rasoi Foods Ltd.'],
  ['Meenal Paints Ltd.', 'Indradhanush Paints Ltd.'],
  ['Bhaskar Tools Ltd.', 'Vishwakarma Tools Ltd.'],
  ['Jyotsna Plastics Ltd.', 'Sahyadri Plastics Ltd.'],
  ['Devgiri Ceramics Ltd.', 'Mrittika Ceramics Ltd.'],
  ['Charu Garments Ltd.', 'Poshak Garments Ltd.'],
  ['Lokesh Auto Parts Ltd.', 'Gatiman Auto Parts Ltd.'],
];

const csTwoFirms = mcqTemplate({
  id: 'fsa-cs-two-firms', topicId: T, conceptId: 'fsa-reading', difficulty: 'medium',
  generate: (rng) => {
    const [small, large] = rng.shuffle(rng.pick(SAME_INDUSTRY));
    const [, b] = rng.pick(YEARS);
    const line = rng.pick(CS_PL.filter((l) => l.lo >= 5));
    const pLarge = 50 * rng.int(Math.max(12, line.lo) * 2, Math.max(14, line.hi - 8) * 2);
    const pSmall = pLarge + 50 * rng.int(4, 16);
    const revLarge = 200000 * rng.int(40, 70);
    const revSmall = 200000 * rng.int(4, 10);
    const amtLarge = (revLarge * pLarge) / 10000;
    const amtSmall = (revSmall * pSmall) / 10000;
    if (amtSmall >= amtLarge) return null;
    const name = lower(line.name);
    const row = (company: string, rev: number, amt: number): string => `${company}: revenue from operations ${inr(rev)}; ${name} ${inr(amt)}`;
    const rows = rng.shuffle([row(small, revSmall, amtSmall), row(large, revLarge, amtLarge)]);
    return choice(
      `Two companies in the same industry report these figures for ${b}. Which of them uses up the larger share of its revenue from operations on ${name}?\n${rows.join('\n')}`,
      `${small}: ${pc(pSmall)} of its revenue from operations, against ${pc(pLarge)}`,
      [
        [`${large}: it spends the larger amount, ${inr(amtLarge)}`, 'Compared the amounts in rupees. Companies of different sizes are compared by their common size percentages.'],
        [`${large}: its revenue from operations is the larger`, 'Took the larger company to spend the larger share. The share is the line divided by the revenue of the same company.'],
        ['Neither: companies of such different sizes cannot be compared', 'Common size statements exist for this: a line as a percentage of revenue from operations can be compared whatever the size of the company.'],
        [`${large}: ${pc(pSmall)} of its revenue from operations, against ${pc(pLarge)}`, 'Worked out the percentages but put them against the wrong companies.'],
      ],
      `${small}: ${inr(amtSmall)} ÷ ${inr(revSmall)} × 100 = ${pc(pSmall)}. ${large}: ${inr(amtLarge)} ÷ ${inr(revLarge)} × 100 = ${pc(pLarge)}. ${small} spends less in rupees but a larger part of every rupee of revenue.`,
      H.read,
    );
  },
  verify: (q) => {
    const shares = q.prompt
      .split('\n')
      .slice(1)
      .map((l): [string, number] => {
        const [rev, amt] = amountsIn(l);
        return [l.slice(0, l.indexOf(': revenue')), amt / rev];
      })
      .sort((x, y) => y[1] - x[1]);
    return optionText(q).startsWith(`${shares[0][0]}: ${pc(Math.round(shares[0][1] * 10000))} of`);
  },
});

const csInterpret = mcqTemplate({
  id: 'fsa-cs-interpret', topicId: T, conceptId: 'fsa-reading', difficulty: 'medium',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const [a, b] = rng.pick(YEARS);
    const line = rng.pick(CS_PL.filter((l) => l.lo >= 5));
    const p1 = rng.int(line.lo + 3, line.hi - 3);
    const gap = rng.int(2, 6);
    const up = rng.int(0, 2) > 0;
    const p2 = up ? p1 + gap : p1 - gap;
    const name = lower(line.name);
    const moved = up ? 'rose' : 'fell';
    return choice(
      `The common size Statements of Profit and Loss ${ON_REVENUE} of ${company} show ${name} at ${p1}% for ${a} and at ${p2}% for ${b}. Other income and every other expense keep the percentages they had. What does this tell a reader?`,
      `Out of every ₹100 of revenue from operations, ₹${p2} went on ${name} in ${b} against ₹${p1} in ${a}, so ₹${gap} ${up ? 'less' : 'more'} is left as profit before tax`,
      [
        [`The amount of ${name} ${moved} by ${gap}% over ${a}`, `Read the gap between two common size percentages as a percentage change of the amount. The amounts are not given, and ${gap} is a difference in shares of revenue.`],
        [`Revenue from operations ${up ? 'fell' : 'rose'} by ${gap}% in ${b}`, 'A common size percentage compares a line with the revenue of its own year. It does not say how revenue moved from one year to the next.'],
        [`Profit before tax is a ${up ? 'larger' : 'smaller'} part of revenue from operations in ${b}`, `Took a ${up ? 'larger' : 'smaller'} share for a cost to be ${up ? 'good' : 'bad'} for profit. What a cost takes out of each rupee of revenue is not left as profit.`],
        ['Nothing, until the amounts in rupees are known', 'A common size statement is read without the amounts: it shows the share of revenue from operations that each line takes.'],
      ],
      `A common size percentage is the share of revenue from operations of the same year. ${cap(name)} took ${p1}% in ${a} and ${p2}% in ${b}. With other income and every other expense unchanged, profit before tax as a percentage of revenue ${up ? 'falls' : 'rises'} by the same ${gap} percentage points. It does not tell us the change in rupees.`,
      H.read,
    );
  },
  verify: (q) => {
    const [p1, p2] = pctsIn(q.prompt);
    return optionText(q).includes(`₹${p2 / 100} went on`) && optionText(q).includes(`₹${Math.abs(p2 - p1) / 100} ${p2 > p1 ? 'less' : 'more'} is left`);
  },
});

const csShareMoved = mcqTemplate({
  id: 'fsa-cs-share-moved', topicId: T, conceptId: 'fsa-common-size', difficulty: 'medium',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = plPeriod(rng);
    const line = rng.pick(CS_PL.filter((l) => l.lo >= 5));
    const k = rng.int(8, 30);
    const amountUp = rng.int(0, 1) === 0;
    // The share and the amount move opposite ways: revenue grows faster than the line, or falls faster than it.
    const k2 = amountUp ? k + rng.int(Math.ceil(k / 4), Math.ceil(k / 2)) : k - rng.int(Math.ceil(k / 5), Math.ceil(k / 3));
    const p1 = 100 * rng.int(line.lo + 4, line.hi);
    const p2 = amountUp ? p1 - 100 * rng.int(2, 4) : p1 + 100 * rng.int(2, 4);
    const rev = [200000 * k, 200000 * k2];
    const amt = [(rev[0] * p1) / 10000, (rev[1] * p2) / 10000];
    if (k2 <= 0 || p2 <= 0 || (amountUp ? amt[1] <= amt[0] : amt[1] >= amt[0])) return null;
    const name = lower(line.name);
    const change = roundPct(Math.abs(amt[1] - amt[0]), amt[0]);
    return choice(
      `How does the common size percentage ${ON_REVENUE} of ${name} of ${company} move from ${per.a} to ${per.b}?\n${twoYears('Revenue from operations', rev, per)}\n${twoYears(line.name, amt, per)}`,
      `It ${amountUp ? 'falls' : 'rises'} from ${pc(p1)} to ${pc(p2)}, although the amount ${amountUp ? 'rose' : 'fell'}`,
      [
        [`It ${amountUp ? 'rises' : 'falls'}, because the amount ${amountUp ? 'rose' : 'fell'} from ${inr(amt[0])} to ${inr(amt[1])}`, 'Looked at the amounts alone. The common size percentage is the line divided by the revenue from operations of its own year.'],
        [`It ${amountUp ? 'rises' : 'falls'} from ${pc(p2)} to ${pc(p1)}`, 'Worked out both percentages but put them against the wrong years.'],
        [`It ${amountUp ? 'rises' : 'falls'} by ${pc(change)}`, 'Gave the percentage change of the amount, which belongs to a comparative statement, not the common size percentage.'],
        [`It stays at ${pc(p1)}, because the base of a common size statement is always 100`, 'The base is 100 in both years, but it is the revenue of each year. The share of the line has to be worked out again for each year.'],
      ],
      `${per.a}: ${inr(amt[0])} ÷ ${inr(rev[0])} × 100 = ${pc(p1)}. ${per.b}: ${inr(amt[1])} ÷ ${inr(rev[1])} × 100 = ${pc(p2)}. Revenue from operations ${amountUp ? 'grew' : 'fell'} faster than ${name}, so the share ${amountUp ? 'fell' : 'rose'} while the amount ${amountUp ? 'rose' : 'fell'}.`,
      H.read,
    );
  },
  verify: (q) => {
    const [[, rev], [, amt]] = rowsIn(q.prompt);
    const p1 = exactPct(amt[0], rev[0]);
    const p2 = exactPct(amt[1], rev[1]);
    return p1 !== null && p2 !== null && optionText(q).startsWith(`It ${p2 < p1 ? 'falls' : 'rises'} from ${pc(p1)} to ${pc(p2)},`);
  },
});

// ===============================================================================================================
// PURPOSES, LIMITATIONS, TYPES AND TOOLS (choice, from banks of situations)
// ===============================================================================================================

type UserKey = 'management' | 'investors' | 'lenders' | 'suppliers' | 'employees' | 'government';
/** Each group of users: what it is called, what it looks for first, and that concern in a few words. */
const USERS: Record<UserKey, { who: string; concern: string; judge: string }> = {
  management: {
    who: 'Management',
    concern: 'How efficiently each part of the business is run, so that plans can be made and weak spots put right',
    judge: 'the efficiency of each activity, for planning and control',
  },
  investors: {
    who: 'Shareholders and prospective investors',
    concern: 'The earning capacity of the company and the safety and growth of the money invested in its shares',
    judge: 'the earning capacity of the company and the safety of money invested in its shares',
  },
  lenders: {
    who: 'Banks, debentureholders and other long-term lenders',
    concern: 'Whether the company can go on paying interest and repay the loan when it falls due years later (long-term solvency)',
    judge: 'long-term solvency: the ability to pay interest and to repay a loan after several years',
  },
  suppliers: {
    who: 'Suppliers who sell to the company on credit',
    concern: 'Whether the company can pay its dues of the next few weeks or months on time (liquidity)',
    judge: 'liquidity: the ability to pay dues that fall within a few weeks or months',
  },
  employees: {
    who: 'Employees and trade unions',
    concern: 'Whether profits can bear better wages and bonus, and whether jobs with the company are secure',
    judge: 'whether profits can bear higher wages and bonus, and whether jobs are secure',
  },
  government: {
    who: 'Government and tax authorities',
    concern: 'Whether taxes have been worked out properly, and how the industry is doing, for framing policy',
    judge: 'the tax payable and the state of an industry, for framing policy',
  },
};
/** A situation, the user in it, and why that user's own concern is the one that matters there. */
const USER_CASES: { key: UserKey; text: (c: string) => string; subject: string; need: string }[] = [
  { key: 'suppliers', text: (c) => `${c} buys packing material from Mohan Traders on 30 days' credit and has asked for its credit limit to be doubled.`, subject: 'Mohan Traders', need: 'A supplier who gives 30 days of credit has to know whether next month\'s bill will be paid.' },
  { key: 'suppliers', text: (c) => `A supplier of raw material has to decide whether to go on selling to ${c} on 45 days' credit.`, subject: 'the supplier', need: 'Credit of 45 days is at risk only if the company cannot pay its short-term dues.' },
  { key: 'lenders', text: (c) => `${c} has applied to a bank for a term loan that is to be repaid over seven years.`, subject: 'the bank', need: 'A loan of seven years depends on the company staying able to pay interest and instalments for all those years.' },
  { key: 'lenders', text: (c) => `A charitable trust is thinking of subscribing to the 9% debentures of ${c}, which are redeemable after six years.`, subject: 'the trust', need: 'A debentureholder wants interest every year and the money back on redemption, six years away.' },
  { key: 'investors', text: (c) => `Farida has savings to invest and is weighing the equity shares of ${c} against a bank deposit.`, subject: 'Farida', need: 'A buyer of shares is paid out of profits, so what matters is what the company can earn and whether the money is safe.' },
  { key: 'investors', text: (c) => `An investment club holds equity shares of ${c} and is deciding whether to keep them or sell.`, subject: 'the club', need: 'An owner of shares gains from profits and dividends, so the question is what the company can earn.' },
  { key: 'management', text: (c) => `The board of directors of ${c} wants to know which of its divisions is using resources poorly.`, subject: 'the board', need: 'Those who run the company need to see where it works well and where it does not, to act on it.' },
  { key: 'management', text: (c) => `The finance manager of ${c} is preparing the budget and the targets for the coming year.`, subject: 'the finance manager', need: 'A budget is built on how each activity has performed and where it can do better.' },
  { key: 'employees', text: (c) => `The workers' union of ${c} is preparing its case for a higher bonus.`, subject: 'the union', need: 'A claim for bonus rests on what the profits of the company can bear.' },
  { key: 'employees', text: (c) => `An engineer who has been offered a job by ${c} wants to know how secure the job will be.`, subject: 'the engineer', need: 'A person who will depend on the company for a living asks whether it is stable and can pay well.' },
  { key: 'government', text: (c) => `The income tax department is examining the returns that ${c} has filed.`, subject: 'the department', need: 'A tax authority checks that the profit, and the tax on it, have been worked out properly.' },
  { key: 'government', text: (c) => `A ministry is studying whether the industry to which ${c} belongs needs relief in duties.`, subject: 'the ministry', need: 'A decision on policy needs a picture of how the companies of the industry are doing.' },
];
const USER_KEYS = Object.keys(USERS) as UserKey[];

const userPurpose = mcqTemplate({
  id: 'fsa-user-purpose', topicId: T, conceptId: 'fsa-users', difficulty: 'easy',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const item = rng.pick(USER_CASES);
    const others = rng.shuffle(USER_KEYS.filter((k) => k !== item.key));
    if (rng.int(0, 2) > 0) {
      return choice(
        `${item.text(company)} What will ${item.subject} look for most in an analysis of the financial statements of the company?`,
        USERS[item.key].concern,
        others.map((k): [string, string] => [USERS[k].concern, `Chose what ${lower(USERS[k].who)} look for first. ${item.need}`]),
        `${item.need} So what ${item.subject} looks for first is ${USERS[item.key].judge}, the concern of ${lower(USERS[item.key].who)}.`,
        H.users,
      );
    }
    const key = rng.pick(USER_KEYS);
    return choice(
      `Which users of the financial statements of ${company} analyse them mainly to judge ${USERS[key].judge}?`,
      USERS[key].who,
      rng.shuffle(USER_KEYS.filter((k) => k !== key)).map((k): [string, string] => [USERS[k].who, `The first interest of ${lower(USERS[k].who)} is ${USERS[k].judge}.`]),
      `${USERS[key].who} analyse the statements mainly to judge ${USERS[key].judge}. Each group of users reads the same statements with its own question in mind.`,
      H.users,
    );
  },
});

type LimitKey = 'cost' | 'prices' | 'quality' | 'dressing' | 'policies' | 'judgement';
const LIMITS: Record<LimitKey, { text: string; about: string }> = {
  cost: { text: 'It works on historical cost, not on what things are worth today', about: 'assets being carried at what was paid for them long ago' },
  prices: { text: 'It ignores changes in the price level', about: 'figures of different years being in rupees of different purchasing power' },
  quality: { text: 'It ignores qualitative factors, which are not measured in money', about: 'things such as skill, morale and reputation, which no figure records' },
  dressing: { text: 'It is affected by window dressing of the statements', about: 'figures arranged at the year end to look better than the real position' },
  policies: { text: 'It is affected by differences and changes in accounting policies', about: 'figures worked out by different methods, which are not comparable' },
  judgement: { text: 'Its conclusions depend on the personal judgement of the analyst', about: 'two people reading the same figures and concluding differently' },
};
const LIMIT_CASES: { key: LimitKey; text: (c: string, x: string, rng: Rng) => string; point: string }[] = [
  { key: 'cost', text: (c, x) => `The factory land of ${c}, bought many years ago for ${x}, still stands in its balance sheet at ${x}, although plots beside it now sell for several times that.`, point: 'Here the trouble is that the balance sheet carries the land at what was paid for it.' },
  { key: 'cost', text: (c, x) => `The office building of ${c} stands in its balance sheet at the ${x} it cost decades ago, less depreciation. A similar building would cost many times that today, so its total assets look small.`, point: 'Here the trouble is that an asset is carried at an old cost and not at what it is worth today.' },
  { key: 'prices', text: (c, _x, rng) => { const r = rng.pick([6, 8, 10]); return `The revenue from operations of ${c} rose by ${r}% in a year in which it raised all its selling prices by ${r}% and sold the same quantity. Its comparative statement shows growth of ${r}%.`; }, point: 'Here the trouble is that the rise in the figure is a rise in prices and not in the business done.' },
  { key: 'prices', text: (c) => `An analyst compares the profit of ${c} for this year with its profit of ten years ago, rupee for rupee, although a rupee bought far more ten years ago.`, point: 'Here the trouble is that rupees of two different years are treated as equal.' },
  { key: 'quality', text: (c) => `During the year ${c} lost its most experienced design team and its workers were on strike for a month. Nothing in the analysis of its statements shows it.`, point: 'Here the trouble is that the skill and the mood of the people of a company are not figures.' },
  { key: 'quality', text: (c) => `${c} has earned a name for quality and for honest dealing with customers. An analyst working only from its financial statements cannot see this.`, point: 'Here the trouble is that reputation is not measured in money and so is not in the statements.' },
  { key: 'dressing', text: (c) => `In the last week of March, ${c} put off paying its suppliers and held back its purchases until April, so that the cash shown on 31 March would look healthy.`, point: 'Here the trouble is that the figures of the balance sheet date were arranged to look better than usual.' },
  { key: 'dressing', text: (c) => `${c} pressed its customers to pay just before 31 March and repaid a short-term loan on 30 March, only to borrow it again on 2 April.`, point: 'Here the trouble is that the position on the balance sheet date was made up for the occasion.' },
  { key: 'policies', text: (c) => `${c} values inventory by the first-in-first-out method and depreciates by the straight line method; its competitor uses weighted average cost and the written down value method. An analyst compares their statements line by line.`, point: 'Here the trouble is that the two sets of figures were worked out by different methods.' },
  { key: 'policies', text: (c) => `${c} changed its method of depreciation this year. Its comparative statement sets this year's depreciation beside last year's as if nothing had changed.`, point: 'Here the trouble is that the two years were worked out by different methods.' },
  { key: 'judgement', text: (c) => `Two analysts are given the same financial statements of ${c}. One reports that the company is sound and the other that it is risky, because each has given weight to different figures.`, point: 'Here the trouble is that what the figures are taken to mean depends on who reads them.' },
  { key: 'judgement', text: (c, x) => `The profit of ${c} rose by ${x} this year. One analyst calls the rise a healthy one; another, working from the same statements, calls it disappointing.`, point: 'Here the trouble is that the same figure is read differently by different people.' },
];
// Historical cost and the price level are two sides of one weakness, so the two are never offered together. Nor are
// accounting policies and personal judgement: some textbooks put the choice of a method under personal judgement.
const LIMIT_CLASH: Partial<Record<LimitKey, LimitKey>> = { cost: 'prices', prices: 'cost', policies: 'judgement', judgement: 'policies' };

const limitationSpot = mcqTemplate({
  id: 'fsa-limitation-spot', version: 2, topicId: T, conceptId: 'fsa-limitations', difficulty: 'easy',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const item = rng.pick(LIMIT_CASES);
    const x = inr(100000 * rng.int(4, 40));
    const keys = (Object.keys(LIMITS) as LimitKey[]).filter((k) => k !== item.key && k !== LIMIT_CLASH[item.key]);
    return choice(
      `${item.text(company, x, rng)} Which limitation of financial statement analysis does this show?`,
      LIMITS[item.key].text,
      rng.shuffle(keys).map((k): [string, string] => [LIMITS[k].text, `That limitation is about ${LIMITS[k].about}. ${item.point}`]),
      `${item.point} The limitation is: ${lower(LIMITS[item.key].text)}. Analysis can be no better than the statements it works on.`,
      H.limits,
    );
  },
});

type KindKey = 'horizontal' | 'vertical' | 'inter' | 'intra';
const KIND_NAME: Record<KindKey, string> = { horizontal: 'Horizontal analysis', vertical: 'Vertical analysis', inter: 'Inter-firm comparison', intra: 'Intra-firm comparison' };
/**
 * For each kind of study: the wrong names offered with it, and the slip behind each. A name that is also right is never
 * offered: horizontal analysis (dynamic, time series) and intra-firm comparison are not set against each other, and
 * "cross-sectional analysis", which is inter-firm comparison here but another name for vertical analysis in some
 * textbooks, is offered only where it is wrong in both senses (a study of one company across periods).
 */
const KIND_WRONG: Record<KindKey, [string, string][]> = {
  horizontal: [
    ['Vertical analysis', 'Vertical analysis stays within the statements of one period. Here figures of different periods are compared.'],
    ['Static analysis', 'Static analysis is another name for vertical analysis, which stays within one period. Here there are two or more periods.'],
    ['Inter-firm comparison', 'Inter-firm comparison sets two or more companies side by side. Only one company is studied here.'],
    ['Cross-sectional analysis', 'Cross-sectional analysis sets different companies side by side at one point of time. Here one company is followed from period to period.'],
  ],
  vertical: [
    ['Horizontal analysis', 'Horizontal analysis compares the same item over two or more periods. Here every figure belongs to one period.'],
    ['Dynamic analysis', 'Dynamic analysis is another name for horizontal analysis, which runs across periods. Here there is one period only.'],
    ['Time series analysis', 'Time series analysis follows a figure from period to period. Here every figure belongs to one period.'],
    ['Inter-firm comparison', 'Inter-firm comparison sets two or more companies side by side. Only one company is studied here.'],
  ],
  inter: [
    ['Intra-firm comparison', 'Intra-firm comparison is of a company with itself, over time. Here different companies are compared.'],
    ['Horizontal analysis', 'Horizontal analysis follows one company from period to period. Here the period is the same and the companies differ.'],
    ['Time series analysis', 'Time series analysis follows one company over several periods. Here the companies differ and the period is one.'],
  ],
  intra: [
    ['Inter-firm comparison', 'Inter-firm comparison sets two or more companies side by side. Here a company is compared only with itself.'],
    ['Cross-sectional analysis', 'Cross-sectional analysis sets different companies side by side at one point of time. Here one company is followed over several periods.'],
    ['Vertical analysis', 'Vertical analysis stays within the statements of one period. Here several periods of the same company are compared.'],
  ],
};
const KIND_WHY: Record<KindKey, string> = {
  horizontal: 'The same items are compared across two or more periods, so it is horizontal analysis (also called time series or dynamic analysis).',
  vertical: 'Items of the statements of a single period are related to one another, so it is vertical analysis (also called static analysis).',
  inter: 'Two or more companies are compared for the same period, so it is inter-firm comparison (also called cross-sectional analysis).',
  intra: 'A company is compared with its own figures of other periods, so it is intra-firm comparison.',
};
const KIND_CASES: { key: KindKey; text: (c: string, other: string, y: [string, string], d: [string, string]) => string }[] = [
  { key: 'horizontal', text: (c, _o, y) => `${c} sets each line of its Statement of Profit and Loss for ${y[1]} beside the same line for ${y[0]} and works out the change.` },
  { key: 'horizontal', text: (c) => `An analyst studies how the trade receivables of ${c} have moved over its last five balance sheets.` },
  { key: 'horizontal', text: (c, _o, _y, d) => `${c} places its balance sheets as at ${d[0]} and ${d[1]} side by side to see which items rose and which fell.` },
  { key: 'vertical', text: (c, _o, y) => `${c} expresses every expense of ${y[1]} as a percentage of the revenue from operations of ${y[1]}.` },
  { key: 'vertical', text: (c, _o, _y, d) => `An analyst works out what part of the total assets of ${c} as at ${d[1]} is made up of each asset.` },
  { key: 'vertical', text: (c, _o, _y, d) => `A student relates the items of the balance sheet of ${c} as at ${d[1]} to one another, using no other balance sheet.` },
  { key: 'inter', text: (c, o, y) => `An analyst sets the common size Statement of Profit and Loss of ${c} for ${y[1]} beside that of ${o} for ${y[1]}.` },
  { key: 'inter', text: (c, _o, y) => `A bank compares the figures of ${c} for ${y[1]} with those of three other companies of the same industry for ${y[1]}.` },
  { key: 'intra', text: (c, _o, y) => `${c} compares its results of ${y[1]} with its own results of each of the four years before.` },
  { key: 'intra', text: (c) => `The directors of ${c} judge this year's performance of the company only against its own performance of earlier years.` },
];

const horizontalVertical = mcqTemplate({
  id: 'fsa-horizontal-vertical', topicId: T, conceptId: 'fsa-types-tools', difficulty: 'easy',
  generate: (rng) => {
    const [company, other] = rng.shuffle(COMPANIES);
    const item = rng.pick(KIND_CASES);
    return choice(
      `${item.text(company, other, rng.pick(YEARS), rng.pick(DATES))} What is this kind of study called?`,
      KIND_NAME[item.key],
      KIND_WRONG[item.key],
      KIND_WHY[item.key],
      H.tools,
    );
  },
});

type ToolKey = 'comparative' | 'common' | 'ratio' | 'cash';
const TOOLS: Record<ToolKey, { name: string; does: string }> = {
  comparative: { name: 'Comparative statements', does: 'sets two periods side by side and shows the change in each line, in rupees and as a percentage' },
  common: { name: 'Common size statements', does: 'shows each line of one period as a percentage of a common base' },
  ratio: { name: 'Ratio analysis', does: 'expresses the relationship between two related figures as a single number' },
  cash: { name: 'Cash flow analysis', does: 'traces where cash came from and where it went during a period' },
};
const TOOL_CASES: { key: ToolKey; text: (c: string, y: [string, string], d: [string, string]) => string; wants: string }[] = [
  { key: 'comparative', text: (c, y) => `By how much, in rupees and in percentage, did each line of the Statement of Profit and Loss of ${c} change from ${y[0]} to ${y[1]}?`, wants: 'The question is about the change in every line between two years.' },
  { key: 'comparative', text: (c, _y, d) => `Which items of the balance sheet of ${c} rose and which fell between ${d[0]} and ${d[1]}, and by what percentage?`, wants: 'The question is about the change in every item between two dates.' },
  { key: 'common', text: (c, y) => `What share of every ₹100 of the revenue from operations of ${c} did each expense take in ${y[1]}?`, wants: 'The question is about the make-up of one year, each line against one base.' },
  { key: 'common', text: (c, _y, d) => `What part of the total assets of ${c} as at ${d[1]} is held as inventories, as trade receivables and as cash?`, wants: 'The question is about the make-up of one balance sheet, each item against the total.' },
  { key: 'common', text: (c, y) => `With every line of the Statement of Profit and Loss put on a base of 100, how does the cost structure of ${c} in ${y[1]} compare, line by line, with that of a competitor ten times its size?`, wants: 'The question needs every line of each company on one base of 100, so that size does not matter.' },
  { key: 'cash', text: (c, y) => `From which activities did cash come into ${c} during ${y[1]}, and on what was it spent?`, wants: 'The question is about the movement of cash during the year.' },
  { key: 'cash', text: (c, y) => `Why did the cash balance of ${c} fall during ${y[1]} although the company earned a profit?`, wants: 'The question is about cash coming in and going out, which profit does not show.' },
  { key: 'ratio', text: (c, _y, d) => `How do the current assets of ${c} as at ${d[1]} stand in relation to its current liabilities, as one figure of the form x : 1?`, wants: 'The question asks for the relationship between two figures as one number.' },
  { key: 'ratio', text: (c, y) => `How does the profit that ${c} earned in ${y[1]} stand in relation to the funds employed in the business, as one figure that links the Statement of Profit and Loss with the balance sheet?`, wants: 'The question asks for the relationship between two figures, one from each statement, as one number.' },
];

const toolChoice = mcqTemplate({
  id: 'fsa-tool-choice', topicId: T, conceptId: 'fsa-types-tools', difficulty: 'easy',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const item = rng.pick(TOOL_CASES);
    const others = (Object.keys(TOOLS) as ToolKey[]).filter((k) => k !== item.key);
    return choice(
      `An analyst wants to answer this question: "${item.text(company, rng.pick(YEARS), rng.pick(DATES))}" Which tool of financial statement analysis answers it directly?`,
      TOOLS[item.key].name,
      others.map((k): [string, string] => [TOOLS[k].name, `Picked the tool that ${TOOLS[k].does}. ${item.wants}`]),
      `${item.wants} ${TOOLS[item.key].name}: this tool ${TOOLS[item.key].does}.`,
      H.tools,
    );
  },
});

const baseFigure = mcqTemplate({
  id: 'fsa-base-figure', topicId: T, conceptId: 'fsa-common-size', difficulty: 'easy',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const kind = rng.int(0, 2);
    if (kind === 0) {
      const name = lower(rng.pick(CS_PL).name);
      return choice(
        `The common size Statement of Profit and Loss of ${company} has to show ${name} as a percentage. As a percentage of which figure?`,
        'Revenue from operations',
        [
          ['Total income (revenue from operations plus other income)', 'The CBSE textbooks take revenue from operations alone as the base (a few other books take total revenue). Other income is itself shown as a percentage of it, so total income comes to more than 100.'],
          ['Total expenses', 'Took the total of the group the line belongs to. Every line of the statement, income or expense, is a percentage of revenue from operations.'],
          ['Profit before tax', 'Took the result of the statement as the base. Profit is itself shown as a percentage of revenue from operations.'],
          ['The figure of the same line in the previous year', 'That is the base of a percentage change in a comparative statement. A common size statement stays within one year.'],
        ],
        'In a common size Statement of Profit and Loss, revenue from operations is taken as 100 and every other line is a percentage of it.',
        H.csPl,
      );
    }
    if (kind === 1) {
      const asset = rng.int(0, 1) === 0;
      const name = lower(rng.pick(asset ? [...CURRENT_ASSETS, ...NON_CURRENT_ASSETS] : ['Long-term borrowings', 'Trade payables', 'Reserves and surplus', 'Share capital']));
      return choice(
        `The common size balance sheet of ${company} has to show ${name} as a percentage. As a percentage of which figure?`,
        'The total of the balance sheet: total assets, which equal total equity and liabilities',
        [
          ['Non-current assets', 'Left current assets out of the base. The base is the whole of the assets.'],
          ["Shareholders' funds", 'Took the owners\' part alone as the base. The base is the total of equity and liabilities together, which equals total assets.'],
          ['Revenue from operations', 'That is the base of the common size Statement of Profit and Loss, not of the balance sheet.'],
          ['The figure of the same line on the previous balance sheet date', 'That is the base of a percentage change in a comparative balance sheet. A common size balance sheet stays within one date.'],
        ],
        'In a common size balance sheet the total of the balance sheet is taken as 100: total assets on one side, total equity and liabilities on the other. They are the same figure.',
        H.csBs,
      );
    }
    const per = rng.int(0, 1) === 0 ? bsPeriod(rng) : plPeriod(rng);
    const name = lower(rng.pick(per.bs ? BS_LINES : PL_LINES).name);
    return choice(
      `${company} is working out the percentage change in ${name} for its comparative ${per.statement}. By which figure is the absolute change divided?`,
      `The figure of ${name} of the earlier period, ${per.a}`,
      [
        [`The figure of ${name} of the later period, ${per.b}`, 'Took the later figure as the base. A change is measured from where the line started.'],
        [per.bs ? `The total of the balance sheet as at ${per.b}` : `Revenue from operations of ${per.b}`, 'That is the base of a common size statement. A percentage change is worked on the same line of the earlier period.'],
        ['The average of the figures of the two periods', 'Averaged the two figures. The base of a percentage change is the earlier figure alone.'],
      ],
      'Percentage change = absolute change ÷ figure of the earlier period × 100. The earlier period is the base against which the later one is measured.',
      H.change,
    );
  },
});

/** What analysis is for, each with why it counts as an objective. */
const OBJECTIVES: [string, string][] = [
  ['To judge the earning capacity of the business', 'Analysis is used to see how profitable the business is and is likely to remain.'],
  ['To judge whether the business can meet its short-term and long-term obligations', 'Liquidity and solvency are read from the statements by analysing them.'],
  ['To assess how efficiently the management has used the resources', 'Comparing results with the resources used shows how well the business is managed.'],
  ['To compare the performance of the business with that of other firms', 'Inter-firm comparison is one of the main uses of analysis.'],
  ['To find the reasons for a change in profit or in financial position', 'Comparing periods line by line points to where and why the results changed.'],
  // Not "to forecast": the past is only a guide to the future, and some books list forecasting among the limitations.
  ['To judge trends from past figures, as a starting point for planning', 'Comparing several years shows the direction in which revenue, costs and profit are moving, which is where a plan begins.'],
];
const LIMIT_STATEMENTS: string[] = [
  'It ignores changes in the price level',
  'It leaves out qualitative factors such as the skill of the management',
  'It can be distorted by window dressing of the statements',
  'It is only as reliable as the financial statements on which it is based',
  'Different accounting policies make comparison between firms unreliable',
];
/** Things that are not objectives of analysis, each with what it really is. */
const NOT_OBJECTIVES: [string, string][] = [
  ['To record every transaction in the books of original entry', 'That is book-keeping, which comes long before analysis. Analysis starts from statements that are already prepared.'],
  ['To prepare the balance sheet in the form given in Schedule III', 'That is the preparation of financial statements. Analysis takes the prepared statements and interprets them.'],
  ['To show the assets at their current market value', 'Analysis works on the figures as recorded, at historical cost. It does not revalue anything.'],
  ['To remove the effect of changes in the price level from the figures', 'Analysis does not adjust for prices. That it ignores price level changes is one of its limitations.'],
  ['To measure qualitative factors such as the morale of the employees', 'Analysis works on figures in money. That it leaves out qualitative factors is one of its limitations.'],
];

const objectiveOrNot = mcqTemplate({
  id: 'fsa-objective-or-not', version: 2, topicId: T, conceptId: 'fsa-meaning', difficulty: 'medium',
  generate: (rng) => {
    const kind = rng.int(0, 2);
    const objectives = rng.shuffle(OBJECTIVES);
    if (kind === 0) {
      const [correct, why] = rng.pick(NOT_OBJECTIVES);
      return choice(
        'Which of the following is NOT an objective of financial statement analysis?',
        correct,
        objectives.slice(0, 4).map(([text, reason]): [string, string] => [text, `This is an objective. ${reason}`]),
        `${why} The others are all objectives of analysis.`,
        H.objectives,
      );
    }
    if (kind === 1) {
      const correct = rng.pick(LIMIT_STATEMENTS);
      return choice(
        'Which of the following is a limitation of financial statement analysis, and not one of its uses?',
        correct,
        objectives.slice(0, 4).map(([text, reason]): [string, string] => [`It helps ${text.replace(/^To /, 'to ')}`, `This is a use of analysis, not a limitation. ${reason}`]),
        `"${correct}" is a weakness of analysis. The other three are things analysis is used for.`,
        H.objectives,
      );
    }
    const [correct, reason] = objectives[0];
    return choice(
      'Which of the following is an objective of financial statement analysis?',
      correct,
      rng.shuffle(NOT_OBJECTIVES).map(([text, why]): [string, string] => [text, why]),
      `${reason} The other options describe book-keeping, the preparation of statements, or things analysis cannot do.`,
      H.objectives,
    );
  },
});

/** A feature and the tool it belongs to. */
const FEATURES: { key: ToolKey; text: string; why: string }[] = [
  { key: 'comparative', text: 'has, after the particulars, columns for the earlier period, the later period, the absolute change and the percentage change', why: 'Those four columns are the form of a comparative statement.' },
  { key: 'comparative', text: 'shows whether trade receivables rose or fell since the last balance sheet, and by what percentage', why: 'A change between two balance sheets is read from a comparative balance sheet.' },
  { key: 'comparative', text: 'shows, for every line of the Statement of Profit and Loss, the rate at which it grew or fell from one year to the next', why: 'The rate of growth of every line is the percentage change column of a comparative statement.' },
  { key: 'common', text: 'shows every line of the Statement of Profit and Loss as a percentage of revenue from operations', why: 'Taking revenue from operations as 100 gives the common size Statement of Profit and Loss.' },
  { key: 'common', text: 'shows every asset as a percentage of total assets', why: 'Taking the total of the balance sheet as 100 gives the common size balance sheet.' },
  { key: 'common', text: 'takes one figure of a statement as 100 and expresses the other figures of that statement in relation to it', why: 'A common base of 100 is what makes a statement "common size".' },
  { key: 'common', text: 'lets the whole Statement of Profit and Loss of a small company be set beside that of a large one, line by line, because every line is on a base of 100', why: 'Percentages of a common base are comparable whatever the size of the company.' },
  { key: 'cash', text: 'traces the inflows and the outflows of cash of a period', why: 'Following cash in and cash out is cash flow analysis.' },
  { key: 'ratio', text: 'expresses the relationship between two related figures of the statements as a single number', why: 'A ratio is one figure divided by another to which it is related.' },
];

const toolFeature = mcqTemplate({
  id: 'fsa-tool-feature', topicId: T, conceptId: 'fsa-types-tools', difficulty: 'easy',
  generate: (rng) => {
    const item = rng.pick(FEATURES);
    const others = (Object.keys(TOOLS) as ToolKey[]).filter((k) => k !== item.key);
    const ask = rng.pick(['Which tool of financial statement analysis', 'Which of these tools of analysis']);
    return choice(
      `${ask} ${item.text}?`,
      TOOLS[item.key].name,
      others.map((k): [string, string] => [TOOLS[k].name, `Picked the tool that ${TOOLS[k].does}. That is not the feature described.`]),
      `${item.why} ${TOOLS[item.key].name}: this tool ${TOOLS[item.key].does}.`,
      H.tools,
    );
  },
});

// ===============================================================================================================
// FORMATS: the statements themselves, prepared line by line
// ===============================================================================================================
// What the formats add to the conventions at the top of this file:
//  - a figure the data gives as it stands is printed, not typed: the rupee columns are given, so a line the data states
//    prints its figures there once it is chosen, and the student types the totals, the profits, the tax and the
//    columns of change or percentage. The statement from indirect data prints nothing: finding the figures of the two
//    years is the question, and a row prints all its given figures or none, so it could not print one year alone;
//  - a fall is a negative figure (typed with a minus sign, printed in brackets), and the task says so;
//  - a percentage is given to two decimal places, and the task says so. A seed in which one falls exactly between two
//    of them (its third decimal is 5) is rejected, so nothing depends on which way a half is rounded;
//  - no line is nil in the earlier period (a percentage change could not be worked out, and a cell cannot hold a
//    dash), and no line but share capital stands unchanged;
//  - in a common size statement the percentages add up exactly as the rupees do: total expenses is the sum of the
//    percentages above it, and profit is the difference of the percentages it is the difference of. A seed in which
//    rounding breaks that is put right by moving a little from one line to another, or rejected;
//  - a company's name says what it does: a maker consumes materials, a dealer buys stock-in-trade;
//  - tax is a stated percentage of profit before tax, and comes to whole rupees. Its row is "Tax", as an answer on these
//    statements writes it, and "Tax expense" (Schedule III) is accepted for it; no other name of the tax is ever offered
//    as a wrong label. "Profit after tax" is a sub-total, which the screen prints;
//  - a balance sheet shows its major heads as sub-headings, each line under its own, and the two totals: no sub-total
//    of a head, as an answer on a comparative or a common size balance sheet needs none. Each would add four cells, and
//    the total of the assets, which adds up the rows back to the last sub-total, could no longer be checked;
//  - a statement of two periods for 4 marks has ten to twelve lines, a Statement of Profit and Loss among them three or
//    four expenses; the fifth expense is for the statement from indirect data, which is for 6 marks.

/** The figures of a line in the two periods, earlier then later, in whole rupees. */
export type Pair = [number, number];
const pair = (f: (k: number) => number): Pair => [f(0), f(1)];

/**
 * A line of a statement to prepare: a sub-heading, a row, or a sub-total (with what the engine is to check it adds up).
 * `worked` marks a row whose figures the data does not give as they stand (the tax): in a statement that prints the
 * given figures, it is typed in every column all the same.
 */
type FormatLine = { heading: string } | { row: string; v: Pair; also?: string[]; worked?: true } | { subtotal: string; v: Pair; sum?: 'section' | 'block' | 'all' };

/**
 * `part` as a percentage of `base` in hundredths, to two decimal places, negative when `part` is. Null when there is no
 * base, or when the percentage falls exactly between two hundredths: a student might round it either way.
 */
export function pct2(part: number, base: number): number | null {
  if (base <= 0) return null;
  const halves = 2 * Math.abs(part) * 10000;
  if (halves % base === 0 && (halves / base) % 2 === 1) return null;
  return Math.sign(part) * Math.floor((halves + base) / (2 * base));
}
/** A percentage in hundredths with its sign: "12.5%", "-16.67%". */
const signedPc = (h: number): string => (h < 0 ? `-${pc(-h)}` : pc(h));
const signedInr = (n: number): string => (n < 0 ? `-${inr(-n)}` : inr(n));
/** Names of lines in running text: "cost of materials consumed, finance costs and other expenses". */
const listOf = (names: readonly string[]): string => {
  const said = names.map(lower);
  return said.length <= 2 ? said.join(' and ') : `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`;
};
/** `percentOfIt` per cent of an amount, to the nearest `unit` rupees. */
const scaled = (amount: number, percentOfIt: number, unit = 10000): number => unit * Math.round((amount * percentOfIt) / 100 / unit);
/** The first draw of several that is not rejected: a statement of many lines seldom comes right at the first. */
export function attempt<S>(times: number, draw: () => S | null): S | null {
  for (let i = 0; i < times; i++) {
    const s = draw();
    if (s !== null) return s;
  }
  return null;
}

/** A line of a comparative statement: the two figures, the absolute change and the percentage change on the earlier figure. */
function changeFigures(v: Pair): number[] | null {
  const change = v[1] - v[0];
  const p = pct2(change, v[0]);
  // A change too small to show in two decimal places would read as no change at all.
  return p === null || (change !== 0 && p === 0) ? null : [v[0] * 100, v[1] * 100, change * 100, p];
}
/**
 * The rows of a statement from its lines; null when a figure of some line cannot be given. With `printed`, the
 * statement prints the figures its data gives (its rupee columns are given), and a row that is worked out says so.
 */
function formatRows(lines: FormatLine[], figures: (v: Pair) => number[] | null, printed = false): StatementParts['rows'] | null {
  const rows: StatementParts['rows'] = [];
  for (const line of lines) {
    if ('heading' in line) {
      rows.push(line);
      continue;
    }
    const amounts = figures(line.v);
    if (!amounts) return null;
    rows.push(
      'row' in line
        ? { label: line.row, amounts, ...(line.also ? { also: line.also } : {}), ...(printed && line.worked ? { given: false } : {}) }
        : { subtotal: line.subtotal, amounts, ...(line.sum ? { sum: line.sum } : {}) },
    );
  }
  return rows;
}

/** The columns of a comparative statement; with `printed`, the figures of the two periods are given. */
const changeColumns = (per: Period, printed = false): StatementParts['columns'] => [
  printed ? { name: `${per.a} (₹)`, given: true } : `${per.a} (₹)`,
  printed ? { name: `${per.b} (₹)`, given: true } : `${per.b} (₹)`,
  { name: 'Absolute change (₹)', signed: true },
  { name: 'Percentage change (%)', unit: 'percent', signed: true },
];
const CHANGE_RULES = 'Give every percentage to two decimal places and show a decrease with a minus sign.';
const FORMAT_HINTS = {
  change: [
    'Work out every total and every profit for each period first. Then take each line across: later figure less earlier figure.',
    'Percentage change = absolute change ÷ figure of the EARLIER period × 100. A fall is a negative figure in both columns.',
  ],
  changeBs: [
    'Enter each line under its major head and add up each half on each date first: the two totals of a date agree. Then take each line across: later figure less earlier figure.',
    'Percentage change = absolute change ÷ figure of the EARLIER date × 100. A fall is a negative figure in both columns, and the total has a change of its own.',
  ],
  sharePl: [
    'Work out the totals, the profit and the tax of each year in rupees first. Revenue from operations of a year is 100 for that year.',
    'Percentage of a line = the line ÷ revenue from operations of the SAME year × 100. Other income is not part of the base, so total income is more than 100.',
  ],
  indirect: [
    'Work out every line of both years first. A percentage of revenue is on the revenue of its own year; a rise of so many per cent is on the earlier figure.',
    'Then the totals, profit before tax, tax at the rate of each year and profit after tax. The two change columns come last.',
  ],
  shareBs: [
    'Add up each half of the balance sheet on each date: the total of the balance sheet is 100 for that date.',
    'Percentage of a line = the line ÷ total of the balance sheet of the SAME date × 100. The percentages of each half add up to 100.',
  ],
};

// What `verify` reads back from a finished statement, and how it checks a figure without repeating the working.
/** Every row of a statement, and every sub-total: its name and its figures as the question holds them. */
const rowFigures = (q: StatementQuestion): [string, number[]][] => q.rows.map((r): [string, number[]] => [r.label, r.amounts]);
const subtotalFigures = (q: StatementQuestion): [string, number[]][] => (q.lines ?? []).flatMap((l): [string, number[]][] => ('subtotal' in l ? [[l.subtotal, l.amounts]] : []));
/** True when `p` hundredths is the percentage nearest to part ÷ base × 100: checked by multiplying back, not by dividing. */
const isNearest = (p: number, part: number, base: number): boolean => base > 0 && 2 * Math.abs(part * 10000 - p * base) < base;
/** A line of a comparative statement holds: the change is the later figure less the earlier, and the percentage is on the earlier. */
const changeHolds = ([a, b, change, p]: number[]): boolean => change === b - a && isNearest(p, change, a);
/** The figures of a sub-total, by its name; the n-th of that name when a statement has two (the totals of a balance sheet). */
const subtotalOf = (q: StatementQuestion, name: string, nth = 0): number[] | undefined => subtotalFigures(q).filter(([n]) => n === name)[nth]?.[1];
/**
 * True when the statement prints exactly the figures its data gives as they stand: the given columns are `given`, the
 * rows the data states (`stated`, by name) print there, every other row is typed in every column, and no sub-total
 * is printed.
 */
const printsOnly = (q: StatementQuestion, given: readonly boolean[], stated: readonly string[]): boolean =>
  q.givenColumns?.length === given.length &&
  given.every((g, c) => q.givenColumns?.[c] === g) &&
  q.rows.every((r) => (r.given !== false) === stated.includes(r.label)) &&
  (q.lines ?? []).every((l) => !('subtotal' in l) || l.given !== true);
/** Said in the task of a statement that prints the figures its data gives. */
const PRINTED = 'The figures the data gives are printed as you choose each line: fill in the rest.';
/** True when the two rupee figures of a line of the question are these, in whole rupees. */
const sameRupees = (figures: number[] | undefined, v: readonly number[]): boolean => figures !== undefined && figures[0] === v[0] * 100 && figures[1] === v[1] * 100;

// ---------------------------------------------------------------------------------------------------------------
// A Statement of Profit and Loss of two years
// ---------------------------------------------------------------------------------------------------------------

/** What a company does, which decides its first expense line and the share of revenue each expense usually takes. */
export interface Trade {
  companies: string[];
  material: string;
  share: [number, number];
  staff: [number, number];
  other: [number, number];
}
const MAKERS: Trade = { companies: COMPANIES, material: 'Cost of materials consumed', share: [46, 58], staff: [10, 16], other: [6, 11] };
const DEALERS: Trade = {
  companies: ['Nandini Retail Ltd.', 'Omkar Distributors Ltd.', 'Pushpak Traders Ltd.', 'Revati Stores Ltd.', 'Shubham Wholesale Ltd.', 'Tarini Marts Ltd.'],
  material: 'Purchases of stock-in-trade',
  share: [58, 68],
  staff: [6, 10],
  other: [5, 9],
};
/** Two companies in three make what they sell. */
export const drawTrade = (rng: Rng): Trade => (rng.int(0, 2) === 0 ? DEALERS : MAKERS);
const FINANCE = 'Finance costs';
const DEPRECIATION = 'Depreciation and amortisation expense';
/**
 * The tax of the year is the row "Tax", as an answer on a comparative or a common size statement writes it ("Less:
 * Tax"), and "Tax expense", the name Schedule III gives the line, is right as well. The last line is the sub-total
 * "Profit after tax", which the screen prints.
 */
const TAX = 'Tax';
const TAX_EXPENSE = 'Tax expense';
/** Which of finance costs and depreciation the statement from indirect data has beside its three main expenses: one of them, or both. */
const drawExtras = (rng: Rng): string[] => rng.pick([[FINANCE], [DEPRECIATION], [FINANCE, DEPRECIATION]]);
/**
 * The same for a statement of 4 marks: neither or one of them, so that it has ten or eleven lines. Five expense lines
 * are for the statement of 6 marks.
 */
export const drawOneExtra = (rng: Rng): string[] => rng.pick([[], [FINANCE], [DEPRECIATION]]);

/** Two years of account and the day each ends on: "2025-26" ends on 31 March 2026. */
export function drawYears(rng: Rng): { per: Period; ends: [string, string] } {
  const k = rng.int(0, YEARS.length - 1);
  const [a, b] = YEARS[k];
  return { per: { a, b, inA: `in ${a}`, inB: `in ${b}`, bs: false, statement: 'Statement of Profit and Loss' }, ends: DATES[k] };
}

/** The lines of a Statement of Profit and Loss that are given: the expenses by name in the order of Schedule III, and the rate of tax of each year. */
export interface PlData {
  names: string[];
  rev: Pair;
  oi: Pair;
  exp: Pair[];
  /** Tax as a whole percentage of profit before tax, for each year. */
  rate: Pair;
}
/** The lines that are worked out from them. */
export interface PlWorked {
  income: Pair;
  expenses: Pair;
  pbt: Pair;
  tax: Pair;
  pat: Pair;
}
/** Null when a year shows no profit before tax, or tax leaves paise. */
export function workPl(d: PlData): PlWorked | null {
  const income = pair((k) => d.rev[k] + d.oi[k]);
  const expenses = pair((k) => sum(d.exp.map((e) => e[k])));
  const pbt = pair((k) => income[k] - expenses[k]);
  if (pbt.some((v, k) => v <= 0 || (v * d.rate[k]) % 100 !== 0)) return null;
  const tax = pair((k) => (pbt[k] * d.rate[k]) / 100);
  return { income, expenses, pbt, tax, pat: pair((k) => pbt[k] - tax[k]) };
}
const plLines = (d: PlData, w: PlWorked): FormatLine[] => [
  { row: 'Revenue from operations', v: d.rev },
  { row: 'Other income', v: d.oi },
  { subtotal: 'Total income', v: w.income, sum: 'block' },
  { heading: 'Expenses' },
  ...d.names.map((name, i): FormatLine => ({ row: name, v: d.exp[i] })),
  { subtotal: 'Total expenses', v: w.expenses, sum: 'section' },
  { subtotal: 'Profit before tax', v: w.pbt },
  { row: TAX, v: w.tax, also: [TAX_EXPENSE], worked: true },
  { subtotal: 'Profit after tax', v: w.pat },
];
/**
 * Labels a student might reach for in a Statement of Profit and Loss, less those the statement uses. No other name of
 * the tax of the year is among them ("Tax expense", "Provision for tax", "Income tax"): an examiner accepts each.
 */
const plDistractors = (d: PlData): string[] =>
  ['Cost of materials consumed', 'Purchases of stock-in-trade', FINANCE, DEPRECIATION, 'Gross profit'].filter((name) => !d.names.includes(name));
/** Said once in the working of a statement that goes down to profit after tax: the names Schedule III gives its last two lines. */
const TAX_NAMES = 'Schedule III calls the tax of the year "Tax expense" and the profit after it "Profit for the period": the statement is right under either name of the tax.';
/** The given lines of a statement by name, in its order: the two incomes and then the expenses. */
const plGiven = (d: PlData): [string, Pair][] => [['Revenue from operations', d.rev], ['Other income', d.oi], ...d.names.map((name, i): [string, Pair] => [name, d.exp[i]])];

/**
 * A believable margin in both years (5% to 20% of revenue before tax), totals, profit and tax that all move, the profit
 * not by more than half down or three fifths up, and no two given lines below revenue with the same pair of figures
 * (they would read as a misprint).
 */
const believablePl = (d: PlData, w: PlWorked): boolean =>
  w.pbt.every((v, k) => v * 100 >= 5 * d.rev[k] && v * 100 <= 20 * d.rev[k]) &&
  [w.income, w.expenses, w.pbt, w.tax, w.pat].every((v) => v[0] !== v[1]) &&
  w.pbt[1] * 2 >= w.pbt[0] &&
  w.pbt[1] * 5 <= w.pbt[0] * 8 &&
  new Set([d.oi, ...d.exp].map((e) => e.join('|'))).size === d.exp.length + 1;

/**
 * Two years of a company of a trade: revenue that grows or shrinks, other income, and expenses each near the share of
 * revenue such a line takes, moving roughly with revenue. Null when a line stands still or the margin is not believable.
 */
export function drawPlData(rng: Rng, trade: Trade, extras: string[], rate: Pair): PlData | null {
  const rev1 = 100000 * rng.int(20, 90);
  const g = rng.pick([-10, -8, -5, 4, 5, 6, 8, 10, 12, 15, 20, 25]);
  const rev2 = scaled(rev1, 100 + g);
  const oi1 = 10000 * rng.int(2, Math.max(3, Math.floor(rev1 / 300000)));
  const oi2 = oi1 + 10000 * rng.pick([-3, -2, -1, 1, 2, 3, 4]);
  const names = [trade.material, 'Employee benefits expense', ...extras, 'Other expenses'];
  const exp = names.map((name): Pair => {
    if (name === trade.material) {
      const v = scaled(rev1, rng.int(trade.share[0], trade.share[1]));
      return [v, scaled(v, 100 + g + rng.int(-4, 5))];
    }
    if (name === 'Employee benefits expense') {
      const v = scaled(rev1, rng.int(trade.staff[0], trade.staff[1]));
      return [v, scaled(v, 100 + rng.int(-3, 14))];
    }
    // The two small lines move by whole ten thousands, so that neither stands still: borrowings are repaid or taken,
    // and depreciation mostly rises as assets are added.
    const steps = (v: number, share: number): number => 10000 * rng.int(1, Math.max(1, Math.round((v * share) / 1000000)));
    if (name === FINANCE) {
      const v = scaled(rev1, rng.int(2, 4));
      return [v, rng.int(0, 1) === 0 ? v - steps(v, 25) : v + steps(v, 30)];
    }
    if (name === DEPRECIATION) {
      const v = scaled(rev1, rng.int(2, 5));
      return [v, rng.int(0, 3) === 0 ? v - steps(v, 10) : v + steps(v, 20)];
    }
    const v = scaled(rev1, rng.int(trade.other[0], trade.other[1]));
    return [v, scaled(v, 100 + g + rng.int(-8, 8))];
  });
  const d: PlData = { names, rev: [rev1, rev2], oi: [oi1, oi2], exp, rate };
  const w = workPl(d);
  if (!w || oi2 <= 0 || exp.some(([a, b]) => a <= 0 || b <= 0 || a === b)) return null;
  if (!believablePl(d, w)) return null;
  return d;
}

/** What a statement of two years is prepared from, one line of the data each: the given lines, and the tax last. */
const plDataLines = (d: PlData, per: Period): string[] => [
  ...plGiven(d).map(([name, v]) => twoYears(name, v, per)),
  d.rate[0] === d.rate[1] ? `Tax: ${d.rate[0]}% of profit before tax in both years` : `Tax: ${d.rate[0]}% of profit before tax in ${per.a} and ${d.rate[1]}% in ${per.b}`,
];
/**
 * The same read back from the data by `verify`, and what it comes to worked another way: profit after tax first, as
 * what tax leaves of every rupee of profit, and tax as the rest.
 */
function plRead(data: string): { income: Pair; expenses: Pair; pbt: Pair; tax: Pair; pat: Pair; given: [string, number[]][] } | null {
  const lines = rowsIn(data);
  const given = lines.slice(0, -1);
  const rates = pctsIn(data.split('\n').at(-1) ?? '');
  if (lines.at(-1)?.[0] !== 'Tax' || rates.length === 0 || given.some(([, v]) => v.length !== 2)) return null;
  const isIncome = (name: string): boolean => name === 'Revenue from operations' || name === 'Other income';
  const income = pair((k) => sum(given.filter(([name]) => isIncome(name)).map(([, v]) => v[k])));
  const expenses = pair((k) => sum(given.filter(([name]) => !isIncome(name)).map(([, v]) => v[k])));
  const pbt = pair((k) => income[k] - expenses[k]);
  const pat = pair((k) => (pbt[k] * (10000 - rates[Math.min(k, rates.length - 1)])) / 10000);
  return { income, expenses, pbt, tax: pair((k) => pbt[k] - pat[k]), pat, given };
}
/** True when the statement holds exactly the lines of the data and the five lines worked out from them, in rupees. */
function plAgrees(q: StatementQuestion): boolean {
  const read = plRead(q.data);
  if (!read) return false;
  const rows = rowFigures(q);
  return (
    rows.length === read.given.length + 1 &&
    read.given.every(([name, v]) => sameRupees(rows.find(([label]) => label === name)?.[1], v)) &&
    sameRupees(rows.find(([label]) => label === 'Tax')?.[1], read.tax) &&
    subtotalFigures(q).length === 4 &&
    sameRupees(subtotalOf(q, 'Total income'), read.income) &&
    sameRupees(subtotalOf(q, 'Total expenses'), read.expenses) &&
    sameRupees(subtotalOf(q, 'Profit before tax'), read.pbt) &&
    sameRupees(subtotalOf(q, 'Profit after tax'), read.pat)
  );
}
/** One line of a comparative statement worked in words: the change, and the change as a percentage of the earlier figure. */
const changeWorked = (name: string, v: Pair): string =>
  `${name}: ${inr(v[1])} - ${inr(v[0])} = ${signedInr(v[1] - v[0])}, and ${signedInr(v[1] - v[0])} ÷ ${inr(v[0])} × 100 = ${signedPc(pct2(v[1] - v[0], v[0]) ?? 0)}.`;

const fmtComparativePl = statementTemplate({
  id: 'fsa-fmt-comparative-pl', topicId: T, conceptId: 'fsa-formats', difficulty: 'medium',
  generate: (rng) => {
    // The rate of tax is drawn first, so that a seed does not give this statement the company and the figures that it
    // gives the common size statement of two years, which draws the same things.
    const t = rng.pick([20, 25, 30]);
    const trade = drawTrade(rng);
    const company = rng.pick(trade.companies);
    const { per, ends } = drawYears(rng);
    const extras = drawOneExtra(rng);
    const d = attempt(40, () => drawPlData(rng, trade, extras, [t, t]));
    const w = d && workPl(d);
    if (!d || !w) return null;
    const rows = formatRows(plLines(d, w), changeFigures, true);
    if (!rows) return null;
    const fell = plGiven(d).filter(([, v]) => v[1] < v[0]);
    // Revenue is worked in the step before, so the fall that is worked is another line where there is one.
    const shown = fell.find(([name]) => name !== 'Revenue from operations');
    return {
      task: `Prepare the Comparative Statement of Profit and Loss of ${company} for the years ended ${ends[0]} and ${ends[1]}. ${PRINTED} ${CHANGE_RULES}`,
      data: [
        `${company} gives these figures from its Statements of Profit and Loss for the years ended ${ends[0]} (${per.a}) and ${ends[1]} (${per.b}). These lines and tax are the whole of each statement.`,
        ...plDataLines(d, per),
      ].join('\n'),
      title: `Comparative Statement of Profit and Loss of ${company} for the years ended ${ends[0]} and ${ends[1]}`,
      columns: changeColumns(per, true),
      rows,
      distractors: plDistractors(d),
      hints: FORMAT_HINTS.change,
      explanation: [
        `The statement has four amount columns: the figures of ${per.a}, the figures of ${per.b}, the absolute change and the percentage change. The lines stand in the order of Schedule III: the two incomes, then the expenses (${listOf(d.names)}), then the profit and the tax.`,
        `Total income = revenue from operations + other income: ${inr(w.income[0])} in ${per.a} and ${inr(w.income[1])} in ${per.b}.`,
        `Total expenses = ${d.exp.map((e) => inr(e[0])).join(' + ')} = ${inr(w.expenses[0])} in ${per.a}, and ${d.exp.map((e) => inr(e[1])).join(' + ')} = ${inr(w.expenses[1])} in ${per.b}.`,
        `Profit before tax = total income - total expenses: ${inr(w.pbt[0])} and ${inr(w.pbt[1])}. Tax at ${t}% of it: ${inr(w.tax[0])} and ${inr(w.tax[1])}. Profit after tax: ${inr(w.pat[0])} and ${inr(w.pat[1])}. ${TAX_NAMES}`,
        `Absolute change = figure of ${per.b} less figure of ${per.a}. Percentage change = absolute change ÷ figure of ${per.a} × 100. ${changeWorked('Revenue from operations', d.rev)}`,
        fell.length > 0
          ? `${cap(listOf(fell.map(([name]) => name)))} fell: a fall is a negative figure in both change columns.${shown ? ` ${changeWorked(shown[0], shown[1])}` : ''}`
          : 'Every given line rose, so no given line has a negative change.',
        `A total or a profit has its own change, worked on its own figures: the percentages above it are never added. ${changeWorked('Profit before tax', w.pbt)} Tax is ${t}% of the profit in both years, so tax and profit after tax change by the same percentage as profit before tax.`,
      ],
    };
  },
  // Another way: the totals, the profit and the tax are worked again from the data (profit after tax first, tax as what
  // is left), and every line is checked by multiplying its percentage back. The two years of the lines the data states
  // are printed, and nothing else.
  verify: (q) =>
    plAgrees(q) &&
    printsOnly(q, [true, true, false, false], plRead(q.data)?.given.map(([name]) => name) ?? []) &&
    [...rowFigures(q), ...subtotalFigures(q)].every(([, figures]) => changeHolds(figures)),
});

// ---------------------------------------------------------------------------------------------------------------
// A balance sheet on two dates
// ---------------------------------------------------------------------------------------------------------------

/** A major head of a balance sheet with the lines the data gives under it, in the order of Schedule III. */
export interface BsHead {
  heading: string;
  lines: [string, Pair][];
}
/** The two halves of a balance sheet on two dates. Every head has a line, and the halves come to the same total on each date. */
export interface BsData {
  funds: BsHead[];
  assets: BsHead[];
}
const bsGiven = (d: BsData): [string, Pair][] => [...d.funds, ...d.assets].flatMap((head) => head.lines);
const bsTotal = (heads: BsHead[]): Pair => pair((k) => sum(heads.flatMap((head) => head.lines.map(([, v]) => v[k]))));
const bsLines = (d: BsData): FormatLine[] => [
  { heading: 'I. EQUITY AND LIABILITIES' },
  ...d.funds.flatMap((head): FormatLine[] => [{ heading: head.heading }, ...head.lines.map(([name, v]): FormatLine => ({ row: name, v }))]),
  { subtotal: 'Total', v: bsTotal(d.funds), sum: 'all' },
  { heading: 'II. ASSETS' },
  ...d.assets.flatMap((head): FormatLine[] => [{ heading: head.heading }, ...head.lines.map(([name, v]): FormatLine => ({ row: name, v }))]),
  { subtotal: 'Total', v: bsTotal(d.assets), sum: 'block' },
];
/** Said in the data of a balance sheet to prepare: nothing is left out, so each half adds up to the total. */
const BS_WHOLE = 'These lines are the whole of each balance sheet.';
/**
 * True when every line is there on the later date, none but share capital stands still, and no two lines under one
 * major head have the same pair of figures (they would read as a misprint).
 */
const bsMoves = (d: BsData): boolean =>
  bsGiven(d).every(([name, [a, b]]) => b > 0 && (a !== b || name === 'Share capital')) &&
  [...d.funds, ...d.assets].every((head) => new Set(head.lines.map(([, v]) => v.join('|'))).size === head.lines.length);
/** Lines of a balance sheet a student might reach for, less those the statement uses. */
const bsDistractors = (d: BsData): string[] => {
  const used = bsGiven(d).map(([name]) => name);
  return ['Long-term provisions', 'Other current liabilities', 'Short-term borrowings', 'Short-term provisions', 'Non-current investments', 'Current investments', 'Short-term loans and advances']
    .filter((name) => !used.includes(name))
    .slice(0, 5);
};

/**
 * The balance sheets of a manufacturing company on two dates, each line near the share of the total such a line takes.
 * Reserves and surplus are what is left of the first total, and property, plant and equipment of both: the two halves
 * agree because the assets are drawn to the total of equity and liabilities. Short-term borrowings, short-term
 * provisions and non-current investments are there in some seeds and not in others. Share capital stands still or rises
 * by a fresh issue, never falls. Null when another line stands still or a share is not believable.
 */
function drawBsData(rng: Rng): BsData | null {
  const total1 = 100000 * rng.int(30, 120);
  // At most two of the three lines that are not always there, so that the statement has eight to ten lines.
  const [withStb, withProv, withNci] = rng.pick([[false, false, false], [true, false, false], [false, true, false], [false, false, true], [true, true, false], [true, false, true], [false, true, true]]);
  const moved = (v: number, by: number): number => scaled(v, 100 + by);
  const sc1 = scaled(total1, rng.int(32, 44), 100000);
  const ltb1 = scaled(total1, rng.int(12, 22));
  const stb1 = withStb ? scaled(total1, rng.int(4, 8)) : 0;
  const tp1 = scaled(total1, rng.int(7, 13));
  const stp1 = withProv ? scaled(total1, rng.int(2, 5)) : 0;
  const res1 = total1 - sc1 - ltb1 - stb1 - tp1 - stp1;
  const sc2 = rng.int(0, 1) === 0 ? sc1 : sc1 + scaled(sc1, rng.pick([10, 20, 25]), 100000);
  // Reserves mostly grow by the profit kept back; one year in five they fall (a loss, or a large dividend).
  const res2 = rng.int(0, 4) === 0 ? moved(res1, -rng.int(5, 20)) : moved(res1, rng.int(10, 45));
  const ltb2 = moved(ltb1, rng.pick([-30, -25, -20, -10, 10, 20, 25, 40]));
  const stb2 = withStb ? moved(stb1, rng.pick([-50, -25, 25, 50])) : 0;
  const tp2 = moved(tp1, rng.int(-15, 30));
  const stp2 = withProv ? moved(stp1, rng.int(-20, 40)) : 0;
  const total2 = sc2 + res2 + ltb2 + stb2 + tp2 + stp2;
  const nci1 = withNci ? scaled(total1, rng.int(5, 10)) : 0;
  const inv1 = scaled(total1, rng.int(13, 20));
  const tr1 = scaled(total1, rng.int(11, 17));
  const cash1 = scaled(total1, rng.int(3, 9));
  const ppe1 = total1 - nci1 - inv1 - tr1 - cash1;
  const nci2 = withNci ? moved(nci1, rng.pick([-50, -25, -20, 20, 25, 50])) : 0;
  const inv2 = moved(inv1, rng.int(-15, 30));
  const tr2 = moved(tr1, rng.int(-15, 30));
  const cash2 = scaled(total2, rng.int(3, 9));
  const ppe2 = total2 - nci2 - inv2 - tr2 - cash2;
  if (res1 * 100 < 8 * total1 || res1 * 100 > 30 * total1 || total2 === total1) return null;
  if (ppe1 * 100 < 42 * total1 || ppe1 * 100 > 66 * total1 || ppe2 * 100 < 88 * ppe1 || ppe2 * 100 > 140 * ppe1) return null;
  // Cash moves, but does not halve or double.
  if (cash2 * 2 < cash1 || cash2 > cash1 * 2) return null;
  const line = (name: string, a: number, b: number): [string, Pair][] => (a > 0 ? [[name, [a, b]]] : []);
  const d: BsData = {
    funds: [
      { heading: "1. Shareholders' funds", lines: [...line('Share capital', sc1, sc2), ...line('Reserves and surplus', res1, res2)] },
      { heading: '2. Non-current liabilities', lines: line('Long-term borrowings', ltb1, ltb2) },
      { heading: '3. Current liabilities', lines: [...line('Short-term borrowings', stb1, stb2), ...line('Trade payables', tp1, tp2), ...line('Short-term provisions', stp1, stp2)] },
    ],
    assets: [
      { heading: '1. Non-current assets', lines: [...line('Property, plant and equipment', ppe1, ppe2), ...line('Non-current investments', nci1, nci2)] },
      { heading: '2. Current assets', lines: [...line('Inventories', inv1, inv2), ...line('Trade receivables', tr1, tr2), ...line('Cash and cash equivalents', cash1, cash2)] },
    ],
  };
  return bsMoves(d) ? d : null;
}

/** True of a line that is an asset, by the lists the short questions use. */
const isAssetLine = (name: string): boolean => NON_CURRENT_ASSETS.includes(name) || CURRENT_ASSETS.includes(name);
/** Under which major head each line stands, said in one sentence of the working. */
const bsPlaces = (d: BsData): string =>
  [...d.funds, ...d.assets].map((head) => `${listOf(head.lines.map(([name]) => name))} under ${lower(head.heading.slice(3))}`).join('; ');
/**
 * True when the statement holds exactly the lines of the data, each under the major head it belongs to (read from the
 * groups the short questions use, not from the heads the statement was built with), and the two totals are what each
 * half of the data adds up to, the same on each date.
 */
function bsAgrees(q: StatementQuestion): boolean {
  const given = rowsIn(q.data);
  if (given.some(([, v]) => v.length !== 2)) return false;
  const half = (asset: boolean): Pair => pair((k) => sum(given.filter(([name]) => isAssetLine(name) === asset).map(([, v]) => v[k])));
  const funds = half(false);
  const assets = half(true);
  const headings = (q.lines ?? []).flatMap((l) => ('heading' in l ? [l] : []));
  const headOf = (i: number): string => headings.filter((l) => l.at <= i).at(-1)?.heading ?? '';
  const rows = rowFigures(q);
  return (
    funds[0] === assets[0] &&
    funds[1] === assets[1] &&
    rows.length === given.length &&
    given.every(([name, v]) => sameRupees(rows.find(([label]) => label === name)?.[1], v)) &&
    q.rows.every((r, i) => headOf(i).slice(3) === (BS_GROUPS.find((g) => g.parts.includes(r.label))?.name ?? 'Non-current liabilities')) &&
    subtotalFigures(q).length === 2 &&
    sameRupees(subtotalOf(q, 'Total', 0), funds) &&
    sameRupees(subtotalOf(q, 'Total', 1), assets)
  );
}

/** The comparative balance sheet of `fsa-fmt-comparative-bs`, with the figures it is made from, for the case of the analysis stage. */
export interface ComparativeBsCase {
  parts: StatementParts;
  company: string;
  per: Period;
  d: BsData;
}
export function comparativeBalanceSheet(rng: Rng): ComparativeBsCase | null {
  const company = rng.pick(COMPANIES);
  const per = bsPeriod(rng);
  const d = attempt(12, () => drawBsData(rng));
  if (!d) return null;
  const rows = formatRows(bsLines(d), changeFigures);
  if (!rows) return null;
  const total = bsTotal(d.funds);
  const given = bsGiven(d);
  const fell = given.filter(([, v]) => v[1] < v[0]);
  const capital = given[0][1];
  const reserves = given[1];
  const parts: StatementParts = {
    task: `Prepare the Comparative Balance Sheet of ${company} as at ${per.a} and ${per.b}. ${PRINTED} ${CHANGE_RULES}`,
    data: [`${company} gives these figures from its balance sheets as at ${per.a} and ${per.b}. ${BS_WHOLE}`, ...given.map(([name, v]) => twoYears(name, v, per))].join('\n'),
    title: `Comparative Balance Sheet of ${company} as at ${per.a} and ${per.b}`,
    columns: changeColumns(per, true),
    rows,
    distractors: bsDistractors(d),
    hints: FORMAT_HINTS.changeBs,
    explanation: [
      `Equity and liabilities come first and assets after them, each line under its major head as Schedule III lays down: ${bsPlaces(d)}.`,
      `Total of equity and liabilities = ${d.funds.flatMap((head) => head.lines.map(([, v]) => inr(v[0]))).join(' + ')} = ${inr(total[0])} as at ${per.a}, and ${inr(total[1])} as at ${per.b}. The assets add up to the same figure on each date, as the two halves of a balance sheet must.`,
      `Absolute change = figure as at ${per.b} less figure as at ${per.a}. Percentage change = absolute change ÷ figure as at ${per.a} × 100. ${changeWorked(reserves[0], reserves[1])}`,
      capital[0] === capital[1]
        ? 'Share capital is the same on both dates: its change is nil, so nothing is entered against it in the two change columns.'
        : `Share capital rose because shares were issued. ${changeWorked('Share capital', capital)}`,
      fell.length > 0
        ? `${cap(listOf(fell.map(([name]) => name)))} fell: a fall is a negative figure in both change columns.${fell[0][0] === reserves[0] ? '' : ` ${changeWorked(fell[0][0], fell[0][1])}`}`
        : 'No line fell, so no figure is negative.',
      `The total has its own change, worked on the totals: ${inr(total[1])} - ${inr(total[0])} = ${signedInr(total[1] - total[0])}, and ${signedInr(total[1] - total[0])} ÷ ${inr(total[0])} × 100 = ${signedPc(pct2(total[1] - total[0], total[0]) ?? 0)}. It is the same for both halves.`,
    ],
  };
  return { parts, company, per, d };
}
/**
 * Another way: each half is added up again from the data, the place of every line is read from the groups of the short
 * questions, and every line is checked by multiplying its percentage back.
 */
export const comparativeBalanceSheetHolds = (q: StatementQuestion): boolean => bsAgrees(q) && [...rowFigures(q), ...subtotalFigures(q)].every(([, figures]) => changeHolds(figures));

const fmtComparativeBs = statementTemplate({
  id: 'fsa-fmt-comparative-bs', topicId: T, conceptId: 'fsa-formats', difficulty: 'medium',
  generate: (rng) => comparativeBalanceSheet(rng)?.parts ?? null,
  // Another way: each half is added up again from the data, the place of every line is read from the groups of the short
  // questions, and every line is checked by multiplying its percentage back. The two dates of every line are printed,
  // and nothing else: the two totals are added up.
  verify: (q) => comparativeBalanceSheetHolds(q) && printsOnly(q, [true, true, false, false], rowsIn(q.data).map(([name]) => name)),
});

// ---------------------------------------------------------------------------------------------------------------
// Common size statements of two periods
// ---------------------------------------------------------------------------------------------------------------

/** The columns of a common size statement of two periods, the figures of the two periods given. */
const shareColumns = (per: Period): StatementParts['columns'] => [
  { name: `${per.a} (₹)`, given: true },
  { name: `${per.b} (₹)`, given: true },
  { name: `${per.a} (%)`, unit: 'percent', adds: true },
  { name: `${per.b} (%)`, unit: 'percent', adds: true },
];
const SHARE_RULES = 'Give every percentage to two decimal places.';
/** A line of a common size statement of two periods: the two figures, and each as a percentage of the base of its own period. */
const shareFigures =
  (base: Pair) =>
  (v: Pair): number[] | null => {
    const p = [pct2(v[0], base[0]), pct2(v[1], base[1])];
    return p[0] === null || p[1] === null || p[0] <= 0 || p[1] <= 0 ? null : [v[0] * 100, v[1] * 100, p[0], p[1]];
  };
/** A line of a common size statement holds: each percentage is the nearest to its figure on the base of its own period. */
const shareHolds = ([a, b, pa, pb]: number[], base: readonly number[]): boolean => isNearest(pa, a, base[0] * 100) && isNearest(pb, b, base[1] * 100);
/**
 * The figures of one period of a list of lines, with whole ten thousands of rupees moved from one line to another
 * until the percentages of the lines on `base`, each to two decimal places, add up to the percentage of their total.
 * The total is not touched. Null when no small move does it, or a percentage falls exactly between two hundredths.
 */
function settled(values: number[], base: number, from: number, to: number): number[] | null {
  const target = pct2(sum(values), base);
  if (target === null) return null;
  for (const steps of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const moved = values.map((x, i) => (i === from ? x - 10000 * steps : i === to ? x + 10000 * steps : x));
    const shares = moved.map((x) => (x > 0 ? pct2(x, base) : null));
    if (shares.every((p) => p !== null) && sum(shares.map((p) => p ?? 0)) === target) return moved;
  }
  return null;
}
/** One line of a common size statement worked in words, for both periods. */
const shareWorked = (name: string, v: Pair, base: Pair): string =>
  `${name}: ${inr(v[0])} ÷ ${inr(base[0])} × 100 = ${pc(pct2(v[0], base[0]) ?? 0)}, and ${inr(v[1])} ÷ ${inr(base[1])} × 100 = ${pc(pct2(v[1], base[1]) ?? 0)}.`;
/** The percentages of a line in the two periods, in words: "12.5% and 13.04%". */
const sharesSaid = (v: Pair, base: Pair): string => `${pc(pct2(v[0], base[0]) ?? 0)} and ${pc(pct2(v[1], base[1]) ?? 0)}`;

/**
 * Two years of a Statement of Profit and Loss whose common size percentages add up as the rupees do, in both years:
 * the expenses to total expenses (a little is moved between the first expense and other expenses where rounding
 * breaks that), total income less total expenses to profit before tax, and profit before tax less tax to profit
 * after tax (a draw in which rounding breaks either is rejected).
 */
function drawSharePl(rng: Rng, trade: Trade, extras: string[], t: number): PlData | null {
  const drawn = drawPlData(rng, trade, extras, [t, t]);
  if (!drawn) return null;
  const years = [0, 1].map((k) => settled(drawn.exp.map((e) => e[k]), drawn.rev[k], 0, drawn.names.length - 1));
  const [first, second] = years;
  if (!first || !second) return null;
  const d: PlData = { ...drawn, exp: drawn.exp.map((_, i): Pair => [first[i], second[i]]) };
  const w = workPl(d);
  // What was true of the draw must be true of the figures the data shows: no line stands still, no two are alike.
  if (!w || d.exp.some(([a, b]) => a === b) || !believablePl(d, w)) return null;
  for (const k of [0, 1]) {
    const share = (x: number): number | null => pct2(x, d.rev[k]);
    const [oi, expenses, pbt, tax, pat] = [share(d.oi[k]), share(w.expenses[k]), share(w.pbt[k]), share(w.tax[k]), share(w.pat[k])];
    if (oi === null || expenses === null || pbt === null || tax === null || pat === null) return null;
    if (10000 + oi - expenses !== pbt || pbt - tax !== pat) return null;
  }
  return d;
}

const fmtCommonSizePl = statementTemplate({
  id: 'fsa-fmt-common-size-pl', topicId: T, conceptId: 'fsa-formats', difficulty: 'medium',
  generate: (rng) => {
    const trade = drawTrade(rng);
    const company = rng.pick(trade.companies);
    const { per, ends } = drawYears(rng);
    // Three expenses, or four with one of finance costs and depreciation.
    const extras = drawOneExtra(rng);
    const t = rng.pick([20, 25, 30]);
    const d = attempt(80, () => drawSharePl(rng, trade, extras, t));
    const w = d && workPl(d);
    if (!d || !w) return null;
    const rows = formatRows(plLines(d, w), shareFigures(d.rev), true);
    if (!rows) return null;
    return {
      task: `Prepare the Common Size Statement of Profit and Loss of ${company} for the years ended ${ends[0]} and ${ends[1]} ${ON_REVENUE}. ${PRINTED} ${SHARE_RULES}`,
      data: [
        `${company} gives these figures from its Statements of Profit and Loss for the years ended ${ends[0]} (${per.a}) and ${ends[1]} (${per.b}). These lines and tax are the whole of each statement.`,
        ...plDataLines(d, per),
      ].join('\n'),
      title: `Common Size Statement of Profit and Loss of ${company} for the years ended ${ends[0]} and ${ends[1]}`,
      columns: shareColumns(per),
      rows,
      distractors: plDistractors(d),
      hints: FORMAT_HINTS.sharePl,
      explanation: [
        `The statement has four amount columns: the figures of ${per.a} and of ${per.b}, and each figure as a percentage of the revenue from operations of its own year. Revenue from operations is the base, so it stands at 100 in both years.`,
        `Every figure of ${per.a} is divided by ${inr(d.rev[0])} and every figure of ${per.b} by ${inr(d.rev[1])}. ${shareWorked(d.names[0], d.exp[0], d.rev)}`,
        `Other income is ${sharesSaid(d.oi, d.rev)} of revenue from operations, so total income stands at ${sharesSaid(w.income, d.rev)}: more than 100, because other income is not part of the base.`,
        `Total expenses = ${inr(w.expenses[0])} and ${inr(w.expenses[1])}, which is ${sharesSaid(w.expenses, d.rev)}: the percentages of the expense lines (${listOf(d.names)}) add up to the same.`,
        `Profit before tax = total income - total expenses: ${inr(w.pbt[0])} and ${inr(w.pbt[1])}, which is ${sharesSaid(w.pbt, d.rev)}.`,
        `Tax at ${t}% of profit before tax: ${inr(w.tax[0])} and ${inr(w.tax[1])}, which is ${sharesSaid(w.tax, d.rev)}. Profit after tax: ${inr(w.pat[0])} and ${inr(w.pat[1])}, which is ${sharesSaid(w.pat, d.rev)} of revenue from operations. ${TAX_NAMES}`,
      ],
    };
  },
  // Another way: the rupee figures are worked again from the data; every percentage is checked by multiplying it back
  // by the revenue of its year; and the percentage columns are added up as the statement is: revenue is 100, total
  // income is 100 and other income, total expenses is the sum of the expenses, and each profit is a difference. The
  // two years of the lines the data states are printed, and nothing else.
  verify: (q) => {
    const read = plRead(q.data);
    const rev = read?.given.find(([name]) => name === 'Revenue from operations')?.[1];
    if (!read || !rev || !plAgrees(q) || !printsOnly(q, [true, true, false, false], read.given.map(([name]) => name))) return false;
    const rows = rowFigures(q);
    const of = (name: string): number[] => rows.find(([label]) => label === name)?.[1] ?? subtotalOf(q, name) ?? [];
    const expenses = read.given.map(([name]) => name).filter((name) => name !== 'Revenue from operations' && name !== 'Other income');
    return (
      [...rows, ...subtotalFigures(q)].every(([, figures]) => shareHolds(figures, rev)) &&
      [2, 3].every(
        (c) =>
          of('Revenue from operations')[c] === 10000 &&
          of('Total income')[c] === 10000 + of('Other income')[c] &&
          of('Total expenses')[c] === sum(expenses.map((name) => of(name)[c])) &&
          of('Profit before tax')[c] === of('Total income')[c] - of('Total expenses')[c] &&
          of('Profit after tax')[c] === of('Profit before tax')[c] - of('Tax')[c],
      )
    );
  },
});

/**
 * The balance sheets of two dates whose common size percentages add up to 100 in each half on each date: where
 * rounding breaks that, a little is moved between reserves and trade payables, or between inventories and trade
 * receivables, which leaves every total as it was.
 */
function drawShareBs(rng: Rng): BsData | null {
  const drawn = drawBsData(rng);
  if (!drawn) return null;
  const total = bsTotal(drawn.funds);
  const settle = (heads: BsHead[], from: string, to: string): BsHead[] | null => {
    const flat = heads.flatMap((head) => head.lines);
    const at = (name: string): number => flat.findIndex(([n]) => n === name);
    const [first, second] = [0, 1].map((k) => settled(flat.map(([, v]) => v[k]), total[k], at(from), at(to)));
    if (!first || !second) return null;
    const figures = new Map(flat.map(([name], i): [string, Pair] => [name, [first[i], second[i]]]));
    return heads.map((head) => ({ heading: head.heading, lines: head.lines.map(([name, v]): [string, Pair] => [name, figures.get(name) ?? v]) }));
  };
  const funds = settle(drawn.funds, 'Reserves and surplus', 'Trade payables');
  const assets = settle(drawn.assets, 'Inventories', 'Trade receivables');
  // What was true of the draw must be true of the figures the data shows.
  return funds && assets && bsMoves({ funds, assets }) ? { funds, assets } : null;
}

const fmtCommonSizeBs = statementTemplate({
  id: 'fsa-fmt-common-size-bs', topicId: T, conceptId: 'fsa-formats', difficulty: 'medium',
  generate: (rng) => {
    const company = rng.pick(COMPANIES);
    const per = bsPeriod(rng);
    const d = attempt(20, () => drawShareBs(rng));
    if (!d) return null;
    const total = bsTotal(d.funds);
    const rows = formatRows(bsLines(d), shareFigures(total));
    if (!rows) return null;
    const given = bsGiven(d);
    const capital = given[0];
    const plant = d.assets[0].lines[0];
    // A line that fell in rupees and yet takes a larger share of the total, or rose and takes a smaller one, where there is one.
    const against = given.find(([, v]) => v[0] !== v[1] && v[1] > v[0] !== (pct2(v[1], total[1]) ?? 0) > (pct2(v[0], total[0]) ?? 0) && pct2(v[1], total[1]) !== pct2(v[0], total[0]));
    return {
      task: `Prepare the Common Size Balance Sheet of ${company} as at ${per.a} and ${per.b} (total of the balance sheet = 100). ${PRINTED} ${SHARE_RULES}`,
      data: [`${company} gives these figures from its balance sheets as at ${per.a} and ${per.b}. ${BS_WHOLE}`, ...given.map(([name, v]) => twoYears(name, v, per))].join('\n'),
      title: `Common Size Balance Sheet of ${company} as at ${per.a} and ${per.b}`,
      columns: shareColumns(per),
      rows,
      distractors: bsDistractors(d),
      hints: FORMAT_HINTS.shareBs,
      explanation: [
        `Equity and liabilities come first and assets after them, each line under its major head as Schedule III lays down: ${bsPlaces(d)}.`,
        `Total of equity and liabilities = ${d.funds.flatMap((head) => head.lines.map(([, v]) => inr(v[0]))).join(' + ')} = ${inr(total[0])} as at ${per.a}, and ${inr(total[1])} as at ${per.b}. The assets add up to the same figure on each date. This total is the base: it stands at 100 on both dates, in both halves.`,
        `Percentage of a line = the line ÷ total of the balance sheet of the same date × 100. ${shareWorked(capital[0], capital[1], total)}`,
        `The assets are divided by the same totals. ${shareWorked(plant[0], plant[1], total)}`,
        against
          ? `A share can move against the rupees: ${lower(against[0])} ${against[1][1] > against[1][0] ? 'rose' : 'fell'} from ${inr(against[1][0])} to ${inr(against[1][1])}, yet as a share of the total the line ${against[1][1] > against[1][0] ? 'fell' : 'rose'} from ${pc(pct2(against[1][0], total[0]) ?? 0)} to ${pc(pct2(against[1][1], total[1]) ?? 0)}, because the total ${total[1] > total[0] ? 'grew faster' : 'fell further'}.`
          : 'Every line is measured against the total of its own date, so the two percentage columns can be compared even though the totals differ.',
        'The percentages of each half add up to 100 on each date, as the rupees add up to the total.',
      ],
    };
  },
  // Another way: each half is added up again from the data and the place of every line read from the groups of the short
  // questions; every percentage is checked by multiplying it back by the total of its date; and the percentages of each
  // half are added up, which must give 100 on each date. The two dates of every line are printed, and nothing else.
  verify: (q) => {
    const totals = subtotalFigures(q);
    if (!bsAgrees(q) || totals.length !== 2 || !printsOnly(q, [true, true, false, false], rowsIn(q.data).map(([name]) => name))) return false;
    const base = [totals[0][1][0] / 100, totals[0][1][1] / 100];
    const rows = rowFigures(q);
    const half = (asset: boolean): number[][] => rows.filter(([name]) => isAssetLine(name) === asset).map(([, figures]) => figures);
    return (
      rows.every(([, figures]) => shareHolds(figures, base)) &&
      totals.every(([, figures]) => figures[2] === 10000 && figures[3] === 10000) &&
      [false, true].every((asset) => [2, 3].every((c) => sum(half(asset).map((figures) => figures[c])) === 10000))
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// A comparative statement from data given indirectly (complex)
// ---------------------------------------------------------------------------------------------------------------

/** How each line of the indirect statement is told, beside its figures: what the data line says and how it is worked. */
interface Told {
  name: string;
  v: Pair;
  /** What follows the name in the data: "₹60,00,000 in 2024-25; in 2025-26 it was 8% higher than in 2024-25". */
  said: string;
  /** The working of the line in words, or nothing where both figures are given as they are. */
  worked?: string;
}

/**
 * Two years of a company told indirectly: revenue of the later year as a rise or fall on the earlier; the first expense
 * as a percentage of each year's revenue; employee benefits as a rise on the earlier year or as a percentage of
 * its own year's revenue; finance costs as interest on borrowings; other expenses as so much more or less. Every line
 * says what its percentage is a percentage of, so each can be worked in one way only. Null when a figure is not
 * in whole thousands of rupees, a line stands still or the margin is not believable.
 */
function drawToldPl(rng: Rng, trade: Trade, extras: string[], rate: Pair, per: Period): { d: PlData; told: Told[] } | null {
  const rev1 = 500000 * rng.int(4, 18);
  const g = rng.pick([-10, -8, -6, -5, 5, 6, 8, 10, 12, 15, 20, 25]);
  const rev2 = (rev1 * (100 + g)) / 100;
  const rev: Pair = [rev1, rev2];
  const oi1 = 10000 * rng.int(2, Math.max(3, Math.floor(rev1 / 300000)));
  const oi: Pair = [oi1, oi1 + 10000 * rng.pick([-3, -2, -1, 1, 2, 3, 4])];
  const told: Told[] = [
    {
      name: 'Revenue from operations',
      v: rev,
      said: `${inr(rev1)} in ${per.a}; in ${per.b} it was ${Math.abs(g)}% ${g > 0 ? 'higher' : 'lower'} than in ${per.a}`,
      worked: `Revenue from operations of ${per.b} = ${inr(rev1)} ${g > 0 ? '+' : '-'} ${Math.abs(g)}% of ${inr(rev1)} = ${inr(rev2)}.`,
    },
    { name: 'Other income', v: oi, said: `${inr(oi[0])} in ${per.a} and ${inr(oi[1])} in ${per.b}` },
  ];
  // The first expense: a percentage of the revenue of each year.
  const m1 = rng.int(trade.share[0], trade.share[1]);
  const m2 = m1 + rng.pick([-3, -2, -1, 1, 2, 3]);
  const material: Pair = [(rev1 * m1) / 100, (rev2 * m2) / 100];
  told.push({
    name: trade.material,
    v: material,
    said: `${m1}% of that year's revenue from operations in ${per.a} and ${m2}% in ${per.b}`,
    worked: `${trade.material}: ${m1}% of ${inr(rev1)} = ${inr(material[0])}, and ${m2}% of ${inr(rev2)} = ${inr(material[1])}. Each percentage is on the revenue of its own year.`,
  });
  // Employee benefits: a rise on the earlier year, or the same percentage of revenue in both years.
  if (rng.int(0, 1) === 0) {
    const e1 = scaled(rev1, rng.int(trade.staff[0], trade.staff[1]));
    const rise = rng.pick([5, 8, 10, 12, 15]);
    const e2 = (e1 * (100 + rise)) / 100;
    told.push({
      name: 'Employee benefits expense',
      v: [e1, e2],
      said: `${inr(e1)} in ${per.a}; in ${per.b} it was ${rise}% higher than in ${per.a}`,
      worked: `Employee benefits expense of ${per.b} = ${inr(e1)} + ${rise}% of ${inr(e1)} = ${inr(e2)}.`,
    });
  } else {
    const s = rng.int(trade.staff[0], trade.staff[1]);
    const v: Pair = [(rev1 * s) / 100, (rev2 * s) / 100];
    told.push({
      name: 'Employee benefits expense',
      v,
      said: `${s}% of that year's revenue from operations in each of the two years`,
      worked: `Employee benefits expense: ${s}% of ${inr(rev1)} = ${inr(v[0])}, and ${s}% of ${inr(rev2)} = ${inr(v[1])}: the same percentage, each time of the revenue of that year.`,
    });
  }
  if (extras.includes(FINANCE)) {
    const r = rng.pick([8, 9, 10, 12]);
    const loan1 = scaled(rev1, rng.int(20, 40), 100000);
    const step = 100000 * rng.int(1, Math.max(1, Math.floor(loan1 / 400000)));
    const loan2 = rng.int(0, 1) === 0 ? loan1 - step : loan1 + step;
    const v: Pair = [(loan1 * r) / 100, (loan2 * r) / 100];
    told.push({
      name: FINANCE,
      v,
      said: `interest at ${r}% a year on long-term borrowings, which stood at ${inr(loan1)} throughout ${per.a} and at ${inr(loan2)} throughout ${per.b}`,
      worked: `Finance costs are the interest of a full year on what was owed throughout it: ${r}% of ${inr(loan1)} = ${inr(v[0])}, and ${r}% of ${inr(loan2)} = ${inr(v[1])}.`,
    });
  }
  if (extras.includes(DEPRECIATION)) {
    const dep1 = scaled(rev1, rng.int(2, 5));
    const step = 10000 * rng.int(1, Math.max(1, Math.round(dep1 / 50000)));
    const v: Pair = [dep1, rng.int(0, 3) === 0 ? dep1 - step : dep1 + step];
    told.push({ name: DEPRECIATION, v, said: `${inr(v[0])} in ${per.a} and ${inr(v[1])} in ${per.b}` });
  }
  // Other expenses: so much more, or so much less, than in the earlier year.
  const other1 = scaled(rev1, rng.int(trade.other[0], trade.other[1]));
  const by = 10000 * rng.int(1, Math.max(1, Math.round(other1 / 60000)));
  const more = g > 0 ? rng.int(0, 3) > 0 : rng.int(0, 3) === 0;
  const other: Pair = [other1, more ? other1 + by : other1 - by];
  told.push({
    name: 'Other expenses',
    v: other,
    said: `${inr(other1)} in ${per.a}; ${inr(by)} ${more ? 'more' : 'less'} in ${per.b}`,
    worked: `Other expenses of ${per.b} = ${inr(other1)} ${more ? '+' : '-'} ${inr(by)} = ${inr(other[1])}.`,
  });
  const expenses = told.slice(2);
  const d: PlData = { names: expenses.map((line) => line.name), rev, oi, exp: expenses.map((line) => line.v), rate };
  const w = workPl(d);
  if (!w || told.some(({ v }) => v.some((x) => x <= 0 || x % 1000 !== 0) || v[0] === v[1])) return null;
  if (!believablePl(d, w)) return null;
  return { d, told };
}

/**
 * The lines of the indirect statement read back from the data and worked by a second route: each line from its own
 * wording (a rise, a percentage of revenue, interest on a loan, so much more or less), all in paise.
 */
function toldRead(data: string): { given: [string, Pair][]; rates: number[] } | null {
  const lines = data.split('\n').slice(1);
  const rest = (l: string): string => l.slice(l.indexOf(':') + 1);
  const named = (name: string): string | undefined => lines.find((l) => l.startsWith(`${name}:`));
  const revLine = named('Revenue from operations');
  const taxLine = named('Tax');
  if (!revLine || !taxLine) return null;
  const rev1 = amountsIn(revLine)[0] * 100;
  const rev: Pair = [rev1, (rev1 * (10000 + (revLine.includes('higher than') ? 1 : -1) * pctsIn(revLine)[0])) / 10000];
  const given: [string, Pair][] = [];
  for (const l of lines) {
    const name = l.slice(0, l.indexOf(':'));
    const text = rest(l);
    const amounts = amountsIn(text).map((x) => x * 100);
    const rates = pctsIn(text);
    if (name === 'Tax') continue;
    if (name === 'Revenue from operations') given.push([name, rev]);
    else if (text.includes("of that year's revenue from operations")) given.push([name, [(rev[0] * rates[0]) / 10000, (rev[1] * (rates[1] ?? rates[0])) / 10000]]);
    else if (text.includes('higher than')) given.push([name, [amounts[0], (amounts[0] * (10000 + rates[0])) / 10000]]);
    else if (text.includes('interest at')) given.push([name, [(amounts[0] * rates[0]) / 10000, (amounts[1] * rates[0]) / 10000]]);
    else if (text.includes('more in') || text.includes('less in')) given.push([name, [amounts[0], amounts[0] + (text.includes('more in') ? 1 : -1) * amounts[1]]]);
    else if (amounts.length === 2) given.push([name, [amounts[0], amounts[1]]]);
    else return null;
  }
  return { given, rates: pctsIn(rest(taxLine)) };
}

const fmtComparativeIndirect = statementTemplate({
  id: 'fsa-fmt-comparative-indirect', topicId: T, conceptId: 'fsa-formats', difficulty: 'complex',
  generate: (rng) => {
    const trade = drawTrade(rng);
    const company = rng.pick(trade.companies);
    const { per, ends } = drawYears(rng);
    const extras = drawExtras(rng);
    const t1 = rng.pick([20, 25, 30]);
    const t2 = rng.int(0, 2) === 0 ? t1 : rng.pick([20, 25, 30].filter((x) => x !== t1));
    const drawn = attempt(40, () => drawToldPl(rng, trade, extras, [t1, t2], per));
    const w = drawn && workPl(drawn.d);
    if (!drawn || !w) return null;
    const { d, told } = drawn;
    const rows = formatRows(plLines(d, w), changeFigures);
    if (!rows) return null;
    const taxSaid = t1 === t2 ? `${t1}% of profit before tax in both years` : `${t1}% of profit before tax in ${per.a} and ${t2}% in ${per.b}`;
    const direct = told.filter((line) => !line.worked).map((line) => line.name);
    return {
      task: `Prepare the Comparative Statement of Profit and Loss of ${company} for the years ended ${ends[0]} and ${ends[1]}. ${CHANGE_RULES}`,
      data: [
        `${company} gives this information about its Statements of Profit and Loss for the years ended ${ends[0]} (${per.a}) and ${ends[1]} (${per.b}). These lines and tax are the whole of each statement.`,
        ...told.map((line) => `${line.name}: ${line.said}`),
        `Tax: ${taxSaid}`,
      ].join('\n'),
      title: `Comparative Statement of Profit and Loss of ${company} for the years ended ${ends[0]} and ${ends[1]}`,
      columns: changeColumns(per),
      rows,
      distractors: plDistractors(d),
      hints: FORMAT_HINTS.indirect,
      explanation: [
        `Every line of both years is worked out before any change is taken. ${told[0].worked ?? ''}`,
        ...told.slice(2).flatMap((line) => (line.worked ? [line.worked] : [])),
        `${cap(listOf(direct))} ${direct.length === 1 ? 'is' : 'are'} given for both years and ${direct.length === 1 ? 'is' : 'are'} entered as ${direct.length === 1 ? 'it stands' : 'they stand'}.`,
        `Total income = revenue from operations + other income: ${inr(d.rev[0])} + ${inr(d.oi[0])} = ${inr(w.income[0])} in ${per.a}, and ${inr(d.rev[1])} + ${inr(d.oi[1])} = ${inr(w.income[1])} in ${per.b}.`,
        `Total expenses = ${d.exp.map((e) => inr(e[0])).join(' + ')} = ${inr(w.expenses[0])} in ${per.a}, and ${d.exp.map((e) => inr(e[1])).join(' + ')} = ${inr(w.expenses[1])} in ${per.b}. Profit before tax = total income - total expenses: ${inr(w.pbt[0])} and ${inr(w.pbt[1])}.`,
        `Tax: ${t1}% of ${inr(w.pbt[0])} = ${inr(w.tax[0])} in ${per.a}, and ${t2}% of ${inr(w.pbt[1])} = ${inr(w.tax[1])} in ${per.b}. Profit after tax: ${inr(w.pat[0])} and ${inr(w.pat[1])}. ${TAX_NAMES}`,
        `Absolute change = figure of ${per.b} less figure of ${per.a}, and percentage change = absolute change ÷ figure of ${per.a} × 100; a fall is negative in both columns. ${changeWorked('Revenue from operations', d.rev)} The percentage is the one the data gave, which checks the working.`,
        `${changeWorked('Profit after tax', w.pat)}${t1 === t2 ? ' The rate of tax is the same in both years, so tax and profit after tax move by the same percentage as profit before tax.' : ` The rate of tax changed, so tax (${signedPc(pct2(w.tax[1] - w.tax[0], w.tax[0]) ?? 0)}) and profit after tax do not move by the same percentage as profit before tax (${signedPc(pct2(w.pbt[1] - w.pbt[0], w.pbt[0]) ?? 0)}).`}`,
      ],
    };
  },
  // Another way: every line is worked again from the wording of its own line of the data, the totals, the profit and
  // the tax from those (profit after tax as what tax leaves of each rupee), and every percentage is multiplied back.
  verify: (q) => {
    const read = toldRead(q.data);
    if (!read || read.rates.length === 0) return false;
    const { given, rates } = read;
    const same = (figures: number[] | undefined, v: Pair): boolean => figures !== undefined && figures[0] === v[0] && figures[1] === v[1];
    const rows = rowFigures(q);
    const side = (income: boolean): Pair => pair((k) => sum(given.filter((_, i) => i < 2 === income).map(([, v]) => v[k])));
    const income = side(true);
    const expenses = side(false);
    const pbt = pair((k) => income[k] - expenses[k]);
    const pat = pair((k) => (pbt[k] * (10000 - rates[Math.min(k, rates.length - 1)])) / 10000);
    return (
      given[0]?.[0] === 'Revenue from operations' &&
      given[1]?.[0] === 'Other income' &&
      rows.length === given.length + 1 &&
      given.every(([name, v]) => same(rows.find(([label]) => label === name)?.[1], v)) &&
      same(rows.find(([label]) => label === 'Tax')?.[1], pair((k) => pbt[k] - pat[k])) &&
      same(subtotalOf(q, 'Total income'), income) &&
      same(subtotalOf(q, 'Total expenses'), expenses) &&
      same(subtotalOf(q, 'Profit before tax'), pbt) &&
      same(subtotalOf(q, 'Profit after tax'), pat) &&
      [...rows, ...subtotalFigures(q)].every(([, figures]) => changeHolds(figures))
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// A first statement: common size, one year, down to profit before tax (easy)
// ---------------------------------------------------------------------------------------------------------------

const fmtCommonSizeYear = statementTemplate({
  id: 'fsa-fmt-common-size-year', topicId: T, conceptId: 'fsa-formats', difficulty: 'easy',
  generate: (rng) => {
    const trade = drawTrade(rng);
    const company = rng.pick(trade.companies);
    const [year, end] = rng.pick([['2024-25', '31 March 2025'], ['2025-26', '31 March 2026']]);
    const extras = drawOneExtra(rng);
    // One year of a statement of two, with its expenses settled so that their percentages add up to that of the total,
    // and profit before tax the difference of the two percentages above it, as it is of the two amounts.
    const drawn = attempt(40, () => {
      const d = drawPlData(rng, trade, extras, [30, 30]);
      const exp = d && settled(d.exp.map((e) => e[0]), d.rev[0], 0, d.names.length - 1);
      // Two given lines of the same amount would read as a misprint.
      if (!d || !exp || new Set([d.oi[0], ...exp]).size !== exp.length + 1) return null;
      const [pOi, pExpenses, pPbt] = [d.oi[0], sum(exp), d.rev[0] + d.oi[0] - sum(exp)].map((x) => pct2(x, d.rev[0]));
      return pOi === null || pExpenses === null || pPbt === null || 10000 + pOi - pExpenses !== pPbt ? null : { names: d.names, rev: d.rev[0], oi: d.oi[0], exp };
    });
    if (!drawn) return null;
    const { names, rev, oi, exp } = drawn;
    const income = rev + oi;
    const expenses = sum(exp);
    const pbt = income - expenses;
    const share = (x: number): number | null => pct2(x, rev);
    const figures = (x: number): number[] | null => {
      const p = share(x);
      return p === null || p <= 0 ? null : [x * 100, p];
    };
    const all = [rev, oi, income, ...exp, expenses, pbt].map(figures);
    if (all.some((f) => f === null)) return null;
    const [fRev, fOi, fIncome, ...rest] = all as number[][];
    const fExp = rest.slice(0, names.length);
    const [fExpenses, fPbt] = rest.slice(names.length);
    const said = (x: number): string => pc(share(x) ?? 0);
    return {
      task: `Prepare the Common Size Statement of Profit and Loss of ${company} for the year ended ${end}, down to profit before tax ${ON_REVENUE}. ${PRINTED} ${SHARE_RULES}`,
      data: [
        `${company} gives these figures from its Statement of Profit and Loss for the year ended ${end} (${year}). These lines are the whole of the statement down to profit before tax.`,
        `Revenue from operations: ${inr(rev)}`,
        `Other income: ${inr(oi)}`,
        ...names.map((name, i) => `${name}: ${inr(exp[i])}`),
      ].join('\n'),
      title: `Common Size Statement of Profit and Loss of ${company} for the year ended ${end}`,
      columns: [{ name: `${year} (₹)`, given: true }, { name: 'Percentage of revenue from operations (%)', unit: 'percent', adds: true }],
      rows: [
        { label: 'Revenue from operations', amounts: fRev },
        { label: 'Other income', amounts: fOi },
        { subtotal: 'Total income', amounts: fIncome, sum: 'block' },
        { heading: 'Expenses' },
        ...names.map((name, i) => ({ label: name, amounts: fExp[i] })),
        { subtotal: 'Total expenses', amounts: fExpenses, sum: 'section' },
        { subtotal: 'Profit before tax', amounts: fPbt },
      ],
      distractors: ['Cost of materials consumed', 'Purchases of stock-in-trade', FINANCE, DEPRECIATION, 'Gross profit', 'Tax'].filter((name) => !names.includes(name)),
      hints: [
        'Add up total income and total expenses in rupees and take profit before tax as their difference. Revenue from operations is 100.',
        'Percentage of a line = the line ÷ revenue from operations × 100. Other income is not part of the base, so total income is more than 100.',
      ],
      explanation: [
        `The statement has two amount columns: the figure of each line, and the figure as a percentage of revenue from operations, ${inr(rev)}, which is the base and stands at 100.`,
        `${names[0]}: ${inr(exp[0])} ÷ ${inr(rev)} × 100 = ${said(exp[0])}. Every other line is divided by the same ${inr(rev)}.`,
        `Other income is ${said(oi)} of revenue from operations, so total income, ${inr(income)}, stands at ${said(income)}: more than 100, because other income is not part of the base.`,
        `Total expenses = ${exp.map(inr).join(' + ')} = ${inr(expenses)}, which is ${said(expenses)}: the percentages of the expense lines (${listOf(names)}) add up to the same.`,
        `Profit before tax = total income - total expenses = ${inr(income)} - ${inr(expenses)} = ${inr(pbt)}, which is ${said(pbt)}: also ${said(income)} less ${said(expenses)}.`,
      ],
    };
  },
  // Another way: the totals and the profit are added up again from the data, every percentage is checked by multiplying
  // it back by revenue, and the percentage column is added up as the statement is. The rupees of the lines the data
  // states are printed, and nothing else.
  verify: (q) => {
    const given = rowsIn(q.data).map(([name, v]): [string, number] => [name, v[0] * 100]);
    const rows = rowFigures(q);
    const of = (name: string): number[] => rows.find(([label]) => label === name)?.[1] ?? subtotalOf(q, name) ?? [];
    const rev = of('Revenue from operations')[0];
    const expenses = given.slice(2);
    const income = sum(given.slice(0, 2).map(([, v]) => v));
    const spent = sum(expenses.map(([, v]) => v));
    return (
      given[0]?.[0] === 'Revenue from operations' &&
      given[1]?.[0] === 'Other income' &&
      rows.length === given.length &&
      printsOnly(q, [true, false], given.map(([name]) => name)) &&
      given.every(([name, v]) => of(name)[0] === v) &&
      of('Total income')[0] === income &&
      of('Total expenses')[0] === spent &&
      of('Profit before tax')[0] === income - spent &&
      [...rows, ...subtotalFigures(q)].every(([, [amount, p]]) => isNearest(p, amount, rev)) &&
      of('Revenue from operations')[1] === 10000 &&
      of('Total income')[1] === 10000 + of('Other income')[1] &&
      of('Total expenses')[1] === sum(expenses.map(([name]) => of(name)[1])) &&
      of('Profit before tax')[1] === of('Total income')[1] - of('Total expenses')[1]
    );
  },
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const fsaAssertionReason = factsTemplate({
  id: 'fsa-assertion-reason', version: 2, topicId: 'financial-statement-analysis', conceptId: 'fsa-types-tools', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'A line that rises from ₹80,000 to ₹1,00,000 shows an increase of 25%.',
      reason: "Percentage change = Absolute change ÷ Previous year's figure × 100.",
      a: '₹20,000 ÷ ₹80,000 × 100 = 25%.',
      r: 'The base of a percentage change is the previous year.',
      link: 'R explains A: the 25% is that formula at work.',
    },
    {
      answer: 'both',
      assertion: 'Common size statements help to compare companies of very different sizes.',
      reason: 'Every line is shown as a percentage of a common base.',
      a: 'They set the two companies side by side on the same footing.',
      r: 'Revenue from operations or the total of the balance sheet is taken as 100.',
      link: 'R explains A: with each company on a base of 100, the rupee size of each falls away.',
    },
    {
      answer: 'both',
      assertion: 'Financial statement analysis cannot measure the morale of the staff of a company.',
      reason: 'Analysis works only with what the statements express in money.',
      a: 'Ignoring qualitative factors is a limitation of analysis.',
      r: 'The statements give figures alone.',
      link: 'R explains A: morale is not measured in money, so it is not in the figures.',
    },
    {
      answer: 'both',
      assertion: 'A supplier of goods on credit looks first at the liquidity of a business.',
      reason: 'Dues to a supplier fall to be paid within a few weeks or months.',
      a: 'Liquidity is the concern of suppliers and other short-term creditors.',
      r: 'Trade credit is short-term.',
      link: 'R explains A: what matters to that supplier is whether cash will be there soon.',
    },
    {
      answer: 'both',
      assertion: 'A comparative statement is a tool of horizontal analysis.',
      reason: 'It compares the same item over two or more periods.',
      a: 'It shows the change of each line between two periods.',
      r: 'That is what the columns of the two years show.',
      link: 'R explains A: comparing one item across periods is what horizontal analysis means.',
    },
    {
      answer: 'bothNot',
      assertion: 'In a common size balance sheet, the total of the balance sheet is taken as 100.',
      reason: 'In a common size Statement of Profit and Loss, revenue from operations is taken as 100.',
      a: 'Each line is a percentage of the total of assets, or of equity and liabilities.',
      r: 'Each line of that statement is a percentage of revenue.',
      link: 'R does not explain A: each statement has its own base, and the one does not decide the other.',
    },
    {
      answer: 'bothNot',
      assertion: 'Trends found by analysing the statements of past years are a useful starting point for planning.',
      reason: 'Analysis is affected by differences in accounting policies.',
      a: 'Comparing several years shows the direction in which revenue, costs and profit are moving, though the past is only a guide to the future.',
      r: 'Two companies on different methods of depreciation or stock valuation show different figures for like facts, which is a limitation of analysis.',
      link: 'R does not explain A: a limitation cannot be why analysis helps.',
    },
    {
      answer: 'bothNot',
      assertion: 'Total expenses are ₹6,00,000 and revenue from operations ₹10,00,000. In a common size statement, expenses are 60%.',
      reason: 'A comparative statement shows the absolute and the percentage change of a line.',
      a: '₹6,00,000 ÷ ₹10,00,000 × 100 = 60%.',
      r: 'Those are its last two columns.',
      link: 'R does not explain A: R is about a different tool, and the 60% comes from the common size base.',
    },
    {
      answer: 'aOnly',
      assertion: 'A percentage change cannot be worked out for a line that is nil last year and ₹50,000 this year.',
      reason: "A percentage change is worked on the current year's figure.",
      a: 'The base is nil, so no percentage can be worked out; the column carries a dash.',
      r: "A percentage change is worked on the previous year's figure.",
    },
    {
      answer: 'aOnly',
      assertion: 'Revenue from operations rises by 10% and total expenses by 20%. A smaller part of each rupee of revenue is left as profit.',
      reason: 'Profit in rupees always falls when expenses grow faster than revenue.',
      a: 'Expenses take a larger share of revenue, so less of each rupee is left.',
      r: 'Profit in rupees can still rise when revenue is much larger than expenses.',
    },
    {
      answer: 'rOnly',
      assertion: 'Inter-firm comparison compares an enterprise with itself over different periods.',
      reason: 'Intra-firm comparison compares an enterprise with itself over different periods.',
      a: 'Inter-firm comparison sets two or more enterprises side by side for the same period.',
      r: 'That is the meaning of intra-firm comparison.',
    },
    {
      answer: 'rOnly',
      assertion: 'Materials were 40% of revenue last year and 44% this year. That alone shows the rupee cost of materials has risen by 4%.',
      reason: 'A change in a common size share is a change in percentage points.',
      a: 'A rise of 4 points in a share says nothing about the rupee change without the revenue of both years.',
      r: 'It is not the percentage change of the amount.',
    },
  ]),
});

const templates: Template[] = [
  absChange, pctChange, bsPctFromChange, currentFromPct, previousFromChange, previousFromCurrent,
  totalIncomePct, totalExpensesChange, bsSubtotalPct,
  csPctPl, csPctBs, csAmountFromPct, csBaseFromLine, csTotalIncomePct,
  pbtChange, pbtPct, taxChange, patChange, totalAssetsPct, csProfitPct, csBsDerived, csToChange, csMissingLine,
  comparativeRow, nilPrevious, fastestLine, expensesVsRevenue, csTwoFirms, csInterpret, csShareMoved,
  userPurpose, limitationSpot, horizontalVertical, toolChoice, baseFigure, objectiveOrNot, toolFeature,
  fmtComparativePl, fmtComparativeBs, fmtCommonSizePl, fmtCommonSizeBs, fmtComparativeIndirect, fmtCommonSizeYear,
  fsaAssertionReason,
];

export default templates;

/**
 * What the integrated case studies of the company-year stage (`src/generators/cases/company-year.ts`) reuse of this
 * topic: the columns, the rules and the hints of a comparative or common size statement. Only exported here; nothing
 * in this file uses the object, so no question of the topic changes.
 */
export const FSA_CASE = { changeColumns, changeFigures, CHANGE_RULES, PRINTED, FORMAT_HINTS, ON_REVENUE, SHARE_RULES, TAX, TAX_EXPENSE, TAX_NAMES };
