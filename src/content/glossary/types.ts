import type { PartB } from '@/content/courseOptions';

// The glossary and the exam tips of a course: plain data, written by hand (cbse11.ts, cbse12.ts, tips11.ts, tips12.ts)
// and checked by validate.ts (run by `npm run validate-content` and a unit test). The glossary page (/glossary) and the
// "Before the exam" page (/exam) import them only when they are opened.

/**
 * One term of the glossary of a course.
 *
 * - `id`: unique within the course, the term in kebab-case ("Goodwill" is "goodwill", "Trial Balance" is
 *   "trial-balance"). It is the anchor of the term on the glossary page: `/glossary#goodwill`.
 * - `term`: the term as it is written ("Goodwill", "Trial Balance").
 * - `also`: other names the term goes by ("Debtors" for "Trade Receivables"); search finds a term by them too.
 * - `definition`: one to three sentences, each ending with a full stop (or ? or !).
 * - `example`: a short example, if one helps.
 * - `topicId`: the topic of the course the term belongs to (where it is taught).
 * - `conceptId`: the concept of that topic it belongs to, when there is one; the page links to its practice.
 * - `seeAlso`: ids of other entries of the same glossary.
 */
export type GlossaryEntry = {
  id: string;
  term: string;
  also?: string[];
  definition: string;
  example?: string;
  topicId: string;
  conceptId?: string;
  seeAlso?: string[];
};

/**
 * The exam tips of a course: general tips, tips for each section (part) of the paper, and the common mistakes of each
 * topic. Every text is one tip, written as the student should act on it. The "Before the exam" page shows them as
 * checklists the learner can tick.
 *
 * - `sections[].title`: the title of a section of the course's full paper (learning/paperBlueprints.ts), such as
 *   "Accounting Process" or "Cash Flow Statement", or a part of it ("Part A", "Part B"), of the paper of either choice
 *   of Part B of Class 12 ("Computerised Accounting" is a section of the paper of that choice).
 * - `sections[].partB`: for a section that is for one choice of Part B only (content/courseOptions.ts), that choice:
 *   two sections may then have one title. A learner is given the sections of their own paper and choice.
 * - `mistakes[].topicId`: a topic of the course; the page groups the mistakes by topic and links to its practice.
 */
export type ExamTips = {
  courseId: string;
  general: string[];
  sections: { title: string; tips: string[]; partB?: PartB }[];
  mistakes: { topicId: string; text: string }[];
};
