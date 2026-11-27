/**
 * Integrated case studies of the stage "Books, bank and errors together", played after Rectification of Errors. A case
 * is one business over a month or so, and it draws on several topics of the course at once: the journal and the
 * subsidiary books, the cash book and the bank, the ledger and the trial balance, and the errors found in them.
 *
 * The transactions of a case are the drafts of the stage "From transactions to the trial balance"
 * (`accounting-cycle.ts`: `tx`, `gstTx`, `cs`), worded as that stage words them, so that its reader of a printed
 * month (`readTransaction`) can read every dated line of a case back into its entry. An error is one of the errors of
 * the stage "Finding and correcting errors" (`errors-and-suspense.ts`: what was posted, `done`, and what should have
 * been, `should`), tied here to a transaction of the month: "The transaction of 12 May was posted to Kiran's account
 * as ₹4,500." The effect on the trial balance, the rectifying entry and the effect on profit are worked out from the
 * two lists, so the questions of a case cannot disagree with each other.
 *
 * Every `verify` reads the printed case again: the dated lines with `readTransaction`, and each error sentence with
 * `readSlip`, which finds the transaction by its date and works out what the posting did from the entry it reads.
 * A rectifying entry is checked by applying it to the books as they were posted: it must give the books as they
 * should be, with Suspense A/c taking exactly the difference the error caused.
 *
 * Conventions a case states wherever it relies on them: cheques received are banked the same day; GST is at one rate,
 * every supply of one kind (intra-State or inter-State), and none is set off or paid within the month; the difference
 * in a trial balance goes to Suspense A/c on the side that is short; an error that left one account wrong is rectified
 * through Suspense A/c, one that left the totals equal is not; the errors listed are the only ones.
 */
import type { AccountQuestion, JournalQuestion, JournalSetQuestion, McqQuestion, NumericQuestion, StatementQuestion } from '@/content/types';
import { CLASS11_ACCOUNTS, creditor, debtor, resolveAccount, type Side } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountLabel, accountOf, balanceOf, cashBook, ledgerLabel, post, trialBalance, type DatedEntry, type Ledger } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { CASH_BOOK_COLUMNS, amount, caseTemplate, cashBookSides, formatINR, interleave, ledgerSides, rupees, storyHolds, type Paise } from '../authoring';
import { BRS_CHAIN } from '../templates/bank-reconciliation';
import { sideWork } from '../templates/ledger';
import { ROE_CHAIN, type RoeError } from '../templates/rectification-of-errors';
import type { CaseAccountParts, CaseSetParts, CaseStatementParts, CaseTemplate, Distractor, JournalParts, McqParts, NumericParts } from '../types';
import {
  ASSETS,
  CITIES,
  CUSTOMERS,
  EXPENSES,
  SALARIES,
  SUPPLIERS,
  accountNamed,
  accountPart,
  accountRead,
  ask,
  business,
  choice,
  cs,
  firstDay,
  gstOn,
  monthEnd,
  numeric,
  onDays,
  partOf,
  pickAmount,
  poss,
  journalLine,
  readJournalLine,
  readTransaction,
  tbPart,
  trialBalanceOf,
  trialBalanceRead,
  yearOf,
  type Business,
  type Chain,
  type Dated,
  type Gst,
  type Step,
} from './accounting-cycle';
import { chainStatement } from './cash-and-bank';
import { entryParts, profitEffect, rectifyingEntry, suspenseSideParts, tbNet, type Err, type ErrorClass } from './errors-and-suspense';

const T = 'rectification-of-errors';
const CONCEPT = 'roe-integrated';

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

const dr = (accountId: string, value: Paise): JournalLine => ({ accountId, side: 'Dr', amount: value });
const cr = (accountId: string, value: Paise): JournalLine => ({ accountId, side: 'Cr', amount: value });
// A case is set up again for every one of its questions, so the amounts written lately are remembered.
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
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const signed = (l: JournalLine): number => (l.side === 'Dr' ? l.amount : -l.amount);
const net = (ls: readonly JournalLine[]): number => sum(ls.map(signed));
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const sideWord = (s: Side): string => (s === 'Dr' ? 'debit' : 'credit');
const flip = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const tag = (i: number): string => `(${LETTERS[i]})`;
const RUPEES = /₹\d(?:[\d,]*\d)?/g;
const toPaise = (text: string): Paise => Number(text.replace(/[₹,]/g, '')) * 100;
const rupeesIn = (text: string): Paise[] => (text.match(RUPEES) ?? []).map(toPaise);

/** Runs `make` until it gives a scenario, a few times at most, so that an awkward draw seldom rejects the seed. */
function tries<S>(times: number, make: () => S | null): S | null {
  for (let i = 0; i < times; i++) {
    const s = make();
    if (s !== null) return s;
  }
  return null;
}

/** "Label: ₹a + ₹b = ₹t." and, for a single figure, "Label: ₹a." */
const addUp = (label: string, xs: readonly Paise[]): string => (xs.length === 1 ? `${label}: ${F(xs[0])}.` : `${label}: ${xs.map(F).join(' + ')} = ${F(sum(xs))}.`);

type Slip = { value: number; why: string };
/** The items that apply to this seed: a condition that is false drops its item out. */
const present = <X extends object>(...list: (X | false | null | undefined)[]): X[] => list.filter((x): x is X => !!x);

/** An account as a sentence of the case names it: "Kiran's account", "Sharma Bros' account", "Sales A/c". */
const words = (id: string): string => (id.startsWith('debtor:') || id.startsWith('creditor:') ? `${poss(resolveAccount(id).name)} account` : `${resolveAccount(id).name} A/c`);
/** Lines of entries as one multiset, for comparing two entries line by line. */
const linesKey = (ls: readonly JournalLine[]): string => ls.map((l) => `${l.accountId}|${l.side}|${l.amount}`).sort().join(';');

// ---------------------------------------------------------------------------------------------------------------
// Errors tied to a transaction of the month
// ---------------------------------------------------------------------------------------------------------------

/**
 * An error in the books: the model of `errors-and-suspense.ts`. `done` is what was posted and `should` what should
 * have been, each the whole entry of the transaction (a book total for an error in a book), so `tbNet`,
 * `rectifyingEntry` and `profitEffect` work it out.
 */
type Fault = Err;

/** The class of an error that put a posting in the wrong account: of principle when an asset and an expense are mixed up. */
function classOf(from: string, to: string): ErrorClass {
  const kind = (id: string) => {
    const type = resolveAccount(id).type;
    return type === 'asset' || type === 'liability' ? 'real' : type;
  };
  return kind(from) !== kind(to) ? 'principle' : 'commission';
}

/** The four subsidiary books of goods, the account each total is posted to, its side, and the party of its entries. */
type DayBook = 'Purchases Book' | 'Sales Book' | 'Purchases Return Book' | 'Sales Return Book';
const DAY_BOOKS: Record<DayBook, { id: string; side: Side; party: 'creditor:' | 'debtor:' }> = {
  'Purchases Book': { id: 'purchases', side: 'Dr', party: 'creditor:' },
  'Sales Book': { id: 'sales', side: 'Cr', party: 'debtor:' },
  'Purchases Return Book': { id: 'purchasesReturn', side: 'Cr', party: 'creditor:' },
  'Sales Return Book': { id: 'salesReturn', side: 'Dr', party: 'debtor:' },
};
/** The total of a subsidiary book of goods: what its entries post to its account against a party of its kind. */
function bookTotal(entries: readonly { lines: JournalLine[] }[], book: DayBook): Paise {
  const { id, side, party } = DAY_BOOKS[book];
  return sum(
    entries.flatMap(({ lines }) => {
      const item = lines.find((l) => l.accountId === id && l.side === side);
      return item && lines.some((l) => l.accountId.startsWith(party)) ? [item.amount] : [];
    }),
  );
}

const fault = {
  /** One account of the entry was not posted at all: a partial omission. */
  notPosted: (t: Dated, id: string): Fault => {
    const line = t.lines.find((l) => l.accountId === id)!;
    return {
      text: `The transaction of ${t.date} was not posted to ${words(id)}.`,
      kind: 'omission',
      group: 'notPosted',
      x: line.amount,
      done: t.lines.filter((l) => l !== line),
      should: t.lines,
      recorded: `Every account of the entry was posted except ${ledgerLabel(id)}, which was to be ${line.side === 'Dr' ? 'debited' : 'credited'} with ${F(line.amount)}.`,
      correct: null,
    };
  },
  /** One account of the entry was posted on the wrong side, with the right amount. */
  wrongSide: (t: Dated, id: string): Fault => {
    const line = t.lines.find((l) => l.accountId === id)!;
    return {
      text: `The transaction of ${t.date} was posted to the ${sideWord(flip(line.side))} side of ${words(id)}.`,
      kind: 'commission',
      group: 'wrongSide',
      x: line.amount,
      done: t.lines.map((l) => (l === line ? { ...l, side: flip(l.side) } : l)),
      should: t.lines,
      recorded: `${ledgerLabel(id)} was ${line.side === 'Dr' ? 'credited' : 'debited'} with ${F(line.amount)} when it should have been ${line.side === 'Dr' ? 'debited' : 'credited'}; every other account of the entry was posted rightly.`,
      correct: null,
    };
  },
  /** One account of the entry was posted with a wrong figure. */
  wrongFigure: (t: Dated, id: string, posted: Paise): Fault => {
    const line = t.lines.find((l) => l.accountId === id)!;
    return {
      text: `The transaction of ${t.date} was posted to ${words(id)} as ${F(posted)}.`,
      kind: 'commission',
      group: 'wrongAmount',
      x: line.amount,
      done: t.lines.map((l) => (l === line ? { ...l, amount: posted } : l)),
      should: t.lines,
      recorded: `${ledgerLabel(id)} was ${line.side === 'Dr' ? 'debited' : 'credited'} with ${F(posted)} where ${F(line.amount)} belongs; every other account of the entry was posted rightly.`,
      correct: null,
    };
  },
  /** One account of the entry was posted to another account, on the right side and for the right amount. */
  instead: (t: Dated, id: string, other: string): Fault => {
    const line = t.lines.find((l) => l.accountId === id)!;
    return {
      text: `The transaction of ${t.date} was posted to ${words(other)} instead of ${words(id)}.`,
      kind: classOf(id, other),
      group: classOf(id, other) === 'principle' ? 'principle' : 'wrongAccount',
      x: line.amount,
      done: t.lines.map((l) => (l === line ? { ...l, accountId: other } : l)),
      should: t.lines,
      recorded: `${ledgerLabel(other)} was ${line.side === 'Dr' ? 'debited' : 'credited'} with ${F(line.amount)} in place of ${ledgerLabel(id)}; the other side of the entry was posted rightly.`,
      correct: null,
    };
  },
  /** A subsidiary book added up wrongly: the account its total is posted to is wrong by `x`. */
  cast: (book: DayBook, under: boolean, x: Paise): Fault => {
    const { id, side } = DAY_BOOKS[book];
    // Added up too low, the total posted is short on the account's own side; too high, it is over.
    const line = under ? { accountId: id, side: flip(side), amount: x } : { accountId: id, side, amount: x };
    return {
      text: `The ${book} was ${under ? 'undercast' : 'overcast'} by ${F(x)}.`,
      kind: 'commission',
      group: 'casting',
      x,
      done: [line],
      should: [],
      recorded: `The total ${side === 'Dr' ? 'debited' : 'credited'} to ${ledgerLabel(id)} was ${F(x)} too ${under ? 'low' : 'high'}. The personal accounts are posted entry by entry, so they are right.`,
      correct: null,
    };
  },
  /** The total of a subsidiary book posted to the wrong side of its account. */
  totalWrongSide: (book: DayBook, total: Paise): Fault => {
    const { id, side } = DAY_BOOKS[book];
    return {
      text: `The total of the ${book} was posted to the ${sideWord(flip(side))} side of ${ledgerLabel(id)}.`,
      kind: 'commission',
      group: 'wrongSide',
      x: total,
      done: [{ accountId: id, side: flip(side), amount: total }],
      should: [{ accountId: id, side, amount: total }],
      recorded: `The total of the ${book}, ${F(total)}, was ${side === 'Dr' ? 'credited' : 'debited'} to ${ledgerLabel(id)} when it should have been ${side === 'Dr' ? 'debited' : 'credited'}.`,
      correct: null,
    };
  },
  /** The whole transaction was left out of the books. */
  leftOut: (t: Dated): Fault => ({
    text: `The transaction of ${t.date} was not entered in the books at all.`,
    kind: 'omission',
    group: 'omitted',
    x: t.lines[0].amount,
    done: [],
    should: t.lines,
  }),
};

// ---------------------------------------------------------------------------------------------------------------
// The printed case read back: the independent check of every part
// ---------------------------------------------------------------------------------------------------------------

/** What a case text gives, read from its wording alone. */
interface Read {
  /** The dated transactions, each with its entry, in the order printed; the opening entry first when balances are listed. */
  entries: DatedEntry[];
  /** The errors listed, by letter: what each one posted and what it should have posted. */
  slips: Map<string, { done: JournalLine[]; should: JournalLine[] }>;
  /** The opening entry, when the case lists balances (capital worked out again as their difference). */
  opening: DatedEntry | null;
}

/** The account a name in an error sentence stands for, among the lines of the entry it speaks of. */
function idIn(name: string, lines: readonly JournalLine[]): string | null {
  const party = /^(.+?)'s? account$/.exec(name);
  if (party) {
    const found = lines.filter((l) => (l.accountId.startsWith('debtor:') || l.accountId.startsWith('creditor:')) && resolveAccount(l.accountId).name === party[1]);
    return found.length === 1 ? found[0].accountId : null;
  }
  const known = CLASS11_ACCOUNTS.find((a) => `${a.name} A/c` === name);
  return known && lines.filter((l) => l.accountId === known.id).length === 1 ? known.id : null;
}

/** The account another name stands for when it takes the place of `id`: a party of the same kind, or any account of the chart. */
function idLike(name: string, id: string): string | null {
  const party = /^(.+?)'s? account$/.exec(name);
  if (party) return id.startsWith('debtor:') ? debtor(party[1]) : id.startsWith('creditor:') ? creditor(party[1]) : null;
  return CLASS11_ACCOUNTS.find((a) => `${a.name} A/c` === name)?.id ?? null;
}

const DAY = String.raw`(\d{1,2} [A-Z][a-z]+)`;
const SLIP_FORMS: { re: RegExp; read(m: RegExpExecArray, lines: JournalLine[]): JournalLine[] | null }[] = [
  {
    re: new RegExp(`^The (?:transaction|entry) of ${DAY} was not (?:entered in the books|posted to the ledger) at all\\.$`),
    read: () => [],
  },
  {
    re: new RegExp(`^The (?:transaction|entry) of ${DAY} was not posted to (.+)\\.$`),
    read: (m, lines) => {
      const id = idIn(m[2], lines);
      return id ? lines.filter((l) => l.accountId !== id) : null;
    },
  },
  {
    re: new RegExp(`^The (?:transaction|entry) of ${DAY} was posted to the (debit|credit) side of (.+)\\.$`),
    read: (m, lines) => {
      const id = idIn(m[3], lines);
      const side: Side = m[2] === 'debit' ? 'Dr' : 'Cr';
      // The sentence names the side the account was wrongly posted on: the entry has it on the other.
      return id && lines.find((l) => l.accountId === id)!.side !== side ? lines.map((l) => (l.accountId === id ? { ...l, side } : l)) : null;
    },
  },
  // The cash discount of a settlement, recorded in the Journal Proper: only a discount account can be named.
  {
    re: new RegExp(`^The discount of ${DAY} was not posted to (Discount (?:Allowed|Received) A/c)\\.$`),
    read: (m, lines) => {
      const id = idIn(m[2], lines);
      return id ? lines.filter((l) => l.accountId !== id) : null;
    },
  },
  {
    re: new RegExp(`^The discount of ${DAY} was posted to the (debit|credit) side of (Discount (?:Allowed|Received) A/c)\\.$`),
    read: (m, lines) => {
      const id = idIn(m[3], lines);
      const side: Side = m[2] === 'debit' ? 'Dr' : 'Cr';
      return id && lines.find((l) => l.accountId === id)!.side !== side ? lines.map((l) => (l.accountId === id ? { ...l, side } : l)) : null;
    },
  },
  {
    re: new RegExp(`^The (?:transaction|entry) of ${DAY} was posted to (.+) as (₹[\\d,]+)\\.$`),
    read: (m, lines) => {
      const id = idIn(m[2], lines);
      return id ? lines.map((l) => (l.accountId === id ? { ...l, amount: toPaise(m[3]) } : l)) : null;
    },
  },
  {
    re: new RegExp(`^The (?:transaction|entry) of ${DAY} was posted to (.+) instead of (.+)\\.$`),
    read: (m, lines) => {
      const id = idIn(m[3], lines);
      const other = id && idLike(m[2], id);
      return id && other && other !== id ? lines.map((l) => (l.accountId === id ? { ...l, accountId: other } : l)) : null;
    },
  },
];

/** An error in a subsidiary book, read by its words: a wrong total, or a total posted on the wrong side. */
function readBookSlip(sentence: string, entries: readonly DatedEntry[]): { done: JournalLine[]; should: JournalLine[] } | null {
  const isBook = (name: string): name is DayBook => Object.hasOwn(DAY_BOOKS, name);
  const cast = /^The (.+ Book) was (undercast|overcast) by (₹[\d,]+)\.$/.exec(sentence);
  if (cast && isBook(cast[1])) {
    // Undercast: the account is short on the side its total goes to; overcast: it has too much there.
    const { id, side } = DAY_BOOKS[cast[1]];
    const x = toPaise(cast[3]);
    return { done: [cast[2] === 'undercast' ? cr(id, x) : dr(id, x)].map((l) => (side === 'Cr' ? { ...l, side: flip(l.side) } : l)), should: [] };
  }
  const total = /^The total of the (.+ Book) was posted to the (debit|credit) side of (.+) A\/c\.$/.exec(sentence);
  if (total && isBook(total[1])) {
    const { id, side } = DAY_BOOKS[total[1]];
    const wrong: Side = total[2] === 'debit' ? 'Dr' : 'Cr';
    const x = bookTotal(entries, total[1]);
    if (ledgerLabel(id) !== `${total[3]} A/c` || wrong === side || x <= 0) return null;
    return { done: [{ accountId: id, side: wrong, amount: x }], should: [{ accountId: id, side, amount: x }] };
  }
  return null;
}

/** What one error sentence says was posted, against the entry of the transaction it names; null when it is not understood. */
function readSlip(sentence: string, entries: readonly DatedEntry[]): { done: JournalLine[]; should: JournalLine[] } | null {
  const book = readBookSlip(sentence, entries);
  if (book) return book;
  const fits = SLIP_FORMS.flatMap((f) => {
    const m = f.re.exec(sentence);
    return m ? [{ f, m }] : [];
  });
  // "posted to X as ₹y" also fits "posted to ... instead of ..." only by accident; a sentence must fit one form.
  const known = fits.filter(({ f, m }) => {
    const entry = entries.filter((e) => e.date === m[1]);
    return entry.length === 1 && f.read(m, entry[0].lines) !== null;
  });
  if (known.length !== 1) return null;
  const { f, m } = known[0];
  const should = entries.find((e) => e.date === m[1])!.lines;
  return { done: f.read(m, should)!, should };
}

/** The GST of a case, from the lines that state it. */
function gstOf(text: string): Gst | null {
  const rate = /GST at (\d+)%/.exec(text);
  return rate ? { rate: Number(rate[1]), intra: /intra-State/.test(text) } : null;
}

/**
 * The transactions this stage words for itself, beside those of `accounting-cycle.ts` (`more`, below): each form and
 * the entry it calls for.
 */
const EXTRA_FORMS: [RegExp, (m: RegExpExecArray) => JournalLine[]][] = [
  [/^Deposited (₹[\d,]+) of the office cash into the bank\.$/, (m) => [dr('bank', toPaise(m[1])), cr('cash', toPaise(m[1]))]],
  [
    /^Sold goods to (.+) on credit, list price (₹[\d,]+) less (\d+)% trade discount\.$/,
    (m) => {
      const net = (toPaise(m[2]) * (100 - Number(m[3]))) / 100;
      return [dr(debtor(m[1]), net), cr('sales', net)];
    },
  ],
  [
    /^Bought goods from (.+) on credit, list price (₹[\d,]+) less (\d+)% trade discount\.$/,
    (m) => {
      const net = (toPaise(m[2]) * (100 - Number(m[3]))) / 100;
      return [dr('purchases', net), cr(creditor(m[1]), net)];
    },
  ],
  [
    /^Sold goods costing (₹[\d,]+) to (.+) on credit for (₹[\d,]+)\.$/,
    (m) => [dr(debtor(m[2]), toPaise(m[3])), cr('sales', toPaise(m[3]))],
  ],
  [/^Sold goods costing (₹[\d,]+) for (₹[\d,]+), received in cash\.$/, (m) => [dr('cash', toPaise(m[2])), cr('sales', toPaise(m[2]))]],
  [/^Took a loan of (₹[\d,]+) from (?:a friend|a relative|a family friend), received in cash\.$/, (m) => [dr('cash', toPaise(m[1])), cr('loan', toPaise(m[1]))]],
  [/^Paid (₹[\d,]+) for (.+) out of petty cash\.$/, (m) => (PETTY_WHAT[m[2]] ? [dr(PETTY_WHAT[m[2]], toPaise(m[1])), cr('pettyCash', toPaise(m[1]))] : [])],
  [/^Bought stationery for the office (₹[\d,]+), paid by cheque\.$/, (m) => [dr('stationery', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [
    /^Received (₹[\d,]+) in cash from (.+) and allowed a discount of (₹[\d,]+)\.$/,
    (m) => [dr('cash', toPaise(m[1])), dr('discountAllowed', toPaise(m[3])), cr(debtor(m[2]), toPaise(m[1]) + toPaise(m[3]))],
  ],
  [
    /^Paid (.+) (₹[\d,]+) in cash and received a discount of (₹[\d,]+)\.$/,
    (m) => [dr(creditor(m[1]), toPaise(m[2]) + toPaise(m[3])), cr('cash', toPaise(m[2])), cr('discountReceived', toPaise(m[3]))],
  ],
  [/^Gave away goods costing (₹[\d,]+) as charity\.$/, (m) => [dr('charity', toPaise(m[1])), cr('purchases', toPaise(m[1]))]],
  [/^Distributed goods costing (₹[\d,]+) as free samples\.$/, (m) => [dr('advertisement', toPaise(m[1])), cr('purchases', toPaise(m[1]))]],
  [
    /^Goods costing (₹[\d,]+) were destroyed by fire; the insurance company admitted a claim of (₹[\d,]+)\.$/,
    (m) => [dr('lossByFire', toPaise(m[1]) - toPaise(m[2])), dr('insuranceClaimReceivable', toPaise(m[2])), cr('purchases', toPaise(m[1]))],
  ],
  [/^Paid the proprietor's house rent (₹[\d,]+) by cheque\.$/, (m) => [dr('drawings', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [/^Paid the premium on the proprietor's own life insurance policy, (₹[\d,]+), by cheque\.$/, (m) => [dr('drawings', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [/^.+ took goods costing (₹[\d,]+) from the shop for personal use\.$/, (m) => [dr('drawings', toPaise(m[1])), cr('purchases', toPaise(m[1]))]],
  [/^Bought a packing machine for the shop (₹[\d,]+), paid by cheque\.$/, (m) => [dr('machinery', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [/^Paid (₹[\d,]+) in cash as wages for installing the packing machine\.$/, (m) => [dr('machinery', toPaise(m[1])), cr('cash', toPaise(m[1]))]],
  [/^Paid (₹[\d,]+) in cash for repairs to the shop furniture\.$/, (m) => [dr('repairs', toPaise(m[1])), cr('cash', toPaise(m[1]))]],
  [/^Paid (₹[\d,]+) for postage by cheque\.$/, (m) => [dr('postage', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [/^Paid (₹[\d,]+) for repairs to the shop by cheque\.$/, (m) => [dr('repairs', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [
    /^Bought (furniture|office equipment|a computer) for the shop from (.+) on credit (₹[\d,]+)\.$/,
    (m) => {
      const id = { furniture: 'furniture', 'office equipment': 'officeEquipment', 'a computer': 'computers' }[m[1]]!;
      return [dr(id, toPaise(m[3])), cr(creditor(m[2]), toPaise(m[3]))];
    },
  ],
];
const extraTransaction = (text: string): JournalLine[] | null => {
  for (const [re, lines] of EXTRA_FORMS) {
    const m = re.exec(text);
    if (m) {
      const made = lines(m);
      return made.length > 0 ? made : null;
    }
  }
  return null;
};

/** The case text read back: every dated transaction, and every error listed after them. Null when a line is not understood. */
function readBooks(text: string): Read | null {
  const g = gstOf(text);
  const entries: DatedEntry[] = [];
  const balances: JournalLine[] = [];
  const sentences: [string, string][] = [];
  for (const row of text.split('\n')) {
    const dated = /^(\d{1,2} [A-Z][a-z]+): (.+)$/.exec(row);
    const slip = /^\(([a-f])\) (.+)$/.exec(row);
    const balance = /^([^:₹]+): ₹([\d,]+)(?: \((Dr|Cr)\))?$/.exec(row);
    if (dated) {
      // A line of a printed journal ("Bank A/c Dr ₹19,000; To Kiran A/c ₹19,000"), or a transaction in words.
      const lines = / A\/c Dr ₹/.test(dated[2]) ? readJournalLine(dated[2]) : (extraTransaction(dated[2]) ?? readTransaction(dated[2], g));
      if (!lines) return null;
      entries.push({ date: dated[1], lines });
    } else if (slip) {
      sentences.push([slip[1], slip[2]]);
    } else if (balance) {
      const party = /^(.+) \((debtor|creditor)\)$/.exec(balance[1]);
      const id = party ? (party[2] === 'debtor' ? debtor(party[1]) : creditor(party[1])) : accountNamed(`${balance[1]} A/c`);
      if (!id) return null;
      // A balance that says its side keeps it; otherwise an asset is a debit balance and anything else a credit one.
      const side = balance[3] ?? (resolveAccount(id).type === 'asset' ? 'Dr' : 'Cr');
      balances.push(side === 'Dr' ? dr(id, toPaise(balance[2])) : cr(id, toPaise(balance[2])));
    }
  }
  let opening: DatedEntry | null = null;
  if (balances.length > 0) {
    const day = /on (1 [A-Z][a-z]+)/.exec(text) ?? /on (\d{1,2} [A-Z][a-z]+)/.exec(text);
    // Capital is the balancing figure, unless it is listed.
    const capital = balances.some((l) => l.accountId === 'capital') ? 0 : net(balances);
    if (!day || capital < 0 || (capital === 0 && net(balances) !== 0)) return null;
    opening = { date: day[1], lines: [...balances, ...(capital > 0 ? [cr('capital', capital)] : [])] };
    entries.unshift(opening);
  }
  const slips = new Map<string, { done: JournalLine[]; should: JournalLine[] }>();
  for (const [letter, sentence] of sentences) {
    const read = readSlip(sentence, entries);
    if (!read) return null;
    slips.set(letter, read);
  }
  return { entries, slips, opening };
}

/**
 * A ledger account checked against the case text: its balance, found by posting the entries read from the text, is
 * carried down on the shorter side (and brought down where the task asks); each side carries what those entries
 * debit and credit to the account; and every row names an account on the other side of the entry of its date.
 */
function ledgerAccountRead(q: AccountQuestion): boolean {
  const read = readBooks(q.data);
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
      if (r.label === BALANCE_BD || entry === read.opening) return r.label === BALANCE_BD && entry === read.opening && own(entry)[0].amount === r.amounts[0];
      const other = entry.lines.find((l) => l.side !== side && ledgerLabel(l.accountId) === r.label);
      return other !== undefined && (r.amounts[0] === other.amount || r.amounts[0] === own(entry)[0].amount);
    });
  });
}

/** Debit total less credit total of the trial balance, caused by an error as read. */
const gapOf = (s: { done: JournalLine[]; should: JournalLine[] }): number => net(s.done) - net(s.should);
const lettersIn = (text: string): string[] => [...text.matchAll(/\(([a-f])\)/g)].map((m) => m[1]);
const correctText = (q: McqQuestion): string => q.options.find((o) => o.id === q.correct)?.text ?? '';

/**
 * True when `lines` rectify the error as read: posted on top of the books as they were, they give every account its
 * right balance, and Suspense A/c takes exactly the difference the error caused (and nothing when it caused none).
 */
function rectifies(lines: readonly JournalLine[], s: { done: JournalLine[]; should: JournalLine[] }): boolean {
  const gap = gapOf(s);
  const accounts = new Set([...s.done, ...s.should, ...lines].map((l) => l.accountId));
  for (const id of accounts) {
    const of = (ls: readonly JournalLine[]) => net(ls.filter((l) => l.accountId === id));
    if (id === 'suspense') {
      // A debit excess put the difference on the credit side of Suspense A/c: the entry debits it, and so clears it.
      if (of(lines) !== gap) return false;
    } else if (of(s.done) + of(lines) !== of(s.should)) return false;
  }
  return net(lines) === 0 && (gap !== 0 || lines.every((l) => l.accountId !== 'suspense'));
}

/** A rectifying entry of a case, checked against the error its prompt names, as read from the case text. */
function verifyRectifying(q: JournalQuestion): boolean {
  const read = readBooks(q.context ?? '');
  const s = read?.slips.get(lettersIn(q.prompt)[0] ?? '');
  return !!s && rectifies(q.expected, s);
}

/** The entry of a dated transaction of a case, checked against the line of that date read from the case text. */
function verifyDatedEntry(q: JournalQuestion): boolean {
  const date = new RegExp(`transaction of ${DAY}`).exec(q.prompt)?.[1];
  const entry = readBooks(q.context ?? '')?.entries.find((e) => e.date === date);
  return !!entry && linesKey(entry.lines) === linesKey(q.expected);
}

/** The difference in the trial balance the errors of a case leave, read from the case text: debit total less credit total. */
function readGap(q: { context?: string }): number | null {
  const read = readBooks(q.context ?? '');
  return read && read.slips.size > 0 ? sum([...read.slips.values()].map(gapOf)) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Working about errors, shared by the cases
// ---------------------------------------------------------------------------------------------------------------

/** What one error did to the two totals, for a working line. */
function gapLine(e: Fault, i: number): string {
  const gap = tbNet(e);
  if (gap === 0) return `${tag(i)} leaves the two totals equal.`;
  const note = e.group === 'wrongSide' ? ' (twice the amount: missing from one side, added to the other)' : e.group === 'wrongAmount' ? ' (the difference between the two figures)' : '';
  return `${tag(i)} makes the ${gap > 0 ? 'debit' : 'credit'} total larger by ${F(Math.abs(gap))}${note}.`;
}

/** The difference a learner gets who counts a posting on the wrong side once, or takes the whole of a wrong figure. */
const gapOnce = (e: Fault): number => (e.group === 'wrongSide' ? tbNet(e) / 2 : tbNet(e));
const gapWhole = (e: Fault): number => (e.group === 'wrongAmount' ? Math.sign(tbNet(e)) * e.x : tbNet(e));
const ONCE_WHY = 'Counted the posting on the wrong side once; it is missing from one side and has been added to the other, so the totals differ by twice the amount.';
const WHOLE_WHY = 'Took the whole amount of the item posted at a wrong figure; only the difference between the two figures upsets the totals.';

/** The question on the difference in the trial balance that the errors of a case leave. */
function differencePart(faults: readonly Fault[], prompt: string): NumericParts | null {
  const gaps = faults.map(tbNet);
  const gap = sum(gaps);
  const answer = Math.abs(gap);
  const twoSided = faults.map((e, i) => i).filter((i) => gaps[i] === 0);
  return numeric({
    prompt,
    answer,
    commonErrors: present<Slip>(
      { value: sum(gaps.map(Math.abs)), why: 'Added the differences of the errors without regard to the side each one made larger; errors on opposite sides partly cancel.' },
      faults.some((e) => e.group === 'wrongSide') && { value: Math.abs(sum(faults.map(gapOnce))), why: ONCE_WHY },
      faults.some((e) => e.group === 'wrongAmount') && { value: Math.abs(sum(faults.map(gapWhole))), why: WHOLE_WHY },
      twoSided.length > 0 && { value: answer + faults[twoSided[0]].x, why: `Counted error ${tag(twoSided[0])} as well; it left the debit and credit totals equal.` },
      ...faults.flatMap((_, i) => (gaps[i] !== 0 && gaps.filter((g) => g !== 0).length > 1 ? [{ value: Math.abs(gaps[i]), why: `Took error ${tag(i)} alone; every error that upset the totals is part of the difference.` }] : [])),
    ),
    explanation: [
      ...faults.map((e, i) => gapLine(e, i)),
      gap > 0
        ? `Net: the debit total was larger by ${F(answer)}, so the trial balance differed by ${F(answer)}.`
        : `Net: the credit total was larger by ${F(answer)}, so the trial balance differed by ${F(answer)}.`,
    ],
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Figures that look like a slip of the pen
// ---------------------------------------------------------------------------------------------------------------

/**
 * A figure written with two neighbouring digits the wrong way round (₹70,800 as ₹78,000), as a clerk slips; the
 * digits are among the significant ones, and the figure keeps its length. Null when no such pair exists.
 */
function transposed(rng: Rng, p: Paise): Paise | null {
  const digits = String(p / 100).split('');
  const pairs = digits.flatMap((d, i) => (i + 1 < digits.length && d !== digits[i + 1] && !(i === 0 && digits[1] === '0') ? [i] : []));
  // Only the first three places, where a clerk's eye slips, and never the last two (they are round in every figure).
  const usable = pairs.filter((i) => i < 3 && i + 1 <= digits.length - 3);
  if (usable.length === 0) return null;
  const i = rng.pick(usable);
  const out = [...digits];
  [out[i], out[i + 1]] = [out[i + 1], out[i]];
  return rupees(Number(out.join('')));
}

// ---------------------------------------------------------------------------------------------------------------
// The order of a month
// ---------------------------------------------------------------------------------------------------------------

/**
 * True while the goods sold so far, at their selling price, are never more than the goods had so far could fetch:
 * the opening stock and the purchases less what went back, at cost, with a margin of at most two fifths on it. A
 * shop that sells at a profit may sell for more than it paid, but not for much more than it has.
 */
function sellsWhatItHas(order: readonly Step[], opening: Paise = 0): boolean {
  let had = opening;
  let sold = 0;
  for (const s of order) {
    for (const l of s.lines) {
      if (l.accountId === 'purchases' && l.side === 'Dr') had += l.amount;
      if (l.accountId === 'purchasesReturn' && l.side === 'Cr') had -= l.amount;
      if (l.accountId === 'sales' && l.side === 'Cr') sold += l.amount;
      if (l.accountId === 'salesReturn' && l.side === 'Dr') sold -= l.amount;
    }
    if (sold * 5 > had * 7) return false;
  }
  return true;
}

/**
 * An order for the month that can happen: `first`, then the threads merged, each keeping its own order. Cash and
 * bank never run out, nobody pays or is paid more than is owed at the time, and nothing is sold that the business
 * does not have (`sellsWhatItHas`). A few orders are tried before the seed is given up.
 */
function order(rng: Rng, first: Step[], threads: Step[][], funds = { cash: 0, bank: 0 }, stock: Paise = 0): Step[] | null {
  for (let go = 0; go < 20; go++) {
    const all = [...first, ...interleave(rng, threads)];
    if (storyHolds(all, funds) && sellsWhatItHas(all, stock)) return all;
  }
  return null;
}

// ===============================================================================================================
// Case 1. A month of trading with GST, posted with errors (complex)
// ===============================================================================================================

interface GstErrors {
  b: Business;
  city: string;
  state: string;
  g: Gst;
  all: Dated[];
  faults: Fault[];
  /** The GST transaction whose entry is asked for. */
  focus: Dated;
  /** The error whose rectifying entry is asked for: one that went through Suspense A/c. */
  fix: number;
  ledger: Ledger;
}

/** The tax accounts of a case: CGST and SGST within the State, IGST between States. */
const taxIds = (g: Gst, dir: 'input' | 'output'): string[] => (g.intra ? [`${dir}CGST`, `${dir}SGST`] : [`${dir}IGST`]);

const gstErrors = caseTemplate<GstErrors>({
  id: 'case-books-gst-posting-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A month with GST, posted with errors',
  setup: (rng) => {
    const b = business(rng);
    const [city, state] = rng.pick(CITIES);
    const g: Gst = { rate: rng.pick([5, 18]), intra: rng.pick([true, false]) };
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick(CUSTOMERS);
    const capital = amount(rng, 300000, 600000, 50000);
    const buyCredit = amount(rng, 60000, 120000, 5000);
    const buyCheque = amount(rng, 30000, 60000, 5000);
    const back = rng.pick(['out', 'in', 'none'] as const);
    const returned = amount(rng, 4000, 12000, 2000);
    const returnOut = back === 'out' ? returned : 0;
    const returnIn = back === 'in' ? returned : 0;
    // GST is payable for the month: the goods sold fetch a tenth to three tenths more than the goods bought cost.
    const target = Math.round(((buyCredit + buyCheque - returnOut) * rng.pick([110, 120, 125, 130])) / 100 / 500000) * 500000 + returnIn;
    const sellCredit = Math.round((target * rng.pick([45, 55, 65])) / 100 / 500000) * 500000;
    const sellCheque = target - sellCredit;
    if (sellCheque < rupees(20000) || buyCredit === buyCheque || sellCredit === sellCheque) return null;
    const withTax = (x: Paise) => x + gstOn(g, x);
    const paid = partOf(rng, withTax(buyCredit) - withTax(returnOut));
    const received = partOf(rng, withTax(sellCredit) - withTax(returnIn));
    if (paid <= 0 || received <= 0) return null;
    const salaried = rng.pick([true, false]);
    const other = salaried ? cs.expense(SALARIES, 'bank', amount(rng, 8000, 20000, 1000)) : cs.drawings(b.owner, 'bank', amount(rng, 5000, 15000, 1000));
    const steps = order(
      rng,
      [cs.capital('bank', capital), cs.gstBuy(g, buyCredit, supplier)],
      [
        [...(returnOut ? [cs.gstReturnOut(g, returnOut, supplier)] : []), cs.paySupplier(supplier, paid, 0)],
        [cs.gstSell(g, sellCredit, customer), ...(returnIn ? [cs.gstReturnIn(g, returnIn, customer)] : []), cs.receive(customer, received, 0)],
        [cs.gstBuy(g, buyCheque, null)],
        [cs.gstSell(g, sellCheque, null)],
        [other],
      ],
    );
    if (!steps) return null;
    const all = onDays(rng, b, steps);
    const find = (key: string) => all.find((t) => t.key === key)!;

    // Two errors that upset the trial balance, from different transactions and of different kinds, and in some
    // months a third that did not.
    const credit = rng.pick([find('gstBuyCredit'), find('gstSellCredit')]);
    const party = credit.lines.find((l) => l.accountId.includes(':'))!;
    const taxed = rng.pick([find('gstBuyCredit'), find('gstSellCredit'), find('gstBuyCheque'), find('gstSellCheque')].filter((t) => t !== credit));
    const taxLine = rng.pick(taxed.lines.filter((l) => /GST$/.test(l.accountId)));
    const cheque = rng.pick([find('paySupplier'), find('receiveFromCustomer')]);
    const chequeParty = cheque.lines.find((l) => l.accountId.includes(':'))!;
    const figure = transposed(rng, party.amount);
    if (figure === null) return null;
    const oneSided: [Dated, Fault][] = [
      [credit, fault.wrongFigure(credit, party.accountId, figure)],
      [taxed, fault.notPosted(taxed, taxLine.accountId)],
      [cheque, fault.wrongSide(cheque, chequeParty.accountId)],
      [find('gstSellCheque'), fault.notPosted(find('gstSellCheque'), 'sales')],
    ];
    // Two of them, of two different transactions.
    const [first, ...rest] = rng.shuffle(oneSided);
    const second = rng.pick(rest.filter(([t]) => t !== first[0]));
    const twoSided: Fault = salaried ? fault.instead(find('expense:salaries'), 'salaries', 'wages') : fault.leftOut(find('drawings'));
    const faults = rng.shuffle([first[1], second[1], ...(rng.pick([true, false]) ? [twoSided] : [])]);
    const gaps = faults.map(tbNet);
    if (sum(gaps) === 0 || new Set(gaps.filter((x) => x !== 0).map(Math.abs)).size < gaps.filter((x) => x !== 0).length) return null;
    const ledger = post(all.map((t) => t.lines));
    const focus = rng.pick(all.filter((t) => t.key.startsWith('gst')));
    const fix = rng.pick(faults.map((_, i) => i).filter((i) => gaps[i] !== 0));
    return { b, city, state, g, all, faults, focus, fix, ledger };
  },
  context: (s) =>
    [
      `${s.b.owner} opened ${s.b.shop} in ${s.city}, ${s.state}, on ${firstDay(s.b)}. All goods carry GST at ${s.g.rate}%.`,
      s.g.intra
        ? `Every purchase and sale is within ${s.state} (intra-State): CGST and SGST at ${s.g.rate / 2}% each.`
        : `Every purchase and sale is with a party outside ${s.state} (inter-State): IGST at ${s.g.rate}%.`,
      'No GST has been set off or paid to the government yet. Cheques received are banked the same day.',
      ...s.all.map((t) => `${t.date}: ${t.text}`),
      `The trial balance drawn up on ${monthEnd(s.b)} did not agree, and the difference was put to a Suspense A/c. These errors were then found in the books; there are no others:`,
      ...s.faults.map((e, i) => `${tag(i)} ${e.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the journal entry for the transaction of ${s.focus.date}.`,
        lines: s.focus.lines,
        explanation: s.focus.steps,
        distractorAccounts: s.focus.distract,
      }),
      verify: verifyDatedEntry,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { g } = s;
        const output = sum(taxIds(g, 'output').map((id) => -(s.ledger.get(id) ?? 0)));
        const input = sum(taxIds(g, 'input').map((id) => s.ledger.get(id) ?? 0));
        const sold = sum(s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'sales').map((l) => l.amount))) - sum(s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'salesReturn').map((l) => l.amount)));
        const bought = sum(s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'purchases').map((l) => l.amount))) - sum(s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'purchasesReturn').map((l) => l.amount)));
        return numeric({
          prompt: `Once the errors are rectified, input GST is set off against output GST. How much GST${g.intra ? ' (CGST and SGST together)' : ''} does ${s.b.owner} have to pay to the government for ${s.b.month}?`,
          answer: output - input,
          commonErrors: present<Slip>(
            { value: output + input, why: 'Added the input GST to the output GST; input GST is tax already paid and is deducted.' },
            { value: output, why: 'Gave the whole output GST; the input GST paid on purchases is set off against it.' },
            g.intra && { value: (output - input) / 2, why: 'Gave the CGST payable alone; SGST of the same amount is payable too.' },
            { value: input, why: 'Gave the input GST; that is the credit available, not the tax payable.' },
          ),
          explanation: [
            `Output GST (sales less returns): ${g.rate}% of ${F(sold)} = ${F(gstOn(g, sold))}.`,
            `Input GST (purchases less returns): ${g.rate}% of ${F(bought)} = ${F(gstOn(g, bought))}.`,
            'The errors are in the posting only: once they are rectified, the GST accounts carry what the transactions put there.',
            `GST payable = ${F(gstOn(g, sold))} - ${F(gstOn(g, bought))} = ${F(gstOn(g, sold) - gstOn(g, bought))}.`,
          ],
        });
      },
      // Worked again from the entries read back from the case: the tax credited on sales less the tax debited on purchases.
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        if (!read) return false;
        const lines = read.entries.flatMap((e) => e.lines);
        // Output GST stands on the credit side and input GST on the debit side: the net of all of them is what is payable.
        const payable = -net(lines.filter((l) => /^(input|output)[CSI]GST$/.test(l.accountId)));
        return q.answer === payable && payable > 0;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => differencePart(s.faults, `By what amount did the two columns of the trial balance on ${monthEnd(s.b)} differ?`),
      verify: (q: NumericQuestion) => {
        const gap = readGap(q);
        return gap !== null && gap !== 0 && q.answer === Math.abs(gap);
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const gap = sum(s.faults.map(tbNet));
        return suspenseSideParts('What kind of balance did the Suspense A/c open with, and why?', gap, [
          ...s.faults.map((e, i) => gapLine(e, i)),
          `Together the errors made the ${gap > 0 ? 'debit' : 'credit'} column larger by ${F(Math.abs(gap))}. Suspense A/c goes on the shorter side, so it opened with a ${gap > 0 ? 'credit' : 'debit'} balance.`,
        ]);
      },
      verify: (q: McqQuestion) => {
        const gap = readGap(q);
        return gap !== null && gap !== 0 && correctText(q) === (gap > 0 ? 'Credit balance: the debit column was the larger' : 'Debit balance: the credit column was the larger');
      },
    },
    { kind: 'journal', make: (s): JournalParts => entryParts(s.faults[s.fix], s.fix), verify: verifyRectifying },
  ],
});

// ===============================================================================================================
// Case 2. Day books posted with errors (complex)
// ===============================================================================================================

/** A side of an account as a working line: its items with their dates, and their total when there are several. */
const sideSum = (label: string, items: readonly { t: { date: string }; l: JournalLine }[]): string =>
  items.length === 1
    ? `${label}: ${F(items[0].l.amount)} (${items[0].t.date}).`
    : `${label}: ${items.map((p) => `${F(p.l.amount)} (${p.t.date})`).join(' + ')} = ${F(sum(items.map((p) => p.l.amount)))}.`;

/** The balance of a party's account at the end of a month, as the entries of the month leave it. */
function partyBalance(all: readonly Dated[], id: string, b: Business, faults: readonly Fault[], lead = 'Once the errors are rectified, what'): NumericParts | null {
  const supplier = id.startsWith('creditor:');
  const who = resolveAccount(id).name;
  const posts = all.flatMap((t) => t.lines.filter((l) => l.accountId === id).map((l) => ({ t, l })));
  const up = posts.filter(({ l }) => l.side === (supplier ? 'Cr' : 'Dr'));
  const downs = posts.filter(({ l }) => l.side !== (supplier ? 'Cr' : 'Dr'));
  const answer = sum(up.map((p) => p.l.amount)) - sum(downs.map((p) => p.l.amount));
  if (answer <= 0 || posts.length < 2) return null;
  // As the clerk left it: the errors that touched this account, applied to it.
  const asPosted = answer + (supplier ? -1 : 1) * sum(faults.map((f) => net(f.done.filter((l) => l.accountId === id)) - net(f.should.filter((l) => l.accountId === id))));
  const returned = downs.filter(({ t }) => t.key === 'returnOut' || t.key === 'returnIn');
  const settled = downs.filter(({ t }) => t.key === 'paySupplier' || t.key === 'receiveFromCustomer');
  return numeric({
    prompt: `${lead} is the balance of ${poss(who)} account on ${monthEnd(b)}?`,
    answer,
    commonErrors: present<Slip>(
      asPosted !== answer && asPosted > 0 && { value: asPosted, why: `Gave the balance as the clerk posted it; the errors that touched ${poss(who)} account have to be put right first.` },
      ...returned.map(({ l }) => ({ value: answer + l.amount, why: `Left out the goods returned; a return reduces the balance of the ${supplier ? 'supplier' : 'customer'}.` })),
      ...settled.map(({ l }) => ({ value: answer + 2 * l.amount, why: `Added the cheque to the balance; a cheque ${supplier ? 'paid to the supplier' : 'received from the customer'} reduces it.` })),
      { value: sum(up.map((p) => p.l.amount)), why: `Stopped at the total of the ${supplier ? 'credit' : 'debit'} side; what ${supplier ? 'was paid or returned' : 'was received or returned'} is set against it.` },
    ),
    explanation: [
      sideSum(`${supplier ? 'Credit' : 'Debit'} side`, up),
      sideSum(`${supplier ? 'Debit' : 'Credit'} side`, downs),
      `Balance = ${F(sum(up.map((p) => p.l.amount)))} - ${F(sum(downs.map((p) => p.l.amount)))} = ${F(answer)} (${supplier ? 'credit' : 'debit'}).`,
    ],
  });
}

/** The balance asked for in a prompt ("balance of Kiran's account"), worked again by posting the entries read back from the case. */
function verifyPartyBalance(q: NumericQuestion): boolean {
  const read = readBooks(q.context ?? '');
  const name = /balance of (.+?)'s? account/.exec(q.prompt)?.[1];
  if (!read || !name) return false;
  const ledger = post(read.entries.map((e) => e.lines));
  const ids = [...ledger.keys()].filter((id) => (id.startsWith('debtor:') || id.startsWith('creditor:')) && resolveAccount(id).name === name);
  return ids.length === 1 && balanceOf(ledger, ids[0])?.amount === q.answer;
}

/** The question on which errors left the totals of the trial balance equal. */
function untouchedPart(faults: readonly Fault[]): McqParts | null {
  const gaps = faults.map(tbNet);
  const equal = faults.map((_, i) => i).filter((i) => gaps[i] === 0);
  const upset = faults.map((_, i) => i).filter((i) => gaps[i] !== 0);
  if (equal.length !== 1) return null;
  return choice({
    prompt: 'Which of the errors did not affect the agreement of the trial balance?',
    correct: `Error ${tag(equal[0])}`,
    distractors: [
      ...upset.map((i) => ({ text: `Error ${tag(i)}`, why: `Error ${tag(i)} left one account wrong, so the ${gaps[i] > 0 ? 'debit' : 'credit'} total was larger by ${F(Math.abs(gaps[i]))}.` })),
      { text: 'None of them: every error upsets the trial balance', why: `Error ${tag(equal[0])} left debits and credits equal, so the totals still agreed.` },
      { text: 'All of them', why: 'Took an error that leaves one account wrong as harmless; it makes one column larger than the other.' },
    ],
    explanation: faults.map((e, i) => gapLine(e, i)).join(' '),
  });
}

/** The letter the right option names is the one error whose difference, as read from the case text, is nil. */
function verifyUntouched(q: McqQuestion): boolean {
  const read = readBooks(q.context ?? '');
  if (!read) return false;
  const nil = [...read.slips].filter(([, s]) => gapOf(s) === 0).map(([l]) => l);
  return nil.length === 1 && correctText(q) === `Error (${nil[0]})`;
}

interface BookErrors {
  b: Business;
  m: CreditMonth;
  faults: Fault[];
  book: 'Purchases Book' | 'Sales Book';
  party: string;
  fix: number;
}

const bookErrors = caseTemplate<BookErrors>({
  id: 'case-books-day-books-posting-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Day books and their posting, with errors',
  setup: (rng) => {
    const b = business(rng);
    const m = creditMonth(rng, b, rng.pick([true, false]));
    if (!m) return null;
    const { all } = m;
    const { ones, twos } = monthMakers(rng, m, true);
    // One error in a book as a whole, one in posting a single transaction, and one that left the totals equal.
    const books = (['Purchases Book', 'Sales Book', 'Purchases Return Book', 'Sales Return Book'] as const).filter((x) => bookTotal(all, x) > 0);
    const book = rng.pick(books);
    const inBook = rng.pick([true, false])
      ? fault.cast(book, rng.pick([true, false]), rupees(rng.pick([100, 200, 500, 1000]) * rng.int(1, 9)))
      : fault.totalWrongSide(book, bookTotal(all, book));
    const drawn = drawFaults(rng, all.slice(1), [
      { makers: ones, count: 1 },
      { makers: twos, count: 1 },
    ]);
    if (!drawn) return null;
    const faults = rng.shuffle([inBook, ...drawn]);
    const gaps = faults.map(tbNet);
    if (sum(gaps) === 0 || new Set(gaps.filter((g) => g !== 0).map(Math.abs)).size < 2) return null;
    // The party asked about has a return, where the month has one: its account then has three items.
    const party = m.returnOut && (!m.returnIn || rng.pick([true, false])) ? creditor(m.supplier) : m.returnIn ? debtor(m.customer) : rng.pick([debtor(m.customer), creditor(m.supplier)]);
    return { b, m, faults, book: rng.pick(['Purchases Book', 'Sales Book'] as const), party, fix: faults.indexOf(inBook) };
  },
  context: (s) =>
    [
      `${s.b.owner} opened ${s.b.shop} on ${firstDay(s.b)} and keeps a Purchases Book, a Sales Book, a Purchases Return Book and a Sales Return Book; their totals are posted at the end of the month.${returnsNote(s.m)} Cheques received are banked the same day.`,
      ...s.m.all.map((t) => `${t.date}: ${t.text}`),
      `The trial balance drawn up on ${monthEnd(s.b)} did not agree, and the difference was put to a Suspense A/c. These errors were then found in the books; there are no others:`,
      ...s.faults.map((e, i) => `${tag(i)} ${e.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { all } = s.m;
        const sales = s.book === 'Sales Book';
        const total = bookTotal(all, s.book);
        const cashDeals = all.filter((t) => (sales ? t.key === 'saleCash' || t.key === 'saleCheque' : t.key === 'goodsCash' || t.key === 'goodsCheque')).map((t) => t.lines[0].amount);
        const back = bookTotal(all, sales ? 'Sales Return Book' : 'Purchases Return Book');
        const assetCost = all.find((t) => t.key === 'asset')?.lines[0].amount ?? 0;
        return numeric({
          prompt: `What is the total of the ${s.book} for ${s.b.month}?`,
          answer: total,
          commonErrors: present<Slip>(
            ...cashDeals.map((x) => ({ value: total + x, why: `Included the ${sales ? 'sale' : 'purchase'} settled in cash or by cheque; the ${s.book} takes credit ${sales ? 'sales' : 'purchases'} only, and that one is in the Cash Book.` })),
            back > 0 && { value: total - back, why: `Deducted the goods returned; returns are entered in the ${sales ? 'Sales' : 'Purchases'} Return Book and leave this total as it is.` },
            !sales && assetCost > 0 && { value: total + assetCost, why: 'Included the asset bought for the shop; the Purchases Book takes only goods bought for resale on credit.' },
            { value: Math.max(...bookRowsOf(all, !sales, null).map((r) => r.amounts[0])), why: `Took the largest invoice alone; every credit ${sales ? 'sale' : 'purchase'} of goods is entered.` },
            { value: bookTotal(all, sales ? 'Purchases Book' : 'Sales Book'), why: `Gave the total of the ${sales ? 'Purchases' : 'Sales'} Book.` },
          ),
          explanation: [
            `The ${s.book} takes goods ${sales ? 'sold' : 'bought'} on credit: ${bookRowsOf(all, !sales, null).map((r) => `${r.date}, ${r.label} ${F(r.amounts[0])}`).join('; ')}.`,
            `Total = ${bookRowsOf(all, !sales, null).map((r) => F(r.amounts[0])).join(' + ')} = ${F(total)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const book = /total of the (.+ Book) for/.exec(q.prompt)?.[1];
        return !!read && (book === 'Sales Book' || book === 'Purchases Book') && sum(bookRowsOf(read.entries, book === 'Purchases Book', null).map((r) => r.amounts[0])) === q.answer;
      },
    },
    { kind: 'numeric', unit: 'rupees', make: (s) => partyBalance(s.m.all, s.party, s.b, s.faults), verify: verifyPartyBalance },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => differencePart(s.faults, `By what amount did the two columns of the trial balance on ${monthEnd(s.b)} differ?`),
      verify: (q: NumericQuestion) => {
        const gap = readGap(q);
        return gap !== null && gap !== 0 && q.answer === Math.abs(gap);
      },
    },
    { kind: 'journal', make: (s): JournalParts => entryParts(s.faults[s.fix], s.fix), verify: verifyRectifying },
    { kind: 'mcq', make: (s) => untouchedPart(s.faults), verify: verifyUntouched },
  ],
});

// ===============================================================================================================
// Case 3. The accounting equation, the journal and the capital of a new shop (medium)
// ===============================================================================================================

/** A transaction with what it does to the equation, in the accounts of the equation (stock, debtors, capital, ...). */
interface EqStep extends Step {
  eq: JournalLine[];
}
const withEq = (s: Step, eq?: JournalLine[]): EqStep => ({ ...s, eq: eq ?? s.lines });

type Term = 'assets' | 'liabilities' | 'capital';
/** The term of the equation an account belongs to: a debt to outsiders, the proprietor's capital, or an asset. */
const termOf = (id: string): Term =>
  id === 'capital' ? 'capital' : id.startsWith('creditor:') || id === 'loan' || id === 'outstandingExpenses' ? 'liabilities' : 'assets';
interface Effect {
  assets: Paise;
  liabilities: Paise;
  capital: Paise;
}
const effectOf = (eq: readonly JournalLine[]): Effect => {
  const e: Effect = { assets: 0, liabilities: 0, capital: 0 };
  for (const l of eq) e[termOf(l.accountId)] += (termOf(l.accountId) === 'assets' ? 1 : -1) * signed(l);
  return e;
};
const change = (x: Paise) => (x > 0 ? `up by ${F(x)}` : x < 0 ? `down by ${F(-x)}` : 'unchanged');
const effectText = (e: Effect) => `Assets ${change(e.assets)}; liabilities ${change(e.liabilities)}; capital ${change(e.capital)}`;

const eqMore = {
  /** Goods sold at a profit: the entry is at the selling price; the equation also loses the goods at their cost. */
  sale: (cost: Paise, price: Paise, customer: string | null): EqStep => {
    const at = customer ? debtor(customer) : 'cash';
    return {
      key: customer ? 'creditSale' : 'saleCash',
      text: customer ? `Sold goods costing ${F(cost)} to ${customer} on credit for ${F(price)}.` : `Sold goods costing ${F(cost)} for ${F(price)}, received in cash.`,
      brief: customer ? `Goods sold on credit to ${customer}, at a profit` : 'Goods sold for cash, at a profit',
      lines: [dr(at, price), cr('sales', price)],
      steps: [
        customer ? `${customer} owes the selling price, so ${poss(customer)} account is debited with ${F(price)}.` : `Cash comes in, so Cash A/c is debited with the selling price, ${F(price)}.`,
        'Sales A/c is credited with the selling price. The cost of the goods is not part of this entry.',
      ],
      distract: ['purchases', 'stock', 'capital'],
      eq: [dr(at, price), cr('stock', cost), cr('capital', price - cost)],
    };
  },
  loan: (a: Paise, lender: string): EqStep => ({
    key: 'loan',
    text: `Took a loan of ${F(a)} from ${lender}, received in cash.`,
    brief: 'Loan taken, received in cash',
    lines: [dr('cash', a), cr('loan', a)],
    steps: ['Cash comes in, so Cash A/c is debited.', 'The money has to be repaid, so it is a liability: Loan A/c is credited.'],
    distract: ['capital', 'bankLoan'],
    eq: [dr('cash', a), cr('loan', a)],
  }),
};

/** Wrong effects a student gives, each with the slip behind it; none of them the right one. */
function wrongEffects(right: Effect, x: Paise): Distractor[] {
  const same = (a: Effect, b: Effect) => a.assets === b.assets && a.liabilities === b.liabilities && a.capital === b.capital;
  // One asset exchanged for another leaves every total as it was; the slips about it are of another kind.
  const exchange = right.assets === 0 && right.liabilities === 0 && right.capital === 0;
  const out: [Effect, string][] = exchange
    ? [
        [{ assets: x, liabilities: 0, capital: x }, 'Counted the asset bought as new capital; it was paid for out of money the business already had.'],
        [{ assets: x, liabilities: x, capital: 0 }, 'Treated it as bought on credit; it was paid for at once, so nothing is owed.'],
        [{ assets: -x, liabilities: 0, capital: -x }, 'Treated what was bought as an expense; it is an asset that takes the place of the money paid.'],
      ]
    : [
        [{ assets: -right.assets, liabilities: -right.liabilities, capital: -right.capital }, 'Read the transaction the wrong way round: what comes in was taken as going out.'],
        [{ assets: right.assets, liabilities: right.capital, capital: right.liabilities }, 'Put the change in the wrong term: what is owed to outsiders is a liability, and what belongs to the proprietor is capital.'],
        [{ assets: right.assets, liabilities: 0, capital: 0 }, 'Changed the assets alone; the equation must stay equal, so liabilities or capital move with them.'],
        [{ assets: 0, liabilities: 0, capital: 0 }, 'Thought one asset only replaces another, which leaves every total unchanged.'],
      ];
  const seen: Effect[] = [right];
  return out.flatMap(([e, why]) => {
    if (seen.some((s) => same(s, e))) return [];
    seen.push(e);
    return [{ text: effectText(e), why }];
  });
}

/**
 * The equation of a case at the end of the month, read from its text: liabilities are what the entries leave owing to
 * creditors and lenders; capital is what was brought in, with the profit on every sale (selling price less the cost the
 * line states), discounts received, and less expenses and drawings; assets are the two together.
 */
function readEquation(text: string): Effect | null {
  const read = readBooks(text);
  if (!read) return null;
  const lines = read.entries.flatMap((e) => e.lines);
  const liabilities = -net(lines.filter((l) => termOf(l.accountId) === 'liabilities'));
  const profit = sum(
    text.split('\n').flatMap((row) => {
      const m = /: Sold goods costing (₹[\d,]+) (?:to .+ on credit )?for (₹[\d,]+)/.exec(row);
      return m ? [toPaise(m[2]) - toPaise(m[1])] : [];
    }),
  );
  // Goods bought and sold are stock in the equation: the profit on a sale is counted from its line, not from these accounts.
  const goods = ['purchases', 'sales', 'purchasesReturn', 'salesReturn'];
  const nominal = lines.filter((l) => ['expense', 'income'].includes(resolveAccount(l.accountId).type) && !goods.includes(l.accountId));
  const capital = -net(lines.filter((l) => l.accountId === 'capital' || l.accountId === 'drawings')) + profit - net(nominal);
  return { assets: liabilities + capital, liabilities, capital };
}

const LENDERS = ['a friend', 'a relative', 'a family friend'];
const THEORY = {
  dual: {
    prompt: 'After every transaction of the month, Assets = Liabilities + Capital still holds. Which accounting concept does this show?',
    correct: 'The dual aspect concept',
    distractors: [
      { text: 'The business entity concept', why: 'That concept keeps the proprietor apart from the business; it does not say that every transaction has two equal effects.' },
      { text: 'The going concern concept', why: 'That concept assumes the business will carry on; it says nothing about the two effects of a transaction.' },
      { text: 'The money measurement concept', why: 'That concept records only what can be measured in money; the equal effects come from the dual aspect.' },
      { text: 'The matching concept', why: 'That concept sets the expenses of a period against its revenue; it does not keep the equation equal.' },
    ],
    explanation: 'Every transaction has two aspects of equal amount, a debit and a credit, so the two sides of the equation change by the same amount: the dual aspect concept.',
  },
  entity: {
    prompt: 'The money the proprietor took for personal use reduced capital and was not treated as an expense of the shop. Which accounting concept requires this?',
    correct: 'The business entity concept',
    distractors: [
      { text: 'The dual aspect concept', why: 'That concept gives every transaction two equal effects; it is the separation of owner and business that makes drawings a reduction of capital.' },
      { text: 'The prudence concept', why: 'Prudence is about providing for losses and not anticipating gains; it does not decide what the proprietor takes.' },
      { text: 'The matching concept', why: 'Matching sets the expenses of a period against its revenue; drawings are not an expense of the business at all.' },
      { text: 'The consistency concept', why: 'Consistency asks that the same methods be followed every year; it does not separate the owner from the business.' },
    ],
    explanation: 'The business is treated as separate from its proprietor. What the proprietor takes for personal use is not a cost of running the shop: it reduces what the business owes the proprietor, capital.',
  },
};

interface EquationMonth {
  b: Business;
  all: (EqStep & { date: string })[];
  focus: EqStep & { date: string };
  entryOf: EqStep & { date: string };
  sale: EqStep & { date: string };
  ledger: Ledger;
  theory: keyof typeof THEORY;
  askLiabilities: boolean;
}

const equationMonth = caseTemplate<EquationMonth>({
  id: 'case-books-equation-journal-capital',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'The equation, the journal and the capital of a new shop',
  setup: (rng) => {
    const b = business(rng);
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick([null, rng.pick(CUSTOMERS)]);
    const capital = amount(rng, 200000, 500000, 50000);
    const bought = amount(rng, 60000, 120000, 10000);
    const cost = amount(rng, 30000, 60000, 5000);
    const price = cost + rng.pick([20, 25, 40]) * (cost / 100);
    const asset = rng.pick(ASSETS);
    const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
    const paid = partOf(rng, bought);
    const discount = rng.pick([0, rupees(rng.pick([500, 1000]))]);
    const withDrawings = rng.pick([true, false]);
    const loan = rng.pick([0, amount(rng, 30000, 80000, 10000)]);
    if (paid <= 0 || cost >= bought - rupees(10000) || price % 100 !== 0) return null;
    const steps: EqStep[] = [
      withEq(cs.capitalBoth(rupees(rng.pick([20000, 30000, 50000])), capital)),
      withEq(cs.creditPurchase(supplier, bought), [dr('stock', bought), cr(creditor(supplier), bought)]),
      ...rng.shuffle([
        withEq(cs.asset(asset, 'bank', pickAmount(rng, asset))),
        eqMore.sale(cost, price, customer),
        withEq(cs.expense(e, 'cash', pickAmount(rng, e)), undefined),
        withEq(cs.paySupplier(supplier, paid, discount)),
        ...(withDrawings ? [withEq(cs.drawings(b.owner, 'cash', amount(rng, 3000, 8000, 1000)))] : []),
        ...(loan ? [eqMore.loan(loan, rng.pick(LENDERS))] : []),
      ]),
    ];
    // In the equation an expense and drawings reduce capital, and a discount received raises it.
    for (const s of steps) {
      if (s.key.startsWith('expense') || s.key === 'drawings') s.eq = [dr('capital', s.lines[0].amount), s.lines[1]];
      if (s.key === 'paySupplier' && discount > 0) s.eq = [s.lines[0], s.lines[1], cr('capital', discount)];
    }
    const days = [1, ...daysBetween(rng, steps.length - 1, 2, 28)];
    const all = steps.map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    if (!storyHolds(all, { cash: 0, bank: 0 })) return null;
    const ledger = post(all.map((t) => t.eq));
    if ((ledger.get('stock') ?? 0) <= 0) return null;
    const focus = rng.pick(all.filter((t) => !['capitalBoth', 'creditSale', 'saleCash'].includes(t.key)));
    const entryOf = rng.pick(all.filter((t) => t !== focus && t.key !== 'capitalBoth'));
    return {
      b,
      all,
      focus,
      entryOf,
      sale: all.find((t) => t.key === 'creditSale' || t.key === 'saleCash')!,
      ledger,
      theory: withDrawings ? rng.pick(['dual', 'entity'] as const) : 'dual',
      askLiabilities: rng.pick([true, false]),
    };
  },
  context: (s) =>
    [
      `${s.b.owner} opened ${s.b.shop} on ${firstDay(s.b)}.`,
      'Take each transaction through Assets = Liabilities + Capital; profit, gains, expenses and drawings change capital.',
      ...s.all.map((t) => `${t.date}: ${t.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const right = effectOf(s.focus.eq);
        const x = Math.max(...s.focus.lines.map((l) => l.amount));
        return choice({
          prompt: `How does the transaction of ${s.focus.date} change the accounting equation?`,
          correct: effectText(right),
          distractors: wrongEffects(right, x),
          explanation: `${effectText(right)}. ${right.assets === right.liabilities + right.capital ? 'The two sides of the equation move by the same amount.' : ''}`.trim(),
        });
      },
      // Worked again from the entry read back from the case: purchases are goods in stock, creditors and loans are
      // liabilities, and capital takes drawings, expenses and gains.
      verify: (q: McqQuestion) => {
        const date = new RegExp(`transaction of ${DAY}`).exec(q.prompt)?.[1];
        const entry = readBooks(q.context ?? '')?.entries.find((e) => e.date === date);
        if (!entry) return false;
        const term = (id: string): Term => (termOf(id) === 'assets' && ['expense', 'income', 'capital'].includes(resolveAccount(id).type) && id !== 'purchases' ? 'capital' : termOf(id));
        const e: Effect = { assets: 0, liabilities: 0, capital: 0 };
        for (const l of entry.lines) e[term(l.accountId)] += (term(l.accountId) === 'assets' ? 1 : -1) * signed(l);
        return correctText(q) === effectText(e);
      },
    },
    {
      kind: 'journal',
      make: (s) => ({ prompt: `Pass the journal entry for the transaction of ${s.entryOf.date}.`, lines: s.entryOf.lines, explanation: s.entryOf.steps, distractorAccounts: s.entryOf.distract }),
      verify: verifyDatedEntry,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const liabilities = -sum([...s.ledger].filter(([id]) => termOf(id) === 'liabilities').map(([, v]) => v));
        const capital = -(s.ledger.get('capital') ?? 0);
        if (s.askLiabilities) {
          const owed = [...s.ledger].filter(([id, v]) => termOf(id) === 'liabilities' && v !== 0);
          const pay = s.all.find((t) => t.key === 'paySupplier')!;
          return numeric({
            prompt: `What are the total liabilities to outsiders (all that the shop owes, not counting capital) on ${monthEnd(s.b)}?`,
            answer: liabilities,
            commonErrors: present<Slip>(
              { value: liabilities + pay.lines[0].amount, why: 'Took the whole credit purchase as still owed; part of it has been settled.' },
              pay.lines.length > 2 && { value: liabilities + pay.lines[2].amount, why: 'Reduced the debt by the cheque only; the discount received reduces it too.' },
              { value: liabilities + capital, why: 'Added the capital; the question asks only for what is owed to outsiders.' },
              s.all.some((t) => t.key === 'loan') && { value: liabilities - s.all.find((t) => t.key === 'loan')!.lines[0].amount, why: 'Left out the loan, treating it as capital; borrowed money is a liability.' },
            ),
            explanation: [`Liabilities: ${owed.map(([id, v]) => `${resolveAccount(id).name} ${F(-v)}`).join(' + ')} = ${F(liabilities)}.`],
          });
        }
        const profit = s.sale.lines[0].amount - (s.sale.eq.find((l) => l.accountId === 'stock')?.amount ?? 0);
        const losses = s.all.filter((t) => t.key.startsWith('expense') || t.key === 'drawings').map((t) => t.lines[0].amount);
        const gains = s.all.filter((t) => t.key === 'paySupplier' && t.lines.length > 2).map((t) => t.lines[2].amount);
        const introduced = s.all[0].lines.at(-1)!.amount;
        return numeric({
          prompt: `What is ${poss(s.b.owner)} capital on ${monthEnd(s.b)}, as the accounting equation shows it?`,
          answer: capital,
          commonErrors: present<Slip>(
            { value: introduced, why: 'Gave the capital brought in on the 1st; profit, expenses and drawings have changed it since.' },
            { value: capital + s.sale.eq.find((l) => l.accountId === 'stock')!.amount, why: 'Added the whole selling price of the goods sold; only the profit on them increases capital.' },
            losses.length > 0 && { value: capital + sum(losses), why: 'Left out the expense and the drawings; both reduce capital.' },
            s.all.some((t) => t.key === 'loan') && { value: capital + s.all.find((t) => t.key === 'loan')!.lines[0].amount, why: 'Added the loan to capital; a loan is owed to an outsider, a liability.' },
          ),
          explanation: [
            `Capital brought in: ${F(introduced)}. Profit on the sale: ${F(s.sale.lines[0].amount)} - ${F(s.sale.lines[0].amount - profit)} = ${F(profit)}.${gains.length ? ` Discount received: ${F(gains[0])}.` : ''}`,
            losses.length ? `Less the expense and drawings: ${losses.map(F).join(' + ')} = ${F(sum(losses))}.` : 'Nothing has reduced capital.',
            `Capital = ${F(introduced)} + ${F(profit)}${gains.length ? ` + ${F(gains[0])}` : ''}${losses.length ? ` - ${F(sum(losses))}` : ''} = ${F(capital)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const e = readEquation(q.context ?? '');
        return !!e && q.answer === (q.prompt.includes('liabilities') ? e.liabilities : e.capital);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const assets = sum([...s.ledger].filter(([id]) => termOf(id) === 'assets').map(([, v]) => v));
        const stock = s.ledger.get('stock') ?? 0;
        const profit = -(s.sale.eq.find((l) => l.accountId === 'capital')?.amount ?? 0) * -1;
        const rows = [...s.ledger].filter(([id, v]) => termOf(id) === 'assets' && v !== 0);
        return numeric({
          prompt: `What are the total assets of the shop on ${monthEnd(s.b)}?`,
          answer: assets,
          commonErrors: present<Slip>(
            { value: assets - stock, why: 'Left out the goods still unsold; stock in hand is an asset.' },
            { value: assets - profit, why: 'Reduced the stock by the selling price of the goods sold; stock goes out at its cost.' },
            { value: -(s.ledger.get('capital') ?? 0), why: 'Gave the capital; the assets equal the capital and the liabilities together.' },
          ),
          explanation: [
            `Assets: ${rows.map(([id, v]) => `${id === 'stock' ? 'Stock (goods unsold, at cost)' : resolveAccount(id).name} ${F(v)}`).join(' + ')} = ${F(assets)}.`,
            'Check: they equal the liabilities and the capital together, the two sides of the equation.',
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const e = readEquation(q.context ?? '');
        return !!e && q.answer === e.assets;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const t = THEORY[s.theory];
        return choice({ prompt: t.prompt, correct: t.correct, distractors: t.distractors, explanation: t.explanation });
      },
    },
  ],
});

// ===============================================================================================================
// Case 4. A customer's cheque that came back: the cash book, the pass book and the customer's account (medium)
// ===============================================================================================================

interface Dishonour {
  b: Business;
  given: Given[];
  all: Dated[];
  /** The cheque that was dishonoured, and the customer who gave it. */
  bad: Dated;
  who: string;
  items: { text: string; up: boolean; amount: Paise; lines: JournalLine[] }[];
  outCheque: { who: string; date: string; amount: Paise } | null;
  bankEnd: Paise;
  text: string;
}

const dishonourCase = caseTemplate<Dishonour>({
  id: 'case-books-dishonoured-cheque',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: "A customer's cheque that came back",
  setup: (rng) => {
    const b = business(rng);
    const [who, other] = rng.shuffle(CUSTOMERS);
    const [supplier] = rng.shuffle(SUPPLIERS);
    const owed = amount(rng, 20000, 50000, 1000);
    const owed2 = amount(rng, 15000, 40000, 1000);
    const owing = amount(rng, 30000, 70000, 1000);
    const given: Given[] = [
      { label: 'Cash', accountId: 'cash', side: 'Dr', amount: amount(rng, 10000, 30000, 1000) },
      { label: 'Bank', accountId: 'bank', side: 'Dr', amount: amount(rng, 50000, 120000, 5000) },
      { label: 'Stock', accountId: 'stock', side: 'Dr', amount: amount(rng, 40000, 100000, 5000) },
      givenParty(debtor(who), owed),
      givenParty(debtor(other), owed2),
      givenParty(creditor(supplier), owing),
    ];
    const opening = openingStep(given);
    if (!opening) return null;
    const sale = amount(rng, 15000, 40000, 1000);
    const bad = amount(rng, 10000, (owed + sale) / 100 - 5000, 1000);
    const good = partOf(rng, owed2);
    const paid = partOf(rng, owing);
    if (good <= 0 || paid <= 0 || new Set([bad, good, paid, sale]).size < 4) return null;
    const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
    const steps = order(
      rng,
      [opening],
      [[cs.creditSale(who, sale), cs.receive(who, bad, 0)], [cs.receive(other, good, 0)], [cs.paySupplier(supplier, paid, 0)], [cs.goodsSold('cash', amount(rng, 8000, 25000, 1000))], [cs.expense(e, 'bank', pickAmount(rng, e))]],
      { cash: 0, bank: 0 },
      given[2].amount,
    );
    if (!steps) return null;
    const days = daysBetween(rng, steps.length - 1, 2, 26);
    const all: Dated[] = steps.slice(1).map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    const badTx = all.find((t) => t.key === 'receiveFromCustomer' && t.lines.some((l) => l.accountId === debtor(who)))!;
    const charges = amount(rng, 100, 500, 50);
    const items = [
      { text: `The cheque received from ${who} on ${badTx.date} was returned unpaid by the bank.`, up: false, amount: bad, lines: [dr(debtor(who), bad), cr('bank', bad)] },
      { text: `The bank debited ${F(charges)} as bank charges.`, up: false, amount: charges, lines: [dr('bankCharges', charges), cr('bank', charges)] },
    ];
    // In some months a cheque paid to the supplier had not yet been presented.
    const payTx = all.find((t) => t.key === 'paySupplier')!;
    const dayOf = (t: Dated) => Number(t.date.split(' ')[0]);
    const outCheque = rng.pick([true, false]) && dayOf(payTx) > dayOf(badTx) ? { who: supplier, date: payTx.date, amount: paid } : null;
    const bankEnd = given[1].amount + sum(all.map((t) => net(t.lines.filter((l) => l.accountId === 'bank'))));
    const last = monthEnd(b);
    const text = [
      `${b.owner} runs ${b.shop} and keeps a cash book with cash and bank columns. Cheques received are banked the same day.`,
      `Balances on 1 ${b.month} ${yearOf(b)} (capital is the balancing figure):`,
      ...given.map(givenLine),
      `Transactions of ${b.month}:`,
      ...all.map((t) => `${t.date}: ${t.text}`),
      `On ${last} the bank column was compared with the pass book:`,
      ...(outCheque ? [`• The cheque paid to ${outCheque.who} on ${outCheque.date} had not been presented for payment.`] : []),
      ...items.map((i) => `• ${i.text}`),
      'Neither of the last two items is in the cash book yet; nothing else keeps the two books apart.',
    ].join('\n');
    return { b, given, all, bad: badTx, who, items, outCheque, bankEnd, text };
  },
  context: (s) => s.text,
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ins = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'bank' && l.side === 'Dr').map((l) => l.amount));
        const outs = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'bank' && l.side === 'Cr').map((l) => l.amount));
        const open = s.given[1].amount;
        return numeric({
          prompt: `What is the balance of the bank column of the cash book on ${monthEnd(s.b)}, before the bank items are entered?`,
          answer: s.bankEnd,
          commonErrors: present<Slip>(
            { value: s.bankEnd - s.items[0].amount, why: 'Took the dishonoured cheque out already; the cash book does not show the dishonour yet.' },
            { value: s.bankEnd - s.items[0].amount - s.items[1].amount, why: 'Entered the items of the pass book; the question asks for the cash book before they are entered.' },
            { value: s.bankEnd - open, why: 'Left out the opening balance of the bank.' },
          ),
          explanation: [
            `Debit side: opening balance ${F(open)} + cheques received ${ins.map(F).join(' + ')} = ${F(open + sum(ins))}.`,
            `Credit side: ${outs.map(F).join(' + ')} = ${F(sum(outs))}.`,
            `Balance = ${F(open + sum(ins))} - ${F(sum(outs))} = ${F(s.bankEnd)}, a favourable balance.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const m = readCashMoves(q.context ?? '');
        return !!m && q.answer === m.bank0 + sum(m.moves.map((x) => x.bank));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const pass = s.bankEnd + (s.outCheque?.amount ?? 0) - s.items[0].amount - s.items[1].amount;
        return numeric({
          prompt: `What is the balance as per pass book on ${monthEnd(s.b)}?`,
          answer: pass,
          commonErrors: present<Slip>(
            { value: pass + 2 * s.items[0].amount, why: 'Added the dishonoured cheque; the bank took it back out of the account, so the pass book balance is lower.' },
            { value: pass + s.items[0].amount, why: 'Left out the dishonoured cheque; the bank has taken it back.' },
            s.outCheque && { value: pass - 2 * s.outCheque.amount, why: 'Deducted the cheque not yet presented; the bank has not paid it, so the pass book balance is higher.' },
            { value: s.bankEnd, why: 'Gave the cash book balance; the pass book differs by the items listed.' },
          ),
          explanation: [
            `Balance as per cash book: ${F(s.bankEnd)}.`,
            ...(s.outCheque ? [`Add the cheque to ${s.outCheque.who}, not yet presented: ${F(s.outCheque.amount)}.`] : []),
            `Less the cheque returned unpaid, ${F(s.items[0].amount)}, and the bank charges, ${F(s.items[1].amount)}.`,
            `Balance as per pass book = ${F(s.bankEnd)}${s.outCheque ? ` + ${F(s.outCheque.amount)}` : ''} - ${F(s.items[0].amount)} - ${F(s.items[1].amount)} = ${F(pass)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const m = readCashMoves(q.context ?? '');
        const c = readComparison(q.context ?? '');
        if (!m || !c) return false;
        const start = m.bank0 + sum(m.moves.map((x) => x.bank));
        const pass = start + sum(c.cheques.map((x) => (x.issued ? x.amount : -x.amount))) + sum(c.items.map((i) => net(i.lines.filter((l) => l.accountId === 'bank'))));
        return q.answer === pass;
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `Pass the entry the business makes for the cheque from ${s.who} that the bank returned unpaid.`,
        lines: s.items[0].lines,
        explanation: [
          `When the cheque was banked, Bank A/c was debited and ${poss(s.who)} account credited. The bank has taken the money back, so that entry is reversed.`,
          `${s.who} owes the amount again, so ${poss(s.who)} account is debited.`,
          'The bank balance falls, so Bank A/c is credited.',
        ],
        distractorAccounts: ['badDebts', 'sales', 'bankCharges'],
      }),
      verify: (q: JournalQuestion) => {
        const c = readComparison(q.context ?? '');
        const item = c?.items.find((i) => i.text.startsWith('The cheque received from'));
        return !!item && linesKey(item.lines) === linesKey(q.expected);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const id = debtor(s.who);
        const before = (s.given.find((g) => g.accountId === id)?.amount ?? 0) + sum(s.all.map((t) => net(t.lines.filter((l) => l.accountId === id))));
        const answer = before + s.items[0].amount;
        return numeric({
          prompt: `Once the dishonour is entered, what is the balance of ${poss(s.who)} account on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: present<Slip>(
            before > 0 && { value: before, why: 'Left the dishonour out; the cheque was not paid, so the customer owes the amount again.' },
            { value: Math.abs(before - s.items[0].amount), why: 'Credited the customer with the dishonoured cheque a second time; the dishonour is debited to the customer.' },
            { value: answer + s.items[1].amount, why: 'Charged the bank charges to the customer as well; the case does not pass them on.' },
          ),
          explanation: [
            `Before the dishonour: opening balance and the credit sale, less the cheque received, leave ${F(before)} (debit).`,
            `The dishonour is debited: ${F(before)} + ${F(s.items[0].amount)} = ${F(answer)} (debit).`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const c = readComparison(q.context ?? '');
        const item = c?.items.find((i) => i.text.startsWith('The cheque received from'));
        if (!read || !item) return false;
        const id = item.lines[0].accountId;
        return balanceOf(post([...read.entries.map((e) => e.lines), item.lines]), id)?.amount === q.answer;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const x = s.items[0].amount;
        return choice({
          prompt: `Suppose the entry for the dishonoured cheque was posted to the credit side of ${poss(s.who)} account, Bank A/c being posted rightly. What would that do to the trial balance?`,
          correct: `The credit total would be larger than the debit total by ${F(2 * x)}`,
          distractors: [
            { text: `The credit total would be larger than the debit total by ${F(x)}`, why: 'Counted the posting on the wrong side once; it is missing from the debit side and added to the credit side, twice the amount in all.' },
            { text: `The debit total would be larger than the credit total by ${F(2 * x)}`, why: `Got the side wrong: both Bank A/c and ${poss(s.who)} account would then be credited.` },
            { text: 'Nothing: an entry that balances cannot upset the trial balance', why: 'The entry balances, but one of its postings went to the wrong side, so the ledger no longer does.' },
          ],
          explanation: `Bank A/c would be credited with ${F(x)} and ${poss(s.who)} account credited with ${F(x)} as well, where it should have been debited. The credit total is then larger by ${F(x)} + ${F(x)} = ${F(2 * x)}; the difference would go to Suspense A/c on the debit side.`,
        });
      },
      verify: (q: McqQuestion) => {
        const c = readComparison(q.context ?? '');
        const item = c?.items.find((i) => i.text.startsWith('The cheque received from'));
        return !!item && correctText(q) === `The credit total would be larger than the debit total by ${F(2 * item.lines[0].amount)}`;
      },
    },
  ],
});

// ===============================================================================================================
// Case 5. Petty cash on the imprest system, posted to the ledger with an error (medium)
// ===============================================================================================================

/** What the petty cashier pays for, under three heads that have ledger accounts of their own. */
const PETTY_ITEMS: { what: string; id: 'postage' | 'stationery' | 'repairs' }[] = [
  { what: 'postage stamps', id: 'postage' },
  { what: 'speed post charges', id: 'postage' },
  { what: 'a registered letter', id: 'postage' },
  { what: 'pens and file covers', id: 'stationery' },
  { what: 'printer paper', id: 'stationery' },
  { what: 'a stapler and pins', id: 'stationery' },
  { what: 'the repair of a chair', id: 'repairs' },
  { what: 'the repair of a door lock', id: 'repairs' },
  { what: 'mending a display shelf', id: 'repairs' },
];
const PETTY_WHAT: Record<string, string> = Object.fromEntries(PETTY_ITEMS.map((i) => [i.what, i.id]));
const HEAD_NAME: Record<string, string> = { postage: 'Postage', stationery: 'Stationery', repairs: 'Repairs' };

interface Petty {
  b: Business;
  imprest: Paise;
  spends: (Dated & { head: string })[];
  /** The head whose ledger account is asked about, its balance before the week, and a payment by cheque under it. */
  head: string;
  before: Paise;
  byCheque: Dated;
  /** The head whose total was not posted. */
  missed: string;
  fault: Fault;
}

const pettyCase = caseTemplate<Petty>({
  id: 'case-books-petty-cash-ledger',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Petty cash on the imprest system, posted to the ledger',
  setup: (rng) => {
    const b = business(rng);
    const imprest = rupees(rng.pick([2500, 3000, 4000]));
    const first = rng.pick([1, 8, 15]);
    // Six or seven payments, every head at least twice, none of the same amount.
    const picks = [...['postage', 'stationery', 'repairs'].flatMap((id) => rng.shuffle(PETTY_ITEMS.filter((i) => i.id === id)).slice(0, 2)), ...(rng.pick([true, false]) ? [rng.pick(PETTY_ITEMS)] : [])];
    const items = rng.shuffle(picks).filter((x, i, xs) => xs.findIndex((y) => y.what === x.what) === i);
    // Different amounts from ₹40 to ₹360, drawn without repeats rather than rejected when two coincide.
    const amounts = rng.shuffle(Array.from({ length: 33 }, (_, i) => rupees(40 + 10 * i))).slice(0, items.length);
    if (sum(amounts) > imprest - rupees(200)) return null;
    const days = items.map((_, i) => first + Math.min(5, Math.floor((i * 6) / items.length)));
    const spends = items.map((it, i) => ({
      key: `petty:${it.id}`,
      text: `Paid ${F(amounts[i])} for ${it.what} out of petty cash.`,
      brief: `Petty cash paid for ${it.what}`,
      lines: [dr(it.id, amounts[i]), cr('pettyCash', amounts[i])],
      steps: [],
      distract: [],
      date: `${days[i]} ${b.month}`,
      head: it.id,
    }));
    const head = rng.pick(['postage', 'stationery', 'repairs'] as const);
    const before = amount(rng, 1500, 6000, 100);
    const chequeAmount = amount(rng, 500, 2500, 100);
    const chequeText = { postage: `Paid ${F(chequeAmount)} for postage by cheque.`, stationery: `Bought stationery for the office ${F(chequeAmount)}, paid by cheque.`, repairs: `Paid ${F(chequeAmount)} for repairs to the shop by cheque.` }[head];
    const byCheque: Dated = { key: 'byCheque', text: chequeText, brief: 'Paid by cheque from the main cash book', lines: [dr(head, chequeAmount), cr('bank', chequeAmount)], steps: [], distract: [], date: `${first + 2} ${b.month}` };
    const missed = rng.pick(['postage', 'stationery', 'repairs'].filter((h) => h !== head));
    const missedTotal = sum(spends.filter((x) => x.head === missed).map((x) => x.lines[0].amount));
    const f: Fault = {
      text: `The total of the ${HEAD_NAME[missed]} column of the petty cash book was not posted to ${HEAD_NAME[missed]} A/c.`,
      kind: 'omission',
      group: 'notPosted',
      x: missedTotal,
      done: [cr('pettyCash', missedTotal)],
      should: [dr(missed, missedTotal), cr('pettyCash', missedTotal)],
      recorded: `Petty Cash A/c was credited with the total of the book, ${HEAD_NAME[missed]} column included, but ${HEAD_NAME[missed]} A/c was not debited with ${F(missedTotal)}.`,
      correct: null,
    };
    return { b, imprest, spends, head, before, byCheque, missed, fault: f };
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.shop} and keeps a petty cash book with analysis columns for postage, stationery and repairs, on the imprest system. The imprest is ${F(s.imprest)}, and it is made up by cheque at the end of each week.`,
      `At the end of the week the total of each column is debited to its own account (Postage A/c, Stationery A/c, Repairs A/c), and Petty Cash A/c is credited with the total paid.`,
      `On ${s.spends[0].date} ${HEAD_NAME[s.head]} A/c had a debit balance of ${F(s.before)}.`,
      ...[...s.spends, s.byCheque].sort((x, y) => Number(x.date.split(' ')[0]) - Number(y.date.split(' ')[0])).map((t) => `${t.date}: ${t.text}`),
      `When the week's petty cash book was posted, this error was made: (a) ${s.fault.text}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const spent = sum(s.spends.map((x) => x.lines[0].amount));
        return numeric({
          prompt: 'How much does the head cashier hand over at the end of the week to make up the imprest?',
          answer: spent,
          commonErrors: present<Slip>(
            { value: s.imprest, why: 'Handed over the whole imprest again; only what was spent is made up.' },
            { value: s.imprest - spent, why: 'Gave the cash left in hand; the cheque makes up what was spent.' },
            { value: spent + s.byCheque.lines[0].amount, why: 'Counted the payment made by cheque from the main cash book; it did not come out of petty cash.' },
          ),
          explanation: [`Spent out of petty cash: ${s.spends.map((x) => F(x.lines[0].amount)).join(' + ')} = ${F(spent)}.`, `Under the imprest system the cheque makes up exactly what was spent: ${F(spent)}, which brings petty cash back to ${F(s.imprest)}.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && q.answer === sum(read.entries.flatMap((e) => e.lines.filter((l) => l.accountId === 'pettyCash').map((l) => l.amount)));
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const spent = sum(s.spends.map((x) => x.lines[0].amount));
        return {
          prompt: 'Pass the entry for the cheque that makes up the imprest at the end of the week.',
          lines: [dr('pettyCash', spent), cr('bank', spent)],
          explanation: ['The petty cashier receives money, so Petty Cash A/c is debited.', 'It is paid by cheque, so Bank A/c is credited.', `The amount is what was spent in the week, ${F(spent)}.`],
          distractorAccounts: ['postage', 'stationery', 'repairs', 'cash'],
        };
      },
      verify: (q: JournalQuestion) => {
        const read = readBooks(q.context ?? '');
        const spent = read ? sum(read.entries.flatMap((e) => e.lines.filter((l) => l.accountId === 'pettyCash').map((l) => l.amount))) : 0;
        return spent > 0 && linesKey(q.expected) === linesKey([dr('pettyCash', spent), cr('bank', spent)]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const column = sum(s.spends.filter((x) => x.head === s.head).map((x) => x.lines[0].amount));
        const cheque = s.byCheque.lines[0].amount;
        const answer = s.before + column + cheque;
        return numeric({
          prompt: `What is the balance of ${HEAD_NAME[s.head]} A/c at the end of the week?`,
          answer,
          commonErrors: present<Slip>(
            { value: s.before + column, why: 'Left out the payment by cheque; it is posted to the same account from the main cash book.' },
            { value: s.before + cheque, why: `Left out the total of the ${HEAD_NAME[s.head]} column of the petty cash book.` },
            { value: column + cheque, why: 'Left out the balance the account had at the start of the week.' },
          ),
          explanation: [
            `${HEAD_NAME[s.head]} column of the petty cash book: ${s.spends.filter((x) => x.head === s.head).map((x) => F(x.lines[0].amount)).join(' + ')} = ${F(column)}.`,
            `Balance = ${F(s.before)} + ${F(column)} + ${F(cheque)} = ${F(answer)} (debit).`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const name = /balance of (.+) A\/c at the end/.exec(q.prompt)?.[1];
        const id = Object.keys(HEAD_NAME).find((k) => HEAD_NAME[k] === name);
        const before = new RegExp(`${name} A/c had a debit balance of (₹[\\d,]+)`).exec(q.context ?? '')?.[1];
        if (!read || !id || !before) return false;
        return q.answer === toPaise(before) + net(read.entries.flatMap((e) => e.lines.filter((l) => l.accountId === id)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const x = s.fault.x;
        return numeric({
          prompt: 'Taken alone, by how much does error (a) make the two columns of the trial balance differ?',
          answer: x,
          commonErrors: [
            { value: 2 * x, why: 'Doubled it, as for a posting on the wrong side; here one posting is simply missing.' },
            { value: sum(s.spends.map((y) => y.lines[0].amount)), why: 'Took the whole total of the petty cash book; only the column that was not posted is missing.' },
          ],
          explanation: [`Petty Cash A/c was credited with the whole total, but ${HEAD_NAME[s.missed]} A/c missed its debit of ${F(x)}.`, `So the credit total is larger by ${F(x)}.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const name = /\(a\) The total of the (.+) column/.exec(q.context ?? '')?.[1];
        const id = Object.keys(HEAD_NAME).find((k) => HEAD_NAME[k] === name);
        return !!read && !!id && q.answer === net(read.entries.flatMap((e) => e.lines.filter((l) => l.accountId === id && e.lines.some((o) => o.accountId === 'pettyCash'))));
      },
    },
    { kind: 'journal', make: (s): JournalParts => entryParts(s.fault, 0, 'The difference in the trial balance was put to a Suspense A/c: '), verify: (q: JournalQuestion) => {
      const name = /\(a\) The total of the (.+) column/.exec(q.context ?? '')?.[1];
      const id = Object.keys(HEAD_NAME).find((k) => HEAD_NAME[k] === name);
      const read = readBooks(q.context ?? '');
      if (!id || !read) return false;
      const x = net(read.entries.flatMap((e) => e.lines.filter((l) => l.accountId === id && e.lines.some((o) => o.accountId === 'pettyCash'))));
      return rectifies(q.expected, { done: [cr('pettyCash', x)], should: [dr(id, x), cr('pettyCash', x)] });
    } },
  ],
});

// ===============================================================================================================
// Case 6. Opening balances, a week of business and the pass book at its end (medium)
// ===============================================================================================================

interface OpeningWeek {
  b: Business;
  given: Given[];
  capital: Paise;
  all: Dated[];
  focus: Dated;
  cheques: { issued: boolean; who: string; amount: Paise; date: string; out: boolean }[];
  items: BankItem[];
  bankEnd: Paise;
  text: string;
}

const openingWeek = caseTemplate<OpeningWeek>({
  id: 'case-books-opening-week-bank',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Opening balances, a week of business and the pass book',
  setup: (rng) => {
    const b = business(rng);
    const [d1, d2] = rng.shuffle(CUSTOMERS);
    const [c1] = rng.shuffle(SUPPLIERS);
    const asset = rng.pick(ASSETS);
    const loan = rng.pick([0, amount(rng, 40000, 100000, 10000)]);
    const given: Given[] = [
      { label: 'Cash', accountId: 'cash', side: 'Dr', amount: amount(rng, 8000, 25000, 1000) },
      { label: 'Bank', accountId: 'bank', side: 'Dr', amount: amount(rng, 60000, 150000, 5000) },
      { label: 'Stock', accountId: 'stock', side: 'Dr', amount: amount(rng, 40000, 120000, 5000) },
      givenParty(debtor(d1), amount(rng, 20000, 50000, 1000)),
      givenParty(debtor(d2), amount(rng, 10000, 30000, 1000)),
      { label: accountLabel(asset.id).replace(' A/c', ''), accountId: asset.id, side: 'Dr', amount: pickAmount(rng, asset) },
      givenParty(creditor(c1), amount(rng, 25000, 60000, 1000)),
      ...(loan ? [{ label: 'Bank Loan', accountId: 'bankLoan', side: 'Cr' as Side, amount: loan }] : []),
    ];
    const opening = openingStep(given);
    if (!opening) return null;
    const capital = opening.lines.at(-1)!.amount;
    // The week: cheques from both customers, one to the supplier, cash dealings and an expense.
    const got = [partOf(rng, given[3].amount), partOf(rng, given[4].amount)];
    const paid = partOf(rng, given[6].amount);
    if (got.some((x) => x <= 0) || paid <= 0 || new Set([...got, paid]).size < 3) return null;
    const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
    const steps = order(
      rng,
      [opening],
      [[cs.receive(d1, got[0], 0)], [cs.receive(d2, got[1], 0)], [cs.paySupplier(c1, paid, 0)], [cs.goodsSold('cash', amount(rng, 5000, 20000, 1000))], [cs.expense(e, rng.pick(['cash', 'bank'] as const), pickAmount(rng, e))], [rng.pick([cs.office(amount(rng, 5000, 10000, 1000)), more.deposit(amount(rng, 3000, 8000, 1000))])]],
      { cash: 0, bank: 0 },
      given[2].amount,
    );
    if (!steps) return null;
    const first = rng.pick([1, 8, 15]);
    const all: Dated[] = steps.slice(1).map((s, i) => ({ ...s, date: `${first + 1 + i} ${b.month}` }));
    const party = (t: Dated) => partyLine(t)!;
    const cheques = all
      .filter((t) => t.key === 'paySupplier' || t.key === 'receiveFromCustomer')
      .map((t) => ({ issued: t.key === 'paySupplier', who: resolveAccount(party(t).accountId).name, amount: party(t).amount, date: t.date, out: false }));
    // One cheque the bank had not dealt with by the end of the week: the last cheque received, or the cheque paid.
    rng.pick([cheques.filter((x) => !x.issued).at(-1)!, cheques.find((x) => x.issued)!]).out = true;
    const items = rng.shuffle([bankItem.charges(amount(rng, 100, 800, 50)), bankItem.interest(amount(rng, 200, 1500, 50)), bankItem.standing(amount(rng, 1000, 4000, 100))]).slice(0, 2);
    const bankEnd = given[1].amount + sum(all.map((t) => net(t.lines.filter((l) => l.accountId === 'bank'))));
    const focus = rng.pick(all.filter((t) => t.key !== 'saleCash'));
    const end = `${first + 1 + all.length} ${b.month}`;
    const text = [
      `${b.owner} runs ${b.shop}. Cheques received are banked the same day.`,
      `Balances on ${first} ${b.month} ${yearOf(b)} (capital is the balancing figure):`,
      ...given.map(givenLine),
      ...all.map((t) => `${t.date}: ${t.text}`),
      `On ${end} the bank column of the cash book was compared with the pass book:`,
      ...cheques.filter((x) => x.out).map((x) => `• The cheque ${x.issued ? 'paid to' : 'received from'} ${x.who} on ${x.date} had not been ${x.issued ? 'presented for payment' : 'collected by the bank'}.`),
      ...items.map((i) => `• ${i.text}`),
      'Neither bank item is in the cash book yet; nothing else keeps the two books apart.',
    ].join('\n');
    return { b, given, capital, all, focus, cheques, items, bankEnd, text };
  },
  context: (s) => s.text,
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const assets = s.given.filter((g) => g.side === 'Dr').map((g) => g.amount);
        const liabilities = s.given.filter((g) => g.side === 'Cr').map((g) => g.amount);
        return numeric({
          prompt: `What is ${poss(s.b.owner)} capital at the start of the week?`,
          answer: s.capital,
          commonErrors: present<Slip>(
            { value: sum(assets), why: 'Took the total of the assets as the capital, without deducting what the business owes.' },
            { value: sum(assets) + sum(liabilities), why: 'Added the liabilities to the assets; capital is assets less liabilities.' },
            { value: s.capital - s.given[2].amount, why: 'Left the stock out of the assets; goods in hand belong to the business.' },
            liabilities.length > 1 && { value: s.capital + liabilities[1], why: 'Deducted the creditor but not the bank loan; a loan is a liability too.' },
          ),
          explanation: [
            addUp('Assets', assets),
            addUp('Liabilities', liabilities),
            `Capital = ${F(sum(assets))} - ${F(sum(liabilities))} = ${F(s.capital)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read?.opening && q.answer === read.opening.lines.find((l) => l.accountId === 'capital')?.amount;
      },
    },
    {
      kind: 'journal',
      make: (s) => ({ prompt: `Pass the journal entry for the transaction of ${s.focus.date}.`, lines: s.focus.lines, explanation: s.focus.steps, distractorAccounts: s.focus.distract }),
      verify: verifyDatedEntry,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ins = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'bank' && l.side === 'Dr').map((l) => l.amount));
        const outs = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'bank' && l.side === 'Cr').map((l) => l.amount));
        const open = s.given[1].amount;
        return numeric({
          prompt: 'What does the bank column of the cash book show at the end of the week, before the bank items are entered?',
          answer: s.bankEnd,
          commonErrors: present<Slip>(
            { value: s.bankEnd - open, why: 'Left out the balance at the bank at the start of the week.' },
            { value: s.bankEnd + sum(s.items.map((i) => (i.up ? i.amount : -i.amount))), why: 'Brought in the items the bank recorded; they are not in the cash book yet.' },
            ...s.cheques.filter((x) => x.out).map((x) => ({ value: s.bankEnd + (x.issued ? x.amount : -x.amount), why: `Left out the cheque ${x.issued ? `paid to ${x.who}` : `received from ${x.who}`} because the bank had not dealt with it; the cash book records it on the day.` })),
          ),
          explanation: [
            `Debit side of the bank column: ${[open, ...ins].map(F).join(' + ')} = ${F(open + sum(ins))}.`,
            `Credit side: ${outs.length ? `${outs.map(F).join(' + ')} = ${F(sum(outs))}` : 'nothing'}.`,
            `Balance = ${F(open + sum(ins))} - ${F(sum(outs))} = ${F(s.bankEnd)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const m = readCashMoves(q.context ?? '');
        return !!m && q.answer === m.bank0 + sum(m.moves.map((x) => x.bank));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const out = s.cheques.find((x) => x.out)!;
        const pass = s.bankEnd + (out.issued ? out.amount : -out.amount) + sum(s.items.map((i) => (i.up ? i.amount : -i.amount)));
        return numeric({
          prompt: 'What is the balance as per pass book at the end of the week?',
          answer: pass,
          commonErrors: present<Slip>(
            { value: s.bankEnd + (out.issued ? -out.amount : out.amount) + sum(s.items.map((i) => (i.up ? i.amount : -i.amount))), why: `Took the cheque ${out.issued ? 'not yet presented' : 'not yet collected'} the wrong way round.` },
            { value: s.bankEnd + sum(s.items.map((i) => (i.up ? i.amount : -i.amount))), why: 'Left out the cheque the bank had not yet dealt with.' },
            { value: s.bankEnd + (out.issued ? out.amount : -out.amount), why: 'Left out the items the bank recorded on its own.' },
            { value: s.bankEnd, why: 'Gave the cash book balance; the pass book differs by the items listed.' },
          ),
          explanation: [
            `Start from the cash book: ${F(s.bankEnd)}.`,
            out.issued ? `Add the cheque paid to ${out.who}, not yet presented: ${F(out.amount)}.` : `Deduct the cheque from ${out.who}, not yet collected: ${F(out.amount)}.`,
            ...s.items.map((i) => `${i.up ? 'Add' : 'Deduct'} ${i.label.charAt(0).toLowerCase()}${i.label.slice(1)}: ${F(i.amount)}.`),
            `Balance as per pass book = ${F(pass)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const m = readCashMoves(q.context ?? '');
        const c = readComparison(q.context ?? '');
        if (!m || !c) return false;
        const start = m.bank0 + sum(m.moves.map((x) => x.bank));
        return q.answer === start + sum(c.cheques.map((x) => (x.issued ? x.amount : -x.amount))) + sum(c.items.map((i) => net(i.lines.filter((l) => l.accountId === 'bank'))));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const out = s.cheques.find((x) => x.out)!;
        const outText = `The cheque ${out.issued ? 'paid to' : 'received from'} ${out.who}`;
        const [i1, i2] = s.items;
        return choice({
          prompt: 'Which of the items listed on the last day must still be entered in the cash book?',
          correct: `Only the two items the bank recorded on its own: ${i1.label.toLowerCase()} and ${i2.label.toLowerCase()}`,
          distractors: [
            { text: `${outText} as well as the two bank items`, why: 'The cash book already shows that cheque; the bank simply had not dealt with it yet, so it stays in the statement only.' },
            { text: `Only ${outText.charAt(0).toLowerCase()}${outText.slice(1)}`, why: 'That cheque is already in the cash book; it is the bank items that the cash book lacks.' },
            { text: 'None of them: a bank reconciliation statement makes every entry unnecessary', why: 'The statement explains a difference; what the bank did on its own still has to be entered in the books.' },
          ],
          explanation: `The cash book already records ${outText.charAt(0).toLowerCase()}${outText.slice(1)}; the difference there is only one of timing. ${cap(i1.label.toLowerCase())} and ${i2.label.toLowerCase()} are in the pass book alone, so the cash book needs an entry for each.`,
        });
      },
    },
  ],
});

// ===============================================================================================================
// Case 7. A month recorded against the principles: errors of principle and the business entity (complex)
// ===============================================================================================================

/** A transaction of this case: its draft, and the error a clerk who ignores the principles makes in it. */
interface Principled {
  step: Step;
  error: (t: Dated) => Fault;
  /** What the error is: a private expense charged to the business, capital charged as revenue, revenue as capital, or neither. */
  kind: 'entity' | 'capitalAsRevenue' | 'revenueAsCapital' | 'other';
}

const step = (key: string, text: string, brief: string, lines: JournalLine[], steps: string[], distract: string[]): Step => ({ key, text, brief, lines, steps, distract });

function principled(rng: Rng, b: Business, customer: string, other: string): Record<string, Principled> {
  const x = (lo: number, hi: number, s = 500) => amount(rng, lo, hi, s);
  const rent = x(6000, 15000);
  const life = x(4000, 12000);
  const goods = x(2000, 8000);
  const machine = x(40000, 90000, 5000);
  const install = x(2000, 6000);
  const repair = x(1500, 6000);
  const furniture = x(20000, 60000, 5000);
  const sale = x(15000, 40000, 1000);
  return {
    rent: {
      step: step('houseRent', `Paid the proprietor's house rent ${F(rent)} by cheque.`, "The proprietor's house rent paid by cheque", [dr('drawings', rent), cr('bank', rent)], ["The house is the proprietor's, not the shop's: the payment is drawings, so Drawings A/c is debited.", 'Bank A/c is credited.'], ['rent']),
      error: (t) => fault.instead(t, 'drawings', 'rent'),
      kind: 'entity',
    },
    life: {
      step: step('lifeInsurance', `Paid the premium on the proprietor's own life insurance policy, ${F(life)}, by cheque.`, "The proprietor's life insurance premium paid by cheque", [dr('drawings', life), cr('bank', life)], ["The policy is the proprietor's own: the premium is drawings, so Drawings A/c is debited.", 'Bank A/c is credited.'], ['insurance']),
      error: (t) => fault.instead(t, 'drawings', 'insurance'),
      kind: 'entity',
    },
    goods: {
      step: step('goodsTaken', `${b.owner} took goods costing ${F(goods)} from the shop for personal use.`, 'Goods taken by the proprietor for personal use', [dr('drawings', goods), cr('purchases', goods)], ['Goods taken for personal use are drawings, so Drawings A/c is debited at cost.', 'They are no longer goods of the business, so Purchases A/c is credited.'], ['sales', 'stock']),
      error: (t) => fault.leftOut(t),
      kind: 'other',
    },
    furniture: {
      step: cs.asset(ASSETS[0], 'bank', furniture),
      error: (t) => fault.instead(t, 'furniture', 'purchases'),
      kind: 'capitalAsRevenue',
    },
    machine: {
      step: step('machine', `Bought a packing machine for the shop ${F(machine)}, paid by cheque.`, 'A packing machine bought by cheque', [dr('machinery', machine), cr('bank', machine)], ['The machine is bought for use, not for resale: Machinery A/c is debited.', 'Bank A/c is credited.'], ['purchases']),
      error: () => {
        throw new Error('the machine itself is recorded rightly');
      },
      kind: 'other',
    },
    install: {
      step: step('install', `Paid ${F(install)} in cash as wages for installing the packing machine.`, 'Wages paid to install the packing machine', [dr('machinery', install), cr('cash', install)], ['Wages to install a machine are part of its cost, so Machinery A/c is debited, not Wages A/c.', 'Cash A/c is credited.'], ['wages']),
      error: (t) => fault.instead(t, 'machinery', 'wages'),
      kind: 'capitalAsRevenue',
    },
    repair: {
      step: step('repair', `Paid ${F(repair)} in cash for repairs to the shop furniture.`, 'Repairs to the shop furniture paid in cash', [dr('repairs', repair), cr('cash', repair)], ['Repairs keep an asset working: they are an expense, so Repairs A/c is debited.', 'Cash A/c is credited.'], ['furniture']),
      error: (t) => fault.instead(t, 'repairs', 'furniture'),
      kind: 'revenueAsCapital',
    },
    sale: {
      step: cs.creditSale(customer, sale),
      error: (t) => fault.instead(t, debtor(customer), debtor(other)),
      kind: 'other',
    },
  };
}

interface PrincipleCase {
  b: Business;
  all: Dated[];
  faults: Fault[];
  kinds: Principled['kind'][];
  shown: Paise;
}

const principleCase = caseTemplate<PrincipleCase>({
  id: 'case-books-principles-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Recorded against the principles',
  setup: (rng) => {
    const b = business(rng);
    const [customer, other] = rng.shuffle(CUSTOMERS);
    const p = principled(rng, b, customer, other);
    // A private expense charged to the business, an item of the wrong kind of expenditure, and a third error.
    const entity = rng.pick(['rent', 'life'] as const);
    const wrongKind = rng.pick(['furniture', 'install', 'repair'] as const);
    const third = rng.pick(['goods', 'sale'] as const);
    // A business already running: some transactions of one month of the year.
    const steps: Step[] = [
      cs.creditPurchase(rng.pick(SUPPLIERS), amount(rng, 60000, 120000, 5000)),
      ...rng.shuffle([p[entity].step, p[wrongKind].step, p[third].step, ...(wrongKind === 'install' ? [] : [p.machine.step]), cs.goodsSold('cash', amount(rng, 10000, 30000, 1000))]),
    ];
    // The machine is bought before it is installed.
    if (wrongKind === 'install') steps.splice(1, 0, p.machine.step);
    const days = daysBetween(rng, steps.length, 2, 28);
    const all: Dated[] = steps.map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    const of = (key: string) => all.find((t) => t.key === key)!;
    const picked = rng.shuffle([
      { f: p[entity].error(of(p[entity].step.key)), kind: p[entity].kind },
      { f: p[wrongKind].error(of(p[wrongKind].step.key)), kind: p[wrongKind].kind },
      { f: p[third].error(of(p[third].step.key)), kind: p[third].kind },
    ]);
    const faults = picked.map((x) => x.f);
    if (sum(faults.map(profitEffect)) === 0) return null;
    return { b, all, faults, kinds: picked.map((x) => x.kind), shown: amount(rng, 150000, 400000, 5000) };
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.shop}; the accounting year ends on 31 March. Goods taken by the proprietor are credited to Purchases A/c, at cost.`,
      `A clerk who did not know the accounting principles kept the books. Some transactions of ${s.b.month} ${yearOf(s.b)}:`,
      ...s.all.map((t) => `${t.date}: ${t.text}`),
      `The trial balance at the end of the year agreed, and the books showed a net profit of ${F(s.shown)} for the year. These errors were then found in the transactions above; there are no others:`,
      ...s.faults.map((e, i) => `${tag(i)} ${e.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const i = s.kinds.indexOf('entity');
        return choice({
          prompt: `Which accounting concept did the clerk ignore in error ${tag(i)}?`,
          correct: 'The business entity concept',
          distractors: [
            { text: 'The dual aspect concept', why: 'Both sides of the entry were recorded; what went wrong is that a private expense of the proprietor was treated as one of the business.' },
            { text: 'The matching concept', why: 'Matching sets the expenses of a period against its revenue; this payment was never an expense of the business at all.' },
            { text: 'The money measurement concept', why: 'The amount was measured in money correctly; the slip was in treating the owner and the business as one.' },
            { text: 'The going concern concept', why: 'Going concern is about the business carrying on; it does not separate the proprietor from it.' },
          ],
          explanation: `Under the business entity concept the business is separate from its proprietor. A payment of the proprietor's private expense by the business is drawings, not an expense of the shop; error ${tag(i)} charged it to an expense account.`,
        });
      },
    },
    {
      kind: 'journal',
      make: (s): JournalParts => {
        const i = s.kinds.findIndex((k) => k === 'capitalAsRevenue' || k === 'revenueAsCapital');
        return entryParts(s.faults[i], i, '', ' (the trial balance agreed, so there is no Suspense A/c)');
      },
      verify: verifyRectifying,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const i = s.kinds.findIndex((k) => k === 'capitalAsRevenue' || k === 'revenueAsCapital');
        const what = s.kinds[i] === 'capitalAsRevenue' ? 'a capital expenditure as a revenue expenditure' : 'a revenue expenditure as a capital expenditure';
        return choice({
          prompt: `Which of the errors recorded ${what}?`,
          correct: `Error ${tag(i)}`,
          distractors: [
            ...s.kinds.flatMap((k, j) =>
              j === i
                ? []
                : [
                    {
                      text: `Error ${tag(j)}`,
                      why: k === 'entity' ? `Error ${tag(j)} charged a private expense of the proprietor to the business; it is not a question of capital or revenue expenditure of the business.` : `Error ${tag(j)} ${s.faults[j].group === 'omitted' ? 'left a transaction out of the books' : 'put a customer\'s item in another customer\'s account'}; no expenditure changed its kind.`,
                    },
                  ],
            ),
            { text: 'None of them', why: `Missed error ${tag(i)}: ${s.kinds[i] === 'capitalAsRevenue' ? 'an asset of lasting use was charged to an expense account' : 'an expense was added to an asset account'}.` },
          ],
          explanation: s.kinds[i] === 'capitalAsRevenue'
            ? `In error ${tag(i)} an amount spent on an asset that will serve the business for years, capital expenditure, was charged to an expense account, as if it were revenue expenditure.`
            : `In error ${tag(i)} an amount spent to keep an asset working, revenue expenditure, was added to the asset account, as if it were capital expenditure.`,
        });
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const effects = s.faults.map(profitEffect);
        const answer = Math.abs(sum(effects));
        return numeric({
          prompt: 'Taking the three errors together, by what amount is the net profit shown by the books wrong? Give the amount only.',
          answer,
          commonErrors: present<Slip>(
            { value: sum(effects.map(Math.abs)), why: 'Added the effects without regard to direction; an error that overstates the profit partly cancels one that understates it.' },
            ...effects.map((e, i) => (e !== 0 && effects.filter((x) => x !== 0).length > 1 ? { value: Math.abs(e), why: `Took error ${tag(i)} alone.` } : null)).filter((x): x is Slip => x !== null),
            ...s.faults.map((f, i) => (effects[i] === 0 ? { value: answer + f.x, why: `Counted error ${tag(i)} as well; it changed no income or expense account.` } : null)).filter((x): x is Slip => x !== null),
          ),
          explanation: [
            ...s.faults.map((f, i) =>
              effects[i] === 0
                ? `${tag(i)} changes no income or expense account: no effect on profit.`
                : `${tag(i)} ${effects[i] > 0 ? 'overstates' : 'understates'} the profit by ${F(Math.abs(effects[i]))}.`,
            ),
            `Net: the profit is ${sum(effects) > 0 ? 'overstated' : 'understated'} by ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && q.answer === Math.abs(sum([...read.slips.values()].map(profitOfSlip)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const effect = sum(s.faults.map(profitEffect));
        const answer = s.shown - effect;
        return numeric({
          prompt: 'What is the correct net profit for the year?',
          answer,
          commonErrors: present<Slip>(
            { value: s.shown + effect, why: 'Applied the net effect the wrong way: an overstated profit has to be reduced, and an understated one increased.' },
            { value: s.shown, why: 'Left the profit as the books show it because the trial balance agreed; errors that leave the totals equal can still change the profit.' },
          ),
          explanation: [
            `Profit shown by the books: ${F(s.shown)}.`,
            effect > 0 ? `It is overstated by ${F(effect)}: ${F(s.shown)} - ${F(effect)} = ${F(answer)}.` : `It is understated by ${F(-effect)}: ${F(s.shown)} + ${F(-effect)} = ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const shown = /net profit of (₹[\d,]+)/.exec(q.context ?? '')?.[1];
        return !!read && !!shown && q.answer === toPaise(shown) - sum([...read.slips.values()].map(profitOfSlip));
      },
    },
  ],
});

/** Profit shown less correct profit, for an error as read: a credit to an income or expense account raises profit. */
const profitOfSlip = (s: { done: JournalLine[]; should: JournalLine[] }): number => {
  const pl = (ls: readonly JournalLine[]) => sum(ls.filter((l) => ['income', 'expense'].includes(resolveAccount(l.accountId).type)).map((l) => -signed(l)));
  return pl(s.done) - pl(s.should);
};

// ===============================================================================================================
// Case 8. A cash book with a bank column, cash discounts in the Journal Proper, posted with an error (complex)
// ===============================================================================================================
//
// Version 2. The first version kept a cash book with a discount column on each side, whose totals were posted to the
// two discount accounts; the course (CBSE 2025-26) has the simple cash book, the cash book with a bank column and the
// petty cash book only. Now the cash book takes the money alone, each cash discount is recorded in the Journal
// Proper (Discount Allowed A/c Dr, To the customer; the supplier Dr, To Discount Received A/c), and the error is one
// such discount posted wrongly.

/** Cash received from a customer, or paid to a supplier, with a cash discount. */
const discounted = {
  inCash: (who: string, x: Paise, d: Paise): Step => ({
    key: 'receiveFromCustomer',
    text: `Received ${F(x)} in cash from ${who} and allowed a discount of ${F(d)}.`,
    brief: `Cash received from ${who}, who was allowed a discount`,
    lines: [dr('cash', x), dr('discountAllowed', d), cr(debtor(who), x + d)],
    steps: ['Cash comes in: Cash A/c is debited.', 'The discount is a loss: Discount Allowed A/c is debited.', `${who} is cleared of ${F(x)} + ${F(d)} = ${F(x + d)}: ${poss(who)} account is credited.`],
    distract: ['discountReceived', 'sales'],
  }),
  outCash: (who: string, x: Paise, d: Paise): Step => ({
    key: 'paySupplier',
    text: `Paid ${who} ${F(x)} in cash and received a discount of ${F(d)}.`,
    brief: `Cash paid to ${who}, who allowed a discount`,
    lines: [dr(creditor(who), x + d), cr('cash', x), cr('discountReceived', d)],
    steps: [`${F(x)} + ${F(d)} = ${F(x + d)} of the debt is cleared: ${poss(who)} account is debited.`, 'Cash goes out: Cash A/c is credited.', 'The discount is a gain: Discount Received A/c is credited.'],
    distract: ['discountAllowed', 'purchases'],
  }),
};

interface ThreeColumn {
  b: Business;
  given: Given[];
  all: Dated[];
  fault: Fault;
  allowed: Paise[];
  received: Paise[];
  party: string;
}

const threeColumn = caseTemplate<ThreeColumn>({
  id: 'case-books-three-column-cash-book',
  version: 2,
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A cash book with a bank column, discounts in the Journal Proper, posted with an error',
  setup: (rng) => {
    const b = business(rng);
    const [d1, d2] = rng.shuffle(CUSTOMERS);
    const [c1, c2] = rng.shuffle(SUPPLIERS);
    const owed = [amount(rng, 20000, 50000, 1000), amount(rng, 15000, 40000, 1000)];
    const owing = [amount(rng, 25000, 60000, 1000), amount(rng, 15000, 40000, 1000)];
    const given: Given[] = [
      { label: 'Cash', accountId: 'cash', side: 'Dr', amount: amount(rng, 30000, 60000, 1000) },
      { label: 'Bank', accountId: 'bank', side: 'Dr', amount: amount(rng, 60000, 150000, 5000) },
      { label: 'Stock', accountId: 'stock', side: 'Dr', amount: amount(rng, 40000, 100000, 5000) },
      givenParty(debtor(d1), owed[0]),
      givenParty(debtor(d2), owed[1]),
      givenParty(creditor(c1), owing[0]),
      givenParty(creditor(c2), owing[1]),
    ];
    const opening = openingStep(given);
    if (!opening) return null;
    const disc = () => rupees(rng.pick([200, 300, 400, 500, 600, 750, 800, 1000, 1200]));
    const take = (due: Paise) => {
      const d = disc();
      const x = partOf(rng, due - d);
      return [x, d] as const;
    };
    const [r1, a1] = take(owed[0]);
    const [r2, a2] = take(owed[1]);
    const [p1, g1] = take(owing[0]);
    const [p2, g2] = take(owing[1]);
    if ([r1, r2, p1, p2].some((x) => x <= 0)) return null;
    // One customer pays in cash and the other by cheque; the same with the two suppliers.
    const cashFirst = rng.pick([true, false]);
    const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
    const steps = order(
      rng,
      [opening],
      [
        [cashFirst ? discounted.inCash(d1, r1, a1) : cs.receive(d1, r1, a1)],
        [cashFirst ? cs.receive(d2, r2, a2) : discounted.inCash(d2, r2, a2)],
        [rng.pick([true, false]) ? discounted.outCash(c1, p1, g1) : cs.paySupplier(c1, p1, g1)],
        [cs.paySupplier(c2, p2, g2)],
        [cs.goodsSold('cash', amount(rng, 8000, 25000, 1000))],
        [cs.expense(e, 'cash', pickAmount(rng, e))],
      ],
      { cash: 0, bank: 0 },
      given[2].amount,
    );
    if (!steps) return null;
    const days = daysBetween(rng, steps.length - 1, 2, 28);
    const all: Dated[] = steps.slice(1).map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    const allowed = all.flatMap((t) => t.lines.filter((l) => l.accountId === 'discountAllowed').map((l) => l.amount));
    const received = all.flatMap((t) => t.lines.filter((l) => l.accountId === 'discountReceived').map((l) => l.amount));
    // The error: the Journal Proper entry of one cash discount not posted to its discount account, or posted to the
    // wrong side of it. The cash book side of the settlement and the party's account were posted rightly.
    const id = rng.pick(['discountAllowed', 'discountReceived'] as const);
    const t = rng.pick(all.filter((x) => x.lines.some((l) => l.accountId === id)));
    const missing = rng.pick([true, false]);
    const made = missing ? fault.notPosted(t, id) : fault.wrongSide(t, id);
    const slip: Fault = {
      ...made,
      text: missing ? `The discount of ${t.date} was not posted to ${words(id)}.` : `The discount of ${t.date} was posted to the ${sideWord(flip(t.lines.find((l) => l.accountId === id)!.side))} side of ${words(id)}.`,
    };
    const party = rng.pick([debtor(d1), debtor(d2), creditor(c1), creditor(c2)]);
    return { b, given, all, fault: slip, allowed, received, party };
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.shop}. Its cash book has a cash column and a bank column, and no discount column: each cash discount is recorded in the Journal Proper (Discount Allowed A/c or Discount Received A/c against the party) and posted from there. Cheques received are banked the same day.`,
      `Balances on 1 ${s.b.month} ${yearOf(s.b)} (capital is the balancing figure):`,
      ...s.given.map(givenLine),
      `Transactions of ${s.b.month}:`,
      ...s.all.map((t) => `${t.date}: ${t.text}`),
      'When the cash book and the Journal Proper were posted at the end of the month, the trial balance did not agree, and the difference was put to a Suspense A/c. One error was then found:',
      `(a) ${s.fault.text}`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const answer = sum(s.allowed);
        return numeric({
          prompt: 'What is the total cash discount allowed to customers during the month, as recorded in the Journal Proper?',
          answer,
          commonErrors: present<Slip>(
            { value: sum(s.received), why: 'Added up the discounts received from suppliers; those are credited to Discount Received A/c.' },
            { value: answer + sum(s.received), why: 'Added both kinds of discount together; discount allowed and discount received go to two different accounts.' },
            { value: Math.max(...s.allowed), why: 'Took one discount alone; every discount allowed in the month is debited to Discount Allowed A/c.' },
          ),
          explanation: [addUp('Discounts allowed to customers, each debited to Discount Allowed A/c through the Journal Proper', s.allowed)],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && q.answer === sum(read.entries.flatMap((e) => e.lines.filter((l) => l.accountId === 'discountAllowed' && l.side === 'Dr').map((l) => l.amount)));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        // The customer who paid by cheque: the cash book takes the cheque alone, and the discount stays out of it.
        const t = s.all.find((x) => x.lines.some((l) => l.accountId === 'bank' && l.side === 'Dr') && x.lines.some((l) => l.accountId === 'discountAllowed'))!;
        const who = resolveAccount(t.lines.find((l) => l.accountId.startsWith('debtor:'))!.accountId).name;
        const answer = t.lines.find((l) => l.accountId === 'bank')!.amount;
        const d = t.lines.find((l) => l.accountId === 'discountAllowed')!.amount;
        return numeric({
          prompt: `How much is entered in the bank column of the cash book for the cheque received from ${who} on ${t.date}?`,
          answer,
          commonErrors: [
            { value: answer + d, why: `Entered all that ${who} was cleared of; the discount is not money received, so it stays out of the cash book.` },
            { value: d, why: 'Entered the discount; the cash book takes the money received.' },
            { value: answer - d, why: 'Took the discount off the cheque; the cheque is entered at the amount received.' },
          ],
          explanation: [
            `The discount of ${F(d)} allowed to ${who} is recorded in the Journal Proper (Discount Allowed A/c Dr; To ${who}), not in the cash book.`,
            `The cheque is banked the same day, so its amount goes in the bank column on the receipts side: ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const date = new RegExp(`on ${DAY}\\?$`).exec(q.prompt)?.[1];
        const entry = readBooks(q.context ?? '')?.entries.find((e) => e.date === date);
        const bank = entry?.lines.find((l) => l.accountId === 'bank' && l.side === 'Dr');
        return !!entry && !!bank && entry.lines.some((l) => l.accountId === 'discountAllowed') && q.answer === bank.amount;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const supplier = s.party.startsWith('creditor:');
        const who = resolveAccount(s.party).name;
        const open = s.given.find((g) => g.accountId === s.party)!.amount;
        const t = s.all.find((x) => x.lines.some((l) => l.accountId === s.party))!;
        const cleared = t.lines.find((l) => l.accountId === s.party)!.amount;
        const d = t.lines.find((l) => l.accountId === 'discountAllowed' || l.accountId === 'discountReceived')!.amount;
        const answer = open - cleared;
        return numeric({
          prompt: `What is the balance of ${poss(who)} account at the end of ${s.b.month}?`,
          answer,
          commonErrors: present<Slip>(
            { value: answer + d, why: `${supplier ? 'Debited' : 'Credited'} ${who} with the money alone; the discount also clears part of the debt.` },
            { value: open, why: 'Left the settlement out of the account.' },
            { value: answer + 2 * d, why: `Treated the discount as adding to the debt; it ${supplier ? 'reduces what is owed to the supplier' : 'reduces what the customer owes'}.` },
          ),
          explanation: [
            `Opening balance: ${F(open)} (${supplier ? 'credit' : 'debit'}).`,
            `${t.date}: the ${supplier ? 'payment' : 'receipt'} and the discount together clear ${F(cleared - d)} + ${F(d)} = ${F(cleared)}.`,
            `Balance = ${F(open)} - ${F(cleared)} = ${F(answer)} (${supplier ? 'credit' : 'debit'}).`,
          ],
        });
      },
      verify: verifyPartyBalance,
    },
    {
      kind: 'mcq',
      make: () =>
        choice({
          prompt: 'The cash book of this business has a cash column and a bank column only. How is a cash discount recorded?',
          correct: 'In the Journal Proper: Discount Allowed A/c Dr, To the customer; the supplier Dr, To Discount Received A/c',
          distractors: [
            { text: 'In a discount column on each side of the cash book, whose totals are posted at the end of the month', why: 'Described a cash book with discount columns, which this business does not keep: its cash book has cash and bank columns only.' },
            { text: 'In the Journal Proper: Discount Received A/c Dr, To the customer; the supplier Dr, To Discount Allowed A/c', why: 'Mixed up the two discounts: a discount given to a customer is a discount allowed, a loss; one given by a supplier is a discount received, a gain.' },
            { text: 'In the cash column of the cash book, together with the money received or paid', why: 'No cash moves for a discount; the cash book takes only the money actually received or paid.' },
            { text: 'Nowhere: a cash discount is not entered in the books', why: 'That is true of a trade discount; a cash discount is a loss or a gain and is recorded.' },
          ],
          explanation: 'The cash book takes only the money that is received or paid. The discount is recorded in the Journal Proper: a discount allowed to a customer is a loss (Discount Allowed A/c Dr; To the customer), and a discount received from a supplier is a gain (the supplier Dr; To Discount Received A/c). The cash book entry and the journal entry together clear the party\'s account.',
        }),
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const x = s.fault.x;
        const gap = Math.abs(tbNet(s.fault));
        const ofKind = s.fault.should.some((l) => l.accountId === 'discountAllowed') ? s.allowed : s.received;
        return numeric({
          prompt: 'By what amount did the two columns of the trial balance differ because of error (a)?',
          answer: gap,
          commonErrors: present<Slip>(
            gap === 2 * x && { value: x, why: ONCE_WHY },
            gap === x && { value: 2 * x, why: 'Doubled the discount, as for a posting on the wrong side; here the posting is simply missing.' },
            { value: sum(ofKind), why: 'Took every discount of that kind in the month; only the one discount named in the error was posted wrongly.' },
            { value: sum(s.allowed) + sum(s.received), why: 'Took all the discounts of the month; only the one discount named in the error was posted wrongly.' },
          ),
          explanation: [gapLine(s.fault, 0)],
        });
      },
      verify: (q: NumericQuestion) => {
        const gap = readGap(q);
        return gap !== null && gap !== 0 && q.answer === Math.abs(gap);
      },
    },
    { kind: 'journal', make: (s): JournalParts => entryParts(s.fault, 0), verify: verifyRectifying },
  ],
});

// ===============================================================================================================
// Case 9. Errors in the cash book: the amended balance, the pass book, and the rectifying entries (complex)
// ===============================================================================================================

const ROMAN = ['(i)', '(ii)', '(iii)', '(iv)', '(v)'];

interface CashBookErrors {
  b: Business;
  start: Paise;
  /** The cheque entered at a wrong figure, and posted to the party with it. */
  figure: { received: boolean; who: string; actual: Paise; shown: Paise };
  /** A side of the bank column added up wrongly. */
  cast: { receipts: boolean; over: boolean; x: Paise };
  unpresented: { who: string; x: Paise };
  charges: Paise;
  /** The order the four items are listed in: 'figure', 'cast', 'cheque', 'charges'. */
  order: ('figure' | 'cast' | 'cheque' | 'charges')[];
}

/** What a casting error does to the balance of the bank column: a receipts side too high, or a payments side too low, raises it. */
const castEffect = (c: { receipts: boolean; over: boolean; x: Paise }): Paise => (c.receipts === c.over ? c.x : -c.x);
/** What a cheque at a wrong figure does to the balance of the bank column. */
const figureEffect = (f: { received: boolean; actual: Paise; shown: Paise }): Paise => (f.received ? f.shown - f.actual : f.actual - f.shown);

function cashBookErrorLine(s: CashBookErrors, k: CashBookErrors['order'][number]): string {
  const { figure: f, cast: c } = s;
  if (k === 'figure')
    return f.received
      ? `A cheque for ${F(f.actual)} received from ${f.who}, a customer, was collected by the bank at that amount, but was entered in the cash book as ${F(f.shown)} and posted to ${poss(f.who)} account with that figure.`
      : `A cheque for ${F(f.actual)} issued to ${f.who}, a supplier, was paid by the bank at that amount, but was entered in the cash book as ${F(f.shown)} and posted to ${poss(f.who)} account with that figure.`;
  if (k === 'cast') return `The ${c.receipts ? 'receipts' : 'payments'} side of the bank column was ${c.over ? 'overcast' : 'undercast'} by ${F(c.x)}.`;
  if (k === 'cheque') return `A cheque for ${F(s.unpresented.x)} issued to ${s.unpresented.who} had not been presented for payment.`;
  return `The bank debited ${F(s.charges)} as bank charges.`;
}

/** The items of the case read back by their words: what each needs in the cash book, and what it does to the pass book. */
function readCashBookErrors(text: string): { start: Paise; amend: Map<string, Paise>; passOnly: Paise } | null {
  const start = /showed a favourable balance of (₹[\d,]+)/.exec(text)?.[1];
  if (!start) return null;
  const amend = new Map<string, Paise>();
  let passOnly = 0;
  for (const row of text.split('\n')) {
    const m = /^(\([iv]+\)) (.+)$/.exec(row);
    if (!m) continue;
    const [, label, body] = m;
    const fig = /^A cheque for (₹[\d,]+) (received from|issued to) .+, was (?:collected|paid) by the bank at that amount, but was entered in the cash book as (₹[\d,]+) and posted to .+ account with that figure\.$/.exec(body);
    const cast = /^The (receipts|payments) side of the bank column was (overcast|undercast) by (₹[\d,]+)\.$/.exec(body);
    const cheque = /^A cheque for (₹[\d,]+) issued to .+ had not been presented for payment\.$/.exec(body);
    const charges = /^The bank debited (₹[\d,]+) as bank charges\.$/.exec(body);
    // The correction each needs in the cash book, as a change in its balance.
    if (fig) amend.set(label, fig[2] === 'received from' ? toPaise(fig[1]) - toPaise(fig[3]) : toPaise(fig[3]) - toPaise(fig[1]));
    else if (cast) amend.set(label, (cast[1] === 'receipts') === (cast[2] === 'overcast') ? -toPaise(cast[3]) : toPaise(cast[3]));
    else if (cheque) passOnly += toPaise(cheque[1]);
    else if (charges) amend.set(label, -toPaise(charges[1]));
    else return null;
  }
  return { start: toPaise(start), amend, passOnly };
}

const cashBookErrors = caseTemplate<CashBookErrors>({
  id: 'case-books-cash-book-errors-bank',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Errors in the cash book, the pass book and the ledger',
  setup: (rng) => {
    const b = business(rng);
    const [cust] = rng.shuffle(CUSTOMERS);
    const [sup, other] = rng.shuffle(SUPPLIERS);
    const received = rng.pick([true, false]);
    // Two digits of the cheque written the other way round, or a nearby figure.
    const actual = amount(rng, 3000, 25000, 100);
    const shown = transposed(rng, actual) ?? actual + rupees(rng.pick([-900, 900, 1800]));
    if (shown === actual || shown <= 0) return null;
    const cast = { receipts: rng.pick([true, false]), over: rng.pick([true, false]), x: rupees(rng.pick([100, 500, 1000]) * rng.int(1, 9)) };
    const unpresented = { who: received ? sup : other, x: amount(rng, 4000, 20000, 500) };
    const charges = amount(rng, 100, 900, 50);
    const start = amount(rng, 40000, 150000, 500);
    if (new Set([Math.abs(actual - shown), cast.x, unpresented.x, charges]).size < 4) return null;
    return {
      b,
      start,
      figure: { received, who: received ? cust : sup, actual, shown },
      cast,
      unpresented,
      charges,
      order: rng.shuffle(['figure', 'cast', 'cheque', 'charges'] as const),
    };
  },
  context: (s) =>
    [
      `On ${monthEnd(s.b)} ${yearOf(s.b)} the bank column of the cash book of ${s.b.owner} showed a favourable balance of ${F(s.start)}.`,
      'The ledger had been posted from the cash book as it stood. The trial balance drawn up then did not agree, and the difference was put to a Suspense A/c.',
      'Comparing the cash book with the pass book, the accountant found the following; nothing else keeps the two books apart:',
      ...s.order.map((k, i) => `${ROMAN[i]} ${cashBookErrorLine(s, k)}`),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const fig = figureEffect(s.figure);
        const cast = castEffect(s.cast);
        const answer = s.start - fig - cast - s.charges;
        const label = (k: CashBookErrors['order'][number]) => ROMAN[s.order.indexOf(k)];
        return numeric({
          prompt: 'What is the balance of the bank column once the cash book is amended?',
          answer,
          commonErrors: present<Slip>(
            { value: s.start + fig - cast - s.charges, why: `Corrected item ${label('figure')} the wrong way: ask whether the cash book shows too much or too little for that cheque.` },
            { value: s.start - fig + cast - s.charges, why: `Corrected item ${label('cast')} the wrong way: a receipts side added up too high, or a payments side too low, makes the balance too high.` },
            { value: answer + s.unpresented.x, why: `Added the cheque not yet presented; the cash book is already right about it, so it belongs in the statement alone.` },
            { value: answer + s.charges, why: 'Left out the bank charges; the cash book needs an entry for them.' },
          ),
          explanation: [
            `Cash book balance: ${F(s.start)}.`,
            `${label('figure')} The cheque is in the cash book at ${F(s.figure.shown)} for ${F(s.figure.actual)}: the balance is ${F(Math.abs(fig))} too ${fig > 0 ? 'high' : 'low'}, so ${fig > 0 ? 'deduct' : 'add'} ${F(Math.abs(fig))}.`,
            `${label('cast')} The ${s.cast.receipts ? 'receipts' : 'payments'} side ${s.cast.over ? 'overcast' : 'undercast'} makes the balance ${F(s.cast.x)} too ${cast > 0 ? 'high' : 'low'}: ${cast > 0 ? 'deduct' : 'add'} it.`,
            `${label('charges')} Deduct the bank charges, ${F(s.charges)}.`,
            `${label('cheque')} The cheque not yet presented needs no entry: the cash book is right about it.`,
            `Amended balance = ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const r = readCashBookErrors(q.context ?? '');
        return !!r && q.answer === r.start + sum([...r.amend.values()]);
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const amended = s.start - figureEffect(s.figure) - castEffect(s.cast) - s.charges;
        const answer = amended + s.unpresented.x;
        return numeric({
          prompt: 'Starting from the amended cash book balance, what is the balance as per pass book?',
          answer,
          commonErrors: present<Slip>(
            { value: amended - s.unpresented.x, why: 'Deducted the cheque not yet presented; the bank has not paid it, so the pass book balance is higher.' },
            { value: amended, why: 'Gave the amended balance; the cheque not yet presented still keeps the two books apart.' },
            { value: answer - s.charges, why: 'Deducted the bank charges a second time; the amended cash book already shows them.' },
          ),
          explanation: [`Amended balance as per cash book: ${F(amended)}.`, `Add the cheque issued to ${s.unpresented.who}, not yet presented: ${F(s.unpresented.x)}.`, `Balance as per pass book = ${F(amended)} + ${F(s.unpresented.x)} = ${F(answer)}.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const r = readCashBookErrors(q.context ?? '');
        return !!r && q.answer === r.start + sum([...r.amend.values()]) + r.passOnly;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const [f, c] = [ROMAN[s.order.indexOf('figure')], ROMAN[s.order.indexOf('cast')]];
        return choice({
          prompt: `Which of the two errors, ${[f, c].sort().join(' and ')}, made the trial balance disagree?`,
          correct: `Only ${c}`,
          distractors: [
            { text: `Only ${f}`, why: `In ${f} the cash book and ${poss(s.figure.who)} account were posted with the same wrong figure, so debits and credits stayed equal.` },
            { text: 'Both of them', why: `${f} put the same wrong figure on both sides, Bank A/c and ${poss(s.figure.who)} account, so it left the totals equal.` },
            { text: 'Neither of them', why: `${c} changed Bank A/c alone: nothing on the other side matches it, so the totals differ.` },
          ],
          explanation: `A casting error in the bank column changes the balance of Bank A/c and nothing else: a one-sided error, which the trial balance shows. In ${f} the same wrong figure went to both sides, so the trial balance agreed in spite of it.`,
        });
      },
      verify: (q: McqQuestion) => {
        const cast = (q.context ?? '').split('\n').find((r) => /side of the bank column was/.test(r));
        return !!cast && correctText(q) === `Only ${cast.split(' ')[0]}`;
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const label = ROMAN[s.order.indexOf('cast')];
        const high = castEffect(s.cast) > 0;
        const x = s.cast.x;
        return {
          prompt: `Pass the rectifying entry for the error in ${label}.`,
          lines: high ? [dr('suspense', x), cr('bank', x)] : [dr('bank', x), cr('suspense', x)],
          explanation: [
            `The ${s.cast.receipts ? 'receipts' : 'payments'} side was ${s.cast.over ? 'overcast' : 'undercast'}, so Bank A/c shows ${F(x)} too ${high ? 'much' : 'little'}: it is ${high ? 'credited' : 'debited'}.`,
            `Nothing else was posted wrongly, so the other side of the entry is Suspense A/c, which took the difference when the trial balance was drawn up.`,
          ],
          distractorAccounts: ['cash', 'capital', 'sales'],
        };
      },
      verify: (q: JournalQuestion) => {
        const r = readCashBookErrors(q.context ?? '');
        const label = /error in (\([iv]+\))/.exec(q.prompt)?.[1];
        const fix = r && label ? r.amend.get(label) : undefined;
        if (!fix) return false;
        // The cash book is put right by Bank A/c; Suspense A/c takes the other side.
        return linesKey(q.expected) === linesKey(fix > 0 ? [dr('bank', fix), cr('suspense', fix)] : [dr('suspense', -fix), cr('bank', -fix)]);
      },
    },
    {
      kind: 'journal',
      make: (s) => {
        const label = ROMAN[s.order.indexOf('figure')];
        const fig = figureEffect(s.figure);
        const party = s.figure.received ? debtor(s.figure.who) : creditor(s.figure.who);
        const x = Math.abs(fig);
        return {
          prompt: `Pass the rectifying entry for the error in ${label}.`,
          lines: fig > 0 ? [dr(party, x), cr('bank', x)] : [dr('bank', x), cr(party, x)],
          explanation: [
            `The cheque was entered at ${F(s.figure.shown)} for ${F(s.figure.actual)}: the difference is ${F(x)}.`,
            `The bank column is ${F(x)} too ${fig > 0 ? 'high' : 'low'}, so Bank A/c is ${fig > 0 ? 'credited' : 'debited'} with it.`,
            `${s.figure.who} was posted with the same wrong figure, so ${poss(s.figure.who)} account takes the other side; Suspense A/c is not used, since this error left the totals equal.`,
          ],
          distractorAccounts: ['suspense', 'cash', s.figure.received ? 'sales' : 'purchases'],
        };
      },
      verify: (q: JournalQuestion) => {
        const r = readCashBookErrors(q.context ?? '');
        const label = /error in (\([iv]+\))/.exec(q.prompt)?.[1];
        const fix = r && label ? r.amend.get(label) : undefined;
        const party = q.expected.find((l) => l.accountId.includes(':'));
        if (!fix || !party) return false;
        return linesKey(q.expected) === linesKey(fix > 0 ? [dr('bank', fix), cr(party.accountId, fix)] : [dr(party.accountId, -fix), cr('bank', -fix)]);
      },
    },
  ],
});

// ===============================================================================================================
// Case 10. One purchase with trade discount and GST, through the books (medium)
// ===============================================================================================================

interface GstInvoice {
  b: Business;
  state: string;
  city: string;
  from: string | null;
  g: Gst;
  supplier: string;
  list: Paise;
  td: number;
  back: Paise;
  paid: Paise;
  days: number[];
}

/** An amount after trade discount, and its GST: the taxable value, the tax and the total. */
const invoiceOf = (list: Paise, td: number, g: Gst) => {
  const taxable = list - (list * td) / 100;
  const tax = (taxable * g.rate) / 100;
  return { taxable, tax, total: taxable + tax };
};

/** The figures of the case read back from its text. */
function readInvoice(text: string) {
  const m = /list price (₹[\d,]+) less (\d+)% trade discount, with GST at (\d+)%/.exec(text);
  const back = /goods of list price (₹[\d,]+) from this lot/.exec(text);
  const paid = /(₹[\d,]+) was paid to .+ by cheque on account/.exec(text);
  if (!m || !back || !paid) return null;
  const g: Gst = { rate: Number(m[3]), intra: /CGST and SGST/.test(text) };
  return { inv: invoiceOf(toPaise(m[1]), Number(m[2]), g), ret: invoiceOf(toPaise(back[1]), Number(m[2]), g), paid: toPaise(paid[1]), g };
}

const gstInvoice = caseTemplate<GstInvoice>({
  id: 'case-books-gst-invoice-through-books',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'One purchase with trade discount and GST, through the books',
  setup: (rng) => {
    const b = business(rng);
    const [city, state] = rng.pick(CITIES);
    const intra = rng.pick([true, false]);
    const from = intra ? null : rng.pick(CITIES.filter(([, st]) => st !== state))[1];
    const g: Gst = { rate: rng.pick([5, 18]), intra };
    const list = amount(rng, 40000, 160000, 4000);
    const td = rng.pick([10, 20, 25]);
    const back = amount(rng, 4000, 12000, 4000);
    const inv = invoiceOf(list, td, g);
    const ret = invoiceOf(back, td, g);
    const whole = (x: Paise) => x % 100 === 0;
    if (![inv.taxable, inv.tax, ret.taxable, ret.tax].every(whole) || (intra && !whole(inv.tax / 2)) || (intra && !whole(ret.tax / 2))) return null;
    const paid = partOf(rng, inv.total - ret.total);
    if (paid <= 0) return null;
    return { b, state, city, from, g, supplier: rng.pick(SUPPLIERS), list, td, back, paid, days: daysBetween(rng, 3, 2, 28) };
  },
  context: (s) => {
    const [d1, d2, d3] = s.days.map((d) => `${d} ${s.b.month}`);
    return [
      `${s.b.owner} runs ${s.b.shop} in ${s.city}, ${s.state}, and keeps a Purchases Book and a Purchases Return Book with GST columns.`,
      `On ${d1} goods were bought on credit from ${s.supplier}${s.from ? `, a dealer in ${s.from}` : `, a dealer in ${s.state}`}: list price ${F(s.list)} less ${s.td}% trade discount, with GST at ${s.g.rate}% on the price after discount.`,
      s.g.intra ? `The supply is within ${s.state}: CGST and SGST at ${s.g.rate / 2}% each.` : `The supply is from another State: IGST at ${s.g.rate}%.`,
      `On ${d2} goods of list price ${F(s.back)} from this lot were returned to ${s.supplier}; a debit note was sent for the goods and the GST on them.`,
      `On ${d3} ${F(s.paid)} was paid to ${s.supplier} by cheque on account.`,
    ].join('\n');
  },
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { taxable } = invoiceOf(s.list, s.td, s.g);
        return numeric({
          prompt: 'What is the taxable value of the invoice of the purchase?',
          answer: taxable,
          commonErrors: [
            { value: s.list, why: 'Took the list price; the trade discount comes off before GST is charged.' },
            { value: (s.list * s.td) / 100, why: 'Gave the trade discount itself; the taxable value is what is left after it.' },
            { value: invoiceOf(s.list, s.td, s.g).total, why: 'Added the GST; the taxable value is the price before tax.' },
          ],
          explanation: [`Trade discount: ${s.td}% of ${F(s.list)} = ${F((s.list * s.td) / 100)}.`, `Taxable value = ${F(s.list)} - ${F((s.list * s.td) / 100)} = ${F(taxable)}.`],
        });
      },
      verify: (q: NumericQuestion) => readInvoice(q.context ?? '')?.inv.taxable === q.answer,
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const { taxable, tax, total } = invoiceOf(s.list, s.td, s.g);
        return numeric({
          prompt: `What is the total of the invoice, the amount ${s.supplier} is owed for it?`,
          answer: total,
          commonErrors: present<Slip>(
            { value: s.list + (s.list * s.g.rate) / 100, why: 'Charged GST on the list price and left out the trade discount.' },
            { value: taxable, why: 'Left out the GST; the supplier is owed the tax as well.' },
            s.g.intra && { value: taxable + tax / 2, why: 'Added only one of the two taxes; CGST and SGST are both charged.' },
          ),
          explanation: [
            `GST: ${s.g.rate}% of ${F(taxable)} = ${F(tax)}${s.g.intra ? ` (CGST ${F(tax / 2)} and SGST ${F(tax / 2)})` : ' (IGST)'}.`,
            `Total = ${F(taxable)} + ${F(tax)} = ${F(total)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => readInvoice(q.context ?? '')?.inv.total === q.answer,
    },
    {
      kind: 'journal',
      make: (s) => {
        const { taxable, tax, total } = invoiceOf(s.list, s.td, s.g);
        const taxes = s.g.intra ? [dr('inputCGST', tax / 2), dr('inputSGST', tax / 2)] : [dr('inputIGST', tax)];
        return {
          prompt: `Pass the journal entry for the purchase from ${s.supplier}.`,
          lines: [dr('purchases', taxable), ...taxes, cr(creditor(s.supplier), total)],
          explanation: [
            `Purchases A/c is debited with the taxable value, ${F(taxable)}; the trade discount is not entered.`,
            `The GST paid can be set off later: ${s.g.intra ? `Input CGST A/c and Input SGST A/c are debited with ${F(tax / 2)} each` : `Input IGST A/c is debited with ${F(tax)}`}.`,
            `${s.supplier} is owed the invoice total, ${F(total)}, and is credited.`,
          ],
          distractorAccounts: s.g.intra ? ['outputCGST', 'outputSGST', 'inputIGST', 'discountReceived'] : ['outputIGST', 'inputCGST', 'discountReceived'],
        };
      },
      verify: (q: JournalQuestion) => {
        const r = readInvoice(q.context ?? '');
        if (!r) return false;
        const tax = (ids: string[]) => sum(q.expected.filter((l) => ids.includes(l.accountId) && l.side === 'Dr').map((l) => l.amount));
        const party = q.expected.find((l) => l.accountId.startsWith('creditor:'));
        return (
          q.expected.find((l) => l.accountId === 'purchases')?.amount === r.inv.taxable &&
          tax(r.g.intra ? ['inputCGST', 'inputSGST'] : ['inputIGST']) === r.inv.tax &&
          party?.side === 'Cr' &&
          party.amount === r.inv.total
        );
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const cols = s.g.intra ? 'Input CGST and Input SGST' : 'Input IGST';
        const other = s.g.intra ? 'Input IGST' : 'Input CGST and Input SGST';
        return choice({
          prompt: 'In which book is the purchase entered, and with which tax columns?',
          correct: `The Purchases Book, with a column for ${cols}`,
          distractors: [
            { text: `The Purchases Book, with a column for ${other}`, why: s.g.intra ? 'A supply within the State carries CGST and SGST; IGST is for a supply from another State.' : 'A supply from another State carries IGST; CGST and SGST are for a supply within the State.' },
            { text: `The Journal Proper, with a column for ${cols}`, why: 'Goods for resale bought on credit go to the Purchases Book; the Journal Proper takes what no other book does, such as an asset bought on credit.' },
            { text: `The Cash Book, with a column for ${cols}`, why: 'Nothing was paid when the goods were bought; the Cash Book takes only cash and cheque dealings.' },
            { text: 'The Purchases Return Book, with no tax column', why: 'That book takes the goods sent back with the debit note, not the purchase.' },
          ],
          explanation: `Goods for resale bought on credit are entered in the Purchases Book. A supply ${s.g.intra ? `within ${s.state} carries CGST and SGST` : 'from another State carries IGST'}, so the book has a column for ${cols}.`,
        });
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const inv = invoiceOf(s.list, s.td, s.g);
        const ret = invoiceOf(s.back, s.td, s.g);
        const answer = inv.total - ret.total - s.paid;
        return numeric({
          prompt: `What is the balance of ${poss(s.supplier)} account at the end of ${s.b.month}?`,
          answer,
          commonErrors: present<Slip>(
            { value: answer + ret.tax, why: 'Took the goods returned at their price without GST; the debit note covers their GST too.' },
            { value: inv.total - s.back - s.paid, why: 'Took the goods returned at their list price; they go back at the price charged, after trade discount and with GST.' },
            { value: answer + ret.total, why: 'Left out the goods returned; the debit note reduces what is owed.' },
            { value: answer + 2 * s.paid, why: 'Added the cheque to the balance; a payment reduces what is owed.' },
          ),
          explanation: [
            `Invoice total ${F(inv.total)} (credit).`,
            `Goods returned: list price ${F(s.back)} less ${s.td}% = ${F(ret.taxable)}, with GST ${F(ret.tax)}: ${F(ret.total)} (debit).`,
            `Cheque paid: ${F(s.paid)} (debit).`,
            `Balance = ${F(inv.total)} - ${F(ret.total)} - ${F(s.paid)} = ${F(answer)} (credit).`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const r = readInvoice(q.context ?? '');
        return !!r && q.answer === r.inv.total - r.ret.total - r.paid;
      },
    },
  ],
});

// ===============================================================================================================
// Case 11. A journal posted with errors: the account as posted and as it should be (medium)
// ===============================================================================================================

/** The ledger as the clerk left it: the entries, with each error's wrong postings in place of the right ones. */
const postedWith = (entries: readonly { lines: JournalLine[] }[], errors: readonly { done: JournalLine[]; should: JournalLine[] }[]): Ledger =>
  post([...entries.map((e) => e.lines), ...errors.map((e) => [...e.done, ...e.should.map((l) => ({ ...l, side: flip(l.side) }))])]);

interface PostingErrors {
  b: Business;
  m: CreditMonth;
  faults: Fault[];
  party: string;
  fix: number;
}

function postingErrorsSetup(rng: Rng): PostingErrors | null {
  const b = business(rng);
  const m = creditMonth(rng, b, true);
  if (!m) return null;
  const { ones, twos } = monthMakers(rng, m);
  // One error in a party's account (a figure misread, or a posting on the wrong side), one other, and one that left
  // the totals equal.
  const inParty: Maker[] = [
    (t) => {
      const line = partyLine(t);
      const y = line && transposed(rng, line.amount);
      return line && y ? fault.wrongFigure(t, line.accountId, y) : null;
    },
    ones[1],
  ];
  const drawn = drawFaults(rng, m.all.slice(1), [
    { makers: inParty, count: 1 },
    { makers: ones, count: 1 },
    { makers: twos, count: 1 },
  ]);
  if (!drawn) return null;
  const faults = rng.shuffle(drawn).map(asPosting);
  const gaps = faults.map(tbNet);
  if (sum(gaps) === 0) return null;
  // The account asked about is a party's that an error left wrong, still on its usual side as the clerk posted it.
  const wrong = rng.shuffle([...new Set(faults.flatMap((f) => [...f.done, ...f.should].map((l) => l.accountId)))].filter((id) => id.startsWith('debtor:') || id.startsWith('creditor:')));
  const ledger = postedWith(m.all, faults);
  const right = post(m.all.map((t) => t.lines));
  // ...and one whose balance can be asked: at least two postings, so that the account has something to work out.
  const party = wrong.find((id) => {
    const posted = balanceOf(ledger, id);
    const should = balanceOf(right, id);
    const side = id.startsWith('debtor:') ? 'Dr' : 'Cr';
    return posted?.side === side && should?.side === side && posted.amount !== should.amount && partyBalance(m.all, id, b, faults) !== null;
  });
  if (!party) return null;
  return { b, m, faults, party, fix: rng.pick(faults.map((_, i) => i).filter((i) => gaps[i] !== 0)) };
}

const postingErrors = caseTemplate<PostingErrors>({
  id: 'case-books-journal-posting-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A journal posted with errors: one account, two ways',
  setup: (rng) => tries(4, () => postingErrorsSetup(rng)),
  context: (s) =>
    [
      `Journal of ${poss(s.b.owner)} ${s.b.shop.replace(/^an? /, '')}, opened on ${firstDay(s.b)} (narrations are left out):`,
      ...s.m.all.map(journalLine),
      `A clerk posted this journal to the ledger. The trial balance on ${monthEnd(s.b)} did not agree, and the difference was put to a Suspense A/c. These errors in posting were then found; there are no others:`,
      ...s.faults.map((x, i) => `${tag(i)} ${x.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const who = resolveAccount(s.party).name;
        const posted = balanceOf(postedWith(s.m.all, s.faults), s.party)!.amount;
        const right = balanceOf(post(s.m.all.map((t) => t.lines)), s.party)!.amount;
        return numeric({
          prompt: `As the clerk posted the ledger, what balance did ${poss(who)} account show on ${monthEnd(s.b)}?`,
          answer: posted,
          commonErrors: [
            { value: right, why: 'Gave the balance as it should be; the question asks for the account as the clerk left it, errors and all.' },
            { value: Math.abs(2 * right - posted), why: 'Applied the errors the wrong way round.' },
          ],
          explanation: [
            `Posted rightly, the account would show ${F(right)}.`,
            ...s.faults
              .map((f, i) => {
                const moved = net(f.done.filter((l) => l.accountId === s.party)) - net(f.should.filter((l) => l.accountId === s.party));
                return moved === 0 ? null : `Error ${tag(i)} put ${F(Math.abs(moved))} too much on its ${moved > 0 ? 'debit' : 'credit'} side.`;
              })
              .filter((x): x is string => x !== null),
            `As posted, the balance is ${F(posted)} (${s.party.startsWith('debtor:') ? 'debit' : 'credit'}).`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const name = /balance did (.+?)'s? account show/.exec(q.prompt)?.[1];
        if (!read || !name) return false;
        const ledger = postedWith(read.entries, [...read.slips.values()]);
        const ids = [...ledger.keys()].filter((id) => id.includes(':') && resolveAccount(id).name === name);
        return ids.length === 1 && balanceOf(ledger, ids[0])?.amount === q.answer;
      },
    },
    { kind: 'numeric', unit: 'rupees', make: (s) => partyBalance(s.m.all, s.party, s.b, s.faults), verify: verifyPartyBalance },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => differencePart(s.faults, `By what amount did the two columns of the trial balance on ${monthEnd(s.b)} differ?`),
      verify: (q: NumericQuestion) => {
        const gap = readGap(q);
        return gap !== null && gap !== 0 && q.answer === Math.abs(gap);
      },
    },
    { kind: 'journal', make: (s): JournalParts => entryParts(s.faults[s.fix], s.fix), verify: verifyRectifying },
    { kind: 'mcq', make: (s) => untouchedPart(s.faults), verify: verifyUntouched },
  ],
});

// ===============================================================================================================
// Case 12. A month on an overdraft: the cash book, the trial balance and the pass book (complex)
// ===============================================================================================================

interface OverdraftMonth {
  b: Business;
  given: Given[];
  all: Dated[];
  cheques: { issued: boolean; who: string; amount: Paise; date: string; out: boolean }[];
  interest: Paise;
  od0: Paise;
  odEnd: Paise;
  text: string;
}

const overdraftMonth = caseTemplate<OverdraftMonth>({
  id: 'case-books-overdraft-month',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A month on an overdraft',
  setup: (rng) =>
    tries(3, () => {
      const b = business(rng);
      const [d1, d2] = rng.shuffle(CUSTOMERS);
      const [c1, c2] = rng.shuffle(SUPPLIERS);
      const od0 = amount(rng, 40000, 120000, 5000);
      const owed = [amount(rng, 20000, 50000, 1000), amount(rng, 15000, 40000, 1000)];
      const owing = [amount(rng, 20000, 50000, 1000), amount(rng, 15000, 40000, 1000)];
      const given: Given[] = [
        { label: 'Cash', accountId: 'cash', side: 'Dr', amount: amount(rng, 20000, 40000, 1000) },
        { label: 'Bank', accountId: 'bank', side: 'Cr', amount: od0 },
        { label: 'Stock', accountId: 'stock', side: 'Dr', amount: amount(rng, 150000, 300000, 10000) },
        givenParty(debtor(d1), owed[0]),
        givenParty(debtor(d2), owed[1]),
        givenParty(creditor(c1), owing[0]),
        givenParty(creditor(c2), owing[1]),
      ];
      const opening = openingStep(given);
      if (!opening) return null;
      const got = owed.map((x) => partOf(rng, x));
      const paid = owing.map((x) => partOf(rng, x));
      if ([...got, ...paid].some((x) => x <= 0) || new Set([...got, ...paid]).size < 4) return null;
      const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
      const order = interleave(rng, [[cs.receive(d1, got[0], 0)], [cs.receive(d2, got[1], 0)], [cs.paySupplier(c1, paid[0], 0)], [cs.paySupplier(c2, paid[1], 0)], [cs.goodsSold('cash', amount(rng, 10000, 30000, 1000))], [more.deposit(amount(rng, 5000, 15000, 1000))], [cs.expense(e, 'bank', pickAmount(rng, e))]]);
      // Cash never runs out, and the bank stays overdrawn all month.
      let cash = given[0].amount;
      let bank = -od0;
      for (const s of order) {
        cash += net(s.lines.filter((l) => l.accountId === 'cash'));
        bank += net(s.lines.filter((l) => l.accountId === 'bank'));
        if (cash < 0 || bank >= 0) return null;
      }
      const days = daysBetween(rng, order.length, 2, 28);
      const all: Dated[] = order.map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
      const cheques = all
        .filter((t) => t.key === 'paySupplier' || t.key === 'receiveFromCustomer')
        .map((t) => ({ issued: t.key === 'paySupplier', who: resolveAccount(partyLine(t)!.accountId).name, amount: partyLine(t)!.amount, date: t.date, out: false }));
      cheques.filter((x) => x.issued).at(-1)!.out = true;
      cheques.filter((x) => !x.issued).at(-1)!.out = true;
      const interest = rupees(Math.round((od0 * rng.pick([1, 1.5, 2])) / 100 / 5000) * 50);
      const odEnd = -bank;
      const out = cheques.filter((x) => x.out);
      const pass = bank + sum(out.map((x) => (x.issued ? x.amount : -x.amount))) - interest;
      if (interest <= 0 || pass >= 0) return null;
      const text = [
        `${b.owner} runs ${b.shop} and keeps a cash book with cash and bank columns. The business account at the bank is overdrawn. Cheques received are banked the same day.`,
        `Balances on 1 ${b.month} ${yearOf(b)} (the bank balance is an overdraft; capital is the balancing figure):`,
        ...given.map((g) => (g.accountId === 'bank' ? `Bank: ${F(g.amount)} (Cr)` : givenLine(g))),
        `Transactions of ${b.month}:`,
        ...all.map((t) => `${t.date}: ${t.text}`),
        `On ${monthEnd(b)} the bank column was compared with the pass book:`,
        ...out.map((x) => `• The cheque ${x.issued ? 'paid to' : 'received from'} ${x.who} on ${x.date} had not been ${x.issued ? 'presented for payment' : 'collected by the bank'}.`),
        `• The bank debited ${F(interest)} as interest on the overdraft.`,
        'The interest is not in the cash book yet; nothing else keeps the two books apart.',
      ].join('\n');
      return { b, given, all, cheques, interest, od0, odEnd, text };
    }),
  context: (s) => s.text,
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const ins = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'bank' && l.side === 'Dr').map((l) => l.amount));
        const outs = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'bank' && l.side === 'Cr').map((l) => l.amount));
        return numeric({
          prompt: `What overdraft does the bank column of the cash book show on ${monthEnd(s.b)}, before the interest is entered?`,
          answer: s.odEnd,
          commonErrors: present<Slip>(
            { value: Math.abs(s.od0 + sum(ins) - sum(outs)), why: 'Took the opening overdraft as money in the bank; an overdraft is a credit balance, and receipts reduce it.' },
            { value: s.odEnd + s.interest, why: 'Brought in the interest; it is not in the cash book yet.' },
            { value: Math.abs(sum(ins) - sum(outs)), why: 'Left out the overdraft the month opened with.' },
          ),
          explanation: [
            `The overdraft opens on the credit side: ${F(s.od0)}. Payments by cheque add to it: ${outs.map(F).join(' + ')} = ${F(sum(outs))}.`,
            `Money paid into the bank reduces it: ${ins.map(F).join(' + ')} = ${F(sum(ins))}.`,
            `Overdraft = ${F(s.od0)} + ${F(sum(outs))} - ${F(sum(ins))} = ${F(s.odEnd)} (a credit balance).`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const m = readCashMoves(q.context ?? '');
        const end = m ? m.bank0 + sum(m.moves.map((x) => x.bank)) : 0;
        return end < 0 && q.answer === -end;
      },
    },
    {
      kind: 'mcq',
      make: (s) =>
        choice({
          prompt: `Once the interest is entered, how does the bank balance appear in the trial balance on ${monthEnd(s.b)}?`,
          correct: `In the credit column: an overdraft of ${F(s.odEnd + s.interest)}`,
          distractors: [
            { text: `In the debit column: ${F(s.odEnd + s.interest)}`, why: 'Took every bank balance for an asset; an overdraft is owed to the bank, a credit balance.' },
            { text: `In the credit column: an overdraft of ${F(s.odEnd)}`, why: 'Left out the interest; once it is entered the overdraft is larger by it.' },
            { text: `In the credit column: an overdraft of ${F(Math.abs(s.odEnd - s.interest))}`, why: 'Took the interest as reducing the overdraft; the bank charged it, so the overdraft grows.' },
            { text: 'Not at all: an overdraft is shown only in the bank reconciliation statement', why: 'The overdraft is the balance of Bank A/c in the ledger, and every ledger balance goes into the trial balance.' },
          ],
          explanation: `The bank column ends on a credit balance of ${F(s.odEnd)}; the interest of ${F(s.interest)} is credited to Bank A/c, so the overdraft becomes ${F(s.odEnd + s.interest)}. An overdraft is owed to the bank, so it stands in the credit column.`,
        }),
      verify: (q: McqQuestion) => {
        const m = readCashMoves(q.context ?? '');
        const c = readComparison(q.context ?? '');
        if (!m || !c) return false;
        const end = m.bank0 + sum(m.moves.map((x) => x.bank)) + sum(c.items.map((i) => net(i.lines.filter((l) => l.accountId === 'bank'))));
        return end < 0 && correctText(q) === `In the credit column: an overdraft of ${F(-end)}`;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const out = s.cheques.filter((x) => x.out);
        const issued = out.find((x) => x.issued)!;
        const got = out.find((x) => !x.issued)!;
        const answer = s.odEnd - issued.amount + got.amount + s.interest;
        return numeric({
          prompt: `What overdraft does the pass book show on ${monthEnd(s.b)}?`,
          answer,
          commonErrors: present<Slip>(
            { value: s.odEnd + issued.amount - got.amount + s.interest, why: 'Turned both cheques the wrong way: with an overdraft, a cheque the bank has not paid leaves the overdraft smaller, and one it has not collected leaves it larger.' },
            { value: s.odEnd - issued.amount + got.amount, why: 'Left out the interest the bank charged.' },
            { value: s.odEnd - issued.amount + got.amount - s.interest, why: 'Took the interest as reducing the overdraft; it adds to it.' },
            { value: s.odEnd + s.interest, why: 'Left out the two cheques the bank had not dealt with.' },
          ),
          explanation: [
            `Overdraft as per cash book: ${F(s.odEnd)}.`,
            `The cheque to ${issued.who}, ${F(issued.amount)}, has not been paid by the bank, so the pass book overdraft is smaller by it.`,
            `The cheque from ${got.who}, ${F(got.amount)}, has not been collected, so the pass book overdraft is larger by it.`,
            `The interest, ${F(s.interest)}, adds to the overdraft in the pass book.`,
            `Overdraft as per pass book = ${F(s.odEnd)} - ${F(issued.amount)} + ${F(got.amount)} + ${F(s.interest)} = ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const m = readCashMoves(q.context ?? '');
        const c = readComparison(q.context ?? '');
        if (!m || !c) return false;
        const pass = m.bank0 + sum(m.moves.map((x) => x.bank)) + sum(c.cheques.map((x) => (x.issued ? x.amount : -x.amount))) + sum(c.items.map((i) => net(i.lines.filter((l) => l.accountId === 'bank'))));
        return pass < 0 && q.answer === -pass;
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: 'Pass the entry that brings the interest on the overdraft into the books.',
        lines: [dr('interestPaid', s.interest), cr('bank', s.interest)],
        explanation: ['Interest charged on the overdraft is an expense of the business: Interest Paid A/c is debited.', 'The bank has added it to the overdraft, so Bank A/c is credited.'],
        distractorAccounts: ['interestReceived', 'bankCharges', 'bankOverdraft'],
      }),
      verify: (q: JournalQuestion) => {
        const c = readComparison(q.context ?? '');
        return !!c && c.items.length === 1 && linesKey(c.items[0].lines) === linesKey(q.expected);
      },
    },
  ],
});

// ===============================================================================================================
// Case 13. Goods that leave the shop without being sold (medium)
// ===============================================================================================================

/** What an entry does to the equation: goods (Purchases A/c) are stock, an asset; incomes, expenses and drawings change capital. */
function effectOfEntry(lines: readonly JournalLine[]): Effect {
  const term = (id: string): Term => (termOf(id) === 'assets' && ['expense', 'income', 'capital'].includes(resolveAccount(id).type) && id !== 'purchases' ? 'capital' : termOf(id));
  const e: Effect = { assets: 0, liabilities: 0, capital: 0 };
  for (const l of lines) e[term(l.accountId)] += (term(l.accountId) === 'assets' ? 1 : -1) * signed(l);
  return e;
}

interface GoodsOut {
  b: Business;
  all: Dated[];
  withdrawn: Dated;
  charity: Dated;
  fire: Dated;
  loss: Paise;
  claim: Paise;
}

const goodsOut = caseTemplate<GoodsOut>({
  id: 'case-books-goods-withdrawn-lost',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Goods that left the shop without being sold',
  setup: (rng) => {
    const b = business(rng);
    const x = (lo: number, hi: number, s = 500) => amount(rng, lo, hi, s);
    const withdrawn = x(2000, 8000);
    const gift = x(1000, 5000);
    const lost = x(10000, 40000, 1000);
    // Never half: the claim would equal the loss by fire, and two answers of the case would coincide.
    const claim = (lost * rng.pick([60, 70, 75, 80])) / 100;
    if (claim % 100 !== 0 || new Set([withdrawn, gift, lost]).size < 3) return null;
    const charity = rng.pick([true, false]);
    const steps: Step[] = [
      cs.creditPurchase(rng.pick(SUPPLIERS), x(60000, 150000, 5000)),
      ...rng.shuffle([
        cs.goodsBought('bank', x(20000, 50000, 1000)),
        step('goodsTaken', `${b.owner} took goods costing ${F(withdrawn)} from the shop for personal use.`, 'Goods taken by the proprietor', [dr('drawings', withdrawn), cr('purchases', withdrawn)], ['Goods taken for personal use are drawings: Drawings A/c is debited, at cost.', 'They are no longer goods of the business: Purchases A/c is credited.'], ['sales', 'stock', 'capital']),
        charity
          ? step('charity', `Gave away goods costing ${F(gift)} as charity.`, 'Goods given away as charity', [dr('charity', gift), cr('purchases', gift)], ['Goods given in charity are a loss to the business: Charity A/c is debited, at cost.', 'They are no longer for sale: Purchases A/c is credited.'], ['sales', 'advertisement'])
          : step('charity', `Distributed goods costing ${F(gift)} as free samples.`, 'Goods given as free samples', [dr('advertisement', gift), cr('purchases', gift)], ['Free samples promote the business: Advertisement A/c is debited, at cost.', 'They are no longer for sale: Purchases A/c is credited.'], ['sales', 'charity']),
        step(
          'fire',
          `Goods costing ${F(lost)} were destroyed by fire; the insurance company admitted a claim of ${F(claim)}.`,
          'Goods destroyed by fire, with an insurance claim',
          [dr('lossByFire', lost - claim), dr('insuranceClaimReceivable', claim), cr('purchases', lost)],
          [`The insurer will pay ${F(claim)}: Insurance Claim Receivable A/c, an asset, is debited.`, `The rest, ${F(lost)} - ${F(claim)} = ${F(lost - claim)}, is a loss: Loss by Fire A/c is debited.`, `The goods are gone at their cost, ${F(lost)}: Purchases A/c is credited.`],
          ['stock', 'cash'],
        ),
      ]),
    ];
    const days = daysBetween(rng, steps.length, 2, 28);
    const all: Dated[] = steps.map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    const of = (key: string) => all.find((t) => t.key === key)!;
    return { b, all, withdrawn: of('goodsTaken'), charity: of('charity'), fire: of('fire'), loss: lost, claim };
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.shop}. Goods that leave the shop without being sold are credited to Purchases A/c, at cost.`,
      `Some transactions of ${s.b.month} ${yearOf(s.b)}:`,
      ...s.all.map((t) => `${t.date}: ${t.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'journal',
      make: (s) => ({ prompt: `Pass the journal entry for the transaction of ${s.fire.date}.`, lines: s.fire.lines, explanation: s.fire.steps, distractorAccounts: s.fire.distract }),
      verify: verifyDatedEntry,
    },
    {
      kind: 'mcq',
      make: (s) => {
        const right = effectOfEntry(s.withdrawn.lines);
        return choice({
          prompt: `How does the transaction of ${s.withdrawn.date} change the accounting equation?`,
          correct: effectText(right),
          distractors: wrongEffects(right, s.withdrawn.lines[0].amount),
          explanation: `Stock, an asset, falls by the cost of the goods, ${F(s.withdrawn.lines[0].amount)}. Drawings reduce capital by the same amount. No liability changes.`,
        });
      },
      verify: (q: McqQuestion) => {
        const date = new RegExp(`transaction of ${DAY}`).exec(q.prompt)?.[1];
        const entry = readBooks(q.context ?? '')?.entries.find((e) => e.date === date);
        return !!entry && correctText(q) === effectText(effectOfEntry(entry.lines));
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const bought = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'purchases' && l.side === 'Dr').map((l) => l.amount));
        const out = s.all.flatMap((t) => t.lines.filter((l) => l.accountId === 'purchases' && l.side === 'Cr').map((l) => l.amount));
        const answer = sum(bought) - sum(out);
        return numeric({
          prompt: `What is the balance of Purchases A/c at the end of ${s.b.month}, taking only these transactions?`,
          answer,
          commonErrors: [
            { value: sum(bought), why: 'Left the goods that went out unsold in Purchases A/c; each of them is credited to it, at cost.' },
            { value: answer + s.claim, why: 'Credited Purchases A/c with the loss net of the claim; it is credited with the whole cost of the goods destroyed.' },
            { value: answer + s.withdrawn.lines[0].amount, why: "Left the proprietor's goods in purchases; goods taken for personal use are credited to Purchases A/c." },
          ],
          explanation: [addUp('Debit side (goods bought)', bought), addUp('Credit side (goods taken, given away and destroyed, at cost)', out), `Balance = ${F(sum(bought))} - ${F(sum(out))} = ${F(answer)} (debit).`],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && balanceOf(post(read.entries.map((e) => e.lines)), 'purchases')?.amount === q.answer;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric({
          prompt: `Suppose the transaction of ${s.fire.date} had not been recorded at all. By how much would the net profit be understated?`,
          answer: s.claim,
          commonErrors: [
            { value: s.loss, why: 'Counted only the purchases left too high; the loss by fire would be missing as well, and that raises the profit.' },
            { value: s.loss - s.claim, why: 'Counted only the missing loss; Purchases A/c would also be left too high.' },
          ],
          explanation: [
            `Left out, Purchases A/c would be ${F(s.loss)} too high: the profit ${F(s.loss)} too low.`,
            `Loss by Fire A/c would miss ${F(s.loss - s.claim)}: the profit ${F(s.loss - s.claim)} too high.`,
            `Net: understated by ${F(s.loss)} - ${F(s.loss - s.claim)} = ${F(s.claim)}, the claim, which is an asset and not an expense.`,
          ],
        }),
      verify: (q: NumericQuestion) => {
        const date = new RegExp(`transaction of ${DAY}`).exec(q.prompt)?.[1];
        const entry = readBooks(q.context ?? '')?.entries.find((e) => e.date === date);
        const effect = entry ? profitOfSlip({ done: [], should: entry.lines }) : 0;
        return effect < 0 && q.answer === -effect;
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const what = s.charity.lines[0].accountId === 'charity' ? 'the goods given away as charity' : 'the free samples';
        const acct = ledgerLabel(s.charity.lines[0].accountId);
        return choice({
          prompt: `Suppose ${what} had not been recorded at all. What would happen to the net profit?`,
          correct: `Nothing: Purchases A/c and ${acct} would be wrong by the same amount, in opposite ways`,
          distractors: [
            { text: `It would be overstated by ${F(s.charity.lines[0].amount)}`, why: `Saw only the missing ${acct} debit; Purchases A/c would be too high by the same amount, which lowers the profit.` },
            { text: `It would be understated by ${F(s.charity.lines[0].amount)}`, why: `Saw only Purchases A/c too high; ${acct} would be too low by the same amount.` },
            { text: 'The trial balance would not agree', why: 'Leaving a whole entry out leaves the debit and credit totals equal.' },
          ],
          explanation: `Left out, Purchases A/c would be too high and ${acct} too low by the same amount. Both are charged against the profit, so the profit stays the same: only the two accounts are wrong.`,
        });
      },
      verify: (q: McqQuestion) => {
        const read = readBooks(q.context ?? '');
        const entry = read?.entries.find((e) => e.lines.some((l) => l.accountId === 'charity' || l.accountId === 'advertisement'));
        return !!entry && profitOfSlip({ done: [], should: entry.lines }) === 0 && correctText(q).startsWith('Nothing:');
      },
    },
  ],
});

// ===============================================================================================================
// Case 14. Which book takes each transaction, and what the books then give (medium)
// ===============================================================================================================

type Book = DayBook | 'Cash Book' | 'Journal Proper';
const ALL_BOOKS: Book[] = ['Purchases Book', 'Sales Book', 'Purchases Return Book', 'Sales Return Book', 'Cash Book', 'Journal Proper'];

/** The book of original entry an entry belongs in, from its accounts alone. */
function bookOfEntry(lines: readonly JournalLine[]): Book {
  if (lines.some((l) => l.accountId === 'cash' || l.accountId === 'bank')) return 'Cash Book';
  for (const book of ['Purchases Book', 'Sales Book', 'Purchases Return Book', 'Sales Return Book'] as const) {
    const { id, side, party } = DAY_BOOKS[book];
    if (lines.some((l) => l.accountId === id && l.side === side) && lines.some((l) => l.accountId.startsWith(party))) return book;
  }
  return 'Journal Proper';
}

const BOOK_SLIP: Record<Book, string> = {
  'Purchases Book': 'The Purchases Book takes only goods for resale bought on credit.',
  'Sales Book': 'The Sales Book takes only goods sold on credit.',
  'Purchases Return Book': 'The Purchases Return Book takes only goods sent back to suppliers.',
  'Sales Return Book': 'The Sales Return Book takes only goods sent back by customers.',
  'Cash Book': 'The Cash Book takes only what is paid or received in cash or by cheque.',
  'Journal Proper': 'The Journal Proper takes only what no other book takes, such as an asset bought on credit.',
};

interface WhichBook {
  b: Business;
  all: Dated[];
  focus: Dated;
  asset: Dated;
  returns: 'Purchases Return Book' | 'Sales Return Book';
  supplier: string;
}

const whichBook = caseTemplate<WhichBook>({
  id: 'case-books-which-book',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Which book takes each transaction',
  setup: (rng) => {
    const b = business(rng);
    const [s1, s2] = rng.shuffle(SUPPLIERS);
    const [c1, c2] = rng.shuffle(CUSTOMERS);
    const lists = rng.shuffle([20, 24, 30, 36, 40, 48, 50, 60]).slice(0, 4).map((k) => rupees(k * 1000));
    const td = rng.pick([10, 20]);
    const net = (x: Paise) => x - (x * td) / 100;
    const back = amount(rng, 2000, 6000, 500);
    const asset = rng.pick(ASSETS);
    const steps = order(
      rng,
      [cs.capital('bank', amount(rng, 200000, 400000, 50000)), more.purchaseAtDiscount(s1, lists[0] * 2, td)],
      [
        [cs.returnOut(s1, back), cs.paySupplier(s1, partOf(rng, net(lists[0] * 2) - back), 0)],
        [cs.creditPurchase(s2, lists[1])],
        [more.saleAtDiscount(c1, lists[2], td), cs.returnIn(c1, back + rupees(500))],
        [cs.creditSale(c2, lists[3])],
        [more.assetOnCredit(asset, rng.pick(DEALERS), pickAmount(rng, asset))],
        [rng.pick([cs.goodsSold('bank', amount(rng, 8000, 20000, 1000)), cs.goodsBought('bank', amount(rng, 8000, 20000, 1000))])],
      ],
    );
    if (!steps) return null;
    const all = onDays(rng, b, steps);
    const asked = all.filter((t) => t.key !== 'capital');
    return {
      b,
      all,
      focus: rng.pick(asked.filter((t) => t.key !== 'assetCredit')),
      asset: all.find((t) => t.key === 'assetCredit')!,
      returns: rng.pick(['Purchases Return Book', 'Sales Return Book'] as const),
      supplier: s1,
    };
  },
  context: (s) =>
    [
      `${s.b.owner} opened ${s.b.shop} on ${firstDay(s.b)} and keeps a Cash Book, a Purchases Book, a Sales Book, a Purchases Return Book, a Sales Return Book and a Journal Proper. Ignore GST.`,
      'Invoices are entered after trade discount, and goods returned at the price charged for them. Cheques received are banked the same day.',
      ...s.all.map((t) => `${t.date}: ${t.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'mcq',
      make: (s) => {
        const right = bookOfEntry(s.focus.lines);
        return choice({
          prompt: `In which book of original entry is the transaction of ${s.focus.date} recorded?`,
          correct: `The ${right}`,
          distractors: ALL_BOOKS.filter((x) => x !== right).map((x) => ({ text: `The ${x}`, why: BOOK_SLIP[x] })),
          explanation: `${BOOK_SLIP[right]} The transaction of ${s.focus.date} is of that kind.`,
        });
      },
      verify: (q: McqQuestion) => {
        const date = new RegExp(`transaction of ${DAY}`).exec(q.prompt)?.[1];
        const entry = readBooks(q.context ?? '')?.entries.find((e) => e.date === date);
        return !!entry && correctText(q) === `The ${bookOfEntry(entry.lines)}`;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const rows = bookRowsOf(s.all, true, null);
        const total = sum(rows.map((r) => r.amounts[0]));
        const lister = s.all.find((t) => /list price/.test(t.text) && t.key === 'creditPurchase')!;
        const list = rupeesIn(lister.text)[0];
        const cheque = s.all.find((t) => t.key === 'goodsCheque');
        return numeric({
          prompt: `What is the total of the Purchases Book for ${s.b.month}?`,
          answer: total,
          commonErrors: present<Slip>(
            { value: total + list - lister.lines[0].amount, why: 'Entered the invoice at its list price; trade discount comes off before the entry.' },
            { value: total + s.asset.lines[0].amount, why: 'Included the asset bought on credit; it goes to the Journal Proper, not the Purchases Book.' },
            cheque && { value: total + cheque.lines[0].amount, why: 'Included the goods paid for by cheque; the Cash Book takes them.' },
            { value: total - bookTotal(s.all, 'Purchases Return Book'), why: 'Deducted the goods returned; they go to the Purchases Return Book.' },
          ),
          explanation: [...rows.map((r) => `${r.date}, ${r.label}: ${F(r.amounts[0])}.`), `Total = ${rows.map((r) => F(r.amounts[0])).join(' + ')} = ${F(total)}.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && q.answer === bookTotal(read.entries, 'Purchases Book');
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        // Net purchases or net sales: what the goods account holds from every book, less the returns.
        const purchases = s.returns === 'Purchases Return Book';
        const id = purchases ? 'purchases' : 'sales';
        const gross = sum(s.all.flatMap((t) => t.lines.filter((l) => l.accountId === id).map((l) => l.amount)));
        const back = bookTotal(s.all, s.returns);
        const book = bookTotal(s.all, purchases ? 'Purchases Book' : 'Sales Book');
        const answer = gross - back;
        return numeric({
          prompt: `What are the net ${purchases ? 'purchases' : 'sales'} of ${s.b.month}?`,
          answer,
          commonErrors: present<Slip>(
            { value: gross, why: `Left out the goods returned; net ${purchases ? 'purchases' : 'sales'} are after returns.` },
            book !== gross && { value: book - back, why: `Took only the ${purchases ? 'Purchases' : 'Sales'} Book; goods ${purchases ? 'bought' : 'sold'} against a cheque count too.` },
            purchases && { value: answer + s.asset.lines[0].amount, why: 'Counted the asset bought on credit; it is not goods for resale.' },
            { value: gross + back, why: 'Added the returns; they reduce the goods account.' },
          ),
          explanation: [
            `${purchases ? 'Purchases' : 'Sales'}: ${s.all.flatMap((t) => t.lines.filter((l) => l.accountId === id).map((l) => F(l.amount))).join(' + ')} = ${F(gross)} (credit invoices after trade discount, and any goods ${purchases ? 'bought' : 'sold'} by cheque).`,
            `Less goods returned (the ${s.returns}): ${F(gross)} - ${F(back)} = ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        if (!read) return false;
        const ledger = post(read.entries.map((e) => e.lines));
        const purchases = q.prompt.includes('net purchases');
        const [a, r] = purchases ? ['purchases', 'purchasesReturn'] : ['sales', 'salesReturn'];
        return q.answer === Math.abs(ledger.get(a) ?? 0) - Math.abs(ledger.get(r) ?? 0);
      },
    },
    {
      kind: 'journal',
      make: (s) => ({ prompt: `Pass the entry in the Journal Proper for the transaction of ${s.asset.date}.`, lines: s.asset.lines, explanation: s.asset.steps, distractorAccounts: s.asset.distract }),
      verify: verifyDatedEntry,
    },
    { kind: 'numeric', unit: 'rupees', make: (s) => partyBalance(s.all, creditor(s.supplier), s.b, [], 'What'), verify: verifyPartyBalance },
  ],
});

// ===============================================================================================================
// Case 15. A trial balance that agreed, with errors in it (complex)
// ===============================================================================================================

/**
 * What one error, taken alone, does to the total of each column of a trial balance that agrees: an account left out of
 * a transaction lowers a column only if its two accounts stand in different columns.
 */
function totalLine(all: readonly Dated[], f: Fault, i: number, right: Paise): string {
  const delta = trialBalance(postedWith(all, [f])).debitTotal - right;
  const what = f.group === 'omitted' ? 'leaves a transaction out' : 'puts an amount in the wrong account';
  if (delta === 0) return `${tag(i)} ${what}, but both accounts concerned stand in the same column: the totals are as they would be.`;
  return `${tag(i)} ${what}, which leaves the total of each column ${F(Math.abs(delta))} ${delta < 0 ? 'lower' : 'higher'}.`;
}

interface AgreedErrors {
  b: Business;
  m: CreditMonth;
  faults: Fault[];
  fix: number;
  shown: Paise;
}

const agreedErrors = caseTemplate<AgreedErrors>({
  id: 'case-books-agreed-trial-balance-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A trial balance that agreed, with errors in it',
  setup: (rng) =>
    tries(4, () => {
      const b = business(rng);
      const m = creditMonth(rng, b, rng.pick([true, false]));
      if (!m) return null;
      const { twos } = monthMakers(rng, m);
      // The trial balance as drawn: every balance on its usual side, so that the clerk's totals read plainly.
      // A customer or supplier credited with what belonged to another can end on the wrong side; such a month is not
      // asked, so that every error moves an amount within one column.
      const usual = (r: { accountId: string; side: Side }) => !r.accountId.includes(':') || r.side === (r.accountId.startsWith('debtor:') ? 'Dr' : 'Cr');
      // One error leaves out a whole transaction whose two accounts stand in different columns (the one credit sale to
      // a customer, the one credit purchase from a supplier, or a cash sale), so that the totals as drawn differ from
      // the corrected ones and the two questions on them do not share an answer.
      const only = (t: Dated) => {
        const p = partyLine(t);
        return !!p && m.all.filter((x) => x.lines.some((l) => l.accountId === p.accountId)).length === 1;
      };
      const across = rng.pick(m.all.filter((t) => ((t.key === 'creditSale' || t.key === 'creditPurchase') && only(t)) || t.key === 'saleCash'));
      const first = fault.leftOut(across);
      // The other two from the errors that leave the totals equal, passing over one that would put a balance on its unusual side.
      const keeps = (f: Fault | null) => (f && trialBalance(postedWith(m.all, [first, f])).rows.every(usual) ? f : null);
      const drawn = drawFaults(rng, m.all.slice(1).filter((t) => t !== across), [{ makers: twos.map((mk): Maker => (t) => keeps(mk(t))), count: 2 }]);
      if (!drawn) return null;
      const faults = rng.shuffle([first, ...drawn]);
      const effect = sum(faults.map(profitEffect));
      if (effect === 0) return null;
      const drawnTb = trialBalance(postedWith(m.all, faults));
      if (drawnTb.debitTotal !== drawnTb.creditTotal || !drawnTb.rows.every(usual)) return null;
      // The profits are believable for the sales of the month: the correct one is a gross profit of a quarter to two
      // fifths of the net sales less the expenses and plus the gains of the month, and what the books showed is that
      // moved by the errors, at most half the net sales the books show. Errors that understate the profit by more than
      // it is leave the books showing a loss, which the case then states.
      const pl = (ledger: Ledger) => {
        const goods = ['purchases', 'purchasesReturn', 'sales', 'salesReturn'];
        const others = sum([...ledger].filter(([id]) => !goods.includes(id) && ['expense', 'income'].includes(resolveAccount(id).type)).map(([, v]) => v));
        return { sales: -(ledger.get('sales') ?? 0) - (ledger.get('salesReturn') ?? 0), others };
      };
      const right = pl(post(m.all.map((t) => t.lines)));
      const books = pl(postedWith(m.all, faults));
      const profits = [25, 30, 35, 40]
        .map((g) => Math.round((right.sales * g) / 100 / 50000) * 50000 - right.others)
        .filter((correct) => correct >= rupees(5000) && Math.abs(correct + effect) >= rupees(2000) && 2 * (correct + effect + books.others) <= books.sales);
      if (profits.length === 0) return null;
      // A loss only where no gross profit in the range leaves the books showing a profit.
      const shownProfit = profits.filter((correct) => correct + effect > 0);
      return { b, m, faults, fix: rng.int(0, faults.length - 1), shown: rng.pick(shownProfit.length > 0 ? shownProfit : profits) + effect };
    }),
  context: (s) =>
    [
      `${s.b.owner} opened ${s.b.shop} on ${firstDay(s.b)} and buys and sells on credit.${returnsNote(s.m)} Cheques received are banked the same day.`,
      ...s.m.all.map((t) => `${t.date}: ${t.text}`),
      `The trial balance drawn up on ${monthEnd(s.b)} by the balance method agreed, and the books showed a net ${s.shown > 0 ? 'profit' : 'loss'} of ${F(Math.abs(s.shown))} for the month. These errors were found later; there are no others:`,
      ...s.faults.map((e, i) => `${tag(i)} ${e.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const drawn = trialBalance(postedWith(s.m.all, s.faults)).debitTotal;
        const right = trialBalance(post(s.m.all.map((t) => t.lines))).debitTotal;
        return numeric({
          prompt: 'What was the total of each column of the trial balance as it was drawn up, errors and all?',
          answer: drawn,
          commonErrors: present<Slip>(
            right !== drawn && { value: right, why: 'Worked from the books as they should be; the question asks for the trial balance as the clerk drew it up.' },
            { value: 2 * drawn, why: 'Added the two columns together; the total asked for is that of one column.' },
            ...s.faults.map((f, i) => f.group !== 'omitted' && { value: drawn + f.x, why: `Added the amount of error ${tag(i)} to the totals; posting to the wrong account on the right side leaves them as they were.` }),
          ),
          explanation: [
            `Posted rightly, each column would total ${F(right)}. The errors left debits and credits equal, so the columns still agreed.`,
            ...s.faults.map((f, i) => totalLine(s.m.all, f, i, right)),
            `Total of each column as drawn: ${F(drawn)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        if (!read) return false;
        const tb = trialBalance(postedWith(read.entries, [...read.slips.values()]));
        return tb.debitTotal === tb.creditTotal && q.answer === tb.debitTotal;
      },
    },
    {
      kind: 'mcq',
      make: () =>
        choice({
          prompt: 'Why did the trial balance agree in spite of these errors?',
          correct: 'Each error left the debits and the credits equal',
          distractors: [
            { text: 'The errors were all found before the trial balance was drawn up', why: 'They were found after it; they did not upset it because each left the two sides equal.' },
            { text: 'Errors of these kinds always cancel each other out', why: 'They need not cancel each other: each one on its own left the debits equal to the credits.' },
            { text: 'A trial balance that agrees has no errors in it', why: 'A trial balance shows only errors that make debits and credits differ; these did not.' },
          ],
          explanation: 'A trial balance checks only that the debits equal the credits. Leaving a whole transaction out, or posting an amount to the wrong account on the right side, keeps the two sides equal, so it does not show.',
        }),
      verify: (q: McqQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && read.slips.size > 0 && [...read.slips.values()].every((x) => gapOf(x) === 0) && correctText(q).startsWith('Each error');
      },
    },
    { kind: 'journal', make: (s): JournalParts => entryParts(s.faults[s.fix], s.fix), verify: verifyRectifying },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const drawn = trialBalance(postedWith(s.m.all, s.faults)).debitTotal;
        const right = trialBalance(post(s.m.all.map((t) => t.lines))).debitTotal;
        return numeric({
          prompt: 'Once every error is rectified, what is the total of each column of the trial balance?',
          answer: right,
          commonErrors: present<Slip>(
            right !== drawn && { value: drawn, why: 'Kept the total as drawn; putting the errors right changes some balances, and with them the totals.' },
            ...s.faults.map((f, i) => f.group === 'omitted' && { value: drawn + f.x, why: `Added the whole amount of the transaction left out in error ${tag(i)} to the total as drawn; what it does to the totals depends on the columns its two accounts stand in.` }),
            ...s.faults.map((f, i) => f.group !== 'omitted' && { value: drawn - f.x, why: `Took the amount of error ${tag(i)} off the total; moving an amount between two accounts of one column leaves the total as it was.` }),
            { value: 2 * right, why: 'Added the two columns together; the total asked for is that of one column.' },
          ),
          explanation: [`As drawn, each column totals ${F(drawn)}.`, ...s.faults.map((f, i) => totalLine(s.m.all, f, i, right)), `Corrected total of each column: ${F(right)}.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const tb = read ? trialBalance(post(read.entries.map((e) => e.lines))) : null;
        return !!tb && tb.debitTotal === tb.creditTotal && q.answer === tb.debitTotal;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const effect = sum(s.faults.map(profitEffect));
        const answer = s.shown - effect;
        return numeric({
          prompt: 'What is the correct net profit for the month?',
          answer,
          commonErrors: present<Slip>(
            { value: s.shown + effect, why: 'Applied the net effect the wrong way: an overstated profit has to be reduced, and an understated one increased.' },
            s.shown > 0
              ? { value: s.shown, why: 'Left the profit as shown because the trial balance agreed; these errors still change incomes or expenses.' }
              : { value: -s.shown, why: 'Gave the loss the books showed; once the errors are put right the month shows a profit.' },
            s.shown < 0 && { value: -s.shown - effect, why: 'Added the loss shown to the amount the profit was understated by; the loss is set off against it.' },
            ...s.faults.map((f, i) => profitEffect(f) !== 0 && profitEffect(f) !== effect && { value: s.shown - profitEffect(f), why: `Corrected the profit for error ${tag(i)} alone.` }),
          ),
          explanation: [
            ...s.faults.map((f, i) => {
              const e = profitEffect(f);
              return e === 0 ? `${tag(i)} changes no income or expense: no effect on profit.` : `${tag(i)} ${e > 0 ? 'overstates' : 'understates'} the profit by ${F(Math.abs(e))}.`;
            }),
            s.shown < 0
              ? `The books showed a loss of ${F(-s.shown)}; putting the errors right adds ${F(-effect)}. Correct profit = ${F(-effect)} - ${F(-s.shown)} = ${F(answer)}.`
              : effect > 0
                ? `Correct profit = ${F(s.shown)} - ${F(effect)} = ${F(answer)}.`
                : `Correct profit = ${F(s.shown)} + ${F(-effect)} = ${F(answer)}.`,
          ],
        });
      },
      verify: (q: NumericQuestion) => {
        const read = readBooks(q.context ?? '');
        const shown = /books showed a net (profit|loss) of (₹[\d,]+)/.exec(q.context ?? '');
        return !!read && !!shown && q.answer === (shown[1] === 'loss' ? -1 : 1) * toPaise(shown[2]) - sum([...read.slips.values()].map(profitOfSlip));
      },
    },
  ],
});

// ===============================================================================================================
// Case 16. From the totals of the ledger to the trial balance, with an account added up wrongly (medium)
// ===============================================================================================================

interface LedgerTotals {
  b: Business;
  /** Every account with the totals of its two sides, as the clerk added them up. */
  accounts: { id: string; dr: Paise; cr: Paise }[];
  /** The account whose debit side was undercast, and by how much. */
  cast: { id: string; x: Paise };
  closed: string;
}

/** The figures of the case read back: each account's two side totals, and the casting error. */
function readTotals(text: string): { accounts: { label: string; dr: Paise; cr: Paise }[]; cast: { label: string; x: Paise } } | null {
  const accounts = text.split('\n').flatMap((row) => {
    const m = /^(.+ A\/c): debit side (₹[\d,]+|nil), credit side (₹[\d,]+|nil)$/.exec(row);
    return m ? [{ label: m[1], dr: m[2] === 'nil' ? 0 : toPaise(m[2]), cr: m[3] === 'nil' ? 0 : toPaise(m[3]) }] : [];
  });
  const cast = /the debit side of (.+ A\/c) had been undercast by (₹[\d,]+)/.exec(text);
  return accounts.length > 5 && cast ? { accounts, cast: { label: cast[1], x: toPaise(cast[2]) } } : null;
}

// Version 2: the first question asked for the debit column by the totals method; the course prepares a trial balance by
// the balance method only (CBSE 2025-26), so it now asks for the balance of Bank A/c from its two side totals.
const ledgerTotals = caseTemplate<LedgerTotals>({
  id: 'case-books-ledger-totals-trial-balance',
  version: 2,
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'From the ledger totals to the trial balance',
  setup: (rng) => {
    const b = business(rng);
    const [s1, s2] = rng.shuffle(SUPPLIERS);
    const [c1] = rng.shuffle(CUSTOMERS);
    const e = rng.pick(EXPENSES.filter((x) => ['rent', 'salaries', 'advertisement'].includes(x.id)));
    const asset = rng.pick(ASSETS);
    const buy1 = amount(rng, 30000, 70000, 5000);
    const sell = amount(rng, 40000, 90000, 5000);
    const steps = order(
      rng,
      [cs.capital('bank', amount(rng, 200000, 400000, 50000)), cs.creditPurchase(s1, buy1)],
      [
        [cs.payInFull(s1, buy1)],
        [cs.creditPurchase(s2, amount(rng, 20000, 60000, 5000))],
        [cs.creditSale(c1, sell), cs.receive(c1, partOf(rng, sell), 0)],
        [cs.goodsSold('bank', amount(rng, 10000, 30000, 1000))],
        [cs.expense(e, 'bank', pickAmount(rng, e)), cs.expense(e, 'bank', pickAmount(rng, e))],
        [cs.asset(asset, 'bank', pickAmount(rng, asset))],
        [cs.drawings(b.owner, 'bank', amount(rng, 3000, 9000, 1000))],
      ],
    );
    if (!steps) return null;
    const all = onDays(rng, b, steps);
    const ids = [...new Set(all.flatMap((t) => t.lines.map((l) => l.accountId)))];
    const accounts = ids.map((id) => ({ id, dr: sum(all.flatMap((t) => t.lines.filter((l) => l.accountId === id && l.side === 'Dr').map((l) => l.amount))), cr: sum(all.flatMap((t) => t.lines.filter((l) => l.accountId === id && l.side === 'Cr').map((l) => l.amount))) }));
    // The expense paid twice in the month: its debit side was added up short.
    const expense = accounts.find((a) => a.id === e.id)!;
    const x = rupees(rng.pick([100, 500, 1000]) * rng.int(1, 9));
    if (2 * x > expense.dr) return null;
    expense.dr -= x;
    const bank = accounts.find((a) => a.id === 'bank');
    if (!bank || bank.dr <= bank.cr) return null;
    return { b, accounts, cast: { id: e.id, x }, closed: creditor(s1) };
  },
  context: (s) =>
    [
      `${s.b.owner} opened ${s.b.shop} on ${firstDay(s.b)}. At the end of the month a clerk added up both sides of every ledger account:`,
      ...s.accounts.map((a) => `${ledgerLabel(a.id)}: debit side ${a.dr ? F(a.dr) : 'nil'}, credit side ${a.cr ? F(a.cr) : 'nil'}`),
      `It was found later that the debit side of ${ledgerLabel(s.cast.id)} had been undercast by ${F(s.cast.x)}; the figures above are as the clerk added them. There is no other error.`,
    ].join('\n'),
  parts: [
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const bank = s.accounts.find((a) => a.id === 'bank')!;
        const answer = bank.dr - bank.cr;
        return numeric({
          prompt: 'What is the balance of Bank A/c, the figure entered for it in the trial balance by the balance method?',
          answer,
          commonErrors: [
            { value: bank.dr, why: 'Gave the debit side total; the balance method lists the balance, the larger side less the smaller.' },
            { value: bank.dr + bank.cr, why: 'Added the two sides; the balance is their difference.' },
            { value: bank.cr, why: 'Gave the credit side total; the balance is the larger side less the smaller.' },
          ],
          explanation: [`Bank A/c: debit side ${F(bank.dr)}, credit side ${F(bank.cr)}.`, `Balance = ${F(bank.dr)} - ${F(bank.cr)} = ${F(answer)}, a debit balance, entered in the debit column.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const bank = readTotals(q.context ?? '')?.accounts.find((a) => a.label === 'Bank A/c');
        return !!bank && bank.dr > bank.cr && q.answer === bank.dr - bank.cr;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) => {
        const debits = s.accounts.filter((a) => a.dr > a.cr);
        const answer = sum(debits.map((a) => a.dr - a.cr));
        return numeric({
          prompt: 'From the same figures, what is the debit column of the trial balance by the balance method?',
          answer,
          commonErrors: present<Slip>(
            { value: sum(s.accounts.map((a) => a.dr)), why: 'Listed the debit totals; the balance method lists each account at its balance.' },
            { value: answer + s.cast.x, why: 'Put the casting error right first; the question asks for the figures as the clerk added them.' },
            { value: sum(s.accounts.filter((a) => a.cr > a.dr).map((a) => a.cr - a.dr)), why: 'Gave the credit column; with the casting error the two columns differ.' },
          ),
          explanation: [`Debit balances: ${debits.map((a) => `${ledgerLabel(a.id)} ${F(a.dr - a.cr)}`).join(' + ')} = ${F(answer)}.`],
        });
      },
      verify: (q: NumericQuestion) => {
        const r = readTotals(q.context ?? '');
        return !!r && q.answer === sum(r.accounts.map((a) => Math.max(0, a.dr - a.cr)));
      },
    },
    {
      kind: 'mcq',
      make: (s) => {
        const name = ledgerLabel(s.closed);
        const others = s.accounts.filter((a) => a.id !== s.closed && a.dr !== a.cr).map((a) => ledgerLabel(a.id));
        return choice({
          prompt: 'Which of these accounts has no place in a trial balance drawn up by the balance method?',
          correct: name,
          distractors: others.slice(0, 5).map((o) => ({ text: o, why: `${o} has a balance, and every balance is listed.` })),
          explanation: `The two sides of ${name} are equal: the supplier was paid in full, so the account has no balance and is left out of a trial balance drawn up by the balance method.`,
        });
      },
      verify: (q: McqQuestion) => {
        const r = readTotals(q.context ?? '');
        const equal = r?.accounts.filter((a) => a.dr === a.cr) ?? [];
        return equal.length === 1 && correctText(q) === equal[0].label;
      },
    },
    {
      kind: 'numeric',
      unit: 'rupees',
      make: (s) =>
        numeric({
          prompt: 'By how much do the two columns of the trial balance by the balance method differ?',
          answer: s.cast.x,
          commonErrors: [
            { value: 2 * s.cast.x, why: 'Doubled the casting error, as for a posting on the wrong side; an undercast side is short once.' },
            { value: s.accounts.find((a) => a.id === s.cast.id)!.dr, why: `Gave the debit side of ${ledgerLabel(s.cast.id)}; only the amount it was undercast by is missing.` },
          ],
          explanation: [`${ledgerLabel(s.cast.id)} was added up ${F(s.cast.x)} short, so its debit balance, and with it the debit column, is ${F(s.cast.x)} short: the credit column is larger by ${F(s.cast.x)}.`],
        }),
      verify: (q: NumericQuestion) => {
        const r = readTotals(q.context ?? '');
        if (!r) return false;
        const net = sum(r.accounts.map((a) => a.dr - a.cr));
        return q.answer === Math.abs(net) && net === -r.cast.x;
      },
    },
    {
      kind: 'journal',
      make: (s) => ({
        prompt: `The difference was put to a Suspense A/c. Pass the rectifying entry for the casting error in ${ledgerLabel(s.cast.id)}.`,
        lines: [dr(s.cast.id, s.cast.x), cr('suspense', s.cast.x)],
        explanation: [`${ledgerLabel(s.cast.id)} is short by ${F(s.cast.x)} on its debit side, so it is debited.`, 'Only that account was wrong, so the credit goes to Suspense A/c, which held the difference.'],
        distractorAccounts: ['bank', 'cash', 'capital'],
      }),
      verify: (q: JournalQuestion) => {
        const r = readTotals(q.context ?? '');
        const id = r && CLASS11_ACCOUNTS.find((a) => `${a.name} A/c` === r.cast.label)?.id;
        return !!r && !!id && linesKey(q.expected) === linesKey([dr(id, r.cast.x), cr('suspense', r.cast.x)]);
      },
    },
  ],
});

// ===============================================================================================================
// Chained cases
// ===============================================================================================================

/**
 * An error in the shape of the topic Rectification of Errors, whose set steps and Suspense A/c the chained cases
 * reuse (`ROE_CHAIN`): there the working says what was recorded and what should have been, entry by entry.
 */
const toRoe = (e: Fault): RoeError => ({
  text: e.text,
  kind: e.kind,
  done: e.done.map((l) => ({ account: l.accountId, side: l.side, amount: l.amount })),
  should: e.should.map((l) => ({ account: l.accountId, side: l.side, amount: l.amount })),
  // An error in the total of a book is told in words: its postings are not a whole entry.
  ...(e.should.length < 2 && e.done.length < 2 && e.recorded ? { recorded: e.recorded, correct: null } : {}),
});

/** The set of rectifying entries for the errors of a case, one item for each, labelled as the case lists them. */
function rectifyingSet(faults: readonly Fault[], suspenseOpen: boolean): CaseSetParts {
  const used = new Set(faults.flatMap((e) => rectifyingEntry(e).map((l) => l.accountId)));
  return {
    task: 'Pass the rectifying entries.',
    transactions: faults.map((e, i) => ({ label: tag(i), text: e.text, lines: rectifyingEntry(e), explanation: ROE_CHAIN.setSteps(toRoe(e), suspenseOpen) })),
    // The accounts a student wrongly reaches for: those of the entries as they stand, and the trading accounts.
    distractorAccounts: [...new Set([...faults.flatMap((e) => [...e.done, ...e.should].map((l) => l.accountId)), 'sales', 'purchases', 'capital'])].filter((id) => !used.has(id)).slice(0, 5),
    hints: [
      'Take the errors one at a time: what was posted, and what should have been? Cancel what is wrong and post what is right.',
      'An error that left one account wrong upset the trial balance, so the other side of its entry is Suspense A/c. An error that left two accounts wrong by the same amount, or left a whole transaction out, did not: its entry goes between the accounts concerned.',
    ],
  };
}

/** Every entry of a set rectifies the error of its label, as read from the case text. */
function verifyRectifyingSet(q: JournalSetQuestion): boolean {
  const read = readBooks(q.context ?? '');
  if (!read || read.slips.size !== q.entries.length) return false;
  return q.entries.every((e) => {
    const s = read.slips.get(lettersIn(e.label ?? '')[0] ?? '');
    return !!s && rectifies(e.expected, s);
  });
}

/** The Suspense A/c of a case whose errors account for the whole difference: it opens with what closes it. */
function verifySuspenseFound(q: AccountQuestion): boolean {
  const read = readBooks(q.data);
  if (!read || read.slips.size === 0) return false;
  const tbs = [...read.slips.values()].map(gapOf);
  return ROE_CHAIN.suspenseHolds(q, tbs, -sum(tbs), 'find');
}

// ---------------------------------------------------------------------------------------------------------------
// Chain 1. A month posted with errors: the rectifying entries, the Suspense A/c and the corrected trial balance (complex)
// ---------------------------------------------------------------------------------------------------------------

interface ErrorChain {
  chain: Chain;
  faults: Fault[];
}

/**
 * Errors of a month's posting: `ones` that upset the trial balance and `twos` that did not, each of a different
 * transaction. A maker gives null when its transaction cannot carry that error.
 */
type Maker = (t: Dated) => Fault | null;

/** The account of a party in an entry, if it has one. */
const partyLine = (t: Dated): JournalLine | undefined => t.lines.find((l) => l.accountId.startsWith('debtor:') || l.accountId.startsWith('creditor:'));

/**
 * `count` errors from each group of makers, each of a different transaction. The makers of a group take turns in an
 * order drawn from the seed, so that a case has errors of as many kinds as it can.
 */
function drawFaults(rng: Rng, all: readonly Dated[], plan: { makers: Maker[]; count: number }[]): Fault[] | null {
  const used = new Set<Dated>();
  const out: Fault[] = [];
  for (const { makers, count } of plan) {
    const turns = rng.shuffle(makers);
    for (let k = 0; k < count; k++) {
      let made: Fault | null = null;
      // The maker whose turn it is first, then the others, each on a few transactions.
      for (const maker of [...turns.slice(k % turns.length), ...turns.slice(0, k % turns.length)]) {
        for (const t of rng.shuffle(all.filter((x) => !used.has(x))).slice(0, 6)) {
          made = maker(t);
          if (made) {
            used.add(t);
            break;
          }
        }
        if (made) break;
      }
      if (!made) return null;
      out.push(made);
    }
  }
  return out;
}

/** A month of a new shop that buys and sells on credit: the dated transactions and who is in them. */
interface CreditMonth {
  all: Dated[];
  supplier: string;
  supplier2: string;
  customer: string;
  customer2: string;
  asset: string;
  returnOut: Paise;
  returnIn: Paise;
}

/**
 * A month of a new shop that buys and sells on credit: two suppliers and two customers, perhaps a return each way,
 * a cheque paid and one received (each perhaps at a discount), an asset bought by cheque, an expense, and goods sold
 * for cash or drawings. With `cash` the capital comes in part as cash.
 */
function creditMonth(rng: Rng, b: Business, cash: boolean): CreditMonth | null {
  const [supplier, supplier2] = rng.shuffle(SUPPLIERS);
  const [customer, customer2] = rng.shuffle(CUSTOMERS);
  const capital = amount(rng, 300000, 600000, 50000);
  const cashPart = cash ? amount(rng, 20000, 50000, 10000) : 0;
  const buy1 = amount(rng, 60000, 120000, 5000);
  const buy2 = amount(rng, 20000, 50000, 5000);
  const sell1 = amount(rng, 50000, 100000, 5000);
  const sell2 = amount(rng, 20000, 45000, 5000);
  const returnOut = rng.pick([0, amount(rng, 3000, 9000, 1000)]);
  const returnIn = rng.pick([0, amount(rng, 2000, 8000, 1000)]);
  const disc = () => (rng.pick([true, false]) ? rupees(rng.pick([500, 1000, 1500])) : 0);
  const paid = partOf(rng, buy1 - returnOut);
  const received = partOf(rng, sell1 - returnIn);
  if (paid <= 0 || received <= 0 || buy1 === sell1 || buy2 === sell2) return null;
  const asset = rng.pick(ASSETS);
  const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
  const steps = order(
    rng,
    [cashPart ? cs.capitalBoth(cashPart, capital) : cs.capital('bank', capital), cs.creditPurchase(supplier, buy1)],
    [
      [...(returnOut ? [cs.returnOut(supplier, returnOut)] : []), cs.paySupplier(supplier, paid, disc())],
      [cs.creditSale(customer, sell1), ...(returnIn ? [cs.returnIn(customer, returnIn)] : []), cs.receive(customer, received, disc())],
      [cs.creditPurchase(supplier2, buy2)],
      [cs.creditSale(customer2, sell2)],
      [cs.asset(asset, 'bank', pickAmount(rng, asset))],
      [cs.expense(e, cashPart ? rng.pick(['cash', 'bank'] as const) : 'bank', pickAmount(rng, e))],
      cashPart ? [cs.goodsSold('cash', amount(rng, 10000, 30000, 1000))] : [cs.drawings(b.owner, 'bank', amount(rng, 4000, 12000, 1000))],
    ],
    { cash: 0, bank: 0 },
  );
  if (!steps) return null;
  return { all: onDays(rng, b, steps), supplier, supplier2, customer, customer2, asset: asset.id, returnOut, returnIn };
}

/** Where goods returned are recorded, said only in a month that has a return. */
const returnsNote = (m: { returnOut: Paise; returnIn: Paise }): string => {
  const books = [...(m.returnOut ? ['Purchases Return A/c'] : []), ...(m.returnIn ? ['Sales Return A/c'] : [])];
  return books.length > 0 ? ` Goods returned are recorded in ${books.join(' and ')}.` : '';
};

/** The errors a credit month can carry: `ones` upset the trial balance and `twos` do not. */
function monthMakers(rng: Rng, m: CreditMonth, dayBooks = false): { ones: Maker[]; twos: Maker[] } {
  // With subsidiary books, the goods accounts take the monthly totals of the books, not the entries one by one: an
  // error in posting a single invoice or return can only be in the account of its party.
  const postable = (t: Dated) => (l: JournalLine) => l.accountId !== 'bank' && l.accountId !== 'cash' && !(dayBooks && partyLine(t) && Object.values(DAY_BOOKS).some((d) => d.id === l.accountId));
  // A figure misread, a posting on the wrong side, a posting left out.
  const figure: Maker = (t) => {
    const line = rng.pick(t.lines.filter(postable(t)));
    const y = line && transposed(rng, line.amount);
    return line && y ? fault.wrongFigure(t, line.accountId, y) : null;
  };
  const side: Maker = (t) => {
    const line = partyLine(t);
    return line && t.lines.length === 2 && t.key !== 'creditPurchase' && t.key !== 'creditSale' ? fault.wrongSide(t, line.accountId) : null;
  };
  const missing: Maker = (t) => {
    const line = rng.pick(t.lines.filter((l) => postable(t)(l) && l.accountId !== 'capital'));
    return line && t.key !== 'capital' && t.key !== 'capitalBoth' ? fault.notPosted(t, line.accountId) : null;
  };
  // The wrong customer or supplier, an asset taken for goods, a transaction left out.
  const party: Maker = (t) => {
    const line = partyLine(t);
    if (!line) return null;
    const other = line.accountId.startsWith('debtor:')
      ? debtor(t.lines.some((l) => l.accountId === debtor(m.customer)) ? m.customer2 : m.customer)
      : creditor(t.lines.some((l) => l.accountId === creditor(m.supplier)) ? m.supplier2 : m.supplier);
    return fault.instead(t, line.accountId, other);
  };
  const principle: Maker = (t) => (t.key === 'asset' ? fault.instead(t, m.asset, 'purchases') : null);
  const out: Maker = (t) => (t.key.startsWith('expense') || t.key === 'drawings' || t.key === 'saleCash' ? fault.leftOut(t) : null);
  return { ones: [figure, side, missing], twos: [party, principle, out] };
}

const errorChain = caseTemplate<ErrorChain>({
  id: 'case-books-chain-errors-suspense-tb',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A month posted with errors: rectify, Suspense, trial balance',
  setup: (rng) => {
    const b = business(rng);
    const m = creditMonth(rng, b, rng.pick([false, false, true]));
    if (!m) return null;
    const { all } = m;
    const { ones, twos } = monthMakers(rng, m);
    const two = rng.pick([1, 2]);
    const drawn = drawFaults(rng, all.slice(1), [
      { makers: ones, count: 5 - two },
      { makers: twos, count: two },
    ]);
    if (!drawn) return null;
    const faults = rng.shuffle(drawn);
    const gaps = faults.map(tbNet);
    if (sum(gaps) === 0) return null;
    const tb = trialBalanceOf(all);
    if (tb.rows.length > 15) return null;
    const text = [
      `${b.owner} opened ${b.shop} on ${firstDay(b)} and buys and sells on credit.${returnsNote(m)} Cheques received are banked the same day.`,
      ...all.map((t) => `${t.date}: ${t.text}`),
      `The trial balance drawn up on ${monthEnd(b)} did not agree, and the difference was put to a Suspense A/c. These errors were then found in the books; together they account for the whole difference:`,
      ...faults.map((x, i) => `${tag(i)} ${x.text}`),
    ].join('\n');
    return { chain: { b, text, all, month: all, openings: new Map(), asked: [], tb }, faults };
  },
  context: (s) => s.chain.text,
  parts: [
    { kind: 'journal_set', make: (s) => rectifyingSet(s.faults, true), verify: verifyRectifyingSet },
    {
      kind: 'account',
      make: (s) => {
        const made = ROE_CHAIN.suspense(`${poss(s.chain.b.owner)} ${s.chain.b.shop.replace(/^an? /, '')}`, s.faults.map(toRoe), -sum(s.faults.map(tbNet)), 'find', monthEnd(s.chain.b));
        return made && { ...made, task: `Prepare the Suspense A/c and find the difference in the trial balance with which it was opened. Enter that difference as "${ROE_CHAIN.difference}".` };
      },
      verify: verifySuspenseFound,
    },
    {
      kind: 'statement',
      make: (s) => {
        const made = tbPart(s.chain);
        const date = `${monthEnd(s.chain.b)} ${yearOf(s.chain.b)}`;
        return { ...made, task: `Prepare the corrected Trial Balance of ${s.chain.b.owner} as on ${date}, once every error is rectified, by the balance method. Leave out an account that has no balance.` };
      },
      verify: trialBalanceRead,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 2. A month with GST: the Sales Book and the Purchases Book with their tax columns, the account of a party,
// and the trial balance (complex)
// ---------------------------------------------------------------------------------------------------------------

/** The columns of a book kept with GST, as the Subsidiary Books topic names them. */
const gstColumns = (g: Gst, purchases: boolean): string[] => {
  const side = purchases ? 'Input' : 'Output';
  return ['Taxable value (₹)', ...(g.intra ? [`${side} CGST (₹)`, `${side} SGST (₹)`] : [`${side} IGST (₹)`]), 'Total (₹)'];
};

/** The rows of the Purchases Book or the Sales Book: one for every credit invoice of goods, against its party. */
function bookRowsOf(entries: readonly DatedEntry[], purchases: boolean, g: Gst | null): { date: string; label: string; amounts: number[] }[] {
  const goods = purchases ? 'purchases' : 'sales';
  const kind = purchases ? 'creditor:' : 'debtor:';
  const dir = purchases ? 'input' : 'output';
  return entries.flatMap(({ date, lines }) => {
    const item = lines.find((l) => l.accountId === goods && l.side === (purchases ? 'Dr' : 'Cr'));
    const party = lines.find((l) => l.accountId.startsWith(kind));
    if (!item || !party) return [];
    const taxes = g ? (g.intra ? [`${dir}CGST`, `${dir}SGST`] : [`${dir}IGST`]).map((id) => lines.find((l) => l.accountId === id)?.amount ?? 0) : [];
    return [{ date, label: resolveAccount(party.accountId).name, amounts: g ? [item.amount, ...taxes, party.amount] : [item.amount] }];
  });
}

/** The Purchases Book or the Sales Book of a month, with its GST columns when the month has GST. */
function dayBook(c: Chain, g: Gst | null, purchases: boolean, detailsOf?: (date: string) => string[] | undefined): CaseStatementParts | null {
  const rows = bookRowsOf(c.all, purchases, g);
  if (rows.length < (g ? 2 : 3)) return null;
  const book = purchases ? 'Purchases Book' : 'Sales Book';
  const party = purchases ? 'supplier' : 'customer';
  const when = `${c.b.month} ${yearOf(c.b)}`;
  const taxNames = g ? (g.intra ? ['CGST', 'SGST'] : ['IGST']).map((k) => `${purchases ? 'Input' : 'Output'} ${k}`) : [];
  const columnTotal = (k: number) => sum(rows.map((r) => r.amounts[k]));
  const out = c.all.filter((t) => !rows.some((r) => r.date === t.date));
  const others = [...new Set(c.all.flatMap((t) => t.lines.filter((l) => l.accountId.startsWith(purchases ? 'debtor:' : 'creditor:')).map((l) => resolveAccount(l.accountId).name)))];
  return {
    task: g
      ? `Prepare the ${book} of ${c.b.owner} for ${when}. Enter each credit invoice of goods against the ${party}, filling every column: its taxable value, its ${taxNames.join(' and ')}, and its Total (taxable value plus tax).`
      : `Prepare the ${book} of ${c.b.owner} for ${when}. Enter each credit invoice of goods against the ${party}${detailsOf ? ', at its amount after trade discount' : ''}.`,
    title: `${book} of ${c.b.owner} for ${when}`,
    heading: `Particulars (${party})`,
    ...(g ? { columns: gstColumns(g, purchases) } : {}),
    rows: rows.map((r) => {
      const details = detailsOf?.(r.date);
      return { date: r.date, label: r.label, ...(g ? { amounts: r.amounts } : { amount: r.amounts[0] }), ...(details ? { details } : {}) };
    }),
    distractors: [purchases ? 'Purchases A/c' : 'Sales A/c', purchases ? 'Purchases Return A/c' : 'Sales Return A/c', purchases ? 'Cash purchases' : 'Cash sales', ...others],
    explanation: [
      `The ${book} takes only goods ${purchases ? 'bought' : 'sold'} on credit: each invoice is entered against the ${party}${g ? ' at its taxable value, with the tax on it and the total' : ''}.`,
      ...rows.map((r) =>
        g
          ? g.intra
            ? `${r.date}, ${r.label}: taxable value ${F(r.amounts[0])}; ${taxNames[0]} = ${g.rate / 2}% of ${F(r.amounts[0])} = ${F(r.amounts[1])}, and ${taxNames[1]} the same; Total = ${F(r.amounts[0])} + ${F(r.amounts[1])} + ${F(r.amounts[2])} = ${F(r.amounts[3])}.`
            : `${r.date}, ${r.label}: taxable value ${F(r.amounts[0])}; ${taxNames[0]} = ${g.rate}% of ${F(r.amounts[0])} = ${F(r.amounts[1])}; Total = ${F(r.amounts[0])} + ${F(r.amounts[1])} = ${F(r.amounts[2])}.`
          : `${r.date}, ${r.label}: ${detailsOf?.(r.date) ? `${detailsOf(r.date)!.join(', ').replace('Less:', 'less')}; entered at ${F(r.amounts[0])}` : F(r.amounts[0])}.`,
      ),
      `Left out: ${out.map((t) => `${t.date} (${t.brief.charAt(0).toLowerCase()}${t.brief.slice(1)})`).join('; ')}. ${purchases ? 'A purchase paid for by cheque goes to the Cash Book, and goods sent back to a supplier to the Purchases Return Book.' : 'A sale paid for by cheque goes to the Cash Book, and goods a customer sends back to the Sales Return Book.'}`,
      g
        ? `Taxable value column ${F(columnTotal(0))}, posted to the ${purchases ? 'debit of Purchases A/c' : 'credit of Sales A/c'}; each tax column to the ${purchases ? 'debit' : 'credit'} of its own account; each ${party} is ${purchases ? 'credited' : 'debited'} with the Total of its own invoice.`
        : `Total ${F(columnTotal(0))}, posted to the ${purchases ? 'debit of Purchases A/c' : 'credit of Sales A/c'}; each ${party} is ${purchases ? 'credited' : 'debited'} with its own invoice.`,
    ],
    hints: [
      `Go down the month and ask of each transaction: are goods ${purchases ? 'bought' : 'sold'} on credit? Only those are entered in the ${book}.`,
      g ? `${g.intra ? 'CGST and SGST are each half the GST rate' : 'IGST is the full GST rate'} on the taxable value, and the Total is the taxable value plus the tax: what the ${party} ${purchases ? 'is owed' : 'owes'}.` : 'Each invoice is entered at its amount, against the party.',
    ],
  };
}

/** A day book of a case, worked again from the entries read back from the case text. */
function dayBookRead(q: StatementQuestion): boolean {
  const read = readBooks(q.data);
  const purchases = q.title.startsWith('Purchases Book');
  if (!read || (!purchases && !q.title.startsWith('Sales Book'))) return false;
  const g = gstOf(q.data);
  const want = bookRowsOf(read.entries, purchases, g).map((r) => `${r.label}|${r.amounts.join('|')}`).sort();
  const got = q.rows.map((r) => `${r.label}|${r.amounts.join('|')}`).sort();
  // Every row adds up across: the Total is the taxable value and the tax.
  const across = !g || q.rows.every((r) => sum(r.amounts.slice(0, -1)) === r.amounts.at(-1));
  return across && want.length >= 2 && want.join('\n') === got.join('\n');
}

const gstBooksChain = caseTemplate<{ chain: Chain; g: Gst; city: string; state: string; first: 'Sales Book' | 'Purchases Book' }>({
  id: 'case-books-chain-gst-day-books',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'GST day books, a ledger account and the trial balance',
  setup: (rng) => {
    const b = business(rng);
    const [city, state] = rng.pick(CITIES);
    const g: Gst = { rate: rng.pick([5, 18]), intra: rng.pick([true, false]) };
    const [s1, s2] = rng.shuffle(SUPPLIERS);
    const [c1, c2] = rng.shuffle(CUSTOMERS);
    const capital = amount(rng, 300000, 600000, 50000);
    // Three credit invoices in each book, no two alike; the purchases are the larger, as a new shop stocks up first.
    const [buy1, buy2, buy3] = rng.shuffle([16, 17, 18, 19, 20, 22, 24, 26]).slice(0, 3).map((k) => rupees(k * 5000));
    const [sell1, sell2, sell3] = rng.shuffle([8, 9, 10, 11, 12, 13, 14, 15]).slice(0, 3).map((k) => rupees(k * 5000));
    const withTax = (x: Paise) => x + gstOn(g, x);
    const back = rng.pick(['out', 'in'] as const);
    const returned = amount(rng, 4000, 10000, 2000);
    // The party asked for has two invoices, so that its account has rows enough: the first supplier or the first customer.
    const askSupplier = rng.pick([true, false]);
    const buys = [cs.gstBuy(g, buy1, s1), cs.gstBuy(g, buy2, askSupplier ? s1 : s2), cs.gstBuy(g, buy3, s2)];
    const sells = [cs.gstSell(g, sell1, c1), cs.gstSell(g, sell2, askSupplier ? c2 : c1), cs.gstSell(g, sell3, c2)];
    const owedTo = withTax(buy1) + (askSupplier ? withTax(buy2) : 0) - (back === 'out' ? withTax(returned) : 0);
    const owedBy = withTax(sell1) + (askSupplier ? 0 : withTax(sell2)) - (back === 'in' ? withTax(returned) : 0);
    const paid = partOf(rng, owedTo);
    const received = partOf(rng, owedBy);
    if (paid <= 0 || received <= 0) return null;
    // Goods bought or sold against a cheque, which the day books leave to the Cash Book.
    const chequeAmount = rupees(rng.pick([5, 6, 7]) * 5000);
    const cheque = rng.pick([cs.gstBuy(g, chequeAmount, null), cs.gstSell(g, chequeAmount, null)]);
    const steps = order(
      rng,
      [cs.capital('bank', capital), buys[0]],
      askSupplier
        ? [
            [buys[1], ...(back === 'out' ? [cs.gstReturnOut(g, returned, s1)] : []), cs.paySupplier(s1, paid, 0)],
            [sells[0], ...(back === 'in' ? [cs.gstReturnIn(g, returned, c1)] : []), cs.receive(c1, received, 0)],
            [buys[2]],
            [sells[1], sells[2]],
            [rng.pick([cs.expense(SALARIES, 'bank', amount(rng, 8000, 20000, 1000)), cs.drawings(b.owner, 'bank', amount(rng, 5000, 12000, 1000))])],
            [cheque],
          ]
        : [
            [...(back === 'out' ? [cs.gstReturnOut(g, returned, s1)] : []), cs.paySupplier(s1, paid, 0)],
            [sells[0], sells[1], ...(back === 'in' ? [cs.gstReturnIn(g, returned, c1)] : []), cs.receive(c1, received, 0)],
            [buys[1], buys[2]],
            [sells[2]],
            [rng.pick([cs.expense(SALARIES, 'bank', amount(rng, 8000, 20000, 1000)), cs.drawings(b.owner, 'bank', amount(rng, 5000, 12000, 1000))])],
            [cheque],
          ],
    );
    if (!steps) return null;
    const all = onDays(rng, b, steps);
    const tb = trialBalanceOf(all);
    if (tb.rows.length > 16) return null;
    const id = askSupplier ? creditor(s1) : debtor(c1);
    const taxes = (d: 'Input' | 'Output') => (g.intra ? [`${d} CGST A/c`, `${d} SGST A/c`] : [`${d} IGST A/c`]);
    const account = ask(b, all, id, {
      bringDown: true,
      least: 4,
      natural: askSupplier ? 'Cr' : 'Dr',
      distractors: [...(askSupplier ? ['Sales A/c', 'Sales Return A/c', 'Cash A/c'] : ['Purchases A/c', 'Purchases Return A/c', 'Cash A/c']), ...taxes(askSupplier ? 'Output' : 'Input')],
      leftOut: 'The particulars never repeat the name of the account itself: they name the other account of the entry, and an invoice gives a row for the goods and a row for each tax.',
    });
    if (!account) return null;
    const text = [
      `${b.owner} opened ${b.shop} in ${city}, ${state}, on ${firstDay(b)}, and keeps a Purchases Book and a Sales Book with GST columns. All goods carry GST at ${g.rate}%.`,
      g.intra
        ? `Every purchase and sale is within ${state} (intra-State): CGST and SGST at ${g.rate / 2}% each.`
        : `Every purchase and sale is with a party outside ${state} (inter-State): IGST at ${g.rate}%.`,
      'No GST is set off or paid in the month. Cheques received are banked the same day.',
      ...all.map((t) => `${t.date}: ${t.text}`),
    ].join('\n');
    return { chain: { b, text, all, month: all, openings: new Map(), asked: [account], tb }, g, city, state, first: rng.pick(['Sales Book', 'Purchases Book'] as const) };
  },
  context: (s) => s.chain.text,
  parts: [
    { kind: 'statement', make: (s) => dayBook(s.chain, s.g, s.first === 'Purchases Book'), verify: dayBookRead },
    { kind: 'statement', make: (s) => dayBook(s.chain, s.g, s.first !== 'Purchases Book'), verify: dayBookRead },
    { kind: 'account', make: (s) => accountPart(s.chain, 0), verify: accountRead },
    { kind: 'statement', make: (s) => tbPart(s.chain), verify: trialBalanceRead },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// The opening balances, the cash book and the bank, shared by the cases that start from a business already running
// ---------------------------------------------------------------------------------------------------------------

/** A balance a case lists on its first day: the name it is listed under, the account, its side and its amount. */
interface Given {
  label: string;
  accountId: string;
  side: Side;
  amount: Paise;
}
const givenLine = (g: Given): string => `${g.label}: ${F(g.amount)}`;
/** A debtor's or a creditor's balance as a case lists it: "Kiran (debtor)". */
const givenParty = (id: string, amountOf: Paise): Given => ({
  label: `${resolveAccount(id).name} (${id.startsWith('debtor:') ? 'debtor' : 'creditor'})`,
  accountId: id,
  side: id.startsWith('debtor:') ? 'Dr' : 'Cr',
  amount: amountOf,
});

/**
 * The opening entry of the balances a case lists, as a step that comes before the month: every asset debited, every
 * liability credited and capital credited with the difference. It is not printed as a transaction; a case puts it
 * first in `order` so that the story of the month starts from these balances.
 */
function openingStep(given: readonly Given[]): Step | null {
  const capital = net(given.map((x) => (x.side === 'Dr' ? dr(x.accountId, x.amount) : cr(x.accountId, x.amount))));
  if (capital <= 0) return null;
  return {
    key: 'opening',
    text: '',
    brief: 'Opening entry for the balances brought forward',
    lines: [...given.map((x) => (x.side === 'Dr' ? dr(x.accountId, x.amount) : cr(x.accountId, x.amount))), cr('capital', capital)],
    steps: ['Every asset is debited and every liability credited; Capital A/c takes the difference.'],
    distract: [],
  };
}

/** Dealers who sell furniture and equipment to shops on credit. */
const DEALERS = ['Modern Furniture', 'Sagar Furnishers', 'Royal Interiors', 'Prakash Office Systems'];

/** Transactions this stage words for itself (read back by `EXTRA_FORMS`). */
const more = {
  /** Goods sold on credit at a trade discount: the entry is at the price after the discount. */
  saleAtDiscount: (customer: string, list: Paise, pct: number): Step => {
    const net = list - (list * pct) / 100;
    return {
      key: 'creditSale',
      text: `Sold goods to ${customer} on credit, list price ${F(list)} less ${pct}% trade discount.`,
      brief: `Goods sold on credit to ${customer}, at a trade discount`,
      lines: [dr(debtor(customer), net), cr('sales', net)],
      steps: [
        `Trade discount is not entered: ${pct}% of ${F(list)} = ${F(list - net)}, so the sale is ${F(list)} - ${F(list - net)} = ${F(net)}.`,
        `${customer} owes ${F(net)}, so ${poss(customer)} account is debited.`,
        'Goods sold are the income of a trader, so Sales A/c is credited.',
      ],
      distract: ['discountAllowed', 'purchases'],
    };
  },
  /** Goods bought on credit at a trade discount. */
  purchaseAtDiscount: (supplier: string, list: Paise, pct: number): Step => {
    const net = list - (list * pct) / 100;
    return {
      key: 'creditPurchase',
      text: `Bought goods from ${supplier} on credit, list price ${F(list)} less ${pct}% trade discount.`,
      brief: `Goods bought on credit from ${supplier}, at a trade discount`,
      lines: [dr('purchases', net), cr(creditor(supplier), net)],
      steps: [
        `Trade discount is not entered: ${pct}% of ${F(list)} = ${F(list - net)}, so the purchase is ${F(list)} - ${F(list - net)} = ${F(net)}.`,
        'Goods bought for resale are purchases, so Purchases A/c is debited.',
        `${supplier} is owed ${F(net)}, so ${poss(supplier)} account is credited.`,
      ],
      distract: ['discountReceived', 'sales'],
    };
  },
  /** An asset bought on credit from a dealer: an entry of the Journal Proper. */
  assetOnCredit: (asset: { id: string; words: string }, dealer: string, x: Paise): Step => ({
    key: 'assetCredit',
    text: `Bought ${asset.words} for the shop from ${dealer} on credit ${F(x)}.`,
    brief: `${cap(asset.words)} bought on credit from ${dealer}`,
    lines: [dr(asset.id, x), cr(creditor(dealer), x)],
    steps: [`It is bought for use, not for resale, so it is an asset: ${ledgerLabel(asset.id)} is debited.`, `Nothing is paid yet, so ${poss(dealer)} account is credited.`],
    distract: ['purchases'],
  }),
  deposit: (a: Paise): Step => ({
    key: 'depositCash',
    text: `Deposited ${F(a)} of the office cash into the bank.`,
    brief: 'Office cash paid into the bank',
    lines: [dr('bank', a), cr('cash', a)],
    steps: ['The money moves from the cash box into the bank, so Bank A/c is debited.', 'Cash goes out, so Cash A/c is credited.', 'Both accounts are kept in the cash book: it is a contra entry.'],
    distract: ['capital', 'drawings'],
  }),
};

/** `n` different days from `first` to `last`, in order. */
const daysBetween = (rng: Rng, n: number, first: number, last: number): number[] =>
  rng
    .shuffle(Array.from({ length: last - first + 1 }, (_, i) => first + i))
    .slice(0, n)
    .sort((a, b) => a - b);

/** Where a transaction stands in a cash book with cash and bank columns, for the working. */
function cashBookPlace(t: { date: string; lines: JournalLine[] }): string {
  const rows = (['cash', 'bank'] as const).flatMap((column) =>
    t.lines
      .filter((l) => l.accountId === column)
      .map((l) => {
        const other = t.lines.filter((o) => o.side !== l.side);
        const label = other.length === 1 ? accountLabel(other[0].accountId) : 'Sundries';
        return `"${l.side === 'Dr' ? 'To' : 'By'} ${label}" ${F(l.amount)} on the ${l.side === 'Dr' ? 'debit' : 'credit'} side, ${column} column`;
      }),
  );
  const contra = rows.length === 2 && t.lines.every((l) => l.accountId === 'cash' || l.accountId === 'bank');
  return `${t.date}: ${rows.join(', and ')}${contra ? ' (a contra entry, marked C)' : ''}.`;
}

/**
 * A cash book with cash and bank columns, from dated entries and the balances the period opens with, balanced and
 * brought down; null when a column would end overdrawn or two rows of a side could not be told apart.
 */
function doubleCashBook(o: {
  owner: string;
  period: string;
  from: string;
  closeOn: string;
  reopenOn: string;
  entries: readonly Dated[];
  cash: Paise;
  bank: Paise;
  distractors: string[];
}): CaseAccountParts | null {
  const view = cashBook(o.entries, { date: o.from, cash: o.cash, bank: o.bank }, accountLabel);
  if (view.cash?.side !== 'Dr' || view.bank?.side !== 'Dr') return null;
  const sides = cashBookSides(view, { closeOn: o.closeOn, reopenOn: o.reopenOn });
  for (const side of [sides.left, sides.right]) {
    const keys = side.rows.map((r) => `${r.label}|${(r.amounts ?? []).join('|')}`);
    if (new Set(keys).size !== keys.length) return null;
  }
  const used = new Set([...sides.left.rows, ...sides.right.rows].map((r) => r.label));
  return {
    task: `Prepare the double column cash book of ${o.owner}, with cash and bank columns, for ${o.period}, from the dated transactions only. Balance it on ${o.closeOn} and bring the balances down on ${o.reopenOn}.`,
    title: `Double Column Cash Book of ${o.owner}`,
    columns: CASH_BOOK_COLUMNS,
    ...sides,
    distractors: [...new Set(o.distractors)].filter((d) => !used.has(d)),
    explanation: [
      `The opening balances stand first on the debit side, in one row: "To Balance b/d" ${F(o.cash)} in the cash column and ${F(o.bank)} in the bank column.`,
      ...o.entries.filter((t) => t.lines.some((l) => l.accountId === 'cash' || l.accountId === 'bank')).map(cashBookPlace),
      ...o.entries.filter((t) => !t.lines.some((l) => l.accountId === 'cash' || l.accountId === 'bank')).map((t) => `${t.date}: no cash or cheque moves, so it is not in the cash book.`),
      `Cash column: debit side ${F(view.totals.cash)}, so the balance is ${F(view.cash.amount)}: "By Balance c/d" on the credit side, brought down on ${o.reopenOn}.`,
      `Bank column: debit side ${F(view.totals.bank)}, so the balance is ${F(view.bank.amount)}, a favourable balance: "By Balance c/d" on the credit side, brought down on ${o.reopenOn}.`,
    ],
    hints: [
      'For each transaction decide two things: is money coming in or going out, and is it cash or the bank? A transaction with neither is not in the cash book.',
      'Receipts go on the debit side and payments on the credit side; cash goes in the cash column and cheques in the bank column. Cash paid into the bank, or drawn from it for the office, is a contra entry: it is entered on both sides, once in each column.',
    ],
  };
}

/** The balances and the moves of cash and bank a case text gives, read from its wording alone. */
function readCashMoves(text: string): { cash0: Paise; bank0: Paise; moves: { date: string; cash: Paise; bank: Paise }[] } | null {
  const read = readBooks(text);
  if (!read || read.entries.length < 2) return null;
  const [opening, ...rest] = read.entries;
  const of = (lines: readonly JournalLine[], id: string) => net(lines.filter((l) => l.accountId === id));
  return { cash0: of(opening.lines, 'cash'), bank0: of(opening.lines, 'bank'), moves: rest.map((e) => ({ date: e.date, cash: of(e.lines, 'cash'), bank: of(e.lines, 'bank') })) };
}

/**
 * A cash book with cash and bank columns checked against the case text: each column carries on each side what the
 * dated lines add to it and take from it, with the opening balances on the debit side; each balance is carried down
 * and brought down; a contra entry is marked on both sides; and there is one row for every move of cash or bank.
 */
function doubleCashBookRead(q: AccountQuestion): boolean {
  const b = readCashMoves(q.data);
  if (!b || q.columns.length !== 2) return false;
  const [debit, credit] = q.sides;
  const col = (rows: readonly { amounts: number[] }[], c: number) => sum(rows.map((r) => r.amounts[c]));
  const body = (rows: typeof debit.rows) => rows.filter((r) => !r.closing);
  const closing = (rows: typeof debit.rows) => rows.filter((r) => r.closing);
  const cash = b.cash0 + sum(b.moves.map((m) => m.cash));
  const bank = b.bank0 + sum(b.moves.map((m) => m.bank));
  const up = (xs: number[]) => sum(xs.filter((x) => x > 0));
  const down = (xs: number[]) => -sum(xs.filter((x) => x < 0));
  const cashMoves = b.moves.map((m) => m.cash);
  const bankMoves = b.moves.map((m) => m.bank);
  const contras = b.moves.filter((m) => m.cash !== 0 && m.bank !== 0).length;
  const touched = b.moves.filter((m) => m.cash !== 0 || m.bank !== 0).length;
  return (
    cash > 0 &&
    bank > 0 &&
    col(body(debit.rows), 0) === b.cash0 + up(cashMoves) &&
    col(body(credit.rows), 0) === down(cashMoves) &&
    col(body(debit.rows), 1) === b.bank0 + up(bankMoves) &&
    col(body(credit.rows), 1) === down(bankMoves) &&
    col(closing(credit.rows), 0) === cash &&
    col(closing(credit.rows), 1) === bank &&
    closing(debit.rows).length === 0 &&
    col(debit.below, 0) === cash &&
    col(debit.below, 1) === bank &&
    q.sides.every((s) => s.rows.filter((r) => r.contra).length === contras) &&
    body(debit.rows).length + body(credit.rows).length === 1 + touched + contras
  );
}

/** What the bank did first, which the cash book does not show yet: the line of the case, the row of the statement and the entry. */
interface BankItem {
  text: string;
  label: string;
  /** True when it makes the pass book balance more favourable than the cash book balance. */
  up: boolean;
  amount: Paise;
  lines: JournalLine[];
  steps: string[];
  reason: string;
}
const BANK_IN = 'The bank has added the amount to the account: Bank A/c, an asset, is debited.';
const BANK_OUT = 'The bank has taken the amount out of the account: Bank A/c, an asset, is credited.';
const bankItem = {
  charges: (x: Paise): BankItem => ({
    text: `The bank debited ${F(x)} as bank charges.`,
    label: 'Bank charges debited by the bank',
    up: false,
    amount: x,
    lines: [dr('bankCharges', x), cr('bank', x)],
    steps: ['Bank charges are an expense of the business: Bank Charges A/c is debited.', BANK_OUT],
    reason: 'The bank took its charges out of the account; the cash book does not show them yet.',
  }),
  interest: (x: Paise): BankItem => ({
    text: `The bank credited ${F(x)} as interest on the balance in the account.`,
    label: 'Interest credited by the bank',
    up: true,
    amount: x,
    lines: [dr('bank', x), cr('interestReceived', x)],
    steps: [BANK_IN, 'Interest earned is an income: Interest Received A/c is credited.'],
    reason: 'The bank added interest to the account; the cash book does not show it yet.',
  }),
  deposit: (who: string, x: Paise): BankItem => ({
    text: `${who}, a debtor, paid ${F(x)} directly into the bank account of the business.`,
    label: `Direct deposit by ${who}`,
    up: true,
    amount: x,
    lines: [dr('bank', x), cr(debtor(who), x)],
    steps: [BANK_IN, `${who} has paid this much of what was owed, so ${poss(who)} account is credited.`],
    reason: `The bank added the payment by ${who} to the account; the cash book does not show the receipt yet.`,
  }),
  standing: (x: Paise): BankItem => ({
    text: `The bank paid the insurance premium of ${F(x)} on the stock of the business under a standing instruction.`,
    label: 'Payment by the bank on standing instruction',
    up: false,
    amount: x,
    lines: [dr('insurance', x), cr('bank', x)],
    steps: ['Insurance of the stock is an expense of the business: Insurance A/c is debited.', BANK_OUT],
    reason: 'The bank paid the premium out of the account; the cash book does not show the payment yet.',
  }),
};
/** The bank's own items read back by their words: what each does to the bank balance, and the entry it calls for. */
const BANK_ITEM_FORMS: [RegExp, (m: RegExpExecArray) => JournalLine[]][] = [
  [/^The bank debited (₹[\d,]+) as bank charges\.$/, (m) => [dr('bankCharges', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [/^The bank credited (₹[\d,]+) as interest on the balance in the account\.$/, (m) => [dr('bank', toPaise(m[1])), cr('interestReceived', toPaise(m[1]))]],
  [/^(.+), a debtor, paid (₹[\d,]+) directly into the bank account of the business\.$/, (m) => [dr('bank', toPaise(m[2])), cr(debtor(m[1]), toPaise(m[2]))]],
  [/^The bank paid the insurance premium of (₹[\d,]+) on the stock of the business under a standing instruction\.$/, (m) => [dr('insurance', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
  [/^The bank debited (₹[\d,]+) as interest on the overdraft\.$/, (m) => [dr('interestPaid', toPaise(m[1])), cr('bank', toPaise(m[1]))]],
];
const readBankItem = (text: string): JournalLine[] | null => {
  const fits = BANK_ITEM_FORMS.flatMap(([re, lines]) => {
    const m = re.exec(text);
    return m ? [lines(m)] : [];
  });
  return fits.length === 1 ? fits[0] : null;
};

/** The comparison lines of a case: the cheques the bank had not dealt with, and the bank's own items, read back. */
function readComparison(text: string): { cheques: { issued: boolean; who: string; amount: Paise }[]; items: { text: string; lines: JournalLine[] }[] } | null {
  const read = readBooks(text);
  if (!read) return null;
  const cheques: { issued: boolean; who: string; amount: Paise }[] = [];
  const items: { text: string; lines: JournalLine[] }[] = [];
  for (const row of text.split('\n')) {
    const bullet = /^• (.+)$/.exec(row)?.[1];
    if (!bullet) continue;
    const cheque = /^The cheque (paid to|received from) (.+) on (\d{1,2} [A-Z][a-z]+) had not been (presented for payment|collected by the bank)\.$/.exec(bullet);
    if (cheque) {
      const entry = read.entries.find((e) => e.date === cheque[3]);
      const issued = cheque[1] === 'paid to';
      const bank = entry?.lines.find((l) => l.accountId === 'bank' && l.side === (issued ? 'Cr' : 'Dr'));
      const party = entry?.lines.find((l) => l.accountId === (issued ? creditor(cheque[2]) : debtor(cheque[2])));
      if (!bank || !party || issued !== (cheque[4] === 'presented for payment')) return null;
      cheques.push({ issued, who: cheque[2], amount: bank.amount });
      continue;
    }
    // A cheque deposited and dishonoured: the bank takes back what the cash book had added, and the customer owes it again.
    const returned = /^The cheque received from (.+) on (\d{1,2} [A-Z][a-z]+) was returned unpaid by the bank\.$/.exec(bullet);
    if (returned) {
      const entry = read.entries.find((e) => e.date === returned[2]);
      const bank = entry?.lines.find((l) => l.accountId === 'bank' && l.side === 'Dr');
      if (!bank || !entry?.lines.some((l) => l.accountId === debtor(returned[1]) && l.side === 'Cr')) return null;
      items.push({ text: bullet, lines: [dr(debtor(returned[1]), bank.amount), cr('bank', bank.amount)] });
      continue;
    }
    const lines = readBankItem(bullet);
    if (!lines) return null;
    items.push({ text: bullet, lines });
  }
  return { cheques, items };
}

/** The statement from the balance the bank column ends on, checked against the case text read line by line. */
function chainBrsRead(q: StatementQuestion): boolean {
  const moves = readCashMoves(q.data);
  const c = readComparison(q.data);
  if (!moves || !c || !q.final) return false;
  const start = moves.bank0 + sum(moves.moves.map((m) => m.bank));
  const want = [
    ...c.cheques.map((x) => ({ label: BRS_CHAIN.chequeLabel(x.issued, x.who), amounts: x.issued ? [x.amount, 0] : [0, x.amount] })),
    // The bank's own items: what goes into the bank raises the pass book balance (Plus), what comes out lowers it (Minus).
    ...c.items.map((i) => {
      const bank = net(i.lines.filter((l) => l.accountId === 'bank'));
      return { label: '', amounts: bank > 0 ? [bank, 0] : [0, -bank] };
    }),
  ];
  const end = start + sum(want.map((w) => w.amounts[0] - w.amounts[1]));
  const first = q.rows.filter((r) => r.label === BRS_CHAIN.balanceLabel('cb', start));
  if (start <= 0 || end <= 0 || first.length !== 1 || first[0].amounts[0] !== start || q.rows.length !== want.length + 1) return false;
  const rest = q.rows.filter((r) => r !== first[0]);
  const chequesHold = want.filter((w) => w.label).every((w) => rest.filter((r) => r.label === w.label && r.amounts.join() === w.amounts.join()).length === 1);
  const others = rest.filter((r) => !want.some((w) => w.label === r.label)).map((r) => r.amounts.join()).sort();
  const items = want.filter((w) => !w.label).map((w) => w.amounts.join()).sort();
  return chequesHold && others.join('|') === items.join('|') && q.final.amount === end && q.final.label === BRS_CHAIN.balanceLabel('pb', end);
}

/** The entries for the bank's own items, checked against the items as read back from the case text. */
function bankItemSetRead(q: JournalSetQuestion): boolean {
  const c = readComparison(q.context ?? '');
  if (!c || c.items.length !== q.entries.length) return false;
  return q.entries.every((e) => {
    const item = c.items.find((i) => i.text === e.text);
    return !!item && linesKey(item.lines) === linesKey(e.expected);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Chain 3. A fortnight in the double column cash book, the bank reconciliation statement on its last day, and the
// entries for what the bank did first (medium)
// ---------------------------------------------------------------------------------------------------------------

interface Fortnight {
  b: Business;
  given: Given[];
  all: Dated[];
  cash0: Paise;
  bank0: Paise;
  /** The cheques of the fortnight with a party, and whether the bank had dealt with each by the last day. */
  cheques: { issued: boolean; who: string; amount: Paise; date: string; out: boolean }[];
  items: BankItem[];
  bankEnd: Paise;
  text: string;
  lures: string[];
}

const fortnightChain = caseTemplate<Fortnight>({
  id: 'case-books-chain-fortnight-bank',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A fortnight in the cash book, the bank statement and its entries',
  setup: (rng) => {
    const b = business(rng);
    const [d1, d2] = rng.shuffle(CUSTOMERS);
    const [c1, c2] = rng.shuffle(SUPPLIERS);
    const cash0 = amount(rng, 10000, 30000, 1000);
    const bank0 = amount(rng, 60000, 150000, 5000);
    const owed = [amount(rng, 25000, 60000, 1000), amount(rng, 15000, 40000, 1000)];
    const owing = [amount(rng, 30000, 70000, 1000), amount(rng, 15000, 40000, 1000)];
    const given: Given[] = [
      { label: 'Cash', accountId: 'cash', side: 'Dr', amount: cash0 },
      { label: 'Bank', accountId: 'bank', side: 'Dr', amount: bank0 },
      { label: 'Stock', accountId: 'stock', side: 'Dr', amount: amount(rng, 40000, 120000, 5000) },
      givenParty(debtor(d1), owed[0]),
      givenParty(debtor(d2), owed[1]),
      givenParty(creditor(c1), owing[0]),
      givenParty(creditor(c2), owing[1]),
    ];
    const opening = openingStep(given);
    if (!opening) return null;
    // Two cheques received from debtors and two paid to creditors, all of different amounts; the rest of the fortnight
    // in cash, by cheque without a party, and one contra entry.
    const got = [partOf(rng, owed[0]), partOf(rng, owed[1])];
    const paid = [partOf(rng, owing[0]), partOf(rng, owing[1])];
    if (new Set([...got, ...paid]).size < 4 || got.some((x) => x <= 0) || paid.some((x) => x <= 0)) return null;
    const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
    const contra = rng.pick([more.deposit(amount(rng, 5000, 15000, 1000)), cs.office(amount(rng, 5000, 15000, 1000))]);
    const fillers = rng.shuffle([
      cs.goodsSold('cash', amount(rng, 8000, 30000, 1000)),
      cs.goodsBought('cash', amount(rng, 5000, 20000, 1000)),
      cs.expense(e, rng.pick(['cash', 'bank'] as const), pickAmount(rng, e)),
      cs.drawings(b.owner, rng.pick(['cash', 'bank'] as const), amount(rng, 3000, 8000, 1000)),
      cs.goodsSold('bank', amount(rng, 10000, 40000, 1000)),
    ]).slice(0, rng.pick([3, 4]));
    const stock = given.find((g) => g.accountId === 'stock')!.amount;
    const threads = [[cs.receive(d1, got[0], 0)], [cs.receive(d2, got[1], 0)], [cs.paySupplier(c1, paid[0], 0)], [cs.paySupplier(c2, paid[1], 0)], [contra], ...fillers.map((f) => [f])];
    const steps = order(rng, [opening], threads, { cash: 0, bank: 0 }, stock);
    if (!steps) return null;
    const days = daysBetween(rng, steps.length - 1, 2, 14);
    const all: Dated[] = steps.slice(1).map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    // The bank had not yet paid one of the cheques issued, or collected one of the cheques received: one of each,
    // among the last of the fortnight.
    const party = (t: Dated) => partyLine(t)!;
    const cheques = all
      .filter((t) => t.key === 'paySupplier' || t.key === 'receiveFromCustomer')
      .map((t) => ({ issued: t.key === 'paySupplier', who: resolveAccount(party(t).accountId).name, amount: party(t).amount, date: t.date, out: false }));
    const lastOf = (issued: boolean) => cheques.filter((x) => x.issued === issued).at(-1)!;
    lastOf(true).out = true;
    lastOf(false).out = true;
    // Three things the bank did first; a direct deposit is by the debtor whose cheque the bank had already collected.
    const settled = cheques.find((x) => !x.issued && !x.out)!;
    const room = given.find((g) => g.accountId === debtor(settled.who))!.amount - settled.amount;
    const kinds = rng.shuffle(['charges', 'interest', 'deposit', 'standing'] as const).slice(0, 3);
    const items = kinds.map((k) =>
      k === 'charges'
        ? bankItem.charges(amount(rng, 200, 1500, 50))
        : k === 'interest'
          ? bankItem.interest(amount(rng, 300, 2500, 50))
          : k === 'deposit'
            ? bankItem.deposit(settled.who, Math.min(room, amount(rng, 3000, 9000, 500)))
            : bankItem.standing(amount(rng, 1500, 6000, 100)),
    );
    if (items.some((i) => i.amount <= 0) || new Set(items.map((i) => i.amount)).size < 3) return null;
    const bankEnd = bank0 + sum(all.map((t) => net(t.lines.filter((l) => l.accountId === 'bank'))));
    const closeOn = `15 ${b.month}`;
    const text = [
      `${b.owner} runs ${b.shop} and keeps a cash book with cash and bank columns. Cheques received are banked the same day.`,
      `Balances on 1 ${b.month} ${yearOf(b)} (capital is the balancing figure):`,
      ...given.map(givenLine),
      `Transactions from 2 to 14 ${b.month}:`,
      ...all.map((t) => `${t.date}: ${t.text}`),
      `On ${closeOn} the bank column was compared with the pass book:`,
      ...cheques.filter((x) => x.out).map((x) => `• The cheque ${x.issued ? 'paid to' : 'received from'} ${x.who} on ${x.date} had not been ${x.issued ? 'presented for payment' : 'collected by the bank'}.`),
      ...items.map((i) => `• ${i.text}`),
      'None of the bank items above is in the cash book yet; nothing else keeps the two books apart.',
    ].join('\n');
    const lures = [
      ...cheques.filter((x) => !x.out).map((x) => BRS_CHAIN.chequeLabel(x.issued, x.who)),
      ...[bankItem.charges(1), bankItem.interest(1), bankItem.standing(1)].map((i) => i.label).filter((l) => !items.some((i) => i.label === l)),
    ];
    return { b, given, all, cash0, bank0, cheques, items, bankEnd, text, lures };
  },
  context: (s) => s.text,
  parts: [
    {
      kind: 'account',
      make: (s) =>
        doubleCashBook({
          owner: s.b.owner,
          period: `1 to 15 ${s.b.month}`,
          from: `1 ${s.b.month}`,
          closeOn: `15 ${s.b.month}`,
          reopenOn: `16 ${s.b.month}`,
          entries: s.all,
          cash: s.cash0,
          bank: s.bank0,
          distractors: ['Bank Charges A/c', 'Interest Received A/c', 'Capital A/c', 'Stock A/c', 'Balance b/d'],
        }),
      verify: doubleCashBookRead,
    },
    {
      kind: 'statement',
      make: (s) => {
        const out = s.cheques.filter((x) => x.out);
        const settled = s.cheques.filter((x) => !x.out);
        return chainStatement({
          firm: s.b.owner,
          date: `15 ${s.b.month} ${yearOf(s.b)}`,
          start: s.bankEnd,
          startIs: 'the balance as per cash book (the balance the bank column ends on)',
          endOf: 'the bank column of the cash book',
          rows: [
            ...out.map((x) => ({
              label: BRS_CHAIN.chequeLabel(x.issued, x.who),
              up: x.issued,
              amount: x.amount,
              reason: x.issued
                ? `The bank had not paid it by 15 ${s.b.month}. The cash book has deducted it and the pass book has not.`
                : `The bank had not collected it by 15 ${s.b.month}. The cash book has added it and the pass book has not.`,
            })),
            ...s.items.map((i) => ({ label: i.label, up: i.up, amount: i.amount, reason: i.reason })),
          ],
          leftOut: `Left out: ${settled.map((x) => `the cheque ${x.issued ? 'to' : 'from'} ${x.who}`).join('; ')}, and every other entry of the bank column. The bank had dealt with them by 15 ${s.b.month}, so both books show them.`,
          lures: s.lures,
          choose: false,
          perCheque: true,
          hints: [
            'Which cheques had the bank not yet paid or collected on the last day? Only those, and what the bank did on its own, keep the two books apart.',
            'A cheque issued but not yet presented is still in the bank, so the pass book balance is higher: Plus column. A cheque deposited but not yet cleared is not yet in the bank, so the pass book balance is lower: Minus column. What the bank has added and the cash book has not goes in the Plus column; what the bank has taken out, in the Minus column.',
          ],
        });
      },
      verify: chainBrsRead,
    },
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: 'Pass the entries needed to bring the cash book up to date for the bank items.',
        transactions: s.items.map((i, k) => ({ label: `(${['i', 'ii', 'iii', 'iv'][k]})`, text: i.text, lines: i.lines, explanation: i.steps })),
        distractorAccounts: ['cash', 'sales', 'interestPaid', 'commissionReceived', 'drawings'],
        hints: [
          'Take the items one at a time. Because of it, is the bank balance in the cash book too high or too low?',
          'Bank A/c is debited when its balance has to rise and credited when it has to fall. The other account is the party, the income or the expense the item names.',
        ],
      }),
      verify: bankItemSetRead,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 4. A journal posted with errors: one account as it should have been posted, the rectifying entries and the
// Suspense A/c (complex)
// ---------------------------------------------------------------------------------------------------------------

/** An error in posting a printed journal: the entry is named, and an entry left out was not posted at all. */
const asPosting = (f: Fault): Fault =>
  f.group === 'omitted'
    ? { ...f, text: f.text.replace(/^The transaction of (.+) was not entered in the books at all\.$/, 'The entry of $1 was not posted to the ledger at all.') }
    : { ...f, text: f.text.replace(/^The transaction of /, 'The entry of ') };

const journalErrors = caseTemplate<ErrorChain>({
  id: 'case-books-chain-journal-posting-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'A journal posted with errors: an account, the corrections, Suspense',
  setup: (rng) => {
    const b = business(rng);
    const m = creditMonth(rng, b, true);
    if (!m) return null;
    const { all } = m;
    const { ones, twos } = monthMakers(rng, m);
    const drawn = drawFaults(rng, all.slice(1), [
      { makers: ones, count: rng.pick([2, 3]) },
      { makers: twos, count: 1 },
    ]);
    if (!drawn) return null;
    const faults = rng.shuffle(drawn).map(asPosting);
    if (sum(faults.map(tbNet)) === 0) return null;
    // The account asked for is one the errors left wrong, so that it has to be posted from the journal as it stands.
    const wrongParties = [...new Set(faults.flatMap((f) => rectifyingEntry(f).map((l) => l.accountId)).filter((id) => id.startsWith('debtor:') || id.startsWith('creditor:')))];
    const candidates = [...rng.shuffle(wrongParties), ...rng.shuffle([debtor(m.customer), creditor(m.supplier)])];
    let asked = null;
    for (const id of candidates) {
      asked = ask(b, all, id, {
        bringDown: true,
        least: 3,
        natural: id.startsWith('debtor:') ? 'Dr' : 'Cr',
        distractors: id.startsWith('creditor:') ? ['Sales A/c', 'Sales Return A/c', 'Discount Allowed A/c', 'Cash A/c', 'Suspense A/c'] : ['Purchases A/c', 'Purchases Return A/c', 'Discount Received A/c', 'Cash A/c', 'Suspense A/c'],
        leftOut: 'The account is posted from the journal as it stands: the errors of the clerk play no part in it.',
      });
      if (asked) break;
    }
    if (!asked) return null;
    asked = { ...asked, task: `${asked.task} Post it from the journal as it stands, free of the errors listed.` };
    const text = [
      `Journal of ${poss(b.owner)} ${b.shop.replace(/^an? /, '')}, opened on ${firstDay(b)} (narrations are left out):`,
      ...all.map(journalLine),
      `A clerk posted this journal to the ledger. The trial balance on ${monthEnd(b)} did not agree, and the difference was put to a Suspense A/c. These errors in posting were then found; together they account for the whole difference:`,
      ...faults.map((x, i) => `${tag(i)} ${x.text}`),
    ].join('\n');
    return { chain: { b, text, all, month: all, openings: new Map(), asked: [asked], tb: trialBalanceOf(all) }, faults };
  },
  context: (s) => s.chain.text,
  parts: [
    { kind: 'account', make: (s) => accountPart(s.chain, 0), verify: accountRead },
    { kind: 'journal_set', make: (s) => rectifyingSet(s.faults, true), verify: verifyRectifyingSet },
    {
      kind: 'account',
      make: (s) => {
        const made = ROE_CHAIN.suspense(s.chain.b.owner, s.faults.map(toRoe), -sum(s.faults.map(tbNet)), 'find', monthEnd(s.chain.b));
        return made && { ...made, task: `Prepare the Suspense A/c and find the difference in the trial balance with which it was opened. Enter that difference as "${ROE_CHAIN.difference}".` };
      },
      verify: verifySuspenseFound,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 5. A month of credit dealings at trade discount: the Sales Book, the Purchases Book and the account of a
// customer or a supplier (medium)
// ---------------------------------------------------------------------------------------------------------------

interface DiscountMonth {
  chain: Chain;
  /** The list price and the trade discount of each invoice that has one, by its date. */
  listed: Map<string, { list: Paise; pct: number }>;
  first: 'Sales Book' | 'Purchases Book';
}

const discountBooksChain = caseTemplate<DiscountMonth>({
  id: 'case-books-chain-trade-discount-books',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'Day books at trade discount, then a ledger account',
  setup: (rng) => {
    const b = business(rng);
    const [s1, s2] = rng.shuffle(SUPPLIERS);
    const [c1, c2] = rng.shuffle(CUSTOMERS);
    const dealer = rng.pick(DEALERS);
    const capital = amount(rng, 300000, 600000, 50000);
    // Three invoices in each book, one or two of them at a trade discount; the party asked for has two invoices.
    const askSupplier = rng.pick([true, false]);
    const lists = rng.shuffle([20, 25, 30, 35, 40, 45, 50, 60, 70, 80]).slice(0, 6).map((k) => rupees(k * 1000));
    const pcts = [0, 0, 0, 0, 0, 0].map(() => (rng.int(1, 5) <= 2 ? rng.pick([10, 20, 25]) : 0));
    if (!pcts.slice(0, 3).some((p) => p > 0)) pcts[rng.int(0, 2)] = rng.pick([10, 20]);
    if (!pcts.slice(3).some((p) => p > 0)) pcts[rng.int(3, 5)] = rng.pick([10, 20]);
    const buy = (who: string, k: number) => (pcts[k] > 0 ? more.purchaseAtDiscount(who, lists[k], pcts[k]) : cs.creditPurchase(who, lists[k]));
    const sell = (who: string, k: number) => (pcts[k] > 0 ? more.saleAtDiscount(who, lists[k], pcts[k]) : cs.creditSale(who, lists[k]));
    // Purchases are larger than sales in a new shop: the purchase invoices are the three largest lists, doubled.
    const sorted = [...lists].sort((x, y) => y - x);
    for (let k = 0; k < 6; k++) lists[k] = k < 3 ? sorted[k] * 2 : sorted[k];
    const buys = [buy(s1, 0), buy(askSupplier ? s1 : s2, 1), buy(s2, 2)];
    const sells = [sell(c1, 3), sell(askSupplier ? c2 : c1, 4), sell(c2, 5)];
    const net = (k: number) => lists[k] - (lists[k] * pcts[k]) / 100;
    // The party asked for returns goods, or has them returned: its account has four items besides the balance.
    const back = askSupplier ? 'out' : 'in';
    const returned = amount(rng, 2000, 6000, 500);
    const owedTo = net(0) + (askSupplier ? net(1) : 0) - (back === 'out' ? returned : 0);
    const owedBy = net(3) + (askSupplier ? 0 : net(4)) - (back === 'in' ? returned : 0);
    const paid = partOf(rng, owedTo);
    const received = partOf(rng, owedBy);
    if (paid <= 0 || received <= 0 || new Set([0, 1, 2, 3, 4, 5].map(net)).size < 6) return null;
    const asset = rng.pick(ASSETS);
    const steps = order(
      rng,
      [cs.capital('bank', capital), buys[0]],
      [
        [...(askSupplier ? [buys[1]] : []), ...(back === 'out' ? [cs.returnOut(s1, returned)] : []), cs.paySupplier(s1, paid, 0)],
        [sells[0], ...(askSupplier ? [] : [sells[1]]), ...(back === 'in' ? [cs.returnIn(c1, returned)] : []), cs.receive(c1, received, 0)],
        askSupplier ? [buys[2]] : [buys[1], buys[2]],
        askSupplier ? [sells[1], sells[2]] : [sells[2]],
        [more.assetOnCredit(asset, dealer, pickAmount(rng, asset))],
        [rng.pick([cs.goodsSold('bank', amount(rng, 10000, 30000, 1000)), cs.goodsBought('bank', amount(rng, 10000, 30000, 1000))])],
      ],
    );
    if (!steps) return null;
    const all = onDays(rng, b, steps);
    const listed = new Map<string, { list: Paise; pct: number }>();
    for (const t of all) {
      const m = /list price (₹[\d,]+) less (\d+)% trade discount/.exec(t.text);
      if (m) listed.set(t.date, { list: toPaise(m[1]), pct: Number(m[2]) });
    }
    const id = askSupplier ? creditor(s1) : debtor(c1);
    const account = ask(b, all, id, {
      bringDown: true,
      least: 4,
      natural: askSupplier ? 'Cr' : 'Dr',
      distractors: askSupplier ? ['Sales A/c', 'Sales Return A/c', 'Discount Received A/c', 'Cash A/c'] : ['Purchases A/c', 'Purchases Return A/c', 'Discount Allowed A/c', 'Cash A/c'],
      leftOut: 'A trade discount is never entered in an account: the party is debited or credited with the price after it.',
    });
    if (!account) return null;
    const text = [
      `${b.owner} opened ${b.shop} on ${firstDay(b)} and keeps a Purchases Book, a Sales Book and a Journal Proper beside the cash book. Ignore GST.`,
      `Invoices are entered after trade discount, and goods returned at the price charged for them. Cheques received are banked the same day.`,
      ...all.map((t) => `${t.date}: ${t.text}`),
    ].join('\n');
    return { chain: { b, text, all, month: all, openings: new Map(), asked: [account], tb: trialBalanceOf(all) }, listed, first: rng.pick(['Sales Book', 'Purchases Book'] as const) };
  },
  context: (s) => s.chain.text,
  parts: [
    { kind: 'statement', make: (s) => dayBook(s.chain, null, s.first === 'Purchases Book', (d) => discountDetails(s.listed.get(d))), verify: dayBookRead },
    { kind: 'statement', make: (s) => dayBook(s.chain, null, s.first !== 'Purchases Book', (d) => discountDetails(s.listed.get(d))), verify: dayBookRead },
    { kind: 'account', make: (s) => accountPart(s.chain, 0), verify: ledgerAccountRead },
  ],
});

/** The lines shown under an invoice at a trade discount: its list price and the discount taken off. */
const discountDetails = (x: { list: Paise; pct: number } | undefined): string[] | undefined =>
  x ? [`List price ${F(x.list)}`, `Less: Trade discount ${x.pct}% ${F((x.list * x.pct) / 100)}`] : undefined;

// ---------------------------------------------------------------------------------------------------------------
// Chain 6. A new shop through the accounting equation, then its journal, then Cash A/c (medium)
// ---------------------------------------------------------------------------------------------------------------

const EQ_COLUMNS = [
  { name: 'Cash and bank (₹)', signed: true },
  { name: 'Other assets (₹)', signed: true },
  { name: 'Liabilities (₹)', signed: true },
  { name: 'Capital (₹)', signed: true },
];
/** The column of the equation table an account of the equation belongs to. */
const eqColumn = (id: string): number => (id === 'cash' || id === 'bank' ? 0 : termOf(id) === 'assets' ? 1 : termOf(id) === 'liabilities' ? 2 : 3);
/** The change a transaction makes in each column: an asset rises with a debit, a liability or capital with a credit. */
const eqRow = (eq: readonly JournalLine[]): Paise[] => {
  const row = [0, 0, 0, 0];
  for (const l of eq) row[eqColumn(l.accountId)] += (eqColumn(l.accountId) < 2 ? 1 : -1) * signed(l);
  return row;
};

interface EquationChain {
  b: Business;
  all: (EqStep & { date: string })[];
  cashAsked: Chain;
  text: string;
}

const equationChain = caseTemplate<EquationChain>({
  id: 'case-books-chain-equation-journal-cash',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'The equation of a new shop, its journal and Cash A/c',
  setup: (rng) => {
    const b = business(rng);
    const supplier = rng.pick(SUPPLIERS);
    const customer = rng.pick(CUSTOMERS);
    const bought = amount(rng, 60000, 120000, 10000);
    const cost = amount(rng, 20000, 50000, 5000);
    const price = cost + (cost * rng.pick([20, 25, 40])) / 100;
    const cashCost = amount(rng, 10000, 20000, 2000);
    const cashPrice = cashCost + (cashCost * rng.pick([25, 50])) / 100;
    const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
    const discount = rupees(rng.pick([500, 1000]));
    const paid = partOf(rng, bought) - discount;
    if (cost + cashCost > bought - rupees(10000) || paid <= 0 || price % 100 !== 0 || cashPrice % 100 !== 0) return null;
    const steps: EqStep[] = [
      withEq(cs.capitalBoth(amount(rng, 30000, 60000, 10000), amount(rng, 200000, 400000, 50000))),
      withEq(cs.creditPurchase(supplier, bought), [dr('stock', bought), cr(creditor(supplier), bought)]),
      ...rng.shuffle([
        eqMore.sale(cost, price, customer),
        eqMore.sale(cashCost, cashPrice, null),
        withEq(cs.asset(rng.pick(ASSETS), 'cash', amount(rng, 10000, 25000, 1000))),
        withEq(cs.expense(e, 'cash', pickAmount(rng, e))),
        withEq(cs.paySupplier(supplier, paid, discount)),
        rng.pick([withEq(cs.drawings(b.owner, 'cash', amount(rng, 2000, 6000, 1000))), eqMore.loan(amount(rng, 20000, 50000, 10000), rng.pick(LENDERS))]),
      ]),
    ];
    for (const s of steps) {
      if (s.key.startsWith('expense') || s.key === 'drawings') s.eq = [dr('capital', s.lines[0].amount), s.lines[1]];
      if (s.key === 'paySupplier') s.eq = [s.lines[0], s.lines[1], cr('capital', discount)];
    }
    const days = [1, ...daysBetween(rng, steps.length - 1, 2, 28)];
    const all = steps.map((s, i) => ({ ...s, date: `${days[i]} ${b.month}` }));
    if (!storyHolds(all, { cash: 0, bank: 0 })) return null;
    const asked = ask(b, all, 'cash', {
      bringDown: true,
      least: 4,
      natural: 'Dr',
      distractors: ['Bank A/c', 'Stock A/c', 'Purchases A/c', 'Capital A/c'],
      leftOut: 'A transaction settled by cheque goes through Bank A/c, and one on credit through the party: neither touches Cash A/c. The cost of the goods sold is not in any entry.',
    });
    if (!asked) return null;
    const text = [
      `${b.owner} opened ${b.shop} on ${firstDay(b)}. The cost of the goods sold is given with each sale, for the accounting equation.`,
      ...all.map((t) => `${t.date}: ${t.text}`),
    ].join('\n');
    return { b, all, cashAsked: { b, text, all, month: all, openings: new Map(), asked: [asked], tb: trialBalanceOf(all) }, text };
  },
  context: (s) => s.text,
  parts: [
    {
      kind: 'statement',
      make: (s) => {
        const rows = s.all.map((t) => ({ date: t.date, label: t.brief, amounts: eqRow(t.eq) }));
        const end = [0, 1, 2, 3].map((k) => sum(rows.map((r) => r.amounts[k])));
        if (end[0] + end[1] !== end[2] + end[3]) return null;
        return {
          task: `Show how each transaction of ${s.b.month} changes the accounting equation: Cash and bank, Other assets, Liabilities and Capital. Show a decrease with a minus sign, and end with the position at the end of the month.`,
          title: `Accounting equation of ${s.b.owner}, ${s.b.month} ${yearOf(s.b)}`,
          heading: 'Transaction',
          columns: EQ_COLUMNS,
          rows: [...rows, { subtotal: 'Position at the end of the month', amounts: end, sum: 'all' as const }],
          distractors: ['Goods bought for cash', 'Capital withdrawn from the bank', 'Goods returned by a customer'],
          explanation: [
            'Cash and bank, and other assets, rise with what comes in; liabilities rise with what is owed; capital rises with capital brought in, profit and gains, and falls with expenses and drawings.',
            ...s.all.map((t, i) => {
              const r = rows[i].amounts;
              return `${t.date}: ${EQ_COLUMNS.map((c, k) => (r[k] === 0 ? null : `${c.name.replace(' (₹)', '')} ${r[k] > 0 ? '+' : '-'} ${F(Math.abs(r[k]))}`)).filter(Boolean).join(', ')}.${t.key === 'creditSale' || t.key === 'saleCash' ? ` The goods go out at cost and the profit, ${F(t.eq.find((l) => l.accountId === 'capital')!.amount)}, is added to capital.` : ''}`;
            }),
            `At the end of the month: ${F(end[0])} + ${F(end[1])} = ${F(end[0] + end[1])} of assets, and ${F(end[2])} + ${F(end[3])} = ${F(end[2] + end[3])} of liabilities and capital.`,
          ],
          hints: [
            'Take the transactions one at a time: which terms change, and by how much? Every transaction keeps the two sides equal.',
            'A sale changes assets by the selling price coming in and the cost of the goods going out; the difference, the profit, goes to capital. Expenses and drawings reduce capital.',
          ],
        };
      },
      // Worked again from the entries read back from the case: each account to its column, with each sale's goods
      // taken out at the cost its line states and its profit, not its price, left in capital.
      verify: (q: StatementQuestion) => {
        const read = readBooks(q.data);
        if (!read) return false;
        const want = read.entries.map((e) => {
          const term = (id: string) => (id === 'cash' || id === 'bank' ? 0 : id === 'purchases' || resolveAccount(id).type === 'asset' ? 1 : termOf(id) === 'liabilities' ? 2 : 3);
          const row = [0, 0, 0, 0];
          for (const l of e.lines) row[term(l.accountId)] += (term(l.accountId) < 2 ? 1 : -1) * signed(l);
          const line = q.data.split('\n').find((r) => r.startsWith(`${e.date}: `)) ?? '';
          const cost = /Sold goods costing (₹[\d,]+)/.exec(line)?.[1];
          if (cost) {
            row[1] -= toPaise(cost);
            row[3] -= toPaise(cost);
          }
          return row.join('|');
        });
        const end = q.lines?.find((l) => 'subtotal' in l);
        const got = q.rows.map((r) => r.amounts.join('|'));
        return [...want].sort().join(';') === [...got].sort().join(';') && !!end && 'amounts' in end && end.amounts[0] + end.amounts[1] === end.amounts[2] + end.amounts[3];
      },
    },
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: `Journalise the transactions of ${s.b.month}.`,
        transactions: s.all.map((t) => ({ date: t.date, text: `${t.brief}.`, lines: t.lines, explanation: t.steps })),
        distractorAccounts: ['stock', 'purchases', 'drawings', 'discountAllowed', 'loan'].filter((id) => !s.all.some((t) => t.lines.some((l) => l.accountId === id))),
      }),
      verify: (q: JournalSetQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read && read.entries.length === q.entries.length && q.entries.every((e, i) => e.date === read.entries[i].date && linesKey(e.expected) === linesKey(read.entries[i].lines));
      },
    },
    { kind: 'account', make: (s) => accountPart(s.cashAsked, 0), verify: ledgerAccountRead },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 7. The ledger on the last day, the pass book: the amended cash book, the statement after it, and the trial
// balance once the bank items are entered (complex)
// ---------------------------------------------------------------------------------------------------------------

const ISSUED_LABEL = 'Cheques issued but not yet presented';
const DEPOSITED_LABEL = 'Cheques deposited but not yet cleared';

/** The ledger balances, the bank items and the cheques in transit of the case, read back from its text. */
function readAmendCase(text: string): { opening: DatedEntry; items: JournalLine[][]; issued: Paise; deposited: Paise } | null {
  const read = readBooks(text);
  if (!read?.opening || net(read.opening.lines) !== 0) return null;
  const items: JournalLine[][] = [];
  let issued = 0;
  let deposited = 0;
  for (const row of text.split('\n')) {
    const bullet = /^• (.+)$/.exec(row)?.[1];
    if (!bullet) continue;
    const i = /^Cheques for (₹[\d,]+) issued to suppliers had not been presented for payment\.$/.exec(bullet);
    const d = /^Cheques for (₹[\d,]+) paid into the bank had not been collected\.$/.exec(bullet);
    if (i) issued += toPaise(i[1]);
    else if (d) deposited += toPaise(d[1]);
    else {
      const lines = readBankItem(bullet);
      if (!lines) return null;
      items.push(lines);
    }
  }
  return { opening: read.opening, items, issued, deposited };
}

interface AmendChain {
  b: Business;
  date: string;
  given: Given[];
  items: BankItem[];
  issued: Paise;
  deposited: Paise;
  text: string;
}

const amendChain = caseTemplate<AmendChain>({
  id: 'case-books-chain-amended-cash-book-tb',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'The amended cash book, the statement and the trial balance',
  setup: (rng) => {
    const b = business(rng);
    const date = monthEnd(b);
    const [d1, d2] = rng.shuffle(CUSTOMERS);
    const [c1] = rng.shuffle(SUPPLIERS);
    const asset = rng.pick(ASSETS);
    const e = rng.pick(EXPENSES.filter((x) => ['rent', 'salaries', 'advertisement'].includes(x.id)));
    const x = (lo: number, hi: number, s = 1000) => amount(rng, lo, hi, s);
    const debits: Given[] = [
      { label: 'Bank', accountId: 'bank', side: 'Dr', amount: x(40000, 120000, 500) },
      { label: 'Cash', accountId: 'cash', side: 'Dr', amount: x(5000, 20000) },
      { label: 'Stock', accountId: 'stock', side: 'Dr', amount: x(40000, 100000) },
      givenParty(debtor(d1), x(20000, 50000)),
      givenParty(debtor(d2), x(10000, 30000)),
      { label: accountLabel(asset.id).replace(' A/c', ''), accountId: asset.id, side: 'Dr', amount: x(20000, 60000, 5000) },
      { label: 'Purchases', accountId: 'purchases', side: 'Dr', amount: x(150000, 300000, 5000) },
      { label: resolveAccount(e.id).name, accountId: e.id, side: 'Dr', amount: x(10000, 40000) },
    ];
    const sales = x(250000, 450000, 5000);
    const owing = x(20000, 60000);
    const capital = sum(debits.map((g) => g.amount)) - sales - owing;
    if (capital < rupees(50000)) return null;
    const given: Given[] = [...debits, givenParty(creditor(c1), owing), { label: 'Sales', accountId: 'sales', side: 'Cr', amount: sales }, { label: 'Capital', accountId: 'capital', side: 'Cr', amount: capital }];
    const kinds = rng.shuffle(['charges', 'interest', 'deposit', 'standing'] as const).slice(0, 3);
    const items = kinds.map((k) =>
      k === 'charges' ? bankItem.charges(amount(rng, 200, 1500, 50)) : k === 'interest' ? bankItem.interest(amount(rng, 300, 2500, 50)) : k === 'deposit' ? bankItem.deposit(d2, amount(rng, 3000, 9000, 500)) : bankItem.standing(amount(rng, 1500, 6000, 100)),
    );
    const issued = x(5000, 25000, 500);
    const deposited = x(4000, 20000, 500);
    if (new Set([issued, deposited, ...items.map((i) => i.amount)]).size < 5) return null;
    const text = [
      `${b.owner} runs ${b.shop}. Cheques received are banked the same day. Balances in the ledger on ${date} ${yearOf(b)}, before the cash book is compared with the pass book:`,
      ...given.map((g) => (g.accountId.includes(':') ? givenLine(g) : `${g.label}: ${F(g.amount)} (${g.side})`)),
      'Comparing the bank column of the cash book with the pass book:',
      `• Cheques for ${F(issued)} issued to suppliers had not been presented for payment.`,
      `• Cheques for ${F(deposited)} paid into the bank had not been collected.`,
      ...items.map((i) => `• ${i.text}`),
      'The business first amends its cash book, then reconciles the amended balance with the pass book.',
    ].join('\n');
    return { b, date, given, items, issued, deposited, text };
  },
  context: (s) => s.text,
  parts: [
    {
      kind: 'account',
      make: (s) => {
        const start = s.given[0].amount;
        const entries: DatedEntry[] = s.items.map((i) => ({ date: s.date, lines: i.lines }));
        const view = accountOf(entries, 'bank', { date: s.date, side: 'Dr', amount: start });
        if (view.balance?.side !== 'Dr') return null;
        const sides = ledgerSides(view, { closeOn: s.date });
        return {
          task: `Prepare the amended cash book (bank column only) of ${s.b.owner} on ${s.date} and balance it. Enter only what needs an entry in the cash book.`,
          title: `Amended Cash Book (bank column) of ${s.b.owner}`,
          ...sides,
          distractors: [ISSUED_LABEL, DEPOSITED_LABEL, 'Cash A/c', 'Suspense A/c'],
          explanation: [
            `The cash book shows a favourable balance, a debit balance: "To Balance b/d" ${F(start)}.`,
            ...s.items.map((i) => `${i.label}: ${i.up ? `added by the bank, so it is debited, "To ${ledgerLabel(i.lines.find((l) => l.accountId !== 'bank')!.accountId)}"` : `taken out by the bank, so it is credited, "By ${ledgerLabel(i.lines.find((l) => l.accountId !== 'bank')!.accountId)}"`} ${F(i.amount)}.`),
            'Left out: the cheques not yet presented or collected. The cash book is right about them; they belong in the statement alone.',
            ...sideWork(view),
          ],
        };
      },
      verify: (q: AccountQuestion) => {
        const r = readAmendCase(q.data);
        if (!r) return false;
        const start = net(r.opening.lines.filter((l) => l.accountId === 'bank'));
        const end = start + sum(r.items.map((ls) => net(ls.filter((l) => l.accountId === 'bank'))));
        const closing = q.sides[1].rows.filter((row) => row.closing);
        const body = (k: 0 | 1) => q.sides[k].rows.filter((row) => !row.closing);
        return (
          end > 0 &&
          closing.length === 1 &&
          closing[0].amounts[0] === end &&
          body(0).length + body(1).length === r.items.length + 1 &&
          sum(body(0).map((row) => row.amounts[0])) - sum(body(1).map((row) => row.amounts[0])) === end &&
          ![...body(0), ...body(1)].some((row) => row.label === ISSUED_LABEL || row.label === DEPOSITED_LABEL)
        );
      },
    },
    {
      kind: 'statement',
      make: (s) => {
        const amended = s.given[0].amount + sum(s.items.map((i) => (i.up ? i.amount : -i.amount)));
        const made = chainStatement({
          firm: s.b.owner,
          date: `${s.date} ${yearOf(s.b)}`,
          start: amended,
          startIs: 'the amended balance as per cash book',
          endOf: 'the amended cash book',
          rows: [
            { label: ISSUED_LABEL, up: true, amount: s.issued, reason: 'The cash book has deducted them; the bank has not yet paid them.' },
            { label: DEPOSITED_LABEL, up: false, amount: s.deposited, reason: 'The cash book has added them; the bank has not yet collected them.' },
          ],
          leftOut: 'Left out: the bank items. The amended cash book already shows them, so they no longer keep the two books apart.',
          lures: s.items.map((i) => i.label),
          choose: false,
          perCheque: false,
          hints: [
            'Start from the amended balance: the bank items are in it already. What still keeps the two books apart?',
            'A cheque issued but not yet presented is still in the bank: Plus column. A cheque deposited but not yet cleared is not yet in the bank: Minus column.',
          ],
        });
        // With two rows only, a statement is too slight; the third row is the balance it starts from.
        return made;
      },
      verify: (q: StatementQuestion) => {
        const r = readAmendCase(q.data);
        if (!r || !q.final) return false;
        const amended = net(r.opening.lines.filter((l) => l.accountId === 'bank')) + sum(r.items.map((ls) => net(ls.filter((l) => l.accountId === 'bank'))));
        const end = amended + r.issued - r.deposited;
        const row = (label: string) => q.rows.find((x) => x.label === label)?.amounts.join('|');
        return row(ISSUED_LABEL) === `${r.issued}|0` && row(DEPOSITED_LABEL) === `0|${r.deposited}` && q.rows.length === 3 && q.final.amount === end && end > 0;
      },
    },
    {
      kind: 'statement',
      make: (s) => {
        const opening = s.given.map((g) => (g.side === 'Dr' ? dr(g.accountId, g.amount) : cr(g.accountId, g.amount)));
        const tb = trialBalance(post([opening, ...s.items.map((i) => i.lines)]));
        const day = `${s.date} ${yearOf(s.b)}`;
        return {
          task: `Prepare the Trial Balance of ${s.b.owner} as on ${day}, once the bank items are entered in the books, by the balance method.`,
          title: `Trial Balance of ${s.b.owner} as on ${day}`,
          heading: 'Name of account',
          columns: ['Debit (₹)', 'Credit (₹)'],
          totalsAgree: true,
          rows: tb.rows.map((r) => ({ label: ledgerLabel(r.accountId), amounts: r.side === 'Dr' ? [r.amount, 0] : [0, r.amount] })),
          distractors: ['Suspense A/c', ISSUED_LABEL, DEPOSITED_LABEL, 'Bank Overdraft A/c'],
          explanation: [
            'Start from the ledger balances and post the entries for the bank items.',
            ...s.items.map((i) => `${i.label}: ${i.lines.map((l) => `${ledgerLabel(l.accountId)} ${l.side === 'Dr' ? 'debited' : 'credited'} ${F(l.amount)}`).join(', ')}.`),
            'The cheques not yet presented or collected change no ledger balance: the books are right about them.',
            `Both columns total ${F(tb.debitTotal)}.`,
          ],
          hints: ['Which balances do the bank items change, and which new accounts do they open?', 'Bank A/c takes its amended balance; a debtor who paid into the bank owes less; charges and insurance are new debit balances, interest a new credit balance.'],
        };
      },
      verify: (q: StatementQuestion) => {
        const r = readAmendCase(q.data);
        if (!r) return false;
        const tb = trialBalance(post([r.opening.lines, ...r.items]));
        const want = tb.rows.map((x) => `${ledgerLabel(x.accountId)}|${x.side === 'Dr' ? `${x.amount}|0` : `0|${x.amount}`}`).sort();
        return tb.debitTotal === tb.creditTotal && want.join(';') === q.rows.map((x) => `${x.label}|${x.amounts.join('|')}`).sort().join(';');
      },
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 8. Balances brought forward and a month: the journal with its opening entry, Bank A/c, and the bank
// reconciliation statement from it (complex)
// ---------------------------------------------------------------------------------------------------------------

interface OpeningBank {
  chain: Chain;
  opening: Dated;
  cheques: { issued: boolean; who: string; amount: Paise; date: string; out: boolean }[];
  items: BankItem[];
  bankEnd: Paise;
}

const openingBank = caseTemplate<OpeningBank>({
  id: 'case-books-chain-opening-journal-bank',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'Opening entry, a month, Bank A/c and the statement',
  setup: (rng) =>
    tries(3, () => {
      const b = business(rng);
      const [d1, d2] = rng.shuffle(CUSTOMERS);
      const [c1] = rng.shuffle(SUPPLIERS);
      const given: Given[] = [
        { label: 'Cash', accountId: 'cash', side: 'Dr', amount: amount(rng, 10000, 30000, 1000) },
        { label: 'Bank', accountId: 'bank', side: 'Dr', amount: amount(rng, 50000, 150000, 5000) },
        { label: 'Stock', accountId: 'stock', side: 'Dr', amount: amount(rng, 40000, 100000, 5000) },
        givenParty(debtor(d1), amount(rng, 20000, 50000, 1000)),
        givenParty(creditor(c1), amount(rng, 20000, 50000, 1000)),
      ];
      const opening = openingStep(given);
      if (!opening) return null;
      const got = partOf(rng, given[3].amount);
      const paid = partOf(rng, given[4].amount);
      const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
      const sold = amount(rng, 15000, 40000, 1000);
      const steps = order(
        rng,
        [opening],
        [
          [cs.receive(d1, got, 0)],
          [cs.paySupplier(c1, paid, 0)],
          [cs.creditSale(d2, sold), cs.receive(d2, partOf(rng, sold), 0)],
          [cs.goodsBought('bank', amount(rng, 10000, 30000, 1000))],
          [cs.expense(e, 'bank', pickAmount(rng, e))],
          [rng.pick([more.deposit(amount(rng, 5000, 10000, 1000)), cs.drawings(b.owner, 'bank', amount(rng, 3000, 8000, 1000))])],
        ],
        { cash: 0, bank: 0 },
        given[2].amount,
      );
      if (!steps || got <= 0 || paid <= 0) return null;
      const month = onDays(rng, b, steps.slice(1), true);
      const first: Dated = { ...opening, date: `1 ${b.month}` };
      const all = [first, ...month];
      const cheques = month
        .filter((t) => t.key === 'paySupplier' || t.key === 'receiveFromCustomer')
        .map((t) => ({ issued: t.key === 'paySupplier', who: resolveAccount(partyLine(t)!.accountId).name, amount: partyLine(t)!.amount, date: t.date, out: false }));
      cheques.filter((x) => !x.issued).at(-1)!.out = true;
      if (rng.pick([true, false])) cheques.find((x) => x.issued)!.out = true;
      const items = rng.shuffle([bankItem.charges(amount(rng, 200, 1000, 50)), bankItem.interest(amount(rng, 300, 2000, 50)), bankItem.standing(amount(rng, 1000, 4000, 100))]).slice(0, 2);
      const bankEnd = given[1].amount + sum(month.map((t) => net(t.lines.filter((l) => l.accountId === 'bank'))));
      const openings = new Map(opening.lines.map((l) => [l.accountId, { date: `1 ${b.month}`, side: l.side, amount: l.amount }]));
      const asked = ask(b, month, 'bank', {
        bringDown: true,
        opening: openings.get('bank'),
        least: 5,
        natural: 'Dr',
        distractors: ['Cash A/c', 'Stock A/c', 'Bank Charges A/c', 'Capital A/c'],
        leftOut: 'A sale on credit and a dealing in cash do not touch Bank A/c; nor do the items of the pass book, which are not yet entered.',
      });
      if (!asked || bankEnd <= 0) return null;
      const text = [
        `Balances of ${poss(b.owner)} ${b.shop.replace(/^an? /, '')} on ${firstDay(b)} (capital is the balancing figure):`,
        ...given.map(givenLine),
        `Transactions in ${b.month} (cheques received are banked the same day):`,
        ...month.map((t) => `${t.date}: ${t.text}`),
        `On ${monthEnd(b)} Bank A/c was compared with the pass book:`,
        ...cheques.filter((x) => x.out).map((x) => `• The cheque ${x.issued ? 'paid to' : 'received from'} ${x.who} on ${x.date} had not been ${x.issued ? 'presented for payment' : 'collected by the bank'}.`),
        ...items.map((i) => `• ${i.text}`),
        'Neither bank item is in the books yet; nothing else keeps the two apart.',
      ].join('\n');
      return { chain: { b, text, all, month, openings, asked: [asked], tb: trialBalanceOf(all) }, opening: first, cheques, items, bankEnd };
    }),
  context: (s) => s.chain.text,
  parts: [
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => ({
        task: `Pass the opening entry on 1 ${s.chain.b.month} and journalise the transactions of ${s.chain.b.month}.`,
        transactions: s.chain.all.map((t) => ({
          date: t.date,
          text: `${t.brief}.`,
          lines: t.lines,
          explanation: t.key === 'opening' ? [`Every asset is debited: ${s.opening.lines.filter((l) => l.side === 'Dr').map((l) => ledgerLabel(l.accountId)).join(', ')}.`, `The creditor is credited, and Capital A/c takes the difference: ${F(s.opening.lines.at(-1)!.amount)}.`] : t.steps,
        })),
        distractorAccounts: ['drawings', 'sales', 'bankCharges'].filter((id) => !s.chain.all.some((t) => t.lines.some((l) => l.accountId === id))),
      }),
      verify: (q: JournalSetQuestion) => {
        const read = readBooks(q.context ?? '');
        return !!read?.opening && read.entries.length === q.entries.length && q.entries.every((e, i) => linesKey(e.expected) === linesKey(read.entries[i].lines));
      },
    },
    { kind: 'account', make: (s) => accountPart(s.chain, 0), verify: ledgerAccountRead },
    {
      kind: 'statement',
      make: (s) => {
        const out = s.cheques.filter((x) => x.out);
        const settled = s.cheques.filter((x) => !x.out);
        return chainStatement({
          firm: s.chain.b.owner,
          date: `${monthEnd(s.chain.b)} ${yearOf(s.chain.b)}`,
          start: s.bankEnd,
          startIs: 'the balance of Bank A/c, the balance as per cash book',
          endOf: 'Bank A/c',
          rows: [
            ...out.map((x) => ({ label: BRS_CHAIN.chequeLabel(x.issued, x.who), up: x.issued, amount: x.amount, reason: x.issued ? 'The bank had not paid it by the last day; the books have deducted it.' : 'The bank had not collected it by the last day; the books have added it.' })),
            ...s.items.map((i) => ({ label: i.label, up: i.up, amount: i.amount, reason: i.reason })),
          ],
          leftOut: `Left out: ${settled.map((x) => `the cheque ${x.issued ? 'to' : 'from'} ${x.who}`).join('; ')}, which the bank had dealt with, so both books show ${settled.length > 1 ? 'them' : 'it'}.`,
          lures: [...settled.map((x) => BRS_CHAIN.chequeLabel(x.issued, x.who)), ...[bankItem.charges(1), bankItem.interest(1), bankItem.standing(1)].map((i) => i.label).filter((l) => !s.items.some((i) => i.label === l))],
          choose: false,
          perCheque: true,
          hints: [
            'Which cheques had the bank not yet dealt with, and what did the bank do on its own? Only those keep the two books apart.',
            'A cheque not yet presented: Plus column. A cheque not yet collected: Minus column. What the bank has added: Plus column; what it has taken out: Minus column.',
          ],
        });
      },
      verify: chainBrsRead,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 9. The Sales Book of a month, then the errors found in the day books and their posting: the rectifying
// entries and the Suspense A/c (complex)
// ---------------------------------------------------------------------------------------------------------------

interface SalesErrors {
  chain: Chain;
  faults: Fault[];
}

function salesErrorsSetup(rng: Rng): SalesErrors | null {
  const b = business(rng);
  const [c1, c2, c3] = rng.shuffle(CUSTOMERS);
  const [s1, s2] = rng.shuffle(SUPPLIERS);
  const sells = rng.shuffle([8, 9, 10, 12, 14, 15, 16, 18]).slice(0, 4).map((k) => rupees(k * 5000));
  const buys = rng.shuffle([20, 22, 24, 26, 28]).slice(0, 2).map((k) => rupees(k * 5000));
  const backs = [amount(rng, 2000, 6000, 500), amount(rng, 1500, 5000, 500)];
  if (backs[0] === backs[1]) return null;
  const e = rng.pick(EXPENSES.filter((x) => x.id !== 'insurance'));
  const steps = order(
    rng,
    [cs.capital('bank', amount(rng, 200000, 400000, 50000)), cs.creditPurchase(s1, buys[0])],
    [
      [cs.creditSale(c1, sells[0]), cs.returnIn(c1, backs[0]), cs.receive(c1, partOf(rng, sells[0] - backs[0]), 0)],
      [cs.creditSale(c2, sells[1]), cs.returnIn(c2, backs[1])],
      [cs.creditSale(c3, sells[2])],
      [cs.creditSale(c1, sells[3], true)],
      [cs.creditPurchase(s2, buys[1])],
      [cs.paySupplier(s1, partOf(rng, buys[0]), 0)],
      [cs.expense(e, 'bank', pickAmount(rng, e))],
    ],
  );
  if (!steps) return null;
  const all = onDays(rng, b, steps);
  // An error in a book as a whole, one in posting a single entry of a book to its party, and one that left the
  // totals equal.
  const book = rng.pick(['Sales Book', 'Sales Return Book', 'Purchases Book'] as const);
  const inBook = rng.pick([true, false]) ? fault.cast(book, rng.pick([true, false]), rupees(rng.pick([100, 500, 1000]) * rng.int(1, 9))) : fault.totalWrongSide(book, bookTotal(all, book));
  const party = (t: Dated) => partyLine(t);
  const sale = rng.pick(all.filter((t) => t.key === 'creditSale' || t.key === 'returnIn'));
  const figure = transposed(rng, party(sale)!.amount);
  const one = rng.pick([true, false]) && figure ? fault.wrongFigure(sale, party(sale)!.accountId, figure) : fault.notPosted(sale, party(sale)!.accountId);
  const other = rng.pick(all.filter((t) => t !== sale && t.key === 'creditSale'));
  const wrongTo = [c1, c2, c3].find((c) => debtor(c) !== party(other)!.accountId)!;
  const two = fault.instead(other, party(other)!.accountId, debtor(wrongTo));
  const faults = rng.shuffle([inBook, one, two]);
  if (sum(faults.map(tbNet)) === 0) return null;
  const text = [
    `${b.owner} opened ${b.shop} on ${firstDay(b)} and keeps a Purchases Book, a Sales Book and a Sales Return Book; their totals are posted at the end of the month. Cheques received are banked the same day.`,
    ...all.map((t) => `${t.date}: ${t.text}`),
    `The trial balance on ${monthEnd(b)} did not agree, and the difference was put to a Suspense A/c. These errors were then found; together they account for the whole difference:`,
    ...faults.map((x, i) => `${tag(i)} ${x.text}`),
  ].join('\n');
  return { chain: { b, text, all, month: all, openings: new Map(), asked: [], tb: trialBalanceOf(all) }, faults };
}

const salesErrors = caseTemplate<SalesErrors>({
  id: 'case-books-chain-day-books-errors',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'complex',
  title: 'The Sales Book, its errors and the Suspense A/c',
  setup: (rng) => tries(3, () => salesErrorsSetup(rng)),
  context: (s) => s.chain.text,
  parts: [
    { kind: 'statement', make: (s) => dayBook(s.chain, null, false), verify: dayBookRead },
    { kind: 'journal_set', make: (s) => rectifyingSet(s.faults, true), verify: verifyRectifyingSet },
    {
      kind: 'account',
      make: (s) => {
        const made = ROE_CHAIN.suspense(s.chain.b.owner, s.faults.map(toRoe), -sum(s.faults.map(tbNet)), 'find', monthEnd(s.chain.b));
        return made && { ...made, task: `Prepare the Suspense A/c and find the difference in the trial balance with which it was opened. Enter that difference as "${ROE_CHAIN.difference}".` };
      },
      verify: verifySuspenseFound,
    },
  ],
});

// ---------------------------------------------------------------------------------------------------------------
// Chain 10. A week of petty cash: the analytical petty cash book, the entries at the end of the week, and Petty
// Cash A/c (medium)
// ---------------------------------------------------------------------------------------------------------------

const PETTY_HEADS = ['postage', 'stationery', 'repairs'] as const;

/** The payments of a week read back from the case text: each with the account of its head. */
function readPetty(text: string): { imprest: Paise; spends: { id: string; amount: Paise }[] } | null {
  const imprest = /imprest of (₹[\d,]+)/.exec(text)?.[1];
  const read = readBooks(text);
  if (!imprest || !read) return null;
  const spends = read.entries.flatMap((e) => (e.lines.some((l) => l.accountId === 'pettyCash') ? [{ id: e.lines.find((l) => l.side === 'Dr')!.accountId, amount: e.lines[0].amount }] : []));
  return spends.length >= 5 ? { imprest: toPaise(imprest), spends } : null;
}

interface PettyWeek {
  b: Business;
  imprest: Paise;
  spends: (Dated & { what: string })[];
  end: string;
}

const pettyChain = caseTemplate<PettyWeek>({
  id: 'case-books-chain-petty-cash-week',
  topicId: T,
  conceptId: CONCEPT,
  difficulty: 'medium',
  title: 'A week of petty cash: the book, the entries and the account',
  setup: (rng) => {
    const b = business(rng);
    const imprest = rupees(rng.pick([2500, 3000, 4000, 5000]));
    const first = rng.pick([1, 8, 15]);
    const items = [...PETTY_HEADS.flatMap((id) => rng.shuffle(PETTY_ITEMS.filter((i) => i.id === id)).slice(0, 2)), ...(rng.pick([true, false]) ? [rng.pick(PETTY_ITEMS)] : [])].filter(
      (x, i, xs) => xs.findIndex((y) => y.what === x.what) === i,
    );
    const order = rng.shuffle(items);
    const amounts = rng.shuffle(Array.from({ length: 33 }, (_, i) => rupees(40 + 10 * i))).slice(0, order.length);
    if (sum(amounts) > imprest - rupees(300)) return null;
    const days = order.map((_, i) => first + Math.min(5, Math.floor((i * 6) / order.length)));
    const spends = order.map((it, i) => ({
      key: `petty:${it.id}`,
      text: `Paid ${F(amounts[i])} for ${it.what} out of petty cash.`,
      brief: `Petty cash paid for ${it.what}`,
      lines: [dr(it.id, amounts[i]), cr('pettyCash', amounts[i])],
      steps: [],
      distract: [],
      date: `${days[i]} ${b.month}`,
      what: it.what,
    }));
    return { b, imprest, spends, end: `${first + 5} ${b.month}` };
  },
  context: (s) =>
    [
      `${s.b.owner} runs ${s.b.shop} and keeps an analytical petty cash book on the imprest system, with columns for postage, stationery and repairs.`,
      `On ${s.spends[0].date} the petty cashier held the imprest of ${F(s.imprest)}, which is Petty Cash A/c's debit balance. On ${s.end}, the last day of the week, each column total is debited to its account (Postage A/c, Stationery A/c, Repairs A/c), Petty Cash A/c is credited with the total paid, and the head cashier makes the imprest up by cheque.`,
      ...s.spends.map((t) => `${t.date}: ${t.text}`),
    ].join('\n'),
  parts: [
    {
      kind: 'statement',
      make: (s) => {
        const spent = sum(s.spends.map((x) => x.lines[0].amount));
        const total = (id: string) => sum(s.spends.filter((x) => x.lines[0].accountId === id).map((x) => x.lines[0].amount));
        return {
          task: `Write up the payments of the week in the analytical petty cash book of ${s.b.owner}, each in the Total payment column and in the column of its head, and give the balance carried down on ${s.end}, before the imprest is made up.`,
          title: `Analytical Petty Cash Book of ${s.b.owner}: payments of the week ended ${s.end}`,
          columns: ['Total payment (₹)', 'Postage (₹)', 'Stationery (₹)', 'Repairs (₹)'],
          rows: s.spends.map((x) => ({ date: x.date, label: cap(x.what), amounts: [x.lines[0].amount, ...PETTY_HEADS.map((h) => (h === x.lines[0].accountId ? x.lines[0].amount : 0))] })),
          final: { label: BALANCE_CD, amount: s.imprest - spent },
          distractors: ['Cash received from the head cashier', 'Balance b/d', 'Imprest'],
          explanation: [
            'Every payment is entered twice on its own line: in the Total payment column, and again under its head.',
            ...PETTY_HEADS.map((h) => `${HEAD_NAME[h]} column: ${F(total(h))}.`),
            `Total payment column: ${s.spends.map((x) => F(x.lines[0].amount)).join(' + ')} = ${F(spent)}, the same as the three columns together.`,
            `Balance c/d = ${F(s.imprest)} - ${F(spent)} = ${F(s.imprest - spent)}.`,
          ],
          hints: ['Which head is each payment for? The amount goes in the Total payment column and once more under that head.', 'Balance c/d = the imprest the week started with - the total of the Total payment column.'],
        };
      },
      verify: (q: StatementQuestion) => {
        const r = readPetty(q.data);
        if (!r || !q.final) return false;
        const want = r.spends.map((x) => [x.amount, ...PETTY_HEADS.map((h) => (h === x.id ? x.amount : 0))].join('|')).sort();
        return want.join(';') === q.rows.map((x) => x.amounts.join('|')).sort().join(';') && q.final.amount === r.imprest - sum(r.spends.map((x) => x.amount));
      },
    },
    {
      kind: 'journal_set',
      make: (s): CaseSetParts => {
        const spent = sum(s.spends.map((x) => x.lines[0].amount));
        const total = (id: string) => sum(s.spends.filter((x) => x.lines[0].accountId === id).map((x) => x.lines[0].amount));
        return {
          task: `Pass the entries made on ${s.end} for the petty cash of the week.`,
          transactions: [
            ...PETTY_HEADS.map((h) => ({
              date: s.end,
              text: `Total of the ${HEAD_NAME[h]} column posted.`,
              lines: [dr(h, total(h)), cr('pettyCash', total(h))],
              explanation: [`${HEAD_NAME[h]} paid out of petty cash in the week, ${F(total(h))}, is an expense: ${HEAD_NAME[h]} A/c is debited.`, 'The money came out of petty cash: Petty Cash A/c is credited.'],
            })),
            {
              date: s.end,
              text: 'Imprest made up by cheque.',
              lines: [dr('pettyCash', spent), cr('bank', spent)],
              explanation: [`The petty cashier receives what was spent, ${F(spent)}: Petty Cash A/c is debited.`, 'It is paid by cheque: Bank A/c is credited.'],
            },
          ],
          distractorAccounts: ['cash', 'generalExpenses', 'travellingExpenses'],
        };
      },
      verify: (q: JournalSetQuestion) => {
        const r = readPetty(q.context ?? '');
        if (!r) return false;
        const want = [...PETTY_HEADS.map((h) => {
          const x = sum(r.spends.filter((y) => y.id === h).map((y) => y.amount));
          return linesKey([dr(h, x), cr('pettyCash', x)]);
        }), linesKey([dr('pettyCash', sum(r.spends.map((y) => y.amount))), cr('bank', sum(r.spends.map((y) => y.amount)))])].sort();
        return want.join('#') === q.entries.map((e) => linesKey(e.expected)).sort().join('#');
      },
    },
    {
      kind: 'account',
      make: (s) => {
        const spent = sum(s.spends.map((x) => x.lines[0].amount));
        const total = (id: string) => sum(s.spends.filter((x) => x.lines[0].accountId === id).map((x) => x.lines[0].amount));
        const entries: DatedEntry[] = [...PETTY_HEADS.map((h) => ({ date: s.end, lines: [dr(h, total(h)), cr('pettyCash', total(h))] })), { date: s.end, lines: [dr('pettyCash', spent), cr('bank', spent)] }];
        const view = accountOf(entries, 'pettyCash', { date: s.spends[0].date, side: 'Dr', amount: s.imprest });
        const next = `${Number(s.end.split(' ')[0]) + 1} ${s.b.month}`;
        return {
          task: `Prepare Petty Cash A/c for the week from the entries of ${s.end}. Balance it on ${s.end} and bring the balance down on ${next}.`,
          title: 'Petty Cash A/c',
          ...ledgerSides(view, { closeOn: s.end, reopenOn: next }),
          distractors: ['Petty Cash A/c', 'Cash A/c', 'General Expenses A/c'],
          explanation: [
            `Petty Cash A/c opens with the imprest, a debit balance: "To Balance b/d" ${F(s.imprest)}.`,
            `The column totals are credited: ${PETTY_HEADS.map((h) => `"By ${HEAD_NAME[h]} A/c" ${F(total(h))}`).join(', ')}.`,
            `The cheque that makes up the imprest is debited: "To Bank A/c" ${F(spent)}.`,
            ...sideWork(view),
            `The balance is the imprest again, ${F(s.imprest)}, brought down on ${next}.`,
          ],
          hints: ['What came into petty cash, and what went out of it, in the entries of the last day?', 'The imprest and the cheque that makes it up are debits; the totals of the columns are credits.'],
        };
      },
      verify: (q: AccountQuestion) => {
        const r = readPetty(q.data);
        const closing = q.sides[1].rows.find((x) => x.closing);
        if (!r || !closing) return false;
        const spent = sum(r.spends.map((x) => x.amount));
        // Credited with each column's total; debited with the imprest and the cheque that makes it up; closing on the imprest.
        const credits = q.sides[1].rows.filter((x) => !x.closing).map((x) => x.amounts[0]).sort((a, b) => a - b).join();
        const heads = PETTY_HEADS.map((h) => sum(r.spends.filter((x) => x.id === h).map((x) => x.amount))).sort((a, b) => a - b).join();
        return closing.amounts[0] === r.imprest && credits === heads && sum(q.sides[0].rows.map((x) => x.amounts[0])) === r.imprest + spent;
      },
    },
  ],
});

const cases: CaseTemplate[] = [gstErrors, bookErrors, equationMonth, dishonourCase, pettyCase, openingWeek, principleCase, threeColumn, cashBookErrors, gstInvoice, postingErrors, overdraftMonth, goodsOut, whichBook, agreedErrors, ledgerTotals, errorChain, gstBooksChain, fortnightChain, journalErrors, discountBooksChain, equationChain, amendChain, openingBank, salesErrors, pettyChain];

export default cases;
