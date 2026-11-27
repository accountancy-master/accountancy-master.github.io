import { describe, expect, it } from 'vitest';
import { rupees } from './money';
import { isBalanced, toJournal, type Transaction } from './journal';

const R = rupees;

describe('toJournal', () => {
  it('records capital introduced in cash', () => {
    expect(toJournal({ kind: 'capitalIntroduced', amount: R(50000), mode: 'cash' })).toEqual([
      { accountId: 'cash', side: 'Dr', amount: R(50000) },
      { accountId: 'capital', side: 'Cr', amount: R(50000) },
    ]);
  });

  it('records a credit purchase with intra-state GST', () => {
    expect(
      toJournal({ kind: 'purchase', amount: R(10000), pay: { creditor: 'Rao' }, gst: { rate: 18, kind: 'intra' } }),
    ).toEqual([
      { accountId: 'purchases', side: 'Dr', amount: R(10000) },
      { accountId: 'inputCGST', side: 'Dr', amount: R(900) },
      { accountId: 'inputSGST', side: 'Dr', amount: R(900) },
      { accountId: 'creditor:Rao', side: 'Cr', amount: R(11800) },
    ]);
  });

  it('records a cash sale with inter-state GST', () => {
    expect(toJournal({ kind: 'sale', amount: R(20000), receive: 'bank', gst: { rate: 12, kind: 'inter' } })).toEqual([
      { accountId: 'bank', side: 'Dr', amount: R(22400) },
      { accountId: 'sales', side: 'Cr', amount: R(20000) },
      { accountId: 'outputIGST', side: 'Cr', amount: R(2400) },
    ]);
  });

  it('records payment to a creditor with discount received', () => {
    expect(
      toJournal({ kind: 'paymentToCreditor', creditor: 'Rao', paid: R(9800), discount: R(200), mode: 'cash' }),
    ).toEqual([
      { accountId: 'creditor:Rao', side: 'Dr', amount: R(10000) },
      { accountId: 'cash', side: 'Cr', amount: R(9800) },
      { accountId: 'discountReceived', side: 'Cr', amount: R(200) },
    ]);
  });

  it('omits a zero discount line', () => {
    expect(
      toJournal({ kind: 'receiptFromDebtor', debtor: 'Mohan', received: R(5000), discount: 0, mode: 'bank' }),
    ).toEqual([
      { accountId: 'bank', side: 'Dr', amount: R(5000) },
      { accountId: 'debtor:Mohan', side: 'Cr', amount: R(5000) },
    ]);
  });

  it('balances every kind of transaction', () => {
    const all: Transaction[] = [
      { kind: 'capitalIntroduced', amount: R(1000), mode: 'bank' },
      { kind: 'purchase', amount: R(1000), pay: 'cash' },
      { kind: 'purchase', amount: R(1000), pay: { creditor: 'A' }, gst: { rate: 5, kind: 'intra' } },
      { kind: 'sale', amount: R(1000), receive: { debtor: 'B' }, gst: { rate: 18, kind: 'inter' } },
      { kind: 'assetPurchase', asset: 'machinery', amount: R(1000), mode: 'bank' },
      { kind: 'expensePaid', expense: 'rent', amount: R(1000), mode: 'cash' },
      { kind: 'incomeReceived', income: 'commissionReceived', amount: R(1000), mode: 'cash' },
      { kind: 'drawings', amount: R(1000), mode: 'cash' },
      { kind: 'paymentToCreditor', creditor: 'A', paid: R(950), discount: R(50), mode: 'bank' },
      { kind: 'receiptFromDebtor', debtor: 'B', received: R(950), discount: R(50), mode: 'cash' },
      { kind: 'cashDeposited', amount: R(1000) },
      { kind: 'cashWithdrawn', amount: R(1000) },
      { kind: 'purchaseReturn', creditor: 'A', amount: R(1000) },
      { kind: 'salesReturn', debtor: 'B', amount: R(1000) },
    ];
    for (const tx of all) expect(isBalanced(toJournal(tx)), tx.kind).toBe(true);
  });
});
