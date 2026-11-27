import { creditor, debtor } from '@/engine/accounts';
import type { Story } from '../scenes';
import type { JournalLine, SimTransaction } from '../types';
import { cr, dr, r } from './build';

// Ready stories: one business, its transactions one after another. The first begins with nothing at all; the second
// with the books of a shop that is already running. Every sale gives the cost of the goods, so that the equation
// can take them out of stock.

const step = (story: string, n: number, date: string, kind: string, text: string, lines: JournalLine[], extra: Partial<SimTransaction> = {}): SimTransaction => ({
  id: `s.${story}-${n}`,
  kind,
  text: `${date}: ${text}`,
  lines,
  ...extra,
});

const KIRAN = creditor('Kiran');
const LAKSHMI = debtor('Lakshmi Stores');

const SHOP: Story = {
  id: 'stationery-month',
  title: 'A month at a stationery shop',
  blurb: 'Kavya Stationers opens on 1 April with nothing but the proprietor’s cash, and trades for a month.',
  opening: [],
  transactions: [
    step('shop', 1, '1 April', 'Capital introduced', 'The proprietor started Kavya Stationers with ₹1,00,000 in cash.', [dr('cash', r(100000)), cr('capital', r(100000))], { narration: 'business started with cash' }),
    step('shop', 2, '2 April', 'Cash deposited', 'Opened a bank account for the shop with ₹60,000 of the cash.', [dr('bank', r(60000)), cr('cash', r(60000))], { narration: 'cash deposited into the bank' }),
    step('shop', 3, '4 April', 'Asset bought by cheque', 'Bought shelves and a counter (furniture) for ₹15,000 by cheque.', [dr('furniture', r(15000)), cr('bank', r(15000))], { narration: 'furniture bought' }),
    step('shop', 4, '6 April', 'Goods bought on credit', 'Bought notebooks and pens for ₹40,000 on credit from Kiran.', [dr('purchases', r(40000)), cr(KIRAN, r(40000))], { narration: 'goods bought on credit' }),
    step('shop', 5, '10 April', 'Goods sold for cash', 'Sold goods costing ₹15,000 for ₹21,000 in cash.', [dr('cash', r(21000)), cr('sales', r(21000))], { narration: 'goods sold for cash', costOfSale: r(15000) }),
    step('shop', 6, '14 April', 'Goods sold on credit', 'Sold goods costing ₹10,000 to Lakshmi Stores on credit for ₹13,000.', [dr(LAKSHMI, r(13000)), cr('sales', r(13000))], { narration: 'goods sold on credit', costOfSale: r(10000) }),
    step('shop', 7, '18 April', 'Expense paid', 'Paid the shop rent of ₹5,000 in cash.', [dr('rent', r(5000)), cr('cash', r(5000))], { narration: 'rent paid' }),
    step('shop', 8, '22 April', 'Liability paid', 'Paid Kiran ₹25,000 by cheque.', [dr(KIRAN, r(25000)), cr('bank', r(25000))], { narration: 'part payment to a creditor' }),
    step('shop', 9, '25 April', 'Debtor pays', 'Lakshmi Stores paid ₹8,000 in cash.', [dr('cash', r(8000)), cr(LAKSHMI, r(8000))], { narration: 'cash received from a debtor' }),
    step('shop', 10, '28 April', 'Drawings in cash', 'The proprietor took ₹4,000 in cash for personal use.', [dr('drawings', r(4000)), cr('cash', r(4000))], { narration: 'cash withdrawn for personal use' }),
    step('shop', 11, '30 April', 'Expense outstanding', 'The helper’s salary of ₹6,000 for April is due but not yet paid.', [dr('salaries', r(6000)), cr('outstandingSalaries', r(6000))], { narration: 'salary due but not paid' }),
  ],
};

const ANITA = debtor('Anita Traders');
const RAO = creditor('Rao & Co.');

const REPAIRS: Story = {
  id: 'electronics-week',
  title: 'A busy week at an electronics shop',
  blurb: 'Deepa Electronics is already running. A week of loans, returns, losses and the year-end adjustments.',
  opening: [
    dr('cash', r(40000)),
    dr('bank', r(80000)),
    dr('stock', r(50000)),
    dr(ANITA, r(30000)),
    dr('furniture', r(25000)),
    dr('machinery', r(60000)),
    cr(RAO, r(35000)),
    cr('bankLoan', r(50000)),
    cr('capital', r(200000)),
  ],
  transactions: [
    step('shop2', 1, '24 March', 'Loan taken', 'Took a further bank loan of ₹40,000, credited to the bank account.', [dr('bank', r(40000)), cr('bankLoan', r(40000))], { narration: 'loan taken from the bank' }),
    step('shop2', 2, '25 March', 'Asset bought on credit', 'Bought a testing machine for ₹30,000 on credit from Rao & Co.', [dr('machinery', r(30000)), cr(RAO, r(30000))], { narration: 'machine bought on credit' }),
    step('shop2', 3, '26 March', 'Goods sold on credit', 'Sold goods costing ₹18,000 to Anita Traders on credit for ₹24,000.', [dr(ANITA, r(24000)), cr('sales', r(24000))], { narration: 'goods sold on credit', costOfSale: r(18000) }),
    step('shop2', 4, '27 March', 'Goods returned to a supplier', 'Returned goods costing ₹2,000 to Rao & Co.', [dr(RAO, r(2000)), cr('purchasesReturn', r(2000))], { narration: 'goods returned' }),
    step('shop2', 5, '28 March', 'Debtor pays', 'Anita Traders paid ₹20,000 by cheque.', [dr('bank', r(20000)), cr(ANITA, r(20000))], { narration: 'cheque received from a debtor' }),
    step('shop2', 6, '29 March', 'Drawings in goods', 'The proprietor took a table fan costing ₹1,500 from the stock for home.', [dr('drawings', r(1500)), cr('purchases', r(1500))], { narration: 'goods taken for personal use' }),
    step('shop2', 7, '31 March', 'Depreciation', 'Charged depreciation of ₹6,000 on the machinery for the year.', [dr('depreciation', r(6000)), cr('machinery', r(6000))], { narration: 'depreciation charged' }),
    step('shop2', 8, '31 March', 'Bad debts', 'Wrote off ₹3,000 due from Anita Traders as a bad debt.', [dr('badDebts', r(3000)), cr(ANITA, r(3000))], { narration: 'bad debt written off' }),
    step('shop2', 9, '31 March', 'Income earned, not yet received', 'Commission of ₹2,500 earned this year is still to be received.', [dr('accruedCommission', r(2500)), cr('commissionReceived', r(2500))], { narration: 'commission earned but not received' }),
    step('shop2', 10, '31 March', 'Expense outstanding', 'Electricity charges of ₹1,800 for March are unpaid.', [dr('electricity', r(1800)), cr('outstandingElectricity', r(1800))], { narration: 'electricity charges outstanding' }),
  ],
};

export const EQUATION_STORIES: Story[] = [SHOP, REPAIRS];
