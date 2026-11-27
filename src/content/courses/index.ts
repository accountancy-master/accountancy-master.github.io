import type { AccountGroup } from '@/engine/accounts';
import type { Course } from '../types';
import { CBSE11 } from './cbse11';
import { CBSE12, COMPUTERISED, PARTNERSHIP } from './cbse12';

// The courses as their catalogues list them: plain data, with no pack and no generator behind it. Which of their
// topics can be played is known to the registry (unit tests and scripts) and to the outline (the app).

/** Every course, the one a new learner joins first. A topic id belongs to one course only. */
export const COURSE_CATALOGUES: readonly Course[] = [CBSE11, CBSE12];

/** The course a new learner joins unless they choose another. */
export const DEFAULT_COURSE = CBSE11.id;

/** The topics of every course in the order of `COURSE_CATALOGUES`, each course in its own order: "course order". */
export const CATALOGUE_TOPIC_IDS: readonly string[] = COURSE_CATALOGUES.flatMap((c) => c.topics.map((t) => t.id));

const COURSE_OF_TOPIC: ReadonlyMap<string, string> = new Map(COURSE_CATALOGUES.flatMap((c) => c.topics.map((t) => [t.id, c.id] as const)));

/** The course a topic belongs to, or undefined for a topic of no course (a retired one, a fixture of a test). */
export const catalogueCourseOf = (topicId: string): string | undefined => COURSE_OF_TOPIC.get(topicId);

const PARTNERSHIP_TOPICS: ReadonlySet<string> = new Set(CBSE12.topics.filter((t) => t.unit === PARTNERSHIP).map((t) => t.id));
/** Computerised Accounting records the adjusting, closing and opening entries of a sole trader: the Class 11 chart. */
const CLASS12_TOPICS: ReadonlySet<string> = new Set(CBSE12.topics.filter((t) => t.unit !== COMPUTERISED).map((t) => t.id));

/**
 * The chart of accounts the entries of a topic draw their filler choices from (see `fillerAccounts`): the partnership
 * chart for Unit 1 of Class 12, the company chart for the rest of Part A and Part B (Analysis of Financial Statements),
 * and the Class 11 chart for every other topic, so that a Class 11 entry is never offered a Class 12 account. The
 * entries of Computerised Accounting are those of a sole trader's books kept on a computer, so they have the Class 11
 * chart too.
 */
export const accountGroupOf = (topicId: string): AccountGroup =>
  PARTNERSHIP_TOPICS.has(topicId) ? 'partnership' : CLASS12_TOPICS.has(topicId) ? 'company' : 'class11';
