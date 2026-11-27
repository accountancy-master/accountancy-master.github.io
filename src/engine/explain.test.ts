import { describe, expect, it } from 'vitest';
import { explainEntry, explainLine } from './explain';

describe('explain', () => {
  it('explains an asset increasing', () => {
    expect(explainLine({ accountId: 'furniture', side: 'Dr', amount: 500000 })).toBe(
      'Furniture A/c is an asset. It increases, so it is debited with ₹5,000.',
    );
  });
  it('explains an asset decreasing', () => {
    expect(explainLine({ accountId: 'cash', side: 'Cr', amount: 500000 })).toBe(
      'Cash A/c is an asset. It decreases, so it is credited with ₹5,000.',
    );
  });
  it('names the contra account and what it reduces', () => {
    expect(explainLine({ accountId: 'drawings', side: 'Dr', amount: 100000 })).toBe(
      'Drawings A/c reduces capital. Drawings A/c increases, so it is debited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'purchasesReturn', side: 'Cr', amount: 100000 })).toBe(
      'Purchases Return A/c reduces purchases. Purchases Return A/c increases, so it is credited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'salesReturn', side: 'Dr', amount: 100000 })).toBe(
      'Sales Return A/c reduces sales. Sales Return A/c increases, so it is debited with ₹1,000.',
    );
  });
  it('explains the new contra-assets from what they reduce', () => {
    expect(explainLine({ accountId: 'provisionForDepreciation', side: 'Cr', amount: 100000 })).toBe(
      'Provision for Depreciation A/c reduces the value of fixed assets. Provision for Depreciation A/c increases, so it is credited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'provisionForDepreciation', side: 'Dr', amount: 100000 })).toBe(
      'Provision for Depreciation A/c reduces the value of fixed assets. Provision for Depreciation A/c decreases, so it is debited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'provisionForDoubtfulDebts', side: 'Cr', amount: 100000 })).toBe(
      'Provision for Doubtful Debts A/c reduces the value of debtors. Provision for Doubtful Debts A/c increases, so it is credited with ₹1,000.',
    );
  });
  it('explains a temporary account without saying which way it moves', () => {
    expect(explainLine({ accountId: 'suspense', side: 'Cr', amount: 100000 })).toBe(
      'Suspense A/c is a temporary account that holds a difference until the error behind it is found. It is credited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'assetDisposal', side: 'Dr', amount: 100000 })).toBe(
      'Asset Disposal A/c is a temporary account that gathers the cost, depreciation and sale proceeds of an asset until it is closed. It is debited with ₹1,000.',
    );
  });
  it('says whether a party is a debtor or a creditor', () => {
    expect(explainLine({ accountId: 'debtor:Mohan', side: 'Dr', amount: 100000 })).toBe(
      "Mohan is a debtor (an asset: Mohan owes the business). The amount owed increases, so Mohan's account is debited with ₹1,000.",
    );
    expect(explainLine({ accountId: 'creditor:Rao & Co.', side: 'Cr', amount: 100000 })).toBe(
      "Rao & Co. is a creditor (a liability: the business owes Rao & Co.). The amount owed increases, so Rao & Co.'s account is credited with ₹1,000.",
    );
  });
  it('explains a debtor paying and a creditor being paid', () => {
    expect(explainLine({ accountId: 'debtor:Mohan', side: 'Cr', amount: 100000 })).toBe(
      "Mohan is a debtor (an asset: Mohan owes the business). The amount owed decreases, so Mohan's account is credited with ₹1,000.",
    );
    expect(explainLine({ accountId: 'creditor:Rao & Co.', side: 'Dr', amount: 100000 })).toBe(
      "Rao & Co. is a creditor (a liability: the business owes Rao & Co.). The amount owed decreases, so Rao & Co.'s account is debited with ₹1,000.",
    );
  });
  it('explains capital without repeating the word', () => {
    expect(explainLine({ accountId: 'capital', side: 'Cr', amount: 100000 })).toBe(
      "Capital A/c is the owner's stake in the business. It increases, so it is credited with ₹1,000.",
    );
  });
  it('explains each line of an entry', () => {
    expect(
      explainEntry([
        { accountId: 'rent', side: 'Dr', amount: 100000 },
        { accountId: 'bank', side: 'Cr', amount: 100000 },
      ]),
    ).toEqual([
      'Rent A/c is an expense. It increases, so it is debited with ₹1,000.',
      'Bank A/c is an asset. It decreases, so it is credited with ₹1,000.',
    ]);
  });
  it("explains a partner's accounts by what they are", () => {
    expect(explainLine({ accountId: 'capital:Asha', side: 'Cr', amount: 100000 })).toBe(
      "Asha's Capital A/c is a partner's capital in the firm. It increases, so it is credited with ₹1,000.",
    );
    expect(explainLine({ accountId: 'drawings:Asha', side: 'Dr', amount: 100000 })).toBe(
      "Asha's Drawings A/c reduces what the firm owes the partner. Asha's Drawings A/c increases, so it is debited with ₹1,000.",
    );
    expect(explainLine({ accountId: 'partnerLoan:Asha', side: 'Cr', amount: 100000 })).toBe(
      "Asha's Loan A/c is a loan given to the firm, which the firm owes. It increases, so it is credited with ₹1,000.",
    );
    expect(explainLine({ accountId: 'executor:Asha', side: 'Cr', amount: 100000 })).toBe(
      "Asha's Executor's A/c shows what the firm owes the executor of a partner who has died. It increases, so it is credited with ₹1,000.",
    );
  });
  it('explains the temporary accounts of Class 12 without saying which way they move', () => {
    expect(explainLine({ accountId: 'revaluation', side: 'Dr', amount: 100000 })).toBe(
      'Revaluation A/c is a temporary account that gathers the changes in the values of assets and liabilities when the firm is reconstituted, until its profit or loss goes to the old partners. It is debited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'equityShareAllotment', side: 'Dr', amount: 100000 })).toBe(
      'Equity Share Allotment A/c is a temporary account that shows the allotment money due on the equity shares until it is received. It is debited with ₹1,000.',
    );
  });
  it('explains the interest on a loan of a retired partner and the share of profit of a partner who has died', () => {
    expect(explainLine({ accountId: 'interestOnLoan', side: 'Dr', amount: 100000 })).toBe(
      'Interest on Loan A/c is an expense: the cost of money the firm owes. It increases, so it is debited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'profitAndLossSuspense', side: 'Dr', amount: 100000 })).toBe(
      "Profit and Loss Suspense A/c is a temporary account that holds a partner's share of profit up to the date of death or retirement, until it is closed to Profit and Loss Appropriation A/c at the end of the year. It is debited with ₹1,000.",
    );
  });
  it('explains the accounts of a company, a vendor and debentures of a rate', () => {
    expect(explainLine({ accountId: 'securitiesPremium', side: 'Cr', amount: 100000 })).toBe(
      'Securities Premium A/c is a reserve of the company: what shareholders paid above the face value. It increases, so it is credited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'callsInArrears', side: 'Dr', amount: 100000 })).toBe(
      'Calls in Arrears A/c reduces the paid-up share capital. Calls in Arrears A/c increases, so it is debited with ₹1,000.',
    );
    expect(explainLine({ accountId: 'debentures:9', side: 'Cr', amount: 100000 })).toBe('9% Debentures A/c is a liability. It increases, so it is credited with ₹1,000.');
    expect(explainLine({ accountId: 'vendor:Sharma Ltd.', side: 'Cr', amount: 100000 })).toBe(
      "Sharma Ltd. is the vendor (a liability: the company owes Sharma Ltd. for what it bought). The amount owed increases, so Sharma Ltd.'s account is credited with ₹1,000.",
    );
  });
});
