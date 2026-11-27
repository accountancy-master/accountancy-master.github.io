import { isAssertionReason } from './ids';

// Templates added after the mock papers, the worksheets and the Look back levels were settled. They stand on levels of
// their own (and in the Playground and the Marathon), but no paper, worksheet or Look back level draws on them: those
// are made from what the bank holds, so a new template there would change every one already set. Add the id of a new
// template to its class's list; an Assertion-Reason template (`<prefix>-assertion-reason`) is outside by its id. A new
// authored question goes in the same list (ids are unique across templates and questions): the papers and worksheets
// draw on authored questions too.

const CLASS11: readonly string[] = [
  // Topics: introduction-to-accounting, theory-base, accounting-equation, journal-entries, ledger.
  // introduction-to-accounting
  'ia-voucher-kind',
  'ia-quality-parts',
  'ia-match-columns',
  // theory-base
  'thb-standards-benefits', 'thb-as1-disclosure', 'thb-gst-accounts', 'thb-cash-vs-accrual',
  // accounting-equation
  'ae-effect-more',
  'ae-totals-more',
  'ae-column-value',
  'ae-fmt-closing-equation',
  // journal-entries
  'je-gst-set-off-intra', 'je-gst-set-off-igst', 'je-gst-payment',
  'je-purchase-trade-cash-immediate', 'je-sale-trade-cash-immediate', 'je-asset-gst',
  // ledger
  'led-fmt-close-nominal', 'led-fmt-journal-cash', 'led-fmt-journal-party',
  // Topics: cash-book, subsidiary-books, bank-reconciliation, trial-balance, rectification-of-errors.
  'cb-nature-totals', 'cb-nature-month', 'cb-nature-complex', 'cb-endorse-entry', 'cb-endorse-where', 'cb-gst-amount', 'cb-gst-entry', 'cb-fmt-petty-full',
  'sb-fmt-return-book-gst', 'sb-fmt-gst-book-mixed',
  'tb-fmt-redraft', 'tb-fmt-redraft-stock',
  'brs-bills-items', 'brs-cash-column', 'brs-previous-period', 'brs-result-nature', 'brs-fmt-extracts',
  'roe-carry-forward', 'roe-wrong-balance-bd', 'roe-combined-error', 'roe-omitted-balance', 'roe-suspense-balances', 'roe-fmt-effect',
  // Topics: depreciation, provisions-and-reserves, final-accounts, final-accounts-adjustments, incomplete-records.
  // depreciation
  'dep-fmt-machines-sale', 'dep-fmt-provision-sale', 'dep-set-machines-sale', 'dep-odd-date-half-month', 'dep-odd-date-days', 'dep-odd-date-sale',
  // provisions-and-reserves
  'pr-capital-profit-kinds', 'pr-fmt-provisions-extract', 'pr-fmt-provisions-extract-discount',
  'pr-q-092', 'pr-q-093', 'pr-q-094', 'pr-q-095',
  // final-accounts
  'fa-complex-gp-adjusted', 'fa-heads-combined', 'fa-marshalling-order', 'fa-fmt-trading-adjusted',
  'fa-q-037', 'fa-q-038', 'fa-q-039', 'fa-q-040', 'fa-q-041', 'fa-q-042', 'fa-q-043',
  // final-accounts-adjustments
  'faa-entry-discount-provision', 'faa-entry-fire-trading', 'faa-set-debtors-commission', 'faa-fmt-trading-fire',
  // incomplete-records
  'ir-interest-additional-capital', 'ir-fmt-affairs-adjusted',
];

const CLASS12: readonly string[] = [
  // Topics: partnership-fundamentals, goodwill, change-in-profit-sharing-ratio, admission-of-a-partner.
  'pf-iod-flat-rate', 'pf-iod-loss-year', 'pf-guarantee-two', 'pf-past-adj-years', 'pf-fmt-appropriation-short',
  'gw-weighted-loss-year', 'gw-super-avg-capital', 'gw-super-nti-income', 'gw-fmt-normal-profits', 'gw-fmt-super-profit',
  'cpr-gw-super-profit', 'cpr-fmt-balance-sheet-fixed',
  'adm-premium-from-profits', 'adm-je-premium-from-profits', 'adm-je-revaluation-more', 'adm-fmt-current-accounts', 'adm-fmt-balance-sheet-fixed',
  // Topics: retirement-and-death-of-a-partner, dissolution-of-partnership, share-capital, debentures.
  'ret-wcr-claim', 'ret-ifr', 'ret-earmarked-share', 'ret-current-transfer', 'ret-death-mid-month', 'ret-suspense-close',
  'ret-set-fixed-capitals', 'ret-fmt-current-accounts',
  'dis-wcr-claim', 'dis-ifr', 'dis-current-close', 'dis-fmt-capitals-fixed',
  'sc-entry-reissue-partly-paid', 'sc-entry-forfeiture-premium-call',
  'deb-interest-accrued', 'deb-where-shown',
  // Topics: company-financial-statements, financial-statement-analysis, accounting-ratios, cash-flow-statement, computerised-accounting.
  'fs-bs-item-more', 'fs-total-trade-receivables', 'fs-total-ppe',
  'ar-from-statements-current', 'ar-from-statements-quick', 'ar-from-statements-debt-equity', 'ar-from-statements-inventory-turnover',
  'ar-from-statements-net-profit', 'ar-effect-turnover-profit',
  'cf-fin-debentures-redeemed', 'cf-interest-paid-outstanding', 'cf-loan-current-maturities', 'cf-financing-board',
  'cf-fmt-financing-board', 'cf-fmt-statement-notes', 'cf-fmt-statement-investments', 'cf-fmt-statement-loss',
  'cas-fmt-loan-schedule-board', 'cas-pmt-formula', 'cas-payroll-if', 'cas-payroll-formula',
];

const OUTSIDE = new Set([...CLASS11, ...CLASS12]);

/** True for a template or an authored question that no mock paper, worksheet or Look back level draws on. */
export const outsidePapers = (templateId: string): boolean => isAssertionReason(templateId) || OUTSIDE.has(templateId);
