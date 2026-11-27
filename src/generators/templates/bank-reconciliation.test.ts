import { describe, expect, it } from 'vitest';
import type { McqQuestion, NumericQuestion } from '@/content/types';
import { generateFrom } from '../engine';
import templates, { KINDS, reconcile, type Book, type Item, type Kind } from './bank-reconciliation';

const kind = (id: string): Kind => {
  const k = KINDS.find((x) => x.id === id);
  if (!k) throw new Error(`no kind ${id}`);
  return k;
};
const item = (id: string, amount: number): Item => ({ kind: kind(id), amount, fact: '', text: '' });

/**
 * The textbook rules, written out by hand and independently of the sign table in the template:
 * starting from a FAVOURABLE cash book balance, which items are added and which are deducted.
 */
const FROM_FAVOURABLE_CASH_BOOK: Record<string, 'add' | 'deduct'> = {
  issued: 'add',
  deposited: 'deduct',
  charges: 'deduct',
  interestCr: 'add',
  interestDr: 'deduct',
  directDep: 'add',
  standing: 'deduct',
  dishonoured: 'deduct',
  dividend: 'add',
  bankErrDr: 'deduct',
  bankErrCr: 'add',
  // Errors in the cash book are corrected: too high is deducted, too low is added.
  cbPayUnder: 'deduct',
  cbPayOver: 'add',
  cbRecUnder: 'add',
  cbRecOver: 'deduct',
  cbPayLess: 'deduct',
  cbPayMore: 'add',
  cbRecLess: 'add',
  cbRecMore: 'deduct',
};

describe('bank reconciliation signs', () => {
  it('has a textbook rule for every item', () => {
    for (const k of KINDS.filter((x) => x.sign !== 0)) expect(FROM_FAVOURABLE_CASH_BOOK[k.id], k.id).toBeDefined();
  });

  it('matches the textbook from a favourable cash book balance', () => {
    for (const [id, rule] of Object.entries(FROM_FAVOURABLE_CASH_BOOK)) {
      const pb = reconcile('cb', 100000, [item(id, 1000)]);
      expect(pb, id).toBe(rule === 'add' ? 101000 : 99000);
    }
  });

  it('works the other way round from a favourable pass book balance', () => {
    for (const [id, rule] of Object.entries(FROM_FAVOURABLE_CASH_BOOK)) {
      const cb = reconcile('pb', 100000, [item(id, 1000)]);
      expect(cb, id).toBe(rule === 'add' ? 99000 : 101000);
    }
  });

  it('turns round for an overdraft', () => {
    for (const [id, rule] of Object.entries(FROM_FAVOURABLE_CASH_BOOK)) {
      // Overdraft of 1,00,000 as per cash book: an item that is added to a favourable balance reduces it.
      const pb = reconcile('cb', -100000, [item(id, 1000)]);
      expect(pb, id).toBe(rule === 'add' ? -99000 : -101000);
    }
  });

  it('reproduces worked textbook-style examples', () => {
    // Cash book 50,000; issued not presented 4,000; bank charges 300 -> pass book 53,700 (and back).
    const items = [item('issued', 4000), item('charges', 300)];
    expect(reconcile('cb', 50000, items)).toBe(53700);
    expect(reconcile('pb', 53700, items)).toBe(50000);
    // Overdraft as per cash book 25,000; issued 6,000; deposited 4,000 -> overdraft as per pass book 23,000.
    const od = [item('issued', 6000), item('deposited', 4000)];
    expect(reconcile('cb', -25000, od)).toBe(-23000);
    expect(reconcile('pb', -23000, od)).toBe(-25000);
    // Overdraft as per pass book 9,000 including charges 200 not in the cash book -> cash book overdraft 8,800.
    expect(reconcile('pb', -9000, [item('charges', 200)])).toBe(-8800);
  });

  it('keeps the books in step for every item and starting point', () => {
    const books: Book[] = ['cb', 'pb'];
    for (const k of KINDS) {
      for (const b of books) {
        for (const start of [70000, -70000]) {
          const other = reconcile(b, start, [item(k.id, 2500)]);
          expect(reconcile(b === 'cb' ? 'pb' : 'cb', other, [item(k.id, 2500)]), `${k.id} ${b} ${start}`).toBe(start);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// An examiner's reading of the finished questions. Nothing below uses the sign table or the helpers of the template:
// each question is worked from the words of its own prompt, the way a student would, and must give the stated answer.
// ---------------------------------------------------------------------------------------------------------------

const SEEDS = 150;
const rupeesIn = (text: string): number[] => [...text.matchAll(/₹([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));

interface Reading {
  /** Pass book balance less cash book balance, in rupees, because of this item (signed balances: overdraft negative). */
  gap: number;
  /** Who must act: the firm enters or corrects its cash book, the bank corrects its mistake, or nobody does anything. */
  act: 'enter' | 'bank' | 'none';
  /** A mistake inside the cash book itself. */
  cbError: boolean;
}

/** What one item does, read from its sentence alone. */
function readItem(text: string): Reading {
  const [a, b] = rupeesIn(text);
  const is = (gap: number, act: Reading['act'], cbError = false): Reading => ({ gap, act, cbError });
  // The bank's own mistakes: a wrong debit leaves the pass book too low, a wrong credit too high.
  if (/wrongly debited/.test(text)) return is(-a, 'bank');
  if (/wrongly credited/.test(text)) return is(a, 'bank');
  // A cheque both books have dealt with.
  if (/within the month/.test(text)) return is(0, 'none');
  // The bank moved the true amount (a); the cash book moved the amount entered (b).
  if (/entered it in the cash book as/.test(text)) return /issued to/.test(text) ? is(-a - -b, 'enter', true) : is(a - b, 'enter', true);
  // Payments added up too low, or receipts added up too high: the cash book balance is too high.
  if (/-cast/.test(text)) return is(/payments side/.test(text) === /under-cast/.test(text) ? -a : a, 'enter', true);
  // The cash book still counts the cheque as a receipt; the bank has taken it back.
  if (/returned unpaid|dishonoured/.test(text)) return is(-a, 'enter');
  // The firm has deducted every cheque it issued; the bank only the ones it paid.
  if (/issued during the month/.test(text)) return is(a - b, 'none');
  if (/not yet been presented|not reached the bank/.test(text)) return is(a, 'none');
  // The firm has added every cheque it deposited; the bank only the ones it credited.
  if (/deposited during the month/.test(text)) return is(-(a - b), 'none');
  if (/not yet collected|yet to be cleared|not yet been credited/.test(text)) return is(-a, 'none');
  // Money the bank took out of, or put into, the account without the firm's entry.
  if (/bank charges|service charges/i.test(text)) return is(-a, 'enter');
  if (/standing instruction/.test(text)) return is(-a, 'enter');
  if (/as interest on the overdraft|bank loan was debited/.test(text)) return is(-a, 'enter');
  if (/credited interest|fixed deposit/.test(text)) return is(a, 'enter');
  if (/dividend/.test(text)) return is(a, 'enter');
  if (/directly into|straight to/.test(text)) return is(a, 'enter');
  throw new Error(`cannot read the item: ${text}`);
}

/** Favourable is positive. A debit balance is favourable in the cash book and an overdraft in the pass book. */
function signedBalance(book: Book, nature: string, amount: number): number {
  if (nature === 'favourable balance') return amount;
  if (nature === 'overdraft') return -amount;
  return (nature === 'debit balance') === (book === 'cb') ? amount : -amount;
}

const NATURE = '(favourable balance|overdraft|debit balance|credit balance)';

function readStart(prompt: string): { book: Book; start: number; end: number } {
  const m = new RegExp(`(cash book \\(bank column\\)|pass book)(?: of [^₹]*?)? shows an? ${NATURE} of ₹([\\d,]+)`).exec(prompt);
  if (!m) throw new Error(`no starting balance: ${prompt}`);
  const book: Book = m[1] === 'pass book' ? 'pb' : 'cb';
  return { book, start: signedBalance(book, m[2], Number(m[3].replace(/,/g, ''))), end: m.index + m[0].length };
}

/** The numbered items of a prompt. */
function readItems(prompt: string): Reading[] {
  const parts = prompt.split(/\((?:i|ii|iii|iv|v|vi|vii|viii)\) /).slice(1);
  if (parts.length === 0) throw new Error(`no items: ${prompt}`);
  const last = parts.length - 1;
  parts[last] = parts[last].split(/ (?=Find |The firm now makes|Correct only|What balance|For how many|The rest of the difference)/)[0];
  return parts.map(readItem);
}

const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from) + from.length, text.indexOf(to));
const template = (id: string) => {
  const t = templates.find((x) => x.id === id);
  if (!t) throw new Error(`no template ${id}`);
  return t;
};
const numeric = (id: string, seed: number) => generateFrom(template(id), seed) as NumericQuestion;
const correctText = (id: string, seed: number) => {
  const q = generateFrom(template(id), seed) as McqQuestion;
  return { prompt: q.prompt, text: q.options.find((o) => o.id === q.correct)!.text };
};

/**
 * The nature the prompt says the answer has, as a sign, for the book the answer belongs to. A complex prompt leaves the
 * nature to the learner ("without its nature"): then it is the nature the working ends on.
 */
function statedSign(prompt: string, book: Book, working: string[] = []): number {
  if (prompt.endsWith('Type the amount only, without its nature.')) {
    const last = working.filter((l) => /\((favourable|overdraft)\): ₹/.test(l)).at(-1);
    if (!last) throw new Error(`no nature in the working: ${prompt}`);
    return last.includes('(favourable)') ? 1 : -1;
  }
  const m = new RegExp(`It is an? ${NATURE}; type the amount only\\.`).exec(prompt);
  if (!m) throw new Error(`no stated nature: ${prompt}`);
  return signedBalance(book, m[1], 1);
}

/** The working, added up in its own terms: the starting amount, plus every "Add", less every "Less". */
function workingTotal(working: string[]): number {
  const first = rupeesIn(working.find((l) => l.startsWith('Balance as per'))!)[0];
  const add = sum(working.filter((l) => l.startsWith('Add: ')).map((l) => rupeesIn(l).at(-1)!));
  const less = sum(working.filter((l) => l.startsWith('Less: ')).map((l) => rupeesIn(l).at(-1)!));
  return first + add - less;
}

const RECONCILE = [
  'brs-cb-to-pb-timing', 'brs-cb-to-pb-bank', 'brs-pb-to-cb-timing', 'brs-pb-to-cb-bank', 'brs-one-item',
  'brs-cb-to-pb-mixed', 'brs-pb-to-cb-mixed', 'brs-od-cb-to-pb', 'brs-od-pb-to-cb', 'brs-dr-cr-start',
  'brs-cast-error', 'brs-record-error', 'brs-bank-error', 'brs-cross-zero', 'brs-complex-cb-od', 'brs-complex-pb-od',
  'brs-complex-indirect',
];

describe('bank reconciliation questions, worked from their own words', () => {
  it('reaches the other balance, from a favourable balance and from an overdraft in either book', () => {
    const overdrafts = { cb: 0, pb: 0 };
    const crossings = { toOverdraft: 0, toFavourable: 0 };
    for (const id of RECONCILE) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const q = numeric(id, seed);
        const at = `${id} seed ${seed}: ${q.prompt}`;
        const { book, start } = readStart(q.prompt);
        const gap = sum(readItems(q.prompt).map((i) => i.gap));
        const other = book === 'cb' ? start + gap : start - gap;
        expect(Math.abs(other) * 100, at).toBe(q.answer);
        expect(Math.sign(other), at).toBe(statedSign(q.prompt, book === 'cb' ? 'pb' : 'cb', q.working));
        // The complex families do not give the nature of the answer away.
        if (id === 'brs-cross-zero' || id.startsWith('brs-complex-')) expect(q.prompt, at).not.toMatch(/It is an? [a-z ]+; type the amount/);
        // The working shown must add up to the same figure in the starting balance's own terms.
        const total = workingTotal(q.working);
        expect(start > 0 ? total : -total, at).toBe(other);
        if (start < 0) overdrafts[book]++;
        if (start > 0 && other < 0) crossings.toOverdraft++;
        if (start < 0 && other > 0) crossings.toFavourable++;
        if (id.includes('-od-')) expect(start, at).toBeLessThan(0);
      }
    }
    expect(overdrafts.cb).toBeGreaterThan(300);
    expect(overdrafts.pb).toBeGreaterThan(300);
    expect(crossings.toOverdraft).toBeGreaterThan(30);
    expect(crossings.toFavourable).toBeGreaterThan(30);
  });

  it('finds the amended cash book balance two ways', () => {
    for (const id of ['brs-amended-from-cb', 'brs-amended-from-pb', 'brs-complex-amended']) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const q = numeric(id, seed);
        const at = `${id} seed ${seed}: ${q.prompt}`;
        const { book, start } = readStart(q.prompt);
        const items = readItems(q.prompt);
        const gap = sum(items.map((i) => i.gap));
        const cashBook = book === 'cb' ? start : start - gap;
        const passBook = book === 'pb' ? start : start + gap;
        // Route 1: the cash book as it stands, plus every entry and correction it needs.
        const amended = cashBook + sum(items.filter((i) => i.act === 'enter').map((i) => i.gap));
        // Route 2: the pass book, less the differences that remain once the cash book is right.
        expect(passBook - sum(items.filter((i) => i.act !== 'enter').map((i) => i.gap)), at).toBe(amended);
        expect(Math.abs(amended) * 100, at).toBe(q.answer);
        expect(Math.sign(amended), at).toBe(statedSign(q.prompt, 'cb', q.working));
        const total = workingTotal(q.working);
        expect(start > 0 ? total : -total, at).toBe(amended);
        if (id === 'brs-complex-amended') expect(start, at).toBeLessThan(0);
      }
    }
  });

  it('corrects only the cash book errors', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const q = numeric('brs-corrected-cb', seed);
      const { start } = readStart(q.prompt);
      const corrected = start + sum(readItems(q.prompt).filter((i) => i.cbError).map((i) => i.gap));
      expect(Math.abs(corrected) * 100, q.prompt).toBe(q.answer);
      expect(Math.sign(corrected), q.prompt).toBe(statedSign(q.prompt, 'cb'));
    }
  });

  it('counts the items that need a cash book entry, and finds a missing item or a single gap', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const count = numeric('brs-count-entries', seed);
      expect(readItems(count.prompt).filter((i) => i.act === 'enter').length, count.prompt).toBe(count.answer);

      const missing = numeric('brs-missing-item', seed);
      const [cb, pb] = rupeesIn(missing.prompt);
      expect(Math.abs(pb - cb - sum(readItems(missing.prompt).map((i) => i.gap))) * 100, missing.prompt).toBe(missing.answer);

      const single = numeric('brs-gap', seed);
      const [cb1, pb1] = rupeesIn(single.prompt);
      expect(Math.abs(pb1 - cb1) * 100, single.prompt).toBe(single.answer);
    }
  });

  it('adds or deducts a single item the right way from either book and either kind of balance', () => {
    for (const id of ['brs-add-or-deduct-cb', 'brs-add-or-deduct-pb', 'brs-add-or-deduct-od']) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { prompt, text } = correctText(id, seed);
        const { book, start, end } = readStart(prompt);
        const { gap } = readItem(prompt.slice(end, prompt.indexOf(' A reconciliation statement')));
        const other = book === 'cb' ? start + gap : start - gap;
        // "Add" must make the figure bigger, whether it is a favourable balance or an overdraft.
        expect(text.startsWith(Math.abs(other) > Math.abs(start) ? 'Add it to' : 'Deduct it from'), `${id} seed ${seed}: ${prompt} -> ${text}`).toBe(true);
        expect(text.endsWith(start > 0 ? 'the balance' : 'the overdraft'), prompt).toBe(true);
        if (id.endsWith('-od')) expect(start, prompt).toBeLessThan(0);
      }
    }
  });

  it('names the balance and its nature after reconciling', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { prompt, text } = correctText('brs-nature-result', seed);
      const { book, start } = readStart(prompt);
      const gap = sum(readItems(prompt).map((i) => i.gap));
      const other = book === 'cb' ? start + gap : start - gap;
      expect(rupeesIn(text)[0], prompt).toBe(Math.abs(other));
      expect(text.endsWith(other > 0 ? 'favourable balance' : 'overdraft'), `${prompt} -> ${text}`).toBe(true);
    }
  });

  it('says which book has the item, what the firm does about it, and which way a cash book error goes', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const which = correctText('brs-which-book', seed);
      const w = readItem(which.prompt.slice(which.prompt.indexOf('already entered? ')));
      expect(which.text, which.prompt).toBe(w.act === 'none' ? (w.gap === 0 ? 'Both books' : 'Cash book only') : 'Pass book only');

      const needs = correctText('brs-needs-entry', seed);
      const n = readItem(between(needs.prompt, 'its pass book: ', ' What should the firm do'));
      const wanted = { enter: /^Make an entry or correction in the cash book$/, none: /^Make no entry; it is a timing difference/, bank: /^Make no entry; the bank has to correct/ }[n.act];
      expect(needs.text, needs.prompt).toMatch(wanted);

      const dir = correctText('brs-error-direction', seed);
      const e = readItem(between(dir.prompt, 'favourable balance): ', ' What does the error do'));
      // The pass book is right, so a negative gap means the cash book balance is too high.
      expect(dir.text.startsWith(e.gap < 0 ? 'The balance is too high; deduct' : 'The balance is too low; add'), `${dir.prompt} -> ${dir.text}`).toBe(true);
    }
  });
});
