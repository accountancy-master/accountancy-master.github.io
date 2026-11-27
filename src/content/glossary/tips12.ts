import type { ExamTips } from './types';

// The exam tips of Class 12 Accountancy (CBSE): general tips, tips for each section of the paper (the sections of
// the blueprint in learning/paperBlueprints.ts), and common mistakes by topic. The format is in types.ts.
//
// The paper: 80 marks in 3 hours, 34 questions. Part A (questions 1 to 26, 60 marks) is Accounting for Partnership
// Firms and Accounting for Companies; Part B (questions 27 to 34, 20 marks) is Analysis of Financial Statements and
// the Cash Flow Statement, or, for a school that takes that option, Computerised Accounting (the sections and mistakes
// of the choice not made are not shown to the learner: tipsFor in index.ts). Each mistake is written as what to do instead, and comes from the mistakes the app's
// cards and generators name.
const TIPS: ExamTips = {
  courseId: 'cbse-12-accountancy',
  general: [
    'Use the 15 minutes of reading time, which come before the 3 hours, to read the whole paper, decide which of the internal choices you will attempt and note what each long question fixes; nothing may be written in that time.',
    'A suggested plan, in proportion to the marks at about two minutes a mark: about 2 hours for Part A (60 marks) and about 40 minutes for Part B (20 marks), which leaves about 20 minutes of the 3 hours to check and to catch up.',
    'Before you start a question, underline what it fixes for you: fixed or fluctuating capitals, how goodwill is treated, the accounting year, the dates and rates of interest, and whether a profit is on cost or on revenue.',
    'Show the working notes beside every account and statement: they carry marks even when the final figure is wrong.',
    'Write the formula first, then the figures, then the answer: in goodwill, ratio and interest questions the formula carries marks of its own.',
    'Give every ratio in its own form: a pure ratio as 2.5 : 1, a turnover ratio in times and a profitability ratio as a percentage, to two decimal places when it does not come out exact.',
    'Draw ledger accounts in the T form with Date, Particulars, J.F. and Amount on both sides, and balance or close every one of them.',
    'Draw company statements in the vertical form of Schedule III, with a Note No. column, the major heads and sub-heads by their exact names, and the details in notes to accounts.',
    'Write "Dr" after the account debited and "To" before the account credited, and give a short narration under every journal entry.',
    'Use the account names the question uses, such as Premium for Goodwill A/c or Securities Premium A/c, and keep the partners in the order the question lists them.',
    'Write amounts with ₹ and the Indian grouping (₹1,20,000), and show a negative figure or a decrease in brackets.',
    'Where a question can honestly be read in two ways, state your assumption in one line and follow it to the end.',
    'Answer a 1-mark question with the letter and the text of the option you choose, or in a word, a figure or one sentence; a long answer earns no more.',
    'Begin each 4-mark and 6-mark answer on a fresh page with its question number in the margin, so the examiner finds every part.',
    'Keep the time left at the end to check that every account balances and every statement agrees, and attempt every question: there is no negative marking.',
  ],
  sections: [
    {
      title: 'Part A',
      tips: [
        'Part A is questions 1 to 26 for 60 marks, all on partnership firms and companies: as a suggestion, give it about 2 hours, three times what you give Part B.',
        'In an assertion-reason question, judge the assertion and the reason as true or false one at a time, and only then ask whether the reason explains the assertion.',
        'Do the short objective questions of Part A in one sitting at the start, so that the long accounts get unbroken time.',
      ],
    },
    {
      title: 'Part B',
      partB: 'analysis',
      tips: [
        'Part B is questions 27 to 34 for 20 marks; answer the Analysis of Financial Statements option and do not mix in questions from the other option.',
        'As a suggestion, keep about 40 minutes for Part B: the cash flow statement alone is a 6-mark question with several working notes.',
      ],
    },
    // For a school that teaches Computerised Accounting as Part B in place of Analysis of Financial Statements.
    {
      title: 'Part B',
      partB: 'computerised',
      tips: [
        'Part B is questions 27 to 34 for 20 marks; answer the Computerised Accounting option and do not mix in questions from the other option.',
        'As a suggestion, keep about 40 minutes for Part B: a schedule to prepare on a sheet, such as a loan repayment schedule, is a 6-mark question.',
      ],
    },
    {
      title: 'Accounting for Partnership Firms',
      tips: [
        'Write down which ratio each item needs before you pass entries: the old ratio for reserves, revaluation and goodwill already in the books; the sacrificing or gaining ratio for goodwill; the new ratio for future profits and capitals.',
        'Work every sacrifice or gain in fractions on one common denominator, and check that the total sacrificed equals the total gained.',
        'Never raise a Goodwill Account for goodwill the firm has built itself: adjust it through the capital (or current) accounts, as AS 26 requires.',
        'Draw the partners\' capital accounts in columns, one for each partner, and close the Revaluation Account with a row for each partner ("To Profit transferred to Asha\'s Capital A/c").',
        'Keep charges (interest on a partner\'s loan, rent to a partner) in the Profit and Loss Account and appropriations in the Profit and Loss Appropriation Account.',
        'On dissolution, finish with the Bank Account: after the partners are paid it must close at nil.',
      ],
    },
    {
      title: 'Accounting for Companies',
      tips: [
        'Pass each instalment of an issue in two entries, the amount due and the amount received, unless the question asks for a combined entry, and always credit Share Capital at face value.',
        'Work an issue on the number of shares allotted, and carry the excess application money of a pro rata allotment into the allotment and, on forfeiture, into the amount forfeited.',
        'Show Share Capital as one figure on the face of the balance sheet and give its note: authorised, issued and subscribed capital, calls in arrears deducted and forfeited shares added.',
        'For debentures redeemable at a premium, put the premium on redemption into the issue entry through Loss on Issue of Debentures A/c.',
        'Write off the discount or loss on issue of debentures in the year of allotment, from Securities Premium first and the rest from the Statement of Profit and Loss.',
      ],
    },
    {
      title: 'Analysis of Financial Statements',
      tips: [
        'Place an item by its major head and its sub-head, written exactly as Schedule III names them, for example "Current Liabilities: Short-term Borrowings".',
        'Show capital employed, quick assets, debt or cost of revenue from operations as a working note whenever a ratio needs one of them.',
        'In a comparative statement take the percentage change on the previous year; in a common size statement take revenue from operations, or total assets, as 100.',
        'For the effect of a transaction on a ratio, write the two accounts it touches and whether each sits in the numerator or the denominator before you answer.',
      ],
    },
    {
      title: 'Cash Flow Statement',
      tips: [
        'Keep the order of the indirect method and name every sub-total: net profit before tax, operating profit before working capital changes, cash generated from operations, net cash from operating activities.',
        'Find net profit before tax from the change in Surplus, adding back the transfers to reserves, the dividend paid and the provision for tax made.',
        'Draw working accounts for each fixed asset, its accumulated depreciation and the provision for tax, and show them below the statement.',
        'Treat bank overdraft and cash credit as financing items, and current investments as cash equivalents unless the question says otherwise.',
        'End with the net increase or decrease, add the opening cash and cash equivalents, and check the closing figure against the balance sheet.',
      ],
    },
    {
      title: 'Computerised Accounting',
      tips: [
        'When a question asks for a spreadsheet formula, write it in full, starting with "=", with the cell addresses and the brackets, and say in a line what it returns.',
        'Put a $ before the column and the row of a cell that every copied formula must keep, such as a rate kept in one cell, and say how the formula changes when it is copied.',
        'Set out a depreciation or loan schedule as columns, one row for each year: the balance at the start, the charge or interest, the principal where there is one, and the balance at the end.',
        'Name the function a sheet uses for each job: SLN and DB for depreciation, PMT for the instalment, IPMT and PPMT for its interest and principal, IF for a condition.',
        'For a voucher, a code, a group or a validation check, give the name and the reason in one line each: what the transaction is, or what the check refuses.',
      ],
    },
  ],
  mistakes: [
    // Fundamentals of partnership
    { topicId: 'partnership-fundamentals', text: 'With no deed, share profits equally and allow no interest on capital; the 6% p.a. is only for a partner\'s loan.' },
    { topicId: 'partnership-fundamentals', text: 'Count the months for interest on drawings from the date of each withdrawal to the end of the year, not from the start of the year.' },
    { topicId: 'partnership-fundamentals', text: 'Charge interest on a partner\'s loan to the Profit and Loss Account and credit it to the loan account, not to the capital account or the appropriation account.' },
    { topicId: 'partnership-fundamentals', text: 'Use Net profit × Rate/(100 + Rate) when the commission is "after charging such commission".' },
    { topicId: 'partnership-fundamentals', text: 'With fixed capitals, credit interest on capital, salary and the share of profit to the Current A/c, never to the Capital A/c.' },
    { topicId: 'partnership-fundamentals', text: 'In a past adjustment, take back the profit that was shared in place of the omitted item before you work out each partner\'s net effect.' },
    // Goodwill
    { topicId: 'goodwill', text: 'Use the average profit, not the total profit, and multiply by the years\' purchase, not by the number of years averaged.' },
    { topicId: 'goodwill', text: 'Add back abnormal losses and take out abnormal gains before you average past profits.' },
    { topicId: 'goodwill', text: 'Divide a weighted total by the total of the weights, not by the number of years.' },
    { topicId: 'goodwill', text: 'Leave goodwill, fictitious assets and non-trade investments out of capital employed, and deduct the outside liabilities.' },
    { topicId: 'goodwill', text: 'In capitalisation of average profit, deduct the capital employed from the capitalised value: the capitalised value itself is not the goodwill.' },
    // Change in profit-sharing ratio
    { topicId: 'change-in-profit-sharing-ratio', text: 'Bring the old and the new shares to a common denominator before subtracting them.' },
    { topicId: 'change-in-profit-sharing-ratio', text: 'For goodwill, debit the gaining partner and credit the sacrificing partner; do not open a Goodwill Account.' },
    { topicId: 'change-in-profit-sharing-ratio', text: 'Share reserves, accumulated profits and losses and the revaluation result in the old ratio, never in the new one.' },
    { topicId: 'change-in-profit-sharing-ratio', text: 'Debit an increase in a liability or a provision, such as a bigger provision for doubtful debts, to the Revaluation Account.' },
    { topicId: 'change-in-profit-sharing-ratio', text: 'Meet a workmen compensation claim or a fall in the value of investments out of its own reserve before you distribute what is left.' },
    { topicId: 'change-in-profit-sharing-ratio', text: 'In the single adjusting entry, multiply the net effect by the share gained or sacrificed, not by a partner\'s new share.' },
    // Admission of a partner
    { topicId: 'admission-of-a-partner', text: 'Share the premium for goodwill in the sacrificing ratio; it equals the old ratio only when the old partners keep their ratio.' },
    { topicId: 'admission-of-a-partner', text: 'Write off goodwill already in the books among the old partners in the old ratio before you record the premium.' },
    { topicId: 'admission-of-a-partner', text: 'Give the new partner no part of the reserves or of the revaluation profit.' },
    { topicId: 'admission-of-a-partner', text: 'When a partner surrenders a fraction of the partner\'s own share (not of the whole profit), multiply that fraction by the partner\'s share.' },
    { topicId: 'admission-of-a-partner', text: 'To find the new partner\'s capital, gross up the old partners\' combined capital by the reciprocal of their combined share, then take the new partner\'s share of the total.' },
    { topicId: 'admission-of-a-partner', text: 'Include the new partner\'s own capital in the net worth when you work out hidden goodwill.' },
    // Retirement and death of a partner
    { topicId: 'retirement-and-death-of-a-partner', text: 'Work each gain as new share less old share; with nothing agreed, the gaining ratio is the old ratio of the continuing partners.' },
    { topicId: 'retirement-and-death-of-a-partner', text: 'Include the outgoing partner when you share reserves, the revaluation result and goodwill written off, all in the old ratio.' },
    { topicId: 'retirement-and-death-of-a-partner', text: 'Take the share of profit only for the months from the last balance sheet to the date of death, and pass it through Profit and Loss Suspense A/c.' },
    { topicId: 'retirement-and-death-of-a-partner', text: 'Work interest on a retiring partner\'s loan on the balance still unpaid each year, not on the original amount.' },
    { topicId: 'retirement-and-death-of-a-partner', text: 'Transfer a deceased partner\'s balance to the Executor\'s A/c, and an unpaid retiring partner\'s balance to the Loan A/c; leave no balance in either capital account.' },
    // Dissolution of a partnership firm
    { topicId: 'dissolution-of-partnership', text: 'Transfer each asset to the Realisation Account at its gross book value, and its provision to the credit side.' },
    { topicId: 'dissolution-of-partnership', text: 'Keep cash, bank, a partner\'s own loan, reserves and fictitious assets out of the Realisation Account.' },
    { topicId: 'dissolution-of-partnership', text: 'Pass no entry when a creditor accepts an asset in full settlement.' },
    { topicId: 'dissolution-of-partnership', text: 'When a realised value is not given, take a tangible asset at its book value and an intangible asset at nil.' },
    { topicId: 'dissolution-of-partnership', text: 'Debit the Realisation Account only with the expenses the firm bears; for a fixed remuneration, debit the remuneration and not the actual expenses.' },
    { topicId: 'dissolution-of-partnership', text: 'Share the profit or loss on realisation in the profit-sharing ratio, not in the ratio of capitals.' },
    // Share capital
    { topicId: 'share-capital', text: 'When an issue is under-subscribed, pass every entry on the number of shares applied for and allotted, not on the number offered.' },
    { topicId: 'share-capital', text: 'Credit the securities premium in the entry of the instalment that carries it, when that instalment falls due.' },
    { topicId: 'share-capital', text: 'On forfeiture, debit Share Capital with the amount called up on the shares, not with the amount paid on them.' },
    { topicId: 'share-capital', text: 'Debit Securities Premium on forfeiture only if the premium was not received.' },
    { topicId: 'share-capital', text: 'Count the excess application money kept on a pro rata allotment as part of the amount forfeited.' },
    { topicId: 'share-capital', text: 'Transfer to Capital Reserve only the gain on the shares actually reissued, leaving the rest in Forfeited Shares A/c.' },
    // Debentures
    { topicId: 'debentures', text: 'Credit the debentures account with the nominal value, whatever the issue price.' },
    { topicId: 'debentures', text: 'Record a premium payable on redemption at the time of issue, not when the debentures are redeemed.' },
    { topicId: 'debentures', text: 'Divide the amount payable to a vendor by the issue price of one debenture, not by its face value.' },
    { topicId: 'debentures', text: 'Work debenture interest on the nominal value and only for the months the debentures were outstanding.' },
    { topicId: 'debentures', text: 'Write off the discount or loss on issue in full in the year of allotment, from Securities Premium before the Statement of Profit and Loss.' },
    { topicId: 'debentures', text: 'Pass no bank entry for debentures given as collateral security, and charge no interest on them.' },
    // Financial statements of a company
    { topicId: 'company-financial-statements', text: 'Show current maturities of long-term borrowings under Short-term borrowings, as Schedule III amended in 2021 requires.' },
    { topicId: 'company-financial-statements', text: 'Show calls in advance and unpaid dividend under Other current liabilities, and the provision for tax under Short-term provisions.' },
    { topicId: 'company-financial-statements', text: 'Show loose tools and stores and spares under Inventories, and capital work-in-progress under Non-current assets.' },
    { topicId: 'company-financial-statements', text: 'Show a debit balance of the Statement of Profit and Loss as a negative figure under Reserves and Surplus, never on the assets side.' },
    { topicId: 'company-financial-statements', text: 'Disclose contingent liabilities in the notes to accounts and keep them out of the balance sheet total.' },
    { topicId: 'company-financial-statements', text: 'Put bank charges under other expenses, and the discount on debentures written off under finance costs.' },
    // Financial statement analysis
    { topicId: 'financial-statement-analysis', text: 'Divide the change by the previous year\'s figure, never by the current year\'s.' },
    { topicId: 'financial-statement-analysis', text: 'Take revenue from operations as 100 in a common size Statement of Profit and Loss, and total assets as 100 in a common size balance sheet.' },
    { topicId: 'financial-statement-analysis', text: 'Work the percentage change of a total or a profit from its own two figures; never add up the percentages of its lines.' },
    { topicId: 'financial-statement-analysis', text: 'Read a move in a common size percentage as percentage points of the base, not as the percentage change of the amount.' },
    { topicId: 'financial-statement-analysis', text: 'Mark every decrease with brackets or a minus sign, so it cannot be read as an increase.' },
    // Accounting ratios
    { topicId: 'accounting-ratios', text: 'Leave both inventories and prepaid expenses out of quick assets.' },
    { topicId: 'accounting-ratios', text: 'Count only long-term borrowings and long-term provisions as debt; short-term borrowings and trade payables stay out.' },
    { topicId: 'accounting-ratios', text: 'Take the proprietary ratio on total assets unless the question names capital employed as the base.' },
    { topicId: 'accounting-ratios', text: 'Use the cost of revenue from operations and the average inventory in the inventory turnover ratio, not revenue or closing inventory.' },
    { topicId: 'accounting-ratios', text: 'Use profit before interest and tax for the interest coverage ratio and for return on investment.' },
    { topicId: 'accounting-ratios', text: 'Before you answer "no change" when both terms move by the same amount, check whether the ratio is exactly 1 : 1.' },
    // Cash flow statement
    { topicId: 'cash-flow-statement', text: 'Start the operating activities from net profit before tax, not from the closing Surplus or its change alone.' },
    { topicId: 'cash-flow-statement', text: 'Adjust the profit or loss on sale of a fixed asset in the operating activities, and show the whole sale proceeds under investing activities.' },
    { topicId: 'cash-flow-statement', text: 'Leave cash, short-term borrowings and the provision for tax out of the working capital changes.' },
    { topicId: 'cash-flow-statement', text: 'For a non-financing company, show interest and dividend received under investing activities and interest and dividend paid under financing activities.' },
    { topicId: 'cash-flow-statement', text: 'Leave non-cash transactions, such as an asset bought by issuing shares, out of the statement altogether.' },
    { topicId: 'cash-flow-statement', text: 'Show the previous year\'s proposed dividend, with any interim dividend, as the dividend paid this year.' },
    // Computerised Accounting (the other choice of Part B)
    { topicId: 'computerised-accounting', text: 'Deduct the salvage value from the cost before dividing by the life in SLN; leaving it in gives a charge that is too high.' },
    { topicId: 'computerised-accounting', text: 'Charge the written down value rate, and the rate of DB, on the book value at the start of each year, never on the cost again.' },
    { topicId: 'computerised-accounting', text: 'Work the interest of each instalment of a loan on the balance left at the start of the year, not on the amount first borrowed.' },
    { topicId: 'computerised-accounting', text: 'Bracket every term of a formula that is a sum or a difference: =(B2-B3)/B4, not =B2-B3/B4.' },
    { topicId: 'computerised-accounting', text: 'Record cash paid into or drawn from the bank through a contra voucher, not a payment or receipt voucher.' },
    { topicId: 'computerised-accounting', text: 'Create outstanding expenses under Current Liabilities and prepaid expenses under Current Assets, not under the expense groups.' },
  ],
};

export default TIPS;
