import { PART_B_COURSE, partBOf, type CourseChoice } from '@/content/courseOptions';

// The mock papers, as data. Everything about what a paper contains is here: change a figure and the paper changes
// (a unit test checks that every blueprint still adds up). How the questions are chosen is in mockPaper.ts. Every
// course has its own three papers (a full paper, a half-yearly paper and a topic test), set from its own topics.

/** The marks a question of a paper can carry. */
export const MARK_VALUES = [1, 3, 4, 6] as const;
export type MarkValue = (typeof MARK_VALUES)[number];

export const PAPER_KINDS = ['full', 'half', 'topic'] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

/** The topics a section draws on. */
export type SectionTopics =
  /** Every playable topic of one unit of the course catalogue (the unit's name there). */
  | { unit: string }
  /** The first topics of the course, in course order. */
  | { first: number }
  /** The one topic the learner chose (a topic test). */
  | { chosen: true };

export interface PaperSection {
  /** The part of the paper the section is printed in; left out on a paper without parts. */
  part?: string;
  /** What the section is called on the paper. */
  title: string;
  topics: SectionTopics;
  /** The marks of the section: what its questions must add up to. */
  marks: number;
  /** How many questions of each mark value. */
  questions: Record<MarkValue, number>;
}

export interface PaperBlueprint {
  kind: PaperKind;
  title: string;
  marks: number;
  minutes: number;
  sections: PaperSection[];
  /**
   * Stages of case studies (ids of CASE_STAGES) whose cases the 6-mark questions favour: the integrated stages, whose
   * one case draws on several topics as the long questions of the examination do. In a section whose topics close
   * such a stage, and while it has cases, it takes the first 6-mark turn on two papers of every three, and the other
   * stages of its topic wait until the rest have had theirs; on the third paper the stages of the section take their
   * turns as on any paper, so every stage that has cases is still drawn (`caseTurns` in mockPaper.ts).
   */
  favouredStages?: readonly string[];
}

/**
 * Where the questions of each mark value come from.
 * - 1 mark: a choice question, generated (`templateKinds`) or authored (`questionTypes`).
 * - 3 and 4 marks: a worked question from a template of one of `templateKinds`, of the first difficulty in
 *   `difficulties` that the topic has.
 * - 6 marks: one whole case study of a stage whose topic is among the section's topics (a topic may close several
 *   stages: each of them takes turns). Its marks are shared among its questions. Only a stage that has cases and is
 *   not in `STAGES_OUTSIDE_PAPERS` takes a turn; when the section's topics have none to give, a 6-mark question is
 *   `fallback` instead, so that the paper still adds up. A full paper may favour some stages (`favouredStages`).
 * - `sets`: a set of journal entries ("Journalise the following transactions", a `journal_set` template) is a
 *   question of the mark value that names its difficulty, because the difficulty of a set is its length: three or
 *   four entries for 3 marks, four or five for 4 marks, six to eight for 6 marks. Its marks are shared among its
 *   entries. For 3 and 4 marks it is dealt with the worked questions of the first difficulty. For 6 marks it is the
 *   last 6-mark question of a section that has several (the others are case studies), and it stands where a stage
 *   has no case to give, before the fallback. A topic gives at most one such set to a paper.
 * - `formats`: a format the student prepares (an account or a statement, an `account` or `statement` template) is a
 *   4-mark question when it is easy or medium and a 6-mark question when it is complex. Its marks are shared among
 *   its rows. It is dealt exactly as a set of the same mark value is: for 4 marks with the worked questions of the
 *   first difficulty, for 6 marks in the place of a set (a topic gives a paper at most one 6-mark set or format).
 */
export const MARK_SOURCES = {
  1: { templateKinds: ['mcq'], questionTypes: ['mcq', 'true_false'], difficulties: ['easy', 'medium', 'complex'] },
  3: { templateKinds: ['numeric', 'journal'], questionTypes: [], difficulties: ['medium', 'easy'], sets: 'easy' },
  4: { templateKinds: ['numeric', 'journal'], questionTypes: [], difficulties: ['complex', 'medium'], sets: 'medium', formats: ['easy', 'medium'] },
  6: { fallback: { marks: 3, count: 2 }, sets: 'complex', formats: ['complex'] },
} as const;

/** The CBSE Class 11 pattern: 80 marks in 3 hours, 34 questions of 1, 3, 4 and 6 marks, in two parts. */
const FULL: PaperBlueprint = {
  kind: 'full',
  title: 'Full paper',
  marks: 80,
  minutes: 180,
  sections: [
    {
      part: 'A',
      title: 'Theoretical Framework',
      topics: { unit: 'Theoretical Framework' },
      marks: 12,
      questions: { 1: 6, 3: 2, 4: 0, 6: 0 },
    },
    {
      part: 'A',
      title: 'Accounting Process',
      topics: { unit: 'Accounting Process' },
      marks: 44,
      questions: { 1: 10, 3: 2, 4: 1, 6: 4 },
    },
    {
      part: 'B',
      title: 'Financial Statements of Sole Proprietorship',
      // Unit 3 of the syllabus: Final Accounts without and with Adjustments, and Incomplete Records (the statement of
      // affairs method), every playable topic of the unit "Financial Statements" in the course catalogue.
      topics: { unit: 'Financial Statements' },
      marks: 24,
      questions: { 1: 4, 3: 2, 4: 2, 6: 1 },
    },
  ],
  // The integrated stages of Class 11: the books, the bank and their errors together; the whole year to the final accounts.
  favouredStages: ['books-and-errors', 'whole-year'],
};

/** Half-yearly: the first eight topics of the course, up to Bank Reconciliation Statement. */
const HALF: PaperBlueprint = {
  kind: 'half',
  title: 'Half-yearly paper',
  marks: 40,
  minutes: 90,
  sections: [{ title: 'First eight topics', topics: { first: 8 }, marks: 40, questions: { 1: 10, 3: 4, 4: 3, 6: 1 } }],
};

/** A short test on one topic of the learner's choice. */
const TOPIC: PaperBlueprint = {
  kind: 'topic',
  title: 'Topic test',
  marks: 20,
  minutes: 40,
  sections: [{ title: 'One topic', topics: { chosen: true }, marks: 20, questions: { 1: 6, 3: 2, 4: 2, 6: 0 } }],
};

/**
 * Stages of case studies (ids of CASE_STAGES) that no mock paper sets: their cases are played everywhere else (the
 * topic's level, the Case studies screen, Mixed cases, a Marathon, a worksheet of the topic). A paper is rebuilt from
 * its reference, so a stage of a section's topics that joined the 6-mark turns later would change every paper of that
 * section, those already sat among them. The list is kept here and not in a blueprint because a paper carries its
 * blueprint: a new field there would change every paper too. Applied where the bank is built (`courseBank`).
 */
export const STAGES_OUTSIDE_PAPERS: readonly string[] = ['incomplete-records-cases', 'computerised-accounting-cases', 'accounting-basics', 'concepts-in-practice', 'provisions-reserves-cases'];

/** The papers of Class 11, and of any course that has none of its own. */
export const BLUEPRINTS: Record<PaperKind, PaperBlueprint> = { full: FULL, half: HALF, topic: TOPIC };

// ---------------------------------------------------------------------------------------------------------------
// Class 12 (CBSE code 055): 80 marks in 3 hours, 34 questions. Part A (60 marks) is Accounting for Partnership Firms
// (36) and Accounting for Companies (24); Part B (20 marks) is Analysis of Financial Statements (12) and Cash Flow
// Statement (8). Part A has sixteen 1-mark, four 3-mark, two 4-mark and four 6-mark questions; Part B has four
// 1-mark, two 3-mark, one 4-mark and one 6-mark question. Within a part the questions are shared between its two
// units so that each unit comes to its marks exactly, the way the board's own papers share them:
//   Partnership  11 x 1 + 3 x 3 + 1 x 4 + 2 x 6 = 36      Companies   5 x 1 + 1 x 3 + 1 x 4 + 2 x 6 = 24
//   Analysis      2 x 1 + 2 x 3 + 1 x 4         = 12      Cash flow   2 x 1                 + 1 x 6 =  8
// The unit names are those of the course catalogue (content/courses/cbse12.ts).
// ---------------------------------------------------------------------------------------------------------------

const FULL_12: PaperBlueprint = {
  kind: 'full',
  title: 'Full paper',
  marks: 80,
  minutes: 180,
  sections: [
    { part: 'A', title: 'Accounting for Partnership Firms', topics: { unit: 'Accounting for Partnership Firms' }, marks: 36, questions: { 1: 11, 3: 3, 4: 1, 6: 2 } },
    { part: 'A', title: 'Accounting for Companies', topics: { unit: 'Accounting for Companies' }, marks: 24, questions: { 1: 5, 3: 1, 4: 1, 6: 2 } },
    { part: 'B', title: 'Analysis of Financial Statements', topics: { unit: 'Analysis of Financial Statements' }, marks: 12, questions: { 1: 2, 3: 2, 4: 1, 6: 0 } },
    { part: 'B', title: 'Cash Flow Statement', topics: { unit: 'Cash Flow Statement' }, marks: 8, questions: { 1: 2, 3: 0, 4: 0, 6: 1 } },
  ],
  // The integrated stages of Class 12: the life of a firm; a company from its issue to its analysis.
  favouredStages: ['firm-life', 'company-year'],
};

/** Half-yearly: the six topics on partnership firms, which is what a school has taught by then. */
const HALF_12: PaperBlueprint = {
  kind: 'half',
  title: 'Half-yearly paper',
  marks: 40,
  minutes: 90,
  sections: [{ title: 'Accounting for Partnership Firms', topics: { unit: 'Accounting for Partnership Firms' }, marks: 40, questions: { 1: 10, 3: 4, 4: 3, 6: 1 } }],
};

/** The papers of Class 12. Its topic test is the one every course has. */
export const CLASS12_BLUEPRINTS: Record<PaperKind, PaperBlueprint> = { full: FULL_12, half: HALF_12, topic: TOPIC };

// ---------------------------------------------------------------------------------------------------------------
// Class 12 with Computerised Accounting as Part B (the option a school may take in place of Analysis of Financial
// Statements: content/courseOptions.ts). Part A is the same, section for section, so the same paper number sets the
// same Part A. Part B (20 marks) has the questions of the sample paper's Part B, all from the one unit:
//   Computerised Accounting   4 x 1 + 2 x 3 + 1 x 4 + 1 x 6 = 20
// The 6-mark question is a schedule to prepare (a complex format, a loan repayment schedule): the unit's case studies
// stay outside the papers (`STAGES_OUTSIDE_PAPERS`). Without a schedule it would be two 3-mark questions.
// ---------------------------------------------------------------------------------------------------------------

const FULL_12_CAS: PaperBlueprint = {
  ...FULL_12,
  sections: [
    ...FULL_12.sections.filter((s) => s.part === 'A'),
    { part: 'B', title: 'Computerised Accounting', topics: { unit: 'Computerised Accounting' }, marks: 20, questions: { 1: 4, 3: 2, 4: 1, 6: 1 } },
  ],
};

/** The papers of Class 12 for a learner who takes Computerised Accounting as Part B. */
export const CLASS12_CAS_BLUEPRINTS: Record<PaperKind, PaperBlueprint> = { full: FULL_12_CAS, half: HALF_12, topic: TOPIC };

/** The papers of each course that has papers of its own, by course id. */
const COURSE_BLUEPRINTS: Record<string, Record<PaperKind, PaperBlueprint>> = {
  'cbse-11-accountancy': BLUEPRINTS,
  'cbse-12-accountancy': CLASS12_BLUEPRINTS,
};

/**
 * The three papers of a course, as a learner with this choice sits them: Class 12 with Computerised Accounting as Part
 * B has its own full paper. Without a choice, the papers of the default.
 */
export const blueprintsOf = (courseId: string, choice?: CourseChoice | null): Record<PaperKind, PaperBlueprint> => {
  if (courseId === PART_B_COURSE && partBOf(choice) === 'computerised') return CLASS12_CAS_BLUEPRINTS;
  return Object.hasOwn(COURSE_BLUEPRINTS, courseId) ? COURSE_BLUEPRINTS[courseId] : BLUEPRINTS;
};

/** How many questions a blueprint has (a case study is one question). */
export const questionCount = (blueprint: PaperBlueprint): number =>
  blueprint.sections.reduce((n, s) => n + MARK_VALUES.reduce((m, value) => m + s.questions[value], 0), 0);

/** True for a paper that is set on one topic of the learner's choice. */
export const needsTopic = (blueprint: PaperBlueprint): boolean => blueprint.sections.some((s) => 'chosen' in s.topics);

/**
 * The marks each unit carries in the board's full paper of a course, by the unit's name in the course catalogue: what
 * the Topics screen says beside a unit's heading. A unit the full paper does not set on its own has none.
 */
export function unitMarksOf(courseId: string, choice?: CourseChoice | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of blueprintsOf(courseId, choice).full.sections) if ('unit' in s.topics) out[s.topics.unit] = (out[s.topics.unit] ?? 0) + s.marks;
  return out;
}
