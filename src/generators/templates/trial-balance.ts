import type { StatementQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { accountOf, ledgerLabel, post, trialBalance, type DatedEntry } from '@/engine/books';
import { columnTotals } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { parseRupees } from '@/lib/money-input';
import { PARTIES, amount, formatINR, interleave, journalTemplate, keepFor, mcqTemplate, numericTemplate, rupees, setDays, statementTemplate, type Paise } from '../authoring';
import type { Distractor, JournalParts, McqParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'trial-balance';

// ---------------------------------------------------------------------------------------------------------------
// The accounts a trial balance lists, with the side of their normal balance and the usual slip about each.
// ---------------------------------------------------------------------------------------------------------------

type Side = 'Dr' | 'Cr';

interface Acct {
  name: string;
  side: Side;
  /** What the account is, for the explanation ("an asset"). */
  kind: string;
  /** Rupee range of a typical balance. */
  min: number;
  max: number;
  step: number;
  /** The mistake that puts the balance in the opposite column. */
  wrong: string;
  /** Items students put in the wrong column: returns, discounts, drawings, provisions, overdraft. */
  trap?: boolean;
}

const dr = (name: string, kind: string, min: number, max: number, step: number, wrong: string, trap = false): Acct => ({
  name, side: 'Dr', kind, min, max, step, wrong, trap,
});
const cr = (name: string, kind: string, min: number, max: number, step: number, wrong: string, trap = false): Acct => ({
  name, side: 'Cr', kind, min, max, step, wrong, trap,
});

const EXPENSE_WRONG = 'Took the expense as an income because money was paid out for it.';
const ASSET_WRONG = 'Treated the asset like capital or a liability, which are credit items.';
const INCOME_WRONG = 'Took the income as an expense because the word is familiar from the expense accounts.';

const DR: Acct[] = [
  dr('Cash in hand', 'an asset', 3000, 40000, 500, 'Confused the cash balance with a payment, which is the credit side of the cash account.'),
  dr('Cash at bank', 'an asset', 10000, 150000, 1000, 'Confused the bank balance with a withdrawal, which is the credit side of the bank account.'),
  dr('Sundry debtors', 'an asset', 20000, 150000, 1000, 'Took debtors as a liability, forgetting that they owe money to the business.'),
  dr('Furniture', 'an asset', 15000, 90000, 1000, ASSET_WRONG),
  dr('Machinery', 'an asset', 50000, 300000, 1000, ASSET_WRONG),
  dr('Land and building', 'an asset', 200000, 800000, 10000, ASSET_WRONG),
  dr('Motor vehicle', 'an asset', 100000, 500000, 10000, ASSET_WRONG),
  dr('Computers', 'an asset', 30000, 150000, 1000, ASSET_WRONG),
  dr('Bills receivable', 'an asset (money due to the business on bills)', 5000, 60000, 500, 'Took bills receivable as a liability because a bill is a promise to pay, but these bills are payable to the business.'),
  dr('Opening stock', 'an asset brought forward from the last year', 20000, 150000, 1000, 'Treated stock as a gain or a liability; opening stock is a debit balance.'),
  dr('Purchases', 'an expense (goods bought for resale)', 100000, 500000, 1000, 'Mixed purchases up with creditors, which are credit balances.'),
  dr('Sales returns', 'a reduction of sales (goods returned by customers)', 3000, 30000, 500, 'Treated sales returns like sales; returns cancel part of the sales and have a debit balance.', true),
  dr('Carriage inwards', 'an expense on goods bought', 1000, 12000, 500, EXPENSE_WRONG),
  dr('Wages', 'an expense', 10000, 60000, 500, EXPENSE_WRONG),
  dr('Rent paid', 'an expense', 6000, 48000, 500, EXPENSE_WRONG),
  dr('Salaries', 'an expense', 20000, 120000, 500, EXPENSE_WRONG),
  dr('Insurance premium', 'an expense', 2000, 20000, 500, EXPENSE_WRONG),
  dr('Stationery', 'an expense', 1000, 10000, 500, EXPENSE_WRONG),
  dr('Telephone expenses', 'an expense', 1000, 12000, 500, EXPENSE_WRONG),
  dr('Advertising', 'an expense', 2000, 30000, 500, EXPENSE_WRONG),
  dr('Interest paid', 'an expense', 2000, 20000, 500, EXPENSE_WRONG),
  dr('Discount allowed', 'a loss to the business (an expense)', 1000, 12000, 500, 'Mixed discount allowed up with discount received, which is an income.', true),
  dr('Bad debts', 'a loss to the business', 1000, 15000, 500, 'Took bad debts as a credit because the debtor\'s account is credited; the loss itself is a debit balance.', true),
  dr('Drawings', 'a reduction of capital (withdrawals by the owner)', 5000, 60000, 500, 'Treated drawings as capital; drawings reduce capital and have a debit balance.', true),
  // Added with version 2 of the templates that draw from this list (the accounts cards 4 and 5 teach).
  dr('Carriage outwards', 'an expense on goods sold', 1000, 15000, 500, EXPENSE_WRONG),
  dr('Commission paid', 'an expense', 2000, 25000, 500, 'Mixed commission paid up with commission received, which is an income.'),
  dr('Repairs', 'an expense', 1000, 20000, 500, EXPENSE_WRONG),
  dr('Electricity charges', 'an expense', 2000, 24000, 500, EXPENSE_WRONG),
  dr('Investments', 'an asset', 20000, 200000, 1000, ASSET_WRONG),
  dr('Goodwill', 'an asset (an intangible one)', 50000, 200000, 5000, 'Treated goodwill as capital because it seems to belong to the owner; goodwill bought is an asset, a debit balance.'),
  dr('Prepaid insurance', 'an asset (insurance paid for a period still to come)', 1000, 12000, 500, 'Took prepaid insurance as a liability; the business has paid in advance, so the unexpired part is an asset and a debit balance.', true),
  dr('Loan to an employee', 'an asset (money the employee owes the business)', 5000, 50000, 1000, 'Took the loan as a liability because of the word "loan"; the business lent the money, so it is owed to the business, a debit balance.', true),
];

const CR: Acct[] = [
  cr('Capital', 'the amount the business owes its owner', 100000, 800000, 10000, 'Treated capital as an asset; it is owed to the owner and has a credit balance.'),
  cr('Sales', 'an income from the main trade', 150000, 700000, 1000, 'Took sales as a debit because the goods leave the business.'),
  cr('Purchases returns', 'a reduction of purchases (goods returned to suppliers)', 3000, 30000, 500, 'Treated purchases returns like purchases; returns cancel part of the purchases and have a credit balance.', true),
  cr('Sundry creditors', 'a liability', 20000, 150000, 1000, 'Took creditors as an asset; the business owes this money, so it is a credit balance.'),
  cr('Bank loan', 'a liability', 50000, 300000, 5000, 'Treated the loan as an asset because the money came into the bank.'),
  cr('Bills payable', 'a liability', 5000, 60000, 500, 'Took bills payable as an asset because a bill is a document held.'),
  cr('Discount received', 'a gain to the business (an income)', 1000, 12000, 500, 'Mixed discount received up with discount allowed, which is an expense.', true),
  cr('Commission received', 'an income', 2000, 30000, 500, INCOME_WRONG),
  cr('Rent received', 'an income', 6000, 36000, 500, INCOME_WRONG),
  cr('Interest received', 'an income', 2000, 20000, 500, INCOME_WRONG),
  cr('Provision for doubtful debts', 'a provision set against debtors', 2000, 15000, 500, 'Treated the provision as an expense; the balance in the ledger is a credit.', true),
  cr('Bank overdraft', 'a liability to the bank', 10000, 80000, 1000, 'Treated the overdraft as an asset like a bank balance; it is owed to the bank, so it is a credit balance.', true),
  cr('Outstanding salaries', 'a liability (salaries due but not yet paid)', 2000, 20000, 500, 'Took outstanding salaries as an expense like Salaries A/c; the amount still owed to the staff is a liability, a credit balance.', true),
  cr('Provision for depreciation', 'a provision set against the fixed assets (depreciation charged so far)', 10000, 80000, 1000, 'Treated the provision for depreciation as an expense or an asset; the accumulated provision is a credit balance kept beside the asset.', true),
];

const ALL: Acct[] = [...DR, ...CR];
const BY_NAME = new Map(ALL.map((a) => [a.name, a]));
const get = (name: string): Acct => {
  const a = BY_NAME.get(name);
  if (!a) throw new Error(`trial-balance: unknown account ${name}`);
  return a;
};
const CAPITAL = get('Capital');
const CREDITORS = get('Sundry creditors');
const BANK_LOAN = get('Bank loan');
const BANK = get('Cash at bank');
const DEBTORS = get('Sundry debtors');
const FURNITURE = get('Furniture');
const MACHINERY = get('Machinery');
const OVERDRAFT = get('Bank overdraft');
const BAD_DEBTS_ACCT = get('Bad debts');
const DR_TRAPS = DR.filter((a) => a.trap);
const CR_TRAPS = CR.filter((a) => a.trap);
const CR_NO_CAPITAL = CR.filter((a) => a !== CAPITAL);
/** A balance that makes sense only beside another: returns beside the account they reduce, the provision beside debtors. */
const NEEDS: [Acct, Acct][] = [
  [get('Sales returns'), get('Sales')],
  [get('Purchases returns'), get('Purchases')],
  [get('Provision for doubtful debts'), DEBTORS],
  [get('Provision for depreciation'), MACHINERY],
  [get('Outstanding salaries'), get('Salaries')],
  [get('Prepaid insurance'), get('Insurance premium')],
];
const parentOf = (a: Acct): Acct | undefined => NEEDS.find(([child]) => child === a)?.[1];
/** Accounts that are posted on both sides in the ordinary course, so "debit side total" and "credit side total" both make sense. */
const TWO_SIDED = new Set<Acct>(
  ['Cash in hand', 'Cash at bank', 'Sundry debtors', 'Bills receivable', 'Furniture', 'Machinery', 'Capital', 'Sundry creditors', 'Bank loan', 'Bills payable', 'Bank overdraft'].map(get),
);
/** One business does not show a favourable bank balance and an overdraft in the same short list. */
const bankClash = (as: readonly Acct[]) => as.includes(BANK) && as.includes(OVERDRAFT);

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

interface Ln {
  a: Acct;
  amt: Paise;
}

const money = formatINR;
const SIDE_WORD = { Dr: 'debit', Cr: 'credit' } as const;
const other = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');
const sum = (xs: readonly Paise[]) => xs.reduce((t, x) => t + x, 0);
const sideSum = (ls: readonly Ln[], s: Side) => sum(ls.filter((l) => l.a.side === s).map((l) => l.amt));
const plus = (xs: readonly Paise[]) => xs.map(money).join(' + ');
const pickMany = (rng: Rng, pool: readonly Acct[], n: number, exclude: readonly Acct[] = []): Acct[] =>
  rng.shuffle(pool.filter((a) => !exclude.includes(a))).slice(0, n);
const lineOf = (rng: Rng, a: Acct): Ln => ({ a, amt: amount(rng, a.min, a.max, a.step) });
const listOf = (ls: readonly Ln[]) => ls.map((l) => `${l.a.name}: ${money(l.amt)}`).join('\n');
/** "Debit column: Cash 5,000 + Rent 2,000 = 7,000." */
const colLine = (ls: readonly Ln[], s: Side) => {
  const mine = ls.filter((l) => l.a.side === s);
  return `${SIDE_WORD[s] === 'debit' ? 'Debit' : 'Credit'} column: ${mine.map((l) => `${l.a.name} ${money(l.amt)}`).join(' + ')} = ${money(sum(mine.map((l) => l.amt)))}.`;
};

const BUSINESSES = [
  'Ravi Textiles', 'Sunita Stationers', 'Imran Traders', 'Geeta Boutique', 'Harish Hardware',
  'Neha Sweets', 'Joseph Electricals', 'Lakshmi Provisions', 'Anil Auto Parts', 'Farida Fabrics',
];
const biz = (rng: Rng) => rng.pick(BUSINESSES);
/** The possessive of a name: "Ravi Textiles'" but "Mohan's". */
const poss = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const OPENERS: ((b: string) => string)[] = [
  (b) => `${b} took these balances from its ledger at the end of the year:`,
  (b) => `The ledger of ${b} shows the following balances on 31 March:`,
  (b) => `At the year end the accountant of ${b} lists these ledger balances:`,
  (b) => `These are the closing balances in the books of ${b}:`,
];
const opener = (rng: Rng) => rng.pick(OPENERS)(biz(rng));

/**
 * The listed lines plus the one balance that makes the debit and credit totals equal: a credit item (usually Capital)
 * when the debits are larger, a debit item (bank, debtors, furniture, machinery) when the credits are larger.
 * Null when the lines are already (nearly) equal.
 */
function balanceUp(rng: Rng, ls: Ln[], avoid: readonly Acct[] = []): { all: Ln[]; bal: Ln } | null {
  const diff = sideSum(ls, 'Dr') - sideSum(ls, 'Cr');
  if (Math.abs(diff) < rupees(10000)) return null;
  const used = new Set<Acct>([...ls.map((l) => l.a), ...avoid]);
  const choices = (diff > 0 ? [CAPITAL, CAPITAL, CAPITAL, CREDITORS, BANK_LOAN] : [BANK, DEBTORS, FURNITURE, MACHINERY]).filter(
    (a) => !used.has(a) && !(a === BANK && used.has(OVERDRAFT)),
  );
  if (choices.length === 0) return null;
  const bal: Ln = { a: rng.pick(choices), amt: Math.abs(diff) };
  return { all: [...ls, bal], bal };
}

/**
 * nDr debit accounts and nCr credit accounts (never Capital) for a list of balances. A forced account brings the account
 * it belongs with; any other returns or provision whose partner was not drawn is swapped for a plain account, and so is
 * a bank balance drawn beside an overdraft.
 */
function pickAccounts(
  rng: Rng,
  nDr: number,
  nCr: number,
  forced: readonly Acct[] = [],
  avoid: readonly Acct[] = [],
  present: readonly Acct[] = [],
): { dr: Acct[]; cr: Acct[] } {
  const must = [...new Set([...forced, ...forced.map(parentOf).filter((p): p is Acct => p !== undefined)])];
  const draw = (pool: readonly Acct[], side: Side, n: number) => {
    const mine = must.filter((a) => a.side === side);
    return [...mine, ...pickMany(rng, pool.filter((a) => !avoid.includes(a)), Math.max(0, n - mine.length), mine)];
  };
  const dr = draw(DR, 'Dr', nDr);
  const cr = draw(CR_NO_CAPITAL, 'Cr', nCr);
  const tidy = (list: Acct[], pool: readonly Acct[]) => {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const all = [...dr, ...cr, ...present];
      const parent = parentOf(a);
      const orphan = parent !== undefined && !all.includes(parent);
      const clash = (a === BANK || a === OVERDRAFT) && bankClash(all);
      if (must.includes(a) || !(orphan || clash)) continue;
      const spare = pool.filter((b) => !avoid.includes(b) && !all.includes(b) && parentOf(b) === undefined && b !== BANK && b !== OVERDRAFT);
      if (spare.length > 0) list[i] = rng.pick(spare);
    }
  };
  tidy(dr, DR);
  tidy(cr, CR_NO_CAPITAL);
  return { dr, cr };
}

/** A trial balance that agrees: nDr debit items, nCr credit items (never Capital) and a balancing item. */
function balancedTb(rng: Rng, nDr: number, nCr: number, forced: readonly Acct[] = [], avoid: readonly Acct[] = []) {
  const picked = pickAccounts(rng, nDr, nCr, forced, avoid);
  const dr = picked.dr.map((a) => lineOf(rng, a));
  const cr = picked.cr.map((a) => lineOf(rng, a));
  const done = balanceUp(rng, [...dr, ...cr], avoid);
  return done ? { dr, cr, ...done } : null;
}

const RUPEE_TEXT = /₹\d(?:[\d,]*\d)?/g;
/** Every rupee amount written in a text, in order, in paise. */
const amountsIn = (text: string): Paise[] => (text.match(RUPEE_TEXT) ?? []).map((m) => parseRupees(m) ?? -1);

/** The "Name: ₹amount" lines of a prompt that name a known account. */
function readList(prompt: string): Ln[] {
  const out: Ln[] = [];
  for (const m of prompt.matchAll(/^(.+): (₹[\d,]+)$/gm)) {
    const a = BY_NAME.get(m[1]);
    const amt = parseRupees(m[2]);
    if (a && amt != null) out.push({ a, amt });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Hints of their own (version 2 of every template that had the default pair; tb-method and tb-totals-method version 3).
// A first nudge, then the step to take. Templates that ask the same thing share a pair.
// ---------------------------------------------------------------------------------------------------------------

const H_PURPOSE = [
  'Think about what the trial balance actually compares: the debit balances of the ledger with the credit balances.',
  'Equal totals prove only that debits equal credits. Errors of omission, of commission, of principle and compensating errors leave the totals equal, so they can still be in the books.',
];
const H_BALANCE_METHOD = [
  'Under the balance method each account appears once, at its balance, not at the totals of its two sides.',
  'Balance = larger side total - smaller side total, entered in the column of the larger side. An account whose sides are equal has no balance and is left out.',
];
const H_COLUMN = [
  'Ask what the account is: an asset, an expense, a loss or drawings goes in the debit column; capital, a liability, an income or a provision in the credit column.',
  'Watch the look-alikes: sales returns, discount allowed, bad debts, drawings, prepaid items and a loan given are debits; purchases returns, discount received, provisions, outstanding items and a bank overdraft are credits.',
];
const H_STOCK = [
  'Ask which stock figure is already a balance in the ledger when the trial balance is drawn up.',
  'Opening stock is a ledger balance (debit). Closing stock given only as a note has no entry yet, so it stays out of the trial balance.',
];
const H_TOTAL = [
  'Put every balance in its column first; only then add.',
  'A trial balance that agrees has the same total in both columns: add the column asked for, with each look-alike (returns, discounts, drawings, provisions, overdraft) in its own column and nothing set off against anything.',
];
const H_MISSING = [
  'Total the debit balances and the credit balances you are given, separately.',
  'The missing balance is the gap between the two totals, and it goes in the column that is short: Capital, a credit, fills a short credit column.',
];
const H_SUSPENSE = [
  'Which column is short? The Suspense A/c goes in that column.',
  'Suspense = larger column total - smaller column total. A short debit column gets a debit balance in Suspense A/c, a short credit column a credit balance.',
];
const H_GAP = [
  'Compare the difference with the balances you have: is it equal to one of them, or twice one of them?',
  'A balance left out makes a gap equal to it; a balance written in the wrong column makes a gap of twice it, so look for half the difference.',
];
const H_MOVE = [
  'Correct each slip on its own: take the balance out of the column it was wrongly put in and add it to the column where it belongs.',
  'A moved balance lowers one column and raises the other by its amount; after every slip is put right both columns show the same total.',
];
const H_ERROR_EFFECT = [
  'Ask of the error: did both halves of the entry reach the ledger, on the right sides and with the same amount?',
  'A balance or one half of an entry left out puts one column out by the amount; a balance on the wrong side puts it out by twice the amount; a whole entry left out, a wrong account, a principle error or two errors that cancel leave the columns equal.',
];
const H_NET = [
  'Take the errors one at a time: which column does each make too large, and by how much? Some change nothing.',
  'Net them: add the effects that push the same column up and set off those that push the other way. What is left is the difference (or the balance left in Suspense A/c).',
];

const TB_HINTS: Record<string, string[]> = {
  'tb-method': H_BALANCE_METHOD,
  'tb-objective': H_PURPOSE,
  'tb-agree-conclusion': H_PURPOSE,
  'tb-col-account': H_COLUMN,
  'tb-col-count': H_COLUMN,
  'tb-col-group': H_COLUMN,
  'tb-account-balance': H_BALANCE_METHOD,
  'tb-method-balance': H_BALANCE_METHOD,
  'tb-totals-method': [
    'Balance each account first: the trial balance lists one figure for each account, not its side totals.',
    'For each account take larger side - smaller side and put it in the column of the larger side; then add the column asked for.',
  ],
  'tb-closing-stock': H_STOCK,
  'tb-total-column': H_TOTAL,
  'tb-total-medium': H_TOTAL,
  'tb-missing-easy': H_MISSING,
  'tb-missing-trap': [
    'Place the look-alikes with care before adding: returns, discounts, bad debts and provisions each have a column of their own.',
    H_MISSING[1],
  ],
  'tb-missing-distractor': [
    'Strike out first what is not yet a ledger balance: closing stock and anything given as further information with no entry passed.',
    H_MISSING[1],
  ],
  'tb-derived-balance': [
    'First find the Sundry debtors balance from the two sides of its account: what the customers owe now.',
    'Debtors = opening balance + credit sales + cheque dishonoured - cash received. Put it in the debit column; the missing balance is then the gap between the columns.',
  ],
  'tb-suspense-amount': [
    'The Suspense balance was added to the shorter column to lift it to the longer one.',
    'Total before = total after - the Suspense balance, for the column the Suspense A/c stands in; the other column did not change.',
  ],
  'tb-suspense-side': H_SUSPENSE,
  'tb-suspense-from-list': ['Sort the balances into the two columns and total each.', H_SUSPENSE[1]],
  'tb-total-with-suspense': [
    'Sort the balances into the two columns and total each.',
    'The Suspense A/c lifts the shorter column to the longer one, so each column of the completed trial balance totals the larger of the two.',
  ],
  'tb-error-agree': H_ERROR_EFFECT,
  'tb-error-revealed': H_ERROR_EFFECT,
  'tb-error-not-revealed': H_ERROR_EFFECT,
  'tb-error-diff': H_ERROR_EFFECT,
  'tb-suspense-side-error': [
    'Work out which column the error left short, and by how much.',
    'The Suspense A/c goes in the short column for the amount of the gap: the amount once for a figure left out, twice for a figure on the wrong side.',
  ],
  'tb-locate-clue': H_GAP,
  'tb-misplaced-amount': H_GAP,
  'tb-misplaced-which': H_GAP,
  'tb-misplaced-total': H_MOVE,
  'tb-corrected-two': H_MOVE,
  'tb-net-effect': H_NET,
  'tb-net-effect-side': [H_NET[0], 'Net the effects: the column pushed up more is the larger one, and the gap is the net amount.'],
  'tb-recheck-errors': [
    'Correct the columns one slip at a time, keeping a running debit total and credit total.',
    'A balance in the wrong column comes out of one column and goes into the other; a balance left out is added to its column; an undercast is added to the column that was added short. Then compare the totals.',
  ],
  'tb-suspense-remaining': H_NET,
  'tb-suspense-journal': [
    'Which column was short when the trial balance was drawn up? The Suspense A/c was opened on that side.',
    'Post the missing or wrong half to the account it belongs to, and take the opposite side to Suspense A/c to clear it.',
  ],
};
const withHints = <P extends object>(id: string, p: P): P => (TB_HINTS[id] ? { ...p, hints: TB_HINTS[id] } : p);

// Wrappers: a seed whose wrong answers collapse into each other is rejected rather than served with too few.
type NumDef = Parameters<typeof numericTemplate>[0];
const numT = (def: Omit<NumDef, 'topicId' | 'unit'> & { unit?: NumDef['unit'] }) =>
  numericTemplate({
    unit: 'rupees',
    ...def,
    topicId: T,
    generate: (rng) => {
      const p = def.generate(rng);
      if (!p) return null;
      const bad = new Set(p.commonErrors.map((e) => e.value).filter((v) => Number.isSafeInteger(v) && v > 0 && v !== p.answer));
      return bad.size >= 2 ? withHints(def.id, p) : null;
    },
  });

type McqDef = Parameters<typeof mcqTemplate>[0];
const mcqT = (def: Omit<McqDef, 'topicId'>) =>
  mcqTemplate({
    ...def,
    topicId: T,
    generate: (rng) => {
      const p = def.generate(rng);
      if (!p) return null;
      const texts = new Set(p.distractors.map((d) => d.text).filter((t) => t !== p.correct));
      return texts.size >= 3 ? withHints(def.id, p) : null;
    },
  });

type JourDef = Parameters<typeof journalTemplate>[0];
const jourT = (def: Omit<JourDef, 'topicId'>) =>
  journalTemplate({
    ...def,
    topicId: T,
    generate: (rng) => {
      const p = def.generate(rng);
      return p ? withHints(def.id, p) : null;
    },
  });

const correctText = (q: { options: { id: string; text: string }[]; correct: string }) => q.options.find((o) => o.id === q.correct)?.text ?? '';

/** A scenario bank question: one prompt, one right answer, named wrong answers. */
interface Scenario {
  prompt: (x: string, who: string, other: string, y: string) => string;
  correct: string | ((x: string) => string);
  wrong: (Distractor | ((x: string) => Distractor))[];
  explanation: string;
}
const fromBank = (rng: Rng, bank: Scenario[]): McqParts => {
  const s = rng.pick(bank);
  const base = amount(rng, 5000, 90000, 5000);
  const x = money(base);
  const y = money(base + amount(rng, 1000, 9000, 500));
  const [who, who2] = rng.shuffle(PARTIES);
  const f = <V>(v: V | ((x: string) => V)): V => (typeof v === 'function' ? (v as (x: string) => V)(x) : v);
  return {
    prompt: s.prompt(x, who, who2, y),
    correct: f(s.correct),
    distractors: s.wrong.map((w) => f(w)),
    explanation: s.explanation,
  };
};

// ---------------------------------------------------------------------------------------------------------------
// Purpose: methods, objectives and what agreement means
// ---------------------------------------------------------------------------------------------------------------

// The course prepares a trial balance by the balance method only (CBSE 2025-26: "trial balance with balance method
// only"). Version 1 of `tb-method` asked the learner to tell the balance method from the totals method; version 2 asks
// which statement about the balance method is true, and the wrong statements are the slips a learner makes with it.
const BALANCE_TRUE = [
  'Every ledger account is balanced first, and only its closing balance is entered in the trial balance.',
  'An account whose two sides are equal, so that it has no balance, does not appear in the trial balance at all.',
  'Each account appears in one column only, the column of the side that is larger.',
  'Its figures can go straight into the final accounts, because they are the balances of the accounts.',
  'A Cash A/c with ₹90,000 on its debit side and ₹60,000 on its credit side is entered only once, as ₹30,000 in the debit column.',
  'A creditor whose account has been settled in full during the year is not listed at all.',
  'A customer whose account shows a debit balance is entered in the debit column with that balance.',
];
const BALANCE_FALSE: Distractor[] = [
  { text: 'Each account is entered with two figures: the total of its debit side and the total of its credit side.', why: 'Listed both side totals; the balance method lists only the balance of each account.' },
  { text: 'A Cash A/c with ₹90,000 on its debit side and ₹60,000 on its credit side is entered as ₹90,000 in the debit column and ₹60,000 in the credit column.', why: 'Entered the two side totals; the balance is ₹90,000 - ₹60,000 = ₹30,000, and it goes in the debit column.' },
  { text: 'An account whose two sides are equal is shown with its side total in both columns.', why: 'An account with equal sides has no balance, so it is left out.' },
  { text: 'Each account is entered in the column of the side that is smaller.', why: 'The balance stands on the side that is larger, so it goes in that column.' },
  { text: 'The ledger accounts need not be balanced before the trial balance is drawn up.', why: 'Every account is balanced first; its balance is the figure the trial balance lists.' },
  { text: 'The two columns agree only when every account has a debit balance.', why: 'The columns agree when all the debit balances together equal all the credit balances together.' },
];
const METHOD_PROMPTS = [
  'A trial balance is prepared by the balance method. Which statement about it is correct?',
  'Which one of these statements about a trial balance drawn up by the balance method is true?',
  'Meena prepares a trial balance by the balance method. Which statement describes what Meena does?',
];

// Version 4: Meena's prompt is worded without "her" or "she" (the house rule: no gendered pronouns).
const tbMethod = mcqT({
  id: 'tb-method',
  version: 4,
  conceptId: 'tb-purpose',
  difficulty: 'easy',
  generate: (rng) => ({
    prompt: rng.pick(METHOD_PROMPTS),
    correct: rng.pick(BALANCE_TRUE),
    distractors: rng.shuffle(BALANCE_FALSE).slice(0, 3),
    explanation:
      'In the balance method each ledger account is balanced first. Only its balance is listed: a debit balance in the debit column, a credit balance in the credit column. An account with no balance is left out.',
  }),
  verify: (q) => /balance method/.test(q.prompt) && BALANCE_TRUE.includes(correctText(q)),
});

const OBJECTIVES = [
  'To check that the debit and credit postings in the ledger are arithmetically consistent',
  'To bring all the ledger balances together in one statement, ready for preparing the final accounts',
  'To give an early signal that an error has crept into the books, when the two totals differ',
  'To summarise the balance of every ledger account on a given date on one page',
];
const MISCONCEPTIONS: Distractor[] = [
  { text: 'To prove that the books contain no errors at all', why: 'Treated agreement as proof of complete accuracy; several errors do not affect the totals.' },
  { text: 'To show the profit or loss earned during the year', why: 'Mixed the trial balance up with the profit and loss account.' },
  { text: 'To show the financial position of the business on a date', why: 'Mixed the trial balance up with the balance sheet.' },
  { text: 'To record every transaction in the order in which it takes place', why: 'Described the journal, which is where transactions are first recorded.' },
  { text: 'To work out the tax the business has to pay', why: 'Took a list of balances for a tax computation, which is not its purpose.' },
  { text: 'To take the place of the ledger accounts', why: 'Thought the trial balance can replace the ledger; it only lists the ledger balances.' },
];
const OBJECTIVE_PROMPTS = [
  'Which one of these is an objective of preparing a trial balance?',
  'A student is asked why a trial balance is prepared. Which answer is correct?',
  'Which of the following is a genuine purpose of a trial balance?',
];

const tbObjective = mcqT({
  id: 'tb-objective',
  version: 2,
  conceptId: 'tb-purpose',
  difficulty: 'easy',
  generate: (rng) => ({
    prompt: rng.pick(OBJECTIVE_PROMPTS),
    correct: rng.pick(OBJECTIVES),
    distractors: rng.shuffle(MISCONCEPTIONS).slice(0, 4),
    explanation:
      'A trial balance checks the arithmetic of double entry and gathers the ledger balances for the final accounts. It is not the profit and loss account, the balance sheet or proof that the books are error-free.',
  }),
  verify: (q) => OBJECTIVES.includes(correctText(q)) && q.options.every((o) => o.id === q.correct || !OBJECTIVES.includes(o.text)),
});

const CONCLUSIONS: Scenario[] = [
  {
    prompt: (x) => `Both columns of a trader's trial balance total ${x}. What can the accountant safely conclude?`,
    correct: 'The debit and credit postings are arithmetically consistent, though some errors may still be hidden',
    wrong: [
      { text: 'The books are completely free from errors', why: 'Treated agreement as proof that no error exists.' },
      { text: 'Every transaction of the year has been recorded', why: 'Forgot that a transaction left out of the books altogether does not disturb the totals.' },
      { text: 'The profit shown by the final accounts will be correct', why: 'Assumed the profit depends only on the columns agreeing; a misclassified item changes profit without changing the totals.' },
    ],
    explanation: 'Agreement shows only that total debits equal total credits. Errors of omission, wrong accounts, principle and compensating errors can all remain.',
  },
  {
    prompt: (x, _w, _o, y) => `The two columns of a trial balance total ${x} and ${y}. What does this tell the accountant?`,
    correct: 'At least one error has upset the equality of debits and credits, and it has to be traced',
    wrong: [
      { text: 'The business has made a loss', why: 'Confused a difference in the trial balance with a loss; the two have nothing to do with each other.' },
      { text: 'The difference is a normal rounding gap and can be ignored', why: 'Treated the difference as harmless; if the books were accurate the totals would be equal.' },
      { text: 'The whole set of books must be written afresh', why: 'Over-reacted: the error is traced step by step, not by rewriting every account.' },
    ],
    explanation: 'Every transaction has equal debits and credits, so a difference means some posting, total or balance is wrong.',
  },
  {
    prompt: (x, who) => `A trial balance agrees, yet it later turns out that a credit sale of ${x} to ${who} was never recorded. Why did the trial balance not show this?`,
    correct: 'Neither the debit nor the credit was posted, so the totals stayed equal',
    wrong: [
      { text: 'The trial balance does not include sales or debtors', why: 'Thought only some accounts are listed; sales and debtors are both ledger balances in it.' },
      { text: 'Only the debit side of the sale was missing', why: 'Assumed a one-sided error; a one-sided error would have upset the totals.' },
      { text: 'A sale on credit never affects the trial balance', why: 'Overlooked that a recorded credit sale does change both columns equally, so the omission changes both columns equally too.' },
    ],
    explanation: 'An entry left out completely removes equal debits and credits, so the two columns still agree.',
  },
  {
    prompt: (x, who) => `${who} says: "My trial balance agrees, so I need not check the postings." Which reply is correct?`,
    correct: 'Agreement shows only that debits equal credits; errors such as wrong-account postings can remain',
    wrong: [
      { text: 'Correct: an agreeing trial balance means every posting is right', why: 'Treated agreement as proof of accuracy.' },
      { text: 'Correct: the trial balance checks the journal entries as well as the ledger', why: 'Thought the trial balance tests the original entries; it only tests the balances posted from them.' },
      { text: 'Wrong: an agreeing trial balance means a Suspense A/c is needed', why: 'Mixed up agreement with disagreement; a suspense account is opened only when the columns differ.' },
    ],
    explanation: 'The trial balance tests arithmetic only. It cannot detect a wrong account of the same type, an omitted entry or an error of principle.',
  },
  {
    prompt: (x) => `The debit column of a trial balance is ${x} more than the credit column. What should the accountant do first?`,
    correct: 'Re-add both columns and re-check the balances copied from the ledger',
    wrong: [
      { text: 'Adjust the profit by that amount', why: 'Pushed the difference into profit; the books must be checked, not adjusted.' },
      { text: 'Debit the difference to the Capital A/c', why: 'Used capital as a dumping place; the difference is an error, not a change in the owner\'s claim.' },
      { text: 'Open a Suspense A/c and stop looking for the error', why: 'Treated suspense as the end of the matter; it is only a temporary holding account until the error is found.' },
    ],
    explanation: 'The cheapest checks come first: the additions of the trial balance and the balances taken from the ledger. A Suspense A/c is opened only if the error cannot be found in time.',
  },
  {
    prompt: (x) => `A trial balance agrees, yet a payment of ${x} for wages was debited to Salaries A/c by mistake. Which statement is correct?`,
    correct: 'The mistake is hidden: the amount was still debited once and credited once',
    wrong: [
      { text: 'The mistake makes the debit column larger by that amount', why: 'Thought debiting the wrong account adds to the debit total; it only moves the debit from one account to another.' },
      { text: 'The mistake makes the credit column larger by that amount', why: 'Mixed up the side of the error; no column changes at all.' },
      { text: 'The trial balance would not agree if the mistake existed', why: 'Believed every error shows up in the totals.' },
    ],
    explanation: 'The debit went to the wrong account of the same side, so total debits are unchanged and the trial balance still agrees.',
  },
];

const tbAgreeConclusion = mcqT({
  id: 'tb-agree-conclusion',
  version: 2,
  conceptId: 'tb-purpose',
  difficulty: 'easy',
  generate: (rng) => fromBank(rng, CONCLUSIONS),
});

// ---------------------------------------------------------------------------------------------------------------
// Which column? (tb-columns)
// ---------------------------------------------------------------------------------------------------------------

const COL_PROMPTS: ((b: string, line: string) => string)[] = [
  (b, line) => `A ledger account of ${b} has this closing balance:\n${line}\nIn which column of the trial balance (balance method) is it shown?`,
  (b, line) => `While preparing the trial balance of ${b}, the accountant meets this balance:\n${line}\nWhich column does it belong to?`,
  (b, line) => `${b} is listing its ledger balances in a trial balance. For this one:\n${line}\nWhich column is correct?`,
];

const tbColAccount = mcqT({
  id: 'tb-col-account',
  version: 2,
  conceptId: 'tb-columns',
  difficulty: 'easy',
  generate: (rng) => {
    const a = rng.pick(ALL);
    const l = lineOf(rng, a);
    const right = a.side;
    const side = (s: Side) => `The ${SIDE_WORD[s]} column`;
    return {
      prompt: rng.pick(COL_PROMPTS)(biz(rng), `${a.name}: ${money(l.amt)}`),
      correct: side(right),
      distractors: [
        { text: side(other(right)), why: a.wrong },
        { text: 'Both columns, half in each', why: 'Thought the balance can be split; every account has one balance and it goes in one column.' },
        {
          text: 'Neither: it is left for the final accounts',
          why: 'Thought only some accounts are listed. The trial balance lists every ledger balance, whether asset, liability, capital, expense or income.',
        },
      ],
      explanation: `${a.name} is ${a.kind}, so it has a ${SIDE_WORD[right]} balance and goes in the ${SIDE_WORD[right]} column.`,
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    return items.length === 1 && correctText(q) === `The ${SIDE_WORD[items[0].a.side]} column`;
  },
});

const tbColCount = numT({
  id: 'tb-col-count',
  version: 2,
  unit: 'number',
  conceptId: 'tb-columns',
  difficulty: 'easy',
  generate: (rng) => {
    const dT = rng.pick([1, 2]);
    const cT = 3 - dT;
    const traps = [...pickMany(rng, DR_TRAPS, dT), ...pickMany(rng, CR_TRAPS, cT)];
    const rest = pickMany(rng, ALL.filter((a) => !a.trap && a !== CAPITAL && !(a === BANK && traps.includes(OVERDRAFT))), rng.int(3, 4));
    const shown = rng.shuffle([...traps, ...rest]).map((a) => lineOf(rng, a));
    const ask = rng.pick(['Dr', 'Cr'] as const);
    const count = (s: Side) => shown.filter((l) => l.a.side === s).length;
    const answer = count(ask);
    const trapsOn = (s: Side) => shown.filter((l) => l.a.trap && l.a.side === s).length;
    const flipped = answer - trapsOn(ask) + trapsOn(other(ask));
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nHow many of these balances are shown in the ${SIDE_WORD[ask]} column of the trial balance?`,
      answer,
      commonErrors: [
        { value: flipped, why: 'Put the look-alike balances (returns, discounts, bad debts, drawings, provisions, prepaid or outstanding items, a loan given or an overdraft) in the column of the account they resemble instead of their own column.' },
        { value: count(other(ask)), why: `Counted the ${SIDE_WORD[other(ask)]} column instead.` },
        { value: shown.length, why: 'Counted every balance listed, without splitting them by column.' },
      ],
      explanation: [
        `${SIDE_WORD[ask] === 'debit' ? 'Debit' : 'Credit'} balances: ${shown.filter((l) => l.a.side === ask).map((l) => l.a.name).join(', ')}.`,
        `That is ${answer} of the ${shown.length} balances.`,
      ],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    const ask: Side = /shown in the debit column/.test(q.prompt) ? 'Dr' : 'Cr';
    return items.filter((i) => i.a.side === ask).length === q.answer;
  },
});

const tbAccountBalance = mcqT({
  id: 'tb-account-balance',
  version: 2,
  conceptId: 'tb-columns',
  difficulty: 'easy',
  generate: (rng) => {
    const x = amount(rng, 10000, 200000, 1000);
    const y = amount(rng, 10000, 200000, 1000);
    if (x === y) return null;
    const side: Side = x > y ? 'Dr' : 'Cr';
    const bal = Math.abs(x - y);
    const opt = (s: Side, v: Paise) => `${SIDE_WORD[s] === 'debit' ? 'Debit' : 'Credit'} column, ${money(v)}`;
    return {
      prompt: `${poss(PARTIES[rng.int(0, PARTIES.length - 1)])} account in ${poss(biz(rng))} ledger has a debit side total of ${money(x)} and a credit side total of ${money(y)}. The trial balance is prepared by the balance method. How is this account shown?`,
      correct: opt(side, bal),
      distractors: [
        { text: opt(other(side), bal), why: 'Put the balance in the column of the smaller side; the balance goes on the side that is larger.' },
        { text: opt(side, x + y), why: 'Added the two side totals instead of taking their difference.' },
        { text: opt(other(side), x + y), why: 'Added the two side totals and also chose the column of the smaller side.' },
        { text: `Both columns: ${money(x)} debit and ${money(y)} credit`, why: 'Described the totals method; the balance method shows the single net balance.' },
      ],
      explanation: `The larger side is the ${SIDE_WORD[side]} side. Balance = ${money(Math.max(x, y))} - ${money(Math.min(x, y))} = ${money(bal)}, shown in the ${SIDE_WORD[side]} column.`,
    };
  },
  verify: (q) => {
    const [a, b] = amountsIn(q.prompt);
    const side = a > b ? 'Debit' : 'Credit';
    return correctText(q) === `${side} column, ${money(Math.abs(a - b))}`;
  },
});

const STOCK_BANK: Scenario[] = [
  {
    prompt: (x) => `A trial balance includes "Stock at the start of the year: ${x}". In which column does it appear?`,
    correct: 'The debit column, as opening stock',
    wrong: [
      { text: 'The credit column, as a source of income', why: 'Took stock for an income; opening stock is an asset brought forward, a debit balance.' },
      { text: 'Both columns, so that it cancels out', why: 'Thought stock must be entered twice; it has one balance, on the debit side.' },
      { text: 'It does not appear, because stock is shown only in the final accounts', why: 'Confused opening stock with closing stock; opening stock is a ledger balance and is listed.' },
    ],
    explanation: 'Opening stock is a ledger balance carried forward, an asset, so it is shown in the debit column.',
  },
  {
    prompt: (x) => `Closing stock of ${x} is given as an adjustment below the trial balance. How is it treated while the trial balance is prepared?`,
    correct: 'It is left out of the trial balance and dealt with in the final accounts',
    wrong: [
      { text: 'It is entered in the debit column', why: 'Treated it as a ledger balance. Closing stock is not yet in any ledger account, so entering it would upset the totals.' },
      { text: 'It is entered in the credit column', why: 'Took closing stock to the credit side because it appears in the trading account; it is still not a ledger balance.' },
      { text: 'It is entered in both columns to keep them equal', why: 'Thought it must be shown twice; an item that is not in the ledger is not listed at all.' },
    ],
    explanation: 'Closing stock is found by a count at the year end and is brought in only when the final accounts are prepared (Trading A/c and balance sheet).',
  },
  {
    prompt: (x, _w, _o, y) => `The Stock A/c in a trader's ledger shows the opening stock of ${x}. Stock counted at the year end is ${y}, and no entry has yet been passed for it. Which stock figure appears in the trial balance?`,
    correct: 'Only the opening stock, in the debit column',
    wrong: [
      { text: 'Only the closing stock, in the debit column', why: 'Mixed up opening and closing stock; the closing figure is not a ledger balance yet.' },
      { text: 'Opening stock in debit and closing stock in credit', why: 'Used both figures, as a trading account would; the trial balance holds ledger balances only.' },
      { text: 'Neither figure appears', why: 'Overlooked that opening stock is a balance already standing in the ledger.' },
    ],
    explanation: 'The trial balance lists ledger balances. Opening stock stands in the ledger; closing stock does not until the final accounts are made.',
  },
  {
    prompt: () => 'A trader has passed no entry for closing stock; it is given only as a note below the trial balance. Which statement about stock in that trial balance is correct?',
    correct: 'Opening stock appears in the debit column; closing stock is not included',
    wrong: [
      { text: 'Closing stock appears in the debit column and opening stock is left out', why: 'Reversed the two: opening stock is the ledger balance.' },
      { text: 'Both opening and closing stock appear in the debit column', why: 'Added closing stock as well; it is not yet a ledger balance.' },
      { text: 'Opening stock appears in the credit column and closing stock in the debit column', why: 'Put stock on the wrong side and counted closing stock, which is not a ledger balance.' },
    ],
    explanation: 'Only the stock standing in the ledger, the opening stock, is listed, and it is a debit.',
  },
  {
    prompt: (x) => `A trader has already passed the entry for closing stock of ${x}, so the trial balance shows "Adjusted purchases" in place of Purchases and Opening stock. How does the closing stock appear in this trial balance?`,
    correct: 'In the debit column, because the Closing Stock A/c is now a ledger balance',
    wrong: [
      { text: 'It is still left out and shown only as a note', why: 'Applied the usual rule without noticing that the entry has been passed, so closing stock is now a ledger balance.' },
      { text: 'In the credit column, as it is on the credit side of the Trading A/c', why: 'Took the side from the Trading A/c; in the ledger the Closing Stock A/c is an asset with a debit balance.' },
      { text: 'In both columns, so that the totals stay equal', why: 'Thought it must be entered twice; the credit half of the entry is already inside the adjusted purchases figure.' },
    ],
    explanation: 'Once closing stock is debited to Closing Stock A/c (and purchases are adjusted), it is an asset standing in the ledger, so it is listed in the debit column.',
  },
  {
    prompt: () => 'Why is closing stock normally not found inside a trial balance?',
    correct: 'It is valued at the year end and is not yet recorded in any ledger account',
    wrong: [
      { text: 'It is not an asset of the business', why: 'Denied that stock is an asset; it is one, but the trial balance lists only what already stands in the ledger.' },
      { text: 'It has a credit balance, which would be counted twice', why: 'Took the side from the Trading A/c; the real reason is that no ledger account holds it yet.' },
      { text: "It belongs to the next year and never enters this year's accounts", why: "Forgot that closing stock enters this year's Trading A/c and balance sheet; it is only absent from the ledger when the trial balance is drawn." },
    ],
    explanation: 'A trial balance lists ledger balances. Closing stock is found by valuing the goods on the last day and is brought into the books only through the final accounts (unless an entry adjusting purchases has been passed).',
  },
];
const tbClosingStock = mcqT({ id: 'tb-closing-stock', version: 2, conceptId: 'tb-columns', difficulty: 'easy', generate: (rng) => fromBank(rng, STOCK_BANK) });

const tbColGroup = mcqT({
  id: 'tb-col-group',
  version: 2,
  conceptId: 'tb-columns',
  difficulty: 'medium',
  generate: (rng) => {
    const ask = rng.pick(['Dr', 'Cr'] as const);
    const same = ask === 'Dr' ? DR : CR;
    const opp = ask === 'Dr' ? CR_TRAPS : DR_TRAPS;
    const names = (as: Acct[]) => as.map((a) => a.name).join(', ');
    const good = pickMany(rng, same, 3);
    const traps = pickMany(rng, opp, 3);
    return {
      prompt: `Which group contains only balances that appear in the ${SIDE_WORD[ask]} column of a trial balance?`,
      correct: names(good),
      distractors: traps.map((t) => ({
        text: names(rng.shuffle([...pickMany(rng, same, 2, [t]), t])),
        why: `Counted ${t.name} as a ${SIDE_WORD[ask]} item. ${t.wrong}`,
      })),
      explanation: `Assets, expenses, losses and drawings go in the debit column; liabilities, capital, incomes and provisions in the credit column. All three items in ${names(good)} have ${SIDE_WORD[ask]} balances.`,
    };
  },
  verify: (q) => correctText(q).split(', ').every((n) => BY_NAME.get(n)?.side === (/only balances that appear in the debit/.test(q.prompt) ? 'Dr' : 'Cr')),
});

// ---------------------------------------------------------------------------------------------------------------
// Totals and missing balances (tb-totals)
// ---------------------------------------------------------------------------------------------------------------

const askedSide = (prompt: string): Side => (/of its debit column|total of the debit column|debit column\?/.test(prompt) ? 'Dr' : 'Cr');

const tbTotalColumn = numT({
  id: 'tb-total-column',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'easy',
  generate: (rng) => {
    const tb = balancedTb(rng, rng.int(3, 4), rng.int(1, 2));
    if (!tb) return null;
    const ask = rng.pick(['Dr', 'Cr'] as const);
    const shown = rng.shuffle(tb.all);
    const total = sideSum(tb.all, ask);
    const mine = tb.all.filter((l) => l.a.side === ask).map((l) => l.amt);
    const theirs = tb.all.filter((l) => l.a.side !== ask).map((l) => l.amt);
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nThe trial balance agrees. What is the total of its ${SIDE_WORD[ask]} column?`,
      answer: total,
      commonErrors: [
        { value: 2 * total, why: 'Added the debit and credit columns together instead of totalling one column.' },
        { value: total - Math.min(...mine), why: `Left out one ${SIDE_WORD[ask]} balance while adding.` },
        { value: total + Math.min(...theirs), why: `Counted a ${SIDE_WORD[other(ask)]} balance in the ${SIDE_WORD[ask]} column as well.` },
      ],
      explanation: [colLine(shown, 'Dr'), colLine(shown, 'Cr'), `The columns agree, so each totals ${money(total)}.`],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    const ask = askedSide(q.prompt);
    const d = sideSum(items, 'Dr');
    return d === sideSum(items, 'Cr') && sideSum(items, ask) === q.answer;
  },
});

const MISSING_ASKS: ((name: string) => string)[] = [
  (n) => `The trial balance agrees once ${n} is entered, but its amount is not yet known. What is the balance of ${n}?`,
  (n) => `The accountant has not yet entered ${n}. If the trial balance is to agree, what must its balance be?`,
  (n) => `Find the balance of ${n} that makes the trial balance agree.`,
];

const tbMissingEasy = numT({
  id: 'tb-missing-easy',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'easy',
  generate: (rng) => {
    const tb = balancedTb(rng, rng.int(2, 3), rng.int(1, 2));
    if (!tb) return null;
    const shown = rng.shuffle(tb.all.filter((l) => l !== tb.bal));
    const D = sideSum(shown, 'Dr');
    const C = sideSum(shown, 'Cr');
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\n${rng.pick(MISSING_ASKS)(tb.bal.a.name)}`,
      answer: tb.bal.amt,
      commonErrors: [
        { value: D + C, why: 'Added all the balances shown instead of comparing the two columns.' },
        { value: Math.max(D, C), why: 'Gave the larger column total instead of the gap between the two columns.' },
        { value: Math.min(D, C), why: 'Gave the smaller column total instead of the gap between the two columns.' },
      ],
      explanation: [
        colLine(shown, 'Dr'),
        colLine(shown, 'Cr'),
        `${tb.bal.a.name} is ${tb.bal.a.kind}, so it goes in the ${SIDE_WORD[tb.bal.a.side]} column, the shorter one.`,
        `${money(Math.max(D, C))} - ${money(Math.min(D, C))} = ${money(tb.bal.amt)}.`,
      ],
    };
  },
  verify: missingVerify,
});

/** Re-derives a "find the missing balance" answer from the prompt: the gap between the columns of the lines shown. */
function missingVerify(q: { prompt: string; answer: number }): boolean {
  const items = readList(q.prompt);
  const d = sideSum(items, 'Dr');
  const c = sideSum(items, 'Cr');
  const ask = q.prompt.split('\n').slice(-1)[0];
  const target = [...BY_NAME.keys()].filter((n) => ask.includes(n)).sort((a, b) => b.length - a.length)[0];
  if (target === undefined) return false;
  const lighter: Side = d > c ? 'Cr' : 'Dr';
  return Math.abs(d - c) === q.answer && BY_NAME.get(target)?.side === lighter;
}

const tbMethodBalance = numT({
  id: 'tb-method-balance',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'easy',
  generate: (rng) => {
    const a = rng.pick([...TWO_SIDED].filter((x) => x !== OVERDRAFT));
    const base = amount(rng, 20000, 200000, 1000);
    const gap = amount(rng, 5000, 90000, 1000);
    const bigger = base + gap;
    const [d, c] = a.side === 'Dr' ? [bigger, base] : [base, bigger];
    return {
      prompt: `In ${poss(biz(rng))} ledger the ${a.name} account has a debit side total of ${money(d)} and a credit side total of ${money(c)}. What amount is entered for it in the trial balance under the balance method?`,
      answer: gap,
      commonErrors: [
        { value: d + c, why: 'Added the two side totals instead of taking their difference.' },
        { value: bigger, why: 'Took the larger side total as the balance, forgetting to deduct the smaller one.' },
        { value: base, why: 'Took the smaller side total as the balance.' },
      ],
      explanation: [`Balance = larger side - smaller side.`, `${money(bigger)} - ${money(base)} = ${money(gap)}, a ${SIDE_WORD[a.side]} balance.`],
    };
  },
  verify: (q) => {
    const [d, c] = amountsIn(q.prompt);
    return Math.abs(d - c) === q.answer;
  },
});

const tbTotalMedium = numT({
  id: 'tb-total-medium',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'medium',
  generate: (rng) => {
    const pair = rng.pick([
      [get('Purchases'), get('Purchases returns')],
      [get('Sales returns'), get('Sales')],
    ] as const);
    const drawings = get('Drawings');
    const forced = [...pair, drawings];
    const tb = balancedTb(rng, 5, 3, forced);
    if (!tb) return null;
    const shown = rng.shuffle(tb.all);
    const total = sideSum(tb.all, 'Dr');
    const hasCapital = tb.bal.a === CAPITAL;
    const ask: Side = hasCapital ? rng.pick(['Dr', 'Cr'] as const) : 'Dr';
    const drawn = tb.all.find((l) => l.a === drawings)!.amt;
    const returnsAcct = pair.find((a) => a.name.includes('returns'))!;
    const returns = tb.all.find((l) => l.a === returnsAcct)!.amt;
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nShow every balance separately; do not set one against another. The trial balance agrees. What is the total of its ${SIDE_WORD[ask]} column?`,
      answer: total,
      commonErrors: [
        ask === 'Dr'
          ? { value: total - drawn, why: 'Left Drawings out of the debit column.' }
          : { value: total - drawn, why: 'Deducted Drawings from Capital instead of showing it as a separate debit balance.' },
        { value: total - returns, why: `Set ${returnsAcct.name} against its parent account instead of listing it as a separate balance.` },
        {
          value: returnsAcct.side === ask ? total - returns : total + returns,
          why: `Put ${returnsAcct.name} in the ${SIDE_WORD[other(returnsAcct.side)]} column. ${returnsAcct.wrong}`,
        },
        { value: 2 * total, why: 'Added both columns together.' },
      ],
      explanation: [colLine(shown, 'Dr'), colLine(shown, 'Cr'), `Both columns total ${money(total)}.`],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    return sideSum(items, 'Dr') === sideSum(items, 'Cr') && sideSum(items, 'Dr') === q.answer;
  },
});

const tbMissingTrap = numT({
  id: 'tb-missing-trap',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'medium',
  generate: (rng) => {
    const trapD = rng.pick(DR_TRAPS);
    const trapC = rng.pick(CR_TRAPS);
    const tb = balancedTb(rng, 5, 3, [trapD, trapC]);
    if (!tb) return null;
    const shown = rng.shuffle(tb.all.filter((l) => l !== tb.bal));
    const D = sideSum(shown, 'Dr');
    const C = sideSum(shown, 'Cr');
    const s = D - C;
    const tD = shown.find((l) => l.a === trapD)!.amt;
    const tC = shown.find((l) => l.a === trapC)!.amt;
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nThese are all the balances except ${tb.bal.a.name}. The trial balance agrees. What is the balance of ${tb.bal.a.name}?`,
      answer: tb.bal.amt,
      commonErrors: [
        { value: Math.abs(s - 2 * tD), why: `Put ${trapD.name} in the credit column. ${trapD.wrong}` },
        { value: Math.abs(s + 2 * tC), why: `Put ${trapC.name} in the debit column. ${trapC.wrong}` },
        { value: D + C, why: 'Added all the balances shown instead of comparing the two columns.' },
        { value: Math.max(D, C), why: 'Gave the larger column total instead of the gap between the columns.' },
      ],
      explanation: [
        colLine(shown, 'Dr'),
        colLine(shown, 'Cr'),
        `${tb.bal.a.name} goes in the ${SIDE_WORD[tb.bal.a.side]} column, the shorter one.`,
        `${money(Math.max(D, C))} - ${money(Math.min(D, C))} = ${money(tb.bal.amt)}.`,
      ],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    const d = sideSum(items, 'Dr');
    const c = sideSum(items, 'Cr');
    const m = /balance of (.+)\?$/.exec(q.prompt);
    const target = m ? BY_NAME.get(m[1]) : undefined;
    return target !== undefined && Math.abs(d - c) === q.answer && target.side === (d > c ? 'Cr' : 'Dr');
  },
});

// Version 2: always the balance method. Version 1 asked, for half of its seeds, for the debit column by the totals
// method, which the course (CBSE 2025-26) leaves out. The id is kept: the template now turns side totals into balances.
const tbTotalsMethod = numT({
  id: 'tb-totals-method',
  version: 3,
  conceptId: 'tb-totals',
  difficulty: 'medium',
  generate: (rng) => {
    const tb = balancedTb(rng, 3, 2);
    if (!tb) return null;
    // Accounts that are only ever debited or credited (expenses, incomes, goods) have nothing on the other side.
    const mixed = (a: Acct) => TWO_SIDED.has(a);
    const rows = rng.shuffle(tb.all).map((l) => {
      const cap = Math.floor(l.amt / 2 / rupees(500)) * rupees(500);
      const noise = mixed(l.a) ? Math.min(amount(rng, 1000, 40000, 500), cap) : 0;
      return { l, other: noise, big: l.amt + noise };
    });
    const sideTotals = (s: Side) => sum(rows.map((r) => (r.l.a.side === s ? r.big : r.other)));
    const D = sideSum(tb.all, 'Dr');
    const Dtot = sideTotals('Dr');
    const figure = (v: Paise) => (v === 0 ? 'nil' : money(v));
    const lines = rows
      .map((r) => {
        const d = r.l.a.side === 'Dr' ? r.big : r.other;
        const c = r.l.a.side === 'Cr' ? r.big : r.other;
        return `${r.l.a.name}: debit side total ${figure(d)}, credit side total ${figure(c)}`;
      })
      .join('\n');
    return {
      prompt: `The ledger accounts of ${biz(rng)} show these side totals:\n${lines}\nWhat is the total of the debit column of the trial balance prepared by the balance method?`,
      answer: D,
      commonErrors: [
        { value: Dtot, why: 'Added the debit side totals of the accounts without balancing them; the trial balance lists each account at its balance.' },
        { value: Dtot + sideTotals('Cr'), why: 'Added every side total in the ledger.' },
        { value: sum(rows.map((r) => r.big)), why: 'Added the larger side of each account, whichever side it was, into one column.' },
      ],
      explanation: [
        ...rows.map((r) => `${r.l.a.name}: balance ${money(r.l.amt)} (${SIDE_WORD[r.l.a.side]}).`),
        `Debit balances: ${plus(tb.all.filter((l) => l.a.side === 'Dr').map((l) => l.amt))} = ${money(D)}.`,
      ],
    };
  },
  verify: (q) => {
    const rows = [...q.prompt.matchAll(/^(.+): debit side total (₹[\d,]+|nil), credit side total (₹[\d,]+|nil)$/gm)].map((m) => ({
      a: BY_NAME.get(m[1]),
      d: parseRupees(m[2]) ?? 0,
      c: parseRupees(m[3]) ?? 0,
    }));
    if (rows.length === 0 || rows.some((r) => r.a === undefined) || !/balance method/.test(q.prompt)) return false;
    return sum(rows.map((r) => Math.max(r.d - r.c, 0))) === q.answer;
  },
});

const tbMissingDistractor = numT({
  id: 'tb-missing-distractor',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'complex',
  generate: (rng) => {
    const tb = balancedTb(rng, rng.int(4, 5), rng.int(2, 3), [get('Opening stock')]);
    if (!tb) return null;
    const shown = rng.shuffle(tb.all.filter((l) => l !== tb.bal));
    const s = sideSum(shown, 'Dr') - sideSum(shown, 'Cr');
    const closing = amount(rng, 20000, 120000, 1000);
    const outstanding = amount(rng, 2000, 15000, 500);
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nThe trial balance agrees after ${tb.bal.a.name} is added. Further information, for which no entry has yet been passed in the books: closing stock at the year end is ${money(closing)}, and wages of ${money(outstanding)} are outstanding. What is the balance of ${tb.bal.a.name}?`,
      answer: tb.bal.amt,
      commonErrors: [
        { value: Math.abs(s + closing), why: 'Counted the closing stock as a debit balance of the trial balance; it is not a ledger balance.' },
        { value: Math.abs(s - closing), why: 'Counted the closing stock as a credit balance of the trial balance.' },
        { value: Math.abs(s + closing + outstanding), why: 'Counted both the closing stock and the outstanding wages in the trial balance, though neither is a ledger balance yet.' },
        { value: Math.abs(s - outstanding), why: 'Counted the outstanding wages as a credit balance; the adjustment has not been posted to the ledger.' },
      ],
      explanation: [
        'Closing stock and outstanding wages are adjustments with no entry passed yet: they are not ledger balances, so they stay out of the trial balance.',
        colLine(shown, 'Dr'),
        colLine(shown, 'Cr'),
        `${tb.bal.a.name} goes in the ${SIDE_WORD[tb.bal.a.side]} column: ${money(Math.max(sideSum(shown, 'Dr'), sideSum(shown, 'Cr')))} - ${money(Math.min(sideSum(shown, 'Dr'), sideSum(shown, 'Cr')))} = ${money(tb.bal.amt)}.`,
      ],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    return Math.abs(sideSum(items, 'Dr') - sideSum(items, 'Cr')) === q.answer;
  },
});

const tbDerivedBalance = numT({
  id: 'tb-derived-balance',
  version: 2,
  conceptId: 'tb-totals',
  difficulty: 'complex',
  generate: (rng) => {
    const opening = amount(rng, 20000, 80000, 1000);
    const credit = amount(rng, 100000, 300000, 1000);
    const received = amount(rng, 80000, 250000, 1000);
    const bounced = amount(rng, 3000, 20000, 500);
    const debt = opening + credit + bounced - received;
    if (debt < rupees(10000)) return null;
    // Version 2: discount allowed, bad debts and the provision are not listed. They would belong on the credit side of
    // the debtors' account the prompt describes, which holds only the cash received.
    const picked = pickAccounts(rng, rng.int(2, 3), rng.int(1, 2), [], [DEBTORS, CREDITORS, get('Discount allowed'), BAD_DEBTS_ACCT, get('Provision for doubtful debts')], [DEBTORS]);
    const rest = picked.dr.map((a) => lineOf(rng, a));
    const cr = picked.cr.map((a) => lineOf(rng, a));
    const debtLine: Ln = { a: DEBTORS, amt: debt };
    const done = balanceUp(rng, [...rest, ...cr, debtLine], [DEBTORS]);
    if (!done) return null;
    const shown = rng.shuffle([...rest, ...cr]);
    // Debit less credit of the listed balances alone: the balancing item is the size of this plus the debtors figure.
    const base = sideSum([...rest, ...cr], 'Dr') - sideSum([...rest, ...cr], 'Cr');
    const alt = (debtors: Paise) => Math.abs(base + debtors);
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nThe Sundry debtors account is not listed. Its debit side holds the opening balance ${money(opening)}, credit sales ${money(credit)} and a cheque of ${money(bounced)} that was dishonoured and debited back to the debtor; its credit side holds ${money(received)} received from debtors. The trial balance agrees after Sundry debtors and ${done.bal.a.name} are entered. What is the balance of ${done.bal.a.name}?`,
      answer: done.bal.amt,
      commonErrors: [
        { value: alt(opening + credit - received), why: 'Left out the dishonoured cheque, which makes the debtor owe the money again.' },
        { value: alt(opening + credit - received - bounced), why: 'Deducted the dishonoured cheque instead of adding it back to the debtors.' },
        { value: alt(credit + bounced - received), why: 'Left the opening balance out of the debtors balance.' },
        // Leaving debtors out gives this figure for the same balance only while the gap stays on the same side.
        ...(Math.sign(base) === Math.sign(base + debt) ? [{ value: Math.abs(base), why: 'Left Sundry debtors out of the debit column altogether.' }] : []),
      ],
      explanation: [
        `Sundry debtors = ${money(opening)} + ${money(credit)} + ${money(bounced)} - ${money(received)} = ${money(debt)} (a debit balance).`,
        colLine([...shown, debtLine], 'Dr'),
        colLine([...shown, debtLine], 'Cr'),
        `${done.bal.a.name} goes in the ${SIDE_WORD[done.bal.a.side]} column: ${money(done.bal.amt)}.`,
      ],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    const [opening, credit, bounced, received] = amountsIn(q.prompt.split('\n').slice(-1)[0]);
    const debt = opening + credit + bounced - received;
    return Math.abs(sideSum(items, 'Dr') + debt - sideSum(items, 'Cr')) === q.answer;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Suspense account (tb-suspense)
// ---------------------------------------------------------------------------------------------------------------

const tbSuspenseAmount = numT({
  id: 'tb-suspense-amount',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'easy',
  generate: (rng) => {
    if (rng.pick([true, false])) {
      const a = amount(rng, 200000, 900000, 1000);
      const gap = amount(rng, 500, 20000, 500);
      const [D, C] = rng.pick([true, false]) ? [a + gap, a] : [a, a + gap];
      return {
        prompt: `The debit column of ${poss(biz(rng))} trial balance totals ${money(D)} and the credit column totals ${money(C)}. A Suspense A/c is opened to make the columns agree. What amount is entered in the Suspense A/c?`,
        answer: gap,
        commonErrors: [
          { value: D + C, why: 'Added the two column totals instead of finding their difference.' },
          { value: Math.max(D, C), why: 'Entered the larger total instead of the gap between the columns.' },
          { value: Math.min(D, C), why: 'Entered the smaller total instead of the gap between the columns.' },
        ],
        explanation: [`Difference = ${money(Math.max(D, C))} - ${money(Math.min(D, C))} = ${money(gap)}.`, `The Suspense A/c is opened for ${money(gap)} on the shorter side.`],
      };
    }
    const t = amount(rng, 200000, 900000, 1000);
    const s = amount(rng, 500, 20000, 500);
    const side = rng.pick(['Dr', 'Cr'] as const);
    return {
      prompt: `A Suspense A/c with a ${SIDE_WORD[side]} balance of ${money(s)} was added to make ${poss(biz(rng))} trial balance agree, and each column now totals ${money(t)}. What did the ${SIDE_WORD[side]} column total before the Suspense A/c was added?`,
      answer: t - s,
      commonErrors: [
        { value: t + s, why: 'Added the suspense balance instead of taking it out.' },
        { value: t, why: 'Gave the total with the Suspense A/c still included.' },
        { value: s, why: 'Gave the suspense balance itself instead of the total before it.' },
      ],
      explanation: [`The Suspense A/c was added to the ${SIDE_WORD[side]} column, the short one.`, `Before it: ${money(t)} - ${money(s)} = ${money(t - s)}.`],
    };
  },
  verify: (q) => {
    const [a, b] = amountsIn(q.prompt);
    return Math.abs(a - b) === q.answer;
  },
});

const tbSuspenseSide = mcqT({
  id: 'tb-suspense-side',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'easy',
  generate: (rng) => {
    const a = amount(rng, 200000, 900000, 1000);
    const gap = amount(rng, 500, 20000, 500);
    const heavy: Side = rng.pick(['Dr', 'Cr'] as const);
    const [D, C] = heavy === 'Dr' ? [a + gap, a] : [a, a + gap];
    const opt = (s: Side, v: Paise) => `${SIDE_WORD[s] === 'debit' ? 'Debit' : 'Credit'} side, ${money(v)}`;
    const right = other(heavy);
    return {
      prompt: `${poss(biz(rng))} trial balance has a debit column of ${money(D)} and a credit column of ${money(C)}. A Suspense A/c is opened so that the columns agree. On which side, and for what amount, does it appear?`,
      correct: opt(right, gap),
      distractors: [
        { text: opt(heavy, gap), why: `Put the Suspense A/c on the ${SIDE_WORD[heavy]} side, which is already the larger; it goes on the shorter side.` },
        { text: opt(right, Math.min(D, C)), why: 'Entered the smaller column total instead of the difference.' },
        { text: opt(heavy, Math.max(D, C)), why: 'Entered the larger column total on the larger side instead of the difference on the shorter side.' },
        { text: opt(right, D + C), why: 'Added the two totals instead of finding the difference.' },
      ],
      explanation: `The ${SIDE_WORD[heavy]} column is larger by ${money(gap)}, so the Suspense A/c is shown on the ${SIDE_WORD[right]} side for ${money(gap)}.`,
    };
  },
  verify: (q) => {
    const [D, C] = amountsIn(q.prompt);
    return correctText(q) === `${D > C ? 'Credit' : 'Debit'} side, ${money(Math.abs(D - C))}`;
  },
});

/**
 * Balances that almost agree: a trial balance that would balance, with the balancing figure (usually Capital) written
 * a few thousand rupees too high or too low, as when one balance was copied wrongly. The gap is a realistic suspense.
 */
function unbalancedLines(rng: Rng): Ln[] | null {
  const tb = balancedTb(rng, rng.int(3, 4), rng.int(1, 2));
  if (!tb) return null;
  const gap = amount(rng, 500, 9000, 500);
  const amt = tb.bal.amt + rng.pick([gap, -gap]);
  if (amt < rupees(1000)) return null;
  return tb.all.map((l) => (l === tb.bal ? { ...l, amt } : l));
}

const tbSuspenseFromList = numT({
  id: 'tb-suspense-from-list',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'medium',
  generate: (rng) => {
    const ls = unbalancedLines(rng);
    if (!ls) return null;
    const shown = rng.shuffle(ls);
    const D = sideSum(shown, 'Dr');
    const C = sideSum(shown, 'Cr');
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nThe columns of the trial balance do not agree, and a Suspense A/c is opened for the difference. What amount is entered in the Suspense A/c?`,
      answer: Math.abs(D - C),
      commonErrors: [
        { value: D + C, why: 'Added the two columns instead of finding their difference.' },
        { value: Math.max(D, C), why: 'Gave the larger column total instead of the difference.' },
        { value: Math.min(D, C), why: 'Gave the smaller column total instead of the difference.' },
      ],
      explanation: [colLine(shown, 'Dr'), colLine(shown, 'Cr'), `Difference = ${money(Math.max(D, C))} - ${money(Math.min(D, C))} = ${money(Math.abs(D - C))}.`],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    return Math.abs(sideSum(items, 'Dr') - sideSum(items, 'Cr')) === q.answer;
  },
});

const tbTotalWithSuspense = numT({
  id: 'tb-total-with-suspense',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'medium',
  generate: (rng) => {
    const ls = unbalancedLines(rng);
    if (!ls) return null;
    const shown = rng.shuffle(ls);
    const D = sideSum(shown, 'Dr');
    const C = sideSum(shown, 'Cr');
    const total = Math.max(D, C);
    const short: Side = D > C ? 'Cr' : 'Dr';
    return {
      prompt: `${opener(rng)}\n${listOf(shown)}\nThe columns do not agree, so a Suspense A/c is opened for the difference and the trial balance is completed. What is the total of each column of the completed trial balance?`,
      answer: total,
      commonErrors: [
        { value: D + C, why: 'Added the two column totals instead of taking the larger one as the final total.' },
        { value: Math.min(D, C), why: 'Took the smaller column total; it grows when the Suspense A/c is added.' },
        { value: Math.abs(D - C), why: 'Gave the Suspense A/c itself as the total of the columns.' },
      ],
      explanation: [
        colLine(shown, 'Dr'),
        colLine(shown, 'Cr'),
        `The ${SIDE_WORD[short]} column is short by ${money(Math.abs(D - C))}, so the Suspense A/c goes there.`,
        `Each column now totals ${money(total)}.`,
      ],
    };
  },
  verify: (q) => {
    const items = readList(q.prompt);
    return Math.max(sideSum(items, 'Dr'), sideSum(items, 'Cr')) === q.answer;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Errors: which ones upset agreement, and by how much (tb-errors)
// ---------------------------------------------------------------------------------------------------------------

/**
 * One error. `d` is the change it makes to (debit total - credit total) as a multiple of the amount: +1 means the
 * debit column is larger by the amount, -2 the credit column by twice the amount, 0 that the totals still agree.
 */
interface ErrItem {
  text: (x: string, p: string, q: string) => string;
  d: number;
  /** The slip that makes a student pick this error in the wrong kind of question. */
  note: string;
  explain: string;
}

const ONE_SIDED = 'Treated a posting with one half missing as a complete entry; the two sides then no longer match.';
const WRONG_SIDE = 'Treated an item on the wrong side as harmless; it adds to one column and is missing from the other.';
const CASTING = 'Thought an addition slip cannot change the totals; the wrong balance is carried into the trial balance.';
const REPEAT = 'Thought repeating a posting on one side keeps the books balanced; only one side grew.';

const EFFECT_ERRORS: ErrItem[] = [
  { d: 1, text: (x, p) => `A credit sale of ${x} to ${p} was debited to ${poss(p)} account, but the credit to Sales A/c was left out.`, note: ONE_SIDED, explain: 'Only the debit was posted, so the debit column is larger.' },
  { d: -1, text: (x) => `Salaries of ${x} paid in cash were credited to Cash A/c, but the debit to Salaries A/c was left out.`, note: ONE_SIDED, explain: 'Only the credit was posted, so the credit column is larger.' },
  { d: -1, text: (x, p) => `Goods of ${x} bought on credit from ${p} were credited to ${poss(p)} account, but the debit to Purchases A/c was left out.`, note: ONE_SIDED, explain: 'Only the credit was posted, so the credit column is larger.' },
  { d: 1, text: (x, p) => `Cash of ${x} received from ${p} was debited to Cash A/c, but the credit to ${poss(p)} account was left out.`, note: ONE_SIDED, explain: 'Only the debit was posted, so the debit column is larger.' },
  { d: -2, text: (x) => `Discount allowed of ${x} was credited to Discount Allowed A/c instead of being debited; the customer's account was credited correctly.`, note: WRONG_SIDE, explain: 'Both postings were credits, so the credit column is larger by twice the amount.' },
  { d: 2, text: (x, p) => `A payment of ${x} to ${p}, a creditor, was debited to ${poss(p)} account and also debited to Cash A/c instead of crediting it.`, note: WRONG_SIDE, explain: 'Both postings were debits, so the debit column is larger by twice the amount.' },
  { d: 2, text: (x, p) => `${poss(p)} balance as a creditor, ${x}, was written in the debit column of the trial balance.`, note: WRONG_SIDE, explain: 'A credit balance in the debit column adds to the debit column and is missing from the credit column: a gap of twice the amount.' },
  { d: -1, text: (x) => `The balance of the Furniture A/c, ${x}, was left out of the trial balance.`, note: 'Thought a balance left out of the trial balance is harmless; that column is then short.', explain: 'A debit balance is missing, so the debit column is smaller.' },
  { d: -1, text: (x) => `The credit side of the Sales A/c was added up ${x} too high while the account was balanced.`, note: CASTING, explain: 'The Sales balance is too high, so the credit column is larger.' },
  { d: 1, text: (x) => `The debit side of the Rent A/c was added up ${x} too high while the account was balanced.`, note: CASTING, explain: 'The Rent balance is too high, so the debit column is larger.' },
  { d: -1, text: (x) => `A cash sale of ${x} was debited to Cash A/c once but credited to Sales A/c twice.`, note: REPEAT, explain: 'The credit was posted twice and the debit once, so the credit column is larger.' },
  { d: 1, text: (x) => `A cash purchase of ${x} was credited to Cash A/c once but debited to Purchases A/c twice.`, note: REPEAT, explain: 'The debit was posted twice and the credit once, so the debit column is larger.' },
  { d: -2, text: (x) => `The balance of the Drawings A/c, ${x}, was written in the credit column of the trial balance.`, note: WRONG_SIDE, explain: 'A debit balance in the credit column adds to the credit column and is missing from the debit column: a gap of twice the amount.' },
];

const NONE_ERRORS: ErrItem[] = [
  { d: 0, text: (x, p) => `A credit sale of ${x} to ${p} was left out of the books altogether: neither ${poss(p)} account nor Sales A/c was posted.`, note: 'Thought a transaction left out of the books must show up, but with both the debit and the credit missing the totals stay equal.', explain: 'An entry left out completely removes equal debits and credits.' },
  { d: 0, text: (x) => `Rent paid of ${x} was debited to Salaries A/c instead of Rent A/c.`, note: 'Thought debiting the wrong account upsets the totals; the amount is still debited once and credited once.', explain: 'The debit went to the wrong account, but it is still a debit of the same amount.' },
  { d: 0, text: (x) => `Furniture bought for ${x} was debited to Purchases A/c.`, note: 'Thought treating a capital item as an expense changes the totals; it only changes which account is debited.', explain: 'An error of principle: the debit went to Purchases A/c instead of Furniture A/c, but it is still a debit of the same amount, so the totals are not affected.' },
  { d: 0, text: (x) => `The debit side of the Wages A/c was added up ${x} too high and the debit side of the Salaries A/c ${x} too low.`, note: 'Thought two slips cannot cancel; equal and opposite slips on the same side leave the totals unchanged.', explain: 'One debit balance is too high and another too low by the same amount, so the two errors offset each other (compensating errors).' },
  { d: 0, text: (x, p, q) => `Cash of ${x} received from ${p} was credited to ${poss(q)} account instead of ${poss(p)} account; both are customers.`, note: 'Thought crediting the wrong customer changes the totals; the credit is the same amount on the same side.', explain: 'The credit went to the wrong customer, but it is still a credit of the same amount, so the totals are unchanged.' },
  { d: 0, text: (x) => `Repairs of ${x} to old machinery were debited to Machinery A/c instead of Repairs A/c.`, note: 'Thought an error of principle upsets the totals; it only puts the debit in the wrong kind of account.', explain: 'An error of principle: the debit went to an asset account instead of an expense account, but it is still a debit of the same amount, so the totals agree even though profit is affected.' },
  { d: 0, text: (x, p) => `A credit purchase of ${x} from ${p} was entered in the Sales Book and posted from there.`, note: 'Thought a wrong book breaks the debit-credit match; both sides were still posted with the same amount.', explain: 'The supplier was debited and Sales A/c credited with the same amount: equal debit and credit, though in the wrong accounts and on the wrong sides.' },
  { d: 0, text: (x) => `The electricity bill of ${x} was recorded twice in the journal and posted twice to both accounts.`, note: 'Thought posting twice makes one side bigger; both sides were posted twice.', explain: 'A duplicated entry adds equal amounts to both columns.' },
];

const ALL_ERRORS = [...EFFECT_ERRORS, ...NONE_ERRORS];

/** Two different parties and an amount for an error sentence. */
const errCtx = (rng: Rng) => {
  const [p, q] = rng.shuffle(PARTIES);
  return { p, q, x: amount(rng, 1000, 50000, 500) };
};

/** Finds which error and which amount a sentence describes, by trying every name; null if none fits. */
function identify(sentence: string): { item: ErrItem; x: Paise } | null {
  const first = (sentence.match(RUPEE_TEXT) ?? [])[0];
  const x = first ? parseRupees(first) : null;
  if (!first || x == null) return null;
  for (const item of ALL_ERRORS)
    for (const p of PARTIES)
      for (const q of PARTIES) if (p !== q && item.text(first, p, q) === sentence) return { item, x };
  return null;
}

const dirText = (d: number, amt: Paise) =>
  d > 0 ? `The debit column is larger by ${money(amt)}` : `The credit column is larger by ${money(amt)}`;
const AGREE = 'The two columns still agree';

const tbErrorAgree = mcqT({
  id: 'tb-error-agree',
  version: 2,
  conceptId: 'tb-errors',
  difficulty: 'easy',
  generate: (rng) => {
    const { p, q, x } = errCtx(rng);
    const item = rng.pick(ALL_ERRORS);
    const xs = money(x);
    const gap = Math.abs(item.d) * x;
    const ask = `${item.text(xs, p, q)}\nThe trial balance is drawn up with this error uncorrected. What happens to its two columns?`;
    if (item.d === 0) {
      return {
        prompt: ask,
        correct: AGREE,
        distractors: [
          { text: dirText(1, x), why: item.note },
          { text: dirText(-1, x), why: item.note },
          { text: dirText(1, 2 * x), why: item.note },
        ],
        explanation: item.explain,
      };
    }
    const right = Math.sign(item.d);
    return {
      prompt: ask,
      correct: dirText(right, gap),
      distractors: [
        { text: dirText(-right, gap), why: 'Mixed up which column is larger; ask which side ends up with more than it should have, or which side is short.' },
        { text: AGREE, why: item.note },
        Math.abs(item.d) === 1
          ? { text: dirText(right, 2 * x), why: 'Doubled the amount; only one column is out, by the amount once. The gap doubles only when an item sits on the wrong side.' }
          : { text: dirText(right, x), why: 'Counted the amount once; an item on the wrong side adds to one column and is missing from the other, a gap of twice the amount.' },
      ],
      explanation: item.explain,
    };
  },
  verify: (q) => {
    const found = identify(q.prompt.split('\n')[0]);
    if (!found) return false;
    const t = correctText(q);
    if (found.item.d === 0) return t === AGREE;
    return t === dirText(Math.sign(found.item.d), Math.abs(found.item.d) * found.x);
  },
});

const tbErrorRevealed = mcqT({
  id: 'tb-error-revealed',
  version: 2,
  conceptId: 'tb-errors',
  difficulty: 'easy',
  generate: (rng) => {
    const [p, q] = rng.shuffle(PARTIES);
    const text = (e: ErrItem) => e.text(money(amount(rng, 1000, 50000, 500)), p, q);
    const good = rng.pick(EFFECT_ERRORS);
    const bad = rng.shuffle(NONE_ERRORS).slice(0, 3);
    return {
      prompt: 'Which one of these errors will make the two columns of the trial balance unequal?',
      correct: text(good),
      distractors: bad.map((e) => ({ text: text(e), why: e.note })),
      explanation: `${good.explain} The other errors leave equal debits and credits, so they stay hidden.`,
    };
  },
  verify: (q) => {
    const right = identify(correctText(q));
    return right !== null && right.item.d !== 0 && q.options.filter((o) => o.id !== q.correct).every((o) => identify(o.text)?.item.d === 0);
  },
});

const tbErrorNotRevealed = mcqT({
  id: 'tb-error-not-revealed',
  version: 2,
  conceptId: 'tb-errors',
  difficulty: 'medium',
  generate: (rng) => {
    const [p, q] = rng.shuffle(PARTIES);
    const text = (e: ErrItem) => e.text(money(amount(rng, 1000, 50000, 500)), p, q);
    const hidden = rng.pick(NONE_ERRORS);
    const shown = rng.shuffle(EFFECT_ERRORS).slice(0, 3);
    return {
      prompt: 'Each of these errors is made, on its own, in a different set of books. Which one will the trial balance NOT disclose?',
      correct: text(hidden),
      distractors: shown.map((e) => ({ text: text(e), why: e.note })),
      explanation: `${hidden.explain} Each of the other errors upsets the equality of the two columns.`,
    };
  },
  verify: (q) => {
    const right = identify(correctText(q));
    return right !== null && right.item.d === 0 && q.options.filter((o) => o.id !== q.correct).every((o) => (identify(o.text)?.item.d ?? 0) !== 0);
  },
});

const tbErrorDiff = numT({
  id: 'tb-error-diff',
  version: 2,
  conceptId: 'tb-errors',
  difficulty: 'medium',
  generate: (rng) => {
    const { p, q, x } = errCtx(rng);
    const item = rng.pick(EFFECT_ERRORS);
    const k = Math.abs(item.d);
    const xs = money(x);
    return {
      prompt: `${item.text(xs, p, q)}\nBy how much will the two columns of the trial balance differ because of this error alone?`,
      answer: k * x,
      commonErrors:
        k === 1
          ? [
              { value: 2 * x, why: 'Doubled the amount, as if the item sat on the wrong side; here only one column is out, so the gap is the amount once.' },
              { value: x / 2, why: 'Halved the amount, thinking the debit and the credit share it.' },
            ]
          : [
              { value: x, why: 'Counted the amount once; the item is on the wrong side, so one column gains it and the other loses it: a gap of twice the amount.' },
              { value: x / 2, why: 'Halved the amount instead of doubling it.' },
            ],
      explanation: [item.explain, `${k === 1 ? `The difference is the amount itself: ${xs}.` : `Difference = 2 x ${xs} = ${money(k * x)}.`}`],
    };
  },
  verify: (q) => {
    const found = identify(q.prompt.split('\n')[0]);
    return found !== null && found.item.d !== 0 && q.answer === Math.abs(found.item.d) * found.x;
  },
});

const tbSuspenseSideError = mcqT({
  id: 'tb-suspense-side-error',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'medium',
  generate: (rng) => {
    const { p, q, x } = errCtx(rng);
    const item = rng.pick(EFFECT_ERRORS);
    const k = Math.abs(item.d);
    const heavy: Side = item.d > 0 ? 'Dr' : 'Cr';
    const right = other(heavy);
    const opt = (s: Side, v: Paise) => `${SIDE_WORD[s] === 'debit' ? 'Debit' : 'Credit'} side, ${money(v)}`;
    const altAmount = k === 1 ? 2 * x : x;
    const altWhy = k === 1 ? 'Doubled the amount of the error, thinking both columns are affected.' : 'Used the amount of the item once; a wrong-column posting changes the gap by twice the amount.';
    return {
      prompt: `${item.text(money(x), p, q)}\nThis is the only error. The trial balance does not agree and a Suspense A/c is opened to make it agree. On which side, and for what amount, does the Suspense A/c appear?`,
      correct: opt(right, k * x),
      distractors: [
        { text: opt(heavy, k * x), why: `Put the Suspense A/c on the ${SIDE_WORD[heavy]} side, which is already the larger; it goes on the shorter side.` },
        { text: opt(right, altAmount), why: altWhy },
        { text: opt(heavy, altAmount), why: `Chose the larger side and also used the wrong amount. ${altWhy}` },
      ],
      explanation: `${item.explain} The Suspense A/c fills the gap, so it appears on the ${SIDE_WORD[right]} side for ${money(k * x)}.`,
    };
  },
  verify: (q) => {
    const found = identify(q.prompt.split('\n')[0]);
    if (!found || found.item.d === 0) return false;
    return correctText(q) === `${found.item.d > 0 ? 'Credit' : 'Debit'} side, ${money(Math.abs(found.item.d) * found.x)}`;
  },
});

const NUMERALS = ['i', 'ii', 'iii', 'iv'];

/** The net effect of 3-4 errors on (debit total - credit total). */
function errorSet(rng: Rng) {
  const xsAll = rng.shuffle([2000, 3000, 4500, 5000, 6500, 8000, 9000, 12000, 15000, 18000, 24000]).slice(0, 4).map(rupees);
  const names = rng.shuffle(PARTIES);
  const picks = rng.shuffle(EFFECT_ERRORS).slice(0, 3);
  const withNone = rng.pick([true, false]);
  const items = [...picks, ...(withNone ? [rng.pick(NONE_ERRORS)] : [])];
  const rows = rng.shuffle(items).map((item, i) => ({ item, x: xsAll[i], text: item.text(money(xsAll[i]), names[i], names[5]) }));
  const net = sum(rows.map((r) => r.item.d * r.x));
  const sumAbs = sum(rows.map((r) => Math.abs(r.item.d) * r.x));
  const sumX = sum(rows.filter((r) => r.item.d !== 0).map((r) => r.x));
  const netOnce = Math.abs(sum(rows.map((r) => Math.sign(r.item.d) * r.x)));
  const noneX = sum(rows.filter((r) => r.item.d === 0).map((r) => r.x));
  const prompt = `The books of ${biz(rng)} contain these errors, and no others. Before they were found, a trial balance was drawn up.\n${rows.map((r, i) => `(${NUMERALS[i]}) ${r.text}`).join('\n')}`;
  return { rows, net, sumAbs, sumX, netOnce, noneX, prompt };
}

const tbNetEffect = numT({
  id: 'tb-net-effect',
  version: 2,
  conceptId: 'tb-errors',
  difficulty: 'complex',
  generate: (rng) => {
    const s = errorSet(rng);
    if (s.net === 0 || Math.abs(s.net) === s.sumAbs) return null;
    return {
      prompt: `${s.prompt}\nBy how much do the two columns of that trial balance differ?`,
      answer: Math.abs(s.net),
      commonErrors: [
        { value: s.sumAbs, why: 'Added the effect of every error without setting off errors that push the two columns in opposite directions.' },
        { value: s.netOnce, why: 'Set the errors off against each other correctly, but counted an item on the wrong side once; it changes the gap by twice its amount.' },
        { value: s.sumX, why: 'Added the amounts of the errors once each: did not set off errors that push in opposite directions, and did not double the item on the wrong side.' },
        ...(s.noneX > 0 ? [{ value: Math.abs(s.net) + s.noneX, why: 'Counted the error that leaves the totals equal as well.' }] : []),
      ],
      explanation: [
        ...s.rows.map((r, i) => `(${['i', 'ii', 'iii', 'iv'][i]}) ${r.item.d === 0 ? 'No effect: equal debit and credit.' : `${r.item.d > 0 ? 'Debit' : 'Credit'} column larger by ${money(Math.abs(r.item.d) * r.x)}.`}`),
        `Net: ${s.net > 0 ? 'debit' : 'credit'} column larger by ${money(Math.abs(s.net))}.`,
      ],
    };
  },
  verify: (q) => {
    const lines = q.prompt.split('\n').filter((l) => /^\((?:i|ii|iii|iv)\) /.test(l)).map((l) => identify(l.replace(/^\(\w+\) /, '')));
    if (lines.some((l) => l === null)) return false;
    return Math.abs(sum(lines.map((l) => l!.item.d * l!.x))) === q.answer;
  },
});

const tbNetEffectSide = mcqT({
  id: 'tb-net-effect-side',
  version: 2,
  conceptId: 'tb-errors',
  difficulty: 'complex',
  generate: (rng) => {
    const s = errorSet(rng);
    if (s.net === 0 || Math.abs(s.net) === s.sumAbs) return null;
    const d = Math.sign(s.net);
    const gap = Math.abs(s.net);
    return {
      prompt: `${s.prompt}\nWhich statement about that trial balance is correct?`,
      correct: dirText(d, gap),
      distractors: [
        { text: dirText(-d, gap), why: 'Reversed the direction of the net gap; add up separately what each column has too much of.' },
        { text: dirText(d, s.sumAbs), why: 'Added the effect of every error without setting off errors that push in opposite directions.' },
        { text: dirText(-d, s.sumAbs), why: 'Added the effects without offsetting, and also reversed the direction.' },
        { text: AGREE, why: 'Assumed the errors cancel out or are all harmless; at least one of them is one-sided or on the wrong side.' },
      ],
      explanation: `${s.rows.map((r) => (r.item.d === 0 ? 'no effect' : `${r.item.d > 0 ? 'debit' : 'credit'} +${money(Math.abs(r.item.d) * r.x)}`)).join('; ')}. Net: ${dirText(d, gap).toLowerCase()}.`,
    };
  },
  verify: (q) => {
    const lines = q.prompt.split('\n').filter((l) => /^\((?:i|ii|iii|iv)\) /.test(l)).map((l) => identify(l.replace(/^\(\w+\) /, '')));
    if (lines.some((l) => l === null)) return false;
    const net = sum(lines.map((l) => l!.item.d * l!.x));
    return net !== 0 && correctText(q) === dirText(Math.sign(net), Math.abs(net));
  },
});

const tbSuspenseRemaining = numT({
  id: 'tb-suspense-remaining',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'complex',
  generate: (rng) => {
    const pos = rng.shuffle(EFFECT_ERRORS.filter((e) => e.d > 0)).slice(0, 2);
    const neg = rng.shuffle(EFFECT_ERRORS.filter((e) => e.d < 0)).slice(0, 1);
    const none = rng.pick(NONE_ERRORS);
    const xs = rng.shuffle([2000, 3000, 4500, 5000, 6500, 8000, 9000, 12000, 15000]).slice(0, 4).map(rupees);
    const names = rng.shuffle(PARTIES);
    const rows = rng.shuffle([...pos, ...neg, none]).map((item, i) => ({ item, x: xs[i] }));
    const explained = sum(rows.map((r) => r.item.d * r.x));
    const left = amount(rng, 500, 6000, 500);
    const diff = explained + left;
    if (diff <= 0) return null;
    const base = amount(rng, 300000, 900000, 1000);
    const D = base + diff;
    const C = base;
    const abs = sum(rows.map((r) => Math.abs(r.item.d) * r.x));
    const noneX = rows.find((r) => r.item.d === 0)!.x;
    const tookOff = sum(rows.filter((r) => r.item.d > 0).map((r) => r.item.d * r.x));
    const putBack = sum(rows.filter((r) => r.item.d < 0).map((r) => -r.item.d * r.x));
    return {
      prompt: `The debit column of ${poss(biz(rng))} trial balance totals ${money(D)} and the credit column ${money(C)}. The difference was put to the credit side of a Suspense A/c. The following errors were found later:\n${rows.map((r, i) => `(${['i', 'ii', 'iii', 'iv'][i]}) ${r.item.text(money(r.x), names[i], names[5])}`).join('\n')}\nAfter these errors are corrected, what credit balance remains in the Suspense A/c?`,
      answer: left,
      commonErrors: [
        { value: Math.abs(diff - abs), why: 'Deducted every error from the suspense balance without noticing that some of them push the other way.' },
        { value: Math.abs(diff - sum(rows.map((r) => Math.sign(r.item.d) * r.x))), why: 'Took each error in the right direction, but counted an item on the wrong side once; it accounts for twice its amount.' },
        { value: Math.abs(diff - sum(rows.filter((r) => r.item.d !== 0).map((r) => r.x))), why: 'Deducted the amount of each error once: ignored that some push the other way and that an item on the wrong side counts twice.' },
        { value: left + noneX, why: 'Counted the error that never affected the trial balance as part of the difference.' },
        { value: diff, why: 'Left the whole difference in suspense, as if no error had been corrected.' },
      ],
      explanation: [
        `Suspense (credit) = ${money(D)} - ${money(C)} = ${money(diff)}.`,
        ...rows.map((r, i) => `(${['i', 'ii', 'iii', 'iv'][i]}) ${r.item.d === 0 ? 'No effect on the trial balance, so none of the suspense.' : `${r.item.d > 0 ? 'Debit' : 'Credit'} column larger by ${money(Math.abs(r.item.d) * r.x)}; correcting it ${r.item.d > 0 ? 'reduces' : 'increases'} the credit balance in suspense by that amount.`}`),
        `Remaining = ${money(diff)} - ${money(tookOff)} + ${money(putBack)} = ${money(left)} (credit).`,
      ],
    };
  },
  verify: (q) => {
    const [D, C] = amountsIn(q.prompt);
    const found = q.prompt.split('\n').filter((l) => /^\((?:i|ii|iii|iv)\) /.test(l)).map((l) => identify(l.replace(/^\(\w+\) /, '')));
    if (found.some((f) => f === null)) return false;
    return D - C - sum(found.map((f) => f!.item.d * f!.x)) === q.answer;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Locating errors and misplaced balances (tb-difference, tb-misplaced)
// ---------------------------------------------------------------------------------------------------------------

const tbLocateClue = mcqT({
  id: 'tb-locate-clue',
  version: 2,
  conceptId: 'tb-difference',
  difficulty: 'medium',
  generate: (rng) => {
    const kind = rng.pick(['omitted', 'wrongColumn', 'nothing'] as const);
    const heavy: Side = rng.pick(['Dr', 'Cr'] as const);
    const light = other(heavy);
    const target = rng.pick((light === 'Dr' ? DR : CR_NO_CAPITAL).filter((a) => !a.trap));
    const targetLine = lineOf(rng, target);
    const x = targetLine.amt;
    const diff = kind === 'omitted' ? x : kind === 'wrongColumn' ? 2 * x : amount(rng, 1000, 9000, 500);
    const others = pickMany(rng, ALL.filter((a) => a !== CAPITAL), 3, [target]).map((a) => lineOf(rng, a));
    const all = [targetLine, ...others];
    // The only balance that matches the difference (or half of it) must be the target, and only in the matching case.
    const matches = (l: Ln) => l.amt === diff || 2 * l.amt === diff;
    if (others.some(matches)) return null;
    if (kind === 'nothing' && matches(targetLine)) return null;
    if (new Set(all.map((l) => l.amt)).size !== all.length) return null;
    if (bankClash(all.map((l) => l.a))) return null;
    const heavyWord = SIDE_WORD[heavy];
    const lightWord = SIDE_WORD[light];
    const t1 = `The ${target.name} balance may have been left out of the ${lightWord} column`;
    const t2 = `The ${target.name} balance may have been entered in the ${heavyWord} column instead of the ${lightWord} column`;
    const t3 = 'Re-check how each ledger balance was worked out and carried to the trial balance, since none of these balances equals the difference or half of it';
    const t4 = 'Leave the difference in a Suspense A/c and make no further search';
    const correct = kind === 'omitted' ? t1 : kind === 'wrongColumn' ? t2 : t3;
    const why1 =
      kind === 'wrongColumn'
        ? 'Took the balance as omitted; an omission gives a gap equal to the balance, but this gap is twice the balance.'
        : 'This balance does not equal the difference, so its omission would not explain the gap.';
    const why2 =
      kind === 'omitted'
        ? 'Took the balance as being in the wrong column; that gives a gap of twice the balance, but this gap equals the balance itself.'
        : 'This balance is not half the difference, so its being in the wrong column would not explain the gap.';
    const why3 = 'Fell back on a general re-check, but the difference matches a balance (or half of one), which points to a specific cause.';
    const why4 = 'Used the Suspense A/c to avoid looking for the error; it is only a temporary holding account.';
    const all4: Distractor[] = [
      { text: t1, why: why1 },
      { text: t2, why: why2 },
      { text: t3, why: why3 },
      { text: t4, why: why4 },
    ];
    return {
      prompt: `In ${poss(biz(rng))} trial balance the ${heavyWord} column is larger than the ${lightWord} column by ${money(diff)}. Both columns have been re-added and the additions are correct. Among the balances in the ledger are these:\n${listOf(rng.shuffle(all))}\nGoing by these balances, what should the accountant check first?`,
      correct,
      distractors: all4.filter((d) => d.text !== correct),
      explanation:
        kind === 'omitted'
          ? `The gap equals the ${target.name} balance, so that balance (a ${lightWord} item) was probably left out of its column.`
          : kind === 'wrongColumn'
            ? `The gap, ${money(diff)}, is twice the ${target.name} balance of ${money(x)}: a ${lightWord} balance written in the ${heavyWord} column moves the gap by twice its amount.`
            : 'None of these balances equals the gap or half of it, so nothing points to one of them being omitted or misplaced. Re-check how the balances were found and brought to the trial balance.',
    };
  },
  verify: (q) => {
    const diff = amountsIn(q.prompt)[0];
    const list = readList(q.prompt);
    const t = correctText(q);
    if (list.some((l) => l.amt === diff)) return t.includes('left out of');
    if (list.some((l) => 2 * l.amt === diff)) return t.includes('entered in the');
    return t.startsWith('Re-check');
  },
});

const tbMisplacedTotal = numT({
  id: 'tb-misplaced-total',
  version: 2,
  conceptId: 'tb-misplaced',
  difficulty: 'medium',
  generate: (rng) => {
    const moved = rng.pick(['Dr', 'Cr'] as const);
    const acct = rng.pick((moved === 'Dr' ? DR : CR_NO_CAPITAL).filter((a) => !a.trap));
    const a = lineOf(rng, acct).amt;
    // Version 2: a column total a business with such a balance could have, the balance at most a sixth of it.
    const t = amount(rng, 500000, 2500000, 1000);
    if (a * 6 > t) return null;
    // A debit balance shown in the credit column: debit column short by a, credit column long by a.
    const [D, C] = moved === 'Dr' ? [t - a, t + a] : [t + a, t - a];
    const wrongCol: Side = other(moved);
    const ask = rng.pick(['Dr', 'Cr'] as const);
    const drawn = ask === 'Dr' ? D : C;
    // The balance is added to the column it belongs in and taken out of the other one.
    const delta = moved === ask ? a : -a;
    return {
      prompt: `A trial balance was drawn up with a debit column of ${money(D)} and a credit column of ${money(C)}. The accountant then finds that the ${acct.name} balance of ${money(a)} (a ${SIDE_WORD[moved]} balance) was shown in the ${SIDE_WORD[wrongCol]} column. Nothing else is wrong. What is the total of the ${SIDE_WORD[ask]} column after the correction?`,
      answer: t,
      commonErrors: [
        { value: drawn, why: 'Gave the total as first drawn up, without moving the balance.' },
        { value: drawn - delta, why: 'Moved the balance the wrong way: took it out of the column it belongs in and added it to the other.' },
        { value: D + C, why: 'Added the two columns instead of finding the corrected total of one column.' },
      ],
      explanation: [
        `The ${acct.name} balance belongs in the ${SIDE_WORD[moved]} column, so ${money(a)} is added to the ${SIDE_WORD[moved]} column and taken out of the ${SIDE_WORD[wrongCol]} column.`,
        `${SIDE_WORD[moved] === 'debit' ? 'Debit' : 'Credit'} column: ${money(moved === 'Dr' ? D : C)} + ${money(a)} = ${money(t)}.`,
        `${SIDE_WORD[wrongCol] === 'debit' ? 'Debit' : 'Credit'} column: ${money(moved === 'Dr' ? C : D)} - ${money(a)} = ${money(t)}.`,
      ],
    };
  },
  verify: (q) => {
    const [D, C] = amountsIn(q.prompt);
    return 2 * q.answer === D + C;
  },
});

const tbMisplacedAmount = numT({
  id: 'tb-misplaced-amount',
  version: 2,
  conceptId: 'tb-misplaced',
  difficulty: 'medium',
  generate: (rng) => {
    const t = amount(rng, 200000, 900000, 1000);
    const a = amount(rng, 2000, 60000, 500);
    const [D, C] = rng.pick([true, false]) ? [t + a, t - a] : [t - a, t + a];
    return {
      prompt: `The debit column of ${poss(biz(rng))} trial balance totals ${money(D)} and the credit column ${money(C)}. The books are otherwise correct, and the whole difference is due to one balance having been entered in the wrong column. What is the amount of that balance?`,
      answer: a,
      commonErrors: [
        { value: 2 * a, why: 'Gave the whole difference. A balance in the wrong column makes the gap twice its amount, so the balance is half the gap.' },
        { value: 4 * a, why: 'Doubled the difference instead of halving it.' },
        { value: t, why: 'Gave the corrected column total instead of the amount of the misplaced balance.' },
      ],
      explanation: [`Difference = ${money(Math.max(D, C))} - ${money(Math.min(D, C))} = ${money(2 * a)}.`, `A balance in the wrong column changes the gap by twice its amount, so the balance = ${money(2 * a)} / 2 = ${money(a)}.`],
    };
  },
  verify: (q) => {
    const [D, C] = amountsIn(q.prompt);
    return Math.abs(D - C) === 2 * q.answer;
  },
});

const tbMisplacedWhich = mcqT({
  id: 'tb-misplaced-which',
  version: 2,
  conceptId: 'tb-misplaced',
  difficulty: 'medium',
  generate: (rng) => {
    const items = pickMany(rng, ALL.filter((a) => a !== CAPITAL && !a.trap), 5);
    const lines = items.map((a) => lineOf(rng, a));
    const k = rng.int(0, 4);
    const decoy = (k + 1 + rng.int(0, 3)) % 5;
    const a = lines[k].amt;
    lines[decoy] = { ...lines[decoy], amt: 2 * a };
    if (new Set(lines.map((l) => l.amt)).size !== lines.length) return null;
    const target = lines[k];
    const base = Math.max(sideSum(lines, 'Dr'), sideSum(lines, 'Cr')) + amount(rng, 20000, 200000, 1000);
    const [D, C] = target.a.side === 'Cr' ? [base + a, base - a] : [base - a, base + a];
    const heavy = D > C ? 'debit' : 'credit';
    return {
      prompt: `${poss(biz(rng))} trial balance was first drawn up with a debit column of ${money(D)} and a credit column of ${money(C)}. The accountant suspects that one balance was put in the wrong column. Some of the ledger balances are:\n${listOf(rng.shuffle(lines))}\nWhich account is the likely culprit?`,
      correct: target.a.name,
      distractors: lines
        .filter((l) => l !== target)
        .map((l) => (l === lines[decoy]
          ? { text: l.a.name, why: 'Matched the balance to the whole difference. That would fit a balance left out, but the accountant suspects a balance in the wrong column, which makes a gap of twice its amount: the culprit is half the gap.' }
          : { text: l.a.name, why: 'Its amount is not half the difference between the columns, so it cannot account for the gap on its own.' })),
      explanation: `The gap is ${money(Math.abs(D - C))}. A balance in the wrong column causes a gap of twice its amount, so look for ${money(a)}: ${target.a.name}. The ${heavy} column is larger, which fits a ${SIDE_WORD[target.a.side]} balance put in the ${heavy} column the wrong way round.`,
    };
  },
  verify: (q) => {
    const [D, C] = amountsIn(q.prompt);
    const list = readList(q.prompt);
    const half = list.filter((l) => 2 * l.amt === Math.abs(D - C));
    return half.length === 1 && half[0].a.name === correctText(q);
  },
});

const tbCorrectedTwo = numT({
  id: 'tb-corrected-two',
  version: 2,
  conceptId: 'tb-misplaced',
  difficulty: 'complex',
  generate: (rng) => {
    const t = amount(rng, 500000, 2500000, 1000);
    const cAcct = rng.pick(CR_NO_CAPITAL.filter((x) => !x.trap));
    const dAcct = rng.pick(DR.filter((x) => !x.trap));
    // Version 2: each balance in the range of its own account (no Sales of ₹9,000), and at most a sixth of the total.
    const a = lineOf(rng, cAcct).amt;
    const b = lineOf(rng, dAcct).amt;
    if (a === b || a * 6 > t || b * 6 > t) return null;
    // The credit balance (a) was put in the debit column, the debit balance (b) in the credit column.
    const D = t + a - b;
    const C = t - a + b;
    return {
      prompt: `${poss(biz(rng))} trial balance was drawn up with a debit column of ${money(D)} and a credit column of ${money(C)}. The accountant finds two slips: ${cAcct.name}, a credit balance of ${money(a)}, was entered in the debit column, and ${dAcct.name}, a debit balance of ${money(b)}, was entered in the credit column. What is the total of each column once both slips are corrected?`,
      answer: t,
      commonErrors: [
        { value: D - a, why: `Corrected only the ${cAcct.name} slip in the debit column and forgot to move the ${dAcct.name} balance.` },
        { value: C - b, why: `Corrected only the ${dAcct.name} slip in the credit column and forgot to move the ${cAcct.name} balance.` },
        { value: D + a - b, why: 'Moved each balance the wrong way, adding to the column that already held it.' },
        { value: D + C, why: 'Added the two columns together.' },
      ],
      explanation: [
        `${cAcct.name} (credit): remove ${money(a)} from the debit column and add it to the credit column.`,
        `${dAcct.name} (debit): remove ${money(b)} from the credit column and add it to the debit column.`,
        `Debit column: ${money(D)} - ${money(a)} + ${money(b)} = ${money(t)}.`,
        `Credit column: ${money(C)} + ${money(a)} - ${money(b)} = ${money(t)}.`,
      ],
    };
  },
  verify: (q) => {
    const [D, C, a, b] = amountsIn(q.prompt);
    return D - a + b === q.answer && C + a - b === q.answer;
  },
});

const tbRecheckErrors = numT({
  id: 'tb-recheck-errors',
  version: 2,
  conceptId: 'tb-difference',
  difficulty: 'complex',
  generate: (rng) => {
    const r = amount(rng, 500, 5000, 500);
    const base = amount(rng, 300000, 800000, 1000);
    const a = amount(rng, 3000, 40000, 500);
    const b = amount(rng, 3000, 40000, 500);
    const c = amount(rng, 1000, 20000, 500);
    // After the three corrections: D' = base + r, C' = base. D = D' - a - b, C = C' + a - c.
    const D = base + r - a - b;
    const C = base + a - c;
    const [x, y] = pickMany(rng, DR.filter((z) => !z.trap), 2);
    return {
      prompt: `${poss(biz(rng))} trial balance was drawn up with a debit column of ${money(D)} and a credit column of ${money(C)}. Three slips are then found:\n(i) ${x.name}, a debit balance of ${money(a)}, was entered in the credit column.\n(ii) ${y.name}, a debit balance of ${money(b)}, was left out of the trial balance altogether.\n(iii) The credit column was added up ${money(c)} too low.\nAfter these three corrections, by how much do the two columns still differ?`,
      answer: r,
      commonErrors: [
        { value: Math.abs(D + a + b - (C + c)), why: `Moved ${x.name} into the debit column but forgot to take it out of the credit column.` },
        { value: Math.abs(D + a + b - (C - a - c)), why: 'Deducted the undercast from the credit column instead of adding it.' },
        { value: Math.abs(D - C), why: 'Ignored all three corrections.' },
        { value: Math.abs(D + b - (C - a + c)), why: `Did not move ${x.name} into the debit column, only out of the credit column.` },
      ],
      explanation: [
        `(i) Debit column + ${money(a)}; credit column - ${money(a)}.`,
        `(ii) Debit column + ${money(b)}.`,
        `(iii) Credit column + ${money(c)}.`,
        `Debit: ${money(D)} + ${money(a)} + ${money(b)} = ${money(D + a + b)}.`,
        `Credit: ${money(C)} - ${money(a)} + ${money(c)} = ${money(C - a + c)}.`,
        `Remaining difference = ${money(r)}.`,
      ],
    };
  },
  verify: (q) => {
    const [D, C, a, b, c] = amountsIn(q.prompt);
    return Math.abs(D + a + b - (C - a + c)) === q.answer;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Journal: clearing the suspense account once the error is found
// ---------------------------------------------------------------------------------------------------------------

const tbSuspenseJournal = jourT({
  id: 'tb-suspense-journal',
  version: 2,
  conceptId: 'tb-suspense',
  difficulty: 'medium',
  generate: (rng): JournalParts => {
    const x = amount(rng, 1000, 40000, 500);
    const [p] = rng.shuffle(PARTIES);
    const xs = money(x);
    const lead = 'The difference in a trial balance was carried to a Suspense A/c. Later the cause was found: ';
    const tail = ' Pass the entry that clears the Suspense A/c.';
    const scenarios: JournalParts[] = [
      {
        prompt: `${lead}a credit sale of ${xs} to ${p} was debited to ${poss(p)} account but the credit to Sales A/c was left out.${tail}`,
        lines: [{ accountId: 'suspense', side: 'Dr', amount: x }, { accountId: 'sales', side: 'Cr', amount: x }],
        explanation: ['The credit side was short, so Suspense A/c had been credited.', 'Sales A/c should have been credited: credit Sales A/c and debit Suspense A/c to clear it.'],
        distractorAccounts: [debtor(p), 'purchases'],
      },
      {
        prompt: `${lead}rent of ${xs} paid in cash was credited to Cash A/c but the debit to Rent A/c was left out.${tail}`,
        lines: [{ accountId: 'rent', side: 'Dr', amount: x }, { accountId: 'suspense', side: 'Cr', amount: x }],
        explanation: ['The debit side was short, so Suspense A/c had been debited.', 'Rent A/c should have been debited: debit Rent A/c and credit Suspense A/c to clear it.'],
        distractorAccounts: ['salaries'],
      },
      {
        prompt: `${lead}goods of ${xs} bought on credit from ${p} were debited to Purchases A/c but the credit to ${poss(p)} account was left out.${tail}`,
        lines: [{ accountId: 'suspense', side: 'Dr', amount: x }, { accountId: creditor(p), side: 'Cr', amount: x }],
        explanation: ['The credit side was short, so Suspense A/c had been credited.', `${p} should have been credited: credit ${p} and debit Suspense A/c to clear it.`],
        distractorAccounts: ['purchases'],
      },
      {
        prompt: `${lead}cash of ${xs} received from ${p}, a customer, was debited to Cash A/c but the credit to ${poss(p)} account was left out.${tail}`,
        lines: [{ accountId: 'suspense', side: 'Dr', amount: x }, { accountId: debtor(p), side: 'Cr', amount: x }],
        explanation: ['The credit side was short, so Suspense A/c had been credited.', `${poss(p)} account should have been credited: credit ${p} and debit Suspense A/c to clear it.`],
        distractorAccounts: ['sales'],
      },
      {
        prompt: `${lead}salaries of ${xs} paid by cheque were credited to Bank A/c but the debit to Salaries A/c was left out.${tail}`,
        lines: [{ accountId: 'salaries', side: 'Dr', amount: x }, { accountId: 'suspense', side: 'Cr', amount: x }],
        explanation: ['The debit side was short, so Suspense A/c had been debited.', 'Salaries A/c should have been debited: debit Salaries A/c and credit Suspense A/c to clear it.'],
        distractorAccounts: ['wages'],
      },
      {
        prompt: `${lead}discount of ${xs} allowed to ${p} was credited to ${poss(p)} account but the debit to Discount Allowed A/c was left out.${tail}`,
        lines: [{ accountId: 'discountAllowed', side: 'Dr', amount: x }, { accountId: 'suspense', side: 'Cr', amount: x }],
        explanation: ['The debit side was short, so Suspense A/c had been debited.', 'Discount Allowed A/c should have been debited: debit Discount Allowed A/c and credit Suspense A/c to clear it.'],
        distractorAccounts: ['discountReceived', debtor(p)],
      },
    ];
    return rng.pick(scenarios);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Formats: trial balances the student prepares, row by row.
// ---------------------------------------------------------------------------------------------------------------

const TB_COLUMNS = ['Debit (₹)', 'Credit (₹)'];
const TB_HEADING = 'Name of account';
const TB_YEAR = 2026;
/** The amount of a balance in its column of a trial balance. */
const inColumn = (side: Side, amt: Paise): Paise[] => (side === 'Dr' ? [amt, 0] : [0, amt]);

// The books of a trader, for a list of balances a whole trial balance is prepared from. (The lists of the questions
// above need only a few balances that agree; a trial balance to prepare must be one a business could have: capital,
// purchases and sales, the assets the capital went into, and capital itself as the balance that makes it agree.)
const PURCHASES = get('Purchases');
const SALES = get('Sales');
const DRAWINGS = get('Drawings');
const BAD_DEBTS = get('Bad debts');
const PROVISION = get('Provision for doubtful debts');
const PROVISION_DEP = get('Provision for depreciation');
const FMT_ASSETS = ['Cash in hand', 'Cash at bank', 'Sundry debtors', 'Furniture', 'Machinery', 'Land and building', 'Motor vehicle', 'Computers', 'Bills receivable', 'Opening stock', 'Investments', 'Goodwill'].map(get);
const FMT_EXPENSES = ['Carriage inwards', 'Wages', 'Rent paid', 'Salaries', 'Insurance premium', 'Stationery', 'Telephone expenses', 'Advertising', 'Interest paid', 'Carriage outwards', 'Commission paid', 'Repairs', 'Electricity charges'].map(get);
const FMT_LIABILITIES = [CREDITORS, BANK_LOAN, get('Bills payable')];
const FMT_INCOMES = ['Commission received', 'Rent received', 'Interest received'].map(get);
type FmtGroup = 'asset' | 'expense' | 'capital' | 'liability' | 'income';
/** What each plain balance is, for the working. The balances students misplace are explained one by one instead. */
const FMT_GROUP = new Map<Acct, FmtGroup>([
  ...FMT_ASSETS.map((a): [Acct, FmtGroup] => [a, 'asset']),
  ...[PURCHASES, ...FMT_EXPENSES].map((a): [Acct, FmtGroup] => [a, 'expense']),
  [CAPITAL, 'capital'],
  ...FMT_LIABILITIES.map((a): [Acct, FmtGroup] => [a, 'liability']),
  ...[SALES, ...FMT_INCOMES].map((a): [Acct, FmtGroup] => [a, 'income']),
]);
/** Names a student may take one for the other. */
const FMT_TWINS: [string, string][] = [
  ['Sales returns', 'Purchases returns'],
  ['Discount allowed', 'Discount received'],
  ['Bills receivable', 'Bills payable'],
  ['Sundry debtors', 'Sundry creditors'],
  ['Rent paid', 'Rent received'],
  ['Interest paid', 'Interest received'],
  ['Bank overdraft', 'Cash at bank'],
  ['Commission paid', 'Commission received'],
  ['Carriage outwards', 'Carriage inwards'],
];

/**
 * The year-end balances of a trader, the two columns agreeing: Purchases, Sales (more than the purchases), two or
 * three assets, an expense, a liability or an income, one or two of each kind of balance that students misplace, and
 * Capital as the balance that makes the columns agree. Bad debts and a provision come only with debtors, and an
 * overdraft never beside money at the bank.
 */
function tradersBalances(rng: Rng): Ln[] | null {
  for (let go = 0; go < 30; go++) {
    const drTraps = pickMany(rng, DR_TRAPS, rng.int(1, 2));
    const crTraps = pickMany(rng, CR_TRAPS, rng.int(1, 2));
    const traps = [...drTraps, ...crTraps];
    const forced = [
      ...(traps.includes(BAD_DEBTS) || traps.includes(PROVISION) ? [DEBTORS] : []),
      ...(traps.includes(PROVISION_DEP) ? [MACHINERY] : []),
    ];
    // Outstanding salaries come with Salaries A/c, prepaid insurance with the insurance premium.
    const expenses = traps.map(parentOf).filter((p): p is Acct => p !== undefined && FMT_EXPENSES.includes(p));
    const pool = FMT_ASSETS.filter((a) => !(a === BANK && traps.includes(OVERDRAFT)));
    const assets = [...forced, ...pickMany(rng, pool, Math.max(0, rng.int(2, 3) - forced.length), forced)];
    const purchases = lineOf(rng, PURCHASES);
    const sales: Ln = { a: SALES, amt: amount(rng, Math.max(SALES.min, purchases.amt / 100 + 20000), SALES.max, SALES.step) };
    const rest = [...assets, ...(expenses.length > 0 ? expenses : pickMany(rng, FMT_EXPENSES, 1)), ...drTraps, ...pickMany(rng, [...FMT_LIABILITIES, ...FMT_INCOMES], 1), ...crTraps].map((a) => lineOf(rng, a));
    const lines = [purchases, sales, ...rest];
    // Capital is what makes the columns agree: a believable capital, at least twice the year's drawings.
    const capital = sideSum(lines, 'Dr') - sideSum(lines, 'Cr');
    const drawings = lines.find((l) => l.a === DRAWINGS)?.amt ?? 0;
    if (capital < rupees(100000) || capital > rupees(1500000) || capital < 2 * drawings) continue;
    return [...lines, { a: CAPITAL, amt: capital }];
  }
  return null;
}

// tb-fmt-balances: a trial balance from a list of ledger balances, the column of each to be decided (easy)
const fmtBalances = statementTemplate({
  id: 'tb-fmt-balances',
  // Version 2: the balances students misplace now include prepaid insurance, a loan to an employee, outstanding
  // salaries and the provision for depreciation, and the assets and expenses include investments, goodwill,
  // carriage outwards, commission paid, repairs and electricity.
  version: 2,
  topicId: T,
  conceptId: 'tb-formats',
  difficulty: 'easy',
  generate: (rng) => {
    const lines = tradersBalances(rng);
    if (!lines) return null;
    const name = biz(rng);
    const shown = rng.shuffle(lines);
    const date = `31 March ${TB_YEAR}`;
    const used = new Set(shown.map((l) => l.a.name));
    const total = sideSum(shown, 'Dr');
    // Half the time the closing stock is given below the balances, as an examiner gives it: it is not a ledger balance.
    const closingStock = rng.next() < 0.5 ? amount(rng, 20000, 150000, 1000) : 0;
    const note = closingStock ? `\nAdditional information: the closing stock on ${date} was valued at ${money(closingStock)}. No entry has been passed for it.` : '';
    const group = (kind: FmtGroup) => shown.filter((l) => FMT_GROUP.get(l.a) === kind).map((l) => l.a.name);
    const twins = FMT_TWINS.flatMap(([a, b]) => (used.has(a) !== used.has(b) ? [used.has(a) ? b : a] : []));
    return {
      task: `Prepare the Trial Balance of ${name} as on ${date}.`,
      data: `${name} took these balances from its ledger on ${date}:\n${listOf(shown)}${note}`,
      title: `Trial Balance of ${name} as on ${date}`,
      heading: TB_HEADING,
      columns: TB_COLUMNS,
      totalsAgree: true,
      rows: shown.map((l) => ({ label: l.a.name, amounts: inColumn(l.a.side, l.amt) })),
      // Closing stock, which is not a ledger balance; a Suspense A/c, which a trial balance that agrees does not need;
      // and the name a student may confuse with one in the list (discount received beside discount allowed).
      distractors: ['Closing stock', 'Suspense A/c', ...twins],
      explanation: [
        `Assets and expenses are debit balances: ${[...group('asset'), ...group('expense')].join(', ')}.`,
        `Capital, liabilities and incomes are credit balances: ${[...group('capital'), ...group('liability'), ...group('income')].join(', ')}.`,
        ...shown.filter((l) => l.a.trap).map((l) => `${l.a.name} is ${l.a.kind}: a ${SIDE_WORD[l.a.side]} balance.`),
        ...(closingStock ? ['Closing stock is left out. It is not a ledger balance: it is brought into the books only when the final accounts are prepared.'] : []),
        colLine(shown, 'Dr'),
        colLine(shown, 'Cr'),
        `Both columns total ${money(total)}, so the trial balance agrees.`,
      ],
      hints: [
        'Decide what each account is before you place it: an asset, an expense, a liability, capital or an income.',
        'Assets, expenses, losses and drawings are debit balances. Liabilities, capital, incomes and gains are credit balances. Returns go opposite to the account they reduce. Only ledger balances are listed.',
      ],
    };
  },
  // Read back from the list the student sees: every balance in the column of its account, the columns agreeing, the
  // books those of a trader (capital, purchases and sales among them), and no stock but the opening stock.
  verify: (q: StatementQuestion) => {
    const list = readList(q.data);
    if (list.length !== q.rows.length || sideSum(list, 'Dr') !== sideSum(list, 'Cr')) return false;
    if (![CAPITAL, PURCHASES, SALES].every((a) => list.some((l) => l.a === a)) || q.rows.some((r) => /closing stock/i.test(r.label))) return false;
    const totals = columnTotals(q.rows, 2);
    return totals[0] === sideSum(list, 'Dr') && list.every((l) => q.rows.some((r) => r.label === l.a.name && r.amounts.join() === inColumn(l.a.side, l.amt).join()));
  },
});

// tb-fmt-transactions: a trial balance by the balance method from the transactions of a first month (complex)
const keptEntries = keepFor<DatedEntry[]>();
const D = (accountId: string, amt: Paise): JournalLine => ({ accountId, side: 'Dr', amount: amt });
const C = (accountId: string, amt: Paise): JournalLine => ({ accountId, side: 'Cr', amount: amt });

interface Tx {
  text: string;
  lines: JournalLine[];
}

const fmtTransactions = statementTemplate({
  id: 'tb-fmt-transactions',
  topicId: T,
  conceptId: 'tb-formats',
  difficulty: 'complex',
  generate: (rng) => {
    const name = biz(rng);
    const [supplier, customer] = rng.shuffle(PARTIES);
    const sup = creditor(supplier);
    const cus = debtor(customer);
    const x = (min: number, max: number, step: number) => amount(rng, min, max, step);
    const tx = (text: string, ...lines: JournalLine[]): Tx => ({ text, lines });
    const capital = x(200000, 500000, 50000);
    const banked = x(80000, 150000, 10000);
    // More is bought than is sold in the month: a new shop sells out of what it has bought, and some stock is left.
    const creditBuy = x(50000, 100000, 5000);
    const creditSale = x(30000, 70000, 5000);
    // Sometimes the customer pays in full: the account is then closed, and has no place in the trial balance.
    const paidInFull = rng.next() < 0.35;
    const received = paidInFull ? creditSale : x(10000, creditSale / 100 - 10000, 5000);
    const paid = x(10000, creditBuy / 100 - 10000, 5000);
    const byCheque = rng.next() < 0.5;
    const start = tx(`Started business with cash of ${money(capital)}.`, D('cash', capital), C('capital', capital));
    // Each thread keeps its own order: the bank account is opened before a cheque is issued, goods are bought before they are paid for.
    const bank: Tx[] = [tx(`Opened a bank account and paid in cash of ${money(banked)}.`, D('bank', banked), C('cash', banked))];
    if (rng.next() < 0.6) {
      const a = x(15000, 40000, 5000);
      bank.push(tx(`Bought furniture for the shop for ${money(a)} and paid by cheque.`, D('furniture', a), C('bank', a)));
    }
    const buying: Tx[] = [
      tx(`Bought goods for ${money(creditBuy)} from ${supplier} on credit.`, D('purchases', creditBuy), C(sup, creditBuy)),
      tx(`Paid ${money(paid)} to ${supplier} ${byCheque ? 'by cheque' : 'in cash'} on account.`, D(sup, paid), C(byCheque ? 'bank' : 'cash', paid)),
    ];
    const selling: Tx[] = [
      tx(`Sold goods for ${money(creditSale)} to ${customer} on credit.`, D(cus, creditSale), C('sales', creditSale)),
      tx(`Received ${money(received)} in cash from ${customer}${paidInFull ? ', the whole amount due' : ' on account'}.`, D('cash', received), C(cus, received)),
    ];
    const cashBuy = x(15000, 40000, 1000);
    const cashSale = x(10000, 30000, 1000);
    const rent = x(4000, 9000, 500);
    const singles: Tx[] = [
      tx(`Bought goods for cash, ${money(cashBuy)}.`, D('purchases', cashBuy), C('cash', cashBuy)),
      tx(`Sold goods for cash, ${money(cashSale)}.`, D('cash', cashSale), C('sales', cashSale)),
      tx(`Paid rent of the shop in cash, ${money(rent)}.`, D('rent', rent), C('cash', rent)),
    ];
    const extras: (() => Tx)[] = [
      () => {
        const a = x(8000, 15000, 500);
        return tx(`Paid salaries in cash, ${money(a)}.`, D('salaries', a), C('cash', a));
      },
      () => {
        const a = x(3000, 9000, 500);
        return tx(`The owner withdrew cash of ${money(a)} for personal use.`, D('drawings', a), C('cash', a));
      },
      () => {
        const a = x(1000, 5000, 500);
        return tx(`Received commission of ${money(a)} in cash.`, D('cash', a), C('commissionReceived', a));
      },
    ];
    singles.push(...rng.shuffle(extras).slice(0, rng.int(1, 3)).map((make) => make()));
    // A story that can happen: neither the cash in hand nor the money at the bank runs out on the way, and a business
    // that starts with cash alone has bought goods before it sells any (what has been sold so far, at selling price,
    // never comes to more than what has been bought so far).
    const canHappen = (order: Tx[]): boolean => {
      const so = { cash: 0, bank: 0, bought: 0, sold: 0 };
      for (const t of order) {
        for (const l of t.lines) {
          if (l.accountId === 'cash' || l.accountId === 'bank') so[l.accountId] += l.side === 'Dr' ? l.amount : -l.amount;
          if (l.accountId === 'purchases') so.bought += l.amount;
          if (l.accountId === 'sales') so.sold += l.amount;
        }
        if (so.cash < 0 || so.bank < 0 || so.sold > so.bought) return false;
      }
      return true;
    };
    // A few orders are tried before the seed is given up: most orders of these threads put a sale before a purchase.
    let rest: Tx[] | null = null;
    for (let go = 0; go < 20 && !rest; go++) {
      const order = interleave(rng, [bank, buying, selling, ...singles.map((s) => [s])]);
      if (canHappen([start, ...order])) rest = order;
    }
    if (!rest) return null;
    const days = setDays(rng, rest.length, 2, 29);
    const all = [start, ...rest];
    const entries: DatedEntry[] = all.map((t, i) => ({ date: `${i === 0 ? 1 : days[i - 1]} April`, lines: t.lines }));
    // The balance method, account by account, in the order the accounts are opened.
    const ids = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.accountId)))];
    const views = ids.map((id) => accountOf(entries, id));
    const sumOf = (ps: { amount: Paise }[]) => sum(ps.map((p) => p.amount));
    const rows = views.flatMap((v) => (v.balance ? [{ label: ledgerLabel(v.accountId), amounts: inColumn(v.balance.side, v.balance.amount) }] : []));
    const date = `30 April ${TB_YEAR}`;
    const data = `${name} started business on 1 April ${TB_YEAR}. These are its transactions of April:\n${all.map((t, i) => `${entries[i].date}: ${t.text}`).join('\n')}`;
    keptEntries.keep(data, entries);
    return {
      task: `Prepare the Trial Balance of ${name} as on ${date} by the balance method. Leave out an account that has no balance.`,
      data,
      title: `Trial Balance of ${name} as on ${date}`,
      heading: TB_HEADING,
      columns: TB_COLUMNS,
      totalsAgree: true,
      rows,
      // An account that was closed is still on offer: listing it is the slip the task warns against.
      distractors: [...views.filter((v) => !v.balance).map((v) => ledgerLabel(v.accountId)), ledgerLabel(cus), 'Suspense A/c', 'Purchases Return A/c', 'Discount Allowed A/c', 'Stock A/c'],
      explanation: [
        'Post every transaction to its two accounts, then balance each account: the larger side less the smaller side.',
        ...views.map((v) => {
          const label = ledgerLabel(v.accountId);
          if (!v.balance) return `${label}: debits ${money(sumOf(v.debit))}, credits ${money(sumOf(v.credit))}; no balance, so it is left out.`;
          // An account posted on one side only: its balance is the total of that side.
          if (v.debit.length === 0 || v.credit.length === 0) return `${label}: ${SIDE_WORD[v.balance.side]}s only; a ${SIDE_WORD[v.balance.side]} balance of ${money(v.balance.amount)}.`;
          return `${label}: debits ${money(sumOf(v.debit))}, credits ${money(sumOf(v.credit))}; a ${SIDE_WORD[v.balance.side]} balance of ${money(v.balance.amount)}.`;
        }),
        'There is no Stock A/c: goods bought stand in Purchases A/c and goods sold in Sales A/c, and the goods left unsold are valued only when the final accounts are prepared.',
        `Both columns total ${money(sum(rows.map((r) => r.amounts[0])))}, so the trial balance agrees.`,
      ],
      hints: [
        'Post each transaction to its two accounts first. Then take the accounts one at a time: which side is larger, and by how much?',
        'By the balance method only the balance of each account is listed: a debit balance in the debit column, a credit balance in the credit column. An account whose two sides are equal is left out.',
      ],
    };
  },
  // Worked out again by netting every posting into one figure per account (`post`), where `generate` balanced each account.
  verify: (q: StatementQuestion) => {
    const entries = keptEntries.of(q.data);
    if (!entries) return false;
    const tb = trialBalance(post(entries.map((e) => e.lines)));
    if (tb.debitTotal !== tb.creditTotal || tb.rows.length !== q.rows.length) return false;
    const totals = columnTotals(q.rows, 2);
    return totals[0] === tb.debitTotal && totals[1] === tb.creditTotal && tb.rows.every((r) => q.rows.some((row) => row.label === ledgerLabel(r.accountId) && row.amounts.join() === inColumn(r.side, r.amount).join()));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// tb-fmt-redraft, tb-fmt-redraft-stock: a clerk's trial balance with balances in the wrong column, to be redrafted.
// Added after the papers were set (outsidePapers keeps them off the papers, worksheets and Look back levels).
// ---------------------------------------------------------------------------------------------------------------

const ADJUSTED_PURCHASES = 'Adjusted purchases';
const CLOSING_STOCK = 'Closing stock';
const OPENING_STOCK = get('Opening stock');
/** The side of a balance named in a redraft: the bank's accounts, and the two lines an adjusted trial balance adds. */
const redraftSide = (name: string): Side | undefined => (name === ADJUSTED_PURCHASES || name === CLOSING_STOCK ? 'Dr' : BY_NAME.get(name)?.side);
const REDRAFT_NOTE = 'Carry any difference that remains, once every balance is in its right column, to a Suspense A/c.';

interface RedraftLine {
  name: string;
  amt: Paise;
  side: Side;
  kind: string;
}

/** The clerk's two columns as the data prints them: "Debit column:" and "Credit column:", a balance to a line. */
function readRedraft(data: string): RedraftLine[] | null {
  const out: RedraftLine[] = [];
  let column: Side | undefined;
  for (const line of data.split('\n')) {
    if (line === 'Debit column:') column = 'Dr';
    else if (line === 'Credit column:') column = 'Cr';
    else if (line.startsWith('Totals as drawn up')) column = undefined;
    else if (column) {
      const m = /^(.+): (₹[\d,]+)$/.exec(line);
      const amt = m ? parseRupees(m[2]) : null;
      const side = m ? redraftSide(m[1]) : undefined;
      if (!m || amt == null || !side) return null;
      out.push({ name: m[1], amt, side, kind: '' });
    }
  }
  return out;
}

function redraftTemplate(id: string, difficulty: 'medium' | 'complex', withStock: boolean): Template {
  return statementTemplate({
    id,
    topicId: T,
    conceptId: 'tb-formats',
    difficulty,
    generate: (rng) => {
      const traders = tradersBalances(rng);
      if (!traders) return null;
      let lines: RedraftLine[] = traders.map((l) => ({ name: l.a.name, amt: l.amt, side: l.a.side, kind: l.a.kind }));
      let stockNote = '';
      if (withStock) {
        // Closing stock has been brought into the books by adjusting the purchases: the trial balance shows adjusted
        // purchases and closing stock, both debits, and no opening stock.
        const purchases = lines.find((l) => l.name === 'Purchases')!;
        const opening = lines.find((l) => l.name === OPENING_STOCK.name)?.amt ?? 0;
        const closing = amount(rng, 20000, 120000, 1000);
        const adjusted = opening + purchases.amt - closing;
        // The stock left at the year end is a part of what was there to sell, not most of it.
        if (adjusted < rupees(50000) || closing * 3 > opening + purchases.amt) return null;
        lines = [
          ...lines.filter((l) => l.name !== 'Purchases' && l.name !== OPENING_STOCK.name),
          { name: ADJUSTED_PURCHASES, amt: adjusted, side: 'Dr', kind: 'the purchases adjusted for the opening and closing stock (an expense)' },
          { name: CLOSING_STOCK, amt: closing, side: 'Dr', kind: 'an asset already brought into the books' },
        ];
        stockNote = opening
          ? ` The closing stock (${money(closing)}) has been adjusted through the purchases: adjusted purchases = opening stock ${money(opening)} + purchases ${money(purchases.amt)} - closing stock ${money(closing)}.`
          : ` The closing stock (${money(closing)}) has been adjusted through the purchases: adjusted purchases = purchases ${money(purchases.amt)} - closing stock ${money(closing)}.`;
      }
      // Half the time an error in the ledger, not yet found, leaves a difference for the Suspense A/c.
      let suspense: { side: Side; amt: Paise } | undefined;
      if (rng.next() < 0.5) {
        // Never the adjusted purchases: the data states how that figure is worked out, so a changed figure would
        // contradict it.
        const pool = lines.filter((l) => l.name !== 'Capital' && l.name !== CLOSING_STOCK && l.name !== ADJUSTED_PURCHASES);
        const hit = rng.pick(pool);
        const delta = amount(rng, 2000, 20000, 500);
        const up = rng.next() < 0.5 || hit.amt - delta < rupees(1000);
        hit.amt += up ? delta : -delta;
        // The column the changed balance stands in grows (or shrinks): Suspense makes up the short column.
        suspense = { side: up === (hit.side === 'Dr') ? 'Cr' : 'Dr', amt: delta };
      }
      // The clerk's slips: four to six balances, the look-alikes first, written in the other column.
      const looks = rng.shuffle(lines.filter((l) => l.name === CLOSING_STOCK || BY_NAME.get(l.name)?.trap));
      const plain = rng.shuffle(lines.filter((l) => !looks.includes(l) && l.name !== 'Capital'));
      const n = rng.int(4, 6);
      const moved = new Set([...looks, ...plain].slice(0, n));
      if (moved.size < 4) return null;
      const shown = rng.shuffle(lines);
      const clerk = (s: Side) => shown.filter((l) => (moved.has(l) ? other(l.side) : l.side) === s);
      const clerkTotal = (s: Side) => sum(clerk(s).map((l) => l.amt));
      if (clerkTotal('Dr') === clerkTotal('Cr')) return null;
      const name = biz(rng);
      const date = `31 March ${TB_YEAR}`;
      const list = (ls: RedraftLine[]) => ls.map((l) => `${l.name}: ${money(l.amt)}`).join('\n');
      const data =
        `The accountant of ${name} drew up this trial balance on ${date}. Some balances are in the wrong column, and the columns do not agree.${stockNote}\n` +
        `Debit column:\n${list(clerk('Dr'))}\nCredit column:\n${list(clerk('Cr'))}\n` +
        `Totals as drawn up: debit ${money(clerkTotal('Dr'))}, credit ${money(clerkTotal('Cr'))}.\n${REDRAFT_NOTE}`;
      const rows = [
        ...shown.map((l) => ({ label: l.name, amounts: inColumn(l.side, l.amt) })),
        ...(suspense ? [{ label: 'Suspense A/c', amounts: inColumn(suspense.side, suspense.amt) }] : []),
      ];
      const used = new Set(shown.map((l) => l.name));
      const twins = FMT_TWINS.flatMap(([a, b]) => (used.has(a) !== used.has(b) ? [used.has(a) ? b : a] : []));
      const drTotal = sum(rows.map((r) => r.amounts[0]));
      const right = (s: Side) => sum(lines.filter((l) => l.side === s).map((l) => l.amt));
      return {
        task: `Redraft the Trial Balance of ${name} as on ${date} correctly.`,
        data,
        title: `Trial Balance of ${name} as on ${date} (redrafted)`,
        heading: TB_HEADING,
        columns: TB_COLUMNS,
        totalsAgree: true,
        rows,
        distractors: [...(suspense ? [] : ['Suspense A/c']), withStock ? OPENING_STOCK.name : 'Closing stock', 'Profit and Loss A/c', ...twins],
        explanation: [
          'Decide the column of each balance from what the account is, not from where the accountant wrote it.',
          ...[...moved].map((l) => `${l.name} is ${l.kind || 'a balance'}: it belongs in the ${SIDE_WORD[l.side]} column, not the ${SIDE_WORD[other(l.side)]} column.`),
          ...(withStock ? ['With the purchases adjusted, closing stock is a debit balance inside the trial balance and opening stock no longer appears.'] : []),
          `Debit balances total ${money(right('Dr'))}; credit balances total ${money(right('Cr'))}.`,
          suspense
            ? `The ${SIDE_WORD[suspense.side]} column is short by ${money(suspense.amt)}: that difference goes to a Suspense A/c in the ${SIDE_WORD[suspense.side]} column, and both columns total ${money(drTotal)}.`
            : `The columns now agree at ${money(drTotal)}, so no Suspense A/c is needed.`,
        ],
        hints: [
          'Ignore the columns the accountant used. Take each balance and ask what it is: an asset, an expense, a loss or drawings, or capital, a liability, an income or a provision.',
          'Put every balance in its own column and total both. If they still differ, the difference goes to a Suspense A/c in the column that is short.',
        ],
      };
    },
    // Read back from the clerk's columns: each balance goes to the side its account has, whatever column it was in,
    // and Suspense A/c (if any) makes up the column that is short.
    verify: (q: StatementQuestion) => {
      const read = readRedraft(q.data);
      if (!read) return false;
      const dr = sum(read.filter((l) => l.side === 'Dr').map((l) => l.amt));
      const cr = sum(read.filter((l) => l.side === 'Cr').map((l) => l.amt));
      const rowsOk = read.every((l) => q.rows.some((r) => r.label === l.name && r.amounts.join() === inColumn(l.side, l.amt).join()));
      const susp = q.rows.find((r) => r.label === 'Suspense A/c');
      const expected = dr === cr ? undefined : inColumn(dr > cr ? 'Cr' : 'Dr', Math.abs(dr - cr)).join();
      return rowsOk && q.rows.length === read.length + (expected ? 1 : 0) && susp?.amounts.join() === expected;
    },
  });
}

const fmtRedraft = redraftTemplate('tb-fmt-redraft', 'medium', false);
const fmtRedraftStock = redraftTemplate('tb-fmt-redraft-stock', 'complex', true);

const formats: Template[] = [fmtBalances, fmtTransactions];

const templates: Template[] = [
  // Easy
  tbMethod,
  tbObjective,
  tbAgreeConclusion,
  tbColAccount,
  tbColCount,
  tbAccountBalance,
  tbClosingStock,
  tbTotalColumn,
  tbMissingEasy,
  tbMethodBalance,
  tbSuspenseAmount,
  tbSuspenseSide,
  tbErrorAgree,
  tbErrorRevealed,
  // Medium
  tbColGroup,
  tbTotalMedium,
  tbMissingTrap,
  tbTotalsMethod,
  tbSuspenseFromList,
  tbTotalWithSuspense,
  tbMisplacedTotal,
  tbMisplacedAmount,
  tbMisplacedWhich,
  tbErrorNotRevealed,
  tbErrorDiff,
  tbLocateClue,
  tbSuspenseSideError,
  tbSuspenseJournal,
  // Complex
  tbSuspenseRemaining,
  tbCorrectedTwo,
  tbMissingDistractor,
  tbDerivedBalance,
  tbRecheckErrors,
  tbNetEffect,
  tbNetEffectSide,
  // Trial balances to prepare
  ...formats,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'tb', topicId: 'trial-balance', conceptId: 'tb-purpose',
  items: [
    {
      answer: 'explains',
      a: 'Closing stock given as an adjustment below a trial balance is not listed in it.',
      r: 'A trial balance lists ledger balances, and closing stock is not yet in any ledger account.',
      aWhy: 'Listing it would make the two columns disagree.',
      rWhy: 'Closing stock is valued at the year end and is not in the ledger until the final accounts are prepared.',
      link: 'It is left out because it is not a ledger balance, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'Drawings of ₹20,000 go in the debit column of a trial balance.',
      r: 'Drawings are deducted from capital, so they carry the opposite balance to capital.',
      aWhy: 'Drawings A/c has a debit balance.',
      rWhy: 'Capital has a credit balance, and an account deducted from it runs the other way.',
      link: 'The debit column follows from drawings being a reduction of capital, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'An account whose two sides are equal is left out of a trial balance prepared by the balance method.',
      r: 'The balance method lists each account at its balance, and such an account has no balance.',
      aWhy: 'There is no figure to enter for it.',
      rWhy: 'A balance is the difference between the two sides, and here the difference is nil.',
      link: 'With no balance there is nothing to list, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'When the debit column totals ₹5,60,000 and the credit column ₹5,40,000, a Suspense A/c of ₹20,000 is shown in the credit column.',
      r: 'The difference is entered in the shorter column, so that the two columns agree.',
      aWhy: 'The credit column is the shorter one, by ₹20,000.',
      rWhy: 'A figure entered in the longer column would only widen the gap.',
      link: 'The credit column takes it because it is the shorter column, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A balance of ₹7,000 written in the wrong column makes the two totals differ by ₹14,000.',
      r: 'The balance is missing from one column and added to the other.',
      aWhy: 'The gap is twice the balance: 2 × ₹7,000 = ₹14,000.',
      rWhy: 'One column is short by the balance and the other is over by it.',
      link: 'Those two effects together make the difference of twice the amount, so R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'Purchases returns go in the credit column of a trial balance.',
      r: 'Sales returns go in the debit column of a trial balance.',
      aWhy: 'Purchases return reduces purchases, which is a debit balance, so it is a credit balance.',
      rWhy: 'Sales return reduces sales, which is a credit balance, so it is a debit balance.',
      link: 'Each return goes opposite to the account it reduces. Where sales returns go does not decide where purchases returns go.',
    },
    {
      answer: 'not-the-reason',
      a: 'A trial balance is not one of the financial statements.',
      r: 'A trial balance is prepared on a particular date.',
      aWhy: 'It is a working statement between the ledger and the final accounts.',
      rWhy: 'A trial balance is headed "as on" a date.',
      link: 'A balance sheet is prepared on a date too, and it is a financial statement, so the date is not the reason.',
    },
    {
      answer: 'not-the-reason',
      a: 'A difference equal to one of the balances suggests that the balance was probably left out.',
      r: 'A balance in the wrong column changes the gap by twice its amount.',
      aWhy: 'A balance left out shortens one column by its amount.',
      rWhy: 'It is missing from one column and added to the other.',
      link: 'R is about a different slip, which is looked for when the difference is twice a balance.',
    },
    {
      answer: 'a-only',
      a: 'Agreement of the two columns does not prove that the books are free from errors.',
      r: 'A transaction left out of the books altogether upsets the agreement of the trial balance.',
      aWhy: 'Some errors leave the total debits equal to the total credits.',
      rWhy: 'A complete omission leaves out a debit and a credit alike, so the totals still agree.',
    },
    {
      answer: 'a-only',
      a: 'A provision for doubtful debts of ₹5,000 goes in the credit column.',
      r: 'Provision for Doubtful Debts A/c normally has a debit balance, like Debtors A/c.',
      aWhy: 'A provision has a credit balance.',
      rWhy: 'It is deducted from debtors, so it runs opposite to them, with a credit balance.',
    },
    {
      answer: 'r-only',
      a: 'A trial balance shows the net profit of the year.',
      r: 'A trial balance is a working statement drawn up between the ledger and the final accounts.',
      aWhy: 'It only lists the ledger balances; the net profit is found in the Profit and Loss Account.',
      rWhy: 'It gathers the balances from which the final accounts are prepared.',
    },
    {
      answer: 'r-only',
      a: 'An opening stock of ₹30,000 goes in the credit column.',
      r: 'Opening stock is a debit balance in the ledger.',
      aWhy: 'Opening stock goes in the debit column.',
      rWhy: 'It is an asset brought forward from the last year.',
    },
  ],
});

// The redrafts were added after the papers were set: they stand last, so no template before them moves.
const withAssertionReason: Template[] = [...templates, assertionReason, fmtRedraft, fmtRedraftStock];

export default withAssertionReason;
