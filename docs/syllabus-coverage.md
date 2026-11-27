# Syllabus coverage: CBSE Accountancy (055), 2025-26

Every line of the CBSE 2025-26 curriculum for Class 11 and Class 12, checked against what the app teaches and
practises: the topic packs (`src/content/cbse11/*.ts`, `src/content/cbse12/*.ts`), the generators
(`src/generators/templates/*.ts`, ids given), the sets and formats on the topic ladders, and the case studies
(`src/generators/cases/*.ts`). The syllabus lines are paraphrased, not quoted.

Status:

- **Covered well**: taught (concept, cards or lesson) and practised (generators, authored questions, sets, formats or
  cases).
- **Covered thinly**: named in a card or a lesson, with little or no practice.
- **Missing**: neither taught nor practised.
- **Beyond scope**: the app teaches something the syllabus leaves out.

Checked on 23 October 2026, from commit b059267 (with the fixes listed at the end). Updated the same day when every
line covered thinly got practice of its own (see "Practice added for the thin lines" at the end).

## Class 11

Counts: **49 covered well, 0 covered thinly, 0 missing** (Incomplete Records, missing at the check, is built since); 4 items beyond scope
(2 fixed in the check, 2 marked "beyond the syllabus" and kept off the levels and the mock papers).

### Unit 1: Theoretical framework

| Syllabus line (paraphrased) | Where it is covered | Status | Note |
|---|---|---|---|
| Accounting: meaning, concept, as a source of information, objectives, advantages and limitations | `introduction-to-accounting`: concepts `ia-meaning`, `ia-advantages`; cards ia-card-1, 2, 4, 5, 9, 10, 22; lesson "What Is Accounting?"; generators `ia-branch`, `ia-bk-vs-acc`; questions ia-q-001 to 012, 035 to 043 | Covered well | "Source of information" (accounting as an information system) had no card; ia-card-22 added. |
| Types of accounting information | `introduction-to-accounting`: card ia-card-23; generators `ia-info-type`, `ia-info-need`; questions on level `introduction-to-accounting-role-and-information` | Covered well | Card added in the check; practice added after it. |
| Users of accounting information and their needs | concept `ia-users`; cards ia-card-6, 7; generators `ia-user-profile`, `ia-internal-external`, `ia-user-need`; questions ia-q-019 to 027 | Covered well | |
| Qualitative characteristics of accounting information | concept `ia-qualities`; card ia-card-8; generator `ia-quality-match`; questions ia-q-028 to 034 | Covered well | |
| Role of accounting in business | concept `ia-advantages`; card ia-card-22; generators `ia-role`, `ia-role-limit`; questions on level `introduction-to-accounting-role-and-information` | Covered well | |
| Basic accounting terms: entity, business transaction, capital, drawings, liabilities and assets (current and non-current), expenditure (capital and revenue), expense, revenue, income, profit, gain, loss, purchase, sales, goods, stock, debtor, creditor, voucher, discount (trade and cash) | concepts `ia-assets-liabilities`, `ia-income-expense`, `ia-trade-terms`; cards ia-card-11 to 21; generators `ia-classify-item`, `ia-asset-class`, `ia-liability-class`, `ia-exp-type`, `ia-goods-or-asset`, `ia-classify-two`, `ia-loan-timing`, `ia-define-*`, `ia-term-*`, `ia-financial-transaction`, `ia-profit`, `ia-trade-discount`, `ia-two-discounts`, `ia-trade-receivables`, `ia-capital-from-list`, `ia-assets-total`; questions ia-q-044 to 080 | Covered well | "Entity" also in `theory-base` (business entity concept). |
| Fundamental accounting assumptions; GAAP | `theory-base`: concepts `thb-gaap`, `thb-assumptions`; cards thb-card-1 to 4; generators `thb-gaap-facts`, `thb-assumption-or-principle`, `thb-gc-spread`; questions thb-q-001 to 012 | Covered well | |
| Basic accounting concepts: business entity, money measurement, going concern, accounting period, cost, dual aspect, revenue recognition, matching, full disclosure, consistency, conservatism, materiality, objectivity | concept `thb-principles`; cards thb-card-6 to 13, 24; generators `thb-name-principle` (large scenario bank), `thb-right-treatment`, `thb-two-principles`, `thb-stock-valuation`, `thb-premium-period`, `thb-revenue-amount`, `thb-asset-cost`, `thb-entity-profit`; questions thb-q-013 to 042 | Covered well | |
| System of accounting | concept `thb-systems`; cards thb-card-14, 15; generator `thb-which-system`; questions thb-q-043 to 048 | Covered well | Double entry and single entry. |
| Basis of accounting: cash basis and accrual basis | concept `thb-bases`; cards thb-card-5, 16, 17, 25; generators `thb-which-basis`, `thb-cash-accrual-profit`, `thb-cash-accrual-roll`; case `case-wy-cash-or-accrual`; questions thb-q-049 to 055 | Covered well | |
| Accounting standards: applicability of AS and Ind AS | concept `thb-standards`; cards thb-card-18, 19, 26; generators `thb-standards-facts`, `thb-standards-which-set`, `thb-standards-rule`, `thb-standards-two`; questions thb-q-056 to 064 and those of level `theory-base-standards-applicability` | Covered well | Who follows which set is asked in the plain terms of the course (listed companies and those linked to them, non-corporate entities), with no figure of net worth. |
| GST: characteristics and advantages | concept `thb-gst`; cards thb-card-20, 23; generators `thb-gst-which-tax`, `thb-gst-facts`; questions thb-q-065 to 075 | Covered well | The IGST cross set-off is marked beyond the syllabus (see the end). |

### Unit 2: Accounting process

| Syllabus line (paraphrased) | Where it is covered | Status | Note |
|---|---|---|---|
| Source documents and vouchers; preparing vouchers | `journal-entries`: concept `je-vouchers`, card je-card-28; generators `je-voucher-source-doc`, `je-voucher-contents`, `je-voucher-kind`, `je-voucher-account`, `je-voucher-entry` (the entry a voucher prepared from a document shows), `je-voucher-total`, `je-voucher-count`; questions je-q-036 to 047; levels `journal-entries-vouchers`, `journal-entries-vouchers-practice`. Also ia-card-24, ia-q-077, 078 | Covered well | |
| Accounting equation: meaning and analysis | `accounting-equation`: 9 concepts, cards ae-card-1 to 16, lesson, about 35 generators (`ae-effect*`, `ae-totals-*`, `ae-missing-*`, `ae-closing-*`, ...); cases `case-cycle-accounting-equation`, `case-books-equation-journal-capital`, `case-books-chain-equation-journal-cash` | Covered well | |
| Rules of debit and credit | `journal-entries`: concept `je-rules`; cards je-card-1, 2, 5, 26, 27; generators `je-rules-*` (13) | Covered well | |
| Books of original entry: the journal | `journal-entries`: 17 concepts, about 70 generators, sets `je-set-*` (8); stage `accounting-cycle` | Covered well | |
| Cash book: simple (single column) | `cash-book`: concept `cb-single`; cards cb-card-1 to 3; generators `cb-sc-closing`, `cb-sc-total`, `cb-sc-missing`, `cb-sc-opening`; formats `cb-fmt-single`, `cb-fmt-single-select`; case `case-bank-chain-single-and-petty` | Covered well | |
| Cash book with a bank column | concepts `cb-double`, `cb-contra`, `cb-discount`, `cb-balancing`; cards cb-card-4 to 13; generators `cb-dc-*`, `cb-contra-*`, `cb-disc-*`, `cb-bal-*`; set `cb-set-contra-week`; formats `cb-fmt-double`, `cb-fmt-overdraft`, `cb-fmt-discount`, `cb-fmt-month`; cases `case-bank-week-two-columns`, `case-bank-chain-*`, `case-books-overdraft-month`, `case-books-three-column-cash-book` (v2) | Covered well | The course has no discount column; cash discount goes through the Journal Proper (cb-card-9). One case taught a cash book with discount columns: fixed, see the end. |
| Petty cash book | concept `cb-petty`; cards cb-card-14 to 16; generators `cb-pc-*`; set `cb-set-discount-petty`; formats `cb-fmt-petty`, `cb-fmt-petty-book`; cases `case-bank-petty-imprest`, `case-books-petty-cash-ledger`, `case-books-chain-petty-cash-week` | Covered well | |
| Purchases book, sales book, purchases return book, sales return book | `subsidiary-books`: concepts `sb-which-book`, `sb-documents`, `sb-book-totals`, `sb-returns`, `sb-posting`; generators `sb-*` (about 40); formats `sb-fmt-return-book`, `sb-fmt-purchases-book`, `sb-fmt-sales-book`, `sb-fmt-gst-book`; cases `case-cycle-subsidiary-books`, `case-books-day-books-posting-errors`, `case-books-which-book`, `case-books-chain-gst-day-books`, `case-books-chain-trade-discount-books` | Covered well | |
| Journal Proper | concept `sb-journal-proper`; cards sb-card-4, 17; generators `sb-asset-credit-*`, `sb-opening-entry`, `sb-goods-not-sold`, `sb-adjusting-entry`; sets `sb-set-journal-proper`, `sb-set-journal-or-book` | Covered well | |
| Note: trade discount, freight and cartage in simple GST calculations | trade discount with GST: cards sb-card-8 to 12, je-card-8, 24; generators `sb-invoice-total`, `sb-mixed-state-total`, `sb-reverse-gst`, `je-trade-discount`, `je-rules-party-amount*`, `thb-gst-invoice-discount`; freight and cartage: card sb-card-18 (its example now at 18%), generators `sb-freight-facts`, `sb-freight-taxable`, `sb-freight-gst`, `sb-freight-invoice-total`, `sb-freight-entry`; questions sb-q-041 to 044; level `subsidiary-books-freight-gst` | Covered well | GST at 5% or 18% only, on the price after trade discount plus the freight charged on the invoice; cartage paid by the buyer to someone else stays out of the supplier's value. |
| Ledger: format, posting from the journal and the subsidiary books, balancing | `ledger`: 9 concepts, cards led-card-1 to 16, about 30 generators, formats `led-fmt-*`; `subsidiary-books`: `sb-posting`; cases `case-cycle-chain-ledger`, `case-cycle-subsidiary-books` | Covered well | |
| Bank reconciliation statement: need and preparation | `bank-reconciliation`: 11 concepts, cards brs-card-1 to 15, about 40 generators, sets `brs-set-*`, formats `brs-fmt-*`; stage `cash-and-bank` (11 cases) | Covered well | |
| Depreciation: meaning, features, need, causes, factors | `depreciation`: concept `dep-meaning`; cards dep-card-1 to 3, 19; generators `dep-cause`, `dep-purpose`, `dep-feature`, `dep-factor`; factors used in every sum; questions dep-q-033 to 042 on level `depreciation-theory` | Covered well | |
| Depletion and amortisation | card dep-card-20; generators `dep-similar-term`, `dep-similar-terms-together`; questions dep-q-033, 034 | Covered well | The meaning only, as the syllabus asks; no depletion sums. |
| Methods: straight line and written down value (excluding change of method) | concepts `dep-slm`, `dep-wdv`, `dep-part-year`; generators `dep-slm-*`, `dep-wdv-*`, `dep-*-part-year`, `dep-two-*`; sets `dep-set-*`; formats `dep-fmt-*`; stage `asset-life` (12 cases) | Covered well | No change of method is taught anywhere. |
| Difference between the two methods; advantages of each | concept `dep-compare`; cards dep-card-18, 21; generators `dep-method-name`, `dep-compare-diff`, `dep-compare-statement`, `dep-method-choice`, `dep-compare-bv`, `dep-method-advantage`, `dep-method-difference`; questions dep-q-037, 039, 040, 042; cases `case-asset-methods-compared`, `case-asset-chain-two-methods`, `case-wy-method-and-profit` | Covered well | |
| Recording depreciation: charged to the asset account, or a provision for depreciation account | concept `dep-accounting`; cards dep-card-10 to 12; generators `dep-journal-asset`, `dep-journal-provision`, `dep-provision-*`; formats `dep-fmt-provision`; cases `case-asset-provision-disposal`, `case-asset-chain-provision`, `case-wy-machinery-at-cost` | Covered well | |
| Disposal of an asset | concept `dep-sale`; cards dep-card-13 to 17; generators `dep-sale-*`, `dep-journal-sale*`, `dep-disposal-*`; format `dep-fmt-disposal`; cases `case-asset-chain-sale`, `case-asset-chain-disposal`, `case-wy-machine-sold-during-year` | Covered well | |
| Provisions, reserves, and the difference between them | `provisions-and-reserves`: concepts `pr-provision-meaning`, `pr-reserve-meaning`, `pr-difference`; cards pr-card-1 to 5, 16 to 18; generators `pr-provision-or-reserve`, `pr-charge-or-appropriation`, `pr-feature-belongs`, `pr-which-*`, `pr-profit-*`; 88 authored questions | Covered well | |
| Kinds of reserve: revenue, capital, general, specific, secret | concepts `pr-revenue-capital`, `pr-general-specific`, `pr-secret`; cards pr-card-6 to 8; generators `pr-revenue-or-capital`, `pr-general-or-specific`, `pr-named-reserve`, `pr-secret-reserve` | Covered well | |
| Difference between capital reserve and revenue reserve | card pr-card-6; generators `pr-revenue-or-capital`, `pr-capital-profit` | Covered well | |
| (Learning outcome) Reserve and reserve fund | card pr-card-19; generators `pr-reserve-fund-which`, `pr-reserve-fund-difference`, `pr-reserve-fund-amount`; three questions on level `provisions-and-reserves-reserve-fund` | Covered well | |
| Trial balance: objectives, meaning, preparation, by the balance method only | `trial-balance`: concepts `tb-purpose`, `tb-columns`, `tb-totals`, `tb-formats`; cards tb-card-1 to 10; lesson; generators `tb-method` (v2), `tb-totals-method` (v2), `tb-col-*`, `tb-total-*`, `tb-missing-*`; formats `tb-fmt-balances`, `tb-fmt-transactions`; stage `accounting-cycle` | Covered well | Taught the totals method too: fixed, see the end. |
| Errors: omission, commission, principle, compensating; their effect on the trial balance | `rectification-of-errors`: concepts `roe-classes`, `roe-tb-effect`; `trial-balance`: `tb-errors`; generators `roe-class-of-error`, `roe-affects-tb`, `roe-one-or-two-sided`, `roe-which-not-revealed`, `roe-tb-difference`, `roe-net-tb-difference`, `tb-error-*` | Covered well | |
| Detection and rectification: errors that do and do not affect the trial balance | concepts `roe-before-tb`, `roe-two-sided`, `roe-suspense`, `roe-profit`; about 35 generators; sets `roe-set-*` (7); stage `errors-and-suspense` (10 cases) and `books-and-errors` (26 cases) | Covered well | |
| Suspense account | concepts `roe-suspense`, `roe-suspense-balance`, `tb-suspense`; formats `roe-fmt-suspense`, `roe-fmt-suspense-find`; cases `case-roe-chain-entries-and-suspense`, `case-roe-chain-find-difference` | Covered well | |

### Unit 3: Financial statements of a sole proprietorship

| Syllabus line (paraphrased) | Where it is covered | Status | Note |
|---|---|---|---|
| Financial statements: meaning, objectives, importance | `final-accounts`: concept `fa-users`; cards fa-card-1, 20; lesson "What Are Final Accounts?"; generators `fa-user-need`, `fa-statements-meaning`, `fa-statements-importance`; questions fa-q-034, 035 on level `final-accounts-statements-deferred` | Covered well | |
| Revenue and capital receipts; revenue and capital expenditure | concept `fa-capital-revenue`; cards fa-card-2, 3, ia-card-15; generators `fa-capital-revenue-exp`, `fa-capital-revenue-receipt`, `ia-exp-type`; case `case-wy-capital-or-revenue` | Covered well | |
| Deferred revenue expenditure | card fa-card-21; generators `fa-deferred-classify`, `fa-deferred-where`, `fa-deferred-amount`; question fa-q-036 | Covered well | Written off equally over the years that benefit, the rest on the assets side, as fa-card-21 teaches. |
| Opening journal entry | cards je-card-12, sb-card-17; generators `je-opening-entry`, `je-opening-entry-complex`, `sb-opening-entry`; set `je-set-opening-month`; case `case-cycle-chain-opening` | Covered well | |
| Trading and Profit and Loss Account: gross profit, operating profit, net profit; preparation | concepts `fa-trading`, `fa-pl`, `fa-whole`; cards fa-card-4 to 13; generators `fa-gp-*`, `fa-cogs-*`, `fa-np-*`, `fa-operating-profit`, `fa-complex-*`; formats `fa-fmt-trading`, `fa-fmt-pl`, `fa-fmt-loss`; sets `fa-set-*` (closing entries) | Covered well | |
| Balance sheet: need, grouping and marshalling; preparation | concepts `fa-balance-sheet`, `fa-capital`; cards fa-card-14 to 19; generators `fa-bs-*`, `fa-marshalling`, `fa-group-total`, `fa-working-capital`; format `fa-fmt-balance-sheet` | Covered well | "Grouping" was not named in a card; fa-card-16 now names it. |
| Adjustments: closing stock, outstanding and prepaid expenses, accrued income, income received in advance, depreciation, bad debts, provision for doubtful debts, provision for discount on debtors, abnormal loss, goods taken for personal use, interest on capital, manager's commission | `final-accounts-adjustments`: 13 concepts, cards faa-card-1 to 19, about 60 generators (`faa-*`), sets `faa-set-*`, formats `faa-fmt-*`; stages `final-accounts` (13 cases) and `whole-year` (26 cases) | Covered well | Abnormal loss is taught as loss of goods by fire or theft, with and without an insurance claim. Interest on drawings is marked beyond the syllabus (see the end). |
| Goods taken for staff welfare | cards faa-card-16, je-card-17; account `staffWelfare` (Staff Welfare Expenses, in `LATER_CLASS11_ACCOUNTS`, never a filler choice); generators `je-goods-staff-welfare`, `je-goods-staff-welfare-price`, `faa-staff-welfare-where`, `faa-staff-welfare-purchases`, `faa-staff-welfare-effect`; questions je-q-048, 049, faa-q-036, 037; level `final-accounts-adjustments-staff-welfare` and journal-entries level 16 | Covered well | |
| Preparing the Trading and Profit and Loss Account and the Balance Sheet with adjustments | formats `faa-fmt-trading`, `faa-fmt-pl-accruals`, `faa-fmt-pl-provisions`, `faa-fmt-balance-sheet`; cases `case-fa-chain-*`, `case-wy-chain-adjusting-entries-final-accounts`, `case-wy-chain-*-final-accounts` | Covered well | |
| Incomplete records: features, reasons, limitations | `incomplete-records`: concepts `ir-meaning`, `ir-reasons`; cards and lesson; generators and questions of those concepts | Covered well | Built after the check (it was missing then). |
| Profit or loss by the statement of affairs method (excluding the conversion method) | concepts `ir-statement`, `ir-capital`, `ir-profit`, `ir-adjustments`, `ir-formats`; 36 templates in all, among them the formats `ir-fmt-affairs-one`, `ir-fmt-affairs-two`, `ir-fmt-profit`, `ir-fmt-profit-adjusted`; 15 cards | Covered well | Built after the check. Nothing in the app teaches the conversion method. |

Project work (Part C) is done by the student outside the app and is not counted.

## Class 12

Counts: **38 covered well, 0 covered thinly, 0 missing** (the optional Computerised Accounting part, missing at the check, is built since); nothing taught
beyond scope.

### Unit 1: Accounting for partnership firms

| Syllabus line (paraphrased) | Where it is covered | Status | Note |
|---|---|---|---|
| Partnership: features; the partnership deed | `partnership-fundamentals`: concept `pf-features`; cards pf-card-1, 2; lesson; generator `pf-deed-fact` | Covered well | |
| Rules of the Indian Partnership Act, 1932 when there is no deed | concept `pf-no-deed`; card pf-card-3; generators `pf-no-deed-rule`, `pf-no-deed-loan-interest`, `pf-no-deed-profit-share`; case `case-pf-no-deed` | Covered well | |
| Fixed and fluctuating capital accounts | concept `pf-capitals`; card pf-card-4; generators `pf-capital-account-item`, `pf-current-balance`; formats `pf-fmt-capital-accounts`, `pf-fmt-current-accounts`, `pf-fmt-fixed-capital-accounts`; cases `case-pf-chain-fluctuating`, `case-pf-chain-fixed` | Covered well | |
| Profit and Loss Appropriation Account: division of profit; guarantee of profit | concepts `pf-appropriation`, `pf-ioc`, `pf-iod`, `pf-salary-commission`, `pf-guarantee`; about 30 generators; sets `pf-set-*`; formats `pf-fmt-appropriation*`; cases `case-pf-interest-year`, `case-pf-guarantee`, `case-pf-chain-guarantee` | Covered well | |
| Past adjustments (interest on capital, interest on drawings, salary, profit-sharing ratio) | concept `pf-past-adjustments`; card pf-card-17; generators `pf-past-adj-take-back`, `pf-past-adj-ioc` (with salary), `pf-past-adj-ratio`, `pf-past-adj-effect` (interest on drawings); format `pf-fmt-past-adjustments`; cases `case-pf-past-adjustment`, `case-life-loan-interest-omitted` | Covered well | |
| Note: interest on a partner's loan is a charge against profit | card pf-card-15; generators `pf-no-deed-loan-interest`, `pf-loan-interest-profit`, `pf-journal-loan-interest`, `pf-journal-close`; set `pf-set-loan-charge`; case `case-pf-commission-loan` | Covered well | |
| Goodwill: meaning, nature, factors, need for valuation | `goodwill`: concepts `gw-nature`, `gw-kinds`; cards gw-card-1 to 6; generators `gw-nature`, `gw-factor`, `gw-factor-effect`, `gw-need`, `gw-purchased-or-self`, `gw-purchased-amount` | Covered well | |
| Goodwill valuation: average profit, super profit, capitalisation | concepts `gw-average-profit`, `gw-adjustments`, `gw-weighted`, `gw-capital-employed`, `gw-super-profit`, `gw-capitalisation`; about 35 generators; case `case-life-super-profit-twice` | Covered well | |
| Goodwill adjusted through the partners' capital or current accounts | cards cpr-card-6, adm-card-9, ret-card-5; generators `cpr-gw-entry*`, `adm-je-goodwill-not-brought`, `adm-je-goodwill-partly`, `ret-gw-entry-*` | Covered well | |
| Change in profit-sharing ratio: sacrificing and gaining ratio, revaluation, reserves and accumulated profits and losses, Revaluation Account and balance sheet | `change-in-profit-sharing-ratio`: 9 concepts, about 45 generators, sets `cpr-set-*`, formats `cpr-fmt-*`; cases `case-recon-change-ratio`, `case-recon-chain-change-ratio`, `case-recon-earmarked-reserve` | Covered well | |
| Admission: effect on the ratio, goodwill (AS 26), revaluation, reserves and accumulated profits and losses, adjustment of capitals, capital and current accounts, balance sheet of the new firm | `admission-of-a-partner`: 11 concepts, about 45 generators, sets `adm-set-*`, formats `adm-fmt-*`; cases `case-recon-goodwill-premium`, `case-recon-hidden-goodwill`, `case-recon-chain-admission`, `case-life-*-admission` | Covered well | |
| Retirement and death: effect on the ratio, goodwill (AS 26), revaluation, reserves, adjustment of capitals, capital and current accounts, balance sheet; loan account of the retiring partner | `retirement-and-death-of-a-partner`: concepts `ret-ratio` to `ret-capitals`; generators `ret-*`; formats `ret-fmt-revaluation`, `ret-fmt-capitals`, `ret-fmt-loan`, `ret-fmt-balance-sheet`; cases `case-recon-retirement-due`, `case-recon-chain-retirement`, `case-life-retirement-new-ratio` | Covered well | |
| Death: share of profit to the date of death; deceased partner's capital account and executor's account | concepts `ret-death-profit`, `ret-executor`; cards ret-card-16 to 19; generators `ret-death-*`, `ret-exec-*`; formats `ret-fmt-deceased-capital`, `ret-fmt-executor`; cases `case-recon-death-executor`, `case-recon-chain-death`, `case-life-chain-death-executor` | Covered well | |
| Dissolution: meaning, kinds; settlement of accounts; Realisation Account, capital accounts, cash or bank account (no piecemeal distribution, sale to a company or insolvency of a partner) | `dissolution-of-partnership`: 12 concepts, about 40 generators, sets `dis-set-*`, formats `dis-fmt-*`; stages `dissolution` and `firm-life` | Covered well | The three exclusions are respected (stated in the generator and case headers). |
| Notes: an asset whose realised value is not given (tangible at book value, intangible at nil); realisation expenses borne by a partner | cards dis-card-8, 14; generators `dis-value-not-given`, `dis-journal-expenses-paid`, `dis-journal-remuneration`, `dis-expenses-entry`, `dis-expenses-charge`; case `case-dis-expenses` | Covered well | |

### Unit 2: Accounting for companies

| Syllabus line (paraphrased) | Where it is covered | Status | Note |
|---|---|---|---|
| Features and types of companies | `share-capital`: card sc-card-21; generators `sc-company-feature`, `sc-company-type`, `sc-company-rule`, `sc-member-liability`; questions sc-q-049 to 051 on level `share-capital-companies` | Covered well | |
| Share and share capital: nature and types | concept `sc-kinds`; cards sc-card-1 to 3; generators `sc-capital-amounts`, `sc-capital-term`, `sc-reserve-capital` | Covered well | |
| Issue and allotment of equity and preference shares; over- and under-subscription; issue at par and at a premium; calls in advance and in arrears (no interest); issue for consideration other than cash | concepts `sc-issue`, `sc-subscription`, `sc-calls`, `sc-vendor`; about 30 generators (preference shares drawn in `sc-*` issue generators); sets `sc-set-*`; formats `sc-fmt-*`; stages `company-accounts`, `company-year` | Covered well | No interest on calls anywhere. |
| Private placement, ESOP, sweat equity (the concept) | concept `sc-special-issues`; card sc-card-4; generator `sc-special-issue-kind` | Covered well | |
| Forfeiture and reissue of shares | concepts `sc-forfeiture`, `sc-reissue`; generators `sc-forfeit-*`, `sc-entry-forfeiture-*`, `sc-reissue-*`; set `sc-set-forfeiture-reissue`; cases `case-ca-forfeit-reissue`, `case-ca-chain-forfeiture` | Covered well | |
| Share capital in the balance sheet | concept `sc-disclosure`; card sc-card-20; generators `sc-note-share-capital`, `sc-balance-sheet-capital`, `sc-disclosure-where`; formats `sc-fmt-balance-sheet-extract`, `sc-fmt-note-share-capital` | Covered well | |
| Debentures: meaning, kinds; issue at par, premium and discount; issue for consideration other than cash; issue with terms of redemption; collateral security; interest (no TDS) | `debentures`: concepts `deb-meaning` to `deb-interest`; about 40 generators; sets `deb-set-*`; formats `deb-fmt-*`; cases `case-ca-debenture-issue`, `case-ca-collateral`, `case-ca-chain-debentures`, `case-ca-chain-vendor` | Covered well | No redemption entries and no TDS anywhere. |
| Writing off discount or loss on issue: first from Securities Premium, then from the Statement of Profit and Loss as a finance cost | concept `deb-write-off`; cards deb-card-15, 16, fs-card-19; generators `deb-write-off-*`, `deb-journal-write-off`, `deb-complex-*`, `fs-spl-finance-costs-premium`; case `case-cy-premium-meets-loss` | Covered well | |

### Part B: Analysis of financial statements and cash flow statement

| Syllabus line (paraphrased) | Where it is covered | Status | Note |
|---|---|---|---|
| Financial statements of a company: meaning, nature, uses, importance | `company-financial-statements`: concept `fs-meaning`; cards fs-card-1 to 4; generators `fs-meaning-facts`, `fs-use-scenario`, `fs-limitation-scenario` | Covered well | |
| Statement of Profit and Loss and Balance Sheet in the Schedule III form, major heads and sub-heads (exceptional and extraordinary items and discontinued operations excluded) | concepts `fs-bs-*`, `fs-current-non-current`, `fs-spl-*`, `fs-notes-contingent`; about 40 generators; formats `fs-fmt-*` | Covered well | No exceptional or extraordinary items or discontinued operations are taught. |
| Financial statement analysis: meaning, significance, objectives, importance, limitations | `financial-statement-analysis`: concepts `fsa-meaning`, `fsa-users`, `fsa-limitations`; generators `fsa-user-purpose`, `fsa-limitation-spot`, `fsa-objective-or-not` | Covered well | |
| Tools: comparative statements, common size statements, ratio analysis, cash flow analysis | concepts `fsa-types-tools`, `fsa-comparative`, `fsa-common-size`, `fsa-reading`; about 35 generators; formats `fsa-fmt-*`; cases `case-an-comparative-pl`, `case-an-common-size`, `case-cy-chain-*` | Covered well | |
| Accounting ratios: meaning, objectives, advantages, classification, computation | `accounting-ratios`: concept `ar-meaning`; cards ar-card-1 to 4; generators `ar-classify-ratio`, `ar-purpose` | Covered well | |
| Liquidity ratios: current, quick | concept `ar-liquidity`; generators `ar-current-ratio`, `ar-quick-ratio`, `ar-liquidity-*`, `ar-quick-from-current`, `ar-missing-*`; cases `case-an-effect-liquidity`, `case-an-two-ratios` | Covered well | |
| Solvency ratios: debt to equity, total assets to debt, proprietary, interest coverage, debt to capital employed | concept `ar-solvency`; generators `ar-debt-equity*`, `ar-total-assets-debt`, `ar-proprietary`, `ar-interest-coverage*`, `ar-debt-capital-employed`; cases `case-cy-borrow-to-ratio`, `case-cy-interest-cover` | Covered well | |
| Activity ratios: inventory, trade receivables, trade payables, fixed assets, net assets and working capital turnover | concept `ar-activity`; generators `ar-inventory-turnover*`, `ar-trade-receivables-turnover`, `ar-trade-payables-turnover`, `ar-fixed-assets-turnover`, `ar-net-assets-turnover`, `ar-working-capital-turnover` | Covered well | `ar-collection-period` (average collection period) is not named in the syllabus but follows from the trade receivables turnover, as the NCERT book does: kept. |
| Profitability ratios: gross profit, operating, operating profit, net profit (before and after tax), return on investment | concept `ar-profitability`; cards ar-card-15 to 18; generators `ar-gross-profit-ratio`, `ar-operating-ratio`, `ar-operating-profit-*`, `ar-net-profit-ratio`, `ar-return-on-investment*`; case `case-cy-return-on-investment` | Covered well | |
| Cash flow statement: meaning, objectives, benefits, cash and cash equivalents, classification of activities, preparation by the indirect method (AS 3, revised) | `cash-flow-statement`: 11 concepts, about 40 generators, formats `cf-fmt-*`; cases `case-an-cash-flow-heads`, `case-an-chain-cash-flow`, `case-cy-*` | Covered well | Indirect method only. |
| Note: adjustments for depreciation and amortisation, profit or loss on sale of assets and investments, dividends (final and interim), tax | cards cf-card-8 to 11; generators `cf-op-profit-*`, `cf-dep-charged`, `cf-sale-proceeds`, `cf-investments-flow`, `cf-dividend-paid`, `cf-tax-paid` | Covered well | |
| Note: bank overdraft and cash credit as short-term borrowings | card cf-card-17; generator `cf-overdraft-treatment` | Covered well | |
| Note: current investments as marketable securities unless stated | card cf-card-3; generators `cf-cash-equivalent`, `cf-cash-equivalents-total` | Covered well | |
| Note: proposed dividend of the previous year given effect in the current year (AS 4) | card cf-card-8; generators `cf-npbt-*`, `cf-dividend-paid` | Covered well | |
| Part B option: Computerised Accounting (instead of Analysis of Financial Statements and Cash Flow Statement): overview of the system (application, features, structure, generic, specific and tailored software); the electronic spreadsheet in accounting (concept, features, bank reconciliation, depreciation schedules, loan repayment schedule, ratios, graphs and charts); using the system (installation, codification and hierarchy of account heads, creating accounts, data entry, validation and verification, adjusting, closing and opening entries, final accounts, security) | `computerised-accounting`: 10 concepts (`cas-overview` to `cas-formats`), 21 cards, a lesson, 55 authored questions, 43 generators (`cas-*`, with the formats `cas-fmt-sln-schedule`, `cas-fmt-wdv-schedule`, `cas-fmt-loan-schedule`); the learner's choice of Part B in Settings, with its own full mock paper (`docs/content-plan.md`, "The option of Part B") | Covered well | Built after the check. A learner sees it only when Computerised Accounting is chosen as Part B, and then in place of the four topics of the analysis. |

Project work (Part C) is not counted.

## Gaps and items beyond scope

### What should be done (as the check left it; items 2 to 10 are done, see the end)

Class 11:

1. **Incomplete Records** (features, reasons, limitations; profit or loss by the statement of affairs method, no
   conversion method): a new topic. Being built separately.
2. **Vouchers**: a family of practice in `journal-entries` or `introduction-to-accounting`: which source document
   supports a transaction; debit, credit or transfer voucher; fill in the account debited, the account credited and the
   amount of a voucher from a source document.
3. **Freight and cartage with GST**: generators in `subsidiary-books` and `journal-entries`: invoice total with freight
   charged by the supplier (taxable value = price after trade discount + freight); the entry for cartage paid on a bill
   with GST.
4. **Goods given for staff welfare**: a Staff Welfare Expenses account in the Class 11 chart, and the case added to the
   goods families (`je-goods-*`, `faa-entry-*` and the goods withdrawn in the `final-accounts` cases).
5. **Depreciation terms**: choice questions on the features and factors of depreciation, depletion against
   amortisation, and which method suits which asset (cards dep-card-19 to 21 exist now).
6. **Reserve and reserve fund**: a choice family in `provisions-and-reserves`.
7. **Applicability of AS and Ind AS**: a choice family in `theory-base` (which entity follows which).
8. **Role of accounting and the types of accounting information**: a choice family in `introduction-to-accounting`.
9. **Financial statements and deferred revenue expenditure**: choice questions on the meaning, objectives and importance
   of financial statements; a numeric family on deferred revenue expenditure (the charge of the year and the amount
   carried forward).

Class 12:

10. **Features and types of companies**: a choice family in `share-capital` (classify a company; which feature a
    situation shows).
11. **Computerised Accounting** (optional Part B): built, as a choice of Part B in Settings (see the Class 12 table).

### Taught beyond scope

1. **Trial balance by the totals method** (the syllabus allows the balance method only). Fixed in this check, see below.
2. **A cash book with discount columns** in the case `case-books-three-column-cash-book` (the syllabus has the simple
   cash book, the cash book with a bank column and the petty cash book). Fixed in this check, see below. No other
   generator or case used a discount column: every cash book format has cash and bank columns only
   (`CASH_BOOK_COLUMNS`), and the cash book cards and generators send cash discount through the journal.
3. **Interest on drawings of a sole proprietor** (marked beyond the syllabus, see the end). The syllabus list of adjustments names interest on capital
   and the manager's commission, not interest on drawings, yet `final-accounts-adjustments` teaches and practises it
   (cards faa-card-13, 14; generators `faa-int-drawings`, `faa-int-drawings-regular`, `faa-entry-int-drawings`,
   `je-interest-drawings`, `je-interest-drawings-amount`; the `final-accounts` and `whole-year` cases). Decided:
   taken off the Class 11 levels and mock papers and marked beyond the syllabus; the three cases that always asked
   for it ask the same things without it, and the cards that taught it are marked or rewritten (see the end).
4. **Cross set-off of IGST credit** (marked beyond the syllabus, see the end). The syllabus asks for simple GST calculations; `thb-gst-cross-set-off`
   (complex) works the order in which input IGST is used against output IGST, CGST and SGST. The plain set-off under one
   head (`thb-gst-net-payable`, `sb-net-gst-payable`) is simple enough. Decided: taken off every level and the mock
   papers and marked beyond the syllabus.

## Fixed in this check

- **Trial balance, balance method only.** Card tb-card-3 now teaches preparation by the balance method and names the
  totals method only as something other books describe, outside the course; the concept `tb-purpose`, the lesson, the
  level descriptions and the authored questions tb-q-016, 017 and 036 now ask about the balance method. Two generators
  asked for the totals method and were changed, with `version` raised to 2: `tb-method` (which method a statement
  describes) now asks which statement about the balance method is true, and `tb-totals-method` (the debit column from
  side totals) now always asks for the balance method. The case `case-books-ledger-totals-trial-balance` asked for the
  debit column by the totals method; its first question now asks for the balance of Bank A/c (version 2).
  `tb-account-balance` still names the totals method in the reason given for one wrong option, as the slip a learner
  makes; it was left as it is.
- **The cash book without a discount column.** `case-books-three-column-cash-book` (version 2, same id): the business
  keeps a cash book with cash and bank columns, each cash discount is recorded in the Journal Proper, and the error is
  one discount posted wrongly (not posted, or posted to the wrong side of its discount account). Its questions: the
  total discount allowed in the month, the amount entered in the bank column for a cheque received at a discount, a
  party's balance, how a cash discount is recorded, the difference in the trial balance, and the rectifying entry.
- **Cards added or widened** (the gaps of the first list that were a card): ia-card-22 to 24, thb-card-26,
  dep-card-19 to 21, pr-card-19, fa-card-16 (grouping), fa-card-20, 21, faa-card-16 and je-card-17 (staff welfare),
  sb-card-18, sc-card-21.

The Class 11 content hash (`src/content/class11Unchanged.test.ts`) moved because of the two templates and two cases
whose version was raised; leaving those four out, it is the same before and after the change.

## Practice added for the thin lines

Every line that was covered thinly now has generators (each with a `verify`) and authored questions, on levels added
at the end of its topic's ladder with ids of their own (`laterLevels`), so no level a learner has passed moved:

| Item | Topic | Generators | Authored questions | Level(s) |
|---|---|---|---|---|
| Source documents and vouchers | `journal-entries` | 7 | 12 | `journal-entries-vouchers`, `journal-entries-vouchers-practice` |
| Freight and cartage in GST sums | `subsidiary-books` | 5 | 4 | `subsidiary-books-freight-gst` |
| Goods given for staff welfare | `journal-entries`, `final-accounts-adjustments` | 2 + 3 | 2 + 2 | journal-entries level 16, `final-accounts-adjustments-staff-welfare` |
| Depreciation: features, factors, depletion and amortisation, the two methods | `depreciation` | 6 | 10 | `depreciation-theory` |
| Reserve and reserve fund | `provisions-and-reserves` | 3 | 3 | `provisions-and-reserves-reserve-fund` |
| Applicability of AS and Ind AS | `theory-base` | 3 | 3 | `theory-base-standards-applicability` |
| Role of accounting; types of accounting information | `introduction-to-accounting` | 4 | 4 | `introduction-to-accounting-role-and-information` |
| Financial statements; deferred revenue expenditure | `final-accounts` | 5 | 3 | `final-accounts-statements-deferred` |
| Features and types of companies (Class 12) | `share-capital` | 4 | 3 | `share-capital-companies` |

The chart of accounts gained Staff Welfare Expenses A/c (`staffWelfare`), in a list of its own that no generator draws
filler choices or accounts from, so no existing question changed. The Class 11 content hash moved only by the 38 new
Class 11 templates: leaving them out, it is the value it was before.

## Beyond the syllabus

The two families taught beyond the 2025-26 syllabus are kept, marked `beyondSyllabus` with a one-line reason
(`docs/authoring-questions.md`, "Beyond the syllabus"): on no level and in no mock paper; listed in the Playground with a
"Beyond the syllabus" chip; served by a Marathon only when the learner turns on "Include beyond-syllabus practice".

- Interest on drawings of a sole proprietor: templates `faa-int-drawings`, `faa-int-drawings-regular`,
  `faa-closing-capital`, `faa-entry-int-drawings`, `je-interest-drawings`, `je-interest-drawings-amount`; questions
  faa-q-013, faa-q-017, je-q-017, je-q-035; cards faa-card-13 (how it is treated) and faa-card-14 (the average period of
  regular drawings), which teach nothing else: they stand on no revision level and are never handed out for revision,
  and the topic page and the quick sheet show them with the chip.
  - The three cases that always asked about it were rewritten without it, at version 2, and stay on their levels and
    in the mock papers: `case-fa-interest-income` (now "Interest on capital, income due and income in advance": its
    adjustments are interest on capital, income due and income received in advance), `case-wy-proprietor-capital`
    (interest on capital, the goods taken, the net profit and the closing capital) and `case-wy-chain-capital-account`
    (the entries of the year, Capital A/c and the goods taken, with drawings of cash and goods only). Rewriting was
    cleaner than marking: in each, interest on drawings was one adjustment among several, and the case reads as one
    story without it. The Class 11 content hash moved only through these three (see `class11Unchanged.test.ts`).
  - Cards faa-card-18 (what interest on capital does to the closing capital) and je-card-19 (how interest on capital
    is recorded) now teach interest on capital alone; faa-card-19 no longer lists interest on drawings among the
    adjustments that raise the profit.
  - Still met now and then inside mixed templates (a set of adjusting entries, a Profit and Loss Account with several
    adjustments) and in some other cases of the `final-accounts` and `whole-year` stages, which draw it among other
    adjustments: left as they are. Interest on Drawings A/c can also be offered as a wrong account choice of any
    Class 11 entry, as every account of the Class 11 chart can, and the interest on capital of the `final-accounts`
    cases names "the treatment of interest on drawings" as the slip behind one wrong option: changing either would
    move existing questions.
  - Incomplete Records, a sole proprietor topic too, adjusts the profit found for interest on capital only. Every item
    there stood without interest on drawings, so all were rewritten and none is marked: the templates
    `ir-interest-capital` (interest on capital alone), `ir-adjusted-profit`, `ir-net-result-choice` and
    `ir-fmt-profit-adjusted` (the adjustments drawn from the others; the format offers "Less: Goods taken by the
    proprietor" as a wrong row instead), `ir-salary-interest` (the salary taken as drawings and interest on capital),
    `ir-adjust-direction` (the item on interest on drawings is gone) and, for the hint that named it,
    `ir-depreciation-provision`, `ir-outstanding-prepaid` and `ir-loss-adjusted`, each at version 2; card ir-card-13
    (how interest on capital is treated), card ir-card-14 (the layout of the Statement of Profit or Loss), question
    ir-q-021 (net profit after interest on capital, ₹90,000), the lesson block "Putting right what the statements left
    out" and the descriptions of two levels. Every level of the topic keeps the templates and questions it had. The
    Class 11 content hash moved only through those nine templates (see `class11Unchanged.test.ts`).
  - The Class 11 exam tips no longer name it (the balance sheet tip, and the tip on interest on capital as an expense
    that took the place of the one on interest on drawings), nor does the overview of the
    `final-accounts-adjustments` lesson. The glossary keeps the terms "Interest on drawings" and "Average period",
    each now saying that it goes beyond the 2025-26 Class 11 syllabus.
- The order of using IGST credit across heads: template `thb-gst-cross-set-off`; card thb-card on the set-off still
  states the order.
