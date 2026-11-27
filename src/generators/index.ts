import { CASES } from './cases';
import { registerCases, registerTemplates } from './loaded';
import accountingEquation from './templates/accounting-equation';
import bankReconciliation from './templates/bank-reconciliation';
import cashBook from './templates/cash-book';
import depreciation from './templates/depreciation';
import finalAccounts from './templates/final-accounts';
import finalAccountsAdjustments from './templates/final-accounts-adjustments';
import incompleteRecords from './templates/incomplete-records';
import introductionToAccounting from './templates/introduction-to-accounting';
import journalEntries from './templates/journal-entries';
import ledger from './templates/ledger';
import provisionsAndReserves from './templates/provisions-and-reserves';
import rectificationOfErrors from './templates/rectification-of-errors';
import subsidiaryBooks from './templates/subsidiary-books';
import theoryBase from './templates/theory-base';
import trialBalance from './templates/trial-balance';
import partnershipFundamentals12 from './templates/partnership-fundamentals';
import goodwill12 from './templates/goodwill';
import changeInProfitSharingRatio12 from './templates/change-in-profit-sharing-ratio';
import admissionOfAPartner12 from './templates/admission-of-a-partner';
import retirementAndDeathOfAPartner12 from './templates/retirement-and-death-of-a-partner';
import dissolutionOfPartnership12 from './templates/dissolution-of-partnership';
import shareCapital12 from './templates/share-capital';
import debentures12 from './templates/debentures';
import companyFinancialStatements12 from './templates/company-financial-statements';
import financialStatementAnalysis12 from './templates/financial-statement-analysis';
import accountingRatios12 from './templates/accounting-ratios';
import cashFlowStatement12 from './templates/cash-flow-statement';
import computerisedAccounting12 from './templates/computerised-accounting';
import type { CaseTemplate, Template } from './types';

export type { CaseTemplate, Template } from './types';
export { FORMAT_KINDS, isFormatKind } from './types';
export { CASES, CASE_STAGES, type CaseStage } from './cases';
export { buildCase, buildInstance, casePartId, genId, isValidSeed, parseCasePartId, parseGenId } from './engine';
export { generateCaseQuestions, generateQuestion, getTemplate } from './loaded';

// Everything at once, for unit tests and scripts, which run in Node and use all of it synchronously. The app does not
// import this file: it loads a topic's templates when something needs them (content/loadTopics.ts).

/** Every template, from one file per topic: a template author only ever edits their own topic's file. */
export const TEMPLATES: Template[] = [
  ...journalEntries,
  ...accountingEquation,
  ...introductionToAccounting,
  ...theoryBase,
  ...ledger,
  ...trialBalance,
  ...cashBook,
  ...subsidiaryBooks,
  ...bankReconciliation,
  ...rectificationOfErrors,
  ...depreciation,
  ...provisionsAndReserves,
  ...finalAccounts,
  ...finalAccountsAdjustments,
  ...incompleteRecords,
  // Class 12, in the order of its catalogue (content/courses/cbse12.ts).
  ...partnershipFundamentals12,
  ...goodwill12,
  ...changeInProfitSharingRatio12,
  ...admissionOfAPartner12,
  ...retirementAndDeathOfAPartner12,
  ...dissolutionOfPartnership12,
  ...shareCapital12,
  ...debentures12,
  ...companyFinancialStatements12,
  ...financialStatementAnalysis12,
  ...accountingRatios12,
  ...cashFlowStatement12,
  ...computerisedAccounting12,
];

registerTemplates(TEMPLATES);
registerCases(CASES);

// Indexed once (on first use) instead of scanned.
let byId: Map<string, Template> | undefined;

/**
 * Non-throwing lookup, for ids that come from stored data. It also finds the template of one question of a case
 * (`<caseId>~<n>`); those are not in `TEMPLATES`, so practice never serves a question of a case on its own.
 */
export function findTemplate(id: string): Template | undefined {
  byId ??= new Map([...TEMPLATES, ...CASES.flatMap((c) => c.parts)].map((t) => [t.id, t]));
  return byId.get(id);
}

/** Non-throwing lookup of a case study. */
export const findCase = (id: string): CaseTemplate | undefined => CASES.find((c) => c.id === id);
