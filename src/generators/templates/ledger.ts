import type { AccountQuestion } from '@/content/types';
import { creditor, debtor } from '@/engine/accounts';
import { BALANCE_BD, BALANCE_CD, accountOf, balanceOf, ledgerLabel, post, type AccountView, type DatedEntry, type Ledger as Books, type OpeningBalance } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import type { Rng } from '@/engine/rng';
import { accountTemplate, amount, crSide, drSide, formatINR as inr, keepFor, ledgerSides, mcqTemplate, numericTemplate, percentOf, rupees } from '../authoring';
import type { AccountParts, Distractor, McqParts, Template } from '../types';
import { assertionReasonTemplate } from '../assertionReason';

const T = 'ledger';

// ---------------------------------------------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------------------------------------------

type Side = 'Dr' | 'Cr';
type Err = { value: number; why: string };

/**
 * numericTemplate that turns a seed down when fewer than two distinct, positive wrong answers are left (an error
 * value that collapses to the answer, to zero or to another error), instead of serving a thin question.
 */
const numeric = (def: Parameters<typeof numericTemplate>[0]) =>
  numericTemplate({
    ...def,
    generate: (rng) => {
      const parts = def.generate(rng);
      if (!parts) return null;
      // Every error the author listed must survive: a value that equals the answer, zero or another error would
      // leave a student's real mistake without its explanation.
      const values = parts.commonErrors.map((e) => e.value).filter((v) => v > 0 && v !== parts.answer);
      return new Set(values).size === values.length && values.length >= 2 && values.length === parts.commonErrors.length ? parts : null;
    },
  });

const opp = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');
const sideWord = (s: Side) => (s === 'Dr' ? 'debit' : 'credit');
/** The word that starts the Particulars of an item: debit-side items begin with "To", credit-side items with "By". */
const pre = (s: Side) => (s === 'Dr' ? 'To' : 'By');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Ends a sentence, without doubling the full stop after a name such as "Rao & Co.". */
const stop = (s: string) => (s.endsWith('.') ? s : `${s}.`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const parseAmt = (s: string): number => Number(s.replace(/[₹,]/g, '')) * 100;
const amountsIn = (s: string): number[] => (s.match(/₹\d[\d,]*/g) ?? []).map(parseAmt);

const DEBTORS = ['Mohan', 'Anita Traders', 'Kiran', 'Sharma Bros', 'Lakshmi Stores', 'Suresh Kumar', 'Fatima Enterprises', 'Gopal & Sons'];
const CREDITORS = ['Rao & Co.', 'Meena Suppliers', 'Rakesh Agencies', 'Joseph Traders', 'Patel Brothers', 'Sundaram & Co.', 'Bhatia Wholesalers'];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];

/** n ascending dates in one month; with `opening` the first is the 1st (the opening balance). */
function dateList(rng: Rng, n: number, opening: boolean): string[] {
  const mon = rng.pick(MONTHS);
  const count = opening ? n - 1 : n;
  const days = new Set<number>();
  while (days.size < count) days.add(rng.int(2, 28));
  const out = [...days].sort((a, b) => a - b).map((d) => `${d} ${mon}`);
  return opening ? [`1 ${mon}`, ...out] : out;
}

// Hints: the nudge first, then the rule. The engine's general pair says nothing about a ledger, so each template has its own.
const RULE_BALANCE = 'Balance = total of the larger side - total of the smaller side. It is a debit balance if the debit side is larger and a credit balance if the credit side is larger.';
const HINTS_BALANCE = ['Total the debit items and the credit items separately.', RULE_BALANCE];
const RULE_PERSONAL = 'In a personal account a debit balance means the person owes the firm; a credit balance means the firm owes the person.';
const RULE_TO_BY = 'Items on the debit side begin with "To" and items on the credit side with "By", followed by the name of the other account of the entry.';
const RULE_ERRORS = 'An item left out, or posted twice, puts the balance out by its amount once. An item posted on the wrong side puts it out by twice its amount.';

const fill = (text: string, d: string, c: string) => text.split('{d}').join(d).split('{c}').join(c);
const tokenise = (s: string) => {
  let out = s;
  for (const n of DEBTORS) out = out.split(n).join('{d}');
  for (const n of CREDITORS) out = out.split(n).join('{c}');
  return out;
};

// ---------------------------------------------------------------------------------------------------------------
// Ledger accounts that the generators build: a kind of account, a list of dated postings, the balance
// ---------------------------------------------------------------------------------------------------------------

interface Noise {
  text: string;
  /** The side the item would take if it did touch the account (the trap a careless student falls into). */
  as: Side;
}
interface Kind {
  key: string;
  /** The side on which the account normally increases and normally shows its balance. */
  nature: Side;
  /** Whether the account can sensibly show a balance on the other side too (bank overdraft, advance from a customer). */
  flex: boolean;
  title: (d: string, c: string) => string;
  /** Texts of items posted on the debit and on the credit side; {d} and {c} stand for a customer and a supplier. */
  dr: string[];
  cr: string[];
  noise?: Noise[];
}

const K = {
  cash: {
    key: 'cash',
    nature: 'Dr',
    flex: false,
    title: () => 'Cash A/c',
    // Each text says that cash moves, so that it can stand in a list beside transactions on credit.
    dr: ['goods sold for cash', 'cash received from {d}', 'capital brought in by the owner in cash', 'cash drawn from the bank for office use', 'commission received in cash'],
    cr: [
      'rent paid in cash',
      'salaries paid in cash',
      'goods bought for cash',
      'cash paid to {c}',
      'cash taken by the owner for personal use',
      'cash paid into the bank',
      'stationery bought for cash',
    ],
    noise: [
      { text: 'credit sale to {d}', as: 'Dr' },
      { text: 'credit purchase from {c}', as: 'Cr' },
      { text: 'furniture bought on credit from {c}', as: 'Cr' },
      { text: 'goods sent back by {d} (earlier credit sale)', as: 'Cr' },
    ],
  },
  bank: {
    key: 'bank',
    nature: 'Dr',
    flex: true,
    title: () => 'Bank A/c',
    dr: ['cheque from {d} deposited', 'cash deposited into the bank', 'bank loan received', 'amount paid directly into the bank by {d}'],
    cr: ['cheque issued to {c}', 'rent paid by cheque', 'cash withdrawn for office use', 'salaries paid by cheque'],
  },
  debtor: {
    key: 'debtor',
    nature: 'Dr',
    flex: true,
    title: (d) => `${d} A/c`,
    dr: ['goods sold on credit', 'further goods sold on credit'],
    cr: ['cash received', 'goods returned by {d}', 'cheque received'],
  },
  creditor: {
    key: 'creditor',
    nature: 'Cr',
    flex: true,
    title: (_d, c) => `${c} A/c`,
    dr: ['cash paid', 'goods returned to {c}', 'cheque issued'],
    cr: ['goods bought on credit', 'further goods bought on credit'],
  },
  furniture: {
    key: 'furniture',
    nature: 'Dr',
    flex: false,
    title: () => 'Furniture A/c',
    dr: ['furniture bought for cash', 'furniture bought on credit'],
    cr: ['old furniture sold at book value'],
  },
  loan: {
    key: 'loan',
    nature: 'Cr',
    flex: false,
    title: () => 'Bank Loan A/c',
    dr: ['instalment repaid'],
    cr: ['loan received from the bank', 'further loan received from the bank'],
  },
} satisfies Record<string, Kind>;

const ALL_KINDS: Kind[] = [K.cash, K.bank, K.debtor, K.creditor, K.furniture, K.loan];

/** Texts that come in a pair: the plain one for the first such item of an account, the "further" one for every later one. */
const FURTHER: Record<string, string> = {
  'goods sold on credit': 'further goods sold on credit',
  'goods bought on credit': 'further goods bought on credit',
  'loan received from the bank': 'further loan received from the bank',
};
const PLAIN_OF = new Map(Object.entries(FURTHER).map(([plain, more]) => [more, plain]));

/** In date order, the first item of a pair reads plainly and the later ones read "further ...", never the other way round. */
function firstThenFurther<E extends { text: string }>(entries: E[]): E[] {
  const seen = new Set<string>();
  return entries.map((e) => {
    const plain = PLAIN_OF.get(e.text) ?? e.text;
    const more = FURTHER[plain];
    if (!more) return e;
    const text = seen.has(plain) ? more : plain;
    seen.add(plain);
    return { ...e, text };
  });
}

interface Item {
  date: string;
  side: Side;
  text: string;
  amt: number;
  opening?: boolean;
  /** A transaction that does not touch the account at all (a distractor); `side` is where a careless student would post it. */
  skip?: boolean;
}

interface Ledger {
  kind: Kind;
  title: string;
  d: string;
  c: string;
  items: Item[];
  dr: number;
  cr: number;
  bal: number;
  balSide: Side;
  big: number;
  small: number;
}

interface Opts {
  n?: [number, number];
  opening?: boolean;
  /** Side of the opening balance when it is not the account's normal side (a bank overdraft). */
  openSide?: Side;
  natural?: boolean;
  unnatural?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** The running balance never goes below zero (cash in hand cannot be negative). */
  running?: boolean;
  noise?: number;
  /**
   * A month a real business could have: no transaction text used twice (one plain and one "further" lot of goods at
   * most, never the same old furniture sold twice), and small items in amounts that fit them (stationery, commission,
   * rent, drawings, returns), not anything up to ₹60,000. Templates at version 2 or later use it.
   */
  real?: boolean;
}

/** With `real`: the amounts an item of this kind sensibly takes in a month, in rupees (the default range otherwise). */
const REAL_RANGE: Record<string, [number, number]> = {
  'stationery bought for cash': [500, 4000],
  'commission received in cash': [1000, 8000],
  'rent paid in cash': [3000, 15000],
  'rent paid by cheque': [3000, 15000],
  'salaries paid in cash': [5000, 25000],
  'salaries paid by cheque': [5000, 25000],
  'cash taken by the owner for personal use': [2000, 10000],
  'goods returned by {d}': [1000, 8000],
  'goods returned to {c}': [1000, 8000],
  'goods sent back by {d} (earlier credit sale)': [1000, 8000],
  'old furniture sold at book value': [2000, 12000],
  'instalment repaid': [5000, 20000],
};

/** Shops and small firms whose ledgers the `real` questions name, in place of "a trader". */
const BUSINESSES = ['Gill Agro Inputs', 'Sharma Medical Store', 'Nair Auto Spares', 'Kaveri Book House', 'Verma Electricals', 'Iqbal Footwear', 'Thomas Hardware', 'Deepa Garments'];

function makeLedger(rng: Rng, kind: Kind, o: Opts = {}): Ledger | null {
  const [lo, hi] = o.n ?? [4, 6];
  const min = o.min ?? 2000;
  const max = o.max ?? 60000;
  const step = o.step ?? 500;
  for (let attempt = 0; attempt < 14; attempt++) {
    const n = rng.int(lo, hi);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const sides: Side[] = [];
    for (let i = 0; i < n; i++) sides.push(rng.next() < 0.55 ? kind.nature : opp(kind.nature));
    if (!sides.includes('Dr')) sides[0] = 'Dr';
    else if (!sides.includes('Cr')) sides[0] = 'Cr';
    // A personal account ends on its unusual side through money (an advance or an overpayment), not through returns of
    // goods that were never sold or bought, so such an account has no returns on that side.
    const personal = kind.key === 'debtor' || kind.key === 'creditor';
    const texts = (side: Side) => {
      const all = side === 'Dr' ? kind.dr : kind.cr;
      return o.unnatural && personal && side !== kind.nature ? all.filter((t) => !/returned/.test(t)) : all;
    };
    const pools = { Dr: rng.shuffle(texts('Dr')), Cr: rng.shuffle(texts('Cr')) };
    const used = { Dr: 0, Cr: 0 };
    // With `real`, a side that needs more items than it has texts is drawn again rather than repeat one.
    if (o.real && (['Dr', 'Cr'] as const).some((side) => sides.filter((x) => x === side).length > pools[side].length)) continue;
    const real = sides.map((side) => {
      const pool = pools[side];
      const key = pool[used[side]++ % pool.length];
      return { side, key, text: fill(key, d, c), skip: false };
    });
    const extra = (kind.noise ? rng.shuffle(kind.noise) : [])
      .slice(0, o.noise ?? 0)
      .map((x) => ({ side: x.as, key: x.text, text: fill(x.text, d, c), skip: true }));
    const entries = firstThenFurther(rng.shuffle([...real, ...extra]));
    const dates = dateList(rng, entries.length + (o.opening ? 1 : 0), !!o.opening);
    const items: Item[] = [];
    let k = 0;
    if (o.opening) {
      items.push({ date: dates[k++], side: o.openSide ?? kind.nature, text: 'opening balance brought down', amt: amount(rng, min, max, step), opening: true });
    }
    for (const e of entries) {
      const [lo2, hi2] = (o.real && REAL_RANGE[e.key]) || [min, max];
      items.push({ date: dates[k++], side: e.side, text: e.text, amt: amount(rng, lo2, hi2, step), ...(e.skip ? { skip: true } : {}) });
    }
    const live = items.filter((i) => !i.skip);
    const dr = sum(live.filter((i) => i.side === 'Dr').map((i) => i.amt));
    const cr = sum(live.filter((i) => i.side === 'Cr').map((i) => i.amt));
    if (dr === cr) continue;
    const balSide: Side = dr > cr ? 'Dr' : 'Cr';
    if (o.natural && balSide !== kind.nature) continue;
    if (o.unnatural && balSide === kind.nature) continue;
    // An account that ends on its normal side did not run below nothing on the way (no payment before there was
    // anything to pay, no return before the sale). An account that ends on the other side (an overdraft) may.
    if (o.running ?? balSide === kind.nature) {
      let run = 0;
      let ok = true;
      for (const i of live) {
        run += i.side === kind.nature ? i.amt : -i.amt;
        if (run < 0) ok = false;
      }
      if (!ok) continue;
    }
    return { kind, title: kind.title(d, c), d, c, items, dr, cr, bal: Math.abs(dr - cr), balSide, big: Math.max(dr, cr), small: Math.min(dr, cr) };
  }
  return null;
}

/** A ledger of one of these kinds; a kind that can sensibly show either balance does so about a third of the time. */
function anyLedger(rng: Rng, kinds: Kind[], opts: Opts = {}, pNatural = 0.7): Ledger | null {
  const kind = rng.pick(kinds);
  const natural = !kind.flex || rng.next() < pNatural;
  return makeLedger(rng, kind, { ...opts, natural, unnatural: !natural });
}

const openingOf = (l: Ledger) => l.items.find((i) => i.opening);
const liveItems = (l: Ledger) => l.items.filter((i) => !i.skip);

/** "• 4 Apr: debit ₹15,000 (received from Mohan)": the side is shown, the learner only adds. */
const shownLine = (i: Item) => `• ${i.date}: ${sideWord(i.side)} ${inr(i.amt)} (${i.text})`;
/** "• 4 Apr: received from Mohan — ₹15,000": the learner decides the side. */
const hiddenLine = (i: Item) => `• ${i.date}: ${i.opening ? `opening ${sideWord(i.side)} balance` : i.text} — ${inr(i.amt)}`;
const showItems = (l: Ledger) => l.items.map(shownLine).join('\n');
const hideItems = (l: Ledger) => l.items.map(hiddenLine).join('\n');

/** The intro of a list of postings, naming the business (no longer "a trader"). */
const NAMED_INTROS = [
  (t: string, firm: string) => `${t} in the ledger of ${firm} shows these postings:`,
  (t: string, firm: string) => `These items are posted in ${t} in the books of ${firm} during the month:`,
  (t: string, firm: string) => `Look at the postings in ${t} in the ledger of ${firm}:`,
];
const namedIntro = (rng: Rng, t: string) => rng.pick(NAMED_INTROS)(t, rng.pick(BUSINESSES));
/** For a list whose sides are not shown: the items are still to be posted. */
const NAMED_HIDDEN_INTROS = [
  (t: string, firm: string) => `These items of the month are to be posted in ${t} in the books of ${firm}:`,
  (t: string, firm: string) => `${t} in the ledger of ${firm} is to be written up from these items of the month:`,
  (t: string, firm: string) => `The following items of the month belong in ${t} in the ledger of ${firm}:`,
];
const namedHiddenIntro = (rng: Rng, t: string) => rng.pick(NAMED_HIDDEN_INTROS)(t, rng.pick(BUSINESSES));
/** The title with the person's role, for a list whose sides the learner must decide. */
const roleTitle = (l: Ledger) => (l.kind.key === 'debtor' ? `${l.title} (the account of a customer)` : l.kind.key === 'creditor' ? `${l.title} (the account of a supplier)` : l.title);

const sumLine = (label: string, xs: number[], total: number) =>
  xs.length === 1 ? `${label}: ${inr(total)}.` : `${label}: ${xs.map(inr).join(' + ')} = ${inr(total)}.`;

/** How the items of each kind of account are posted: the rule hint for a list whose sides the learner must decide. */
const KIND_RULE: Record<string, string> = {
  cash: 'Cash received is debited to Cash A/c and cash paid is credited. A transaction on credit does not touch Cash A/c.',
  bank: 'Money paid into the bank is debited to Bank A/c. Cheques issued and cash withdrawn are credited. An overdraft is a credit balance.',
  debtor: "A customer's account is debited with goods sold on credit and credited with money received and goods returned.",
  creditor: "A supplier's account is credited with goods bought on credit and debited with payments made and goods returned.",
};
const hiddenHints = (l: Ledger) => ['Decide the side of each item first, then total each side and take the difference.', KIND_RULE[l.kind.key] ?? RULE_BALANCE];

/** The working for a list whose sides were not shown: which items go on which side, then the balance. */
function namedWork(l: Ledger): string[] {
  const live = liveItems(l);
  const line = (s: Side) => {
    const xs = live.filter((i) => i.side === s);
    const names = [...new Set(xs.map((i) => (i.opening ? 'opening balance' : i.text)))];
    return sumLine(`${cap(sideWord(s))} side (${names.join('; ')})`, xs.map((i) => i.amt), s === 'Dr' ? l.dr : l.cr);
  };
  return [line('Dr'), line('Cr'), `Balance = ${inr(l.big)} - ${inr(l.small)} = ${inr(l.bal)}, a ${sideWord(l.balSide)} balance.`];
}

/** The working for the balance of a ledger, one step per line. */
function ledgerWork(l: Ledger): string[] {
  const live = liveItems(l);
  const dr = live.filter((i) => i.side === 'Dr').map((i) => i.amt);
  const cr = live.filter((i) => i.side === 'Cr').map((i) => i.amt);
  return [
    sumLine('Debit side', dr, l.dr),
    sumLine('Credit side', cr, l.cr),
    `Balance = ${inr(l.big)} - ${inr(l.small)} = ${inr(l.bal)}, a ${sideWord(l.balSide)} balance.`,
  ];
}

// Which side a printed item text belongs to, so that a prompt can be re-read without the generator's own data.
const TEXT_SIDE = new Map<string, Side | null>();
function register(text: string, side: Side | null) {
  const had = TEXT_SIDE.get(text);
  if (had !== undefined && had !== side) throw new Error(`ledger templates: "${text}" is registered on two sides`);
  TEXT_SIDE.set(text, side);
}
for (const kind of ALL_KINDS) {
  for (const t of kind.dr) register(t, 'Dr');
  for (const t of kind.cr) register(t, 'Cr');
  for (const n of kind.noise ?? []) register(n.text, null);
}
/** The side-and-amount of every bullet line of a prompt (side null for a transaction that does not touch the account). */
function parseItems(prompt: string): { side: Side | null; amt: number }[] {
  const out: { side: Side | null; amt: number }[] = [];
  for (const raw of prompt.split('\n')) {
    if (!raw.startsWith('• ')) continue;
    const body = raw.slice(2).replace(/^\d+ [A-Za-z]+: /, '');
    const shown = /^(debit|credit) (₹[\d,]+) \(/.exec(body);
    if (shown) {
      out.push({ side: shown[1] === 'debit' ? 'Dr' : 'Cr', amt: parseAmt(shown[2]) });
      continue;
    }
    const cut = body.lastIndexOf(' — ');
    if (cut < 0) continue;
    const text = tokenise(body.slice(0, cut));
    const op = /^opening (debit|credit) balance$/.exec(text);
    out.push({ side: op ? (op[1] === 'debit' ? 'Dr' : 'Cr') : (TEXT_SIDE.get(text) ?? null), amt: parseAmt(body.slice(cut + 3)) });
  }
  return out;
}
function promptSums(prompt: string): { dr: number; cr: number } {
  const items = parseItems(prompt);
  return {
    dr: sum(items.filter((i) => i.side === 'Dr').map((i) => i.amt)),
    cr: sum(items.filter((i) => i.side === 'Cr').map((i) => i.amt)),
  };
}

const balText = (s: Side, x: number) => `${cap(sideWord(s))} balance of ${inr(x)}`;

/** The options of "what is the balance, and on which side": the right one and four real slips. */
function balanceMcq(l: Ledger, prompt: string, hints: string[] = HINTS_BALANCE, work: string[] = ledgerWork(l)): McqParts {
  return {
    prompt,
    correct: balText(l.balSide, l.bal),
    distractors: [
      {
        text: balText(opp(l.balSide), l.bal),
        why: 'Right amount, wrong side. The balance lies on the side with the larger total, not on the side that was short and took Balance c/d.',
      },
      { text: balText(l.balSide, l.big), why: 'Gave the total of the larger side instead of the difference between the two sides.' },
      { text: balText(l.balSide, l.dr + l.cr), why: 'Added the two sides together instead of finding their difference.' },
      { text: balText(opp(l.balSide), l.small), why: 'Took the total of the smaller side as the balance.' },
    ],
    explanation: work.join(' '),
    hints,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// EASY. led-balance-amount: the balance of an account, sides shown (numeric)
// ---------------------------------------------------------------------------------------------------------------

const balanceAmount = numeric({
  id: 'led-balance-amount',
  version: 2,
  topicId: T,
  conceptId: 'led-balancing',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const l = makeLedger(rng, rng.pick(ALL_KINDS), { opening: rng.next() < 0.4, natural: true, real: true });
    if (!l) return null;
    const ask = rng.pick([
      'What is the balance of the account?',
      'After balancing, what amount is carried down as the balance?',
      'Balance the account. What is the amount of the balance?',
    ]);
    const errors: Err[] = [
      { value: l.dr + l.cr, why: 'Added the two sides instead of finding their difference.' },
      { value: l.big, why: 'Gave the total of the larger side, not the difference between the two sides.' },
      { value: l.small, why: 'Gave the total of the smaller side as the balance.' },
    ];
    const open = openingOf(l);
    if (open) errors.push({ value: Math.abs(l.bal - open.amt), why: 'Left out the opening balance brought down on the first day.' });
    return {
      prompt: `${namedIntro(rng, l.title)}\n${showItems(l)}\n${ask}`,
      answer: l.bal,
      commonErrors: errors,
      explanation: ledgerWork(l),
      hints: HINTS_BALANCE,
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    return dr !== cr && q.answer === Math.abs(dr - cr);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-balance-side: debit or credit balance, and how much (mcq)
// ---------------------------------------------------------------------------------------------------------------

const balanceSide = mcqTemplate({
  id: 'led-balance-side',
  version: 2,
  topicId: T,
  conceptId: 'led-balances',
  difficulty: 'easy',
  generate: (rng) => {
    const l = anyLedger(rng, ALL_KINDS, { opening: rng.next() < 0.3, real: true }, 0.65);
    if (!l) return null;
    return balanceMcq(l, `${namedIntro(rng, l.title)}\n${showItems(l)}\nWhat is the balance of the account, and is it a debit or a credit balance?`);
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    return q.options.find((o) => o.id === q.correct)?.text === balText(dr > cr ? 'Dr' : 'Cr', Math.abs(dr - cr));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-cd-wording: how the balance is written to close the account (mcq)
// ---------------------------------------------------------------------------------------------------------------

const cdText = (s: Side, x: number, word = 'c/d', prefix: string = pre(s)) =>
  `"${prefix} Balance ${word}", ${inr(x)}, on the ${sideWord(s)} side`;

const cdWording = mcqTemplate({
  id: 'led-cd-wording',
  version: 2,
  topicId: T,
  conceptId: 'led-balancing',
  difficulty: 'easy',
  generate: (rng) => {
    const l = anyLedger(rng, ALL_KINDS, { real: true }, 0.75);
    if (!l) return null;
    const short = opp(l.balSide);
    return {
      prompt: `${namedIntro(rng, l.title)}\n${showItems(l)}\nThe account is balanced at the end of the month. How is the balance written to make the two sides equal?`,
      correct: cdText(short, l.bal),
      distractors: [
        { text: cdText(short, l.bal, 'c/d', pre(opp(short))), why: 'Right side but the wrong word: debit-side items begin with "To" and credit-side items with "By".' },
        {
          text: cdText(l.balSide, l.bal),
          why: 'Wrote the balance on the larger side. It goes on the shorter side so that the two sides come to the same total.',
        },
        {
          text: cdText(short, l.bal, 'b/d'),
          why: 'Wrote Balance b/d. At the close of the period the balance is carried down (c/d); it is brought down (b/d) on the opposite side, on the first day of the next period.',
        },
        { text: cdText(short, l.big), why: 'Wrote the total of the larger side instead of the difference between the two sides.' },
      ],
      explanation: `The ${sideWord(l.balSide)} side is larger (${inr(l.big)} against ${inr(l.small)}). The difference, ${inr(l.bal)}, is written on the ${sideWord(short)} side as "${pre(short)} Balance c/d", and both sides then total ${inr(l.big)}.`,
      hints: [
        'Total each side. Which side is short, and by how much?',
        'At the close the difference is written on the shorter side as Balance c/d: "To Balance c/d" on the debit side, "By Balance c/d" on the credit side.',
      ],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    const short: Side = dr > cr ? 'Cr' : 'Dr';
    return q.options.find((o) => o.id === q.correct)?.text === cdText(short, Math.abs(dr - cr));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-bd-wording: the balance brought down on the first day of the next period (mcq)
// ---------------------------------------------------------------------------------------------------------------

const PERIODS = [
  ['31 March', '1 April'],
  ['30 June', '1 July'],
  ['30 September', '1 October'],
  ['31 December', '1 January'],
];

const bdWording = mcqTemplate({
  id: 'led-bd-wording',
  topicId: T,
  conceptId: 'led-balancing',
  difficulty: 'easy',
  generate: (rng) => {
    const kind = rng.pick(ALL_KINDS);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const side: Side = kind.flex && rng.next() < 0.25 ? opp(kind.nature) : kind.nature;
    const x = amount(rng, 5000, 95000, 500);
    const [closeDate, nextDate] = rng.pick(PERIODS);
    return {
      prompt: `On ${closeDate}, ${kind.title(d, c)} was balanced. It had a ${sideWord(side)} balance of ${inr(x)}, which was carried down. How does this balance appear in the account on ${nextDate}, the first day of the next period?`,
      correct: cdText(side, x, 'b/d'),
      distractors: [
        { text: cdText(side, x, 'b/d', pre(opp(side))), why: 'Right side but the wrong word: debit-side items begin with "To" and credit-side items with "By".' },
        {
          text: cdText(side, x, 'c/d'),
          why: 'Wrote Balance c/d again. The balance was carried down at the close; on the first day of the new period it is brought down (b/d).',
        },
        {
          text: cdText(opp(side), x, 'b/d'),
          why: 'Brought the balance down on the side where it was carried down (the shorter side). It is brought down on the larger side, so that it carries on as the opening balance.',
        },
      ],
      explanation: `At the close a ${sideWord(side)} balance is carried down on the ${sideWord(opp(side))} side, the shorter one, as "${pre(opp(side))} Balance c/d". On the first day of the new period it is brought down on the opposite side: "${pre(side)} Balance b/d" on the ${sideWord(side)} side.`,
      hints: [
        'Balance c/d closed the old period on the shorter side. Where must the same balance start the new period?',
        'A debit balance is brought down as "To Balance b/d" on the debit side; a credit balance as "By Balance b/d" on the credit side.',
      ],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Journal entries and the accounts they touch (used by led-posting-accounts and led-posting-words)
// ---------------------------------------------------------------------------------------------------------------

interface TxInfo {
  text: string;
  dr: string;
  cr: string;
  note: string;
  altDr: [string, string];
  altCr: [string, string];
}

const TXS: ((x: string, d: string, c: string) => TxInfo)[] = [
  (x, d) => ({
    text: `Sold goods to ${d} on credit for ${x}`,
    dr: `${d} A/c`,
    cr: 'Sales A/c',
    note: 'The customer now owes the firm (a debtor, an asset that rises) and Sales, an income, rises.',
    altDr: ['Cash A/c', 'Treated a credit sale as a cash sale; no cash has come in yet.'],
    altCr: ['Purchases A/c', 'Credited Purchases, which records goods bought, not goods sold.'],
  }),
  (x, _d, c) => ({
    text: `Bought goods from ${c} on credit for ${x}`,
    dr: 'Purchases A/c',
    cr: `${c} A/c`,
    note: 'Goods bought are debited to Purchases; the supplier becomes a creditor, a liability that rises.',
    altDr: ['Stock A/c', 'Debited Stock A/c. Goods bought for resale are debited to Purchases A/c.'],
    altCr: ['Cash A/c', 'Treated a credit purchase as paid in cash; nothing has been paid yet.'],
  }),
  (x) => ({
    text: `Paid rent of ${x} in cash`,
    dr: 'Rent A/c',
    cr: 'Cash A/c',
    note: 'Rent is an expense (debit) and cash, an asset, falls (credit).',
    altDr: ['Drawings A/c', "Treated a business expense as the owner's drawings."],
    altCr: ['Bank A/c', 'Credited Bank A/c although the rent was paid in cash.'],
  }),
  (x, d) => ({
    text: `Received ${x} in cash from ${d}, a customer`,
    dr: 'Cash A/c',
    cr: `${d} A/c`,
    note: "Cash, an asset, rises (debit); the customer owes less, so the customer's account is credited.",
    altDr: ['Bank A/c', 'Debited Bank A/c although the money came in as cash.'],
    altCr: ['Sales A/c', 'Credited Sales A/c. The sale was recorded when the goods were sold; this is only the collection of the amount due.'],
  }),
  (x) => ({
    text: `The owner brought ${x} in cash into the business`,
    dr: 'Cash A/c',
    cr: 'Capital A/c',
    note: 'Cash rises (debit); the business owes more to the owner, so Capital is credited.',
    altDr: ['Bank A/c', 'Debited Bank A/c although the money came in as cash.'],
    altCr: ['Sales A/c', "Treated the owner's capital as income from sales."],
  }),
  (x) => ({
    text: `The owner took ${x} in cash from the business for personal use`,
    dr: 'Drawings A/c',
    cr: 'Cash A/c',
    note: 'Drawings, which reduce capital, are debited; cash falls (credit).',
    altDr: ['Salaries A/c', "Treated the owner's personal withdrawal as a business expense."],
    altCr: ['Bank A/c', 'Credited Bank A/c although the money was taken in cash.'],
  }),
  (x) => ({
    text: `Bought furniture for ${x}, paying by cheque`,
    dr: 'Furniture A/c',
    cr: 'Bank A/c',
    note: 'Furniture, an asset, rises (debit); the bank balance falls (credit).',
    altDr: ['Purchases A/c', 'Treated furniture as goods bought for resale.'],
    altCr: ['Cash A/c', 'Credited Cash A/c although the payment was by cheque.'],
  }),
  (x) => ({
    text: `Deposited ${x} of cash into the business bank account`,
    dr: 'Bank A/c',
    cr: 'Cash A/c',
    note: 'The bank balance rises (debit) and the cash in hand falls (credit).',
    altDr: ['Drawings A/c', "Treated cash paid into the firm's own bank account as money taken out by the owner."],
    altCr: ['Capital A/c', "Treated the deposit as fresh capital. The cash was already the firm's; it only moved from the cash box to the bank."],
  }),
  (x, _d, c) => ({
    text: `Paid ${x} in cash to ${c}, a supplier`,
    dr: `${c} A/c`,
    cr: 'Cash A/c',
    note: 'The firm owes the supplier less (debit) and cash falls (credit).',
    altDr: ['Purchases A/c', 'Debited Purchases again, but the goods were recorded when they were bought.'],
    altCr: ['Bank A/c', 'Credited Bank A/c although the payment was in cash.'],
  }),
  (x) => ({
    text: `Received commission of ${x} in cash`,
    dr: 'Cash A/c',
    cr: 'Commission Received A/c',
    note: 'Cash rises (debit); commission is an income, so it is credited.',
    altDr: ['Bank A/c', 'Debited Bank A/c although the money came in as cash.'],
    altCr: ['Sales A/c', 'Credited Sales A/c. Commission is an income but not a sale of goods.'],
  }),
  (x, d) => ({
    text: `${d}, a customer, returned goods worth ${x} bought earlier on credit`,
    dr: 'Sales Return A/c',
    cr: `${d} A/c`,
    note: "Returns reduce sales, so Sales Return is debited; the customer owes less, so the customer's account is credited.",
    altDr: ['Purchases Return A/c', 'Used the purchases return account for goods coming back from a customer.'],
    altCr: ['Cash A/c', 'Treated the return as a cash refund to the customer.'],
  }),
  (x, _d, c) => ({
    text: `Returned goods worth ${x} to ${c}, the supplier they were bought from on credit`,
    dr: `${c} A/c`,
    cr: 'Purchases Return A/c',
    note: 'The firm owes the supplier less (debit) and Purchases Return, which reduces purchases, is credited.',
    altDr: ['Sales Return A/c', 'Used the sales return account for goods sent back to a supplier.'],
    altCr: ['Cash A/c', 'Treated the return as a refund of cash by the supplier.'],
  }),
  (x) => ({
    text: `Withdrew ${x} from the business bank account for use in the office`,
    dr: 'Cash A/c',
    cr: 'Bank A/c',
    note: 'Cash in hand rises (debit) and the bank balance falls (credit).',
    altDr: ['Drawings A/c', 'Treated cash taken from the bank for the office as the owner\'s drawings.'],
    altCr: ['Capital A/c', "Credited Capital A/c; the money came from the firm's own bank account, not from the owner."],
  }),
];

const txFor = (rng: Rng) => {
  const x = amount(rng, 1000, 80000, 500);
  const info = rng.pick(TXS)(inr(x), rng.pick(DEBTORS), rng.pick(CREDITORS));
  return info;
};

const postingAccounts = mcqTemplate({
  id: 'led-posting-accounts',
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'easy',
  generate: (rng) => {
    const t = txFor(rng);
    const entry = (dr: string, cr: string) => `Debit ${dr}; credit ${cr}`;
    return {
      prompt: `${t.text}. When this transaction is posted to the ledger, which account is debited and which is credited?`,
      correct: entry(t.dr, t.cr),
      distractors: [
        { text: entry(t.cr, t.dr), why: 'Reversed the entry: debited the account that should be credited and credited the one that should be debited.' },
        { text: entry(t.altDr[0], t.cr), why: t.altDr[1] },
        { text: entry(t.dr, t.altCr[0]), why: t.altCr[1] },
      ],
      explanation: `${t.note} So ${t.dr} is debited and ${t.cr} is credited.`,
      hints: [
        'What comes into the business or goes out of it here, and does anyone owe more or less than before?',
        'Assets, expenses and drawings are debited when they increase. Liabilities, capital and incomes are credited when they increase. Posting keeps the sides of the journal entry.',
      ],
    };
  },
});

const postingWords = mcqTemplate({
  id: 'led-posting-words',
  topicId: T,
  conceptId: 'led-to-by',
  difficulty: 'easy',
  generate: (rng) => {
    const t = txFor(rng);
    const inDr = rng.next() < 0.5;
    const home = inDr ? t.dr : t.cr;
    const away = inDr ? t.cr : t.dr;
    const right: Side = inDr ? 'Dr' : 'Cr';
    return {
      prompt: `${t.text}. The entry is posted to the ledger. In ${home}, what is written in the Particulars column for this item?`,
      correct: `${pre(right)} ${away}`,
      distractors: [
        {
          text: `${pre(opp(right))} ${away}`,
          why: inDr
            ? 'Used "By", which belongs to credit-side items. An item on the debit side begins with "To".'
            : 'Used "To", which belongs to debit-side items. An item on the credit side begins with "By".',
        },
        { text: `${pre(right)} ${home}`, why: "Wrote the account's own name. The Particulars name the other account of the entry." },
        { text: `${pre(opp(right))} ${home}`, why: "Made both slips: wrote the account's own name and used the word of the opposite side." },
      ],
      explanation: `The entry debits ${t.dr} and credits ${t.cr}. ${home} is ${inDr ? 'debited' : 'credited'}, so its item is on the ${sideWord(right)} side and begins with "${pre(right)}". The Particulars name the other account of the entry, ${away}.`,
      hints: ['Write the journal entry first. Is this account debited or credited by it?', RULE_TO_BY],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-normal-nature: which account normally shows a debit (or credit) balance (mcq)
// ---------------------------------------------------------------------------------------------------------------

interface Acct {
  name: string;
  nature: Side;
  /** What the account is, which is the reason for its balance ("an asset"). */
  what: string;
  /** The mistake behind choosing this account as the answer for the other side. */
  slip: string;
}

const NORMAL: Acct[] = [
  { name: 'Cash A/c', nature: 'Dr', what: 'an asset', slip: 'Took Cash as a credit balance because money keeps going out of it. Cash is an asset, so its balance is a debit.' },
  { name: 'Furniture A/c', nature: 'Dr', what: 'an asset', slip: 'Treated an asset as a credit balance. Assets, such as furniture, show debit balances.' },
  { name: 'Machinery A/c', nature: 'Dr', what: 'an asset', slip: 'Treated an asset as a credit balance. Assets, such as machinery, show debit balances.' },
  { name: 'Purchases A/c', nature: 'Dr', what: 'an expense: the cost of goods bought', slip: 'Took Purchases as a credit balance, mixing it up with the supplier the goods came from. Purchases is debited.' },
  { name: 'Rent A/c', nature: 'Dr', what: 'an expense', slip: 'Took Rent as a credit balance because cash is credited when rent is paid. The Rent account itself is debited.' },
  { name: 'Salaries A/c', nature: 'Dr', what: 'an expense', slip: 'Took Salaries as a credit balance because cash is credited when salaries are paid. The expense account is debited.' },
  { name: 'Drawings A/c', nature: 'Dr', what: 'a deduction from capital', slip: 'Took Drawings as part of capital, which is a credit. Drawings reduce capital, so the account has a debit balance.' },
  { name: 'Sales Return A/c', nature: 'Dr', what: 'a deduction from sales', slip: 'Took Sales Return as a credit because it belongs with sales. Returns reduce sales and show a debit balance.' },
  { name: 'Discount Allowed A/c', nature: 'Dr', what: 'an expense (a loss)', slip: 'Took discount as a credit because it sounds like a gain. Discount allowed is a loss to the business, with a debit balance.' },
  { name: 'Debtors A/c', nature: 'Dr', what: 'an asset: money owed to the business by customers', slip: 'Took the customers\' account as a credit balance. Customers owe the business, so their accounts show debit balances.' },
  { name: 'Sales A/c', nature: 'Cr', what: 'an income', slip: 'Took Sales as a debit balance because cash is debited when goods are sold. Sales itself is an income and is credited.' },
  { name: 'Capital A/c', nature: 'Cr', what: 'what the business owes to its owner', slip: "Took Capital as an asset because the owner's money is in the business. Capital is owed to the owner, so it has a credit balance." },
  { name: 'Creditors A/c', nature: 'Cr', what: 'a liability: money owed to suppliers', slip: "Took the suppliers' account as a debit balance. The business owes its suppliers, so it is a credit balance." },
  { name: 'Discount Received A/c', nature: 'Cr', what: 'an income (a gain)', slip: 'Took Discount Received as a debit balance. It is a gain to the business, so it is credited.' },
  { name: 'Commission Received A/c', nature: 'Cr', what: 'an income', slip: 'Took commission as a debit because cash is debited when it is received. The income account itself is credited.' },
  { name: 'Purchases Return A/c', nature: 'Cr', what: 'a deduction from purchases', slip: 'Took Purchases Return as a debit because goods go out. It reduces purchases and shows a credit balance.' },
  { name: 'Bank Loan A/c', nature: 'Cr', what: 'a liability', slip: 'Took the loan as a debit because the money came in. A loan is owed to the bank, so it has a credit balance.' },
  { name: 'Interest Received A/c', nature: 'Cr', what: 'an income', slip: 'Took interest received as a debit because the bank balance is debited. The income account itself is credited.' },
  { name: 'Bills Payable A/c', nature: 'Cr', what: 'a liability', slip: 'Took Bills Payable as a debit. It is a liability that the business must pay, so it has a credit balance.' },
];

const normalNature = mcqTemplate({
  id: 'led-normal-nature',
  topicId: T,
  conceptId: 'led-normal',
  difficulty: 'easy',
  generate: (rng) => {
    const want: Side = rng.pick(['Dr', 'Cr'] as const);
    const right = rng.pick(NORMAL.filter((a) => a.nature === want));
    const wrong = rng.shuffle(NORMAL.filter((a) => a.nature !== want)).slice(0, 4);
    const ask = rng.pick([
      `Which of these accounts normally shows a ${sideWord(want)} balance?`,
      `Pick the account whose balance is normally a ${sideWord(want)} balance.`,
      `Before the books are closed for the year, which one of these accounts would normally be found with a ${sideWord(want)} balance?`,
    ]);
    return {
      prompt: ask,
      correct: right.name,
      distractors: wrong.map((a) => ({ text: a.name, why: a.slip })),
      explanation: `${right.name} is ${right.what}, so it normally shows a ${sideWord(want)} balance. Assets, expenses, losses and drawings carry debit balances; liabilities, capital, incomes and gains carry credit balances. An account that is deducted from another carries the opposite balance to it.`,
      hints: [
        'Decide what each account is: an asset, an expense, a liability, capital or an income, or a deduction from one of these.',
        'Assets, expenses, losses and drawings normally show debit balances. Liabilities, capital, incomes and gains normally show credit balances.',
      ],
    };
  },
  verify: (q) => {
    const want = q.prompt.includes('debit') ? 'Dr' : 'Cr';
    const text = q.options.find((o) => o.id === q.correct)?.text;
    return NORMAL.find((a) => a.name === text)?.nature === want;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-opening-wording: how an opening balance is written (mcq)
// ---------------------------------------------------------------------------------------------------------------

const OPENERS: { name: (d: string, c: string) => string; nature: Side; what: string }[] = [
  { name: () => 'Cash A/c', nature: 'Dr', what: 'Cash is an asset' },
  { name: () => 'Bank A/c (money in the bank, not an overdraft)', nature: 'Dr', what: 'Money in the bank is an asset' },
  { name: () => 'Furniture A/c', nature: 'Dr', what: 'Furniture is an asset' },
  { name: () => 'Machinery A/c', nature: 'Dr', what: 'Machinery is an asset' },
  { name: (d) => `${d} A/c (a customer who owes the firm)`, nature: 'Dr', what: 'A customer who owes the firm is a debtor, an asset' },
  { name: () => 'Capital A/c', nature: 'Cr', what: 'Capital is what the business owes to its owner' },
  { name: (_d, c) => `${c} A/c (a supplier whom the firm owes)`, nature: 'Cr', what: 'A supplier whom the firm owes is a creditor, a liability' },
  { name: () => 'Bank Loan A/c', nature: 'Cr', what: 'A bank loan is a liability' },
];

const openingWording = mcqTemplate({
  id: 'led-opening-wording',
  topicId: T,
  conceptId: 'led-opening',
  difficulty: 'easy',
  generate: (rng) => {
    const o = rng.pick(OPENERS);
    const x = amount(rng, 5000, 150000, 500);
    const name = o.name(rng.pick(DEBTORS), rng.pick(CREDITORS));
    const side = o.nature;
    return {
      prompt: `On 1 April, ${name} is opened in the new year's ledger with a balance of ${inr(x)} brought forward from the old year. How is the opening balance written?`,
      correct: cdText(side, x, 'b/d'),
      distractors: [
        {
          text: cdText(side, x, 'b/d', pre(opp(side))),
          why: 'Right side but the wrong word: debit-side items begin with "To" and credit-side items with "By".',
        },
        {
          text: cdText(opp(side), x, 'b/d'),
          why: 'Put the balance on the wrong side. Assets open with a debit balance; liabilities and capital open with a credit balance.',
        },
        {
          text: cdText(side, x, 'c/d'),
          why: 'Used c/d. An opening balance is brought down (b/d); c/d is the closing balance carried down at the end of a period.',
        },
      ],
      explanation: `${o.what}, so the account opens with a ${sideWord(side)} balance. It is written "${pre(side)} Balance b/d" on the ${sideWord(side)} side.`,
      hints: [
        'Is this account an asset, a liability or capital? That fixes the side of its balance.',
        'An opening balance is a balance brought down: "To Balance b/d" on the debit side for an asset, "By Balance b/d" on the credit side for a liability or capital.',
      ],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-opening-closing: opening + increases - decreases = closing (numeric)
// ---------------------------------------------------------------------------------------------------------------

interface Flow {
  acct: string;
  /** The side of the balance of the account, at the start and at the end. */
  side: Side;
  /** Who the account belongs to, for the variant that does not start from the opening balance. */
  lead: (d: string, c: string) => string;
  open: (x: string, d: string, c: string) => string;
  inc: (x: string) => string;
  dec: (x: string) => string;
  incNoun: string;
}

const FLOWS: Flow[] = [
  {
    acct: 'Cash A/c',
    side: 'Dr',
    lead: () => '',
    open: (x) => `Cash in hand at the start of the month was ${x}.`,
    inc: (x) => `During the month, cash receipts amounted to ${x}`,
    dec: (x) => `cash payments amounted to ${x}`,
    incNoun: 'cash receipts of the month',
  },
  {
    acct: 'Bank A/c',
    side: 'Dr',
    lead: () => '',
    open: (x) => `Bank A/c in the books of a firm showed a debit balance of ${x} at the start of the month.`,
    inc: (x) => `During the month, deposits into the bank totalled ${x}`,
    dec: (x) => `cheques issued and withdrawals totalled ${x}`,
    incNoun: 'deposits into the bank during the month',
  },
  {
    acct: "the customer's A/c",
    side: 'Dr',
    lead: (d) => `${d} is a customer of a firm. `,
    open: (x, d) => `${d} owed the firm ${x} at the start of the month.`,
    inc: (x) => `During the month, goods sold on credit to the customer were worth ${x}`,
    dec: (x) => `the customer paid cash and returned goods worth ${x} in all`,
    incNoun: 'goods sold on credit to the customer',
  },
  {
    acct: "the supplier's A/c",
    side: 'Cr',
    lead: (_d, c) => `${c} is a supplier of a firm. `,
    open: (x, _d, c) => `The firm owed ${c} ${x} at the start of the month.`,
    inc: (x) => `During the month, goods bought on credit from the supplier were worth ${x}`,
    dec: (x) => `payments and returns to the supplier totalled ${x}`,
    incNoun: 'goods bought on credit from the supplier',
  },
];

const openingClosing = numeric({
  id: 'led-opening-closing',
  topicId: T,
  conceptId: 'led-opening',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const f = rng.pick(FLOWS);
    const o = amount(rng, 10000, 90000, 5000);
    const i = amount(rng, 5000, 80000, 5000);
    const dd = amount(rng, 5000, 80000, 5000);
    const c = o + i - dd;
    if (c <= 0) return null;
    const d = rng.pick(DEBTORS);
    const cr = rng.pick(CREDITORS);
    const ask = rng.pick(['closing', 'opening', 'increase'] as const);
    const eq = ['Closing balance = Opening balance + Increases - Decreases.'];
    const hints = [
      'Which items make the balance of this account bigger, and which make it smaller?',
      'Closing balance = Opening balance + Increases - Decreases. Rearrange it for the figure that is asked.',
    ];
    const closed = `At the end of the month ${f.acct} showed a ${sideWord(f.side)} balance of ${inr(c)}.`;
    if (ask === 'closing') {
      return {
        prompt: `${f.open(inr(o), d, cr)} ${f.inc(inr(i))} and ${f.dec(inr(dd))}. What is the closing balance of ${f.acct} (the balance carried down)?`,
        answer: c,
        commonErrors: [
          { value: o + i + dd, why: 'Added the decreases to the balance instead of deducting them.' },
          { value: Math.abs(i - dd), why: 'Left out the opening balance and took only the difference between the two movements.' },
          { value: Math.abs(o - i + dd), why: 'Deducted the increases and added the decreases: the two movements the wrong way round.' },
          { value: o + i, why: 'Left out the decreases altogether.' },
        ],
        explanation: [...eq, `${inr(o)} + ${inr(i)} - ${inr(dd)} = ${inr(c)}.`],
        hints,
      };
    }
    if (ask === 'opening') {
      return {
        prompt: `${f.lead(d, cr)}${f.inc(inr(i))} and ${f.dec(inr(dd))}. ${closed} What was the opening balance of the account?`,
        answer: o,
        commonErrors: [
          { value: c + i - dd, why: 'Worked forwards: added the increases and deducted the decreases to the closing balance instead of going back.' },
          { value: c + i + dd, why: 'Added both movements to the closing balance.' },
          { value: Math.abs(c - i - dd), why: 'Deducted both movements from the closing balance; the decreases must be added back.' },
          { value: Math.abs(c - i), why: 'Deducted the increases but forgot to add back the decreases.' },
        ],
        explanation: [...eq, 'So Opening balance = Closing balance - Increases + Decreases.', `${inr(c)} - ${inr(i)} + ${inr(dd)} = ${inr(o)}.`],
        hints,
      };
    }
    return {
      prompt: `${f.open(inr(o), d, cr)} ${cap(f.dec(inr(dd)))} during the month. ${closed} What was the total of ${f.incNoun}?`,
      answer: i,
      commonErrors: [
        { value: Math.abs(c - o - dd), why: 'Deducted the decreases instead of adding them back to the change in the balance.' },
        { value: Math.abs(c - o), why: 'Took the change in the balance as the increases, forgetting that the decreases were also posted.' },
        { value: c + dd, why: 'Left out the opening balance.' },
        { value: c + o + dd, why: 'Added the opening balance instead of deducting it.' },
      ],
      explanation: [...eq, 'So Increases = Closing balance - Opening balance + Decreases.', `${inr(c)} - ${inr(o)} + ${inr(dd)} = ${inr(i)}.`],
      hints,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    if (a.length !== 3) return false;
    return /What is the closing balance/.test(q.prompt) ? q.answer === a[0] + a[1] - a[2] : q.answer === a[2] - a[0] + a[1];
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-total-side: totals of a side, and the total at which the account closes (numeric)
// ---------------------------------------------------------------------------------------------------------------

const totalSide = numeric({
  id: 'led-total-side',
  version: 2,
  topicId: T,
  conceptId: 'led-balancing',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const l = anyLedger(rng, ALL_KINDS, { opening: rng.next() < 0.3, real: true }, 0.8);
    if (!l) return null;
    const ask = rng.pick(['Dr', 'Cr', 'close'] as const);
    const show = `${namedIntro(rng, l.title)}\n${showItems(l)}`;
    const work = ledgerWork(l);
    if (ask === 'close') {
      return {
        prompt: `${show}\nThe account is balanced and totalled. At what total do the two sides stand?`,
        answer: l.big,
        commonErrors: [
          { value: l.small, why: 'Gave the total of the shorter side before the balance c/d is added to it.' },
          { value: l.bal, why: 'Gave the balance itself, not the total at which both sides stand.' },
          { value: l.dr + l.cr, why: 'Added the totals of both sides instead of taking the larger one.' },
        ],
        explanation: [...work.slice(0, 2), `The larger side is ${inr(l.big)}. After the balance c/d of ${inr(l.bal)} is added to the shorter side, both sides total ${inr(l.big)}.`],
        hints: ['Total each side first. Which total is larger?', 'The balance c/d is added to the shorter side, so both sides close at the total of the larger side.'],
      };
    }
    const own = ask === 'Dr' ? l.dr : l.cr;
    const other = ask === 'Dr' ? l.cr : l.dr;
    return {
      prompt: `${show}\nWhat is the total of the ${sideWord(ask)} side before the account is balanced?`,
      answer: own,
      commonErrors: [
        { value: other, why: 'Gave the total of the other side.' },
        { value: l.dr + l.cr, why: 'Added both sides together.' },
        { value: l.bal, why: 'Gave the balance instead of the total of the side.' },
      ],
      explanation: [work[ask === 'Dr' ? 0 : 1]],
      hints: [`Pick out only the items marked ${sideWord(ask)}.`, 'The total of a side is the sum of its items; an opening balance brought down counts as an item of its side.'],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    if (q.prompt.includes('debit side before')) return q.answer === dr;
    if (q.prompt.includes('credit side before')) return q.answer === cr;
    return q.answer === Math.max(dr, cr);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-who-owes: who owes whom, from a personal account (mcq)
// ---------------------------------------------------------------------------------------------------------------

const whoOwes = mcqTemplate({
  id: 'led-who-owes',
  version: 2,
  topicId: T,
  conceptId: 'led-personal',
  difficulty: 'easy',
  generate: (rng) => {
    const l = makeLedger(rng, rng.pick([K.debtor, K.creditor]), { opening: rng.next() < 0.4, natural: true, real: true });
    if (!l) return null;
    const p = l.kind.key === 'debtor' ? l.d : l.c;
    const owes = (s: Side, x: number) => (s === 'Dr' ? `${p} owes the firm ${inr(x)}` : `The firm owes ${p} ${inr(x)}`);
    return {
      prompt: `${namedIntro(rng, l.title)}\n${showItems(l)}\nThe account is balanced. Who owes whom, and how much?`,
      correct: owes(l.balSide, l.bal),
      distractors: [
        {
          text: owes(opp(l.balSide), l.bal),
          why:
            l.balSide === 'Dr'
              ? 'Read a debit balance as money the firm owes. In a personal account a debit balance means the person owes the firm.'
              : 'Read a credit balance as money the person owes. In a personal account a credit balance means the firm owes the person.',
        },
        { text: owes(l.balSide, l.big), why: 'Gave the total of the larger side, not the difference between the two sides.' },
        { text: owes(l.balSide, l.dr + l.cr), why: 'Added both sides together instead of finding the difference.' },
        { text: owes(opp(l.balSide), l.small), why: 'Took the smaller side as the balance and also read it the wrong way round.' },
      ],
      explanation: `${ledgerWork(l).join(' ')} A ${sideWord(l.balSide)} balance in a personal account means ${l.balSide === 'Dr' ? 'the person owes the firm' : 'the firm owes the person'}.`,
      hints: ['Find the balance first: total each side and take the difference. Which side is larger?', RULE_PERSONAL],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    const text = q.options.find((o) => o.id === q.correct)?.text ?? '';
    return text.endsWith(inr(Math.abs(dr - cr))) && (dr > cr ? text.includes(' owes the firm ') : text.startsWith('The firm owes'));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-balance-after-item: one more item is posted (numeric)
// ---------------------------------------------------------------------------------------------------------------

interface Move {
  title: (d: string, c: string) => string;
  nature: Side;
  inc: (x: string, d: string, c: string) => string;
  dec: (x: string, d: string, c: string) => string;
}

const MOVES: Move[] = [
  { title: () => 'Cash A/c', nature: 'Dr', inc: (x) => `Cash sales of ${x} are now posted`, dec: (x) => `Rent of ${x} paid in cash is now posted` },
  {
    title: (d) => `${d} A/c (the account of a customer)`,
    nature: 'Dr',
    inc: (x) => `Goods worth ${x} sold to the customer on credit are now posted`,
    dec: (x) => `The customer's payment of ${x} in cash is now posted`,
  },
  {
    title: (_d, c) => `${c} A/c (the account of a supplier)`,
    nature: 'Cr',
    inc: (x) => `Goods worth ${x} bought from the supplier on credit are now posted`,
    dec: (x) => `The firm's payment of ${x} to the supplier in cash is now posted`,
  },
  {
    title: () => 'Bank Loan A/c',
    nature: 'Cr',
    inc: (x) => `A further loan of ${x} received from the bank is now posted`,
    dec: (x) => `An instalment of ${x} repaid to the bank is now posted`,
  },
  {
    title: () => 'Furniture A/c',
    nature: 'Dr',
    inc: (x) => `New furniture costing ${x} is now posted`,
    dec: (x) => `Old furniture sold at its book value of ${x} is now posted`,
  },
];

const balanceAfterItem = numeric({
  id: 'led-balance-after-item',
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const m = rng.pick(MOVES);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const bRupees = rng.step(20000, 120000, 5000);
    const b = rupees(bRupees);
    const x = amount(rng, 5000, bRupees - 5000, 5000);
    const increases = rng.next() < 0.5;
    const ans = increases ? b + x : b - x;
    const side = sideWord(m.nature);
    return {
      prompt: `${m.title(d, c)} shows a ${side} balance of ${inr(b)}. ${(increases ? m.inc : m.dec)(inr(x), d, c)}. What is the balance of the account now?`,
      answer: ans,
      commonErrors: increases
        ? [
            { value: b - x, why: 'Deducted the new item although it is posted on the same side as the balance, so it adds to it.' },
            { value: x, why: 'Gave only the new item and forgot the balance already in the account.' },
          ]
        : [
            { value: b + x, why: 'Added the new item although it is posted on the opposite side to the balance, so it reduces it.' },
            { value: x, why: 'Gave only the new item and forgot the balance already in the account.' },
          ],
      explanation: [
        `A ${side} balance increases with items on the ${side} side and decreases with items on the ${sideWord(opp(m.nature))} side.`,
        `This item is posted on the ${sideWord(increases ? m.nature : opp(m.nature))} side of the account, so it ${increases ? 'adds to' : 'reduces'} the balance.`,
        `${inr(b)} ${increases ? '+' : '-'} ${inr(x)} = ${inr(ans)}.`,
      ],
      hints: ['On which side of this account is the new item posted: the side of the balance, or the opposite side?', 'An item on the same side as the balance adds to it; an item on the opposite side reduces it.'],
    };
  },
  verify: (q) => {
    const [b, x] = amountsIn(q.prompt);
    const up = /Cash sales of|sold to the customer on credit|bought from the supplier on credit|A further loan of|New furniture costing/.test(q.prompt);
    return q.answer === (up ? b + x : b - x);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-balance-from-totals: balance and totals of the two sides (numeric)
// ---------------------------------------------------------------------------------------------------------------

const balanceFromTotals = numeric({
  id: 'led-balance-from-totals',
  topicId: T,
  conceptId: 'led-balances',
  difficulty: 'easy',
  unit: 'rupees',
  generate: (rng) => {
    const kind = rng.pick([K.cash, K.bank, K.debtor, K.creditor, K.loan]);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const title = kind.title(d, c);
    const small = amount(rng, 20000, 180000, 5000);
    const bal = amount(rng, 10000, 120000, 5000);
    const big = small + bal;
    const bs = kind.nature;
    const ss = opp(kind.nature);
    const ask = rng.pick(['balance', 'big', 'small'] as const);
    if (ask === 'balance') {
      return {
        prompt: `Before balancing, the ${sideWord(bs)} side of ${title} totals ${inr(big)} and the ${sideWord(ss)} side totals ${inr(small)}. What is the balance?`,
        answer: bal,
        commonErrors: [
          { value: big + small, why: 'Added the two sides instead of finding their difference.' },
          { value: big, why: 'Gave the total of the larger side as the balance.' },
          { value: small, why: 'Gave the total of the smaller side as the balance.' },
        ],
        explanation: [`Balance = larger side - smaller side = ${inr(big)} - ${inr(small)} = ${inr(bal)}, a ${sideWord(bs)} balance.`],
        hints: ['The balance is the gap between the totals of the two sides.', 'Larger side = smaller side + balance, so each of the three figures can be found from the other two.'],
      };
    }
    if (ask === 'big') {
      return {
        prompt: `${title} shows a ${sideWord(bs)} balance of ${inr(bal)}, and the ${sideWord(ss)} side totals ${inr(small)}. What is the total of the ${sideWord(bs)} side?`,
        answer: big,
        commonErrors: [
          { value: Math.abs(small - bal), why: 'Deducted the balance from the other side instead of adding it.' },
          { value: bal, why: 'Gave the balance, not the total of the side.' },
          { value: small, why: 'Gave the total of the other side.' },
        ],
        explanation: [`The balance is the excess of the ${sideWord(bs)} side over the ${sideWord(ss)} side.`, `${cap(sideWord(bs))} total = ${inr(small)} + ${inr(bal)} = ${inr(big)}.`],
        hints: ['The balance is the gap between the totals of the two sides.', 'Larger side = smaller side + balance, so each of the three figures can be found from the other two.'],
      };
    }
    return {
      prompt: `${title} shows a ${sideWord(bs)} balance of ${inr(bal)}, and the ${sideWord(bs)} side totals ${inr(big)}. What is the total of the ${sideWord(ss)} side?`,
      answer: small,
      commonErrors: [
        { value: big + bal, why: 'Added the balance to the larger side instead of deducting it.' },
        { value: bal, why: 'Gave the balance, not the total of the side.' },
        { value: big, why: 'Gave the total of the other side.' },
      ],
      explanation: [`The balance is the excess of the ${sideWord(bs)} side over the ${sideWord(ss)} side.`, `${cap(sideWord(ss))} total = ${inr(big)} - ${inr(bal)} = ${inr(small)}.`],
      hints: ['The balance is the gap between the totals of the two sides.', 'Larger side = smaller side + balance, so each of the three figures can be found from the other two.'],
    };
  },
  verify: (q) => {
    const [a0, a1] = amountsIn(q.prompt);
    const given = /shows an? (debit|credit) balance of/.exec(q.prompt);
    if (!given) return q.answer === Math.abs(a0 - a1);
    const asked = /total of the (debit|credit) side\?$/.exec(q.prompt)?.[1];
    return asked === given[1] ? q.answer === a0 + a1 : q.answer === Math.abs(a0 - a1);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// MEDIUM. led-balance-transactions: cash balance from transactions, some of which do not touch cash (numeric)
// ---------------------------------------------------------------------------------------------------------------

const balanceTransactions = numeric({
  id: 'led-balance-transactions',
  version: 2,
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const l = makeLedger(rng, K.cash, { opening: true, natural: true, running: true, n: [4, 5], noise: rng.int(1, 2), real: true });
    const firm = rng.pick(BUSINESSES);
    if (!l) return null;
    const open = openingOf(l)!;
    const traps = l.items.filter((i) => i.skip);
    const live = liveItems(l);
    const trapped = l.bal + sum(traps.map((i) => (i.side === 'Dr' ? i.amt : -i.amt)));
    return {
      prompt: `Cash A/c of ${firm} opened the month with a debit balance (cash in hand). The transactions of the month were:\n${hideItems(l)}\nPost to Cash A/c the items that belong in it. What is the closing balance of Cash A/c?`,
      answer: l.bal,
      commonErrors: [
        { value: trapped, why: 'Counted credit sales, credit purchases or goods sent back as cash received or paid. No cash moves until the party is settled.' },
        { value: Math.abs(l.bal - open.amt), why: 'Left out the opening cash balance.' },
        { value: sum(l.items.map((i) => i.amt)), why: 'Added every amount in the list, whichever side it belongs to.' },
        { value: Math.abs(l.bal - 2 * open.amt), why: 'Took the opening cash as a payment instead of a receipt.' },
      ],
      explanation: [
        sumLine('Cash received (debit side)', live.filter((i) => i.side === 'Dr').map((i) => i.amt), l.dr),
        sumLine('Cash paid (credit side)', live.filter((i) => i.side === 'Cr').map((i) => i.amt), l.cr),
        stop(`Not posted in Cash A/c, because no cash moves: ${traps.map((i) => i.text).join('; ')}`),
        `Closing balance = ${inr(l.dr)} - ${inr(l.cr)} = ${inr(l.bal)}, a debit balance.`,
      ],
      hints: ['For each item ask: did cash come in, go out, or not move at all?', KIND_RULE.cash],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    return dr > cr && q.answer === dr - cr;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-personal-transactions: who owes whom from described transactions (mcq)
// ---------------------------------------------------------------------------------------------------------------

const personalTransactions = mcqTemplate({
  id: 'led-personal-transactions',
  version: 2,
  topicId: T,
  conceptId: 'led-personal',
  difficulty: 'medium',
  generate: (rng) => {
    const l = makeLedger(rng, rng.pick([K.debtor, K.creditor]), { opening: rng.next() < 0.5, natural: true, n: [4, 5], real: true });
    if (!l) return null;
    const p = l.kind.key === 'debtor' ? l.d : l.c;
    const owes = (s: Side, x: number) => (s === 'Dr' ? `${p} owes the firm ${inr(x)}` : `The firm owes ${p} ${inr(x)}`);
    const returns = l.items.filter((i) => /returned/.test(i.text)).map((i) => i.amt);
    const distractors: Distractor[] = [
      {
        text: owes(opp(l.balSide), l.bal),
        why:
          l.balSide === 'Dr'
            ? 'Read a debit balance as money the firm owes. A debit balance in a personal account means the person owes the firm.'
            : 'Read a credit balance as money the person owes. A credit balance means the firm owes the person.',
      },
      { text: owes(l.balSide, l.big), why: 'Gave the total of the larger side, not the difference between the two sides.' },
      { text: owes(l.balSide, l.dr + l.cr), why: 'Added both sides together instead of finding the difference.' },
    ];
    if (returns.length) {
      distractors.push({
        text: owes(l.balSide, l.bal + 2 * sum(returns)),
        why: 'Posted the goods returned on the same side as the goods supplied, so they were added to the balance instead of being deducted.',
      });
    }
    return {
      prompt: `${namedHiddenIntro(rng, roleTitle(l))}\n${hideItems(l)}\nAfter all these are posted and the account is balanced, who owes whom, and how much?`,
      correct: owes(l.balSide, l.bal),
      distractors,
      explanation: `${namedWork(l).join(' ')} A ${sideWord(l.balSide)} balance in a personal account means ${l.balSide === 'Dr' ? 'the person owes the firm' : 'the firm owes the person'}.`,
      hints: [KIND_RULE[l.kind.key], RULE_PERSONAL],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    const text = q.options.find((o) => o.id === q.correct)?.text ?? '';
    return dr !== cr && text.endsWith(inr(Math.abs(dr - cr))) && (dr > cr ? text.includes(' owes the firm ') : text.startsWith('The firm owes'));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-posting-compound: the amount posted in an account for a settlement with discount (numeric)
// ---------------------------------------------------------------------------------------------------------------

const postingCompound = numeric({
  id: 'led-posting-compound',
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const isDebtor = rng.next() < 0.5;
    const who = isDebtor ? rng.pick(DEBTORS) : rng.pick(CREDITORS);
    const f = amount(rng, 10000, 90000, 5000);
    const pct = rng.pick([2, 4, 5]);
    const ds = percentOf(f, pct);
    const c = f - ds;
    const how = rng.pick(['in cash', 'by cheque']);
    const acct = isDebtor ? 'Discount Allowed A/c' : 'Discount Received A/c';
    const intro = isDebtor
      ? `${who} owed the firm ${inr(f)}`
      : `The firm owed ${who} ${inr(f)}`;
    const ask = rng.pick(['party', 'discount', 'cash'] as const);
    const money = how === 'in cash' ? 'Cash A/c' : 'Bank A/c';
    // The journal entry in the usual form: the debits first, then the credits with "To".
    const entry = isDebtor
      ? [`${money} Dr ${inr(c)}`, `Discount Allowed A/c Dr ${inr(ds)}`, `To ${who} A/c ${inr(f)}`]
      : [`${who} A/c Dr ${inr(f)}`, `To ${money} ${inr(c)}`, `To Discount Received A/c ${inr(ds)}`];
    const story = (given: string) => `${intro} and settled the account in full ${how}, ${given}.`;
    const hints = [
      'Write the journal entry for the settlement: it has three lines, the party, the money and the discount.',
      `The party's account is cleared by the whole amount owed. The money goes to ${money} and the difference to ${acct}.`,
    ];
    if (ask === 'party') {
      return {
        prompt: `${story(`paying ${inr(c)} and getting a discount of ${inr(ds)}`)} What is the total amount posted to ${who} A/c for this settlement?`,
        answer: f,
        commonErrors: [
          { value: c, why: `Posted only the money ${isDebtor ? 'received' : 'paid'}. The party's account is cleared by the money and the discount together.` },
          { value: ds, why: 'Posted only the discount.' },
          { value: f + ds, why: 'Added the discount to the whole amount, counting it twice.' },
        ],
        explanation: [
          `Entry: ${entry.join('; ')}.`,
          `${who} A/c is ${isDebtor ? 'credited' : 'debited'} with the whole amount settled: ${inr(c)} + ${inr(ds)} = ${inr(f)}.`,
        ],
        hints,
      };
    }
    if (ask === 'discount') {
      return {
        prompt: `${story(`paying ${inr(c)}`)} What amount is posted to ${acct}?`,
        answer: ds,
        commonErrors: [
          { value: c, why: `Posted the money ${isDebtor ? 'received' : 'paid'} instead of the discount.` },
          { value: f, why: 'Posted the whole amount owed instead of the discount.' },
          { value: f + ds, why: 'Added the discount to the whole amount.' },
        ],
        explanation: [`Discount = ${inr(f)} - ${inr(c)} = ${inr(ds)}.`, `Entry: ${entry.join('; ')}.`],
        hints,
      };
    }
    return {
      prompt: `${story(`the firm ${isDebtor ? 'allowing' : 'getting'} a discount of ${pct}%`)} What amount is posted to ${money}?`,
      answer: c,
      commonErrors: [
        { value: f, why: 'Posted the whole amount owed in the cash or bank account. The discount is not money.' },
        { value: ds, why: 'Posted the discount instead of the money.' },
        { value: f + ds, why: 'Added the discount to the amount owed.' },
      ],
      explanation: [
        `Discount = ${pct}% of ${inr(f)} = ${inr(ds)}.`,
        `Money ${isDebtor ? 'received' : 'paid'} = ${inr(f)} - ${inr(ds)} = ${inr(c)}.`,
        `Entry: ${entry.join('; ')}.`,
      ],
      hints,
    };
  },
  verify: (q) => {
    const a = amountsIn(q.prompt);
    if (/posted to Discount (Allowed|Received) A\/c\?$/.test(q.prompt)) return q.answer === a[0] - a[1];
    if (/posted to (Cash|Bank) A\/c\?$/.test(q.prompt)) {
      const pct = Number(/discount of (\d+)%/.exec(q.prompt)?.[1]);
      return Number.isFinite(pct) && q.answer === a[0] - percentOf(a[0], pct);
    }
    return q.answer === a[1] + a[2];
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-posting-compound-words: how the settlement entry reads in the ledger (mcq)
// ---------------------------------------------------------------------------------------------------------------

const quoted = (prefix: string, name: string, x: number) => `"${prefix} ${name}" ${inr(x)}`;

const postingCompoundWords = mcqTemplate({
  id: 'led-posting-compound-words',
  topicId: T,
  conceptId: 'led-to-by',
  difficulty: 'medium',
  generate: (rng) => {
    const isDebtor = rng.next() < 0.5;
    const who = isDebtor ? rng.pick(DEBTORS) : rng.pick(CREDITORS);
    const f = amount(rng, 10000, 90000, 5000);
    const ds = percentOf(f, rng.pick([2, 4, 5]));
    const c = f - ds;
    const inCash = rng.next() < 0.5;
    const money = inCash ? 'Cash A/c' : 'Bank A/c';
    const disc = isDebtor ? 'Discount Allowed A/c' : 'Discount Received A/c';
    // The side of the party's account is opposite to the side of the money and the discount accounts.
    const partySide: Side = isDebtor ? 'Cr' : 'Dr';
    const homeSide = opp(partySide);
    const story = isDebtor
      ? `${who} owed the firm ${inr(f)} and settled it ${inCash ? 'in cash' : 'by cheque'} for ${inr(c)}, the firm allowing a discount of ${inr(ds)}.`
      : `The firm owed ${who} ${inr(f)} and settled it ${inCash ? 'in cash' : 'by cheque'} for ${inr(c)}, getting a discount of ${inr(ds)}.`;
    const ask = rng.pick(['party', 'money', 'discount'] as const);
    const hints = [
      `Write the journal entry first. Which of its accounts are debited and which credited?`,
      `${RULE_TO_BY} An account that has two other accounts in the entry shows one item for each of them.`,
    ];
    if (ask === 'party') {
      const p = pre(partySide);
      const q = pre(homeSide);
      const full = (pf: string, s: Side) => `${quoted(pf, money, c)} and ${quoted(pf, disc, ds)}, on the ${sideWord(s)} side`;
      return {
        prompt: `${story} The entry is posted to the ledger. How is it written in ${who} A/c?`,
        correct: full(p, partySide),
        distractors: [
          { text: full(q, partySide), why: `Used the wrong word: items on the ${sideWord(partySide)} side begin with "${p}".` },
          {
            text: full(q, homeSide),
            why: `Posted on the wrong side. A ${isDebtor ? "customer's" : "supplier's"} account is ${isDebtor ? 'credited when the customer pays' : 'debited when the supplier is paid'}.`,
          },
          { text: `${quoted(p, money, c)}, on the ${sideWord(partySide)} side`, why: "Left out the discount. The party's account must also be cleared by the discount, or a balance is left behind." },
          { text: `${quoted(p, money, f)}, on the ${sideWord(partySide)} side`, why: 'Posted the whole amount settled against the money account, forgetting that part of it was discount.' },
        ],
        explanation: `${who} A/c is ${isDebtor ? 'credited' : 'debited'} by ${inr(f)} in all: ${inr(c)} against ${money} and ${inr(ds)} against ${disc}. Items on the ${sideWord(partySide)} side begin with "${p}".`,
        hints,
      };
    }
    const home = ask === 'money' ? money : disc;
    const x = ask === 'money' ? c : ds;
    const alt = ask === 'money' ? ds : c;
    const p = pre(homeSide);
    const q = pre(partySide);
    const text = (pf: string, s: Side, y: number) => `${quoted(pf, `${who} A/c`, y)}, on the ${sideWord(s)} side`;
    return {
      prompt: `${story} The entry is posted to the ledger. How is it written in ${home}?`,
      correct: text(p, homeSide, x),
      distractors: [
        { text: text(q, homeSide, x), why: `Used the wrong word: items on the ${sideWord(homeSide)} side begin with "${p}".` },
        { text: text(q, partySide, x), why: `Posted on the wrong side. ${home} is ${isDebtor ? 'debited' : 'credited'} here.` },
        { text: text(p, homeSide, f), why: 'Posted the whole amount owed instead of the part that belongs to this account.' },
        { text: text(p, homeSide, alt), why: `Posted the ${ask === 'money' ? 'discount' : 'money'} here instead of the ${ask === 'money' ? 'money' : 'discount'}.` },
      ],
      explanation: `${home} is ${isDebtor ? 'debited' : 'credited'} by ${inr(x)}, so the item is on the ${sideWord(homeSide)} side and begins with "${p}". The Particulars name the other account of the entry, ${who} A/c.`,
      hints,
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-balance-side-transactions: debit or credit balance from described transactions (mcq)
// ---------------------------------------------------------------------------------------------------------------

const balanceSideTransactions = mcqTemplate({
  id: 'led-balance-side-transactions',
  version: 2,
  topicId: T,
  conceptId: 'led-balances',
  difficulty: 'medium',
  generate: (rng) => {
    const l = anyLedger(rng, [K.bank, K.debtor, K.creditor], { opening: true, n: [4, 5], real: true }, 0.5);
    if (!l) return null;
    return balanceMcq(
      l,
      `${namedHiddenIntro(rng, roleTitle(l))}\n${hideItems(l)}\nPost the items, balance the account, and state the balance: its amount, and whether it is a debit or a credit balance.`,
      hiddenHints(l),
      namedWork(l),
    );
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    return dr !== cr && q.options.find((o) => o.id === q.correct)?.text === balText(dr > cr ? 'Dr' : 'Cr', Math.abs(dr - cr));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-unusual-balance: an account showing the balance of the other side (mcq)
// ---------------------------------------------------------------------------------------------------------------

interface Odd {
  normal: Side;
  subject: (d: string, c: string) => string;
  right: (x: string, d: string, c: string) => string;
  wrong: (x: string, d: string, c: string) => Distractor[];
  explanation: string;
}

const ODD: Odd[] = [
  {
    normal: 'Dr',
    subject: () => 'Cash A/c',
    right: () => 'It signals a posting error: payments cannot exceed the cash available, so the account must be checked',
    wrong: (x) => [
      { text: `The firm has overdrawn its cash and owes ${x} to the cashier`, why: 'Treated Cash like a bank account. A bank account can be overdrawn, but cash in hand cannot.' },
      { text: `The firm has ${x} more cash in hand than the books show`, why: 'Read a credit balance as extra cash. Cash in hand is a debit balance.' },
      { text: `The firm owes ${x} to the owner for cash brought in`, why: 'Mixed Cash up with Capital. A credit balance in Cash A/c is not a debt to the owner.' },
    ],
    explanation: 'Cash in hand is an asset and cannot be negative, so a credit balance in Cash A/c means a payment was wrongly posted, or a receipt was left out.',
  },
  {
    normal: 'Dr',
    subject: () => 'Bank A/c',
    right: (x) => `The firm has overdrawn its bank account by ${x} and owes that amount to the bank`,
    wrong: (x) => [
      { text: `The bank owes the firm ${x}`, why: "Read a credit balance as money the bank owes the firm. In the firm's books it means more was paid out than paid in." },
      { text: 'A bank balance can never be a credit balance, so the account must contain a posting error', why: 'Thought a bank balance can never be credit. An overdraft is allowed, and it shows as a credit balance.' },
      { text: `The firm has deposited ${x} more than it has withdrawn`, why: 'Reversed the meaning: deposits in excess of payments give a debit balance, not a credit balance.' },
    ],
    explanation: 'A credit balance in Bank A/c means the firm has drawn more than it deposited: a bank overdraft, which is a liability to the bank.',
  },
  {
    normal: 'Dr',
    subject: (d) => `The account of ${d}, a customer,`,
    right: (x) => `The customer has paid ${x} more than was owed, so the firm owes the customer that amount`,
    wrong: (x) => [
      { text: `The customer owes the firm ${x}`, why: 'Read a credit balance as a debt of the customer. A debit balance would mean that.' },
      { text: "The account must have been posted wrongly, since a customer's account never shows a credit balance", why: "Thought a customer's account can never show a credit balance. An advance or an overpayment gives one." },
      { text: `The firm has sold goods worth ${x} to the customer and has not yet been paid`, why: 'Reversed the meaning: unpaid credit sales give a debit balance.' },
    ],
    explanation: 'A customer normally owes the firm (debit). A credit balance means the customer has paid in advance or paid too much, so the firm now owes the customer.',
  },
  {
    normal: 'Cr',
    subject: (_d, c) => `The account of ${c}, a supplier,`,
    right: (x) => `The firm has paid the supplier ${x} more than it owed, so the supplier owes the firm that amount`,
    wrong: (x) => [
      { text: `The firm still owes the supplier ${x}`, why: 'Read a debit balance as a debt of the firm. A credit balance would mean that.' },
      { text: "The account must have been posted wrongly, since a supplier's account never shows a debit balance", why: "Thought a supplier's account can never show a debit balance. An advance or an overpayment gives one." },
      { text: `The supplier has supplied goods worth ${x} that the firm has not yet paid for`, why: 'Reversed the meaning: unpaid credit purchases give a credit balance.' },
    ],
    explanation: 'A supplier is normally owed money (credit). A debit balance means the firm has paid in advance or paid too much, so the supplier now owes the firm.',
  },
];

const unusualBalance = mcqTemplate({
  id: 'led-unusual-balance',
  topicId: T,
  conceptId: 'led-normal',
  difficulty: 'medium',
  generate: (rng) => {
    const o = rng.pick(ODD);
    const x = inr(amount(rng, 2000, 90000, 500));
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    return {
      prompt: `${o.subject(d, c)} normally shows a ${sideWord(o.normal)} balance. At the end of the year it shows a ${sideWord(opp(o.normal))} balance of ${x}. What does this tell you?`,
      correct: o.right(x, d, c),
      distractors: o.wrong(x, d, c),
      explanation: o.explanation,
      hints: [
        'Ask who owes money to whom when the balance lies on this side of the account.',
        'A debit balance is something the firm has or is owed. A credit balance is something the firm owes. Cash in hand can never be less than nothing.',
      ],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-normal-contra: accounts whose normal balance is the opposite of their group (mcq)
// ---------------------------------------------------------------------------------------------------------------

interface Contra {
  name: string;
  /** What the account records, so that the question can be answered before the topic that uses the account. */
  about: string;
  group: string;
  right: string;
  wrong: Distractor[];
  explanation: string;
}

// Interest on drawings of a sole proprietor is beyond the 2025-26 syllabus: it is not among these (version 2 of
// led-normal-contra took it out).
const CONTRA: Contra[] = [
  {
    name: 'Drawings A/c',
    about: 'Drawings A/c records what the owner takes out of the business for personal use.',
    group: 'capital, which has a credit balance',
    right: 'Debit balance, because it reduces capital',
    wrong: [
      { text: 'Credit balance, because it is part of capital', why: 'Treated Drawings as capital itself. It is deducted from capital, so it sits on the opposite side.' },
      { text: 'Credit balance, because cash is paid out', why: 'Confused the account with Cash, which is credited when money goes out. The Drawings account is the one debited.' },
      { text: 'Debit balance, because it is an expense of the business', why: 'Right side, wrong reason. Drawings are personal; they are debited because they reduce capital, not because they are a business expense.' },
    ],
    explanation: 'Drawings are deducted from capital, so the account has a debit balance, the opposite of capital.',
  },
  {
    name: 'Sales Return A/c',
    about: 'Sales Return A/c records goods that customers send back.',
    group: 'sales, which has a credit balance',
    right: 'Debit balance, because it reduces sales',
    wrong: [
      { text: 'Credit balance, because it is an income', why: 'Took Sales Return as an income like Sales. It is a deduction from sales.' },
      { text: 'Credit balance, because goods come back into the business', why: 'Followed the goods instead of the effect on sales. Returns cut down sales, so the account is debited.' },
      { text: 'Debit balance, because it is an expense of the business', why: 'Right side, wrong reason. It is debited because it is deducted from sales, not because it is an expense.' },
    ],
    explanation: 'Sales Return is deducted from Sales, so it has a debit balance, the opposite of Sales.',
  },
  {
    name: 'Purchases Return A/c',
    about: 'Purchases Return A/c records goods that the business sends back to its suppliers.',
    group: 'purchases, which has a debit balance',
    right: 'Credit balance, because it reduces purchases',
    wrong: [
      { text: 'Debit balance, because it is an expense', why: 'Took Purchases Return as an expense like Purchases. It is a deduction from purchases.' },
      { text: 'Debit balance, because goods go out of the business', why: 'Followed the goods instead of the effect on purchases. Returns cut down purchases, so the account is credited.' },
      { text: 'Credit balance, because it is an income of the business', why: 'Right side, wrong reason. It is credited because it is deducted from purchases, not because it is an income.' },
    ],
    explanation: 'Purchases Return is deducted from Purchases, so it has a credit balance, the opposite of Purchases.',
  },
  {
    name: 'Provision for Depreciation A/c',
    about: 'Provision for Depreciation A/c collects, year after year, the depreciation charged on fixed assets, while the assets stay in their own accounts at cost.',
    group: 'fixed assets, which have debit balances',
    right: 'Credit balance, because it reduces the value of fixed assets',
    wrong: [
      { text: 'Debit balance, because it is related to an asset', why: 'Followed the asset it belongs to. The provision is deducted from the asset, so it has the opposite balance.' },
      { text: 'Debit balance, because depreciation is an expense', why: 'Confused it with the Depreciation expense account, which is debited. The provision account is credited.' },
      { text: 'Credit balance, because it is a liability to outsiders', why: 'Right side, wrong reason. Nothing is owed to outsiders; the credit balance reduces the value of the fixed assets.' },
    ],
    explanation: 'The provision is deducted from the fixed assets in the balance sheet, so it has a credit balance.',
  },
  {
    name: 'Provision for Doubtful Debts A/c',
    about: 'Provision for Doubtful Debts A/c holds an amount kept aside for debtors who may not pay.',
    group: 'debtors, which have debit balances',
    right: 'Credit balance, because it reduces the value of debtors',
    wrong: [
      { text: 'Debit balance, because debtors have a debit balance', why: 'Followed the debtors it belongs to. The provision is deducted from debtors, so it has the opposite balance.' },
      { text: 'Debit balance, because bad debts are an expense', why: 'Confused it with the Bad Debts expense account, which is debited. The provision account is credited.' },
      { text: 'Credit balance, because it is an amount payable to debtors', why: 'Right side, wrong reason. Nothing is payable to debtors; the credit balance reduces the value of debtors.' },
    ],
    explanation: 'The provision is deducted from debtors in the balance sheet, so it has a credit balance.',
  },
  {
    name: 'Interest on Capital A/c',
    about: 'Interest on Capital A/c records the interest that a business allows its owner on capital.',
    group: 'capital, which has a credit balance',
    right: 'Debit balance, because it is an expense of the business',
    wrong: [
      { text: 'Credit balance, because it is linked to capital', why: 'Followed the capital it is calculated on. The interest is paid to the owner, so for the business it is an expense and is debited.' },
      { text: 'Credit balance, because the owner receives it', why: 'Looked at who receives it instead of who pays. For the business it is an expense, so it is debited.' },
      { text: 'Debit balance, because it reduces the owner\'s capital', why: 'Right side, wrong reason. It is debited because it is an expense of the business; it is credited to the owner\'s capital, not deducted from it.' },
    ],
    explanation: 'The business allows its owner interest on capital, so for the business it is an expense and the account has a debit balance, unlike Capital itself.',
  },
];

const normalContra = mcqTemplate({
  id: 'led-normal-contra',
  version: 2,
  topicId: T,
  conceptId: 'led-normal',
  difficulty: 'medium',
  generate: (rng) => {
    const c = rng.pick(CONTRA);
    const ask = rng.pick([
      `${c.about} It is linked to ${c.group}. Which statement about the normal balance of ${c.name} is correct?`,
      `${c.about} What is the normal balance of this account, and why?`,
      `${c.about} It is linked to ${c.group}. Which statement gives the normal balance of ${c.name} and the correct reason for it?`,
    ]);
    return {
      prompt: ask,
      correct: c.right,
      distractors: c.wrong,
      explanation: c.explanation,
      hints: [
        'Do not copy the balance of the account it is linked to. Ask what this account itself is to the business.',
        'An account deducted from another carries the opposite balance to it. An expense of the business has a debit balance and an income a credit balance.',
      ],
    };
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-unknown-item: the amount of one illegible item (numeric)
// ---------------------------------------------------------------------------------------------------------------

const unknownItem = numeric({
  id: 'led-unknown-item',
  version: 2,
  topicId: T,
  conceptId: 'led-balancing',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const kind = rng.pick([K.cash, K.bank, K.debtor, K.creditor]);
    const l = makeLedger(rng, kind, { opening: rng.next() < 0.5, natural: true, n: [4, 5], real: true });
    if (!l) return null;
    const miss = rng.pick(l.items.filter((i) => !i.opening));
    const lines = l.items.map((i) => (i === miss ? `• ${i.date}: ${sideWord(i.side)} amount not legible (${i.text})` : shownLine(i)));
    const signed = (i: Item) => (i.side === l.balSide ? i.amt : -i.amt);
    const known = sum(l.items.filter((i) => i !== miss).map(signed));
    // The side of the item must come to a known total: the larger side as it stands, or the larger side less the balance.
    const onBig = miss.side === l.balSide;
    const other = onBig ? l.small : l.big;
    const mustBe = onBig ? l.big : l.small;
    const readable = mustBe - miss.amt;
    return {
      prompt: `${namedIntro(rng, l.title)}\n${lines.join('\n')}\nThe account was balanced and showed a ${sideWord(l.balSide)} balance of ${inr(l.bal)}. The amount of one item cannot be read. What is it?`,
      answer: miss.amt,
      commonErrors: [
        { value: l.bal, why: 'Gave the closing balance itself as the missing item.' },
        { value: Math.abs(l.bal + known), why: 'Added the balance to the net of the items that can be read, instead of taking the difference between them.' },
        { value: Math.abs(known), why: 'Gave only the net of the items that can be read and ignored the balance.' },
      ],
      explanation: [
        `The ${sideWord(opp(miss.side))} side totals ${inr(other)}.`,
        `A ${sideWord(l.balSide)} balance of ${inr(l.bal)} means the ${sideWord(l.balSide)} side is larger by that amount, so the ${sideWord(miss.side)} side must total ${inr(other)} ${onBig ? '+' : '-'} ${inr(l.bal)} = ${inr(mustBe)}.`,
        readable > 0
          ? `The items that can be read on the ${sideWord(miss.side)} side total ${inr(readable)}, so the missing item is ${inr(mustBe)} - ${inr(readable)} = ${inr(miss.amt)}.`
          : `It is the only item on the ${sideWord(miss.side)} side, so the missing item is ${inr(miss.amt)}.`,
      ],
      hints: [
        'Total the side that can be read in full. What must the other side come to, given the balance?',
        'Larger side = smaller side + balance. The missing item is whatever its side still needs to reach its total.',
      ],
    };
  },
  verify: (q) => {
    const bal = amountsIn(q.prompt.slice(q.prompt.lastIndexOf('balance of')))[0];
    const balSide: Side = /showed a debit balance/.test(q.prompt) ? 'Dr' : 'Cr';
    let known = 0;
    let missSide: Side | null = null;
    for (const raw of q.prompt.split('\n')) {
      const m = /^• \d+ [A-Za-z]+: (debit|credit) (amount not legible|₹[\d,]+)/.exec(raw);
      if (!m) continue;
      const side: Side = m[1] === 'debit' ? 'Dr' : 'Cr';
      if (m[2] === 'amount not legible') missSide = side;
      else known += (side === balSide ? 1 : -1) * parseAmt(m[2]);
    }
    return missSide !== null && q.answer === (missSide === balSide ? 1 : -1) * (bal - known);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-wrong-item: the one posting on the wrong side (mcq)
// ---------------------------------------------------------------------------------------------------------------

interface Posting {
  /** The transaction, so that the right side of the posting does not have to be guessed from the account name. */
  tx: string;
  /** The other account of the entry, which the Particulars name. */
  name: string;
  side: Side;
  /** A discount: a small amount beside the others. */
  small?: boolean;
}
interface Pool {
  title: string;
  postings: Posting[];
  reason: Record<Side, string>;
  rule: string;
}

const POOLS: Record<'cash' | 'debtor' | 'creditor', Pool> = {
  cash: {
    title: 'Cash A/c',
    postings: [
      { tx: 'goods sold for cash', name: 'Sales A/c', side: 'Dr' },
      { tx: 'cash received from {d}, a customer', name: '{d} A/c', side: 'Dr' },
      { tx: 'cash brought in by the owner as capital', name: 'Capital A/c', side: 'Dr' },
      { tx: 'commission received in cash', name: 'Commission Received A/c', side: 'Dr' },
      { tx: 'interest received in cash', name: 'Interest Received A/c', side: 'Dr' },
      { tx: 'goods bought for cash', name: 'Purchases A/c', side: 'Cr' },
      { tx: 'rent paid in cash', name: 'Rent A/c', side: 'Cr' },
      { tx: 'salaries paid in cash', name: 'Salaries A/c', side: 'Cr' },
      { tx: 'cash paid to {c}, a supplier', name: '{c} A/c', side: 'Cr' },
      { tx: 'cash taken by the owner for personal use', name: 'Drawings A/c', side: 'Cr' },
      { tx: 'furniture bought for cash', name: 'Furniture A/c', side: 'Cr' },
      { tx: 'wages paid in cash', name: 'Wages A/c', side: 'Cr' },
    ],
    reason: {
      Dr: 'Cash received is debited to Cash A/c, so "To ..." on the debit side is right.',
      Cr: 'Cash paid is credited to Cash A/c, so "By ..." on the credit side is right.',
    },
    rule: KIND_RULE.cash,
  },
  debtor: {
    title: '{d} A/c, the account of a customer',
    postings: [
      { tx: 'goods sold to {d} on credit', name: 'Sales A/c', side: 'Dr' },
      { tx: 'cash received from {d}', name: 'Cash A/c', side: 'Cr' },
      { tx: 'cheque received from {d}', name: 'Bank A/c', side: 'Cr' },
      { tx: 'goods returned by {d}', name: 'Sales Return A/c', side: 'Cr' },
      { tx: 'discount allowed to {d}', name: 'Discount Allowed A/c', side: 'Cr', small: true },
    ],
    reason: {
      Dr: 'Goods sold on credit increase what the customer owes, so "To ..." on the debit side is right.',
      Cr: 'Money, returns and discount reduce what the customer owes, so "By ..." on the credit side is right.',
    },
    rule: "A customer's account is debited with goods sold on credit and credited with money received, goods returned and discount allowed.",
  },
  creditor: {
    title: '{c} A/c, the account of a supplier',
    postings: [
      { tx: 'goods bought from {c} on credit', name: 'Purchases A/c', side: 'Cr' },
      { tx: 'cash paid to {c}', name: 'Cash A/c', side: 'Dr' },
      { tx: 'cheque issued to {c}', name: 'Bank A/c', side: 'Dr' },
      { tx: 'goods returned to {c}', name: 'Purchases Return A/c', side: 'Dr' },
      { tx: 'discount received from {c}', name: 'Discount Received A/c', side: 'Dr', small: true },
    ],
    reason: {
      Cr: 'Goods bought on credit increase what the firm owes, so "By ..." on the credit side is right.',
      Dr: 'Payments, returns and discount reduce what the firm owes, so "To ..." on the debit side is right.',
    },
    rule: "A supplier's account is credited with goods bought on credit and debited with payments made, goods returned and discount received.",
  },
};

const wrongItem = mcqTemplate({
  id: 'led-wrong-item',
  topicId: T,
  conceptId: 'led-errors',
  difficulty: 'medium',
  generate: (rng) => {
    const key = rng.pick(['cash', 'debtor', 'creditor'] as const);
    const pool = POOLS[key];
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const picked = rng.shuffle(pool.postings).slice(0, 4);
    const bad = rng.int(0, 3);
    const dates = dateList(rng, 4, false);
    const rows = picked.map((p, i) => {
      const posted: Side = i === bad ? opp(p.side) : p.side;
      const x = p.small ? amount(rng, 200, 2000, 100) : amount(rng, 1000, 50000, 500);
      return { p, posted, tx: fill(p.tx, d, c), name: fill(p.name, d, c), date: dates[i], x };
    });
    const title = fill(pool.title, d, c);
    const short = title.replace(/,.*$/, '');
    const opt = (r: (typeof rows)[number]) => `${r.date}: ${pre(r.posted)} ${r.name}`;
    const badRow = rows[bad];
    return {
      prompt: `These postings were made in ${title}:\n${rows
        .map((r) => `• ${r.date}: ${r.tx}, ${inr(r.x)}: posted as "${pre(r.posted)} ${r.name}" on the ${sideWord(r.posted)} side`)
        .join('\n')}\nOne of them is posted on the wrong side. Which one?`,
      correct: opt(badRow),
      distractors: rows
        .filter((_, i) => i !== bad)
        .map((r) => ({ text: opt(r), why: `Marked a correct posting as the wrong one. ${pool.reason[r.p.side]}` })),
      explanation: `The item of ${badRow.date} (${badRow.tx}) belongs on the ${sideWord(badRow.p.side)} side of ${short} as "${pre(badRow.p.side)} ${badRow.name}", but it was posted on the ${sideWord(badRow.posted)} side. ${pool.reason[badRow.p.side]}`,
      hints: ['For each line, ask whether the transaction makes the balance of this account bigger or smaller.', pool.rule],
    };
  },
  verify: (q) => {
    const title = /^These postings were made in (.*? A\/c)/.exec(q.prompt)?.[1] ?? '';
    const t = tokenise(title);
    const pool = t === 'Cash A/c' ? POOLS.cash : t === '{d} A/c' ? POOLS.debtor : t === '{c} A/c' ? POOLS.creditor : null;
    if (!pool) return false;
    const wrong: string[] = [];
    let lines = 0;
    for (const raw of q.prompt.split('\n')) {
      const m = /^• (\d+ [A-Za-z]+): (.*), ₹[\d,]+: posted as "(To|By) (.*)" on the (debit|credit) side$/.exec(raw);
      if (!m) continue;
      lines++;
      // The right side is looked up from the transaction; the word and the account named must agree with the line.
      const truth = pool.postings.find((p) => p.tx === tokenise(m[2]));
      const posted: Side = m[5] === 'debit' ? 'Dr' : 'Cr';
      if (!truth || truth.name !== tokenise(m[4]) || m[3] !== pre(posted)) return false;
      if (truth.side !== posted) wrong.push(`${m[1]}: ${m[3]} ${m[4]}`);
    }
    return lines === 4 && wrong.length === 1 && q.options.find((o) => o.id === q.correct)?.text === wrong[0];
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-total-side-transactions: total of the credit side of Sales A/c or the debit side of Purchases A/c (numeric)
// ---------------------------------------------------------------------------------------------------------------

interface SideBook {
  acct: string;
  side: Side;
  /** Transactions that are posted in the account. */
  counts: string[];
  /** Transactions that are not, each with the mistake of counting it. */
  ignores: { key: 'asset' | 'settle' | 'returns'; text: string; why: string }[];
  note: string;
}

const BOOKS: SideBook[] = [
  {
    acct: 'Sales A/c',
    side: 'Cr',
    counts: ['goods sold for cash', 'goods sold on credit to {d}'],
    ignores: [
      { key: 'asset', text: 'old furniture sold for cash', why: 'Included the sale of old furniture. That is the sale of an asset and is not posted in Sales A/c.' },
      { key: 'settle', text: 'received from {d} for goods sold last month', why: 'Included money collected from a customer. The sale was posted when the goods were sold, so the collection is not a new sale.' },
      { key: 'returns', text: 'goods returned by {d}', why: 'Deducted the goods returned by customers. Returns are posted in the separate Sales Return A/c, not in Sales A/c.' },
    ],
    note: '(Goods returned by customers are posted in a separate Sales Return A/c.)',
  },
  {
    acct: 'Purchases A/c',
    side: 'Dr',
    counts: ['goods bought for cash', 'goods bought on credit from {c}'],
    ignores: [
      { key: 'asset', text: 'machinery bought on credit from {c}', why: 'Included the purchase of machinery. That is an asset and is not posted in Purchases A/c.' },
      { key: 'settle', text: 'paid to {c} for goods bought last month', why: 'Included a payment to a supplier. The purchase was posted when the goods were bought, so the payment is not a new purchase.' },
      { key: 'returns', text: 'goods returned to {c}', why: 'Deducted the goods returned to suppliers. Returns are posted in the separate Purchases Return A/c, not in Purchases A/c.' },
    ],
    note: '(Goods returned to suppliers are posted in a separate Purchases Return A/c.)',
  },
];

const totalSideTransactions = numeric({
  id: 'led-total-side-transactions',
  topicId: T,
  conceptId: 'led-balancing',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const b = rng.pick(BOOKS);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const nCounts = rng.int(3, 4);
    const counted = Array.from({ length: nCounts }, (_, i) => ({ text: b.counts[i % 2], amt: amount(rng, 2000, 60000, 500), counts: true, key: 'count' as string }));
    const ignored = b.ignores
      .filter((x) => x.key !== 'returns' || rng.next() < 0.6)
      .map((x) => ({ text: x.text, amt: amount(rng, 2000, 40000, 500), counts: false, key: x.key as string }));
    const rows = rng.shuffle([...counted, ...ignored]);
    const dates = dateList(rng, rows.length, false);
    const total = sum(counted.map((r) => r.amt));
    const errors: Err[] = [];
    for (const r of ignored) {
      const spec = b.ignores.find((x) => x.key === r.key)!;
      const value = r.key === 'returns' ? total - r.amt : total + r.amt;
      errors.push({ value, why: spec.why });
    }
    return {
      prompt: `A trader's transactions during the month were:\n${rows.map((r, i) => `• ${dates[i]}: ${fill(r.text, d, c)} — ${inr(r.amt)}`).join('\n')}\nWhat is the total posted on the ${sideWord(b.side)} side of ${b.acct} for the month? ${b.note}`,
      answer: total,
      commonErrors: errors,
      explanation: [
        `Only goods ${b.acct === 'Sales A/c' ? 'sold' : 'bought'}, for cash or on credit, are posted on the ${sideWord(b.side)} side of ${b.acct}.`,
        `${counted.map((r) => inr(r.amt)).join(' + ')} = ${inr(total)}.`,
        stop(`Not posted there: ${ignored.map((r) => fill(r.text, d, c)).join('; ')}`),
      ],
      hints: [
        `Which of these transactions are goods ${b.acct === 'Sales A/c' ? 'sold' : 'bought'}, whether for cash or on credit?`,
        b.acct === 'Sales A/c'
          ? 'Sales A/c is credited with goods sold only. The sale of an asset, money collected for an earlier sale and goods returned are posted in other accounts.'
          : 'Purchases A/c is debited with goods bought only. An asset bought, a payment for an earlier purchase and goods returned are posted in other accounts.',
      ],
    };
  },
  verify: (q) => {
    let t = 0;
    for (const raw of q.prompt.split('\n')) {
      const m = /^• \d+ [A-Za-z]+: (goods (?:sold|bought) (?:for cash|on credit [a-z]+ .*)) — (₹[\d,]+)$/.exec(raw);
      if (m) t += parseAmt(m[2]);
    }
    return q.answer === t;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-posting-gst: the amount posted to each account of a GST invoice (numeric)
// ---------------------------------------------------------------------------------------------------------------

const postingGst = numeric({
  id: 'led-posting-gst',
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const sale = rng.next() < 0.5;
    const intra = rng.next() < 0.6;
    const rate = rng.pick([5, 18]);
    const who = sale ? rng.pick(DEBTORS) : rng.pick(CREDITORS);
    const base = amount(rng, 10000, 90000, 1000);
    const tax = percentOf(base, rate);
    const half = tax / 2;
    const total = base + tax;
    const main = sale ? 'Sales A/c' : 'Purchases A/c';
    const dir = sale ? 'Output' : 'Input';
    const asks = intra ? (['party', 'main', 'cgst', 'sgst'] as const) : (['party', 'main', 'igst'] as const);
    const ask = rng.pick(asks);
    const story = `${sale ? 'Sold goods to' : 'Bought goods from'} ${who} on credit for ${inr(base)} before tax. GST at ${rate}% is charged${intra ? ' as CGST and SGST in equal parts, because the supply is within the state' : ` as IGST, because the ${sale ? 'customer' : 'supplier'} is in another state`}. The invoice is journalised and posted to the ledger.`;
    const gstAccount = (k: 'CGST' | 'SGST' | 'IGST') => `${dir} ${k} A/c`;
    const taxLines = intra ? [`${gstAccount('CGST')} ${inr(half)}`, `${gstAccount('SGST')} ${inr(half)}`] : [`${gstAccount('IGST')} ${inr(tax)}`];
    // The journal entry in the usual form: the debits first, then the credits with "To".
    const entry = sale
      ? [`${who} A/c Dr ${inr(total)}`, `To ${main} ${inr(base)}`, ...taxLines.map((t) => `To ${t}`)]
      : [`${main} Dr ${inr(base)}`, ...taxLines.map((t) => t.replace(' A/c ', ' A/c Dr ')), `To ${who} A/c ${inr(total)}`];
    const work = [
      `${intra ? 'CGST + SGST' : 'IGST'} = ${rate}% of ${inr(base)} = ${inr(tax)}${intra ? `, so CGST = SGST = ${inr(half)}` : ''}.`,
      `${who} A/c carries the invoice total ${inr(base)} + ${inr(tax)} = ${inr(total)}; ${main} carries ${inr(base)}.`,
      `Entry: ${entry.join('; ')}.`,
    ];
    const hints = [
      'Work out the tax first. Then ask which account takes the goods, which the tax, and which the whole invoice.',
      `The party's account takes the invoice total. ${main} takes the value of the goods only. The tax goes to the ${dir} ${intra ? 'CGST and SGST accounts, half each' : 'IGST account'}.`,
    ];
    if (ask === 'party') {
      return {
        prompt: `${story} What amount is posted to ${who} A/c?`,
        answer: total,
        commonErrors: [
          { value: base, why: 'Left out the GST. The party is billed for the goods and the tax together.' },
          intra
            ? { value: base + half, why: 'Added only one of the two taxes, CGST or SGST.' }
            : { value: base - tax, why: 'Deducted the tax from the value of the goods instead of adding it.' },
          { value: tax, why: 'Posted only the tax to the party.' },
        ],
        explanation: work,
        hints,
      };
    }
    if (ask === 'main') {
      return {
        prompt: `${story} What amount is posted to ${main}?`,
        answer: base,
        commonErrors: [
          { value: total, why: `Posted the invoice total, tax included, to ${main}. Tax is posted to its own account, not to ${sale ? 'Sales' : 'Purchases'}.` },
          { value: tax, why: 'Posted the tax instead of the value of the goods.' },
          intra
            ? { value: base + half, why: 'Added one of the two taxes to the value of the goods.' }
            : { value: base - tax, why: 'Deducted the tax from the value of the goods. The price is given before tax, so nothing is taken off it.' },
        ],
        explanation: work,
        hints,
      };
    }
    if (ask === 'igst') {
      return {
        prompt: `${story} What amount is posted to ${gstAccount('IGST')}?`,
        answer: tax,
        commonErrors: [
          { value: half, why: 'Halved the tax as if it were split into CGST and SGST. Inter-state supply carries IGST in full.' },
          { value: total, why: 'Posted the invoice total instead of the tax.' },
          { value: base, why: `Posted the value of the goods, which belongs in ${main}, instead of the tax.` },
        ],
        explanation: work,
        hints,
      };
    }
    return {
      prompt: `${story} What amount is posted to ${gstAccount(ask === 'cgst' ? 'CGST' : 'SGST')}?`,
      answer: half,
      commonErrors: [
        { value: tax, why: `Posted the whole tax to ${ask === 'cgst' ? 'CGST' : 'SGST'}. The tax is split equally between CGST and SGST.` },
        { value: total, why: 'Posted the invoice total instead of the tax.' },
        { value: base, why: `Posted the value of the goods, which belongs in ${main}, instead of the tax.` },
      ],
      explanation: work,
      hints,
    };
  },
  verify: (q) => {
    const base = amountsIn(q.prompt)[0];
    const rate = Number(/GST at (\d+)%/.exec(q.prompt)?.[1]);
    const intra = /within the state/.test(q.prompt);
    const tax = (base * rate) / 100;
    const ask = /What amount is posted to (.*)\?$/.exec(q.prompt)?.[1] ?? '';
    if (/IGST/.test(ask)) return !intra && q.answer === tax;
    if (/GST/.test(ask)) return intra && q.answer === tax / 2;
    if (/^(Sales|Purchases) A\/c$/.test(ask)) return q.answer === base;
    return q.answer === base + tax;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-asset-balance: Furniture or Machinery A/c, with the items that do not belong in it (numeric)
// ---------------------------------------------------------------------------------------------------------------

const assetBalance = numeric({
  id: 'led-asset-balance',
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const machinery = rng.next() < 0.5;
    const name = machinery ? 'Machinery A/c' : 'Furniture A/c';
    const c = rng.pick(CREDITORS);
    const open = amount(rng, 50000, 300000, 10000);
    const buy = amount(rng, 10000, 90000, 5000);
    const extra = machinery ? amount(rng, 3000, 20000, 1000) : amount(rng, 10000, 60000, 5000);
    const repairs = amount(rng, 2000, 15000, 1000);
    const sold = amount(rng, 10000, 60000, 5000);
    // The asset sold was part of the opening balance, so it cannot be worth more than that balance.
    if (sold >= open) return null;
    const bal = open + buy + extra - sold;
    const rows: { text: string; amt: number }[] = machinery
      ? [
          { text: 'new machine bought on credit from ' + c, amt: buy },
          { text: 'installation charges of the new machine paid in cash', amt: extra },
          { text: 'repairs to an old machine paid in cash', amt: repairs },
          { text: 'old machine sold at its book value', amt: sold },
        ]
      : [
          { text: 'new furniture bought for cash', amt: buy },
          { text: 'furniture bought on credit from ' + c, amt: extra },
          { text: 'repairs to existing furniture paid in cash', amt: repairs },
          { text: 'old furniture sold at its book value', amt: sold },
        ];
    const shuffled = rng.shuffle(rows);
    const dates = dateList(rng, rows.length, false);
    const errors: Err[] = [
      { value: bal + repairs, why: 'Debited the repairs to the asset account. Repairs are an expense and do not add to the cost of the asset.' },
      { value: open + buy + extra + sold, why: 'Added the asset sold instead of deducting it.' },
      machinery
        ? { value: bal - extra, why: 'Left out the installation charges. They are part of the cost of the machine, so they are debited to Machinery A/c.' }
        : { value: bal - extra, why: 'Left out the furniture bought on credit. Nothing needs to be paid for it to be posted as an asset.' },
    ];
    return {
      prompt: `${name} of a firm showed an opening debit balance of ${inr(open)}. These transactions followed:\n${shuffled.map((r, i) => `• ${dates[i]}: ${r.text} — ${inr(r.amt)}`).join('\n')}\nNo depreciation is charged in this question. What is the closing balance of ${name}?`,
      answer: bal,
      commonErrors: errors,
      explanation: [
        `Debits: opening ${inr(open)} + purchases ${inr(buy)} + ${machinery ? 'installation charges' : 'credit purchase'} ${inr(extra)} = ${inr(open + buy + extra)}.`,
        `Credit: asset sold at book value ${inr(sold)}.`,
        `Repairs are an expense and are not posted here. Closing balance = ${inr(open + buy + extra)} - ${inr(sold)} = ${inr(bal)}, a debit balance.`,
      ],
      hints: [
        'Which of these items change the cost of the asset held, and which is only an expense of running it?',
        'An asset account is debited with assets bought, on credit or for cash, and with the cost of bringing them into use. It is credited with assets sold. Repairs go to Repairs A/c.',
      ],
    };
  },
  verify: (q) => {
    let t = 0;
    for (const raw of q.prompt.split('\n')) {
      const m = /^• \d+ [A-Za-z]+: (.*) — (₹[\d,]+)$/.exec(raw);
      if (!m || /repairs/.test(m[1])) continue;
      t += (/sold/.test(m[1]) ? -1 : 1) * parseAmt(m[2]);
    }
    t += amountsIn(/opening debit balance of (₹[\d,]+)/.exec(q.prompt)?.[1] ?? '')[0] ?? 0;
    return q.answer === t;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-next-period-balance: the balance brought down and the items of the next month (numeric)
// ---------------------------------------------------------------------------------------------------------------

const nextPeriodBalance = numeric({
  id: 'led-next-period-balance',
  topicId: T,
  conceptId: 'led-opening',
  difficulty: 'medium',
  unit: 'rupees',
  generate: (rng) => {
    const kind = rng.pick([K.cash, K.bank, K.debtor, K.creditor]);
    const l = makeLedger(rng, kind, { opening: true, natural: true, n: [3, 5] });
    if (!l) return null;
    const open = openingOf(l)!;
    return {
      prompt: `At the close of last month, ${roleTitle(l)} was balanced and the balance was carried down. It is brought down on the first day of this month, and these items of the month are then posted:\n${hideItems(l)}\nThe account is balanced again at the end of this month. What balance is carried down?`,
      answer: l.bal,
      commonErrors: [
        { value: l.dr + l.cr, why: 'Added every amount, the balance brought down and both sides of the new items together.' },
        { value: Math.abs(l.bal - open.amt), why: 'Left out the balance brought down from last month.' },
        { value: Math.abs(l.bal - 2 * open.amt), why: 'Put the balance brought down on the wrong side.' },
        { value: l.big, why: 'Gave the total of the larger side instead of the difference between the two sides.' },
      ],
      explanation: namedWork(l),
      hints: ['The balance brought down is the first item of the new month, on the side of the balance. Then decide the side of each new item.', KIND_RULE[l.kind.key]],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    return dr !== cr && q.answer === Math.abs(dr - cr);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// COMPLEX. Scenarios shared by the two "wrong posting" generators
// ---------------------------------------------------------------------------------------------------------------

interface Scen {
  title: (d: string, c: string) => string;
  /** Who the account belongs to, said once in the prompt. */
  role: string;
  nature: Side;
  /** An item that raises the balance (it is posted on the account's normal side). */
  up: (x: string, d: string) => string;
  /** An item that lowers it. */
  down: (x: string, d: string) => string;
}

const SCEN: Scen[] = [
  { title: () => 'Cash A/c', role: '', nature: 'Dr', up: (x, d) => `the receipt of ${x} in cash from ${d}`, down: (x) => `the rent payment of ${x} in cash` },
  {
    title: (d) => `${d} A/c`,
    role: ', the account of a customer,',
    nature: 'Dr',
    up: (x) => `the credit sale of ${x} to the customer`,
    down: (x) => `the cash of ${x} received from the customer`,
  },
  {
    title: (_d, c) => `${c} A/c`,
    role: ', the account of a supplier,',
    nature: 'Cr',
    up: (x) => `the credit purchase of ${x} from the supplier`,
    down: (x) => `the payment of ${x} made to the supplier`,
  },
];
const UP = /the receipt of|the credit sale of|the credit purchase of/;

type Fault = 'wrongSide' | 'twice' | 'omitted';

/** What the correct balance exceeds the balance shown by, for an item that moves the balance by `s` (+1 up, -1 down). */
const gap = (fault: Fault, s: 1 | -1, x: number): number => (fault === 'wrongSide' ? 2 * s * x : fault === 'twice' ? -s * x : s * x);

const correctBalance = numeric({
  id: 'led-correct-balance',
  topicId: T,
  conceptId: 'led-errors',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const sc = rng.pick(SCEN);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const fault = rng.pick(['wrongSide', 'twice', 'omitted'] as const);
    const goesUp = rng.next() < 0.5;
    const s: 1 | -1 = goesUp ? 1 : -1;
    const shown = amount(rng, 30000, 150000, 5000);
    const x = amount(rng, 5000, 40000, 5000);
    const right = shown + gap(fault, s, x);
    if (right <= 0) return null;
    const item = (goesUp ? sc.up : sc.down)(inr(x), d);
    const itemSide: Side = goesUp ? sc.nature : opp(sc.nature);
    const what =
      fault === 'wrongSide'
        ? `${item} was posted on the ${sideWord(opp(itemSide))} side instead of the ${sideWord(itemSide)} side`
        : fault === 'twice'
          ? `${item} was posted twice, both times on the ${sideWord(itemSide)} side`
          : `${item} was not posted at all`;
    const unit = s * x;
    const candidates: Err[] =
      fault === 'wrongSide'
        ? [
            { value: shown + unit, why: 'Corrected by the amount once. An item on the wrong side is out by twice its amount: it is missing from one side and wrongly added to the other.' },
            { value: shown - 2 * unit, why: 'Moved the balance the wrong way. Work out whether the item should raise or lower the balance.' },
            { value: shown - unit, why: 'Corrected once, and in the wrong direction.' },
          ]
        : fault === 'twice'
          ? [
              { value: shown + unit, why: 'Corrected in the wrong direction. The extra posting must be taken out, not added.' },
              { value: shown - 2 * unit, why: 'Took the item out twice. A duplicate posting is removed once.' },
              { value: shown + 2 * unit, why: 'Corrected in the wrong direction and by twice the amount.' },
            ]
          : [
              { value: shown - unit, why: 'Corrected in the wrong direction. The missing item must be added to its own side.' },
              { value: shown + 2 * unit, why: 'Posted the missing item twice.' },
              { value: shown - 2 * unit, why: 'Corrected in the wrong direction and by twice the amount.' },
            ];
    return {
      prompt: `${sc.title(d, c)}${sc.role} shows a ${sideWord(sc.nature)} balance of ${inr(shown)}. It is then discovered that ${what}. What is the correct ${sideWord(sc.nature)} balance of the account?`,
      answer: right,
      commonErrors: candidates,
      explanation: [
        `The item belongs on the ${sideWord(itemSide)} side of ${sc.title(d, c)}, so posted correctly it ${goesUp ? 'raises' : 'lowers'} the ${sideWord(sc.nature)} balance.`,
        fault === 'wrongSide'
          ? `On the wrong side it has the opposite effect, so the balance shown is out by twice the amount: ${inr(2 * x)}.`
          : fault === 'twice'
            ? `Posted twice, it has had its effect once too often, so the balance shown is out by ${inr(x)}.`
            : `Not posted, it has had no effect, so the balance shown is out by ${inr(x)}.`,
        `The correct balance is ${right > shown ? 'higher' : 'lower'}: ${inr(shown)} ${right > shown ? '+' : '-'} ${inr(Math.abs(right - shown))} = ${inr(right)}.`,
      ],
      hints: ['Posted correctly, would this item raise or lower the balance of the account? What did the error do instead?', RULE_ERRORS],
    };
  },
  verify: (q) => {
    const [shown, x] = amountsIn(q.prompt);
    const s: 1 | -1 = UP.test(q.prompt) ? 1 : -1;
    const fault: Fault = /instead of the/.test(q.prompt) ? 'wrongSide' : /posted twice/.test(q.prompt) ? 'twice' : 'omitted';
    return q.answer === shown + gap(fault, s, x);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-wrong-side-effect: understated or overstated, and by how much (mcq)
// ---------------------------------------------------------------------------------------------------------------

const wrongSideEffect = mcqTemplate({
  id: 'led-wrong-side-effect',
  topicId: T,
  conceptId: 'led-errors',
  difficulty: 'complex',
  generate: (rng) => {
    const sc = rng.pick(SCEN);
    const d = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const fault = rng.pick(['wrongSide', 'twice', 'omitted'] as const);
    const goesUp = rng.next() < 0.5;
    const s: 1 | -1 = goesUp ? 1 : -1;
    const x = amount(rng, 2000, 60000, 500);
    const item = (goesUp ? sc.up : sc.down)(inr(x), d);
    const itemSide: Side = goesUp ? sc.nature : opp(sc.nature);
    const what =
      fault === 'wrongSide'
        ? `${item} was posted on the ${sideWord(opp(itemSide))} side instead of the ${sideWord(itemSide)} side`
        : fault === 'twice'
          ? `${item} was posted twice, both times on the ${sideWord(itemSide)} side`
          : `${item} was not posted at all`;
    const shownMinusRight = -gap(fault, s, x);
    const size = Math.abs(shownMinusRight);
    const other = fault === 'wrongSide' ? size / 2 : size * 2;
    const dir = (neg: boolean) => (neg ? 'understated' : 'overstated');
    const text = (neg: boolean, v: number) => `${cap(dir(neg))} by ${inr(v)}`;
    const neg = shownMinusRight < 0;
    return {
      prompt: `${sc.title(d, c)}${sc.role} shows a ${sideWord(sc.nature)} balance. In this account, ${what}. Because of this error, the ${sideWord(sc.nature)} balance shown is:`,
      correct: text(neg, size),
      distractors: [
        {
          text: text(neg, other),
          why:
            fault === 'wrongSide'
              ? 'Counted the item once. Posted on the wrong side it is missing from the right side and added to the wrong one, so the balance is out by twice the amount.'
              : 'Doubled the amount. An item left out, or posted twice, changes the balance by its amount only once.',
        },
        { text: text(!neg, size), why: 'Got the direction of the error the wrong way round. Work out whether the item raises or lowers the balance, and whether it is missing or extra.' },
        { text: text(!neg, other), why: 'Made both slips: the wrong direction and the wrong size.' },
      ],
      explanation: `The item belongs on the ${sideWord(itemSide)} side, so posted correctly it ${goesUp ? 'raises' : 'lowers'} the ${sideWord(sc.nature)} balance. ${
        fault === 'wrongSide'
          ? `On the wrong side it has the opposite effect, so the balance is out by twice ${inr(x)}`
          : fault === 'twice'
            ? `Posted twice, it has its effect twice instead of once, so the balance is out by ${inr(x)}`
            : `Left out, it has no effect, so the balance is out by ${inr(x)}`
      }: ${neg ? 'understated' : 'overstated'} by ${inr(size)}.`,
      hints: ['Posted correctly, would this item raise or lower the balance? Is the balance shown too high or too low without that?', RULE_ERRORS],
    };
  },
  verify: (q) => {
    const x = amountsIn(q.prompt)[0];
    const s: 1 | -1 = UP.test(q.prompt) ? 1 : -1;
    const fault: Fault = /instead of the/.test(q.prompt) ? 'wrongSide' : /posted twice/.test(q.prompt) ? 'twice' : 'omitted';
    const diff = -gap(fault, s, x);
    return q.options.find((o) => o.id === q.correct)?.text === `${diff < 0 ? 'Understated' : 'Overstated'} by ${inr(Math.abs(diff))}`;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-balance-from-journal: Cash A/c from journal entries, with discount and credit entries (numeric)
// ---------------------------------------------------------------------------------------------------------------

interface JLine {
  side: Side;
  acct: string;
  amt: number;
}

const cashFrom = (lines: JLine[]) => sum(lines.filter((l) => l.acct === 'Cash A/c').map((l) => (l.side === 'Dr' ? l.amt : -l.amt)));

const balanceFromJournal = numeric({
  id: 'led-balance-from-journal',
  topicId: T,
  conceptId: 'led-posting',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.pick(DEBTORS);
    const d2 = rng.pick(DEBTORS);
    const c = rng.pick(CREDITORS);
    const open = amount(rng, 20000, 80000, 5000);
    const f1 = amount(rng, 10000, 60000, 5000);
    const ds1 = percentOf(f1, rng.pick([2, 5]));
    const f2 = amount(rng, 10000, 60000, 5000);
    const ds2 = percentOf(f2, rng.pick([2, 5]));
    const sale = amount(rng, 5000, 60000, 5000);
    const x = () => amount(rng, 2000, 40000, 1000);
    const mandatory: JLine[][] = [
      [{ side: 'Dr', acct: 'Cash A/c', amt: f1 - ds1 }, { side: 'Dr', acct: 'Discount Allowed A/c', amt: ds1 }, { side: 'Cr', acct: `${d} A/c`, amt: f1 }],
      [{ side: 'Dr', acct: `${c} A/c`, amt: f2 }, { side: 'Cr', acct: 'Cash A/c', amt: f2 - ds2 }, { side: 'Cr', acct: 'Discount Received A/c', amt: ds2 }],
      [{ side: 'Dr', acct: `${d2} A/c`, amt: sale }, { side: 'Cr', acct: 'Sales A/c', amt: sale }],
    ];
    const optional: (() => JLine[])[] = [
      () => { const a = x(); return [{ side: 'Dr', acct: 'Cash A/c', amt: a }, { side: 'Cr', acct: 'Capital A/c', amt: a }]; },
      () => { const a = x(); return [{ side: 'Dr', acct: 'Purchases A/c', amt: a }, { side: 'Cr', acct: 'Cash A/c', amt: a }]; },
      () => { const a = x(); return [{ side: 'Dr', acct: 'Rent A/c', amt: a }, { side: 'Cr', acct: 'Cash A/c', amt: a }]; },
      () => { const a = x(); return [{ side: 'Dr', acct: 'Bank A/c', amt: a }, { side: 'Cr', acct: 'Cash A/c', amt: a }]; },
      () => { const a = x(); return [{ side: 'Dr', acct: 'Cash A/c', amt: a }, { side: 'Cr', acct: 'Bank A/c', amt: a }]; },
      () => { const a = x(); return [{ side: 'Dr', acct: 'Drawings A/c', amt: a }, { side: 'Cr', acct: 'Cash A/c', amt: a }]; },
    ];
    for (let attempt = 0; attempt < 12; attempt++) {
      const extras = rng.shuffle(optional).slice(0, rng.int(2, 3)).map((f) => f());
      const entries = rng.shuffle([...mandatory, ...extras]);
      let run = open;
      let ok = true;
      for (const e of entries) {
        run += cashFrom(e);
        if (run < 0) ok = false;
      }
      if (!ok || run <= 0) continue;
      const dates = dateList(rng, entries.length, false);
      // An entry in the usual form: the debits first ("... A/c Dr"), then the credits ("To ... A/c").
      const fmt = (e: JLine[]) => e.map((l) => (l.side === 'Dr' ? `${l.acct} Dr ${inr(l.amt)}` : `To ${l.acct} ${inr(l.amt)}`)).join('; ');
      const cashLines = entries.flat().filter((l) => l.acct === 'Cash A/c');
      const received = cashLines.filter((l) => l.side === 'Dr').map((l) => l.amt);
      const paid = cashLines.filter((l) => l.side === 'Cr').map((l) => l.amt);
      const drTotal = open + sum(received);
      return {
        prompt: `Cash in hand at the start of the month was ${inr(open)}. These journal entries were passed during the month:\n${entries.map((e, i) => `• ${dates[i]}: ${fmt(e)}`).join('\n')}\nPost them to the ledger. What is the closing balance of Cash A/c?`,
        answer: run,
        commonErrors: [
          { value: run + sale, why: 'Counted the credit sale as cash received. Nothing is received until the customer pays.' },
          { value: run + ds1, why: 'Posted the full amount settled by the customer as cash received. The discount allowed is not cash.' },
          { value: run - ds2, why: 'Posted the full amount settled with the supplier as cash paid. The discount received is not cash.' },
          { value: Math.abs(run - open), why: 'Left out the opening cash balance.' },
        ],
        explanation: [
          `Only the lines that name Cash A/c are posted in it: "Cash A/c Dr" on the debit side, "To Cash A/c" on the credit side.`,
          sumLine('Debit side (opening balance and cash received)', [open, ...received], drTotal),
          sumLine('Credit side (cash paid)', paid, sum(paid)),
          `The discount allowed to ${d} (${inr(ds1)}) and the discount received from ${c} (${inr(ds2)}) are not cash, and the credit sale does not name Cash A/c.`,
          `Closing balance = ${inr(drTotal)} - ${inr(sum(paid))} = ${inr(run)}, a debit balance.`,
        ],
        hints: [
          'Pick out only the lines that name Cash A/c. A line "Cash A/c Dr" is a receipt; a line "To Cash A/c" is a payment.',
          'Cash A/c opens with the cash in hand on its debit side. Discount is not cash, and an entry without Cash A/c does not touch it.',
        ],
      };
    }
    return null;
  },
  verify: (q) => {
    const first = amountsIn(q.prompt)[0];
    let t = first;
    for (const m of q.prompt.matchAll(/(?:: |; )Cash A\/c Dr (₹[\d,]+)/g)) t += parseAmt(m[1]);
    for (const m of q.prompt.matchAll(/To Cash A\/c (₹[\d,]+)/g)) t -= parseAmt(m[1]);
    return q.answer === t;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-debtor-balance and led-creditor-balance: personal accounts with returns, discount and a distracting fact
// ---------------------------------------------------------------------------------------------------------------

const debtorBalance = numeric({
  id: 'led-debtor-balance',
  version: 2,
  topicId: T,
  conceptId: 'led-personal',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const d = rng.pick(DEBTORS);
    const open = amount(rng, 30000, 90000, 1000);
    const sale = amount(rng, 20000, 80000, 1000);
    const ret = amount(rng, 5000, 20000, 1000);
    const settled = amount(rng, 10000, 30000, 5000);
    if (settled > open) return null;
    const ds = percentOf(settled, rng.pick([2, 4, 5]));
    const paid = settled - ds;
    const later = rng.next() < 0.5 ? amount(rng, 5000, 40000, 1000) : 0;
    const order = amount(rng, 10000, 50000, 1000);
    const firm = rng.pick(BUSINESSES);
    const bal = open + sale - ret - settled + later;
    if (order === 2 * ret) return null; // The two wrong answers below would coincide.
    const events: string[] = [
      `goods sold to ${d} on credit — ${inr(sale)}`,
      `${d} returned goods — ${inr(ret)}`,
      `${d} paid ${inr(paid)} in cash in full settlement of an earlier bill of ${inr(settled)}`,
      ...(later ? [`further goods sold to ${d} on credit — ${inr(later)}`] : []),
      `${d} placed an order for goods worth ${inr(order)}; the goods are yet to be delivered`,
    ];
    const dates = dateList(rng, events.length + 1, true);
    const lines = [`• ${dates[0]}: opening debit balance — ${inr(open)}`, ...events.map((e, i) => `• ${dates[i + 1]}: ${e}`)];
    return {
      prompt: `${d} is a customer of ${firm}. ${d} A/c in the ledger of ${firm} opened the month with a balance, and these were the dealings of the month:\n${lines.join('\n')}\nWhat is the balance of ${d} A/c at the end of the month?`,
      answer: bal,
      commonErrors: [
        { value: bal + ds, why: `Posted only the ${inr(paid)} received. The discount of ${inr(ds)} also clears the account, so the account is credited with ${inr(settled)}.` },
        { value: bal + order, why: 'Counted an order as a sale. Nothing is posted until the goods are delivered.' },
        { value: bal + 2 * ret, why: 'Added the goods returned instead of deducting them.' },
      ],
      explanation: [
        `Debit side: opening ${inr(open)} + sale ${inr(sale)}${later ? ` + further sale ${inr(later)}` : ''} = ${inr(open + sale + later)}.`,
        `Credit side: goods returned ${inr(ret)} + cash ${inr(paid)} + discount allowed ${inr(ds)} = ${inr(ret + settled)}.`,
        `The order is not a transaction yet. Balance = ${inr(open + sale + later)} - ${inr(ret + settled)} = ${inr(bal)}, a debit balance: ${d} owes ${firm} ${inr(bal)}.`,
      ],
      hints: [
        'When a bill is settled in full for less than its amount, what is the account credited with? And is an order a transaction?',
        "A customer's account is debited with goods sold on credit. It is credited with goods returned, money received and discount allowed. An order is posted only when the goods are delivered.",
      ],
    };
  },
  verify: (q) => {
    let t = 0;
    for (const raw of q.prompt.split('\n')) {
      if (!raw.startsWith('• ')) continue;
      const body = raw.replace(/^• \d+ [A-Za-z]+: /, '');
      const settle = /in full settlement of an earlier bill of (₹[\d,]+)/.exec(body);
      const tail = /— (₹[\d,]+)$/.exec(body);
      if (settle) t -= parseAmt(settle[1]);
      else if (/^opening debit balance/.test(body) && tail) t += parseAmt(tail[1]);
      else if (/returned goods/.test(body) && tail) t -= parseAmt(tail[1]);
      else if (/goods sold to/.test(body) && tail) t += parseAmt(tail[1]);
    }
    return q.answer === t;
  },
});

const creditorBalance = numeric({
  id: 'led-creditor-balance',
  version: 2,
  topicId: T,
  conceptId: 'led-personal',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    const c = rng.pick(CREDITORS);
    const open = amount(rng, 30000, 90000, 1000);
    const list = amount(rng, 20000, 90000, 1000);
    const trade = rng.pick([10, 20]);
    const tradeAmt = percentOf(list, trade);
    const invoice = list - tradeAmt;
    const ret = amount(rng, 5000, Math.min(20000, invoice / 100 - 5000), 1000);
    const settled = amount(rng, 10000, 30000, 5000);
    if (settled > open) return null;
    const ds = percentOf(settled, rng.pick([2, 4, 5]));
    const paid = settled - ds;
    const order = amount(rng, 10000, 50000, 1000);
    const firm = rng.pick(BUSINESSES);
    const bal = open + invoice - ret - settled;
    if (bal <= 0) return null;
    const events = [
      `bought goods from ${c} on credit; list price ${inr(list)}, trade discount ${trade}%`,
      `returned goods of invoice value ${inr(ret)} to ${c}`,
      `paid ${inr(paid)} in cash to ${c} in full settlement of an earlier bill of ${inr(settled)}`,
      `placed an order with ${c} for goods worth ${inr(order)}; the goods are yet to be received`,
    ];
    const dates = dateList(rng, events.length + 1, true);
    const lines = [`• ${dates[0]}: opening credit balance — ${inr(open)}`, ...events.map((e, i) => `• ${dates[i + 1]}: ${e}`)];
    return {
      prompt: `${c} is a supplier of ${firm}. ${c} A/c in the ledger of ${firm} opened the month with a balance, and these were the dealings of ${firm} with ${c} in the month:\n${lines.join('\n')}\nWhat is the balance of ${c} A/c at the end of the month?`,
      answer: bal,
      commonErrors: [
        { value: bal + tradeAmt, why: 'Posted the purchase at list price. Trade discount is deducted before the purchase is posted.' },
        { value: bal + ds, why: `Posted only the ${inr(paid)} paid. The discount of ${inr(ds)} also clears the account, so it is debited with ${inr(settled)}.` },
        { value: bal + 2 * ret, why: 'Added the goods returned instead of deducting them.' },
        { value: bal + order, why: 'Counted an order as a purchase. Nothing is posted until the goods are received.' },
      ],
      explanation: [
        `Purchase = ${inr(list)} - ${trade}% trade discount ${inr(tradeAmt)} = ${inr(invoice)}.`,
        `Credit side: opening ${inr(open)} + purchase ${inr(invoice)} = ${inr(open + invoice)}.`,
        `Debit side: goods returned ${inr(ret)} + cash ${inr(paid)} + discount received ${inr(ds)} = ${inr(ret + settled)}.`,
        `The order is not posted. Balance = ${inr(open + invoice)} - ${inr(ret + settled)} = ${inr(bal)}, a credit balance: ${firm} owes ${c} ${inr(bal)}.`,
      ],
      hints: [
        'At what amount is a purchase posted when there is a trade discount? And what clears the account when a bill is settled in full for less?',
        "A supplier's account is credited with goods bought on credit at the invoice price, after trade discount. It is debited with goods returned, money paid and discount received. An order is not posted.",
      ],
    };
  },
  verify: (q) => {
    let t = 0;
    for (const raw of q.prompt.split('\n')) {
      if (!raw.startsWith('• ')) continue;
      const body = raw.replace(/^• \d+ [A-Za-z]+: /, '');
      const settle = /in full settlement of an earlier bill of (₹[\d,]+)/.exec(body);
      const tail = /— (₹[\d,]+)$/.exec(body);
      const list = /list price (₹[\d,]+), trade discount (\d+)%/.exec(body);
      const ret = /^returned goods of invoice value (₹[\d,]+)/.exec(body);
      if (settle) t -= parseAmt(settle[1]);
      else if (list) t += parseAmt(list[1]) - percentOf(parseAmt(list[1]), Number(list[2]));
      else if (ret) t -= parseAmt(ret[1]);
      else if (/^opening credit balance/.test(body) && tail) t += parseAmt(tail[1]);
    }
    return q.answer === t;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-find-opening: the opening cash balance from indirect information (numeric)
// ---------------------------------------------------------------------------------------------------------------

const findOpening = numeric({
  id: 'led-find-opening',
  version: 2,
  topicId: T,
  conceptId: 'led-opening',
  difficulty: 'complex',
  unit: 'rupees',
  generate: (rng) => {
    // Version 2: every figure is given in rupees, as a cash book shows it (version 1 gave commission and wages as a
    // percentage of the sales and purchases, which no business does). The indirect part is now the dealings that do
    // not touch cash at all: credit sales, credit purchases and the discount allowed to debtors.
    const sales = amount(rng, 20000, 80000, 1000);
    const creditSales = amount(rng, 10000, 30000, 1000);
    const debtors = amount(rng, 10000, 50000, 1000);
    const discount = percentOf(debtors, rng.pick([2, 4, 5]));
    const comm = rng.next() < 0.5 ? amount(rng, 1000, 6000, 500) : 0;
    const purchases = amount(rng, 10000, 60000, 1000);
    const creditPurchases = amount(rng, 10000, 40000, 1000);
    const wages = amount(rng, 2000, 12000, 500);
    const rent = amount(rng, 2000, 12000, 1000);
    const open = amount(rng, 35000, 80000, 1000);
    const firm = rng.pick(BUSINESSES);
    const receipts = sales + debtors + comm;
    const payments = purchases + wages + rent;
    const closing = open + receipts - payments;
    if (closing <= 0 || creditSales >= open) return null;
    return {
      prompt: `During March, ${firm} made cash sales of ${inr(sales)} and credit sales of ${inr(creditSales)}. It received ${inr(debtors)} in cash from debtors, after allowing them a discount of ${inr(discount)}.${comm ? ` Commission of ${inr(comm)} was received in cash.` : ''} Cash purchases were ${inr(purchases)}, and goods of ${inr(creditPurchases)} were bought on credit. Wages of ${inr(wages)} and rent of ${inr(rent)} were paid in cash. The closing balance of Cash A/c on 31 March was ${inr(closing)}. What was the opening cash balance on 1 March?`,
      answer: open,
      commonErrors: [
        { value: closing + receipts - payments, why: 'Worked forwards: added the receipts to the closing balance and deducted the payments, instead of going back from it.' },
        { value: open - creditSales, why: 'Counted the credit sales as cash received. No cash comes in until the customer pays.' },
        { value: open + creditPurchases, why: 'Counted the credit purchases as cash paid. No cash goes out until the supplier is paid.' },
        { value: open - discount, why: 'Counted the discount allowed as cash received. A discount clears part of a debt, but no cash moves.' },
      ],
      explanation: [
        `Receipts in cash = cash sales ${inr(sales)} + from debtors ${inr(debtors)}${comm ? ` + commission ${inr(comm)}` : ''} = ${inr(receipts)}.`,
        `Payments in cash = cash purchases ${inr(purchases)} + wages ${inr(wages)} + rent ${inr(rent)} = ${inr(payments)}.`,
        `Left out, because no cash moves: credit sales ${inr(creditSales)}, credit purchases ${inr(creditPurchases)} and the discount of ${inr(discount)}.`,
        `Opening + receipts - payments = closing, so Opening = ${inr(closing)} - ${inr(receipts)} + ${inr(payments)} = ${inr(open)}.`,
      ],
      hints: [
        'Pick out only the money that came into or went out of the cash box. Credit dealings and discounts do not touch Cash A/c.',
        'Closing balance = Opening balance + Receipts - Payments, so Opening balance = Closing balance - Receipts + Payments.',
      ],
    };
  },
  verify: (q) => {
    const get = (re: RegExp) => {
      const m = re.exec(q.prompt);
      return m ? parseAmt(m[1]) : 0;
    };
    const receipts = get(/cash sales of (₹[\d,]+)/) + get(/received (₹[\d,]+) in cash from debtors/) + get(/Commission of (₹[\d,]+) was received in cash/);
    const payments = get(/Cash purchases were (₹[\d,]+)/) + get(/Wages of (₹[\d,]+)/) + get(/rent of (₹[\d,]+) were paid/);
    const closing = get(/on 31 March was (₹[\d,]+)/);
    return q.answer === closing - receipts + payments;
  },
});

// ---------------------------------------------------------------------------------------------------------------
// led-bank-overdraft: a bank account that starts overdrawn (mcq)
// ---------------------------------------------------------------------------------------------------------------

const bankOverdraft = mcqTemplate({
  id: 'led-bank-overdraft',
  topicId: T,
  conceptId: 'led-balances',
  difficulty: 'complex',
  generate: (rng) => {
    const l = makeLedger(rng, K.bank, { opening: true, openSide: 'Cr', n: [4, 6], min: 5000, max: 60000, step: 1000, running: false });
    if (!l) return null;
    const open = openingOf(l)!;
    // The same items with the opening overdraft wrongly taken as money in the bank.
    const dr2 = l.dr + open.amt;
    const cr2 = l.cr - open.amt;
    if (dr2 === cr2) return null;
    const slipSide: Side = dr2 > cr2 ? 'Dr' : 'Cr';
    const slip = balText(slipSide, Math.abs(dr2 - cr2));
    const right = balText(l.balSide, l.bal);
    const distractors: Distractor[] = [
      { text: balText(opp(l.balSide), l.bal), why: 'Right amount, wrong side. The balance lies on the side with the larger total.' },
      { text: balText(l.balSide, l.big), why: 'Gave the total of the larger side instead of the difference between the two sides.' },
      { text: balText(opp(l.balSide), l.small), why: 'Took the total of the smaller side as the balance.' },
    ];
    if (slip !== right) {
      distractors.unshift({ text: slip, why: 'Took the opening overdraft as money in the bank, a debit, instead of as a credit balance.' });
    }
    return {
      prompt: `At the start of the month a firm's bank account was overdrawn. These are the items of Bank A/c in the firm's ledger for the month:\n${hideItems(l)}\nWhat is the closing balance of Bank A/c?`,
      correct: right,
      distractors,
      explanation: `${namedWork(l).join(' ')} ${l.balSide === 'Cr' ? 'The account is still overdrawn.' : 'The deposits cleared the overdraft and left money in the bank.'}`,
      hints: ['An overdraft is money owed to the bank. On which side of Bank A/c does it open?', KIND_RULE.bank],
    };
  },
  verify: (q) => {
    const { dr, cr } = promptSums(q.prompt);
    return dr !== cr && q.options.find((o) => o.id === q.correct)?.text === balText(dr > cr ? 'Dr' : 'Cr', Math.abs(dr - cr));
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Formats: accounts the student prepares, row by row. Each is written up from the journal entries of a month with
// `accountOf`, and verified by posting the same entries another way (`post`, which nets every line into one figure).
// ---------------------------------------------------------------------------------------------------------------

const MONTH_DAYS: Record<string, number> = { Apr: 30, May: 31, Jun: 30, Jul: 31, Aug: 31, Sep: 30, Oct: 31, Nov: 30, Dec: 31, Jan: 31, Feb: 28 };
const NEXT_MONTH: Record<string, string> = { Apr: 'May', May: 'Jun', Jun: 'Jul', Jul: 'Aug', Aug: 'Sep', Sep: 'Oct', Oct: 'Nov', Nov: 'Dec', Dec: 'Jan', Jan: 'Feb', Feb: 'Mar' };
const TRADERS = ['Asha Traders', 'Verma Stores', 'Nair & Sons', 'Iqbal Emporium', 'Deepa Garments', 'Thomas Hardware', 'Kaveri Book House'];

const debit = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Dr', amount: amt });
const credit = (accountId: string, amt: number): JournalLine => ({ accountId, side: 'Cr', amount: amt });

/** One transaction of the month: how the data tells it, and its journal entry. */
interface Deal {
  text: string;
  lines: JournalLine[];
}

/** What an account was made from, kept for its `verify`. */
interface KeptBooks {
  accountId: string;
  entries: DatedEntry[];
  opening?: OpeningBalance;
}
const keptBooks = keepFor<KeptBooks>();

/** The first result `make` gives in a few goes: a template tries other amounts before it gives a seed up. */
function firstOf<P>(goes: number, make: () => P | null): P | null {
  for (let i = 0; i < goes; i++) {
    const made = make();
    if (made) return made;
  }
  return null;
}

/** The month of a list of dates ("4 Apr"), its last day and the first day of the next month. */
function period(dates: string[]) {
  const mon = dates[0].split(' ')[1];
  return { mon, end: `${MONTH_DAYS[mon]} ${mon}`, next: `1 ${NEXT_MONTH[mon]}` };
}

const dated = (deals: Deal[], dates: string[]): DatedEntry[] => deals.map((d, i) => ({ date: dates[i], lines: d.lines }));
const dealLines = (deals: Deal[], dates: string[]) => deals.map((d, i) => `• ${dates[i]}: ${d.text}`).join('\n');

/** The working every account ends on: the total of each side, then where the balance goes. (Exported for the chained cases.) */
export function sideWork(view: AccountView): string[] {
  const line = (s: Side) => {
    const xs = (s === 'Dr' ? view.debit : view.credit).map((p) => p.amount);
    return xs.length === 0 ? `${cap(sideWord(s))} side: no items.` : sumLine(`${cap(sideWord(s))} side`, xs, sum(xs));
  };
  const out = [line('Dr'), line('Cr')];
  if (view.balance) {
    const short = opp(view.balance.side);
    out.push(
      `The ${sideWord(view.balance.side)} side is larger by ${inr(view.balance.amount)}, so the account has a ${sideWord(view.balance.side)} balance. It is written on the ${sideWord(short)} side as "${pre(short)} Balance c/d", and both sides then total ${inr(view.total)}.`,
    );
  }
  return out;
}

/**
 * True when an account that was made from kept entries holds: its balance, worked out again by `post`, is carried
 * down on the shorter side and (where the account is continued) brought down on the other, and each side carries
 * exactly what the entries debit and credit to the account.
 */
function accountHolds(q: AccountQuestion): boolean {
  const kept = keptBooks.of(q.data);
  if (!kept) return false;
  const { accountId, entries, opening } = kept;
  const start: Books = new Map(opening ? [[accountId, opening.side === 'Dr' ? opening.amount : -opening.amount]] : []);
  const balance = balanceOf(post(entries.map((e) => e.lines), start), accountId);
  if (!balance) return false;
  const short = balance.side === 'Dr' ? 1 : 0;
  const closing = q.sides.map((s) => s.rows.filter((r) => r.closing));
  if (closing[short].length !== 1 || closing[1 - short].length !== 0 || closing[short][0].amounts[0] !== balance.amount) return false;
  const below = q.sides.map((s) => s.below);
  if (below[short].length > 0 || below[1 - short].some((r) => r.label !== BALANCE_BD || r.amounts[0] !== balance.amount)) return false;
  return (['Dr', 'Cr'] as const).every((side, i) => {
    const posted = sum(entries.flatMap((e) => e.lines.filter((l) => l.accountId === accountId && l.side === side).map((l) => l.amount)));
    const rows = sum(q.sides[i].rows.filter((r) => !r.closing).map((r) => r.amounts[0]));
    return rows === posted + (opening?.side === side ? opening.amount : 0);
  });
}

/** What an account template returns once its entries are known: the sides from the books, and the entries kept for `verify`. */
function fromBooks(
  kept: KeptBooks,
  closing: { closeOn: string; reopenOn?: string },
  rest: Omit<AccountParts, 'left' | 'right' | 'explanation'> & { explanation: (view: AccountView) => string[] },
): AccountParts | null {
  const view = accountOf(kept.entries, kept.accountId, kept.opening);
  // An account with nothing to carry down has no closing row to ask for.
  if (!view.balance) return null;
  keptBooks.keep(rest.data, kept);
  return { ...rest, ...ledgerSides(view, closing), explanation: rest.explanation(view) };
}

// led-fmt-personal: a customer's or a supplier's account from the dealings of a month, balanced (easy)
const fmtPersonal = accountTemplate({
  id: 'led-fmt-personal',
  topicId: T,
  conceptId: 'led-formats',
  difficulty: 'easy',
  generate: (rng) =>
    firstOf(12, () => {
      const isDebtor = rng.next() < 0.5;
      const who = rng.pick(isDebtor ? DEBTORS : CREDITORS);
      const firm = rng.pick(TRADERS);
      const id = isDebtor ? debtor(who) : creditor(who);
      const nature: Side = isDebtor ? 'Dr' : 'Cr';
      // A dealing that raises what is owed is on the account's own side; one that lowers it is on the other.
      const raise = (text: string, other: string, a: number): Deal => ({ text: `${text} — ${inr(a)}`, lines: isDebtor ? [debit(id, a), credit(other, a)] : [debit(other, a), credit(id, a)] });
      const lower = (text: string, other: string, a: number): Deal => ({ text: `${text} — ${inr(a)}`, lines: isDebtor ? [debit(other, a), credit(id, a)] : [debit(id, a), credit(other, a)] });
      const goodsAccount = isDebtor ? 'sales' : 'purchases';
      const goods = raise(isDebtor ? `sold goods to ${who} on credit` : `bought goods from ${who} on credit`, goodsAccount, amount(rng, 20000, 60000, 1000));
      const more = raise(isDebtor ? `sold more goods to ${who} on credit` : `bought more goods from ${who} on credit`, goodsAccount, amount(rng, 8000, 30000, 500));
      const returned = lower(isDebtor ? `${who} returned goods` : `returned goods to ${who}`, isDebtor ? 'salesReturn' : 'purchasesReturn', amount(rng, 2000, 8000, 500));
      const cash = lower(isDebtor ? `received cash from ${who}` : `paid cash to ${who}`, 'cash', amount(rng, 4000, 15000, 500));
      const cheque = lower(isDebtor ? `received a cheque from ${who} and paid it into the bank the same day` : `issued a cheque to ${who}`, 'bank', amount(rng, 5000, 20000, 500));
      // Two rows of one side with the same particulars and amount could not be told apart.
      if (more.lines[0].amount === goods.lines[0].amount) return null;
      // Three or four dealings besides the first lot of goods: five to seven rows with the balance, a fair 4 marks.
      const others = rng.shuffle([more, returned, cash, cheque]).slice(0, rng.int(3, 4));
      const hasOpening = rng.next() < 0.5;
      const deals = rng.shuffle([goods, ...others]);
      if (hasOpening) {
        // The first lot of goods comes before "more goods", and goods come back only after they have gone out.
        for (const later of [more, returned]) {
          const [g, at] = [deals.indexOf(goods), deals.indexOf(later)];
          if (at >= 0 && at < g) [deals[g], deals[at]] = [deals[at], deals[g]];
        }
      } else {
        // With nothing owed at the start, the month's dealings begin with the goods.
        deals.splice(deals.indexOf(goods), 1);
        deals.unshift(goods);
      }
      const dates = dateList(rng, deals.length + (hasOpening ? 1 : 0), hasOpening);
      const { end } = period(dates);
      const opening: OpeningBalance | undefined = hasOpening ? { date: dates[0], side: nature, amount: amount(rng, 10000, 40000, 1000) } : undefined;
      const entries = dated(deals, hasOpening ? dates.slice(1) : dates);
      // Nobody pays, or sends back, more than is owed at the time; and something is still owed at the end.
      let owed = opening?.amount ?? 0;
      for (const e of entries) {
        for (const l of e.lines) if (l.accountId === id) owed += l.side === nature ? l.amount : -l.amount;
        if (owed < 0) return null;
      }
      if (owed <= 0) return null;
      const role = isDebtor ? 'customer' : 'supplier';
      const openingLine = opening ? `• ${opening.date}: balance brought down — ${inr(opening.amount)} (${isDebtor ? `${who} owes ${firm}` : `${firm} owes ${who}`})\n` : '';
      const [own, far] = [pre(nature), pre(opp(nature))];
      const has = (d: Deal) => deals.includes(d);
      return fromBooks(
        { accountId: id, entries, opening },
        { closeOn: end },
        {
          task: `Prepare ${who} A/c in the books of ${firm} for the month and balance it on ${end}.`,
          data: `${who} is a ${role} of ${firm}. These are all the dealings with ${who} in the month:\n${openingLine}${dealLines(deals, hasOpening ? dates.slice(1) : dates)}`,
          title: `${who} A/c`,
          // The account's own name, the money account that was not used, and the goods and returns accounts of the other kind of party.
          distractors: [`${who} A/c`, 'Cash A/c', 'Bank A/c', 'Sales A/c', 'Purchases A/c', 'Sales Return A/c', 'Purchases Return A/c', BALANCE_BD],
          explanation: (view) => [
            isDebtor
              ? `${who} is a customer. ${who} A/c is debited with whatever raises the amount ${who} owes, and credited with whatever lowers it.`
              : `${who} is a supplier. ${who} A/c is credited with whatever raises the amount owed to ${who}, and debited with whatever lowers it.`,
            ...(opening ? [`The amount owed on ${opening.date} opens the account on its ${sideWord(nature)} side: "${own} Balance b/d" ${inr(opening.amount)}.`] : []),
            `Goods ${isDebtor ? 'sold' : 'bought'} on credit raise it: "${own} ${ledgerLabel(goodsAccount)}".`,
            [
              'These lower it:',
              [
                ...(has(returned) ? [`goods returned, "${far} ${ledgerLabel(isDebtor ? 'salesReturn' : 'purchasesReturn')}"`] : []),
                ...(has(cash) ? [`cash ${isDebtor ? 'received' : 'paid'}, "${far} Cash A/c"`] : []),
                ...(has(cheque) ? [`the cheque, "${far} Bank A/c" (${isDebtor ? 'it was paid into the bank the same day' : 'it is paid out of the bank account'})`] : []),
              ].join('; ') + '.',
            ].join(' '),
            'The particulars never repeat the name of the account itself: they name the other account of the entry.',
            ...sideWork(view),
          ],
          hints: ['Take the dealings one at a time: does it raise or lower what is owed? That decides the side.', `${KIND_RULE[isDebtor ? 'debtor' : 'creditor']} ${RULE_TO_BY}`],
        },
      );
    }),
  verify: accountHolds,
});

// led-fmt-cash: Cash A/c from the cash transactions of a month, with an opening balance, balanced and brought down (medium)
const fmtCash = accountTemplate({
  id: 'led-fmt-cash',
  topicId: T,
  conceptId: 'led-formats',
  difficulty: 'medium',
  generate: (rng) =>
    firstOf(12, () => {
      const firm = rng.pick(TRADERS);
      const d = rng.pick(DEBTORS);
      const c = rng.pick(CREDITORS);
      const receipt = (text: string, other: string, min: number, max: number): Deal => {
        const a = amount(rng, min, max, 500);
        return { text: `${text} — ${inr(a)}`, lines: [debit('cash', a), credit(other, a)] };
      };
      const payment = (text: string, other: string, min: number, max: number): Deal => {
        const a = amount(rng, min, max, 500);
        return { text: `${text} — ${inr(a)}`, lines: [debit(other, a), credit('cash', a)] };
      };
      // Each kind once, so that no two rows of a side have the same particulars.
      const receipts = rng.shuffle([
        receipt('sold goods for cash', 'sales', 8000, 30000),
        receipt(`received cash from ${d}, a customer`, debtor(d), 5000, 20000),
        receipt('received commission in cash', 'commissionReceived', 1000, 6000),
        receipt('drew cash from the bank for office use', 'bank', 5000, 15000),
        receipt('the owner brought in more capital in cash', 'capital', 10000, 40000),
      ]);
      const payments = rng.shuffle([
        payment('paid rent in cash', 'rent', 3000, 9000),
        payment('paid salaries in cash', 'salaries', 5000, 15000),
        payment('bought goods for cash', 'purchases', 5000, 20000),
        payment(`paid cash to ${c}, a supplier`, creditor(c), 4000, 15000),
        payment('the owner took cash for personal use', 'drawings', 2000, 8000),
        payment('paid cash into the bank', 'bank', 5000, 20000),
        payment('bought stationery for cash', 'stationery', 500, 3000),
      ]);
      const nIn = rng.int(2, 3);
      const nOut = rng.int(3, 4);
      const deals = rng.shuffle([...receipts.slice(0, nIn), ...payments.slice(0, nOut)]);
      const dates = dateList(rng, deals.length + 1, true);
      const { end, next } = period(dates);
      const opening: OpeningBalance = { date: dates[0], side: 'Dr', amount: amount(rng, 10000, 40000, 1000) };
      const entries = dated(deals, dates.slice(1));
      // Cash in hand never runs out, and some is left at the end.
      let cash = opening.amount;
      for (const e of entries) {
        for (const l of e.lines) if (l.accountId === 'cash') cash += l.side === 'Dr' ? l.amount : -l.amount;
        if (cash < 0) return null;
      }
      if (cash <= 0) return null;
      // The accounts of the kinds of transaction that did not occur, but not of a party the data never names.
      const otherOf = (x: Deal) => x.lines.find((l) => l.accountId !== 'cash')!.accountId;
      const unused = [...receipts.slice(nIn), ...payments.slice(nOut)].map(otherOf).filter((a) => !a.includes(':')).map(ledgerLabel);
      const contra = deals.filter((x) => otherOf(x) === 'bank');
      return fromBooks(
        { accountId: 'cash', entries, opening },
        { closeOn: end, reopenOn: next },
        {
          task: `Prepare Cash A/c of ${firm} for the month. Balance it on ${end} and bring the balance down on ${next}.`,
          data: `${firm} had cash in hand of ${inr(opening.amount)} on ${opening.date}. These are its cash transactions of the month:\n${dealLines(deals, dates.slice(1))}`,
          title: 'Cash A/c',
          distractors: ['Cash A/c', ...unused],
          explanation: (view) => [
            'Cash A/c opens with the cash in hand on its debit side: "To Balance b/d".',
            'Every receipt is debited ("To" the account the cash came from) and every payment is credited ("By" the account the cash went to).',
            ...(contra.length > 0
              ? [
                  `Bank A/c is the other account of ${contra.length > 1 ? 'two entries' : 'one entry'}: ${contra
                    .map((x) => (x.lines[0].accountId === 'cash' ? 'cash drawn from the bank is a receipt of cash, "To Bank A/c"' : 'cash paid into the bank is a payment of cash, "By Bank A/c"'))
                    .join('; ')}.`,
                ]
              : []),
            ...sideWork(view),
            `On ${next} the balance is brought down on the debit side, below the totals: "To Balance b/d ${inr(view.balance!.amount)}".`,
          ],
          hints: ['Is cash coming in or going out? Receipts go on the debit side and payments on the credit side.', `${KIND_RULE.cash} ${RULE_TO_BY}`],
        },
      );
    }),
  verify: accountHolds,
});

// Closing a nominal account. Only real and personal accounts are carried down; an account of an expense, an income,
// purchases or sales is closed at the end of the year by transfer to Trading A/c or Profit and Loss A/c, so its
// closing row names that account in place of "Balance c/d", and nothing is brought down.

/** The two sides of a nominal account written up from `view`, closed on `closeOn` by transfer to `to` (its label). */
function closedSides(view: AccountView, closeOn: string, to: string): Pick<AccountParts, 'left' | 'right'> {
  const rows = (side: Side) => [
    ...(side === 'Dr' ? view.debit : view.credit).map((p) => ({ date: p.date, label: p.label, amount: p.amount })),
    ...(view.balance && view.balance.side !== side ? [{ date: closeOn, label: to, amount: view.balance.amount, closing: true }] : []),
  ];
  return { left: drSide(rows('Dr')), right: crSide(rows('Cr')) };
}

/** The working a closed nominal account ends on: the totals, and the transfer in place of a balance carried down. */
function closeWork(view: AccountView, to: string, why: string): string[] {
  const out = sideWork(view).slice(0, 2);
  const bal = view.balance!;
  const short = opp(bal.side);
  out.push(
    `The ${sideWord(bal.side)} side is larger by ${inr(bal.amount)}. ${why} So the account is not carried down: on the last day of the year its balance is transferred, "${pre(short)} ${to}" ${inr(bal.amount)} on the ${sideWord(short)} side, and both sides then total ${inr(view.total)}. Nothing is brought down: the account starts the next year empty.`,
  );
  return out;
}

/** What a closed nominal account was made from, kept for its `verify`: the entries and the account it is closed to. */
const keptClosing = keepFor<{ accountId: string; entries: DatedEntry[]; to: string }>();

/**
 * True when a closed nominal account holds: posting the kept entries again gives a balance that is transferred, on the
 * shorter side, to the account named, with no Balance c/d and nothing brought down; and each side carries exactly what
 * the entries post to the account.
 */
function closedHolds(q: AccountQuestion): boolean {
  const kept = keptClosing.of(q.data);
  if (!kept) return false;
  const balance = balanceOf(post(kept.entries.map((e) => e.lines)), kept.accountId);
  if (!balance) return false;
  const short = balance.side === 'Dr' ? 1 : 0;
  const closing = q.sides.map((s) => s.rows.filter((r) => r.closing));
  if (closing[short].length !== 1 || closing[1 - short].length !== 0) return false;
  if (closing[short][0].label !== kept.to || closing[short][0].amounts[0] !== balance.amount) return false;
  if (q.sides.some((s) => s.below.length > 0 || s.rows.some((r) => r.label === BALANCE_CD))) return false;
  return (['Dr', 'Cr'] as const).every((side, i) => {
    const posted = sum(kept.entries.flatMap((e) => e.lines.filter((l) => l.accountId === kept.accountId && l.side === side).map((l) => l.amount)));
    return sum(q.sides[i].rows.filter((r) => !r.closing).map((r) => r.amounts[0])) === posted;
  });
}

/** n different days of March, in order ("4 Mar"). */
function marchDates(rng: Rng, n: number): string[] {
  const days = new Set<number>();
  while (days.size < n) days.add(rng.int(2, 28));
  return [...days].sort((x, y) => x - y).map((d) => `${d} Mar`);
}

// led-fmt-goods: Purchases A/c or Sales A/c, among transactions that do not belong in it, closed to Trading A/c (medium)
// Version 2: the account is closed by transfer to Trading A/c at the end of the year, as a nominal account is, where
// version 1 carried it down as "Balance c/d" like a real account. The business begins on 1 March and its year ends on
// 31 March, so the month is the whole year; the sale of old furniture (which a new business does not have) is now an
// advance from a customer, which is not a sale either.
const fmtGoods = accountTemplate({
  id: 'led-fmt-goods',
  version: 2,
  topicId: T,
  conceptId: 'led-formats',
  difficulty: 'medium',
  generate: (rng) =>
    firstOf(12, () => {
      const buying = rng.next() < 0.5;
      const firm = rng.pick(TRADERS);
      const [p1, p2, px] = rng.shuffle(buying ? CREDITORS : DEBTORS);
      const party = buying ? creditor : debtor;
      const id = buying ? 'purchases' : 'sales';
      const name = buying ? 'Purchases A/c' : 'Sales A/c';
      const returns = buying ? 'Purchases Return A/c' : 'Sales Return A/c';
      const TRADING = ledgerLabel('trading');
      const x = (min: number, max: number) => amount(rng, min, max, 500);
      /** Goods bought (or sold): the other account is `other`. */
      const goods = (text: string, other: string, a: number): Deal => ({ text: `${text} — ${inr(a)}`, lines: buying ? [debit(id, a), credit(other, a)] : [debit(other, a), credit(id, a)] });
      const deal = (text: string, a: number, dr: string, cr: string): Deal => ({ text: `${text} — ${inr(a)}`, lines: [debit(dr, a), credit(cr, a)] });
      const first = goods(buying ? `bought goods from ${p1} on credit` : `sold goods to ${p1} on credit`, party(p1), x(20000, 60000));
      const more = goods(buying ? `bought more goods from ${p1} on credit` : `sold more goods to ${p1} on credit`, party(p1), x(8000, 18000));
      // Goods the owner takes home were bought for resale and are no longer for resale: they come out of Purchases A/c
      // at cost. They are not sold, so they never touch Sales A/c.
      const ownerTook = deal('the owner took goods for personal use, at cost', x(1000, 5000), 'drawings', 'purchases');
      const belong: Deal[] = [first, goods(buying ? 'bought goods for cash' : 'sold goods for cash', 'cash', x(5000, 25000))];
      if (rng.next() < 0.7) belong.push(goods(buying ? `bought goods from ${p2} on credit` : `sold goods to ${p2} on credit`, party(p2), x(10000, 40000)));
      if (rng.next() < 0.6) belong.push(goods(buying ? 'bought goods and paid by cheque' : 'sold goods, received a cheque and paid it into the bank the same day', 'bank', x(8000, 30000)));
      if (rng.next() < 0.4) belong.push(more);
      if (buying && rng.next() < 0.5) belong.push(ownerTook);
      // At least four rows besides the transfer: an account of two or three rows is not a 4-mark question.
      if (belong.length < 4) return null;
      const back = buying ? deal(`returned goods to ${p1}`, x(2000, 6000), party(p1), 'purchasesReturn') : deal(`${p1} returned goods`, x(2000, 6000), 'salesReturn', party(p1));
      const settle = buying ? deal(`paid cash to ${p1}`, x(5000, 12000), party(p1), 'cash') : deal(`received cash from ${p1}`, x(5000, 12000), 'cash', party(p1));
      const asset = buying
        ? deal(`bought furniture for the shop from ${px} on credit`, x(10000, 30000), 'furniture', party(px))
        : deal(`received cash from ${px} as an advance for goods to be supplied in April`, x(5000, 15000), 'cash', party(px));
      const other = buying ? deal('sold goods for cash', x(5000, 25000), 'cash', 'sales') : deal('bought goods for cash', x(5000, 25000), 'purchases', 'cash');
      // One more that a student is tempted to post: carriage on goods bought (to Purchases A/c), goods the owner took (to Sales A/c).
      const tempting = buying ? deal('paid carriage on goods bought, in cash', x(500, 2500), 'carriageInwards', 'cash') : ownerTook;
      const strangers = rng.shuffle([settle, asset, other, tempting]).slice(0, rng.int(1, 2));
      const deals = rng.shuffle([...belong, back, ...strangers]);
      // The first dealing with the party comes before more goods, before the goods go back and before any money moves.
      const at = Math.min(...[first, more, back, settle].map((d) => deals.indexOf(d)).filter((i) => i >= 0));
      const was = deals.indexOf(first);
      [deals[at], deals[was]] = [deals[was], deals[at]];
      const dates = marchDates(rng, deals.length);
      const left = deals.filter((d) => d === back || strangers.includes(d));
      const why = (d: Deal) =>
        d === back
          ? `the goods returned (they are posted to ${returns})`
          : d === settle
            ? `the cash ${buying ? 'paid to' : 'received from'} ${p1} (it settles part of a debt: no goods are ${buying ? 'bought' : 'sold'})`
            : d === asset
              ? buying
                ? 'the furniture (an asset for use in the shop, not goods for resale: it is posted to Furniture A/c)'
                : `the advance from ${px} (no goods have gone yet, so nothing is sold: Cash A/c is debited and ${px} A/c credited, and the sale is recorded in April)`
              : d === other
                ? buying
                  ? 'the cash sale (it is posted to Sales A/c)'
                  : 'the cash purchase (it is posted to Purchases A/c)'
                : buying
                  ? 'the carriage (an expense with an account of its own, Carriage Inwards A/c)'
                  : 'the goods the owner took (they are not sold: Drawings A/c is debited and Purchases A/c is credited, at cost)';
      const entries = dated(deals, dates);
      const view = accountOf(entries, id);
      if (!view.balance) return null;
      const data = `${firm} began business on 1 March 2026, dealing in goods bought for resale. Its first accounting year ends on 31 March 2026. These are its transactions of March:\n${dealLines(deals, dates)}`;
      keptClosing.keep(data, { accountId: id, entries, to: TRADING });
      return {
        task: `Prepare ${name} of ${firm} for March and close it on 31 March, the last day of the accounting year, by transfer to Trading A/c. Goods returned are recorded in ${returns}, not in ${name}.`,
        data,
        title: name,
        ...closedSides(view, '31 Mar', TRADING),
        // The account itself, the accounts of what is left out, Balance c/d (a nominal account is not carried down)
        // and Profit and Loss A/c (purchases and sales go to Trading A/c).
        distractors: [
          name,
          returns,
          ...(buying ? ['Furniture A/c'] : []),
          ...(strangers.includes(asset) ? [ledgerLabel(party(px))] : []),
          buying ? 'Sales A/c' : 'Purchases A/c',
          'Drawings A/c',
          ...(buying ? ['Carriage Inwards A/c'] : []),
          BALANCE_CD,
          ledgerLabel('profitAndLoss'),
        ],
        explanation: [
          buying
            ? `Purchases A/c is debited with goods bought for resale, whether for cash, by cheque or on credit. The particulars name the account that is credited: Cash A/c, Bank A/c or the supplier.${belong.includes(ownerTook) ? ' Goods the owner takes for personal use are no longer for resale, so they are credited to it at cost: "By Drawings A/c".' : ''}`
            : 'Sales A/c is credited with goods sold, whether for cash, by cheque or on credit. The particulars name the account that is debited: Cash A/c, Bank A/c (a cheque banked the same day) or the customer.',
          `Left out: ${left.map(why).join('; ')}.`,
          ...closeWork(view, TRADING, `${name} is a nominal account, and ${buying ? 'purchases' : 'sales'} belong in the Trading Account.`),
        ],
        hints: [
          `Go down the list and ask of each transaction: were goods ${buying ? 'bought for resale' : 'sold'}? Only those belong in ${name}.`,
          `${name} is a nominal account. It is not carried down: on 31 March its balance is transferred to Trading A/c on the shorter side, "${buying ? 'By' : 'To'} Trading A/c".`,
        ],
      };
    }),
  verify: closedHolds,
});

// led-fmt-compound: a personal account from compound entries: a GST invoice and a settlement at a discount (complex)
const fmtCompound = accountTemplate({
  id: 'led-fmt-compound',
  topicId: T,
  conceptId: 'led-formats',
  difficulty: 'complex',
  generate: (rng) =>
    firstOf(12, () => {
      const isDebtor = rng.next() < 0.5;
      const who = rng.pick(isDebtor ? DEBTORS : CREDITORS);
      const firm = rng.pick(TRADERS);
      const id = isDebtor ? debtor(who) : creditor(who);
      const nature: Side = isDebtor ? 'Dr' : 'Cr';
      const intra = rng.next() < 0.6;
      const rate = rng.pick([5, 18]);
      // Sometimes the goods carry a trade discount: it is taken off the list price and never recorded, and GST is
      // charged on what is left. A list price in steps of ₹2,000 keeps the goods and each half of the tax in whole rupees.
      const list = amount(rng, 20000, 80000, 2000);
      const trade = rng.next() < 0.4 ? rng.pick([10, 20]) : 0;
      const tradeAmt = percentOf(list, trade);
      const base = list - tradeAmt;
      const tax = percentOf(base, rate);
      const taxAccounts = (isDebtor ? (intra ? ['outputCGST', 'outputSGST'] : ['outputIGST']) : intra ? ['inputCGST', 'inputSGST'] : ['inputIGST']).map((a) => ({ a, amt: tax / (intra ? 2 : 1) }));
      const goodsAccount = isDebtor ? 'sales' : 'purchases';
      const taxWords = intra ? 'CGST and SGST in equal parts, the supply being within the state' : `IGST, the ${isDebtor ? 'customer' : 'supplier'} being in another state`;
      const invoice: Deal = {
        text: `${isDebtor ? `sold goods to ${who}` : `bought goods from ${who}`} on credit ${
          trade ? `at a list price of ${inr(list)} less trade discount of ${trade}%; GST at ${rate}% is charged on the price after the discount, as` : `for ${inr(base)} before tax; GST at ${rate}% is charged as`
        } ${taxWords}`,
        lines: isDebtor
          ? [debit(id, base + tax), credit(goodsAccount, base), ...taxAccounts.map((t) => credit(t.a, t.amt))]
          : [debit(goodsAccount, base), ...taxAccounts.map((t) => debit(t.a, t.amt)), credit(id, base + tax)],
      };
      const settled = amount(rng, 10000, 40000, 2000);
      const pct = rng.pick([2, 5]);
      const disc = percentOf(settled, pct);
      const money = settled - disc;
      const byCheque = rng.next() < 0.5;
      const moneyAccount = byCheque ? 'bank' : 'cash';
      const discAccount = isDebtor ? 'discountAllowed' : 'discountReceived';
      // "Out of the amount due": the settlement clears that much of the account, not all of it.
      const settlement: Deal = {
        text: isDebtor
          ? `received ${byCheque ? 'a cheque for' : 'cash of'} ${inr(money)} from ${who} in full settlement of ${inr(settled)} out of the amount due${byCheque ? '; the cheque was paid into the bank the same day' : ''}`
          : `${byCheque ? 'issued a cheque for' : 'paid cash of'} ${inr(money)} to ${who} in full settlement of ${inr(settled)} out of the amount owed`,
        lines: isDebtor ? [debit(moneyAccount, money), debit(discAccount, disc), credit(id, settled)] : [debit(id, settled), credit(moneyAccount, money), credit(discAccount, disc)],
      };
      // Sometimes a plain payment on account as well, by the other means, so that its row differs from the settlement's.
      const onAccount = amount(rng, 4000, 12000, 1000);
      const otherMeans = byCheque ? 'cash' : 'bank';
      const part: Deal | null =
        rng.next() < 0.5
          ? {
              text: isDebtor
                ? `received ${byCheque ? 'cash of' : 'a cheque for'} ${inr(onAccount)} from ${who} on account${byCheque ? '' : '; the cheque was paid into the bank the same day'}`
                : `${byCheque ? 'paid cash of' : 'issued a cheque for'} ${inr(onAccount)} to ${who} on account`,
              lines: isDebtor ? [debit(otherMeans, onAccount), credit(id, onAccount)] : [debit(id, onAccount), credit(otherMeans, onAccount)],
            }
          : null;
      // Sometimes an order as well: nothing is posted for it until the goods move.
      const ordered = amount(rng, 10000, 50000, 1000);
      const order: Deal | null =
        rng.next() < 0.35
          ? {
              text: isDebtor
                ? `${who} placed an order for goods worth ${inr(ordered)}; the goods are yet to be delivered`
                : `placed an order with ${who} for goods worth ${inr(ordered)}; the goods are yet to be received`,
              lines: [],
            }
          : null;
      const hasOpening = rng.next() < 0.6;
      const deals = rng.shuffle([invoice, settlement, ...(part ? [part] : []), ...(order ? [order] : [])]);
      if (!hasOpening) {
        // With nothing owed at the start, no money moves before the invoice.
        const at = Math.min(...[invoice, settlement, ...(part ? [part] : [])].map((d) => deals.indexOf(d)));
        const was = deals.indexOf(invoice);
        [deals[at], deals[was]] = [deals[was], deals[at]];
      }
      const dates = dateList(rng, deals.length + (hasOpening ? 1 : 0), hasOpening);
      const { end, next } = period(dates);
      const opening: OpeningBalance | undefined = hasOpening ? { date: dates[0], side: nature, amount: amount(rng, 10000, 40000, 1000) } : undefined;
      const dealDates = hasOpening ? dates.slice(1) : dates;
      const entries = dated(deals, dealDates);
      // Nothing is settled or paid beyond what is owed at the time; and something is still owed at the end.
      let owed = opening?.amount ?? 0;
      for (const e of entries) {
        for (const l of e.lines) if (l.accountId === id) owed += l.side === nature ? l.amount : -l.amount;
        if (owed < 0) return null;
      }
      if (owed <= 0) return null;
      const openingLine = opening ? `• ${opening.date}: balance brought down — ${inr(opening.amount)} (${isDebtor ? `${who} owes ${firm}` : `${firm} owes ${who}`})\n` : '';
      const taxNames = taxAccounts.map((t) => ledgerLabel(t.a));
      const own = pre(nature);
      const far = pre(opp(nature));
      return fromBooks(
        { accountId: id, entries, opening },
        { closeOn: end, reopenOn: next },
        {
          task: `Prepare ${who} A/c in the books of ${firm} for the month. Balance it on ${end} and bring the balance down on ${next}. Give each account of a compound entry a row of its own.`,
          data: `${who} is a ${isDebtor ? 'customer' : 'supplier'} of ${firm}. These are all the dealings with ${who} in the month:\n${openingLine}${dealLines(deals, dealDates)}`,
          title: `${who} A/c`,
          // The account itself, the discount and the taxes of the other kind of party, returns, the other means of
          // payment, and an account for the trade discount, which has none.
          distractors: [
            `${who} A/c`,
            isDebtor ? 'Discount Received A/c' : 'Discount Allowed A/c',
            ...(isDebtor ? (intra ? ['Input CGST A/c', 'Output IGST A/c'] : ['Input IGST A/c', 'Output CGST A/c']) : intra ? ['Output CGST A/c', 'Input IGST A/c'] : ['Output IGST A/c', 'Input CGST A/c']),
            isDebtor ? 'Sales Return A/c' : 'Purchases Return A/c',
            ledgerLabel(otherMeans),
            ...(trade ? ['Trade Discount A/c'] : []),
          ],
          explanation: (view) => [
            ...(opening ? [`The amount owed on ${opening.date} opens the account on its ${sideWord(nature)} side: "${own} Balance b/d" ${inr(opening.amount)}.`] : []),
            ...(trade ? [`Trade discount is not recorded: the goods are entered at ${inr(list)} - ${trade}% of ${inr(list)} (${inr(tradeAmt)}) = ${inr(base)}.`] : []),
            `GST = ${rate}% of ${inr(base)} = ${inr(tax)}${intra ? `, half of it (${inr(tax / 2)}) each as CGST and SGST` : ''}. The invoice comes to ${inr(base)} + ${inr(tax)} = ${inr(base + tax)}.`,
            `The invoice entry has ${taxAccounts.length + 1} accounts besides ${who} A/c, so ${who} A/c shows a row for each: "${own} ${ledgerLabel(goodsAccount)}" ${inr(base)}${intra ? ',' : ' and'} ${taxNames.map((t) => `"${own} ${t}" ${inr(taxAccounts[0].amt)}`).join(' and ')}.`,
            `The settlement clears ${inr(settled)}: "${far} ${ledgerLabel(moneyAccount)}" ${inr(money)} for the money, and "${far} ${ledgerLabel(discAccount)}" ${inr(settled)} - ${inr(money)} = ${inr(disc)} for the discount.`,
            ...(part ? [`The ${otherMeans === 'cash' ? 'cash' : 'cheque'} ${isDebtor ? 'received' : 'paid'} on account lowers the amount owed: "${far} ${ledgerLabel(otherMeans)}" ${inr(onAccount)}.`] : []),
            ...(order ? [`The order is not posted: nothing is owed for it until the goods are ${isDebtor ? 'delivered' : 'received'}.`] : []),
            ...sideWork(view),
            `On ${next} the balance is brought down on the ${sideWord(view.balance!.side)} side, below the totals: "${pre(view.balance!.side)} Balance b/d ${inr(view.balance!.amount)}".`,
          ],
          hints: [
            'Write the journal entry for each dealing first. Every account on the other side of the entry gives this account a row of its own.',
            `The invoice reaches ${who} A/c in parts, the goods and each tax, which together make the invoice total. A settlement clears the amount settled: the money and the discount, each with its own row.`,
          ],
        },
      );
    }),
  verify: accountHolds,
});

// ---------------------------------------------------------------------------------------------------------------
// led-fmt-close-nominal: an expense or an income account for the year, closed on 31 March to Trading A/c or to
// Profit and Loss A/c, whichever it belongs to (easy). Added after the papers were set: outside them (outsidePapers).
// ---------------------------------------------------------------------------------------------------------------

/** One item of a nominal account: when, what happened, the money account it went through, and its amount. */
interface NominalItem {
  date: string;
  text: string;
  via: 'cash' | 'bank';
  amt: number;
}
/** A transaction that a student is tempted to post in the account but that belongs elsewhere. */
interface NominalStranger {
  text: string;
  lines: (a: number) => JournalLine[];
  why: string;
  range: [number, number];
}
interface Nominal {
  accountId: string;
  /** Debit for an expense, credit for an income. */
  nature: Side;
  /** The account it is closed to at the end of the year. */
  to: 'trading' | 'profitAndLoss';
  /** Why it goes there, in a few words. */
  why: string;
  /** The businesses that would have such an account, with what each does. */
  firms: string[];
  items: (rng: Rng) => NominalItem[] | null;
  stranger?: NominalStranger;
}

const YEAR_END = '31 March 2026';
const MONTH_NUMBER: Record<string, number> = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
/** "12 August 2025" as a number that sorts in time. */
const dayOrder = (date: string): number => {
  const [d, m, y] = date.split(' ');
  return Number(y) * 10000 + MONTH_NUMBER[m] * 100 + Number(d);
};

/** Different amounts in steps of `step` rupees between `min` and `max` rupees, one for each of `n` items. */
function distinctAmounts(rng: Rng, n: number, min: number, max: number, step: number): number[] | null {
  const out = new Set<number>();
  for (let i = 0; i < 20 && out.size < n; i++) out.add(amount(rng, min, max, step));
  return out.size === n ? [...out] : null;
}

/** Payments (or receipts) of the year on the dates given, through cash or the bank, at different amounts. */
const spread =
  (dates: string[], text: (date: string) => string, min: number, max: number, step = 500) =>
  (rng: Rng): NominalItem[] | null => {
    const amts = distinctAmounts(rng, dates.length, min, max, step);
    if (!amts) return null;
    return dates.map((date, i) => ({ date, text: text(date), via: rng.next() < 0.5 ? 'cash' : 'bank', amt: amts[i] }));
  };

const QUARTER_ENDS = ['30 June 2025', '30 September 2025', '31 December 2025', '31 March 2026'];
const QUARTER_NAMES: Record<string, string> = {
  '30 June 2025': 'April to June',
  '30 September 2025': 'July to September',
  '31 December 2025': 'October to December',
  '31 March 2026': 'January to March',
};

const NOMINALS: Nominal[] = [
  {
    accountId: 'rent',
    nature: 'Dr',
    to: 'profitAndLoss',
    why: 'Rent of the shop is an indirect expense of running the business, so it goes to the Profit and Loss Account.',
    firms: ['Sharma Medical Store, a chemist in Jaipur', 'Iqbal Footwear, a shoe shop in Lucknow', 'Kaveri Book House, a bookshop in Mysuru'],
    // The rent of each quarter, raised from 1 October: the two rates and the two ways of paying keep the rows apart.
    items: (rng) => {
      const before = amount(rng, 6000, 15000, 1000);
      const after = before + amount(rng, 1000, 3000, 500);
      const start = rng.next() < 0.5 ? 0 : 1;
      return QUARTER_ENDS.map((date, i) => ({
        date,
        text: `paid the rent of the shop for ${QUARTER_NAMES[date]}`,
        via: (i + start) % 2 === 0 ? 'cash' : 'bank',
        amt: i < 2 ? before : after,
      }));
    },
    stranger: {
      text: "paid the rent of the owner's house by cheque from the business bank account",
      lines: (a) => [debit('drawings', a), credit('bank', a)],
      why: "the rent of the owner's house (a private expense: Drawings A/c is debited)",
      range: [5000, 12000],
    },
  },
  {
    accountId: 'salaries',
    nature: 'Dr',
    to: 'profitAndLoss',
    why: 'Salaries of the office and sales staff are an indirect expense, so they go to the Profit and Loss Account.',
    firms: ['Verma Electricals, an electrical goods shop in Kanpur', 'Joshi Tutorials, a coaching centre in Nagpur', 'Thomas Hardware, a hardware shop in Kochi'],
    items: (rng) => {
      const monthly = amount(rng, 15000, 40000, 1000);
      const raise = amount(rng, 1000, 4000, 500);
      return [
        { date: '30 September 2025', text: 'paid salaries for April to September', via: 'bank', amt: 6 * monthly },
        { date: '28 February 2026', text: 'paid salaries for October to February', via: 'bank', amt: 5 * (monthly + raise) },
        { date: '31 March 2026', text: 'paid salaries for March', via: 'cash', amt: monthly + raise },
      ];
    },
    stranger: {
      text: "paid the salary of the owner's domestic help from the business cash",
      lines: (a) => [debit('drawings', a), credit('cash', a)],
      why: "the salary of the owner's domestic help (a private expense: Drawings A/c is debited)",
      range: [4000, 9000],
    },
  },
  {
    accountId: 'wages',
    nature: 'Dr',
    to: 'trading',
    why: 'Wages of the workers who make the goods are a direct expense, so they go to the Trading Account.',
    firms: ['Bhatia Furniture Works, a maker of wooden furniture in Ludhiana', 'Deepa Garments, a small stitching unit in Tiruppur', 'Gill Agro Inputs, which mixes and packs cattle feed in Moga'],
    items: spread(QUARTER_ENDS, (date) => `paid wages of the workers for ${QUARTER_NAMES[date]}`, 20000, 60000, 1000),
    stranger: {
      text: 'paid wages to workers for installing a new machine',
      lines: (a) => [debit('machinery', a), credit('cash', a)],
      why: 'the wages for installing the machine (part of the cost of the machine, a capital expenditure: Machinery A/c is debited)',
      range: [2000, 8000],
    },
  },
  {
    accountId: 'carriageInwards',
    nature: 'Dr',
    to: 'trading',
    why: 'Carriage on goods bought is part of the cost of bringing the goods in, a direct expense, so it goes to the Trading Account.',
    firms: ['Nair Auto Spares, a spare parts shop in Thrissur', 'Gill Agro Inputs, a seeds and fertiliser shop in Moga', 'Iqbal Footwear, a shoe shop in Lucknow'],
    items: spread(['20 May 2025', '14 August 2025', '9 November 2025', '18 February 2026'], () => 'paid carriage on goods bought', 1000, 6000),
    stranger: {
      text: 'paid carriage on goods sent to customers',
      lines: (a) => [debit('carriageOutwards', a), credit('cash', a)],
      why: 'the carriage on goods sent to customers (a selling expense with an account of its own, Carriage Outwards A/c)',
      range: [500, 3000],
    },
  },
  {
    accountId: 'electricity',
    nature: 'Dr',
    to: 'profitAndLoss',
    why: 'Electricity of the shop is an indirect expense, so it goes to the Profit and Loss Account.',
    firms: ['Kaveri Book House, a bookshop in Mysuru', 'Sharma Medical Store, a chemist in Jaipur', 'Verma Electricals, an electrical goods shop in Kanpur'],
    items: spread(QUARTER_ENDS, (date) => `paid the electricity bill of the shop for ${QUARTER_NAMES[date]}`, 2000, 9000),
    stranger: {
      text: "paid the electricity bill of the owner's home by cheque",
      lines: (a) => [debit('drawings', a), credit('bank', a)],
      why: "the electricity bill of the owner's home (a private expense: Drawings A/c is debited)",
      range: [1000, 4000],
    },
  },
  {
    accountId: 'commissionReceived',
    nature: 'Cr',
    to: 'profitAndLoss',
    why: 'Commission earned is an income other than from sales, so it goes to the Profit and Loss Account.',
    firms: ['Thomas Hardware, a hardware shop in Kochi that also books orders for a paint company', 'Gill Agro Inputs, a seeds shop in Moga that acts as agent for a tractor dealer'],
    items: spread(['25 June 2025', '28 September 2025', '27 December 2025', '26 March 2026'], () => 'received commission for orders booked', 1500, 9000),
  },
  {
    accountId: 'rentReceived',
    nature: 'Cr',
    to: 'profitAndLoss',
    why: 'Rent received from a tenant is an income, so it goes to the Profit and Loss Account.',
    firms: ['Nair Auto Spares, which lets the floor above its shop in Thrissur', 'Kaveri Book House, which lets a room of its building in Mysuru'],
    items: (rng) => {
      const before = amount(rng, 4000, 9000, 500);
      const after = before + amount(rng, 500, 2000, 500);
      const start = rng.next() < 0.5 ? 0 : 1;
      return QUARTER_ENDS.map((date, i) => ({ date, text: `received rent from the tenant for ${QUARTER_NAMES[date]}`, via: (i + start) % 2 === 0 ? 'bank' : 'cash', amt: i < 2 ? before : after }));
    },
  },
];

const fmtCloseNominal = accountTemplate({
  id: 'led-fmt-close-nominal',
  topicId: T,
  conceptId: 'led-closing',
  difficulty: 'easy',
  generate: (rng) =>
    firstOf(12, () => {
      const n = rng.pick(NOMINALS);
      const firm = rng.pick(n.firms);
      const short = firm.split(',')[0];
      const items = n.items(rng);
      if (!items) return null;
      const name = ledgerLabel(n.accountId);
      const to = ledgerLabel(n.to);
      const deals: { date: string; text: string; lines: JournalLine[] }[] = items.map((it) => ({
        date: it.date,
        text: `${it.text}, ${it.via === 'cash' ? 'in cash' : n.nature === 'Dr' ? 'by cheque' : 'by cheque, paid into the bank the same day'} — ${inr(it.amt)}`,
        lines: n.nature === 'Dr' ? [debit(n.accountId, it.amt), credit(it.via, it.amt)] : [debit(it.via, it.amt), credit(n.accountId, it.amt)],
      }));
      // Two rows of a side with the same particulars and amount could not be told apart.
      const keys = items.map((it) => `${it.via}:${it.amt}`);
      if (new Set(keys).size !== keys.length) return null;
      const stranger = n.stranger && rng.next() < 0.7 ? n.stranger : null;
      if (stranger) {
        const a = amount(rng, stranger.range[0], stranger.range[1], 500);
        const date = rng.pick(['12 August 2025', '15 November 2025', '10 January 2026']);
        const at = deals.findIndex((d) => dayOrder(d.date) > dayOrder(date));
        deals.splice(at < 0 ? deals.length : at, 0, { date, text: `${stranger.text} — ${inr(a)}`, lines: stranger.lines(a) });
      }
      const entries: DatedEntry[] = deals.map((d) => ({ date: d.date, lines: d.lines }));
      const view = accountOf(entries, n.accountId);
      if (!view.balance || view.balance.side !== n.nature) return null;
      const data = `${firm}. Its accounting year ends on ${YEAR_END}. These are the transactions of the year that concern ${name}:\n${deals.map((d) => `• ${d.date}: ${d.text}`).join('\n')}`;
      keptClosing.keep(data, { accountId: n.accountId, entries, to });
      const wrongTo = ledgerLabel(n.to === 'trading' ? 'profitAndLoss' : 'trading');
      const isExpense = n.nature === 'Dr';
      return {
        task: `Prepare ${name} of ${short} for the year ended ${YEAR_END} and close it on ${YEAR_END}.`,
        data,
        title: name,
        ...closedSides(view, YEAR_END, to),
        // The account itself; Balance c/d and Balance b/d (a nominal account is not carried down); the other final
        // account; Drawings A/c or the account of the stranger when it is not in the list.
        distractors: [name, BALANCE_CD, BALANCE_BD, wrongTo, ...(stranger ? [] : [isExpense ? 'Drawings A/c' : 'Sales A/c'])],
        explanation: [
          isExpense
            ? `${name} is the account of an expense: every payment is debited, "To Cash A/c" or "To Bank A/c" as it was paid.`
            : `${name} is the account of an income: every receipt is credited, "By Cash A/c" or "By Bank A/c" as it came in.`,
          ...(stranger ? [`Left out: ${stranger.why}.`] : []),
          ...closeWork(view, to, `${name} is a nominal account. ${n.why}`),
        ],
        hints: [
          `Post each ${isExpense ? 'payment on the debit side' : 'receipt on the credit side'}, leaving out anything that is not the business's own ${isExpense ? 'expense' : 'income'}. Then ask: is this account carried down, or closed?`,
          'A nominal account (an expense or an income) is not carried down. It is closed on the last day of the year by transfer, on its shorter side: direct expenses, purchases and sales to Trading A/c; indirect expenses and other incomes to Profit and Loss A/c.',
        ],
      };
    }),
  verify: closedHolds,
});

// ---------------------------------------------------------------------------------------------------------------
// led-fmt-journal-cash (medium) and led-fmt-journal-party (complex): a journal of six to eight entries of one business,
// printed as journal entries, compound ones among them; the student posts the entries that touch one account and
// balances it. Added after the papers were set: outside them (outsidePapers).
// ---------------------------------------------------------------------------------------------------------------

/** One entry of the printed journal: its kind (so a story can be checked), its narration and its lines. */
interface JEntry {
  kind: 'cashSale' | 'creditSale' | 'creditBuy' | 'settleD' | 'payC' | 'rent' | 'returnIn' | 'returnOut' | 'deposit' | 'drawings' | 'furniture';
  narration: string;
  lines: JournalLine[];
}

const MONTH_NAMES: Record<string, string> = { Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December', Jan: 'January', Feb: 'February' };
const JOURNAL_FIRMS = ['Verma Electricals', 'Gill Agro Inputs', 'Nair Auto Spares', 'Kaveri Book House', 'Sharma Medical Store', 'Thomas Hardware'];

/** "Cash A/c Dr ₹9,800; Discount Allowed A/c Dr ₹200; To Mohan A/c ₹10,000 (received from Mohan in full settlement)" */
const journalLine = (e: JEntry): string =>
  `${[...e.lines.filter((l) => l.side === 'Dr').map((l) => `${ledgerLabel(l.accountId)} Dr ${inr(l.amount)}`), ...e.lines.filter((l) => l.side === 'Cr').map((l) => `To ${ledgerLabel(l.accountId)} ${inr(l.amount)}`)].join('; ')} (${e.narration})`;

interface JournalMonth {
  firm: string;
  d: string;
  c: string;
  dates: string[];
  entries: DatedEntry[];
  printed: JEntry[];
  openCash: number;
  openD: number;
  openC: number;
  data: string;
}

/**
 * A month of one business in journal form. `must` are the kinds that have to be in it (those that touch the account
 * asked for); the rest are drawn from the others, six to eight entries in all. The story holds: cash never runs out,
 * no one pays or returns more than is owed, a return follows its sale or purchase.
 */
function journalMonth(rng: Rng, must: JEntry['kind'][], total: number): JournalMonth | null {
  const firm = rng.pick(JOURNAL_FIRMS);
  const d = rng.pick(DEBTORS);
  const c = rng.pick(CREDITORS);
  const D = debtor(d);
  const C = creditor(c);
  const x = (min: number, max: number, step = 500) => amount(rng, min, max, step);
  const openCash = x(20000, 50000, 1000);
  const openD = x(10000, 30000, 1000);
  const openC = x(10000, 30000, 1000);
  const sale = x(10000, 40000);
  const buy = x(10000, 40000);
  const settled = x(6000, Math.min(20000, openD / 100), 1000);
  const allowed = percentOf(settled, rng.pick([2, 5]));
  const paidC = x(6000, Math.min(20000, openC / 100), 1000);
  const received = percentOf(paidC, rng.pick([2, 5]));
  const furniture = x(8000, 20000, 1000);
  const furnitureCash = x(2000, furniture / 100 - 2000, 1000);
  const make: Record<JEntry['kind'], () => JEntry> = {
    cashSale: () => {
      const a = x(5000, 25000);
      return { kind: 'cashSale', narration: 'goods sold for cash', lines: [debit('cash', a), credit('sales', a)] };
    },
    creditSale: () => ({ kind: 'creditSale', narration: `goods sold to ${d} on credit`, lines: [debit(D, sale), credit('sales', sale)] }),
    creditBuy: () => ({ kind: 'creditBuy', narration: `goods bought from ${c} on credit`, lines: [debit('purchases', buy), credit(C, buy)] }),
    settleD: () => ({
      kind: 'settleD',
      narration: `cash received from ${d} in full settlement of a bill of ${inr(settled)}`,
      lines: [debit('cash', settled - allowed), debit('discountAllowed', allowed), credit(D, settled)],
    }),
    payC: () => ({
      kind: 'payC',
      narration: `cheque issued to ${c} in full settlement of a bill of ${inr(paidC)}`,
      lines: [debit(C, paidC), credit('bank', paidC - received), credit('discountReceived', received)],
    }),
    rent: () => {
      const a = x(3000, 12000);
      return { kind: 'rent', narration: 'rent of the shop paid in cash', lines: [debit('rent', a), credit('cash', a)] };
    },
    returnIn: () => {
      const a = x(1000, Math.min(6000, sale / 100 - 1000));
      return { kind: 'returnIn', narration: `${d} returned goods`, lines: [debit('salesReturn', a), credit(D, a)] };
    },
    returnOut: () => {
      const a = x(1000, Math.min(6000, buy / 100 - 1000));
      return { kind: 'returnOut', narration: `goods returned to ${c}`, lines: [debit(C, a), credit('purchasesReturn', a)] };
    },
    deposit: () => {
      const a = x(5000, 15000, 1000);
      return { kind: 'deposit', narration: 'cash paid into the bank', lines: [debit('bank', a), credit('cash', a)] };
    },
    drawings: () => {
      const a = x(2000, 8000);
      return { kind: 'drawings', narration: 'cash taken by the owner for personal use', lines: [debit('drawings', a), credit('cash', a)] };
    },
    furniture: () => ({
      kind: 'furniture',
      narration: 'furniture bought for the shop, paid partly in cash and partly by cheque',
      lines: [debit('furniture', furniture), credit('cash', furnitureCash), credit('bank', furniture - furnitureCash)],
    }),
  };
  // The others are drawn without returns; a return is added only beside its sale or purchase, and comes after it.
  const pairs = [['creditSale', 'returnIn'], ['creditBuy', 'returnOut']] as const;
  const pool = rng.shuffle((Object.keys(make) as JEntry['kind'][]).filter((k) => !must.includes(k) && k !== 'returnIn' && k !== 'returnOut'));
  const chosen: JEntry['kind'][] = [...must];
  for (const [sale, ret] of pairs) if (chosen.includes(sale) && !chosen.includes(ret) && rng.next() < 0.5) chosen.push(ret);
  for (const k of pool) if (chosen.length < total) chosen.push(k);
  const kinds = rng.shuffle(chosen);
  for (const [first, then] of pairs) {
    const [i, j] = [kinds.indexOf(first), kinds.indexOf(then)];
    if (j >= 0 && j < i) [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  const printed = kinds.map((k) => make[k]());
  const dates = dateList(rng, printed.length + 1, true);
  const entries: DatedEntry[] = printed.map((e, i) => ({ date: dates[i + 1], lines: e.lines }));
  // Cash never runs out, and no party is paid or returns more than is owed at the time.
  const start: Books = new Map([
    ['cash', openCash],
    [D, openD],
    [C, -openC],
  ]);
  let books: Books = start;
  for (const e of entries) {
    books = post([e.lines], books);
    if ((books.get('cash') ?? 0) < 0 || (books.get(D) ?? 0) < 0 || (books.get(C) ?? 0) > 0) return null;
  }
  const mon = dates[0].split(' ')[1];
  const data = [
    `${firm} keeps its books by double entry. Balances on ${dates[0]}: cash in hand ${inr(openCash)}; ${d}, a customer, owes ${inr(openD)}; ${firm} owes ${c}, a supplier, ${inr(openC)}. The firm has money in the bank.`,
    `The journal of ${MONTH_NAMES[mon]} (every entry is posted to the ledger):`,
    ...printed.map((e, i) => `• ${dates[i + 1]}: ${journalLine(e)}`),
  ].join('\n');
  return { firm, d, c, dates, entries, printed, openCash, openD, openC, data };
}

/** The labels of the printed journal that the rows of an account do not use: the accounts a student might wrongly post. */
function unusedLabels(m: JournalMonth, parts: Pick<AccountParts, 'left' | 'right'>): string[] {
  const used = new Set([...parts.left.rows, ...parts.right.rows, ...(parts.left.below ?? []), ...(parts.right.below ?? [])].map((r) => r.label));
  return [...new Set(m.printed.flatMap((e) => e.lines.map((l) => ledgerLabel(l.accountId))))].filter((l) => !used.has(l));
}

/** The working of an account posted from the journal: each posting with the entry it came from. */
function postingWork(view: AccountView, own: string): string[] {
  const line = (p: { date: string; side: Side; label: string; amount: number }) => `${p.date}: "${pre(p.side)} ${p.label}" ${inr(p.amount)} on the ${sideWord(p.side)} side.`;
  return [
    `Go down the journal and stop at every entry that names ${own}. Post it on the side it has in the entry, naming the other account (or each other account, when ${own} stands alone on its side of a compound entry).`,
    ...[...view.debit, ...view.credit].filter((p) => p.label !== BALANCE_BD).map(line),
  ];
}

const fmtJournalCash = accountTemplate({
  id: 'led-fmt-journal-cash',
  topicId: T,
  conceptId: 'led-formats',
  difficulty: 'medium',
  generate: (rng) =>
    firstOf(12, () => {
      const m = journalMonth(rng, ['cashSale', 'settleD', 'rent', rng.pick(['furniture', 'drawings', 'deposit'] as const)], rng.int(6, 7));
      if (!m) return null;
      const opening: OpeningBalance = { date: m.dates[0], side: 'Dr', amount: m.openCash };
      const view = accountOf(m.entries, 'cash', opening);
      if (!view.balance || view.balance.side !== 'Dr') return null;
      const { end, next } = period(m.dates);
      keptBooks.keep(m.data, { accountId: 'cash', entries: m.entries, opening });
      const sides = ledgerSides(view, { closeOn: end, reopenOn: next });
      return {
        task: `Post the journal of ${m.firm} to Cash A/c. Balance the account on ${end} and bring the balance down on ${next}.`,
        data: m.data,
        title: 'Cash A/c',
        ...sides,
        distractors: [...new Set(['Cash A/c', ...unusedLabels(m, sides)])],
        explanation: [
          `Cash A/c opens with the cash in hand on its debit side: "To Balance b/d" ${inr(m.openCash)}.`,
          ...postingWork(view, 'Cash A/c'),
          'In the settlement with the customer only the cash is posted to Cash A/c; the discount allowed goes to Discount Allowed A/c, and never to Cash A/c.',
          ...sideWork(view),
          `On ${next} the balance is brought down on the debit side, below the totals: "To Balance b/d ${inr(view.balance.amount)}".`,
        ],
        hints: [
          'Pick out the entries that name Cash A/c. A debit to cash is a receipt (the debit side); a credit is a payment (the credit side).',
          'In a compound entry post only the cash figure: a discount has its own account. The particulars name the other account of the entry.',
        ],
      };
    }),
  verify: accountHolds,
});

const fmtJournalParty = accountTemplate({
  id: 'led-fmt-journal-party',
  topicId: T,
  conceptId: 'led-formats',
  difficulty: 'complex',
  generate: (rng) =>
    firstOf(12, () => {
      const isDebtor = rng.next() < 0.5;
      const must: JEntry['kind'][] = isDebtor ? ['creditSale', 'settleD', 'returnIn'] : ['creditBuy', 'payC', 'returnOut'];
      const m = journalMonth(rng, must, rng.int(7, 8));
      if (!m) return null;
      const who = isDebtor ? m.d : m.c;
      const id = isDebtor ? debtor(who) : creditor(who);
      const nature: Side = isDebtor ? 'Dr' : 'Cr';
      const opening: OpeningBalance = { date: m.dates[0], side: nature, amount: isDebtor ? m.openD : m.openC };
      const view = accountOf(m.entries, id, opening);
      if (!view.balance || view.balance.side !== nature) return null;
      const { end, next } = period(m.dates);
      keptBooks.keep(m.data, { accountId: id, entries: m.entries, opening });
      const sides = ledgerSides(view, { closeOn: end, reopenOn: next });
      const title = `${who} A/c`;
      const discount = isDebtor ? 'Discount Allowed A/c' : 'Discount Received A/c';
      return {
        task: `Post the journal of ${m.firm} to ${title}. Balance the account on ${end} and bring the balance down on ${next}. Give each account of a compound entry a row of its own.`,
        data: m.data,
        title,
        ...sides,
        distractors: [...new Set([title, ...unusedLabels(m, sides)])],
        explanation: [
          `${who} is a ${isDebtor ? 'customer' : 'supplier'}: the amount ${isDebtor ? `${who} owes` : `owed to ${who}`} on ${m.dates[0]} opens the account on its ${sideWord(nature)} side, "${pre(nature)} Balance b/d" ${inr(opening.amount)}.`,
          ...postingWork(view, title),
          `In the settlement ${title} stands alone on its side, so it shows a row for each account on the other side: the ${isDebtor ? 'cash' : 'cheque'} and ${discount}, together the ${inr(isDebtor ? m.printed.find((e) => e.kind === 'settleD')!.lines[2].amount : m.printed.find((e) => e.kind === 'payC')!.lines[0].amount)} settled.`,
          ...sideWork(view),
          `On ${next} the balance is brought down on the ${sideWord(nature)} side, below the totals: "${pre(nature)} Balance b/d ${inr(view.balance.amount)}".`,
        ],
        hints: [
          `Pick out the entries that name ${title}, and keep the side each has in the journal. Start with the opening balance.`,
          `When ${title} is alone on its side of a compound entry, each account on the other side gives it a row: the money and the discount separately.`,
        ],
      };
    }),
  verify: accountHolds,
});

// The last three were added after the mock papers were set: they stand on levels of their own and outside the papers.
const formats: Template[] = [fmtPersonal, fmtCash, fmtGoods, fmtCompound, fmtCloseNominal, fmtJournalCash, fmtJournalParty];

const templates: Template[] = [
  // easy
  balanceAmount,
  balanceSide,
  cdWording,
  bdWording,
  postingAccounts,
  postingWords,
  normalNature,
  openingWording,
  openingClosing,
  totalSide,
  whoOwes,
  balanceAfterItem,
  balanceFromTotals,
  // medium
  balanceTransactions,
  personalTransactions,
  postingCompound,
  postingCompoundWords,
  balanceSideTransactions,
  unusualBalance,
  normalContra,
  unknownItem,
  wrongItem,
  totalSideTransactions,
  postingGst,
  assetBalance,
  nextPeriodBalance,
  // complex
  correctBalance,
  wrongSideEffect,
  balanceFromJournal,
  debtorBalance,
  creditorBalance,
  findOpening,
  bankOverdraft,
  // accounts to prepare
  ...formats,
];

// Assertion and Reason comes last, and is on its own level and on no mock paper (see assertionReason.ts).
const assertionReason = assertionReasonTemplate({
  prefix: 'led', topicId: 'ledger', conceptId: 'led-balances',
  items: [
    {
      answer: 'explains',
      a: 'In Rent A/c, rent paid in cash is written as "To Cash A/c".',
      r: 'The particulars of a ledger account name the other account of the entry.',
      aWhy: 'Rent A/c is debited, and the other account of the entry is Cash A/c.',
      rWhy: 'An account never names itself in its particulars.',
      link: 'Cash A/c appears because it is the other half of the entry, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A debit balance in Mohan\'s account in a firm\'s ledger means that Mohan owes the firm.',
      r: 'A debtor is an asset of the firm, so a debtor\'s account shows a debit balance.',
      aWhy: 'A personal account with a debit balance is the account of a debtor.',
      rWhy: 'Assets have debit balances, and an amount due to the firm is an asset.',
      link: 'What Mohan owes is an asset of the firm, which is why the balance is on the debit side, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A credit balance in Bank A/c need not be a posting error.',
      r: 'When the bank has paid out more than the firm had in its account, the firm owes the bank.',
      aWhy: 'A credit balance in Bank A/c is an overdraft.',
      rWhy: 'That is what an overdraft is.',
      link: 'A firm can really owe its bank, so a credit balance can be right, and R explains A.',
    },
    {
      answer: 'explains',
      a: 'An account whose debit side totals ₹80,000 and credit side ₹65,000 has "By Balance c/d ₹15,000" written on its credit side.',
      r: 'Balance c/d is written on the shorter side, so that the two sides agree.',
      aWhy: 'The credit side is shorter by ₹80,000 - ₹65,000 = ₹15,000.',
      rWhy: 'The difference is entered where it makes the two totals equal.',
      link: 'The credit side takes the balance because it is the shorter side, so R explains A.',
    },
    {
      answer: 'explains',
      a: 'A customer who pays ₹9,800 in cash and is allowed a discount of ₹200 is credited with ₹10,000 in all.',
      r: 'The cash and the discount together clear what the customer owes.',
      aWhy: 'Two credits are posted to the account, ₹9,800 and ₹200.',
      rWhy: 'The customer owed ₹10,000 and owes nothing after the settlement.',
      link: 'Both amounts settle the debt, so both are credited to the customer. R explains A.',
    },
    {
      answer: 'not-the-reason',
      a: 'A balance carried down is brought down on the first day of the next period.',
      r: 'After balancing, the two sides of the account show the same total.',
      aWhy: 'The closing balance of one period is the opening balance of the next.',
      rWhy: 'Balance c/d is entered to make the two sides agree.',
      link: 'The balance is brought down so that the account carries on into the new period. The equal totals do not call for that.',
    },
    {
      answer: 'not-the-reason',
      a: 'Installation charges of ₹5,000 paid for a new machine are debited to Machinery A/c.',
      r: 'Repairs of a machine are debited to Repairs A/c.',
      aWhy: 'Installation is part of the cost of making the machine ready for use.',
      rWhy: 'Repairs are a running expense.',
      link: 'R tells where repairs go. The charges are debited to the machine because they are part of its cost.',
    },
    {
      answer: 'not-the-reason',
      a: 'A posting left out makes the balance of an account wrong by its amount once.',
      r: 'A posting on the wrong side makes the balance wrong by twice its amount.',
      aWhy: 'One item is missing from one side, and nothing else is wrong.',
      rWhy: 'The item is missing from one side and added to the other.',
      link: 'R is about a different error. A posting left out has one effect, which is why it counts once.',
    },
    {
      answer: 'a-only',
      a: 'Salaries A/c normally shows a debit balance.',
      r: 'An account has its balance on the side on which Balance c/d is written.',
      aWhy: 'An expense increases on the debit side.',
      rWhy: 'Balance c/d goes on the shorter side, so the balance belongs to the opposite, larger side.',
    },
    {
      answer: 'a-only',
      a: 'On a credit sale invoiced at ₹11,800, of which ₹1,800 is GST, the customer is debited with ₹11,800.',
      r: 'Sales A/c is credited with the invoice total, tax included.',
      aWhy: 'The customer owes the whole of the invoice.',
      rWhy: 'Sales A/c takes the value of the goods, ₹10,000, and the tax goes to the output GST accounts.',
    },
    {
      answer: 'r-only',
      a: 'A customer whose account shows a credit balance owes the firm.',
      r: 'A customer who has paid in advance or overpaid is owed money by the firm.',
      aWhy: 'A credit balance in a personal account means the firm owes that person.',
      rWhy: 'Paying more than is due leaves the firm in the customer\'s debt.',
    },
    {
      answer: 'r-only',
      a: 'The opening balance of a bank loan account is written "To Balance b/d".',
      r: 'An account opens on the side on which it normally increases.',
      aWhy: 'A loan is a liability, so it opens on the credit side as "By Balance b/d".',
      rWhy: 'Assets open on the debit side, and liabilities and capital on the credit side.',
    },
  ],
});

const withAssertionReason: Template[] = [...templates, assertionReason];

export default withAssertionReason;
