import type { AccountQuestion, McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { accountOf, balanceOf, ledgerLabel, post, type DatedEntry } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { assertionReasonFacts, factsTemplate, accountTemplate, formatINR, keepFor, ledgerSides, mcqTemplate, numericTemplate, rupees, statementTemplate } from '../authoring';
import type { AccountParts, McqParts, NumericParts, StatementParts, Template } from '../types';

const T = 'cash-flow-statement';

// ---------------------------------------------------------------------------------------------------------------
// Conventions used throughout (and stated in the prompts that rely on them):
//  - AS 3 (Revised), indirect method; the accounting year is 2025-26, ending on 31 March 2026;
//  - a company is a non-financing company unless the prompt says it is a financing company: interest paid is a
//    financing outflow, interest and dividend received are investing inflows;
//  - bank overdraft and cash credit are short-term borrowings (financing); current investments are marketable
//    securities, that is, cash equivalents;
//  - the dividend proposed for the previous year is declared and paid in the current year; the dividend proposed for
//    the current year is not accounted for;
//  - with no other information, last year's provision for tax is paid this year and the closing provision is the
//    provision made this year;
//  - every figure is in whole rupees. A typed amount is positive: where a result may be an inflow or an outflow the
//    prompt says which it is ("net cash used in investing activities").
// ---------------------------------------------------------------------------------------------------------------

const Y0 = '31 March 2025';
const Y1 = '31 March 2026';
const YEAR = '2025-26';
const PREV = '2024-25';
const SURPLUS = 'Surplus (Balance in Statement of Profit and Loss)';
const NPBT = 'Net profit before tax and extraordinary items';
const NF = '(not a financing company)';

/** Companies that are not financing companies, each with the trade its name suggests. */
export const TRADE_OF: Record<string, string> = {
  'Sagar Mills Ltd.': 'a maker of cotton yarn',
  'Himadri Steels Ltd.': 'a maker of steel furniture',
  'Kaveri Textiles Ltd.': 'a garment exporter',
  'Narmada Foods Ltd.': 'a maker of packaged foods',
  'Vindhya Cements Ltd.': 'a cement manufacturer',
  'Malabar Spices Ltd.': 'a spice trading company',
  'Deccan Tools Ltd.': 'a maker of hand tools',
  'Ganga Papers Ltd.': 'a paper mill',
  'Aravali Motors Ltd.': 'a maker of auto parts',
  'Konkan Chemicals Ltd.': 'a maker of industrial chemicals',
};
const COMPANIES = Object.keys(TRADE_OF);
/** Financing companies: the name, and what the company is. */
const LENDERS: [string, string][] = [
  ['Sahyadri Housing Finance Ltd.', 'a housing finance company'],
  ['Nilgiri Finance Ltd.', 'a non-banking finance company'],
  ['Godavari Microfinance Ltd.', 'a microfinance company'],
  ['Satpura Credit Ltd.', 'a company whose main business is lending money'],
];
/** "X is a paper mill and is not a financing company" or "Y is a housing finance company, that is, a financing company". */
const introduce = (rng: Rng, fin: boolean): string => {
  if (fin) {
    const [name, what] = rng.pick(LENDERS);
    return `${name} is ${what}, that is, a financing company`;
  }
  const name = rng.pick(COMPANIES);
  return `${name} is ${TRADE_OF[name]} and is not a financing company`;
};

/** Whole rupees as the amount text a learner sees. */
const inr = (n: number): string => formatINR(rupees(n));
/** A whole number of rupees between two values, in steps. */
const k = (rng: Rng, min: number, max: number, step: number): number => rng.step(min, max, step);

const amountsIn = (s: string): number[] => (s.match(/₹\d+(?:,\d+)*/g) ?? []).map((x) => Number(x.slice(1).replace(/,/g, '')));
const ans = (q: NumericQuestion): number => q.answer / 100;
const optionText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;
const sum = (list: readonly number[]): number => list.reduce((s, x) => s + x, 0);

/** A line of data with one figure, and one with the balances of the two balance sheet dates. */
const one = (label: string, a: number): string => `${label}: ${inr(a)}`;
const two = (label: string, a: number, b: number): string => `${label}: ${inr(a)} on ${Y0}, ${inr(b)} on ${Y1}`;
/** The dividend proposed for each of the two years, as the notes to accounts give it: under AS 4 it is not a balance. */
const proposed = (prev: number, cur: number): string => `Proposed dividend: ${inr(prev)} for ${PREV}, ${inr(cur)} for ${YEAR}`;
/** A question and the data under it, one item to a line. */
const ask = (question: string, lines: string[]): string => [question, ...lines].join('\n');
/** The data lines of a prompt ("Label: ₹a ..."), by label, for `verify`. */
const rowsOf = (prompt: string): Map<string, number[]> =>
  new Map(
    prompt
      .split('\n')
      .slice(1)
      .filter((l) => l.includes(': '))
      .map((l): [string, number[]] => [l.slice(0, l.indexOf(': ')), amountsIn(l)]),
  );
/** The figures of one line of data; a missing line gives NaN, which fails every comparison. */
const row = (rows: Map<string, number[]>, label: string): number[] => rows.get(label) ?? [NaN, NaN];
const has = (rows: Map<string, number[]>, label: string): boolean => rows.has(label);

/** A numeric question's answer and errors, given in rupees. Null when fewer than two distinct usable errors remain. */
function numeric(answer: number, errs: [number, string][]): Pick<NumericParts, 'answer' | 'commonErrors'> | null {
  if (!Number.isInteger(answer) || answer <= 0) return null;
  const seen = new Set([answer]);
  const commonErrors: { value: number; why: string }[] = [];
  for (const [v, why] of errs) {
    if (Number.isInteger(v) && v > 0 && !seen.has(v)) {
      seen.add(v);
      commonErrors.push({ value: rupees(v), why });
    }
  }
  return commonErrors.length >= 2 ? { answer: rupees(answer), commonErrors } : null;
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

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** A prompt with every amount blanked, to find which item of a bank it was made from. */
const blank = (s: string): string => s.replace(/₹\d+(?:,\d+)*/g, '₹#');

const H = {
  heads: [
    'Operating: the main revenue-earning work. Investing: long-term assets and investments. Financing: share capital and borrowings.',
    'Ask first whether cash and cash equivalents change at all.',
  ],
  ce: [
    'Cash and cash equivalents: cash in hand, bank balances and short-term investments that mature within three months of purchase.',
    'Bank overdraft is treated as a short-term borrowing, not as a part of cash.',
  ],
  npbt: [
    'Start from the change in Surplus: closing balance less opening balance.',
    'Add back what was taken out of the profit of the year: the provision for tax, dividends paid and transfers to reserves.',
  ],
  adj: [
    'Add back expenses that used no cash or do not belong to operations; deduct incomes that belong to investing.',
    'For a non-financing company, interest paid is a financing item and interest or dividend received is an investing item.',
  ],
  wc: [
    'An increase in a current asset uses cash; an increase in a current liability saves cash. A decrease does the opposite.',
    'Cash, bank, current investments, short-term borrowings and provision for tax are not working capital changes here.',
  ],
  tax: [
    'Write up the Provision for tax account: opening balance + provision made = tax paid + closing balance.',
    'The provision made is added back to the profit; the tax paid is deducted after cash generated from operations.',
  ],
  asset: [
    'Rebuild the asset account. At cost: opening + purchases = cost of the asset sold + closing.',
    'Sale proceeds = book value of the asset sold + profit on sale, or - loss on sale.',
  ],
  fin: [
    'Financing: money raised from and returned to shareholders and lenders, and the interest and dividend paid to them.',
    'Bank overdraft and cash credit are short-term borrowings: a rise is an inflow, a fall is an outflow.',
  ],
  div: [
    'Only a dividend that has been declared is paid: the previous year\'s proposed dividend, and any interim dividend of this year.',
    'The dividend proposed for the current year waits for the shareholders\' approval, so it is not accounted for yet.',
  ],
  rec: [
    'Opening cash and cash equivalents + net increase (or - net decrease) = closing cash and cash equivalents.',
    'Cash "from" an activity is added; cash "used in" an activity is deducted.',
  ],
};

// ===============================================================================================================
// EASY
// ===============================================================================================================

export type Head = 'O' | 'I' | 'F' | 'N';
export const HEAD_TEXT: Record<Head, string> = {
  O: 'Operating activities',
  I: 'Investing activities',
  F: 'Financing activities',
  N: 'Under no head: cash and cash equivalents do not change',
};
export const HEAD_SLIP: Record<Head, string> = {
  O: 'Took it for a part of the main revenue-earning work of the company.',
  I: 'Took it for the purchase or sale of a long-term asset or an investment, or the income from one.',
  F: 'Took it for a change in share capital or borrowings, or the cost of servicing them.',
  N: 'Thought that cash and cash equivalents do not change here, although cash is received or paid.',
};

interface ClassifyItem {
  text: (x: string) => string;
  head: Head;
  because: string;
  /** The mistake behind a particular wrong head, where it is more telling than the general one. */
  slips?: Partial<Record<Head, string>>;
}
const CLASSIFY_ITEMS: ClassifyItem[] = [
  // Operating
  { text: (x) => `cash of ${x} collected from customers for goods sold`, head: 'O', because: 'Receipts from selling goods are the main revenue-earning work of the company.' },
  { text: (x) => `${x} paid to suppliers of raw material`, head: 'O', because: 'Payments for goods bought for the business are part of its main revenue-earning work.' },
  { text: (x) => `wages and salaries of ${x} paid to employees`, head: 'O', because: 'Payments to and for employees are operating outflows.' },
  { text: (x) => `income tax of ${x} paid on the profit of the business`, head: 'O', because: 'Income tax is an operating outflow unless it can be identified with an investing or a financing activity.',
    slips: { F: 'Took income tax for a distribution of profit like a dividend; tax on business profit is an operating outflow.' } },
  { text: (x) => `royalty of ${x} received for the use of its brand name`, head: 'O', because: 'Royalties, fees and commission are revenue of the business, so the receipt is an operating inflow.',
    slips: { I: 'Took a royalty for a return on an investment; royalties, fees and commission are revenue of the business.' } },
  { text: (x) => `office rent of ${x} paid`, head: 'O', because: 'Rent of the office is an expense of running the business.' },
  { text: (x) => `${x} paid for advertising its products`, head: 'O', because: 'Selling expenses are part of the main revenue-earning work.' },
  { text: (x) => `commission of ${x} received on sales made as an agent`, head: 'O', because: 'Commission earned in the course of business is operating revenue.' },
  // Investing
  { text: (x) => `machinery bought for ${x}, paid by cheque`, head: 'I', because: 'Buying a fixed asset is an investing outflow.',
    slips: { O: 'Took the purchase of a fixed asset for a purchase of goods or an expense of the year.' } },
  { text: (x) => `an old delivery van sold for ${x} in cash`, head: 'I', because: 'The proceeds of selling a fixed asset are an investing inflow.',
    slips: { O: 'Took the sale of a fixed asset for a sale of goods.' } },
  { text: (x) => `shares of another company bought for ${x}, to be held for three years`, head: 'I', because: 'Buying a non-current investment is an investing outflow.',
    slips: { F: 'Mixed up buying the shares of another company with issuing its own shares.' } },
  { text: (x) => `non-current investments sold for ${x}`, head: 'I', because: 'The proceeds of selling a non-current investment are an investing inflow.' },
  { text: (x) => `interest of ${x} received on debentures held as an investment`, head: 'I', because: 'For a non-financing company, interest received is a return on an investment: an investing inflow.',
    slips: { O: 'Took interest income for operating revenue because it is in the Statement of Profit and Loss; for a non-financing company it is a return on an investment.', F: 'Mixed up interest received with interest paid on borrowings.' } },
  { text: (x) => `dividend of ${x} received on shares held as an investment`, head: 'I', because: 'For a non-financing company, dividend received is a return on an investment: an investing inflow.',
    slips: { O: 'Took dividend income for operating revenue; for a non-financing company it is a return on an investment.', F: 'Mixed up dividend received with dividend paid to its own shareholders.' } },
  { text: (x) => `rent of ${x} received from a building let out to a tenant`, head: 'I', because: 'Rent from a let-out property is income from an asset held as an investment: an investing inflow.',
    slips: { O: 'Took rent from a let-out property for revenue from operations; it is income from an asset held as an investment.' } },
  { text: (x) => `a loan of ${x} given to another company`, head: 'I', because: 'For a non-financing company, a loan given to a third party is an investing outflow.',
    slips: { F: 'Mixed up a loan given with a loan taken.' } },
  { text: (x) => `a patent bought for ${x}`, head: 'I', because: 'A patent is an intangible fixed asset; buying it is an investing outflow.' },
  { text: (x) => `${x} paid to a contractor for a factory building under construction`, head: 'I', because: 'Money spent on capital work-in-progress is spent on a fixed asset: an investing outflow.',
    slips: { O: 'Took a payment for building a fixed asset for an expense of the year.' } },
  // Financing
  { text: (x) => `equity shares issued for cash, ${x} in all`, head: 'F', because: 'Money raised from shareholders is a financing inflow.',
    slips: { I: 'Mixed up issuing its own shares with investing in the shares of another company.' } },
  { text: (x) => `9% debentures of ${x} issued for cash`, head: 'F', because: 'Money borrowed on debentures is a financing inflow.',
    slips: { I: 'Mixed up issuing its own debentures with investing in the debentures of another company.' } },
  { text: (x) => `${x} of a long-term bank loan repaid`, head: 'F', because: 'Repaying a borrowing is a financing outflow.' },
  { text: (x) => `interest of ${x} paid on debentures`, head: 'F', because: 'For a non-financing company, interest on borrowings is the cost of finance: a financing outflow.',
    slips: { O: 'Took interest on borrowings for an operating expense because it is charged in the Statement of Profit and Loss; for a non-financing company it is a cost of finance.', I: 'Mixed up interest paid on borrowings with interest received on investments.' } },
  { text: (x) => `final dividend of ${x} paid to shareholders`, head: 'F', because: 'Dividend is paid to those who provide the share capital: a financing outflow.',
    slips: { O: 'Took dividend for an expense of running the business; it is paid to the providers of share capital.', I: 'Mixed up dividend paid with dividend received on investments.' } },
  { text: (x) => `interim dividend of ${x} paid`, head: 'F', because: 'Interim dividend, like final dividend, is paid to shareholders: a financing outflow.',
    slips: { O: 'Took dividend for an expense of running the business; it is paid to the providers of share capital.' } },
  { text: (x) => `a further ${x} drawn on bank overdraft`, head: 'F', because: 'Bank overdraft is treated as a short-term borrowing, so drawing more on it is a financing inflow.',
    slips: { O: 'Took bank overdraft for a working capital item; it is treated as a short-term borrowing.', N: 'Took bank overdraft for a negative bank balance inside cash and cash equivalents; it is treated as a short-term borrowing.' } },
  { text: (x) => `securities premium of ${x} received on shares issued for cash`, head: 'F', because: 'The premium is part of the money raised from shareholders: a financing inflow.' },
  { text: (x) => `a five-year loan of ${x} taken from a bank`, head: 'F', because: 'Money borrowed for the long term is a financing inflow.' },
  // No flow of cash
  { text: (x) => `machinery of ${x} bought by issuing equity shares to the supplier`, head: 'N', because: 'The machinery was paid for in shares, so no cash moved. Such a transaction is left out of the statement.',
    slips: { I: 'Counted the machinery as bought for cash; it was paid for in shares.', F: 'Counted the shares as issued for cash; they were given in exchange for machinery.' } },
  { text: (x) => `debentures of ${x} converted into equity shares`, head: 'N', because: 'One source of finance is exchanged for another and no cash moves.',
    slips: { F: 'Counted the conversion as a cash repayment of debentures and a cash issue of shares; no cash moved.' } },
  { text: (x) => `cash of ${x} deposited into the bank`, head: 'N', because: 'Cash only moves from one part of cash and cash equivalents to another.',
    slips: { O: 'Took a movement between cash and bank for an operating payment.' } },
  { text: (x) => `${x} withdrawn from the bank for office cash`, head: 'N', because: 'Cash only moves from one part of cash and cash equivalents to another.',
    slips: { O: 'Took a movement between bank and cash for an operating receipt.' } },
  { text: (x) => `a building of ${x} bought by allotting 10% debentures to its seller`, head: 'N', because: 'The building was paid for in debentures, so no cash moved. Such a transaction is left out of the statement.',
    slips: { I: 'Counted the building as bought for cash; it was paid for in debentures.', F: 'Counted the debentures as issued for cash; they were given in exchange for the building.' } },
  { text: (x) => `treasury bills maturing in two months bought for ${x}`, head: 'N', because: 'Treasury bills maturing within three months are cash equivalents: cash only changes its form within cash and cash equivalents.',
    slips: { I: 'Took a cash equivalent for an investment; a highly liquid investment of three months or less is part of cash and cash equivalents.' } },
];

const classifyActivity = mcqTemplate({
  id: 'cf-classify-activity', topicId: T, conceptId: 'cf-classify', difficulty: 'easy',
  // Version 2: a building bought by allotting debentures replaces bonus shares (outside the 2025-26 syllabus) as an item with no flow of cash.
  version: 2,
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const item = rng.pick(CLASSIFY_ITEMS);
    const text = item.text(inr(k(rng, 20000, 900000, 10000)));
    const prompt = rng.pick([
      `${co} ${NF} had this in ${YEAR}: ${text}. Under which head of the Cash Flow Statement is it shown?`,
      `During ${YEAR}, ${co}, ${TRADE_OF[co]}, recorded this: ${text}. The company is not a financing company. Where does it appear in the Cash Flow Statement?`,
      `Classify this for the Cash Flow Statement of ${co} ${NF}: ${text}.`,
    ]);
    const wrong = (['O', 'I', 'F', 'N'] as Head[]).filter((h) => h !== item.head).map((h): [string, string] => [HEAD_TEXT[h], item.slips?.[h] ?? HEAD_SLIP[h]]);
    return choice(prompt, HEAD_TEXT[item.head], wrong, `${item.because} ${item.head === 'N' ? 'So it appears under no head of the statement.' : `So it is shown under ${HEAD_TEXT[item.head].toLowerCase()}.`}`, H.heads);
  },
  verify: (q) => {
    const item = CLASSIFY_ITEMS.find((i) => blank(q.prompt).includes(i.text('₹#')));
    return item !== undefined && optionText(q) === HEAD_TEXT[item.head];
  },
});

interface CeItem {
  text: string;
  /** The mistake of a student who puts it on the wrong side of the line. */
  slip: string;
}
const CE_IN: CeItem[] = [
  { text: 'Treasury bills that mature two months after they were bought', slip: 'Left out treasury bills; they are short-term, highly liquid and mature within three months.' },
  { text: 'A bank deposit with an original maturity of three months', slip: 'Left out a deposit of three months, which is within the limit for a cash equivalent.' },
  { text: 'Commercial paper that matures 45 days after purchase', slip: 'Left out commercial paper that matures well within three months.' },
  { text: 'Marketable securities held as current investments', slip: 'Left out marketable securities; current investments are taken as cash equivalents unless stated otherwise.' },
  { text: 'Cheques and drafts in hand', slip: 'Left out cheques and drafts in hand, which are as good as cash.' },
  { text: 'The balance in a current account with a bank', slip: 'Left out a bank balance that can be drawn on demand.' },
];
const CE_OUT: CeItem[] = [
  { text: 'A fixed deposit with a bank that matures after nine months', slip: 'Took a deposit of more than three months for a cash equivalent.' },
  { text: 'Equity shares of another company, bought to be held for two years', slip: 'Took a long-term investment in shares, whose value can change a great deal, for a cash equivalent.' },
  { text: 'Trade receivables due within one month', slip: 'Took money still to be collected from customers for cash.' },
  { text: 'Inventories of finished goods', slip: 'Took stock, which has yet to be sold and collected, for a cash equivalent.' },
  { text: 'A bank overdraft', slip: 'Took bank overdraft for a part of cash and cash equivalents; it is treated as a short-term borrowing.' },
  { text: 'Debentures of another company that are redeemable after five years', slip: 'Took a long-term investment for a cash equivalent.' },
  { text: 'Insurance premium paid in advance', slip: 'Took a prepaid expense for a cash equivalent; it is not held to be turned into cash.' },
];
const CE_RULE = 'Cash and cash equivalents are cash in hand, balances with banks and short-term, highly liquid investments that can be turned into a known amount of cash and mature within three months of being bought.';

const cashEquivalent = mcqTemplate({
  id: 'cf-cash-equivalent', topicId: T, conceptId: 'cf-meaning', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    if (rng.int(0, 1) === 0) {
      const right = rng.pick(CE_IN);
      const prompt = rng.pick([
        `Which of these items in the balance sheet of ${co} is a part of cash and cash equivalents for its Cash Flow Statement?`,
        `${co} is preparing its Cash Flow Statement under AS 3. Which of these does it count in cash and cash equivalents?`,
      ]);
      return choice(prompt, right.text, rng.shuffle(CE_OUT).slice(0, 4).map((i): [string, string] => [i.text, i.slip]), `${CE_RULE} Only this item fits.`, H.ce);
    }
    const right = rng.pick(CE_OUT);
    const prompt = rng.pick([
      `Which of these items in the balance sheet of ${co} is NOT a part of cash and cash equivalents for its Cash Flow Statement?`,
      `${co} is preparing its Cash Flow Statement under AS 3. Which of these does it leave out of cash and cash equivalents?`,
    ]);
    return choice(prompt, right.text, rng.shuffle(CE_IN).slice(0, 4).map((i): [string, string] => [i.text, i.slip]), `${CE_RULE} This item does not fit; the other three do.`, H.ce);
  },
  verify: (q) => {
    const texts = (list: CeItem[]) => q.options.filter((o) => list.some((i) => i.text === o.text)).length;
    const right = optionText(q) ?? '';
    // Exactly one option stands on the side asked for, and it is the one marked right.
    return / NOT | leave out /.test(q.prompt) ? texts(CE_OUT) === 1 && CE_OUT.some((i) => i.text === right) : texts(CE_IN) === 1 && CE_IN.some((i) => i.text === right);
  },
});

const CE_YES_LINES = [
  { label: 'Marketable securities (current investments)', short: 'the marketable securities, which are cash equivalents' },
  { label: 'Treasury bills maturing two months after purchase', short: 'the treasury bills, which are cash equivalents' },
  { label: 'Cheques and drafts in hand', short: 'the cheques and drafts in hand, which are as good as cash' },
  { label: 'Bank deposit with an original maturity of three months', short: 'the three-month bank deposit, which is a cash equivalent' },
];
const CE_NO_LINES = [
  { label: 'Fixed deposit with a bank maturing after ten months', sign: 1, slip: 'Included the fixed deposit; a deposit of more than three months is not a cash equivalent.', note: 'the fixed deposit runs for more than three months' },
  { label: 'Bank overdraft', sign: -1, slip: 'Deducted the bank overdraft; it is a short-term borrowing, shown under financing activities.', note: 'bank overdraft is a short-term borrowing' },
  { label: 'Trade receivables', sign: 1, slip: 'Included trade receivables; money still to be collected is not cash.', note: 'trade receivables are still to be collected' },
  { label: 'Shares of another company, to be held for three years', sign: 1, slip: 'Included a long-term investment in shares; it is neither short-term nor free from the risk of a change in value.', note: 'the shares are a long-term investment' },
];

const cashEquivalentsTotal = numericTemplate({
  id: 'cf-cash-equivalents-total', topicId: T, conceptId: 'cf-meaning', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cash = k(rng, 20000, 90000, 5000);
    const bank = k(rng, 150000, 600000, 10000);
    const yes = rng.shuffle(CE_YES_LINES).slice(0, 2).map((i) => ({ ...i, amt: k(rng, 30000, 250000, 10000) }));
    const no = rng.shuffle(CE_NO_LINES).slice(0, 2).map((i) => ({ ...i, amt: i.sign < 0 ? k(rng, 20000, 100000, 5000) : k(rng, 50000, 400000, 10000) }));
    const total = cash + bank + sum(yes.map((i) => i.amt));
    const n = numeric(total, [
      ...no.map((i): [number, string] => [total + i.sign * i.amt, i.slip]),
      [cash + bank, 'Counted only the cash in hand and the bank balance and left out the other items that are part of cash and cash equivalents.'],
      [total - yes[0].amt, `Left out ${yes[0].short}.`],
    ]);
    const lines = [one('Cash in hand', cash), one('Balance with bank in current account', bank), ...rng.shuffle([...yes, ...no]).map((i) => one(i.label, i.amt))];
    return n && {
      prompt: ask(`From these balances of ${co} on ${Y1}, find the cash and cash equivalents for its Cash Flow Statement.`, lines),
      ...n,
      explanation: [
        'Cash and cash equivalents = cash in hand, cheques and drafts in hand and balances with banks + short-term, highly liquid investments that mature within three months of being acquired.',
        `${[cash, bank, ...yes.map((i) => i.amt)].map(inr).join(' + ')} = ${inr(total)}.`,
        `Left out: ${no.map((i) => i.note).join('; ')}.`,
      ],
      hints: H.ce,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const counted = ['Cash in hand', 'Balance with bank in current account', ...CE_YES_LINES.map((i) => i.label)];
    return ans(q) === sum([...rows].filter(([label]) => counted.includes(label)).map(([, a]) => a[0]));
  },
});

interface FlowItem {
  text: (x: string) => string;
  /** True when cash and cash equivalents change. */
  cash: boolean;
  because: string;
  /** The mistake of a student who puts it on the wrong side. */
  slip: string;
}
const FLOW_ITEMS: FlowItem[] = [
  { text: (x) => `Machinery of ${x} bought by issuing equity shares to the vendor`, cash: false, because: 'the machinery is paid for in shares', slip: 'Counted machinery paid for in shares as a cash purchase.' },
  { text: (x) => `${x} of 9% debentures converted into equity shares`, cash: false, because: 'debentures are exchanged for shares', slip: 'Counted a conversion of debentures into shares as cash paid and received.' },
  { text: (x) => `Cash of ${x} deposited into the bank`, cash: false, because: 'cash only moves into the bank, within cash and cash equivalents', slip: 'Counted a movement from cash to bank as a cash flow; both are parts of cash and cash equivalents.' },
  { text: (x) => `${x} withdrawn from the bank for office cash`, cash: false, because: 'money only moves from bank to cash, within cash and cash equivalents', slip: 'Counted a movement from bank to cash as a cash flow; both are parts of cash and cash equivalents.' },
  { text: (x) => `Depreciation of ${x} charged on plant`, cash: false, because: 'depreciation is a book entry', slip: 'Counted depreciation as cash going out; it is only a book entry.' },
  { text: (x) => `Land of ${x} acquired by allotting equity shares to its owner`, cash: false, because: 'the land is paid for in shares', slip: 'Counted land paid for in shares as a cash purchase.' },
  { text: (x) => `${x} transferred from Surplus to General Reserve`, cash: false, because: 'profit is only moved from one reserve to another', slip: 'Counted a transfer between reserves as cash going out.' },
  { text: (x) => `Marketable securities of ${x}, which are cash equivalents, bought for cash`, cash: false, because: 'marketable securities are cash equivalents, so cash only changes its form', slip: 'Counted the purchase of a cash equivalent as an outflow; cash only changes its form within cash and cash equivalents.' },
  { text: (x) => `A building of ${x} bought and paid for by an issue of debentures`, cash: false, because: 'the building is paid for in debentures', slip: 'Counted a building paid for in debentures as a cash purchase.' },
  { text: (x) => `Goodwill of ${x} written off`, cash: false, because: 'writing off goodwill is a book entry', slip: 'Counted goodwill written off as cash going out; it is only a book entry.' },
  { text: (x) => `Machinery of ${x} bought and paid for by cheque`, cash: true, because: 'the bank balance falls', slip: 'Thought no cash moves when a fixed asset is paid for by cheque.' },
  { text: (x) => `Equity shares of ${x} issued for cash`, cash: true, because: 'cash is received from shareholders', slip: 'Thought an issue of shares for cash brings in no cash.' },
  { text: (x) => `Interim dividend of ${x} paid`, cash: true, because: 'cash is paid to shareholders', slip: 'Thought a dividend is only an appropriation of profit; when it is paid, cash goes out.' },
  { text: (x) => `Old furniture sold for ${x} in cash`, cash: true, because: 'cash is received from the buyer', slip: 'Thought the sale of an old asset brings in no cash.' },
  { text: (x) => `Income tax of ${x} paid`, cash: true, because: 'cash is paid to the government', slip: 'Mixed up tax paid, which uses cash, with the provision for tax, which is a book entry.' },
  { text: (x) => `Long-term bank loan of ${x} repaid`, cash: true, because: 'cash is paid to the bank', slip: 'Thought repaying a loan only changes liabilities; cash goes out as well.' },
  { text: (x) => `Trade payables of ${x} paid by cheque`, cash: true, because: 'the bank balance falls', slip: 'Thought paying a creditor only changes a liability; the bank balance falls as well.' },
  { text: (x) => `${x} collected from trade receivables`, cash: true, because: 'cash is received from customers', slip: 'Thought a collection only changes one asset into another without touching cash.' },
];

const nonCashEffect = mcqTemplate({
  id: 'cf-non-cash-effect', topicId: T, conceptId: 'cf-classify', difficulty: 'easy',
  // Version 2: land acquired by allotting shares replaces bonus shares (outside the 2025-26 syllabus) as a non-cash transaction.
  version: 2,
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const wantsCash = rng.int(0, 1) === 0;
    const amounts = rng.shuffle([40000, 50000, 60000, 80000, 100000, 120000, 150000, 200000, 250000, 300000]).map(inr);
    const right = rng.pick(FLOW_ITEMS.filter((i) => i.cash === wantsCash));
    const others = rng.shuffle(FLOW_ITEMS.filter((i) => i.cash !== wantsCash)).slice(0, 4);
    const prompt = wantsCash
      ? rng.pick([
          `Which of these transactions of ${co} changes its cash and cash equivalents?`,
          `Only one of these transactions of ${co} is a flow of cash for its Cash Flow Statement. Which one?`,
        ])
      : rng.pick([
          `Which of these transactions of ${co} does NOT change its cash and cash equivalents?`,
          `One of these transactions of ${co} is not a cash flow. Which one?`,
        ]);
    const explanation = wantsCash
      ? `Here ${right.because}, so cash and cash equivalents change. The other three move no cash, or move it only within cash and cash equivalents.`
      : `Here ${right.because}, so cash and cash equivalents do not change. In each of the other three, cash is received or paid.`;
    return choice(prompt, right.text(amounts[0]), others.map((i, n): [string, string] => [i.text(amounts[n + 1]), i.slip]), explanation, H.heads);
  },
  verify: (q) => {
    const item = (text: string) => FLOW_ITEMS.find((i) => i.text('₹#') === blank(text));
    const wantsCash = !/ NOT | is not a cash flow/.test(q.prompt);
    const made = q.options.map((o) => item(o.text));
    return made.every((i) => i !== undefined) && made.filter((i) => i!.cash === wantsCash).length === 1 && item(optionText(q) ?? '')?.cash === wantsCash;
  },
});

interface WcItem {
  label: string;
  /** A current asset, a current liability, or an item that is not a working capital change. */
  kind: 'A' | 'L' | 'X';
  plural: boolean;
  /** An item whose balance is small beside inventories, receivables and payables. */
  small?: boolean;
  because?: string;
  slip?: string;
}
const WC_ITEMS: WcItem[] = [
  { label: 'Inventories', kind: 'A', plural: true },
  { label: 'Trade receivables', kind: 'A', plural: true },
  { label: 'Prepaid expenses', kind: 'A', plural: true, small: true },
  { label: 'Trade payables', kind: 'L', plural: true },
  { label: 'Outstanding expenses', kind: 'L', plural: true, small: true },
  { label: 'Bank overdraft', kind: 'X', plural: false, because: 'Bank overdraft is a short-term borrowing: its change is shown under financing activities.', slip: 'Treated bank overdraft as an operating current liability; it is a short-term borrowing, shown under financing activities.' },
  { label: 'Cash credit from bank', kind: 'X', plural: false, because: 'Cash credit is a short-term borrowing: its change is shown under financing activities.', slip: 'Treated cash credit as an operating current liability; it is a short-term borrowing, shown under financing activities.' },
  { label: 'Current investments (marketable securities)', kind: 'X', plural: true, because: 'Marketable securities are cash equivalents: they are part of the cash the statement explains.', slip: 'Treated marketable securities as an operating current asset; they are cash equivalents.' },
  { label: 'Provision for tax', kind: 'X', plural: false, because: 'Tax is dealt with on its own: the tax paid is deducted after cash generated from operations.', slip: 'Treated provision for tax as a working capital item; the tax paid is deducted on its own after cash generated from operations.' },
  { label: 'Cash and bank balances', kind: 'X', plural: true, because: 'Cash and bank balances are the cash that the statement explains, not a working capital change.', slip: 'Treated cash and bank balances as a working capital item; their change is what the statement arrives at.' },
];
const WC_KIND = new Map(WC_ITEMS.map((i) => [i.label, i.kind]));
const NOT_ADJUSTED = 'Not adjusted among the working capital changes';
/** +1 when the change adds to cash from operations, -1 when it is deducted, 0 when it is not a working capital change. */
const wcSign = (kind: 'A' | 'L' | 'X', open: number, close: number): number => (kind === 'X' || close === open ? 0 : (kind === 'A' ? -1 : 1) * (close > open ? 1 : -1));
const WC_WHY: Record<'A' | 'L', Record<'up' | 'down', { reason: string; slip: string }>> = {
  A: {
    up: { reason: 'more cash is tied up in a current asset', slip: 'Treated a rise in a current asset as cash coming in; more cash is tied up in it.' },
    down: { reason: 'cash has been released from a current asset', slip: 'Treated a fall in a current asset as cash going out; cash has been released from it.' },
  },
  L: {
    up: { reason: 'payment has been put off, which saves cash', slip: 'Treated a rise in a current liability as cash paid; payment has been put off, which saves cash.' },
    down: { reason: 'cash was paid to bring the liability down', slip: 'Treated a fall in a current liability as a saving of cash; cash was paid to bring it down.' },
  },
};

const wcDirection = mcqTemplate({
  id: 'cf-wc-direction', topicId: T, conceptId: 'cf-working-capital', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const item = rng.pick(WC_ITEMS);
    const open = item.small ? k(rng, 20000, 90000, 5000) : k(rng, 40000, 400000, 10000);
    const d = item.small ? k(rng, 5000, 30000, 5000) : k(rng, 10000, 90000, 5000);
    const up = rng.int(0, 1) === 0;
    const close = up ? open + d : open - d;
    if (close <= 0 || close === d) return null;
    const prompt = `${co}: ${item.label} ${item.plural ? 'were' : 'was'} ${inr(open)} on ${Y0} and ${inr(close)} on ${Y1}. Starting from operating profit before working capital changes, how is this change treated in finding cash generated from operations?`;
    const added = `Added: ${inr(d)}`;
    const deducted = `Deducted: ${inr(d)}`;
    if (item.kind === 'X') {
      return choice(prompt, NOT_ADJUSTED, [
        [added, item.slip!],
        [deducted, item.slip!],
        [`Deducted: ${inr(close)}`, 'Adjusted the whole closing balance of an item that is not a working capital change at all.'],
      ], `${item.because} So it is not adjusted among the working capital changes.`, H.wc);
    }
    const sign = wcSign(item.kind, open, close);
    const w = WC_WHY[item.kind][up ? 'up' : 'down'];
    return choice(prompt, sign > 0 ? added : deducted, [
      [sign > 0 ? deducted : added, w.slip],
      [`${sign > 0 ? 'Added' : 'Deducted'}: ${inr(close)}`, 'Used the closing balance instead of the change during the year.'],
      [NOT_ADJUSTED, `Left an operating current ${item.kind === 'A' ? 'asset' : 'liability'} out of the working capital changes.`],
    ], `${item.label} ${up ? 'rose' : 'fell'} by ${inr(d)}: ${w.reason}, so ${inr(d)} is ${sign > 0 ? 'added' : 'deducted'}.`, H.wc);
  },
  verify: (q) => {
    const label = /: (.*?) (?:were|was) ₹/.exec(q.prompt)?.[1] ?? '';
    const [open, close] = amountsIn(q.prompt);
    const kind = WC_KIND.get(label);
    if (kind === undefined) return false;
    const sign = wcSign(kind, open, close);
    return optionText(q) === (sign === 0 ? NOT_ADJUSTED : `${sign > 0 ? 'Added' : 'Deducted'}: ${inr(Math.abs(close - open))}`);
  },
});

const npbtSimple = numericTemplate({
  id: 'cf-npbt-simple', topicId: T, conceptId: 'cf-npbt', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const open = k(rng, 100000, 600000, 20000);
    const profit = k(rng, 100000, 600000, 20000);
    const tax = (profit * rng.pick([20, 25, 30, 40])) / 100;
    const close = open + profit;
    const answer = profit + tax;
    if (rng.int(0, 2) > 0) {
      const n = numeric(answer, [
        [profit, 'Stopped at the increase in Surplus, which is the profit after tax: the provision for tax has to be added back.'],
        [close + tax, 'Used the closing balance of Surplus instead of the increase in it during the year.'],
        [profit - tax, 'Deducted the provision for tax from a profit that is already after tax.'],
      ]);
      return n && {
        prompt: ask(`${co} paid no dividend and made no transfer to reserves in ${YEAR}. Find its net profit before tax and extraordinary items for the year.`, [
          two(SURPLUS, open, close),
          one('Provision for tax made during the year', tax),
        ]),
        ...n,
        explanation: [
          `Net profit after tax = increase in Surplus = ${inr(close)} - ${inr(open)} = ${inr(profit)}.`,
          `Add: Provision for tax made ${inr(tax)}.`,
          `${NPBT} = ${inr(profit)} + ${inr(tax)} = ${inr(answer)}.`,
        ],
        hints: H.npbt,
      };
    }
    const n = numeric(answer, [
      [profit, 'Gave the profit after tax; the cash flow statement starts from the profit before tax.'],
      [profit - tax, 'Deducted the provision for tax from a profit that is already after tax.'],
      [tax, 'Gave the provision for tax alone instead of adding it to the profit after tax.'],
    ]);
    return n && {
      prompt: `The Statement of Profit and Loss of ${co} for ${YEAR} shows a profit after tax of ${inr(profit)}, arrived at after a provision for tax of ${inr(tax)}. There were no extraordinary items. With what figure of net profit before tax does its Cash Flow Statement (indirect method) begin?`,
      ...n,
      explanation: [`${NPBT} = Profit after tax + Provision for tax made.`, `${inr(profit)} + ${inr(tax)} = ${inr(answer)}.`],
      hints: H.npbt,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    return a.length === 3 ? ans(q) === a[1] - a[0] + a[2] : ans(q) === a[0] + a[1];
  },
});

interface Adj {
  label: string;
  /** +1: added back; -1: deducted; 0: no adjustment at this stage. */
  sign: 1 | -1 | 0;
  reason: string;
}
const ADJ_PLUS: Adj[] = [
  { label: 'Depreciation on plant and machinery', sign: 1, reason: 'a non-cash expense' },
  { label: 'Goodwill written off', sign: 1, reason: 'a non-cash expense' },
  { label: 'Patents written off', sign: 1, reason: 'a non-cash expense' },
  { label: 'Loss on sale of machinery', sign: 1, reason: 'a loss of an investing activity' },
  { label: 'Interest paid on debentures', sign: 1, reason: 'a financing cost' },
  { label: 'Interest paid on long-term bank loan', sign: 1, reason: 'a financing cost' },
];
const ADJ_MINUS: Adj[] = [
  { label: 'Profit on sale of non-current investments', sign: -1, reason: 'a gain of an investing activity' },
  { label: 'Profit on sale of an old vehicle', sign: -1, reason: 'a gain of an investing activity' },
  { label: 'Interest received on investments', sign: -1, reason: 'income of an investing activity' },
  { label: 'Dividend received on shares held', sign: -1, reason: 'income of an investing activity' },
  { label: 'Rent received from let-out property', sign: -1, reason: 'income of an investing activity' },
];
/** Lines that tempt a student at this stage and call for no adjustment, each with the mistake of adjusting it. */
const ADJ_TRAPS: { label: string; wrongSign: 1 | -1; slip: string; note: string }[] = [
  { label: 'Increase in trade receivables during the year', wrongSign: -1, slip: 'Deducted the increase in trade receivables; working capital changes come after this stage.', note: 'The increase in trade receivables is a working capital change, adjusted after this stage.' },
  { label: 'Provision for tax made during the year', wrongSign: 1, slip: 'Added the provision for tax again; it has already been added in arriving at net profit before tax.', note: 'The provision for tax is already added back in the net profit before tax.' },
  { label: 'Increase in trade payables during the year', wrongSign: 1, slip: 'Added the increase in trade payables; working capital changes come after this stage.', note: 'The increase in trade payables is a working capital change, adjusted after this stage.' },
  { label: 'Salaries paid during the year', wrongSign: 1, slip: 'Added back salaries; they are an operating expense paid in cash and stay in the profit.', note: 'Salaries are an operating expense paid in cash: no adjustment.' },
];
const ADJ_SIGN = new Map<string, number>([...ADJ_PLUS, ...ADJ_MINUS].map((a): [string, number] => [a.label, a.sign]).concat(ADJ_TRAPS.map((t): [string, number] => [t.label, 0]), [[NPBT, 1]]));
const adjLines = (items: (Adj & { amt: number })[]): string[] => [
  ...items.filter((i) => i.sign > 0).map((i) => `Add: ${i.label} ${inr(i.amt)} (${i.reason}).`),
  ...items.filter((i) => i.sign < 0).map((i) => `Less: ${i.label} ${inr(i.amt)} (${i.reason}).`),
];
/** Operating profit before working capital changes from the data lines of a prompt, each taken by the sign of its label. */
const operatingProfitOf = (prompt: string): number => sum([...rowsOf(prompt)].map(([label, a]) => (ADJ_SIGN.get(label) ?? NaN) * a[0]));

const opProfitSimple = numericTemplate({
  id: 'cf-op-profit-simple', topicId: T, conceptId: 'cf-adjustments', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const profit = k(rng, 250000, 900000, 10000);
    const nPlus = rng.int(1, 2);
    const items = [
      ...rng.shuffle(ADJ_PLUS).slice(0, nPlus).map((a) => ({ ...a, amt: k(rng, 15000, 90000, 5000) })),
      ...rng.shuffle(ADJ_MINUS).slice(0, 3 - nPlus).map((a) => ({ ...a, amt: k(rng, 10000, 60000, 5000) })),
    ];
    const plus = sum(items.filter((i) => i.sign > 0).map((i) => i.amt));
    const minus = sum(items.filter((i) => i.sign < 0).map((i) => i.amt));
    const answer = profit + plus - minus;
    const n = numeric(answer, [
      [profit + plus + minus, 'Added the non-operating incomes as well; they are deducted.'],
      [profit - plus + minus, 'Made every adjustment the wrong way round: deducted the expenses and added the incomes.'],
      [profit + plus, 'Added back the expenses and losses but did not deduct the non-operating incomes.'],
      [profit - minus, 'Deducted the non-operating incomes but did not add back the non-cash and non-operating expenses.'],
    ]);
    return n && {
      prompt: ask(`From this information of ${co} ${NF} for ${YEAR}, find the operating profit before working capital changes.`, [
        one(NPBT, profit),
        ...rng.shuffle(items).map((i) => one(i.label, i.amt)),
      ]),
      ...n,
      explanation: [
        'Operating profit before working capital changes = Net profit before tax + non-cash and non-operating expenses - non-operating incomes.',
        ...adjLines(items),
        `${inr(profit)} + ${inr(plus)} - ${inr(minus)} = ${inr(answer)}.`,
      ],
      hints: H.adj,
    };
  },
  verify: (q) => ans(q) === operatingProfitOf(q.prompt),
});

const SIMPLE_WC: { label: string; kind: 'A' | 'L' }[] = [
  { label: 'inventories', kind: 'A' },
  { label: 'trade receivables', kind: 'A' },
  { label: 'prepaid expenses', kind: 'A' },
  { label: 'trade payables', kind: 'L' },
  { label: 'outstanding expenses', kind: 'L' },
];

const cashFromOpsSimple = numericTemplate({
  id: 'cf-cash-from-ops-simple', topicId: T, conceptId: 'cf-working-capital', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const profit = k(rng, 300000, 900000, 10000);
    const items = rng
      .shuffle([rng.pick(SIMPLE_WC.filter((i) => i.kind === 'A')), rng.pick(SIMPLE_WC.filter((i) => i.kind === 'L'))])
      .map((i) => ({ ...i, up: rng.int(0, 1) === 0, amt: k(rng, 10000, 90000, 5000) }));
    if (items[0].amt === items[1].amt) return null;
    const effect = (i: (typeof items)[number]): number => (i.kind === 'A' ? -1 : 1) * (i.up ? 1 : -1) * i.amt;
    const byDirection = sum(items.map((i) => (i.up ? 1 : -1) * i.amt));
    const answer = profit + sum(items.map(effect));
    const n = numeric(answer, [
      [profit - sum(items.map(effect)), 'Took both changes the wrong way round.'],
      [profit + byDirection, 'Added every increase and deducted every decrease, as if both items were current liabilities.'],
      [profit - byDirection, 'Deducted every increase and added every decrease, as if both items were current assets.'],
    ]);
    const phrase = (i: (typeof items)[number]): string => `${i.label} ${i.up ? 'increased' : 'decreased'} by ${inr(i.amt)}`;
    return n && {
      prompt: `${co} has an operating profit before working capital changes of ${inr(profit)} for ${YEAR}. During the year ${phrase(items[0])} and ${phrase(items[1])}. Find the cash generated from operations.`,
      ...n,
      explanation: [
        'Add a decrease in a current asset or an increase in a current liability; deduct an increase in a current asset or a decrease in a current liability.',
        ...items.map((i) => `${cap(i.label)} ${i.up ? 'increased' : 'decreased'}: ${WC_WHY[i.kind][i.up ? 'up' : 'down'].reason}, so ${effect(i) > 0 ? 'add' : 'deduct'} ${inr(i.amt)}.`),
        `Cash generated from operations = ${inr(profit)} ${items.map((i) => `${effect(i) > 0 ? '+' : '-'} ${inr(i.amt)}`).join(' ')} = ${inr(answer)}.`,
      ],
      hints: H.wc,
    };
  },
  verify: (q) => {
    let total = amountsIn(q.prompt)[0];
    for (const m of q.prompt.matchAll(/(inventories|trade receivables|prepaid expenses|trade payables|outstanding expenses) (increased|decreased) by ₹([\d,]+)/g)) {
      const asset = ['inventories', 'trade receivables', 'prepaid expenses'].includes(m[1]);
      total += (asset === (m[2] === 'increased') ? -1 : 1) * Number(m[3].replace(/,/g, ''));
    }
    return ans(q) === total;
  },
});

const taxPaid = numericTemplate({
  id: 'cf-tax-paid', topicId: T, conceptId: 'cf-working-capital', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const open = k(rng, 40000, 300000, 5000);
    const made = open + k(rng, -4, 14, 1) * 5000;
    const paid = open + k(rng, -4, 4, 1) * 5000;
    const close = open + made - paid;
    if (made <= 0 || paid <= 0 || close <= 0 || close === open) return null;
    const variant = rng.int(0, 2);
    if (variant === 0) {
      const n = numeric(paid, [
        [made, 'Took the provision made during the year for the tax paid.'],
        [close + made - open, 'Put the opening and closing balances the wrong way round in the Provision for tax account.'],
        [Math.abs(close - open), 'Took the change in the provision as the tax paid and left out the provision made.'],
        [open, 'Assumed that exactly last year\'s provision was paid; the account gives a different figure.'],
      ]);
      return n && {
        prompt: ask(`Find the income tax paid by ${co} during ${YEAR}, the figure deducted from cash generated from operations.`, [
          two('Provision for tax', open, close),
          one('Provision for tax made during the year', made),
        ]),
        ...n,
        explanation: [
          'Provision for tax account: opening balance + provision made - tax paid = closing balance.',
          `Tax paid = ${inr(open)} + ${inr(made)} - ${inr(close)} = ${inr(paid)}.`,
        ],
        hints: H.tax,
      };
    }
    if (variant === 1) {
      const n = numeric(made, [
        [paid, 'Took the tax paid for the provision made.'],
        [close, 'Took the closing balance as the provision made; that holds only when nothing else is known.'],
        [open + paid - close, 'Put the opening and closing balances the wrong way round in the Provision for tax account.'],
        [Math.abs(close - open), 'Took the change in the provision and left out the tax paid during the year.'],
      ]);
      return n && {
        prompt: ask(`Find the provision for tax made by ${co} during ${YEAR}, the figure added back in arriving at net profit before tax.`, [
          two('Provision for tax', open, close),
          one('Income tax paid during the year', paid),
        ]),
        ...n,
        explanation: [
          'Provision for tax account: opening balance + provision made - tax paid = closing balance.',
          `Provision made = ${inr(close)} + ${inr(paid)} - ${inr(open)} = ${inr(made)}.`,
        ],
        hints: H.tax,
      };
    }
    const n = numeric(open, [
      [close, 'Took the closing provision, which is the provision made for the current year and is still unpaid.'],
      [Math.abs(close - open), 'Took only the change in the provision.'],
      [open + close, 'Added the two balances together.'],
    ]);
    return n && {
      prompt: `The balance sheets of ${co} show Provision for tax of ${inr(open)} on ${Y0} and ${inr(close)} on ${Y1}. Nothing more is known about tax. On the usual assumption, how much income tax is taken as paid during ${YEAR}?`,
      ...n,
      explanation: [
        'With no other information, the provision of the previous year is taken as paid in the current year, and the closing provision as the provision made in the current year.',
        `Tax paid = opening provision = ${inr(open)}; provision made = ${inr(close)}.`,
      ],
      hints: H.tax,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    if (rows.size === 0) return ans(q) === amountsIn(q.prompt)[0];
    const [open, close] = row(rows, 'Provision for tax');
    if (has(rows, 'Provision for tax made during the year')) return open + row(rows, 'Provision for tax made during the year')[0] - ans(q) === close;
    return open + ans(q) - row(rows, 'Income tax paid during the year')[0] === close;
  },
});

const sharesProceeds = numericTemplate({
  id: 'cf-shares-proceeds', topicId: T, conceptId: 'cf-financing', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    if (rng.int(0, 1) === 0) {
      const capOpen = k(rng, 500000, 2000000, 100000);
      const capUp = k(rng, 100000, 800000, 50000);
      const premOpen = k(rng, 20000, 200000, 20000);
      const premUp = (capUp * rng.pick([10, 20, 25, 40, 50])) / 100;
      const answer = capUp + premUp;
      const n = numeric(answer, [
        [capUp, 'Left out the securities premium, which is also received in cash.'],
        [capOpen + capUp + premOpen + premUp, 'Used the closing balances instead of the increase during the year.'],
        [capUp - premUp, 'Deducted the securities premium instead of adding it.'],
      ]);
      return n && {
        prompt: ask(`All shares issued by ${co} in ${YEAR} were issued for cash. Find the proceeds from the issue of shares shown under financing activities.`, [
          two('Equity Share Capital', capOpen, capOpen + capUp),
          two('Securities Premium', premOpen, premOpen + premUp),
        ]),
        ...n,
        explanation: [
          `Increase in Equity Share Capital = ${inr(capOpen + capUp)} - ${inr(capOpen)} = ${inr(capUp)}.`,
          `Increase in Securities Premium = ${inr(premOpen + premUp)} - ${inr(premOpen)} = ${inr(premUp)}.`,
          `Proceeds from issue of shares = ${inr(capUp)} + ${inr(premUp)} = ${inr(answer)}, an inflow under financing activities.`,
        ],
        hints: H.fin,
      };
    }
    const shares = k(rng, 10000, 80000, 5000);
    const premium = rng.pick([2, 3, 4, 5, 6, 8]);
    const answer = shares * (10 + premium);
    const count = shares.toLocaleString('en-IN');
    const n = numeric(answer, [
      [shares * 10, 'Took only the face value and left out the securities premium received.'],
      [shares * premium, 'Took only the securities premium.'],
      [shares * (10 - premium), 'Deducted the premium from the face value; a premium is received over and above it.'],
    ]);
    return n && {
      prompt: `During ${YEAR}, ${co} issued ${count} equity shares of ₹10 each at a premium of ₹${premium} per share. The whole amount was received in cash. What inflow is shown under financing activities?`,
      ...n,
      explanation: [
        `Each share brings in ₹10 + ₹${premium} = ₹${10 + premium}.`,
        `Proceeds from issue of shares = ${count} x ₹${10 + premium} = ${inr(answer)} (share capital ${inr(shares * 10)} + securities premium ${inr(shares * premium)}).`,
      ],
      hints: H.fin,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    if (rows.size > 0) {
      const [c0, c1] = row(rows, 'Equity Share Capital');
      const [p0, p1] = row(rows, 'Securities Premium');
      return ans(q) === c1 - c0 + (p1 - p0);
    }
    const shares = Number(/issued ([\d,]+) equity shares/.exec(q.prompt)?.[1].replace(/,/g, ''));
    const [face, premium] = amountsIn(q.prompt);
    return ans(q) === shares * face + shares * premium;
  },
});

/** The three activities of a reconciliation, each a net inflow or a net outflow. */
interface Flows {
  op: number;
  inv: number;
  fin: number;
}
const FLOW_NAME: Record<keyof Flows, string> = { op: 'operating', inv: 'investing', fin: 'financing' };
const flowLabel = (key: keyof Flows, v: number): string => `Net cash ${v >= 0 ? 'from' : 'used in'} ${FLOW_NAME[key]} activities`;
const flowLine = (key: keyof Flows, v: number): string => one(flowLabel(key, v), Math.abs(v));
/** The net cash of every activity a prompt gives, with its sign: "from" is an inflow, "used in" an outflow. */
const flowsIn = (prompt: string): number => sum([...rowsOf(prompt)].filter(([label]) => label.startsWith('Net cash ')).map(([label, a]) => (label.includes('used in') ? -1 : 1) * a[0]));
const drawFlows = (rng: Rng): Flows => ({
  op: k(rng, 150000, 700000, 10000) * (rng.int(0, 9) === 0 ? -1 : 1),
  inv: k(rng, 80000, 500000, 10000) * (rng.int(0, 4) === 0 ? 1 : -1),
  fin: k(rng, 30000, 300000, 10000) * (rng.int(0, 1) === 0 ? 1 : -1),
});

const closingCash = numericTemplate({
  id: 'cf-closing-cash', topicId: T, conceptId: 'cf-reconcile', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const f = drawFlows(rng);
    const net = f.op + f.inv + f.fin;
    const open = k(rng, 60000, 500000, 10000);
    const close = open + net;
    if (net === 0 || close <= 0) return null;
    const lines = (['op', 'inv', 'fin'] as const).map((key) => flowLine(key, f[key]));
    const all = Math.abs(f.op) + Math.abs(f.inv) + Math.abs(f.fin);
    const netLine = `Net cash of the three activities = ${(['op', 'inv', 'fin'] as const).map((key, i) => `${f[key] >= 0 ? (i === 0 ? '' : '+ ') : '- '}${inr(Math.abs(f[key]))}`).join(' ')} = ${net > 0 ? '' : '- '}${inr(Math.abs(net))}: a net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents of ${inr(Math.abs(net))}.`;
    if (rng.int(0, 2) > 0) {
      const n = numeric(close, [
        [open + all, 'Added all three figures; cash used in an activity is deducted.'],
        [Math.abs(net), 'Gave the net change of the year without bringing in the opening balance.'],
        [open - net, 'Applied the net change the wrong way round to the opening balance.'],
        [open + f.op + f.inv - f.fin, 'Took the financing figure the wrong way round.'],
      ]);
      return n && {
        prompt: ask(`From this summary of the Cash Flow Statement of ${co} for ${YEAR}, find the cash and cash equivalents on ${Y1}.`, [...lines, one('Cash and cash equivalents on 1 April 2025', open)]),
        ...n,
        explanation: [netLine, `Closing cash and cash equivalents = ${inr(open)} ${net > 0 ? '+' : '-'} ${inr(Math.abs(net))} = ${inr(close)}.`],
        hints: H.rec,
      };
    }
    const n = numeric(open, [
      [close + net, 'Applied the net change to the closing balance in the same direction instead of working back to the opening balance.'],
      [close, 'Gave the closing balance; the net change of the year has to be taken out of it.'],
      [Math.abs(net), 'Gave the net change of the year instead of the opening balance.'],
      [close - all, 'Took all three figures as inflows.'],
    ]);
    return n && {
      prompt: ask(`From this summary of the Cash Flow Statement of ${co} for ${YEAR}, find the cash and cash equivalents at the beginning of the year.`, [...lines, one(`Cash and cash equivalents on ${Y1}`, close)]),
      ...n,
      explanation: [netLine, `Opening cash and cash equivalents = ${inr(close)} ${net > 0 ? '-' : '+'} ${inr(Math.abs(net))} = ${inr(open)}.`],
      hints: H.rec,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const net = flowsIn(q.prompt);
    return has(rows, 'Cash and cash equivalents on 1 April 2025') ? row(rows, 'Cash and cash equivalents on 1 April 2025')[0] + net === ans(q) : ans(q) + net === row(rows, `Cash and cash equivalents on ${Y1}`)[0];
  },
});

const netChangeDirection = mcqTemplate({
  id: 'cf-net-change-direction', topicId: T, conceptId: 'cf-reconcile', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const f = drawFlows(rng);
    const net = f.op + f.inv + f.fin;
    if (net === 0) return null;
    const say = (v: number): string => `Net ${v > 0 ? 'increase' : 'decrease'} of ${inr(Math.abs(v))}`;
    const all = Math.abs(f.op) + Math.abs(f.inv) + Math.abs(f.fin);
    const parts = (['op', 'inv', 'fin'] as const).map((key) => `${inr(Math.abs(f[key]))} ${f[key] >= 0 ? 'from' : 'used in'} ${FLOW_NAME[key]} activities`);
    const prompt = `The Cash Flow Statement of ${co} for ${YEAR} shows net cash of ${parts[0]}, ${parts[1]} and ${parts[2]}. What is the change in cash and cash equivalents during the year?`;
    return choice(prompt, say(net), [
      [say(-net), 'Read the direction the wrong way round.'],
      [say(all), 'Added all three figures; cash used in an activity is deducted.'],
      [say(f.op + f.inv), 'Left out the financing activities.'],
      [say(f.op), 'Looked only at the operating activities.'],
    ].filter(([text]) => !text.includes('₹0')) as [string, string][], `Cash from an activity is added and cash used in an activity is deducted: the three together give a ${say(net).toLowerCase()}.`, H.rec);
  },
  verify: (q) => {
    const [a, b, c] = amountsIn(q.prompt);
    const signs = [...q.prompt.matchAll(/₹[\d,]+ (from|used in) /g)].map((m) => (m[1] === 'from' ? 1 : -1));
    const net = a * signs[0] + b * signs[1] + c * signs[2];
    return optionText(q) === `Net ${net > 0 ? 'increase' : 'decrease'} of ${inr(Math.abs(net))}`;
  },
});

const dividendPaid = numericTemplate({
  id: 'cf-dividend-paid', topicId: T, conceptId: 'cf-financing', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const prev = k(rng, 40000, 300000, 10000);
    const cur = prev + k(rng, 1, 8, 1) * 10000 * (rng.int(0, 3) === 0 && prev > 90000 ? -1 : 1);
    const interim = rng.int(0, 2) === 0 ? 0 : k(rng, 20000, 150000, 5000);
    if (interim === prev || interim === cur) return null;
    const answer = prev + interim;
    const n = numeric(answer, [
      [cur + interim, 'Took the dividend proposed for the current year; it is not yet declared, so nothing has been paid on it.'],
      [prev + cur + interim, 'Added the proposed dividends of both years; only the previous year\'s has been declared and paid.'],
      ...(interim > 0 ? ([[prev, 'Left out the interim dividend paid during the year.'], [interim, 'Counted only the interim dividend and left out the previous year\'s proposed dividend, which was paid this year.']] as [number, string][]) : []),
      [cur, 'Took the dividend proposed for the current year, which is not yet declared.'],
      [Math.abs(cur - prev) + interim, 'Took the difference between the proposed dividends of the two years; the whole of the previous year\'s was paid.'],
    ]);
    const asked = rng.pick([
      `How much dividend does ${co} show as paid under financing activities in its Cash Flow Statement for ${YEAR}?`,
      `What total of dividends does ${co} add back to the profit of ${YEAR} in arriving at net profit before tax, and show as paid under financing activities?`,
    ]);
    return n && {
      prompt: ask(asked, [
        proposed(prev, cur),
        ...(interim > 0 ? [one('Interim dividend paid during the year', interim)] : []),
        `The dividend proposed for ${PREV} was declared by the shareholders and paid during ${YEAR}.`,
      ]),
      ...n,
      explanation: [
        `The dividend proposed for ${PREV}, ${inr(prev)}, was declared and paid in ${YEAR}.`,
        `The dividend proposed for ${YEAR}, ${inr(cur)}, is not accounted for until it is declared.`,
        interim > 0 ? `Dividend paid = ${inr(prev)} + interim dividend ${inr(interim)} = ${inr(answer)}.` : `Dividend paid = ${inr(answer)}.`,
      ],
      hints: H.div,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    return ans(q) === row(rows, 'Proposed dividend')[0] + (rows.get('Interim dividend paid during the year')?.[0] ?? 0);
  },
});

const machineryPurchaseSimple = numericTemplate({
  id: 'cf-machinery-purchase-simple', topicId: T, conceptId: 'cf-investing', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const asset = rng.pick(['Machinery', 'Plant and machinery', 'Furniture', 'Vehicles']);
    const open = k(rng, 300000, 1200000, 20000);
    const dep = k(rng, 30000, 120000, 5000);
    const bought = dep + k(rng, 20000, 400000, 10000);
    const close = open - dep + bought;
    const label = `${asset} (written down value)`;
    if (rng.int(0, 2) > 0) {
      const n = numeric(bought, [
        [close - open, 'Took the increase in the balance as the purchase and forgot that depreciation had reduced the account.'],
        [close - open - dep, 'Deducted the depreciation instead of adding it back to the closing balance.'],
        [close + dep, 'Did not deduct the opening balance.'],
      ]);
      return n && {
        prompt: ask(`${co} sold no ${asset.toLowerCase()} during ${YEAR}. Find the ${asset.toLowerCase()} purchased, an outflow under investing activities.`, [
          two(label, open, close),
          one('Depreciation charged during the year', dep),
        ]),
        ...n,
        explanation: [
          `${asset} account: opening balance + purchases - depreciation = closing balance.`,
          `Purchases = ${inr(close)} + ${inr(dep)} - ${inr(open)} = ${inr(bought)}.`,
        ],
        hints: H.asset,
      };
    }
    const n = numeric(dep, [
      [close - open, 'Took the net increase in the account as the depreciation.'],
      [open + bought, 'Did not deduct the closing balance.'],
      [close + bought - open, 'Put the opening and closing balances the wrong way round.'],
    ]);
    return n && {
      prompt: ask(`${co} sold no ${asset.toLowerCase()} during ${YEAR}. Find the depreciation charged for the year, which is added back to the profit.`, [
        two(label, open, close),
        one('Purchases during the year', bought),
      ]),
      ...n,
      explanation: [
        `${asset} account: opening balance + purchases - depreciation = closing balance.`,
        `Depreciation = ${inr(open)} + ${inr(bought)} - ${inr(close)} = ${inr(dep)}.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const rows = [...rowsOf(q.prompt)];
    const [open, close] = rows[0][1];
    const [label, [given]] = rows[1];
    return label.startsWith('Depreciation') ? open + ans(q) - given === close : open + given - ans(q) === close;
  },
});

const loanFlow = numericTemplate({
  id: 'cf-loan-flow', topicId: T, conceptId: 'cf-financing', difficulty: 'easy', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const loan = rng.pick(['Long-term loan from bank', 'Term loan from a financial institution', 'Long-term borrowings']);
    const open = k(rng, 300000, 1200000, 50000);
    const raised = k(rng, 100000, 500000, 25000);
    const repaid = k(rng, 50000, 300000, 25000);
    const close = open + raised - repaid;
    if (repaid === raised) return null;
    if (rng.int(0, 1) === 0) {
      const n = numeric(repaid, [
        [Math.abs(open - close), 'Took the net change in the loan as the repayment and ignored the fresh loan raised.'],
        [close + raised - open, 'Put the opening and closing balances the wrong way round.'],
        [open - close - raised, 'Deducted the fresh loan instead of adding it to the opening balance.'],
        [raised, 'Gave the fresh loan raised instead of the repayment.'],
      ]);
      return n && {
        prompt: ask(`Find the amount of loan repaid by ${co} during ${YEAR}, an outflow under financing activities.`, [
          two(loan, open, close),
          one('Fresh loan raised during the year', raised),
        ]),
        ...n,
        explanation: ['Loan account: opening balance + fresh loan raised - repayment = closing balance.', `Repayment = ${inr(open)} + ${inr(raised)} - ${inr(close)} = ${inr(repaid)}.`],
        hints: H.fin,
      };
    }
    const n = numeric(raised, [
      [Math.abs(close - open), 'Took the net change in the loan as the fresh loan and ignored the repayment.'],
      [open + repaid - close, 'Put the opening and closing balances the wrong way round.'],
      [close - open - repaid, 'Deducted the repayment instead of adding it back.'],
      [repaid, 'Gave the repayment instead of the fresh loan raised.'],
    ]);
    return n && {
      prompt: ask(`Find the fresh loan raised by ${co} during ${YEAR}, an inflow under financing activities.`, [
        two(loan, open, close),
        one('Loan repaid during the year', repaid),
      ]),
      ...n,
      explanation: ['Loan account: opening balance + fresh loan raised - repayment = closing balance.', `Fresh loan raised = ${inr(close)} + ${inr(repaid)} - ${inr(open)} = ${inr(raised)}.`],
      hints: H.fin,
    };
  },
  verify: (q) => {
    const rows = [...rowsOf(q.prompt)];
    const [open, close] = rows[0][1];
    const [label, [given]] = rows[1];
    return label.startsWith('Fresh loan') ? open + given - ans(q) === close : open + ans(q) - given === close;
  },
});

type Treatment = 'A' | 'D' | 'K' | 'W';
const TREATMENT_TEXT: Record<Treatment, string> = {
  A: 'Added back to the net profit before tax',
  D: 'Deducted from the net profit before tax',
  K: 'No adjustment: it is an operating item that rightly stays in the profit',
  W: 'Adjusted in the next step, among the working capital changes',
};
const TREATMENT_SLIP: Record<Treatment, Partial<Record<Treatment, string>>> = {
  A: {
    D: 'Deducted a charge that had already reduced the profit, so it was taken off twice.',
    K: 'Left a non-cash or non-operating charge inside the operating profit.',
    W: 'Mistook a charge of the year for a change in a current asset or a current liability.',
  },
  D: {
    A: 'Added an income that is already inside the profit, so it was counted twice.',
    K: 'Left an income of investing activities inside the operating profit.',
    W: 'Mistook an income of the year for a change in a current asset or a current liability.',
  },
  K: {
    A: 'Added back an operating expense paid in cash; only non-cash and non-operating charges are added back.',
    D: 'Deducted an operating expense a second time; the profit is already after charging it.',
    W: 'Mistook an expense of the year for a change in a current asset or a current liability.',
  },
  W: {
    A: 'Brought a working capital change in one step too early; it is adjusted after operating profit before working capital changes.',
    D: 'Brought a working capital change in one step too early; it is adjusted after operating profit before working capital changes.',
    K: 'Thought the change calls for no adjustment at all; it is adjusted in the next step.',
  },
};
const TREATMENT_ITEMS: { text: string; is: Treatment; because: string }[] = [
  { text: 'Depreciation on machinery', is: 'A', because: 'Depreciation reduced the profit but used no cash.' },
  { text: 'Goodwill written off', is: 'A', because: 'Writing off goodwill reduced the profit but used no cash.' },
  { text: 'Patents written off', is: 'A', because: 'Writing off patents reduced the profit but used no cash.' },
  { text: 'Loss on sale of machinery', is: 'A', because: 'The loss belongs to an investing activity; the sale proceeds are shown there.' },
  { text: 'Interest paid on debentures', is: 'A', because: 'For a non-financing company, interest on borrowings is a financing outflow, shown under financing activities.' },
  { text: 'Interest paid on a long-term bank loan', is: 'A', because: 'For a non-financing company, interest on borrowings is a financing outflow, shown under financing activities.' },
  { text: 'Profit on sale of machinery', is: 'D', because: 'The profit belongs to an investing activity; the whole sale proceeds are shown there.' },
  { text: 'Profit on sale of non-current investments', is: 'D', because: 'The profit belongs to an investing activity; the whole sale proceeds are shown there.' },
  { text: 'Interest received on investments', is: 'D', because: 'For a non-financing company, interest received is an investing inflow, shown under investing activities.' },
  { text: 'Dividend received on shares held as an investment', is: 'D', because: 'For a non-financing company, dividend received is an investing inflow, shown under investing activities.' },
  { text: 'Rent received from a let-out building', is: 'D', because: 'Rent from a let-out property is an investing inflow, shown under investing activities.' },
  { text: 'Salaries and wages paid', is: 'K', because: 'Salaries are an operating expense paid in cash, so the profit is right as it stands.' },
  { text: 'Office rent paid', is: 'K', because: 'Office rent is an operating expense paid in cash, so the profit is right as it stands.' },
  { text: 'Advertising expenses paid', is: 'K', because: 'Advertising is an operating expense paid in cash, so the profit is right as it stands.' },
  { text: 'Increase in inventories', is: 'W', because: 'A change in a current asset is a working capital change, taken after operating profit before working capital changes.' },
  { text: 'Decrease in trade payables', is: 'W', because: 'A change in a current liability is a working capital change, taken after operating profit before working capital changes.' },
  { text: 'Increase in trade receivables', is: 'W', because: 'A change in a current asset is a working capital change, taken after operating profit before working capital changes.' },
  { text: 'Increase in outstanding expenses', is: 'W', because: 'A change in a current liability is a working capital change, taken after operating profit before working capital changes.' },
];

const adjustDirection = mcqTemplate({
  id: 'cf-adjust-direction', topicId: T, conceptId: 'cf-adjustments', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const item = rng.pick(TREATMENT_ITEMS);
    const x = inr(k(rng, 10000, 200000, 5000));
    const prompt = rng.pick([
      `${co} ${NF} is working out its operating profit before working capital changes by the indirect method, starting from net profit before tax. How is this item treated at this stage? ${item.text}: ${x}.`,
      `${co} ${NF} uses the indirect method. Its working has reached the step from net profit before tax to operating profit before working capital changes. What is done with this item? ${item.text}: ${x}.`,
    ]);
    const wrong = (['A', 'D', 'K', 'W'] as Treatment[]).filter((t) => t !== item.is).map((t): [string, string] => [TREATMENT_TEXT[t], TREATMENT_SLIP[item.is][t]!]);
    return choice(prompt, TREATMENT_TEXT[item.is], wrong, item.because, H.adj);
  },
  verify: (q) => {
    // The longest item whose text the prompt holds: "Interest paid on a long-term bank loan" before "Interest paid".
    const item = TREATMENT_ITEMS.filter((i) => q.prompt.includes(`${i.text}: ₹`)).sort((a, b) => b.text.length - a.text.length)[0];
    return item !== undefined && optionText(q) === TREATMENT_TEXT[item.is];
  },
});

const easy: Template[] = [
  classifyActivity, cashEquivalent, cashEquivalentsTotal, nonCashEffect, wcDirection, npbtSimple, opProfitSimple, cashFromOpsSimple,
  taxPaid, sharesProceeds, closingCash, netChangeDirection, dividendPaid, machineryPurchaseSimple, loanFlow, adjustDirection,
];

// ===============================================================================================================
// MEDIUM
// ===============================================================================================================

interface KindItem {
  text: (x: string, fin: boolean) => string;
  /** The head for a financing company and for a non-financing company. */
  fin: Head;
  non: Head;
  finWhy: string;
  nonWhy: string;
  slips?: Partial<Record<Head, string>>;
}
const KIND_ITEMS: KindItem[] = [
  { text: (x) => `received interest of ${x} on loans it had given`, fin: 'O', non: 'I',
    finWhy: 'Lending is the main business of a financing company, so the interest it earns is operating revenue.',
    nonWhy: 'For a non-financing company, interest received is a return on money lent or invested: an investing inflow.' },
  { text: (x) => `received dividend of ${x} on shares it holds in other companies`, fin: 'O', non: 'I',
    finWhy: 'For a financing company, interest and dividend received are income of its main business: operating inflows.',
    nonWhy: 'For a non-financing company, dividend received is a return on an investment: an investing inflow.' },
  { text: (x) => `paid interest of ${x} on the money it has borrowed`, fin: 'O', non: 'F',
    finWhy: 'A financing company borrows in order to lend, so the interest it pays is a cost of its main business: an operating outflow.',
    nonWhy: 'For a non-financing company, interest on borrowings is the cost of finance: a financing outflow.' },
  { text: (x) => `paid a dividend of ${x} to its shareholders`, fin: 'F', non: 'F',
    finWhy: 'Dividend paid goes to the providers of share capital: a financing outflow for every kind of company.',
    nonWhy: 'Dividend paid goes to the providers of share capital: a financing outflow for every kind of company.',
    slips: { O: 'Stretched the rule for interest to dividend paid; dividend paid is a financing outflow whatever the business of the company.', I: 'Mixed up dividend paid with dividend received.' } },
  { text: (x, fin) => (fin ? `gave loans of ${x} to its customers` : `gave a loan of ${x} to another company`), fin: 'O', non: 'I',
    finWhy: 'Giving loans is the main revenue-earning work of a financing company, so loans given are operating outflows.',
    nonWhy: 'For a non-financing company, a loan given to a third party is an investing outflow.',
    slips: { F: 'Mixed up a loan given with a loan taken.' } },
  { text: (x) => `bought computers for its office for ${x}`, fin: 'I', non: 'I',
    finWhy: 'Buying a fixed asset for its own use is an investing outflow for every kind of company.',
    nonWhy: 'Buying a fixed asset for its own use is an investing outflow for every kind of company.',
    slips: { O: 'Took the purchase of a fixed asset for an expense of the year.' } },
  { text: (x) => `issued equity shares for ${x} in cash`, fin: 'F', non: 'F',
    finWhy: 'Money raised from shareholders is a financing inflow for every kind of company.',
    nonWhy: 'Money raised from shareholders is a financing inflow for every kind of company.',
    slips: { O: 'Thought that raising share capital is part of the main business of a financing company; it is a financing inflow for every company.', I: 'Mixed up issuing its own shares with investing in the shares of another company.' } },
];

const classifyByCompany = mcqTemplate({
  id: 'cf-classify-by-company', topicId: T, conceptId: 'cf-classify', difficulty: 'medium',
  generate: (rng) => {
    const fin = rng.int(0, 1) === 0;
    const item = rng.pick(KIND_ITEMS);
    const right = fin ? item.fin : item.non;
    const other = fin ? item.non : item.fin;
    const x = inr(k(rng, 20000, 600000, 10000));
    const prompt = `${introduce(rng, fin)}. In ${YEAR} it ${item.text(x, fin)}. Under which head is this shown in its Cash Flow Statement?`;
    const wrong = (['O', 'I', 'F', 'N'] as Head[]).filter((h) => h !== right).map((h): [string, string] => [
      HEAD_TEXT[h],
      h === other
        ? `Treated the company as a ${fin ? 'non-financing' : 'financing'} company, for which this would be the head.`
        : item.slips?.[h] ?? HEAD_SLIP[h],
    ]);
    return choice(prompt, HEAD_TEXT[right], wrong, fin ? item.finWhy : item.nonWhy, [
      'First settle the kind of company: is lending money its main business?',
      'For a financing company, interest paid and interest and dividend received are operating items. Dividend paid is a financing item for every company.',
    ]);
  },
  verify: (q) => {
    const fin = !q.prompt.includes('is not a financing company');
    const item = KIND_ITEMS.find((i) => blank(q.prompt).includes(i.text('₹#', fin)));
    return item !== undefined && optionText(q) === HEAD_TEXT[fin ? item.fin : item.non];
  },
});

const interestDividendHeads = numericTemplate({
  id: 'cf-interest-dividend-heads', topicId: T, conceptId: 'cf-classify', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const fin = rng.int(0, 1) === 0;
    const ir = k(rng, 40000, 200000, 5000);
    const dr = k(rng, 20000, 100000, 5000);
    const ip = k(rng, 30000, 150000, 5000);
    const dp = k(rng, 50000, 200000, 5000);
    const intro = `${introduce(rng, fin)}.`;
    const lines = [one('Interest received', ir), one('Dividend received', dr), one('Interest paid on borrowings', ip), one('Dividend paid to shareholders', dp)];
    const first = rng.int(0, 1) === 0;
    const hints = [
      'For a non-financing company: interest and dividend received are investing inflows; interest and dividend paid are financing outflows.',
      'For a financing company: interest paid, interest received and dividend received are operating items; dividend paid is still a financing outflow.',
    ];
    if (!fin && first) {
      const n = numeric(ir + dr, [
        [ir + dr - ip, 'Set the interest paid off against the inflows; interest paid is a financing outflow.'],
        [ir, 'Left out the dividend received, which is also an investing inflow.'],
        [dr, 'Left out the interest received, which is also an investing inflow.'],
      ]);
      return n && {
        prompt: ask(`${intro} What total inflow do these items of ${YEAR} give under investing activities?`, lines), ...n, hints,
        explanation: ['For a non-financing company, interest received and dividend received are investing inflows.', `${inr(ir)} + ${inr(dr)} = ${inr(ir + dr)}.`, 'Interest paid and dividend paid are financing outflows.'],
      };
    }
    if (!fin) {
      const n = numeric(ip + dp, [
        [dp, 'Left interest paid out of financing activities; that is right only for a financing company.'],
        [ip, 'Left out the dividend paid, which is also a financing outflow.'],
        [ip + dp - ir - dr, 'Set off the interest and dividend received, which are investing inflows.'],
      ]);
      return n && {
        prompt: ask(`${intro} What total outflow do these items of ${YEAR} give under financing activities?`, lines), ...n, hints,
        explanation: ['For a non-financing company, interest paid on borrowings and dividend paid are financing outflows.', `${inr(ip)} + ${inr(dp)} = ${inr(ip + dp)}.`, 'Interest received and dividend received are investing inflows.'],
      };
    }
    if (first) {
      const n = numeric(ir + dr - ip, [
        [ir + dr, 'Left interest paid out of operating activities; for a financing company it is an operating outflow.'],
        [ir + dr - ip - dp, 'Put dividend paid under operating activities; it is a financing outflow for every company.'],
        [ir - ip, 'Left out the dividend received, which is operating income for a financing company.'],
      ]);
      return n && {
        prompt: ask(`${intro} What net inflow do these items of ${YEAR} give under operating activities?`, lines), ...n, hints,
        explanation: ['For a financing company, interest received, dividend received and interest paid are operating items.', `${inr(ir)} + ${inr(dr)} - ${inr(ip)} = ${inr(ir + dr - ip)}.`, 'Dividend paid is a financing outflow for every company.'],
      };
    }
    const n = numeric(dp, [
      [ip + dp, 'Put interest paid under financing activities; that is right only for a non-financing company.'],
      [ip, 'Took the interest paid and left out the dividend paid.'],
      [dp - dr, 'Set the dividend received off against the dividend paid.'],
    ]);
    return n && {
      prompt: ask(`${intro} What outflow do these items of ${YEAR} give under financing activities?`, lines), ...n, hints,
      explanation: ['For a financing company, interest paid is an operating outflow, and interest and dividend received are operating inflows.', `Only the dividend paid, ${inr(dp)}, is a financing outflow.`],
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [ir, dr, ip, dp] = ['Interest received', 'Dividend received', 'Interest paid on borrowings', 'Dividend paid to shareholders'].map((label) => row(rows, label)[0]);
    const fin = !q.prompt.includes('is not a financing company');
    const head = /under (operating|investing|financing) activities/.exec(q.prompt)?.[1];
    const expected: Record<string, number> = fin ? { operating: ir + dr - ip, financing: dp } : { investing: ir + dr, financing: ip + dp };
    return ans(q) === expected[head ?? ''];
  },
});

const npbtFull = numericTemplate({
  id: 'cf-npbt-full', topicId: T, conceptId: 'cf-npbt', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const sOpen = k(rng, 150000, 600000, 10000);
    const change = k(rng, -8, 30, 1) * 10000;
    const sClose = sOpen + change;
    const transfer = rng.int(0, 2) === 0 ? 0 : k(rng, 20000, 120000, 10000);
    const gOpen = k(rng, 100000, 500000, 50000);
    const tax = k(rng, 40000, 200000, 10000);
    const prev = k(rng, 40000, 150000, 10000);
    const cur = prev + rng.pick([-20000, -10000, 10000, 20000, 30000]);
    const interim = rng.int(0, 1) === 0 ? 0 : k(rng, 20000, 80000, 5000);
    const answer = change + transfer + tax + prev + interim;
    if (sClose <= 0 || change === 0 || answer < 50000) return null;
    const n = numeric(answer, [
      [answer - prev + cur, 'Added the dividend proposed for the current year; it is the previous year\'s proposed dividend, paid this year, that came out of Surplus.'],
      ...(transfer > 0 ? ([[answer - transfer, 'Left out the transfer to General Reserve, which also came out of the profit of the year.']] as [number, string][]) : []),
      [answer - prev - interim, 'Did not add back the dividends paid out of Surplus during the year.'],
      [answer - tax, 'Did not add back the provision for tax made during the year.'],
      [answer + cur, 'Added the proposed dividends of both years; only the previous year\'s was paid out of Surplus this year.'],
      ...(change < 0 ? ([[answer - 2 * change, 'Took the fall in Surplus as if it were a rise.']] as [number, string][]) : []),
    ]);
    const adds: [string, number][] = [
      ...(transfer > 0 ? ([['Transfer to General Reserve', transfer]] as [string, number][]) : []),
      ['Provision for tax made', tax],
      [`Proposed dividend of ${PREV}, paid in ${YEAR}`, prev],
      ...(interim > 0 ? ([['Interim dividend paid', interim]] as [string, number][]) : []),
    ];
    return n && {
      prompt: ask(`From this information of ${co}, find the net profit before tax and extraordinary items for ${YEAR}.`, [
        two(SURPLUS, sOpen, sClose),
        ...(transfer > 0 ? [two('General Reserve', gOpen, gOpen + transfer)] : []),
        one('Provision for tax made during the year', tax),
        proposed(prev, cur),
        ...(interim > 0 ? [one('Interim dividend paid during the year', interim)] : []),
        `The dividend proposed for ${PREV} was declared and paid during ${YEAR}.${transfer > 0 ? ' The increase in General Reserve is a transfer from the profit of the year.' : ''}`,
      ]),
      ...n,
      explanation: [
        change > 0
          ? `Increase in Surplus = ${inr(sClose)} - ${inr(sOpen)} = ${inr(change)}: the profit left after tax, dividends and transfers.`
          : `Surplus fell by ${inr(sOpen)} - ${inr(sClose)} = ${inr(-change)}: start from a minus figure of ${inr(-change)}.`,
        ...adds.map(([label, a]) => `Add: ${label} ${inr(a)}.`),
        `${NPBT} = ${change > 0 ? inr(change) : `- ${inr(-change)}`} + ${adds.map(([, a]) => inr(a)).join(' + ')} = ${inr(answer)}.`,
        `The dividend proposed for ${YEAR}, ${inr(cur)}, is not accounted for until it is declared.`,
      ],
      hints: H.npbt,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [s0, s1] = row(rows, SURPLUS);
    const [g0, g1] = rows.get('General Reserve') ?? [0, 0];
    return ans(q) === s1 - s0 + (g1 - g0) + row(rows, 'Provision for tax made during the year')[0] + row(rows, 'Proposed dividend')[0] + (rows.get('Interim dividend paid during the year')?.[0] ?? 0);
  },
});

const opProfitFull = numericTemplate({
  id: 'cf-op-profit-full', topicId: T, conceptId: 'cf-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const profit = k(rng, 300000, 1200000, 10000);
    const items = [
      ...rng.shuffle(ADJ_PLUS).slice(0, 3).map((a) => ({ ...a, amt: k(rng, 15000, 120000, 5000) })),
      ...rng.shuffle(ADJ_MINUS).slice(0, 2).map((a) => ({ ...a, amt: k(rng, 10000, 70000, 5000) })),
    ];
    const trap = { ...rng.pick(ADJ_TRAPS), amt: k(rng, 20000, 150000, 5000) };
    const plus = sum(items.filter((i) => i.sign > 0).map((i) => i.amt));
    const minus = sum(items.filter((i) => i.sign < 0).map((i) => i.amt));
    const answer = profit + plus - minus;
    const n = numeric(answer, [
      [answer + trap.wrongSign * trap.amt, trap.slip],
      [profit + plus + minus, 'Added the non-operating incomes as well; they are deducted.'],
      [profit + plus, 'Added back the expenses and losses but did not deduct the non-operating incomes.'],
      [profit - plus + minus, 'Made every adjustment the wrong way round: deducted the expenses and added the incomes.'],
    ]);
    return n && {
      prompt: ask(`From this information of ${co} ${NF} for ${YEAR}, find the operating profit before working capital changes. One of the items needs no adjustment at this stage.`, [
        one(NPBT, profit),
        ...rng.shuffle([...items.map((i) => one(i.label, i.amt)), one(trap.label, trap.amt)]),
      ]),
      ...n,
      explanation: [
        'Operating profit before working capital changes = Net profit before tax + non-cash and non-operating expenses - non-operating incomes.',
        ...adjLines(items),
        trap.note,
        `${inr(profit)} + ${inr(plus)} - ${inr(minus)} = ${inr(answer)}.`,
      ],
      hints: H.adj,
    };
  },
  verify: (q) => ans(q) === operatingProfitOf(q.prompt),
});

const WC_START = 'Operating profit before working capital changes';
/** What the working capital lines of a prompt add to (or take from) the operating profit, each by the kind of its label. */
const wcEffectOf = (rows: Map<string, number[]>): number => sum([...rows].filter(([label]) => WC_KIND.has(label)).map(([label, [open, close]]) => wcSign(WC_KIND.get(label)!, open, close) * Math.abs(close - open)));
const wcLine = (label: string, kind: 'A' | 'L', open: number, close: number): string =>
  `${label} ${close > open ? 'rose' : 'fell'} by ${inr(Math.abs(close - open))}: ${wcSign(kind, open, close) > 0 ? 'add' : 'deduct'} (${WC_WHY[kind][close > open ? 'up' : 'down'].reason}).`;
/** Two or three current assets and liabilities with their balances at the two dates, and one item that is not adjusted. */
function drawWorkingCapital(rng: Rng, count: number) {
  // Prepaid and outstanding expenses are small beside inventories, receivables and payables.
  const balance = (small?: boolean) => {
    const open = small ? k(rng, 20000, 90000, 5000) : k(rng, 60000, 400000, 10000);
    const close = open + rng.pick([-1, 1]) * (small ? k(rng, 5000, 15000, 5000) : k(rng, 10000, 50000, 5000));
    return { open, close };
  };
  const pick = (kind: 'A' | 'L' | 'X', n: number) => rng.shuffle(WC_ITEMS.filter((i) => i.kind === kind)).slice(0, n).map((i) => ({ ...i, ...balance(i.small) }));
  const real = [...pick('A', count - 1 > 2 ? 2 : count - 1), ...pick('L', count - 1 > 2 ? 2 : 1)].slice(0, count);
  return { real, trap: pick('X', 1)[0], effect: sum(real.map((i) => wcSign(i.kind, i.open, i.close) * Math.abs(i.close - i.open))) };
}
/** What a student gets who adjusts the item that is not a working capital change, by what it looks like. */
const trapEffect = (trap: { label: string; open: number; close: number }): number =>
  (['Current investments (marketable securities)', 'Cash and bank balances'].includes(trap.label) ? -1 : 1) * (trap.close - trap.open);

const cashFromOpsFull = numericTemplate({
  id: 'cf-cash-from-ops-full', topicId: T, conceptId: 'cf-working-capital', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const profit = k(rng, 400000, 1200000, 10000);
    const { real, trap, effect } = drawWorkingCapital(rng, 4);
    if (effect === 0) return null;
    const byDirection = sum(real.map((i) => i.close - i.open));
    const answer = profit + effect;
    const n = numeric(answer, [
      [answer + trapEffect(trap), trap.slip!],
      [profit - effect, 'Took every change the wrong way round.'],
      [profit + byDirection, 'Added every increase and deducted every decrease, without separating current assets from current liabilities.'],
      [profit - byDirection, 'Deducted every increase and added every decrease, as if every item were a current asset.'],
    ]);
    return n && {
      prompt: ask(`From this information of ${co} for ${YEAR}, find the cash generated from operations. One of the balances is not a working capital change.`, [
        one(WC_START, profit),
        ...rng.shuffle([...real, trap]).map((i) => two(i.label, i.open, i.close)),
      ]),
      ...n,
      explanation: [
        ...real.map((i) => wcLine(i.label, i.kind as 'A' | 'L', i.open, i.close)),
        `${trap.because} So it is left out here.`,
        `Cash generated from operations = ${inr(profit)} ${real.map((i) => `${wcSign(i.kind, i.open, i.close) > 0 ? '+' : '-'} ${inr(Math.abs(i.close - i.open))}`).join(' ')} = ${inr(answer)}.`,
      ],
      hints: H.wc,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    return ans(q) === row(rows, WC_START)[0] + wcEffectOf(rows);
  },
});

const operatingAfterTax = numericTemplate({
  id: 'cf-operating-after-tax', topicId: T, conceptId: 'cf-working-capital', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const cgo = k(rng, 400000, 1200000, 10000);
    const open = k(rng, 40000, 250000, 5000);
    const made = open + k(rng, -4, 14, 1) * 5000;
    const noInfo = rng.int(0, 3) === 0;
    const paid = noInfo ? open : open + k(rng, -4, 4, 1) * 5000;
    const close = noInfo ? made : open + made - paid;
    if (made <= 0 || paid <= 0 || close <= 0 || close === open || paid === made) return null;
    const answer = cgo - paid;
    const n = numeric(answer, [
      [cgo - (noInfo ? close : made), noInfo ? 'Deducted the closing provision, which is the provision of the current year and is still unpaid.' : 'Deducted the provision made instead of the tax paid during the year.'],
      [cgo - close, 'Deducted the closing provision, which is still unpaid.'],
      [cgo + paid, 'Added the tax paid; it is an outflow.'],
      [cgo - open, 'Deducted the opening provision without writing up the Provision for tax account.'],
      [cgo - Math.abs(close - open), 'Deducted only the change in the provision.'],
    ]);
    return n && {
      prompt: ask(`Find the net cash from operating activities of ${co} for ${YEAR}.`, [
        one('Cash generated from operations', cgo),
        two('Provision for tax', open, close),
        noInfo ? 'Nothing more is known about tax.' : one('Provision for tax made during the year', made),
      ]),
      ...n,
      explanation: [
        noInfo
          ? `With no other information, the provision of the previous year, ${inr(open)}, is taken as paid in the current year.`
          : `Tax paid = opening provision + provision made - closing provision = ${inr(open)} + ${inr(made)} - ${inr(close)} = ${inr(paid)}.`,
        `Net cash from operating activities = ${inr(cgo)} - ${inr(paid)} = ${inr(answer)}.`,
      ],
      hints: H.tax,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [open, close] = row(rows, 'Provision for tax');
    const made = rows.get('Provision for tax made during the year')?.[0];
    return ans(q) === row(rows, 'Cash generated from operations')[0] - (made === undefined ? open : open + made - close);
  },
});

const COST_ASSETS = [
  { name: 'Machinery', unit: 'a machine' },
  { name: 'Plant and machinery', unit: 'a machine' },
  { name: 'Vehicles', unit: 'a delivery van' },
  { name: 'Furniture', unit: 'some furniture' },
];

const assetPurchaseCost = numericTemplate({
  id: 'cf-asset-purchase-cost', topicId: T, conceptId: 'cf-investing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const asset = rng.pick(COST_ASSETS);
    const open = k(rng, 500000, 1500000, 50000);
    const cost = k(rng, 80000, 300000, 10000);
    const accumulated = (cost * rng.pick([30, 40, 50, 60])) / 100;
    const price = cost - accumulated + rng.pick([-1, 1]) * k(rng, 5000, 30000, 5000);
    const bought = k(rng, 150000, 700000, 10000);
    const close = open - cost + bought;
    if (price <= 0 || bought === cost) return null;
    const n = numeric(bought, [
      [close - open, 'Took the increase in the balance as the purchase; the cost of the asset sold had been taken out of the account.'],
      [close - open + price, 'Credited the asset account with the sale price instead of the cost of the asset sold.'],
      [close - open + cost - accumulated, 'Took the asset sold out at its book value; this account is kept at cost.'],
      [close + cost, 'Did not deduct the opening balance.'],
    ]);
    return n && {
      prompt: ask(`Find the ${asset.name.toLowerCase()} purchased by ${co} during ${YEAR}, an outflow under investing activities.`, [
        two(`${asset.name} (at cost)`, open, close),
        `During the year ${asset.unit} that had cost ${inr(cost)}, on which depreciation of ${inr(accumulated)} had accumulated, was sold for ${inr(price)}.`,
      ]),
      ...n,
      explanation: [
        `${asset.name} account (at cost): opening balance + purchases - cost of the asset sold = closing balance.`,
        `Purchases = ${inr(close)} + ${inr(cost)} - ${inr(open)} = ${inr(bought)}.`,
        `The accumulated depreciation and the sale price do not enter an account kept at cost; the sale proceeds of ${inr(price)} are a separate inflow.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const [open, close, cost] = amountsIn(q.prompt);
    return open + ans(q) - cost === close;
  },
});

const saleProceeds = numericTemplate({
  id: 'cf-sale-proceeds', topicId: T, conceptId: 'cf-investing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const unit = rng.pick(['a machine', 'a delivery van', 'an old generator', 'a packing machine']);
    const cost = k(rng, 100000, 600000, 20000);
    const accumulated = (cost * rng.pick([25, 30, 40, 50, 60, 70])) / 100;
    const book = cost - accumulated;
    const g = k(rng, 5000, 40000, 5000);
    const profit = rng.int(0, 1) === 0;
    const price = profit ? book + g : book - g;
    if (price <= 0 || g === accumulated) return null;
    const what = profit ? 'profit' : 'loss';
    if (rng.int(0, 1) === 0) {
      const n = numeric(price, [
        [profit ? book - g : book + g, `Adjusted the ${what} the wrong way: a ${what} means the price was ${profit ? 'above' : 'below'} the book value.`],
        [profit ? cost + g : cost - g, 'Worked from the original cost and ignored the accumulated depreciation.'],
        [book, `Gave the book value; the ${what} on sale has still to be ${profit ? 'added' : 'deducted'}.`],
      ]);
      return n && {
        prompt: `${co} sold ${unit} during ${YEAR}. It had cost ${inr(cost)} and depreciation of ${inr(accumulated)} had accumulated on it. The sale gave a ${what} of ${inr(g)}. What sale proceeds are shown as an inflow under investing activities?`,
        ...n,
        explanation: [
          `Book value = ${inr(cost)} - ${inr(accumulated)} = ${inr(book)}.`,
          `Sale proceeds = book value ${profit ? '+ profit' : '- loss'} = ${inr(book)} ${profit ? '+' : '-'} ${inr(g)} = ${inr(price)}.`,
          `The ${what} itself is ${profit ? 'deducted from' : 'added back to'} the profit under operating activities.`,
        ],
        hints: H.asset,
      };
    }
    const n = numeric(g, [
      [Math.abs(cost - price), 'Compared the sale price with the original cost instead of the book value.'],
      [book, 'Gave the book value of the asset instead of the difference between it and the sale price.'],
      [accumulated, 'Gave the accumulated depreciation.'],
    ]);
    return n && {
      prompt: `${co} ${NF} sold ${unit} for ${inr(price)} during ${YEAR}. It had cost ${inr(cost)} and depreciation of ${inr(accumulated)} had accumulated on it. How much is the profit or loss on the sale, which is adjusted in arriving at operating profit before working capital changes? Type the amount.`,
      ...n,
      explanation: [
        `Book value = ${inr(cost)} - ${inr(accumulated)} = ${inr(book)}.`,
        `Sale price ${inr(price)} is ${profit ? 'above' : 'below'} the book value: a ${what} of ${inr(g)}.`,
        `The ${what} is ${profit ? 'deducted from' : 'added back to'} the net profit before tax; the sale proceeds of ${inr(price)} are an inflow under investing activities.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    if (q.prompt.includes('Type the amount')) return ans(q) === Math.abs(a[0] - (a[1] - a[2]));
    return ans(q) === a[0] - a[1] + (q.prompt.includes('a profit of') ? 1 : -1) * a[2];
  },
});

const depCharged = numericTemplate({
  id: 'cf-dep-charged', topicId: T, conceptId: 'cf-adjustments', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const sold = k(rng, 20000, 120000, 5000);
    const open = sold + k(rng, 60000, 400000, 10000);
    const charge = sold + k(rng, 10000, 150000, 5000);
    const close = open - sold + charge;
    const label = 'Accumulated depreciation on machinery';
    if (rng.int(0, 2) > 0) {
      const n = numeric(charge, [
        [close - open, 'Took the increase in accumulated depreciation as the charge; the depreciation on the machine sold had been taken out of the account.'],
        [close - open - sold, 'Deducted the depreciation on the machine sold instead of adding it back.'],
        [close + sold, 'Did not deduct the opening balance.'],
      ]);
      return n && {
        prompt: ask(`Find the depreciation charged by ${co} for ${YEAR}, which is added back to the net profit before tax.`, [
          two(label, open, close),
          one('Accumulated depreciation on a machine sold during the year', sold),
        ]),
        ...n,
        explanation: [
          'Accumulated depreciation account: opening balance + depreciation for the year - depreciation on the asset sold = closing balance.',
          `Depreciation for the year = ${inr(close)} + ${inr(sold)} - ${inr(open)} = ${inr(charge)}.`,
        ],
        hints: H.asset,
      };
    }
    const n = numeric(sold, [
      [close - open, 'Gave the net increase in accumulated depreciation.'],
      [charge, 'Gave the depreciation charged for the year.'],
      [close + charge - open, 'Put the opening and closing balances the wrong way round.'],
    ]);
    return n && {
      prompt: ask(`${co} sold a machine during ${YEAR}. Find the depreciation that had accumulated on the machine sold, which is needed to find its book value.`, [
        two(label, open, close),
        one('Depreciation charged during the year', charge),
      ]),
      ...n,
      explanation: [
        'Accumulated depreciation account: opening balance + depreciation for the year - depreciation on the asset sold = closing balance.',
        `Depreciation on the machine sold = ${inr(open)} + ${inr(charge)} - ${inr(close)} = ${inr(sold)}.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const rows = [...rowsOf(q.prompt)];
    const [open, close] = rows[0][1];
    const [label, [given]] = rows[1];
    return label.startsWith('Depreciation charged') ? open + given - ans(q) === close : open + ans(q) - given === close;
  },
});

const investmentsFlow = numericTemplate({
  id: 'cf-investments-flow', topicId: T, conceptId: 'cf-investing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const soldCost = k(rng, 50000, 200000, 10000);
    const open = soldCost + k(rng, 100000, 600000, 10000);
    const bought = k(rng, 60000, 400000, 10000);
    const close = open - soldCost + bought;
    // At most a fifth of the cost, so that the result of the sale is in proportion.
    const g = k(rng, 5000, Math.min(40000, soldCost / 5), 5000);
    const profit = rng.int(0, 3) > 0;
    const price = profit ? soldCost + g : soldCost - g;
    const what = profit ? 'profit' : 'loss';
    if (bought === soldCost) return null;
    if (rng.int(0, 1) === 0) {
      const n = numeric(bought, [
        [close - open, 'Took the increase in the balance as the purchase; the cost of the investments sold had left the account.'],
        [close - open + price, 'Credited the account with the sale proceeds instead of the cost of the investments sold.'],
        [close + soldCost, 'Did not deduct the opening balance.'],
      ]);
      return n && {
        prompt: ask(`Find the non-current investments purchased by ${co} during ${YEAR}, an outflow under investing activities.`, [
          two('Non-current investments', open, close),
          `Investments that had cost ${inr(soldCost)} were sold during the year at a ${what} of ${inr(g)}.`,
        ]),
        ...n,
        explanation: [
          'Investments account: opening balance + purchases - cost of investments sold = closing balance.',
          `Purchases = ${inr(close)} + ${inr(soldCost)} - ${inr(open)} = ${inr(bought)}.`,
          `The sale brought in ${inr(soldCost)} ${profit ? '+' : '-'} ${inr(g)} = ${inr(price)}, a separate inflow under investing activities.`,
        ],
        hints: H.asset,
      };
    }
    const n = numeric(price, [
      [soldCost, `Gave the cost of the investments sold; the ${what} changes the price received.`],
      [profit ? soldCost - g : soldCost + g, `Adjusted the ${what} the wrong way: a ${what} means the price was ${profit ? 'above' : 'below'} cost.`],
      [open - close + (profit ? g : -g), 'Left the purchases of the year out of the Investments account.'],
      [bought, 'Gave the investments purchased instead of the proceeds of those sold.'],
    ]);
    return n && {
      prompt: ask(`Find the proceeds from the sale of non-current investments of ${co} during ${YEAR}, an inflow under investing activities.`, [
        two('Non-current investments', open, close),
        one('Investments purchased during the year', bought),
        `Some investments were sold during the year at a ${what} of ${inr(g)}.`,
      ]),
      ...n,
      explanation: [
        `Cost of investments sold = opening balance + purchases - closing balance = ${inr(open)} + ${inr(bought)} - ${inr(close)} = ${inr(soldCost)}.`,
        `Sale proceeds = ${inr(soldCost)} ${profit ? '+ profit' : '- loss'} ${inr(g)} = ${inr(price)}.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    const sign = q.prompt.includes('a profit of') ? 1 : -1;
    // With the purchases given: the cost of the investments sold is what balances the account.
    return a.length === 4 && q.prompt.includes('Investments purchased') ? ans(q) === a[0] + a[2] - a[1] + sign * a[3] : a[0] + ans(q) - a[2] === a[1];
  },
});

/** The lines of a list of cash movements, each with the sign it has in the answer asked for: 0 for a line that does not belong. */
const INVESTING_USE = new Map<string, number>([
  ['Machinery bought for cash', 1],
  ['Non-current investments bought', 1],
  ['Old machinery sold for cash', -1],
  ['Non-current investments sold', -1],
  ['Interest received on investments', -1],
  ['Dividend received on investments', -1],
  ['Rent received from a let-out building', -1],
  ['Interest paid on debentures', 0],
  ['Equity shares issued for cash', 0],
  ['Machinery acquired by issue of equity shares to the vendor', 0],
  ['Dividend paid', 0],
]);
const signedTotal = (prompt: string, signs: Map<string, number>): number => sum([...rowsOf(prompt)].map(([label, a]) => (signs.get(label) ?? NaN) * a[0]));

const investingNet = numericTemplate({
  id: 'cf-investing-net', topicId: T, conceptId: 'cf-investing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const machinery = k(rng, 300000, 900000, 10000);
    const out: [string, number][] = [['Machinery bought for cash', machinery], ...(rng.int(0, 1) === 0 ? ([['Non-current investments bought', k(rng, 100000, 400000, 10000)]] as [string, number][]) : [])];
    const sale: [string, number] = rng.int(0, 1) === 0 ? ['Old machinery sold for cash', k(rng, 40000, 150000, 5000)] : ['Non-current investments sold', k(rng, 50000, 200000, 5000)];
    const incomes = rng.shuffle(['Interest received on investments', 'Dividend received on investments', 'Rent received from a let-out building']).slice(0, rng.int(1, 2)).map((label): [string, number] => [label, k(rng, 10000, 60000, 5000)]);
    const traps: { label: string; amt: number; sign: number; slip: string; note: string }[] = [
      { label: 'Interest paid on debentures', amt: k(rng, 20000, 90000, 5000), sign: 1, slip: 'Put interest paid on debentures under investing activities; it is a financing outflow.', note: 'Interest paid on debentures is a financing outflow.' },
      { label: 'Equity shares issued for cash', amt: k(rng, 50000, 200000, 10000), sign: -1, slip: 'Set the share issue off against the investing outflows; it is a financing inflow.', note: 'The issue of shares is a financing inflow.' },
      { label: 'Machinery acquired by issue of equity shares to the vendor', amt: k(rng, 100000, 300000, 10000), sign: 1, slip: 'Counted machinery acquired for shares as a cash purchase; no cash was paid.', note: 'Machinery acquired for shares is not a cash flow.' },
      { label: 'Dividend paid', amt: k(rng, 30000, 120000, 5000), sign: 1, slip: 'Put dividend paid under investing activities; it is a financing outflow.', note: 'Dividend paid is a financing outflow.' },
    ];
    const trap = rng.pick(traps);
    const outflow = sum(out.map(([, a]) => a));
    const income = sum(incomes.map(([, a]) => a));
    const answer = outflow - sale[1] - income;
    const n = numeric(answer, [
      [answer + trap.sign * trap.amt, trap.slip],
      [outflow - sale[1], 'Left out the interest, dividend or rent received, which are investing inflows for a non-financing company.'],
      [outflow, 'Showed only the purchases and left out the investing inflows.'],
      [outflow + sale[1] + income, 'Added the inflows to the outflows instead of deducting them.'],
    ]);
    return n && {
      prompt: ask(`These are among the cash movements of ${co} ${NF} in ${YEAR}. Find the net cash used in investing activities.`, rng.shuffle([...out, sale, ...incomes, [trap.label, trap.amt] as [string, number]]).map(([label, a]) => one(label, a))),
      ...n,
      explanation: [
        `Outflows: ${out.map(([label, a]) => `${label} ${inr(a)}`).join('; ')}.`,
        `Inflows: ${[sale, ...incomes].map(([label, a]) => `${label} ${inr(a)}`).join('; ')}.`,
        `Net cash used in investing activities = ${inr(outflow)} - ${inr(sale[1] + income)} = ${inr(answer)}.`,
        trap.note,
      ],
      hints: H.heads,
    };
  },
  verify: (q) => ans(q) === signedTotal(q.prompt, INVESTING_USE),
});

const FINANCING_FLOW = new Map<string, number>([
  ['Equity shares issued for cash, including securities premium', 1],
  ['Long-term loan raised from bank', 1],
  ['Long-term bank loan repaid', -1],
  ['Interest paid on long-term borrowings', -1],
  ['Dividend paid', -1],
  ['Increase in bank overdraft', 1],
  ['Decrease in bank overdraft', -1],
  ['Dividend received on investments', 0],
  ['Non-current investments bought', 0],
  ['Debentures converted into equity shares', 0],
  ['Income tax paid', 0],
]);

const financingNet = numericTemplate({
  id: 'cf-financing-net', topicId: T, conceptId: 'cf-financing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const shares = rng.int(0, 2) === 0 ? 0 : k(rng, 200000, 900000, 50000);
    const raise = rng.int(0, 1) === 0;
    const loan = k(rng, 100000, 600000, 25000);
    const interest = k(rng, 20000, 90000, 5000);
    const dividend = k(rng, 40000, 200000, 10000);
    const odUp = rng.int(0, 1) === 0;
    const od = k(rng, 20000, 120000, 10000);
    const traps: { label: string; amt: number; sign: number; slip: string; note: string }[] = [
      { label: 'Dividend received on investments', amt: k(rng, 15000, 80000, 5000), sign: 1, slip: 'Included dividend received, which is an investing inflow.', note: 'Dividend received is an investing inflow.' },
      { label: 'Non-current investments bought', amt: k(rng, 50000, 200000, 10000), sign: -1, slip: 'Included the purchase of investments, which is an investing outflow.', note: 'The purchase of investments is an investing outflow.' },
      { label: 'Debentures converted into equity shares', amt: k(rng, 100000, 300000, 50000), sign: -1, slip: 'Counted the conversion of debentures as a cash repayment; no cash moved.', note: 'A conversion of debentures into shares is not a cash flow.' },
      { label: 'Income tax paid', amt: k(rng, 30000, 150000, 5000), sign: -1, slip: 'Included income tax paid, which is an operating outflow.', note: 'Income tax paid is an operating outflow.' },
    ];
    const trap = rng.pick(traps);
    const lines: [string, number][] = [
      ...(shares > 0 ? ([['Equity shares issued for cash, including securities premium', shares]] as [string, number][]) : []),
      [raise ? 'Long-term loan raised from bank' : 'Long-term bank loan repaid', loan],
      ['Interest paid on long-term borrowings', interest],
      ['Dividend paid', dividend],
      [odUp ? 'Increase in bank overdraft' : 'Decrease in bank overdraft', od],
    ];
    const net = sum(lines.map(([label, a]) => FINANCING_FLOW.get(label)! * a));
    if (Math.abs(net) < 20000) return null;
    // A wrong figure is offered only when it lies on the same side as the answer: the prompt says which side that is.
    const alt = (v: number, why: string): [number, string] => [v * net > 0 ? Math.abs(v) : 0, why];
    const n = numeric(Math.abs(net), [
      alt(net - (odUp ? od : -od), 'Left out the change in bank overdraft; it is a short-term borrowing and so a financing item.'),
      alt(net + interest, 'Left out the interest paid; for a non-financing company it is a financing outflow.'),
      alt(net + trap.sign * trap.amt, trap.slip),
      alt(net + dividend, 'Left out the dividend paid, which is a financing outflow.'),
    ]);
    const inflows = lines.filter(([label]) => FINANCING_FLOW.get(label)! > 0);
    const outflows = lines.filter(([label]) => FINANCING_FLOW.get(label)! < 0);
    return n && {
      prompt: ask(`These are among the cash movements of ${co} ${NF} in ${YEAR}. Find the net cash ${net > 0 ? 'from' : 'used in'} financing activities.`, rng.shuffle([...lines, [trap.label, trap.amt] as [string, number]]).map(([label, a]) => one(label, a))),
      ...n,
      explanation: [
        ...(inflows.length > 0 ? [`Inflows: ${inflows.map(([label, a]) => `${label} ${inr(a)}`).join('; ')} = ${inr(sum(inflows.map(([, a]) => a)))}.`] : []),
        `Outflows: ${outflows.map(([label, a]) => `${label} ${inr(a)}`).join('; ')} = ${inr(sum(outflows.map(([, a]) => a)))}.`,
        `Net cash ${net > 0 ? 'from' : 'used in'} financing activities = ${inr(Math.abs(net))}.`,
        trap.note,
      ],
      hints: H.fin,
    };
  },
  verify: (q) => {
    const net = signedTotal(q.prompt, FINANCING_FLOW);
    return ans(q) === Math.abs(net) && q.prompt.includes(net > 0 ? 'net cash from financing' : 'net cash used in financing');
  },
});

const sharesNonCash = numericTemplate({
  id: 'cf-shares-non-cash', topicId: T, conceptId: 'cf-financing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const capOpen = k(rng, 500000, 2000000, 100000);
    const capUp = k(rng, 200000, 1000000, 50000);
    const premOpen = k(rng, 20000, 200000, 20000);
    const premUp = (capUp * rng.pick([10, 20, 25])) / 100;
    const vendor = k(rng, 50000, Math.min(capUp + premUp - 50000, 600000), 10000);
    const asset = rng.pick(['Machinery', 'A building', 'Plant']);
    const answer = capUp + premUp - vendor;
    const n = numeric(answer, [
      [capUp + premUp, `Counted the shares given to the vendor as issued for cash; they were given for ${asset.toLowerCase()}.`],
      [capUp - vendor, 'Left out the securities premium received in cash.'],
      [capUp + premUp + vendor, 'Added the non-cash issue instead of taking it out.'],
      [vendor, 'Gave the value of the shares issued to the vendor, which brought in no cash.'],
    ]);
    return n && {
      prompt: ask(`Find the cash proceeds from the issue of shares that ${co} shows under financing activities for ${YEAR}.`, [
        two('Equity Share Capital', capOpen, capOpen + capUp),
        two('Securities Premium', premOpen, premOpen + premUp),
        `${asset} of ${inr(vendor)} was bought during the year and paid for by issuing equity shares to the vendor; these shares are part of the increases above. All other shares were issued for cash.`,
      ]),
      ...n,
      explanation: [
        `Total increase = share capital ${inr(capUp)} + securities premium ${inr(premUp)} = ${inr(capUp + premUp)}.`,
        `Less: shares issued to the vendor, a non-cash transaction, ${inr(vendor)}.`,
        `Cash proceeds from issue of shares = ${inr(capUp + premUp)} - ${inr(vendor)} = ${inr(answer)}.`,
      ],
      hints: H.fin,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [c0, c1] = row(rows, 'Equity Share Capital');
    const [p0, p1] = row(rows, 'Securities Premium');
    return ans(q) === c1 - c0 + (p1 - p0) - amountsIn(q.prompt)[4];
  },
});

const overdraftTreatment = mcqTemplate({
  id: 'cf-overdraft-treatment', topicId: T, conceptId: 'cf-financing', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const label = rng.pick(['Bank overdraft', 'Cash credit from bank']);
    const open = k(rng, 40000, 300000, 10000);
    const d = k(rng, 10000, 100000, 5000);
    const up = rng.int(0, 1) === 0;
    const close = up ? open + d : open - d;
    if (close <= 0 || close === d) return null;
    const flow = (inflow: boolean, v: number): string => `${inflow ? 'An inflow' : 'An outflow'} of ${inr(v)} under financing activities`;
    return choice(
      `${co}: ${label} was ${inr(open)} on ${Y0} and ${inr(close)} on ${Y1}. How does this appear in its Cash Flow Statement for ${YEAR} under the CBSE treatment?`,
      flow(up, d),
      [
        [flow(!up, d), 'Read the direction the wrong way round: a rise in a borrowing brings cash in, a fall takes cash out.'],
        [`${up ? 'An addition' : 'A deduction'} of ${inr(d)} among the working capital changes under operating activities`, `Treated ${label.toLowerCase()} as an operating current liability; it is a short-term borrowing.`],
        [`A deduction of ${inr(close)} from the closing cash and cash equivalents`, `Treated ${label.toLowerCase()} as a negative bank balance; under the CBSE treatment it is a short-term borrowing.`],
        [flow(up, close), 'Showed the closing balance instead of the change during the year.'],
      ],
      `${label} is treated as a short-term borrowing. It ${up ? 'rose' : 'fell'} by ${inr(d)}, so ${up ? 'cash came in' : 'cash was paid back'}: ${flow(up, d).toLowerCase()}.`,
      H.fin,
    );
  },
  verify: (q) => {
    const [open, close] = amountsIn(q.prompt);
    return optionText(q) === `${close > open ? 'An inflow' : 'An outflow'} of ${inr(Math.abs(close - open))} under financing activities`;
  },
});

const ISSUE_DATES: [string, number][] = [['1 July 2025', 9], ['1 October 2025', 6], ['1 January 2026', 3]];

const interestPaid = numericTemplate({
  id: 'cf-interest-paid', topicId: T, conceptId: 'cf-financing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const rate = rng.pick([8, 9, 10, 12]);
    const old = k(rng, 200000, 900000, 100000);
    const fresh = k(rng, 100000, 500000, 100000);
    const [date, months] = rng.pick(ISSUE_DATES);
    const answer = (old * rate) / 100 + (fresh * rate * months) / 1200;
    const n = numeric(answer, [
      [((old + fresh) * rate) / 100, `Charged a full year's interest on the new debentures, which were outstanding for only ${months} months.`],
      [(old * rate) / 100, 'Left out the interest on the debentures issued during the year.'],
      [(old * rate) / 100 + (fresh * rate * (12 - months)) / 1200, 'Counted the months before the issue instead of the months after it.'],
      [(fresh * rate * months) / 1200, 'Gave only the interest on the new debentures.'],
    ]);
    return n && {
      prompt: ask(`Find the interest on debentures paid by ${co} ${NF} during ${YEAR}: it is added back to the profit and shown as an outflow under financing activities.`, [
        two(`${rate}% Debentures`, old, old + fresh),
        `The additional debentures were issued on ${date}. Interest is paid on the due dates, so none is outstanding at either year end.`,
      ]),
      ...n,
      explanation: [
        `On the debentures held all year: ${rate}% of ${inr(old)} = ${inr((old * rate) / 100)}.`,
        `On the new debentures, ${date} to ${Y1} is ${months} months: ${inr(fresh)} x ${rate}% x ${months}/12 = ${inr((fresh * rate * months) / 1200)}.`,
        `Interest paid = ${inr((old * rate) / 100)} + ${inr((fresh * rate * months) / 1200)} = ${inr(answer)}.`,
      ],
      hints: ['Interest runs only for the months a debenture is outstanding.', 'For a non-financing company, interest paid is added back to the profit and shown under financing activities.'],
    };
  },
  verify: (q) => {
    const rate = Number(/(\d+)% Debentures/.exec(q.prompt)?.[1]);
    const [old, closing] = amountsIn(q.prompt);
    const months = ISSUE_DATES.find(([date]) => q.prompt.includes(`issued on ${date}`))?.[1] ?? NaN;
    // Month by month: the opening debentures for twelve months, the new ones for the months they were outstanding.
    return ans(q) * 1200 === old * rate * 12 + (closing - old) * rate * months;
  },
});

const missingActivity = numericTemplate({
  id: 'cf-missing-activity', topicId: T, conceptId: 'cf-reconcile', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const f = drawFlows(rng);
    const net = f.op + f.inv + f.fin;
    const cash0 = k(rng, 60000, 400000, 10000);
    const sec0 = k(rng, 20000, 200000, 10000);
    const sec1 = k(rng, 20000, 200000, 10000);
    const cash1 = cash0 + sec0 + net - sec1;
    if (net === 0 || cash1 <= 0 || sec1 === sec0) return null;
    const unknown = rng.pick(['op', 'inv', 'fin'] as const);
    const others = net - f[unknown];
    const side = f[unknown] > 0 ? 'from' : 'used in';
    const alt = (v: number, why: string): [number, string] => [v * f[unknown] > 0 ? Math.abs(v) : 0, why];
    const n = numeric(Math.abs(f[unknown]), [
      alt(cash1 - cash0 - others, 'Left the marketable securities out of cash and cash equivalents.'),
      alt(-net - others, 'Took the change in cash and cash equivalents the wrong way round.'),
      alt(net + others, 'Applied the other two activities the wrong way round.'),
      alt(net, 'Gave the net change in cash and cash equivalents and ignored the other two activities.'),
    ]);
    const known = (['op', 'inv', 'fin'] as const).filter((key) => key !== unknown);
    return n && {
      prompt: ask(`The Cash Flow Statement of ${co} for ${YEAR} is complete but for one figure. Find the net cash ${side} ${FLOW_NAME[unknown]} activities.`, [
        two('Cash and bank balances', cash0, cash1),
        two('Marketable securities (current investments)', sec0, sec1),
        ...known.map((key) => flowLine(key, f[key])),
      ]),
      ...n,
      explanation: [
        `Cash and cash equivalents: ${inr(cash0)} + ${inr(sec0)} = ${inr(cash0 + sec0)} at the start; ${inr(cash1)} + ${inr(sec1)} = ${inr(cash1 + sec1)} at the end.`,
        `Net ${net > 0 ? 'increase' : 'decrease'} = ${inr(Math.abs(net))}.`,
        `The other two activities together give a net ${others >= 0 ? 'inflow' : 'outflow'} of ${inr(Math.abs(others))}.`,
        `Net cash ${side} ${FLOW_NAME[unknown]} activities = ${inr(Math.abs(f[unknown]))}, the figure that makes the three activities equal the net ${net > 0 ? 'increase' : 'decrease'}.`,
      ],
      hints: H.rec,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [c0, c1] = row(rows, 'Cash and bank balances');
    const [s0, s1] = row(rows, 'Marketable securities (current investments)');
    const signed = (q.prompt.split('\n')[0].includes('net cash used in') ? -1 : 1) * ans(q);
    return c0 + s0 + flowsIn(q.prompt) + signed === c1 + s1;
  },
});

const medium: Template[] = [
  classifyByCompany, interestDividendHeads, npbtFull, opProfitFull, cashFromOpsFull, operatingAfterTax, assetPurchaseCost, saleProceeds,
  depCharged, investmentsFlow, investingNet, financingNet, sharesNonCash, overdraftTreatment, interestPaid, missingActivity,
];

// ===============================================================================================================
// COMPLEX
// ===============================================================================================================

/** A machine sold during the year: its cost, the depreciation accumulated on it and the price it fetched. */
function drawSale(rng: Rng) {
  const cost = k(rng, 100000, 300000, 10000);
  const accumulated = (cost * rng.pick([30, 40, 50, 60, 70])) / 100;
  const book = cost - accumulated;
  const g = rng.pick([-1, 1]) * k(rng, 5000, 25000, 5000);
  return { cost, accumulated, book, g, price: book + g, what: g > 0 ? 'profit' : 'loss' };
}
const SALE_START = 'During the year a machine that had cost';
const saleLine = (s: { cost: number; accumulated: number; price: number }): string =>
  `${SALE_START} ${inr(s.cost)}, on which depreciation of ${inr(s.accumulated)} had accumulated, was sold for ${inr(s.price)}.`;
/** The cost, the accumulated depreciation and the price of the machine a prompt says was sold. */
const saleIn = (prompt: string): number[] => amountsIn(prompt.split('\n').find((l) => l.startsWith(SALE_START)) ?? '');

/** The profit (+) or loss (-) of the sale a prompt tells of. */
const signedResult = (prompt: string): number => {
  const m = /at a (profit|loss) of ₹([\d,]+)/.exec(prompt);
  return m ? (m[1] === 'profit' ? 1 : -1) * Number(m[2].replace(/,/g, '')) : NaN;
};
/** One figure of a prompt, found by the words before it. */
const figureAfter = (prompt: string, words: string): number => {
  const at = prompt.indexOf(words);
  return at < 0 ? NaN : amountsIn(prompt.slice(at + words.length))[0];
};

const fixedAssetAccount = numericTemplate({
  id: 'cf-fixed-asset-account', topicId: T, conceptId: 'cf-investing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = drawSale(rng);
    const open = s.cost + k(rng, 400000, 1200000, 50000);
    const bought = k(rng, 200000, 700000, 10000);
    const close = open - s.cost + bought;
    const depOpen = s.accumulated + k(rng, 60000, 300000, 10000);
    const charge = s.accumulated + k(rng, 10000, 120000, 5000);
    const depClose = depOpen - s.accumulated + charge;
    if (s.price <= 0 || bought <= s.price || bought === s.cost) return null;
    const balances = [two('Machinery (at cost)', open, close), two('Accumulated depreciation on machinery', depOpen, depClose)];
    const result = `at a ${s.what} of ${inr(Math.abs(s.g))}`;
    const bookFromPrice = `Book value of the machine sold = sale price ${s.g > 0 ? '- profit' : '+ loss'} = ${inr(s.price)} ${s.g > 0 ? '-' : '+'} ${inr(Math.abs(s.g))} = ${inr(s.book)}.`;
    const account = `Machinery account (at cost): ${inr(open)} + purchases - ${inr(s.cost)} = ${inr(close)}, so purchases = ${inr(bought)}.`;
    const variant = rng.int(0, 3);
    if (variant === 0) {
      // The whole sale is given; the purchase is the balancing figure of the account kept at cost.
      const n = numeric(bought - s.price, [
        [bought, 'Showed only the purchase and left out the sale proceeds of the machine.'],
        [close - open - s.price, 'Took the increase in Machinery as the purchase; the cost of the machine sold had been taken out of the account.'],
        [close - open, 'Credited the Machinery account with the sale price, so that the purchase and the sale cancelled out.'],
        [bought + s.price, 'Added the sale proceeds to the purchase instead of deducting them.'],
        [bought - s.book, 'Took the book value of the machine for the cash it fetched.'],
      ]);
      return n && {
        prompt: ask(`From these balances of ${co}, find the net cash used in investing activities during ${YEAR}. Machinery is its only investing item.`, [...balances, saleLine(s)]),
        ...n,
        explanation: [account, `Sale of machinery brought in ${inr(s.price)}.`, `Net cash used in investing activities = ${inr(bought)} - ${inr(s.price)} = ${inr(bought - s.price)}.`],
        hints: H.asset,
      };
    }
    if (variant === 1) {
      // The depreciation on the machine sold is not given: it comes from the cost, the price and the result of the sale.
      const n = numeric(charge, [
        [depClose - depOpen, 'Took the increase in accumulated depreciation as the charge; the depreciation on the machine sold had been taken out of the account.'],
        [depClose - depOpen + s.cost - s.price, `Took cost less sale price as the depreciation on the machine sold and ignored the ${s.what} on its sale.`],
        [depClose - depOpen + s.cost - (s.price + s.g), `Adjusted the ${s.what} the wrong way in finding the book value of the machine sold.`],
        [depClose - depOpen + s.book, 'Took the book value of the machine sold, instead of the depreciation accumulated on it, out of the account.'],
      ]);
      return n && {
        prompt: ask(`From these balances of ${co}, find the depreciation charged on machinery for ${YEAR}, which is added back to the net profit before tax.`, [
          ...balances,
          `${SALE_START} ${inr(s.cost)} was sold for ${inr(s.price)}, ${result}.`,
        ]),
        ...n,
        explanation: [
          bookFromPrice,
          `Depreciation accumulated on it = cost - book value = ${inr(s.cost)} - ${inr(s.book)} = ${inr(s.accumulated)}.`,
          'Accumulated depreciation account: opening balance + depreciation for the year - depreciation on the machine sold = closing balance.',
          `Depreciation for the year = ${inr(depClose)} + ${inr(s.accumulated)} - ${inr(depOpen)} = ${inr(charge)}.`,
        ],
        hints: [
          'First find the book value of the machine sold from its price and the profit or loss; cost less book value is the depreciation accumulated on it.',
          'Then balance the Accumulated depreciation account: the depreciation on the machine sold left the account.',
        ],
      };
    }
    if (variant === 2) {
      // The depreciation on the machine sold is the balancing figure of the Accumulated depreciation account.
      const n = numeric(s.price, [
        [s.book, `Gave the book value of the machine sold; the ${s.what} on sale has still to be ${s.g > 0 ? 'added' : 'deducted'}.`],
        [s.book - s.g, `Adjusted the ${s.what} the wrong way: a ${s.what} means the price was ${s.g > 0 ? 'above' : 'below'} the book value.`],
        [s.cost + s.g, 'Worked from the original cost and ignored the depreciation accumulated on the machine.'],
        [s.cost - charge + s.g, 'Took the whole depreciation of the year as the depreciation on the machine sold.'],
      ]);
      return n && {
        prompt: ask(`From these balances of ${co}, find the sale proceeds of the machine sold during ${YEAR}, an inflow under investing activities.`, [
          ...balances,
          one('Depreciation charged on machinery for the year', charge),
          `${SALE_START} ${inr(s.cost)} was sold ${result}.`,
        ]),
        ...n,
        explanation: [
          `Accumulated depreciation account: ${inr(depOpen)} + ${inr(charge)} - depreciation on the machine sold = ${inr(depClose)}, so the depreciation on the machine sold = ${inr(s.accumulated)}.`,
          `Book value of the machine sold = ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)}.`,
          `Sale proceeds = book value ${s.g > 0 ? '+ profit' : '- loss'} = ${inr(s.book)} ${s.g > 0 ? '+' : '-'} ${inr(Math.abs(s.g))} = ${inr(s.price)}.`,
        ],
        hints: [
          'Balance the Accumulated depreciation account to find the depreciation on the machine sold.',
          'Sale proceeds = (cost - depreciation accumulated on the machine) + profit, or - loss.',
        ],
      };
    }
    // The cost of the machine sold is not given: its book value, from the price and the result, plus the depreciation on it.
    const n = numeric(bought, [
      [close - open, 'Took the increase in Machinery as the purchase; the cost of the machine sold had been taken out of the account.'],
      [close - open + s.price, 'Credited the Machinery account with the sale price instead of the cost of the machine sold.'],
      [close - open + s.book, 'Took the machine sold out at its book value; the account is kept at cost.'],
      [close - open + s.price + s.g + s.accumulated, `Adjusted the ${s.what} the wrong way in finding the book value of the machine sold.`],
    ]);
    return n && {
      prompt: ask(`From these balances of ${co}, find the machinery purchased during ${YEAR}, an outflow under investing activities.`, [
        ...balances,
        `During the year a machine on which depreciation of ${inr(s.accumulated)} had accumulated was sold for ${inr(s.price)}, ${result}.`,
      ]),
      ...n,
      explanation: [
        bookFromPrice,
        `Cost of the machine sold = book value + depreciation accumulated on it = ${inr(s.book)} + ${inr(s.accumulated)} = ${inr(s.cost)}.`,
        account,
      ],
      hints: [
        'The Machinery account is kept at cost, so the machine sold leaves it at its cost.',
        'Cost of the machine sold = its book value + the depreciation accumulated on it; the book value comes from the price and the profit or loss.',
      ],
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [open, close] = row(rows, 'Machinery (at cost)');
    const [depOpen, depClose] = row(rows, 'Accumulated depreciation on machinery');
    const first = q.prompt.split('\n')[0];
    const g = signedResult(q.prompt);
    if (first.includes('net cash used in investing')) {
      const [cost, , price] = saleIn(q.prompt);
      return open + (ans(q) + price) - cost === close;
    }
    if (first.includes('depreciation charged')) {
      // Cost less book value is the depreciation that left the Accumulated depreciation account with the machine.
      const accumulated = figureAfter(q.prompt, 'that had cost') - (figureAfter(q.prompt, 'was sold for') - g);
      return depOpen + ans(q) - accumulated === depClose;
    }
    if (first.includes('sale proceeds')) {
      const accumulated = depOpen + row(rows, 'Depreciation charged on machinery for the year')[0] - depClose;
      return ans(q) === figureAfter(q.prompt, 'that had cost') - accumulated + g;
    }
    const cost = figureAfter(q.prompt, 'was sold for') - g + figureAfter(q.prompt, 'on which depreciation of');
    return first.includes('machinery purchased') && open + ans(q) - cost === close;
  },
});

const fixedAssetWdv = numericTemplate({
  id: 'cf-fixed-asset-wdv', topicId: T, conceptId: 'cf-investing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const asset = rng.pick(['Machinery', 'Plant and machinery', 'Vehicles']);
    const unit = asset === 'Vehicles' ? 'A vehicle' : 'A machine';
    const open = k(rng, 500000, 1200000, 10000);
    const dep = k(rng, 50000, 150000, 5000);
    const book = k(rng, 40000, 150000, 10000);
    const g = rng.pick([-1, 1]) * k(rng, 5000, 30000, 5000);
    const price = book + g;
    const bought = price + k(rng, 100000, 500000, 10000);
    const close = open - dep - book + bought;
    const what = g > 0 ? 'profit' : 'loss';
    const wantsNet = rng.int(0, 2) > 0;
    // The sale is told by its price or by the book value of the asset; the purchase alone is asked only with the price.
    const byPrice = !wantsNet || rng.int(0, 1) === 0;
    const lines = [
      two(`${asset} (net of accumulated depreciation)`, open, close),
      one('Depreciation charged during the year', dep),
      byPrice
        ? `${unit} was sold during the year for ${inr(price)}, at a ${what} of ${inr(Math.abs(g))}.`
        : `${unit} with a book value of ${inr(book)} was sold during the year at a ${what} of ${inr(Math.abs(g))}.`,
    ];
    const account = [
      ...(byPrice ? [`Book value of the asset sold = sale price ${g > 0 ? '- profit' : '+ loss'} = ${inr(price)} ${g > 0 ? '-' : '+'} ${inr(Math.abs(g))} = ${inr(book)}.`] : []),
      `${asset} account at book value: opening balance + purchases - depreciation - book value of the asset sold = closing balance.`,
      `Purchases = ${inr(close)} + ${inr(dep)} + ${inr(book)} - ${inr(open)} = ${inr(bought)}.`,
    ];
    if (!wantsNet) {
      const n = numeric(bought, [
        [close + dep + price - open, `Credited the account with the sale price; the asset leaves the account at its book value, which is the price ${g > 0 ? 'less the profit' : 'plus the loss'}.`],
        [close + dep + price + g - open, `Adjusted the ${what} the wrong way in finding the book value of the asset sold.`],
        [close - open + dep, 'Left out the book value of the asset sold, which had also reduced the account.'],
        [close - open + book, 'Left out the depreciation, which had also reduced the account.'],
        [close - open, 'Took the change in the balance as the purchase.'],
      ]);
      return n && { prompt: ask(`From this information of ${co}, find the ${asset.toLowerCase()} purchased during ${YEAR}, an outflow under investing activities.`, lines), ...n, explanation: account, hints: H.asset };
    }
    const n = numeric(bought - price, [
      [bought - book, `Took the book value for the cash received; the asset was sold at a ${what}.`],
      [bought, 'Showed only the purchase and left out the sale proceeds.'],
      byPrice
        ? [bought + 2 * g - price, `Adjusted the ${what} the wrong way in finding the book value of the asset sold.`]
        : [bought - (book - g), `Adjusted the ${what} the wrong way in finding the sale proceeds.`],
      [close - open + dep - price, 'Left the book value of the asset sold out of the account in finding the purchase.'],
    ]);
    return n && {
      prompt: ask(`From this information of ${co}, find the net cash used in investing activities during ${YEAR}. ${asset} ${asset === 'Vehicles' ? 'are' : 'is'} its only investing item.`, lines),
      ...n,
      explanation: [
        ...account,
        byPrice ? `Sale proceeds = ${inr(price)}.` : `Sale proceeds = book value ${g > 0 ? '+ profit' : '- loss'} = ${inr(book)} ${g > 0 ? '+' : '-'} ${inr(Math.abs(g))} = ${inr(price)}.`,
        `Net cash used in investing activities = ${inr(bought)} - ${inr(price)} = ${inr(bought - price)}.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const [open, close, dep, given] = amountsIn(q.prompt);
    const g = signedResult(q.prompt);
    // The sale line gives the book value or the price; the other follows from the profit or loss.
    const book = q.prompt.includes('with a book value of') ? given : given - g;
    const bought = close + dep + book - open;
    return ans(q) === (q.prompt.split('\n')[0].includes('net cash used in investing') ? bought - (book + g) : bought);
  },
});

const PAID_DIVIDEND = `Proposed dividend of ${PREV}, declared and paid during the year`;

const operatingSection = numericTemplate({
  id: 'cf-operating-section', topicId: T, conceptId: 'cf-working-capital', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const sOpen = k(rng, 150000, 600000, 10000);
    const after = k(rng, 150000, 500000, 10000);
    const taxOpen = k(rng, 40000, 200000, 5000);
    const made = taxOpen + k(rng, -4, 14, 1) * 5000;
    const paid = taxOpen + k(rng, -4, 4, 1) * 5000;
    const taxClose = taxOpen + made - paid;
    const prev = rng.int(0, 1) === 0 ? 0 : k(rng, 40000, 120000, 10000);
    const adj = [
      ...rng.shuffle(ADJ_PLUS).slice(0, 2).map((a) => ({ ...a, amt: k(rng, 15000, 120000, 5000) })),
      ...rng.shuffle(ADJ_MINUS).slice(0, 1).map((a) => ({ ...a, amt: k(rng, 10000, 60000, 5000) })),
    ];
    const { real, effect } = drawWorkingCapital(rng, 3);
    if (made <= 0 || paid <= 0 || taxClose <= 0 || paid === made || effect === 0) return null;
    const plus = sum(adj.filter((i) => i.sign > 0).map((i) => i.amt));
    const minus = sum(adj.filter((i) => i.sign < 0).map((i) => i.amt));
    const npbt = after + made + prev;
    const op = npbt + plus - minus;
    const cgo = op + effect;
    const answer = cgo - paid;
    const n = numeric(answer, [
      [cgo - made, 'Deducted the provision made instead of the tax paid, which comes from the Provision for tax account.'],
      [answer - made, 'Did not add back the provision for tax in arriving at net profit before tax.'],
      ...(prev > 0 ? ([[answer - prev, 'Did not add back the dividend paid out of Surplus during the year.']] as [number, string][]) : []),
      [op - effect - paid, 'Took the working capital changes the wrong way round.'],
      [answer + 2 * minus, 'Added the non-operating income instead of deducting it.'],
      [answer - plus, 'Did not add back the non-cash and non-operating expenses.'],
    ]);
    return n && {
      prompt: ask(`From this information of ${co} ${NF}, find the net cash from operating activities for ${YEAR}. No transfer was made to reserves${prev > 0 ? '' : ' and no dividend was paid'}.`, [
        two(SURPLUS, sOpen, sOpen + after),
        two('Provision for tax', taxOpen, taxClose),
        ...real.map((i) => two(i.label, i.open, i.close)),
        one('Provision for tax made during the year', made),
        ...adj.map((i) => one(i.label, i.amt)),
        ...(prev > 0 ? [one(PAID_DIVIDEND, prev)] : []),
      ]),
      ...n,
      explanation: [
        `${NPBT} = increase in Surplus ${inr(after)} + provision for tax made ${inr(made)}${prev > 0 ? ` + dividend paid ${inr(prev)}` : ''} = ${inr(npbt)}.`,
        ...adjLines(adj),
        `Operating profit before working capital changes = ${inr(npbt)} + ${inr(plus)} - ${inr(minus)} = ${inr(op)}.`,
        ...real.map((i) => wcLine(i.label, i.kind as 'A' | 'L', i.open, i.close)),
        `Cash generated from operations = ${inr(op)} ${real.map((i) => `${wcSign(i.kind, i.open, i.close) > 0 ? '+' : '-'} ${inr(Math.abs(i.close - i.open))}`).join(' ')} = ${inr(cgo)}.`,
        `Tax paid = ${inr(taxOpen)} + ${inr(made)} - ${inr(taxClose)} = ${inr(paid)}.`,
        `Net cash from operating activities = ${inr(cgo)} - ${inr(paid)} = ${inr(answer)}.`,
      ],
      hints: ['Work in four steps: net profit before tax, operating profit before working capital changes, cash generated from operations, then tax paid.', 'The provision for tax made is added back at the start; the tax actually paid is deducted at the end.'],
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [s0, s1] = row(rows, SURPLUS);
    const [t0, t1] = row(rows, 'Provision for tax');
    const made = row(rows, 'Provision for tax made during the year')[0];
    const adjustments = sum([...rows].filter(([label]) => ADJ_SIGN.has(label)).map(([label, a]) => ADJ_SIGN.get(label)! * a[0]));
    // The tax paid is what balances the Provision for tax account.
    return ans(q) === s1 - s0 + made + (rows.get(PAID_DIVIDEND)?.[0] ?? 0) + adjustments + wcEffectOf(rows) - (t0 + made - t1);
  },
});

const opProfitIndirect = numericTemplate({
  id: 'cf-op-profit-indirect', topicId: T, conceptId: 'cf-adjustments', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = drawSale(rng);
    const sOpen = k(rng, 150000, 600000, 10000);
    const after = k(rng, 200000, 600000, 10000);
    const tax = k(rng, 50000, 200000, 10000);
    const depOpen = s.accumulated + k(rng, 60000, 300000, 10000);
    const charge = s.accumulated + k(rng, 10000, 120000, 5000);
    const depClose = depOpen - s.accumulated + charge;
    const interest = k(rng, 20000, 90000, 5000);
    const income = { ...rng.pick(ADJ_MINUS.slice(2)), amt: k(rng, 10000, 60000, 5000) };
    if (s.price <= 0) return null;
    const answer = after + tax + charge - s.g + interest - income.amt;
    const n = numeric(answer, [
      [answer - s.accumulated, 'Took the increase in accumulated depreciation as the charge and missed the depreciation on the machine sold.'],
      [answer + 2 * s.g, `Adjusted the ${s.what} on sale the wrong way round.`],
      [answer + s.g, `Did not adjust the ${s.what} on the sale of the machine.`],
      [answer - tax, 'Did not add back the provision for tax made.'],
      [answer + 2 * income.amt, 'Added the income of an investing activity instead of deducting it.'],
      [answer - interest, 'Left interest on debentures inside the operating profit; it is a financing cost.'],
    ]);
    return n && {
      prompt: ask(`From this information of ${co} ${NF}, find the operating profit before working capital changes for ${YEAR}. No dividend was paid and no transfer was made to reserves.`, [
        two(SURPLUS, sOpen, sOpen + after),
        one('Provision for tax made during the year', tax),
        two('Accumulated depreciation on machinery', depOpen, depClose),
        saleLine(s),
        one('Interest paid on debentures', interest),
        one(income.label, income.amt),
      ]),
      ...n,
      explanation: [
        `${NPBT} = increase in Surplus ${inr(after)} + provision for tax ${inr(tax)} = ${inr(after + tax)}.`,
        `Depreciation for the year = ${inr(depClose)} + ${inr(s.accumulated)} - ${inr(depOpen)} = ${inr(charge)}: add.`,
        `Machine sold: book value ${inr(s.book)}, price ${inr(s.price)}, a ${s.what} of ${inr(Math.abs(s.g))}: ${s.g > 0 ? 'deduct' : 'add'}.`,
        `Add interest paid on debentures ${inr(interest)} (a financing cost); deduct ${income.label.toLowerCase()} ${inr(income.amt)} (${income.reason}).`,
        `Operating profit before working capital changes = ${inr(after + tax)} + ${inr(charge)} ${s.g > 0 ? '-' : '+'} ${inr(Math.abs(s.g))} + ${inr(interest)} - ${inr(income.amt)} = ${inr(answer)}.`,
      ],
      hints: ['The depreciation of the year is not given: write up the Accumulated depreciation account.', 'Profit or loss on the sale = sale price - (cost - accumulated depreciation of the machine sold).'],
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [s0, s1] = row(rows, SURPLUS);
    const [d0, d1] = row(rows, 'Accumulated depreciation on machinery');
    const [cost, accumulated, price] = saleIn(q.prompt);
    const income = [...rows].find(([label]) => ADJ_SIGN.get(label) === -1);
    if (income === undefined) return false;
    // Surplus and tax, the charge that balances the depreciation account, the result of the sale taken out, interest and income.
    return ans(q) === s1 - s0 + row(rows, 'Provision for tax made during the year')[0] + (d1 + accumulated - d0) - (price - (cost - accumulated)) + row(rows, 'Interest paid on debentures')[0] - income[1][0];
  },
});

const financingFull = numericTemplate({
  id: 'cf-financing-full', topicId: T, conceptId: 'cf-financing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const capOpen = k(rng, 500000, 2000000, 100000);
    // Shares are issued in two seeds of three; in the others the capital stands still and the lines are left out.
    const capUp = rng.int(0, 2) === 0 ? 0 : k(rng, 100000, 600000, 50000);
    const premOpen = k(rng, 20000, 200000, 20000);
    const premUp = (capUp * rng.pick([10, 20, 25])) / 100;
    // A long-term bank loan that is partly repaid, in half the seeds.
    const loanOpen = k(rng, 300000, 900000, 50000);
    const repaid = rng.int(0, 1) === 0 ? 0 : k(rng, 100000, 250000, 50000);
    const loanInterest = repaid > 0 ? k(rng, 20000, 80000, 5000) : 0;
    const rate = rng.pick([8, 9, 10, 12]);
    const debOld = k(rng, 200000, 800000, 100000);
    const debNew = k(rng, 100000, 400000, 100000);
    const [date, months] = rng.pick(ISSUE_DATES);
    const interest = (debOld * rate) / 100 + (debNew * rate * months) / 1200;
    const fullInterest = ((debOld + debNew) * rate) / 100;
    const odOpen = k(rng, 50000, 300000, 10000);
    const odChange = rng.pick([-1, 1]) * k(rng, 20000, 120000, 10000);
    // The dividend proposed for the previous year is a percentage of the capital that stood then.
    const prev = (capOpen * rng.pick([8, 10, 12, 15])) / 100;
    const cur = prev + rng.pick([-20000, -10000, 10000, 20000, 30000]);
    const net = capUp + premUp + debNew + odChange - repaid - interest - loanInterest - prev;
    if (odOpen + odChange <= 0 || Math.abs(net) < 20000) return null;
    const alt = (v: number, why: string): [number, string] => [v * net > 0 ? Math.abs(v) : 0, why];
    const n = numeric(Math.abs(net), [
      alt(net - odChange, 'Left out the change in bank overdraft; it is a short-term borrowing and so a financing item.'),
      alt(net + prev - cur, 'Showed the dividend proposed for the current year as paid; it is the previous year\'s proposed dividend that was paid.'),
      alt(net + interest - fullInterest, 'Charged a full year\'s interest on the debentures issued during the year.'),
      alt(net + interest + loanInterest, 'Left out the interest paid on borrowings, a financing outflow for a non-financing company.'),
      ...(capUp > 0 ? [alt(net - premUp, 'Left out the securities premium received on the shares.')] : []),
      ...(repaid > 0 ? [alt(net + 2 * repaid, 'Took the fall in the bank loan as money coming in; a loan falls when it is repaid.')] : []),
    ]);
    const outflows = [...(repaid > 0 ? [repaid, loanInterest] : []), interest, prev];
    return n && {
      prompt: ask(`From these balances and other information of ${co} ${NF}, find the net cash ${net > 0 ? 'from' : 'used in'} financing activities for ${YEAR}.`, [
        ...(capUp > 0 ? [two('Equity Share Capital', capOpen, capOpen + capUp), two('Securities Premium', premOpen, premOpen + premUp)] : []),
        two(`${rate}% Debentures`, debOld, debOld + debNew),
        ...(repaid > 0 ? [two('Long-term loan from bank', loanOpen, loanOpen - repaid)] : []),
        two('Bank overdraft', odOpen, odOpen + odChange),
        proposed(prev, cur),
        ...(repaid > 0 ? [one('Interest paid on bank loan during the year', loanInterest)] : []),
        `${capUp > 0 ? 'All shares and debentures' : 'The new debentures'} were issued for cash. The additional debentures were issued on ${date}; interest on debentures is paid on the due dates, so none is outstanding at either year end. The dividend proposed for ${PREV} was declared and paid during ${YEAR}.`,
      ]),
      ...n,
      explanation: [
        ...(capUp > 0 ? [`Issue of shares = ${inr(capUp)} + securities premium ${inr(premUp)} = ${inr(capUp + premUp)} (inflow).`] : []),
        `Issue of debentures = ${inr(debNew)} (inflow).`,
        ...(repaid > 0 ? [`Bank loan repaid = ${inr(loanOpen)} - ${inr(loanOpen - repaid)} = ${inr(repaid)} (outflow); interest paid on it ${inr(loanInterest)} (outflow).`] : []),
        `Bank overdraft ${odChange > 0 ? 'rose' : 'fell'} by ${inr(Math.abs(odChange))} (${odChange > 0 ? 'inflow' : 'outflow'}).`,
        `Interest paid on debentures = ${rate}% of ${inr(debOld)} + ${inr(debNew)} x ${rate}% x ${months}/12 = ${inr(interest)} (outflow).`,
        `Dividend paid = proposed dividend of ${PREV} = ${inr(prev)} (outflow); the dividend proposed for ${YEAR} is not accounted for.`,
        `Net cash ${net > 0 ? 'from' : 'used in'} financing activities = ${capUp > 0 ? `${inr(capUp + premUp)} + ` : ''}${inr(debNew)} ${odChange > 0 ? '+' : '-'} ${inr(Math.abs(odChange))} ${outflows.map((a) => `- ${inr(a)}`).join(' ')} = ${net > 0 ? inr(net) : `- ${inr(-net)}, a net outflow of ${inr(-net)}`}.`,
      ],
      hints: H.fin,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const rate = Number(/(\d+)% Debentures/.exec(q.prompt)?.[1]);
    // The change in a balance that is given; a balance that is not given did not change.
    const up = (label: string): number => (rows.has(label) ? row(rows, label)[1] - row(rows, label)[0] : 0);
    const [debOld, debClose] = row(rows, `${rate}% Debentures`);
    const months = ISSUE_DATES.find(([date]) => q.prompt.includes(`issued on ${date}`))?.[1] ?? NaN;
    const borrowed = up('Equity Share Capital') + up('Securities Premium') + up(`${rate}% Debentures`) + up('Long-term loan from bank') + up('Bank overdraft');
    const net = borrowed - (debOld * rate * 12 + (debClose - debOld) * rate * months) / 1200 - (rows.get('Interest paid on bank loan during the year')?.[0] ?? 0) - row(rows, 'Proposed dividend')[0];
    return ans(q) === Math.abs(net) && q.prompt.includes(net > 0 ? 'net cash from financing' : 'net cash used in financing');
  },
});

const INVEST_SALE_START = 'Investments that had cost';

const investingFull = numericTemplate({
  id: 'cf-investing-full', topicId: T, conceptId: 'cf-investing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const s = drawSale(rng);
    const open = s.cost + k(rng, 400000, 1200000, 50000);
    const bought = k(rng, 250000, 700000, 10000);
    const close = open - s.cost + bought;
    const invCost = k(rng, 50000, 200000, 10000);
    const invOpen = invCost + k(rng, 100000, 500000, 10000);
    const invBought = k(rng, 60000, 300000, 10000);
    const invClose = invOpen - invCost + invBought;
    const gain = k(rng, 5000, Math.min(40000, invCost / 5), 5000);
    const income = k(rng, 10000, 60000, 5000);
    const incomeLabel = rng.pick(['Dividend received on investments', 'Interest received on investments']);
    if (s.price <= 0) return null;
    const answer = bought + invBought - s.price - (invCost + gain) - income;
    const n = numeric(answer, [
      [answer + income, `Left out the ${incomeLabel.split(' ')[0].toLowerCase()} received, an investing inflow for a non-financing company.`],
      [answer + s.g, `Took the book value of the machine sold for the cash it fetched and ignored the ${s.what} on its sale.`],
      [answer + gain, 'Took the cost of the investments sold for the cash received and ignored the profit on their sale.'],
      [close - open + (invClose - invOpen) - s.price - (invCost + gain) - income, 'Took the net increases in the two accounts as the purchases.'],
      [bought + invBought, 'Showed only the purchases and left out every investing inflow.'],
    ]);
    return n && {
      prompt: ask(`From these balances and other information of ${co} ${NF}, find the net cash used in investing activities for ${YEAR}.`, [
        two('Machinery (at cost)', open, close),
        saleLine(s),
        two('Non-current investments', invOpen, invClose),
        `${INVEST_SALE_START} ${inr(invCost)} were sold during the year at a profit of ${inr(gain)}.`,
        one(incomeLabel, income),
      ]),
      ...n,
      explanation: [
        `Machinery purchased = ${inr(close)} + ${inr(s.cost)} - ${inr(open)} = ${inr(bought)} (outflow); sale of machinery ${inr(s.price)} (inflow).`,
        `Investments purchased = ${inr(invClose)} + ${inr(invCost)} - ${inr(invOpen)} = ${inr(invBought)} (outflow); sale of investments = ${inr(invCost)} + ${inr(gain)} = ${inr(invCost + gain)} (inflow).`,
        `${incomeLabel} ${inr(income)} (inflow).`,
        `Net cash used in investing activities = ${inr(bought)} + ${inr(invBought)} - ${inr(s.price)} - ${inr(invCost + gain)} - ${inr(income)} = ${inr(answer)}.`,
      ],
      hints: H.asset,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const [open, close] = row(rows, 'Machinery (at cost)');
    const [invOpen, invClose] = row(rows, 'Non-current investments');
    const [cost, , price] = saleIn(q.prompt);
    const [invCost, gain] = amountsIn(q.prompt.split('\n').find((l) => l.startsWith(INVEST_SALE_START)) ?? '');
    const income = [...rows].find(([label]) => label.endsWith('received on investments'))?.[1][0] ?? NaN;
    // Each account is balanced by its purchases; the sales and the income come in.
    return ans(q) === close + cost - open + (invClose + invCost - invOpen) - price - (invCost + gain) - income;
  },
});

const npbtIndirect = numericTemplate({
  id: 'cf-npbt-indirect', topicId: T, conceptId: 'cf-npbt', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const sOpen = k(rng, 200000, 700000, 10000);
    const change = k(rng, -12, 20, 1) * 10000;
    const transfer = k(rng, 20000, 120000, 10000);
    const gOpen = k(rng, 100000, 500000, 50000);
    const taxOpen = k(rng, 40000, 200000, 5000);
    const made = taxOpen + k(rng, -4, 14, 1) * 5000;
    const paid = taxOpen + k(rng, -4, 4, 1) * 5000;
    const taxClose = taxOpen + made - paid;
    const prev = k(rng, 40000, 150000, 10000);
    const cur = prev + rng.pick([-20000, -10000, 10000, 20000, 30000]);
    const interim = rng.int(0, 1) === 0 ? 0 : k(rng, 20000, 80000, 5000);
    const premOpen = k(rng, 20000, 200000, 20000);
    const premUp = k(rng, 20000, 100000, 10000);
    const answer = change + transfer + made + prev + interim;
    if (sOpen + change <= 0 || change === 0 || made <= 0 || paid <= 0 || taxClose <= 0 || paid === made || taxClose === made || answer < 50000) return null;
    const n = numeric(answer, [
      [answer - made + paid, 'Added the tax paid instead of the provision made, which is the figure that was charged against the profit.'],
      [answer - made + taxClose, 'Took the closing provision as the provision made, although the tax paid is given and the account can be written up.'],
      [answer - prev + cur, 'Added the dividend proposed for the current year instead of the previous year\'s, which was paid this year.'],
      [answer + premUp, 'Added the increase in Securities Premium; it is money raised from shareholders, not profit.'],
      [answer - transfer, 'Left out the transfer to General Reserve.'],
      ...(change < 0 ? ([[answer - 2 * change, 'Took the fall in Surplus as if it were a rise.']] as [number, string][]) : []),
    ]);
    const adds: [string, number][] = [
      ['Transfer to General Reserve', transfer],
      ['Provision for tax made', made],
      [`Proposed dividend of ${PREV}, paid in ${YEAR}`, prev],
      ...(interim > 0 ? ([['Interim dividend paid', interim]] as [string, number][]) : []),
    ];
    return n && {
      prompt: ask(`From these balances and other information of ${co}, find the net profit before tax and extraordinary items for ${YEAR}.`, [
        two(SURPLUS, sOpen, sOpen + change),
        two('General Reserve', gOpen, gOpen + transfer),
        two('Securities Premium', premOpen, premOpen + premUp),
        two('Provision for tax', taxOpen, taxClose),
        proposed(prev, cur),
        one('Income tax paid during the year', paid),
        ...(interim > 0 ? [one('Interim dividend paid during the year', interim)] : []),
        `The dividend proposed for ${PREV} was declared and paid during ${YEAR}. The increase in General Reserve is a transfer from the profit of the year.`,
      ]),
      ...n,
      explanation: [
        change > 0 ? `Increase in Surplus = ${inr(sOpen + change)} - ${inr(sOpen)} = ${inr(change)}.` : `Surplus fell by ${inr(sOpen)} - ${inr(sOpen + change)} = ${inr(-change)}: start from a minus figure of ${inr(-change)}.`,
        `Provision for tax made = closing provision + tax paid - opening provision = ${inr(taxClose)} + ${inr(paid)} - ${inr(taxOpen)} = ${inr(made)}.`,
        ...adds.map(([label, a]) => `Add: ${label} ${inr(a)}.`),
        `${NPBT} = ${change > 0 ? inr(change) : `- ${inr(-change)}`} + ${adds.map(([, a]) => inr(a)).join(' + ')} = ${inr(answer)}.`,
        'Securities Premium is money raised from shareholders: it has nothing to do with the profit.',
      ],
      hints: H.npbt,
    };
  },
  verify: (q) => {
    const rows = rowsOf(q.prompt);
    const up = (label: string): number => row(rows, label)[1] - row(rows, label)[0];
    return ans(q) === up(SURPLUS) + up('General Reserve') + up('Provision for tax') + row(rows, 'Income tax paid during the year')[0] + row(rows, 'Proposed dividend')[0] + (rows.get('Interim dividend paid during the year')?.[0] ?? 0);
  },
});

const OPENING_CASH = 'Cash and cash equivalents on 1 April 2025';
const CASH_MOVES = new Map<string, number>([
  ['Cash generated from operations', 1],
  ['Income tax paid', -1],
  ['Machinery bought for cash', -1],
  ['Non-current investments sold', 1],
  ['Interest received on investments', 1],
  ['Equity shares issued for cash', 1],
  ['Long-term bank loan repaid', -1],
  ['Interest paid on bank loan', -1],
  ['Dividend paid', -1],
  ['Increase in bank overdraft', 1],
  ['Decrease in bank overdraft', -1],
  ['Machinery acquired by issue of equity shares to the vendor', 0],
  ['Cash deposited into bank', 0],
  ['Debentures converted into equity shares', 0],
  ['Depreciation charged for the year', 0],
  [OPENING_CASH, 0],
]);

const closingCashFull = numericTemplate({
  id: 'cf-closing-cash-full', topicId: T, conceptId: 'cf-reconcile', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const operating: [string, number][] = [['Cash generated from operations', k(rng, 400000, 1200000, 10000)], ['Income tax paid', k(rng, 50000, 200000, 5000)]];
    const investing: [string, number][] = [
      ['Machinery bought for cash', k(rng, 200000, 800000, 10000)],
      rng.int(0, 1) === 0 ? ['Non-current investments sold', k(rng, 50000, 300000, 10000)] : ['Interest received on investments', k(rng, 10000, 60000, 5000)],
    ];
    const odUp = rng.int(0, 1) === 0;
    const od = k(rng, 20000, 100000, 10000);
    const financing: [string, number][] = [
      ...(rng.int(0, 2) === 0 ? [] : ([['Equity shares issued for cash', k(rng, 100000, 600000, 50000)]] as [string, number][])),
      ['Long-term bank loan repaid', k(rng, 50000, 300000, 25000)],
      ['Interest paid on bank loan', k(rng, 20000, 80000, 5000)],
      ['Dividend paid', k(rng, 40000, 150000, 10000)],
      [odUp ? 'Increase in bank overdraft' : 'Decrease in bank overdraft', od],
    ];
    const traps = rng.shuffle<{ label: string; amt: number; sign: number; slip: string; note: string }>([
      { label: 'Machinery acquired by issue of equity shares to the vendor', amt: k(rng, 100000, 300000, 10000), sign: -1, slip: 'Deducted the machinery acquired for shares; no cash was paid for it.', note: 'Machinery acquired for shares is not a cash flow.' },
      { label: 'Cash deposited into bank', amt: k(rng, 30000, 150000, 5000), sign: -1, slip: 'Deducted the cash deposited into bank; it only moves within cash and cash equivalents.', note: 'Cash deposited into bank only moves within cash and cash equivalents.' },
      { label: 'Debentures converted into equity shares', amt: k(rng, 100000, 300000, 50000), sign: -1, slip: 'Counted the conversion of debentures as a cash repayment; no cash moved.', note: 'A conversion of debentures into shares is not a cash flow.' },
      { label: 'Depreciation charged for the year', amt: k(rng, 40000, 150000, 5000), sign: 1, slip: 'Added depreciation again; it is already adjusted in cash generated from operations.', note: 'Depreciation is already adjusted in cash generated from operations.' },
    ]).slice(0, 2);
    const total = (list: [string, number][]): number => sum(list.map(([label, a]) => CASH_MOVES.get(label)! * a));
    const [op, inv, fin] = [total(operating), total(investing), total(financing)];
    const net = op + inv + fin;
    const open = k(rng, 80000, 400000, 10000);
    const close = open + net;
    if (inv === 0 || fin === 0 || close < 20000 || Math.abs(net) < 20000) return null;
    const lines = [...rng.shuffle([...operating.slice(1), ...investing, ...financing, ...traps.map((t): [string, number] => [t.label, t.amt])])];
    const says = (name: string, v: number): string => `net cash ${v >= 0 ? 'from' : 'used in'} ${name} activities ${inr(Math.abs(v))}`;
    const working = [
      `Operating activities: ${inr(operating[0][1])} - income tax paid ${inr(operating[1][1])} = ${inr(op)}.`,
      `${cap(says('investing', inv))}; ${says('financing', fin)} (bank overdraft is a short-term borrowing).`,
      ...traps.map((t) => t.note),
    ];
    const wantsClosing = rng.int(0, 2) > 0;
    const odSigned = odUp ? od : -od;
    if (wantsClosing) {
      const n = numeric(close, [
        ...traps.map((t): [number, string] => [close + t.sign * t.amt, t.slip]),
        [close - odSigned, 'Left out the change in bank overdraft, a short-term borrowing shown under financing activities.'],
        [close + operating[1][1], 'Left out the income tax paid, which is deducted from cash generated from operations.'],
        [Math.abs(net), 'Gave the net change of the year without bringing in the opening balance.'],
      ]);
      return n && {
        prompt: ask(`From this information of ${co} ${NF} for ${YEAR}, find the cash and cash equivalents on ${Y1}. Two of the items are not cash flows to be shown.`, [one(operating[0][0], operating[0][1]), ...lines.map(([label, a]) => one(label, a)), one(OPENING_CASH, open)]),
        ...n,
        explanation: [...working, `Net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents = ${inr(Math.abs(net))}.`, `Closing cash and cash equivalents = ${inr(open)} ${net > 0 ? '+' : '-'} ${inr(Math.abs(net))} = ${inr(close)}.`],
        hints: H.rec,
      };
    }
    const alt = (v: number, why: string): [number, string] => [v * net > 0 ? Math.abs(v) : 0, why];
    const n = numeric(Math.abs(net), [
      ...traps.map((t) => alt(net + t.sign * t.amt, t.slip)),
      alt(net - odSigned, 'Left out the change in bank overdraft, a short-term borrowing shown under financing activities.'),
      alt(net + operating[1][1], 'Left out the income tax paid, which is deducted from cash generated from operations.'),
    ]);
    return n && {
      prompt: ask(`From this information of ${co} ${NF} for ${YEAR}, find the net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents. Two of the items are not cash flows to be shown.`, [one(operating[0][0], operating[0][1]), ...lines.map(([label, a]) => one(label, a))]),
      ...n,
      explanation: [...working, `Net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents = ${inr(Math.abs(net))}.`],
      hints: H.rec,
    };
  },
  verify: (q) => {
    const net = signedTotal(q.prompt, CASH_MOVES);
    const open = rowsOf(q.prompt).get(OPENING_CASH)?.[0];
    return open === undefined ? ans(q) === Math.abs(net) && q.prompt.includes(`net ${net > 0 ? 'increase' : 'decrease'} in cash`) : ans(q) === open + net;
  },
});

const complex: Template[] = [fixedAssetAccount, fixedAssetWdv, operatingSection, opProfitIndirect, financingFull, investingFull, npbtIndirect, closingCashFull];

// ===============================================================================================================
// FORMATS: the statement, its sections and its workings, prepared row by row
// ===============================================================================================================
//  - A statement has one signed column: an inflow, or an item that is added, is a plain figure; an outflow, or an
//    item that is deducted, is a negative one, typed with a minus sign and printed in brackets. The task says so.
//  - The figures are whole rupees here, as everywhere in this file, and paise in a row (`rupees`).
//  - Every running total is a sub-total that the engine adds up (`sum`); `verify` works the statement out again from
//    the data as a student would, from the balances and the additional information.

type StatementRows = StatementParts['rows'];
const CF_COLUMNS: StatementParts['columns'] = [{ name: 'Amount (₹)', signed: true }];

/** A figure as a statement prints it: an outflow or a deduction in brackets. */
const shown = (v: number): string => (v < 0 ? `(${inr(-v)})` : inr(v));
/** The figure of each sub-total of a statement by its name, in whole rupees. */
const subtotalsOf = (q: StatementQuestion): Map<string, number> =>
  new Map((q.lines ?? []).flatMap((line): [string, number][] => ('subtotal' in line ? [[line.subtotal, line.amounts[0] / 100]] : [])));
/** A dividend that is a sensible percentage of the paid-up capital. */
const dividendOn = (rng: Rng, capital: number, rates: number[]): number => (capital * rng.pick(rates)) / 100;
/** The dividend proposed for the previous year and for the current one, at two different rates on the capital of each year. */
const twoDividends = (rng: Rng, capitalBefore: number, capitalNow: number): [number, number] => {
  const [before, ...others] = rng.shuffle([8, 10, 12, 15]);
  // Never the same figure for the two years, so that it shows which of them a student took.
  const now = others.find((rate) => capitalNow * rate !== capitalBefore * before)!;
  return [(capitalBefore * before) / 100, (capitalNow * now) / 100];
};
/** By how many steps of ₹5,000 the provision for tax of a year is above the one of the year before: never the same figure. */
const TAX_STEPS = [-4, -3, -2, -1, 1, 2, 3, 4, 5, 6];
/** A provision for tax in proportion to the profit it is made out of: a fifth to three tenths of the profit before tax, to the nearest ₹5,000. */
const taxOn = (rng: Rng, profitAfterTax: number): number => Math.max(15000, Math.round((profitAfterTax * rng.pick([25, 33, 40])) / 100 / 5000) * 5000);

// 1. cf-fmt-npbt: the working with which the indirect method begins, as a small statement. The change in Surplus,
//    then what was taken out of the profit of the year: a transfer to General Reserve (half the seeds), the proposed
//    dividend of the previous year, an interim dividend (half the seeds) and the provision for tax made, which is
//    the closing provision when nothing more is known, is given, or comes from the Provision for tax account (easy)
const NPBT_ROWS = {
  close: 'Closing balance of Surplus',
  open: 'Opening balance of Surplus',
  change: 'Increase (decrease) in Surplus during the year',
  transfer: 'Transfer to General Reserve',
  dividend: 'Proposed dividend of the previous year, paid during the year',
  interim: 'Interim dividend paid',
  tax: 'Provision for tax made during the year',
};

const fmtNpbt = statementTemplate({
  id: 'cf-fmt-npbt', topicId: T, conceptId: 'cf-formats', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const sOpen = k(rng, 200000, 700000, 10000);
    const change = k(rng, -10, 25, 1) * 10000;
    const sClose = sOpen + change;
    const transfer = rng.int(0, 1) === 0 ? 0 : k(rng, 20000, 120000, 10000);
    const gOpen = k(rng, 100000, 500000, 50000);
    const capital = k(rng, 8, 20, 1) * 100000;
    const [prev, cur] = twoDividends(rng, capital, capital);
    const interim = rng.int(0, 1) === 0 ? 0 : dividendOn(rng, capital, [4, 5, 6]);
    // The profit after tax, and a provision for tax that is in proportion to it.
    const after = change + transfer + prev + interim;
    const made = taxOn(rng, after);
    const taxOpen = made - rng.pick(TAX_STEPS) * 5000;
    // How the provision made is to be found: it is the closing provision, it is given, or the tax paid is given.
    const way = rng.pick(['closing', 'closing', 'made', 'paid'] as const);
    const paid = way === 'closing' ? taxOpen : taxOpen + rng.pick([-3, -2, -1, 1, 2, 3]) * 5000;
    const taxClose = taxOpen + made - paid;
    const npbt = after + made;
    if (change === 0 || sClose <= 0 || after < 80000 || taxOpen < 15000 || paid < 10000 || taxClose < 10000 || paid === made) return null;
    const rows: StatementRows = [
      { label: NPBT_ROWS.close, amount: rupees(sClose) },
      { label: NPBT_ROWS.open, amount: rupees(-sOpen) },
      { subtotal: NPBT_ROWS.change, amount: rupees(change), sum: 'all' },
      ...(transfer > 0 ? [{ label: NPBT_ROWS.transfer, amount: rupees(transfer) }] : []),
      { label: NPBT_ROWS.dividend, amount: rupees(prev) },
      ...(interim > 0 ? [{ label: NPBT_ROWS.interim, amount: rupees(interim) }] : []),
      { label: NPBT_ROWS.tax, amount: rupees(made) },
    ];
    const added = [...(transfer > 0 ? [transfer] : []), prev, ...(interim > 0 ? [interim] : []), made];
    return {
      task: `Prepare the working of net profit before tax and extraordinary items of ${co} for the year ended ${Y1}. Show a figure that is deducted, and a fall in Surplus, with a minus sign.`,
      data: [
        `${co} gives this information for the year ended ${Y1}:`,
        two(SURPLUS, sOpen, sClose),
        ...(transfer > 0 ? [two('General Reserve', gOpen, gOpen + transfer)] : []),
        two('Provision for tax', taxOpen, taxClose),
        proposed(prev, cur),
        ...(interim > 0 ? [one('Interim dividend paid during the year', interim)] : []),
        ...(way === 'made' ? [one('Provision for tax made during the year', made)] : way === 'paid' ? [one('Income tax paid during the year', paid)] : []),
        [
          `The dividend proposed for ${PREV} was declared and paid during ${YEAR}.`,
          transfer > 0 ? 'The increase in General Reserve is a transfer from the profit of the year.' : 'No transfer was made to reserves.',
          ...(interim > 0 ? [] : ['No interim dividend was paid.']),
          ...(way === 'closing' ? ['Nothing more is known about tax.'] : []),
        ].join(' '),
      ].join('\n'),
      title: `Working of Net Profit before Tax and Extraordinary Items of ${co} for the year ended ${Y1}`,
      columns: CF_COLUMNS,
      rows,
      final: { label: NPBT, amount: rupees(npbt) },
      distractors: ['Proposed dividend of the current year', 'Income tax paid during the year', 'Closing balance of General Reserve', 'Opening balance of Provision for tax', NPBT_ROWS.transfer, NPBT_ROWS.interim],
      explanation: [
        `The working starts from what the year added to Surplus: closing balance ${inr(sClose)} less opening balance ${inr(sOpen)} = ${shown(change)}${change < 0 ? ', a fall, which is a minus figure' : ''}. This is what is left of the profit of the year after tax, dividends and transfers.`,
        ...(transfer > 0 ? [`General Reserve rose by ${inr(gOpen + transfer)} - ${inr(gOpen)} = ${inr(transfer)}, a transfer out of the profit of the year that used none of it up: it is added back.`] : []),
        `The dividend proposed for ${PREV}, ${inr(prev)}, was declared and paid in ${YEAR} out of Surplus: it is added back. The dividend proposed for ${YEAR}, ${inr(cur)}, is not accounted for until it is declared, so it has no place in the working.`,
        ...(interim > 0 ? [`The interim dividend of ${inr(interim)} was also paid out of the profit of the year: it is added back.`] : []),
        way === 'closing'
          ? `Nothing more is known about tax, so the opening provision of ${inr(taxOpen)} is taken as paid during the year and the closing provision, ${inr(made)}, as the provision made out of the profit of the year: it is added back.`
          : way === 'made'
            ? `The provision for tax made, ${inr(made)}, was charged against the profit of the year: it is added back. (The tax paid, ${inr(taxOpen)} + ${inr(made)} - ${inr(taxClose)} = ${inr(paid)}, is not a part of this working.)`
            : `Provision for tax account: opening balance + provision made - tax paid = closing balance, so the provision made = ${inr(taxClose)} + ${inr(paid)} - ${inr(taxOpen)} = ${inr(made)}. It was charged against the profit of the year and is added back; the tax paid is not.`,
        `${NPBT} = ${shown(change)} + ${added.map(inr).join(' + ')} = ${inr(npbt)}.`,
      ],
      hints: H.npbt,
    };
  },
  // The working again from the data: the changes in Surplus and General Reserve, the dividends paid, and the provision
  // made as the figure that balances the Provision for tax account.
  verify: (q) => {
    const rows = rowsOf(q.data);
    const up = (label: string): number => (rows.has(label) ? row(rows, label)[1] - row(rows, label)[0] : 0);
    const [taxOpen, taxClose] = row(rows, 'Provision for tax');
    const paid = rows.get('Income tax paid during the year')?.[0] ?? (q.data.includes('Nothing more is known about tax.') ? taxOpen : NaN);
    const made = rows.get('Provision for tax made during the year')?.[0] ?? taxClose + paid - taxOpen;
    const npbt = up(SURPLUS) + up('General Reserve') + row(rows, 'Proposed dividend')[0] + (rows.get('Interim dividend paid during the year')?.[0] ?? 0) + made;
    return q.final?.amount === rupees(npbt) && subtotalsOf(q).get(NPBT_ROWS.change) === up(SURPLUS) && sum(q.rows.map((r) => r.amounts[0])) === rupees(npbt);
  },
});

// 2. cf-fmt-cash-equivalents: the note every Cash Flow Statement ends with, as a statement of two columns. From six
//    balances at the two dates the student keeps the four that are cash and cash equivalents (one of them may be nil
//    at one date), leaves out the two that are not (a long deposit, bank overdraft, receivables, long-term shares)
//    and says by how much the total rose or fell (easy)
const CE_DATES = [`${Y0} (₹)`, `${Y1} (₹)`];
const CE_ALWAYS = ['Cash in hand', 'Balance with bank in current account'];
const CE_RISE = 'Net increase in cash and cash equivalents';
const CE_FALL = 'Net decrease in cash and cash equivalents';
/** A balance at the two dates, where it may be nil at one of them. */
const twoOrNil = (label: string, a: number, b: number): string => `${label}: ${a === 0 ? 'nil' : inr(a)} on ${Y0}, ${b === 0 ? 'nil' : inr(b)} on ${Y1}`;
/** The balances of a line written by `twoOrNil`, by label. */
const balancesIn = (data: string): Map<string, [number, number]> =>
  new Map(
    data
      .split('\n')
      .filter((l) => l.includes(` on ${Y0}, `))
      .map((l): [string, [number, number]] => {
        const figure = (text: string): number => (text.startsWith('nil') ? 0 : (amountsIn(text)[0] ?? NaN));
        const [first, second] = l.slice(l.indexOf(': ') + 2).split(', ');
        return [l.slice(0, l.indexOf(': ')), [figure(first), figure(second)]];
      }),
  );

const fmtCashEquivalents = statementTemplate({
  id: 'cf-fmt-cash-equivalents', topicId: T, conceptId: 'cf-formats', difficulty: 'easy',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const pair = (min: number, max: number, step: number): [number, number] => [k(rng, min, max, step), k(rng, min, max, step)];
    const yes = rng.shuffle(CE_YES_LINES).slice(0, 2).map((i) => ({ ...i, at: pair(30000, 200000, 10000) }));
    // In one seed of three, one of the cash equivalents is held at one of the two dates only.
    if (rng.int(0, 2) === 0) yes[0].at[rng.int(0, 1)] = 0;
    const no = rng.shuffle(CE_NO_LINES).slice(0, 2).map((i) => ({ ...i, at: i.sign < 0 ? pair(20000, 100000, 5000) : pair(50000, 400000, 10000) }));
    const counted = [
      { label: CE_ALWAYS[0], at: pair(20000, 90000, 5000) },
      { label: CE_ALWAYS[1], at: pair(150000, 600000, 10000) },
      ...yes,
    ];
    const total = [0, 1].map((d) => sum(counted.map((i) => i.at[d])));
    const change = total[1] - total[0];
    if (change === 0 || [...counted, ...no].some((i) => i.at[0] === i.at[1])) return null;
    return {
      task: `Prepare a statement of the cash and cash equivalents of ${co} on ${Y0} and on ${Y1}, and show the net increase or decrease during the year.`,
      data: [
        `${co} is not a financing company. These are among the balances in its balance sheets:`,
        ...counted.slice(0, 2).map((i) => twoOrNil(i.label, i.at[0], i.at[1])),
        ...rng.shuffle([...yes, ...no]).map((i) => twoOrNil(i.label, i.at[0], i.at[1])),
      ].join('\n'),
      title: `Cash and Cash Equivalents of ${co}`,
      columns: CE_DATES,
      rows: counted.map((i) => ({ label: i.label, amounts: i.at.map(rupees) })),
      final: { label: change > 0 ? CE_RISE : CE_FALL, amount: rupees(Math.abs(change)), alternatives: [CE_RISE, CE_FALL] },
      distractors: CE_NO_LINES.map((i) => i.label),
      explanation: [
        CE_RULE,
        'Cash in hand and the balance in the current account are cash itself.',
        `Counted with them: ${yes.map((i) => i.short).join('; ')}.`,
        `Left out: ${no.map((i) => i.note).join('; ')}.`,
        `Cash and cash equivalents on ${Y0} = ${counted.filter((i) => i.at[0] > 0).map((i) => inr(i.at[0])).join(' + ')} = ${inr(total[0])}.`,
        `Cash and cash equivalents on ${Y1} = ${counted.filter((i) => i.at[1] > 0).map((i) => inr(i.at[1])).join(' + ')} = ${inr(total[1])}.`,
        `They ${change > 0 ? 'rose' : 'fell'} by ${inr(Math.abs(change))}: the net ${change > 0 ? 'increase' : 'decrease'} that the three activities of the Cash Flow Statement must explain.`,
      ],
      hints: H.ce,
    };
  },
  // From the data: the lines that are cash and cash equivalents, added up at each date, and the change between them.
  verify: (q) => {
    const balances = balancesIn(q.data);
    const counted = [...balances].filter(([label]) => [...CE_ALWAYS, ...CE_YES_LINES.map((i) => i.label)].includes(label));
    const total = [0, 1].map((d) => sum(counted.map(([, at]) => at[d])));
    return (
      balances.size === 6 &&
      q.rows.length === counted.length &&
      counted.every(([label, at]) => q.rows.some((r) => r.label === label && r.amounts[0] === rupees(at[0]) && r.amounts[1] === rupees(at[1]))) &&
      q.final?.amount === rupees(Math.abs(total[1] - total[0])) &&
      q.final.label === (total[1] > total[0] ? CE_RISE : CE_FALL)
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The sections of the statement: what the three section formats and the full statement share.
// ---------------------------------------------------------------------------------------------------------------

// The rule covers the sub-totals too: a net outflow or a net decrease is typed with a minus sign, as it is printed in brackets.
const SIGN_RULE = 'Show an outflow, an item that is deducted, and a sub-total that is a net outflow or a net decrease, with a minus sign.';
const HEAD_A = 'A. Cash flows from operating activities';
const HEAD_B = 'B. Cash flows from investing activities';
const HEAD_C = 'C. Cash flows from financing activities';
const OP_PROFIT = 'Operating profit before working capital changes';
const CGO = 'Cash generated from operations';
const TAX_PAID = 'Income tax paid';
// A sub-total is printed on the screen, so its name must not say which way it falls: the brackets are how the
// format of AS 3 itself names a figure that may be an outflow.
const NET_A = 'Net cash from (used in) operating activities';
const NET_B = 'Net cash from (used in) investing activities';
const NET_C = 'Net cash from (used in) financing activities';

/** A row of a section: its particulars, its figure (negative for an outflow or a deduction) and why it stands there. */
interface Flow {
  label: string;
  amt: number;
  why: string;
  /** Other wording an examiner accepts for the row in its own part of the statement. */
  also?: string[];
}
const flowRow = (f: Flow): StatementRows[number] => ({ label: f.label, amount: rupees(f.amt), ...(f.also ? { also: f.also } : {}) });
/** "₹a + ₹b - ₹c" for a list of signed figures, the first written with its own sign. */
const chain = (figures: number[]): string => figures.map((v, i) => (i === 0 ? (v < 0 ? `- ${inr(-v)}` : inr(v)) : `${v < 0 ? '-' : '+'} ${inr(Math.abs(v))}`)).join(' ');

/** A current asset or a current liability of the operations, at the two balance sheet dates. */
interface WcBalance {
  label: string;
  kind: 'A' | 'L';
  open: number;
  close: number;
}
const wcName = (b: WcBalance, up: boolean): string => `${up ? 'Increase' : 'Decrease'} in ${b.label.toLowerCase()}`;
/** The row a change in a current asset or liability gives among the working capital changes. */
const wcFlow = (b: WcBalance): Flow => {
  const up = b.close > b.open;
  const sign = wcSign(b.kind, b.open, b.close);
  return {
    label: wcName(b, up),
    amt: sign * Math.abs(b.close - b.open),
    why: `${b.label} ${up ? 'rose' : 'fell'} from ${inr(b.open)} to ${inr(b.close)}: ${WC_WHY[b.kind][up ? 'up' : 'down'].reason}, so ${inr(Math.abs(b.close - b.open))} is ${sign > 0 ? 'added' : 'deducted'}.`,
  };
};
/** Balances of the named working capital items at the two dates, each of them changed during the year. */
const drawWc = (rng: Rng, labels: string[]): WcBalance[] =>
  labels.map((label) => {
    const item = WC_ITEMS.find((i) => i.label === label)!;
    const open = item.small ? k(rng, 20000, 60000, 5000) : k(rng, 120000, 500000, 10000);
    return { label, kind: item.kind as 'A' | 'L', open, close: open + rng.pick([-1, 1]) * (item.small ? k(rng, 5000, 15000, 5000) : k(rng, 10000, 60000, 5000)) };
  });

/**
 * The rows of the operating activities, without their sub-heading: the profit, the non-cash and non-operating items,
 * the working capital changes and the tax paid, with the three sub-totals the board looks for.
 */
function operatingRows(npbt: number, adjusts: Flow[], wc: WcBalance[], taxPaid: number) {
  const moves = wc.map(wcFlow);
  const op = npbt + sum(adjusts.map((a) => a.amt));
  const cgo = op + sum(moves.map((m) => m.amt));
  const net = cgo - taxPaid;
  const rows: StatementRows = [
    { label: NPBT, amount: rupees(npbt) },
    ...adjusts.map(flowRow),
    { subtotal: OP_PROFIT, amount: rupees(op), sum: 'section' },
    ...moves.map(flowRow),
    { subtotal: CGO, amount: rupees(cgo), sum: 'section' },
    { label: TAX_PAID, amount: rupees(-taxPaid) },
    { subtotal: NET_A, amount: rupees(net), sum: 'section' },
  ];
  const steps = [
    ...adjusts.map((a) => a.why),
    `${OP_PROFIT} = ${chain([npbt, ...adjusts.map((a) => a.amt)])} = ${shown(op)}.`,
    ...moves.map((m) => m.why),
    `${CGO} = ${chain([op, ...moves.map((m) => m.amt)])} = ${shown(cgo)}.`,
  ];
  return { rows, moves, op, cgo, net, steps };
}

/** How the tax of the year is told, and what follows from it. */
type TaxWay = 'closing' | 'made' | 'paid';
/** The provision for tax at the two dates, the provision made and the tax paid, for a profit after tax. */
function drawTax(rng: Rng, profitAfterTax: number, way: TaxWay) {
  const made = taxOn(rng, profitAfterTax);
  const open = made - rng.pick(TAX_STEPS) * 5000;
  const paid = way === 'closing' ? open : open + rng.pick([-3, -2, -1, 1, 2, 3]) * 5000;
  return { made, open, paid, close: open + made - paid };
}
/** The step that finds the tax paid, by the way the data tells of tax. */
const taxPaidStep = (tax: { made: number; open: number; paid: number; close: number }, way: TaxWay): string =>
  way === 'closing'
    ? `Nothing more is known about tax, so the opening provision, ${inr(tax.open)}, is taken as the tax paid during the year (and the closing provision, ${inr(tax.close)}, as the provision made).`
    : way === 'made'
      ? `Tax paid = opening provision + provision made - closing provision = ${inr(tax.open)} + ${inr(tax.made)} - ${inr(tax.close)} = ${inr(tax.paid)}.`
      : `The tax paid, ${inr(tax.paid)}, is given.`;
/** The provision for tax made and the tax paid, as the data of a format tells them: worked out again for `verify`. */
function taxIn(data: string): { made: number; paid: number } {
  const rows = rowsOf(data);
  const [open, close] = rows.get('Provision for tax') ?? [NaN, NaN];
  const paidGiven = rows.get('Income tax paid during the year')?.[0];
  const madeGiven = rows.get('Provision for tax made during the year')?.[0];
  const nothing = data.includes('Nothing more is known about tax.');
  return {
    made: madeGiven ?? (paidGiven !== undefined ? close + paidGiven - open : nothing ? close : NaN),
    paid: paidGiven ?? (madeGiven !== undefined ? open + madeGiven - close : nothing ? open : NaN),
  };
}

// 3. cf-fmt-operating: Cash Flow from Operating Activities by the indirect method, from an extract. The profit before
//    tax is given, or is worked from Surplus, the provision for tax and the dividend paid; four or five non-cash and
//    non-operating items (depreciation, goodwill or patents amortised, a profit or a loss on sale, interest on
//    borrowings, and interest, dividend or rent received); three or four working capital changes, with a short-term
//    borrowing or marketable securities among the balances in half the seeds, which is not one; and the tax paid,
//    told in three ways (medium)
interface OpItem {
  /** What the line of data is called, and the row it gives. */
  data: string;
  row: string;
  also?: string[];
  sign: 1 | -1;
  why: string;
}
const NON_CASH = 'a non-cash expense: it reduced the profit and no cash went out, so it is added back';
const FINANCE_COST = 'a cost of finance for a company that is not a financing company: it is added back here, and the payment is shown under financing activities';
const INVESTING_INCOME = 'income of an investing activity for a company that is not a financing company: it is deducted here, and the receipt is shown under investing activities';
const OP_ITEMS: Record<string, OpItem> = {
  depreciation: { data: 'Depreciation charged on machinery', row: 'Depreciation on machinery', sign: 1, why: NON_CASH },
  goodwill: { data: 'Goodwill amortised', row: 'Goodwill amortised', sign: 1, why: NON_CASH },
  patents: { data: 'Patents amortised', row: 'Patents amortised', sign: 1, why: NON_CASH },
  loss: { data: 'Loss on sale of machinery', row: 'Loss on sale of machinery', sign: 1, why: 'a loss of an investing activity that reduced the profit without any cash going out: it is added back, and the sale proceeds are shown under investing activities' },
  profit: { data: 'Profit on sale of machinery', row: 'Profit on sale of machinery', sign: -1, why: 'a gain of an investing activity: it is deducted here, and the whole sale proceeds are shown under investing activities' },
  debentures: { data: 'Interest on debentures, paid during the year', row: 'Interest on debentures', also: ['Interest paid on debentures'], sign: 1, why: FINANCE_COST },
  loan: { data: 'Interest on long-term bank loan, paid during the year', row: 'Interest on bank loan', also: ['Interest paid on bank loan'], sign: 1, why: FINANCE_COST },
  interest: { data: 'Interest received on investments', row: 'Interest received', sign: -1, why: INVESTING_INCOME },
  dividend: { data: 'Dividend received on shares held as investments', row: 'Dividend received', sign: -1, why: INVESTING_INCOME },
  rent: { data: 'Rent received from a let-out building', row: 'Rent received', sign: -1, why: INVESTING_INCOME },
};
const OP_SIGN = new Map(Object.values(OP_ITEMS).map((i): [string, number] => [i.data, i.sign]));
const opFlow = (item: OpItem, amt: number): Flow => ({ label: item.row, amt: item.sign * amt, why: `${item.data.split(',')[0]}, ${inr(amt)}, is ${item.why}.`, ...(item.also ? { also: item.also } : {}) });

const fmtOperating = statementTemplate({
  id: 'cf-fmt-operating', topicId: T, conceptId: 'cf-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const worked = rng.int(0, 2) > 0;
    const way = rng.pick(['closing', 'closing', 'made', 'paid'] as const);
    const after = k(rng, 180000, 600000, 10000);
    const tax = drawTax(rng, after, way);
    const npbt = after + tax.made;
    const capital = k(rng, 8, 20, 1) * 100000;
    const [prev, cur] = twoDividends(rng, capital, capital);
    const sOpen = k(rng, 200000, 600000, 10000);
    const sClose = sOpen + after - prev;
    // Four or five items between the profit and the operating profit: a second income only where nothing is amortised.
    const amortised = rng.int(0, 4) < 3 ? rng.pick(['goodwill', 'patents']) : null;
    const incomes = rng.shuffle(['interest', 'dividend', 'rent']).slice(0, amortised ? 1 : 2);
    const picked: [string, number][] = [
      ['depreciation', k(rng, 40000, 120000, 5000)],
      ...(amortised ? ([[amortised, k(rng, 10000, 40000, 5000)]] as [string, number][]) : []),
      [rng.pick(['loss', 'profit']), k(rng, 5000, 25000, 5000)],
      [rng.pick(['debentures', 'debentures', 'loan']), k(rng, 20000, 90000, 5000)],
      ...incomes.map((i): [string, number] => [i, k(rng, 10000, 50000, 5000)]),
    ];
    const adjusts = picked.map(([key, amt]) => opFlow(OP_ITEMS[key], amt));
    const wc = drawWc(rng, ['Inventories', 'Trade receivables', 'Trade payables', ...(rng.int(0, 1) === 0 ? [rng.pick(['Prepaid expenses', 'Outstanding expenses'])] : [])]);
    // A balance that looks like working capital and is not, in half the seeds.
    const trap = rng.int(0, 1) === 0 ? null : { ...rng.pick(WC_ITEMS.filter((i) => ['Bank overdraft', 'Cash credit from bank', 'Current investments (marketable securities)'].includes(i.label))), open: k(rng, 40000, 150000, 10000), change: rng.pick([-1, 1]) * k(rng, 10000, 30000, 5000) };
    const part = operatingRows(npbt, adjusts, wc, tax.paid);
    if (sClose <= 0 || sClose === sOpen || tax.open < 15000 || tax.paid < 10000 || tax.close < 10000 || tax.paid === tax.made || part.op <= 0 || part.cgo <= 0 || part.net <= 0) return null;
    const closing = [
      ...(worked ? [`The dividend proposed for ${PREV} was declared and paid during ${YEAR}. No interim dividend was paid and no transfer was made to reserves.`] : []),
      ...(way === 'closing' ? ['Nothing more is known about tax.'] : []),
    ];
    const trapName = trap ? trap.label.toLowerCase().replace(' (marketable securities)', '') : '';
    return {
      task: `Prepare the statement of Cash Flow from Operating Activities of ${co} for the year ended ${Y1} by the indirect method. ${SIGN_RULE}`,
      data: [
        `${co}, ${TRADE_OF[co]}, is not a financing company. From its books for the year ended ${Y1}:`,
        ...(worked ? [two(SURPLUS, sOpen, sClose)] : [one(NPBT, npbt)]),
        ...(worked || way !== 'paid' ? [two('Provision for tax', tax.open, tax.close)] : []),
        ...(way === 'made' ? [one('Provision for tax made during the year', tax.made)] : way === 'paid' ? [one('Income tax paid during the year', tax.paid)] : []),
        ...(worked ? [proposed(prev, cur)] : []),
        ...picked.map(([key, amt]) => one(OP_ITEMS[key].data, amt)),
        ...rng.shuffle([...wc, ...(trap ? [{ label: trap.label, open: trap.open, close: trap.open + trap.change }] : [])]).map((b) => two(b.label, b.open, b.close)),
        ...(closing.length > 0 ? [closing.join(' ')] : []),
      ].join('\n'),
      title: `Cash Flow from Operating Activities of ${co} for the year ended ${Y1}`,
      columns: CF_COLUMNS,
      rows: [{ heading: HEAD_A }, ...part.rows],
      distractors: [
        ...wc.map((b) => wcName(b, b.close < b.open)),
        ...(trap ? [`${trap.change > 0 ? 'Increase' : 'Decrease'} in ${trapName}`] : []),
        picked.some(([key]) => key === 'loss') ? OP_ITEMS.profit.row : OP_ITEMS.loss.row,
        'Provision for tax made',
        'Dividend paid',
        'Increase in provision for tax',
      ],
      explanation: [
        worked
          ? `${NPBT} = change in Surplus (${inr(sClose)} - ${inr(sOpen)} = ${shown(sClose - sOpen)}) + provision for tax made ${inr(tax.made)}${way === 'paid' ? ` (closing provision ${inr(tax.close)} + tax paid ${inr(tax.paid)} - opening provision ${inr(tax.open)})` : way === 'closing' ? ' (the closing provision, as nothing more is known about tax)' : ''} + dividend of ${PREV} paid ${inr(prev)} = ${inr(npbt)}. The dividend proposed for ${YEAR} is not accounted for.`
          : `The statement begins with the ${NPBT.toLowerCase()}, ${inr(npbt)}.`,
        ...part.steps,
        ...(trap ? [`${trap.because} So the change in this balance is left out of the working capital changes.`] : []),
        taxPaidStep(tax, way),
        `${NET_A.replace(' (used in)', '')} = ${inr(part.cgo)} - ${inr(tax.paid)} = ${inr(part.net)}.`,
      ],
      hints: ['Work in four steps: net profit before tax, operating profit before working capital changes, cash generated from operations, then tax paid.', H.wc[0]],
    };
  },
  // The section again from the lines of the data, each taken by what it is: the profit (given, or from Surplus, tax and
  // dividend), the items by their sign, the working capital changes by their kind, the tax paid from the tax account.
  verify: (q) => {
    const rows = rowsOf(q.data);
    const tax = taxIn(q.data);
    const npbt = rows.get(NPBT)?.[0] ?? row(rows, SURPLUS)[1] - row(rows, SURPLUS)[0] + tax.made + row(rows, 'Proposed dividend')[0];
    const op = npbt + sum([...rows].map(([label, a]) => (OP_SIGN.get(label) ?? 0) * a[0]));
    const cgo = op + wcEffectOf(rows);
    const totals = subtotalsOf(q);
    return totals.get(OP_PROFIT) === op && totals.get(CGO) === cgo && totals.get(NET_A) === cgo - tax.paid && q.rows[0].amounts[0] === rupees(npbt);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Investing activities: machinery kept at cost with its accumulated depreciation, non-current investments, and the
// income from what the company holds.
// ---------------------------------------------------------------------------------------------------------------

type Sale = ReturnType<typeof drawSale>;
/** The machinery of a year: the account at cost and the accumulated depreciation at the two dates, and what moved them. */
export interface MachineYear {
  open: number;
  close: number;
  depOpen: number;
  depClose: number;
  bought: number;
  charge: number;
  sale: Sale | null;
}
/** `large` is for a company whose whole balance sheet is shown, where the machinery is the greater part of the assets. */
function drawMachineYear(rng: Rng, withSale: boolean, large = false): MachineYear {
  const sale = withSale ? drawSale(rng) : null;
  const open = (sale?.cost ?? 0) + (large ? k(rng, 1000000, 2000000, 50000) : k(rng, 500000, 1200000, 50000));
  const bought = large ? k(rng, 250000, 900000, 10000) : k(rng, 150000, 600000, 10000);
  const depOpen = (sale?.accumulated ?? 0) + k(rng, 80000, 300000, 10000);
  // Depreciation of the year in proportion to the machinery held.
  const charge = Math.round((open * rng.pick([8, 10, 12])) / 100 / 5000) * 5000;
  return { open, close: open - (sale?.cost ?? 0) + bought, depOpen, depClose: depOpen - (sale?.accumulated ?? 0) + charge, bought, charge, sale };
}
const MACHINERY = 'Machinery (at cost)';
const ACC_DEP = 'Accumulated depreciation on machinery';
const DEP_CHARGED = 'Depreciation charged on machinery for the year';

/**
 * How the sale of the machine is told: by its price; by the profit or loss on it, with the depreciation accumulated
 * on it; or by the profit or loss alone, the depreciation on it being what balances the Accumulated depreciation account.
 */
type SaleStyle = 'price' | 'result' | 'account';
const resultOf = (s: Sale): string => `at a ${s.what} of ${inr(Math.abs(s.g))}`;
const saleLines = (m: MachineYear, style: SaleStyle): string[] => {
  const s = m.sale!;
  if (style === 'price') return [saleLine(s)];
  if (style === 'result') return [`${SALE_START} ${inr(s.cost)}, on which depreciation of ${inr(s.accumulated)} had accumulated, was sold ${resultOf(s)}.`];
  return [`${SALE_START} ${inr(s.cost)} was sold ${resultOf(s)}.`, one(DEP_CHARGED, m.charge)];
};
/** The steps that find the price of the machine sold, by the way the sale is told. */
const saleSteps = (m: MachineYear, style: SaleStyle): string[] => {
  const s = m.sale!;
  const fromBook = `Sale proceeds = book value ${s.g > 0 ? '+ profit' : '- loss'} = ${inr(s.book)} ${s.g > 0 ? '+' : '-'} ${inr(Math.abs(s.g))} = ${inr(s.price)}`;
  if (style === 'price') return [`The machine was sold for ${inr(s.price)}, and the whole of it is an inflow. (Its book value was ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)}, so the sale gave a ${s.what} of ${inr(Math.abs(s.g))}, which is adjusted under operating activities.)`];
  if (style === 'result') return [`Book value of the machine sold = ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)}. ${fromBook}: an inflow.`];
  return [
    `Accumulated depreciation account: ${inr(m.depOpen)} + depreciation of the year ${inr(m.charge)} - depreciation on the machine sold = ${inr(m.depClose)}, so the depreciation on the machine sold = ${inr(s.accumulated)}.`,
    `Book value of the machine sold = ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)}. ${fromBook}: an inflow.`,
  ];
};
/** The price of the machine a format's data says was sold, found as a student finds it: for `verify`. */
function salePriceIn(data: string): { cost: number; price: number } {
  const line = data.split('\n').find((l) => l.startsWith(SALE_START)) ?? '';
  const cost = figureAfter(line, 'that had cost');
  if (line.includes('was sold for')) return { cost, price: figureAfter(line, 'was sold for') };
  const rows = rowsOf(data);
  const [depOpen, depClose] = row(rows, ACC_DEP);
  const accumulated = line.includes('on which depreciation of') ? figureAfter(line, 'on which depreciation of') : depOpen + row(rows, DEP_CHARGED)[0] - depClose;
  return { cost, price: cost - accumulated + signedResult(line) };
}

/** The non-current investments of a year: bought, sold, both, or only held. */
type InvestMode = 'bought' | 'sold' | 'both' | 'held';
interface InvestYear {
  mode: InvestMode;
  open: number;
  close: number;
  bought: number;
  soldCost: number;
  /** The profit (+) or loss (-) on the investments sold: at most a fifth of their cost. */
  gain: number;
  proceeds: number;
}
function drawInvestYear(rng: Rng, mode: InvestMode): InvestYear {
  const soldCost = mode === 'sold' || mode === 'both' ? k(rng, 50000, 200000, 10000) : 0;
  const open = soldCost + k(rng, 100000, 400000, 10000);
  const bought = mode === 'bought' || mode === 'both' ? k(rng, 60000, 300000, 10000) : 0;
  const gain = soldCost > 0 ? (rng.int(0, 3) > 0 ? 1 : -1) * k(rng, 5000, Math.min(40000, soldCost / 5), 5000) : 0;
  return { mode, open, close: open - soldCost + bought, bought, soldCost, gain, proceeds: soldCost + gain };
}
const INVESTMENTS = 'Non-current investments';
const NO_INVEST_SALE = 'No investments were sold during the year.';
const NO_INVEST_BOUGHT = 'No investments were bought during the year; some were sold';
const gainOf = (inv: InvestYear): string => `at a ${inv.gain > 0 ? 'profit' : 'loss'} of ${inr(Math.abs(inv.gain))}`;
const investLine = (inv: InvestYear): string =>
  inv.mode === 'bought' ? NO_INVEST_SALE : inv.mode === 'sold' ? `${NO_INVEST_BOUGHT} ${gainOf(inv)}.` : inv.mode === 'both' ? `${INVEST_SALE_START} ${inr(inv.soldCost)} were sold during the year ${gainOf(inv)}.` : 'No investments were bought or sold during the year.';
/** What a format's data says of the investments, found as a student finds it: for `verify`. */
function investmentsIn(data: string): { bought: number; proceeds: number } {
  const rows = rowsOf(data);
  if (!rows.has(INVESTMENTS)) return { bought: 0, proceeds: 0 };
  const [open, close] = row(rows, INVESTMENTS);
  const lines = data.split('\n');
  const sold = lines.find((l) => l.startsWith(INVEST_SALE_START));
  const onlySold = lines.find((l) => l.startsWith(NO_INVEST_BOUGHT));
  if (sold) return { bought: close + amountsIn(sold)[0] - open, proceeds: amountsIn(sold)[0] + signedResult(sold) };
  if (onlySold) return { bought: 0, proceeds: open - close + signedResult(onlySold) };
  return { bought: close - open, proceeds: 0 };
}

const INVESTING_ROWS = {
  bought: 'Purchase of machinery',
  sold: 'Sale of machinery',
  investBought: 'Purchase of non-current investments',
  investSold: 'Sale of non-current investments',
};
const INCOME_KEYS = ['interest', 'dividend', 'rent'];
/** The rows of the investing activities, with the step that finds each. */
function investingFlows(m: MachineYear, style: SaleStyle, inv: InvestYear | null, incomes: [string, number][]): Flow[] {
  const s = m.sale;
  return [
    {
      label: INVESTING_ROWS.bought,
      amt: -m.bought,
      why: s
        ? `Machinery account (at cost): opening balance ${inr(m.open)} + purchases - cost of the machine sold ${inr(s.cost)} = closing balance ${inr(m.close)}, so purchases = ${inr(m.close)} + ${inr(s.cost)} - ${inr(m.open)} = ${inr(m.bought)}: an outflow.`
        : `No machinery was sold, so the rise in Machinery at cost, ${inr(m.close)} - ${inr(m.open)} = ${inr(m.bought)}, is the machinery bought: an outflow.`,
    },
    ...(s ? [{ label: INVESTING_ROWS.sold, amt: s.price, why: saleSteps(m, style).join(' ') }] : []),
    ...(inv && inv.bought > 0
      ? [
          {
            label: INVESTING_ROWS.investBought,
            amt: -inv.bought,
            why:
              inv.soldCost > 0
                ? `Investments account: ${inr(inv.open)} + purchases - cost of the investments sold ${inr(inv.soldCost)} = ${inr(inv.close)}, so purchases = ${inr(inv.bought)}: an outflow.`
                : `No investments were sold, so the rise in non-current investments, ${inr(inv.close)} - ${inr(inv.open)} = ${inr(inv.bought)}, is what was bought: an outflow.`,
          },
        ]
      : []),
    ...(inv && inv.soldCost > 0
      ? [
          {
            label: INVESTING_ROWS.investSold,
            amt: inv.proceeds,
            why: `${inv.bought > 0 ? `The investments sold had cost ${inr(inv.soldCost)}` : `None were bought, so the investments sold had cost ${inr(inv.open)} - ${inr(inv.close)} = ${inr(inv.soldCost)}`}. Sale proceeds = cost ${inv.gain > 0 ? '+ profit' : '- loss'} = ${inr(inv.soldCost)} ${inv.gain > 0 ? '+' : '-'} ${inr(Math.abs(inv.gain))} = ${inr(inv.proceeds)}: an inflow.`,
          },
        ]
      : []),
    ...incomes.map(([key, amt]) => ({ label: OP_ITEMS[key].row, amt, why: `${OP_ITEMS[key].data}, ${inr(amt)}, is a return on what the company holds as an investment: an inflow of investing activities for a company that is not a financing company.` })),
  ];
}

// 4. cf-fmt-investing: Cash Flow from Investing Activities from extracts of the two balance sheets and additional
//    information. Machinery at cost with a machine sold, the sale told in three ways (its price; the profit or loss
//    with the depreciation on it; the profit or loss alone, with the depreciation on the machine to be found from the
//    Accumulated depreciation account); non-current investments bought, sold, or both; one or two of interest,
//    dividend and rent received (medium)
const fmtInvesting = statementTemplate({
  id: 'cf-fmt-investing', topicId: T, conceptId: 'cf-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const m = drawMachineYear(rng, true);
    const style = rng.pick(['price', 'result', 'account'] as const);
    const inv = drawInvestYear(rng, rng.pick(['bought', 'both', 'both', 'sold'] as const));
    // Five or six rows: two incomes wherever the investments give one row only.
    const incomes = rng.shuffle(INCOME_KEYS).slice(0, inv.mode === 'both' ? rng.int(1, 2) : 2).map((key): [string, number] => [key, k(rng, 10000, 50000, 5000)]);
    const flows = investingFlows(m, style, inv, incomes);
    const net = sum(flows.map((f) => f.amt));
    if (net === 0 || inv.bought === inv.soldCost || m.bought === m.sale!.cost) return null;
    return {
      task: `Prepare the statement of Cash Flow from Investing Activities of ${co} for the year ended ${Y1}. ${SIGN_RULE}`,
      data: [
        `${co}, ${TRADE_OF[co]}, is not a financing company. From its balance sheets and other information:`,
        two(MACHINERY, m.open, m.close),
        two(ACC_DEP, m.depOpen, m.depClose),
        two(INVESTMENTS, inv.open, inv.close),
        ...saleLines(m, style),
        investLine(inv),
        ...incomes.map(([key, amt]) => one(OP_ITEMS[key].data, amt)),
        'Every purchase and every sale was for cash.',
      ].join('\n'),
      title: `Cash Flow from Investing Activities of ${co} for the year ended ${Y1}`,
      columns: CF_COLUMNS,
      rows: [{ heading: HEAD_B }, ...flows.map(flowRow), { subtotal: NET_B, amount: rupees(net), sum: 'section' }],
      distractors: [
        ...Object.values(INVESTING_ROWS),
        ...INCOME_KEYS.map((key) => OP_ITEMS[key].row),
        OP_ITEMS.depreciation.row,
        m.sale!.g > 0 ? OP_ITEMS.profit.row : OP_ITEMS.loss.row,
        'Interest paid on debentures',
        'Dividend paid',
      ],
      explanation: [
        ...flows.map((f) => f.why),
        `The depreciation of the year and the ${m.sale!.what} on the sale are not cash flows: they are adjusted under operating activities and have no row here.`,
        `${NET_B.replace(' (used in)', '')} = ${chain(flows.map((f) => f.amt))} = ${shown(net)}${net < 0 ? `, that is, net cash of ${inr(-net)} used in investing activities` : ''}.`,
      ],
      hints: H.asset,
    };
  },
  // Every row again from the data: each account balanced by its purchases, the sale proceeds from what is told of
  // the sale, and the income lines.
  verify: (q) => {
    const rows = rowsOf(q.data);
    const [open, close] = row(rows, MACHINERY);
    const sale = salePriceIn(q.data);
    const inv = investmentsIn(q.data);
    const income = sum(INCOME_KEYS.map((key) => rows.get(OP_ITEMS[key].data)?.[0] ?? 0));
    const expected = new Map([
      [INVESTING_ROWS.bought, -(close + sale.cost - open)],
      [INVESTING_ROWS.sold, sale.price],
      [INVESTING_ROWS.investBought, -inv.bought],
      [INVESTING_ROWS.investSold, inv.proceeds],
    ]);
    const others = q.rows.filter((r) => !expected.has(r.label));
    return (
      [...expected].every(([label, amt]) => (amt === 0 ? !q.rows.some((r) => r.label === label) : q.rows.find((r) => r.label === label)?.amounts[0] === rupees(amt))) &&
      sum(others.map((r) => r.amounts[0])) === rupees(income) &&
      subtotalsOf(q).get(NET_B) === sum([...expected.values()]) + income
    );
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Financing activities: shares, with or without a premium; debentures (issued, never redeemed) or a long-term bank
// loan; bank overdraft or cash credit, a short-term borrowing; interest paid; the dividend of the previous year,
// and an interim dividend.
// ---------------------------------------------------------------------------------------------------------------

interface FinanceWant {
  shares: 'none' | 'par' | 'premium';
  debentures: 'none' | 'same' | 'new';
  loan: 'none' | 'repaid' | 'raised';
  overdraft: boolean;
  interim: boolean;
}
interface FinanceYear {
  capOpen: number;
  capUp: number;
  premOpen: number;
  premUp: number;
  debentures: { rate: number; open: number; fresh: number; date: string; months: number; interest: number } | null;
  loan: { open: number; change: number; interest: number } | null;
  overdraft: { label: string; open: number; change: number } | null;
  /** The dividend proposed for the previous year, paid in this one, and the one proposed for this year. */
  prev: number;
  cur: number;
  interim: number;
}
/** When additional debentures are issued, and for how many months of the year they carry interest. */
const DEBENTURE_DATES: [string, number][] = [['1 April 2025', 12], ...ISSUE_DATES];
const SHARE_CAPITAL = 'Equity Share Capital';
const PREMIUM = 'Securities Premium';
const BANK_LOAN = 'Long-term loan from bank';
const SHORT_BORROWINGS = ['Bank overdraft', 'Cash credit from bank'];
const LOAN_INTEREST = 'Interest on long-term bank loan, paid during the year';
const INTERIM_PAID = 'Interim dividend paid during the year';

/**
 * The financing of a year. `capitalFor` gives the opening share capital where it has to fit a balance sheet: it is told
 * what the securities premium and the borrowings come to at the start of the year.
 */
function drawFinanceYear(rng: Rng, want: FinanceWant, capitalFor?: (premiumAndBorrowings: number) => number): FinanceYear {
  const premOpen = want.shares === 'premium' ? k(rng, 20000, 100000, 10000) : 0;
  const capUp = want.shares === 'none' ? 0 : k(rng, 1, 5, 1) * 100000;
  const premUp = want.shares === 'premium' ? (capUp * rng.pick([10, 20, 25])) / 100 : 0;
  const rate = rng.pick([8, 9, 10, 12]);
  const debOpen = k(rng, 2, 6, 1) * 100000;
  const fresh = want.debentures === 'new' ? k(rng, 1, 3, 1) * 100000 : 0;
  const [date, months] = rng.pick(DEBENTURE_DATES);
  const loanOpen = k(rng, 300000, 800000, 50000);
  const odOpen = k(rng, 40000, 150000, 10000);
  const odMove = k(rng, 20000, 80000, 10000);
  const capOpen = capitalFor ? capitalFor(premOpen + (want.debentures === 'none' ? 0 : debOpen) + (want.loan === 'none' ? 0 : loanOpen) + (want.overdraft ? odOpen : 0)) : k(rng, 8, 20, 1) * 100000;
  const [prev, cur] = twoDividends(rng, capOpen, capOpen + capUp);
  return {
    capOpen,
    capUp,
    premOpen,
    premUp,
    debentures: want.debentures === 'none' ? null : { rate, open: debOpen, fresh, date, months, interest: (debOpen * rate) / 100 + (fresh * rate * months) / 1200 },
    loan: want.loan === 'none' ? null : { open: loanOpen, change: want.loan === 'raised' ? k(rng, 100000, 300000, 50000) : -k(rng, 100000, 250000, 50000), interest: (loanOpen * rng.pick([9, 10, 12])) / 100 },
    // A borrowing that is drawn on further, or paid down by less than is owed.
    overdraft: want.overdraft ? { label: rng.pick(SHORT_BORROWINGS), open: odOpen, change: rng.int(0, 1) === 0 || odMove >= odOpen ? odMove : -odMove } : null,
    prev,
    cur,
    interim: want.interim ? dividendOn(rng, capOpen, [4, 5, 6]) : 0,
  };
}

const FINANCING_ROWS = {
  shares: 'Proceeds from issue of equity shares',
  debentures: 'Proceeds from issue of debentures',
  raised: 'Proceeds from long-term bank loan',
  repaid: 'Repayment of long-term bank loan',
  debInterest: 'Interest paid on debentures',
  loanInterest: 'Interest paid on bank loan',
  dividend: 'Dividend paid',
  final: 'Final dividend paid',
  interim: 'Interim dividend paid',
};
const shortName = (label: string, up: boolean): string => `${up ? 'Increase' : 'Decrease'} in ${label === SHORT_BORROWINGS[0] ? 'bank overdraft' : 'cash credit'}`;

/** The rows of the financing activities, with the step that finds each. */
function financingFlows(f: FinanceYear): Flow[] {
  const d = f.debentures;
  return [
    ...(f.capUp > 0
      ? [
          {
            label: FINANCING_ROWS.shares,
            amt: f.capUp + f.premUp,
            why:
              f.premUp > 0
                ? `Equity Share Capital rose by ${inr(f.capOpen + f.capUp)} - ${inr(f.capOpen)} = ${inr(f.capUp)} and Securities Premium by ${inr(f.premOpen + f.premUp)} - ${inr(f.premOpen)} = ${inr(f.premUp)}, all received in cash: proceeds of ${inr(f.capUp)} + ${inr(f.premUp)} = ${inr(f.capUp + f.premUp)}, an inflow.`
                : `Equity Share Capital rose by ${inr(f.capOpen + f.capUp)} - ${inr(f.capOpen)} = ${inr(f.capUp)}, issued for cash: an inflow.`,
          },
        ]
      : []),
    ...(d && d.fresh > 0 ? [{ label: FINANCING_ROWS.debentures, amt: d.fresh, why: `${d.rate}% Debentures rose by ${inr(d.open + d.fresh)} - ${inr(d.open)} = ${inr(d.fresh)}, issued for cash: an inflow.` }] : []),
    ...(f.loan
      ? [
          f.loan.change > 0
            ? { label: FINANCING_ROWS.raised, amt: f.loan.change, why: `The long-term bank loan rose by ${inr(f.loan.open + f.loan.change)} - ${inr(f.loan.open)} = ${inr(f.loan.change)}, money borrowed during the year: an inflow.` }
            : { label: FINANCING_ROWS.repaid, amt: f.loan.change, why: `The long-term bank loan fell by ${inr(f.loan.open)} - ${inr(f.loan.open + f.loan.change)} = ${inr(-f.loan.change)}, which was repaid: an outflow.` },
        ]
      : []),
    ...(f.overdraft
      ? [
          {
            label: shortName(f.overdraft.label, f.overdraft.change > 0),
            amt: f.overdraft.change,
            why: `${f.overdraft.label} is a short-term borrowing, not a part of cash and not a working capital item: it ${f.overdraft.change > 0 ? 'rose' : 'fell'} by ${inr(Math.abs(f.overdraft.change))}, ${f.overdraft.change > 0 ? 'an inflow' : 'an outflow'} of financing activities.`,
          },
        ]
      : []),
    ...(d
      ? [
          {
            label: FINANCING_ROWS.debInterest,
            also: [OP_ITEMS.debentures.row],
            amt: -d.interest,
            why:
              d.fresh > 0 && d.months < 12
                ? `Interest on debentures = ${d.rate}% of ${inr(d.open)} for the year + ${d.rate}% of ${inr(d.fresh)} for the ${d.months} months from ${d.date} = ${inr((d.open * d.rate) / 100)} + ${inr((d.fresh * d.rate * d.months) / 1200)} = ${inr(d.interest)}. None is outstanding, so all of it was paid: an outflow.`
                : `Interest on debentures = ${d.rate}% of ${inr(d.open + d.fresh)}${d.fresh > 0 ? `, the new debentures having been issued on ${d.date}, the first day of the year,` : ''} = ${inr(d.interest)}. None is outstanding, so all of it was paid: an outflow.`,
          },
        ]
      : []),
    ...(f.loan ? [{ label: FINANCING_ROWS.loanInterest, also: [OP_ITEMS.loan.row], amt: -f.loan.interest, why: `Interest of ${inr(f.loan.interest)} was paid on the bank loan: the cost of finance, an outflow of financing activities for a company that is not a financing company.` }] : []),
    {
      label: f.interim > 0 ? FINANCING_ROWS.final : FINANCING_ROWS.dividend,
      ...(f.interim > 0 ? {} : { also: [FINANCING_ROWS.final] }),
      amt: -f.prev,
      why: `The dividend proposed for ${PREV}, ${inr(f.prev)}, was declared and paid in ${YEAR}: an outflow. The dividend proposed for ${YEAR}, ${inr(f.cur)}, is not accounted for until it is declared.`,
    },
    ...(f.interim > 0 ? [{ label: FINANCING_ROWS.interim, amt: -f.interim, why: `The interim dividend of ${inr(f.interim)} was paid during the year: an outflow.` }] : []),
  ];
}
/** The lines of data that tell of the financing: the balances that changed, then the dividends and the interest. */
const financeBalances = (f: FinanceYear, withCapital: boolean): string[] => [
  ...(withCapital || f.capUp > 0 ? [two(SHARE_CAPITAL, f.capOpen, f.capOpen + f.capUp)] : []),
  ...(f.premOpen > 0 ? [two(PREMIUM, f.premOpen, f.premOpen + f.premUp)] : []),
  ...(f.debentures ? [two(`${f.debentures.rate}% Debentures`, f.debentures.open, f.debentures.open + f.debentures.fresh)] : []),
  ...(f.loan ? [two(BANK_LOAN, f.loan.open, f.loan.open + f.loan.change)] : []),
  ...(f.overdraft ? [two(f.overdraft.label, f.overdraft.open, f.overdraft.open + f.overdraft.change)] : []),
];
const financeNotes = (f: FinanceYear): string[] => {
  const d = f.debentures;
  return [
    proposed(f.prev, f.cur),
    ...(f.interim > 0 ? [one(INTERIM_PAID, f.interim)] : []),
    ...(f.loan ? [one(LOAN_INTEREST, f.loan.interest)] : []),
    [
      // One row for an issue at a premium: the data says so, since two rows (the capital and the premium) would be as good an answer.
      ...(f.capUp > 0 ? [f.premUp > 0 ? 'The new shares were issued for cash at a premium: show what the issue brought in as one figure.' : 'The new shares were issued at par for cash.'] : []),
      ...(d && d.fresh > 0 ? [`The additional debentures were issued for cash on ${d.date}.`] : []),
      ...(d ? ['Interest on debentures is paid on the due dates, so none is outstanding at either year end.'] : []),
      `The dividend proposed for ${PREV} was declared and paid during ${YEAR}.${f.interim > 0 ? '' : ' No interim dividend was paid.'}`,
    ].join(' '),
  ];
};
/** The financing flows a format's data tells of, found as a student finds them: for `verify`. */
function financingIn(data: string): [string, number][] {
  const rows = rowsOf(data);
  const up = (label: string): number => (rows.has(label) ? row(rows, label)[1] - row(rows, label)[0] : 0);
  const rate = Number(/(\d+)% Debentures: /.exec(data)?.[1]);
  const [debOpen, debClose] = rows.get(`${rate}% Debentures`) ?? [0, 0];
  const months = DEBENTURE_DATES.find(([date]) => data.includes(`issued for cash on ${date}`))?.[1] ?? 12;
  const short = SHORT_BORROWINGS.find((label) => rows.has(label));
  const interim = rows.get(INTERIM_PAID)?.[0] ?? 0;
  const found: [string, number][] = [
    [FINANCING_ROWS.shares, up(SHARE_CAPITAL) + up(PREMIUM)],
    [FINANCING_ROWS.debentures, debClose - debOpen],
    [up(BANK_LOAN) > 0 ? FINANCING_ROWS.raised : FINANCING_ROWS.repaid, up(BANK_LOAN)],
    ...(short ? ([[shortName(short, up(short) > 0), up(short)]] as [string, number][]) : []),
    // Month by month: the debentures held all year for twelve months, the new ones for the months they were outstanding.
    [FINANCING_ROWS.debInterest, -(debOpen * rate * 12 + (debClose - debOpen) * rate * months) / 1200 || 0],
    [FINANCING_ROWS.loanInterest, -(rows.get(LOAN_INTEREST)?.[0] ?? 0)],
    [interim > 0 ? FINANCING_ROWS.final : FINANCING_ROWS.dividend, -row(rows, 'Proposed dividend')[0]],
    [FINANCING_ROWS.interim, -interim],
  ];
  return found.filter(([, amt]) => amt !== 0);
}
/** True when some rows are exactly the flows expected: every flow under its label, and no other row. */
const rowsAre = (rows: { label: string; amounts: number[] }[], expected: [string, number][]): boolean =>
  rows.length === expected.length && expected.every(([label, amt]) => rows.some((r) => r.label === label && r.amounts[0] === rupees(amt)));

// 5. cf-fmt-financing: Cash Flow from Financing Activities from extracts of the two balance sheets and additional
//    information: five to eight rows out of an issue of shares (at par or at a premium), an issue of debentures on a
//    date in the year with the interest to be worked out, a long-term bank loan raised or repaid with its interest,
//    bank overdraft or cash credit that rises or falls, the final dividend of the previous year and an interim
//    dividend (medium)
const FINANCING_MIXES: FinanceWant[] = (['none', 'par', 'premium', 'premium'] as const)
  .flatMap((shares) => (['none', 'same', 'new', 'new'] as const).map((debentures) => ({ shares, debentures })))
  .flatMap((w) => (['none', 'repaid', 'raised'] as const).map((loan) => ({ ...w, loan })))
  .flatMap((w) => [true, true, false].map((overdraft) => ({ ...w, overdraft })))
  .flatMap((w) => [true, false].map((interim) => ({ ...w, interim })))
  .filter((w) => {
    // The rows the mix gives: the dividend always, and one or two for each of the others.
    const count = 1 + (w.shares === 'none' ? 0 : 1) + (w.debentures === 'none' ? 0 : w.debentures === 'new' ? 2 : 1) + (w.loan === 'none' ? 0 : 2) + (w.overdraft ? 1 : 0) + (w.interim ? 1 : 0);
    return count >= 5 && count <= 8;
  });

const fmtFinancing = statementTemplate({
  id: 'cf-fmt-financing', topicId: T, conceptId: 'cf-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const f = drawFinanceYear(rng, rng.pick(FINANCING_MIXES));
    const flows = financingFlows(f);
    const net = sum(flows.map((x) => x.amt));
    if (net === 0) return null;
    return {
      task: `Prepare the statement of Cash Flow from Financing Activities of ${co} for the year ended ${Y1}. ${SIGN_RULE}`,
      data: [`${co}, ${TRADE_OF[co]}, is not a financing company. From its balance sheets and other information:`, ...financeBalances(f, false), ...financeNotes(f)].join('\n'),
      title: `Cash Flow from Financing Activities of ${co} for the year ended ${Y1}`,
      columns: CF_COLUMNS,
      rows: [{ heading: HEAD_C }, ...flows.map(flowRow), { subtotal: NET_C, amount: rupees(net), sum: 'section' }],
      distractors: [
        FINANCING_ROWS.shares,
        FINANCING_ROWS.debentures,
        f.loan && f.loan.change > 0 ? FINANCING_ROWS.repaid : FINANCING_ROWS.raised,
        ...(f.overdraft ? [shortName(f.overdraft.label, f.overdraft.change < 0)] : [shortName(SHORT_BORROWINGS[0], true)]),
        FINANCING_ROWS.interim,
        'Proposed dividend of the current year',
        'Dividend received',
        'Increase in securities premium',
      ],
      explanation: [
        ...flows.map((x) => x.why),
        `${NET_C.replace(' (used in)', '')} = ${chain(flows.map((x) => x.amt))} = ${shown(net)}${net < 0 ? `, that is, net cash of ${inr(-net)} used in financing activities` : ''}.`,
      ],
      hints: H.fin,
    };
  },
  // Every row again from the data: the changes in the balances, the interest month by month, the dividends paid.
  verify: (q) => {
    const expected = financingIn(q.data);
    return rowsAre(q.rows, expected) && subtotalsOf(q).get(NET_C) === sum(expected.map(([, amt]) => amt));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The working accounts the board expects beside the statement: Machinery A/c, kept at cost, and Accumulated
// Depreciation A/c. Both are written up with the engine from the entries of the year, as a working note writes
// them: the price of the machine sold and the depreciation accumulated on it are credited to Machinery A/c, and the
// profit or loss on the sale is what then stands between the account and the Statement of Profit and Loss.
// ---------------------------------------------------------------------------------------------------------------

const OPENED = '1 April 2025';
// The chart has no account by these names: the particulars are named here, over the accounts the entries are posted to.
export const WORKING_LABELS: Record<string, string> = {
  provisionForDepreciation: 'Accumulated Depreciation A/c',
  profitOnSaleOfAsset: 'Statement of Profit and Loss (profit on sale)',
  lossOnSaleOfAsset: 'Statement of Profit and Loss (loss on sale)',
};
/** The working accounts are balanced at the year end and the balance brought down, as the ledger writes them. */
const REOPENED = '1 April 2026';
const WORKING_CLOSE = { closeOn: Y1, reopenOn: REOPENED };
const BRING_DOWN = `Balance the account on ${Y1} and bring the balance down.`;
const workingLabel = (accountId: string): string => WORKING_LABELS[accountId] ?? ledgerLabel(accountId);
/** Wording an examiner accepts as well for a row of a working account. */
export const WORKING_ALSO: Record<string, string[]> = {
  [WORKING_LABELS.profitOnSaleOfAsset]: ['Profit on Sale of Machinery A/c'],
  [WORKING_LABELS.lossOnSaleOfAsset]: ['Loss on Sale of Machinery A/c'],
  'Depreciation A/c': ['Statement of Profit and Loss (depreciation)'],
};
const posted = (debit: string, credit: string, amt: number): DatedEntry => ({
  date: YEAR,
  lines: [
    { accountId: debit, side: 'Dr', amount: rupees(amt) },
    { accountId: credit, side: 'Cr', amount: rupees(amt) },
  ],
});
/** The entries of the year in the machinery and in the depreciation accumulated on it. */
function machineEntries(m: MachineYear): DatedEntry[] {
  const s = m.sale;
  return [
    posted('machinery', 'bank', m.bought),
    ...(s ? [posted('bank', 'machinery', s.price), posted('provisionForDepreciation', 'machinery', s.accumulated), s.g > 0 ? posted('machinery', 'profitOnSaleOfAsset', s.g) : posted('lossOnSaleOfAsset', 'machinery', -s.g)] : []),
    posted('depreciation', 'provisionForDepreciation', m.charge),
  ];
}
type WorkingAccount = 'machinery' | 'provisionForDepreciation';
const openingOf = (m: MachineYear, accountId: WorkingAccount) =>
  accountId === 'machinery' ? { date: OPENED, side: 'Dr' as const, amount: rupees(m.open) } : { date: OPENED, side: 'Cr' as const, amount: rupees(m.depOpen) };
/** The two sides of one of the working accounts for the year, balanced on 31 March 2026. */
function workingSides(m: MachineYear, accountId: WorkingAccount): Pick<AccountParts, 'left' | 'right' | 'broughtDown'> {
  return wordedSides(ledgerSides(accountOf(machineEntries(m), accountId, openingOf(m, accountId), workingLabel), WORKING_CLOSE));
}
/** Machinery A/c of a year, at cost, balanced on 31 March 2026 and brought down, as `cf-fmt-machinery-account` writes it. */
export const machineryAccountSides = (m: MachineYear): Pick<AccountParts, 'left' | 'right' | 'broughtDown'> => workingSides(m, 'machinery');
/** The sides of a working account with the other wordings an examiner accepts. */
function wordedSides(sides: Pick<AccountParts, 'left' | 'right' | 'broughtDown'>): Pick<AccountParts, 'left' | 'right' | 'broughtDown'> {
  const worded = (rows: AccountParts['left']['rows']) => rows.map((r) => (WORKING_ALSO[r.label] ? { ...r, also: WORKING_ALSO[r.label] } : r));
  return { ...sides, left: { ...sides.left, rows: worded(sides.left.rows) }, right: { ...sides.right, rows: worded(sides.right.rows) } };
}
const machineKept = keepFor<MachineYear>();
/** True when a side of an account has a row with these particulars and this figure, in whole rupees. */
const hasRow = (q: AccountQuestion, side: 0 | 1, label: string, amt: number): boolean => q.sides[side].rows.some((r) => r.label === label && r.amounts[0] === rupees(amt));
/**
 * The account posted again from the entries that were kept, with `post`: its balance is the closing row, on the side
 * it should be, and it is the closing balance the data gives; the opening balance is the one the data gives.
 */
function workingHolds(q: AccountQuestion, accountId: WorkingAccount, dataLabel: string): MachineYear | null {
  const m = machineKept.of(q.data);
  if (m === undefined) return null;
  const opening = openingOf(m, accountId);
  const ledger = post(machineEntries(m).map((e): JournalLine[] => e.lines), new Map([[accountId, opening.side === 'Dr' ? opening.amount : -opening.amount]]));
  const balance = balanceOf(ledger, accountId);
  const own = opening.side === 'Dr' ? 0 : 1;
  const [open, close] = row(rowsOf(q.data), dataLabel);
  const carried = q.sides[1 - own].rows.filter((r) => r.closing);
  const reopened = q.sides[own].below;
  return balance?.side === opening.side && carried.length === 1 && carried[0].amounts[0] === balance.amount && balance.amount === rupees(close) && hasRow(q, own, 'Balance b/d', open) && reopened.length === 1 && reopened[0].label === 'Balance b/d' && reopened[0].amounts[0] === balance.amount ? m : null;
}
const WORKING_INTRO = 'keeps its machinery at cost in Machinery A/c and the depreciation on it in Accumulated Depreciation A/c. From its balance sheets and other information:';
const BOUGHT_LINE = 'Machinery bought during the year';
const ONE_SOLD = 'During the year a machine on which depreciation of';

// 6. cf-fmt-machinery-account: Machinery A/c, at cost, for the year. In two seeds of three the machinery bought is the
//    balancing figure, the sale of a machine being told in one of three ways (its price; the profit or loss with the
//    depreciation on it; the profit or loss alone, with the Accumulated Depreciation A/c to be balanced first). In the
//    third the purchase is given and the profit or loss on the machine sold is what balances the account, on the
//    debit side or on the credit side (medium)
const fmtMachineryAccount = accountTemplate({
  id: 'cf-fmt-machinery-account', topicId: T, conceptId: 'cf-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const m = drawMachineYear(rng, true);
    const s = m.sale!;
    const wanted = rng.pick(['purchase', 'purchase', 'result'] as const);
    const style = rng.pick(['price', 'result', 'account'] as const);
    if (m.bought === s.price || m.bought === s.cost) return null;
    const data = [
      `${co} ${WORKING_INTRO}`,
      two(MACHINERY, m.open, m.close),
      ...(wanted === 'purchase'
        ? [...(style === 'account' ? [two(ACC_DEP, m.depOpen, m.depClose)] : []), ...saleLines(m, style)]
        : [one(BOUGHT_LINE, m.bought), `${ONE_SOLD} ${inr(s.accumulated)} had accumulated was sold for ${inr(s.price)}.`]),
      'No other machinery was sold. The purchases and the sale were by cheque, and the profit or loss on the sale goes to the Statement of Profit and Loss.',
    ].join('\n');
    machineKept.keep(data, m);
    const resultRow = `${s.g > 0 ? 'To' : 'By'} ${s.g > 0 ? WORKING_LABELS.profitOnSaleOfAsset : WORKING_LABELS.lossOnSaleOfAsset} ${inr(Math.abs(s.g))}`;
    return {
      task:
        wanted === 'purchase'
          ? `Prepare Machinery A/c of ${co} for the year ended ${Y1}, with the machinery bought during the year as its balancing figure. ${BRING_DOWN}`
          : `Prepare Machinery A/c of ${co} for the year ended ${Y1}, with the profit or loss on the machine sold as its balancing figure. ${BRING_DOWN}`,
      data,
      title: 'Machinery A/c',
      ...workingSides(m, 'machinery'),
      // Both wordings of a profit and of a loss are on offer, so that the labels do not say which the sale gave.
      distractors: ['Machinery A/c', 'Depreciation A/c', 'Cash A/c', WORKING_LABELS.lossOnSaleOfAsset, WORKING_LABELS.profitOnSaleOfAsset, ...WORKING_ALSO[WORKING_LABELS.lossOnSaleOfAsset], ...WORKING_ALSO[WORKING_LABELS.profitOnSaleOfAsset]],
      explanation: [
        `The account is kept at cost. It opens with a debit balance of ${inr(m.open)} (To Balance b/d) and closes with ${inr(m.close)}, carried down on the credit side (By Balance c/d) and brought down on the debit side on ${REOPENED} (To Balance b/d).`,
        ...(wanted === 'purchase'
          ? [
              ...saleSteps(m, style).map((step) => step.replace(': an inflow.', '.').replace(', and the whole of it is an inflow.', '.')),
              `The machine sold leaves the account at its cost of ${inr(s.cost)}, in ${s.g > 0 ? 'two credits and a debit' : 'three credits'}: the price received, By Bank A/c ${inr(s.price)}; the depreciation accumulated on it, By Accumulated Depreciation A/c ${inr(s.accumulated)}; and the ${s.what} on the sale, ${resultRow}${s.g > 0 ? `, a debit, since the two credits come to ${inr(s.price + s.accumulated)}, which is ${inr(s.g)} more than the cost` : ''}.`,
              `The debit side is still short: machinery bought, To Bank A/c, is the balancing figure = ${inr(m.close)} + ${inr(s.cost)} - ${inr(m.open)} = ${inr(m.bought)}. It is the outflow shown under investing activities.`,
            ]
          : [
              `The machinery bought is debited: To Bank A/c ${inr(m.bought)}. The price of the machine sold is credited, By Bank A/c ${inr(s.price)}, and so is the depreciation accumulated on it, By Accumulated Depreciation A/c ${inr(s.accumulated)}.`,
              `Cost of the machine sold = ${inr(m.open)} + ${inr(m.bought)} - ${inr(m.close)} = ${inr(s.cost)}, so its book value was ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)}.`,
              `It fetched ${inr(s.price)}, a ${s.what} of ${inr(Math.abs(s.g))}, which is the balancing figure of the account: ${resultRow}. It is ${s.g > 0 ? 'deducted from' : 'added back to'} the profit under operating activities.`,
            ]),
        `Each side then totals ${inr(m.open + m.bought + Math.max(s.g, 0))}.`,
      ],
      hints: H.asset,
    };
  },
  // Posted again with `post`; then the worked figure once more from the data alone, as a student finds it.
  verify: (q) => {
    const m = workingHolds(q, 'machinery', MACHINERY);
    if (m === null) return false;
    const rows = rowsOf(q.data);
    const [open, close] = row(rows, MACHINERY);
    const profit = (g: number): boolean => (g > 0 ? hasRow(q, 0, WORKING_LABELS.profitOnSaleOfAsset, g) : hasRow(q, 1, WORKING_LABELS.lossOnSaleOfAsset, -g));
    if (rows.has(BOUGHT_LINE)) {
      const sold = q.data.split('\n').find((l) => l.startsWith(ONE_SOLD)) ?? '';
      const [accumulated, price] = amountsIn(sold);
      const bought = row(rows, BOUGHT_LINE)[0];
      return hasRow(q, 0, 'Bank A/c', bought) && hasRow(q, 1, 'Bank A/c', price) && profit(price - (open + bought - close - accumulated));
    }
    const sale = salePriceIn(q.data);
    return hasRow(q, 0, 'Bank A/c', close + sale.cost - open) && hasRow(q, 1, 'Bank A/c', sale.price);
  },
});

// 7. cf-fmt-accumulated-depreciation: Accumulated Depreciation A/c for the year, with two machines leaving it, so that
//    the account asks for more than one worked figure. The depreciation of the year is the balancing figure, the
//    depreciation on each machine sold being given or found (from its cost, its price and the profit or loss on it,
//    or from its cost and its book value); or the depreciation of the year is given, the depreciation on one machine
//    is told or found, and the depreciation on the other is what balances the account (medium)
/** How the depreciation accumulated on a machine sold is told: given; from its price and the profit or loss; from its book value. */
type DepWay = 'given' | 'result' | 'book';
const FIRST_SOLD = 'During the year a machine that had cost';
const SECOND_SOLD = 'Another machine that had cost';
const SECOND_UNTOLD = 'A second machine was also sold during the year; the depreciation accumulated on it is not given.';
const BOOK_WORDS = 'with a book value of';
const soldLine = (start: string, s: Sale, way: DepWay): string =>
  way === 'given'
    ? `${start} ${inr(s.cost)}, on which depreciation of ${inr(s.accumulated)} had accumulated, was sold for ${inr(s.price)}.`
    : way === 'result'
      ? `${start} ${inr(s.cost)} was sold for ${inr(s.price)}, ${resultOf(s)}.`
      : `${start} ${inr(s.cost)}, ${BOOK_WORDS} ${inr(s.book)} on the date of sale, was sold for ${inr(s.price)}.`;
const soldStep = (s: Sale, way: DepWay, which: string): string =>
  way === 'given'
    ? `The depreciation accumulated on the ${which} machine sold, ${inr(s.accumulated)}, is given; its cost and its price belong to Machinery A/c.`
    : way === 'result'
      ? `${cap(which)} machine sold: book value = sale price ${s.g > 0 ? '- profit' : '+ loss'} = ${inr(s.price)} ${s.g > 0 ? '-' : '+'} ${inr(Math.abs(s.g))} = ${inr(s.book)}, so the depreciation accumulated on it = cost - book value = ${inr(s.cost)} - ${inr(s.book)} = ${inr(s.accumulated)}.`
      : `${cap(which)} machine sold: the depreciation accumulated on it = cost - book value = ${inr(s.cost)} - ${inr(s.book)} = ${inr(s.accumulated)}.`;
/** The depreciation accumulated on a machine sold, found from its line of data as a student finds it: for `verify`. */
const accumulatedIn = (line: string): number =>
  line.includes('on which depreciation of')
    ? figureAfter(line, 'on which depreciation of')
    : line.includes(BOOK_WORDS)
      ? figureAfter(line, 'that had cost') - figureAfter(line, BOOK_WORDS)
      : figureAfter(line, 'that had cost') - (figureAfter(line, 'was sold for') - signedResult(line));
interface DepYear {
  depOpen: number;
  depClose: number;
  charge: number;
  sold: [Sale, Sale];
}
const depKept = keepFor<DepYear>();
const depEntries = (d: DepYear): DatedEntry[] => [
  posted('provisionForDepreciation', 'machinery', d.sold[0].accumulated),
  posted('provisionForDepreciation', 'machinery', d.sold[1].accumulated),
  posted('depreciation', 'provisionForDepreciation', d.charge),
];

const fmtAccumulatedDepreciation = accountTemplate({
  id: 'cf-fmt-accumulated-depreciation', topicId: T, conceptId: 'cf-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const m = drawMachineYear(rng, true);
    const sold: [Sale, Sale] = [m.sale!, drawSale(rng)];
    // The depreciation on the second machine was in the opening balance too; the closing balance is what is left.
    const d: DepYear = { depOpen: m.depOpen + sold[1].accumulated, depClose: m.depClose, charge: m.charge, sold };
    const wanted = rng.pick(['charge', 'charge', 'sold'] as const);
    const [way1, way2] = rng.shuffle<DepWay>(['given', 'result', 'book']);
    if (sold[0].accumulated === sold[1].accumulated || sold.some((s) => s.accumulated === d.charge) || sold[0].cost === sold[1].cost) return null;
    const data = [
      `${co} ${WORKING_INTRO}`,
      two(ACC_DEP, d.depOpen, d.depClose),
      ...(wanted === 'sold' ? [one(DEP_CHARGED, d.charge)] : []),
      soldLine(FIRST_SOLD, sold[0], way1),
      wanted === 'sold' ? SECOND_UNTOLD : soldLine(SECOND_SOLD, sold[1], way2),
      'No other machinery was sold or discarded.',
    ].join('\n');
    depKept.keep(data, d);
    const [a1, a2] = sold.map((s) => s.accumulated);
    return {
      task:
        wanted === 'charge'
          ? `Prepare Accumulated Depreciation A/c of ${co} for the year ended ${Y1}, with the depreciation charged for the year as its balancing figure, and the depreciation on each machine sold as a row of its own. ${BRING_DOWN}`
          : `Prepare Accumulated Depreciation A/c of ${co} for the year ended ${Y1}, with the depreciation accumulated on the second machine sold as its balancing figure, and the depreciation on each machine sold as a row of its own. ${BRING_DOWN}`,
      data,
      title: 'Accumulated Depreciation A/c',
      ...wordedSides(ledgerSides(accountOf(depEntries(d), 'provisionForDepreciation', { date: OPENED, side: 'Cr', amount: rupees(d.depOpen) }, workingLabel), WORKING_CLOSE)),
      distractors: ['Accumulated Depreciation A/c', 'Bank A/c', WORKING_LABELS.lossOnSaleOfAsset, WORKING_LABELS.profitOnSaleOfAsset],
      explanation: [
        `The account holds the depreciation provided so far, a credit balance: it opens with ${inr(d.depOpen)} on the credit side (By Balance b/d) and closes with ${inr(d.depClose)}, carried down on the debit side (To Balance c/d) and brought down on the credit side on ${REOPENED} (By Balance b/d).`,
        soldStep(sold[0], way1, 'first'),
        ...(wanted === 'charge' ? [soldStep(sold[1], way2, 'second')] : []),
        `The depreciation on a machine sold leaves the account with the machine and is transferred to Machinery A/c, a debit for each machine: To Machinery A/c ${inr(a1)}${wanted === 'charge' ? ` and To Machinery A/c ${inr(a2)}` : ' for the first'}.`,
        ...(wanted === 'charge'
          ? [`The credit side is still short: the depreciation charged for the year, By Depreciation A/c, is the balancing figure = ${inr(d.depClose)} + ${inr(a1)} + ${inr(a2)} - ${inr(d.depOpen)} = ${inr(d.charge)}. It is added back to the profit under operating activities.`]
          : [
              `The depreciation charged for the year is credited: By Depreciation A/c ${inr(d.charge)}.`,
              `The debit side is still short: the depreciation accumulated on the second machine sold is the balancing figure = ${inr(d.depOpen)} + ${inr(d.charge)} - ${inr(a1)} - ${inr(d.depClose)} = ${inr(a2)}: To Machinery A/c.`,
            ]),
        `Each side then totals ${inr(d.depOpen + d.charge)}.`,
      ],
      hints: ['Accumulated depreciation account: opening balance + depreciation for the year - depreciation on the machines sold = closing balance.', 'Depreciation accumulated on a machine sold = its cost - its book value on the date of sale.'],
    };
  },
  // Posted again with `post`: the balance is the closing row and the closing balance of the data. Then every figure
  // once more from the data alone, as a student finds it.
  verify: (q) => {
    const d = depKept.of(q.data);
    if (d === undefined) return false;
    const ledger = post(depEntries(d).map((e): JournalLine[] => e.lines), new Map([['provisionForDepreciation', -rupees(d.depOpen)]]));
    const balance = balanceOf(ledger, 'provisionForDepreciation');
    const rows = rowsOf(q.data);
    const [open, close] = row(rows, ACC_DEP);
    const carried = q.sides[0].rows.filter((r) => r.closing);
    const reopened = q.sides[1].below;
    if (!(balance?.side === 'Cr' && balance.amount === rupees(close) && carried.length === 1 && carried[0].amounts[0] === balance.amount && hasRow(q, 1, 'Balance b/d', open))) return false;
    if (!(reopened.length === 1 && reopened[0].label === 'Balance b/d' && reopened[0].amounts[0] === balance.amount)) return false;
    const lines = q.data.split('\n');
    const first = accumulatedIn(lines.find((l) => l.startsWith(FIRST_SOLD)) ?? '');
    const transfers = q.sides[0].rows.filter((r) => r.label === 'Machinery A/c').map((r) => r.amounts[0]);
    const both = (second: number): boolean => transfers.length === 2 && transfers.includes(rupees(first)) && transfers.includes(rupees(second));
    if (rows.has(DEP_CHARGED)) {
      const charge = row(rows, DEP_CHARGED)[0];
      return hasRow(q, 1, 'Depreciation A/c', charge) && both(open + charge - first - close);
    }
    const second = accumulatedIn(lines.find((l) => l.startsWith(SECOND_SOLD)) ?? '');
    return both(second) && hasRow(q, 1, 'Depreciation A/c', close + first + second - open);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The whole statement, from two balance sheets. The opening balance sheet is drawn so that it agrees; the closing one
// is what the transactions of the year leave, each of them moved through the books as a debit and a credit, so that
// it agrees too and its cash is the cash the statement ends on. The chart has no account for a provision for tax, a
// dividend or the Surplus, so the books here are kept under the names of the lines of the balance sheet.
// ---------------------------------------------------------------------------------------------------------------

/** The balance of every line of a balance sheet: a debit balance (an asset) positive, a credit balance negative. */
type Books = Map<string, number>;
const moved = (books: Books, debit: string, credit: string, amt: number): void => {
  if (amt === 0) return;
  books.set(debit, (books.get(debit) ?? 0) + amt);
  books.set(credit, (books.get(credit) ?? 0) - amt);
};
const NET_CHANGE = 'Net increase (decrease) in cash and cash equivalents';
const CASH_START = 'Cash and cash equivalents at the beginning of the year';
const CASH_END = 'Cash and cash equivalents at the end of the year';
const PAYABLES = 'Trade payables';
const TAX_PROVISION = 'Provision for tax';
const LESS_DEP = 'Less accumulated depreciation on machinery';
const CURRENT_INVESTMENTS = 'Current investments (marketable securities)';
const CASH_BANK = 'Cash and bank balances';
const CASH_ONE_LINE = 'Cash and cash equivalents';
const SHEET_TOP = 'Equity and liabilities';
const SHEET_ASSETS = 'Assets';
const SHEET_END = 'Additional information:';
const NO_MACHINE_SOLD = 'No machinery was sold during the year.';
/** The lines of one half of a balance sheet as a format's data gives them, with the figure of each at the two dates: for `verify`. */
const sheetLines = (data: string, from: string, to: string): { label: string; at: number[] }[] => {
  const lines = data.split('\n');
  return lines.slice(lines.indexOf(from) + 1, lines.indexOf(to)).map((l) => ({ label: l.slice(0, l.indexOf(': ')), at: amountsIn(l) }));
};

// 8. cf-fmt-statement: the Cash Flow Statement from two balance sheets and additional information, the 6-mark question.
//    Eleven lines of story at most: machinery at cost with its accumulated depreciation, bought every year and a machine
//    sold in six seeds of ten; investments that are bought, or held for their income, in three of five; debentures
//    (some of them issued during the year) or a bank loan raised or repaid; shares issued in two seeds of three, some
//    at a premium; bank overdraft or cash credit in one of three; inventories, receivables and payables; tax of which
//    nothing more is known; the dividend of the previous year. Cash is one line, or cash and bank with current
//    investments beside them (complex)
/** The whole statement as `cf-fmt-statement` makes it, with the machinery of its year, for the case of the analysis stage. */
export interface CashFlowCase {
  parts: StatementParts;
  co: string;
  m: MachineYear;
}
/**
 * The scenario and the statement of `cf-fmt-statement`. `sale` (for a case) decides whether a machine is sold; the
 * draw that decides it otherwise is made all the same, so the template makes exactly what it made before.
 */
export function cashFlowStatement(rng: Rng, opts: { sale?: boolean } = {}): CashFlowCase | null {
  const co = rng.pick(COMPANIES);
  const sold = rng.int(0, 9) < 6;
  const m = drawMachineYear(rng, opts.sale ?? sold, true);
  const style = rng.pick(['price', 'result'] as const);
  const holding = rng.pick(['none', 'none', 'bought', 'held', 'held'] as const);
  const inv = holding === 'none' ? null : drawInvestYear(rng, holding);
  const incomes: [string, number][] = holding === 'held' ? [[rng.pick(['interest', 'dividend']), k(rng, 10000, 40000, 5000)]] : [];
  const wc = drawWc(rng, ['Inventories', 'Trade receivables', PAYABLES]);
  const split = rng.int(0, 2) === 0;
  const cashOpen = k(rng, 80000, 300000, 10000);
  const heldOpen = split ? k(rng, 30000, 120000, 10000) : 0;
  const heldClose = split ? heldOpen + (heldOpen > 40000 ? rng.pick([-1, 1]) : 1) * k(rng, 10000, 40000, 10000) : 0;
  const assetsOpen = m.open - m.depOpen + (inv?.open ?? 0) + sum(wc.filter((b) => b.kind === 'A').map((b) => b.open)) + heldOpen + cashOpen;
  // The profit of the year after tax, in proportion to what the company owns; the tax on it; and so the profit before tax.
  const after = Math.round((assetsOpen * rng.pick([8, 10, 12, 15])) / 100 / 10000) * 10000;
  const tax = drawTax(rng, after, 'closing');
  const npbt = after + tax.made;
  // The opening balance sheet: what the assets leave over the payables and the provision for tax is the capital,
  // the premium, the Surplus and the borrowings.
  const funds = assetsOpen - sum(wc.filter((b) => b.kind === 'L').map((b) => b.open)) - tax.open;
  // What the year leaves in hand before any financing: a company that is short raises money, one that is flush does not.
  const inHand = cashOpen + heldOpen + after + tax.made - tax.paid + m.charge - (m.sale?.g ?? 0) + sum(wc.map((b) => wcFlow(b).amt)) - m.bought + (m.sale?.price ?? 0) - (inv?.bought ?? 0);
  const [short, flush] = [inHand < 150000, inHand > 400000];
  // In between, it raises money in one way: by an issue of shares, or by borrowing.
  const issues = short || (!flush && rng.int(0, 1) === 0);
  const borrowing = short || (!flush && !issues) ? rng.pick(['new', 'raised'] as const) : rng.pick(['same', 'repaid'] as const);
  const f = drawFinanceYear(
    rng,
    {
      shares: issues ? rng.pick(['par', 'premium'] as const) : 'none',
      debentures: borrowing === 'same' || borrowing === 'new' ? borrowing : 'none',
      loan: borrowing === 'repaid' || borrowing === 'raised' ? borrowing : 'none',
      overdraft: rng.int(0, 2) === 0,
      interim: false,
    },
    (other) => Math.floor(((funds - other) * rng.pick([60, 70, 80])) / 100 / 100000) * 100000,
  );
  const debLabel = f.debentures ? `${f.debentures.rate}% Debentures` : '';
  const borrowedOpen = (f.debentures?.open ?? 0) + (f.loan?.open ?? 0) + (f.overdraft?.open ?? 0);
  const surplusOpen = funds - borrowedOpen - f.premOpen - f.capOpen;
  if (!(f.capOpen >= 500000) || surplusOpen < 50000 || surplusOpen + after - f.prev < 50000 || tax.open < 15000) return null;

  // The three sections, from what happened during the year.
  const s = m.sale;
  const interest = (f.debentures?.interest ?? 0) + (f.loan?.interest ?? 0);
  const adjusts: Flow[] = [
    { label: OP_ITEMS.depreciation.row, amt: m.charge, why: s ? `Accumulated depreciation account: ${inr(m.depOpen)} + depreciation of the year - depreciation on the machine sold ${inr(s.accumulated)} = ${inr(m.depClose)}, so the depreciation of the year = ${inr(m.charge)}. It is ${NON_CASH}.` : `No machinery was sold, so the rise in accumulated depreciation, ${inr(m.depClose)} - ${inr(m.depOpen)} = ${inr(m.charge)}, is the depreciation of the year. It is ${NON_CASH}.` },
    ...(s ? [{ label: s.g > 0 ? OP_ITEMS.profit.row : OP_ITEMS.loss.row, amt: -s.g, why: `The machine sold had a book value of ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)} and fetched ${inr(s.price)}: a ${s.what} of ${inr(Math.abs(s.g))}, which is ${s.g > 0 ? OP_ITEMS.profit.why : OP_ITEMS.loss.why}.` }] : []),
    ...(f.debentures ? [{ label: OP_ITEMS.debentures.row, also: OP_ITEMS.debentures.also, amt: f.debentures.interest, why: `Interest on debentures for the year, ${inr(f.debentures.interest)} (worked out under financing activities, below), is ${FINANCE_COST}.` }] : []),
    ...(f.loan ? [{ label: OP_ITEMS.loan.row, also: OP_ITEMS.loan.also, amt: f.loan.interest, why: `Interest on the bank loan, ${inr(f.loan.interest)}, is ${FINANCE_COST}.` }] : []),
    ...incomes.map(([key, amt]) => opFlow(OP_ITEMS[key], amt)),
  ];
  const part = operatingRows(npbt, adjusts, wc, tax.paid);
  const investing = investingFlows(m, style, inv, incomes);
  const financing = financingFlows(f);
  const netB = sum(investing.map((x) => x.amt));
  const netC = sum(financing.map((x) => x.amt));
  const net = part.net + netB + netC;
  const count = 3 + adjusts.length + wc.length + investing.length + financing.length;
  const cashClose = cashOpen + heldOpen + net - heldClose;
  if (count < 13 || count > 18 || part.op <= 0 || part.cgo <= 0 || part.net <= 0 || netB === 0 || netC === 0 || net === 0 || cashClose < 30000 || cashClose > 600000) return null;

  // The books: the opening balance sheet, then every transaction of the year as a debit and a credit.
  const books: Books = new Map();
  const opens: [string, number][] = [
    [SHARE_CAPITAL, -f.capOpen], [PREMIUM, -f.premOpen], [SURPLUS, -surplusOpen], [debLabel, -(f.debentures?.open ?? 0)], [BANK_LOAN, -(f.loan?.open ?? 0)],
    [f.overdraft?.label ?? '', -(f.overdraft?.open ?? 0)], ...wc.map((b): [string, number] => [b.label, b.kind === 'A' ? b.open : -b.open]), [TAX_PROVISION, -tax.open],
    [MACHINERY, m.open], [ACC_DEP, -m.depOpen], [INVESTMENTS, inv?.open ?? 0], [CURRENT_INVESTMENTS, heldOpen], [CASH_BANK, cashOpen],
  ];
  for (const [line, balance] of opens) if (balance !== 0) books.set(line, balance);
  const opening = new Map(books);
  moved(books, CASH_BANK, SURPLUS, part.op); // what the operations earned, before the items that are not theirs and as if all of it in cash
  for (const b of wc) moved(books, b.close > b.open === (b.kind === 'A') ? b.label : CASH_BANK, b.close > b.open === (b.kind === 'A') ? CASH_BANK : b.label, Math.abs(b.close - b.open));
  moved(books, SURPLUS, ACC_DEP, m.charge);
  moved(books, MACHINERY, CASH_BANK, m.bought);
  if (s) {
    moved(books, CASH_BANK, MACHINERY, s.price);
    moved(books, ACC_DEP, MACHINERY, s.accumulated);
    moved(books, s.g > 0 ? MACHINERY : SURPLUS, s.g > 0 ? SURPLUS : MACHINERY, Math.abs(s.g));
  }
  moved(books, INVESTMENTS, CASH_BANK, inv?.bought ?? 0);
  for (const [, amt] of incomes) moved(books, CASH_BANK, SURPLUS, amt);
  moved(books, SURPLUS, CASH_BANK, interest);
  moved(books, SURPLUS, TAX_PROVISION, tax.made);
  moved(books, TAX_PROVISION, CASH_BANK, tax.paid);
  moved(books, SURPLUS, CASH_BANK, f.prev);
  moved(books, CASH_BANK, SHARE_CAPITAL, f.capUp);
  moved(books, CASH_BANK, PREMIUM, f.premUp);
  moved(books, CASH_BANK, debLabel, f.debentures?.fresh ?? 0);
  if (f.loan) moved(books, f.loan.change > 0 ? CASH_BANK : BANK_LOAN, f.loan.change > 0 ? BANK_LOAN : CASH_BANK, Math.abs(f.loan.change));
  if (f.overdraft) moved(books, f.overdraft.change > 0 ? CASH_BANK : f.overdraft.label, f.overdraft.change > 0 ? f.overdraft.label : CASH_BANK, Math.abs(f.overdraft.change));
  // Marketable securities bought or sold: cash only changes its form within cash and cash equivalents.
  moved(books, heldClose > heldOpen ? CURRENT_INVESTMENTS : CASH_BANK, heldClose > heldOpen ? CASH_BANK : CURRENT_INVESTMENTS, Math.abs(heldClose - heldOpen));
  // The statement must end on the cash the books are left with.
  if ((books.get(CASH_BANK) ?? 0) !== cashClose) return null;

  const both = (line: string, sign: 1 | -1, name = line): string => two(name, sign * (opening.get(line) ?? 0), sign * (books.get(line) ?? 0));
  const liabilities = [SHARE_CAPITAL, PREMIUM, SURPLUS, debLabel, BANK_LOAN, f.overdraft?.label ?? '', PAYABLES, TAX_PROVISION].filter((line) => opening.has(line));
  const assets = [MACHINERY, ACC_DEP, INVESTMENTS, 'Inventories', 'Trade receivables', CURRENT_INVESTMENTS, CASH_BANK].filter((line) => opening.has(line));
  const total = (at: Books, lines: string[]): number => Math.abs(sum(lines.map((line) => at.get(line) ?? 0)));
  const cashStart = cashOpen + heldOpen;
  const parts: StatementParts = {
    task: `Prepare the Cash Flow Statement of ${co} for the year ended ${Y1} by the indirect method, as AS 3 (Revised) lays down. ${SIGN_RULE}`,
    data: [
      `${co}, ${TRADE_OF[co]}, is not a financing company. Its balance sheets on ${Y0} and on ${Y1}:`,
      SHEET_TOP,
      ...liabilities.map((line) => both(line, -1)),
      two('Total', total(opening, liabilities), total(books, liabilities)),
      SHEET_ASSETS,
      ...assets.map((line) => (line === ACC_DEP ? both(line, -1, LESS_DEP) : both(line, 1, line === CASH_BANK && !split ? CASH_ONE_LINE : line))),
      two('Total', total(opening, assets), total(books, assets)),
      SHEET_END,
      ...(s ? saleLines(m, style) : [NO_MACHINE_SOLD]),
      ...(inv ? [investLine(inv)] : []),
      ...incomes.map(([key, amt]) => one(OP_ITEMS[key].data, amt)),
      ...financeNotes(f).map((line, i, all) => (i === all.length - 1 ? `${line.replace(' No interim dividend was paid.', '')} No interim dividend was paid and no transfer was made to reserves. Nothing more is known about tax.` : line)),
      `Every purchase and every sale of ${inv && inv.bought > 0 ? 'machinery and investments' : 'machinery'} was for cash.${split ? ' The current investments are marketable securities, which are cash equivalents.' : ''}`,
    ].join('\n'),
    title: `Cash Flow Statement of ${co} for the year ended ${Y1}`,
    columns: CF_COLUMNS,
    rows: [
      { heading: HEAD_A },
      ...part.rows,
      { heading: HEAD_B },
      ...investing.map(flowRow),
      { subtotal: NET_B, amount: rupees(netB), sum: 'section' },
      { heading: HEAD_C },
      ...financing.map(flowRow),
      { subtotal: NET_C, amount: rupees(netC), sum: 'section' },
      { subtotal: NET_CHANGE, amount: rupees(net), sum: 'all' },
      { label: CASH_START, amount: rupees(cashStart) },
    ],
    final: { label: CASH_END, amount: rupees(cashStart + net) },
    distractors: [
      ...wc.map((b) => wcName(b, b.close < b.open)),
      s && s.g > 0 ? OP_ITEMS.loss.row : OP_ITEMS.profit.row,
      shortName(f.overdraft?.label ?? SHORT_BORROWINGS[0], !(f.overdraft && f.overdraft.change > 0)),
      'Provision for tax made',
      'Proposed dividend of the current year',
      'Increase in provision for tax',
      ...(split ? [`${heldClose > heldOpen ? 'Purchase' : 'Sale'} of current investments`] : []),
    ],
    explanation: [
      `${NPBT} = change in Surplus (${inr(surplusOpen + after - f.prev)} - ${inr(surplusOpen)} = ${shown(after - f.prev)}) + provision for tax made ${inr(tax.made)} (the closing provision, as nothing more is known about tax) + dividend of ${PREV} paid ${inr(f.prev)} = ${inr(npbt)}.`,
      ...part.steps,
      taxPaidStep(tax, 'closing'),
      `${NET_A.replace(' (used in)', '')} = ${inr(part.cgo)} - ${inr(tax.paid)} = ${inr(part.net)}.`,
      ...investing.map((x) => x.why),
      `Net cash ${netB > 0 ? 'from' : 'used in'} investing activities = ${chain(investing.map((x) => x.amt))} = ${shown(netB)}.`,
      ...financing.map((x) => x.why),
      `Net cash ${netC > 0 ? 'from' : 'used in'} financing activities = ${chain(financing.map((x) => x.amt))} = ${shown(netC)}.`,
      `Net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents = ${chain([part.net, netB, netC])} = ${shown(net)}.`,
      split
        ? `Current investments are marketable securities, that is, cash equivalents: cash and cash equivalents were ${inr(cashOpen)} + ${inr(heldOpen)} = ${inr(cashStart)} at the beginning and ${inr(cashClose)} + ${inr(heldClose)} = ${inr(cashStart + net)} at the end, and the change in the current investments is not a cash flow.`
        : `Cash and cash equivalents were ${inr(cashStart)} at the beginning.`,
      `${inr(cashStart)} ${net > 0 ? '+' : '-'} ${inr(Math.abs(net))} = ${inr(cashStart + net)}, the cash and cash equivalents in the balance sheet on ${Y1}: the statement agrees.`,
    ],
    hints: ['Work the three sections one after another: the profit before tax first, then the accounts of the assets, then the capital and the borrowings.', H.rec[0]],
  };
  return { parts, co, m };
}

/**
 * The statement again from the data alone, as a student prepares it: each balance sheet added up, the profit from
 * Surplus, tax and dividend, the accounts balanced by their missing figures, the changes in the other lines, and the
 * cash of the two balance sheets.
 */
export function cashFlowStatementHolds(q: StatementQuestion): boolean {
  const rows = rowsOf(q.data);
  const up = (label: string): number => (rows.has(label) ? row(rows, label)[1] - row(rows, label)[0] : 0);
  const half = (from: string, to: string): number[] => {
    const lines = sheetLines(q.data, from, to);
    const added = [0, 1].map((d) => sum(lines.filter((l) => l.label !== 'Total').map((l) => (l.label === LESS_DEP ? -1 : 1) * l.at[d])));
    const totals = lines.find((l) => l.label === 'Total')?.at ?? [];
    return added.map((a, d) => (a === totals[d] ? a : NaN));
  };
  const [funds, assets] = [half(SHEET_TOP, SHEET_ASSETS), half(SHEET_ASSETS, SHEET_END)];
  if (!(funds[0] === assets[0] && funds[1] === assets[1])) return false;

  const tax = taxIn(q.data);
  const sold = q.data.includes(NO_MACHINE_SOLD) ? null : salePriceIn(q.data);
  const soldLine = q.data.split('\n').find((l) => l.startsWith(SALE_START)) ?? '';
  const accumulated = sold ? figureAfter(soldLine, 'on which depreciation of') : 0;
  const financing = financingIn(q.data);
  const interest = -sum(financing.filter(([label]) => label === FINANCING_ROWS.debInterest || label === FINANCING_ROWS.loanInterest).map(([, amt]) => amt));
  const income = sum(INCOME_KEYS.map((key) => rows.get(OP_ITEMS[key].data)?.[0] ?? 0));
  const invest = investmentsIn(q.data);
  const npbt = up(SURPLUS) + tax.made + row(rows, 'Proposed dividend')[0];
  const result = sold ? sold.price - (sold.cost - accumulated) : 0;
  const op = npbt + (up(LESS_DEP) + accumulated) - result + interest - income;
  const cgo = op + wcEffectOf(rows);
  const netA = cgo - tax.paid;
  const netB = -(up(MACHINERY) + (sold?.cost ?? 0)) + (sold?.price ?? 0) - invest.bought + invest.proceeds + income;
  const netC = sum(financing.map(([, amt]) => amt));
  const cash = [0, 1].map((d) => (rows.get(CASH_ONE_LINE)?.[d] ?? row(rows, CASH_BANK)[d] + row(rows, CURRENT_INVESTMENTS)[d]));
  const totals = subtotalsOf(q);
  const headed = (heading: string): number => (q.lines ?? []).find((line) => 'heading' in line && line.heading === heading)?.at ?? NaN;
  return (
    totals.get(OP_PROFIT) === op && totals.get(CGO) === cgo && totals.get(NET_A) === netA && totals.get(NET_B) === netB && totals.get(NET_C) === netC &&
    totals.get(NET_CHANGE) === netA + netB + netC &&
    rowsAre(q.rows.slice(headed(HEAD_C), -1), financing) &&
    q.rows[0].amounts[0] === rupees(npbt) &&
    q.rows.at(-1)?.amounts[0] === rupees(cash[0]) && q.final?.amount === rupees(cash[1]) && cash[0] + netA + netB + netC === cash[1]
  );
}

const fmtStatement = statementTemplate({
  id: 'cf-fmt-statement', topicId: T, conceptId: 'cf-formats', difficulty: 'complex',
  generate: (rng) => cashFlowStatement(rng)?.parts ?? null,
  verify: cashFlowStatementHolds,
});

// ===============================================================================================================
// BOARD ITEMS, added after the mock papers were set (so outside them: src/generators/outsidePapers.ts). Debentures
// redeemed, interest accrued on debentures, current maturities of long-term borrowings, goodwill bought, current
// investments that are not cash equivalents, and a year with a loss, in numerics, a financing section and three whole
// statements whose balance sheets come with notes to accounts, as the board prints them.
//  - Debentures are redeemed at par (no redemption entry is asked: only the cash that went out). Interest on the
//    debentures redeemed runs from 1 April to the date of redemption.
//  - When interest is payable on 30 June and 31 December, three months of it are accrued at each year end and shown
//    under other current liabilities: interest paid = interest of the year + opening accrued - closing accrued.
//  - A term loan is repaid in yearly instalments on 31 March; the instalment due within twelve months is a current
//    maturity, shown under short-term borrowings (Schedule III, 2021). Loans repaid = (long-term part + current
//    maturities) at the start + new loans - the same at the end.
// ===============================================================================================================

/** Dates on which debentures are redeemed, with the months of the year for which the debentures redeemed carried interest. */
const REDEEM_DATES: [string, number][] = [['30 June 2025', 3], ['30 September 2025', 6], ['31 December 2025', 9]];
const ACCRUED_DATES = 'Interest on debentures is payable half-yearly on 30 June and 31 December, so the interest for January to March is accrued at each year end.';
const PAID_DATES = 'Interest on debentures is paid half-yearly on 30 September and 31 March, so none is outstanding at either year end.';
const ACCRUED = 'Interest accrued on debentures';
const TERM_LOANS = 'Term loans from banks';
const CURRENT_MATURITIES = 'Current maturities of long-term borrowings';
const LOAN_INTEREST_PAID = 'Interest on term loans, paid during the year';
const NEW_LOAN = 'A new term loan of';
const MATURITY_NOTE = 'The term loans are repaid in yearly instalments on 31 March; the instalments due within twelve months are shown as current maturities under short-term borrowings.';
const H_BOARD = {
  redeem: [
    'The cash paid to redeem debentures is money returned to lenders: an outflow of financing activities.',
    'Interest on the debentures redeemed runs from 1 April only to the date of redemption; on the rest it runs for the whole year.',
  ],
  accrued: [
    'Treat the interest like the provision for tax: opening accrued + interest of the year - interest paid = closing accrued.',
    'Interest paid = interest of the year + opening accrued - closing accrued. The interest of the year is added back under operating activities; only the payment is a financing outflow.',
  ],
  maturities: [
    'Current maturities of long-term borrowings are still a part of those loans: they are only shown under short-term borrowings.',
    'Add the long-term part and the current maturities at each date. Loans repaid = total at the start + new loans - total at the end.',
  ],
  board: [
    'Read the notes first: they split each figure of the balance sheet into its parts.',
    'Work the sections in turn: profit before tax from the Surplus, then the asset accounts, then the capital, the debentures and the loans with their interest.',
  ],
};
/** "nil" or "₹a" on each balance sheet date, as a line of data gives it; nil as 0. */
const PAIR = new RegExp(`(nil|₹[\\d,]+) on ${Y0}, (nil|₹[\\d,]+) on ${Y1}`);
const figureOf = (t: string): number => (t === 'nil' ? 0 : Number(t.slice(1).replace(/,/g, '')));
/** Every line of data with a figure on each of the two dates, by its label. */
const pairsIn = (data: string): Map<string, [number, number]> =>
  new Map(
    data.split('\n').flatMap((l): [string, [number, number]][] => {
      const m = PAIR.exec(l);
      return m && l.includes(': ') ? [[l.slice(0, l.indexOf(': ')), [figureOf(m[1]), figureOf(m[2])]]] : [];
    }),
  );
/** The figure after some words in the data (NaN when the words are not there). */
const after = (data: string, words: string): number => figureAfter(data, words);

/** The debentures, the term loans, the shares and the dividend of a year, with the board items in them. */
interface BoardWant {
  redeem: boolean;
  accrued: boolean;
  loan: 'none' | 'old' | 'new';
  shares: 'none' | 'par' | 'premium';
}
interface BoardLoan {
  inst: number;
  l0: number;
  c0: number;
  l1: number;
  c1: number;
  fresh: number;
  date: string;
  repaid: number;
  interest: number;
}
interface BoardFinance {
  rate: number;
  debOpen: number;
  redeemed: number;
  date: string;
  months: number;
  accrued: boolean;
  a0: number;
  a1: number;
  /** Interest on debentures for the year (charged to profit), and what was paid of it. */
  charge: number;
  paid: number;
  loan: BoardLoan | null;
  capOpen: number;
  capUp: number;
  premOpen: number;
  premUp: number;
  prev: number;
  cur: number;
}
/** `small` for a company whose whole balance sheet is shown: loans in proportion to what it owns. */
function drawBoardLoan(rng: Rng, fresh: boolean, small = false): BoardLoan {
  const inst = k(rng, 1, small ? 2 : 3, 1) * 100000;
  const n = rng.pick(small ? [4, 5] : [4, 5, 6]);
  // Part of a loan repaid before it fell due, in a third of the seeds: the next instalment stays as it was.
  const early = rng.int(0, 2) === 0 ? k(rng, 50000, inst - 50000, 50000) : 0;
  const freshInst = fresh ? k(rng, 1, 2, 1) * 100000 : 0;
  const freshTotal = freshInst * rng.pick([4, 5]);
  const [date, months] = rng.pick(ISSUE_DATES);
  const r = rng.pick([9, 10, 11]);
  return {
    inst,
    l0: (n - 1) * inst,
    c0: inst,
    l1: (n - 2) * inst - early + freshTotal - freshInst,
    c1: inst + freshInst,
    fresh: freshTotal,
    date,
    repaid: inst + early,
    interest: Math.round(((n * inst * r) / 100 + (freshTotal * r * months) / 1200) / 1000) * 1000,
  };
}
function drawBoardFinance(rng: Rng, want: BoardWant, capOpen: number, small = false): BoardFinance {
  const rate = rng.pick([8, 9, 10, 12]);
  const debOpen = k(rng, small ? 2 : 3, small ? 5 : 8, 1) * 100000;
  const redeemed = want.redeem ? k(rng, 1, Math.min(3, debOpen / 100000 - 1), 1) * 100000 : 0;
  const [date, months] = want.redeem ? rng.pick(REDEEM_DATES) : ['', 0];
  const close = debOpen - redeemed;
  // Three months accrued at each year end on what is outstanding then.
  const a0 = want.accrued ? (debOpen * rate * 3) / 1200 : 0;
  const a1 = want.accrued ? (close * rate * 3) / 1200 : 0;
  const charge = (close * rate) / 100 + (redeemed * rate * months) / 1200;
  const f: BoardFinance = {
    rate, debOpen, redeemed, date, months, accrued: want.accrued, a0, a1, charge, paid: charge + a0 - a1,
    loan: want.loan === 'none' ? null : drawBoardLoan(rng, want.loan === 'new', small),
    capOpen, capUp: 0, premOpen: want.shares === 'premium' ? k(rng, 50000, 200000, 10000) : 0, premUp: 0, prev: 0, cur: 0,
  };
  issueShares(rng, f, want.shares, 0);
  return f;
}
/** Shares issued for cash during the year (none, at par or at a premium), at least `least` raised; and the dividends that follow. */
function issueShares(rng: Rng, f: BoardFinance, kind: BoardWant['shares'], least: number): void {
  const premium = kind === 'premium' ? rng.pick([10, 20, 25]) : 0;
  f.capUp = kind === 'none' ? 0 : Math.max(k(rng, 1, 4, 1), Math.ceil(least / (100000 + 1000 * premium))) * 100000;
  f.premUp = (f.capUp * premium) / 100;
  [f.prev, f.cur] = twoDividends(rng, f.capOpen, f.capOpen + f.capUp);
}
const BOARD_ROWS = {
  redeemed: 'Redemption of debentures',
  raised: 'Proceeds from new term loan',
  repaid: 'Repayment of term loans',
  loanInterest: 'Interest paid on term loans',
};
const debLabelOf = (f: Pick<BoardFinance, 'rate'>): string => `${f.rate}% Debentures`;
/** The rows of the financing activities of such a year, with the step that finds each. */
function boardFinanceFlows(f: BoardFinance): Flow[] {
  const close = f.debOpen - f.redeemed;
  const l = f.loan;
  const onRest = (close * f.rate) / 100;
  const onRedeemed = (f.redeemed * f.rate * f.months) / 1200;
  const interestWhy = [
    f.redeemed > 0
      ? `Interest on debentures for the year = ${f.rate}% of ${inr(close)} for the year + ${f.rate}% of ${inr(f.redeemed)} for the ${f.months} months to ${f.date} = ${inr(onRest)} + ${inr(onRedeemed)} = ${inr(f.charge)}.`
      : `Interest on debentures for the year = ${f.rate}% of ${inr(close)} = ${inr(f.charge)}.`,
    f.accrued
      ? `Interest paid = interest of the year + accrued at the start - accrued at the end = ${inr(f.charge)} + ${inr(f.a0)} - ${inr(f.a1)} = ${inr(f.paid)}: an outflow.`
      : 'None is outstanding at either year end, so all of it was paid: an outflow.',
  ].join(' ');
  return [
    ...(f.capUp > 0
      ? [
          {
            label: FINANCING_ROWS.shares,
            amt: f.capUp + f.premUp,
            why: f.premUp > 0
              ? `Equity Share Capital rose by ${inr(f.capUp)} and Securities Premium by ${inr(f.premUp)}, all received in cash: proceeds of ${inr(f.capUp + f.premUp)}, an inflow.`
              : `Equity Share Capital rose by ${inr(f.capUp)}, issued at par for cash: an inflow.`,
          },
        ]
      : []),
    ...(f.redeemed > 0
      ? [{ label: BOARD_ROWS.redeemed, also: ['Debentures redeemed'], amt: -f.redeemed, why: `${debLabelOf(f)} fell from ${inr(f.debOpen)} to ${inr(close)}: ${inr(f.redeemed)} was paid to the debenture holders on redemption at par, an outflow.` }]
      : []),
    ...(l && l.fresh > 0 ? [{ label: BOARD_ROWS.raised, amt: l.fresh, why: `The new term loan of ${inr(l.fresh)} taken on ${l.date} is an inflow.` }] : []),
    ...(l
      ? [
          {
            label: BOARD_ROWS.repaid,
            amt: -l.repaid,
            why: `Term loans with their current maturities: ${inr(l.l0)} + ${inr(l.c0)} = ${inr(l.l0 + l.c0)} at the start and ${inr(l.l1)} + ${inr(l.c1)} = ${inr(l.l1 + l.c1)} at the end. Repaid = ${inr(l.l0 + l.c0)}${l.fresh > 0 ? ` + new loan ${inr(l.fresh)}` : ''} - ${inr(l.l1 + l.c1)} = ${inr(l.repaid)}: an outflow.`,
          },
        ]
      : []),
    { label: FINANCING_ROWS.debInterest, also: [OP_ITEMS.debentures.row], amt: -f.paid, why: interestWhy },
    ...(l ? [{ label: BOARD_ROWS.loanInterest, also: ['Interest paid on bank loan'], amt: -l.interest, why: `Interest of ${inr(l.interest)} was paid on the term loans: the cost of finance, an outflow of financing activities for a company that is not a financing company.` }] : []),
    {
      label: FINANCING_ROWS.dividend,
      also: [FINANCING_ROWS.final],
      amt: -f.prev,
      why: `The dividend proposed for ${PREV}, ${inr(f.prev)}, was declared and paid in ${YEAR}: an outflow.${f.cur > 0 ? ` The dividend proposed for ${YEAR}, ${inr(f.cur)}, is not accounted for until it is declared.` : ''}`,
    },
  ];
}
/** The sentences of additional information about the financing. */
function boardFinanceNotes(f: BoardFinance): string[] {
  const l = f.loan;
  return [
    f.cur > 0 ? proposed(f.prev, f.cur) : `Proposed dividend: ${inr(f.prev)} for ${PREV}; no dividend is proposed for ${YEAR}`,
    ...(l ? [one(LOAN_INTEREST_PAID, l.interest)] : []),
    [
      ...(f.capUp > 0 ? [f.premUp > 0 ? 'New equity shares were issued for cash at a premium: show what the issue brought in as one figure.' : 'New equity shares were issued at par for cash.'] : []),
      ...(f.redeemed > 0 ? [`Debentures of ${inr(f.redeemed)} were redeemed at par on ${f.date}; no debentures were issued during the year.`] : ['No debentures were issued or redeemed during the year.']),
      f.accrued ? ACCRUED_DATES : PAID_DATES,
      ...(l ? [MATURITY_NOTE, l.fresh > 0 ? `${NEW_LOAN} ${inr(l.fresh)} was taken on ${l.date}; no other loan was taken.` : 'No new loan was taken during the year.'] : []),
      `The dividend proposed for ${PREV} was declared and paid during ${YEAR}; no interim dividend was paid.`,
    ].join(' '),
  ];
}
/** The financing flows the data tells of, found as a student finds them: for `verify`. Labels with or without a note number. */
function boardFinanceIn(data: string, pairs: Map<string, [number, number]>): [string, number][] {
  const get = (name: string): [number, number] => [...pairs].find(([label]) => label === name || label.endsWith(`, ${name}`) || label.startsWith(`${name} (Note`))?.[1] ?? [0, 0];
  const rate = Number(/(\d+)% Debentures/.exec(data)?.[1]);
  const [d0, d1] = get(`${rate}% Debentures`);
  const months = REDEEM_DATES.find(([date]) => data.includes(`redeemed at par on ${date}`))?.[1] ?? 0;
  const [a0, a1] = get(ACCRUED);
  const interest = (d1 * rate * 12 + (d0 - d1) * rate * months) / 1200 + a0 - a1;
  const [l0, l1] = get(TERM_LOANS);
  const [c0, c1] = get(CURRENT_MATURITIES);
  const fresh = data.includes(NEW_LOAN) ? after(data, NEW_LOAN) : 0;
  const [cap0, cap1] = get(SHARE_CAPITAL);
  const [p0, p1] = get(PREMIUM);
  const found: [string, number][] = [
    [FINANCING_ROWS.shares, cap1 - cap0 + p1 - p0],
    [BOARD_ROWS.redeemed, d1 - d0],
    [BOARD_ROWS.raised, fresh],
    [BOARD_ROWS.repaid, l1 + c1 - (l0 + c0) - fresh],
    [FINANCING_ROWS.debInterest, -interest],
    [BOARD_ROWS.loanInterest, -(data.includes(LOAN_INTEREST_PAID) ? after(data, `${LOAN_INTEREST_PAID}: `) : 0)],
    [FINANCING_ROWS.dividend, -after(data, 'Proposed dividend: ')],
  ];
  return found.filter(([, amt]) => amt !== 0);
}
/** The balances of the financing, as extracts of the two balance sheets. */
const boardFinanceBalances = (f: BoardFinance): string[] => [
  ...(f.capUp > 0 ? [two(SHARE_CAPITAL, f.capOpen, f.capOpen + f.capUp)] : []),
  ...(f.premOpen > 0 ? [two(PREMIUM, f.premOpen, f.premOpen + f.premUp)] : []),
  two(debLabelOf(f), f.debOpen, f.debOpen - f.redeemed),
  ...(f.accrued ? [two(`${ACCRUED} (other current liabilities)`, f.a0, f.a1)] : []),
  ...(f.loan ? [two(`${TERM_LOANS} (long-term borrowings)`, f.loan.l0, f.loan.l1), two(`${CURRENT_MATURITIES} (short-term borrowings)`, f.loan.c0, f.loan.c1)] : []),
];
/** The labels of the balances above, without what is in brackets, for `boardFinanceIn`. */
const sectionPairs = (data: string): Map<string, [number, number]> => new Map([...pairsIn(data)].map(([label, v]): [string, [number, number]] => [label.replace(/ \((other current liabilities|long-term borrowings|short-term borrowings)\)$/, ''), v]));

// cf-fin-debentures-redeemed: the cash paid in a year on debentures some of which were redeemed: the amount redeemed
// and the interest, which on the debentures redeemed runs only to the date of redemption (medium)
const finDebenturesRedeemed = numericTemplate({
  id: 'cf-fin-debentures-redeemed', topicId: T, conceptId: 'cf-financing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const rate = rng.pick([8, 9, 10, 12]);
    const open = k(rng, 3, 10, 1) * 100000;
    const redeemed = k(rng, 1, Math.min(4, open / 100000 - 1), 1) * 100000;
    const [date, months] = rng.pick(REDEEM_DATES);
    const onRest = ((open - redeemed) * rate) / 100;
    const onRedeemed = (redeemed * rate * months) / 1200;
    const answer = redeemed + onRest + onRedeemed;
    const n = numeric(answer, [
      [redeemed + (open * rate) / 100, `Charged a full year's interest on the debentures redeemed on ${date}.`],
      [redeemed + onRest, 'Left out the interest on the debentures redeemed for the months before they were redeemed.'],
      [onRest + onRedeemed, 'Left out the cash paid to redeem the debentures, which is an outflow too.'],
      [redeemed + onRest + (redeemed * rate * (12 - months)) / 1200, 'Counted the months after the redemption instead of the months before it.'],
      [redeemed, 'Showed only the redemption and left out the interest paid.'],
    ]);
    return n && {
      prompt: ask(`Find the total cash that ${co} ${NF} paid on its debentures during ${YEAR}: the amount paid to redeem them and the interest paid on them, both outflows of financing activities.`, [
        two(`${rate}% Debentures`, open, open - redeemed),
        `Debentures of ${inr(redeemed)} were redeemed at par on ${date}; none were issued during the year. ${PAID_DATES}`,
      ]),
      ...n,
      explanation: [
        `Redemption: ${rate}% Debentures fell from ${inr(open)} to ${inr(open - redeemed)}, so ${inr(redeemed)} was paid to redeem them.`,
        `Interest on the ${inr(open - redeemed)} still outstanding, for the whole year: ${rate}% of ${inr(open - redeemed)} = ${inr(onRest)}.`,
        `Interest on the ${inr(redeemed)} redeemed, from 1 April to ${date}, ${months} months: ${inr(redeemed)} x ${rate}% x ${months}/12 = ${inr(onRedeemed)}.`,
        `Cash paid = ${inr(redeemed)} + ${inr(onRest)} + ${inr(onRedeemed)} = ${inr(answer)}. The statement shows it as two rows: redemption of debentures ${inr(redeemed)} and interest paid ${inr(onRest + onRedeemed)}.`,
      ],
      hints: H_BOARD.redeem,
    };
  },
  verify: (q) => {
    const rate = Number(/(\d+)% Debentures/.exec(q.prompt)?.[1]);
    const [open, close, stated] = amountsIn(q.prompt.split('\n').slice(1).join('\n'));
    const months = REDEEM_DATES.find(([date]) => q.prompt.includes(`at par on ${date}`))?.[1] ?? NaN;
    // Month by month: what is left for twelve months, what was redeemed for the months before its redemption.
    return stated === open - close && ans(q) * 1200 === (open - close) * 1200 + close * rate * 12 + (open - close) * rate * months;
  },
});

// cf-interest-paid-outstanding: interest paid on debentures when interest is accrued at the year ends: the charge of
// the year, plus the interest accrued at the start, less that accrued at the end. Debentures are issued or redeemed
// on 1 April, or the half-yearly interest due on 31 March is left unpaid (medium)
const interestPaidOutstanding = numericTemplate({
  id: 'cf-interest-paid-outstanding', topicId: T, conceptId: 'cf-financing', difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const rate = rng.pick([8, 9, 10, 12]);
    const d0 = k(rng, 3, 8, 1) * 100000;
    const way = rng.pick(['issued', 'redeemed', 'unpaid'] as const);
    const change = way === 'unpaid' ? 0 : k(rng, 1, 2, 1) * 100000;
    const d1 = way === 'issued' ? d0 + change : d0 - change;
    const charge = (d1 * rate) / 100;
    const [a0, a1] = way === 'unpaid' ? [0, (d1 * rate) / 200] : [(d0 * rate * 3) / 1200, (d1 * rate * 3) / 1200];
    const answer = charge + a0 - a1;
    const n = numeric(answer, [
      [charge, 'Took the interest of the year as the interest paid, without adjusting what was accrued at the two dates.'],
      [charge - a0 + a1, 'Turned the adjustment round: added the closing accrued interest and deducted the opening one.'],
      [charge + a1, 'Added the interest accrued at the end of the year, which is still unpaid.'],
      [(d0 * rate) / 100 + a0 - a1, 'Worked the interest of the year on the debentures of the start of the year.'],
    ]);
    const story = way === 'issued'
      ? `Debentures of ${inr(change)} were issued for cash on 1 April 2025. ${ACCRUED_DATES}`
      : way === 'redeemed'
        ? `Debentures of ${inr(change)} were redeemed at par on 1 April 2025, with the interest accrued on them. ${ACCRUED_DATES}`
        : `Interest is payable half-yearly on 30 September and 31 March. The half-yearly interest due on 31 March 2026 had not been paid by the year end.`;
    return n && {
      prompt: ask(`Find the interest on debentures paid by ${co} ${NF} during ${YEAR}, which is shown under financing activities.`, [
        two(`${rate}% Debentures`, d0, d1),
        twoOrNil(`${way === 'unpaid' ? 'Interest due on debentures but unpaid' : ACCRUED} (other current liabilities)`, a0, a1),
        story,
      ]),
      ...n,
      explanation: [
        `Interest of the year = ${rate}% of ${inr(d1)}${way === 'unpaid' ? '' : ', the debentures outstanding all year'} = ${inr(charge)}. This is the figure added back under operating activities.`,
        `Interest paid = interest of the year + outstanding at the start - outstanding at the end = ${inr(charge)} + ${inr(a0)} - ${inr(a1)} = ${inr(answer)}.`,
        `${inr(answer)} is the outflow under financing activities; the ${inr(a1)} still owed stays under other current liabilities.`,
      ],
      hints: H_BOARD.accrued,
    };
  },
  verify: (q) => {
    const rate = Number(/(\d+)% Debentures/.exec(q.prompt)?.[1]);
    const pairs = [...pairsIn(q.prompt)];
    const [, close] = pairs.find(([label]) => label.endsWith('Debentures'))?.[1] ?? [NaN, NaN];
    const [a0, a1] = pairs.find(([label]) => label.includes('other current liabilities'))?.[1] ?? [NaN, NaN];
    return ans(q) * 100 === close * rate + (a0 - a1) * 100;
  },
});

// cf-loan-current-maturities: term loans repaid in a year, from the long-term borrowings and the current maturities
// under short-term borrowings at the two dates, with a new loan taken or part of a loan repaid early (complex)
const loanCurrentMaturities = numericTemplate({
  id: 'cf-loan-current-maturities', topicId: T, conceptId: 'cf-financing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const way = rng.pick(['new', 'early', 'both'] as const);
    let l = drawBoardLoan(rng, way !== 'early');
    // A loan repaid early in every seed that takes no new loan, so that the answer is never just last year's current maturities.
    for (let i = 0; way === 'early' && l.repaid === l.inst && i < 20; i++) l = drawBoardLoan(rng, false);
    if (way !== 'new' && l.repaid === l.inst) return null;
    const [t0, t1] = [l.l0 + l.c0, l.l1 + l.c1];
    const n = numeric(l.repaid, [
      [l.l0 - l.l1, 'Took only the fall in the long-term borrowings and left out the current maturities, which are a part of the same loans.'],
      [t0 - t1, 'Left out the new loan taken during the year: the loans fell by less because new money was borrowed.'],
      [l.c0, 'Took the current maturities of last year as the whole repayment; the balances show that more was repaid.'],
      [l.l0 + l.fresh - l.l1, 'Left the current maturities out of the loans at both dates.'],
      [l.l0 + l.c0 + l.fresh - l.l1, 'Left the current maturities out of the loans at the end of the year only.'],
    ]);
    return n && {
      prompt: ask(`Find the term loans repaid by ${co} ${NF} during ${YEAR}, which is shown as an outflow of financing activities.`, [
        two(`${TERM_LOANS} (long-term borrowings)`, l.l0, l.l1),
        two(`${CURRENT_MATURITIES} (short-term borrowings)`, l.c0, l.c1),
        `${MATURITY_NOTE} ${l.fresh > 0 ? `${NEW_LOAN} ${inr(l.fresh)} was taken on ${l.date}; no other loan was taken.` : 'No new loan was taken during the year.'}`,
      ]),
      ...n,
      explanation: [
        'Current maturities are the instalments of the same term loans that fall due within twelve months: add them to the long-term part.',
        `At the start: ${inr(l.l0)} + ${inr(l.c0)} = ${inr(t0)}. At the end: ${inr(l.l1)} + ${inr(l.c1)} = ${inr(t1)}.`,
        `Loans repaid = ${inr(t0)}${l.fresh > 0 ? ` + new loan ${inr(l.fresh)}` : ''} - ${inr(t1)} = ${inr(l.repaid)}.`,
        ...(l.fresh > 0 ? [`The new loan, ${inr(l.fresh)}, is a separate inflow of financing activities.`] : []),
        'The change in current maturities is not a working capital change: it is a part of the borrowings.',
      ],
      hints: H_BOARD.maturities,
    };
  },
  verify: (q) => {
    const pairs = [...pairsIn(q.prompt)];
    const [l0, l1] = pairs.find(([label]) => label.startsWith(TERM_LOANS))?.[1] ?? [NaN, NaN];
    const [c0, c1] = pairs.find(([label]) => label.startsWith(CURRENT_MATURITIES))?.[1] ?? [NaN, NaN];
    const fresh = q.prompt.includes(NEW_LOAN) ? figureAfter(q.prompt, NEW_LOAN) : 0;
    return ans(q) === l0 + c0 + fresh - l1 - c1;
  },
});

/** A mix of board items for a financing section: debentures always, redeemed in most seeds; never all four at their least. */
function boardWant(rng: Rng): BoardWant {
  for (;;) {
    const want: BoardWant = {
      redeem: rng.int(0, 3) > 0,
      accrued: rng.int(0, 1) === 0,
      loan: rng.pick(['none', 'old', 'new', 'new'] as const),
      shares: rng.pick(['none', 'par', 'premium'] as const),
    };
    if (want.redeem || want.accrued || want.loan !== 'none') return want;
  }
}

// cf-financing-board: net cash from or used in financing activities with the board items: debentures redeemed with
// part-year interest, interest accrued, term loans with current maturities, shares and the dividend (complex)
const financingBoard = numericTemplate({
  id: 'cf-financing-board', topicId: T, conceptId: 'cf-financing', difficulty: 'complex', unit: 'rupees',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const f = drawBoardFinance(rng, boardWant(rng), k(rng, 10, 25, 1) * 100000);
    const flows = boardFinanceFlows(f);
    const net = sum(flows.map((x) => x.amt));
    if (Math.abs(net) < 20000) return null;
    const l = f.loan;
    const alt = (v: number, why: string): [number, string] => [v * net > 0 ? Math.abs(v) : 0, why];
    const n = numeric(Math.abs(net), [
      ...(f.accrued ? [alt(net + f.paid - f.charge, 'Took the interest of the year as paid, without adjusting the interest accrued at the two dates.')] : []),
      ...(f.redeemed > 0 ? [alt(net + f.redeemed, 'Left out the debentures redeemed, an outflow.'), alt(net + f.paid - (f.debOpen * f.rate) / 100 - f.a0 + f.a1, 'Charged a full year\'s interest on the debentures redeemed during the year.')] : []),
      ...(l ? [alt(net + l.repaid - (l.l0 - l.l1 + l.fresh), 'Found the repayment from the long-term borrowings alone and left out the current maturities.')] : []),
      alt(net + f.prev - f.cur, 'Showed the dividend proposed for the current year as paid; it is the previous year\'s proposed dividend that was paid.'),
      ...(f.premUp > 0 ? [alt(net - f.premUp, 'Left out the securities premium received on the shares.')] : []),
    ]);
    return n && {
      prompt: ask(`From these balances and other information of ${co} ${NF}, find the net cash ${net > 0 ? 'from' : 'used in'} financing activities for ${YEAR}.`, [...boardFinanceBalances(f), ...boardFinanceNotes(f)]),
      ...n,
      explanation: [...flows.map((x) => x.why), `Net cash ${net > 0 ? 'from' : 'used in'} financing activities = ${chain(flows.map((x) => x.amt))} = ${shown(net)}.`],
      hints: H_BOARD.board,
    };
  },
  verify: (q) => {
    const net = sum(boardFinanceIn(q.prompt, sectionPairs(q.prompt)).map(([, amt]) => amt));
    return ans(q) === Math.abs(net) && q.prompt.includes(net > 0 ? 'net cash from financing' : 'net cash used in financing');
  },
});

// cf-fmt-financing-board: Cash Flow from Financing Activities with the board items, from extracts of the two balance
// sheets and additional information: debentures redeemed (interest to the date of redemption), interest accrued,
// term loans with current maturities, a new loan, shares and the dividend (medium)
const fmtFinancingBoard = statementTemplate({
  id: 'cf-fmt-financing-board', topicId: T, conceptId: 'cf-formats', difficulty: 'medium',
  generate: (rng) => {
    const co = rng.pick(COMPANIES);
    const f = drawBoardFinance(rng, boardWant(rng), k(rng, 10, 25, 1) * 100000);
    const flows = boardFinanceFlows(f);
    const net = sum(flows.map((x) => x.amt));
    if (net === 0 || flows.length < 3) return null;
    return {
      task: `Prepare the statement of Cash Flow from Financing Activities of ${co} for the year ended ${Y1}. ${SIGN_RULE}`,
      data: [`${co}, ${TRADE_OF[co]}, is not a financing company. From its balance sheets and other information:`, ...boardFinanceBalances(f), ...boardFinanceNotes(f)].join('\n'),
      title: `Cash Flow from Financing Activities of ${co} for the year ended ${Y1}`,
      columns: CF_COLUMNS,
      rows: [{ heading: HEAD_C }, ...flows.map(flowRow), { subtotal: NET_C, amount: rupees(net), sum: 'section' }],
      distractors: [
        'Increase in current maturities of long-term borrowings',
        'Increase in interest accrued on debentures',
        'Proposed dividend of the current year',
        'Interest on debentures for the year',
        ...(f.redeemed > 0 ? [] : [BOARD_ROWS.redeemed]),
        ...(f.capUp > 0 ? [] : [FINANCING_ROWS.shares]),
      ],
      explanation: [...flows.map((x) => x.why), `${NET_C.replace(' (used in)', '')} = ${chain(flows.map((x) => x.amt))} = ${shown(net)}${net < 0 ? `, that is, net cash of ${inr(-net)} used in financing activities` : ''}.`],
      hints: H_BOARD.board,
    };
  },
  verify: (q) => {
    const expected = boardFinanceIn(q.data, sectionPairs(q.data));
    return rowsAre(q.rows, expected) && subtotalsOf(q).get(NET_C) === sum(expected.map(([, amt]) => amt));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The whole statement from balance sheets with notes to accounts, in three kinds:
//  - 'notes': debentures redeemed during the year with the interest accrued at the year ends, a transfer to General
//    Reserve in half the seeds, and term loans with current maturities in half;
//  - 'investments': goodwill bought (and some written off), current investments that are NOT cash equivalents, and
//    an income from them in half the seeds;
//  - 'loss': a year with a loss before tax, no provision for tax made, last year's provision paid.
// The opening balance sheet is drawn so that it agrees; the closing one is what the transactions of the year leave,
// each moved through the books as a debit and a credit (as `cashFlowStatement` does), so that it agrees too.
// ---------------------------------------------------------------------------------------------------------------

type BoardKind = 'notes' | 'investments' | 'loss';
const GENERAL_RESERVE = 'General Reserve';
const GOODWILL_LINE = 'Intangible assets (goodwill)';
const CURRENT_INV = 'Current investments';
const CASH_LINE = 'Cash and cash equivalents';
const GOODWILL_OFF = 'Goodwill written off during the year:';
const CURRENT_INV_NOTE = 'The current investments are shares of other companies, held as investments to be sold within the coming year: they are not cash equivalents. None were sold during the year.';
const LOSS_TAX = 'No provision for tax was made for the year, as the company made a loss; the provision of the previous year was paid in full.';
const NOTHING_ON_TAX = 'Nothing more is known about tax.';
const BOARD_STATEMENT_ROWS = {
  goodwillOff: 'Goodwill written off',
  goodwillBought: 'Purchase of goodwill',
  investBought: 'Purchase of current investments',
};

function boardStatement(rng: Rng, kind: BoardKind): StatementParts | null {
  const co = rng.pick(COMPANIES);
  const m = drawMachineYear(rng, rng.int(0, 1) === 0, true);
  const style = rng.pick(['price', 'result'] as const);
  const goodwill = kind === 'investments' ? (() => { const off = k(rng, 20000, 60000, 10000); const open = off + k(rng, 50000, 200000, 10000); const bought = k(rng, 1, 3, 1) * 100000; return { open, off, bought, close: open - off + bought }; })() : null;
  const inv = kind === 'investments' ? (() => { const open = k(rng, 50000, 200000, 10000); const bought = k(rng, 50000, 150000, 10000); return { open, bought, close: open + bought }; })() : null;
  const incomes: [string, number][] = kind === 'investments' && rng.int(0, 1) === 0 ? [['dividend', k(rng, 5000, 20000, 5000)]] : [];
  const wc = drawWc(rng, ['Inventories', 'Trade receivables', PAYABLES]);
  const cashOpen = k(rng, 80000, 300000, 10000);
  const assetsOpen = m.open - m.depOpen + (goodwill?.open ?? 0) + (inv?.open ?? 0) + sum(wc.filter((b) => b.kind === 'A').map((b) => b.open)) + cashOpen;
  // The profit after tax, in proportion to what the company owns, and the tax; or, in a year of loss, the loss.
  const profitAfterTax = Math.round((assetsOpen * rng.pick([8, 10, 12])) / 100 / 10000) * 10000;
  const tax = kind === 'loss'
    ? (() => { const open = k(rng, 20000, 80000, 5000); return { made: 0, open, paid: open, close: 0 }; })()
    : drawTax(rng, profitAfterTax, rng.pick(['closing', 'made'] as const));
  if (tax.open < 15000 || tax.paid <= 0 || (kind !== 'loss' && tax.close <= 0)) return null;
  const taxWay = kind === 'loss' ? 'loss' : tax.paid === tax.open && tax.made === tax.close ? 'closing' : 'made';
  const npbt = kind === 'loss' ? -k(rng, 40000, 200000, 10000) : profitAfterTax + tax.made;
  const transfer = kind === 'notes' && rng.int(0, 1) === 0 ? k(rng, 20000, 100000, 10000) : 0;

  // The financing: debentures redeemed with interest accrued ('notes'), redeemed or not ('investments', 'loss').
  const f = drawBoardFinance(
    rng,
    {
      redeem: kind === 'notes' || rng.int(0, 1) === 0,
      accrued: kind === 'notes',
      loan: kind === 'investments' ? 'none' : rng.pick(['none', 'old', 'new'] as const),
      shares: rng.int(0, 2) === 0 ? rng.pick(['par', 'premium'] as const) : 'none',
    },
    0,
    true,
  );
  // The opening balance sheet: the Surplus is drawn, the capital is a round share of what is left of the funds after
  // the borrowings, and General Reserve is the rest. The dividends follow from the capital.
  const funds = assetsOpen - sum(wc.filter((b) => b.kind === 'L').map((b) => b.open)) - tax.open - f.a0;
  const borrowedOpen = f.debOpen + (f.loan ? f.loan.l0 + f.loan.c0 : 0);
  const surplusOpen = kind === 'loss' ? k(rng, 250000, 500000, 10000) : k(rng, 100000, 300000, 10000);
  // A company that borrows much owns more machinery: the cost at both dates is raised alike, which moves no flow.
  const short = 900000 - (funds - borrowedOpen - f.premOpen - surplusOpen);
  const more = short > 0 ? Math.ceil(short / 50000) * 50000 + k(rng, 0, 300000, 50000) : 0;
  m.open += more;
  m.close += more;
  const free = funds + more - borrowedOpen - f.premOpen - surplusOpen;
  f.capOpen = Math.floor((free * rng.pick([60, 70, 80])) / 100 / 100000) * 100000;
  const reserveOpen = free - f.capOpen;
  if (f.capOpen < 500000 || reserveOpen < 50000) return null;
  [f.prev, f.cur] = twoDividends(rng, f.capOpen, f.capOpen + f.capUp);
  const l = f.loan;
  const s = m.sale;
  const debCharge = f.charge;
  const loanInterest = l?.interest ?? 0;
  const adjusts: Flow[] = [
    { label: OP_ITEMS.depreciation.row, amt: m.charge, why: s ? `Accumulated depreciation: ${inr(m.depOpen)} + depreciation of the year - depreciation on the machine sold ${inr(s.accumulated)} = ${inr(m.depClose)}, so the depreciation of the year = ${inr(m.charge)}. It is ${NON_CASH}.` : `No machinery was sold, so the rise in accumulated depreciation, ${inr(m.depClose)} - ${inr(m.depOpen)} = ${inr(m.charge)}, is the depreciation of the year. It is ${NON_CASH}.` },
    ...(s ? [{ label: s.g > 0 ? OP_ITEMS.profit.row : OP_ITEMS.loss.row, amt: -s.g, why: `The machine sold had a book value of ${inr(s.cost)} - ${inr(s.accumulated)} = ${inr(s.book)} and fetched ${inr(s.price)}: a ${s.what} of ${inr(Math.abs(s.g))}, which is ${s.g > 0 ? OP_ITEMS.profit.why : OP_ITEMS.loss.why}.` }] : []),
    ...(goodwill ? [{ label: BOARD_STATEMENT_ROWS.goodwillOff, also: [OP_ITEMS.goodwill.row], amt: goodwill.off, why: `Goodwill written off, ${inr(goodwill.off)}, is ${NON_CASH}.` }] : []),
    { label: OP_ITEMS.debentures.row, also: OP_ITEMS.debentures.also, amt: debCharge, why: `Interest on debentures for the year, ${inr(debCharge)} (worked out under financing activities), is ${FINANCE_COST}. The charge is added back, whatever part of it was paid.` },
    ...(l ? [{ label: 'Interest on term loans', also: [OP_ITEMS.loan.row], amt: loanInterest, why: `Interest on the term loans, ${inr(loanInterest)}, is ${FINANCE_COST}.` }] : []),
    ...incomes.map(([key, amt]) => opFlow(OP_ITEMS[key], amt)),
  ];
  const part = operatingRows(npbt, adjusts, wc, tax.paid);
  const investing: Flow[] = [
    ...investingFlows(m, style, null, []),
    ...(goodwill ? [{ label: BOARD_STATEMENT_ROWS.goodwillBought, also: ['Goodwill bought'], amt: -goodwill.bought, why: `Goodwill: ${inr(goodwill.open)} - written off ${inr(goodwill.off)} + bought = ${inr(goodwill.close)}, so goodwill bought = ${inr(goodwill.close)} + ${inr(goodwill.off)} - ${inr(goodwill.open)} = ${inr(goodwill.bought)}: an outflow.` }] : []),
    ...(inv ? [{ label: BOARD_STATEMENT_ROWS.investBought, amt: -inv.bought, why: `The current investments are not cash equivalents, so buying them is an investing activity: they rose by ${inr(inv.close)} - ${inr(inv.open)} = ${inr(inv.bought)}, none being sold, an outflow.` }] : []),
    ...incomes.map(([key, amt]) => ({ label: OP_ITEMS[key].row, amt, why: `${OP_ITEMS[key].data}, ${inr(amt)}, is a return on an investment: an inflow of investing activities for a company that is not a financing company.` })),
  ];
  // A company short of cash issues shares for what it needs.
  const without = part.net + sum(investing.map((x) => x.amt)) + sum(boardFinanceFlows(f).map((x) => x.amt));
  if (cashOpen + without < 60000) issueShares(rng, f, rng.pick(['par', 'premium'] as const), 60000 - cashOpen - without);
  // A company that made a loss proposes no dividend for the year.
  if (kind === 'loss') f.cur = 0;
  const financing = boardFinanceFlows(f);
  const netB = sum(investing.map((x) => x.amt));
  const netC = sum(financing.map((x) => x.amt));
  const net = part.net + netB + netC;
  const cashClose = cashOpen + net;
  const rowsCount = part.rows.length + investing.length + financing.length + 4;
  if (part.op === 0 || part.cgo === 0 || part.net === 0 || netB === 0 || netC === 0 || net === 0 || cashClose < 40000 || cashClose > 900000 || rowsCount > 28) return null;

  const surplusClose = surplusOpen + (npbt - tax.made) - f.prev - transfer;
  if (surplusClose < 50000) return null;

  const debLabel = debLabelOf(f);
  const books: Books = new Map();
  const opens: [string, number][] = [
    [SHARE_CAPITAL, -f.capOpen], [PREMIUM, -f.premOpen], [GENERAL_RESERVE, -reserveOpen], [SURPLUS, -surplusOpen], [debLabel, -f.debOpen], [TERM_LOANS, -(l ? l.l0 + l.c0 : 0)],
    ...wc.map((b): [string, number] => [b.label, b.kind === 'A' ? b.open : -b.open]), [ACCRUED, -f.a0], [TAX_PROVISION, -tax.open],
    [MACHINERY, m.open], [ACC_DEP, -m.depOpen], [GOODWILL_LINE, goodwill?.open ?? 0], [CURRENT_INV, inv?.open ?? 0], [CASH_LINE, cashOpen],
  ];
  for (const [line, balance] of opens) if (balance !== 0) books.set(line, balance);
  const opening = new Map(books);
  moved(books, CASH_LINE, SURPLUS, part.op);
  for (const b of wc) moved(books, b.close > b.open === (b.kind === 'A') ? b.label : CASH_LINE, b.close > b.open === (b.kind === 'A') ? CASH_LINE : b.label, Math.abs(b.close - b.open));
  moved(books, SURPLUS, ACC_DEP, m.charge);
  moved(books, MACHINERY, CASH_LINE, m.bought);
  if (s) {
    moved(books, CASH_LINE, MACHINERY, s.price);
    moved(books, ACC_DEP, MACHINERY, s.accumulated);
    moved(books, s.g > 0 ? MACHINERY : SURPLUS, s.g > 0 ? SURPLUS : MACHINERY, Math.abs(s.g));
  }
  if (goodwill) {
    moved(books, SURPLUS, GOODWILL_LINE, goodwill.off);
    moved(books, GOODWILL_LINE, CASH_LINE, goodwill.bought);
  }
  if (inv) moved(books, CURRENT_INV, CASH_LINE, inv.bought);
  for (const [, amt] of incomes) moved(books, CASH_LINE, SURPLUS, amt);
  moved(books, SURPLUS, CASH_LINE, f.paid);
  if (f.charge > f.paid) moved(books, SURPLUS, ACCRUED, f.charge - f.paid);
  else moved(books, ACCRUED, SURPLUS, f.paid - f.charge);
  moved(books, SURPLUS, CASH_LINE, loanInterest);
  moved(books, SURPLUS, TAX_PROVISION, tax.made);
  moved(books, TAX_PROVISION, CASH_LINE, tax.paid);
  moved(books, SURPLUS, CASH_LINE, f.prev);
  moved(books, SURPLUS, GENERAL_RESERVE, transfer);
  moved(books, CASH_LINE, SHARE_CAPITAL, f.capUp);
  moved(books, CASH_LINE, PREMIUM, f.premUp);
  moved(books, debLabel, CASH_LINE, f.redeemed);
  if (l) {
    moved(books, CASH_LINE, TERM_LOANS, l.fresh);
    moved(books, TERM_LOANS, CASH_LINE, l.repaid);
  }
  if ((books.get(CASH_LINE) ?? 0) !== cashClose || (books.get(SURPLUS) ?? 0) !== -surplusClose || (books.get(TERM_LOANS) ?? 0) !== -(l ? l.l1 + l.c1 : 0)) return null;

  // The balance sheets as the board prints them: the face, each line with its note where it has parts, then the notes.
  const at = (books2: Books, line: string, sign: 1 | -1): number => sign * (books2.get(line) ?? 0);
  const both = (line: string, sign: 1 | -1): [number, number] => [at(opening, line, sign), at(books, line, sign)];
  let noteNo = 0;
  const notes: string[] = [];
  const face: string[] = [];
  const totals = [0, 0];
  /** A line of the face: its figure at the two dates, and its note, numbered in order, when it has parts. */
  const put = (label: string, parts: [string, [number, number]][]): void => {
    const figure: [number, number] = [0, 1].map((d) => sum(parts.map(([, v]) => v[d]))) as [number, number];
    if (figure[0] === 0 && figure[1] === 0) return;
    const shownParts = parts.filter(([, v]) => v[0] !== 0 || v[1] !== 0);
    if (shownParts.length > 1 || (shownParts.length === 1 && shownParts[0][0] !== label)) {
      noteNo += 1;
      face.push(twoOrNil(`${label} (Note ${noteNo})`, figure[0], figure[1]));
      for (const [name, v] of shownParts) notes.push(twoOrNil(`Note ${noteNo}, ${name}`, Math.abs(v[0]), Math.abs(v[1])));
    } else face.push(twoOrNil(label, figure[0], figure[1]));
    totals[0] += figure[0];
    totals[1] += figure[1];
  };
  face.push(SHEET_TOP);
  put(SHARE_CAPITAL, [[SHARE_CAPITAL, both(SHARE_CAPITAL, -1)]]);
  put('Reserves and surplus', [[PREMIUM, both(PREMIUM, -1)], [GENERAL_RESERVE, both(GENERAL_RESERVE, -1)], [SURPLUS, both(SURPLUS, -1)]]);
  put('Long-term borrowings', [[debLabel, both(debLabel, -1)], ...(l ? [[TERM_LOANS, [l.l0, l.l1]] as [string, [number, number]]] : [])]);
  if (l) put('Short-term borrowings', [[CURRENT_MATURITIES, [l.c0, l.c1]]]);
  put(PAYABLES, [[PAYABLES, both(PAYABLES, -1)]]);
  if (f.accrued) put('Other current liabilities', [[ACCRUED, both(ACCRUED, -1)]]);
  put('Short-term provisions', [[TAX_PROVISION, both(TAX_PROVISION, -1)]]);
  face.push(two('Total', totals[0], totals[1]));
  const equity = [...totals];
  totals[0] = totals[1] = 0;
  face.push(SHEET_ASSETS);
  const lessDep = both(ACC_DEP, -1);
  noteNo += 1;
  face.push(two(`Property, plant and equipment (Note ${noteNo})`, m.open - lessDep[0], (books.get(MACHINERY) ?? 0) - lessDep[1]));
  notes.push(two(`Note ${noteNo}, ${MACHINERY}`, m.open, books.get(MACHINERY) ?? 0), two(`Note ${noteNo}, ${LESS_DEP}`, lessDep[0], lessDep[1]));
  totals[0] += m.open - lessDep[0];
  totals[1] += (books.get(MACHINERY) ?? 0) - lessDep[1];
  for (const line of [GOODWILL_LINE, CURRENT_INV, 'Inventories', 'Trade receivables', CASH_LINE]) if (opening.has(line)) put(line, [[line, both(line, 1)]]);
  face.push(two('Total', totals[0], totals[1]));
  if (equity[0] !== totals[0] || equity[1] !== totals[1]) return null;

  const cashOf = (d: number): number => (d === 0 ? cashOpen : cashClose);
  const taxLine = taxWay === 'loss' ? LOSS_TAX : taxWay === 'closing' ? NOTHING_ON_TAX : one('Provision for tax made during the year', tax.made);
  const npbtWhy = `${NPBT} = change in Surplus (${inr(surplusClose)} - ${inr(surplusOpen)} = ${shown(surplusClose - surplusOpen)})${transfer > 0 ? ` + transfer to General Reserve ${inr(transfer)} (the rise in General Reserve)` : ''} + dividend of ${PREV} paid ${inr(f.prev)} + provision for tax made ${inr(tax.made)}${taxWay === 'closing' ? ' (the closing provision, as nothing more is known about tax)' : taxWay === 'loss' ? ' (none, in a year of loss)' : ''} = ${shown(npbt)}${npbt < 0 ? `, a net loss before tax of ${inr(-npbt)}, shown with a minus sign` : ''}.`;
  const taxStep = taxWay === 'loss'
    ? `No provision was made this year; the provision of ${inr(tax.open)} at the start was paid in full: income tax paid ${inr(tax.paid)}.`
    : taxPaidStep(tax, taxWay);
  return {
    task: `Prepare the Cash Flow Statement of ${co} for the year ended ${Y1} by the indirect method, as AS 3 (Revised) lays down. ${SIGN_RULE}`,
    data: [
      `${co}, ${TRADE_OF[co]}, is not a financing company. Its balance sheets on ${Y0} and on ${Y1}, with the notes to accounts:`,
      ...face,
      'Notes to accounts:',
      ...notes,
      SHEET_END,
      ...(s ? saleLines(m, style) : [NO_MACHINE_SOLD]),
      ...(goodwill ? [`${GOODWILL_OFF} ${inr(goodwill.off)}. The rest of the change in goodwill was paid for in cash.`] : []),
      ...(inv ? [CURRENT_INV_NOTE] : []),
      ...incomes.map(([key, amt]) => one(OP_ITEMS[key].data, amt)),
      ...(transfer > 0 ? [`${inr(transfer)} was transferred from the Surplus to General Reserve.`] : []),
      taxLine,
      ...boardFinanceNotes(f),
      `Every purchase and every sale of machinery was for cash.`,
    ].join('\n'),
    title: `Cash Flow Statement of ${co} for the year ended ${Y1}`,
    columns: CF_COLUMNS,
    rows: [
      { heading: HEAD_A },
      ...part.rows,
      { heading: HEAD_B },
      ...investing.map(flowRow),
      { subtotal: NET_B, amount: rupees(netB), sum: 'section' },
      { heading: HEAD_C },
      ...financing.map(flowRow),
      { subtotal: NET_C, amount: rupees(netC), sum: 'section' },
      { subtotal: NET_CHANGE, amount: rupees(net), sum: 'all' },
      { label: CASH_START, amount: rupees(cashOf(0)) },
    ],
    final: { label: CASH_END, amount: rupees(cashOf(1)) },
    distractors: [
      ...wc.map((b) => wcName(b, b.close < b.open)),
      'Increase in current maturities of long-term borrowings',
      'Increase in interest accrued on debentures',
      'Proposed dividend of the current year',
      'Transfer to General Reserve',
      ...(inv ? [] : [BOARD_STATEMENT_ROWS.investBought]),
      ...(f.redeemed > 0 ? [] : [BOARD_ROWS.redeemed]),
    ],
    explanation: [
      npbtWhy,
      ...part.steps,
      taxStep,
      `Net cash ${part.net > 0 ? 'from' : 'used in'} operating activities = ${shown(part.cgo)} - ${inr(tax.paid)} = ${shown(part.net)}.`,
      ...investing.map((x) => x.why),
      `Net cash ${netB > 0 ? 'from' : 'used in'} investing activities = ${chain(investing.map((x) => x.amt))} = ${shown(netB)}.`,
      ...financing.map((x) => x.why),
      `Net cash ${netC > 0 ? 'from' : 'used in'} financing activities = ${chain(financing.map((x) => x.amt))} = ${shown(netC)}.`,
      `Net ${net > 0 ? 'increase' : 'decrease'} in cash and cash equivalents = ${chain([part.net, netB, netC])} = ${shown(net)}.`,
      `${inr(cashOpen)} ${net > 0 ? '+' : '-'} ${inr(Math.abs(net))} = ${inr(cashClose)}, the cash and cash equivalents in the balance sheet on ${Y1}: the statement agrees.`,
    ],
    hints: H_BOARD.board,
  };
}

/**
 * The statement again from the data alone, as a student prepares it: both balance sheets added up and every note
 * agreeing with its line, the profit from the Surplus, General Reserve, the dividend and tax, the accounts balanced by
 * their missing figures, the financing from the notes, and the cash of the two balance sheets.
 */
function boardStatementHolds(q: StatementQuestion): boolean {
  const data = q.data;
  const pairs = pairsIn(data);
  const lines = data.split('\n');
  const half = (from: string, to: string): number[] => {
    const part = lines.slice(lines.indexOf(from) + 1, lines.indexOf(to)).map((l) => ({ label: l.slice(0, l.indexOf(': ')), at: pairs.get(l.slice(0, l.indexOf(': '))) ?? [NaN, NaN] }));
    const added = [0, 1].map((d) => sum(part.filter((l) => l.label !== 'Total').map((l) => l.at[d])));
    const total = part.find((l) => l.label === 'Total')?.at ?? [];
    return added.map((a, d) => (a === total[d] ? a : NaN));
  };
  const [equity, assets] = [half(SHEET_TOP, SHEET_ASSETS), half(SHEET_ASSETS, 'Notes to accounts:')];
  if (!(equity[0] === assets[0] && equity[1] === assets[1])) return false;
  // Every note adds up to its line of the face (accumulated depreciation is taken away).
  for (const [label, v] of pairs) {
    const n = / \(Note (\d+)\)$/.exec(label)?.[1];
    if (!n) continue;
    const items = [...pairs].filter(([name]) => name.startsWith(`Note ${n}, `));
    for (const d of [0, 1]) if (sum(items.map(([name, w]) => (name.endsWith(LESS_DEP) ? -1 : 1) * w[d])) !== v[d]) return false;
  }
  const get = (name: string): [number, number] => [...pairs].find(([label]) => label === name || label.endsWith(`, ${name}`))?.[1] ?? [0, 0];
  const up = (name: string): number => get(name)[1] - get(name)[0];
  const [t0, t1] = get(TAX_PROVISION);
  const made = data.includes(LOSS_TAX) ? 0 : data.includes(NOTHING_ON_TAX) ? t1 : after(data, 'Provision for tax made during the year: ');
  const paid = t0 + made - t1;
  const dividend = after(data, 'Proposed dividend: ');
  const npbt = up(SURPLUS) + up(GENERAL_RESERVE) + dividend + made;
  const soldLine = lines.find((l) => l.startsWith(SALE_START)) ?? '';
  const sold = soldLine ? salePriceIn(data) : null;
  const accumulated = sold ? figureAfter(soldLine, 'on which depreciation of') : 0;
  const result = sold ? sold.price - (sold.cost - accumulated) : 0;
  const goodwillOff = data.includes(GOODWILL_OFF) ? after(data, GOODWILL_OFF) : 0;
  const income = sum(INCOME_KEYS.map((key) => (data.includes(`${OP_ITEMS[key].data}: `) ? after(data, `${OP_ITEMS[key].data}: `) : 0)));
  const financing = boardFinanceIn(data, pairs);
  const interestCharged = (() => {
    const rate = Number(/(\d+)% Debentures/.exec(data)?.[1]);
    const [d0, d1] = get(`${rate}% Debentures`);
    const months = REDEEM_DATES.find(([date]) => data.includes(`redeemed at par on ${date}`))?.[1] ?? 0;
    return (d1 * rate * 12 + (d0 - d1) * rate * months) / 1200 + (data.includes(LOAN_INTEREST_PAID) ? after(data, `${LOAN_INTEREST_PAID}: `) : 0);
  })();
  const op = npbt + (up(LESS_DEP) + accumulated) - result + goodwillOff + interestCharged - income;
  const wcOf = (name: string, kind: 1 | -1): number => -kind * up(name);
  const cgo = op + wcOf('Inventories', 1) + wcOf('Trade receivables', 1) + wcOf(PAYABLES, -1);
  const netA = cgo - paid;
  const netB = -(up(MACHINERY) + (sold?.cost ?? 0)) + (sold?.price ?? 0) - (up(GOODWILL_LINE) + goodwillOff) - up(CURRENT_INV) + income;
  const netC = sum(financing.map(([, amt]) => amt));
  const cash = get(CASH_LINE);
  const totals = subtotalsOf(q);
  const headed = (heading: string): number => (q.lines ?? []).find((line) => 'heading' in line && line.heading === heading)?.at ?? NaN;
  return (
    totals.get(OP_PROFIT) === op && totals.get(CGO) === cgo && totals.get(NET_A) === netA && totals.get(NET_B) === netB && totals.get(NET_C) === netC &&
    totals.get(NET_CHANGE) === netA + netB + netC &&
    rowsAre(q.rows.slice(headed(HEAD_C), -1), financing) &&
    q.rows[0].amounts[0] === rupees(npbt) &&
    q.rows.at(-1)?.amounts[0] === rupees(cash[0]) && q.final?.amount === rupees(cash[1]) && cash[0] + netA + netB + netC === cash[1]
  );
}

const fmtStatementNotes = statementTemplate({
  id: 'cf-fmt-statement-notes', topicId: T, conceptId: 'cf-formats', difficulty: 'complex',
  generate: (rng) => boardStatement(rng, 'notes'),
  verify: boardStatementHolds,
});
const fmtStatementInvestments = statementTemplate({
  id: 'cf-fmt-statement-investments', topicId: T, conceptId: 'cf-formats', difficulty: 'complex',
  generate: (rng) => boardStatement(rng, 'investments'),
  verify: boardStatementHolds,
});
const fmtStatementLoss = statementTemplate({
  id: 'cf-fmt-statement-loss', topicId: T, conceptId: 'cf-formats', difficulty: 'complex',
  generate: (rng) => boardStatement(rng, 'loss'),
  verify: boardStatementHolds,
});

const boardItems: Template[] = [finDebenturesRedeemed, interestPaidOutstanding, loanCurrentMaturities, financingBoard];
const boardFormats: Template[] = [fmtFinancingBoard, fmtStatementNotes, fmtStatementInvestments, fmtStatementLoss];

const formats: Template[] = [fmtNpbt, fmtCashEquivalents, fmtOperating, fmtInvesting, fmtFinancing, fmtMachineryAccount, fmtAccumulatedDepreciation, fmtStatement];

// One-mark Assertion-Reason questions of the board. They stand on their own level and go into no mock paper and no
// Look back (`isAssertionReason`), so nothing that was served before moves.
const cfAssertionReason = factsTemplate({
  id: 'cf-assertion-reason', topicId: 'cash-flow-statement', conceptId: 'cf-classify', difficulty: 'medium',
  facts: assertionReasonFacts([
    {
      answer: 'both',
      assertion: 'Cash deposited into the bank is not shown in the Cash Flow Statement.',
      reason: 'Cash in hand and balances with banks are both cash and cash equivalents.',
      a: 'It is a movement within cash and cash equivalents.',
      r: 'AS 3 counts cash in hand and demand deposits with banks as cash.',
      link: 'R explains A: the total of cash and cash equivalents does not change, so there is no flow to show.',
    },
    {
      answer: 'both',
      assertion: 'Depreciation of ₹50,000 is added back to net profit before tax under operating activities.',
      reason: 'Depreciation is charged in arriving at the profit but takes no cash out.',
      a: 'It is added in finding operating profit before working capital changes.',
      r: 'It is a non-cash expense.',
      link: 'R explains A: the profit is lower by an amount that was never paid.',
    },
    {
      answer: 'both',
      assertion: 'An increase of ₹30,000 in trade receivables is deducted in finding cash from operations.',
      reason: 'Part of the revenue included in the profit has not yet been received in cash.',
      a: 'An increase in a current asset is deducted.',
      r: 'Sales on credit are in the profit before the money comes in.',
      link: 'R explains A: the profit is ₹30,000 ahead of the cash.',
    },
    {
      answer: 'both',
      assertion: 'For a financing company, interest received is shown under operating activities.',
      reason: 'Lending money is the principal revenue-producing activity of a financing company.',
      a: 'Interest paid, interest received and dividend received are operating items for it.',
      r: 'Its main business is lending or investing.',
      link: 'R explains A: income from the main business is operating.',
    },
    {
      answer: 'both',
      assertion: 'Machinery bought by issuing shares to the vendor is not shown in the Cash Flow Statement.',
      reason: 'No cash comes in or goes out on such a transaction.',
      a: 'It is a non-cash transaction.',
      r: 'Shares are given in place of money.',
      link: 'R explains A: a statement of cash flows has nothing to show where no cash moves.',
    },
    {
      answer: 'bothNot',
      assertion: 'Dividend paid is a financing outflow for every company.',
      reason: 'Dividend received by a financing company is an operating inflow.',
      a: 'It is a cost of the finance raised from the shareholders.',
      r: 'It comes from the main business of such a company.',
      link: 'R does not explain A: R is about dividend received, and A about dividend paid.',
    },
    {
      answer: 'bothNot',
      assertion: 'Proceeds from the issue of shares include the securities premium received.',
      reason: 'For a non-financing company, interest paid on debentures is shown under financing activities.',
      a: 'Share capital and securities premium together are the money raised.',
      r: 'Interest is the cost of the money borrowed.',
      link: 'R does not explain A: both are financing items, but one does not say why the other holds.',
    },
    {
      answer: 'bothNot',
      assertion: 'The opening provision for tax is ₹40,000, the provision made ₹70,000 and the closing provision ₹50,000. Tax paid is ₹60,000.',
      reason: 'Income tax paid is deducted under operating activities.',
      a: '₹40,000 + ₹70,000 - ₹50,000 = ₹60,000.',
      r: 'It comes after cash generated from operations.',
      link: 'R does not explain A: R says where the tax paid is shown, and the figure comes from the provision account.',
    },
    {
      answer: 'aOnly',
      assertion: 'An increase of ₹20,000 in a bank overdraft is an inflow under financing activities.',
      reason: 'A bank overdraft is a part of cash and cash equivalents.',
      a: 'An increase in a short-term borrowing is a financing inflow.',
      r: 'It is a short-term borrowing, and is not deducted from cash and cash equivalents.',
    },
    {
      answer: 'aOnly',
      assertion: 'The purchase of marketable securities that mature within two months of being bought is not shown in the Cash Flow Statement.',
      reason: 'Every investment that can be sold in the market is a cash equivalent.',
      a: 'Such securities are cash equivalents, so this is a movement within them.',
      r: 'A cash equivalent must also mature within three months of being bought, among other tests.',
    },
    {
      answer: 'rOnly',
      assertion: 'Interest received by a non-financing company is shown under operating activities.',
      reason: 'Interest is a return on money lent or invested.',
      a: 'It is an inflow under investing activities.',
      r: 'That is why, for such a company, it goes with the investments.',
    },
    {
      answer: 'rOnly',
      assertion: 'Machinery at cost is ₹8,00,000 at the start of the year and ₹10,00,000 at the end. Machinery costing ₹1,00,000 was sold. Purchases are ₹2,00,000.',
      reason: 'Purchases = Closing balance + Cost of the asset sold - Opening balance.',
      a: '₹10,00,000 + ₹1,00,000 - ₹8,00,000 = ₹3,00,000.',
      r: 'This is the rule when the asset is kept at cost.',
    },
  ]),
});

const templates: Template[] = [...easy, ...medium, ...complex, ...formats, cfAssertionReason, ...boardItems, ...boardFormats];

export default templates;

/**
 * What the integrated case studies of the company-year stage (`src/generators/cases/company-year.ts`) reuse of this
 * topic: the names of the parts, rows and sub-totals of the statement, how a working capital change and the operating
 * section are written, and the wording of its conventions. Only exported here; nothing in this file uses the object,
 * so no question of the topic changes.
 */
export const CF_CASE = {
  NPBT, SURPLUS, SIGN_RULE, HEAD_A, HEAD_B, HEAD_C, OP_PROFIT, CGO, TAX_PAID, NET_A, NET_B, NET_C, NET_CHANGE, CASH_START, CASH_END,
  CF_COLUMNS, FINANCING_ROWS, INVESTING_ROWS, OP_ITEMS, NON_CASH, FINANCE_COST, H,
  operatingRows, flowRow, chain, shown, wcFlow, wcName,
};
