import { describe, expect, it } from 'vitest';
import { CASES, TEMPLATES } from '@/generators';
import { isAssertionReason } from '@/generators/ids';
import { contentHash } from '@/testing/contentHash';
import { CBSE12 } from './courses/cbse12';
import { PART_B_TOPICS } from './courseOptions';

// What the Class 12 generators and cases make must not move when something is built beside them. The hash below was
// taken on the code before Computerised Accounting (the other choice of Part B) was added, over every Class 12
// template and case there was then; leaving out the templates of the new topic, it is still the same, so no question
// of a learner on the default choice moved. The Assertion-Reason templates, added after it, are left out here too: the
// value below did not move for them, so every question there was before is still what it was.
//
// When it fails and Class 12 content was meant to change (a template with a new `version`, a new template or case),
// run the test, check that only what was meant to move moved, and put the new value here with a line saying why.
// Moved by the quality pass of partnership-fundamentals, goodwill, change-in-profit-sharing-ratio and
// admission-of-a-partner: 13 templates and 2 cases raised to version 2 for the errors the audit found
// (pf-no-deed-loan-interest, pf-ioc-opening-from-closing, pf-iod-product, pf-current-balance, pf-set-loan-charge,
// case-pf-interest-year, case-pf-commission-loan, gw-super-find-years, cpr-who-changes, cpr-sacrificing-ratio,
// cpr-gaining-ratio, cpr-rev-result, cpr-single-direction, cpr-cap-complex, cpr-bs-total), and 17 new templates (the
// ids under the first Class 12 comment line of generators/outsidePapers.ts). Leaving those 32 out, the hash is
// 7c2a59c89cd730752abc5a50a5a898ea2659939b26d849b7f367eab39d97adc5 both on the code before the pass (whose whole hash was
// 7aa3fdf8b81350e2ecec67b3bde8e8304e625abe9cae4518d0330edf09412860) and after it, so no other Class 12 question moved.
// The review of the pass then changed two of those new templates only (gw-weighted-loss-year: a whole weighted average;
// adm-fmt-balance-sheet-fixed: an old partner's current account may stand in debit), moving the whole hash from
// 6a9f1baacf0831221337a93010aa1dbe2ae6eeb6e5286fbbc86913d50070b7c1; the hash without the 32 is still 7c2a59c8... above.
// Moved by the quality pass on company-financial-statements, financial-statement-analysis, accounting-ratios and
// cash-flow-statement (after the Class 12 audit), through 38 templates raised to version 2 and 17 new ones only.
// Raised: the 32 fs templates whose generic hints were replaced or which drew bank charges or Share Options
// Outstanding (fs-form-facts, fs-meaning-facts, fs-bs-major-head, fs-el-sub-head-tricky, fs-el-which-under,
// fs-assets-which-under, fs-bs-two-items, fs-cnc-split-amount, fs-cnc-loan-instalments, fs-spl-line,
// fs-spl-which-under, fs-spl-materials-consumed, fs-spl-total-income, fs-spl-employee-benefits, fs-spl-other-expenses,
// fs-spl-finance-costs, fs-spl-finance-costs-premium, fs-spl-profit-before-tax, fs-total-inventories,
// fs-total-cash-equivalents, fs-total-short-term-borrowings, fs-total-other-current-liabilities,
// fs-total-current-liabilities, fs-total-reserves-surplus, fs-note-share-capital, fs-total-shareholders-funds,
// fs-contingent-total, fs-fmt-bs-equity-liabilities, fs-fmt-balance-sheet, fs-fmt-spl, fs-fmt-spl-worked,
// fs-fmt-note); fsa-limitation-spot, fsa-objective-or-not, fsa-cs-missing-line; ar-proprietary; cf-classify-activity,
// cf-non-cash-effect. New (outside the papers): fs-bs-item-more, fs-total-trade-receivables, fs-total-ppe,
// ar-from-statements-current, -quick, -debt-equity, -inventory-turnover, -net-profit, ar-effect-turnover-profit,
// cf-fin-debentures-redeemed, cf-interest-paid-outstanding, cf-loan-current-maturities, cf-financing-board,
// cf-fmt-financing-board, cf-fmt-statement-notes, cf-fmt-statement-investments, cf-fmt-statement-loss. Leaving those
// 55 out, the hash is c6b125931b92c36d2165647ac5531201f54e60030f79ab8e07b9070513146d53 both before the change
// (560 of the 598 templates there were; with all 598 it was the value pinned before,
// 7aa3fdf8b81350e2ecec67b3bde8e8304e625abe9cae4518d0330edf09412860) and after it, so no other template or case moved.
// Moved again by the examiner's review of that pass, through one case only: case-cy-issue-five-ways (version 2), which
// now says when no part of the loan falls due within twelve months (1890441415013eca25d8a07ba3443e2f2242aeec6ff118b2d348179cc3e4d510
// before it). Leaving out the 55 templates above and that case, the hash is
// 529673165d48133959ca54dbc3a307f73aea881f090228dfb762bdf354be86c4 on the code before the quality pass, after it, and
// after the review, so nothing else moved. The value below is with them all.
// It is also the value with every group of the quality pass merged, plus the release's pronoun fixes: those raised no
// Class 12 template (the Class 12 text they changed is authored glossary and tips only), and the hash did not move.
const CLASS12_HASH = '08d21ba91d25bb6e1e227bef0cd205d5fba943f28f04a43789e7e80b17b0ce1f';

const before = new Set(CBSE12.topics.map((t) => t.id).filter((id) => !PART_B_TOPICS.computerised.includes(id)));
const templates = TEMPLATES.filter((t) => before.has(t.topicId) && !isAssertionReason(t.id));
const cases = CASES.filter((c) => before.has(c.topicId));

describe('Class 12 content', () => {
  it('is what it was before Computerised Accounting: every template and case makes the same questions from the same seeds', () => {
    expect([templates.length, cases.length]).toEqual([648, 95]);
    expect(contentHash(templates, cases)).toBe(CLASS12_HASH);
  }, 180_000);
});
