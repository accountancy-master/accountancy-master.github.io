import { creditor, debtor } from '@/engine/accounts';
import { formatINR } from '@/engine/money';
import type { FreePlayEvent } from '../scenes';
import type { JournalLine, Paise, SimTransaction } from '../types';
import { cr, dr } from './build';

// Free play: what can happen in a small shop, in plain words. The student picks an event, its options and the
// amount, and the simulator journalises it and plays it.

const SUPPLIER = 'Kiran';
const CUSTOMER = 'Lakshmi Stores';
const f = formatINR;

let made = 0;
/** A transaction of free play. Each gets an id of its own, since the student can make the same one twice. */
const free = (kind: string, text: string, lines: JournalLine[], extra: Partial<SimTransaction> = {}): SimTransaction => ({
  id: `f.${++made}`,
  kind,
  text,
  lines,
  ...extra,
});

const MONEY = [
  { id: 'cash', label: 'Cash' },
  { id: 'bank', label: 'Bank (cheque)' },
];
const PAY = [...MONEY, { id: 'credit', label: 'On credit' }];
const word = (how: string) => (how === 'cash' ? 'in cash' : how === 'bank' ? 'by cheque' : 'on credit');

const needs = (amount: Paise | undefined, what = 'an amount'): { problem: string } | null =>
  amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? { problem: `Enter ${what} above nothing.` } : null;

const ASSETS: Record<string, string> = { furniture: 'Furniture', machinery: 'A machine', computers: 'A computer' };
const ASSET_ACCOUNT: Record<string, string> = { furniture: 'furniture', machinery: 'machinery', computers: 'computers' };
const EXPENSES: Record<string, { label: string; account: string; outstanding: string; plural?: true }> = {
  rent: { label: 'Shop rent', account: 'rent', outstanding: 'outstandingRent' },
  salaries: { label: 'Salaries', account: 'salaries', outstanding: 'outstandingSalaries', plural: true },
  wages: { label: 'Wages', account: 'wages', outstanding: 'outstandingWages', plural: true },
  electricity: { label: 'Electricity charges', account: 'electricity', outstanding: 'outstandingElectricity', plural: true },
  advertisement: { label: 'Advertisement charges', account: 'advertisement', outstanding: 'outstandingExpenses', plural: true },
};
const INCOMES: Record<string, { label: string; account: string; accrued: string }> = {
  commission: { label: 'Commission', account: 'commissionReceived', accrued: 'accruedCommission' },
  interest: { label: 'Interest', account: 'interestReceived', accrued: 'accruedInterest' },
  rent: { label: 'Rent from a sub-tenant', account: 'rentReceived', accrued: 'accruedRent' },
};
const options = (o: Record<string, { label: string } | string>) => Object.entries(o).map(([id, v]) => ({ id, label: typeof v === 'string' ? v : v.label }));

export const EQUATION_EVENTS: FreePlayEvent[] = [
  {
    id: 'capital',
    title: 'The proprietor brings in capital',
    choices: [{ id: 'into', label: 'Brought in as', options: MONEY }],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 50000 }],
    make: (c, a) =>
      needs(a.amount) ?? free('Capital introduced', `The proprietor brought ${f(a.amount)} into the business as capital, ${c.into === 'bank' ? 'paid into its bank account' : 'in cash'}.`, [dr(c.into, a.amount), cr('capital', a.amount)], { narration: 'capital brought in' }),
  },
  {
    id: 'loan',
    title: 'Borrow from the bank',
    choices: [],
    amounts: [{ id: 'amount', label: 'Loan', defaultRupees: 40000 }],
    make: (_, a) => needs(a.amount) ?? free('Loan taken', `Took a bank loan of ${f(a.amount)}, credited to the business bank account.`, [dr('bank', a.amount), cr('bankLoan', a.amount)], { narration: 'loan taken' }),
  },
  {
    id: 'buy-asset',
    title: 'Buy an asset for the business',
    choices: [
      { id: 'asset', label: 'Asset', options: options(ASSETS) },
      { id: 'pay', label: 'Paid', options: PAY },
    ],
    amounts: [{ id: 'amount', label: 'Price', defaultRupees: 20000 }],
    make: (c, a) => {
      const bad = needs(a.amount, 'a price');
      if (bad) return bad;
      const what = ASSETS[c.asset].toLowerCase();
      const credit = c.pay === 'credit' ? creditor(SUPPLIER) : c.pay;
      const from = c.pay === 'credit' ? ` from ${SUPPLIER}` : '';
      return free(c.pay === 'credit' ? 'Asset bought on credit' : 'Asset bought', `Bought ${what} for ${f(a.amount)} ${word(c.pay)}${from}.`, [dr(ASSET_ACCOUNT[c.asset], a.amount), cr(credit, a.amount)], {
        narration: `${what} bought ${word(c.pay)}`,
      });
    },
  },
  {
    id: 'buy-goods',
    title: 'Buy goods to sell',
    choices: [{ id: 'pay', label: 'Paid', options: PAY }],
    amounts: [{ id: 'amount', label: 'Cost of the goods', defaultRupees: 25000 }],
    make: (c, a) =>
      needs(a.amount) ??
      free(c.pay === 'credit' ? 'Goods bought on credit' : 'Goods bought', `Bought goods for ${f(a.amount)} ${word(c.pay)}${c.pay === 'credit' ? ` from ${SUPPLIER}` : ''}.`, [dr('purchases', a.amount), cr(c.pay === 'credit' ? creditor(SUPPLIER) : c.pay, a.amount)], {
        narration: `goods bought ${word(c.pay)}`,
      }),
  },
  {
    id: 'sell-goods',
    title: 'Sell goods',
    choices: [{ id: 'paid', label: 'Received', options: PAY }],
    amounts: [
      { id: 'cost', label: 'Cost of the goods', defaultRupees: 10000 },
      { id: 'price', label: 'Selling price', defaultRupees: 13000 },
    ],
    make: (c, a) => {
      const bad = needs(a.cost, 'the cost') ?? needs(a.price, 'the selling price');
      if (bad) return bad;
      const debit = c.paid === 'credit' ? debtor(CUSTOMER) : c.paid;
      const to = c.paid === 'credit' ? ` to ${CUSTOMER}` : '';
      return free(c.paid === 'credit' ? 'Goods sold on credit' : 'Goods sold', `Sold goods costing ${f(a.cost)}${to} for ${f(a.price)} ${c.paid === 'bank' ? 'and received a cheque' : word(c.paid)}.`, [dr(debit, a.price), cr('sales', a.price)], {
        narration: `goods sold ${c.paid === 'cash' ? 'for cash' : c.paid === 'bank' ? 'against a cheque' : 'on credit'}`,
        costOfSale: a.cost,
      });
    },
  },
  {
    id: 'pay-expense',
    title: 'An expense of the business',
    choices: [
      { id: 'expense', label: 'Expense', options: options(EXPENSES) },
      { id: 'how', label: 'Paid', options: [...MONEY, { id: 'unpaid', label: 'Not yet paid' }] },
    ],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 6000 }],
    make: (c, a) => {
      const bad = needs(a.amount);
      if (bad) return bad;
      const e = EXPENSES[c.expense];
      if (c.how === 'unpaid') {
        return free('Expense outstanding', `${e.label} of ${f(a.amount)} for the month ${e.plural ? 'are' : 'is'} due but not yet paid.`, [dr(e.account, a.amount), cr(e.outstanding, a.amount)], { narration: `${e.label.toLowerCase()} outstanding` });
      }
      return free('Expense paid', `Paid ${e.label.toLowerCase()} of ${f(a.amount)} ${word(c.how)}.`, [dr(e.account, a.amount), cr(c.how, a.amount)], { narration: `${e.label.toLowerCase()} paid` });
    },
  },
  {
    id: 'earn-income',
    title: 'Earn an income',
    choices: [
      { id: 'income', label: 'Income', options: options(INCOMES) },
      { id: 'how', label: 'Received', options: [...MONEY, { id: 'due', label: 'Not yet received' }] },
    ],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 3000 }],
    make: (c, a) => {
      const bad = needs(a.amount);
      if (bad) return bad;
      const i = INCOMES[c.income];
      if (c.how === 'due') {
        return free('Income earned, not yet received', `${f(a.amount)} of ${i.label.toLowerCase()} has been earned but not yet received.`, [dr(i.accrued, a.amount), cr(i.account, a.amount)], { narration: `${i.label.toLowerCase()} earned but not received` });
      }
      return free('Income earned', `Received ${f(a.amount)} ${word(c.how)} as ${i.label.toLowerCase()}.`, [dr(c.how, a.amount), cr(i.account, a.amount)], { narration: `${i.label.toLowerCase()} received` });
    },
  },
  {
    id: 'drawings',
    title: 'The proprietor takes something for personal use',
    choices: [{ id: 'what', label: 'Takes', options: [{ id: 'cash', label: 'Cash' }, { id: 'bank', label: 'A cheque on the business account' }, { id: 'goods', label: 'Goods from the shop' }] }],
    amounts: [{ id: 'amount', label: 'Amount (goods at cost)', defaultRupees: 4000 }],
    make: (c, a) => {
      const bad = needs(a.amount);
      if (bad) return bad;
      if (c.what === 'goods') return free('Drawings in goods', `The proprietor took goods costing ${f(a.amount)} for personal use.`, [dr('drawings', a.amount), cr('purchases', a.amount)], { narration: 'goods taken for personal use' });
      return free('Drawings', `The proprietor took ${f(a.amount)} ${c.what === 'bank' ? 'from the business bank account' : 'in cash'} for personal use.`, [dr('drawings', a.amount), cr(c.what, a.amount)], { narration: 'drawings' });
    },
  },
  {
    id: 'pay-creditor',
    title: 'Pay a supplier what is owed',
    choices: [{ id: 'by', label: 'Paid', options: MONEY }],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 15000 }],
    make: (c, a) => needs(a.amount) ?? free('Liability paid', `Paid ${SUPPLIER} ${f(a.amount)} ${word(c.by)}.`, [dr(creditor(SUPPLIER), a.amount), cr(c.by, a.amount)], { narration: 'payment to a creditor' }),
  },
  {
    id: 'debtor-pays',
    title: 'A customer pays what is owed',
    choices: [{ id: 'into', label: 'Received', options: MONEY }],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 8000 }],
    make: (c, a) => needs(a.amount) ?? free('Debtor pays', `${CUSTOMER} paid ${f(a.amount)} ${word(c.into)}.`, [dr(c.into, a.amount), cr(debtor(CUSTOMER), a.amount)], { narration: 'received from a debtor' }),
  },
  {
    id: 'repay-loan',
    title: 'Repay part of the loan',
    choices: [],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 10000 }],
    make: (_, a) => needs(a.amount) ?? free('Loan repaid', `Repaid ${f(a.amount)} of the bank loan by cheque.`, [dr('bankLoan', a.amount), cr('bank', a.amount)], { narration: 'loan repaid' }),
  },
  {
    id: 'return-goods',
    title: 'Return goods to a supplier',
    choices: [],
    amounts: [{ id: 'amount', label: 'Cost of the goods', defaultRupees: 2000 }],
    make: (_, a) => needs(a.amount) ?? free('Goods returned to a supplier', `Returned goods costing ${f(a.amount)} to ${SUPPLIER}.`, [dr(creditor(SUPPLIER), a.amount), cr('purchasesReturn', a.amount)], { narration: 'goods returned' }),
  },
  {
    id: 'depreciation',
    title: 'Charge depreciation on an asset',
    choices: [{ id: 'on', label: 'On', options: [{ id: 'furniture', label: 'Furniture' }, { id: 'machinery', label: 'Machinery' }] }],
    amounts: [{ id: 'amount', label: 'Depreciation', defaultRupees: 3000 }],
    make: (c, a) => needs(a.amount) ?? free('Depreciation', `Charged depreciation of ${f(a.amount)} on the ${c.on}.`, [dr('depreciation', a.amount), cr(c.on, a.amount)], { narration: 'depreciation charged' }),
  },
  {
    id: 'bad-debt',
    title: 'A customer cannot pay',
    choices: [],
    amounts: [{ id: 'amount', label: 'Amount written off', defaultRupees: 2000 }],
    make: (_, a) => needs(a.amount) ?? free('Bad debts', `${f(a.amount)} due from ${CUSTOMER} could not be recovered and was written off.`, [dr('badDebts', a.amount), cr(debtor(CUSTOMER), a.amount)], { narration: 'bad debt written off' }),
  },
  {
    id: 'bank-cash',
    title: 'Move money between cash and the bank',
    choices: [{ id: 'way', label: 'Which way', options: [{ id: 'deposit', label: 'Deposit cash in the bank' }, { id: 'withdraw', label: 'Withdraw cash from the bank' }] }],
    amounts: [{ id: 'amount', label: 'Amount', defaultRupees: 10000 }],
    make: (c, a) =>
      needs(a.amount) ??
      (c.way === 'deposit'
        ? free('Cash deposited', `Deposited ${f(a.amount)} of cash into the bank.`, [dr('bank', a.amount), cr('cash', a.amount)], { narration: 'cash deposited' })
        : free('Cash withdrawn', `Withdrew ${f(a.amount)} from the bank for use in the shop.`, [dr('cash', a.amount), cr('bank', a.amount)], { narration: 'cash withdrawn for the business' })),
  },
];
