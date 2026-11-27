import type { AccountQuestion, NumericUnit, StatementQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, post, postingsOf, type DatedEntry } from '@/engine/books';
import type { FormatRow } from '@/engine/formats';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { amount, caseTemplate, formatINR, interleave, ledgerSides, percentOf, rupees, setDays, type CasePart, type Paise } from '../authoring';
import { MAX_ATTEMPTS, attemptRng, parseGenId } from '../engine';
import { BRS_CHAIN, type BrsSetItem, type Item as BrsItem } from '../templates/bank-reconciliation';
import { CB_CHAIN, type CashBookDeal, type CashBookPlan, type PettyItem } from '../templates/cash-book';
import type { AccountParts, CaseAccountParts, CaseStatementParts, CaseTemplate, Distractor, McqParts, NumericParts } from '../types';

/**
 * Case studies of the stage "Cash book to bank reconciliation". They keep to the conventions of the cash book and
 * bank reconciliation templates, and say each one in the case text:
 * - a cheque banked on the day it is received goes straight into the bank column; one that is held back is treated
 *   as cash until it is deposited, and the deposit is then a contra entry;
 * - a balance is "favourable" or an "overdraft"; an overdraft is a credit balance in the cash book (bank column)
 *   and a debit balance in the pass book;
 * - what the firm learns only from the pass book is not yet in the cash book;
 * - petty cash is kept on the imprest system, and the amount handed over is one credit entry in the main cash book.
 */

const T = 'bank-reconciliation';
const C = 'brs-case';
const fmt = formatINR;
const sum = (xs: readonly number[]): number => xs.reduce((t, x) => t + x, 0);
const dr = (accountId: string, value: Paise): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: Paise): JournalLine => ({ accountId, side: 'Cr', amount: value });
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** Possessive of a name: Kiran's, Sharma Bros'. */
const poss = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];
const plus = (xs: readonly Paise[]) => (xs.length === 1 ? fmt(xs[0]) : `${xs.map(fmt).join(' + ')} = ${fmt(sum(xs))}`);

const FIRMS: { firm: string; owner: string }[] = [
  { firm: 'Shanti Stationers', owner: 'Shanti' },
  { firm: 'Bhaskar Hardware', owner: 'Bhaskar' },
  { firm: 'Fatima Garments', owner: 'Fatima' },
  { firm: 'Gurpreet Auto Spares', owner: 'Gurpreet' },
  { firm: 'Lata Sweets', owner: 'Lata' },
  { firm: 'Joseph Electricals', owner: 'Joseph' },
  { firm: 'Nandini Book House', owner: 'Nandini' },
  { firm: 'Imran Footwear', owner: 'Imran' },
  { firm: 'Parvati Saree Centre', owner: 'Parvati' },
  { firm: 'Dinesh Medical Stores', owner: 'Dinesh' },
];
const CUSTOMERS = ['Mohan', 'Kiran', 'Anita Traders', 'Verma & Sons', 'Meena Stores', 'Suresh', 'Farida'];
const SUPPLIERS = ['Rao & Co.', 'Sharma Bros', 'Lakshmi Agencies', 'Iyer Suppliers', 'Deepak Traders'];
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'January', 'February'];
const CLOSING_DATES = ['31 March', '30 June', '30 September', '31 December'];

/** Names for one case: no customer or supplier is used twice. */
interface People {
  cust(): string;
  sup(): string;
}
function people(rng: Rng): People {
  const customers = rng.shuffle(CUSTOMERS);
  const suppliers = rng.shuffle(SUPPLIERS);
  let i = 0;
  let j = 0;
  return { cust: () => customers[i++ % customers.length], sup: () => suppliers[j++ % suppliers.length] };
}

// ---------------------------------------------------------------------------------------------------------------
// Wrong answers, choices and the independent check.
// ---------------------------------------------------------------------------------------------------------------

interface Err {
  value: number;
  why: string;
}

/** Positive, distinct and not the answer, at most six; null when fewer than two are left (the seed is rejected). */
function tidy(answer: number, list: readonly Err[]): Err[] | null {
  const seen = new Set([answer]);
  const out = list.filter((e) => Number.isSafeInteger(e.value) && e.value > 0 && !seen.has(e.value) && seen.add(e.value)).slice(0, 6);
  return out.length >= 2 ? out : null;
}

/** A choice question whose wrong options are distinct; null when fewer than three are left. */
function choice(parts: McqParts): McqParts | null {
  const seen = new Set([parts.correct]);
  const distractors = parts.distractors.filter((d: Distractor) => !seen.has(d.text) && seen.add(d.text));
  return distractors.length >= 3 ? { ...parts, distractors } : null;
}

type NumericMaker<S> = (unit: NumericUnit, make: (s: S) => NumericParts | null, recheck: (s: S) => number) => CasePart<S>;

/**
 * Typed-amount questions of one case. `recheck` works the answer out again by another route; `verify` sets the
 * scenario of the question's seed up again (as the engine did) and compares.
 */
function numericFor<S>(setup: (rng: Rng) => S | null, context: (s: S) => string): NumericMaker<S> {
  return (unit, make, recheck) => ({
    kind: 'numeric',
    unit,
    make: (s) => {
      const parts = make(s);
      if (!parts || !Number.isSafeInteger(parts.answer) || parts.answer <= 0) return null;
      const commonErrors = tidy(parts.answer, parts.commonErrors);
      return commonErrors && { ...parts, commonErrors };
    },
    verify: (q) => {
      const id = parseGenId(q.id);
      if (!id) return false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const s = setup(attemptRng(id.seed, attempt));
        if (s && context(s) === q.context) return recheck(s) === q.answer;
      }
      return false;
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Case 1: a week in the double column cash book.
// ---------------------------------------------------------------------------------------------------------------

type WeekKey = 'deposit' | 'withdraw' | 'heldIn' | 'heldDep' | 'chequeIn' | 'ownerBank' | 'cashIn' | 'cashOut' | 'bankOut';

interface WeekTx {
  key: WeekKey;
  /** The sentence of the dated list. */
  text: string;
  /** A few words that name the transaction in an option. */
  brief: string;
  amt: Paise;
  /** +1 for the debit side of the column, -1 for the credit side, 0 when the column is not used. */
  cash: -1 | 0 | 1;
  bank: -1 | 0 | 1;
  lines: JournalLine[];
  explain: string[];
  distractors: string[];
  /** For an entry that is not a contra: the mistake of calling it one. */
  notContra: string;
}

const isContra = (t: WeekTx) => t.cash !== 0 && t.bank !== 0;
/** A round amount that no other transaction of the week has, so that no wrong answer can be read two ways. */
type Fresh = (lo: number, hi: number) => Paise;
function freshAmounts(rng: Rng): Fresh {
  const used = new Set<Paise>();
  return (lo, hi) => {
    let a = amount(rng, lo, hi, 500);
    for (let tries = 0; tries < 12 && used.has(a); tries++) a = amount(rng, lo, hi, 500);
    used.add(a);
    return a;
  };
}

const EXPENSES: { id: string; say: string }[] = [
  { id: 'rent', say: 'rent' },
  { id: 'wages', say: 'wages' },
  { id: 'electricity', say: 'the electricity bill' },
  { id: 'advertisement', say: 'for an advertisement' },
  { id: 'repairs', say: 'for repairs' },
];

const weekDeposit = (rng: Rng, fresh: Fresh): WeekTx => {
  const a = fresh(4000, 12000);
  return {
    key: 'deposit', amt: a, cash: -1, bank: 1,
    text: rng.pick([`Deposited cash ${fmt(a)} into the bank.`, `Paid ${fmt(a)} of office cash into the bank.`]),
    brief: 'office cash paid into the bank',
    lines: [dr('bank', a), cr('cash', a)],
    explain: ['The balance at bank, an asset, increases, so Bank A/c is debited.', 'Cash in hand, an asset, decreases, so Cash A/c is credited.'],
    distractors: ['drawings', 'capital'],
    notContra: '',
  };
};

const weekWithdraw = (rng: Rng, fresh: Fresh): WeekTx => {
  const a = fresh(3000, 10000);
  return {
    key: 'withdraw', amt: a, cash: 1, bank: -1,
    text: rng.pick([`Withdrew ${fmt(a)} from the bank for office use.`, `Drew ${fmt(a)} in cash from the bank for use in the office.`]),
    brief: 'cash drawn from the bank for office use',
    lines: [dr('cash', a), cr('bank', a)],
    explain: ['Cash in hand, an asset, increases, so Cash A/c is debited.', 'The balance at bank, an asset, decreases, so Bank A/c is credited.'],
    distractors: ['drawings', 'capital'],
    notContra: '',
  };
};

function weekHeld(fresh: Fresh, who: string): [WeekTx, WeekTx] {
  const a = fresh(4000, 15000);
  return [
    {
      key: 'heldIn', amt: a, cash: 1, bank: 0,
      text: `Received a cheque for ${fmt(a)} from ${who}, a debtor; it was not banked that day.`,
      brief: `cheque from ${who} received and held`,
      lines: [dr('cash', a), cr(debtor(who), a)],
      explain: ['A cheque that is held back is treated as cash, so Cash A/c is debited.', `${who} has paid, so the account of ${who} is credited.`],
      distractors: ['bank', 'sales'],
      notContra: 'On this day the cheque is only received and held as cash, so it is in the cash column alone. The contra entry is made on the day it is deposited.',
    },
    {
      key: 'heldDep', amt: a, cash: -1, bank: 1,
      text: `Deposited ${poss(who)} cheque of ${fmt(a)} into the bank.`,
      brief: `${poss(who)} cheque deposited into the bank`,
      lines: [dr('bank', a), cr('cash', a)],
      explain: [
        'The cheque was entered as cash on the day it was received. Depositing it moves the amount to the bank, so Bank A/c is debited.',
        `The amount leaves the cash column, so Cash A/c is credited. ${who} was already credited on the day of receipt.`,
      ],
      distractors: [debtor(who), 'sales'],
      notContra: '',
    },
  ];
}

const weekChequeIn = (fresh: Fresh, who: string): WeekTx => {
  const a = fresh(5000, 25000);
  return {
    key: 'chequeIn', amt: a, cash: 0, bank: 1,
    text: `Received a cheque for ${fmt(a)} from ${who}, a debtor, and banked it the same day.`,
    brief: `cheque from ${who} banked the same day`,
    lines: [dr('bank', a), cr(debtor(who), a)],
    explain: ['The cheque went into the bank the same day, so Bank A/c, an asset that increases, is debited.', `${who} has paid, so the account of ${who} is credited.`],
    distractors: ['cash', 'sales'],
    notContra: 'Saw money going into the bank, but the other account is the debtor, not Cash. Only the bank column is used.',
  };
};

const weekOwnerBank = (fresh: Fresh, owner: string): WeekTx => {
  const a = fresh(2000, 8000);
  return {
    key: 'ownerBank', amt: a, cash: 0, bank: -1,
    text: `${owner}, the proprietor, withdrew ${fmt(a)} from the bank for personal use.`,
    brief: `${poss(owner)} personal withdrawal from the bank`,
    lines: [dr('drawings', a), cr('bank', a)],
    explain: ['Money taken by the proprietor for personal use is drawings, which reduce capital, so Drawings A/c is debited.', 'The balance at bank, an asset, decreases, so Bank A/c is credited.'],
    distractors: ['cash', 'capital'],
    notContra: 'Money left the bank, but it went to the proprietor and not into the office cash. The other account is Drawings, so only the bank column is used.',
  };
};

const CASH_ONLY = 'This entry is in the cash column alone; the other account is not Bank.';
const BANK_ONLY = 'A payment by cheque is in the bank column alone; the other account is not Cash.';

/** Ordinary receipts and payments that fill the rest of the week. */
function weekFillers(rng: Rng, fresh: Fresh, p: People): WeekTx[] {
  const one = (key: WeekKey, a: Paise, text: string, brief: string, lines: JournalLine[]): WeekTx => ({
    key, amt: a, text, brief, lines, explain: [], distractors: [],
    cash: key === 'cashIn' ? 1 : key === 'cashOut' ? -1 : 0,
    bank: key === 'bankOut' ? -1 : 0,
    notContra: key === 'bankOut' ? BANK_ONLY : CASH_ONLY,
  });
  const sales = fresh(4000, 15000);
  const fromDebtor = fresh(3000, 12000);
  const customer = p.cust();
  const e = rng.pick(EXPENSES);
  const expense = fresh(1000, 5000);
  const goods = fresh(2000, 8000);
  const supplier = p.sup();
  const toCreditor = fresh(4000, 18000);
  const byCheque = fresh(5000, 15000);
  const salaries = rng.next() < 0.5;
  return [
    one('cashIn', sales, `Sold goods for cash ${fmt(sales)}.`, 'goods sold for cash', [dr('cash', sales), cr('sales', sales)]),
    one('cashIn', fromDebtor, `Received cash ${fmt(fromDebtor)} from ${customer}, a debtor.`, `cash received from ${customer}`, [dr('cash', fromDebtor), cr(debtor(customer), fromDebtor)]),
    one('cashOut', expense, `Paid ${e.say} ${fmt(expense)} in cash.`, `cash paid ${e.say.startsWith('for') ? e.say : `for ${e.say}`}`, [dr(e.id, expense), cr('cash', expense)]),
    one('cashOut', goods, `Bought goods for cash ${fmt(goods)}.`, 'goods bought for cash', [dr('purchases', goods), cr('cash', goods)]),
    one('bankOut', toCreditor, `Paid ${supplier}, a creditor, ${fmt(toCreditor)} by cheque.`, `cheque paid to ${supplier}`, [dr(creditor(supplier), toCreditor), cr('bank', toCreditor)]),
    salaries
      ? one('bankOut', byCheque, `Paid salaries ${fmt(byCheque)} by cheque.`, 'salaries paid by cheque', [dr('salaries', byCheque), cr('bank', byCheque)])
      : one('bankOut', byCheque, `Bought goods for ${fmt(byCheque)} and paid by cheque.`, 'goods bought and paid for by cheque', [dr('purchases', byCheque), cr('bank', byCheque)]),
  ];
}

interface Week {
  firm: string;
  owner: string;
  cash0: Paise;
  bank0: Paise;
  txs: WeekTx[];
  dates: string[];
  held: boolean;
  cashEnd: Paise;
  bankEnd: Paise;
  /** The contra entry that is the right option of the first question. */
  contraIx: number;
  journalIx: number;
  whereIx: number;
}

const WEEK_SIZE = 7;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

function weekSetup(rng: Rng): Week | null {
  const { firm, owner } = rng.pick(FIRMS);
  const p = people(rng);
  const plan = rng.pick(['A', 'B', 'AB', 'AB', 'AD', 'BD', 'ABD'] as const);
  const fresh = freshAmounts(rng);
  const chosen: WeekTx[] = [];
  if (plan.includes('A')) chosen.push(weekDeposit(rng, fresh));
  if (plan.includes('B')) chosen.push(weekWithdraw(rng, fresh));
  const held = plan.includes('D');
  if (held) chosen.push(...weekHeld(fresh, p.cust()));
  chosen.push(weekChequeIn(fresh, p.cust()), weekOwnerBank(fresh, owner));
  chosen.push(...rng.shuffle(weekFillers(rng, fresh, p)).slice(0, WEEK_SIZE - chosen.length));
  const amounts = chosen.filter((t) => t.key !== 'heldDep').map((t) => t.amt);
  if (new Set(amounts).size < amounts.length) return null;

  const cash0 = amount(rng, 12000, 30000, 1000);
  const bank0 = amount(rng, 40000, 90000, 5000);
  // An order in which neither column ever runs short, and the held cheque is received before it is deposited.
  let txs: WeekTx[] | null = null;
  for (let attempt = 0; attempt < 6 && !txs; attempt++) {
    const order = rng.shuffle(chosen);
    const inAt = order.findIndex((t) => t.key === 'heldIn');
    const depAt = order.findIndex((t) => t.key === 'heldDep');
    if (inAt > depAt) [order[inAt], order[depAt]] = [order[depAt], order[inAt]];
    let cash = cash0;
    let bank = bank0;
    const fine = order.every((t) => (cash += t.cash * t.amt) > 0 && (bank += t.bank * t.amt) > 0);
    if (fine) txs = order;
  }
  if (!txs) return null;

  const month = rng.pick(MONTHS);
  const day0 = rng.int(1, 22);
  const dates = txs.map((_, i) => `${day0 + i} ${month}`);
  const indexes = (keep: (t: WeekTx) => boolean) => txs.flatMap((t, i) => (keep(t) ? [i] : []));
  const contraIx = rng.pick(indexes(isContra));
  const journalChoices = indexes((t) => isContra(t) || t.key === 'chequeIn' || t.key === 'ownerBank');
  const journalIx = rng.pick(journalChoices.filter((i) => i !== contraIx));
  const whereIx = rng.pick(indexes((t) => isContra(t) || t.key === 'chequeIn' || t.key === 'ownerBank' || t.key === 'heldIn').filter((i) => i !== journalIx && i !== contraIx));
  return {
    firm, owner, cash0, bank0, txs, dates, held, contraIx, journalIx, whereIx,
    cashEnd: cash0 + sum(txs.map((t) => t.cash * t.amt)),
    bankEnd: bank0 + sum(txs.map((t) => t.bank * t.amt)),
  };
}

const weekContext = (s: Week): string =>
  [
    `${s.firm} keeps a double column cash book with cash and bank columns.`,
    `On the morning of ${s.dates[0]} cash in hand was ${fmt(s.cash0)} and the balance at bank was ${fmt(s.bank0)}.`,
    s.held
      ? 'A cheque banked the day it is received goes in the bank column; one held back is entered as cash until it is deposited.'
      : 'Every cheque received is banked the same day and entered straight in the bank column.',
    ...s.txs.map((t, i) => `${s.dates[i]}: ${t.text}`),
  ].join('\n');

const weekNumeric = numericFor(weekSetup, weekContext);
const optionOf = (s: Week, i: number) => `${s.dates[i]}: ${s.txs[i].brief}`;
const sideCol = (side: 1 | -1, col: 'cash' | 'bank') => `${side > 0 ? 'Debit' : 'Credit'} side of the ${col} column`;
const CONTRA_IN = 'Debit side of the bank column and credit side of the cash column';
const CONTRA_OUT = 'Debit side of the cash column and credit side of the bank column';

/** The closing balance of a column, with the working as the two sides of the column. */
function weekColumn(s: Week, col: 'cash' | 'bank'): string[] {
  const open = col === 'cash' ? s.cash0 : s.bank0;
  const debits = [open, ...s.txs.filter((t) => t[col] > 0).map((t) => t.amt)];
  const credits = s.txs.filter((t) => t[col] < 0).map((t) => t.amt);
  return [
    `Debit side of the ${col} column (opening balance and receipts): ${plus(debits)}.`,
    `Credit side of the ${col} column (payments): ${credits.length > 0 ? plus(credits) : 'nil'}.`,
    `Closing balance = ${fmt(sum(debits))} - ${fmt(sum(credits))} = ${fmt(sum(debits) - sum(credits))}.`,
    'Each contra entry is in both columns: on the debit side of one and the credit side of the other.',
  ];
}

/** The closing balance of a column by posting the journal entries of the week to a ledger. */
const weekByLedger = (s: Week, col: 'cash' | 'bank'): number =>
  post(s.txs.map((t) => t.lines), new Map([['cash', s.cash0], ['bank', s.bank0]])).get(col) ?? 0;

const weekCase = caseTemplate<Week>({
  id: 'case-bank-week-two-columns',
  topicId: T,
  conceptId: C,
  difficulty: 'easy',
  title: 'A week in the double column cash book',
  setup: weekSetup,
  context: weekContext,
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const others = s.txs.flatMap((t, i) => (isContra(t) ? [] : [{ i, t }]));
        // The entries a student most often takes for a contra come first; plain cash entries only fill up.
        const strong = others.filter(({ t }) => t.bank !== 0 || t.key === 'heldIn');
        const weak = others.filter(({ t }) => t.bank === 0 && t.key !== 'heldIn');
        const picked = [...strong, ...weak].slice(0, Math.max(3, Math.min(4, strong.length)));
        return choice({
          prompt: 'Which of these transactions is a contra entry?',
          correct: optionOf(s, s.contraIx),
          distractors: picked.map(({ i, t }) => ({ text: optionOf(s, i), why: t.notContra })),
          explanation:
            `A contra entry is one in which both Cash A/c and Bank A/c take part, so it is entered in both columns of the cash book, on opposite sides. ` +
            `On ${s.dates[s.contraIx]} money moved between the office cash and the bank (${s.txs[s.contraIx].brief}).`,
        });
      },
    },
    weekNumeric(
      'number',
      (s) => {
        const count = s.txs.filter(isContra).length;
        const bankEntries = s.txs.filter((t) => t.bank !== 0).length;
        const list = s.txs.flatMap((t, i) => (isContra(t) ? [`${s.dates[i]} (${t.brief})`] : []));
        return {
          prompt: `How many of the ${NUMBER_WORDS[s.txs.length]} transactions are contra entries?`,
          answer: count,
          commonErrors: [
            { value: count + 2, why: "Counted the cheque banked the same day and the proprietor's personal withdrawal as well. Each of them is in the bank column alone." },
            { value: count + 1, why: "Counted one entry that is in the bank column alone: the cheque banked the same day (its other account is the debtor) or the proprietor's personal withdrawal (its other account is Drawings)." },
            { value: bankEntries, why: 'Counted every entry in the bank column. A contra entry is one that appears in both columns.' },
            ...(s.held ? [{ value: count - 1, why: 'Left out the deposit of the cheque that had been held. It moves the amount from the cash column to the bank column, so it is a contra entry.' }] : []),
          ],
          explanation: [
            'A contra entry moves money between the office cash and the bank, so it is in both columns.',
            `Contra entries: ${list.join('; ')}.`,
            `That makes ${count}. The cheque banked the same day and the proprietor's personal withdrawal are in the bank column alone.`,
          ],
          hints: ['Look for the transactions in which money moves between the office cash and the bank.', 'A receipt from a debtor or a withdrawal by the proprietor has another account on its other side, so it is not a contra entry.'],
        };
      },
      (s) => s.txs.filter((t) => t.lines.some((l) => l.accountId === 'cash') && t.lines.some((l) => l.accountId === 'bank')).length,
    ),
    {
      kind: 'journal',
      make: (s) => {
        const t = s.txs[s.journalIx];
        // The deposit of a held cheque rests on the convention of the case, so the question says it again.
        const reminder = t.key === 'heldDep' ? ' The cheque was entered in the cash column on the day it was received.' : '';
        return { prompt: `Pass the journal entry for the transaction of ${s.dates[s.journalIx]}.${reminder}`, lines: t.lines, explanation: t.explain, distractorAccounts: t.distractors };
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const t = s.txs[s.whereIx];
        const prompt = `Where is the transaction of ${s.dates[s.whereIx]} entered in the double column cash book?`;
        if (isContra(t)) {
          const paidIn = t.bank > 0;
          return choice({
            prompt,
            correct: paidIn ? CONTRA_IN : CONTRA_OUT,
            distractors: [
              { text: paidIn ? CONTRA_OUT : CONTRA_IN, why: `Reversed the contra entry: that is how ${paidIn ? 'cash drawn from the bank' : 'cash paid into the bank'} is entered.` },
              paidIn
                ? { text: 'Debit side of the bank column only', why: t.key === 'heldDep' ? 'Entered a fresh receipt in the bank column. The cheque is already in the cash column, so the cash column must be credited as well.' : 'Added the money to the bank column but did not take it out of the cash column.' }
                : { text: 'Credit side of the bank column only', why: 'Took the money out of the bank column but did not add it to the cash column.' },
              paidIn
                ? { text: 'Credit side of the cash column only', why: 'Took the money out of the cash column but did not add it to the bank column.' }
                : { text: 'Debit side of the cash column only', why: 'Added the money to the cash column but did not take it out of the bank column.' },
            ],
            explanation: paidIn
              ? 'The amount goes into the bank and out of the cash column: a contra entry, on the debit side of the bank column ("To Cash A/c") and the credit side of the cash column ("By Bank A/c").'
              : 'The amount comes out of the bank and into the office cash: a contra entry, on the debit side of the cash column ("To Bank A/c") and the credit side of the bank column ("By Cash A/c").',
          });
        }
        const col = t.cash !== 0 ? 'cash' : 'bank';
        const other = col === 'cash' ? 'bank' : 'cash';
        const side = (t.cash || t.bank) as 1 | -1;
        const flip = -side as 1 | -1;
        const whys: Record<string, { column: string; contra: string; contraText: string; because: string }> = {
          heldIn: {
            column: 'Entered the cheque as if it had been banked that day. A cheque that is held back is treated as cash until it is deposited.',
            contraText: CONTRA_IN,
            contra: 'Made the contra entry too early: that is the entry for the day the cheque is deposited.',
            because: 'The cheque was not banked that day, so it is treated as cash: a receipt on the debit side of the cash column.',
          },
          chequeIn: {
            column: 'Used the cash column although the cheque went into the bank the same day.',
            contraText: CONTRA_IN,
            contra: 'Treated it as cash paid into the bank. The cheque never passed through the cash column.',
            because: 'The cheque was banked the day it came, so it is a receipt on the debit side of the bank column.',
          },
          ownerBank: {
            column: 'Used the cash column although the money was drawn from the bank.',
            contraText: CONTRA_OUT,
            contra: 'Treated it as cash drawn for the office. The money went to the proprietor, so only the bank column is credited.',
            because: 'The money left the bank and went to the proprietor: a payment on the credit side of the bank column, with Drawings A/c debited in the ledger.',
          },
        };
        const w = whys[t.key];
        return choice({
          prompt,
          correct: sideCol(side, col),
          distractors: [
            { text: sideCol(side, other), why: w.column },
            { text: w.contraText, why: w.contra },
            { text: sideCol(flip, col), why: side > 0 ? 'Put a receipt on the payments side.' : 'Put a payment on the receipts side.' },
            { text: sideCol(flip, other), why: 'Got both the side and the column wrong.' },
          ],
          explanation: w.because,
        });
      },
    },
    weekNumeric(
      'rupees',
      (s) => {
        const contras = s.txs.filter(isContra);
        const contraCash = sum(contras.map((t) => t.cash * t.amt));
        const owner = s.txs.find((t) => t.key === 'ownerBank')!.amt;
        const banked = s.txs.find((t) => t.key === 'chequeIn')!.amt;
        const held = s.txs.find((t) => t.key === 'heldIn')?.amt;
        return {
          prompt: `What is the closing balance of the cash column on the evening of ${s.dates[s.dates.length - 1]}?`,
          answer: s.cashEnd,
          commonErrors: [
            { value: s.cashEnd - contraCash, why: `Left out the contra ${contras.length === 1 ? 'entry' : 'entries'}, which ${contras.length === 1 ? 'changes' : 'change'} the cash column too.` },
            ...(held ? [{ value: s.cashEnd + held, why: 'Entered the held cheque as cash but did not credit the cash column when it was deposited.' }] : []),
            { value: s.cashEnd + owner, why: "Took the proprietor's personal withdrawal from the bank as cash coming into the office." },
            { value: s.cashEnd + banked, why: 'Entered the cheque banked the same day in the cash column.' },
            { value: s.cashEnd - s.cash0, why: 'Left out the opening balance.' },
            { value: s.cashEnd - 2 * contraCash, why: `Entered the contra ${contras.length === 1 ? 'entry' : 'entries'} on the wrong side of the cash column.` },
          ],
          explanation: weekColumn(s, 'cash'),
          hints: ['Start with the opening cash. Add what came into the cash column and deduct what went out of it.', 'A contra entry changes both columns. A cheque banked the same day never enters the cash column.'],
        };
      },
      (s) => weekByLedger(s, 'cash'),
    ),
    weekNumeric(
      'rupees',
      (s) => {
        const contras = s.txs.filter(isContra);
        const contraBank = sum(contras.map((t) => t.bank * t.amt));
        const owner = s.txs.find((t) => t.key === 'ownerBank')!.amt;
        const banked = s.txs.find((t) => t.key === 'chequeIn')!.amt;
        const held = s.txs.find((t) => t.key === 'heldIn')?.amt;
        return {
          prompt: `What is the closing balance of the bank column on the evening of ${s.dates[s.dates.length - 1]}?`,
          answer: s.bankEnd,
          commonErrors: [
            { value: s.bankEnd - contraBank, why: `Left out the contra ${contras.length === 1 ? 'entry' : 'entries'}, which ${contras.length === 1 ? 'changes' : 'change'} the bank column too.` },
            { value: s.bankEnd + owner, why: "Left out the proprietor's withdrawal as a personal matter. The money still left the firm's bank account." },
            ...(held ? [{ value: s.bankEnd + held, why: 'Entered the held cheque in the bank column on the day it was received and again on the day it was deposited.' }] : []),
            { value: s.bankEnd - banked, why: 'Left the cheque banked the same day out of the bank column.' },
            { value: s.bankEnd - s.bank0, why: 'Left out the opening balance.' },
            { value: s.bankEnd - 2 * contraBank, why: `Entered the contra ${contras.length === 1 ? 'entry' : 'entries'} on the wrong side of the bank column.` },
          ],
          explanation: weekColumn(s, 'bank'),
          hints: ['Start with the opening balance at bank. Add what went into the bank and deduct every cheque drawn and every withdrawal.', "The proprietor's personal withdrawal is a payment out of the bank, although it is not an expense."],
        };
      },
      (s) => weekByLedger(s, 'bank'),
    ),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Bank reconciliation: the items, and the one place where their direction is decided.
//
// A balance is a signed amount: positive is favourable, negative an overdraft. Every item has a `sign`, defined by
// one sentence: "pass book balance = cash book balance + sign x amount". Cheques issued but not yet presented have
// sign +1 (the bank has not paid them, so the pass book shows more money); bank charges have sign -1.
// ---------------------------------------------------------------------------------------------------------------

type Book = 'cb' | 'pb';
type Group = 'timing' | 'bank' | 'cbError' | 'bankError' | 'cleared';

interface Entry {
  lines: JournalLine[];
  explanation: string[];
  distractors: string[];
}

interface Item {
  key: string;
  group: Group;
  sign: -1 | 0 | 1;
  amount: Paise;
  /** The line of the case text. */
  line: string;
  /** The line of the reconciliation statement. */
  label: string;
  /** A noun phrase for the item, with "the". */
  short: string;
  /** Why the two books differ because of it. */
  reason: string;
  /** The reasoning behind taking it the wrong way round in a statement that starts from the cash book. */
  mistake: string;
  /** A figure in the line that a careless student would use instead of `amount`. */
  naive?: Paise;
  /** How `amount` follows from the figures in the line. */
  calc?: string;
  /** For a cheque both books already show: the sign of the like timing difference. */
  ghost?: -1 | 1;
  /** For a cheque entered in the cash book at a wrong amount. */
  figures?: { entered: Paise; actual: Paise };
  /** The entry the firm makes for an item it learnt of from the pass book. */
  entry?: Entry;
}

type Maker = (rng: Rng, p: People, date: string) => Item;

const BANK_UP = 'The bank has added the amount to the account, so Bank A/c is debited.';
const BANK_DOWN = 'The bank has taken the amount out of the account, so Bank A/c is credited.';

const issued =
  (indirect = false, lo = 3000, hi = 30000): Maker =>
  (rng, p) => {
    const a = amount(rng, lo, hi, 500);
    const base = {
      key: 'issued', group: 'timing' as const, sign: 1 as const, amount: a,
      label: 'Cheques issued but not yet presented',
      short: 'the cheques issued but not yet presented',
      reason: 'The firm entered the cheques in its cash book on the day it issued them, but the bank pays a cheque only when it is presented.',
      mistake: 'Thought the bank had already paid the cheques, so took the item the wrong way round.',
    };
    if (indirect) {
      const paid = amount(rng, 5000, 40000, 1000);
      return {
        ...base,
        line: `Cheques for ${fmt(paid + a)} were issued in the last week; the bank has paid only ${fmt(paid)} of them so far.`,
        naive: paid + a,
        calc: `Cheques not yet presented = ${fmt(paid + a)} - ${fmt(paid)} = ${fmt(a)}.`,
      };
    }
    if (rng.next() < 0.5) {
      const who = p.sup();
      return { ...base, line: `A cheque for ${fmt(a)} issued to ${who} has not yet been presented at the bank.`, label: 'Cheque issued but not yet presented', short: `the cheque issued to ${who} but not yet presented` };
    }
    return { ...base, line: `Cheques issued but not yet presented for payment: ${fmt(a)}.` };
  };

const deposited =
  (indirect = false, lo = 3000, hi = 30000): Maker =>
  (rng, p, date) => {
    const a = amount(rng, lo, hi, 500);
    const base = {
      key: 'deposited', group: 'timing' as const, sign: -1 as const, amount: a,
      label: 'Cheques deposited but not yet collected',
      short: 'the cheques deposited but not yet collected',
      reason: 'The firm entered the cheques in its cash book on the day it deposited them, but the bank adds a cheque to the account only when it is collected.',
      mistake: 'Thought the bank had already collected the cheques, so took the item the wrong way round.',
    };
    if (indirect) {
      const credited = amount(rng, 5000, 40000, 1000);
      return {
        ...base,
        line: `Cheques for ${fmt(credited + a)} were deposited in the last week; the bank has credited only ${fmt(credited)} of them so far.`,
        naive: credited + a,
        calc: `Cheques not yet collected = ${fmt(credited + a)} - ${fmt(credited)} = ${fmt(a)}.`,
      };
    }
    if (rng.next() < 0.5) {
      const who = p.cust();
      return { ...base, line: `A cheque for ${fmt(a)} from ${who}, deposited on ${date}, has not yet been collected by the bank.`, label: 'Cheque deposited but not yet collected', short: `the cheque from ${who} deposited but not yet collected` };
    }
    return { ...base, line: `Cheques deposited but not yet collected by the bank: ${fmt(a)}.` };
  };

const charges: Maker = (rng) => {
  const a = amount(rng, 100, 2000, 50);
  return {
    key: 'charges', group: 'bank', sign: -1, amount: a,
    line: rng.pick([`The bank debited ${fmt(a)} as bank charges.`, `Bank charges of ${fmt(a)} were debited by the bank.`]),
    label: 'Bank charges debited by the bank',
    short: 'the bank charges',
    reason: 'The bank deducted its charges from the account, but the firm has not yet entered them in the cash book.',
    mistake: 'Treated a charge made by the bank as money received.',
    entry: { lines: [dr('bankCharges', a), cr('bank', a)], explanation: ['Bank charges are an expense of the firm, so Bank Charges A/c is debited.', BANK_DOWN], distractors: ['interestPaid', 'cash'] },
  };
};

const interestCr: Maker = (rng) => {
  const a = amount(rng, 200, 3000, 50);
  return {
    key: 'interestCr', group: 'bank', sign: 1, amount: a,
    line: rng.pick([`The bank credited interest of ${fmt(a)}.`, `Interest of ${fmt(a)} was allowed by the bank and credited to the account.`]),
    label: 'Interest credited by the bank',
    short: 'the interest credited by the bank',
    reason: 'The bank added interest to the account, but the firm has not yet entered it in the cash book.',
    mistake: 'Treated interest earned as a payment.',
    entry: { lines: [dr('bank', a), cr('interestReceived', a)], explanation: [BANK_UP, 'Interest earned is an income, so Interest Received A/c is credited.'], distractors: ['interestPaid', 'commissionReceived'] },
  };
};

/** Interest the bank charges on an overdraft of the given size: 1% to 3% of it, so that the two figures look like one account. */
const interestDr = (rng: Rng, overdraft: Paise): Item => {
  const percent = rng.pick([1, 1.5, 2, 2.5, 3]);
  const a = rupees(Math.min(3000, Math.max(100, Math.round((overdraft * percent) / 500000) * 50)));
  return {
    key: 'interestDr', group: 'bank', sign: -1, amount: a,
    line: rng.pick([`The bank debited interest of ${fmt(a)} on the overdraft.`, `Interest on the overdraft, ${fmt(a)}, was debited by the bank.`]),
    label: 'Interest on overdraft debited by the bank',
    short: 'the interest on the overdraft',
    reason: 'The bank charged interest on the overdraft to the account, but the firm has not yet entered it in the cash book.',
    mistake: 'Treated interest charged by the bank as income.',
    entry: { lines: [dr('interestPaid', a), cr('bank', a)], explanation: ['Interest on the overdraft is an expense, so Interest Paid A/c is debited.', 'The bank has charged the amount to the account, so Bank A/c is credited: the overdraft grows.'], distractors: ['interestReceived', 'bankCharges'] },
  };
};

const directDeposit: Maker = (rng, p) => {
  const a = amount(rng, 2000, 20000, 500);
  const who = p.cust();
  return {
    key: 'directDep', group: 'bank', sign: 1, amount: a,
    line: rng.pick([`${who}, a debtor, paid ${fmt(a)} directly into the firm's bank account.`, `${who}, a debtor, transferred ${fmt(a)} straight to the firm's bank account.`]),
    label: `Direct deposit by ${who}`,
    short: `the direct deposit by ${who}`,
    reason: `The bank added the payment by ${who} to the account, but the firm has not yet entered the receipt in the cash book.`,
    mistake: 'Treated a receipt in the bank as a payment.',
    entry: { lines: [dr('bank', a), cr(debtor(who), a)], explanation: [BANK_UP, `${who} has paid what was owed, so the account of ${who} is credited.`], distractors: ['sales', 'cash'] },
  };
};

const STANDING: { id: string; what: string; name: string }[] = [
  { id: 'insurance', what: 'an insurance premium', name: 'Insurance premium' },
  { id: 'electricity', what: "the firm's electricity bill", name: 'Electricity bill' },
  { id: 'rent', what: 'the shop rent', name: 'Rent' },
];

const standing: Maker = (rng) => {
  const a = amount(rng, 1000, 8000, 100);
  const o = rng.pick(STANDING);
  return {
    key: 'standing', group: 'bank', sign: -1, amount: a,
    line: `The bank paid ${o.what} of ${fmt(a)} on a standing instruction.`,
    label: `${o.name} paid by the bank on standing instruction`,
    short: `the ${o.name.toLowerCase()} paid by the bank`,
    reason: 'The bank paid the amount out of the account on a standing instruction, but the firm has not yet entered the payment in the cash book.',
    mistake: 'Treated a payment made by the bank as a receipt.',
    entry: { lines: [dr(o.id, a), cr('bank', a)], explanation: [`${o.name} is an expense of the firm, so ${o.id === 'rent' ? 'Rent' : cap(o.id)} A/c is debited.`, BANK_DOWN], distractors: ['prepaidExpenses', 'cash'] },
  };
};

const dishonoured: Maker = (rng, p) => {
  const a = amount(rng, 2000, 15000, 500);
  const who = p.cust();
  return {
    key: 'dishonoured', group: 'bank', sign: -1, amount: a,
    line: `A cheque for ${fmt(a)} from ${who}, a debtor, deposited earlier, was dishonoured; the bank debited the account.`,
    label: `Cheque of ${who} dishonoured`,
    short: `the dishonour of ${poss(who)} cheque`,
    reason: `The firm entered the cheque as a receipt when it deposited it. The bank took the amount back out of the account when the cheque was dishonoured, but the firm has not yet entered the dishonour.`,
    mistake: 'Counted the dishonoured cheque as money still received.',
    entry: { lines: [dr(debtor(who), a), cr('bank', a)], explanation: [`${who} has not paid after all and owes the amount again, so the account of ${who} is debited.`, BANK_DOWN], distractors: ['badDebts', 'sales'] },
  };
};

const dividend: Maker = (rng) => {
  const a = amount(rng, 500, 9000, 100);
  return {
    key: 'dividend', group: 'bank', sign: 1, amount: a,
    line: `The bank collected a dividend of ${fmt(a)} on the firm's investments.`,
    label: 'Dividend collected by the bank',
    short: 'the dividend collected by the bank',
    reason: 'The bank collected the dividend and added it to the account, but the firm has not yet entered it in the cash book.',
    mistake: 'Treated a dividend received as a payment.',
    entry: { lines: [dr('bank', a), cr('dividendReceived', a)], explanation: [BANK_UP, 'A dividend is an income, so Dividend Received A/c is credited.'], distractors: ['investments', 'interestReceived'] },
  };
};

/** A distracting fact: a cheque that the firm has entered and the bank has already dealt with. */
const cleared: Maker = (rng, p) => {
  const a = amount(rng, 3000, 25000, 500);
  const reason = 'The firm entered the cheque, and the bank has dealt with it too. Both books show it, so it causes no difference.';
  if (rng.next() < 0.5) {
    return {
      key: 'cleared', group: 'cleared', sign: 0, amount: a, ghost: 1, reason, mistake: '',
      line: `A cheque for ${fmt(a)} issued to ${p.sup()} early in the month has been presented and paid.`,
      label: 'Cheque already paid by the bank',
      short: 'the cheque that the bank has already paid',
    };
  }
  return {
    key: 'cleared', group: 'cleared', sign: 0, amount: a, ghost: -1, reason, mistake: '',
    line: `A cheque for ${fmt(a)} from ${p.cust()}, deposited early in the month, has been collected and credited.`,
    label: 'Cheque already credited by the bank',
    short: 'the cheque that the bank has already credited',
  };
};

const BANK_ITEMS: Maker[] = [charges, interestCr, directDeposit, standing, dishonoured, dividend];

// ---- The arithmetic of a reconciliation ------------------------------------------------------------------------

const bookName = (b: Book) => (b === 'cb' ? 'cash book' : 'pass book');
const otherBook = (b: Book): Book => (b === 'cb' ? 'pb' : 'cb');
const live = (items: readonly Item[]) => items.filter((i) => i.sign !== 0);
const total = (items: readonly Item[]) => sum(items.map((i) => i.amount));
/** What the item does to the signed balance on the way from book `from` to the other book. */
const dirOf = (from: Book, i: Item) => (from === 'cb' ? i.sign : -i.sign);
/** True when the item is added to the starting balance (to the overdraft, when the start is an overdraft). */
const isAdd = (from: Book, start: Paise, i: Item) => dirOf(from, i) > 0 === start > 0;
const reconcile = (from: Book, start: Paise, items: readonly Item[]): Paise => start + sum(items.map((i) => dirOf(from, i) * i.amount));
const natureOf = (signed: Paise) => (signed > 0 ? 'favourable' : 'overdraft');
const aNature = (signed: Paise) => (signed > 0 ? 'a favourable balance' : 'an overdraft');
const numberOf = (s: { items: Item[] }, i: Item) => `(${ROMAN[s.items.indexOf(i)]})`;
const listItems = (items: readonly Item[]) => items.map((it, i) => `(${ROMAN[i]}) ${it.line}`);
/** Item numbers in a sentence: "(i), (iii) and (v)". */
const numbersOf = (s: { items: Item[] }, list: readonly Item[]): string => {
  const ns = [...list].sort((a, b) => s.items.indexOf(a) - s.items.indexOf(b)).map((i) => numberOf(s, i));
  return ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`;
};
/** A balance a little above the items, so that no step of a statement changes its nature. */
const roomyBalance = (rng: Rng, items: readonly Item[]): Paise => Math.ceil(total(items) / 100000) * 100000 + amount(rng, 5000, 40000, 1000);

/**
 * The textbook list, as an independent route to `sign`: what is added in a statement that starts from a favourable
 * balance as per cash book. Everything else is deducted. From the pass book, or from an overdraft, the rule turns
 * round (and turns back when both apply).
 */
const ADDED_FROM_CASH_BOOK = new Set(['issued', 'interestCr', 'directDep', 'dividend', 'recUnder', 'payOver', 'payMore', 'recLess', 'bankErrCr']);

function byRules(from: Book, start: Paise, items: readonly Item[]): { adds: Paise; lesses: Paise; end: Paise } {
  let adds = 0;
  let lesses = 0;
  for (const i of items) {
    if (i.key === 'cleared') continue;
    let add = ADDED_FROM_CASH_BOOK.has(i.key);
    if (from === 'pb') add = !add;
    if (start < 0) add = !add;
    if (add) adds += i.amount;
    else lesses += i.amount;
  }
  const size = Math.abs(start) + adds - lesses;
  return { adds, lesses, end: start > 0 ? size : -size };
}

/** The reconciliation statement as working lines: the starting balance, what is added, what is deducted, the end. */
function statement(from: Book, start: Paise, items: readonly Item[], startLabel: string, endLabel: string): string[] {
  const xs = live(items);
  const adds = xs.filter((i) => isAdd(from, start, i));
  const lesses = xs.filter((i) => !isAdd(from, start, i));
  const lines = [`${startLabel} (${natureOf(start)}): ${fmt(Math.abs(start))}.`];
  if (start < 0) lines.push('An overdraft is a negative balance, so the rule turns round: what would be added to a favourable balance is deducted from an overdraft, and the reverse.');
  for (const i of xs) if (i.calc) lines.push(i.calc);
  for (const i of adds) lines.push(`Add: ${i.label} ${fmt(i.amount)}.`);
  const subtotal = Math.abs(start) + total(adds);
  if (adds.length > 0 && lesses.length > 0) lines.push(`Total: ${fmt(subtotal)}.`);
  for (const i of lesses) lines.push(`Less: ${i.label} ${fmt(i.amount)}.`);
  const end = reconcile(from, start, xs);
  if (end > 0 !== start > 0) {
    const less = total(lesses);
    lines.push(`The deductions come to ${fmt(less)}, which is ${fmt(less - subtotal)} more than ${fmt(subtotal)}, so ${start > 0 ? 'the favourable balance' : 'the overdraft'} turns into ${aNature(end)} of ${fmt(less - subtotal)}.`);
  }
  lines.push(`${endLabel} (${natureOf(end)}): ${fmt(Math.abs(end))}.`);
  return lines;
}

/** Wrong closing balances, each the figure a named mistake gives. The most telling mistakes come first. */
function wrongBalances(from: Book, start: Paise, items: readonly Item[]): Err[] {
  const xs = live(items);
  const net = (list: readonly Item[], value: (i: Item) => Paise = (i) => i.amount) => sum(list.map((i) => dirOf(from, i) * value(i)));
  const right = start + net(xs);
  const timing = xs.filter((i) => i.group === 'timing');
  const rest = xs.filter((i) => i.group !== 'timing');
  const out: { signed: Paise; why: string }[] = [];
  out.push({
    signed: start - net(xs),
    why: start < 0 ? 'Treated the overdraft as a favourable balance, so every item went the wrong way round.' : 'Added what should be deducted and deducted what should be added: the whole statement is the wrong way round.',
  });
  if (xs.some((i) => i.naive !== undefined)) {
    out.push({ signed: start + net(xs, (i) => i.naive ?? i.amount), why: 'Used a whole figure given in the case where only the difference between two figures makes the books differ.' });
  }
  for (const g of items) {
    if (g.ghost !== undefined) out.push({ signed: right + (from === 'cb' ? g.ghost : -g.ghost) * g.amount, why: `Adjusted for ${g.short}. Both books already show it, so it causes no difference.` });
  }
  if (xs.some((i) => i.group === 'bankError')) {
    out.push({ signed: start + net(xs.filter((i) => i.group !== 'bankError')), why: "Left out the bank's mistake. Until the bank corrects it, it is part of the difference between the two balances." });
  }
  if (timing.length > 0 && rest.length > 0) {
    out.push({ signed: start + net(rest), why: 'Left out the cheques that the bank has not yet paid or collected.' });
    out.push({ signed: start + net(timing), why: 'Adjusted only for the cheques, and left out every other item.' });
  }
  for (const i of xs) out.push({ signed: right - 2 * dirOf(from, i) * i.amount, why: `Took ${i.short} the wrong way round.` });
  const size = Math.abs(start);
  out.push({ signed: size + total(xs), why: 'Added every item to the starting balance, whatever its direction.' });
  out.push({ signed: size - total(xs), why: 'Deducted every item from the starting balance, whatever its direction.' });
  out.push({ signed: start, why: 'Gave the starting balance without adjusting it.' });
  return out.map((w) => ({ value: Math.abs(w.signed), why: w.why }));
}

const BRS_HINTS = [
  'For each item, ask which book already shows it and whether it makes the pass book show more money or less.',
  'Cheques not yet presented or collected are in the cash book only. Charges, interest, direct deposits and payments on standing instruction are in the pass book only.',
];

// ---- Questions shared by the reconciliation cases --------------------------------------------------------------

/** What every reconciliation case has: a starting balance in one book, the items, the balance of the other book. */
interface Brs {
  firm: string;
  date: string;
  from: Book;
  /** Signed: positive is favourable, negative an overdraft. */
  start: Paise;
  items: Item[];
  result: Paise;
}

const ruleLine = (from: Book, start: Paise): string => {
  const to = bookName(otherBook(from));
  return start > 0
    ? `Starting from a favourable balance, add an item that makes the ${to} show more money than the ${bookName(from)}, and deduct one that makes it show less.`
    : `Starting from an overdraft the rule turns round: add an item that makes the ${to} show less money than the ${bookName(from)} (a bigger overdraft), and deduct one that makes it show more.`;
};

/** The total of the items added (or deducted) in the statement that starts from the given balance. */
function sidePart<S extends Brs>(numeric: NumericMaker<S>, which: 'add' | 'less'): CasePart<S> {
  const verb = which === 'add' ? 'added' : 'deducted';
  const opposite = which === 'add' ? 'deducted' : 'added';
  return numeric(
    'rupees',
    (s) => {
      const xs = live(s.items);
      const od = s.start < 0;
      const mine = xs.filter((i) => isAdd(s.from, s.start, i) === (which === 'add'));
      const others = xs.filter((i) => !mine.includes(i));
      const timing = (list: Item[]) => list.filter((i) => i.group === 'timing');
      const answer = total(mine);
      const ghosts = s.items.filter((g) => g.ghost !== undefined && ((s.from === 'cb' ? g.ghost : -g.ghost) > 0 === s.start > 0) === (which === 'add'));
      const where = which === 'add' ? 'added to' : 'deducted from';
      return {
        prompt: od
          ? `A reconciliation statement starts from this overdraft. What is the total of the items to be ${where} the overdraft (the items that make it ${which === 'add' ? 'larger' : 'smaller'})?`
          : `A reconciliation statement starts from the ${bookName(s.from)} balance. What is the total of the items to be ${where} it?`,
        answer,
        commonErrors: [
          {
            value: total(others),
            why: od
              ? `Used the rule for a favourable balance without turning it round for an overdraft: these are the items to be ${opposite}.`
              : `Gave the items to be ${opposite}: every item was taken the wrong way round.`,
          },
          ...(mine.some((i) => i.naive !== undefined)
            ? [{ value: sum(mine.map((i) => i.naive ?? i.amount)), why: 'Used a whole figure given in the case where only the difference between two figures makes the books differ.' }]
            : []),
          ...ghosts.map((g) => ({ value: answer + g.amount, why: `Included ${g.short}. Both books already show it, so it causes no difference.` })),
          { value: answer - total(timing(mine)) + total(timing(others)), why: 'Took the cheques not yet presented and the cheques not yet collected the wrong way round.' },
          { value: total(mine.filter((i) => i.group !== 'timing')), why: 'Left out the cheques that the bank has not yet paid or collected.' },
          { value: total(timing(mine)), why: 'Counted only the cheques, and left out the other items.' },
          ...others.filter((i) => i.group !== 'timing').slice(0, 2).map((i) => ({ value: answer + i.amount, why: `${cap(verb)} item ${numberOf(s, i)}, ${i.short}. It belongs with the items ${opposite}.` })),
          { value: total(xs), why: 'Took every item, whatever its direction.' },
        ],
        explanation: [
          ruleLine(s.from, s.start),
          ...mine.flatMap((i) => (i.calc ? [i.calc] : [])),
          `Items ${verb}: ${mine.map((i) => `${numberOf(s, i)} ${fmt(i.amount)}`).join(', ')}.`,
          `Total ${verb} = ${fmt(answer)}.`,
          others.length === 1 ? `The only item ${opposite} is ${numberOf(s, others[0])}.` : `The items ${opposite} are ${numbersOf(s, others)}.`,
          ...s.items.filter((i) => i.sign === 0).map((i) => `Item ${numberOf(s, i)} is left out: both books already show it.`),
        ],
        hints: BRS_HINTS,
      };
    },
    (s) => (which === 'add' ? byRules(s.from, s.start, s.items).adds : byRules(s.from, s.start, s.items).lesses),
  );
}

/** The balance of the other book: the figure the case leads to. */
function closingPart<S extends Brs>(numeric: NumericMaker<S>, prompt: (s: S) => string): CasePart<S> {
  return numeric(
    'rupees',
    (s) => ({
      prompt: prompt(s),
      answer: Math.abs(s.result),
      commonErrors: wrongBalances(s.from, s.start, s.items),
      explanation: [
        ...statement(s.from, s.start, s.items, `Balance as per ${bookName(s.from)}`, `Balance as per ${bookName(otherBook(s.from))}`),
        ...s.items.filter((i) => i.sign === 0).map((i) => `Item ${numberOf(s, i)} is left out: both books already show it.`),
        `Check: working back from this balance with every item reversed gives ${fmt(Math.abs(s.start))}, the balance the case starts with.`,
      ],
      hints: BRS_HINTS,
    }),
    (s) => (reconcile(otherBook(s.from), s.result, s.items) === s.start ? Math.abs(byRules(s.from, s.start, s.items).end) : 0),
  );
}

/** The entry the firm makes for one of the items it learnt of from the pass book. */
function entryPart<S extends Brs & { entryItem: Item }>(prompt: (s: S, item: string) => string): CasePart<S> {
  return {
    kind: 'journal',
    make: (s) => {
      const e = s.entryItem.entry;
      return e ? { prompt: prompt(s, numberOf(s, s.entryItem)), lines: e.lines, explanation: e.explanation, distractorAccounts: e.distractors } : null;
    },
  };
}

/** Is the item added to or deducted from the balance the statement starts with? */
function treatPart<S extends Brs & { askItem: Item }>(): CasePart<S> {
  return {
    kind: 'mcq',
    make: (s) => {
      const i = s.askItem;
      const od = s.start < 0;
      const target = od ? 'the overdraft' : `the ${bookName(s.from)} balance`;
      const add = `Add it to ${target}`;
      const deduct = `Deduct it from ${target}`;
      const right = isAdd(s.from, s.start, i);
      return choice({
        prompt: `A reconciliation statement starts from ${od ? 'this overdraft' : `the ${bookName(s.from)} balance`} and ends at the ${bookName(otherBook(s.from))} balance. How is item ${numberOf(s, i)} treated in it?`,
        correct: right ? add : deduct,
        distractors: [
          {
            text: right ? deduct : add,
            why: od
              ? 'Used the rule for a favourable balance without turning it round for an overdraft.'
              : s.from === 'pb'
                ? 'Treated the item as in a statement that starts from the cash book. Starting from the pass book, each item goes the other way.'
                : i.mistake,
          },
          { text: 'Leave it out: both books already show it', why: 'Assumed both books already show the item. Only one of them does, so it is part of the difference.' },
          { text: 'Leave it out: it will be put right in time', why: 'Left out an item because it will sort itself out later. On this date it still explains part of the difference.' },
        ],
        explanation:
          `${i.reason} Because of it the pass book shows ${i.sign > 0 ? 'more' : 'less'} money than the cash book. ` +
          `${ruleLine(s.from, s.start)} So this item is ${right ? 'added' : 'deducted'}.`,
        hints: BRS_HINTS,
      });
    },
  };
}

const PASS_BOOK_ONLY = 'Nothing found only in the pass book has yet been entered in the cash book.';
const CASH_BOOK_WANTED = 'The cash book (bank column) balance is wanted as it stands.';

// ---------------------------------------------------------------------------------------------------------------
// Case 2: from the cash book balance to the pass book balance.
// ---------------------------------------------------------------------------------------------------------------

interface ToPassBook extends Brs {
  entryItem: Item;
  /** A cheque that is in the cash book only: the right option of the first question. */
  timingItem: Item;
}

function toPassBookSetup(rng: Rng): ToPassBook | null {
  const { firm } = rng.pick(FIRMS);
  const date = rng.pick(CLOSING_DATES);
  const p = people(rng);
  const indirect = rng.pick(['none', 'none', 'issued', 'deposited'] as const);
  const timing = [issued(indirect === 'issued')(rng, p, date), deposited(indirect === 'deposited')(rng, p, date)];
  const bank = rng.shuffle(BANK_ITEMS).slice(0, 3).map((make) => make(rng, p, date));
  const decoy = rng.next() < 0.4 ? [cleared(rng, p, date)] : [];
  const items = rng.shuffle([...timing, ...bank, ...decoy]);
  const start = roomyBalance(rng, items);
  const result = reconcile('cb', start, items);
  if (result === start) return null;
  return { firm, date, from: 'cb', start, items, result, entryItem: rng.pick(bank), timingItem: rng.pick(timing) };
}

const toPassBookContext = (s: ToPassBook): string =>
  [
    `${s.firm} compared its cash book with the bank pass book on ${s.date}.`,
    `The cash book (bank column) showed a favourable balance of ${fmt(s.start)}.`,
    PASS_BOOK_ONLY,
    ...listItems(s.items),
  ].join('\n');

const toPassBookNumeric = numericFor(toPassBookSetup, toPassBookContext);

const toPassBookCase = caseTemplate<ToPassBook>({
  id: 'case-bank-to-pass-book',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'From the cash book balance to the pass book',
  setup: toPassBookSetup,
  context: toPassBookContext,
  parts: [
    {
      kind: 'mcq',
      make: (s) =>
        choice({
          prompt: 'Which of these items is already entered in the cash book but not yet in the pass book?',
          correct: `Item ${numberOf(s, s.timingItem)}: ${s.timingItem.short}`,
          distractors: s.items
            .filter((i) => i.group !== 'timing')
            .map((i) => ({
              text: `Item ${numberOf(s, i)}: ${i.short}`,
              why: i.group === 'cleared' ? 'Both books already show this cheque: the firm entered it and the bank has dealt with it.' : 'The bank made this entry on its own. The firm learns of it from the pass book, so only the pass book shows it so far.',
            })),
          explanation: `${s.timingItem.reason} So item ${numberOf(s, s.timingItem)} is in the cash book only. The items the bank entered on its own are in the pass book only.`,
          hints: BRS_HINTS,
        }),
    },
    entryPart((_s, item) => `Pass the journal entry the firm now makes in its books for item ${item}.`),
    sidePart(toPassBookNumeric, 'add'),
    sidePart(toPassBookNumeric, 'less'),
    {
      kind: 'mcq',
      make: () =>
        choice({
          prompt: 'The statement ends with a favourable balance as per pass book. How does the pass book show such a balance?',
          correct: 'As a credit balance: the bank owes this money to the firm',
          distractors: [
            { text: 'As a debit balance, on the same side as in the cash book', why: "Assumed both books show the balance on the same side. The pass book is written from the bank's side, so the sides are reversed." },
            { text: 'As a debit balance: the firm owes this money to the bank', why: 'Described an overdraft. The balance here is favourable: the firm has money in the bank.' },
            { text: 'As a credit balance: the firm owes this money to the bank', why: 'Got the side right but the meaning wrong: a credit balance in the pass book is money the bank owes the firm.' },
          ],
          explanation:
            "The pass book is a copy of the firm's account in the books of the bank. Money the firm keeps there is owed by the bank to the firm, so the bank shows it as a credit balance. The firm shows the same money as a debit balance in the bank column of its cash book.",
        }),
    },
    closingPart(toPassBookNumeric, () => 'What is the balance as per the pass book? It is a favourable balance.'),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 3: from the pass book balance back to the cash book balance.
// ---------------------------------------------------------------------------------------------------------------

interface FromPassBook extends Brs {
  entryItem: Item;
  askItem: Item;
}

const NEEDS_ENTRY = new Set(['charges', 'interestCr', 'interestDr', 'directDep', 'standing', 'dishonoured', 'dividend']);

function fromPassBookSetup(rng: Rng): FromPassBook | null {
  const { firm } = rng.pick(FIRMS);
  const date = rng.pick(CLOSING_DATES);
  const p = people(rng);
  const indirect = rng.pick(['none', 'issued', 'deposited'] as const);
  const timing = [issued(indirect === 'issued')(rng, p, date), deposited(indirect === 'deposited')(rng, p, date)];
  const count = rng.pick([2, 3, 3, 4]);
  const bank = rng.shuffle(BANK_ITEMS).slice(0, count).map((make) => make(rng, p, date));
  // With two bank items the count question needs the distracting cheque to have two wrong answers.
  const decoy = count === 2 || (count === 3 && rng.next() < 0.4) ? [cleared(rng, p, date)] : [];
  const items = rng.shuffle([...timing, ...bank, ...decoy]);
  const start = roomyBalance(rng, items);
  const result = reconcile('pb', start, items);
  if (result === start) return null;
  const entryItem = rng.pick(bank);
  const askItem = rng.pick(live(items).filter((i) => i !== entryItem));
  return { firm, date, from: 'pb', start, items, result, entryItem, askItem };
}

const fromPassBookContext = (s: FromPassBook): string =>
  [`On ${s.date} the pass book of ${s.firm} showed a favourable balance of ${fmt(s.start)}.`, CASH_BOOK_WANTED, PASS_BOOK_ONLY, ...listItems(s.items)].join('\n');

const fromPassBookNumeric = numericFor(fromPassBookSetup, fromPassBookContext);

const fromPassBookCase = caseTemplate<FromPassBook>({
  id: 'case-bank-from-pass-book',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'From the pass book balance back to the cash book',
  setup: fromPassBookSetup,
  context: fromPassBookContext,
  parts: [
    treatPart(),
    fromPassBookNumeric(
      'number',
      (s) => {
        const enter = s.items.filter((i) => i.group === 'bank');
        const inCashBook = s.items.filter((i) => i.group !== 'bank');
        const extra = s.items.filter((i) => i.sign === 0);
        return {
          prompt: 'For how many of the items listed will the firm have to make an entry in its own cash book?',
          answer: enter.length,
          commonErrors: [
            { value: live(s.items).length, why: 'Counted the cheques not yet presented and not yet collected as well. They are already in the cash book.' },
            { value: inCashBook.length, why: 'Counted the items already in the cash book instead of the items it lacks.' },
            ...(extra.length > 0 ? [{ value: s.items.length, why: 'Counted every item listed, although the cash book already has the cheques.' }] : []),
            ...(enter.some((i) => i.key === 'dishonoured')
              ? [{ value: enter.length - 1, why: 'Left out the dishonoured cheque. The cash book has its deposit, but not yet the dishonour, which needs an entry of its own.' }]
              : []),
          ],
          explanation: [
            'The cash book needs an entry only for what it lacks: the items the bank entered on its own.',
            `These are items ${enter.map((i) => numberOf(s, i)).join(', ')}, which makes ${enter.length}.`,
            'The cheques not yet presented or collected are already in the cash book. They stay in the reconciliation statement until the bank deals with them.',
            ...extra.map((i) => `Item ${numberOf(s, i)} is in both books and needs nothing.`),
          ],
          hints: ['Sort the items into those the firm entered first and those the bank entered first.', 'Only what the bank entered first is missing from the cash book.'],
        };
      },
      (s) => s.items.filter((i) => NEEDS_ENTRY.has(i.key)).length,
    ),
    entryPart((_s, item) => `Pass the journal entry the firm will make in its books for item ${item}.`),
    sidePart(fromPassBookNumeric, 'add'),
    sidePart(fromPassBookNumeric, 'less'),
    closingPart(fromPassBookNumeric, () => 'What is the balance as per the cash book (bank column)? It is a favourable balance.'),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 4: the starting balance is an overdraft.
// ---------------------------------------------------------------------------------------------------------------

interface Overdrawn extends Brs {
  entryItem: Item;
  askItem: Item;
}

function overdrawnSetup(rng: Rng): Overdrawn | null {
  const { firm } = rng.pick(FIRMS);
  const date = rng.pick(CLOSING_DATES);
  const p = people(rng);
  const from: Book = rng.pick(['cb', 'pb'] as const);
  // In about half the cases the cheque that reduces the overdraft is a large one, so that the other book can show a favourable balance.
  const cross = rng.next() < 0.5;
  const big: [number, number] = [22000, 45000];
  const small: [number, number] = [3000, 12000];
  const usual: [number, number] = [3000, 30000];
  // From the cash book it is the cheques not yet presented that reduce the overdraft; from the pass book, those not yet collected.
  const issuedRange = !cross ? usual : from === 'cb' ? big : small;
  const depositedRange = !cross ? usual : from === 'cb' ? small : big;
  const timing = [issued(false, ...issuedRange)(rng, p, date), deposited(false, ...depositedRange)(rng, p, date)];
  const extra = rng.shuffle([charges, directDeposit, standing, dishonoured, dividend]).slice(0, rng.int(1, 2)).map((make) => make(rng, p, date));
  // The overdraft is fixed before the interest on it, which is then a small part of it and cannot change which
  // side of zero the other book ends on: a margin of 4,000 (or of 5,000, with a roomy overdraft) is kept for it.
  const others = [...timing, ...extra];
  const towardsFavourable = reconcile(from, 0, others);
  let start: Paise;
  if (cross && towardsFavourable >= rupees(7000)) {
    const most = Math.floor((towardsFavourable / 100 - 4000) / 500) * 500;
    start = -rupees(rng.step(Math.min(3000, most), most, 500));
  } else {
    start = -roomyBalance(rng, others);
  }
  const interest = interestDr(rng, -start);
  const items = rng.shuffle([...timing, interest, ...extra]);
  const result = reconcile(from, start, items);
  if (result === 0 || result === start) return null;
  const entryItem = rng.next() < 0.5 ? interest : rng.pick(extra);
  const askItem = rng.pick(items.filter((i) => i !== entryItem));
  return { firm, date, from, start, items, result, entryItem, askItem };
}

const overdrawnContext = (s: Overdrawn): string =>
  [
    s.from === 'cb'
      ? `On ${s.date} the cash book (bank column) of ${s.firm} showed a credit balance, that is an overdraft, of ${fmt(-s.start)}.`
      : `On ${s.date} the pass book of ${s.firm} showed a debit balance, that is an overdraft, of ${fmt(-s.start)}.`,
    ...(s.from === 'cb' ? [PASS_BOOK_ONLY] : [CASH_BOOK_WANTED, PASS_BOOK_ONLY]),
    ...listItems(s.items),
  ].join('\n');

const overdrawnNumeric = numericFor(overdrawnSetup, overdrawnContext);
const closingName = (to: Book) => (to === 'cb' ? 'the balance as per the cash book (bank column)' : 'the balance as per the pass book');

const overdrawnCase = caseTemplate<Overdrawn>({
  id: 'case-bank-overdraft',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Reconciling from an overdraft',
  setup: overdrawnSetup,
  context: overdrawnContext,
  parts: [
    entryPart((s, item) => `Pass the journal entry the firm ${s.from === 'cb' ? 'now makes' : 'will make'} in its books for item ${item}.`),
    treatPart(),
    sidePart(overdrawnNumeric, 'add'),
    sidePart(overdrawnNumeric, 'less'),
    {
      kind: 'mcq',
      make: (s) => {
        const to = otherBook(s.from);
        // In the cash book a favourable balance is a debit balance; in the pass book it is a credit balance.
        const text = (favourable: boolean, side: 'debit' | 'credit') => `${favourable ? 'A favourable balance' : 'An overdraft'}, shown as a ${side} balance`;
        const sideFor = (favourable: boolean): 'debit' | 'credit' => ((to === 'cb') === favourable ? 'debit' : 'credit');
        const flip = (side: 'debit' | 'credit') => (side === 'debit' ? 'credit' : 'debit');
        const fav = s.result > 0;
        const adds = total(live(s.items).filter((i) => isAdd(s.from, s.start, i)));
        const lesses = total(live(s.items).filter((i) => !isAdd(s.from, s.start, i)));
        const sides =
          to === 'pb'
            ? "The pass book is written from the bank's side: there an overdraft is a debit balance and a favourable balance a credit balance."
            : 'In the cash book (bank column) a favourable balance is a debit balance and an overdraft a credit balance.';
        return choice({
          prompt: `Is ${closingName(to)} a favourable balance or an overdraft, and on which side does the ${bookName(to)} show it?`,
          correct: text(fav, sideFor(fav)),
          distractors: [
            {
              text: text(!fav, sideFor(!fav)),
              why: fav
                ? 'Assumed an overdraft in one book must be an overdraft in the other. Here the items that reduce the overdraft come to more than the overdraft and the items that increase it together.'
                : 'Took the items that reduce the overdraft to be larger than the overdraft and the items that increase it together. They are smaller, so the account is still overdrawn.',
            },
            { text: text(fav, flip(sideFor(fav))), why: `Right kind of balance, wrong side. ${sides}` },
            { text: text(!fav, flip(sideFor(!fav))), why: 'Got the kind of balance wrong, and also put it on the side the other book would use for it.' },
          ],
          explanation:
            `The overdraft of ${fmt(-s.start)} and the items that increase it (${fmt(adds)}) come to ${fmt(-s.start + adds)} in all. The items that reduce it come to ${fmt(lesses)}. ` +
            (fav ? 'That is more, so the overdraft turns into a favourable balance. ' : 'That is less, so the account is still overdrawn. ') +
            sides,
          hints: ['Compare the items that reduce the overdraft with the overdraft and the items that increase it taken together.', 'The cash book and the pass book show the same balance on opposite sides.'],
        });
      },
    },
    closingPart(overdrawnNumeric, (s) => `What is the amount of ${closingName(otherBook(s.from))}? Type the amount only, whether it is a favourable balance or an overdraft.`),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Errors: in the cash book itself (a wrong total, a wrong amount) and by the bank.
// ---------------------------------------------------------------------------------------------------------------

const castError =
  (side: 'receipts' | 'payments', way: 'under' | 'over'): Maker =>
  (rng) => {
    const a = amount(rng, 200, 3000, 100);
    const wrongTotal = way === 'under' ? 'low' : 'high';
    // Receipts totalled too low, or payments totalled too high, leave the cash book balance too low.
    const tooLow = (side === 'receipts') === (way === 'under');
    return {
      key: `${side === 'receipts' ? 'rec' : 'pay'}${way === 'under' ? 'Under' : 'Over'}`,
      group: 'cbError', sign: tooLow ? 1 : -1, amount: a,
      line: `The ${side} side of the bank column was ${way}-cast (totalled too ${wrongTotal}) by ${fmt(a)}.`,
      label: `${cap(side)} side of the cash book ${way}-cast`,
      short: `the ${way}-casting of the ${side} side`,
      reason: `The ${side} side of the bank column was totalled too ${wrongTotal}, so the cash book balance is too ${tooLow ? 'low' : 'high'}.`,
      mistake: `Thought that a ${side} side totalled too ${wrongTotal} makes the cash book balance too ${tooLow ? 'high' : 'low'}.`,
    };
  };

const CAST_ERRORS: Maker[] = [castError('receipts', 'under'), castError('receipts', 'over'), castError('payments', 'under'), castError('payments', 'over')];

/** A cheque entered in the cash book at a wrong amount; the bank has it at the right one. `amount` is the difference. */
const wrongAmount =
  (kind: 'payLess' | 'payMore' | 'recLess' | 'recMore'): Maker =>
  (rng, p) => {
    let lo: Paise;
    let hi: Paise;
    if (rng.next() < 0.5) {
      // Two figures changed places: 8,700 written as 7,800.
      const a = rng.int(2, 9);
      const b = rng.int(1, a - 1);
      hi = rupees((10 * a + b) * 100);
      lo = rupees((10 * b + a) * 100);
    } else {
      lo = amount(rng, 2000, 15000, 500);
      hi = lo + rupees(rng.pick([100, 200, 300, 400, 1000, 2000]));
    }
    const pay = kind.startsWith('pay');
    const less = kind.endsWith('Less');
    const actual = less ? hi : lo;
    const entered = less ? lo : hi;
    const who = pay ? p.sup() : p.cust();
    // A payment entered for too little, or a receipt entered for too much, leaves the cash book balance too high.
    const tooHigh = pay === less;
    return {
      key: kind, group: 'cbError', sign: tooHigh ? -1 : 1, amount: hi - lo,
      line: pay
        ? `A cheque for ${fmt(actual)} issued to ${who} was entered in the cash book as ${fmt(entered)}; the bank paid ${fmt(actual)}.`
        : `A cheque for ${fmt(actual)} from ${who} was entered in the cash book as ${fmt(entered)}; the bank credited ${fmt(actual)}.`,
      label: `Cheque ${pay ? 'to' : 'from'} ${who} entered for too ${less ? 'little' : 'much'} (the difference)`,
      short: `the cheque ${pay ? 'to' : 'from'} ${who} entered at a wrong amount`,
      reason: `The cash book shows a ${less ? 'smaller' : 'larger'} ${pay ? 'payment' : 'receipt'} than the bank ${pay ? 'paid' : 'credited'}, so the cash book balance is too ${tooHigh ? 'high' : 'low'} by the difference.`,
      mistake: `Thought that a ${pay ? 'payment' : 'receipt'} entered for too ${less ? 'little' : 'much'} makes the cash book balance too ${tooHigh ? 'low' : 'high'}.`,
      naive: entered,
      calc: `Difference between the two amounts = ${fmt(hi)} - ${fmt(lo)} = ${fmt(hi - lo)}.`,
      figures: { entered, actual },
    };
  };

const WRONG_AMOUNTS: Maker[] = [wrongAmount('payLess'), wrongAmount('payMore'), wrongAmount('recLess'), wrongAmount('recMore')];

const bankError =
  (way: 'Dr' | 'Cr'): Maker =>
  (rng) => {
    const a = amount(rng, 1000, 9000, 100);
    return way === 'Dr'
      ? {
          key: 'bankErrDr', group: 'bankError', sign: -1, amount: a,
          line: `The bank wrongly debited the account with ${fmt(a)}, a cheque drawn by another customer.`,
          label: 'Amount wrongly debited by the bank',
          short: 'the amount wrongly debited by the bank',
          reason: "The bank took out an amount that is not the firm's, so the pass book balance is too low until the bank corrects it.",
          mistake: "Treated the bank's wrong debit as money added to the account.",
        }
      : {
          key: 'bankErrCr', group: 'bankError', sign: 1, amount: a,
          line: `The bank wrongly credited the account with ${fmt(a)}, a deposit made by another customer.`,
          label: 'Amount wrongly credited by the bank',
          short: 'the amount wrongly credited by the bank',
          reason: "The bank added an amount that is not the firm's, so the pass book balance is too high until the bank corrects it.",
          mistake: "Treated the bank's wrong credit as money taken out of the account.",
        };
  };

// ---------------------------------------------------------------------------------------------------------------
// Case 5: the amended cash book first, then the reconciliation with only the timing differences left.
// ---------------------------------------------------------------------------------------------------------------

interface Amended extends Brs {
  /** What the amended cash book takes in. */
  adjust: Item[];
  timing: Item[];
  decoy: Item;
  amended: Paise;
  entryItem: Item;
  sideItem: Item;
  /** The cheques given as two figures. */
  indirectItem: Item;
}

function amendedSetup(rng: Rng): Amended | null {
  const { firm } = rng.pick(FIRMS);
  const date = rng.pick(CLOSING_DATES);
  const p = people(rng);
  const indirect = rng.pick(['issued', 'deposited'] as const);
  const timing = [issued(indirect === 'issued')(rng, p, date), deposited(indirect === 'deposited')(rng, p, date)];
  const count = rng.pick([2, 3, 3, 4]);
  const cast = rng.next() < 0.5 ? [rng.pick(CAST_ERRORS)(rng, p, date)] : [];
  const bank = rng.shuffle(BANK_ITEMS).slice(0, count - cast.length).map((make) => make(rng, p, date));
  const decoy = cleared(rng, p, date);
  const adjust = [...bank, ...cast];
  const items = rng.shuffle([...timing, ...adjust, decoy]);
  const start = roomyBalance(rng, items);
  const amended = reconcile('cb', start, adjust);
  const result = reconcile('cb', start, items);
  if (amended === start || result === amended || result === start) return null;
  const entryItem = rng.pick(bank);
  const sideItem = cast[0] ?? rng.pick(adjust.filter((i) => i !== entryItem));
  return { firm, date, from: 'cb', start, items, result, adjust, timing, decoy, amended, entryItem, sideItem, indirectItem: timing.find((i) => i.naive !== undefined)! };
}

const amendedContext = (s: Amended): string =>
  [
    `On ${s.date} the cash book (bank column) of ${s.firm} showed a favourable balance of ${fmt(s.start)}.`,
    'The firm will first amend its cash book, and then reconcile the amended balance with the pass book.',
    PASS_BOOK_ONLY,
    ...listItems(s.items),
  ].join('\n');

const amendedNumeric = numericFor(amendedSetup, amendedContext);
const CASH_BOOK_KEYS = new Set([...NEEDS_ENTRY, 'recUnder', 'recOver', 'payUnder', 'payOver', 'payLess', 'payMore', 'recLess', 'recMore']);

const amendedCase = caseTemplate<Amended>({
  id: 'case-bank-amended-cash-book',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Amended cash book, then the reconciliation',
  setup: amendedSetup,
  context: amendedContext,
  parts: [
    amendedNumeric(
      'number',
      (s) => ({
        prompt: 'For how many of the items listed is an entry or a correction made when the cash book is amended?',
        answer: s.adjust.length,
        commonErrors: [
          { value: s.adjust.length + s.timing.length, why: 'Counted the cheques not yet presented and not yet collected as well. They are already in the cash book and need no entry.' },
          { value: s.items.length, why: 'Counted every item listed. The cash book already has the cheques, whether or not the bank has dealt with them.' },
          { value: s.adjust.length + 1, why: 'Counted the cheque that the bank has already dealt with. Both books show it, so nothing is needed.' },
          { value: s.timing.length + 1, why: 'Counted the items already in the cash book instead of the items it lacks or has wrong.' },
        ],
        explanation: [
          'The amended cash book takes in what the cash book lacks (the items the bank entered on its own) and what it has wrong (its own errors).',
          `These are items ${numbersOf(s, s.adjust)}, which makes ${s.adjust.length}.`,
          `Items ${numbersOf(s, s.timing)} are already in the cash book: the bank has simply not dealt with those cheques yet.`,
          `Item ${numberOf(s, s.decoy)} is in both books and needs nothing.`,
        ],
        hints: ['Sort the items: what only the pass book shows, what the cash book has wrong, and what only the cash book shows.', 'Only the first two groups change the cash book.'],
      }),
      (s) => s.items.filter((i) => CASH_BOOK_KEYS.has(i.key)).length,
    ),
    entryPart((_s, item) => `Pass the journal entry for item ${item}, made when the cash book is amended.`),
    {
      kind: 'mcq',
      make: (s) => {
        const i = s.sideItem;
        const debit = 'The debit side: it increases the balance at bank';
        const credit = 'The credit side: it reduces the balance at bank';
        return choice({
          prompt: `On which side of the bank column of the amended cash book is item ${numberOf(s, i)} entered?`,
          correct: i.sign > 0 ? debit : credit,
          distractors: [
            { text: i.sign > 0 ? credit : debit, why: i.mistake },
            { text: 'Neither side: it belongs only in the reconciliation statement', why: 'Treated something the cash book lacks or has wrong as a timing difference. Only the cheques that the bank has not yet dealt with are left to the statement.' },
            { text: 'Neither side: the bank has to correct it', why: 'Blamed the bank. The bank has made no mistake here; it is the cash book that is incomplete or wrong.' },
          ],
          explanation: `${i.reason} The amended cash book must therefore show ${i.sign > 0 ? 'more' : 'less'} money, so the amount goes on the ${i.sign > 0 ? 'debit' : 'credit'} side of the bank column.`,
        });
      },
    },
    amendedNumeric(
      'rupees',
      (s) => {
        const net = (list: readonly Item[]) => sum(list.map((i) => i.sign * i.amount));
        const bank = s.adjust.filter((i) => i.group === 'bank');
        return {
          prompt: 'What is the balance of the bank column after the cash book is amended? It is a favourable balance.',
          answer: s.amended,
          commonErrors: [
            { value: s.result, why: 'Adjusted for every item, including the cheques not yet presented or collected. Those are already in the cash book, and the figure reached is the pass book balance.' },
            { value: s.start - net(s.adjust), why: 'Entered every item on the wrong side of the amended cash book.' },
            ...(bank.length < s.adjust.length ? [{ value: s.start + net(bank), why: 'Entered the items found in the pass book but did not correct the wrong total in the cash book itself.' }] : []),
            { value: s.amended - s.decoy.ghost! * s.decoy.amount, why: `Entered ${s.decoy.short} once more in the amended cash book, which already has it.` },
            ...s.adjust.map((i) => ({ value: s.amended - 2 * i.sign * i.amount, why: `Entered ${i.short} on the wrong side.` })),
            { value: s.start, why: 'Left the cash book balance as it was.' },
          ],
          explanation: [
            'The amended cash book takes in only what the cash book lacks or has wrong. The cheques not yet presented or collected are already in it.',
            ...statement('cb', s.start, s.adjust, 'Balance as per cash book before amendment', 'Balance as per amended cash book'),
          ],
          hints: BRS_HINTS,
        };
      },
      (s) => byRules('cb', s.start, s.adjust).end,
    ),
    amendedNumeric(
      'rupees',
      (s) => {
        const i = s.indirectItem;
        const whole = i.naive!;
        const what = i.key === 'issued' ? 'not yet presented for payment' : 'not yet collected by the bank';
        return {
          prompt: `Item ${numberOf(s, i)} gives two figures. What is the amount of the cheques ${what} on ${s.date}?`,
          answer: i.amount,
          commonErrors: [
            { value: whole, why: 'Gave all the cheques of the week. Those the bank has already dealt with no longer make the two books differ.' },
            { value: whole - i.amount, why: 'Gave the cheques the bank has already dealt with. Both books show those; the difference lies in the rest.' },
            { value: 2 * whole - i.amount, why: 'Added the two figures instead of taking one from the other.' },
          ],
          explanation: [i.calc!, i.reason],
          hints: ['Only the cheques the bank has not yet dealt with make the two books differ.', 'Take the cheques the bank has dealt with away from all the cheques of the week.'],
        };
      },
      // Backwards from the two balances: what the amended balance and the other cheques leave unexplained.
      (s) => {
        const other = s.timing.find((i) => i !== s.indirectItem)!;
        return s.indirectItem.sign * (s.result - s.amended - other.sign * other.amount);
      },
    ),
    {
      kind: 'mcq',
      make: (s) =>
        choice({
          prompt: 'Which items appear in the reconciliation statement drawn up after the cash book is amended?',
          correct: `Only items ${numbersOf(s, s.timing)}`,
          distractors: [
            { text: 'Every item listed', why: 'Kept the items that have just been entered in the cash book. Both books now show them, so they no longer explain any difference.' },
            { text: `Only items ${numbersOf(s, s.adjust)}`, why: 'Chose the items entered in the amended cash book. Both books now show those. What is left is what only the cash book shows.' },
            { text: `Only items ${numbersOf(s, [...s.timing, s.decoy])}`, why: 'Included a cheque that the bank has already dealt with. Both books show it.' },
            { text: 'None: once the cash book is amended the two balances agree', why: 'Forgot the cheques that the bank has not yet paid or collected. They keep the two balances apart until the bank deals with them.' },
          ],
          explanation:
            `After the amendment the cash book has everything the pass book has. The only differences left are the cheques that are in the cash book but not yet in the pass book: items ${numbersOf(s, s.timing)}.`,
        }),
    },
    amendedNumeric(
      'rupees',
      (s) => {
        const net = (list: readonly Item[], value: (i: Item) => Paise = (i) => i.amount) => sum(list.map((i) => i.sign * value(i)));
        return {
          prompt: 'Starting from the amended balance, what is the balance as per the pass book? It is a favourable balance.',
          answer: s.result,
          commonErrors: [
            { value: s.amended, why: 'Stopped at the amended cash book balance. The cheques not yet presented or collected still separate it from the pass book balance.' },
            { value: s.amended + net(s.timing, (i) => i.naive ?? i.amount), why: 'Used all the cheques of the week where only those the bank has not yet dealt with make the books differ.' },
            { value: s.start + net(s.timing), why: 'Reconciled the cash book balance as it stood, without amending it first.' },
            { value: s.amended - net(s.timing), why: 'Took the cheques not yet presented and the cheques not yet collected the wrong way round.' },
            { value: s.result + s.decoy.ghost! * s.decoy.amount, why: `Adjusted for ${s.decoy.short}. Both books already show it.` },
            { value: s.amended + total(s.timing), why: 'Added both kinds of cheque. The cheques not yet collected are deducted.' },
          ],
          explanation: [
            ...statement('cb', s.amended, s.timing, 'Balance as per amended cash book', 'Balance as per pass book'),
            `Item ${numberOf(s, s.decoy)} is left out: both books already show it.`,
            'Check: a single statement from the cash book balance before amendment, taking every item, ends at the same pass book balance.',
          ],
          hints: BRS_HINTS,
        };
      },
      // The other route: one statement straight from the cash book balance before amendment.
      (s) => byRules('cb', s.start, s.items).end,
    ),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 6: petty cash on the imprest system beside the main cash book.
// ---------------------------------------------------------------------------------------------------------------

const PETTY_HEADS: Record<string, string[]> = {
  Postage: ['Postage stamps', 'Speed post for a parcel', 'Registered letter to a supplier'],
  Conveyance: ['Auto fare to the bank', 'Bus fare for the office attendant', 'Taxi fare to a customer'],
  Stationery: ['Pens and pencils', 'Printer paper', 'File covers'],
  Refreshments: ['Tea for the staff', 'Snacks for visitors', 'Cold drinks for a customer'],
  Repairs: ['Mending a chair', 'Repair of a door lock', 'Servicing a table fan'],
};

interface PettySpend {
  date: string;
  what: string;
  head: string;
  amt: Paise;
}

interface MainTx {
  date: string;
  text: string;
  col: 'cash' | 'bank';
  sign: 1 | -1;
  amt: Paise;
  lines: JournalLine[];
}

interface Petty {
  firm: string;
  first: string;
  last: string;
  imprest: Paise;
  /** The new imprest, when it is raised at the end of the week. */
  raisedTo: Paise | null;
  spends: PettySpend[];
  advance: Paise;
  /** The analysis column asked for: it has two payments. */
  head: string;
  /** The column of the main cash book from which the petty cashier is paid. */
  col: 'cash' | 'bank';
  cash0: Paise;
  bank0: Paise;
  main: MainTx[];
  /** Total paid out of petty cash, the cash left with the petty cashier, and the amount the main cashier hands over. */
  paid: Paise;
  hand: Paise;
  handed: Paise;
  closing: Paise;
}

function pettySetup(rng: Rng): Petty | null {
  const { firm } = rng.pick(FIRMS);
  const p = people(rng);
  const month = rng.pick(MONTHS);
  const day0 = rng.int(1, 23);
  const on = (offset: number) => `${day0 + offset} ${month}`;
  const heads = rng.shuffle(Object.keys(PETTY_HEADS));
  const head = heads[0];
  const picked = rng.shuffle([
    ...rng.shuffle(PETTY_HEADS[head]).slice(0, 2).map((what) => ({ head, what })),
    ...heads.slice(1, 4).map((h) => ({ head: h, what: rng.pick(PETTY_HEADS[h]) })),
  ]);
  const days = rng.shuffle([0, 1, 2, 3, 4, 5]).slice(0, picked.length).sort((a, b) => a - b);
  // Five different amounts, so that no wrong answer can be read two ways.
  const amounts = rng.shuffle(Array.from({ length: 43 }, (_, k) => 60 + 10 * k)).slice(0, picked.length);
  const spends: PettySpend[] = picked.map((x, i) => ({ ...x, date: on(days[i]), amt: rupees(amounts[i]) }));
  const advance = rng.next() < 0.4 ? rupees(rng.pick([300, 400, 500])) : 0;
  const paid = sum(spends.map((x) => x.amt)) + advance;
  const imprest = rupees(Math.max(2000, Math.ceil((paid / 100 + 400) / 500) * 500) + rng.pick([0, 500, 1000]));
  const raisedTo = rng.next() < 0.3 ? imprest + rupees(rng.pick([500, 1000])) : null;
  const hand = imprest - paid;
  const handed = (raisedTo ?? imprest) - hand;

  const col = rng.pick(['cash', 'cash', 'bank'] as const);
  const cash0 = amount(rng, 15000, 40000, 1000);
  const bank0 = amount(rng, 40000, 90000, 5000);
  const mainDays = rng.shuffle([0, 1, 2, 3, 4]).slice(0, 3).sort((a, b) => a - b);
  const receipt = amount(rng, 5000, 15000, 500);
  const payment = amount(rng, 2000, 7000, 500);
  const other = amount(rng, 3000, 9000, 500);
  const customer = p.cust();
  const supplier = p.sup();
  const main: MainTx[] =
    col === 'cash'
      ? [
          { date: '', col: 'cash', sign: 1, amt: receipt, text: `Goods sold for cash ${fmt(receipt)}.`, lines: [dr('cash', receipt), cr('sales', receipt)] },
          { date: '', col: 'cash', sign: -1, amt: payment, text: `Wages paid in cash ${fmt(payment)}.`, lines: [dr('wages', payment), cr('cash', payment)] },
        ]
      : [
          { date: '', col: 'bank', sign: 1, amt: receipt, text: `Cheque for ${fmt(receipt)} received from ${customer}, a debtor, and banked the same day.`, lines: [dr('bank', receipt), cr(debtor(customer), receipt)] },
          { date: '', col: 'bank', sign: -1, amt: payment, text: `Salaries paid by cheque ${fmt(payment)}.`, lines: [dr('salaries', payment), cr('bank', payment)] },
        ];
  // A payment from the other column of the main cash book: a fact that does not belong to the closing balance asked for.
  if (advance === 0 && rng.next() < 0.5) {
    main.push(
      col === 'cash'
        ? { date: '', col: 'bank', sign: -1, amt: other, text: `Paid ${supplier}, a creditor, ${fmt(other)} by cheque.`, lines: [dr(creditor(supplier), other), cr('bank', other)] }
        : { date: '', col: 'cash', sign: -1, amt: other, text: `Wages paid in cash ${fmt(other)}.`, lines: [dr('wages', other), cr('cash', other)] },
    );
  }
  const ordered = rng.shuffle(main).map((t, i) => ({ ...t, date: on(mainDays[i]) }));
  const open = col === 'cash' ? cash0 : bank0;
  const closing = open + sum(ordered.filter((t) => t.col === col).map((t) => t.sign * t.amt)) - handed;
  return { firm, first: on(0), last: on(5), imprest, raisedTo, spends, advance, head, col, cash0, bank0, main: ordered, paid, hand, handed, closing };
}

const payMode = (s: Petty) => (s.col === 'cash' ? 'in cash' : 'by cheque');

const pettyContext = (s: Petty): string =>
  [
    `${s.firm} keeps its petty cash on the imprest system, with an imprest of ${fmt(s.imprest)}.`,
    `On the morning of ${s.first} the petty cashier held the full imprest.`,
    `The main cash book then showed cash ${fmt(s.cash0)} and a balance at bank of ${fmt(s.bank0)}.`,
    'Paid by the petty cashier:',
    ...s.spends.map((x) => `${x.date}: ${x.what} ${fmt(x.amt)} (${x.head}).`),
    ...(s.advance > 0 ? [`${s.last}: Advance to a clerk ${fmt(s.advance)}, to be recovered from salary.`] : []),
    'Main cash book, every entry of the week:',
    ...s.main.map((t) => `${t.date}: ${t.text}`),
    s.raisedTo
      ? `${s.last}, evening: The imprest was raised to ${fmt(s.raisedTo)}, and the main cashier made the petty cash up to it ${payMode(s)}.`
      : `${s.last}, evening: The main cashier restored the imprest ${payMode(s)}.`,
  ].join('\n');

const pettyNumeric = numericFor(pettySetup, pettyContext);
const headTotal = (s: Petty, head: string) => sum(s.spends.filter((x) => x.head === head).map((x) => x.amt));

const pettyCase = caseTemplate<Petty>({
  id: 'case-bank-petty-imprest',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'Petty cash on the imprest system',
  setup: pettySetup,
  context: pettyContext,
  parts: [
    pettyNumeric(
      'rupees',
      (s) => {
        const mainPayment = s.main.find((t) => t.sign < 0)!;
        const amounts = [...s.spends.map((x) => x.amt), ...(s.advance > 0 ? [s.advance] : [])];
        return {
          prompt: 'What is the total amount paid out of petty cash during the week?',
          answer: s.paid,
          commonErrors: [
            ...(s.advance > 0 ? [{ value: s.paid - s.advance, why: 'Left out the advance because it is not an expense. It was still paid out of petty cash.' }] : []),
            { value: s.paid + mainPayment.amt, why: 'Included a payment made by the main cashier, which did not come out of petty cash.' },
            { value: s.hand, why: 'Gave the cash left with the petty cashier instead of the amount paid out.' },
            { value: s.imprest, why: 'Gave the imprest, the amount the petty cashier began with, instead of what was paid out of it.' },
          ],
          explanation: [
            `Paid by the petty cashier = ${plus(amounts)}.`,
            ...(s.advance > 0 ? ['The advance to the clerk is not an expense, but the money has left the petty cash, so it is counted.'] : []),
            'Payments made by the main cashier are not petty cash payments.',
          ],
          hints: ['Add up only what the petty cashier paid.', 'Everything paid out of the petty cash counts, whether or not it is an expense.'],
        };
      },
      // The other route: the analysis columns, one head at a time, and the advance.
      (s) => sum(Object.keys(PETTY_HEADS).map((h) => headTotal(s, h))) + s.advance,
    ),
    pettyNumeric(
      'rupees',
      (s) => {
        const mine = s.spends.filter((x) => x.head === s.head);
        const another = s.spends.find((x) => x.head !== s.head)!;
        return {
          prompt: `What is the total of the ${s.head} column of the petty cash book for the week?`,
          answer: headTotal(s, s.head),
          commonErrors: [
            { value: mine[1].amt, why: `Took only one of the two ${s.head} payments: left out the one of ${mine[0].date}.` },
            { value: s.paid, why: 'Gave the total of all the payments instead of one analysis column.' },
            { value: another.amt, why: `Read the ${another.head} column instead of the ${s.head} column.` },
            { value: mine[0].amt, why: `Took only one of the two ${s.head} payments: left out the one of ${mine[1].date}.` },
          ],
          explanation: [
            'Each payment is entered in the total column and again in the analysis column of its head.',
            `${s.head}: ${mine.map((x) => `${x.what.toLowerCase()} ${fmt(x.amt)}`).join(' + ')} = ${fmt(headTotal(s, s.head))}.`,
          ],
          hints: [`Pick out the payments marked ${s.head}.`, 'An analysis column collects the payments of one kind.'],
        };
      },
      (s) => s.paid - s.advance - sum(s.spends.filter((x) => x.head !== s.head).map((x) => x.amt)),
    ),
    pettyNumeric(
      'rupees',
      (s) => ({
        prompt: `How much cash did the petty cashier hold on the evening of ${s.last}, just before the main cashier paid anything?`,
        answer: s.hand,
        commonErrors: [
          ...(s.advance > 0 ? [{ value: s.hand + s.advance, why: 'Deducted only the expenses. The advance to the clerk also left the petty cash.' }] : []),
          { value: s.paid, why: 'Gave the amount paid out instead of the cash still in hand.' },
          { value: s.imprest, why: 'Gave the imprest without deducting the payments of the week.' },
          { value: s.imprest + s.paid, why: 'Added the payments to the imprest instead of deducting them.' },
        ],
        explanation: [`The week began with the full imprest of ${fmt(s.imprest)}.`, `Paid out during the week: ${fmt(s.paid)}.`, `Cash in hand = ${fmt(s.imprest)} - ${fmt(s.paid)} = ${fmt(s.hand)}.`],
        hints: ['The petty cashier began the week with the full imprest.', 'Cash in hand = imprest less everything paid out of it.'],
      }),
      // Backwards from the amount handed over: it brings the cash in hand up to the imprest in force.
      (s) => (s.raisedTo ?? s.imprest) - s.handed,
    ),
    pettyNumeric(
      'rupees',
      (s) => ({
        prompt: `How much did the main cashier pay the petty cashier on the evening of ${s.last}?`,
        answer: s.handed,
        commonErrors: s.raisedTo
          ? [
              { value: s.paid, why: 'Restored only the old imprest and ignored the increase.' },
              { value: s.raisedTo, why: 'Gave the whole of the new imprest, although the petty cashier still held some cash.' },
              { value: s.raisedTo - s.imprest, why: 'Gave only the increase in the imprest, without making good what had been spent.' },
              { value: s.hand, why: 'Gave the cash still held by the petty cashier.' },
            ]
          : [
              { value: s.hand, why: 'Gave the cash still held by the petty cashier instead of the amount paid out.' },
              { value: s.imprest, why: 'Gave the whole imprest again, although the petty cashier still held part of it.' },
              ...(s.advance > 0 ? [{ value: s.paid - s.advance, why: 'Made good only the expenses. The advance also left the petty cash and has to be made good.' }] : []),
              { value: s.imprest + s.paid, why: 'Added the payments to the imprest.' },
            ],
        explanation: s.raisedTo
          ? [
              `Cash in hand before the payment = ${fmt(s.imprest)} - ${fmt(s.paid)} = ${fmt(s.hand)}.`,
              `The petty cash must come up to the new imprest of ${fmt(s.raisedTo)}.`,
              `Amount paid = ${fmt(s.raisedTo)} - ${fmt(s.hand)} = ${fmt(s.handed)} (the ${fmt(s.paid)} spent plus the increase of ${fmt(s.raisedTo - s.imprest)}).`,
            ]
          : [
              'Under the imprest system the main cashier makes good exactly what was paid out, which brings the petty cash back to the fixed amount.',
              `Paid out during the week: ${fmt(s.paid)}.`,
              `Check: cash in hand ${fmt(s.hand)} + ${fmt(s.handed)} = the imprest of ${fmt(s.imprest)}.`,
            ],
        hints: ['After the payment the petty cashier must hold exactly the imprest in force.', 'Find the cash in hand first, then what it takes to bring it up to the imprest.'],
      }),
      (s) => (s.raisedTo ?? s.imprest) - (s.imprest - sum(s.spends.map((x) => x.amt)) - s.advance),
    ),
    {
      kind: 'mcq',
      make: (s) =>
        choice({
          prompt: `How is the payment to the petty cashier on ${s.last} entered in the main cash book?`,
          correct: `Credit side of the ${s.col} column, as one amount: "By Petty Cash A/c"`,
          distractors: [
            { text: `Debit side of the ${s.col} column: "To Petty Cash A/c"`, why: 'Put a payment on the receipts side. The main cashier is paying money out.' },
            { text: `Credit side of the ${s.col} column, with a separate line for each petty expense`, why: 'The separate expenses are written in the petty cash book. The main cash book shows only the one amount handed to the petty cashier.' },
            { text: 'No entry: the money has only moved within the business', why: "Thought a transfer to the petty cashier need not be entered. The main cashier's balance falls, so the payment is entered." },
            s.col === 'bank'
              ? { text: 'Both columns, as a contra entry', why: 'Took it for a contra entry. The money goes to the petty cashier, not into the cash column of the main cash book.' }
              : { text: 'Credit side of the bank column: "By Petty Cash A/c"', why: 'Used the bank column although the petty cashier was paid in cash.' },
          ],
          explanation: `The main cashier pays the petty cashier ${payMode(s)}, so it is a payment on the credit side of the ${s.col} column, "By Petty Cash A/c". The petty expenses themselves are recorded in the petty cash book and posted from there.`,
        }),
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the payment made to the petty cashier on ${s.last}.`,
        lines: [dr('pettyCash', s.handed), cr(s.col, s.handed)],
        explanation: [
          `Amount paid to the petty cashier = ${fmt(s.handed)}.`,
          'Petty Cash A/c is an asset. The petty cashier now holds more money, so it is debited.',
          s.col === 'cash' ? "The money leaves the main cashier's cash, so Cash A/c is credited." : 'A cheque is drawn on the bank, so Bank A/c is credited.',
        ],
        distractorAccounts: ['postage', 'stationery', 'generalExpenses', s.col === 'cash' ? 'bank' : 'cash'],
      }),
    },
    pettyNumeric(
      'rupees',
      (s) => {
        const open = s.col === 'cash' ? s.cash0 : s.bank0;
        const mine = s.main.filter((t) => t.col === s.col);
        const stray = s.main.find((t) => t.col !== s.col);
        const receipts = mine.filter((t) => t.sign > 0).map((t) => t.amt);
        const payments = [...mine.filter((t) => t.sign < 0).map((t) => t.amt), s.handed];
        return {
          prompt: `What is the closing balance of the ${s.col} column of the main cash book on the evening of ${s.last}?`,
          answer: s.closing,
          commonErrors: [
            { value: s.closing + s.handed, why: 'Left out the payment to the petty cashier.' },
            { value: s.closing + s.handed - (s.raisedTo ?? s.imprest), why: 'Deducted the whole imprest. The petty cashier needed only the amount that brings the petty cash up to it.' },
            ...(stray ? [{ value: s.closing - stray.amt, why: `Deducted the payment made ${stray.col === 'bank' ? 'by cheque' : 'in cash'}, which belongs to the ${stray.col} column.` }] : []),
            { value: s.closing - s.paid, why: 'Deducted the petty payments one by one as well as the amount handed to the petty cashier, so the same money was taken off twice.' },
            { value: s.closing - open, why: 'Left out the opening balance.' },
          ],
          explanation: [
            `Debit side of the ${s.col} column (opening balance and receipts): ${plus([open, ...receipts])}.`,
            `Credit side of the ${s.col} column (payments, with ${fmt(s.handed)} to the petty cashier): ${plus(payments)}.`,
            `Closing balance = ${fmt(open + sum(receipts))} - ${fmt(sum(payments))} = ${fmt(s.closing)}.`,
            'The petty payments themselves are not entered in the main cash book: only the amount handed to the petty cashier is.',
          ],
          hints: [`Take only what belongs to the ${s.col} column of the main cash book.`, 'The main cash book shows one payment to the petty cashier, not the petty expenses.'],
        };
      },
      // By posting the entries of the main cash book, and the one to the petty cashier, to a ledger.
      (s) => post([...s.main.map((t) => t.lines), [dr('pettyCash', s.handed), cr(s.col, s.handed)]], new Map([['cash', s.cash0], ['bank', s.bank0]])).get(s.col) ?? 0,
    ),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Case 7: errors among the timing differences.
// ---------------------------------------------------------------------------------------------------------------

interface WithErrors extends Brs {
  entryItem: Item;
  /** The cheque entered in the cash book at a wrong amount. */
  wrongItem: Item;
  /** The mistake made by the bank. */
  bankSlip: Item;
}

function errorsSetup(rng: Rng): WithErrors | null {
  const { firm } = rng.pick(FIRMS);
  const date = rng.pick(CLOSING_DATES);
  const p = people(rng);
  const from: Book = rng.pick(['cb', 'pb'] as const);
  const timing = [issued()(rng, p, date), deposited()(rng, p, date)];
  const entryItem = rng.pick(BANK_ITEMS)(rng, p, date);
  const wrongItem = rng.pick(WRONG_AMOUNTS)(rng, p, date);
  const cast = rng.next() < 0.5 ? [rng.pick(CAST_ERRORS)(rng, p, date)] : [];
  const bankSlip = bankError(rng.pick(['Dr', 'Cr'] as const))(rng, p, date);
  const items = rng.shuffle([...timing, entryItem, wrongItem, ...cast, bankSlip]);
  const start = roomyBalance(rng, items);
  const result = reconcile(from, start, items);
  if (result === start) return null;
  return { firm, date, from, start, items, result, entryItem, wrongItem, bankSlip };
}

const errorsContext = (s: WithErrors): string =>
  [
    `On ${s.date} the ${s.from === 'cb' ? 'cash book (bank column)' : 'pass book'} of ${s.firm} showed a favourable balance of ${fmt(s.start)}.`,
    `The ${s.from === 'cb' ? 'pass book' : 'cash book (bank column)'} balance is wanted as it stands: neither book has been corrected yet.`,
    PASS_BOOK_ONLY,
    ...listItems(s.items),
  ].join('\n');

const errorsNumeric = numericFor(errorsSetup, errorsContext);

const errorsCase = caseTemplate<WithErrors>({
  id: 'case-bank-errors',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  title: 'Errors among the timing differences',
  setup: errorsSetup,
  context: errorsContext,
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const i = s.wrongItem;
        const text = (high: boolean, by: Paise) => `It is too ${high ? 'high' : 'low'} by ${fmt(by)}`;
        const high = i.sign < 0;
        const { entered, actual } = i.figures!;
        return choice({
          prompt: `What has the mistake in item ${numberOf(s, i)} done to the balance of the cash book (bank column)?`,
          correct: text(high, i.amount),
          distractors: [
            { text: text(!high, i.amount), why: i.mistake },
            { text: text(high, entered), why: 'Took the whole amount that was entered. Only the difference between the two amounts is wrong.' },
            { text: text(high, actual), why: 'Took the whole amount of the cheque. Only the difference between the two amounts is wrong.' },
            { text: text(!high, entered), why: 'Took the whole amount that was entered, and also read the mistake the wrong way round.' },
          ],
          explanation: `${i.reason} ${i.calc}`,
          hints: ['Did the cash book take off (or add) too much or too little?', 'Only the difference between the amount entered and the right amount is wrong.'],
        });
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice({
          prompt: `What should the firm do about item ${numberOf(s, s.bankSlip)}?`,
          correct: 'Make no entry in the cash book; ask the bank to correct it, and show it in the statement until then',
          distractors: [
            { text: 'Enter it in the cash book, so that the two books agree', why: "Changed the firm's own books for a mistake that is the bank's. That would make the cash book wrong." },
            { text: 'Leave it out of the statement, because the firm made no mistake', why: 'Left out an item that explains part of the difference. Whoever made the mistake, the two balances differ by it.' },
            { text: 'Treat it as a timing difference that clears by itself in a few days', why: 'A timing difference disappears when the bank deals with the cheque. A mistake stays until the bank corrects it.' },
          ],
          explanation: `${s.bankSlip.reason} The cash book is right, so the firm makes no entry. It tells the bank, and the item stays in the reconciliation statement until the pass book is corrected.`,
        }),
    },
    entryPart((s, item) => `Pass the journal entry the firm ${s.from === 'cb' ? 'now makes' : 'will make'} in its books for item ${item}.`),
    sidePart(errorsNumeric, 'add'),
    sidePart(errorsNumeric, 'less'),
    closingPart(errorsNumeric, (s) => `What is ${closingName(otherBook(s.from))} as it stands? It is a favourable balance.`),
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained cases: the long question as it is set. One month in the cash book and then the Bank Reconciliation
// Statement on its last day; a cash book balance, amended and then reconciled; or a week in the petty cash book and
// then in the main cash book, which takes from it the cash that restores the imprest. The cash books are those of the
// Cash Book topic (`CB_CHAIN`: the same transactions, rows and working as its formats) and the statements and the
// amended cash book those of this topic (`BRS_CHAIN`: the Plus and Minus columns, the names of the balances, the
// items and their entries). A statement starts from the balance the part before it ends on, which the case text
// never prints. Every part is checked by working it out again from the printed case alone: each line is read by its
// words, with no use of the entries the part was made from.
// ---------------------------------------------------------------------------------------------------------------

const CB = CB_CHAIN;
const BRS = BRS_CHAIN;
/** Every ₹ amount in a text, in order, in paise. */
const moneyIn = (text: string): Paise[] => (text.match(/₹\d[\d,]*/g) ?? []).map((m) => Number(m.slice(1).replace(/,/g, '')) * 100);
/** Names in a sentence: "Mohan", "Mohan and Kiran". */
const andList = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const PARTY_NAMES = 'In the cash book a customer or a supplier is entered by name ("To Kiran"), every other account as "... A/c".';
/** A format of a topic as a part of a case: the case text is its data. */
const asPart = ({ data, ...rest }: AccountParts): CaseAccountParts => {
  void data;
  return rest;
};

// ---- What the pass book shows that the cash book of the month does not ----------------------------------------

/** An entry the bank made on the last day, which the firm learnt of from the pass book and entered a month late. */
interface Later {
  /** The row of the statement. */
  label: string;
  /** True when it makes the pass book balance more favourable than the cash book balance. */
  up: boolean;
  amount: Paise;
  /** The line of the case text. */
  line: string;
  reason: string;
}
type LaterKey = 'charges' | 'interestCr' | 'interestOd' | 'directDep' | 'dividend';
export const LATER_LURES = ['Bank charges debited by the bank', 'Interest credited by the bank', 'Direct deposit by a customer', 'Dividend collected by the bank'];
const INTEREST_ON_OVERDRAFT = 'Interest on overdraft debited by the bank';

/**
 * `overdraft` is the overdraft the month opened with, for the interest the bank charges on it. The case text says
 * before these lines that the cash book of the month was balanced with the dated transactions alone, so an entry the
 * firm made in the next month is no part of it.
 */
function laterItem(rng: Rng, key: LaterKey, p: People, on: string, next: string, overdraft: Paise = 0): Later {
  const entered = (it: 'it' | 'them') => `; the firm entered ${it} in its cash book in ${next}.`;
  switch (key) {
    case 'charges': {
      const a = amount(rng, 100, 1500, 50);
      return {
        label: 'Bank charges debited by the bank', up: false, amount: a,
        line: `On ${on} the bank debited ${fmt(a)} as bank charges${entered('them')}`,
        reason: `The bank deducted its charges from the account on ${on}, but the cash book did not show them until ${next}.`,
      };
    }
    case 'interestCr': {
      const a = amount(rng, 200, 3000, 50);
      return {
        label: 'Interest credited by the bank', up: true, amount: a,
        line: `On ${on} the bank credited interest of ${fmt(a)}${entered('it')}`,
        reason: `The bank added the interest to the account on ${on}, but the cash book did not show it until ${next}.`,
      };
    }
    case 'interestOd': {
      // 1% to 3% of the overdraft the month opened with, as in the cases above, so that the two figures look like one account.
      const percent = rng.pick([1, 1.5, 2, 2.5, 3]);
      const a = rupees(Math.min(3000, Math.max(100, Math.round((overdraft * percent) / 500000) * 50)));
      return {
        label: INTEREST_ON_OVERDRAFT, up: false, amount: a,
        line: `On ${on} the bank debited interest of ${fmt(a)} on the overdraft${entered('it')}`,
        reason: `The bank charged the interest to the account on ${on}, but the cash book did not show it until ${next}.`,
      };
    }
    case 'directDep': {
      const a = amount(rng, 2000, 15000, 500);
      const who = p.cust();
      return {
        label: `Direct deposit by ${who}`, up: true, amount: a,
        line: `On ${on} ${who}, a debtor, paid ${fmt(a)} directly into the firm's bank account${entered('it')}`,
        reason: `The bank added the payment by ${who} to the account on ${on}, but the cash book did not show the receipt until ${next}.`,
      };
    }
    case 'dividend': {
      const a = amount(rng, 500, 6000, 100);
      return {
        label: 'Dividend collected by the bank', up: true, amount: a,
        line: `On ${on} the bank collected a dividend of ${fmt(a)} on the firm's investments${entered('it')}`,
        reason: `The bank added the dividend to the account on ${on}, but the cash book did not show it until ${next}.`,
      };
    }
  }
}

/** The same lines read by their words: what each does to the pass book balance, as against the cash book balance. */
const LATER_RULES: [RegExp, 1 | -1][] = [
  [/^On \d+ \w+ the bank debited ₹[\d,]+ as bank charges; /, -1],
  [/^On \d+ \w+ the bank credited interest of ₹[\d,]+; /, 1],
  [/^On \d+ \w+ the bank debited interest of ₹[\d,]+ on the overdraft; /, -1],
  [/^On \d+ \w+ .+, a debtor, paid ₹[\d,]+ directly into the firm's bank account; /, 1],
  [/^On \d+ \w+ the bank collected a dividend of ₹[\d,]+ on the firm's investments; /, 1],
];

// ---- A statement with Plus and Minus columns, as one part of a case --------------------------------------------

export interface ChainRow {
  label: string;
  /** True for the Plus column: the item makes the pass book balance more favourable than the cash book balance. */
  up: boolean;
  amount: Paise;
  /** Why the two balances differ because of it. */
  reason: string;
}

/**
 * The Bank Reconciliation Statement from a balance as per cash book (signed: an overdraft is negative) to the
 * balance as per pass book. With `choose` the statement may start from an overdraft: the student then names what it
 * ends on. Null when the two balances would be equal or the statement would end on nothing.
 */
export function chainStatement(o: {
  firm: string;
  date: string;
  start: Paise;
  /** What the statement starts from, as the task says it. */
  startIs: string;
  /** The book whose closing balance that is, as the working says it: "the bank column of the cash book", "the amended cash book". */
  endOf: string;
  rows: ChainRow[];
  /** The step of the working that says what is left out, and why. */
  leftOut: string;
  /** Labels a student might wrongly enter. */
  lures: string[];
  choose: boolean;
  /** True when each cheque the bank had not dealt with has a row of its own. */
  perCheque: boolean;
  hints: string[];
}): CaseStatementParts | null {
  const end = o.start + sum(o.rows.map((r) => (r.up ? r.amount : -r.amount)));
  if (o.start === 0 || end === 0 || end === o.start || (!o.choose && (o.start < 0 || end < 0))) return null;
  const overdraft = o.start < 0;
  const size = Math.abs(o.start);
  const rows = [
    { label: BRS.balanceLabel('cb', o.start), amounts: overdraft ? [0, size] : [size, 0] },
    ...o.rows.map((r) => ({ label: r.label, amounts: r.up ? [r.amount, 0] : [0, r.amount] })),
  ];
  if (new Set(rows.map((r) => r.label)).size !== rows.length) return null;
  const plusTotal = sum(rows.map((r) => r.amounts[0]));
  const minusTotal = sum(rows.map((r) => r.amounts[1]));
  const larger = plusTotal > minusTotal ? 'Plus' : 'Minus';
  const own = o.perCheque ? ', with a line of its own for each cheque that the bank had not yet paid or collected' : '';
  const added = sum(o.rows.filter((r) => !r.up).map((r) => r.amount));
  const deducted = sum(o.rows.filter((r) => r.up).map((r) => r.amount));
  const columnOf = (r: ChainRow) =>
    overdraft ? (r.up ? 'Plus column (deducted from the overdraft)' : 'Minus column (added to the overdraft)') : r.up ? 'it is added, in the Plus column' : 'it is deducted, in the Minus column';
  return {
    task: o.choose
      ? `Prepare the Bank Reconciliation Statement of ${o.firm} as on ${o.date}, starting from ${o.startIs}${own}. Show a favourable balance in the Plus column and an overdraft in the Minus column, and name what the statement ends on: a favourable balance or an overdraft.`
      : `Prepare the Bank Reconciliation Statement of ${o.firm} as on ${o.date}, starting from ${o.startIs}. Enter what is added in the Plus column and what is deducted in the Minus column${own}.`,
    title: `Bank Reconciliation Statement of ${o.firm} as on ${o.date}`,
    columns: BRS.columns,
    rows,
    final: { label: BRS.balanceLabel('pb', end), amount: Math.abs(end), ...(o.choose ? { alternatives: [BRS.balanceLabel('pb', -end)] } : {}) },
    distractors: [BRS.balanceLabel('cb', -o.start), ...o.lures],
    explanation: [
      overdraft
        ? `${cap(o.endOf)} ends on a credit balance, an overdraft, of ${fmt(size)}. An overdraft is a negative balance, so it stands in the Minus column. Every item then takes the column it would take from a favourable balance: ` +
          `an item in the Plus column reduces the overdraft (the Add and Less form of the statement deducts it), and an item in the Minus column adds to it.`
        : `The statement starts from the favourable balance as per cash book, the debit balance ${o.endOf} ends on: ${fmt(size)} in the Plus column.`,
      ...o.rows.map((r) => `${r.label}, ${fmt(r.amount)}: ${r.reason} So the pass book balance is ${r.up ? 'more' : 'less'} favourable than the cash book balance: ${columnOf(r)}.`),
      o.leftOut,
      `Plus column ${fmt(plusTotal)}, Minus column ${fmt(minusTotal)}. The ${larger} column is larger by ${fmt(Math.abs(end))}` +
        (o.choose
          ? `, so the statement ends on ${end > 0 ? 'a favourable balance' : 'an overdraft'}: "${BRS.balanceLabel('pb', end)}" ${fmt(Math.abs(end))}.${overdraft && end > 0 ? ' The items have turned the overdraft into a favourable balance.' : ''}`
          : `: the balance as per pass book is ${fmt(end)}, a favourable balance.`),
      ...(overdraft
        ? [
            end < 0
              ? `In the Add and Less form the answer is the same: overdraft ${fmt(size)}${added > 0 ? ` + ${fmt(added)} added` : ''}${deducted > 0 ? ` - ${fmt(deducted)} deducted` : ''} = an overdraft of ${fmt(-end)}.`
              : `In the Add and Less form the answer is the same: overdraft ${fmt(size)}${added > 0 ? ` + ${fmt(added)} added = ${fmt(size + added)}` : ''}; the ${fmt(deducted)} deducted is ${fmt(end)} more than that, so the overdraft turns into a favourable balance of ${fmt(end)}.`,
          ]
        : []),
    ],
    hints: o.hints,
  };
}

// ---- One month in the cash book, and the pass book of the same month -------------------------------------------

/** A cheque of the month, and whether the bank had still to pay or collect it on the last day. */
interface ChainCheque {
  issued: boolean;
  who: string;
  amount: Paise;
  out: boolean;
}

interface BookChain {
  firm: string;
  month: string;
  closeOn: string;
  plan: CashBookPlan;
  /** The cash book, as the Cash Book topic prepares it. */
  book: AccountParts;
  /** The lines of the case text before the transactions: the conventions and the opening balances. */
  intro: string[];
  cheques: ChainCheque[];
  later: Later[];
  /** Said after the comparison with the pass book: how the statement is laid out, where it may start from an overdraft. */
  layout: string[];
  /** The balance the bank column ends on, and the balance as per pass book, signed. */
  bankEnd: Paise;
  passEnd: Paise;
}

const bankMove = (d: CashBookDeal): Paise => d.lines.find((l) => l.accountId === 'bank')!.amount;
/** What the items that keep the two books apart add to the cash book balance on the way to the pass book balance. */
const gapOf = (cheques: readonly ChainCheque[], later: readonly Later[]): Paise =>
  sum(cheques.filter((q) => q.out).map((q) => (q.issued ? q.amount : -q.amount))) + sum(later.map((l) => (l.up ? l.amount : -l.amount)));

function bookChain(o: Omit<BookChain, 'book' | 'bankEnd' | 'passEnd' | 'closeOn'> & { lead: string[]; hints: string[]; distractors: string[] }): BookChain | null {
  const { lead, hints, distractors, ...rest } = o;
  const book = CB.book(o.plan, { task: CB.doubleTask(o.firm, o.month), intro: '', lead, title: `Double Column Cash Book of ${o.firm}`, distractors, hints });
  if (!book) return null;
  const bankEnd = post(CB.entriesOf(o.plan).map((e) => e.lines), new Map([['bank', o.plan.opening.bank]])).get('bank') ?? 0;
  const passEnd = bankEnd + gapOf(o.cheques, o.later);
  if (bankEnd === 0 || passEnd === 0 || passEnd === bankEnd) return null;
  return { ...rest, closeOn: o.plan.closeOn, book, bankEnd, passEnd };
}

const bookChainContext = (s: BookChain): string => {
  const names = (issued: boolean) => s.cheques.filter((q) => q.issued === issued && q.out).map((q) => q.who);
  const [toPay, toCollect] = [names(true), names(false)];
  return [
    ...s.intro,
    ...s.plan.deals.map((d, i) => `${s.plan.dates[i]}: ${d.text}.`),
    // The cash book of the month is these transactions and no others: what the pass book showed first is not in it.
    `The cash book for ${s.month} was balanced with these transactions alone, and its bank column was then compared with the pass book:`,
    ...(toPay.length > 0 ? [`• The cheque${toPay.length > 1 ? 's' : ''} issued to ${andList(toPay)} had not been presented for payment by ${s.closeOn}.`] : []),
    ...(toCollect.length > 0 ? [`• The cheque${toCollect.length > 1 ? 's' : ''} from ${andList(toCollect)} had not been collected by the bank by ${s.closeOn}.`] : []),
    ...s.later.map((l) => `• ${l.line}`),
    'Nothing else keeps the cash book and the pass book apart.',
    ...s.layout,
  ].join('\n');
};

/** The statement of a month whose cash book the student has just prepared: a row for each cheque outstanding, then what the firm entered late. */
function bookChainStatement(s: BookChain, choose: boolean): CaseStatementParts | null {
  const out = s.cheques.filter((q) => q.out);
  const settled = s.cheques.filter((q) => !q.out);
  // A row of the statement is not on offer under a second name: "Direct deposit by a customer" beside "Direct deposit by Kiran".
  const sameItem = (lure: string) => s.later.some((l) => l.label === lure || (lure.startsWith('Direct deposit') && l.label.startsWith('Direct deposit')));
  return chainStatement({
    firm: s.firm,
    date: s.closeOn,
    start: s.bankEnd,
    startIs: choose ? 'what the bank column of the cash book ends on (a favourable balance or an overdraft)' : 'the balance as per cash book (the balance the bank column of the cash book ends on)',
    endOf: 'the bank column of the cash book',
    rows: [
      ...out.map((q) => ({
        label: BRS.chequeLabel(q.issued, q.who),
        up: q.issued,
        amount: q.amount,
        reason: q.issued
          ? `The bank had not paid it by ${s.closeOn}. The cash book has deducted it and the pass book has not.`
          : `The bank had not collected it by ${s.closeOn}. The cash book has added it and the pass book has not.`,
      })),
      ...s.later.map((l) => ({ label: l.label, up: l.up, amount: l.amount, reason: l.reason })),
    ],
    leftOut: `Left out: ${settled.map((q) => `the cheque ${q.issued ? 'to' : 'from'} ${q.who}`).join('; ')}, and every other entry of the bank column. The bank had dealt with ${settled.length > 1 ? 'them' : 'it'} by ${s.closeOn}, so both books show ${settled.length > 1 ? 'them' : 'it'}.`,
    lures: [...settled.map((q) => BRS.chequeLabel(q.issued, q.who)), ...[...LATER_LURES, ...(choose ? [INTEREST_ON_OVERDRAFT] : [])].filter((label) => !sameItem(label))],
    choose,
    perCheque: true,
    // Where the student names the balance the statement starts from, the hints do not name it either.
    hints: choose
      ? [
          'What does the bank column of the cash book end on: a debit balance (a favourable balance) or a credit balance (an overdraft)? A favourable balance starts the statement in the Plus column, an overdraft in the Minus column. Then take the items one at a time: is the pass book balance more favourable or less favourable because of it?',
          'A cheque issued but not yet presented, and what the bank has added and the cash book has not, make the pass book balance more favourable: Plus column. A cheque deposited but not yet cleared, and what the bank has taken out and the cash book has not, make it less favourable: Minus column. Then compare the totals: the statement ends on a favourable balance if the Plus column is the larger, and on an overdraft if the Minus column is.',
        ]
      : [
          'Which cheques had the bank not yet paid or collected on the last day? Only those, and what the firm entered a month late, keep the two books apart.',
          'A cheque issued but not yet presented is still in the bank, so the pass book balance is higher: Plus column. A cheque deposited but not yet cleared is not yet in the bank, so the pass book balance is lower: Minus column. What the bank has added and the cash book has not goes in the Plus column; what the bank has taken out, in the Minus column.',
        ],
  });
}

// ---- The independent check: the case text read line by line ----------------------------------------------------

interface Move {
  cash: Paise;
  bank: Paise;
}
/** What a transaction does to the cash and to the bank, by its words: the sign of the first amount in each column. */
const MOVE_RULES: [fits: RegExp, cash: -1 | 0 | 1, bank: -1 | 0 | 1][] = [
  [/^Cash sales, ₹/, 1, 0],
  [/^Received ₹[\d,]+ in cash from /, 1, 0],
  [/^Received commission of ₹[\d,]+ in cash$/, 1, 0],
  [/^The proprietor brought in ₹[\d,]+ in cash as additional capital$/, 1, 0],
  [/^Received a cheque for ₹[\d,]+ from .+ It was not banked that day$/, 1, 0],
  [/^Bought goods for cash, ₹/, -1, 0],
  [/^Paid ₹[\d,]+ in cash /, -1, 0],
  [/took ₹[\d,]+ from the office cash for personal use$/, -1, 0],
  [/^Paid ₹[\d,]+ of the office cash into the bank$/, -1, 1],
  [/^Withdrew ₹[\d,]+ from the bank for office use$/, 1, -1],
  [/^Received a cheque for ₹[\d,]+ from .+ and banked it the same day$/, 0, 1],
  [/the customer paid by cheque, which was banked the same day$/, 0, 1],
  [/^Paid ₹[\d,]+ by cheque /, 0, -1],
  [/^Bought .+ and paid by cheque$/, 0, -1],
  [/withdrew ₹[\d,]+ from the bank for personal use$/, 0, -1],
];

function moveOf(text: string, dealt: readonly { date: string; text: string }[]): Move | null {
  // A cheque that was kept is deposited later for the amount it came for, which the line of that day gives.
  const kept = /^Deposited into the bank the cheque received from (.+) on (\d+ \w+)$/.exec(text);
  if (kept) {
    const came = dealt.filter((d) => d.date === kept[2] && d.text.startsWith('Received a cheque for ₹') && d.text.endsWith(` from ${kept[1]}, a debtor. It was not banked that day`));
    return came.length === 1 ? { cash: -moneyIn(came[0].text)[0], bank: moneyIn(came[0].text)[0] } : null;
  }
  const rules = MOVE_RULES.filter(([fits]) => fits.test(text));
  const [a] = moneyIn(text);
  // `|| 0` keeps a column the rule leaves alone at nil and not at minus nil.
  return rules.length === 1 && a > 0 ? { cash: rules[0][1] * a || 0, bank: rules[0][2] * a || 0 } : null;
}

/** The opening balances, the transactions and the balances the two columns end on, read from the case text. */
function readBookChain(data: string) {
  const lines = data.split('\n').map((l) => l.replace(/^• /, ''));
  const open = lines.map((l) => /^On 1 \w+ cash in hand was ₹([\d,]+) and the (balance at the bank was|bank account was overdrawn by) ₹([\d,]+)\.$/.exec(l)).find((m) => m !== null);
  if (!open) return null;
  const paise = (t: string) => Number(t.replace(/,/g, '')) * 100;
  const opening = { cash: paise(open[1]), bank: (open[2].startsWith('balance') ? 1 : -1) * paise(open[3]) };
  const dealt = lines.flatMap((l) => {
    const m = /^(\d+ \w+): (.+)\.$/.exec(l);
    return m ? [{ date: m[1], text: m[2] }] : [];
  });
  const moves: Move[] = [];
  for (const d of dealt) {
    const move = moveOf(d.text, dealt);
    if (!move) return null;
    moves.push(move);
  }
  if (moves.length < 5) return null;
  return { lines, opening, dealt, moves, cash: opening.cash + sum(moves.map((m) => m.cash)), bank: opening.bank + sum(moves.map((m) => m.bank)) };
}

/**
 * True when the cash book is the one the case text gives: each column carries on each side what the lines add to it
 * and take from it, with the opening balance on its own side; each balance is carried down on the side opposite to
 * its own and brought down on its own (an overdraft is carried down on the debit side); and the contra entries are
 * marked on both sides.
 */
function chainBookHolds(q: AccountQuestion): boolean {
  const b = readBookChain(q.data);
  if (!b || q.columns.length !== 2 || b.cash <= 0 || b.bank === 0) return false;
  const [debit, credit] = q.sides;
  const col = (rows: readonly FormatRow[], c: number) => sum(rows.map((r) => r.amounts[c]));
  const closing = (rows: readonly FormatRow[]) => rows.filter((r) => r.closing);
  const body = (rows: readonly FormatRow[]) => rows.filter((r) => !r.closing);
  const size = Math.abs(b.bank);
  const [own, other] = b.bank > 0 ? [debit, credit] : [credit, debit];
  const carried = col(closing(credit.rows), 0) === b.cash && col(closing(debit.rows), 0) === 0 && col(closing(other.rows), 1) === size && col(closing(own.rows), 1) === 0;
  const brought = col(debit.below, 0) === b.cash && col(credit.below, 0) === 0 && col(own.below, 1) === size && col(other.below, 1) === 0;
  const up = (xs: readonly number[]) => sum(xs.filter((x) => x > 0));
  const down = (xs: readonly number[]) => -sum(xs.filter((x) => x < 0));
  const cash = b.moves.map((m) => m.cash);
  const bank = b.moves.map((m) => m.bank);
  const sides =
    col(body(debit.rows), 0) === b.opening.cash + up(cash) &&
    col(body(credit.rows), 0) === down(cash) &&
    col(body(debit.rows), 1) === up([b.opening.bank]) + up(bank) &&
    col(body(credit.rows), 1) === down([b.opening.bank]) + down(bank);
  const contras = b.moves.filter((m) => m.cash !== 0 && m.bank !== 0).length;
  const marked = q.sides.every((s) => s.rows.filter((r) => r.contra).length === contras);
  // One row for every transaction, two for a contra entry, and the opening balances (two rows when the bank is overdrawn).
  const count = body(debit.rows).length + body(credit.rows).length === b.moves.length + contras + (b.opening.bank < 0 ? 2 : 1);
  return carried && brought && sides && marked && count;
}

/**
 * True when the statement is the one the case text gives: it starts from the balance the lines leave in the bank
 * column, has a row for each cheque the text says the bank had not paid or collected (for the amount of that cheque's
 * own line) and for each entry the firm made late, each in the column its words call for, and ends on what they give.
 */
function chainStatementHolds(q: StatementQuestion): boolean {
  const b = readBookChain(q.data);
  if (!b || !q.final || b.bank === 0 || q.columns.join() !== BRS.columns.join()) return false;
  const named = (fits: RegExp): string[] => b.lines.flatMap((l) => fits.exec(l)?.[1].split(/, | and /) ?? []);
  const want: { label?: string; up: boolean; amount: Paise }[] = [];
  for (const who of named(/^The cheques? issued to (.+) had not been presented for payment by /)) {
    const paid = b.dealt.filter((d) => d.text.startsWith(`Paid ₹`) && d.text.includes(` by cheque to ${who}, a creditor`));
    if (paid.length !== 1) return false;
    want.push({ label: BRS.chequeLabel(true, who), up: true, amount: moneyIn(paid[0].text)[0] });
  }
  for (const who of named(/^The cheques? from (.+) had not been collected by the bank by /)) {
    const got = b.dealt.filter((d) => d.text.startsWith('Received a cheque for ₹') && d.text.includes(` from ${who}, a debtor`));
    if (got.length !== 1) return false;
    want.push({ label: BRS.chequeLabel(false, who), up: false, amount: moneyIn(got[0].text)[0] });
  }
  for (const l of b.lines) {
    const rules = LATER_RULES.filter(([fits]) => fits.test(l));
    if (rules.length > 1) return false;
    if (rules.length === 1) want.push({ up: rules[0][1] > 0, amount: moneyIn(l)[0] });
  }
  const end = b.bank + sum(want.map((w) => (w.up ? w.amount : -w.amount)));
  const at = (up: boolean) => (up ? 0 : 1);
  const start = q.rows.filter((r) => r.label === BRS.balanceLabel('cb', b.bank));
  if (start.length !== 1 || start[0].amounts[at(b.bank > 0)] !== Math.abs(b.bank) || start[0].amounts[at(b.bank < 0)] !== 0) return false;
  if (want.length < 2 || q.rows.length !== want.length + 1) return false;
  // A cheque has the row its name gives; the other rows are, between them, the entries the firm made late.
  const cheques = want.filter((w) => w.label !== undefined);
  const chequesHold = cheques.every((w) => q.rows.filter((r) => r.label === w.label && r.amounts[at(w.up)] === w.amount && r.amounts[at(!w.up)] === 0).length === 1);
  const rest = q.rows.filter((r) => r !== start[0] && !cheques.some((w) => w.label === r.label)).map((r) => r.amounts.join('|'));
  const late = want.filter((w) => w.label === undefined).map((w) => (w.up ? `${w.amount}|0` : `0|${w.amount}`));
  const rowsHold = chequesHold && [...rest].sort().join() === [...late].sort().join();
  const totals = sum(q.rows.map((r) => r.amounts[0])) - sum(q.rows.map((r) => r.amounts[1]));
  // What the statement ends on is named by the student when it may be either, and the case text never says which.
  // Then both names of the balance it starts from are on offer too, and the task says where each stands.
  const both = [BRS.balanceLabel('pb', 1), BRS.balanceLabel('pb', -1)].sort().join('|');
  const naming = q.prompt.includes('name what the statement ends on')
    ? [...(q.final.options ?? [])].sort().join('|') === both &&
      [1, -1].every((sign) => q.labels.includes(BRS.balanceLabel('cb', sign))) &&
      q.prompt.includes('a favourable balance in the Plus column and an overdraft in the Minus column') &&
      !/ends on (a favourable balance|an overdraft)|overdrawn on|turns? into/.test(q.data)
    : q.final.options === undefined && b.bank > 0 && end > 0;
  // No row is on offer under a second name.
  if (q.labels.filter((l) => l.startsWith('Direct deposit')).length > 1) return false;
  // What the bank recorded first is no part of the month's cash book: the text says so before it lists them.
  if (!b.lines.some((l) => /^The cash book for \w+ was balanced with these transactions alone, /.test(l))) return false;
  return rowsHold && end !== 0 && totals === end && q.final.amount === Math.abs(end) && q.final.label === BRS.balanceLabel('pb', end) && naming;
}

// ---------------------------------------------------------------------------------------------------------------
// Chained case 1: a month in the double column cash book, then the statement on its last day.
// ---------------------------------------------------------------------------------------------------------------

/** A creditor paid by cheque in full settlement: the cash book takes the money alone, and the discount the journal. */
function settledByCheque(rng: Rng, who: string): CashBookDeal {
  const due = amount(rng, 8000, 30000, 1000);
  const disc = percentOf(due, rng.pick([2, 5]));
  const money = due - disc;
  return {
    text: `Paid ${fmt(money)} by cheque to ${who}, a creditor, in full settlement of ${fmt(due)}`,
    why: `Only the ${fmt(money)} paid is entered. The discount, ${fmt(due)} - ${fmt(money)} = ${fmt(disc)}, goes through the journal (${who} Dr, To Discount Received A/c).`,
    lines: [dr(creditor(who), money), cr('bank', money)],
    journal: [dr(creditor(who), disc), cr('discountReceived', disc)],
  };
}

function bookToStatementSetup(rng: Rng): BookChain | null {
  return CB.several(16, () => {
    const { firm } = rng.pick(FIRMS);
    const month = rng.pick(MONTHS);
    const last = CB.lastDay[month];
    const next = CB.nextMonth[month];
    const p = people(rng);
    const make = CB.deals(rng, false);
    const [e1, e2] = rng.shuffle(CB.expenses);
    // Two or three cheques issued to creditors (one of them, in some months, in full settlement at a discount) and
    // two received from debtors. The bank had still to pay one or two of the first and to collect one or two of the second.
    const discount = rng.next() < 0.4;
    const paid = Array.from({ length: rng.int(2, 3) }, (_, i) => {
      const who = p.sup();
      return { issued: true, who, deal: i === 0 && discount ? settledByCheque(rng, who) : make.creditorCheque(who) };
    });
    const got = [0, 1].map(() => {
      const who = p.cust();
      return { issued: false, who, deal: make.debtorCheque(who) };
    });
    const out = new Set([...rng.shuffle(paid).slice(0, rng.int(1, paid.length - 1)), ...rng.shuffle(got).slice(0, rng.pick([1, 1, 2]))].map((q) => q.deal));
    const cheques: ChainCheque[] = [...paid, ...got].map((q) => ({ issued: q.issued, who: q.who, amount: bankMove(q.deal), out: out.has(q.deal) }));
    if (new Set(cheques.map((q) => q.amount)).size !== cheques.length) return null;
    // The rest of the month: cash sales, perhaps another receipt of cash, one or two payments of cash, a contra entry and perhaps an expense paid by cheque.
    const cashIn = rng.shuffle([make.debtorCash(p.cust()), make.commission()]);
    const cashOut = rng.shuffle([make.cashPurchase(), make.expense(e1, 'cash'), make.drawingsCash()]);
    const [nIn, nOut] = [rng.int(0, 1), rng.int(1, 2)];
    const contra = rng.pick([true, false]) ? make.deposit() : make.withdraw();
    const byCheque = make.expense(e2, 'bank');
    const hasByCheque = rng.next() < 0.5;
    const others = rng.shuffle([make.cashSale(), ...cashIn.slice(0, nIn), ...cashOut.slice(0, nOut), contra, ...(hasByCheque ? [byCheque] : [])]);
    // A cheque the bank had not dealt with by the last day is one of the last week of the month.
    const early = rng.shuffle([...[...paid, ...got].filter((q) => !out.has(q.deal)).map((q) => q.deal), ...others.slice(1)]);
    const tail = rng.shuffle([...[...paid, ...got].filter((q) => out.has(q.deal)).map((q) => q.deal), others[0]]);
    const days = [...setDays(rng, early.length, 2, last - 9), ...setDays(rng, tail.length, last - 7, last - 1)];
    const plan: CashBookPlan = {
      single: false,
      opening: { date: `1 ${month}`, cash: amount(rng, 10000, 40000, 1000), bank: amount(rng, 30000, 90000, 5000) },
      deals: [...early, ...tail],
      dates: days.map((d) => `${d} ${month}`),
      closeOn: `${last} ${month}`,
      reopenOn: `1 ${next}`,
    };
    if (!CB.fundsLast(plan)) return null;
    const later = rng.shuffle<LaterKey>(['charges', 'interestCr', 'directDep']).slice(0, rng.pick([0, 1, 1, 2])).map((key) => laterItem(rng, key, p, plan.closeOn, next));
    const s = bookChain({
      firm,
      month,
      plan,
      cheques,
      later,
      layout: [],
      intro: [
        `${firm} keeps a cash book with cash and bank columns and no discount column: a cash discount goes through the journal.`,
        'Every cheque received is paid into the bank on the day it is received and entered straight in the bank column.',
        PARTY_NAMES,
        `On 1 ${month} cash in hand was ${fmt(plan.opening.cash)} and the balance at the bank was ${fmt(plan.opening.bank)}.`,
      ],
      lead: [CB.openingLead(plan)],
      hints: ['For each transaction decide two things: is money coming in or going out, and is it cash or the bank? Nothing the bank did after the month, or that the firm entered later, belongs in this cash book.', CB.hintColumns],
      // What the pass book shows is not part of the month's cash book, and a discount is not entered in it.
      distractors: ['Bank Charges A/c', 'Discount Received A/c', 'Capital A/c', ...CB.otherLabels([...cashIn.slice(nIn), ...cashOut.slice(nOut), ...(hasByCheque ? [] : [byCheque])])],
    });
    // Both balances are favourable: the statement of this case does not turn on an overdraft.
    return s && s.bankEnd > 0 && s.passEnd > 0 ? s : null;
  });
}

const bookToStatementCase = caseTemplate<BookChain>({
  id: 'case-bank-chain-cash-book-to-statement',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'A month in the cash book, then the reconciliation statement',
  setup: bookToStatementSetup,
  context: bookChainContext,
  parts: [
    { kind: 'account', make: (s) => asPart(s.book), verify: chainBookHolds },
    { kind: 'statement', make: (s) => bookChainStatement(s, false), verify: chainStatementHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained case 2: a cash book balance that is given; the amended cash book, then the statement from the amended
// balance. The amended cash book is that of the Bank Reconciliation topic (`brs-fmt-amended-cash-book`), so every
// account, a party's too, is written "... A/c" as the cards of that topic write it ("Mohan A/c Dr"). No entry is
// asked for after the two books: the entry for an item is its row of the amended cash book told again (Bank A/c on
// the side of the row, the account of its particulars on the other), so it would earn a third of the marks twice.
// ---------------------------------------------------------------------------------------------------------------

interface AmendChain {
  firm: string;
  date: string;
  /** The balance the cash book showed: a favourable one. */
  start: Paise;
  /** What the cash book takes in: the items the bank recorded first and, in some cases, an error in the cash book. */
  adjust: BrsSetItem[];
  /** What belongs in the statement alone: the timing differences and, in some cases, an error of the bank. */
  stay: BrsItem[];
  hasError: boolean;
  /** Every item in the order the case lists it. */
  shown: string[];
  entries: DatedEntry[];
  amended: Paise;
  passEnd: Paise;
}

function amendChainSetup(rng: Rng): AmendChain | null {
  const { firm } = rng.pick(FIRMS);
  const date = rng.pick(CLOSING_DATES);
  const name = BRS.names(rng);
  const hasError = rng.next() < 0.5;
  // A dishonoured cheque always, and two to four more of what the bank recorded first: four or five entries in all.
  const kinds = rng.shuffle(BRS.passKinds.filter((k) => k !== 'dishonour')).slice(0, hasError ? rng.int(2, 3) : rng.int(3, 4));
  const dishonour = BRS.passItem(rng, 'dishonour', false, name);
  const error = hasError ? BRS.errorItem(rng, rng.pick(BRS.errorKinds), name) : null;
  const adjust = [dishonour, ...kinds.map((k) => BRS.passItem(rng, k, false, name)), ...(error ? [error] : [])];
  const stay = [...BRS.timing, ...(rng.next() < 0.4 ? [rng.pick(BRS.bankErrors)] : [])].map((k) => BRS.formatItem(rng, k, name()));
  const entries: DatedEntry[] = adjust.map((a) => ({ date, lines: a.lines }));
  const moved = entries.flatMap((e) => e.lines.filter((l) => l.accountId === 'bank'));
  // A balance that stays favourable through the amendment and in the pass book.
  const start = sum(moved.map((l) => l.amount)) + sum(stay.map((i) => i.amount)) + amount(rng, 5000, 60000, 1000);
  const amended = post(entries.map((e) => e.lines), new Map([['bank', start]])).get('bank') ?? 0;
  const passEnd = amended + sum(stay.map((i) => i.kind.sign * i.amount));
  if (amended <= 0 || amended === start || passEnd <= 0 || passEnd === amended) return null;
  const shown = rng.shuffle([...adjust.map((a) => a.text), ...stay.map((i) => i.fact)]);
  return { firm, date, start, adjust, stay, hasError, shown, entries, amended, passEnd };
}

const amendChainContext = (s: AmendChain): string =>
  [
    `On ${s.date} the cash book (bank column) of ${s.firm} showed a favourable balance (a debit balance) of ${fmt(s.start)}.`,
    'On comparing it with the pass book, the firm noted the following. It has not yet made any entry or correction in its cash book for any of them.',
    ...(s.hasError ? ['The ledger was posted from the cash book as it stood, so an error in it is put right by one entry, for the amount by which it puts the bank column out, against the account that was posted wrongly.'] : []),
    'The firm first amends its cash book, and then reconciles the amended balance with the pass book.',
    ...s.shown.map((text, i) => `(${ROMAN[i]}) ${text}`),
  ].join('\n');

/** What each item does, by its words: to the bank column of the cash book, or (what stays in the statement) to the pass book balance. */
const AMEND_RULES: { fits: RegExp; bank?: (m: Paise[]) => Paise; pass?: 1 | -1 }[] = [
  { fits: /debited ₹[\d,]+ as bank charges\.$/, bank: (m) => -m[0] },
  { fits: /as interest on the balance in the account\.$/, bank: (m) => m[0] },
  { fits: /a customer who owed the firm money, paid ₹[\d,]+ directly into/, bank: (m) => m[0] },
  { fits: /was returned unpaid/, bank: (m) => -m[0] },
  { fits: /insurance premium of ₹[\d,]+ on the firm's stock|proprietor's own life insurance policy|the firm's electricity bill of/, bank: (m) => -m[0] },
  { fits: /collected a dividend of/, bank: (m) => m[0] },
  { fits: /paid the month's rent of/, bank: (m) => m[0] },
  // Errors: the bank has the first figure and the cash book the second; a wrong side is out by twice the cheque.
  { fits: /issued to .+, a supplier, was paid by the bank at that amount, but the firm had entered it/, bank: (m) => m[1] - m[0] },
  { fits: /received from .+, a customer, was collected by the bank at that amount, but the firm had entered it/, bank: (m) => m[0] - m[1] },
  { fits: /a supplier, and paid by the bank was entered on the receipts \(debit\) side/, bank: (m) => -2 * m[0] },
  { fits: /a customer, and collected by the bank was entered on the payments \(credit\) side/, bank: (m) => 2 * m[0] },
  { fits: /a supplier, was entered twice on the payments side/, bank: (m) => m[0] },
  { fits: /a customer, and deposited was entered twice on the receipts side/, bank: (m) => -m[0] },
  // What needs no entry: cheques the bank has still to pay (the pass book is higher) or to collect (lower), and the bank's own errors.
  { fits: /not yet been presented|are still with them and have not reached the bank/, pass: 1 },
  { fits: /has not yet collected them|is yet to be cleared|have not yet been credited/, pass: -1 },
  { fits: /wrongly debited/, pass: -1 },
  { fits: /wrongly credited/, pass: 1 },
];

/** The balance the cash book showed, what each item that needs an entry does to it, and what each of the others does to the pass book balance. */
function readAmendChain(data: string) {
  const lines = data.split('\n');
  const [start] = moneyIn(lines[0]);
  const entered: Paise[] = [];
  const stays: Paise[] = [];
  for (const line of lines) {
    const item = /^\([ivx]+\) (.+)$/.exec(line)?.[1];
    if (item === undefined) continue;
    const rules = AMEND_RULES.filter((r) => r.fits.test(item));
    if (rules.length !== 1) return null;
    const [rule] = rules;
    if (rule.bank) entered.push(rule.bank(moneyIn(item)));
    else stays.push(rule.pass! * moneyIn(item)[0]);
  }
  if (!(start > 0) || !lines[0].includes('a favourable balance (a debit balance)') || entered.length < 3 || stays.length < 2) return null;
  return { start, entered, stays, amended: start + sum(entered) };
}

const amendChainCase = caseTemplate<AmendChain>({
  id: 'case-bank-chain-amended',
  topicId: T,
  conceptId: C,
  // The amended cash book is the medium format of the topic, and the statement after it has three or four rows.
  difficulty: 'medium',
  // Not to be taken for the case of short questions "Amended cash book, then the reconciliation" in the list of the stage.
  title: 'Preparing the amended cash book and the statement after it',
  setup: amendChainSetup,
  context: amendChainContext,
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const view = accountOf(s.entries, 'bank', { date: s.date, side: 'Dr', amount: s.start });
        if (view.balance?.side !== 'Dr') return null;
        const sides = ledgerSides(view, { closeOn: s.date });
        // Two rows of a side that nothing tells apart cannot be marked.
        for (const side of [sides.left, sides.right]) {
          if (new Set(side.rows.map((r) => `${r.label}|${r.amount}`)).size !== side.rows.length) return null;
        }
        const pre = (side: 'Dr' | 'Cr') => (side === 'Dr' ? 'To' : 'By');
        const bankErrors = s.stay.filter((i) => i.kind.group === 'bankError');
        return {
          task: `Prepare the amended Cash Book (bank column only) of ${s.firm} on ${s.date} and balance it. Enter only what needs an entry in the cash book, and leave out what belongs in the Bank Reconciliation Statement alone.`,
          title: `Amended Cash Book (bank column) of ${s.firm}, ${s.date}`,
          ...sides,
          // What stays in the statement is on offer, with the accounts a student wrongly reaches for.
          distractors: [BRS.issued.label, BRS.deposited.label, ...bankErrors.map((i) => i.kind.label), 'Bank A/c', 'Cash A/c', 'Suspense A/c', 'Bad Debts A/c'],
          explanation: [
            `The cash book shows a favourable balance, which is a debit balance: "To Balance b/d" ${fmt(s.start)}.`,
            ...s.adjust.map((a, i) => `${postingsOf([s.entries[i]], 'bank').map((p) => `"${pre(p.side)} ${p.label}" ${fmt(p.amount)}`).join(' and ')}: ${a.explanation.join(' ')}`),
            `Left out: ${s.stay.map((i) => i.kind.short).join('; ')}. ${bankErrors.length > 0 ? 'The cash book is right about the cheques, and the bank must correct its own error' : 'The cash book is already right about them'}: they appear only in the Bank Reconciliation Statement.`,
            `Debit side ${fmt(sum(view.debit.map((p) => p.amount)))}, credit side ${fmt(sum(view.credit.map((p) => p.amount)))}. The debit side is larger by ${fmt(view.balance.amount)}: "By Balance c/d" ${fmt(view.balance.amount)}, the amended balance as per cash book, a favourable balance.`,
          ],
          hints: [
            'Sort the items first: which are missing from the cash book or wrong in it, and which is the cash book already right about?',
            'An amount the bank has added goes on the debit side ("To" the account it came from); an amount the bank has taken out goes on the credit side ("By" the account it went to). An error in the cash book is put right by the amount by which it puts the bank column out. Cheques not yet presented or cleared, and errors of the bank, need no entry.',
          ],
        };
      },
      // The bank column again from the words of the items: the balance shown, what each entry adds or takes off, and
      // nothing for the cheques the bank has still to deal with or for the bank's own error.
      verify: (q) => {
        const read = readAmendChain(q.data);
        if (!read || read.amended <= 0) return false;
        const [debit, credit] = q.sides;
        const body = (rows: readonly FormatRow[]) => rows.filter((r) => !r.closing);
        const of = (rows: readonly FormatRow[]) => sum(rows.map((r) => r.amounts[0]));
        const closing = credit.rows.filter((r) => r.closing);
        // Every account is written "... A/c" (a party's too), and nothing that stays in the statement has a row.
        const rows = [...debit.rows, ...credit.rows];
        const named = rows.every((r) => r.label === BALANCE_BD || r.label === BALANCE_CD || r.label.endsWith(' A/c'));
        const stays = [BRS.issued.label, BRS.deposited.label, ...BRS.bankErrors.map((k) => k.label)];
        return (
          named &&
          !rows.some((r) => stays.includes(r.label)) &&
          debit.rows.filter((r) => r.label === BALANCE_BD && r.amounts[0] === read.start).length === 1 &&
          closing.length === 1 &&
          closing[0].label === BALANCE_CD &&
          closing[0].amounts[0] === read.amended &&
          debit.rows.every((r) => !r.closing) &&
          of(body(debit.rows)) === read.start + sum(read.entered.filter((x) => x > 0)) &&
          of(body(credit.rows)) === -sum(read.entered.filter((x) => x < 0)) &&
          body(debit.rows).length + body(credit.rows).length === read.entered.length + 1
        );
      },
    },
    {
      kind: 'statement',
      make: (s) =>
        chainStatement({
          firm: s.firm,
          date: s.date,
          start: s.amended,
          startIs: 'the amended balance as per cash book (the balance the amended cash book ends on)',
          endOf: 'the amended cash book',
          rows: s.stay.map((i) => ({ label: BRS.rowLabel(i.kind), up: i.kind.sign > 0, amount: i.amount, reason: i.kind.reason })),
          leftOut: 'Left out: everything the amended cash book has taken in. Once it is entered there, both books show it, so it no longer keeps the two balances apart.',
          lures: ['Cheque deposited and dishonoured', 'Bank charges debited by the bank', 'Direct deposit by a customer', ...BRS.bankErrors.filter((k) => !s.stay.some((i) => i.kind === k)).map((k) => k.label)],
          choose: false,
          perCheque: false,
          hints: [
            'The amended cash book already has what the bank recorded first, and its own errors are put right. What still keeps it apart from the pass book?',
            'Only the cheques the bank has still to pay or to collect, and an error of the bank, are left. A cheque issued but not yet presented makes the pass book balance higher: Plus column. A cheque deposited but not yet cleared makes it lower: Minus column. A wrong debit by the bank makes the pass book balance lower, a wrong credit higher.',
          ],
        }),
      // From the words of the items again: the amended balance, then only what needs no entry, each in its column.
      verify: (q) => {
        const read = readAmendChain(q.data);
        if (!read || !q.final || q.final.options !== undefined || q.columns.join() !== BRS.columns.join()) return false;
        const end = read.amended + sum(read.stays);
        const start = q.rows.filter((r) => r.label === BRS.balanceLabel('cb', 1));
        const others = q.rows.filter((r) => r.label !== BRS.balanceLabel('cb', 1));
        return (
          start.length === 1 &&
          start[0].amounts[0] === read.amended &&
          start[0].amounts[1] === 0 &&
          others.length === read.stays.length &&
          read.stays.every((x) => others.filter((r) => r.amounts[x > 0 ? 0 : 1] === Math.abs(x) && r.amounts[x > 0 ? 1 : 0] === 0).length >= 1) &&
          sum(q.rows.map((r) => r.amounts[0])) - sum(q.rows.map((r) => r.amounts[1])) === end &&
          end > 0 &&
          q.final.amount === end &&
          q.final.label === BRS.balanceLabel('pb', 1)
        );
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained case 3: a month that ends with the bank account overdrawn, then the statement from that overdraft. Neither
// the case text nor the task says what the bank column ends on: the statement's first row is named by the student
// (both names are on offer), and so is what the statement ends on.
// ---------------------------------------------------------------------------------------------------------------

/** A transaction of the month, or the place of the deposit of the cheque that was kept (its sentence names the day the cheque came). */
type Step = CashBookDeal | 'deposit';

const BRS_LAYOUT = [
  'In the statement a favourable balance stands in the Plus column and an overdraft in the Minus column.',
  'What makes the pass book balance more favourable than the cash book balance goes in the Plus column, what makes it less favourable in the Minus column. The statement ends on the difference of the two columns.',
];

function overdraftChainSetup(rng: Rng): BookChain | null {
  return CB.several(24, () => {
    const { firm } = rng.pick(FIRMS);
    const month = rng.pick(MONTHS);
    const last = CB.lastDay[month];
    const next = CB.nextMonth[month];
    const p = people(rng);
    const make = CB.deals(rng, false);
    const [e1, e2] = rng.shuffle(CB.expenses);
    // Two or three cheques issued to creditors, of which the bank had still to pay one or more.
    const paid = Array.from({ length: rng.int(2, 3) }, () => {
      const who = p.sup();
      return { issued: true, who, step: make.creditorCheque(who) as Step };
    });
    // Two cheques received. One is banked the day it comes; the other, in most months, is kept (it is cash until it
    // is deposited, and the deposit is a contra entry). The bank had still to collect one of the two.
    const banked = p.cust();
    const keeper = p.cust();
    const held = rng.next() < 0.6;
    const keptAmount = amount(rng, 6000, 30000, 500);
    const receipt: CashBookDeal = {
      text: `Received a cheque for ${fmt(keptAmount)} from ${keeper}, a debtor. It was not banked that day`,
      why: 'The cheque is not banked on the day it is received, so it is treated as cash: a receipt in the cash column.',
      lines: [dr('cash', keptAmount), cr(debtor(keeper), keptAmount)],
    };
    const deposit = (came: string): CashBookDeal => ({
      text: `Deposited into the bank the cheque received from ${keeper} on ${came}`,
      why: `The cheque was entered in the cash column when it came, so depositing it moves ${fmt(keptAmount)} from the cash column to the bank column. ${CB.contraWhy}`,
      lines: [dr('bank', keptAmount), cr('cash', keptAmount)],
    });
    const second = make.debtorCheque(keeper);
    const got = [
      { issued: false, who: banked, step: make.debtorCheque(banked) as Step },
      { issued: false, who: keeper, step: held ? ('deposit' as const) : second },
    ];
    const out = new Set([...rng.shuffle(paid).slice(0, rng.int(1, paid.length)), rng.pick(got)].map((q) => q.step));
    // The rest of the month: cash sales, a payment of cash, and one more payment out of the bank or cash drawn from it.
    const cashOut = rng.shuffle([make.cashPurchase(), make.expense(e1, 'cash'), make.drawingsCash()]);
    const fromBank = rng.shuffle([make.expense(e2, 'bank'), make.furnitureCheque(), make.drawingsBank(), make.withdraw()]);
    const others = rng.shuffle([make.cashSale(), cashOut[0], fromBank[0]]);
    const settled = [...paid, ...got].filter((q) => !out.has(q.step)).map((q) => q.step);
    // A cheque the bank had not dealt with is one of the last week of the month. The cheque that is kept comes before
    // it is deposited, and both fall in that week when the bank had still to collect it.
    const keptThread: Step[] = held ? [receipt, 'deposit'] : [];
    const lateKept = out.has('deposit');
    const pending = [...paid, ...got].filter((q) => out.has(q.step)).map((q) => q.step);
    const alone = (list: Step[]) => list.filter((x) => x !== 'deposit').map((x) => [x]);
    const early = interleave<Step>(rng, [lateKept ? [] : keptThread, ...alone([...settled, ...others.slice(1)])]);
    const tail = interleave<Step>(rng, [lateKept ? keptThread : [], ...alone([...pending, others[0]])]);
    const steps = [...early, ...tail];
    const days = [...setDays(rng, early.length, 2, last - 9), ...setDays(rng, tail.length, last - 7, last - 1)];
    const dates = days.map((d) => `${d} ${month}`);
    const banking = deposit(dates[steps.indexOf(receipt)] ?? '');
    const deals = steps.map((x) => (x === 'deposit' ? banking : x));
    // The proprietor draws once in the month, in cash or from the bank.
    if (deals.filter((d) => d.lines.some((l) => l.accountId === 'drawings')).length > 1) return null;
    const cheques: ChainCheque[] = [...paid, ...got].map((q) => ({ issued: q.issued, who: q.who, amount: q.step === 'deposit' ? keptAmount : bankMove(q.step), out: out.has(q.step) }));
    if (new Set(cheques.map((q) => q.amount)).size !== cheques.length) return null;
    const closeOn = `${last} ${month}`;
    // One or two entries the bank made first. Interest on the overdraft is among them only in a month that opens
    // overdrawn (the bank has then lent money for the month), and is drawn last, once that overdraft is known; in a
    // month that opens with money at the bank, bank charges stand in its place if nothing else was drawn.
    const keys = rng.shuffle<LaterKey>(['interestOd', 'charges', 'directDep', 'dividend']).slice(0, rng.int(1, 2));
    const first = new Map<LaterKey, Later>(keys.filter((key) => key !== 'interestOd').map((key) => [key, laterItem(rng, key, p, closeOn, next)]));
    // The overdraft the month ends on is fixed first: small enough, in about half the months in which the items allow
    // it, for the pass book to show a favourable balance (the ₹3,000 it then leaves is more than any interest). The
    // balance the month opens with follows from it, and is a favourable balance in some months and an overdraft in others.
    const gap = gapOf(cheques, [...first.values()]);
    const overdraft = gap >= rupees(6000) && rng.next() < 0.55 ? rupees(rng.step(2000, Math.floor((gap / 100 - 3000) / 500) * 500, 500)) : Math.max(0, Math.ceil(gap / 100000) * 100000) + amount(rng, 5000, 30000, 1000);
    const moved = sum(deals.flatMap((d) => d.lines.filter((l) => l.accountId === 'bank').map((l) => (l.side === 'Dr' ? l.amount : -l.amount))));
    const bank = -overdraft - moved;
    if (Math.abs(bank) < rupees(3000) || Math.abs(bank) > rupees(95000)) return null;
    const fitting = keys.filter((key) => key !== 'interestOd' || bank < 0);
    const later = (fitting.length > 0 ? fitting : (['charges'] as LaterKey[])).map((key) => first.get(key) ?? laterItem(rng, key, p, closeOn, next, Math.max(0, -bank)));
    const plan: CashBookPlan = { single: false, opening: { date: `1 ${month}`, cash: amount(rng, 8000, 30000, 1000), bank }, deals, dates, closeOn, reopenOn: `1 ${next}` };
    if (!CB.fundsLast(plan, { overdraft: true, cheques: held ? [receipt, banking] : [] })) return null;
    const s = bookChain({
      firm,
      month,
      plan,
      cheques,
      later,
      layout: BRS_LAYOUT,
      intro: [
        `${firm} keeps a cash book with cash and bank columns. Its bank lets it overdraw the account.`,
        held
          ? 'A cheque received is banked the same day unless the transaction says otherwise; one that is not banked that day is treated as cash until it is deposited.'
          : 'Every cheque received is paid into the bank on the day it is received and entered straight in the bank column.',
        'An overdraft is a credit balance in the cash book (bank column) and a debit balance in the pass book.',
        PARTY_NAMES,
        bank < 0
          ? `On 1 ${month} cash in hand was ${fmt(plan.opening.cash)} and the bank account was overdrawn by ${fmt(-bank)}.`
          : `On 1 ${month} cash in hand was ${fmt(plan.opening.cash)} and the balance at the bank was ${fmt(bank)}.`,
      ],
      lead: [
        bank < 0
          ? `Cash in hand is a debit balance: it opens on the debit side of the cash column, "To Balance b/d" ${fmt(plan.opening.cash)}. An overdraft is a credit balance of the bank column: it opens on the credit side, "By Balance b/d" ${fmt(-bank)}.`
          : CB.openingLead(plan),
      ],
      hints: [
        `Start with the opening balances: on which side does each stand? Then take the transactions in order${held ? ', and for each cheque received ask whether it was banked that day or kept' : ''}. Does the bank column pay out more than it holds?`,
        'An overdraft is a credit balance of the bank column: it is brought down on the credit side and, when the account is overdrawn at the end, carried down on the debit side.' +
          (held ? ' A cheque that is kept is entered in the cash column, and depositing it later is a contra entry.' : ''),
      ],
      distractors: ['Bank Overdraft A/c', 'Interest Paid A/c', 'Bank Charges A/c', 'Capital A/c', ...CB.otherLabels([cashOut[1], cashOut[2], ...fromBank.slice(1).filter((d) => d.lines.some((l) => l.accountId !== 'cash' && l.accountId !== 'bank'))])],
    });
    return s && s.bankEnd < 0 ? s : null;
  });
}

const overdraftChainCase = caseTemplate<BookChain>({
  id: 'case-bank-chain-overdraft',
  topicId: T,
  conceptId: C,
  difficulty: 'complex',
  // The title does not say which of the balances is an overdraft: the student finds what each book ends on.
  title: 'A month with an overdraft, then the reconciliation statement',
  setup: overdraftChainSetup,
  context: bookChainContext,
  parts: [
    { kind: 'account', make: (s) => asPart(s.book), verify: chainBookHolds },
    { kind: 'statement', make: (s) => bookChainStatement(s, true), verify: chainStatementHolds },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chained case 4: one week in the analytical petty cash book and then in the single column cash book. What joins the
// two books is the cash with which the head cashier restores the imprest on the last evening of the week (the end of
// the period, as the cards of the Cash Book topic and the petty cash case above have it). The case text never prints
// that amount: it is the imprest less the balance the petty cash book ends on, which is what the week's vouchers come
// to, and it is one payment of the main cash book ("By Petty Cash A/c"). So the petty cash book is prepared first,
// as the book of original entry it is, and the main cash book cannot be finished without it.
// ---------------------------------------------------------------------------------------------------------------

interface PettyVoucher extends PettyItem {
  no: number;
  day: number;
  amt: Paise;
}

interface PettyChain {
  firm: string;
  month: string;
  plan: CashBookPlan;
  book: AccountParts;
  /** The three analysis columns, in the order the petty cash book has them. */
  heads: string[];
  vouchers: PettyVoucher[];
  imprest: Paise;
  /** True when the petty cash starts this week: the imprest itself is then a payment of the first day. */
  starts: boolean;
  spent: Paise;
}

const PETTY_STARTED = 'Gave the petty cashier the imprest in cash to start the petty cash';
const PETTY_RESTORED = 'In the evening the head cashier restored the imprest out of the office cash';

function pettyChainSetup(rng: Rng): PettyChain | null {
  return CB.several(16, () => {
    const { firm } = rng.pick(FIRMS);
    const month = rng.pick(MONTHS);
    const first = rng.pick(month === 'February' ? [1, 8, 15] : [1, 8, 15, 22]);
    const last = first + 6;
    const p = people(rng);
    // The petty cash of the week: five to seven vouchers under three heads, every head with one at least; no more
    // than two payments on a day and no two of the same amount.
    const chosen = rng.shuffle(CB.petty.heads).slice(0, 3);
    const heads = CB.petty.heads.filter((h) => chosen.includes(h));
    const left = heads.map((h) => rng.shuffle(CB.petty.items.filter((item) => item.head === h)));
    const picked = left.map((items) => items.shift()!);
    for (let more = rng.int(2, 4); more > 0; more--) picked.push(rng.pick(left.filter((items) => items.length > 0)).shift()!);
    const week = Array.from({ length: 7 }, (_, i) => first + i);
    const days = rng.shuffle([...week, ...week]).slice(0, picked.length).sort((a, b) => a - b);
    const amounts = rng.shuffle(Array.from({ length: 55 }, (_, i) => 6000 + 1000 * i)).slice(0, picked.length);
    const vouchers = rng.shuffle(picked).map((item, i) => ({ ...item, no: i + 1, day: days[i], amt: amounts[i] }));
    const spent = sum(vouchers.map((v) => v.amt));
    // A round imprest that the week's payments leave ₹300 or more of. The petty cashier holds it in full when the
    // week begins, or is given it on the first day, when the petty cash starts.
    const imprest = Math.ceil((spent + 30000 + 50000 * rng.int(0, 2)) / 50000) * 50000;
    const starts = rng.next() < 0.4;
    const started: CashBookDeal = {
      text: PETTY_STARTED,
      why: `The imprest of ${fmt(imprest)} leaves the office cash for the petty cashier: a payment, to Petty Cash A/c.`,
      lines: [dr('pettyCash', imprest), cr('cash', imprest)],
    };
    const restored: CashBookDeal = {
      text: PETTY_RESTORED,
      why:
        `The petty cash book ends the week on a balance of ${fmt(imprest - spent)}, so ${fmt(imprest)} - ${fmt(imprest - spent)} = ${fmt(spent)} makes the petty cash up to the imprest again: exactly what the week's vouchers come to. ` +
        'It is one payment, to Petty Cash A/c. The vouchers themselves are entered in the petty cash book alone.',
      lines: [dr('pettyCash', spent), cr('cash', spent)],
    };
    // The main cash book of the week: cash sales, one or two other receipts and two or three payments.
    const make = CB.deals(rng, true);
    const [e1, e2] = rng.shuffle(CB.expenses);
    const receipts = rng.shuffle([make.debtorCash(p.cust()), make.commission(), make.capitalCash()]);
    const payments = rng.shuffle([make.cashPurchase(), make.creditorCash(p.sup()), make.expense(e1, 'cash'), make.expense(e2, 'cash'), make.drawingsCash(), make.deposit()]);
    const rest = rng.shuffle([make.cashSale(), ...receipts.slice(0, rng.int(1, 2)), ...payments.slice(0, rng.int(2, 3))]);
    const open = `${first} ${month}`;
    const plan: CashBookPlan = {
      single: true,
      opening: { date: open, cash: amount(rng, 10000, 40000, 1000), bank: 0 },
      // The imprest is restored last of all on the last day, once the petty cash book has been balanced.
      deals: [...(starts ? [started] : []), ...rest, restored],
      dates: [...(starts ? [first] : []), ...setDays(rng, rest.length, first, last), last].map((d) => `${d} ${month}`),
      closeOn: `${last} ${month}`,
      reopenOn: `${last + 1} ${month}`,
    };
    if (!CB.fundsLast(plan)) return null;
    const book = CB.book(plan, {
      task:
        `Prepare the single column cash book of ${firm} for the week ended ${plan.closeOn}, working out the cash that restored the imprest from the balance the petty cash book ends on. ` +
        `Balance it on ${plan.closeOn} and bring the balance down on ${plan.reopenOn}.`,
      intro: '',
      title: `Single Column Cash Book of ${firm}`,
      // A petty payment entered in the main cash book under its head is the slip.
      distractors: ['Cash A/c', 'Imprest A/c', ...heads.map((h) => `${h} A/c`), 'Capital A/c'],
      lead: [
        `The cash in hand on ${open} opens the debit side: "To Balance b/d" ${fmt(plan.opening.cash)}.`,
        'Of the petty cash the main cash book shows only the cash handed to the petty cashier, as a payment "By Petty Cash A/c". The vouchers of the week are entered in the petty cash book.',
      ],
      hints: [
        'Take the transactions of the main cash book one at a time: is cash coming in or going out? How much cash makes the petty cash up to the imprest again, once the vouchers of the week are paid?',
        `${CB.hintSides} The cash that restores the imprest = the imprest - the balance of petty cash in hand, which is what the petty cashier paid out in the week.`,
      ],
    });
    if (!book) return null;
    return { firm, month, plan, book, heads, vouchers, imprest, starts, spent };
  });
}

const pettyChainContext = (s: PettyChain): string => {
  const open = s.plan.opening;
  const party = s.plan.deals.some((d) => d.lines.some((l) => l.accountId.includes(':')));
  return [
    `${s.firm} keeps a single column cash book and, for small payments, an analytical petty cash book on the imprest system.`,
    `The imprest is ${fmt(s.imprest)}. On the last evening of every week, once the petty cash book has been balanced, the head cashier restores the imprest out of the office cash.`,
    `Beside the Total payment column the petty cash book has three analysis columns: ${s.heads[0]}, ${s.heads[1]} and ${s.heads[2]}.`,
    s.starts
      ? `On ${open.date} the office cash was ${fmt(open.cash)}. The petty cash starts this week: the petty cashier had nothing in hand.`
      : `On ${open.date} the office cash was ${fmt(open.cash)} and the petty cashier held the full imprest.`,
    'Payments of the week out of petty cash, each with the number of its voucher:',
    ...s.vouchers.map((v) => `${v.day} ${s.month} (voucher ${v.no}): ${cap(v.what)}, ${fmt(v.amt)}.`),
    `Transactions of the week in the main cash book${party ? ', where a customer or a supplier is entered by name ("To Kiran") and every other account as "... A/c"' : ''}:`,
    ...s.plan.deals.map((d, i) => `${s.plan.dates[i]}: ${d.text}.`),
  ].join('\n');
};

/** The week read from the case text: the imprest, how the petty cash stood, the vouchers, and the main cash book line by line. */
function readPettyChain(data: string) {
  const lines = data.split('\n');
  const rule = lines.find((l) => /^The imprest is ₹[\d,]+\. On the last evening of every week, once the petty cash book has been balanced, the head cashier restores the imprest out of the office cash\.$/.test(l));
  const open = lines.find((l) => /^On \d+ \w+ the office cash was ₹[\d,]+( and the petty cashier held the full imprest|\. The petty cash starts this week: the petty cashier had nothing in hand)\.$/.test(l));
  if (!rule || !open) return null;
  const [imprest] = moneyIn(rule);
  const [cash0] = moneyIn(open);
  const starts = open.includes('starts this week');
  const vouchers = lines.flatMap((l) => {
    const m = /^\d+ \w+ \(voucher (\d+)\): (.+), ₹[\d,]+\.$/.exec(l);
    return m ? [{ no: Number(m[1]), what: m[2], amt: moneyIn(l)[0] }] : [];
  });
  const spent = sum(vouchers.map((v) => v.amt));
  const dealt = lines.flatMap((l) => {
    const m = /^(\d+ \w+): (.+)\.$/.exec(l);
    return m ? [{ date: m[1], text: m[2] }] : [];
  });
  // The imprest is given on the first line of a week that starts the petty cash and of no other, and restored on the
  // last line of every week: by the imprest less what the vouchers leave of it.
  const moves: Paise[] = [];
  for (const [i, d] of dealt.entries()) {
    const given = d.text === PETTY_STARTED;
    const restored = d.text === PETTY_RESTORED;
    if (given !== (starts && i === 0) || restored !== (i === dealt.length - 1)) return null;
    const move = given ? -imprest : restored ? -(imprest - (imprest - spent)) : moveOf(d.text, dealt)?.cash;
    if (!move) return null;
    moves.push(move);
  }
  return imprest > 0 && cash0 > 0 && spent > 0 && spent < imprest && dealt.length >= 4 ? { imprest, cash0, starts, spent, moves, vouchers } : null;
}

const pettyChainCase = caseTemplate<PettyChain>({
  id: 'case-bank-chain-single-and-petty',
  topicId: T,
  conceptId: C,
  difficulty: 'medium',
  title: 'A week in the petty cash book, then the cash book',
  setup: pettyChainSetup,
  context: pettyChainContext,
  parts: [
    {
      kind: 'statement',
      make: (s) => {
        const end = s.plan.closeOn;
        const under = (h: string) => s.vouchers.filter((v) => v.head === h);
        const added = (xs: Paise[]) => (xs.length === 1 ? fmt(xs[0]) : `${xs.map(fmt).join(' + ')} = ${fmt(sum(xs))}`);
        const headTotals = s.heads.map((h) => sum(under(h).map((v) => v.amt)));
        return {
          task: `Write up the payments of the week ended ${end} in the analytical petty cash book of ${s.firm}, each in the Total payment column and in the column of its head, and give the balance of petty cash carried down on ${end}, before the imprest is restored.`,
          title: `Analytical Petty Cash Book of ${s.firm}: payments of the week ended ${end}`,
          columns: [CB.petty.totalColumn, ...s.heads.map((h) => `${h} (₹)`)],
          rows: s.vouchers.map((v) => ({ date: `${v.day} ${s.month}`, ref: `V${v.no}`, label: cap(v.what), amounts: [v.amt, ...s.heads.map((h) => (h === v.head ? v.amt : 0))] })),
          final: { label: BALANCE_CD, amount: s.imprest - s.spent },
          // What the petty cashier receives or brings down stands in the receipts column: it is not a payment of the week.
          distractors: [CB.petty.received, BALANCE_BD, 'Imprest'],
          explanation: [
            'Every payment has a line of its own and is entered on it twice: in the Total payment column, and again in the analysis column of its head. What the petty cashier receives or brings down is not a payment: it stands in the receipts column and is not entered here.',
            ...s.heads.map((h) => `${h} column (${CB.petty.means[h]}): ${under(h).map((v) => `${v.what} ${fmt(v.amt)}`).join(', ')}${under(h).length > 1 ? `; total ${fmt(sum(under(h).map((v) => v.amt)))}` : ''}.`),
            `Total payment column = ${added(s.vouchers.map((v) => v.amt))}. The three analysis columns add up to the same figure: ${added(headTotals)}.`,
            s.starts
              ? `The petty cashier was given the imprest of ${fmt(s.imprest)} on ${s.plan.opening.date} and had nothing in hand before.`
              : `The petty cashier held the full imprest of ${fmt(s.imprest)} on ${s.plan.opening.date}.`,
            `Balance c/d on ${end} = cash the petty cashier had - total payments = ${fmt(s.imprest)} - ${fmt(s.spent)} = ${fmt(s.imprest - s.spent)}. It is the petty cash in hand when the book is balanced, and it closes the book for the week.`,
            'The cash that restores the imprest that evening is received after the book is balanced, and it is a receipt, not a payment: it is not entered here. It is a payment of the main cash book.',
          ],
          hints: [
            'Take the vouchers one at a time. The amount goes in the Total payment column and once more under one head: which head is the payment for?',
            `${s.heads.map((h) => `${h} is for ${CB.petty.means[h]}`).join('; ')}. Balance c/d = the imprest the petty cashier started the week with - the total of the Total payment column.`,
          ],
        };
      },
      // From the vouchers as printed: each under the head its item belongs to, the columns added again, and the
      // balance as what the imprest leaves once they are paid.
      verify: (q) => {
        const read = readPettyChain(q.data);
        const heads = q.columns.slice(1).map((c) => c.replace(/ \(₹\)$/, ''));
        if (!read || !q.final || q.columns.length !== 4 || q.columns[0] !== CB.petty.totalColumn || read.vouchers.length < 5 || read.vouchers.length !== q.rows.length) return false;
        const columns = [0, 0, 0, 0];
        for (const [i, v] of read.vouchers.entries()) {
          const item = CB.petty.items.find((x) => cap(x.what) === v.what);
          const at = item ? heads.indexOf(item.head) : -1;
          const rows = q.rows.filter((r) => r.label === v.what);
          if (at < 0 || v.no !== i + 1 || rows.length !== 1 || rows[0].amounts.some((a, c) => a !== (c === 0 || c === at + 1 ? v.amt : 0))) return false;
          columns[0] += v.amt;
          columns[at + 1] += v.amt;
        }
        return (
          heads.every((h) => q.data.includes(h)) &&
          columns.slice(1).every((t) => t > 0) &&
          columns[0] === sum(columns.slice(1)) &&
          q.prompt.includes('before the imprest is restored') &&
          q.final.label === BALANCE_CD &&
          q.final.amount === read.imprest - columns[0]
        );
      },
    },
    {
      kind: 'account',
      make: (s) => asPart(s.book),
      // The cash again from the words of each line: receipts on the debit side with the opening balance, payments on
      // the credit side (the cash handed to the petty cashier among them: the imprest where the petty cash starts, and
      // on the last evening what the vouchers of the week come to), and the balance carried and brought down.
      verify: (q) => {
        const read = readPettyChain(q.data);
        if (!read || q.columns.length !== 1 || read.moves.filter((m) => m < 0).length < 2) return false;
        const [debit, credit] = q.sides;
        const of = (rows: readonly FormatRow[]) => sum(rows.map((r) => r.amounts[0]));
        const body = credit.rows.filter((r) => !r.closing);
        const inHand = read.cash0 + sum(read.moves);
        const handed = body.filter((r) => r.label === 'Petty Cash A/c').map((r) => r.amounts[0]).sort((a, b) => a - b);
        return (
          inHand > 0 &&
          debit.rows.every((r) => !r.closing) &&
          of(debit.rows) === read.cash0 + sum(read.moves.filter((m) => m > 0)) &&
          of(body) === -sum(read.moves.filter((m) => m < 0)) &&
          debit.rows.length + body.length === read.moves.length + 1 &&
          of(credit.rows.filter((r) => r.closing)) === inHand &&
          of(debit.below) === inHand &&
          credit.below.length === 0 &&
          handed.join() === (read.starts ? [read.spent, read.imprest] : [read.spent]).join() &&
          q.prompt.includes('from the balance the petty cash book ends on')
        );
      },
    },
  ],
});

const cases: CaseTemplate[] = [weekCase, toPassBookCase, fromPassBookCase, overdrawnCase, amendedCase, pettyCase, errorsCase, bookToStatementCase, amendChainCase, overdraftChainCase, pettyChainCase];

export default cases;
