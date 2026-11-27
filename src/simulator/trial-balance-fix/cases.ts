// ---------------------------------------------------------------------------------------------------------------
// The cases of the lab: four ready months of rising difficulty, and a new month for any seed.
//
// Each transaction is made by a helper that gives its entry, its line in the list of transactions, the words an
// error names it by and its narration, so that every case speaks of its transactions the same way.
// ---------------------------------------------------------------------------------------------------------------

import { creditor, debtor } from '@/engine/accounts';
import type { JournalLine } from '@/engine/journal';
import type { Paise } from '@/engine/money';
import { createRng, type Rng } from '@/engine/rng';
import { buildCase, f, problemOf, rupees, type CaseData, type CaseErrorData, type OpeningBalance, type Txn } from './model';

const dr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Dr', amount });
const cr = (accountId: string, amount: Paise): JournalLine => ({ accountId, side: 'Cr', amount });
const R = rupees;

// ---------------------------------------------------------------------------------------------------------------
// The transactions.
// ---------------------------------------------------------------------------------------------------------------

type Mode = 'cash' | 'bank';
const ASSET_NAME: Record<string, string> = { furniture: 'furniture', machinery: 'a machine', computers: 'a computer' };
const EXPENSE_NAME: Record<string, string> = { rent: 'rent', wages: 'wages', salaries: 'salaries', electricity: 'electricity', advertisement: 'advertisement' };

export const T = {
  capital: (day: number, owner: string, x: Paise): Txn => ({
    day,
    text: `${owner} started the business with ${f(x)} in cash.`,
    what: `Capital of ${f(x)} brought in cash`,
    lines: [dr('cash', x), cr('capital', x)],
    narration: 'Being business started with cash',
  }),
  creditSale: (day: number, party: string, x: Paise, book = false): Txn => ({
    day,
    text: `Sold goods on credit to ${party}, ${f(x)}.`,
    what: `A credit sale of ${f(x)} to ${party}`,
    lines: [dr(debtor(party), x), cr('sales', x)],
    narration: `Being goods sold on credit to ${party}`,
    ...(book ? { book: true as const } : {}),
  }),
  cashSale: (day: number, x: Paise): Txn => ({
    day,
    text: `Sold goods for cash, ${f(x)}.`,
    what: `A cash sale of ${f(x)}`,
    lines: [dr('cash', x), cr('sales', x)],
    narration: 'Being goods sold for cash',
  }),
  creditPurchase: (day: number, party: string, x: Paise, book = false): Txn => ({
    day,
    text: `Bought goods on credit from ${party}, ${f(x)}.`,
    what: `A credit purchase of ${f(x)} from ${party}`,
    lines: [dr('purchases', x), cr(creditor(party), x)],
    narration: `Being goods bought on credit from ${party}`,
    ...(book ? { book: true as const } : {}),
  }),
  cashPurchase: (day: number, x: Paise): Txn => ({
    day,
    text: `Bought goods for cash, ${f(x)}.`,
    what: `A cash purchase of goods for ${f(x)}`,
    lines: [dr('purchases', x), cr('cash', x)],
    narration: 'Being goods bought for cash',
  }),
  asset: (day: number, asset: string, x: Paise, mode: Mode): Txn => {
    const name = ASSET_NAME[asset];
    const Name = name.charAt(0).toUpperCase() + name.slice(1);
    return {
      day,
      text: `Bought ${name} for ${f(x)}, paying ${mode === 'cash' ? 'in cash' : 'by cheque'}.`,
      what: `${Name} bought for ${f(x)} ${mode === 'cash' ? 'in cash' : 'by cheque'}`,
      lines: [dr(asset, x), cr(mode, x)],
      narration: `Being ${name} bought ${mode === 'cash' ? 'for cash' : 'by cheque'}`,
    };
  },
  received: (day: number, party: string, x: Paise, mode: Mode): Txn => ({
    day,
    text: mode === 'cash' ? `Received ${f(x)} in cash from ${party}.` : `Received a cheque for ${f(x)} from ${party} and deposited it in the bank.`,
    what: `${f(x)} received ${mode === 'cash' ? 'in cash' : 'by cheque'} from ${party}`,
    lines: [dr(mode, x), cr(debtor(party), x)],
    narration: mode === 'cash' ? `Being cash received from ${party}` : `Being cheque received from ${party} and deposited in the bank`,
  }),
  paid: (day: number, party: string, x: Paise, mode: Mode): Txn => ({
    day,
    text: `Paid ${party} ${f(x)} ${mode === 'cash' ? 'in cash' : 'by cheque'}.`,
    what: `${f(x)} paid ${mode === 'cash' ? 'in cash' : 'by cheque'} to ${party}`,
    lines: [dr(creditor(party), x), cr(mode, x)],
    narration: mode === 'cash' ? `Being cash paid to ${party}` : `Being cheque issued to ${party}`,
  }),
  expense: (day: number, account: string, x: Paise, mode: Mode = 'cash'): Txn => ({
    day,
    text: `Paid ${EXPENSE_NAME[account]}, ${f(x)}, ${mode === 'cash' ? 'in cash' : 'by cheque'}.`,
    what: `${f(x)} paid ${mode === 'cash' ? 'in cash' : 'by cheque'} for ${EXPENSE_NAME[account]}`,
    lines: [dr(account, x), cr(mode, x)],
    narration: `Being ${EXPENSE_NAME[account]} paid ${mode === 'cash' ? 'in cash' : 'by cheque'}`,
  }),
  commission: (day: number, x: Paise): Txn => ({
    day,
    text: `Received commission, ${f(x)}, in cash.`,
    what: `Commission of ${f(x)} received in cash`,
    lines: [dr('cash', x), cr('commissionReceived', x)],
    narration: 'Being commission received in cash',
  }),
  drawings: (day: number, x: Paise): Txn => ({
    day,
    text: `Withdrew ${f(x)} in cash for personal use.`,
    what: `${f(x)} withdrawn in cash for personal use`,
    lines: [dr('drawings', x), cr('cash', x)],
    narration: 'Being cash withdrawn for personal use',
  }),
};

const open = (accountId: string, side: 'Dr' | 'Cr', amount: Paise): OpeningBalance => ({ accountId, side, amount });

// ---------------------------------------------------------------------------------------------------------------
// The ready cases. Each is worked by hand in cases.test.ts.
// ---------------------------------------------------------------------------------------------------------------

/** Level 1: a new business, its journal only; an error of principle and two posting errors. */
export const ASHA: CaseData = {
  id: 'asha',
  title: 'Asha Stationers',
  level: 'Level 1: three errors',
  business: 'Asha Stationers',
  owner: 'Asha',
  trade: 'sells stationery',
  opening: [],
  txns: [
    T.capital(1, 'Asha', R(100000)),
    T.cashPurchase(3, R(30000)),
    T.asset(6, 'furniture', R(12000), 'cash'),
    T.creditSale(10, 'Mohan', R(8000)),
    T.cashSale(15, R(32000)),
    T.creditPurchase(20, 'Rao & Co.', R(18000)),
    T.expense(25, 'rent', R(4000)),
    T.expense(28, 'wages', R(2500)),
  ],
  errors: [
    { kind: 'principle', txn: 2, line: 0, as: 'purchases' },
    { kind: 'partial-omission', txn: 3, line: 0 },
    { kind: 'wrong-amount', txn: 6, line: 0, as: R(400) },
  ],
  // Goods bought ₹48,000, sold for ₹40,000 at a cost of ₹18,000.
  closingStock: R(30000),
};

/** Level 2: a running business with a Sales Book; a posting found wrong before the trial balance, and four after. */
export const KIRAN: CaseData = {
  id: 'kiran',
  title: 'Kiran Traders',
  level: 'Level 2: a Sales Book, five errors',
  business: 'Kiran Traders',
  owner: 'Kiran',
  trade: 'deals in kitchenware',
  opening: [open('cash', 'Dr', R(40000)), open('furniture', 'Dr', R(25000)), open(debtor('Priya'), 'Dr', R(12000)), open(creditor('Jain Brothers'), 'Cr', R(15000)), open('capital', 'Cr', R(62000))],
  txns: [
    T.creditPurchase(2, 'Jain Brothers', R(20000)),
    T.creditSale(5, 'Ravi', R(9000), true),
    T.creditSale(9, 'Priya', R(6500), true),
    T.received(12, 'Priya', R(10000), 'cash'),
    T.creditSale(16, 'Sunita', R(7500), true),
    T.paid(18, 'Jain Brothers', R(15000), 'cash'),
    T.received(20, 'Ravi', R(4000), 'cash'),
    T.expense(22, 'salaries', R(6000)),
    T.cashSale(25, R(12000)),
    T.expense(26, 'rent', R(3000)),
  ],
  errors: [
    { kind: 'wrong-side', txn: 3, line: 1 },
    { kind: 'wrong-account', txn: 6, line: 1, as: debtor('Sunita') },
    { kind: 'complete-omission', txn: 7 },
    { kind: 'partial-omission', txn: 9, line: 1, before: true },
    { kind: 'book-casting', as: R(22000) },
  ],
  closingStock: R(8000),
};

/** Level 3: a Purchases Book, opening stock; casting, balancing, compensating errors and a trial balance slip. */
export const MEERA: CaseData = {
  id: 'meera',
  title: 'Meera Electricals',
  level: 'Level 3: casting, balancing and the trial balance itself',
  business: 'Meera Electricals',
  owner: 'Meera',
  trade: 'sells electrical goods',
  opening: [
    open('cash', 'Dr', R(30000)),
    open('bank', 'Dr', R(50000)),
    open('stock', 'Dr', R(20000)),
    open(debtor('Deepa'), 'Dr', R(14000)),
    open(creditor('Bharat Suppliers'), 'Cr', R(18000)),
    open('capital', 'Cr', R(96000)),
  ],
  txns: [
    T.creditPurchase(3, 'Bharat Suppliers', R(16000), true),
    T.creditPurchase(6, 'Jain Brothers', R(11000), true),
    T.asset(8, 'machinery', R(25000), 'bank'),
    T.cashSale(12, R(32000)),
    T.received(15, 'Deepa', R(9000), 'bank'),
    T.expense(18, 'wages', R(4500)),
    T.paid(22, 'Bharat Suppliers', R(18000), 'bank'),
    T.expense(25, 'wages', R(5000)),
    T.cashSale(27, R(14000)),
  ],
  errors: [
    { kind: 'wrong-amount', txn: 1, line: 1, as: R(1100) },
    { kind: 'principle', txn: 2, line: 0, as: 'purchases' },
    { kind: 'compensating', a: { accountId: 'sales', side: 'Cr', by: R(1000) }, b: { accountId: 'wages', side: 'Dr', by: R(1000) } },
    { kind: 'wrong-balance', accountId: 'cash', as: R(65600) },
    { kind: 'tb-wrong-column', accountId: debtor('Deepa') },
  ],
  closingStock: R(30000),
};

/** Level 4, the detective case: six errors, five of them found by ticking the ledger against the journal. */
export const FARHAN: CaseData = {
  id: 'farhan',
  title: 'Farhan Book House',
  level: 'Level 4: find the errors yourself',
  business: 'Farhan Book House',
  owner: 'Farhan',
  trade: 'sells books',
  opening: [open('cash', 'Dr', R(25000)), open('bank', 'Dr', R(60000)), open(debtor('Imran'), 'Dr', R(8000)), open(creditor('Rao & Co.'), 'Cr', R(12000)), open('capital', 'Cr', R(81000))],
  txns: [
    T.creditPurchase(2, 'Rao & Co.', R(14000)),
    T.creditSale(4, 'Imran', R(6000)),
    T.cashSale(7, R(18000)),
    T.paid(10, 'Rao & Co.', R(12000), 'bank'),
    T.received(14, 'Imran', R(8000), 'cash'),
    T.expense(17, 'electricity', R(2200)),
    T.creditSale(21, 'Ravi', R(5500)),
    T.drawings(24, R(3000)),
    T.cashPurchase(28, R(9000)),
    T.commission(29, R(1500)),
  ],
  errors: [
    { kind: 'partial-omission', txn: 1, line: 1 },
    { kind: 'wrong-amount', txn: 3, line: 0, as: R(21000) },
    { kind: 'wrong-side', txn: 4, line: 1 },
    { kind: 'wrong-account', txn: 6, line: 0, as: debtor('Imran') },
    { kind: 'casting', accountId: 'purchases', side: 'Dr', by: -R(1000) },
    { kind: 'complete-omission', txn: 9 },
  ],
  closingStock: R(12000),
  detective: true,
};

export const READY_CASES: readonly CaseData[] = [ASHA, KIRAN, MEERA, FARHAN];

// ---------------------------------------------------------------------------------------------------------------
// A new month for a seed: a running business, eight to ten transactions, three to five errors of the kinds the
// ready cases show. A draw that cannot stand (a balance on the wrong side, a trial balance that happens to agree,
// cash running out) is drawn again.
// ---------------------------------------------------------------------------------------------------------------

const FIRMS: [string, string, string][] = [
  ['Navya Traders', 'Navya', 'deals in hardware'],
  ['Arjun Textiles', 'Arjun', 'sells cloth'],
  ['Lata General Store', 'Lata', 'runs a general store'],
  ['Sameer Electronics', 'Sameer', 'sells electronics'],
  ['Kavya Stationers', 'Kavya', 'sells stationery'],
  ['Joseph Footwear', 'Joseph', 'sells footwear'],
  ['Harpreet Sports', 'Harpreet', 'sells sports goods'],
  ['Fatima Crockery', 'Fatima', 'sells crockery'],
];
const DEBTORS = ['Mohan', 'Priya', 'Ravi', 'Sunita', 'Imran', 'Deepa', 'Anil', 'Geeta'];
const CREDITORS = ['Rao & Co.', 'Jain Brothers', 'Bharat Suppliers', 'Gupta & Sons'];

/** Two digits of a figure swapped (₹4,560 for ₹4,650), or a nought dropped: the slips a clerk makes. */
function slip(rng: Rng, x: Paise): Paise {
  const r = Math.round(x / 100);
  const digits = String(r).split('');
  const pairs: number[] = [];
  for (let i = 0; i + 1 < digits.length; i++) if (digits[i] !== digits[i + 1] && !(i === 0 && digits[1] === '0')) pairs.push(i);
  if (pairs.length && rng.int(0, 3) > 0) {
    const i = rng.pick(pairs);
    [digits[i], digits[i + 1]] = [digits[i + 1], digits[i]];
    return R(Number(digits.join('')));
  }
  return r % 10 === 0 ? R(r / 10) : R(r * 10);
}

function draw(rng: Rng): CaseData | null {
  const [business, owner, trade] = rng.pick(FIRMS);
  const ds = rng.shuffle(DEBTORS).slice(0, 3);
  const cs = rng.shuffle(CREDITORS).slice(0, 2);
  const cash = R(rng.step(20000, 50000, 1000));
  const bank = R(rng.step(30000, 80000, 1000));
  const furniture = R(rng.step(10000, 40000, 1000));
  const d1 = R(rng.step(6000, 20000, 500));
  const c1 = R(rng.step(8000, 25000, 500));
  const stock = R(rng.step(10000, 30000, 1000));
  const opening: OpeningBalance[] = [
    open('cash', 'Dr', cash),
    open('bank', 'Dr', bank),
    open('stock', 'Dr', stock),
    open('furniture', 'Dr', furniture),
    open(debtor(ds[0]), 'Dr', d1),
    open(creditor(cs[0]), 'Cr', c1),
    open('capital', 'Cr', cash + bank + stock + furniture + d1 - c1),
  ];
  const book = rng.pick(['sales', 'purchases', null] as const);

  // The transactions, in an order and on days of their own.
  const amount = (lo: number, hi: number, step = 500) => R(rng.step(lo, hi, step));
  const makers: ((day: number) => Txn)[] = [
    (d) => T.creditPurchase(d, cs[0], amount(8000, 25000), book === 'purchases'),
    (d) => T.creditSale(d, ds[1], amount(5000, 15000), book === 'sales'),
    (d) => T.cashSale(d, amount(8000, 30000)),
    (d) => T.received(d, ds[0], R(Math.max(500, Math.floor((d1 / 100) * rng.step(40, 90, 10) / 100 / 500) * 500)), rng.pick(['cash', 'bank'] as const)),
    (d) => T.expense(d, rng.pick(['rent', 'wages', 'salaries', 'electricity'] as const), amount(1500, 6000, 100)),
    (d) => T.asset(d, rng.pick(['furniture', 'machinery', 'computers'] as const), amount(8000, 25000, 1000), rng.pick(['cash', 'bank'] as const)),
    (d) => T.creditSale(d, ds[2], amount(4000, 12000), book === 'sales'),
  ];
  const extras: ((day: number) => Txn)[] = rng.shuffle<(day: number) => Txn>([
    (d) => T.paid(d, cs[0], R(Math.max(1000, Math.floor(c1 / 100 / 1000) * 1000)), 'bank'),
    (d) => T.cashPurchase(d, amount(3000, 10000)),
    (d) => T.commission(d, amount(500, 3000, 100)),
    (d) => T.expense(d, 'advertisement', amount(1000, 4000, 100)),
    (d) => T.creditPurchase(d, cs[1], amount(5000, 15000), book === 'purchases'),
    (d) => T.drawings(d, amount(1000, 5000)),
  ]).slice(0, rng.int(1, 3));
  const chosen = rng.shuffle([...makers, ...extras]);
  const days = rng.shuffle(Array.from({ length: 27 }, (_, i) => i + 2)).slice(0, chosen.length).sort((a, b) => a - b);
  const txns = chosen.map((m, i) => m(days[i]));

  // The errors: three to five, on transactions and accounts of their own.
  const errors: CaseErrorData[] = [];
  const usedTxn = new Set<number>();
  const usedAcc = new Set<string>();
  const freeTxn = (ok: (t: Txn, i: number) => boolean): number | null => {
    const free = txns.map((t, i) => i).filter((i) => !usedTxn.has(i) && ok(txns[i], i));
    if (!free.length) return null;
    const i = rng.pick(free);
    usedTxn.add(i);
    return i;
  };
  const touch = (...ids: string[]) => ids.forEach((id) => usedAcc.add(id));
  // The items on a side of an account, as posted: a book's rows reach Sales (Purchases) A/c as one total. A side is
  // cast wrongly only where there are figures to add up.
  const itemsOn = (acc: string, side: 'Dr' | 'Cr') => {
    const has = (t: Txn) => t.lines.some((l) => l.accountId === acc && l.side === side);
    return txns.filter((t) => !t.book && has(t)).length + (txns.some((t) => t.book && has(t)) ? 1 : 0);
  };
  const party = (t: Txn): 0 | 1 | -1 => (t.lines[0].accountId.includes(':') ? 0 : t.lines[1].accountId.includes(':') ? 1 : -1);

  const pool: (() => CaseErrorData | null)[] = [
    () => {
      const i = freeTxn((t) => !t.book && ['furniture', 'machinery', 'computers'].includes(t.lines[0].accountId));
      return i === null ? null : { kind: 'principle', txn: i, line: 0, as: 'purchases' };
    },
    () => {
      const i = freeTxn((t) => !t.book);
      return i === null ? null : { kind: 'complete-omission', txn: i };
    },
    () => {
      const i = freeTxn(() => true);
      if (i === null) return null;
      const t = txns[i];
      return { kind: 'partial-omission', txn: i, line: t.book ? (party(t) === 0 ? 0 : 1) : rng.int(0, 1) };
    },
    () => {
      const i = freeTxn(() => true);
      if (i === null) return null;
      const t = txns[i];
      const line = t.book ? (party(t) === 0 ? 0 : 1) : rng.int(0, 1);
      const as = slip(rng, t.lines[line].amount);
      return as === t.lines[line].amount ? null : { kind: 'wrong-amount', txn: i, line, as };
    },
    () => {
      const i = freeTxn((t) => party(t) >= 0 || t.lines[0].accountId === 'drawings' || ['rent', 'wages', 'salaries', 'electricity', 'advertisement'].includes(t.lines[0].accountId));
      if (i === null) return null;
      const t = txns[i];
      return { kind: 'wrong-side', txn: i, line: party(t) === 1 ? 1 : 0 };
    },
    () => {
      const i = freeTxn((t) => party(t) >= 0 && t.lines[party(t) === 1 ? 1 : 0].accountId.startsWith('debtor:'));
      if (i === null) return null;
      const t = txns[i];
      const line = party(t) === 1 ? 1 : 0;
      const other = ds.map((n) => debtor(n)).filter((id) => id !== t.lines[line].accountId);
      return { kind: 'wrong-account', txn: i, line, as: rng.pick(other) };
    },
    () => {
      if (!book || errors.some((e) => e.kind === 'book-casting')) return null;
      const sum = txns.filter((t) => t.book).reduce((s, t) => s + t.lines[0].amount, 0);
      const by = R(rng.step(100, 2000, 100)) * rng.pick([1, -1]);
      return sum + by > 0 ? { kind: 'book-casting', as: sum + by } : null;
    },
    () => {
      if (errors.some((e) => e.kind === 'casting' || e.kind === 'compensating')) return null;
      const acc = rng.pick(['sales', 'purchases', 'rent', 'wages', 'salaries', 'electricity', 'advertisement'].filter((a) => !usedAcc.has(a) && itemsOn(a, a === 'sales' ? 'Cr' : 'Dr') >= 2));
      if (!acc) return null;
      touch(acc);
      const side = acc === 'sales' ? 'Cr' : 'Dr';
      return { kind: 'casting', accountId: acc, side, by: R(rng.step(100, 2000, 100)) * rng.pick([1, -1]) };
    },
    () => {
      const acc = rng.pick(['cash', 'bank', debtor(ds[0])].filter((a) => !usedAcc.has(a)));
      if (!acc) return null;
      touch(acc);
      return { kind: 'wrong-balance', accountId: acc, as: 0 }; // its figure is set once the balance is known
    },
    () => {
      if (errors.some((e) => e.kind === 'casting' || e.kind === 'compensating')) return null;
      const a = rng.pick(['sales', 'commissionReceived'].filter((x) => !usedAcc.has(x) && itemsOn(x, 'Cr') >= 2));
      const b = rng.pick(['purchases', 'rent', 'wages', 'salaries', 'electricity', 'advertisement'].filter((x) => !usedAcc.has(x) && itemsOn(x, 'Dr') >= 2));
      if (!a || !b) return null;
      touch(a, b);
      const by = R(rng.step(200, 1500, 100));
      // An income overcast and an expense overcast cancel; so do an income undercast and an expense undercast.
      const sign = rng.pick([1, -1]);
      return { kind: 'compensating', a: { accountId: a, side: 'Cr', by: by * sign }, b: { accountId: b, side: 'Dr', by: by * sign } };
    },
  ];

  const want = rng.int(3, 5);
  for (let go = 0; go < 40 && errors.length < want; go++) {
    const e = rng.pick(pool)();
    if (e) errors.push(e);
  }
  if (errors.length < 3) return null;
  // One in three months has a posting found wrong before the trial balance; one in three a slip in the trial balance.
  if (rng.int(0, 2) === 0) {
    const cand = errors.filter((e) => e.kind === 'partial-omission' || e.kind === 'wrong-amount' || e.kind === 'wrong-side');
    if (cand.length > 1) rng.pick(cand).before = true;
  }
  if (rng.int(0, 2) === 0) {
    const acc = rng.pick(['bank', 'furniture', debtor(ds[0]), creditor(cs[0])].filter((a) => !usedAcc.has(a)));
    if (acc) {
      touch(acc);
      errors.push({ kind: rng.pick(['tb-omitted', 'tb-wrong-column'] as const), accountId: acc });
    }
  }
  // Closing stock: what is left of the opening stock and the purchases once the goods sold are taken out at cost
  // (60% to 80% of their price), kept between 15% and 85% of the goods available.
  const purchases = txns.filter((t) => t.lines[0].accountId === 'purchases').reduce((s, t) => s + t.lines[0].amount, 0);
  const sales = txns.filter((t) => t.lines[1].accountId === 'sales').reduce((s, t) => s + t.lines[1].amount, 0);
  const available = stock + purchases;
  const left = Math.min(Math.max(available - (sales * rng.step(60, 80, 5)) / 100, available * 0.15), available * 0.85);
  const data: CaseData = {
    id: 'new',
    title: business,
    level: 'A new month',
    business,
    owner,
    trade,
    opening,
    txns,
    // The errors in the order of the books: transactions first, by date, then the castings and the trial balance.
    errors: [...errors].sort((a, b) => orderOf(a) - orderOf(b)),
    closingStock: R(Math.max(1, Math.round(left / 100 / 500)) * 500),
  };
  // A wrong balancing: the balance as it stands, with two digits swapped or a nought dropped.
  for (const e of data.errors) {
    if (e.kind !== 'wrong-balance') continue;
    const right = balanceFor(data, e.accountId);
    if (right <= 0) return null;
    e.as = slip(rng, right);
    if (e.as === right) return null;
  }
  // An account balanced wrongly has no other error in it, so that "instead of" names its true balance.
  const built = buildCase(data);
  for (const e of built.errors) if (e.kind === 'wrong-balance' && built.errors.some((x) => x !== e && x.accounts.includes(e.accounts[0]))) return null;
  return data;
}

const ORDER: Record<string, number> = { 'book-casting': 100, casting: 101, compensating: 102, 'wrong-balance': 103, 'tb-omitted': 104, 'tb-wrong-column': 104 };
const orderOf = (e: CaseErrorData): number => ('txn' in e ? e.txn : ORDER[e.kind]);

/** The balance an account would be carried down at (debit positive), with the case's other errors in it. */
function balanceFor(data: CaseData, accountId: string): number {
  const without: CaseData = { ...data, errors: data.errors.filter((e) => e.kind !== 'wrong-balance' && e.kind !== 'tb-omitted' && e.kind !== 'tb-wrong-column') };
  return buildCase(without).recordedNet.get(accountId) ?? 0;
}

/** A new month for a seed: the same seed always gives the same month. */
export function caseFromSeed(seed: number): CaseData {
  for (let i = 0; i < 400; i++) {
    const rng = createRng(seed * 7919 + i * 104729 + 17);
    const data = draw(rng);
    if (data && problemOf(data) === null && cashHolds(data)) return { ...data, id: `seed-${seed}` };
  }
  return { ...ASHA, id: `seed-${seed}` };
}

/** Cash and bank never run below nil on any day of the month, in the true books. */
function cashHolds(data: CaseData): boolean {
  const bal = new Map<string, number>();
  for (const o of data.opening) bal.set(o.accountId, (bal.get(o.accountId) ?? 0) + (o.side === 'Dr' ? o.amount : -o.amount));
  for (const t of data.txns) {
    for (const l of t.lines) bal.set(l.accountId, (bal.get(l.accountId) ?? 0) + (l.side === 'Dr' ? l.amount : -l.amount));
    if ((bal.get('cash') ?? 0) < 0 || (bal.get('bank') ?? 0) < 0) return false;
  }
  return true;
}
