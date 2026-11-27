/**
 * Integrated case studies of Class 12 Part B: one company, from the issue of its shares and debentures to the
 * statements it prepares and the analysis made of them. Each case draws on at least three of the topics share-capital,
 * debentures, company-financial-statements, financial-statement-analysis, accounting-ratios and cash-flow-statement.
 *
 * Every chained case has two kinds of book (a set of entries, an account or a statement, then another), except
 * case-cy-chain-comparative-cover: one comparative statement and the ratios worked from it, a chain of the analysis
 * kind, which says so.
 *
 * The figures are drawn in whole rupees and turned into paise only where a question is returned. Every part is
 * checked another way, mostly from the printed case: a ratio by multiplying back, an amount from the lines of the
 * case read again, a format by its own working done another way.
 *
 * The rulings the examiners of the six topics fixed are kept, and each is stated in the case text where a part
 * relies on it:
 *  - Securities Premium is credited when the instalment that carries it falls due; after a pro rata allotment the
 *    excess application money is kept towards the allotment; every issue says whether a Calls in Arrears A/c is kept;
 *    forfeited shares are reissued as fully paid, the discount within the amount forfeited on them;
 *  - a discount on debentures redeemable at par goes to Discount on Issue of Debentures A/c; once a premium is
 *    payable on redemption the whole loss goes to Loss on Issue of Debentures A/c; it is written off in the year of
 *    allotment, first from Securities Premium and then to the Statement of Profit and Loss as a finance cost; the
 *    premium payable on redemption is an other long-term liability;
 *  - Schedule III as amended in 2021 (current maturities of long-term borrowings under short-term borrowings), the
 *    older place never offered as a wrong answer;
 *  - debt is long-term borrowings and long-term provisions; the proprietary ratio is on total assets; capital employed
 *    is shareholders' funds and non-current liabilities; interest coverage and return on investment use the profit
 *    before interest and tax; a net profit ratio says before or after tax; a ratio or a percentage is to two decimal
 *    places, and a seed in which a slip comes within 0.02 of the right figure is drawn again;
 *  - a percentage change is worked on the earlier figure; a common size statement says what its base is;
 *  - the cash flow statement is by the indirect method, of a company that is not a financing company, which the case
 *    says, so interest paid is a financing outflow and interest received an investing inflow.
 */
import type { JournalSetQuestion, McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { debentures, vendor } from '@/engine/accounts';
import { post } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { caseTemplate, formatINR, rupees, setDays } from '../authoring';
import { BS_ITEMS, FS_CASE, PL_ITEMS, splFromData, splStatement, splStatementHolds, type PlLine, type SplCase } from '../templates/company-financial-statements';
import { CF_CASE, TRADE_OF } from '../templates/cash-flow-statement';
import { DEB_CASE as D } from '../templates/debentures';
import { FSA_CASE, pct2 } from '../templates/financial-statement-analysis';
import { SC_CASE as S, type ScDefaulter, type ScFloat } from '../templates/share-capital';
import { DEALS, SPECS, effectOptions, movedBy, type Deal, type Eff } from '../templates/accounting-ratios';
import type { CaseSetParts, CaseStatementParts, CaseTemplate, FormatRowParts, McqParts, NumericParts, SetTransaction, StatementLineParts } from '../types';
import { AN_CASE as AN } from './analysis';

const TOPIC = 'cash-flow-statement';
const CONCEPT = 'cf-integrated';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

/** Whole rupees as the amount text a learner sees. */
const inr = (rs: number): string => formatINR(rupees(rs));
/** A number of shares or debentures with Indian grouping: 1,20,000. */
const cnt = (n: number): string => formatINR(rupees(n)).slice(1);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const lower = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);
/** A figure in hundredths as it is written: 250 is "2.5", 133 is "1.33". */
const dec = (h: number): string => String(h / 100);
/** Hundredths of a percent as text: 1250 is "12.5%". */
const pc = (h: number): string => `${dec(h)}%`;
const signed = (rs: number): string => (rs < 0 ? `(${inr(-rs)})` : inr(rs));
/** "a" or "an" before a rate as it is read aloud: "an 8% loan", "an 11% loan", "a 9% loan". */
const an = (rate: number): string => (rate === 8 || rate === 11 || rate === 18 ? 'an' : 'a');
const optionText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';
/** Every rupee amount of a text, in the order it is printed, in whole rupees. */
const amountsIn = (s: string): number[] => (s.match(/₹\d+(?:,\d+)*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
/** The "Label: ₹amount" lines of a text, by label, in whole rupees. */
const listedIn = (text: string): Map<string, number> => AN.listedIn(text);
/** The figure of a "Label: ₹amount" line, 0 when there is none. */
const lineIn = (text: string, label: string): number => listedIn(text).get(label) ?? 0;
/** The first whole number after some words in a text (commas taken out); NaN when the words are not there. */
const afterWords = (text: string, words: string): number => {
  const at = text.indexOf(words);
  if (at < 0) return NaN;
  const m = /[\d,]+/.exec(text.slice(at + words.length));
  return m ? Number(m[0].replace(/,/g, '')) : NaN;
};

/** An answer in whole rupees with its slips (a slip that is not whole and positive is dropped). */
const money = (answer: number, slips: (readonly [number, string] | false)[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null => AN.money(answer, slips);
/** A plain number (of shares, of debentures) with its slips. */
const count = (answer: number, slips: [number, string][]): Pick<NumericParts, 'answer' | 'commonErrors'> | null => S.numeric(answer, slips, 1);
type Frac = readonly [number, number];
/** A ratio in hundredths, to two decimal places, with its slips. */
const times = (right: Frac, slips: (readonly [Frac, string] | false)[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null => AN.figure(AN.TIMES, right, slips);
/** A percentage in hundredths, to two decimal places, with its slips. */
const percent = (right: Frac, slips: (readonly [Frac, string] | false)[]): Pick<NumericParts, 'answer' | 'commonErrors'> | null => AN.figure(AN.PERCENT, right, slips);
const choice = (prompt: string, correct: string, wrong: [string, string][], explanation: string, hints?: string[]): McqParts | null => AN.choice(prompt, correct, wrong, explanation, hints);
const nearTimes = (answer: number, f: Frac): boolean => AN.nearest(answer, f, AN.TIMES);
const nearPercent = (answer: number, f: Frac): boolean => AN.nearest(answer, f, AN.PERCENT);
/** The first draw of several that every part can be made from. */
const firstGood = <T>(times: number, draw: () => T | null, ok: (s: T) => boolean): T | null => AN.firstGood(times, draw, ok);

const AS_RATIO = AN.AS_RATIO;
const IN_TIMES = AN.IN_TIMES;
const AS_PERCENT = AN.AS_PERCENT;

const Y0 = '31 March 2025';
const Y1 = '31 March 2026';
const YEAR = '2025-26';
const PREV = '2024-25';
const NOT_FINANCING = 'is not a financing company';

/** Companies that are not financing companies, each with the trade its name suggests. */
const FIRMS: [string, string][] = [
  ...Object.entries(TRADE_OF),
  ['Tungabhadra Pumps Ltd.', 'a maker of water pumps'],
  ['Pench Leather Works Ltd.', 'a maker of leather bags'],
  ['Shivalik Cycles Ltd.', 'a maker of bicycles'],
  ['Mahanadi Glassware Ltd.', 'a maker of glassware'],
  ['Sabari Rubber Goods Ltd.', 'a maker of rubber hoses'],
  ['Barak Tea Packers Ltd.', 'a packer of tea'],
];
const firm = (rng: Rng): { co: string; trade: string } => {
  const [co, trade] = rng.pick(FIRMS);
  return { co, trade };
};

/** An item of the bank of balance sheet items, by its name; a name that is not there is refused when the file loads. */
function bsItem(name: string) {
  const item = BS_ITEMS.find((i) => i.name === name);
  if (!item) throw new Error(`company-year: the bank has no balance sheet item "${name}"`);
  return item;
}
/** "Under which head and sub-head is it shown?": the item's head, against the wrong heads its bank names. */
function headQuestion(prompt: string, name: string, extra = ''): McqParts | null {
  const item = bsItem(name);
  return choice(
    prompt,
    FS_CASE.headOf(item.sub),
    item.wrong.map(([sub, why]): [string, string] => [FS_CASE.headOf(sub), why]),
    `${item.note}${extra ? ` ${extra}` : ''}`,
    ['Decide first whether it is equity, a liability or an asset, and whether it is current or non-current.', 'Then ask what kind of item it is: a reserve, a borrowing, a provision, a payable.'],
  );
}
const headHolds = (name: string) => (q: McqQuestion): boolean => optionText(q) === FS_CASE.headOf(bsItem(name).sub);

/**
 * What a part keeps for its `verify`, by the case text. The engine makes every part of a case before it verifies any,
 * so one remembered value would not do.
 */
const keeper = <T>() => AN.keeper<T>();

const H = {
  premium: ['Securities Premium is credited with the premium on every share as the instalment that carries it falls due.', 'The premium is never part of share capital: share capital is the face value called up.'],
  solvency: ["Debt is long-term borrowings plus long-term provisions; equity is shareholders' funds (share capital plus reserves and surplus).", "The proprietary ratio here is shareholders' funds ÷ total assets."],
  change: ['Absolute change = figure of the later year less figure of the earlier year.', 'Percentage change = absolute change ÷ figure of the EARLIER year × 100.'],
  financing: ['Financing activities: money raised from shareholders and lenders, and what is paid back to them as repayments, interest and dividend.', 'For a company that is not a financing company, interest paid is a financing outflow.'],
};

// ===============================================================================================================
// 1. case-cy-issue-five-ways: an issue of shares at a premium in a year in which the company also paid interest on a
//    bank loan, repaid part of it (or not), and paid the dividend of the previous year (or not). Five views of the one
//    year: the premium credited, the head of an item of the balance sheet (the premium, or the part of the loan due
//    within a year where there is one), the debt to equity ratio at the year end, the net cash from financing
//    activities, and the percentage change in the shareholders' funds.
// ===============================================================================================================

interface FiveWays {
  co: string;
  trade: string;
  sc0: number;
  rs0: number;
  loan0: number;
  rate: number;
  n: number;
  p: number;
  /** How the shares were payable: in full on application, or the application money and then the rest on allotment. */
  app: number;
  repaid: number;
  /** The part of the loan left that falls due within twelve months of the year end (0 for none). */
  due: number;
  dividend: number;
  profit: number;
}
const fiveTotals = (s: FiveWays) => {
  const proceeds = s.n * (10 + s.p);
  const interest = (s.loan0 * s.rate) / 100;
  const sf0 = s.sc0 + s.rs0;
  const sf1 = sf0 + proceeds + s.profit - s.dividend;
  const debt = s.loan0 - s.repaid - s.due;
  return { proceeds, interest, sf0, sf1, debt, net: proceeds - s.repaid - interest - s.dividend };
};

function drawFiveWays(rng: Rng): FiveWays | null {
  const { co, trade } = firm(rng);
  const sc0 = 10 * rng.step(100000, 400000, 10000);
  const rs0 = rng.step(200000, 1500000, 10000);
  const loan0 = rng.step(400000, 1600000, 50000);
  const rate = rng.pick([9, 10, 11, 12]);
  const n = rng.step(20000, 80000, 5000);
  const p = rng.pick([2, 3, 5, 6, 8, 10, 15]);
  const app = rng.int(0, 1) === 0 ? 10 + p : rng.pick([2, 3, 4]);
  const repaid = rng.int(0, 2) === 0 ? 0 : rng.step(50000, Math.floor(loan0 / 3 / 50000) * 50000, 50000);
  const left = loan0 - repaid;
  const due = rng.int(0, 1) === 0 ? 0 : rng.step(50000, Math.max(50000, Math.floor(left / 4 / 50000) * 50000), 50000);
  const dividend = rng.int(0, 1) === 0 ? 0 : (sc0 * rng.pick([5, 8, 10])) / 100;
  const profit = rng.step(150000, 700000, 10000);
  const s: FiveWays = { co, trade, sc0, rs0, loan0, rate, n, p, app, repaid, due, dividend, profit };
  const t = fiveTotals(s);
  if (t.net <= 0 || t.debt <= 0 || due >= left || dividend > rs0) return null;
  return s;
}
const fiveText = (s: FiveWays): string => {
  const t = fiveTotals(s);
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. Its balance sheet as at ${Y0} showed:`,
    `Share capital (equity shares of ₹10 each, fully paid): ${inr(s.sc0)}`,
    `Reserves and surplus: ${inr(s.rs0)}`,
    `${s.rate}% Long-term loan from a bank: ${inr(s.loan0)}`,
    `During ${YEAR}:`,
    s.app === 10 + s.p
      ? `(a) It issued ${cnt(s.n)} equity shares of ₹10 each at a premium of ${inr(s.p)} a share, the whole ${inr(10 + s.p)} payable on application. The issue was fully subscribed and the shares were allotted.`
      : `(a) It issued ${cnt(s.n)} equity shares of ₹10 each at a premium of ${inr(s.p)} a share, payable ${inr(s.app)} on application and ${inr(10 + s.p - s.app)} on allotment (including the premium). The issue was fully subscribed and all the money was received.`,
    `(b) It paid the interest of the year on the loan, ${inr(t.interest)}${s.repaid > 0 ? `, and on ${Y1} repaid ${inr(s.repaid)} of the loan` : '; no part of the loan was repaid'}.`,
    ...(s.dividend > 0 ? [`(c) It paid the dividend of ${inr(s.dividend)} proposed for ${PREV}.`] : []),
    `(${s.dividend > 0 ? 'd' : 'c'}) Its profit after tax for the year was ${inr(s.profit)}.`,
    // Version 2: when no part of the loan is current, the case says so, so the debt at the year end is not in doubt.
    s.due > 0 ? `Of the loan outstanding on ${Y1}, ${inr(s.due)} is repayable within twelve months of that date.` : `None of the loan left on ${Y1} falls due within twelve months of that date.`,
    'It had no other dealing in its share capital, reserves or borrowings. The premium is credited to Securities Premium A/c when the instalment that carries it falls due.',
  ].join('\n');
};
/** The figures of the case read back from its text. */
function fiveIn(text: string) {
  const sc0 = lineIn(text, 'Share capital (equity shares of ₹10 each, fully paid)');
  const rs0 = lineIn(text, 'Reserves and surplus');
  const loanLine = text.split('\n').find((l) => l.includes('% Long-term loan from a bank: ')) ?? '';
  const loan0 = amountsIn(loanLine)[0] ?? NaN;
  const n = afterWords(text, 'It issued ');
  const p = afterWords(text, 'at a premium of ₹');
  const interest = afterWords(text, 'the interest of the year on the loan, ₹');
  const repaid = text.includes(' repaid ₹') ? afterWords(text, ' repaid ₹') : 0;
  const dividend = text.includes('It paid the dividend of ₹') ? afterWords(text, 'It paid the dividend of ₹') : 0;
  const profit = afterWords(text, 'profit after tax for the year was ₹');
  const due = text.includes('is repayable within twelve months') ? afterWords(text, `outstanding on ${Y1}, ₹`) : 0;
  return { sc0, rs0, loan0, n, p, interest, repaid, dividend, profit, due };
}

function fivePremium(s: FiveWays): NumericParts | null {
  const n = money(s.n * s.p, [
    [s.n * (10 + s.p), 'Gave the whole issue price received; only the premium goes to Securities Premium A/c, the face value to Share Capital A/c.'],
    [s.n * 10, 'Gave the face value of the shares, which is credited to Equity Share Capital A/c.'],
    s.app < 10 + s.p && [s.n * (10 + s.p - s.app), 'Gave all the money due on allotment; the premium is only a part of it.'],
    [s.rs0 + s.n * s.p, 'Added the premium to the reserves of the year before; the question asks what is credited on this issue.'],
  ]);
  return n && {
    prompt: `What amount is credited to Securities Premium A/c on the issue of ${YEAR}?`,
    ...n,
    explanation: [
      `Each share is issued at ₹10 + ${inr(s.p)} = ${inr(10 + s.p)}; the ${inr(s.p)} above the face value is the premium.`,
      s.app === 10 + s.p ? 'The premium is payable with the application money, so it is credited when the application money is transferred on allotment.' : 'The premium is payable with the allotment money, so it is credited when the allotment money falls due.',
      `Securities Premium = ${cnt(s.n)} x ${inr(s.p)} = ${inr(s.n * s.p)}.`,
    ],
    hints: H.premium,
  };
}
const fivePremiumHolds = (q: NumericQuestion): boolean => {
  const f = fiveIn(q.context ?? '');
  return q.answer === rupees(f.n * f.p);
};

const DUE_ITEM = 'Current maturities of long-term borrowings (the part of a term loan repayable within twelve months)';
const fiveHead = (s: FiveWays): McqParts | null =>
  s.due > 0
    ? headQuestion(
        `Under which head and sub-head of the balance sheet as at ${Y1} (Schedule III as amended in 2021) is the ${inr(s.due)} of the loan that is repayable within twelve months shown?`,
        DUE_ITEM,
        `The rest of the loan, ${inr(s.loan0 - s.repaid - s.due)}, stays under Non-Current Liabilities, Long-term Borrowings.`,
      )
    : headQuestion(`Under which head and sub-head of the balance sheet as at ${Y1} is the Securities Premium shown?`, 'Securities Premium');
const fiveHeadHolds = (q: McqQuestion): boolean => headHolds((q.context ?? '').includes('is repayable within twelve months') ? DUE_ITEM : 'Securities Premium')(q);

function fiveDebtEquity(s: FiveWays): NumericParts | null {
  const t = fiveTotals(s);
  const n = times([t.debt, t.sf1], [
    [[t.sf1, t.debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    s.due > 0 && [[t.debt + s.due, t.sf1], 'Kept the part of the loan due within twelve months in the debt; under Schedule III it is a short-term borrowing, a current liability.'],
    [[t.debt, t.sf1 - s.n * s.p], 'Left the premium out of the shareholders\' funds; Securities Premium is part of reserves and surplus.'],
    [[t.debt, t.sf0], "Took the shareholders' funds of the year before, without the issue and the profit of the year."],
    s.repaid > 0 && [[s.loan0 - s.due, t.sf1], 'Forgot the part of the loan repaid on the last day of the year.'],
    [[t.debt, s.sc0 + s.n * 10], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio of ${s.co} as at ${Y1}, debt being its long-term borrowings as shown in the balance sheet and equity its shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [
      `Loan left = ${s.repaid > 0 ? `${inr(s.loan0)} - ${inr(s.repaid)} repaid = ` : ''}${inr(s.loan0 - s.repaid)}.${s.due > 0 ? ` Of it, ${inr(s.due)} is repayable within twelve months: it is a short-term borrowing, so long-term borrowings = ${inr(t.debt)}.` : ''}`,
      `Shareholders' funds = ${inr(t.sf0)} + issue ${inr(t.proceeds)} (capital ${inr(s.n * 10)} and premium ${inr(s.n * s.p)}) + profit ${inr(s.profit)}${s.dividend > 0 ? ` - dividend ${inr(s.dividend)}` : ''} = ${inr(t.sf1)}.`,
      `Debt to equity ratio = ${inr(t.debt)} ÷ ${inr(t.sf1)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.solvency,
  };
}
const fiveDebtEquityHolds = (q: NumericQuestion): boolean => {
  const f = fiveIn(q.context ?? '');
  return nearTimes(q.answer, [f.loan0 - f.repaid - f.due, f.sc0 + f.rs0 + f.n * (10 + f.p) + f.profit - f.dividend]);
};

function fiveFinancing(s: FiveWays): NumericParts | null {
  const t = fiveTotals(s);
  const n = money(t.net, [
    [t.net + t.interest, 'Left out the interest paid on the loan; for a company that is not a financing company it is a financing outflow.'],
    [t.net - s.n * s.p, 'Left out the premium; the whole issue price received is a financing inflow.'],
    s.dividend > 0 && [t.net + s.dividend, 'Left out the dividend paid, which is a financing outflow.'],
    s.repaid > 0 && [t.net + 2 * s.repaid, 'Added the repayment of the loan instead of deducting it.'],
    [t.proceeds, 'Gave only the money raised by the issue and left out what was paid to lenders and shareholders.'],
  ]);
  return n && {
    prompt: `Find the net cash from financing activities of ${s.co} for ${YEAR}.`,
    ...n,
    explanation: [
      `Proceeds from the issue of shares = ${cnt(s.n)} x ${inr(10 + s.p)} = ${inr(t.proceeds)}, an inflow.`,
      ...(s.repaid > 0 ? [`Repayment of the loan, ${inr(s.repaid)}: an outflow.`] : []),
      `Interest paid on the loan = ${s.rate}% of ${inr(s.loan0)} = ${inr(t.interest)}: an outflow, since the company is not a financing company.`,
      ...(s.dividend > 0 ? [`Dividend paid, ${inr(s.dividend)}: an outflow.`] : []),
      `Net cash from financing activities = ${inr(t.proceeds)}${s.repaid > 0 ? ` - ${inr(s.repaid)}` : ''} - ${inr(t.interest)}${s.dividend > 0 ? ` - ${inr(s.dividend)}` : ''} = ${inr(t.net)}.${s.due > 0 ? ' The part of the loan due next year was not paid this year, so it is no cash flow.' : ''}`,
    ],
    hints: H.financing,
  };
}
const fiveFinancingHolds = (q: NumericQuestion): boolean => {
  const f = fiveIn(q.context ?? '');
  return q.answer === rupees(f.n * (10 + f.p) - f.repaid - f.interest - f.dividend);
};

function fiveChange(s: FiveWays): NumericParts | null {
  const t = fiveTotals(s);
  const change = t.sf1 - t.sf0;
  const n = percent([change, t.sf0], [
    [[change, t.sf1], `Divided the change by the figure of ${Y1}; the base is the earlier figure.`],
    [[t.sf1, t.sf0], 'Gave the later figure as a percentage of the earlier one; the change has to be taken first.'],
    [[s.n * 10, s.sc0], 'Worked the change in share capital alone.'],
    [[change - s.n * s.p, t.sf0], 'Left the premium out of the rise in the shareholders\' funds.'],
  ]);
  return n && {
    prompt: `By what percentage did the shareholders' funds of ${s.co} rise from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Shareholders' funds on ${Y0} = ${inr(s.sc0)} + ${inr(s.rs0)} = ${inr(t.sf0)}.`,
      `On ${Y1}: ${inr(t.sf0)} + ${inr(t.proceeds)} + ${inr(s.profit)}${s.dividend > 0 ? ` - ${inr(s.dividend)}` : ''} = ${inr(t.sf1)}, a rise of ${inr(change)}.`,
      `Percentage change = ${inr(change)} ÷ ${inr(t.sf0)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: H.change,
  };
}
const fiveChangeHolds = (q: NumericQuestion): boolean => {
  const f = fiveIn(q.context ?? '');
  const sf0 = f.sc0 + f.rs0;
  return nearPercent(q.answer, [f.n * (10 + f.p) + f.profit - f.dividend, sf0]);
};

const fiveMakers = [fivePremium, fiveHead, fiveDebtEquity, fiveFinancing, fiveChange];
const caseFiveWays = caseTemplate<FiveWays>({
  id: 'case-cy-issue-five-ways',
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'One issue of shares, five ways',
  setup: (rng) =>
    firstGood(30, () => drawFiveWays(rng), (s) => {
      return fiveMakers.every((m) => m(s) !== null);
    }),
  context: fiveText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: fivePremium, verify: fivePremiumHolds },
    { kind: 'mcq', make: fiveHead, verify: fiveHeadHolds },
    { kind: 'numeric', unit: 'times', make: fiveDebtEquity, verify: fiveDebtEquityHolds },
    { kind: 'numeric', unit: 'rupees', make: fiveFinancing, verify: fiveFinancingHolds },
    { kind: 'numeric', unit: 'percent', make: fiveChange, verify: fiveChangeHolds },
  ],
});

// ===============================================================================================================
// 2. case-cy-forfeit-proprietary: a company already running offers more shares (at par or at a premium, in three or
//    four instalments); one holder stops paying (after the application money or a later instalment), the shares are
//    forfeited and all or some reissued at a discount within the amount forfeited, or at par. Asked: the Capital
//    Reserve, the share capital in the balance sheet at the year end, the cash the shares brought in during the year
//    (the financing inflow), and the proprietary ratio on total assets.
// ===============================================================================================================

interface ForfeitYear {
  co: string;
  trade: string;
  f: ScFloat;
  d: ScDefaulter;
  n0: number;
  rs0: number;
  j: number;
  price: number;
  per: number;
  profit: number;
  ta: number;
}
/** What the books of the issue leave, in whole rupees: the cash, the capital, the forfeited shares, the premium and the capital reserve. */
function forfeitBooks(c: ForfeitYear) {
  const b = S.books(c.f.s);
  const credit = (id: string): number => -S.net(b.ledger, id) / 100;
  return { cash: -credit('bank'), capital: credit(S.capitalId(c.f.s.kind)), held: credit('forfeitedShares'), premium: credit('securitiesPremium'), reserve: credit('capitalReserve') };
}
/** Shareholders' funds at the year end: what they were, the profit kept, and every rupee the shares brought in. */
const forfeitSf = (c: ForfeitYear): number => c.n0 * c.f.s.face + c.rs0 + c.profit + forfeitBooks(c).cash;

function drawForfeitYear(rng: Rng): ForfeitYear | null {
  const { co, trade } = firm(rng);
  const count = rng.pick([3, 3, 4] as const);
  const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
  s.arrears = rng.int(0, 1) === 0;
  // The issue is a fifth to a half of the shares already in issue.
  const n0 = s.face === 10 ? rng.step(100000, 600000, 10000) : rng.step(20000, 80000, 1000);
  const lot = s.face === 10 ? 10000 : 1000;
  const n = Math.round((n0 * rng.pick([20, 25, 30, 40, 50])) / 100 / lot) * lot;
  if (n < 5000) return null;
  const k = S.holding(rng, n, 100, 2, 20);
  const from = rng.int(1, count - 1);
  const per = sum(s.parts.slice(0, from));
  const room = S.discountRoom(s, per);
  if (room < 1) return null;
  const j = rng.int(0, 2) === 0 ? k : S.partOf(rng, k);
  const price = rng.int(0, 3) === 0 ? s.face : s.face - (s.face / 10) * rng.int(1, room);
  const d: ScDefaulter = { who: rng.pick(S.HOLDERS), k, applied: k, from, forfeited: true };
  const f = S.seal({ co, s, offered: n, n, refused: 0, pro: null, bad: [d], lots: [{ takes: [j], price }] });
  if (!f) return null;
  const rs0 = Math.round((n0 * s.face * rng.pick([20, 30, 40, 50, 60, 80])) / 100 / 10000) * 10000;
  const profit = Math.round(((n0 * s.face + rs0) * rng.pick([6, 8, 10, 12, 15])) / 100 / 10000) * 10000;
  const c: ForfeitYear = { co, trade, f, d, n0, rs0, j, price, per, profit, ta: 0 };
  const sf = forfeitSf(c);
  c.ta = Math.round((sf * 100) / rng.pick([45, 50, 55, 60, 62, 65, 70, 75]) / 10000) * 10000;
  return c.ta > sf ? c : null;
}
const forfeitText = (c: ForfeitYear): string => {
  const s = c.f.s;
  return [
    `${c.co}, ${c.trade}, ${NOT_FINANCING}. On ${Y0} it had ${cnt(c.n0)} equity shares of ${inr(s.face)} each in issue, all fully paid, and reserves and surplus of ${inr(c.rs0)}.`,
    `During ${YEAR} it offered ${cnt(c.f.n)} more ${S.sharesOf(s)} to the public ${S.priced(s)}, payable ${S.terms(s)}. The issue was fully subscribed, every share was allotted and every call was made.`,
    `${S.lapse(s, c.d)}. Every other shareholder paid in full. ${S.arrearsRule(s)}`,
    `The directors forfeited ${c.d.who}'s shares and later reissued ${c.j === c.d.k ? 'all of them' : `${cnt(c.j)} of them`} at ${inr(c.price)} a share as fully paid. The gain on the reissue was transferred to Capital Reserve.`,
    `Its profit after tax for the year, all of it kept in the business, was ${inr(c.profit)}. On ${Y1} its total assets were ${inr(c.ta)}.`,
    `All money is received and paid through the bank.${s.premium > 0 ? ' The premium is credited to Securities Premium A/c when the instalment that carries it falls due.' : ''}`,
  ].join('\n');
};
const forfeitKept = keeper<ForfeitYear>();

function forfeitReserve(c: ForfeitYear): NumericParts | null {
  const { f, d, j, price, per } = c;
  const s = f.s;
  const off = s.face - price;
  const gain = j * per - j * off;
  const n = money(gain, [
    j < d.k && [d.k * per - j * off, `Transferred the gain on all the forfeited shares, although only ${cnt(j)} of the ${cnt(d.k)} were reissued.`],
    off > 0 && [j * per, 'Forgot the discount allowed on reissue.'],
    off > 0 && [j * off, 'Gave the discount allowed on reissue, not the gain left after it.'],
    [j * price, 'Gave the money received on reissue.'],
    [j * (s.face - per), 'Gave the capital that had been left unpaid on the shares reissued, not the amount forfeited on them.'],
  ]);
  return n && {
    prompt: 'What amount is transferred to Capital Reserve on the reissue?',
    ...n,
    explanation: [
      `${d.who} had paid ${inr(per)} a share towards capital, so ${inr(per)} a share was forfeited.${s.premium > 0 ? (S.premiumLost(f, d) ? ' The premium was never received, so none of it was forfeited.' : ' The premium received stays in Securities Premium A/c and is no part of it.') : ''}`,
      `Forfeited on the ${cnt(j)} shares reissued = ${cnt(j)} x ${inr(per)} = ${inr(j * per)}${j < d.k ? `; the ${inr((d.k - j) * per)} on the other ${cnt(d.k - j)} shares stays in Forfeited Shares A/c` : ''}.`,
      off > 0 ? `Discount allowed on reissue = ${cnt(j)} x (${inr(s.face)} - ${inr(price)}) = ${inr(j * off)}, within the amount forfeited.` : 'The shares were reissued at their face value: there is no discount.',
      `Capital Reserve = ${off > 0 ? `${inr(j * per)} - ${inr(j * off)} = ` : ''}${inr(gain)}.`,
    ],
    hints: S.H.reissue,
  };
}
const forfeitReserveHolds = (q: NumericQuestion): boolean => {
  const c = forfeitKept.of(q.context ?? '');
  return !!c && q.answer === rupees(forfeitBooks(c).reserve);
};

function forfeitCapital(c: ForfeitYear): NumericParts | null {
  const { f, d, j, per, n0 } = c;
  const s = f.s;
  const old = n0 * s.face;
  const inIssue = f.n - d.k + j;
  const held = (d.k - j) * per;
  const answer = old + inIssue * s.face + held;
  const n = money(answer, [
    held > 0 && [answer - held, 'Left out the balance of Forfeited Shares A/c on the shares not yet reissued; it is added to the subscribed capital.'],
    [old + f.n * s.face, 'Counted every share of the issue at its face value, as if none had been forfeited.'],
    [old + (f.n - d.k) * s.face + held, 'Left out the shares reissued; they are fully paid shares again.'],
    [inIssue * s.face + held, `Left out the ${cnt(n0)} shares in issue before the year.`],
    s.premium > 0 && [answer + forfeitBooks(c).premium, 'Added the Securities Premium to the share capital; it is a reserve.'],
  ]);
  return n && {
    prompt: `What is the share capital of ${c.co} in its balance sheet as at ${Y1}?`,
    ...n,
    explanation: [
      `Shares fully paid: ${cnt(n0)} old + ${cnt(f.n)} issued - ${cnt(d.k)} forfeited + ${cnt(j)} reissued = ${cnt(n0 + inIssue)}, at ${inr(s.face)} = ${inr(old + inIssue * s.face)}.`,
      held > 0 ? `Add the balance of Forfeited Shares A/c on the ${cnt(d.k - j)} shares not yet reissued, ${cnt(d.k - j)} x ${inr(per)} = ${inr(held)}.` : 'Every forfeited share was reissued, so Forfeited Shares A/c has no balance to add.',
      `Share capital = ${held > 0 ? `${inr(old + inIssue * s.face)} + ${inr(held)} = ` : ''}${inr(answer)}.${s.premium > 0 ? ' Securities Premium is shown under Reserves and Surplus.' : ''}`,
    ],
    hints: S.H.note,
  };
}
const forfeitCapitalHolds = (q: NumericQuestion): boolean => {
  const c = forfeitKept.of(q.context ?? '');
  if (!c) return false;
  const b = forfeitBooks(c);
  return q.answer === rupees(c.n0 * c.f.s.face + b.capital + b.held);
};

function forfeitCash(c: ForfeitYear): NumericParts | null {
  const { f, d, j, price } = c;
  const s = f.s;
  const cash = forfeitBooks(c).cash;
  const unpaid = S.unpaidAll(f, d);
  const due = f.n * (s.face + s.premium);
  const n = money(cash, [
    [cash - j * price, 'Left out the money received on the reissue of the forfeited shares, which is also a financing inflow.'],
    [due + j * price, `Took the whole issue price on every share, although ${d.who} did not pay ${inr(unpaid)}.`],
    s.premium > 0 && [cash - (f.n - (S.premiumLost(f, d) ? d.k : 0)) * s.premium, 'Left out the premium received; the whole money received on the shares is a financing inflow.'],
    [f.n * s.face, 'Gave the face value of the shares issued, not the money received.'],
  ]);
  return n && {
    prompt: `What amount does ${c.co} show in its Cash Flow Statement for ${YEAR}, under financing activities, as the proceeds of its shares?`,
    ...n,
    explanation: [
      `Money due on the issue = ${cnt(f.n)} x ${inr(s.face + s.premium)} = ${inr(due)}; ${d.who} did not pay ${inr(unpaid)}, so ${inr(due - unpaid)} came in.`,
      `The reissue brought in ${cnt(j)} x ${inr(price)} = ${inr(j * price)}.`,
      `Proceeds of the shares = ${inr(due - unpaid)} + ${inr(j * price)} = ${inr(cash)}, a financing inflow. The forfeiture and the transfer to Capital Reserve move no cash.`,
    ],
    hints: ['Count only the money that actually came in: on the issue, less what was not paid, and on the reissue.', 'Forfeiture and the transfer to Capital Reserve are book entries: no cash moves.'],
  };
}
const forfeitCashHolds = (q: NumericQuestion): boolean => {
  const c = forfeitKept.of(q.context ?? '');
  return !!c && q.answer === S.net(S.books(c.f.s).ledger, 'bank');
};

const FORFEITED_ITEM = 'Balance of Forfeited Shares Account (the shares are not yet reissued)';
const forfeitHead = (c: ForfeitYear): McqParts | null =>
  c.j < c.d.k
    ? headQuestion(`Under which head and sub-head of the balance sheet as at ${Y1} is the amount left in Forfeited Shares A/c shown?`, FORFEITED_ITEM)
    : headQuestion(`Under which head and sub-head of the balance sheet as at ${Y1} is the Capital Reserve shown?`, 'Capital Reserve');
const forfeitHeadHolds = (q: McqQuestion): boolean => {
  const c = forfeitKept.of(q.context ?? '');
  return !!c && headHolds(c.j < c.d.k ? FORFEITED_ITEM : 'Capital Reserve')(q);
};

function forfeitProprietary(c: ForfeitYear): NumericParts | null {
  const sf = forfeitSf(c);
  const b = forfeitBooks(c);
  const sc = c.n0 * c.f.s.face + b.capital + b.held;
  const n = times([sf, c.ta], [
    [[c.ta, sf], "Divided the total assets by the shareholders' funds: the ratio is upside down."],
    [[sc, c.ta], "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
    [[sf - b.reserve - b.premium, c.ta], "Left the Capital Reserve and the Securities Premium out of the shareholders' funds."],
    [[sf, c.ta - sf], "Divided by the outside liabilities; the proprietary ratio is on total assets."],
    [[c.n0 * c.f.s.face + c.rs0, c.ta], "Took the shareholders' funds of the year before."],
  ]);
  return n && {
    prompt: `Find the proprietary ratio of ${c.co} as at ${Y1}, worked on total assets (shareholders' funds ÷ total assets), ${AS_RATIO}.`,
    ...n,
    explanation: [
      `Share capital ${inr(sc)}; reserves and surplus = ${inr(c.rs0)}${b.premium > 0 ? ` + Securities Premium ${inr(b.premium)}` : ''} + Capital Reserve ${inr(b.reserve)} + profit kept ${inr(c.profit)} = ${inr(sf - sc)}.`,
      `Shareholders' funds = ${inr(sc)} + ${inr(sf - sc)} = ${inr(sf)}.`,
      `Proprietary ratio = ${inr(sf)} ÷ ${inr(c.ta)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.solvency,
  };
}
// Another way: the shareholders' funds are what they were, the profit kept and the cash the shares brought in.
const forfeitProprietaryHolds = (q: NumericQuestion): boolean => {
  const c = forfeitKept.of(q.context ?? '');
  const text = q.context ?? '';
  return !!c && nearTimes(q.answer, [afterWords(text, 'all fully paid, and reserves and surplus of ₹') + afterWords(text, 'kept in the business, was ₹') + c.n0 * c.f.s.face + forfeitBooks(c).cash, afterWords(text, 'total assets were ₹')]);
};

const forfeitMakers = [forfeitReserve, forfeitHead, forfeitCapital, forfeitCash, forfeitProprietary];
const caseForfeitYear = caseTemplate<ForfeitYear>({
  id: 'case-cy-forfeit-proprietary',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Forfeited shares in the figures of the year',
  setup: (rng) =>
    firstGood(30, () => drawForfeitYear(rng), (c) => {
      const ok = forfeitMakers.every((m) => m(c) !== null);
      if (ok) forfeitKept.keep(forfeitText(c), c);
      return ok;
    }),
  context: forfeitText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: forfeitReserve, verify: forfeitReserveHolds },
    { kind: 'mcq', make: forfeitHead, verify: forfeitHeadHolds },
    { kind: 'numeric', unit: 'rupees', make: forfeitCapital, verify: forfeitCapitalHolds },
    { kind: 'numeric', unit: 'rupees', make: forfeitCash, verify: forfeitCashHolds },
    { kind: 'numeric', unit: 'times', make: forfeitProprietary, verify: forfeitProprietaryHolds },
  ],
});

// ===============================================================================================================
// 3. case-cy-vendor-debentures: a running business bought and paid for by allotting debentures to the vendor, at par,
//    at a premium or at a discount, in a year in which the company already owes debentures of another rate or a bank
//    loan. Asked: the number of debentures allotted, what the purchase does in the Cash Flow Statement (nothing: no
//    cash moved), the long-term borrowings at the year end, the interest on the new debentures for the months of the
//    year, and the debt to equity ratio.
// ===============================================================================================================

interface VendorDeb {
  co: string;
  trade: string;
  v: string;
  tk: ReturnType<typeof D.drawTakeover> & object;
  n: number;
  rate: number;
  /** The issue price of a debenture of ₹100, and the years to redemption. */
  price: number;
  years: number;
  month: string;
  months: number;
  /** The borrowing the company had before: debentures of another rate, or a bank loan. */
  old: { what: 'debentures' | 'loan'; rate: number; amount: number };
  sf: number;
}
const vendorDebText = (c: VendorDeb): string => {
  const terms = c.price > 100 ? `at a premium of ${c.price - 100}%` : c.price < 100 ? `at a discount of ${100 - c.price}%` : 'at par';
  return [
    `${c.co}, ${c.trade}, closes its books on 31 March. On 1 April 2025 its only borrowing was ${c.old.what === 'debentures' ? `${c.old.rate}% Debentures of ${inr(c.old.amount)}, redeemable at par in 2030` : `${an(c.old.rate)} ${c.old.rate}% long-term loan of ${inr(c.old.amount)} from a bank, repayable in 2031`}.`,
    `On 1 ${c.month} it ${D.tookOver(c.tk, c.v)}, for a purchase consideration of ${inr(c.tk.pc)}.`,
    `The consideration was settled by allotting to ${c.v} ${c.rate}% Debentures of ₹100 each ${terms}, redeemable at par after ${c.years} years.${c.price < 100 ? ' The discount on the issue was written off against Securities Premium by the end of the year.' : ''}`,
    `Interest on the debentures is payable half-yearly on 30 September and 31 March. No other borrowing was taken or repaid during the year.`,
    `On ${Y1} its shareholders' funds were ${inr(c.sf)}. It ${NOT_FINANCING}.`,
  ].join('\n');
};
const vendorDebKept = keeper<VendorDeb>();

function drawVendorDeb(rng: Rng): VendorDeb | null {
  const { co, trade } = firm(rng);
  const price = rng.pick([100, 100, 105, 110, 120, 95, 90]);
  const n = rng.step(3000, 15000, 500);
  const when = rng.pick(D.ISSUE_DATES);
  const nominal = n * 100;
  const rate = D.wholeRate(rng, nominal, [when.months]);
  if (rate === null) return null;
  const tk = D.drawTakeover(rng, n * price);
  if (!tk) return null;
  const old = { what: rng.pick(['debentures', 'loan'] as const), rate: rng.pick(D.RATES.filter((r) => r !== rate)), amount: rng.step(300000, 2000000, 100000) };
  const sf = Math.round(((old.amount + nominal) * 100) / rng.pick([30, 40, 50, 60, 75, 80, 90, 120]) / 10000) * 10000;
  return { co, trade, v: rng.pick(D.VENDORS), tk, n, rate, price, years: rng.int(4, 8), month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, old, sf };
}

function vendorDebCount(c: VendorDeb): NumericParts | null {
  const { tk, price } = c;
  const net = D.netAssets(tk);
  const gross = net + tk.creditors;
  const n = count(c.n, [
    ...(price !== 100 ? ([[tk.pc / 100, 'Divided by the face value; the vendor takes each debenture at its issue price.']] as [number, string][]) : []),
    ...(price > 100 ? ([[tk.pc / (200 - price), 'Took the premium off the face value instead of adding it.']] as [number, string][]) : []),
    ...(price < 100 ? ([[tk.pc / (200 - price), 'Added the discount to the face value instead of taking it off.']] as [number, string][]) : []),
    [net / price, 'Divided the net assets by the issue price; the vendor is paid the purchase consideration.'],
    [gross / price, 'Divided the assets taken over by the issue price, leaving out the creditors and the difference.'],
  ]);
  return n && {
    prompt: `How many debentures were allotted to ${c.v}?`,
    ...n,
    explanation: [
      `Issue price of a debenture = ${price === 100 ? '₹100, at par' : `₹100 ${price > 100 ? '+' : '-'} ${inr(Math.abs(price - 100))} = ${inr(price)}`}.`,
      `Debentures allotted = purchase consideration ÷ issue price = ${inr(tk.pc)} ÷ ${inr(price)} = ${cnt(c.n)}.`,
    ],
    hints: D.H.vendor,
  };
}
const vendorDebCountHolds = (q: NumericQuestion): boolean => {
  const c = vendorDebKept.of(q.context ?? '');
  return !!c && q.answer * c.price === afterWords(q.context ?? '', 'purchase consideration of ₹');
};

function vendorDebCash(c: VendorDeb): McqParts | null {
  const nominal = c.n * 100;
  return choice(
    `How does the purchase of the business of ${c.v} appear in the Cash Flow Statement of ${c.co} for ${YEAR}?`,
    'It is left out: no cash moved, as the business was paid for in debentures; it is disclosed apart as a non-cash transaction',
    [
      [`As an investing outflow of ${inr(c.tk.pc)}, the purchase of a business`, 'Counted the business as bought for cash; it was paid for by allotting debentures.'],
      [`As a financing inflow of ${inr(nominal)}, the issue of debentures`, 'Counted the debentures as issued for cash; they were given to the vendor in exchange for the business.'],
      [`As an investing outflow of ${inr(c.tk.pc)} and a financing inflow of ${inr(c.tk.pc)}`, 'Showed both sides of the exchange as cash flows; no cash moved either way.'],
      [`As an operating outflow of ${inr(c.tk.pc)}`, 'Took the purchase of a business for a payment of the operations; and in any case no cash was paid.'],
    ],
    'A Cash Flow Statement shows only flows of cash and cash equivalents. A business bought by allotting debentures brings in assets and a borrowing without any cash, so it is left out of the statement and disclosed elsewhere as a non-cash investing and financing transaction. The interest later paid on the debentures is a cash flow.',
    ['Ask first whether cash and cash equivalents changed at all.', 'An exchange of one non-cash item for another (assets for debentures) is not a cash flow.'],
  );
}
const vendorDebCashHolds = (q: McqQuestion): boolean => (q.context ?? '').includes('settled by allotting to') && optionText(q).startsWith('It is left out');

function vendorDebBorrowings(c: VendorDeb): NumericParts | null {
  const nominal = c.n * 100;
  const total = c.old.amount + nominal;
  const n = money(total, [
    c.price !== 100 && [c.old.amount + c.tk.pc, 'Took the new debentures at their issue price; debentures stand at their nominal value.'],
    [nominal, `Left out the ${c.old.what === 'debentures' ? `${c.old.rate}% Debentures` : 'bank loan'} the company owed before.`],
    [total + c.tk.creditors, 'Added the creditors taken over; they are trade payables, a current liability.'],
    [c.old.amount, 'Left out the debentures allotted to the vendor; they are a borrowing, though no cash was received for them.'],
  ]);
  return n && {
    prompt: `What amount does ${c.co} show under Long-term borrowings in its balance sheet as at ${Y1}?`,
    ...n,
    explanation: [
      `The new debentures stand at their nominal value: ${cnt(c.n)} x ₹100 = ${inr(nominal)}${c.price !== 100 ? `, whatever ${c.v} took them at` : ''}.`,
      `The ${c.old.what === 'debentures' ? `${c.old.rate}% Debentures, ${inr(c.old.amount)}, are` : `bank loan, ${inr(c.old.amount)}, is`} still owed and fall${c.old.what === 'debentures' ? '' : 's'} due after more than a year.`,
      `Long-term borrowings = ${inr(c.old.amount)} + ${inr(nominal)} = ${inr(total)}. The creditors taken over are trade payables.`,
    ],
    hints: ['Debentures are shown at their nominal value, whatever they were issued at.', 'Long-term borrowings take in every borrowing not due within twelve months.'],
  };
}
const vendorDebBorrowingsHolds = (q: NumericQuestion): boolean => {
  const c = vendorDebKept.of(q.context ?? '');
  return !!c && q.answer === rupees(c.old.amount + (afterWords(q.context ?? '', 'purchase consideration of ₹') / c.price) * 100);
};

function vendorDebInterest(c: VendorDeb): NumericParts | null {
  const nominal = c.n * 100;
  const annual = (nominal * c.rate) / 100;
  const interest = (annual * c.months) / 12;
  const n = money(interest, [
    [annual, `Charged a full year although the debentures were allotted on 1 ${c.month}.`],
    c.price !== 100 && [(c.tk.pc * c.rate * c.months) / 1200, 'Worked the interest on the issue price; interest is on the nominal value.'],
    [(annual * (12 - c.months)) / 12, 'Counted the months before the allotment instead of the months after it.'],
    [(annual * (c.months - 1)) / 12, 'Left out the month of allotment.'],
    [interest + (c.old.amount * c.old.rate) / 100, `Added the interest on the ${c.old.what === 'debentures' ? 'old debentures' : 'bank loan'}; the question asks for the new debentures alone.`],
  ]);
  return n && {
    prompt: `What is the interest on the debentures allotted to ${c.v}, for the year ended ${Y1}, in the finance costs of ${c.co}?`,
    ...n,
    explanation: [`Interest is on the nominal value: ${c.rate}% of ${inr(nominal)} = ${inr(annual)} a year.`, `From 1 ${c.month} to ${Y1} is ${c.months} months: ${inr(annual)} x ${c.months}/12 = ${inr(interest)}.`],
    hints: D.H.interest,
  };
}
const vendorDebInterestHolds = (q: NumericQuestion): boolean => {
  const c = vendorDebKept.of(q.context ?? '');
  return !!c && q.answer * 1200 === rupees(c.n * 100 * c.rate * c.months);
};

function vendorDebRatio(c: VendorDeb): NumericParts | null {
  const nominal = c.n * 100;
  const debt = c.old.amount + nominal;
  const n = times([debt, c.sf], [
    [[c.sf, debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[c.old.amount, c.sf], 'Left the debentures allotted to the vendor out of the debt.'],
    c.price !== 100 && [[c.old.amount + c.tk.pc, c.sf], 'Took the new debentures at their issue price.'],
    [[debt + c.tk.creditors, c.sf], 'Counted the creditors taken over as debt; they are a current liability.'],
    [[debt, c.sf + debt], "Divided the debt by debt plus shareholders' funds: that is the debt to capital employed ratio."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio of ${c.co} as at ${Y1}, debt being its long-term borrowings and equity its shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [`Debt = ${inr(c.old.amount)} + ${inr(nominal)} = ${inr(debt)}.`, `Debt to equity ratio = ${inr(debt)} ÷ ${inr(c.sf)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const vendorDebRatioHolds = (q: NumericQuestion): boolean => {
  const text = q.context ?? '';
  const c = vendorDebKept.of(text);
  return !!c && nearTimes(q.answer, [c.old.amount + (afterWords(text, 'purchase consideration of ₹') / c.price) * 100, afterWords(text, "shareholders' funds were ₹")]);
};

const vendorDebMakers = [vendorDebCount, vendorDebCash, vendorDebBorrowings, vendorDebInterest, vendorDebRatio];
const caseVendorDebentures = caseTemplate<VendorDeb>({
  id: 'case-cy-vendor-debentures',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A business bought with debentures',
  setup: (rng) =>
    firstGood(30, () => drawVendorDeb(rng), (c) => {
      const ok = vendorDebMakers.every((m) => m(c) !== null);
      if (ok) vendorDebKept.keep(vendorDebText(c), c);
      return ok;
    }),
  context: vendorDebText,
  parts: [
    { kind: 'numeric', unit: 'number', make: vendorDebCount, verify: vendorDebCountHolds },
    { kind: 'mcq', make: vendorDebCash, verify: vendorDebCashHolds },
    { kind: 'numeric', unit: 'rupees', make: vendorDebBorrowings, verify: vendorDebBorrowingsHolds },
    { kind: 'numeric', unit: 'rupees', make: vendorDebInterest, verify: vendorDebInterestHolds },
    { kind: 'numeric', unit: 'times', make: vendorDebRatio, verify: vendorDebRatioHolds },
  ],
});

// ===============================================================================================================
// 4. case-cy-effect-of-issue: one issue, of shares or of debentures, for cash or to a vendor of machinery, and what it
//    does: to the current ratio, to the debt to equity ratio (each "improve, decline or not change" with its reason,
//    the examined readings of the ratios topic), to the Cash Flow Statement, and the debt to equity ratio after it;
//    then the Securities Premium of a share issue, or the interest of the year on the debentures.
// ===============================================================================================================

type IssueKind = 'sharesCash' | 'debCash' | 'sharesVendor' | 'debVendor';
interface OneIssue {
  co: string;
  trade: string;
  ca: number;
  cl: number;
  debt: number;
  equity: number;
  kind: IssueKind;
  /** Shares and their premium, or debentures and their rate; the value the issue brings in; the vendor. */
  n: number;
  p: number;
  rate: number;
  x: number;
  v: string;
  month: string;
  months: number;
}
const isShares = (k: IssueKind): boolean => k === 'sharesCash' || k === 'sharesVendor';
const isCash = (k: IssueKind): boolean => k === 'sharesCash' || k === 'debCash';
/** The transaction as a deal of the ratios topic: what it does to the totals, the reason, and the misreadings of it. */
function dealOf(s: OneIssue): Deal {
  const x = s.x;
  const e = (ca = 0, quick = 0, cl = 0, nca = 0, debt = 0, equity = 0): Eff => ({ ca, quick, cl, nca, debt, equity });
  switch (s.kind) {
    case 'sharesCash':
      return { ...DEALS.issueShares(x), text: 'issued the shares for cash' };
    case 'debCash':
      return { ...DEALS.issueDebentures(x), text: 'issued the debentures for cash' };
    case 'sharesVendor':
      return { ...DEALS.sharesForMachinery(x), text: 'paid for machinery in shares' };
    case 'debVendor':
      return {
        text: 'paid for machinery in debentures',
        eff: e(0, 0, 0, x, x, 0),
        note: `Machinery, a non-current asset, rises by ${inr(x)} and debentures, a long-term borrowing, rise by ${inr(x)}. No cash moves and no current item changes.`,
        slips: [
          [e(x, 0, 0, 0, x, 0), 'Treated the machinery as a current asset; it is a non-current asset.'],
          [e(0, 0, x, x, 0, 0), 'Took the debentures as a current liability; they are a long-term borrowing.'],
          [e(0, 0, 0, x, 0, x), "Took the debentures as part of the shareholders' funds; debentureholders are lenders."],
          [e(-x, -x, 0, x, 0, 0), 'Thought the machinery was paid for in cash; it was paid for in debentures.'],
        ],
      };
  }
}
const oneIssueText = (s: OneIssue): string => {
  const when = `On 1 ${s.month}`;
  const what: Record<IssueKind, string> = {
    sharesCash: `${when} it issued ${cnt(s.n)} equity shares of ₹10 each at a premium of ${inr(s.p)} a share, the whole ${inr(10 + s.p)} payable on application. The issue was fully subscribed, the shares were allotted and all the money was received by cheque.`,
    debCash: `${when} it issued ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each at par, the whole amount payable on application. All of them were subscribed and allotted, and the money was received by cheque. Interest is payable half-yearly on 30 September and 31 March.`,
    sharesVendor: `${when} it bought machinery for ${inr(s.x)} from ${s.v} and paid for it by allotting ${cnt(s.n)} equity shares of ₹10 each at a premium of ${inr(s.p)} a share.`,
    debVendor: `${when} it bought machinery for ${inr(s.x)} from ${s.v} and paid for it by allotting ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each at par. Interest is payable half-yearly on 30 September and 31 March.`,
  };
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. Just before the transaction below, its current assets were ${inr(s.ca)} and its current liabilities ${inr(s.cl)}, a current ratio of ${dec((s.ca * 100) / s.cl)} : 1; its long-term borrowings were ${inr(s.debt)} and its shareholders' funds ${inr(s.equity)}.`,
    what[s.kind],
    `Answer each question on this transaction alone. Debt means long-term borrowings; equity means shareholders' funds.${isShares(s.kind) ? ' The premium is credited to Securities Premium A/c when it falls due.' : ''} The accounting year ends on ${Y1}.`,
  ].join('\n');
};
function drawOneIssue(rng: Rng): OneIssue | null {
  const { co, trade } = firm(rng);
  const kind = rng.pick(['sharesCash', 'debCash', 'sharesVendor', 'debVendor'] as const);
  const cl = rng.step(200000, 600000, 20000);
  const ca = (cl * rng.pick([120, 150, 175, 200, 225, 250, 300])) / 100;
  const equity = rng.step(1500000, 5000000, 100000);
  const debt = Math.round((equity * rng.pick([20, 30, 40, 50, 60, 80, 100])) / 100 / 50000) * 50000;
  const when = rng.pick(D.ISSUE_DATES);
  const shares = isShares(kind);
  const n = shares ? rng.step(20000, 100000, 5000) : rng.step(2000, 10000, 500);
  const p = shares ? rng.pick([2, 3, 5, 8, 10, 15]) : 0;
  const x = shares ? n * (10 + p) : n * 100;
  const rate = shares ? 0 : D.wholeRate(rng, x, [when.months]);
  if (rate === null || debt <= 0) return null;
  return { co, trade, ca, cl, debt, equity, kind, n, p, rate, x, v: rng.pick(D.VENDORS), month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months };
}
const effectKept = keeper<{ eff: Eff; start: number; ratio: 'current' | 'debtEquity' }>();
const effectOn =
  (ratio: 'current' | 'debtEquity') =>
  (s: OneIssue): McqParts | null => {
    const spec = SPECS[ratio];
    const start = ratio === 'current' ? (s.ca * 100) / s.cl : Math.round((s.debt * 100) / s.equity);
    const deal = dealOf(s);
    const o = effectOptions(spec, deal, start);
    if (!o) return null;
    const prompt = `Will this transaction make the ${spec.name}${ratio === 'debtEquity' ? `, ${dec(start)} : 1 before it,` : ''} ${spec.ask}, and why?`;
    effectKept.keep(`${oneIssueText(s)}\n${prompt}`, { eff: deal.eff, start, ratio });
    return choice(prompt, o.correct, o.wrong, o.why, ['Ask which term of the ratio the transaction changes: the numerator, the denominator, both or neither.', 'Shares are part of the shareholders\' funds; debentures are a long-term borrowing; machinery is a non-current asset.']);
  };
const effectHolds = (q: McqQuestion): boolean => {
  const kept = effectKept.of(`${q.context ?? ''}\n${q.prompt}`);
  if (!kept) return false;
  const spec = SPECS[kept.ratio];
  const verdict = movedBy(spec, kept.eff, kept.start);
  return optionText(q).startsWith(`${spec.labels[verdict > 0 ? 0 : verdict < 0 ? 1 : 2]}:`);
};

function issueCashFlow(s: OneIssue): McqParts | null {
  const what = isShares(s.kind) ? 'issue of equity shares' : 'issue of debentures';
  const inflow = `As a financing inflow of ${inr(s.x)}, the proceeds of the ${what}`;
  const none = isCash(s.kind)
    ? `It is left out: an issue of ${isShares(s.kind) ? 'shares' : 'debentures'} only changes how the company is financed`
    : `It is left out: no cash moved, as the machinery was paid for in ${isShares(s.kind) ? 'shares' : 'debentures'}; it is disclosed apart as a non-cash transaction`;
  return choice(
    `How does this transaction appear in the Cash Flow Statement of ${s.co} for ${YEAR}?`,
    isCash(s.kind) ? inflow : none,
    [
      isCash(s.kind) ? [none, `Took the issue for a non-cash transaction; the ${isShares(s.kind) ? 'shares' : 'debentures'} were paid for by cheque.`] : [inflow, `Counted the ${isShares(s.kind) ? 'shares' : 'debentures'} as issued for cash; they were given to the vendor for the machinery.`],
      [`As an investing inflow of ${inr(s.x)}`, isCash(s.kind) ? 'Mixed up raising money from investors with investing it; money raised from shareholders and lenders is a financing flow.' : 'Took the machinery coming in for cash coming in; no cash moved.'],
      [`As an operating inflow of ${inr(s.x)}`, 'Took the money raised for revenue of the business; it is a financing flow, if a cash flow at all.'],
      [isCash(s.kind) ? `As a financing inflow of ${inr(isShares(s.kind) ? s.n * 10 : s.x)} and an investing inflow of ${inr(isShares(s.kind) ? s.n * s.p : 0)}` : `As an investing outflow of ${inr(s.x)} and a financing inflow of ${inr(s.x)}`, isCash(s.kind) ? 'Split the money received; the whole amount received on the issue, premium and all, is one financing inflow.' : 'Showed both sides of the exchange as cash flows; no cash moved either way.'],
    ].filter(([text]) => !text.includes('₹0')) as [string, string][],
    isCash(s.kind)
      ? `Money raised from ${isShares(s.kind) ? 'shareholders' : 'lenders'} is a financing activity: the whole ${inr(s.x)} received${isShares(s.kind) ? ', premium and all,' : ''} is a financing inflow.`
      : 'A Cash Flow Statement shows only flows of cash and cash equivalents. Machinery paid for by allotting securities brings in an asset without any cash, so it is left out of the statement and disclosed elsewhere as a non-cash investing and financing transaction.',
    H.financing,
  );
}
const issueCashFlowHolds = (q: McqQuestion): boolean => {
  const text = q.context ?? '';
  const forCash = text.includes('received by cheque');
  return optionText(q).startsWith(forCash ? 'As a financing inflow' : 'It is left out');
};

function issueRatioAfter(s: OneIssue): NumericParts | null {
  const shares = isShares(s.kind);
  const debt = s.debt + (shares ? 0 : s.x);
  const equity = s.equity + (shares ? s.x : 0);
  const n = times([debt, equity], [
    [[s.debt, s.equity], 'Gave the ratio as it stood before the transaction.'],
    [[equity, debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    shares ? [[s.debt + s.x, s.equity], "Took the shares issued as debt; they are part of the shareholders' funds."] : [[s.debt, s.equity + s.x], "Took the debentures as part of the shareholders' funds; they are a borrowing."],
    shares && [[s.debt, s.equity + s.n * 10], "Added only the face value of the shares; the premium is part of the shareholders' funds too."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio just after this transaction, ${AS_RATIO}.`,
    ...n,
    explanation: [
      shares ? `Shareholders' funds rise by the whole issue price of the shares, ${cnt(s.n)} x ${inr(10 + s.p)} = ${inr(s.x)}: share capital ${inr(s.n * 10)} and Securities Premium ${inr(s.n * s.p)}. Debt is unchanged.` : `Debt rises by the nominal value of the debentures, ${cnt(s.n)} x ₹100 = ${inr(s.x)}. Shareholders' funds are unchanged.`,
      `Debt to equity ratio = ${inr(debt)} ÷ ${inr(equity)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.solvency,
  };
}
const issueRatioAfterHolds = (q: NumericQuestion): boolean => {
  const text = q.context ?? '';
  const debt = afterWords(text, 'long-term borrowings were ₹');
  const equity = afterWords(text, "shareholders' funds ₹");
  const n = afterWords(text, text.includes('by allotting ') ? 'by allotting ' : 'it issued ');
  const shares = text.includes('equity shares of ₹10');
  const x = shares ? n * (10 + afterWords(text, 'at a premium of ₹')) : n * 100;
  return nearTimes(q.answer, shares ? [debt, equity + x] : [debt + x, equity]);
};

function issueLast(s: OneIssue): NumericParts | null {
  if (isShares(s.kind)) {
    const n = money(s.n * s.p, [
      [s.x, 'Gave the whole issue price; only the premium goes to Securities Premium A/c.'],
      [s.n * 10, 'Gave the face value of the shares, which is credited to Equity Share Capital A/c.'],
      [s.p, 'Gave the premium on one share; it is credited on every share allotted.'],
    ]);
    return n && {
      prompt: 'What amount is credited to Securities Premium A/c on the allotment of the shares?',
      ...n,
      explanation: [`Each share is issued at ₹10 + ${inr(s.p)} = ${inr(10 + s.p)}.`, `Securities Premium = ${cnt(s.n)} x ${inr(s.p)} = ${inr(s.n * s.p)}.`],
      hints: H.premium,
    };
  }
  const annual = (s.x * s.rate) / 100;
  const interest = (annual * s.months) / 12;
  const n = money(interest, [
    [annual, `Charged a full year although the debentures were allotted on 1 ${s.month}.`],
    [(annual * (12 - s.months)) / 12, 'Counted the months before the allotment instead of the months after it.'],
    [(annual * (s.months - 1)) / 12, 'Left out the month of allotment.'],
    [annual / 2, 'Took the interest of one half-year only.'],
  ]);
  return n && {
    prompt: `What is the interest on these debentures for the year ended ${Y1}?`,
    ...n,
    explanation: [`Interest for a year = ${s.rate}% of ${inr(s.x)} = ${inr(annual)}.`, `From 1 ${s.month} to ${Y1} is ${s.months} months: ${inr(annual)} x ${s.months}/12 = ${inr(interest)}.`],
    hints: D.H.interest,
  };
}
const oneIssueKept = keeper<OneIssue>();
const issueLastHolds = (q: NumericQuestion): boolean => {
  const s = oneIssueKept.of(q.context ?? '');
  if (!s) return false;
  return isShares(s.kind) ? q.answer === rupees(s.x - s.n * 10) : q.answer * 1200 === rupees(s.x * s.rate * s.months);
};

const oneIssueMakers = [effectOn('current'), effectOn('debtEquity'), issueCashFlow, issueRatioAfter, issueLast];
const caseEffectOfIssue = caseTemplate<OneIssue>({
  id: 'case-cy-effect-of-issue',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'What one issue does',
  setup: (rng) =>
    firstGood(30, () => drawOneIssue(rng), (s) => {
      const ok = oneIssueMakers.every((m) => m(s) !== null);
      if (ok) oneIssueKept.keep(oneIssueText(s), s);
      return ok;
    }),
  context: oneIssueText,
  parts: [
    { kind: 'mcq', make: effectOn('current'), verify: effectHolds },
    { kind: 'mcq', make: effectOn('debtEquity'), verify: effectHolds },
    { kind: 'mcq', make: issueCashFlow, verify: issueCashFlowHolds },
    { kind: 'numeric', unit: 'times', make: issueRatioAfter, verify: issueRatioAfterHolds },
    { kind: 'numeric', unit: 'rupees', make: issueLast, verify: issueLastHolds },
  ],
});

// ===============================================================================================================
// 5. case-cy-finance-costs-margin: the expenses of a year and two classes of debentures, one of them issued during the
//    year at a discount (redeemable at par) or at par (redeemable at a premium), its discount or loss written off
//    first from a Securities Premium too small to bear it. Asked: what is charged to the Statement of Profit and Loss
//    for the write-off, the line it goes under, the finance costs, the finance costs as a common size percentage, and
//    the net profit ratio after tax.
// ===============================================================================================================

interface Margin {
  co: string;
  trade: string;
  rev: number;
  oi: number;
  cmc: number;
  ebe: number;
  dep: number;
  oe: number;
  old: number;
  oldRate: number;
  n: number;
  rate: number;
  month: string;
  months: number;
  /** A discount on issue (redeemable at par), or a premium payable on redemption (issued at par): rupees a debenture of ₹100. */
  disc: number;
  red: number;
  years: number;
  sp0: number;
  tax: number;
}
const marginFigures = (s: Margin) => {
  const loss = s.n * (s.disc + s.red);
  const charged = loss - Math.min(loss, s.sp0);
  const oldInterest = (s.old * s.oldRate) / 100;
  const newInterest = (s.n * 100 * s.rate * s.months) / 1200;
  const fc = oldInterest + newInterest + charged;
  const expenses = s.cmc + s.ebe + s.dep + s.oe + fc;
  const pbt = s.rev + s.oi - expenses;
  const tax = (pbt * s.tax) / 100;
  return { loss, charged, oldInterest, newInterest, fc, expenses, pbt, taxAmt: tax, pat: pbt - tax };
};
const MARGIN_LINES = {
  rev: 'Revenue from operations',
  oi: 'Other income',
  cmc: 'Cost of materials consumed',
  ebe: 'Employee benefits expense',
  dep: 'Depreciation and amortisation expense',
  oe: 'Other expenses (other than finance costs)',
} as const;
function drawMargin(rng: Rng): Margin | null {
  const { co, trade } = firm(rng);
  const rev = 100000 * rng.int(40, 120);
  const share = (lo: number, hi: number): number => Math.round((rev * rng.int(lo, hi)) / 100 / 10000) * 10000;
  const when = rng.pick(D.ISSUE_DATES);
  const n = rng.step(2000, 12000, 1000);
  const rate = D.wholeRate(rng, n * 100, [when.months]);
  if (rate === null) return null;
  const atPremium = rng.int(0, 1) === 0;
  const loss = n * (atPremium ? 0 : rng.pick([5, 10]));
  const s: Margin = {
    co, trade, rev, oi: 10000 * rng.int(2, 15), cmc: share(46, 58), ebe: share(9, 15), dep: share(3, 6), oe: share(6, 10),
    old: rng.step(500000, 2500000, 100000), oldRate: rng.pick(D.RATES.filter((r) => r !== rate)), n, rate, month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months,
    disc: atPremium ? 0 : loss / n, red: atPremium ? rng.pick([5, 10]) : 0, years: rng.int(4, 8), sp0: 0, tax: rng.pick([25, 30]),
  };
  const whole = n * (s.disc + s.red);
  s.sp0 = rng.int(0, 2) === 0 ? 0 : Math.floor((whole * rng.pick([0.2, 0.25, 0.4, 0.5, 0.6])) / 1000) * 1000;
  const f = marginFigures(s);
  if (f.pbt * 100 < 5 * rev || f.pbt * 100 > 25 * rev || (f.pbt * s.tax) % 100 !== 0 || f.charged <= 0) return null;
  return s;
}
const marginText = (s: Margin): string => {
  const what = s.red > 0 ? 'loss' : 'discount';
  return [
    `${s.co}, ${s.trade}, gives these figures from its books for the year ended ${Y1}:`,
    ...(['rev', 'oi', 'cmc', 'ebe', 'dep', 'oe'] as const).map((k) => `${MARGIN_LINES[k]}: ${inr(s[k])}`),
    `Its ${s.oldRate}% Debentures of ${inr(s.old)} were outstanding for the whole year.`,
    `On 1 ${s.month} it issued ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each ${s.red > 0 ? `at par, redeemable at a premium of ${s.red}%` : `at a discount of ${s.disc}%, redeemable at par`} after ${s.years} years, for cash. ${s.red > 0 ? `The premium payable on redemption is provided for on allotment, and the whole loss on the issue is debited to ${D.LOSS_AC}.` : `The discount is debited to ${D.DISCOUNT_AC}.`}`,
    `Before this issue Securities Premium A/c ${s.sp0 > 0 ? `had a balance of ${inr(s.sp0)}` : 'had no balance'}. On ${Y1} the ${what} was written off in full, first from Securities Premium and then from the Statement of Profit and Loss.`,
    `Interest on both classes of debentures was paid on the due dates. There is no other finance cost. Tax is ${s.tax}% of the profit before tax.`,
  ].join('\n');
};
/** The figures read back from the printed case. */
function marginIn(text: string): Margin | null {
  const get = (label: string): number => lineIn(text, label);
  const issue = /issued ([\d,]+), (\d+)% Debentures of ₹100 each (?:at par, redeemable at a premium of (\d+)%|at a discount of (\d+)%, redeemable at par)/.exec(text);
  const old = /Its (\d+)% Debentures of ₹([\d,]+) were outstanding/.exec(text);
  const when = D.ISSUE_DATES.find((d) => text.includes(`On 1 ${d.month} `));
  if (!issue || !old || !when) return null;
  return {
    co: '', trade: '', rev: get(MARGIN_LINES.rev), oi: get(MARGIN_LINES.oi), cmc: get(MARGIN_LINES.cmc), ebe: get(MARGIN_LINES.ebe), dep: get(MARGIN_LINES.dep), oe: get(MARGIN_LINES.oe),
    old: Number(old[2].replace(/,/g, '')), oldRate: Number(old[1]), n: Number(issue[1].replace(/,/g, '')), rate: Number(issue[2]), month: '', months: when.months,
    disc: Number(issue[4] ?? 0), red: Number(issue[3] ?? 0), years: 0, sp0: text.includes('had no balance') ? 0 : afterWords(text, 'had a balance of ₹'), tax: afterWords(text, 'Tax is '),
  };
}

function marginCharged(s: Margin): NumericParts | null {
  const f = marginFigures(s);
  const what = s.red > 0 ? 'loss' : 'discount';
  const n = money(f.charged, [
    [f.loss, `Charged the whole ${what} to the Statement of Profit and Loss; Securities Premium is used first.`],
    [Math.min(f.loss, s.sp0), 'Gave the part written off against Securities Premium, not the part charged to the Statement of Profit and Loss.'],
    [f.loss / s.years, `Spread the ${what} over the ${s.years} years of the debentures; it is written off in full in the year of allotment.`],
    s.red > 0 && [s.n * s.red + s.n * 100, 'Took the whole amount payable on redemption as the loss.'],
  ]);
  return n && {
    prompt: `What amount of the ${what} on the new debentures is charged to the Statement of Profit and Loss for the year ended ${Y1}?`,
    ...n,
    explanation: [
      s.red > 0 ? `Loss on issue = premium payable on redemption = ${cnt(s.n)} x ${inr(s.red)} = ${inr(f.loss)}, debited to ${D.LOSS_AC}.` : `Discount on issue = ${cnt(s.n)} x ${inr(s.disc)} = ${inr(f.loss)}, debited to ${D.DISCOUNT_AC}.`,
      s.sp0 > 0 ? `Securities Premium bears what it can, ${inr(s.sp0)}; the rest, ${inr(f.loss)} - ${inr(s.sp0)} = ${inr(f.charged)}, is charged to the Statement of Profit and Loss.` : `Securities Premium has no balance, so the whole ${inr(f.loss)} is charged to the Statement of Profit and Loss.`,
    ],
    hints: D.H.writeOff,
  };
}
const marginChargedHolds = (q: NumericQuestion): boolean => {
  const s = marginIn(q.context ?? '');
  return !!s && q.answer === rupees(Math.max(0, s.n * (s.disc + s.red) - s.sp0));
};

function marginLine(s: Margin): McqParts | null {
  const item = PL_ITEMS.find((i) => i.name === (s.red > 0 ? 'Loss on issue of debentures written off' : 'Discount on issue of debentures written off'));
  if (!item) return null;
  return choice(
    `Under which line of the Statement of Profit and Loss is the amount charged for the ${s.red > 0 ? 'loss' : 'discount'} on issue shown?`,
    FS_CASE.lineName(item.line),
    [
      ...item.wrong.map(([line, why]): [string, string] => [FS_CASE.lineName(line), why]),
      ['It is not shown there: the whole of it is set against Securities Premium', 'Thought Securities Premium bears all of it; it bears only what its balance allows, and the rest is charged to profit.'],
    ],
    `${item.note} Only the part Securities Premium could not bear reaches the statement.`,
    D.H.writeOff,
  );
}
const marginLineHolds = (q: McqQuestion): boolean => optionText(q) === FS_CASE.lineName('fc');

function marginFinance(s: Margin): NumericParts | null {
  const f = marginFigures(s);
  const n = money(f.fc, [
    [f.oldInterest + f.newInterest, `Left out the ${s.red > 0 ? 'loss' : 'discount'} charged to the Statement of Profit and Loss, which is a finance cost.`],
    [f.oldInterest + (s.n * 100 * s.rate) / 100 + f.charged, 'Charged a full year of interest on the new debentures.'],
    [f.oldInterest + f.newInterest + f.loss, `Took the whole ${s.red > 0 ? 'loss' : 'discount'} as a finance cost; the part Securities Premium bore is not charged to profit.`],
    [f.newInterest + f.charged, `Left out the interest on the ${s.oldRate}% Debentures.`],
  ]);
  return n && {
    prompt: `What are the finance costs of ${s.co} for the year ended ${Y1}?`,
    ...n,
    explanation: [
      `Interest on the ${s.oldRate}% Debentures for the year = ${s.oldRate}% of ${inr(s.old)} = ${inr(f.oldInterest)}.`,
      `Interest on the new debentures, on their nominal value, for the ${s.months} months from 1 ${s.month} = ${s.rate}% of ${inr(s.n * 100)} x ${s.months}/12 = ${inr(f.newInterest)}.`,
      `${s.red > 0 ? 'Loss' : 'Discount'} on issue charged to the Statement of Profit and Loss = ${inr(f.charged)}, a finance cost.`,
      `Finance costs = ${inr(f.oldInterest)} + ${inr(f.newInterest)} + ${inr(f.charged)} = ${inr(f.fc)}.`,
    ],
    hints: ['Finance costs: interest on every borrowing for the time it was outstanding, and a discount or loss on issue of debentures charged to profit.', D.H.interest[1]],
  };
}
const marginFinanceHolds = (q: NumericQuestion): boolean => {
  const s = marginIn(q.context ?? '');
  return !!s && q.answer * 1200 === rupees(s.old * s.oldRate * 12 + s.n * 100 * s.rate * s.months + Math.max(0, s.n * (s.disc + s.red) - s.sp0) * 1200);
};

function marginShare(s: Margin): NumericParts | null {
  const f = marginFigures(s);
  const n = percent([f.fc, s.rev], [
    [[f.fc, s.rev + s.oi], 'Divided by total income; in a common size Statement of Profit and Loss revenue from operations is 100.'],
    [[f.oldInterest + f.newInterest, s.rev], `Left the ${s.red > 0 ? 'loss' : 'discount'} written off out of the finance costs.`],
    [[f.fc, f.expenses], 'Took the finance costs as a share of total expenses; the base is revenue from operations.'],
    [[f.fc, f.pbt], 'Took the finance costs as a share of the profit before tax.'],
  ]);
  return n && {
    prompt: `In the common size Statement of Profit and Loss of ${s.co} for the year (revenue from operations = 100), what percentage do finance costs take? Give it to two decimal places.`,
    ...n,
    explanation: [`Finance costs = ${inr(f.fc)}.`, `Percentage = ${inr(f.fc)} ÷ revenue from operations ${inr(s.rev)} × 100 = ${pc(n.answer)}.`],
    hints: ['In a common size Statement of Profit and Loss every line is a percentage of revenue from operations.', 'Work out the finance costs in rupees first.'],
  };
}
const marginShareHolds = (q: NumericQuestion): boolean => {
  const s = marginIn(q.context ?? '');
  return !!s && nearPercent(q.answer, [marginFigures(s).fc, s.rev]);
};

function marginNet(s: Margin): NumericParts | null {
  const f = marginFigures(s);
  const n = percent([f.pat, s.rev], [
    [[f.pbt, s.rev], 'Used the profit before tax, although the ratio is asked on the profit after tax.'],
    [[f.pat, s.rev + s.oi], 'Divided by total income; the ratio is on revenue from operations.'],
    [[f.pat + ((f.charged * (100 - s.tax)) / 100), s.rev], `Left the ${s.red > 0 ? 'loss' : 'discount'} written off out of the expenses.`],
    [[f.pat - (((s.n * 100 * s.rate) / 100 - f.newInterest) * (100 - s.tax)) / 100, s.rev], 'Charged a full year of interest on the new debentures.'],
  ]);
  return n && {
    prompt: `Find the net profit ratio of ${s.co} for the year on its profit after tax, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Total income = ${inr(s.rev)} + ${inr(s.oi)} = ${inr(s.rev + s.oi)}.`,
      `Total expenses = ${inr(s.cmc)} + ${inr(s.ebe)} + finance costs ${inr(f.fc)} + ${inr(s.dep)} + ${inr(s.oe)} = ${inr(f.expenses)}.`,
      `Profit before tax = ${inr(s.rev + s.oi)} - ${inr(f.expenses)} = ${inr(f.pbt)}; tax at ${s.tax}% = ${inr(f.taxAmt)}; profit after tax = ${inr(f.pat)}.`,
      `Net profit ratio = ${inr(f.pat)} ÷ ${inr(s.rev)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: ['Work down the statement: total income, total expenses with the finance costs, profit before tax, tax, profit after tax.', 'Net profit ratio = profit after tax ÷ revenue from operations × 100.'],
  };
}
const marginNetHolds = (q: NumericQuestion): boolean => {
  const s = marginIn(q.context ?? '');
  if (!s) return false;
  // Profit after tax another way: what is left of every rupee of profit before tax once tax is taken.
  const f = marginFigures(s);
  return nearPercent(q.answer, [((s.rev + s.oi - s.cmc - s.ebe - s.dep - s.oe - f.fc) * (100 - s.tax)) / 100, s.rev]);
};

const marginMakers = [marginCharged, marginLine, marginFinance, marginShare, marginNet];
const caseMargin = caseTemplate<Margin>({
  id: 'case-cy-finance-costs-margin',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Finance costs and the net margin',
  setup: (rng) => firstGood(40, () => drawMargin(rng), (s) => marginMakers.every((m) => m(s) !== null)),
  context: marginText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: marginCharged, verify: marginChargedHolds },
    { kind: 'mcq', make: marginLine, verify: marginLineHolds },
    { kind: 'numeric', unit: 'rupees', make: marginFinance, verify: marginFinanceHolds },
    { kind: 'numeric', unit: 'percent', make: marginShare, verify: marginShareHolds },
    { kind: 'numeric', unit: 'percent', make: marginNet, verify: marginNetHolds },
  ],
});

// ===============================================================================================================
// 6. case-cy-two-sheets-issue: the balance sheets of two dates of a company that issued shares for cash at a premium
//    during the year and redeemed nothing. Read from the two sheets: how many shares were issued, what the issue
//    brought in (the financing inflow), where the premium goes in the Cash Flow Statement, the percentage change of a
//    line (which line, and whether it rose or fell, varies), and the quick ratio at the later date.
// ===============================================================================================================

/** "Label: ₹a on 31 March 2025, ₹b on 31 March 2026", a nil figure written "nil" as the cash flow topic writes it. */
const twoDates = (label: string, a: number, b: number): string => `${label}: ${a === 0 ? 'nil' : inr(a)} on ${Y0}, ${b === 0 ? 'nil' : inr(b)} on ${Y1}`;
/** The lines written by `twoDates`, by label, in whole rupees. */
function datesIn(text: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const figure = (x: string): number => (x === 'nil' ? 0 : Number(x.slice(1).replace(/,/g, '')));
  for (const m of text.matchAll(/^(.+?): (nil|₹[\d,]+) on 31 March 2025, (nil|₹[\d,]+) on 31 March 2026$/gm)) out.set(m[1], [figure(m[2]), figure(m[3])]);
  return out;
}
const SHEET = {
  sc: 'Equity share capital (shares of ₹10 each, fully paid)',
  sp: 'Securities premium',
  surplus: 'Surplus (balance in Statement of Profit and Loss)',
  ltb: 'Long-term borrowings',
  tp: 'Trade payables',
  stp: 'Short-term provisions',
  ppe: 'Property, plant and equipment',
  inv: 'Inventories',
  tr: 'Trade receivables',
  prepaid: 'Other current assets (prepaid expenses)',
  cash: 'Cash and cash equivalents',
} as const;
type SheetKey = keyof typeof SHEET;
interface TwoSheets {
  co: string;
  trade: string;
  v: Record<SheetKey, [number, number]>;
  p: number;
  /** The line whose percentage change is asked. */
  asked: 'inv' | 'tr' | 'tp' | 'ltb' | 'ppe';
}
const FUNDS: SheetKey[] = ['sc', 'sp', 'surplus', 'ltb', 'tp', 'stp'];
const OWNED: SheetKey[] = ['ppe', 'inv', 'tr', 'prepaid', 'cash'];
function drawTwoSheets(rng: Rng): TwoSheets | null {
  const { co, trade } = firm(rng);
  const shares0 = rng.step(100000, 500000, 10000);
  const n = Math.round((shares0 * rng.pick([20, 25, 30, 40, 50])) / 100 / 5000) * 5000;
  const p = rng.pick([2, 3, 4, 5, 6, 8, 10]);
  const sp0 = rng.int(0, 2) === 0 ? 0 : rng.step(50000, 400000, 10000);
  const k = (min: number, max: number, step: number): number => rng.step(min, max, step);
  const move = (x: number, lo: number, hi: number): number => Math.round((x * (100 + rng.int(lo, hi) * rng.pick([-1, 1]))) / 100 / 5000) * 5000;
  const surplus0 = k(200000, 1500000, 10000);
  const ltb0 = k(400000, 2000000, 50000);
  const tp0 = k(150000, 600000, 5000);
  const stp0 = k(40000, 200000, 5000);
  const inv0 = k(200000, 800000, 5000);
  const tr0 = k(150000, 700000, 5000);
  const withPrepaid = rng.int(0, 1) === 0;
  const prepaid0 = withPrepaid ? k(10000, 50000, 5000) : 0;
  const cash0 = k(80000, 400000, 5000);
  const v: Record<SheetKey, [number, number]> = {
    sc: [shares0 * 10, (shares0 + n) * 10],
    sp: [sp0, sp0 + n * p],
    surplus: [surplus0, surplus0 + k(100000, 600000, 10000)],
    ltb: [ltb0, Math.max(100000, ltb0 - rng.int(0, 1) * k(50000, Math.max(50000, Math.floor(ltb0 / 3 / 50000) * 50000), 50000))],
    tp: [tp0, move(tp0, 5, 30)],
    stp: [stp0, move(stp0, 5, 40)],
    ppe: [0, 0],
    inv: [inv0, move(inv0, 5, 35)],
    tr: [tr0, move(tr0, 5, 35)],
    prepaid: [prepaid0, withPrepaid ? move(prepaid0, 10, 50) : 0],
    cash: [cash0, move(cash0, 10, 60)],
  };
  for (const d of [0, 1]) v.ppe[d] = sum(FUNDS.map((key) => v[key][d])) - sum(OWNED.filter((key) => key !== 'ppe').map((key) => v[key][d]));
  const total0 = sum(FUNDS.map((key) => v[key][0]));
  if (v.ppe[0] * 100 < 40 * total0 || v.ppe[1] < v.ppe[0] * 0.9 || v.ppe[1] > v.ppe[0] * 1.6) return null;
  // Every line but the premium (where there was none) moves, so that every change asked is a change.
  if ((['tp', 'stp', 'inv', 'tr', 'cash', 'ppe'] as SheetKey[]).some((key) => v[key][0] === v[key][1])) return null;
  return { co, trade, v, p, asked: rng.pick(['inv', 'tr', 'tp', 'ltb', 'ppe'] as const) };
}
const twoSheetsText = (s: TwoSheets): string => {
  const shown = (key: SheetKey): boolean => s.v[key][0] > 0 || s.v[key][1] > 0;
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. These are the whole of its balance sheets on ${Y0} and on ${Y1}.`,
    'Equity and liabilities',
    ...FUNDS.filter(shown).map((key) => twoDates(SHEET[key], s.v[key][0], s.v[key][1])),
    'Assets',
    ...OWNED.filter(shown).map((key) => twoDates(SHEET[key], s.v[key][0], s.v[key][1])),
    'During the year the company issued equity shares for cash at a premium, all the money being received. No other shares were issued and nothing was redeemed. Short-term provisions are the provision for tax.',
  ].join('\n');
};

function sheetsShares(s: TwoSheets): NumericParts | null {
  const added = s.v.sc[1] - s.v.sc[0];
  const premium = s.v.sp[1] - s.v.sp[0];
  const n = count(added / 10, [
    [(added + premium) / 10, 'Divided all the money raised by the face value; the premium is not share capital.'],
    [s.v.sc[1] / 10, 'Gave all the shares in issue at the later date, not those issued during the year.'],
    [premium / 10, 'Divided the rise in Securities Premium by the face value.'],
    [added / 100, 'Took the shares as of ₹100 each.'],
  ]);
  return n && {
    prompt: `How many equity shares did ${s.co} issue during ${YEAR}?`,
    ...n,
    explanation: [`Share capital rose by ${inr(s.v.sc[1])} - ${inr(s.v.sc[0])} = ${inr(added)}, the face value of the shares issued.`, `Shares issued = ${inr(added)} ÷ ₹10 = ${cnt(added / 10)}.`],
    hints: ['Share capital is the face value of the shares in issue: its rise is the face value of the new shares.', 'The premium is in Securities Premium, not in share capital.'],
  };
}
const sheetsSharesHolds = (q: NumericQuestion): boolean => {
  const sc = datesIn(q.context ?? '').get(SHEET.sc);
  return !!sc && q.answer * 10 === sc[1] - sc[0];
};

function sheetsProceeds(s: TwoSheets): NumericParts | null {
  const added = s.v.sc[1] - s.v.sc[0];
  const premium = s.v.sp[1] - s.v.sp[0];
  const n = money(added + premium, [
    [added, 'Left out the premium; the whole issue price received is the inflow.'],
    [s.v.sc[1] + s.v.sp[1], 'Took the closing balances instead of the rise during the year.'],
    s.v.sp[0] > 0 && [added + s.v.sp[1], 'Took the whole closing balance of Securities Premium instead of its rise.'],
    [added + premium + s.v.surplus[1] - s.v.surplus[0], 'Added the rise in Surplus, which comes from profit and is no proceeds of an issue.'],
  ]);
  return n && {
    prompt: `What is the amount of "Proceeds from issue of equity shares" in the Cash Flow Statement of ${s.co} for ${YEAR}?`,
    ...n,
    explanation: [
      `Share capital rose by ${inr(added)} and Securities Premium by ${s.v.sp[0] > 0 ? `${inr(s.v.sp[1])} - ${inr(s.v.sp[0])} = ` : ''}${inr(premium)}${s.v.sp[0] > 0 ? '' : ', from nil'}.`,
      `The shares were issued for cash and all the money came in: proceeds = ${inr(added)} + ${inr(premium)} = ${inr(added + premium)}, a financing inflow.`,
    ],
    hints: ['Proceeds of an issue = rise in share capital + rise in Securities Premium, when the shares are issued for cash.', 'It is a financing inflow.'],
  };
}
const sheetsProceedsHolds = (q: NumericQuestion): boolean => {
  const f = datesIn(q.context ?? '');
  const up = (label: string): number => (f.get(label)?.[1] ?? 0) - (f.get(label)?.[0] ?? 0);
  return q.answer === rupees(up(SHEET.sc) + up(SHEET.sp));
};

function sheetsPremiumFlow(s: TwoSheets): McqParts | null {
  const premium = s.v.sp[1] - s.v.sp[0];
  return choice(
    `Where does the rise of ${inr(premium)} in Securities Premium appear in the Cash Flow Statement?`,
    'Under financing activities, as part of the proceeds from the issue of shares',
    [
      ['Nowhere: Securities Premium is a reserve, not cash', 'Forgot that the premium came in as cash with the shares; it is part of what the issue brought in.'],
      ['Under operating activities, added to the net profit like a reserve', 'Treated the premium as a transfer out of profit; it was received from the shareholders.'],
      ['Under investing activities, as an inflow of its own', 'Took the premium for a return on an investment; it is money raised from shareholders.'],
      ['Under financing activities, as an outflow, since the premium is owed to the shareholders', 'Treated the premium as owed back; it belongs to the company.'],
    ],
    `The premium was received in cash with the shares, so the whole issue price, ${inr(s.v.sc[1] - s.v.sc[0])} of capital and ${inr(premium)} of premium, is one financing inflow: proceeds from issue of shares.`,
    H.financing,
  );
}
const sheetsPremiumFlowHolds = (q: McqQuestion): boolean => (q.context ?? '').includes('issued equity shares for cash at a premium') && optionText(q).startsWith('Under financing activities, as part of the proceeds');

function sheetsChange(s: TwoSheets): NumericParts | null {
  const label = SHEET[s.asked];
  const [a, b] = s.v[s.asked];
  if (a === b) return null;
  const up = b > a;
  const change = Math.abs(b - a);
  const n = percent([change, a], [
    [[change, b], `Divided the change by the figure of ${Y1}; the base is the earlier figure.`],
    [[b, a], 'Gave the later figure as a percentage of the earlier one; the change has to be taken first.'],
    [[change, sum(FUNDS.map((key) => s.v[key][0]))], 'Divided the change by the total of the balance sheet; a percentage change is worked on the line itself.'],
  ]);
  return n && {
    prompt: `By what percentage did the line "${label}" ${up ? 'rise' : 'fall'} from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [`${label}: ${inr(b)} - ${inr(a)} = ${up ? '' : '-'}${inr(change)}, ${up ? 'an increase' : 'a decrease'}.`, `Percentage change = ${inr(change)} ÷ ${inr(a)} × 100 = ${pc(n.answer)}${up ? '' : ', a decrease'}.`],
    hints: H.change,
  };
}
const sheetsChangeHolds = (q: NumericQuestion): boolean => {
  const f = datesIn(q.context ?? '');
  const line = [...f].find(([label]) => q.prompt.includes(`"${label}"`));
  if (!line) return false;
  const [a, b] = line[1];
  return q.prompt.includes(b > a ? `" rise from` : `" fall from`) && nearPercent(q.answer, [Math.abs(b - a), a]);
};

function sheetsQuick(s: TwoSheets): NumericParts | null {
  const quick = s.v.tr[1] + s.v.cash[1];
  const ca = quick + s.v.inv[1] + s.v.prepaid[1];
  const cl = s.v.tp[1] + s.v.stp[1];
  const n = times([quick, cl], [
    [[ca, cl], 'Kept the inventories in: that is the current ratio.'],
    s.v.prepaid[1] > 0 && [[quick + s.v.prepaid[1], cl], 'Took out the inventories but left the prepaid expenses in the quick assets.'],
    [[s.v.tr[0] + s.v.cash[0], s.v.tp[0] + s.v.stp[0]], `Worked the ratio for ${Y0}; it is asked for ${Y1}.`],
    [[quick, cl + s.v.ltb[1]], 'Counted the long-term borrowings among the current liabilities.'],
    [[quick, s.v.tp[1]], 'Left the short-term provisions out of the current liabilities.'],
  ]);
  return n && {
    prompt: `Find the quick ratio of ${s.co} as at ${Y1}, its quick assets being the current assets less inventories and prepaid expenses, ${AS_RATIO}.`,
    ...n,
    explanation: [
      `Quick assets = trade receivables ${inr(s.v.tr[1])} + cash and cash equivalents ${inr(s.v.cash[1])} = ${inr(quick)}.`,
      `Current liabilities = trade payables ${inr(s.v.tp[1])} + short-term provisions ${inr(s.v.stp[1])} = ${inr(cl)}.`,
      `Quick ratio = ${inr(quick)} ÷ ${inr(cl)} = ${dec(n.answer)} : 1.`,
    ],
    hints: ['Quick assets = current assets - inventories - prepaid expenses.', 'Take the figures of the date asked for.'],
  };
}
const sheetsQuickHolds = (q: NumericQuestion): boolean => {
  const f = datesIn(q.context ?? '');
  const at = (label: string): number => f.get(label)?.[1] ?? 0;
  // The current assets less what is not quick, against the current liabilities.
  const ca = at(SHEET.inv) + at(SHEET.tr) + at(SHEET.prepaid) + at(SHEET.cash);
  return nearTimes(q.answer, [ca - at(SHEET.inv) - at(SHEET.prepaid), at(SHEET.tp) + at(SHEET.stp)]);
};

const twoSheetsMakers = [sheetsShares, sheetsProceeds, sheetsPremiumFlow, sheetsChange, sheetsQuick];
const caseTwoSheets = caseTemplate<TwoSheets>({
  id: 'case-cy-two-sheets-issue',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Two balance sheets around an issue',
  setup: (rng) => firstGood(40, () => drawTwoSheets(rng), (s) => twoSheetsMakers.every((m) => m(s) !== null)),
  context: twoSheetsText,
  parts: [
    { kind: 'numeric', unit: 'number', make: sheetsShares, verify: sheetsSharesHolds },
    { kind: 'numeric', unit: 'rupees', make: sheetsProceeds, verify: sheetsProceedsHolds },
    { kind: 'mcq', make: sheetsPremiumFlow, verify: sheetsPremiumFlowHolds },
    { kind: 'numeric', unit: 'percent', make: sheetsChange, verify: sheetsChangeHolds },
    { kind: 'numeric', unit: 'times', make: sheetsQuick, verify: sheetsQuickHolds },
  ],
});

// ===============================================================================================================
// 7. case-cy-arrears-gearing: a company with debentures in issue offers more shares (fully or under-subscribed, at
//    par or at a premium, in three or four instalments); at the year end one holder still owes the last call, or the
//    last two calls, and nothing has been forfeited. Asked: the calls in arrears, where they are shown, the share
//    capital in the balance sheet, the proceeds of the issue in the Cash Flow Statement, and the debt to equity ratio.
// ===============================================================================================================

interface Arrears {
  co: string;
  trade: string;
  f: ScFloat;
  d: ScDefaulter;
  n0: number;
  rs0: number;
  debRate: number;
  deb: number;
  profit: number;
}
function drawArrears(rng: Rng): Arrears | null {
  const { co, trade } = firm(rng);
  const count = rng.pick([3, 4, 4] as const);
  const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
  s.arrears = rng.int(0, 1) === 0;
  const n0 = s.face === 10 ? rng.step(100000, 600000, 10000) : rng.step(20000, 80000, 1000);
  const lot = s.face === 10 ? 10000 : 1000;
  const offered = Math.round((n0 * rng.pick([25, 30, 40, 50])) / 100 / lot) * lot;
  const n = rng.int(0, 2) === 0 ? offered - (offered * rng.pick([2, 4, 5, 8, 10])) / 100 : offered;
  if (n < 5000 || !Number.isInteger(n)) return null;
  const k = S.holding(rng, n, 100, 2, 20);
  // The last call, or (with four instalments) the last two calls.
  const from = count === 4 && rng.int(0, 1) === 0 ? 2 : count - 1;
  const d: ScDefaulter = { who: rng.pick(S.HOLDERS), k, applied: k, from, forfeited: false };
  const f = S.seal({ co, s, offered, n, refused: 0, pro: null, bad: [d], lots: [] });
  if (!f) return null;
  const capital0 = n0 * s.face;
  const rs0 = Math.round((capital0 * rng.pick([20, 30, 40, 60])) / 100 / 10000) * 10000;
  const deb = Math.round(((capital0 + rs0) * rng.pick([30, 40, 50, 60, 80])) / 100 / 100000) * 100000;
  const profit = Math.round(((capital0 + rs0) * rng.pick([6, 8, 10, 12])) / 100 / 10000) * 10000;
  return deb > 0 ? { co, trade, f, d, n0, rs0, debRate: rng.pick(D.RATES), deb, profit } : null;
}
const arrearsText = (c: Arrears): string => {
  const s = c.f.s;
  return [
    `${c.co}, ${c.trade}, ${NOT_FINANCING}. On ${Y0} it had ${cnt(c.n0)} ${S.sharesOf(s)} in issue, all fully paid, reserves and surplus of ${inr(c.rs0)} and ${c.debRate}% Debentures of ${inr(c.deb)}, redeemable in 2031.`,
    `During ${YEAR} it offered ${cnt(c.f.offered)} more ${S.sharesOf(s)} to the public ${S.priced(s)}, payable ${S.terms(s)}. ${c.f.n < c.f.offered ? `Applications were received for ${cnt(c.f.n)} shares only, and all of them were allotted.` : 'The issue was fully subscribed and every share was allotted.'} Every call was made before ${Y1}.`,
    `${c.d.who}, who holds ${cnt(c.d.k)} of these shares, did not pay ${S.dues(s, c.d.from)}; every other amount called was received, and nothing has been forfeited. ${S.arrearsRule(s)}`,
    `Its profit after tax for the year, all of it kept in the business, was ${inr(c.profit)}. Nothing was borrowed or repaid during the year.`,
    `All money is received through the bank.${s.premium > 0 ? ' The premium is credited to Securities Premium A/c when the instalment that carries it falls due.' : ''}`,
  ].join('\n');
};
const arrearsKept = keeper<Arrears>();
const arrearsOf = (c: Arrears): number => S.unpaidAll(c.f, c.d);
const arrearsCapital = (c: Arrears): number => c.n0 * c.f.s.face + c.f.n * c.f.s.face - arrearsOf(c);

function arrearsAmount(c: Arrears): NumericParts | null {
  const { f, d } = c;
  const s = f.s;
  const last = s.parts.length - 1;
  const owed = arrearsOf(c);
  const n = money(owed, [
    [d.k * s.face, 'Gave the whole face value of the shares in arrears, not what is still unpaid on them.'],
    d.from < last && [d.k * s.parts[last], 'Counted only the last call; the call before it is unpaid too.'],
    [d.k * sum(s.parts.slice(0, d.from)), 'Gave what the holder had paid, not what is unpaid.'],
    [f.n * s.parts[last], 'Gave the whole of the last call on every share.'],
  ]);
  return n && {
    prompt: `What are the calls in arrears of ${c.co} on ${Y1}?`,
    ...n,
    explanation: [
      `${d.who} did not pay ${S.dues(s, d.from)} on ${cnt(d.k)} shares: ${d.from < last ? `${s.parts.slice(d.from).map((x) => inr(x)).join(' + ')} = ` : ''}${inr(sum(s.parts.slice(d.from)))} a share.`,
      `Calls in arrears = ${cnt(d.k)} x ${inr(sum(s.parts.slice(d.from)))} = ${inr(owed)}.${s.arrears ? '' : ' The company keeps no Calls in Arrears A/c, but the amount is unpaid all the same.'}`,
    ],
    hints: ['Calls in arrears = shares in arrears x the calls not paid on each share.', 'A premium paid with the allotment money is never part of the calls in arrears here: only calls are unpaid.'],
  };
}
const arrearsAmountHolds = (q: NumericQuestion): boolean => {
  const c = arrearsKept.of(q.context ?? '');
  if (!c) return false;
  // From the books of the issue: what was called up and premium due, less what the bank received.
  const s = c.f.s;
  return q.answer === rupees(c.f.n * (s.face + s.premium)) - S.net(S.books(s).ledger, 'bank');
};

const arrearsHead = (c: Arrears): McqParts | null =>
  headQuestion(
    `How are the calls in arrears dealt with in the balance sheet of ${c.co} as at ${Y1}? Under which head and sub-head?`,
    'Calls in arrears',
    `In the note on share capital they are deducted from the shares subscribed but not fully paid.`,
  );
const arrearsHeadHolds = headHolds('Calls in arrears');

function arrearsShareCapital(c: Arrears): NumericParts | null {
  const { f } = c;
  const s = f.s;
  const answer = arrearsCapital(c);
  const old = c.n0 * s.face;
  const n = money(answer, [
    [answer + arrearsOf(c), 'Did not deduct the calls in arrears from the subscribed capital.'],
    [old + f.offered * s.face - arrearsOf(c), 'Took the shares offered, not the shares allotted.'],
    s.premium > 0 && [answer + f.n * s.premium, 'Added the Securities Premium to the share capital; it is a reserve.'],
    [f.n * s.face - arrearsOf(c), `Left out the ${cnt(c.n0)} shares in issue before the year.`],
  ]);
  return n && {
    prompt: `What is the share capital of ${c.co} in its balance sheet as at ${Y1}?`,
    ...n,
    explanation: [
      `Subscribed and called up: ${cnt(c.n0)} + ${cnt(f.n)} = ${cnt(c.n0 + f.n)} shares at ${inr(s.face)} = ${inr(old + f.n * s.face)}.`,
      `Less calls in arrears ${inr(arrearsOf(c))}: share capital = ${inr(answer)}.${s.premium > 0 ? ' Securities Premium is shown under Reserves and Surplus.' : ''}`,
    ],
    hints: S.H.note,
  };
}
const arrearsShareCapitalHolds = (q: NumericQuestion): boolean => {
  const c = arrearsKept.of(q.context ?? '');
  if (!c) return false;
  const b = S.books(c.f.s);
  // The capital credited by the books, less what is still owed on it (the arrears are what the bank is short of).
  const owed = rupees(c.f.n * (c.f.s.face + c.f.s.premium)) - S.net(b.ledger, 'bank');
  return q.answer === rupees(c.n0 * c.f.s.face) - S.net(b.ledger, S.capitalId(c.f.s.kind)) - owed;
};

function arrearsProceeds(c: Arrears): NumericParts | null {
  const { f, d } = c;
  const s = f.s;
  const cash = f.n * (s.face + s.premium) - arrearsOf(c);
  const n = money(cash, [
    [f.n * (s.face + s.premium), `Took the whole issue price on every share, although ${d.who} still owes ${inr(arrearsOf(c))}.`],
    s.premium > 0 && [cash - f.n * s.premium, 'Left out the premium received; it is part of the proceeds.'],
    [f.offered * (s.face + s.premium) - arrearsOf(c), 'Took the shares offered, not the shares allotted.'],
    [arrearsCapital(c), 'Gave the share capital of the balance sheet, the old shares with it.'],
  ]);
  return n && {
    prompt: `What are the proceeds from the issue of shares in the Cash Flow Statement of ${c.co} for ${YEAR}?`,
    ...n,
    explanation: [`Due on the ${cnt(f.n)} shares allotted = ${cnt(f.n)} x ${inr(s.face + s.premium)} = ${inr(f.n * (s.face + s.premium))}.`, `Less the calls in arrears, which did not come in: ${inr(f.n * (s.face + s.premium))} - ${inr(arrearsOf(c))} = ${inr(cash)}, a financing inflow.`],
    hints: ['Only the money received is a cash flow: what is still in arrears has not come in.', 'Proceeds from issue of shares are a financing inflow.'],
  };
}
const arrearsProceedsHolds = (q: NumericQuestion): boolean => {
  const c = arrearsKept.of(q.context ?? '');
  return !!c && q.answer === S.net(S.books(c.f.s).ledger, 'bank');
};

function arrearsGearing(c: Arrears): NumericParts | null {
  const s = c.f.s;
  const equity = arrearsCapital(c) + c.rs0 + c.f.n * s.premium + c.profit;
  const n = times([c.deb, equity], [
    [[equity, c.deb], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[c.deb, equity + arrearsOf(c)], "Did not deduct the calls in arrears from the shareholders' funds."],
    [[c.deb, c.n0 * s.face + c.rs0], "Took the shareholders' funds of the year before."],
    s.premium > 0 && [[c.deb, equity - c.f.n * s.premium], "Left the Securities Premium out of the shareholders' funds."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio of ${c.co} as at ${Y1}, debt being its debentures and equity its shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [
      `Shareholders' funds = share capital ${inr(arrearsCapital(c))} + reserves and surplus (${inr(c.rs0)}${s.premium > 0 ? ` + Securities Premium ${inr(c.f.n * s.premium)}` : ''} + profit kept ${inr(c.profit)}) = ${inr(equity)}.`,
      `Debt to equity ratio = ${inr(c.deb)} ÷ ${inr(equity)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.solvency,
  };
}
const arrearsGearingHolds = (q: NumericQuestion): boolean => {
  const c = arrearsKept.of(q.context ?? '');
  if (!c) return false;
  // The shareholders' funds another way: what they were, the profit kept and the cash the issue brought in.
  const cash = S.net(S.books(c.f.s).ledger, 'bank') / 100;
  return nearTimes(q.answer, [c.deb, c.n0 * c.f.s.face + c.rs0 + c.profit + cash]);
};

const arrearsMakers = [arrearsAmount, arrearsHead, arrearsShareCapital, arrearsProceeds, arrearsGearing];
const caseArrears = caseTemplate<Arrears>({
  id: 'case-cy-arrears-gearing',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Calls in arrears at the year end',
  setup: (rng) =>
    firstGood(30, () => drawArrears(rng), (c) => {
      const ok = arrearsMakers.every((m) => m(c) !== null);
      if (ok) arrearsKept.keep(arrearsText(c), c);
      return ok;
    }),
  context: arrearsText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: arrearsAmount, verify: arrearsAmountHolds },
    { kind: 'mcq', make: arrearsHead, verify: arrearsHeadHolds },
    { kind: 'numeric', unit: 'rupees', make: arrearsShareCapital, verify: arrearsShareCapitalHolds },
    { kind: 'numeric', unit: 'rupees', make: arrearsProceeds, verify: arrearsProceedsHolds },
    { kind: 'numeric', unit: 'times', make: arrearsGearing, verify: arrearsGearingHolds },
  ],
});

// ===============================================================================================================
// 8. case-cy-prorata-cash: a company already running makes an over-subscribed issue: some applications refused and
//    the money returned, the rest allotted pro rata, every call made and every amount received. Asked: the money
//    refunded, the money received on allotment, the proceeds the Cash Flow Statement shows for the year, where a
//    refund still owed at the year end would stand, and the percentage rise in share capital.
// ===============================================================================================================

interface ProRataYear {
  co: string;
  trade: string;
  f: ScFloat;
  n0: number;
}
function drawProRataYear(rng: Rng): ProRataYear | null {
  const { co, trade } = firm(rng);
  const s = S.drawTerms(rng, rng.pick([2, 3, 3, 4] as const), rng.int(0, 2) > 0);
  const pro = S.drawRatio(rng, s);
  if (!pro) return null;
  const n = S.proIssue(rng, pro);
  const f = S.seal({ co, s, offered: n, n, refused: rng.step(2000, 20000, 1000), pro, bad: [], lots: [] });
  if (!f) return null;
  const n0 = Math.round((n * rng.pick([150, 200, 250, 300, 400])) / 100 / 1000) * 1000;
  return { co, trade, f, n0 };
}
const proRataText = (c: ProRataYear): string => {
  const { f } = c;
  const s = f.s;
  return [
    `${c.co}, ${c.trade}, ${NOT_FINANCING}. On ${Y0} its share capital was ${inr(c.n0 * s.face)}, in ${S.sharesOf(s)}, fully paid.`,
    `During ${YEAR}: ${S.offerOf(f, 'it')}`,
    `Applications were received for ${cnt(S.allApplied(f))} shares. The directors refused the applications for ${cnt(f.refused)} shares and returned the money on them, and allotted the ${cnt(f.n)} shares pro rata to the other applicants. ${S.proRule(s)}`,
    `${s.parts.length > 2 ? 'Every call was made before the year end, and every' : 'Every'} amount due was received. All money is received and paid through the bank.${s.premium > 0 ? ' The premium is credited to Securities Premium A/c when the instalment that carries it falls due.' : ''}`,
  ].join('\n');
};
const proRataKept = keeper<ProRataYear>();

function proRataRefund(c: ProRataYear): NumericParts | null {
  const { f } = c;
  const app = S.payable(f.s, 0);
  const n = money(f.refused * app, [
    [S.excessOf(f), 'Gave the excess application money of the applicants allotted pro rata; it is kept towards the allotment money, not returned.'],
    [f.refused * app + S.excessOf(f), 'Returned the excess application money as well; it is kept towards the allotment money.'],
    [f.refused * f.s.face, 'Worked the refund at the face value; only the application money was paid on those shares.'],
  ]);
  return n && {
    prompt: 'How much money was returned to applicants?',
    ...n,
    explanation: [`Only the refused applicants get money back: ${cnt(f.refused)} x ${inr(app)} = ${inr(f.refused * app)}.`, `The excess application money of the applicants allotted pro rata, ${inr(S.excessOf(f))}, is kept towards the allotment money.`],
    hints: S.H.prorata,
  };
}
const proRataRefundHolds = (q: NumericQuestion): boolean => {
  const c = proRataKept.of(q.context ?? '');
  return !!c && q.answer === S.lineOf(S.books(c.f.s).transfer, 'bank', 'Cr');
};

function proRataAllotment(c: ProRataYear): NumericParts | null {
  const { f } = c;
  const s = f.s;
  const due = f.n * S.payable(s, 1);
  const excess = S.excessOf(f);
  const n = money(due - excess, [
    [due, 'Ignored the excess application money already held, which reduces what comes in on allotment.'],
    s.premium > 0 && [f.n * s.parts[1] - excess, 'Left out the premium, which is payable with the allotment money.'],
    [due - excess - f.refused * S.payable(s, 0), 'Took the money returned on the refused applications off the allotment money too.'],
    [excess, 'Gave the excess application money set against the allotment, not what was received.'],
  ]);
  return n && {
    prompt: 'How much money was received on allotment?',
    ...n,
    explanation: [
      `Due on allotment = ${cnt(f.n)} x ${inr(S.payable(s, 1))} = ${inr(due)}${s.premium > 0 ? ', the premium with it' : ''}.`,
      `Excess application money already held = (${cnt(S.appliedFor(f, f.n))} - ${cnt(f.n)}) x ${inr(S.payable(s, 0))} = ${inr(excess)}.`,
      `Money received on allotment = ${inr(due)} - ${inr(excess)} = ${inr(due - excess)}.`,
    ],
    hints: S.H.prorata,
  };
}
const proRataAllotmentHolds = (q: NumericQuestion): boolean => {
  const c = proRataKept.of(q.context ?? '');
  return !!c && q.answer === S.lineOf(S.books(c.f.s).received[1], 'bank', 'Dr');
};

function proRataProceeds(c: ProRataYear): NumericParts | null {
  const { f } = c;
  const s = f.s;
  const proceeds = f.n * (s.face + s.premium);
  const gross = S.allApplied(f) * S.payable(s, 0) + sum(s.parts.slice(1).map((_, i) => f.n * S.payable(s, i + 1))) - S.excessOf(f);
  const n = money(proceeds, [
    [gross, 'Left the refund in: the money returned to refused applicants never stayed with the company.'],
    s.premium > 0 && [f.n * s.face, 'Left out the premium; the whole issue price received is part of the proceeds.'],
    [S.allApplied(f) * S.payable(s, 0), 'Gave only the application money received.'],
    [proceeds + S.excessOf(f), 'Counted the excess application money twice: it is part of what was paid towards allotment.'],
  ]);
  return n && {
    prompt: `What does ${c.co} show as the proceeds from the issue of shares in its Cash Flow Statement for ${YEAR}?`,
    ...n,
    explanation: [
      `Money received: application money ${inr(S.allApplied(f) * S.payable(s, 0))}, less ${inr(f.refused * S.payable(s, 0))} returned, then the rest of every instalment on the ${cnt(f.n)} shares, the excess application money set against the allotment.`,
      `What stays with the company is the whole issue price of the shares allotted: ${cnt(f.n)} x ${inr(s.face + s.premium)} = ${inr(proceeds)}, a financing inflow.`,
    ],
    hints: ['Money that came in and went back to refused applicants in the same year is not a proceed of the issue.', 'Every share allotted was paid for in full: the proceeds are the shares allotted at their issue price.'],
  };
}
const proRataProceedsHolds = (q: NumericQuestion): boolean => {
  const c = proRataKept.of(q.context ?? '');
  return !!c && q.answer === S.net(S.books(c.f.s).ledger, 'bank');
};

const REFUND_ITEM = 'Share application money received in excess and due for refund';
const proRataHead = (c: ProRataYear): McqParts | null =>
  headQuestion(
    `Had the money on the refused applications still been owed back to the applicants on ${Y1}, under which head and sub-head of the balance sheet of ${c.co} would it have stood?`,
    REFUND_ITEM,
  );
const proRataHeadHolds = headHolds(REFUND_ITEM);

function proRataChange(c: ProRataYear): NumericParts | null {
  const { f } = c;
  const s = f.s;
  const before = c.n0 * s.face;
  const added = f.n * s.face;
  const n = percent([added, before], [
    [[added, before + added], `Divided the rise by the share capital of ${Y1}; the base is the earlier figure.`],
    s.premium > 0 && [[added + f.n * s.premium, before], 'Counted the premium as share capital.'],
    [[S.allApplied(f) * s.face, before], 'Counted every share applied for; only the shares allotted are share capital.'],
  ]);
  return n && {
    prompt: `By what percentage did the share capital of ${c.co} rise from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [`Share capital rose by the face value of the shares allotted: ${cnt(f.n)} x ${inr(s.face)} = ${inr(added)}, from ${inr(before)} to ${inr(before + added)}.`, `Percentage change = ${inr(added)} ÷ ${inr(before)} × 100 = ${pc(n.answer)}.`],
    hints: H.change,
  };
}
const proRataChangeHolds = (q: NumericQuestion): boolean => {
  const c = proRataKept.of(q.context ?? '');
  if (!c) return false;
  const credited = -S.net(S.books(c.f.s).ledger, S.capitalId(c.f.s.kind)) / 100;
  return nearPercent(q.answer, [credited, afterWords(q.context ?? '', 'its share capital was ₹')]);
};

const proRataMakers = [proRataRefund, proRataAllotment, proRataProceeds, proRataHead, proRataChange];
const caseProRata = caseTemplate<ProRataYear>({
  id: 'case-cy-prorata-cash',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A pro rata issue and the cash it brought',
  setup: (rng) =>
    firstGood(30, () => drawProRataYear(rng), (c) => {
      const ok = proRataMakers.every((m) => m(c) !== null);
      if (ok) proRataKept.keep(proRataText(c), c);
      return ok;
    }),
  context: proRataText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: proRataRefund, verify: proRataRefundHolds },
    { kind: 'numeric', unit: 'rupees', make: proRataAllotment, verify: proRataAllotmentHolds },
    { kind: 'numeric', unit: 'rupees', make: proRataProceeds, verify: proRataProceedsHolds },
    { kind: 'mcq', make: proRataHead, verify: proRataHeadHolds },
    { kind: 'numeric', unit: 'percent', make: proRataChange, verify: proRataChangeHolds },
  ],
});

// ===============================================================================================================
// 9. case-cy-premium-meets-loss: in one year a company issues equity shares at a premium and debentures redeemable at
//    a premium (issued at a discount, at par or at a smaller premium), and writes the loss on the debentures off,
//    first from Securities Premium. Asked: the loss on issue, what is left of Securities Premium (or, where it was not
//    enough, what is charged to profit), where the premium payable on redemption is shown, the debt to equity ratio,
//    and what the debentures brought in for the Cash Flow Statement.
// ===============================================================================================================

interface PremiumLoss {
  co: string;
  trade: string;
  sc0: number;
  rs0: number;
  sp0: number;
  loan: number;
  shares: number;
  sharePremium: number;
  n: number;
  rate: number;
  /** Rupees a debenture of ₹100: premium on issue, discount on issue, premium on redemption. */
  prem: number;
  disc: number;
  red: number;
  profit: number;
}
const premiumLossFigures = (s: PremiumLoss) => {
  const loss = s.n * (s.disc + s.red);
  const available = s.sp0 + s.shares * s.sharePremium + s.n * s.prem;
  const fromSp = Math.min(loss, available);
  const equity = s.sc0 + s.rs0 + s.shares * (10 + s.sharePremium) + s.n * s.prem - fromSp + s.profit;
  return { loss, available, fromSp, fromPl: loss - fromSp, left: available - fromSp, equity, debt: s.loan + s.n * 100, money: s.n * (100 + s.prem - s.disc) };
};
function drawPremiumLoss(rng: Rng): PremiumLoss | null {
  const { co, trade } = firm(rng);
  const sc0 = 10 * rng.step(100000, 500000, 10000);
  const sp0 = rng.int(0, 2) === 0 ? 0 : rng.step(20000, 200000, 10000);
  const rs0 = sp0 + rng.step(200000, 1200000, 10000);
  const at = rng.pick(['discount', 'par', 'premium'] as const);
  const red = rng.pick([5, 10]);
  const prem = at === 'premium' ? rng.pick([2, 3, 4].filter((x) => x < red)) : 0;
  const disc = at === 'discount' ? rng.pick([5, 10]) : 0;
  const n = rng.step(3000, 15000, 1000);
  const shares = rng.step(10000, 60000, 5000);
  // The premium on the shares is large enough to bear the loss in two seeds of three, and too small in the third.
  const loss = n * (disc + red);
  const enough = rng.int(0, 2) > 0;
  const fits = [1, 2, 3, 4, 5, 6, 8, 10].filter((p) => (sp0 + shares * p + n * prem >= loss) === enough);
  if (fits.length === 0) return null;
  const sharePremium = rng.pick(fits);
  const s: PremiumLoss = { co, trade, sc0, rs0, sp0, loan: rng.int(0, 1) === 0 ? 0 : rng.step(300000, 1500000, 100000), shares, sharePremium, n, rate: rng.pick(D.RATES), prem, disc, red, profit: rng.step(150000, 700000, 10000) };
  const f = premiumLossFigures(s);
  return f.left === 0 && f.fromPl === 0 ? null : s;
}
const premiumLossText = (s: PremiumLoss): string => {
  const terms = s.prem > 0 ? `at a premium of ${s.prem}%` : s.disc > 0 ? `at a discount of ${s.disc}%` : 'at par';
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. On ${Y0} it had share capital of ${inr(s.sc0)} (equity shares of ₹10 each), reserves and surplus of ${inr(s.rs0)}, of which Securities Premium was ${s.sp0 > 0 ? inr(s.sp0) : 'nil'}, and ${s.loan > 0 ? `a long-term bank loan of ${inr(s.loan)}` : 'no borrowings'}.`,
    `During ${YEAR} it issued for cash ${cnt(s.shares)} equity shares of ₹10 each at a premium of ${inr(s.sharePremium)} a share, and ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each ${terms}, redeemable at a premium of ${s.red}% after six years. Both issues were fully subscribed and all the money was received.`,
    `The premium payable on redemption is provided for on allotment, and the whole loss on the issue of the debentures (${s.disc > 0 ? 'the discount and that premium' : 'that premium'}) is debited to ${D.LOSS_AC}. On ${Y1} the loss was written off, first from Securities Premium (the premiums received during the year included) and then from the Statement of Profit and Loss.`,
    `Its profit after tax for the year, after charging whatever part of the loss was written off to the Statement of Profit and Loss, was ${inr(s.profit)}, all of it kept in the business.${s.loan > 0 ? " Nothing was repaid on the loan." : ""}`,
  ].join('\n');
};
const premiumLossKept = keeper<PremiumLoss>();

function premiumLossAmount(s: PremiumLoss): NumericParts | null {
  const f = premiumLossFigures(s);
  const n = money(f.loss, [
    s.disc > 0 && [s.n * s.disc, 'Counted only the discount; the premium payable on redemption is also a loss on the issue.'],
    s.disc > 0 && [s.n * s.red, 'Counted only the premium payable on redemption; the discount allowed on issue is also a loss.'],
    s.prem > 0 && [s.n * (s.red - s.prem), 'Set the premium received on issue against the premium on redemption; it goes to Securities Premium A/c.'],
    [s.n * (100 + s.red), 'Gave the whole amount payable on redemption; the loss is only what is lost on the issue.'],
    [f.loss / 6, 'Spread the loss over the six years; it is written off in the year of allotment.'],
  ]);
  return n && {
    prompt: `What is the loss on the issue of the debentures, debited to ${D.LOSS_AC}?`,
    ...n,
    explanation: [
      ...(s.disc > 0 ? [`Discount on issue = ${cnt(s.n)} x ${inr(s.disc)} = ${inr(s.n * s.disc)}.`] : []),
      `Premium payable on redemption = ${cnt(s.n)} x ${inr(s.red)} = ${inr(s.n * s.red)}.`,
      s.disc > 0 ? `Loss on issue = ${inr(s.n * s.disc)} + ${inr(s.n * s.red)} = ${inr(f.loss)}.` : `Loss on issue = the premium payable on redemption, ${inr(f.loss)}.`,
      ...(s.prem > 0 ? [`The premium received on issue, ${inr(s.n * s.prem)}, is credited to Securities Premium A/c; it is not set off against the loss.`] : []),
    ],
    hints: D.H.cases,
  };
}
const premiumLossAmountHolds = (q: NumericQuestion): boolean => {
  const s = premiumLossKept.of(q.context ?? '');
  // The loss another way: what the company will pay back less what it received, plus the premium it received.
  return !!s && q.answer === rupees(s.n * (100 + s.red) - premiumLossFigures(s).money + s.n * s.prem);
};

function premiumLossLeft(s: PremiumLoss): NumericParts | null {
  const f = premiumLossFigures(s);
  const parts = [...(s.sp0 > 0 ? [`${inr(s.sp0)} at the start of the year`] : []), `${inr(s.shares * s.sharePremium)} on the shares`, ...(s.prem > 0 ? [`${inr(s.n * s.prem)} on the debentures`] : [])];
  const said = `Securities Premium available = ${parts.join(' + ')}${parts.length > 1 ? ` = ${inr(f.available)}` : ''}.`;
  if (f.fromPl === 0) {
    const n = money(f.left, [
      [f.available, 'Did not write the loss off against Securities Premium.'],
      s.sp0 > 0 && [f.left - s.sp0, 'Left out the balance of Securities Premium at the start of the year.'],
      s.prem > 0 && [f.left - s.n * s.prem, 'Left out the premium received on the debentures.'],
      [s.shares * s.sharePremium, 'Gave the premium received on the shares alone.'],
    ]);
    return n && {
      prompt: `What is the balance of Securities Premium A/c on ${Y1}, after the write-off?`,
      ...n,
      explanation: [said, `It bears the whole loss of ${inr(f.loss)}: ${inr(f.available)} - ${inr(f.loss)} = ${inr(f.left)} is left.`],
      hints: D.H.writeOff,
    };
  }
  const n = money(f.fromPl, [
    [f.loss, 'Charged the whole loss to the Statement of Profit and Loss; Securities Premium is used first.'],
    [f.available, 'Gave the part written off against Securities Premium.'],
    s.prem > 0 && [f.fromPl + s.n * s.prem, 'Left out the premium received on the debentures, which is in Securities Premium too.'],
    s.sp0 > 0 && [f.fromPl + s.sp0, 'Left out the balance of Securities Premium at the start of the year.'],
  ]);
  return n && {
    prompt: `What part of the loss is charged to the Statement of Profit and Loss for ${YEAR}?`,
    ...n,
    explanation: [said, `It is used up first: ${inr(f.available)}. The rest, ${inr(f.loss)} - ${inr(f.available)} = ${inr(f.fromPl)}, is a finance cost in the Statement of Profit and Loss.`],
    hints: D.H.writeOff,
  };
}
const premiumLossLeftHolds = (q: NumericQuestion): boolean => {
  const s = premiumLossKept.of(q.context ?? '');
  if (!s) return false;
  const loss = s.n * (s.disc + s.red);
  const sp = s.sp0 + s.shares * s.sharePremium + s.n * s.prem;
  return q.answer === rupees(q.prompt.startsWith('What is the balance') ? sp - loss : loss - sp);
};

const PREMIUM_RED_ITEM = 'Premium payable on redemption of debentures (the debentures are redeemable after six years)';
const premiumLossHead = (): McqParts | null =>
  headQuestion(`Under which head and sub-head of the balance sheet as at ${Y1} is the premium payable on redemption of the debentures shown?`, PREMIUM_RED_ITEM);
const premiumLossHeadHolds = headHolds(PREMIUM_RED_ITEM);

function premiumLossRatio(s: PremiumLoss): NumericParts | null {
  const f = premiumLossFigures(s);
  const n = times([f.debt, f.equity], [
    [[f.debt + s.n * s.red, f.equity], 'Counted the premium payable on redemption as debt; it is an other long-term liability, not a borrowing.'],
    s.disc > 0 && [[s.loan + s.n * (100 - s.disc), f.equity], 'Took the debentures at the money received; they stand at their nominal value.'],
    [[f.debt, f.equity + f.fromSp], 'Forgot that the loss written off against Securities Premium reduces the reserves.'],
    [[f.equity, f.debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[f.debt, s.sc0 + s.shares * 10], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio of ${s.co} as at ${Y1}, debt being its long-term borrowings and equity its shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [
      `Long-term borrowings = ${s.loan > 0 ? `bank loan ${inr(s.loan)} + ` : ''}debentures at their nominal value ${inr(s.n * 100)} = ${inr(f.debt)}. The premium payable on redemption is an other long-term liability.`,
      `Shareholders' funds = ${inr(s.sc0)} + ${inr(s.rs0)} + shares issued ${inr(s.shares * (10 + s.sharePremium))}${s.prem > 0 ? ` + premium on the debentures ${inr(s.n * s.prem)}` : ''} - loss written off against Securities Premium ${inr(f.fromSp)} + profit kept ${inr(s.profit)} = ${inr(f.equity)}.`,
      `Debt to equity ratio = ${inr(f.debt)} ÷ ${inr(f.equity)} = ${dec(n.answer)} : 1.`,
    ],
    hints: H.solvency,
  };
}
const premiumLossRatioHolds = (q: NumericQuestion): boolean => {
  const s = premiumLossKept.of(q.context ?? '');
  if (!s) return false;
  // The shareholders' funds another way: what they were, the money the shares brought in, the profit, and Securities
  // Premium as what is left after the write-off (never below nil).
  const spLeft = Math.max(0, s.sp0 + s.shares * s.sharePremium + s.n * s.prem - s.n * (s.disc + s.red));
  return nearTimes(q.answer, [s.loan + s.n * 100, s.sc0 + (s.rs0 - s.sp0) + s.shares * 10 + spLeft + s.profit]);
};

function premiumLossCash(s: PremiumLoss): NumericParts | null {
  const f = premiumLossFigures(s);
  const n = money(f.money, [
    f.money !== s.n * 100 && [s.n * 100, 'Took the nominal value; the inflow is the money actually received.'],
    [s.n * (100 + s.red), 'Took the amount payable on redemption.'],
    [f.money + s.shares * (10 + s.sharePremium), 'Added the proceeds of the shares; the question asks about the debentures.'],
    [f.money - f.loss, 'Deducted the loss on issue from the money received; the loss is a book entry.'],
  ]);
  return n && {
    prompt: `What does the Cash Flow Statement of ${s.co} for ${YEAR} show as the proceeds from the issue of debentures?`,
    ...n,
    explanation: [`Each debenture brought in ${inr(100 + s.prem - s.disc)}: ${cnt(s.n)} x ${inr(100 + s.prem - s.disc)} = ${inr(f.money)}, a financing inflow.`, 'The premium payable on redemption is paid only when the debentures are redeemed, and the loss written off moves no cash.'],
    hints: H.financing,
  };
}
const premiumLossCashHolds = (q: NumericQuestion): boolean => {
  const s = premiumLossKept.of(q.context ?? '');
  // The money received from the allotment entry of the debentures.
  return !!s && q.answer === S.lineOf(D.allotmentLines({ n: s.n, rate: s.rate, face: 100, prem: s.prem, disc: s.disc, red: s.red }, D.DAA, premiumLossFigures(s).money), D.DAA, 'Dr');
};

const premiumLossMakers = [premiumLossAmount, premiumLossLeft, premiumLossHead, premiumLossRatio, premiumLossCash];
const casePremiumLoss = caseTemplate<PremiumLoss>({
  id: 'case-cy-premium-meets-loss',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Securities Premium meets the loss on debentures',
  setup: (rng) =>
    firstGood(30, () => drawPremiumLoss(rng), (s) => {
      const ok = premiumLossMakers.every((m) => m(s) !== null);
      if (ok) premiumLossKept.keep(premiumLossText(s), s);
      return ok;
    }),
  context: premiumLossText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: premiumLossAmount, verify: premiumLossAmountHolds },
    { kind: 'numeric', unit: 'rupees', make: premiumLossLeft, verify: premiumLossLeftHolds },
    { kind: 'mcq', make: premiumLossHead, verify: premiumLossHeadHolds },
    { kind: 'numeric', unit: 'times', make: premiumLossRatio, verify: premiumLossRatioHolds },
    { kind: 'numeric', unit: 'rupees', make: premiumLossCash, verify: premiumLossCashHolds },
  ],
});

// ===============================================================================================================
// 10. case-cy-borrow-to-ratio: a company decides to borrow on debentures, issued at par for cash, up to a debt to
//     equity ratio it has chosen. Worked back from the ratio: the nominal value to issue and the number of debentures
//     (of ₹100, ₹500 or ₹1,000); then the interest of the year, the net cash from financing activities (the interest
//     on an older loan paid, and part of that loan repaid in some seeds) and the percentage change in long-term
//     borrowings over the year.
// ===============================================================================================================

interface ToRatio {
  co: string;
  trade: string;
  equity: number;
  loan: number;
  loanRate: number;
  /** The ratio chosen, in hundredths. */
  r: number;
  face: number;
  rate: number;
  month: string;
  months: number;
  repaid: number;
}
const toRatioNominal = (s: ToRatio): number => (s.r * s.equity) / 100 - s.loan;
function drawToRatio(rng: Rng): ToRatio | null {
  const { co, trade } = firm(rng);
  const equity = rng.step(2000000, 9000000, 500000);
  const r = rng.pick([50, 60, 75, 80, 100, 120, 150]);
  const loan = Math.round((equity * rng.pick([15, 20, 25, 30, 40])) / 100 / 100000) * 100000;
  const when = rng.pick(D.ISSUE_DATES);
  const s: ToRatio = { co, trade, equity, loan, loanRate: rng.pick([9, 10, 11, 12]), r, face: rng.pick([100, 100, 500, 1000]), rate: 0, month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, repaid: 0 };
  const nominal = toRatioNominal(s);
  if (nominal < 200000 || nominal % 100000 !== 0) return null;
  const rate = D.wholeRate(rng, nominal, [when.months]);
  if (rate === null) return null;
  s.rate = rate;
  s.repaid = rng.int(0, 2) === 0 ? rng.step(100000, Math.max(100000, Math.floor(loan / 4 / 100000) * 100000), 100000) : 0;
  return s.repaid < loan ? s : null;
}
const toRatioText = (s: ToRatio): string =>
  [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. Its only borrowing on ${Y0} was ${an(s.loanRate)} ${s.loanRate}% long-term loan of ${inr(s.loan)} from a bank, taken in an earlier year. Just before the issue below, its shareholders' funds were ${inr(s.equity)}.`,
    `The directors decided to borrow more on debentures, so that immediately after the issue the debt to equity ratio would be ${dec(s.r)} : 1 (debt being long-term borrowings and equity shareholders' funds).`,
    `On 1 ${s.month} the company issued, at par for cash, the ${s.rate}% Debentures of ${inr(s.face)} each needed for this, redeemable after five years. All were subscribed and the money received. Interest is payable half-yearly on 30 September and 31 March, and was paid on the due dates.`,
    `The interest of the year on the bank loan was paid in full${s.repaid > 0 ? `, and ${inr(s.repaid)} of the loan was repaid on ${Y1}` : ''}. The company made no other dealing with lenders or shareholders during ${YEAR}.`,
  ].join('\n');
/** The figures read back from the printed case. */
function toRatioIn(text: string) {
  const equity = afterWords(text, "shareholders' funds were ₹");
  const loan = afterWords(text, '% long-term loan of ₹');
  const r = Math.round(Number(/ratio would be ([\d.]+) : 1/.exec(text)?.[1] ?? NaN) * 100);
  return { equity, loan, r, nominal: (r * equity) / 100 - loan, face: afterWords(text, '% Debentures of ₹'), repaid: text.includes(' of the loan was repaid') ? afterWords(text, `in full, and ₹`) : 0 };
}
const toRatioKept = keeper<ToRatio>();

function toRatioAmount(s: ToRatio): NumericParts | null {
  const nominal = toRatioNominal(s);
  const n = money(nominal, [
    [(s.r * s.equity) / 100, 'Forgot the bank loan the company already owes; it is part of the debt.'],
    [(s.r * s.equity) / 100 + s.loan, 'Added the loan the company owes instead of deducting it.'],
    [(s.equity * 100) / s.r - s.loan, "Divided the shareholders' funds by the ratio instead of multiplying."],
  ]);
  return n && {
    prompt: 'What nominal value of debentures did the company issue?',
    ...n,
    explanation: [
      `Debt wanted = ${dec(s.r)} x shareholders' funds = ${dec(s.r)} x ${inr(s.equity)} = ${inr((s.r * s.equity) / 100)}. The shareholders' funds do not change, as the debentures are issued at par.`,
      `The loan already owed is ${inr(s.loan)}, so debentures to issue = ${inr((s.r * s.equity) / 100)} - ${inr(s.loan)} = ${inr(nominal)}.`,
    ],
    hints: ['Debt to equity ratio = debt ÷ shareholders\' funds, so debt = ratio x shareholders\' funds.', 'The new debentures make up the debt wanted beyond what is already owed.'],
  };
}
const toRatioAmountHolds = (q: NumericQuestion): boolean => {
  const t = toRatioIn(q.context ?? '');
  // Put back: with these debentures the ratio is the one wanted.
  return (t.loan + q.answer / 100) * 100 === t.r * t.equity;
};

function toRatioCount(s: ToRatio): NumericParts | null {
  const nominal = toRatioNominal(s);
  const n = count(nominal / s.face, [
    ...(s.face !== 100 ? ([[nominal / 100, 'Divided by ₹100; these debentures are of a larger face value.']] as [number, string][]) : ([[nominal / 1000, 'Divided by ₹1,000; these debentures are of ₹100 each.']] as [number, string][])),
    [((s.r * s.equity) / 100) / s.face, 'Counted debentures for the whole debt wanted, the bank loan with it.'],
    [nominal / s.face / 2, 'Halved the number for the half-yearly interest.'],
  ]);
  return n && {
    prompt: `How many debentures of ${inr(s.face)} each were issued?`,
    ...n,
    explanation: [`Number of debentures = nominal value ÷ face value = ${inr(nominal)} ÷ ${inr(s.face)} = ${cnt(nominal / s.face)}.`],
    hints: ['Find the nominal value to be raised first.', 'Debentures issued at par: number = nominal value ÷ face value.'],
  };
}
const toRatioCountHolds = (q: NumericQuestion): boolean => {
  const t = toRatioIn(q.context ?? '');
  return q.answer * t.face === t.nominal;
};

function toRatioInterest(s: ToRatio): NumericParts | null {
  const nominal = toRatioNominal(s);
  const annual = (nominal * s.rate) / 100;
  const interest = (annual * s.months) / 12;
  const n = money(interest, [
    [annual, `Charged a full year although the debentures were issued on 1 ${s.month}.`],
    [(annual * (12 - s.months)) / 12, 'Counted the months before the issue instead of the months after it.'],
    [interest + (s.loan * s.loanRate) / 100, 'Added the interest on the bank loan; the question asks for the debentures.'],
    [(annual * (s.months - 1)) / 12, 'Left out the month of issue.'],
  ]);
  return n && {
    prompt: `What is the interest on the debentures for the year ended ${Y1}?`,
    ...n,
    explanation: [`A year's interest = ${s.rate}% of ${inr(nominal)} = ${inr(annual)}.`, `From 1 ${s.month} to ${Y1} is ${s.months} months: ${inr(annual)} x ${s.months}/12 = ${inr(interest)}.`],
    hints: D.H.interest,
  };
}
const toRatioInterestHolds = (q: NumericQuestion): boolean => {
  const s = toRatioKept.of(q.context ?? '');
  return !!s && q.answer * 1200 === rupees(toRatioIn(q.context ?? '').nominal * s.rate * s.months);
};

function toRatioCash(s: ToRatio): NumericParts | null {
  const nominal = toRatioNominal(s);
  const newInterest = (nominal * s.rate * s.months) / 1200;
  const oldInterest = (s.loan * s.loanRate) / 100;
  const net = nominal - newInterest - oldInterest - s.repaid;
  if (net <= 0) return null;
  const n = money(net, [
    [nominal, 'Gave the money raised and left out the interest and repayments paid.'],
    [net + newInterest + oldInterest, 'Left out the interest paid; for a company that is not a financing company it is a financing outflow.'],
    [net + oldInterest, 'Left out the interest paid on the bank loan.'],
    s.repaid > 0 && [net + s.repaid, 'Left out the part of the loan repaid.'],
  ]);
  return n && {
    prompt: `Find the net cash from financing activities of the company for ${YEAR}.`,
    ...n,
    explanation: [
      `Proceeds from the issue of debentures: ${inr(nominal)}, an inflow.`,
      `Interest paid: on the debentures ${inr(newInterest)}, and on the bank loan ${s.loanRate}% of ${inr(s.loan)} = ${inr(oldInterest)}: outflows.${s.repaid > 0 ? ` Repayment of the loan, ${inr(s.repaid)}: an outflow.` : ''}`,
      `Net cash from financing activities = ${inr(nominal)} - ${inr(newInterest)} - ${inr(oldInterest)}${s.repaid > 0 ? ` - ${inr(s.repaid)}` : ''} = ${inr(net)}.`,
    ],
    hints: H.financing,
  };
}
const toRatioCashHolds = (q: NumericQuestion): boolean => {
  const s = toRatioKept.of(q.context ?? '');
  if (!s) return false;
  const t = toRatioIn(q.context ?? '');
  return q.answer * 1200 === rupees(t.nominal * 1200 - t.nominal * s.rate * s.months - t.loan * s.loanRate * 12 - t.repaid * 1200);
};

function toRatioChange(s: ToRatio): NumericParts | null {
  const nominal = toRatioNominal(s);
  const change = nominal - s.repaid;
  const n = percent([change, s.loan], [
    [[change, s.loan + change], 'Divided the change by the long-term borrowings at the end of the year; the base is the earlier figure.'],
    s.repaid > 0 && [[nominal, s.loan], 'Left out the part of the loan repaid on the last day of the year.'],
    [[s.loan + change, s.loan], 'Gave the later figure as a percentage of the earlier one; the change has to be taken first.'],
  ]);
  return n && {
    prompt: `By what percentage did the long-term borrowings of the company rise from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Long-term borrowings: ${inr(s.loan)} on ${Y0}; ${inr(s.loan)}${s.repaid > 0 ? ` - ${inr(s.repaid)}` : ''} + debentures ${inr(nominal)} = ${inr(s.loan + change)} on ${Y1}.`,
      `Percentage change = ${inr(change)} ÷ ${inr(s.loan)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: H.change,
  };
}
const toRatioChangeHolds = (q: NumericQuestion): boolean => {
  const t = toRatioIn(q.context ?? '');
  return nearPercent(q.answer, [t.nominal - t.repaid, t.loan]);
};

const PROPRIETARY_START = 50;
function toRatioProprietary(s: ToRatio): McqParts | null {
  const deal = { ...DEALS.issueDebentures(toRatioNominal(s)), text: 'issued the debentures for cash' };
  const o = effectOptions(SPECS.proprietary, deal, PROPRIETARY_START);
  return o && choice(
    "Will the issue of the debentures make the proprietary ratio (shareholders' funds to total assets) increase, decrease or not change, and why?",
    o.correct,
    o.wrong,
    o.why,
    ['Ask which term of the ratio the issue changes: the shareholders\' funds, the total assets, or both.', 'The money received is an asset; the debentures are a liability, not part of the shareholders\' funds.'],
  );
}
const toRatioProprietaryHolds = (q: McqQuestion): boolean => {
  const t = toRatioIn(q.context ?? '');
  const verdict = movedBy(SPECS.proprietary, { ...DEALS.issueDebentures(t.nominal).eff }, PROPRIETARY_START);
  return optionText(q).startsWith(`${SPECS.proprietary.labels[verdict > 0 ? 0 : verdict < 0 ? 1 : 2]}:`);
};

const toRatioMakers = [toRatioAmount, toRatioCount, toRatioProprietary, toRatioInterest, toRatioCash, toRatioChange];
const caseToRatio = caseTemplate<ToRatio>({
  id: 'case-cy-borrow-to-ratio',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Borrowing up to a debt to equity ratio',
  setup: (rng) =>
    firstGood(40, () => drawToRatio(rng), (s) => {
      const ok = toRatioMakers.every((m) => m(s) !== null);
      if (ok) toRatioKept.keep(toRatioText(s), s);
      return ok;
    }),
  context: toRatioText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: toRatioAmount, verify: toRatioAmountHolds },
    { kind: 'numeric', unit: 'number', make: toRatioCount, verify: toRatioCountHolds },
    { kind: 'mcq', make: toRatioProprietary, verify: toRatioProprietaryHolds },
    { kind: 'numeric', unit: 'rupees', make: toRatioInterest, verify: toRatioInterestHolds },
    { kind: 'numeric', unit: 'rupees', make: toRatioCash, verify: toRatioCashHolds },
    { kind: 'numeric', unit: 'percent', make: toRatioChange, verify: toRatioChangeHolds },
  ],
});

// ===============================================================================================================
// 11. case-cy-interest-cover: a company with debentures of one rate outstanding all year issues more, of another rate,
//     at a premium during the year; its profit after tax and the rate of tax are known. Asked: the premium credited,
//     the interest on the new debentures for the months of the year, the profit before interest and tax, the
//     interest coverage ratio, and how the interest paid is treated in the Cash Flow Statement.
// ===============================================================================================================

interface Cover {
  co: string;
  trade: string;
  old: number;
  oldRate: number;
  n: number;
  rate: number;
  prem: number;
  month: string;
  months: number;
  pbt: number;
  tax: number;
}
const coverFigures = (s: Cover) => {
  const oldInterest = (s.old * s.oldRate) / 100;
  const newInterest = (s.n * 100 * s.rate * s.months) / 1200;
  const interest = oldInterest + newInterest;
  const pat = (s.pbt * (100 - s.tax)) / 100;
  return { oldInterest, newInterest, interest, pat, pbit: s.pbt + interest };
};
function drawCover(rng: Rng): Cover | null {
  const { co, trade } = firm(rng);
  const when = rng.pick(D.ISSUE_DATES);
  const n = rng.step(3000, 15000, 1000);
  const rate = D.wholeRate(rng, n * 100, [when.months]);
  if (rate === null) return null;
  const old = rng.step(500000, 3000000, 100000);
  const s: Cover = { co, trade, old, oldRate: rng.pick(D.RATES.filter((r) => r !== rate)), n, rate, prem: rng.pick([5, 10, 20]), month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, pbt: 0, tax: rng.pick([25, 30]) };
  const f = coverFigures(s);
  // Interest covered two to nine times or so.
  s.pbt = Math.round((f.interest * rng.pick([150, 200, 250, 300, 400, 500, 600, 800])) / 100 / 20000) * 20000;
  return s.pbt > 0 ? s : null;
}
const coverText = (s: Cover): string =>
  [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. Its ${s.oldRate}% Debentures of ${inr(s.old)} were outstanding throughout ${YEAR}.`,
    `On 1 ${s.month} it issued ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each at a premium of ${s.prem}% for cash, redeemable at par after five years. All were allotted and the money received.`,
    `Interest on both classes of debentures is payable half-yearly on 30 September and 31 March and was paid on the due dates. The company has no other borrowing.`,
    `Its profit after tax for the year ended ${Y1} was ${inr(coverFigures(s).pat)}, tax being ${s.tax}% of the profit before tax.`,
  ].join('\n');
/** The figures read back from the printed case. */
function coverIn(text: string) {
  const old = /Its (\d+)% Debentures of ₹([\d,]+) were outstanding/.exec(text);
  const issue = /issued ([\d,]+), (\d+)% Debentures of ₹100 each at a premium of (\d+)%/.exec(text);
  const when = D.ISSUE_DATES.find((d) => text.includes(`On 1 ${d.month} `));
  const pat = afterWords(text, 'profit after tax for the year ended 31 March 2026 was ₹');
  const tax = afterWords(text, 'tax being ');
  if (!old || !issue || !when) return null;
  const n = Number(issue[1].replace(/,/g, ''));
  const interest = (Number(old[2].replace(/,/g, '')) * Number(old[1])) / 100 + (n * 100 * Number(issue[2]) * when.months) / 1200;
  return { n, prem: Number(issue[3]), interest, pbt: (pat * 100) / (100 - tax) };
}

function coverPremium(s: Cover): NumericParts | null {
  const n = money(s.n * s.prem, [
    [s.n * (100 + s.prem), 'Gave the whole money received; only the premium goes to Securities Premium A/c.'],
    [s.n * 100, 'Gave the nominal value, which is credited to the debentures account.'],
    [s.prem, 'Gave the premium on one debenture.'],
    [(s.n * s.prem * s.months) / 12, 'Spread the premium over the months of the year; it is credited in full on allotment.'],
  ]);
  return n && {
    prompt: 'What amount is credited to Securities Premium A/c on the allotment of the new debentures?',
    ...n,
    explanation: [`Premium = ${s.prem}% of ₹100 = ${inr(s.prem)} a debenture.`, `Securities Premium = ${cnt(s.n)} x ${inr(s.prem)} = ${inr(s.n * s.prem)}; the debentures are credited with their nominal value, ${inr(s.n * 100)}.`],
    hints: D.H.issue,
  };
}
const coverPremiumHolds = (q: NumericQuestion): boolean => {
  const t = coverIn(q.context ?? '');
  return !!t && q.answer === rupees(t.n * t.prem);
};

function coverNewInterest(s: Cover): NumericParts | null {
  const f = coverFigures(s);
  const annual = (s.n * 100 * s.rate) / 100;
  const n = money(f.newInterest, [
    [annual, `Charged a full year although the debentures were issued on 1 ${s.month}.`],
    [(s.n * (100 + s.prem) * s.rate * s.months) / 1200, 'Worked the interest on the issue price; interest is on the nominal value.'],
    [(annual * (12 - s.months)) / 12, 'Counted the months before the issue instead of the months after it.'],
    [f.interest, `Added the interest on the ${s.oldRate}% Debentures; the question asks for the new ones.`],
  ]);
  return n && {
    prompt: `What is the interest on the new debentures for the year ended ${Y1}?`,
    ...n,
    explanation: [`Interest is on the nominal value: ${s.rate}% of ${inr(s.n * 100)} = ${inr(annual)} a year.`, `For the ${s.months} months from 1 ${s.month}: ${inr(annual)} x ${s.months}/12 = ${inr(f.newInterest)}.`],
    hints: D.H.interest,
  };
}
const coverNewInterestHolds = (q: NumericQuestion): boolean => {
  const t = coverIn(q.context ?? '');
  const s = t && D.ISSUE_DATES.find((d) => (q.context ?? '').includes(`On 1 ${d.month} `));
  const rate = Number(/, (\d+)% Debentures of ₹100 each/.exec(q.context ?? '')?.[1]);
  return !!t && !!s && q.answer * 1200 === rupees(t.n * 100 * rate * s.months);
};

function coverPbit(s: Cover): NumericParts | null {
  const f = coverFigures(s);
  const n = money(f.pbit, [
    [s.pbt, 'Stopped at the profit before tax; the interest has to be added back too.'],
    [f.pat + f.interest, 'Added the interest to the profit after tax; the tax has to be added back too.'],
    [s.pbt + f.oldInterest, 'Added back only the interest on the old debentures.'],
    [(f.pat * 100) / s.tax + f.interest, 'Took the profit after tax to be the tax rate of the profit.'],
  ]);
  return n && {
    prompt: 'What is the profit before interest and tax for the year?',
    ...n,
    explanation: [
      `Profit before tax = profit after tax ÷ (1 - ${s.tax}%) = ${inr(f.pat)} ÷ ${(100 - s.tax) / 100} = ${inr(s.pbt)}.`,
      `Interest on debentures = ${s.oldRate}% of ${inr(s.old)} = ${inr(f.oldInterest)}, plus ${inr(f.newInterest)} on the new ones = ${inr(f.interest)}.`,
      `Profit before interest and tax = ${inr(s.pbt)} + ${inr(f.interest)} = ${inr(f.pbit)}.`,
    ],
    hints: ['Work back up the statement: profit after tax, add the tax, then add the interest.', 'Profit before tax = profit after tax ÷ (1 - rate of tax).'],
  };
}
const coverPbitHolds = (q: NumericQuestion): boolean => {
  const t = coverIn(q.context ?? '');
  return !!t && q.answer === rupees(t.pbt + t.interest);
};

function coverRatio(s: Cover): NumericParts | null {
  const f = coverFigures(s);
  const n = times([f.pbit, f.interest], [
    [[s.pbt, f.interest], 'Divided the profit before tax; the interest has to be added back first.'],
    [[f.pat, f.interest], 'Divided the profit after tax by the interest.'],
    [[f.pbit, f.oldInterest], 'Left the interest on the new debentures out of the interest.'],
    [[f.pbit, f.oldInterest + (s.n * 100 * s.rate) / 100], 'Took a full year of interest on the new debentures.'],
  ]);
  return n && {
    prompt: `Find the interest coverage ratio of ${s.co} for ${YEAR}, ${IN_TIMES}.`,
    ...n,
    explanation: [`Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt = ${inr(f.pbit)} ÷ ${inr(f.interest)} = ${dec(n.answer)} times.`],
    hints: ['Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt.', 'Take the interest actually charged for the year, for the months each debenture was outstanding.'],
  };
}
const coverRatioHolds = (q: NumericQuestion): boolean => {
  const t = coverIn(q.context ?? '');
  return !!t && nearTimes(q.answer, [t.pbt + t.interest, t.interest]);
};

function coverCashFlow(s: Cover): McqParts | null {
  const f = coverFigures(s);
  return choice(
    `How is the interest of ${inr(f.interest)} paid on the debentures shown in the Cash Flow Statement of ${s.co}?`,
    'Added back to the profit under operating activities, and shown as an outflow under financing activities',
    [
      ['Left in the profit, as an operating outflow, because it is charged in the Statement of Profit and Loss', 'For a company that is not a financing company, interest on borrowings is a cost of finance, not of the operations.'],
      ['Shown as an outflow under investing activities', 'Mixed up interest paid on borrowings with money spent on investments.'],
      ['Added back to the profit and not shown anywhere else', 'Added the interest back but forgot that it was paid in cash: the payment is a financing outflow.'],
      ['Shown as an inflow under financing activities, with the proceeds of the debentures', 'Took interest paid for money received; it goes out to the debentureholders.'],
    ],
    'The company is not a financing company, so interest paid on its debentures is a cost of finance. It is added back to the net profit before tax under operating activities, and the payment is shown as an outflow under financing activities.',
    H.financing,
  );
}
const coverCashFlowHolds = (q: McqQuestion): boolean => (q.context ?? '').includes(NOT_FINANCING) && optionText(q).startsWith('Added back to the profit under operating activities, and shown as an outflow');

const coverMakers = [coverPremium, coverNewInterest, coverPbit, coverRatio, coverCashFlow];
const caseCover = caseTemplate<Cover>({
  id: 'case-cy-interest-cover',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Interest cover after new debentures',
  setup: (rng) => firstGood(30, () => drawCover(rng), (s) => coverMakers.every((m) => m(s) !== null)),
  context: coverText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: coverPremium, verify: coverPremiumHolds },
    { kind: 'numeric', unit: 'rupees', make: coverNewInterest, verify: coverNewInterestHolds },
    { kind: 'numeric', unit: 'rupees', make: coverPbit, verify: coverPbitHolds },
    { kind: 'numeric', unit: 'times', make: coverRatio, verify: coverRatioHolds },
    { kind: 'mcq', make: coverCashFlow, verify: coverCashFlowHolds },
  ],
});

// ===============================================================================================================
// 12. case-cy-financing-two-sheets: the capital and borrowings of two balance sheets with what else the year told:
//     shares issued (at par or at a premium), debentures added during the year, a bank loan repaid or raised,
//     interest and the dividend of the previous year paid, and a dividend proposed for this year. Asked: the proceeds
//     of the shares, the interest paid on the debentures, what the proposed dividend does to the Cash Flow Statement,
//     the net cash from (or used in) financing activities, the percentage change in long-term borrowings and the
//     debt to equity ratio.
// ===============================================================================================================

const FIN = {
  sc: 'Equity share capital',
  sp: 'Securities premium',
  surplus: 'Surplus (balance in Statement of Profit and Loss)',
  loan: 'Long-term loan from a bank',
} as const;
interface FinYear {
  co: string;
  trade: string;
  sc: [number, number];
  sp: [number, number];
  surplus: [number, number];
  rate: number;
  deb: [number, number];
  month: string;
  months: number;
  loan: [number, number];
  loanInterest: number;
  prev: number;
  cur: number;
}
const finFigures = (s: FinYear) => {
  const shares = s.sc[1] - s.sc[0] + s.sp[1] - s.sp[0];
  const fresh = s.deb[1] - s.deb[0];
  const debInterest = (s.deb[0] * s.rate) / 100 + (fresh * s.rate * s.months) / 1200;
  const loanMove = s.loan[1] - s.loan[0];
  const net = shares + fresh + loanMove - debInterest - s.loanInterest - s.prev;
  return { shares, fresh, debInterest, loanMove, net, debt: [s.deb[0] + s.loan[0], s.deb[1] + s.loan[1]] as const, equity: s.sc[1] + s.sp[1] + s.surplus[1] };
};
function drawFinYear(rng: Rng): FinYear | null {
  const { co, trade } = firm(rng);
  const sc0 = 10 * rng.step(100000, 500000, 10000);
  const n = Math.round((sc0 / 10) * rng.pick([0.2, 0.25, 0.3, 0.4]) / 10000) * 10000;
  const prem = rng.pick([0, 2, 5, 10]);
  const sp0 = rng.int(0, 1) === 0 ? 0 : rng.step(50000, 300000, 10000);
  if (prem === 0 && sp0 === 0) return null;
  const surplus0 = rng.step(200000, 1500000, 10000);
  const cur0 = sc0;
  const prev = (cur0 * rng.pick([5, 8, 10])) / 100;
  const surplus1 = surplus0 + rng.step(200000, 800000, 10000) - prev;
  const when = rng.pick(D.ISSUE_DATES);
  const deb0 = rng.step(500000, 2000000, 100000);
  const fresh = rng.step(200000, 1000000, 100000);
  const rate = D.wholeRate(rng, fresh, [when.months]);
  if (rate === null || (deb0 * rate) % 100 !== 0) return null;
  const loan0 = rng.step(400000, 1500000, 100000);
  const way = rng.pick(['repaid', 'repaid', 'raised'] as const);
  const move = way === 'repaid' ? -rng.step(100000, Math.max(100000, Math.floor(loan0 / 3 / 100000) * 100000), 100000) : rng.step(100000, 500000, 100000);
  const loanRate = rng.pick([9, 10, 11, 12]);
  return {
    co, trade, sc: [sc0, sc0 + 10 * n], sp: [sp0, sp0 + n * prem], surplus: [surplus0, surplus1], rate, deb: [deb0, deb0 + fresh],
    month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, loan: [loan0, loan0 + move], loanInterest: (loan0 * loanRate) / 100,
    prev, cur: ((sc0 + 10 * n) * rng.pick([5, 8, 10, 12])) / 100,
  };
}
const finText = (s: FinYear): string =>
  [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. From its balance sheets:`,
    twoDates(FIN.sc, s.sc[0], s.sc[1]),
    twoDates(FIN.sp, s.sp[0], s.sp[1]),
    twoDates(FIN.surplus, s.surplus[0], s.surplus[1]),
    twoDates(`${s.rate}% Debentures`, s.deb[0], s.deb[1]),
    twoDates(FIN.loan, s.loan[0], s.loan[1]),
    'Additional information:',
    `(a) The shares were issued for cash during the year${s.sp[1] > s.sp[0] ? ', at a premium' : ', at par'}, and all the money was received.`,
    `(b) The additional debentures were issued at par for cash on 1 ${s.month}. Interest on debentures is paid on the due dates, so none is outstanding at either date.`,
    `(c) Interest paid on the bank loan during the year: ${inr(s.loanInterest)}.`,
    `(d) The dividend of ${inr(s.prev)} proposed for ${PREV} was declared and paid during ${YEAR}. A dividend of ${inr(s.cur)} has been proposed for ${YEAR}.`,
    'There is no other share capital, reserve or borrowing.',
  ].join('\n');
/** The figures read back from the printed case. */
function finIn(text: string) {
  const f = datesIn(text);
  const get = (label: string): [number, number] => f.get(label) ?? [NaN, NaN];
  const debLine = [...f].find(([label]) => /% Debentures$/.test(label));
  const rate = Number(/^(\d+)% Debentures$/.exec(debLine?.[0] ?? '')?.[1]);
  const months = D.ISSUE_DATES.find((d) => text.includes(`on 1 ${d.month} `))?.months ?? NaN;
  return { sc: get(FIN.sc), sp: get(FIN.sp), surplus: get(FIN.surplus), loan: get(FIN.loan), deb: debLine?.[1] ?? [NaN, NaN], rate, months, loanInterest: afterWords(text, 'Interest paid on the bank loan during the year: ₹'), prev: afterWords(text, 'The dividend of ₹') };
}

function finShares(s: FinYear): NumericParts | null {
  const f = finFigures(s);
  const n = money(f.shares, [
    s.sp[1] > s.sp[0] && [s.sc[1] - s.sc[0], 'Left out the premium; the whole issue price received is the inflow.'],
    [s.sc[1] + s.sp[1], 'Took the closing balances instead of the rise during the year.'],
    [f.shares + s.surplus[1] - s.surplus[0], 'Added the rise in Surplus, which comes from profit, not from the issue.'],
    s.sp[0] > 0 && s.sp[1] > s.sp[0] && [s.sc[1] - s.sc[0] + s.sp[1], 'Took the closing balance of Securities Premium instead of its rise.'],
  ]);
  return n && {
    prompt: `What are the proceeds from the issue of equity shares in the Cash Flow Statement of ${s.co} for ${YEAR}?`,
    ...n,
    explanation: [`Share capital rose by ${inr(s.sc[1] - s.sc[0])}${s.sp[1] > s.sp[0] ? ` and Securities Premium by ${inr(s.sp[1] - s.sp[0])}` : '; Securities Premium did not change, as the shares were issued at par'}.`, `Proceeds = ${inr(f.shares)}, a financing inflow.`],
    hints: ['Proceeds of an issue for cash = rise in share capital + rise in Securities Premium.', 'It is a financing inflow.'],
  };
}
const finSharesHolds = (q: NumericQuestion): boolean => {
  const t = finIn(q.context ?? '');
  return q.answer === rupees(t.sc[1] - t.sc[0] + t.sp[1] - t.sp[0]);
};

function finDebInterest(s: FinYear): NumericParts | null {
  const f = finFigures(s);
  const n = money(f.debInterest, [
    [(s.deb[1] * s.rate) / 100, 'Charged a full year on all the debentures, the new ones with them.'],
    [(s.deb[0] * s.rate) / 100, 'Left out the interest on the debentures issued during the year.'],
    [(s.deb[1] * s.rate * s.months) / 1200, 'Charged every debenture for the months after the new issue only.'],
  ]);
  return n && {
    prompt: `How much interest was paid on the ${s.rate}% Debentures during ${YEAR}?`,
    ...n,
    explanation: [
      `On the debentures held all year: ${s.rate}% of ${inr(s.deb[0])} = ${inr((s.deb[0] * s.rate) / 100)}.`,
      `On the ${inr(f.fresh)} issued on 1 ${s.month}, for ${s.months} months: ${inr((f.fresh * s.rate * s.months) / 1200)}.`,
      `Interest paid = ${inr(f.debInterest)}, since none is outstanding at the year end.`,
    ],
    hints: D.H.interest,
  };
}
const finDebInterestHolds = (q: NumericQuestion): boolean => {
  const t = finIn(q.context ?? '');
  return q.answer * 1200 === rupees(t.deb[0] * t.rate * 12 + (t.deb[1] - t.deb[0]) * t.rate * t.months);
};

function finProposed(s: FinYear): McqParts | null {
  return choice(
    `What does the dividend of ${inr(s.cur)} proposed for ${YEAR} do to the Cash Flow Statement for ${YEAR}?`,
    'Nothing: it is not accounted for until it is declared, so no cash goes out in this year',
    [
      [`It is a financing outflow of ${inr(s.cur)}`, 'Took the proposed dividend as paid; it is paid only after it is declared, in the next year.'],
      [`It is added back to the profit under operating activities, ${inr(s.cur)}`, 'Treated the proposed dividend as charged against this year\'s profit; it is not accounted for until it is declared.'],
      [`Both ${inr(s.prev)} and ${inr(s.cur)} are financing outflows`, `Counted both dividends as paid in ${YEAR}; only the dividend of ${PREV} was paid.`],
      [`It is deducted from the proceeds of the shares`, 'Mixed the dividend up with the money raised; a dividend paid is an outflow of its own.'],
    ],
    `Only the dividend of ${PREV}, ${inr(s.prev)}, declared and paid during ${YEAR}, is a financing outflow of the year. The dividend proposed for ${YEAR} is not a liability until the shareholders declare it, so it moves no cash this year.`,
    H.financing,
  );
}
const finProposedHolds = (q: McqQuestion): boolean => (q.context ?? '').includes('has been proposed for') && optionText(q).startsWith('Nothing:');

function finNet(s: FinYear): NumericParts | null {
  const f = finFigures(s);
  const out = f.net < 0;
  const net = Math.abs(f.net);
  const same = (v: number): number => (v * f.net > 0 ? Math.abs(v) : 0);
  const n = money(net, [
    [same(f.net + f.debInterest + s.loanInterest), 'Left out the interest paid; for a company that is not a financing company it is a financing outflow.'],
    [same(f.net + s.prev), `Left out the dividend of ${PREV} paid during the year.`],
    [same(f.net - s.cur), `Took the dividend proposed for ${YEAR} as paid as well.`],
    [same(f.net - 2 * f.loanMove), `Took the change in the bank loan the wrong way round.`],
  ]);
  return n && {
    prompt: `Find the net cash ${out ? 'used in' : 'from'} financing activities of ${s.co} for ${YEAR}.`,
    ...n,
    explanation: [
      `Proceeds from issue of shares ${inr(f.shares)}; proceeds from issue of debentures ${inr(f.fresh)}; ${f.loanMove > 0 ? `bank loan raised ${inr(f.loanMove)}` : `bank loan repaid (${inr(-f.loanMove)})`}.`,
      `Interest paid on debentures (${inr(f.debInterest)}); interest paid on the bank loan (${inr(s.loanInterest)}); dividend paid (${inr(s.prev)}).`,
      `Net cash ${out ? 'used in' : 'from'} financing activities = ${signed(f.net)}.`,
    ],
    hints: H.financing,
  };
}
const finNetHolds = (q: NumericQuestion): boolean => {
  const t = finIn(q.context ?? '');
  const net = t.sc[1] - t.sc[0] + t.sp[1] - t.sp[0] + t.deb[1] - t.deb[0] + t.loan[1] - t.loan[0] - (t.deb[0] * t.rate * 12 + (t.deb[1] - t.deb[0]) * t.rate * t.months) / 1200 - t.loanInterest - t.prev;
  return q.prompt.includes(net < 0 ? 'net cash used in' : 'net cash from') && q.answer === rupees(Math.abs(net));
};

function finChange(s: FinYear): NumericParts | null {
  const f = finFigures(s);
  const [a, b] = f.debt;
  if (a === b) return null;
  const up = b > a;
  const change = Math.abs(b - a);
  const n = percent([change, a], [
    [[change, b], `Divided the change by the figure of ${Y1}; the base is the earlier figure.`],
    [[f.fresh, s.deb[0]], 'Worked the change in the debentures alone; long-term borrowings take in the bank loan too.'],
    [[Math.abs(f.loanMove), s.loan[0]], 'Worked the change in the bank loan alone.'],
  ]);
  return n && {
    prompt: `By what percentage did the long-term borrowings (debentures and bank loan) ${up ? 'rise' : 'fall'} from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [`Long-term borrowings: ${inr(s.deb[0])} + ${inr(s.loan[0])} = ${inr(a)} on ${Y0}; ${inr(s.deb[1])} + ${inr(s.loan[1])} = ${inr(b)} on ${Y1}.`, `Percentage change = ${inr(change)} ÷ ${inr(a)} × 100 = ${pc(n.answer)}${up ? '' : ', a decrease'}.`],
    hints: H.change,
  };
}
const finChangeHolds = (q: NumericQuestion): boolean => {
  const t = finIn(q.context ?? '');
  const [a, b] = [t.deb[0] + t.loan[0], t.deb[1] + t.loan[1]];
  return q.prompt.includes(b > a ? ') rise from' : ') fall from') && nearPercent(q.answer, [Math.abs(b - a), a]);
};

function finGearing(s: FinYear): NumericParts | null {
  const f = finFigures(s);
  const n = times([f.debt[1], f.equity], [
    [[f.debt[0], s.sc[0] + s.sp[0] + s.surplus[0]], `Worked the ratio for ${Y0}; it is asked for ${Y1}.`],
    [[f.equity, f.debt[1]], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[s.deb[1], f.equity], 'Left the bank loan out of the debt.'],
    [[f.debt[1], s.sc[1]], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio of ${s.co} as at ${Y1}, debt being its long-term borrowings and equity its shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [`Debt = ${inr(s.deb[1])} + ${inr(s.loan[1])} = ${inr(f.debt[1])}.`, `Shareholders' funds = ${inr(s.sc[1])} + ${inr(s.sp[1])} + ${inr(s.surplus[1])} = ${inr(f.equity)}.`, `Debt to equity ratio = ${inr(f.debt[1])} ÷ ${inr(f.equity)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const finGearingHolds = (q: NumericQuestion): boolean => {
  const t = finIn(q.context ?? '');
  return nearTimes(q.answer, [t.deb[1] + t.loan[1], t.sc[1] + t.sp[1] + t.surplus[1]]);
};

const finMakers = [finShares, finDebInterest, finProposed, finNet, finChange, finGearing];
const caseFinancing = caseTemplate<FinYear>({
  id: 'case-cy-financing-two-sheets',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'The financing activities of a year',
  setup: (rng) => firstGood(30, () => drawFinYear(rng), (s) => finMakers.every((m) => m(s) !== null)),
  context: finText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: finShares, verify: finSharesHolds },
    { kind: 'numeric', unit: 'rupees', make: finDebInterest, verify: finDebInterestHolds },
    { kind: 'mcq', make: finProposed, verify: finProposedHolds },
    { kind: 'numeric', unit: 'rupees', make: finNet, verify: finNetHolds },
    { kind: 'numeric', unit: 'percent', make: finChange, verify: finChangeHolds },
    { kind: 'numeric', unit: 'times', make: finGearing, verify: finGearingHolds },
  ],
});

// ===============================================================================================================
// 13. case-cy-common-size-funds: the whole balance sheet of a company at the end of a year in which it issued
//     debentures redeemable at a premium (at par or at a discount), with the premium payable on redemption among the
//     other long-term liabilities and a bank loan in some seeds. Asked: the loss on issue written off, the common size
//     percentages (total of the balance sheet = 100) of the shareholders' funds and of the non-current liabilities,
//     the total assets to debt ratio, and how the proprietary ratio and the common size percentage are related.
// ===============================================================================================================

const CS = {
  sc: 'Share capital',
  rs: 'Reserves and surplus',
  loan: 'Long-term borrowings: bank loan',
  oltl: 'Other long-term liabilities (premium payable on redemption of debentures)',
  tp: 'Trade payables',
  stp: 'Short-term provisions',
  ppe: 'Property, plant and equipment',
  inv: 'Inventories',
  tr: 'Trade receivables',
  cash: 'Cash and cash equivalents',
} as const;
interface ShareOfTotal {
  co: string;
  trade: string;
  sc: number;
  rs: number;
  loan: number;
  n: number;
  rate: number;
  disc: number;
  red: number;
  tp: number;
  stp: number;
  ppe: number;
  inv: number;
  tr: number;
  cash: number;
}
const debLabel = (s: Pick<ShareOfTotal, 'rate'>): string => `Long-term borrowings: ${s.rate}% Debentures`;
const shareTotals = (s: ShareOfTotal) => {
  const deb = s.n * 100;
  const oltl = s.n * s.red;
  const sf = s.sc + s.rs;
  const ncl = s.loan + deb + oltl;
  const total = sf + ncl + s.tp + s.stp;
  return { deb, oltl, sf, ncl, total, debt: s.loan + deb, loss: s.n * (s.disc + s.red) };
};
function drawShareOfTotal(rng: Rng): ShareOfTotal | null {
  const { co, trade } = firm(rng);
  const sc = rng.step(2000000, 8000000, 500000);
  const rs = Math.round((sc * rng.pick([20, 30, 40, 50, 60])) / 100 / 10000) * 10000;
  const n = rng.step(5000, 30000, 1000);
  const s: ShareOfTotal = {
    co, trade, sc, rs, loan: rng.int(0, 1) === 0 ? 0 : rng.step(500000, 2000000, 100000), n, rate: rng.pick(D.RATES), disc: rng.pick([0, 5, 10]), red: rng.pick([5, 10]),
    tp: rng.step(300000, 1500000, 10000), stp: rng.step(50000, 300000, 10000), ppe: 0, inv: rng.step(400000, 2000000, 10000), tr: rng.step(300000, 1500000, 10000), cash: rng.step(100000, 800000, 10000),
  };
  const t = shareTotals(s);
  s.ppe = t.total - s.inv - s.tr - s.cash;
  return s.ppe * 100 >= 45 * t.total ? s : null;
}
const shareOfTotalText = (s: ShareOfTotal): string => {
  const t = shareTotals(s);
  return [
    `${s.co}, ${s.trade}, gives the whole of its balance sheet as at ${Y1}:`,
    `${CS.sc}: ${inr(s.sc)}`,
    `${CS.rs}: ${inr(s.rs)}`,
    `${debLabel(s)}: ${inr(t.deb)}`,
    ...(s.loan > 0 ? [`${CS.loan}: ${inr(s.loan)}`] : []),
    `${CS.oltl}: ${inr(t.oltl)}`,
    `${CS.tp}: ${inr(s.tp)}`,
    `${CS.stp}: ${inr(s.stp)}`,
    `${CS.ppe}: ${inr(s.ppe)}`,
    `${CS.inv}: ${inr(s.inv)}`,
    `${CS.tr}: ${inr(s.tr)}`,
    `${CS.cash}: ${inr(s.cash)}`,
    `The debentures, of ₹100 each, were all issued during the year ${s.disc > 0 ? `at a discount of ${s.disc}%` : 'at par'} and are redeemable at a premium of ${s.red}%. The premium payable on redemption was provided for on allotment, the whole loss on the issue was debited to ${D.LOSS_AC}, and the loss was written off in full against Securities Premium, which is part of the reserves and surplus above.`,
  ].join('\n');
};
/** The figures read back from the printed case. */
function shareOfTotalIn(text: string) {
  const f = listedIn(text);
  const g = (label: string): number => f.get(label) ?? 0;
  const debLine = [...f].find(([label]) => label.startsWith('Long-term borrowings: ') && label.endsWith('% Debentures'));
  const deb = debLine?.[1] ?? 0;
  const liabilities = g(CS.sc) + g(CS.rs) + deb + g(CS.loan) + g(CS.oltl) + g(CS.tp) + g(CS.stp);
  const assets = g(CS.ppe) + g(CS.inv) + g(CS.tr) + g(CS.cash);
  return { sf: g(CS.sc) + g(CS.rs), ncl: deb + g(CS.loan) + g(CS.oltl), debt: deb + g(CS.loan), liabilities, assets, deb, oltl: g(CS.oltl) };
}

function shareLoss(s: ShareOfTotal): NumericParts | null {
  const t = shareTotals(s);
  const n = money(t.loss, [
    s.disc > 0 && [t.oltl, 'Counted only the premium payable on redemption; the discount allowed on issue is also a loss.'],
    s.disc > 0 && [s.n * s.disc, 'Counted only the discount; the premium payable on redemption is also a loss.'],
    [t.deb + t.oltl, 'Took the whole amount payable on redemption as the loss.'],
    s.disc === 0 && [t.deb, 'Gave the nominal value of the debentures; issued at par, they bring a loss of only the premium payable on redemption.'],
  ]);
  return n && {
    prompt: `What was the loss on the issue of the debentures written off against Securities Premium during ${YEAR}?`,
    ...n,
    explanation: [
      `The debentures stand at their nominal value, ${inr(t.deb)}: ${cnt(s.n)} debentures of ₹100.`,
      `Premium payable on redemption = ${s.red}% of ${inr(t.deb)} = ${inr(t.oltl)}, the other long-term liability shown.`,
      s.disc > 0 ? `Discount on issue = ${s.disc}% of ${inr(t.deb)} = ${inr(s.n * s.disc)}. Loss on issue = ${inr(s.n * s.disc)} + ${inr(t.oltl)} = ${inr(t.loss)}.` : `They were issued at par, so the loss on issue is the premium payable on redemption, ${inr(t.loss)}.`,
    ],
    hints: D.H.cases,
  };
}
const shareLossHolds = (q: NumericQuestion): boolean => {
  const t = shareOfTotalIn(q.context ?? '');
  const disc = /at a discount of (\d+)%/.exec(q.context ?? '')?.[1];
  return q.answer === rupees(t.oltl + (t.deb * Number(disc ?? 0)) / 100);
};

function shareFunds(s: ShareOfTotal): NumericParts | null {
  const t = shareTotals(s);
  const n = percent([t.sf, t.total], [
    [[s.sc, t.total], "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
    [[t.sf, t.total - t.sf], "Divided by the liabilities alone; the base is the total of the balance sheet."],
    [[t.sf + t.ncl, t.total], "Added the non-current liabilities: that is the capital employed."],
    [[t.sf, s.ppe], 'Divided by the property, plant and equipment; the base is the total of the balance sheet.'],
  ]);
  return n && {
    prompt: `In the common size balance sheet of ${s.co} (total of the balance sheet = 100), what percentage do the shareholders' funds take? Give it to two decimal places.`,
    ...n,
    explanation: [
      `Total of the balance sheet = ${inr(t.sf)} + ${inr(t.ncl)} + ${inr(s.tp)} + ${inr(s.stp)} = ${inr(t.total)}, the same as the total of the assets.`,
      `Shareholders' funds = ${inr(s.sc)} + ${inr(s.rs)} = ${inr(t.sf)}: ${inr(t.sf)} ÷ ${inr(t.total)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: ['In a common size balance sheet each line is a percentage of the total of the balance sheet.', "Shareholders' funds = share capital + reserves and surplus."],
  };
}
const shareFundsHolds = (q: NumericQuestion): boolean => {
  const t = shareOfTotalIn(q.context ?? '');
  return t.liabilities === t.assets && nearPercent(q.answer, [t.sf, t.assets]);
};

function shareNcl(s: ShareOfTotal): NumericParts | null {
  const t = shareTotals(s);
  const n = percent([t.ncl, t.total], [
    [[t.debt, t.total], 'Left out the premium payable on redemption; it is a non-current liability too.'],
    [[t.deb, t.total], 'Took the debentures alone.'],
    [[t.ncl + s.tp + s.stp, t.total], 'Added the current liabilities.'],
  ]);
  return n && {
    prompt: `What percentage do the non-current liabilities take in that common size balance sheet? Give it to two decimal places.`,
    ...n,
    explanation: [
      `Non-current liabilities = debentures ${inr(t.deb)}${s.loan > 0 ? ` + bank loan ${inr(s.loan)}` : ''} + premium payable on redemption ${inr(t.oltl)} = ${inr(t.ncl)}.`,
      `${inr(t.ncl)} ÷ ${inr(t.total)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: ['Non-current liabilities: long-term borrowings, other long-term liabilities and long-term provisions.', 'Divide by the total of the balance sheet.'],
  };
}
const shareNclHolds = (q: NumericQuestion): boolean => {
  const t = shareOfTotalIn(q.context ?? '');
  return nearPercent(q.answer, [t.ncl, t.assets]);
};

function shareAssetsDebt(s: ShareOfTotal): NumericParts | null {
  const t = shareTotals(s);
  const n = times([t.total, t.debt], [
    [[t.total, t.ncl], 'Counted the premium payable on redemption as debt; it is not a borrowing.'],
    [[t.debt, t.total], 'Divided the debt by the total assets: the ratio is upside down.'],
    [[t.total - s.tp - s.stp, t.debt], 'Deducted the current liabilities from the total assets: that is the capital employed.'],
    [[s.ppe, t.debt], 'Took the property, plant and equipment alone as the assets.'],
  ]);
  return n && {
    prompt: `Find the total assets to debt ratio of ${s.co} as at ${Y1}, debt being its long-term borrowings, ${AS_RATIO}.`,
    ...n,
    explanation: [`Total assets = ${inr(t.total)}. Debt = ${s.loan > 0 ? `${inr(t.deb)} + ${inr(s.loan)} = ` : ''}${inr(t.debt)}; the premium payable on redemption is an other long-term liability, not a borrowing.`, `Total assets to debt ratio = ${inr(t.total)} ÷ ${inr(t.debt)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const shareAssetsDebtHolds = (q: NumericQuestion): boolean => {
  const t = shareOfTotalIn(q.context ?? '');
  return nearTimes(q.answer, [t.assets, t.debt]);
};

function shareLink(s: ShareOfTotal): McqParts | null {
  const t = shareTotals(s);
  const pct = pct2(t.sf, t.total);
  if (pct === null) return null;
  const ratio = AN.rounded([t.sf, t.total], AN.TIMES);
  if (ratio === null) return null;
  return choice(
    `The proprietary ratio of ${s.co}, worked on total assets, is ${dec(ratio)} : 1. How does it stand beside the common size percentage of the shareholders' funds?`,
    "They are the same figure: the ratio x 100 is the percentage, since both divide the shareholders' funds by the total assets",
    [
      ["They cannot be compared: one is a ratio and the other a percentage", 'Missed that the total of the balance sheet, the base of the common size statement, is the total assets.'],
      ['The percentage is the ratio x 100 only if there are no current liabilities', 'Took the base of the common size balance sheet to be the capital employed; it is the whole total.'],
      ["The percentage is larger, as the common size base leaves out the current liabilities", 'Thought the common size base leaves out the current liabilities; it is the total of the balance sheet.'],
      ['The ratio is 100 less the percentage', "Mixed the proprietary ratio up with the share of the outside liabilities."],
    ],
    `Proprietary ratio = shareholders' funds ÷ total assets = ${inr(t.sf)} ÷ ${inr(t.total)}. The common size balance sheet divides every line by the same total, so the shareholders' funds stand at ${pc(pct)}: the ratio of ${dec(ratio)} : 1 is the same figure, rounded.`,
    ["The proprietary ratio here is shareholders' funds ÷ total assets.", 'The base of a common size balance sheet is its total, which is the total assets.'],
  );
}
const shareLinkHolds = (q: McqQuestion): boolean => {
  const t = shareOfTotalIn(q.context ?? '');
  return t.liabilities === t.assets && optionText(q).startsWith('They are the same figure');
};

const shareMakers = [shareLoss, shareFunds, shareNcl, shareAssetsDebt, shareLink];
const caseShareOfTotal = caseTemplate<ShareOfTotal>({
  id: 'case-cy-common-size-funds',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Shares of the balance sheet total',
  setup: (rng) => firstGood(30, () => drawShareOfTotal(rng), (s) => shareMakers.every((m) => m(s) !== null)),
  context: shareOfTotalText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: shareLoss, verify: shareLossHolds },
    { kind: 'numeric', unit: 'percent', make: shareFunds, verify: shareFundsHolds },
    { kind: 'numeric', unit: 'percent', make: shareNcl, verify: shareNclHolds },
    { kind: 'numeric', unit: 'times', make: shareAssetsDebt, verify: shareAssetsDebtHolds },
    { kind: 'mcq', make: shareLink, verify: shareLinkHolds },
  ],
});

// ===============================================================================================================
// 14. case-cy-machinery-for-shares: machinery bought during the year partly from a vendor paid in equity shares at a
//     premium and partly for cash, nothing sold. From extracts of two balance sheets: the shares allotted to the
//     vendor, the entry for their allotment, the machinery bought for cash (the only investing outflow it gives), the
//     percentage rise in machinery at cost, and the debt to equity ratio at the year end.
// ===============================================================================================================

const MF = {
  sc: 'Equity share capital (shares of ₹10 each)',
  sp: 'Securities premium',
  surplus: 'Surplus (balance in Statement of Profit and Loss)',
  ltb: 'Long-term borrowings',
  mach: 'Machinery (at cost)',
  dep: 'Accumulated depreciation on machinery',
} as const;
interface MachineShares {
  co: string;
  trade: string;
  v: string;
  date: string;
  sc0: number;
  sp0: number;
  surplus: [number, number];
  ltb: [number, number];
  mach0: number;
  dep: [number, number];
  /** The vendor's machinery, the shares and their premium, and the machinery bought for cash. */
  worth: number;
  n: number;
  p: number;
  cash: number;
}
function drawMachineShares(rng: Rng): MachineShares | null {
  const { co, trade } = firm(rng);
  const p = rng.pick([2, 4, 5, 6, 10, 15]);
  const n = rng.step(10000, 60000, 2000);
  const mach0 = rng.step(1500000, 6000000, 100000);
  const dep0 = Math.round((mach0 * rng.pick([20, 25, 30, 35])) / 100 / 10000) * 10000;
  const charge = Math.round((mach0 * rng.pick([8, 10, 12])) / 100 / 10000) * 10000;
  const surplus0 = rng.step(300000, 2000000, 10000);
  const ltb0 = rng.step(500000, 3000000, 100000);
  return {
    co, trade, v: rng.pick(D.VENDORS), date: `${rng.pick([1, 10, 15, 20])} ${rng.pick(['June', 'August', 'October', 'December'])} 2025`,
    sc0: 10 * rng.step(100000, 500000, 10000), sp0: rng.int(0, 1) === 0 ? 0 : rng.step(50000, 500000, 10000),
    surplus: [surplus0, surplus0 + rng.step(100000, 800000, 10000)], ltb: [ltb0, ltb0 + rng.pick([-1, 0, 1]) * rng.step(100000, 500000, 100000)],
    mach0, dep: [dep0, dep0 + charge], worth: n * (10 + p), n, p, cash: rng.step(100000, 1500000, 10000),
  };
}
const machineSharesText = (s: MachineShares): string =>
  [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. From its balance sheets:`,
    twoDates(MF.sc, s.sc0, s.sc0 + 10 * s.n),
    twoDates(MF.sp, s.sp0, s.sp0 + s.n * s.p),
    twoDates(MF.surplus, s.surplus[0], s.surplus[1]),
    twoDates(MF.ltb, s.ltb[0], s.ltb[1]),
    twoDates(MF.mach, s.mach0, s.mach0 + s.worth + s.cash),
    twoDates(MF.dep, s.dep[0], s.dep[1]),
    `On ${s.date} it bought machinery for ${inr(s.worth)} from ${s.v} and paid for it by allotting equity shares of ₹10 each at a premium of ${inr(s.p)} a share. The rest of the machinery bought during the year was paid for by cheque. No machinery was sold, and no other shares were issued.`,
    'Its shareholders\' funds are its share capital, Securities Premium and Surplus.',
  ].join('\n');
const machineSharesIn = (text: string) => {
  const f = datesIn(text);
  const get = (label: string): [number, number] => f.get(label) ?? [NaN, NaN];
  return { sc: get(MF.sc), sp: get(MF.sp), surplus: get(MF.surplus), ltb: get(MF.ltb), mach: get(MF.mach), worth: afterWords(text, 'bought machinery for ₹'), p: afterWords(text, 'at a premium of ₹') };
};

function machineSharesCount(s: MachineShares): NumericParts | null {
  const n = count(s.n, [
    [s.worth / 10, 'Divided by the face value; the vendor takes each share at its issue price.'],
    [(s.mach0 + s.worth + s.cash - s.mach0) / (10 + s.p), 'Divided all the machinery bought by the issue price; only the vendor was paid in shares.'],
    ...(s.p < 10 && s.worth % (10 - s.p) === 0 ? ([[s.worth / (10 - s.p), 'Took the premium off the face value instead of adding it.']] as [number, string][]) : []),
  ]);
  return n && {
    prompt: `How many shares were allotted to ${s.v}?`,
    ...n,
    explanation: [`Issue price of a share = ₹10 + ${inr(s.p)} = ${inr(10 + s.p)}.`, `Shares allotted = ${inr(s.worth)} ÷ ${inr(10 + s.p)} = ${cnt(s.n)}. The rise in share capital, ${inr(10 * s.n)}, is their face value.`],
    hints: S.H.vendor,
  };
}
const machineSharesCountHolds = (q: NumericQuestion): boolean => {
  const t = machineSharesIn(q.context ?? '');
  return q.answer * 10 === t.sc[1] - t.sc[0] && q.answer * (10 + t.p) === t.worth;
};

function machineSharesEntry(s: MachineShares): McqParts | null {
  const v = s.v;
  return choice(
    `Which entry records the allotment of the shares to ${v}?`,
    `${v} Dr ${inr(s.worth)}; To Equity Share Capital A/c ${inr(10 * s.n)}; To Securities Premium A/c ${inr(s.n * s.p)}`,
    [
      [`${v} Dr ${inr(s.worth)}; To Equity Share Capital A/c ${inr(s.worth)}`, 'Credited the whole price to share capital; the premium goes to Securities Premium A/c.'],
      [`Bank A/c Dr ${inr(s.worth)}; To Equity Share Capital A/c ${inr(10 * s.n)}; To Securities Premium A/c ${inr(s.n * s.p)}`, 'Recorded the shares as issued for cash; no money was received.'],
      [`Machinery A/c Dr ${inr(s.worth)}; To ${v} ${inr(s.worth)}`, 'Gave the entry for the purchase of the machinery, not for the allotment of the shares that settles it.'],
      [`${v} Dr ${inr(10 * s.n)}; To Equity Share Capital A/c ${inr(10 * s.n)}`, 'Settled the vendor at the face value of the shares; the vendor takes them at their issue price.'],
    ],
    `The vendor, credited with ${inr(s.worth)} when the machinery was bought, is now settled: ${v} is debited. ${cnt(s.n)} shares are allotted at ${inr(10 + s.p)}: Equity Share Capital A/c is credited with their face value, ${inr(10 * s.n)}, and Securities Premium A/c with the premium, ${inr(s.n * s.p)}.`,
    S.H.vendor,
  );
}
const machineSharesEntryHolds = (q: McqQuestion): boolean => {
  const t = machineSharesIn(q.context ?? '');
  return optionText(q).endsWith(`To Securities Premium A/c ${inr(t.sp[1] - t.sp[0])}`) && optionText(q).includes(`To Equity Share Capital A/c ${inr(t.sc[1] - t.sc[0])}`);
};

function machineSharesCash(s: MachineShares): NumericParts | null {
  const n = money(s.cash, [
    [s.worth + s.cash, 'Took the whole rise in machinery at cost as cash spent; the machinery from the vendor was paid for in shares.'],
    [s.worth, 'Gave the machinery paid for in shares, which moved no cash.'],
    [s.cash + s.dep[1] - s.dep[0], 'Added the depreciation of the year; machinery is kept at cost, so its account has no depreciation in it.'],
    [s.cash - (s.dep[1] - s.dep[0]), 'Deducted the depreciation of the year; machinery is kept at cost.'],
  ]);
  return n && {
    prompt: `What is the outflow "Purchase of machinery" in the Cash Flow Statement of ${s.co} for ${YEAR}?`,
    ...n,
    explanation: [
      `Machinery at cost rose by ${inr(s.mach0 + s.worth + s.cash)} - ${inr(s.mach0)} = ${inr(s.worth + s.cash)}, and none was sold: that is all the machinery bought.`,
      `Of it, ${inr(s.worth)} was paid for in shares and moved no cash. Purchase of machinery for cash = ${inr(s.worth + s.cash)} - ${inr(s.worth)} = ${inr(s.cash)}, an investing outflow.`,
    ],
    hints: ['Machinery bought = closing cost + cost of machinery sold - opening cost.', 'Leave out what was paid for in shares: it moved no cash.'],
  };
}
const machineSharesCashHolds = (q: NumericQuestion): boolean => {
  const t = machineSharesIn(q.context ?? '');
  return q.answer === rupees(t.mach[1] - t.mach[0] - t.worth);
};

function machineSharesChange(s: MachineShares): NumericParts | null {
  const rise = s.worth + s.cash;
  const n = percent([rise, s.mach0], [
    [[rise, s.mach0 + rise], `Divided the rise by the figure of ${Y1}; the base is the earlier figure.`],
    [[s.cash, s.mach0], 'Left out the machinery paid for in shares; it is machinery all the same.'],
    [[rise - (s.dep[1] - s.dep[0]), s.mach0], 'Took the depreciation off; the line is machinery at cost.'],
  ]);
  return n && {
    prompt: `By what percentage did machinery at cost rise from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [`Rise = ${inr(s.mach0 + rise)} - ${inr(s.mach0)} = ${inr(rise)}.`, `Percentage change = ${inr(rise)} ÷ ${inr(s.mach0)} × 100 = ${pc(n.answer)}.`],
    hints: H.change,
  };
}
const machineSharesChangeHolds = (q: NumericQuestion): boolean => {
  const t = machineSharesIn(q.context ?? '');
  return nearPercent(q.answer, [t.mach[1] - t.mach[0], t.mach[0]]);
};

function machineSharesGearing(s: MachineShares): NumericParts | null {
  const equity = s.sc0 + 10 * s.n + s.sp0 + s.n * s.p + s.surplus[1];
  const n = times([s.ltb[1], equity], [
    [[s.ltb[1], equity - s.worth], "Left the shares allotted to the vendor out of the shareholders' funds."],
    [[s.ltb[1] + s.worth, equity - s.worth], 'Took the shares allotted to the vendor as a borrowing.'],
    [[equity, s.ltb[1]], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[s.ltb[0], s.sc0 + s.sp0 + s.surplus[0]], `Worked the ratio for ${Y0}; it is asked for ${Y1}.`],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio of ${s.co} as at ${Y1}, debt being its long-term borrowings and equity its shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [`Shareholders' funds = ${inr(s.sc0 + 10 * s.n)} + ${inr(s.sp0 + s.n * s.p)} + ${inr(s.surplus[1])} = ${inr(equity)}.`, `Debt to equity ratio = ${inr(s.ltb[1])} ÷ ${inr(equity)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const machineSharesGearingHolds = (q: NumericQuestion): boolean => {
  const t = machineSharesIn(q.context ?? '');
  return nearTimes(q.answer, [t.ltb[1], t.sc[1] + t.sp[1] + t.surplus[1]]);
};

const machineSharesMakers = [machineSharesCount, machineSharesEntry, machineSharesCash, machineSharesChange, machineSharesGearing];
const caseMachineShares = caseTemplate<MachineShares>({
  id: 'case-cy-machinery-for-shares',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Machinery bought for shares',
  setup: (rng) => firstGood(30, () => drawMachineShares(rng), (s) => machineSharesMakers.every((m) => m(s) !== null)),
  context: machineSharesText,
  parts: [
    { kind: 'numeric', unit: 'number', make: machineSharesCount, verify: machineSharesCountHolds },
    { kind: 'mcq', make: machineSharesEntry, verify: machineSharesEntryHolds },
    { kind: 'numeric', unit: 'rupees', make: machineSharesCash, verify: machineSharesCashHolds },
    { kind: 'numeric', unit: 'percent', make: machineSharesChange, verify: machineSharesChangeHolds },
    { kind: 'numeric', unit: 'times', make: machineSharesGearing, verify: machineSharesGearingHolds },
  ],
});

// ===============================================================================================================
// 15. case-cy-return-on-investment: debentures issued during the year at a discount (redeemable at par), the
//     discount written off against a Securities Premium large enough to bear it; a bank loan outstanding all year.
//     From the profit before tax and the year-end figures: how the discount is written off, the interest on the
//     debentures, the profit before interest and tax, the capital employed, and the return on investment.
// ===============================================================================================================

interface Roi {
  co: string;
  trade: string;
  sc: number;
  rs: number;
  sp0: number;
  loan: number;
  loanRate: number;
  n: number;
  rate: number;
  disc: number;
  month: string;
  months: number;
  pbt: number;
  /** A long-term provision (for gratuity) in some seeds: a non-current liability, so part of the capital employed. */
  ltp: number;
}
const roiFigures = (s: Roi) => {
  const deb = s.n * 100;
  const debInterest = (deb * s.rate * s.months) / 1200;
  const loanInterest = (s.loan * s.loanRate) / 100;
  const pbit = s.pbt + debInterest + loanInterest;
  const ce = s.sc + s.rs + deb + s.loan + s.ltp;
  return { deb, debInterest, loanInterest, pbit, ce, discount: s.n * s.disc };
};
function drawRoi(rng: Rng): Roi | null {
  const { co, trade } = firm(rng);
  const when = rng.pick(D.ISSUE_DATES);
  const n = rng.step(5000, 25000, 1000);
  const rate = D.wholeRate(rng, n * 100, [when.months]);
  if (rate === null) return null;
  const disc = rng.pick([5, 10]);
  const sc = rng.step(2000000, 8000000, 500000);
  const sp0 = Math.ceil((n * disc) / 10000) * 10000 + rng.step(20000, 300000, 10000);
  const rs = sp0 - n * disc + rng.step(300000, 2500000, 10000);
  const s: Roi = { co, trade, sc, rs, sp0, loan: rng.step(500000, 3000000, 100000), loanRate: rng.pick([9, 10, 11, 12]), n, rate, disc, month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, pbt: 0, ltp: rng.int(0, 2) === 0 ? rng.step(100000, 500000, 10000) : 0 };
  const f = roiFigures(s);
  s.pbt = Math.round((f.ce * rng.pick([8, 10, 12, 14, 16, 18, 20])) / 100 / 10000) * 10000 - f.debInterest - f.loanInterest;
  return s.pbt > 0 ? s : null;
}
const roiText = (s: Roi): string => {
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. On 1 ${s.month} it issued ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each at a discount of ${s.disc}% for cash, redeemable at par after five years. The discount is debited to ${D.DISCOUNT_AC}.`,
    `Before this issue its Securities Premium A/c had a balance of ${inr(s.sp0)}; the discount was written off on ${Y1}, first from Securities Premium and then, if needed, from the Statement of Profit and Loss.`,
    `Its ${s.loanRate}% long-term loan of ${inr(s.loan)} from a bank was outstanding all year. Interest on the loan and the debentures was paid on the due dates.`,
    `Its profit before tax for the year ended ${Y1}, after charging that interest, was ${inr(s.pbt)}.`,
    `On ${Y1}: share capital ${inr(s.sc)}; reserves and surplus ${inr(s.rs)} (after the write-off)${s.ltp > 0 ? `; long-term provisions (for gratuity) ${inr(s.ltp)}` : ''}. The debentures and the loan are its only borrowings.`,
    "Capital employed is shareholders' funds plus non-current liabilities.",
  ].join('\n');
};
function roiIn(text: string) {
  const issue = /issued ([\d,]+), (\d+)% Debentures of ₹100 each at a discount of (\d+)%/.exec(text);
  const loan = /Its (\d+)% long-term loan of ₹([\d,]+)/.exec(text);
  const when = D.ISSUE_DATES.find((d) => text.includes(`On 1 ${d.month} `));
  if (!issue || !loan || !when) return null;
  const n = Number(issue[1].replace(/,/g, ''));
  const loanAmount = Number(loan[2].replace(/,/g, ''));
  const interest = (n * 100 * Number(issue[2]) * when.months) / 1200 + (loanAmount * Number(loan[1])) / 100;
  const pbit = afterWords(text, 'after charging that interest, was ₹') + interest;
  const ltp = text.includes('long-term provisions (for gratuity) ₹') ? afterWords(text, 'long-term provisions (for gratuity) ₹') : 0;
  const ce = afterWords(text, 'share capital ₹') + afterWords(text, 'reserves and surplus ₹') + n * 100 + loanAmount + ltp;
  return { n, disc: Number(issue[3]), sp0: afterWords(text, 'Securities Premium A/c had a balance of ₹'), pbit, ce };
}

function roiWriteOff(s: Roi): McqParts | null {
  const f = roiFigures(s);
  return choice(
    'How is the discount on the issue of the debentures written off?',
    `The whole ${inr(f.discount)} from Securities Premium, in this year`,
    [
      [`${inr(f.discount)} spread over the five years of the debentures, a part each year`, 'Spread the discount over the life of the debentures; it is written off in full in the year of allotment.'],
      [`The whole ${inr(f.discount)} charged to the Statement of Profit and Loss in this year, as a finance cost`, 'Left Securities Premium untouched; it is used first, and it is large enough here.'],
      [`The whole ${inr(f.discount)} written off against General Reserve`, 'Used a revenue reserve; the rule is Securities Premium first, then the Statement of Profit and Loss.'],
      [`Shown as an asset until the debentures are redeemed`, 'Carried the discount forward; it is written off in the year of allotment.'],
    ],
    `Discount = ${cnt(s.n)} x ${inr(s.disc)} = ${inr(f.discount)}. Securities Premium of ${inr(s.sp0)} is enough to bear it, so the whole of it is written off from Securities Premium in the year of allotment; nothing is charged to the Statement of Profit and Loss.`,
    D.H.writeOff,
  );
}
const roiWriteOffHolds = (q: McqQuestion): boolean => {
  const t = roiIn(q.context ?? '');
  return !!t && t.sp0 >= t.n * t.disc && optionText(q).startsWith(`The whole ${inr(t.n * t.disc)} from Securities Premium`);
};

function roiInterest(s: Roi): NumericParts | null {
  const f = roiFigures(s);
  const annual = (f.deb * s.rate) / 100;
  const n = money(f.debInterest, [
    [annual, `Charged a full year although the debentures were issued on 1 ${s.month}.`],
    [(f.deb * (100 - s.disc) * s.rate * s.months) / 120000, 'Worked the interest on the money received; interest is on the nominal value.'],
    [(annual * (12 - s.months)) / 12, 'Counted the months before the issue instead of the months after it.'],
    [f.debInterest + f.loanInterest, 'Added the interest on the bank loan; the question asks for the debentures.'],
  ]);
  return n && {
    prompt: `What is the interest on the debentures for the year ended ${Y1}?`,
    ...n,
    explanation: [`On the nominal value: ${s.rate}% of ${inr(f.deb)} = ${inr(annual)} a year.`, `For the ${s.months} months from 1 ${s.month}: ${inr(annual)} x ${s.months}/12 = ${inr(f.debInterest)}.`],
    hints: D.H.interest,
  };
}
const roiInterestHolds = (q: NumericQuestion): boolean => {
  const text = q.context ?? '';
  const t = roiIn(text);
  const rate = Number(/, (\d+)% Debentures of ₹100 each/.exec(text)?.[1]);
  const months = D.ISSUE_DATES.find((d) => text.includes(`On 1 ${d.month} `))?.months ?? NaN;
  return !!t && q.answer * 1200 === rupees(t.n * 100 * rate * months);
};

function roiPbit(s: Roi): NumericParts | null {
  const f = roiFigures(s);
  const n = money(f.pbit, [
    [s.pbt, 'Stopped at the profit before tax; the interest has to be added back.'],
    [s.pbt + f.loanInterest, 'Added back only the interest on the bank loan.'],
    [s.pbt + f.debInterest, 'Added back only the interest on the debentures.'],
    [f.pbit + f.discount, 'Added back the discount as well; it was written off against Securities Premium and never charged to the profit.'],
  ]);
  return n && {
    prompt: 'What is the profit before interest and tax for the year?',
    ...n,
    explanation: [`Interest charged = debentures ${inr(f.debInterest)} + bank loan ${s.loanRate}% of ${inr(s.loan)} = ${inr(f.loanInterest)}; together ${inr(f.debInterest + f.loanInterest)}.`, `Profit before interest and tax = ${inr(s.pbt)} + ${inr(f.debInterest + f.loanInterest)} = ${inr(f.pbit)}. The discount was written off against Securities Premium, so it was never in the profit.`],
    hints: ['Profit before interest and tax = profit before tax + interest on long-term debt.', 'Ask whether the discount reached the Statement of Profit and Loss at all.'],
  };
}
const roiPbitHolds = (q: NumericQuestion): boolean => {
  const t = roiIn(q.context ?? '');
  return !!t && q.answer === rupees(t.pbit);
};

function roiCapital(s: Roi): NumericParts | null {
  const f = roiFigures(s);
  const n = money(f.ce, [
    [s.sc + s.rs, "Gave the shareholders' funds alone; the non-current liabilities are part of the capital employed."],
    [s.sc + s.rs + f.deb, 'Left out the bank loan.'],
    [f.ce - f.discount, 'Took the debentures at the money received; they stand at their nominal value.'],
    s.ltp > 0 && [f.ce - s.ltp, 'Left out the long-term provisions, which are a non-current liability.'],
  ]);
  return n && {
    prompt: `What is the capital employed of ${s.co} on ${Y1}?`,
    ...n,
    explanation: [
      `Shareholders' funds = ${inr(s.sc)} + ${inr(s.rs)} = ${inr(s.sc + s.rs)}.`,
      `Non-current liabilities = debentures ${inr(f.deb)} + bank loan ${inr(s.loan)}${s.ltp > 0 ? ` + long-term provisions ${inr(s.ltp)}` : ''} = ${inr(f.deb + s.loan + s.ltp)}.`,
      `Capital employed = ${inr(f.ce)}.`,
    ],
    hints: ["Capital employed = shareholders' funds + non-current liabilities.", 'Debentures stand at their nominal value.'],
  };
}
const roiCapitalHolds = (q: NumericQuestion): boolean => {
  const t = roiIn(q.context ?? '');
  return !!t && q.answer === rupees(t.ce);
};

function roiReturn(s: Roi): NumericParts | null {
  const f = roiFigures(s);
  const n = percent([f.pbit, f.ce], [
    [[s.pbt, f.ce], 'Used the profit before tax; the return on investment uses the profit before interest and tax.'],
    [[f.pbit, s.sc + s.rs], "Divided by the shareholders' funds alone; the base is the capital employed."],
    [[f.pbit, f.ce - s.loan], 'Left the bank loan out of the capital employed.'],
  ]);
  return n && {
    prompt: `Find the return on investment of ${s.co} for ${YEAR}, on the capital employed at the year end, ${AS_PERCENT}.`,
    ...n,
    explanation: [`Return on investment = profit before interest and tax ÷ capital employed × 100 = ${inr(f.pbit)} ÷ ${inr(f.ce)} × 100 = ${pc(n.answer)}.`],
    hints: ['Return on investment = profit before interest and tax ÷ capital employed × 100.', "Capital employed = shareholders' funds + non-current liabilities."],
  };
}
const roiReturnHolds = (q: NumericQuestion): boolean => {
  const t = roiIn(q.context ?? '');
  return !!t && nearPercent(q.answer, [t.pbit, t.ce]);
};

const roiMakers = [roiWriteOff, roiInterest, roiPbit, roiCapital, roiReturn];
const caseRoi = caseTemplate<Roi>({
  id: 'case-cy-return-on-investment',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Return on investment after a debenture issue',
  setup: (rng) => firstGood(30, () => drawRoi(rng), (s) => roiMakers.every((m) => m(s) !== null)),
  context: roiText,
  parts: [
    { kind: 'mcq', make: roiWriteOff, verify: roiWriteOffHolds },
    { kind: 'numeric', unit: 'rupees', make: roiInterest, verify: roiInterestHolds },
    { kind: 'numeric', unit: 'rupees', make: roiPbit, verify: roiPbitHolds },
    { kind: 'numeric', unit: 'rupees', make: roiCapital, verify: roiCapitalHolds },
    { kind: 'numeric', unit: 'percent', make: roiReturn, verify: roiReturnHolds },
  ],
});

// ===============================================================================================================
// 16. case-cy-profit-to-operating-cash: the operating section of a Cash Flow Statement in a year in which debentures
//     were issued redeemable at a premium and the loss on them written off, partly from Securities Premium and partly
//     from the Statement of Profit and Loss. Asked: what the profit bore of the loss, how that charge is treated, the
//     net profit before tax (from Surplus, tax and dividend), the operating profit before working capital changes,
//     the net cash from operating activities, and the percentage change of a working capital item.
// ===============================================================================================================

const OPC = {
  surplus: CF_CASE.SURPLUS,
  tax: 'Provision for tax',
  inv: 'Inventories',
  tr: 'Trade receivables',
  tp: 'Trade payables',
} as const;
interface OpCash {
  co: string;
  trade: string;
  surplus0: number;
  pbt: number;
  tax: [number, number];
  prev: number;
  cur: number;
  dep: number;
  interest: number;
  n: number;
  rate: number;
  red: number;
  sp0: number;
  wc: Record<'inv' | 'tr' | 'tp', [number, number]>;
  asked: 'inv' | 'tr' | 'tp';
}
const opCashFigures = (s: OpCash) => {
  const loss = s.n * s.red;
  const charged = loss - Math.min(loss, s.sp0);
  const pat = s.pbt - s.tax[1];
  const surplus1 = s.surplus0 + pat - s.prev;
  const op = s.pbt + s.dep + s.interest + charged;
  const wc = -(s.wc.inv[1] - s.wc.inv[0]) - (s.wc.tr[1] - s.wc.tr[0]) + (s.wc.tp[1] - s.wc.tp[0]);
  const cgo = op + wc;
  return { loss, charged, pat, surplus1, op, wc, cgo, net: cgo - s.tax[0] };
};
function drawOpCash(rng: Rng): OpCash | null {
  const { co, trade } = firm(rng);
  const pbt = rng.step(600000, 2500000, 20000);
  const made = Math.round((pbt * rng.pick([25, 30])) / 100 / 5000) * 5000;
  const n = rng.step(2000, 10000, 1000);
  const red = rng.pick([5, 10]);
  const loss = n * red;
  const sp0 = rng.int(0, 2) === 0 ? 0 : Math.floor((loss * rng.pick([0.25, 0.4, 0.5, 0.6])) / 1000) * 1000;
  const k = (min: number, max: number, step: number): number => rng.step(min, max, step);
  const pair = (min: number, max: number): [number, number] => {
    const a = k(min, max, 5000);
    return [a, a + rng.pick([-1, 1]) * k(10000, 80000, 5000)];
  };
  const s: OpCash = {
    co, trade, surplus0: k(300000, 1500000, 10000), pbt, tax: [made + rng.pick([-3, -2, -1, 1, 2, 3]) * 5000, made], prev: k(50000, 300000, 10000), cur: k(50000, 300000, 10000),
    dep: k(80000, 400000, 5000), interest: k(40000, 250000, 5000), n, rate: rng.pick(D.RATES), red, sp0,
    wc: { inv: pair(200000, 900000), tr: pair(150000, 800000), tp: pair(150000, 700000) }, asked: rng.pick(['inv', 'tr', 'tp'] as const),
  };
  const f = opCashFigures(s);
  if (f.charged <= 0 || f.surplus1 <= 0 || f.net <= 0 || s.tax[0] < 15000 || s.prev === s.cur) return null;
  return s;
}
const opCashText = (s: OpCash): string => {
  const f = opCashFigures(s);
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. From its books for the year ended ${Y1}:`,
    twoDates(OPC.surplus, s.surplus0, f.surplus1),
    twoDates(OPC.tax, s.tax[0], s.tax[1]),
    twoDates(OPC.inv, s.wc.inv[0], s.wc.inv[1]),
    twoDates(OPC.tr, s.wc.tr[0], s.wc.tr[1]),
    twoDates(OPC.tp, s.wc.tp[0], s.wc.tp[1]),
    `Depreciation charged for the year: ${inr(s.dep)}`,
    `Interest on all its debentures for the year, all of it paid during the year: ${inr(s.interest)}`,
    `During the year it issued, besides the debentures it already had, ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each at par, redeemable at a premium of ${s.red}% after five years. The whole loss on the issue was debited to ${D.LOSS_AC} and written off on ${Y1}: first from Securities Premium, which ${s.sp0 > 0 ? `had a balance of ${inr(s.sp0)}` : 'had no balance'}, and then from the Statement of Profit and Loss.`,
    `The dividend of ${inr(s.prev)} proposed for ${PREV} was declared and paid during ${YEAR}; a dividend of ${inr(s.cur)} has been proposed for ${YEAR}. No transfer was made to reserves, and nothing more is known about tax.`,
  ].join('\n');
};
function opCashIn(text: string) {
  const f = datesIn(text);
  const get = (label: string): [number, number] => f.get(label) ?? [NaN, NaN];
  const issue = /already had, ([\d,]+), \d+% Debentures of ₹100 each at par, redeemable at a premium of (\d+)%/.exec(text);
  const loss = issue ? Number(issue[1].replace(/,/g, '')) * Number(issue[2]) : NaN;
  const sp0 = text.includes('which had no balance') ? 0 : afterWords(text, 'which had a balance of ₹');
  const surplus = get(OPC.surplus);
  const tax = get(OPC.tax);
  const prev = afterWords(text, 'The dividend of ₹');
  const npbt = surplus[1] - surplus[0] + tax[1] + prev;
  const charged = Math.max(0, loss - sp0);
  const op = npbt + lineIn(text, 'Depreciation charged for the year') + lineIn(text, 'Interest on all its debentures for the year, all of it paid during the year') + charged;
  const up = (label: string): number => get(label)[1] - get(label)[0];
  const cgo = op - up(OPC.inv) - up(OPC.tr) + up(OPC.tp);
  return { charged, npbt, op, net: cgo - tax[0], get };
}
const opCashLabel: Record<OpCash['asked'], string> = { inv: OPC.inv, tr: OPC.tr, tp: OPC.tp };

function opCashCharged(s: OpCash): NumericParts | null {
  const f = opCashFigures(s);
  const n = money(f.charged, [
    [f.loss, 'Charged the whole loss to the Statement of Profit and Loss; Securities Premium is used first.'],
    s.sp0 > 0 && [s.sp0, 'Gave the part written off against Securities Premium.'],
    [f.loss / 5, 'Spread the loss over the five years of the debentures; it is written off in the year of allotment.'],
    [s.n * 100 + f.loss, 'Took the whole amount payable on redemption as the loss.'],
  ]);
  return n && {
    prompt: `What part of the loss on the issue of the debentures was written off to the Statement of Profit and Loss?`,
    ...n,
    explanation: [`Loss on issue = premium payable on redemption = ${cnt(s.n)} x ${inr(s.red)} = ${inr(f.loss)}.`, s.sp0 > 0 ? `Securities Premium bears ${inr(s.sp0)}; the rest, ${inr(f.loss)} - ${inr(s.sp0)} = ${inr(f.charged)}, is charged to the Statement of Profit and Loss.` : `Securities Premium has no balance, so the whole ${inr(f.loss)} is charged to the Statement of Profit and Loss.`],
    hints: D.H.writeOff,
  };
}
const opCashChargedHolds = (q: NumericQuestion): boolean => q.answer === rupees(opCashIn(q.context ?? '').charged);

function opCashTreatment(s: OpCash): McqParts | null {
  const f = opCashFigures(s);
  return choice(
    `How is the ${inr(f.charged)} of the loss written off to the Statement of Profit and Loss treated in the operating activities?`,
    'Added back to the net profit before tax: it is a non-cash charge',
    [
      ['Deducted from the net profit before tax, as a loss', 'Treated the write-off as a cash loss; no cash went out when it was written off.'],
      ['Shown as an outflow under financing activities', 'Took the write-off for a payment to the debentureholders; the premium will be paid only on redemption.'],
      ['Left alone: it is already in the profit', 'Forgot that the profit was reduced by a charge that moved no cash: it has to be added back.'],
      ['Added to the working capital changes, as an increase in a liability', 'Took the write-off for a working capital item; it is a non-cash charge against profit.'],
    ],
    `The loss on issue of debentures was charged to the profit without any cash going out (the premium is paid only when the debentures are redeemed), so ${inr(f.charged)} is added back to the net profit before tax, like depreciation.`,
    ['Ask whether cash went out when the item was charged against the profit.', 'Non-cash charges are added back to the net profit before tax.'],
  );
}
const opCashTreatmentHolds = (q: McqQuestion): boolean => opCashIn(q.context ?? '').charged > 0 && optionText(q).startsWith('Added back to the net profit before tax');

function opCashNpbt(s: OpCash): NumericParts | null {
  const f = opCashFigures(s);
  const change = f.surplus1 - s.surplus0;
  const n = money(s.pbt, [
    [change, 'Stopped at the change in Surplus; the tax and the dividend taken out of the profit have to be added back.'],
    [change + s.tax[1], 'Left out the dividend paid out of Surplus during the year.'],
    [change + s.tax[1] + s.prev + s.cur, `Added back the dividend proposed for ${YEAR} too; it is not accounted for until it is declared.`],
    [change + s.tax[0] + s.prev, 'Added back the opening provision for tax; with nothing more known, the provision made is the closing one.'],
  ]);
  return n && {
    prompt: `What is the net profit before tax and extraordinary items of ${s.co} for ${YEAR}?`,
    ...n,
    explanation: [
      `Change in Surplus = ${inr(f.surplus1)} - ${inr(s.surplus0)} = ${signed(change)}.`,
      `Nothing more is known about tax, so the provision made is the closing provision, ${inr(s.tax[1])}: added back.`,
      `The dividend of ${PREV} paid out of Surplus, ${inr(s.prev)}: added back.`,
      `${CF_CASE.NPBT} = ${signed(change)} + ${inr(s.tax[1])} + ${inr(s.prev)} = ${inr(s.pbt)}.`,
    ],
    hints: CF_CASE.H.npbt,
  };
}
const opCashNpbtHolds = (q: NumericQuestion): boolean => q.answer === rupees(opCashIn(q.context ?? '').npbt);

function opCashOperating(s: OpCash): NumericParts | null {
  const f = opCashFigures(s);
  const n = money(f.op, [
    [f.op - f.charged, 'Did not add back the loss on issue written off to profit, a non-cash charge.'],
    [f.op - s.interest, 'Did not add back the interest on debentures; for a company that is not a financing company it is a financing outflow.'],
    [f.op + Math.min(f.loss, s.sp0), 'Added back the part written off against Securities Premium too; it never reached the profit.'],
    [f.op - s.dep, 'Did not add back the depreciation.'],
  ]);
  return n && {
    prompt: 'What is the operating profit before working capital changes?',
    ...n,
    explanation: [
      `${CF_CASE.NPBT} ${inr(s.pbt)}, add back: depreciation ${inr(s.dep)}, interest on debentures ${inr(s.interest)} (a financing outflow), loss on issue of debentures written off ${inr(f.charged)} (non-cash).`,
      `${CF_CASE.OP_PROFIT} = ${inr(s.pbt)} + ${inr(s.dep)} + ${inr(s.interest)} + ${inr(f.charged)} = ${inr(f.op)}.`,
    ],
    hints: ['Add back to the profit what was charged without cash going out, and what belongs to the financing or investing activities.', 'Only the part of the loss charged to the profit is added back.'],
  };
}
const opCashOperatingHolds = (q: NumericQuestion): boolean => q.answer === rupees(opCashIn(q.context ?? '').op);

function opCashNet(s: OpCash): NumericParts | null {
  const f = opCashFigures(s);
  const moves = (['inv', 'tr', 'tp'] as const).map((key) => {
    const [a, b] = s.wc[key];
    const sign = key === 'tp' ? 1 : -1;
    return `${opCashLabel[key]} ${b > a ? 'rose' : 'fell'} by ${inr(Math.abs(b - a))}: ${sign * (b - a) > 0 ? 'added' : 'deducted'}`;
  });
  const n = money(f.net, [
    [f.cgo, 'Left out the tax paid.'],
    [f.cgo - s.tax[1], 'Deducted the closing provision for tax as the tax paid; with nothing more known, the tax paid is the opening provision.'],
    [f.net - 2 * f.wc, 'Took every working capital change the wrong way round.'],
    [f.op - s.tax[0], 'Left out the working capital changes.'],
  ]);
  return n && {
    prompt: `What is the net cash from operating activities of ${s.co} for ${YEAR}?`,
    ...n,
    explanation: [
      `${moves.join('; ')}. Working capital changes = ${signed(f.wc)}.`,
      `${CF_CASE.CGO} = ${inr(f.op)} ${f.wc < 0 ? '-' : '+'} ${inr(Math.abs(f.wc))} = ${inr(f.cgo)}.`,
      `Income tax paid = the opening provision, ${inr(s.tax[0])}, as nothing more is known about tax.`,
      `Net cash from operating activities = ${inr(f.cgo)} - ${inr(s.tax[0])} = ${inr(f.net)}.`,
    ],
    hints: ['A rise in a current asset is deducted, a rise in a current liability added; a fall the other way.', 'With nothing more known about tax, the tax paid is the opening provision.'],
  };
}
const opCashNetHolds = (q: NumericQuestion): boolean => q.answer === rupees(opCashIn(q.context ?? '').net);

function opCashChange(s: OpCash): NumericParts | null {
  const label = opCashLabel[s.asked];
  const [a, b] = s.wc[s.asked];
  const up = b > a;
  const change = Math.abs(b - a);
  const n = percent([change, a], [
    [[change, b], `Divided the change by the figure of ${Y1}; the base is the earlier figure.`],
    [[b, a], 'Gave the later figure as a percentage of the earlier one; the change has to be taken first.'],
    [[change, opCashFigures(s).op], 'Divided the change by the operating profit; a percentage change is worked on the line itself.'],
  ]);
  return n && {
    prompt: `By what percentage did ${lower(label)} ${up ? 'rise' : 'fall'} during the year? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [`${label}: ${inr(b)} - ${inr(a)} = ${up ? '' : '-'}${inr(change)}.`, `Percentage change = ${inr(change)} ÷ ${inr(a)} × 100 = ${pc(n.answer)}${up ? '' : ', a decrease'}.`],
    hints: H.change,
  };
}
const opCashChangeHolds = (q: NumericQuestion): boolean => {
  const t = opCashIn(q.context ?? '');
  const label = [OPC.inv, OPC.tr, OPC.tp].find((l) => q.prompt.includes(`did ${lower(l)} `));
  if (!label) return false;
  const [a, b] = t.get(label);
  return q.prompt.includes(b > a ? ' rise during' : ' fall during') && nearPercent(q.answer, [Math.abs(b - a), a]);
};

const opCashMakers = [opCashCharged, opCashTreatment, opCashNpbt, opCashOperating, opCashNet, opCashChange];
const caseOpCash = caseTemplate<OpCash>({
  id: 'case-cy-profit-to-operating-cash',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'From Surplus to the cash from operations',
  setup: (rng) => firstGood(40, () => drawOpCash(rng), (s) => opCashMakers.every((m) => m(s) !== null)),
  context: opCashText,
  parts: [
    { kind: 'numeric', unit: 'rupees', make: opCashCharged, verify: opCashChargedHolds },
    { kind: 'mcq', make: opCashTreatment, verify: opCashTreatmentHolds },
    { kind: 'numeric', unit: 'rupees', make: opCashNpbt, verify: opCashNpbtHolds },
    { kind: 'numeric', unit: 'rupees', make: opCashOperating, verify: opCashOperatingHolds },
    { kind: 'numeric', unit: 'rupees', make: opCashNet, verify: opCashNetHolds },
    { kind: 'numeric', unit: 'percent', make: opCashChange, verify: opCashChangeHolds },
  ],
});

// ===============================================================================================================
// CHAINED CASES: a set of entries or a format, then what follows from it. Every long part is checked another way:
// a set by the balances its entries leave, a statement by the books of the case posted again.
// ===============================================================================================================

/** The figure of a row of a statement by its particulars, in paise (the last column); 0 when there is no such row. */
const figureOf = (q: StatementQuestion, label: string): number => q.rows.find((r) => r.label === label)?.amounts.at(-1) ?? 0;
/** The figures of the sub-totals of a statement, in order (the last column). */
const subtotalsOf = (q: StatementQuestion): number[] => (q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line.amounts.at(-1) ?? 0] : []));
/** What the entries of a set leave in each account, in rupees: debits less credits, on top of an opening ledger in paise. */
const leftAfter = (lines: readonly JournalLine[][], opening?: Map<string, number>): ((accountId: string) => number) => {
  const ledger = post([...lines], opening);
  return (accountId) => (ledger.get(accountId) ?? 0) / 100;
};
/** "To Bank A/c ₹50,000" style working is not needed here; a short "a x b = c" is. */
type Row = FormatRowParts | StatementLineParts;

// ---------------------------------------------------------------------------------------------------------------
// 17. case-cy-chain-arrears-to-sheet: a holder who had not paid the final call of an earlier issue (shown in Calls in
//     Arrears) is forfeited, part or all of the shares reissued at a discount within the amount forfeited (or at
//     par), and debentures are issued for cash at par or at a premium. The set of the year's entries, then the
//     balance sheet extract with its three notes, then the debt to equity and proprietary ratios.
// ---------------------------------------------------------------------------------------------------------------

interface ArrearsSheet {
  co: string;
  trade: string;
  /** Shares in issue (all called up), the face value, the holder in arrears, the call unpaid on each of the holder's shares. */
  n0: number;
  face: number;
  who: string;
  k: number;
  call: number;
  j: number;
  price: number;
  sp0: number;
  gr: number;
  surplus0: number;
  profit: number;
  loan: number;
  nDeb: number;
  rate: number;
  prem: number;
  dates: [string, string, string, string];
  ta: number;
  transactions: SetTransaction[];
}
const arrearsSheetFigures = (s: ArrearsSheet) => {
  const per = s.face - s.call;
  const gain = s.j * per - s.j * (s.face - s.price);
  const capital = (s.n0 - s.k + s.j) * s.face;
  const held = (s.k - s.j) * per;
  const sp = s.sp0 + s.nDeb * s.prem;
  const surplus = s.surplus0 + s.profit;
  const reserves = gain + sp + s.gr + surplus;
  const debt = s.loan + s.nDeb * 100;
  return { per, gain, capital, held, sc: capital + held, sp, surplus, reserves, sf: capital + held + reserves, debt };
};
function drawArrearsSheet(rng: Rng): ArrearsSheet | null {
  const { co, trade } = firm(rng);
  const face = rng.pick([10, 10, 100]);
  const call = (face * rng.pick([2, 3, 4])) / 10;
  const n0 = face === 10 ? rng.step(100000, 500000, 10000) : rng.step(10000, 50000, 1000);
  const k = rng.step(200, Math.max(200, Math.floor(n0 / 50 / 100) * 100), 100);
  const per = face - call;
  const room = Math.min(Math.ceil((per * 10) / face) - 1, 4);
  const j = rng.int(0, 2) === 0 ? k : S.partOf(rng, k);
  const price = rng.int(0, 3) === 0 ? face : face - (face / 10) * rng.int(1, room);
  if (room < 1 || j * per - j * (face - price) <= 0) return null;
  const nDeb = rng.step(2000, 15000, 1000);
  const prem = rng.pick([0, 0, 5, 10]);
  const months = setDays(rng, 3, 1, 10).map((m) => D.monthIn(2025, m - 1));
  const days = [rng.int(1, 28), rng.int(1, 28), rng.int(1, 28)];
  const d = [`${days[0]} ${months[0]}`, `${days[1]} ${months[1]}`, `${days[2]} ${months[2]}`];
  const s: ArrearsSheet = {
    co, trade, n0, face, who: rng.pick(S.HOLDERS), k, call, j, price, sp0: rng.int(0, 2) === 0 ? 0 : rng.step(50000, 400000, 10000), gr: rng.step(100000, 800000, 10000),
    surplus0: rng.step(200000, 1500000, 10000), profit: rng.step(150000, 900000, 10000), loan: rng.int(0, 1) === 0 ? 0 : rng.step(500000, 2000000, 100000),
    nDeb, rate: rng.pick(D.RATES), prem, dates: [d[0], d[1], d[1], d[2]], ta: 0, transactions: [],
  };
  const f = arrearsSheetFigures(s);
  s.ta = Math.round(((f.sf + f.debt) * 100) / rng.pick([75, 80, 85, 90]) / 10000) * 10000;
  const capital = S.capitalId('equity');
  const debPrice = 100 + prem;
  const raised = nDeb * debPrice;
  s.transactions = [
    D.on(s.dates[0], `${s.who}'s shares forfeited for non-payment of the final call.`, S.entry(S.dr(capital, k * face), S.cr('forfeitedShares', k * per), S.cr('callsInArrears', k * call)), [
      `The ${cnt(k)} shares are fully called up: ${S.ac(capital)} is debited with ${cnt(k)} x ${inr(face)} = ${inr(k * face)}.`,
      `${s.who} had paid ${inr(per)} a share: Forfeited Shares A/c is credited with ${cnt(k)} x ${inr(per)} = ${inr(k * per)}.`,
      `The unpaid call, ${cnt(k)} x ${inr(call)} = ${inr(k * call)}, is taken out of Calls in Arrears A/c, which is credited.`,
    ]),
    D.on(s.dates[1], `${j === k ? 'All the' : `${cnt(j)} of the`} forfeited shares reissued as fully paid.`, S.entry(S.dr('bank', j * s.price), S.dr('forfeitedShares', j * (face - s.price)), S.cr(capital, j * face)), [
      `Money received = ${cnt(j)} x ${inr(s.price)} = ${inr(j * s.price)}: Bank A/c is debited.`,
      `${S.ac(capital)} is credited with the face value, ${cnt(j)} x ${inr(face)} = ${inr(j * face)}.`,
      s.price < face ? `The discount, ${cnt(j)} x ${inr(face - s.price)} = ${inr(j * (face - s.price))}, is met from Forfeited Shares A/c, which is debited; it is within the ${inr(per)} a share forfeited.` : 'They fetch their face value: there is no discount.',
    ]),
    D.on(s.dates[2], 'Gain on the reissue transferred to Capital Reserve.', [S.dr('forfeitedShares', f.gain), S.cr('capitalReserve', f.gain)], [
      s.price < face
        ? `Forfeited on the ${cnt(j)} shares reissued = ${cnt(j)} x ${inr(per)} = ${inr(j * per)}; less the discount allowed, ${inr(j * (face - s.price))}: gain = ${inr(f.gain)}.`
        : `Forfeited on the ${cnt(j)} shares reissued = ${cnt(j)} x ${inr(per)} = ${inr(j * per)}; no discount was allowed, so all of it is the gain.`,
      'The gain is a capital profit: Forfeited Shares A/c is debited and Capital Reserve A/c credited.',
    ]),
    D.on(s.dates[3], 'Applications received for the debentures, with the full issue price.', [S.dr('bank', raised), S.cr(D.DAA, raised)], [
      `${cnt(nDeb)} x ${inr(debPrice)} = ${inr(raised)} received: Bank A/c is debited.`,
      'Until allotment it is application money: Debenture Application and Allotment A/c is credited.',
    ]),
    D.on(s.dates[3], 'Debentures allotted.', D.allotmentLines({ n: nDeb, rate: s.rate, face: 100, prem, disc: 0, red: 0 }, D.DAA, raised), [
      'Debenture Application and Allotment A/c is debited and so closed.',
      ...D.allotmentSteps({ n: nDeb, rate: s.rate, face: 100, prem, disc: 0, red: 0 }),
    ]),
  ];
  return s;
}
const arrearsSheetText = (s: ArrearsSheet): string => {
  return [
    `${s.co}, ${s.trade}, closes its books on 31 March. On 1 April 2025 it had ${cnt(s.n0)} equity shares of ${inr(s.face)} each, issued at par in an earlier year and fully called up. ${s.who}, who holds ${cnt(s.k)} of them, had not paid the final call of ${inr(s.call)} a share, which stood in Calls in Arrears A/c. Its reserves then were: ${s.sp0 > 0 ? `Securities Premium ${inr(s.sp0)}, ` : ''}General Reserve ${inr(s.gr)} and Surplus ${inr(s.surplus0)}.${s.loan > 0 ? ` It owed a long-term bank loan of ${inr(s.loan)}.` : ''}`,
    `${s.dates[0]}: ${s.who}'s shares were forfeited.`,
    `${s.dates[1]}: ${s.j === s.k ? 'All of them were' : `${cnt(s.j)} of them were`} reissued at ${inr(s.price)} a share as fully paid, and the gain was transferred to Capital Reserve.`,
    `${s.dates[3]}: ${cnt(s.nDeb)}, ${s.rate}% Debentures of ₹100 each were issued for cash ${s.prem > 0 ? `at a premium of ${s.prem}%` : 'at par'}, the whole price payable with the application, and allotted; all money was received.`,
    `The profit for the year, ${inr(s.profit)}, was all kept in Surplus. ${s.loan > 0 ? 'Nothing was repaid on the loan. ' : ''}On ${Y1} the total assets were ${inr(s.ta)}.`,
    "All money is received through the bank. A line of the balance sheet or its notes that comes to nil is left out.",
  ].join('\n');
};
const arrearsSheetKept = keeper<ArrearsSheet>();
/** The books of the year: the opening balances that the entries touch, then the entries. */
function arrearsSheetLedger(s: ArrearsSheet): (accountId: string) => number {
  const opening = new Map<string, number>([
    [S.capitalId('equity'), -rupees(s.n0 * s.face)],
    ['callsInArrears', rupees(s.k * s.call)],
    ...(s.sp0 > 0 ? ([['securitiesPremium', -rupees(s.sp0)]] as [string, number][]) : []),
  ]);
  return leftAfter(s.transactions.map((t) => t.lines), opening);
}

const arrearsSheetSet = (s: ArrearsSheet): CaseSetParts => ({
  task: 'Pass the journal entries for the forfeiture, the reissue, the transfer to Capital Reserve and the issue of the debentures.',
  transactions: s.transactions,
  hints: [S.H.forfeit[0], 'Debentures are credited with their nominal value; a premium on their issue goes to Securities Premium A/c.'],
  distractorAccounts: ['securitiesPremium', 'equityShareFirstAndFinalCall', 'generalReserve', 'debentureApplication', debentures(s.rate)],
});
const arrearsSheetSetHolds = (q: JournalSetQuestion): boolean => {
  const s = arrearsSheetKept.of(q.context ?? '');
  if (!s) return false;
  const f = arrearsSheetFigures(s);
  const left = leftAfter(q.entries.map((e) => e.expected), new Map([['callsInArrears', rupees(s.k * s.call)]]));
  return (
    left('callsInArrears') === 0 &&
    left(D.DAA) === 0 &&
    left('capitalReserve') === -f.gain &&
    left('forfeitedShares') === -f.held &&
    left(debentures(s.rate)) === -s.nDeb * 100 &&
    left('bank') === s.j * s.price + s.nDeb * (100 + s.prem)
  );
};

function arrearsSheetStatement(s: ArrearsSheet): CaseStatementParts | null {
  const f = arrearsSheetFigures(s);
  const shares = s.n0 - s.k + s.j;
  const rows: Row[] = [
    { heading: 'I. EQUITY AND LIABILITIES' },
    { heading: "1. Shareholders' funds" },
    { label: 'Share capital', amount: rupees(f.sc), note: '1' },
    { label: 'Reserves and surplus', amount: rupees(f.reserves), note: '2' },
    { heading: '2. Non-current liabilities' },
    { label: 'Long-term borrowings', amount: rupees(f.debt), note: '3' },
    { heading: 'Note 1: Share capital' },
    { label: 'Subscribed and fully paid', amount: rupees(f.capital), details: [`${cnt(shares)} equity shares of ${inr(s.face)} each`] },
    ...(f.held > 0 ? [{ label: 'Forfeited shares (amount originally paid up)', amount: rupees(f.held), details: [`On ${cnt(s.k - s.j)} shares not yet reissued`] }] : []),
    { subtotal: 'Total share capital', amount: rupees(f.sc), sum: 'section' },
    { heading: 'Note 2: Reserves and surplus' },
    { label: 'Capital reserve', amount: rupees(f.gain) },
    ...(f.sp > 0 ? [{ label: 'Securities premium', amount: rupees(f.sp) }] : []),
    { label: 'General reserve', amount: rupees(s.gr) },
    { label: 'Surplus (balance in Statement of Profit and Loss)', amount: rupees(f.surplus) },
    { subtotal: 'Total reserves and surplus', amount: rupees(f.reserves), sum: 'section' },
    { heading: 'Note 3: Long-term borrowings' },
    { label: `${s.rate}% Debentures`, amount: rupees(s.nDeb * 100), details: [`${cnt(s.nDeb)} debentures of ₹100 each`] },
    ...(s.loan > 0 ? [{ label: 'Long-term loan from a bank', amount: rupees(s.loan) }] : []),
    { subtotal: 'Total long-term borrowings', amount: rupees(f.debt), sum: 'section' },
  ];
  return {
    task: `Show the shareholders' funds and the long-term borrowings of ${s.co} in its Balance Sheet as at ${Y1}, with Note 1 (Share capital), Note 2 (Reserves and surplus) and Note 3 (Long-term borrowings).`,
    title: `Balance Sheet of ${s.co} as at ${Y1} (extract), with its notes`,
    noteHeading: 'Note No.',
    rows,
    distractors: ['Calls in arrears', 'Subscribed but not fully paid', 'Other long-term liabilities', 'Short-term borrowings', 'Debenture application and allotment', ...(f.held > 0 ? [] : ['Forfeited shares (amount originally paid up)']), ...(f.sp > 0 ? [] : ['Securities premium'])],
    explanation: [
      `Shares in issue = ${cnt(s.n0)} - ${cnt(s.k)} forfeited + ${cnt(s.j)} reissued = ${cnt(shares)}, all fully paid: ${cnt(shares)} x ${inr(s.face)} = ${inr(f.capital)}. Calls in arrears are gone: the forfeiture cleared them.`,
      f.held > 0 ? `Forfeited shares: ${cnt(s.k - s.j)} shares not yet reissued x ${inr(f.per)} = ${inr(f.held)}, added to the share capital.` : 'Every forfeited share was reissued, so nothing is left in Forfeited Shares A/c.',
      `Reserves and surplus: Capital reserve ${inr(f.gain)}${f.sp > 0 ? `, Securities premium ${s.sp0 > 0 && s.prem > 0 ? `${inr(s.sp0)} + ${inr(s.nDeb * s.prem)} on the debentures = ` : s.prem > 0 ? 'on the debentures ' : ''}${inr(f.sp)}` : ''}, General reserve ${inr(s.gr)}, Surplus ${inr(s.surplus0)} + ${inr(s.profit)} = ${inr(f.surplus)}; total ${inr(f.reserves)}.`,
      `Long-term borrowings: the debentures at their nominal value, ${inr(s.nDeb * 100)}${s.loan > 0 ? `, and the bank loan, ${inr(s.loan)}` : ''}; total ${inr(f.debt)}.`,
    ],
    hints: ['Share capital in the balance sheet = shares in issue at their paid-up value + the balance of Forfeited Shares A/c.', 'Debentures stand at their nominal value under long-term borrowings; a premium on their issue is a reserve.'],
  };
}
const arrearsSheetStatementHolds = (q: StatementQuestion): boolean => {
  const s = arrearsSheetKept.of(q.context ?? '');
  if (!s) return false;
  const left = arrearsSheetLedger(s);
  const capital = -left(S.capitalId('equity')) - left('forfeitedShares');
  const reserves = -left('capitalReserve') - left('securitiesPremium') + s.gr + s.surplus0 + s.profit;
  const [sc, rs, ltb] = subtotalsOf(q);
  return (
    left('callsInArrears') === 0 &&
    figureOf(q, 'Share capital') === rupees(capital) && sc === rupees(capital) &&
    figureOf(q, 'Reserves and surplus') === rupees(reserves) && rs === rupees(reserves) &&
    figureOf(q, 'Long-term borrowings') === rupees(-left(debentures(s.rate)) + s.loan) && ltb === figureOf(q, 'Long-term borrowings')
  );
};

function arrearsSheetDebtEquity(s: ArrearsSheet): NumericParts | null {
  const f = arrearsSheetFigures(s);
  const n = times([f.debt, f.sf], [
    [[f.sf, f.debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[f.debt, f.sc], "Divided by the share capital alone; reserves and surplus are part of the shareholders' funds."],
    f.held > 0 && [[f.debt, f.sf - f.held], 'Left the balance of Forfeited Shares A/c out of the share capital.'],
    s.loan > 0 && [[s.nDeb * 100, f.sf], 'Left the bank loan out of the debt.'],
  ]);
  return n && {
    prompt: `Starting from the balance sheet extract, find the debt to equity ratio as at ${Y1}, debt being long-term borrowings and equity shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [`Shareholders' funds = ${inr(f.sc)} + ${inr(f.reserves)} = ${inr(f.sf)}.`, `Debt to equity ratio = ${inr(f.debt)} ÷ ${inr(f.sf)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const arrearsSheetDebtEquityHolds = (q: NumericQuestion): boolean => {
  const s = arrearsSheetKept.of(q.context ?? '');
  if (!s) return false;
  const left = arrearsSheetLedger(s);
  const sf = -left(S.capitalId('equity')) - left('forfeitedShares') - left('capitalReserve') - left('securitiesPremium') + s.gr + s.surplus0 + s.profit;
  return nearTimes(q.answer, [-left(debentures(s.rate)) + s.loan, sf]);
};

function arrearsSheetProprietary(s: ArrearsSheet): NumericParts | null {
  const f = arrearsSheetFigures(s);
  const n = times([f.sf, s.ta], [
    [[s.ta, f.sf], "Divided the total assets by the shareholders' funds: the ratio is upside down."],
    [[f.sf + f.debt, s.ta], "Counted the long-term borrowings in the shareholders' funds."],
    [[f.sc, s.ta], "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
    [[f.sf, s.ta - f.sf], 'Divided by the outside liabilities; the proprietary ratio is on total assets.'],
  ]);
  return n && {
    prompt: `Find the proprietary ratio as at ${Y1}, worked on total assets (shareholders' funds ÷ total assets), ${AS_RATIO}.`,
    ...n,
    explanation: [`Proprietary ratio = ${inr(f.sf)} ÷ ${inr(s.ta)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const arrearsSheetProprietaryHolds = (q: NumericQuestion): boolean => {
  const s = arrearsSheetKept.of(q.context ?? '');
  if (!s) return false;
  const left = arrearsSheetLedger(s);
  const sf = -left(S.capitalId('equity')) - left('forfeitedShares') - left('capitalReserve') - left('securitiesPremium') + s.gr + s.surplus0 + s.profit;
  return nearTimes(q.answer, [sf, afterWords(q.context ?? '', 'the total assets were ₹')]);
};

const arrearsSheetNumbers = [arrearsSheetDebtEquity, arrearsSheetProprietary];
const caseChainArrearsSheet = caseTemplate<ArrearsSheet>({
  id: 'case-cy-chain-arrears-to-sheet',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Arrears forfeited, debentures issued, the balance sheet',
  setup: (rng) =>
    firstGood(30, () => drawArrearsSheet(rng), (s) => {
      const ok = arrearsSheetNumbers.every((m) => m(s) !== null) && arrearsSheetStatement(s) !== null;
      if (ok) arrearsSheetKept.keep(arrearsSheetText(s), s);
      return ok;
    }),
  context: arrearsSheetText,
  parts: [
    { kind: 'journal_set', make: arrearsSheetSet, verify: arrearsSheetSetHolds },
    { kind: 'statement', make: arrearsSheetStatement, verify: arrearsSheetStatementHolds },
    { kind: 'numeric', unit: 'times', make: arrearsSheetDebtEquity, verify: arrearsSheetDebtEquityHolds },
    { kind: 'numeric', unit: 'times', make: arrearsSheetProprietary, verify: arrearsSheetProprietaryHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 18. case-cy-chain-vendor-interest: a business bought and paid for in debentures (at par, at a premium, or at a
//     discount that Securities Premium bears), in a year in which an older borrowing carries interest all year. The
//     set of the entries (the takeover, the allotment, the interest due and paid, its transfer, any write-off), then
//     the notes on long-term borrowings and on finance costs, then the interest coverage ratio.
// ---------------------------------------------------------------------------------------------------------------

interface VendorYear {
  co: string;
  trade: string;
  v: string;
  tk: ReturnType<typeof D.drawTakeover> & object;
  i: { n: number; rate: number; face: number; prem: number; disc: number; red: number };
  month: string;
  months: number;
  date: string;
  old: { what: 'debentures' | 'loan'; rate: number; amount: number };
  sp0: number;
  pbt: number;
  transactions: SetTransaction[];
  interest: number;
}
const vendorYearOldInterest = (s: VendorYear): number => (s.old.amount * s.old.rate) / 100;
const vendorYearOldLabel = (s: VendorYear): string => (s.old.what === 'debentures' ? `${s.old.rate}% Debentures (issued in an earlier year)` : `${s.old.rate}% Long-term loan from a bank`);
function drawVendorYear(rng: Rng): VendorYear | null {
  const { co, trade } = firm(rng);
  const when = rng.pick(D.ISSUE_DATES.filter((d) => !d.nextYear));
  const at = rng.pick(['par', 'premium', 'discount'] as const);
  const n = rng.step(3000, 12000, 500);
  const rate = D.wholeRate(rng, n * 100, [when.months, Math.max(1, when.months - 6), Math.min(6, when.months)]);
  if (rate === null) return null;
  const i = { n, rate, face: 100, prem: at === 'premium' ? rng.pick([5, 10]) : 0, disc: at === 'discount' ? rng.pick([5, 10]) : 0, red: 0 };
  const price = 100 + i.prem - i.disc;
  const tk = D.drawTakeover(rng, n * price);
  if (!tk) return null;
  const v = rng.pick(D.VENDORS);
  const date = `1 ${when.month} 2025`;
  // Securities Premium always bears the whole discount here, so that the finance costs are interest alone.
  const sp0 = i.disc > 0 ? Math.ceil((n * i.disc) / 10000) * 10000 + rng.step(10000, 200000, 10000) : rng.int(0, 1) * rng.step(20000, 200000, 10000);
  const old = { what: rng.pick(['debentures', 'loan'] as const), rate: rng.pick(D.RATES.filter((r) => r !== rate)), amount: rng.step(500000, 2500000, 100000) };
  const { txs, closing, total } = D.interestTxs(2025, rate, n * 100, when.months, date);
  const transactions: SetTransaction[] = [
    D.on(date, `Business of ${v} taken over.`, S.entry(...tk.assets.map((a) => S.dr(a.id, a.value)), S.dr('goodwill', Math.max(0, tk.diff)), S.cr('creditors', tk.creditors), S.cr(vendor(v), tk.pc), S.cr('capitalReserve', Math.max(0, -tk.diff))), [
      'Each asset taken over is debited at its agreed value; the creditors taken over are credited.',
      `${v} is credited with the purchase consideration, ${inr(tk.pc)}, until it is settled.`,
      D.netWorking(tk),
      tk.diff > 0 ? `The consideration is more than the net assets by ${inr(tk.diff)}: Goodwill A/c is debited.` : `The consideration is less than the net assets by ${inr(-tk.diff)}: Capital Reserve A/c is credited.`,
    ]),
    D.on(date, `Debentures allotted to ${v} in settlement.`, D.allotmentLines(i, vendor(v), tk.pc), [
      `${v} takes each debenture at ${inr(price)}: ${inr(tk.pc)} ÷ ${inr(price)} = ${cnt(n)} debentures. ${v} is debited with ${inr(tk.pc)} and so settled.`,
      ...D.allotmentSteps(i),
    ]),
    ...txs,
    closing,
    ...(i.disc > 0 ? [D.writeOffTx(Y1, n * i.disc, 0, sp0, 0)] : []),
  ];
  const interest = total + (old.amount * old.rate) / 100;
  const pbt = Math.round((interest * rng.pick([150, 200, 250, 300, 400, 500])) / 100 / 10000) * 10000;
  return { co, trade, v, tk, i, month: `${when.month} 2025`, months: when.months, date, old, sp0, pbt, transactions, interest };
}
const vendorYearText = (s: VendorYear): string => {
  const terms = s.i.prem > 0 ? `at a premium of ${s.i.prem}%` : s.i.disc > 0 ? `at a discount of ${s.i.disc}%` : 'at par';
  return [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. Its only borrowing on 1 April 2025 was ${s.old.what === 'debentures' ? `${s.old.rate}% Debentures of ${inr(s.old.amount)}` : `${an(s.old.rate)} ${s.old.rate}% long-term loan of ${inr(s.old.amount)} from a bank`}, on which the interest of the whole year was paid. Its Securities Premium A/c had ${s.sp0 > 0 ? `a balance of ${inr(s.sp0)}` : 'no balance'}.`,
    `On ${s.date} it ${D.tookOver(s.tk, s.v)}, for a purchase consideration of ${inr(s.tk.pc)}, and on the same day settled it by allotting to ${s.v} ${s.i.rate}% Debentures of ₹100 each ${terms}, redeemable at par after five years.`,
    D.INTEREST_CONVENTION,
    ...(s.i.disc > 0 ? [`The discount on the issue is debited to ${D.DISCOUNT_AC} and written off on ${Y1} against Securities Premium.`] : []),
    `The debenture interest of the year is transferred to the Statement of Profit and Loss on ${Y1}. The profit before tax for the year, after all finance costs, was ${inr(s.pbt)}.`,
  ].join('\n');
};
const vendorYearKept = keeper<VendorYear>();

const vendorYearSet = (s: VendorYear): CaseSetParts => ({
  task: `Pass the journal entries for the purchase of the business, the allotment of the debentures${s.i.disc > 0 ? ', their interest for the year and the write-off of the discount' : ' and their interest for the year'}.`,
  transactions: s.transactions,
  hints: [D.H.vendor[1], D.H.interest[1]],
  distractorAccounts: [s.tk.diff > 0 ? 'capitalReserve' : 'goodwill', 'bank', D.DAA, 'interestPaid', s.i.disc > 0 ? 'lossOnIssueOfDebentures' : 'discountOnIssueOfDebentures'],
});
const vendorYearSetHolds = (q: JournalSetQuestion): boolean => {
  const s = vendorYearKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(q.entries.map((e) => e.expected));
  const newInterest = (s.i.n * 100 * s.i.rate * s.months) / 1200;
  return (
    left(vendor(s.v)) === 0 &&
    left(debentures(s.i.rate)) === -s.i.n * 100 &&
    left('debentureInterest') === 0 &&
    left('debentureholders') === 0 &&
    left('bank') === -newInterest &&
    left(D.SPL) === newInterest &&
    left('discountOnIssueOfDebentures') === 0 &&
    left(D.SP) === s.i.n * (s.i.disc - s.i.prem)
  );
};

function vendorYearNotes(s: VendorYear): CaseStatementParts {
  const nominal = s.i.n * 100;
  const newInterest = (nominal * s.i.rate * s.months) / 1200;
  const oldInterest = vendorYearOldInterest(s);
  const rows: Row[] = [
    { heading: 'Note: Long-term borrowings' },
    { label: vendorYearOldLabel(s), amount: rupees(s.old.amount) },
    { label: `${s.i.rate}% Debentures (allotted to a vendor)`, amount: rupees(nominal), details: [`${cnt(s.i.n)} debentures of ₹100 each, allotted for consideration other than cash`] },
    { subtotal: 'Total long-term borrowings', amount: rupees(s.old.amount + nominal), sum: 'section' },
    { heading: 'Note: Finance costs' },
    { label: s.old.what === 'debentures' ? `Interest on ${s.old.rate}% Debentures` : 'Interest on bank loan', amount: rupees(oldInterest) },
    { label: `Interest on ${s.i.rate}% Debentures`, amount: rupees(newInterest), details: [`For ${s.months} months from ${s.date}`] },
    { subtotal: 'Total finance costs', amount: rupees(oldInterest + newInterest), sum: 'section' },
  ];
  return {
    task: `Prepare the notes to accounts of ${s.co} on Long-term borrowings (as at ${Y1}) and on Finance costs (for ${YEAR}).`,
    title: `Notes to Accounts of ${s.co} (extract)`,
    rows,
    distractors: ['Discount on issue of debentures written off', 'Premium on redemption of debentures', 'Creditors taken over', 'Goodwill', 'Capital reserve', 'Securities premium'],
    explanation: [
      `Long-term borrowings: ${vendorYearOldLabel(s).toLowerCase()} ${inr(s.old.amount)}, and the new debentures at their nominal value, ${cnt(s.i.n)} x ₹100 = ${inr(nominal)}, whatever ${s.v} took them at. The note says they were allotted for consideration other than cash.`,
      `Finance costs: interest on the older borrowing for the whole year, ${s.old.rate}% of ${inr(s.old.amount)} = ${inr(oldInterest)}; interest on the new debentures for ${s.months} months, ${inr(newInterest)}.`,
      s.i.disc > 0 ? `The discount on the issue was written off against Securities Premium, so it is not a finance cost of the year.` : `The debentures were issued ${s.i.prem > 0 ? 'at a premium, which went to Securities Premium' : 'at par'}: there is nothing to write off.`,
    ],
    hints: ['Debentures stand at their nominal value under long-term borrowings.', 'Finance costs: interest on every borrowing for the months it was outstanding.'],
  };
}
const vendorYearNotesHolds = (q: StatementQuestion): boolean => {
  const s = vendorYearKept.of(q.context ?? '');
  if (!s) return false;
  // The interest of the new debentures is what the set's closing transfer carried to the Statement of Profit and Loss.
  const left = leftAfter(s.transactions.map((t) => t.lines));
  const [borrowings, costs] = subtotalsOf(q);
  return borrowings === rupees(s.old.amount - left(debentures(s.i.rate))) && costs === rupees(vendorYearOldInterest(s) + left(D.SPL));
};

function vendorYearCover(s: VendorYear): NumericParts | null {
  const n = times([s.pbt + s.interest, s.interest], [
    [[s.pbt, s.interest], 'Divided the profit before tax; the interest has to be added back first.'],
    [[s.pbt + s.interest, vendorYearOldInterest(s)], 'Left the interest on the new debentures out.'],
    [[s.pbt + s.interest, vendorYearOldInterest(s) + (s.i.n * s.i.rate)], 'Took a full year of interest on the new debentures.'],
    [[s.interest, s.pbt + s.interest], 'Divided the interest by the profit: upside down.'],
  ]);
  return n && {
    prompt: `Starting from the finance costs of the note, find the interest coverage ratio of ${s.co} for ${YEAR}, ${IN_TIMES}.`,
    ...n,
    explanation: [`Profit before interest and tax = ${inr(s.pbt)} + ${inr(s.interest)} = ${inr(s.pbt + s.interest)}.`, `Interest coverage ratio = ${inr(s.pbt + s.interest)} ÷ ${inr(s.interest)} = ${dec(n.answer)} times.`],
    hints: ['Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt.', 'Add the interest back to the profit before tax.'],
  };
}
const vendorYearCoverHolds = (q: NumericQuestion): boolean => {
  const s = vendorYearKept.of(q.context ?? '');
  if (!s) return false;
  const interest = vendorYearOldInterest(s) + leftAfter(s.transactions.map((t) => t.lines))(D.SPL);
  return nearTimes(q.answer, [afterWords(q.context ?? '', 'after all finance costs, was ₹') + interest, interest]);
};

const caseChainVendorYear = caseTemplate<VendorYear>({
  id: 'case-cy-chain-vendor-interest',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Debentures for a business, and what they cost',
  setup: (rng) =>
    firstGood(30, () => drawVendorYear(rng), (s) => {
      const ok = vendorYearCover(s) !== null && s.transactions.length <= 8;
      if (ok) vendorYearKept.keep(vendorYearText(s), s);
      return ok;
    }),
  context: vendorYearText,
  parts: [
    { kind: 'journal_set', make: vendorYearSet, verify: vendorYearSetHolds },
    { kind: 'statement', make: vendorYearNotes, verify: vendorYearNotesHolds },
    { kind: 'numeric', unit: 'times', make: vendorYearCover, verify: vendorYearCoverHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 19. case-cy-chain-cash-flow-comparative: the whole balance sheets of two dates of a company that issued shares at a
//     premium during the year (and, in some seeds, more debentures) and redeemed nothing, with what else the year
//     told. The Cash Flow Statement by the indirect method; then the comparative balance sheet of the same two dates,
//     the figures of the dates printed; then the current and quick ratios at the later date.
// ---------------------------------------------------------------------------------------------------------------

const TB = {
  sc: 'Share capital',
  rs: 'Reserves and surplus',
  ltb: 'Long-term borrowings',
  tp: 'Trade payables',
  stp: 'Short-term provisions',
  ppe: 'Property, plant and equipment',
  inv: 'Inventories',
  tr: 'Trade receivables',
  cash: 'Cash and cash equivalents',
} as const;
type TbKey = keyof typeof TB;
const TB_FUNDS: TbKey[] = ['sc', 'rs', 'ltb', 'tp', 'stp'];
const TB_ASSETS: TbKey[] = ['ppe', 'inv', 'tr', 'cash'];
interface CashYear {
  co: string;
  trade: string;
  v: Record<TbKey, [number, number]>;
  sp: [number, number];
  surplus: [number, number];
  shares: number;
  prem: number;
  rate: number;
  fresh: number;
  month: string;
  months: number;
  dep: number;
  bought: number;
  prev: number;
  interest: number;
}
function drawCashYear(rng: Rng): CashYear | null {
  const { co, trade } = firm(rng);
  const k = (min: number, max: number, step: number): number => rng.step(min, max, step);
  const c0 = 10 * k(100000, 400000, 10000);
  const shares = Math.round(((c0 / 10) * rng.pick([20, 25, 30, 40])) / 100 / 5000) * 5000;
  const prem = rng.pick([2, 3, 5, 6, 10]);
  const sp0 = rng.int(0, 1) === 0 ? 0 : k(50000, 300000, 10000);
  const surplus0 = k(300000, 1500000, 10000);
  const pat = k(200000, 900000, 10000);
  const prev = (c0 * rng.pick([5, 8, 10])) / 100;
  const deb0 = k(500000, 2000000, 100000);
  const when = rng.pick(D.ISSUE_DATES);
  const fresh = rng.int(0, 2) === 0 ? 0 : k(200000, 800000, 100000);
  const rate = fresh > 0 ? D.wholeRate(rng, fresh, [when.months]) : rng.pick(D.RATES);
  if (rate === null || (deb0 * rate) % 100 !== 0) return null;
  const interest = (deb0 * rate) / 100 + (fresh * rate * when.months) / 1200;
  const made = Math.max(30000, Math.round(((pat * 100) / 70 - pat) / 5000) * 5000);
  const tax: [number, number] = [made + rng.pick([-4, -3, -2, -1, 1, 2, 3, 4]) * 5000, made];
  const dep = k(100000, 500000, 10000);
  const pair = (min: number, max: number, by: number): [number, number] => {
    const a = k(min, max, 5000);
    return [a, a + rng.pick([-1, 1]) * k(10000, by, 5000)];
  };
  const inv = pair(300000, 1200000, 150000);
  const tr = pair(200000, 900000, 120000);
  const tp = pair(200000, 800000, 100000);
  const cash0 = k(100000, 500000, 5000);
  const npbt = pat + tax[1];
  const netA = npbt + dep + interest - (inv[1] - inv[0]) - (tr[1] - tr[0]) + (tp[1] - tp[0]) - tax[0];
  const netC = shares * (10 + prem) + fresh - interest - prev;
  // The cash of the later date is near the earlier; what the year leaves beyond it went into fixed assets.
  const cash1 = Math.round((cash0 * rng.pick([60, 75, 85, 115, 130, 150])) / 100 / 5000) * 5000;
  const bought = cash0 + netA + netC - cash1;
  if (netA <= 0 || netC === 0 || bought < 100000 || bought > 4000000 || tax[0] < 15000) return null;
  const v: Record<TbKey, [number, number]> = {
    sc: [c0, c0 + 10 * shares],
    rs: [sp0 + surplus0, sp0 + shares * prem + surplus0 + pat - prev],
    ltb: [deb0, deb0 + fresh],
    tp,
    stp: tax,
    ppe: [0, 0],
    inv,
    tr,
    cash: [cash0, cash1],
  };
  v.ppe[0] = sum(TB_FUNDS.map((key) => v[key][0])) - inv[0] - tr[0] - cash0;
  v.ppe[1] = v.ppe[0] + bought - dep;
  if (v.ppe[0] * 100 < 35 * sum(TB_FUNDS.map((key) => v[key][0]))) return null;
  return { co, trade, v, sp: [sp0, sp0 + shares * prem], surplus: [surplus0, surplus0 + pat - prev], shares, prem, rate, fresh, month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, dep, bought, prev, interest };
}
const cashYearText = (s: CashYear): string =>
  [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. These are the whole of its balance sheets:`,
    ...TB_FUNDS.map((key) => twoDates(TB[key], s.v[key][0], s.v[key][1])),
    ...TB_ASSETS.map((key) => twoDates(TB[key], s.v[key][0], s.v[key][1])),
    'Additional information:',
    `(a) Reserves and surplus are Securities Premium (${s.sp[0] > 0 ? inr(s.sp[0]) : 'nil'} and ${inr(s.sp[1])}) and Surplus (${inr(s.surplus[0])} and ${inr(s.surplus[1])}). Equity shares were issued for cash during the year at a premium; nothing was redeemed.`,
    `(b) Long-term borrowings are ${s.rate}% Debentures.${s.fresh > 0 ? ` The additional debentures were issued at par for cash on 1 ${s.month}.` : ''} Interest on them is paid on the due dates, so none is outstanding at either date.`,
    `(c) Depreciation charged on property, plant and equipment: ${inr(s.dep)}. None was sold; what was bought was paid for by cheque.`,
    `(d) Short-term provisions are the provision for tax; nothing more is known about tax. The dividend of ${inr(s.prev)} proposed for ${PREV} was declared and paid during ${YEAR}. No transfer was made to reserves.`,
  ].join('\n');
/** The Cash Flow Statement worked again from the printed case, as a student works it. */
function cashYearIn(text: string) {
  const f = datesIn(text);
  const get = (label: string): [number, number] => f.get(label) ?? [NaN, NaN];
  const up = (label: string): number => get(label)[1] - get(label)[0];
  const a = /Securities Premium \((nil|₹[\d,]+) and ₹([\d,]+)\) and Surplus \(₹([\d,]+) and ₹([\d,]+)\)/.exec(text);
  const num = (x: string | undefined): number => (x === 'nil' ? 0 : Number((x ?? 'NaN').replace(/[₹,]/g, '')));
  const [sp0, sp1, s0, s1] = [num(a?.[1]), num(a?.[2]), num(a?.[3]), num(a?.[4])];
  const rate = Number(/are (\d+)% Debentures\./.exec(text)?.[1]);
  const months = D.ISSUE_DATES.find((d) => text.includes(`for cash on 1 ${d.month} `))?.months ?? 0;
  const [deb0, deb1] = get(TB.ltb);
  const interest = (deb0 * rate) / 100 + ((deb1 - deb0) * rate * months) / 1200;
  const [tax0, tax1] = get(TB.stp);
  const prev = afterWords(text, 'The dividend of ₹');
  const dep = afterWords(text, 'Depreciation charged on property, plant and equipment: ₹');
  const npbt = s1 - s0 + tax1 + prev;
  const op = npbt + dep + interest;
  const cgo = op - up(TB.inv) - up(TB.tr) + up(TB.tp);
  const netA = cgo - tax0;
  const netB = -(up(TB.ppe) + dep);
  const netC = up(TB.sc) + sp1 - sp0 + (deb1 - deb0) - interest - prev;
  return { npbt, op, cgo, netA, netB, netC, cash: get(TB.cash), get };
}
const cashYearKept = keeper<CashYear>();

function cashYearStatement(s: CashYear): CaseStatementParts | null {
  const npbt = s.surplus[1] - s.surplus[0] + s.v.stp[1] + s.prev;
  const adjusts = [
    { label: 'Depreciation', amt: s.dep, why: `Depreciation, ${inr(s.dep)}, is ${CF_CASE.NON_CASH}.` },
    { label: CF_CASE.OP_ITEMS.debentures.row, also: CF_CASE.OP_ITEMS.debentures.also, amt: s.interest, why: `Interest on debentures, ${inr(s.interest)}, is ${CF_CASE.FINANCE_COST}.` },
  ];
  const wc = [
    { label: TB.inv, kind: 'A' as const, open: s.v.inv[0], close: s.v.inv[1] },
    { label: TB.tr, kind: 'A' as const, open: s.v.tr[0], close: s.v.tr[1] },
    { label: TB.tp, kind: 'L' as const, open: s.v.tp[0], close: s.v.tp[1] },
  ];
  const part = CF_CASE.operatingRows(npbt, adjusts, wc, s.v.stp[0]);
  const proceeds = s.shares * (10 + s.prem);
  const financing = [
    { label: CF_CASE.FINANCING_ROWS.shares, amt: proceeds },
    ...(s.fresh > 0 ? [{ label: CF_CASE.FINANCING_ROWS.debentures, amt: s.fresh }] : []),
    { label: CF_CASE.FINANCING_ROWS.debInterest, also: [CF_CASE.OP_ITEMS.debentures.row], amt: -s.interest },
    { label: CF_CASE.FINANCING_ROWS.dividend, also: [CF_CASE.FINANCING_ROWS.final], amt: -s.prev },
  ];
  const netC = sum(financing.map((x) => x.amt));
  const net = part.net - s.bought + netC;
  const purchase = 'Purchase of property, plant and equipment';
  return {
    task: `Prepare the Cash Flow Statement of ${s.co} for the year ended ${Y1} by the indirect method. ${CF_CASE.SIGN_RULE}`,
    title: `Cash Flow Statement of ${s.co} for the year ended ${Y1}`,
    columns: CF_CASE.CF_COLUMNS,
    rows: [
      { heading: CF_CASE.HEAD_A },
      ...part.rows,
      { heading: CF_CASE.HEAD_B },
      { label: purchase, amount: rupees(-s.bought) },
      { subtotal: CF_CASE.NET_B, amount: rupees(-s.bought), sum: 'section' },
      { heading: CF_CASE.HEAD_C },
      ...financing.map((x) => ({ label: x.label, amount: rupees(x.amt), ...(x.also ? { also: x.also } : {}) })),
      { subtotal: CF_CASE.NET_C, amount: rupees(netC), sum: 'section' },
      { subtotal: CF_CASE.NET_CHANGE, amount: rupees(net), sum: 'all' },
      { label: CF_CASE.CASH_START, amount: rupees(s.v.cash[0]) },
    ],
    final: { label: CF_CASE.CASH_END, amount: rupees(s.v.cash[0] + net) },
    distractors: [
      `Decrease in ${TB.inv.toLowerCase()}`, `Increase in ${TB.inv.toLowerCase()}`, `Decrease in ${TB.tr.toLowerCase()}`, `Increase in ${TB.tr.toLowerCase()}`, `Decrease in ${TB.tp.toLowerCase()}`, `Increase in ${TB.tp.toLowerCase()}`,
      'Provision for tax made', 'Proposed dividend of the current year', 'Increase in provision for tax', 'Sale of property, plant and equipment', 'Securities premium received',
    ].filter((label) => !part.rows.some((r) => 'label' in r && r.label === label)),
    explanation: [
      `${CF_CASE.NPBT} = change in Surplus (${inr(s.surplus[1])} - ${inr(s.surplus[0])} = ${signed(s.surplus[1] - s.surplus[0])}) + provision for tax made ${inr(s.v.stp[1])} (the closing provision, as nothing more is known about tax) + dividend of ${PREV} paid ${inr(s.prev)} = ${inr(npbt)}.`,
      ...part.steps,
      `Tax paid = the opening provision, ${inr(s.v.stp[0])}. ${CF_CASE.NET_A.replace(' (used in)', '')} = ${inr(part.cgo)} - ${inr(s.v.stp[0])} = ${inr(part.net)}.`,
      `Property, plant and equipment bought = closing ${inr(s.v.ppe[1])} + depreciation ${inr(s.dep)} - opening ${inr(s.v.ppe[0])} = ${inr(s.bought)}, as none was sold: an investing outflow.`,
      `Proceeds from issue of shares = rise in share capital ${inr(10 * s.shares)} + rise in Securities Premium ${inr(s.shares * s.prem)} = ${inr(proceeds)}.${s.fresh > 0 ? ` Debentures issued: ${inr(s.fresh)}.` : ''} Interest paid ${inr(s.interest)} and dividend paid ${inr(s.prev)} are outflows.`,
      `Net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents = ${CF_CASE.chain([part.net, -s.bought, netC])} = ${CF_CASE.shown(net)}; ${inr(s.v.cash[0])} ${net > 0 ? '+' : '-'} ${inr(Math.abs(net))} = ${inr(s.v.cash[0] + net)}, the cash of the later balance sheet.`,
    ],
    hints: ['Work the three sections in turn: the profit before tax from Surplus, tax and dividend first; then the fixed assets; then the shares, debentures, interest and dividend.', CF_CASE.H.rec[0]],
  };
}
const cashYearStatementHolds = (q: StatementQuestion): boolean => {
  const t = cashYearIn(q.context ?? '');
  const totals = (q.lines ?? []).flatMap((l): [string, number][] => ('subtotal' in l ? [[l.subtotal, l.amounts[0] / 100]] : []));
  const of = (name: string): number => totals.find(([n]) => n === name)?.[1] ?? NaN;
  return (
    of(CF_CASE.OP_PROFIT) === t.op && of(CF_CASE.CGO) === t.cgo && of(CF_CASE.NET_A) === t.netA && of(CF_CASE.NET_B) === t.netB && of(CF_CASE.NET_C) === t.netC &&
    of(CF_CASE.NET_CHANGE) === t.netA + t.netB + t.netC && t.cash[0] + t.netA + t.netB + t.netC === t.cash[1] &&
    q.rows[0].amounts[0] === rupees(t.npbt) && q.final?.amount === rupees(t.cash[1])
  );
};

const PERIOD = { a: Y0, b: Y1, inA: `as at ${Y0}`, inB: `as at ${Y1}`, bs: true, statement: 'balance sheet' };
function cashYearComparative(s: CashYear): CaseStatementParts | null {
  const line = (key: TbKey): Row | null => {
    const figures = FSA_CASE.changeFigures(s.v[key]);
    return figures && { label: TB[key], amounts: figures };
  };
  const total = (keys: TbKey[]): [number, number] => [sum(keys.map((key) => s.v[key][0])), sum(keys.map((key) => s.v[key][1]))];
  const totalRow = (keys: TbKey[], how: 'all' | 'block'): Row | null => {
    const figures = FSA_CASE.changeFigures(total(keys));
    return figures && { subtotal: 'Total', amounts: figures, sum: how };
  };
  const rows = [
    { heading: 'I. EQUITY AND LIABILITIES' },
    { heading: "1. Shareholders' funds" }, line('sc'), line('rs'),
    { heading: '2. Non-current liabilities' }, line('ltb'),
    { heading: '3. Current liabilities' }, line('tp'), line('stp'),
    totalRow(TB_FUNDS, 'all'),
    { heading: 'II. ASSETS' },
    { heading: '1. Non-current assets' }, line('ppe'),
    { heading: '2. Current assets' }, line('inv'), line('tr'), line('cash'),
    totalRow(TB_ASSETS, 'block'),
  ];
  if (rows.some((r) => r === null)) return null;
  const [t0, t1] = total(TB_FUNDS);
  return {
    task: `Prepare the Comparative Balance Sheet of ${s.co} as at ${Y0} and ${Y1}. ${FSA_CASE.PRINTED} ${FSA_CASE.CHANGE_RULES}`,
    title: `Comparative Balance Sheet of ${s.co} as at ${Y0} and ${Y1}`,
    columns: FSA_CASE.changeColumns(PERIOD, true),
    rows: rows as Row[],
    distractors: ['Long-term provisions', 'Other current liabilities', 'Short-term borrowings', 'Non-current investments', 'Current investments', 'Securities premium'],
    explanation: [
      'Equity and liabilities come first and assets after them, each line under its major head as Schedule III lays down.',
      `Total of equity and liabilities = ${inr(t0)} as at ${Y0} and ${inr(t1)} as at ${Y1}; the assets add up to the same figures.`,
      `Absolute change = figure as at ${Y1} less figure as at ${Y0}. Percentage change = absolute change ÷ figure as at ${Y0} × 100.`,
      `Share capital rose by the issue: ${inr(s.v.sc[1] - s.v.sc[0])}. The total has its own change, worked on the totals: ${inr(t1 - t0)} on ${inr(t0)}.`,
    ],
    hints: [FSA_CASE.FORMAT_HINTS.changeBs[0], FSA_CASE.FORMAT_HINTS.changeBs[1]],
  };
}
const cashYearComparativeHolds = (q: StatementQuestion): boolean => {
  const t = cashYearIn(q.context ?? '');
  const lines = [...q.rows.map((r) => r.amounts), ...subtotalsAll(q)];
  return (
    lines.every(([a, b, change, p]) => change === b - a && (change === 0 ? p === 0 : Math.sign(p) === Math.sign(change) && AN.nearest(Math.abs(p), [Math.abs(change), a], AN.PERCENT))) &&
    q.rows.every((r) => r.amounts[0] === rupees(t.get(r.label)[0]) && r.amounts[1] === rupees(t.get(r.label)[1]))
  );
};
/** Every figure of every sub-total of a statement, in all its columns. */
const subtotalsAll = (q: StatementQuestion): number[][] => (q.lines ?? []).flatMap((line) => ('subtotal' in line ? [line.amounts] : []));

function cashYearRatio(which: 'current' | 'quick') {
  return (s: CashYear): NumericParts | null => {
    const ca = s.v.inv[1] + s.v.tr[1] + s.v.cash[1];
    const quick = ca - s.v.inv[1];
    const cl = s.v.tp[1] + s.v.stp[1];
    const top = which === 'current' ? ca : quick;
    const n = times([top, cl], [
      [[which === 'current' ? s.v.inv[0] + s.v.tr[0] + s.v.cash[0] : s.v.tr[0] + s.v.cash[0], s.v.tp[0] + s.v.stp[0]], `Worked the ratio as at ${Y0}; it is asked as at ${Y1}.`],
      [[cl, top], 'Divided the current liabilities by the assets: the ratio is upside down.'],
      which === 'current' ? [[quick, cl], 'Left the inventories out: that is the quick ratio.'] : [[ca, cl], 'Kept the inventories in: that is the current ratio.'],
      [[top, s.v.tp[1]], 'Left the provision for tax out of the current liabilities.'],
      [[top, cl + s.v.ltb[1]], 'Counted the debentures among the current liabilities.'],
    ]);
    return n && {
      prompt: `Find the ${which === 'current' ? 'current ratio' : 'quick ratio (quick assets being the current assets less inventories and prepaid expenses)'} as at ${Y1}, ${AS_RATIO}.`,
      ...n,
      explanation: [
        `${which === 'current' ? `Current assets = ${inr(s.v.inv[1])} + ${inr(s.v.tr[1])} + ${inr(s.v.cash[1])}` : `Quick assets = ${inr(s.v.tr[1])} + ${inr(s.v.cash[1])}`} = ${inr(top)}; current liabilities = ${inr(s.v.tp[1])} + ${inr(s.v.stp[1])} = ${inr(cl)}.`,
        `${which === 'current' ? 'Current' : 'Quick'} ratio = ${inr(top)} ÷ ${inr(cl)} = ${dec(n.answer)} : 1.`,
      ],
      hints: ['Current assets: inventories, trade receivables, cash and cash equivalents. Current liabilities: trade payables and short-term provisions.', 'Quick assets = current assets - inventories - prepaid expenses.'],
    };
  };
}
const cashYearRatioHolds = (q: NumericQuestion): boolean => {
  const t = cashYearIn(q.context ?? '');
  const at = (label: string): number => t.get(label)[1];
  const ca = at(TB.inv) + at(TB.tr) + at(TB.cash);
  return nearTimes(q.answer, [q.prompt.includes('quick ratio') ? ca - at(TB.inv) : ca, at(TB.tp) + at(TB.stp)]);
};

const cashYearParts = [cashYearStatement, cashYearComparative, cashYearRatio('current'), cashYearRatio('quick')];
const caseChainCashYear = caseTemplate<CashYear>({
  id: 'case-cy-chain-cash-flow-comparative',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Cash flow, comparative balance sheet and liquidity',
  setup: (rng) =>
    firstGood(40, () => drawCashYear(rng), (s) => {
      const ok = cashYearParts.every((m) => m(s) !== null);
      if (ok) cashYearKept.keep(cashYearText(s), s);
      return ok;
    }),
  context: cashYearText,
  parts: [
    { kind: 'statement', make: cashYearStatement, verify: cashYearStatementHolds },
    { kind: 'statement', make: cashYearComparative, verify: cashYearComparativeHolds },
    { kind: 'numeric', unit: 'times', make: cashYearRatio('current'), verify: cashYearRatioHolds },
    { kind: 'numeric', unit: 'times', make: cashYearRatio('quick'), verify: cashYearRatioHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 20. case-cy-chain-spl-common-size: the list of a trading company (the examined Statement of Profit and Loss of the
//     company topic, with every expense but the finance costs an operating one); the statement, then its common size
//     statement (revenue from operations = 100) with the rupee figures printed, then the operating profit ratio.
// ---------------------------------------------------------------------------------------------------------------

const DEALERS: [string, string][] = [
  ['Kosi Hardware Mart Ltd.', 'a wholesaler of hardware'],
  ['Ratnagiri Dry Fruits Ltd.', 'a dealer in dry fruits'],
  ['Banas Book Distributors Ltd.', 'a distributor of books'],
  ['Doon Stationery Mart Ltd.', 'a wholesaler of stationery'],
  ['Sindhu Electricals Trading Ltd.', 'a dealer in electrical goods'],
  ['Chilka Kitchenware Ltd.', 'a wholesaler of kitchenware'],
];
/**
 * The Statement of Profit and Loss of the company topic for a year that has ended. The topic draws its year from 2025,
 * 2026 and 2027; a year to 31 March 2027 has not ended yet, so here it is moved back to the year to 31 March 2026. Only
 * the dates in the texts change (the figures are the same, and the topic's own question keeps its year).
 */
function completedYear(sp: SplCase | null): SplCase | null {
  if (!sp || sp.y <= 2026) return sp;
  const move = (text: string): string => text.split(`31 March ${sp.y}`).join('31 March 2026');
  return { ...sp, y: 2026, parts: JSON.parse(move(JSON.stringify(sp.parts))) as SplCase['parts'] };
}
const OPERATING_BASIS = 'For its ratios: every expense other than finance costs is an operating expense, and the cost of revenue from operations is the purchases of stock-in-trade and the change in inventories of stock-in-trade.';
interface SplShare {
  sp: SplCase;
  trade: string;
}
const splShareText = (s: SplShare): string => [s.sp.parts.data.replace(`${s.sp.co} is a trading company.`, `${s.sp.co}, ${s.trade}, is a trading company.`), OPERATING_BASIS].join('\n');
const SPL_LINES: PlLine[] = ['rfo', 'oi', 'pst', 'chg', 'ebe', 'fc', 'dep', 'oe'];
/** The lines of the statement with their rupees and their percentages of revenue; null when the rounded percentages do not add up. */
function splShares(f: Map<PlLine, number>) {
  const g = (l: PlLine): number => f.get(l) ?? 0;
  const rev = g('rfo');
  const pc2 = (x: number): number | null => pct2(x, rev);
  const expenses = SPL_LINES.filter((l) => l !== 'rfo' && l !== 'oi' && g(l) !== 0);
  const income = rev + g('oi');
  const spent = sum(expenses.map(g));
  const pbt = income - spent;
  const pat = pbt - g('tax');
  const all = [...['rfo', 'oi', ...expenses, 'tax'].map((l) => pc2(g(l as PlLine))), pc2(income), pc2(spent), pc2(pbt), pc2(pat)];
  if (all.some((p) => p === null)) return null;
  const p = (l: PlLine): number => pc2(g(l)) ?? 0;
  const [pIncome, pSpent, pPbt, pPat] = [pc2(income)!, pc2(spent)!, pc2(pbt)!, pc2(pat)!];
  // The percentages are added as the statement adds the rupees: every total must come out of its own lines.
  if (pIncome !== 10000 + p('oi') || pSpent !== sum(expenses.map(p)) || pPbt !== pIncome - pSpent || pPat !== pPbt - p('tax')) return null;
  return { rev, income, spent, pbt, pat, expenses, p, pIncome, pSpent, pPbt, pPat, g };
}
const splShareKept = keeper<SplShare>();

function splShareStatement(s: SplShare): CaseStatementParts | null {
  const w = splShares(s.sp.figures);
  if (!w) return null;
  const row = (l: PlLine): Row => ({ label: FS_CASE.lineName(l), amounts: [rupees(w.g(l)), w.p(l)] });
  return {
    task: `Starting from the Statement of Profit and Loss, prepare the Common Size Statement of Profit and Loss of ${s.sp.co} (revenue from operations = 100). The rupee figures are printed as you choose each line; give every percentage to two decimal places and a negative one with a minus sign.`,
    title: `Common Size Statement of Profit and Loss of ${s.sp.co} for the year ended 31 March ${s.sp.y}`,
    columns: [{ name: 'Amount (₹)', given: true, signed: true }, { name: 'Percentage of revenue from operations (%)', unit: 'percent', adds: true, signed: true }],
    rows: [
      row('rfo'),
      row('oi'),
      { subtotal: 'Total Income', amounts: [rupees(w.income), w.pIncome], sum: 'block' },
      { heading: 'Expenses' },
      ...w.expenses.map(row),
      { subtotal: 'Total Expenses', amounts: [rupees(w.spent), w.pSpent], sum: 'section' },
      { subtotal: 'Profit before Tax', amounts: [rupees(w.pbt), w.pPbt] },
      row('tax'),
      { subtotal: 'Profit for the period', amounts: [rupees(w.pat), w.pPat] },
    ],
    distractors: ['Cost of Materials Consumed', 'Gross Profit', 'Direct Expenses'],
    explanation: [
      `Revenue from operations, ${inr(w.rev)}, is the base: it stands at 100. Every other line is divided by it.`,
      `Other income is ${pc(w.p('oi'))}, so total income stands at ${pc(w.pIncome)}: more than 100.`,
      `${FS_CASE.lineName(w.expenses[0])}: ${inr(w.g(w.expenses[0]))} ÷ ${inr(w.rev)} × 100 = ${pc(w.p(w.expenses[0]))}.${w.g('chg') < 0 ? ` The change in inventories is negative (the inventory rose by ${inr(-w.g('chg'))}), and so is its percentage, ${pc(w.p('chg'))}.` : ''}`,
      `Total expenses ${pc(w.pSpent)}; profit before tax ${pc(w.pIncome)} - ${pc(w.pSpent)} = ${pc(w.pPbt)}; tax ${pc(w.p('tax'))}; profit for the period ${pc(w.pPat)}.`,
    ],
    hints: ['In a common size Statement of Profit and Loss every line is a percentage of revenue from operations.', 'Total income is 100 plus other income; the profits are differences of the percentages above them.'],
  };
}
const splShareStatementHolds = (q: StatementQuestion): boolean => {
  const f = splFromData(q.context ?? '');
  const w = f && splShares(f);
  if (!w) return false;
  // Every percentage multiplied back by the revenue, and the printed rupees those of the list.
  return [...q.rows.map((r) => r.amounts), ...subtotalsAll(q)].every(([amount, p]) => AN.nearest(Math.abs(p), [Math.abs(amount / 100), w.rev], AN.PERCENT) && Math.sign(p) === Math.sign(amount)) && q.rows[0].amounts[1] === 10000;
};

function splShareOperating(s: SplShare): NumericParts | null {
  const w = splShares(s.sp.figures);
  if (!w) return null;
  const cost = w.g('pst') + w.g('chg');
  const operating = cost + w.g('ebe') + w.g('dep') + w.g('oe');
  const n = percent([w.rev - operating, w.rev], [
    [[operating, w.rev], 'Gave the operating ratio; the operating profit ratio is 100 less it.'],
    [[w.rev - operating - w.g('fc'), w.rev], 'Took the finance costs off too; they are not an operating expense.'],
    [[w.pbt, w.rev], 'Gave the profit before tax as a percentage of revenue.'],
    [[w.rev + w.g('oi') - operating, w.rev], 'Added other income; it is not part of the operations.'],
  ]);
  return n && {
    prompt: `Find the operating profit ratio of ${s.sp.co} for the year, ${AS_PERCENT}.`,
    ...n,
    explanation: [
      `Operating cost = purchases ${inr(w.g('pst'))} ${w.g('chg') < 0 ? '-' : '+'} change in inventories ${inr(Math.abs(w.g('chg')))} + employee benefits ${inr(w.g('ebe'))} + depreciation ${inr(w.g('dep'))} + other expenses ${inr(w.g('oe'))} = ${inr(operating)}.`,
      `Operating profit = ${inr(w.rev)} - ${inr(operating)} = ${inr(w.rev - operating)}; operating profit ratio = ${inr(w.rev - operating)} ÷ ${inr(w.rev)} × 100 = ${pc(n.answer)}.`,
    ],
    hints: ['Operating profit = revenue from operations - operating cost; finance costs and other income stay out.', 'Operating profit ratio = 100 - operating ratio.'],
  };
}
const splShareOperatingHolds = (q: NumericQuestion): boolean => {
  const f = splFromData(q.context ?? '');
  if (!f) return false;
  const g = (l: PlLine): number => f.get(l) ?? 0;
  // The operating profit another way: the profit before tax, with the finance costs added back and other income taken off.
  const pbt = g('rfo') + g('oi') - sum((['pst', 'chg', 'ebe', 'fc', 'dep', 'oe'] as PlLine[]).map(g));
  return nearPercent(q.answer, [pbt + g('fc') - g('oi'), g('rfo')]);
};

const caseChainSplShare = caseTemplate<SplShare>({
  id: 'case-cy-chain-spl-common-size',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Statement of Profit and Loss, in rupees and in shares',
  setup: (rng) =>
    firstGood(
      40,
      () => {
        const [name, trade] = rng.pick(DEALERS);
        const sp = completedYear(splStatement(rng, { name, trader: true, operating: true }));
        return sp && { sp, trade };
      },
      (s) => {
        const ok = splShareStatement(s) !== null && splShareOperating(s) !== null;
        if (ok) splShareKept.keep(splShareText(s), s);
        return ok;
      },
    ),
  context: splShareText,
  parts: [
    { kind: 'statement', make: (s) => { const { data, ...rest } = s.sp.parts; void data; return rest; }, verify: splStatementHolds },
    { kind: 'statement', make: splShareStatement, verify: splShareStatementHolds },
    { kind: 'numeric', unit: 'percent', make: splShareOperating, verify: splShareOperatingHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 21. case-cy-chain-debenture-solvency: debentures issued for cash at a discount or at par, redeemable at a premium
//     (over-subscribed and the excess refunded in some seeds), the loss written off first from Securities Premium.
//     The set of entries, then the whole balance sheet in the form of Schedule III (one figure for each sub-head),
//     then the debt to equity and total assets to debt ratios.
// ---------------------------------------------------------------------------------------------------------------

interface DebSolvency {
  co: string;
  trade: string;
  n: number;
  applied: number;
  rate: number;
  disc: number;
  red: number;
  sp0: number;
  sc: number;
  gr: number;
  surplus: number;
  tp: number;
  ppe: number;
  inv: number;
  tr: number;
  cash: number;
  dates: [string, string];
  transactions: SetTransaction[];
}
const debSolvencyFigures = (s: DebSolvency) => {
  const loss = s.n * (s.disc + s.red);
  const fromSp = Math.min(loss, s.sp0);
  const nominal = s.n * 100;
  const oltl = s.n * s.red;
  const reserves = s.sp0 - fromSp + s.gr + s.surplus;
  const funds = s.sc + reserves + nominal + oltl + s.tp;
  return { loss, fromSp, fromPl: loss - fromSp, nominal, oltl, reserves, funds, sf: s.sc + reserves, money: s.n * (100 - s.disc) };
};
function drawDebSolvency(rng: Rng): DebSolvency | null {
  const { co, trade } = firm(rng);
  const n = rng.step(5000, 25000, 1000);
  const disc = rng.pick([0, 5, 10]);
  const red = rng.pick([5, 10]);
  const loss = n * (disc + red);
  const sp0 = rng.int(0, 2) === 0 ? Math.floor((loss * rng.pick([0.4, 0.5, 0.6])) / 10000) * 10000 : Math.ceil(loss / 10000) * 10000 + rng.step(10000, 300000, 10000);
  const k = (min: number, max: number, step: number): number => rng.step(min, max, step);
  const months = setDays(rng, 2, 1, 10).map((m) => D.monthIn(2025, m - 1));
  const s: DebSolvency = {
    co, trade, n, applied: rng.int(0, 1) === 0 ? n : n + n * rng.pick([0.1, 0.2, 0.25]), rate: rng.pick(D.RATES), disc, red, sp0,
    sc: k(2000000, 8000000, 500000), gr: k(200000, 1000000, 10000), surplus: k(200000, 1500000, 10000), tp: k(300000, 1200000, 10000),
    ppe: 0, inv: k(500000, 2000000, 10000), tr: k(300000, 1500000, 10000), cash: k(200000, 1000000, 10000),
    dates: [`${rng.int(1, 20)} ${months[0]}`, `${rng.int(1, 20)} ${months[1]}`], transactions: [],
  };
  const f = debSolvencyFigures(s);
  s.ppe = f.funds - s.inv - s.tr - s.cash;
  if (s.ppe * 100 < 40 * f.funds) return null;
  const i = { n, rate: s.rate, face: 100, prem: 0, disc, red };
  const price = 100 - disc;
  const received = s.applied * price;
  s.transactions = [
    D.on(s.dates[0], 'Applications received with the full issue price.', [S.dr('bank', received), S.cr(D.DAA, received)], [
      `${cnt(s.applied)} x ${inr(price)} = ${inr(received)} received: Bank A/c is debited.`,
      'Until allotment it is application money: Debenture Application and Allotment A/c is credited.',
    ]),
    D.on(s.dates[1], 'Debentures allotted.', D.allotmentLines(i, D.DAA, f.money), [`The money on the ${cnt(n)} debentures allotted, ${inr(f.money)}, stops being application money.`, ...D.allotmentSteps(i)]),
    ...(s.applied > n
      ? [D.on(s.dates[1], 'Money refunded on the applications not accepted.', [S.dr(D.DAA, received - f.money), S.cr('bank', received - f.money)], [`${cnt(s.applied - n)} x ${inr(price)} = ${inr(received - f.money)} is returned: Debenture Application and Allotment A/c is debited and so closed.`, 'Bank A/c is credited.'])]
      : []),
    D.writeOffTx(Y1, n * disc, n * red, sp0, 0),
  ];
  return s;
}
const debSolvencyText = (s: DebSolvency): string =>
  [
    `${s.co}, ${s.trade}, closes its books on 31 March. Before the issue below its Securities Premium A/c had ${s.sp0 > 0 ? `a balance of ${inr(s.sp0)}` : 'no balance'}, and it had no borrowings.`,
    `It offered ${cnt(s.n)}, ${s.rate}% Debentures of ₹100 each ${s.disc > 0 ? `at a discount of ${s.disc}%` : 'at par'}, redeemable at a premium of ${s.red}% after six years, the whole price payable on application. ${s.dates[0]}: applications were received for ${cnt(s.applied)} debentures. ${s.dates[1]}: the ${cnt(s.n)} debentures were allotted${s.applied > s.n ? ' and the money on the other applications refunded' : ''}.`,
    `The premium payable on redemption is provided for on allotment, and the whole loss on the issue is debited to ${D.LOSS_AC}. On ${Y1} the loss was written off, first from Securities Premium and then from the Statement of Profit and Loss.`,
    `Its other balances on ${Y1}, after every entry of the year: share capital ${inr(s.sc)}; General Reserve ${inr(s.gr)}; Surplus (balance in Statement of Profit and Loss) ${inr(s.surplus)}; trade payables ${inr(s.tp)}; property, plant and equipment ${inr(s.ppe)}; inventories ${inr(s.inv)}; trade receivables ${inr(s.tr)}; cash and cash equivalents ${inr(s.cash)}.`,
  ].join('\n');
const debSolvencyKept = keeper<DebSolvency>();

const debSolvencySet = (s: DebSolvency): CaseSetParts => ({
  task: 'Pass the journal entries for the issue of the debentures and for the write-off of the loss on their issue.',
  transactions: s.transactions,
  hints: D.SET_HINTS.issue,
  distractorAccounts: ['discountOnIssueOfDebentures', 'debentureApplication', 'generalReserve', 'debentureholders'],
});
const debSolvencySetHolds = (q: JournalSetQuestion): boolean => {
  const s = debSolvencyKept.of(q.context ?? '');
  if (!s) return false;
  const f = debSolvencyFigures(s);
  const left = leftAfter(q.entries.map((e) => e.expected), new Map([[D.SP, -rupees(s.sp0)]]));
  return left(D.DAA) === 0 && left('lossOnIssueOfDebentures') === 0 && left(debentures(s.rate)) === -f.nominal && left(D.PREM_RED) === -f.oltl && left(D.SP) === -(s.sp0 - f.fromSp) && left(D.SPL) === f.fromPl && left('bank') === f.money;
};

function debSolvencySheet(s: DebSolvency): CaseStatementParts {
  const f = debSolvencyFigures(s);
  return {
    task: `Starting from the balances the entries leave, prepare the Balance Sheet of ${s.co} as at ${Y1} in the form of Schedule III, with one figure for each sub-head.`,
    title: `Balance Sheet of ${s.co} as at ${Y1}`,
    rows: [
      { heading: 'I. EQUITY AND LIABILITIES' },
      { heading: "1. Shareholders' funds" },
      { label: 'Share capital', amount: rupees(s.sc) },
      { label: 'Reserves and surplus', amount: rupees(f.reserves) },
      { heading: '2. Non-current liabilities' },
      { label: 'Long-term borrowings', amount: rupees(f.nominal) },
      { label: 'Other long-term liabilities', amount: rupees(f.oltl) },
      { heading: '3. Current liabilities' },
      { label: 'Trade payables', amount: rupees(s.tp) },
      { subtotal: 'Total', amount: rupees(f.funds), sum: 'all' },
      { heading: 'II. ASSETS' },
      { heading: '1. Non-current assets' },
      { label: 'Property, plant and equipment', amount: rupees(s.ppe) },
      { heading: '2. Current assets' },
      { label: 'Inventories', amount: rupees(s.inv) },
      { label: 'Trade receivables', amount: rupees(s.tr) },
      { label: 'Cash and cash equivalents', amount: rupees(s.cash) },
      { subtotal: 'Total', amount: rupees(f.funds), sum: 'block' },
    ],
    distractors: ['Long-term provisions', 'Short-term borrowings', 'Other current liabilities', 'Other non-current assets', 'Other current assets', 'Loss on issue of debentures'],
    explanation: [
      s.sp0 > f.fromSp
        ? `Reserves and surplus = Securities Premium left (${inr(s.sp0)} - ${inr(f.fromSp)} written off = ${inr(s.sp0 - f.fromSp)}) + General Reserve ${inr(s.gr)} + Surplus ${inr(s.surplus)} = ${inr(f.reserves)}.`
        : `Securities Premium, ${inr(s.sp0)}, was all used in the write-off, so nothing of it is left. Reserves and surplus = General Reserve ${inr(s.gr)} + Surplus ${inr(s.surplus)} = ${inr(f.reserves)}.`,
      `Long-term borrowings: the debentures at their nominal value, ${cnt(s.n)} x ₹100 = ${inr(f.nominal)}. Other long-term liabilities: the premium payable on redemption, ${inr(f.oltl)}.`,
      `The loss on issue was written off in full, so nothing of it is left as an asset.`,
      `Both halves total ${inr(f.funds)}.`,
    ],
    hints: ['Debentures stand at their nominal value under long-term borrowings; the premium payable on redemption is an other long-term liability.', 'What is left of Securities Premium after the write-off is part of reserves and surplus.'],
  };
}
const debSolvencySheetHolds = (q: StatementQuestion): boolean => {
  const s = debSolvencyKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(s.transactions.map((t) => t.lines), new Map([[D.SP, -rupees(s.sp0)]]));
  const [eq, as] = subtotalsOf(q);
  return (
    figureOf(q, 'Reserves and surplus') === rupees(-left(D.SP) + s.gr + s.surplus) &&
    figureOf(q, 'Long-term borrowings') === rupees(-left(debentures(s.rate))) &&
    figureOf(q, 'Other long-term liabilities') === rupees(-left(D.PREM_RED)) &&
    eq === as && as === rupees(s.ppe + s.inv + s.tr + s.cash)
  );
};

function debSolvencyRatio(which: 'debtEquity' | 'assetsDebt') {
  return (s: DebSolvency): NumericParts | null => {
    const f = debSolvencyFigures(s);
    const n =
      which === 'debtEquity'
        ? times([f.nominal, f.sf], [
            [[f.nominal + f.oltl, f.sf], 'Counted the premium payable on redemption as debt; it is not a borrowing.'],
            [[f.sf, f.nominal], "Divided the shareholders' funds by the debt: the ratio is upside down."],
            [[f.nominal, f.sf + f.fromSp], 'Forgot that the loss written off reduced Securities Premium.'],
            [[f.nominal, s.sc], "Divided by the share capital alone."],
          ])
        : times([f.funds, f.nominal], [
            [[f.funds, f.nominal + f.oltl], 'Counted the premium payable on redemption as debt.'],
            [[f.nominal, f.funds], 'Divided the debt by the total assets: upside down.'],
            [[f.funds - s.tp, f.nominal], 'Deducted the current liabilities: that is the capital employed.'],
            [[s.ppe, f.nominal], 'Took the property, plant and equipment alone as the assets.'],
          ]);
    return n && {
      prompt:
        which === 'debtEquity'
          ? `Find the debt to equity ratio as at ${Y1}, debt being long-term borrowings and equity shareholders' funds, ${AS_RATIO}.`
          : `Find the total assets to debt ratio as at ${Y1}, debt being long-term borrowings, ${AS_RATIO}.`,
      ...n,
      explanation:
        which === 'debtEquity'
          ? [`Debt = ${inr(f.nominal)}; shareholders' funds = ${inr(s.sc)} + ${inr(f.reserves)} = ${inr(f.sf)}.`, `Debt to equity ratio = ${inr(f.nominal)} ÷ ${inr(f.sf)} = ${dec(n.answer)} : 1.`]
          : [`Total assets = ${inr(f.funds)}; debt = ${inr(f.nominal)}.`, `Total assets to debt ratio = ${inr(f.funds)} ÷ ${inr(f.nominal)} = ${dec(n.answer)} : 1.`],
      hints: H.solvency,
    };
  };
}
const debSolvencyRatioHolds = (q: NumericQuestion): boolean => {
  const s = debSolvencyKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(s.transactions.map((t) => t.lines), new Map([[D.SP, -rupees(s.sp0)]]));
  const debt = -left(debentures(s.rate));
  const sf = s.sc + s.gr + s.surplus - left(D.SP);
  return nearTimes(q.answer, q.prompt.includes('debt to equity') ? [debt, sf] : [s.ppe + s.inv + s.tr + s.cash, debt]);
};

const caseChainDebSolvency = caseTemplate<DebSolvency>({
  id: 'case-cy-chain-debenture-solvency',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Debentures, the balance sheet and solvency',
  setup: (rng) =>
    firstGood(30, () => drawDebSolvency(rng), (s) => {
      const ok = debSolvencyRatio('debtEquity')(s) !== null && debSolvencyRatio('assetsDebt')(s) !== null;
      if (ok) debSolvencyKept.keep(debSolvencyText(s), s);
      return ok;
    }),
  context: debSolvencyText,
  parts: [
    { kind: 'journal_set', make: debSolvencySet, verify: debSolvencySetHolds },
    { kind: 'statement', make: debSolvencySheet, verify: debSolvencySheetHolds },
    { kind: 'numeric', unit: 'times', make: debSolvencyRatio('debtEquity'), verify: debSolvencyRatioHolds },
    { kind: 'numeric', unit: 'times', make: debSolvencyRatio('assetsDebt'), verify: debSolvencyRatioHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 22. case-cy-chain-raising-money: a year of raising and repaying money. Shares at a premium, the whole price with the
//     application (some applications refused and the money returned, in some seeds), debentures at par, part of a
//     bank loan repaid. The set of entries, then the financing section of the Cash Flow Statement (with the interest
//     and the dividend the case gives), then the debt to equity ratio at the year end.
// ---------------------------------------------------------------------------------------------------------------

interface Raising {
  co: string;
  trade: string;
  n: number;
  applied: number;
  p: number;
  nDeb: number;
  rate: number;
  loan: number;
  loanRate: number;
  repaid: number;
  prev: number;
  sf: number;
  dates: [string, string, string, string];
  transactions: SetTransaction[];
}
function drawRaising(rng: Rng): Raising | null {
  const { co, trade } = firm(rng);
  const n = rng.step(20000, 100000, 5000);
  const applied = rng.int(0, 2) === 0 ? n : n + rng.step(2000, 20000, 1000);
  const p = rng.pick([2, 3, 5, 8, 10]);
  const nDeb = rng.step(2000, 12000, 1000);
  const rate = rng.pick(D.RATES);
  const loan = rng.step(800000, 3000000, 100000);
  const repaid = rng.step(100000, Math.floor(loan / 2 / 100000) * 100000, 100000);
  const months = setDays(rng, 3, 1, 11).map((m) => D.monthIn(2025, m - 1));
  const dates = [...months.map((m) => `${rng.int(1, 25)} ${m}`), Y1] as [string, string, string, string];
  const price = 10 + p;
  const transactions: SetTransaction[] = [
    D.on(dates[0], 'Applications received for the shares, with the whole price.', [S.dr('bank', applied * price), S.cr('equityShareApplication', applied * price)], [
      `${cnt(applied)} x ${inr(price)} = ${inr(applied * price)} received: Bank A/c is debited.`,
      'No share is allotted yet: Equity Share Application A/c is credited.',
    ]),
    D.on(dates[1], applied > n ? 'Shares allotted; the money on the refused applications returned.' : 'Shares allotted.', S.entry(S.dr('equityShareApplication', applied * price), S.cr('equityShareCapital', n * 10), S.cr('securitiesPremium', n * p), S.cr('bank', (applied - n) * price)), [
      `Equity Share Application A/c is debited with all the money held, ${inr(applied * price)}, and so closed.`,
      `On the ${cnt(n)} shares allotted: Equity Share Capital A/c ${inr(n * 10)} and Securities Premium A/c ${inr(n * p)} are credited; the premium came with the application, so it is credited on allotment.`,
      ...(applied > n ? [`The money on the ${cnt(applied - n)} shares refused, ${inr((applied - n) * price)}, is returned: Bank A/c is credited.`] : []),
    ]),
    D.on(dates[2], 'Applications received for the debentures, with the whole price.', [S.dr('bank', nDeb * 100), S.cr(D.DAA, nDeb * 100)], [`${cnt(nDeb)} x ₹100 = ${inr(nDeb * 100)}: Bank A/c is debited.`, 'Debenture Application and Allotment A/c is credited until allotment.']),
    D.on(dates[2], 'Debentures allotted.', [S.dr(D.DAA, nDeb * 100), S.cr(debentures(rate), nDeb * 100)], ['Debenture Application and Allotment A/c is debited and so closed.', `${rate}% Debentures A/c is credited with the nominal value, ${inr(nDeb * 100)}.`]),
    D.on(dates[3], 'Part of the bank loan repaid.', [S.dr('bankLoan', repaid), S.cr('bank', repaid)], [`The loan owed falls by ${inr(repaid)}: Bank Loan A/c is debited.`, 'The money is paid out of the bank: Bank A/c is credited.']),
  ];
  const prev = rng.step(50000, 300000, 10000);
  const sf = rng.step(3000000, 9000000, 100000);
  return { co, trade, n, applied, p, nDeb, rate, loan, loanRate: rng.pick([9, 10, 11, 12]), repaid, prev, sf, dates, transactions };
}
const raisingText = (s: Raising): string =>
  [
    `${s.co}, ${s.trade}, ${NOT_FINANCING}. On 1 April 2025 its only borrowing was ${an(s.loanRate)} ${s.loanRate}% long-term loan of ${inr(s.loan)} from a bank.`,
    `${s.dates[0]}: it offered ${cnt(s.n)} equity shares of ₹10 each at a premium of ${inr(s.p)} a share, the whole price payable on application; applications came in for ${cnt(s.applied)} shares.`,
    `${s.dates[1]}: the ${cnt(s.n)} shares were allotted${s.applied > s.n ? `, and the applications for the other ${cnt(s.applied - s.n)} shares refused and the money on them returned` : ''}.`,
    `${s.dates[2]}: ${cnt(s.nDeb)}, ${s.rate}% Debentures of ₹100 each were issued at par, the whole amount payable on application; all were subscribed and allotted the same day.`,
    `${s.dates[3]}: ${inr(s.repaid)} of the bank loan was repaid.`,
    `Interest paid on the bank loan during the year: ${inr((s.loan * s.loanRate) / 100)}. Interest on the debentures is payable yearly on 30 September, so none of it was paid during the year. The dividend of ${inr(s.prev)} proposed for ${PREV} was declared and paid during the year.`,
    `All money is received and paid through the bank. On ${Y1} the shareholders' funds were ${inr(s.sf)}.`,
  ].join('\n');
const raisingKept = keeper<Raising>();

const raisingSet = (s: Raising): CaseSetParts => ({
  task: 'Pass the journal entries for the issue of the shares, the issue of the debentures and the repayment of the loan.',
  transactions: s.transactions,
  hints: [S.H.issue[0], 'Debentures are credited with their nominal value; a repayment of a loan reduces Bank Loan A/c.'],
  distractorAccounts: ['equityShareAllotment', 'callsInAdvance', 'debentureApplication', 'interestPaid'],
});
const raisingSetHolds = (q: JournalSetQuestion): boolean => {
  const s = raisingKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(q.entries.map((e) => e.expected));
  return left('equityShareApplication') === 0 && left(D.DAA) === 0 && left('equityShareCapital') === -s.n * 10 && left('securitiesPremium') === -s.n * s.p && left(debentures(s.rate)) === -s.nDeb * 100 && left('bankLoan') === s.repaid && left('bank') === s.n * (10 + s.p) + s.nDeb * 100 - s.repaid;
};

function raisingStatement(s: Raising): CaseStatementParts {
  const interest = (s.loan * s.loanRate) / 100;
  const flows = [
    { label: CF_CASE.FINANCING_ROWS.shares, amt: s.n * (10 + s.p) },
    { label: CF_CASE.FINANCING_ROWS.debentures, amt: s.nDeb * 100 },
    { label: CF_CASE.FINANCING_ROWS.repaid, amt: -s.repaid },
    { label: CF_CASE.FINANCING_ROWS.loanInterest, amt: -interest },
    { label: CF_CASE.FINANCING_ROWS.dividend, also: [CF_CASE.FINANCING_ROWS.final], amt: -s.prev },
  ];
  const net = sum(flows.map((x) => x.amt));
  return {
    task: `Starting from the entries, prepare the statement of Cash Flow from Financing Activities of ${s.co} for the year ended ${Y1}. ${CF_CASE.SIGN_RULE}`,
    title: `Cash Flow from Financing Activities of ${s.co} for the year ended ${Y1}`,
    columns: CF_CASE.CF_COLUMNS,
    rows: [{ heading: CF_CASE.HEAD_C }, ...flows.map((x) => ({ label: x.label, amount: rupees(x.amt), ...(x.also ? { also: x.also } : {}) })), { subtotal: CF_CASE.NET_C, amount: rupees(net), sum: 'section' }],
    distractors: ['Interest paid on debentures', 'Proceeds from long-term bank loan', 'Securities premium received', 'Refund of share application money', 'Proposed dividend of the current year'],
    explanation: [
      `Proceeds from issue of shares = what the company kept: ${cnt(s.n)} x ${inr(10 + s.p)} = ${inr(s.n * (10 + s.p))}${s.applied > s.n ? `; the ${inr((s.applied - s.n) * (10 + s.p))} refunded came in and went out again` : ''}.`,
      `Proceeds from issue of debentures ${inr(s.nDeb * 100)}; repayment of the loan (${inr(s.repaid)}); interest paid on the loan (${inr(interest)}), a cost of finance for a company that is not a financing company; dividend paid (${inr(s.prev)}).`,
      `Net cash ${net < 0 ? 'used in' : 'from'} financing activities = ${CF_CASE.shown(net)}.`,
    ],
    hints: H.financing,
  };
}
const raisingStatementHolds = (q: StatementQuestion): boolean => {
  const s = raisingKept.of(q.context ?? '');
  if (!s) return false;
  // What the set leaves in the bank, less the interest and the dividend the case gives.
  const bank = leftAfter(s.transactions.map((t) => t.lines))('bank');
  return subtotalsOf(q)[0] === rupees(bank - afterWords(q.context ?? '', 'Interest paid on the bank loan during the year: ₹') - afterWords(q.context ?? '', 'The dividend of ₹'));
};

function raisingGearing(s: Raising): NumericParts | null {
  const debt = s.loan - s.repaid + s.nDeb * 100;
  const n = times([debt, s.sf], [
    [[s.loan + s.nDeb * 100, s.sf], 'Forgot the part of the loan repaid.'],
    [[s.loan - s.repaid, s.sf], 'Left the debentures out of the debt.'],
    [[s.sf, debt], "Divided the shareholders' funds by the debt: the ratio is upside down."],
    [[debt, s.sf + debt], "Divided by debt plus shareholders' funds: that is the debt to capital employed ratio."],
  ]);
  return n && {
    prompt: `Find the debt to equity ratio as at ${Y1}, debt being long-term borrowings and equity shareholders' funds, ${AS_RATIO}.`,
    ...n,
    explanation: [`Debt = loan ${inr(s.loan)} - ${inr(s.repaid)} repaid + debentures ${inr(s.nDeb * 100)} = ${inr(debt)}.`, `Debt to equity ratio = ${inr(debt)} ÷ ${inr(s.sf)} = ${dec(n.answer)} : 1.`],
    hints: H.solvency,
  };
}
const raisingGearingHolds = (q: NumericQuestion): boolean => {
  const s = raisingKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(s.transactions.map((t) => t.lines), new Map([['bankLoan', -rupees(s.loan)]]));
  return nearTimes(q.answer, [-left('bankLoan') - left(debentures(s.rate)), afterWords(q.context ?? '', "the shareholders' funds were ₹")]);
};

const caseChainRaising = caseTemplate<Raising>({
  id: 'case-cy-chain-raising-money',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Raising money, and the financing activities',
  setup: (rng) =>
    firstGood(30, () => drawRaising(rng), (s) => {
      const ok = raisingGearing(s) !== null;
      if (ok) raisingKept.keep(raisingText(s), s);
      return ok;
    }),
  context: raisingText,
  parts: [
    { kind: 'journal_set', make: raisingSet, verify: raisingSetHolds },
    { kind: 'statement', make: raisingStatement, verify: raisingStatementHolds },
    { kind: 'numeric', unit: 'times', make: raisingGearing, verify: raisingGearingHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 23. case-cy-chain-comparative-cover: two years of a company whose finance costs are its debenture interest; more
//     debentures were issued during the later year, so its finance costs are worked out from the debentures. The
//     comparative Statement of Profit and Loss (the given figures printed, the finance costs and the tax worked out),
//     then the interest coverage ratio of each year.
//     It is the one chained case of the stage with a single kind of book: one statement and the ratios worked from
//     it, as the board sets a question of analysis. It is kept so on purpose (a set of entries for the debenture
//     interest would only repeat case 18); it still draws on three topics (debentures, financial statement analysis,
//     accounting ratios), and its title says what it is.
// ---------------------------------------------------------------------------------------------------------------

type Pair2 = [number, number];
interface CoverYears {
  co: string;
  trade: string;
  rev: Pair2;
  oi: Pair2;
  cmc: Pair2;
  ebe: Pair2;
  oe: Pair2;
  old: number;
  oldRate: number;
  fresh: number;
  rate: number;
  month: string;
  months: number;
  tax: number;
}
const coverYearsFigures = (s: CoverYears) => {
  const fc: Pair2 = [(s.old * s.oldRate) / 100, (s.old * s.oldRate) / 100 + (s.fresh * s.rate * s.months) / 1200];
  const at = (k: 0 | 1) => {
    const income = s.rev[k] + s.oi[k];
    const spent = s.cmc[k] + s.ebe[k] + fc[k] + s.oe[k];
    const pbt = income - spent;
    const tax = (pbt * s.tax) / 100;
    return { income, spent, pbt, tax, pat: pbt - tax };
  };
  return { fc, y: [at(0), at(1)] as const };
};
function drawCoverYears(rng: Rng): CoverYears | null {
  const { co, trade } = firm(rng);
  const rev0 = 100000 * rng.int(40, 120);
  const g = rng.pick([5, 8, 10, 12, 15, 20]);
  const near = (v: number, pct: number): number => Math.round((v * pct) / 100 / 10000) * 10000;
  const pairOf = (lo: number, hi: number, spread: number): Pair2 => {
    const a = near(rev0, rng.int(lo, hi));
    return [a, near(a, 100 + g + rng.int(-spread, spread))];
  };
  const when = rng.pick(D.ISSUE_DATES);
  const fresh = rng.step(500000, 2000000, 100000);
  const rate = D.wholeRate(rng, fresh, [when.months]);
  if (rate === null) return null;
  const old = rng.step(1000000, 3000000, 100000);
  const s: CoverYears = {
    co, trade, rev: [rev0, near(rev0, 100 + g)], oi: [10000 * rng.int(3, 12), 10000 * rng.int(3, 12)], cmc: pairOf(48, 58, 4), ebe: pairOf(10, 15, 5), oe: pairOf(7, 11, 6),
    old, oldRate: rng.pick(D.RATES.filter((r) => r !== rate)), fresh, rate, month: `${when.month} ${when.nextYear ? 2026 : 2025}`, months: when.months, tax: rng.pick([25, 30]),
  };
  const f = coverYearsFigures(s);
  if (f.y.some((y) => y.pbt * 100 < 4 * s.rev[0] || (y.pbt * s.tax) % 100 !== 0) || s.oi[0] === s.oi[1]) return null;
  return s;
}
const COVER_PER = { a: PREV, b: YEAR, inA: `in ${PREV}`, inB: `in ${YEAR}`, bs: false, statement: 'Statement of Profit and Loss' };
const coverYearsText = (s: CoverYears): string =>
  [
    `${s.co}, ${s.trade}, gives these figures from its Statements of Profit and Loss for ${PREV} and ${YEAR}:`,
    `Revenue from operations: ${inr(s.rev[0])} (${PREV}), ${inr(s.rev[1])} (${YEAR})`,
    `Other income: ${inr(s.oi[0])} (${PREV}), ${inr(s.oi[1])} (${YEAR})`,
    `Cost of materials consumed: ${inr(s.cmc[0])} (${PREV}), ${inr(s.cmc[1])} (${YEAR})`,
    `Employee benefits expense: ${inr(s.ebe[0])} (${PREV}), ${inr(s.ebe[1])} (${YEAR})`,
    `Other expenses: ${inr(s.oe[0])} (${PREV}), ${inr(s.oe[1])} (${YEAR})`,
    `Its finance costs are the interest on its debentures, its only borrowing: ${s.oldRate}% Debentures of ${inr(s.old)}, outstanding throughout both years, and ${s.rate}% Debentures of ${inr(s.fresh)}, issued at par on 1 ${s.month}.`,
    `Tax is ${s.tax}% of the profit before tax in both years. These lines, the finance costs and tax are the whole of each statement.`,
  ].join('\n');
const coverYearsKept = keeper<CoverYears>();

function coverYearsStatement(s: CoverYears): CaseStatementParts | null {
  const f = coverYearsFigures(s);
  const ch = (v: Pair2): number[] | null => FSA_CASE.changeFigures(v);
  const lines: [string, Pair2, 'row' | 'worked' | 'block' | 'section' | 'diff'][] = [
    ['Revenue from operations', s.rev, 'row'],
    ['Other income', s.oi, 'row'],
    ['Total income', [f.y[0].income, f.y[1].income], 'block'],
    ['Cost of materials consumed', s.cmc, 'row'],
    ['Employee benefits expense', s.ebe, 'row'],
    ['Finance costs', f.fc, 'worked'],
    ['Other expenses', s.oe, 'row'],
    ['Total expenses', [f.y[0].spent, f.y[1].spent], 'section'],
    ['Profit before tax', [f.y[0].pbt, f.y[1].pbt], 'diff'],
    ['Tax', [f.y[0].tax, f.y[1].tax], 'worked'],
    ['Profit after tax', [f.y[0].pat, f.y[1].pat], 'diff'],
  ];
  const rows: Row[] = [];
  for (const [name, v, how] of lines) {
    const amounts = ch(v);
    if (!amounts) return null;
    if (name === 'Cost of materials consumed') rows.push({ heading: 'Expenses' });
    if (how === 'row') rows.push({ label: name, amounts });
    else if (how === 'worked') rows.push({ label: name, amounts, given: false, ...(name === 'Tax' ? { also: [FSA_CASE.TAX_EXPENSE] } : {}) });
    else rows.push({ subtotal: name, amounts, ...(how === 'diff' ? {} : { sum: how }) });
  }
  return {
    task: `Prepare the Comparative Statement of Profit and Loss of ${s.co} for ${PREV} and ${YEAR}. ${FSA_CASE.PRINTED} Work out the finance costs and the tax of each year. ${FSA_CASE.CHANGE_RULES}`,
    title: `Comparative Statement of Profit and Loss of ${s.co} for ${PREV} and ${YEAR}`,
    columns: FSA_CASE.changeColumns(COVER_PER, true),
    rows,
    distractors: ['Purchases of stock-in-trade', 'Depreciation and amortisation expense', 'Gross profit'],
    explanation: [
      `Finance costs: ${PREV}, ${s.oldRate}% of ${inr(s.old)} = ${inr(f.fc[0])}; ${YEAR}, ${inr(f.fc[0])} + ${s.rate}% of ${inr(s.fresh)} for ${s.months} months, ${inr(f.fc[1] - f.fc[0])} = ${inr(f.fc[1])}.`,
      `Total income ${inr(f.y[0].income)} and ${inr(f.y[1].income)}; total expenses ${inr(f.y[0].spent)} and ${inr(f.y[1].spent)}; profit before tax ${inr(f.y[0].pbt)} and ${inr(f.y[1].pbt)}; tax at ${s.tax}% ${inr(f.y[0].tax)} and ${inr(f.y[1].tax)}; profit after tax ${inr(f.y[0].pat)} and ${inr(f.y[1].pat)}.`,
      `Absolute change = figure of ${YEAR} less figure of ${PREV}; percentage change = absolute change ÷ figure of ${PREV} × 100. A total or a profit has its own change, worked on its own figures.`,
      FSA_CASE.TAX_NAMES,
    ],
    hints: FSA_CASE.FORMAT_HINTS.change,
  };
}
const coverYearsStatementHolds = (q: StatementQuestion): boolean => {
  const s = coverYearsKept.of(q.context ?? '');
  if (!s) return false;
  const fc = (k: 0 | 1): number => (s.old * s.oldRate) / 100 + (k === 1 ? (s.fresh * s.rate * s.months) / 1200 : 0);
  const of = (name: string): number[] => q.rows.find((r) => r.label === name)?.amounts ?? (q.lines ?? []).flatMap((l) => ('subtotal' in l && l.subtotal === name ? [l.amounts] : []))[0] ?? [];
  const pbt = (k: 0 | 1): number => s.rev[k] + s.oi[k] - s.cmc[k] - s.ebe[k] - s.oe[k] - fc(k);
  const all = [...q.rows.map((r) => r.amounts), ...subtotalsAll(q)];
  return (
    all.every(([a, b, change, p]) => change === b - a && (change === 0 ? p === 0 : Math.sign(p) === Math.sign(change) && AN.nearest(Math.abs(p), [Math.abs(change), a], AN.PERCENT))) &&
    of('Finance costs')[0] === rupees(fc(0)) && of('Finance costs')[1] === rupees(fc(1)) &&
    of('Profit before tax')[0] === rupees(pbt(0)) && of('Profit before tax')[1] === rupees(pbt(1)) &&
    of('Profit after tax')[1] === rupees((pbt(1) * (100 - s.tax)) / 100)
  );
};

function coverYearsRatio(k: 0 | 1) {
  return (s: CoverYears): NumericParts | null => {
    const f = coverYearsFigures(s);
    const y = f.y[k];
    const fc = f.fc[k];
    const n = times([y.pbt + fc, fc], [
      [[y.pbt, fc], 'Divided the profit before tax; the interest has to be added back first.'],
      [[y.pat + fc, fc], 'Added the interest to the profit after tax; the tax has to be added back too.'],
      k === 1 && [[y.pbt + fc, f.fc[0] + (s.fresh * s.rate) / 100], 'Charged a full year of interest on the new debentures.'],
      k === 1 && [[y.pbt + fc, f.fc[0]], 'Left the interest on the new debentures out.'],
      k === 0 && [[y.pbt + fc, f.fc[1]], `Used the interest of ${YEAR}.`],
      [[fc, y.pbt + fc], 'Divided the interest by the profit: upside down.'],
    ]);
    return n && {
      prompt: `Starting from the statement, find the interest coverage ratio for ${k === 0 ? PREV : YEAR}, ${IN_TIMES}.`,
      ...n,
      explanation: [`Profit before interest and tax = ${inr(y.pbt)} + ${inr(fc)} = ${inr(y.pbt + fc)}.`, `Interest coverage ratio = ${inr(y.pbt + fc)} ÷ ${inr(fc)} = ${dec(n.answer)} times.`],
      hints: ['Interest coverage ratio = profit before interest and tax ÷ interest on long-term debt.', 'The finance costs here are all interest on debentures.'],
    };
  };
}
const coverYearsRatioHolds = (q: NumericQuestion): boolean => {
  const s = coverYearsKept.of(q.context ?? '');
  if (!s) return false;
  const k = q.prompt.includes(`for ${YEAR}`) ? 1 : 0;
  const fc = (s.old * s.oldRate) / 100 + (k === 1 ? (s.fresh * s.rate * s.months) / 1200 : 0);
  // The profit before interest straight from the lines: income less every expense but the interest.
  return nearTimes(q.answer, [s.rev[k] + s.oi[k] - s.cmc[k] - s.ebe[k] - s.oe[k], fc]);
};

const caseChainCoverYears = caseTemplate<CoverYears>({
  id: 'case-cy-chain-comparative-cover',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A comparative Statement of Profit and Loss and its interest cover',
  setup: (rng) =>
    firstGood(40, () => drawCoverYears(rng), (s) => {
      const ok = coverYearsStatement(s) !== null && coverYearsRatio(0)(s) !== null && coverYearsRatio(1)(s) !== null;
      if (ok) coverYearsKept.keep(coverYearsText(s), s);
      return ok;
    }),
  context: coverYearsText,
  parts: [
    { kind: 'statement', make: coverYearsStatement, verify: coverYearsStatementHolds },
    { kind: 'numeric', unit: 'times', make: coverYearsRatio(0), verify: coverYearsRatioHolds },
    { kind: 'numeric', unit: 'times', make: coverYearsRatio(1), verify: coverYearsRatioHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 24. case-cy-chain-issue-common-size: a company's balance sheet just before it issues shares at a premium and
//     debentures at par on one day, the whole price of each with the application. The set of the four entries, then
//     the common size balance sheet immediately after (total = 100; the lines the issues did not change printed),
//     then the proprietary ratio on total assets.
// ---------------------------------------------------------------------------------------------------------------

const CB = { sc: 'Share capital', rs: 'Reserves and surplus', ltb: 'Long-term borrowings', tp: 'Trade payables', ppe: 'Property, plant and equipment', inv: 'Inventories', tr: 'Trade receivables', cash: 'Cash and cash equivalents' } as const;
type CbKey = keyof typeof CB;
const CB_FUNDS: CbKey[] = ['sc', 'rs', 'ltb', 'tp'];
const CB_ASSETS: CbKey[] = ['ppe', 'inv', 'tr', 'cash'];
interface IssueShare {
  co: string;
  trade: string;
  before: Record<CbKey, number>;
  n: number;
  p: number;
  nDeb: number;
  rate: number;
  date: string;
  transactions: SetTransaction[];
}
const issueShareAfter = (s: IssueShare): Record<CbKey, number> => ({
  ...s.before,
  sc: s.before.sc + 10 * s.n,
  rs: s.before.rs + s.n * s.p,
  ltb: s.before.ltb + 100 * s.nDeb,
  cash: s.before.cash + s.n * (10 + s.p) + 100 * s.nDeb,
});
const CHANGED: CbKey[] = ['sc', 'rs', 'ltb', 'cash'];
/** The common size percentages of the balance sheet after the issues; null when a half does not come to exactly 100. */
function issueShares(s: IssueShare) {
  const after = issueShareAfter(s);
  const total = sum(CB_ASSETS.map((key) => after[key]));
  const p = Object.fromEntries((Object.keys(CB) as CbKey[]).map((key) => [key, pct2(after[key], total)])) as Record<CbKey, number | null>;
  if (Object.values(p).some((x) => x === null)) return null;
  const pp = p as Record<CbKey, number>;
  if (sum(CB_FUNDS.map((key) => pp[key])) !== 10000 || sum(CB_ASSETS.map((key) => pp[key])) !== 10000) return null;
  return { after, total, p: pp };
}
function drawIssueShare(rng: Rng): IssueShare | null {
  const { co, trade } = firm(rng);
  const k = (min: number, max: number, step: number): number => rng.step(min, max, step);
  const before = { sc: 10 * k(100000, 500000, 10000), rs: k(500000, 3000000, 10000), ltb: rng.int(0, 1) * k(500000, 2000000, 100000), tp: k(300000, 1500000, 10000), ppe: 0, inv: k(500000, 2500000, 10000), tr: k(300000, 1500000, 10000), cash: k(100000, 600000, 10000) };
  before.ppe = before.sc + before.rs + before.ltb + before.tp - before.inv - before.tr - before.cash;
  if (before.ppe * 100 < 35 * (before.sc + before.rs + before.ltb + before.tp)) return null;
  const month = rng.pick(['May', 'June', 'July', 'August', 'September', 'October']);
  const date = `${rng.int(1, 28)} ${month} 2025`;
  const n = Math.round(((before.sc / 10) * rng.pick([20, 25, 30, 40])) / 100 / 5000) * 5000;
  const p = rng.pick([2, 3, 5, 8, 10]);
  const nDeb = rng.step(2000, 15000, 1000);
  const rate = rng.pick(D.RATES);
  const price = 10 + p;
  const transactions: SetTransaction[] = [
    D.on(date, 'Application money received on the shares.', [S.dr('bank', n * price), S.cr('equityShareApplication', n * price)], [`${cnt(n)} x ${inr(price)} = ${inr(n * price)} received: Bank A/c is debited.`, 'Equity Share Application A/c is credited until allotment.']),
    D.on(date, 'Shares allotted.', [S.dr('equityShareApplication', n * price), S.cr('equityShareCapital', n * 10), S.cr('securitiesPremium', n * p)], [`Equity Share Application A/c is debited and so closed.`, `Equity Share Capital A/c is credited with ${cnt(n)} x ₹10 = ${inr(n * 10)}, and Securities Premium A/c with ${cnt(n)} x ${inr(p)} = ${inr(n * p)}, the premium coming with the application.`]),
    D.on(date, 'Application money received on the debentures.', [S.dr('bank', nDeb * 100), S.cr(D.DAA, nDeb * 100)], [`${cnt(nDeb)} x ₹100 = ${inr(nDeb * 100)} received: Bank A/c is debited.`, 'Debenture Application and Allotment A/c is credited until allotment.']),
    D.on(date, 'Debentures allotted.', [S.dr(D.DAA, nDeb * 100), S.cr(debentures(rate), nDeb * 100)], ['Debenture Application and Allotment A/c is debited and so closed.', `${rate}% Debentures A/c is credited with the nominal value, ${inr(nDeb * 100)}.`]),
  ];
  return { co, trade, before, n, p, nDeb, rate, date, transactions };
}
const issueShareText = (s: IssueShare): string =>
  [
    `${s.co}, ${s.trade}, gives the whole of its balance sheet just before ${s.date}:`,
    ...CB_FUNDS.filter((key) => s.before[key] > 0).map((key) => `${CB[key]}: ${inr(s.before[key])}`),
    ...CB_ASSETS.map((key) => `${CB[key]}: ${inr(s.before[key])}`),
    ...(s.before.ltb > 0 ? [] : ['It had no borrowings.']),
    `On ${s.date} it issued ${cnt(s.n)} equity shares of ₹10 each at a premium of ${inr(s.p)} a share and ${cnt(s.nDeb)}, ${s.rate}% Debentures of ₹100 each at par, the whole price of each payable on application. Both issues were fully subscribed, allotted the same day, and all money was received by cheque. Nothing else happened that day.`,
    'Securities Premium is part of reserves and surplus; debentures are long-term borrowings.',
  ].join('\n');
const issueShareKept = keeper<IssueShare>();

const issueShareSet = (s: IssueShare): CaseSetParts => ({
  task: 'Pass the journal entries for the two issues.',
  transactions: s.transactions,
  hints: [S.H.issue[1], 'Debentures are credited with their nominal value.'],
  distractorAccounts: ['equityShareAllotment', 'debentureApplication', 'callsInAdvance', 'capitalReserve'],
});
const issueShareSetHolds = (q: JournalSetQuestion): boolean => {
  const s = issueShareKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(q.entries.map((e) => e.expected));
  return left('equityShareApplication') === 0 && left(D.DAA) === 0 && left('bank') === s.n * (10 + s.p) + s.nDeb * 100 && left('equityShareCapital') === -s.n * 10 && left('securitiesPremium') === -s.n * s.p && left(debentures(s.rate)) === -s.nDeb * 100;
};

function issueShareStatement(s: IssueShare): CaseStatementParts | null {
  const w = issueShares(s);
  if (!w) return null;
  const row = (key: CbKey): Row => ({ label: CB[key], amounts: [rupees(w.after[key]), w.p[key]], ...(CHANGED.includes(key) ? { given: false } : {}) });
  return {
    task: `Starting from the entries, prepare the Common Size Balance Sheet of ${s.co} immediately after the issues (total of the balance sheet = 100). The amounts the issues did not change are printed as you choose each line; work out the others. Give every percentage to two decimal places.`,
    title: `Common Size Balance Sheet of ${s.co} immediately after the issues of ${s.date}`,
    columns: [{ name: 'Amount (₹)', given: true }, { name: 'Percentage of total (%)', unit: 'percent', adds: true }],
    rows: [
      { heading: 'I. EQUITY AND LIABILITIES' },
      { heading: "1. Shareholders' funds" }, row('sc'), row('rs'),
      { heading: '2. Non-current liabilities' }, row('ltb'),
      { heading: '3. Current liabilities' }, row('tp'),
      { subtotal: 'Total', amounts: [rupees(w.total), 10000], sum: 'all' },
      { heading: 'II. ASSETS' },
      { heading: '1. Non-current assets' }, row('ppe'),
      { heading: '2. Current assets' }, row('inv'), row('tr'), row('cash'),
      { subtotal: 'Total', amounts: [rupees(w.total), 10000], sum: 'block' },
    ],
    distractors: ['Securities premium', 'Other long-term liabilities', 'Short-term borrowings', 'Non-current investments'],
    explanation: [
      `After the issues: share capital ${inr(s.before.sc)} + ${inr(10 * s.n)} = ${inr(w.after.sc)}; reserves and surplus ${inr(s.before.rs)} + premium ${inr(s.n * s.p)} = ${inr(w.after.rs)}; long-term borrowings ${s.before.ltb > 0 ? `${inr(s.before.ltb)} + ${inr(100 * s.nDeb)} = ` : 'the debentures '}${inr(w.after.ltb)}; cash ${inr(s.before.cash)} + ${inr(s.n * (10 + s.p))} + ${inr(100 * s.nDeb)} = ${inr(w.after.cash)}.`,
      `Total of the balance sheet = ${inr(w.total)}, the base: it is 100 in each half.`,
      `Share capital: ${inr(w.after.sc)} ÷ ${inr(w.total)} × 100 = ${pc(w.p.sc)}. Every line is divided by the same total.`,
    ],
    hints: FSA_CASE.FORMAT_HINTS.shareBs,
  };
}
const issueShareStatementHolds = (q: StatementQuestion): boolean => {
  const s = issueShareKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(s.transactions.map((t) => t.lines));
  const after = { ...s.before, sc: s.before.sc - left('equityShareCapital'), rs: s.before.rs - left('securitiesPremium'), ltb: s.before.ltb - left(debentures(s.rate)), cash: s.before.cash + left('bank') } as Record<CbKey, number>;
  const total = sum(CB_ASSETS.map((key) => after[key]));
  return sum(CB_FUNDS.map((key) => after[key])) === total && q.rows.every((r) => {
    const key = (Object.keys(CB) as CbKey[]).find((x) => CB[x] === r.label);
    return !!key && r.amounts[0] === rupees(after[key]) && AN.nearest(r.amounts[1], [after[key], total], AN.PERCENT);
  });
};

function issueShareProprietary(s: IssueShare): NumericParts | null {
  const w = issueShares(s);
  if (!w) return null;
  const sf = w.after.sc + w.after.rs;
  const n = times([sf, w.total], [
    [[s.before.sc + s.before.rs, sum(CB_ASSETS.map((key) => s.before[key]))], 'Worked the ratio on the balance sheet before the issues.'],
    [[sf + w.after.ltb, w.total], "Counted the debentures in the shareholders' funds."],
    [[w.total, sf], 'Upside down.'],
    [[w.after.sc, w.total], "Took the share capital alone; reserves and surplus are part of the shareholders' funds."],
  ]);
  return n && {
    prompt: `Find the proprietary ratio immediately after the issues, worked on total assets (shareholders' funds ÷ total assets), ${AS_RATIO}.`,
    ...n,
    explanation: [`Shareholders' funds = ${inr(w.after.sc)} + ${inr(w.after.rs)} = ${inr(sf)}; total assets = ${inr(w.total)}.`, `Proprietary ratio = ${inr(sf)} ÷ ${inr(w.total)} = ${dec(n.answer)} : 1: the common size percentages of share capital and reserves, ${pc(w.p.sc)} + ${pc(w.p.rs)}, say the same.`],
    hints: H.solvency,
  };
}
const issueShareProprietaryHolds = (q: NumericQuestion): boolean => {
  const s = issueShareKept.of(q.context ?? '');
  if (!s) return false;
  const left = leftAfter(s.transactions.map((t) => t.lines));
  return nearTimes(q.answer, [s.before.sc + s.before.rs - left('equityShareCapital') - left('securitiesPremium'), sum(CB_ASSETS.map((key) => s.before[key])) + left('bank')]);
};

const caseChainIssueShare = caseTemplate<IssueShare>({
  id: 'case-cy-chain-issue-common-size',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Two issues and the common size balance sheet',
  setup: (rng) =>
    firstGood(60, () => drawIssueShare(rng), (s) => {
      const ok = issueShareStatement(s) !== null && issueShareProprietary(s) !== null;
      if (ok) issueShareKept.keep(issueShareText(s), s);
      return ok;
    }),
  context: issueShareText,
  parts: [
    { kind: 'journal_set', make: issueShareSet, verify: issueShareSetHolds },
    { kind: 'statement', make: issueShareStatement, verify: issueShareStatementHolds },
    { kind: 'numeric', unit: 'times', make: issueShareProprietary, verify: issueShareProprietaryHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 25. case-cy-chain-spl-to-operating-cash: the list of a trading company again (the examined statement of the company
//     topic), with its receivables, payables and tax paid. The Statement of Profit and Loss; then, starting from its
//     profit before tax, the cash flow from operating activities; then the net profit ratio after tax.
// ---------------------------------------------------------------------------------------------------------------

interface SplCash {
  sp: SplCase;
  trade: string;
  tr: Pair2;
  tp: Pair2;
  taxPaid: number;
}
const splCashText = (s: SplCash): string =>
  [
    s.sp.parts.data.replace(`${s.sp.co} is a trading company.`, `${s.sp.co}, ${s.trade}, is a trading company and ${NOT_FINANCING}.`),
    `Trade receivables were ${inr(s.tr[0])} at the start of the year and ${inr(s.tr[1])} at its end; trade payables were ${inr(s.tp[0])} and ${inr(s.tp[1])}.`,
    `Income tax paid during the year was ${inr(s.taxPaid)}. The interest on fixed deposits was received in cash, and every finance cost was paid in cash.`,
  ].join('\n');
/** The operating section from the figures of the statement and the balances of the case. */
function splCashSection(f: Map<PlLine, number>, tr: Pair2, tp: Pair2, taxPaid: number, stock: Pair2) {
  const g = (l: PlLine): number => f.get(l) ?? 0;
  const pbt = g('rfo') + g('oi') - sum((['pst', 'chg', 'ebe', 'fc', 'dep', 'oe'] as PlLine[]).map(g));
  const op = pbt + g('dep') + g('fc') - g('oi');
  const cgo = op - (stock[1] - stock[0]) - (tr[1] - tr[0]) + (tp[1] - tp[0]);
  return { pbt, op, cgo, net: cgo - taxPaid };
}
const stockOf = (data: string): Pair2 => [lineIn(data, 'Stock-in-trade, opening inventory'), lineIn(data, 'Stock-in-trade, closing inventory')];
const splCashKept = keeper<SplCash>();

function splCashStatement(s: SplCash): CaseStatementParts | null {
  const g = (l: PlLine): number => s.sp.figures.get(l) ?? 0;
  const stock = stockOf(s.sp.parts.data);
  const w = splCashSection(s.sp.figures, s.tr, s.tp, s.taxPaid, stock);
  const adjusts = [
    { label: 'Depreciation and amortisation expense', amt: g('dep'), why: `Depreciation, ${inr(g('dep'))}, is ${CF_CASE.NON_CASH}.` },
    ...(g('fc') > 0 ? [{ label: 'Finance costs', amt: g('fc'), why: `Finance costs, ${inr(g('fc'))}, are ${CF_CASE.FINANCE_COST}.` }] : []),
    { label: 'Interest received', amt: -g('oi'), why: `Interest on fixed deposits, ${inr(g('oi'))}, is income of an investing activity for a company that is not a financing company: it is deducted here.` },
  ];
  const wc = [
    { label: 'Inventories', kind: 'A' as const, open: stock[0], close: stock[1] },
    { label: 'Trade receivables', kind: 'A' as const, open: s.tr[0], close: s.tr[1] },
    { label: 'Trade payables', kind: 'L' as const, open: s.tp[0], close: s.tp[1] },
  ];
  const part = CF_CASE.operatingRows(w.pbt, adjusts, wc, s.taxPaid);
  if (part.net !== w.net || part.net <= 0) return null;
  return {
    task: `Starting from the profit before tax of the Statement of Profit and Loss, prepare the statement of Cash Flow from Operating Activities of ${s.sp.co} for the year by the indirect method. ${CF_CASE.SIGN_RULE}`,
    title: `Cash Flow from Operating Activities of ${s.sp.co} for the year ended 31 March ${s.sp.y}`,
    columns: CF_CASE.CF_COLUMNS,
    rows: [{ heading: CF_CASE.HEAD_A }, ...part.rows],
    distractors: ['Provision for tax made', 'Dividend received', 'Profit on sale of machinery', 'Increase in provision for tax', ...wc.map((b) => CF_CASE.wcName(b, b.close < b.open))],
    explanation: [`The statement starts from the profit before tax, ${inr(w.pbt)}.`, ...part.steps, `Income tax paid, ${inr(s.taxPaid)}, is deducted: ${CF_CASE.NET_A.replace(' (used in)', '')} = ${inr(part.cgo)} - ${inr(s.taxPaid)} = ${inr(part.net)}.`],
    hints: ['Add back what was charged without cash going out, or belongs to financing; take off income that belongs to investing.', CF_CASE.H.wc[0]],
  };
}
const splCashStatementHolds = (q: StatementQuestion): boolean => {
  const text = q.context ?? '';
  const f = splFromData(text);
  if (!f) return false;
  const two = (what: string): Pair2 => {
    const m = new RegExp(`${what} were ₹([\\d,]+) at the start of the year and ₹([\\d,]+)`).exec(text) ?? new RegExp(`${what} were ₹([\\d,]+) and ₹([\\d,]+)`).exec(text);
    return m ? [Number(m[1].replace(/,/g, '')), Number(m[2].replace(/,/g, ''))] : [NaN, NaN];
  };
  const w = splCashSection(f, two('Trade receivables'), two('trade payables'), afterWords(text, 'Income tax paid during the year was ₹'), stockOf(text));
  const totals = subtotalsAll(q).map((a) => a[0] / 100);
  return q.rows[0].amounts[0] === rupees(w.pbt) && totals[0] === w.op && totals[1] === w.cgo && totals[2] === w.net;
};

function splCashNet(s: SplCash): NumericParts | null {
  const g = (l: PlLine): number => s.sp.figures.get(l) ?? 0;
  const pbt = splCashSection(s.sp.figures, s.tr, s.tp, s.taxPaid, stockOf(s.sp.parts.data)).pbt;
  const pat = pbt - g('tax');
  const n = percent([pat, g('rfo')], [
    [[pbt, g('rfo')], 'Used the profit before tax; the ratio is asked on the profit after tax.'],
    [[pat, g('rfo') + g('oi')], 'Divided by total income; the ratio is on revenue from operations.'],
    [[pbt - s.taxPaid, g('rfo')], 'Took off the tax paid in cash instead of the tax expense of the year.'],
  ]);
  return n && {
    prompt: `Find the net profit ratio of ${s.sp.co} for the year on its profit after tax, ${AS_PERCENT}.`,
    ...n,
    explanation: [`Profit for the period = ${inr(pbt)} - tax expense ${inr(g('tax'))} = ${inr(pat)}.`, `Net profit ratio = ${inr(pat)} ÷ ${inr(g('rfo'))} × 100 = ${pc(n.answer)}.`],
    hints: ['Net profit ratio = profit after tax ÷ revenue from operations × 100.', 'The tax expense of the statement, not the tax paid in cash.'],
  };
}
const splCashNetHolds = (q: NumericQuestion): boolean => {
  const f = splFromData(q.context ?? '');
  if (!f) return false;
  const g = (l: PlLine): number => f.get(l) ?? 0;
  return nearPercent(q.answer, [g('rfo') + g('oi') - sum((['pst', 'chg', 'ebe', 'fc', 'dep', 'oe', 'tax'] as PlLine[]).map(g)), g('rfo')]);
};

const caseChainSplCash = caseTemplate<SplCash>({
  id: 'case-cy-chain-spl-to-operating-cash',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'From the Statement of Profit and Loss to the operating cash',
  setup: (rng) =>
    firstGood(
      40,
      () => {
        // The balances are drawn first, so that a seed does not give the company the statement case 20 gives it.
        const pair = (min: number, max: number): Pair2 => {
          const a = rng.step(min, max, 5000);
          return [a, a + rng.pick([-1, 1]) * rng.step(20000, 150000, 5000)];
        };
        const [tr, tp, shift] = [pair(400000, 1500000), pair(300000, 1200000), rng.pick([-4, -2, 2, 4])];
        const [name, trade] = rng.pick(DEALERS);
        const sp = completedYear(splStatement(rng, { name, trader: true, operating: true }));
        if (!sp) return null;
        return { sp, trade, tr, tp, taxPaid: Math.max(10000, (sp.figures.get('tax') ?? 0) + shift * 5000) };
      },
      (s) => {
        const ok = splCashStatement(s) !== null && splCashNet(s) !== null;
        if (ok) splCashKept.keep(splCashText(s), s);
        return ok;
      },
    ),
  context: splCashText,
  parts: [
    { kind: 'statement', make: (s) => { const { data, ...rest } = s.sp.parts; void data; return rest; }, verify: splStatementHolds },
    { kind: 'statement', make: splCashStatement, verify: splCashStatementHolds },
    { kind: 'numeric', unit: 'percent', make: splCashNet, verify: splCashNetHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 26. case-cy-chain-prorata-funds: a company already running makes a pro rata issue (with refusals in some seeds), in
//     three or four instalments at par or at a premium; one holder does not pay the last call and nothing is
//     forfeited. The set of the issue's entries, then the shareholders' funds in the balance sheet with the notes on
//     share capital and on reserves and surplus, then the proceeds of the issue in the Cash Flow Statement and the
//     percentage rise in the shareholders' funds.
// ---------------------------------------------------------------------------------------------------------------

interface ProFunds {
  co: string;
  trade: string;
  f: ScFloat;
  story: ReturnType<typeof S.stepsOf>;
  dates: string[];
  n0: number;
  sp0: number;
  surplus0: number;
  profit: number;
}
function drawProFunds(rng: Rng): ProFunds | null {
  const { co, trade } = firm(rng);
  const count = rng.pick([3, 3, 4] as const);
  const s = S.drawTerms(rng, count, rng.int(0, 2) > 0);
  s.arrears = rng.int(0, 1) === 0;
  const pro = S.drawRatio(rng, s);
  if (!pro) return null;
  const n = S.proIssue(rng, pro);
  const k = S.holding(rng, n, pro.b * 100, 1, 9);
  const d: ScDefaulter = { who: rng.pick(S.HOLDERS), k, applied: (k * pro.a) / pro.b, from: count - 1, forfeited: false };
  const f = S.seal({ co, s, offered: n, n, refused: rng.int(0, 1) === 0 ? 0 : rng.step(2000, 20000, 1000), pro, bad: [d], lots: [] });
  if (!f) return null;
  const story = S.stepsOf(f);
  const n0 = Math.round((n * rng.pick([150, 200, 300, 400])) / 100 / 1000) * 1000;
  const capital0 = n0 * s.face;
  return {
    co, trade, f, story, dates: S.datesFor(rng, story, 4, 2025), n0,
    sp0: rng.int(0, 1) === 0 ? 0 : Math.round((capital0 * rng.pick([5, 10, 20])) / 100 / 10000) * 10000,
    surplus0: Math.round((capital0 * rng.pick([20, 30, 40, 50])) / 100 / 10000) * 10000,
    profit: Math.round((capital0 * rng.pick([8, 10, 12, 15])) / 100 / 10000) * 10000,
  };
}
const proFundsText = (c: ProFunds): string => {
  const { f } = c;
  const s = f.s;
  const d = f.bad[0];
  return [
    `${c.co}, ${c.trade}, ${NOT_FINANCING}. On 1 April 2025 it had ${cnt(c.n0)} ${S.sharesOf(s)} in issue, all fully paid; Securities Premium ${c.sp0 > 0 ? inr(c.sp0) : 'nil'}; Surplus ${inr(c.surplus0)}.`,
    `During ${YEAR}: ${S.offerOf(f, 'it')}`,
    `Applications were received for ${cnt(S.allApplied(f))} shares. ${f.refused > 0 ? `The applications for ${cnt(f.refused)} shares were refused and the money on them returned; the ${cnt(f.n)} shares were allotted pro rata to the other applicants.` : `The ${cnt(f.n)} shares were allotted pro rata to all the applicants.`} ${S.proRule(s)}`,
    `${d.who}, who was allotted ${cnt(d.k)} shares, did not pay ${S.dues(s, d.from)}; every other amount called was received, and nothing was forfeited. Every call was made before ${Y1}. ${S.arrearsRule(s)}`,
    `The profit for the year, ${inr(c.profit)}, was all kept in Surplus. All money is received and paid through the bank. A line of the notes that comes to nil is left out.`,
  ].join('\n');
};
const proFundsKept = keeper<ProFunds>();
const proFundsTotals = (c: ProFunds) => {
  const s = c.f.s;
  const d = c.f.bad[0];
  const arrears = S.unpaidAll(c.f, d);
  const fully = (c.n0 + c.f.n - d.k) * s.face;
  const partly = d.k * s.face;
  const sc = fully + partly - arrears;
  const sp = c.sp0 + c.f.n * s.premium;
  const surplus = c.surplus0 + c.profit;
  return { arrears, fully, partly, sc, sp, surplus, rs: sp + surplus, sf: sc + sp + surplus, sf0: c.n0 * s.face + c.sp0 + c.surplus0, cash: c.f.n * (s.face + s.premium) - arrears };
};

const proFundsSet = (c: ProFunds): CaseSetParts => ({
  task: 'Pass the journal entries for the issue, from the applications to the last call.',
  transactions: c.story.map((st, i) => ({ date: c.dates[i], text: st.text, lines: st.lines, explanation: st.explanation })),
  hints: S.H.prorata,
  distractorAccounts: ['forfeitedShares', 'capitalReserve', 'callsInAdvance', c.f.s.arrears ? 'generalReserve' : 'callsInArrears'],
});
const proFundsSetHolds = (q: JournalSetQuestion): boolean => {
  const c = proFundsKept.of(q.context ?? '');
  return !!c && q.entries.length === c.story.length && q.entries.every((e, i) => S.sameEntry(e.expected, c.story[i].lines)) && S.storyHolds(c.f, c.story);
};

function proFundsStatement(c: ProFunds): CaseStatementParts {
  const t = proFundsTotals(c);
  const s = c.f.s;
  const d = c.f.bad[0];
  return {
    task: `Show the shareholders' funds of ${c.co} in its Balance Sheet as at ${Y1}, with Note 1 (Share capital) and Note 2 (Reserves and surplus). Show an amount that is deducted with a minus sign.`,
    title: `Balance Sheet of ${c.co} as at ${Y1} (extract), with its notes`,
    columns: [{ name: 'Amount (₹)', signed: true }],
    noteHeading: 'Note No.',
    rows: [
      { heading: 'I. EQUITY AND LIABILITIES' },
      { heading: "1. Shareholders' funds" },
      { label: 'Share capital', amount: rupees(t.sc), note: '1' },
      { label: 'Reserves and surplus', amount: rupees(t.rs), note: '2' },
      { heading: 'Note 1: Share capital (subscribed capital)' },
      { label: 'Subscribed and fully paid', amount: rupees(t.fully), details: [`${cnt(c.n0 + c.f.n - d.k)} ${S.sharesOf(s)}`] },
      { label: 'Subscribed but not fully paid', amount: rupees(t.partly), details: [`${cnt(d.k)} ${S.sharesOf(s)}, fully called up`] },
      { label: 'Less: Calls in arrears', amount: -rupees(t.arrears), also: ['Calls in arrears'] },
      { subtotal: 'Total share capital', amount: rupees(t.sc), sum: 'section' },
      { heading: 'Note 2: Reserves and surplus' },
      ...(t.sp > 0 ? [{ label: 'Securities premium', amount: rupees(t.sp) }] : []),
      { label: 'Surplus (balance in Statement of Profit and Loss)', amount: rupees(t.surplus) },
      { subtotal: 'Total reserves and surplus', amount: rupees(t.rs), sum: 'section' },
    ],
    distractors: ['Calls in advance', 'Forfeited shares (amount originally paid up)', 'Capital reserve', 'General reserve', 'Share application money pending allotment', ...(t.sp > 0 ? [] : ['Securities premium'])],
    explanation: [
      `Every call was made, so a share is fully paid unless something on it is unpaid: ${cnt(c.n0)} old + ${cnt(c.f.n)} new - ${cnt(d.k)} = ${cnt(c.n0 + c.f.n - d.k)} shares, ${inr(t.fully)}.`,
      `${d.who}'s ${cnt(d.k)} shares: called up ${inr(t.partly)}, less calls in arrears ${inr(t.arrears)}.${s.arrears ? '' : ' The company keeps no Calls in Arrears A/c, but the unpaid call is deducted in the note all the same.'}`,
      `Share capital = ${inr(t.fully)} + ${inr(t.partly)} - ${inr(t.arrears)} = ${inr(t.sc)}.`,
      `Reserves and surplus: ${t.sp > 0 ? `Securities premium ${c.sp0 > 0 && s.premium > 0 ? `${inr(c.sp0)} + ${inr(c.f.n * s.premium)} = ` : ''}${inr(t.sp)}${s.premium > 0 ? ', the premium credited when the allotment money fell due' : ''}; ` : ''}Surplus ${inr(c.surplus0)} + ${inr(c.profit)} = ${inr(t.surplus)}; total ${inr(t.rs)}.`,
    ],
    hints: S.H.note,
  };
}
const proFundsStatementHolds = (q: StatementQuestion): boolean => {
  const c = proFundsKept.of(q.context ?? '');
  if (!c) return false;
  const { ledger } = S.books(c.f.s);
  // The books: share capital is what they credit less what is still owed, and the money the bank holds is that capital and the premium.
  const owed = rupees(c.f.n * (c.f.s.face + c.f.s.premium)) - S.net(ledger, 'bank');
  const sc = rupees(c.n0 * c.f.s.face) - S.net(ledger, S.capitalId('equity')) - owed;
  const [scTotal, rsTotal] = subtotalsOf(q);
  return figureOf(q, 'Share capital') === sc && scTotal === sc && rsTotal === figureOf(q, 'Reserves and surplus') && rsTotal === rupees(c.sp0 + c.surplus0 + c.profit) - S.net(ledger, 'securitiesPremium');
};

function proFundsProceeds(c: ProFunds): NumericParts | null {
  const t = proFundsTotals(c);
  const s = c.f.s;
  const n = money(t.cash, [
    [c.f.n * (s.face + s.premium), `Took the whole issue price on every share, although ${t.arrears > 0 ? `${inr(t.arrears)} is still in arrears` : 'some is unpaid'}.`],
    [S.allApplied(c.f) * S.payable(s, 0) + t.cash - c.f.n * S.payable(s, 0) - S.excessOf(c.f), 'Counted the money returned on the refused applications as kept.'],
    s.premium > 0 && [t.cash - c.f.n * s.premium, 'Left out the premium received.'],
    [t.sc - c.n0 * s.face, 'Gave the rise in share capital; the premium received is part of the proceeds too.'],
  ]);
  return n && {
    prompt: `What does ${c.co} show in its Cash Flow Statement for ${YEAR} as the proceeds from the issue of shares?`,
    ...n,
    explanation: [`What stayed with the company: the issue price of every share allotted, ${cnt(c.f.n)} x ${inr(s.face + s.premium)} = ${inr(c.f.n * (s.face + s.premium))}, less the calls in arrears ${inr(t.arrears)} = ${inr(t.cash)}, a financing inflow.`, f0RefundNote(c)],
    hints: ['Money refunded and money not yet received are no proceeds.', 'Proceeds from issue of shares are a financing inflow.'],
  };
}
const f0RefundNote = (c: ProFunds): string => (c.f.refused > 0 ? `The money on the refused applications came in and went back in the same year, so it is left out.` : 'The excess application money of the pro rata allotment was kept and is part of what the shares brought in.');
const proFundsProceedsHolds = (q: NumericQuestion): boolean => {
  const c = proFundsKept.of(q.context ?? '');
  return !!c && q.answer === S.net(S.books(c.f.s).ledger, 'bank');
};

function proFundsChange(c: ProFunds): NumericParts | null {
  const t = proFundsTotals(c);
  const change = t.sf - t.sf0;
  const n = percent([change, t.sf0], [
    [[change, t.sf], `Divided the rise by the figure of ${Y1}; the base is the earlier figure.`],
    [[change + t.arrears, t.sf0], 'Did not deduct the calls in arrears.'],
    [[t.sc - c.n0 * c.f.s.face, c.n0 * c.f.s.face], 'Worked the rise in share capital alone.'],
    [[change - c.profit, t.sf0], 'Left out the profit kept in Surplus.'],
  ]);
  return n && {
    prompt: `By what percentage did the shareholders' funds rise from ${Y0} to ${Y1}? Work the change on the figure of ${Y0}, ${AS_PERCENT}.`,
    ...n,
    explanation: [`Shareholders' funds: ${inr(t.sf0)} on ${Y0}; ${inr(t.sc)} + ${inr(t.rs)} = ${inr(t.sf)} on ${Y1}.`, `Percentage change = ${inr(change)} ÷ ${inr(t.sf0)} × 100 = ${pc(n.answer)}.`],
    hints: H.change,
  };
}
const proFundsChangeHolds = (q: NumericQuestion): boolean => {
  const c = proFundsKept.of(q.context ?? '');
  if (!c) return false;
  const sf0 = c.n0 * c.f.s.face + c.sp0 + c.surplus0;
  // The rise another way: the cash the shares brought in, and the profit kept.
  return nearPercent(q.answer, [S.net(S.books(c.f.s).ledger, 'bank') / 100 + c.profit, sf0]);
};

const caseChainProFunds = caseTemplate<ProFunds>({
  id: 'case-cy-chain-prorata-funds',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "A pro rata issue and the shareholders' funds",
  setup: (rng) =>
    firstGood(30, () => drawProFunds(rng), (c) => {
      const ok = c.story.length <= 8 && proFundsProceeds(c) !== null && proFundsChange(c) !== null;
      if (ok) proFundsKept.keep(proFundsText(c), c);
      return ok;
    }),
  context: proFundsText,
  parts: [
    { kind: 'journal_set', make: proFundsSet, verify: proFundsSetHolds },
    { kind: 'statement', make: proFundsStatement, verify: proFundsStatementHolds },
    { kind: 'numeric', unit: 'rupees', make: proFundsProceeds, verify: proFundsProceedsHolds },
    { kind: 'numeric', unit: 'percent', make: proFundsChange, verify: proFundsChangeHolds },
  ],
});

const cases: CaseTemplate[] = [
  caseFiveWays, caseForfeitYear, caseVendorDebentures, caseEffectOfIssue, caseMargin, caseTwoSheets, caseArrears, caseProRata, casePremiumLoss, caseToRatio, caseCover, caseFinancing, caseShareOfTotal, caseMachineShares, caseRoi, caseOpCash,
  caseChainArrearsSheet, caseChainVendorYear, caseChainCashYear, caseChainSplShare, caseChainDebSolvency, caseChainRaising, caseChainCoverYears, caseChainIssueShare, caseChainSplCash, caseChainProFunds,
];

export default cases;
