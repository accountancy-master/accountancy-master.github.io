/**
 * Case studies of the last stage: a trial balance, the closing stock and the adjustments, carried to the gross
 * profit, the net profit and the balance sheet (a sole proprietor; the long question of the examination).
 *
 * How a case is made. `buildTb` draws a trial balance that agrees (the capital is a round figure and the bank
 * balance is the balancing figure). Every adjustment is an `Adj`: its wording, its adjusting entry, and the effect
 * its author says it has on the gross profit, the net profit, the capital and the liabilities. The entries are
 * posted on top of the trial balance, and every answer is read from those books (`accountsOf`). Every typed answer
 * is then checked another way (`readCase`): the trial balance is read back from the printed case, classified by
 * the printed names, and the stated effects of the adjustments are added to it; the balance sheet total is checked
 * from the liabilities side while the answer comes from the assets side.
 *
 * Conventions, each stated in the case text where it matters: closing stock is outside the trial balance; goods
 * taken by the proprietor or lost are credited to Purchases at cost; the provision for doubtful debts is a
 * percentage of the debtors left after the further bad debts; bad debts, the new provision and the old provision
 * are asked as one net charge; depreciation is a rate on the balance shown, for the months of use of an item bought
 * during the year, and is written off the asset; a manager's commission says whether it is on the profit before or
 * after charging it. A provision that is created is debited to Profit and Loss A/c, never to Bad Debts A/c.
 *
 * Sizes. The case has to fit a phone, so no case prints more than 18 lines: a balance that no adjustment needs is
 * left out when the list would be longer. The figures have to be believable, so the capital follows from the
 * assets of the business and a year's profit is never more than two-fifths of it.
 */
import type { AccountQuestion, Difficulty } from '@/content/types';
import { creditor, debtor, resolveAccount, type AccountType } from '@/engine/accounts';
import { accountLabel, listBalances, post, trialBalance, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { PARTIES, amount, caseTemplate, crSide, drSide, formatINR, rupees as R, type CasePart } from '../authoring';
import { FA_CHAIN, type ChainBooks, type ChainOrder } from '../templates/final-accounts';
import { FAA_CHAIN, type FaaAdj, type FaaBal, type FaaBasis, type FaaBooks, type FaaTb, type FaaWant } from '../templates/final-accounts-adjustments';
import type { CaseAccountParts, CaseTemplate, FormatRowParts, JournalParts, McqParts, NumericParts } from '../types';

const TOPIC = 'final-accounts-adjustments';
const CONCEPT = 'faa-case';

/** The chart has no "sundry" accounts, so the totals of debtors and creditors are written as party accounts. */
const DEBTORS = debtor('Sundry Debtors');
const CREDITORS = creditor('Sundry Creditors');
const PROVISION = 'provisionForDoubtfulDebts';

/**
 * `formatINR`, remembered: a case writes the same few amounts many times over (in the case text, the working and the
 * reasons of every wrong figure), and every question of the case sets the scenario up again.
 */
const written = new Map<number, string>();
function inr(p: number): string {
  let text = written.get(p);
  if (text === undefined) {
    if (written.size > 20000) written.clear();
    text = formatINR(p);
    written.set(p, text);
  }
  return text;
}
/** The type of an account, remembered for the same reason. */
const types = new Map<string, AccountType>();
function typeOf(id: string): AccountType {
  let type = types.get(id);
  if (type === undefined) {
    type = resolveAccount(id).type;
    types.set(id, type);
  }
  return type;
}

const dr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: number): JournalLine => ({ accountId, side: 'Cr', amount: value });
const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
/** `rate` percent of an amount in paise; exact for the round amounts used here (answers are checked to be whole). */
const pct = (p: number, rate: number): number => (p * rate) / 100;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** A whole, positive number of rupees. A wrong figure that is not one is never shown (see `num`): nothing is rounded. */
const clean = (v: number): boolean => Number.isSafeInteger(v) && v > 0 && v % 100 === 0;

// ---------------------------------------------------------------------------------------------------------------
// People, and the heads of account a trial balance is drawn from
// ---------------------------------------------------------------------------------------------------------------

interface Who {
  name: string;
  trade: string;
}
const OWNERS: Who[] = [
  { name: 'Anjali Verma', trade: 'a saree wholesaler' },
  { name: 'Farhan Qureshi', trade: 'a dealer in paints' },
  { name: 'Gurmeet Kaur', trade: 'a sports goods trader' },
  { name: 'Harish Pillai', trade: 'a timber merchant' },
  { name: 'Jaya Kulkarni', trade: 'a dealer in kitchenware' },
  { name: 'Manoj Agarwal', trade: 'a tea merchant' },
  { name: 'Nandini Reddy', trade: 'a dealer in school uniforms' },
  { name: 'Prakash Joshi', trade: 'a cycle dealer' },
  { name: 'Rukhsana Begum', trade: 'a dealer in dry fruits' },
  { name: 'Sanjay Bhatt', trade: 'a dealer in electrical fittings' },
  { name: "Tara D'Souza", trade: 'a toy wholesaler' },
  { name: 'Vikram Chauhan', trade: 'a dealer in fertilisers' },
];
const lead = (rng: Rng, who: Who): string =>
  rng.pick([
    `${who.name}, ${who.trade}, has this trial balance on 31 March, the year end:`,
    `The books of ${who.name}, ${who.trade}, give this trial balance on 31 March, the year end:`,
    `Trial balance of ${who.name}, ${who.trade}, on 31 March, the end of the accounting year:`,
  ]);

/** An expense or an income: its account, the name used in a sentence, and the range its balance is drawn from. */
interface Head {
  id: string;
  name: string;
  /** True for a plural name ("salaries are"). */
  many: boolean;
  range: readonly [number, number, number];
}
const head = (id: string, name: string, range: readonly [number, number, number], many = false): Head => ({ id, name, many, range });
const be = (h: { many: boolean }): string => (h.many ? 'are' : 'is');
const it = (h: { many: boolean }): string => (h.many ? 'they' : 'it');
const them = (h: { many: boolean }): string => (h.many ? 'them' : 'it');
const draw = (rng: Rng, h: Head): number => amount(rng, ...h.range);

const WAGES = head('wages', 'wages', [18000, 60000, 2000], true);
const CARRIAGE_IN = head('carriageInwards', 'carriage inwards', [6000, 24000, 1000]);
const SALARIES = head('salaries', 'salaries', [36000, 96000, 6000], true);
const RENT = head('rent', 'rent', [24000, 72000, 6000]);
const INSURANCE = head('insurance', 'insurance', [14000, 30000, 2000]);
const ELECTRICITY = head('electricity', 'electricity charges', [9000, 24000, 1000], true);
const TELEPHONE = head('telephone', 'telephone charges', [9000, 18000, 1000], true);
const ADVERTISEMENT = head('advertisement', 'advertisement', [10000, 30000, 2000]);
const CARRIAGE_OUT = head('carriageOutwards', 'carriage outwards', [5000, 20000, 1000]);
const STATIONERY = head('stationery', 'stationery', [3000, 12000, 1000]);
const GENERAL = head('generalExpenses', 'general expenses', [4000, 18000, 1000], true);
const COMMISSION = head('commissionReceived', 'commission', [9000, 24000, 1000]);
const RENT_RECEIVED = head('rentReceived', 'rent', [12000, 48000, 1000]);
const DISCOUNT_RECEIVED = head('discountReceived', 'discount', [3000, 12000, 1000]);
const INTEREST = head('interestReceived', 'interest', [3000, 12000, 1000]);

/** A fixed asset: `one` is a single item of it, for an addition during the year. */
interface AssetHead {
  id: string;
  name: string;
  many: boolean;
  one: string;
}
const ASSETS: AssetHead[] = [
  { id: 'machinery', name: 'machinery', many: false, one: 'machine' },
  { id: 'furniture', name: 'furniture', many: false, one: 'showcase' },
  { id: 'vehicles', name: 'vehicles', many: true, one: 'van' },
  { id: 'computers', name: 'computers', many: true, one: 'server' },
  { id: 'officeEquipment', name: 'office equipment', many: false, one: 'photocopier' },
];

/** The accounts that make up the cost of goods sold; every other expense is an indirect one. */
const TRADING_COST = new Set(['stock', 'purchases', 'purchasesReturn', 'wages', 'carriageInwards']);
const DIRECT_IDS = ['wages', 'carriageInwards'];
const MANY = new Set(['wages', 'salaries', 'electricity', 'telephone', 'generalExpenses']);

/** The name of an account inside a sentence of the working. */
const NAMES: Record<string, string> = {
  stock: 'opening stock',
  bank: 'bank balance',
  commissionPaid: "manager's commission",
  interestPaid: 'interest on the loan',
  electricity: 'electricity charges',
  telephone: 'telephone charges',
  [DEBTORS]: 'sundry debtors',
  [CREDITORS]: 'sundry creditors',
};
const nm = (id: string): string => NAMES[id] ?? resolveAccount(id).name.toLowerCase();

// ---------------------------------------------------------------------------------------------------------------
// The final accounts of a set of books
// ---------------------------------------------------------------------------------------------------------------

interface Accounts {
  netSales: number;
  cogs: number;
  gp: number;
  /** Indirect expenses and other incomes of the Profit and Loss Account. */
  expenses: number;
  incomes: number;
  /** Negative for a net loss. */
  np: number;
  /** The outside liabilities, and the capital after the profit and the drawings. */
  liabilities: number;
  capital: number;
  /** The total of the assets side. */
  total: number;
}

/** The final accounts a ledger gives with this closing stock: every balance goes to its place by its type. */
function accountsOf(ledger: Ledger, closingStock: number): Accounts {
  let netSales = 0;
  let cost = 0;
  let expenses = 0;
  let incomes = 0;
  let assets = closingStock;
  let liabilities = 0;
  let capital = 0;
  for (const [id, net] of ledger) {
    if (TRADING_COST.has(id)) cost += net;
    else if (id === 'sales' || id === 'salesReturn') netSales -= net;
    else {
      const type = typeOf(id);
      if (type === 'expense') expenses += net;
      else if (type === 'income') incomes -= net;
      else if (type === 'asset') assets += net;
      else if (type === 'liability') liabilities -= net;
      else capital -= net;
    }
  }
  const cogs = cost - closingStock;
  const gp = netSales - cogs;
  const np = gp - expenses + incomes;
  return { netSales, cogs, gp, expenses, incomes, np, liabilities, capital: capital + np, total: assets };
}

// ---------------------------------------------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------------------------------------------

interface Err {
  value: number;
  why: string;
}
/** A named mistake and the amount by which it moves the right figure. */
interface Slip {
  why: string;
  by: number;
}
/** A figure a question can ask for, with its mistakes and its working. */
interface Asked {
  prompt: string;
  answer: number;
  errors: Err[];
  work: string[];
}

/** The right option of a choice question, the wrong ones with the mistake behind each, and the explanation. */
interface Choice {
  right: string;
  wrong: [string, string][];
  because: string;
}
type Basis = 'before' | 'after';
/** The commission at `rate` percent of a net profit `p` reckoned before charging it, on either basis. */
const commissionOn = (p: number, rate: number, basis: Basis): number => (basis === 'after' ? (p * rate) / (100 + rate) : (p * rate) / 100);

interface Adj {
  key: string;
  /** The adjustment as the case prints it. */
  text: string;
  /** True when the case prints it on the line of the adjustment before it, under the same number. */
  joined?: boolean;
  /** The adjusting entry, as it is posted to the books. */
  lines: JournalLine[];
  /** What the adjustment does to the gross profit, the net profit, the capital (apart from the profit) and the liabilities. */
  gp: number;
  np: number;
  cap: number;
  liab: number;
  /** "the outstanding salaries": the adjustment inside "Left out adjustment (n), ...". */
  short: string;
  /** What leaving the adjustment out does to the net profit, when that is not simply the reverse of `np`. */
  omitBy?: number;
  /** The mistake of applying it the wrong way round (the figure moves by twice the effect). */
  flip?: string;
  gpSlips: Slip[];
  npSlips: Slip[];
  /** Mistakes in the balance sheet total and in the closing capital. */
  bsSlips: Slip[];
  capSlips: Slip[];
  /** Working lines for the Trading Account and for the Profit and Loss Account. */
  workT: string[];
  workP: string[];
  /** Goods credited to Purchases: their cost and what happened to them. */
  goods?: { cost: number; note: string };
  /** What is added to the drawings, named for the working ("interest on drawings"). */
  drawn?: string;
  /** The explanation of the entry, when a question may ask for it (`lines` when the entry asked is not the one posted). */
  entry?: { why: string[]; distractors: string[]; lines?: JournalLine[] };
  /** Where its two effects appear, and how it appears in the balance sheet, for a choice question. */
  two?: Choice;
  place?: Choice;
  /** A manager's commission: its rate and basis, and the net profit before charging it. */
  commission?: { rate: number; basis: Basis; p: number };
  /** The adjusted expense or income, and the adjusted asset. */
  charge?: Asked & { id: string };
  shown?: Asked & { hand(h: Hand): number };
}

type AdjInit = Pick<Adj, 'key' | 'text' | 'lines' | 'np' | 'short'> & Partial<Adj>;
const adj = (a: AdjInit): Adj => ({ gp: 0, cap: 0, liab: 0, gpSlips: [], npSlips: [], bsSlips: [], capSlips: [], workT: [], workP: [], ...a });

/** An expense of the year that is still unpaid on 31 March. `paid` is its trial balance figure. */
function outstanding(h: Head, x: number, paid: number, when: string): Adj {
  const direct = TRADING_COST.has(h.id);
  const acct = direct ? 'Trading' : 'Profit and Loss';
  const work = `${cap(h.name)} = ${inr(paid)} + ${inr(x)} outstanding = ${inr(paid + x)}.`;
  return adj({
    key: 'outstanding',
    text: `${cap(h.name)} of ${inr(x)} ${when} ${be(h)} still unpaid.`,
    lines: [dr(h.id, x), cr('outstandingExpenses', x)],
    gp: direct ? -x : 0,
    np: -x,
    liab: x,
    short: `the outstanding ${h.name}`,
    flip: `Deducted the outstanding ${h.name} from the expense instead of adding ${them(h)}.`,
    bsSlips: [{ why: `Did not show the outstanding ${h.name} as a liability.`, by: -x }],
    workT: direct ? [work] : [],
    workP: direct ? [] : [work],
    entry: {
      why: [
        `The unpaid ${h.name} ${be(h)} an expense of this year: ${accountLabel(h.id)} is debited.`,
        'The amount is owed on 31 March, a liability: Outstanding Expenses A/c is credited.',
      ],
      distractors: ['prepaidExpenses', 'accruedIncome'],
    },
    two: {
      right: `Added to ${h.name} in the ${acct} Account, and shown as a current liability`,
      wrong: [
        [`Deducted from ${h.name} in the ${acct} Account, and shown as a current asset`, 'Treated the unpaid amount like an expense paid in advance.'],
        [`Added to ${h.name} in the ${acct} Account, and shown as a current asset`, 'Took an amount the business owes as something it owns.'],
        [`Deducted from ${h.name} in the ${acct} Account, and shown as a current liability`, 'Deducted the unpaid amount from the expense, though it is a further expense of the year.'],
        ['Not charged until it is paid, and not shown in the balance sheet', 'Waited for the payment: the expense belongs to this year and the amount is owed on 31 March.'],
      ],
      because: `The unpaid ${h.name} ${be(h)} an expense of this year, so ${it(h)} ${be(h)} added to the ${h.name} already paid. The amount is owed on 31 March, so it is a current liability.`,
    },
    place: {
      right: `Under current liabilities: outstanding ${h.name} ${inr(x)}`,
      wrong: [
        [`Under current assets: prepaid ${h.name} ${inr(x)}`, 'Treated an amount still owed as an amount paid in advance.'],
        [`Under current liabilities: outstanding ${h.name} ${inr(paid + x)}`, 'Showed the whole expense of the year as owing; only the unpaid part is a liability.'],
        [`Deducted from the capital: ${inr(x)}`, 'Treated the unpaid expense as drawings of the proprietor.'],
        ['It does not appear: it is only added to the expense', 'Forgot the second effect: the unpaid amount is owed on 31 March.'],
      ],
      because: `The ${inr(x)} is owed on 31 March, so it is a current liability. The same amount is added to ${h.name} in the ${acct} Account.`,
    },
    charge: {
      id: h.id,
      prompt: `What amount of ${h.name} is charged in the ${acct} Account for the year?`,
      answer: paid + x,
      errors: [
        { value: paid - x, why: `Deducted the outstanding ${h.name} instead of adding ${them(h)}.` },
        { value: paid, why: 'Gave the trial balance figure and left out the amount still unpaid.' },
        { value: x, why: 'Gave only the unpaid amount, not the expense of the whole year.' },
      ],
      work: [`The trial balance shows what was paid, ${inr(paid)}. The unpaid ${inr(x)} also belongs to this year.`, work],
    },
  });
}

/** Interest on a loan taken during the year, none of it paid yet. */
function loanInterest(loan: number, rate: number, date: string, months: number): Adj {
  const i = (pct(loan, rate) * months) / 12;
  const full = pct(loan, rate);
  const before = (pct(loan, rate) * (12 - months)) / 12;
  return adj({
    key: 'loanInterest',
    text: `The bank loan was taken on ${date} at ${rate}% p.a.; no interest on it has been paid yet.`,
    lines: [dr('interestPaid', i), cr('outstandingExpenses', i)],
    np: -i,
    liab: i,
    short: 'the interest outstanding on the bank loan',
    npSlips: [
      { why: `Charged a full year of interest on the loan, which was taken only on ${date}.`, by: i - full },
      { why: `Counted the ${12 - months} months before the loan was taken instead of the ${months} months after.`, by: i - before },
    ],
    bsSlips: [{ why: 'Did not show the interest outstanding on the loan as a liability.', by: -i }],
    workP: [`Interest on the loan, ${date} to 31 March (${months} months) = ${inr(loan)} × ${rate}% × ${months}/12 = ${inr(i)}.`],
    entry: {
      why: [
        `Interest for the ${months} months the loan was used = ${inr(loan)} × ${rate}% × ${months}/12 = ${inr(i)}.`,
        'It is an expense of this year: Interest Paid A/c is debited.',
        'It is unpaid on 31 March, a liability: Outstanding Expenses A/c is credited.',
      ],
      distractors: ['bankLoan', 'interestReceived', 'prepaidExpenses'],
    },
    two: {
      right: 'Debited to the Profit and Loss Account as interest, and shown as a current liability',
      wrong: [
        ['Debited to the Profit and Loss Account as interest, and shown as a current asset', 'Took interest the business owes as interest due to it.'],
        ['Credited to the Profit and Loss Account as interest, and shown as a current liability', 'Took interest payable on a loan as an income.'],
        ['Not charged until it is paid, and not shown in the balance sheet', 'Waited for the payment: the interest belongs to the months the loan was used.'],
        ['Debited to the Trading Account, and shown as a current liability', 'Treated interest on a loan as a cost of the goods; it is a financial expense of the Profit and Loss Account.'],
      ],
      because: 'The interest for the months the loan was used is an expense of this year. It is unpaid on 31 March, so it is a current liability.',
    },
    place: {
      right: `Under current liabilities: interest outstanding ${inr(i)}`,
      wrong: [
        [`Under current liabilities: interest outstanding ${inr(full)}`, `Took a full year of interest; the loan was taken only on ${date}.`],
        [`Under current assets: accrued interest ${inr(i)}`, 'Took interest the business owes as interest due to it.'],
        [`Deducted from the bank loan: ${inr(i)}`, 'Reduced the loan; unpaid interest adds to what the business owes.'],
        ['It does not appear: it is only charged as an expense', 'Forgot the second effect: the unpaid interest is owed on 31 March.'],
      ],
      because: `Interest for ${months} months, ${inr(i)}, is unpaid on 31 March, so it is a current liability. The same amount is charged in the Profit and Loss Account.`,
    },
  });
}

/** Part of an expense paid in the year that belongs to the next year. `premium` and `used` describe a 12-month payment. */
function prepaid(h: Head, x: number, paid: number, text: string, policy?: { premium: number; used: number }): Adj {
  const work = `${cap(h.name)} = ${inr(paid)} − ${inr(x)} prepaid = ${inr(paid - x)}.`;
  const usedPart = policy ? (policy.premium * policy.used) / 12 : 0;
  const steps = policy
    ? [`The premium covers 12 months, ${policy.used} before 31 March and ${12 - policy.used} after it.`, `Prepaid ${h.name} = ${inr(policy.premium)} × ${12 - policy.used}/12 = ${inr(x)}.`, work]
    : [work];
  const slips: Slip[] = policy
    ? [
        { why: `Took the ${policy.used} months already used as the prepaid part instead of the ${12 - policy.used} months still to come.`, by: usedPart - x },
        { why: 'Treated the whole premium as prepaid, though part of the cover was used this year.', by: policy.premium - x },
      ]
    : [];
  return adj({
    key: 'prepaid',
    text,
    lines: [dr('prepaidExpenses', x), cr(h.id, x)],
    np: x,
    short: `the prepaid ${h.name}`,
    flip: `Added the prepaid ${h.name} to the expense instead of deducting it.`,
    npSlips: slips,
    bsSlips: [{ why: `Did not show the prepaid ${h.name} among the assets.`, by: -x }, ...slips],
    workP: steps,
    entry: {
      why: [
        ...(policy ? [`Prepaid part = ${inr(policy.premium)} × ${12 - policy.used}/12 = ${inr(x)}.`] : []),
        'The part that belongs to next year is a benefit still to come, an asset: Prepaid Expenses A/c is debited.',
        `This year's expense is reduced by it: ${accountLabel(h.id)} is credited.`,
      ],
      distractors: ['outstandingExpenses', 'accruedIncome'],
    },
    two: {
      right: `Deducted from ${h.name} in the Profit and Loss Account, and shown as a current asset`,
      wrong: [
        [`Added to ${h.name} in the Profit and Loss Account, and shown as a current liability`, 'Treated the amount paid in advance like an unpaid expense.'],
        [`Deducted from ${h.name} in the Profit and Loss Account, and shown as a current liability`, 'Took money paid in advance as a debt of the business.'],
        [`Added to ${h.name} in the Profit and Loss Account, and shown as a current asset`, 'Added the prepaid part to the expense instead of taking it out.'],
        ['Charged in full this year, and not shown in the balance sheet', "Charged the whole payment as this year's expense, ignoring the part that belongs to next year."],
      ],
      because: `The part of the ${h.name} that belongs to next year is not an expense of this year, so it is deducted. It is a benefit still to come, so it is a current asset.`,
    },
    place: {
      right: `Under current assets: prepaid ${h.name} ${inr(x)}`,
      wrong: [
        [`Under current liabilities: outstanding ${h.name} ${inr(x)}`, 'Treated an amount paid in advance as an amount still owed.'],
        [`Under current assets: prepaid ${h.name} ${inr(paid - x)}`, "Showed this year's expense as the asset; only the part paid for next year is prepaid."],
        ...(policy && usedPart !== x ? [[`Under current assets: prepaid ${h.name} ${inr(usedPart)}`, `Took the ${policy.used} months already used instead of the ${12 - policy.used} months still to come.`] as [string, string]] : []),
        [`Added to the capital: ${inr(x)}`, 'Treated the payment in advance as capital brought in.'],
        ['It does not appear: it is only deducted from the expense', 'Forgot the second effect: the benefit still to come is an asset.'],
      ],
      because: `The ${inr(x)} pays for next year, a benefit still to come, so it is a current asset. The same amount is deducted from ${h.name} in the Profit and Loss Account.`,
    },
    charge: {
      id: h.id,
      prompt: `What amount of ${h.name} is charged in the Profit and Loss Account for the year?`,
      answer: paid - x,
      errors: [
        { value: paid + x, why: `Added the prepaid ${h.name} instead of deducting it.` },
        { value: paid, why: 'Gave the trial balance figure and did not take out the part paid for next year.' },
        ...(policy
          ? [
              { value: paid - usedPart, why: `Took the ${policy.used} months already used as the prepaid part instead of the ${12 - policy.used} months still to come.` },
              { value: paid - policy.premium, why: 'Treated the whole premium as prepaid, though part of the cover was used this year.' },
            ]
          : []),
        { value: x, why: 'Gave the prepaid amount, which is an asset, instead of the expense of the year.' },
      ],
      work: steps,
    },
  });
}

/** Depreciation written off the asset. `add` is an item bought during the year and included in the balance. */
function depreciation(a: AssetHead, rate: number, bal: number, add?: { cost: number; date: string; months: number }): Adj {
  const oldPart = pct(bal - (add?.cost ?? 0), rate);
  const newPart = add ? (pct(add.cost, rate) * add.months) / 12 : 0;
  const wrongMonths = add ? (pct(add.cost, rate) * (12 - add.months)) / 12 : 0;
  const d = oldPart + newPart;
  const full = pct(bal, rate);
  const label = accountLabel(a.id);
  const work = add
    ? [
        `Depreciation on the ${a.name} held all year = (${inr(bal)} − ${inr(add.cost)}) × ${rate}% = ${inr(oldPart)}.`,
        `On the ${a.one}, ${add.date} to 31 March (${add.months} months) = ${inr(add.cost)} × ${rate}% × ${add.months}/12 = ${inr(newPart)}.`,
        `Depreciation for the year = ${inr(oldPart)} + ${inr(newPart)} = ${inr(d)}.`,
      ]
    : [`Depreciation = ${inr(bal)} × ${rate}% = ${inr(d)}.`];
  const slips: Slip[] = add
    ? [
        { why: `Charged a full year of depreciation on the ${a.one} bought on ${add.date}; it was used for only ${add.months} months.`, by: d - full },
        { why: `Left out the depreciation on the ${a.one} bought on ${add.date}.`, by: newPart },
        ...(add.months === 6 ? [] : [{ why: `Counted the ${12 - add.months} months before the ${a.one} was bought instead of the ${add.months} months of use.`, by: newPart - wrongMonths }]),
      ]
    : [];
  return adj({
    key: 'depreciation',
    text: add
      ? `${cap(a.name)} ${a.many ? 'include' : 'includes'} a ${a.one} bought for ${inr(add.cost)} on ${add.date}. Depreciate at ${rate}% p.a. on the balance shown (the ${a.one} from that date only); write it off the asset.`
      : `Depreciate ${a.name} at ${rate}% p.a. on the balance shown, for the full year; write it off the asset.`,
    lines: [dr('depreciation', d), cr(a.id, d)],
    np: -d,
    short: `the depreciation on ${a.name}`,
    npSlips: slips,
    bsSlips: [{ why: `Showed ${a.name} at the trial balance figure, without deducting the depreciation.`, by: d }, ...slips],
    workP: work,
    entry: {
      why: [...work, 'Depreciation is an expense of the year: Depreciation A/c is debited.', `The depreciation is written off the asset: ${label} is credited.`],
      distractors: ['provisionForDepreciation', 'repairs'],
    },
    two: {
      right: `Debited to the Profit and Loss Account, and deducted from ${a.name} in the balance sheet`,
      wrong: [
        [`Debited to the Profit and Loss Account, and shown as a current liability`, 'Treated depreciation as an amount the business owes.'],
        [`Debited to the Profit and Loss Account, and ${a.name} left at the trial balance figure`, 'Forgot the second effect: the asset is worth that much less.'],
        [`Credited to the Profit and Loss Account, and deducted from ${a.name} in the balance sheet`, 'Took the fall in value of the asset as an income.'],
        [`Debited to the Profit and Loss Account, and added to ${a.name} in the balance sheet`, 'Added the depreciation to the asset instead of deducting it.'],
      ],
      because: `The fall in value is an expense of the year, and ${a.name} ${a.many ? 'are' : 'is'} shown at that much less in the balance sheet.`,
    },
    shown: {
      prompt: `At what amount ${a.many ? 'are' : 'is'} ${a.name} shown in the balance sheet on 31 March?`,
      answer: bal - d,
      errors: [
        // A slip moves the profit by `by`; it moves what is left of the asset the same way.
        ...slips.map((sl) => ({ value: bal - d + sl.by, why: sl.why })),
        { value: bal, why: 'Gave the trial balance figure, without deducting the depreciation.' },
        { value: d, why: 'Gave the depreciation for the year, not the value left after it.' },
        { value: bal + d, why: 'Added the depreciation to the asset instead of deducting it.' },
      ],
      work: [...work, `${cap(a.name)} in the balance sheet = ${inr(bal)} − ${inr(d)} = ${inr(bal - d)}.`],
      // The other way: what is left of each part after its depreciation.
      hand: (h) => {
        const b = h.get(label);
        return add ? ((b - add.cost) * (100 - rate)) / 100 + add.cost - (add.cost * rate * add.months) / 1200 : (b * (100 - rate)) / 100;
      },
    },
  });
}

/** Further bad debts. When a provision at `rate` percent follows, leaving them out also raises that provision. */
function badDebts(x: number, text: string, rate: number, tbBad: number, alone: boolean): Adj {
  return adj({
    key: 'badDebts',
    text,
    lines: [dr('badDebts', x), cr(DEBTORS, x)],
    np: -x,
    short: 'the further bad debts',
    omitBy: x - pct(x, rate),
    bsSlips: [{ why: 'Did not deduct the further bad debts from the debtors.', by: x }],
    workP: alone ? [tbBad ? `Bad debts = ${inr(tbBad)} + ${inr(x)} = ${inr(tbBad + x)}.` : `Bad debts = ${inr(x)}.`] : [],
    entry: {
      why: ['The amount will never be collected, a loss: Bad Debts A/c is debited.', 'The debtors fall by the same amount: Sundry Debtors is credited.'],
      distractors: [PROVISION, 'sales', 'profitAndLoss'],
    },
    two: {
      right: 'Debited to the Profit and Loss Account, and deducted from sundry debtors',
      wrong: [
        ['Debited to the Profit and Loss Account, and added to sundry debtors', 'Added the bad debts to the debtors instead of deducting them.'],
        ['Debited to the Profit and Loss Account, and shown as a current liability', 'Treated a debt that cannot be collected as an amount the business owes.'],
        ['Deducted from sundry debtors only; the profit is not affected', 'Reduced the debtors but forgot that the loss is charged against the profit.'],
        ['Credited to the Profit and Loss Account, and deducted from sundry debtors', 'Took the writing off of a debt as a gain.'],
      ],
      because: 'The amount will never be collected: it is a loss of the year, and those debtors are no longer an asset.',
    },
  });
}

/**
 * The provision for doubtful debts at `rate` percent of `good`, the debtors left after the further bad debts.
 * `joined` prints it on the line of the bad debts written off just before it.
 */
function provision(rate: number, good: number, further: number, tbBad: number, old: number, joined: boolean): Adj {
  const nw = pct(good, rate);
  const diff = nw - old;
  const bad = tbBad + further;
  const verb = old ? 'maintain the' : 'create a';
  return adj({
    key: 'provision',
    text: joined
      ? `Then ${verb} provision for doubtful debts at ${rate}% of the remaining debtors.`
      : `${cap(verb)} provision for doubtful debts at ${rate}% of the debtors left after the further bad debts.`,
    joined,
    // Only for the arithmetic of the case: the change in the provision is kept with the bad debts, because the two
    // are asked as one net charge. It is not the entry a student passes. That entry debits Profit and Loss A/c
    // (see `entry` below), and it is asked only when a provision is created, where no textbook differs.
    lines: diff > 0 ? [dr('badDebts', diff), cr(PROVISION, diff)] : [dr(PROVISION, -diff), cr('badDebts', -diff)],
    np: -diff,
    short: 'the provision for doubtful debts',
    ...(old
      ? {}
      : {
          entry: {
            lines: [dr('profitAndLoss', nw), cr(PROVISION, nw)],
            why: [
              `Debtors after the further bad debts = ${inr(good + further)} − ${inr(further)} = ${inr(good)}; provision = ${inr(good)} × ${rate}% = ${inr(nw)}.`,
              'The provision is a charge against the profit of the year: Profit and Loss A/c is debited (not Bad Debts A/c, for no debt has yet been lost).',
              'It is kept in Provision for Doubtful Debts A/c, which is credited and is deducted from the debtors in the balance sheet.',
            ],
            distractors: ['badDebts', DEBTORS, 'outstandingExpenses'],
          },
        }),
    npSlips: [
      ...(old
        ? [
            { why: 'Charged the whole new provision and ignored the provision already in the trial balance.', by: -old },
            { why: 'Added the old provision to the charge instead of deducting it.', by: -2 * old },
          ]
        : []),
      { why: 'Worked out the provision on the debtors before writing off the further bad debts.', by: -pct(further, rate) },
    ],
    bsSlips: [
      { why: 'Did not deduct the provision for doubtful debts from the debtors.', by: nw },
      ...(old ? [{ why: 'Deducted the old provision from the debtors as well as the new one.', by: -old }] : []),
      { why: 'Worked out the provision on the debtors before writing off the further bad debts.', by: -pct(further, rate) },
    ],
    workP: [
      `Debtors after the further bad debts = ${inr(good + further)} − ${inr(further)} = ${inr(good)}.`,
      `New provision = ${inr(good)} × ${rate}% = ${inr(nw)}.`,
      old
        ? `Net charge = bad debts ${inr(bad)} + new provision ${inr(nw)} − old provision ${inr(old)} = ${inr(bad + diff)}.`
        : `Charge = bad debts ${inr(bad)} + provision ${inr(nw)} = ${inr(bad + nw)}.`,
    ],
    // Asked only of a provision that is created: one that replaces an old provision may be a charge or a release.
    ...(old
      ? {}
      : {
          two: {
            right: 'Debited to the Profit and Loss Account, and deducted from sundry debtors',
            wrong: [
              ['Debited to the Profit and Loss Account, and shown as a current liability', 'Showed the provision as an amount owed instead of deducting it from the debtors.'],
              ['Debited to the Profit and Loss Account, and added to sundry debtors', 'Added the provision to the debtors instead of deducting it.'],
              ['Credited to the Profit and Loss Account, and deducted from sundry debtors', 'Took the provision as a gain, though it is a charge against the profit.'],
              ['Deducted from sundry debtors only; the profit is not affected', 'Reduced the debtors but did not charge the provision against the profit.'],
            ],
            because: 'The loss expected on the debtors is charged in the year of the sale, and the debtors are shown at the amount expected to be collected.',
          },
        }),
  });
}

/** Interest on capital. `add` is capital brought in during the year and included in the trial balance figure. */
function interestOnCapital(rate: number, capital: number, add?: { amount: number; date: string; months: number }): Adj {
  const onOld = pct(capital - (add?.amount ?? 0), rate);
  const onNew = add ? (pct(add.amount, rate) * add.months) / 12 : 0;
  const i = onOld + onNew;
  const work = add
    ? [
        `Interest on the capital held all year = (${inr(capital)} − ${inr(add.amount)}) × ${rate}% = ${inr(onOld)}.`,
        `On the ${inr(add.amount)} brought in, ${add.date} to 31 March (${add.months} months) = ${inr(add.amount)} × ${rate}% × ${add.months}/12 = ${inr(onNew)}.`,
        `Interest on capital = ${inr(onOld)} + ${inr(onNew)} = ${inr(i)}.`,
      ]
    : [`Interest on capital = ${inr(capital)} × ${rate}% = ${inr(i)}.`];
  return adj({
    key: 'ioc',
    text: add
      ? `Capital includes ${inr(add.amount)} brought in on ${add.date}. Allow interest on capital at ${rate}% p.a., on that amount from ${add.date}.`
      : `Allow interest on capital at ${rate}% p.a.; no capital was brought in during the year.`,
    lines: [dr('interestOnCapital', i), cr('capital', i)],
    np: -i,
    cap: i,
    short: 'the interest on capital',
    flip: 'Added the interest on capital to the profit; it is an expense of the business.',
    npSlips: add ? [{ why: `Allowed a full year of interest on the capital brought in on ${add.date}.`, by: i - pct(capital, rate) }] : [],
    capSlips: [{ why: 'Charged the interest on capital against the profit but did not add it to the capital.', by: -i }],
    workP: work,
    entry: {
      why: [...work, 'Interest on capital is an expense of the business: Interest on Capital A/c is debited.', 'It is due to the proprietor and is added to the capital: Capital A/c is credited.'],
      distractors: ['drawings', 'interestOnDrawings', 'interestPaid'],
    },
    two: {
      right: 'Debited to the Profit and Loss Account, and added to the capital',
      wrong: [
        ['Credited to the Profit and Loss Account, and added to the capital', 'Treated interest on capital as an income of the business.'],
        ['Debited to the Profit and Loss Account, and deducted from the capital', 'Mixed it up with drawings, which reduce the capital.'],
        ['Debited to the Profit and Loss Account, and shown as a current liability', 'Showed the interest as owed to an outsider instead of adding it to the capital.'],
        ['Credited to the Profit and Loss Account, and added to the drawings', 'Took the interest as something the proprietor owes the business; it is allowed to the proprietor, an expense added to the capital.'],
      ],
      because: 'The business treats the interest as the cost of using the money of the proprietor, an expense; it is owed to the proprietor, so it is added to the capital.',
    },
  });
}

/** Interest on drawings of `i`, worked out as `work` says. */
function interestOnDrawings(i: number, text: string, work: string[], npSlips: Slip[] = []): Adj {
  return adj({
    key: 'iod',
    text,
    lines: [dr('drawings', i), cr('interestOnDrawings', i)],
    np: i,
    cap: -i,
    short: 'the interest on drawings',
    flip: 'Deducted the interest on drawings as an expense; it is an income of the business.',
    npSlips,
    capSlips: [{ why: 'Credited the interest on drawings to the profit but did not add it to the drawings.', by: i }],
    workP: work,
    drawn: 'interest on drawings',
    entry: {
      why: [...work, 'The proprietor owes this interest, and it is added to the drawings: Drawings A/c is debited.', 'It is an income of the business: Interest on Drawings A/c is credited.'],
      distractors: ['interestOnCapital', 'capital', 'interestReceived'],
    },
    two: {
      right: 'Credited to the Profit and Loss Account, and added to the drawings',
      wrong: [
        ['Debited to the Profit and Loss Account, and added to the capital', 'Gave the treatment of interest on capital.'],
        ['Credited to the Profit and Loss Account, and added to the capital', 'Took interest charged to the proprietor as something that increases the capital.'],
        ['Debited to the Profit and Loss Account, and added to the drawings', 'Treated interest on drawings as an expense of the business; it is an income.'],
        ['Credited to the Profit and Loss Account, and shown as a current asset', 'Showed the interest as due from an outsider instead of adding it to the drawings.'],
      ],
      because: 'The business earns this interest from the proprietor, an income; it is charged to the proprietor with the drawings, which reduce the capital.',
    },
  });
}

/** Income earned in the year and not yet received. `recd` is the trial balance figure; `full` names the account. */
function accrued(h: Head, x: number, recd: number, text: string, how?: string): Adj {
  const full = `${h.name} received`;
  const work = [...(how ? [how] : []), `${cap(full)} = ${inr(recd)} + ${inr(x)} accrued = ${inr(recd + x)}.`];
  return adj({
    key: 'accrued',
    text,
    lines: [dr('accruedIncome', x), cr(h.id, x)],
    np: x,
    short: `the accrued ${h.name}`,
    flip: `Deducted the accrued ${h.name} instead of adding it.`,
    bsSlips: [{ why: `Did not show the accrued ${h.name} among the assets.`, by: -x }],
    workP: work,
    entry: {
      why: [...(how ? [how] : []), 'The amount is due to the business on 31 March, an asset: Accrued Income A/c is debited.', `It was earned this year: ${accountLabel(h.id)} is credited.`],
      distractors: ['incomeReceivedInAdvance', 'outstandingExpenses'],
    },
    two: {
      right: `Added to ${full} in the Profit and Loss Account, and shown as a current asset`,
      wrong: [
        [`Deducted from ${full} in the Profit and Loss Account, and shown as a current liability`, 'Treated income still to be received like income received in advance.'],
        [`Added to ${full} in the Profit and Loss Account, and shown as a current liability`, 'Took money the business is still to receive as money it owes.'],
        [`Deducted from ${full} in the Profit and Loss Account, and shown as a current asset`, 'Deducted the income earned instead of adding it.'],
        ['Not taken as income until it is received, and not shown in the balance sheet', 'Waited for the cash: the income was earned this year and is due on 31 March.'],
      ],
      because: `The ${h.name} was earned this year although the cash has not come in, so it is added to the income; the amount is due to the business, so it is a current asset.`,
    },
    charge: {
      id: h.id,
      prompt: `What amount of ${h.name} is credited to the Profit and Loss Account as income for the year?`,
      answer: recd + x,
      errors: [
        { value: recd - x, why: `Deducted the accrued ${h.name} instead of adding it.` },
        { value: recd, why: 'Gave the trial balance figure and left out the income earned but not yet received.' },
        { value: x, why: 'Gave only the accrued amount, not the income of the whole year.' },
      ],
      work,
    },
  });
}

/** Income received in the year that belongs to the next year. */
function advance(h: Head, x: number, recd: number, text: string): Adj {
  const full = `${h.name} received`;
  const work = [`${cap(full)} = ${inr(recd)} − ${inr(x)} received in advance = ${inr(recd - x)}.`];
  return adj({
    key: 'advance',
    text,
    lines: [dr(h.id, x), cr('incomeReceivedInAdvance', x)],
    np: -x,
    liab: x,
    short: `the ${h.name} received in advance`,
    flip: `Added the ${h.name} received in advance instead of deducting it.`,
    bsSlips: [{ why: `Did not show the ${h.name} received in advance as a liability.`, by: -x }],
    workP: work,
    entry: {
      why: [`The part that belongs to next year is not this year's income: ${accountLabel(h.id)} is debited.`, 'Until it is earned the business owes it, a liability: Income Received in Advance A/c is credited.'],
      distractors: ['accruedIncome', 'prepaidExpenses'],
    },
    two: {
      right: `Deducted from ${full} in the Profit and Loss Account, and shown as a current liability`,
      wrong: [
        [`Added to ${full} in the Profit and Loss Account, and shown as a current asset`, 'Treated income received in advance like income still to be received.'],
        [`Deducted from ${full} in the Profit and Loss Account, and shown as a current asset`, 'Took money received for next year as something the business owns outright; it still owes the service.'],
        [`Added to ${full} in the Profit and Loss Account, and shown as a current liability`, "Added the advance to this year's income instead of taking it out."],
        ['Kept as income of this year, and not shown in the balance sheet', "Counted all the cash received as this year's income."],
      ],
      because: `The part of the ${h.name} that belongs to next year is not income of this year, so it is deducted; until it is earned the business owes it, so it is a current liability.`,
    },
    charge: {
      id: h.id,
      prompt: `What amount of ${h.name} is credited to the Profit and Loss Account as income for the year?`,
      answer: recd - x,
      errors: [
        { value: recd + x, why: `Added the ${h.name} received in advance instead of deducting it.` },
        { value: recd, why: 'Gave the trial balance figure and did not take out the part received for next year.' },
        { value: x, why: 'Gave only the amount received in advance, which is a liability.' },
      ],
      work,
    },
  });
}

/** No entry has been made for the goods, and they leave the books through Purchases A/c (not Sales or Trading A/c). */
const GOODS_NOTE = 'No entry was made; credit Purchases A/c.';

/** Goods the proprietor took for personal use, credited to Purchases at cost. `price` is what they sell for. */
function goodsDrawn(g: number, price: number): Adj {
  return adj({
    key: 'drawn',
    text: `The proprietor took goods costing ${inr(g)} (selling price ${inr(price)}) for personal use. ${GOODS_NOTE}`,
    lines: [dr('drawings', g), cr('purchases', g)],
    gp: g,
    np: g,
    cap: -g,
    short: 'the goods taken by the proprietor',
    flip: 'Added the goods taken by the proprietor to purchases instead of deducting them.',
    gpSlips: [{ why: 'Took the goods out at their selling price; goods taken by the proprietor leave Purchases at cost.', by: price - g }],
    npSlips: [{ why: 'Took the goods out at their selling price; goods taken by the proprietor leave Purchases at cost.', by: price - g }],
    capSlips: [{ why: 'Reduced purchases but did not add the goods taken to the drawings.', by: g }],
    goods: { cost: g, note: 'goods taken by the proprietor' },
    drawn: 'goods taken',
    entry: {
      why: [`Goods taken for personal use are drawings: Drawings A/c is debited with their cost, ${inr(g)}.`, 'They leave the goods bought for sale: Purchases A/c is credited at cost, not at the selling price.'],
      distractors: ['sales', 'stock', 'capital'],
    },
    two: {
      right: 'Deducted from purchases in the Trading Account, and added to the drawings',
      wrong: [
        ['Debited to the Profit and Loss Account as an expense, and added to the drawings', 'Treated goods taken by the proprietor as an expense of the business.'],
        ['Added to sales in the Trading Account, and added to the drawings', 'Treated the goods as sold; nothing was sold, so they leave Purchases at cost.'],
        ['Deducted from purchases in the Trading Account, and shown as a current asset', 'Showed goods that have left the business as an asset.'],
        ['Not recorded, because no cash changed hands', 'Thought that a transaction without cash needs no entry.'],
      ],
      because: 'The goods were not sold, so they come out of purchases at cost; they went to the proprietor, so they are added to the drawings.',
    },
  });
}

/** Goods lost by fire, credited to Purchases at cost; `claim` is what the insurer has admitted (it may be nothing). */
function fireLoss(g: number, claim: number, cover: string): Adj {
  const loss = g - claim;
  return adj({
    key: 'fire',
    text: `Goods costing ${inr(g)} were lost by fire; ${cover} ${GOODS_NOTE}`,
    lines: [...(claim ? [dr('insuranceClaimReceivable', claim)] : []), dr('lossByFire', loss), cr('purchases', g)],
    gp: g,
    np: claim,
    short: 'the goods lost by fire',
    npSlips: [
      { why: 'Charged the loss by fire but left the goods in purchases, so their cost was counted twice.', by: -g },
      ...(claim ? [{ why: 'Charged the whole cost of the goods as the loss and ignored the insurance claim.', by: -claim }] : []),
      { why: 'Took the goods out of purchases but did not charge the loss by fire in the Profit and Loss Account.', by: loss },
    ],
    bsSlips: claim ? [{ why: 'Did not show the insurance claim among the assets.', by: -claim }] : [],
    workP: [claim ? `Loss by fire = cost ${inr(g)} − claim admitted ${inr(claim)} = ${inr(loss)}.` : `Loss by fire = the whole cost, ${inr(g)}: nothing can be claimed.`],
    goods: { cost: g, note: 'goods lost by fire' },
    entry: {
      why: [
        `The goods lost leave the goods bought for sale: Purchases A/c is credited with their cost, ${inr(g)}.`,
        ...(claim
          ? [`The insurer owes the claim admitted: Insurance Claim Receivable A/c is debited with ${inr(claim)}.`, `The rest, ${inr(g)} − ${inr(claim)} = ${inr(loss)}, is the loss: Loss by Fire A/c is debited.`]
          : ['Nothing can be claimed, so the whole cost is the loss: Loss by Fire A/c is debited.']),
      ],
      distractors: ['stock', 'insurance', 'sales'],
    },
    two: {
      right: claim
        ? 'Purchases reduced by the cost; the part not covered debited to the Profit and Loss Account; the claim shown as a current asset'
        : 'Purchases reduced by the cost, and the same amount debited to the Profit and Loss Account as a loss',
      wrong: claim
        ? [
            ['Purchases reduced by the cost; the whole cost debited to the Profit and Loss Account; the claim not shown', 'Ignored the claim: only the part not covered is a loss, and the claim admitted is an asset.'],
            ['Purchases left as they are; the part not covered debited to the Profit and Loss Account; the claim shown as a current asset', 'Left the goods lost in purchases, so their cost is counted in the cost of goods sold as well.'],
            ['Sales increased by the claim; nothing debited to the Profit and Loss Account', 'Treated the insurance claim as a sale of the goods.'],
            ['Purchases reduced by the cost; the part not covered debited to the Profit and Loss Account; the claim shown as a current liability', 'Took money due from the insurer as money the business owes.'],
          ]
        : [
            ['Purchases left as they are, and the cost debited to the Profit and Loss Account as a loss', 'Left the goods lost in purchases, so their cost is counted twice.'],
            ['Purchases reduced by the cost, and nothing shown in the Profit and Loss Account', 'Took the goods out of the Trading Account but did not charge the loss.'],
            ['Purchases reduced by the cost, and the same amount added to the drawings', 'Treated a loss of the business as goods taken by the proprietor.'],
            ['Purchases reduced by the cost, and the same amount shown as a current asset', 'Showed a claim although the goods were not insured.'],
          ],
      because: 'An unusual loss of goods is taken out of the Trading Account at cost and shown on its own in the Profit and Loss Account, less whatever the insurer has admitted.',
    },
  });
}

/** The manager's commission on `p`, the net profit before charging it; unpaid on 31 March. */
function managerCommission(rate: number, basis: Basis, p: number): Adj {
  const c = commissionOn(p, rate, basis);
  const other = commissionOn(p, rate, basis === 'after' ? 'before' : 'after');
  return adj({
    key: 'commission',
    text: `The manager gets a commission of ${rate}% of the net profit ${basis} charging such commission, reckoned after all the other adjustments; it is unpaid.`,
    lines: [dr('commissionPaid', c), cr('outstandingExpenses', c)],
    np: -c,
    liab: c,
    commission: { rate, basis, p },
    short: "the manager's commission",
    npSlips: [
      {
        why: basis === 'after' ? 'Took the commission on the profit before charging it; here it is on the profit after charging it.' : 'Took the commission on the profit after charging it; here it is on the profit before charging it.',
        by: c - other,
      },
    ],
    bsSlips: [{ why: "Did not show the manager's commission, which is unpaid, as a liability.", by: -c }],
    workP: [
      basis === 'after'
        ? `Manager's commission = profit before commission ${inr(p)} × ${rate}/${100 + rate} = ${inr(c)}.`
        : `Manager's commission = profit before commission ${inr(p)} × ${rate}/100 = ${inr(c)}.`,
    ],
    two: {
      right: 'Debited to the Profit and Loss Account, and shown as a current liability',
      wrong: [
        ['Debited to the Profit and Loss Account, and shown as a current asset', 'Took an amount payable to the manager as an amount receivable.'],
        ['Debited to the Trading Account, and shown as a current liability', 'Treated the commission as a cost of the goods; it is a cost of running the business.'],
        ['Deducted from the capital with the drawings', "Treated the manager's commission as drawings of the proprietor."],
        ['Not charged until it is paid, and not shown in the balance sheet', 'Waited for the payment: the commission is earned on the profit of this year.'],
      ],
      because: 'The commission is a cost of this year, and until it is paid the business owes it to the manager.',
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The trial balance
// ---------------------------------------------------------------------------------------------------------------

type Item = readonly [id: string, value: number];
const values = (items: readonly Item[] = []): number[] => items.map((i) => i[1]);

interface TbSpec {
  fixed: Item[];
  investments?: number;
  directs: Item[];
  indirect: Item[];
  badDebts?: number;
  incomes?: Item[];
  salesReturn?: number;
  purchasesReturn?: number;
  debtors: number;
  provision?: number;
  creditors: number;
  loan?: number;
  drawings: number;
  /** The net profit the trial balance and the closing stock give before any other adjustment (it may be a loss). */
  profit: number;
}
interface Tb {
  ledger: Ledger;
  closingStock: number;
  capital: number;
}

/**
 * A trial balance that agrees. The gross profit follows from the profit wanted; the cost of goods sold from a
 * margin; purchases and sales from those. The capital is what the other balances need, taken to the next round
 * figure, and the bank balance is the balancing figure (₹12,000 to ₹90,000). Nothing is forced: a business whose
 * balances would need a capital of less than ₹1,50,000 is not used.
 */
function buildTb(rng: Rng, t: TbSpec): Tb | null {
  const gp = sumOf(values(t.indirect)) + (t.badDebts ?? 0) - sumOf(values(t.incomes)) + t.profit;
  if (gp < R(60000)) return null;
  const pr = t.purchasesReturn ?? 0;
  const sr = t.salesReturn ?? 0;
  const costAt = (margin: number) => Math.round((gp * 100) / margin / R(10000)) * R(10000);
  // Debtors and creditors must be in proportion to the turnover.
  const margins = [20, 25, 30, 40].filter((m) => (costAt(m) + gp) * 2 >= t.debtors * 5 && costAt(m) * 2 >= t.creditors * 5);
  if (margins.length === 0) return null;
  const cogs = costAt(rng.pick(margins));
  const round5 = (v: number) => Math.round(v / R(5000)) * R(5000);
  const os = round5(pct(cogs, rng.int(8, 16)));
  const counted = round5(pct(cogs, rng.int(9, 18)));
  const cs = counted === os ? os + R(5000) : counted;
  const purchases = cogs - os - sumOf(values(t.directs)) + cs + pr;
  const sales = cogs + gp + sr;
  const lines: JournalLine[] = [
    dr('drawings', t.drawings),
    ...t.fixed.map(([id, v]) => dr(id, v)),
    ...(t.investments ? [dr('investments', t.investments)] : []),
    dr('stock', os),
    dr('purchases', purchases),
    ...(pr ? [cr('purchasesReturn', pr)] : []),
    cr('sales', sales),
    ...(sr ? [dr('salesReturn', sr)] : []),
    ...t.directs.map(([id, v]) => dr(id, v)),
    ...t.indirect.map(([id, v]) => dr(id, v)),
    ...(t.badDebts ? [dr('badDebts', t.badDebts)] : []),
    ...(t.incomes ?? []).map(([id, v]) => cr(id, v)),
    dr(DEBTORS, t.debtors),
    ...(t.provision ? [cr(PROVISION, t.provision)] : []),
    cr(CREDITORS, t.creditors),
    ...(t.loan ? [cr('bankLoan', t.loan)] : []),
  ];
  // What the capital less the bank balance must be for the two columns to agree.
  const gap = sumOf(lines.map((l) => (l.side === 'Dr' ? l.amount : -l.amount)));
  const capital = Math.ceil((gap + amount(rng, 12000, 40000, 1000)) / R(50000)) * R(50000);
  if (capital < R(150000)) return null;
  return { ledger: post([[cr('capital', capital), ...lines, dr('bank', capital - gap)]]), closingStock: cs, capital };
}

const tb = (ledger: Ledger, id: string): number => ledger.get(id) ?? 0;

// ---------------------------------------------------------------------------------------------------------------
// A scenario, its printed text, and the independent reading of that text
// ---------------------------------------------------------------------------------------------------------------

interface Core {
  who: Who;
  lead: string;
  /** The trial balance, and the books after the adjustments. */
  tb: Ledger;
  books: Ledger;
  cs: number;
  adjs: Adj[];
  fa: Accounts;
}

/** The most a year's profit may be, as a percentage of the capital in the trial balance, for the case to be believable. */
const MAX_RETURN = 40;

/**
 * Null for a seed that gives an adjustment which is not a whole number of rupees, a profit out of proportion to the
 * capital, or a case too long to read on a phone.
 */
function scenario(who: Who, leadLine: string, t: Tb, adjs: Adj[]): Core | null {
  if (adjs.some((a) => a.lines.some((l) => !clean(l.amount)))) return null;
  // Each adjustment must do to the books exactly what its author says it does.
  for (const a of adjs) {
    const e = accountsOf(post([a.lines]), 0);
    if (e.gp !== a.gp || e.np !== a.np || e.liabilities !== a.liab || e.capital - e.np !== a.cap) throw new Error(`final accounts case: the entry of "${a.key}" does not have its stated effect`);
  }
  const books = post(adjs.map((a) => a.lines), t.ledger);
  const fa = accountsOf(books, t.closingStock);
  if (fa.total !== fa.capital + fa.liabilities) throw new Error('final accounts case: the balance sheet does not agree');
  if (fa.np * 100 > t.capital * MAX_RETURN) return null;
  const core: Core = { who, lead: leadLine, tb: t.ledger, books, cs: t.closingStock, adjs, fa };
  return caseText(core).split('\n').length > MAX_LINES ? null : core;
}

/** The number an adjustment carries in the case: the closing stock is (1), and a joined adjustment shares a number. */
const no = (s: Core, a: Adj): number => s.adjs.slice(0, s.adjs.indexOf(a) + 1).filter((x) => !x.joined).length + 1;
/** "adjustment (3)", with what it is about when two adjustments share that number. */
const ref = (s: Core, a: Adj): string => {
  const shared = a.joined || s.adjs[s.adjs.indexOf(a) + 1]?.joined;
  return `adjustment (${no(s, a)})${shared ? `, ${a.short},` : ''}`;
};

const TB_LABELS: Record<string, string> = { stock: 'Opening Stock' };

/** The case text of a scenario, written once: it is asked for more than once for every question. */
const texts = new WeakMap<Core, string>();
function caseText(s: Core): string {
  let text = texts.get(s);
  if (text === undefined) {
    text = writeCase(s);
    texts.set(s, text);
  }
  return text;
}

/** The printed trial balance of a ledger, remembered: every question of a case prints the same one. */
const printedTbs = new Map<string, string>();
function printTb(ledger: Ledger): string {
  const key = [...ledger].join(';');
  let text = printedTbs.get(key);
  if (text === undefined) {
    if (printedTbs.size > 2000) printedTbs.clear();
    text = listBalances(trialBalance(ledger).rows.map((r) => ({ ...r, label: TB_LABELS[r.accountId] ?? r.label })));
    printedTbs.set(key, text);
  }
  return text;
}

/** The most lines a case may print: its opening line, the trial balance, and one line for each numbered adjustment. */
const MAX_LINES = 18;

function writeCase(s: Core): string {
  const stock = `Closing stock is valued at ${inr(s.cs)}; it is not in the trial balance.`;
  if (s.adjs.length === 0) return [s.lead, printTb(s.tb), `${stock} There is no other adjustment.`].join('\n');
  // A joined adjustment goes on the line of the one before it.
  const rows: string[] = [];
  for (const a of s.adjs) {
    if (a.joined && rows.length > 0) rows[rows.length - 1] += ` ${a.text}`;
    else rows.push(a.text);
  }
  return [s.lead, printTb(s.tb), `Adjustments: (1) ${stock}`, ...rows.map((text, i) => `(${i + 2}) ${text}`)].join('\n');
}

/** What the printed case gives when it is worked by hand: the trial balance by its names, then the adjustments. */
interface Hand {
  /** A printed balance, a debit as a positive figure (0 when the trial balance has no such line). */
  get(label: string): number;
  cs: number;
  /** The incomes printed in the trial balance, apart from sales. */
  incomes: number;
  gp: number;
  np: number;
  capital: number;
  /** The total of the liabilities side of the balance sheet. */
  total: number;
}
const PRINTED_TRADING = new Set(['Opening Stock', 'Purchases A/c', 'Purchases Return A/c', 'Sales A/c', 'Sales Return A/c', 'Wages A/c', 'Carriage Inwards A/c']);
const PRINTED_ASSETS = new Set([
  'Machinery A/c', 'Furniture A/c', 'Vehicles A/c', 'Computers A/c', 'Office Equipment A/c', 'Investments A/c',
  'Sundry Debtors', 'Provision for Doubtful Debts A/c', 'Bank A/c',
]);
const PRINTED_LIABILITIES = new Set(['Sundry Creditors', 'Bank Loan A/c']);
const PRINTED_CAPITAL = new Set(['Capital A/c', 'Drawings A/c']);

/** Null when the printed trial balance does not agree or the closing stock is missing. */
function readCase(context: string, adjs: Adj[]): Hand | null {
  const printed = new Map<string, number>();
  let cs: number | null = null;
  for (const line of context.split('\n')) {
    const row = /^(.+): ₹([\d,]+) \((Dr|Cr)\)$/.exec(line);
    if (row) {
      printed.set(row[1], (row[3] === 'Dr' ? 1 : -1) * R(Number(row[2].replace(/,/g, ''))));
      continue;
    }
    const stock = /Closing stock is valued at ₹([\d,]+)/.exec(line);
    if (stock && cs === null) cs = R(Number(stock[1].replace(/,/g, '')));
  }
  if (cs === null || printed.size < 8 || sumOf([...printed.values()]) !== 0) return null;
  let trading = 0;
  let expenses = 0;
  let incomes = 0;
  let liabilities = 0;
  let capital = 0;
  for (const [label, v] of printed) {
    if (PRINTED_TRADING.has(label)) trading -= v;
    else if (PRINTED_LIABILITIES.has(label)) liabilities -= v;
    else if (PRINTED_CAPITAL.has(label)) capital -= v;
    else if (PRINTED_ASSETS.has(label)) continue;
    else if (v > 0) expenses += v;
    else incomes -= v;
  }
  const gp = trading + cs + sumOf(adjs.map((a) => a.gp));
  const np = trading + cs - expenses + incomes + sumOf(adjs.map((a) => a.np));
  const closing = capital + sumOf(adjs.map((a) => a.cap)) + np;
  return { get: (label) => printed.get(label) ?? 0, cs, incomes, gp, np, capital: closing, total: closing + liabilities + sumOf(adjs.map((a) => a.liab)) };
}

// ---------------------------------------------------------------------------------------------------------------
// A case: every typed answer carries a check that works it another way from the printed case
// ---------------------------------------------------------------------------------------------------------------

type Part<S> =
  | { kind: 'numeric'; make(s: S): NumericParts | null; check(h: Hand, s: S): number }
  | { kind: 'mcq'; make(s: S): McqParts | null }
  | { kind: 'journal'; make(s: S): JournalParts | null };

function define<S extends Core>(def: { id: string; version?: number; difficulty: Difficulty; title: string; setup(rng: Rng): S | null; parts: Part<S>[] }): CaseTemplate {
  // The scenario behind the question just made: `verify` runs straight after the question is generated.
  let last: { s: S; context: string } | undefined;
  return caseTemplate<S>({
    id: def.id,
    ...(def.version !== undefined ? { version: def.version } : {}),
    topicId: TOPIC,
    conceptId: CONCEPT,
    difficulty: def.difficulty,
    title: def.title,
    setup: (rng) => {
      const s = def.setup(rng);
      last = s ? { s, context: caseText(s) } : undefined;
      return s;
    },
    context: caseText,
    parts: def.parts.map((p): CasePart<S> => {
      if (p.kind !== 'numeric') return p;
      return {
        kind: 'numeric',
        unit: 'rupees',
        make: p.make,
        verify: (q) => {
          if (!last || last.context !== q.context) return false;
          const h = readCase(q.context, last.s.adjs);
          return h !== null && p.check(h, last.s) === q.answer;
        },
      };
    }),
  });
}

/** A typed-amount question: the mistakes that give no usable figure are dropped, and at least three must remain. */
function num(prompt: string, answer: number, errors: (Err | false | null | undefined)[], explanation: string[], hints?: string[]): NumericParts | null {
  if (!clean(answer)) return null;
  const seen = new Set([answer]);
  const commonErrors: Err[] = [];
  for (const e of errors) {
    if (!e || !clean(e.value) || seen.has(e.value)) continue;
    seen.add(e.value);
    commonErrors.push(e);
  }
  return commonErrors.length < 3 ? null : { prompt, answer, commonErrors, explanation, ...(hints ? { hints } : {}) };
}

// ---------------------------------------------------------------------------------------------------------------
// The working, written from the books
// ---------------------------------------------------------------------------------------------------------------

function tradingSteps(s: Core): string[] {
  const b = (id: string) => tb(s.books, id);
  const out: string[] = [];
  const goods = s.adjs.flatMap((a) => (a.goods ? [a.goods] : []));
  if (goods.length > 0) out.push(`Purchases = ${inr(tb(s.tb, 'purchases'))}${goods.map((g) => ` − ${inr(g.cost)} ${g.note}`).join('')} = ${inr(b('purchases'))}.`);
  out.push(...s.adjs.flatMap((a) => a.workT));
  const sr = b('salesReturn');
  const pr = -b('purchasesReturn');
  if (sr) out.push(`Net sales = ${inr(-b('sales'))} − ${inr(sr)} = ${inr(s.fa.netSales)}.`);
  if (pr) out.push(`Net purchases = ${inr(b('purchases'))} − ${inr(pr)} = ${inr(b('purchases') - pr)}.`);
  const directs = DIRECT_IDS.filter((id) => b(id) > 0).map((id) => ` + ${nm(id)} ${inr(b(id))}`);
  out.push(`Cost of goods sold = opening stock ${inr(b('stock'))} + ${pr ? 'net purchases' : 'purchases'} ${inr(b('purchases') - pr)}${directs.join('')} − closing stock ${inr(s.cs)} = ${inr(s.fa.cogs)}.`);
  out.push(`Gross profit = ${sr ? 'net sales' : 'sales'} ${inr(s.fa.netSales)} − cost of goods sold ${inr(s.fa.cogs)} = ${inr(s.fa.gp)}.`);
  return out;
}

const isIndirect = (id: string): boolean => !TRADING_COST.has(id) && typeOf(id) === 'expense';
const isOtherIncome = (id: string): boolean => id !== 'sales' && id !== 'salesReturn' && typeOf(id) === 'income';

/** The result of the Profit and Loss Account in one line. `label` names a profit that is not yet the final one. */
const profitLine = (s: Core, label = 'Net profit'): string => {
  const { gp, np, expenses, incomes } = s.fa;
  return np >= 0
    ? `${label} = gross profit ${inr(gp)} − expenses ${inr(expenses)}${incomes ? ` + other incomes ${inr(incomes)}` : ''} = ${inr(np)}.`
    : `Net loss = expenses ${inr(expenses)} − gross profit ${inr(gp)}${incomes ? ` − other incomes ${inr(incomes)}` : ''} = ${inr(-np)}.`;
};

/** The two totals of the Profit and Loss Account, item by item (`commission` is a manager's commission to leave out). */
function plTotals(s: Core, commission = 0): string[] {
  const provided = s.adjs.some((a) => a.key === 'provision');
  const name = (id: string) => (id === 'badDebts' && provided ? 'bad debts and provision' : nm(id));
  const list = (keep: (id: string) => boolean) =>
    [...s.books].filter(([id, v]) => v !== 0 && keep(id) && !(commission && id === 'commissionPaid')).map(([id, v]) => `${name(id)} ${inr(Math.abs(v))}`);
  const out = [`Expenses${commission ? ' before the commission' : ''} = ${list(isIndirect).join(' + ')} = ${inr(s.fa.expenses - commission)}.`];
  if (s.fa.incomes) out.push(`Other incomes = ${list(isOtherIncome).join(' + ')} = ${inr(s.fa.incomes)}.`);
  return out;
}

/**
 * The Profit and Loss Account: the adjusted items, then the totals and the result. A manager's commission comes
 * last, after the profit it is worked out on.
 */
function plSteps(s: Core, label?: string): string[] {
  const comm = s.adjs.find((a) => a.commission);
  if (!comm?.commission) return [...s.adjs.flatMap((a) => a.workP), ...plTotals(s), profitLine(s, label)];
  const c = -comm.np;
  const { gp, np, expenses, incomes } = s.fa;
  return [
    ...s.adjs.filter((a) => a !== comm).flatMap((a) => a.workP),
    ...plTotals(s, c),
    `Net profit before commission = gross profit ${inr(gp)} − expenses ${inr(expenses - c)}${incomes ? ` + other incomes ${inr(incomes)}` : ''} = ${inr(comm.commission.p)}.`,
    ...comm.workP,
    `Net profit = ${inr(comm.commission.p)} − ${inr(c)} = ${inr(np)}.`,
  ];
}

function assetSteps(s: Core): string[] {
  const items: string[] = [];
  const prov = -tb(s.books, PROVISION);
  for (const [id, v] of s.books) {
    if (v === 0 || id === 'stock' || id === PROVISION || typeOf(id) !== 'asset') continue;
    if (id === DEBTORS) {
      items.push(`closing stock ${inr(s.cs)}`);
      items.push(prov ? `sundry debtors ${inr(v - prov)} (${inr(v)} − provision ${inr(prov)})` : `sundry debtors ${inr(v)}`);
    } else items.push(`${nm(id)} ${inr(v)}`);
  }
  return [`Assets = ${items.join(' + ')} = ${inr(s.fa.total)}.`];
}

function capitalSteps(s: Core): string[] {
  const opening = -tb(s.tb, 'capital');
  const interest = -tb(s.books, 'capital') - opening;
  const drawnTb = tb(s.tb, 'drawings');
  const drawn = tb(s.books, 'drawings');
  const extras = s.adjs.filter((a) => a.drawn).map((a) => ` + ${a.drawn} ${inr(-a.cap)}`);
  const np = s.fa.np;
  return [
    `Closing capital = capital ${inr(opening)}${interest ? ` + interest on capital ${inr(interest)}` : ''}${np >= 0 ? ` + net profit ${inr(np)}` : ` − net loss ${inr(-np)}`} − drawings ${inr(drawn)}${extras.length ? ` (${inr(drawnTb)}${extras.join('')})` : ''} = ${inr(s.fa.capital)}.`,
  ];
}

function liabilitySteps(s: Core): string[] {
  const items = [...s.books].filter(([id, v]) => v !== 0 && typeOf(id) === 'liability').map(([id, v]) => `${nm(id)} ${inr(-v)}`);
  return [`Liabilities side = closing capital ${inr(s.fa.capital)}${items.map((i) => ` + ${i}`).join('')} = ${inr(s.fa.total)}, the same as the assets.`];
}

// ---------------------------------------------------------------------------------------------------------------
// The usual slips in each figure
// ---------------------------------------------------------------------------------------------------------------

const left = (s: Core, a: Adj): string => `Left out adjustment (${no(s, a)}), ${a.short}.`;

function gpErrors(s: Core): Err[] {
  const gp = s.fa.gp;
  const b = (id: string) => tb(s.books, id);
  const out: Err[] = [];
  for (const a of s.adjs) {
    if (!a.gp) continue;
    out.push({ value: gp - a.gp, why: left(s, a) });
    for (const sl of a.gpSlips) out.push({ value: gp + sl.by, why: sl.why });
    if (a.flip) out.push({ value: gp - 2 * a.gp, why: a.flip });
  }
  out.push({ value: gp - s.cs, why: 'Left the closing stock out of the Trading Account.' });
  for (const id of DIRECT_IDS) {
    if (b(id)) out.push({ value: gp + b(id), why: `Took ${nm(id)} to the Profit and Loss Account; ${MANY.has(id) ? 'they are' : 'it is'} a direct expense of the Trading Account.` });
  }
  const indirect = b('carriageOutwards') ? 'carriageOutwards' : [...s.tb.keys()].find((id) => isIndirect(id) && id !== 'badDebts');
  if (indirect) {
    out.push({
      value: gp - b(indirect),
      why: indirect === 'carriageOutwards' ? 'Charged carriage outwards in the Trading Account; it is a selling expense of the Profit and Loss Account.' : `Charged ${nm(indirect)}, an indirect expense, in the Trading Account.`,
    });
  }
  if (b('salesReturn')) out.push({ value: gp + b('salesReturn'), why: 'Did not deduct the sales return from sales.' });
  if (b('purchasesReturn')) out.push({ value: gp + b('purchasesReturn'), why: 'Did not deduct the purchases return from purchases.' });
  out.push({ value: gp - 2 * s.cs, why: 'Put the closing stock on the debit side: added it to the cost instead of deducting it.' });
  out.push({ value: gp + b('stock'), why: 'Left out the opening stock.' });
  return out;
}

/** The usual slips in the net profit, each as the amount by which it moves the profit (before any commission on it). */
function npSlipsOf(s: Core): Slip[] {
  const b = (id: string) => tb(s.books, id);
  const others = s.adjs.filter((a) => !a.commission);
  const out: Slip[] = [];
  for (const a of others) if (a.np || a.omitBy) out.push({ by: a.omitBy ?? -a.np, why: left(s, a) });
  for (const a of others) out.push(...a.npSlips);
  for (const a of others) if (a.flip && a.np) out.push({ by: -2 * a.np, why: a.flip });
  out.push({ by: -s.cs, why: 'Left the closing stock out of the Trading Account.' });
  const drawings = tb(s.tb, 'drawings');
  if (drawings) out.push({ by: -drawings, why: 'Charged the drawings as an expense; drawings reduce the capital, not the profit.' });
  if (s.fa.incomes) {
    out.push({ by: -s.fa.incomes, why: 'Left the other incomes out of the Profit and Loss Account.' });
    out.push({ by: -2 * s.fa.incomes, why: 'Deducted the other incomes as if they were expenses.' });
  }
  if (b('salesReturn')) out.push({ by: b('salesReturn'), why: 'Did not deduct the sales return from sales.' });
  if (b('purchasesReturn')) out.push({ by: b('purchasesReturn'), why: 'Did not deduct the purchases return from purchases.' });
  for (const id of DIRECT_IDS) {
    if (b(id)) out.push({ by: -b(id), why: `Charged ${nm(id)} in the Profit and Loss Account as well as in the Trading Account.` });
  }
  if (others.length >= 2) out.push({ by: -sumOf(others.map((a) => a.np)), why: 'Ignored every adjustment except the closing stock.' });
  return out;
}

/** What the net profit becomes when the profit before any commission is wrong by `by`: the commission moves with it. */
function shifted(s: Core, by: number): number {
  const c = s.adjs.find((a) => a.commission)?.commission;
  return c ? c.p + by - commissionOn(c.p + by, c.rate, c.basis) : s.fa.np + by;
}

function npErrors(s: Core): Err[] {
  const { np, gp, expenses, incomes } = s.fa;
  const out: Err[] = [];
  const comm = s.adjs.find((a) => a.commission);
  if (comm) {
    out.push({ value: np - comm.np, why: left(s, comm) });
    for (const sl of comm.npSlips) out.push({ value: np + sl.by, why: sl.why });
    out.push({ value: np - 2 * comm.np, why: 'Added the commission to the profit instead of charging it.' });
  }
  out.push(...npSlipsOf(s).map((sl) => ({ value: shifted(s, sl.by), why: sl.why })));
  out.push({ value: gp, why: 'Stopped at the gross profit: the Profit and Loss Account was never drawn up.' });
  out.push({ value: gp + expenses + incomes, why: 'Added the expenses to the gross profit instead of deducting them.' });
  return out;
}

function totalErrors(s: Core): Err[] {
  const { total, np, gp, liabilities } = s.fa;
  const drawings = tb(s.books, 'drawings');
  const out: Err[] = s.adjs.flatMap((a) => a.bsSlips.map((sl) => ({ value: total + sl.by, why: sl.why })));
  out.push({ value: total - s.cs, why: 'Left the closing stock out of the assets; it is not in the trial balance, but it is an asset.' });
  out.push({ value: total - np, why: np >= 0 ? 'Did not add the net profit to the capital.' : 'Did not deduct the net loss from the capital.' });
  if (drawings) {
    out.push({ value: total + drawings, why: 'Did not deduct the drawings from the capital.' });
    out.push({ value: total + 2 * drawings, why: 'Added the drawings to the capital instead of deducting them.' });
  }
  out.push({ value: -tb(s.tb, 'capital') + liabilities, why: 'Took the capital of the trial balance, without the profit of the year or the drawings.' });
  out.push({ value: total - np + gp, why: 'Added the gross profit to the capital instead of the net profit.' });
  out.push({ value: trialBalance(s.tb).debitTotal, why: 'Gave the total of the trial balance, not of the balance sheet.' });
  return out;
}

function capitalErrors(s: Core): Err[] {
  const { capital, np, gp, total } = s.fa;
  const drawings = tb(s.books, 'drawings');
  const out: Err[] = s.adjs.flatMap((a) => a.capSlips.map((sl) => ({ value: capital + sl.by, why: sl.why })));
  if (np >= 0) {
    out.push({ value: capital - np, why: 'Did not add the net profit of the year.' });
    out.push({ value: capital - np + gp, why: 'Added the gross profit instead of the net profit.' });
  } else {
    out.push({ value: capital - 2 * np, why: 'Added the net loss to the capital instead of deducting it.' });
    out.push({ value: capital - np, why: 'Left the net loss of the year out.' });
  }
  if (drawings) {
    out.push({ value: capital + drawings, why: 'Did not deduct the drawings.' });
    out.push({ value: capital + 2 * drawings, why: 'Added the drawings instead of deducting them.' });
  }
  for (const a of s.adjs) {
    const profit = a.commission ? np - a.np : shifted(s, a.omitBy ?? -a.np);
    out.push({ value: capital + profit - np - a.cap, why: left(s, a) });
  }
  out.push({ value: total, why: 'Gave the total of the balance sheet; the outside liabilities are not part of the capital.' });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Questions every case can ask
// ---------------------------------------------------------------------------------------------------------------

const PROFIT_HINTS = [
  'Start from the gross profit. Then take every indirect expense and every other income, each after its adjustment.',
  'Net profit = gross profit + other incomes − indirect expenses. Drawings and assets do not enter it.',
];

const grossProfit = <S extends Core>(): Part<S> => ({
  kind: 'numeric',
  make: (s) =>
    num('What is the gross profit for the year?', s.fa.gp, gpErrors(s), tradingSteps(s), [
      'Which balances belong to the Trading Account? Take each after its adjustment, and do not forget the closing stock.',
      'Gross profit = net sales − (opening stock + net purchases + direct expenses − closing stock).',
    ]),
  check: (h) => h.gp,
});

const netProfit = <S extends Core>(): Part<S> => ({
  kind: 'numeric',
  make: (s) => (s.fa.np > 0 ? num('What is the net profit for the year?', s.fa.np, npErrors(s), [...tradingSteps(s), ...plSteps(s)], PROFIT_HINTS) : null),
  check: (h) => h.np,
});

const closingCapital = <S extends Core>(): Part<S> => ({
  kind: 'numeric',
  make: (s) =>
    num('What is the capital of the proprietor on 31 March, as the balance sheet shows it?', s.fa.capital, capitalErrors(s), [profitLine(s), ...capitalSteps(s)], [
      'Start from the capital in the trial balance. What does the year add to it, and what does it take away?',
      'Closing capital = capital + interest on capital + net profit (or − net loss) − drawings, with whatever the adjustments add to the drawings.',
    ]),
  check: (h) => h.capital,
});

const balanceSheetTotal = <S extends Core>(): Part<S> => ({
  kind: 'numeric',
  make: (s) =>
    num('What is the total of the balance sheet on 31 March?', s.fa.total, totalErrors(s), [...assetSteps(s), profitLine(s), ...capitalSteps(s), ...liabilitySteps(s)], [
      'Add up the assets, each after its adjustment: the closing stock is one of them.',
      'Check with the other side: capital + net profit − drawings, then the creditors and every amount still owed.',
    ]),
  // The answer is the assets side; the check is the liabilities side, worked from the printed case.
  check: (h) => h.total,
});

/** The adjusting entry of one adjustment of the case. */
const adjustingEntry = <S extends Core>(pick: (s: S) => Adj): Part<S> => ({
  kind: 'journal',
  make: (s) => {
    const a = pick(s);
    if (!a.entry) return null;
    return {
      prompt: `Pass the adjusting entry for ${ref(s, a).replace(/,$/, '')}.`,
      lines: a.entry.lines ?? a.lines,
      explanation: a.entry.why,
      distractorAccounts: a.entry.distractors,
    };
  },
});

/** Where the two effects of one adjustment appear. */
const twoEffects = <S extends Core>(pick: (s: S) => Adj): Part<S> => ({
  kind: 'mcq',
  make: (s) => {
    const a = pick(s);
    if (!a.two) return null;
    return {
      prompt: `How is ${ref(s, a)} shown in the final accounts?`,
      correct: a.two.right,
      distractors: a.two.wrong.map(([text, why]) => ({ text, why })),
      explanation: a.two.because,
    };
  },
});

/** How one adjustment appears in the balance sheet, with its amount. */
const balanceSheetPlace = <S extends Core>(pick: (s: S) => Adj): Part<S> => ({
  kind: 'mcq',
  make: (s) => {
    const a = pick(s);
    if (!a.place) return null;
    return {
      prompt: `How does ${ref(s, a)} appear in the balance sheet on 31 March?`,
      correct: a.place.right,
      distractors: a.place.wrong.map(([text, why]) => ({ text, why })),
      explanation: a.place.because,
    };
  },
});

/** The adjusted figure of the expense or income one adjustment changes. */
const adjustedFigure = <S extends Core>(pick: (s: S) => Adj): Part<S> => ({
  kind: 'numeric',
  make: (s) => {
    const c = pick(s).charge;
    return c ? num(c.prompt, c.answer, c.errors, c.work) : null;
  },
  // The balance of the account in the books after the adjusting entries.
  check: (_h, s) => Math.abs(tb(s.books, pick(s).charge?.id ?? '')),
});

// ---------------------------------------------------------------------------------------------------------------
// 1. Closing stock only (easy)
// ---------------------------------------------------------------------------------------------------------------

interface Plain extends Core {
  direct: Head;
  indirect: Head[];
  fixed: AssetHead;
  closing: 'stock' | 'gross' | 'net' | 'drawings';
}

const closingStockOnly = define<Plain>({
  id: 'case-fa-closing-stock',
  difficulty: 'easy',
  title: 'A trial balance with closing stock only',
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const direct = rng.pick([WAGES, CARRIAGE_IN]);
    let pool = rng.shuffle([INSURANCE, ELECTRICITY, TELEPHONE, ADVERTISEMENT, CARRIAGE_OUT, STATIONERY, GENERAL]);
    // Carriage outwards beside carriage inwards is the pair students mix up.
    if (direct === CARRIAGE_IN && rng.next() < 0.7) pool = [CARRIAGE_OUT, ...pool.filter((h) => h !== CARRIAGE_OUT)];
    const extra = rng.pick(['income', 'salesReturn', 'purchasesReturn', 'third', 'none'] as const);
    // One of the two large expenses of a shop, then one or two smaller ones.
    const indirect = [rng.pick([SALARIES, RENT]), ...pool.slice(0, extra === 'third' ? 2 : 1)];
    const fixed = rng.pick(ASSETS);
    const income = rng.pick([COMMISSION, DISCOUNT_RECEIVED]);
    const t = buildTb(rng, {
      fixed: [[fixed.id, amount(rng, 100000, 320000, 10000)]],
      directs: [[direct.id, draw(rng, direct)]],
      indirect: indirect.map((h): Item => [h.id, draw(rng, h)]),
      incomes: extra === 'income' ? [[income.id, draw(rng, income)]] : [],
      salesReturn: extra === 'salesReturn' ? amount(rng, 4000, 20000, 1000) : 0,
      purchasesReturn: extra === 'purchasesReturn' ? amount(rng, 3000, 15000, 1000) : 0,
      debtors: amount(rng, 60000, 180000, 5000),
      creditors: amount(rng, 40000, 100000, 5000),
      drawings: amount(rng, 24000, 60000, 6000),
      profit: amount(rng, 40000, 110000, 5000),
    });
    if (!t) return null;
    const closing = rng.pick(['stock', 'gross', 'net', 'drawings'] as const);
    const core = scenario(who, lead(rng, who), t, []);
    return core && { ...core, direct, indirect, fixed, closing };
  },
  parts: [
    {
      kind: 'mcq',
      make: (s) => ({
        prompt: 'Which of these balances is debited to the Trading Account?',
        correct: accountLabel(s.direct.id),
        distractors: [
          ...s.indirect.map((h) => ({
            text: accountLabel(h.id),
            why:
              h === CARRIAGE_OUT
                ? 'Mixed up the two kinds of carriage: carriage outwards is a selling expense of the Profit and Loss Account.'
                : `Took ${h.name}, an indirect expense, as a cost of the goods; ${it(h)} ${h.many ? 'belong' : 'belongs'} in the Profit and Loss Account.`,
          })),
          { text: 'Drawings A/c', why: 'Treated the drawings as an expense of the business; they are deducted from the capital.' },
          { text: accountLabel(s.fixed.id), why: `Treated ${s.fixed.name}, a fixed asset of the balance sheet, as a cost of the year.` },
          { text: 'Sundry Debtors', why: 'Treated an asset as an expense: debtors are shown in the balance sheet.' },
        ],
        explanation: `${cap(s.direct.name)} ${be(s.direct)} a direct expense, a cost of buying the goods or making them ready for sale, so ${it(s.direct)} ${be(s.direct)} debited to the Trading Account with the opening stock and the purchases.`,
      }),
    },
    {
      kind: 'numeric',
      make: (s) => {
        const { cogs } = s.fa;
        const b = (id: string) => tb(s.books, id);
        const other = s.indirect.includes(CARRIAGE_OUT) ? CARRIAGE_OUT : s.indirect[0];
        return num(
          'What is the cost of goods sold for the year?',
          cogs,
          [
            { value: cogs + s.cs, why: 'Left the closing stock out: the cost of goods sold covers only the goods that were sold.' },
            { value: cogs - b(s.direct.id), why: `Left out ${s.direct.name}; ${it(s.direct)} ${be(s.direct)} a direct expense, part of the cost of the goods.` },
            { value: cogs + b(other.id), why: `Included ${other.name}, an indirect expense of the Profit and Loss Account.` },
            { value: cogs + 2 * s.cs, why: 'Added the closing stock to the cost instead of deducting it.' },
            b('purchasesReturn') ? { value: cogs - b('purchasesReturn'), why: 'Did not deduct the purchases return from purchases.' } : null,
            b('salesReturn') ? { value: cogs + b('salesReturn'), why: 'Added the sales return to the cost; it is deducted from sales.' } : null,
            { value: cogs - b('stock'), why: 'Left out the opening stock.' },
            { value: s.fa.netSales, why: 'Gave the sales, which include the profit, instead of the cost.' },
          ],
          tradingSteps(s).filter((l) => !l.startsWith('Gross profit') && !l.startsWith('Net sales')),
        );
      },
      // The other way round: what the sales brought in, less the gross profit made on them.
      check: (h) => -h.get('Sales A/c') - h.get('Sales Return A/c') - h.gp,
    },
    grossProfit(),
    netProfit(),
    {
      kind: 'journal',
      make: (s) => {
        const { gp, np } = s.fa;
        const drawings = tb(s.books, 'drawings');
        switch (s.closing) {
          case 'stock':
            return {
              prompt: 'Pass the entry that brings the closing stock into the books on 31 March. (The stock account of these books is Stock A/c.)',
              lines: [dr('stock', s.cs), cr('trading', s.cs)],
              explanation: [`The unsold goods, ${inr(s.cs)}, are an asset on 31 March: Stock A/c is debited with the closing stock.`, 'They are not part of the cost of the goods sold: Trading A/c is credited.'],
              distractorAccounts: ['purchases', 'profitAndLoss', 'sales'],
            };
          case 'gross':
            return {
              prompt: 'Pass the closing entry that transfers the gross profit to the Profit and Loss Account.',
              lines: [dr('trading', gp), cr('profitAndLoss', gp)],
              explanation: [`The Trading Account shows a gross profit of ${inr(gp)}, a credit balance.`, 'Trading A/c is debited to close it, and the profit is carried to the credit of Profit and Loss A/c.'],
              distractorAccounts: ['capital', 'sales', 'purchases'],
            };
          case 'net':
            return {
              prompt: 'Pass the closing entry that transfers the net profit to the capital account.',
              lines: [dr('profitAndLoss', np), cr('capital', np)],
              explanation: [`The Profit and Loss Account shows a net profit of ${inr(np)}, a credit balance.`, 'Profit and Loss A/c is debited to close it, and the profit is added to the capital: Capital A/c is credited.'],
              distractorAccounts: ['drawings', 'trading', 'sales'],
            };
          default:
            return {
              prompt: 'Pass the closing entry for the drawings of the year.',
              lines: [dr('capital', drawings), cr('drawings', drawings)],
              explanation: ['Drawings are not an expense: they reduce the capital, so Capital A/c is debited.', 'Drawings A/c has a debit balance and is credited to close it.'],
              distractorAccounts: ['profitAndLoss', 'trading'],
            };
        }
      },
    },
    balanceSheetTotal(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Pieces several cases draw
// ---------------------------------------------------------------------------------------------------------------

/** A date during the year and the whole months from then to 31 March. */
const PART_YEAR = [
  { date: '1 July', months: 9 },
  { date: '1 October', months: 6 },
  { date: '1 December', months: 4 },
  { date: '1 January', months: 3 },
] as const;
const QUARTERS = PART_YEAR.filter((w) => w.months % 3 === 0);

/**
 * A fixed asset and its depreciation: the whole balance for the year, or with an item bought during the year.
 * `monthly` is the depreciation of that item for one month in rupees, which fixes its cost for the rate drawn.
 */
function drawDepreciation(rng: Rng, asset: AssetHead, withAddition: boolean, monthly: 500 | 1000): { balance: number; adj: Adj } {
  const rate = rng.pick([10, 15, 20]);
  if (!withAddition) {
    const balance = amount(rng, 100000, 300000, 20000);
    return { balance, adj: depreciation(asset, rate, balance) };
  }
  const cost = R((monthly * 1200) / rate) * (monthly === 500 ? rng.pick([1, 2]) : 1);
  const balance = amount(rng, 100000, 240000, 20000) + cost;
  const when = rng.pick(PART_YEAR);
  return { balance, adj: depreciation(asset, rate, balance, { cost, date: when.date, months: when.months }) };
}

/** The figures of the debtors: further bad debts, then a provision on what is left. */
interface DebtFacts {
  further: number;
  rate: number;
  /** The debtors left after the further bad debts. */
  good: number;
  /** The provision and the bad debts already in the trial balance (either may be nothing). */
  old: number;
  tbBad: number;
}

/**
 * `tbBad` and `old` say whether the trial balance may carry bad debts and an old provision (each is one more line
 * of it); `joined` prints the two adjustments on one line.
 */
function drawDebts(
  rng: Rng,
  step: 500 | 1000,
  allow: { tbBad: boolean; old: boolean; joined: boolean },
): (DebtFacts & { debtors: number; write: Adj; prov: Adj }) | null {
  const rate = rng.pick([5, 10]);
  const good = amount(rng, 100000, 300000, 20000);
  const further = amount(rng, 2000, 12000, 1000);
  const nw = pct(good, rate);
  const hasOld = rng.next() < 0.65 && allow.old;
  const rising = rng.next() < 0.65;
  const share = rising ? rng.int(30, 80) : rng.int(120, 180);
  const old = hasOld ? R(step) * Math.round(pct(nw, share) / R(step)) : 0;
  if (hasOld && (old <= 0 || old === nw)) return null;
  const tbBad = allow.tbBad && ((hasOld && !rising) || rng.next() < 0.6) ? amount(rng, 2000, 9000, step) : 0;
  // The provision released must not swallow the bad debts: the item stays a charge.
  if (tbBad + further + nw - old < R(1000)) return null;
  // The debtor is named only when the bad debts have a line to themselves.
  const named = rng.next() < 0.4;
  const debtorName = rng.pick(PARTIES);
  const text = named && !allow.joined ? `Write off ${inr(further)} due from ${debtorName}, an insolvent debtor, as a further bad debt.` : `Write off further bad debts of ${inr(further)}.`;
  return { rate, good, further, old, tbBad, debtors: good + further, write: badDebts(further, text, rate, tbBad, false), prov: provision(rate, good, further, tbBad, old, allow.joined) };
}

const newProvision = <S extends Core & DebtFacts>(): Part<S> => ({
  kind: 'numeric',
  make: (s) => {
    const nw = pct(s.good, s.rate);
    const debtors = s.good + s.further;
    return num(
      'What provision for doubtful debts is required on 31 March?',
      nw,
      [
        { value: pct(debtors, s.rate), why: 'Worked out the provision on the debtors before writing off the further bad debts.' },
        s.old ? { value: pct(s.good - s.old, s.rate), why: 'Deducted the old provision from the debtors before applying the rate; the old provision is not part of the base.' } : null,
        s.old ? { value: Math.abs(nw - s.old), why: 'Gave only the change in the provision, not the provision required.' } : null,
        s.old ? { value: nw + s.old, why: 'Added the old provision to the new one; the new provision is the whole amount to be kept.' } : null,
        { value: s.good - nw, why: 'Gave the debtors left after the provision, not the provision itself.' },
        { value: pct(s.further, s.rate), why: 'Applied the rate to the bad debts written off instead of to the debtors that remain.' },
      ],
      [`Debtors after the further bad debts = ${inr(debtors)} − ${inr(s.further)} = ${inr(s.good)}.`, `Provision required = ${inr(s.good)} × ${s.rate}% = ${inr(nw)}.`],
    );
  },
  // The balance of the provision account in the books after the adjusting entries.
  check: (_h, s) => -tb(s.books, PROVISION),
});

const doubtfulCharge = <S extends Core & DebtFacts>(): Part<S> => ({
  kind: 'numeric',
  make: (s) => {
    const nw = pct(s.good, s.rate);
    const bad = s.tbBad + s.further;
    const charge = bad + nw - s.old;
    return num(
      s.old
        ? 'Bad debts and the change in the provision for doubtful debts are shown as one item on the debit side of the Profit and Loss Account. What is the net amount of that item?'
        : 'Bad debts and the new provision for doubtful debts are shown as one item on the debit side of the Profit and Loss Account. What is the amount of that item?',
      charge,
      [
        s.old ? { value: charge + s.old, why: 'Charged the whole new provision and ignored the provision already in the trial balance.' } : null,
        { value: charge - s.further, why: 'Left the further bad debts out of the charge.' },
        s.tbBad ? { value: charge - s.tbBad, why: 'Left out the bad debts already in the trial balance.' } : null,
        { value: charge + pct(s.further, s.rate), why: 'Worked out the provision on the debtors before writing off the further bad debts.' },
        s.old ? { value: charge + 2 * s.old, why: 'Added the old provision instead of deducting it.' } : null,
        { value: nw - s.old, why: s.old ? 'Gave only the change in the provision and left out the bad debts.' : 'Gave only the provision and left out the bad debts.' },
        { value: bad, why: 'Gave only the bad debts and left out the provision.' },
      ],
      [...(s.tbBad ? [`Bad debts = ${inr(s.tbBad)} in the trial balance + ${inr(s.further)} further = ${inr(bad)}.`] : []), ...(s.adjs.find((a) => a.key === 'provision')?.workP ?? [])],
    );
  },
  // From the printed figures: the bad debts, the provision on what is left of the debtors, less the old provision (a credit).
  check: (h, s) => h.get('Bad Debts A/c') + s.further + ((h.get('Sundry Debtors') - s.further) * s.rate) / 100 + h.get('Provision for Doubtful Debts A/c'),
});

const debtorsShown = <S extends Core & DebtFacts>(): Part<S> => ({
  kind: 'numeric',
  make: (s) => {
    const nw = pct(s.good, s.rate);
    const debtors = s.good + s.further;
    return num(
      'At what amount are sundry debtors shown in the balance sheet on 31 March?',
      s.good - nw,
      [
        { value: s.good, why: 'Wrote off the further bad debts but did not deduct the provision.' },
        { value: debtors - pct(debtors, s.rate), why: 'Did not write off the further bad debts before providing.' },
        { value: debtors - nw, why: 'Deducted the provision but not the further bad debts.' },
        s.old ? { value: s.good - nw - s.old, why: 'Deducted the old provision as well as the new one; the new provision takes the place of the old.' } : null,
        s.old ? { value: s.good - s.old, why: 'Deducted the old provision instead of the new one.' } : null,
        { value: s.good - pct(debtors, s.rate), why: 'Worked out the provision on the debtors before writing off the further bad debts.' },
        { value: debtors, why: 'Gave the trial balance figure, without either adjustment.' },
      ],
      [
        `Debtors after the further bad debts = ${inr(debtors)} − ${inr(s.further)} = ${inr(s.good)}.`,
        `Provision = ${inr(s.good)} × ${s.rate}% = ${inr(nw)}.`,
        `Debtors in the balance sheet = ${inr(s.good)} − ${inr(nw)} = ${inr(s.good - nw)}.`,
      ],
    );
  },
  // The two accounts in the books after the adjusting entries: the debtors less the provision (a credit).
  check: (_h, s) => tb(s.books, DEBTORS) + tb(s.books, PROVISION),
});

/** The fixed asset after the depreciation of one adjustment. */
const assetShown = <S extends Core>(pick: (s: S) => Adj): Part<S> => ({
  kind: 'numeric',
  make: (s) => {
    const a = pick(s).shown;
    return a ? num(a.prompt, a.answer, a.errors, a.work) : null;
  },
  check: (h, s) => pick(s).shown?.hand(h) ?? -1,
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Outstanding and prepaid expenses with depreciation (medium)
// ---------------------------------------------------------------------------------------------------------------

interface Accruals extends Core {
  /** The adjustments whose entry, whose expense and whose place in the balance sheet are asked, and the depreciation. */
  entryOf: Adj;
  chargeOf: Adj;
  placeOf: Adj;
  dep: Adj;
}

const accruals = define<Accruals>({
  id: 'case-fa-outstanding-prepaid',
  difficulty: 'medium',
  title: 'Outstanding and prepaid expenses with depreciation',
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const asset = rng.pick(ASSETS);
    const third = rng.pick([RENT, ELECTRICITY, TELEPHONE, ADVERTISEMENT]);
    const outKind = rng.pick(['wages', 'salaries', 'third', 'loan'] as const);
    const preKind = rng.pick(third === RENT && outKind !== 'third' ? (['amount', 'policy', 'rent'] as const) : (['amount', 'policy'] as const));
    const monthlySalary = amount(rng, 4000, 9000, 500);
    const monthlyRent = amount(rng, 2000, 6000, 500);
    const wages = draw(rng, WAGES);
    const salaries = monthlySalary * (outKind === 'salaries' ? 11 : 12);
    const thirdPaid = third !== RENT ? draw(rng, third) : monthlyRent * (outKind === 'third' ? 11 : preKind === 'rent' ? 13 : 12);
    const loan = outKind === 'loan' ? R(100000) * rng.int(1, 2) : 0;

    let out: Adj;
    if (outKind === 'wages') out = outstanding(WAGES, amount(rng, 2000, 6000, 500), wages, 'for the last week of March');
    else if (outKind === 'salaries') out = outstanding(SALARIES, monthlySalary, salaries, 'for March');
    else if (outKind === 'third') out = outstanding(third, third === RENT ? monthlyRent : amount(rng, 1000, 4000, 500), thirdPaid, 'for March');
    else {
      const when = rng.pick(PART_YEAR);
      out = loanInterest(loan, rng.pick([6, 12]), when.date, when.months);
    }

    let insurance = draw(rng, INSURANCE);
    let pre: Adj;
    if (preKind === 'amount') {
      const x = amount(rng, 2000, 6000, 500);
      pre = prepaid(INSURANCE, x, insurance, `Insurance includes ${inr(x)} paid for the next year.`);
    } else if (preKind === 'policy') {
      const premium = 12 * amount(rng, 1000, 3000, 500);
      const when = rng.pick(PART_YEAR);
      // A premium paid on 1 October is half used and half prepaid: other insurance keeps the wrong figures apart.
      const other = R(rng.pick(when.months === 6 ? [4000, 6000] : [0, 0, 4000, 6000]));
      insurance = premium + other;
      pre = prepaid(
        INSURANCE,
        (premium * (12 - when.months)) / 12,
        insurance,
        other
          ? `Insurance includes ${inr(premium)} paid on ${when.date} for one year's cover from that date.`
          : `The insurance is one premium, paid on ${when.date} for one year's cover from that date.`,
        { premium, used: when.months },
      );
    } else pre = prepaid(RENT, monthlyRent, thirdPaid, `Rent includes ${inr(monthlyRent)} paid in advance for April.`);

    const d = drawDepreciation(rng, asset, rng.next() < 0.5, 500);
    const adjs = rng.shuffle([out, pre, d.adj]);
    // A balance no adjustment touches is left out when the list would run past the lines a phone can show: insurance
    // when it is the rent that is prepaid, and the third expense beside a bank loan.
    const showThird = outKind !== 'loan' || preKind === 'rent';
    const t = buildTb(rng, {
      fixed: [[asset.id, d.balance]],
      directs: [[WAGES.id, wages]],
      indirect: [[SALARIES.id, salaries], ...(showThird ? [[third.id, thirdPaid] as Item] : []), ...(preKind === 'rent' ? [] : [[INSURANCE.id, insurance] as Item])],
      loan,
      debtors: amount(rng, 60000, 180000, 5000),
      creditors: amount(rng, 40000, 100000, 5000),
      drawings: amount(rng, 24000, 60000, 6000),
      // The net profit wanted, less what the adjustments do to it.
      profit: amount(rng, 50000, 120000, 1000) - sumOf(adjs.map((a) => a.np)),
    });
    if (!t) return null;
    const core = scenario(who, lead(rng, who), t, adjs);
    if (!core || core.fa.np < R(30000)) return null;
    const chargeOf = out.charge && rng.next() < 0.5 ? out : pre;
    const placeOf = chargeOf === out ? pre : out;
    // The entry asked is not that of the adjustment whose place in the balance sheet is asked: it would give it away.
    return { ...core, entryOf: rng.pick(adjs.filter((a) => a !== placeOf)), chargeOf, placeOf, dep: d.adj };
  },
  parts: [
    adjustingEntry((s) => s.entryOf),
    adjustedFigure((s) => s.chargeOf),
    assetShown((s) => s.dep),
    grossProfit(),
    balanceSheetPlace((s) => s.placeOf),
    netProfit(),
    balanceSheetTotal(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Further bad debts and a provision for doubtful debts (medium)
// ---------------------------------------------------------------------------------------------------------------

interface Debts extends Core, DebtFacts {
  write: Adj;
  prov: Adj;
  /** The adjustment whose entry is asked: the bad debts written off, or a provision that is created. */
  entryOf: Adj;
}

const doubtfulDebts = define<Debts>({
  id: 'case-fa-doubtful-debts',
  difficulty: 'medium',
  title: 'Bad debts and the provision for doubtful debts',
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const direct = rng.pick([WAGES, CARRIAGE_IN]);
    const second = rng.pick([RENT, ELECTRICITY, ADVERTISEMENT, CARRIAGE_OUT, INSURANCE]);
    const asset = rng.pick(ASSETS);
    const debts = drawDebts(rng, 500, { tbBad: true, old: true, joined: false });
    if (!debts) return null;
    const extraKind = rng.pick(['none', 'depreciation', 'outstanding'] as const);
    const monthlySalary = amount(rng, 4000, 9000, 500);
    const salaries = monthlySalary * (extraKind === 'outstanding' ? 11 : 12);
    const d = drawDepreciation(rng, asset, false, 500);
    const extra = extraKind === 'depreciation' ? [d.adj] : extraKind === 'outstanding' ? [outstanding(SALARIES, monthlySalary, salaries, 'for March')] : [];
    // With both bad debts and a provision in the trial balance, one expense fewer keeps the list short.
    const crowded = debts.tbBad > 0 && debts.old > 0;
    const adjs = rng.next() < 0.5 ? [debts.write, debts.prov, ...extra] : [...extra, debts.write, debts.prov];
    const t = buildTb(rng, {
      fixed: [[asset.id, d.balance]],
      directs: [[direct.id, draw(rng, direct)]],
      indirect: [[SALARIES.id, salaries], ...(crowded ? [] : [[second.id, draw(rng, second)] as Item])],
      badDebts: debts.tbBad,
      debtors: debts.debtors,
      provision: debts.old,
      creditors: amount(rng, 40000, 100000, 5000),
      drawings: amount(rng, 24000, 60000, 6000),
      // The net profit wanted, less what the adjustments do to it.
      profit: amount(rng, 45000, 120000, 1000) - sumOf(adjs.map((a) => a.np)),
    });
    if (!t) return null;
    const core = scenario(who, lead(rng, who), t, adjs);
    if (!core || core.fa.np < R(30000)) return null;
    const { rate, good, further, old, tbBad, write, prov } = debts;
    // The entry that creates a provision is the standard one, Profit and Loss A/c to Provision for Doubtful Debts A/c.
    return { ...core, rate, good, further, old, tbBad, write, prov, entryOf: prov.entry && rng.next() < 0.5 ? prov : write };
  },
  parts: [
    newProvision(),
    adjustingEntry((s) => s.entryOf),
    doubtfulCharge(),
    debtorsShown(),
    {
      kind: 'mcq',
      make: (s) => {
        if (!s.old) {
          // Not the adjustment whose entry was asked: the entry would give the answer away.
          const two = s.entryOf === s.prov ? s.write.two : s.prov.two;
          if (!two) return null;
          return {
            prompt: s.entryOf === s.prov ? 'How are the further bad debts shown in the final accounts?' : 'How is the new provision for doubtful debts shown in the final accounts?',
            correct: two.right,
            distractors: two.wrong.map(([text, why]) => ({ text, why })),
            explanation: two.because,
          };
        }
        return {
          prompt: `The trial balance already shows a provision for doubtful debts of ${inr(s.old)}. What is done with it at the year end?`,
          correct: 'It is set against the bad debts and the new provision, so only the net amount is charged to the Profit and Loss Account',
          distractors: [
            { text: 'It is deducted from the debtors together with the new provision', why: 'Deducted both provisions from the debtors; the new provision takes the place of the old one.' },
            { text: 'It is left out, and the whole new provision is charged to the Profit and Loss Account', why: 'Forgot that the old provision was charged in an earlier year and still stands in the books.' },
            { text: 'It is shown as a liability in the balance sheet, beside the new provision', why: 'Treated a provision against debtors as an amount owed to outsiders.' },
            { text: 'It is added to the bad debts and the new provision, and the total is charged', why: 'Added the old provision to the charge; it has been charged already, so it reduces the charge.' },
          ],
          explanation: `The old provision of ${inr(s.old)} was charged against the profit of an earlier year to meet these losses. This year only bad debts + new provision − old provision is charged, and the debtors are shown less the new provision alone.`,
        };
      },
    },
    netProfit(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 4. Interest on capital, accrued income and income received in advance (medium). Version 2 leaves out the interest
// on drawings it charged until then: the Class 11 syllabus lists interest on capital among the adjustments, not
// interest on drawings (see `BEYOND_INTEREST_ON_DRAWINGS`).
// ---------------------------------------------------------------------------------------------------------------

interface Interests extends Core {
  ioc: Adj;
  acc: Adj;
  adv: Adj;
  entryOf: Adj;
  twoOf: Adj;
}

const interestAndIncome = define<Interests>({
  id: 'case-fa-interest-income',
  version: 2,
  difficulty: 'medium',
  title: 'Interest on capital, income due and income in advance',
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const asset = rng.pick(ASSETS);
    const accKind = rng.pick(['commission', 'rent', 'interest'] as const);
    const advKind = accKind === 'commission' ? 'rent' : accKind === 'rent' ? 'commission' : rng.pick(['rent', 'commission'] as const);
    const rateC = rng.pick([6, 8, 10, 12]);
    const drawings = amount(rng, 20000, 100000, 5000);
    const monthlyRent = amount(rng, 2000, 5000, 500);

    // The income still to be received.
    let investments = 0;
    let acc: Adj;
    let accItem: Item;
    if (accKind === 'commission') {
      const recd = draw(rng, COMMISSION);
      const x = amount(rng, 1000, 4000, 500);
      acc = accrued(COMMISSION, x, recd, `Commission of ${inr(x)} earned in March has not yet been received.`);
      accItem = [COMMISSION.id, recd];
    } else if (accKind === 'rent') {
      acc = accrued(RENT_RECEIVED, monthlyRent, monthlyRent * 11, `Rent of ${inr(monthlyRent)} for March is still to be received from the tenant.`);
      accItem = [RENT_RECEIVED.id, monthlyRent * 11];
    } else {
      investments = R(100000) * rng.int(2, 4);
      const rate = rng.pick([6, 9, 12]);
      const got = rng.pick([9, 10]);
      const monthly = (investments * rate) / 1200;
      const x = monthly * (12 - got);
      acc = accrued(
        INTEREST,
        x,
        monthly * got,
        `The investments, held all year, earn interest at ${rate}% p.a.; the interest for the last ${12 - got} months is still to be received.`,
        `Interest for the last ${12 - got} months = ${inr(investments)} × ${rate}% × ${12 - got}/12 = ${inr(x)}.`,
      );
      accItem = [INTEREST.id, monthly * got];
      acc.charge?.errors.push({ value: monthly * (12 + got), why: 'Added a full year of interest to the interest already received.' });
    }

    // The income received for next year.
    let adv: Adj;
    let advItem: Item;
    if (advKind === 'rent') {
      adv = advance(RENT_RECEIVED, monthlyRent, monthlyRent * 13, `Rent received includes ${inr(monthlyRent)} for April.`);
      advItem = [RENT_RECEIVED.id, monthlyRent * 13];
    } else {
      const recd = draw(rng, COMMISSION);
      const x = amount(rng, 1000, 4000, 500);
      adv = advance(COMMISSION, x, recd, `Commission received includes ${inr(x)} for work to be done next year.`);
      advItem = [COMMISSION.id, recd];
    }

    const t = buildTb(rng, {
      // Investments take the place of the fixed asset, and there is no direct expense (the gross profit is not asked
      // here), to keep the trial balance short.
      fixed: investments ? [] : [[asset.id, amount(rng, 150000, 400000, 10000)]],
      investments,
      directs: [],
      indirect: [[SALARIES.id, draw(rng, SALARIES)]],
      incomes: [accItem, advItem],
      debtors: amount(rng, 60000, 180000, 5000),
      creditors: amount(rng, 40000, 100000, 5000),
      drawings,
      profit: amount(rng, 70000, 150000, 1000),
    });
    if (!t) return null;

    // Capital brought in during the year, when the capital is large enough to have had some from the start.
    const brought = rng.next() < 0.4 && t.capital >= R(300000) ? { amount: R(100000) * (t.capital >= R(450000) ? rng.int(1, 2) : 1), ...rng.pick(QUARTERS) } : undefined;
    const ioc = interestOnCapital(rateC, t.capital, brought);
    const onOld = pct(t.capital - (brought?.amount ?? 0), rateC);
    const i = -ioc.np;
    ioc.charge = {
      id: 'interestOnCapital',
      prompt: 'What is the interest on capital for the year?',
      answer: i,
      errors: [
        ...(brought
          ? [
              { value: pct(t.capital, rateC), why: `Allowed a full year of interest on the ${inr(brought.amount)} brought in on ${brought.date}.` },
              { value: onOld, why: `Left out the interest on the capital brought in on ${brought.date}.` },
              { value: onOld + (pct(brought.amount, rateC) * (12 - brought.months)) / 12, why: `Counted the ${12 - brought.months} months before the capital was brought in instead of the ${brought.months} months after.` },
            ]
          : [{ value: i / 2, why: 'Allowed interest for six months only; the capital was in the business all year.' }]),
        { value: i - pct(drawings, rateC), why: 'Deducted the drawings from the capital before working out the interest.' },
        { value: t.capital + i, why: 'Gave the capital with the interest added, not the interest itself.' },
      ],
      work: ioc.workP,
    };

    // Only the interest on capital is in the syllabus, so neither the entry nor the two effects offer the interest on
    // drawings, as the other cases of the stage may.
    ioc.entry = { ...ioc.entry!, distractors: ['drawings', 'interestPaid', 'interestReceived'] };
    ioc.two = {
      ...ioc.two!,
      wrong: [
        ...ioc.two!.wrong.slice(0, 3),
        ['Debited to the Trading Account, and added to the capital', 'Took the interest on capital as a direct expense; it is charged in the Profit and Loss Account.'],
      ],
    };

    const adjs = rng.shuffle([ioc, acc, adv]);
    const core = scenario(who, lead(rng, who), t, adjs);
    if (!core || core.fa.np < R(30000)) return null;
    const entryOf = rng.pick(adjs);
    return { ...core, ioc, acc, adv, entryOf, twoOf: rng.pick(adjs.filter((a) => a !== entryOf)) };
  },
  parts: [
    adjustedFigure((s) => s.ioc),
    adjustedFigure((s) => s.acc),
    adjustedFigure((s) => s.adv),
    adjustingEntry((s) => s.entryOf),
    twoEffects((s) => s.twoOf),
    netProfit(),
    closingCapital(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 5. Goods taken or lost, and the manager's commission (complex)
// ---------------------------------------------------------------------------------------------------------------

interface Commissioned extends Core {
  /** The books before the commission, the commission, and the goods adjustment whose entry is asked. */
  pre: Core;
  comm: Adj;
  goodsEntry: Adj;
  /** The cost of the goods lost by fire and the claim admitted on them (nothing when there was no fire or no cover). */
  fireCost: number;
  claim: number;
}

const goodsAndCommission = define<Commissioned>({
  id: 'case-fa-manager-commission',
  difficulty: 'complex',
  title: "Goods taken or lost, and the manager's commission",
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const direct = rng.pick([WAGES, CARRIAGE_IN]);
    const asset = rng.pick(ASSETS);
    const second = rng.pick([RENT, ELECTRICITY, ADVERTISEMENT, CARRIAGE_OUT, TELEPHONE]);
    const goodsKind = rng.pick(['drawn', 'fire', 'both'] as const);
    const regularKind = rng.pick(['outstanding', 'depreciation', 'prepaid'] as const);
    const basis: Basis = rng.pick(['before', 'after'] as const);
    // On the "after" basis 5% is left out: its wrong figures are hardly ever whole rupees.
    const rate = basis === 'after' ? rng.pick([10, 10, 20, 25]) : rng.pick([5, 10]);
    const monthlySalary = amount(rng, 4000, 9000, 500);
    const salaries = monthlySalary * (regularKind === 'outstanding' ? 11 : 12);
    const insurance = draw(rng, INSURANCE);
    const d = drawDepreciation(rng, asset, false, 500);
    const x = amount(rng, 2000, 6000, 500);
    const regular =
      regularKind === 'outstanding'
        ? outstanding(SALARIES, monthlySalary, salaries, 'for March')
        : regularKind === 'depreciation'
          ? d.adj
          : prepaid(INSURANCE, x, insurance, `Insurance includes ${inr(x)} paid for the next year.`);

    const goods: Adj[] = [];
    if (goodsKind !== 'fire') {
      const g = amount(rng, 4000, 20000, 1000);
      goods.push(goodsDrawn(g, pct(g, rng.pick([120, 125, 140, 150]))));
    }
    let fireCost = 0;
    let claim = 0;
    if (goodsKind !== 'drawn') {
      fireCost = amount(rng, 10000, 40000, 10000);
      const cover = rng.pick(goodsKind === 'both' ? (['none', 'amount'] as const) : (['amount', 'share', 'none'] as const));
      const share = rng.pick([50, 60, 75, 80]);
      claim = cover === 'none' ? 0 : pct(fireCost, share);
      const said =
        cover === 'none'
          ? 'they were not insured.'
          : cover === 'amount'
            ? `the insurer admitted a claim of ${inr(claim)}, not yet received.`
            : `the insurer admitted a claim for ${share}% of their cost, not yet received.`;
      goods.push(fireLoss(fireCost, claim, said));
    }
    const others = rng.shuffle([...goods, regular]);

    // The profit before commission is fixed first, as a multiple of a unit that makes the commission a whole number
    // of rupees on either basis: so is the figure a student gets by taking the wrong basis.
    const unit = (R(1000) * (100 + rate)) / rate;
    const p = unit * rng.int(Math.ceil(R(60000) / unit), Math.floor(R(130000) / unit));
    // With two adjustments for goods and insurance in the list, the second small expense is left out to save a line.
    const crowded = goodsKind === 'both' && regularKind === 'prepaid';
    const t = buildTb(rng, {
      fixed: [[asset.id, d.balance]],
      directs: [[direct.id, draw(rng, direct)]],
      indirect: [[SALARIES.id, salaries], ...(crowded ? [] : [[second.id, draw(rng, second)] as Item]), ...(regularKind === 'prepaid' ? [[INSURANCE.id, insurance] as Item] : [])],
      debtors: amount(rng, 60000, 180000, 5000),
      creditors: amount(rng, 40000, 100000, 5000),
      drawings: amount(rng, 24000, 60000, 6000),
      profit: p - sumOf(others.map((a) => a.np)),
    });
    if (!t) return null;
    const leadLine = lead(rng, who);
    const pre = scenario(who, leadLine, t, others);
    const comm = managerCommission(rate, basis, p);
    const core = scenario(who, leadLine, t, [...others, comm]);
    if (!pre || !core || pre.fa.np !== p) return null;
    return { ...core, pre, comm, goodsEntry: rng.pick(goods), fireCost, claim };
  },
  parts: [
    adjustingEntry((s) => s.goodsEntry),
    grossProfit(),
    {
      kind: 'numeric',
      make: (s) => num("What is the net profit before charging the manager's commission?", s.pre.fa.np, npErrors(s.pre), [...tradingSteps(s.pre), ...plSteps(s.pre, 'Net profit before commission')], PROFIT_HINTS),
      // The net profit worked by hand has the commission in it: take it out again.
      check: (h, s) => h.np - s.comm.np,
    },
    {
      kind: 'numeric',
      make: (s) => {
        if (!s.comm.commission) return null;
        const { rate, basis, p } = s.comm.commission;
        const c = -s.comm.np;
        const unadjusted = p - sumOf(s.pre.adjs.map((a) => a.np));
        return num(
          "What is the manager's commission for the year?",
          c,
          [
            ...s.comm.npSlips.map((sl) => ({ value: c - sl.by, why: sl.why })),
            basis === 'after'
              ? { value: (p * rate) / (100 - rate), why: `Divided by ${100 - rate} instead of ${100 + rate}: when the profit after commission is 100 the commission is ${rate}, so the profit before it is ${100 + rate}.` }
              : null,
            basis === 'after'
              ? {
                  value: ((p - (p * rate) / 100) * rate) / 100,
                  why: `Took ${rate}% of the profit before commission, deducted it, and took ${rate}% of what was left; the commission must be ${rate}% of the profit that finally remains.`,
                }
              : null,
            // A figure that is not a whole number of rupees is not shown (see `num`).
            { value: commissionOn(s.fa.gp, rate, basis), why: 'Worked out the commission on the gross profit instead of the net profit.' },
            { value: commissionOn(unadjusted, rate, basis), why: 'Worked out the commission before making the other adjustments.' },
            { value: p - c, why: 'Gave the profit left after the commission, not the commission.' },
          ],
          [
            profitLine(s.pre, 'Net profit before commission'),
            ...s.comm.workP,
            basis === 'after' ? `Check: ${rate}% of the profit after commission, ${inr(p - c)}, is ${inr(c)}.` : `The commission is on the profit before charging it, so no further step is needed.`,
          ],
          [
            'On which profit is the commission reckoned: the one before charging it, or the one left after it?',
            'Before: profit × rate/100. After: profit before commission × rate/(100 + rate).',
          ],
        );
      },
      // Worked from the profit that is left: on the "after" basis the commission must be the stated rate of it.
      check: (h, s) => {
        if (!s.comm.commission) return -1;
        const { rate, basis } = s.comm.commission;
        const p = h.np - s.comm.np;
        if (basis === 'before') return (p * rate) / 100;
        const left = (p * 100) / (100 + rate);
        return (left * rate) / 100 === p - left ? p - left : -1;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        if (s.claim) {
          return {
            prompt: `The insurer has admitted the claim but has not paid it by 31 March. How is the claim of ${inr(s.claim)} shown in the final accounts?`,
            correct: `As a current asset in the balance sheet: insurance claim receivable ${inr(s.claim)}`,
            distractors: [
              { text: `As an income credited to the Profit and Loss Account: ${inr(s.claim)}`, why: 'Treated the claim as an income; it only reduces the loss, and until it is received it is an asset.' },
              { text: `As a current liability in the balance sheet: ${inr(s.claim)}`, why: 'Took money due from the insurer as money the business owes.' },
              { text: `As a current asset in the balance sheet: insurance claim receivable ${inr(s.fireCost)}`, why: 'Showed the whole cost of the goods as receivable; only the amount admitted can be claimed.' },
              { text: 'It is not shown until the money is received', why: 'Waited for the cash: the claim is admitted, so it is due to the business on 31 March.' },
              { text: `Added to the closing stock in the Trading Account: ${inr(s.claim)}`, why: 'Treated the claim as goods still in hand; the goods are gone, and what is due is money.' },
            ],
            explanation: `The insurer owes ${inr(s.claim)} on 31 March, so it is a current asset, Insurance Claim Receivable. Only the rest of the cost, ${inr(s.fireCost - s.claim)}, is charged as a loss in the Profit and Loss Account.`,
          };
        }
        if (!s.comm.two) return null;
        return {
          prompt: "The manager's commission is unpaid on 31 March. How is it shown in the final accounts?",
          correct: s.comm.two.right,
          distractors: s.comm.two.wrong.map(([text, why]) => ({ text, why })),
          explanation: s.comm.two.because,
        };
      },
    },
    {
      kind: 'numeric',
      make: (s) =>
        num("What is the net profit for the year, after the manager's commission?", s.fa.np, npErrors(s), [...tradingSteps(s), ...plSteps(s)], [
          'Work out the net profit before the commission first, with every other adjustment made.',
          'The commission is an expense: net profit = profit before commission − commission.',
        ]),
      check: (h) => h.np,
    },
    balanceSheetTotal(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 6. The full problem: five or six adjustments drawn from all of the above (complex)
// ---------------------------------------------------------------------------------------------------------------

interface Full extends Core, DebtFacts {
  entryOf: Adj;
  twoOf: Adj;
  expenseOf: Adj;
}

// Version 2: interest on drawings of a sole proprietor, beyond the Class 11 syllabus, is no longer one of the extras.
const fullProblem = define<Full>({
  id: 'case-fa-full-problem',
  version: 2,
  difficulty: 'complex',
  title: 'The long question: five or six adjustments',
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const asset = rng.pick(ASSETS);
    const expenseKinds: readonly string[] = rng.pick([['out'], ['out'], ['pre'], ['out', 'pre']]);
    const extras = rng.shuffle(['ioc', 'income', 'drawn', 'commission']);
    // The closing stock, depreciation and the debtors (bad debts and the provision, on one line) are always there;
    // one or two expenses and one or two more make five or six numbered adjustments.
    const wanted = Math.max(1, rng.pick([5, 6]) - expenseKinds.length - 3);
    // The case may print 18 lines: its opening line, ten balances every case has, and the numbered adjustments. What
    // is left is the room for the balances only some cases have, each one more line of the trial balance.
    let room = MAX_LINES - 11 - (3 + expenseKinds.length + wanted);
    if (expenseKinds.includes('pre')) room--;
    // The room goes first to a provision already in the books (what the long question most often carries), then to
    // the balances the other adjustments need, and last to salaries that no adjustment touches.
    const debts = drawDebts(rng, 1000, { tbBad: false, old: room > 0, joined: true });
    if (!debts) return null;
    if (debts.old) room--;
    let showSalaries = false;
    const chosen = new Set<string>();
    for (const e of extras) {
      if (chosen.size === wanted) break;
      // An income needs its balance, and a manager on commission is also paid a salary.
      if (e === 'income' || e === 'commission') {
        if (room <= 0) continue;
        room--;
        if (e === 'commission') showSalaries = true;
      }
      chosen.add(e);
    }
    // The unpaid expense is salaries only when their balance is there or there is room for it: otherwise wages.
    let outHead = rng.pick([WAGES, SALARIES]);
    if (expenseKinds.includes('out') && outHead === SALARIES && !showSalaries) {
      if (room > 0) {
        room--;
        showSalaries = true;
      } else outHead = WAGES;
    }
    if (room > 0) showSalaries = true;

    const monthlySalary = amount(rng, 4000, 9000, 1000);
    const salaries = monthlySalary * (expenseKinds.includes('out') && outHead === SALARIES ? 11 : 12);
    const wages = draw(rng, WAGES);
    const insurance = amount(rng, 14000, 30000, 1000);
    const unpaidWages = amount(rng, 2000, 6000, 1000);
    const paidAhead = amount(rng, 2000, 6000, 1000);
    const out = !expenseKinds.includes('out')
      ? null
      : outHead === WAGES
        ? outstanding(WAGES, unpaidWages, wages, 'for the last week of March')
        : outstanding(SALARIES, monthlySalary, salaries, 'for March');
    const pre = expenseKinds.includes('pre') ? prepaid(INSURANCE, paidAhead, insurance, `Insurance includes ${inr(paidAhead)} paid for the next year.`) : null;
    const d = drawDepreciation(rng, asset, rng.next() < 0.4, 1000);
    const drawings = amount(rng, 24000, 60000, 6000);

    const accruedIncome = rng.next() < 0.5;
    const commissionRecd = draw(rng, COMMISSION);
    const commissionDue = amount(rng, 1000, 4000, 1000);
    const monthlyRent = amount(rng, 2000, 5000, 1000);
    const income = !chosen.has('income')
      ? null
      : accruedIncome
        ? accrued(COMMISSION, commissionDue, commissionRecd, `Commission of ${inr(commissionDue)} earned in March has not yet been received.`)
        : advance(RENT_RECEIVED, monthlyRent, monthlyRent * 13, `Rent received includes ${inr(monthlyRent)} for April.`);
    const incomes: Item[] = !income ? [] : accruedIncome ? [[COMMISSION.id, commissionRecd]] : [[RENT_RECEIVED.id, monthlyRent * 13]];

    const g = amount(rng, 3000, 12000, 1000);
    const drawn = chosen.has('drawn') ? goodsDrawn(g, pct(g, rng.pick([120, 125, 150]))) : null;
    const j = amount(rng, 1000, 4000, 1000);
    const iod = chosen.has('iod') ? interestOnDrawings(j, `Charge interest on drawings, ${inr(j)}.`, [`Interest on drawings = ${inr(j)}, an income of the business.`]) : null;

    const known = [out, pre, d.adj, debts.write, debts.prov, iod, income, drawn].filter((a): a is Adj => a !== null);
    const t = buildTb(rng, {
      fixed: [[asset.id, d.balance]],
      directs: [[WAGES.id, wages]],
      indirect: [...(showSalaries ? [[SALARIES.id, salaries] as Item] : []), ...(pre ? [[INSURANCE.id, insurance] as Item] : [])],
      badDebts: debts.tbBad,
      incomes,
      debtors: debts.debtors,
      provision: debts.old,
      creditors: amount(rng, 40000, 100000, 5000),
      drawings,
      // The net profit wanted before interest on capital and the manager's commission, less what the other
      // adjustments do to it.
      profit: amount(rng, 60000, 140000, 1000) - sumOf(known.map((a) => a.np)),
    });
    if (!t) return null;
    const ioc = chosen.has('ioc') ? interestOnCapital(rng.pick([6, 8, 10]), t.capital) : null;

    // The two adjustments on debtors stay together and in order; the rest come in any order, the commission last.
    const blocks: Adj[][] = [[out], [pre], [d.adj], [debts.write, debts.prov], [ioc], [iod], [income], [drawn]].map((b) => b.filter((a): a is Adj => a !== null)).filter((b) => b.length > 0);
    const others = rng.shuffle(blocks).flat();
    const leadLine = lead(rng, who);
    const before = scenario(who, leadLine, t, others);
    if (!before) return null;
    let adjs = others;
    if (chosen.has('commission')) {
      const p = before.fa.np;
      if (p < R(60000) || p % R(1000) !== 0) return null;
      adjs = [...others, managerCommission(10, 'before', p)];
    }
    const core = scenario(who, leadLine, t, adjs);
    if (!core || core.fa.np < R(30000)) return null;
    const entryOf = rng.pick(others.filter((a) => a.entry));
    const expenseOf = out && pre ? rng.pick([out, pre]) : (out ?? pre);
    if (!expenseOf) return null;
    const { rate, good, further, old, tbBad } = debts;
    return { ...core, rate, good, further, old, tbBad, entryOf, twoOf: rng.pick(adjs.filter((a) => a.two && a !== entryOf)), expenseOf };
  },
  parts: [
    adjustingEntry((s) => s.entryOf),
    twoEffects((s) => s.twoOf),
    grossProfit(),
    adjustedFigure((s) => s.expenseOf),
    doubtfulCharge(),
    netProfit(),
    closingCapital(),
    balanceSheetTotal(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// 7. A lean year: is the result a profit or a loss? (medium)
// ---------------------------------------------------------------------------------------------------------------

interface Lean extends Core {
  entryOf: Adj;
  /** The net profit the trial balance and the closing stock alone would show (before the other adjustments). */
  unadjusted: number;
}

const leanYear = define<Lean>({
  id: 'case-fa-lean-year',
  difficulty: 'medium',
  title: 'A lean year: profit or loss?',
  setup: (rng) => {
    const who = rng.pick(OWNERS);
    const direct = rng.pick([WAGES, CARRIAGE_IN]);
    const asset = rng.pick(ASSETS);
    const fourth = rng.pick([ADVERTISEMENT, ELECTRICITY, CARRIAGE_OUT, GENERAL, TELEPHONE]);
    const income = rng.next() < 0.4 ? rng.pick([COMMISSION, DISCOUNT_RECEIVED]) : null;
    const kinds = rng.shuffle(['outstanding', 'depreciation', 'badDebts', 'prepaid']).slice(0, 2);
    const outHead = rng.pick([RENT, SALARIES]);
    const unpaid = (h: Head) => kinds.includes('outstanding') && outHead === h;
    const monthlySalary = amount(rng, 5000, 9000, 500);
    const monthlyRent = amount(rng, 3000, 6000, 500);
    const salaries = monthlySalary * (unpaid(SALARIES) ? 11 : 12);
    const rent = monthlyRent * (unpaid(RENT) ? 11 : 12);
    const insurance = draw(rng, INSURANCE);
    const d = drawDepreciation(rng, asset, false, 500);
    const further = amount(rng, 2000, 9000, 500);
    const x = amount(rng, 2000, 6000, 500);
    const made: Record<string, Adj> = {
      outstanding: unpaid(RENT) ? outstanding(RENT, monthlyRent, rent, 'for March') : outstanding(SALARIES, monthlySalary, salaries, 'for March'),
      depreciation: d.adj,
      badDebts: badDebts(further, `Write off further bad debts of ${inr(further)}.`, 0, 0, true),
      prepaid: prepaid(INSURANCE, x, insurance, `Insurance includes ${inr(x)} paid for the next year.`),
    };
    const adjs = kinds.map((k) => made[k]);
    // Most years of this case end in a loss; some in a small profit, so the result has to be worked out.
    const result = rng.next() < 0.7 ? -amount(rng, 8000, 60000, 1000) : amount(rng, 6000, 30000, 1000);
    const unadjusted = result - sumOf(adjs.map((a) => a.np));
    const t = buildTb(rng, {
      fixed: [[asset.id, d.balance]],
      directs: [[direct.id, draw(rng, direct)]],
      // With insurance and an income in the list, the small fourth expense is left out to save a line.
      indirect: [
        [SALARIES.id, salaries],
        [RENT.id, rent],
        ...(kinds.includes('prepaid') && income ? [] : [[fourth.id, draw(rng, fourth)] as Item]),
        ...(kinds.includes('prepaid') ? [[INSURANCE.id, insurance] as Item] : []),
      ],
      incomes: income ? [[income.id, draw(rng, income)]] : [],
      debtors: amount(rng, 60000, 160000, 5000),
      creditors: amount(rng, 40000, 120000, 5000),
      drawings: amount(rng, 18000, 48000, 6000),
      profit: unadjusted,
    });
    if (!t) return null;
    const core = scenario(who, lead(rng, who), t, adjs);
    if (!core || core.fa.np !== result || core.fa.capital < R(100000)) return null;
    return { ...core, entryOf: rng.pick(adjs), unadjusted };
  },
  parts: [
    adjustingEntry((s) => s.entryOf),
    grossProfit(),
    {
      kind: 'numeric',
      make: (s) => {
        const e = s.fa.expenses;
        const b = (id: string) => tb(s.books, id);
        return num(
          'What is the total of the expenses debited to the Profit and Loss Account, after the adjustments?',
          e,
          [
            // Without an adjustment the total differs by what the adjustment does to the profit.
            ...s.adjs.map((a) => ({ value: e + a.np, why: left(s, a) })),
            ...s.adjs.flatMap((a) => (a.flip ? [{ value: e + 2 * a.np, why: a.flip }] : [])),
            ...DIRECT_IDS.filter((id) => b(id)).map((id) => ({ value: e + b(id), why: `Included ${nm(id)}, a direct expense of the Trading Account.` })),
            { value: e + tb(s.tb, 'drawings'), why: 'Included the drawings; they are not an expense of the business.' },
            { value: e + sumOf(s.adjs.map((a) => a.np)), why: 'Added up the trial balance figures, without the adjustments.' },
          ],
          [...s.adjs.flatMap((a) => a.workP), plTotals(s)[0]],
        );
      },
      // The other way round: what the gross profit and the other incomes exceed the result by.
      check: (h) => h.gp + h.incomes - h.np,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const loss = s.fa.np < 0;
        // What stands against the expenses: the other incomes are named only when the case has some.
        const credit = s.fa.incomes ? 'the gross profit and the other incomes' : 'the gross profit';
        const are = s.fa.incomes ? 'are' : 'is';
        const gross = { text: 'A gross loss: the cost of goods sold is more than the sales', why: 'Mixed up the two accounts: the Trading Account shows a gross profit, and the result asked for is that of the Profit and Loss Account.' };
        const neither = { text: 'Neither a profit nor a loss: the two sides are equal', why: 'Took the two sides as equal; they differ, so there is a result to carry to the capital account.' };
        return loss
          ? {
              prompt: 'What does the Profit and Loss Account show for the year?',
              correct: `A net loss: the expenses are more than ${credit}`,
              distractors: [
                {
                  text: `A net profit: ${credit} ${are} more than the expenses`,
                  why: s.unadjusted > 0 ? 'Compared the figures of the trial balance only; the adjustments turn the small profit into a loss.' : 'Read the account the wrong way round, or left out some of the expenses on the debit side.',
                },
                { text: 'A net profit: the sales are more than the purchases', why: 'Looked only at sales and purchases; the result depends on every expense and income of the year.' },
                gross,
                neither,
              ],
              explanation: `${profitLine(s)} The debit side of the Profit and Loss Account is the heavier one, so the result is a net loss.`,
            }
          : {
              prompt: 'What does the Profit and Loss Account show for the year?',
              correct: `A net profit: ${credit} ${are} more than the expenses`,
              distractors: [
                {
                  text: `A net loss: the expenses are more than ${credit}`,
                  why: s.unadjusted < 0 ? 'Compared the figures of the trial balance only; the adjustments turn the small loss into a profit.' : 'Overstated the expenses, for example by adding the drawings or the direct expense to them.',
                },
                { text: 'A net loss: the drawings are more than the profit', why: 'Brought the drawings into the Profit and Loss Account; they reduce the capital, not the profit.' },
                gross,
                neither,
              ],
              explanation: `${profitLine(s)} The credit side of the Profit and Loss Account is the heavier one, so the result is a net profit.`,
            };
      },
    },
    {
      kind: 'numeric',
      make: (s) => {
        const { np, gp, expenses, incomes } = s.fa;
        return num(
          'What is the amount of the net profit or net loss for the year?',
          Math.abs(np),
          [
            ...npSlipsOf(s).map((sl) => ({ value: Math.abs(np + sl.by), why: sl.why })),
            { value: gp + expenses + incomes, why: 'Added the expenses to the gross profit instead of finding the difference.' },
            { value: gp, why: 'Gave the gross profit, the result of the Trading Account.' },
            { value: expenses, why: 'Gave the total of the expenses, not the difference between the two sides.' },
          ],
          [...tradingSteps(s), ...plSteps(s)],
        );
      },
      check: (h) => Math.abs(h.np),
    },
    {
      kind: 'journal',
      make: (s) => {
        const v = Math.abs(s.fa.np);
        return {
          prompt: 'Pass the closing entry that transfers the result of the Profit and Loss Account to the capital account.',
          lines: s.fa.np < 0 ? [dr('capital', v), cr('profitAndLoss', v)] : [dr('profitAndLoss', v), cr('capital', v)],
          explanation:
            s.fa.np < 0
              ? [`The Profit and Loss Account shows a net loss of ${inr(v)}, a debit balance: Profit and Loss A/c is credited to close it.`, 'The loss falls on the proprietor and reduces the capital: Capital A/c is debited.']
              : [`The Profit and Loss Account shows a net profit of ${inr(v)}, a credit balance: Profit and Loss A/c is debited to close it.`, 'The profit belongs to the proprietor and is added to the capital: Capital A/c is credited.'],
          distractorAccounts: ['drawings', 'trading'],
        };
      },
    },
    closingCapital(),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// A chained case: the long question of the examination as it is set. One trial balance that agrees, the closing stock
// beside it and no other adjustment; the student prepares the Trading Account, then the Profit and Loss Account, then
// the Balance Sheet. The three statements are the formats of the Final Accounts topic (`FA_CHAIN` in
// `templates/final-accounts.ts`): the same rows, wording and working, made here from one set of books. The case text
// gives neither the gross profit nor the net profit: each is the closing row of the part before, which the student
// has just prepared and, in a level, seen marked. Each part is checked by working it out again from the printed case
// alone, the Balance Sheet from both of its sides.
// ---------------------------------------------------------------------------------------------------------------

interface Chain {
  books: ChainBooks;
  /** The order the Balance Sheet is asked in. */
  order: ChainOrder;
}

const chainTradingPlBs = caseTemplate<Chain>({
  id: 'case-fa-chain-trading-pl-bs',
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Trading Account, Profit and Loss Account and Balance Sheet',
  setup: (rng) => {
    // What is owed beside the capital and the creditors, and what is owned beside the usual assets, change with the
    // seed, and so do the returns, the direct expenses and the other incomes. A business with an overdraft keeps
    // some cash in hand.
    const owed = rng.pick([['loan'], ['billsPayable'], ['overdraft'], ['loan', 'billsPayable'], []]);
    const owned = rng.pick([['billsReceivable'], ['cash'], ['billsReceivable', 'cash'], []]);
    const overdraft = owed.includes('overdraft');
    // The whole trial balance is the case, so it is kept to what three statements need: no more than 21 balances.
    const full = owed.length + owned.length > 2;
    const books = FA_CHAIN.books(rng, {
      fixed: full ? 1 : rng.pick([1, 2]),
      directs: rng.pick([1, 2]),
      indirect: full ? 3 : rng.pick([3, 4]),
      incomes: rng.pick([1, 1, 2]),
      returns: rng.pick(['none', 'purchases', 'sales', 'both'] as const),
      loan: owed.includes('loan'),
      billsPayable: owed.includes('billsPayable'),
      billsReceivable: owned.includes('billsReceivable'),
      cash: overdraft || owned.includes('cash'),
      overdraft,
    });
    return books && { books, order: rng.pick<ChainOrder>(['liquidity', 'permanence']) };
  },
  context: (s) => FA_CHAIN.caseText(s.books),
  parts: [
    { kind: 'account', make: (s) => FA_CHAIN.trading(s.books), verify: FA_CHAIN.tradingHolds },
    { kind: 'account', make: (s) => FA_CHAIN.profitAndLoss(s.books), verify: FA_CHAIN.profitAndLossHolds },
    { kind: 'account', make: (s) => FA_CHAIN.balanceSheet(s.books, s.order), verify: FA_CHAIN.balanceSheetHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained cases with adjustments: the long question as an examiner sets it. One trial balance that agrees, the closing
// stock and a short numbered list of adjustments; the student prepares the Trading Account, then the Profit and Loss
// Account from the gross profit of the Trading Account, then the Balance Sheet with the net profit (or the net loss)
// of the Profit and Loss Account. The case text prints neither result.
//
// The adjustments with their wording and entries, the trial balance and the row of an account after its adjustments
// are those of the formats of the adjustments topic (`FAA_CHAIN` in `templates/final-accounts-adjustments.ts`), under
// the conventions fixed there, each stated in the case text: closing stock is outside the trial balance; goods taken
// by the proprietor, given away or lost are credited to Purchases A/c at cost; the provision for doubtful debts is a
// percentage of the debtors left after the further bad debts, and bad debts and the change in the provision are one
// item; depreciation is a rate on the balance shown, for the full year unless a date of purchase is given, written off
// the asset and shown asset by asset; an unpaid manager's commission is an outstanding expense, and its basis is
// stated. What the formats never needed is added here: goods taken, given away or burnt and the manager's commission
// followed into the Profit and Loss Account and the Balance Sheet, and a year that ends in a net loss.
//
// The books are made once in `setup` (the adjusting entries posted on top of the trial balance), and every row of the
// three statements is read from them, so the parts cannot disagree. Each `verify` goes the other way: it reads the
// trial balance back from the printed case, reads every adjustment from its printed words by the rule a student would
// apply, builds each row again, and for the Balance Sheet totals both sides.
// ---------------------------------------------------------------------------------------------------------------

const F = FAA_CHAIN;
const H = F.heads;
const { gpCd: GP_CD, gpBd: GP_BD, netProfit: NET_PROFIT, netLoss: NET_LOSS } = F.labels;
const GL_CD = 'Gross Loss c/d';
const NO_CAPITAL = 'No capital was brought in during the year.';
/** Said when a case charges interest on the drawings and also has goods taken by the proprietor: the interest is on the drawings of the trial balance. */
const NO_INTEREST_ON_GOODS = 'No interest is charged on the goods taken by the proprietor.';
const GOODS_TAKEN = 'Goods taken by the proprietor';
const INTEREST_ON_DRAWINGS = 'Interest on Drawings';
const ORDERS: readonly ChainOrder[] = ['liquidity', 'permanence'];
/** The most balances a trial balance of these cases lists: the three statements use every one of them. */
const MAX_BALANCES = 18;
/** The indirect expense students take for the direct one beside it. */
const TWIN: Record<string, string> = { wages: 'salaries', carriageInwards: 'carriageOutwards' };

/**
 * Two adjustments are worded more shortly here than in the formats, because a case is read on a phone under a whole
 * trial balance: the debtors ("..., then create a provision for doubtful debts at 5% of the remaining debtors. Show
 * both as one item, Bad Debts.") and depreciation with an item bought during the year ("Depreciate at 20% p.a., the
 * machine from that date only; write it off the asset."). `full` and `short` word an adjustment for a case; `printed`
 * and `back` give a line of a printed case back in the words of the formats, so that their reading
 * (`F.readAdjustments`) works it out from what the student was shown.
 */
const SHORT_WORDS: readonly { full: RegExp; short: string; printed: RegExp; back: string }[] = [
  {
    full: /^(Write off further bad debts of ₹[\d,]+)\. Then ((?:maintain the|create a) provision for doubtful debts at \d+% of the remaining debtors\.) Show bad debts and the change in the provision as one item, Bad Debts\.$/,
    short: '$1, then $2 Show both as one item, Bad Debts.',
    printed: /^(\(\d+\) Write off further bad debts of ₹[\d,]+), then ((?:maintain the|create a) provision for doubtful debts at \d+% of the remaining debtors\.) Show both as one item, Bad Debts\.$/,
    back: '$1. Then $2 Show bad debts and the change in the provision as one item, Bad Debts.',
  },
  {
    full: /^([A-Z][a-z ]+? includes? a ([a-z]+) bought for ₹[\d,]+ on 1 [A-Z][a-z]+\. Depreciate at \d+% p\.a\.) on the balance shown \(the \2 from that date only\); write it off the asset\.$/,
    short: '$1, the $2 from that date only; write it off the asset.',
    printed: /^(\(\d+\) [A-Z][a-z ]+? includes? a ([a-z]+) bought for ₹[\d,]+ on 1 [A-Z][a-z]+\. Depreciate at \d+% p\.a\.), the \2 from that date only; write it off the asset\.$/,
    back: '$1 on the balance shown (the $2 from that date only); write it off the asset.',
  },
];
/** An adjustment in the words of a case. */
const shortly = (a: FaaAdj): FaaAdj => SHORT_WORDS.reduce((x, w) => (w.full.test(x.text) ? { ...x, text: x.text.replace(w.full, w.short) } : x), a);
/** A printed case with those two adjustments back in the words of the formats. */
const inFull = (data: string): string =>
  data
    .split('\n')
    .map((line) => SHORT_WORDS.reduce((l, w) => l.replace(w.printed, w.back), line))
    .join('\n');

/** Goods the proprietor took: beyond the Trading Account they are drawings, deducted from the capital. */
function takenByProprietor(g: number, price: number): FaaAdj {
  return {
    ...F.goodsDrawn(g, price),
    capital: { add: false, name: GOODS_TAKEN, amount: g },
    pl: `Not an item of this account: the goods taken by the proprietor left purchases in the Trading Account at their cost, ${inr(g)}, and are drawings in the Balance Sheet.`,
    bs: `The goods costing ${inr(g)} taken by the proprietor are drawings, like cash taken out: they are deducted from the capital.`,
  };
}

/** Goods given away, charged at cost as advertisement or charity. `paid` is that expense in the trial balance (it may be nothing). */
function givenAway(g: number, to: 'samples' | 'charity', paid: number): FaaAdj {
  const base = F.goodsGiven(g, to);
  const id = to === 'samples' ? 'advertisement' : 'charity';
  const how = to === 'samples' ? 'as free samples' : 'to charity';
  return {
    ...base,
    notes: [...base.notes, [id, `Add: Goods given ${how} ${inr(g)}`]],
    pl: paid
      ? `The goods given ${how} are an expense at their cost: ${F.name(id)} = ${inr(paid)} + ${inr(g)} = ${inr(paid + g)}, on the debit side.`
      : `The goods given ${how} are an expense at their cost, ${inr(g)}: "To ${F.name(id)}" on the debit side.`,
    bs: `Nothing is left for the Balance Sheet: the goods given ${how} went out of purchases and into an expense, and both were closed to the profit.`,
  };
}

/** Goods lost by fire: the part the insurer does not bear is a loss, and the claim admitted (`share` percent of the cost, when the case says so) is an asset. */
function burnt(g: number, claim: number, cover: string, share = 0): FaaAdj {
  const base = F.goodsBurnt(g, claim, cover);
  if (!claim) {
    return {
      ...base,
      pl: `Loss by fire = ${inr(g)}, the whole cost of the goods, for nothing can be claimed. It is a loss of the year, on the debit side, and no part of the cost of the goods sold.`,
      bs: 'Nothing is left for the Balance Sheet: the goods were not insured, so their whole cost was charged as a loss.',
      bsSlips: ['Loss by Fire'],
    };
  }
  const admitted = share ? `The claim admitted = ${inr(g)} × ${share}% = ${inr(claim)}. ` : '';
  return {
    ...base,
    notes: [...base.notes, ['lossByFire', `Add: Cost of the goods lost ${inr(g)}`], ['lossByFire', `Less: Insurance claim admitted ${inr(claim)}`]],
    position: { side: 'A', label: 'Insurance Claim Receivable', amount: claim },
    pl: `${admitted}Loss by fire = cost of the goods ${inr(g)} − claim ${inr(claim)} = ${inr(g - claim)}: only what the insurer does not bear is a loss, on the debit side.`,
    bs: `${admitted}The claim of ${inr(claim)} is admitted but not yet received, so the insurer owes it: an asset, Insurance Claim Receivable.`,
    bsSlips: ['Loss by Fire'],
  };
}

/** The manager's commission, unpaid: beyond the Profit and Loss Account it is an outstanding expense. */
function unpaidCommission(rate: number, basis: FaaBasis, p: number): FaaAdj {
  const base = F.commission(rate, basis, p);
  // The Balance Sheet starts from the net profit, and the commission follows from that figure and the rate alone.
  const worked =
    basis === 'after'
      ? `${rate}% of the net profit after charging it, ${inr(p - base.liab)} × ${rate}% = ${inr(base.liab)}`
      : `${rate}% of the profit before charging it, ${inr(p)} × ${rate}% = ${inr(base.liab)}, which leaves the net profit of ${inr(p - base.liab)}`;
  return {
    ...base,
    position: { side: 'L', label: 'Outstanding Commission', amount: base.liab },
    bs: `The manager's commission, worked out in the Profit and Loss Account, is ${worked}. It is unpaid on 31 March: a liability, Outstanding Commission.`,
    // The expense entered again as a row of the Balance Sheet, and the liability under the name of an asset.
    bsSlips: ["Manager's Commission", 'Accrued Commission'],
  };
}

/**
 * The books of a chained case, written up in an order drawn from the seed: the trial balance, and the same books
 * with the adjusting entries posted. Null for an adjustment that is not a whole number of rupees, or for a result
 * that would not be believable: a year of profit ends in at least ₹20,000 and no more than two-fifths of the
 * capital, a year of loss in a gross profit and a net loss of no more than a quarter of the capital.
 */
function chainBooks(rng: Rng, firm: string, t: FaaTb, made: FaaAdj[], result: 'profit' | 'loss' = 'profit'): FaaBooks | null {
  const adjs = made.map(shortly);
  if (adjs.some((a) => a.lines.some((l) => !clean(l.amount)))) return null;
  // Each adjustment must do to the books exactly what its author says it does.
  for (const a of adjs) {
    const e = F.effect(a.lines);
    if (e.gp !== a.gp || e.exp !== a.exp || e.inc !== a.inc || e.cap !== a.cap || e.liab !== a.liab) throw new Error(`chained final accounts: the entry of "${a.text}" does not have its stated effect`);
  }
  if (t.bank < R(5000)) return null;
  const ledger = post([rng.shuffle([cr('capital', t.capital), ...t.others, cr('sales', t.sales), dr('bank', t.bank)])]);
  const c: FaaBooks = { firm, tb: ledger, books: post(adjs.map((a) => a.lines), ledger), cs: t.cs, adjs };
  const { gross, net } = F.figures(c.books, c.cs);
  if (gross <= 0) return null;
  return (result === 'profit' ? net >= R(20000) && net * 100 <= t.capital * 40 : net <= -R(5000) && -net * 4 <= t.capital) ? c : null;
}

/** One chained case: its books and the order its Balance Sheet is asked in. */
interface Adjusted {
  c: FaaBooks;
  order: ChainOrder;
}

/**
 * The case text: the business and the day, the trial balance, the numbered adjustments, and a last line that settles
 * what the interest on capital and on drawings is reckoned on.
 */
function adjustedText({ c }: Adjusted): string {
  const moved = (name: string): boolean => c.adjs.some((a) => a.capital?.name === name);
  return F.data(c, moved(GOODS_TAKEN) && moved(INTEREST_ON_DRAWINGS) ? `${NO_CAPITAL} ${NO_INTEREST_ON_GOODS}` : NO_CAPITAL);
}
const amountOf = (r: FormatRowParts): number => r.amount ?? 0;
const closingRow = (label: string, value: number): FormatRowParts => ({ label, amount: value, closing: true });

/** The Trading Account after the adjustments that touch it; its closing row is the gross profit. */
function adjustedTrading({ c }: Adjusted): CaseAccountParts {
  const f = F.figures(c.books, c.cs);
  const before = F.figures(c.tb, c.cs);
  const taken = c.adjs.flatMap((a) => a.lines.filter((l) => l.accountId === 'purchases' && l.side === 'Cr').map((l) => l.amount));
  const leftOut = [...before.expenses, ...before.incomes];
  const twins = f.directs.map(([id]) => TWIN[id]);
  const tempting = [...leftOut.filter(([id]) => twins.includes(id)), ...leftOut.filter(([id]) => !twins.includes(id))];
  const here = c.adjs.filter((a) => a.trading);
  const away = [...new Set(c.adjs.filter((a) => !a.trading).map((a) => F.no(c, a)))];
  const netPurchases = f.pur - f.pr;
  const netSales = f.sales - f.sr;
  return {
    task: `Prepare the Trading Account of ${c.firm} for the year ended ${F.date}, after the adjustments; enter each item at its net figure.`,
    title: `Trading Account of ${c.firm} for the year ended ${F.date}`,
    left: drSide([
      F.row(c, 'stock', f.os),
      F.row(c, 'purchases', netPurchases, f.pr ? [`Less: Purchases Return ${inr(f.pr)}`] : []),
      ...f.directs.map(([id, a]) => F.row(c, id, a)),
      closingRow(GP_CD, f.gross),
    ]),
    right: crSide([F.row(c, 'sales', netSales, f.sr ? [`Less: Sales Return ${inr(f.sr)}`] : []), { label: 'Closing Stock', amount: c.cs }]),
    // The account an adjustment sends the goods or the unpaid amount to, an indirect expense offered for the Trading
    // Account, the gross profit brought down where it is carried down, the owner's accounts, a return as a row.
    distractors: [
      ...new Set([
        ...here.flatMap((a) => a.slips),
        ...tempting.slice(0, 3).map(([id]) => F.name(id)),
        GP_BD,
        GL_CD,
        'Drawings',
        'Capital',
        ...(f.pr ? ['Purchases Return'] : []),
        ...(f.sr ? ['Sales Return'] : []),
      ]),
    ],
    explanation: [
      `The debit side takes the cost of the goods: opening stock ${inr(f.os)}, purchases and the direct ${f.directs.length > 1 ? 'expenses' : 'expense'}, ${F.list(F.lower(f.directs))}. The credit side takes the sales and the closing stock of ${inr(c.cs)}, adjustment (1).`,
      ...here.map((a) => `(${F.no(c, a)}) ${a.trading}`),
      ...(away.length > 0
        ? [
            `${away.length > 1 ? 'Adjustments' : 'Adjustment'} ${F.list(away.map((n) => `(${n})`))} ${away.length > 1 ? 'do' : 'does'} not change the cost of the goods or the sales: ${away.length > 1 ? 'they wait' : 'it waits'} for the Profit and Loss Account and the Balance Sheet.`,
          ]
        : []),
      ...(f.pr || taken.length > 0 ? [`Purchases = ${inr(before.pur)}${f.pr ? ` − the return of ${inr(f.pr)}` : ''}${taken.map((x) => ` − ${inr(x)}`).join('')} = ${inr(netPurchases)}.`] : []),
      ...(f.sr ? [`Sales = ${inr(f.sales)} − the return of ${inr(f.sr)} = ${inr(netSales)}.`] : []),
      `${cap(F.list(F.lower(leftOut)))} are indirect items: they wait for the Profit and Loss Account. Capital, drawings, the assets and the liabilities go to the Balance Sheet.`,
      `Debit side = ${F.added([f.os, netPurchases, ...f.directs.map((d) => d[1])])}. Credit side = ${inr(netSales)} + ${inr(c.cs)} = ${inr(f.credit)}.`,
      `The credit side is larger by ${inr(f.gross)}: the gross profit. It is entered on the debit side as "To ${GP_CD}", both sides then total ${inr(f.credit)}, and the Profit and Loss Account starts from it.`,
    ],
    hints: [
      'Take the adjustments one at a time. Does it change the cost of the goods? If it does, which item of the Trading Account does it change, and does it add to it or take away from it?',
      'An unpaid direct expense is added to that expense. Goods that left the business without being sold (taken by the proprietor, given away, lost) are deducted from purchases at cost. The closing stock goes on the credit side, and the difference of the two sides is the gross profit.',
    ],
  };
}

/** What the working says of an adjustment that has no item in the Profit and Loss Account: an unpaid direct expense. */
const NOT_IN_PL = 'Not an item of this account: the unpaid amount was added to a direct expense in the Trading Account, and it is a liability in the Balance Sheet.';

/** The Profit and Loss Account after the adjustments, from the gross profit of the Trading Account; it closes on the net profit or the net loss. */
function adjustedProfitAndLoss({ c }: Adjusted): CaseAccountParts {
  const f = F.figures(c.books, c.cs);
  const directs = F.figures(c.tb, c.cs).directs;
  const plain = [...F.plain(c, f.expenses), ...F.plain(c, f.incomes)];
  // An account whose charge the adjustments set out row by row (the depreciation of each asset) gives those rows.
  const debit = f.expenses.flatMap(([id, a]): FormatRowParts[] => {
    const own = c.adjs.flatMap((x) => (x.own?.account === id ? [x.own] : []));
    if (own.length === 0) return [F.row(c, id, a)];
    if (sumOf(own.map((o) => o.amount)) !== a) throw new Error(`chained final accounts: the rows of ${F.name(id)} do not come to its balance`);
    return own.map((o) => ({ label: o.label, amount: o.amount, ...(o.details ? { details: o.details } : {}) }));
  });
  const credit = f.incomes.map(([id, a]) => F.row(c, id, a));
  const gain = f.net > 0;
  const debitTotal = sumOf(debit.map(amountOf));
  const creditTotal = f.gross + sumOf(credit.map(amountOf));
  const perAsset = c.adjs.filter((a) => a.own).length > 1;
  return {
    task: `Prepare the Profit and Loss Account of ${c.firm} for the year ended ${F.date}, starting from the gross profit of the Trading Account; enter each item at its net figure after the adjustments${perAsset ? ', with depreciation as a row for each asset' : ''}.`,
    title: `Profit and Loss Account of ${c.firm} for the year ended ${F.date}`,
    left: drSide([...debit, ...(gain ? [closingRow(NET_PROFIT, f.net)] : [])]),
    right: crSide([{ label: GP_BD, amount: f.gross }, ...credit, ...(gain ? [] : [closingRow(NET_LOSS, -f.net)])]),
    // The other closing row, the gross profit carried down where it is brought down, a direct expense, the drawings,
    // what an adjustment leaves in the Balance Sheet entered as a row here, the capital and the closing stock.
    distractors: [...new Set([gain ? NET_LOSS : NET_PROFIT, GP_CD, ...directs.map(([id]) => F.name(id)), 'Drawings', ...c.adjs.flatMap((a) => a.slips), 'Capital', 'Closing Stock'])].slice(0, 12),
    explanation: [
      `The gross profit of ${inr(f.gross)} is brought down from the Trading Account to the credit side: "By ${GP_BD}".`,
      ...c.adjs.map((a) => `(${F.no(c, a)}) ${a.pl ?? NOT_IN_PL}`),
      ...(plain.length > 0 ? [`At the trial balance figure: ${F.list(plain)}.`] : []),
      `${cap(F.list(F.lower(directs)))}, the stocks, purchases and sales were used in the Trading Account. Capital, drawings, the assets and the liabilities go to the Balance Sheet.`,
      `Debit side = ${F.added(debit.map(amountOf))}. Credit side = ${F.added([f.gross, ...credit.map(amountOf)])}.`,
      gain
        ? `The credit side is larger by ${inr(f.net)}: the net profit. It is entered on the debit side as "To ${NET_PROFIT}", both sides then total ${inr(creditTotal)}, and it is added to the capital in the Balance Sheet.`
        : `The debit side is larger by ${inr(-f.net)}: the expenses are more than the gross profit${credit.length > 0 ? ' and the other incomes' : ''}, a net loss. It is entered on the credit side as "By ${NET_LOSS}", both sides then total ${inr(debitTotal)}, and it is deducted from the capital in the Balance Sheet.`,
    ],
    hints: [
      'Take the adjustments one at a time. Which item of this account does it change, and does it add to it or take away from it? Is it an expense or an income of the business?',
      'An unpaid expense and an income earned but not received are added; an expense paid for next year and an income received for next year are deducted. Depreciation (a row for each asset), interest on capital, a loss of goods and a commission to the manager are expenses. The difference of the two sides is the net profit, or the net loss on the credit side.',
    ],
  };
}

/** The Balance Sheet after the adjustments, with the result of the Profit and Loss Account inside the capital. */
function adjustedBalanceSheet({ c, order }: Adjusted): CaseAccountParts {
  const f = F.figures(c.books, c.cs);
  const of = (id: string): number => c.books.get(id) ?? 0;
  const capital = -(c.tb.get('capital') ?? 0);
  const drawings = c.tb.get('drawings') ?? 0;
  const closing = -of('capital') + f.net - of('drawings');
  const moved = c.adjs.flatMap((a) => (a.capital ? [a.capital] : []));
  const plus = moved.filter((m) => m.add);
  const minus = moved.filter((m) => !m.add);
  const gain = f.net > 0;
  const placed = (side: 'L' | 'A'): FormatRowParts[] => c.adjs.flatMap((a) => (a.position?.side === side ? [{ label: a.position.label, amount: a.position.amount }] : []));
  // Both sides in the order of permanence; the order of liquidity is the same lists read from the other end. An
  // amount paid ahead never turns into cash, so it stands as the least liquid of the current assets; an income or a
  // claim still to be received is money due, and stands with the debtors.
  const ahead = (r: FormatRowParts): boolean => r.label.startsWith('Prepaid ');
  const assets: FormatRowParts[] = [
    ...F.assets.filter((a) => c.books.has(a.id)).map((a) => F.row(c, a.id, of(a.id))),
    ...placed('A').filter(ahead),
    { label: 'Closing Stock', amount: c.cs },
    F.row(c, F.debtors, of(F.debtors) + of(F.provision)),
    ...placed('A').filter((r) => !ahead(r)),
    { label: 'Cash at Bank', amount: of('bank') },
    ...(c.books.has('cash') ? [{ label: 'Cash in Hand', amount: of('cash') }] : []),
  ];
  const liabilities: FormatRowParts[] = [
    {
      label: 'Capital',
      amount: closing,
      details: [
        `Opening Capital ${inr(capital)}`,
        ...plus.map((m) => `Add: ${m.name} ${inr(m.amount)}`),
        gain ? `Add: Net Profit ${inr(f.net)}` : `Less: Net Loss ${inr(-f.net)}`,
        `Less: Drawings ${inr(drawings)}`,
        ...minus.map((m) => `Less: ${m.name} ${inr(m.amount)}`),
      ],
    },
    { label: 'Sundry Creditors', amount: -of(F.creditors) },
    ...placed('L'),
  ];
  const inOrder = (rows: FormatRowParts[]): FormatRowParts[] => (order === 'permanence' ? rows : [...rows].reverse());
  const total = sumOf(assets.map(amountOf));
  // What is owed and owned at the figure the trial balance gives it: no adjustment is about it.
  const asListed = [
    `sundry creditors ${inr(-of(F.creditors))}`,
    ...(c.adjs.some((a) => a.notes.some(([row]) => row === F.debtors)) ? [] : [`sundry debtors ${inr(of(F.debtors))}`]),
    `cash at bank ${inr(of('bank'))}`,
    ...(c.books.has('cash') ? [`cash in hand ${inr(of('cash'))}`] : []),
  ];
  return {
    task: `Prepare the Balance Sheet of ${c.firm} as at ${F.date} in the order of ${order}, with the net ${gain ? 'profit' : 'loss'} of the Profit and Loss Account; enter each item at its net figure after the adjustments, the capital as one figure.`,
    title: `Balance Sheet of ${c.firm} as at ${F.date}`,
    left: { title: 'Liabilities', rows: inOrder(liabilities) },
    right: { title: 'Assets', rows: inOrder(assets) },
    // What belongs inside another row entered as a row of its own (drawings, the result of the year, the provision,
    // the depreciation), the stock of the wrong day, and an amount carried forward under the name of the opposite kind.
    distractors: [...new Set(['Drawings', gain ? 'Net Profit' : 'Net Loss', 'Opening Stock', ...c.adjs.flatMap((a) => a.bsSlips), 'Bank Overdraft'])].slice(0, 12),
    explanation: [
      ...c.adjs.map((a) => `(${F.no(c, a)}) ${a.bs ?? 'It has no item here.'}`),
      `At the trial balance figure, for no adjustment changes them: ${F.list(asListed)}.`,
      `Capital = ${[`opening capital ${inr(capital)}`, ...plus.map((m) => `${m.name.toLowerCase()} ${inr(m.amount)}`), ...(gain ? [`net profit ${inr(f.net)}`] : [])].join(' + ')}${gain ? '' : ` − net loss ${inr(-f.net)}`} − drawings ${inr(drawings)}${minus.map((m) => ` − ${m.name.toLowerCase()} ${inr(m.amount)}`).join('')} = ${inr(closing)}. The ${gain ? 'profit' : 'loss'} of the year and the drawings are shown inside the capital; neither is a row of its own.`,
      `The closing stock of ${inr(c.cs)} is an asset although it is not in the trial balance. The opening stock is not: it went into the cost of the goods in the Trading Account.`,
      `The expenses and the incomes, with their adjustments, went into the net ${gain ? 'profit' : 'loss'}; none of them is a row here.`,
      order === 'liquidity'
        ? 'Order of liquidity: the assets begin with the one nearest to cash and end with the most lasting; the liabilities begin with the one to be paid soonest and end with the capital.'
        : 'Order of permanence: the assets begin with the most lasting and end with cash; the liabilities begin with the capital and end with the one to be paid soonest.',
      `Liabilities = ${F.added(inOrder(liabilities).map(amountOf))}. Assets = ${F.added(inOrder(assets).map(amountOf))}. Both sides total ${inr(total)}.`,
    ],
    hints: [
      'Every adjustment has a second effect, and it is the one that shows here: something still owed, something still to come, or an asset or the capital at a new figure. Take them one at a time.',
      'Fixed assets less depreciation; debtors less further bad debts and then less the provision; prepaid expenses, accrued income and a claim admitted are assets, outstanding expenses and income received in advance are liabilities; capital plus interest on capital and net profit (or less net loss), less drawings and goods taken.',
    ],
  };
}

// ---- the reading of the printed case: the trial balance by its names, then every adjustment from its words ----

const rupeesIn = (text: string): number => R(Number(text.replace(/,/g, '')));
const totalOf = (want: FaaWant[]): number => sumOf(want.map((w) => w[1]));

/**
 * The three statements worked from the printed case alone. The reading of the formats gives the trial balance and
 * what each adjustment does to a printed balance; goods given away or burnt and the manager's commission are
 * followed here beyond the Trading Account. Null for a case that prints a result of the year, leaves the capital
 * brought in unsettled, or does not give a gross profit.
 */
function workedByHand(data: string) {
  const worded = inFull(data);
  const h = F.read(worded);
  const r = h && F.readAdjustments(worded, h);
  if (!h || !r || h.given || /(gross|net) (profit|loss) of ₹/i.test(data)) return null;
  // The last line settles the capital and, when goods were taken as well, the drawings the interest is charged on.
  const last = data.split('\n').pop() ?? '';
  const goodsAndInterest = /^(?:Adjustments: )?\(\d+\) The proprietor took goods /m.test(data) && r.credit.some(([label]) => label === INTEREST_ON_DRAWINGS);
  if (last !== (goodsAndInterest ? `${NO_CAPITAL} ${NO_INTEREST_ON_GOODS}` : NO_CAPITAL)) return null;
  if (r.brought !== 0 || (r.debts && !r.oneItem) || h.get('Bank A/c') <= 0) return null;
  // Goods given away are charged to an expense at cost; of goods burnt, the claim is an asset and the rest a loss.
  const given = new Map<string, number>();
  let lost = 0;
  let claim = 0;
  for (const line of data.split('\n')) {
    const text = /^(?:Adjustments: )?\(\d+\) (.+)$/.exec(line)?.[1] ?? '';
    const gift = /^Goods costing ₹([\d,]+) were given (away as free samples|to a charitable trust)\./.exec(text);
    if (gift) {
      const to = gift[2].startsWith('away') ? 'Advertisement A/c' : 'Charity A/c';
      given.set(to, (given.get(to) ?? 0) + rupeesIn(gift[1]));
    }
    const fire = /^Goods costing ₹([\d,]+) were lost by fire; (?:they were not insured|the insurer admitted a claim of ₹([\d,]+), not yet received|the insurer admitted a claim for (\d+)% of their cost, not yet received)\./.exec(text);
    if (fire) {
      const cost = rupeesIn(fire[1]);
      lost += cost;
      claim += fire[2] ? rupeesIn(fire[2]) : (cost * Number(fire[3] ?? 0)) / 100;
    }
  }
  const now = (label: string): number => Math.abs(h.get(label)) + (r.change.get(label) ?? 0);
  // The Trading Account: goods credited to Purchases A/c come out of purchases, an unpaid direct expense is added.
  const cost: FaaWant[] = [
    ['Opening Stock', h.get('Opening Stock')],
    ['Purchases', h.get('Purchases A/c') + h.get('Purchases Return A/c') - r.goods],
    ...F.readDirect.filter((l) => h.get(l) !== 0).map((l): FaaWant => [F.plainLabel(l), now(l)]),
  ];
  const sales: FaaWant[] = [['Sales', h.netSales], ['Closing Stock', h.cs]];
  const gross = totalOf(sales) - totalOf(cost);
  if (gross <= 0) return null;
  // The Profit and Loss Account: every other expense and income at its adjusted figure, and the rows the adjustments add.
  const nominal = h.labels.filter((l) => !F.readElsewhere.has(l));
  const debit: FaaWant[] = [
    ...nominal.filter((l) => h.get(l) > 0 && !(r.debts && l === 'Bad Debts A/c')).map((l): FaaWant => [F.plainLabel(l), now(l) + (given.get(l) ?? 0)]),
    ...[...given].filter(([l]) => h.get(l) === 0).map(([l, g]): FaaWant => [F.plainLabel(l), g]),
    ...r.debit,
    ...(lost ? [['Loss by Fire', lost - claim] as FaaWant] : []),
  ];
  const credit: FaaWant[] = [[GP_BD, gross], ...nominal.filter((l) => h.get(l) < 0).map((l): FaaWant => [F.plainLabel(l), now(l)]), ...r.credit];
  // The manager's commission is reckoned last, on the profit that every other item leaves.
  const before = totalOf(credit) - totalOf(debit);
  const commission = r.commission ? (r.commission.basis === 'after' ? (before * r.commission.rate) / (100 + r.commission.rate) : (before * r.commission.rate) / 100) : 0;
  if (r.commission) debit.push(["Manager's Commission", commission]);
  const net = before - commission;
  // The Balance Sheet: each asset less what was written off it, what is owned and owed on the last day, and the capital.
  const worth = (label: string): number => h.get(label) - (r.off.get(label) ?? 0);
  const assets: FaaWant[] = [
    ...F.readFixed.filter((l) => h.get(l) !== 0).map((l): FaaWant => [F.plainLabel(l), worth(l)]),
    ['Closing Stock', h.cs],
    ['Sundry Debtors', r.debts ? worth('Sundry Debtors') : h.get('Sundry Debtors') + h.get('Provision for Doubtful Debts A/c')],
    ...r.owned,
    ...(claim ? [['Insurance Claim Receivable', claim] as FaaWant] : []),
    ['Cash at Bank', h.get('Bank A/c')],
    ...(h.get('Cash A/c') ? [['Cash in Hand', h.get('Cash A/c')] as FaaWant] : []),
  ];
  const liabilities: FaaWant[] = [
    ['Capital', -h.get('Capital A/c') + r.capital + net - h.get('Drawings A/c')],
    ['Sundry Creditors', -h.get('Sundry Creditors')],
    ...r.owed,
    ...(r.commission ? [['Outstanding Commission', commission] as FaaWant] : []),
  ];
  return { cost, sales, gross, debit, credit, net, assets, liabilities };
}

/** The Trading Account built again from the printed case: the same rows at the same amounts, closed on the gross profit. */
function adjustedTradingHolds(q: AccountQuestion): boolean {
  const w = workedByHand(q.data);
  return w !== null && F.sideIs(q.sides[0], [...w.cost, [GP_CD, w.gross]], GP_CD) && F.sideIs(q.sides[1], w.sales, GP_CD);
}

/** The Profit and Loss Account built again: it starts from the gross profit the printed figures give and closes on their net result. */
function adjustedProfitAndLossHolds(q: AccountQuestion): boolean {
  const w = workedByHand(q.data);
  if (!w || w.net === 0) return false;
  const closing = w.net > 0 ? NET_PROFIT : NET_LOSS;
  const end: FaaWant = [closing, Math.abs(w.net)];
  return F.sideIs(q.sides[0], w.net > 0 ? [...w.debit, end] : w.debit, closing) && F.sideIs(q.sides[1], w.net > 0 ? w.credit : [...w.credit, end], closing);
}

/** The Balance Sheet built again, each side from its own printed balances and adjustments: the two must agree. */
function adjustedBalanceSheetHolds(q: AccountQuestion): boolean {
  const w = workedByHand(q.data);
  return (
    w !== null &&
    totalOf(w.assets) === totalOf(w.liabilities) &&
    q.sides[0].title === 'Liabilities' &&
    q.sides[1].title === 'Assets' &&
    F.sideIs(q.sides[0], w.liabilities) &&
    F.sideIs(q.sides[1], w.assets)
  );
}

// ---- what the cases draw ----

/** A scenario, or null when the trial balance would be too long to read or a row would not be a whole, positive figure. */
function chained(c: FaaBooks | null, order: ChainOrder): Adjusted | null {
  if (!c || trialBalance(c.tb).rows.length > MAX_BALANCES) return null;
  const s: Adjusted = { c, order };
  const rows = [adjustedTrading(s), adjustedProfitAndLoss(s), adjustedBalanceSheet(s)].flatMap((p) => [...p.left.rows, ...p.right.rows]);
  return rows.every((r) => clean(amountOf(r))) ? s : null;
}

type IncomeKind = 'accrued' | 'rentAhead' | 'commissionAhead';
const INCOME_KINDS: readonly IncomeKind[] = ['accrued', 'rentAhead', 'commissionAhead'];

/** An income with its adjustment: commission still to be received, or rent or commission received for next year. */
function drawIncome(rng: Rng, kind: IncomeKind): { balance: FaaBal; adj: FaaAdj } {
  if (kind === 'rentAhead') {
    const sublet = amount(rng, 1000, 3000, 500);
    return { balance: [H.rentReceived.id, sublet * 13], adj: F.advance(H.rentReceived, sublet, sublet * 13, `Rent received includes ${inr(sublet)} for April.`) };
  }
  const recd = F.draw(rng, H.commission);
  const x = amount(rng, 1000, 4000, 500);
  return {
    balance: [H.commission.id, recd],
    adj:
      kind === 'accrued'
        ? F.accrued(H.commission, x, recd, `Commission of ${inr(x)} earned in March has not yet been received.`)
        : F.advance(H.commission, x, recd, `Commission received includes ${inr(x)} for work to be done next year.`),
  };
}

/** Goods that left without being sold: taken by the proprietor, or given away. `advertisement` is that expense in the trial balance. */
function drawGoods(rng: Rng, kind: 'drawn' | 'samples' | 'charity', advertisement = 0): { cost: number; adj: FaaAdj } {
  if (kind === 'drawn') {
    const g = amount(rng, 4000, 20000, 1000);
    return { cost: g, adj: takenByProprietor(g, pct(g, rng.pick([120, 125, 140, 150]))) };
  }
  const g = amount(rng, 2000, 12000, 1000);
  return { cost: g, adj: givenAway(g, kind, kind === 'samples' ? advertisement : 0) };
}

/** Goods lost by fire: not insured, or with a claim admitted, given as an amount or as a share of the cost. */
function drawFire(rng: Rng): { cost: number; adj: FaaAdj } {
  const g = amount(rng, 20000, 60000, 5000);
  const share = rng.pick([50, 60, 75, 80]);
  const cover = rng.pick(['none', 'amount', 'share'] as const);
  const claim = cover === 'none' ? 0 : pct(g, share);
  const said =
    cover === 'none' ? 'they were not insured.' : cover === 'amount' ? `the insurer admitted a claim of ${inr(claim)}, not yet received.` : `the insurer admitted a claim for ${share}% of their cost, not yet received.`;
  return { cost: g, adj: burnt(g, claim, said, cover === 'share' ? share : 0) };
}

/** A return of goods bought or of goods sold, or neither. */
function drawReturns(rng: Rng, allowed: boolean): { purchasesReturn?: number; salesReturn?: number } {
  const kind = allowed ? rng.pick(['none', 'purchases', 'sales'] as const) : 'none';
  return kind === 'purchases' ? { purchasesReturn: amount(rng, 4000, 20000, 1000) } : kind === 'sales' ? { salesReturn: amount(rng, 4000, 20000, 1000) } : {};
}

/** A second direct expense beside the first, in half the seeds whose trial balance has room for one more line. */
function drawSecondDirect(rng: Rng, first: string, room: boolean): FaaBal[] {
  if (!room || rng.next() < 0.5) return [];
  const h = rng.pick([H.wages, H.carriageIn, H.power].filter((x) => x.id !== first));
  return [[h.id, F.draw(rng, h)]];
}

/** The three parts every chained case asks, in the order an examiner asks for them. */
const ADJUSTED_PARTS: CasePart<Adjusted>[] = [
  { kind: 'account', make: adjustedTrading, verify: adjustedTradingHolds },
  { kind: 'account', make: adjustedProfitAndLoss, verify: adjustedProfitAndLossHolds },
  { kind: 'account', make: adjustedBalanceSheet, verify: adjustedBalanceSheetHolds },
];

// case-fa-chain-accruals: an expense unpaid and another paid ahead, an income still to come or received ahead, and
// depreciation on one asset (sometimes with an item bought during the year) or on two (medium)
const chainAccruals = caseTemplate<Adjusted>({
  id: 'case-fa-chain-accruals',
  // Version 2 (Class 11 quality pass review): the hints of the Profit and Loss Account and the Balance Sheet no longer name
  // interest on drawings, which is beyond the Class 11 syllabus.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Final accounts: outstanding, prepaid and accrued items',
  setup: (rng) =>
    F.attempt(12, () => {
      const firm = rng.pick(F.firms);
      // Wages unpaid in two seeds of five: the Trading Account then has an adjustment of its own.
      const carried = F.drawCarried(rng, ['out', 'pre'], ['wages', 'wages', 'salaries', 'rent', 'telephone']);
      const earned = drawIncome(rng, rng.pick(INCOME_KINDS));
      const fixed = F.drawFixed(rng, rng.pick([1, 1, 2]), 0.4);
      // Each block keeps its order; the blocks come in an order drawn from the seed.
      const adjs = rng.shuffle([...carried.adjs.map((a) => [a]), [earned.adj], fixed.adjs]).flat();
      // Rent is listed when an adjustment is about it, and otherwise where the trial balance is not already long;
      // a return and a second direct expense take what room is left.
      const showRent = carried.rentUsed || !(fixed.fixed.length === 2 || carried.telephone > 0);
      let lines = 12 + fixed.fixed.length + (showRent ? 1 : 0) + (carried.telephone ? 1 : 0);
      const returns = drawReturns(rng, lines < 16);
      lines += Object.keys(returns).length;
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[H.wages.id, carried.wages], ...drawSecondDirect(rng, H.wages.id, lines < 16)],
        indirect: [
          [H.salaries.id, carried.salaries],
          [H.insurance.id, carried.insurance],
          ...(showRent ? [[H.rent.id, carried.rent] as FaaBal] : []),
          ...(carried.telephone ? [[H.telephone.id, carried.telephone] as FaaBal] : []),
        ],
        incomes: [earned.balance],
        ...returns,
        debtors: amount(rng, 60000, 180000, 5000),
        drawings: amount(rng, 24000, 60000, 6000),
        // The net profit wanted after the adjustments, less what they do to it, in a round figure.
        profit: F.round(amount(rng, 60000, 140000, 1000) - F.net(adjs)),
      });
      return t && chained(chainBooks(rng, firm, t, adjs), rng.pick(ORDERS));
    }),
  context: adjustedText,
  parts: ADJUSTED_PARTS,
});

// case-fa-chain-debtors: further bad debts and the provision for doubtful debts as one net charge (a provision
// created, raised or lowered; bad debts already in the trial balance or not), with depreciation and, in most seeds,
// an expense unpaid or paid ahead; the debtors are shown net in the Balance Sheet (medium)
const chainDebtors = caseTemplate<Adjusted>({
  id: 'case-fa-chain-debtors',
  // Version 2 (Class 11 quality pass review): the hints of the Profit and Loss Account and the Balance Sheet no longer name
  // interest on drawings, which is beyond the Class 11 syllabus.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Final accounts: bad debts and the provision for doubtful debts',
  setup: (rng) =>
    F.attempt(12, () => {
      const firm = rng.pick(F.firms);
      const debts = F.drawDebts(rng, true, true);
      if (!debts) return null;
      const fixed = F.drawFixed(rng, rng.pick([1, 1, 2]), 0.4);
      const extra = rng.pick(['none', 'wages', 'salaries', 'prepaid'] as const);
      const direct = extra === 'wages' ? H.wages : rng.pick([H.wages, H.carriageIn]);
      const directPaid = F.draw(rng, direct);
      const monthlySalary = amount(rng, 4000, 9000, 500);
      const salaries = monthlySalary * (extra === 'salaries' ? 11 : 12);
      const insurance = F.draw(rng, H.insurance);
      const ahead = amount(rng, 2000, 6000, 500);
      const more =
        extra === 'wages'
          ? [F.outstanding(H.wages, amount(rng, 2000, 6000, 500), directPaid, 'for the last week of March')]
          : extra === 'salaries'
            ? [F.outstanding(H.salaries, monthlySalary, salaries, 'for March')]
            : extra === 'prepaid'
              ? [F.prepaid(H.insurance, ahead, insurance, `Insurance includes ${inr(ahead)} paid for the next year.`)]
              : [];
      // Carriage outwards beside carriage inwards: the pair students mix up.
      const second = direct === H.carriageIn ? H.carriageOut : rng.pick([H.rent, H.advertisement, H.telephone]);
      const adjs = rng.shuffle([[debts.adj], fixed.adjs, ...more.map((a) => [a])]).flat();
      // The balances every seed has, then those only some have; an income, a return and a second direct expense
      // where there is still room.
      let lines = 11 + fixed.fixed.length + (debts.tbBad ? 1 : 0) + (debts.old ? 1 : 0) + (extra === 'prepaid' ? 1 : 0);
      const income = lines < 16 && rng.next() < 0.5 ? rng.pick([H.discountReceived, H.interest, H.commission]) : null;
      if (income) lines++;
      const returns = drawReturns(rng, lines < 16);
      lines += Object.keys(returns).length;
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[direct.id, directPaid], ...drawSecondDirect(rng, direct.id, lines < 16)],
        indirect: [[H.salaries.id, salaries], [second.id, F.draw(rng, second)], ...(extra === 'prepaid' ? [[H.insurance.id, insurance] as FaaBal] : [])],
        incomes: income ? [[income.id, F.draw(rng, income)]] : [],
        ...returns,
        badDebts: debts.tbBad,
        debtors: debts.good + debts.further,
        provision: debts.old,
        drawings: amount(rng, 24000, 60000, 6000),
        profit: F.round(amount(rng, 60000, 140000, 1000) - F.net(adjs)),
      });
      return t && chained(chainBooks(rng, firm, t, adjs), rng.pick(ORDERS));
    }),
  context: adjustedText,
  parts: ADJUSTED_PARTS,
});

// case-fa-chain-proprietor: interest on capital, insurance paid ahead, goods taken by the proprietor or given away as
// samples or to charity, depreciation and, in under half the seeds, goods lost by fire with or without a claim
// (complex). Version 2: insurance paid for the next year takes the place of interest on drawings, which is beyond the
// Class 11 syllabus.
const chainProprietor = caseTemplate<Adjusted>({
  id: 'case-fa-chain-proprietor',
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Final accounts: interest on capital, goods taken or given away',
  setup: (rng) =>
    F.attempt(12, () => {
      const firm = rng.pick(F.firms);
      const insurance = F.draw(rng, H.insurance);
      const ahead = amount(rng, 2000, 6000, 500);
      const drawn = { drawings: amount(rng, 24000, 60000, 6000), adj: F.prepaid(H.insurance, ahead, insurance, `Insurance includes ${inr(ahead)} paid for the next year.`) };
      const kind = rng.pick(['drawn', 'drawn', 'samples', 'charity'] as const);
      // Samples are added to the advertisement already paid in most seeds, and are a new item in the others.
      const advertisement = kind === 'samples' && rng.next() < 0.6 ? F.draw(rng, H.advertisement) : 0;
      const lot = drawGoods(rng, kind, advertisement);
      const fire = rng.next() < 0.45 ? drawFire(rng) : null;
      // Two lots of goods at the same cost could not be told apart in the working.
      if (fire && fire.cost === lot.cost) return null;
      const fixed = F.drawFixed(rng, 1, 0.3);
      const direct = rng.pick([H.wages, H.carriageIn]);
      const second = advertisement ? H.advertisement : direct === H.carriageIn ? H.carriageOut : rng.pick([H.rent, H.telephone, H.stationery]);
      const income = rng.next() < 0.5 ? rng.pick([H.discountReceived, H.interest, H.commission]) : null;
      const known = [[drawn.adj], [lot.adj], ...(fire ? [[fire.adj]] : []), fixed.adjs];
      const returns = drawReturns(rng, true);
      const cash = rng.next() < 0.4 ? amount(rng, 4000, 20000, 1000) : 0;
      // Thirteen balances every seed has; a second direct expense where the others leave room for it.
      const lines = 13 + (income ? 1 : 0) + Object.keys(returns).length + (cash ? 1 : 0);
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[direct.id, F.draw(rng, direct)], ...drawSecondDirect(rng, direct.id, lines < 16)],
        indirect: [[H.salaries.id, F.draw(rng, H.salaries)], [second.id, advertisement || F.draw(rng, second)], [H.insurance.id, insurance]],
        incomes: income ? [[income.id, F.draw(rng, income)]] : [],
        ...returns,
        debtors: amount(rng, 60000, 180000, 5000),
        drawings: drawn.drawings,
        ...(cash ? { cash } : {}),
        // The net profit wanted before interest on capital, less what the other adjustments do to it.
        profit: F.round(amount(rng, 90000, 170000, 1000) - F.net(known.flat())),
      });
      if (!t) return null;
      // The case says once, at its end, that no capital was brought in.
      const ioc = F.interestOnCapital(rng.pick([5, 6, 8, 10]), t.capital, undefined, false, true);
      return chained(chainBooks(rng, firm, t, rng.shuffle([...known, [ioc]]).flat()), rng.pick(ORDERS));
    }),
  context: adjustedText,
  parts: ADJUSTED_PARTS,
});

// case-fa-chain-full: five or six adjustments. Depreciation and the debtors are always there; the others are drawn
// from an expense unpaid, one paid ahead, an income, interest on capital and a lot of goods
// (taken, given away or burnt), and two seeds in five end with the manager's commission, its basis stated (complex)
// Version 2: interest on drawings of a sole proprietor, beyond the Class 11 syllabus, is no longer drawn.
const chainFull = caseTemplate<Adjusted>({
  id: 'case-fa-chain-full',
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Final accounts: five or six adjustments',
  setup: (rng) =>
    F.attempt(14, () => {
      const firm = rng.pick(F.firms);
      const withCommission = rng.next() < 0.4;
      const count = rng.pick([5, 6]);
      const picked = new Set(rng.shuffle(['out', 'pre', 'income', 'ioc', 'goods'] as const).slice(0, count - 2 - (withCommission ? 1 : 0)));
      const carried = F.drawCarried(rng, [...(picked.has('out') ? ['out'] : []), ...(picked.has('pre') ? ['pre'] : [])], ['wages', 'wages', 'salaries', 'rent']);
      const fixed = F.drawFixed(rng, rng.next() < 0.3 ? 2 : 1, 0.4);
      // A manager on commission beside commission received would be two items of one name: the income is then rent.
      const earned = picked.has('income') ? drawIncome(rng, withCommission ? 'rentAhead' : rng.pick(INCOME_KINDS)) : null;
      const lot = !picked.has('goods') ? null : rng.next() < 0.35 ? drawFire(rng) : drawGoods(rng, rng.pick(['drawn', 'drawn', 'samples', 'charity'] as const));
      // Bad debts already written off are one more line of the trial balance: only where it is not at its longest.
      const lines = 11 + fixed.fixed.length + (carried.rentUsed ? 1 : 0) + (earned ? 1 : 0);
      const debts = F.drawDebts(rng, lines < 15, true);
      if (!debts) return null;
      const known = [...carried.adjs.map((a) => [a]), fixed.adjs, [debts.adj], ...(earned ? [[earned.adj]] : []), ...(lot ? [[lot.adj]] : [])];
      // The net profit wanted before interest on capital and the commission, less what the other adjustments do to it.
      const profit = F.round(amount(rng, 80000, 160000, 1000) - F.net(known.flat()));
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[H.wages.id, carried.wages], ...drawSecondDirect(rng, H.wages.id, lines + (debts.tbBad ? 1 : 0) + (debts.old ? 1 : 0) < 16)],
        indirect: [[H.salaries.id, carried.salaries], [H.insurance.id, carried.insurance], ...(carried.rentUsed ? [[H.rent.id, carried.rent] as FaaBal] : [])],
        incomes: earned ? [earned.balance] : [],
        badDebts: debts.tbBad,
        debtors: debts.good + debts.further,
        provision: debts.old,
        drawings: amount(rng, 24000, 60000, 6000),
        profit,
      });
      if (!t) return null;
      const blocks = [...known, ...(picked.has('ioc') ? [[F.interestOnCapital(rng.pick([5, 6, 8, 10]), t.capital, undefined, false, true)]] : [])];
      const adjs = rng.shuffle(blocks).flat();
      // The net profit before the commission, with every other adjustment made.
      let p = profit + F.net(adjs);
      if (withCommission) {
        const basis = rng.pick<FaaBasis>(['before', 'after']);
        const share = basis === 'before' ? rng.pick([5, 8, 10]) : rng.pick([5, 10, 20, 25]);
        // That profit is brought to a figure on which the commission is a whole number of thousands (on the profit
        // after it) or of rupees: sales and the bank balance move together, so the trial balance still agrees.
        const unit = basis === 'before' ? R(1000) : R(((100 + share) * 1000) / share);
        const over = p % unit;
        const shift = over === 0 ? 0 : t.bank - over >= R(10000) ? -over : unit - over;
        t.sales += shift;
        t.bank += shift;
        p += shift;
        // Always the last adjustment: it is reckoned after all the others.
        adjs.push(unpaidCommission(share, basis, p));
      }
      if (p < R(40000)) return null;
      const c = chainBooks(rng, firm, t, adjs);
      // The profit the commission was worked on must be the one the books give before it.
      if (c && F.figures(c.books, c.cs).net + (c.books.get('commissionPaid') ?? 0) !== p) throw new Error('chained final accounts: the profit before the commission is not the one the books give');
      return chained(c, rng.pick(ORDERS));
    }),
  context: adjustedText,
  parts: ADJUSTED_PARTS,
});

// case-fa-chain-loss: a lean year. The Trading Account still shows a gross profit, but the expenses are more than it:
// the Profit and Loss Account closes on its credit side with a net loss, and the capital falls. Three adjustments
// beside the closing stock: depreciation, and either an expense unpaid and another paid ahead, or one of the two with
// the debtors; in some seeds the trial balance alone would show a small profit, which the adjustments turn into the
// loss. The title does not say how the year ends: the student finds that out in the Profit and Loss Account (medium)
const chainLoss = caseTemplate<Adjusted>({
  id: 'case-fa-chain-loss',
  // Version 2 (Class 11 quality pass review): the hints of the Profit and Loss Account and the Balance Sheet no longer name
  // interest on drawings, which is beyond the Class 11 syllabus.
  version: 2,
  topicId: TOPIC,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Final accounts: a lean year',
  setup: (rng) =>
    F.attempt(14, () => {
      const firm = rng.pick(F.firms);
      const kinds = rng.pick([['out'], ['pre'], ['out', 'pre']]);
      const carried = F.drawCarried(rng, kinds, ['salaries', 'rent', 'wages']);
      const fixed = F.drawFixed(rng, 1, 0.3);
      // The debtors are the third adjustment wherever only one expense is carried forward.
      const withDebts = kinds.length === 1;
      const debts = withDebts ? F.drawDebts(rng, false, true) : null;
      if (withDebts && !debts) return null;
      const fourth = rng.pick([H.advertisement, H.telephone, H.carriageOut]);
      const income = rng.next() < 0.4 ? rng.pick([H.discountReceived, H.commission]) : null;
      const adjs = rng.shuffle([...carried.adjs.map((a) => [a]), fixed.adjs, ...(debts ? [[debts.adj]] : [])]).flat();
      const loss = amount(rng, 8000, 48000, 1000);
      const t = F.tb(rng, {
        fixed: fixed.fixed,
        directs: [[H.wages.id, carried.wages], ...drawSecondDirect(rng, H.wages.id, true)],
        indirect: [[H.salaries.id, carried.salaries], [H.rent.id, carried.rent], [H.insurance.id, carried.insurance], ...(debts?.old && income ? [] : [[fourth.id, F.draw(rng, fourth)] as FaaBal])],
        incomes: income ? [[income.id, F.draw(rng, income)]] : [],
        ...drawReturns(rng, true),
        debtors: debts ? debts.good + debts.further : amount(rng, 60000, 160000, 5000),
        provision: debts?.old ?? 0,
        drawings: amount(rng, 18000, 48000, 6000),
        // The net loss wanted after the adjustments, less what they do to the result, in a round figure.
        profit: F.round(-loss - F.net(adjs)),
      });
      return t && chained(chainBooks(rng, firm, t, adjs, 'loss'), rng.pick(ORDERS));
    }),
  context: adjustedText,
  parts: ADJUSTED_PARTS,
});

const cases: CaseTemplate[] = [
  closingStockOnly, accruals, doubtfulDebts, interestAndIncome, goodsAndCommission, fullProblem, leanYear,
  chainTradingPlBs, chainAccruals, chainDebtors, chainProprietor, chainFull, chainLoss,
];

export default cases;

/**
 * What the chained cases of the stage "The whole year of a business" (`cases/whole-year.ts`) reuse of the chained
 * cases above: the books of a case, its text, the three statements after the adjustments, the reading of a printed
 * case and the checks of the statements, and the draws of the adjustments. Nothing here is changed by being listed:
 * the cases above make what they made.
 */
export type FaCaseAdjusted = Adjusted;
export const FA_CASES = {
  chainBooks,
  chained,
  text: adjustedText,
  trading: adjustedTrading,
  profitAndLoss: adjustedProfitAndLoss,
  balanceSheet: adjustedBalanceSheet,
  tradingHolds: adjustedTradingHolds,
  profitAndLossHolds: adjustedProfitAndLossHolds,
  balanceSheetHolds: adjustedBalanceSheetHolds,
  workedByHand,
  drawIncome,
  drawGoods,
  drawReturns,
  drawSecondDirect,
  takenByProprietor,
  orders: ORDERS,
  incomeKinds: INCOME_KINDS,
  noCapital: NO_CAPITAL,
};
