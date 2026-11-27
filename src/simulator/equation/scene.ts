import type { AccountGroup } from '../accounts';
import type { BandSpec, Scene } from '../scenes';
import { cr, dr, r } from './build';
import { EQUATION_EVENTS } from './events';
import { EQUATION_GENERATORS } from './generators';
import { EQUATION_MISTAKES } from './mistakes';
import { EQUATION_STORIES } from './stories';
import { STARTER } from './transactions';

// ---------------------------------------------------------------------------------------------------------------
// The accounting equation: three tanks, Assets = Liabilities + Capital, and a Suspense tank that appears when an
// error leaves the books one-sided. Incomes and expenses flow into the capital tank as the profit so far, drawings
// out of it. Goods bought for resale are stock (the journal debits Purchases A/c), and goods sold leave stock at cost.
// ---------------------------------------------------------------------------------------------------------------

const ids =
  (...list: string[]) =>
  (id: string) =>
    list.includes(id);
const group =
  (...list: AccountGroup[]) =>
  (_: string, g: AccountGroup) =>
    list.includes(g);

const band = (id: string, container: string, label: string, takes: BandSpec['takes'], extra: Partial<BandSpec> = {}): BandSpec => ({ id, container, label, takes, ...extra });

const BANDS: BandSpec[] = [
  // Assets, from the most liquid up.
  band('cash', 'assets', 'Cash', ids('cash', 'pettyCash')),
  band('bank', 'assets', 'Bank', ids('bank')),
  band('stock', 'assets', 'Stock', ids('stock', 'purchases', 'purchasesReturn')),
  band('debtors', 'assets', 'Debtors', (id) => id.startsWith('debtor:') || id === 'debtors'),
  band('billsReceivable', 'assets', 'Bills receivable', ids('billsReceivable')),
  band('furniture', 'assets', 'Furniture', ids('furniture')),
  band('machinery', 'assets', 'Machinery', ids('machinery')),
  band('fixed', 'assets', 'Other fixed assets', ids('land', 'building', 'vehicles', 'computers', 'officeEquipment', 'refrigerator', 'shopFittings', 'looseTools', 'goodwill', 'patents', 'investments')),
  band('prepaid', 'assets', 'Prepaid and accrued', ids('prepaidExpenses', 'prepaidRent', 'prepaidInsurance', 'accruedIncome', 'accruedCommission', 'accruedInterest', 'accruedRent')),
  band('provisions', 'assets', 'Less: provisions', group('contraAsset'), { mayBeNegative: true, deduction: true }),
  // Liabilities.
  band('creditors', 'liabilities', 'Creditors', (id) => id.startsWith('creditor:') || id === 'creditors'),
  band('billsPayable', 'liabilities', 'Bills payable', ids('billsPayable')),
  band('loans', 'liabilities', 'Loans', ids('bankLoan', 'loan', 'bankOverdraft')),
  band('outstanding', 'liabilities', 'Outstanding expenses', (id) => id === 'outstandingExpenses' || id.startsWith('outstanding')),
  band('advance', 'liabilities', 'Income received in advance', ids('incomeReceivedInAdvance', 'rentReceivedInAdvance')),
  // Capital: the proprietor's capital, the profit so far (incomes less expenses) and, taken out of it, drawings.
  band('capital', 'capital', 'Capital', group('capital')),
  band('profit', 'capital', 'Profit so far', (id, g) => g === 'income' || g === 'expense' || id === 'profitAndLoss' || id === 'trading', { mayBeNegative: true }),
  band('drawings', 'capital', 'Less: drawings', group('drawings'), { mayBeNegative: true, deduction: true }),
  // Suspense: only while an error has left the books one-sided.
  band('suspense', 'suspense', 'Suspense A/c', ids('suspense')),
  // Whatever else an entry names, by its group.
  band('otherAssets', 'assets', 'Other assets', (_, g) => g === 'asset' || g === 'temporary'),
  band('otherLiabilities', 'liabilities', 'Other liabilities', group('liability')),
];

/** The books of a small running shop, which a play starts from. */
const OPENING = [
  dr('cash', r(40000)),
  dr('bank', r(80000)),
  dr('stock', r(50000)),
  dr('debtors', r(30000)),
  dr('furniture', r(25000)),
  dr('machinery', r(60000)),
  cr('creditors', r(35000)),
  cr('bankLoan', r(50000)),
  cr('capital', r(200000)),
];

export const EQUATION_SCENE: Scene = {
  id: 'ae',
  title: 'The accounting equation',
  topicId: 'accounting-equation',
  concepts: { predict: 'ae-effects', mistake: 'ae-effects' },
  containers: [
    { id: 'assets', title: 'Assets', caption: 'What the business owns', side: 'left', hue: 'blue' },
    { id: 'liabilities', title: 'Liabilities', caption: 'What it owes to outsiders', side: 'right', hue: 'rose' },
    { id: 'capital', title: 'Capital', caption: "The proprietor's claim", side: 'right', hue: 'green' },
    { id: 'suspense', title: 'Suspense', caption: 'A difference waiting to be explained', side: 'either', hue: 'amber', transient: true },
  ],
  bands: BANDS,
  equation: { left: ['assets'], right: ['liabilities', 'capital'] },
  opening: { title: 'A small shop, already running', lines: OPENING },
  transactions: STARTER,
  generators: EQUATION_GENERATORS,
  stories: EQUATION_STORIES,
  events: EQUATION_EVENTS,
  mistakes: EQUATION_MISTAKES,
};
