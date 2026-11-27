import { describe, expect, it } from 'vitest';
import { debtor } from './accounts';
import { BALANCE_BD, SUNDRIES, accountLabel, accountOf, balanceOf, cashBook, ledgerLabel, listBalances, post, postingsOf, trialBalance, type DatedEntry } from './books';
import type { JournalLine } from './journal';

const dr = (accountId: string, amount: number): JournalLine => ({ accountId, side: 'Dr', amount });
const cr = (accountId: string, amount: number): JournalLine => ({ accountId, side: 'Cr', amount });

const entries = [
  [dr('cash', 5000000), cr('capital', 5000000)],
  [dr('purchases', 2000000), cr('cash', 2000000)],
  [dr(debtor('Mohan'), 1500000), cr('sales', 1500000)],
  [dr('cash', 1500000), cr(debtor('Mohan'), 1500000)],
];

describe('books', () => {
  const ledger = post(entries);

  it('posts every line and nets the two sides of each account', () => {
    expect(balanceOf(ledger, 'cash')).toEqual({ side: 'Dr', amount: 4500000 });
    expect(balanceOf(ledger, 'capital')).toEqual({ side: 'Cr', amount: 5000000 });
    expect(balanceOf(ledger, debtor('Mohan'))).toBeNull();
    expect(balanceOf(ledger, 'rent')).toBeNull();
  });

  it('posts on top of opening balances without changing them', () => {
    const next = post([[dr('rent', 100000), cr('cash', 100000)]], ledger);
    expect(balanceOf(next, 'cash')).toEqual({ side: 'Dr', amount: 4400000 });
    expect(balanceOf(ledger, 'cash')).toEqual({ side: 'Dr', amount: 4500000 });
  });

  it('makes a trial balance that agrees, in ledger order, leaving out settled accounts', () => {
    const tb = trialBalance(ledger);
    expect(tb.rows.map((r) => r.accountId)).toEqual(['cash', 'capital', 'purchases', 'sales']);
    expect(tb.debitTotal).toBe(6500000);
    expect(tb.creditTotal).toBe(6500000);
  });

  it('labels accounts and lists balances one per line', () => {
    expect(accountLabel('cash')).toBe('Cash A/c');
    expect(accountLabel(debtor('Mohan'))).toBe('Mohan');
    expect(listBalances(trialBalance(ledger).rows.slice(0, 2))).toBe('Cash A/c: ₹45,000 (Dr)\nCapital A/c: ₹50,000 (Cr)');
  });
});

// A month of a trader: a credit purchase with GST, a settlement at a discount, cash banked, a sale partly for cash.
const RAO = 'creditor:Rao & Co.';
const MOHAN = debtor('Mohan');
const MONTH: DatedEntry[] = [
  { date: '2 April', lines: [dr('purchases', 4000000), dr('inputCGST', 100000), dr('inputSGST', 100000), cr(RAO, 4200000)] },
  { date: '9 April', lines: [dr(RAO, 2000000), cr('bank', 1960000), cr('discountReceived', 40000)] },
  { date: '12 April', lines: [dr('bank', 500000), cr('cash', 500000)] },
  { date: '15 April', lines: [dr('rent', 300000), cr('cash', 300000)] },
  { date: '20 April', lines: [dr('cash', 1000000), dr(MOHAN, 2000000), cr('sales', 2500000), cr('outputIGST', 500000)] },
];

describe('one account from dated entries', () => {
  const lines = (accountId: string) => postingsOf(MONTH, accountId).map((p) => [p.date, p.side, p.label, p.amount]);

  it('names the account in a ledger with "A/c", a party too', () => {
    expect(ledgerLabel('cash')).toBe('Cash A/c');
    expect(ledgerLabel(RAO)).toBe('Rao & Co. A/c');
  });

  it('gives an account that is alone on its side one item for each account on the other side', () => {
    expect(lines(RAO)).toEqual([
      ['2 April', 'Cr', 'Purchases A/c', 4000000],
      ['2 April', 'Cr', 'Input CGST A/c', 100000],
      ['2 April', 'Cr', 'Input SGST A/c', 100000],
      ['9 April', 'Dr', 'Bank A/c', 1960000],
      ['9 April', 'Dr', 'Discount Received A/c', 40000],
    ]);
  });

  it('gives an account that shares its side its own amount, against the one account on the other side', () => {
    expect(lines('purchases')).toEqual([['2 April', 'Dr', 'Rao & Co. A/c', 4000000]]);
    expect(lines('inputCGST')).toEqual([['2 April', 'Dr', 'Rao & Co. A/c', 100000]]);
    expect(lines('discountReceived')).toEqual([['9 April', 'Cr', 'Rao & Co. A/c', 40000]]);
  });

  it('writes Sundries where both sides of the entry have several accounts', () => {
    expect(lines(MOHAN)).toEqual([['20 April', 'Dr', SUNDRIES, 2000000]]);
    expect(postingsOf(MONTH, 'sales')[0]).toMatchObject({ side: 'Cr', label: SUNDRIES, amount: 2500000, accountIds: ['cash', MOHAN] });
  });

  it('gives nothing for an account no entry names, keeps the order of the entries, and takes another way of naming accounts', () => {
    expect(postingsOf(MONTH, 'wages')).toEqual([]);
    expect(lines('cash').map((l) => l[0])).toEqual(['12 April', '15 April', '20 April']);
    expect(postingsOf(MONTH, 'rent', accountLabel)[0].label).toBe('Cash A/c');
    expect(postingsOf(MONTH, 'purchases', accountLabel)[0].label).toBe('Rao & Co.');
  });

  it('writes an account up with its opening balance, and finds the balance to carry down', () => {
    const rao = accountOf(MONTH, RAO, { date: '1 April', side: 'Cr', amount: 1000000 });
    expect(rao.credit.map((p) => [p.label, p.amount])).toEqual([[BALANCE_BD, 1000000], ['Purchases A/c', 4000000], ['Input CGST A/c', 100000], ['Input SGST A/c', 100000]]);
    expect(rao.debit.map((p) => p.label)).toEqual(['Bank A/c', 'Discount Received A/c']);
    expect(rao.balance).toEqual({ side: 'Cr', amount: 3200000 });
    expect(rao.total).toBe(5200000);
    // The same balance as posting everything and netting it.
    expect(balanceOf(post(MONTH.map((e) => e.lines), new Map([[RAO, -1000000]])), RAO)).toEqual(rao.balance);
  });

  it('has no balance to carry down when the two sides are equal, or the account was never posted', () => {
    const settled = accountOf([...MONTH, { date: '28 April', lines: [dr('cash', 2000000), cr(MOHAN, 2000000)] }], MOHAN);
    expect(settled.balance).toBeNull();
    expect(settled.total).toBe(2000000);
    expect(accountOf(MONTH, 'wages')).toMatchObject({ debit: [], credit: [], balance: null, total: 0 });
  });
});

describe('the cash book', () => {
  it('puts cash and bank in their columns, each line on its side, and marks an entry between the two as contra', () => {
    const book = cashBook(MONTH, { date: '1 April', cash: 1500000, bank: 3000000 });
    expect(book.debit.map((r) => [r.date, r.label, r.cash, r.bank, r.contra ?? false])).toEqual([
      ['1 April', BALANCE_BD, 1500000, 3000000, false],
      ['12 April', 'Cash A/c', 0, 500000, true],
      ['20 April', SUNDRIES, 1000000, 0, false],
    ]);
    expect(book.credit.map((r) => [r.date, r.label, r.cash, r.bank, r.contra ?? false])).toEqual([
      ['9 April', 'Rao & Co. A/c', 0, 1960000, false],
      ['12 April', 'Bank A/c', 500000, 0, true],
      ['15 April', 'Rent A/c', 300000, 0, false],
    ]);
    expect(book.cash).toEqual({ side: 'Dr', amount: 1700000 });
    expect(book.bank).toEqual({ side: 'Dr', amount: 1540000 });
    expect(book.totals).toEqual({ cash: 2500000, bank: 3500000 });
    // Each column is the account written up on its own.
    expect(book.cash).toEqual(accountOf(MONTH, 'cash', { date: '1 April', side: 'Dr', amount: 1500000 }).balance);
  });

  it('opens an overdraft on the credit side, and shows a bank balance that ends as one', () => {
    const book = cashBook(MONTH, { date: '1 April', cash: 1000000, bank: -200000 });
    expect(book.debit[0]).toMatchObject({ label: BALANCE_BD, cash: 1000000, bank: 0 });
    expect(book.credit[0]).toMatchObject({ label: BALANCE_BD, cash: 0, bank: 200000 });
    expect(book.bank).toEqual({ side: 'Cr', amount: 1660000 });
    expect(cashBook([]).debit).toEqual([]);
    expect(cashBook([])).toMatchObject({ cash: null, bank: null, totals: { cash: 0, bank: 0 } });
  });
});
