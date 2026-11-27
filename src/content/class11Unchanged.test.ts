import { describe, expect, it } from 'vitest';
import { CLASS12_ACCOUNTS, resolveAccount } from '@/engine/accounts';
import { CASES, TEMPLATES } from '@/generators';
import { generateCase, generateFrom } from '@/generators/engine';
import { HASH_TEMPLATE_SEEDS, contentHash } from '@/testing/contentHash';
import { CBSE11 } from './courses/cbse11';

// What the Class 11 generators and cases make must not move when something is built beside them (a second course,
// new accounts, new kinds of answer and of format). The hash below was taken before Class 12 was begun.
//
// When it fails and Class 11 content was meant to change (a template with a new `version`, a new template or case):
// run `npm run content:hash` and put the value it prints here. When it was not meant to change, the change that
// made it fail has altered what existing seeds make, and stored attempts and mock papers point at those seeds.
// Moved for the 52 integrated cases of the stages `books-and-errors` and `whole-year`: without them the hash is
// still fd400996824cd0e7b67448ba6268ebd0862214dde806b790ad8109f4af1d3f58, the value taken before Class 12 was begun.
// Moved by the check against the CBSE 2025-26 syllabus (trial balance by the balance method only; the cash book
// without a discount column), which raised to version 2 the templates `tb-method` and `tb-totals-method` and the cases
// `case-books-three-column-cash-book` and `case-books-ledger-totals-trial-balance`. Leaving those four out, the hash
// is 02877c328a79e070b0d0d18d4dc79e1734c0bea46422b2ba372567fade20fafe both before and after the change.
// Moved for the new topic Incomplete Records (its 36 templates, as corrected by its examiner): without them the
// hash is still abab41049ac1d9e0773fcb3b24336affef4d904df092efd2217cd3f4d592c9dc, the value pinned before it, so no
// other Class 11 question moved.
// Moved by the practice added for the thin lines of the syllabus (38 new templates: vouchers, freight and
// cartage, goods given to the staff, the theory of depreciation, the reserve fund, Ind AS and AS, the role and types of
// accounting information, financial statements and deferred revenue expenditure). Leaving those 38 out, the hash is
// 8b30900346af851492ac5e68534bcf9f73b96953009c1ece8aeb3cb55350b2a8, the value before them: no existing question moved
// (marking interest on drawings and the IGST cross set-off as beyond the syllabus changes no question either). The
// examiner's corrections to those new templates moved it once more, and only through them: leaving the 38 out, it is
// still 8b30900346af851492ac5e68534bcf9f73b96953009c1ece8aeb3cb55350b2a8. Both together (Incomplete Records and these)
// give 6a7f50f0d49753057892b0fb2c68d38819f2d7dfcb2715c53496be4a2cf55c9c.
// Moved by taking interest on drawings (beyond the Class 11 syllabus) out of the three cases that always asked about
// it, each raised to version 2: `case-fa-interest-income`, `case-wy-proprietor-capital` and
// `case-wy-chain-capital-account`. Leaving those three out, the hash is
// c00fab799a19365bfbab15a996e6bf82a99db7206089fb63cb5b4098cf2725f0 both before and after the change, so no other
// Class 11 question moved; with them it was 388f34957b4eace2582bfeb677fca01e178e98818e20ea9c770c016c6745d838.
// Moved again by taking interest on drawings out of Incomplete Records, which raised to version 2 the nine templates
// that drew it or named it in a hint: `ir-interest-capital`, `ir-depreciation-provision`, `ir-outstanding-prepaid`,
// `ir-adjust-direction`, `ir-adjusted-profit`, `ir-salary-interest`, `ir-loss-adjusted`, `ir-net-result-choice` and
// `ir-fmt-profit-adjusted`. Leaving those nine out, the hash is
// 87138d9a187f0ac814486717b1938e40114ee65f15c3859f95381c8f2e6385c0 both before and after the change. The value below
// is with them.
// Moved by the 15 Assertion and Reason templates (`<prefix>-assertion-reason`, one for each topic). Leaving those 15 out,
// the hash is still 1207600e81817202336ccf220e8d63b5ebaa23537ede4586a1ec6b53da752324, the value before them, so no
// existing question moved. The examiner's corrections to those 15 moved it once more, and only through them: leaving
// the 15 out, it is still 1207600e81817202336ccf220e8d63b5ebaa23537ede4586a1ec6b53da752324. The value below is with them.
// Moved for the 14 new cases of the stage `incomplete-records-cases`, as corrected by their examiner: leaving those 14 out, the hash is still
// 1207600e81817202336ccf220e8d63b5ebaa23537ede4586a1ec6b53da752324, the value pinned before them, so no other Class 11
// question moved. The stage stays outside the mock papers (`STAGES_OUTSIDE_PAPERS` in learning/paperBlueprints.ts).
// The value below is with the 15 templates and the 14 cases together.
// Moved by the quality pass of introduction-to-accounting, theory-base, accounting-equation, journal-entries and
// ledger: 99 templates raised to version 2 (audit fixes, such as interest on drawings taken out of the journal and
// ledger pools, Purchases and Sales closed to Trading A/c, GST rates that fit the goods; topic hints; named
// businesses), 20 new templates (`outsidePapers`) and the 6 cases of the new stages `accounting-basics` and
// `concepts-in-practice`. Its examiner raised four more to version 2, to take out "he" and "his" (the house rule of
// no gendered pronouns): `ia-goods-or-asset`, `ia-two-discounts`, `ia-closing-stock-flow` and
// `ia-financial-transaction`. Leaving those 129 out, the hash is
// a31199370e6d8e7a48ca039a9b6c26da086c6148df8fbde525320cb7ec9e1e05 both before and after the change (before it, with
// them, it was 2390f2bd0e642ead5494f1061999a1c0307eaac79978edda25401e9497b01d9d), so no other Class 11 question moved.
// The value below is with the 15 templates and the 14 cases together: it was
// 2390f2bd0e642ead5494f1061999a1c0307eaac79978edda25401e9497b01d9d.
// Moved by the quality pass of depreciation, provisions-and-reserves, final-accounts, final-accounts-adjustments and
// incomplete-records, only through the templates and cases it added or raised to version 2. Added (23): dep-fmt-machines-sale,
// dep-fmt-provision-sale, dep-odd-date-half-month, dep-odd-date-days, dep-odd-date-sale, dep-set-machines-sale,
// pr-capital-profit-kinds, pr-fmt-provisions-extract, pr-fmt-provisions-extract-discount, fa-complex-gp-adjusted,
// fa-heads-combined, fa-marshalling-order, fa-fmt-trading-adjusted, faa-entry-discount-provision, faa-entry-fire-trading,
// faa-set-debtors-commission, faa-fmt-trading-fire, ir-interest-additional-capital, ir-fmt-affairs-adjusted and the cases
// case-prc-debtors-year-end, case-prc-charges-and-reserves, case-prc-two-years, case-prc-discount-on-debtors. Raised to
// version 2 (75): dep-method-name, dep-journal-asset, dep-journal-provision, dep-journal-sale, dep-journal-asset-cost,
// dep-disposal-step, dep-disposal-result, dep-journal-sale-compound, dep-feature, dep-factor, dep-similar-term,
// dep-method-advantage, dep-method-difference, dep-similar-terms-together, dep-assertion-reason, pr-revenue-or-capital,
// pr-pdd-amount, pr-pdd-rate, pr-pdd-writeback, pr-pdd-pl-charge-debtors, pr-pdd-net-credit, pr-pdd-discount,
// pr-capital-profit, pr-profit-after-both, pr-depr-two-assets, pr-journal-depr-provision, pr-set-doubtful-debts-two-years,
// fa-gp-basic, fa-direct-indirect, fa-cogs-returns, fa-complex-gp, fa-complex-np, fa-complex-closing-capital,
// fa-complex-bs-total, fa-complex-current-assets, fa-complex-operating, fa-complex-result, fa-complex-markup,
// fa-fmt-balance-sheet, faa-expense-opening-closing, faa-income-opening-closing, faa-provision-new, faa-debtors-net,
// faa-provision-increase, faa-provision-writeback, faa-bad-debts-charge, faa-discount-provision, faa-entry-provision,
// faa-int-capital-introduced, faa-commission-before, faa-commission-after, faa-commission-combined, faa-entry-commission,
// faa-fire-loss, faa-gp-goods-drawn, faa-entry-fire-insured, faa-profit-one, faa-profit-multi, faa-profit-goods,
// faa-pl-build, faa-current-assets, faa-current-liabilities, faa-effects-where, faa-bs-placement, faa-set-proprietor-goods,
// faa-set-year-end, faa-fmt-pl-accruals, faa-fmt-pl-provisions, faa-fmt-balance-sheet, faa-assertion-reason and the
// cases case-fa-full-problem, case-fa-chain-proprietor, case-fa-chain-full, case-wy-chain-adjusting-entries-final-accounts,
// case-ir-adjust-after. Leaving those 98 out, the hash is
// a5679340495cc247d2975d69317f86a75a2ae4bac413e8d9211ef9b3066a8ac2 both before and after the pass, so no other Class 11
// question moved. With them the hash was 89274cc0664055607320cfca32edc8272b10dc7aa153e1b692804387a4506bbd.
// Moved again by the examiner of that pass: five more cases raised to version 2, whose hints of the Profit and Loss
// Account and the Balance Sheet named interest on drawings (beyond the Class 11 syllabus): case-fa-chain-accruals,
// case-fa-chain-debtors, case-fa-chain-loss, case-wy-chain-pass-book-final-accounts and
// case-wy-chain-errors-final-accounts; the other changes of the examiner are to templates and cases of the pass already
// listed above. Leaving all 103 out, the hash is adf326c740e2e12f546f08a2b2d54303bc7ceab355cf0c519db64731d1830113 both
// before the pass and after the examiner, so no other Class 11 question moved.
// Moved by the quality pass of cash-book, subsidiary-books, bank-reconciliation, trial-balance and
// rectification-of-errors: 170 templates of those five topics raised one version each (errors the audit found, real
// hints in place of the default pair, GST rates that fit the goods, wider account banks) and 23 new templates added
// after the papers were set (in `outsidePapers`). Leaving those 193 out, the hash is
// 6ac945851e6ff735d2b28bd1502899394068e688a2a8bcf85bbe0b6879696476 both before the pass (where the full value was
// 2390f2bd0e642ead5494f1061999a1c0307eaac79978edda25401e9497b01d9d) and after it, so no other template and no case
// moved. The examiner's corrections to two of the new templates (tb-fmt-redraft-stock never alters the adjusted
// purchases its data works out; roe-fmt-effect finds the errors after the final accounts) moved it once more, and only
// through them: leaving the 193 out, it is still 6ac945851e6ff735d2b28bd1502899394068e688a2a8bcf85bbe0b6879696476
// (the author's value was 22c1526e6d9f6de736ec63a415e200263fa63d8eb5487ab50b7cc7b27fa7a9c1).
// The value below is with every group of the quality pass together (a0c7d40e52581007b8df20f50d521d0a3126aae40ecb93a835bd3c8c95a6d046),
// plus the release's pronoun fixes (the house rule: no gendered pronouns), which raised ten templates one version each:
// tb-method (4), sb-which-document (3), pr-provision-or-reserve (2), faa-entry-int-capital (2), faa-entry-int-drawings
// (2, beyond the syllabus), faa-commission-before (3), faa-commission-after (3), faa-loss-classify (2),
// faa-effects-where (3) and faa-bs-placement (3). Leaving those ten out, the hash is
// 7df737b80e75e2795d59005101826faff9e64368c7a2dfa637fc288644080506 both before and after the fixes, so nothing else moved.
const CLASS11_HASH = '1be0b4ae486be2882f8091637be0144e29cefddc0e271e3475cc63a2756c895a';

const topics = new Set(CBSE11.topics.map((t) => t.id));
const templates = TEMPLATES.filter((t) => topics.has(t.topicId));
const cases = CASES.filter((c) => topics.has(c.topicId));

describe('Class 11 content', () => {
  it('is what it was: every template and case makes the same questions from the same seeds', () => {
    expect(contentHash(templates, cases)).toBe(CLASS11_HASH);
  }, 120_000);

  it('never offers an account of Class 12, in an entry or among the choices of one', () => {
    const class12 = new Set(CLASS12_ACCOUNTS.map((a) => a.id));
    const ok = (id: string) => !class12.has(id) && (!id.includes(':') || id.startsWith('debtor:') || id.startsWith('creditor:'));
    const questions = [
      ...templates.filter((t) => t.kind === 'journal' || t.kind === 'journal_set').flatMap((t) => Array.from({ length: HASH_TEMPLATE_SEEDS }, (_, i) => generateFrom(t, i + 1))),
      ...cases.flatMap((c) => [1, 2, 3].flatMap((seed) => generateCase(c, seed))),
    ];
    let checked = 0;
    for (const q of questions) {
      if (q.type !== 'journal_entry' && q.type !== 'journal_set') continue;
      const used = q.type === 'journal_entry' ? q.expected : q.entries.flatMap((e) => e.expected);
      for (const id of [...q.accountChoices, ...used.map((l) => l.accountId)]) {
        expect(ok(id), `${q.id}: ${id}`).toBe(true);
        expect(() => resolveAccount(id), `${q.id}: ${id}`).not.toThrow();
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  }, 120_000);
});
