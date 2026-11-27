// "Try it" in the cash flow lab: quick questions answered on the picture, with instant feedback. Nothing is recorded.
//
// Three kinds: under which activity an item goes (or none), whether an item is added or deducted on the way from
// profit to cash, and a figure of the statement worked out from the rows above it.

import { formatINR, type Paise } from '@/engine/money';
import type { Rng } from '@/engine/rng';
import { EXAMPLES, randomYear } from './examples';
import { statementOf, type CashFlowYear } from './model';

export interface Choice {
  id: string;
  label: string;
}

export interface ChoiceQuestion {
  kind: 'activity' | 'direction';
  id: string;
  prompt: string;
  /** The item asked about, as the picture shows it. */
  item: string;
  options: Choice[];
  answer: string;
  why: string;
}

export const ACTIVITY_OPTIONS: Choice[] = [
  { id: 'operating', label: 'Operating' },
  { id: 'investing', label: 'Investing' },
  { id: 'financing', label: 'Financing' },
  { id: 'none', label: 'Not a cash flow' },
];

export const DIRECTION_OPTIONS: Choice[] = [
  { id: 'add', label: 'Add' },
  { id: 'deduct', label: 'Deduct' },
  { id: 'none', label: 'Not adjusted here' },
];

type Activity = 'operating' | 'investing' | 'financing' | 'none';

/** Items to place under an activity. The company is not a financing company unless the item says it is. */
export const ACTIVITY_BANK: [item: string, answer: Activity, why: string][] = [
  ['Purchase of machinery for cash', 'investing', 'Buying a long-term asset is an investing activity.'],
  ['Sale of old furniture for cash', 'investing', 'Selling a long-term asset is an investing activity; the whole sale price is the inflow.'],
  ['Cash received from customers', 'operating', 'Selling goods is the main revenue-earning work of the company: an operating inflow.'],
  ['Wages paid to factory workers', 'operating', 'Paying employees is part of the main operations: an operating outflow.'],
  ['Income tax paid', 'operating', 'Income tax is shown under operating activities unless it can be tied to an investing or financing item.'],
  ['Issue of equity shares for cash', 'financing', 'Raising share capital changes the owners’ funds: a financing inflow.'],
  ['Redemption of debentures in cash', 'financing', 'Repaying borrowed money is a financing outflow.'],
  ['Interest paid on debentures by a manufacturing company', 'financing', 'For a company that is not a financing company, interest paid is the cost of its finance: a financing outflow.'],
  ['Interest received on investments by a trading company', 'investing', 'For a company that is not a financing company, interest received is a return on an investment: an investing inflow.'],
  ['Dividend received on shares held by a manufacturing company', 'investing', 'For a company that is not a financing company, dividend received is a return on an investment: an investing inflow.'],
  ['Dividend paid to equity shareholders', 'financing', 'Dividend paid goes to the providers of share capital: a financing outflow for every kind of company.'],
  ['Interest received on loans given, by a finance company', 'operating', 'Lending is the main business of a finance company, so the interest it earns is an operating inflow.'],
  ['Interest paid on borrowings, by a finance company', 'operating', 'For a finance company, borrowing and lending is the main business, so its interest paid is operating.'],
  ['Purchase of patents', 'investing', 'Patents are an intangible long-term asset: buying them is an investing outflow.'],
  ['Increase in bank overdraft', 'financing', 'Bank overdraft is a short-term borrowing (the CBSE treatment), so more of it is a financing inflow.'],
  ['Cash deposited into the bank', 'none', 'Cash in hand and cash at bank are both cash: money only changes its place, and the total does not change.'],
  ['Machinery bought by issuing equity shares to the seller', 'none', 'No cash changes hands: a non-cash transaction is left out of the statement.'],
  ['Purchase of marketable securities maturing in two months', 'none', 'They are cash equivalents: cash only changes its form within cash and cash equivalents.'],
  ['Conversion of debentures into equity shares', 'none', 'One kind of finance replaces another without any cash: left out of the statement.'],
  ['Issue of bonus shares', 'none', 'Reserves turn into share capital; no cash comes in.'],
  ['Rent received from a building let out by a manufacturing company', 'investing', 'The building is an investment of a company whose business is not letting property: the rent is an investing inflow.'],
  ['Loan given to another company by a manufacturing company', 'investing', 'Lending is not its main business: a loan given is an investing outflow.'],
  ['Payment to suppliers of goods', 'operating', 'Buying goods for the main business: an operating outflow.'],
  ['Purchase of non-current investments', 'investing', 'Buying an investment that is not a cash equivalent is an investing outflow.'],
  ['Repayment of a long-term bank loan', 'financing', 'Repaying borrowed money is a financing outflow.'],
];

/** Items met on the way from net profit before tax to net cash from operating activities (indirect method). */
export const DIRECTION_BANK: [item: string, answer: 'add' | 'deduct' | 'none', why: string][] = [
  ['Depreciation charged on machinery', 'add', 'A non-cash expense: it reduced the profit, but no cash went out.'],
  ['Profit on sale of machinery', 'deduct', 'It raised the profit, but it belongs to investing activities, where the whole sale price is shown.'],
  ['Loss on sale of investments', 'add', 'It reduced the profit without any cash going out; the sale proceeds are an investing inflow.'],
  ['Goodwill written off', 'add', 'A non-cash expense: written off in the books, with no cash paid.'],
  ['Interest on debentures, charged to the profit', 'add', 'A cost of finance: added back here because the payment is shown under financing activities.'],
  ['Dividend received on investments', 'deduct', 'Income of an investing activity: taken out here and shown under investing activities.'],
  ['Interest received on investments', 'deduct', 'Income of an investing activity: taken out here and shown under investing activities.'],
  ['Increase in trade receivables', 'deduct', 'More of the revenue is still owed by customers: cash is lower than the profit says.'],
  ['Decrease in inventories', 'add', 'Goods bought earlier were sold: their cost reduced the profit without cash going out this year.'],
  ['Increase in inventories', 'deduct', 'Cash went into goods still unsold.'],
  ['Increase in trade payables', 'add', 'Goods bought on credit not yet paid for: cash stays in the business.'],
  ['Decrease in outstanding expenses', 'deduct', 'Expenses of an earlier year were paid this year: extra cash went out.'],
  ['Increase in prepaid expenses', 'deduct', 'Cash was paid in advance for expenses that are not in this year’s profit.'],
  ['Decrease in bills receivable', 'add', 'Bills receivable are trade receivables: a decrease means cash came in.'],
  ['Increase in income received in advance', 'add', 'A current liability: cash came in before it was earned.'],
  ['Increase in bank overdraft', 'none', 'Bank overdraft is a short-term borrowing: its increase is a financing inflow, not a working capital change.'],
  ['Increase in provision for tax', 'none', 'Provision for tax is not a working capital item. The provision made for the year is already added back in arriving at the net profit before tax, and the tax actually paid (opening provision + provision made − closing provision) is deducted on its own after cash generated from operations.'],
  ['Decrease in marketable securities that are cash equivalents', 'none', 'They are part of cash and cash equivalents themselves, so they are not adjusted.'],
];

export function activityQuestion(rng: Rng): ChoiceQuestion {
  const [item, answer, why] = rng.pick(ACTIVITY_BANK);
  return { kind: 'activity', id: `activity:${item}`, prompt: 'Under which activity does this go in the Cash Flow Statement?', item, options: ACTIVITY_OPTIONS, answer, why };
}

export function directionQuestion(rng: Rng): ChoiceQuestion {
  const [item, answer, why] = rng.pick(DIRECTION_BANK);
  return {
    kind: 'direction',
    id: `direction:${item}`,
    prompt: 'On the way from net profit before tax to net cash from operating activities, is this added, deducted, or not adjusted there at all?',
    item,
    options: DIRECTION_OPTIONS,
    answer,
    why,
  };
}

export type FigureTarget = 'op-profit' | 'cgo' | 'net-operating' | 'closing';

export interface FigureQuestion {
  kind: 'figure';
  id: string;
  target: FigureTarget;
  prompt: string;
  year: CashFlowYear;
  answer: Paise;
  /** The working, line by line. */
  working: string[];
}

const TARGET_NAME: Record<FigureTarget, string> = {
  'op-profit': 'operating profit before working capital changes',
  cgo: 'cash generated from operations',
  'net-operating': 'net cash from (or used in) operating activities',
  closing: 'cash and cash equivalents at the end of the year',
};

/** A figure of the statement of `year`, to be worked out from the rows above it (which the picture shows). */
export function figureQuestion(year: CashFlowYear, rng: Rng): FigureQuestion {
  const target = rng.pick<FigureTarget>(['op-profit', 'cgo', 'net-operating', 'net-operating', 'closing']);
  const s = statementOf(year);
  const answer = target === 'op-profit' ? s.opProfit : target === 'cgo' ? s.cgo : target === 'net-operating' ? s.operating : s.closing;
  const chain = (from: number, to: number) => {
    const rows = s.rows.slice(from, to).filter((r) => r.kind === 'item');
    return rows.map((r, i) => (i === 0 ? fmt(r.amount) : `${r.amount < 0 ? '−' : '+'} ${formatINR(Math.abs(r.amount)).slice(1)}`)).join(' ');
  };
  const at = (id: string) => s.rows.findIndex((r) => r.id === id);
  const working: string[] = [];
  if (target === 'closing') {
    working.push(`Net change = ${fmt(s.operating)} ${sign(s.investing)} ${sign(s.financing)} = ${fmt(s.net)}.`);
    working.push(`Closing cash = opening ${formatINR(year.openingCash)} ${sign(s.net)} = ${formatINR(s.closing)}.`);
  } else {
    const opEnd = at('op-profit');
    working.push(`${cap(TARGET_NAME['op-profit'])} = ${chain(0, opEnd)} = ${fmt(s.opProfit)}.`);
    if (target !== 'op-profit') {
      const wc = s.rows.slice(opEnd + 1, at('cgo')).filter((r) => r.kind === 'item');
      working.push(`${cap(TARGET_NAME.cgo)} = ${[fmt(s.opProfit), ...wc.map((r) => sign(r.amount))].join(' ')} = ${fmt(s.cgo)}.`);
    }
    if (target === 'net-operating') working.push(`${cap(TARGET_NAME['net-operating'])} = ${fmt(s.cgo)} − tax paid ${formatINR(year.taxPaid).slice(1)} = ${fmt(s.operating)}.`);
  }
  return {
    kind: 'figure',
    id: `figure:${target}:${year.company}`,
    target,
    prompt: `Work out the ${TARGET_NAME[target]} of ${year.company} from the rows the statement shows. Type a minus sign for a figure below nil.`,
    year,
    answer,
    working,
  };
}

const fmt = (p: Paise): string => (p < 0 ? `(${formatINR(-p).slice(1)})` : formatINR(p).slice(1));
const sign = (p: Paise): string => `${p < 0 ? '−' : '+'} ${formatINR(Math.abs(p)).slice(1)}`;
const cap = (s: string): string => s[0].toUpperCase() + s.slice(1);

/** The rows of the statement the question hides: its own figure and everything that comes from it. */
export function hiddenRows(q: FigureQuestion): Set<string> {
  const s = statementOf(q.year);
  const from = s.rows.findIndex((r) => r.id === q.target);
  // A figure of the operating part hides the rest of that part's sub-totals; the closing cash hides the last three lines.
  const ids = q.target === 'closing' ? ['net-change', 'closing'] : s.rows.slice(from).filter((r) => r.kind === 'subtotal' || r.kind === 'final' || r.section === 'cash').map((r) => r.id);
  return new Set(ids);
}

/** Reads a typed amount of rupees: "3,32,000", "₹3,32,000", "-5000", "(5,000)", "− 5,000". Null when it is not one. */
export function parseRupees(text: string): Paise | null {
  const t = text.replace(/[₹,\s]/g, '').replace(/−/g, '-');
  const bracket = /^\((\d+(?:\.\d{1,2})?)\)$/.exec(t);
  const plain = /^(-?)(\d+(?:\.\d{1,2})?)$/.exec(t);
  if (bracket) return -Math.round(Number(bracket[1]) * 100);
  if (plain) return (plain[1] ? -1 : 1) * Math.round(Number(plain[2]) * 100);
  return null;
}

export function markFigure(q: FigureQuestion, typed: string): { right: boolean; read: Paise | null; why: string } {
  const read = parseRupees(typed);
  if (read === null) return { right: false, read, why: 'Type the figure in rupees, for example 2,45,000 (a minus sign for a figure below nil).' };
  if (read === q.answer) return { right: true, read, why: q.working.join(' ') };
  let slip = '';
  if (read === -q.answer) slip = 'The size is right but the sign is not. ';
  else if (q.target === 'net-operating' && read === q.answer + q.year.taxPaid) slip = 'That is cash generated from operations: the tax paid has still to come off. ';
  return { right: false, read, why: `${slip}${q.working.join(' ')}` };
}

export type TryKind = 'activity' | 'direction' | 'figure';
export const TRY_KINDS: TryKind[] = ['activity', 'direction', 'figure'];

/** Where each kind's run of questions starts, for a seed: the same seed asks the same questions in the same order. */
export const trySeed = (seed: number, kind: TryKind): number => seed * 7 + TRY_KINDS.indexOf(kind) + 1;

/** A figure question on a ready year or a made-up one. */
export function figureQuestionFrom(rng: Rng): FigureQuestion {
  const year = rng.next() < 0.3 ? rng.pick(EXAMPLES).year : randomYear(rng.int(1, 900_000));
  return figureQuestion(year, rng);
}

/** The next question of a kind. */
export function nextQuestion(kind: TryKind, rng: Rng): ChoiceQuestion | FigureQuestion {
  return kind === 'activity' ? activityQuestion(rng) : kind === 'direction' ? directionQuestion(rng) : figureQuestionFrom(rng);
}
