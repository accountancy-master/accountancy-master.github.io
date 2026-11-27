import type { CaseTemplate } from '../types';
import accountingBasics from './accounting-basics';
import accountingCycle from './accounting-cycle';
import analysis from './analysis';
import assetLife from './asset-life';
import booksAndErrors from './books-and-errors';
import cashAndBank from './cash-and-bank';
import companyAccounts from './company-accounts';
import companyYear from './company-year';
import conceptsInPractice from './concepts-in-practice';
import computerisedAccountingCases from './computerised-accounting-cases';
import dissolution from './dissolution';
import errorsAndSuspense from './errors-and-suspense';
import finalAccounts from './final-accounts';
import firmLife from './firm-life';
import incompleteRecordsCases from './incomplete-records-cases';
import partnershipAccounts from './partnership-accounts';
import provisionsReservesCases from './provisions-reserves-cases';
import reconstitution from './reconstitution';
import wholeYear from './whole-year';

/**
 * A stage of the accounting cycle that has case studies. Its cases are played once the student has finished the
 * topic named here (the last one a case of this stage needs), and they count towards that topic under the concept
 * named here.
 */
export interface CaseStage {
  id: string;
  /** The topic a student has finished when these cases open; the cases appear at the end of its ladder. */
  topicId: string;
  /** The concept the questions of these cases belong to. The registry adds it to the topic's pack. */
  conceptId: string;
  title: string;
  description: string;
  cases: CaseTemplate[];
}

/** Every stage, in the order a student meets them. A case author only ever edits their own stage's file. */
export const CASE_STAGES: CaseStage[] = [
  {
    id: 'accounting-cycle',
    topicId: 'trial-balance',
    conceptId: 'tb-case',
    title: 'From transactions to the trial balance',
    description: 'One business, one month: journalise the transactions, find the ledger balances and prepare the trial balance.',
    cases: accountingCycle,
  },
  {
    id: 'cash-and-bank',
    topicId: 'bank-reconciliation',
    conceptId: 'brs-case',
    title: 'Cash book to bank reconciliation',
    description: 'Write up the cash and bank columns for a period, then reconcile the bank balance with the pass book.',
    cases: cashAndBank,
  },
  {
    id: 'errors-and-suspense',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-case',
    title: 'Finding and correcting errors',
    description: 'A trial balance that does not agree: open the Suspense account, rectify each error and find the corrected profit.',
    cases: errorsAndSuspense,
  },
  {
    id: 'books-and-errors',
    topicId: 'rectification-of-errors',
    conceptId: 'roe-integrated',
    title: 'Books, bank and errors together',
    description: 'One business over a month or two: its entries, subsidiary books, cash book and bank, ledger and trial balance, and the errors found in them.',
    cases: booksAndErrors,
  },
  {
    id: 'asset-life',
    topicId: 'depreciation',
    conceptId: 'dep-case',
    title: 'The life of an asset',
    description: 'Follow one asset from purchase through yearly depreciation to its sale, and find the profit or loss.',
    cases: assetLife,
  },
  {
    id: 'provisions-reserves-cases',
    topicId: 'provisions-and-reserves',
    conceptId: 'pr-case',
    title: 'Provisions and reserves at the year end',
    description: 'One business at its year end: bad debts and the provision for doubtful debts, the charges against profit, and the reserves made out of what is left.',
    cases: provisionsReservesCases,
  },
  {
    id: 'final-accounts',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-case',
    title: 'Trial balance to final accounts',
    description: 'From a trial balance and its adjustments to gross profit, net profit and the balance sheet.',
    cases: finalAccounts,
  },
  {
    id: 'whole-year',
    topicId: 'final-accounts-adjustments',
    conceptId: 'faa-integrated',
    title: 'The whole year of a business',
    description: "All of Class 11 together: the year's transactions and the bank, depreciation, provisions and errors, through to the final accounts.",
    cases: wholeYear,
  },
  {
    id: 'incomplete-records-cases',
    topicId: 'incomplete-records',
    conceptId: 'ir-case',
    title: 'A trader without full books',
    description: "Capital at two dates from the statements of affairs, then drawings, capital brought in, and the year's profit or loss with its adjustments.",
    cases: incompleteRecordsCases,
  },
  // The stages of the two theory topics that open Class 11, added after the papers were set: outside them
  // (`STAGES_OUTSIDE_PAPERS` in learning/paperBlueprints.ts), and listed after the other stages of the course so that
  // none of those moves.
  {
    id: 'accounting-basics',
    topicId: 'introduction-to-accounting',
    conceptId: 'ia-case',
    title: 'Accounting in a small business',
    description: 'One business and its first weeks: the terms of accounting, capital and revenue items, and who needs which information.',
    cases: accountingBasics,
  },
  {
    id: 'concepts-in-practice',
    topicId: 'theory-base',
    conceptId: 'thb-case',
    title: 'Concepts followed or broken',
    description: "What an accountant did, one decision at a time: name the concept, assumption or principle each follows or breaks.",
    cases: conceptsInPractice,
  },
  // Class 12 (docs/content-plan.md). A stage belongs to the course of its topic.
  {
    id: 'partnership-accounts',
    topicId: 'partnership-fundamentals',
    conceptId: 'pf-case',
    title: 'Sharing the profit of a firm',
    description: "One firm, one year: pass the appropriation entries, prepare the Profit and Loss Appropriation Account and write up the partners' accounts.",
    cases: partnershipAccounts,
  },
  {
    id: 'reconstitution',
    topicId: 'retirement-and-death-of-a-partner',
    conceptId: 'ret-case',
    title: 'A firm that changes its partners',
    description: 'A partner joins or leaves: revalue the assets, adjust goodwill and the capital accounts, and prepare the new balance sheet.',
    cases: reconstitution,
  },
  {
    id: 'dissolution',
    topicId: 'dissolution-of-partnership',
    conceptId: 'dis-case',
    title: 'Closing the books of a firm',
    description: "The firm is dissolved: prepare the Realisation Account, the partners' capital accounts and the Bank Account.",
    cases: dissolution,
  },
  {
    id: 'firm-life',
    topicId: 'dissolution-of-partnership',
    conceptId: 'dis-integrated',
    title: 'The life of a firm',
    description: 'One firm from its first year to its dissolution: sharing profits, goodwill, a change of ratio, a partner joining and leaving, and closing the books.',
    cases: firmLife,
  },
  {
    id: 'company-accounts',
    topicId: 'debentures',
    conceptId: 'deb-case',
    title: 'Shares and debentures of a company',
    description: 'From the issue of shares through forfeiture and reissue, and the issue of debentures, to the balance sheet with its notes.',
    cases: companyAccounts,
  },
  {
    id: 'analysis',
    topicId: 'cash-flow-statement',
    conceptId: 'cf-case',
    title: 'Reading the statements of a company',
    description: 'From two balance sheets of one company: its ratios, and its cash flow statement.',
    cases: analysis,
  },
  {
    id: 'company-year',
    topicId: 'cash-flow-statement',
    conceptId: 'cf-integrated',
    title: 'A company from its issue to its analysis',
    description: 'One company: its shares and debentures, its statements in the Schedule III form, comparative and common size analysis, its ratios and its cash flow statement.',
    cases: companyYear,
  },
  // The option of Part B: shown only to a learner who takes Computerised Accounting (content/courseOptions.ts).
  {
    id: 'computerised-accounting-cases',
    topicId: 'computerised-accounting',
    conceptId: 'cas-case',
    title: 'A business on a computerised system',
    description: 'Schedules, reconciliations and ratios worked on a sheet; the codes, vouchers, year-end entries and security of a computerised system.',
    cases: computerisedAccountingCases,
  },
];

export const CASES: CaseTemplate[] = CASE_STAGES.flatMap((s) => s.cases);
