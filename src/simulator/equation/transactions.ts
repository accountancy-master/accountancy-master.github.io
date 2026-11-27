import { creditor, debtor } from '@/engine/accounts';
import type { SimTransaction } from '../types';
import { cr, dr, fx, r, tx } from './build';

// The starter list of the accounting-equation scene: one or more transactions of every effect the topic teaches, in
// words of this app's own. Amounts are in rupees; no GST, so that each entry shows its one idea. A trap is a wrong
// effect a student is likely to give, with the mistake behind it: the wrong choices of a prediction.

const KIRAN = creditor('Kiran');
const RAO = creditor('Rao & Co.');
const LAKSHMI = debtor('Lakshmi Stores');
const ANITA = debtor('Anita Traders');

export const STARTER: SimTransaction[] = [
  tx('capital-cash', 'Capital introduced', 'The proprietor brought ₹1,50,000 in cash into the business as capital.', [dr('cash', r(150000)), cr('capital', r(150000))], {
    narration: 'capital brought in',
    why: 'Cash, an asset, comes into the business, and the business owes the same amount to the proprietor as capital.',
    traps: [
      { effect: fx(150000, 150000, 0), why: "Treated the proprietor's money as a loan from an outsider." },
      { effect: fx(0, 0, 0), why: 'Thought the cash only changes form, as when one asset is bought with another.' },
    ],
  }),
  tx('capital-asset', 'Capital introduced in kind', 'The proprietor brought a computer worth ₹35,000 into the business as capital.', [dr('computers', r(35000)), cr('capital', r(35000))], {
    narration: 'computer brought in as capital',
    why: 'Capital need not be cash: an asset brought in by the proprietor raises the assets and the capital by its value.',
    traps: [
      { effect: fx(0, 0, 0), why: 'Thought nothing changes because no cash came in.' },
      { effect: fx(35000, 35000, 0), why: 'Treated the computer as bought on credit.' },
    ],
  }),
  tx('asset-cash', 'Asset bought for cash', 'Bought furniture for the shop for ₹18,000 and paid in cash.', [dr('furniture', r(18000)), cr('cash', r(18000))], {
    narration: 'furniture bought for cash',
    why: 'Furniture, an asset, comes in and cash, another asset, goes out. One asset replaces another.',
    traps: [
      { effect: fx(-18000, 0, -18000), why: 'Treated buying furniture as an expense, but furniture is an asset the business keeps.' },
      { effect: fx(18000, 18000, 0), why: 'Counted a liability, but the furniture was paid for at once.' },
    ],
  }),
  tx('asset-credit', 'Asset bought on credit', 'Bought a machine for ₹45,000 on credit from Rao & Co.', [dr('machinery', r(45000)), cr(RAO, r(45000))], {
    narration: 'machine bought on credit',
    why: 'The machine comes in and nothing is paid yet, so the business owes Rao & Co.: an asset and a liability rise together.',
    traps: [
      { effect: fx(45000, 0, 45000), why: 'Took the purchase as capital brought in by the proprietor.' },
      { effect: fx(0, 0, 0), why: 'Treated it as a cash purchase, where one asset only replaces another.' },
    ],
  }),
  tx('goods-cash', 'Goods bought for cash', 'Bought goods for ₹20,000 and paid in cash.', [dr('purchases', r(20000)), cr('cash', r(20000))], {
    narration: 'goods bought for cash',
    why: 'Goods for resale come into stock, an asset, and cash goes out. The journal debits goods bought for resale to Purchases A/c; in the equation they are stock.',
    traps: [{ effect: fx(-20000, 0, -20000), why: 'Treated buying goods as an expense that reduces capital at once.' }],
  }),
  tx('goods-credit', 'Goods bought on credit', 'Bought goods for ₹30,000 on credit from Kiran.', [dr('purchases', r(30000)), cr(KIRAN, r(30000))], {
    narration: 'goods bought on credit',
    why: 'Stock rises and so does the amount owed to Kiran, the supplier.',
    traps: [
      { effect: fx(0, 0, 0), why: 'Treated it as a cash purchase, where nothing is owed.' },
      { effect: fx(30000, 0, 30000), why: 'Took the goods as capital brought in.' },
    ],
  }),
  tx('sale-cash', 'Goods sold for cash', 'Sold goods costing ₹12,000 for ₹15,000 in cash.', [dr('cash', r(15000)), cr('sales', r(15000))], {
    narration: 'goods sold for cash',
    costOfSale: r(12000),
    why: 'Cash comes in at the selling price and the goods leave stock at their cost, so assets and capital rise only by the profit of ₹3,000.',
    traps: [
      { effect: fx(15000, 0, 15000), why: 'Counted the whole selling price as the increase, forgetting that the goods left stock.' },
      { effect: fx(0, 0, 0), why: 'Thought cash only replaces stock, forgetting the profit.' },
    ],
  }),
  tx('sale-credit', 'Goods sold on credit', 'Sold goods costing ₹16,000 to Lakshmi Stores on credit for ₹20,000.', [dr(LAKSHMI, r(20000)), cr('sales', r(20000))], {
    narration: 'goods sold on credit',
    costOfSale: r(16000),
    why: 'Lakshmi Stores now owes ₹20,000, a debtor and an asset, and the goods leave stock at ₹16,000: assets and capital rise by the profit of ₹4,000.',
    traps: [
      { effect: fx(20000, 0, 20000), why: 'Counted the whole selling price as the increase instead of only the profit.' },
      { effect: fx(20000, 20000, 0), why: 'Took the amount due from the customer as an amount the business owes.' },
    ],
  }),
  tx('creditor-paid', 'Liability paid', 'Paid ₹25,000 to Kiran by cheque against what the business owed.', [dr(KIRAN, r(25000)), cr('bank', r(25000))], {
    narration: 'payment made to a creditor',
    why: 'The bank balance, an asset, falls and the amount owed to Kiran, a liability, falls by the same amount.',
    traps: [
      { effect: fx(-25000, 0, -25000), why: 'Treated paying a creditor as an expense.' },
      { effect: fx(0, 0, 0), why: 'Thought paying a creditor only moves value from one asset to another.' },
    ],
  }),
  tx('loan-taken', 'Loan taken', 'Took a loan of ₹60,000 from the bank, which was credited to the business bank account.', [dr('bank', r(60000)), cr('bankLoan', r(60000))], {
    narration: 'loan taken from the bank',
    why: 'The bank balance rises, and the business owes the loan to the bank: an asset and a liability rise together.',
    traps: [
      { effect: fx(60000, 0, 60000), why: 'Treated the loan as capital brought in by the proprietor.' },
      { effect: fx(0, 0, 0), why: 'Thought the bank balance rising only moves value between assets.' },
    ],
  }),
  tx('loan-repaid', 'Loan repaid', 'Repaid ₹20,000 of the bank loan by cheque.', [dr('bankLoan', r(20000)), cr('bank', r(20000))], {
    narration: 'part of the loan repaid',
    why: 'The bank balance falls and the loan, a liability, falls by the same amount. Capital does not change.',
    traps: [{ effect: fx(-20000, 0, -20000), why: 'Treated repaying a loan as an expense.' }],
  }),
  tx('income-cash', 'Income earned in cash', 'Received commission of ₹4,000 in cash.', [dr('cash', r(4000)), cr('commissionReceived', r(4000))], {
    narration: 'commission received',
    why: 'Commission is an income: it adds to the profit so far and so to capital, and the cash received adds to assets.',
    traps: [
      { effect: fx(4000, 4000, 0), why: 'Treated the commission as money owed to someone else.' },
      { effect: fx(-4000, 0, -4000), why: 'Took commission received as an expense.' },
    ],
  }),
  tx('income-due', 'Income earned, not yet received', 'Earned commission of ₹3,000 that will be received next month.', [dr('accruedCommission', r(3000)), cr('commissionReceived', r(3000))], {
    narration: 'commission earned but not received',
    why: 'The commission belongs to this period, so the profit so far rises; the amount due to the business is an asset (accrued commission).',
    traps: [{ effect: fx(0, 0, 0), why: 'Ignored income that is earned but not yet received.' }],
  }),
  tx('expense-cash', 'Expense paid', 'Paid shop rent of ₹8,000 in cash.', [dr('rent', r(8000)), cr('cash', r(8000))], {
    narration: 'rent paid',
    why: 'Rent is an expense: it takes ₹8,000 off the profit so far, so capital falls, and the cash paid out reduces assets.',
    traps: [
      { effect: fx(0, 0, 0), why: 'Treated rent as buying an asset, so only the form of the assets changes.' },
      { effect: fx(-8000, -8000, 0), why: 'Treated the rent as the repayment of a liability.' },
    ],
  }),
  tx('expense-outstanding', 'Expense outstanding', 'Salaries of ₹12,000 for the month are due to the staff but not yet paid.', [dr('salaries', r(12000)), cr('outstandingSalaries', r(12000))], {
    narration: 'salaries due but not paid',
    why: 'The salaries are an expense of this month, so capital falls; nothing is paid, so the business owes them: a liability rises. Assets do not change.',
    traps: [
      { effect: fx(-12000, 0, -12000), why: 'Reduced assets, though no money has been paid.' },
      { effect: fx(0, 0, 0), why: 'Ignored an expense because it has not been paid.' },
    ],
  }),
  tx('prepaid', 'Expense paid in advance', 'Paid ₹6,000 in cash as rent for the first month of the next year.', [dr('prepaidRent', r(6000)), cr('cash', r(6000))], {
    narration: 'rent paid in advance',
    why: 'Rent paid for a later period is not an expense yet: it is prepaid rent, an asset. Cash falls and prepaid rent rises.',
    traps: [{ effect: fx(-6000, 0, -6000), why: "Charged the advance payment as this period's expense." }],
  }),
  tx('drawings-cash', 'Drawings in cash', 'The proprietor took ₹5,000 in cash from the business for personal use.', [dr('drawings', r(5000)), cr('cash', r(5000))], {
    narration: 'cash withdrawn for personal use',
    why: 'Drawings reduce what the business owes the proprietor, so capital falls, and the cash taken out reduces assets.',
    traps: [
      { effect: fx(-5000, -5000, 0), why: 'Treated the withdrawal as the repayment of a debt.' },
      { effect: fx(5000, 0, 5000), why: 'Read the withdrawal as money coming into the business.' },
    ],
  }),
  tx('drawings-goods', 'Drawings in goods', 'The proprietor took goods costing ₹2,500 from the shop for personal use.', [dr('drawings', r(2500)), cr('purchases', r(2500))], {
    narration: 'goods taken for personal use',
    why: 'Goods taken by the proprietor are drawings at cost: stock falls and capital falls. The journal credits them to Purchases A/c, since they will not be sold.',
    traps: [
      { effect: fx(0, 0, 0), why: 'Thought nothing changes because no cash moved.' },
      { effect: fx(-2500, -2500, 0), why: 'Treated the goods taken home as the repayment of a liability.' },
    ],
  }),
  tx('debtor-pays', 'Debtor pays', 'Lakshmi Stores paid ₹10,000 in cash against what it owed.', [dr('cash', r(10000)), cr(LAKSHMI, r(10000))], {
    narration: 'cash received from a debtor',
    why: 'Cash rises and the amount due from Lakshmi Stores, another asset, falls by the same amount. Only the form of the assets changes.',
    traps: [{ effect: fx(10000, 0, 10000), why: 'Counted money received from a debtor as a new income.' }],
  }),
  tx('purchase-return', 'Goods returned to a supplier', 'Returned goods costing ₹3,000 to Kiran; they had been bought on credit and not yet paid for.', [dr(KIRAN, r(3000)), cr('purchasesReturn', r(3000))], {
    narration: 'goods returned to the supplier',
    why: 'Stock falls and the amount still owed to Kiran falls by the same amount.',
    traps: [{ effect: fx(-3000, 0, -3000), why: 'Treated the returned goods as a loss.' }],
  }),
  tx('depreciation', 'Depreciation', 'Depreciation of ₹6,000 was charged on the machinery for the year.', [dr('depreciation', r(6000)), cr('machinery', r(6000))], {
    narration: 'depreciation charged',
    why: 'Depreciation is an expense: the book value of the machinery falls, and capital falls by the same amount, though no cash is paid.',
    traps: [{ effect: fx(0, 0, 0), why: 'Thought depreciation does not matter because no cash is paid.' }],
  }),
  tx('bad-debt', 'Bad debts', '₹4,000 due from Anita Traders could not be recovered and was written off as a bad debt.', [dr('badDebts', r(4000)), cr(ANITA, r(4000))], {
    narration: 'bad debt written off',
    why: 'A bad debt written off is a loss: debtors, an asset, fall and capital falls with them.',
    traps: [{ effect: fx(0, 0, 0), why: 'Thought that no cash moves, so nothing changes.' }],
  }),
  tx('deposit', 'Cash deposited', 'Deposited ₹15,000 of the cash in hand into the bank.', [dr('bank', r(15000)), cr('cash', r(15000))], {
    narration: 'cash deposited into the bank',
    why: 'The bank balance rises and cash in hand falls by the same amount: both are assets.',
    traps: [{ effect: fx(15000, 0, 15000), why: 'Took the deposit as new money brought in.' }],
  }),
  tx('owner-pays-creditor', 'Creditor paid by the proprietor', 'The proprietor paid ₹7,000 that the business owed Rao & Co. out of personal savings.', [dr(RAO, r(7000)), cr('capital', r(7000))], {
    narration: 'creditor paid by the proprietor from private funds',
    why: 'No money of the business is used. The business owes Rao & Co. less, and the proprietor has put that much more into it: a liability falls and capital rises.',
    traps: [
      { effect: fx(-7000, -7000, 0), why: 'Took it as the business paying the creditor from its own cash.' },
      { effect: fx(-7000, 0, -7000), why: 'Took it as drawings, as if the proprietor had taken money out.' },
    ],
  }),
  tx('discount-received', 'Settled with a discount', 'Paid Kiran ₹9,500 in cash in full settlement of ₹10,000 owed.', [dr(KIRAN, r(10000)), cr('cash', r(9500)), cr('discountReceived', r(500))], {
    narration: 'payment made and discount received',
    why: 'The whole ₹10,000 owed to Kiran leaves the books, but only ₹9,500 of cash goes out. The ₹500 saved is discount received, a gain, so capital rises by it.',
    traps: [
      { effect: fx(-9500, -9500, 0), why: 'Reduced the liability only by the cash paid, ignoring the discount.' },
      { effect: fx(-10000, -10000, 0), why: 'Took the whole amount owed as paid in cash.' },
    ],
  }),
];
