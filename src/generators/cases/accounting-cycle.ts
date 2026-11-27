import type { AccountQuestion, JournalSetQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { CLASS11_ACCOUNTS, creditor, debtor, resolveAccount } from '@/engine/accounts';
import {
  BALANCE_BD,
  BALANCE_CD,
  accountLabel,
  accountOf,
  balanceOf,
  ledgerLabel,
  post,
  postingsOf,
  trialBalance,
  type AccountView,
  type DatedEntry,
  type Ledger,
  type OpeningBalance,
} from '@/engine/books';
import { columnTotals } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { amount, caseTemplate, formatINR, interleave, ledgerSides, rupees, storyHolds, type Closing, type Paise } from '../authoring';
import { sideWork } from '../templates/ledger';
import type { AccountParts, CaseAccountParts, CaseSetParts, CaseStatementParts, CaseTemplate, Distractor, FormatRowParts, McqParts, NumericParts } from '../types';

/**
 * Case studies of the stage "From transactions to the trial balance": one business, one month, from the entries to
 * the ledger balances and the trial balance. Every case posts its entries with `post` and reads its answers from
 * the ledger, so the questions of one case agree with each other. The working of a numeric question is written as
 * sums of the figures of the case; `worked` adds every sum again from its text and requires the working to end on
 * the answer, and a trial balance total must also equal the credit total worked out without the ledger (`agreed`).
 *
 * Conventions a case states wherever it relies on them: a cheque received is banked the same day (so Bank A/c is
 * debited), the trial balance whose total is asked for is drawn up by the balance method, GST is at one rate with
 * every supply of one kind (intra-State or inter-State), and capital is the balancing figure of opening balances.
 */
const T = 'trial-balance';
const CONCEPT = 'tb-case';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

const dr = (accountId: string, value: Paise): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: Paise): JournalLine => ({ accountId, side: 'Cr', amount: value });
// A case is set up again for every one of its questions, and writing an amount out is the slow step of a set-up,
// so the amounts written lately are remembered.
const written = new Map<Paise, string>();
const F = (p: Paise): string => {
  let text = written.get(p);
  if (text === undefined) {
    if (written.size >= 5000) written.clear();
    text = formatINR(p);
    written.set(p, text);
  }
  return text;
};
const sum = (xs: readonly Paise[]): Paise => xs.reduce((a, b) => a + b, 0);
/** The size of an account's balance (0 when it has none); the side is read with `balanceOf` where it matters. */
const bal = (ledger: Ledger, accountId: string): Paise => balanceOf(ledger, accountId)?.amount ?? 0;
/** "A, B and C" */
const listed = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** "₹a + ₹b + ₹c" */
const plus = (xs: readonly Paise[]): string => xs.map(F).join(' + ');
/** "Label: ₹a + ₹b = ₹t." and, for a single figure, "Label: ₹a." */
const addUp = (label: string, xs: readonly Paise[]): string =>
  xs.length === 1 ? `${label}: ${F(xs[0])}.` : `${label}: ${plus(xs)} = ${F(sum(xs))}.`;

type CommonError = { value: Paise; why: string };
/** The items that apply to this seed: a condition that is false drops its item out. */
const present = <X extends object>(...list: (X | false | null | undefined)[]): X[] => list.filter((x): x is X => !!x);
/** The common errors that apply to this seed. */
const errors = (...list: (CommonError | false | null | undefined)[]): CommonError[] => present(...list);

/** A numeric question whose common errors collapse to fewer than two for these figures rejects the seed. */
export function numeric(p: NumericParts): NumericParts | null {
  const usable = new Set(p.commonErrors.map((e) => e.value).filter((v) => Number.isSafeInteger(v) && v > 0 && v !== p.answer));
  return p.answer > 0 && usable.size >= 2 ? p : null;
}

/** A choice question needs three distinct wrong options. */
export function choice(p: McqParts): McqParts | null {
  const texts = new Set(p.distractors.map((d) => d.text).filter((t) => t !== p.correct));
  return texts.size >= 3 ? p : null;
}

// The independent check of a numeric question. The answer comes from the posted ledger; the working is written
// from the figures of the case. Every sum and percentage written in the working is worked again from its text, and
// the working must end on the answer.
const MONEY = /₹[\d,]+/g;
const TERM = String.raw`(?:[A-Z][A-Za-z&.'/ ]*? )?₹[\d,]+`;
const SUM = new RegExp(String.raw`(${TERM}(?: [+-] ${TERM})+) = (₹[\d,]+)`, 'g');
const PERCENT = /(\d+(?:\.\d+)?)% of (₹[\d,]+) = (₹[\d,]+)/g;
const paiseIn = (text: string): Paise[] => (text.match(MONEY) ?? []).map((m) => parseRupees(m) ?? NaN);

function sumsHold(lines: readonly string[]): boolean {
  for (const line of lines) {
    for (const m of line.matchAll(SUM)) {
      const parts = m[1].split(/ ([+-]) /);
      let total = paiseIn(parts[0])[0];
      for (let i = 1; i < parts.length; i += 2) total += (parts[i] === '+' ? 1 : -1) * paiseIn(parts[i + 1])[0];
      if (total !== paiseIn(m[2])[0]) return false;
    }
    for (const m of line.matchAll(PERCENT)) {
      if (Math.round((paiseIn(m[2])[0] * Number(m[1])) / 100) !== paiseIn(m[3])[0]) return false;
    }
  }
  return true;
}

export const worked = (q: NumericQuestion): boolean => sumsHold(q.working) && paiseIn(q.working.at(-1) ?? '').at(-1) === q.answer;
/**
 * The check of a total reached two ways (the two columns of a trial balance, the two sides of the equation): the
 * working adds up, and each of its first two lines comes to the answer on its own.
 */
const bothWaysAgree = (q: NumericQuestion): boolean =>
  worked(q) && q.working.length >= 3 && paiseIn(q.working[0]).at(-1) === q.answer && paiseIn(q.working[1]).at(-1) === q.answer;

// ---------------------------------------------------------------------------------------------------------------
// The business and its month
// ---------------------------------------------------------------------------------------------------------------

export const OWNERS = ['Meena', 'Arjun', 'Fatima', 'Harpreet', 'Joseph', 'Imran', 'Kavita', 'Suresh', 'Nandini', 'Vikram', 'Zoya', 'Gurpreet'];
export const SHOPS = [
  'a readymade garments shop',
  'a grocery store',
  'a footwear shop',
  'a toy shop',
  'a hardware store',
  'an electrical goods shop',
  'a sports goods shop',
  'a book shop',
  'a utensils shop',
  'a mobile accessories shop',
];
export const MONTHS: [string, number][] = [
  ['April', 30], ['May', 31], ['June', 30], ['July', 31], ['August', 31],
  ['September', 30], ['October', 31], ['November', 30], ['December', 31], ['January', 31],
];
export const SUPPLIERS = ['Rao & Co.', 'Sharma Bros', 'Gupta Wholesale', 'Mehta & Sons', 'Verma Agencies', 'Patel Suppliers'];
export const CUSTOMERS = ['Mohan', 'Kiran', 'Anita Traders', 'Lakshmi Stores', 'Desai Mart', 'Iqbal Stores'];

export interface Business {
  owner: string;
  shop: string;
  month: string;
  /** The last day of the month. */
  last: number;
}
export const business = (rng: Rng): Business => {
  const [month, last] = rng.pick(MONTHS);
  return { owner: rng.pick(OWNERS), shop: rng.pick(SHOPS), month, last };
};
export const monthEnd = (b: Business) => `${b.last} ${b.month}`;
/** The shop without its article: "a toy shop" is "toy shop". */
export const shopName = (b: Business) => b.shop.replace(/^an? /, '');
/**
 * The question on the total of the trial balance. The course prepares a trial balance by the balance method only
 * (CBSE 2025-26), and the question says so, as a board paper does.
 */
const tbTotalPrompt = (b: Business) => `A trial balance is drawn up on ${monthEnd(b)} by the balance method. What is the total of each column?`;
/**
 * The convention a case states when a cheque is received: textbooks differ on a cheque that is not said to be
 * deposited (Bank A/c, or cash or cheques in hand), so the case says it goes to the bank at once.
 */
export const BANKED = 'Cheques received are banked the same day.';

// ---------------------------------------------------------------------------------------------------------------
// Transactions: the line the student reads, the entry, and why the entry is so
// ---------------------------------------------------------------------------------------------------------------

export type Mode = 'cash' | 'bank';

export interface Draft {
  key: string;
  /** The transaction as the case states it, without its date. */
  text: string;
  lines: JournalLine[];
  /** The explanation of the entry, one step per line. */
  steps: string[];
  /** Accounts a student might wrongly pick for this entry. */
  distract: string[];
}
interface Tx extends Draft {
  day: number;
}

/**
 * Dates for the transactions in order, all different: the first on the 1st and the rest on later days of the
 * month, or every one after the 1st when the 1st is the day of the opening balances.
 */
function dated(rng: Rng, drafts: Draft[], afterFirst = false): Tx[] {
  const later = laterDays(rng, drafts.length - (afterFirst ? 0 : 1));
  const days = afterFirst ? later : [1, ...later];
  return drafts.map((d, i) => ({ ...d, day: days[i] }));
}
/** `n` different days after the 1st, in order (none later than the 28th, so every month has them). */
export function laterDays(rng: Rng, n: number): number[] {
  return rng.shuffle(Array.from({ length: 27 }, (_, i) => i + 2)).slice(0, n).sort((a, b) => a - b);
}
const line = (b: Business, t: Tx) => `${t.day} ${b.month}: ${t.text}`;
const entriesOf = (txs: readonly Tx[]) => txs.map((t) => t.lines);

/** True when none of the accounts named (cash, bank) is ever overdrawn as the entries are posted in order. */
export function neverOverdrawn(entries: JournalLine[][], accountIds: string[]): boolean {
  let ledger: Ledger = new Map();
  for (const e of entries) {
    ledger = post([e], ledger);
    if (accountIds.some((id) => (ledger.get(id) ?? 0) < 0)) return false;
  }
  return true;
}

/** The possessive of a name: "Mohan's", "Sharma Bros'". */
export const poss = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const outOf = (m: Mode) => (m === 'cash' ? 'Cash goes out, so Cash A/c is credited.' : 'The cheque is paid out of the bank, so Bank A/c is credited.');
const into = (m: Mode) => (m === 'cash' ? 'Cash comes in, so Cash A/c is debited.' : 'The money goes into the bank, so Bank A/c is debited.');

export interface Named {
  id: string;
  /** As the case says it: "furniture", "the electricity bill". */
  words: string;
  min: number;
  max: number;
  step: number;
}
export const ASSETS: Named[] = [
  { id: 'furniture', words: 'furniture', min: 20000, max: 80000, step: 5000 },
  { id: 'computers', words: 'a computer', min: 30000, max: 70000, step: 5000 },
  { id: 'officeEquipment', words: 'office equipment', min: 15000, max: 60000, step: 5000 },
];
export const EXPENSES: Named[] = [
  { id: 'rent', words: 'rent', min: 5000, max: 15000, step: 1000 },
  { id: 'salaries', words: 'salaries', min: 8000, max: 20000, step: 1000 },
  { id: 'electricity', words: 'the electricity bill', min: 1000, max: 4000, step: 500 },
  { id: 'advertisement', words: 'for advertisement', min: 2000, max: 8000, step: 500 },
  { id: 'telephone', words: 'the telephone bill', min: 1000, max: 3000, step: 500 },
  { id: 'insurance', words: 'the insurance premium', min: 3000, max: 9000, step: 500 },
];
export const SALARIES = EXPENSES[1];
export const pickAmount = (rng: Rng, n: Named): Paise => amount(rng, n.min, n.max, n.step);

export const tx = {
  capital: (m: Mode, a: Paise): Draft => ({
    key: 'capital',
    text: m === 'cash' ? `Started business with cash ${F(a)}.` : `Started business with ${F(a)} paid into a bank account opened for the business.`,
    lines: [dr(m, a), cr('capital', a)],
    steps: [into(m), 'The business owes this amount to its proprietor, so Capital A/c is credited.'],
    distract: ['drawings', 'loan'],
  }),
  capitalBoth: (cash: Paise, bank: Paise): Draft => ({
    key: 'capitalBoth',
    text: `Started business with cash ${F(cash)} and ${F(bank)} paid into a new business bank account.`,
    lines: [dr('cash', cash), dr('bank', bank), cr('capital', cash + bank)],
    steps: [
      'Cash and the bank balance are both assets that come in, so Cash A/c and Bank A/c are debited.',
      `Capital A/c is credited with all that the proprietor brought in: ${F(cash)} + ${F(bank)} = ${F(cash + bank)}.`,
    ],
    distract: ['drawings', 'loan'],
  }),
  deposit: (a: Paise): Draft => ({
    key: 'deposit',
    text: `Opened a bank account for the business and deposited ${F(a)} out of cash.`,
    lines: [dr('bank', a), cr('cash', a)],
    steps: ['The money moves from the cash box into the bank, so Bank A/c is debited.', 'Cash goes out, so Cash A/c is credited.', 'Capital is not affected: one asset is exchanged for another.'],
    distract: ['capital', 'drawings'],
  }),
  withdrawForOffice: (a: Paise): Draft => ({
    key: 'office',
    text: `Withdrew ${F(a)} from the bank for office use.`,
    lines: [dr('cash', a), cr('bank', a)],
    steps: ['The money is still with the business, now as cash, so Cash A/c is debited.', 'The bank balance falls, so Bank A/c is credited.', 'It is not drawings: the cash is for the office, not for the proprietor.'],
    distract: ['drawings', 'capital'],
  }),
  drawings: (owner: string, m: Mode, a: Paise): Draft => ({
    key: 'drawings',
    text: m === 'cash' ? `${owner} took ${F(a)} in cash for personal use.` : `${owner} withdrew ${F(a)} from the business bank account for personal use.`,
    lines: [dr('drawings', a), cr(m, a)],
    steps: ['Money taken by the proprietor for personal use is drawings, which reduce capital, so Drawings A/c is debited.', outOf(m)],
    distract: ['capital', 'salaries', 'generalExpenses'],
  }),
  asset: (n: Named, m: Mode, a: Paise): Draft => ({
    key: 'asset',
    text: `Bought ${n.words} for the shop ${F(a)}, paid ${m === 'cash' ? 'in cash' : 'by cheque'}.`,
    lines: [dr(n.id, a), cr(m, a)],
    steps: [`It is bought for use in the business, not for resale, so it is an asset: ${accountLabel(n.id)} is debited.`, outOf(m)],
    distract: ['purchases'],
  }),
  goodsBought: (m: Mode, a: Paise): Draft => ({
    key: m === 'cash' ? 'goodsCash' : 'goodsCheque',
    text: m === 'cash' ? `Bought goods for cash ${F(a)}.` : `Bought goods ${F(a)}, paid by cheque.`,
    lines: [dr('purchases', a), cr(m, a)],
    steps: ['Goods bought for resale are purchases, so Purchases A/c is debited.', outOf(m)],
    distract: ['stock', 'sales'],
  }),
  goodsSold: (m: Mode, a: Paise): Draft => ({
    key: m === 'cash' ? 'saleCash' : 'saleCheque',
    text: m === 'cash' ? `Sold goods for cash ${F(a)}.` : `Sold goods ${F(a)}; the cheque received was banked the same day.`,
    lines: [dr(m, a), cr('sales', a)],
    steps: [into(m), 'Goods sold are the income of a trader, so Sales A/c is credited.'],
    distract: ['purchases', 'stock'],
  }),
  expense: (n: Named, m: Mode, a: Paise): Draft => ({
    key: `expense:${n.id}`,
    text: `Paid ${n.words} ${F(a)} ${m === 'cash' ? 'in cash' : 'by cheque'}.`,
    lines: [dr(n.id, a), cr(m, a)],
    steps: [`It is an expense of the business, so ${accountLabel(n.id)} is debited.`, outOf(m)],
    distract: ['drawings'],
  }),
  commission: (m: Mode, a: Paise): Draft => ({
    key: 'commission',
    text: `Received commission ${F(a)} ${m === 'cash' ? 'in cash' : 'by cheque, banked the same day'}.`,
    lines: [dr(m, a), cr('commissionReceived', a)],
    steps: [into(m), 'Commission earned is an income, so Commission Received A/c is credited.'],
    distract: ['sales', 'commissionPaid'],
  }),
  creditPurchase: (supplier: string, a: Paise): Draft => ({
    key: 'creditPurchase',
    text: `Bought goods from ${supplier} on credit ${F(a)}.`,
    lines: [dr('purchases', a), cr(creditor(supplier), a)],
    steps: ['Goods bought for resale are purchases, so Purchases A/c is debited.', `Nothing is paid yet: the business owes ${supplier}, a creditor, so ${poss(supplier)} account is credited.`],
    distract: ['stock', 'sales'],
  }),
  creditSale: (customer: string, a: Paise): Draft => ({
    key: 'creditSale',
    text: `Sold goods to ${customer} on credit ${F(a)}.`,
    lines: [dr(debtor(customer), a), cr('sales', a)],
    steps: [`Nothing is received yet: ${customer} owes the business, so ${poss(customer)} account is debited.`, 'Goods sold are the income of a trader, so Sales A/c is credited.'],
    distract: ['purchases', 'stock'],
  }),
  returnOut: (supplier: string, a: Paise): Draft => ({
    key: 'returnOut',
    text: `Goods returned to ${supplier} ${F(a)}.`,
    lines: [dr(creditor(supplier), a), cr('purchasesReturn', a)],
    steps: [`The business now owes ${supplier} less, so ${poss(supplier)} account is debited.`, 'Goods sent back cancel part of the purchases, so Purchases Return A/c is credited.'],
    distract: ['purchases', 'salesReturn', 'sales'],
  }),
  returnIn: (customer: string, a: Paise): Draft => ({
    key: 'returnIn',
    text: `Goods returned by ${customer} ${F(a)}.`,
    lines: [dr('salesReturn', a), cr(debtor(customer), a)],
    steps: ['Goods coming back cancel part of the sales, so Sales Return A/c is debited.', `${customer} now owes less, so ${poss(customer)} account is credited.`],
    distract: ['sales', 'purchasesReturn', 'purchases'],
  }),
  paySupplier: (supplier: string, paid: Paise, discount: Paise): Draft => ({
    key: 'paySupplier',
    text:
      discount > 0
        ? `Paid ${supplier} ${F(paid)} by cheque and received a discount of ${F(discount)}.`
        : `Paid ${supplier} ${F(paid)} by cheque on account.`,
    lines: [dr(creditor(supplier), paid + discount), cr('bank', paid), ...(discount > 0 ? [cr('discountReceived', discount)] : [])],
    steps:
      discount > 0
        ? [
            `The cheque and the discount together clear ${F(paid)} + ${F(discount)} = ${F(paid + discount)} of the debt, so ${poss(supplier)} account is debited with that.`,
            'The cheque is paid out of the bank, so Bank A/c is credited.',
            'The discount is a gain, so Discount Received A/c is credited.',
          ]
        : [`The business now owes ${supplier} less, so ${poss(supplier)} account is debited.`, 'The cheque is paid out of the bank, so Bank A/c is credited.'],
    distract: ['discountAllowed', 'purchases'],
  }),
  receiveFromCustomer: (customer: string, received: Paise, discount: Paise): Draft => ({
    key: 'receiveFromCustomer',
    text:
      discount > 0
        ? `Received ${F(received)} from ${customer} by cheque and allowed a discount of ${F(discount)}.`
        : `Received ${F(received)} from ${customer} by cheque on account.`,
    lines: [dr('bank', received), ...(discount > 0 ? [dr('discountAllowed', discount)] : []), cr(debtor(customer), received + discount)],
    steps:
      discount > 0
        ? [
            'The cheque goes into the bank, so Bank A/c is debited.',
            'The discount is a loss, so Discount Allowed A/c is debited.',
            `${customer} is cleared of ${F(received)} + ${F(discount)} = ${F(received + discount)}, so ${poss(customer)} account is credited with that.`,
          ]
        : ['The cheque goes into the bank, so Bank A/c is debited.', `${customer} now owes less, so ${poss(customer)} account is credited.`],
    distract: ['discountReceived', 'sales'],
  }),
};

/** Which column an account's balance goes in, said as the slip a student makes about it. */
function whyNotCredit(accountId: string): string {
  if (accountId === 'cash' || accountId === 'bank') return 'Mixed the balance up with the payments, which are credited; what is left in the account is a debit balance.';
  if (accountId === 'purchases') return 'Took purchases for an income because goods came in; purchases are an expense and have a debit balance.';
  if (accountId === 'drawings') return 'Treated drawings like capital; drawings reduce capital, so Drawings A/c has a debit balance.';
  if (accountId === 'salesReturn') return 'Treated sales returns like sales; they cancel part of the sales and have a debit balance.';
  if (accountId === 'discountAllowed') return 'Mixed discount allowed up with discount received; discount allowed is a loss and has a debit balance.';
  if (accountId === 'stock') return 'Treated stock as a gain; stock is an asset and has a debit balance.';
  if (accountId.startsWith('debtor:')) return 'Took the customer for a creditor; a customer who owes the business is a debtor, a debit balance.';
  if (['furniture', 'computers', 'officeEquipment', 'machinery'].includes(accountId)) return 'Treated the asset as something owed; assets have debit balances.';
  return 'Took the expense for an income because money changed hands; expenses have debit balances.';
}
function whyNotDebit(accountId: string): string {
  if (accountId === 'capital') return 'Treated capital as an asset; it is owed to the proprietor and has a credit balance.';
  if (accountId === 'sales') return 'Took sales for a debit because goods went out; sales are an income and have a credit balance.';
  if (accountId === 'purchasesReturn') return 'Treated purchases returns like purchases; they cancel part of the purchases and have a credit balance.';
  if (accountId === 'discountReceived') return 'Mixed discount received up with discount allowed; discount received is a gain and has a credit balance.';
  if (accountId.startsWith('creditor:')) return 'Took the supplier for a debtor; a supplier the business owes is a creditor, a credit balance.';
  if (accountId === 'bankLoan' || accountId === 'loan') return 'Treated the loan as an asset because money came in; it is owed, so it has a credit balance.';
  return 'Took the income for an expense; incomes have credit balances.';
}

/** The two columns of the trial balance written as sums, debit first. */
function columns(ledger: Ledger): string[] {
  const tb = trialBalance(ledger);
  const col = (side: 'Dr' | 'Cr', word: string) => {
    const rows = tb.rows.filter((r) => r.side === side);
    return `${word} column: ${rows.map((r) => `${r.label} ${F(r.amount)}`).join(' + ')} = ${F(side === 'Dr' ? tb.debitTotal : tb.creditTotal)}.`;
  };
  return [col('Dr', 'Debit'), col('Cr', 'Credit')];
}
/**
 * The working of a trial balance total: the two columns as the ledger gives them, and the figure they agree at.
 * That figure is `expected`, the credit total worked out from the figures of the case without the ledger, so the
 * question is served only when the posted books and the arithmetic of the case give the same total.
 */
const agreed = (ledger: Ledger, expected: Paise): string[] => [...columns(ledger), `The two columns agree at ${F(expected)}.`];
/** The total of one side of an account (all its debits or all its credits) in the entries given. */
const sideTotal = (entries: JournalLine[][], accountId: string, side: 'Dr' | 'Cr'): Paise =>
  sum(entries.flat().filter((l) => l.accountId === accountId && l.side === side).map((l) => l.amount));
const sideAmounts = (entries: JournalLine[][], accountId: string, side: 'Dr' | 'Cr'): Paise[] =>
  entries.flat().filter((l) => l.accountId === accountId && l.side === side).map((l) => l.amount);

/** The working of the balance of Cash A/c or Bank A/c: its debit side, its credit side, the difference. */
function cashWorking(entries: JournalLine[][], accountId: 'cash' | 'bank', labels?: [string, string]): string[] {
  const ins = sideAmounts(entries, accountId, 'Dr');
  const outs = sideAmounts(entries, accountId, 'Cr');
  const name = accountId === 'cash' ? 'Cash' : 'Bank';
  const [inLabel, outLabel] = labels ?? [`Debit side of ${name} A/c (money in)`, `Credit side of ${name} A/c (money out)`];
  // Without labels of its own the working is that of a ledger account, so it names the side of the balance.
  const side = labels ? '' : ' (debit)';
  if (outs.length === 0) return [addUp(inLabel, ins), `Nothing was paid out, so the balance is ${F(sum(ins))}${side}.`];
  return [addUp(inLabel, ins), addUp(outLabel, outs), `Balance = ${F(sum(ins))} - ${F(sum(outs))} = ${F(sum(ins) - sum(outs))}${side}.`];
}

// ---------------------------------------------------------------------------------------------------------------
// 1. The first month of a new business, cash and bank only (easy)
// ---------------------------------------------------------------------------------------------------------------

interface FirstMonth {
  b: Business;
  txs: Tx[];
  entries: JournalLine[][];
  ledger: Ledger;
  /** The transaction whose entry is asked for. */
  focus: Tx;
  /** The capital came in as cash and a deposit followed (true), or as cash and bank together (false). */
  split: boolean;
  capital: Paise;
  toBank: Paise;
  asset: Named;
  assetCost: Paise;
  cashGoods: Paise;
  chequeGoods: Paise;
  cashSale: Paise;
  chequeSale: Tx;
  office: Paise;
  drawings: Paise;
  drawingsMode: Mode;
  commission: Paise;
  cashExpenses: Paise;
  ask: 'purchases' | 'sales';
  creditForm: boolean;
}

const firstMonth = caseTemplate<FirstMonth>({
  id: 'case-cycle-first-month',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'easy',
  title: 'The first month of a new shop',
  setup: (rng) => {
    const b = business(rng);
    const split = rng.pick([true, false]);
    const capitalRupees = rng.step(300000, 800000, 50000);
    const toBankRupees = Math.round((capitalRupees * rng.pick([60, 70, 80])) / 1000000) * 10000;
    const capital = rupees(capitalRupees);
    const toBank = rupees(toBankRupees);
    const asset = rng.pick(ASSETS);
    const assetCost = pickAmount(rng, asset);
    const cashGoods = amount(rng, 20000, 60000, 5000);
    const chequeGoods = amount(rng, 30000, 90000, 5000);
    const cashSale = amount(rng, 15000, 70000, 5000);
    const chequeSaleAmount = amount(rng, 20000, 80000, 5000);
    if (cashGoods === chequeGoods || cashSale === chequeSaleAmount) return null;
    const [e1, e2] = rng.shuffle(EXPENSES);
    const m1: Mode = rng.pick(['cash', 'bank']);
    const m2: Mode = m1 === 'cash' ? 'bank' : 'cash';
    const a1 = pickAmount(rng, e1);
    const a2 = pickAmount(rng, e2);
    const moves = rng.pick([['office'], ['drawCash'], ['drawBank'], ['office', 'drawCash'], ['office', 'drawBank']]);
    const office = moves.includes('office') ? amount(rng, 10000, 30000, 5000) : 0;
    const drawingsMode: Mode = moves.includes('drawBank') ? 'bank' : 'cash';
    const drawings = moves.length > 1 || moves[0] !== 'office' ? amount(rng, 4000, 15000, 1000) : 0;
    const commission = rng.int(1, 5) <= 2 ? amount(rng, 2000, 9000, 500) : 0;

    const opening = split ? [tx.capital('cash', capital), tx.deposit(toBank)] : [tx.capitalBoth(capital - toBank, toBank)];
    const early = rng.shuffle([tx.asset(asset, 'bank', assetCost), tx.goodsBought('cash', cashGoods)]);
    const later = rng.shuffle([
      tx.goodsBought('bank', chequeGoods),
      tx.goodsSold('bank', chequeSaleAmount),
      tx.expense(e1, m1, a1),
      ...(office ? [tx.withdrawForOffice(office)] : []),
      ...(drawings ? [tx.drawings(b.owner, drawingsMode, drawings)] : []),
      ...(commission ? [tx.commission('cash', commission)] : []),
    ]);
    const txs = dated(rng, [...opening, ...early, tx.goodsSold('cash', cashSale), ...later, tx.expense(e2, m2, a2)]);
    const entries = entriesOf(txs);
    if (!neverOverdrawn(entries, ['cash', 'bank'])) return null;
    const ledger = post(entries);
    const pickable = txs.filter((t) => ['deposit', 'capitalBoth', 'asset', 'office', 'drawings', 'saleCheque'].includes(t.key));
    const focus = rng.pick(pickable);
    const ask: 'purchases' | 'sales' = commission ? rng.pick(['purchases', 'sales']) : 'purchases';
    const creditForm = !(commission && drawings) || rng.pick([true, false]);
    return {
      b, txs, entries, ledger, focus, split, capital, toBank, asset, assetCost, cashGoods, chequeGoods, cashSale,
      chequeSale: txs.find((t) => t.key === 'saleCheque')!,
      office, drawings, drawingsMode, commission,
      cashExpenses: m1 === 'cash' ? a1 : a2,
      ask, creditForm,
    };
  },
  context: (s) =>
    [`${s.b.owner} opened ${s.b.shop} on 1 ${s.b.month}. These are the transactions of the first month:`, ...s.txs.map((t) => line(s.b, t))].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.focus.day} ${s.b.month}.`,
        lines: s.focus.lines,
        explanation: s.focus.steps,
        distractorAccounts: s.focus.distract,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = bal(s.ledger, 'cash');
        return numeric({
          prompt: `What is the balance of Cash A/c on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer + s.chequeSale.lines[0].amount, why: `Counted the sale of ${s.chequeSale.day} ${s.b.month} as cash received; that cheque went into the bank.` },
            { value: answer - s.assetCost, why: `Deducted the cheque for ${s.asset.words} from cash; it was paid out of the bank.` },
            s.split && { value: answer + s.toBank, why: 'Left out the cash deposited into the bank; it leaves the cash box, so Cash A/c is credited with it.' },
            !s.split && { value: answer + s.toBank, why: 'Took the whole capital as cash; part of it was paid straight into the bank.' },
            s.office > 0 && { value: answer - s.office, why: 'Left out the cash drawn from the bank for office use; it is a receipt in Cash A/c.' },
            s.drawings > 0 && s.drawingsMode === 'cash' && { value: answer + s.drawings, why: 'Left out the cash the proprietor took because it is not a business expense; the cash still went out.' },
            s.drawings > 0 && s.drawingsMode === 'bank' && { value: answer - s.drawings, why: "Deducted the proprietor's withdrawal from cash; it was drawn from the bank." },
          ),
          explanation: cashWorking(s.entries, 'cash'),
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = bal(s.ledger, 'bank');
        return numeric({
          prompt: `What is the balance of Bank A/c on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer - s.chequeSale.lines[0].amount, why: `Left out the cheque from the sale of ${s.chequeSale.day} ${s.b.month}, taking every sale as a cash sale.` },
            { value: answer - s.cashGoods, why: 'Deducted the goods bought for cash from the bank; they were paid for out of the cash box.' },
            { value: answer - s.cashExpenses, why: 'Deducted the expense paid in cash from the bank as well; only cheques reduce the bank balance.' },
            s.office > 0 && { value: answer + 2 * s.office, why: 'Added the cash withdrawn for office use; a withdrawal is credited in Bank A/c, so it reduces the balance.' },
            s.drawings > 0 && s.drawingsMode === 'bank' && { value: answer + s.drawings, why: "Left out the proprietor's personal withdrawal; it still reduces the bank balance." },
            { value: answer + (s.capital - s.toBank), why: 'Started from the whole capital; only part of it was put into the bank.' },
          ),
          explanation: cashWorking(s.entries, 'bank'),
        });
      },
      verify: worked,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const rows = trialBalance(s.ledger).rows;
        const debit = rows.filter((r) => r.side === 'Dr');
        const credit = rows.filter((r) => r.side === 'Cr');
        if (s.creditForm) {
          const right = credit.find((r) => r.accountId === (s.commission ? 'commissionReceived' : 'sales'))!;
          return choice({
            prompt: `Which of these accounts shows a credit balance in the trial balance on ${monthEnd(s.b)}?`,
            correct: right.label,
            distractors: debit.filter((r) => r.accountId !== 'cash').map((r) => ({ text: r.label, why: whyNotCredit(r.accountId) })),
            explanation: `${right.label} is an income, and incomes have credit balances. Assets, expenses and drawings have debit balances.`,
          });
        }
        return choice({
          prompt: `Which of these accounts shows a debit balance in the trial balance on ${monthEnd(s.b)}?`,
          correct: 'Drawings A/c',
          distractors: credit.map((r) => ({ text: r.label, why: whyNotDebit(r.accountId) })),
          explanation: 'Drawings reduce capital, so Drawings A/c has a debit balance. Capital and the incomes have credit balances.',
        });
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        if (s.ask === 'purchases') {
          return numeric({
            prompt: `What is the balance of Purchases A/c on ${monthEnd(s.b)}?`,
            answer: bal(s.ledger, 'purchases'),
            commonErrors: [
              { value: s.cashGoods + s.chequeGoods + s.assetCost, why: `Debited ${s.asset.words} to Purchases A/c; it was bought for use, not for resale, so it has its own asset account.` },
              { value: s.cashGoods, why: 'Took only the goods bought for cash; goods paid for by cheque are purchases too.' },
              { value: s.chequeGoods, why: 'Took only the goods paid for by cheque; goods bought for cash are purchases too.' },
            ],
            explanation: [
              'Purchases A/c is debited with goods bought for resale, however they are paid for.',
              `Balance = ${F(s.cashGoods)} + ${F(s.chequeGoods)} = ${F(s.cashGoods + s.chequeGoods)} (debit).`,
            ],
          });
        }
        const cheque = s.chequeSale.lines[0].amount;
        return numeric({
          prompt: `What is the balance of Sales A/c on ${monthEnd(s.b)}?`,
          answer: bal(s.ledger, 'sales'),
          commonErrors: [
            { value: s.cashSale + cheque + s.commission, why: 'Credited the commission to Sales A/c; commission is a separate income with its own account.' },
            { value: s.cashSale, why: 'Took only the cash sale; goods sold against a cheque are sales too.' },
            { value: cheque, why: 'Took only the sale paid for by cheque; goods sold for cash are sales too.' },
          ],
          explanation: [
            'Sales A/c is credited with goods sold, however the money is received.',
            `Balance = ${F(s.cashSale)} + ${F(cheque)} = ${F(s.cashSale + cheque)} (credit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const tb = trialBalance(s.ledger);
        const total = tb.debitTotal;
        return numeric({
          prompt: tbTotalPrompt(s.b),
          answer: total,
          commonErrors: errors(
            s.drawings > 0 && { value: total - s.drawings, why: 'Deducted the drawings from capital; in the trial balance Capital A/c and Drawings A/c are shown separately.' },
            { value: s.capital, why: 'Took the capital alone as the credit total; the incomes have credit balances too.' },
            {
              value: total + sideTotal(s.entries, 'cash', 'Cr') + sideTotal(s.entries, 'bank', 'Cr'),
              why: 'Entered the debit-side totals of Cash A/c and Bank A/c instead of their balances; the balance method lists each account at its balance.',
            },
            { value: 2 * total, why: 'Added the two columns together; the total asked for is that of one column.' },
          ),
          explanation: agreed(s.ledger, s.capital + s.cashSale + s.chequeSale.lines[0].amount + s.commission),
        });
      },
      verify: bothWaysAgree,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Credit purchases, credit sales and returns (medium)
// ---------------------------------------------------------------------------------------------------------------

interface CreditMonth {
  b: Business;
  txs: Tx[];
  entries: JournalLine[][];
  ledger: Ledger;
  focus: Tx;
  supplier: string;
  /** The supplier of the second credit purchase: the same one or another. */
  supplier2: string;
  customer: string;
  customer2: string;
  capital: Paise;
  buy1: Paise;
  buy2: Paise;
  returnOut: Paise;
  sell1: Paise;
  sell2: Paise;
  returnIn: Paise;
  /** Goods bought (ask = purchases) or sold (ask = sales) against a cheque. */
  ready: Paise;
  paid: Paise;
  discountReceived: Paise;
  received: Paise;
  discountAllowed: Paise;
  ask: 'purchases' | 'sales';
  creditForm: boolean;
}

/** A round part of a balance (in paise), between a half and four fifths of it, in whole thousands of rupees. */
export const partOf = (rng: Rng, balance: Paise): Paise => Math.floor((balance * rng.pick([50, 60, 70, 80])) / 100 / 100000) * 100000;
/** How a party's account is named in an option: "Mohan's account". */
const optionName = (accountId: string) => (accountId.includes(':') ? `${poss(accountLabel(accountId))} account` : accountLabel(accountId));

const creditMonth = caseTemplate<CreditMonth>({
  id: 'case-cycle-credit-and-returns',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Buying and selling on credit, with returns',
  setup: (rng) => {
    const b = business(rng);
    const [supplier, otherSupplier] = rng.shuffle(SUPPLIERS);
    const [customer, otherCustomer] = rng.shuffle(CUSTOMERS);
    const supplier2 = rng.pick([supplier, otherSupplier]);
    const customer2 = rng.pick([customer, otherCustomer]);
    const capital = amount(rng, 200000, 500000, 50000);
    const buy1 = amount(rng, 40000, 120000, 5000);
    const buy2 = amount(rng, 20000, 80000, 5000);
    const returnOut = amount(rng, 4000, 12000, 1000);
    const sell1 = amount(rng, 30000, 100000, 5000);
    const sell2 = amount(rng, 20000, 70000, 5000);
    const returnIn = amount(rng, 3000, 10000, 1000);
    const ask: 'purchases' | 'sales' = rng.pick(['purchases', 'sales']);
    const ready = amount(rng, 15000, 50000, 5000);
    const e = rng.pick(EXPENSES);
    const expense = pickAmount(rng, e);
    if (returnOut === returnIn || buy1 === buy2 || sell1 === sell2) return null;

    const owedToSupplier = buy1 + (supplier2 === supplier ? buy2 : 0) - returnOut;
    const owedByCustomer = sell1 + (customer2 === customer ? sell2 : 0) - returnIn;
    const paid = partOf(rng, owedToSupplier);
    const received = partOf(rng, owedByCustomer);
    const discountReceived = rng.pick([true, false]) ? rupees(rng.pick([500, 1000, 1500])) : 0;
    const discountAllowed = rng.pick([true, false]) ? rupees(rng.pick([500, 1000, 1500])) : 0;
    if (paid <= 0 || received <= 0) return null;

    const middle = rng.shuffle([
      tx.returnOut(supplier, returnOut),
      tx.creditPurchase(supplier2, buy2),
      tx.returnIn(customer, returnIn),
      tx.creditSale(customer2, sell2),
      ask === 'sales' ? tx.goodsSold('bank', ready) : tx.goodsBought('bank', ready),
    ]);
    const settle = rng.shuffle([tx.paySupplier(supplier, paid, discountReceived), tx.receiveFromCustomer(customer, received, discountAllowed)]);
    const txs = dated(rng, [
      tx.capital('bank', capital),
      tx.creditPurchase(supplier, buy1),
      tx.creditSale(customer, sell1),
      ...middle,
      ...settle,
      tx.expense(e, 'bank', expense),
    ]);
    const entries = entriesOf(txs);
    if (!neverOverdrawn(entries, ['bank'])) return null;
    const ledger = post(entries);
    // Both parties asked about must still have a balance on the right side.
    if (balanceOf(ledger, creditor(supplier))?.side !== 'Cr' || balanceOf(ledger, debtor(customer))?.side !== 'Dr') return null;
    const focus = rng.pick(
      txs.filter((t) => t.key === 'returnOut' || t.key === 'returnIn' || (t.key === 'paySupplier' && discountReceived > 0) || (t.key === 'receiveFromCustomer' && discountAllowed > 0)),
    );
    return {
      b, txs, entries, ledger, focus, supplier, supplier2, customer, customer2, capital, buy1, buy2, returnOut, sell1, sell2, returnIn,
      ready, paid, discountReceived, received, discountAllowed, ask,
      creditForm: rng.pick([true, false]),
    };
  },
  context: (s) =>
    [
      `${s.b.owner} started ${s.b.shop} on 1 ${s.b.month} and deals on credit too.`,
      `${BANKED} The month's transactions:`,
      ...s.txs.map((t) => line(s.b, t)),
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.focus.day} ${s.b.month}.`,
        lines: s.focus.lines,
        explanation: s.focus.steps,
        distractorAccounts: s.focus.distract,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const id = debtor(s.customer);
        const answer = bal(s.ledger, id);
        const same = s.customer2 === s.customer;
        const debits = same ? [s.sell1, s.sell2] : [s.sell1];
        const credits = [s.returnIn, s.received, ...(s.discountAllowed > 0 ? [s.discountAllowed] : [])];
        return numeric({
          prompt: `What is the balance of ${poss(s.customer)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer + s.returnIn, why: `Left out the goods ${s.customer} returned; a return is credited to the customer's account.` },
            { value: answer + 2 * s.returnIn, why: `Added the goods returned to what ${s.customer} owes; a return reduces the amount owed.` },
            s.discountAllowed > 0 && { value: answer + s.discountAllowed, why: `Credited ${s.customer} with the cheque only; the discount allowed also reduces what ${s.customer} owes.` },
            same && { value: answer - s.sell2, why: `Took only the first sale to ${s.customer}; both credit sales are debited to the account.` },
            !same && { value: answer + s.sell2, why: `Added the sale to ${s.customer2} as well; that sale is debited to ${poss(s.customer2)} own account.` },
            { value: answer + 2 * s.received, why: "Added the cheque received to the balance; money received from a customer is credited to the customer's account." },
          ),
          explanation: [
            addUp(`Debit side (goods sold to ${s.customer} on credit)`, debits),
            addUp(`Credit side (goods returned, cheque received${s.discountAllowed > 0 ? ', discount allowed' : ''})`, credits),
            `Balance = ${F(sum(debits))} - ${F(sum(credits))} = ${F(sum(debits) - sum(credits))} (debit): owed by ${s.customer} to the business.`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const id = creditor(s.supplier);
        const answer = bal(s.ledger, id);
        const same = s.supplier2 === s.supplier;
        const credits = same ? [s.buy1, s.buy2] : [s.buy1];
        const debits = [s.returnOut, s.paid, ...(s.discountReceived > 0 ? [s.discountReceived] : [])];
        return numeric({
          prompt: `What is the balance of ${poss(s.supplier)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer + s.returnOut, why: `Left out the goods returned to ${s.supplier}; a return is debited to the supplier's account.` },
            { value: answer + 2 * s.returnOut, why: `Added the goods returned to what is owed to ${s.supplier}; a return reduces the amount owed.` },
            s.discountReceived > 0 && { value: answer + s.discountReceived, why: `Debited ${s.supplier} with the cheque only; the discount received also reduces what is owed.` },
            same && { value: answer - s.buy2, why: `Took only the first purchase from ${s.supplier}; both credit purchases are credited to the account.` },
            !same && { value: answer + s.buy2, why: `Added the purchase from ${s.supplier2} as well; that purchase is credited to ${poss(s.supplier2)} own account.` },
            { value: answer + 2 * s.paid, why: "Added the cheque paid to the balance; money paid to a supplier is debited to the supplier's account." },
          ),
          explanation: [
            addUp(`Credit side (goods bought from ${s.supplier} on credit)`, credits),
            addUp(`Debit side (goods returned, cheque paid${s.discountReceived > 0 ? ', discount received' : ''})`, debits),
            `Balance = ${F(sum(credits))} - ${F(sum(debits))} = ${F(sum(credits) - sum(debits))} (credit): owed to ${s.supplier} by the business.`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const when = monthEnd(s.b);
        if (s.creditForm) {
          const wrong = ['salesReturn', debtor(s.customer), ...(s.discountAllowed > 0 ? ['discountAllowed'] : []), 'purchases'];
          return choice({
            prompt: `Which of these has a credit balance in the trial balance on ${when}?`,
            correct: 'Purchases Return A/c',
            distractors: wrong.map((id) => ({ text: optionName(id), why: whyNotCredit(id) })),
            explanation: 'Purchases Return A/c is credited each time goods are sent back to a supplier, so it has a credit balance: it reduces purchases.',
          });
        }
        const wrong = ['purchasesReturn', creditor(s.supplier), ...(s.discountReceived > 0 ? ['discountReceived'] : []), 'sales'];
        return choice({
          prompt: `Which of these has a debit balance in the trial balance on ${when}?`,
          correct: 'Sales Return A/c',
          distractors: wrong.map((id) => ({ text: optionName(id), why: whyNotDebit(id) })),
          explanation: 'Sales Return A/c is debited each time a customer sends goods back, so it has a debit balance: it reduces sales.',
        });
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        if (s.ask === 'purchases') {
          const gross = s.buy1 + s.buy2 + s.ready;
          const answer = bal(s.ledger, 'purchases') - bal(s.ledger, 'purchasesReturn');
          return numeric({
            prompt: `What are the net purchases of ${s.b.month}?`,
            answer,
            commonErrors: errors(
              { value: gross, why: 'Gave the balance of Purchases A/c; net purchases are purchases less purchases returns.' },
              { value: gross + s.returnOut, why: 'Added the purchases returns; goods sent back reduce the purchases.' },
              { value: gross - s.returnIn, why: 'Deducted the sales returns; it is the goods returned to the supplier that reduce purchases.' },
              { value: answer - s.ready, why: 'Took only the credit purchases; goods paid for by cheque are purchases too.' },
              s.discountReceived > 0 && { value: answer - s.discountReceived, why: 'Deducted the discount received; a cash discount is a separate gain and does not change the purchases.' },
            ),
            explanation: [
              `Purchases: ${F(s.buy1)} + ${F(s.buy2)} + ${F(s.ready)} = ${F(gross)} (two on credit, one by cheque).`,
              `Net purchases = ${F(gross)} - ${F(s.returnOut)} = ${F(gross - s.returnOut)}.`,
            ],
          });
        }
        const gross = s.sell1 + s.sell2 + s.ready;
        const answer = bal(s.ledger, 'sales') - bal(s.ledger, 'salesReturn');
        return numeric({
          prompt: `What are the net sales of ${s.b.month}?`,
          answer,
          commonErrors: errors(
            { value: gross, why: 'Gave the balance of Sales A/c; net sales are sales less sales returns.' },
            { value: gross + s.returnIn, why: 'Added the sales returns; goods that come back reduce the sales.' },
            { value: gross - s.returnOut, why: 'Deducted the purchases returns; it is the goods returned by the customer that reduce sales.' },
            { value: answer - s.ready, why: 'Took only the credit sales; goods sold against a cheque are sales too.' },
            s.discountAllowed > 0 && { value: answer - s.discountAllowed, why: 'Deducted the discount allowed; a cash discount is a separate loss and does not change the sales.' },
          ),
          explanation: [
            `Sales: ${F(s.sell1)} + ${F(s.sell2)} + ${F(s.ready)} = ${F(gross)} (two on credit, one against a cheque).`,
            `Net sales = ${F(gross)} - ${F(s.returnIn)} = ${F(gross - s.returnIn)}.`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const tb = trialBalance(s.ledger);
        const total = tb.debitTotal;
        return numeric({
          prompt: tbTotalPrompt(s.b),
          answer: total,
          commonErrors: errors(
            { value: total - s.returnOut - s.returnIn, why: 'Showed purchases and sales net of returns; the two returns accounts have balances of their own in the trial balance.' },
            { value: total - s.returnIn + s.returnOut, why: 'Listed Purchases Return A/c in the debit column and Sales Return A/c in the credit column, which gives this debit total; it is Sales Return A/c that has the debit balance.' },
            { value: total + bal(s.ledger, creditor(s.supplier)), why: `Listed ${poss(s.supplier)} balance in the debit column beside the customers; a creditor's balance goes in the credit column.` },
            { value: 2 * total, why: 'Added the two columns together; the total asked for is that of one column.' },
          ),
          // Creditors less the returns and discount, plus those two accounts, come to the credit purchases less the cheque.
          explanation: agreed(s.ledger, s.capital + s.buy1 + s.buy2 - s.paid + s.sell1 + s.sell2 + (s.ask === 'sales' ? s.ready : 0)),
        });
      },
      verify: bothWaysAgree,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Opening balances, then a month's transactions (medium)
// ---------------------------------------------------------------------------------------------------------------

interface OpeningMonth {
  b: Business;
  /** The balances given on the 1st, as the case lists them (capital is not given). */
  given: { label: string; accountId: string; side: 'Dr' | 'Cr'; amount: Paise }[];
  txs: Tx[];
  /** The opening entry, then the month's entries. */
  entries: JournalLine[][];
  ledger: Ledger;
  focus: Tx;
  customer: string;
  supplier: string;
  cash: Paise;
  bank: Paise;
  stock: Paise;
  owedBy: Paise;
  fixed: Named;
  fixedCost: Paise;
  owedTo: Paise;
  loan: Paise;
  capital: Paise;
  sale: Paise;
  purchase: Paise;
  received: Paise;
  discountAllowed: Paise;
  paid: Paise;
  discountReceived: Paise;
  expenseMode: Mode;
  expense: Paise;
  drawings: Paise;
  drawingsMode: Mode;
  cashSale: Paise;
  ask: 'customer' | 'supplier';
}

const openingMonth = caseTemplate<OpeningMonth>({
  id: 'case-cycle-opening-balances',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Opening balances and a month of trading',
  setup: (rng) => {
    // Balances are brought forward by an opening entry when a new accounting year begins, so the month is April.
    const b: Business = { ...business(rng), month: 'April', last: 30 };
    const customer = rng.pick(CUSTOMERS);
    const supplier = rng.pick(SUPPLIERS);
    const cash = amount(rng, 8000, 25000, 1000);
    const bank = amount(rng, 60000, 150000, 5000);
    const stock = amount(rng, 40000, 120000, 5000);
    const owedBy = amount(rng, 15000, 45000, 1000);
    const fixed = rng.pick(ASSETS);
    const fixedCost = pickAmount(rng, fixed);
    const owedTo = amount(rng, 20000, 50000, 1000);
    const loan = rng.pick([true, false]) ? amount(rng, 40000, 100000, 10000) : 0;
    const assets = cash + bank + stock + owedBy + fixedCost;
    const capital = assets - owedTo - loan;
    if (capital < rupees(100000)) return null;

    const sale = amount(rng, 15000, 50000, 5000);
    const purchase = amount(rng, 20000, 60000, 5000);
    const received = partOf(rng, owedBy + sale);
    const paid = partOf(rng, owedTo + purchase);
    const discountAllowed = rng.pick([true, false]) ? rupees(rng.pick([500, 1000])) : 0;
    const discountReceived = rng.pick([true, false]) ? rupees(rng.pick([500, 1000])) : 0;
    const e = rng.pick(EXPENSES);
    const expense = pickAmount(rng, e);
    const expenseMode: Mode = expense + rupees(2000) <= cash && rng.pick([true, false]) ? 'cash' : 'bank';
    // A business with a loan has one balance more to list, so it has one transaction fewer.
    const sixth = loan > 0 ? 'none' : rng.pick(['drawings', 'cashSale']);
    const drawingsMode: Mode = rng.pick(['cash', 'bank']);
    const drawings = sixth === 'drawings' ? amount(rng, 3000, 6000, 1000) : 0;
    const cashSale = sixth === 'cashSale' ? amount(rng, 5000, 20000, 1000) : 0;
    if (received <= 0 || paid <= 0) return null;

    const given = [
      { label: 'Cash', accountId: 'cash', side: 'Dr' as const, amount: cash },
      { label: 'Bank', accountId: 'bank', side: 'Dr' as const, amount: bank },
      { label: 'Stock', accountId: 'stock', side: 'Dr' as const, amount: stock },
      { label: `${customer} (debtor)`, accountId: debtor(customer), side: 'Dr' as const, amount: owedBy },
      { label: accountLabel(fixed.id).replace(' A/c', ''), accountId: fixed.id, side: 'Dr' as const, amount: fixedCost },
      { label: `${supplier} (creditor)`, accountId: creditor(supplier), side: 'Cr' as const, amount: owedTo },
      ...(loan > 0 ? [{ label: 'Bank Loan', accountId: 'bankLoan', side: 'Cr' as const, amount: loan }] : []),
    ];
    const openingEntry = [...given.map((g) => (g.side === 'Dr' ? dr(g.accountId, g.amount) : cr(g.accountId, g.amount))), cr('capital', capital)];
    const first = rng.shuffle([tx.creditSale(customer, sale), tx.creditPurchase(supplier, purchase)]);
    const rest = rng.shuffle([
      tx.receiveFromCustomer(customer, received, discountAllowed),
      tx.paySupplier(supplier, paid, discountReceived),
      tx.expense(e, expenseMode, expense),
      ...(drawings ? [tx.drawings(b.owner, drawingsMode, drawings)] : []),
      ...(cashSale ? [tx.goodsSold('cash', cashSale)] : []),
    ]);
    // The month's transactions start after the 1st, the day of the opening balances.
    const txs = dated(rng, [...first, ...rest], true);
    const entries = [openingEntry, ...entriesOf(txs)];
    if (!neverOverdrawn(entries, ['cash', 'bank'])) return null;
    const ledger = post(entries);
    if (balanceOf(ledger, creditor(supplier))?.side !== 'Cr' || balanceOf(ledger, debtor(customer))?.side !== 'Dr') return null;
    return {
      b, given, txs, entries, ledger, customer, supplier, cash, bank, stock, owedBy, fixed, fixedCost, owedTo, loan, capital,
      sale, purchase, received, discountAllowed, paid, discountReceived, expenseMode, expense, drawings, drawingsMode, cashSale,
      focus: rng.pick(txs.filter((t) => t.key !== 'saleCash' && !t.key.startsWith('expense'))),
      ask: rng.pick(['customer', 'supplier']),
    };
  },
  context: (s) =>
    [
      `Opening balances of ${poss(s.b.owner)} ${shopName(s.b)} on 1 ${s.b.month} (capital is the balancing figure):`,
      ...s.given.map((g) => `${g.label}: ${F(g.amount)}`),
      `Transactions in ${s.b.month} (cheques received are banked the same day):`,
      ...s.txs.map((t) => line(s.b, t)),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const assets = s.given.filter((g) => g.side === 'Dr').map((g) => g.amount);
        const liabilities = s.given.filter((g) => g.side === 'Cr').map((g) => g.amount);
        const a = sum(assets);
        const l = sum(liabilities);
        return numeric({
          prompt: `What is ${poss(s.b.owner)} capital on 1 ${s.b.month}?`,
          answer: bal(post([s.entries[0]]), 'capital'),
          commonErrors: errors(
            { value: a, why: 'Took the total of the assets as the capital, without deducting what the business owes.' },
            { value: a + l, why: 'Added the liabilities to the assets; capital is assets less liabilities.' },
            s.loan > 0 && { value: a - s.owedTo, why: 'Deducted the creditor but not the bank loan; a loan is also a liability.' },
            { value: a - l - 2 * s.owedBy, why: `Treated ${s.customer}, a debtor, as a liability; a debtor owes the business and is an asset.` },
            { value: a - l - s.stock, why: 'Left the stock out of the assets; goods in hand belong to the business.' },
          ),
          explanation: [addUp('Assets', assets), addUp('Liabilities', liabilities), `Capital = ${F(a)} - ${F(l)} = ${F(a - l)}.`],
        });
      },
      verify: worked,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const fixedName = accountLabel(s.fixed.id).replace(' A/c', '');
        const owed = [`${poss(s.supplier)} account`, ...(s.loan > 0 ? ['Bank Loan A/c'] : [])];
        return choice({
          prompt: `In the opening entry passed on 1 ${s.b.month}, which accounts are credited?`,
          correct: listed([...owed, 'Capital A/c']),
          distractors: [
            { text: 'Capital A/c only', why: 'Left the liabilities out; what the business owes is credited in the opening entry along with the capital.' },
            {
              text: listed([`${poss(s.customer)} account`, ...owed, 'Capital A/c']),
              why: `Credited every personal account; ${s.customer} is a debtor, an asset, and is debited.`,
            },
            { text: `Cash, Bank, Stock, ${s.customer} and ${fixedName}`, why: 'Mixed up the two sides; these are the assets, and assets are debited in the opening entry.' },
            { text: `${listed(owed)} only`, why: 'Left capital out; the excess of assets over liabilities is credited to Capital A/c.' },
            { text: 'Stock A/c and Capital A/c', why: 'Treated the opening stock as a credit; stock is an asset and is debited.' },
          ],
          explanation: `The opening entry debits every asset and credits every liability. Capital A/c is credited with the difference, ${F(s.capital)}.`,
        });
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.focus.day} ${s.b.month}.`,
        lines: s.focus.lines,
        explanation: s.focus.steps,
        distractorAccounts: s.focus.distract,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        if (s.ask === 'customer') {
          const answer = bal(s.ledger, debtor(s.customer));
          const credits = [s.received, ...(s.discountAllowed > 0 ? [s.discountAllowed] : [])];
          return numeric({
            prompt: `What is the balance of ${poss(s.customer)} account on ${monthEnd(s.b)}?`,
            answer,
            commonErrors: errors(
              { value: Math.abs(answer - s.owedBy), why: `Left out the opening balance; the account starts with what ${s.customer} already owed on 1 ${s.b.month}.` },
              { value: Math.abs(answer - s.sale), why: `Left out the goods sold to ${s.customer} on credit during the month; they are debited to the account.` },
              { value: s.owedBy + s.sale, why: 'Stopped at the total of the debit side; what was received is credited and reduces the balance.' },
              s.discountAllowed > 0 && { value: answer + s.discountAllowed, why: `Credited ${s.customer} with the cheque only; the discount allowed also reduces what ${s.customer} owes.` },
              { value: answer + 2 * s.received, why: "Added the cheque received to the balance; money received from a customer is credited to the customer's account." },
            ),
            explanation: [
              `Debit side (opening balance and the credit sale): ${F(s.owedBy)} + ${F(s.sale)} = ${F(s.owedBy + s.sale)}.`,
              addUp(`Credit side (cheque received${s.discountAllowed > 0 ? ' and discount allowed' : ''})`, credits),
              `Balance = ${F(s.owedBy + s.sale)} - ${F(sum(credits))} = ${F(s.owedBy + s.sale - sum(credits))} (debit).`,
            ],
          });
        }
        const answer = bal(s.ledger, creditor(s.supplier));
        const debits = [s.paid, ...(s.discountReceived > 0 ? [s.discountReceived] : [])];
        return numeric({
          prompt: `What is the balance of ${poss(s.supplier)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: Math.abs(answer - s.owedTo), why: `Left out the opening balance; the account starts with what was already owed to ${s.supplier} on 1 ${s.b.month}.` },
            { value: Math.abs(answer - s.purchase), why: `Left out the goods bought from ${s.supplier} on credit during the month; they are credited to the account.` },
            { value: s.owedTo + s.purchase, why: 'Stopped at the total of the credit side; what was paid is debited and reduces the balance.' },
            s.discountReceived > 0 && { value: answer + s.discountReceived, why: `Debited ${s.supplier} with the cheque only; the discount received also reduces what is owed.` },
            { value: answer + 2 * s.paid, why: "Added the cheque paid to the balance; money paid to a supplier is debited to the supplier's account." },
          ),
          explanation: [
            `Credit side (opening balance and the credit purchase): ${F(s.owedTo)} + ${F(s.purchase)} = ${F(s.owedTo + s.purchase)}.`,
            addUp(`Debit side (cheque paid${s.discountReceived > 0 ? ' and discount received' : ''})`, debits),
            `Balance = ${F(s.owedTo + s.purchase)} - ${F(sum(debits))} = ${F(s.owedTo + s.purchase - sum(debits))} (credit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = bal(s.ledger, 'bank');
        const outs = [s.paid, ...(s.expenseMode === 'bank' ? [s.expense] : []), ...(s.drawings > 0 && s.drawingsMode === 'bank' ? [s.drawings] : [])];
        return numeric({
          prompt: `What is the balance of Bank A/c on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: Math.abs(answer - s.bank), why: `Left out the opening balance; Bank A/c starts with the balance of 1 ${s.b.month}.` },
            { value: answer - 2 * s.received, why: `Deducted the cheque from ${s.customer}; money received is debited to Bank A/c and increases the balance.` },
            { value: answer + s.sale, why: `Added the goods sold to ${s.customer} on credit; no money came in when they were sold.` },
            { value: answer - s.purchase, why: `Deducted the goods bought from ${s.supplier} on credit; nothing was paid when they were bought.` },
            s.discountAllowed > 0 && { value: answer + s.discountAllowed, why: 'Banked the discount allowed as well; only the cheque went into the bank.' },
            s.discountReceived > 0 && { value: answer - s.discountReceived, why: 'Deducted the discount received as well; only the cheque went out of the bank.' },
            s.expenseMode === 'cash' && { value: answer - s.expense, why: 'Deducted the expense paid in cash from the bank; only cheques reduce the bank balance.' },
          ),
          explanation: [
            `Opening balance ${F(s.bank)}; cheque received from ${s.customer} ${F(s.received)}.`,
            addUp('Cheques paid out', outs),
            `Balance = ${F(s.bank)} + ${F(s.received)} - ${F(sum(outs))} = ${F(s.bank + s.received - sum(outs))} (debit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const sold = s.sale + s.cashSale;
        return choice({
          prompt: `Goods were bought and sold during ${s.b.month}. How does Stock A/c appear in the trial balance on ${monthEnd(s.b)}?`,
          correct: `${F(s.stock)} in the debit column: the opening stock, unchanged`,
          distractors: present<Distractor>(
            { text: `${F(s.stock + s.purchase)} in the debit column: opening stock plus goods bought`, why: 'Debited the goods bought to Stock A/c; goods bought are debited to Purchases A/c, so Stock A/c is not touched.' },
            s.stock + s.purchase > sold && {
              text: `${F(s.stock + s.purchase - sold)} in the debit column: opening stock plus goods bought less goods sold`,
              why: 'Worked Stock A/c like a cash balance; goods bought go to Purchases A/c and goods sold to Sales A/c, so Stock A/c is not touched.',
            },
            { text: 'Not at all: stock is not a ledger balance', why: 'Confused the opening stock with the closing stock; the opening stock is a ledger balance and is listed.' },
            { text: `${F(s.stock)} in the credit column: the opening stock, unchanged`, why: 'Put an asset in the credit column; stock is an asset and has a debit balance.' },
          ),
          explanation: `During the period goods bought are debited to Purchases A/c and goods sold are credited to Sales A/c. Stock A/c keeps its opening balance of ${F(s.stock)}, a debit balance, until the year end.`,
        });
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const tb = trialBalance(s.ledger);
        const total = tb.debitTotal;
        return numeric({
          prompt: tbTotalPrompt(s.b),
          answer: total,
          commonErrors: errors(
            { value: total - s.stock, why: `Left Stock A/c out because no entry touched it in ${s.b.month}; its opening balance is still in the ledger.` },
            {
              value: total - bal(s.ledger, 'cash') - bal(s.ledger, 'bank') + s.cash + s.bank,
              why: `Listed Cash A/c and Bank A/c at their balances of 1 ${s.b.month} instead of their closing balances.`,
            },
            s.loan > 0 && { value: total - s.loan, why: 'Left the bank loan out because nothing happened to it in the month; an unchanged balance still appears.' },
            s.drawings > 0 && { value: total - s.drawings, why: 'Deducted the drawings from capital; in the trial balance Capital A/c and Drawings A/c are shown separately.' },
            { value: 2 * total, why: 'Added the two columns together; the total asked for is that of one column.' },
          ),
          explanation: agreed(s.ledger, s.capital + s.owedTo + s.purchase - s.paid + s.loan + s.sale + s.cashSale),
        });
      },
      verify: bothWaysAgree,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. A month with GST (medium)
// ---------------------------------------------------------------------------------------------------------------

export const CITIES: [string, string][] = [
  ['Jaipur', 'Rajasthan'], ['Indore', 'Madhya Pradesh'], ['Kochi', 'Kerala'], ['Pune', 'Maharashtra'],
  ['Lucknow', 'Uttar Pradesh'], ['Coimbatore', 'Tamil Nadu'], ['Surat', 'Gujarat'], ['Patna', 'Bihar'],
];

/** The GST of a case: one rate, and every supply either within the State or between States. */
export interface Gst {
  rate: number;
  intra: boolean;
}
export const gstOn = (g: Gst, base: Paise): Paise => (base * g.rate) / 100;
/** The tax lines of an entry: CGST and SGST in equal halves within the State, IGST between States. */
const gstLines = (g: Gst, base: Paise, dir: 'input' | 'output', side: 'Dr' | 'Cr'): JournalLine[] => {
  const tax = gstOn(g, base);
  const put = side === 'Dr' ? dr : cr;
  return g.intra ? [put(`${dir}CGST`, tax / 2), put(`${dir}SGST`, tax / 2)] : [put(`${dir}IGST`, tax)];
};
/** "Input CGST A/c and Input SGST A/c" or "Input IGST A/c". */
const gstAccounts = (g: Gst, dir: 'Input' | 'Output') => (g.intra ? `${dir} CGST A/c and ${dir} SGST A/c` : `${dir} IGST A/c`);
const taxSplit = (g: Gst, base: Paise) =>
  g.intra ? `${F(gstOn(g, base) / 2)} each of CGST and SGST (${g.rate / 2}% each)` : `IGST of ${F(gstOn(g, base))}`;

export const gstTx = {
  buy: (g: Gst, base: Paise, supplier: string | null): Draft => {
    const total = base + gstOn(g, base);
    return {
      key: supplier ? 'gstBuyCredit' : 'gstBuyCheque',
      text: supplier ? `Bought goods from ${supplier} on credit ${F(base)} plus GST.` : `Bought goods ${F(base)} plus GST, paid by cheque.`,
      lines: [dr('purchases', base), ...gstLines(g, base, 'input', 'Dr'), cr(supplier ? creditor(supplier) : 'bank', total)],
      steps: [
        `Purchases A/c is debited with the price of the goods without GST, ${F(base)}.`,
        `GST at ${g.rate}% of ${F(base)} is ${F(gstOn(g, base))}: ${taxSplit(g, base)}. It can be set off against GST on sales, so ${gstAccounts(g, 'Input')} ${g.intra ? 'are' : 'is'} debited.`,
        supplier
          ? `${supplier} is owed the invoice total, ${F(base)} + ${F(gstOn(g, base))} = ${F(total)}, so ${poss(supplier)} account is credited.`
          : `The cheque is for the invoice total, ${F(base)} + ${F(gstOn(g, base))} = ${F(total)}, so Bank A/c is credited.`,
      ],
      distract: g.intra ? ['outputCGST', 'outputSGST', 'inputIGST'] : ['outputIGST', 'inputCGST'],
    };
  },
  sell: (g: Gst, base: Paise, customer: string | null): Draft => {
    const total = base + gstOn(g, base);
    return {
      key: customer ? 'gstSellCredit' : 'gstSellCheque',
      text: customer ? `Sold goods to ${customer} on credit ${F(base)} plus GST.` : `Sold goods ${F(base)} plus GST; the cheque received was banked the same day.`,
      lines: [dr(customer ? debtor(customer) : 'bank', total), cr('sales', base), ...gstLines(g, base, 'output', 'Cr')],
      steps: [
        customer
          ? `${customer} owes the invoice total, ${F(base)} + ${F(gstOn(g, base))} = ${F(total)}, so ${poss(customer)} account is debited.`
          : `The cheque is for the invoice total, ${F(base)} + ${F(gstOn(g, base))} = ${F(total)}, so Bank A/c is debited.`,
        `Sales A/c is credited with the price of the goods without GST, ${F(base)}.`,
        `GST at ${g.rate}% of ${F(base)} is ${F(gstOn(g, base))}: ${taxSplit(g, base)}. It is collected for the government, so ${gstAccounts(g, 'Output')} ${g.intra ? 'are' : 'is'} credited.`,
      ],
      distract: g.intra ? ['inputCGST', 'inputSGST', 'outputIGST'] : ['inputIGST', 'outputCGST'],
    };
  },
  returnOut: (g: Gst, base: Paise, supplier: string): Draft => {
    const total = base + gstOn(g, base);
    return {
      key: 'gstReturnOut',
      text: `Goods returned to ${supplier} ${F(base)} plus GST.`,
      lines: [dr(creditor(supplier), total), cr('purchasesReturn', base), ...gstLines(g, base, 'input', 'Cr')],
      steps: [
        `${supplier} is owed less by the price and the GST of the goods sent back, ${F(base)} + ${F(gstOn(g, base))} = ${F(total)}, so ${poss(supplier)} account is debited.`,
        `Purchases Return A/c is credited with the price without GST, ${F(base)}.`,
        `The GST on these goods can no longer be claimed, so ${gstAccounts(g, 'Input')} ${g.intra ? 'are' : 'is'} credited: ${taxSplit(g, base)}.`,
      ],
      distract: g.intra ? ['outputCGST', 'purchases', 'salesReturn'] : ['outputIGST', 'purchases', 'salesReturn'],
    };
  },
  returnIn: (g: Gst, base: Paise, customer: string): Draft => {
    const total = base + gstOn(g, base);
    return {
      key: 'gstReturnIn',
      text: `Goods returned by ${customer} ${F(base)} plus GST.`,
      lines: [dr('salesReturn', base), ...gstLines(g, base, 'output', 'Dr'), cr(debtor(customer), total)],
      steps: [
        `Sales Return A/c is debited with the price without GST, ${F(base)}.`,
        `The GST charged on these goods is no longer due to the government, so ${gstAccounts(g, 'Output')} ${g.intra ? 'are' : 'is'} debited: ${taxSplit(g, base)}.`,
        `${customer} owes less by the price and the GST, ${F(base)} + ${F(gstOn(g, base))} = ${F(total)}, so ${poss(customer)} account is credited.`,
      ],
      distract: g.intra ? ['inputCGST', 'sales', 'purchasesReturn'] : ['inputIGST', 'sales', 'purchasesReturn'],
    };
  },
};

interface GstMonth {
  b: Business;
  city: string;
  state: string;
  g: Gst;
  txs: Tx[];
  entries: JournalLine[][];
  ledger: Ledger;
  focus: Tx;
  supplier: string;
  customer: string;
  capital: Paise;
  buyCredit: Paise;
  buyCheque: Paise;
  sellCredit: Paise;
  sellCheque: Paise;
  /** Goods returned to the supplier or by the customer (prices without GST); 0 when there is no such return. */
  returnOut: Paise;
  returnIn: Paise;
  paid: Paise;
  received: Paise;
  ask: 'supplier' | 'customer';
}

const gstMonth = caseTemplate<GstMonth>({
  id: 'case-cycle-gst-month',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A month of trading with GST',
  setup: (rng) => {
    const b = business(rng);
    const [city, state] = rng.pick(CITIES);
    const g: Gst = { rate: rng.pick([5, 18]), intra: rng.pick([true, false]) };
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick(CUSTOMERS);
    const capital = amount(rng, 200000, 500000, 50000);
    const buyCredit = amount(rng, 40000, 100000, 5000);
    const buyCheque = amount(rng, 20000, 50000, 5000);
    const sellCredit = amount(rng, 60000, 140000, 5000);
    const sellCheque = amount(rng, 30000, 70000, 5000);
    const returned = rng.pick(['out', 'in', 'none']);
    const returnBase = amount(rng, 4000, 12000, 2000);
    const returnOut = returned === 'out' ? returnBase : 0;
    const returnIn = returned === 'in' ? returnBase : 0;
    const other = rng.pick(['salaries', 'drawings']);
    const otherAmount = amount(rng, 6000, 15000, 1000);
    // GST must be payable for the month, and the two purchases (and the two sales) must differ.
    if (sellCredit + sellCheque - returnIn <= buyCredit + buyCheque - returnOut || buyCredit === buyCheque || sellCredit === sellCheque) return null;

    const paid = partOf(rng, buyCredit + gstOn(g, buyCredit) - returnOut - gstOn(g, returnOut));
    const received = partOf(rng, sellCredit + gstOn(g, sellCredit) - returnIn - gstOn(g, returnIn));
    if (paid <= 0 || received <= 0) return null;
    const middle = rng.shuffle([
      gstTx.buy(g, buyCheque, null),
      gstTx.sell(g, sellCheque, null),
      ...(returnOut ? [gstTx.returnOut(g, returnOut, supplier)] : []),
      ...(returnIn ? [gstTx.returnIn(g, returnIn, customer)] : []),
    ]);
    const closing = rng.shuffle([
      tx.paySupplier(supplier, paid, 0),
      tx.receiveFromCustomer(customer, received, 0),
      // Salaries and drawings carry no GST, so neither raises a question about input credit.
      other === 'salaries' ? tx.expense(SALARIES, 'bank', otherAmount) : tx.drawings(b.owner, 'bank', otherAmount),
    ]);
    const txs = dated(rng, [tx.capital('bank', capital), gstTx.buy(g, buyCredit, supplier), gstTx.sell(g, sellCredit, customer), ...middle, ...closing]);
    const entries = entriesOf(txs);
    if (!neverOverdrawn(entries, ['bank'])) return null;
    const ledger = post(entries);
    if (balanceOf(ledger, creditor(supplier))?.side !== 'Cr' || balanceOf(ledger, debtor(customer))?.side !== 'Dr') return null;
    return {
      b, city, state, g, txs, entries, ledger, supplier, customer, capital, buyCredit, buyCheque, sellCredit, sellCheque, returnOut, returnIn, paid, received,
      focus: rng.pick(txs.filter((t) => t.key.startsWith('gst'))),
      ask: rng.pick(['supplier', 'customer']),
    };
  },
  context: (s) =>
    [
      `${s.b.owner} started ${s.b.shop} in ${s.city}, ${s.state}, on 1 ${s.b.month}. All goods carry GST at ${s.g.rate}%.`,
      s.g.intra
        ? `Every purchase and sale is within ${s.state} (intra-State): CGST and SGST at ${s.g.rate / 2}% each.`
        : `Every purchase and sale is with a party outside ${s.state} (inter-State): IGST at ${s.g.rate}%.`,
      `No GST has been set off or paid to the government yet. ${BANKED}`,
      ...s.txs.map((t) => line(s.b, t)),
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.focus.day} ${s.b.month}.`,
        lines: s.focus.lines,
        explanation: s.focus.steps,
        distractorAccounts: s.focus.distract,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { g } = s;
        const supplier = s.ask === 'supplier';
        const who = supplier ? s.supplier : s.customer;
        const base = supplier ? s.buyCredit : s.sellCredit;
        const back = supplier ? s.returnOut : s.returnIn;
        const settled = supplier ? s.paid : s.received;
        const invoice = base + gstOn(g, base);
        const backTotal = back + gstOn(g, back);
        const answer = bal(s.ledger, supplier ? creditor(who) : debtor(who));
        const side = supplier ? 'credit' : 'debit';
        return numeric({
          prompt: `What is the balance of ${poss(who)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            {
              value: base - back - settled,
              why: supplier
                ? `Credited ${who} with the price of the goods only; the supplier is owed the GST on them as well.`
                : `Debited ${who} with the price of the goods only; the customer owes the GST on them as well.`,
            },
            g.intra && {
              value: base + gstOn(g, base) / 2 - back - gstOn(g, back) / 2 - settled,
              why: `Added only one of the two taxes; the invoice carries CGST and SGST, ${g.rate / 2}% each.`,
            },
            !g.intra && {
              value: base + gstOn(g, base) / 2 - back - gstOn(g, back) / 2 - settled,
              why: `Added only half the tax, as if it were split into CGST and SGST; IGST is charged at the full ${g.rate}%.`,
            },
            back > 0 && { value: answer + gstOn(g, back), why: 'Took the goods returned at their price without GST; the GST on them is reversed as well.' },
            back > 0 && { value: answer + backTotal, why: `Left out the goods returned; a return ${supplier ? `is debited to ${poss(who)} account and reduces what is owed` : `is credited to ${poss(who)} account and reduces what is due`}.` },
            { value: answer + 2 * settled, why: `Added the cheque to the balance; a cheque ${supplier ? 'paid to a supplier' : 'received from a customer'} reduces the balance of the account.` },
            { value: invoice, why: back > 0 ? 'Gave the invoice total; the goods returned and the cheque on account both reduce the balance.' : 'Gave the invoice total; the cheque on account reduces the balance.' },
          ),
          explanation: [
            `GST on the goods: ${g.rate}% of ${F(base)} = ${F(gstOn(g, base))}.`,
            `Invoice total: ${F(base)} + ${F(gstOn(g, base))} = ${F(invoice)}.`,
            ...(back > 0 ? [`Goods returned, with their GST: ${g.rate}% of ${F(back)} = ${F(gstOn(g, back))}; ${F(back)} + ${F(gstOn(g, back))} = ${F(backTotal)}.`] : []),
            back > 0
              ? `Balance = ${F(invoice)} - ${F(backTotal)} - ${F(settled)} = ${F(invoice - backTotal - settled)} (${side}).`
              : `Balance = ${F(invoice)} - ${F(settled)} = ${F(invoice - settled)} (${side}).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { g } = s;
        const account = g.intra ? 'inputCGST' : 'inputIGST';
        const rate = g.intra ? g.rate / 2 : g.rate;
        const bought = s.buyCredit + s.buyCheque;
        const net = bought - s.returnOut;
        const answer = bal(s.ledger, account);
        return numeric({
          prompt: `What is the balance of ${accountLabel(account)} on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            g.intra && { value: 2 * answer, why: `Charged the whole ${g.rate}% as CGST; the tax is shared equally between CGST and SGST.` },
            !g.intra && { value: answer / 2, why: `Halved the tax as if it were CGST and SGST; on an inter-State purchase the whole ${g.rate}% is IGST.` },
            {
              value: (s.buyCredit * rate) / 100,
              why: `Took the tax on the credit purchase alone; the goods paid for by cheque carry input GST too${s.returnOut > 0 ? ', and the return reduces it' : ''}.`,
            },
            s.returnOut > 0 && { value: (bought * rate) / 100, why: 'Did not reverse the tax on the goods returned to the supplier; that input GST can no longer be claimed.' },
            { value: bal(s.ledger, g.intra ? 'outputCGST' : 'outputIGST'), why: 'Gave the tax on the sales; input GST is the tax paid on purchases.' },
          ),
          explanation: [
            `Goods bought: ${F(s.buyCredit)} + ${F(s.buyCheque)} = ${F(bought)}.`,
            ...(s.returnOut > 0 ? [`Less goods returned: ${F(bought)} - ${F(s.returnOut)} = ${F(net)}.`] : []),
            `${accountLabel(account)}: ${rate}% of ${F(net)} = ${F((net * rate) / 100)} (debit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { g } = s;
        const account = g.intra ? 'outputSGST' : 'outputIGST';
        const rate = g.intra ? g.rate / 2 : g.rate;
        const sold = s.sellCredit + s.sellCheque;
        const net = sold - s.returnIn;
        const answer = bal(s.ledger, account);
        return numeric({
          prompt: `What is the balance of ${accountLabel(account)} on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            g.intra && { value: 2 * answer, why: `Charged the whole ${g.rate}% as SGST; the tax is shared equally between CGST and SGST.` },
            !g.intra && { value: answer / 2, why: `Halved the tax as if it were CGST and SGST; on an inter-State sale the whole ${g.rate}% is IGST.` },
            {
              value: (s.sellCredit * rate) / 100,
              why: `Took the tax on the credit sale alone; the goods sold against a cheque carry output GST too${s.returnIn > 0 ? ', and the return reduces it' : ''}.`,
            },
            s.returnIn > 0 && { value: (sold * rate) / 100, why: 'Did not reverse the tax on the goods the customer returned; that output GST is no longer due.' },
            { value: bal(s.ledger, g.intra ? 'inputSGST' : 'inputIGST'), why: 'Gave the tax on the purchases; output GST is the tax charged on sales.' },
          ),
          explanation: [
            `Goods sold: ${F(s.sellCredit)} + ${F(s.sellCheque)} = ${F(sold)}.`,
            ...(s.returnIn > 0 ? [`Less goods returned: ${F(sold)} - ${F(s.returnIn)} = ${F(net)}.`] : []),
            `${accountLabel(account)}: ${rate}% of ${F(net)} = ${F((net * rate) / 100)} (credit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { g } = s;
        const accounts = (dir: string) => (g.intra ? [`${dir}CGST`, `${dir}SGST`] : [`${dir}IGST`]);
        const output = sum(accounts('output').map((id) => bal(s.ledger, id)));
        const input = sum(accounts('input').map((id) => bal(s.ledger, id)));
        const sold = s.sellCredit + s.sellCheque - s.returnIn;
        const bought = s.buyCredit + s.buyCheque - s.returnOut;
        return numeric({
          prompt: `Input GST is now set off against output GST. How much GST${g.intra ? ' (CGST and SGST together)' : ''} does ${s.b.owner} have to pay to the government for ${s.b.month}?`,
          answer: output - input,
          commonErrors: errors(
            { value: output + input, why: 'Added the input GST to the output GST; input GST is tax already paid and is deducted.' },
            { value: output, why: 'Gave the whole output GST; the input GST paid on purchases is set off against it.' },
            g.intra && { value: (output - input) / 2, why: 'Gave the CGST payable alone; SGST of the same amount is payable too.' },
            { value: input, why: 'Gave the input GST; that is the credit available, not the tax payable.' },
            (s.returnIn > 0 || s.returnOut > 0) && {
              value: gstOn(g, s.sellCredit + s.sellCheque) - gstOn(g, s.buyCredit + s.buyCheque),
              why: 'Ignored the goods returned; the GST on a return is reversed.',
            },
          ),
          explanation: [
            `Output GST (sales less returns): ${g.rate}% of ${F(sold)} = ${F(gstOn(g, sold))}.`,
            `Input GST (purchases less returns): ${g.rate}% of ${F(bought)} = ${F(gstOn(g, bought))}.`,
            `GST payable = ${F(gstOn(g, sold))} - ${F(gstOn(g, bought))} = ${F(gstOn(g, sold) - gstOn(g, bought))}.`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice({
          prompt: `Before any set-off, how does GST appear in the trial balance on ${monthEnd(s.b)}?`,
          correct: 'Input GST in the debit column, output GST in the credit column',
          distractors: [
            {
              text: 'Input GST in the credit column, output GST in the debit column',
              why: 'Reversed the two; input GST is tax paid that can be recovered (an asset) and output GST is tax collected for the government (a liability).',
            },
            { text: 'Only the net GST payable, in the credit column', why: 'Set the taxes off in the head; until the set-off entry is passed, each GST account keeps its own balance.' },
            { text: 'Nowhere: the GST is included in Purchases A/c and Sales A/c', why: 'Added the tax to the price of the goods; purchases and sales are recorded without GST, which has accounts of its own.' },
            { text: 'Input GST and output GST both in the debit column, as taxes are expenses', why: 'Treated GST as an expense; the trader only collects it and passes it on, so output GST is a liability.' },
          ],
          explanation: `${gstAccounts(s.g, 'Input')} ${s.g.intra ? 'hold' : 'holds'} tax paid on purchases, which will be set off: a debit balance. ${gstAccounts(s.g, 'Output')} ${s.g.intra ? 'hold' : 'holds'} tax collected on sales, owed to the government: a credit balance.`,
        }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const tb = trialBalance(s.ledger);
        const total = tb.debitTotal;
        const input = sum((s.g.intra ? ['inputCGST', 'inputSGST'] : ['inputIGST']).map((id) => bal(s.ledger, id)));
        return numeric({
          prompt: tbTotalPrompt(s.b),
          answer: total,
          commonErrors: errors(
            { value: total - input, why: 'Showed only the net GST payable; before the set-off entry the input and output GST accounts are listed separately.' },
            {
              // Purchases A/c takes the GST of both invoices; a return to the supplier does not change what was entered there.
              value: total + gstOn(s.g, s.buyCredit + s.buyCheque),
              why: 'Entered Purchases A/c at the invoice totals, GST included, and listed the input GST as well; purchases are recorded without GST.',
            },
            { value: 2 * total, why: 'Added the two columns together; the total asked for is that of one column.' },
          ),
          explanation: agreed(
            s.ledger,
            s.capital +
              (s.buyCredit + gstOn(s.g, s.buyCredit) - s.returnOut - gstOn(s.g, s.returnOut) - s.paid) +
              (s.sellCredit + s.sellCheque) +
              gstOn(s.g, s.sellCredit + s.sellCheque - s.returnIn) +
              s.returnOut,
          ),
        });
      },
      verify: bothWaysAgree,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Subsidiary books posted to the ledger (complex)
// ---------------------------------------------------------------------------------------------------------------

/** One line of the Purchases Book or the Sales Book: an invoice at list price less trade discount. */
interface Invoice {
  day: number;
  party: string;
  list: Paise;
  /** Trade discount in per cent; 0 when the invoice is at its list price. */
  discount: number;
  net: Paise;
}
const invoiceLine = (b: Business, i: Invoice) =>
  `${i.day} ${b.month}, ${i.party}: ${i.discount > 0 ? `list price ${F(i.list)} less ${i.discount}% trade discount` : F(i.net)}`;
/** The working of an invoice that carries trade discount. */
const netOfDiscount = (b: Business, i: Invoice) =>
  `Invoice of ${i.day} ${b.month}: ${i.discount}% of ${F(i.list)} = ${F(i.list - i.net)} trade discount, so it is entered at ${F(i.list)} - ${F(i.list - i.net)} = ${F(i.net)}.`;

type BookId = 'pb' | 'sb' | 'prb' | 'srb';
const BOOKS: Record<BookId, { name: string; right: string; wrong: Distractor[] }> = {
  pb: {
    name: 'Purchases Book',
    right: 'The debit side of Purchases A/c',
    wrong: [
      { text: 'The credit side of Purchases A/c', why: 'Reversed the side; purchases are an expense, so Purchases A/c is debited.' },
      { text: "The credit side of each supplier's account", why: 'Each supplier is credited with its own invoices, one by one; the total of the book goes to Purchases A/c.' },
      { text: 'The debit side of Sales A/c', why: 'Mixed up the two books; goods bought on credit have nothing to do with Sales A/c.' },
      { text: 'The debit side of Purchases Return A/c', why: 'Mixed the Purchases Book up with the Purchases Return Book.' },
    ],
  },
  sb: {
    name: 'Sales Book',
    right: 'The credit side of Sales A/c',
    wrong: [
      { text: 'The debit side of Sales A/c', why: 'Reversed the side; sales are an income, so Sales A/c is credited.' },
      { text: "The debit side of each customer's account", why: 'Each customer is debited with its own invoices, one by one; the total of the book goes to Sales A/c.' },
      { text: 'The credit side of Purchases A/c', why: 'Mixed up the two books; goods sold on credit have nothing to do with Purchases A/c.' },
      { text: 'The credit side of Sales Return A/c', why: 'Mixed the Sales Book up with the Sales Return Book.' },
    ],
  },
  prb: {
    name: 'Purchases Return Book',
    right: 'The credit side of Purchases Return A/c',
    wrong: [
      { text: 'The debit side of Purchases Return A/c', why: 'Reversed the side; goods sent back reduce purchases, so Purchases Return A/c is credited.' },
      { text: "The debit side of each supplier's account", why: 'Each supplier is debited with its own return, one by one; the total of the book goes to Purchases Return A/c.' },
      { text: 'The debit side of Sales Return A/c', why: 'Mixed up the two returns books; goods sent back to a supplier are purchases returns.' },
      { text: 'The credit side of Sales A/c', why: 'Treated goods sent back to a supplier as a sale; they cancel part of a purchase.' },
    ],
  },
  srb: {
    name: 'Sales Return Book',
    right: 'The debit side of Sales Return A/c',
    wrong: [
      { text: 'The credit side of Sales Return A/c', why: 'Reversed the side; goods that come back reduce sales, so Sales Return A/c is debited.' },
      { text: "The credit side of each customer's account", why: 'Each customer is credited with its own return, one by one; the total of the book goes to Sales Return A/c.' },
      { text: 'The credit side of Purchases Return A/c', why: 'Mixed up the two returns books; goods a customer sends back are sales returns.' },
      { text: 'The debit side of Purchases A/c', why: 'Treated goods a customer sends back as a purchase; they cancel part of a sale.' },
    ],
  },
};
const FURNITURE_DEALERS = ['Modern Furniture', 'Sagar Furnishers', 'Royal Interiors'];

interface BooksMonth {
  b: Business;
  capital: Paise;
  supplier: string;
  customer: string;
  purchases: Invoice[];
  sales: Invoice[];
  returnOut: { day: number; amount: Paise };
  returnIn: { day: number; amount: Paise };
  /** The dated transactions that are not in a subsidiary book. */
  others: Tx[];
  /** The transaction that looks as if it belonged in the Purchases Book or the Sales Book but does not. */
  extra: Tx;
  extraKind: 'cashPurchase' | 'furnitureCredit' | 'cashSale';
  extraAmount: Paise;
  paid: Paise;
  received: Paise;
  entries: JournalLine[][];
  ledger: Ledger;
  /** The book whose total is asked for: the one the extra transaction might be put in by mistake. */
  askBook: 'pb' | 'sb';
  /** The book whose posting is asked about. */
  postingBook: BookId;
}

const booksMonth = caseTemplate<BooksMonth>({
  id: 'case-cycle-subsidiary-books',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Subsidiary books posted to the ledger',
  setup: (rng) => {
    const b = business(rng);
    const [supplier, supplier2] = rng.shuffle(SUPPLIERS);
    const [customer, customer2] = rng.shuffle(CUSTOMERS);
    const capital = amount(rng, 200000, 400000, 50000);
    const extraKind = rng.pick(['cashPurchase', 'furnitureCredit', 'cashSale'] as const);
    const askBook = extraKind === 'cashSale' ? 'sb' : 'pb';
    // Five invoices in all: three in one book (two of them with the same party) and two in the other.
    const moreBought = rng.pick([true, false]);
    type Slot = { kind: 'buy' | 'sell'; party: string } | { kind: 'returnOut' | 'returnIn' | 'extra' | 'pay' | 'receive' };
    const slots: Slot[] = [
      { kind: 'buy', party: supplier },
      { kind: 'sell', party: customer },
      ...rng.shuffle<Slot>([
        { kind: 'buy', party: supplier2 },
        { kind: 'sell', party: customer2 },
        moreBought ? { kind: 'buy', party: supplier } : { kind: 'sell', party: customer },
        { kind: 'returnOut' },
        { kind: 'returnIn' },
        { kind: 'extra' },
      ]),
      ...rng.shuffle<Slot>([{ kind: 'pay' }, { kind: 'receive' }]),
    ];
    const days = laterDays(rng, slots.length);
    // One invoice of the book asked about carries trade discount.
    const inAskedBook = slots.map((s, i) => (s.kind === (askBook === 'pb' ? 'buy' : 'sell') ? i : -1)).filter((i) => i >= 0);
    const discounted = rng.pick(inAskedBook);
    const discount = rng.pick([10, 20]);
    const returnOutAmount = amount(rng, 3000, 9000, 1000);
    const returnInAmount = amount(rng, 2000, 8000, 1000);
    const extraAmount = extraKind === 'furnitureCredit' ? amount(rng, 20000, 60000, 5000) : amount(rng, 10000, 40000, 5000);
    const dealer = rng.pick(FURNITURE_DEALERS);
    const extraDraft: Draft =
      extraKind === 'cashPurchase'
        ? tx.goodsBought('bank', extraAmount)
        : extraKind === 'cashSale'
          ? tx.goodsSold('bank', extraAmount)
          : {
              key: 'furnitureCredit',
              text: `Bought furniture for the shop from ${dealer} on credit ${F(extraAmount)}.`,
              lines: [dr('furniture', extraAmount), cr(creditor(dealer), extraAmount)],
              steps: [
                'Furniture is bought for use, not for resale, so it is an asset: Furniture A/c is debited, not Purchases A/c.',
                `Nothing is paid yet, so ${poss(dealer)} account is credited.`,
                'Being a credit purchase of an asset, it is recorded in the Journal Proper, not in the Purchases Book.',
              ],
              distract: ['purchases'],
            };

    // Five different list prices, ₹20,000 to ₹80,000, so that no two invoices are alike.
    const lists = rng.shuffle(Array.from({ length: 13 }, (_, i) => rupees(20000 + 5000 * i))).slice(0, 5);
    const purchases: Invoice[] = [];
    const sales: Invoice[] = [];
    const others: Tx[] = [];
    const entries: JournalLine[][] = [[dr('bank', capital), cr('capital', capital)]];
    let returnOut = { day: 0, amount: returnOutAmount };
    let returnIn = { day: 0, amount: returnInAmount };
    let paid = 0;
    let received = 0;
    let extra: Tx | undefined;
    for (const [i, slot] of slots.entries()) {
      const day = days[i];
      if (slot.kind === 'buy' || slot.kind === 'sell') {
        const list = lists.pop()!;
        const pct = i === discounted ? discount : 0;
        const invoice: Invoice = { day, party: slot.party, list, discount: pct, net: list - (list * pct) / 100 };
        if (slot.kind === 'buy') {
          purchases.push(invoice);
          entries.push([dr('purchases', invoice.net), cr(creditor(slot.party), invoice.net)]);
        } else {
          sales.push(invoice);
          entries.push([dr(debtor(slot.party), invoice.net), cr('sales', invoice.net)]);
        }
      } else if (slot.kind === 'returnOut') {
        returnOut = { day, amount: returnOutAmount };
        entries.push(tx.returnOut(supplier, returnOutAmount).lines);
      } else if (slot.kind === 'returnIn') {
        returnIn = { day, amount: returnInAmount };
        entries.push(tx.returnIn(customer, returnInAmount).lines);
      } else if (slot.kind === 'extra') {
        extra = { ...extraDraft, day };
        others.push(extra);
        entries.push(extra.lines);
      } else if (slot.kind === 'pay') {
        paid = partOf(rng, -(post(entries).get(creditor(supplier)) ?? 0));
        if (paid <= 0) return null;
        others.push({ ...tx.paySupplier(supplier, paid, 0), day });
        entries.push(others.at(-1)!.lines);
      } else {
        received = partOf(rng, post(entries).get(debtor(customer)) ?? 0);
        if (received <= 0) return null;
        others.push({ ...tx.receiveFromCustomer(customer, received, 0), day });
        entries.push(others.at(-1)!.lines);
      }
    }
    if (!extra || !neverOverdrawn(entries, ['bank'])) return null;
    // Different figures keep the wrong answers apart.
    const nets = [...purchases, ...sales].map((i) => i.net);
    if (new Set(nets).size < nets.length || returnOutAmount === returnInAmount) return null;
    const ledger = post(entries);
    if (balanceOf(ledger, creditor(supplier))?.side !== 'Cr' || balanceOf(ledger, debtor(customer))?.side !== 'Dr') return null;
    return {
      b, capital, supplier, customer, purchases, sales, returnOut, returnIn, others, extra, extraKind, extraAmount, paid, received, entries, ledger, askBook,
      postingBook: rng.pick(['pb', 'sb', 'prb', 'srb'] as const),
    };
  },
  context: (s) =>
    [
      `${s.b.owner} started ${s.b.shop} on 1 ${s.b.month} with ${F(s.capital)} in the bank and keeps subsidiary books.`,
      'Purchases Book:',
      ...s.purchases.map((i) => invoiceLine(s.b, i)),
      'Sales Book:',
      ...s.sales.map((i) => invoiceLine(s.b, i)),
      `Purchases Return Book: ${s.returnOut.day} ${s.b.month}, ${s.supplier}: ${F(s.returnOut.amount)}`,
      `Sales Return Book: ${s.returnIn.day} ${s.b.month}, ${s.customer}: ${F(s.returnIn.amount)}`,
      'Other transactions (cheques received are banked the same day):',
      ...s.others.map((t) => line(s.b, t)),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const pb = s.askBook === 'pb';
        const book = pb ? s.purchases : s.sales;
        const cut = book.find((i) => i.discount > 0)!;
        const total = sum(book.map((i) => i.net));
        const back = pb ? s.returnOut.amount : s.returnIn.amount;
        return numeric({
          prompt: `What is the total of the ${pb ? 'Purchases Book' : 'Sales Book'} for ${s.b.month}?`,
          answer: total,
          commonErrors: errors(
            { value: sum(book.map((i) => i.list)), why: 'Entered every invoice at its list price; trade discount is deducted before an invoice is entered in the book.' },
            s.extraKind === 'cashPurchase' && { value: total + s.extraAmount, why: 'Included the goods paid for by cheque; the Purchases Book takes only credit purchases of goods, and this one is in the Cash Book.' },
            s.extraKind === 'furnitureCredit' && { value: total + s.extraAmount, why: 'Included the furniture; the Purchases Book takes only goods bought for resale, and an asset bought on credit goes in the Journal Proper.' },
            s.extraKind === 'cashSale' && { value: total + s.extraAmount, why: 'Included the goods sold against a cheque; the Sales Book takes only credit sales of goods, and this one is in the Cash Book.' },
            { value: total - back, why: `Deducted the goods returned; returns are entered in the ${pb ? 'Purchases' : 'Sales'} Return Book and leave this total as it is.` },
          ),
          explanation: [netOfDiscount(s.b, cut), `Total = ${plus(book.map((i) => i.net))} = ${F(total)}.`],
        });
      },
      verify: worked,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const book = BOOKS[s.postingBook];
        return choice({
          prompt: `At the end of ${s.b.month} the total of the ${book.name} is posted to the ledger. Where does it go?`,
          correct: book.right,
          distractors: book.wrong,
          explanation: `${book.right} takes the total of the ${book.name}. The parties' accounts are posted from the single entries of the book, one by one.`,
        });
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.extra.day} ${s.b.month}.`,
        lines: s.extra.lines,
        explanation: s.extra.steps,
        distractorAccounts: s.extra.distract,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const mine = s.purchases.filter((i) => i.party === s.supplier);
        const theirs = s.purchases.filter((i) => i.party !== s.supplier);
        const credits = mine.map((i) => i.net);
        const answer = bal(s.ledger, creditor(s.supplier));
        return numeric({
          prompt: `What is the balance of ${poss(s.supplier)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer + s.returnOut.amount, why: `Left out the Purchases Return Book; the goods sent back are debited to ${poss(s.supplier)} account.` },
            { value: answer + 2 * s.returnOut.amount, why: `Added the goods returned to what is owed to ${s.supplier}; a return reduces the amount owed.` },
            mine.some((i) => i.discount > 0) && { value: answer + sum(mine.map((i) => i.list - i.net)), why: `Credited ${s.supplier} with the list price; the invoice is entered net of trade discount.` },
            mine.length > 1 && { value: Math.abs(answer - mine[1].net), why: `Posted only the first invoice from ${s.supplier}; every entry of the Purchases Book is credited to its supplier.` },
            mine.length === 1 && { value: answer + sum(theirs.map((i) => i.net)), why: `Credited ${s.supplier} with the whole Purchases Book; each invoice goes to its own supplier's account.` },
            { value: answer + 2 * s.paid, why: "Added the cheque paid to the balance; money paid to a supplier is debited to the supplier's account." },
          ),
          explanation: [
            ...mine.filter((i) => i.discount > 0).map((i) => netOfDiscount(s.b, i)),
            addUp(`Credit side (from the Purchases Book)`, credits),
            `Debit side (goods returned and the cheque paid): ${F(s.returnOut.amount)} + ${F(s.paid)} = ${F(s.returnOut.amount + s.paid)}.`,
            `Balance = ${F(sum(credits))} - ${F(s.returnOut.amount + s.paid)} = ${F(sum(credits) - s.returnOut.amount - s.paid)} (credit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const mine = s.sales.filter((i) => i.party === s.customer);
        const theirs = s.sales.filter((i) => i.party !== s.customer);
        const debits = mine.map((i) => i.net);
        const answer = bal(s.ledger, debtor(s.customer));
        return numeric({
          prompt: `What is the balance of ${poss(s.customer)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer + s.returnIn.amount, why: `Left out the Sales Return Book; the goods that came back are credited to ${poss(s.customer)} account.` },
            { value: answer + 2 * s.returnIn.amount, why: `Added the goods returned to what ${s.customer} owes; a return reduces the amount owed.` },
            mine.some((i) => i.discount > 0) && { value: answer + sum(mine.map((i) => i.list - i.net)), why: `Debited ${s.customer} with the list price; the invoice is entered net of trade discount.` },
            mine.length > 1 && { value: Math.abs(answer - mine[1].net), why: `Posted only the first invoice to ${s.customer}; every entry of the Sales Book is debited to its customer.` },
            mine.length === 1 && { value: answer + sum(theirs.map((i) => i.net)), why: `Debited ${s.customer} with the whole Sales Book; each invoice goes to its own customer's account.` },
            { value: answer + 2 * s.received, why: "Added the cheque received to the balance; money received from a customer is credited to the customer's account." },
          ),
          explanation: [
            ...mine.filter((i) => i.discount > 0).map((i) => netOfDiscount(s.b, i)),
            addUp(`Debit side (from the Sales Book)`, debits),
            `Credit side (goods returned and the cheque received): ${F(s.returnIn.amount)} + ${F(s.received)} = ${F(s.returnIn.amount + s.received)}.`,
            `Balance = ${F(sum(debits))} - ${F(s.returnIn.amount + s.received)} = ${F(sum(debits) - s.returnIn.amount - s.received)} (debit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        // The account the extra transaction touches, or (for the furniture, which touches neither) Sales A/c.
        const purchasesAsked = s.extraKind === 'cashPurchase';
        const book = purchasesAsked ? s.purchases : s.sales;
        const bookTotal = sum(book.map((i) => i.net));
        const back = purchasesAsked ? s.returnOut.amount : s.returnIn.amount;
        const cheque = s.extraKind === 'furnitureCredit' ? 0 : s.extraAmount;
        const name = purchasesAsked ? 'Purchases' : 'Sales';
        const cut = book.find((i) => i.discount > 0);
        return numeric({
          prompt: `What is the balance of ${name} A/c on ${monthEnd(s.b)}?`,
          answer: bal(s.ledger, purchasesAsked ? 'purchases' : 'sales'),
          commonErrors: errors(
            cheque > 0 && {
              value: bookTotal,
              why: `Took the total of the ${name} Book alone; the goods ${purchasesAsked ? 'paid for by' : 'sold against a'} cheque are posted to ${name} A/c from the Cash Book.`,
            },
            { value: bookTotal + cheque - back, why: `Deducted the returns in ${name} A/c; returns are kept in ${name} Return A/c, so ${name} A/c is not reduced.` },
            cut && { value: sum(book.map((i) => i.list)) + cheque, why: 'Used the list price of the invoice with trade discount; it is entered net.' },
            !purchasesAsked && { value: bookTotal + cheque + s.received, why: `Added the cheque from ${s.customer} as a sale; it settles a credit sale already counted.` },
            purchasesAsked && { value: bookTotal + cheque + s.paid, why: `Added the cheque paid to ${s.supplier} as a purchase; it settles a credit purchase already counted.` },
            { value: bookTotal + cheque + back, why: `Added the returns to ${name} A/c; they are kept in ${name} Return A/c.` },
          ),
          explanation: [
            ...(cut ? [netOfDiscount(s.b, cut)] : []),
            `Total of the ${name} Book: ${plus(book.map((i) => i.net))} = ${F(bookTotal)}.`,
            cheque > 0
              ? `Add the goods ${purchasesAsked ? 'paid for by' : 'sold against a'} cheque, posted from the Cash Book: ${F(bookTotal)} + ${F(cheque)} = ${F(bookTotal + cheque)} (${purchasesAsked ? 'debit' : 'credit'}).`
              : `Nothing else is posted to ${name} A/c, so its balance is ${F(bookTotal)} (credit).`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const tb = trialBalance(s.ledger);
        const total = tb.debitTotal;
        return numeric({
          prompt: tbTotalPrompt(s.b),
          answer: total,
          commonErrors: errors(
            { value: total - s.returnOut.amount - s.returnIn.amount, why: 'Showed purchases and sales net of returns; the two returns accounts have balances of their own in the trial balance.' },
            { value: total - s.returnIn.amount + s.returnOut.amount, why: 'Listed Purchases Return A/c in the debit column and Sales Return A/c in the credit column, which gives this debit total; it is Sales Return A/c that has the debit balance.' },
            { value: total + bal(s.ledger, creditor(s.supplier)), why: `Listed ${poss(s.supplier)} balance in the debit column beside the customers; a creditor's balance goes in the credit column.` },
            { value: 2 * total, why: 'Added the two columns together; the total asked for is that of one column.' },
          ),
          explanation: agreed(
            s.ledger,
            s.capital + sum(s.purchases.map((i) => i.net)) - s.paid + sum(s.sales.map((i) => i.net)) + (s.extraKind === 'cashPurchase' ? 0 : s.extraAmount),
          ),
        });
      },
      verify: bothWaysAgree,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 6. The accounting equation carried through a month (complex)
// ---------------------------------------------------------------------------------------------------------------

/** The change a transaction makes to the three terms of the equation, each signed. */
interface Effect {
  assets: Paise;
  liabilities: Paise;
  capital: Paise;
}
const eff = (assets: Paise, liabilities: Paise, capital: Paise): Effect => ({ assets, liabilities, capital });
const change = (x: Paise) => (x > 0 ? `up by ${F(x)}` : x < 0 ? `down by ${F(-x)}` : 'unchanged');
const effectText = (e: Effect) => `Assets ${change(e.assets)}; liabilities ${change(e.liabilities)}; capital ${change(e.capital)}`;
const sameEffect = (a: Effect, b: Effect) => a.assets === b.assets && a.liabilities === b.liabilities && a.capital === b.capital;

type Term = keyof Effect;
/** The term of the equation an account of this case belongs to. Profit, expenses and drawings go straight to capital. */
const termOf = (accountId: string): Term =>
  accountId === 'capital' ? 'capital' : accountId.startsWith('creditor:') || accountId === 'loan' || accountId === 'outstandingExpenses' ? 'liabilities' : 'assets';
const effectOf = (lines: JournalLine[]): Effect => {
  const e = eff(0, 0, 0);
  for (const l of lines) e[termOf(l.accountId)] += (termOf(l.accountId) === 'assets' ? 1 : -1) * (l.side === 'Dr' ? l.amount : -l.amount);
  return e;
};
/** The total of one term of the equation in a ledger kept in its accounts. */
const termTotal = (ledger: Ledger, term: Term): Paise =>
  sum([...ledger].filter(([id]) => termOf(id) === term).map(([, net]) => (term === 'assets' ? net : -net)));

/** A transaction of the equation case: how it moves the equation (`eq`), and its ordinary journal entry (`lines`). */
interface EqDraft extends Draft {
  eq: JournalLine[];
  /** Why the equation moves as it does. */
  note: string;
  /** Wrong effects, each with the slip that leads to it. */
  wrong: { e: Effect; why: string }[];
}
type EqTx = EqDraft & { day: number };

const eqTx = {
  start: (a: Paise): EqDraft => ({
    ...tx.capital('cash', a),
    eq: [dr('cash', a), cr('capital', a)],
    note: 'Cash, an asset, comes in and capital rises by the same amount.',
    wrong: [],
  }),
  buyCredit: (supplier: string, a: Paise): EqDraft => ({
    ...tx.creditPurchase(supplier, a),
    eq: [dr('stock', a), cr(creditor(supplier), a)],
    note: `Stock, an asset, rises by ${F(a)} and so does the amount owed to ${supplier}, a liability. Capital is unchanged.`,
    wrong: [
      { e: eff(a, 0, a), why: 'Treated goods bought on credit as capital brought in; they are owed to the supplier, so a liability rises.' },
      { e: eff(0, 0, 0), why: 'Treated it as a cash purchase, where one asset replaces another; nothing was paid here, so a liability arises.' },
      { e: eff(-a, -a, 0), why: 'Reversed the effect; buying on credit adds to stock and to creditors.' },
      { e: eff(0, a, -a), why: 'Treated the goods as an expense; unsold goods are stock, an asset.' },
    ],
  }),
  buyCash: (a: Paise): EqDraft => ({
    ...tx.goodsBought('cash', a),
    eq: [dr('stock', a), cr('cash', a)],
    note: `Stock rises by ${F(a)} and cash falls by ${F(a)}: one asset replaces another, so no total changes.`,
    wrong: [
      { e: eff(-a, 0, -a), why: 'Treated the goods as an expense that reduces capital; they are still held as stock, an asset.' },
      { e: eff(a, a, 0), why: 'Treated it as a credit purchase; the goods were paid for in cash, so no liability arises.' },
      { e: eff(a, 0, a), why: 'Counted the goods as new capital; they were paid for out of cash the business already had.' },
    ],
  }),
  furniture: (a: Paise): EqDraft => ({
    ...tx.asset(ASSETS[0], 'cash', a),
    eq: [dr('furniture', a), cr('cash', a)],
    note: `Furniture rises by ${F(a)} and cash falls by ${F(a)}: one asset replaces another, so no total changes.`,
    wrong: [
      { e: eff(-a, 0, -a), why: 'Treated the furniture as an expense; it is an asset, so one asset simply replaces another.' },
      { e: eff(a, a, 0), why: 'Treated it as bought on credit; it was paid for in cash, so no liability arises.' },
      { e: eff(a, 0, a), why: 'Counted the furniture as new capital; it was paid for out of cash the business already had.' },
    ],
  }),
  sale: (cost: Paise, price: Paise, customer: string | null, markup: number): EqDraft => {
    const profit = price - cost;
    const how = markup > 0 ? `at a profit of ${markup}% on cost` : `for ${F(price)}`;
    return {
      key: 'sale',
      text: customer ? `Sold goods costing ${F(cost)} to ${customer} on credit ${how}.` : `Sold goods costing ${F(cost)} ${how}, received in cash.`,
      lines: [dr(customer ? debtor(customer) : 'cash', price), cr('sales', price)],
      steps: [
        ...(markup > 0 ? [`Selling price = cost + profit = ${F(cost)} + ${F(profit)} = ${F(price)}.`] : []),
        customer ? `${customer} owes the selling price, so ${poss(customer)} account is debited with ${F(price)}.` : `Cash comes in, so Cash A/c is debited with the selling price, ${F(price)}.`,
        'Sales A/c is credited with the selling price. The cost of the goods is not part of this entry.',
      ],
      distract: ['purchases', 'stock'],
      eq: [dr(customer ? debtor(customer) : 'cash', price), cr('stock', cost), cr('capital', profit)],
      note: `${customer ? 'Debtors rise' : 'Cash rises'} by the selling price, ${F(price)}, and stock falls by the cost, ${F(cost)}, so assets rise by the profit of ${F(profit)}. Profit belongs to the proprietor, so capital rises by ${F(profit)}.`,
      wrong: [
        { e: eff(price, 0, price), why: 'Counted the whole selling price as the increase; stock also goes out, at its cost.' },
        { e: eff(0, 0, 0), why: 'Thought one asset only replaces another; the goods fetched more than their cost, and that profit raises assets and capital.' },
        { e: eff(profit, profit, 0), why: 'Put the profit under liabilities; profit belongs to the proprietor and is added to capital.' },
        { e: eff(-cost, 0, -cost), why: 'Looked only at the goods going out; the selling price comes in at the same time.' },
      ],
    };
  },
  expense: (n: Named, a: Paise): EqDraft => ({
    ...tx.expense(n, 'cash', a),
    eq: [dr('capital', a), cr('cash', a)],
    note: `Cash falls by ${F(a)}. An expense reduces profit and so capital, by the same amount.`,
    wrong: [
      { e: eff(-a, -a, 0), why: 'Treated the expense as paying off a debt; an expense reduces profit and so capital.' },
      { e: eff(-a, 0, 0), why: 'Reduced cash only; the equation must stay equal, and an expense reduces capital.' },
      { e: eff(0, a, -a), why: 'Treated the expense as still owing; it was paid in cash, so an asset falls and no liability arises.' },
    ],
  }),
  drawings: (owner: string, a: Paise, goods: boolean): EqDraft => ({
    ...(goods
      ? {
          key: 'drawings',
          text: `${owner} took goods costing ${F(a)} from the shop for personal use.`,
          lines: [dr('drawings', a), cr('purchases', a)],
          steps: [
            'Goods taken by the proprietor for personal use are drawings, so Drawings A/c is debited.',
            'These goods are no longer for sale, so Purchases A/c is credited with their cost.',
          ],
          distract: ['sales', 'stock', 'capital'],
        }
      : tx.drawings(owner, 'cash', a)),
    eq: [dr('capital', a), cr(goods ? 'stock' : 'cash', a)],
    note: `${goods ? 'Stock' : 'Cash'}, an asset, falls by ${F(a)}. Drawings reduce capital by the same amount.`,
    wrong: [
      { e: eff(-a, -a, 0), why: 'Treated the drawings as paying off a debt; what the proprietor takes reduces capital.' },
      { e: eff(-a, 0, 0), why: 'Reduced the asset only, as if drawings were outside the business; they reduce capital.' },
      goods
        ? { e: eff(0, 0, 0), why: 'Thought nothing changes because no cash moved; stock falls, and capital with it.' }
        : { e: eff(a, 0, a), why: 'Read the withdrawal as money coming in; cash goes out and capital falls.' },
    ],
  }),
  pay: (supplier: string, paid: Paise, discount: Paise): EqDraft => ({
    key: 'paySupplier',
    text: discount > 0 ? `Paid ${supplier} ${F(paid)} in cash and received a discount of ${F(discount)}.` : `Paid ${supplier} ${F(paid)} in cash on account.`,
    lines: [dr(creditor(supplier), paid + discount), cr('cash', paid), ...(discount > 0 ? [cr('discountReceived', discount)] : [])],
    steps:
      discount > 0
        ? [
            `The cash and the discount together clear ${F(paid)} + ${F(discount)} = ${F(paid + discount)} of the debt, so ${poss(supplier)} account is debited with that.`,
            'Cash goes out, so Cash A/c is credited.',
            'The discount is a gain, so Discount Received A/c is credited.',
          ]
        : [`The business now owes ${supplier} less, so ${poss(supplier)} account is debited.`, 'Cash goes out, so Cash A/c is credited.'],
    distract: ['discountAllowed', 'purchases', 'bank'],
    eq: [dr(creditor(supplier), paid + discount), cr('cash', paid), ...(discount > 0 ? [cr('capital', discount)] : [])],
    note:
      discount > 0
        ? `Cash falls by ${F(paid)} and the debt to ${supplier} falls by ${F(paid + discount)}. The discount of ${F(discount)} is a gain, so capital rises by it.`
        : `Cash falls by ${F(paid)} and the amount owed to ${supplier} falls by ${F(paid)}. Capital is unchanged.`,
    wrong:
      discount > 0
        ? [
            { e: eff(-paid, -paid, 0), why: 'Ignored the discount; the debt falls by the cash paid and the discount, and the discount is a gain added to capital.' },
            { e: eff(-(paid + discount), -(paid + discount), 0), why: 'Took the discount as cash paid; only the cash actually paid leaves the business.' },
            { e: eff(-paid, 0, -paid), why: 'Treated the payment to a creditor as an expense; it settles a liability.' },
          ]
        : [
            { e: eff(-paid, 0, -paid), why: 'Treated the payment to a creditor as an expense; it only settles a liability, so capital is unchanged.' },
            { e: eff(-paid, 0, 0), why: 'Reduced cash only; the equation must stay equal, and the amount owed falls too.' },
            { e: eff(paid, paid, 0), why: 'Reversed the effect; paying a creditor reduces both cash and the liability.' },
          ],
  }),
  loan: (lender: string, a: Paise): EqDraft => ({
    key: 'loan',
    text: `Took a loan of ${F(a)} from ${lender}, received in cash.`,
    lines: [dr('cash', a), cr('loan', a)],
    steps: ['Cash comes in, so Cash A/c is debited.', 'The money has to be repaid, so it is a liability: Loan A/c is credited.'],
    distract: ['capital', 'bankLoan'],
    eq: [dr('cash', a), cr('loan', a)],
    note: `Cash, an asset, rises by ${F(a)} and the loan, a liability, rises by ${F(a)}. Capital is unchanged.`,
    wrong: [
      { e: eff(a, 0, a), why: 'Treated the loan as capital brought in by the proprietor; borrowed money is a liability.' },
      { e: eff(-a, -a, 0), why: 'Reversed the effect; taking a loan adds to cash and to liabilities.' },
      { e: eff(a, 0, 0), why: 'Raised cash only; the equation must stay equal, and the money has to be repaid.' },
    ],
  }),
  outstanding: (a: Paise, month: string): EqDraft => ({
    key: 'outstanding',
    text: `Salaries of ${F(a)} for ${month} are due but have not been paid.`,
    lines: [dr('salaries', a), cr('outstandingExpenses', a)],
    steps: ['The salaries are an expense of the month, so Salaries A/c is debited.', 'They are still owed, so Outstanding Expenses A/c is credited.'],
    distract: ['cash'],
    eq: [dr('capital', a), cr('outstandingExpenses', a)],
    note: `The salaries are an expense of the month, so capital falls by ${F(a)}; they are still owed, so liabilities rise by ${F(a)}. No asset changes.`,
    wrong: [
      { e: eff(-a, 0, -a), why: 'Treated the salaries as paid; no cash has gone out, and the amount is owed instead.' },
      { e: eff(0, 0, 0), why: 'Ignored the salaries because they are unpaid; they are still an expense of the month and a liability.' },
      { e: eff(0, a, a), why: 'Raised capital along with the liability; an expense reduces capital.' },
    ],
  }),
};
// The lender is not named: the entry credits Loan A/c, and a named lender would call for an account in that name.
const LENDERS = ['a friend', 'a relative', 'a family friend'];

interface EquationMonth {
  b: Business;
  txs: EqTx[];
  /** The ledger kept in the accounts of the equation: assets, liabilities and capital only. */
  ledger: Ledger;
  entries: JournalLine[][];
  supplier: string;
  customer: string | null;
  capital: Paise;
  bought: Paise;
  cashGoods: Paise;
  cost: Paise;
  price: Paise;
  markup: number;
  expense: Paise;
  drawings: Paise;
  goodsDrawn: boolean;
  paid: Paise;
  discount: Paise;
  loan: Paise;
  outstanding: Paise;
  saleDay: number;
  effectFocus: EqTx;
  journalFocus: EqTx;
}

const equationMonth = caseTemplate<EquationMonth>({
  id: 'case-cycle-accounting-equation',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'The accounting equation through a month',
  setup: (rng) => {
    const b = business(rng);
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick([true, false]) ? rng.pick(CUSTOMERS) : null;
    const capital = amount(rng, 300000, 600000, 50000);
    const bought = amount(rng, 60000, 120000, 10000);
    const cashGoods = rng.pick([true, false]) ? amount(rng, 20000, 50000, 5000) : 0;
    const furniture = amount(rng, 20000, 60000, 5000);
    const cost = amount(rng, 30000, 80000, 10000);
    const markup = rng.pick([0, 20, 25]);
    const price = markup > 0 ? cost + (cost * markup) / 100 : cost + amount(rng, 5000, 20000, 1000);
    const e = rng.pick(EXPENSES.filter((x) => x !== SALARIES));
    const expense = pickAmount(rng, e);
    const goodsDrawn = rng.pick([true, false]);
    const drawings = goodsDrawn ? amount(rng, 3000, 8000, 1000) : amount(rng, 5000, 15000, 1000);
    const paid = partOf(rng, bought);
    const discount = rng.pick([true, false]) ? rupees(rng.pick([1000, 2000])) : 0;
    const more = rng.pick(['outstanding', 'loan', 'both']);
    const loan = more !== 'outstanding' ? amount(rng, 40000, 100000, 10000) : 0;
    const outstanding = more !== 'loan' ? amount(rng, 8000, 20000, 1000) : 0;
    // The goods sold and drawn must have been bought, with some stock left over.
    if (cost + (goodsDrawn ? drawings : 0) > bought + cashGoods - rupees(10000)) return null;

    const drafts: EqDraft[] = [
      eqTx.start(capital),
      eqTx.buyCredit(supplier, bought),
      ...rng.shuffle([eqTx.furniture(furniture), ...(cashGoods ? [eqTx.buyCash(cashGoods)] : [])]),
      eqTx.sale(cost, price, customer, markup),
      ...rng.shuffle([
        eqTx.expense(e, expense),
        eqTx.drawings(b.owner, drawings, goodsDrawn),
        eqTx.pay(supplier, paid, discount),
        ...(loan ? [eqTx.loan(rng.pick(LENDERS), loan)] : []),
      ]),
    ];
    const days = [1, ...laterDays(rng, drafts.length - 1)];
    const txs: EqTx[] = drafts.map((d, i) => ({ ...d, day: days[i] }));
    // Salaries left unpaid are known only when the month closes.
    if (outstanding) txs.push({ ...eqTx.outstanding(outstanding, b.month), day: b.last });
    const entries = txs.map((t) => t.eq);
    if (!neverOverdrawn(entries, ['cash', 'stock'])) return null;
    const ledger = post(entries);
    // The sale has a question of its own (the profit), so the effect asked about is that of another transaction.
    const effectFocus = rng.pick(txs.filter((t) => t.key !== 'capital' && t.key !== 'sale'));
    const journalFocus = rng.pick(txs.filter((t) => t !== effectFocus && ['creditPurchase', 'sale', 'drawings', 'paySupplier', 'loan'].includes(t.key)));
    return {
      b, txs, ledger, entries, supplier, customer, capital, bought, cashGoods, cost, price, markup, expense, drawings, goodsDrawn, paid, discount, loan, outstanding,
      saleDay: txs.find((t) => t.key === 'sale')!.day,
      effectFocus, journalFocus,
    };
  },
  context: (s) =>
    [
      `${s.b.owner} started ${s.b.shop} on 1 ${s.b.month}.`,
      'Take each transaction through Assets = Liabilities + Capital; profit, gains, expenses and drawings change capital.',
      ...s.txs.map((t) => line(s.b, t)),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const right = effectOf(s.effectFocus.eq);
        return choice({
          prompt: `How does the transaction of ${s.effectFocus.day} ${s.b.month} change the accounting equation?`,
          correct: effectText(right),
          distractors: s.effectFocus.wrong.filter((w) => !sameEffect(w.e, right)).map((w) => ({ text: effectText(w.e), why: w.why })),
          explanation: s.effectFocus.note,
        });
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const profit = s.price - s.cost;
        const onPrice = (s.price * s.markup) / 100;
        return numeric({
          prompt: `By how much does the sale of ${s.saleDay} ${s.b.month} increase ${poss(s.b.owner)} capital?`,
          answer: effectOf(s.txs.find((t) => t.key === 'sale')!.eq).capital,
          commonErrors: errors(
            { value: s.price, why: 'Gave the selling price; only the profit, selling price less cost, is added to capital.' },
            { value: s.cost, why: 'Gave the cost of the goods sold; capital rises by the profit on them.' },
            s.markup > 0 && onPrice % 100 === 0 && { value: onPrice, why: `Took ${s.markup}% of the selling price; the profit is ${s.markup}% of the cost.` },
            s.markup === 0 && { value: s.price + s.cost, why: 'Added the cost to the selling price; the profit is the difference between them.' },
          ),
          explanation:
            s.markup > 0
              ? [`Capital rises by the profit on the sale: ${s.markup}% of ${F(s.cost)} = ${F(profit)}.`]
              : [`Capital rises by the profit on the sale: selling price less cost = ${F(s.price)} - ${F(s.cost)} = ${F(profit)}.`],
        });
      },
      verify: worked,
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.journalFocus.day} ${s.b.month}.`,
        lines: s.journalFocus.lines,
        explanation: s.journalFocus.steps,
        distractorAccounts: s.journalFocus.distract,
      }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = bal(s.ledger, 'cash');
        return numeric({
          prompt: `How much cash does the business have on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            s.customer !== null && { value: answer + s.price, why: `Counted the goods sold to ${s.customer} on credit as cash received; that money is still due.` },
            s.customer === null && { value: answer - s.cost, why: 'Added only the profit on the sale to cash; the whole selling price was received.' },
            { value: answer - (s.bought - s.paid), why: `Deducted the whole of the goods bought from ${s.supplier} on credit; only ${F(s.paid)} of it has been paid.` },
            s.discount > 0 && { value: answer - s.discount, why: 'Deducted the discount as well; only the cash actually paid went out.' },
            s.outstanding > 0 && { value: answer - s.outstanding, why: 'Deducted the salaries that are due; they have not been paid yet.' },
            s.goodsDrawn && { value: answer - s.drawings, why: 'Deducted the goods taken for personal use from cash; goods went out, not cash.' },
            !s.goodsDrawn && { value: answer + s.drawings, why: 'Left out the cash the proprietor took because it is not a business expense; the cash still went out.' },
            s.loan > 0 && { value: answer - s.loan, why: 'Left out the loan; the money borrowed was received in cash.' },
          ),
          explanation: cashWorking(s.entries, 'cash', ['Cash received', 'Cash paid']),
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const owed = s.bought - s.paid - s.discount;
        const items: [string, Paise][] = [[s.supplier, owed], ...(s.loan > 0 ? [['Loan', s.loan] as [string, Paise]] : []), ...(s.outstanding > 0 ? [['Outstanding salaries', s.outstanding] as [string, Paise]] : [])];
        const answer = termTotal(s.ledger, 'liabilities');
        return numeric({
          prompt: `What is the total of the liabilities to outsiders (all that the business owes, not counting capital) on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            s.discount > 0 && { value: answer + s.discount, why: `Reduced the debt to ${s.supplier} by the cash paid only; the discount received reduces it too.` },
            s.outstanding > 0 && { value: answer - s.outstanding, why: 'Left out the salaries due; an expense that is owed is a liability until it is paid.' },
            s.loan > 0 && { value: answer - s.loan, why: 'Left out the loan, treating it as capital; borrowed money is a liability.' },
            { value: answer + s.paid + s.discount, why: `Took the whole credit purchase as still owed; part of the debt to ${s.supplier} has been settled.` },
            { value: answer + termTotal(s.ledger, 'capital'), why: 'Added the capital; the question asks only for what is owed to outsiders.' },
          ),
          explanation: [
            s.discount > 0
              ? `Owed to ${s.supplier}: ${F(s.bought)} - ${F(s.paid)} - ${F(s.discount)} = ${F(owed)}.`
              : `Owed to ${s.supplier}: ${F(s.bought)} - ${F(s.paid)} = ${F(owed)}.`,
            `Liabilities: ${items.map(([name, a]) => `${name} ${F(a)}`).join(' + ')} = ${F(sum(items.map(([, a]) => a)))}.`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const profit = s.price - s.cost;
        const gains = [s.capital, profit, ...(s.discount > 0 ? [s.discount] : [])];
        const losses = [s.expense, s.drawings, ...(s.outstanding > 0 ? [s.outstanding] : [])];
        const answer = termTotal(s.ledger, 'capital');
        return numeric({
          prompt: `What is ${poss(s.b.owner)} capital on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: errors(
            { value: answer + s.drawings, why: 'Left the drawings out; what the proprietor takes for personal use reduces capital.' },
            { value: answer + s.cost, why: 'Added the whole selling price of the goods sold; only the profit on them increases capital.' },
            s.outstanding > 0 && { value: answer + s.outstanding, why: 'Left out the salaries due because they are unpaid; the expense reduces capital all the same.' },
            s.loan > 0 && { value: answer + s.loan, why: 'Added the loan to capital; a loan is a liability, not capital.' },
            s.discount > 0 && { value: answer - s.discount, why: 'Left out the discount received; it is a gain and increases capital.' },
            { value: s.capital, why: 'Gave the capital introduced on the 1st; profit, expenses and drawings have changed it since.' },
          ),
          explanation: [
            addUp(listed(['Capital introduced', 'profit on the sale', ...(s.discount > 0 ? ['discount received'] : [])]), gains),
            addUp(`Less ${listed(['the expense paid', 'the drawings', ...(s.outstanding > 0 ? ['the salaries due'] : [])])}`, losses),
            `Capital = ${F(sum(gains))} - ${F(sum(losses))} = ${F(sum(gains) - sum(losses))}.`,
          ],
        });
      },
      verify: worked,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const assets = trialBalance(s.ledger).rows.filter((r) => termOf(r.accountId) === 'assets');
        const total = termTotal(s.ledger, 'assets');
        const liabilities = termTotal(s.ledger, 'liabilities');
        const capital = termTotal(s.ledger, 'capital');
        const name = (r: { accountId: string; label: string }) => (r.accountId.includes(':') ? r.label : r.label.replace(' A/c', ''));
        const owed = s.bought - s.paid - s.discount + s.loan + s.outstanding;
        const owners = s.capital + (s.price - s.cost) + s.discount - s.expense - s.drawings - s.outstanding;
        return numeric({
          prompt: `What are the total assets of the business on ${monthEnd(s.b)}?`,
          answer: total,
          commonErrors: errors(
            { value: total - (s.price - s.cost), why: 'Reduced the stock by the selling price of the goods sold; stock goes out at its cost.' },
            { value: capital, why: 'Gave the capital; the assets equal the capital and the liabilities together.' },
            { value: capital - liabilities, why: 'Deducted the liabilities from capital; Assets = Liabilities + Capital.' },
            s.customer !== null && { value: total - s.price, why: `Left out the amount due from ${s.customer}; a debtor is an asset.` },
            { value: total - bal(s.ledger, 'stock'), why: 'Left out the unsold goods; stock in hand is an asset.' },
          ),
          // The assets are read from the ledger; the other side of the equation is worked from the figures of the case.
          explanation: [
            `Assets: ${assets.map((r) => `${name(r)} ${F(r.amount)}`).join(' + ')} = ${F(sum(assets.map((r) => r.amount)))}.`,
            `Check: Liabilities ${F(owed)} + Capital ${F(owners)} = ${F(owed + owners)}.`,
            `Both sides of the equation come to ${F(owed + owners)}.`,
          ],
        });
      },
      verify: bothWaysAgree,
    },
  ],
});

// ===============================================================================================================
// Chained cases: the long question of the examination. One month of one business, and the student prepares its
// books in turn: the journal (a set of entries), one or two ledger accounts, and the trial balance by the balance
// method. The transactions are the drafts of the cases above (`tx`, `gstTx`), each with a short name that the set
// shows in place of the amounts, which stand in the case text alone. Everything is made from the one list of dated
// entries: an account with `accountOf` and `ledgerSides`, the trial balance by balancing every account in turn.
//
// The case text says the year once, where the business is introduced, and states a convention only in a month that
// relies on it (a customer's cheque banked the same day, where goods returned are recorded). It does not say that a
// trial balance is drawn up: the task of that part names the date and the method. An account is asked for only
// when it has enough items to be worth its share of the marks: five rows to enter at least, the balance among them.
//
// Each part is checked from the printed case, not from the entries it was made from: `readCase` reads the case text
// back into entries by its wording (and works the GST and the capital out again), and the set, the accounts and the
// trial balance must each agree with books posted from that reading.
// ===============================================================================================================

type Side = 'Dr' | 'Cr';
export const NEXT_MONTH: Record<string, string> = {
  April: 'May', May: 'June', June: 'July', July: 'August', August: 'September', September: 'October',
  October: 'November', November: 'December', December: 'January', January: 'February',
};
/** The day a balance carried down at the end of the month is brought down. */
export const nextDay = (b: Business) => `1 ${NEXT_MONTH[b.month]}`;
/**
 * The year of the month, said once where the business is introduced and in the heading of the trial balance, as an
 * examiner dates one: the accounting year 2026-27 of the trial balance formats, so January falls in 2027.
 */
export const yearOf = (b: Business) => (b.month === 'January' ? 2027 : 2026);
export const firstDay = (b: Business) => `1 ${b.month} ${yearOf(b)}`;
const pre = (s: Side) => (s === 'Dr' ? 'To' : 'By');
const sideName = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');
/** Ends a sentence, without doubling the full stop after a name such as "Rao & Co.". */
const stop = (s: string) => (s.endsWith('.') ? s : `${s}.`);
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const how = (m: Mode) => (m === 'cash' ? 'in cash' : 'by cheque');
const isParty = (accountId: string) => accountId.startsWith('debtor:') || accountId.startsWith('creditor:');
const isInputGst = (accountId: string) => /^input[CSI]GST$/.test(accountId);
const isOutputGst = (accountId: string) => /^output[CSI]GST$/.test(accountId);

/**
 * What the task of a party's account adds when an entry of the month gives it several rows (a cheque at a discount,
 * an invoice with GST): textbooks also write "Sundries" for a compound entry.
 */
const COMPOUND_ROWS = 'Give each account of a compound entry a row of its own.';
export const TB_COLUMNS = ['Debit (₹)', 'Credit (₹)'];
export const HINTS_ACCOUNT = [
  'Take the entries one at a time. Is this account debited or credited in it? If it is in neither, the entry is left out.',
  'An item on the debit side begins with "To" and one on the credit side with "By", followed by the name of the other account of the entry. The balance is carried down on the shorter side.',
];
export const HINTS_TB = [
  'Post each entry to its accounts first. Then take the accounts one at a time: which side is larger, and by how much?',
  'By the balance method only the balance of each account is listed: a debit balance in the debit column, a credit balance in the credit column. An account whose two sides are equal is left out.',
];

/**
 * A transaction of a chained case: the draft (what the case text says, the entry and why it is so) with the short
 * name the set of entries calls it by, which has no amount and no final full stop.
 */
export interface Step extends Draft {
  brief: string;
  /** How an amount that is not in the case text is found (the GST of an invoice), for the working of an account. */
  calc?: string;
}
export interface Dated extends Step {
  date: string;
}
export const step = (d: Draft, brief: string, calc?: string): Step => ({ ...d, brief, ...(calc ? { calc } : {}) });
export const taxNote = (g: Gst, base: Paise) =>
  `GST at ${g.rate}% of ${F(base)} is ${F(gstOn(g, base))}${g.intra ? `, ${F(gstOn(g, base) / 2)} each of CGST and SGST` : ', all of it IGST'}.`;

export const cs = {
  capital: (m: Mode, a: Paise) => step(tx.capital(m, a), m === 'cash' ? 'Capital brought in as cash' : 'Capital paid into a bank account opened for the business'),
  capitalBoth: (cash: Paise, bank: Paise) => step(tx.capitalBoth(cash, bank), 'Capital brought in, part as cash and part into a new bank account'),
  deposit: (a: Paise) => step(tx.deposit(a), 'Bank account opened with a deposit out of cash'),
  office: (a: Paise) => step(tx.withdrawForOffice(a), 'Cash withdrawn from the bank for office use'),
  drawings: (owner: string, m: Mode, a: Paise) =>
    step(tx.drawings(owner, m, a), m === 'cash' ? `Cash taken by ${owner} for personal use` : `Withdrawn from the bank by ${owner} for personal use`),
  asset: (n: Named, m: Mode, a: Paise) => step(tx.asset(n, m, a), `${capFirst(n.words)} bought for the shop, paid ${how(m)}`),
  goodsBought: (m: Mode, a: Paise) => step(tx.goodsBought(m, a), m === 'cash' ? 'Goods bought for cash' : 'Goods bought and paid for by cheque'),
  goodsSold: (m: Mode, a: Paise) => step(tx.goodsSold(m, a), m === 'cash' ? 'Goods sold for cash' : 'Goods sold against a cheque, banked the same day'),
  expense: (n: Named, m: Mode, a: Paise) => step(tx.expense(n, m, a), `Paid ${n.words} ${how(m)}`),
  commission: (m: Mode, a: Paise) => step(tx.commission(m, a), `Commission received ${m === 'cash' ? 'in cash' : 'by cheque, banked the same day'}`),
  creditPurchase: (supplier: string, a: Paise, more = false) => step(tx.creditPurchase(supplier, a), `${more ? 'More goods' : 'Goods'} bought on credit from ${supplier}`),
  creditSale: (customer: string, a: Paise, more = false) => step(tx.creditSale(customer, a), `${more ? 'More goods' : 'Goods'} sold on credit to ${customer}`),
  returnOut: (supplier: string, a: Paise) => step(tx.returnOut(supplier, a), `Goods returned to ${supplier}`),
  returnIn: (customer: string, a: Paise) => step(tx.returnIn(customer, a), `Goods returned by ${customer}`),
  paySupplier: (supplier: string, paid: Paise, discount: Paise) =>
    step(tx.paySupplier(supplier, paid, discount), discount > 0 ? `Cheque paid to ${supplier}, who allowed a discount` : `Cheque paid to ${supplier} on account`),
  receive: (customer: string, received: Paise, discount: Paise) =>
    step(tx.receiveFromCustomer(customer, received, discount), discount > 0 ? `Cheque received from ${customer}, who was allowed a discount` : `Cheque received from ${customer} on account`),
  /** The supplier is paid all that is owed: the account is closed, and has no place in the trial balance. */
  payInFull: (supplier: string, a: Paise) =>
    step(
      {
        key: 'payInFull',
        text: `Paid ${supplier} ${F(a)} by cheque, the whole amount due.`,
        lines: [dr(creditor(supplier), a), cr('bank', a)],
        steps: [`Nothing more is owed to ${supplier}, so ${poss(supplier)} account is debited with all that was due.`, 'The cheque is paid out of the bank, so Bank A/c is credited.'],
        distract: ['discountReceived', 'purchases'],
      },
      `Cheque paid to ${supplier} for the whole amount due`,
    ),
  receiveInFull: (customer: string, a: Paise) =>
    step(
      {
        key: 'receiveInFull',
        text: `Received ${F(a)} from ${customer} by cheque, the whole amount due.`,
        lines: [dr('bank', a), cr(debtor(customer), a)],
        steps: ['The cheque goes into the bank, so Bank A/c is debited.', `${customer} owes nothing more, so ${poss(customer)} account is credited with all that was due.`],
        distract: ['discountAllowed', 'sales'],
      },
      `Cheque received from ${customer} for the whole amount due`,
    ),
  gstBuy: (g: Gst, base: Paise, supplier: string | null) =>
    step(gstTx.buy(g, base, supplier), supplier ? `Goods bought on credit from ${supplier}, with GST` : 'Goods bought with GST and paid for by cheque', taxNote(g, base)),
  gstSell: (g: Gst, base: Paise, customer: string | null) =>
    step(gstTx.sell(g, base, customer), customer ? `Goods sold on credit to ${customer}, with GST` : 'Goods sold with GST against a cheque, banked the same day', taxNote(g, base)),
  gstReturnOut: (g: Gst, base: Paise, supplier: string) => step(gstTx.returnOut(g, base, supplier), `Goods returned to ${supplier}, with their GST`, taxNote(g, base)),
  gstReturnIn: (g: Gst, base: Paise, customer: string) => step(gstTx.returnIn(g, base, customer), `Goods returned by ${customer}, with their GST`, taxNote(g, base)),
};

/**
 * True while nothing is sold before the business has it: the goods sold so far (sales less what customers sent back,
 * at selling price) never come to more than the goods had so far (the opening stock and the purchases, less what
 * went back to suppliers).
 */
export function boughtBeforeSold(order: readonly Step[]): boolean {
  let had = 0;
  let sold = 0;
  for (const s of order) {
    for (const l of s.lines) {
      if ((l.accountId === 'purchases' || l.accountId === 'stock') && l.side === 'Dr') had += l.amount;
      if (l.accountId === 'purchasesReturn' && l.side === 'Cr') had -= l.amount;
      if (l.accountId === 'sales' && l.side === 'Cr') sold += l.amount;
      if (l.accountId === 'salesReturn' && l.side === 'Dr') sold -= l.amount;
    }
    if (sold > had) return false;
  }
  return true;
}

/**
 * An order for the month that can happen: `first`, then the threads merged (each keeps its own order). Cash and bank
 * never run out, nobody is paid or pays more than is owed at the time, and nothing is sold before the business has
 * it. A few orders are tried before the seed is given up.
 */
export function arrange(rng: Rng, first: Step[], threads: Step[][]): Step[] | null {
  for (let go = 0; go < 20; go++) {
    const order = [...first, ...interleave(rng, threads)];
    if (storyHolds(order, { cash: 0, bank: 0 }) && boughtBeforeSold(order)) return order;
  }
  return null;
}

/** Dates for the steps in order: the first on the 1st and the rest on later days, or all of them after the 1st. */
export function onDays(rng: Rng, b: Business, steps: Step[], afterFirst = false): Dated[] {
  const later = laterDays(rng, steps.length - (afterFirst ? 0 : 1));
  const days = afterFirst ? later : [1, ...later];
  return steps.map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
}
export const told = (t: Dated) => `${t.date}: ${t.text}`;

/** An account the student prepares: its rows from the books, and what its part of the case says. */
export interface Asked {
  id: string;
  view: AccountView;
  sides: Pick<AccountParts, 'left' | 'right' | 'broughtDown'>;
  closing: Closing;
  task: string;
  distractors: string[];
  /** A line of the working on the entries that do not belong in the account. */
  leftOut?: string;
}

/** The trial balance by the balance method: every account balanced in the order the accounts were opened. */
export interface Tb {
  views: AccountView[];
  rows: FormatRowParts[];
  total: Paise;
}

/** What every chained case sets up. */
export interface Chain {
  b: Business;
  text: string;
  /** Every entry in date order; for a business that was already running, the opening entry first. */
  all: Dated[];
  /** The transactions of the month, without an opening entry. */
  month: Dated[];
  /** The balances the accounts open the month with; empty for a new business. */
  openings: Map<string, OpeningBalance>;
  asked: Asked[];
  tb: Tb;
}

const twinRows = (rows: readonly FormatRowParts[]) => new Set(rows.map((r) => `${r.label}|${r.amount}`)).size !== rows.length;

/**
 * An account to prepare, or null when it cannot be asked for: it has no balance to carry down or too few items, two
 * of its rows could not be told apart, or its balance is not on the side `natural` names.
 */
export function ask(
  b: Business,
  month: readonly Dated[],
  id: string,
  o: { bringDown: boolean; opening?: OpeningBalance; least: number; natural?: Side; distractors: string[]; leftOut?: string },
): Asked | null {
  const view = accountOf(month, id, o.opening ?? null);
  if (!view.balance || view.debit.length + view.credit.length < o.least) return null;
  if (o.natural && view.balance.side !== o.natural) return null;
  const closing: Closing = { closeOn: monthEnd(b), ...(o.bringDown ? { reopenOn: nextDay(b) } : {}) };
  const sides = ledgerSides(view, closing);
  if (twinRows(sides.left.rows) || twinRows(sides.right.rows)) return null;
  const name = ledgerLabel(id);
  const task = o.bringDown
    ? `Prepare ${name} in the books of ${b.owner} for ${b.month}. Balance it on ${closing.closeOn} and bring the balance down on ${closing.reopenOn}.`
    : `Prepare ${name} in the books of ${b.owner} for ${b.month} and balance it on ${closing.closeOn}.`;
  // The account itself, "b/d" where "c/d" is meant, and the accounts of what does not belong in it.
  const distractors = [name, ...(o.bringDown ? [] : [BALANCE_BD]), ...o.distractors];
  const used = new Set([...sides.left.rows, ...sides.right.rows, ...(sides.left.below ?? []), ...(sides.right.below ?? [])].map((r) => r.label));
  if (new Set(distractors.filter((d) => !used.has(d))).size < 2) return null;
  // The task speaks of a compound entry only in a month that has one for this account: one entry, several rows.
  const dates = [...view.debit, ...view.credit].map((p) => p.date);
  const compound = new Set(dates).size < dates.length;
  return { id, view, sides, closing, task: compound ? `${task} ${COMPOUND_ROWS}` : task, distractors, ...(o.leftOut ? { leftOut: o.leftOut } : {}) };
}

export function trialBalanceOf(all: readonly Dated[]): Tb {
  const ids = [...new Set(all.flatMap((e) => e.lines.map((l) => l.accountId)))];
  const views = ids.map((id) => accountOf(all, id));
  const rows = views.flatMap((v) => (v.balance ? [{ label: ledgerLabel(v.accountId), amounts: v.balance.side === 'Dr' ? [v.balance.amount, 0] : [0, v.balance.amount] }] : []));
  return { views, rows, total: sum(rows.map((r) => r.amounts[0])) };
}

/** What an account is, said in a few words beside its balance in the working of the trial balance. */
function natureOf(accountId: string): string {
  if (accountId.startsWith('debtor:')) return 'a debtor';
  if (accountId.startsWith('creditor:')) return 'a creditor';
  if (isInputGst(accountId)) return 'tax paid, to be set off';
  if (isOutputGst(accountId)) return 'tax collected, owed to the government';
  const named: Record<string, string> = {
    capital: 'owed to the proprietor',
    drawings: 'it reduces capital',
    purchasesReturn: 'it reduces purchases',
    salesReturn: 'it reduces sales',
    discountAllowed: 'a loss',
    discountReceived: 'a gain',
    stock: 'an asset: the opening stock',
  };
  if (named[accountId]) return named[accountId];
  const type = resolveAccount(accountId).type;
  return type === 'asset' ? 'an asset' : type === 'liability' ? 'a liability' : type === 'income' ? 'an income' : 'an expense';
}

/** The rule an account is written up by, the first line of its working. */
function ruleOf(accountId: string): string {
  const name = ledgerLabel(accountId);
  const who = resolveAccount(accountId).name;
  if (accountId === 'cash') return 'Cash A/c is debited with cash received and credited with cash paid. The particulars name the other account of the entry.';
  if (accountId === 'bank') return 'Bank A/c is debited with money paid into the bank and credited with cheques issued and cash withdrawn. The particulars name the other account of the entry.';
  if (accountId.startsWith('debtor:')) return `${who} is a customer. ${name} is debited with whatever raises the amount ${who} owes, and credited with whatever lowers it.`;
  if (accountId.startsWith('creditor:')) return `${who} is a supplier. ${name} is credited with whatever raises the amount owed to ${who}, and debited with whatever lowers it.`;
  if (accountId === 'purchases') return 'Purchases A/c is debited with goods bought for resale, whether for cash, by cheque or on credit. The particulars name the account that is credited.';
  if (accountId === 'sales') return 'Sales A/c is credited with goods sold, whether for cash, by cheque or on credit. The particulars name the account that is debited.';
  if (isInputGst(accountId)) return `${name} is debited with the tax paid on goods bought, which will be set off against the tax on sales, and credited when goods go back to a supplier.`;
  return `${name} is credited with the tax charged on goods sold, which is owed to the government, and debited when a customer sends goods back.`;
}

/** Why an entry puts the account on that side. */
function whyPosted(accountId: string, side: Side): string {
  const name = ledgerLabel(accountId);
  const who = resolveAccount(accountId).name;
  const dr = side === 'Dr';
  if (accountId === 'cash') return dr ? 'cash comes in, so Cash A/c is debited' : 'cash goes out, so Cash A/c is credited';
  if (accountId === 'bank') return dr ? 'money goes into the bank, so Bank A/c is debited' : 'money is paid out of the bank, so Bank A/c is credited';
  if (accountId.startsWith('debtor:')) return dr ? `${who} owes more, so ${name} is debited` : `${who} owes less, so ${name} is credited`;
  if (accountId.startsWith('creditor:')) return dr ? `${who} is owed less, so ${name} is debited` : `${who} is owed more, so ${name} is credited`;
  if (accountId === 'purchases') return 'goods are bought for resale, so Purchases A/c is debited';
  if (accountId === 'sales') return 'goods are sold, so Sales A/c is credited';
  if (isInputGst(accountId)) return dr ? `the tax on the goods bought can be set off later, so ${name} is debited` : `the tax on the goods sent back can no longer be claimed, so ${name} is credited`;
  return dr ? `the tax on the goods that came back is no longer owed, so ${name} is debited` : `the tax charged on the goods sold is owed to the government, so ${name} is credited`;
}

/** The working of an account: its rule, every entry that touches it with the rows it gives, what is left out, and the balance. */
export function accountWorking(month: readonly Dated[], a: Asked, opening?: OpeningBalance): string[] {
  const out = [ruleOf(a.id)];
  if (opening) out.push(`${opening.date}: the balance brought forward opens the account on its ${sideName(opening.side)} side. Enter "${pre(opening.side)} ${BALANCE_BD}" ${F(opening.amount)}.`);
  for (const t of month) {
    const ps = postingsOf([t], a.id);
    if (ps.length === 0) continue;
    const rows = listed(ps.map((p) => `"${pre(p.side)} ${p.label}" ${F(p.amount)}`));
    // The tax of an invoice is worked out, not read off the case, in the party's account and in the tax account.
    const calc = t.calc && (isParty(a.id) || isInputGst(a.id) || isOutputGst(a.id)) ? ` ${t.calc}` : '';
    out.push(`${t.date} (${t.brief}): ${whyPosted(a.id, ps[0].side)}.${calc} Enter ${rows}.`);
  }
  if (a.leftOut) out.push(a.leftOut);
  out.push(...sideWork(a.view));
  if (a.closing.reopenOn) {
    const { side, amount: left } = a.view.balance!;
    out.push(`On ${a.closing.reopenOn} the balance is brought down on the ${sideName(side)} side, below the totals: "${pre(side)} ${BALANCE_BD} ${F(left)}".`);
  }
  return out;
}

/** The working of the trial balance: every account balanced in turn, with what it is, and the total the columns agree at. */
export function tbWorking(tb: Tb, hasOpening: boolean): string[] {
  const total = (ps: readonly { amount: Paise }[]) => sum(ps.map((p) => p.amount));
  return [
    hasOpening
      ? 'Start each account from its balance of 1 April, post the entries of the month to it, then balance it: the larger side less the smaller side.'
      : 'Post every entry to its accounts, then balance each account: the larger side less the smaller side.',
    ...tb.views.map((v) => {
      const label = ledgerLabel(v.accountId);
      if (!v.balance) return `${label}: debits ${F(total(v.debit))}, credits ${F(total(v.credit))}; no balance, so it is left out.`;
      const side = sideName(v.balance.side);
      // An account posted on one side only: its balance is the total of that side.
      const sides = v.debit.length === 0 || v.credit.length === 0 ? `${side}s only` : `debits ${F(total(v.debit))}, credits ${F(total(v.credit))}`;
      return `${label} (${natureOf(v.accountId)}): ${sides}; a ${side} balance of ${F(v.balance.amount)}.`;
    }),
    hasOpening
      ? 'Stock A/c keeps its balance of 1 April: goods bought and sold in the month stand in Purchases A/c and Sales A/c.'
      : 'There is no Stock A/c: goods bought stand in Purchases A/c and goods sold in Sales A/c, and the goods left unsold are valued only when the final accounts are prepared.',
    `Both columns total ${F(tb.total)}, so the trial balance agrees.`,
  ];
}

/** Names a student may take one for the other: when one of a pair has a balance, the other is offered. */
const TB_TWINS: [string, string][] = [
  ['purchasesReturn', 'salesReturn'],
  ['discountAllowed', 'discountReceived'],
  ['inputCGST', 'outputCGST'],
  ['inputSGST', 'outputSGST'],
  ['inputIGST', 'outputIGST'],
];

// ---- the parts ----

export const setPart = (s: Chain, task: string): CaseSetParts => {
  const entered = new Set(s.all.flatMap((t) => t.lines.map((l) => l.accountId)));
  return {
    task,
    transactions: s.all.map((t) => ({ date: t.date, text: stop(t.brief), lines: t.lines, explanation: t.steps })),
    // The accounts a student might wrongly pick, a few of them: the picker also offers every account of the set.
    distractorAccounts: [...new Set(s.all.flatMap((t) => t.distract))].filter((id) => !entered.has(id)).slice(0, 6),
  };
};

export const accountPart = (s: Chain, i: number): CaseAccountParts => {
  const a = s.asked[i];
  return {
    task: a.task,
    title: ledgerLabel(a.id),
    ...a.sides,
    distractors: a.distractors,
    explanation: accountWorking(s.month, a, s.openings.get(a.id)),
    hints: HINTS_ACCOUNT,
  };
};

export const tbPart = (s: Chain): CaseStatementParts => {
  const present = new Set(s.tb.views.filter((v) => v.balance).map((v) => v.accountId));
  const hasOpening = s.openings.size > 0;
  // Dated with its year, as an examiner heads a trial balance; the method is named here, where it is asked for.
  const date = `${monthEnd(s.b)} ${yearOf(s.b)}`;
  return {
    task: `Prepare the Trial Balance of ${s.b.owner} as on ${date} by the balance method. Leave out an account that has no balance.`,
    title: `Trial Balance of ${s.b.owner} as on ${date}`,
    heading: 'Name of account',
    columns: TB_COLUMNS,
    totalsAgree: true,
    rows: s.tb.rows,
    // An account that was closed (listing it is the slip the task warns against), a Suspense A/c, which a trial
    // balance that agrees does not need, the stock that is not a ledger balance, and the twin of a name in the list.
    distractors: [
      ...s.tb.views.filter((v) => !v.balance).map((v) => ledgerLabel(v.accountId)),
      'Suspense A/c',
      hasOpening ? 'Closing Stock A/c' : 'Stock A/c',
      ...TB_TWINS.flatMap(([x, y]) => (present.has(x) !== present.has(y) ? [ledgerLabel(present.has(x) ? y : x)] : [])),
      ...(present.has('drawings') ? [] : ['Drawings A/c']),
    ],
    explanation: tbWorking(s.tb, hasOpening),
    hints: HINTS_TB,
  };
};

// ---- the printed case read back: the independent check of every part ----

const toPaise = (rupeesText: string): Paise => Number(rupeesText.replace(/,/g, '')) * 100;

/** The entry a transaction calls for, read from its wording in the case text; null when the wording is not known. */
export function readTransaction(text: string, g: Gst | null): JournalLine[] | null {
  const is = (re: RegExp) => re.exec(text);
  const mode = (words: string): Mode => (words.startsWith('in cash') ? 'cash' : 'bank');
  const idOf = (list: Named[], words: string) => list.find((n) => n.words === words)?.id;
  /** The lines of an invoice or of a return: the party or the bank for the total, the goods, and the tax worked out again. */
  const taxed = (plusGst: string | undefined, base: Paise, total: (t: Paise) => JournalLine, goods: JournalLine, dir: 'input' | 'output'): JournalLine[] | null => {
    if (!plusGst) return [total(base), goods];
    if (!g) return null;
    const tax = Math.round((base * g.rate) / 100);
    const put = goods.side === 'Dr' ? dr : cr;
    return [total(base + tax), goods, ...(g.intra ? [put(`${dir}CGST`, tax / 2), put(`${dir}SGST`, tax / 2)] : [put(`${dir}IGST`, tax)])];
  };
  let m: RegExpExecArray | null;
  if ((m = is(/^Started business with cash ₹([\d,]+)\.$/))) return [dr('cash', toPaise(m[1])), cr('capital', toPaise(m[1]))];
  if ((m = is(/^Started business with ₹([\d,]+) paid into a bank account opened for the business\.$/))) return [dr('bank', toPaise(m[1])), cr('capital', toPaise(m[1]))];
  if ((m = is(/^Started business with cash ₹([\d,]+) and ₹([\d,]+) paid into a new business bank account\.$/)))
    return [dr('cash', toPaise(m[1])), dr('bank', toPaise(m[2])), cr('capital', toPaise(m[1]) + toPaise(m[2]))];
  if ((m = is(/^Opened a bank account for the business and deposited ₹([\d,]+) out of cash\.$/))) return [dr('bank', toPaise(m[1])), cr('cash', toPaise(m[1]))];
  if ((m = is(/^Withdrew ₹([\d,]+) from the bank for office use\.$/))) return [dr('cash', toPaise(m[1])), cr('bank', toPaise(m[1]))];
  if ((m = is(/^.+ took ₹([\d,]+) in cash for personal use\.$/))) return [dr('drawings', toPaise(m[1])), cr('cash', toPaise(m[1]))];
  if ((m = is(/^.+ withdrew ₹([\d,]+) from the business bank account for personal use\.$/))) return [dr('drawings', toPaise(m[1])), cr('bank', toPaise(m[1]))];
  if ((m = is(/^Bought goods from (.+) on credit ₹([\d,]+)( plus GST)?\.$/))) {
    const supplier = creditor(m[1]);
    return taxed(m[3], toPaise(m[2]), (t) => cr(supplier, t), dr('purchases', toPaise(m[2])), 'input');
  }
  if ((m = is(/^Sold goods to (.+) on credit ₹([\d,]+)( plus GST)?\.$/))) {
    const customer = debtor(m[1]);
    return taxed(m[3], toPaise(m[2]), (t) => dr(customer, t), cr('sales', toPaise(m[2])), 'output');
  }
  if ((m = is(/^Goods returned to (.+) ₹([\d,]+)( plus GST)?\.$/))) {
    const supplier = creditor(m[1]);
    return taxed(m[3], toPaise(m[2]), (t) => dr(supplier, t), cr('purchasesReturn', toPaise(m[2])), 'input');
  }
  if ((m = is(/^Goods returned by (.+) ₹([\d,]+)( plus GST)?\.$/))) {
    const customer = debtor(m[1]);
    return taxed(m[3], toPaise(m[2]), (t) => cr(customer, t), dr('salesReturn', toPaise(m[2])), 'output');
  }
  if ((m = is(/^Bought goods for cash ₹([\d,]+)\.$/))) return [dr('purchases', toPaise(m[1])), cr('cash', toPaise(m[1]))];
  if ((m = is(/^Bought goods ₹([\d,]+)( plus GST)?, paid by cheque\.$/))) return taxed(m[2], toPaise(m[1]), (t) => cr('bank', t), dr('purchases', toPaise(m[1])), 'input');
  if ((m = is(/^Sold goods for cash ₹([\d,]+)\.$/))) return [dr('cash', toPaise(m[1])), cr('sales', toPaise(m[1]))];
  if ((m = is(/^Sold goods ₹([\d,]+)( plus GST)?; the cheque received was banked the same day\.$/)))
    return taxed(m[2], toPaise(m[1]), (t) => dr('bank', t), cr('sales', toPaise(m[1])), 'output');
  if ((m = is(/^Bought (.+) for the shop ₹([\d,]+), paid (in cash|by cheque)\.$/))) {
    const id = idOf(ASSETS, m[1]);
    return id ? [dr(id, toPaise(m[2])), cr(mode(m[3]), toPaise(m[2]))] : null;
  }
  if ((m = is(/^Received commission ₹([\d,]+) (in cash|by cheque, banked the same day)\.$/))) return [dr(mode(m[2]), toPaise(m[1])), cr('commissionReceived', toPaise(m[1]))];
  if ((m = is(/^Paid (.+) ₹([\d,]+) by cheque and received a discount of ₹([\d,]+)\.$/)))
    return [dr(creditor(m[1]), toPaise(m[2]) + toPaise(m[3])), cr('bank', toPaise(m[2])), cr('discountReceived', toPaise(m[3]))];
  if ((m = is(/^Paid (.+) ₹([\d,]+) by cheque(?: on account|, the whole amount due)\.$/))) return [dr(creditor(m[1]), toPaise(m[2])), cr('bank', toPaise(m[2]))];
  if ((m = is(/^Received ₹([\d,]+) from (.+) by cheque and allowed a discount of ₹([\d,]+)\.$/)))
    return [dr('bank', toPaise(m[1])), dr('discountAllowed', toPaise(m[3])), cr(debtor(m[2]), toPaise(m[1]) + toPaise(m[3]))];
  if ((m = is(/^Received ₹([\d,]+) from (.+) by cheque(?: on account|, the whole amount due)\.$/))) return [dr('bank', toPaise(m[1])), cr(debtor(m[2]), toPaise(m[1]))];
  if ((m = is(/^Paid (.+) ₹([\d,]+) (in cash|by cheque)\.$/))) {
    const id = idOf(EXPENSES, m[1]);
    return id ? [dr(id, toPaise(m[2])), cr(mode(m[3]), toPaise(m[2]))] : null;
  }
  return null;
}

/** The account a name in a printed journal or in a list of balances stands for: "Bank A/c", "Rao & Co. A/c". */
export function accountNamed(label: string): string | null {
  const known = CLASS11_ACCOUNTS.find((a) => `${a.name} A/c` === label);
  if (known) return known.id;
  const name = label.replace(/ A\/c$/, '');
  return SUPPLIERS.includes(name) ? creditor(name) : CUSTOMERS.includes(name) ? debtor(name) : null;
}

/** An entry printed in the case as a line of the journal: "Bank A/c Dr ₹19,000; Discount Allowed A/c Dr ₹1,000; To Kiran A/c ₹20,000". */
export function readJournalLine(body: string): JournalLine[] | null {
  const lines: JournalLine[] = [];
  for (const part of body.split('; ')) {
    const m = /^To (.+ A\/c) ₹([\d,]+)$/.exec(part) ?? /^(.+ A\/c) Dr ₹([\d,]+)$/.exec(part);
    const id = m && accountNamed(m[1]);
    if (!m || !id) return null;
    lines.push(part.startsWith('To ') ? cr(id, toPaise(m[2])) : dr(id, toPaise(m[2])));
  }
  return lines;
}

/**
 * The books a case text gives, read from its wording alone: the opening entry when the case lists balances (capital
 * is worked out again as assets less liabilities), then one entry for each dated line. Null when a line is not
 * understood, so that a case whose wording and entries have drifted apart is never served.
 */
export function readCase(text: string): { entries: DatedEntry[]; opening: DatedEntry | null } | null {
  const rate = /GST at (\d+)%/.exec(text);
  const g: Gst | null = rate ? { rate: Number(rate[1]), intra: /intra-State/.test(text) } : null;
  const entries: DatedEntry[] = [];
  const balances: JournalLine[] = [];
  for (const row of text.split('\n')) {
    const balance = /^([^:₹]+): ₹([\d,]+)$/.exec(row);
    const dated = /^(\d{1,2} [A-Z][a-z]+): (.+)$/.exec(row);
    if (balance && !dated) {
      const [, label, value] = balance;
      const party = /^(.+) \((debtor|creditor)\)$/.exec(label);
      const id = party ? (party[2] === 'debtor' ? debtor(party[1]) : creditor(party[1])) : accountNamed(`${label} A/c`);
      if (!id) return null;
      balances.push(resolveAccount(id).type === 'asset' ? dr(id, toPaise(value)) : cr(id, toPaise(value)));
    } else if (dated) {
      const lines = / A\/c Dr ₹/.test(dated[2]) ? readJournalLine(dated[2]) : readTransaction(dated[2], g);
      if (!lines) return null;
      entries.push({ date: dated[1], lines });
    }
  }
  if (balances.length === 0) return { entries, opening: null };
  const day = /on (1 [A-Z][a-z]+)/.exec(text);
  const capital = sum(balances.map((l) => (l.side === 'Dr' ? l.amount : -l.amount)));
  if (!day || capital <= 0) return null;
  const opening: DatedEntry = { date: day[1], lines: [...balances, cr('capital', capital)] };
  return { entries: [opening, ...entries], opening };
}

const linesKey = (lines: readonly JournalLine[]) => lines.map((l) => `${l.accountId}|${l.side}|${l.amount}`).sort().join(';');

/** The set of entries is the journal the printed case calls for, entry by entry, and its story can happen. */
export function setRead(q: JournalSetQuestion): boolean {
  const read = readCase(q.context ?? '');
  if (!read || read.entries.length !== q.entries.length) return false;
  return read.entries.every((e, i) => q.entries[i].date === e.date && linesKey(q.entries[i].expected) === linesKey(e.lines)) && storyHolds(read.entries, { cash: 0, bank: 0 });
}

/**
 * The account holds against the printed case: its balance, found by posting the entries read from the case, is
 * carried down on the shorter side (and brought down where the task asks); each side carries what those entries
 * debit and credit to the account; and every row names an account on the other side of the entry of its date.
 */
export function accountRead(q: AccountQuestion): boolean {
  const read = readCase(q.data);
  if (!read) return false;
  const id = [...new Set(read.entries.flatMap((e) => e.lines.map((l) => l.accountId)))].find((x) => ledgerLabel(x) === q.title);
  const balance = id ? balanceOf(post(read.entries.map((e) => e.lines)), id) : null;
  if (!id || !balance) return false;
  // A debit balance is carried down on the credit side, and brought down on the debit side.
  const short = balance.side === 'Dr' ? 1 : 0;
  const closing = q.sides.map((s) => s.rows.filter((r) => r.closing));
  if (closing[short].length !== 1 || closing[1 - short].length !== 0 || closing[short][0].label !== BALANCE_CD || closing[short][0].amounts[0] !== balance.amount) return false;
  const below = q.sides.map((s) => s.below);
  if (below[short].length > 0 || below[1 - short].length !== (q.continued ? 1 : 0)) return false;
  if (below[1 - short].some((r) => r.label !== BALANCE_BD || r.amounts[0] !== balance.amount)) return false;
  return (['Dr', 'Cr'] as const).every((side, i) => {
    const rows = q.sides[i].rows.filter((r) => !r.closing);
    const own = (e: DatedEntry) => e.lines.filter((l) => l.accountId === id && l.side === side);
    if (sum(rows.map((r) => r.amounts[0])) !== sum(read.entries.flatMap((e) => own(e).map((l) => l.amount)))) return false;
    return rows.every((r) => {
      const entry = read.entries.find((e) => e.date === r.date && own(e).length === 1);
      if (!entry) return false;
      // The balance of the opening entry is brought down; any other row names an account of the other side.
      if (r.label === BALANCE_BD || entry === read.opening) return r.label === BALANCE_BD && entry === read.opening && own(entry)[0].amount === r.amounts[0];
      const other = entry.lines.find((l) => l.side !== side && ledgerLabel(l.accountId) === r.label);
      return other !== undefined && (r.amounts[0] === other.amount || r.amounts[0] === own(entry)[0].amount);
    });
  });
}

/** The trial balance is that of the books posted from the printed case: every balance in its column, and the columns agreeing. */
export function trialBalanceRead(q: StatementQuestion): boolean {
  const read = readCase(q.data);
  if (!read) return false;
  const tb = trialBalance(post(read.entries.map((e) => e.lines)));
  const totals = columnTotals(q.rows, 2);
  if (tb.debitTotal !== tb.creditTotal || tb.rows.length !== q.rows.length || totals[0] !== tb.debitTotal || totals[1] !== tb.creditTotal) return false;
  return tb.rows.every((r) => q.rows.some((row) => row.label === ledgerLabel(r.accountId) && row.amounts[0] === (r.side === 'Dr' ? r.amount : 0) && row.amounts[1] === (r.side === 'Cr' ? r.amount : 0)));
}

/** The accounts of the month that an account does not show, as labels a student might wrongly pick for it. */
export const strangers = (month: readonly Dated[], id: string): string[] => {
  const own = new Set(postingsOf(month, id).flatMap((p) => p.accountIds));
  return [...new Set(month.flatMap((t) => t.lines.map((l) => l.accountId)))].filter((x) => x !== id && !own.has(x)).map(ledgerLabel);
};

/** The line of the working of Purchases A/c or Sales A/c on the entries of the month that look as if they belonged in it. */
export function goodsLeftOut(month: readonly Dated[], id: 'purchases' | 'sales'): string {
  const has = (...keys: string[]) => month.some((t) => keys.includes(t.key));
  const parts =
    id === 'purchases'
      ? [
          ...(has('returnOut') ? ['the goods sent back to a supplier (they are credited to Purchases Return A/c)'] : []),
          ...(has('paySupplier', 'payInFull') ? ['the cheque paid to a supplier (it settles a debt: no goods are bought)'] : []),
          ...(has('asset') ? ['what was bought for use in the shop (an asset, with an account of its own)'] : []),
          'the goods sold (they are credited to Sales A/c)',
        ]
      : [
          ...(has('returnIn') ? ['the goods a customer sent back (they are debited to Sales Return A/c)'] : []),
          ...(has('receiveFromCustomer', 'receiveInFull') ? ['the cheque received from a customer (it settles a debt: no goods are sold)'] : []),
          ...(has('commission') ? ['the commission (an income with an account of its own)'] : []),
          'the goods bought (they are debited to Purchases A/c)',
        ];
  return `Left out: ${parts.join('; ')}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Chain 1. A new shop that deals only in cash and by cheque: the journal, Cash A/c or Bank A/c, the trial balance (easy)
// ---------------------------------------------------------------------------------------------------------------

const cashChain = caseTemplate<Chain>({
  id: 'case-cycle-chain-cash-month',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'easy',
  title: 'A new shop: journal, an account, trial balance',
  setup: (rng) => {
    const b = business(rng);
    const modes: Mode[] = ['cash', 'bank'];
    const otherMode = (m: Mode): Mode => (m === 'cash' ? 'bank' : 'cash');
    // The capital comes in as cash and most of it is banked the next day, or part as cash and part into the bank.
    const split = rng.pick([true, false]);
    const capitalRupees = rng.step(300000, 800000, 50000);
    const toBank = rupees(Math.round((capitalRupees * rng.pick([60, 70, 80])) / 1000000) * 10000);
    const capital = rupees(capitalRupees);
    const asset = rng.pick(ASSETS);
    const [e1, e2] = rng.shuffle(EXPENSES);
    const buyMode = rng.pick(modes);
    const sellMode = rng.pick(modes);
    const opening = split ? [cs.capital('cash', capital), cs.deposit(toBank)] : [cs.capitalBoth(capital - toBank, toBank)];
    const base: Step[] = [
      cs.asset(asset, rng.pick<Mode>(['bank', 'bank', 'cash']), pickAmount(rng, asset)),
      cs.goodsBought(buyMode, amount(rng, 40000, 90000, 5000)),
      cs.goodsSold(sellMode, amount(rng, 20000, 60000, 5000)),
      cs.expense(e1, rng.pick(modes), pickAmount(rng, e1)),
    ];
    // Which other transactions the month has changes with the seed: each kind at most once, by the other means of
    // payment where the kind is there already, so that no account shows two rows alike.
    // The first of them opens an account of its own, so the trial balance has eight balances at least.
    const [own, ...others] = rng.shuffle<() => Step>([
      () => cs.drawings(b.owner, rng.pick(modes), amount(rng, 4000, 15000, 1000)),
      () => cs.commission(rng.pick(modes), amount(rng, 2000, 9000, 500)),
      () => cs.expense(e2, rng.pick(modes), pickAmount(rng, e2)),
    ]);
    const extras = [
      own,
      ...rng.shuffle<() => Step>([
        ...others,
        () => cs.goodsBought(otherMode(buyMode), amount(rng, 20000, 50000, 5000)),
        () => cs.goodsSold(otherMode(sellMode), amount(rng, 15000, 40000, 5000)),
        () => cs.office(amount(rng, 10000, 30000, 5000)),
      ]),
    ];
    const count = split ? 7 : rng.pick([6, 7]);
    const rest = [...base, ...extras.slice(0, count - opening.length - base.length).map((make) => make())];
    const order = arrange(rng, opening, rest.map((s) => [s]));
    if (!order) return null;
    const all = onDays(rng, b, order);
    // Cash A/c or Bank A/c, whichever the seed names, if it has enough items to be worth preparing.
    const want = rng.pick(modes);
    const account = (id: Mode) =>
      ask(b, all, id, {
        bringDown: false,
        least: 4,
        natural: 'Dr',
        distractors: strangers(all, id),
        leftOut:
          id === 'cash'
            ? 'A transaction settled by cheque is posted to Bank A/c: it does not touch Cash A/c.'
            : 'A transaction settled in cash is posted to Cash A/c: it does not touch Bank A/c.',
      });
    const asked = account(want) ?? account(otherMode(want));
    if (!asked) return null;
    // Every line says how it was settled, and a cheque received is said to be banked where it is received, so the
    // case has no convention to state.
    const text = [`${b.owner} opened ${b.shop} on ${firstDay(b)}. These are the transactions of ${b.month}:`, ...all.map(told)].join('\n');
    return { b, text, all, month: all, openings: new Map(), asked: [asked], tb: trialBalanceOf(all) };
  },
  context: (s) => s.text,
  parts: [
    { kind: 'journal_set', make: (s) => setPart(s, `Journalise the transactions of ${s.b.month}.`), verify: setRead },
    { kind: 'account', make: (s) => accountPart(s, 0), verify: accountRead },
    { kind: 'statement', make: (s) => tbPart(s), verify: trialBalanceRead },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 2. Buying and selling on credit, with returns and settlements: the journal, the account of a customer or of
// a supplier, a second account of four items or more (Purchases A/c, Sales A/c or Bank A/c), and the trial balance
// (medium)
// ---------------------------------------------------------------------------------------------------------------

/** The labels a student might wrongly pick in a party's account: those of the other kind of party, and cash for a cheque. */
export const partyStrangers = (supplier: boolean): string[] =>
  supplier ? ['Sales A/c', 'Sales Return A/c', 'Discount Allowed A/c', 'Cash A/c'] : ['Purchases A/c', 'Purchases Return A/c', 'Discount Received A/c', 'Cash A/c'];

const creditChain = caseTemplate<Chain>({
  id: 'case-cycle-chain-credit-month',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Credit dealings: journal, two accounts, trial balance',
  setup: (rng) => {
    const b = business(rng);
    const [supplier, supplier2] = rng.shuffle(SUPPLIERS);
    const [customer, customer2] = rng.shuffle(CUSTOMERS);
    // The personal account asked for, and the second account, each drawn on its own. The second is Purchases A/c or
    // Sales A/c in a month with four lots of those goods, or Bank A/c in a month with four cheques or more: an
    // account of two or three items would be too little for a quarter of the marks.
    const party = rng.pick(['supplier', 'customer'] as const);
    const ofSupplier = party === 'supplier';
    const book = rng.pick(['purchases', 'sales', 'bank'] as const);
    const buying = book === 'bank' ? rng.pick([true, false]) : book === 'purchases';
    // Besides the capital, the first purchase, the first sale and the return and the cheque of the party asked for,
    // the month has two or three more transactions.
    type Extra = 'more' | 'another' | 'ready' | 'otherSettle' | 'otherReturn' | 'expense' | 'drawings';
    const picked = new Set<Extra>(['more', 'another', 'ready']);
    if (book === 'bank') {
      // Two of them go through the bank; a third, in some months, is any of the others.
      const cheques = rng.shuffle<Extra>(['ready', 'otherSettle', 'expense', 'drawings']);
      const third = rng.pick<Extra>([...cheques.slice(2), 'otherReturn', 'more', 'another']);
      picked.clear();
      for (const x of [cheques[0], cheques[1], ...(rng.pick([true, false]) ? [third] : [])]) picked.add(x);
    }
    const capital = amount(rng, 200000, 500000, 50000);
    // In a month of four sales the first purchase is large enough for all of them.
    const buy1 = book === 'sales' ? amount(rng, 110000, 150000, 5000) : amount(rng, 70000, 130000, 5000);
    const sell1 = amount(rng, 25000, 50000, 5000);
    // A lot of goods after the first is smaller than the first, so that no two rows of an account are alike.
    const lot = (wanted: boolean) => (!wanted ? 0 : buying ? amount(rng, 20000, 55000, 5000) : amount(rng, 10000, 20000, 5000));
    // More goods on credit from (or to) the same party, goods on credit from (or to) another, goods against a cheque.
    const more = lot(picked.has('more'));
    const another = lot(picked.has('another'));
    const ready = !picked.has('ready') ? 0 : buying ? amount(rng, 15000, 45000, 5000) : amount(rng, 10000, 20000, 5000);
    // The party whose account is asked for always has a return; the other one has it only when the seed says so.
    const returnOut = ofSupplier || picked.has('otherReturn') ? amount(rng, 4000, 12000, 1000) : 0;
    const returnIn = !ofSupplier || picked.has('otherReturn') ? amount(rng, 3000, 9000, 1000) : 0;
    const buy2 = buying ? more : 0;
    const sell2 = buying ? 0 : more;
    // A cheque on account, with or without a discount. The party whose account is not asked for sometimes settles in
    // full: that account is then closed, and has no place in the trial balance.
    const settle = (asked: boolean, owed: Paise) =>
      !asked && rng.int(1, 20) <= 7
        ? { paid: owed, discount: 0, full: true }
        : { paid: partOf(rng, owed), discount: rng.pick([true, false]) ? rupees(rng.pick([500, 1000])) : 0, full: false };
    const pay = settle(ofSupplier, buy1 + buy2 - returnOut);
    const got = settle(!ofSupplier, sell1 + sell2 - returnIn);
    if (pay.paid <= 0 || got.paid <= 0) return null;
    // The other party's cheque is in the month only when the seed says so.
    const paying = ofSupplier || picked.has('otherSettle');
    const receiving = !ofSupplier || picked.has('otherSettle');
    const e = rng.pick(EXPENSES);
    // A new shop buys before it sells: the first purchase follows the capital, and each thread keeps its own order.
    const buyThread: Step[] = [
      ...rng.shuffle([...(buy2 ? [cs.creditPurchase(supplier, buy2, true)] : []), ...(returnOut ? [cs.returnOut(supplier, returnOut)] : [])]),
      ...(paying ? [pay.full ? cs.payInFull(supplier, pay.paid) : cs.paySupplier(supplier, pay.paid, pay.discount)] : []),
    ];
    const sellThread: Step[] = [
      cs.creditSale(customer, sell1),
      ...rng.shuffle([...(sell2 ? [cs.creditSale(customer, sell2, true)] : []), ...(returnIn ? [cs.returnIn(customer, returnIn)] : [])]),
      ...(receiving ? [got.full ? cs.receiveInFull(customer, got.paid) : cs.receive(customer, got.paid, got.discount)] : []),
    ];
    const singles: Step[][] = [
      ...(another ? [[buying ? cs.creditPurchase(supplier2, another) : cs.creditSale(customer2, another)]] : []),
      ...(ready ? [[buying ? cs.goodsBought('bank', ready) : cs.goodsSold('bank', ready)]] : []),
      ...(picked.has('expense') ? [[cs.expense(e, 'bank', pickAmount(rng, e))]] : []),
      ...(picked.has('drawings') ? [[cs.drawings(b.owner, 'bank', amount(rng, 4000, 12000, 1000))]] : []),
    ];
    const order = arrange(rng, [cs.capital('bank', capital), cs.creditPurchase(supplier, buy1)], [buyThread, sellThread, ...singles]);
    if (!order) return null;
    const all = onDays(rng, b, order);
    const personal = ask(b, all, ofSupplier ? creditor(supplier) : debtor(customer), {
      bringDown: true,
      least: 3,
      natural: ofSupplier ? 'Cr' : 'Dr',
      distractors: partyStrangers(ofSupplier),
      leftOut: 'The particulars never repeat the name of the account itself: they name the other account of the entry.',
    });
    // Four items at least, besides the balance.
    const second =
      book === 'bank'
        ? ask(b, all, 'bank', {
            bringDown: true,
            least: 4,
            natural: 'Dr',
            distractors: ['Cash A/c', ...strangers(all, 'bank')],
            leftOut: `Left out: goods bought or sold on credit and goods returned (no money moves until a cheque is paid or received).${
              all.some((t) => t.lines.length > 2) ? ' A discount is not money: Bank A/c shows the amount of the cheque alone.' : ''
            }`,
          })
        : ask(b, all, book, {
            bringDown: false,
            least: 4,
            distractors: [buying ? 'Purchases Return A/c' : 'Sales Return A/c', buying ? 'Sales A/c' : 'Purchases A/c', 'Cash A/c', ledgerLabel(buying ? debtor(customer) : creditor(supplier)), 'Capital A/c'],
            leftOut: goodsLeftOut(all, book),
          });
    const tb = trialBalanceOf(all);
    // A trial balance of eight to fourteen balances: a month in which too little happened is not asked.
    if (!personal || !second || tb.rows.length < 8 || tb.rows.length > 14) return null;
    // Only the conventions the month relies on: where goods returned are recorded, and (when a customer pays by
    // cheque) that the cheque goes to the bank at once.
    const returns = listed([...(returnOut ? ['Purchases Return A/c'] : []), ...(returnIn ? ['Sales Return A/c'] : [])]);
    const text = [
      `${b.owner} started ${b.shop} on ${firstDay(b)} and buys and sells on credit.`,
      `Goods returned are recorded in ${returns}.${receiving ? ` ${BANKED}` : ''}`,
      ...all.map(told),
    ].join('\n');
    return { b, text, all, month: all, openings: new Map(), asked: [personal, second], tb };
  },
  context: (s) => s.text,
  parts: [
    { kind: 'journal_set', make: (s) => setPart(s, `Journalise the transactions of ${s.b.month}.`), verify: setRead },
    { kind: 'account', make: (s) => accountPart(s, 0), verify: accountRead },
    { kind: 'account', make: (s) => accountPart(s, 1), verify: accountRead },
    { kind: 'statement', make: (s) => tbPart(s), verify: trialBalanceRead },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 3. Opening balances on 1 April, then a month with GST: the opening entry and the month's entries, the account
// of a party (built from compound entries), an Input or Output GST account, and the trial balance (complex)
// ---------------------------------------------------------------------------------------------------------------

const openingChain = caseTemplate<Chain>({
  id: 'case-cycle-chain-opening',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Opening entry, GST and the trial balance',
  setup: (rng) => {
    // Balances are brought forward by an opening entry when a new accounting year begins, so the month is April.
    const b: Business = { ...business(rng), month: 'April', last: 30 };
    const [city, state] = rng.pick(CITIES);
    const g: Gst = { rate: rng.pick([5, 18]), intra: rng.pick([true, false]) };
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick(CUSTOMERS);
    const party = rng.pick(['supplier', 'customer'] as const);
    const dir = rng.pick(['input', 'output'] as const);
    const bank = amount(rng, 80000, 200000, 5000);
    const stock = amount(rng, 40000, 120000, 5000);
    const owedBy = amount(rng, 15000, 45000, 1000);
    const fixed = rng.pick(ASSETS);
    const fixedCost = pickAmount(rng, fixed);
    const owedTo = amount(rng, 20000, 50000, 1000);
    // The trial balance is kept to fourteen balances. Eight are always there (bank, stock, the two parties, the
    // asset, capital, purchases and sales) and the GST accounts are two or four; `spare` is what is left for a loan,
    // returns, an expense or drawings, and a discount.
    let spare = 14 - 8 - (g.intra ? 4 : 2);
    const loan = !g.intra && rng.pick([true, false]) ? amount(rng, 40000, 100000, 10000) : 0;
    if (loan) spare -= 1;
    const capital = bank + stock + owedBy + fixedCost - owedTo - loan;
    if (capital < rupees(100000)) return null;

    // Besides the two invoices and the two settlements the month has two or three more transactions. Two of them
    // give the GST account asked for three items in all, so that it is worth preparing: a return, and goods bought
    // or sold against a cheque.
    type More = 'returnOut' | 'returnIn' | 'buyCheque' | 'sellCheque' | 'other';
    const balances: Record<More, number> = { returnOut: 1, returnIn: 1, buyCheque: 0, sellCheque: 0, other: 1 };
    const more: More[] = dir === 'input' ? ['returnOut', 'buyCheque'] : ['returnIn', 'sellCheque'];
    spare -= 1;
    const wanted = rng.pick([2, 3]);
    for (const m of rng.shuffle<More>(['returnOut', 'returnIn', 'buyCheque', 'sellCheque', 'other'])) {
      if (more.length >= wanted) break;
      if (more.includes(m) || balances[m] > spare) continue;
      more.push(m);
      spare -= balances[m];
    }
    // The party whose account is asked for is sometimes allowed, or allows, a discount on the cheque.
    const discount = spare > 0 && rng.pick([true, false]) ? rupees(rng.pick([500, 1000])) : 0;

    const buyCredit = amount(rng, 40000, 100000, 5000);
    const sellCredit = amount(rng, 40000, 100000, 5000);
    const buyCheque = more.includes('buyCheque') ? amount(rng, 20000, 50000, 5000) : 0;
    const sellCheque = more.includes('sellCheque') ? amount(rng, 20000, 60000, 5000) : 0;
    const returnOut = more.includes('returnOut') ? amount(rng, 4000, 12000, 2000) : 0;
    const returnIn = more.includes('returnIn') ? amount(rng, 4000, 12000, 2000) : 0;
    const withTax = (base: Paise) => base + gstOn(g, base);
    const paid = partOf(rng, owedTo + withTax(buyCredit) - withTax(returnOut));
    const received = partOf(rng, owedBy + withTax(sellCredit) - withTax(returnIn));
    if (paid <= 0 || received <= 0) return null;
    // Salaries and drawings carry no GST, so neither raises a question about input credit.
    const other = rng.pick(['salaries', 'drawings']);
    const otherAmount = amount(rng, 6000, 15000, 1000);

    const fixedName = accountLabel(fixed.id).replace(' A/c', '');
    const given = [
      { label: 'Bank', accountId: 'bank', side: 'Dr' as Side, amount: bank },
      { label: 'Stock', accountId: 'stock', side: 'Dr' as Side, amount: stock },
      { label: `${customer} (debtor)`, accountId: debtor(customer), side: 'Dr' as Side, amount: owedBy },
      { label: fixedName, accountId: fixed.id, side: 'Dr' as Side, amount: fixedCost },
      { label: `${supplier} (creditor)`, accountId: creditor(supplier), side: 'Cr' as Side, amount: owedTo },
      ...(loan > 0 ? [{ label: 'Bank Loan', accountId: 'bankLoan', side: 'Cr' as Side, amount: loan }] : []),
    ];
    const assets = given.filter((x) => x.side === 'Dr');
    const liabilities = given.filter((x) => x.side === 'Cr');
    const openingEntry: Step = {
      key: 'opening',
      text: '',
      lines: [...given.map((x) => (x.side === 'Dr' ? dr(x.accountId, x.amount) : cr(x.accountId, x.amount))), cr('capital', capital)],
      steps: [
        `Every asset is debited: ${listed(assets.map((x) => optionName(x.accountId)))}.`,
        `Every liability is credited: ${listed(liabilities.map((x) => optionName(x.accountId)))}.`,
        addUp('Assets', assets.map((x) => x.amount)),
        addUp('Liabilities', liabilities.map((x) => x.amount)),
        `Capital A/c is credited with the balancing figure: ${F(sum(assets.map((x) => x.amount)))} - ${F(sum(liabilities.map((x) => x.amount)))} = ${F(capital)}.`,
      ],
      distract: ['purchases', 'drawings'],
      brief: 'Opening entry for the balances brought forward',
    };
    const ofSupplier = party === 'supplier';
    const singles: Step[][] = [
      ...(buyCheque ? [[cs.gstBuy(g, buyCheque, null)]] : []),
      ...(sellCheque ? [[cs.gstSell(g, sellCheque, null)]] : []),
      ...(returnOut ? [[cs.gstReturnOut(g, returnOut, supplier)]] : []),
      ...(returnIn ? [[cs.gstReturnIn(g, returnIn, customer)]] : []),
      ...(more.includes('other') ? [[other === 'salaries' ? cs.expense(SALARIES, 'bank', otherAmount) : cs.drawings(b.owner, 'bank', otherAmount)]] : []),
      [cs.paySupplier(supplier, paid, ofSupplier ? discount : 0)],
      [cs.receive(customer, received, ofSupplier ? 0 : discount)],
    ];
    // The two invoices come first, in either order, so that a return and a settlement always have something to follow.
    // The business sells out of its opening stock, so the sale comes first only when the stock is enough for it.
    const invoices = [cs.gstBuy(g, buyCredit, supplier), cs.gstSell(g, sellCredit, customer)];
    const order = arrange(rng, [openingEntry, ...(sellCredit <= stock ? rng.shuffle(invoices) : invoices)], singles);
    if (!order) return null;
    const month = onDays(rng, b, order.slice(1), true);
    const all: Dated[] = [{ ...openingEntry, date: '1 April' }, ...month];
    const openings = new Map<string, OpeningBalance>(openingEntry.lines.map((l) => [l.accountId, { date: '1 April', side: l.side, amount: l.amount }]));

    const partyId = ofSupplier ? creditor(supplier) : debtor(customer);
    const taxes = (d: 'Input' | 'Output') => (g.intra ? [`${d} CGST A/c`, `${d} SGST A/c`] : [`${d} IGST A/c`]);
    const personal = ask(b, month, partyId, {
      bringDown: true,
      opening: openings.get(partyId),
      least: 3,
      natural: ofSupplier ? 'Cr' : 'Dr',
      // Those of the other kind of party, and the tax accounts of the other kind too.
      distractors: [...partyStrangers(ofSupplier), ...taxes(ofSupplier ? 'Output' : 'Input')],
      leftOut: 'The particulars never repeat the name of the account itself: they name the other account of the entry.',
    });
    const gstId = g.intra ? `${dir}${rng.pick(['CGST', 'SGST'])}` : `${dir}IGST`;
    const input = dir === 'input';
    const twin = ledgerLabel(gstId.replace(dir, input ? 'output' : 'input'));
    const half = g.intra ? ledgerLabel(gstId.endsWith('CGST') ? gstId.replace('CGST', 'SGST') : gstId.replace('SGST', 'CGST')) : ledgerLabel(`${dir}CGST`);
    const gstAccount = ask(b, month, gstId, {
      bringDown: true,
      least: 3,
      natural: input ? 'Dr' : 'Cr',
      // The same tax of the other kind, the other tax of the same kind, and the accounts the price itself goes to.
      distractors: [twin, half, input ? 'Purchases A/c' : 'Sales A/c', input ? 'Purchases Return A/c' : 'Sales Return A/c', ledgerLabel(input ? debtor(customer) : creditor(supplier))],
      leftOut: `Left out: every ${input ? 'sale (its tax is output GST)' : 'purchase (its tax is input GST)'}, and whatever carries no GST: a cheque paid or received on account${
        more.includes('other') ? `, and the ${other}` : ''
      }.${g.intra ? ` Only half of the GST of an invoice is posted here: the other half goes to ${half}.` : ''}`,
    });
    const tb = trialBalanceOf(all);
    if (!personal || !gstAccount || tb.rows.length > 14) return null;
    // A customer's cheque is in every month, so the heading of the transactions says where it goes.
    const text = [
      `Balances of ${poss(b.owner)} ${shopName(b)} in ${city}, ${state}, on ${firstDay(b)} (capital is the balancing figure):`,
      ...given.map((x) => `${x.label}: ${F(x.amount)}`),
      `All goods carry GST at ${g.rate}%. None is set off or paid to the government in April.`,
      g.intra
        ? `Every purchase and sale is within ${state} (intra-State): CGST and SGST at ${g.rate / 2}% each.`
        : `Every purchase and sale is with a party outside ${state} (inter-State): IGST at ${g.rate}%.`,
      'Transactions in April (cheques received are banked the same day):',
      ...month.map(told),
    ].join('\n');
    return { b, text, all, month, openings, asked: [personal, gstAccount], tb };
  },
  context: (s) => s.text,
  parts: [
    { kind: 'journal_set', make: (s) => setPart(s, 'Pass the opening entry on 1 April and journalise the transactions of April.'), verify: setRead },
    { kind: 'account', make: (s) => accountPart(s, 0), verify: accountRead },
    { kind: 'account', make: (s) => accountPart(s, 1), verify: accountRead },
    { kind: 'statement', make: (s) => tbPart(s), verify: trialBalanceRead },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 4. The journal is given: posting it is the skill. Three ledger accounts and the trial balance (medium)
// ---------------------------------------------------------------------------------------------------------------

/** An entry as a line of the journal the case prints: debits first, then the credits with "To". */
export const journalLine = (t: Dated) =>
  `${t.date}: ${[
    ...t.lines.filter((l) => l.side === 'Dr').map((l) => `${ledgerLabel(l.accountId)} Dr ${F(l.amount)}`),
    ...t.lines.filter((l) => l.side === 'Cr').map((l) => `To ${ledgerLabel(l.accountId)} ${F(l.amount)}`),
  ].join('; ')}`;

const ledgerChain = caseTemplate<Chain>({
  id: 'case-cycle-chain-ledger',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Posting a journal: three accounts, trial balance',
  setup: (rng) => {
    const b = business(rng);
    const modes: Mode[] = ['cash', 'bank'];
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick(CUSTOMERS);
    const cash = amount(rng, 40000, 100000, 10000);
    const bank = amount(rng, 200000, 400000, 50000);
    const buy = amount(rng, 60000, 120000, 5000);
    const sell = amount(rng, 25000, 55000, 5000);
    const readyBuy = cs.goodsBought(rng.pick(modes), amount(rng, 15000, 35000, 5000));
    const cashSale = cs.goodsSold('cash', amount(rng, 10000, 30000, 5000));
    // Goods go back one way or the other, and each settlement is with or without a discount.
    const back = rng.pick(['out', 'in'] as const);
    const returned = amount(rng, 3000, 9000, 1000);
    const discountOf = () => (rng.pick([true, false]) ? rupees(rng.pick([500, 1000])) : 0);
    const paid = partOf(rng, buy - (back === 'out' ? returned : 0));
    const received = partOf(rng, sell - (back === 'in' ? returned : 0));
    if (paid <= 0 || received <= 0) return null;
    const e = rng.pick(EXPENSES);
    const last = rng.pick([() => cs.expense(e, rng.pick(modes), pickAmount(rng, e)), () => cs.drawings(b.owner, rng.pick(modes), amount(rng, 4000, 12000, 1000))])();
    const order = arrange(
      rng,
      [cs.capitalBoth(cash, bank)],
      [
        [cs.creditPurchase(supplier, buy), ...(back === 'out' ? [cs.returnOut(supplier, returned)] : []), cs.paySupplier(supplier, paid, discountOf())],
        [cs.creditSale(customer, sell), ...(back === 'in' ? [cs.returnIn(customer, returned)] : []), cs.receive(customer, received, discountOf())],
        [readyBuy],
        [cashSale],
        [last],
      ],
    );
    if (!order) return null;
    const all = onDays(rng, b, order);

    // Three accounts, each of three items or more besides its balance: Cash A/c or Bank A/c, the account of one
    // party, and then the other party's account or the other of Cash A/c and Bank A/c. (Purchases A/c and Sales A/c
    // have two items each in this journal, too few to be worth a quarter of the marks.)
    const money = (id: Mode, least: number) =>
      ask(b, all, id, {
        bringDown: true,
        least,
        natural: 'Dr',
        distractors: strangers(all, id),
        leftOut: id === 'cash' ? 'An entry that does not name Cash A/c is left out: a cheque goes through Bank A/c.' : 'An entry that does not name Bank A/c is left out: a dealing in cash goes through Cash A/c.',
      });
    // A party's account is asked for only when it has three items or more: the goods, the cheque, and a return or a discount.
    const personal = (ofSupplier: boolean) =>
      ask(b, all, ofSupplier ? creditor(supplier) : debtor(customer), {
        bringDown: true,
        least: 3,
        natural: ofSupplier ? 'Cr' : 'Dr',
        distractors: partyStrangers(ofSupplier),
        leftOut: 'The particulars never repeat the name of the account itself: they name the other account of the entry.',
      });
    const want = rng.pick(modes);
    const unwanted: Mode = want === 'cash' ? 'bank' : 'cash';
    const first = money(want, 4) ?? money(unwanted, 4) ?? money(want, 3) ?? money(unwanted, 3);
    if (!first) return null;
    const preferred = rng.pick([true, false]);
    const ofSupplier = personal(preferred) ? preferred : !preferred;
    const second = personal(ofSupplier);
    const third = rng
      .shuffle([() => personal(!ofSupplier), () => money(first.id === 'cash' ? 'bank' : 'cash', 3)])
      .map((make) => make())
      .find((made) => made !== null);
    const tb = trialBalanceOf(all);
    if (!second || !third || tb.rows.length > 14) return null;
    const text = [`Journal of ${poss(b.owner)} ${shopName(b)}, opened on ${firstDay(b)} (narrations are left out):`, ...all.map(journalLine)].join('\n');
    return { b, text, all, month: all, openings: new Map(), asked: [first, second, third], tb };
  },
  context: (s) => s.text,
  parts: [
    { kind: 'account', make: (s) => accountPart(s, 0), verify: accountRead },
    { kind: 'account', make: (s) => accountPart(s, 1), verify: accountRead },
    { kind: 'account', make: (s) => accountPart(s, 2), verify: accountRead },
    { kind: 'statement', make: (s) => tbPart(s), verify: trialBalanceRead },
  ],
});

const cases: CaseTemplate[] = [firstMonth, creditMonth, openingMonth, gstMonth, booksMonth, equationMonth, cashChain, creditChain, openingChain, ledgerChain];

export default cases;
