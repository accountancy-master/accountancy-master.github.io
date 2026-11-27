import { describe, expect, it } from 'vitest';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { EXAMPLES, randomInput } from './examples';
import { CASES, describe as said, figures, problemOf, sheetOf, story, type DebInput, type SheetLine } from './issue';
import { askRng, DEB_ASK_KINDS, debAsk, entryText } from './tryit';

const r = rupees;
const ex = (id: string): DebInput => EXAMPLES.find((e) => e.id === id)!.input;
const rows = (ls: SheetLine[]) => ls.flatMap((l) => (l.kind === 'heading' ? [] : [[l.label, l.amount === null ? null : l.amount / 100, l.kind === 'row' && l.less ? 'less' : '']]));

describe('the figures of an issue, worked by hand', () => {
  it('at a discount, redeemable at a premium: the whole loss to Loss on Issue, Securities Premium first, part-year interest', () => {
    const f = figures(ex('discount-premium'));
    expect([f.issuePrice, f.redemptionPrice, f.nominal, f.money].map((x) => x / 100)).toEqual([95, 105, 1000000, 950000]);
    expect([f.discountTotal, f.onRedemptionTotal, f.loss].map((x) => x / 100)).toEqual([50000, 50000, 100000]);
    expect(f.lossAccount).toBe('Loss on Issue of Debentures A/c');
    expect([f.available, f.fromSp, f.fromPl, f.spLeft].map((x) => x / 100)).toEqual([40000, 40000, 60000, 0]);
    // Allotted on 1 July: 3 months to 30 September, then the half-year to 31 March.
    expect(f.months).toBe(9);
    expect(f.halves.map((x) => x / 100)).toEqual([22500, 45000]);
    expect(f.financeCosts / 100).toBe(67500 + 60000);
  });

  it('at a premium, redeemable at a premium: the premium of the issue itself bears the loss first, and is not netted in the entry', () => {
    const i = ex('premium-premium');
    const f = figures(i);
    expect([f.premiumTotal, f.onRedemptionTotal, f.loss, f.fromSp, f.fromPl, f.spLeft].map((x) => x / 100)).toEqual([40000, 100000, 100000, 40000, 60000, 0]);
    const allot = story(i).steps.find((s) => s.id === 'allot')!;
    expect(entryText(allot.entries[0].lines)).toBe(
      'Debenture Application and Allotment A/c Dr ₹10,40,000; Loss on Issue of Debentures A/c Dr ₹1,00,000; To 8% Debentures A/c ₹10,00,000; To Securities Premium A/c ₹40,000; To Premium on Redemption of Debentures A/c ₹1,00,000',
    );
    expect(f.halves.map((x) => x / 100)).toEqual([40000, 40000]);
  });

  it('at a discount, redeemable at par: Discount on Issue, written off wholly from a larger Securities Premium', () => {
    const i = ex('discount-par');
    const f = figures(i);
    expect(f.lossAccount).toBe('Discount on Issue of Debentures A/c');
    expect([f.loss, f.fromSp, f.fromPl, f.spLeft, f.interest].map((x) => x / 100)).toEqual([30000, 30000, 0, 70000, 24000]);
    const { face, notes } = sheetOf(i);
    expect(rows(face)).toEqual([
      ['Reserves and surplus', 70000, ''],
      ['Long-term borrowings', 600000, ''],
      ['Finance costs', 24000, ''],
    ]);
    expect(rows(notes)).toEqual([
      ['Securities premium on 1 April 2025', 100000, ''],
      ['Less: Discount on issue of debentures written off', 30000, 'less'],
      ['Securities premium on 31 March 2026', 70000, ''],
      ['6,000, 8% Debentures of ₹100 each', 600000, ''],
      ['Interest on debentures', 24000, ''],
    ]);
  });

  it('to a vendor: the number of debentures is the price over the issue price', () => {
    const i = ex('vendor');
    const f = figures(i);
    expect(f.n).toBe(4500);
    expect([f.nominal, f.premiumTotal, f.spLeft, f.interest].map((x) => x / 100)).toEqual([450000, 45000, 45000, 20250]);
    const s = story(i);
    expect(s.steps.map((x) => x.id)).toEqual(['terms', 'asset', 'allot', 'interest2', 'close', 'sheet']);
    expect(entryText(s.steps[1].entries[0].lines)).toBe('Machinery A/c Dr ₹4,95,000; To Sharma Traders ₹4,95,000');
    expect(entryText(s.steps[2].entries[0].lines)).toBe('Sharma Traders Dr ₹4,95,000; To 9% Debentures A/c ₹4,50,000; To Securities Premium A/c ₹45,000');
    // The vendor's account is closed, and nothing is lost on the issue.
    expect(s.steps.at(-1)!.pots.vendor).toBe(0);
    expect(s.potIds).not.toContain('loss');
    expect(problemOf({ ...i, vendor: { ...i.vendor, price: r(500000) } })).toContain('whole number of debentures');
  });

  it('as collateral security: the loan is the only liability, interest on the loan alone, both methods', () => {
    const i = ex('collateral');
    const f = figures(i);
    expect([f.nominal, f.loanInterest, f.interest].map((x) => x / 100)).toEqual([1200000, 100000, 0]);
    const s = story(i);
    const collateral = s.steps.find((x) => x.id === 'collateral')!;
    expect(entryText(collateral.entries[0].lines)).toBe('Debenture Suspense A/c Dr ₹12,00,000; To 9% Debentures A/c ₹12,00,000');
    expect(rows(sheetOf(i).notes)).toEqual([
      ['Bank loan (secured by the issue of debentures as collateral security)', 1000000, ''],
      ['12,000, 9% Debentures of ₹100 each (issued as collateral security)', 1200000, ''],
      ['Less: Debenture Suspense', 1200000, 'less'],
      ['Total long-term borrowings', 1000000, ''],
      ['Interest on bank loan', 100000, ''],
    ]);
    // On repayment the debentures and the suspense account go back to nil.
    const last = s.steps.at(-1)!;
    expect([last.pots.debentures, last.pots.suspense]).toEqual([0, 0]);
    const note = ex('collateral-note');
    expect(story(note).steps.find((x) => x.id === 'collateral')!.entries).toEqual([]);
    expect(figures(note).loanInterest / 100).toBe(66000);
    expect(rows(sheetOf(note).face)).toEqual([
      ['Long-term borrowings', 1200000, ''],
      ['Finance costs', 66000, ''],
    ]);
  });

  it('allotted in January: only the three months to 31 March, paid on 31 March', () => {
    const i: DebInput = { ...ex('discount-premium'), month: 'January' };
    const f = figures(i);
    expect(f.halves.map((x) => x / 100)).toEqual([0, 22500]);
    expect(story(i).steps.map((s) => s.id)).toEqual(['terms', 'money', 'allot', 'interest2', 'writeOff', 'close', 'sheet']);
    expect(story(i).steps[1].text).toContain('1 January 2026');
  });

  it('at par both ways: no loss, no write-off, the debentures at the money received', () => {
    const i: DebInput = { ...ex('discount-premium'), issueAt: 'par', issuePct: 0, redeemAt: 'par', redPct: 0 };
    const f = figures(i);
    expect([f.loss, f.money, f.nominal].map((x) => x / 100)).toEqual([0, 1000000, 1000000]);
    expect(story(i).steps.some((s) => s.id === 'writeOff')).toBe(false);
    expect(entryText(story(i).steps[2].entries[0].lines)).toBe('Debenture Application and Allotment A/c Dr ₹10,00,000; To 9% Debentures A/c ₹10,00,000');
  });
});

describe('the story of every issue', () => {
  const balanced = (i: DebInput) => {
    for (const s of story(i).steps) for (const e of s.entries) {
      const dr = e.lines.filter((l) => l.side === 'Dr').reduce((t, l) => t + l.amount, 0);
      const cr = e.lines.filter((l) => l.side === 'Cr').reduce((t, l) => t + l.amount, 0);
      expect(dr, `${s.id}`).toBe(cr);
      for (const l of e.lines) expect(Number.isInteger(l.amount) && l.amount > 0, `${s.id}: ${l.account}`).toBe(true);
    }
  };

  it('balances every entry, closes the temporary accounts and ends with the balance sheet figures, for every case and route', () => {
    const rng = createRng(11);
    for (let k = 0; k < 300; k++) {
      const i = randomInput(rng);
      expect(problemOf(i), JSON.stringify(i)).toBeNull();
      balanced(i);
      const s = story(i);
      const f = s.f;
      const end = s.steps.find((x) => x.id === 'sheet')!.pots;
      if (i.route !== 'collateral') {
        expect(end.daa ?? 0).toBe(0);
        expect(end.vendor ?? 0).toBe(0);
        expect(end.loss ?? 0).toBe(0);
        expect(end.interest ?? 0).toBe(0);
        expect(end.debentures).toBe(-f.nominal);
        expect(end.premRed ?? 0).toBe(-f.onRedemptionTotal || 0);
        expect((end.sp ?? 0) + f.spLeft).toBe(0);
        expect(end.spl).toBe(f.financeCosts);
        expect(f.interest % 100, 'whole rupees').toBe(0);
        // The sheet repeats the same figures.
        const face = rows(sheetOf(i).face);
        expect(face.find(([l]) => l === 'Long-term borrowings')![1]).toBe(f.nominal / 100);
        expect(face.find(([l]) => l === 'Finance costs')![1]).toBe(f.financeCosts / 100);
      } else {
        expect(end.loan).toBe(-i.loan.amount);
        expect(end.spl).toBe(f.loanInterest);
        expect(f.loanInterest % 100).toBe(0);
      }
    }
  });

  it('names the six cases', () => {
    expect(CASES.map((c) => c.id)).toEqual(['par-par', 'discount-par', 'premium-par', 'par-premium', 'discount-premium', 'premium-premium']);
  });

  it('refuses inputs that cannot be played, with the reason', () => {
    const i = ex('discount-premium');
    expect(problemOf(i)).toBeNull();
    expect(problemOf({ ...i, n: 0 })).toContain('whole number of debentures');
    expect(problemOf({ ...i, issuePct: 30 })).toContain('discount');
    expect(problemOf({ ...i, face: 150 })).toContain('face value');
    // Due within twelve months of the balance sheet, the debt would be a short-term borrowing, not the extract's long-term one.
    expect(problemOf({ ...i, years: 1 })).toContain('two years or more');
    expect(problemOf({ ...ex('collateral'), years: 1 })).toContain('short-term borrowing');
    // A rate that leaves part of a paisa is refused.
    expect(problemOf({ ...i, n: 101, rate: 7.3 })).toContain('whole paise');
  });

  it('says a nil balance and the term of a collateral loan in words, and gives a one-line note no total', () => {
    expect(said(ex('premium-premium'))).toContain('Securities Premium A/c has no balance before the issue.');
    expect(said(ex('discount-premium'))).toContain('Securities Premium A/c has a balance of ₹40,000 before the issue.');
    expect(said(ex('collateral'))).toContain('repayable after 5 years');
    expect(rows(sheetOf(ex('collateral-note')).notes)).toEqual([
      ['Bank loan (secured by the issue of 10% Debentures of ₹15,00,000 as collateral security)', 1200000, ''],
      ['Interest on bank loan', 66000, ''],
    ]);
  });
});

describe('the quick questions', () => {
  it('have a right answer the figures give, wrong figures that differ from it, and a picture that moves on', () => {
    for (const kind of DEB_ASK_KINDS) {
      for (let n = 0; n < 60; n++) {
        const a = debAsk(kind, askRng(3, kind, n));
        expect(a.reveal, kind).toBeGreaterThan(a.shown);
        expect(a.shown).toBeGreaterThan(0);
        expect(a.reveal).toBeLessThanOrEqual(story(a.input).steps.length);
        if (a.answer.type === 'number') {
          expect(a.answer.value, `${kind} ${a.prompt}`).toBeGreaterThan(0);
          expect(a.answer.mistakes.length, a.prompt).toBeGreaterThanOrEqual(2);
          expect(a.answer.mistakes.every((m) => m.value !== (a.answer as { value: number }).value)).toBe(true);
        } else {
          expect(a.answer.options).toHaveLength(4);
          expect(new Set(a.answer.options.map((o) => o.text)).size).toBe(4);
          expect(a.answer.options.filter((o) => o.id !== 'right').every((o) => o.why)).toBe(true);
        }
      }
    }
  });

  it('asks the loss on issue as the topic works it', () => {
    for (let n = 0; n < 40; n++) {
      const a = debAsk('loss', askRng(5, 'loss', n));
      const f = figures(a.input);
      expect(a.answer.type === 'number' && a.answer.value).toBe(f.discountTotal + f.onRedemptionTotal);
      // With redemption at par, no wrong figure is explained by a premium on redemption there is none of.
      if (a.answer.type === 'number' && f.onRedemptionTotal === 0) expect(a.answer.mistakes.every((m) => !/premium on redemption/.test(m.why)), a.prompt).toBe(true);
    }
  });

  it('draws the same question from the same seed', () => {
    expect(debAsk('entry', askRng(9, 'entry', 2))).toEqual(debAsk('entry', askRng(9, 'entry', 2)));
  });
});
