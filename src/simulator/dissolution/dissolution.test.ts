import { describe, expect, it } from 'vitest';
import { judge } from '@/components/simulator/labs/kit/answers';
import { partnerCapital, partnerLoan } from '@/engine/accounts';
import { post } from '@/engine/books';
import type { JournalLine } from '@/engine/journal';
import { rupees } from '@/engine/money';
import { createRng } from '@/engine/rng';
import { bankOf, dissolve, eventsOf, problemOf, visible, type DFirm, type Dissolution } from './dissolve';
import { EXAMPLES, randomFirm } from './examples';
import { askRng, DIS_ASK_KINDS, disAsk } from './tryit';

const r = rupees;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** The long way round: the balance sheet as an opening entry, every entry posted, and every account left at nil. */
function closesByLedger(d: Dissolution): boolean {
  const f = d.firm;
  const opening: JournalLine[] = [
    { accountId: 'bank', side: 'Dr', amount: d.bank },
    ...f.assets.map((a): JournalLine => ({ accountId: a.id, side: 'Dr', amount: a.book })),
    ...(f.plDebit ? [{ accountId: 'profitAndLoss', side: 'Dr' as const, amount: f.plDebit }] : []),
    ...f.liabilities.map((l): JournalLine => ({ accountId: l.id, side: 'Cr', amount: l.book })),
    ...(f.provision ? [{ accountId: 'provisionForDoubtfulDebts', side: 'Cr' as const, amount: f.provision }] : []),
    ...(f.reserve ? [{ accountId: 'generalReserve', side: 'Cr' as const, amount: f.reserve }] : []),
    ...(f.plCredit ? [{ accountId: 'profitAndLoss', side: 'Cr' as const, amount: f.plCredit }] : []),
    ...f.partners.flatMap((p): JournalLine[] => [{ accountId: partnerCapital(p.name), side: 'Cr', amount: p.capital }, ...(p.loan ? [{ accountId: partnerLoan(p.name), side: 'Cr' as const, amount: p.loan }] : [])]),
  ];
  const balanced = sum(opening.map((l) => (l.side === 'Dr' ? l.amount : -l.amount))) === 0;
  const entries = d.steps.flatMap((s) => s.entries.map((e) => e.lines.map((l): JournalLine => ({ accountId: l.account, side: l.side, amount: l.amount }))));
  const entriesBalance = entries.every((e) => sum(e.map((l) => (l.side === 'Dr' ? l.amount : -l.amount))) === 0);
  return balanced && entriesBalance && [...post([opening, ...entries]).values()].every((v) => v === 0);
}

const total = (rows: readonly { amount: number }[]) => sum(rows.map((x) => x.amount));
const colTotals = (rows: readonly { amounts: number[] }[], n: number) => Array.from({ length: n }, (_, i) => sum(rows.map((x) => x.amounts[i])));

describe('a dissolution, worked by hand', () => {
  it('sells, takes over, settles at a discount and repays a partner’s loan (Asha and Bharat)', () => {
    const d = dissolve(EXAMPLES[0].firm);
    expect(d.problem).toBeNull();
    expect(d.bank).toBe(r(20000));
    expect(d.realisationDebit).toBe(r(512000));
    expect(d.realisationCredit).toBe(r(452000));
    expect(d.result).toBe(r(-60000));
    expect(d.shares).toEqual([r(-36000), r(-24000)]);
    expect(d.finals).toEqual([r(85000), r(96000)]);
    expect(d.realisation.dr.map((x) => x.particulars)).toEqual([
      'To Stock A/c', 'To Debtors A/c', 'To Machinery A/c', 'To Furniture A/c', 'To Goodwill A/c', 'To Bank A/c (creditors)', 'To Bank A/c (bills payable)', 'To Bank A/c (realisation expenses)',
    ]);
    expect(d.realisation.cr.map((x) => x.particulars)).toEqual([
      'By Creditors A/c', 'By Bills Payable A/c', 'By Provision for Doubtful Debts A/c', 'By Bank A/c (debtors)', 'By Bank A/c (machinery)', 'By Bank A/c (furniture)', "By Asha's Capital A/c (stock)", "By Asha's Capital A/c (loss)", "By Bharat's Capital A/c (loss)",
    ]);
    // The goodwill, about which nothing is said, fetches nothing; the furniture fetches its book value.
    expect(d.realisation.cr.find((x) => x.particulars === 'By Bank A/c (furniture)')!.amount).toBe(r(40000));
    expect(d.realisation.cr.some((x) => x.particulars.includes('goodwill'))).toBe(false);
    expect(total(d.realisation.dr)).toBe(total(d.realisation.cr));
    expect(d.bankAccount.cr.map((x) => x.particulars)).toContain("By Bharat's Loan A/c");
    expect(total(d.bankAccount.dr)).toBe(total(d.bankAccount.cr));
    const caps = d.capitals;
    expect(caps.cr.map((x) => x.particulars)).toEqual(['By Balance b/d', 'By General Reserve A/c']);
    expect(caps.cr[1].amounts).toEqual([r(15000), r(10000)]);
    expect(caps.dr.map((x) => x.particulars)).toEqual(['To Realisation A/c (stock)', 'To Realisation A/c (loss)', 'To Bank A/c']);
    expect(colTotals(caps.dr, 2)).toEqual(colTotals(caps.cr, 2));
    expect(d.steps.at(-1)!.bank).toBe(0);
    expect(closesByLedger(d)).toBe(true);
  });

  it('settles creditors in kind, has a partner take a relative’s loan, and a partner bring in a deficiency (Kabir, Leela and Manoj)', () => {
    const d = dissolve(EXAMPLES[1].firm);
    expect(d.problem).toBeNull();
    expect(d.bank).toBe(r(65000));
    expect(d.realisationDebit).toBe(r(286000));
    expect(d.realisationCredit).toBe(r(265000));
    expect(d.shares).toEqual([r(-8400), r(-8400), r(-4200)]);
    expect(d.finals).toEqual([r(125600), r(-11400), r(9800)]);
    // Only the balance paid to the creditors is written: no row for the stock they accepted.
    expect(d.realisation.dr.find((x) => x.particulars === 'To Bank A/c (creditors)')!.amount).toBe(r(25000));
    expect(d.realisation.cr.some((x) => x.particulars.includes('stock'))).toBe(false);
    expect(d.realisation.cr.find((x) => x.particulars === "By Suman's Loan A/c")!.amount).toBe(r(40000));
    expect(d.realisation.dr.find((x) => x.particulars === "To Kabir's Capital A/c (Suman's loan)")!.amount).toBe(r(40000));
    expect(d.realisation.dr.find((x) => x.particulars === "To Manoj's Capital A/c (remuneration)")!.amount).toBe(r(6000));
    expect(d.capitals.dr.find((x) => x.particulars === 'To Bank A/c (realisation expenses)')!.amounts).toEqual([0, 0, r(4000)]);
    expect(d.capitals.dr.find((x) => x.particulars === 'To Profit and Loss A/c')!.amounts).toEqual([r(6000), r(6000), r(3000)]);
    expect(d.capitals.cr.find((x) => x.particulars === 'By Bank A/c')!.amounts).toEqual([0, r(11400), 0]);
    expect(d.steps.map((s) => s.kind)).toEqual(['assets', 'liabilities', 'accumulated', 'sold', 'taken', 'unrecordedAsset', 'creditorsAsset', 'liabilityTaken', 'unrecordedLiability', 'expenses', 'result', 'broughtIn', 'final']);
    expect(closesByLedger(d)).toBe(true);
  });

  it('shares a profit, the reserve and the undistributed profit, and repays a loan before the capitals (Esha, Farhan and Gauri)', () => {
    const d = dissolve(EXAMPLES[2].firm);
    expect(d.bank).toBe(r(120000));
    expect(d.result).toBe(r(50000));
    expect(d.shares).toEqual([r(25000), r(15000), r(10000)]);
    expect(d.finals).toEqual([r(148000), r(107000), r(78000)]);
    expect(d.realisation.dr.slice(-3).map((x) => x.particulars)).toEqual(["To Esha's Capital A/c (profit)", "To Farhan's Capital A/c (profit)", "To Gauri's Capital A/c (profit)"]);
    const loanAt = d.steps.findIndex((s) => s.kind === 'loans');
    expect(loanAt).toBeGreaterThan(d.steps.findIndex((s) => s.kind === 'result'));
    expect(d.steps[loanAt].bank).toBe(r(333000));
    expect(closesByLedger(d)).toBe(true);
  });

  it('matches the short sums of the topic', () => {
    const plain = (over: Partial<DFirm>): DFirm => ({
      firm: 'X and Y', date: '31 March 2026',
      partners: [{ name: 'Xavi', ratio: 1, capital: r(500000), loan: 0 }, { name: 'Yash', ratio: 1, capital: r(500000), loan: 0 }],
      assets: [], provision: 0, liabilities: [], reserve: 0, plCredit: 0, plDebit: 0, unrecordedAsset: null, unrecordedLiability: null,
      expenses: { form: 'firm', by: 0, actual: 0, fee: 0 }, ...over,
    });
    // q27: assets ₹3,00,000 realise ₹2,70,000; creditors ₹80,000 paid ₹76,000; expenses ₹5,000: loss ₹31,000.
    const q27 = dissolve(plain({
      assets: [{ id: 'machinery', name: 'Machinery', the: 'the machinery', book: r(300000), fate: { kind: 'sold', amount: r(270000) } }],
      liabilities: [{ id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(80000), fate: { kind: 'paid', discount: r(4000) } }],
      expenses: { form: 'firm', by: 0, actual: r(5000), fee: 0 },
    }));
    expect(q27.result).toBe(r(-31000));
    // q28: creditors ₹60,000 accept stock at ₹45,000; ₹15,000 is debited for the settlement.
    const q28 = dissolve(plain({
      assets: [{ id: 'stock', name: 'Stock', the: 'the stock', book: r(50000), fate: { kind: 'creditors', amount: r(45000) } }],
      liabilities: [{ id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(60000), fate: { kind: 'paid', discount: 0 } }],
    }));
    expect(q28.realisation.dr.find((x) => x.particulars === 'To Bank A/c (creditors)')!.amount).toBe(r(15000));
    // q22: creditors and a partner's wife's loan go through Realisation A/c; the partner's own loan does not.
    const q22 = dissolve(plain({
      partners: [{ name: 'Nair', ratio: 1, capital: r(500000), loan: r(50000) }, { name: 'Yash', ratio: 1, capital: r(500000), loan: 0 }],
      liabilities: [
        { id: 'creditors', name: 'Creditors', the: 'the creditors', what: 'creditors', book: r(90000), fate: { kind: 'paid', discount: 0 } },
        { id: partnerLoan('Lata'), name: "Loan from Lata (Nair's spouse)", the: 'the loan from Lata', what: "Lata's loan", book: r(40000), fate: { kind: 'paid', discount: 0 } },
      ],
    }));
    expect(total(q22.realisation.dr.filter((x) => x.particulars.startsWith('To Bank A/c')))).toBe(r(130000));
    expect(closesByLedger(q22)).toBe(true);
  });

  it('records each form of the realisation expenses as the topic does', () => {
    const base = EXAMPLES[0].firm;
    const real = (form: DFirm['expenses']['form']) => dissolve({ ...base, expenses: { form, by: 1, actual: r(4000), fee: r(6000) } });
    const rows = (d: Dissolution) => [...d.realisation.dr, ...d.realisation.cr].filter((x) => /expenses|remuneration/.test(x.particulars)).map((x) => `${x.particulars} ${x.amount / 100}`);
    expect(rows(real('firm'))).toEqual(['To Bank A/c (realisation expenses) 4000']);
    expect(rows(real('partnerPays'))).toEqual(["To Bharat's Capital A/c (realisation expenses) 4000"]);
    expect(rows(real('feePersonal'))).toEqual(["To Bharat's Capital A/c (remuneration) 6000"]);
    expect(rows(real('feeFirmPays'))).toEqual(["To Bharat's Capital A/c (remuneration) 6000"]);
    expect(rows(real('borneFirmPays'))).toEqual([]);
    expect(rows(real('bornePersonal'))).toEqual([]);
    expect(real('borneFirmPays').capitals.dr.find((x) => x.particulars === 'To Bank A/c (realisation expenses)')!.amounts).toEqual([0, r(4000)]);
    expect(real('bornePersonal').steps.find((s) => s.kind === 'expenses')!.entries).toEqual([]);
    for (const form of ['firm', 'partnerPays', 'feePersonal', 'feeFirmPays', 'borneFirmPays', 'bornePersonal'] as const) expect(closesByLedger(real(form))).toBe(true);
  });

  it('refuses a firm that cannot be closed, and says why', () => {
    const f = EXAMPLES[0].firm;
    expect(problemOf({ ...f, partners: f.partners.map((p) => ({ ...p, capital: r(1000) })) })).toMatch(/cash at bank/);
    expect(problemOf({ ...f, liabilities: f.liabilities.map((l) => (l.id === 'creditors' ? { ...l, fate: { kind: 'paid', discount: r(90000) } } : l)) })).toMatch(/less than nothing/);
    expect(bankOf(f)).toBe(r(20000));
  });

  it('shows the rows of each account step by step', () => {
    const d = dissolve(EXAMPLES[0].firm);
    expect(visible(d.realisation.dr, 0)).toHaveLength(0);
    expect(visible(d.realisation.dr, 1)).toHaveLength(5);
    expect(visible(d.bankAccount.dr, 0).map((x) => x.particulars)).toEqual(['To Balance b/d']);
  });
});

describe('made-up firms', () => {
  it('close every account, with every share in whole rupees and the bank never overdrawn', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const f = randomFirm(createRng(seed));
      const d = dissolve(f);
      expect(d.problem, `seed ${seed}`).toBeNull();
      expect(closesByLedger(d), `seed ${seed}`).toBe(true);
      expect(d.shares.every((s) => s % 100 === 0)).toBe(true);
      expect(d.steps.every((s) => s.bank >= 0)).toBe(true);
    }
  });
});

describe('try it', () => {
  it('asks questions whose answers the books bear out', () => {
    for (const kind of DIS_ASK_KINDS) {
      for (let n = 0; n < 15; n++) {
        const ask = disAsk(kind, askRng(2, kind, n));
        const d = dissolve(ask.firm);
        expect(d.problem).toBeNull();
        expect(ask.reveal).toBeGreaterThan(ask.shown);
        expect(ask.reveal).toBeLessThanOrEqual(d.steps.length);
        const a = ask.answer;
        if (a.type === 'number') {
          expect(a.value).toBeGreaterThan(0);
          expect(judge(a, { figure: a.value, tag: a.tag?.correct }).right).toBe(true);
          for (const m of a.mistakes) expect(m.value).not.toBe(a.value);
          if (kind === 'result') expect(a.value).toBe(Math.abs(d.result));
        } else {
          expect(a.options.some((o) => o.id === a.correct)).toBe(true);
          for (const o of a.options) if (o.id !== a.correct) expect(o.why).toBeTruthy();
          // No entry is offered for a nil amount, or for a remuneration the question never names.
          for (const o of a.options) expect(o.text).not.toContain('₹0;');
        }
      }
    }
  });

  it('writes the articles and the plurals as English does', () => {
    const f = EXAMPLES[1].firm;
    const g: DFirm = { ...f, unrecordedLiability: { what: 'electricity bill', amount: r(5000), by: null }, liabilities: [...f.liabilities, { id: 'billsPayable', name: 'Bills payable', the: 'the bills payable', what: 'bills payable', book: r(10000), fate: { kind: 'paid', discount: 0 } }] };
    const words = [...eventsOf(g), ...dissolve(g).steps.map((s) => `${s.title}. ${s.text}`)].join(' ');
    expect(words).toContain('An electricity bill');
    expect(words).toContain('The bills payable were paid in full.');
    expect(words).not.toMatch(/\bA electricity|\ba old|loan from suman/);
  });
});
