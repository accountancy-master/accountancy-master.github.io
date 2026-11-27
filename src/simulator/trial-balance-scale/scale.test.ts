import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import {
  beforeCorrection,
  booksFromSeed,
  entryIntro,
  entryText,
  ERRORS,
  findError,
  framesOf,
  gapOf,
  isOneSided,
  KIRAN,
  problemOf,
  rectifyingEntry,
  rupees,
  suspenseOf,
  WATCH_INPUTS,
  type ErrorCase,
  type ErrorId,
} from './scale';
import { checkClass, checkEntry, checkSuspense, checkTip, makeScaleQuestion, SCALE_TRY_KINDS } from './tryit';

const card = (id: ErrorId): ErrorCase => findError(id)!.make(KIRAN, WATCH_INPUTS[id]);
const weight = (frame: ReturnType<typeof framesOf>[number], id: string) => frame.weights.find((w) => w.accountId === id)!.amount / 100;

describe('the trial balance scale: Kiran Traders, worked by hand', () => {
  it('starts level at ₹2,80,000', () => {
    const [start] = framesOf(KIRAN, card('principle'), 'after');
    expect([start.debit, start.credit, start.tilt]).toEqual([rupees(280000), rupees(280000), 'level']);
  });

  it('a partial omission tips the scale; Suspense on the debit side levels it; the entry clears it', () => {
    const e = card('partial-omission');
    expect(gapOf(e)).toBe(-rupees(8000));
    expect(suspenseOf(e)).toEqual({ side: 'Dr', amount: rupees(8000) });
    expect(entryText(rectifyingEntry(e))).toBe('Mohan A/c Dr ₹8,000; To Suspense A/c ₹8,000');
    const [, err, tb, done] = framesOf(KIRAN, e, 'after');
    expect(weight(err, 'debtor:Mohan')).toBe(17000);
    expect([err.debit, err.credit, err.tilt]).toEqual([rupees(272000), rupees(280000), 'Cr']);
    expect([tb.debit, tb.credit, tb.tilt, tb.suspense]).toEqual([rupees(280000), rupees(280000), 'level', { side: 'Dr', amount: rupees(8000) }]);
    expect(tb.text).toContain('debit column is short by ₹8,000');
    expect(done.suspense).toBeNull();
    expect(weight(done, 'debtor:Mohan')).toBe(25000);
    expect(done.weights.find((w) => w.accountId === 'debtor:Mohan')!.delta).toBe(rupees(8000));
    expect(beforeCorrection(e)!.words).toBe('Debit Mohan A/c with ₹8,000: the posting that was left out ("To Sales A/c ₹8,000").');
  });

  it('a wrong amount in one account: Suspense on the credit side', () => {
    const e = card('wrong-amount');
    expect(suspenseOf(e)).toEqual({ side: 'Cr', amount: rupees(4500) });
    expect(entryText(rectifyingEntry(e))).toBe('Suspense A/c Dr ₹4,500; To Rao & Co. A/c ₹4,500');
    const [, err] = framesOf(KIRAN, e, 'after');
    expect(weight(err, 'creditor:Rao & Co.')).toBe(15500);
    expect(err.tilt).toBe('Dr');
    expect(beforeCorrection(e)!.words).toBe('Credit Rao & Co. A/c with ₹4,500: the amount by which the posting fell short.');
  });

  it('a wrong side moves the difference by twice the amount', () => {
    const e = card('wrong-side');
    expect(suspenseOf(e)).toEqual({ side: 'Cr', amount: rupees(6000) });
    expect(entryText(rectifyingEntry(e))).toBe('Suspense A/c Dr ₹6,000; To Priya A/c ₹6,000');
    expect(weight(framesOf(KIRAN, e, 'after')[1], 'debtor:Priya')).toBe(23000);
    expect(beforeCorrection(e)!.words).toBe('Credit Priya A/c with ₹6,000: ₹3,000 to cancel the wrong debit and ₹3,000 for the credit that was due.');
  });

  it('a total carried forward short', () => {
    const e = card('wrong-carry');
    expect(suspenseOf(e)).toEqual({ side: 'Dr', amount: rupees(3600) });
    expect(entryText(rectifyingEntry(e))).toBe('Purchases A/c Dr ₹3,600; To Suspense A/c ₹3,600');
    expect(e.cls).toBe('commission');
  });

  it('two-sided errors leave the scale level and are rectified without Suspense', () => {
    const cases: [ErrorId, string][] = [
      ['complete-omission', 'Mohan A/c Dr ₹8,000; To Sales A/c ₹8,000'],
      ['wrong-account', 'Priya A/c Dr ₹5,000; To Mohan A/c ₹5,000'],
      ['principle', 'Furniture A/c Dr ₹12,000; To Purchases A/c ₹12,000'],
      ['compensating', 'Sales A/c Dr ₹1,000; To Rent A/c ₹1,000'],
    ];
    for (const [id, entry] of cases) {
      const e = card(id);
      expect(isOneSided(e), id).toBe(false);
      expect(suspenseOf(e), id).toBeNull();
      expect(beforeCorrection(e) === null, id).toBe(id !== 'compensating');
      expect(entryText(rectifyingEntry(e)), id).toBe(entry);
      for (const fr of framesOf(KIRAN, e, 'after')) expect(fr.tilt, id).toBe('level');
    }
    const [, omitted] = framesOf(KIRAN, card('complete-omission'), 'after');
    expect([omitted.debit, omitted.credit]).toEqual([rupees(272000), rupees(272000)]);
    const [, comp] = framesOf(KIRAN, card('compensating'), 'after');
    expect([comp.debit, comp.credit]).toEqual([rupees(281000), rupees(281000)]);
  });

  it('found before the trial balance: corrected first, then a trial balance that agrees with no Suspense', () => {
    const [, err, fixed, tb] = framesOf(KIRAN, card('partial-omission'), 'before');
    expect(err.tilt).toBe('Cr');
    expect(fixed.text).toContain('no journal entry');
    expect([fixed.tilt, tb.tilt, tb.suspense]).toEqual(['level', 'level', null]);
    expect(framesOf(KIRAN, card('principle'), 'before')[2].text).toContain('Furniture A/c Dr ₹12,000; To Purchases A/c ₹12,000');
    // A complete omission is put right by passing the entry that was left out.
    expect(framesOf(KIRAN, card('complete-omission'), 'before')[2].text).toContain('the entry that was left out is passed now: Mohan A/c Dr ₹8,000; To Sales A/c ₹8,000');
  });

  it('compensating errors of casting: corrected in each account before the trial balance, one entry after it', () => {
    const e = card('compensating');
    const b = beforeCorrection(e)!;
    expect(b.accountIds).toEqual(['rent', 'sales']);
    expect(b.words).toBe('Correct the total of the debit side of Rent A/c (₹1,000 too much) and the total of the credit side of Sales A/c (₹1,000 too much).');
    const [, err, fixed, tb] = framesOf(KIRAN, e, 'before');
    expect([err.debit, err.credit, err.tilt]).toEqual([rupees(281000), rupees(281000), 'level']);
    expect(fixed.text).toContain('no journal entry');
    expect(fixed.text).not.toContain('Sales A/c Dr');
    expect([weight(fixed, 'rent'), weight(fixed, 'sales'), tb.debit, tb.suspense]).toEqual([18000, 110000, rupees(280000), null]);
    expect(entryIntro(e, 'after')).toContain('one entry between the two accounts');
  });

  it('writes the possessive of a party whose name ends in s', () => {
    const books = { ...KIRAN, creditor: 'Jain Brothers', balances: KIRAN.balances.map((x) => (x.accountId === 'creditor:Rao & Co.' ? { ...x, accountId: 'creditor:Jain Brothers' } : x)) };
    expect(findError('wrong-amount')!.make(books, WATCH_INPUTS['wrong-amount']).text).toContain("posted to Jain Brothers' account as ₹2,700");
    expect(card('wrong-amount').text).toContain("posted to Rao & Co.'s account");
  });

  it('refuses figures that do not suit the books', () => {
    const big = { amount: rupees(30000) };
    expect(problemOf(KIRAN, findError('complete-omission')!.make(KIRAN, big), big)).toBe('That is too large for these books: Mohan A/c stands at only ₹25,000.');
    const same = { amount: rupees(5000), wrongAs: rupees(5000) };
    expect(problemOf(KIRAN, findError('wrong-amount')!.make(KIRAN, same), same)).toContain('no error');
    for (const id of Object.keys(WATCH_INPUTS) as ErrorId[]) expect(problemOf(KIRAN, card(id), WATCH_INPUTS[id]), id).toBeNull();
  });
});

describe('the trial balance scale: every seed', () => {
  it('books agree, and every error is rectified back to them', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const books = booksFromSeed(seed);
      const rng = createRng(seed);
      for (const spec of ERRORS) {
        const input = spec.sample(rng, books);
        const e = spec.make(books, input);
        if (problemOf(books, e, input) !== null) continue;
        const entry = rectifyingEntry(e);
        const sum = (s: 'Dr' | 'Cr') => entry.filter((l) => l.side === s).reduce((t, l) => t + l.amount, 0);
        expect(sum('Dr'), spec.id).toBe(sum('Cr'));
        expect(entry.some((l) => l.accountId === 'suspense'), spec.id).toBe(isOneSided(e));
        for (const when of ['before', 'after'] as const) {
          const frames = framesOf(books, e, when);
          expect(frames[0].tilt).toBe('level');
          expect(frames[3].tilt).toBe('level');
          expect(frames[3].suspense).toBeNull();
          expect(frames[3].weights.map((w) => w.amount)).toEqual(frames[0].weights.map((w) => w.amount));
          expect(frames[1].tilt === 'level').toBe(!isOneSided(e));
        }
        expect(framesOf(books, e, 'after')[2].tilt).toBe('level');
      }
    }
  });
});

describe('the trial balance scale: try it', () => {
  it('makes every kind from any seed, and marks the right answer right', () => {
    for (let seed = 1; seed <= 80; seed++) {
      for (const kind of SCALE_TRY_KINDS) {
        const q = makeScaleQuestion(seed, kind);
        expect(q.kind).toBe(kind);
        const g = gapOf(q.error);
        if (kind === 'tip') {
          expect(checkTip(q, g === 0 ? 'level' : g > 0 ? 'Dr' : 'Cr').right).toBe(true);
          expect(checkTip(q, g === 0 ? 'Dr' : 'level').right).toBe(false);
        } else if (kind === 'suspense') {
          const s = suspenseOf(q.error)!;
          expect(checkSuspense(q, s.side, s.amount).right).toBe(true);
          expect(checkSuspense(q, s.side === 'Dr' ? 'Cr' : 'Dr', s.amount).message).toContain('lighter pan');
          expect(checkSuspense(q, s.side, s.amount + 100).right).toBe(false);
        } else if (kind === 'entry') {
          expect(q.entries.length, q.error.id).toBe(4);
          expect(new Set(q.entries.map((c) => entryText(c.lines))).size).toBe(4);
          q.entries.forEach((c, i) => expect(checkEntry(q, i).right).toBe(c.why === null));
        } else {
          expect(checkClass(q, q.error.cls).right).toBe(true);
        }
      }
    }
  });

  it('names the slip of a wrong side counted once', () => {
    const q = { kind: 'suspense' as const, books: KIRAN, error: card('wrong-side'), entries: [] };
    expect(checkSuspense(q, 'Cr', rupees(3000)).message).toContain('twice its amount');
  });
});
