import { describe, expect, it } from 'vitest';
import { ASHA, caseFromSeed, FARHAN, KIRAN, MEERA, READY_CASES } from './cases';
import { accountView, buildCase, castingsOf, correctedTb, entryText, problemOf, rupees as R, suspenseLeft, totalsOf, type Case, type LedgerState } from './model';

// Every ready case worked by hand: the recorded trial balance, the difference and its side, each error's effect and
// rectifying entry, Suspense A/c closing, the corrected trial balance and the profit. The figures in the comments
// are the working.

const ALL = (c: Case): LedgerState => ({ checked: true, balanced: true, suspense: true, revealed: new Set(c.errors.map((e) => e.letter)), rectified: new Set(c.rectifications.map((r) => r.letter)) });
const bal = (c: Case, id: string) => c.recordedNet.get(id) ?? 0;
const entries = (c: Case) => c.rectifications.map((r) => `(${r.letter}) ${entryText(r.lines)}`);

describe('Asha Stationers (level 1), worked by hand', () => {
  const c = buildCase(ASHA);
  it('stands as a case', () => expect(problemOf(ASHA)).toBeNull());
  it('the recorded trial balance: debit ₹1,46,400, credit ₹1,58,000', () => {
    // Cash 1,00,000 + 32,000 − 30,000 − 12,000 − 4,000 − 2,500 = 83,500; Purchases 30,000 + 12,000 + 18,000 = 60,000; Rent 400 (posted as ₹400); Wages 2,500. Mohan never posted.
    expect(bal(c, 'cash')).toBe(R(83500));
    expect(bal(c, 'purchases')).toBe(R(60000));
    expect(bal(c, 'rent')).toBe(R(400));
    expect(c.recordedNet.has('debtor:Mohan')).toBe(false);
    expect(totalsOf(c.tbChecked)).toEqual({ debit: R(146400), credit: R(158000) });
    expect(c.suspense).toEqual({ side: 'Dr', amount: R(11600) });
  });
  it('rectifies each error: principle between the accounts, the two posting errors through Suspense', () => {
    expect(c.errors.map((e) => [e.tag, e.kind, e.oneSided, e.gap / 100])).toEqual([
      ['(a)', 'principle', false, 0],
      ['(b)', 'partial-omission', true, -8000],
      ['(c)', 'wrong-amount', true, -3600],
    ]);
    expect(entries(c)).toEqual([
      '(a) Furniture A/c Dr ₹12,000; To Purchases A/c ₹12,000',
      '(b) Mohan A/c Dr ₹8,000; To Suspense A/c ₹8,000',
      '(c) Rent A/c Dr ₹3,600; To Suspense A/c ₹3,600',
    ]);
    expect(c.errors[0].text).toBe('Furniture bought for ₹12,000 in cash on 6 April was debited to Purchases A/c.');
    expect(c.errors[1].text).toBe('A credit sale of ₹8,000 to Mohan on 10 April was entered in the journal but not posted to Mohan\'s account.');
    expect(c.errors[2].narration).toBe('₹4,000 paid in cash for rent posted to Rent A/c as ₹400 instead of ₹4,000, now rectified');
  });
  it('Suspense A/c closes: debit ₹11,600 against ₹8,000 + ₹3,600', () => {
    const s = accountView(c, 'suspense', ALL(c))!;
    expect(s.periods[0].dr.rows.map((r) => [r.particulars, r.amount / 100])).toEqual([['To Difference in Trial Balance', 11600]]);
    expect(s.periods[0].cr.rows.map((r) => [r.date, r.particulars, r.amount / 100])).toEqual([
      ['(b)', 'By Mohan A/c', 8000],
      ['(c)', 'By Rent A/c', 3600],
    ]);
    expect([s.periods[0].dr.total, s.periods[0].cr.total, s.balance]).toEqual([R(11600), R(11600), null]);
    expect(suspenseLeft(c, new Set(['a', 'b', 'c']))).toBe(0);
  });
  it('the corrected trial balance agrees at ₹1,58,000, and the profit rises from ₹7,100 to ₹15,500', () => {
    expect(totalsOf(correctedTb(c))).toEqual({ debit: R(158000), credit: R(158000) });
    // Books: 40,000 + 30,000 − 60,000 − 400 − 2,500 = 7,100. Corrected: 40,000 + 30,000 − 48,000 − 4,000 − 2,500 = 15,500.
    expect(c.profit).toEqual({ books: R(7100), corrected: R(15500) });
    expect(c.errors.map((e) => e.profit / 100)).toEqual([-12000, 0, 3600]);
  });
});

describe('Kiran Traders (level 2), worked by hand', () => {
  const c = buildCase(KIRAN);
  it('stands as a case', () => expect(problemOf(KIRAN)).toBeNull());
  it('the Sales Book is undercast: ₹22,000 posted for ₹23,000', () => {
    expect(c.book?.rows.map((r) => [r.invoice, r.amount / 100])).toEqual([
      [101, 9000],
      [102, 6500],
      [103, 7500],
    ]);
    expect([c.book?.sum, c.book?.total]).toEqual([R(23000), R(22000)]);
  });
  it('the rent posting left out of Cash A/c is found before the trial balance and corrected in the account', () => {
    const d = c.errors[3];
    expect([d.tag, d.when, d.inAccount]).toEqual(['(d)', 'before', 'Credit Cash A/c with ₹3,000: post the item that was left out ("By Rent A/c ₹3,000").']);
    const cash = accountView(c, 'cash', { checked: true, balanced: false, suspense: false, revealed: new Set(), rectified: new Set() })!;
    expect(cash.periods[0].cr.rows.map((r) => [r.particulars, r.amount / 100, r.mark?.tone ?? ''])).toEqual([
      ['By Jain Brothers A/c', 15000, ''],
      ['By Rent A/c', 3000, 'fixed'],
    ]);
    const posted = accountView(c, 'cash', { checked: false, balanced: false, suspense: false, revealed: new Set(), rectified: new Set() })!;
    expect(posted.periods[0].cr.rows.map((r) => r.particulars)).toEqual(['By Jain Brothers A/c']);
  });
  it('the recorded trial balance: debit ₹1,37,000, credit ₹1,16,000; Suspense ₹21,000 on the credit side', () => {
    // Cash 40,000 + 10,000 + 4,000 + 12,000 − 15,000 − 3,000 = 48,000 (salaries left out); Priya 12,000 + 6,500 + 10,000 = 28,500;
    // Ravi 9,000; Sunita 7,500 − 4,000 = 3,500; Sales 22,000 + 12,000 = 34,000.
    expect([bal(c, 'cash'), bal(c, 'debtor:Priya'), bal(c, 'debtor:Ravi'), bal(c, 'debtor:Sunita'), bal(c, 'sales')]).toEqual([R(48000), R(28500), R(9000), R(3500), -R(34000)]);
    expect(totalsOf(c.tbChecked)).toEqual({ debit: R(137000), credit: R(116000) });
    expect(c.suspense).toEqual({ side: 'Cr', amount: R(21000) });
  });
  it('rectifies four errors after the trial balance', () => {
    expect(entries(c)).toEqual([
      '(a) Suspense A/c Dr ₹20,000; To Priya A/c ₹20,000',
      '(b) Sunita A/c Dr ₹4,000; To Ravi A/c ₹4,000',
      '(c) Salaries A/c Dr ₹6,000; To Cash A/c ₹6,000',
      '(e) Suspense A/c Dr ₹1,000; To Sales A/c ₹1,000',
    ]);
    expect(c.errors[1].text).toBe('₹4,000 received in cash from Ravi on 20 April was credited to Sunita\'s account instead of Ravi\'s account.');
    expect(c.errors[4].text).toBe('The Sales Book was undercast by ₹1,000: its total was taken as ₹22,000 instead of ₹23,000, and posted to Sales A/c.');
  });
  it('Suspense A/c closes at ₹21,000; the corrected trial balance agrees at ₹1,17,000; profit ₹19,000 corrected to ₹14,000', () => {
    const s = accountView(c, 'suspense', ALL(c))!;
    expect([s.periods[0].dr.total, s.periods[0].cr.total, s.balance]).toEqual([R(21000), R(21000), null]);
    expect(totalsOf(correctedTb(c))).toEqual({ debit: R(117000), credit: R(117000) });
    // Books: 34,000 + 8,000 − 20,000 − 3,000 = 19,000. Corrected: 35,000 + 8,000 − 20,000 − 6,000 − 3,000 = 14,000.
    expect(c.profit).toEqual({ books: R(19000), corrected: R(14000) });
  });
  it("Priya's account after rectification: ₹28,500 brought down, ₹20,000 credited, ₹8,500 carried down", () => {
    const p = accountView(c, 'debtor:Priya', ALL(c))!;
    const p2 = p.periods[1];
    expect(p2.dr.rows.map((r) => [r.date, r.particulars, r.amount / 100])).toEqual([['May 1', 'To Balance b/d', 28500]]);
    expect(p2.cr.rows.map((r) => [r.date, r.particulars, r.amount / 100])).toEqual([
      ['(a)', 'By Suspense A/c', 20000],
      ['', 'By Balance c/d', 8500],
    ]);
    expect(p.balance).toEqual({ side: 'Dr', amount: R(8500) });
  });
});

describe('Meera Electricals (level 3), worked by hand', () => {
  const c = buildCase(MEERA);
  it('stands as a case', () => expect(problemOf(MEERA)).toBeNull());
  it('Sales A/c and Wages A/c are overcast alike; Cash A/c is carried down at ₹65,600 for ₹66,500', () => {
    const view = ALL(c);
    const sales = accountView(c, 'sales', view)!;
    // Credit side: 32,000 + 14,000 = 46,000, added as 47,000.
    expect([sales.periods[0].cr.total, sales.periods[0].cr.totalMark]).toEqual([R(47000), 'c']);
    expect(sales.periods[0].dr.rows.map((r) => [r.particulars, r.amount / 100])).toEqual([['To Balance c/d', 47000]]);
    const cash = accountView(c, 'cash', view)!;
    // 30,000 + 32,000 + 14,000 = 76,000 against 4,500 + 5,000 = 9,500: 66,500, carried down as 65,600.
    expect(cash.periods[0].cr.rows.map((r) => [r.particulars, r.amount / 100, r.mark?.letter ?? ''])).toEqual([
      ['By Wages A/c', 4500, ''],
      ['By Wages A/c', 5000, ''],
      ['By Balance c/d', 65600, 'd'],
    ]);
    expect(cash.periods[0].dr.total).toBe(R(76000));
  });
  it("the draft trial balance has Deepa's ₹5,000 in the credit column: ₹1,64,100 and ₹1,65,100; checked: ₹1,69,100 and ₹1,60,100", () => {
    expect(totalsOf(c.tbDraft)).toEqual({ debit: R(164100), credit: R(165100) });
    expect(totalsOf(c.tbChecked)).toEqual({ debit: R(169100), credit: R(160100) });
    expect(c.tbChecked.find((r) => r.accountId === 'debtor:Deepa')).toMatchObject({ side: 'Dr', amount: R(5000), fixed: 'moved', letter: 'e' });
    expect(c.suspense).toEqual({ side: 'Cr', amount: R(9000) });
    expect(c.errors[4]).toMatchObject({ when: 'tb', gap: -R(10000), entry: null });
  });
  it('rectifies: the Purchases Book posting through Suspense, principle and compensating errors between accounts, Cash through Suspense', () => {
    expect(entries(c)).toEqual([
      '(a) Suspense A/c Dr ₹9,900; To Jain Brothers A/c ₹9,900',
      '(b) Machinery A/c Dr ₹25,000; To Purchases A/c ₹25,000',
      '(c) Sales A/c Dr ₹1,000; To Wages A/c ₹1,000',
      '(d) Cash A/c Dr ₹900; To Suspense A/c ₹900',
    ]);
    expect(c.errors[2].text).toBe('The credit side of Sales A/c was overcast by ₹1,000, and the debit side of Wages A/c was overcast by ₹1,000.');
    const s = accountView(c, 'suspense', ALL(c))!;
    // Credit: 9,000 + 900 = 9,900; debit: 9,900.
    expect([s.periods[0].dr.total, s.periods[0].cr.total]).toEqual([R(9900), R(9900)]);
  });
  it('the books show a loss of ₹5,500; corrected, a profit of ₹19,500', () => {
    // Books: 47,000 + 30,000 − 20,000 − 52,000 − 10,500 = −5,500. Corrected: 46,000 + 30,000 − 20,000 − 27,000 − 9,500 = 19,500.
    expect(c.profit).toEqual({ books: -R(5500), corrected: R(19500) });
    expect(c.errors[2].profit).toBe(0);
    expect(c.errors[2].profitWords).toEqual(['Sales A/c is ₹1,000 too high: the profit is overstated by ₹1,000.', 'Wages A/c is ₹1,000 too high: the profit is understated by ₹1,000.']);
    expect(totalsOf(correctedTb(c))).toEqual({ debit: R(169000), credit: R(169000) });
  });
});

describe('Farhan Book House (level 4, detective), worked by hand', () => {
  const c = buildCase(FARHAN);
  it('stands as a case', () => expect(problemOf(FARHAN)).toBeNull());
  it('the recorded trial balance: debit ₹1,39,500, credit ₹1,09,500; Suspense ₹30,000 on the credit side', () => {
    // Cash 36,800; Bank 48,000; Imran 8,000 + 6,000 + 8,000 + 5,500 = 27,500; Purchases 23,000 added as 22,000;
    // Rao 26,000 − 21,000 = 5,000; Sales 18,000 + 5,500 = 23,500.
    expect([bal(c, 'cash'), bal(c, 'debtor:Imran'), bal(c, 'purchases'), bal(c, 'creditor:Rao & Co.'), bal(c, 'sales')]).toEqual([R(36800), R(27500), R(22000), -R(5000), -R(23500)]);
    expect(totalsOf(c.tbChecked)).toEqual({ debit: R(139500), credit: R(109500) });
    expect(c.suspense).toEqual({ side: 'Cr', amount: R(30000) });
  });
  it('rectifies six errors; Suspense closes at ₹31,000', () => {
    expect(entries(c)).toEqual([
      '(a) Suspense A/c Dr ₹6,000; To Sales A/c ₹6,000',
      '(b) Suspense A/c Dr ₹9,000; To Rao & Co. A/c ₹9,000',
      '(c) Suspense A/c Dr ₹16,000; To Imran A/c ₹16,000',
      '(d) Ravi A/c Dr ₹5,500; To Imran A/c ₹5,500',
      '(e) Purchases A/c Dr ₹1,000; To Suspense A/c ₹1,000',
      '(f) Cash A/c Dr ₹1,500; To Commission Received A/c ₹1,500',
    ]);
    const s = accountView(c, 'suspense', ALL(c))!;
    expect([s.periods[0].dr.total, s.periods[0].cr.total, s.balance]).toEqual([R(31000), R(31000), null]);
    expect(totalsOf(correctedTb(c))).toEqual({ debit: R(126000), credit: R(126000) });
    // Books: 23,500 + 12,000 − 22,000 − 2,200 = 11,300. Corrected: 29,500 + 1,500 + 12,000 − 23,000 − 2,200 = 17,800.
    expect(c.profit).toEqual({ books: R(11300), corrected: R(17800) });
  });
  it("Imran's account after rectification: ₹27,500 less ₹16,000 and ₹5,500 leaves ₹6,000", () => {
    const v = accountView(c, 'debtor:Imran', ALL(c))!;
    expect(v.periods[1].cr.rows.map((r) => [r.date, r.particulars, r.amount / 100])).toEqual([
      ['(c)', 'By Suspense A/c', 16000],
      ['(d)', 'By Ravi A/c', 5500],
      ['', 'By Balance c/d', 6000],
    ]);
  });
});

describe('every case, ready or drawn from a seed', () => {
  const cases = [...READY_CASES, ...Array.from({ length: 120 }, (_, i) => caseFromSeed(i + 1))];
  it('can stand, and its books balance after rectification with Suspense A/c closed', () => {
    for (const data of cases) {
      expect(problemOf(data), data.id).toBeNull();
      const c = buildCase(data);
      // The recorded books differ from the true ones by exactly what the errors left wrong.
      const expected = new Map(c.trueNet);
      for (const e of c.errors) for (const [id, v] of e.delta) expected.set(id, (expected.get(id) ?? 0) + v);
      for (const id of new Set([...expected.keys(), ...c.recordedNet.keys()])) {
        const before = c.errors.filter((e) => e.when === 'before').reduce((s, e) => s + (e.delta.find(([a]) => a === id)?.[1] ?? 0), 0);
        expect(c.recordedNet.get(id) ?? 0, `${data.id} ${id}`).toBe((expected.get(id) ?? 0) - before);
      }
      // The difference is what the errors found after the trial balance did to it.
      const gap = c.errors.filter((e) => e.when === 'after').reduce((s, e) => s + e.gap, 0);
      expect(c.suspense.amount, data.id).toBe(Math.abs(gap));
      expect(c.suspense.side, data.id).toBe(gap > 0 ? 'Cr' : 'Dr');
      // Every rectifying entry balances, and goes through Suspense exactly when the error was one-sided.
      for (const r of c.rectifications) {
        const net = r.lines.reduce((s, l) => s + (l.side === 'Dr' ? l.amount : -l.amount), 0);
        expect(net, data.id).toBe(0);
        const e = c.errors.find((x) => x.letter === r.letter)!;
        expect(r.lines.some((l) => l.accountId === 'suspense'), data.id).toBe(e.oneSided);
      }
      // After rectification: Suspense nil, every account at its true balance, the trial balance agreeing.
      expect(c.correctedNet.get('suspense'), data.id).toBe(0);
      for (const id of new Set([...c.trueNet.keys(), ...c.correctedNet.keys()])) expect(c.correctedNet.get(id) ?? 0, `${data.id} ${id}`).toBe(c.trueNet.get(id) ?? 0);
      const t = totalsOf(correctedTb(c));
      expect(t.debit, data.id).toBe(t.credit);
      // The drawn accounts agree with the figures: each account's last balance is the corrected one.
      const all = ALL(c);
      for (const id of c.accounts) {
        const v = accountView(c, id, all);
        const net = c.correctedNet.get(id) ?? 0;
        expect(v ? (v.balance ? (v.balance.side === 'Dr' ? v.balance.amount : -v.balance.amount) : 0) : 0, `${data.id} ${id}`).toBe(net);
        if (v) for (const p of v.periods) if (p.dr.total !== null) expect(p.dr.total, `${data.id} ${id}`).toBe(p.cr.total);
      }
      // The profit as per the books, corrected for each error, is the correct profit.
      const effect = c.errors.reduce((s, e) => s + (e.when === 'after' ? e.profit : 0), 0);
      expect(c.profit.books - effect, data.id).toBe(c.profit.corrected);
    }
  });

  it('gives the same month for the same seed, and different months for different seeds', () => {
    expect(caseFromSeed(5)).toEqual(caseFromSeed(5));
    const titles = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(caseFromSeed(i + 1).txns)));
    expect(titles.size).toBe(30);
    const kinds = new Set(cases.flatMap((d) => d.errors.map((e) => e.kind)));
    expect(kinds.size).toBe(12);
  });
});

describe("the examiner's corrections", () => {
  it('a compensating pair of castings found before the trial balance is put right in each account, with no entry', async () => {
    const { beforeWords } = await import('./walk');
    const e = buildCase(MEERA).errors[2];
    expect(beforeWords(e)).toMatch(/each would be corrected in its own account, with no journal entry/);
  });
  it('a side is cast wrongly only where it has two figures or more to add, and no seeded wrong balancing shares its account', () => {
    expect(problemOf({ ...FARHAN, errors: [{ kind: 'casting', accountId: 'electricity', side: 'Dr', by: R(100) }, { kind: 'partial-omission', txn: 1, line: 1 }] })).toMatch(/nothing to add up wrongly/);
    for (let s = 1; s <= 120; s++) {
      const data = caseFromSeed(s);
      const c = buildCase(data);
      for (const x of castingsOf(data)) expect(c.posted.filter((p) => p.accountId === x.accountId && p.side === x.side).length, data.id).toBeGreaterThanOrEqual(2);
      for (const e of c.errors) if (e.kind === 'wrong-balance') expect(c.errors.filter((x) => x.accounts.includes(e.accounts[0])), data.id).toHaveLength(1);
      // A running business begins the month with stock.
      expect(data.opening.some((o) => o.accountId === 'stock'), data.id).toBe(true);
    }
  });
});
