import { describe, expect, it } from 'vitest';
import {
  CLASS11_ACCOUNTS,
  CLASS12_ACCOUNTS,
  LATER_CLASS11_ACCOUNTS,
  COMPANY_ACCOUNTS,
  CORE_ACCOUNTS,
  MORE_COMPANY_ACCOUNTS,
  MORE_PARTNERSHIP_ACCOUNTS,
  PARTNERSHIP_ACCOUNTS,
  creditor,
  debentures,
  debtor,
  executor,
  fillerAccounts,
  isParty,
  loanToPartner,
  normalSide,
  partnerCapital,
  partnerCurrent,
  partnerDrawings,
  partnerLoan,
  resolveAccount,
  vendor,
} from './accounts';
import { accountLabel, ledgerLabel } from './books';

describe('accounts', () => {
  it('has unique ids', () => {
    const ids = CLASS11_ACCOUNTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('resolves fixed and party accounts', () => {
    expect(resolveAccount('cash').type).toBe('asset');
    expect(resolveAccount(debtor('Mohan'))).toEqual({ id: 'debtor:Mohan', name: 'Mohan', type: 'asset' });
    expect(resolveAccount(creditor('Rao & Co.')).type).toBe('liability');
  });
  it('throws for an unknown account', () => {
    expect(() => resolveAccount('nope')).toThrow('Unknown account: nope');
  });
  it('gives the side on which each account increases', () => {
    expect(normalSide(resolveAccount('furniture'))).toBe('Dr');
    expect(normalSide(resolveAccount('rent'))).toBe('Dr');
    expect(normalSide(resolveAccount('capital'))).toBe('Cr');
    expect(normalSide(resolveAccount('sales'))).toBe('Cr');
    expect(normalSide(resolveAccount('drawings'))).toBe('Dr');
    expect(normalSide(resolveAccount('purchasesReturn'))).toBe('Cr');
    expect(normalSide(resolveAccount('salesReturn'))).toBe('Dr');
  });
  it('gives the side of the newer accounts, contra-assets included', () => {
    expect(normalSide(resolveAccount('provisionForDepreciation'))).toBe('Cr');
    expect(normalSide(resolveAccount('provisionForDoubtfulDebts'))).toBe('Cr');
    expect(normalSide(resolveAccount('land'))).toBe('Dr');
    expect(normalSide(resolveAccount('bankOverdraft'))).toBe('Cr');
    expect(normalSide(resolveAccount('generalReserve'))).toBe('Cr');
    expect(normalSide(resolveAccount('profitOnSaleOfAsset'))).toBe('Cr');
    expect(normalSide(resolveAccount('lossByFire'))).toBe('Dr');
    expect(normalSide(resolveAccount('suspense'))).toBe('Dr');
  });
  it('keeps the first twenty-four ids and order, and says what every contra account reduces', () => {
    expect(CORE_ACCOUNTS.map((a) => a.id).slice(0, 4)).toEqual(['cash', 'bank', 'furniture', 'machinery']);
    expect(CORE_ACCOUNTS).toHaveLength(24);
    expect(CLASS11_ACCOUNTS.slice(0, 24)).toEqual(CORE_ACCOUNTS);
    for (const a of CLASS11_ACCOUNTS) expect(Boolean(a.contra) === (a.reduces !== undefined), a.id).toBe(true);
    expect(CLASS11_ACCOUNTS.filter((a) => a.temporary).map((a) => a.id)).toEqual([
      'suspense',
      'assetDisposal',
      'profitAndLoss',
      'trading',
    ]);
  });
  it('lists the Class 11 accounts in an order that never changes', () => {
    // The filler choices of every Class 11 entry are drawn from this list by its order: see fillerAccounts.
    expect(CLASS11_ACCOUNTS).toHaveLength(84);
    expect(CLASS11_ACCOUNTS.at(-1)!.id).toBe('trading');
    expect(fillerAccounts('class11')).toBe(CLASS11_ACCOUNTS);
  });
});

describe('the accounts added to Class 11 later', () => {
  it('resolve like any account, but are never offered as a filler choice or drawn by a generator from the chart', () => {
    expect(LATER_CLASS11_ACCOUNTS.map((a) => a.id)).toEqual(['staffWelfare', 'managersCommission', 'outstandingManagersCommission', 'provisionForDiscountOnDebtors']);
    for (const a of LATER_CLASS11_ACCOUNTS) {
      expect(resolveAccount(a.id), a.id).toBe(a);
      expect(CLASS11_ACCOUNTS.some((x) => x.id === a.id), a.id).toBe(false);
      expect(fillerAccounts('class11').some((x) => x.id === a.id), a.id).toBe(false);
      expect(CLASS12_ACCOUNTS.some((x) => x.id === a.id), a.id).toBe(false);
    }
    expect(resolveAccount('staffWelfare')).toMatchObject({ name: 'Staff Welfare Expenses', type: 'expense' });
    expect(normalSide(resolveAccount('staffWelfare'))).toBe('Dr');
  });
});

describe('the accounts of Class 12', () => {
  it('have ids and names no other account has, in either class', () => {
    const all = [...CLASS11_ACCOUNTS, ...LATER_CLASS11_ACCOUNTS, ...CLASS12_ACCOUNTS];
    expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
    expect(new Set(all.map((a) => a.name)).size).toBe(all.length);
    expect(CLASS12_ACCOUNTS).toEqual([...PARTNERSHIP_ACCOUNTS, ...COMPANY_ACCOUNTS, ...MORE_PARTNERSHIP_ACCOUNTS, ...MORE_COMPANY_ACCOUNTS]);
    for (const a of CLASS12_ACCOUNTS) {
      expect(a.id, a.id).toMatch(/^[a-z][A-Za-z]+$/);
      expect(resolveAccount(a.id), a.id).toBe(a);
      expect(Boolean(a.contra) === (a.reduces !== undefined), a.id).toBe(true);
    }
  });

  it('are never among the Class 11 accounts, so a Class 11 entry is never offered one', () => {
    const class11 = new Set(CLASS11_ACCOUNTS.map((a) => a.id));
    for (const a of CLASS12_ACCOUNTS) expect(class11.has(a.id), a.id).toBe(false);
  });

  it('has every account of a firm the plan names', () => {
    const wanted = [
      'profitAndLossAppropriation',
      'revaluation',
      'realisation',
      'premiumForGoodwill',
      'workmenCompensationReserve',
      'investmentFluctuationReserve',
      'partnersSalary',
      'partnersCommission',
      'interestOnPartnersLoan',
      'advertisementSuspense',
      'deferredRevenueExpenditure',
    ];
    for (const id of wanted) expect(PARTNERSHIP_ACCOUNTS.some((a) => a.id === id), id).toBe(true);
    // These were in the Class 11 chart already and are used as they are.
    const shared = ['profitAndLoss', 'stock', 'investments', 'provisionForDoubtfulDebts', 'generalReserve', 'goodwill', 'interestOnCapital', 'interestOnDrawings', 'bankLoan'];
    for (const id of shared) expect(CLASS11_ACCOUNTS.some((a) => a.id === id), id).toBe(true);
    expect(resolveAccount('revaluation').temporary).toBeDefined();
    expect(resolveAccount('realisation').temporary).toBeDefined();
    expect(normalSide(resolveAccount('workmenCompensationReserve'))).toBe('Cr');
    expect(normalSide(resolveAccount('interestOnPartnersLoan'))).toBe('Dr');
    expect(normalSide(resolveAccount('advertisementSuspense'))).toBe('Dr');
  });

  it('has every account of a company the plan names', () => {
    const names = Object.fromEntries(COMPANY_ACCOUNTS.map((a) => [a.id, a.name]));
    expect(names).toMatchObject({
      equityShareCapital: 'Equity Share Capital',
      preferenceShareCapital: 'Preference Share Capital',
      equityShareApplication: 'Equity Share Application',
      equityShareAllotment: 'Equity Share Allotment',
      equityShareFirstCall: 'Equity Share First Call',
      equityShareSecondAndFinalCall: 'Equity Share Second and Final Call',
      equityShareFirstAndFinalCall: 'Equity Share First and Final Call',
      preferenceShareAllotment: 'Preference Share Allotment',
      callsInArrears: 'Calls in Arrears',
      callsInAdvance: 'Calls in Advance',
      securitiesPremium: 'Securities Premium',
      forfeitedShares: 'Forfeited Shares',
      capitalReserve: 'Capital Reserve',
      debentureApplicationAndAllotment: 'Debenture Application and Allotment',
      discountOnIssueOfDebentures: 'Discount on Issue of Debentures',
      lossOnIssueOfDebentures: 'Loss on Issue of Debentures',
      premiumOnRedemptionOfDebentures: 'Premium on Redemption of Debentures',
      debentureInterest: 'Debenture Interest',
      debentureholders: 'Debentureholders',
      statementOfProfitAndLoss: 'Statement of Profit and Loss',
    });
    expect(normalSide(resolveAccount('callsInArrears'))).toBe('Dr');
    expect(normalSide(resolveAccount('callsInAdvance'))).toBe('Cr');
    expect(normalSide(resolveAccount('securitiesPremium'))).toBe('Cr');
    expect(normalSide(resolveAccount('lossOnIssueOfDebentures'))).toBe('Dr');
    expect(normalSide(resolveAccount('premiumOnRedemptionOfDebentures'))).toBe('Cr');
  });

  it("makes a partner's accounts from the partner's name", () => {
    expect(resolveAccount(partnerCapital('Asha'))).toMatchObject({ id: 'capital:Asha', name: "Asha's Capital", type: 'capital' });
    expect(resolveAccount(partnerCurrent('Asha'))).toMatchObject({ id: 'current:Asha', name: "Asha's Current", type: 'capital' });
    expect(resolveAccount(partnerDrawings('Asha'))).toMatchObject({ id: 'drawings:Asha', name: "Asha's Drawings", contra: true });
    expect(resolveAccount(partnerLoan('Asha'))).toMatchObject({ id: 'partnerLoan:Asha', name: "Asha's Loan", type: 'liability' });
    expect(resolveAccount(loanToPartner('Asha'))).toMatchObject({ id: 'loanTo:Asha', name: 'Loan to Asha', type: 'asset' });
    expect(resolveAccount(executor('Asha'))).toMatchObject({ id: 'executor:Asha', name: "Asha's Executor's", type: 'liability' });
    expect(normalSide(resolveAccount(partnerCapital('Asha')))).toBe('Cr');
    expect(normalSide(resolveAccount(partnerDrawings('Asha')))).toBe('Dr');
    expect(ledgerLabel(partnerCapital('Asha'))).toBe("Asha's Capital A/c");
    expect(accountLabel(partnerCurrent('Bimal'))).toBe("Bimal's Current A/c");
    expect(ledgerLabel(executor('Chitra'))).toBe("Chitra's Executor's A/c");
    // The same name in two families is two accounts with two names, so a picker can show both.
    const names = [partnerCapital, partnerCurrent, partnerDrawings, partnerLoan, loanToPartner, executor].map((of) => resolveAccount(of('Asha')).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes debentures of a rate, and a vendor by name', () => {
    expect(resolveAccount(debentures(9))).toEqual({ id: 'debentures:9', name: '9% Debentures', type: 'liability' });
    expect(ledgerLabel(debentures(7.5))).toBe('7.5% Debentures A/c');
    expect(resolveAccount(vendor('Sharma Ltd.'))).toEqual({ id: 'vendor:Sharma Ltd.', name: 'Sharma Ltd.', type: 'liability', party: true });
    // A vendor is written like a creditor: by name alone.
    expect(accountLabel(vendor('Sharma Ltd.'))).toBe('Sharma Ltd.');
    expect(accountLabel(creditor('Rao & Co.'))).toBe('Rao & Co.');
    expect(accountLabel(debtor('Mohan'))).toBe('Mohan');
    expect([vendor('X'), debtor('X'), creditor('X'), partnerCapital('X'), 'cash'].map(isParty)).toEqual([true, true, true, false, false]);
  });

  it('knows no family it was not given, and no member without a name', () => {
    expect(() => resolveAccount('partner:Asha')).toThrow('Unknown account: partner:Asha');
    expect(() => resolveAccount('capital:')).toThrow('Unknown account: capital:');
    expect(() => resolveAccount('debentures: ')).toThrow();
  });

  it('has the accounts added for a partner who retires or dies, which an entry names and no entry is offered as a filler', () => {
    expect(MORE_PARTNERSHIP_ACCOUNTS.map((a) => [a.id, a.name])).toEqual([['profitAndLossSuspense', 'Profit and Loss Suspense'], ['interestOnLoan', 'Interest on Loan']]);
    expect(resolveAccount('profitAndLossSuspense').temporary).toBeDefined();
    expect(normalSide(resolveAccount('interestOnLoan'))).toBe('Dr');
    expect(ledgerLabel('profitAndLossSuspense')).toBe('Profit and Loss Suspense A/c');
    // Adding an account to the chart must move no question a seed already makes: the lists fillers are drawn from
    // are as long as they were.
    for (const group of ['partnership', 'company'] as const) {
      expect(fillerAccounts(group).some((a) => MORE_PARTNERSHIP_ACCOUNTS.includes(a) || MORE_COMPANY_ACCOUNTS.includes(a)), group).toBe(false);
    }
    expect(fillerAccounts('partnership')).toHaveLength(PARTNERSHIP_ACCOUNTS.length + 19);
    expect(PARTNERSHIP_ACCOUNTS).toHaveLength(15);
  });

  it('has the accounts added for a company in the same way: preference shares in one account, and debentures given as security', () => {
    expect(MORE_COMPANY_ACCOUNTS.map((a) => [a.id, a.name])).toEqual([
      ['preferenceShareApplicationAndAllotment', 'Preference Share Application and Allotment'],
      ['debentureSuspense', 'Debenture Suspense'],
    ]);
    for (const a of MORE_COMPANY_ACCOUNTS) expect(a.temporary, a.id).toBeDefined();
    expect(ledgerLabel('debentureSuspense')).toBe('Debenture Suspense A/c');
    expect(fillerAccounts('company')).toHaveLength(COMPANY_ACCOUNTS.length + 14);
    expect(COMPANY_ACCOUNTS).toHaveLength(27);
  });

  it('offers an entry of Class 12 the accounts of its own chart beside a few of Class 11', () => {
    const ids = (group: 'partnership' | 'company') => fillerAccounts(group).map((a) => a.id);
    expect(ids('partnership').slice(0, PARTNERSHIP_ACCOUNTS.length)).toEqual(PARTNERSHIP_ACCOUNTS.map((a) => a.id));
    expect(ids('company').slice(0, COMPANY_ACCOUNTS.length)).toEqual(COMPANY_ACCOUNTS.map((a) => a.id));
    // A firm is never offered share capital, nor a company a partner's account.
    expect(ids('partnership').some((id) => COMPANY_ACCOUNTS.some((a) => a.id === id))).toBe(false);
    expect(ids('company').some((id) => PARTNERSHIP_ACCOUNTS.some((a) => a.id === id))).toBe(false);
    for (const group of ['partnership', 'company'] as const) {
      expect(new Set(ids(group)).size, group).toBe(ids(group).length);
      for (const id of ids(group)) expect(() => resolveAccount(id), id).not.toThrow();
    }
  });
});
