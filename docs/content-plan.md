# Content plan — CBSE Class 11 Accountancy question bank

Goal: a large, exam-oriented question bank on every Class 11 topic, built from seeded generators
(multiple-choice with named-mistake distractors, typed-amount answers with recognised common errors,
journal entries) plus authored theory questions and rule cards. Full book-format input screens
(ledger, cash book, final accounts) come later; until then those topics are practised through
amounts, entries and choices.

How to write content: `docs/authoring-questions.md`. Every generator must pass the harness
(`npx vitest run src/generators src/content`) and appear sensibly in `npm run content:report`.

## Targets per topic

| Kind of topic | Generators | Authored questions | Cards | Levels |
|---|---|---|---|---|
| Practical | 30 or more | 25 or more | 12 or more | 10–12 |
| Theory | 15 or more (classification and scenario generators) | 60 or more | 15 or more | 8–10 |

A generator counts only if it produces genuinely different questions across seeds: several scenario
wordings, wide amount ranges, and, where it fits, different unknowns (ask for X in one variant and
for Y in another). Spread difficulty roughly 40% easy, 40% medium, 20% complex. Complex questions
are multi-step, give information indirectly, or include a distractor fact, as CBSE papers and
entrance tests (CA Foundation, CUET) do.

## House rules

- CBSE Class 11 scope only. No partnership, company accounts, ratios or cash flow.
- Original wording. Never copy sentences or problems from any textbook.
- Indian context: ₹ with Indian digit grouping, Indian names and trades, GST where the topic needs it.
- Choose numbers so every answer is exact (whole rupees unless the topic is about paise).
- Every wrong option and every "common error" is a real mistake a student makes, named in plain words.
- Explanations show the working, one step per line, in the standard format the exam expects.
- State each convention the question relies on (for example "depreciation is charged for the full year").
- Where textbooks differ on a treatment, word the question so only one answer is defensible.
- Keep to the CBSE syllabus of the year (2025-26). What goes further (interest on drawings of a sole proprietor, the
  order of using IGST credit across heads) is marked `beyondSyllabus` with a one-line reason: it stays on no level and
  in no mock paper, is shown with a "Beyond the syllabus" chip in the Playground, and comes into a Marathon only when
  the learner turns on "Include beyond-syllabus practice" (`docs/authoring-questions.md`, "Beyond the syllabus").
- GST in a sum is worked at 5% or 18% only, on the price after trade discount plus any freight or cartage the
  supplier charges on the invoice.

## Topics, concepts and generator families

### accounting-equation (practical)
Concepts: the equation; effect of a transaction on assets, liabilities and capital; finding a missing
figure; closing capital; profit from opening and closing capital.
Families: missing figure (any one of A, L, C); totals after a list of 3–6 transactions; effect of one
transaction (which elements rise or fall, by how much); which transaction leaves the totals unchanged;
closing capital = opening + additional capital + profit − drawings (ask for any term); classify an item.

### introduction-to-accounting (theory)
Concepts: meaning and process of accounting; bookkeeping versus accounting; objectives; users and
their needs; qualitative characteristics; advantages and limitations; basic terms (assets and their
classes, liabilities and their classes, capital, drawings, revenue, expense, expenditure, profit,
gain, loss, purchases, sales, goods, stock, debtors, creditors, voucher, discount).
Families: classify an item (current/non-current asset, current/non-current liability, capital,
revenue, expense); internal or external user and what they want; capital or revenue expenditure;
term from a described situation; which step of the accounting process; goods versus asset for a
given kind of business.

### theory-base (theory)
Concepts: GAAP; fundamental assumptions (going concern, consistency, accrual); principles (business
entity, money measurement, accounting period, full disclosure, materiality, prudence, historical
cost, matching, dual aspect, revenue recognition, objectivity); cash and accrual bases; accounting
standards, IFRS and Ind AS; GST basics.
Families: name the principle a scenario follows or breaks (large scenario bank); profit under cash
basis versus accrual basis (typed amount); GST amounts for intra-state and inter-state supplies;
input tax credit set-off and net GST payable; assumption or principle; true statements about
standards.

### journal-entries (practical, exists — extend)
Add generators for: opening entry; outstanding and prepaid expenses; accrued income and income
received in advance; bad debts and bad debts recovered; depreciation charged; goods withdrawn for
personal use; goods given as charity or free samples; loss of goods by fire or theft, with and
without an insurance claim; interest on capital and on drawings; bank charges and interest credited
by the bank; purchase and sale of an asset on credit; cheque received, deposited and dishonoured;
advance received or paid; compound entries with several debits or credits; salary paid after
deductions. Add choice and typed-amount generators for the rules of debit and credit (which account,
which type, which side, what amount) so that concept has many questions.

### ledger (practical)
Concepts: posting from the journal; "To" and "By"; balancing an account; debit and credit balances;
opening balances; which accounts normally show which balance.
Families: balance of an account after a list of postings (typed amount and Dr/Cr choice); which side
an item is posted on, in which account; the wording of the posting ("To Sales A/c" and so on);
closing balance carried down and brought down; total of a side; identify the wrongly posted item;
personal account balance: who owes whom.

### trial-balance (practical)
Concepts: purpose; debit and credit columns; which balances go where; totals; errors it does and does
not reveal; suspense account opening balance.
Families: total of the trial balance from a list of balances; find the missing balance that makes it
agree; which column an account goes in; the difference to put in suspense and on which side; does
this error affect agreement (the four classes of error); corrected total after fixing a misplaced
balance.

### cash-book (practical)
Concepts: single column; double column (cash and bank); contra entries; discount; petty cash book and
the imprest system; balancing.
Families: closing cash balance after a day's or week's transactions; closing bank balance including
an opening overdraft; which side and which column; is it a contra entry; amount to be reimbursed
under imprest; petty cash balance; cheque received and deposited the same day versus later; total of
the receipts side.

### subsidiary-books (practical)
Concepts: purchases book, sales book, purchases return and sales return books, journal proper; trade
discount; GST columns; which transaction goes in which book; posting totals.
Families: which book records this transaction; invoice value after trade discount and GST; total of
the purchases or sales book for a set of invoices; net purchases or net sales after returns; what is
not recorded in the purchases book (cash purchases, assets); posting of the book total; debit note or
credit note.

### bank-reconciliation (practical)
Concepts: why balances differ; timing differences; errors; starting from cash book or pass book
balance; favourable balance and overdraft.
Families: balance as per pass book from the cash book balance with 3–6 items (and the reverse);
the same starting from an overdraft; add or deduct for one item given the starting point; which
items appear only in the cash book or only in the pass book; adjusted (amended) cash book balance;
effect of a casting error.

### rectification-of-errors (practical)
Concepts: classes of error (omission, commission, principle, compensating); one-sided and two-sided
errors; rectifying entries before and after the trial balance; suspense account.
Families: the rectifying entry (journal kind) for a described error; class of error; does it affect
the trial balance and by how much; suspense account balance after a set of corrections; effect of an
error on profit (overstated or understated, by how much); which side is short.

### depreciation (practical)
Concepts: causes and need; straight line method; written down value method; depreciation for part
of a year; asset account versus provision for depreciation account; profit or loss on sale of an
asset.
Families: annual depreciation under each method; depreciation for a part year (months in use);
book value after n years; rate from cost, scrap value and life; profit or loss on sale;
total depreciation charged till the date of sale; year-n depreciation under written down value;
journal entries for charging depreciation and for sale; compare the two methods in a given year.

### provisions-and-reserves (theory with some amounts)
Concepts: provision versus reserve; revenue and capital reserves; general and specific reserves;
secret reserves; provision for doubtful debts; provision for depreciation.
Families: provision or reserve for a described item; revenue or capital reserve; amount of new
provision for doubtful debts and the charge to profit and loss given old provision, bad debts and
debtors; charge against profit or appropriation of profit; true statements.

### final-accounts (practical, without adjustments)
Concepts: trading account and gross profit; profit and loss account and net profit; balance sheet;
direct and indirect expenses; marshalling of assets and liabilities; capital and revenue items;
opening and closing stock.
Families: gross profit from a list of balances; cost of goods sold; net profit; which statement and
which side an item goes to; direct or indirect expense; total of the balance sheet; closing capital;
operating profit; current assets total; classify an item as capital or revenue.

### final-accounts-adjustments (practical)
Concepts: closing stock; outstanding and prepaid expenses; accrued income and income received in
advance; depreciation; bad debts and provision for doubtful debts; interest on capital and drawings;
manager's commission; goods taken for personal use or lost.
Families: amount of an expense to charge after an outstanding or prepaid adjustment; where the two
effects of an adjustment are shown; provision for doubtful debts after further bad debts; net profit
after a set of adjustments; manager's commission on profit before and after charging it; debtors
figure in the balance sheet; the adjusting journal entry; interest on capital with capital introduced
during the year.

### incomplete-records (practical)
Syllabus scope: incomplete records, their features, reasons and limitations, and profit or loss by the statement of
affairs method. The conversion method is excluded and never asked; there are no sets of entries, since the method
records none.
Concepts: meaning and features; reasons and limitations; the statement of affairs and how it differs from a balance
sheet; capital at the beginning and at the end; profit or loss = closing capital + drawings - additional capital -
opening capital; adjusting the profit found (interest on capital and on drawings, depreciation, provisions,
outstanding and prepaid expenses, accrued income); the two formats.
Families: capital from a list (with private items to leave out); profit with drawings, with capital brought in, with
both, and a loss; drawings in cash, goods at cost, private bills and a salary the proprietor takes; an unknown
opening capital, drawings or additional capital; a missing asset found from a known profit; the adjustments one by
one and together; the effect of a slip on the profit; capital brought in as an asset beside a loan that is not capital.
Formats: the statement of affairs on one date and on two dates in two columns; the Statement of Profit or Loss, and
with the adjustments.

## Order of work

1. Foundation (generator kinds, registry, harness, authoring helpers, empty topic files).
2. Full chart of accounts for Class 11 and journal generators that state their entry directly.
3. Topics written in parallel, one author per topic, each in its own files.
4. One accounting review per topic from the content report; fixes.
5. Integration: several topics on every screen (topics list, practice, dashboard, quick sheets),
   browser tests, hand-over.

## Case studies

A case study is one scenario with four to eight linked questions (`docs/authoring-cases.md`). Cases are grouped in
stages; each stage opens at the end of the topic named, and uses only topics up to that one.

| Stage (file in `src/generators/cases/`) | Opens after | Families |
|---|---|---|
| `accounting-cycle` | Trial Balance | first month of a new business (cash only); credit dealings and returns; opening balances then a month; transactions with GST; subsidiary books posted to the ledger; the accounting equation through a set of transactions |
| `cash-and-bank` | Bank Reconciliation Statement | a week in the double column cash book; cash book balance to pass book balance; starting from the pass book; overdraft; amended cash book then reconciliation; petty cash on imprest beside the main cash book |
| `errors-and-suspense` | Rectification of Errors | a trial balance that disagrees, with one-sided errors; two-sided errors and their effect on profit; mixed errors and the Suspense account; errors found before and after the trial balance; errors in the subsidiary books; corrected net profit |
| `asset-life` | Depreciation | straight line from purchase to sale; written down value with a part year; provision for depreciation and asset disposal accounts; two machines bought on different dates, one sold; the two methods compared on one asset; cost of an asset with installation, then depreciation |
| `provisions-reserves-cases` | Provisions and Reserves | doubtful debts at one year end (the provision, the charge, the debtors shown); charges first and reserves after (depreciation through a provision, a first provision for doubtful debts, a transfer to General Reserve, a capital reserve from the gain on land); a provision over two years ending in a charge or a write-back. Outside the mock papers (`STAGES_OUTSIDE_PAPERS`) |
| `final-accounts` | Final Accounts with Adjustments | trial balance with closing stock only; outstanding, prepaid and depreciation; bad debts and provision for doubtful debts; interest on capital and drawings; manager's commission and goods withdrawn; a full problem with five or six adjustments |
| `incomplete-records-cases` | Incomplete Records | capital at two dates; what was drawn and brought in; a fall in capital; loans and sales that are not capital; a lost opening figure; an unknown drawings or capital; an overdraft; adjustments made after the comparison or in the closing statement; two years; a slip in the working; the statements themselves. Outside the mock papers (`STAGES_OUTSIDE_PAPERS`) |

Target: six or more case generators per stage, about 1 easy, 3 medium, 2 complex.

# Class 12 Accountancy (CBSE, code 055)

A second course, `cbse-12-accountancy`, beside Class 11. A learner chooses a course; each course has its own
topics, case stages and mock papers, and a Class 11 learner never meets Class 12 material on the path.

Scope is the CBSE curriculum for 2025-26, which the 2026-27 guides repeat: no not-for-profit organisations; no
redemption of debentures (only issue "with terms of redemption"); no interest on calls; no TDS on debenture
interest; dissolution without piecemeal distribution, sale to a company or insolvency of a partner; cash flow by
the indirect method only. Part B is Financial Statement Analysis by default; a school may take Computerised Accounting
in its place, and a learner says so in Settings ("Part B of Class 12", `src/content/courseOptions.ts`; see "The option
of Part B" below).

| Part | Unit | Marks |
|---|---|---|
| A | 1. Accounting for Partnership Firms | 36 |
| A | 2. Accounting for Companies | 24 |
| B | 3. Analysis of Financial Statements | 12 |
| B | 4. Cash Flow Statement | 8 |
| B (option) | 4. Computerised Accounting, in place of units 3 and 4 | 20 |

Paper: 80 marks, 3 hours, 34 questions: twenty of 1 mark, six of 3, three of 4, five of 6. Part A is questions 1
to 26 (sixteen 1-mark, four 3-mark, two 4-mark, four 6-mark = 60); Part B is 27 to 34 (four 1-mark, two 3-mark,
one 4-mark, one 6-mark = 20).

## Targets per topic

As for Class 11 (see the top of this file), and from the start every practical topic also gets sets of entries
and formats: 30 or more generators, 25 or more authored questions, 12 or more cards, a lesson, a ladder; then 3
to 5 sets and 3 to 6 formats; then the chained cases of its stage. Theory-heavy topics follow the theory targets.

## House rules added for Class 12

- Partners and companies have Indian names; a firm has two to four partners; ratios are given in lowest terms.
- A ratio answer is typed as a ratio (3:2, 5:3:2); a "times" answer as a number with up to two decimals.
- State in every question: whether capitals are fixed or fluctuating; whether goodwill is brought in cash,
  withdrawn, or adjusted through capital accounts; the accounting year; for interest, the dates and the rate.
- Goodwill follows AS 26: only purchased goodwill is recorded; goodwill already in the books is written off among
  the old partners in the old ratio; a share of goodwill not brought in is adjusted through capital (or current)
  accounts.
- Interest on a partner's loan is a charge against profit (6% p.a. in the absence of a deed); interest on capital,
  salary and commission are appropriations.
- Dissolution: an asset whose realised value is not given is realised at book value if tangible and at nil if
  intangible; who pays realisation expenses is always stated.
- Companies: discount or loss on issue of debentures is written off in the year of allotment, first from
  Securities Premium, then to the Statement of Profit and Loss as a finance cost. Use the account names the chart
  gives.
- Company statements follow Schedule III to the Companies Act, 2013; exceptional and extraordinary items are out.
- Cash flow: bank overdraft and cash credit are short-term borrowings; current investments are marketable
  securities unless stated; proposed dividend of the previous year is paid in the current year.

## Topics, concepts and generator families

## The option of Part B: Computerised Accounting

CBSE lets a school teach Computerised Accounting as Part B in place of Analysis of Financial Statements (units 3 and 4).
The choice is the learner's (`Profile.class12PartB`, set in Settings, kept with the learner and carried by backups;
none set is Analysis of Financial Statements). The topics of the two choices are in `src/content/courseOptions.ts`:
the analysis has `company-financial-statements`, `financial-statement-analysis`, `accounting-ratios` and
`cash-flow-statement`; Computerised Accounting has `computerised-accounting`, last in the catalogue so that no topic
before it moved. A learner meets the topics of the choice made and never those of the other: Topics, What's inside,
Practice, Marathon, the maps, Go to, the glossary, the exam pack, the mock papers and worksheets all read the learner's
choice (`outlinesOf(courseId, choice)`, `courseFor`, `useCourse`). What a learner did in a topic of the other choice is
kept apart (`apartForChoice` in `src/app-state/progressLoad.ts`): its XP counts, its mastery and mistakes wait until the
choice is made again. A topic's Look back draws only on the topics before it that it meets (`topicsMeet`).

Papers: the full paper of a learner who takes Computerised Accounting keeps Part A section for section (the same paper
number sets the same Part A) and sets Part B from the one unit, as the sample paper does: four 1-mark, two 3-mark, one
4-mark and one 6-mark question (20 marks); the 6-mark question is a loan repayment schedule to prepare (the unit's case
studies stay outside the papers). Its key starts
`cas.` (`cas.full.3`), so that it is always rebuilt from its own bank; a worksheet of it says so in its code (in the
place of the difficulty, which a paper has none of). The papers of every other learner are exactly what they were (a
unit test pins their hash).

### computerised-accounting (practical; Part B option)
Scope, after the NCERT book in substance: an overview of the computerised accounting system (meaning and application,
features, structure, generic, specific and tailored software); the electronic spreadsheet in accounting (concept,
features, depreciation schedules, a loan repayment schedule, the bank reconciliation statement, ratios, graphs and
charts); using a computerised accounting system (installation, codification and the hierarchy of account heads, creating
accounts, data entry by vouchers, validation and verification, adjusting, closing and opening entries, the final
accounts, the need for security and its features).
Concepts: `cas-overview`, `cas-structure`, `cas-spreadsheet`, `cas-sheet-apps`, `cas-charts`, `cas-codification`,
`cas-data-entry`, `cas-final-accounts`, `cas-security`, `cas-formats`.
Families: the feature, limitation, component or stage a situation shows; the kind of software for a business; cells in a
range; what a formula returns (arithmetic, SUM, AVERAGE, MAX and MIN, IF); which function does a job; what a copied
formula becomes with relative, absolute and mixed references, and the value it shows; SLN, a straight line schedule, a
written down value schedule, DB and its rate; PMT, the interest and principal parts of an instalment (IPMT, PPMT) and the
balance after some instalments; the pass book balance a sheet works out, and the formula for it; ratios from cells and
the formula for a ratio; the chart for a purpose and the angle of a slice; the code of a ledger and the ledger of a code,
methods of coding, the group and sub-group of a ledger, the steps of setting up; the voucher for a transaction, the
validation check that refuses an entry, verification; the security feature at work; adjusting, closing and opening
entries through a journal voucher, and the capital after the closing entries.
Conventions (stated in every prompt that relies on them): a spreadsheet function is described in plain words beside its
name; SLN is (cost - salvage) ÷ life; DB charges a fixed rate 1 - (salvage ÷ cost)^(1 ÷ life), rounded to three decimal
places, on the book value at the start of each period, and the figures are chosen so the rate is exact (20% to 50%) and
every amount whole; PMT is loan × r × (1 + r)^n ÷ ((1 + r)^n - 1) for yearly instalments at the end of each year, with
rates a bank or finance company charges on a business loan (8%, 10%, 12%, 12.5%, 15%) and loans chosen so every
instalment, interest and principal is a whole rupee; interest of a
year is the balance at its start × r; a code follows only the scheme the prompt sets out; entries are those of a sole
trader, depreciation credited to the asset account.
Formats: a straight line depreciation schedule (easy), a written down value schedule (medium), a loan repayment schedule
(complex: the 6-mark question of the paper).

### partnership-fundamentals (practical; Unit 1)
Concepts: features and the deed; rules in the absence of a deed; fixed and fluctuating capitals; Profit and Loss
Appropriation Account; interest on capital; interest on drawings; salary, commission and interest on a partner's
loan; guarantee of profit; past adjustments.
Families: what applies without a deed; interest on capital with capital brought in or withdrawn during the year,
and when profit is insufficient; interest on drawings by the product method and by the average period (monthly,
quarterly, at the start, middle or end); commission before and after charging it; each partner's share of the
divisible profit; guarantee by the firm, by one partner, by partners in a ratio; the single adjusting entry for
an omission or a wrong ratio; charge against profit or appropriation; entries for each appropriation.
Sets and formats: the appropriation entries; Profit and Loss Appropriation A/c; partners' capital accounts
(fluctuating) and capital with current accounts (fixed), in columns; a statement of past adjustments.

### goodwill (practical; Unit 1)
Concepts: nature and factors; need for valuation; average profit (simple and weighted, with abnormal items
adjusted); super profit; capitalisation of average profit and of super profit; normal profit and capital employed.
Families: adjusted average profit; goodwill at n years' purchase; weighted average; normal profit; super profit;
goodwill by each method (ask any term); capital employed from a balance sheet extract; which factor raises
goodwill; purchased or self-generated.

### change-in-profit-sharing-ratio (practical; Unit 1)
Concepts: sacrificing and gaining ratio; goodwill on a change; reserves and accumulated profits and losses;
revaluation of assets and reassessment of liabilities; the single adjusting entry when balances are left as they
are; balance sheet after the change.
Families: sacrifice or gain of each partner; the goodwill entry; distribution of reserves; revaluation profit or
loss and each partner's share; the one entry that adjusts reserves and revaluation without altering book values;
capitals after the change.
Sets and formats: entries on a change; Revaluation A/c; partners' capital accounts; balance sheet.

### admission-of-a-partner (practical; Unit 1)
Concepts: new ratio and sacrificing ratio (each standard case); premium for goodwill: brought in cash, withdrawn,
not brought, partly brought, goodwill already in the books; hidden goodwill; revaluation; reserves and
accumulated profits; adjustment of capitals on the basis of the new partner's capital and of the old partners'
capitals; balance sheet of the new firm.
Families: new ratio when the share is taken equally, in a ratio, from one partner, or the old partners keep their
ratio; sacrificing ratio; goodwill entries for each case; hidden goodwill from the capitals; revaluation; capital
of the new partner for a share, and old partners' capitals in proportion with the cash to bring or withdraw.
Sets and formats: entries on admission; Revaluation A/c; capital accounts in columns; balance sheet.

### retirement-and-death-of-a-partner (practical; Unit 1)
Concepts: new and gaining ratio; goodwill on retirement; revaluation and reserves; amount due to the retiring
partner and its settlement, loan account with interest; adjustment of the remaining partners' capitals; death:
share of profit to the date of death by time and by turnover; the deceased partner's capital account and the
executor's account.
Families: gaining ratio in each case; the goodwill entry; amount due on retirement; loan account balance after n
instalments with interest; share of profit to the date of death; amount due to the executor; capitals of the
remaining partners in the new ratio.
Sets and formats: entries; Revaluation A/c; capital accounts; retiring partner's loan A/c over two or three
years; deceased partner's capital A/c and executor's A/c; balance sheet.

### dissolution-of-partnership (practical; Unit 1)
Concepts: dissolution of partnership and of the firm; settlement of accounts and its order; Realisation Account;
assets and liabilities taken over by partners; unrecorded assets and liabilities; realisation expenses (paid by
the firm, by a partner, borne by a partner for a fee); partner's loan, loan to a partner, loan from a relative;
closing the capital accounts and the bank account.
Families: profit or loss on realisation; the entry for each kind of item (taken over, unrecorded, expenses in
each form, the partner's loan); final payment to each partner; which accounts go to Realisation and which do not
(cash, fictitious assets, reserves, partner's loan); the order of payment.
Sets and formats: dissolution entries; Realisation A/c; capital accounts; Bank A/c.

### share-capital (practical; Unit 2)
Concepts: kinds of company and of share capital (authorised, issued, subscribed, called-up, paid-up); issue at
par and at premium, money payable in instalments; under- and over-subscription with pro rata allotment; calls in
arrears and in advance (no interest); issue for consideration other than cash; private placement, ESOP and sweat
equity as concepts; forfeiture and reissue, capital reserve; disclosure in the balance sheet and its note.
Families: money due and received on each instalment; excess application money adjusted on pro rata allotment;
calls in arrears; shares issued to a vendor at par and at a premium; forfeiture entry (premium received or not);
maximum discount on reissue; amount to capital reserve when all or some forfeited shares are reissued; share
capital in the note to accounts.
Sets and formats: issue entries through to the final call; forfeiture and reissue entries; the bank account of
the issue; the balance sheet extract with its note.

### debentures (practical; Unit 2)
Concepts: debentures and their kinds; issue at par, premium and discount; issue for consideration other than
cash; the six cases of issue with terms of redemption; debentures as collateral security; interest on
debentures; writing off discount or loss on issue.
Families: entries on issue in each case; loss on issue; number of debentures to a vendor; interest for a year or
part year; amount written off from Securities Premium and from the Statement of Profit and Loss; collateral
security: entry or no entry, and disclosure.
Sets and formats: issue entries; interest entries for a year; the balance sheet extract.

### company-financial-statements (theory with classification; Unit 3)
Concepts: meaning, nature, uses and limits of financial statements; the Schedule III balance sheet: major heads
and sub-heads; the Statement of Profit and Loss: its lines; notes to accounts; current and non-current;
contingent liabilities and commitments.
Families: under which major head and sub-head an item is shown (a large item bank); current or non-current from
the operating cycle and twelve months; which line of the Statement of Profit and Loss; totals of a head from a
list; employee benefits, finance costs, other expenses.
Formats: a balance sheet in the Schedule III form from a list of balances; a Statement of Profit and Loss.

### financial-statement-analysis (practical; Unit 3)
Concepts: meaning, objectives, significance and limitations of analysis; horizontal and vertical analysis;
comparative statements; common size statements.
Families: absolute change and percentage change of a line; common size percentage of a line (on revenue from
operations, on total assets); reading a comparative statement; which tool answers which question.
Formats: a comparative balance sheet or Statement of Profit and Loss; a common size statement.

### accounting-ratios (practical; Unit 3)
Concepts: liquidity (current, quick); solvency (debt to equity, total assets to debt, proprietary, interest
coverage, debt to capital employed); activity (inventory, trade receivables, trade payables, fixed assets, net
assets and working capital turnover); profitability (gross profit, operating, operating profit, net profit
before and after tax, return on investment).
Families: each ratio from given figures; a missing figure from a ratio; the effect of a transaction on a ratio
(improve, reduce, no change), which is a standard board question; two ratios from one set of data; working
capital and current assets from the current and quick ratios; cost of revenue from operations and average
inventory.

### cash-flow-statement (practical; Unit 4)
Concepts: cash and cash equivalents; operating, investing and financing activities, for financing and
non-financing companies; net profit before tax and extraordinary items; non-cash and non-operating adjustments;
changes in working capital; investing and financing flows from account analysis.
Families: classify an item; net profit before tax; operating profit before working capital changes; cash from
operations after working capital changes; cash from operating activities after tax; purchase or sale of a fixed
asset from the asset and accumulated depreciation accounts; dividend and interest paid; proceeds of shares and
borrowings; net increase in cash.
Formats: cash flow from operating activities; investing and financing sections; the full statement from two
balance sheets and additional information.

## Case stages (after the topic banks)

| Stage | Opens after | Chains |
|---|---|---|
| partnership-accounts | partnership-fundamentals | appropriation entries → Profit and Loss Appropriation A/c → capital and current accounts |
| reconstitution | retirement-and-death-of-a-partner | Revaluation A/c → partners' capital accounts → balance sheet, on admission and on retirement |
| dissolution | dissolution-of-partnership | Realisation A/c → capital accounts → Bank A/c |
| company-accounts | debentures | issue, forfeiture and reissue entries → balance sheet extract with notes |
| analysis | cash-flow-statement | ratios from a set of statements; a full cash flow statement |
| computerised-accounting-cases | computerised-accounting (the option of Part B) | depreciation schedules, SLN and DB; a loan schedule, PMT, IPMT and PPMT; a BRS and ratios on a sheet; codes, vouchers and validation; adjusting and closing entries; moving from manual books; security. Shown only to a learner who takes the option, and outside the mock papers |

## Order of work

1. Foundation: the second course and its choice by the learner; the accounts Class 12 needs; ratio and "times"
   answers; accounts with more than two amount columns; statements with negative figures and percentages; the
   Class 12 mock paper blueprints; empty topic files.
2. Topic banks, one author per topic, each then examined.
3. Sets and formats per topic, examined.
4. Case stages, examined.
