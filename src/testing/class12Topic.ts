// A small topic of Class 12, for tests only: one template of every new kind (a ratio answer, a "times" answer, an
// entry with a partner's accounts, partners' capital accounts in columns, a comparative statement with a percentage
// and negative figures, the same statement with the figures of its two years printed, a cash flow statement in parts,
// a balance sheet with notes) and a pack with a ladder. The unit tests put it in the place of a real Class 12 topic,
// and the test build of the app (NEXT_PUBLIC_E2E) can switch it on as a topic of its own. It is not registered
// anywhere else and never reaches a learner.
import { buildLadder } from '@/content/ladder';
import type { Card, Concept, Question, StatementQuestion, TopicMeta, TopicPack } from '@/content/types';
import { partnerCapital, partnerCurrent, partnerDrawings, partnerLoan } from '@/engine/accounts';
import { columnarAccount, type DatedEntry } from '@/engine/books';
import {
  accountTemplate,
  amount,
  columnarSides,
  formatINR,
  journalTemplate,
  keepFor,
  lowestTerms,
  mcqTemplate,
  numericTemplate,
  partnerColumns,
  statementTemplate,
} from '@/generators/authoring';
import type { Template } from '@/generators/types';

/** The id the sample has as a topic of its own, in the test build of the app. */
export const CLASS12_SAMPLE_TOPIC = 'class-12-sample';

/** How the sample is listed in the Class 12 course when it is switched on. */
export const CLASS12_SAMPLE_META: TopicMeta = {
  id: CLASS12_SAMPLE_TOPIC,
  courseId: 'cbse-12-accountancy',
  title: 'Sample of Class 12',
  unit: 'Accounting for Partnership Firms',
  kind: 'practical',
  status: 'comingSoon',
  description: 'A ratio, a number of times, capital accounts in columns and statements in parts.',
  whyItMatters: 'It is here so that the tests can play a topic of Class 12.',
};

const FIRMS = [
  ['Asha', 'Bimal', 'Chitra', 'Dev'],
  ['Farah', 'Gopal', 'Hema', 'Irfan'],
  ['Kavita', 'Lalit', 'Meera', 'Nikhil'],
];
const OLD_RATIOS = [
  [3, 2],
  [2, 1],
  [5, 3],
  [3, 1],
  [4, 3],
];
const list = (names: readonly string[]): string => (names.length === 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * The change from one year to the next as a percentage of the first, in hundredths of a percent, to two decimal
 * places; null when it falls exactly between two of them (a student might round it either way).
 */
function percentChange(before: number, after: number): number | null {
  const millionths = ((after - before) * 1_000_000) / before;
  return Number.isInteger(millionths) && Math.abs(millionths % 100) === 50 ? null : Math.round(millionths / 100);
}

/** What `generate` kept of the capital accounts, for `verify`: what each partner's balance should come to. */
const capitalsKept = keepFor<{ closing: number[] }>();

/**
 * The templates of the sample, for the topic they are filed under. `p` starts every id (of the templates, and in the
 * pack of the concepts, the card and the questions), so that a test can put the sample in the place of two topics.
 */
export function class12Templates(topicId: string, p = 's12'): Template[] {
  const of = (id: string, conceptId: string, difficulty: Template['difficulty']) => ({ id, topicId, conceptId, difficulty });
  return [
    mcqTemplate({
      ...of(`${p}-deed-interest`, `${p}-basics`, 'easy'),
      generate: (rng) => {
        const [a, b] = rng.pick(FIRMS);
        const loan = formatINR(amount(rng, 50000, 300000, 10000));
        return {
          prompt: `${a} and ${b} are partners and have no partnership deed. ${a} has given the firm a loan of ${loan}. At what rate is interest on the loan allowed?`,
          correct: '6% a year',
          distractors: [
            { text: 'No interest is allowed', why: "Applied the rule for interest on capital to a partner's loan." },
            { text: '12% a year', why: 'Took a rate that partners often agree in a deed; without a deed the Act fixes it.' },
            { text: '9% a year', why: 'Guessed a market rate; without a deed the Act fixes the rate.' },
            { text: 'The rate the bank charges the firm', why: 'Took the rate of a bank loan; the Act fixes 6% a year.' },
          ],
          explanation: "Without a deed, interest on a partner's loan is allowed at 6% a year. It is a charge against profit.",
        };
      },
    }),
    numericTemplate({
      ...of(`${p}-current-ratio`, `${p}-basics`, 'easy'),
      unit: 'times',
      generate: (rng) => {
        const liabilities = amount(rng, 100000, 400000, 20000);
        const ratio = rng.pick([125, 200, 250, 400]);
        const assets = (liabilities * ratio) / 100;
        return {
          prompt: `The current assets of a company are ${formatINR(assets)} and its current liabilities are ${formatINR(liabilities)}. Find the current ratio. (For 2.5 : 1 type 2.5.)`,
          answer: ratio,
          commonErrors: [
            { value: 10000 / ratio, why: 'Divided the current liabilities by the current assets.' },
            { value: ratio - 100, why: 'Deducted the current liabilities from the current assets before dividing.' },
          ],
          explanation: ['Current ratio = Current assets ÷ Current liabilities.', `${formatINR(assets)} ÷ ${formatINR(liabilities)} = ${ratio / 100} : 1.`],
        };
      },
      verify: (q) => q.commonErrors.every((e) => e.value !== q.answer),
    }),
    journalTemplate({
      ...of(`${p}-capital-brought`, `${p}-basics`, 'easy'),
      generate: (rng) => {
        const [name] = rng.shuffle(rng.pick(FIRMS));
        const brought = amount(rng, 50000, 400000, 10000);
        return {
          prompt: `${name}, a partner, brings in ${formatINR(brought)} as additional capital by cheque. Capitals are fluctuating. Pass the entry.`,
          lines: [
            { accountId: 'bank', side: 'Dr', amount: brought },
            { accountId: partnerCapital(name), side: 'Cr', amount: brought },
          ],
          explanation: ['The cheque is paid into the bank: Bank A/c is debited.', `It is ${name}'s capital: ${name}'s Capital A/c is credited.`],
          distractorAccounts: [partnerCurrent(name), partnerLoan(name)],
        };
      },
    }),
    numericTemplate({
      ...of(`${p}-new-ratio`, `${p}-basics`, 'medium'),
      unit: 'ratio',
      generate: (rng) => {
        const [a, b, c] = rng.pick(FIRMS);
        const [x, y] = rng.pick(OLD_RATIOS);
        const n = rng.pick([4, 5, 6]);
        // The new partner takes 1/n from the old partners in their old ratio, so they keep (n - 1)/n in that ratio.
        const answer = lowestTerms([x * (n - 1), y * (n - 1), x + y]);
        return {
          prompt: `${a} and ${b} share profits in the ratio ${x}:${y}. They admit ${c} for a 1/${n} share, which ${c} takes from them in their old ratio. Find the new ratio of ${a}, ${b} and ${c}.`,
          answer,
          commonErrors: [
            { value: [x, y, 1], why: 'Kept the old ratio and gave the new partner one share, without reducing the old shares.' },
            { value: lowestTerms([y * (n - 1), x * (n - 1), x + y]), why: 'Wrote the shares of the two old partners the wrong way round.' },
            { value: [1, 1, 1], why: 'Shared the profit equally among the three.' },
          ],
          explanation: [
            `${a} and ${b} keep ${n - 1}/${n} of the profit between them, in their old ratio ${x}:${y}.`,
            `${a}: ${n - 1}/${n} × ${x}/${x + y} = ${x * (n - 1)}/${n * (x + y)}. ${b}: ${n - 1}/${n} × ${y}/${x + y} = ${y * (n - 1)}/${n * (x + y)}.`,
            `${c}: 1/${n} = ${x + y}/${n * (x + y)}.`,
            `New ratio = ${x * (n - 1)}:${y * (n - 1)}:${x + y}, which is ${answer.join(':')} in its lowest terms.`,
          ],
        };
      },
      // The new partner's share of the whole is 1/n: one term over the sum of the three.
      verify: (q) => [4, 5, 6].some((n) => q.answer[2] * n === q.answer.reduce((sum, term) => sum + term, 0)),
    }),
    accountTemplate({
      ...of(`${p}-capital-accounts`, `${p}-formats`, 'medium'),
      generate: (rng) => {
        const names = rng.pick(FIRMS).slice(0, rng.pick([3, 4]));
        const n = names.length;
        const opening = names.map(() => amount(rng, 200000, 600000, 50000));
        const drawings = names.map(() => amount(rng, 20000, 60000, 5000));
        const shares = rng.pick(n === 3 ? [[5, 3, 2], [2, 2, 1], [3, 2, 1]] : [[4, 3, 2, 1], [3, 3, 2, 2], [2, 1, 1, 1]]);
        const unit = amount(rng, 10000, 30000, 2000);
        const brings = rng.int(0, n - 1);
        const brought = amount(rng, 50000, 150000, 10000);
        const paid = rng.int(0, n - 1);
        const salary = amount(rng, 24000, 60000, 12000);
        const profit = unit * shares.reduce((sum, s) => sum + s, 0);
        const capitals = names.map(partnerCapital);
        const entries: DatedEntry[] = [
          { date: '1 October 2025', lines: [{ accountId: 'bank', side: 'Dr', amount: brought }, { accountId: capitals[brings], side: 'Cr', amount: brought }] },
          ...names.map((name, i): DatedEntry => ({ date: '31 March 2026', lines: [{ accountId: capitals[i], side: 'Dr', amount: drawings[i] }, { accountId: partnerDrawings(name), side: 'Cr', amount: drawings[i] }] })),
          { date: '31 March 2026', lines: [{ accountId: 'partnersSalary', side: 'Dr', amount: salary }, { accountId: capitals[paid], side: 'Cr', amount: salary }] },
          { date: '31 March 2026', lines: [{ accountId: 'profitAndLossAppropriation', side: 'Dr', amount: profit }, ...capitals.map((accountId, i) => ({ accountId, side: 'Cr' as const, amount: unit * shares[i] }))] },
        ];
        const data = [
          `${list(names)} are partners with fluctuating capitals. They share profits in the ratio ${shares.join(':')}. The year ends on 31 March 2026.`,
          `Capitals on 1 April 2025: ${names.map((name, i) => `${name} ${formatINR(opening[i])}`).join(', ')}.`,
          `1 October 2025: ${names[brings]} brought in additional capital of ${formatINR(brought)} by cheque.`,
          `Drawings during the year: ${names.map((name, i) => `${name} ${formatINR(drawings[i])}`).join(', ')}.`,
          `${names[paid]} is allowed a salary of ${formatINR(salary)} for the year.`,
          `The profit left to be shared, after the salary, is ${formatINR(profit)}.`,
        ].join('\n');
        capitalsKept.keep(data, { closing: names.map((_, i) => opening[i] + (i === brings ? brought : 0) + (i === paid ? salary : 0) + unit * shares[i] - drawings[i]) });
        const view = columnarAccount(entries, capitals, { date: '1 April 2025', balances: opening.map((amount) => ({ side: 'Cr' as const, amount })) });
        return {
          task: "Prepare the partners' capital accounts in columns for the year ended 31 March 2026 and bring the balances down on 1 April 2026.",
          data,
          title: "Partners' Capital Accounts",
          columns: partnerColumns(names),
          ...columnarSides(view, { closeOn: '31 March 2026', reopenOn: '1 April 2026' }),
          distractors: ['Current A/c', 'Interest on Capital A/c', 'Cash A/c'],
          explanation: [
            'Each partner has a column. A capital has a credit balance, so the opening balances are on the credit side.',
            'Additional capital, salary and the share of profit are credited to the partner they belong to.',
            'Drawings are debited. The balance of each column is carried down on the debit side and brought down on the credit side.',
          ],
        };
      },
      verify: (q) => {
        const kept = capitalsKept.of(q.data);
        const closing = q.sides[0].rows.find((r) => r.closing);
        return kept !== undefined && closing !== undefined && closing.amounts.every((a, c) => a === kept.closing[c]) && q.sides[1].below[0]?.amounts.every((a, c) => a === kept.closing[c]) === true;
      },
    }),
    statementTemplate({
      ...of(`${p}-comparative`, `${p}-formats`, 'medium'),
      generate: (rng) => {
        // A figure of the first year and its change in hundredths of a percent: every figure is a whole rupee.
        const line = (first: number, changes: number[]) => {
          const change = rng.pick(changes);
          return { first, second: first + (first * change) / 10000 };
        };
        const revenue = line(amount(rng, 800000, 2000000, 40000), [1000, 1250, 2000, 2500]);
        const other = line(amount(rng, 40000, 200000, 40000), [-5000, -2500, -1250]);
        const staff = line(amount(rng, 200000, 600000, 40000), [500, 1000, 2500]);
        const rest = line(amount(rng, 80000, 400000, 40000), [-2500, -1000, 1000, 2000]);
        const total = (...lines: { first: number; second: number }[]) => ({ first: lines.reduce((sum, l) => sum + l.first, 0), second: lines.reduce((sum, l) => sum + l.second, 0) });
        const income = total(revenue, other);
        const expenses = total(staff, rest);
        const profit = { first: income.first - expenses.first, second: income.second - expenses.second };
        if (profit.first <= 0 || profit.second <= 0 || profit.first === profit.second || income.first === income.second || expenses.first === expenses.second) return null;
        const figures = (l: { first: number; second: number }): number[] | null => {
          const percent = percentChange(l.first, l.second);
          return percent === null ? null : [l.first, l.second, l.second - l.first, percent];
        };
        const all = [revenue, other, income, staff, rest, expenses, profit].map(figures);
        if (all.some((f) => f === null)) return null;
        const [r, o, i, s, x, e, p] = all as number[][];
        const company = rng.pick(['Sagar Mills Ltd.', 'Nila Foods Ltd.', 'Vayu Tools Ltd.']);
        const say = (name: string, l: { first: number; second: number }) => `${name}: ${formatINR(l.first)} in 2024-25, ${formatINR(l.second)} in 2025-26`;
        return {
          task: `For ${company}, prepare the Comparative Statement of Profit and Loss. Give every percentage to two decimal places and show a decrease with a minus sign.`,
          data: [`From the Statements of Profit and Loss of ${company} for the years ended 31 March 2025 and 31 March 2026:`, say('Revenue from operations', revenue), say('Other income', other), say('Employee benefits expense', staff), say('Other expenses', rest)].join('\n'),
          title: `Comparative Statement of Profit and Loss of ${company}`,
          columns: ['2024-25 (₹)', '2025-26 (₹)', { name: 'Absolute change (₹)', signed: true }, { name: 'Percentage change (%)', unit: 'percent', signed: true }],
          rows: [
            { label: 'Revenue from operations', amounts: r },
            { label: 'Other income', amounts: o },
            { subtotal: 'Total revenue', amounts: i, sum: 'block' },
            { heading: 'Expenses' },
            { label: 'Employee benefits expense', amounts: s },
            { label: 'Other expenses', amounts: x },
            { subtotal: 'Total expenses', amounts: e, sum: 'section' },
            { subtotal: 'Profit before tax', amounts: p },
          ],
          distractors: ['Cost of materials consumed', 'Finance costs', 'Depreciation and amortisation expense'],
          explanation: [
            'Absolute change = figure of 2025-26 less figure of 2024-25. A fall is a negative figure.',
            'Percentage change = absolute change ÷ figure of 2024-25 × 100.',
            'Total revenue and total expenses are added up for each year; profit before tax is total revenue less total expenses.',
            'The percentage of a total is worked out from the total itself: it is not the sum of the percentages above it.',
          ],
        };
      },
      // Every line, and every sub-total: the change is the second year less the first.
      verify: (q) => [...q.rows.map((row) => row.amounts), ...(q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line.amounts] : []))].every(([first, second, change]) => change === second - first),
    }),
    statementTemplate({
      // The same statement as a board paper sets it: the figures of the two years are given, so they are printed as
      // each line is chosen, and the student types the totals, the tax and the two columns of change.
      ...of(`${p}-comparative-given`, `${p}-formats`, 'medium'),
      generate: (rng) => {
        type Line = { first: number; second: number };
        const line = (first: number, changes: number[]): Line => ({ first, second: first + (first * rng.pick(changes)) / 10000 });
        const revenue = line(amount(rng, 800000, 2000000, 40000), [1000, 1250, 2000, 2500]);
        const other = line(amount(rng, 40000, 200000, 40000), [-5000, -2500, -1250]);
        const staff = line(amount(rng, 200000, 600000, 40000), [500, 1000, 2500]);
        const rest = line(amount(rng, 80000, 400000, 40000), [-2500, -1000, 1000, 2000]);
        const add = (a: Line, b: Line): Line => ({ first: a.first + b.first, second: a.second + b.second });
        const less = (a: Line, b: Line): Line => ({ first: a.first - b.first, second: a.second - b.second });
        const income = add(revenue, other);
        const expenses = add(staff, rest);
        const before = less(income, expenses);
        if (before.first <= 0 || before.second <= 0 || before.first === before.second || income.first === income.second || expenses.first === expenses.second) return null;
        // Tax at 30% of the profit of each year: every figure in these lines is a whole thousand of rupees.
        const tax: Line = { first: (before.first * 3) / 10, second: (before.second * 3) / 10 };
        const after = less(before, tax);
        const figures = (l: Line): number[] | null => {
          const percent = percentChange(l.first, l.second);
          return percent === null ? null : [l.first, l.second, l.second - l.first, percent];
        };
        const all = [revenue, other, income, staff, rest, expenses, before, tax, after].map(figures);
        if (all.some((f) => f === null)) return null;
        const [r, o, i, s, x, e, b, t, a] = all as number[][];
        const company = rng.pick(['Sagar Mills Ltd.', 'Nila Foods Ltd.', 'Vayu Tools Ltd.']);
        const say = (name: string, l: Line) => `${name}: ${formatINR(l.first)} in 2024-25, ${formatINR(l.second)} in 2025-26`;
        return {
          task: `For ${company}, prepare the Comparative Statement of Profit and Loss. The figures given for the two years are printed as you choose each line: work out the rest. Give every percentage to two decimal places and show a decrease with a minus sign.`,
          data: [
            `From the Statements of Profit and Loss of ${company} for the years ended 31 March 2025 and 31 March 2026:`,
            say('Revenue from operations', revenue),
            say('Other income', other),
            say('Employee benefits expense', staff),
            say('Other expenses', rest),
            'Tax is 30% of the profit before tax in both years.',
          ].join('\n'),
          title: `Comparative Statement of Profit and Loss of ${company}`,
          columns: [
            { name: '2024-25 (₹)', given: true },
            { name: '2025-26 (₹)', given: true },
            { name: 'Absolute change (₹)', signed: true },
            { name: 'Percentage change (%)', unit: 'percent', signed: true },
          ],
          rows: [
            { label: 'Revenue from operations', amounts: r },
            { label: 'Other income', amounts: o },
            { subtotal: 'Total revenue', amounts: i, sum: 'block' },
            { heading: 'Expenses' },
            { label: 'Employee benefits expense', amounts: s },
            { label: 'Other expenses', amounts: x },
            { subtotal: 'Total expenses', amounts: e, sum: 'section' },
            { subtotal: 'Profit before tax', amounts: b },
            // The data gives the rate, not the tax: its figures are worked out in every column.
            { label: 'Tax', amounts: t, given: false },
            { subtotal: 'Profit after tax', amounts: a },
          ],
          distractors: ['Cost of materials consumed', 'Finance costs', 'Depreciation and amortisation expense'],
          explanation: [
            'Absolute change = figure of 2025-26 less figure of 2024-25. A fall is a negative figure.',
            'Percentage change = absolute change ÷ figure of 2024-25 × 100.',
            'Total revenue and total expenses are added up for each year; profit before tax is total revenue less total expenses.',
            'Tax is 30% of the profit before tax of each year, and profit after tax is what is left.',
            'Tax and profit after tax are fixed parts of the profit before tax, so all three change by the same percentage.',
          ],
        };
      },
      // Every line and every sub-total: the change is the second year less the first. The tax is 30% of the profit
      // before it, and the statement ends on what is left.
      verify: (q) => {
        const subs = (q.lines ?? []).flatMap((l) => ('subtotal' in l ? [l.amounts] : []));
        const tax = q.rows.find((row) => row.label === 'Tax')?.amounts;
        if (subs.length !== 4 || !tax) return false;
        const [, , before, after] = subs;
        return (
          [...q.rows.map((row) => row.amounts), ...subs].every(([first, second, change]) => change === second - first) &&
          [0, 1].every((c) => tax[c] * 10 === before[c] * 3 && after[c] === before[c] - tax[c])
        );
      },
    }),
    statementTemplate({
      ...of(`${p}-balance-sheet`, `${p}-formats`, 'medium'),
      generate: (rng) => {
        const capital = amount(rng, 500000, 1500000, 100000);
        const debentures = amount(rng, 100000, 500000, 50000);
        const creditors = amount(rng, 40000, 200000, 10000);
        const tax = amount(rng, 20000, 90000, 10000);
        const stock = amount(rng, 80000, 300000, 10000);
        const debtors = amount(rng, 60000, 250000, 10000);
        const bank = amount(rng, 30000, 150000, 10000);
        const reserve = amount(rng, 100000, 500000, 50000);
        const machinery = capital + reserve + debentures + creditors + tax - stock - debtors - bank;
        if (machinery < 30000000) return null;
        const company = rng.pick(['Sagar Mills Ltd.', 'Nila Foods Ltd.', 'Vayu Tools Ltd.']);
        return {
          task: `Prepare the Balance Sheet of ${company} as at 31 March 2026 in the form Schedule III lays down.`,
          data: [
            `${company} had these balances on 31 March 2026:`,
            `Equity share capital: ${formatINR(capital)}`,
            `General reserve: ${formatINR(reserve)}`,
            `9% Debentures: ${formatINR(debentures)}`,
            `Creditors: ${formatINR(creditors)}`,
            `Provision for tax: ${formatINR(tax)}`,
            `Machinery: ${formatINR(machinery)}`,
            `Stock: ${formatINR(stock)}`,
            `Debtors: ${formatINR(debtors)}`,
            `Cash at bank: ${formatINR(bank)}`,
          ].join('\n'),
          title: `Balance Sheet of ${company} as at 31 March 2026`,
          noteHeading: 'Note No.',
          rows: [
            { heading: 'I. EQUITY AND LIABILITIES' },
            { heading: "1. Shareholders' funds" },
            { label: 'Share capital', amount: capital, note: '1' },
            { label: 'Reserves and surplus', amount: reserve, note: '2' },
            { heading: '2. Non-current liabilities' },
            { label: 'Long-term borrowings', amount: debentures, note: '3' },
            { heading: '3. Current liabilities' },
            { label: 'Trade payables', amount: creditors },
            { label: 'Short-term provisions', amount: tax },
            { subtotal: 'Total', amount: capital + reserve + debentures + creditors + tax, sum: 'all' },
            { heading: 'II. ASSETS' },
            { heading: '1. Non-current assets' },
            { label: 'Property, plant and equipment', amount: machinery, note: '4' },
            { heading: '2. Current assets' },
            { label: 'Inventories', amount: stock },
            { label: 'Trade receivables', amount: debtors },
            { label: 'Cash and cash equivalents', amount: bank },
            { subtotal: 'Total', amount: machinery + stock + debtors + bank, sum: 'block' },
          ],
          distractors: ['Other current liabilities', 'Long-term provisions', 'Current investments'],
          explanation: [
            "Share capital and the reserve are shareholders' funds. Debentures are long-term borrowings, a non-current liability.",
            'Creditors are trade payables and the provision for tax is a short-term provision: both are current liabilities.',
            'Machinery is property, plant and equipment. Stock is inventories, debtors are trade receivables, and cash at bank is cash and cash equivalents.',
            'The total of equity and liabilities equals the total of assets.',
          ],
        };
      },
      // The two totals of a balance sheet are the same figure.
      verify: (q) => {
        const totals = (q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line.amounts[0]] : []));
        return totals.length === 2 && totals[0] === totals[1];
      },
    }),
    statementTemplate({
      ...of(`${p}-cash-flow`, `${p}-formats`, 'complex'),
      generate: (rng) => {
        const profit = amount(rng, 200000, 600000, 20000);
        const depreciation = amount(rng, 30000, 90000, 10000);
        const receivables = amount(rng, 20000, 80000, 5000);
        const payables = amount(rng, 10000, 60000, 5000);
        const tax = amount(rng, 40000, 120000, 10000);
        const machinery = amount(rng, 200000, 500000, 50000);
        const investments = amount(rng, 40000, 150000, 10000);
        const shares = amount(rng, 100000, 300000, 50000);
        const dividend = amount(rng, 30000, 90000, 10000);
        const opening = amount(rng, 40000, 160000, 10000);
        const operating = profit + depreciation - receivables + payables - tax;
        const investing = investments - machinery;
        const financing = shares - dividend;
        const net = operating + investing + financing;
        if (operating <= 0 || net === 0 || opening + net <= 0) return null;
        const company = rng.pick(['Sagar Mills Ltd.', 'Nila Foods Ltd.', 'Vayu Tools Ltd.']);
        return {
          task: `Prepare the Cash Flow Statement of ${company} for the year ended 31 March 2026 by the indirect method. Show an outflow with a minus sign.`,
          data: [
            `From the books of ${company} for the year ended 31 March 2026:`,
            `Net profit before tax: ${formatINR(profit)}`,
            `Depreciation charged on machinery: ${formatINR(depreciation)}`,
            `Trade receivables rose by ${formatINR(receivables)} and trade payables rose by ${formatINR(payables)}.`,
            `Income tax paid: ${formatINR(tax)}`,
            `Machinery bought for cash: ${formatINR(machinery)}`,
            `Investments sold at book value: ${formatINR(investments)}`,
            `Equity shares issued at par for cash: ${formatINR(shares)}`,
            `Dividend paid: ${formatINR(dividend)}`,
            `Cash and cash equivalents on 1 April 2025: ${formatINR(opening)}`,
          ].join('\n'),
          title: `Cash Flow Statement of ${company} for the year ended 31 March 2026`,
          columns: [{ name: 'Amount (₹)', signed: true }],
          rows: [
            { heading: 'A. Cash flows from operating activities' },
            { label: 'Net profit before tax', amount: profit },
            { label: 'Depreciation on machinery', amount: depreciation },
            { subtotal: 'Operating profit before working capital changes', amount: profit + depreciation, sum: 'section' },
            { label: 'Increase in trade receivables', amount: -receivables },
            { label: 'Increase in trade payables', amount: payables },
            { subtotal: 'Cash generated from operations', amount: profit + depreciation - receivables + payables, sum: 'section' },
            { label: 'Income tax paid', amount: -tax },
            { subtotal: 'Net cash from operating activities', amount: operating, sum: 'section' },
            { heading: 'B. Cash flows from investing activities' },
            { label: 'Purchase of machinery', amount: -machinery },
            { label: 'Sale of investments', amount: investments },
            { subtotal: 'Net cash used in investing activities', amount: investing, sum: 'section' },
            { heading: 'C. Cash flows from financing activities' },
            { label: 'Issue of equity shares', amount: shares },
            { label: 'Dividend paid', amount: -dividend },
            { subtotal: 'Net cash from financing activities', amount: financing, sum: 'section' },
            { subtotal: 'Net increase or decrease in cash and cash equivalents', amount: net, sum: 'all' },
            { label: 'Cash and cash equivalents at the beginning', amount: opening },
          ],
          final: { label: 'Cash and cash equivalents at the end', amount: opening + net },
          distractors: ['Interest received', 'Repayment of bank loan', 'Decrease in inventories'],
          explanation: [
            'Depreciation is added back: it reduced the profit and took no cash.',
            'A rise in trade receivables holds cash back and is deducted; a rise in trade payables is added. Tax paid is deducted.',
            'Buying machinery is an outflow of investing activities and selling investments an inflow.',
            'Shares issued are an inflow of financing activities and dividend paid an outflow.',
            'The net change of the three parts, added to the opening cash, gives the closing cash.',
          ],
        };
      },
      // The statement ends on the opening cash and every flow, added up.
      verify: (q: StatementQuestion) => q.final?.amount === q.rows.reduce((sum, row) => sum + row.amounts[0], 0),
    }),
  ];
}

/** The pack of the sample, for the topic it is filed under. Its templates must be registered first. */
export function class12Pack(topicId: string, p = 's12'): TopicPack {
  const concepts: Concept[] = [
    { id: `${p}-basics`, topicId, title: 'Shares, ratios and a first entry' },
    { id: `${p}-formats`, topicId, title: 'Accounts in columns and statements in parts' },
  ];
  const cards: Card[] = [
    {
      id: `${p}-card-1`,
      topicId,
      conceptId: `${p}-basics`,
      kind: 'rule',
      prompt: 'How do partners share profit when the deed says nothing?',
      answer: 'Equally, whatever their capitals.',
      explanation: 'The Partnership Act applies when the deed is silent: profits and losses are shared equally.',
      example: 'Asha has ₹5,00,000 of capital and Bimal ₹2,00,000. Without a deed a profit of ₹80,000 is ₹40,000 each.',
      commonMistake: 'Sharing the profit in the ratio of the capitals.',
    },
  ];
  const base = { topicId, difficulty: 'easy' as const, hints: ['Read what the question asks for.', 'Work it out step by step.'] };
  const questions: Question[] = [
    {
      ...base,
      id: `${p}-q-001`,
      conceptId: `${p}-basics`,
      type: 'mcq',
      prompt: 'Two partners have no deed. How do they share the profit?',
      explanation: 'Without a deed profits and losses are shared equally.',
      options: [
        { id: 'a', text: 'Equally' },
        { id: 'b', text: 'In the ratio of their capitals', why: 'Took capital as the measure; the Act says equally.' },
        { id: 'c', text: 'In the ratio of the time each gives to the firm', why: 'Time given does not decide the share.' },
      ],
      correct: 'a',
    },
    {
      ...base,
      id: `${p}-q-002`,
      conceptId: `${p}-basics`,
      type: 'numeric',
      unit: 'ratio',
      prompt: 'Asha gets 1/2 of the profit and Bimal 1/3, and Chitra gets the rest. In what ratio do Asha, Bimal and Chitra share?',
      answer: [3, 2, 1],
      commonErrors: [
        { value: [2, 3, 1], why: 'Took the bottoms of the two fractions as the shares.' },
        { value: [1, 1, 1], why: 'Shared the profit equally.' },
      ],
      working: ['Chitra gets 1 − 1/2 − 1/3 = 1/6.', 'With 6 as the common bottom: 3/6, 2/6 and 1/6.', 'The ratio is 3:2:1.'],
      explanation: 'Chitra gets 1/6. On a common bottom of 6 the shares are 3/6, 2/6 and 1/6: 3:2:1.',
    },
    {
      ...base,
      id: `${p}-q-003`,
      conceptId: `${p}-basics`,
      type: 'numeric',
      unit: 'times',
      prompt: 'Revenue from operations is ₹9,60,000 and average trade receivables are ₹2,00,000. All sales are on credit. Find the trade receivables turnover ratio, in times.',
      answer: 480,
      commonErrors: [
        { value: 21, why: 'Divided the receivables by the revenue.' },
        { value: 7604, why: 'Worked out the collection period in days and took it for the ratio.' },
      ],
      working: ['Trade receivables turnover = Credit revenue from operations ÷ Average trade receivables.', '₹9,60,000 ÷ ₹2,00,000 = 4.8 times.'],
      explanation: 'Credit revenue from operations ÷ average trade receivables = ₹9,60,000 ÷ ₹2,00,000 = 4.8 times.',
    },
  ];
  const levels = buildLadder(topicId, {
    concept: {
      title: 'Partners and their shares',
      description: 'How the profit of a firm is shared.',
      lesson: [
        { type: 'text', heading: 'A firm and its partners', body: 'Partners share the profit of a firm in the ratio they have agreed. Without a deed they share it equally.' },
        {
          type: 'working',
          title: 'A profit of ₹90,000 shared by Asha and Bimal in the ratio 2:1',
          lines: ['The ratio 2:1 has 2 + 1 = 3 parts.', 'One part = ₹90,000 ÷ 3 = ₹30,000.', 'Asha gets 2 parts: ₹60,000. Bimal gets 1 part: ₹30,000.'],
          note: 'Check: ₹60,000 + ₹30,000 = ₹90,000.',
        },
        {
          type: 'table',
          title: 'How the ₹90,000 was shared',
          rows: [{ label: 'Shares of profit' }, { label: 'Asha (2 parts)', amount: '₹60,000' }, { label: 'Bimal (1 part)', amount: '₹30,000' }, { label: 'Profit shared', amount: '₹90,000', total: true }],
        },
        { type: 'check', questionId: `${p}-q-001` },
      ],
    },
    cards: { title: 'Rule cards', description: 'The rule to keep in mind.', cardIds: cards.map((c) => c.id) },
    recognition: [{ title: 'A ratio and a number of times', description: 'Two answers that are typed in ways of their own.', questionIds: [`${p}-q-002`, `${p}-q-003`] }],
    practice: [
      { title: 'First questions', description: 'A rule, a ratio in times and an entry.', templateIds: [`${p}-deed-interest`, `${p}-current-ratio`, `${p}-capital-brought`], count: 3 },
      { title: 'The new ratio', description: 'The ratio after a partner is admitted.', templateIds: [`${p}-new-ratio`], count: 2 },
    ],
    formats: [
      { title: "Prepare the Partners' Capital Accounts", description: 'Capital accounts written in columns, one for each partner.', templateIds: [`${p}-capital-accounts`], count: 1 },
      { title: 'Prepare a Statement', description: 'A comparative statement, a balance sheet and a cash flow statement.', templateIds: [`${p}-comparative`, `${p}-comparative-given`, `${p}-balance-sheet`, `${p}-cash-flow`], count: 1 },
    ],
  });
  return { topicId, concepts, cards, levels, questions };
}
