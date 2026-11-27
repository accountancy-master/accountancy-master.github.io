import { describe, expect, it } from 'vitest';
import { createRng } from '@/engine/rng';
import { rupees as R } from '@/engine/money';
import { EXAMPLES, randomMonth, WATCH_EXAMPLES } from './examples';
import { booksOf, goodsTotals, invoiceOf, ledgerOf, partyBalance, pettyTotals, postingsOfBook, problemOf, recordsOf, taxOn, BOOK_ORDER, type Month } from './model';
import { standingAfter, walkOf } from './walk';

const navya = WATCH_EXAMPLES[0].month;
const kavya = WATCH_EXAMPLES[1].month;
const orbit = EXAMPLES[2].month;

describe('GST and the invoice', () => {
  it('takes the trade discount off first and works the tax on what is left', () => {
    // List ₹80,000 less 25%: ₹60,000; 18% within the state: CGST ₹5,400 + SGST ₹5,400; total ₹70,800 (the topic's q-036).
    expect(invoiceOf(R(80000), 25, { rate: 18, intra: true })).toMatchObject({ tdAmount: R(20000), taxable: R(60000), cgst: R(5400), sgst: R(5400), igst: 0, total: R(70800) });
    expect(invoiceOf(R(80000), 25, { rate: 5, intra: false })).toMatchObject({ taxable: R(60000), igst: R(3000), total: R(63000) });
    expect(taxOn(R(3600), { rate: 5, intra: true })).toEqual({ cgst: R(90), sgst: R(90), igst: 0, tax: R(180) });
    expect(invoiceOf(R(25000), 0, { rate: 0, intra: true })).toMatchObject({ taxable: R(25000), total: R(25000) });
  });
});

describe('each transaction goes to its book', () => {
  it('sorts the month without GST as the topics teach', () => {
    const recs = recordsOf(navya);
    expect(recs.map((r) => r.books.join('+'))).toEqual([
      'cash+petty', 'purchases', 'sales', 'cash', 'purchasesReturn', 'petty', 'salesReturn', 'journal', 'cash', 'petty', 'cash+journal', 'cash', 'petty', 'cash+journal', 'cash', 'journal', 'journal', 'cash+petty',
    ]);
    // A settlement at a cash discount: the money in the Cash Book, the discount in the Journal Proper.
    const kiran = recs[10];
    expect(kiran.parts[0].lines).toEqual([{ accountId: 'bank', side: 'Dr', amount: R(22500) }, { accountId: 'debtor:Kiran Stores', side: 'Cr', amount: R(22500) }]);
    expect(kiran.parts[1].lines).toEqual([{ accountId: 'discountAllowed', side: 'Dr', amount: R(500) }, { accountId: 'debtor:Kiran Stores', side: 'Cr', amount: R(500) }]);
    const rao = recs[13];
    expect(rao.parts[1].lines).toEqual([{ accountId: 'creditor:Rao & Co.', side: 'Dr', amount: R(400) }, { accountId: 'discountReceived', side: 'Cr', amount: R(400) }]);
    // Goods taken at cost: Drawings Dr, To Purchases.
    expect(recs[15].parts[0].lines).toEqual([{ accountId: 'drawings', side: 'Dr', amount: R(1500) }, { accountId: 'purchases', side: 'Cr', amount: R(1500) }]);
    // The reimbursement is exactly what was spent: 150 + 120 + 230.
    expect(recs[17].amount).toBe(R(500));
  });

  it('settles every party: what the parties owe after the month', () => {
    const recs = recordsOf(navya);
    expect(partyBalance(navya, recs, 'debtor:Kiran Stores')).toBe(0);
    expect(partyBalance(navya, recs, 'creditor:Rao & Co.')).toBe(0);
    expect(partyBalance(navya, recs, 'debtor:Mohan Stores')).toBe(0);
    expect(partyBalance(navya, recs, 'creditor:Hi-Tech Systems')).toBe(R(30000));
    for (const e of EXAMPLES) expect(problemOf(e.month), e.id).toBeNull();
  });
});

describe('the books of a month', () => {
  it('writes the goods books at the price after trade discount', () => {
    const b = booksOf(navya, recordsOf(navya));
    expect(b.purchases.map((r) => [r.party, r.invoice.taxable])).toEqual([['Rao & Co.', R(36000)]]);
    expect(b.purchasesReturn.map((r) => r.invoice.taxable)).toEqual([R(3600)]);
    expect(b.sales.map((r) => r.invoice.total)).toEqual([R(25000)]);
    expect(b.salesReturn.map((r) => r.invoice.total)).toEqual([R(2000)]);
    expect(b.journal.map((e) => e.lines[0].accountId)).toEqual(['computers', 'discountAllowed', 'creditor:Rao & Co.', 'drawings', 'badDebts']);
  });

  it('balances the Cash Book by hand: Navya Electricals, April', () => {
    // Cash: 20,000 + 8,000 + 5,000 (C) = 33,000 in; 3,000 + 10,000 (C) + 500 = 13,500 out; 19,500 in hand.
    // Bank: 60,000 + 10,000 (C) + 22,500 = 92,500 in; 6,000 + 32,000 + 5,000 (C) = 43,000 out; 49,500 at the bank.
    const v = booksOf(navya, recordsOf(navya)).cash.view;
    expect(v.cash).toEqual({ side: 'Dr', amount: R(19500) });
    expect(v.bank).toEqual({ side: 'Dr', amount: R(49500) });
    expect(v.totals).toEqual({ cash: R(33000), bank: R(92500) });
    expect(v.debit.filter((r) => r.contra).map((r) => r.label)).toEqual(['Cash A/c', 'Bank A/c']);
    expect(v.credit.filter((r) => r.contra).map((r) => r.label)).toEqual(['Bank A/c', 'Cash A/c']);
  });

  it('closes on an overdraft, the balance on the other side: Kavya Stationers, May', () => {
    // Bank: -12,000 + 35,000 - 19,500 + 15,000 - 11,800 - 20,000 - 3,000 = -16,300.
    // Cash: 15,000 + 7,080 - 15,000 - 4,000 = 3,080.
    const b = booksOf(kavya, recordsOf(kavya));
    expect(b.cash.view.bank).toEqual({ side: 'Cr', amount: R(16300) });
    expect(b.cash.view.cash).toEqual({ side: 'Dr', amount: R(3080) });
    // The cash sale with GST: one row for the goods and one for each tax.
    expect(b.cash.view.debit.filter((r) => r.date === '10 May').map((r) => [r.label, r.cash])).toEqual([
      ['Sales A/c', R(6000)],
      ['Output CGST A/c', R(540)],
      ['Output SGST A/c', R(540)],
    ]);
    expect(b.cash.debitFrom.length).toBe(b.cash.view.debit.length);
    expect(b.cash.creditFrom.length).toBe(b.cash.view.credit.length);
    const t = goodsTotals(b.sales);
    expect(t).toEqual({ taxable: R(48000), cgst: R(4320), sgst: R(4320), igst: 0, total: R(56640) });
  });

  it('charges IGST at the full rate with another state: Orbit Footwear, June', () => {
    // List ₹80,000 less 25% = ₹60,000; IGST 5% = ₹3,000; total ₹63,000. Cash purchase ₹4,000 + IGST ₹200.
    const b = booksOf(orbit, recordsOf(orbit));
    expect(b.purchases.map((r) => [r.invoice.taxable, r.invoice.igst, r.invoice.cgst, r.invoice.total])).toEqual([[R(60000), R(3000), 0, R(63000)]]);
    expect(b.purchasesReturn.map((r) => [r.invoice.taxable, r.invoice.igst])).toEqual([[R(6000), R(300)]]);
    expect(b.cash.view.credit.filter((r) => r.date === '15 June').map((r) => [r.label, r.cash])).toEqual([
      ['Purchases A/c', R(4000)],
      ['Input IGST A/c', R(200)],
    ]);
  });

  it('keeps the petty cash on the imprest', () => {
    const t = pettyTotals(booksOf(navya, recordsOf(navya)).petty);
    expect(t).toMatchObject({ received: R(3500), paid: R(500), balance: R(3000) });
    expect(t.byHead).toEqual({ postage: R(150), conveyance: R(120), stationery: R(230), refreshments: 0 });
  });
});

describe('posting to the ledger', () => {
  it('posts the Purchases Book: each supplier on the day, the totals at the month end', () => {
    const lines = postingsOfBook(kavya, recordsOf(kavya), 'purchases');
    expect(lines.map((l) => [l.accountId, l.side, l.amount, l.particulars, l.total])).toEqual([
      ['creditor:Lakshmi Traders', 'Cr', R(40000), 'By Purchases A/c', false],
      ['creditor:Lakshmi Traders', 'Cr', R(3600), 'By Input CGST A/c', false],
      ['creditor:Lakshmi Traders', 'Cr', R(3600), 'By Input SGST A/c', false],
      ['purchases', 'Dr', R(40000), 'To Sundries as per Purchases Book', true],
      ['inputCGST', 'Dr', R(3600), 'To Sundries as per Purchases Book', true],
      ['inputSGST', 'Dr', R(3600), 'To Sundries as per Purchases Book', true],
    ]);
  });

  it('posts the return books on the other side', () => {
    const pr = postingsOfBook(navya, recordsOf(navya), 'purchasesReturn');
    expect(pr.map((l) => [l.accountId, l.side, l.amount])).toEqual([
      ['creditor:Rao & Co.', 'Dr', R(3600)],
      ['purchasesReturn', 'Cr', R(3600)],
    ]);
    const sr = postingsOfBook(kavya, recordsOf(kavya), 'salesReturn');
    expect(sr.map((l) => [l.accountId, l.side, l.amount])).toEqual([
      ['debtor:Mehta Bros', 'Cr', R(1800)],
      ['debtor:Mehta Bros', 'Cr', R(162)],
      ['debtor:Mehta Bros', 'Cr', R(162)],
      ['salesReturn', 'Dr', R(1800)],
      ['outputCGST', 'Dr', R(162)],
      ['outputSGST', 'Dr', R(162)],
    ]);
  });

  it('posts the Cash Book row by row and never a contra entry', () => {
    const lines = postingsOfBook(navya, recordsOf(navya), 'cash');
    expect(lines.filter((l) => l.contra)).toHaveLength(2);
    const sales = lines.find((l) => l.accountId === 'sales')!;
    expect([sales.side, sales.particulars, sales.amount]).toEqual(['Cr', 'By Cash A/c', R(8000)]);
    const rent = lines.find((l) => l.accountId === 'rent')!;
    expect([rent.side, rent.particulars]).toEqual(['Dr', 'To Bank A/c']);
    expect(lines.some((l) => l.accountId === 'cash' || l.accountId === 'bank')).toBe(false);
  });

  it('gives a ledger in which every party account comes to its balance', () => {
    for (const e of EXAMPLES) {
      const recs = recordsOf(e.month);
      const ledger = ledgerOf(e.month, recs, new Set(BOOK_ORDER));
      for (const a of ledger.filter((x) => x.accountId.includes(':'))) {
        const net = a.debit.reduce((t, i) => t + i.amount, 0) - a.credit.reduce((t, i) => t + i.amount, 0);
        const bal = partyBalance(e.month, recs, a.accountId);
        expect((a.accountId.startsWith('debtor:') ? net : -net) + 0, `${e.id} ${a.accountId}`).toBe(bal);
      }
      // Debits equal credits over the whole ledger with the Cash Book (opening balances aside).
      const ledgerNet = ledger.reduce((t, a) => t + a.debit.filter((i) => i.book).reduce((s, i) => s + i.amount, 0) - a.credit.filter((i) => i.book).reduce((s, i) => s + i.amount, 0), 0);
      const v = booksOf(e.month, recs).cash.view;
      const cashNet = [...v.debit, ...v.credit].filter((r) => r.label !== 'Balance b/d').reduce((t, r) => t + (r.side === 'Dr' ? 1 : -1) * (r.cash + r.bank), 0);
      expect(ledgerNet + cashNet, e.id).toBe(0);
    }
  });

  it('writes each ledger account in the order of the dates, a month-end total after the rows of the month', () => {
    const ledger = ledgerOf(navya, recordsOf(navya), new Set(BOOK_ORDER));
    const sales = ledger.find((a) => a.accountId === 'sales')!;
    expect(sales.credit.map((i) => [i.date, i.label, i.amount])).toEqual([
      ['14 April', 'Cash A/c', R(8000)],
      ['30 April', 'Sundries as per Sales Book', R(25000)],
    ]);
    expect(sales.credit.map((i) => i.book)).toEqual(['cash', 'sales']);
    for (const e of EXAMPLES) {
      for (const a of ledgerOf(e.month, recordsOf(e.month), new Set(BOOK_ORDER))) {
        for (const side of [a.debit, a.credit]) {
          const days = side.map((i) => Number(i.date.split(' ')[0]));
          expect(days, `${e.id} ${a.accountId}`).toEqual([...days].sort((x, y) => x - y));
        }
      }
    }
  });

  it('posts the petty cash columns to their accounts and Petty Cash A/c', () => {
    const lines = postingsOfBook(navya, recordsOf(navya), 'petty');
    expect(lines.map((l) => [l.accountId, l.side, l.amount, l.particulars])).toEqual([
      ['postage', 'Dr', R(150), 'To Petty Cash A/c'],
      ['conveyance', 'Dr', R(120), 'To Petty Cash A/c'],
      ['stationery', 'Dr', R(230), 'To Petty Cash A/c'],
      ['pettyCash', 'Cr', R(150), 'By Postage A/c'],
      ['pettyCash', 'Cr', R(120), 'By Conveyance A/c'],
      ['pettyCash', 'Cr', R(230), 'By Stationery A/c'],
    ]);
  });
});

describe('the walk through a month', () => {
  it('sorts every card, balances the Cash Book, then posts every book', () => {
    const recs = recordsOf(navya);
    const walk = walkOf(navya, recs);
    expect(walk).toHaveLength(recs.length + 1 + 7);
    const s = standingAfter(walk, recs.length + 1);
    expect(s).toMatchObject({ cards: recs.length, closed: true, book: 'cash' });
    expect(standingAfter(walk, walk.length).posted.size).toBe(7);
    expect(walk.at(-1)!.step).toEqual({ kind: 'post', book: 'journal' });
    expect(walk[recs.length].text).toContain('₹19,500');
  });
});

describe('the sandbox', () => {
  it('refuses a month that cannot be', () => {
    const over: Month = { ...navya, txs: [{ day: 3, kind: 'expense', expense: 'rent', amount: R(25000), mode: 'cash' }] };
    expect(problemOf(over)).toMatch(/cash in hand can never fall below nil/);
    const back: Month = { ...navya, txs: [{ day: 3, kind: 'purchaseReturn', party: 'Rao & Co.', list: R(1000), td: 0, no: 1 }] };
    expect(problemOf(back)).toMatch(/Rao & Co\./);
    const order: Month = { ...navya, txs: [navya.txs[2], navya.txs[1]] };
    expect(problemOf(order)).toMatch(/order of their dates/);
  });

  it('makes months from a seed that hold, in whole rupees', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const m = randomMonth(createRng(seed));
      expect(problemOf(m), String(seed)).toBeNull();
      const recs = recordsOf(m);
      for (const r of recs) for (const p of r.parts) for (const l of p.lines) expect(l.amount % 100, `${seed} ${r.text}`).toBe(0);
      const b = booksOf(m, recs);
      expect(b.purchases.length + b.sales.length).toBeGreaterThan(1);
      expect(b.cash.view.cash?.side ?? 'Dr').toBe('Dr');
    }
  });
});
