// The generators come first: a pack builds its ladder from its topic's templates as it is imported.
import { CASE_STAGES, TEMPLATES } from '@/generators';
import { JOURNAL_ENTRIES } from './cbse11/journalEntries';
import accountingEquation from './cbse11/accounting-equation';
import bankReconciliation from './cbse11/bank-reconciliation';
import cashBook from './cbse11/cash-book';
import depreciation from './cbse11/depreciation';
import finalAccounts from './cbse11/final-accounts';
import finalAccountsAdjustments from './cbse11/final-accounts-adjustments';
import incompleteRecords from './cbse11/incomplete-records';
import introductionToAccounting from './cbse11/introduction-to-accounting';
import ledger from './cbse11/ledger';
import provisionsAndReserves from './cbse11/provisions-and-reserves';
import rectificationOfErrors from './cbse11/rectification-of-errors';
import subsidiaryBooks from './cbse11/subsidiary-books';
import theoryBase from './cbse11/theory-base';
import trialBalance from './cbse11/trial-balance';
import partnershipFundamentals12 from './cbse12/partnership-fundamentals';
import goodwill12 from './cbse12/goodwill';
import changeInProfitSharingRatio12 from './cbse12/change-in-profit-sharing-ratio';
import admissionOfAPartner12 from './cbse12/admission-of-a-partner';
import retirementAndDeathOfAPartner12 from './cbse12/retirement-and-death-of-a-partner';
import dissolutionOfPartnership12 from './cbse12/dissolution-of-partnership';
import shareCapital12 from './cbse12/share-capital';
import debentures12 from './cbse12/debentures';
import companyFinancialStatements12 from './cbse12/company-financial-statements';
import financialStatementAnalysis12 from './cbse12/financial-statement-analysis';
import accountingRatios12 from './cbse12/accounting-ratios';
import cashFlowStatement12 from './cbse12/cash-flow-statement';
import computerisedAccounting12 from './cbse12/computerised-accounting';
import { CATALOGUE_TOPIC_IDS, COURSE_CATALOGUES } from './courses';
import { topicsMeet } from './courseOptions';
import { withCaseStudyLevels, withLookBackLevels, withQuizLevels } from './ladder';
import { EQUATION_MOVES } from '@/generators/templates/accounting-equation';
import { setEquationMoves } from '@/simulator/moves';
import { installSimQuestions } from '@/simulator/questionSource';
import { registerPack } from './loaded';
import { installOutline } from './outline';
import { outlineOf } from './outlineOf';
import type { Course, TopicPack } from './types';

// Everything at once, for unit tests and scripts, which run in Node and use all of it synchronously. The app does not
// import this file: its screens read the generated outline (outline.ts) and load a topic's pack when something needs
// it (loadTopics.ts), which must give the very pack that is built here (a unit test compares them).

/**
 * The packs as their authors wrote them, from one list: a content author only ever edits their own topic's file.
 * Authored questions that an author left off the ladder are put on quiz levels here, so every question can be reached.
 */
const AUTHORED_PACKS: TopicPack[] = [
  JOURNAL_ENTRIES,
  accountingEquation,
  introductionToAccounting,
  theoryBase,
  ledger,
  trialBalance,
  cashBook,
  subsidiaryBooks,
  bankReconciliation,
  rectificationOfErrors,
  depreciation,
  provisionsAndReserves,
  finalAccounts,
  finalAccountsAdjustments,
  incompleteRecords,
  // Class 12.
  partnershipFundamentals12,
  goodwill12,
  changeInProfitSharingRatio12,
  admissionOfAPartner12,
  retirementAndDeathOfAPartner12,
  dissolutionOfPartnership12,
  shareCapital12,
  debentures12,
  companyFinancialStatements12,
  financialStatementAnalysis12,
  accountingRatios12,
  cashFlowStatement12,
  computerisedAccounting12,
].map(withQuizLevels);

/**
 * Where each topic stands in the catalogues, one course after another: the order a student follows within a course,
 * which is also the order of `PACKS`.
 */
const COURSE_ORDER = new Map(CATALOGUE_TOPIC_IDS.map((id, i) => [id, i]));
const inCourseOrder = (packs: TopicPack[]): TopicPack[] =>
  [...packs].sort((a, b) => (COURSE_ORDER.get(a.topicId) ?? Infinity) - (COURSE_ORDER.get(b.topicId) ?? Infinity));

/** The packs of one course, in its order. A pack of no course (there is none) would belong to none. */
const packsOfCourse = (course: Course, packs: TopicPack[]): TopicPack[] => {
  const ids = new Set(course.topics.map((t) => t.id));
  return inCourseOrder(packs.filter((p) => ids.has(p.topicId)));
};

/**
 * Every pack there is, in course order. Two kinds of level that no pack author writes are added here, after a
 * topic's own levels: a "Look back" level (the topic mixed with the ones before it in its course) on every topic but
 * the first of a course, and then a "Case study" level on the topic of each stage that has cases.
 */
export const ALL_PACKS: TopicPack[] = withCaseStudyLevels(
  COURSE_CATALOGUES.flatMap((course) => withLookBackLevels(packsOfCourse(course, AUTHORED_PACKS), topicsMeet)),
  CASE_STAGES,
);

/**
 * The packs that can be played: the ones with at least one level, in course order (the order of the catalogue, so
 * "the first topic" means the first one a student meets). Every screen and every practice session uses these.
 */
export const PACKS: TopicPack[] = ALL_PACKS.filter((p) => p.levels.length > 0);

/**
 * A topic whose pack has levels is available whatever the catalogue says; one without keeps the status the
 * catalogue gives it ("Coming soon", "Planned"), so nothing but the pack has to change to open a topic.
 */
const withAvailability = (course: Course): Course => ({
  ...course,
  topics: course.topics.map((t) => (PACKS.some((p) => p.topicId === t.id) ? { ...t, status: 'available' } : t)),
});

export const COURSES: Course[] = COURSE_CATALOGUES.map(withAvailability);

/** The playable packs of one course, in its order: what a learner of that course can meet. */
export const packsOf = (courseId: string): TopicPack[] => {
  const course = COURSES.find((c) => c.id === courseId);
  return course ? packsOfCourse(course, PACKS) : [];
};

/** Non-throwing lookup, for ids that come from stored data. */
export const findCourse = (id: string): Course | undefined => COURSES.find((x) => x.id === id);

export function getCourse(id: string): Course {
  const c = findCourse(id);
  if (!c) throw new Error(`Unknown course: ${id}`);
  return c;
}

// What is in memory here is what there is: the outline says so too, and every pack can be looked up.
installOutline(outlineOf(PACKS, TEMPLATES, CASE_STAGES));
for (const pack of PACKS) registerPack(pack);
// And what the simulator records, made again from its ids (simulator/questionSource.ts).
setEquationMoves(EQUATION_MOVES);
installSimQuestions();

export { findQuestion, getQuestion, getTopicPack } from './loaded';
export { templatesForConcept, topicSize, type TopicSize } from './outline';
