import type { Difficulty, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion } from '@/content/types';
import { CLASS11_ACCOUNTS, creditor, debtor, normalSide, resolveAccount, type AccountType } from '@/engine/accounts';
import type { Gst, JournalLine, Mode, Transaction } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { BEYOND_INTEREST_ON_DRAWINGS } from '@/content/beyondSyllabus';
import { DEFAULT_JOURNAL_HINTS } from '../engine';
import {
  PARTIES,
  amount,
  beyondSyllabus,
  factsTemplate,
  formatINR,
  gstRate,
  interleave,
  journalSetTemplate,
  journalTemplate,
  mcqTemplate,
  numericTemplate,
  percentOf,
  rupees,
  setDays,
  setHolds,
  storyHolds,
  type Paise,
} from '../authoring';
import type { JournalSetParts, JournalSetTemplate, JournalTemplate, McqParts, NumericParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const mode = (rng: Rng): Mode => rng.pick(['cash', 'bank'] as const);
const paidHow = (m: Mode) => (m === 'cash' ? 'in cash' : 'by cheque');
const gst = (rng: Rng): Gst => ({ rate: gstRate(rng), kind: rng.pick(['intra', 'inter'] as const) });
const taxText = (g: Gst) =>
  g.kind === 'intra' ? `CGST @ ${g.rate / 2}% and SGST @ ${g.rate / 2}%` : `IGST @ ${g.rate}%`;

const [, RULE] = DEFAULT_JOURNAL_HINTS;

type Built = { prompt: string; tx: Transaction; hints?: string[] };

const make = (id: string, conceptId: string, difficulty: Difficulty, generate: (rng: Rng) => Built): JournalTemplate =>
  journalTemplate({ id, topicId: 'journal-entries', conceptId, difficulty, generate });

const templates: JournalTemplate[] = [
  make('je-capital', 'je-capital-drawings', 'easy', (rng) => {
    const a = amount(rng, 50000, 500000, 10000);
    const m = mode(rng);
    return {
      prompt:
        m === 'cash'
          ? `The owner started business with cash of ${formatINR(a)}.`
          : `The owner started business by depositing ${formatINR(a)} into the business bank account.`,
      tx: { kind: 'capitalIntroduced', amount: a, mode: m },
    };
  }),
  make('je-drawings', 'je-capital-drawings', 'easy', (rng) => {
    const a = amount(rng, 1000, 20000, 500);
    const m = mode(rng);
    return {
      prompt: `The owner withdrew ${formatINR(a)} ${m === 'cash' ? 'in cash' : 'from the business bank account'} for personal use.`,
      tx: { kind: 'drawings', amount: a, mode: m },
    };
  }),
  make('je-cash-purchase', 'je-goods', 'easy', (rng) => {
    const a = amount(rng, 2000, 60000, 1000);
    const m = mode(rng);
    return { prompt: `Purchased goods for ${formatINR(a)}, paid ${paidHow(m)}.`, tx: { kind: 'purchase', amount: a, pay: m } };
  }),
  make('je-cash-sale', 'je-goods', 'easy', (rng) => {
    const a = amount(rng, 2000, 60000, 1000);
    const m = mode(rng);
    return {
      prompt: `Sold goods for ${formatINR(a)} and received the amount ${paidHow(m)}.`,
      tx: { kind: 'sale', amount: a, receive: m },
    };
  }),
  make('je-asset-purchase', 'je-assets-expenses', 'easy', (rng) => {
    const asset = rng.pick(['furniture', 'machinery'] as const);
    const a = amount(rng, 5000, 200000, 5000);
    const m = mode(rng);
    return {
      prompt: `Bought ${asset} for use in the business for ${formatINR(a)}, paid ${paidHow(m)}.`,
      tx: { kind: 'assetPurchase', asset, amount: a, mode: m },
    };
  }),
  make('je-expense-paid', 'je-assets-expenses', 'easy', (rng) => {
    const expense = rng.pick(['rent', 'salaries', 'wages', 'stationery'] as const);
    const a = amount(rng, 500, 30000, 500);
    const m = mode(rng);
    return { prompt: `Paid ${formatINR(a)} for ${expense} ${m === 'cash' ? 'in cash' : 'by cheque'}.`, tx: { kind: 'expensePaid', expense, amount: a, mode: m } };
  }),
  make('je-income-received', 'je-assets-expenses', 'easy', (rng) => {
    const income = rng.pick(['commissionReceived', 'interestReceived'] as const);
    const a = amount(rng, 500, 10000, 500);
    const m = mode(rng);
    return {
      prompt: `Received ${income === 'commissionReceived' ? 'commission' : 'interest on investments'} of ${formatINR(a)} ${paidHow(m)}.`,
      tx: { kind: 'incomeReceived', income, amount: a, mode: m },
    };
  }),
  make('je-credit-purchase', 'je-credit', 'medium', (rng) => {
    const a = amount(rng, 5000, 80000, 1000);
    const party = rng.pick(PARTIES);
    return {
      prompt: `Purchased goods for ${formatINR(a)} from ${party} on credit.`,
      tx: { kind: 'purchase', amount: a, pay: { creditor: party } },
      hints: ['Nothing is paid now. Who does the business owe?', RULE],
    };
  }),
  make('je-credit-sale', 'je-credit', 'medium', (rng) => {
    const a = amount(rng, 5000, 80000, 1000);
    const party = rng.pick(PARTIES);
    return {
      prompt: `Sold goods for ${formatINR(a)} to ${party} on credit.`,
      tx: { kind: 'sale', amount: a, receive: { debtor: party } },
      hints: ['Nothing is received now. Who owes the business?', RULE],
    };
  }),
  make('je-payment-discount', 'je-settlement', 'medium', (rng) => {
    const due = amount(rng, 5000, 50000, 1000);
    const discount = percentOf(due, rng.pick([2, 5]));
    const party = rng.pick(PARTIES);
    const m = mode(rng);
    return {
      prompt: `Paid ${formatINR(due - discount)} ${m === 'cash' ? 'in cash' : 'by cheque'} to ${party}, a creditor who was owed ${formatINR(due)}, in full settlement of the account.`,
      tx: { kind: 'paymentToCreditor', creditor: party, paid: due - discount, discount, mode: m },
      hints: ['The amount not paid is a discount received. Is that a gain or a loss?', RULE],
    };
  }),
  make('je-receipt-discount', 'je-settlement', 'medium', (rng) => {
    const due = amount(rng, 5000, 50000, 1000);
    const discount = percentOf(due, rng.pick([2, 5]));
    const party = rng.pick(PARTIES);
    const m = mode(rng);
    return {
      prompt: `Received ${formatINR(due - discount)} ${paidHow(m)} from ${party}, a debtor who owed ${formatINR(due)}, in full settlement of the account.`,
      tx: { kind: 'receiptFromDebtor', debtor: party, received: due - discount, discount, mode: m },
      hints: ['The amount not received is a discount allowed. Is that a gain or a loss?', RULE],
    };
  }),
  make('je-bank-contra', 'je-bank', 'medium', (rng) => {
    const a = amount(rng, 2000, 50000, 1000);
    const deposit = rng.pick([true, false]);
    return {
      prompt: deposit
        ? `Deposited ${formatINR(a)} cash into the bank.`
        : `Withdrew ${formatINR(a)} from the bank for office use.`,
      tx: deposit ? { kind: 'cashDeposited', amount: a } : { kind: 'cashWithdrawn', amount: a },
      hints: ['Both accounts are assets. Which one increases and which one decreases?', RULE],
    };
  }),
  make('je-returns', 'je-returns', 'medium', (rng) => {
    const a = amount(rng, 500, 10000, 500);
    const party = rng.pick(PARTIES);
    const outward = rng.pick([true, false]);
    return {
      prompt: outward
        ? `Returned goods worth ${formatINR(a)} to ${party}, from whom they were bought on credit.`
        : `${party} returned goods worth ${formatINR(a)} that were sold to them on credit.`,
      tx: outward ? { kind: 'purchaseReturn', creditor: party, amount: a } : { kind: 'salesReturn', debtor: party, amount: a },
      hints: ['A return reverses part of the original purchase or sale. Use the return account, not Purchases or Sales.', RULE],
    };
  }),
  make('je-gst-purchase', 'je-gst', 'medium', (rng) => {
    const a = amount(rng, 5000, 80000, 1000);
    const g = gst(rng);
    const party = rng.pick(PARTIES);
    const credit = rng.pick([true, false]);
    return {
      prompt: credit
        ? `Purchased goods for ${formatINR(a)} (before GST) from ${party} on credit, plus ${taxText(g)}.`
        : `Purchased goods for ${formatINR(a)} (before GST), plus ${taxText(g)}, and paid the full invoice amount by cheque.`,
      tx: { kind: 'purchase', amount: a, pay: credit ? { creditor: party } : 'bank', gst: g },
      hints: ['GST paid on purchases is input tax: an asset, because it can be set off later.', RULE],
    };
  }),
  make('je-gst-sale', 'je-gst', 'medium', (rng) => {
    const a = amount(rng, 5000, 80000, 1000);
    const g = gst(rng);
    const party = rng.pick(PARTIES);
    const credit = rng.pick([true, false]);
    return {
      prompt: credit
        ? `Sold goods for ${formatINR(a)} (before GST) to ${party} on credit, plus ${taxText(g)}.`
        : `Sold goods for ${formatINR(a)} (before GST), plus ${taxText(g)}, and received a cheque for the full invoice amount.`,
      tx: { kind: 'sale', amount: a, receive: credit ? { debtor: party } : 'bank', gst: g },
      hints: ['GST collected on sales is output tax: a liability owed to the government.', RULE],
    };
  }),
  // je-trade-discount, the last of these, is written out with its lines further down (`tradeDiscount`), so that its
  // working shows each step; it keeps its place in the list.
];

// ===============================================================================================================
// Added later. Everything below is new: the generators above keep their ids, versions and output.
// The entries here are stated directly as lines, because they need accounts a Transaction cannot name.
// ===============================================================================================================

const TOPIC = 'journal-entries';
const R = formatINR;
const dr = (accountId: string, amt: Paise): JournalLine => ({ accountId, side: 'Dr', amount: amt });
const cr = (accountId: string, amt: Paise): JournalLine => ({ accountId, side: 'Cr', amount: amt });
/** "Furniture A/c", "Mohan A/c": the way an account is named in an explanation. */
const nm = (id: string): string => `${resolveAccount(id).name} A/c`;
/** A party name at the end of a sentence: "Rao & Co." already carries its full stop. */
const fin = (name: string): string => (name.endsWith('.') ? name : `${name}.`);
/** Possessive: "Kiran's", "Sharma Bros'". */
const poss = (name: string): string => (name.endsWith('s') ? `${name}'` : `${name}'s`);

/** Every rupee amount written in a prompt, in order, in paise. Used by `verify` to re-read the question. */
const amountsIn = (text: string): number[] =>
  Array.from(text.matchAll(/₹(\d[\d,]*)/g), (m) => rupees(Number(m[1].replace(/,/g, ''))));
const percentsIn = (text: string): number[] => Array.from(text.matchAll(/(\d+)%/g), (m) => Number(m[1]));
const sideTotal = (q: JournalQuestion, side: 'Dr' | 'Cr'): number =>
  q.expected.filter((l) => l.side === side).reduce((s, l) => s + l.amount, 0);
const lineOf = (q: JournalQuestion, id: string): number | undefined => q.expected.find((l) => l.accountId === id)?.amount;
/** The entry's total is the first amount the prompt gives. */
const totalIsFirstAmount = (q: JournalQuestion): boolean => sideTotal(q, 'Dr') === amountsIn(q.prompt)[0];

interface Direct {
  prompt: string;
  lines: JournalLine[];
  explanation: string[];
  distractorAccounts?: string[];
  hints?: string[];
}

const direct = (
  id: string,
  conceptId: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => Direct | null,
  verify?: (q: JournalQuestion) => boolean,
): JournalTemplate => journalTemplate({ id, topicId: TOPIC, conceptId, difficulty, generate, verify });

const pickPair = (rng: Rng, pool: [string, string][]): [string, string] => rng.pick(pool);

const FIXED_ASSETS: [string, string][] = [
  ['machinery', 'machinery'],
  ['furniture', 'furniture'],
  ['vehicles', 'vehicles'],
  ['computers', 'computers'],
  ['officeEquipment', 'office equipment'],
  ['building', 'the building'],
];

const OPEN_ASSETS: [string, (v: string) => string][] = [
  ['bank', (v) => `balance at bank ${v}`],
  ['cash', (v) => `cash in hand ${v}`],
  ['stock', (v) => `stock of goods ${v}`],
  ['machinery', (v) => `machinery ${v}`],
  ['vehicles', (v) => `a delivery van ${v}`],
  ['billsReceivable', (v) => `bills receivable ${v}`],
  ['computers', (v) => `computers ${v}`],
  ['furniture', (v) => `furniture ${v}`],
];
const OPEN_LIABILITIES: [string, (v: string) => string][] = [
  ['bankLoan', (v) => `a bank loan of ${v}`],
  ['billsPayable', (v) => `bills payable ${v}`],
  ['outstandingExpenses', (v) => `outstanding rent ${v}`],
];

/** Small makers and workshops, which hold stock, machinery and vans, for opening entries. A name that describes the business ends with a comma, to close the clause in "the books of ... show". */
const OPENING_BUSINESSES = [
  'Patel Fabricators, a small engineering workshop in Rajkot,',
  'Thomas Bakery of Kottayam',
  'Gill Agro Engineering, a tractor repair workshop in Ludhiana,',
  'Reddy Rice Mill of Guntur',
  'Kaveri Printers, a printing press in Mysuru,',
  'Shah Packaging, a carton maker in Surat,',
];

const OUTSTANDING: [string, string][] = [
  ['rent', 'rent'],
  ['salaries', 'salaries'],
  ['wages', 'wages'],
  ['electricity', 'electricity charges'],
  ['telephone', 'telephone charges'],
  ['interestPaid', 'interest on the loan'],
  ['advertisement', 'advertising charges'],
];
const PREPAID: [string, string][] = [
  ['insurance', 'insurance premium'],
  ['rent', 'rent'],
  ['advertisement', 'advertising charges'],
  ['telephone', 'telephone rental'],
];
const EARNED: [string, string][] = [
  ['interestReceived', 'interest on investments'],
  ['commissionReceived', 'commission'],
  ['rentReceived', 'rent from a tenant'],
];
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
/** Months of a year ending 31 March that fall after the end of the named month: how many are unpaid when rent is paid up to it. */
const monthsAfter = (name: string): number => 11 - MONTHS.indexOf(name);

const adjustments: JournalTemplate[] = [
  // ---- opening entry ----
  direct(
    'je-opening-entry',
    'je-compound',
    'medium',
    (rng) => {
      const [p1, p2] = rng.shuffle(PARTIES);
      const cash = amount(rng, 10000, 80000, 5000);
      const bank = amount(rng, 20000, 100000, 5000);
      const stock = amount(rng, 30000, 150000, 10000);
      const furn = amount(rng, 10000, 60000, 5000);
      const due = amount(rng, 10000, 70000, 5000);
      const owed = amount(rng, 10000, 60000, 5000);
      const capital = cash + bank + stock + furn + due - owed;
      const biz = rng.pick(OPENING_BUSINESSES);
      return {
        prompt: `On 1 April the books of ${biz} show: cash in hand ${R(cash)}, cash at bank ${R(bank)}, stock of goods ${R(stock)}, furniture ${R(furn)}, ${p1} owes the business ${R(due)}, and the business owes ${p2} ${R(owed)}. Pass the opening entry.`,
        lines: [dr('cash', cash), dr('bank', bank), dr('stock', stock), dr('furniture', furn), dr(debtor(p1), due), cr(creditor(p2), owed), cr('capital', capital)],
        explanation: [
          `Everything the business owns is an asset and is debited: Cash, Bank, Stock, Furniture and ${p1} (a debtor).`,
          `What the business owes to an outsider is a liability and is credited: ${p2} (a creditor) ${R(owed)}.`,
          `Capital is the balancing figure: assets ${R(cash + bank + stock + furn + due)} less liabilities ${R(owed)} = ${R(capital)}, credited to Capital A/c.`,
        ],
        distractorAccounts: ['purchases', 'sales', 'drawings'],
      };
    },
    (q) => {
      const a = amountsIn(q.prompt);
      return lineOf(q, 'capital') === a[0] + a[1] + a[2] + a[3] + a[4] - a[5];
    },
  ),
  direct(
    'je-opening-entry-complex',
    'je-compound',
    'complex',
    (rng) => {
      const [p1, p2] = rng.shuffle(PARTIES);
      const assets = rng.shuffle(OPEN_ASSETS).slice(0, 4);
      const [liab] = rng.shuffle(OPEN_LIABILITIES);
      const assetLines = assets.map(([id, text]) => ({ id, value: amount(rng, 30000, 150000, 10000), text }));
      const debtorValue = amount(rng, 30000, 100000, 10000);
      const liabValue = amount(rng, 20000, 60000, 10000);
      const creditorValue = amount(rng, 20000, 60000, 10000);
      const profit = amount(rng, 20000, 90000, 5000);
      const totalAssets = assetLines.reduce((s, a) => s + a.value, 0) + debtorValue;
      const outside = liabValue + creditorValue;
      const capital = totalAssets - outside;
      if (capital <= 0) return null;
      const assetText = [...assetLines.map((a) => a.text(R(a.value))), `${p1} owes ${R(debtorValue)}`].join(', ');
      const liabText = [liab[1](R(liabValue)), `${p2} is owed ${R(creditorValue)}`].join(', ');
      const biz = rng.pick(OPENING_BUSINESSES);
      return {
        prompt: `On 1 April the books of ${biz} show these balances. Assets: ${assetText}. Liabilities: ${liabText}. The owner's capital is not listed; last year's profit of ${R(profit)} has already been added to it. Pass the opening entry.`,
        lines: [
          ...assetLines.map((a) => dr(a.id, a.value)),
          dr(debtor(p1), debtorValue),
          cr(liab[0], liabValue),
          cr(creditor(p2), creditorValue),
          cr('capital', capital),
        ],
        explanation: [
          'Each asset is debited, including the debtor.',
          'Each amount owed to an outsider is a liability and is credited.',
          `Capital is the balancing figure: assets ${R(totalAssets)} less liabilities ${R(outside)} = ${R(capital)}, credited to Capital A/c.`,
          `Last year's profit of ${R(profit)} is already inside that capital, so it gets no line of its own.`,
        ],
        distractorAccounts: ['purchases', 'generalReserve', 'drawings'],
      };
    },
    (q) => {
      const given = amountsIn(q.prompt).slice(0, -1).sort((a, b) => a - b);
      const lines = q.expected.filter((l) => l.accountId !== 'capital').map((l) => l.amount).sort((a, b) => a - b);
      const capital = lineOf(q, 'capital');
      return given.length === lines.length && given.every((v, i) => v === lines[i]) && capital !== undefined && capital > 0;
    },
  ),

  // ---- outstanding and prepaid expenses ----
  direct(
    'je-outstanding-expense',
    'je-adjustments',
    'medium',
    (rng) => {
      const [id, label] = pickPair(rng, OUTSTANDING);
      const a = amount(rng, 2000, 40000, 500);
      const prompt = rng.pick([
        `On 31 March, ${R(a)} of ${label} for the year is still unpaid. Pass the adjusting entry.`,
        `${R(a)} of ${label} relating to this year has not been paid by the year end. Record the adjustment.`,
      ]);
      return {
        prompt,
        lines: [dr(id, a), cr('outstandingExpenses', a)],
        explanation: [
          `This amount of ${label} belongs to this year even though it is unpaid, so ${nm(id)} is debited: the expense is charged to this year.`,
          'The unpaid amount is owed to someone, so it is a liability: Outstanding Expenses A/c is credited.',
        ],
        distractorAccounts: ['prepaidExpenses', 'accruedIncome'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-prepaid-expense',
    'je-adjustments',
    'medium',
    (rng) => {
      const [id, label] = pickPair(rng, PREPAID);
      const a = amount(rng, 1000, 30000, 500);
      return {
        prompt: `Of the ${label} paid during the year, ${R(a)} relates to the next year. Pass the adjusting entry at 31 March.`,
        lines: [dr('prepaidExpenses', a), cr(id, a)],
        explanation: [
          `${R(a)} of the ${label} benefits next year, so it is taken out of this year's expense: ${nm(id)} is credited.`,
          'The business has already paid for a benefit it has not yet used. That is an asset: Prepaid Expenses A/c is debited.',
        ],
        distractorAccounts: ['outstandingExpenses', 'accruedIncome'],
      };
    },
    totalIsFirstAmount,
  ),
  // ---- accrued income and income received in advance ----
  direct(
    'je-accrued-income',
    'je-adjustments',
    'medium',
    (rng) => {
      const [id, label] = pickPair(rng, EARNED);
      const a = amount(rng, 1000, 30000, 500);
      return {
        prompt: `${R(a)} of ${label} has been earned during the year but not yet received. Pass the adjusting entry.`,
        lines: [dr('accruedIncome', a), cr(id, a)],
        explanation: [
          `The income belongs to this year although it is not received, so ${nm(id)} is credited.`,
          'The business has a right to receive it: an asset, Accrued Income A/c, which is debited. Income Received in Advance A/c is the opposite case: money taken before it is earned.',
        ],
        distractorAccounts: ['incomeReceivedInAdvance', 'outstandingExpenses', 'prepaidExpenses'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-income-advance',
    'je-adjustments',
    'medium',
    (rng) => {
      const [id, label] = pickPair(rng, EARNED);
      const a = amount(rng, 1000, 30000, 500);
      return {
        prompt: `Of the ${label} received during the year, ${R(a)} relates to the next year. Pass the adjusting entry at 31 March.`,
        lines: [dr(id, a), cr('incomeReceivedInAdvance', a)],
        explanation: [
          `${R(a)} was received for next year, so it is removed from this year's income: ${nm(id)} is debited.`,
          'The business owes that service or benefit to the payer. That is a liability: Income Received in Advance A/c is credited.',
        ],
        distractorAccounts: ['accruedIncome', 'outstandingExpenses'],
      };
    },
    totalIsFirstAmount,
  ),

  // ---- bad debts ----
  direct(
    'je-bad-debts-written-off',
    'je-adjustments',
    'easy',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 1000, 30000, 500);
      return {
        prompt: rng.pick([
          `${p}, a debtor who owed ${R(a)}, has been declared insolvent and nothing can be recovered. Write off the amount.`,
          `The business decides that ${R(a)} due from ${p} cannot be recovered. Pass the entry to write it off.`,
        ]),
        lines: [dr('badDebts', a), cr(debtor(p), a)],
        explanation: [
          'A debt that cannot be recovered is a loss of the business: Bad Debts A/c is debited.',
          `${p} no longer owes anything that can be collected, so the asset falls: ${nm(debtor(p))} is credited.`,
        ],
        distractorAccounts: ['discountAllowed', 'sales', 'salesReturn'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-bad-debts-partial',
    'je-adjustments',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const owed = amount(rng, 4000, 40000, 4000);
      const pct = rng.pick([25, 40, 50, 60, 75]);
      const got = (owed * pct) / 100;
      if (got % 100 !== 0) return null;
      const m = mode(rng);
      return {
        prompt: `${p} owed the business ${R(owed)}. After ${p} was declared insolvent, ${pct}% of the dues was received ${paidHow(m)} in final settlement and the rest is irrecoverable. Pass the entry.`,
        lines: [dr(m, got), dr('badDebts', owed - got), cr(debtor(p), owed)],
        explanation: [
          `Amount received = ${pct}% of ${R(owed)} = ${R(got)}: ${nm(m)} is debited.`,
          `Amount lost = ${R(owed)} - ${R(got)} = ${R(owed - got)}: Bad Debts A/c is debited.`,
          `The whole ${R(owed)} is cleared from ${nm(debtor(p))}, which is credited.`,
        ],
        distractorAccounts: ['discountAllowed', 'badDebtsRecovered'],
      };
    },
    (q) => {
      const owed = amountsIn(q.prompt)[0];
      const pct = percentsIn(q.prompt)[0];
      const got = (owed * pct) / 100;
      return lineOf(q, 'badDebts') === owed - got && sideTotal(q, 'Cr') === owed && (lineOf(q, 'cash') ?? lineOf(q, 'bank')) === got;
    },
  ),
  direct(
    'je-bad-debts-recovered',
    'je-adjustments',
    'medium',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 1000, 30000, 500);
      const m = mode(rng);
      return {
        prompt: `${R(a)} owed by ${p} was written off as a bad debt in an earlier year. The amount has now been recovered ${paidHow(m)}. Pass the entry.`,
        lines: [dr(m, a), cr('badDebtsRecovered', a)],
        explanation: [
          `${nm(m)} increases as money comes in: it is debited.`,
          `${poss(p)} account was closed when the debt was written off, so it is not used again. The recovery is a gain: Bad Debts Recovered A/c is credited.`,
        ],
        distractorAccounts: [debtor(p), 'badDebts', 'sales'],
      };
    },
    totalIsFirstAmount,
  ),

  // ---- depreciation ----
  direct(
    'je-depreciation-charged',
    'je-adjustments',
    'medium',
    (rng) => {
      const [id, label] = pickPair(rng, FIXED_ASSETS);
      const a = amount(rng, 2000, 60000, 1000);
      const provision = rng.pick([true, false]);
      return {
        prompt: `Depreciation of ${R(a)} is to be charged on ${label} for the year. Pass the entry, ${provision ? 'showing the amount in Provision for Depreciation A/c' : 'reducing the asset account directly'}.`,
        lines: [dr('depreciation', a), cr(provision ? 'provisionForDepreciation' : id, a)],
        explanation: [
          'Depreciation is the part of the asset used up this year, an expense: Depreciation A/c is debited.',
          provision
            ? 'The asset stays at cost; the total depreciation is collected in Provision for Depreciation A/c, which is credited.'
            : `The asset loses value, so ${nm(id)} is credited.`,
        ],
        distractorAccounts: provision ? [id, 'repairs'] : ['provisionForDepreciation', 'repairs'],
      };
    },
    totalIsFirstAmount,
  ),
];

const goodsAndLosses: JournalTemplate[] = [
  // ---- goods used otherwise than for sale ----
  direct(
    'je-goods-personal',
    'je-goods-otherwise',
    'easy',
    (rng) => {
      const a = amount(rng, 1000, 20000, 500);
      return {
        prompt: rng.pick([
          `The owner took goods costing ${R(a)} from the shop for use at home. Ignore GST.`,
          `Goods that cost ${R(a)} were withdrawn by the proprietor for personal use. Ignore GST.`,
        ]),
        lines: [dr('drawings', a), cr('purchases', a)],
        explanation: [
          'Goods taken by the owner for personal use reduce capital: Drawings A/c is debited.',
          'The goods leave the business without being sold, so they are taken out of Purchases A/c (at cost), not recorded as Sales.',
        ],
        distractorAccounts: ['sales', 'capital', 'salaries'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-goods-charity',
    'je-goods-otherwise',
    'easy',
    (rng) => {
      const a = amount(rng, 1000, 20000, 500);
      const who = rng.pick(['a flood relief fund', 'a local orphanage', 'a temple trust', 'a charitable hospital']);
      return {
        prompt: `Goods costing ${R(a)} were given as a donation to ${who}. Ignore GST.`,
        lines: [dr('charity', a), cr('purchases', a)],
        explanation: [
          'A donation is an expense of the business: Charity A/c is debited.',
          'The goods leave the business without being sold, so Purchases A/c is credited (at cost). Sales A/c is not used.',
        ],
        distractorAccounts: ['sales', 'drawings', 'advertisement'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-goods-samples',
    'je-goods-otherwise',
    'easy',
    (rng) => {
      const a = amount(rng, 1000, 20000, 500);
      const where = rng.pick(['to promote a new product', 'at a trade exhibition', 'to shops in the market to attract orders']);
      return {
        prompt: `Goods costing ${R(a)} were distributed free as samples ${where}. Ignore GST.`,
        lines: [dr('advertisement', a), cr('purchases', a)],
        explanation: [
          'Free samples are given to win customers, so they are an advertising cost: Advertisement A/c is debited.',
          'The goods leave the business without being sold, so Purchases A/c is credited (at cost).',
        ],
        distractorAccounts: ['charity', 'drawings', 'sales'],
      };
    },
    totalIsFirstAmount,
  ),

  // ---- losses of goods and insurance claims ----
  direct(
    'je-loss-fire',
    'je-losses-claims',
    'easy',
    (rng) => {
      const a = amount(rng, 5000, 80000, 1000);
      return {
        prompt: `Goods costing ${R(a)}, bought during the year, were destroyed by fire at the godown. The goods were not insured. Pass the entry.`,
        lines: [dr('lossByFire', a), cr('purchases', a)],
        explanation: [
          'Nothing can be claimed from anyone, so the whole cost is a loss: Loss by Fire A/c is debited.',
          'The goods were debited to Purchases A/c when they were bought and have left without being sold, so Purchases A/c is credited with their cost.',
          'Sales A/c is not used, because nothing was sold. Stock A/c is not used, because goods bought during the year stand in Purchases A/c.',
        ],
        distractorAccounts: ['stock', 'sales', 'lossByTheft', 'insuranceClaimReceivable', 'drawings'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-loss-theft',
    'je-losses-claims',
    'easy',
    (rng) => {
      const a = amount(rng, 2000, 50000, 1000);
      const cash = rng.pick([true, false]);
      return {
        prompt: cash
          ? `${R(a)} was stolen from the cash box of the business. There is no insurance cover. Pass the entry.`
          : `Goods costing ${R(a)}, bought during the year, were stolen from the shop. They were not insured. Pass the entry.`,
        lines: [dr('lossByTheft', a), cr(cash ? 'cash' : 'purchases', a)],
        explanation: [
          'The business gets nothing back, so the whole amount is a loss: Loss by Theft A/c is debited.',
          cash
            ? 'Cash, an asset, has decreased: Cash A/c is credited.'
            : 'The goods were debited to Purchases A/c when they were bought and have left without being sold, so Purchases A/c is credited with their cost. Stock A/c and Sales A/c are not used.',
        ],
        distractorAccounts: cash ? ['purchases', 'lossByFire', 'drawings'] : ['stock', 'sales', 'lossByFire', 'drawings'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-loss-claim-full',
    'je-losses-claims',
    'medium',
    (rng) => {
      const a = amount(rng, 5000, 80000, 1000);
      const event = rng.pick(['destroyed by fire', 'stolen from the shop']);
      return {
        prompt: `Goods costing ${R(a)}, bought during the year, were ${event}. The insurance company has admitted the claim in full. Pass one combined entry for the loss and the claim.`,
        lines: [dr('insuranceClaimReceivable', a), cr('purchases', a)],
        explanation: [
          'The insurer will pay the whole cost, so the business bears no loss and no loss account is needed in the combined entry.',
          'The amount due from the insurer is an asset: Insurance Claim Receivable A/c is debited.',
          'The goods were debited to Purchases A/c when they were bought and have left without being sold, so Purchases A/c is credited with their cost. Stock A/c is not used.',
        ],
        distractorAccounts: ['lossByFire', 'lossByTheft', 'stock', 'bank'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-loss-claim-partial',
    'je-losses-claims',
    'complex',
    (rng) => {
      const a = amount(rng, 10000, 100000, 10000);
      const event = rng.pick<[string, string]>([
        ['destroyed by fire', 'lossByFire'],
        ['stolen from the shop', 'lossByTheft'],
      ]);
      const pct = rng.pick([60, 70, 75, 80, 90]);
      const byPercent = rng.pick([true, false]);
      const claim = (a * pct) / 100;
      if (claim % 100 !== 0) return null;
      const insurer = byPercent ? `The insurer agreed to pay ${pct}% of the loss.` : `The insurer admitted a claim of ${R(claim)}.`;
      return {
        prompt: `Goods costing ${R(a)}, bought during the year, were ${event[0]}. ${insurer} Pass one combined entry for the loss and the claim.`,
        lines: [dr('insuranceClaimReceivable', claim), dr(event[1], a - claim), cr('purchases', a)],
        explanation: [
          `Amount to be received from the insurer: ${R(claim)}, an asset: Insurance Claim Receivable A/c is debited.`,
          `Loss borne by the business = ${R(a)} - ${R(claim)} = ${R(a - claim)}: ${nm(event[1])} is debited.`,
          `The goods were debited to Purchases A/c when they were bought, so the whole cost, ${R(a)}, is taken out of it: Purchases A/c is credited. Stock A/c is not used.`,
        ],
        distractorAccounts: [event[1] === 'lossByFire' ? 'lossByTheft' : 'lossByFire', 'stock', 'bank'],
      };
    },
    (q) => {
      const a = amountsIn(q.prompt)[0];
      const pct = percentsIn(q.prompt)[0];
      const claim = pct === undefined ? amountsIn(q.prompt)[1] : (a * pct) / 100;
      const loss = lineOf(q, 'lossByFire') ?? lineOf(q, 'lossByTheft');
      return lineOf(q, 'insuranceClaimReceivable') === claim && loss === a - claim && lineOf(q, 'purchases') === a;
    },
  ),
];

const FIXED_ON_CREDIT: [string, string][] = [
  ['furniture', 'furniture'],
  ['machinery', 'machinery'],
  ['vehicles', 'a delivery van'],
  ['computers', 'computers'],
  ['officeEquipment', 'office equipment'],
];
/** [account, how the asset is named at the start of a sentence, the verb that goes with it] */
const OLD_ASSETS: [string, string, string][] = [
  ['furniture', 'Old furniture', 'was'],
  ['machinery', 'Old machinery', 'was'],
  ['vehicles', 'An old delivery van', 'was'],
  ['computers', 'Old computers', 'were'],
  ['officeEquipment', 'Old office equipment', 'was'],
];
const EXPENSE_LABELS: [string, string][] = [
  ['rent', 'rent'],
  ['salaries', 'salaries'],
  ['electricity', 'electricity'],
  ['telephone', 'telephone charges'],
  ['stationery', 'stationery'],
  ['advertisement', 'advertising'],
  ['repairs', 'repairs'],
  ['postage', 'postage'],
];

const interestAndBanking: JournalTemplate[] = [
  // ---- interest on drawings (beyond the Class 11 syllabus: on no level and in no mock paper) ----
  beyondSyllabus(direct(
    'je-interest-drawings',
    'je-adjustments',
    'medium',
    (rng) => {
      const a = amount(rng, 500, 12000, 500);
      return {
        prompt: rng.pick([
          `Interest of ${R(a)} is charged to the owner on drawings for the year. Pass the entry, charging it through the owner's Drawings A/c.`,
          `The business charges the proprietor interest of ${R(a)} on drawings made during the year. Record it through the Drawings A/c.`,
        ]),
        lines: [dr('drawings', a), cr('interestOnDrawings', a)],
        explanation: [
          'The business earns this interest from the owner, so it is an income: Interest on Drawings A/c is credited.',
          'The owner is charged, which adds to the drawings and so reduces capital: Drawings A/c is debited.',
        ],
        distractorAccounts: ['interestOnCapital', 'interestReceived', 'capital'],
      };
    },
    totalIsFirstAmount,
  ), BEYOND_INTEREST_ON_DRAWINGS),
  // ---- bank charges and interest ----
  direct(
    'je-bank-charges',
    'je-banking',
    'easy',
    (rng) => {
      const a = amount(rng, 100, 5000, 100);
      return {
        prompt: rng.pick([
          `The bank debited ${R(a)} to the business account as service charges. The business has not yet recorded it.`,
          `A bank statement shows ${R(a)} charged by the bank for running the account. Pass the entry in the business books.`,
        ]),
        lines: [dr('bankCharges', a), cr('bank', a)],
        explanation: [
          'The charges are a cost of running the business: Bank Charges A/c is debited.',
          'The bank has taken the money out of the account, so Bank A/c, an asset, decreases and is credited.',
        ],
        distractorAccounts: ['interestPaid', 'generalExpenses'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-bank-interest-credited',
    'je-banking',
    'easy',
    (rng) => {
      const a = amount(rng, 200, 9000, 100);
      return {
        prompt: rng.pick([
          `The bank credited ${R(a)} to the business account as interest on the balance. Pass the entry.`,
          `The pass book shows ${R(a)} credited by the bank as interest. The business has not yet recorded it. Pass the entry.`,
        ]),
        lines: [dr('bank', a), cr('interestReceived', a)],
        explanation: [
          'The bank has added money to the account, so Bank A/c, an asset, increases and is debited.',
          'Interest earned is an income: Interest Received A/c is credited.',
        ],
        distractorAccounts: ['interestPaid', 'bankCharges'],
      };
    },
    totalIsFirstAmount,
  ),

  // ---- cheques ----
  direct(
    'je-cheque-received',
    'je-banking',
    'easy',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 2000, 60000, 1000);
      return {
        prompt: `Received a cheque for ${R(a)} from ${p}, a debtor, and deposited it into the bank the same day. Pass the entry.`,
        lines: [dr('bank', a), cr(debtor(p), a)],
        explanation: [
          'The cheque was banked at once, so Bank A/c, an asset, increases and is debited.',
          `${p} owes less, so ${nm(debtor(p))} is credited. Sales A/c is not used: the sale was recorded earlier.`,
        ],
        distractorAccounts: ['sales', 'discountAllowed'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-cheque-deposited',
    'je-banking',
    'medium',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 2000, 60000, 1000);
      return {
        prompt: `A cheque for ${R(a)} from ${p} was not banked on the day it arrived, so it was entered as cash in hand (the usual treatment of a cheque that is not deposited the same day). It is deposited into the bank today. Pass the entry.`,
        lines: [dr('bank', a), cr('cash', a)],
        explanation: [
          'The cheque has already been recorded as a receipt of cash, so the debtor is not touched again.',
          'Depositing it only moves money between two assets: Bank A/c is debited and Cash A/c is credited.',
        ],
        distractorAccounts: [debtor(p), 'sales'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-cheque-dishonoured',
    'je-banking',
    'medium',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 2000, 60000, 1000);
      return {
        prompt: `A cheque for ${R(a)} from ${p}, deposited earlier into the bank, has been returned by the bank unpaid. Pass the entry.`,
        lines: [dr(debtor(p), a), cr('bank', a)],
        explanation: [
          `The cheque failed, so ${p} owes the business again: ${nm(debtor(p))} is debited.`,
          'The money the business thought it had in the bank is not there: Bank A/c is credited.',
        ],
        distractorAccounts: ['sales', 'salesReturn', 'badDebts'],
      };
    },
    totalIsFirstAmount,
  ),
  // ---- advances ----
  direct(
    'je-advance-received',
    'je-compound',
    'easy',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 2000, 50000, 1000);
      const m = mode(rng);
      return {
        prompt: `Received ${R(a)} ${paidHow(m)} from ${p} as an advance for goods to be supplied next month. The business records an advance in the party's own account. Pass the entry.`,
        lines: [dr(m, a), cr(debtor(p), a)],
        explanation: [
          `${nm(m)} increases as money comes in: it is debited.`,
          `Nothing has been sold yet, so Sales A/c is not credited. The business now owes goods to ${p}, so ${nm(debtor(p))} is credited (it will show a credit balance).`,
        ],
        distractorAccounts: ['sales', 'incomeReceivedInAdvance', 'capital'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-advance-paid',
    'je-compound',
    'easy',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 2000, 50000, 1000);
      const m = mode(rng);
      return {
        prompt: `Paid ${R(a)} ${m === 'cash' ? 'in cash' : 'by cheque'} to ${p} as an advance for goods to be delivered next month. The business records an advance in the party's own account. Pass the entry.`,
        lines: [dr(creditor(p), a), cr(m, a)],
        explanation: [
          `${nm(m)} decreases as money goes out: it is credited.`,
          `The goods have not arrived, so Purchases A/c is not debited. ${p} now owes goods to the business, so ${nm(creditor(p))} is debited (it will show a debit balance).`,
        ],
        distractorAccounts: ['purchases', 'prepaidExpenses'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-advance-adjusted',
    'je-compound',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const goods = amount(rng, 20000, 90000, 5000);
      const advance = amount(rng, 5000, goods / 100 - 5000, 5000);
      const m = mode(rng);
      return {
        prompt: `${p} had earlier paid ${R(advance)} as an advance, which was credited to ${poss(p)} own account. Goods worth ${R(goods)} are now sold to ${p}, who pays the balance ${paidHow(m)}. Pass a single entry.`,
        lines: [dr(m, goods - advance), dr(debtor(p), advance), cr('sales', goods)],
        explanation: [
          `Total sale = ${R(goods)}: Sales A/c is credited.`,
          `${poss(p)} advance of ${R(advance)} is used up, so ${nm(debtor(p))} is debited with ${R(advance)}, which clears the credit balance left by the advance.`,
          `Balance received = ${R(goods)} - ${R(advance)} = ${R(goods - advance)}: ${nm(m)} is debited.`,
        ],
        distractorAccounts: ['discountAllowed', 'salesReturn'],
      };
    },
    (q) => {
      const [advance, goods] = amountsIn(q.prompt);
      const received = lineOf(q, 'cash') ?? lineOf(q, 'bank');
      return lineOf(q, 'sales') === goods && received === goods - advance && sideTotal(q, 'Dr') === goods;
    },
  ),
];

const assetsAndFlows: JournalTemplate[] = [
  // ---- fixed assets ----
  direct(
    'je-asset-purchase-credit',
    'je-assets',
    'easy',
    (rng) => {
      const [id, label] = pickPair(rng, FIXED_ON_CREDIT);
      const p = rng.pick(PARTIES);
      const a = amount(rng, 10000, 300000, 5000);
      return {
        prompt: `Bought ${label} for use in the business for ${R(a)} on credit from ${fin(p)}`,
        lines: [dr(id, a), cr(creditor(p), a)],
        explanation: [
          `The business now owns the asset: ${nm(id)} is debited.`,
          `Nothing is paid now, so ${p} is a creditor: ${nm(creditor(p))} is credited. Purchases A/c is only for goods bought for resale, so it is not used.`,
        ],
        distractorAccounts: ['purchases', 'repairs'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-asset-installation',
    'je-assets',
    'complex',
    (rng) => {
      const [id, label] = rng.pick<[string, string]>([
        ['machinery', 'a machine'],
        ['officeEquipment', 'an air-conditioning unit'],
        ['computers', 'computer systems'],
      ]);
      const p = rng.pick(PARTIES);
      const price = amount(rng, 50000, 300000, 10000);
      const transport = amount(rng, 1000, 10000, 1000);
      const fitting = amount(rng, 1000, 10000, 1000);
      const m = mode(rng);
      return {
        prompt: `Bought ${label} for use in the business for ${R(price)} on credit from ${fin(p)} Transport of ${R(transport)} and installation of ${R(fitting)} were paid ${paidHow(m)}. Pass one entry.`,
        lines: [dr(id, price + transport + fitting), cr(creditor(p), price), cr(m, transport + fitting)],
        explanation: [
          `Every cost of bringing the asset into use is part of its cost: ${R(price)} + ${R(transport)} + ${R(fitting)} = ${R(price + transport + fitting)}, debited to ${nm(id)}.`,
          `${nm(creditor(p))} is credited with the price, ${R(price)}, which is still owed.`,
          `${nm(m)} is credited with ${R(transport + fitting)} paid out now.`,
        ],
        distractorAccounts: ['carriageInwards', 'repairs', 'freight'],
      };
    },
    (q) => {
      const [price, transport, fitting] = amountsIn(q.prompt);
      const debit = q.expected.filter((l) => l.side === 'Dr');
      return debit.length === 1 && debit[0].amount === price + transport + fitting && q.expected.some((l) => l.side === 'Cr' && l.amount === price);
    },
  ),
  direct(
    'je-asset-sale-credit',
    'je-assets',
    'medium',
    (rng) => {
      const [id, label, verb] = rng.pick(OLD_ASSETS);
      const p = rng.pick(PARTIES);
      const a = amount(rng, 5000, 150000, 5000);
      return {
        prompt: `${label}, appearing in the books at ${R(a)}, ${verb} sold on credit to ${p} for ${R(a)}. Pass the entry.`,
        lines: [dr(debtor(p), a), cr(id, a)],
        explanation: [
          `${p} will pay later, so ${nm(debtor(p))} is debited.`,
          `The asset is no longer owned: ${nm(id)} is credited at its book value. There is no profit or loss, because the price equals the book value, and Sales A/c is not used because the asset is not goods dealt in.`,
        ],
        distractorAccounts: ['sales', 'profitOnSaleOfAsset', 'lossOnSaleOfAsset'],
      };
    },
    (q) => sideTotal(q, 'Dr') === amountsIn(q.prompt)[0] && sideTotal(q, 'Cr') === amountsIn(q.prompt)[1],
  ),
  direct(
    'je-asset-sale-gain-loss',
    'je-assets',
    'medium',
    (rng) => {
      const [id, label, verb] = rng.pick(OLD_ASSETS);
      const p = rng.pick(PARTIES);
      const book = amount(rng, 30000, 200000, 10000);
      const diff = amount(rng, 2000, 20000, 2000);
      const profit = rng.pick([true, false]);
      const price = profit ? book + diff : book - diff;
      // Sold on credit, for cash, or for a cheque that is banked at once: the account debited follows.
      const how = rng.pick(['credit', 'cash', 'bank'] as const);
      const buyer = how === 'credit' ? debtor(p) : how;
      const terms = how === 'credit' ? `on credit to ${p}` : how === 'cash' ? `to ${p} for cash` : `to ${p}, who paid by a cheque that was banked at once,`;
      return {
        prompt: `${label}, appearing in the books at ${R(book)}, ${verb} sold ${terms} for ${R(price)}. Pass the entry.`,
        lines: profit
          ? [dr(buyer, price), cr(id, book), cr('profitOnSaleOfAsset', diff)]
          : [dr(buyer, price), dr('lossOnSaleOfAsset', diff), cr(id, book)],
        explanation: [
          how === 'credit'
            ? `${nm(debtor(p))} is debited with the price, ${R(price)}, which ${p} will pay later.`
            : `${nm(buyer)} is debited with the price received, ${R(price)}.`,
          `${nm(id)} is credited at its book value, ${R(book)}.`,
          profit
            ? `The price is ${R(diff)} more than the book value: a gain, so Profit on Sale of Asset A/c is credited.`
            : `The price is ${R(diff)} less than the book value: a loss, so Loss on Sale of Asset A/c is debited.`,
        ],
        distractorAccounts: [...(how === 'credit' ? [] : [debtor(p)]), ...(profit ? ['sales', 'lossOnSaleOfAsset'] : ['sales', 'profitOnSaleOfAsset'])],
      };
    },
    (q) => {
      const [book, price] = amountsIn(q.prompt);
      const gain = lineOf(q, 'profitOnSaleOfAsset');
      const loss = lineOf(q, 'lossOnSaleOfAsset');
      return sideTotal(q, 'Dr') === (gain === undefined ? price + (loss ?? 0) : price) && (gain ?? 0) - (loss ?? 0) === price - book;
    },
  ),

  // ---- compound entries ----
  direct(
    'je-compound-expenses',
    'je-compound',
    'medium',
    (rng) => {
      const picks = rng.shuffle(EXPENSE_LABELS).slice(0, 3);
      const values = picks.map(() => amount(rng, 1000, 25000, 500));
      const total = values.reduce((s, v) => s + v, 0);
      const m = mode(rng);
      const text = `${picks[0][1]} ${R(values[0])}, ${picks[1][1]} ${R(values[1])} and ${picks[2][1]} ${R(values[2])}`;
      return {
        prompt: `Paid ${m === 'cash' ? 'in cash' : 'by cheque'}: ${text}. Pass one compound entry.`,
        lines: [...picks.map(([id], i) => dr(id, values[i])), cr(m, total)],
        explanation: [
          'Each payment is an expense, so each expense account is debited with its own amount.',
          `All three were paid out of the same account, so ${nm(m)} is credited once with the total, ${R(total)}.`,
        ],
        distractorAccounts: ['outstandingExpenses', 'prepaidExpenses'],
      };
    },
    (q) => sideTotal(q, 'Cr') === amountsIn(q.prompt).reduce((s, v) => s + v, 0) && q.expected.filter((l) => l.side === 'Dr').length === 3,
  ),
  direct(
    'je-compound-sale-part-cash',
    'je-compound',
    'medium',
    (rng) => {
      const p = rng.pick(PARTIES);
      const goods = amount(rng, 10000, 100000, 10000);
      const pct = rng.pick([20, 25, 40, 50, 60, 75]);
      const got = (goods * pct) / 100;
      if (got % 100 !== 0) return null;
      const m = mode(rng);
      return {
        prompt: `Sold goods for ${R(goods)} to ${fin(p)} ${pct}% of the price was received ${paidHow(m)} and the rest was left on credit. Pass one entry.`,
        lines: [dr(m, got), dr(debtor(p), goods - got), cr('sales', goods)],
        explanation: [
          `Received now = ${pct}% of ${R(goods)} = ${R(got)}: ${nm(m)} is debited.`,
          `Left on credit = ${R(goods)} - ${R(got)} = ${R(goods - got)}: ${nm(debtor(p))} is debited.`,
          `The whole sale, ${R(goods)}, is credited to Sales A/c.`,
        ],
        distractorAccounts: ['discountAllowed', 'salesReturn'],
      };
    },
    (q) => {
      const goods = amountsIn(q.prompt)[0];
      const got = (goods * percentsIn(q.prompt)[0]) / 100;
      return lineOf(q, 'sales') === goods && (lineOf(q, 'cash') ?? lineOf(q, 'bank')) === got;
    },
  ),
  direct(
    'je-compound-capital-assets',
    'je-compound',
    'medium',
    (rng) => {
      const [a, b] = rng.shuffle<[string, string]>([
        ['furniture', 'furniture'],
        ['computers', 'computers'],
        ['machinery', 'machinery'],
        ['vehicles', 'a delivery van'],
        ['officeEquipment', 'office equipment'],
      ]);
      const cash = amount(rng, 50000, 300000, 10000);
      const va = amount(rng, 10000, 100000, 5000);
      const vb = amount(rng, 10000, 100000, 5000);
      return {
        prompt: `The owner started a business with cash ${R(cash)}, ${a[1]} worth ${R(va)} and ${b[1]} worth ${R(vb)}. Pass the entry.`,
        lines: [dr('cash', cash), dr(a[0], va), dr(b[0], vb), cr('capital', cash + va + vb)],
        explanation: [
          `The business receives three assets: Cash A/c, ${nm(a[0])} and ${nm(b[0])} are debited with their values.`,
          `All of it is the owner's investment, so Capital A/c is credited with the total, ${R(cash + va + vb)}.`,
        ],
        distractorAccounts: ['purchases', 'bankLoan'],
      };
    },
    (q) => lineOf(q, 'capital') === amountsIn(q.prompt).reduce((s, v) => s + v, 0),
  ),
  direct(
    'je-compound-purchase-mixed',
    'je-compound',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const [id, label] = rng.pick<[string, string]>([
        ['officeEquipment', 'office equipment'],
        ['computers', 'computers'],
        ['furniture', 'furniture'],
      ]);
      const goods = amount(rng, 20000, 100000, 5000);
      const equip = amount(rng, 10000, 80000, 5000);
      const paid = amount(rng, 5000, 60000, 5000);
      if (paid >= goods + equip - rupees(5000)) return null;
      return {
        prompt: `Bought goods for resale for ${R(goods)} and ${label} for use in the business for ${R(equip)} from ${fin(p)} ${R(paid)} was paid by cheque and the balance is owed to ${fin(p)} Pass one entry.`,
        lines: [dr('purchases', goods), dr(id, equip), cr('bank', paid), cr(creditor(p), goods + equip - paid)],
        explanation: [
          `Goods for resale go to Purchases A/c (${R(goods)}); ${label} is an asset and goes to ${nm(id)} (${R(equip)}). Both are debited.`,
          `${nm('bank')} is credited with the cheque, ${R(paid)}.`,
          `The balance, ${R(goods)} + ${R(equip)} - ${R(paid)} = ${R(goods + equip - paid)}, is still owed: ${nm(creditor(p))} is credited.`,
        ],
        distractorAccounts: ['cash', 'repairs'],
      };
    },
    (q) => {
      const [goods, equip, paid] = amountsIn(q.prompt);
      return lineOf(q, 'purchases') === goods && lineOf(q, 'bank') === paid && sideTotal(q, 'Cr') === goods + equip;
    },
  ),
];

const expensesAndIncomes: JournalTemplate[] = [
  // ---- salary, rent, commission, carriage ----
  direct(
    'je-outstanding-paid',
    'je-expenses-incomes',
    'complex',
    (rng) => {
      const [id, label] = rng.pick<[string, string]>([
        ['salaries', 'salaries'],
        ['rent', 'rent'],
        ['wages', 'wages'],
      ]);
      const old = amount(rng, 2000, 20000, 1000);
      const current = amount(rng, 10000, 50000, 1000);
      return {
        prompt: `Paid ${R(old + current)} by cheque as ${label}. This included ${R(old)} that was recorded as outstanding at the end of last year and still stands in the books as a liability. Pass the entry.`,
        lines: [dr(id, current), dr('outstandingExpenses', old), cr('bank', old + current)],
        explanation: [
          `${R(old)} clears a liability recorded last year, so Outstanding Expenses A/c is debited.`,
          `The rest, ${R(old + current)} - ${R(old)} = ${R(current)}, is this year's expense: ${nm(id)} is debited.`,
          `The cheque for ${R(old + current)} reduces the bank balance: Bank A/c is credited.`,
        ],
        distractorAccounts: ['prepaidExpenses', 'cash'],
      };
    },
    (q) => {
      const [total, old] = amountsIn(q.prompt);
      return lineOf(q, 'outstandingExpenses') === old && lineOf(q, 'bank') === total && sideTotal(q, 'Dr') === total;
    },
  ),
  direct(
    'je-rent-received',
    'je-expenses-incomes',
    'easy',
    (rng) => {
      const a = amount(rng, 2000, 40000, 500);
      const m = mode(rng);
      return {
        prompt: rng.pick([
          `Received ${R(a)} ${paidHow(m)} as rent from a tenant to whom part of the premises is let out.`,
          `The business sublets a room and received ${R(a)} ${paidHow(m)} as rent for the month.`,
        ]),
        lines: [dr(m, a), cr('rentReceived', a)],
        explanation: [
          `${nm(m)} increases as money comes in: it is debited.`,
          'Rent that the business receives is an income: Rent Received A/c is credited. Rent A/c is for rent the business pays.',
        ],
        distractorAccounts: ['rent', 'incomeReceivedInAdvance'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-rent-received-advance',
    'je-expenses-incomes',
    'complex',
    (rng) => {
      // A tenant pays a quarter or half a year ahead, from a month near the year end: a few months fall after 31 March.
      const monthly = amount(rng, 2000, 15000, 500);
      const from = rng.pick(['January', 'February', 'March']);
      const now = 12 - MONTHS.indexOf(from); // January 3, February 2, March 1
      // Three months from January would all fall in this year: from January the tenant pays for six.
      const months = now === 3 ? 6 : rng.pick([3, 6]);
      const later = months - now;
      const who = rng.pick(['Joshi Opticals, a tenant of the front room', 'a tenant who runs a tailoring unit in the back room', 'Iyer Dental Clinic, which rents the first floor', 'a tenant who uses the godown for storing grain']);
      const total = monthly * months, next = monthly * later, current = monthly * now;
      return {
        prompt: `On 1 ${from}, received ${R(total)} by cheque from ${who}, as rent for ${months} months at ${R(monthly)} a month. The books are closed on 31 March. Pass one entry for the receipt that shows the rent for the next financial year separately as received in advance.`,
        lines: [dr('bank', total), cr('rentReceived', current), cr('incomeReceivedInAdvance', next)],
        explanation: [
          `The cheque increases the bank balance by ${R(total)}: Bank A/c is debited.`,
          `Months from 1 ${from} to 31 March: ${now}. Rent of this year = ${R(monthly)} x ${now} = ${R(current)}, an income: Rent Received A/c is credited.`,
          `The other ${later} months fall in the next year: ${R(monthly)} x ${later} = ${R(next)}. The use of the premises is still owed to the tenant, a liability: Income Received in Advance A/c is credited.`,
        ],
        distractorAccounts: ['rent', 'accruedIncome'],
      };
    },
    (q) => {
      // Months of this year counted again from the calendar: from the 1st of the month to 31 March.
      const [total, monthly] = amountsIn(q.prompt);
      const months = Number(/rent for (\d+) months/.exec(q.prompt)?.[1]);
      const from = /On 1 (\w+)/.exec(q.prompt)?.[1] ?? '';
      const now = { January: 3, February: 2, March: 1 }[from] ?? 0;
      return now > 0 && sideTotal(q, 'Dr') === total && total === monthly * months && lineOf(q, 'incomeReceivedInAdvance') === monthly * (months - now) && lineOf(q, 'rentReceived') === monthly * now;
    },
  ),
  direct(
    'je-commission-paid',
    'je-expenses-incomes',
    'easy',
    (rng) => {
      const a = amount(rng, 500, 15000, 500);
      const m = mode(rng);
      return {
        prompt: `Paid commission of ${R(a)} to an agent ${m === 'cash' ? 'in cash' : 'by cheque'}.`,
        lines: [dr('commissionPaid', a), cr(m, a)],
        explanation: [
          'Commission paid is a cost of doing business: Commission Paid A/c is debited. (Commission Received A/c is for commission the business earns.)',
          `${nm(m)} decreases as money goes out: it is credited.`,
        ],
        distractorAccounts: ['commissionReceived', 'salaries'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-carriage',
    'je-expenses-incomes',
    'medium',
    (rng) => {
      const a = amount(rng, 500, 15000, 500);
      const m = mode(rng);
      const inwards = rng.pick([true, false]);
      return {
        prompt: inwards
          ? `Paid ${R(a)} ${paidHow(m)} as carriage on goods purchased by the business.`
          : `Paid ${R(a)} ${paidHow(m)} as carriage on goods sold, which the business bears for delivery to its customers.`,
        lines: [dr(inwards ? 'carriageInwards' : 'carriageOutwards', a), cr(m, a)],
        explanation: [
          inwards
            ? 'Carriage on goods coming in is a cost of bringing the purchases to the shop: Carriage Inwards A/c is debited.'
            : 'Carriage on goods going out is a selling cost: Carriage Outwards A/c is debited.',
          `${nm(m)} decreases as money goes out: it is credited.`,
        ],
        distractorAccounts: inwards ? ['carriageOutwards', 'purchases'] : ['carriageInwards', 'sales'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-carriage-purchase',
    'je-expenses-incomes',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const goods = amount(rng, 10000, 90000, 5000);
      const carriage = amount(rng, 500, 5000, 500);
      return {
        prompt: `Purchased goods for ${R(goods)} on credit from ${fin(p)} Carriage of ${R(carriage)} on these goods was paid in cash and is recorded in Carriage Inwards A/c. Pass one entry.`,
        lines: [dr('purchases', goods), dr('carriageInwards', carriage), cr(creditor(p), goods), cr('cash', carriage)],
        explanation: [
          `Goods bought are debited to Purchases A/c (${R(goods)}); the carriage, ${R(carriage)}, is debited to Carriage Inwards A/c.`,
          `${nm(creditor(p))} is credited only with the price of the goods, ${R(goods)}: the carriage was not charged by ${fin(p)}`,
          `${nm('cash')} is credited with the carriage paid, ${R(carriage)}.`,
        ],
        distractorAccounts: ['carriageOutwards', 'freight'],
      };
    },
    (q) => {
      const [goods, carriage] = amountsIn(q.prompt);
      return lineOf(q, 'purchases') === goods && lineOf(q, 'carriageInwards') === carriage && lineOf(q, 'cash') === carriage && sideTotal(q, 'Dr') === goods + carriage;
    },
  ),

];

/** Journal questions whose prompt states the amount of the entry (the harness needs it) while the working stays in the prompt. */
const restated: JournalTemplate[] = [
  direct(
    'je-interest-capital',
    'je-adjustments',
    'medium',
    (rng) => {
      const capital = amount(rng, 100000, 900000, 50000);
      const rate = rng.pick([5, 6, 8, 10, 12]);
      const interest = (capital * rate) / 100;
      return {
        prompt: `Interest on capital at ${rate}% a year on the owner's capital of ${R(capital)} comes to ${R(interest)} for the year. Pass the entry, adding the interest to the capital account.`,
        lines: [dr('interestOnCapital', interest), cr('capital', interest)],
        explanation: [
          'The business owes this interest to the owner as the price of using the capital, so it is an expense: Interest on Capital A/c is debited.',
          'It is added to what the owner is owed, so Capital A/c is credited. Interest Paid A/c is for interest paid to outsiders.',
        ],
        distractorAccounts: ['interestPaid', 'interestReceived', 'drawings'],
      };
    },
    (q) => sideTotal(q, 'Dr') === amountsIn(q.prompt)[1] && sideTotal(q, 'Dr') * 100 === amountsIn(q.prompt)[0] * percentsIn(q.prompt)[0],
  ),
  direct(
    'je-salary-cheque',
    'je-expenses-incomes',
    'easy',
    (rng) => {
      const a = amount(rng, 8000, 150000, 1000);
      return {
        prompt: rng.pick([
          `Salaries for the month, ${R(a)}, were paid to the staff by cheque.`,
          `Paid ${R(a)} by cheque to the employees as salaries for the month.`,
        ]),
        lines: [dr('salaries', a), cr('bank', a)],
        explanation: [
          'Salaries are an expense of running the business: Salaries A/c is debited.',
          'The cheque reduces the bank balance: Bank A/c, an asset, is credited.',
        ],
        distractorAccounts: ['wages', 'outstandingExpenses'],
      };
    },
    totalIsFirstAmount,
  ),
  direct(
    'je-commission-expenses',
    'je-expenses-incomes',
    'complex',
    (rng) => {
      const sales = amount(rng, 20000, 200000, 10000);
      const rate = rng.pick([2, 5, 10]);
      const comm = (sales * rate) / 100;
      const travel = amount(rng, 500, 5000, 500);
      const m = mode(rng);
      return {
        prompt: `An agent arranged sales of ${R(sales)} this month and is entitled to commission at ${rate}% of them. The agent was paid ${R(comm + travel)} ${paidHow(m)} in all, which also covers ${R(travel)} of travelling expenses spent on the work of the business. Pass one entry.`,
        lines: [dr('commissionPaid', comm), dr('travellingExpenses', travel), cr(m, comm + travel)],
        explanation: [
          `Commission = ${rate}% of ${R(sales)} = ${R(comm)}: Commission Paid A/c is debited.`,
          `The rest of the payment, ${R(comm + travel)} - ${R(comm)} = ${R(travel)}, repays the agent's travelling costs: Travelling Expenses A/c is debited.`,
          `${nm(m)} is credited with the whole payment, ${R(comm + travel)}. Sales A/c is not touched.`,
        ],
        distractorAccounts: ['sales', 'commissionReceived', 'salaries'],
      };
    },
    (q) => {
      const [sales, total, travel] = amountsIn(q.prompt);
      const comm = (sales * percentsIn(q.prompt)[0]) / 100;
      return lineOf(q, 'commissionPaid') === comm && lineOf(q, 'travellingExpenses') === travel && sideTotal(q, 'Cr') === total && comm + travel === total;
    },
  ),
  direct(
    'je-cheque-dishonoured-charges',
    'je-banking',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const a = amount(rng, 5000, 60000, 1000);
      // Banks charge a few hundred rupees on a returned cheque, a little more on a large one.
      const charge = a <= rupees(20000) ? amount(rng, 100, 300, 50) : amount(rng, 200, 500, 50);
      const recover = rng.pick([true, false]);
      const who = recover ? `which the business will recover from ${p}` : 'which the business decides to bear itself';
      return {
        prompt: `A cheque for ${R(a)} from ${p}, deposited into the bank, was dishonoured. The bank debited ${R(a + charge)} to the business account in all, including ${R(charge)} of charges, ${fin(who)} Pass one entry.`,
        lines: recover
          ? [dr(debtor(p), a + charge), cr('bank', a + charge)]
          : [dr(debtor(p), a), dr('bankCharges', charge), cr('bank', a + charge)],
        explanation: [
          `The bank has taken out the failed cheque, ${R(a)}, and its charges, ${R(charge)}: Bank A/c is credited with ${R(a + charge)}.`,
          recover
            ? `${p} owes the cheque amount and the charges: ${nm(debtor(p))} is debited with ${R(a + charge)}.`
            : `${p} owes only the cheque amount: ${nm(debtor(p))} is debited with ${R(a)}. The charges are the business's own cost: Bank Charges A/c is debited with ${R(charge)}.`,
        ],
        distractorAccounts: recover ? ['bankCharges', 'badDebts'] : ['badDebts', 'discountAllowed'],
      };
    },
    (q) => {
      const [a, total, charge] = amountsIn(q.prompt);
      return total === a + charge && lineOf(q, 'bank') === total && sideTotal(q, 'Dr') === total && (lineOf(q, 'bankCharges') ?? charge) === charge;
    },
  ),

  // ---- trade discount and cash discount together: the cash discount is found from the amount paid ----
  direct(
    'je-purchase-trade-cash',
    'je-settlement',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const list = amount(rng, 10000, 100000, 10000);
      const trade = rng.pick([10, 20]);
      const cash = rng.pick([2, 5]);
      const net = list - (list * trade) / 100;
      const disc = (net * cash) / 100;
      const m = mode(rng);
      return {
        prompt: `Goods of list price ${R(list)} were bought from ${p} on credit at ${trade}% trade discount. Later the business paid ${R(net - disc)} ${paidHow(m)} in full settlement of the amount due for these goods, earning a cash discount. Pass the entry for the payment.`,
        lines: [dr(creditor(p), net), cr(m, net - disc), cr('discountReceived', disc)],
        explanation: [
          `Amount owed = ${R(list)} less ${trade}% trade discount = ${R(net)}. The trade discount is never recorded.`,
          `Cash discount = amount owed - amount paid = ${R(net)} - ${R(net - disc)} = ${R(disc)}, a gain: Discount Received A/c is credited.`,
          `${nm(creditor(p))} is debited with the whole ${R(net)}; ${nm(m)} is credited with ${R(net - disc)}.`,
        ],
        distractorAccounts: ['discountAllowed', 'purchasesReturn'],
      };
    },
    (q) => {
      const [list, paid] = amountsIn(q.prompt);
      const net = (list * (100 - percentsIn(q.prompt)[0])) / 100;
      return sideTotal(q, 'Dr') === net && lineOf(q, 'discountReceived') === net - paid && (lineOf(q, 'cash') ?? lineOf(q, 'bank')) === paid;
    },
  ),
  direct(
    'je-sale-trade-cash',
    'je-settlement',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const list = amount(rng, 10000, 100000, 10000);
      const trade = rng.pick([10, 20]);
      const cash = rng.pick([2, 5]);
      const net = list - (list * trade) / 100;
      const disc = (net * cash) / 100;
      const m = mode(rng);
      return {
        prompt: `Goods of list price ${R(list)} were sold to ${p} on credit at ${trade}% trade discount. Later ${p} paid ${R(net - disc)} ${paidHow(m)} in full settlement of the amount due for these goods, and the business allowed the difference as cash discount. Pass the entry for the receipt.`,
        lines: [dr(m, net - disc), dr('discountAllowed', disc), cr(debtor(p), net)],
        explanation: [
          `Amount due = ${R(list)} less ${trade}% trade discount = ${R(net)}. The trade discount is never recorded.`,
          `Cash discount = amount due - amount received = ${R(net)} - ${R(net - disc)} = ${R(disc)}, a loss: Discount Allowed A/c is debited.`,
          `${nm(m)} is debited with ${R(net - disc)}; ${nm(debtor(p))} is credited with the whole ${R(net)}.`,
        ],
        distractorAccounts: ['discountReceived', 'salesReturn'],
      };
    },
    (q) => {
      const [list, paid] = amountsIn(q.prompt);
      const net = (list * (100 - percentsIn(q.prompt)[0])) / 100;
      return sideTotal(q, 'Cr') === net && lineOf(q, 'discountAllowed') === net - paid && (lineOf(q, 'cash') ?? lineOf(q, 'bank')) === paid;
    },
  ),
];

// ---- adjustments that need working: the answer is an amount ----

const adjustmentNumeric = (
  id: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => NumericParts | null,
  verify?: (q: NumericQuestion) => boolean,
  conceptId = 'je-adjustments',
): Template => numericTemplate({ id, topicId: TOPIC, conceptId, difficulty, unit: 'rupees', generate, verify });

/** Months from the date to 31 March, counting the month that starts on the date: the part of the year that is used. */
const MONTH_NUMBERS: Record<string, number> = { '1 April': 12, '1 July': 9, '1 October': 6, '1 December': 4, '1 January': 3 };
/** The month named in "1 July": for checks that count the months again from the calendar instead of the table. */
const monthOf = (date: string | undefined): string => (date ?? '').replace(/^1 /, '');

const adjustmentAmounts: Template[] = [
  adjustmentNumeric(
    'je-outstanding-amount',
    'medium',
    (rng) => {
      const [label, verb, has] = rng.pick<[string, string, string]>([
        ['rent', 'is', 'It has'],
        ['salary', 'is', 'It has'],
        ['wages', 'are', 'They have'],
      ]);
      const monthly = amount(rng, 3000, 25000, 1000);
      const paidUpTo = rng.pick(['November', 'December', 'January', 'February']);
      const unpaid = monthsAfter(paidUpTo);
      return {
        prompt: `The monthly ${label} ${verb} ${R(monthly)}. ${has} been paid up to ${paidUpTo}, and the books are closed on 31 March. What amount is credited to Outstanding Expenses A/c in the adjusting entry?`,
        answer: monthly * unpaid,
        commonErrors: [
          { value: monthly * 12, why: 'Treated the whole year as unpaid.' },
          { value: monthly * (unpaid + 1), why: `Counted ${paidUpTo}, the last month paid, as unpaid too.` },
          { value: monthly * (unpaid - 1), why: 'Left out March, the last month of the year.' },
          { value: monthly, why: 'Took one month only.' },
        ],
        explanation: [
          `Months after ${paidUpTo} up to 31 March: ${unpaid}.`,
          `Unpaid ${label} = ${R(monthly)} x ${unpaid} = ${R(monthly * unpaid)}.`,
        ],
      };
    },
    (q) => q.answer === amountsIn(q.prompt)[0] * monthsAfter(/paid up to (\w+)/.exec(q.prompt)?.[1] ?? ''),
  ),
  adjustmentNumeric(
    'je-prepaid-amount',
    'medium',
    (rng) => {
      const date = rng.pick(['1 July', '1 October', '1 December', '1 January']);
      const used = MONTH_NUMBERS[date];
      const left = 12 - used;
      const monthly = amount(rng, 500, 5000, 500);
      const total = monthly * 12;
      return {
        prompt: `On ${date}, an insurance premium of ${R(total)} was paid for the 12 months starting that day and debited to Insurance A/c. The year ends on 31 March. What amount is debited to Prepaid Expenses A/c in the adjusting entry?`,
        answer: monthly * left,
        commonErrors: [
          { value: total, why: 'Treated the whole premium as prepaid.' },
          { value: monthly * used, why: 'Took the months already used up to 31 March instead of the months still to run after it.' },
          { value: monthly * (left + 1), why: 'Counted one month too many: March belongs to this year.' },
          { value: monthly * (left - 1), why: 'Counted one month too few.' },
        ],
        explanation: [
          `Premium per month = ${R(total)} / 12 = ${R(monthly)}.`,
          `Months used from ${date} to 31 March: ${used}. Months of cover still to run after 31 March: 12 - ${used} = ${left}.`,
          `Prepaid = ${R(monthly)} x ${left} = ${R(monthly * left)}.`,
        ],
      };
    },
    // Cover starting in the nth month of the year (April = 0) runs n months into the next year.
    (q) => q.answer * 12 === amountsIn(q.prompt)[0] * MONTHS.indexOf(monthOf(/On (1 \w+)/.exec(q.prompt)?.[1])),
  ),
  adjustmentNumeric(
    'je-depreciation-amount',
    'complex',
    (rng) => {
      const [label] = rng.pick<[string]>([['machine'], ['computer server'], ['delivery van'], ['set of furniture']]);
      const date = rng.pick(['1 July', '1 October', '1 December', '1 January']);
      const months = MONTH_NUMBERS[date];
      const cost = amount(rng, 40000, 400000, 20000);
      const rate = rng.pick([10, 15, 20]);
      const dep = (cost * rate * months) / 1200;
      if (dep % 100 !== 0) return null;
      return {
        prompt: `A ${label} costing ${R(cost)} was bought on ${date}. Depreciation is charged at ${rate}% a year on cost (straight-line method) for the months of use, and the year ends on 31 March. What amount is debited to Depreciation A/c for the first year?`,
        answer: dep,
        commonErrors: [
          { value: (cost * rate) / 100, why: 'Charged a full year although the asset was used for only part of the year.' },
          { value: cost - dep, why: 'Gave the value left after depreciation instead of the depreciation.' },
          { value: (cost * rate * (12 - months)) / 1200, why: 'Used the months the asset was not owned instead of the months of use.' },
        ],
        explanation: [`Months of use in the year: ${months}.`, `Depreciation = ${R(cost)} x ${rate}% x ${months}/12 = ${R(dep)}.`],
      };
    },
    // Months counted from the calendar: an asset bought in the nth month of the year (April = 0) is used for 12 - n months.
    (q) => q.answer * 1200 === amountsIn(q.prompt)[0] * percentsIn(q.prompt)[0] * (12 - MONTHS.indexOf(monthOf(/bought on (1 \w+)/.exec(q.prompt)?.[1]))),
  ),
  adjustmentNumeric(
    'je-interest-capital-months',
    'complex',
    (rng) => {
      const opening = amount(rng, 100000, 600000, 20000);
      const extra = amount(rng, 24000, 120000, 12000);
      const date = rng.pick(['1 July', '1 October', '1 December', '1 January']);
      const months = MONTH_NUMBERS[date];
      const rate = rng.pick([6, 8, 10, 12]);
      const onOpening = (opening * rate) / 100;
      const onExtra = (extra * rate * months) / 1200;
      if (onOpening % 100 !== 0 || onExtra % 100 !== 0) return null;
      return {
        prompt: `The owner's capital at the start of the year was ${R(opening)}. On ${date} the owner brought in a further ${R(extra)}. Interest on capital is allowed at ${rate}% a year, and the year ends on 31 March. What amount of interest on capital is credited to Capital A/c for the year?`,
        answer: onOpening + onExtra,
        commonErrors: [
          { value: ((opening + extra) * rate) / 100, why: 'Charged a full year of interest on the additional capital.' },
          { value: onOpening, why: 'Left out the interest on the additional capital.' },
          { value: onOpening + (extra * rate * (12 - months)) / 1200, why: 'Counted the months before the capital came in instead of the months after.' },
        ],
        explanation: [
          `Interest on ${R(opening)} for 12 months = ${R(onOpening)}.`,
          `Interest on ${R(extra)} for ${months} months = ${R(extra)} x ${rate}% x ${months}/12 = ${R(onExtra)}.`,
          `Total = ${R(onOpening + onExtra)}.`,
        ],
      };
    },
    (q) => {
      const [opening, extra] = amountsIn(q.prompt);
      const rate = percentsIn(q.prompt)[0];
      const months = 12 - MONTHS.indexOf(monthOf(/On (1 \w+)/.exec(q.prompt)?.[1]));
      return months <= 12 && q.answer * 1200 === opening * rate * 12 + extra * rate * months;
    },
  ),
  // Beyond the Class 11 syllabus: on no level and in no mock paper.
  beyondSyllabus(adjustmentNumeric(
    'je-interest-drawings-amount',
    'medium',
    (rng) => {
      const drawn = amount(rng, 12000, 96000, 12000);
      const date = rng.pick(['1 July', '1 October', '1 December', '1 January']);
      const months = MONTH_NUMBERS[date];
      const rate = rng.pick([6, 8, 10, 12]);
      const interest = (drawn * rate * months) / 1200;
      if (interest % 100 !== 0) return null;
      return {
        prompt: `On ${date} the owner withdrew ${R(drawn)} from the business for personal use; there were no other drawings in the year. Interest on drawings is charged at ${rate}% a year from the date of withdrawal, and the year ends on 31 March. What amount is credited to Interest on Drawings A/c?`,
        answer: interest,
        commonErrors: [
          { value: (drawn * rate) / 100, why: 'Charged a full year of interest although the money was out of the business for only part of the year.' },
          { value: (drawn * rate * (12 - months)) / 1200, why: 'Counted the months before the withdrawal instead of the months after it.' },
          { value: (drawn * rate) / 1200, why: 'Charged interest for one month only.' },
        ],
        explanation: [
          `Months from ${date} to 31 March: ${months}.`,
          `Interest = ${R(drawn)} x ${rate}% x ${months}/12 = ${R(interest)}.`,
          'Drawings A/c is debited and Interest on Drawings A/c is credited with this amount.',
        ],
      };
    },
    // Months counted from the calendar: a withdrawal in the nth month of the year (April = 0) is out for 12 - n months.
    (q) => q.answer * 1200 === amountsIn(q.prompt)[0] * percentsIn(q.prompt)[0] * (12 - MONTHS.indexOf(monthOf(/On (1 \w+)/.exec(q.prompt)?.[1]))),
  ), BEYOND_INTEREST_ON_DRAWINGS),
  adjustmentNumeric(
    'je-goods-cost-amount',
    'complex',
    (rng) => {
      const cost = amount(rng, 2000, 20000, 1000);
      const markup = rng.pick([20, 25, 50]);
      const price = (cost * (100 + markup)) / 100;
      if (price % 100 !== 0) return null;
      return {
        prompt: `The owner took goods for personal use. They are priced in the shop at ${R(price)}, which includes a profit of ${markup}% on cost. The withdrawal is recorded at cost. What amount is debited to Drawings A/c?`,
        answer: cost,
        commonErrors: [
          { value: price, why: 'Recorded the goods at the selling price instead of at cost.' },
          { value: price - (price * markup) / 100, why: 'Deducted the profit percentage from the selling price; the percentage is on cost, so the price must be worked back from cost.' },
          { value: (price * (100 + markup)) / 100, why: 'Added the profit margin again instead of removing it.' },
        ],
        explanation: [
          `Selling price = cost + ${markup}% of cost = cost x ${100 + markup}/100.`,
          `Cost = ${R(price)} x 100 / ${100 + markup} = ${R(cost)}.`,
          'Drawings A/c is debited with the cost; the profit margin is never recorded because nothing was sold.',
        ],
      };
    },
    (q) => q.answer * (100 + percentsIn(q.prompt)[0]) === amountsIn(q.prompt)[0] * 100,
    'je-goods-otherwise',
  ),
];

// ===============================================================================================================
// The rules of debit and credit (concept je-rules): choice and typed-amount questions.
// ===============================================================================================================

const mcq = (
  id: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => McqParts | null,
  verify?: (q: McqQuestion) => boolean,
): Template => mcqTemplate({ id, topicId: TOPIC, conceptId: 'je-rules', difficulty, generate, verify });

const numeric = (
  id: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => NumericParts | null,
  verify?: (q: NumericQuestion) => boolean,
): Template => numericTemplate({ id, topicId: TOPIC, conceptId: 'je-rules', difficulty, unit: 'rupees', generate, verify });

const count = (
  id: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => NumericParts | null,
  verify?: (q: NumericQuestion) => boolean,
): Template => numericTemplate({ id, topicId: TOPIC, conceptId: 'je-rules', difficulty, unit: 'number', generate, verify });

type Kind = AccountType;
const KIND_PHRASE: Record<Kind, string> = {
  asset: 'an asset',
  liability: 'a liability',
  capital: "part of the owner's capital",
  income: 'an income',
  expense: 'an expense',
};
/** "an asset account", "a liability account": for sentences that name the type of an account. */
const KIND_ACCOUNT: Record<Kind, string> = {
  asset: 'an asset',
  liability: 'a liability',
  capital: 'a capital',
  income: 'an income',
  expense: 'an expense',
};
const KIND_SIDE: Record<Kind, 'debit' | 'credit'> = { asset: 'debit', expense: 'debit', liability: 'credit', capital: 'credit', income: 'credit' };
const KIND_NAME: Record<Kind, string> = { asset: 'Asset', liability: 'Liability', capital: 'Capital', income: 'Income', expense: 'Expense' };
const KIND_MISTAKE: Record<Kind, string> = {
  asset: 'Took it for something the business owns.',
  liability: 'Took it for something the business owes to an outsider.',
  capital: "Took it for part of the owner's investment.",
  income: 'Took it for a gain earned by the business.',
  expense: 'Took it for a cost of running the business.',
};
const KINDS: Kind[] = ['asset', 'liability', 'capital', 'income', 'expense'];

// ---- a bank of simple transactions, each with the two accounts it affects ----

interface Scenario {
  text: (x: string, who: string) => string;
  /** Account labels; "{who}" stands for the party. */
  dr: string;
  cr: string;
  /** The type of each account, or null where it is a contra account or Drawings (left out of type questions). */
  drKind: Kind | null;
  crKind: Kind | null;
  /**
   * Accounts a student wrongly picks: the account, the mistake behind it (worded so that it is true whichever side
   * the question is about) and the side of the entry on which the student wrongly puts it.
   */
  near: [string, string, 'Dr' | 'Cr'][];
  explanation: string;
}

const fill = (label: string, who: string): string => label.replace('{who}', who);

const SCENARIOS: Scenario[] = [
  {
    text: (x) => `Furniture is bought for ${x} and paid for in cash.`,
    dr: 'Furniture A/c', drKind: 'asset', cr: 'Cash A/c', crKind: 'asset',
    near: [['Purchases A/c', 'Used Purchases, which is only for goods bought for resale.', 'Dr'], ['Capital A/c', "Brought the owner's capital into a transaction that does not involve the owner.", 'Cr']],
    explanation: 'Furniture, an asset, increases, so it is debited. Cash, an asset, decreases, so it is credited.',
  },
  {
    text: (x) => `Rent of ${x} is paid by cheque.`,
    dr: 'Rent A/c', drKind: 'expense', cr: 'Bank A/c', crKind: 'asset',
    near: [['Cash A/c', 'Used Cash although the payment was by cheque.', 'Cr'], ['Outstanding Expenses A/c', 'Took rent paid as rent still owed.', 'Cr']],
    explanation: 'Rent paid is an expense, so it is debited. The cheque reduces the bank balance, an asset, so Bank is credited.',
  },
  {
    text: (x, who) => `Goods worth ${x} are sold on credit to ${fin(who)}`,
    dr: '{who} A/c', drKind: 'asset', cr: 'Sales A/c', crKind: 'income',
    near: [['Cash A/c', 'Used Cash although nothing is received now.', 'Dr'], ['Purchases A/c', 'Used Purchases for goods that were sold; goods sold are recorded in Sales.', 'Cr']],
    explanation: 'The customer will pay later, so the debtor, an asset, increases and is debited. Sales, an income, is credited.',
  },
  {
    text: (x, who) => `Goods worth ${x} are bought on credit from ${fin(who)}`,
    dr: 'Purchases A/c', drKind: 'expense', cr: '{who} A/c', crKind: 'liability',
    near: [['Cash A/c', 'Used Cash although nothing is paid now.', 'Cr'], ['Sales A/c', 'Used Sales for goods that were bought; goods bought are recorded in Purchases.', 'Dr']],
    explanation: 'Goods bought are debited to Purchases. The supplier is owed money, a liability that increases, so the supplier is credited.',
  },
  {
    text: (x) => `Commission of ${x} is received in cash.`,
    dr: 'Cash A/c', drKind: 'asset', cr: 'Commission Received A/c', crKind: 'income',
    near: [['Commission Paid A/c', 'Took commission received as commission paid.', 'Cr'], ['Capital A/c', 'Took income as capital brought in by the owner.', 'Cr']],
    explanation: 'Cash, an asset, increases, so it is debited. Commission received is an income, so it is credited.',
  },
  {
    text: (x) => `The owner starts the business with ${x} in cash.`,
    dr: 'Cash A/c', drKind: 'asset', cr: 'Capital A/c', crKind: 'capital',
    near: [['Sales A/c', "Took the owner's money as sales.", 'Cr'], ['Bank Loan A/c', "Took the owner's money as a loan from a bank.", 'Cr']],
    explanation: "Cash, an asset, increases, so it is debited. The business now owes the owner this capital, which increases on the credit side.",
  },
  {
    text: (x) => `The owner takes ${x} in cash for personal use.`,
    dr: 'Drawings A/c', drKind: null, cr: 'Cash A/c', crKind: 'asset',
    near: [['Salaries A/c', "Took the owner's withdrawal as a salary expense.", 'Dr'], ['General Expenses A/c', "Took the owner's personal spending as a business expense.", 'Dr']],
    explanation: 'Drawings reduce capital, so Drawings is debited. Cash, an asset, decreases, so it is credited.',
  },
  {
    text: (x) => `Salaries of ${x} are paid in cash.`,
    dr: 'Salaries A/c', drKind: 'expense', cr: 'Cash A/c', crKind: 'asset',
    near: [['Outstanding Expenses A/c', 'Took salaries paid as salaries still owed.', 'Cr'], ['Drawings A/c', "Took the staff's pay as the owner's withdrawal.", 'Dr']],
    explanation: 'Salaries paid are an expense, so they are debited. Cash, an asset, decreases, so it is credited.',
  },
  {
    text: (x, who) => `${x} is received in cash from ${who}, a debtor.`,
    dr: 'Cash A/c', drKind: 'asset', cr: '{who} A/c', crKind: 'asset',
    near: [['Sales A/c', 'Took money from a debtor as a fresh sale: the sale was recorded earlier.', 'Cr'], ['Capital A/c', 'Took the receipt as capital brought in by the owner.', 'Cr']],
    explanation: 'Cash, an asset, increases, so it is debited. The debtor owes less, so the debtor\'s account, an asset, decreases and is credited.',
  },
  {
    text: (x, who) => `${x} is paid in cash to ${who}, a creditor.`,
    dr: '{who} A/c', drKind: 'liability', cr: 'Cash A/c', crKind: 'asset',
    near: [['Purchases A/c', 'Took payment of an old debt as a new purchase.', 'Dr'], ['Discount Received A/c', 'Took the payment as a gain although no discount is involved.', 'Cr']],
    explanation: 'The business owes the creditor less, so the creditor\'s account, a liability, decreases and is debited. Cash, an asset, decreases, so it is credited.',
  },
  {
    text: (x) => `${x} of cash is deposited into the bank account.`,
    dr: 'Bank A/c', drKind: 'asset', cr: 'Cash A/c', crKind: 'asset',
    near: [['Capital A/c', 'Took money moved to the bank as capital brought in.', 'Cr'], ['Drawings A/c', "Took cash leaving the till as the owner's withdrawal.", 'Dr']],
    explanation: 'Bank, an asset, increases, so it is debited. Cash, an asset, decreases, so it is credited.',
  },
  {
    text: (x) => `A bank loan of ${x} is taken and the bank puts the money straight into the business bank account.`,
    dr: 'Bank A/c', drKind: 'asset', cr: 'Bank Loan A/c', crKind: 'liability',
    near: [['Capital A/c', 'Took borrowed money as capital: a loan is owed to the bank, capital to the owner.', 'Cr'], ['Cash A/c', 'Used Cash although the money went straight into the bank account.', 'Dr']],
    explanation: 'Bank, an asset, increases, so it is debited. The loan is owed to the bank, a liability that increases, so it is credited.',
  },
  {
    text: (x) => `${x} of the bank loan is repaid by cheque.`,
    dr: 'Bank Loan A/c', drKind: 'liability', cr: 'Bank A/c', crKind: 'asset',
    near: [['Interest Paid A/c', 'Took repayment of the loan itself as interest.', 'Dr'], ['Cash A/c', 'Used Cash although the payment was by cheque.', 'Cr']],
    explanation: 'The business owes the bank less, so the liability decreases and is debited. Bank, an asset, decreases, so it is credited.',
  },
  {
    text: (x, who) => `Goods worth ${x}, sold earlier on credit, are returned by ${fin(who)} Record the return in the returns account.`,
    dr: 'Sales Return A/c', drKind: null, cr: '{who} A/c', crKind: null,
    near: [['Purchases Return A/c', 'Used the purchases return account for goods sent back by a customer.', 'Dr'], ['Cash A/c', 'Used Cash although no money changes hands.', 'Cr']],
    explanation: 'Sales Return reduces sales, so it is debited. The customer owes less, so the customer\'s account decreases and is credited.',
  },
  {
    text: (x, who) => `Goods worth ${x}, bought earlier on credit, are returned to ${fin(who)} Record the return in the returns account.`,
    dr: '{who} A/c', drKind: null, cr: 'Purchases Return A/c', crKind: null,
    near: [['Sales Return A/c', 'Used the sales return account for goods sent back to a supplier.', 'Cr'], ['Cash A/c', 'Used Cash although no money changes hands.', 'Dr']],
    explanation: 'The business owes the supplier less, so the supplier is debited. Purchases Return reduces purchases, so it is credited.',
  },
  {
    text: (x) => `At the year end, rent of ${x} for the year is due but not yet paid.`,
    dr: 'Rent A/c', drKind: 'expense', cr: 'Outstanding Expenses A/c', crKind: 'liability',
    near: [['Cash A/c', 'Used Cash although nothing has been paid.', 'Cr'], ['Prepaid Expenses A/c', 'Took rent still unpaid as rent paid in advance.', 'Cr']],
    explanation: 'The rent belongs to this year, so the expense is debited. The unpaid amount is a liability, so Outstanding Expenses is credited.',
  },
  {
    text: (x) => `Interest of ${x} on investments is received in cash.`,
    dr: 'Cash A/c', drKind: 'asset', cr: 'Interest Received A/c', crKind: 'income',
    near: [['Interest Paid A/c', 'Took interest received as interest paid.', 'Cr'], ['Investments A/c', 'Took the investments themselves as the account affected; only the interest earned on them is income.', 'Cr']],
    explanation: 'Cash, an asset, increases, so it is debited. Interest received is an income, so it is credited.',
  },
  {
    text: (x, who) => `${x} due from ${who} is written off as a bad debt.`,
    dr: 'Bad Debts A/c', drKind: 'expense', cr: '{who} A/c', crKind: 'asset',
    near: [['Bad Debts Recovered A/c', 'Took a write-off as a recovery.', 'Dr'], ['Sales Return A/c', 'Took the write-off as goods returned.', 'Dr']],
    explanation: 'The lost debt is an expense, so Bad Debts is debited. The debtor, an asset, no longer owes anything collectable, so the debtor\'s account is credited.',
  },
  {
    text: (x) => `Depreciation of ${x} is charged on machinery, reducing the machinery account directly.`,
    dr: 'Depreciation A/c', drKind: 'expense', cr: 'Machinery A/c', crKind: 'asset',
    near: [['Cash A/c', 'Used Cash although depreciation involves no payment.', 'Cr'], ['Repairs A/c', 'Took depreciation as a repair cost.', 'Dr']],
    explanation: 'Depreciation is an expense, so it is debited. Machinery, an asset, loses value, so it is credited.',
  },
  {
    text: (x) => `Insurance premium of ${x} is paid by cheque.`,
    dr: 'Insurance A/c', drKind: 'expense', cr: 'Bank A/c', crKind: 'asset',
    near: [['Insurance Claim Receivable A/c', 'Took a premium paid to the insurer as a claim due from the insurer.', 'Dr'], ['Cash A/c', 'Used Cash although the payment was by cheque.', 'Cr']],
    explanation: 'The premium is an expense, so it is debited. The cheque reduces the bank balance, an asset, so Bank is credited.',
  },
  {
    text: (x) => `The bank deducts ${x} from the business account as service charges.`,
    dr: 'Bank Charges A/c', drKind: 'expense', cr: 'Bank A/c', crKind: 'asset',
    near: [['Cash A/c', 'Used Cash although the bank deducted the amount.', 'Cr'], ['Interest Paid A/c', 'Took service charges as interest on a loan.', 'Dr']],
    explanation: 'Charges are an expense, so Bank Charges is debited. The bank balance, an asset, falls, so Bank is credited.',
  },
  {
    text: (x) => `Old furniture standing in the books at ${x} is sold for cash at that amount.`,
    dr: 'Cash A/c', drKind: 'asset', cr: 'Furniture A/c', crKind: 'asset',
    near: [['Sales A/c', 'Used Sales, which is only for goods the business deals in.', 'Cr'], ['Profit on Sale of Asset A/c', 'Recorded a profit although the price equals the book value.', 'Cr']],
    explanation: 'Cash, an asset, increases, so it is debited. Furniture, an asset, goes out of the business, so it is credited.',
  },
];

const findScenario = (prompt: string): { s: Scenario; who: string } | null => {
  const x = R(amountsIn(prompt)[0]);
  for (const s of SCENARIOS) for (const who of PARTIES) if (prompt.startsWith(s.text(x, who))) return { s, who };
  return null;
};
const correctText = (q: McqQuestion): string | undefined => q.options.find((o) => o.id === q.correct)?.text;

/** Which account is debited / credited in a simple transaction. */
const sideQuestion = (id: string, side: 'Dr' | 'Cr') =>
  mcq(
    id,
    'easy',
    (rng) => {
      const s = rng.pick(SCENARIOS);
      const who = rng.pick(PARTIES);
      const x = R(amount(rng, 2000, 90000, 1000));
      const right = fill(side === 'Dr' ? s.dr : s.cr, who);
      const other = fill(side === 'Dr' ? s.cr : s.dr, who);
      const words = side === 'Dr' ? 'debited' : 'credited';
      return {
        prompt: `${s.text(x, who)} Which account is ${words}?`,
        correct: right,
        distractors: [
          { text: other, why: `Reversed the entry: ${other} is the account that is ${side === 'Dr' ? 'credited' : 'debited'}.` },
          ...s.near.map(([label, why]) => ({ text: fill(label, who), why })),
        ],
        explanation: s.explanation,
      };
    },
    (q) => {
      const found = findScenario(q.prompt);
      return found !== null && correctText(q) === fill(side === 'Dr' ? found.s.dr : found.s.cr, found.who);
    },
  );

/** The entry as a pair: debit this, credit that. A near account replaces the side a student wrongly uses it on. */
const pairQuestion = mcq(
  'je-rules-pair',
  'medium',
  (rng) => {
    const s = rng.pick(SCENARIOS);
    const who = rng.pick(PARTIES);
    const x = R(amount(rng, 2000, 90000, 1000));
    const dr1 = fill(s.dr, who);
    const cr1 = fill(s.cr, who);
    const entry = (a: string, b: string) => `Debit ${a}; credit ${b}`;
    const swapped = s.near.map(([label, why, side]) => ({
      text: side === 'Dr' ? entry(fill(label, who), cr1) : entry(dr1, fill(label, who)),
      why,
    }));
    const wrongDr = s.near.find(([, , side]) => side === 'Dr');
    const wrongCr = s.near.find(([, , side]) => side === 'Cr');
    return {
      prompt: `${s.text(x, who)} Which entry records it?`,
      correct: entry(dr1, cr1),
      distractors: [
        { text: entry(cr1, dr1), why: 'Reversed the two sides of the entry.' },
        ...swapped,
        ...(wrongDr && wrongCr
          ? [{ text: entry(fill(wrongDr[0], who), fill(wrongCr[0], who)), why: `Got both accounts wrong. ${wrongDr[1]} ${wrongCr[1]}` }]
          : []),
      ],
      explanation: s.explanation,
    };
  },
  (q) => {
    const found = findScenario(q.prompt);
    return found !== null && correctText(q) === `Debit ${fill(found.s.dr, found.who)}; credit ${fill(found.s.cr, found.who)}`;
  },
);

/** Which transaction debits one type of account and credits another. */
const typedScenarios = SCENARIOS.filter((s) => s.drKind !== null && s.crKind !== null);
const pairOf = (s: Scenario): string => `${s.drKind}/${s.crKind}`;

const transactionByTypes = mcq('je-rules-which-transaction', 'medium', (rng) => {
  const s = rng.pick(typedScenarios);
  const who = rng.pick(PARTIES);
  const x = R(amount(rng, 2000, 90000, 1000));
  const wrong = rng.shuffle(typedScenarios.filter((t) => pairOf(t) !== pairOf(s)));
  // Three transactions with different type pairs, so that no wrong option fits the question.
  const picked: Scenario[] = [];
  for (const t of wrong) if (picked.length < 4 && !picked.some((p) => p.text('', '') === t.text('', ''))) picked.push(t);
  const dk = s.drKind as Kind;
  const ck = s.crKind as Kind;
  return {
    prompt:
      dk === ck
        ? `Which of these transactions is recorded by debiting one ${dk} account and crediting another ${ck} account?`
        : `Which of these transactions is recorded by debiting ${KIND_ACCOUNT[dk]} account and crediting ${KIND_ACCOUNT[ck]} account?`,
    correct: s.text(x, who),
    distractors: picked.map((t) => {
      const td = t.drKind as Kind;
      const tc = t.crKind as Kind;
      const why =
        td === dk
          ? `Matched the debit side only: this one credits ${KIND_ACCOUNT[tc]} account.`
          : tc === ck
            ? `Matched the credit side only: this one debits ${KIND_ACCOUNT[td]} account.`
            : `Matched neither side: this one debits ${KIND_ACCOUNT[td]} account and credits ${KIND_ACCOUNT[tc]} account.`;
      return { text: t.text(x, who), why };
    }),
    explanation: `${s.text(x, who)} ${s.explanation}`,
  };
}, (q) => {
  const asked = /debiting (?:an?|one) (\w+) account and crediting (?:an?|another) (\w+) account/.exec(q.prompt);
  if (!asked) return false;
  const fits = (text: string): boolean => {
    const x = R(amountsIn(text)[0] ?? 0);
    return typedScenarios.some((t) => t.drKind === asked[1] && t.crKind === asked[2] && PARTIES.some((who) => t.text(x, who) === text));
  };
  return q.options.filter((o) => fits(o.text)).length === 1 && fits(correctText(q) ?? '');
});

// ---- the type of an account ----

interface TypeItem {
  name: string;
  kind: Kind;
  /** The most likely wrong type and the mistake behind it. */
  trap?: [Kind, string];
  ask?: string;
  /** Why the account is of this type, where the name alone does not say it. */
  note?: string;
}

const PLAIN_TYPES: TypeItem[] = [
  { name: 'Debtors', kind: 'asset', trap: ['income', 'Took debtors as an income because the money comes from sales.'] },
  { name: 'Creditors', kind: 'liability', trap: ['expense', 'Took creditors as an expense because the business pays them.'] },
  { name: 'Machinery', kind: 'asset' },
  { name: 'Building', kind: 'asset', trap: ['expense', 'Took the building for a cost, like rent, instead of something the business owns.'] },
  { name: 'Rent', kind: 'expense', trap: ['liability', 'Took rent as an amount owed.'] },
  { name: 'Salaries', kind: 'expense' },
  { name: 'Commission Received', kind: 'income', trap: ['expense', 'Took commission received as commission paid.'] },
  { name: 'Interest Received', kind: 'income' },
  { name: 'Bank Loan', kind: 'liability', trap: ['asset', 'Took a loan as an asset because the cash comes into the bank.'] },
  { name: 'Furniture', kind: 'asset' },
  { name: 'Sales', kind: 'income', trap: ['asset', 'Took sales as an asset because cash or a debtor comes in.'] },
  { name: 'Purchases', kind: 'expense', trap: ['asset', 'Took purchases as an asset because the goods are still unsold.'] },
  { name: 'Cash', kind: 'asset' },
  { name: 'Bills Payable', kind: 'liability', trap: ['asset', 'Took bills payable as an asset because it is a bill.'] },
  { name: 'Bills Receivable', kind: 'asset', trap: ['income', 'Took bills receivable as an income.'] },
  { name: 'Wages', kind: 'expense' },
  { name: 'Rent Received', kind: 'income', trap: ['expense', 'Took rent received as rent paid.'] },
  { name: 'Investments', kind: 'asset', trap: ['income', 'Took investments as income because they earn interest.'] },
];

const ADJUSTMENT_TYPES: TypeItem[] = [
  { name: 'Outstanding Rent', kind: 'liability', note: 'Rent that is due but unpaid is owed to the landlord.', trap: ['expense', 'Took it for an expense; the unpaid amount is owed, and Rent is the expense.'] },
  { name: 'Prepaid Insurance', kind: 'asset', note: 'The part of the premium paid for a later period is a benefit still to come.', trap: ['expense', 'Took it for an expense because insurance is an expense; the part paid in advance is not yet used up.'] },
  { name: 'Accrued Interest', kind: 'asset', note: 'Interest earned but not yet received is an amount due to the business.', trap: ['income', 'Took it for an income because interest is an income; the part not yet received is an amount due.'] },
  { name: 'Rent Received in Advance', kind: 'liability', note: 'Rent taken for a later period is owed to the tenant as the use of the premises.', trap: ['income', 'Took it for an income because rent is an income; the part for the future is owed to the tenant.'] },
  { name: 'Drawings', kind: 'capital', ask: 'Drawings A/c reduces which group of accounts?', trap: ['expense', "Took the owner's withdrawals for an expense of the business."] },
  { name: 'Bad Debts', kind: 'expense', note: 'A debt that cannot be collected is a loss, and losses are grouped with expenses.', trap: ['asset', 'Took bad debts as a debtor balance.'] },
  { name: 'Interest on Capital', kind: 'expense', note: 'The business allows it to the owner as the cost of using the capital.', trap: ['capital', 'Took interest on capital as part of capital because it is paid to the owner.'] },
  { name: 'Bank Overdraft', kind: 'liability', note: 'An overdraft is money owed to the bank.', trap: ['asset', 'Took an overdraft as a bank balance, when it is money owed to the bank.'] },
  { name: 'Discount Allowed', kind: 'expense', note: 'It is the amount given up to a debtor who pays promptly, a loss.', trap: ['income', 'Took discount allowed as a gain.'] },
  { name: 'Discount Received', kind: 'income', note: 'It is the amount a creditor gives up when the business pays promptly, a gain.', trap: ['expense', 'Took discount received as a cost.'] },
  { name: 'Bad Debts Recovered', kind: 'income', note: 'Money collected on a debt already written off is a gain.', trap: ['asset', 'Took the recovery as a debtor balance.'] },
  // Interest on drawings of a sole proprietor is beyond the 2025-26 syllabus: its place is taken by an advance income.
  { name: 'Commission Received in Advance', kind: 'liability', note: 'Commission taken for work still to be done is owed to the payer as that work.', trap: ['income', 'Took it for an income because commission received is an income; the part for the future is still owed.'] },
  { name: 'Loss by Fire', kind: 'expense', note: 'The cost of goods destroyed is a loss, and losses are grouped with expenses.', trap: ['asset', 'Took the loss as goods still held.'] },
  { name: 'Carriage Inwards', kind: 'expense', note: 'It is a cost of bringing purchased goods to the business.', trap: ['asset', 'Took carriage on purchases as an asset, as if it were goods.'] },
  { name: 'Insurance Claim Receivable', kind: 'asset', note: 'A claim admitted is an amount due from the insurer.', trap: ['income', 'Took the claim as an income instead of an amount due.'] },
];

const typeQuestion = (id: string, difficulty: Difficulty, items: TypeItem[]) =>
  mcq(
    id,
    difficulty,
    (rng) => {
      const item = rng.pick(items);
      const others = KINDS.filter((k) => k !== item.kind);
      return {
        prompt: item.ask ?? `What type of account is ${item.name} A/c?`,
        correct: KIND_NAME[item.kind],
        distractors: others.map((k) => ({ text: KIND_NAME[k], why: item.trap?.[0] === k ? item.trap[1] : KIND_MISTAKE[k] })),
        explanation: `${item.note ? `${item.note} ` : ''}${item.name} A/c is ${item.name === 'Drawings' ? 'a deduction from capital' : KIND_PHRASE[item.kind]}, so it increases on the ${item.name === 'Drawings' ? 'debit' : KIND_SIDE[item.kind]} side.`,
      };
    },
    (q) => {
      const item = items.find((i) => q.prompt === (i.ask ?? `What type of account is ${i.name} A/c?`));
      return item !== undefined && correctText(q) === KIND_NAME[item.kind];
    },
  );

// ---- which side an account increases on ----

// Capital accounts are left out: "Capital is a liability of the business to its owner" is a statement a student can defend.
// Interest on drawings of a sole proprietor is beyond the 2025-26 syllabus, so its account is never asked about.
const SIDE_ACCOUNTS = CLASS11_ACCOUNTS.filter((a) => !a.contra && !a.temporary && a.type !== 'capital' && a.id !== 'interestOnDrawings');

const sideOfAccount = mcq(
  'je-rules-side',
  'easy',
  (rng) => {
    const a = rng.pick(SIDE_ACCOUNTS);
    const side = KIND_SIDE[a.type];
    const opposite = side === 'debit' ? 'credit' : 'debit';
    const statement = (k: Kind, s: string) => `${a.name} A/c is ${KIND_PHRASE[k]}, so it increases on the ${s} side`;
    return {
      prompt: `Which statement about ${a.name} A/c is correct?`,
      correct: statement(a.type, side),
      distractors: [
        { text: statement(a.type, opposite), why: `Applied the ${opposite}-side rule to ${KIND_PHRASE[a.type]}.` },
        ...KINDS.filter((k) => k !== a.type).map((k) => ({
          text: statement(k, KIND_SIDE[k]),
          why: `Took ${a.name} for ${KIND_PHRASE[k]}.`,
        })),
      ],
      explanation: `${a.name} A/c is ${KIND_PHRASE[a.type]}. ${a.type === 'asset' || a.type === 'expense' ? 'Assets and expenses' : 'Liabilities, capital and incomes'} increase on the ${side} side and decrease on the ${opposite} side.`,
    };
  },
  (q) => {
    const name = /about (.+) A\/c is correct/.exec(q.prompt)?.[1];
    const a = SIDE_ACCOUNTS.find((x) => x.name === name);
    return a !== undefined && correctText(q) === `${a.name} A/c is ${KIND_PHRASE[a.type]}, so it increases on the ${normalSide(a) === 'Dr' ? 'debit' : 'credit'} side`;
  },
);

/** [label, why it increases on this side, the mistake of picking it for the other side] */
type Pool = [string, string, string][];
const DEBIT_POOL: Pool = [
  ['Cash A/c', 'Cash is an asset, and assets increase on the debit side.', 'Took cash as a credit-side account because money "comes in".'],
  ['Machinery A/c', 'Machinery is an asset, and assets increase on the debit side.', 'Took machinery as something owed instead of something owned.'],
  ['Rent A/c', 'Rent paid is an expense, and expenses increase on the debit side.', 'Treated rent paid as an income.'],
  ['Salaries A/c', 'Salaries paid are an expense, and expenses increase on the debit side.', 'Took salaries as an amount owed instead of a cost.'],
  ['Purchases A/c', 'Goods bought are debited to Purchases, an expense account.', 'Took purchases as a liability because they are often made on credit.'],
  ['Drawings A/c', 'Drawings reduce capital, so Drawings works opposite to capital and increases on the debit side.', 'Took Drawings as part of capital, which increases on the credit side.'],
  ['Sales Return A/c', 'Sales Return reduces sales, so it works opposite to Sales and increases on the debit side.', 'Took Sales Return as an income like Sales.'],
  ['Bad Debts A/c', 'Bad debts are a loss, and losses increase on the debit side.', 'Took bad debts as a gain because a debtor account closes.'],
  ['Prepaid Expenses A/c', 'Prepaid expenses are an asset (paid for, not yet used), and assets increase on the debit side.', 'Took prepaid expenses as a liability.'],
  ['Depreciation A/c', 'Depreciation is an expense, and expenses increase on the debit side.', 'Confused the Depreciation account with the credit given to the asset.'],
  ['Insurance Claim Receivable A/c', 'The claim is an amount due from the insurer, an asset, so it increases on the debit side.', 'Took the claim as an income.'],
  ['Interest on Capital A/c', 'Interest on capital is an expense of the business, and expenses increase on the debit side.', 'Took interest on capital as an addition to capital, so credited it.'],
  ['Accrued Income A/c', 'Accrued income is an amount still to be received, an asset, so it increases on the debit side.', 'Took accrued income as an income account.'],
  ['Loss by Fire A/c', 'A loss is an expense, and expenses increase on the debit side.', 'Took a loss as an amount owed.'],
  ['Bank A/c', 'Bank is an asset, and assets increase on the debit side.', 'Took the bank balance as an amount owed to the bank.'],
];
const CREDIT_POOL: Pool = [
  ['Capital A/c', 'Capital is what the business owes the owner, and it increases on the credit side.', 'Took capital as an asset because it is money in the business.'],
  ['Sales A/c', 'Sales are an income, and incomes increase on the credit side.', 'Took sales as an asset because cash comes in.'],
  ['Bank Loan A/c', 'A bank loan is a liability, and liabilities increase on the credit side.', 'Took the loan as an asset because the cash comes in.'],
  ['Outstanding Expenses A/c', 'Outstanding expenses are owed, a liability, and liabilities increase on the credit side.', 'Took outstanding expenses as an expense.'],
  ['Rent Received A/c', 'Rent received is an income, and incomes increase on the credit side.', 'Took rent received as an expense.'],
  ['Commission Received A/c', 'Commission received is an income, and incomes increase on the credit side.', 'Took commission received as commission paid.'],
  ['Purchases Return A/c', 'Purchases Return reduces purchases, so it works opposite to Purchases and increases on the credit side.', 'Took Purchases Return as an expense like Purchases.'],
  ['Provision for Depreciation A/c', 'It reduces the value of the fixed assets, so it works opposite to an asset and increases on the credit side.', 'Took it as an asset because it is linked to assets.'],
  ['Income Received in Advance A/c', 'Income received in advance is owed to the payer, a liability, so it increases on the credit side.', 'Took income received in advance as an asset because cash was received.'],
  ['Bad Debts Recovered A/c', 'Bad debts recovered is a gain, and gains increase on the credit side.', 'Took the recovery as a debtor balance.'],
  ['Discount Received A/c', 'Discount received is a gain, and gains increase on the credit side.', 'Took discount received as an expense.'],
  // In place of Interest on Drawings A/c, which is beyond the 2025-26 syllabus for a sole proprietor.
  ['Output CGST A/c', 'Output CGST is tax collected on sales and owed to the government, a liability, so it increases on the credit side.', 'Took output tax as an asset, like the input tax paid on purchases.'],
  ['Bills Payable A/c', 'Bills payable are owed, a liability, so they increase on the credit side.', 'Took bills payable as an asset because it is a bill.'],
  ['General Reserve A/c', "A reserve belongs to the owner, so it increases on the credit side along with capital.", 'Took a reserve as an asset because it is set aside.'],
  ['Interest Received A/c', 'Interest received is an income, and incomes increase on the credit side.', 'Took interest received as interest paid.'],
];

const whichIncreases = (id: string, side: 'debit' | 'credit') => {
  const own = side === 'debit' ? DEBIT_POOL : CREDIT_POOL;
  const other = side === 'debit' ? CREDIT_POOL : DEBIT_POOL;
  return mcq(
    id,
    'medium',
    (rng) => {
      const [label, rule] = rng.pick(own);
      return {
        prompt: `Which one of these accounts increases on the ${side} side?`,
        correct: label,
        distractors: rng.shuffle(other).slice(0, 5).map(([text, , why]) => ({ text, why })),
        explanation: rule,
      };
    },
    (q) => {
      const right = correctText(q);
      return own.some(([label]) => label === right) && q.options.filter((o) => o.id !== q.correct).every((o) => other.some(([label]) => label === o.text));
    },
  );
};

// ---- how a transaction moves the owner's capital ----

const CAPITAL_DOWN: [(x: string) => string][] = [
  [(x) => `Rent of ${x} is paid in cash.`],
  [(x) => `The owner withdraws ${x} for personal use.`],
  [(x) => `Salaries of ${x} are paid by cheque.`],
  [(x) => `Goods costing ${x} are destroyed by fire and were not insured.`],
  [(x) => `A debt of ${x} due from a customer is written off as bad.`],
  [(x) => `Telephone charges of ${x} are paid by cheque.`],
];
const CAPITAL_UP: [(x: string) => string][] = [
  [(x) => `The owner brings ${x} in cash as additional capital.`],
  [(x) => `Commission of ${x} is received in cash.`],
  [(x) => `Rent of ${x} is received by cheque from a tenant.`],
  [(x) => `The bank credits ${x} to the business account as interest.`],
  [(x) => `A bad debt of ${x}, written off earlier, is recovered in cash.`],
];
const CAPITAL_SAME: [(x: string) => string, string][] = [
  [(x) => `Furniture is bought for ${x} and paid for by cheque.`, 'Thought buying an asset changes capital; the bank balance is only exchanged for furniture.'],
  [(x) => `${x} of cash is deposited into the bank.`, 'Thought moving money changes capital; only the place of the money changed.'],
  [(x) => `${x} of a bank loan is repaid by cheque.`, 'Thought repaying a loan changes capital; an asset and a liability fall together.'],
  [(x) => `A bank loan of ${x} is received.`, 'Thought borrowing changes capital; an asset and a liability rise together.'],
  [(x) => `${x} is received in cash from a debtor.`, 'Thought collecting a debt changes capital; one asset (the debtor) is only exchanged for another (cash).'],
  [(x) => `${x} is paid in cash to a creditor.`, 'Thought paying a creditor changes capital; an asset and a liability fall together.'],
  [(x) => `Machinery is bought for ${x} on credit.`, 'Thought buying an asset on credit changes capital; an asset and a liability rise together.'],
];

const capitalEffect = mcq('je-rules-capital-effect', 'medium', (rng) => {
  const x = R(amount(rng, 2000, 90000, 1000));
  const decrease = rng.pick([true, false]);
  const [right] = rng.pick(decrease ? CAPITAL_DOWN : CAPITAL_UP);
  const opposite = decrease ? CAPITAL_UP : CAPITAL_DOWN;
  const reversed = rng.shuffle(opposite).slice(0, 2).map(([t]) => ({
    text: t(x),
    why: decrease ? 'Read the effect backwards: this adds to capital.' : 'Read the effect backwards: this reduces capital.',
  }));
  const neutral = rng.shuffle(CAPITAL_SAME).slice(0, 3).map(([t, why]) => ({ text: t(x), why }));
  return {
    prompt: `Which of these transactions ${decrease ? 'reduces' : 'increases'} the owner's capital?`,
    correct: right(x),
    distractors: [...reversed, ...neutral],
    explanation: decrease
      ? 'Expenses, losses and drawings reduce capital. Paying a liability, buying an asset, or moving money between assets does not.'
      : 'Capital brought in and incomes earned increase capital. Borrowing, collecting from debtors, or moving money between assets does not.',
  };
}, (q) => {
  const list = q.prompt.includes('reduces') ? CAPITAL_DOWN : CAPITAL_UP;
  const fits = (text: string): boolean => list.some(([t]) => t(R(amountsIn(text)[0] ?? 0)) === text);
  return q.options.filter((o) => fits(o.text)).length === 1 && fits(correctText(q) ?? '');
});

// ---- amounts: GST, trade discount, party accounts, asset cost, cash discount ----

const numericRules: Template[] = [
  numeric(
    'je-rules-gst-credit',
    'easy',
    (rng) => {
      const x = amount(rng, 5000, 80000, 1000);
      const g = gstRate(rng);
      const kind = rng.pick(['saleIntra', 'purchaseIntra', 'saleInter'] as const);
      const full = percentOf(x, g);
      const half = full / 2;
      if (full % 200 !== 0) return null;
      const prompts = {
        saleIntra: `Goods worth ${R(x)} (before GST) are sold on credit within the state, with GST at ${g}%. What amount is credited to Output CGST A/c?`,
        purchaseIntra: `Goods worth ${R(x)} (before GST) are bought on credit within the state, with GST at ${g}%. What amount is debited to Input SGST A/c?`,
        saleInter: `Goods worth ${R(x)} (before GST) are sold on credit to a customer in another state, with GST at ${g}%. What amount is credited to Output IGST A/c?`,
      };
      if (kind === 'saleInter') {
        return {
          prompt: prompts[kind],
          answer: full,
          commonErrors: [
            { value: half, why: 'Halved the tax, but IGST is charged in full on a sale to another state.' },
            { value: x + full, why: 'Gave the invoice total instead of the tax alone.' },
          ],
          explanation: [`Between states the whole tax goes to IGST: ${g}% of ${R(x)} = ${R(full)}.`],
        };
      }
      return {
        prompt: prompts[kind],
        answer: half,
        commonErrors: [
          { value: full, why: 'Put the whole GST in one account instead of splitting it equally between CGST and SGST.' },
          { value: x + half, why: 'Gave the value of the goods plus the tax, not the tax alone.' },
        ],
        explanation: [`Total GST = ${g}% of ${R(x)} = ${R(full)}.`, `Within the state it is shared equally: ${R(full)} / 2 = ${R(half)} each for CGST and SGST.`],
      };
    },
    (q) => {
      const x = amountsIn(q.prompt)[0];
      const g = percentsIn(q.prompt)[0];
      return q.answer * 100 * (q.prompt.includes('IGST') ? 1 : 2) === x * g;
    },
  ),
  numeric(
    'je-rules-party-amount',
    'medium',
    (rng) => {
      const p = rng.pick(PARTIES);
      const list = amount(rng, 10000, 100000, 10000);
      const t = rng.pick([10, 20]);
      const g = gstRate(rng);
      const net = list - percentOf(list, t);
      const total = net + percentOf(net, g);
      const sale = rng.pick([true, false]);
      const verb = sale ? `sold to ${p} on credit` : `bought from ${p} on credit`;
      return {
        prompt: `Goods of list price ${R(list)} are ${verb} at ${t}% trade discount. GST at ${g}% is charged on the price after trade discount (within the state). What amount is ${sale ? 'debited to' : 'credited to'} ${poss(p)} account?`,
        answer: total,
        commonErrors: [
          { value: net, why: `Left out the GST: ${sale ? 'the customer owes' : 'the supplier is owed'} the tax as well as the price.` },
          { value: list + percentOf(list, g), why: 'Ignored the trade discount and charged GST on the list price.' },
          { value: net + percentOf(list, g), why: 'Charged GST on the list price instead of on the price after trade discount.' },
          { value: list, why: 'Used the list price: trade discount and GST both missed.' },
        ],
        explanation: [
          `Price after trade discount = ${R(list)} - ${t}% = ${R(net)}.`,
          `GST = ${g}% of ${R(net)} = ${R(percentOf(net, g))}.`,
          `${poss(p)} account is ${sale ? 'debited' : 'credited'} with the invoice total: ${R(net)} + ${R(percentOf(net, g))} = ${R(total)}.`,
        ],
      };
    },
    (q) => {
      const list = amountsIn(q.prompt)[0];
      const [t, g] = percentsIn(q.prompt);
      return q.answer * 10000 === list * (100 - t) * (100 + g);
    },
  ),
  numeric(
    'je-rules-party-amount-purchase',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const list = amount(rng, 20000, 120000, 20000);
      const t = rng.pick([10, 20]);
      const g = gstRate(rng);
      const pc = rng.pick([25, 40, 60, 75]);
      const carriage = amount(rng, 500, 5000, 500);
      const net = list - percentOf(list, t);
      const total = net + percentOf(net, g);
      const paid = (total * pc) / 100;
      if (paid % 100 !== 0) return null;
      return {
        prompt: `Goods of list price ${R(list)} are bought from ${p} at ${t}% trade discount, with GST at ${g}% on the price after trade discount (within the state). ${pc}% of the invoice value is paid at once by cheque and the rest is left on credit. Carriage of ${R(carriage)} is paid separately in cash. What amount is credited to ${poss(p)} account?`,
        answer: total - paid,
        commonErrors: [
          { value: total, why: 'Credited the whole invoice, forgetting that part was paid by cheque.' },
          { value: paid, why: 'Gave the amount paid by cheque instead of the balance left owing.' },
          { value: total - paid + carriage, why: 'Added the carriage paid in cash, which is not part of the supplier\'s invoice.' },
          { value: net - (net * pc) / 100, why: 'Left out the GST: worked on the price before tax instead of the invoice value.' },
        ],
        explanation: [
          `Price after trade discount = ${R(list)} - ${t}% = ${R(net)}.`,
          `Invoice value = ${R(net)} + ${g}% GST = ${R(total)}.`,
          `Paid by cheque = ${pc}% of ${R(total)} = ${R(paid)}.`,
          `Credited to ${p} = ${R(total)} - ${R(paid)} = ${R(total - paid)}. The carriage is paid to someone else and is not part of this amount.`,
        ],
      };
    },
    (q) => {
      const list = amountsIn(q.prompt)[0];
      const [t, g, pc] = percentsIn(q.prompt);
      return q.answer * 1_000_000 === list * (100 - t) * (100 + g) * (100 - pc);
    },
  ),
  numeric(
    'je-rules-asset-cost',
    'medium',
    (rng) => {
      const [id, label] = rng.pick<[string, string]>([
        ['machinery', 'A machine'],
        ['officeEquipment', 'An air-conditioning unit'],
        ['computers', 'A set of computers'],
      ]);
      const price = amount(rng, 50000, 300000, 10000);
      const transport = amount(rng, 1000, 10000, 1000);
      const fitting = amount(rng, 1000, 10000, 1000);
      return {
        prompt: `${label} is bought for ${R(price)} on credit. Transport charges of ${R(transport)} and installation charges of ${R(fitting)} are paid in cash. What amount is debited to ${nm(id)}?`,
        answer: price + transport + fitting,
        commonErrors: [
          { value: price, why: 'Left out the transport and installation: they are part of the cost of the asset.' },
          { value: price + transport, why: 'Treated the installation charges as an expense instead of part of the cost.' },
          { value: price + fitting, why: 'Treated the transport charges as an expense instead of part of the cost.' },
        ],
        explanation: [
          'The cost of an asset includes everything spent to bring it to the business and make it ready for use.',
          `${R(price)} + ${R(transport)} + ${R(fitting)} = ${R(price + transport + fitting)}.`,
        ],
      };
    },
    (q) => q.answer === amountsIn(q.prompt).slice(0, 3).reduce((s, v) => s + v, 0),
  ),
  numeric(
    'je-rules-asset-cost-repairs',
    'complex',
    (rng) => {
      const price = amount(rng, 100000, 400000, 20000);
      const transport = amount(rng, 2000, 10000, 1000);
      const fitting = amount(rng, 2000, 10000, 1000);
      const repairs = amount(rng, 1000, 9000, 1000);
      const insurance = amount(rng, 1000, 9000, 1000);
      return {
        prompt: `A new machine is bought for ${R(price)}. ${R(transport)} is paid for transporting it and ${R(fitting)} for installing it. In the same month ${R(repairs)} is spent on repairing an old machine, and ${R(insurance)} is paid as the first year's insurance on the new machine. What amount is debited to Machinery A/c for the new machine?`,
        answer: price + transport + fitting,
        commonErrors: [
          { value: price + transport + fitting + repairs, why: 'Added the repairs of the old machine, which are a running expense.' },
          { value: price + transport + fitting + insurance, why: 'Added the insurance premium, which is a running expense.' },
          { value: price, why: 'Left out the transport and installation: they are part of the cost.' },
          { value: price + transport + fitting + repairs + insurance, why: 'Capitalised every payment made in the month.' },
        ],
        explanation: [
          `Cost of the new machine = price + transport + installation = ${R(price)} + ${R(transport)} + ${R(fitting)} = ${R(price + transport + fitting)}.`,
          `Repairs of the old machine (${R(repairs)}) go to Repairs A/c and insurance (${R(insurance)}) to Insurance A/c: they keep the business running but do not add to the machine.`,
        ],
      };
    },
    (q) => {
      const [price, transport, fitting] = amountsIn(q.prompt);
      return q.answer === price + transport + fitting;
    },
  ),
  numeric(
    'je-rules-discount-amount',
    'medium',
    (rng) => {
      const p = rng.pick(PARTIES);
      const due = amount(rng, 5000, 50000, 5000);
      const d = rng.pick([2, 5, 10]);
      const disc = percentOf(due, d);
      const paidSide = rng.pick([true, false]);
      const askDiscount = rng.pick([true, false]);
      const cash = due - disc;
      const lead = paidSide
        ? `The business owes ${p} ${R(due)} and pays by cheque within the discount period. ${p} allows ${d}% cash discount on the amount owed, in full settlement.`
        : `${p} owes the business ${R(due)} and pays by cheque within the discount period. The business allows ${d}% cash discount on the amount due, in full settlement.`;
      const account = askDiscount ? (paidSide ? 'credited to Discount Received A/c' : 'debited to Discount Allowed A/c') : paidSide ? 'credited to Bank A/c' : 'debited to Bank A/c';
      return {
        prompt: `${lead} What amount is ${account}?`,
        answer: askDiscount ? disc : cash,
        commonErrors: askDiscount
          ? [
              { value: cash, why: 'Gave the cheque amount instead of the discount.' },
              { value: due, why: 'Gave the whole amount owed instead of the discount.' },
            ]
          : [
              { value: disc, why: 'Gave the discount instead of the cheque amount.' },
              { value: due, why: 'Ignored the discount and used the whole amount owed.' },
            ],
        explanation: [
          `Cash discount = ${d}% of ${R(due)} = ${R(disc)}.`,
          `Cheque amount = ${R(due)} - ${R(disc)} = ${R(cash)}.`,
          paidSide ? `${poss(p)} account is debited with the full ${R(due)}; the discount is a gain.` : `${poss(p)} account is credited with the full ${R(due)}; the discount is a loss.`,
        ],
      };
    },
    (q) => {
      const due = amountsIn(q.prompt)[0];
      const d = percentsIn(q.prompt)[0];
      const asksDiscount = q.prompt.includes('Discount');
      return q.answer * 100 === (asksDiscount ? due * d : due * (100 - d));
    },
  ),
];

// ---- how many accounts an entry affects ----

interface CountCase {
  text: (x: string, who: string) => string;
  answer: number;
  errors: [number, string][];
  explanation: string;
}
const SIMPLE_COUNTS: CountCase[] = [
  { text: (x) => `Goods are sold for ${x} in cash.`, answer: 2, errors: [[3, 'Counted "Goods" as an account in addition to Sales.'], [1, 'Thought a single account is enough.']], explanation: 'Cash A/c is debited and Sales A/c is credited: 2 accounts.' },
  { text: (x, who) => `Furniture worth ${x} is bought on credit from ${fin(who)}`, answer: 2, errors: [[3, 'Counted Purchases as well, although furniture is an asset, not goods for resale.'], [1, 'Thought a single account is enough.']], explanation: "Furniture A/c is debited and the supplier's account is credited: 2 accounts." },
  { text: (x) => `The owner takes ${x} in cash for personal use.`, answer: 2, errors: [[3, 'Counted Capital as well as Drawings.'], [1, 'Thought a single account is enough.']], explanation: 'Drawings A/c is debited and Cash A/c is credited: 2 accounts.' },
  { text: (x, who) => `${x} due from ${who} is written off as a bad debt.`, answer: 2, errors: [[3, 'Counted Sales as well, thinking the sale is reversed.'], [1, 'Thought a single account is enough.']], explanation: "Bad Debts A/c is debited and the debtor's account is credited: 2 accounts." },
  { text: (x) => `Rent of ${x} is paid by cheque.`, answer: 2, errors: [[3, 'Counted Cash as well as Bank.'], [1, 'Thought a single account is enough.']], explanation: 'Rent A/c is debited and Bank A/c is credited: 2 accounts.' },
  { text: (x, who) => `Goods worth ${x} are sold on credit to ${fin(who)}`, answer: 2, errors: [[3, 'Counted Cash as well, although nothing is received now.'], [1, 'Thought a single account is enough.']], explanation: "The customer's account is debited and Sales A/c is credited: 2 accounts." },
  { text: (x) => `Depreciation of ${x} is charged on machinery, reducing the machinery account directly.`, answer: 2, errors: [[3, 'Counted a Provision for Depreciation account that is not used when the asset is reduced directly.'], [1, 'Thought a single account is enough.']], explanation: 'Depreciation A/c is debited and Machinery A/c is credited: 2 accounts.' },
  { text: (x) => `Rent and salaries totalling ${x} are paid together in cash.`, answer: 3, errors: [[2, 'Merged the two expenses into one account.'], [4, 'Counted Bank as well as Cash, although everything was paid in cash.']], explanation: 'Rent A/c and Salaries A/c are debited and Cash A/c is credited: 3 accounts.' },
  { text: (x) => `The owner starts the business with cash and furniture worth ${x} in all.`, answer: 3, errors: [[2, 'Assumed every entry has exactly two accounts.'], [4, 'Counted Bank as well, although only cash and furniture are brought in.']], explanation: 'Cash A/c and Furniture A/c are debited and Capital A/c is credited: 3 accounts.' },
  { text: (x) => `Goods worth ${x} are sold for cash to a customer in another state, with IGST charged.`, answer: 3, errors: [[2, 'Left out the Output IGST account.'], [4, 'Counted CGST and SGST in place of IGST; they apply only to a sale within the state.']], explanation: 'Cash A/c is debited; Sales A/c and Output IGST A/c are credited: 3 accounts.' },
];
const COMPOUND_COUNTS: CountCase[] = [
  { text: (x, who) => `Goods worth ${x} are bought on credit from ${who}, with GST charged within the state as CGST and SGST.`, answer: 4, errors: [[3, 'Counted GST as one account instead of two (Input CGST and Input SGST).'], [2, 'Ignored the GST: only Purchases and the supplier.']], explanation: 'Purchases A/c, Input CGST A/c and Input SGST A/c are debited and the supplier is credited: 4 accounts.' },
  { text: (x, who) => `Goods worth ${x} are sold on credit to ${who} in another state, with IGST charged.`, answer: 3, errors: [[2, 'Left out the IGST account.'], [4, 'Counted CGST and SGST in place of IGST; they apply only to a sale within the state.']], explanation: 'The customer is debited; Sales A/c and Output IGST A/c are credited: 3 accounts.' },
  { text: (x, who) => `${who}, a creditor owed ${x}, is paid by cheque in full settlement with a cash discount.`, answer: 3, errors: [[2, 'Left out the discount account.'], [4, 'Counted Cash as well as Bank.']], explanation: 'The creditor is debited; Bank A/c and Discount Received A/c are credited: 3 accounts.' },
  { text: (x, who) => `${who}, a debtor owing ${x}, pays by cheque in full settlement and is allowed a cash discount.`, answer: 3, errors: [[2, 'Left out the discount account.'], [4, 'Counted Discount Received as well as Discount Allowed.']], explanation: 'Bank A/c and Discount Allowed A/c are debited; the debtor is credited: 3 accounts.' },
  { text: (x) => `The owner starts a business with cash, furniture and a computer worth ${x} in all.`, answer: 4, errors: [[2, 'Assumed every entry has exactly two accounts.'], [3, 'Left out Capital and counted only the assets.']], explanation: 'Cash A/c, Furniture A/c and Computers A/c are debited; Capital A/c is credited: 4 accounts.' },
  { text: (x) => `Goods costing ${x} are destroyed by fire and the insurer admits part of the loss as a claim. One combined entry is passed.`, answer: 3, errors: [[2, 'Left out either the claim or the loss borne by the business.'], [4, 'Counted Cash as well, although nothing is received yet.']], explanation: 'Insurance Claim Receivable A/c and Loss by Fire A/c are debited; Purchases A/c is credited: 3 accounts.' },
  { text: (x, who) => `A cheque for ${x} from ${who} is dishonoured. The business does not bear the bank's charges on it: in the same entry they are charged to ${who} along with the cheque amount.`, answer: 2, errors: [[3, 'Counted Bank Charges A/c, although the charges are charged to the customer and not borne by the business.'], [1, 'Thought a single account is enough.']], explanation: "The customer's account is debited with the cheque and the charges; Bank A/c is credited with the same total: 2 accounts." },
  { text: (x, who) => `Goods worth ${x} are sold to ${who}; half the price is received in cash and half is left on credit.`, answer: 3, errors: [[2, 'Merged the cash and credit parts into one account.'], [4, 'Counted a cash-sales account and a credit-sales account separately.']], explanation: 'Cash A/c and the customer are debited; Sales A/c is credited: 3 accounts.' },
  { text: (x) => `Paid by cheque: rent, salaries and electricity totalling ${x}.`, answer: 4, errors: [[3, 'Left out Bank A/c and counted only the three expenses.'], [2, 'Assumed every entry has exactly two accounts.']], explanation: 'Rent A/c, Salaries A/c and Electricity A/c are debited; Bank A/c is credited: 4 accounts.' },
  { text: (x, who) => `Goods worth ${x} are bought on credit from ${who}, and the carriage on them is paid in cash and shown in its own account.`, answer: 4, errors: [[3, 'Left out the carriage account or the cash account.'], [2, 'Assumed every entry has exactly two accounts.']], explanation: 'Purchases A/c and Carriage Inwards A/c are debited; the supplier and Cash A/c are credited: 4 accounts.' },
  { text: (x) => `Rent of ${x} is received by cheque, and the part of it for the next year is credited at once to Income Received in Advance A/c.`, answer: 3, errors: [[2, 'Left out the account for the part belonging to next year.'], [4, 'Counted Cash as well as Bank.']], explanation: 'Bank A/c is debited; Rent Received A/c and Income Received in Advance A/c are credited: 3 accounts.' },
];

const countQuestion = (id: string, difficulty: Difficulty, cases: CountCase[]) =>
  count(
    id,
    difficulty,
    (rng) => {
      const c = rng.pick(cases);
      const who = rng.pick(PARTIES);
      const x = R(amount(rng, 5000, 90000, 1000));
      return {
        prompt: `${c.text(x, who)} How many accounts are affected by the journal entry?`,
        answer: c.answer,
        commonErrors: c.errors.map(([value, why]) => ({ value, why })),
        explanation: [c.explanation],
      };
    },
    (q) => {
      const x = R(amountsIn(q.prompt)[0]);
      return cases.some((c) => PARTIES.some((who) => q.prompt === `${c.text(x, who)} How many accounts are affected by the journal entry?` && q.answer === c.answer));
    },
  );

const OPEN_COUNT_ASSETS = ['cash', 'bank', 'stock of goods', 'furniture', 'machinery', 'a debtor', 'a delivery van', 'bills receivable'];
const OPEN_COUNT_LIABS = ['a creditor', 'a bank loan', 'bills payable'];

const openingCount = count(
  'je-rules-opening-count',
  'medium',
  (rng) => {
    const n = rng.int(3, 6);
    const m = rng.int(1, 3);
    const assets = rng.shuffle(OPEN_COUNT_ASSETS).slice(0, n);
    const liabs = rng.shuffle(OPEN_COUNT_LIABS).slice(0, m);
    const biz = rng.pick(OPENING_BUSINESSES);
    return {
      prompt: `The opening entry of ${biz} covers these assets: ${assets.join(', ')}; and ${m === 1 ? 'this liability' : 'these liabilities'}: ${liabs.join(', ')}. Last year's profit is already part of the capital. How many accounts appear in the opening entry, including Capital?`,
      answer: n + m + 1,
      commonErrors: [
        { value: n + m, why: 'Left out Capital, the balancing figure that completes the entry.' },
        { value: n + m + 2, why: "Counted last year's profit or Drawings as a further account." },
        { value: 2, why: 'Assumed every entry has exactly two accounts.' },
      ],
      explanation: [`Accounts debited: the ${n} assets. Accounts credited: the ${m} ${m === 1 ? 'liability' : 'liabilities'} and Capital.`, `Total = ${n} + ${m} + 1 = ${n + m + 1}.`],
    };
  },
  (q) => {
    const assets = /assets: (.+); and (?:this liability|these liabilities): (.+)\. Last/.exec(q.prompt);
    return assets !== null && q.answer === assets[1].split(', ').length + assets[2].split(', ').length + 1;
  },
);

const rules: Template[] = [
  sideQuestion('je-rules-which-debited', 'Dr'),
  sideQuestion('je-rules-which-credited', 'Cr'),
  typeQuestion('je-rules-type', 'easy', PLAIN_TYPES),
  typeQuestion('je-rules-type-adjusted', 'medium', ADJUSTMENT_TYPES),
  sideOfAccount,
  whichIncreases('je-rules-debit-side', 'debit'),
  whichIncreases('je-rules-credit-side', 'credit'),
  pairQuestion,
  transactionByTypes,
  capitalEffect,
  ...numericRules,
  countQuestion('je-rules-accounts-affected', 'easy', SIMPLE_COUNTS),
  countQuestion('je-rules-accounts-affected-compound', 'medium', COMPOUND_COUNTS),
  openingCount,
];

// ===============================================================================================================
// Sets of entries: "Journalise the following transactions". One business, several dated transactions, one entry for
// each. A set is one story: the same parties throughout, a creditor paid after the purchase from that creditor, a
// return after its sale, amounts that fit together. Every generator varies which transactions occur and in what
// order, and its opening line states each convention the entries rely on.
// ===============================================================================================================

/** One transaction of a set, before it is given its date. */
interface Tx {
  text: string;
  lines: JournalLine[];
  explanation: string[];
}

interface Shop {
  owner: string;
  name: string;
  /** What the business is, after "runs <name>, ": "a bookshop". */
  what: string;
  goods: string;
  city: string;
  /** The state the business is in, for a set with GST. */
  state: string;
  /**
   * The rate of GST on the goods, in percent. A shop without one is not used in a set with GST: printed books are
   * exempt, and a set must not teach a rate that the goods do not carry.
   */
  gst?: number;
  /** True when the goods are of a kind a trader does give away as free samples. */
  samples?: boolean;
}

const SHOPS: Shop[] = [
  { owner: 'Asha', name: 'Asha Book House', what: 'a bookshop', goods: 'books', city: 'Pune', state: 'Maharashtra', samples: true },
  { owner: 'Imran', name: 'Imran Electricals', what: 'a shop for electrical fittings', goods: 'electrical fittings', city: 'Bhopal', state: 'Madhya Pradesh', gst: 18, samples: true },
  { owner: 'Meenakshi', name: 'Meenakshi Silks', what: 'a saree shop', goods: 'sarees', city: 'Madurai', state: 'Tamil Nadu', gst: 5 },
  { owner: 'Gurpreet', name: 'Gurpreet Sports', what: 'a sports goods shop', goods: 'sports goods', city: 'Ludhiana', state: 'Punjab' },
  { owner: 'Joseph', name: 'Joseph Hardware', what: 'a hardware shop', goods: 'hardware', city: 'Kochi', state: 'Kerala', gst: 18, samples: true },
  { owner: 'Farida', name: 'Farida Footwear', what: 'a footwear shop', goods: 'footwear', city: 'Agra', state: 'Uttar Pradesh', gst: 5 },
  { owner: 'Devika', name: 'Devika Tea Traders', what: 'a wholesale tea shop', goods: 'tea', city: 'Guwahati', state: 'Assam', gst: 5, samples: true },
  { owner: 'Ramesh', name: 'Ramesh Cycle Mart', what: 'a bicycle shop', goods: 'bicycles', city: 'Jaipur', state: 'Rajasthan', gst: 5 },
];

/** Months a set may be set in. Every date is from the 1st to the 28th, so each month has them all. */
const SET_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];

const how = (m: Mode) => (m === 'cash' ? 'in cash' : 'by cheque');
/** "Cash A/c" goes down, or "Bank A/c" does: the credit half of a payment, in words. */
const paidFrom = (m: Mode) => (m === 'cash' ? 'Cash goes out: Cash A/c, an asset, is credited.' : 'The bank balance goes down: Bank A/c, an asset, is credited.');
const receivedIn = (m: Mode) => (m === 'cash' ? 'Cash comes in: Cash A/c, an asset, is debited.' : 'The money goes into the bank: Bank A/c, an asset, is debited.');

/** The transactions of a set with their dates: as many different days of the month, in order. */
const dated = (rng: Rng, month: string, txs: Tx[], first = 1, last = 28) => {
  const days = setDays(rng, txs.length, first, last);
  return txs.map((tx, i) => ({ date: `${days[i]} ${month}`, ...tx }));
};

/** Every set carries the independent check that its story can happen (`storyHolds`), walked again on the finished question. */
const journalSet = (
  id: string,
  difficulty: Difficulty,
  generate: (rng: Rng) => JournalSetParts | null,
  verify: (q: JournalSetQuestion) => boolean = setHolds(),
): JournalSetTemplate => journalSetTemplate({ id, topicId: TOPIC, conceptId: 'je-sets', difficulty, generate, verify });

// ---- the transactions sets are built from ----

const txCapital = (owner: string, a: Paise, m: Mode): Tx => ({
  text:
    m === 'cash'
      ? `${owner} started the business with cash of ${R(a)}.`
      : `${owner} started the business by putting ${R(a)} into a bank account opened for it.`,
  lines: [dr(m, a), cr('capital', a)],
  explanation: [receivedIn(m), 'The money is what the business owes its owner: Capital A/c is credited.'],
});

/** `say` adds how it was paid; a set whose opening line says every dealing is in cash leaves it out. */
const txBuyGoods = (goods: string, a: Paise, m: Mode, say = true): Tx => ({
  text: `Bought ${goods} for resale for ${R(a)}${say ? `, paid ${how(m)}` : ''}.`,
  lines: [dr('purchases', a), cr(m, a)],
  explanation: ['Goods bought for resale are debited to Purchases A/c.', paidFrom(m)],
});

const txSellGoods = (goods: string, a: Paise, m: Mode, say = true): Tx => ({
  text: `Sold ${goods} for ${R(a)}${say ? (m === 'cash' ? ' and received the amount in cash' : ' and received a cheque for the amount') : ''}.`,
  lines: [dr(m, a), cr('sales', a)],
  explanation: [receivedIn(m), 'Goods sold are credited to Sales A/c.'],
});

const SET_ASSETS: [string, string][] = [
  ['furniture', 'shelves and a counter (furniture) for the shop'],
  ['computers', 'a computer for billing'],
  ['officeEquipment', 'a photocopier (office equipment) for the shop'],
];

const txAsset = ([id, label]: [string, string], a: Paise, m: Mode, say = true): Tx => ({
  text: `Bought ${label} for ${R(a)}${say ? `, paid ${how(m)}` : ''}.`,
  lines: [dr(id, a), cr(m, a)],
  explanation: [`It is bought to be used, not to be sold again, so it is an asset: ${nm(id)} is debited, not Purchases A/c.`, paidFrom(m)],
});

/**
 * An expense of a shop: the account, the sentence (`v` is the amount with how it was paid, "₹6,000 by cheque"), and
 * the rupee amounts a small shop pays for it in a month.
 */
interface SetExpense {
  id: string;
  sentence: (v: string) => string;
  min: number;
  max: number;
  step: number;
}

const SET_EXPENSES: SetExpense[] = [
  { id: 'rent', sentence: (v) => `Paid ${v} as rent of the shop for the month`, min: 5000, max: 15000, step: 500 },
  { id: 'salaries', sentence: (v) => `Paid ${v} as salary to the shop assistant`, min: 8000, max: 16000, step: 500 },
  { id: 'electricity', sentence: (v) => `Paid ${v} for the electricity bill of the shop`, min: 1500, max: 6000, step: 500 },
  { id: 'telephone', sentence: (v) => `Paid ${v} for the telephone bill of the shop`, min: 800, max: 2500, step: 100 },
  { id: 'advertisement', sentence: (v) => `Paid ${v} for an advertisement in the local newspaper`, min: 2000, max: 9000, step: 500 },
  { id: 'insurance', sentence: (v) => `Paid ${v} as insurance premium on the stock of the shop`, min: 3000, max: 12000, step: 500 },
  { id: 'repairs', sentence: (v) => `Paid ${v} for repairs to the shop`, min: 1500, max: 8000, step: 500 },
];
/** The two expenses of the set that opens the books on 1 April: each names April, the month it is for. */
const SALARIES_OF_APRIL: SetExpense = { id: 'salaries', sentence: (v) => `Paid ${v} as salaries for April`, min: 8000, max: 20000, step: 1000 };
const RENT_OF_APRIL: SetExpense = { id: 'rent', sentence: (v) => `Paid ${v} as rent of the shop for April`, min: 5000, max: 15000, step: 500 };

/** An expense paid, its amount drawn from what that expense usually comes to. */
const txExpense = (rng: Rng, e: SetExpense, m: Mode, say = true): Tx => {
  const a = amount(rng, e.min, e.max, e.step);
  return {
    text: `${e.sentence(`${R(a)}${say ? ` ${how(m)}` : ''}`)}.`,
    lines: [dr(e.id, a), cr(m, a)],
    explanation: [`It is an expense of the business: ${nm(e.id)} is debited.`, paidFrom(m)],
  };
};

const txDrawings = (owner: string, a: Paise, m: Mode): Tx => ({
  text:
    m === 'cash'
      ? `${owner} took ${R(a)} in cash from the business for personal use.`
      : `${owner} withdrew ${R(a)} from the business bank account for personal use.`,
  lines: [dr('drawings', a), cr(m, a)],
  explanation: ['Money the owner takes for personal use is drawings, not an expense: Drawings A/c is debited.', paidFrom(m)],
});

const txDeposit = (a: Paise): Tx => ({
  text: `Deposited cash of ${R(a)} into the bank.`,
  lines: [dr('bank', a), cr('cash', a)],
  explanation: ['Money only moves from one asset to another. The bank balance goes up: Bank A/c is debited.', 'Cash in hand goes down: Cash A/c is credited.'],
});

const txWithdraw = (a: Paise): Tx => ({
  text: `Withdrew ${R(a)} from the bank for use in the shop.`,
  lines: [dr('cash', a), cr('bank', a)],
  explanation: [
    'The money stays in the business, so it is not drawings: it only moves from the bank to cash in hand. Cash A/c is debited.',
    'The bank balance goes down: Bank A/c is credited.',
  ],
});

const txCreditPurchase = (goods: string, s: string, a: Paise): Tx => ({
  text: `Bought ${goods} for ${R(a)} from ${s} on credit.`,
  lines: [dr('purchases', a), cr(creditor(s), a)],
  explanation: [
    'Goods bought for resale are debited to Purchases A/c.',
    `Nothing is paid yet, so the business owes ${s} the price: ${nm(creditor(s))}, a creditor, is credited.`,
  ],
});

const txCreditSale = (goods: string, d: string, a: Paise): Tx => ({
  text: `Sold ${goods} for ${R(a)} to ${d} on credit.`,
  lines: [dr(debtor(d), a), cr('sales', a)],
  explanation: [`Nothing is received yet, so ${d} owes the business the price: ${nm(debtor(d))}, a debtor, is debited.`, 'Goods sold are credited to Sales A/c.'],
});

/**
 * The supplier is paid everything owed (`due`). When less is paid, the difference is a cash discount, recorded now.
 * `why` says how the amount owed came about when the student has to work it out.
 */
const txPayCreditor = (s: string, due: Paise, paid: Paise, m: Mode, why?: string): Tx => {
  const discount = due - paid;
  return {
    text: discount > 0 ? `Paid ${R(paid)} to ${s} ${how(m)} in full settlement of the amount owed.` : `Paid ${s} the whole amount owed, ${how(m)}.`,
    lines: [dr(creditor(s), due), cr(m, paid), ...(discount > 0 ? [cr('discountReceived', discount)] : [])],
    explanation: [
      ...(why ? [why] : []),
      `The whole ${R(due)} owed to ${s} is cleared: ${nm(creditor(s))} is debited with ${R(due)}.`,
      `${R(paid)} is paid ${how(m)}: ${nm(m)} is credited.`,
      ...(discount > 0 ? [`The ${R(discount)} that need not be paid is a cash discount received, a gain: Discount Received A/c is credited.`] : []),
    ],
  };
};

const txPartPayment = (s: string, a: Paise, m: Mode): Tx => ({
  text: `Paid ${R(a)} to ${s} ${how(m)} as part payment.`,
  lines: [dr(creditor(s), a), cr(m, a)],
  explanation: [`The business owes ${s} less: ${nm(creditor(s))} is debited.`, paidFrom(m)],
});

/** The customer pays everything owed (`due`). When less is received, the difference is a cash discount allowed. */
const txReceiveFromDebtor = (d: string, due: Paise, received: Paise, m: Mode, why?: string): Tx => {
  const discount = due - received;
  return {
    text: discount > 0 ? `Received ${R(received)} from ${d} ${how(m)} in full settlement of the amount owed.` : `${d} paid the whole amount owed, ${how(m)}.`,
    lines: [dr(m, received), ...(discount > 0 ? [dr('discountAllowed', discount)] : []), cr(debtor(d), due)],
    explanation: [
      ...(why ? [why] : []),
      `${R(received)} is received ${how(m)}: ${nm(m)} is debited.`,
      ...(discount > 0 ? [`The ${R(discount)} that ${d} need not pay is a cash discount allowed, a loss: Discount Allowed A/c is debited.`] : []),
      `The whole ${R(due)} that ${d} owed is cleared: ${nm(debtor(d))} is credited with ${R(due)}.`,
    ],
  };
};

const txPartReceipt = (d: string, a: Paise, m: Mode): Tx => ({
  text: `Received ${R(a)} from ${d} ${how(m)} as part payment.`,
  lines: [dr(m, a), cr(debtor(d), a)],
  explanation: [receivedIn(m), `${d} owes less: ${nm(debtor(d))} is credited.`],
});

const txReturnOutwards = (s: string, a: Paise): Tx => ({
  text: `Returned to ${s} goods worth ${R(a)} that were damaged.`,
  lines: [dr(creditor(s), a), cr('purchasesReturn', a)],
  explanation: [`The business owes ${s} less: ${nm(creditor(s))} is debited.`, 'Goods sent back to a supplier are credited to Purchases Return A/c.'],
});

const txReturnInwards = (d: string, a: Paise): Tx => ({
  text: `${d} returned goods worth ${R(a)} that were not as ordered.`,
  lines: [dr('salesReturn', a), cr(debtor(d), a)],
  explanation: ['Goods that come back from a customer are debited to Sales Return A/c.', `${d} owes less: ${nm(debtor(d))} is credited.`],
});

const txGoodsByOwner = (owner: string, goods: string, a: Paise): Tx => ({
  text: `${owner} took ${goods} costing ${R(a)} from the shop for personal use.`,
  lines: [dr('drawings', a), cr('purchases', a)],
  explanation: [
    'Goods taken by the owner are drawings: Drawings A/c is debited.',
    'The goods leave without being sold, so Purchases A/c is credited with their cost. Sales A/c is not used.',
  ],
});

const txGoodsAsCharity = (goods: string, a: Paise): Tx => ({
  text: `Gave ${goods} costing ${R(a)} to a flood relief camp as a donation.`,
  lines: [dr('charity', a), cr('purchases', a)],
  explanation: ['A donation is an expense: Charity A/c is debited.', 'The goods leave without being sold, so Purchases A/c is credited with their cost. Sales A/c is not used.'],
});

const txGoodsAsSamples = (goods: string, a: Paise): Tx => ({
  text: `Gave away ${goods} costing ${R(a)} as free samples to bring in customers.`,
  lines: [dr('advertisement', a), cr('purchases', a)],
  explanation: ['Free samples are a cost of promoting sales: Advertisement A/c is debited.', 'The goods leave without being sold, so Purchases A/c is credited with their cost. Sales A/c is not used.'],
});

const txGoodsLostByFire = (a: Paise): Tx => ({
  text: `Goods costing ${R(a)}, bought during the year, were destroyed by a fire in the shop. They were not insured.`,
  lines: [dr('lossByFire', a), cr('purchases', a)],
  explanation: [
    'Nothing can be claimed, so the whole cost is a loss: Loss by Fire A/c is debited.',
    'The goods were debited to Purchases A/c when they were bought and have left without being sold, so Purchases A/c is credited with their cost. Stock A/c and Sales A/c are not used.',
  ],
});

/** Something personal paid for out of the business bank account: it is drawings, whatever was bought. */
const PERSONAL: ((owner: string, v: string) => string)[] = [
  (owner, v) => `Paid ${v} by cheque from the business account for the school fees of ${poss(owner)} child.`,
  (owner, v) => `Paid the premium of ${v} on ${poss(owner)} life insurance policy by cheque from the business account.`,
  (owner, v) => `Bought a refrigerator for ${poss(owner)} home for ${v}, paid by cheque from the business account.`,
];

const txPersonal = (sentence: (owner: string, v: string) => string, owner: string, a: Paise): Tx => ({
  text: sentence(owner, R(a)),
  lines: [dr('drawings', a), cr('bank', a)],
  explanation: [
    'It is a personal expense of the owner, not an expense or an asset of the business: Drawings A/c is debited.',
    paidFrom('bank'),
  ],
});

/** The part of a rented building that is the owner's home: the words, and what the whole rent is divided by. */
const HOME_SHARES: [string, number][] = [
  ['Half', 2],
  ['One-third', 3],
  ['One-fourth', 4],
];

/** Rent of a building of which the owner lives in a part: that part of the rent is drawings, the rest an expense. */
const txRentWithHome = (owner: string, total: Paise, [share, parts]: [string, number]): Tx => {
  const home = total / parts;
  return {
    text: `Paid ${R(total)} by cheque as rent of the building for the month. ${share} of the building is ${poss(owner)} home and the rest is the shop.`,
    lines: [dr('rent', total - home), dr('drawings', home), cr('bank', total)],
    explanation: [
      `${share} of ${R(total)} = ${R(home)} is the rent of the owner's home, a personal expense: Drawings A/c is debited with ${R(home)}.`,
      `The rest, ${R(total)} - ${R(home)} = ${R(total - home)}, is the rent of the shop, an expense of the business: Rent A/c is debited.`,
      `The cheque is for the whole ${R(total)}: Bank A/c, an asset, is credited.`,
    ],
  };
};

const SET_INCOMES: [string, Mode, (v: string) => string][] = [
  ['commissionReceived', 'cash', (v) => `Received ${v} in cash as commission for arranging a sale for another trader.`],
  ['commissionReceived', 'bank', (v) => `Received a cheque for ${v} as commission for arranging a sale for another trader.`],
  ['rentReceived', 'cash', (v) => `Received ${v} in cash as rent for a part of the shop that is let out.`],
  ['rentReceived', 'bank', (v) => `Received a cheque for ${v} as rent for a part of the shop that is let out.`],
  ['interestReceived', 'bank', (v) => `The bank credited interest of ${v} on a fixed deposit to the business account.`],
];

const txIncome = ([id, m, sentence]: [string, Mode, (v: string) => string], a: Paise): Tx => ({
  text: sentence(R(a)),
  lines: [dr(m, a), cr(id, a)],
  explanation: [receivedIn(m), `It is an income of the business: ${nm(id)} is credited.`],
});

// ---- GST: charged on the price after trade discount, at one rate for the whole set ----

type GstKind = 'intra' | 'inter';
const gstTaxes = (net: Paise, rate: number, kind: GstKind, dir: 'input' | 'output'): [string, Paise][] =>
  kind === 'inter'
    ? [[`${dir}IGST`, percentOf(net, rate)]]
    : [
        [`${dir}CGST`, percentOf(net, rate) / 2],
        [`${dir}SGST`, percentOf(net, rate) / 2],
      ];
const gstNames = (kind: GstKind, dir: 'Input' | 'Output') => (kind === 'inter' ? `${dir} IGST A/c is` : `${dir} CGST A/c and ${dir} SGST A/c are`);
/** Within the state the tax is two equal halves: ", half CGST and half SGST, ₹1,350 each". */
const halves = (tax: Paise, kind: GstKind) => (kind === 'intra' ? `, half CGST and half SGST, ${R(tax / 2)} each` : '');
/** The price after trade discount, or just the price when there is none. */
const netOf = (list: Paise, trade: number): Paise => list - percentOf(list, trade);

/** A purchase with GST, on credit from a supplier or paid by cheque; `trade` is the trade discount in percent (0 for none). */
const txGstPurchase = (goods: string, from: string | null, list: Paise, trade: number, rate: number, kind: GstKind): Tx => {
  const net = netOf(list, trade);
  const taxes = gstTaxes(net, rate, kind, 'input');
  const tax = percentOf(net, rate);
  const price = trade > 0 ? `of list price ${R(list)}` : `for ${R(list)}`;
  const terms = `${trade > 0 ? `, at ${trade}% trade discount` : ''}, plus GST`;
  return {
    text: from ? `Bought ${goods} ${price} from ${from} on credit${terms}.` : `Bought ${goods} ${price}${terms}, and paid the invoice by cheque.`,
    lines: [dr('purchases', net), ...taxes.map(([id, t]) => dr(id, t)), cr(from ? creditor(from) : 'bank', net + tax)],
    explanation: [
      trade > 0
        ? `Trade discount is never recorded: Purchases A/c is debited with ${R(list)} less ${trade}% = ${R(net)}.`
        : `Purchases A/c is debited with the price before GST, ${R(net)}.`,
      `GST at ${rate}% on ${R(net)} is ${R(tax)}${halves(tax, kind)}. It can be set off later, so it is an asset: ${gstNames(kind, 'Input')} debited.`,
      from
        ? `${from} is owed the invoice total, ${R(net)} + ${R(tax)} = ${R(net + tax)}: ${nm(creditor(from))} is credited.`
        : `The invoice total, ${R(net)} + ${R(tax)} = ${R(net + tax)}, is paid by cheque: Bank A/c is credited.`,
    ],
  };
};

const txGstSale = (goods: string, to: string | null, list: Paise, trade: number, rate: number, kind: GstKind): Tx => {
  const net = netOf(list, trade);
  const taxes = gstTaxes(net, rate, kind, 'output');
  const tax = percentOf(net, rate);
  const price = trade > 0 ? `of list price ${R(list)}` : `for ${R(list)}`;
  const terms = `${trade > 0 ? `, at ${trade}% trade discount` : ''}, plus GST`;
  return {
    text: to ? `Sold ${goods} ${price} to ${to} on credit${terms}.` : `Sold ${goods} ${price}${terms}, and received a cheque for the invoice.`,
    lines: [dr(to ? debtor(to) : 'bank', net + tax), cr('sales', net), ...taxes.map(([id, t]) => cr(id, t))],
    explanation: [
      to
        ? `${to} owes the invoice total: ${nm(debtor(to))} is debited with ${R(net)} + ${R(tax)} = ${R(net + tax)}.`
        : `The cheque is for the invoice total, ${R(net)} + ${R(tax)} = ${R(net + tax)}: Bank A/c is debited.`,
      trade > 0 ? `Trade discount is never recorded: Sales A/c is credited with ${R(list)} less ${trade}% = ${R(net)}.` : `Sales A/c is credited with the price before GST, ${R(net)}.`,
      `GST at ${rate}% on ${R(net)} is ${R(tax)}${halves(tax, kind)}. It is owed to the government, so it is a liability: ${gstNames(kind, 'Output')} credited.`,
    ],
  };
};

/** `n` different members of a list, in an order drawn from the seed. */
const some = <T,>(rng: Rng, items: readonly T[], n: number): T[] => rng.shuffle(items).slice(0, n);

const sets: JournalSetTemplate[] = [
  // 1. The first week of a new business, every dealing in cash.
  journalSet(
    'je-set-first-week',
    'easy',
    (rng) => {
      const shop = rng.pick(SHOPS);
      const month = rng.pick(SET_MONTHS);
      const capital = amount(rng, 250000, 600000, 50000);
      const kinds = rng.shuffle(['asset', 'goods', 'expense', 'sale', 'drawings'] as const).slice(0, rng.pick([2, 3]));
      // Nothing can be sold before it has been bought.
      if (kinds.includes('sale') && !kinds.includes('goods')) kinds[kinds.findIndex((k) => k !== 'sale')] = 'goods';
      const sale = kinds.indexOf('sale');
      const goods = kinds.indexOf('goods');
      if (sale >= 0 && sale < goods) [kinds[sale], kinds[goods]] = [kinds[goods], kinds[sale]];
      const rest = kinds.map((kind): Tx => {
        switch (kind) {
          case 'asset':
            return txAsset(rng.pick(SET_ASSETS), amount(rng, 20000, 80000, 5000), 'cash', false);
          case 'goods':
            return txBuyGoods(shop.goods, amount(rng, 40000, 90000, 5000), 'cash', false);
          case 'expense':
            // What a shop pays for in its first week: the rent, an advertisement, the insurance.
            return txExpense(rng, rng.pick(SET_EXPENSES.filter((e) => ['rent', 'advertisement', 'insurance'].includes(e.id))), 'cash', false);
          case 'sale':
            // A part of the goods bought (never less than ₹40,000) is sold in the first days, not nearly all of them.
            return txSellGoods(shop.goods, amount(rng, 8000, 24000, 1000), 'cash', false);
          case 'drawings':
            return txDrawings(shop.owner, amount(rng, 2000, 10000, 500), 'cash');
        }
      });
      const transactions = dated(rng, month, [txCapital(shop.owner, capital, 'cash'), ...rest], 1, 7);
      if (!storyHolds(transactions, { cash: 0, bank: 0 })) return null;
      return {
        opening: `${shop.owner} opened ${shop.name}, ${shop.what} in ${shop.city}, in ${month}. Every dealing of the first week was in cash.`,
        transactions,
        distractorAccounts: ['bank', 'stock', 'purchases', 'drawings', 'sales'],
      };
    },
    setHolds({ cash: 0, bank: 0 }),
  ),

  // 2. A week with cash and bank, and a transfer between the two.
  journalSet('je-set-cash-and-bank', 'easy', (rng) => {
    const shop = rng.pick(SHOPS);
    const month = rng.pick(SET_MONTHS);
    const contra = rng.pick([true, false]) ? txDeposit(amount(rng, 10000, 60000, 5000)) : txWithdraw(amount(rng, 5000, 30000, 5000));
    const kinds = rng.shuffle(['cashSale', 'chequeSale', 'expense', 'purchase', 'drawings', 'asset'] as const).slice(0, rng.pick([2, 3]));
    const others = kinds.map((kind): Tx => {
      switch (kind) {
        case 'cashSale':
          return txSellGoods(shop.goods, amount(rng, 8000, 40000, 1000), 'cash');
        case 'chequeSale':
          return txSellGoods(shop.goods, amount(rng, 15000, 70000, 5000), 'bank');
        case 'expense':
          return txExpense(rng, rng.pick(SET_EXPENSES), mode(rng));
        case 'purchase':
          return txBuyGoods(shop.goods, amount(rng, 20000, 80000, 5000), mode(rng));
        case 'drawings':
          return txDrawings(shop.owner, amount(rng, 3000, 15000, 1000), 'bank');
        case 'asset':
          return txAsset(rng.pick(SET_ASSETS), amount(rng, 15000, 60000, 5000), 'bank');
      }
    });
    const txs = [...others];
    txs.splice(rng.int(0, txs.length), 0, contra);
    const first = rng.pick([1, 8, 15, 22]);
    return {
      opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}. These are transactions of one week of ${month}. Cheques received are paid into the bank the same day.`,
      transactions: dated(rng, month, txs, first, first + 6),
      distractorAccounts: ['capital', 'drawings', 'purchases'],
    };
  }),

  // 3. Buying and selling on credit, and the settlements that follow.
  journalSet('je-set-credit', 'medium', (rng) => {
    const shop = rng.pick(SHOPS);
    const month = rng.pick(SET_MONTHS);
    const [s1, d1, other] = some(rng, PARTIES, 3);
    const bought = amount(rng, 20000, 80000, 5000);
    const sold = amount(rng, 20000, 90000, 5000);
    /** Four, five or six tenths of an amount: a part payment in whole rupees. */
    const part = (a: Paise) => (a / 10) * rng.pick([4, 5, 6]);
    const buying = [
      txCreditPurchase(shop.goods, s1, bought),
      rng.pick([true, false])
        ? txPayCreditor(s1, bought, bought, mode(rng), `${s1} is owed the ${R(bought)} of the goods bought on credit.`)
        : txPartPayment(s1, part(bought), mode(rng)),
    ];
    const selling = [
      txCreditSale(shop.goods, d1, sold),
      rng.pick([true, false])
        ? txReceiveFromDebtor(d1, sold, sold, mode(rng), `${d1} owes the ${R(sold)} of the goods sold on credit.`)
        : txPartReceipt(d1, part(sold), mode(rng)),
    ];
    // Sometimes a fifth transaction that is not settled in the set.
    const extra = rng.pick([
      [],
      [txCreditPurchase(shop.goods, other, amount(rng, 10000, 50000, 5000))],
      [txCreditSale(shop.goods, other, amount(rng, 10000, 50000, 5000))],
      [txSellGoods(shop.goods, amount(rng, 5000, 30000, 1000), 'cash')],
    ]);
    const transactions = dated(rng, month, interleave(rng, [buying, selling, extra]));
    if (!storyHolds(transactions)) return null;
    return {
      opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}, and buys and sells on credit. These are transactions of ${month}. Cheques received are paid into the bank the same day.`,
      transactions,
      distractorAccounts: ['discountAllowed', 'discountReceived', 'purchasesReturn', 'salesReturn'],
    };
  }),

  // 4. Goods returned both ways, and one account settled at a cash discount on what is still owed.
  journalSet('je-set-returns', 'medium', (rng) => {
    const shop = rng.pick(SHOPS);
    const month = rng.pick(SET_MONTHS);
    const [s1, d1] = some(rng, PARTIES, 2);
    const bought = amount(rng, 30000, 90000, 5000);
    const sentBack = amount(rng, 2000, 9000, 1000);
    const sold = amount(rng, 30000, 90000, 5000);
    const cameBack = amount(rng, 2000, 9000, 1000);
    // The cash discount on what is still owed, in percent; with none, the whole balance is paid and no amount is given.
    const rate = rng.pick([2, 5, 0]);
    const buying = [txCreditPurchase(shop.goods, s1, bought), txReturnOutwards(s1, sentBack)];
    const selling = [txCreditSale(shop.goods, d1, sold), txReturnInwards(d1, cameBack)];
    // One of the two accounts is settled in the set, after its return; the other stays open.
    if (rng.pick([true, false])) {
      const due = bought - sentBack;
      buying.push(txPayCreditor(s1, due, due - percentOf(due, rate), mode(rng), `${s1} was owed ${R(bought)} less the return of ${R(sentBack)} = ${R(due)}.`));
    } else {
      const due = sold - cameBack;
      selling.push(txReceiveFromDebtor(d1, due, due - percentOf(due, rate), mode(rng), `${d1} owed ${R(sold)} less the return of ${R(cameBack)} = ${R(due)}.`));
    }
    const transactions = dated(rng, month, interleave(rng, [buying, selling]));
    if (!storyHolds(transactions)) return null;
    return {
      opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}. These are transactions of ${month} with one supplier, ${s1}, and one customer, ${fin(d1)} Cheques received are paid into the bank the same day.`,
      transactions,
      distractorAccounts: ['discountAllowed', 'discountReceived', 'purchases', 'sales'],
    };
  }),

  // 5. Expenses, an income, and drawings in money and in goods.
  journalSet('je-set-expenses-drawings', 'medium', (rng) => {
    const shop = rng.pick(SHOPS);
    const month = rng.pick(SET_MONTHS);
    // Money that leaves the business for the owner. The last is a payment that is partly the owner's: the rent of a
    // building of which a part is the owner's home, where the student has to divide the amount.
    const withHome = rng.pick([false, false, false, true]);
    const money = withHome
      ? txRentWithHome(shop.owner, amount(rng, 12000, 36000, 6000), rng.pick(HOME_SHARES))
      : rng.pick([
          () => txDrawings(shop.owner, amount(rng, 3000, 15000, 1000), 'cash'),
          () => txDrawings(shop.owner, amount(rng, 5000, 20000, 1000), 'bank'),
          () => txPersonal(rng.pick(PERSONAL), shop.owner, amount(rng, 12000, 30000, 1000)),
        ])();
    // A building that is partly the owner's home is not also a shop with rent of its own, or with a part let out.
    const rentToo = (id: string) => withHome && (id === 'rent' || id === 'rentReceived');
    const expenses = some(rng, SET_EXPENSES.filter((e) => !rentToo(e.id)), rng.pick([1, 2])).map((e) => txExpense(rng, e, mode(rng)));
    const txs = rng.shuffle([
      money,
      txGoodsByOwner(shop.owner, shop.goods, amount(rng, 1000, 8000, 500)),
      txIncome(rng.pick(SET_INCOMES.filter(([id]) => !rentToo(id))), amount(rng, 1500, 9000, 500)),
      ...expenses,
    ]);
    return {
      opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}. These are transactions of ${month}. Cheques received are paid into the bank the same day. Goods taken by the owner are recorded at cost.`,
      transactions: dated(rng, month, txs),
      distractorAccounts: ['sales', 'capital', 'drawings', 'insurance', 'rent', 'salaries'],
    };
  }),

  // 6. Purchases and sales with trade discount and GST, within the state or across states.
  journalSet('je-set-gst', 'complex', (rng) => {
    // Only a shop whose goods carry GST, at the rate they do carry: 5% or 18%.
    const shop = rng.pick(SHOPS.filter((s) => s.gst !== undefined));
    const month = rng.pick(SET_MONTHS);
    const rate = shop.gst!;
    const where = rng.pick(['intra', 'inter', 'mixed'] as const);
    const buyKind: GstKind = where === 'intra' ? 'intra' : 'inter';
    const sellKind: GstKind = where === 'inter' ? 'inter' : 'intra';
    const [s1, d1, s2, d2] = some(rng, PARTIES, 4);
    const list = () => amount(rng, 20000, 90000, 10000);
    const trade = () => rng.pick([10, 20]);
    const plain = () => amount(rng, 10000, 60000, 2000);
    const total = (l: Paise, t: number) => netOf(l, t) + percentOf(netOf(l, t), rate);

    const [boughtList, boughtTrade, soldList, soldTrade] = [list(), trade(), list(), trade()];
    const buying = [txGstPurchase(shop.goods, s1, boughtList, boughtTrade, rate, buyKind)];
    if (rng.pick([true, false])) {
      const carriage = amount(rng, 500, 3000, 100);
      buying.push({
        text: `Paid carriage of ${R(carriage)} in cash on the goods bought from ${s1} (no GST on it).`,
        lines: [dr('carriageInwards', carriage), cr('cash', carriage)],
        explanation: ['Carriage on goods bought is an expense: Carriage Inwards A/c is debited.', paidFrom('cash')],
      });
    }
    const owed = total(boughtList, boughtTrade);
    buying.push(txPayCreditor(s1, owed, owed, 'bank', `${s1} is owed the whole invoice, GST included: ${R(owed)}.`));
    const due = total(soldList, soldTrade);
    const selling = [
      txGstSale(shop.goods, d1, soldList, soldTrade, rate, sellKind),
      txReceiveFromDebtor(d1, due, due, 'bank', `${d1} owes the whole invoice, GST included: ${R(due)}.`),
    ];
    const singles: (() => Tx)[] = [
      () => txGstPurchase(shop.goods, null, plain(), 0, rate, buyKind),
      () => txGstSale(shop.goods, null, plain(), 0, rate, sellKind),
      () => txGstPurchase(shop.goods, s2, list(), trade(), rate, buyKind),
      () => txGstSale(shop.goods, d2, list(), trade(), rate, sellKind),
    ];
    const count = rng.pick([6, 7, 8]);
    const extras = some(rng, singles, count - buying.length - selling.length).map((make) => [make()]);
    const transactions = dated(rng, month, interleave(rng, [buying, selling, ...extras]));
    if (!storyHolds(transactions)) return null;
    const each = `${rate / 2}% each`;
    const applies =
      where === 'intra'
        ? `Every supplier and customer is in ${shop.state}, so CGST and SGST (${each}) apply.`
        : where === 'inter'
          ? 'Every supplier and customer is in another state, so IGST applies.'
          : `Suppliers are in other states, so IGST applies to purchases; customers are in ${shop.state}, so CGST and SGST (${each}) apply to sales.`;
    return {
      opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}, ${shop.state}. These are transactions of ${month}. GST is ${rate}% on ${shop.goods}, charged on the price after trade discount. ${applies} Cheques received are paid into the bank the same day.`,
      transactions,
      distractorAccounts: ['discountAllowed', 'discountReceived', 'carriageOutwards', ...(where === 'intra' ? ['inputIGST', 'outputIGST'] : where === 'inter' ? ['inputCGST', 'outputCGST'] : [])],
      hints: ['Take the transactions one at a time. Deduct the trade discount first, then work out the GST on what is left.', RULE],
    };
  }),

  // 7. The opening entry of a new year, then the month that follows.
  journalSet(
    'je-set-opening-month',
    'complex',
    (rng) => {
      const shop = rng.pick(SHOPS);
      const [d1, s1, s2, d2] = some(rng, PARTIES, 4);
      const cash = amount(rng, 30000, 70000, 5000);
      const bank = amount(rng, 100000, 250000, 10000);
      const stock = amount(rng, 60000, 150000, 10000);
      const furniture = amount(rng, 30000, 80000, 5000);
      const due = amount(rng, 20000, 60000, 5000);
      const owed = amount(rng, 20000, 50000, 5000);
      const assets = cash + bank + stock + furniture + due;
      const opening: Tx = {
        text: `The year opened with these balances: cash in hand ${R(cash)}, balance at bank ${R(bank)}, stock of ${shop.goods} ${R(stock)}, furniture ${R(furniture)}; ${d1}, a customer, owed ${R(due)}; ${s1}, a supplier, was owed ${R(owed)}. Pass the opening entry.`,
        lines: [dr('cash', cash), dr('bank', bank), dr('stock', stock), dr('furniture', furniture), dr(debtor(d1), due), cr(creditor(s1), owed), cr('capital', assets - owed)],
        explanation: [
          `Everything the business owns is an asset and is debited: Cash, Bank, Stock, Furniture and ${d1}, a debtor.`,
          `What it owes to an outsider is a liability and is credited: ${s1}, a creditor, ${R(owed)}.`,
          `Capital is the balancing figure: assets ${R(assets)} less liabilities ${R(owed)} = ${R(assets - owed)}, credited to Capital A/c.`,
        ],
      };
      const rate = rng.pick([2, 5]);
      const fromCustomer = rng.pick([
        () => txReceiveFromDebtor(d1, due, due - percentOf(due, rate), mode(rng), `${d1} owed ${R(due)} when the year opened.`),
        () => txReceiveFromDebtor(d1, due, due, 'bank', `${d1} owed ${R(due)} when the year opened.`),
        () => txPartReceipt(d1, due / 2, mode(rng)),
      ])();
      const toSupplier = rng.pick([
        () => txPayCreditor(s1, owed, owed - percentOf(owed, rate), 'bank', `${s1} was owed ${R(owed)} when the year opened.`),
        () => txPayCreditor(s1, owed, owed, 'bank', `${s1} was owed ${R(owed)} when the year opened.`),
        () => txPartPayment(s1, owed / 2, 'bank'),
      ])();
      const singles: (() => Tx)[] = [
        () => txSellGoods(shop.goods, amount(rng, 8000, 40000, 1000), 'cash'),
        () => txCreditPurchase(shop.goods, s2, amount(rng, 15000, 60000, 5000)),
        () => txCreditSale(shop.goods, d2, amount(rng, 15000, 60000, 5000)),
        () => txExpense(rng, RENT_OF_APRIL, 'cash'),
        () => txDrawings(shop.owner, amount(rng, 4000, 12000, 1000), 'cash'),
        () => txDeposit(amount(rng, 5000, 15000, 5000)),
        () => txAsset(rng.pick(SET_ASSETS.slice(1)), amount(rng, 20000, 50000, 5000), 'bank'),
      ];
      // The salaries of April are paid when the month is over: they stand last, on the 30th, and are named as
      // April's, so that they cannot be read as a payment of salaries left unpaid in the old year.
      const salaries = rng.pick([true, false]) ? [txExpense(rng, SALARIES_OF_APRIL, 'bank')] : [];
      const count = rng.pick([6, 7, 8]) - salaries.length;
      const rest = [...interleave(rng, [[fromCustomer], [toSupplier], ...some(rng, singles, count - 3).map((make) => [make()])]), ...salaries];
      const days = [1, ...setDays(rng, rest.length - salaries.length, 2, 28), ...salaries.map(() => 30)];
      const transactions = [opening, ...rest].map((tx, i) => ({ date: `${days[i]} April`, ...tx }));
      if (!storyHolds(transactions, { cash: 0, bank: 0 })) return null;
      return {
        opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}. The books of the new year are opened on 1 April with the balances brought forward from the old year, and the transactions of April follow. Cheques received are paid into the bank the same day.`,
        transactions,
        distractorAccounts: ['purchases', 'drawings', 'discountAllowed', 'discountReceived'],
        hints: ['Start with the opening entry: assets on one side, what is owed on the other, and capital as the difference.', RULE],
      };
    },
    setHolds({ cash: 0, bank: 0 }),
  ),

  // 8. A mixed month: a cheque that is kept and one that is banked at once, a settlement at a cash discount, and goods
  // that leave without being sold.
  journalSet('je-set-mixed-month', 'complex', (rng) => {
    const shop = rng.pick(SHOPS);
    // Not April: goods lost in the first days of the year would be opening stock, not goods "bought during the year".
    const month = rng.pick(SET_MONTHS.filter((m) => m !== 'April'));
    const [d1, d2, s1] = some(rng, PARTIES, 3);
    const kept = amount(rng, 15000, 60000, 5000);
    // The cheque that is not banked the same day: cash in hand until it is paid in.
    const keptCheque: Tx[] = [
      txCreditSale(shop.goods, d1, kept),
      {
        text: `Received a cheque for ${R(kept)} from ${d1} in full payment. It was kept in the cash box and not banked that day.`,
        lines: [dr('cash', kept), cr(debtor(d1), kept)],
        explanation: ['A cheque that is not banked the same day is treated as cash in hand: Cash A/c is debited, not Bank A/c.', `${d1} no longer owes the amount: ${nm(debtor(d1))} is credited.`],
      },
      {
        text: `Paid the cheque of ${R(kept)} received from ${d1} into the bank.`,
        lines: [dr('bank', kept), cr('cash', kept)],
        explanation: [`The cheque was already recorded as cash in hand, so ${d1} is not touched again. Bank A/c is debited.`, 'Cash in hand goes down: Cash A/c is credited.'],
      },
    ];
    // The cheque that is banked at once settles its account at a cash discount.
    const banked = amount(rng, 15000, 60000, 5000);
    const got = banked - percentOf(banked, rng.pick([2, 5]));
    const bankedCheque: Tx[] = [
      txCreditSale(shop.goods, d2, banked),
      {
        text: `Received a cheque for ${R(got)} from ${d2} in full settlement of the amount owed and paid it into the bank the same day.`,
        lines: [dr('bank', got), dr('discountAllowed', banked - got), cr(debtor(d2), banked)],
        explanation: [
          `${d2} owes the ${R(banked)} of the goods sold on credit.`,
          `The cheque for ${R(got)} is banked at once: Bank A/c is debited.`,
          `The ${R(banked - got)} that ${d2} need not pay is a cash discount allowed, a loss: Discount Allowed A/c is debited.`,
          `The whole ${R(banked)} that ${d2} owed is cleared: ${nm(debtor(d2))} is credited with ${R(banked)}.`,
        ],
      },
    ];
    const bought = amount(rng, 20000, 80000, 5000);
    const buying = [
      txCreditPurchase(shop.goods, s1, bought),
      txPayCreditor(s1, bought, bought - percentOf(bought, rng.pick([2, 5])), 'bank', `${s1} is owed the ${R(bought)} of the goods bought on credit.`),
    ];
    const goodsOut = some(
      rng,
      [
        () => txGoodsAsCharity(shop.goods, amount(rng, 1000, 8000, 500)),
        // Free samples only of goods that are given away as samples: tea or books, not sarees or bicycles.
        ...(shop.samples ? [() => txGoodsAsSamples(shop.goods, amount(rng, 1000, 6000, 500))] : []),
        () => txGoodsByOwner(shop.owner, shop.goods, amount(rng, 1000, 8000, 500)),
        () => txGoodsLostByFire(amount(rng, 5000, 30000, 1000)),
      ],
      rng.pick([1, 2]),
    ).map((make) => [make()]);
    // One account is always settled at a cash discount, so that every set has an amount to work out; the other
    // settlement and the rest of the month come in as far as the set has room for them.
    const [settled, other] = rng.shuffle([bankedCheque, buying]);
    const fixed = keptCheque.length + goodsOut.length + settled.length;
    let room = rng.pick([6, 7, 8].filter((n) => n >= fixed)) - fixed;
    const more: Tx[][] = [settled];
    for (const thread of rng.shuffle([
      other,
      [txPersonal(rng.pick(PERSONAL), shop.owner, amount(rng, 12000, 30000, 1000))],
      [txExpense(rng, rng.pick(SET_EXPENSES), mode(rng))],
    ])) {
      if (thread.length > room) continue;
      more.push(thread);
      room -= thread.length;
    }
    if (room > 0) return null;
    const transactions = dated(rng, month, interleave(rng, [keptCheque, ...goodsOut, ...more]));
    if (!storyHolds(transactions)) return null;
    return {
      opening: `${shop.owner} runs ${shop.name}, ${shop.what} in ${shop.city}. These are transactions of ${month}. A cheque received is paid into the bank the same day unless the transaction says it was kept; a cheque that is kept counts as cash in hand until it is banked. Goods given away, lost or taken by the owner are recorded at cost.`,
      transactions,
      distractorAccounts: ['sales', 'stock', 'discountAllowed', 'discountReceived', 'insurance', 'drawings'],
      hints: ['Take the transactions one at a time. Ask first whether goods were sold, or left the shop in some other way.', RULE],
    };
  }),
];

// ===============================================================================================================
// Source documents and vouchers (concept je-vouchers). Added after the check against the CBSE 2025-26 syllabus, which
// opens the unit on recording with "source documents and vouchers, preparation of vouchers". A voucher is prepared
// from a source document and shows the entry: a debit voucher for money paid out (in cash or by cheque), a credit
// voucher for money received, and a transfer (journal) voucher for a transaction in which no cash or bank moves.
// ===============================================================================================================

const VC = 'je-vouchers';

type VoucherKind = 'debit' | 'credit' | 'transfer' | 'none';
const VOUCHER_NAME: Record<VoucherKind, string> = {
  debit: 'Debit voucher',
  credit: 'Credit voucher',
  transfer: 'Transfer (journal) voucher',
  none: 'No voucher: there is no transaction to record',
};

/** The voucher an entry calls for, read from the entry alone: money out, money in, no money, or no entry at all. */
function voucherOf(lines: readonly JournalLine[]): VoucherKind {
  if (lines.length === 0) return 'none';
  const money = (side: 'Dr' | 'Cr') => lines.some((l) => (l.accountId === 'cash' || l.accountId === 'bank') && l.side === side);
  if (money('Cr') && !money('Dr')) return 'debit';
  if (money('Dr') && !money('Cr')) return 'credit';
  return 'transfer';
}

/** Why a learner who picked one kind of voucher, when another was right, went wrong. */
function voucherSlip(picked: VoucherKind, right: VoucherKind): string {
  if (picked === 'none') return 'Thought nothing is recorded, but this is a transaction of the business, so it is entered, and every entry rests on a voucher.';
  if (right === 'none') return 'Prepared a voucher for something that is not yet a transaction: nothing has been bought, sold, paid or received.';
  if (picked === 'transfer') return 'Took a cash or bank transaction as a non-cash one. Money moves here, so it is a cash voucher.';
  if (right === 'transfer') {
    return picked === 'debit'
      ? 'Took the transaction as a payment of money, but no cash or bank is involved: a non-cash transaction needs a transfer voucher.'
      : 'Took the transaction as a receipt of money, but no cash or bank is involved: a non-cash transaction needs a transfer voucher.';
  }
  return picked === 'debit'
    ? 'Mixed up the two cash vouchers: money comes in here, which is a credit voucher; a debit voucher is for money paid out.'
    : 'Mixed up the two cash vouchers: money goes out here, which is a debit voucher; a credit voucher is for money received.';
}

interface VoucherCase {
  text: string;
  lines: JournalLine[];
  /** The account a cash voucher names: the one debited on a debit voucher, the one credited on a credit voucher. */
  named?: string;
}

/** Transactions of a small business, each with its entry, for the questions on vouchers. */
const VOUCHER_CASES: ((rng: Rng) => VoucherCase)[] = [
  (rng) => {
    const a = amount(rng, 5000, 30000, 1000);
    return { text: `Paid shop rent of ${R(a)} in cash.`, lines: [dr('rent', a), cr('cash', a)], named: 'rent' };
  },
  (rng) => {
    const a = amount(rng, 10000, 60000, 1000), who = rng.pick(['Kiran', 'Rao & Co.', 'Sharma Bros']);
    return { text: `Paid ${R(a)} to ${who}, a supplier, by cheque.`, lines: [dr(creditor(who), a), cr('bank', a)], named: creditor(who) };
  },
  (rng) => {
    const a = amount(rng, 8000, 40000, 1000);
    return { text: `Paid salaries of ${R(a)} by cheque.`, lines: [dr('salaries', a), cr('bank', a)], named: 'salaries' };
  },
  (rng) => {
    const a = amount(rng, 20000, 90000, 5000);
    return { text: `Bought furniture for the office for ${R(a)} in cash.`, lines: [dr('furniture', a), cr('cash', a)], named: 'furniture' };
  },
  (rng) => {
    const a = amount(rng, 5000, 50000, 1000), who = rng.pick(['Mohan', 'Lakshmi Stores', 'Anita Traders']);
    return { text: `Received ${R(a)} in cash from ${who}, a customer, against goods sold earlier on credit.`, lines: [dr('cash', a), cr(debtor(who), a)], named: debtor(who) };
  },
  (rng) => {
    const a = amount(rng, 1000, 9000, 500);
    return { text: `Received commission of ${R(a)} in cash.`, lines: [dr('cash', a), cr('commissionReceived', a)], named: 'commissionReceived' };
  },
  (rng) => {
    const a = amount(rng, 50000, 300000, 10000);
    return { text: `The owner brought in further capital of ${R(a)} by cheque, which was paid into the bank.`, lines: [dr('bank', a), cr('capital', a)], named: 'capital' };
  },
  (rng) => {
    const a = amount(rng, 2000, 20000, 1000);
    return { text: `Sold goods for ${R(a)} in cash.`, lines: [dr('cash', a), cr('sales', a)], named: 'sales' };
  },
  (rng) => {
    const a = amount(rng, 10000, 80000, 1000), who = rng.pick(['Kiran', 'Rao & Co.', 'Sharma Bros']);
    return { text: `Bought goods on credit from ${who} for ${R(a)}.`, lines: [dr('purchases', a), cr(creditor(who), a)] };
  },
  (rng) => {
    const a = amount(rng, 5000, 60000, 1000), who = rng.pick(['Mohan', 'Lakshmi Stores', 'Anita Traders']);
    return { text: `Sold goods on credit to ${who} for ${R(a)}.`, lines: [dr(debtor(who), a), cr('sales', a)] };
  },
  (rng) => {
    const a = amount(rng, 2000, 20000, 1000);
    return { text: `Charged depreciation of ${R(a)} on the machinery for the year.`, lines: [dr('depreciation', a), cr('machinery', a)] };
  },
  (rng) => {
    const a = amount(rng, 1000, 9000, 500);
    return { text: `The owner took goods costing ${R(a)} from the shop for use at home.`, lines: [dr('drawings', a), cr('purchases', a)] };
  },
  (rng) => {
    const a = amount(rng, 20000, 90000, 5000);
    return { text: `Received an order from a school for goods worth ${R(a)}, to be delivered next month.`, lines: [] };
  },
  (rng) => {
    const a = amount(rng, 30000, 200000, 10000);
    return { text: `Agreed to employ a sales assistant from next month at ${R(a)} a year.`, lines: [] };
  },
];

/** The common errors that differ from the answer and from each other, the first of each value kept. */
const distinctErrors = (answer: number, errors: { value: number; why: string }[]): { value: number; why: string }[] =>
  errors.filter((e, i) => e.value !== answer && errors.findIndex((x) => x.value === e.value) === i);

/** What a question on vouchers was made from, kept for its `verify`: the transactions and their entries. */
const keptVouchers = new Map<string, VoucherCase[]>();
const keepVouchers = (prompt: string, cases: VoucherCase[]): void => {
  keptVouchers.clear();
  keptVouchers.set(prompt, cases);
};

const sourceDocuments = factsTemplate({
  id: 'je-voucher-source-doc', topicId: TOPIC, conceptId: VC, difficulty: 'easy',
  facts: [
    {
      prompt: 'Goods are sold for cash to a walk-in customer. Which source document supports the transaction?',
      correct: 'The cash memo given to the customer',
      distractors: [
        { text: 'An invoice sent to the customer for payment later', why: 'An invoice (bill) is made out for goods sold on credit; a sale for cash is supported by a cash memo.' },
        { text: 'A credit note issued to the customer', why: 'A credit note is issued when a customer returns goods, not when goods are sold.' },
        { text: 'The counterfoil of a pay-in-slip', why: 'A pay-in-slip supports cash paid into the bank, not a sale.' },
      ],
      explanation: 'A cash memo is the document of a cash sale: it shows the goods, their price and that the money was received at once.',
    },
    {
      prompt: 'Goods are bought on credit from Rao & Co. Which source document supports the purchase in the buyer\'s books?',
      correct: 'The invoice (bill) received from Rao & Co.',
      distractors: [
        { text: 'A cash memo issued by Rao & Co.', why: 'A cash memo is for a cash sale; goods bought on credit come with an invoice.' },
        { text: 'A debit note sent to Rao & Co.', why: 'A debit note is sent when goods are returned to the supplier, not when they are bought.' },
        { text: 'The counterfoil of a cheque issued to Rao & Co.', why: 'A cheque counterfoil supports a payment; nothing has been paid yet on a credit purchase.' },
      ],
      explanation: 'The supplier\'s invoice shows the goods, the price, any trade discount and the tax: it is the evidence of a credit purchase.',
    },
    {
      prompt: 'Shop rent is paid in cash to the landlord. Which source document supports the payment?',
      correct: 'The receipt given by the landlord',
      distractors: [
        { text: 'A cash memo issued by the business', why: 'A cash memo is issued by a seller for goods sold for cash; here the business is paying, not selling.' },
        { text: 'A credit note received from the landlord', why: 'A credit note concerns goods returned; it has nothing to do with paying rent.' },
        { text: 'The counterfoil of a pay-in-slip', why: 'A pay-in-slip supports money paid into the bank, not cash paid to a landlord.' },
      ],
      explanation: 'Whoever receives money gives a receipt; the receipt from the landlord is the proof that the rent was paid.',
    },
    {
      prompt: 'Cash is deposited into the business\'s bank account. Which source document supports the deposit?',
      correct: 'The counterfoil of the pay-in-slip, stamped by the bank',
      distractors: [
        { text: 'The counterfoil of a cheque', why: 'A cheque counterfoil supports a payment made by cheque, not a deposit of cash.' },
        { text: 'A cash memo', why: 'A cash memo supports a cash sale, not a deposit into the bank.' },
        { text: 'A debit note', why: 'A debit note is sent when goods are returned to a supplier.' },
      ],
      explanation: 'The bank stamps the counterfoil of the pay-in-slip and hands it back: it shows the amount paid in and the date.',
    },
    {
      prompt: 'A supplier is paid by cheque. Which document in the business\'s own records supports the payment?',
      correct: 'The counterfoil of the cheque issued',
      distractors: [
        { text: 'The counterfoil of a pay-in-slip', why: 'A pay-in-slip is used to pay money into the bank, not to pay a supplier.' },
        { text: 'The supplier\'s invoice for the goods', why: 'The invoice supports the purchase; the payment made later is supported by the cheque counterfoil (and the supplier\'s receipt).' },
        { text: 'A credit note sent to the supplier', why: 'A credit note is issued by a seller when goods come back; it does not support a payment.' },
      ],
      explanation: 'The counterfoil left in the cheque book shows the date, the payee and the amount of the cheque.',
    },
    {
      prompt: 'Goods bought on credit are returned to the supplier. Which source document does the buyer prepare?',
      correct: 'A debit note sent to the supplier',
      distractors: [
        { text: 'A credit note sent to the supplier', why: 'Mixed up the two notes: the buyer who returns goods sends a debit note; the seller who takes them back issues a credit note.' },
        { text: 'A fresh invoice made out to the supplier', why: 'An invoice is for a sale; returning goods is not selling them.' },
        { text: 'A cash memo', why: 'A cash memo is for a cash sale; no cash changes hands on a return of goods bought on credit.' },
      ],
      explanation: 'The buyer debits the supplier\'s account for the goods returned and tells the supplier so in a debit note.',
    },
    {
      prompt: 'A customer returns goods that were sold on credit. Which source document does the seller issue?',
      correct: 'A credit note issued to the customer',
      distractors: [
        { text: 'A debit note issued to the customer', why: 'Mixed up the two notes: the seller who takes goods back credits the customer and issues a credit note.' },
        { text: 'A receipt issued to the customer', why: 'A receipt is given for money received; no money is received on a return.' },
        { text: 'A new invoice issued to the customer', why: 'An invoice records a sale; a return reduces a sale.' },
      ],
      explanation: 'The seller credits the customer\'s account for the goods returned and sends a credit note to say so.',
    },
    {
      prompt: 'Cash is received from a customer who owed money for goods bought earlier on credit. Which source document supports the receipt?',
      correct: 'The counterfoil (copy) of the receipt issued to the customer',
      distractors: [
        { text: 'A cash memo issued to the customer', why: 'A cash memo is made out when goods are sold for cash; this is money received for an old credit sale.' },
        { text: 'A debit note received from the customer', why: 'A debit note comes with goods returned, not with a payment.' },
        { text: 'The invoice of the original sale', why: 'The invoice supports the credit sale made earlier; the receipt supports the money received now.' },
      ],
      explanation: 'The business keeps the counterfoil of the receipt it gave; it shows from whom, how much and when.',
    },
  ],
});

const voucherContents = factsTemplate({
  id: 'je-voucher-contents', topicId: TOPIC, conceptId: VC, difficulty: 'easy',
  facts: [
    {
      prompt: 'Why is every accounting voucher given a serial number?',
      correct: 'So that each voucher can be traced, and a missing one noticed',
      distractors: [
        { text: 'So that the bank can clear it', why: 'Thought a voucher goes to the bank like a cheque; it is an internal record of the business.' },
        { text: 'To show how important the transaction is', why: 'Thought the number ranks transactions; vouchers are numbered in order, one after another.' },
        { text: 'To show the amount of the transaction in words', why: 'Mixed up two details: the amount is written in figures (and words) in its own place.' },
      ],
      explanation: 'Vouchers are numbered in order. A gap in the numbers shows at once that a voucher is missing, which helps control.',
    },
    {
      prompt: 'On an accounting voucher, the short description of the transaction is called the:',
      correct: 'Narration',
      distractors: [
        { text: 'Folio', why: 'A folio is the page number of a ledger account, not a description of the transaction.' },
        { text: 'Source document', why: 'The source document is the paper the voucher is prepared from; the description written on the voucher is the narration.' },
        { text: 'Posting', why: 'Posting is carrying an entry to the ledger, not describing it.' },
      ],
      explanation: 'Like a journal entry, a voucher carries a narration: a line saying what the transaction was.',
    },
    {
      prompt: 'Who signs an accounting voucher before it is recorded in the books?',
      correct: 'The person who prepared it and an officer who authorised it',
      distractors: [
        { text: 'The customer or supplier named in it', why: 'Mixed up the voucher with the source document: a voucher is prepared inside the business, so outsiders do not sign it.' },
        { text: 'The bank manager', why: 'Thought a voucher is a bank document; the bank has no part in it.' },
        { text: 'The auditor, at the end of the year', why: 'An auditor checks vouchers later; they are signed by the preparer and the authoriser before they are recorded.' },
      ],
      explanation: 'Two signatures show who prepared the voucher and who approved the transaction, which guards against errors and fraud.',
    },
    {
      prompt: 'What is attached to an accounting voucher?',
      correct: 'The source document (or documents) that supports it',
      distractors: [
        { text: 'The ledger page of the account debited', why: 'The ledger is written up from the voucher later; it is not attached to it.' },
        { text: 'The trial balance of the month', why: 'The trial balance comes at the end of the period, long after the vouchers.' },
        { text: 'A copy of the balance sheet', why: 'The balance sheet is a year-end statement and supports no single transaction.' },
      ],
      explanation: 'The voucher says how to record the transaction; the source document attached to it proves that the transaction took place.',
    },
    {
      prompt: 'Which of these is NOT shown on an accounting voucher?',
      correct: 'The balance of the account after the entry is posted',
      distractors: [
        { text: 'The date of the transaction', why: 'The date is shown on every voucher, so it is not the odd one out.' },
        { text: 'The account debited and the account credited', why: 'Every voucher shows the accounts of the entry, so this is not the odd one out.' },
        { text: 'The amount, in figures and in words', why: 'The amount is shown on every voucher, so it is not the odd one out.' },
      ],
      explanation: 'A voucher shows the firm, its number and date, the accounts, the amount, the narration and the signatures. Balances are worked out in the ledger.',
    },
    {
      prompt: 'An accounting voucher is prepared from:',
      correct: 'A source document, such as an invoice, a cash memo or a receipt',
      distractors: [
        { text: 'The ledger accounts at the end of the month', why: 'The order is the other way round: vouchers come first, and the ledger is written up from them.' },
        { text: 'The trial balance', why: 'The trial balance is prepared from the ledger, long after the vouchers.' },
        { text: 'The memory of the accountant, when no paper is available', why: 'A voucher always rests on documentary evidence; without it the entry cannot be checked.' },
      ],
      explanation: 'Source document, then voucher, then the books of original entry, then the ledger.',
    },
  ],
});

const voucherKind = mcqTemplate({
  id: 'je-voucher-kind', topicId: TOPIC, conceptId: VC, difficulty: 'easy',
  generate: (rng) => {
    const c = rng.pick(VOUCHER_CASES)(rng);
    const right = voucherOf(c.lines);
    const prompt = `${c.text} Which accounting voucher is prepared for it?`;
    keepVouchers(prompt, [c]);
    const others = (['debit', 'credit', 'transfer', 'none'] as const).filter((k) => k !== right);
    return {
      prompt,
      correct: VOUCHER_NAME[right],
      distractors: others.map((k) => ({ text: VOUCHER_NAME[k], why: voucherSlip(k, right) })),
      explanation:
        right === 'none'
          ? 'Nothing has yet been bought, sold, paid or received, so there is no transaction and no voucher.'
          : right === 'transfer'
            ? 'No cash or bank is involved, so a transfer (journal) voucher is prepared for this non-cash transaction.'
            : right === 'debit'
              ? 'Money goes out, in cash or by cheque, so a debit voucher is prepared; it names the account debited.'
              : 'Money comes in, in cash or into the bank, so a credit voucher is prepared; it names the account credited.',
      hints: ['Does money go out, come in, or not move at all?', 'Debit voucher: payment. Credit voucher: receipt. Transfer voucher: no cash or bank.'],
    };
  },
  verify: (q) => {
    const c = keptVouchers.get(q.prompt)?.[0];
    return c !== undefined && q.options.find((o) => o.id === q.correct)?.text === VOUCHER_NAME[voucherOf(c.lines)];
  },
});

const voucherAccount = mcqTemplate({
  id: 'je-voucher-account', topicId: TOPIC, conceptId: VC, difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(VOUCHER_CASES)(rng);
    if (c.named === undefined) return null;
    const kind = voucherOf(c.lines);
    const money = c.lines.find((l) => l.accountId === 'cash' || l.accountId === 'bank')!.accountId;
    const prompt = `${c.text} A ${kind} voucher is prepared for it. Which account is written on the voucher as the account ${kind === 'debit' ? 'debited' : 'credited'}?`;
    keepVouchers(prompt, [c]);
    const other = money === 'cash' ? 'bank' : 'cash';
    return {
      prompt,
      correct: nm(c.named),
      distractors: [
        { text: nm(money), why: `Named ${nm(money)}, but a ${kind} voucher already says that money was ${kind === 'debit' ? 'paid out' : 'received'}; what it names is the other account of the entry.` },
        { text: nm(other), why: `${nm(other)} is not part of this transaction at all; the money ${kind === 'debit' ? 'went out' : 'came in'} through ${nm(money)}.` },
        { text: kind === 'debit' ? 'Capital A/c' : 'Drawings A/c', why: kind === 'debit' ? 'Thought every payment reduces the owner\'s capital; it is charged to the account the money was spent on.' : 'Thought money received concerns the owner\'s drawings; it is credited to the account it came from or was earned on.' },
      ],
      explanation: `A debit voucher records money paid and names the account debited; a credit voucher records money received and names the account credited. Here ${nm(c.named)} is ${kind === 'debit' ? 'debited' : 'credited'} and ${nm(money)} ${kind === 'debit' ? 'credited' : 'debited'}.`,
      hints: ['The cash or bank side of a cash voucher goes without saying.', 'Which other account does the transaction concern?'],
    };
  },
  verify: (q) => {
    const c = keptVouchers.get(q.prompt)?.[0];
    if (!c) return false;
    const kind = voucherOf(c.lines);
    const other = c.lines.find((l) => l.accountId !== 'cash' && l.accountId !== 'bank' && l.side === (kind === 'debit' ? 'Dr' : 'Cr'));
    return other !== undefined && q.options.find((o) => o.id === q.correct)?.text === nm(other.accountId);
  },
});

/** A source document, and the entry the voucher prepared from it shows. */
const VOUCHER_DOCUMENTS: ((rng: Rng) => Direct)[] = [
  (rng) => {
    const a = amount(rng, 2000, 25000, 500), no = rng.int(100, 999);
    return {
      prompt: `Cash memo No. ${no} of the business shows goods sold to a customer for ${R(a)}, paid in cash. Pass the entry that the voucher prepared from it shows.`,
      lines: [dr('cash', a), cr('sales', a)],
      explanation: ['The cash memo is the evidence of a cash sale; a credit voucher is prepared from it.', 'Cash comes in: Cash A/c is debited. Goods are sold: Sales A/c is credited.'],
      distractorAccounts: ['purchases', 'bank'],
    };
  },
  (rng) => {
    const a = amount(rng, 10000, 60000, 1000), who = rng.pick(['Rao & Co.', 'Sharma Bros', 'Kiran']), no = rng.int(10, 99);
    return {
      prompt: `Invoice No. ${no} received from ${who} is for fresh vegetables (exempt from GST) bought on credit for ${R(a)}. Pass the entry that the voucher prepared from it shows.`,
      lines: [dr('purchases', a), cr(creditor(who), a)],
      explanation: ['The supplier\'s invoice is the evidence of a credit purchase; a transfer voucher is prepared from it, as no money moves.', `Goods come in: Purchases A/c is debited. ${who} is now owed the price: ${who} is credited.`],
      distractorAccounts: ['sales', 'cash'],
    };
  },
  (rng) => {
    const a = amount(rng, 5000, 30000, 1000), no = rng.int(1, 60);
    return {
      prompt: `Receipt No. ${no} from the landlord acknowledges shop rent of ${R(a)} received in cash from the business. Pass the entry that the voucher prepared from it shows.`,
      lines: [dr('rent', a), cr('cash', a)],
      explanation: ['The landlord\'s receipt is the evidence of the payment; a debit voucher is prepared from it.', 'Rent is an expense: Rent A/c is debited. Cash goes out: Cash A/c is credited.'],
      distractorAccounts: ['rentReceived', 'bank'],
    };
  },
  (rng) => {
    const a = amount(rng, 10000, 80000, 1000), who = rng.pick(['Rao & Co.', 'Sharma Bros', 'Kiran']), no = rng.int(100000, 999999);
    return {
      prompt: `The counterfoil of cheque No. ${no} shows ${R(a)} paid to ${who}, a supplier, against the amount owed. Pass the entry that the voucher prepared from it shows.`,
      lines: [dr(creditor(who), a), cr('bank', a)],
      explanation: ['The cheque counterfoil is the evidence of the payment; a debit voucher is prepared from it.', `${who} is owed less: ${who} is debited. Money leaves the bank: Bank A/c is credited.`],
      distractorAccounts: ['purchases', 'cash'],
    };
  },
  (rng) => {
    const a = amount(rng, 2000, 15000, 500), who = rng.pick(['Rao & Co.', 'Sharma Bros', 'Kiran']), no = rng.int(1, 40);
    return {
      prompt: `Debit Note No. ${no} sent to ${who} is for fresh fruit (exempt from GST) worth ${R(a)}, bought on credit and returned as damaged. Pass the entry that the voucher prepared from it shows.`,
      lines: [dr(creditor(who), a), cr('purchasesReturn', a)],
      explanation: ['The debit note is the evidence of the return; a transfer voucher is prepared from it, as no money moves.', `${who} is owed less: ${who} is debited. Goods go back: Purchases Return A/c is credited.`],
      distractorAccounts: ['salesReturn', 'purchases'],
    };
  },
  (rng) => {
    const a = amount(rng, 10000, 90000, 1000);
    return {
      prompt: `The counterfoil of the pay-in-slip, stamped by the bank, shows cash of ${R(a)} paid into the business's bank account. Pass the entry that the voucher prepared from it shows.`,
      lines: [dr('bank', a), cr('cash', a)],
      explanation: ['The stamped counterfoil is the evidence of the deposit.', 'The bank balance rises: Bank A/c is debited. Cash in hand falls: Cash A/c is credited.'],
      distractorAccounts: ['capital', 'sales'],
    };
  },
];

const voucherEntry = direct('je-voucher-entry', VC, 'medium', (rng) => rng.pick(VOUCHER_DOCUMENTS)(rng), totalIsFirstAmount);

/** Four to six transactions of a day, each a different case, in an order drawn from the seed. */
function voucherDay(rng: Rng, count: number): VoucherCase[] {
  return rng.shuffle([...VOUCHER_CASES]).slice(0, count).map((make) => make(rng));
}
const dayList = (cases: readonly VoucherCase[]): string => cases.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
const paidOut = (c: VoucherCase): number => c.lines.filter((l) => (l.accountId === 'cash' || l.accountId === 'bank') && l.side === 'Cr').reduce((s, l) => s + l.amount, 0);
const cameIn = (c: VoucherCase): number => c.lines.filter((l) => (l.accountId === 'cash' || l.accountId === 'bank') && l.side === 'Dr').reduce((s, l) => s + l.amount, 0);

const voucherTotal = numericTemplate({
  id: 'je-voucher-total', topicId: TOPIC, conceptId: VC, difficulty: 'medium', unit: 'rupees',
  generate: (rng) => {
    const cases = voucherDay(rng, rng.int(4, 5));
    const kinds = cases.map((c) => voucherOf(c.lines));
    const ask = rng.pick(['debit', 'credit'] as const);
    if (!kinds.includes(ask) || !kinds.includes(ask === 'debit' ? 'credit' : 'debit') || !kinds.includes('transfer')) return null;
    const total = (k: VoucherKind) => cases.filter((c) => voucherOf(c.lines) === k).reduce((s, c) => s + (k === 'debit' ? paidOut(c) : cameIn(c)), 0);
    const answer = total(ask);
    const transfer = cases.filter((c) => voucherOf(c.lines) === 'transfer').reduce((s, c) => s + c.lines.filter((l) => l.side === 'Dr').reduce((x, l) => x + l.amount, 0), 0);
    const cashOnly = cases.filter((c) => voucherOf(c.lines) === ask && c.lines.some((l) => l.accountId === 'cash')).reduce((s, c) => s + (ask === 'debit' ? paidOut(c) : cameIn(c)), 0);
    const prompt = `The accountant of Meena Stores dealt with these items on 31 March. A debit voucher is prepared for payments in cash or by cheque, a credit voucher for receipts in cash or into the bank.\n${dayList(cases)}\nWhat is the total of the ${ask} vouchers prepared for the day?`;
    keepVouchers(prompt, cases);
    const commonErrors = distinctErrors(answer, [
      { value: answer + total(ask === 'debit' ? 'credit' : 'debit'), why: `Added the ${ask === 'debit' ? 'receipts' : 'payments'} too; a ${ask} voucher is only for money ${ask === 'debit' ? 'paid out' : 'received'}.` },
      { value: answer + transfer, why: 'Counted the non-cash transactions too; they need transfer vouchers.' },
      ...(cashOnly > 0 ? [{ value: cashOnly, why: `Counted the cash ${ask === 'debit' ? 'payments' : 'receipts'} only; money ${ask === 'debit' ? 'paid by cheque' : 'received into the bank'} needs a ${ask} voucher as well.` }] : []),
    ]);
    if (commonErrors.length < 2) return null;
    return {
      prompt,
      answer,
      commonErrors,
      explanation: [
        `A ${ask} voucher is prepared for every ${ask === 'debit' ? 'payment, in cash or by cheque' : 'receipt, in cash or into the bank'}.`,
        ...cases.flatMap((c, i) => (voucherOf(c.lines) === ask ? [`${i + 1}: ${R(ask === 'debit' ? paidOut(c) : cameIn(c))}.`] : [])),
        `Total = ${R(answer)}. The other transactions need ${ask === 'debit' ? 'credit' : 'debit'} vouchers, transfer vouchers or none.`,
      ],
    };
  },
  verify: (q) => {
    const cases = keptVouchers.get(q.prompt);
    if (!cases) return false;
    const debit = /total of the debit vouchers/.test(q.prompt);
    // Money out of cash or bank for a debit voucher, money in for a credit voucher, read from the entries.
    const sum = cases.reduce((s, c) => s + c.lines.filter((l) => (l.accountId === 'cash' || l.accountId === 'bank') && l.side === (debit ? 'Cr' : 'Dr')).reduce((x, l) => x + l.amount, 0), 0);
    return sum === q.answer && amountsIn(q.prompt).length === cases.length;
  },
});

const voucherCount = numericTemplate({
  id: 'je-voucher-count', topicId: TOPIC, conceptId: VC, difficulty: 'medium', unit: 'number',
  generate: (rng) => {
    const cases = voucherDay(rng, 6);
    const kinds = cases.map((c) => voucherOf(c.lines));
    const count = (k: VoucherKind) => kinds.filter((x) => x === k).length;
    const ask = rng.pick(['debit', 'credit', 'transfer'] as const);
    const answer = count(ask);
    if (answer === 0 || count('none') === 0) return null;
    const prompt = `The accountant of Meena Stores dealt with these six items on 31 March. A debit voucher is prepared for payments in cash or by cheque, a credit voucher for receipts in cash or into the bank.\n${dayList(cases)}\nHow many ${ask === 'transfer' ? 'transfer (journal)' : ask} vouchers are prepared for them?`;
    keepVouchers(prompt, cases);
    const errors =
      ask === 'transfer'
        ? [
            { value: answer + count('none'), why: 'Prepared a voucher for an order or an agreement too; nothing has changed hands there, so there is no transaction.' },
            { value: 6, why: 'Prepared a transfer voucher for every dealing; payments and receipts of money need debit and credit vouchers.' },
            { value: count('debit') + count('credit'), why: 'Counted the cash and bank transactions, which are exactly the ones that do not need a transfer voucher.' },
          ]
        : [
            { value: count('debit') + count('credit'), why: `Counted every payment and receipt; a ${ask} voucher is only for money ${ask === 'debit' ? 'paid out' : 'received'}.` },
            { value: count(ask === 'debit' ? 'credit' : 'debit'), why: `Mixed up the two cash vouchers: counted the ${ask === 'debit' ? 'receipts' : 'payments'} instead.` },
            { value: 6 - count('none'), why: 'Prepared a voucher of this kind for every transaction, whatever moved.' },
            { value: answer + count('transfer'), why: 'Counted the non-cash transactions too; they need transfer vouchers.' },
          ];
    const commonErrors = distinctErrors(answer, errors.filter((e) => e.value > 0));
    if (commonErrors.length < 2) return null;
    return {
      prompt,
      answer,
      commonErrors,
      explanation: [
        ...cases.map((c, i) => `${i + 1}: ${VOUCHER_NAME[voucherOf(c.lines)]}.`),
        `${answer} ${ask === 'transfer' ? 'transfer' : ask} voucher${answer === 1 ? '' : 's'}. An order received or an agreement to employ someone is not a transaction, so no voucher is prepared.`,
      ],
    };
  },
  verify: (q) => {
    const cases = keptVouchers.get(q.prompt);
    if (!cases || cases.length !== 6) return false;
    const ask = /How many (debit|credit|transfer)/.exec(q.prompt)?.[1] as VoucherKind | undefined;
    // Counted again from each entry: money out, money in, neither, or no entry.
    const n = cases.filter((c) => {
      const out = c.lines.some((l) => ['cash', 'bank'].includes(l.accountId) && l.side === 'Cr');
      const into = c.lines.some((l) => ['cash', 'bank'].includes(l.accountId) && l.side === 'Dr');
      return ask === 'debit' ? out && !into : ask === 'credit' ? into && !out : ask === 'transfer' ? c.lines.length > 0 && !out && !into : false;
    }).length;
    return n === q.answer;
  },
});

const vouchers: Template[] = [sourceDocuments, voucherContents, voucherKind, voucherAccount, voucherEntry, voucherTotal, voucherCount];

// ===============================================================================================================
// Goods given to the staff for their welfare (concept je-goods-otherwise), added after the syllabus check: at cost,
// Staff Welfare Expenses A/c debited and Purchases A/c credited, as for the other goods that leave without a sale.
// ===============================================================================================================

const STAFF_OCCASIONS = ['as a Diwali gift', 'for the staff canteen', 'as a Pongal gift', 'at the annual staff function', 'as an Eid gift'];

const staffWelfareGoods = direct(
  'je-goods-staff-welfare',
  'je-goods-otherwise',
  'easy',
  (rng) => {
    const a = amount(rng, 2000, 30000, 500);
    const what = rng.pick(['sweets', 'blankets', 'packets of dry fruit', 'rice and dal', 'shirts']);
    return {
      prompt: `${rng.pick(['Goods', `${what[0].toUpperCase()}${what.slice(1)} from the stock`])} costing ${R(a)} ${rng.pick(['were', 'were taken from the shop and'])} given to the employees ${rng.pick(STAFF_OCCASIONS)}. Ignore GST.`,
      lines: [dr('staffWelfare', a), cr('purchases', a)],
      explanation: [
        'Goods given to the staff for their welfare are an expense of the business: Staff Welfare Expenses A/c is debited.',
        'The goods leave without being sold, so Purchases A/c is credited, at cost. Sales A/c is not used.',
      ],
      distractorAccounts: ['salaries', 'drawings', 'sales', 'charity'],
    };
  },
  totalIsFirstAmount,
);

const staffWelfareAtCost = direct(
  'je-goods-staff-welfare-price',
  'je-goods-otherwise',
  'medium',
  (rng) => {
    const cost = amount(rng, 4000, 40000, 1000), markup = rng.pick([20, 25, 50]);
    const price = (cost * (100 + markup)) / 100;
    if (price % 100 !== 0) return null;
    return {
      prompt: `Goods with a selling price of ${R(price)} were given to the employees ${rng.pick(STAFF_OCCASIONS)}. The business sells at cost plus ${markup}%. Pass the entry. Ignore GST.`,
      lines: [dr('staffWelfare', cost), cr('purchases', cost)],
      explanation: [
        `Cost = ${R(price)} x 100 / ${100 + markup} = ${R(cost)}.`,
        'Goods given to the staff are recorded at cost: Staff Welfare Expenses A/c is debited and Purchases A/c is credited.',
      ],
      distractorAccounts: ['salaries', 'sales', 'drawings'],
    };
  },
  (q) => sideTotal(q, 'Dr') * (100 + percentsIn(q.prompt)[0]) === amountsIn(q.prompt)[0] * 100 && lineOf(q, 'staffWelfare') === sideTotal(q, 'Dr'),
);

const staffWelfare: Template[] = [staffWelfareGoods, { ...staffWelfareAtCost, computed: true }];

// ===============================================================================================================
// Added in the quality pass after the audit of Class 11. je-trade-discount is written out with its lines, so that its
// working shows each step. The new templates (GST set-off and payment; trade and cash discount on one immediate deal;
// an asset bought with GST) stand on levels of their own and on no mock paper, worksheet or Look back level
// (`outsidePapers`).
// ===============================================================================================================

/** The GST rates a prompt names ("CGST @ 9% and SGST @ 9%", "IGST @ 18%"), as [tax, rate]. */
const taxRatesIn = (text: string): [string, number][] =>
  Array.from(text.matchAll(/(CGST|SGST|IGST) @ (\d+(?:\.\d+)?)%/g), (m) => [m[1], Number(m[2])]);
/** The tax lines of an entry: CGST and SGST in halves within the state, IGST whole between states. */
const taxLines = (net: Paise, g: Gst, dir: 'input' | 'output', side: 'Dr' | 'Cr'): JournalLine[] => {
  const tax = percentOf(net, g.rate);
  const line = side === 'Dr' ? dr : cr;
  return g.kind === 'inter' ? [line(`${dir}IGST`, tax)] : [line(`${dir}CGST`, tax / 2), line(`${dir}SGST`, tax / 2)];
};
/** The working of the tax, one sentence: what each tax account gets. */
const taxWorking = (net: Paise, g: Gst, dir: 'Input' | 'Output'): string => {
  const tax = percentOf(net, g.rate);
  return g.kind === 'inter'
    ? `Between states the tax is IGST: ${g.rate}% of ${R(net)} = ${R(tax)}, to ${dir} IGST A/c.`
    : `Within the state the tax is split: CGST ${g.rate / 2}% of ${R(net)} = ${R(tax / 2)} to ${dir} CGST A/c, and SGST the same, ${R(tax / 2)}, to ${dir} SGST A/c.`;
};

const tradeDiscount = direct(
  'je-trade-discount',
  'je-gst',
  'complex',
  (rng) => {
    const list = amount(rng, 10000, 100000, 10000);
    const rate = rng.pick([10, 20]);
    const td = percentOf(list, rate);
    const net = list - td;
    const g = gst(rng);
    const party = rng.pick(PARTIES);
    const tax = percentOf(net, g.rate);
    return {
      prompt: `Purchased goods of list price ${formatINR(list)} from ${party} on credit at ${rate}% trade discount. GST is charged on the price after trade discount: ${taxText(g)}.`,
      lines: [dr('purchases', net), ...taxLines(net, g, 'input', 'Dr'), cr(creditor(party), net + tax)],
      explanation: [
        `Trade discount = ${rate}% of ${R(list)} = ${R(td)}. Price after trade discount = ${R(list)} - ${R(td)} = ${R(net)}. The trade discount itself is never entered in the books.`,
        `Goods bought for resale: Purchases A/c is debited with ${R(net)}.`,
        `${taxWorking(net, g, 'Input')} Input tax can be set off later, so it is an asset and is debited.`,
        `Nothing is paid now, so ${poss(party)} account is credited with the invoice total: ${R(net)} + ${R(tax)} = ${R(net + tax)}.`,
      ],
      distractorAccounts: ['discountReceived', 'sales', g.kind === 'inter' ? 'inputCGST' : 'inputIGST'],
    };
  },
  (q) => {
    const list = amountsIn(q.prompt)[0];
    const net = (list * (100 - percentsIn(q.prompt)[0])) / 100;
    const tax = taxRatesIn(q.prompt).reduce((s, [, r]) => s + (net * r) / 100, 0);
    return lineOf(q, 'purchases') === net && sideTotal(q, 'Cr') === net + tax && sideTotal(q, 'Dr') === net + tax;
  },
);

// ---- GST: setting off input tax against output tax, and paying the balance (concept je-gst-settlement) ----

const GSTC = 'je-gst-settlement';
interface GstTrader { name: string; city: string; state: string; goods: string; rate: number }
/** Traders and the GST rate their goods carry. */
const GST_TRADERS: GstTrader[] = [
  { name: 'Imran Electricals', city: 'Bhopal', state: 'Madhya Pradesh', goods: 'electrical fittings', rate: 18 },
  { name: 'Rangoli Paints', city: 'Nagpur', state: 'Maharashtra', goods: 'paints', rate: 18 },
  { name: 'Deccan Plywood', city: 'Hyderabad', state: 'Telangana', goods: 'plywood', rate: 18 },
  { name: 'Mobile Point', city: 'Lucknow', state: 'Uttar Pradesh', goods: 'mobile phone accessories', rate: 18 },
  { name: 'Annapurna Oil Depot', city: 'Rajkot', state: 'Gujarat', goods: 'edible oil', rate: 5 },
  { name: 'Assam Leaf Traders', city: 'Guwahati', state: 'Assam', goods: 'packaged tea', rate: 5 },
  { name: 'Mahalaxmi Sugar Agency', city: 'Kolhapur', state: 'Maharashtra', goods: 'sugar', rate: 5 },
];
const GST_MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
const GST_SET_OFF_HINTS = [
  'Work out the input tax on the purchases and the output tax on the sales, head by head.',
  'Debit the output tax account and credit the input tax account of the same head with the smaller of the two: CGST against CGST, SGST against SGST, IGST against IGST.',
];
const findTrader = (text: string): GstTrader | undefined => GST_TRADERS.find((t) => text.includes(`${t.name} of ${t.city}`));

const gstSetOffIntra = journalTemplate({
  id: 'je-gst-set-off-intra', topicId: TOPIC, conceptId: GSTC, difficulty: 'medium', computed: true,
  generate: (rng) => {
    const t = rng.pick(GST_TRADERS);
    const month = rng.pick(GST_MONTHS);
    const bought = amount(rng, 50000, 400000, 10000);
    // Most months a trader sells more than it buys; now and then a month of heavy buying leaves input tax over.
    const more = rng.int(1, 4) > 1;
    const sold = more ? bought + amount(rng, 20000, 300000, 10000) : bought - amount(rng, 10000, bought / 100 - 20000, 10000);
    const half = t.rate / 2;
    const inT = (bought * half) / 100, outT = (sold * half) / 100;
    const used = Math.min(inT, outT);
    return {
      prompt: `During ${month}, ${t.name} of ${t.city} (${t.state}) bought ${t.goods} for ${R(bought)} and sold ${t.goods} for ${R(sold)}, both before GST and both within the state. GST on ${t.goods} is ${t.rate}% (CGST ${half}% and SGST ${half}%). At the end of the month the input tax is set off against the output tax. Pass the entry for the set-off.`,
      lines: [dr('outputCGST', used), dr('outputSGST', used), cr('inputCGST', used), cr('inputSGST', used)],
      explanation: [
        `Input CGST = ${half}% of ${R(bought)} = ${R(inT)}; Input SGST is the same.`,
        `Output CGST = ${half}% of ${R(sold)} = ${R(outT)}; Output SGST is the same.`,
        'CGST is set off only against CGST and SGST only against SGST, never one against the other.',
        more
          ? `The output tax is larger, so the whole input tax, ${R(inT)} of each, is used: Output CGST A/c and Output SGST A/c are debited and Input CGST A/c and Input SGST A/c are credited, which closes them. ${R(outT - inT)} of each is left to pay.`
          : `The input tax is larger, so only ${R(outT)} of each can be used, as much as the output tax: the two output accounts are debited and the two input accounts credited with ${R(outT)}. ${R(inT - outT)} of each input tax is carried forward to next month.`,
      ],
      distractorAccounts: ['inputIGST', 'outputIGST', 'bank', 'purchases'],
      hints: GST_SET_OFF_HINTS,
    };
  },
  verify: (q) => {
    const t = findTrader(q.prompt);
    const [bought, sold] = amountsIn(q.prompt);
    if (!t) return false;
    const used = (Math.min(bought, sold) * t.rate) / 200;
    return ['outputCGST', 'outputSGST', 'inputCGST', 'inputSGST'].every((id) => lineOf(q, id) === used) && q.expected.length === 4;
  },
});

const gstSetOffIgst = journalTemplate({
  id: 'je-gst-set-off-igst', topicId: TOPIC, conceptId: GSTC, difficulty: 'medium', computed: true,
  generate: (rng) => {
    const t = rng.pick(GST_TRADERS);
    const month = rng.pick(GST_MONTHS);
    const bought = amount(rng, 50000, 400000, 10000);
    const more = rng.int(1, 4) > 1;
    const sold = more ? bought + amount(rng, 20000, 300000, 10000) : bought - amount(rng, 10000, bought / 100 - 20000, 10000);
    const inT = (bought * t.rate) / 100, outT = (sold * t.rate) / 100;
    const used = Math.min(inT, outT);
    return {
      prompt: `During ${month}, ${t.name} of ${t.city} (${t.state}) bought ${t.goods} for ${R(bought)} from a supplier in another state and sold ${t.goods} for ${R(sold)} to customers in other states, both before GST. IGST on ${t.goods} is ${t.rate}%. At the end of the month the input IGST is set off against the output IGST. Pass the entry for the set-off.`,
      lines: [dr('outputIGST', used), cr('inputIGST', used)],
      explanation: [
        `Input IGST = ${t.rate}% of ${R(bought)} = ${R(inT)}. Output IGST = ${t.rate}% of ${R(sold)} = ${R(outT)}.`,
        'Dealings with other states carry IGST, and IGST paid on purchases is set off against IGST collected on sales.',
        more
          ? `The output tax is larger, so the whole input IGST, ${R(inT)}, is used: Output IGST A/c is debited and Input IGST A/c credited, which closes it. ${R(outT - inT)} is left to pay.`
          : `The input tax is larger, so only ${R(outT)} can be used: Output IGST A/c is debited and Input IGST A/c credited with ${R(outT)}. ${R(inT - outT)} of input IGST is carried forward.`,
      ],
      distractorAccounts: ['inputCGST', 'outputCGST', 'bank', 'sales'],
      hints: GST_SET_OFF_HINTS,
    };
  },
  verify: (q) => {
    const t = findTrader(q.prompt);
    const [bought, sold] = amountsIn(q.prompt);
    if (!t) return false;
    const used = (Math.min(bought, sold) * t.rate) / 100;
    return lineOf(q, 'outputIGST') === used && lineOf(q, 'inputIGST') === used && q.expected.length === 2;
  },
});

const OFFICE_ASSETS = ['a computer for the office', 'a printer for the office', 'steel furniture for the office', 'a CCTV camera system for the shop'];

const gstPayment = journalTemplate({
  id: 'je-gst-payment', topicId: TOPIC, conceptId: GSTC, difficulty: 'complex', computed: true,
  generate: (rng) => {
    const t = rng.pick(GST_TRADERS);
    const month = rng.pick(GST_MONTHS);
    const bought = amount(rng, 50000, 300000, 10000);
    const asset = amount(rng, 20000, 80000, 5000);
    const what = rng.pick(OFFICE_ASSETS);
    const sold = bought + amount(rng, 100000, 400000, 10000);
    const half = t.rate / 2;
    const inGoods = (bought * half) / 100, inAsset = (asset * 9) / 100, outT = (sold * half) / 100;
    const net = outT - inGoods - inAsset;
    if (net < rupees(500)) return null;
    const m = rng.pick(['bank transfer', 'cheque']);
    return {
      prompt: `${t.name} of ${t.city} (${t.state}) made these dealings in ${month}, all within the state; the figures are before GST. It bought ${t.goods} for ${R(bought)} (GST ${t.rate}%), bought ${what} for ${R(asset)} (GST 18%) and sold ${t.goods} for ${R(sold)} (GST ${t.rate}%). The input tax has been set off against the output tax, CGST against CGST and SGST against SGST. Pass the entry for paying the balance of GST to the government by ${m}.`,
      lines: [dr('outputCGST', net), dr('outputSGST', net), cr('bank', 2 * net)],
      explanation: [
        `Output CGST = ${half}% of ${R(sold)} = ${R(outT)}; Output SGST is the same.`,
        `Input CGST = ${half}% of ${R(bought)} on the goods + 9% of ${R(asset)} on the ${what.replace(/^a /, '').replace(/ for the (office|shop)$/, '')} = ${R(inGoods)} + ${R(inAsset)} = ${R(inGoods + inAsset)}; Input SGST is the same. Tax paid on an asset used in the business can be set off too.`,
        `Balance of each head = ${R(outT)} - ${R(inGoods + inAsset)} = ${R(net)}.`,
        `Paying it clears what is still owed: Output CGST A/c and Output SGST A/c are debited with ${R(net)} each, and Bank A/c is credited with ${R(2 * net)}.`,
      ],
      distractorAccounts: ['inputCGST', 'inputSGST', 'cash', 'outputIGST'],
      hints: [
        'Find the output tax and the input tax of each head; the asset bought for the office carries input tax too.',
        'What is paid is output tax less input tax, for CGST and again for SGST: debit the two output accounts and credit Bank.',
      ],
    };
  },
  verify: (q) => {
    const t = findTrader(q.prompt);
    const [bought, asset, sold] = amountsIn(q.prompt);
    if (!t) return false;
    const net = (sold * t.rate) / 200 - (bought * t.rate) / 200 - (asset * 18) / 200;
    return lineOf(q, 'outputCGST') === net && lineOf(q, 'outputSGST') === net && lineOf(q, 'bank') === 2 * net;
  },
});

// ---- trade discount and cash discount on one deal settled partly at once (concept je-settlement) ----

const IMMEDIATE_HINTS_BUY = [
  'Take off the trade discount first; then see how much was settled at once and what is left on credit.',
  'Purchases gets the price after trade discount (and the input tax its own lines); the part settled at once is split into the cheque or cash paid and the cash discount received; the supplier is credited with the rest.',
];
const IMMEDIATE_HINTS_SELL = [
  'Take off the trade discount first; then see how much was settled at once and what is left on credit.',
  'Sales gets the price after trade discount (and the output tax its own lines); the part settled at once is split into the money received and the cash discount allowed; the customer is debited with the rest.',
];

/** One deal at trade discount, part settled at once less a 2% cash discount, the rest on credit, with or without GST. */
const immediateDeal = (id: string, buy: boolean) =>
  direct(
    id,
    'je-settlement',
    'complex',
    (rng) => {
      const p = rng.pick(PARTIES);
      const list = amount(rng, 20000, 200000, 10000);
      const trade = rng.pick([10, 20]);
      const net = list - percentOf(list, trade);
      const g = rng.pick([true, false]) ? gst(rng) : null;
      const tax = g ? percentOf(net, g.rate) : 0;
      const invoice = net + tax;
      const part = amount(rng, 5000, Math.floor(invoice / 100 / 2 / 5000) * 5000, 5000);
      if (part * 2 > invoice || part < rupees(5000)) return null;
      const cd = percentOf(part, 2);
      const m = mode(rng);
      const what = g ? 'invoice value' : 'amount due';
      const taxSay = g ? `, plus ${taxText(g)} on the price after trade discount` : '';
      const prompt = buy
        ? `Bought goods of list price ${R(list)} from ${p} at ${trade}% trade discount${taxSay}. ${R(part)} of the ${what} was settled at once ${paidHow(m)}, ${p} allowing a cash discount of 2% on that part; the rest is left on credit. Pass one entry.`
        : `Sold goods of list price ${R(list)} to ${p} at ${trade}% trade discount${taxSay}. ${p} settled ${R(part)} of the ${what} at once ${paidHow(m)}, and was allowed a cash discount of 2% on that part; the rest is left on credit. Pass one entry.`;
      const party = buy ? creditor(p) : debtor(p);
      const lines = buy
        ? [dr('purchases', net), ...(g ? taxLines(net, g, 'input', 'Dr') : []), cr(m, part - cd), cr('discountReceived', cd), cr(party, invoice - part)]
        : [dr(m, part - cd), dr('discountAllowed', cd), dr(party, invoice - part), cr('sales', net), ...(g ? taxLines(net, g, 'output', 'Cr') : [])];
      return {
        prompt,
        lines,
        explanation: [
          `Price after trade discount = ${R(list)} - ${trade}% = ${R(net)}: ${buy ? 'Purchases A/c is debited' : 'Sales A/c is credited'} with it. The trade discount is never entered.`,
          ...(g ? [`${taxWorking(net, g, buy ? 'Input' : 'Output')} The ${what} is ${R(net)} + ${R(tax)} = ${R(invoice)}.`] : []),
          `Cash discount = 2% of the ${R(part)} settled at once = ${R(cd)}. ${buy ? `It is a gain: Discount Received A/c is credited, and ${nm(m)} is credited with ${R(part)} - ${R(cd)} = ${R(part - cd)}.` : `It is a loss: Discount Allowed A/c is debited, and ${nm(m)} is debited with ${R(part)} - ${R(cd)} = ${R(part - cd)}.`}`,
          `Left on credit = ${R(invoice)} - ${R(part)} = ${R(invoice - part)}: ${nm(party)} is ${buy ? 'credited' : 'debited'}.`,
          ...(g ? ['The cash discount does not change the GST, which was worked on the price after trade discount.'] : []),
        ],
        distractorAccounts: buy ? ['discountAllowed', 'tradeExpenses'] : ['discountReceived', 'salesReturn'],
        hints: buy ? IMMEDIATE_HINTS_BUY : IMMEDIATE_HINTS_SELL,
      };
    },
    (q) => {
      const [list, part] = amountsIn(q.prompt);
      const net = (list * (100 - percentsIn(q.prompt)[0])) / 100;
      const tax = taxRatesIn(q.prompt).reduce((s, [, r]) => s + (net * r) / 100, 0);
      const cd = (part * 2) / 100;
      const money = lineOf(q, 'cash') ?? lineOf(q, 'bank');
      const party = q.expected.find((l) => l.accountId.startsWith(buy ? 'creditor:' : 'debtor:'))?.amount;
      return lineOf(q, buy ? 'purchases' : 'sales') === net && money === part - cd && lineOf(q, buy ? 'discountReceived' : 'discountAllowed') === cd && party === net + tax - part;
    },
  );

// ---- an asset bought with GST (concept je-assets) ----

// Every buyer charges GST on what it sells, so its input tax can be set off: no exempt service such as a clinic, and
// no supplier that pays tax without input credit.
const ASSETS_WITH_GST: { id: string; what: string; buyer: string }[] = [
  { id: 'computers', what: 'three computers', buyer: 'Bose Coaching Centre of Kolkata' },
  { id: 'machinery', what: 'a packaging machine', buyer: 'Rasoi Spices, a small spice-packing unit in Indore,' },
  { id: 'furniture', what: 'steel furniture for the client lounge', buyer: 'Kavya Interiors, an interior design studio in Kochi,' },
  { id: 'officeEquipment', what: 'a CCTV camera system', buyer: 'Sona Jewellers of Jaipur' },
  { id: 'computers', what: 'a laptop and a printer', buyer: 'Gill Auto Works, a car repair workshop in Ludhiana,' },
  { id: 'machinery', what: 'a dough-kneading machine', buyer: 'Thomas Bakery of Kottayam' },
];

const assetWithGst = direct(
  'je-asset-gst',
  'je-assets',
  'medium',
  (rng) => {
    const a = rng.pick(ASSETS_WITH_GST);
    const price = amount(rng, 30000, 400000, 5000);
    const g: Gst = { rate: 18, kind: rng.pick(['intra', 'inter'] as const) };
    const tax = percentOf(price, 18);
    const credit = rng.pick([true, false]);
    const p = rng.pick(PARTIES);
    const payee = credit ? creditor(p) : 'bank';
    return {
      prompt: `${a.buyer} bought ${a.what} for use in the business for ${R(price)}, plus ${taxText(g)}${credit ? `, on credit from ${fin(p)}` : ', and paid the full invoice amount by cheque.'} The input tax can be set off against output tax. Pass the entry.`,
      lines: [dr(a.id, price), ...taxLines(price, g, 'input', 'Dr'), cr(payee, price + tax)],
      explanation: [
        `The ${a.what.replace(/^(a|an) /, '')} will be used in the business, not sold: ${nm(a.id)} is debited with the price before tax, ${R(price)}. Purchases A/c is only for goods bought for resale.`,
        `${taxWorking(price, g, 'Input')} The tax can be set off, so it is not part of the cost of the asset: it is debited to the input tax account, an asset.`,
        credit
          ? `Nothing is paid now: ${nm(payee)} is credited with the invoice total, ${R(price)} + ${R(tax)} = ${R(price + tax)}.`
          : `The cheque covers the invoice total, ${R(price)} + ${R(tax)} = ${R(price + tax)}: Bank A/c is credited.`,
      ],
      distractorAccounts: ['purchases', g.kind === 'inter' ? 'inputCGST' : 'inputIGST', 'outputCGST'],
      hints: [
        'Is the item bought for resale, or for use in the business?',
        'Debit the asset account with the price before tax and the input tax accounts with the GST; credit Bank or the supplier with the invoice total.',
      ],
    };
  },
  (q) => {
    const price = amountsIn(q.prompt)[0];
    const tax = taxRatesIn(q.prompt).reduce((s, [, r]) => s + (price * r) / 100, 0);
    const asset = q.expected.find((l) => l.side === 'Dr' && !l.accountId.startsWith('input'));
    return asset?.amount === price && tax === (price * 18) / 100 && sideTotal(q, 'Cr') === price + tax;
  },
);

const qualityPass: Template[] = [
  gstSetOffIntra,
  gstSetOffIgst,
  gstPayment,
  // The amounts of the entry are worked out from the list price, the rates and the part settled.
  { ...immediateDeal('je-purchase-trade-cash-immediate', true), computed: true },
  { ...immediateDeal('je-sale-trade-cash-immediate', false), computed: true },
  assetWithGst,
];

// ---- hints and versions raised in the quality pass ----

const OPENING_HINTS = ['List what the business owns and what it owes to outsiders on that date.', 'Debit every asset, credit every outside liability, and credit Capital A/c with assets less liabilities.'];
const ADJUST_HINTS = (what: string) => [
  `Does this ${what} belong to this year, and has the money moved yet?`,
  'This year\'s expense or income account takes this year\'s amount; a part unpaid or received ahead is a liability, a part paid ahead or still to come is an asset.',
];
const GOODS_HINTS = ['Was anything sold? Why did the goods leave the business?', 'Credit Purchases A/c at cost; debit Drawings (the owner), Charity (a donation) or Advertisement (free samples).'];
const COST_HINTS = ['The profit is a percentage of the cost, not of the price.', 'Cost = selling price x 100 / (100 + profit %). Goods that leave without a sale are recorded at cost.'];
const TYPE_HINTS = ['First decide whether the account is an asset, a liability, capital, an income or an expense.', 'Assets and expenses (and Drawings, Sales Return) increase on the debit side; liabilities, capital and incomes (and Purchases Return, the provisions) on the credit side.'];
const ASSET_SALE_HINTS = ['Is the asset goods the business deals in, or something it used?', 'Credit the asset account with its book value and debit the buyer (or Cash or Bank) with the price; any difference goes to Profit or Loss on Sale of Asset A/c, never to Sales.'];
const TRADE_CASH_HINTS = ['Find the amount due after trade discount first: that is what the party\'s account shows.', 'The party\'s account takes the whole amount due; Cash or Bank takes what changed hands; the difference is Discount Received (when paying) or Discount Allowed (when receiving).'];
const ASSET_COST_HINTS = ['Which payments were needed to bring the asset to the business and make it ready for use?', 'Cost = price + transport + installation. Running costs such as repairs and insurance are expenses, not part of the cost.'];
const VOUCHER_HINTS = ['Mark each item: money out, money in, no money, or no transaction at all.', 'A debit voucher for every payment (cash or cheque), a credit voucher for every receipt, a transfer voucher where no cash or bank moves, none for an order or an agreement.'];

/** Version raised (and the hints given) in the quality pass; a template not named here is as it was. */
const REVISED: Record<string, { version: number; hints?: string[] }> = {
  // Errors put right (interest on drawings out of the pools, "Ignore GST", realistic figures, the working of the trade
  // discount, the convention on vouchers in the prompt), with hints of their own.
  'je-rules-type-adjusted': { version: 2, hints: ['Is it something owned, something owed, or a gain or loss of the year?', 'An amount due to the business or paid ahead is an asset; an amount the business owes or has received ahead is a liability; a loss is an expense and a gain an income.'] },
  'je-rules-side': { version: 2, hints: TYPE_HINTS },
  'je-rules-debit-side': { version: 2, hints: TYPE_HINTS },
  'je-rules-credit-side': { version: 2, hints: TYPE_HINTS },
  'je-goods-personal': { version: 2, hints: GOODS_HINTS },
  'je-goods-charity': { version: 2, hints: GOODS_HINTS },
  'je-goods-samples': { version: 2, hints: GOODS_HINTS },
  'je-trade-discount': { version: 2, hints: ['Work out the price after trade discount before anything else.', 'Purchases A/c takes the price after trade discount; GST on that price goes to the input tax accounts; the supplier is credited with the invoice total.'] },
  'je-rent-received-advance': { version: 2, hints: ['How many of the months paid for fall after 31 March?', 'Debit Bank with the whole cheque; credit Rent Received with this year\'s months and Income Received in Advance with next year\'s.'] },
  'je-cheque-dishonoured-charges': { version: 2, hints: ['Which of the two amounts will the customer be asked to pay?', 'Credit Bank with the cheque and the charges; debit the customer with the cheque (and the charges when they are recovered), and Bank Charges A/c with charges the business bears.'] },
  'je-asset-sale-gain-loss': { version: 2, hints: ASSET_SALE_HINTS },
  'je-voucher-total': { version: 2, hints: VOUCHER_HINTS },
  'je-voucher-count': { version: 2, hints: VOUCHER_HINTS },
  // Named businesses in place of "a trader", with hints.
  'je-opening-entry': { version: 2, hints: OPENING_HINTS },
  'je-opening-entry-complex': { version: 2, hints: ['Last year\'s profit is already inside the capital: does it need a line?', 'Debit every asset, credit every outside liability, and credit Capital A/c with assets less liabilities.'] },
  'je-rules-opening-count': { version: 2, hints: ['Count the assets, then the liabilities.', 'Every asset and every liability gets a line of its own, and Capital one more.'] },
  // Hints only.
  'je-outstanding-expense': { version: 2, hints: ADJUST_HINTS('expense') },
  'je-prepaid-expense': { version: 2, hints: ADJUST_HINTS('payment') },
  'je-depreciation-charged': { version: 2, hints: ['Depreciation is an expense that involves no payment.', 'Debit Depreciation A/c; credit the asset itself or Provision for Depreciation A/c, as the question says.'] },
  'je-loss-claim-full': { version: 2, hints: ['If the insurer pays it all, who bears a loss?', 'Debit Insurance Claim Receivable A/c with the claim; credit Purchases A/c with the cost of the goods.'] },
  'je-cheque-dishonoured': { version: 2, hints: ['When a cheque fails, does the customer still owe the money?', 'Debit the customer\'s account again and credit Bank A/c with the amount of the cheque.'] },
  'je-advance-adjusted': { version: 2, hints: ['The customer has already paid part. How much comes in now?', 'Credit Sales with the whole price; debit the customer\'s account with the advance and Cash or Bank with the balance received.'] },
  'je-asset-sale-credit': { version: 2, hints: ASSET_SALE_HINTS },
  'je-compound-expenses': { version: 2, hints: ['How many expenses were paid, and out of which account?', 'Debit each expense with its own amount; credit Cash or Bank once with the total.'] },
  'je-compound-capital-assets': { version: 2, hints: ['What did the owner bring in besides cash?', 'Debit each asset brought in with its value and credit Capital A/c with the total.'] },
  'je-compound-purchase-mixed': { version: 2, hints: ['Which item is for resale and which is for use in the business?', 'Debit Purchases and the asset account; credit Bank with the cheque and the supplier with the balance owed.'] },
  'je-carriage': { version: 2, hints: ['Is the carriage on goods coming in or going out?', 'Carriage on purchases is Carriage Inwards A/c; carriage on goods delivered to customers is Carriage Outwards A/c. Both are expenses, debited.'] },
  'je-carriage-purchase': { version: 2, hints: ['Who charged the carriage: the supplier, or a carrier paid in cash?', 'Debit Purchases and Carriage Inwards; credit the supplier with the price of the goods only, and Cash with the carriage.'] },
  'je-interest-capital': { version: 2, hints: ['For the business, is interest allowed to the owner a cost or an income?', 'Debit Interest on Capital A/c and credit Capital A/c: the owner is owed more.'] },
  'je-commission-expenses': { version: 2, hints: ['Work out the commission from the rate and the sales first.', 'Debit Commission Paid with the commission and Travelling Expenses with the rest; credit Cash or Bank with the whole payment.'] },
  'je-purchase-trade-cash': { version: 2, hints: TRADE_CASH_HINTS },
  'je-sale-trade-cash': { version: 2, hints: TRADE_CASH_HINTS },
  'je-prepaid-amount': { version: 2, hints: ['How many months of the cover fall after 31 March?', 'Prepaid amount = premium per month x months still to run after 31 March.'] },
  'je-depreciation-amount': { version: 2, hints: ['From the date of purchase to 31 March, for how many months was the asset used?', 'Depreciation = cost x rate x months of use / 12.'] },
  'je-goods-cost-amount': { version: 2, hints: COST_HINTS },
  'je-goods-staff-welfare-price': { version: 2, hints: COST_HINTS },
  'je-rules-pair': { version: 2, hints: ['Say what comes in and what goes out, and the type of each account.', 'The account that increases as an asset or expense is debited; the one that increases as a liability, capital or income is credited (a decrease goes the other way).'] },
  'je-rules-which-transaction': { version: 2, hints: ['For each option, name the two accounts and their types.', 'Keep the option whose debit account and credit account are both of the types asked.'] },
  'je-rules-capital-effect': { version: 2, hints: ['Does the transaction bring an income or an expense, or does the owner bring in or take out money?', 'Only incomes, expenses and losses, capital brought in and drawings change capital; exchanging one asset for another, borrowing or repaying does not.'] },
  'je-rules-party-amount': { version: 2, hints: ['Trade discount first, then GST.', 'The party\'s account takes the invoice total: (list price - trade discount) + GST on that price.'] },
  'je-rules-asset-cost': { version: 2, hints: ASSET_COST_HINTS },
  'je-rules-asset-cost-repairs': { version: 2, hints: ASSET_COST_HINTS },
  'je-voucher-entry': { version: 2, hints: ['What does the document show: money in, money out, or no money at all?', 'Write the entry the document proves: the account it names on one side, and Cash, Bank or the party on the other.'] },
};

/** The template at its raised version, with its new hints on every question it makes. */
function revised(t: Template): Template {
  const r = REVISED[t.id];
  if (!r) return t;
  if (!r.hints) return { ...t, version: r.version };
  const generate = t.generate as (...args: unknown[]) => object | null;
  const hints = r.hints;
  return { ...t, version: r.version, generate: (...args: unknown[]) => { const parts = generate(...args); return parts && { ...parts, hints }; } } as Template;
}

const all: Template[] = [
  ...templates,
  tradeDiscount,
  ...adjustments,
  ...goodsAndLosses,
  ...interestAndBanking,
  ...assetsAndFlows,
  ...expensesAndIncomes,
  ...restated,
  ...adjustmentAmounts,
  ...rules,
  ...sets,
  // Added after the check against the CBSE 2025-26 syllabus.
  ...vouchers,
  ...staffWelfare,
  // Added in the quality pass: on levels of their own, outside the papers.
  ...qualityPass,
].map(revised);

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'je', topicId: 'journal-entries', conceptId: 'je-rules',
  items: [
    {
      answer: 'explains',
      a: 'Furniture bought for cash is debited to Furniture A/c.',
      r: 'An asset that increases is debited.',
      aWhy: 'The entry is Furniture A/c Dr; To Cash A/c.',
      rWhy: 'That is the rule for assets: an increase on the debit side, a decrease on the credit side.',
      link: 'Furniture is an asset that has increased, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Goods costing ₹5,000 taken by the owner for personal use are credited to Purchases A/c and not to Sales A/c.',
      r: 'The goods leave without being sold, so their cost is taken out of purchases.',
      aWhy: 'The entry is Drawings A/c Dr; To Purchases A/c, at cost.',
      rWhy: 'Nothing has been sold, so Sales A/c has no part in the entry.',
      link: 'Purchases A/c is credited because the goods were bought and have not been sold, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'When ₹2,000 of a debt written off earlier is recovered, it is credited to Bad Debts Recovered A/c and not to the debtor\'s account.',
      r: 'The debtor\'s account was closed when the debt was written off.',
      aWhy: 'The entry is Cash A/c Dr; To Bad Debts Recovered A/c.',
      rWhy: 'Writing off the debt credited the debtor with the whole of the balance.',
      link: 'The debtor owes nothing in the books, so the recovery is a gain and not a receipt from a debtor. R explains A.',
    },
    {
      answer: 'explains',
      a: 'Input CGST on a purchase is debited.',
      r: 'Input tax can be set off later against output tax, so it is treated as an asset.',
      aWhy: 'Input CGST A/c is debited beside Purchases A/c.',
      rWhy: 'The tax paid on a purchase can be recovered by setting it off.',
      link: 'It is debited because it is an asset, and an asset rises on the debit side, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Sales Return A/c increases on the debit side.',
      r: 'A contra account increases on the side opposite to the account it reduces.',
      aWhy: 'Goods returned by a customer are debited to Sales Return A/c.',
      rWhy: 'A contra account works against the account it reduces.',
      link: 'Sales Return A/c reduces Sales A/c, which increases on the credit side, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A cash discount of ₹500 allowed to a customer is debited to Discount Allowed A/c.',
      r: 'Trade discount is deducted from the list price and is not recorded.',
      aWhy: 'Cash discount is a real loss to the firm, and a loss is debited.',
      rWhy: 'Trade discount only fixes the price.',
      link: 'R describes the other kind of discount. The debit comes from cash discount being a loss.',
    },
    {
      answer: 'not-the-reason',
      a: 'Capital brought in by the owner is credited to Capital A/c.',
      r: 'Cash brought into the business is debited to Cash A/c.',
      aWhy: 'Capital is what the business owes the owner, and it increases on the credit side.',
      rWhy: 'Cash is an asset that has increased.',
      link: 'R gives the other half of the entry. It does not say why Capital A/c is credited.',
    },
    {
      answer: 'not-the-reason',
      a: 'Interest on capital of ₹6,000 is debited to Interest on Capital A/c.',
      r: 'Capital brought in during the year earns interest only for the months left to the year end.',
      aWhy: 'Interest on capital is an expense of the business, and an expense is debited.',
      rWhy: 'Interest is worked only for the time the capital was in the business.',
      link: 'R tells how the amount is worked out, not which side the account is on.',
    },
    {
      answer: 'a-only',
      a: 'An advance of ₹10,000 received from a customer is not credited to Sales A/c.',
      r: 'An advance is income of the business on the day it comes in.',
      aWhy: 'Nothing has been sold yet, so the customer\'s account is credited.',
      rWhy: 'An advance is not income: the business still owes the goods.',
    },
    {
      answer: 'a-only',
      a: 'Uninsured goods costing ₹4,000 are destroyed by fire, and the entry is Loss by Fire A/c Dr; To Purchases A/c.',
      r: 'Goods lost by fire are taken out of the books at their selling price.',
      aWhy: 'The goods have left without being sold, and with no insurance the whole is a loss.',
      rWhy: 'They are taken out at cost: they were never sold, and they were entered in Purchases A/c at cost.',
    },
    {
      answer: 'r-only',
      a: 'Goods given away as free samples are credited to Sales A/c.',
      r: 'Free samples are an advertisement expense.',
      aWhy: 'Nothing is sold: the entry is Advertisement A/c Dr; To Purchases A/c, at cost.',
      rWhy: 'The goods are given away to make the product known.',
    },
    {
      answer: 'r-only',
      a: 'When the bank deducts charges of ₹300, Bank A/c is debited.',
      r: 'A decrease in an asset is credited.',
      aWhy: 'The bank balance falls, so Bank A/c is credited and Bank Charges A/c is debited.',
      rWhy: 'That is the rule for assets.',
    },
  ],
});

const withAssertionReason: Template[] = [...all, assertionReason];

export default withAssertionReason;
