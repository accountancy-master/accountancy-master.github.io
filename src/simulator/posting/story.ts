// ---------------------------------------------------------------------------------------------------------------
// The lab "posting": a month of a small business, from its journal to its ledger to its trial balance.
//
// A story is a list of journal entries of one month (April 2026). This file holds the stories (the ready examples
// and the made-up ones), the transactions a student can add in the sandbox, the check that a story can happen (cash
// does not run out, a party is not paid more than it is owed) and the reason each line goes to its side, by the
// rules of debit and credit that NCERT teaches (by the kind of account: asset, liability, capital, income, expense).
// ---------------------------------------------------------------------------------------------------------------

import { creditor, debtor, isParty, normalSide, resolveAccount, type Side } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import { formatINR, type Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';

export const YEAR = 2026;
export const MONTH = 'April';
export const MONTH_SHORT = 'Apr';
/** The day the accounts are balanced and the trial balance is prepared. */
export const CLOSE_DAY = 30;
export const CLOSE_DATE = `${CLOSE_DAY} ${MONTH} ${YEAR}`;
/** The day the balances are brought down. */
export const REOPEN_DATE = `1 May ${YEAR}`;
export const REOPEN_SHORT = 'May 1';

export interface PostingTxn {
  /** The day of April. */
  day: number;
  /** What happened, in one sentence. */
  text: string;
  /** The narration of the entry, the words after "Being". */
  narration: string;
  /** The entry, debits first. */
  lines: JournalLine[];
}

export interface PostingStory {
  id: string;
  title: string;
  /** The business, as the trial balance names it: "Asha Stationers". */
  business: string;
  /** One line about it: who owns it and what it trades in. */
  about: string;
  txns: PostingTxn[];
}

export const rupees = (n: number): Paise => n * 100;
const dr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Dr', amount });
const cr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Cr', amount });

/** The name of an account as the journal and the ledger write it: "Cash A/c", "Rao & Co. A/c". */
export const accountTitle = (accountId: string): string => `${resolveAccount(accountId).name} A/c`;

// ---------------------------------------------------------------------------------------------------------------
// The transactions a student can add, each made from its amount. Parties are named by the story.
// ---------------------------------------------------------------------------------------------------------------

export interface Parties {
  owner: string;
  debtor: string;
  creditor: string;
}

export interface EventKind {
  id: string;
  /** On the button or in the list: "Sold goods on credit to Mohan". */
  label: (p: Parties) => string;
  make: (amount: Paise, p: Parties) => Omit<PostingTxn, 'day'>;
}

// A sentence that ends with a name ending in a full stop ("Rao & Co.") keeps one full stop.
const tx = (text: string, narration: string, lines: JournalLine[]): Omit<PostingTxn, 'day'> => ({ text: text.replace(/\.\.$/, '.'), narration, lines });

export const EVENTS: readonly EventKind[] = [
  {
    id: 'capital',
    label: (p) => `${p.owner} brings in capital in cash`,
    make: (a, p) => tx(`${p.owner} started the business with cash of ${formatINR(a)}.`, 'capital brought in cash', [dr('cash', a), cr('capital', a)]),
  },
  {
    id: 'deposit',
    label: () => 'Cash deposited into the bank',
    make: (a) => tx(`Deposited ${formatINR(a)} of cash into the bank.`, 'cash deposited into the bank', [dr('bank', a), cr('cash', a)]),
  },
  {
    id: 'cash-purchase',
    label: () => 'Goods bought for cash',
    make: (a) => tx(`Bought goods for cash, ${formatINR(a)}.`, 'goods purchased for cash', [dr('purchases', a), cr('cash', a)]),
  },
  {
    id: 'credit-purchase',
    label: (p) => `Goods bought on credit from ${p.creditor}`,
    make: (a, p) => tx(`Bought goods on credit from ${p.creditor} for ${formatINR(a)}.`, `goods purchased on credit from ${p.creditor}`, [dr('purchases', a), cr(creditor(p.creditor), a)]),
  },
  {
    id: 'cash-sale',
    label: () => 'Goods sold for cash',
    make: (a) => tx(`Sold goods for cash, ${formatINR(a)}.`, 'goods sold for cash', [dr('cash', a), cr('sales', a)]),
  },
  {
    id: 'credit-sale',
    label: (p) => `Goods sold on credit to ${p.debtor}`,
    make: (a, p) => tx(`Sold goods on credit to ${p.debtor} for ${formatINR(a)}.`, `goods sold on credit to ${p.debtor}`, [dr(debtor(p.debtor), a), cr('sales', a)]),
  },
  {
    id: 'sales-return',
    label: (p) => `${p.debtor} returns goods`,
    make: (a, p) => tx(`${p.debtor} returned goods of ${formatINR(a)}.`, `goods returned by ${p.debtor}`, [dr('salesReturn', a), cr(debtor(p.debtor), a)]),
  },
  {
    id: 'receipt-debtor',
    label: (p) => `Cash received from ${p.debtor}`,
    make: (a, p) => tx(`Received ${formatINR(a)} in cash from ${p.debtor}.`, `cash received from ${p.debtor}`, [dr('cash', a), cr(debtor(p.debtor), a)]),
  },
  {
    id: 'cheque-debtor',
    label: (p) => `Cheque received from ${p.debtor} and banked`,
    make: (a, p) =>
      tx(`Received a cheque of ${formatINR(a)} from ${p.debtor} and deposited it into the bank the same day.`, `cheque received from ${p.debtor} and deposited into the bank`, [dr('bank', a), cr(debtor(p.debtor), a)]),
  },
  {
    id: 'purchase-return',
    label: (p) => `Goods returned to ${p.creditor}`,
    make: (a, p) => tx(`Returned goods of ${formatINR(a)} to ${p.creditor}.`, `goods returned to ${p.creditor}`, [dr(creditor(p.creditor), a), cr('purchasesReturn', a)]),
  },
  {
    id: 'pay-creditor',
    label: (p) => `Cash paid to ${p.creditor}`,
    make: (a, p) => tx(`Paid ${formatINR(a)} in cash to ${p.creditor}.`, `cash paid to ${p.creditor}`, [dr(creditor(p.creditor), a), cr('cash', a)]),
  },
  {
    id: 'furniture',
    label: () => 'Furniture bought for cash',
    make: (a) => tx(`Bought furniture for the shop for cash, ${formatINR(a)}.`, 'furniture purchased for cash', [dr('furniture', a), cr('cash', a)]),
  },
  {
    id: 'rent',
    label: () => 'Rent paid in cash',
    make: (a) => tx(`Paid rent of the shop in cash, ${formatINR(a)}.`, 'rent paid', [dr('rent', a), cr('cash', a)]),
  },
  {
    id: 'salaries',
    label: () => 'Salaries paid in cash',
    make: (a) => tx(`Paid salaries in cash, ${formatINR(a)}.`, 'salaries paid', [dr('salaries', a), cr('cash', a)]),
  },
  {
    id: 'commission',
    label: () => 'Commission received in cash',
    make: (a) => tx(`Received commission in cash, ${formatINR(a)}.`, 'commission received', [dr('cash', a), cr('commissionReceived', a)]),
  },
  {
    id: 'drawings',
    label: (p) => `${p.owner} withdraws cash for personal use`,
    make: (a, p) => tx(`${p.owner} withdrew ${formatINR(a)} in cash for personal use.`, 'cash withdrawn for personal use', [dr('drawings', a), cr('cash', a)]),
  },
];

export const findEvent = (id: string): EventKind | undefined => EVENTS.find((e) => e.id === id);

/** The days entries are dated in the sandbox, in order: twelve entries at most. */
export const PLAY_DAYS = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 27] as const;
export const MAX_ENTRIES = PLAY_DAYS.length;
/** The last day a transaction can be dated: the accounts are balanced on the 30th. */
const LAST_DAY = CLOSE_DAY - 1;

/**
 * The date of the next entry added to a month: the journal is kept in the order of dates, so it comes after the
 * last entry (the next of `PLAY_DAYS`, or the day after). Null when the month is full.
 */
export function nextDay(txns: readonly PostingTxn[]): number | null {
  if (txns.length >= MAX_ENTRIES) return null;
  const last = txns.length > 0 ? txns[txns.length - 1].day : 0;
  const day = PLAY_DAYS.find((d) => d > last) ?? last + 1;
  return day <= LAST_DAY ? day : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Whether a story can happen: cash and bank never run out, a debtor never pays (or returns) more than is owed, a
// creditor is never paid more than is owed. The first breach, in words, or null.
// ---------------------------------------------------------------------------------------------------------------

export function storyProblem(txns: readonly PostingTxn[]): string | null {
  const net = new Map<string, Paise>();
  for (const t of txns) {
    for (const l of t.lines) net.set(l.accountId, (net.get(l.accountId) ?? 0) + (l.side === 'Dr' ? l.amount : -l.amount));
    for (const [id, v] of net) {
      const a = resolveAccount(id);
      // What the account stood at before this transaction.
      const before = v - effectOf(t, id);
      if ((id === 'cash' || id === 'bank') && v < 0) {
        return `There is not enough ${id === 'cash' ? 'cash in hand' : 'money in the bank'} for this: only ${formatINR(before)} is there.`;
      }
      if (id.startsWith('debtor:') && v < 0) return `${a.name} owes only ${formatINR(before)}, so cannot pay or return more than that.`;
      if (id.startsWith('creditor:') && v > 0) return `Only ${formatINR(-before)} is owed to ${a.name}, so no more than that can be paid or returned.`;
    }
  }
  return null;
}
/** What one transaction does to an account: debits less credits. */
const effectOf = (t: PostingTxn, id: string): Paise => t.lines.filter((l) => l.accountId === id).reduce((s, l) => s + (l.side === 'Dr' ? l.amount : -l.amount), 0);

// ---------------------------------------------------------------------------------------------------------------
// Why a line goes to its side: the rule of debit and credit for the kind of account.
// ---------------------------------------------------------------------------------------------------------------

/** One or two short sentences: what the account is, whether it rises or falls, and so which side. */
export function reasonFor(accountId: string, side: Side): string {
  const a = resolveAccount(accountId);
  const name = isParty(accountId) ? a.name : `${a.name} A/c`;
  const up = normalSide(a) === side;
  const sideWord = side === 'Dr' ? 'debited' : 'credited';
  if (accountId.startsWith('debtor:')) {
    return up
      ? `${a.name} now owes the business more. A debtor is an asset, and an increase in an asset is ${sideWord}.`
      : `${a.name} now owes the business less. A debtor is an asset, and a decrease in an asset is ${sideWord}.`;
  }
  if (accountId.startsWith('creditor:')) {
    return up
      ? `The business now owes ${a.name} more. A creditor is a liability, and an increase in a liability is ${sideWord}.`
      : `The business now owes ${a.name} less. A creditor is a liability, and a decrease in a liability is ${sideWord}.`;
  }
  if (a.contra && a.reduces) {
    // Drawings, Sales Return, Purchases Return: each reduces another account, so it is recorded as a decrease of it.
    const reduced = { asset: 'an asset', liability: 'a liability', capital: 'capital', income: 'an income', expense: 'an expense' }[a.type];
    return up
      ? `${name} reduces ${a.reduces}, and a decrease in ${reduced} is ${sideWord}.`
      : `${name} reduces ${a.reduces}. Here it is itself reduced, so it is ${sideWord}.`;
  }
  // The two accounts of goods, said in their own words.
  if (accountId === 'purchases' && up) return 'Purchases A/c records goods bought for resale, which are an expense of the business, and expenses are debited.';
  if (accountId === 'sales' && up) return 'Sales A/c records the sale of goods, which is an income of the business, and incomes are credited.';
  switch (a.type) {
    case 'asset':
      return `${name} is an asset. It ${up ? 'increases' : 'decreases'}, and ${up ? 'an increase' : 'a decrease'} in an asset is ${sideWord}.`;
    case 'liability':
      return `${name} is a liability. It ${up ? 'increases' : 'decreases'}, and ${up ? 'an increase' : 'a decrease'} in a liability is ${sideWord}.`;
    case 'capital':
      return `${name} is the owner's claim. It ${up ? 'increases' : 'decreases'}, and ${up ? 'an increase' : 'a decrease'} in capital is ${sideWord}.`;
    case 'income':
      return up ? `${name} is an income. Incomes increase capital, so they are ${sideWord}.` : `${name} is an income that is reduced here, so it is ${sideWord}.`;
    case 'expense':
      return up ? `${name} is an expense. Expenses reduce capital, so they are ${sideWord}.` : `${name} is an expense that is reduced here, so it is ${sideWord}.`;
  }
}

/** The kind of account in a word or two, for the trial balance: "an asset", "a creditor (a liability)". */
export function kindOf(accountId: string): string {
  const a = resolveAccount(accountId);
  if (accountId.startsWith('debtor:')) return 'a debtor (an asset)';
  if (accountId.startsWith('creditor:')) return 'a creditor (a liability)';
  if (a.contra && a.reduces) return `a reduction of ${a.reduces}`;
  return { asset: 'an asset', liability: 'a liability', capital: 'capital', income: 'an income', expense: 'an expense' }[a.type];
}

// ---------------------------------------------------------------------------------------------------------------
// The ready examples.
// ---------------------------------------------------------------------------------------------------------------

const ASHA: Parties = { owner: 'Asha', debtor: 'Mohan', creditor: 'Rao & Co.' };

function storyOf(id: string, title: string, business: string, about: string, parties: Parties, items: [number, string, number][]): PostingStory {
  return {
    id,
    title,
    business,
    about,
    txns: items.map(([day, kind, amount]) => ({ day, ...findEvent(kind)!.make(rupees(amount), parties) })),
  };
}

export const READY: readonly PostingStory[] = [
  storyOf('first-month', 'A first month', 'Asha Stationers', 'Asha runs a stationery shop in Pune. Every dealing is in cash unless it says credit.', ASHA, [
    [1, 'capital', 100000],
    [3, 'credit-purchase', 30000],
    [8, 'cash-sale', 25000],
    [15, 'rent', 6000],
    [20, 'pay-creditor', 18000],
  ]),
  storyOf(
    'credit-customer',
    'A customer on credit',
    'Asha Stationers',
    'Asha runs a stationery shop in Pune. Cheques received are deposited into the bank the same day.',
    ASHA,
    [
      [1, 'capital', 150000],
      [2, 'deposit', 60000],
      [6, 'credit-sale', 40000],
      [12, 'sales-return', 3000],
      [18, 'cheque-debtor', 25000],
      [25, 'salaries', 9000],
    ],
  ),
  storyOf('supplier-cleared', 'A supplier paid in full', 'Asha Stationers', 'Asha runs a stationery shop in Pune. Every dealing is in cash unless it says credit.', ASHA, [
    [1, 'capital', 80000],
    [4, 'credit-purchase', 32000],
    [9, 'purchase-return', 2000],
    [16, 'pay-creditor', 30000],
    [21, 'cash-sale', 27000],
  ]),
  storyOf('owner-and-income', 'Drawings and a commission', 'Asha Stationers', 'Asha runs a stationery shop in Pune. Every dealing is in cash unless it says credit.', ASHA, [
    [1, 'capital', 120000],
    [5, 'furniture', 35000],
    [11, 'commission', 4500],
    [19, 'drawings', 7000],
    [26, 'cash-sale', 18000],
  ]),
  {
    id: 'settled-at-discount',
    title: 'A debt settled at a discount',
    business: 'Asha Stationers',
    about: 'Asha runs a stationery shop in Pune. Mohan pays early and is allowed a discount: one entry with three accounts.',
    txns: [
      { day: 1, ...findEvent('capital')!.make(rupees(90000), ASHA) },
      { day: 7, ...findEvent('credit-sale')!.make(rupees(20000), ASHA) },
      {
        day: 14,
        text: 'Mohan paid ₹19,500 in cash in full settlement of the ₹20,000 owed.',
        narration: 'cash received from Mohan in full settlement and discount allowed',
        lines: [dr('cash', rupees(19500)), dr('discountAllowed', rupees(500)), cr(debtor('Mohan'), rupees(20000))],
      },
      { day: 22, ...findEvent('rent')!.make(rupees(5000), ASHA) },
    ],
  },
];

export const findReady = (id: string): PostingStory | undefined => READY.find((s) => s.id === id);

// ---------------------------------------------------------------------------------------------------------------
// Made-up stories, from a seed: which transactions happen, in which order and for how much all change with it.
// ---------------------------------------------------------------------------------------------------------------

const OWNERS = [
  { owner: 'Asha', business: 'Asha Stationers', trade: 'a stationery shop in Pune' },
  { owner: 'Kiran', business: 'Kiran Traders', trade: 'a grocery store in Nagpur' },
  { owner: 'Farhan', business: 'Farhan Book House', trade: 'a bookshop in Lucknow' },
  { owner: 'Meera', business: 'Meera Electricals', trade: 'an electrical goods shop in Kochi' },
  { owner: 'Gurpreet', business: 'Gurpreet Sports', trade: 'a sports goods shop in Ludhiana' },
];
const DEBTORS = ['Mohan', 'Sunita', 'Ravi', 'Deepa', 'Imran', 'Lakshmi'];
const CREDITORS = ['Rao & Co.', 'Jain Brothers', 'Bharat Suppliers', 'Nair & Sons'];

const round = (rng: Rng, min: number, max: number, step: number): Paise => rupees(rng.step(min, max, step));

/** A month of five or six entries for the seed, always one that can happen. */
export function storyFromSeed(seed: number): PostingStory {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = createRng(seed * 7919 + attempt);
    const who = rng.pick(OWNERS);
    const parties: Parties = { owner: who.owner, debtor: rng.pick(DEBTORS), creditor: rng.pick(CREDITORS) };
    const capital = round(rng, 60000, 200000, 10000);
    const bought = round(rng, 15000, 45000, 1000);
    const sold = round(rng, 10000, 40000, 1000);
    // Three threads, merged in an order drawn from the seed: the supplier, the customer, the shop's own spending.
    const supplier: [string, Paise][] = [['credit-purchase', bought]];
    const r = rng.next();
    if (r < 0.35) supplier.push(['pay-creditor', bought]); // paid in full: an account with no balance
    else if (r < 0.75) supplier.push(['pay-creditor', round(rng, 5000, Math.max(5000, bought / 100 - 5000), 1000)]);
    else supplier.push(['purchase-return', round(rng, 1000, 3000, 500)]);
    const customer: [string, Paise][] = rng.pick([
      [['cash-sale', sold]],
      [['credit-sale', sold], ['receipt-debtor', round(rng, 5000, Math.max(5000, sold / 100 - 2000), 1000)]],
      [['credit-sale', sold], ['cheque-debtor', sold]],
    ]);
    const spend: [string, Paise][] = rng.shuffle([
      ['rent', round(rng, 3000, 9000, 500)],
      ['salaries', round(rng, 5000, 12000, 500)],
      ['furniture', round(rng, 10000, 30000, 1000)],
      ['drawings', round(rng, 2000, 8000, 500)],
      ['commission', round(rng, 1500, 5000, 500)],
    ] as [string, Paise][]).slice(0, rng.int(1, 2));
    const threads = [supplier, customer, spend].map((t) => [...t]);
    const order: [string, Paise][] = [];
    while (threads.some((t) => t.length > 0)) {
      const open = threads.filter((t) => t.length > 0);
      order.push(rng.pick(open).shift()!);
    }
    // A cheque needs a bank account: the capital is brought in and part of it banked first.
    const opening: [string, Paise][] = [['capital', capital]];
    if (order.some(([k]) => k === 'cheque-debtor') || rng.next() < 0.3) opening.push(['deposit', round(rng, 10000, capital / 200, 5000)]);
    const all = [...opening, ...order];
    const days = [...PLAY_DAYS].slice(0, all.length);
    const txns = all.map(([kind, amount], i) => ({ day: days[i], ...findEvent(kind)!.make(amount, parties) }));
    if (storyProblem(txns) === null && txns.length <= 7) {
      return { id: `seed-${seed}`, title: `New figures (${seed})`, business: who.business, about: `${who.owner} runs ${who.trade}. Every dealing is in cash unless it says otherwise.`, txns };
    }
  }
  return READY[0] as PostingStory;
}

/** Parties of a story, read back from its accounts (for the sandbox, which adds to a story). */
export function partiesOf(story: PostingStory): Parties {
  const ids = story.txns.flatMap((t) => t.lines.map((l) => l.accountId));
  const d = ids.find((id) => id.startsWith('debtor:'));
  const c = ids.find((id) => id.startsWith('creditor:'));
  const owner = story.business.split(' ')[0];
  return { owner, debtor: d ? d.slice(7) : 'Mohan', creditor: c ? c.slice(9) : 'Rao & Co.' };
}
