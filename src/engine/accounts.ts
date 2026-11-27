export type AccountType = 'asset' | 'liability' | 'capital' | 'income' | 'expense';
export type Side = 'Dr' | 'Cr';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** A contra account reduces its type, so it increases on the opposite side. */
  contra?: true;
  /** What a contra account reduces, as the end of "reduces ...": "capital", "the value of fixed assets". */
  reduces?: string;
  /**
   * For a temporary account (Suspense, Asset Disposal) that can be debited or credited: what it is, as the end of
   * "<name> A/c is ...". Such an account has no side on which it "increases", so explanations do not say so.
   */
  temporary?: string;
  /**
   * What the account is, as the end of "<name> A/c ...", where the usual words for its type ("is a liability") say
   * too little: "is a partner's capital in the firm". Explanations use it in place of those words.
   */
  nature?: string;
  /** A party written by its name alone, without "A/c": the vendor of a business (and so are debtors and creditors). */
  party?: true;
}

const acc =(id: string, name: string, type: AccountType): Account => ({ id, name, type });
const contraAcc = (id: string, name: string, type: AccountType, reduces: string): Account => ({
  id,
  name,
  type,
  contra: true,
  reduces,
});
const temporaryAcc = (id: string, name: string, temporary: string): Account => ({ id, name, type: 'asset', temporary });

/**
 * The first accounts of the chart. Journal templates written with a transaction pick their distractor accounts from
 * these only, which keeps the questions of existing seeds exactly as they were.
 */
export const CORE_ACCOUNTS: Account[] = [
  acc('cash', 'Cash', 'asset'),
  acc('bank', 'Bank', 'asset'),
  acc('furniture', 'Furniture', 'asset'),
  acc('machinery', 'Machinery', 'asset'),
  acc('inputCGST', 'Input CGST', 'asset'),
  acc('inputSGST', 'Input SGST', 'asset'),
  acc('inputIGST', 'Input IGST', 'asset'),
  acc('outputCGST', 'Output CGST', 'liability'),
  acc('outputSGST', 'Output SGST', 'liability'),
  acc('outputIGST', 'Output IGST', 'liability'),
  acc('capital', 'Capital', 'capital'),
  contraAcc('drawings', 'Drawings', 'capital', 'capital'),
  acc('purchases', 'Purchases', 'expense'),
  contraAcc('purchasesReturn', 'Purchases Return', 'expense', 'purchases'),
  acc('sales', 'Sales', 'income'),
  contraAcc('salesReturn', 'Sales Return', 'income', 'sales'),
  acc('rent', 'Rent', 'expense'),
  acc('salaries', 'Salaries', 'expense'),
  acc('wages', 'Wages', 'expense'),
  acc('stationery', 'Stationery', 'expense'),
  acc('discountAllowed', 'Discount Allowed', 'expense'),
  acc('discountReceived', 'Discount Received', 'income'),
  acc('commissionReceived', 'Commission Received', 'income'),
  acc('interestReceived', 'Interest Received', 'income'),
];

/** The rest of the Class 11 chart, after the core accounts so that their order never changes. */
const MORE_ACCOUNTS: Account[] = [
  // Assets
  acc('land', 'Land', 'asset'),
  acc('building', 'Building', 'asset'),
  acc('vehicles', 'Vehicles', 'asset'),
  acc('computers', 'Computers', 'asset'),
  acc('officeEquipment', 'Office Equipment', 'asset'),
  acc('investments', 'Investments', 'asset'),
  acc('stock', 'Stock', 'asset'),
  acc('billsReceivable', 'Bills Receivable', 'asset'),
  acc('prepaidExpenses', 'Prepaid Expenses', 'asset'),
  acc('accruedIncome', 'Accrued Income', 'asset'),
  acc('pettyCash', 'Petty Cash', 'asset'),
  acc('looseTools', 'Loose Tools', 'asset'),
  acc('goodwill', 'Goodwill', 'asset'),
  acc('patents', 'Patents', 'asset'),
  acc('insuranceClaimReceivable', 'Insurance Claim Receivable', 'asset'),
  // Contra-assets
  contraAcc('provisionForDepreciation', 'Provision for Depreciation', 'asset', 'the value of fixed assets'),
  contraAcc('provisionForDoubtfulDebts', 'Provision for Doubtful Debts', 'asset', 'the value of debtors'),
  // Liabilities
  acc('bankLoan', 'Bank Loan', 'liability'),
  acc('loan', 'Loan', 'liability'),
  acc('billsPayable', 'Bills Payable', 'liability'),
  acc('outstandingExpenses', 'Outstanding Expenses', 'liability'),
  acc('incomeReceivedInAdvance', 'Income Received in Advance', 'liability'),
  acc('bankOverdraft', 'Bank Overdraft', 'liability'),
  // Capital
  acc('generalReserve', 'General Reserve', 'capital'),
  // Incomes
  acc('rentReceived', 'Rent Received', 'income'),
  acc('dividendReceived', 'Dividend Received', 'income'),
  acc('badDebtsRecovered', 'Bad Debts Recovered', 'income'),
  acc('profitOnSaleOfAsset', 'Profit on Sale of Asset', 'income'),
  acc('miscellaneousIncome', 'Miscellaneous Income', 'income'),
  acc('interestOnDrawings', 'Interest on Drawings', 'income'),
  // Expenses
  acc('carriageInwards', 'Carriage Inwards', 'expense'),
  acc('carriageOutwards', 'Carriage Outwards', 'expense'),
  acc('freight', 'Freight', 'expense'),
  acc('powerAndFuel', 'Power and Fuel', 'expense'),
  acc('manufacturingExpenses', 'Manufacturing Expenses', 'expense'),
  acc('insurance', 'Insurance', 'expense'),
  acc('electricity', 'Electricity', 'expense'),
  acc('telephone', 'Telephone', 'expense'),
  acc('advertisement', 'Advertisement', 'expense'),
  acc('repairs', 'Repairs', 'expense'),
  acc('postage', 'Postage', 'expense'),
  acc('travellingExpenses', 'Travelling Expenses', 'expense'),
  acc('bankCharges', 'Bank Charges', 'expense'),
  acc('interestPaid', 'Interest Paid', 'expense'),
  acc('commissionPaid', 'Commission Paid', 'expense'),
  acc('badDebts', 'Bad Debts', 'expense'),
  acc('depreciation', 'Depreciation', 'expense'),
  acc('lossByFire', 'Loss by Fire', 'expense'),
  acc('lossByTheft', 'Loss by Theft', 'expense'),
  acc('lossOnSaleOfAsset', 'Loss on Sale of Asset', 'expense'),
  acc('charity', 'Charity', 'expense'),
  acc('generalExpenses', 'General Expenses', 'expense'),
  acc('tradeExpenses', 'Trade Expenses', 'expense'),
  acc('legalCharges', 'Legal Charges', 'expense'),
  acc('auditFees', 'Audit Fees', 'expense'),
  acc('interestOnCapital', 'Interest on Capital', 'expense'),
  // Temporary accounts: asset-type, and either side is possible
  temporaryAcc('suspense', 'Suspense', 'a temporary account that holds a difference until the error behind it is found'),
  temporaryAcc(
    'assetDisposal',
    'Asset Disposal',
    'a temporary account that gathers the cost, depreciation and sale proceeds of an asset until it is closed',
  ),
  temporaryAcc(
    'profitAndLoss',
    'Profit and Loss',
    'a temporary account that gathers the expenses and incomes of the year until its balance is moved to capital',
  ),
  temporaryAcc(
    'trading',
    'Trading',
    'a temporary account that gathers the sales, purchases and direct expenses of the year until its balance is moved to Profit and Loss A/c',
  ),
];

export const CLASS11_ACCOUNTS: Account[] = [...CORE_ACCOUNTS, ...MORE_ACCOUNTS];

/**
 * Accounts of Class 11 added after its topic banks were written (for the check against the CBSE 2025-26 syllabus).
 * They are kept out of `CLASS11_ACCOUNTS`, which is the list every Class 11 entry draws its filler choices from and
 * several generators draw accounts from, so that adding one moves no question a seed already makes. An entry names
 * them like any other account; name them in `distractorAccounts` where they are a likely slip.
 */
export const LATER_CLASS11_ACCOUNTS: Account[] = [
  // Goods given to the staff for their welfare (a Diwali gift of goods, sweets from the shop at a festival).
  acc('staffWelfare', 'Staff Welfare Expenses', 'expense'),
  // The manager's commission as the board writes it (Manager's Commission A/c Dr; To Outstanding Manager's Commission
  // A/c), and the provision for discount on debtors (Profit and Loss A/c Dr; To Provision for Discount on Debtors A/c),
  // added for the final accounts with adjustments.
  acc('managersCommission', "Manager's Commission", 'expense'),
  acc('outstandingManagersCommission', "Outstanding Manager's Commission", 'liability'),
  contraAcc('provisionForDiscountOnDebtors', 'Provision for Discount on Debtors', 'asset', 'the value of debtors'),
];

// ---------------------------------------------------------------------------------------------------------------
// Class 12. These accounts are in lists of their own and never among the Class 11 ones, so a Class 11 question is
// never offered one of them as a choice, and what its seeds make stays exactly as it was.
// ---------------------------------------------------------------------------------------------------------------

const natured = (a: Account, nature: string): Account => ({ ...a, nature });
const RESERVE = 'is a reserve: profit that has been set aside';
const FICTITIOUS = 'is a loss or expense not yet written off, carried as a fictitious asset';

/** The accounts of a partnership firm that have one name in every firm. A partner's own accounts are families (below). */
export const PARTNERSHIP_ACCOUNTS: Account[] = [
  temporaryAcc(
    'profitAndLossAppropriation',
    'Profit and Loss Appropriation',
    "a temporary account that shares out the profit of the year: interest on capital, salary and commission first, then each partner's share",
  ),
  temporaryAcc(
    'revaluation',
    'Revaluation',
    'a temporary account that gathers the changes in the values of assets and liabilities when the firm is reconstituted, until its profit or loss goes to the old partners',
  ),
  temporaryAcc(
    'realisation',
    'Realisation',
    'a temporary account that gathers the assets sold and the liabilities paid when the firm is dissolved, until its profit or loss goes to the partners',
  ),
  temporaryAcc(
    'premiumForGoodwill',
    'Premium for Goodwill',
    'a temporary account that holds the goodwill a new partner brings in until it is given to the partners who sacrifice',
  ),
  natured(acc('workmenCompensationReserve', 'Workmen Compensation Reserve', 'capital'), RESERVE),
  natured(acc('investmentFluctuationReserve', 'Investment Fluctuation Reserve', 'capital'), RESERVE),
  natured(acc('partnersSalary', "Partner's Salary", 'expense'), 'is an appropriation of profit'),
  natured(acc('partnersCommission', "Partner's Commission", 'expense'), 'is an appropriation of profit'),
  natured(acc('interestOnPartnersLoan', "Interest on Partner's Loan", 'expense'), 'is a charge against profit'),
  natured(acc('advertisementSuspense', 'Advertisement Suspense', 'asset'), FICTITIOUS),
  natured(acc('deferredRevenueExpenditure', 'Deferred Revenue Expenditure', 'asset'), FICTITIOUS),
  acc('debtors', 'Debtors', 'asset'),
  acc('creditors', 'Creditors', 'liability'),
  acc('providentFund', "Employees' Provident Fund", 'liability'),
  acc('workmenCompensationClaim', 'Workmen Compensation Claim', 'liability'),
];

/**
 * Accounts of a firm that were added once the topic banks were being written. An entry names them like any other
 * account; they are never offered as a filler choice, so that adding one moves no question a seed already makes.
 */
export const MORE_PARTNERSHIP_ACCOUNTS: Account[] = [
  temporaryAcc(
    'profitAndLossSuspense',
    'Profit and Loss Suspense',
    "a temporary account that holds a partner's share of profit up to the date of death or retirement, until it is closed to Profit and Loss Appropriation A/c at the end of the year",
  ),
  natured(acc('interestOnLoan', 'Interest on Loan', 'expense'), 'is an expense: the cost of money the firm owes'),
];

const moneyDue = (what: string, kind: string) => `a temporary account that shows the ${what} money due on the ${kind} shares until it is received`;
const shareAccounts = (id: string, name: string, kind: string): Account[] => [
  natured(acc(`${id}ShareCapital`, `${name} Share Capital`, 'capital'), `is the capital the ${kind} shareholders have put into the company`),
  temporaryAcc(`${id}ShareApplication`, `${name} Share Application`, `a temporary account that holds the application money on the ${kind} shares until they are allotted`),
  temporaryAcc(`${id}ShareAllotment`, `${name} Share Allotment`, moneyDue('allotment', kind)),
  temporaryAcc(`${id}ShareFirstCall`, `${name} Share First Call`, moneyDue('first call', kind)),
  temporaryAcc(`${id}ShareSecondAndFinalCall`, `${name} Share Second and Final Call`, moneyDue('second and final call', kind)),
  temporaryAcc(`${id}ShareFirstAndFinalCall`, `${name} Share First and Final Call`, moneyDue('first and final call', kind)),
];

/** The accounts of a company that have one name in every company. Debentures of a rate and a vendor are families (below). */
export const COMPANY_ACCOUNTS: Account[] = [
  ...shareAccounts('equity', 'Equity', 'equity'),
  ...shareAccounts('preference', 'Preference', 'preference'),
  temporaryAcc(
    'equityShareApplicationAndAllotment',
    'Equity Share Application and Allotment',
    'a temporary account that holds the application and allotment money on the equity shares, where the two are kept together',
  ),
  contraAcc('callsInArrears', 'Calls in Arrears', 'capital', 'the paid-up share capital'),
  natured(acc('callsInAdvance', 'Calls in Advance', 'liability'), 'is a liability: money received on shares before it was called'),
  natured(acc('securitiesPremium', 'Securities Premium', 'capital'), 'is a reserve of the company: what shareholders paid above the face value'),
  natured(acc('forfeitedShares', 'Forfeited Shares', 'capital'), 'holds the money received on shares that were forfeited, and is part of share capital'),
  natured(acc('capitalReserve', 'Capital Reserve', 'capital'), 'is a reserve made out of a capital profit'),
  temporaryAcc('debentureApplication', 'Debenture Application', 'a temporary account that holds the application money on the debentures until they are allotted'),
  temporaryAcc('debentureAllotment', 'Debenture Allotment', 'a temporary account that shows the allotment money due on the debentures until it is received'),
  temporaryAcc(
    'debentureApplicationAndAllotment',
    'Debenture Application and Allotment',
    'a temporary account that holds the money received on the debentures until they are allotted',
  ),
  natured(acc('discountOnIssueOfDebentures', 'Discount on Issue of Debentures', 'asset'), 'is a loss on the issue, carried until it is written off'),
  natured(acc('lossOnIssueOfDebentures', 'Loss on Issue of Debentures', 'asset'), 'is a loss on the issue, carried until it is written off'),
  natured(
    acc('premiumOnRedemptionOfDebentures', 'Premium on Redemption of Debentures', 'liability'),
    'is a liability: the extra amount to be paid when the debentures are redeemed',
  ),
  acc('debentureInterest', 'Debenture Interest', 'expense'),
  natured(acc('debentureholders', 'Debentureholders', 'liability'), 'is a liability: what the company owes those who hold its debentures'),
  temporaryAcc('statementOfProfitAndLoss', 'Statement of Profit and Loss', 'the account that gathers the incomes and expenses of the company for the year'),
];

/** Accounts of a company added once the topic banks were being written: named by an entry, never offered as a filler. */
export const MORE_COMPANY_ACCOUNTS: Account[] = [
  temporaryAcc(
    'preferenceShareApplicationAndAllotment',
    'Preference Share Application and Allotment',
    'a temporary account that holds the application and allotment money on the preference shares, where the two are kept together',
  ),
  temporaryAcc(
    'debentureSuspense',
    'Debenture Suspense',
    'the account that stands against debentures given as collateral security, so that they are not counted as a debt while the loan is being repaid',
  ),
];

export const CLASS12_ACCOUNTS: Account[] = [...PARTNERSHIP_ACCOUNTS, ...COMPANY_ACCOUNTS, ...MORE_PARTNERSHIP_ACCOUNTS, ...MORE_COMPANY_ACCOUNTS];

/**
 * Which chart an entry draws the accounts it merely offers (its filler choices) from: the Class 11 chart, or one of
 * the two Class 12 ones. `content/courses` says which a topic uses.
 */
export type AccountGroup = 'class11' | 'partnership' | 'company';

/** Accounts of the Class 11 chart that a Class 12 entry may well be offered beside those of its own chart. */
const SHARED_WITH: Record<Exclude<AccountGroup, 'class11'>, string[]> = {
  partnership: [
    'machinery', 'furniture', 'building', 'land', 'stock', 'investments', 'goodwill', 'generalReserve', 'profitAndLoss', 'loan', 'bankLoan',
    'interestOnCapital', 'interestOnDrawings', 'salaries', 'commissionPaid', 'outstandingExpenses', 'provisionForDoubtfulDebts', 'billsReceivable', 'billsPayable',
  ],
  company: ['machinery', 'building', 'land', 'furniture', 'stock', 'investments', 'goodwill', 'patents', 'generalReserve', 'profitAndLoss', 'bankLoan', 'loan', 'interestPaid', 'billsPayable'],
};

/**
 * The accounts an entry is offered beside its own, for the chart it belongs to. A Class 11 entry gets the Class 11
 * chart and nothing else, in the order it always had.
 */
export function fillerAccounts(group: AccountGroup): Account[] {
  if (group === 'class11') return CLASS11_ACCOUNTS;
  const shared = SHARED_WITH[group].map((id) => CLASS11_ACCOUNTS.find((a) => a.id === id)!);
  return [...(group === 'partnership' ? PARTNERSHIP_ACCOUNTS : COMPANY_ACCOUNTS), ...shared];
}

export const debtor = (name: string) => `debtor:${name}`;
export const creditor = (name: string) => `creditor:${name}`;

// A partner's own accounts, by the partner's name, as a debtor's account is by the debtor's: `partnerCapital('Asha')`
// is "Asha's Capital A/c". Give the name as the question writes it.
export const partnerCapital = (name: string) => `capital:${name}`;
/** A partner's current account, kept beside a fixed capital. */
export const partnerCurrent = (name: string) => `current:${name}`;
export const partnerDrawings = (name: string) => `drawings:${name}`;
/** A loan a partner (or a partner's relative) has given the firm: a liability of the firm. */
export const partnerLoan = (name: string) => `partnerLoan:${name}`;
/** A loan the firm has given a partner: an asset of the firm. */
export const loanToPartner = (name: string) => `loanTo:${name}`;
/** The account of the executor of a partner who has died: what the firm owes on the partner's death. */
export const executor = (name: string) => `executor:${name}`;
/** The vendor a company buys a business or an asset from, written by name alone like a creditor. */
export const vendor = (name: string) => `vendor:${name}`;
/** Debentures of a rate of interest: `debentures(9)` is "9% Debentures A/c". */
export const debentures = (rate: number) => `debentures:${rate}`;

/** The Class 12 families of accounts made from a name (or a rate): the id is `<family>:<name>`. */
const FAMILIES: Record<string, (id: string, name: string) => Account> = {
  capital: (id, name) => ({ id, name: `${name}'s Capital`, type: 'capital', nature: "is a partner's capital in the firm" }),
  current: (id, name) => ({ id, name: `${name}'s Current`, type: 'capital', nature: "is a partner's running account with the firm, kept beside a fixed capital" }),
  drawings: (id, name) => ({ id, name: `${name}'s Drawings`, type: 'capital', contra: true, reduces: 'what the firm owes the partner' }),
  partnerLoan: (id, name) => ({ id, name: `${name}'s Loan`, type: 'liability', nature: 'is a loan given to the firm, which the firm owes' }),
  loanTo: (id, name) => ({ id, name: `Loan to ${name}`, type: 'asset', nature: 'is a loan the firm has given, which is owed to the firm' }),
  executor: (id, name) => ({ id, name: `${name}'s Executor's`, type: 'liability', nature: 'shows what the firm owes the executor of a partner who has died' }),
  vendor: (id, name) => ({ id, name, type: 'liability', party: true }),
  debentures: (id, rate) => ({ id, name: `${rate}% Debentures`, type: 'liability' }),
};

const FIXED: ReadonlyMap<string, Account> = new Map([...CLASS11_ACCOUNTS, ...LATER_CLASS11_ACCOUNTS, ...CLASS12_ACCOUNTS].map((a) => [a.id, a]));

export function resolveAccount(id: string): Account {
  if (id.startsWith('debtor:')) return { id, name: id.slice(7), type: 'asset' };
  if (id.startsWith('creditor:')) return { id, name: id.slice(9), type: 'liability' };
  const colon = id.indexOf(':');
  if (colon > 0) {
    const family = id.slice(0, colon);
    const name = id.slice(colon + 1);
    if (Object.hasOwn(FAMILIES, family) && name.trim() !== '') return FAMILIES[family](id, name);
  }
  const found = FIXED.get(id);
  if (!found) throw new Error(`Unknown account: ${id}`);
  return found;
}

/** True for a party, whose account is written by the party's name alone: a debtor, a creditor, a vendor. */
export const isParty = (id: string): boolean => id.startsWith('debtor:') || id.startsWith('creditor:') || id.startsWith('vendor:');

/** The side on which an account increases. A temporary account (Suspense) can sit on either side; Dr is its usual one. */
export function normalSide(a: Account): Side {
  const base: Side = a.type === 'asset' || a.type === 'expense' ? 'Dr' : 'Cr';
  if (!a.contra) return base;
  return base === 'Dr' ? 'Cr' : 'Dr';
}
