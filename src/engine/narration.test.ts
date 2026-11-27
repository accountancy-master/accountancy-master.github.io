import { describe, expect, it } from 'vitest';
import type { JournalLine } from './journal';
import { TEMPLATES, generateQuestion } from '@/generators';
import { narrationFor } from './narration';

const L = (accountId: string, side: 'Dr' | 'Cr', amount = 100): JournalLine => ({ accountId, side, amount });
const N = (lines: JournalLine[], text?: string) => narrationFor(lines, undefined, text);

describe('narrationFor', () => {
  it('says the usual transactions in the words of an answer', () => {
    expect(N([L('cash', 'Dr'), L('capital', 'Cr')])).toBe('Being capital brought into the business in cash');
    expect(N([L('purchases', 'Dr'), L('creditor:Ravi', 'Cr')])).toBe('Being goods purchased on credit from Ravi');
    expect(N([L('debtor:Mohan', 'Dr'), L('sales', 'Cr')])).toBe('Being goods sold on credit to Mohan');
    expect(N([L('cash', 'Dr'), L('sales', 'Cr')])).toBe('Being goods sold for cash');
    expect(N([L('rent', 'Dr'), L('bank', 'Cr')])).toBe('Being rent paid by cheque');
    expect(N([L('bank', 'Dr'), L('commissionReceived', 'Cr')])).toBe('Being commission received by cheque');
    expect(N([L('furniture', 'Dr'), L('cash', 'Cr')])).toBe('Being furniture purchased for cash');
    expect(N([L('drawings', 'Dr'), L('purchases', 'Cr')])).toBe('Being goods withdrawn for personal use');
    expect(N([L('bank', 'Dr'), L('cash', 'Cr')])).toBe('Being cash deposited into the bank');
    expect(N([L('depreciation', 'Dr'), L('machinery', 'Cr')])).toBe('Being depreciation charged on machinery');
    expect(N([L('advertisement', 'Dr'), L('purchases', 'Cr')])).toBe('Being goods distributed as free samples');
    expect(N([L('creditor:Ravi', 'Dr'), L('bank', 'Cr', 95), L('discountReceived', 'Cr', 5)])).toBe(
      'Being payment made to Ravi by cheque in full settlement, and discount received',
    );
    expect(N([L('salaries', 'Dr'), L('electricity', 'Dr'), L('bank', 'Cr', 200)])).toBe('Being expenses paid by cheque');
  });

  it('never says an account name twice or a loss as a payment', () => {
    // "Commission Paid A/c" and "Interest Paid A/c" are paid once, not "commission paid paid".
    expect(N([L('commissionPaid', 'Dr'), L('cash', 'Cr')])).toBe('Being commission paid in cash');
    expect(N([L('commissionPaid', 'Dr'), L('outstandingExpenses', 'Cr')])).toBe('Being commission outstanding at the end of the year');
    expect(N([L('bank', 'Dr'), L('badDebtsRecovered', 'Cr')])).toBe('Being bad debts recovered by cheque');
    // Cash stolen is lost, not paid.
    expect(N([L('lossByTheft', 'Dr'), L('cash', 'Cr')])).toBe('Being cash lost by theft');
    expect(N([L('badDebts', 'Dr'), L('debtor:Mohan', 'Cr')])).toBe('Being the amount due from Mohan written off as bad debts');
  });

  it('says what the bank did on its own as the bank statement shows it', () => {
    expect(N([L('insurance', 'Dr'), L('bank', 'Cr')], 'The bank paid an insurance premium of ₹8,200 on the firm’s standing instruction.')).toBe(
      'Being insurance premium paid by the bank under a standing instruction',
    );
    expect(N([L('bank', 'Dr'), L('dividendReceived', 'Cr')], 'The bank collected a dividend of ₹6,600 and credited it to the account.')).toBe(
      'Being dividend collected by the bank',
    );
    expect(N([L('bank', 'Dr'), L('debtor:Kiran', 'Cr')], 'Kiran, a customer, paid ₹3,000 directly into the firm’s bank account.')).toBe(
      'Being amount paid by Kiran directly into the bank',
    );
  });

  it('says a rectifying entry puts an error right, never the transaction it looks like', () => {
    // A reversed entry is put right at twice its amount: it is no payment of rent.
    expect(N([L('rent', 'Dr', 24000), L('cash', 'Cr', 24000)], '₹12,000 paid in cash as rent was recorded by debiting Cash A/c and crediting Rent A/c.')).toBe(
      'Being error rectified',
    );
    expect(N([L('debtor:Mohan', 'Dr'), L('bank', 'Cr')], 'A cheque from Mohan was entered twice on the receipts side of the bank column.')).toBe('Being error rectified');
    expect(N([L('suspense', 'Dr'), L('creditor:Ravi', 'Cr')])).toBe('Being error rectified');
    expect(N([L('machinery', 'Dr'), L('wages', 'Cr')], 'Wages paid for installing a new machine were debited to Wages A/c.')).toBe('Being error rectified');
    // A transaction left out of the books is recorded as it is.
    expect(N([L('cash', 'Dr'), L('commissionReceived', 'Cr')], 'Commission of ₹3,500 received in cash was not recorded in any book.')).toBe(
      'Being commission received in cash, omitted earlier, now recorded',
    );
    // Words that only may tell of an error do not make an ordinary adjustment one.
    expect(N([L('prepaidExpenses', 'Dr'), L('insurance', 'Cr')], 'Insurance premium paid for twelve months was debited to Insurance A/c in full.')).toBe(
      'Being insurance premium paid in advance',
    );
  });

  it('says the entries of a firm', () => {
    expect(N([L('interestOnCapital', 'Dr', 300), L('capital:Asha', 'Cr', 200), L('capital:Bina', 'Cr', 100)])).toBe('Being interest on capital allowed');
    expect(N([L('capital:Asha', 'Dr'), L('interestOnDrawings', 'Cr')])).toBe('Being interest on drawings charged');
    expect(N([L('partnersSalary', 'Dr'), L('current:Asha', 'Cr')])).toBe('Being salary allowed to Asha');
    expect(N([L('generalReserve', 'Dr', 200), L('capital:Asha', 'Cr'), L('capital:Bina', 'Cr')])).toBe('Being general reserve distributed among the partners');
    expect(N([L('revaluation', 'Dr', 200), L('capital:Asha', 'Cr'), L('capital:Bina', 'Cr')])).toBe(
      "Being profit on revaluation transferred to the partners' capital accounts",
    );
    expect(N([L('revaluation', 'Dr'), L('stock', 'Cr')])).toBe('Being decrease in the value of stock on revaluation');
    expect(N([L('capital:Asha', 'Dr'), L('capital:Bina', 'Dr'), L('goodwill', 'Cr', 200)])).toBe('Being goodwill written off among the partners');
    expect(N([L('capital:Divya', 'Dr'), L('executor:Divya', 'Cr')])).toBe("Being the amount due to Divya transferred to Divya's Executor's A/c");
    expect(N([L('profitAndLossSuspense', 'Dr'), L('capital:Farid', 'Cr')], 'Credit Farid with the share of profit up to the date of death.')).toBe(
      "Being Farid's share of profit up to the date of death",
    );
    expect(N([L('capital:Tarun', 'Dr'), L('realisation', 'Cr')], 'Tarun took them over at ₹5,500.')).toBe('Being asset taken over by Tarun');
  });

  it('says the entries of a company', () => {
    expect(N([L('bank', 'Dr'), L('equityShareApplication', 'Cr')])).toBe('Being application money received on equity shares');
    expect(
      N([L('equityShareCapital', 'Dr', 400), L('forfeitedShares', 'Cr', 100), L('equityShareAllotment', 'Cr', 200), L('equityShareFirstCall', 'Cr', 100)]),
    ).toBe('Being equity shares forfeited for non-payment of allotment and first call money');
    expect(N([L('bank', 'Dr', 70), L('forfeitedShares', 'Dr', 30), L('equityShareCapital', 'Cr', 100)])).toBe('Being forfeited equity shares reissued');
    expect(N([L('debentureApplicationAndAllotment', 'Dr', 96), L('discountOnIssueOfDebentures', 'Dr', 4), L('debentures:9', 'Cr', 100)])).toBe(
      'Being debentures allotted, issued at a discount',
    );
    expect(N([L('vendor:Mehta Brothers', 'Dr'), L('equityShareCapital', 'Cr')])).toBe(
      'Being equity shares issued to Mehta Brothers in payment of the purchase consideration',
    );
  });

  it('names an entry with GST by the goods, with GST', () => {
    expect(N([L('purchases', 'Dr'), L('inputCGST', 'Dr', 9), L('inputSGST', 'Dr', 9), L('creditor:Ravi', 'Cr', 118)])).toBe(
      'Being goods purchased on credit from Ravi, with GST',
    );
  });

  it('says any other entry by the accounts debited and credited', () => {
    expect(N([L('debtor:Ravi', 'Dr'), L('debtor:Mohan', 'Cr')])).toBe('Being Ravi debited and Mohan credited');
  });

  it('uses a narration the question gives, with "Being" before it', () => {
    expect(narrationFor([L('cash', 'Dr'), L('capital', 'Cr')], 'business started with cash')).toBe('Being business started with cash');
    expect(narrationFor([L('cash', 'Dr'), L('capital', 'Cr')], '(Being business started)')).toBe('Being business started');
  });
});

describe('the narration of every journal entry the templates make', () => {
  it('reads as a sentence: no word said twice running, no empty part', () => {
    for (const t of TEMPLATES) {
      for (const seed of [1, 2, 3]) {
        const q = generateQuestion(t.id, seed);
        const entries = q.type === 'journal_entry' ? [{ lines: q.expected, text: q.prompt }] : q.type === 'journal_set' ? q.entries.map((e) => ({ lines: e.expected, text: e.text })) : [];
        for (const e of entries) {
          const said = narrationFor(e.lines, undefined, e.text);
          expect(said, `${t.id} ${seed}`).toMatch(/^Being \S/);
          expect(said, `${t.id} ${seed}`).not.toMatch(/(\w+) /i);
          expect(said, `${t.id} ${seed}`).not.toMatch(/ ,|,,| {2}|undefined|null/);
        }
      }
    }
  });
});
