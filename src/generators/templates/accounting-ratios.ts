import type { McqQuestion } from '@/content/types';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, formatINR, keepFor, lowestTerms, mcqTemplate, numericTemplate, rupees } from '../authoring';
import type { McqParts, NumericParts, Template } from '../types';

const T = 'accounting-ratios';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them). They follow the CBSE scheme:
//  - current assets: current investments, inventories, trade receivables, cash and cash equivalents, short-term
//    loans and advances, other current assets; current liabilities: short-term borrowings, trade payables, other
//    current liabilities, short-term provisions;
//  - quick assets = current assets - inventories - prepaid expenses; the quick ratio is on all current liabilities;
//  - debt = long-term borrowings + long-term provisions; equity = shareholders' funds = share capital + reserves and
//    surplus; capital employed = shareholders' funds + non-current liabilities = non-current assets + working capital;
//  - the proprietary ratio is shareholders' funds to total assets (the form of the CBSE marking schemes), and every
//    question that works it out says so; NCERT also gives it on capital employed, so "divided by capital employed"
//    is never offered as a wrong answer;
//  - turnover ratios use the average of the opening and closing balances; trade receivables are taken before any
//    provision for doubtful debts; inventory turnover is on the cost of revenue from operations;
//  - interest coverage and return on investment use the profit before interest and tax;
//  - a ratio is typed in hundredths ('times'), a percentage in hundredths ('percent'); every answer is exact to two
//    decimal places, and a wrong answer that is not is rounded as a student who made that slip would round it.
// All figures are whole rupees.
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
/** A figure in hundredths as it is written: 250 is "2.5", 1667 is "16.67". */
const dec = (hundredths: number): string => String(Math.round(hundredths) / 100);
/** A quotient to two decimal places, as it is written in working: 2.5, 0.67. */
const two = (value: number): string => dec(value * 100);
/** A multiple of x in working: 250 is "2.5x", 100 is "x". */
const xs = (hundredths: number): string => (Math.round(hundredths) === 100 ? 'x' : `${dec(hundredths)}x`);

const COMPANIES = [
  'Sagar Mills Ltd.', 'Kaveri Textiles Ltd.', 'Aravali Cements Ltd.', 'Konkan Agro Foods Ltd.', 'Malwa Paper Products Ltd.', 'Vindhya Tools Ltd.',
  'Godavari Plastics Ltd.', 'Sahyadri Electricals Ltd.', 'Narmada Steel Tubes Ltd.', 'Himadri Woollens Ltd.', 'Chenab Ceramics Ltd.', 'Tapti Chemicals Ltd.',
];

const AS_RATIO = 'as x : 1, to two decimal places (for 2.5 : 1 type 2.5)';
const IN_TIMES = 'in times, to two decimal places';
const AS_PERCENT = 'as a percentage, to two decimal places';

// The names of the lines of a balance sheet and a Statement of Profit and Loss, as the prompts print them.
const N = {
  inv: 'Inventories', tr: 'Trade receivables', cash: 'Cash and cash equivalents', ci: 'Current investments', stla: 'Short-term loans and advances',
  oca: 'Other current assets', prepaid: 'Prepaid expenses', ca: 'Current assets',
  tp: 'Trade payables', stb: 'Short-term borrowings', stp: 'Short-term provisions', ocl: 'Other current liabilities', cl: 'Current liabilities',
  sc: 'Share capital', rs: 'Reserves and surplus', ltb: 'Long-term borrowings', ltp: 'Long-term provisions', loan: 'Long-term loan from a bank',
  ppe: 'Property, plant and equipment', intangible: 'Intangible assets', nci: 'Non-current investments', ta: 'Total assets',
  rev: 'Revenue from operations', cost: 'Cost of revenue from operations', gp: 'Gross profit', pbt: 'Net profit before tax', pat: 'Net profit after tax', tax: 'Tax',
  openInv: 'Opening inventory', closeInv: 'Closing inventory', purchases: 'Purchases', purchasesReturns: 'Purchases returns',
} as const;

const CURRENT_ASSETS: string[] = [N.inv, N.tr, N.cash, N.ci, N.stla, N.oca, N.prepaid, N.ca];
const NOT_QUICK: string[] = [N.inv, N.prepaid];
const CURRENT_LIABILITIES: string[] = [N.tp, N.stb, N.stp, N.ocl, N.cl];
const NON_CURRENT_ASSETS: string[] = [N.ppe, N.intangible, N.nci];
const EQUITY: string[] = [N.sc, N.rs];
const isDebt = (label: string): boolean => label === N.ltb || label === N.ltp || label === N.loan || /% Debentures$/.test(label);

type Line = [label: string, rupees: number];
/** A prompt with a list: the question on the first line, then one "Name: ₹amount" to a line. */
const withList = (question: string, rows: Line[]): string => `${question}\n${rows.map(([label, value]) => `${label}: ${inr(value)}`).join('\n')}`;
/** The figures of a prompt's list, by name. */
function figures(prompt: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of prompt.matchAll(/^(.+?): ₹([\d,]+)$/gm)) out.set(m[1], Number(m[2].replace(/,/g, '')));
  return out;
}
/** The total of the figures whose names are among `labels` (or pass the test). */
const total = (f: Map<string, number>, labels: string[] | ((label: string) => boolean)): number =>
  [...f].reduce((sum, [label, value]) => sum + ((typeof labels === 'function' ? labels(label) : labels.includes(label)) ? value : 0), 0);
/** Every rupee amount of a prompt, in the order it is printed. */
const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
/** The first "2.5 : 1" of a prompt, in hundredths. */
const ratiosIn = (s: string): number[] => [...s.matchAll(/(\d+(?:\.\d+)?) : 1/g)].map((m) => Math.round(Number(m[1]) * 100));
const percentsIn = (s: string): number[] => [...s.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]));
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
const sumOf = (values: number[]): number => values.reduce((a, b) => a + b, 0);
/** "Current assets = Inventories ₹x + Trade receivables ₹y = ₹z." */
const adds = (what: string, rows: Line[]): string =>
  rows.length === 1 ? `${what} = ${rows[0][0]} ${inr(rows[0][1])}.` : `${what} = ${rows.map(([label, value]) => `${label} ${inr(value)}`).join(' + ')} = ${inr(sumOf(rows.map((r) => r[1])))}.`;

/** `total` rupees shared among `parts` heads at random, each a positive multiple of `step`; null when it cannot be done. */
export function split(rng: Rng, amount: number, parts: number, step: number): number[] | null {
  const units = amount / step;
  if (!Number.isInteger(units)) return null;
  const least = Math.max(1, Math.floor(units / (parts * 4)));
  const left = units - least * parts;
  if (left < 0) return null;
  const weights = Array.from({ length: parts }, () => rng.int(1, 9));
  const all = sumOf(weights);
  const out = weights.map((w) => least + Math.floor((left * w) / all));
  out[0] += units - sumOf(out);
  return out.map((u) => u * step);
}

type Err = [value: number, why: string];
type Unit = 'times' | 'percent' | 'rupees' | 'number';

/**
 * The answer and the known wrong answers of a typed question, from their natural values (2.5 times, 12.5 per cent,
 * rupees, a number of days). The answer must be exact: to two decimal places for times and percentages, a whole
 * number otherwise. A wrong ratio or percentage is rounded to two decimal places, as the student who made the slip
 * would round it; a wrong amount or number is offered only when it is whole. Null when the answer is not exact or
 * fewer than two distinct wrong answers remain.
 */
function typed(unit: Unit, answer: number, errs: (Err | null | false | undefined)[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  const scale = unit === 'number' ? 1 : 100;
  const whole = unit === 'rupees' || unit === 'number';
  if (!(answer > 0) || !near(answer * (whole ? 1 : 100), Math.round(answer * (whole ? 1 : 100)))) return null;
  const a = Math.round(answer * scale);
  const seen = new Set([a]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const e of errs) {
    if (!e) continue;
    const [v, why] = e;
    if (!Number.isFinite(v) || v <= 0) continue;
    if (whole && !near(v, Math.round(v))) continue;
    const p = Math.round(v * scale);
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
  for (const [text, why] of wrong) if (!seen.has(text) && seen.add(text)) distractors.push({ text, why });
  if (distractors.length < 3) return null;
  return { prompt, correct, distractors, explanation, ...(hints ? { hints } : {}) };
}

const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

const H = {
  liquidity: ['List the current assets and the current liabilities separately before dividing.', 'Current ratio = Current assets ÷ Current liabilities. Quick assets = Current assets - Inventories - Prepaid expenses.'],
  solvency: ["Debt is long-term borrowings plus long-term provisions; equity is shareholders' funds (share capital plus reserves and surplus).", "Capital employed = Shareholders' funds + Non-current liabilities = Non-current assets + Working capital."],
  coverage: ['Start from the profit and add back what was deducted after the figure you need.', 'Interest coverage ratio = Profit before interest and tax ÷ Interest on long-term debt.'],
  activity: ['A turnover ratio divides a figure for the year by the average of the opening and closing balances.', 'Inventory turnover is on the cost of revenue from operations; trade receivables turnover is on credit revenue from operations.'],
  profitability: ['Every profitability ratio on revenue has revenue from operations as its denominator.', 'Operating ratio + Operating profit ratio = 100%.'],
  roi: ["Return on investment compares the profit before interest and tax with the capital employed.", "Capital employed = Shareholders' funds + Non-current liabilities = Non-current assets + Working capital."],
  effect: ['Ask which term of the ratio the transaction changes: the numerator, the denominator, both or neither.', 'When both terms change by the same amount, a ratio above 1 : 1 moves one way and a ratio below 1 : 1 the other; at exactly 1 : 1 it stays.'],
  missing: ['Write the ratio as an equation and put in what is given.', 'A ratio of r : 1 means the first figure is r times the second.'],
  terms: ['Recall the formula of the ratio and what each term holds.', 'Liquidity is about the short term, solvency the long term, activity the use of resources and profitability the profit earned.'],
};

// ===============================================================================================================
// Recognition: the kinds of ratios, what each is for, and what goes in each term
// ===============================================================================================================

type Kind = 'liquidity' | 'solvency' | 'activity' | 'profitability';
const KINDS: Record<Kind, { name: string; article: string; tests: string }> = {
  liquidity: { name: 'liquidity', article: 'a', tests: 'the ability to pay short-term debts as they fall due' },
  solvency: { name: 'solvency', article: 'a', tests: 'the ability to meet long-term debts and the interest on them' },
  activity: { name: 'activity (turnover)', article: 'an', tests: 'how efficiently resources are used to produce revenue' },
  profitability: { name: 'profitability', article: 'a', tests: 'the profit earned in relation to revenue or to the funds employed' },
};
const RATIOS: { name: string; kind: Kind; formula: string }[] = [
  { name: 'current ratio', kind: 'liquidity', formula: 'current assets ÷ current liabilities' },
  { name: 'quick ratio', kind: 'liquidity', formula: 'quick assets ÷ current liabilities' },
  { name: 'debt to equity ratio', kind: 'solvency', formula: "debt ÷ shareholders' funds" },
  { name: 'total assets to debt ratio', kind: 'solvency', formula: 'total assets ÷ debt' },
  { name: 'proprietary ratio', kind: 'solvency', formula: "shareholders' funds ÷ total assets" },
  { name: 'interest coverage ratio', kind: 'solvency', formula: 'profit before interest and tax ÷ interest on long-term debt' },
  { name: 'debt to capital employed ratio', kind: 'solvency', formula: 'debt ÷ capital employed' },
  { name: 'inventory turnover ratio', kind: 'activity', formula: 'cost of revenue from operations ÷ average inventory' },
  { name: 'trade receivables turnover ratio', kind: 'activity', formula: 'credit revenue from operations ÷ average trade receivables' },
  { name: 'trade payables turnover ratio', kind: 'activity', formula: 'net credit purchases ÷ average trade payables' },
  { name: 'fixed assets turnover ratio', kind: 'activity', formula: 'revenue from operations ÷ net fixed assets' },
  { name: 'net assets turnover ratio', kind: 'activity', formula: 'revenue from operations ÷ capital employed' },
  { name: 'working capital turnover ratio', kind: 'activity', formula: 'revenue from operations ÷ working capital' },
  { name: 'gross profit ratio', kind: 'profitability', formula: 'gross profit ÷ revenue from operations × 100' },
  { name: 'operating ratio', kind: 'profitability', formula: '(cost of revenue from operations + operating expenses) ÷ revenue from operations × 100' },
  { name: 'operating profit ratio', kind: 'profitability', formula: 'operating profit ÷ revenue from operations × 100' },
  { name: 'net profit ratio', kind: 'profitability', formula: 'net profit ÷ revenue from operations × 100' },
  { name: 'return on investment', kind: 'profitability', formula: 'profit before interest and tax ÷ capital employed × 100' },
];
const ratiosOf = (kind: Kind) => RATIOS.filter((r) => r.kind === kind);

const classifyRatio = mcqTemplate({
  id: 'ar-classify-ratio', topicId: T, conceptId: 'ar-meaning', difficulty: 'easy',
  generate: (rng) => {
    const form = rng.int(0, 2);
    if (form === 0) {
      const r = rng.pick(RATIOS);
      const k = KINDS[r.kind];
      return choice(
        `The ${r.name} belongs to which group of ratios?`,
        `${cap(k.name)} ratios`,
        (Object.keys(KINDS) as Kind[]).filter((x) => x !== r.kind).map((x) => [
          `${cap(KINDS[x].name)} ratios`,
          `Put it with the ratios that measure ${KINDS[x].tests}. The ${r.name} is ${r.formula}, which measures ${k.tests}.`,
        ]),
        `The ${r.name} is ${r.formula}. It measures ${k.tests}, so it is ${k.article} ${k.name} ratio.`,
        H.terms,
      );
    }
    const kind = rng.pick(Object.keys(KINDS) as Kind[]);
    const k = KINDS[kind];
    if (form === 1 || ratiosOf(kind).length < 3) {
      const right = rng.pick(ratiosOf(kind));
      const others = rng.shuffle(RATIOS.filter((r) => r.kind !== kind));
      // One wrong ratio from each of the other groups where possible, so the options do not lean one way.
      const wrong = (Object.keys(KINDS) as Kind[]).filter((x) => x !== kind).map((x) => others.find((r) => r.kind === x)!);
      return choice(
        `Which of these is ${k.article} ${k.name} ratio?`,
        cap(right.name),
        wrong.map((r) => [cap(r.name), `Picked ${KINDS[r.kind].article} ${KINDS[r.kind].name} ratio: the ${r.name} is ${r.formula}, which measures ${KINDS[r.kind].tests}.`]),
        `${cap(k.name)} ratios measure ${k.tests}. The ${right.name} (${right.formula}) is one of them.`,
        H.terms,
      );
    }
    const odd = rng.pick(RATIOS.filter((r) => r.kind !== kind));
    return choice(
      `Which of these is NOT ${k.article} ${k.name} ratio?`,
      cap(odd.name),
      rng.shuffle(ratiosOf(kind)).slice(0, 3).map((r) => [cap(r.name), `The ${r.name} is ${r.formula}: it measures ${k.tests}, so it is ${k.article} ${k.name} ratio.`]),
      `The ${odd.name} (${odd.formula}) is ${KINDS[odd.kind].article} ${KINDS[odd.kind].name} ratio: it measures ${KINDS[odd.kind].tests}. The other three are ${k.name} ratios.`,
      H.terms,
    );
  },
  verify: (q) => {
    // Read the group back from the table of ratios: the right option must agree with it.
    const right = optionText(q);
    const named = RATIOS.find((r) => q.prompt.startsWith(`The ${r.name} belongs`));
    if (named) return right === `${cap(KINDS[named.kind].name)} ratios`;
    const kind = (Object.keys(KINDS) as Kind[]).find((x) => q.prompt.includes(` ${KINDS[x].name} ratio?`));
    const picked = RATIOS.find((r) => cap(r.name) === right);
    return kind !== undefined && picked !== undefined && (picked.kind === kind) !== q.prompt.includes('NOT');
  },
});

interface BankItem {
  prompt: string;
  correct: string;
  wrong: [string, string][];
  explanation: string;
}
const fromBank = (rng: Rng, bank: BankItem[], hints: string[] = H.terms): McqParts | null => {
  const b = rng.pick(bank);
  return choice(b.prompt, b.correct, b.wrong, b.explanation, hints);
};

const WHO = ['A bank', 'A supplier', 'A financial analyst', 'A lender', 'An investor'];

const purpose = mcqTemplate({
  id: 'ar-purpose', topicId: T, conceptId: 'ar-meaning', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const who = rng.pick(WHO);
    const bank: BankItem[] = [
      {
        prompt: `${co} has asked a bank for a loan to be repaid in six months. The bank wants to know whether the company's current assets are enough to cover the debts falling due within a year. Which ratio answers this?`,
        correct: 'Current ratio',
        wrong: [
          ['Debt to equity ratio', 'Chose a long-term solvency ratio; the question is about debts due within a year.'],
          ['Inventory turnover ratio', 'Chose a ratio of how fast inventory is sold; it does not compare current assets with current liabilities.'],
          ['Net profit ratio', 'Chose a profitability ratio; profit earned does not show whether short-term debts can be paid.'],
          ['Proprietary ratio', "Chose the owners' share in total assets, a long-term measure."],
        ],
        explanation: 'The current ratio (current assets ÷ current liabilities) shows how far current assets cover the liabilities falling due within a year.',
      },
      {
        prompt: `${who} wants to know whether ${co} could pay its current liabilities at once, without waiting to sell its inventories. Which ratio answers this?`,
        correct: 'Quick ratio',
        wrong: [
          ['Current ratio', 'The current ratio counts the inventories, which have still to be sold.'],
          ['Inventory turnover ratio', 'Chose the speed at which inventory is sold; the question leaves inventory out altogether.'],
          ['Total assets to debt ratio', 'Chose a ratio about long-term debt; the question is about current liabilities.'],
          ['Working capital turnover ratio', 'Chose an activity ratio; it relates revenue to working capital and says nothing about immediate payment.'],
        ],
        explanation: 'The quick ratio compares quick assets (current assets less inventories and prepaid expenses) with current liabilities: the ability to pay at short notice.',
      },
      {
        prompt: `A person who plans to lend to ${co} for ten years wants to compare the long-term borrowed funds with the funds of the owners. Which ratio answers this?`,
        correct: 'Debt to equity ratio',
        wrong: [
          ['Current ratio', 'Chose a liquidity ratio; a ten-year lender looks at long-term solvency.'],
          ['Quick ratio', 'Chose a liquidity ratio; a ten-year lender looks at long-term solvency.'],
          ['Gross profit ratio', 'Chose a profitability ratio; it says nothing about how the business is financed.'],
          ['Trade payables turnover ratio', 'Chose a ratio about paying suppliers, who are short-term creditors.'],
        ],
        explanation: "The debt to equity ratio (debt ÷ shareholders' funds) compares long-term borrowed funds with the owners' funds.",
      },
      {
        prompt: `A debentureholder of ${co} wants to know how many times the profit of the year covers the interest the company has to pay on its long-term debt. Which ratio answers this?`,
        correct: 'Interest coverage ratio',
        wrong: [
          ['Debt to equity ratio', 'It compares the amount of debt with equity, not the profit with the interest.'],
          ['Net profit ratio', 'It compares net profit with revenue; the question compares profit with interest.'],
          ['Return on investment', 'It compares profit with capital employed, not with interest.'],
          ['Total assets to debt ratio', 'It compares assets with debt: the safety of the principal, not of the interest.'],
        ],
        explanation: 'Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt: how many times the interest is covered.',
      },
      {
        prompt: `The stores manager of ${co} wants to know how many times during the year the inventory was sold and replaced. Which ratio answers this?`,
        correct: 'Inventory turnover ratio',
        wrong: [
          ['Quick ratio', 'The quick ratio leaves inventory out; it does not measure how fast it moves.'],
          ['Working capital turnover ratio', 'It relates revenue to the whole working capital, not to inventory alone.'],
          ['Gross profit ratio', 'It measures the margin on what is sold, not how often the inventory is turned over.'],
          ['Trade receivables turnover ratio', 'It measures how fast customers pay, not how fast goods are sold.'],
        ],
        explanation: 'Inventory turnover ratio = cost of revenue from operations ÷ average inventory: the number of times inventory is turned into sales.',
      },
      {
        prompt: `The credit manager of ${co} wants to know how quickly customers who buy on credit pay their dues. Which ratio answers this?`,
        correct: 'Trade receivables turnover ratio',
        wrong: [
          ['Trade payables turnover ratio', 'That is about how quickly the company pays its own suppliers.'],
          ['Inventory turnover ratio', 'That is about how quickly goods are sold, not how quickly the money is collected.'],
          ['Current ratio', 'It shows whether current assets cover current liabilities, not the speed of collection.'],
          ['Net profit ratio', 'A profitability ratio says nothing about collection from customers.'],
        ],
        explanation: 'Trade receivables turnover ratio = credit revenue from operations ÷ average trade receivables. The higher it is, the faster the collection.',
      },
      {
        prompt: `A supplier is deciding whether to sell to ${co} on credit and wants to know how quickly the company pays for its credit purchases. Which ratio answers this?`,
        correct: 'Trade payables turnover ratio',
        wrong: [
          ['Trade receivables turnover ratio', "That is about how quickly the company's customers pay the company."],
          ['Inventory turnover ratio', 'That is about how quickly goods are sold.'],
          ['Proprietary ratio', "That is the owners' share in total assets, a long-term measure."],
          ['Operating ratio', 'A profitability ratio says nothing about how quickly suppliers are paid.'],
        ],
        explanation: 'Trade payables turnover ratio = net credit purchases ÷ average trade payables. The higher it is, the sooner suppliers are paid.',
      },
      {
        prompt: `The directors of ${co} want one figure for the profit the business earns on all the long-term funds used in it, whether they came from shareholders or lenders. Which ratio gives it?`,
        correct: 'Return on investment',
        wrong: [
          ['Net profit ratio', 'It relates profit to revenue, not to the funds used in the business.'],
          ['Gross profit ratio', 'It relates gross profit to revenue, not to the funds used in the business.'],
          ['Debt to equity ratio', 'It shows how the funds are divided between lenders and owners, not what they earn.'],
          ['Net assets turnover ratio', 'It relates revenue, not profit, to capital employed.'],
        ],
        explanation: 'Return on investment = profit before interest and tax ÷ capital employed × 100: the return on all long-term funds.',
      },
      {
        prompt: `The directors of ${co} want to know what part of every ₹100 of revenue from operations is left after meeting the cost of the goods sold, before any other expense. Which ratio shows it?`,
        correct: 'Gross profit ratio',
        wrong: [
          ['Net profit ratio', 'Net profit is what is left after all expenses, not only the cost of the goods sold.'],
          ['Operating ratio', 'It shows the cost, operating expenses included, as a part of revenue.'],
          ['Operating profit ratio', 'Operating profit is after the operating expenses as well.'],
          ['Inventory turnover ratio', 'It counts how often inventory is sold; it is not a margin.'],
        ],
        explanation: 'Gross profit ratio = gross profit ÷ revenue from operations × 100, where gross profit is revenue less the cost of revenue from operations.',
      },
      {
        prompt: `The directors of ${co} want to know what part of revenue from operations is used up by the cost of revenue from operations and the operating expenses together. Which ratio shows it?`,
        correct: 'Operating ratio',
        wrong: [
          ['Operating profit ratio', 'That is what is left after those costs: 100% less the operating ratio.'],
          ['Gross profit ratio', 'It leaves the operating expenses out.'],
          ['Net profit ratio', 'It is after non-operating items too, and it shows profit, not cost.'],
          ['Working capital turnover ratio', 'An activity ratio; it does not compare costs with revenue.'],
        ],
        explanation: 'Operating ratio = (cost of revenue from operations + operating expenses) ÷ revenue from operations × 100.',
      },
      {
        prompt: `A long-term lender wants to know how many rupees of assets ${co} has for every rupee of its long-term debt. Which ratio shows it?`,
        correct: 'Total assets to debt ratio',
        wrong: [
          ['Debt to equity ratio', "It compares debt with shareholders' funds, not with the assets."],
          ['Proprietary ratio', "It compares shareholders' funds with total assets; debt is not in it."],
          ['Current ratio', 'It compares current assets with current liabilities only.'],
          ['Fixed assets turnover ratio', 'It relates revenue to fixed assets; it is an activity ratio.'],
        ],
        explanation: 'Total assets to debt ratio = total assets ÷ debt: the cover that the assets give to the long-term lenders.',
      },
      {
        prompt: `${who} wants to know what part of the total assets of ${co} has been financed by the shareholders themselves. Which ratio shows it?`,
        correct: 'Proprietary ratio',
        wrong: [
          ['Debt to equity ratio', "It compares debt with shareholders' funds; total assets are not in it."],
          ['Total assets to debt ratio', 'It compares total assets with debt, not with the funds of the shareholders.'],
          ['Return on investment', 'It measures the profit earned on capital employed, not who financed the assets.'],
          ['Working capital turnover ratio', 'An activity ratio; it relates revenue to working capital.'],
        ],
        explanation: "Proprietary ratio = shareholders' funds ÷ total assets: the share of the assets that the owners have financed.",
      },
      {
        prompt: `The finance manager of ${co} wants to know how much revenue from operations each rupee of working capital produced during the year. Which ratio shows it?`,
        correct: 'Working capital turnover ratio',
        wrong: [
          ['Current ratio', 'It compares current assets with current liabilities; revenue is not in it.'],
          ['Fixed assets turnover ratio', 'It relates revenue to fixed assets, not to working capital.'],
          ['Net profit ratio', 'It relates profit to revenue; working capital is not in it.'],
          ['Inventory turnover ratio', 'It relates the cost of revenue to inventory alone, not to the whole working capital.'],
        ],
        explanation: 'Working capital turnover ratio = revenue from operations ÷ working capital.',
      },
      {
        prompt: `A shareholder of ${co} wants to know how much of every ₹100 of revenue from operations is left as profit after all expenses and tax. Which ratio shows it?`,
        correct: 'Net profit ratio',
        wrong: [
          ['Gross profit ratio', 'Gross profit is before the operating and other expenses and tax.'],
          ['Operating profit ratio', 'Operating profit is before non-operating items and tax.'],
          ['Return on investment', 'It relates profit to capital employed, not to revenue.'],
          ['Operating ratio', 'It shows operating cost, not the final profit.'],
        ],
        explanation: 'Net profit ratio = net profit ÷ revenue from operations × 100; taken on profit after tax, it is what is finally left out of revenue.',
      },
      {
        prompt: `The production manager of ${co} wants to know how well the plant and other fixed assets were used to produce revenue during the year. Which ratio shows it?`,
        correct: 'Fixed assets turnover ratio',
        wrong: [
          ['Working capital turnover ratio', 'It relates revenue to working capital, not to fixed assets.'],
          ['Inventory turnover ratio', 'It is about inventory, a current asset.'],
          ['Total assets to debt ratio', 'A solvency ratio; revenue is not in it.'],
          ['Gross profit ratio', 'It is a margin on revenue, not a measure of how assets were used.'],
        ],
        explanation: 'Fixed assets turnover ratio = revenue from operations ÷ net fixed assets: the revenue produced by each rupee of fixed assets.',
      },
      {
        prompt: `${who} wants to know what part of the long-term funds used in ${co} (shareholders' funds and non-current liabilities together) has been borrowed. Which ratio shows it?`,
        correct: 'Debt to capital employed ratio',
        wrong: [
          ['Debt to equity ratio', "It compares debt with shareholders' funds alone, not with all the long-term funds."],
          ['Proprietary ratio', "It shows the owners' share in total assets, not the lenders' share in long-term funds."],
          ['Interest coverage ratio', 'It compares profit with interest, not debt with funds.'],
          ['Current ratio', 'A liquidity ratio; long-term funds are not in it.'],
        ],
        explanation: "Debt to capital employed ratio = debt ÷ capital employed, where capital employed = shareholders' funds + non-current liabilities.",
      },
    ];
    return fromBank(rng, bank);
  },
});

// What each line of a balance sheet is, for the questions that ask a student to place it.
type Group = 'quick' | 'slow' | 'cl' | 'debt' | 'equity' | 'nca';
const ITEMS: { name: string; group: Group; fact: string }[] = [
  { name: 'Trade receivables', group: 'quick', fact: 'trade receivables are a current asset that turns into cash soon, so they are a quick asset' },
  { name: 'Cash and cash equivalents', group: 'quick', fact: 'cash and cash equivalents are the most liquid current asset, so they are a quick asset' },
  { name: 'Current investments', group: 'quick', fact: 'current investments can be sold at short notice, so they are a current asset and a quick asset' },
  { name: 'Inventories', group: 'slow', fact: 'inventories are a current asset, but they are left out of quick assets because they take time to sell' },
  { name: 'Prepaid expenses', group: 'slow', fact: 'prepaid expenses are a current asset, but they are left out of quick assets because they cannot be turned into cash' },
  { name: 'Trade payables', group: 'cl', fact: 'trade payables are a current liability' },
  { name: 'Short-term borrowings', group: 'cl', fact: 'short-term borrowings (a bank overdraft, for example) are a current liability, not debt' },
  { name: 'Short-term provisions', group: 'cl', fact: 'short-term provisions are a current liability' },
  { name: 'Other current liabilities', group: 'cl', fact: 'other current liabilities (outstanding expenses, for example) are a current liability' },
  { name: 'Long-term borrowings', group: 'debt', fact: 'long-term borrowings are a non-current liability and are counted as debt' },
  { name: 'Long-term provisions', group: 'debt', fact: 'long-term provisions are a non-current liability and are counted as debt' },
  { name: 'Share capital', group: 'equity', fact: "share capital is part of shareholders' funds" },
  { name: 'Reserves and surplus', group: 'equity', fact: "reserves and surplus are part of shareholders' funds" },
  { name: 'Property, plant and equipment', group: 'nca', fact: 'property, plant and equipment are a non-current asset' },
  { name: 'Non-current investments', group: 'nca', fact: 'non-current investments are a non-current asset' },
  { name: 'Intangible assets', group: 'nca', fact: 'intangible assets are a non-current asset' },
];
/** A question that asks for the one item of `right` among items of the groups in `others` (each named once, in that order). */
function placeItem(rng: Rng, prompt: string, right: Group[], others: Group[], explain: (name: string, fact: string) => string, hints: string[]): McqParts | null {
  const answer = rng.pick(ITEMS.filter((i) => right.includes(i.group)));
  const pool = rng.shuffle(ITEMS.filter((i) => i !== answer));
  const wrong: typeof ITEMS = [];
  for (const g of others) {
    const next = pool.find((i) => i.group === g && !wrong.includes(i));
    if (next) wrong.push(next);
  }
  return choice(prompt, answer.name, wrong.map((i) => [i.name, `Mixed up the classes: ${i.fact}.`]), explain(answer.name, answer.fact), hints);
}

const LIQUIDITY_BANK: BankItem[] = [
  {
    prompt: 'The current ratio is worked out as:',
    correct: 'Current assets ÷ Current liabilities',
    wrong: [
      ['Quick assets ÷ Current liabilities', 'Gave the quick ratio: for the current ratio, inventories and prepaid expenses stay in.'],
      ['Current liabilities ÷ Current assets', 'Turned the ratio upside down.'],
      ['Current assets − Current liabilities', 'Gave the working capital, which is an amount and not a ratio.'],
      ['Total assets ÷ Current liabilities', 'Brought the non-current assets in as well.'],
    ],
    explanation: 'Current ratio = Current assets ÷ Current liabilities. It is written as x : 1.',
  },
  {
    prompt: 'The quick ratio (also called the liquid ratio or acid-test ratio) is worked out as:',
    correct: 'Quick assets ÷ Current liabilities',
    wrong: [
      ['Current assets ÷ Current liabilities', 'Gave the current ratio: inventories and prepaid expenses have not been taken out.'],
      ['Current liabilities ÷ Quick assets', 'Turned the ratio upside down.'],
      ['Quick assets ÷ Current assets', 'Compared quick assets with current assets instead of with current liabilities.'],
      ['Inventories ÷ Current liabilities', 'Used the very asset that is left out of quick assets.'],
    ],
    explanation: 'Quick ratio = Quick assets ÷ Current liabilities, where quick assets = current assets − inventories − prepaid expenses.',
  },
  {
    prompt: 'Quick assets are:',
    correct: 'Current assets less inventories and prepaid expenses',
    wrong: [
      ['Current assets less inventories only', 'Left the prepaid expenses in; they cannot be turned into cash either.'],
      ['Current assets less trade receivables', 'Took out trade receivables, which are quick assets, and kept the inventories.'],
      ['Cash and cash equivalents only', 'Counted only cash; trade receivables and current investments are quick assets too.'],
      ['Current assets less current liabilities', 'Gave the working capital.'],
    ],
    explanation: 'Quick assets = Current assets − Inventories − Prepaid expenses: the current assets that can be turned into cash at short notice.',
  },
  {
    prompt: 'Why are inventories left out of quick assets?',
    correct: 'They have to be sold first, so they take time to turn into cash',
    wrong: [
      ['They are non-current assets', 'Classed inventories as non-current. They are current assets; they are only slow to turn into cash.'],
      ['They are shown at cost and not at selling price', 'Took the basis of valuation as the reason; the reason is the time needed to sell them.'],
      ['They have not been paid for yet', 'Whether the supplier has been paid does not decide it; the reason is the time needed to sell them.'],
    ],
    explanation: 'Inventories must be sold, often on credit, before cash comes in. Quick assets are those that can be turned into cash at short notice.',
  },
  {
    prompt: 'Why are prepaid expenses left out of quick assets?',
    correct: 'They will be received as services, not as cash',
    wrong: [
      ['They are non-current assets', 'Classed prepaid expenses as non-current. They are current assets, but they never turn into cash.'],
      ['They are liabilities of the business', 'Mixed up prepaid expenses with outstanding expenses, which are a liability.'],
      ['They are too small to matter', 'Size is not the reason: they are left out because they cannot be turned into cash.'],
    ],
    explanation: 'A prepaid expense is a payment made in advance for a service still to be received. It cannot be turned into cash to pay a liability.',
  },
  {
    prompt: 'Working capital is:',
    correct: 'Current assets − Current liabilities',
    wrong: [
      ['Current assets ÷ Current liabilities', 'Gave the current ratio; working capital is the difference, an amount.'],
      ['Total assets − Total liabilities', "Gave shareholders' funds."],
      ['Non-current assets + Current assets', 'Gave total assets.'],
      ['Current assets − Inventories', 'Took out inventories instead of current liabilities.'],
    ],
    explanation: 'Working capital = Current assets − Current liabilities.',
  },
  {
    prompt: 'A current ratio of 2.5 : 1 means that:',
    correct: 'for every ₹1 of current liabilities there are current assets of ₹2.50',
    wrong: [
      ['for every ₹1 of current assets there are current liabilities of ₹2.50', 'Read the ratio the wrong way round.'],
      ['working capital is 2.5 times the current liabilities', 'Working capital is current assets less current liabilities: here 1.5 times the current liabilities.'],
      ['quick assets are 2.5 times the current liabilities', 'Read it as the quick ratio; the current ratio counts all current assets.'],
    ],
    explanation: 'Current ratio = current assets ÷ current liabilities, so 2.5 : 1 means current assets are 2.5 times the current liabilities.',
  },
  {
    prompt: 'Liquidity ratios are worked out to judge:',
    correct: 'the ability to pay short-term debts as they fall due',
    wrong: [
      ['the ability to repay long-term loans and the interest on them', 'That is what the solvency ratios judge.'],
      ['how efficiently the assets are used to produce revenue', 'That is what the activity ratios judge.'],
      ['the profit earned on revenue and on capital employed', 'That is what the profitability ratios judge.'],
    ],
    explanation: 'Liquidity is the ability to meet obligations that fall due within a year. The current ratio and the quick ratio measure it.',
  },
  {
    prompt: 'A company has a much higher current ratio than other companies in its industry. What may this point to?',
    correct: 'Funds lying idle in inventories, trade receivables or cash',
    wrong: [
      ['Difficulty in paying its short-term debts', 'Read a high ratio as a weak one; a high ratio means the short-term debts are well covered.'],
      ['Too much long-term borrowing', 'Long-term borrowings are not in the current ratio at all.'],
      ['A low gross profit on what it sells', 'The current ratio says nothing about profit margins.'],
    ],
    explanation: 'A very high current ratio means more is tied up in current assets than the short-term debts call for: slow stock, slow collection or idle cash.',
  },
  {
    prompt: 'A bank overdraft is shown in the balance sheet of a company under:',
    correct: 'Short-term borrowings, a current liability',
    wrong: [
      ['Long-term borrowings, a non-current liability', 'An overdraft is repayable on demand; it is a short-term borrowing.'],
      ['Trade payables, a current liability', 'Trade payables are amounts owed for goods and services bought, not money borrowed from a bank.'],
      ['Cash and cash equivalents, as a negative figure', 'An overdraft is a liability; it is not deducted from cash in the balance sheet.'],
    ],
    explanation: 'A bank overdraft is a short-term borrowing. It is a current liability, so it enters the current and quick ratios but not debt.',
  },
];

const liquidityTerms = mcqTemplate({
  id: 'ar-liquidity-terms', topicId: T, conceptId: 'ar-liquidity', difficulty: 'easy',
  generate: (rng) => {
    const form = rng.int(0, 7);
    if (form === 0) return placeItem(rng, 'Which of these is a current asset but is left out of quick assets?', ['slow'], ['quick', 'quick', 'nca', 'cl'], (n, f) => `${n}: ${f}.`, H.liquidity);
    if (form === 1) return placeItem(rng, 'Which of these is a current liability?', ['cl'], ['debt', 'debt', 'equity', 'quick'], (n, f) => `${n}: ${f}.`, H.liquidity);
    if (form === 2) return placeItem(rng, 'Which of these is NOT a current liability?', ['debt', 'equity'], ['cl', 'cl', 'cl'], (n, f) => `${n}: ${f}. The other three are current liabilities.`, H.liquidity);
    if (form === 3) return placeItem(rng, 'Which of these is NOT a current asset?', ['nca'], ['quick', 'slow', 'quick', 'slow'], (n, f) => `${n}: ${f}. The others are current assets.`, H.liquidity);
    return fromBank(rng, LIQUIDITY_BANK, H.liquidity);
  },
});

// ===============================================================================================================
// Liquidity ratios
// ===============================================================================================================

const pair = (names: string[], values: number[]): Line[] => names.map((name, i) => [name, values[i]]);
/** The two groups of lines of a question, each shuffled, in either order. */
const grouped = (rng: Rng, a: Line[], b: Line[]): Line[] => (rng.int(0, 1) === 0 ? [...rng.shuffle(a), ...rng.shuffle(b)] : [...rng.shuffle(b), ...rng.shuffle(a)]);
const valueOf = (rows: Line[], name: string): number => rows.find((r) => r[0] === name)?.[1] ?? 0;

const currentRatio = numericTemplate({
  id: 'ar-current-ratio', topicId: T, conceptId: 'ar-liquidity', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cl = rng.step(100000, 600000, 20000);
    const r = rng.pick([75, 80, 120, 125, 150, 160, 175, 180, 200, 220, 225, 240, 250, 275, 300, 320, 350]);
    const ca = (cl * r) / 100;
    const assetNames = [N.inv, N.tr, N.cash, ...rng.shuffle([N.ci, N.stla, N.oca]).slice(0, rng.int(0, 2))];
    const liabilityNames = [N.tp, ...rng.shuffle([N.stb, N.stp, N.ocl]).slice(0, rng.int(1, 2))];
    const a = split(rng, ca, assetNames.length, 1000);
    const l = split(rng, cl, liabilityNames.length, 5000);
    if (!a || !l) return null;
    const assets = pair(assetNames, a);
    const liabilities = pair(liabilityNames, l);
    const stp = valueOf(liabilities, N.stp);
    const ci = valueOf(assets, N.ci);
    const n = typed('times', ca / cl, [
      [cl / ca, 'Divided the current liabilities by the current assets: the ratio is upside down.'],
      [(ca - cl) / cl, 'Divided the working capital (current assets less current liabilities) by the current liabilities.'],
      [(ca - valueOf(assets, N.inv)) / cl, 'Left the inventories out of the current assets: that gives the quick ratio, not the current ratio.'],
      stp > 0 && [ca / (cl - stp), 'Left the short-term provisions out of the current liabilities.'],
      ci > 0 && [(ca - ci) / cl, 'Left the current investments out of the current assets.'],
    ]);
    return n && {
      prompt: withList(`Find the current ratio of ${co} ${AS_RATIO}.`, grouped(rng, assets, liabilities)),
      ...n,
      explanation: [adds('Current assets', assets), adds('Current liabilities', liabilities), `Current ratio = Current assets ÷ Current liabilities = ${inr(ca)} ÷ ${inr(cl)} = ${dec(r)} : 1.`],
      hints: H.liquidity,
    };
  },
  // Cross-multiplied from the list as it is printed: answer x current liabilities = current assets.
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * total(f, CURRENT_LIABILITIES) === total(f, CURRENT_ASSETS) * 100;
  },
});

const quickRatio = numericTemplate({
  id: 'ar-quick-ratio', topicId: T, conceptId: 'ar-liquidity', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cl = rng.step(100000, 500000, 20000);
    const rq = rng.pick([50, 60, 75, 80, 90, 100, 110, 120, 125, 140, 150, 160, 175, 200]);
    const quick = (cl * rq) / 100;
    const inv = rng.step(40000, 300000, 5000);
    const prepaid = rng.int(0, 2) > 0 ? rng.step(2000, 20000, 1000) : 0;
    const quickNames = [N.tr, N.cash, ...(rng.int(0, 1) === 0 ? [N.ci] : [])];
    const liabilityNames = [N.tp, ...rng.shuffle([N.stb, N.stp, N.ocl]).slice(0, rng.int(1, 2))];
    const qa = split(rng, quick, quickNames.length, 1000);
    const l = split(rng, cl, liabilityNames.length, 5000);
    if (!qa || !l) return null;
    const quickRows = pair(quickNames, qa);
    const assets: Line[] = [[N.inv, inv], ...(prepaid > 0 ? [[N.prepaid, prepaid] as Line] : []), ...quickRows];
    const liabilities = pair(liabilityNames, l);
    const ca = quick + inv + prepaid;
    const ci = valueOf(assets, N.ci);
    const n = typed('times', quick / cl, [
      [ca / cl, prepaid > 0 ? 'Kept the inventories and the prepaid expenses in: that is the current ratio.' : 'Kept the inventories in: that is the current ratio.'],
      prepaid > 0 && [(quick + prepaid) / cl, 'Took out the inventories but left the prepaid expenses in the quick assets.'],
      prepaid > 0 && [(quick + inv) / cl, 'Took out the prepaid expenses but left the inventories in the quick assets.'],
      [cl / quick, 'Divided the current liabilities by the quick assets: the ratio is upside down.'],
      ci > 0 && [(quick - ci) / cl, 'Left the current investments out of the quick assets; only inventories and prepaid expenses are left out.'],
    ]);
    return n && {
      prompt: withList(`Find the quick ratio of ${co} ${AS_RATIO}.`, grouped(rng, assets, liabilities)),
      ...n,
      explanation: [
        `Quick assets leave out inventories${prepaid > 0 ? ' and prepaid expenses' : ''}.`,
        adds('Quick assets', quickRows),
        adds('Current liabilities', liabilities),
        `Quick ratio = Quick assets ÷ Current liabilities = ${inr(quick)} ÷ ${inr(cl)} = ${dec(rq)} : 1.`,
      ],
      hints: H.liquidity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * total(f, CURRENT_LIABILITIES) === (total(f, CURRENT_ASSETS) - total(f, NOT_QUICK)) * 100;
  },
});

const liquidityFromSheet = numericTemplate({
  id: 'ar-liquidity-balance-sheet', topicId: T, conceptId: 'ar-liquidity', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const askQuick = rng.int(0, 4) < 2;
    const cl = rng.step(100000, 400000, 20000);
    const r = rng.pick([120, 125, 150, 160, 175, 180, 200, 225, 240, 250, 275, 300]);
    const rq = r - rng.pick([40, 50, 60, 75, 80, 100].filter((gap) => r - gap >= 40));
    const ca = (cl * r) / 100;
    const quick = (cl * rq) / 100;
    const inv = ca - quick;
    const quickNames = [N.tr, N.cash, ...(rng.int(0, 1) === 0 ? [N.ci] : [])];
    const qa = split(rng, quick, quickNames.length, 1000);
    const hasProvision = rng.int(0, 1) === 0;
    const l = split(rng, cl, hasProvision ? 3 : 2, 5000);
    if (!qa || !l) return null;
    const quickRows = pair(quickNames, qa);
    const liabilities = pair(hasProvision ? [N.stb, N.tp, N.stp] : [N.stb, N.tp], l);
    const sc = rng.step(200000, 800000, 50000);
    const rs = rng.step(50000, 400000, 10000);
    const ltb = rng.step(100000, 500000, 50000);
    const ltp = rng.int(0, 1) === 0 ? rng.step(20000, 80000, 10000) : 0;
    const nci = rng.int(0, 1) === 0 ? rng.step(50000, 200000, 10000) : 0;
    const ppe = sc + rs + ltb + ltp + cl - ca - nci;
    if (ppe < 200000) return null;
    const stp = valueOf(liabilities, N.stp);
    const ci = valueOf(quickRows, N.ci);
    // In the order of a balance sheet: equity and liabilities, then assets.
    const rows: Line[] = [
      [N.sc, sc], [N.rs, rs], [N.ltb, ltb], ...(ltp > 0 ? [[N.ltp, ltp] as Line] : []), ...liabilities,
      [N.ppe, ppe], ...(nci > 0 ? [[N.nci, nci] as Line] : []), [N.inv, inv], ...quickRows,
    ];
    const top = askQuick ? quick : ca;
    const name = askQuick ? 'quick' : 'current';
    const n = typed('times', top / cl, [
      askQuick ? [ca / cl, 'Kept the inventories in: that is the current ratio.'] : [quick / cl, 'Left the inventories out of the current assets: that is the quick ratio.'],
      [top / (cl + ltb), 'Counted the long-term borrowings among the current liabilities; they are a non-current liability.'],
      nci > 0 && [(top + nci) / cl, `Counted the non-current investments among the ${name} assets.`],
      stp > 0 && [top / (cl - stp), 'Left the short-term provisions out of the current liabilities.'],
      [top / valueOf(liabilities, N.tp), 'Took trade payables as the only current liability.'],
      ci > 0 && [(top - ci) / cl, `Left the current investments out of the ${name} assets.`],
      [cl / top, 'Divided the current liabilities by the assets: the ratio is upside down.'],
    ]);
    const currentRows: Line[] = [[N.inv, inv], ...quickRows];
    return n && {
      prompt: withList(`From this balance sheet of ${co} as at 31 March 2026, find the ${name} ratio ${AS_RATIO}.`, rows),
      ...n,
      explanation: [
        askQuick ? adds('Quick assets (current assets without inventories)', quickRows) : adds('Current assets', currentRows),
        adds('Current liabilities', liabilities),
        `Share capital, reserves and surplus, long-term borrowings${ltp > 0 ? ', long-term provisions' : ''}, property, plant and equipment${nci > 0 ? ' and non-current investments' : ''} are not current items.`,
        `${cap(name)} ratio = ${inr(top)} ÷ ${inr(cl)} = ${two(top / cl)} : 1.`,
      ],
      hints: H.liquidity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const assets = total(f, CURRENT_ASSETS) - (q.prompt.includes('find the quick ratio') ? total(f, NOT_QUICK) : 0);
    // The balance sheet must agree as well: assets = equity and liabilities.
    const allAssets = total(f, CURRENT_ASSETS) + total(f, NON_CURRENT_ASSETS);
    const allSources = total(f, EQUITY) + total(f, isDebt) + total(f, CURRENT_LIABILITIES);
    return allAssets === allSources && q.answer * total(f, CURRENT_LIABILITIES) === assets * 100;
  },
});

const quickFromCurrent = numericTemplate({
  id: 'ar-quick-from-current', topicId: T, conceptId: 'ar-liquidity', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cl = rng.step(100000, 500000, 20000);
    const r = rng.pick([150, 175, 200, 225, 250, 300]);
    const rq = rng.step(50, r - 40, 5);
    const ca = (cl * r) / 100;
    const quick = (cl * rq) / 100;
    const slow = ca - quick;
    const prepaid = slow >= 40000 && rng.int(0, 1) === 0 ? rng.step(2000, Math.min(20000, slow / 4), 1000) : 0;
    const inv = slow - prepaid;
    const givesLiabilities = rng.int(0, 1) === 0;
    const holds = `inventories of ${inr(inv)}${prepaid > 0 ? ` and prepaid expenses of ${inr(prepaid)}` : ''}`;
    const prompt = givesLiabilities
      ? `The current ratio of ${co} is ${dec(r)} : 1 and its current liabilities are ${inr(cl)}. The current assets include ${holds}. Find the quick ratio ${AS_RATIO}.`
      : `The current ratio of ${co} is ${dec(r)} : 1 and its current assets are ${inr(ca)}. They include ${holds}. Find the quick ratio ${AS_RATIO}.`;
    const n = typed('times', quick / cl, [
      prepaid > 0 && [(ca - inv) / cl, 'Took out the inventories but left the prepaid expenses in the quick assets.'],
      [quick / ca, 'Divided the quick assets by the current assets instead of by the current liabilities.'],
      !givesLiabilities && [quick / ((ca * r) / 100), 'Multiplied the current assets by the ratio to find the current liabilities; they are the current assets divided by the ratio.'],
      [inv / cl, 'Divided the inventories by the current liabilities, instead of taking them out of the current assets first.'],
      [cl / quick, 'Divided the current liabilities by the quick assets: the ratio is upside down.'],
    ]);
    return n && {
      prompt,
      ...n,
      explanation: [
        givesLiabilities ? `Current assets = ${dec(r)} x ${inr(cl)} = ${inr(ca)}.` : `Current liabilities = Current assets ÷ ${dec(r)} = ${inr(ca)} ÷ ${dec(r)} = ${inr(cl)}.`,
        `Quick assets = ${inr(ca)} - ${inr(inv)}${prepaid > 0 ? ` - ${inr(prepaid)}` : ''} = ${inr(quick)}.`,
        `Quick ratio = ${inr(quick)} ÷ ${inr(cl)} = ${dec(rq)} : 1.`,
      ],
      hints: H.liquidity,
    };
  },
  verify: (q) => {
    const [given, inv, prepaid = 0] = amountsIn(q.prompt);
    const r = ratiosIn(q.prompt)[0];
    // In paise-free whole numbers: the current assets and the current liabilities, whichever was given.
    const [ca, cl] = q.prompt.includes('current liabilities are') ? [(given * r) / 100, given] : [given, (given * 100) / r];
    return near(q.answer * cl, (ca - inv - prepaid) * 100);
  },
});

// ===============================================================================================================
// Solvency ratios
// ===============================================================================================================

/** Long-term borrowings as one line, or as debentures and a bank loan; and long-term provisions when `ltp` is not nil. */
function debtLines(rng: Rng, ltb: number, ltp: number): Line[] {
  const parts = rng.int(0, 2) === 0 ? split(rng, ltb, 2, 10000) : null;
  const borrowings: Line[] = parts ? [[`${rng.pick([8, 9, 10, 12])}% Debentures`, parts[0]], [N.loan, parts[1]]] : [[N.ltb, ltb]];
  return [...borrowings, ...(ltp > 0 ? [[N.ltp, ltp] as Line] : [])];
}
/** Shareholders' funds as share capital and reserves and surplus, both in multiples of `step`. */
function equityLines(rng: Rng, equity: number, step: number): Line[] | null {
  const sc = Math.floor((equity * rng.pick([50, 60, 70, 75, 80])) / 100 / step) * step;
  return sc > 0 && equity - sc > 0 ? [[N.sc, sc], [N.rs, equity - sc]] : null;
}

const debtEquity = numericTemplate({
  id: 'ar-debt-equity', topicId: T, conceptId: 'ar-solvency', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const equity = rng.step(400000, 2000000, 20000);
    const r = rng.pick([25, 40, 50, 60, 75, 80, 100, 120, 125, 150, 160, 175, 200, 250]);
    const debt = (equity * r) / 100;
    const ltp = debt >= 100000 && rng.int(0, 1) === 0 ? rng.step(10000, Math.min(100000, debt / 4), 5000) : 0;
    const ltb = debt - ltp;
    const owners = equityLines(rng, equity, 10000);
    if (!owners) return null;
    const lenders = debtLines(rng, ltb, ltp);
    const n = typed('times', debt / equity, [
      [equity / debt, "Divided the shareholders' funds by the debt: the ratio is upside down."],
      ltp > 0 && [ltb / equity, 'Left the long-term provisions out of the debt.'],
      [debt / owners[0][1], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
      [debt / (debt + equity), "Divided the debt by debt plus shareholders' funds: that is the debt to capital employed ratio."],
    ]);
    return n && {
      prompt: withList(`Find the debt to equity ratio of ${co} ${AS_RATIO}.`, grouped(rng, owners, lenders)),
      ...n,
      explanation: [adds('Debt', lenders), adds("Equity (shareholders' funds)", owners), `Debt to equity ratio = Debt ÷ Equity = ${inr(debt)} ÷ ${inr(equity)} = ${dec(r)} : 1.`],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * total(f, EQUITY) === total(f, isDebt) * 100;
  },
});

const debtEquityWhole = numericTemplate({
  id: 'ar-debt-equity-whole', topicId: T, conceptId: 'ar-solvency', difficulty: 'easy', unit: 'ratio',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const [d, e] = rng.pick([[1, 2], [2, 3], [3, 2], [3, 4], [4, 3], [1, 3], [2, 5], [3, 5], [5, 4], [4, 5], [2, 1], [5, 6], [1, 4]]);
    const unit = rng.step(100000, 400000, 20000);
    const debt = d * unit;
    const equity = e * unit;
    const ltp = rng.int(0, 1) === 0 ? rng.step(20000, Math.min(80000, debt / 4), 10000) : 0;
    const ltb = debt - ltp;
    const owners = equityLines(rng, equity, 10000);
    if (!owners) return null;
    const lenders: Line[] = [[N.ltb, ltb], ...(ltp > 0 ? [[N.ltp, ltp] as Line] : [])];
    const answer = lowestTerms([debt, equity]);
    const seen = new Set([answer.join(':')]);
    const commonErrors: { value: number[]; why: string }[] = [];
    const wrong: [number[], string][] = [
      [[equity, debt], "Wrote the shareholders' funds first: the ratio is the wrong way round."],
      [[debt, owners[0][1]], "Compared the debt with the share capital alone; reserves and surplus are part of the shareholders' funds."],
      [[debt, debt + equity], "Compared the debt with debt plus shareholders' funds: that is the debt to capital employed ratio."],
      ...(ltp > 0 ? [[[ltb, equity], 'Left the long-term provisions out of the debt.'] as [number[], string]] : []),
    ];
    for (const [terms, why] of wrong) {
      const value = lowestTerms(terms);
      if (!seen.has(value.join(':')) && seen.add(value.join(':'))) commonErrors.push({ value, why });
    }
    if (commonErrors.length < 2) return null;
    return {
      prompt: withList(`Express the debt to equity ratio of ${co} as a ratio of whole numbers in its lowest terms, debt first.`, grouped(rng, owners, lenders)),
      answer,
      commonErrors,
      explanation: [adds('Debt', lenders), adds("Equity (shareholders' funds)", owners), `Debt : Equity = ${inr(debt)} : ${inr(equity)} = ${answer.join(' : ')}.`],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer.length === 2 && q.answer[0] * total(f, EQUITY) === q.answer[1] * total(f, isDebt);
  },
});

const debtEquitySheet = numericTemplate({
  id: 'ar-debt-equity-liabilities', topicId: T, conceptId: 'ar-solvency', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const equity = rng.step(400000, 2000000, 20000);
    const r = rng.pick([25, 40, 50, 60, 75, 80, 100, 120, 125, 150, 160, 200]);
    const debt = (equity * r) / 100;
    const ltp = debt >= 100000 && rng.int(0, 1) === 0 ? rng.step(10000, Math.min(100000, debt / 4), 5000) : 0;
    const ltb = debt - ltp;
    const owners = equityLines(rng, equity, 10000);
    if (!owners) return null;
    const stb = rng.step(40000, 300000, 10000);
    const tp = rng.step(50000, 400000, 10000);
    const stp = rng.int(0, 1) === 0 ? rng.step(10000, 60000, 5000) : 0;
    const current: Line[] = [[N.stb, stb], [N.tp, tp], ...(stp > 0 ? [[N.stp, stp] as Line] : [])];
    const lenders: Line[] = [[N.ltb, ltb], ...(ltp > 0 ? [[N.ltp, ltp] as Line] : [])];
    const cl = stb + tp + stp;
    const n = typed('times', debt / equity, [
      [(debt + stb) / equity, 'Counted the short-term borrowings as debt; debt here means the long-term borrowings and long-term provisions.'],
      [(debt + cl) / equity, 'Counted every outside liability as debt, the current liabilities too.'],
      ltp > 0 && [ltb / equity, 'Left the long-term provisions out of the debt.'],
      [debt / owners[0][1], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
      [equity / debt, "Divided the shareholders' funds by the debt: the ratio is upside down."],
    ]);
    return n && {
      prompt: withList(`These are the equity and liabilities of ${co} as at 31 March 2026. Find the debt to equity ratio ${AS_RATIO}.`, [...owners, ...lenders, ...current]),
      ...n,
      explanation: [
        adds('Debt', lenders),
        `Short-term borrowings${stp > 0 ? ', trade payables and short-term provisions' : ' and trade payables'} are current liabilities: they are not debt for this ratio.`,
        adds("Equity (shareholders' funds)", owners),
        `Debt to equity ratio = ${inr(debt)} ÷ ${inr(equity)} = ${dec(r)} : 1.`,
      ],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * total(f, EQUITY) === total(f, isDebt) * 100;
  },
});

const debtEquityDerived = numericTemplate({
  id: 'ar-debt-equity-derived', topicId: T, conceptId: 'ar-solvency', difficulty: 'complex', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const equity = rng.step(400000, 2000000, 20000);
    const r = rng.pick([25, 40, 50, 60, 75, 80, 100, 120, 125, 150, 200]);
    const debt = (equity * r) / 100;
    const ltp = debt >= 100000 && rng.int(0, 1) === 0 ? rng.step(10000, Math.min(100000, debt / 4), 5000) : 0;
    const ltb = debt - ltp;
    const cl = rng.step(100000, 500000, 10000);
    const assets = equity + debt + cl;
    const ca = cl + rng.step(20000, 300000, 10000);
    const nca = assets - ca;
    if (nca < 200000) return null;
    const lenders: Line[] = [[N.ltb, ltb], ...(ltp > 0 ? [[N.ltp, ltp] as Line] : [])];
    // Three ways the same balance sheet is given: total assets; non-current and current assets; or the working
    // capital in place of the current liabilities.
    const shape = rng.int(0, 2);
    const wc = ca - cl;
    const rows: Line[] =
      shape === 0
        ? [[N.ta, assets], ...lenders, [N.cl, cl]]
        : shape === 1
          ? [['Non-current assets', nca], [N.ca, ca], ...lenders, [N.cl, cl]]
          : [['Non-current assets', nca], [N.ca, ca], ['Working capital', wc], ...lenders];
    const n = typed('times', debt / equity, [
      [debt / assets, 'Divided the debt by the total assets.'],
      [debt / (assets - debt), "Deducted only the debt from the total assets; the current liabilities are not shareholders' funds either."],
      [debt / (assets - cl), "Divided by total assets less current liabilities: that is the capital employed, which still holds the debt."],
      [(debt + cl) / equity, 'Counted the current liabilities as debt.'],
      [equity / debt, "Divided the shareholders' funds by the debt: the ratio is upside down."],
    ]);
    return n && {
      prompt: withList(`The balance sheet of ${co} shows the figures below; its shareholders' funds are not given, and it has no non-current liability other than those listed. Find the debt to equity ratio ${AS_RATIO}.`, rows),
      ...n,
      explanation: [
        ...(shape === 2 ? [`Current liabilities = Current assets - Working capital = ${inr(ca)} - ${inr(wc)} = ${inr(cl)}.`] : []),
        ...(shape === 0 ? [] : [`Total assets = ${inr(nca)} + ${inr(ca)} = ${inr(assets)}.`]),
        adds('Debt', lenders),
        `Shareholders' funds = Total assets - Debt - Current liabilities = ${inr(assets)} - ${inr(debt)} - ${inr(cl)} = ${inr(equity)}.`,
        `Debt to equity ratio = ${inr(debt)} ÷ ${inr(equity)} = ${dec(r)} : 1.`,
      ],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const assets = f.get(N.ta) ?? (f.get('Non-current assets') ?? 0) + (f.get(N.ca) ?? 0);
    const cl = f.get(N.cl) ?? (f.get(N.ca) ?? 0) - (f.get('Working capital') ?? 0);
    const debt = total(f, isDebt);
    return q.answer * (assets - cl - debt) === debt * 100;
  },
});

const totalAssetsDebt = numericTemplate({
  id: 'ar-total-assets-debt', topicId: T, conceptId: 'ar-solvency', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const debt = rng.step(200000, 800000, 20000);
    const r = rng.pick([150, 175, 200, 225, 250, 275, 300, 350, 400, 450, 500]);
    const assets = (debt * r) / 100;
    const ltp = rng.int(0, 1) === 0 ? rng.step(10000, Math.min(80000, debt / 4), 10000) : 0;
    const ltb = debt - ltp;
    const ca = Math.floor((assets * rng.pick([25, 30, 35, 40, 45])) / 100 / 10000) * 10000;
    const nca = assets - ca;
    const cl = rng.step(40000, Math.max(40000, Math.min(ca, assets - debt - 100000)), 10000);
    if (ca <= 0 || assets - debt - cl < 50000) return null;
    const nci = rng.int(0, 1) === 0 && nca >= 300000 ? rng.step(50000, Math.floor(nca / 3 / 10000) * 10000, 10000) : 0;
    const fixed: Line[] = [[N.ppe, nca - nci], ...(nci > 0 ? [[N.nci, nci] as Line] : [])];
    const lenders: Line[] = [[N.ltb, ltb], ...(ltp > 0 ? [[N.ltp, ltp] as Line] : [])];
    const n = typed('times', assets / debt, [
      [debt / assets, 'Divided the debt by the total assets: the ratio is upside down.'],
      [nca / debt, 'Left the current assets out of the total assets.'],
      [assets / (debt + cl), 'Divided by all the outside liabilities; debt means only the long-term borrowings and long-term provisions.'],
      [(assets - cl) / debt, 'Deducted the current liabilities from the total assets: that is the capital employed, not the total assets.'],
      ltp > 0 && [assets / ltb, 'Left the long-term provisions out of the debt.'],
    ]);
    return n && {
      prompt: withList(`Find the total assets to debt ratio of ${co} ${AS_RATIO}.`, [...fixed, [N.ca, ca], ...lenders, [N.cl, cl]]),
      ...n,
      explanation: [adds('Total assets', [...fixed, [N.ca, ca]]), adds('Debt', lenders), `Total assets to debt ratio = Total assets ÷ Debt = ${inr(assets)} ÷ ${inr(debt)} = ${dec(r)} : 1.`],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * total(f, isDebt) === (total(f, NON_CURRENT_ASSETS) + total(f, CURRENT_ASSETS)) * 100;
  },
});

const proprietary = numericTemplate({
  id: 'ar-proprietary', topicId: T, conceptId: 'ar-solvency', difficulty: 'medium', unit: 'times',
  // Version 2: no two wrong answers a hundredth apart (0.62 and 0.63 told two different mistakes).
  version: 2,
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const assets = rng.step(500000, 3000000, 100000);
    const r = rng.pick([25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]);
    const equity = (assets * r) / 100;
    const owners = equityLines(rng, equity, 5000);
    const outside = assets - equity;
    const parts = split(rng, outside, 2, 5000);
    if (!owners || !parts) return null;
    const [ltb, cl] = parts;
    const fromAssets = rng.int(0, 1) === 0;
    const ca = Math.floor((assets * rng.pick([30, 35, 40, 45])) / 100 / 10000) * 10000;
    const nca = assets - ca;
    // Either the whole balance sheet, or its equity and liabilities side alone: total assets are the total of either side.
    const rows: Line[] = fromAssets ? [...owners, [N.ltb, ltb], [N.cl, cl], [N.ppe, nca], [N.ca, ca]] : [...owners, [N.ltb, ltb], [N.cl, cl]];
    const n = spaced(typed('times', equity / assets, [
      [assets / equity, "Divided the total assets by the shareholders' funds: the ratio is upside down."],
      [owners[0][1] / assets, "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
      fromAssets ? [equity / nca, 'Divided by the non-current assets only; total assets include the current assets.'] : [equity / outside, "Divided the shareholders' funds by the outside liabilities; total assets equal shareholders' funds plus all liabilities."],
      [(equity + ltb) / assets, "Counted the long-term borrowings in the shareholders' funds."],
    ]));
    return n && {
      prompt: withList(`Find the proprietary ratio (shareholders' funds to total assets) of ${co} ${AS_RATIO}. ${fromAssets ? 'The items listed are its whole balance sheet' : 'The items listed are all its equity and liabilities'}.`, rows),
      ...n,
      explanation: [
        adds("Shareholders' funds", owners),
        fromAssets ? adds('Total assets', [[N.ppe, nca], [N.ca, ca]]) : `Total assets = Total of equity and liabilities = ${inr(equity)} + ${inr(ltb)} + ${inr(cl)} = ${inr(assets)}.`,
        `Proprietary ratio = Shareholders' funds ÷ Total assets = ${inr(equity)} ÷ ${inr(assets)} = ${dec(r)} : 1.`,
      ],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const assets = f.has(N.ppe) ? total(f, NON_CURRENT_ASSETS) + total(f, CURRENT_ASSETS) : total(f, () => true);
    return q.answer * assets === total(f, EQUITY) * 100;
  },
});

/** Debentures, the interest on them, and a profit that covers the interest `icr` hundredths of times. */
function coverage(rng: Rng) {
  const debentures = rng.step(200000, 1000000, 100000);
  const rate = rng.pick([8, 9, 10, 12, 15]);
  const interest = (debentures * rate) / 100;
  const icr = rng.pick([250, 300, 400, 450, 500, 600, 700, 750, 800, 900, 1000, 1200]);
  const pbit = (interest * icr) / 100;
  const pbt = pbit - interest;
  const taxRate = rng.pick([20, 25, 30, 40]);
  const tax = (pbt * taxRate) / 100;
  return { debentures, rate, interest, icr, pbit, pbt, taxRate, tax, pat: pbt - tax };
}

const interestCoverage = numericTemplate({
  id: 'ar-interest-coverage', topicId: T, conceptId: 'ar-solvency', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = coverage(rng);
    if (!Number.isInteger(s.tax)) return null;
    if (rng.int(0, 1) === 0) {
      const n = typed('times', s.pbit / s.interest, [
        [s.pbt / s.interest, 'Did not add the interest back: the interest is covered by the profit before interest and tax.'],
        [s.pbit / s.debentures, 'Divided by the debentures themselves instead of by the interest on them.'],
        [s.interest / s.pbit, 'Divided the interest by the profit: the ratio is upside down.'],
      ]);
      return n && {
        prompt: `${co} had ${s.rate}% debentures of ${inr(s.debentures)} outstanding throughout the year and no other long-term debt. Its net profit before tax, after charging the interest on the debentures, was ${inr(s.pbt)}. Find the interest coverage ratio ${IN_TIMES}.`,
        ...n,
        explanation: [
          `Interest on debentures = ${s.rate}% of ${inr(s.debentures)} = ${inr(s.interest)}.`,
          `Profit before interest and tax = ${inr(s.pbt)} + ${inr(s.interest)} = ${inr(s.pbit)}.`,
          `Interest coverage ratio = ${inr(s.pbit)} ÷ ${inr(s.interest)} = ${dec(s.icr)} times.`,
        ],
        hints: H.coverage,
      };
    }
    const n = typed('times', s.pbit / s.interest, [
      [s.pat / s.interest, 'Used the profit after tax; the interest is covered by the profit before interest and tax.'],
      [s.pbt / s.interest, 'Added back the tax but not the interest.'],
      [(s.pat + s.interest) / s.interest, 'Added back the interest but not the tax.'],
      [s.interest / s.pbit, 'Divided the interest by the profit: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the interest coverage ratio of ${co} ${IN_TIMES}.`, [[N.pat, s.pat], [N.tax, s.tax], ['Interest on long-term borrowings', s.interest]]),
      ...n,
      explanation: [
        `Profit before interest and tax = Net profit after tax + Tax + Interest = ${inr(s.pat)} + ${inr(s.tax)} + ${inr(s.interest)} = ${inr(s.pbit)}.`,
        `Interest coverage ratio = ${inr(s.pbit)} ÷ ${inr(s.interest)} = ${dec(s.icr)} times.`,
      ],
      hints: H.coverage,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    if (f.size > 0) {
      const interest = f.get('Interest on long-term borrowings') ?? 0;
      return q.answer * interest === ((f.get(N.pat) ?? 0) + (f.get(N.tax) ?? 0) + interest) * 100;
    }
    const [debentures, pbt] = amountsIn(q.prompt);
    const interest = (debentures * percentsIn(q.prompt)[0]) / 100;
    return q.answer * interest === (pbt + interest) * 100;
  },
});

const interestCoverageAfterTax = numericTemplate({
  id: 'ar-interest-coverage-after-tax', topicId: T, conceptId: 'ar-solvency', difficulty: 'complex', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = coverage(rng);
    if (!Number.isInteger(s.tax) || s.pat % 100 !== 0) return null;
    const n = typed('times', s.pbit / s.interest, [
      [s.pat / s.interest, 'Used the profit after tax; the interest is covered by the profit before interest and tax.'],
      [(s.pat + s.interest) / s.interest, 'Added back the interest but not the tax.'],
      [s.pbt / s.interest, 'Found the profit before tax but did not add the interest back.'],
      [((s.pat * (100 + s.taxRate)) / 100 + s.interest) / s.interest, `Added ${s.taxRate}% of the profit after tax as the tax; the tax is ${s.taxRate}% of the profit before tax.`],
      [s.pbit / s.debentures, 'Divided by the debentures themselves instead of by the interest on them.'],
    ]);
    return n && {
      prompt: `${co} earned a net profit after tax of ${inr(s.pat)}. Tax is charged at ${s.taxRate}% of the profit before tax. The company had ${s.rate}% debentures of ${inr(s.debentures)} outstanding throughout the year and no other long-term debt. Find the interest coverage ratio ${IN_TIMES}.`,
      ...n,
      explanation: [
        `Profit after tax is ${100 - s.taxRate}% of the profit before tax, so profit before tax = ${inr(s.pat)} x 100 ÷ ${100 - s.taxRate} = ${inr(s.pbt)}.`,
        `Interest on debentures = ${s.rate}% of ${inr(s.debentures)} = ${inr(s.interest)}.`,
        `Profit before interest and tax = ${inr(s.pbt)} + ${inr(s.interest)} = ${inr(s.pbit)}.`,
        `Interest coverage ratio = ${inr(s.pbit)} ÷ ${inr(s.interest)} = ${dec(s.icr)} times.`,
      ],
      hints: H.coverage,
    };
  },
  verify: (q) => {
    const [pat, debentures] = amountsIn(q.prompt);
    const [taxRate, rate] = percentsIn(q.prompt);
    const interest = (debentures * rate) / 100;
    // Worked forwards: the profit before tax implied by the answer, less tax at the rate, is the profit after tax.
    const pbt = (q.answer * interest) / 100 - interest;
    return near(pbt - (pbt * taxRate) / 100, pat);
  },
});

/** A capital employed with its debt at `r` hundredths of it, on the liabilities side and on the assets side. */
function employed(rng: Rng) {
  const ce = rng.step(600000, 3000000, 100000);
  const r = rng.pick([20, 25, 30, 35, 40, 45, 50, 60]);
  const debt = (ce * r) / 100;
  const ltp = rng.int(0, 1) === 0 ? rng.step(10000, Math.min(100000, Math.floor(debt / 4 / 5000) * 5000), 5000) : 0;
  const equity = ce - debt;
  const cl = rng.step(100000, 500000, 10000);
  const wc = rng.step(50000, Math.floor(ce / 3 / 10000) * 10000, 10000);
  return { ce, r, debt, ltp, ltb: debt - ltp, equity, cl, wc, ca: cl + wc, nca: ce - wc };
}

const debtCapitalEmployed = numericTemplate({
  id: 'ar-debt-capital-employed', topicId: T, conceptId: 'ar-solvency', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = employed(rng);
    const owners = equityLines(rng, s.equity, 5000);
    if (!owners) return null;
    const lenders: Line[] = [[N.ltb, s.ltb], ...(s.ltp > 0 ? [[N.ltp, s.ltp] as Line] : [])];
    const fromAssets = rng.int(0, 1) === 0;
    const rows: Line[] = fromAssets ? [[N.ppe, s.nca], [N.ca, s.ca], [N.cl, s.cl], ...lenders] : [...owners, ...lenders, [N.cl, s.cl]];
    const n = typed('times', s.debt / s.ce, [
      [s.debt / s.equity, "Divided the debt by the shareholders' funds: that is the debt to equity ratio."],
      [s.debt / (s.ce + s.cl), 'Divided by the total assets; capital employed leaves out what the current liabilities finance.'],
      fromAssets && [s.debt / s.nca, 'Took the non-current assets alone as the capital employed and left out the working capital.'],
      s.ltp > 0 && [s.ltb / s.ce, 'Left the long-term provisions out of the debt.'],
      [s.ce / s.debt, 'Divided the capital employed by the debt: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the debt to capital employed ratio of ${co} ${AS_RATIO}.`, rows),
      ...n,
      explanation: [
        adds('Debt', lenders),
        fromAssets
          ? `Capital employed = Non-current assets + Working capital = ${inr(s.nca)} + (${inr(s.ca)} - ${inr(s.cl)}) = ${inr(s.ce)}.`
          : `Capital employed = Shareholders' funds + Non-current liabilities = ${inr(s.equity)} + ${inr(s.debt)} = ${inr(s.ce)}.`,
        `Debt to capital employed ratio = ${inr(s.debt)} ÷ ${inr(s.ce)} = ${dec(s.r)} : 1.`,
      ],
      hints: H.solvency,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const debt = total(f, isDebt);
    const ce = f.has(N.ppe) ? total(f, NON_CURRENT_ASSETS) + total(f, CURRENT_ASSETS) - total(f, CURRENT_LIABILITIES) : total(f, EQUITY) + debt;
    return q.answer * ce === debt * 100;
  },
});

const SOLVENCY_BANK: BankItem[] = [
  {
    prompt: 'The debt to equity ratio is worked out as:',
    correct: "Debt ÷ Shareholders' funds",
    wrong: [
      ["Shareholders' funds ÷ Debt", 'Turned the ratio upside down.'],
      ['Debt ÷ Capital employed', 'Gave the debt to capital employed ratio.'],
      ['Total assets ÷ Debt', 'Gave the total assets to debt ratio.'],
      ['Total liabilities ÷ Total assets', 'Brought in every liability and the assets; the ratio compares long-term debt with the funds of the owners.'],
    ],
    explanation: "Debt to equity ratio = Debt ÷ Equity, where equity means the shareholders' funds.",
  },
  {
    prompt: 'In the debt to equity ratio, "debt" means:',
    correct: 'Long-term borrowings and long-term provisions',
    wrong: [
      ['Long-term borrowings and short-term borrowings', 'Counted the short-term borrowings; they are a current liability.'],
      ['All liabilities, non-current and current', 'Counted the current liabilities as debt.'],
      ['Trade payables and other current liabilities', 'Took the current liabilities for debt; debt is long-term.'],
      ['Long-term borrowings and share capital', "Counted share capital, which belongs to the shareholders' funds."],
    ],
    explanation: 'Debt is the long-term debt: long-term borrowings plus long-term provisions. Current liabilities are left out.',
  },
  {
    prompt: "Equity, or shareholders' funds, is:",
    correct: 'Share capital plus reserves and surplus',
    wrong: [
      ['Share capital only', "Left out reserves and surplus, which also belong to the shareholders."],
      ['Share capital, reserves and surplus and long-term borrowings', 'Added the long-term borrowings: that is the capital employed.'],
      ['Total assets', "Total assets are financed by outsiders as well as by the shareholders."],
      ['Share capital less reserves and surplus', 'Deducted the reserves instead of adding them.'],
    ],
    explanation: "Shareholders' funds = Share capital + Reserves and surplus. It also equals total assets less all outside liabilities.",
  },
  {
    prompt: 'The total assets to debt ratio is worked out as:',
    correct: 'Total assets ÷ Debt',
    wrong: [
      ['Debt ÷ Total assets', 'Turned the ratio upside down.'],
      ["Total assets ÷ Shareholders' funds", "Put the shareholders' funds where the debt should be."],
      ['Non-current assets ÷ Debt', 'Left the current assets out of the total assets.'],
      ['Total assets ÷ Total liabilities', 'Counted the current liabilities with the debt.'],
    ],
    explanation: 'Total assets to debt ratio = Total assets ÷ Debt, where debt is the long-term debt.',
  },
  {
    prompt: 'Worked out on total assets, the proprietary ratio is:',
    correct: "Shareholders' funds ÷ Total assets",
    wrong: [
      ["Total assets ÷ Shareholders' funds", 'Turned the ratio upside down.'],
      ["Shareholders' funds ÷ Debt", 'Compared the owners with the lenders; the proprietary ratio compares the owners with the total assets.'],
      ['Share capital ÷ Total assets', "Left reserves and surplus out of the shareholders' funds."],
      ["Shareholders' funds ÷ Non-current assets", 'Left the current assets out of the total assets.'],
    ],
    explanation: "Proprietary ratio = Shareholders' funds ÷ Total assets: the share of the assets financed by the owners. (It is sometimes worked on capital employed instead, so a question says which base it uses.)",
  },
  {
    prompt: 'The interest coverage ratio is worked out as:',
    correct: 'Profit before interest and tax ÷ Interest on long-term debt',
    wrong: [
      ['Profit after tax ÷ Interest on long-term debt', 'Used the profit after tax; interest is paid out of the profit before interest and tax.'],
      ['Profit before tax ÷ Interest on long-term debt', 'Did not add back the interest, which has already been deducted from the profit before tax.'],
      ['Interest on long-term debt ÷ Profit before interest and tax', 'Turned the ratio upside down.'],
      ['Long-term debt ÷ Interest on long-term debt', 'Compared the debt with its interest; the ratio compares the profit with the interest.'],
    ],
    explanation: 'Interest coverage ratio = Profit before interest and tax ÷ Interest on long-term debt, expressed in times.',
  },
  {
    prompt: 'Worked out from the equity and liabilities side of a balance sheet, capital employed is:',
    correct: "Shareholders' funds + Non-current liabilities",
    wrong: [
      ["Shareholders' funds + Current liabilities", 'Added the current liabilities instead of the non-current ones.'],
      ["Shareholders' funds only", 'Left out the long-term borrowed funds, which are also employed in the business.'],
      ["Shareholders' funds + Non-current liabilities + Current liabilities", 'That is the total of the balance sheet; capital employed leaves out the current liabilities.'],
    ],
    explanation: "Capital employed = Shareholders' funds + Non-current liabilities (long-term borrowings and long-term provisions).",
  },
  {
    prompt: 'Worked out from the assets side of a balance sheet, capital employed is:',
    correct: 'Non-current assets + Working capital',
    wrong: [
      ['Non-current assets + Current assets', 'That is the total assets; the current liabilities have to be deducted.'],
      ['Non-current assets only', 'Left out the working capital.'],
      ['Current assets − Current liabilities', 'That is the working capital alone; the non-current assets are left out.'],
      ['Non-current assets − Working capital', 'Deducted the working capital instead of adding it.'],
    ],
    explanation: 'Capital employed = Non-current assets + Working capital, where working capital = current assets − current liabilities.',
  },
  {
    prompt: 'The debt to capital employed ratio is worked out as:',
    correct: 'Debt ÷ Capital employed',
    wrong: [
      ["Debt ÷ Shareholders' funds", 'Gave the debt to equity ratio.'],
      ['Capital employed ÷ Debt', 'Turned the ratio upside down.'],
      ['Debt ÷ Total assets', 'Divided by total assets; capital employed leaves out what the current liabilities finance.'],
    ],
    explanation: "Debt to capital employed ratio = Debt ÷ Capital employed, where capital employed = shareholders' funds + non-current liabilities.",
  },
  {
    prompt: 'A lender compares two companies. Company P has a debt to equity ratio of 0.5 : 1 and company Q of 2.5 : 1. Which statement is right?',
    correct: 'Q depends more on borrowed funds, so lending to Q is riskier',
    wrong: [
      ['P depends more on borrowed funds, so lending to P is riskier', 'Read the ratio the wrong way round: the higher the ratio, the larger the debt compared with the owners\' funds.'],
      ['Q is safer because it has more funds', 'Took more debt as more safety; a higher ratio means a thinner cushion of owners\' funds for the lenders.'],
      ['Both are equally safe, because the ratio says nothing about risk', 'The ratio is used exactly to judge how far a business leans on borrowed funds.'],
    ],
    explanation: "A high debt to equity ratio means more debt for each rupee of owners' funds: more risk for the lenders. A low ratio means more safety.",
  },
  {
    prompt: 'A higher proprietary ratio generally means:',
    correct: 'more security for the creditors, since owners finance a larger part of the assets',
    wrong: [
      ['less security for the creditors', "Read it the wrong way round: a larger share of owners' funds is a larger cushion for creditors."],
      ['more profit for the shareholders', 'The proprietary ratio is about how assets are financed, not about profit.'],
      ['a better ability to pay short-term debts', 'That is judged by the liquidity ratios.'],
    ],
    explanation: 'The proprietary ratio shows the share of total assets financed by the owners. The higher it is, the safer the creditors are.',
  },
  {
    prompt: 'An interest coverage ratio of 6 times means that:',
    correct: 'the profit before interest and tax is six times the interest on long-term debt',
    wrong: [
      ['the interest is six times the profit', 'Read the ratio the wrong way round.'],
      ['the debt is six times the interest', 'The ratio compares profit with interest, not debt with interest.'],
      ['the profit after tax is six times the interest', 'The ratio uses the profit before interest and tax.'],
    ],
    explanation: 'Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt. The higher it is, the safer the interest.',
  },
];

const solvencyTerms = mcqTemplate({
  id: 'ar-solvency-terms', topicId: T, conceptId: 'ar-solvency', difficulty: 'easy',
  generate: (rng) => {
    const form = rng.int(0, 6);
    if (form === 0) return placeItem(rng, 'Which of these is counted as debt in the debt to equity ratio?', ['debt'], ['cl', 'cl', 'equity', 'cl'], (n, f) => `${n}: ${f}.`, H.solvency);
    if (form === 1) return placeItem(rng, "Which of these is part of the shareholders' funds?", ['equity'], ['debt', 'cl', 'nca', 'debt'], (n, f) => `${n}: ${f}.`, H.solvency);
    if (form === 2) return placeItem(rng, 'Which of these is NOT part of the capital employed, worked out from the equity and liabilities side?', ['cl'], ['equity', 'equity', 'debt', 'debt'], (n, f) => `${n}: ${f}. Capital employed is shareholders' funds plus non-current liabilities.`, H.solvency);
    return fromBank(rng, SOLVENCY_BANK, H.solvency);
  },
});

// ===============================================================================================================
// Activity (turnover) ratios
// ===============================================================================================================

/** An opening and a closing balance on either side of an average, both in multiples of `step`. */
function aroundAverage(rng: Rng, average: number, step: number): [opening: number, closing: number] {
  const gap = rng.step(step, Math.max(step, Math.floor(average / 3 / step) * step), step);
  return rng.int(0, 1) === 0 ? [average - gap, average + gap] : [average + gap, average - gap];
}

const inventoryTurnover = numericTemplate({
  id: 'ar-inventory-turnover', topicId: T, conceptId: 'ar-activity', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 300000, 10000);
    const itr = rng.pick([300, 400, 450, 500, 600, 750, 800, 900, 1000, 1200]);
    const cost = (average * itr) / 100;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    const n = typed('times', cost / average, [
      [cost / closing, 'Divided by the closing inventory instead of the average inventory.'],
      [cost / opening, 'Divided by the opening inventory instead of the average inventory.'],
      [cost / (opening + closing), 'Added the opening and closing inventories but did not halve the total to get the average.'],
      [average / cost, 'Divided the average inventory by the cost of revenue from operations: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the inventory turnover ratio of ${co} ${IN_TIMES}.`, [[N.cost, cost], [N.openInv, opening], [N.closeInv, closing]]),
      ...n,
      explanation: [
        `Average inventory = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
        `Inventory turnover ratio = Cost of revenue from operations ÷ Average inventory = ${inr(cost)} ÷ ${inr(average)} = ${dec(itr)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * ((f.get(N.openInv) ?? 0) + (f.get(N.closeInv) ?? 0)) === (f.get(N.cost) ?? 0) * 200;
  },
});

const inventoryTurnoverCost = numericTemplate({
  id: 'ar-inventory-turnover-cost', topicId: T, conceptId: 'ar-activity', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 300000, 10000);
    const itr = rng.pick([300, 400, 450, 500, 600, 750, 800, 900, 1000]);
    const cost = (average * itr) / 100;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    const revenue = (cost * rng.pick([120, 125, 140, 150, 160])) / 100;
    if (!Number.isInteger(revenue)) return null;
    if (rng.int(0, 2) === 0) {
      const gp = revenue - cost;
      const n = typed('times', cost / average, [
        [revenue / average, 'Used the revenue from operations; inventory is carried at cost, so the numerator is the cost of revenue from operations.'],
        [gp / average, 'Used the gross profit as the numerator.'],
        [cost / closing, 'Divided by the closing inventory instead of the average inventory.'],
        [cost / (opening + closing), 'Added the opening and closing inventories but did not halve the total to get the average.'],
      ]);
      return n && {
        prompt: withList(`Find the inventory turnover ratio of ${co} ${IN_TIMES}.`, [[N.rev, revenue], [N.gp, gp], [N.openInv, opening], [N.closeInv, closing]]),
        ...n,
        explanation: [
          `Cost of revenue from operations = Revenue from operations - Gross profit = ${inr(revenue)} - ${inr(gp)} = ${inr(cost)}.`,
          `Average inventory = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
          `Inventory turnover ratio = ${inr(cost)} ÷ ${inr(average)} = ${dec(itr)} times.`,
        ],
        hints: H.activity,
      };
    }
    const direct = rng.step(5000, 40000, 1000);
    const directName = rng.pick(['Carriage inwards', 'Factory wages', 'Freight inwards']);
    const returns = rng.int(0, 1) === 0 ? rng.step(2000, 20000, 1000) : 0;
    const purchases = cost - opening + closing - direct + returns;
    if (purchases <= 0) return null;
    const rows: Line[] = [[N.openInv, opening], [N.purchases, purchases], ...(returns > 0 ? [[N.purchasesReturns, returns] as Line] : []), [directName, direct], [N.closeInv, closing], [N.rev, revenue]];
    const n = typed('times', cost / average, [
      [revenue / average, 'Used the revenue from operations; inventory is carried at cost, so the numerator is the cost of revenue from operations.'],
      [(cost - direct) / average, `Left the ${lower(directName)}, a direct expense, out of the cost of revenue from operations.`],
      returns > 0 && [(cost + returns) / average, 'Did not deduct the purchases returns from the purchases.'],
      [(cost + closing) / average, 'Did not deduct the closing inventory in finding the cost of revenue from operations.'],
      [cost / closing, 'Divided by the closing inventory instead of the average inventory.'],
    ]);
    return n && {
      prompt: withList(`Find the inventory turnover ratio of ${co} ${IN_TIMES}.`, rows),
      ...n,
      explanation: [
        `Cost of revenue from operations = Opening inventory + ${returns > 0 ? 'Net purchases' : 'Purchases'} + Direct expenses - Closing inventory = ${inr(opening)} + ${returns > 0 ? `(${inr(purchases)} - ${inr(returns)})` : inr(purchases)} + ${inr(direct)} - ${inr(closing)} = ${inr(cost)}.`,
        `Average inventory = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
        `Inventory turnover ratio = ${inr(cost)} ÷ ${inr(average)} = ${dec(itr)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const get = (name: string) => f.get(name) ?? 0;
    const known = [N.openInv, N.closeInv, N.rev, N.gp, N.purchases, N.purchasesReturns] as string[];
    const direct = total(f, (label) => !known.includes(label));
    const cost = f.has(N.gp) ? get(N.rev) - get(N.gp) : get(N.openInv) + get(N.purchases) - get(N.purchasesReturns) + direct - get(N.closeInv);
    return q.answer * (get(N.openInv) + get(N.closeInv)) === cost * 200;
  },
});

/** How a gross profit is stated, and the revenue that goes with a cost: 25% on cost, or 20% of revenue. */
const MARGINS: { on: 'cost' | 'revenue'; percent: number; revenuePer100Cost: number }[] = [
  { on: 'cost', percent: 25, revenuePer100Cost: 125 },
  { on: 'cost', percent: 20, revenuePer100Cost: 120 },
  { on: 'cost', percent: 50, revenuePer100Cost: 150 },
  { on: 'cost', percent: 60, revenuePer100Cost: 160 },
  { on: 'revenue', percent: 20, revenuePer100Cost: 125 },
  { on: 'revenue', percent: 50, revenuePer100Cost: 200 },
  { on: 'revenue', percent: 37.5, revenuePer100Cost: 160 },
  { on: 'revenue', percent: 60, revenuePer100Cost: 250 },
];
const marginText = (m: (typeof MARGINS)[number]): string => (m.on === 'cost' ? `Gross profit is ${m.percent}% on cost` : `The gross profit ratio is ${m.percent}%`);
/** The cost a student gets who applies the percentage to the wrong base. */
const wrongCost = (m: (typeof MARGINS)[number], revenue: number): number => (m.on === 'cost' ? (revenue * (100 - m.percent)) / 100 : (revenue * 100) / (100 + m.percent));
const wrongBaseWhy = (m: (typeof MARGINS)[number]): string =>
  m.on === 'cost' ? `Took the gross profit as ${m.percent}% of revenue; it is ${m.percent}% of the cost.` : `Took the gross profit as ${m.percent}% of cost; the gross profit ratio is on revenue from operations.`;
const costWorking = (m: (typeof MARGINS)[number], revenue: number, cost: number): string =>
  m.on === 'cost'
    ? `Revenue is ${100 + m.percent}% of cost, so cost of revenue from operations = ${inr(revenue)} x 100 ÷ ${100 + m.percent} = ${inr(cost)}.`
    : `Gross profit = ${m.percent}% of ${inr(revenue)} = ${inr(revenue - cost)}, so cost of revenue from operations = ${inr(revenue)} - ${inr(revenue - cost)} = ${inr(cost)}.`;

const inventoryTurnoverMargin = numericTemplate({
  id: 'ar-inventory-turnover-margin', topicId: T, conceptId: 'ar-activity', difficulty: 'complex', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 300000, 10000);
    const itr = rng.pick([300, 400, 450, 500, 600, 750, 800, 900, 1000]);
    const cost = (average * itr) / 100;
    const m = rng.pick(MARGINS);
    const revenue = (cost * m.revenuePer100Cost) / 100;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    const gap = Math.abs(closing - opening);
    const n = typed('times', cost / average, [
      [wrongCost(m, revenue) / average, wrongBaseWhy(m)],
      [revenue / average, 'Used the revenue from operations; inventory is carried at cost, so the numerator is the cost of revenue from operations.'],
      [cost / opening, 'Divided by the opening inventory instead of the average inventory.'],
      [cost / closing, 'Divided by the closing inventory instead of the average inventory.'],
      [cost / (opening + closing), 'Added the opening and closing inventories but did not halve the total to get the average.'],
    ]);
    return n && {
      prompt: `The revenue from operations of ${co} for the year is ${inr(revenue)}. ${marginText(m)}. The opening inventory was ${inr(opening)} and the closing inventory is ${inr(gap)} ${closing > opening ? 'more' : 'less'} than the opening inventory. Find the inventory turnover ratio ${IN_TIMES}.`,
      ...n,
      explanation: [
        costWorking(m, revenue, cost),
        `Closing inventory = ${inr(opening)} ${closing > opening ? '+' : '-'} ${inr(gap)} = ${inr(closing)}; average inventory = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
        `Inventory turnover ratio = ${inr(cost)} ÷ ${inr(average)} = ${dec(itr)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const [revenue, opening, gap] = amountsIn(q.prompt);
    const percent = percentsIn(q.prompt)[0];
    const closing = q.prompt.includes('more than the opening') ? opening + gap : opening - gap;
    // Worked forwards from the answer: the cost it implies, with the gross profit on it, is the revenue.
    const cost = (q.answer * (opening + closing)) / 200;
    return near(q.prompt.includes('on cost') ? (cost * (100 + percent)) / 100 : cost / (1 - percent / 100), revenue);
  },
});

const receivablesTurnover = numericTemplate({
  id: 'ar-trade-receivables-turnover', topicId: T, conceptId: 'ar-activity', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 240000, 10000);
    const trt = rng.pick([400, 500, 600, 750, 800, 900, 1000, 1200]);
    const credit = (average * trt) / 100;
    const cash = rng.step(50000, 400000, 10000);
    const [opening, closing] = aroundAverage(rng, average, 5000);
    if (rng.int(0, 1) === 0) {
      // Debtors and bills receivable are given separately.
      const billsOpen = rng.step(5000, Math.max(5000, Math.floor(opening / 3 / 5000) * 5000), 5000);
      const billsClose = rng.step(5000, Math.max(5000, Math.floor(closing / 3 / 5000) * 5000), 5000);
      const rows: Line[] = [
        [N.rev, credit + cash], ['Cash revenue from operations', cash],
        ['Opening debtors', opening - billsOpen], ['Opening bills receivable', billsOpen], ['Closing debtors', closing - billsClose], ['Closing bills receivable', billsClose],
      ];
      const n = typed('times', credit / average, [
        [(credit + cash) / average, 'Used the total revenue from operations; cash revenue creates no trade receivables.'],
        [(credit * 2) / (opening - billsOpen + closing - billsClose), 'Left the bills receivable out of the trade receivables.'],
        [credit / closing, 'Divided by the closing trade receivables instead of the average.'],
        [credit / (opening + closing), 'Added the opening and closing trade receivables but did not halve the total to get the average.'],
      ]);
      return n && {
        prompt: withList(`Find the trade receivables turnover ratio of ${co} ${IN_TIMES}.`, rows),
        ...n,
        explanation: [
          `Credit revenue from operations = ${inr(credit + cash)} - ${inr(cash)} = ${inr(credit)}.`,
          `Trade receivables are debtors plus bills receivable: opening ${inr(opening)}, closing ${inr(closing)}; average = ${inr(average)}.`,
          `Trade receivables turnover ratio = Credit revenue from operations ÷ Average trade receivables = ${inr(credit)} ÷ ${inr(average)} = ${dec(trt)} times.`,
        ],
        hints: H.activity,
      };
    }
    const provision = rng.step(2000, Math.max(2000, Math.floor(closing / 10 / 1000) * 1000), 1000);
    const provisionOpen = rng.step(2000, Math.max(2000, Math.floor(opening / 10 / 1000) * 1000), 1000);
    const rows: Line[] = [
      ['Credit revenue from operations', credit], ['Cash revenue from operations', cash],
      ['Opening trade receivables (before provision)', opening], ['Closing trade receivables (before provision)', closing],
      ['Provision for doubtful debts at the beginning', provisionOpen], ['Provision for doubtful debts at the end', provision],
    ];
    const n = typed('times', credit / average, [
      [(credit + cash) / average, 'Used the total revenue from operations; cash revenue creates no trade receivables.'],
      [(credit * 2) / (opening + closing - provision - provisionOpen), 'Deducted the provision for doubtful debts; the trade receivables are taken before any provision.'],
      [credit / closing, 'Divided by the closing trade receivables instead of the average.'],
      [credit / (opening + closing), 'Added the opening and closing trade receivables but did not halve the total to get the average.'],
    ]);
    return n && {
      prompt: withList(`Find the trade receivables turnover ratio of ${co} ${IN_TIMES}.`, rows),
      ...n,
      explanation: [
        'Trade receivables are taken before deducting the provision for doubtful debts, and only credit revenue is used.',
        `Average trade receivables = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
        `Trade receivables turnover ratio = Credit revenue from operations ÷ Average trade receivables = ${inr(credit)} ÷ ${inr(average)} = ${dec(trt)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const get = (name: string) => f.get(name) ?? 0;
    const credit = f.has('Credit revenue from operations') ? get('Credit revenue from operations') : get(N.rev) - get('Cash revenue from operations');
    const receivables = total(f, (label) => /^(Opening|Closing) (debtors|bills receivable|trade receivables)/.test(label));
    return q.answer * receivables === credit * 200;
  },
});

const collectionPeriod = numericTemplate({
  id: 'ar-collection-period', topicId: T, conceptId: 'ar-activity', difficulty: 'medium', unit: 'number',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const basis = rng.pick<{ year: number; unit: string; say: string; turnovers: number[] }>([
      { year: 360, unit: 'days', say: 'Take a year as 360 days', turnovers: [4, 5, 6, 8, 9, 10, 12, 15] },
      { year: 360, unit: 'days', say: 'Take a year as 360 days', turnovers: [4, 5, 6, 8, 9, 10, 12, 15] },
      { year: 365, unit: 'days', say: 'Take a year as 365 days', turnovers: [5] },
      { year: 12, unit: 'months', say: 'Take a year as 12 months', turnovers: [2, 3, 4, 6, 12] },
    ]);
    const trt = rng.pick(basis.turnovers);
    const average = rng.step(40000, 240000, 10000);
    const credit = average * trt;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    const period = basis.year / trt;
    const n = typed('number', period, [
      [trt, `Stopped at the trade receivables turnover ratio (${trt} times); the collection period is the ${basis.unit} in the year divided by it.`],
      [(basis.year * closing) / credit, 'Used the closing trade receivables instead of the average.'],
      [(basis.year * (opening + closing)) / credit, 'Added the opening and closing trade receivables but did not halve the total to get the average.'],
      [basis.year * trt, `Multiplied the ${basis.unit} in the year by the turnover ratio instead of dividing.`],
    ]);
    return n && {
      prompt: withList(`Find the average collection period of ${co} in ${basis.unit}. ${basis.say}.`, [['Credit revenue from operations', credit], ['Opening trade receivables', opening], ['Closing trade receivables', closing]]),
      ...n,
      explanation: [
        `Average trade receivables = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
        `Trade receivables turnover ratio = ${inr(credit)} ÷ ${inr(average)} = ${trt} times.`,
        `Average collection period = ${basis.year} ${basis.unit} ÷ ${trt} = ${period} ${basis.unit}.`,
      ],
      hints: ['First find the trade receivables turnover ratio on the average trade receivables.', 'Average collection period = Days (or months) in the year ÷ Trade receivables turnover ratio.'],
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const year = Number(/Take a year as (\d+)/.exec(q.prompt)?.[1]);
    // Period x credit revenue = days in the year x average trade receivables.
    return q.answer * (f.get('Credit revenue from operations') ?? 0) * 2 === year * ((f.get('Opening trade receivables') ?? 0) + (f.get('Closing trade receivables') ?? 0));
  },
});

const payablesTurnover = numericTemplate({
  id: 'ar-trade-payables-turnover', topicId: T, conceptId: 'ar-activity', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 200000, 10000);
    const tpt = rng.pick([300, 400, 450, 500, 600, 750, 800, 900]);
    const net = (average * tpt) / 100;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    if (rng.int(0, 1) === 0) {
      const cash = rng.step(50000, 300000, 10000);
      const returns = rng.int(0, 2) > 0 ? rng.step(2000, 20000, 1000) : 0;
      const purchases = net + cash + returns;
      const rows: Line[] = [
        [N.purchases, purchases], ['Cash purchases', cash], ...(returns > 0 ? [['Purchases returns (out of credit purchases)', returns] as Line] : []),
        ['Opening trade payables', opening], ['Closing trade payables', closing],
      ];
      const n = typed('times', net / average, [
        [purchases / average, 'Used the total purchases; cash purchases create no trade payables.'],
        returns > 0 && [(net + returns) / average, 'Did not deduct the purchases returns from the credit purchases.'],
        returns > 0 && [(purchases - returns) / average, 'Deducted the returns but not the cash purchases.'],
        [net / closing, 'Divided by the closing trade payables instead of the average.'],
        [net / (opening + closing), 'Added the opening and closing trade payables but did not halve the total to get the average.'],
      ]);
      return n && {
        prompt: withList(`Find the trade payables turnover ratio of ${co} ${IN_TIMES}.`, rows),
        ...n,
        explanation: [
          `Net credit purchases = ${inr(purchases)} - ${inr(cash)}${returns > 0 ? ` - ${inr(returns)}` : ''} = ${inr(net)}.`,
          `Average trade payables = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
          `Trade payables turnover ratio = Net credit purchases ÷ Average trade payables = ${inr(net)} ÷ ${inr(average)} = ${dec(tpt)} times.`,
        ],
        hints: H.activity,
      };
    }
    const billsOpen = rng.step(5000, Math.max(5000, Math.floor(opening / 3 / 5000) * 5000), 5000);
    const billsClose = rng.step(5000, Math.max(5000, Math.floor(closing / 3 / 5000) * 5000), 5000);
    const rows: Line[] = [
      ['Net credit purchases', net],
      ['Opening creditors', opening - billsOpen], ['Opening bills payable', billsOpen], ['Closing creditors', closing - billsClose], ['Closing bills payable', billsClose],
    ];
    const n = typed('times', net / average, [
      [(net * 2) / (opening - billsOpen + closing - billsClose), 'Left the bills payable out of the trade payables.'],
      [net / closing, 'Divided by the closing trade payables instead of the average.'],
      [net / (opening + closing), 'Added the opening and closing trade payables but did not halve the total to get the average.'],
      [average / net, 'Divided the average trade payables by the purchases: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the trade payables turnover ratio of ${co} ${IN_TIMES}.`, rows),
      ...n,
      explanation: [
        `Trade payables are creditors plus bills payable: opening ${inr(opening)}, closing ${inr(closing)}; average = ${inr(average)}.`,
        `Trade payables turnover ratio = Net credit purchases ÷ Average trade payables = ${inr(net)} ÷ ${inr(average)} = ${dec(tpt)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const get = (name: string) => f.get(name) ?? 0;
    const net = f.has('Net credit purchases') ? get('Net credit purchases') : get(N.purchases) - get('Cash purchases') - get('Purchases returns (out of credit purchases)');
    const payables = total(f, (label) => /^(Opening|Closing) (creditors|bills payable|trade payables)/.test(label));
    return q.answer * payables === net * 200;
  },
});

const fixedAssetsTurnover = numericTemplate({
  id: 'ar-fixed-assets-turnover', topicId: T, conceptId: 'ar-activity', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const net = rng.step(200000, 1500000, 50000);
    const fat = rng.pick([150, 200, 250, 300, 400, 500, 600]);
    const revenue = (net * fat) / 100;
    if (rng.int(0, 1) === 0) {
      const depreciation = rng.step(50000, 400000, 50000);
      const gross = net + depreciation;
      const n = typed('times', revenue / net, [
        [revenue / gross, 'Divided by the cost of the fixed assets without deducting the accumulated depreciation.'],
        [revenue / (gross + depreciation), 'Added the accumulated depreciation to the cost instead of deducting it.'],
        [net / revenue, 'Divided the net fixed assets by the revenue: the ratio is upside down.'],
      ]);
      return n && {
        prompt: withList(`Find the fixed assets turnover ratio of ${co} ${IN_TIMES}.`, [[N.rev, revenue], ['Fixed assets (property, plant and equipment) at cost', gross], ['Accumulated depreciation', depreciation]]),
        ...n,
        explanation: [
          `Net fixed assets = ${inr(gross)} - ${inr(depreciation)} = ${inr(net)}.`,
          `Fixed assets turnover ratio = Revenue from operations ÷ Net fixed assets = ${inr(revenue)} ÷ ${inr(net)} = ${dec(fat)} times.`,
        ],
        hints: H.activity,
      };
    }
    const nci = rng.step(50000, 300000, 10000);
    const cost = Math.floor((revenue * rng.pick([60, 70, 75, 80])) / 100 / 1000) * 1000;
    const n = typed('times', revenue / net, [
      [revenue / (net + nci), 'Counted the non-current investments as fixed assets.'],
      [cost / net, 'Used the cost of revenue from operations; this ratio is on revenue from operations.'],
      [net / revenue, 'Divided the net fixed assets by the revenue: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the fixed assets turnover ratio of ${co} ${IN_TIMES}.`, [[N.rev, revenue], [N.cost, cost], ['Net fixed assets (property, plant and equipment)', net], [N.nci, nci]]),
      ...n,
      explanation: [`Fixed assets turnover ratio = Revenue from operations ÷ Net fixed assets = ${inr(revenue)} ÷ ${inr(net)} = ${dec(fat)} times.`, 'Non-current investments are not fixed assets, and the cost of revenue from operations is not used.'],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const get = (name: string) => f.get(name) ?? 0;
    const net = get('Net fixed assets (property, plant and equipment)') + get('Fixed assets (property, plant and equipment) at cost') - get('Accumulated depreciation');
    return q.answer * net === get(N.rev) * 100;
  },
});

const workingCapitalTurnover = numericTemplate({
  id: 'ar-working-capital-turnover', topicId: T, conceptId: 'ar-activity', difficulty: 'easy', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const wc = rng.step(50000, 400000, 10000);
    const wct = rng.pick([300, 400, 500, 600, 750, 800, 1000, 1200]);
    const revenue = (wc * wct) / 100;
    const cl = rng.step(60000, 300000, 10000);
    const ca = cl + wc;
    const itemised = rng.int(0, 1) === 0;
    const a = split(rng, ca, 3, 5000);
    const l = split(rng, cl, 2, 5000);
    if (itemised && (!a || !l)) return null;
    const assets: Line[] = itemised ? pair([N.inv, N.tr, N.cash], a!) : [[N.ca, ca]];
    const liabilities: Line[] = itemised ? pair([N.tp, N.stp], l!) : [[N.cl, cl]];
    const n = typed('times', revenue / wc, [
      [revenue / ca, 'Divided by the current assets without deducting the current liabilities.'],
      [revenue / (ca + cl), 'Added the current liabilities to the current assets instead of deducting them.'],
      [revenue / cl, 'Divided by the current liabilities instead of the working capital.'],
      [wc / revenue, 'Divided the working capital by the revenue: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the working capital turnover ratio of ${co} ${IN_TIMES}.`, [[N.rev, revenue], ...assets, ...liabilities]),
      ...n,
      explanation: [
        ...(itemised ? [adds('Current assets', assets), adds('Current liabilities', liabilities)] : []),
        `Working capital = Current assets - Current liabilities = ${inr(ca)} - ${inr(cl)} = ${inr(wc)}.`,
        `Working capital turnover ratio = Revenue from operations ÷ Working capital = ${inr(revenue)} ÷ ${inr(wc)} = ${dec(wct)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    return q.answer * (total(f, CURRENT_ASSETS) - total(f, CURRENT_LIABILITIES)) === (f.get(N.rev) ?? 0) * 100;
  },
});

const netAssetsTurnover = numericTemplate({
  id: 'ar-net-assets-turnover', topicId: T, conceptId: 'ar-activity', difficulty: 'medium', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = employed(rng);
    const nat = rng.pick([150, 200, 250, 300, 400, 500]);
    const revenue = (s.ce * nat) / 100;
    const owners = equityLines(rng, s.equity, 5000);
    if (!owners) return null;
    const fromAssets = rng.int(0, 1) === 0;
    const rows: Line[] = fromAssets ? [[N.rev, revenue], [N.ppe, s.nca], [N.ca, s.ca], [N.cl, s.cl]] : [[N.rev, revenue], ...owners, [N.ltb, s.debt], [N.cl, s.cl]];
    const n = typed('times', revenue / s.ce, [
      [revenue / (s.ce + s.cl), 'Divided by the total assets; net assets (capital employed) leave out what the current liabilities finance.'],
      fromAssets ? [revenue / s.nca, 'Divided by the non-current assets alone: that is the fixed assets turnover ratio.'] : [revenue / s.equity, "Divided by the shareholders' funds alone; the long-term borrowings are also part of the capital employed."],
      fromAssets && [revenue / s.wc, 'Divided by the working capital alone: that is the working capital turnover ratio.'],
      [s.ce / revenue, 'Divided the capital employed by the revenue: the ratio is upside down.'],
    ]);
    return n && {
      prompt: withList(`Find the net assets turnover ratio (net assets are the capital employed) of ${co} ${IN_TIMES}.`, rows),
      ...n,
      explanation: [
        fromAssets
          ? `Capital employed = Non-current assets + Working capital = ${inr(s.nca)} + (${inr(s.ca)} - ${inr(s.cl)}) = ${inr(s.ce)}.`
          : `Capital employed = Shareholders' funds + Non-current liabilities = ${inr(s.equity)} + ${inr(s.debt)} = ${inr(s.ce)}.`,
        `Net assets turnover ratio = Revenue from operations ÷ Capital employed = ${inr(revenue)} ÷ ${inr(s.ce)} = ${dec(nat)} times.`,
      ],
      hints: H.activity,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const ce = f.has(N.ppe) ? total(f, NON_CURRENT_ASSETS) + total(f, CURRENT_ASSETS) - total(f, CURRENT_LIABILITIES) : total(f, EQUITY) + total(f, isDebt);
    return q.answer * ce === (f.get(N.rev) ?? 0) * 100;
  },
});

const ACTIVITY_BANK: BankItem[] = [
  {
    prompt: 'The inventory turnover ratio is worked out as:',
    correct: 'Cost of revenue from operations ÷ Average inventory',
    wrong: [
      ['Revenue from operations ÷ Average inventory', 'Used revenue; inventory is carried at cost, so it is compared with the cost of revenue from operations.'],
      ['Cost of revenue from operations ÷ Closing inventory', 'Used the closing inventory; the average of the opening and closing inventory is taken.'],
      ['Average inventory ÷ Cost of revenue from operations', 'Turned the ratio upside down.'],
      ['Gross profit ÷ Average inventory', 'Used the gross profit as the numerator.'],
    ],
    explanation: 'Inventory turnover ratio = Cost of revenue from operations ÷ Average inventory, where average inventory = (opening + closing) ÷ 2.',
  },
  {
    prompt: 'The trade receivables turnover ratio is worked out as:',
    correct: 'Credit revenue from operations ÷ Average trade receivables',
    wrong: [
      ['Total revenue from operations ÷ Average trade receivables', 'Used the total revenue; cash revenue creates no trade receivables.'],
      ['Credit revenue from operations ÷ Closing trade receivables', 'Used the closing balance; the average is taken.'],
      ['Average trade receivables ÷ Credit revenue from operations', 'Turned the ratio upside down.'],
      ['Net credit purchases ÷ Average trade payables', 'Gave the trade payables turnover ratio.'],
    ],
    explanation: 'Trade receivables turnover ratio = Credit revenue from operations ÷ Average trade receivables.',
  },
  {
    prompt: 'For the trade receivables turnover ratio, trade receivables are taken as:',
    correct: 'Debtors plus bills receivable, before deducting any provision for doubtful debts',
    wrong: [
      ['Debtors plus bills receivable, after deducting the provision for doubtful debts', 'Deducted the provision; the gross figure is used for this ratio.'],
      ['Debtors only', 'Left out the bills receivable.'],
      ['Debtors less bills receivable', 'Deducted the bills receivable instead of adding them.'],
      ['Creditors plus bills payable', 'Those are the trade payables.'],
    ],
    explanation: 'Trade receivables = Debtors + Bills receivable, taken gross: the provision for doubtful debts is not deducted.',
  },
  {
    prompt: 'The trade payables turnover ratio is worked out as:',
    correct: 'Net credit purchases ÷ Average trade payables',
    wrong: [
      ['Total purchases ÷ Average trade payables', 'Used the total purchases; cash purchases create no trade payables.'],
      ['Cost of revenue from operations ÷ Average trade payables', 'Used the cost of revenue from operations; payables arise from credit purchases.'],
      ['Average trade payables ÷ Net credit purchases', 'Turned the ratio upside down.'],
      ['Credit revenue from operations ÷ Average trade receivables', 'Gave the trade receivables turnover ratio.'],
    ],
    explanation: 'Trade payables turnover ratio = Net credit purchases ÷ Average trade payables, where trade payables = creditors + bills payable.',
  },
  {
    prompt: 'The working capital turnover ratio is worked out as:',
    correct: 'Revenue from operations ÷ Working capital',
    wrong: [
      ['Revenue from operations ÷ Current assets', 'Did not deduct the current liabilities from the current assets.'],
      ['Working capital ÷ Revenue from operations', 'Turned the ratio upside down.'],
      ['Cost of revenue from operations ÷ Working capital', 'Used cost; this ratio is on revenue from operations.'],
      ['Revenue from operations ÷ Capital employed', 'Gave the net assets turnover ratio.'],
    ],
    explanation: 'Working capital turnover ratio = Revenue from operations ÷ Working capital.',
  },
  {
    prompt: 'The net assets turnover ratio is worked out as:',
    correct: 'Revenue from operations ÷ Capital employed',
    wrong: [
      ['Revenue from operations ÷ Total assets', 'Used total assets; net assets are the capital employed, after deducting current liabilities.'],
      ['Revenue from operations ÷ Net fixed assets', 'Gave the fixed assets turnover ratio.'],
      ['Revenue from operations ÷ Working capital', 'Gave the working capital turnover ratio.'],
      ['Profit before interest and tax ÷ Capital employed', 'Gave the return on investment, which uses profit and not revenue.'],
    ],
    explanation: 'Net assets turnover ratio = Revenue from operations ÷ Capital employed (net assets).',
  },
  {
    prompt: 'The fixed assets turnover ratio is worked out as:',
    correct: 'Revenue from operations ÷ Net fixed assets',
    wrong: [
      ['Revenue from operations ÷ Fixed assets at cost', 'Did not deduct the accumulated depreciation.'],
      ['Net fixed assets ÷ Revenue from operations', 'Turned the ratio upside down.'],
      ['Revenue from operations ÷ Total assets', 'Brought in the current assets as well.'],
      ['Cost of revenue from operations ÷ Net fixed assets', 'Used cost; this ratio is on revenue from operations.'],
    ],
    explanation: 'Fixed assets turnover ratio = Revenue from operations ÷ Net fixed assets (cost less accumulated depreciation).',
  },
  {
    prompt: 'When the opening and closing inventories and the purchases are known, the cost of revenue from operations is:',
    correct: 'Opening inventory + Net purchases + Direct expenses − Closing inventory',
    wrong: [
      ['Closing inventory + Net purchases + Direct expenses − Opening inventory', 'Swapped the opening and closing inventories.'],
      ['Opening inventory + Net purchases − Closing inventory', 'Left out the direct expenses.'],
      ['Opening inventory + Net purchases + Direct expenses + Closing inventory', 'Added the closing inventory instead of deducting it.'],
      ['Revenue from operations + Gross profit', 'Added the gross profit to revenue instead of deducting it.'],
    ],
    explanation: 'Cost of revenue from operations = Opening inventory + Net purchases + Direct expenses − Closing inventory. It also equals revenue from operations less gross profit.',
  },
  {
    prompt: 'When the revenue from operations and the gross profit are known, the cost of revenue from operations is:',
    correct: 'Revenue from operations − Gross profit',
    wrong: [
      ['Revenue from operations + Gross profit', 'Added the gross profit instead of deducting it.'],
      ['Revenue from operations − Net profit', 'Deducted the net profit; the operating and other expenses are not part of this cost.'],
      ['Gross profit − Operating expenses', 'That gives the operating profit.'],
    ],
    explanation: 'Gross profit = Revenue from operations − Cost of revenue from operations, so the cost is revenue less gross profit.',
  },
  {
    prompt: 'The average collection period in days is:',
    correct: 'Number of days in the year ÷ Trade receivables turnover ratio',
    wrong: [
      ['Trade receivables turnover ratio ÷ Number of days in the year', 'Turned the formula upside down.'],
      ['Number of days in the year × Trade receivables turnover ratio', 'Multiplied instead of dividing.'],
      ['Number of days in the year ÷ Trade payables turnover ratio', 'That is the average payment period.'],
    ],
    explanation: 'Average collection period = Days (or months) in the year ÷ Trade receivables turnover ratio.',
  },
  {
    prompt: 'A company turned its inventory over 8 times last year and 5 times this year, with the same level of revenue. What does this suggest?',
    correct: 'Inventory is moving more slowly: more is being held for the same sales',
    wrong: [
      ['Inventory is moving faster', 'Read a fall in the ratio as an improvement; fewer turns mean slower movement.'],
      ['The gross profit ratio has fallen', 'The turnover ratio says nothing about the margin.'],
      ['The company can pay its short-term debts more easily', 'Slow-moving inventory ties up funds; it does not make payment easier.'],
    ],
    explanation: 'A lower inventory turnover ratio means inventory is sold and replaced fewer times: slower movement or over-stocking.',
  },
  {
    prompt: 'A higher trade receivables turnover ratio means:',
    correct: 'customers are paying faster: a shorter collection period',
    wrong: [
      ['customers are paying more slowly', 'Read the ratio the wrong way round; more turns mean quicker collection.'],
      ['a larger part of revenue is on credit', 'The ratio compares credit revenue with receivables; it does not show the share of credit sales.'],
      ['the company is paying its suppliers faster', 'That is shown by the trade payables turnover ratio.'],
    ],
    explanation: 'The more times the receivables turn over in a year, the fewer days each rupee stays uncollected.',
  },
];

const activityTerms = mcqTemplate({
  id: 'ar-activity-terms', topicId: T, conceptId: 'ar-activity', difficulty: 'easy',
  generate: (rng) => fromBank(rng, ACTIVITY_BANK, H.activity),
});

// ===============================================================================================================
// Profitability ratios
// ===============================================================================================================

const grossProfitRatio = numericTemplate({
  id: 'ar-gross-profit-ratio', topicId: T, conceptId: 'ar-profitability', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const revenue = rng.step(400000, 4000000, 40000);
    const g = rng.pick([10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 37.5, 40]);
    const gp = (revenue * g) / 100;
    const cost = revenue - gp;
    const shape = rng.int(0, 2);
    if (shape === 0) {
      const n = typed('percent', g, [
        [(gp * 100) / cost, 'Took the gross profit as a percentage of cost; the ratio is on revenue from operations.'],
        [(cost * 100) / revenue, 'Gave the cost of revenue from operations as a percentage of revenue, not the gross profit.'],
      ]);
      return n && {
        prompt: withList(`Find the gross profit ratio of ${co} ${AS_PERCENT}.`, [[N.rev, revenue], [N.cost, cost]]),
        ...n,
        explanation: [`Gross profit = ${inr(revenue)} - ${inr(cost)} = ${inr(gp)}.`, `Gross profit ratio = Gross profit ÷ Revenue from operations x 100 = ${inr(gp)} ÷ ${inr(revenue)} x 100 = ${g}%.`],
        hints: H.profitability,
      };
    }
    if (shape === 1) {
      const cash = Math.floor((revenue * rng.pick([20, 25, 30, 40])) / 100 / 10000) * 10000;
      const credit = revenue - cash;
      const n = typed('percent', g, [
        [(gp * 100) / cost, 'Took the gross profit as a percentage of cost; the ratio is on revenue from operations.'],
        [(gp * 100) / credit, 'Took the gross profit on the credit revenue alone; the ratio is on the total revenue from operations.'],
        [(cost * 100) / revenue, 'Gave the cost of revenue from operations as a percentage of revenue, not the gross profit.'],
      ]);
      return n && {
        prompt: withList(`Find the gross profit ratio of ${co} ${AS_PERCENT}.`, [['Cash revenue from operations', cash], ['Credit revenue from operations', credit], [N.cost, cost]]),
        ...n,
        explanation: [
          `Revenue from operations = ${inr(cash)} + ${inr(credit)} = ${inr(revenue)}.`,
          `Gross profit = ${inr(revenue)} - ${inr(cost)} = ${inr(gp)}.`,
          `Gross profit ratio = ${inr(gp)} ÷ ${inr(revenue)} x 100 = ${g}%.`,
        ],
        hints: H.profitability,
      };
    }
    const most = Math.max(30000, Math.floor(revenue / 8 / 10000) * 10000);
    const opening = rng.step(20000, most, 10000);
    const closing = rng.step(20000, most, 10000);
    const direct = rng.step(5000, Math.max(5000, Math.floor(revenue / 20 / 5000) * 5000), 5000);
    const purchases = cost - opening + closing - direct;
    if (purchases <= 0) return null;
    const n = typed('percent', g, [
      [(gp * 100) / cost, 'Took the gross profit as a percentage of cost; the ratio is on revenue from operations.'],
      [((gp + direct) * 100) / revenue, 'Left the direct expenses out of the cost of revenue from operations.'],
      [((revenue - cost - closing) * 100) / revenue, 'Did not deduct the closing inventory in finding the cost of revenue from operations.'],
      [(cost * 100) / revenue, 'Gave the cost of revenue from operations as a percentage of revenue, not the gross profit.'],
    ]);
    return n && {
      prompt: withList(`Find the gross profit ratio of ${co} ${AS_PERCENT}.`, [[N.rev, revenue], [N.openInv, opening], [N.purchases, purchases], ['Direct expenses', direct], [N.closeInv, closing]]),
      ...n,
      explanation: [
        `Cost of revenue from operations = ${inr(opening)} + ${inr(purchases)} + ${inr(direct)} - ${inr(closing)} = ${inr(cost)}.`,
        `Gross profit = ${inr(revenue)} - ${inr(cost)} = ${inr(gp)}.`,
        `Gross profit ratio = ${inr(gp)} ÷ ${inr(revenue)} x 100 = ${g}%.`,
      ],
      hints: H.profitability,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const get = (name: string) => f.get(name) ?? 0;
    const revenue = get(N.rev) + get('Cash revenue from operations') + get('Credit revenue from operations');
    const cost = f.has(N.cost) ? get(N.cost) : get(N.openInv) + get(N.purchases) + get('Direct expenses') - get(N.closeInv);
    // In hundredths of a per cent: answer x revenue = gross profit x 10,000.
    return q.answer * revenue === (revenue - cost) * 10000;
  },
});

const netProfitRatio = numericTemplate({
  id: 'ar-net-profit-ratio', topicId: T, conceptId: 'ar-profitability', difficulty: 'easy', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const revenue = rng.step(500000, 5000000, 100000);
    const before = rng.pick([8, 10, 12, 12.5, 15, 16, 20]);
    const taxRate = rng.pick([20, 25, 30, 40]);
    const pbt = (revenue * before) / 100;
    const tax = (pbt * taxRate) / 100;
    const pat = pbt - tax;
    const gp = (revenue * (before + rng.pick([10, 12, 15, 20]))) / 100;
    const afterTax = rng.int(0, 1) === 0;
    const np = afterTax ? pat : pbt;
    const n = typed('percent', (np * 100) / revenue, [
      afterTax ? [(pbt * 100) / revenue, 'Used the profit before tax, although the ratio is asked on the profit after tax.'] : [(pat * 100) / revenue, 'Deducted the tax, although the ratio is asked on the profit before tax.'],
      [(gp * 100) / revenue, 'Used the gross profit: that is the gross profit ratio.'],
      [(np * 100) / gp, 'Divided the net profit by the gross profit instead of by the revenue from operations.'],
      [(tax * 100) / revenue, 'Gave the tax as a percentage of revenue.'],
    ]);
    return n && {
      prompt: withList(`Find the net profit ratio of ${co} on its net profit ${afterTax ? 'after' : 'before'} tax, ${AS_PERCENT}.`, [[N.rev, revenue], [N.gp, gp], [N.pbt, pbt], [N.tax, tax]]),
      ...n,
      explanation: [
        ...(afterTax ? [`Net profit after tax = ${inr(pbt)} - ${inr(tax)} = ${inr(pat)}.`] : []),
        `Net profit ratio = Net profit ${afterTax ? 'after' : 'before'} tax ÷ Revenue from operations x 100 = ${inr(np)} ÷ ${inr(revenue)} x 100 = ${two((np * 100) / revenue)}%.`,
      ],
      hints: H.profitability,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const np = (f.get(N.pbt) ?? 0) - (q.prompt.includes('after tax') ? (f.get(N.tax) ?? 0) : 0);
    return q.answer * (f.get(N.rev) ?? 0) === np * 10000;
  },
});

const OPERATING_EXPENSES = ['Employee benefits expense', 'Office and administrative expenses', 'Selling and distribution expenses', 'Depreciation and amortisation expense'];
const NON_OPERATING_EXPENSES = ['Interest on debentures', 'Loss on sale of machinery', 'Loss by fire'];
const NON_OPERATING_INCOMES = ['Interest received on investments', 'Dividend received', 'Profit on sale of land'];

/** A year's revenue, its operating cost at `ratio` per cent of it, and one to three non-operating items. */
function operations(rng: Rng) {
  const revenue = rng.step(400000, 4000000, 40000);
  const ratio = rng.pick([60, 65, 70, 72.5, 75, 77.5, 80, 82.5, 85, 87.5, 90]);
  const operatingCost = (revenue * ratio) / 100;
  const cost = Math.floor((operatingCost * rng.pick([65, 70, 75, 80])) / 100 / 5000) * 5000;
  const names = rng.shuffle(OPERATING_EXPENSES).slice(0, rng.int(2, 3));
  const parts = split(rng, operatingCost - cost, names.length, 1000);
  if (!parts) return null;
  const expenses = pair(names, parts);
  const otherExpenses: Line[] = rng.shuffle(NON_OPERATING_EXPENSES).slice(0, rng.int(1, 2)).map((name) => [name, rng.step(5000, 40000, 5000)]);
  const otherIncomes: Line[] = rng.int(0, 1) === 0 ? [[rng.pick(NON_OPERATING_INCOMES), rng.step(5000, 40000, 5000)]] : [];
  const out = sumOf(otherExpenses.map((r) => r[1]));
  const income = sumOf(otherIncomes.map((r) => r[1]));
  if (revenue - operatingCost - out + income <= 0) return null;
  return { revenue, ratio, operatingCost, cost, expenses, otherExpenses, otherIncomes, out, income, opex: operatingCost - cost };
}
const listOf = (rows: Line[]): string => {
  const list = rows.map((r) => lower(r[0]));
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
};
const operatingVerify = (prompt: string): { revenue: number; operatingCost: number } => {
  const f = figures(prompt);
  return { revenue: f.get(N.rev) ?? 0, operatingCost: (f.get(N.cost) ?? 0) + total(f, OPERATING_EXPENSES) };
};

const operatingRatio = numericTemplate({
  id: 'ar-operating-ratio', topicId: T, conceptId: 'ar-profitability', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = operations(rng);
    if (!s) return null;
    const pc = (v: number) => (v * 100) / s.revenue;
    const n = typed('percent', s.ratio, [
      [pc(s.operatingCost + s.out), `Counted ${listOf(s.otherExpenses)} as operating: ${s.otherExpenses.length === 1 ? 'it is a non-operating item' : 'they are non-operating items'}.`],
      [pc(s.opex), 'Left the cost of revenue from operations out of the operating cost.'],
      [pc(s.cost), 'Left the operating expenses out: only the cost of revenue from operations was taken.'],
      [100 - s.ratio, 'Gave the operating profit ratio: 100 less the operating ratio.'],
      s.income > 0 && [pc(s.operatingCost - s.income), `Deducted the ${listOf(s.otherIncomes)} from the operating cost; a non-operating income is left out altogether.`],
    ]);
    return n && {
      prompt: withList(`Find the operating ratio of ${co} ${AS_PERCENT}.`, [[N.rev, s.revenue], [N.cost, s.cost], ...rng.shuffle([...s.expenses, ...s.otherExpenses, ...s.otherIncomes])]),
      ...n,
      explanation: [
        adds('Operating expenses', s.expenses),
        `${cap(listOf([...s.otherExpenses, ...s.otherIncomes]))} ${s.otherExpenses.length + s.otherIncomes.length === 1 ? 'is a non-operating item and is' : 'are non-operating items and are'} left out.`,
        `Operating ratio = (Cost of revenue from operations + Operating expenses) ÷ Revenue from operations x 100 = (${inr(s.cost)} + ${inr(s.opex)}) ÷ ${inr(s.revenue)} x 100 = ${s.ratio}%.`,
      ],
      hints: H.profitability,
    };
  },
  verify: (q) => {
    const { revenue, operatingCost } = operatingVerify(q.prompt);
    return q.answer * revenue === operatingCost * 10000;
  },
});

const operatingProfitRatio = numericTemplate({
  id: 'ar-operating-profit-ratio', topicId: T, conceptId: 'ar-profitability', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = operations(rng);
    if (!s) return null;
    const pc = (v: number) => (v * 100) / s.revenue;
    const profit = s.revenue - s.operatingCost;
    const n = typed('percent', 100 - s.ratio, [
      [s.ratio, 'Gave the operating ratio; the operating profit ratio is 100 less the operating ratio.'],
      [pc(profit - s.out), `Deducted ${listOf(s.otherExpenses)} as well: ${s.otherExpenses.length === 1 ? 'it is a non-operating item' : 'they are non-operating items'}.`],
      [pc(s.revenue - s.cost), 'Gave the gross profit ratio: the operating expenses were not deducted.'],
      s.income > 0 && [pc(profit + s.income), `Added the ${listOf(s.otherIncomes)}, a non-operating income, to the operating profit.`],
      s.income > 0 && [pc(profit - s.out + s.income), 'Brought in every item: that is the net profit ratio, not the operating profit ratio.'],
    ]);
    return n && {
      prompt: withList(`Find the operating profit ratio of ${co} ${AS_PERCENT}.`, [[N.rev, s.revenue], [N.cost, s.cost], ...rng.shuffle([...s.expenses, ...s.otherExpenses, ...s.otherIncomes])]),
      ...n,
      explanation: [
        adds('Operating expenses', s.expenses),
        `Operating profit = Revenue from operations - Cost of revenue from operations - Operating expenses = ${inr(s.revenue)} - ${inr(s.cost)} - ${inr(s.opex)} = ${inr(profit)}.`,
        `${cap(listOf([...s.otherExpenses, ...s.otherIncomes]))} ${s.otherExpenses.length + s.otherIncomes.length === 1 ? 'is a non-operating item and is' : 'are non-operating items and are'} left out.`,
        `Operating profit ratio = ${inr(profit)} ÷ ${inr(s.revenue)} x 100 = ${100 - s.ratio}%.`,
      ],
      hints: H.profitability,
    };
  },
  verify: (q) => {
    const { revenue, operatingCost } = operatingVerify(q.prompt);
    // The two ratios add up to 100%: answer + operating ratio = 10,000 hundredths.
    return (10000 - q.answer) * revenue === operatingCost * 10000;
  },
});

const fromNet = keepFor<{ revenue: number; net: number; out: number; income: number; askRatio: boolean }>();

const operatingProfitFromNet = numericTemplate({
  id: 'ar-operating-profit-from-net', topicId: T, conceptId: 'ar-profitability', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const revenue = rng.step(400000, 4000000, 40000);
    const opr = rng.pick([10, 12.5, 15, 17.5, 20, 22.5, 25, 30]);
    const profit = (revenue * opr) / 100;
    const otherExpenses: Line[] = rng.shuffle(NON_OPERATING_EXPENSES).slice(0, rng.int(1, 2)).map((name) => [name, rng.step(5000, 40000, 5000)]);
    const otherIncomes: Line[] = rng.shuffle(NON_OPERATING_INCOMES).slice(0, rng.int(1, 2)).map((name) => [name, rng.step(5000, 40000, 5000)]);
    const out = sumOf(otherExpenses.map((r) => r[1]));
    const income = sumOf(otherIncomes.map((r) => r[1]));
    const net = profit - out + income;
    if (net <= 0 || out === income) return null;
    const askRatio = rng.int(0, 2) === 0;
    const pc = (v: number) => (v * 100) / revenue;
    const say = (rows: Line[]) => rows.map(([name, value]) => `${lower(name)} of ${inr(value)}`).join(' and ');
    const n = askRatio
      ? typed('percent', 100 - opr, [
          [opr, 'Gave the operating profit ratio; the operating ratio is 100 less it.'],
          [100 - pc(net), 'Deducted the net profit ratio from 100: the non-operating items were not taken out of the net profit first.'],
          [100 - pc(net + out), 'Added back the non-operating expenses but did not take out the non-operating incomes.'],
          [100 - pc(net - out + income), 'Adjusted the wrong way: deducted the non-operating expenses and added the non-operating incomes.'],
        ])
      : typed('percent', opr, [
          [pc(net), 'Gave the net profit ratio: the non-operating items were not taken out.'],
          [pc(net + out), 'Added back the non-operating expenses but did not take out the non-operating incomes.'],
          [pc(net - out + income), 'Adjusted the wrong way: deducted the non-operating expenses and added the non-operating incomes.'],
          [pc(net + out + income), 'Added the non-operating incomes as well; they have to be deducted.'],
          [100 - opr, 'Gave the operating ratio; the operating profit ratio is 100 less it.'],
        ]);
    const prompt = `${co} has revenue from operations of ${inr(revenue)} and a net profit before tax of ${inr(net)}. The net profit was arrived at after charging ${say(otherExpenses)}, and after crediting ${say(otherIncomes)}. Find the ${askRatio ? 'operating ratio' : 'operating profit ratio'} ${AS_PERCENT}.`;
    fromNet.keep(prompt, { revenue, net, out, income, askRatio });
    return n && {
      prompt,
      ...n,
      explanation: [
        `Operating profit = Net profit before tax + Non-operating expenses - Non-operating incomes = ${inr(net)} + ${inr(out)} - ${inr(income)} = ${inr(profit)}.`,
        `Operating profit ratio = ${inr(profit)} ÷ ${inr(revenue)} x 100 = ${opr}%.`,
        ...(askRatio ? [`Operating ratio = 100% - ${opr}% = ${100 - opr}%.`] : []),
      ],
      hints: ['Start from the net profit and undo every item that is not from operations.', 'Operating profit = Net profit + Non-operating expenses - Non-operating incomes; operating ratio = 100% - operating profit ratio.'],
    };
  },
  verify: (q) => {
    const s = fromNet.of(q.prompt);
    if (!s) return false;
    // Through the operating cost: revenue less net profit is every cost net of other incomes; take the non-operating items out of it.
    const operatingCost = s.revenue - s.net - s.out + s.income;
    return (s.askRatio ? q.answer : 10000 - q.answer) * s.revenue === operatingCost * 10000;
  },
});

/** A capital employed that earns `roi` per cent before interest and tax, part of it borrowed on debentures. */
function investment(rng: Rng) {
  const ce = rng.step(1000000, 6000000, 200000);
  const roi = rng.pick([10, 12, 12.5, 15, 16, 18, 20, 22.5, 24, 25]);
  const pbit = (ce * roi) / 100;
  const debentures = rng.step(200000, Math.floor(ce / 2 / 100000) * 100000, 100000);
  const rate = rng.pick([8, 9, 10, 12]);
  const interest = (debentures * rate) / 100;
  const pbt = pbit - interest;
  const taxRate = rng.pick([20, 25, 30, 40]);
  const tax = (pbt * taxRate) / 100;
  return { ce, roi, pbit, debentures, rate, interest, pbt, taxRate, tax, pat: pbt - tax, equity: ce - debentures };
}

const returnOnInvestment = numericTemplate({
  id: 'ar-return-on-investment', topicId: T, conceptId: 'ar-profitability', difficulty: 'medium', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = investment(rng);
    const owners = equityLines(rng, s.equity, 100000);
    if (!owners || !Number.isInteger(s.tax)) return null;
    const pc = (profit: number, base: number) => (profit * 100) / base;
    const debentureLine: Line = [`${s.rate}% Debentures`, s.debentures];
    if (rng.int(0, 2) > 0) {
      const n = typed('percent', s.roi, [
        [pc(s.pbt, s.ce), 'Did not add back the interest on the debentures: the return is on the profit before interest and tax.'],
        [pc(s.pbit, s.equity), "Divided by the shareholders' funds alone; the debentures are part of the capital employed."],
        [pc(s.pbt, s.equity), "Left the interest out of the profit and the debentures out of the capital employed."],
        [pc(s.pbit, s.ce + s.interest), 'Added the interest to the capital employed as well as to the profit.'],
      ]);
      return n && {
        prompt: withList(`Find the return on investment of ${co} ${AS_PERCENT}. The debentures were outstanding throughout the year, and the interest on them has been charged in arriving at the net profit before tax.`, [[N.pbt, s.pbt], ...owners, debentureLine]),
        ...n,
        explanation: [
          `Interest on debentures = ${s.rate}% of ${inr(s.debentures)} = ${inr(s.interest)}.`,
          `Profit before interest and tax = ${inr(s.pbt)} + ${inr(s.interest)} = ${inr(s.pbit)}.`,
          `Capital employed = Shareholders' funds + Non-current liabilities = ${inr(s.equity)} + ${inr(s.debentures)} = ${inr(s.ce)}.`,
          `Return on investment = ${inr(s.pbit)} ÷ ${inr(s.ce)} x 100 = ${s.roi}%.`,
        ],
        hints: H.roi,
      };
    }
    const n = typed('percent', s.roi, [
      [pc(s.pat, s.ce), 'Used the profit after tax; the return is on the profit before interest and tax.'],
      [pc(s.pbt, s.ce), 'Added back the tax but not the interest.'],
      [pc(s.pat + s.interest, s.ce), 'Added back the interest but not the tax.'],
      [pc(s.pbit, s.equity), "Divided by the shareholders' funds alone; the long-term borrowings are part of the capital employed."],
    ]);
    return n && {
      prompt: withList(`Find the return on investment of ${co} ${AS_PERCENT}.`, [[N.pat, s.pat], [N.tax, s.tax], ['Interest on long-term borrowings', s.interest], ...owners, [N.ltb, s.debentures]]),
      ...n,
      explanation: [
        `Profit before interest and tax = ${inr(s.pat)} + ${inr(s.tax)} + ${inr(s.interest)} = ${inr(s.pbit)}.`,
        `Capital employed = Shareholders' funds + Non-current liabilities = ${inr(s.equity)} + ${inr(s.debentures)} = ${inr(s.ce)}.`,
        `Return on investment = ${inr(s.pbit)} ÷ ${inr(s.ce)} x 100 = ${s.roi}%.`,
      ],
      hints: H.roi,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const get = (name: string) => f.get(name) ?? 0;
    const debentures = [...f].find(([label]) => /% Debentures$/.test(label));
    const interest = debentures ? (debentures[1] * Number(/^(\d+)%/.exec(debentures[0])?.[1])) / 100 : get('Interest on long-term borrowings');
    const pbit = get(N.pbt) + get(N.pat) + get(N.tax) + interest;
    return q.answer * (total(f, EQUITY) + total(f, isDebt)) === pbit * 10000;
  },
});

const returnOnInvestmentAssets = numericTemplate({
  id: 'ar-return-on-investment-assets', topicId: T, conceptId: 'ar-profitability', difficulty: 'complex', unit: 'percent',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = investment(rng);
    if (!Number.isInteger(s.tax) || s.pat % 100 !== 0) return null;
    const cl = rng.step(100000, 600000, 20000);
    const wc = rng.step(100000, Math.floor(s.ce / 3 / 20000) * 20000, 20000);
    const ca = cl + wc;
    const nca = s.ce - wc;
    const intangible = rng.int(0, 1) === 0 ? rng.step(50000, 300000, 50000) : 0;
    const fixed: Line[] = [[N.ppe, nca - intangible], ...(intangible > 0 ? [[N.intangible, intangible] as Line] : [])];
    const pc = (profit: number, base: number) => (profit * 100) / base;
    const n = typed('percent', s.roi, [
      [pc(s.pat, s.ce), 'Used the profit after tax; the return is on the profit before interest and tax.'],
      [pc(s.pbt, s.ce), 'Found the profit before tax but did not add the interest back.'],
      [pc(s.pat + s.interest, s.ce), 'Added back the interest but not the tax.'],
      [pc(s.pbit, nca + ca), 'Divided by the total assets: the current liabilities were not deducted to reach the capital employed.'],
      [pc(s.pbit, s.equity), "Deducted the debentures from the capital employed: that leaves the shareholders' funds."],
    ]);
    return n && {
      prompt: withList(
        `Find the return on investment of ${co} ${AS_PERCENT}. Tax is ${s.taxRate}% of the profit before tax, and the debentures were outstanding throughout the year.`,
        [[N.pat, s.pat], [`${s.rate}% Debentures`, s.debentures], ...fixed, [N.ca, ca], [N.cl, cl]],
      ),
      ...n,
      explanation: [
        `Profit before tax = ${inr(s.pat)} x 100 ÷ ${100 - s.taxRate} = ${inr(s.pbt)}.`,
        `Interest on debentures = ${s.rate}% of ${inr(s.debentures)} = ${inr(s.interest)}; profit before interest and tax = ${inr(s.pbt)} + ${inr(s.interest)} = ${inr(s.pbit)}.`,
        `Capital employed = Non-current assets + Working capital = ${inr(nca)} + (${inr(ca)} - ${inr(cl)}) = ${inr(s.ce)}.`,
        `Return on investment = ${inr(s.pbit)} ÷ ${inr(s.ce)} x 100 = ${s.roi}%.`,
      ],
      hints: H.roi,
    };
  },
  verify: (q) => {
    const f = figures(q.prompt);
    const [label, debentures] = [...f].find(([name]) => /% Debentures$/.test(name)) ?? ['', 0];
    const interest = (debentures * Number(/^(\d+)%/.exec(label)?.[1])) / 100;
    const taxRate = percentsIn(q.prompt.split('\n')[0])[0];
    const ce = total(f, NON_CURRENT_ASSETS) + total(f, CURRENT_ASSETS) - total(f, CURRENT_LIABILITIES);
    // Worked forwards from the answer: the profit before interest and tax it implies, less interest and tax, is the profit after tax.
    const pbt = (q.answer * ce) / 10000 - interest;
    return near(pbt - (pbt * taxRate) / 100, f.get(N.pat) ?? 0);
  },
});

const PROFITABILITY_BANK: BankItem[] = [
  {
    prompt: 'The gross profit ratio is worked out as:',
    correct: 'Gross profit ÷ Revenue from operations × 100',
    wrong: [
      ['Gross profit ÷ Cost of revenue from operations × 100', 'Took the gross profit on cost; the ratio is on revenue from operations.'],
      ['Net profit ÷ Revenue from operations × 100', 'Gave the net profit ratio.'],
      ['Revenue from operations ÷ Gross profit × 100', 'Turned the ratio upside down.'],
      ['Cost of revenue from operations ÷ Revenue from operations × 100', 'Gave the cost, not the profit, as a percentage of revenue.'],
    ],
    explanation: 'Gross profit ratio = Gross profit ÷ Revenue from operations × 100.',
  },
  {
    prompt: 'The operating ratio is worked out as:',
    correct: '(Cost of revenue from operations + Operating expenses) ÷ Revenue from operations × 100',
    wrong: [
      ['Operating expenses ÷ Revenue from operations × 100', 'Left out the cost of revenue from operations.'],
      ['Operating profit ÷ Revenue from operations × 100', 'Gave the operating profit ratio.'],
      ['Cost of revenue from operations ÷ Revenue from operations × 100', 'Left out the operating expenses.'],
      ['(Cost of revenue from operations + All expenses) ÷ Revenue from operations × 100', 'Counted the non-operating expenses too.'],
    ],
    explanation: 'Operating ratio = (Cost of revenue from operations + Operating expenses) ÷ Revenue from operations × 100.',
  },
  {
    prompt: 'The operating ratio of a company is 82%. What is its operating profit ratio?',
    correct: '18%',
    wrong: [
      ['82%', 'Took the two ratios to be the same; they add up to 100%.'],
      ['118%', 'Added 100 to the operating ratio instead of taking it from 100.'],
      ['It cannot be found without the revenue from operations', 'The two ratios always add up to 100%, whatever the revenue.'],
    ],
    explanation: 'Operating profit ratio = 100% − Operating ratio = 100% − 82% = 18%.',
  },
  {
    prompt: 'Return on investment (return on capital employed) is worked out as:',
    correct: 'Profit before interest and tax ÷ Capital employed × 100',
    wrong: [
      ['Profit after tax ÷ Capital employed × 100', 'Used the profit after tax; the return on all long-term funds is before interest and tax.'],
      ["Profit before interest and tax ÷ Shareholders' funds × 100", "Divided by the shareholders' funds alone; the long-term borrowings are also employed."],
      ['Profit before interest and tax ÷ Revenue from operations × 100', 'Divided by revenue; the return is on capital employed.'],
      ['Capital employed ÷ Profit before interest and tax × 100', 'Turned the ratio upside down.'],
    ],
    explanation: "Return on investment = Profit before interest and tax ÷ Capital employed × 100, where capital employed = shareholders' funds + non-current liabilities.",
  },
  {
    prompt: 'Why is interest on long-term borrowings added back to the profit in working out the return on investment?',
    correct: 'Capital employed includes the borrowed funds, so the return must be the profit before paying for them',
    wrong: [
      ['Interest is not really an expense', 'Interest is an expense; it is added back only because this ratio measures the return on all long-term funds.'],
      ['Interest is paid out of capital', 'Interest is paid out of profit, not out of capital.'],
      ['Tax is worked out on the interest', 'Tax has nothing to do with the reason; the base, capital employed, includes the borrowings.'],
    ],
    explanation: 'The denominator holds the funds of both the owners and the long-term lenders. The numerator must then be the profit earned for both: before interest and tax.',
  },
  {
    prompt: 'Operating profit can be found from net profit before tax as:',
    correct: 'Net profit before tax + Non-operating expenses − Non-operating incomes',
    wrong: [
      ['Net profit before tax − Non-operating expenses + Non-operating incomes', 'Adjusted the wrong way round: expenses already deducted are added back and incomes already added are taken out.'],
      ['Net profit before tax + Non-operating expenses + Non-operating incomes', 'Added the non-operating incomes instead of taking them out.'],
      ['Net profit before tax + Operating expenses', 'Added back the operating expenses, which belong in the operating profit.'],
    ],
    explanation: 'Net profit is after non-operating expenses and incomes. Undo them: add back the expenses, take out the incomes.',
  },
  {
    prompt: 'The gross profit of a company is 25% on cost. What is its gross profit ratio?',
    correct: '20%',
    wrong: [
      ['25%', 'Took the percentage on cost as the ratio; the ratio is on revenue from operations.'],
      ['33.33%', 'Worked the other way: a ratio of 25% on revenue is 33.33% on cost.'],
      ['75%', 'Gave the cost as a percentage of a revenue that was taken as 100 with a profit of 25.'],
    ],
    explanation: 'If cost is 100, gross profit is 25 and revenue is 125. Gross profit ratio = 25 ÷ 125 × 100 = 20%.',
  },
  {
    prompt: 'Which pair of ratios always adds up to 100%?',
    correct: 'Operating ratio and operating profit ratio',
    wrong: [
      ['Gross profit ratio and net profit ratio', 'Both are profit margins; the gap between them is the expenses, and they do not add up to 100%.'],
      ['Gross profit ratio and operating ratio', 'The operating ratio already holds the cost of revenue from operations; its partner is the operating profit ratio.'],
      ['Net profit ratio and operating ratio', 'Non-operating items stand between the two, so they do not add up to 100%.'],
    ],
    explanation: 'Revenue from operations = operating cost + operating profit, so operating ratio + operating profit ratio = 100%.',
  },
  {
    prompt: 'The net profit ratio is worked out as:',
    correct: 'Net profit ÷ Revenue from operations × 100',
    wrong: [
      ['Net profit ÷ Capital employed × 100', 'Divided by capital employed; this ratio is on revenue from operations.'],
      ['Net profit ÷ Gross profit × 100', 'Divided by the gross profit instead of by revenue.'],
      ['Gross profit ÷ Revenue from operations × 100', 'Gave the gross profit ratio.'],
      ['Revenue from operations ÷ Net profit × 100', 'Turned the ratio upside down.'],
    ],
    explanation: 'Net profit ratio = Net profit ÷ Revenue from operations × 100. It may be taken on the profit before tax or after tax, as the question says.',
  },
];

const profitabilityTerms = mcqTemplate({
  id: 'ar-profitability-terms', topicId: T, conceptId: 'ar-profitability', difficulty: 'easy',
  generate: (rng) => {
    const form = rng.int(0, 5);
    const opFact = (name: string) => `${lower(name)} ${name.startsWith('Office') || name.startsWith('Selling') ? 'are' : 'is'} an operating expense: a cost of running the main business`;
    const nonOpFact = (name: string) => `${lower(name)} is a non-operating expense, not a cost of running the main business`;
    if (form === 0) {
      const right = rng.pick(NON_OPERATING_EXPENSES);
      return choice(
        'Which of these is NOT an operating expense?',
        right,
        rng.shuffle(OPERATING_EXPENSES).slice(0, 3).map((name) => [name, `Mixed up the classes: ${opFact(name)}.`]),
        `${cap(nonOpFact(right))}. It is left out of the operating ratio.`,
        H.profitability,
      );
    }
    if (form === 1) {
      const right = rng.pick(OPERATING_EXPENSES);
      return choice(
        'Which of these is an operating expense, counted in the operating ratio?',
        right,
        [...NON_OPERATING_EXPENSES.map((name): [string, string] => [name, `Mixed up the classes: ${nonOpFact(name)}.`]), ['Dividend received', 'Picked an income, and a non-operating one; it is not an expense at all.']],
        `${cap(opFact(right))}.`,
        H.profitability,
      );
    }
    return fromBank(rng, PROFITABILITY_BANK, H.profitability);
  },
});

// ===============================================================================================================
// The effect of a transaction on a ratio ("state with reason whether the ratio will improve, decline or not change")
// ===============================================================================================================

/** What a transaction does to the totals the ratios are built from, in rupees (a fall is negative). */
export interface Eff {
  ca: number;
  quick: number;
  cl: number;
  nca: number;
  debt: number;
  equity: number;
}
const E = (ca = 0, quick = 0, cl = 0, nca = 0, debt = 0, equity = 0): Eff => ({ ca, quick, cl, nca, debt, equity });

/**
 * A transaction: what the company did (read after "The company ..."), what it really does to the totals, the reason
 * in words, and the ways students misread it, each as the effect the misreading supposes and the mistake it is.
 */
export interface Deal {
  text: string;
  eff: Eff;
  note: string;
  /** The third item is the mistake as it is told when the question is on the quick ratio, where it is another one. */
  slips: [eff: Eff, why: string, whyForQuick?: string][];
}

export const DEALS = {
  creditPurchase: (x: number): Deal => ({
    text: `purchased goods for ${inr(x)} on credit`,
    eff: E(x, 0, x),
    note: `Inventories, a current asset but not a quick asset, rise by ${inr(x)}, and trade payables, a current liability, rise by the same amount.`,
    slips: [
      [E(x, x, x), 'Counted the inventories as a quick asset.'],
      [E(x, 0, 0), 'Saw the inventories come in and missed that trade payables, a current liability, rise by the same amount.'],
      [E(0, 0, x), 'Saw only the trade payables rise and missed the inventories on the assets side.'],
    ],
  }),
  cashPurchase: (x: number): Deal => ({
    text: `purchased goods for ${inr(x)} and paid for them by cheque`,
    eff: E(0, -x, 0),
    note: `Cash at bank falls by ${inr(x)} and inventories rise by ${inr(x)}: the total of current assets is unchanged, but quick assets fall, because inventories are not a quick asset.`,
    slips: [
      [E(), 'Counted the inventories as a quick asset, so cash turning into inventories seemed to change nothing.'],
      [E(-x, -x, 0), 'Saw the cash go out and missed that inventories, also a current asset, rise by the same amount.'],
      [E(x, 0, 0), 'Saw the inventories come in and missed the cash paid for them.'],
      [E(x, 0, x), 'Read it as a purchase on credit; the goods were paid for, so nothing is owed.'],
    ],
  }),
  payCreditors: (x: number): Deal => ({
    text: `paid ${inr(x)} to its trade payables by cheque`,
    eff: E(-x, -x, -x),
    note: `Cash at bank, a current asset and a quick asset, falls by ${inr(x)}, and trade payables, a current liability, fall by the same amount.`,
    slips: [
      [E(-x, -x, 0), 'Saw the cash go out and missed that trade payables, a current liability, fall by the same amount.'],
      [E(0, 0, -x), 'Saw only the trade payables fall and missed the cash paid out.'],
    ],
  }),
  collectDebtors: (x: number): Deal => ({
    text: `received ${inr(x)} by cheque from its trade receivables`,
    eff: E(),
    note: `Cash at bank rises by ${inr(x)} and trade receivables fall by ${inr(x)}. Both are current assets and quick assets, so neither total changes.`,
    slips: [
      [E(x, x, 0), 'Saw the cash come in and missed that trade receivables fall by the same amount.'],
      [E(-x, -x, 0), 'Saw the trade receivables fall and missed the cash received.'],
    ],
  }),
  sellMachinery: (x: number): Deal => ({
    text: `sold machinery at its book value of ${inr(x)} and received the amount by cheque`,
    eff: E(x, x, 0, -x),
    note: `Cash at bank, a current asset, rises by ${inr(x)}. Machinery is a non-current asset, so it leaves the current items alone; total assets stay the same.`,
    slips: [
      [E(), 'Treated the machinery as a current asset, so one current asset seemed to replace another.', 'Treated the machinery as a quick asset, so one quick asset seemed to replace another; machinery is a non-current asset.'],
      [E(x, x, 0, 0), 'Saw the cash come in and missed that machinery of the same value leaves the books.'],
      [E(0, 0, 0, -x), 'Saw the machinery leave and missed the cash received for it.'],
    ],
  }),
  buyMachinery: (x: number): Deal => ({
    text: `purchased machinery for ${inr(x)} and paid by cheque`,
    eff: E(-x, -x, 0, x),
    note: `Cash at bank, a current asset, falls by ${inr(x)}. Machinery is a non-current asset, so no other current item changes; total assets stay the same.`,
    slips: [
      [E(), 'Treated the machinery as a current asset, so one current asset seemed to replace another.', 'Treated the machinery as a quick asset, so one quick asset seemed to replace another; machinery is a non-current asset.'],
      [E(-x, -x, 0, 0), 'Saw the cash go out and missed that machinery of the same value comes in.'],
      [E(0, 0, 0, x), 'Saw the machinery come in and missed the cash paid for it.'],
    ],
  }),
  machineryOnLoan: (x: number): Deal => ({
    text: `purchased machinery for ${inr(x)}, paid for out of a five-year loan taken from a bank for the purpose`,
    eff: E(0, 0, 0, x, x, 0),
    note: `Machinery, a non-current asset, rises by ${inr(x)} and long-term borrowings rise by ${inr(x)}. No current item changes.`,
    slips: [
      [E(0, 0, x, x, 0, 0), 'Took the five-year loan as a current liability; it is a long-term borrowing.'],
      [E(x, 0, 0, 0, x, 0), 'Treated the machinery as a current asset; it is a non-current asset.'],
      [E(0, 0, 0, x, 0, x), "Took the bank loan as part of the shareholders' funds; it is borrowed money."],
    ],
  }),
  issueShares: (x: number): Deal => ({
    text: `issued equity shares and received ${inr(x)} for them by cheque`,
    eff: E(x, x, 0, 0, 0, x),
    note: `Cash at bank rises by ${inr(x)} and share capital, part of the shareholders' funds, rises by ${inr(x)}. No liability changes.`,
    slips: [
      [E(x, x, x), "Took share capital as a current liability; it is part of the shareholders' funds."],
      [E(x, x, 0, 0, x, 0), "Took share capital as debt; it is the owners' money."],
      [E(0, 0, 0, 0, 0, x), 'Saw the share capital rise and missed the cash received.'],
    ],
  }),
  issueDebentures: (x: number): Deal => ({
    text: `issued 9% debentures and received ${inr(x)} for them by cheque`,
    eff: E(x, x, 0, 0, x, 0),
    note: `Cash at bank rises by ${inr(x)} and debentures, a long-term borrowing, rise by ${inr(x)}. No current liability changes.`,
    slips: [
      [E(x, x, x), 'Took the debentures as a current liability; they are long-term borrowings.'],
      [E(x, x, 0, 0, 0, x), "Took the debentures as part of the shareholders' funds; debentureholders are lenders."],
      [E(0, 0, 0, 0, x, 0), 'Saw the debentures rise and missed the cash received.'],
    ],
  }),
  repayLoan: (x: number): Deal => ({
    text: `repaid ${inr(x)} of a long-term bank loan by cheque`,
    eff: E(-x, -x, 0, 0, -x, 0),
    note: `Cash at bank falls by ${inr(x)} and long-term borrowings fall by ${inr(x)}. No current liability changes.`,
    slips: [
      [E(-x, -x, -x), 'Took the long-term loan as a current liability.'],
      [E(0, 0, 0, 0, -x, 0), 'Saw the loan fall and missed the cash paid out.'],
      [E(-x, -x, 0, 0, 0, -x), "Took the repayment as a fall in the shareholders' funds; repaying a loan is not an expense."],
    ],
  }),
  convertDebentures: (x: number): Deal => ({
    text: `converted 9% debentures of ${inr(x)} into equity shares`,
    eff: E(0, 0, 0, 0, -x, x),
    note: `Debentures, a long-term borrowing, fall by ${inr(x)} and share capital rises by ${inr(x)}. No asset and no current liability changes.`,
    slips: [
      [E(), "Thought one long-term source simply replaces another, so nothing changes; debt falls and the shareholders' funds rise."],
      [E(0, 0, 0, 0, -x, 0), 'Saw the debentures go and missed the share capital issued in their place.'],
      [E(0, 0, 0, 0, 0, x), 'Saw the share capital rise and missed that the debentures are cancelled.'],
    ],
  }),
  shortLoan: (x: number): Deal => ({
    text: `took a loan of ${inr(x)} from a bank, repayable in six months`,
    eff: E(x, x, x),
    note: `Cash at bank rises by ${inr(x)} and short-term borrowings, a current liability, rise by ${inr(x)}. A six-month loan is not debt for the solvency ratios.`,
    slips: [
      [E(x, x, 0, 0, x, 0), 'Took the six-month loan as long-term debt; it is a short-term borrowing, a current liability.'],
      [E(x, x, 0), 'Saw the cash come in and missed the new current liability.'],
      [E(x, x, 0, 0, 0, x), "Took the borrowed money as an addition to the shareholders' funds."],
    ],
  }),
  endorseBill: (x: number): Deal => ({
    text: `endorsed a bill receivable of ${inr(x)} to a creditor in settlement of that amount owed`,
    eff: E(-x, -x, -x),
    note: `Bills receivable, part of trade receivables, fall by ${inr(x)}, and trade payables fall by the same amount.`,
    slips: [
      [E(-x, -x, 0), 'Saw the bill receivable go and missed that the creditor is paid off by it.'],
      [E(0, 0, -x), 'Saw the creditor paid off and missed that the bill receivable, a current asset, is given up.'],
    ],
  }),
  payOutstanding: (x: number): Deal => ({
    text: `paid by cheque outstanding wages of ${inr(x)}, which stood among its other current liabilities`,
    eff: E(-x, -x, -x),
    note: `Cash at bank falls by ${inr(x)} and the outstanding wages, a current liability, are cleared. The expense was charged when the wages were recorded as outstanding.`,
    slips: [
      [E(-x, -x, 0, 0, 0, -x), 'Took the payment as a new expense; the wages were charged earlier, and paying them clears a current liability.'],
      [E(0, 0, -x), 'Saw the liability cleared and missed the cash paid out.'],
    ],
  }),
  sellGoodsProfit: (x: number, y: number): Deal => ({
    text: `sold goods costing ${inr(x)} for ${inr(x + y)} in cash`,
    eff: E(y, x + y, 0, 0, 0, y),
    note: `Cash rises by ${inr(x + y)} and inventories fall by ${inr(x)}: current assets rise by the profit of ${inr(y)}, and quick assets by the whole ${inr(x + y)}. The profit adds to reserves and surplus.`,
    slips: [
      [E(), 'Thought one current asset replaces another at the same value, and missed the profit.', 'Counted the inventories as a quick asset, so goods turning into cash seemed to change nothing; quick assets rise by the whole of the cash received.'],
      [E(-x, 0, 0), 'Saw the inventories leave and missed the larger amount of cash received.'],
    ],
  }),
  sellGoodsLoss: (x: number, y: number): Deal => ({
    text: `sold goods costing ${inr(x)} for ${inr(x - y)} in cash`,
    eff: E(-y, x - y, 0, 0, 0, -y),
    note: `Cash rises by ${inr(x - y)} and inventories fall by ${inr(x)}: current assets fall by the loss of ${inr(y)}, but quick assets rise by ${inr(x - y)}, because inventories are not a quick asset.`,
    slips: [
      [E(), 'Thought one current asset replaces another at the same value, and missed the loss.', 'Counted the inventories as a quick asset, so goods turning into cash seemed to change nothing; quick assets rise by the whole of the cash received.'],
      [E(x - y, x - y, 0), 'Saw the cash come in and missed that inventories of a higher cost leave.'],
      [E(-y, -y, 0, 0, 0, -y), 'Carried the loss into the quick assets; inventories are not a quick asset, so quick assets rise by the whole of the cash received.'],
    ],
  }),
  prepay: (x: number): Deal => ({
    text: `paid ${inr(x)} by cheque as the insurance premium of the next year`,
    eff: E(0, -x),
    note: `Cash at bank falls by ${inr(x)} and prepaid expenses, a current asset, rise by ${inr(x)}: current assets are unchanged. Prepaid expenses are not a quick asset, so quick assets fall.`,
    slips: [
      [E(), 'Counted the prepaid expenses as a quick asset.'],
      [E(-x, -x), 'Saw the cash go out and missed that prepaid expenses, a current asset, rise by the same amount.'],
      [E(x, 0), 'Saw the prepaid expenses rise and missed the cash paid.'],
    ],
  }),
  depreciation: (x: number): Deal => ({
    text: `charged depreciation of ${inr(x)} on its machinery`,
    eff: E(0, 0, 0, -x, 0, -x),
    note: `Machinery, a non-current asset, falls by ${inr(x)}, and the profit, and with it reserves and surplus, falls by ${inr(x)}. No current item and no debt changes.`,
    slips: [
      [E(-x, -x, 0, 0, 0, -x), 'Thought depreciation is paid out in cash; it is a book entry against the fixed asset.'],
      [E(0, 0, x, 0, 0, -x), 'Took the accumulated depreciation as a current liability; it is deducted from the fixed asset.'],
      [E(), 'Thought an entry without cash cannot move a ratio; depreciation lowers the fixed asset and the profit.'],
    ],
  }),
  sharesForMachinery: (x: number): Deal => ({
    text: `purchased machinery for ${inr(x)} and paid the vendor by issuing equity shares`,
    eff: E(0, 0, 0, x, 0, x),
    note: `Machinery, a non-current asset, rises by ${inr(x)} and share capital rises by ${inr(x)}. No current item and no debt changes.`,
    slips: [
      [E(x, 0, 0, 0, 0, x), 'Treated the machinery as a current asset; it is a non-current asset.'],
      [E(0, 0, x, x, 0, 0), 'Took the amount due to the vendor as a current liability; it was settled at once in shares.'],
      [E(0, 0, 0, x, x, 0), 'Took the shares issued to the vendor as a borrowing.'],
      [E(-x, -x, 0, x), 'Thought the machinery was paid for in cash.'],
    ],
  }),
  badDebt: (x: number): Deal => ({
    text: `wrote off ${inr(x)} due from a customer as a bad debt; it had no provision for doubtful debts`,
    eff: E(-x, -x, 0, 0, 0, -x),
    note: `Trade receivables, a current asset and a quick asset, fall by ${inr(x)}, and the loss lowers reserves and surplus. No liability changes.`,
    slips: [
      [E(), 'Took the write-off as a book entry that changes nothing; trade receivables fall, and the loss lowers reserves and surplus.'],
      [E(-x, -x, -x), 'Mixed up trade receivables with trade payables: nothing owed by the company is cleared.'],
      [E(0, 0, 0, 0, 0, -x), 'Saw the loss and missed that trade receivables, a current asset, fall.'],
    ],
  }),
  fireLoss: (x: number): Deal => ({
    text: `lost inventories costing ${inr(x)} in a fire; they were not insured`,
    eff: E(-x, 0, 0, 0, 0, -x),
    note: `Inventories, a current asset, fall by ${inr(x)}, and the loss lowers reserves and surplus. No liability changes.`,
    slips: [
      [E(), 'Thought a loss without any payment leaves the assets as they were; the inventories are gone.'],
      [E(-x, -x, -x), 'Thought the amount owed for the goods is cancelled with them; the supplier still has to be paid.'],
    ],
  }),
  cashDeposit: (x: number): Deal => ({
    text: `deposited cash of ${inr(x)} into its bank account`,
    eff: E(),
    note: `Cash in hand falls by ${inr(x)} and cash at bank rises by ${inr(x)}. Both are cash and cash equivalents, so no total changes.`,
    slips: [
      [E(x, x), 'Saw the bank balance rise and missed that cash in hand falls by the same amount.'],
      [E(-x, -x), 'Saw the cash in hand fall and missed that the bank balance rises by the same amount.'],
    ],
  }),
  buyCurrentInvestments: (x: number): Deal => ({
    text: `bought marketable securities for ${inr(x)} by cheque, to be held as a current investment`,
    eff: E(),
    note: `Cash at bank falls by ${inr(x)} and current investments rise by ${inr(x)}. Both are current assets and quick assets, so neither total changes.`,
    slips: [
      [E(-x, -x), 'Took the securities as a non-current asset; held for the short term, they are a current investment.', 'Left the current investments out of the quick assets; only inventories and prepaid expenses are left out.'],
      [E(0, -x), 'Left the current investments out of the quick assets; only inventories and prepaid expenses are left out.'],
      [E(x, x), 'Saw the investment come in and missed the cash paid for it.'],
    ],
  }),
  transferReserve: (x: number): Deal => ({
    text: `transferred ${inr(x)} from the balance of its Statement of Profit and Loss to General Reserve`,
    eff: E(),
    note: `Both balances are part of reserves and surplus: ${inr(x)} moves from one to the other, and the shareholders' funds stay the same. No asset and no liability changes.`,
    slips: [
      [E(0, 0, 0, 0, 0, x), "Counted the transfer as new money in the shareholders' funds; both balances are inside reserves and surplus."],
      [E(0, 0, 0, 0, 0, -x), "Thought the transfer takes profit out of the shareholders' funds; the general reserve is part of them."],
    ],
  }),
  acceptBill: (x: number): Deal => ({
    text: `accepted a bill of exchange for ${inr(x)} drawn by a supplier to whom that amount was owed`,
    eff: E(),
    note: `The supplier's balance falls by ${inr(x)} and bills payable rise by ${inr(x)}. Both are trade payables, so current liabilities are unchanged.`,
    slips: [
      [E(0, 0, x), "Counted the bill payable as a new liability and missed that the supplier's balance falls by the same amount."],
      [E(0, 0, -x), "Saw the supplier's balance cleared and missed the bill payable that takes its place."],
    ],
  }),
  loanToPayCreditors: (x: number): Deal => ({
    text: `took a five-year loan of ${inr(x)} from a bank and used it at once to pay its trade payables`,
    eff: E(0, 0, -x, 0, x, 0),
    note: `Trade payables, a current liability, fall by ${inr(x)} and long-term borrowings rise by ${inr(x)}. The cash received is paid out at once, so no asset changes.`,
    slips: [
      [E(), 'Thought one liability simply replaces another; a current liability is replaced by a long-term borrowing.'],
      [E(x, x, 0, 0, x, 0), 'Stopped at the loan received and missed that the money was paid out to the trade payables.'],
      [E(-x, -x, -x), 'Saw the trade payables paid and missed that the cash came from the new loan.'],
    ],
  }),
} satisfies Record<string, (x: number, y: number) => Deal>;
export type DealKey = keyof typeof DEALS;

export interface Term {
  name: string;
  plural: boolean;
  of(e: Eff): number;
}
const TERM = {
  ca: { name: 'current assets', plural: true, of: (e: Eff) => e.ca },
  quick: { name: 'quick assets', plural: true, of: (e: Eff) => e.quick },
  cl: { name: 'current liabilities', plural: true, of: (e: Eff) => e.cl },
  debt: { name: 'debt', plural: false, of: (e: Eff) => e.debt },
  equity: { name: "shareholders' funds", plural: true, of: (e: Eff) => e.equity },
  assets: { name: 'total assets', plural: true, of: (e: Eff) => e.ca + e.nca },
} satisfies Record<string, Term>;

/** A ratio as a question on its movement sees it: its two terms, and the words for up, down and no change. */
export interface Spec {
  name: string;
  top: Term;
  bottom: Term;
  labels: [string, string, string];
  says: [string, string, string];
  ask: string;
  starts: number[];
  /** What the ratio is worked on, said in the prompt where textbooks differ: "shareholders' funds to total assets". */
  basis?: string;
}
const LIQUID = { labels: ['Improve', 'Decline', 'No change'], says: ['improves', 'declines', 'does not change'], ask: 'improve, decline or not change' } as const;
const SOLVENT = { labels: ['Increase', 'Decrease', 'No change'], says: ['increases', 'decreases', 'does not change'], ask: 'increase, decrease or not change' } as const;
const spec = (name: string, top: Term, bottom: Term, words: typeof LIQUID | typeof SOLVENT, starts: number[], basis?: string): Spec => ({
  name, top, bottom, labels: [...words.labels], says: [...words.says], ask: words.ask, starts, ...(basis ? { basis } : {}),
});
export const SPECS = {
  current: spec('current ratio', TERM.ca, TERM.cl, LIQUID, [150, 200, 250, 300]),
  currentLow: spec('current ratio', TERM.ca, TERM.cl, LIQUID, [100, 100, 80, 75, 50]),
  quick: spec('quick ratio', TERM.quick, TERM.cl, LIQUID, [150, 120, 100, 80, 75]),
  debtEquity: spec('debt to equity ratio', TERM.debt, TERM.equity, SOLVENT, [200, 150, 100, 75, 50]),
  assetsDebt: spec('total assets to debt ratio', TERM.assets, TERM.debt, SOLVENT, [200, 250, 300, 400]),
  proprietary: spec('proprietary ratio', TERM.equity, TERM.assets, SOLVENT, [40, 50, 60, 75], "shareholders' funds to total assets"),
};

/** Which way each term moves: [numerator, denominator] as -1, 0 or 1. Null when both move the same way by different amounts. */
function pattern(s: Spec, eff: Eff): [number, number] | null {
  const a = s.top.of(eff);
  const b = s.bottom.of(eff);
  if (a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b) && a !== b) return null;
  return [Math.sign(a), Math.sign(b)];
}
/** By rule: which way the ratio moves (1 up, -1 down, 0 not at all) for a movement of its terms and where it starts. */
function verdictOf(dn: number, dd: number, start: number): number {
  if (dn === 0 && dd === 0) return 0;
  if (dd === 0) return dn;
  if (dn === 0) return -dd;
  if (dn !== dd) return dn;
  // The same amount on both terms pulls a ratio towards 1 : 1 when added, and pushes it away when taken off.
  if (start === 100) return 0;
  return start > 100 ? -dn : dn;
}
/** By arithmetic, on figures of its own: the sign of the change in the ratio. Used to check `verdictOf`. */
export function movedBy(s: Spec, eff: Eff, start: number): number {
  const bottom = 2000000;
  const top = start * 20000;
  return Math.sign((top + s.top.of(eff)) * bottom - top * (bottom + s.bottom.of(eff)));
}
const at = (verdict: number): number => (verdict > 0 ? 0 : verdict < 0 ? 1 : 2);
const position = (start: number): string => (start > 100 ? 'above' : start < 100 ? 'below' : 'exactly');
const moves = (t: Term, d: number): string => `${t.name} ${d > 0 ? (t.plural ? 'rise' : 'rises') : t.plural ? 'fall' : 'falls'}`;
const stays = (t: Term): string => `${t.name} ${t.plural ? 'do' : 'does'} not change`;
function describe(s: Spec, dn: number, dd: number): string {
  if (dn === 0 && dd === 0) return `neither ${s.top.name} nor ${s.bottom.name} ${s.bottom.plural ? 'change' : 'changes'}`;
  if (dd === 0) return `${moves(s.top, dn)} and ${stays(s.bottom)}`;
  if (dn === 0) return `${moves(s.bottom, dd)} and ${stays(s.top)}`;
  if (dn === dd) return `${s.top.name} and ${s.bottom.name} both ${dn > 0 ? 'rise' : 'fall'} by the same amount`;
  return `${moves(s.top, dn)} and ${moves(s.bottom, dd)}`;
}
/** What is said of a movement as an option: the verdict, then what changes, then (when both terms move alike) where the ratio stands. */
function reading(s: Spec, dn: number, dd: number, start: number, verdict = verdictOf(dn, dd, start)): string {
  const tail = dn !== 0 && dn === dd ? `, and the ratio is ${position(start)} 1 : 1` : '';
  return `${s.labels[at(verdict)]}: ${describe(s, dn, dd)}${tail}`;
}

const FILLER: [string, string] = [
  'It cannot be said without the figures of the balance sheet',
  'The direction follows from which terms change and from whether the ratio is above or below 1 : 1; the figures themselves are not needed.',
];

/** The right reading of a transaction's effect on a ratio and the wrong ones; null when a reading cannot be put in words or too few wrong ones remain. */
export function effectOptions(s: Spec, deal: Deal, start: number): { correct: string; wrong: [string, string][]; verdict: number; why: string } | null {
  const p = pattern(s, deal.eff);
  if (!p) return null;
  const [dn, dd] = p;
  const verdict = verdictOf(dn, dd, start);
  const correct = reading(s, dn, dd, start);
  const wrong: [string, string][] = [];
  for (const [eff, why, whyForQuick] of deal.slips) {
    const q = pattern(s, eff);
    if (q && (q[0] !== dn || q[1] !== dd)) wrong.push([reading(s, q[0], q[1], start), s.top === TERM.quick && whyForQuick ? whyForQuick : why]);
  }
  if (dn !== 0 && dn === dd) {
    if (start === 100) {
      const why = 'Used the rule for a ratio that is not 1 : 1. At exactly 1 : 1 the two terms are equal, and an equal change leaves them equal.';
      wrong.push([reading(s, dn, dd, start, 1), why], [reading(s, dn, dd, start, -1), why]);
    } else {
      wrong.push([`${s.labels[2]}: ${describe(s, dn, dd)}`, 'An equal change in both terms leaves a ratio as it was only when the ratio is exactly 1 : 1.']);
      wrong.push([
        reading(s, dn, dd, start, -verdict),
        `Right about what changes, wrong about its effect: ${dn > 0 ? 'adding the same amount to' : 'taking the same amount from'} both terms ${verdict > 0 ? 'raises' : 'lowers'} a ratio that is ${position(start)} 1 : 1.`,
      ]);
    }
  } else if (verdict !== 0) {
    const cause = dn !== 0 && dd !== 0 ? `a ${dn > 0 ? 'larger' : 'smaller'} numerator over a ${dd > 0 ? 'larger' : 'smaller'} denominator` : dn !== 0 ? `a ${dn > 0 ? 'rise' : 'fall'} in the numerator` : `a ${dd > 0 ? 'rise' : 'fall'} in the denominator`;
    wrong.push([reading(s, dn, dd, start, -verdict), `Right about what changes, wrong about its effect: ${cause} ${verdict > 0 ? 'raises' : 'lowers'} the ratio.`]);
  }
  if (new Set(wrong.map((w) => w[0])).size < 3) wrong.push(FILLER);
  let why = `${deal.note} So ${describe(s, dn, dd)}${dn !== 0 && dn === dd ? `, and the ratio is ${position(start)} 1 : 1` : ''}: the ${s.name} ${s.says[at(verdict)]}.`;
  if (dn !== 0 && dn === dd) {
    // Figures to see it with: the terms before and after, for a ratio that starts where the question says.
    const bottom = 400000;
    const top = start * 4000;
    const [top2, bottom2] = [top + s.top.of(deal.eff), bottom + s.bottom.of(deal.eff)];
    why += ` For example, ${inr(top)} ÷ ${inr(bottom)} = ${dec(start)} : 1 becomes ${inr(top2)} ÷ ${inr(bottom2)} = ${two(top2 / bottom2)} : 1.`;
  }
  return { correct, wrong, verdict, why };
}

const effectKept = keepFor<{ spec: Spec; eff: Eff; start: number }>();
const dealOf = (rng: Rng, key: DealKey): Deal => {
  const x = rng.step(20000, 90000, 5000);
  return DEALS[key](x, rng.step(5000, 15000, 5000));
};

function effectTemplate(id: string, difficulty: 'medium' | 'complex', specs: Spec[], keys: DealKey[]) {
  return mcqTemplate({
    id, topicId: T, conceptId: 'ar-effect', difficulty,
    generate: (rng) => {
      const s = rng.pick(specs);
      const start = rng.pick(s.starts);
      const deal = dealOf(rng, rng.pick(keys));
      const o = effectOptions(s, deal, start);
      if (!o) return null;
      const prompt = `The ${s.name}${s.basis ? ` (${s.basis})` : ''} of ${rng.pick(COMPANIES)} is ${dec(start)} : 1. The company ${deal.text}. Will the ${s.name} ${s.ask}, and why?`;
      effectKept.keep(prompt, { spec: s, eff: deal.eff, start });
      return choice(prompt, o.correct, o.wrong, o.why, H.effect);
    },
    // The verdict was reached by rule; here it is checked by arithmetic on figures of its own.
    verify: (q) => {
      const kept = effectKept.of(q.prompt);
      return kept !== undefined && optionText(q).startsWith(`${kept.spec.labels[at(movedBy(kept.spec, kept.eff, kept.start))]}:`);
    },
  });
}

const CURRENT_DEALS: DealKey[] = [
  'creditPurchase', 'cashPurchase', 'payCreditors', 'collectDebtors', 'sellMachinery', 'buyMachinery', 'machineryOnLoan', 'issueShares', 'issueDebentures', 'repayLoan',
  'shortLoan', 'endorseBill', 'payOutstanding', 'sellGoodsProfit', 'sellGoodsLoss', 'prepay', 'depreciation', 'sharesForMachinery', 'badDebt', 'fireLoss',
  'cashDeposit', 'buyCurrentInvestments', 'acceptBill', 'loanToPayCreditors',
];
// At or below 1 : 1 the transactions that move both terms are the point, so they come up twice as often.
const CURRENT_LOW_DEALS: DealKey[] = [
  'creditPurchase', 'payCreditors', 'shortLoan', 'endorseBill', 'payOutstanding', 'creditPurchase', 'payCreditors', 'shortLoan', 'endorseBill', 'payOutstanding',
  'issueShares', 'buyMachinery', 'collectDebtors', 'sellGoodsProfit', 'loanToPayCreditors', 'cashPurchase', 'repayLoan', 'issueDebentures',
];
const QUICK_DEALS: DealKey[] = [
  'creditPurchase', 'cashPurchase', 'payCreditors', 'collectDebtors', 'shortLoan', 'sellGoodsProfit', 'sellGoodsLoss', 'prepay', 'buyCurrentInvestments', 'issueShares',
  'buyMachinery', 'endorseBill', 'badDebt', 'sellMachinery', 'payOutstanding',
];
const DEBT_EQUITY_DEALS: DealKey[] = [
  'machineryOnLoan', 'issueShares', 'issueDebentures', 'repayLoan', 'convertDebentures', 'shortLoan', 'sellGoodsProfit', 'depreciation', 'sharesForMachinery',
  'transferReserve', 'loanToPayCreditors', 'badDebt',
];
const OTHER_SOLVENCY_DEALS: DealKey[] = ['machineryOnLoan', 'issueShares', 'issueDebentures', 'repayLoan', 'convertDebentures', 'depreciation', 'sharesForMachinery', 'sellMachinery', 'buyMachinery'];

const effectCurrent = effectTemplate('ar-effect-current', 'medium', [SPECS.current], CURRENT_DEALS);
const effectCurrentLow = effectTemplate('ar-effect-current-at-or-below-one', 'complex', [SPECS.currentLow], CURRENT_LOW_DEALS);
const effectQuick = effectTemplate('ar-effect-quick', 'medium', [SPECS.quick], QUICK_DEALS);
const effectDebtEquity = effectTemplate('ar-effect-debt-equity', 'medium', [SPECS.debtEquity], DEBT_EQUITY_DEALS);
const effectOtherSolvency = effectTemplate('ar-effect-assets-debt-proprietary', 'complex', [SPECS.assetsDebt, SPECS.proprietary], OTHER_SOLVENCY_DEALS);

const whichKept = keepFor<{ spec: Spec; start: number; target: number; effs: Map<string, Eff> }>();

const effectWhich = mcqTemplate({
  id: 'ar-effect-which-transaction', topicId: T, conceptId: 'ar-effect', difficulty: 'medium',
  generate: (rng) => {
    const useDebt = rng.int(0, 3) === 0;
    const s = useDebt ? SPECS.debtEquity : rng.int(0, 2) === 0 ? SPECS.quick : SPECS.current;
    const start = rng.pick(s.starts);
    const target = rng.pick([1, 1, -1, -1, 0]);
    const keys = rng.shuffle([...new Set(useDebt ? DEBT_EQUITY_DEALS : s === SPECS.quick ? QUICK_DEALS : CURRENT_DEALS)]);
    const judged = keys.flatMap((key) => {
      const deal = dealOf(rng, key);
      const p = pattern(s, deal.eff);
      if (!p) return [];
      const verdict = verdictOf(p[0], p[1], start);
      const tail = p[0] !== 0 && p[0] === p[1] ? `, and the ratio is ${position(start)} 1 : 1` : '';
      return [{ deal, verdict, why: `${deal.note} So ${describe(s, p[0], p[1])}${tail}: the ${s.name} ${s.says[at(verdict)]}.` }];
    });
    const right = judged.find((j) => j.verdict === target);
    const others = judged.filter((j) => j.verdict !== target).slice(0, 3);
    if (!right || others.length < 3) return null;
    const goal = ['raise it', 'lower it', 'leave it unchanged'][at(target)];
    const prompt = `The ${s.name} of ${rng.pick(COMPANIES)} is ${dec(start)} : 1. Which one of these transactions will ${useDebt ? goal : ['improve it', 'make it decline', 'leave it unchanged'][at(target)]}?`;
    whichKept.keep(prompt, { spec: s, start, target, effs: new Map(judged.map((j) => [cap(j.deal.text), j.deal.eff])) });
    return choice(
      prompt,
      cap(right.deal.text),
      others.map((j) => [cap(j.deal.text), `Misjudged this one. ${j.why}`]),
      right.why,
      H.effect,
    );
  },
  // By arithmetic: the right option moves the ratio the way asked, and no other option does.
  verify: (q) => {
    const kept = whichKept.of(q.prompt);
    if (!kept) return false;
    return q.options.every((o) => {
      const eff = kept.effs.get(o.text);
      return eff !== undefined && (movedBy(kept.spec, eff, kept.start) === kept.target) === (o.id === q.correct);
    });
  },
});

const afterKept = keepFor<{ eff: Eff }>();

const effectNewRatio = numericTemplate({
  id: 'ar-effect-new-ratio', topicId: T, conceptId: 'ar-effect', difficulty: 'complex', unit: 'times',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const key = rng.pick<DealKey>(['payCreditors', 'creditPurchase', 'shortLoan', 'issueShares', 'buyMachinery', 'repayLoan', 'sellMachinery', 'loanToPayCreditors', 'endorseBill', 'issueDebentures']);
    const x = rng.step(20000, 100000, 10000);
    const deal = DEALS[key](x, 0);
    // The figures after the transaction are chosen so that the new ratio is exact; those before follow from them.
    const cl1 = rng.step(100000, 400000, 20000);
    const r1 = rng.pick([75, 80, 125, 150, 175, 200, 225, 250, 300]);
    const ca1 = (cl1 * r1) / 100;
    const ca0 = ca1 - deal.eff.ca;
    const cl0 = cl1 - deal.eff.cl;
    if (ca0 < 60000 || cl0 < 60000) return null;
    const n = typed('times', ca1 / cl1, [
      [ca0 / cl0, 'Gave the ratio before the transaction.'],
      deal.eff.ca !== 0 && deal.eff.cl !== 0 && [ca1 / cl0, 'Changed the current assets but left the current liabilities as they were.'],
      deal.eff.ca !== 0 && deal.eff.cl !== 0 && [ca0 / cl1, 'Changed the current liabilities but left the current assets as they were.'],
      ...deal.slips.map(([eff, why]): Err => [(ca0 + eff.ca) / (cl0 + eff.cl), why]),
      [cl1 / ca1, 'Divided the current liabilities by the current assets: the ratio is upside down.'],
    ]);
    const prompt = `${co} has current assets of ${inr(ca0)} and current liabilities of ${inr(cl0)}. The company then ${deal.text}. Find the current ratio after this transaction ${AS_RATIO}.`;
    afterKept.keep(prompt, { eff: deal.eff });
    const change = (d: number) => (d === 0 ? 'unchanged' : `${d > 0 ? '+' : '-'} ${inr(Math.abs(d))}`);
    return n && {
      prompt,
      ...n,
      explanation: [
        deal.note,
        `Current assets = ${inr(ca0)}${deal.eff.ca === 0 ? ', unchanged' : ` ${change(deal.eff.ca)} = ${inr(ca1)}`}; current liabilities = ${inr(cl0)}${deal.eff.cl === 0 ? ', unchanged' : ` ${change(deal.eff.cl)} = ${inr(cl1)}`}.`,
        `Current ratio = ${inr(ca1)} ÷ ${inr(cl1)} = ${dec(r1)} : 1 (before the transaction it was ${near((ca0 * 100) / cl0, Math.round((ca0 * 100) / cl0)) ? '' : 'about '}${two(ca0 / cl0)} : 1).`,
      ],
      hints: H.effect,
    };
  },
  verify: (q) => {
    const kept = afterKept.of(q.prompt);
    const [ca0, cl0] = amountsIn(q.prompt);
    return kept !== undefined && q.answer * (cl0 + kept.eff.cl) === (ca0 + kept.eff.ca) * 100;
  },
});

// ===============================================================================================================
// A missing figure from one or two ratios
// ===============================================================================================================

const missingFromWorkingCapital = numericTemplate({
  id: 'ar-missing-working-capital', topicId: T, conceptId: 'ar-missing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cl = rng.step(100000, 600000, 10000);
    const r = rng.pick([150, 175, 225, 250, 300, 350, 400]);
    const ca = (cl * r) / 100;
    const wc = ca - cl;
    const askAssets = rng.int(0, 1) === 0;
    const n = askAssets
      ? typed('rupees', ca, [
          [cl, 'Stopped at the current liabilities; the current assets were asked for.'],
          [(wc * r) / 100, 'Took the working capital as the current liabilities and multiplied it by the ratio.'],
          [wc + (wc * 100) / r, 'Divided the working capital by the ratio itself to find the current liabilities; it is divided by the ratio less 1.'],
        ])
      : typed('rupees', cl, [
          [ca, 'Gave the current assets; the current liabilities were asked for.'],
          [(wc * 100) / r, 'Divided the working capital by the ratio itself; it is divided by the ratio less 1.'],
          [wc, 'Took the working capital as the current liabilities.'],
        ]);
    return n && {
      prompt: `The current ratio of ${co} is ${dec(r)} : 1 and its working capital is ${inr(wc)}. Find its ${askAssets ? 'current assets' : 'current liabilities'}.`,
      ...n,
      explanation: [
        `If the current liabilities are x, the current assets are ${dec(r)}x and the working capital is ${dec(r)}x - x = ${dec(r - 100)}x.`,
        `${dec(r - 100)}x = ${inr(wc)}, so current liabilities x = ${inr(cl)}.`,
        ...(askAssets ? [`Current assets = ${dec(r)} x ${inr(cl)} = ${inr(ca)}.`] : []),
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const r = ratiosIn(q.prompt)[0];
    const wc = amountsIn(q.prompt)[0];
    const answer = q.answer / 100;
    const [ca, cl] = q.prompt.includes('Find its current assets') ? [answer, (answer * 100) / r] : [(answer * r) / 100, answer];
    return near(ca - cl, wc);
  },
});

/** Current liabilities with a current ratio and a quick ratio on them, and the inventories between the two (no prepaid expenses). */
function twoRatios(rng: Rng) {
  const cl = rng.step(100000, 500000, 20000);
  const r = rng.pick([150, 175, 200, 225, 250, 300]);
  const q = r - rng.pick([50, 60, 75, 80, 100, 125].filter((gap) => r - gap >= 50));
  const ca = (cl * r) / 100;
  const quick = (cl * q) / 100;
  return { cl, r, q, ca, quick, inv: ca - quick, wc: ca - cl };
}
const NO_PREPAID = 'It has no prepaid expenses';

const missingInventory = numericTemplate({
  id: 'ar-missing-inventory', topicId: T, conceptId: 'ar-missing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = twoRatios(rng);
    const givesLiabilities = rng.int(0, 1) === 0;
    const n = typed('rupees', s.inv, [
      [s.quick, 'Gave the quick assets; the inventories are the current assets less the quick assets.'],
      givesLiabilities ? [s.ca, 'Gave the current assets; the quick assets have to be deducted.'] : [s.cl, 'Stopped at the current liabilities.'],
      !givesLiabilities && [(s.ca * (s.r - s.q)) / 100, 'Applied the difference of the two ratios to the current assets; both ratios are multiples of the current liabilities.'],
      [(s.cl * s.q) / s.r, 'Divided the quick ratio by the current ratio instead of taking their difference.'],
    ]);
    return n && {
      prompt: `The current ratio of ${co} is ${dec(s.r)} : 1 and its quick ratio is ${dec(s.q)} : 1. Its ${givesLiabilities ? `current liabilities are ${inr(s.cl)}` : `current assets are ${inr(s.ca)}`}. ${NO_PREPAID}. Find its inventories.`,
      ...n,
      explanation: [
        givesLiabilities ? `Current assets = ${dec(s.r)} x ${inr(s.cl)} = ${inr(s.ca)}.` : `Current liabilities = ${inr(s.ca)} ÷ ${dec(s.r)} = ${inr(s.cl)}.`,
        `Quick assets = ${dec(s.q)} x ${inr(s.cl)} = ${inr(s.quick)}.`,
        `Inventories = Current assets - Quick assets = ${inr(s.ca)} - ${inr(s.quick)} = ${inr(s.inv)}.`,
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const [r, quick] = ratiosIn(q.prompt);
    const given = amountsIn(q.prompt)[0];
    const cl = q.prompt.includes('current liabilities are') ? given : (given * 100) / r;
    // Put the answer back: with these inventories the two ratios must come out as stated.
    return near((cl * quick) / 100 + q.answer / 100, (cl * r) / 100);
  },
});

const missingTwoRatios = numericTemplate({
  id: 'ar-missing-two-ratios', topicId: T, conceptId: 'ar-missing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = twoRatios(rng);
    const fromWc = rng.int(0, 1) === 0;
    const ask = fromWc ? rng.pick(['inventories', 'current assets', 'quick assets'] as const) : rng.pick(['current assets', 'current liabilities', 'working capital', 'quick assets'] as const);
    const value = { inventories: s.inv, 'current assets': s.ca, 'quick assets': s.quick, 'current liabilities': s.cl, 'working capital': s.wc }[ask];
    const given = fromWc ? s.wc : s.inv;
    // The slip of treating the given figure as the current liabilities, for each thing that may be asked.
    const asLiabilities = { inventories: (given * (s.r - s.q)) / 100, 'current assets': (given * s.r) / 100, 'quick assets': (given * s.q) / 100, 'current liabilities': given, 'working capital': (given * (s.r - 100)) / 100 }[ask];
    const others: Err[] = (
      [['inventories', s.inv], ['current assets', s.ca], ['quick assets', s.quick], ['current liabilities', s.cl], ['working capital', s.wc]] as [string, number][]
    ).filter(([name]) => name !== ask && name !== (fromWc ? 'working capital' : 'inventories')).map(([name, v]) => [v, `Gave the ${name}; the ${ask} were asked for.`.replace('capital were', 'capital was')]);
    const n = typed('rupees', value, [
      [asLiabilities, ask === 'current liabilities' ? 'Gave the inventories back as the current liabilities.' : `Took the ${fromWc ? 'working capital' : 'inventories'} as the current liabilities and applied the ratios to ${fromWc ? 'it' : 'them'}.`],
      // Dividing by the current ratio and multiplying by it again only gives the figure back, so not for the current assets.
      ask !== 'current assets' &&
        (fromWc
          ? [((s.wc * 100) / s.r) * (ask === 'inventories' ? (s.r - s.q) / 100 : s.q / 100), 'Divided the working capital by the current ratio to find the current liabilities; it is divided by the current ratio less 1.']
          : [((s.inv * 100) / s.r) * (ask === 'current liabilities' ? 1 : ask === 'quick assets' ? s.q / 100 : (s.r - 100) / 100), 'Divided the inventories by the current ratio to find the current liabilities; they are divided by the difference of the two ratios.']),
      ...others.slice(0, 2),
    ]);
    return n && {
      prompt: `The current ratio of ${co} is ${dec(s.r)} : 1 and its quick ratio is ${dec(s.q)} : 1. Its ${fromWc ? `working capital is ${inr(s.wc)}` : `inventories are ${inr(s.inv)}`}. ${NO_PREPAID}. Find its ${ask}.`,
      ...n,
      explanation: [
        fromWc
          ? `If the current liabilities are x, the working capital is ${xs(s.r)} - x = ${xs(s.r - 100)} = ${inr(s.wc)}, so x = ${inr(s.cl)}.`
          : `If the current liabilities are x, the inventories are ${xs(s.r)} - ${xs(s.q)} = ${xs(s.r - s.q)} = ${inr(s.inv)}, so x = ${inr(s.cl)}.`,
        ...(ask === 'current liabilities' ? [] : ask === 'quick assets' ? [`Quick assets = ${dec(s.q)} x ${inr(s.cl)} = ${inr(s.quick)}.`] : [`Current assets = ${dec(s.r)} x ${inr(s.cl)} = ${inr(s.ca)}.`]),
        ...(ask === 'inventories' ? [`Quick assets = ${dec(s.q)} x ${inr(s.cl)} = ${inr(s.quick)}; inventories = ${inr(s.ca)} - ${inr(s.quick)} = ${inr(s.inv)}.`] : ask === 'working capital' ? [`Working capital = ${inr(s.ca)} - ${inr(s.cl)} = ${inr(s.wc)}.`] : []),
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const [r, quick] = ratiosIn(q.prompt);
    const given = amountsIn(q.prompt)[0];
    const ask = /Find its ([a-z ]+)\.$/.exec(q.prompt)?.[1] ?? '';
    // Work back from the answer to the current liabilities, then forward to the figure that was given.
    const per = { inventories: r - quick, 'current assets': r, 'quick assets': quick, 'current liabilities': 100, 'working capital': r - 100 }[ask];
    if (per === undefined) return false;
    const cl = (q.answer / 100 / per) * 100;
    return near(q.prompt.includes('working capital is') ? (cl * (r - 100)) / 100 : (cl * (r - quick)) / 100, given);
  },
});

const missingRevenueFromInventory = numericTemplate({
  id: 'ar-missing-revenue-from-inventory-turnover', topicId: T, conceptId: 'ar-missing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 300000, 10000);
    const k = rng.pick([4, 5, 6, 8, 10]);
    const cost = average * k;
    const m = rng.pick(MARGINS);
    const revenue = (cost * m.revenuePer100Cost) / 100;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    const askProfit = rng.int(0, 2) === 0;
    // What the student gets who applies the percentage to the wrong base.
    const wrongRevenue = m.on === 'cost' ? (cost * 100) / (100 - m.percent) : (cost * (100 + m.percent)) / 100;
    const wrongWhy = m.on === 'cost' ? `Took the gross profit as ${m.percent}% of revenue; it is ${m.percent}% of the cost.` : `Added ${m.percent}% of the cost as the gross profit; the gross profit ratio is on revenue from operations.`;
    const per = m.revenuePer100Cost / 100;
    const n = askProfit
      ? typed('rupees', revenue - cost, [
          [wrongRevenue - cost, wrongWhy],
          [cost, 'Gave the cost of revenue from operations, not the gross profit.'],
          [revenue, 'Gave the revenue from operations, not the gross profit.'],
          [closing * k * (per - 1), 'Used the closing inventory instead of the average inventory.'],
        ])
      : typed('rupees', revenue, [
          [cost, 'Stopped at the cost of revenue from operations; the gross profit has to be added.'],
          [wrongRevenue, wrongWhy],
          [closing * k * per, 'Used the closing inventory instead of the average inventory.'],
          [(opening + closing) * k * per, 'Added the opening and closing inventories but did not halve the total to get the average.'],
        ]);
    return n && {
      prompt: `The inventory turnover ratio of ${co} is ${k} times. The opening inventory was ${inr(opening)} and the closing inventory is ${inr(closing)}. ${marginText(m)}. Find the ${askProfit ? 'gross profit' : 'revenue from operations'} for the year.`,
      ...n,
      explanation: [
        `Average inventory = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
        `Cost of revenue from operations = ${k} x ${inr(average)} = ${inr(cost)}.`,
        m.on === 'cost'
          ? `Gross profit = ${m.percent}% of ${inr(cost)} = ${inr(revenue - cost)}${askProfit ? '.' : `; revenue from operations = ${inr(cost)} + ${inr(revenue - cost)} = ${inr(revenue)}.`}`
          : `Cost is ${100 - m.percent}% of revenue, so revenue from operations = ${inr(cost)} x 100 ÷ ${100 - m.percent} = ${inr(revenue)}${askProfit ? `; gross profit = ${inr(revenue)} - ${inr(cost)} = ${inr(revenue - cost)}.` : '.'}`,
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const [opening, closing] = amountsIn(q.prompt);
    const k = Number(/is (\d+) times/.exec(q.prompt)?.[1]);
    const percent = percentsIn(q.prompt)[0];
    const cost = (k * (opening + closing)) / 2;
    const answer = q.answer / 100;
    const gp = q.prompt.includes('Find the gross profit') ? answer : answer - cost;
    // The gross profit must be the stated percentage of its base.
    return near(gp, q.prompt.includes('on cost') ? (cost * percent) / 100 : ((cost + gp) * percent) / 100);
  },
});

const missingFromReceivables = numericTemplate({
  id: 'ar-missing-from-receivables-turnover', topicId: T, conceptId: 'ar-missing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const average = rng.step(40000, 240000, 10000);
    const k = rng.pick([4, 5, 6, 8, 10, 12]);
    const credit = average * k;
    const [opening, closing] = aroundAverage(rng, average, 5000);
    if (rng.int(0, 1) === 0) {
      const share = rng.pick([20, 25, 40, 50]);
      const revenue = (credit * 100) / (100 - share);
      const n = typed('rupees', revenue, [
        [credit, 'Gave the credit revenue only; the cash revenue has to be added.'],
        [(credit * (100 + share)) / 100, `Added ${share}% of the credit revenue; the cash revenue is ${share}% of the total revenue.`],
        [(closing * k * 100) / (100 - share), 'Used the closing trade receivables instead of the average.'],
        [((opening + closing) * k * 100) / (100 - share), 'Added the opening and closing trade receivables but did not halve the total to get the average.'],
      ]);
      return n && {
        prompt: `The trade receivables turnover ratio of ${co} is ${k} times. Its trade receivables were ${inr(opening)} at the beginning of the year and ${inr(closing)} at the end. Cash revenue is ${share}% of the total revenue from operations. Find the total revenue from operations.`,
        ...n,
        explanation: [
          `Average trade receivables = (${inr(opening)} + ${inr(closing)}) ÷ 2 = ${inr(average)}.`,
          `Credit revenue from operations = ${k} x ${inr(average)} = ${inr(credit)}.`,
          `Credit revenue is ${100 - share}% of the total, so total revenue from operations = ${inr(credit)} x 100 ÷ ${100 - share} = ${inr(revenue)}.`,
        ],
        hints: H.missing,
      };
    }
    const n = typed('rupees', closing, [
      [average, 'Gave the average trade receivables; the closing balance is twice the average less the opening balance.'],
      [average * 2, 'Doubled the average but did not deduct the opening balance.'],
      [average - opening, 'Deducted the opening balance from the average without doubling the average first.'],
    ]);
    return n && {
      prompt: `The credit revenue from operations of ${co} is ${inr(credit)} and its trade receivables turnover ratio is ${k} times. Its trade receivables at the beginning of the year were ${inr(opening)}. Find its trade receivables at the end of the year.`,
      ...n,
      explanation: [
        `Average trade receivables = ${inr(credit)} ÷ ${k} = ${inr(average)}.`,
        `Opening + Closing = 2 x ${inr(average)} = ${inr(average * 2)}.`,
        `Closing trade receivables = ${inr(average * 2)} - ${inr(opening)} = ${inr(closing)}.`,
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const k = Number(/is (\d+) times/.exec(q.prompt)?.[1]);
    const amounts = amountsIn(q.prompt);
    const answer = q.answer / 100;
    if (q.prompt.includes('Find the total revenue')) {
      const share = percentsIn(q.prompt)[0];
      return near(((answer * (100 - share)) / 100) * 2, k * (amounts[0] + amounts[1]));
    }
    return near(amounts[0] * 2, k * (amounts[1] + answer));
  },
});

const missingGrossProfit = numericTemplate({
  id: 'ar-missing-gross-profit', topicId: T, conceptId: 'ar-missing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cost = rng.step(200000, 3000000, 40000);
    if (rng.int(0, 1) === 0) {
      const m = rng.pick([10, 20, 25, 40, 50, 60]);
      const gp = (cost * m) / 100;
      const revenue = cost + gp;
      const askCost = rng.int(0, 2) === 0;
      const n = askCost
        ? typed('rupees', cost, [
            [(revenue * (100 - m)) / 100, `Took the gross profit as ${m}% of revenue; it is ${m}% of the cost.`],
            [gp, 'Gave the gross profit, not the cost of revenue from operations.'],
          ])
        : typed('rupees', gp, [
            [(revenue * m) / 100, `Took ${m}% of the revenue; the gross profit is ${m}% of the cost.`],
            [cost, 'Gave the cost of revenue from operations, not the gross profit.'],
            // Only where the slip still leaves a profit smaller than the revenue.
            m < 50 && [(revenue * m) / (100 - m), `Divided by ${100 - m} instead of ${100 + m}: with a profit on cost, revenue is ${100 + m}% of cost.`],
          ]);
      return n && {
        prompt: `The revenue from operations of ${co} is ${inr(revenue)}. Gross profit is ${m}% on cost. Find the ${askCost ? 'cost of revenue from operations' : 'gross profit'}.`,
        ...n,
        explanation: [
          `If the cost is 100, the gross profit is ${m} and the revenue is ${100 + m}.`,
          askCost ? `Cost of revenue from operations = ${inr(revenue)} x 100 ÷ ${100 + m} = ${inr(cost)}.` : `Gross profit = ${inr(revenue)} x ${m} ÷ ${100 + m} = ${inr(gp)}.`,
        ],
        hints: H.missing,
      };
    }
    const g = rng.pick([20, 25, 37.5, 50, 60]);
    const revenue = (cost * 100) / (100 - g);
    const askProfit = rng.int(0, 1) === 0;
    const n = askProfit
      ? typed('rupees', revenue - cost, [
          [(cost * g) / 100, `Took ${g}% of the cost; the gross profit ratio is on revenue from operations.`],
          [revenue, 'Gave the revenue from operations, not the gross profit.'],
        ])
      : typed('rupees', revenue, [
          [(cost * (100 + g)) / 100, `Added ${g}% of the cost; the gross profit ratio is on revenue from operations, so cost is ${100 - g}% of revenue.`],
          [revenue - cost, 'Gave the gross profit, not the revenue from operations.'],
          [(cost * (100 - g)) / 100, `Took ${100 - g}% of the cost instead of dividing the cost by ${100 - g}%.`],
        ]);
    return n && {
      prompt: `The cost of revenue from operations of ${co} is ${inr(cost)} and its gross profit ratio is ${g}%. Find the ${askProfit ? 'gross profit' : 'revenue from operations'}.`,
      ...n,
      explanation: [
        `The gross profit ratio is on revenue: if revenue is 100, gross profit is ${g} and cost is ${100 - g}.`,
        `Revenue from operations = ${inr(cost)} x 100 ÷ ${100 - g} = ${inr(revenue)}.`,
        ...(askProfit ? [`Gross profit = ${inr(revenue)} - ${inr(cost)} = ${inr(revenue - cost)}.`] : []),
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const given = amountsIn(q.prompt)[0];
    const percent = percentsIn(q.prompt)[0];
    const answer = q.answer / 100;
    if (q.prompt.includes('on cost')) {
      // Given revenue. The answer is the cost or the gross profit; the other follows, and profit is the percentage of cost.
      const [cost, gp] = q.prompt.includes('Find the gross profit') ? [given - answer, answer] : [answer, given - answer];
      return near(gp, (cost * percent) / 100);
    }
    const [revenue, gp] = q.prompt.includes('Find the gross profit') ? [given + answer, answer] : [answer, answer - given];
    return near(gp, (revenue * percent) / 100);
  },
});

const missingInventoryBalance = numericTemplate({
  id: 'ar-missing-inventory-balance', topicId: T, conceptId: 'ar-missing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const k = rng.pick([4, 5, 6, 8, 10]);
    const askOpening = rng.int(0, 1) === 0;
    const times = rng.int(0, 2) === 0 ? rng.pick([2, 3, 1.5]) : 0;
    // Either the closing inventory is a multiple of the opening one, or it is more than it by a stated amount.
    const opening = times ? rng.step(20000, 120000, 20000) : rng.step(30000, 200000, 5000);
    const gap = rng.step(10000, 60000, 10000);
    const closing = times ? opening * times : opening + gap;
    const average = (opening + closing) / 2;
    const cost = average * k;
    const m = rng.pick(MARGINS);
    const revenue = (cost * m.revenuePer100Cost) / 100;
    const givesCost = rng.int(0, 1) === 0;
    const value = askOpening ? opening : closing;
    const n = typed('rupees', value, [
      [average, `Gave the average inventory; the ${askOpening ? 'opening' : 'closing'} inventory was asked for.`],
      [askOpening ? closing : opening, `Gave the ${askOpening ? 'closing' : 'opening'} inventory; the ${askOpening ? 'opening' : 'closing'} inventory was asked for.`],
      times
        ? [askOpening ? average / times : average * times, `Took the average inventory as the ${askOpening ? 'closing' : 'opening'} inventory; opening plus closing is twice the average.`]
        : [askOpening ? average - gap : average + gap, `Took the whole difference of ${inr(gap)} ${askOpening ? 'off' : 'on to'} the average; each balance is half the difference away from the average.`],
      !givesCost && [(wrongCost(m, revenue) / k) * (times ? (askOpening ? 2 / (times + 1) : (2 * times) / (times + 1)) : 1) + (times ? 0 : askOpening ? -gap / 2 : gap / 2), wrongBaseWhy(m)],
    ]);
    const relation = times ? `${times === 1.5 ? 'one and a half times' : times === 2 ? 'twice' : 'three times'} the opening inventory` : `${inr(gap)} more than the opening inventory`;
    return n && {
      prompt: `${givesCost ? `The cost of revenue from operations of ${co} is ${inr(cost)}.` : `The revenue from operations of ${co} is ${inr(revenue)}. ${marginText(m)}.`} The inventory turnover ratio is ${k} times, and the closing inventory is ${relation}. Find the ${askOpening ? 'opening' : 'closing'} inventory.`,
      ...n,
      explanation: [
        ...(givesCost ? [] : [costWorking(m, revenue, cost)]),
        `Average inventory = ${inr(cost)} ÷ ${k} = ${inr(average)}, so opening + closing = ${inr(average * 2)}.`,
        times
          ? `If the opening inventory is x, the closing inventory is ${times}x and x + ${times}x = ${inr(average * 2)}, so x = ${inr(opening)}; closing inventory = ${inr(closing)}.`
          : `If the opening inventory is x, then x + (x + ${inr(gap)}) = ${inr(average * 2)}, so x = ${inr(opening)}; closing inventory = ${inr(closing)}.`,
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const amounts = amountsIn(q.prompt);
    const k = Number(/is (\d+) times, and/.exec(q.prompt)?.[1]);
    const cost = q.prompt.startsWith('The cost of revenue')
      ? amounts[0]
      : q.prompt.includes('on cost')
        ? (amounts[0] * 100) / (100 + percentsIn(q.prompt)[0])
        : (amounts[0] * (100 - percentsIn(q.prompt)[0])) / 100;
    const answer = q.answer / 100;
    const multiple = q.prompt.includes('one and a half times') ? 1.5 : q.prompt.includes('twice') ? 2 : q.prompt.includes('three times the opening') ? 3 : 0;
    const askOpening = q.prompt.includes('Find the opening');
    const gap = amounts[amounts.length - 1];
    const other = multiple ? (askOpening ? answer * multiple : answer / multiple) : askOpening ? answer + gap : answer - gap;
    // Cost of revenue from operations = turnover x average of the two inventories.
    return near(cost * 2, k * (answer + other));
  },
});

const missingSolvency = numericTemplate({
  id: 'ar-missing-from-solvency-ratio', topicId: T, conceptId: 'ar-missing', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const shape = rng.int(0, 4);
    const base = rng.step(200000, 2000000, 20000);
    if (shape === 0 || shape === 1) {
      const r = rng.pick([25, 40, 50, 60, 75, 80, 125, 150, 200, 250]);
      const debt = (base * r) / 100;
      const askDebt = shape === 0;
      const n = askDebt
        ? typed('rupees', debt, [
            [(base * 100) / r, "Divided the shareholders' funds by the ratio; debt is the ratio times the shareholders' funds."],
            [base + debt, "Gave the capital employed: debt plus the shareholders' funds."],
          ])
        : typed('rupees', base, [
            [(debt * r) / 100, "Multiplied the debt by the ratio; the shareholders' funds are the debt divided by the ratio."],
            [base + debt, "Gave the capital employed: debt plus the shareholders' funds."],
          ]);
      return n && {
        prompt: `The debt to equity ratio of ${co} is ${dec(r)} : 1 and its ${askDebt ? `shareholders' funds are ${inr(base)}` : `debt is ${inr(debt)}`}. Find its ${askDebt ? 'debt' : "shareholders' funds"}.`,
        ...n,
        explanation: ["Debt to equity ratio = Debt ÷ Shareholders' funds.", askDebt ? `Debt = ${dec(r)} x ${inr(base)} = ${inr(debt)}.` : `Shareholders' funds = ${inr(debt)} ÷ ${dec(r)} = ${inr(base)}.`],
        hints: H.missing,
      };
    }
    if (shape === 2) {
      const p = rng.pick([25, 30, 40, 45, 50, 60, 65, 70, 75, 80]);
      const assets = rng.step(500000, 4000000, 100000);
      const equity = (assets * p) / 100;
      const n = typed('rupees', equity, [
        [(assets * 100) / p, "Divided the total assets by the ratio; the shareholders' funds are the ratio times the total assets."],
        [assets - equity, "Gave the outside liabilities: the total assets less the shareholders' funds."],
      ]);
      return n && {
        prompt: `The proprietary ratio (shareholders' funds to total assets) of ${co} is ${dec(p)} : 1 and its total assets are ${inr(assets)}. Find its shareholders' funds.`,
        ...n,
        explanation: ["Proprietary ratio = Shareholders' funds ÷ Total assets.", `Shareholders' funds = ${dec(p)} x ${inr(assets)} = ${inr(equity)}.`],
        hints: H.missing,
      };
    }
    if (shape === 3) {
      const t = rng.pick([150, 175, 200, 225, 250, 300, 350, 400]);
      const assets = (base * t) / 100;
      const n = typed('rupees', assets, [
        [(base * 100) / t, 'Divided the debt by the ratio; the total assets are the ratio times the debt.'],
        [assets - base, 'Deducted the debt from the total assets.'],
        [assets + base, 'Added the debt to the total assets.'],
      ]);
      return n && {
        prompt: `The total assets to debt ratio of ${co} is ${dec(t)} : 1 and its debt is ${inr(base)}. Find its total assets.`,
        ...n,
        explanation: ['Total assets to debt ratio = Total assets ÷ Debt.', `Total assets = ${dec(t)} x ${inr(base)} = ${inr(assets)}.`],
        hints: H.missing,
      };
    }
    const r = rng.pick([20, 25, 30, 40, 50, 60]);
    const ce = rng.step(500000, 4000000, 100000);
    const debt = (ce * r) / 100;
    const n = typed('rupees', ce - debt, [
      [debt, "Gave the debt; the shareholders' funds are the capital employed less the debt."],
      [(ce * 100) / r, 'Divided the capital employed by the ratio.'],
      [ce + debt, 'Added the debt to the capital employed instead of deducting it.'],
    ]);
    return n && {
      prompt: `The debt to capital employed ratio of ${co} is ${dec(r)} : 1 and its capital employed is ${inr(ce)}. It has no non-current liability other than its debt. Find its shareholders' funds.`,
      ...n,
      explanation: [`Debt = ${dec(r)} x ${inr(ce)} = ${inr(debt)}.`, `Shareholders' funds = Capital employed - Debt = ${inr(ce)} - ${inr(debt)} = ${inr(ce - debt)}.`],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const r = ratiosIn(q.prompt)[0];
    const given = amountsIn(q.prompt)[0];
    const answer = q.answer / 100;
    // The ratio worked out again from the figure given and the answer, cross-multiplied.
    if (q.prompt.startsWith('The debt to equity')) return q.prompt.includes('Find its debt.') ? near(answer * 100, r * given) : near(given * 100, r * answer);
    if (q.prompt.startsWith('The proprietary')) return near(answer * 100, r * given);
    if (q.prompt.startsWith('The total assets to debt')) return near(answer * 100, r * given);
    return near((given - answer) * 100, r * given);
  },
});

const missingOperating = numericTemplate({
  id: 'ar-missing-from-operating-ratio', topicId: T, conceptId: 'ar-missing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const revenue = rng.step(400000, 4000000, 40000);
    const ratio = rng.pick([60, 65, 70, 72.5, 75, 77.5, 80, 82.5, 85, 87.5, 90]);
    const operatingCost = (revenue * ratio) / 100;
    const cost = Math.floor((operatingCost * rng.pick([65, 70, 75, 80])) / 100 / 5000) * 5000;
    const opex = operatingCost - cost;
    const profit = revenue - operatingCost;
    const ask = rng.pick(['operating expenses', 'operating profit'] as const);
    const n =
      ask === 'operating expenses'
        ? typed('rupees', opex, [
            [operatingCost, 'Gave the whole operating cost; the cost of revenue from operations has to be deducted from it.'],
            [profit, 'Gave the operating profit, not the operating expenses.'],
            [revenue - cost, 'Gave the gross profit: revenue less the cost of revenue from operations.'],
          ])
        : typed('rupees', profit, [
            [operatingCost, `Gave the operating cost: ${ratio}% of revenue is the cost, not the profit.`],
            [revenue - cost, 'Gave the gross profit: the operating expenses were not deducted.'],
            [opex, 'Gave the operating expenses, not the operating profit.'],
          ]);
    return n && {
      prompt: `${co} has revenue from operations of ${inr(revenue)} and a cost of revenue from operations of ${inr(cost)}. Its operating ratio is ${ratio}%. Find its ${ask}.`,
      ...n,
      explanation: [
        `Operating cost = Cost of revenue from operations + Operating expenses = ${ratio}% of ${inr(revenue)} = ${inr(operatingCost)}.`,
        ask === 'operating expenses' ? `Operating expenses = ${inr(operatingCost)} - ${inr(cost)} = ${inr(opex)}.` : `Operating profit = ${inr(revenue)} - ${inr(operatingCost)} = ${inr(profit)} (${100 - ratio}% of revenue).`,
      ],
      hints: H.missing,
    };
  },
  verify: (q) => {
    const [revenue, cost] = amountsIn(q.prompt);
    const ratio = percentsIn(q.prompt)[0];
    const answer = q.answer / 100;
    // The operating ratio worked out again with the answer in it.
    const operatingCost = q.prompt.includes('Find its operating expenses') ? cost + answer : revenue - answer;
    return near(operatingCost * 100, ratio * revenue);
  },
});

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const arAssertionReason = factsTemplate({
  id: 'ar-assertion-reason', topicId: 'accounting-ratios', conceptId: 'ar-effect', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'The current ratio is 3:1 and working capital is ₹4,00,000. Current liabilities are ₹2,00,000.',
      reason: 'With a current ratio of r : 1, working capital = (r - 1) × current liabilities.',
      a: '₹4,00,000 ÷ (3 - 1) = ₹2,00,000.',
      r: 'Working capital is current assets less current liabilities.',
      link: 'R explains A: the ₹2,00,000 comes straight from that relation.',
    },
    {
      answer: 'both',
      assertion: 'Inventories are left out of quick assets.',
      reason: 'Inventories take time to be sold and turned into cash.',
      a: 'Quick assets = Current assets - Inventories - Prepaid expenses.',
      r: 'Goods have to be sold, and the money then collected.',
      link: 'R explains A: the quick ratio counts only what can be turned into cash soon.',
    },
    {
      answer: 'both',
      assertion: 'The current ratio is 2:1. Paying a trade payable in cash raises the current ratio.',
      reason: 'Taking the same amount from both terms of a ratio above 1 : 1 raises the ratio.',
      a: 'Current assets and current liabilities both fall by the same amount, so 2:1 moves up.',
      r: 'For example, 20 : 10 with 5 taken from both becomes 15 : 5, or 3 : 1.',
      link: 'R explains A: 2 : 1 is above 1 : 1, so taking the same amount from both terms raises it.',
    },
    {
      answer: 'both',
      assertion: 'A gross profit of 25% on cost is a gross profit ratio of 20%.',
      reason: 'A profit of 25 on a cost of 100 is a profit of 25 on a revenue of 125.',
      a: '25 ÷ 125 × 100 = 20%.',
      r: 'Revenue = cost + profit = 125.',
      link: 'R explains A: the ratio is worked on revenue, and R turns the cost into that revenue.',
    },
    {
      answer: 'both',
      assertion: 'A company with an operating ratio of 80% has an operating profit ratio of 20%.',
      reason: 'Operating profit ratio = 100 - Operating ratio.',
      a: '100 - 80 = 20%.',
      r: 'Together they account for the whole of revenue from operations.',
      link: 'R explains A: the 20% is what is left of the revenue after the 80%.',
    },
    {
      answer: 'bothNot',
      assertion: 'The interest coverage ratio is a solvency ratio.',
      reason: 'The interest coverage ratio is expressed in times.',
      a: 'It shows the ability to meet interest on long-term debt.',
      r: 'Profit before interest and tax ÷ interest gives a number of times.',
      link: 'R does not explain A: the way a ratio is expressed does not put it in a group; what it measures does.',
    },
    {
      answer: 'bothNot',
      assertion: 'Bills receivable are included in trade receivables for the trade receivables turnover ratio.',
      reason: 'Average collection period = Days in the year ÷ Trade receivables turnover ratio.',
      a: 'Trade receivables = debtors + bills receivable.',
      r: 'A turnover of 8 times in a 360-day year means the dues are collected in 45 days.',
      link: 'R does not explain A: R uses the ratio once found, and does not say what goes into it.',
    },
    {
      answer: 'bothNot',
      assertion: 'Machinery of ₹5,00,000 bought by issuing shares leaves the current ratio unchanged.',
      reason: 'Machinery bought by issuing shares raises the total assets of the company.',
      a: 'Neither current assets nor current liabilities change.',
      r: 'Fixed assets rise by ₹5,00,000.',
      link: 'R does not explain A: a rise in total assets alone would not leave the ratio alone. What matters is that no current item moves.',
    },
    {
      answer: 'aOnly',
      assertion: 'A single ratio says little by itself.',
      reason: 'Every ratio has one universal standard against which it is judged.',
      a: 'A ratio means something when compared with past years or other firms.',
      r: 'There are no universal standards; this is a limitation of ratio analysis.',
    },
    {
      answer: 'aOnly',
      assertion: 'Revenue from operations is ₹20,00,000 and gross profit ₹5,00,000. The gross profit ratio is 25%.',
      reason: 'The gross profit ratio is worked on the cost of revenue from operations.',
      a: '₹5,00,000 ÷ ₹20,00,000 × 100 = 25%.',
      r: 'It is worked on revenue from operations, not on cost.',
    },
    {
      answer: 'rOnly',
      assertion: 'Goods bought for cash lower the current ratio.',
      reason: 'Buying goods for cash swaps one current asset for another of the same amount.',
      a: 'Cash falls and inventories rise by the same amount, so the current ratio does not change.',
      r: 'Total current assets stay the same, and current liabilities are not touched.',
    },
    {
      answer: 'rOnly',
      assertion: 'For the debt to equity ratio, debt is long-term borrowings plus current liabilities.',
      reason: "For the debt to equity ratio, equity is the shareholders' funds.",
      a: 'Debt = long-term borrowings + long-term provisions. Current liabilities are left out.',
      r: 'Equity = share capital + reserves and surplus.',
    },
  ]),
});

// ===============================================================================================================
// Ratios from the statements: the board's commonest ratio question. An abridged Schedule III balance sheet with its
// notes and an extract of the Statement of Profit and Loss of one company are printed, and one ratio is asked. The
// traps are where the statements put things: the current maturities of a term loan inside short-term borrowings
// (current, so never debt), prepaid expenses inside other current assets (current, but not quick), other long-term
// liabilities (not debt), sales returns (out of revenue from operations) and other income (never in it).
// These templates were added after the mock papers were set (src/generators/outsidePapers.ts).
// ===============================================================================================================

type Trade = 'trade' | 'make' | 'service';
interface Firm {
  name: string;
  city: string;
  /** What it does, read after the name and the city: "sells seeds and fertilisers to farmers". */
  does: string;
  trade: Trade;
}
const FIRMS: Firm[] = [
  { name: 'Krishi Mitra Agro Inputs Ltd.', city: 'Nashik', does: 'sells seeds, fertilisers and sprayers to farmers', trade: 'trade' },
  { name: 'Ganpati Hardware Mart Ltd.', city: 'Pune', does: 'runs a chain of hardware and paint shops', trade: 'trade' },
  { name: 'Sanjivani Medical Distributors Ltd.', city: 'Lucknow', does: 'supplies medicines to chemists across the district', trade: 'trade' },
  { name: 'Annapurna Supermarts Ltd.', city: 'Indore', does: 'runs grocery supermarkets', trade: 'trade' },
  { name: 'Kalinga Cycle Traders Ltd.', city: 'Bhubaneswar', does: 'sells bicycles and spare parts at wholesale', trade: 'trade' },
  { name: 'Malabar Coir Products Ltd.', city: 'Alappuzha', does: 'makes coir mats and ropes', trade: 'make' },
  { name: 'Saurashtra Pump Works Ltd.', city: 'Rajkot', does: 'makes water pumps for farms', trade: 'make' },
  { name: 'Brahmaputra Tea Packers Ltd.', city: 'Guwahati', does: 'blends and packs tea', trade: 'make' },
  { name: 'Arogya Diagnostic Clinics Ltd.', city: 'Jaipur', does: 'runs diagnostic clinics and a pathology laboratory', trade: 'service' },
  { name: 'Sahyog Roadways Ltd.', city: 'Nagpur', does: 'runs a fleet of goods trucks', trade: 'service' },
  { name: 'Prerna Coaching Centres Ltd.', city: 'Kota', does: 'runs coaching classes for entrance examinations', trade: 'service' },
];

// The lines of the statements, as the prompt prints them (each "Label: ₹amount" on a line of its own).
const S = {
  sc: 'Share capital', rs: 'Reserves and surplus', ltb: 'Long-term borrowings (Note 1)', olt: 'Other long-term liabilities (security deposits received)',
  ltp: 'Long-term provisions (for gratuity)', stb: 'Short-term borrowings (Note 2)', tp: 'Trade payables', stp: 'Short-term provisions (for tax)',
  ppe: 'Property, plant and equipment', nci: 'Non-current investments', inv: 'Inventories', tr: 'Trade receivables', cash: 'Cash and cash equivalents',
  oca: 'Other current assets (Note 3)',
  sales: 'Sales', returns: 'Sales returns', rev: 'Revenue from operations', other: 'Other income', purchases: 'Purchases of stock-in-trade',
  open: 'Inventories on 1 April 2025', pbt: 'Profit before tax', tax: 'Tax',
} as const;
const S_SOURCES: string[] = [S.sc, S.rs, S.ltb, S.olt, S.ltp, S.stb, S.tp, S.stp];
const S_ASSETS: string[] = [S.ppe, S.nci, S.inv, S.tr, S.cash, S.oca];
const S_CA: string[] = [S.inv, S.tr, S.cash, S.oca];
const S_CL: string[] = [S.stb, S.tp, S.stp];
/** The figures of the notes, read back from their words. */
const noteFigure = (prompt: string, words: string): number => {
  const m = new RegExp(`${words} ₹([\\d,]+)`).exec(prompt);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
};

type Ask = 'current' | 'quick' | 'debtEquity' | 'inventory' | 'netProfit';
interface Books {
  firm: Firm;
  sc: number; rs: number; ltb: number; olt: number; ltp: number; od: number; cm: number; tp: number; stp: number;
  ppe: number; nci: number; inv: number; tr: number; cash: number; prepaid: number; accrued: number;
  rate: number; sales: number; returns: number; other: number; open: number; purchases: number; pbt: number; tax: number;
}

/**
 * One company's statements, built so that the ratio asked comes out exact to two decimal places; everything else is
 * drawn freely and the balance sheet is made to agree through the share capital or the property, plant and
 * equipment. Null for a seed that gives an odd company.
 */
function books(rng: Rng, ask: Ask): Books | null {
  const firm = rng.pick(FIRMS.filter((f) => (ask === 'inventory' ? f.trade === 'trade' : ask === 'netProfit' ? f.trade !== 'service' : true)));
  const rate = rng.pick([9, 10, 11, 12]);
  // Equity and the term loan, repaid by a yearly instalment `cm` that is due within a year and so is current.
  const rs = rng.step(200000, 2500000, 10000);
  let sc = 0, cm: number, ltb: number, ltp: number;
  if (ask === 'debtEquity') {
    sc = rng.step(1000000, 5000000, 100000);
    const debt = ((sc + rs) * rng.pick([20, 25, 30, 40, 45, 50, 60, 75, 80, 90, 100, 120, 125, 150])) / 100;
    const k = rng.int(2, 5);
    ltb = Math.floor((debt * rng.pick([80, 85, 90])) / 100 / (k * 5000)) * k * 5000;
    cm = ltb / k;
    ltp = debt - ltb;
    if (cm < 25000 || ltp < 10000) return null;
  } else {
    cm = rng.step(50000, 250000, 50000);
    ltb = cm * rng.int(2, 5);
    ltp = rng.step(30000, 300000, 10000);
  }
  // Current liabilities and current assets: exact to the ratio asked when it is a liquidity ratio.
  let od: number, tp: number, stp: number;
  if (ask === 'current' || ask === 'quick') {
    const parts = split(rng, rng.step(300000, 1200000, 50000), 3, 5000);
    if (!parts) return null;
    [tp, od, stp] = parts;
    if (stp > 300000) return null;
  } else {
    od = rng.step(50000, 300000, 10000);
    tp = rng.step(150000, 900000, 10000);
    stp = rng.step(30000, 200000, 10000);
  }
  const cl = od + cm + tp + stp;
  const prepaid = rng.step(10000, 60000, 2000), accrued = rng.step(5000, 40000, 1000);
  let inv: number, tr: number, cash: number, open = 0;
  let cost = 0;
  if (ask === 'current') {
    const ca = (cl * rng.pick([110, 120, 125, 130, 140, 150, 160, 175, 180, 200, 225, 240, 250, 275, 300])) / 100;
    if (firm.trade === 'service') {
      // A clinic, a transport company or a coaching centre holds only consumables.
      inv = rng.step(40000, 150000, 5000);
      const parts = split(rng, ca - prepaid - accrued - inv, 2, 500);
      if (!parts) return null;
      [tr, cash] = parts;
    } else {
      const parts = split(rng, ca - prepaid - accrued, 3, 500);
      if (!parts) return null;
      [inv, tr, cash] = parts;
    }
  } else if (ask === 'quick') {
    const quick = (cl * rng.pick([50, 60, 70, 75, 80, 90, 100, 110, 120, 125, 140, 150])) / 100;
    const parts = split(rng, quick - accrued, 2, 500);
    if (!parts) return null;
    [tr, cash] = parts;
    inv = rng.step(200000, 1500000, 10000);
  } else if (ask === 'inventory') {
    // The average inventory and the turnover first; the cost of revenue from operations and the purchases follow.
    const average = rng.step(200000, 1200000, 20000);
    const d = rng.step(10000, Math.max(10000, Math.floor(average / 4 / 10000) * 10000), 10000) * (rng.int(0, 1) === 0 ? 1 : -1);
    inv = average + d;
    open = average - d;
    cost = (average * rng.pick([400, 450, 500, 550, 600, 625, 650, 700, 750, 800, 900, 1000])) / 100;
    tr = rng.step(150000, 1200000, 10000);
    cash = rng.step(50000, 500000, 10000);
  } else {
    inv = rng.step(200000, 1500000, 10000);
    tr = rng.step(150000, 1200000, 10000);
    cash = rng.step(50000, 500000, 10000);
  }
  if (firm.trade === 'service' && ask !== 'current') inv = Math.min(inv, rng.step(40000, 150000, 5000)); // consumables only
  const ca = inv + tr + cash + prepaid + accrued;
  const olt = rng.step(20000, 150000, 10000);
  const nci = rng.int(0, 1) === 0 ? rng.step(100000, 800000, 50000) : 0;
  const others = rs + ltb + olt + ltp + cl;
  let ppe: number;
  if (ask === 'debtEquity') {
    ppe = sc + others - nci - ca;
    if (ppe < Math.max(300000, (sc + others) / 5)) return null;
  } else {
    // The share capital is what makes the two sides agree, in lakhs, over a block of property, plant and equipment.
    const block = rng.step(800000, 4000000, 10000);
    sc = Math.ceil((block + nci + ca - others) / 100000) * 100000;
    if (sc < 500000) sc += Math.ceil((500000 - sc) / 100000) * 100000;
    ppe = sc + others - nci - ca;
  }
  const assets = sc + others;
  // The year's figures.
  const other = rng.step(10000, 200000, 5000);
  let pbt: number, tax: number;
  let rev = Math.max(1000000, Math.round((assets * rng.pick([80, 100, 120, 150, 180, 200, 250])) / 100 / 10000) * 10000);
  if (ask === 'netProfit') {
    // The profit after tax is an exact percentage of the revenue; the tax is what is left of a rounded profit before tax.
    const pat = (rev * rng.pick([4, 5, 6, 7.5, 8, 10, 12, 12.5, 15])) / 100;
    pbt = Math.round((pat * 100) / rng.pick([70, 75, 80]) / 1000) * 1000;
    tax = pbt - pat;
    if (!Number.isInteger(pat) || tax <= 0) return null;
  } else {
    if (ask === 'inventory') rev = Math.round((cost * 100) / rng.pick([65, 70, 75, 80, 85]) / 1000) * 1000;
    pbt = Math.max(50000, Math.round((rev * rng.int(4, 14)) / 100 / 10000) * 10000);
    tax = (pbt * 25) / 100;
  }
  let purchases = 0;
  if (firm.trade === 'trade') {
    if (ask !== 'inventory') {
      // A gross margin that leaves room for the other expenses above the profit.
      const least = Math.ceil(((pbt - other) * 100) / rev) + 8;
      const margin = rng.int(Math.max(15, least), Math.max(35, least));
      if (margin > 45) return null;
      cost = Math.round((rev * (100 - margin)) / 100 / 1000) * 1000;
      open = inv + rng.step(10000, Math.max(10000, Math.floor(inv / 3 / 10000) * 10000), 10000) * (rng.int(0, 1) === 0 ? 1 : -1);
    } else if (rev - cost <= pbt - other) {
      return null;
    }
    purchases = cost - open + inv;
    if (purchases <= 0 || open <= 0) return null;
  }
  const returns = firm.trade === 'service' ? 0 : rng.step(10000, Math.max(10000, Math.floor(rev / 25 / 5000) * 5000), 5000);
  return { firm, sc, rs, ltb, olt, ltp, od, cm, tp, stp, ppe, nci, inv, tr, cash, prepaid, accrued, rate, sales: rev + returns, returns, other, open, purchases, pbt, tax };
}

/** The statements as the prompt prints them, under the question. */
function printed(question: string, b: Books): string {
  const r = (label: string, value: number): string => `${label}: ${inr(value)}`;
  const goods = b.firm.trade !== 'service';
  return [
    `${b.firm.name} of ${b.firm.city} ${b.firm.does}. ${question}`,
    'Balance Sheet as at 31 March 2026 (extract)',
    r(S.sc, b.sc), r(S.rs, b.rs), r(S.ltb, b.ltb), r(S.olt, b.olt), r(S.ltp, b.ltp), r(S.stb, b.od + b.cm), r(S.tp, b.tp), r(S.stp, b.stp),
    r(S.ppe, b.ppe), ...(b.nci > 0 ? [r(S.nci, b.nci)] : []), r(S.inv, b.inv), r(S.tr, b.tr), r(S.cash, b.cash), r(S.oca, b.prepaid + b.accrued),
    `Note 1. ${b.rate === 11 || b.rate === 8 || b.rate === 18 ? 'An' : 'A'} ${b.rate}% term loan from a bank, repaid ${inr(b.cm)} every year, stood at ${inr(b.ltb + b.cm)} on 31 March 2026; the instalment due by 31 March 2027 is in Note 2.`,
    `Note 2. Short-term borrowings: bank overdraft ${inr(b.od)} and current maturities of the term loan ${inr(b.cm)}.`,
    `Note 3. Other current assets: prepaid expenses ${inr(b.prepaid)} and interest accrued on fixed deposits ${inr(b.accrued)}.`,
    'Statement of Profit and Loss for 2025-26 (extract)',
    ...(goods ? [r(S.sales, b.sales), r(S.returns, b.returns)] : [r(S.rev, b.sales)]),
    r(S.other, b.other),
    ...(b.firm.trade === 'trade' ? [r(S.purchases, b.purchases), r(S.open, b.open)] : []),
    r(S.pbt, b.pbt), r(S.tax, b.tax),
  ].join('\n');
}

/** Drops a wrong answer within a hundredth of the answer or of one kept before it, so no two figures a learner may type sit 0.01 apart. */
function spaced(n: Pick<NumericParts, 'answer' | 'commonErrors'> | null): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!n) return null;
  const kept: { value: number; why: string }[] = [];
  for (const e of n.commonErrors) if (Math.abs(e.value - n.answer) > 1 && kept.every((k) => Math.abs(k.value - e.value) > 1)) kept.push(e);
  return kept.length >= 2 ? { answer: n.answer, commonErrors: kept } : null;
}

/** The balance sheet printed in a prompt agrees: its assets equal its equity and liabilities, and the notes add up to their lines. */
function sheetAgrees(prompt: string): boolean {
  const f = figures(prompt);
  const stb = noteFigure(prompt, 'bank overdraft') + noteFigure(prompt, 'current maturities of the term loan');
  const oca = noteFigure(prompt, 'prepaid expenses') + noteFigure(prompt, 'interest accrued on fixed deposits');
  return total(f, S_ASSETS) === total(f, S_SOURCES) && f.get(S.stb) === stb && f.get(S.oca) === oca;
}

const FROM_STATEMENTS_HINTS = {
  current: [
    'Pick out the current items only, and open the notes: what is inside short-term borrowings and other current assets?',
    'Current ratio = Current assets ÷ Current liabilities. The current maturities of a term loan sit in short-term borrowings, a current liability; prepaid expenses sit in other current assets.',
  ],
  quick: [
    'Start from all the current assets, then take out what will not turn into cash soon.',
    'Quick assets = Current assets - Inventories - Prepaid expenses (accrued interest stays in). Divide by all the current liabilities, the current maturities of the loan included.',
  ],
  debtEquity: [
    "Debt is the long-term debt; equity is the shareholders' funds. Read Note 1 before you add.",
    "Debt = Long-term borrowings + Long-term provisions; the instalment in Note 2 is current, not debt. Equity = Share capital + Reserves and surplus.",
  ],
  inventory: [
    'Inventory is carried at cost, so the turnover is worked on cost: find the cost of revenue from operations first.',
    'Cost of revenue from operations = Opening inventory + Purchases - Closing inventory. Inventory turnover ratio = Cost ÷ Average of opening and closing inventory.',
  ],
  netProfit: [
    'Find the revenue from operations and the profit after tax before you divide.',
    'Revenue from operations = Sales - Sales returns (other income is not part of it). Net profit ratio = Profit after tax ÷ Revenue from operations × 100.',
  ],
};

function fromStatementsTemplate(id: string, ask: Ask, conceptId: string, unit: 'times' | 'percent', question: string) {
  return numericTemplate({
    id, topicId: T, conceptId, difficulty: 'complex', unit,
    generate: (rng) => {
      const b = books(rng, ask);
      if (!b) return null;
      const ca = b.inv + b.tr + b.cash + b.prepaid + b.accrued;
      const cl = b.od + b.cm + b.tp + b.stp;
      const quick = ca - b.inv - b.prepaid;
      const debt = b.ltb + b.ltp;
      const equity = b.sc + b.rs;
      const rev = b.sales - b.returns;
      const pat = b.pbt - b.tax;
      const cost = b.open + b.purchases - b.inv;
      const average = (b.open + b.inv) / 2;
      const caRows: Line[] = [[S.inv, b.inv], [S.tr, b.tr], [S.cash, b.cash], ['Other current assets', b.prepaid + b.accrued]];
      const clRows: Line[] = [['Short-term borrowings', b.od + b.cm], [S.tp, b.tp], ['Short-term provisions', b.stp]];
      const maturityNote = `The short-term borrowings include the current maturities of the term loan, ${inr(b.cm)}: under Schedule III the instalment due within twelve months is a current liability.`;
      let n: Pick<NumericParts, 'answer' | 'commonErrors'> | null;
      let explanation: string[];
      if (ask === 'current') {
        n = typed('times', ca / cl, [
          [ca / (cl - b.cm), 'Left the current maturities of the term loan out of the current liabilities; they are part of the short-term borrowings.'],
          [ca / (cl + b.ltb), 'Counted the long-term borrowings among the current liabilities.'],
          [(ca - b.prepaid - b.accrued) / cl, 'Left the other current assets (prepaid expenses and accrued interest) out of the current assets.'],
          [ca / (cl - b.stp), 'Left the short-term provisions out of the current liabilities.'],
          b.nci > 0 && [(ca + b.nci) / cl, 'Counted the non-current investments among the current assets.'],
          [cl / ca, 'Divided the current liabilities by the current assets: the ratio is upside down.'],
        ]);
        explanation = [
          adds('Current assets', caRows),
          adds('Current liabilities', clRows),
          maturityNote,
          `Long-term borrowings, other long-term liabilities and long-term provisions are non-current${b.nci > 0 ? ', and so are the non-current investments' : ''}.`,
          `Current ratio = ${inr(ca)} ÷ ${inr(cl)} = ${two(ca / cl)} : 1.`,
        ];
      } else if (ask === 'quick') {
        n = typed('times', quick / cl, [
          [(quick + b.prepaid) / cl, 'Left the prepaid expenses in the quick assets; they will never turn into cash.'],
          [(ca - b.prepaid) / cl, 'Took out the prepaid expenses but left the inventories in; inventories are not quick assets.'],
          [ca / cl, 'Kept the inventories and the prepaid expenses in: that is the current ratio.'],
          [quick / (cl - b.cm), 'Left the current maturities of the term loan out of the current liabilities; they are part of the short-term borrowings.'],
          [(quick - b.accrued) / cl, 'Took the whole of the other current assets out; only the prepaid expenses go, and the accrued interest is a quick asset.'],
          [cl / quick, 'Divided the current liabilities by the quick assets: the ratio is upside down.'],
        ]);
        explanation = [
          adds('Current assets', caRows),
          `Quick assets = ${inr(ca)} - Inventories ${inr(b.inv)} - Prepaid expenses ${inr(b.prepaid)} = ${inr(quick)}. The interest accrued (${inr(b.accrued)}) stays in: it will be received in cash.`,
          adds('Current liabilities', clRows),
          maturityNote,
          `Quick ratio = ${inr(quick)} ÷ ${inr(cl)} = ${two(quick / cl)} : 1.`,
        ];
      } else if (ask === 'debtEquity') {
        n = typed('times', debt / equity, [
          [(debt + b.cm) / equity, 'Added the current maturities of the term loan to the debt; they are in short-term borrowings, a current liability.'],
          [(debt + b.olt) / equity, 'Counted the other long-term liabilities as debt; debt is long-term borrowings and long-term provisions.'],
          [b.ltb / equity, 'Left the long-term provisions out of the debt.'],
          [debt / b.sc, "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
          [(debt + cl) / equity, 'Counted the current liabilities as debt too.'],
          [equity / debt, "Divided the shareholders' funds by the debt: the ratio is upside down."],
        ]);
        explanation = [
          `Debt = Long-term borrowings ${inr(b.ltb)} + Long-term provisions ${inr(b.ltp)} = ${inr(debt)}.`,
          `The instalment of ${inr(b.cm)} due by 31 March 2027 is in short-term borrowings (Note 2): it is current, so it is not debt. Other long-term liabilities (${inr(b.olt)}) are not borrowings and stay out.`,
          `Equity (shareholders' funds) = Share capital ${inr(b.sc)} + Reserves and surplus ${inr(b.rs)} = ${inr(equity)}.`,
          `Debt to equity ratio = ${inr(debt)} ÷ ${inr(equity)} = ${two(debt / equity)} : 1.`,
        ];
      } else if (ask === 'inventory') {
        n = typed('times', cost / average, [
          [rev / average, 'Divided the revenue from operations by the average inventory; inventory is at cost, so the cost of revenue from operations is used.'],
          [cost / b.inv, 'Divided by the closing inventory instead of the average inventory.'],
          [b.purchases / average, 'Took the purchases as the cost of revenue from operations, without adjusting for the change in inventories.'],
          [cost / b.open, 'Divided by the opening inventory instead of the average inventory.'],
          [cost / (b.open + b.inv), 'Added the two inventories but did not halve the total.'],
        ]);
        explanation = [
          `Cost of revenue from operations = Opening inventory ${inr(b.open)} + Purchases ${inr(b.purchases)} - Closing inventory ${inr(b.inv)} = ${inr(cost)}.`,
          `Average inventory = (${inr(b.open)} + ${inr(b.inv)}) ÷ 2 = ${inr(average)}.`,
          `Inventory turnover ratio = ${inr(cost)} ÷ ${inr(average)} = ${two(cost / average)} times.`,
        ];
      } else {
        n = typed('percent', (pat / rev) * 100, [
          [(b.pbt / rev) * 100, 'Used the profit before tax; the ratio was asked on the profit after tax.'],
          [(pat / b.sales) * 100, 'Divided by the sales before deducting the sales returns.'],
          [(pat / (rev + b.other)) * 100, 'Added the other income to the revenue from operations; other income is not revenue from operations.'],
          [(b.pbt / b.sales) * 100, 'Used the profit before tax and the sales before returns.'],
        ]);
        explanation = [
          `Revenue from operations = Sales ${inr(b.sales)} - Sales returns ${inr(b.returns)} = ${inr(rev)}. Other income is not part of it.`,
          `Profit after tax = ${inr(b.pbt)} - ${inr(b.tax)} = ${inr(pat)}.`,
          `Net profit ratio = ${inr(pat)} ÷ ${inr(rev)} × 100 = ${two((pat / rev) * 100)}%.`,
        ];
      }
      const s = spaced(n);
      return s && { prompt: printed(question, b), ...s, explanation, hints: FROM_STATEMENTS_HINTS[ask] };
    },
    // Read every figure back from the printed statements and work the ratio again from them.
    verify: (q) => {
      if (!sheetAgrees(q.prompt)) return false;
      const f = figures(q.prompt);
      const get = (label: string): number => f.get(label) ?? 0;
      const prepaid = noteFigure(q.prompt, 'prepaid expenses');
      const cl = total(f, S_CL);
      let top: number, bottom: number;
      if (ask === 'current') [top, bottom] = [total(f, S_CA), cl];
      else if (ask === 'quick') [top, bottom] = [total(f, S_CA) - get(S.inv) - prepaid, cl];
      else if (ask === 'debtEquity') [top, bottom] = [get(S.ltb) + get(S.ltp), get(S.sc) + get(S.rs)];
      else if (ask === 'inventory') [top, bottom] = [2 * (get(S.open) + get(S.purchases) - get(S.inv)), get(S.open) + get(S.inv)];
      else [top, bottom] = [(get(S.pbt) - get(S.tax)) * 100, get(S.sales) - get(S.returns)];
      return bottom > 0 && q.answer * bottom === top * 100;
    },
  });
}

const fromStatementsCurrent = fromStatementsTemplate('ar-from-statements-current', 'current', 'ar-liquidity', 'times', `Find its current ratio ${AS_RATIO}.`);
const fromStatementsQuick = fromStatementsTemplate('ar-from-statements-quick', 'quick', 'ar-liquidity', 'times', `Find its quick ratio ${AS_RATIO}.`);
const fromStatementsDebtEquity = fromStatementsTemplate(
  'ar-from-statements-debt-equity', 'debtEquity', 'ar-solvency', 'times',
  `Find its debt to equity ratio ${AS_RATIO}, debt being the long-term debt (long-term borrowings and long-term provisions).`,
);
const fromStatementsInventory = fromStatementsTemplate('ar-from-statements-inventory-turnover', 'inventory', 'ar-activity', 'times', `Find its inventory turnover ratio ${IN_TIMES}.`);
const fromStatementsNetProfit = fromStatementsTemplate('ar-from-statements-net-profit', 'netProfit', 'ar-profitability', 'percent', `Find its net profit ratio on the profit after tax, ${AS_PERCENT}.`);

// ===============================================================================================================
// The effect of a transaction on the turnover and profit ratios (inventory turnover, gross profit, operating ratio,
// interest coverage, working capital turnover). Each item names its business, says where the ratio stands and gives
// one transaction; the options are the verdicts and a wrong reason, each wrong one a real slip. Added after the mock
// papers were set (src/generators/outsidePapers.ts).
// ===============================================================================================================

const EFFECT_FLOW_HINTS = [
  'Write the formula of the ratio, then ask which of its two figures the transaction touches.',
  'A figure that is not in the formula (cash, trade receivables, tax) cannot move the ratio. Non-operating items stay out of the operating ratio; interest on long-term debt is the denominator of the interest coverage ratio.',
];
const flow = (prompt: string, correct: string, wrong: [string, string][], explanation: string): McqParts => ({
  prompt, correct, distractors: wrong.map(([text, why]) => ({ text, why })), explanation, hints: EFFECT_FLOW_HINTS,
});
const EFFECT_FLOW: McqParts[] = [
  flow('The inventory turnover ratio of Kalinga Cycle Traders Ltd., Bhubaneswar, is 5 times. In March it sells bicycles costing ₹40,000 for ₹50,000 on credit. What happens to the inventory turnover ratio?',
    'Rises: the cost of revenue from operations goes up and the closing inventory, and so the average inventory, goes down',
    [
      ['Does not change: one current asset (inventories) is replaced by another (trade receivables)', 'Used the reasoning of the current ratio; the inventory turnover ratio is the cost of revenue from operations over the average inventory.'],
      ['Falls: inventories go down', 'A smaller average inventory under the same or a larger cost raises the ratio; it does not lower it.'],
      ['Rises: revenue from operations goes up by ₹50,000', 'Right verdict, wrong reason: revenue is not in the inventory turnover ratio, which is worked on cost.'],
    ],
    'Inventory turnover = Cost of revenue from operations ÷ Average inventory. The sale adds ₹40,000 to the cost of revenue from operations and takes ₹40,000 out of the closing inventory: the numerator rises and the denominator falls, so the ratio rises.'),
  flow('The inventory turnover ratio of Ganpati Hardware Mart Ltd., Pune, is 6 times. On 28 March it buys paint worth ₹60,000 on credit, all of it still unsold on 31 March. What happens to the inventory turnover ratio?',
    'Falls: the closing inventory, and so the average inventory, rises while the cost of revenue from operations does not change',
    [
      ['Rises: purchases add to the cost of revenue from operations', 'Unsold goods are in the closing inventory, so the cost of revenue from operations is unchanged.'],
      ['Does not change: the goods were bought on credit', 'How the goods are paid for does not matter; the inventory has gone up.'],
      ['Does not change: trade payables and inventories rise by the same amount', 'Trade payables are not in this ratio; only the cost of revenue from operations and the average inventory are.'],
    ],
    'Purchases rise by ₹60,000 and so does the closing inventory, so the cost of revenue from operations stays the same. The average inventory rises, so the ratio falls.'),
  flow('The gross profit ratio of Annapurna Supermarts Ltd., Indore, is 20%. It sells a lot of dry fruits costing ₹60,000 for ₹1,00,000. What happens to the gross profit ratio?',
    'Rises: this sale earns 40% of its revenue as gross profit, more than the present 20%',
    [
      ['Falls: revenue from operations rises, so the gross profit is divided by more', 'Looked only at the denominator; the gross profit rises too, and by a larger share.'],
      ['Does not change: a sale adds to the gross profit and to the revenue in the same proportion', 'Only a sale at the present margin of 20% would leave the ratio as it is; this one earns 40%.'],
      ['Rises: trade receivables or cash go up', 'Right verdict, wrong reason: neither cash nor receivables is in the gross profit ratio.'],
    ],
    'Gross profit ratio = Gross profit ÷ Revenue from operations × 100. The sale adds ₹40,000 of gross profit on ₹1,00,000 of revenue, a margin of 40%. Adding a 40% sale to a 20% business lifts the overall ratio.'),
  flow('The gross profit ratio of Sanjivani Medical Distributors Ltd., Lucknow, is 25%. On 30 March it buys medicines of ₹80,000 on credit; none is sold by 31 March. What happens to the gross profit ratio?',
    'Does not change: neither the revenue from operations nor the cost of revenue from operations changes',
    [
      ['Falls: purchases raise the cost of revenue from operations', 'Unsold goods go into the closing inventory, so the cost of revenue from operations is the same.'],
      ['Rises: more goods are ready for sale', 'Goods earn nothing until they are sold.'],
      ['Falls: trade payables rise', 'Trade payables are not in the gross profit ratio.'],
    ],
    'Purchases and closing inventory both rise by ₹80,000, so the cost of revenue from operations is unchanged; revenue is unchanged too. The gross profit ratio stays at 25%.'),
  flow('The operating ratio of Sahyog Roadways Ltd., Nagpur, is 80%. It pays ₹30,000 more for the salaries of its office staff. What happens to the operating ratio?',
    'Rises: operating expenses go up and revenue from operations does not change',
    [
      ['Falls: cash goes down', 'Cash is not in the operating ratio.'],
      ['Does not change: salaries are a non-operating expense', 'Salaries of the staff are a cost of running the business, an operating expense.'],
      ['Falls: the operating profit is smaller, so less is left to compare', 'The operating ratio is cost over revenue; more cost on the same revenue makes it larger.'],
    ],
    'Operating ratio = (Cost of revenue from operations + Operating expenses) ÷ Revenue from operations × 100. The salaries add to the operating expenses, so the ratio rises, which is a worse result.'),
  flow('The operating ratio of Malabar Coir Products Ltd., Alappuzha, is 75%. Coir yarn worth ₹50,000, not insured, is destroyed by fire. What happens to the operating ratio?',
    'Does not change: a loss by fire is a non-operating item',
    [
      ['Rises: expenses go up by ₹50,000', 'A loss by fire is abnormal and non-operating; it is left out of the operating cost.'],
      ['Falls: inventories go down', 'Inventories are not a term of the operating ratio.'],
      ['Rises: the net profit falls', 'The net profit ratio falls; the operating ratio leaves out non-operating losses.'],
    ],
    'The goods lost are taken out of the cost of the goods and charged as a loss by fire, a non-operating item. Neither the operating cost nor the revenue from operations changes, so the operating ratio stays at 75%.'),
  flow('The operating ratio of Brahmaputra Tea Packers Ltd., Guwahati, is 82%. It receives a dividend of ₹25,000 on shares it holds as an investment. What happens to the operating ratio?',
    'Does not change: dividend received is a non-operating income',
    [
      ['Falls: income goes up, so cost is a smaller part of it', 'The base is revenue from operations; other income is not added to it.'],
      ['Rises: the cash balance goes up', 'Cash is not in the operating ratio.'],
      ['Falls: the operating profit rises', 'The dividend is not operating profit; the operating profit is unchanged.'],
    ],
    'A dividend on investments is other income of a company whose business is packing tea. It changes neither the operating cost nor the revenue from operations.'),
  flow('The interest coverage ratio of Saurashtra Pump Works Ltd., Rajkot, is 6 times. At the start of the year it issues 10% debentures of ₹5,00,000, and its profit before interest and tax stays the same. What happens to the interest coverage ratio?',
    'Falls: interest on long-term debt rises while the profit before interest and tax does not change',
    [
      ['Rises: the company has more funds', 'The funds raised are not a term of this ratio; the interest on them is, and it lowers the ratio.'],
      ['Does not change: the interest is charged after the profit before interest and tax', 'Right that it does not touch the numerator, but the interest is the denominator.'],
      ['Falls: the debt to equity ratio rises', 'True of the debt to equity ratio, but that is not why the coverage falls.'],
    ],
    'Interest coverage = Profit before interest and tax ÷ Interest on long-term debt. The new debentures add ₹50,000 of interest a year to the denominator, so the profit covers the interest fewer times.'),
  flow('The interest coverage ratio of Krishi Mitra Agro Inputs Ltd., Nashik, is 4 times. At the start of the year it repays ₹2,00,000 of its 12% long-term bank loan, and its profit before interest and tax stays the same. What happens to the interest coverage ratio?',
    'Rises: interest on long-term debt falls while the profit before interest and tax does not change',
    [
      ['Falls: cash goes out of the business', 'Cash is not in the interest coverage ratio.'],
      ['Does not change: repaying a loan is not an expense', 'True, but the interest on the part repaid is no longer charged, and interest is the denominator.'],
      ['Falls: less profit is left before interest', 'The profit before interest and tax is the same; only the interest changes.'],
    ],
    'The loan repaid saves ₹24,000 of interest a year. A smaller denominator under the same profit before interest and tax raises the coverage.'),
  flow('The interest coverage ratio of Prerna Coaching Centres Ltd., Kota, is 8 times. The rate of income tax on companies goes up, so its tax for the year rises. What happens to the interest coverage ratio?',
    'Does not change: the ratio uses the profit before interest and tax',
    [
      ['Falls: the profit after tax is smaller', 'The ratio is worked on the profit before interest and tax; tax is charged after it.'],
      ['Rises: tax is now a larger charge than interest', 'Tax has no bearing on the profit out of which interest is paid.'],
      ['Falls: more cash goes out as tax', 'Cash is not in this ratio.'],
    ],
    'Interest is paid out of the profit before interest and tax, which is worked out before any tax. A higher tax changes neither term.'),
  flow('The working capital turnover ratio of Arogya Diagnostic Clinics Ltd., Jaipur, is 6 times, and its working capital is positive. It buys a blood analyser for ₹1,00,000 and pays by cheque. What happens to the working capital turnover ratio?',
    'Rises: working capital falls while revenue from operations does not change',
    [
      ['Falls: the assets used in the business go up', 'The analyser is a non-current asset; only the working capital is in this ratio, and it falls.'],
      ['Does not change: one asset replaces another', 'One is current and the other non-current, so the working capital changes.'],
      ['Falls: cash, a current asset, goes down', 'Right that working capital falls, wrong about the effect: a smaller denominator raises the ratio.'],
    ],
    'Working capital turnover = Revenue from operations ÷ Working capital. Cash falls by ₹1,00,000 and no current liability changes, so working capital falls and the ratio rises.'),
  flow('The working capital turnover ratio of Kalinga Cycle Traders Ltd., Bhubaneswar, is 5 times, and its working capital is positive. It issues equity shares for ₹3,00,000 in cash. What happens to the working capital turnover ratio?',
    'Falls: working capital rises while revenue from operations does not change',
    [
      ['Rises: the business has more money to trade with', 'More money is not more revenue; revenue from operations is unchanged.'],
      ['Does not change: share capital is not a current item', 'Share capital is not, but the cash received is a current asset, so working capital rises.'],
      ['Rises: cash, a current asset, goes up', 'Right that working capital rises, wrong about the effect: a larger denominator lowers the ratio.'],
    ],
    'Cash rises by ₹3,00,000 and current liabilities do not change, so working capital rises. The same revenue over a larger working capital gives a lower ratio.'),
  flow('The working capital turnover ratio of Sanjivani Medical Distributors Ltd., Lucknow, is 7 times. It collects ₹90,000 from its trade receivables by cheque. What happens to the working capital turnover ratio?',
    'Does not change: one current asset replaces another, so working capital is the same',
    [
      ['Falls: cash at bank goes up', 'Trade receivables fall by the same amount, so current assets do not change.'],
      ['Rises: trade receivables go down', 'Cash rises by the same amount, so current assets do not change.'],
      ['Rises: revenue from operations goes up', 'Collecting a debt is not a sale; the revenue was counted when the goods were sold.'],
    ],
    'Cash at bank rises by ₹90,000 and trade receivables fall by ₹90,000. Working capital and revenue from operations are both unchanged.'),
];

const effectFlow = factsTemplate({ id: 'ar-effect-turnover-profit', topicId: T, conceptId: 'ar-effect', difficulty: 'medium', facts: EFFECT_FLOW });

const templates: Template[] = [
  classifyRatio, purpose, liquidityTerms, currentRatio, quickRatio, liquidityFromSheet, quickFromCurrent,
  solvencyTerms, debtEquity, debtEquityWhole, debtEquitySheet, debtEquityDerived, totalAssetsDebt, proprietary, interestCoverage, interestCoverageAfterTax, debtCapitalEmployed,
  activityTerms, inventoryTurnover, inventoryTurnoverCost, inventoryTurnoverMargin, receivablesTurnover, collectionPeriod, payablesTurnover, fixedAssetsTurnover, workingCapitalTurnover, netAssetsTurnover,
  profitabilityTerms, grossProfitRatio, netProfitRatio, operatingRatio, operatingProfitRatio, operatingProfitFromNet, returnOnInvestment, returnOnInvestmentAssets,
  effectCurrent, effectCurrentLow, effectQuick, effectDebtEquity, effectOtherSolvency, effectWhich, effectNewRatio,
  missingSolvency, missingFromWorkingCapital, missingInventory, missingTwoRatios, missingRevenueFromInventory, missingFromReceivables, missingGrossProfit, missingInventoryBalance, missingOperating,
  arAssertionReason,
  fromStatementsCurrent, fromStatementsQuick, fromStatementsDebtEquity, fromStatementsInventory, fromStatementsNetProfit, effectFlow,
];

export default templates;
