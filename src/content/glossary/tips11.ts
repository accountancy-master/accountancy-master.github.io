import type { ExamTips } from './types';

// The exam tips of Class 11 Accountancy (CBSE): general tips, tips for each section of the paper (the sections of
// the blueprint in learning/paperBlueprints.ts), and common mistakes by topic. The format is in types.ts.
const TIPS: ExamTips = {
  courseId: 'cbse-11-accountancy',
  general: [
    'Use the 15 minutes of reading time to read the whole paper, settle the internal choices and mark the questions you are sure of.',
    'Plan your time by marks: a little over 2 minutes a mark in a 3-hour, 80-mark paper, so about 13 minutes for a 6-mark question, with the last 10 minutes kept for checking.',
    'Write the working notes for every numerical answer beside it or just below it: they carry marks even when the final figure is wrong.',
    'Rule every journal entry in five columns (Date, Particulars, L.F., Debit ₹, Credit ₹): the debited account with "Dr" on the first line, the credited account beginning with "To" on the next.',
    'Give a narration under every journal entry, in brackets and beginning with "Being", unless the question says narrations are not required.',
    'Draw every ledger account in T form with Date, Particulars, J.F. and Amount on both sides, head it "... A/c", and begin debit items with "To" and credit items with "By".',
    'Head every statement in full: the name of the business, the name of the statement, and the period ("for the year ended 31 March 2025") or the date ("as at 31 March 2025").',
    'Read the question for the convention it states, such as the year-end date, the method and rate of depreciation, whether a part year counts, the GST rate and whether the supply is within the state, and follow it even where your textbook differs.',
    'Write ₹ at the head of every amount column and use Indian digit grouping: ₹1,25,000, not ₹125,000.',
    'Carry exact figures through a working and round only the final answer, to the nearest rupee, saying so in a note.',
    'State what a figure is, not just the number: "Debit balance ₹15,000", "Overdraft as per pass book ₹13,000", "Profit overstated by ₹5,000".',
    'Before moving on, check that the debits equal the credits in every entry, that both sides of every account total the same, and that the balance sheet balances.',
    'In a theory answer, give one point for each mark, each with a short heading, and add a small example where it helps.',
    'Number every answer exactly as in the paper, sub-parts included, and start each long question on a fresh page.',
  ],
  sections: [
    {
      title: 'Theoretical Framework',
      tips: [
        'For "name the principle", find the one idea the situation turns on (owner versus business, money, period, cost, likely loss, delivery, same method, evidence, size, disclosure, matching) and name only that principle.',
        'When asked for the fundamental accounting assumptions, name exactly three: going concern, consistency and accrual.',
        'When a question names a user, say what that user wants to know as well as whether it is internal or external.',
        'For GST, compare the supplier\'s state with the place of supply first: the same state means CGST and SGST at half the rate each; different states mean IGST at the full rate.',
        'In an input tax credit question, use the IGST credit first (against IGST, then CGST and SGST), and never set CGST credit against SGST or SGST credit against CGST.',
        'Answer a 3-mark "distinguish between" question as a table, comparing the two items point by point on the same basis.',
      ],
    },
    {
      title: 'Accounting Process',
      tips: [
        'Before writing an entry, decide the kind of each account (asset, liability, capital, income or expense) and whether it rises or falls; the side follows from that.',
        'Post every entry to both accounts it names, with the same date and amount, and write the other account in the Particulars.',
        'In the double column cash book put cheques banked the same day and cheques issued in the bank column; a cheque received but banked on a later day goes in the cash column first and moves to the bank column by a contra entry, marked "C" in the L.F. column.',
        'In a bank reconciliation statement, write the starting balance with its nature (favourable or overdraft), list each item on its own line under Add or Less, and end with the balance of the other book.',
        'For a rectification, write down what was done and what should have been done, then pass only the entry that turns one into the other.',
        'In depreciation questions, write the date of every purchase and sale in the asset account and count the months of use up to the year end the question gives.',
        'Carry every balance down and bring it down on the first day of the next year in the asset, provision and disposal accounts, year by year.',
        'Show the working for a provision for doubtful debts in three lines: debtors less further bad debts, the new provision on the remainder, and the charge after the old provision.',
      ],
    },
    {
      title: 'Financial Statements of Sole Proprietorship',
      tips: [
        'Tick each adjustment off the list only when it appears in both places: the trading or profit and loss account, and the balance sheet.',
        'Work out closing stock, depreciation, provisions, interest and commission in working notes before drawing up the accounts.',
        'Show each adjustment inside the statement: "Salaries 1,20,000; Add: Outstanding 10,000; 1,30,000".',
        'Take direct expenses to the trading account and indirect expenses to the profit and loss account; where a trial balance joins two heads, go by the first word.',
        'In the balance sheet, add the net profit and the interest on capital to capital, then deduct the drawings.',
        'Keep to one order of marshalling, liquidity or permanence, on both sides of the balance sheet.',
        'If the balance sheet does not balance, check first that every adjustment appears twice, then the closing stock, then the capital account.',
        'For profit by the statement of affairs method (incomplete records), find the capital at the start and at the end as assets less liabilities, then work closing capital − opening capital + drawings − additional capital; a negative answer is a loss.',
      ],
    },
  ],
  mistakes: [
    // Introduction to Accounting
    { topicId: 'introduction-to-accounting', text: 'Classify an item by why the business holds it: bought to resell, it is goods (purchases); bought to use for years, it is a fixed asset.' },
    { topicId: 'introduction-to-accounting', text: 'Classify a liability by the time left to its due date from the balance sheet date, not by the original term of the loan.' },
    { topicId: 'introduction-to-accounting', text: 'Call a bank that has lent to the business an external user: owing it money does not make it an insider.' },
    { topicId: 'introduction-to-accounting', text: 'Treat the owner\'s withdrawals as drawings that reduce capital, never as an expense or a salary.' },
    { topicId: 'introduction-to-accounting', text: 'Record a transaction only when value has moved: an enquiry or an order not yet delivered is not recorded.' },
    { topicId: 'introduction-to-accounting', text: 'Take only the excess over book value as the gain on selling an old asset, not the whole price received.' },

    // Theory Base of Accounting
    { topicId: 'theory-base', text: 'List going concern, consistency and accrual as the fundamental assumptions; prudence, matching and materiality are principles, not among the three.' },
    { topicId: 'theory-base', text: 'Show stock at the lower of cost and net realisable value; never raise it to a higher market price.' },
    { topicId: 'theory-base', text: 'Recognise revenue when the goods are delivered, not when the order is taken or the advance is received.' },
    { topicId: 'theory-base', text: 'Charge IGST on a supply between states and CGST plus SGST on a supply within a state, never the other way round.' },
    { topicId: 'theory-base', text: 'Work GST on the price after trade discount, not on the list price.' },
    { topicId: 'theory-base', text: 'To reach accrual profit from cash profit, add accrued income and prepaid expenses and deduct outstanding expenses and income received in advance.' },

    // Accounting Equation
    { topicId: 'accounting-equation', text: 'Find capital as assets minus liabilities; never add the liabilities to the assets.' },
    { topicId: 'accounting-equation', text: 'On goods sold at a profit, raise assets and capital by the profit only, not by the whole selling price.' },
    { topicId: 'accounting-equation', text: 'When finding profit from the change in capital, add back the drawings and deduct the additional capital.' },
    { topicId: 'accounting-equation', text: 'Show an outstanding expense as a rise in liabilities and a fall in capital; assets do not change, because no cash has gone out.' },
    { topicId: 'accounting-equation', text: 'Treat a cash purchase of an asset as one asset replacing another: the totals of the equation do not change.' },

    // Journal
    { topicId: 'journal-entries', text: 'Credit the supplier, not Cash, for goods bought on credit: Cash or Bank appears only when money moves.' },
    { topicId: 'journal-entries', text: 'Take goods withdrawn by the owner, given as charity or given as free samples out of Purchases at cost, never through Sales or at selling price.' },
    { topicId: 'journal-entries', text: 'Debit an asset bought to its own account, never to Purchases, and credit an asset sold to its own account, never to Sales.' },
    { topicId: 'journal-entries', text: 'Debit Drawings, not an expense account, for the owner\'s personal spending paid from the business.' },
    { topicId: 'journal-entries', text: 'Keep GST in the Input and Output tax accounts; never add it to the Purchases or Sales amount.' },
    { topicId: 'journal-entries', text: 'Credit Bad Debts Recovered A/c, not the debtor, when a debt written off earlier is received.' },

    // Ledger
    { topicId: 'ledger', text: 'After "To" or "By", write the other account of the entry, never the name of the account you are writing in.' },
    { topicId: 'ledger', text: 'Post the closing balance as "Balance c/d" on the shorter side so that the account agrees, never as an expense or income.' },
    { topicId: 'ledger', text: 'Bring the balance down on the side opposite to the one where it was carried down: a debit balance reads "To Balance b/d".' },
    { topicId: 'ledger', text: 'Credit a customer who pays in full settlement with both the cash and the discount allowed, so that no balance is left behind.' },
    { topicId: 'ledger', text: 'Read a debit balance in a personal account as money owed to the firm (a debtor) and a credit balance as money the firm owes (a creditor).' },
    { topicId: 'ledger', text: 'Correct an item posted on the wrong side by twice its amount, not once.' },

    // Cash Book
    { topicId: 'cash-book', text: 'Record cash discount through the journal: the double column cash book has only cash and bank columns and shows the amount actually received or paid.' },
    { topicId: 'cash-book', text: 'Treat a cheque that is not banked on the day it is received as cash, and pass a contra entry on the day it is deposited.' },
    { topicId: 'cash-book', text: 'Enter an opening overdraft on the credit side of the bank column as "By Balance b/d", not on the debit side.' },
    { topicId: 'cash-book', text: 'Record cash taken by the owner for personal use as drawings, not as a contra entry; only cash moved between the office and the bank is contra.' },
    { topicId: 'cash-book', text: 'Reimburse the petty cashier the amount spent in the period, not the cash left in hand.' },
    { topicId: 'cash-book', text: 'Leave credit sales and credit purchases out of the cash book; enter them only when the money is received or paid.' },

    // Special Purpose Books
    { topicId: 'subsidiary-books', text: 'Enter only credit purchases of goods for resale in the purchases book: cash purchases go to the cash book and assets bought on credit to the journal proper.' },
    { topicId: 'subsidiary-books', text: 'Deduct trade discount before charging GST and enter only the net amount; never open a trade discount account.' },
    { topicId: 'subsidiary-books', text: 'Post the goods column total (before GST) to Purchases or Sales A/c and the GST column totals to their own tax accounts, never the grand total.' },
    { topicId: 'subsidiary-books', text: 'Remember who sends which note: the buyer returning goods sends a debit note; the seller taking them back sends a credit note.' },
    { topicId: 'subsidiary-books', text: 'Find the list price from a net price by multiplying by 100 and dividing by (100 − trade discount %), not by adding the discount percentage to the net price.' },

    // Bank Reconciliation Statement
    { topicId: 'bank-reconciliation', text: 'Write the starting balance with its nature before anything else: from an overdraft every item you would add to a favourable balance is deducted instead.' },
    { topicId: 'bank-reconciliation', text: 'Ask of each item whether it makes the other book\'s balance higher or lower, instead of applying one add list to every starting point.' },
    { topicId: 'bank-reconciliation', text: 'Amend the cash book only for items the bank recorded first and for the firm\'s own errors; never for cheques not yet presented or cleared, or for the bank\'s errors.' },
    { topicId: 'bank-reconciliation', text: 'Read a debit balance in the pass book as an overdraft, not as money in the bank.' },
    { topicId: 'bank-reconciliation', text: 'Starting from a favourable cash book balance, deduct an undercasting of the cash book\'s payments side (it made the balance too high) and add an overcasting.' },

    // Trial Balance
    { topicId: 'trial-balance', text: 'Put sales returns, discount allowed and drawings in the debit column, and purchases returns, discount received, bank overdraft and provisions in the credit column.' },
    { topicId: 'trial-balance', text: 'Leave closing stock out of the trial balance when it is given as a note below it; opening stock goes in the debit column.' },
    { topicId: 'trial-balance', text: 'Enter Suspense A/c in the column that is short, so that the two totals agree.' },
    { topicId: 'trial-balance', text: 'Do not take an agreeing trial balance as proof of correct books: complete omissions, errors of principle and compensating errors leave it in agreement.' },
    { topicId: 'trial-balance', text: 'When a balance may be in the wrong column, look for one equal to half the difference, since a misplaced balance doubles its effect.' },

    // Rectification of Errors
    { topicId: 'rectification-of-errors', text: 'Use Suspense A/c only for a one-sided error found after the trial balance; correct a two-sided error between the accounts concerned.' },
    { topicId: 'rectification-of-errors', text: 'Rectify an entry recorded the wrong way round with twice the original amount: once to cancel it and once to put the right one in.' },
    { topicId: 'rectification-of-errors', text: 'Leave Cash alone when rectifying an error of principle: the cash side was right, so move the amount between the two other accounts.' },
    { topicId: 'rectification-of-errors', text: 'Change the profit only for errors that leave an expense or an income wrong; an error between two personal accounts or two assets leaves it unchanged.' },
    { topicId: 'rectification-of-errors', text: 'Give Suspense A/c the side opposite to the one it had in the trial balance when clearing it.' },

    // Depreciation
    { topicId: 'depreciation', text: 'Deduct the scrap value from the cost before dividing by the useful life under the straight line method.' },
    { topicId: 'depreciation', text: 'Under the written down value method, apply the rate to the opening book value of each year, not to the original cost.' },
    { topicId: 'depreciation', text: 'Charge depreciation only for the months of use in the year of purchase and in the year of sale.' },
    { topicId: 'depreciation', text: 'Find the profit or loss on sale by comparing the net sale price with the book value on the date of sale, not with the original cost.' },
    { topicId: 'depreciation', text: 'Add carriage and installation to the cost of the asset; never charge them as expenses of the year.' },
    { topicId: 'depreciation', text: 'Transfer the depreciation provided on the asset sold to Asset Disposal A/c before finding the profit or loss on sale.' },

    // Provisions and Reserves
    { topicId: 'provisions-and-reserves', text: 'Charge a provision before the net profit is found, and take a transfer to reserve out of the net profit after it is found.' },
    { topicId: 'provisions-and-reserves', text: 'Work the new provision for doubtful debts on the debtors left after the further bad debts are written off.' },
    { topicId: 'provisions-and-reserves', text: 'Deduct the old provision, never add it, when finding the charge to the profit and loss account for bad debts and provision.' },
    { topicId: 'provisions-and-reserves', text: 'Deduct the provision for doubtful debts from debtors on the assets side, and show reserves on the liabilities side with capital.' },
    { topicId: 'provisions-and-reserves', text: 'Work the provision for discount on debtors after deducting both the further bad debts and the provision for doubtful debts.' },
    { topicId: 'provisions-and-reserves', text: 'Recognise a secret reserve by undervalued assets or overstated liabilities; overvaluing assets hides a loss, it does not create a reserve.' },

    // Financial Statements (without adjustments)
    { topicId: 'final-accounts', text: 'Put closing stock on the credit side of the trading account, so that it reduces the cost of goods sold; never add it to the debit side.' },
    { topicId: 'final-accounts', text: 'Take carriage outwards to the profit and loss account; only carriage inwards belongs in the trading account.' },
    { topicId: 'final-accounts', text: 'Deduct drawings from capital in the balance sheet; drawings never enter the profit and loss account.' },
    { topicId: 'final-accounts', text: 'Add the net profit, not the gross profit, to the opening capital.' },
    { topicId: 'final-accounts', text: 'Deduct sales returns from sales and purchases returns from purchases, each on its own side of the trading account.' },
    { topicId: 'final-accounts', text: 'Show the sale of an old asset as a profit or loss on sale, never as part of sales.' },

    // Financial Statements with Adjustments
    { topicId: 'final-accounts-adjustments', text: 'Show every adjustment twice: once in the trading or profit and loss account and once in the balance sheet.' },
    { topicId: 'final-accounts-adjustments', text: 'Add an outstanding expense to the expense and deduct a prepaid one; do not swap the two.' },
    { topicId: 'final-accounts-adjustments', text: 'Allow interest on capital brought in during the year only for the months it was in the business.' },
    { topicId: 'final-accounts-adjustments', text: 'Work the manager\'s commission on profit after charging it as rate ÷ (100 + rate) of the profit before commission.' },
    { topicId: 'final-accounts-adjustments', text: 'Take goods lost by fire out of purchases at cost, and charge as a loss only the part not covered by the insurance claim.' },
    { topicId: 'final-accounts-adjustments', text: 'Debit interest on capital to the profit and loss account as an expense, and add it to the capital in the balance sheet.' },
  ],
};

export default TIPS;
