// ---------------------------------------------------------------------------------------------------------------
// The options of a course. CBSE lets a school teach Part B of Class 12 in one of two ways: Analysis of Financial
// Statements (units 3 and 4: the company's statements, their analysis, ratios and the cash flow statement), or
// Computerised Accounting in its place. A learner says which in Settings, and the choice is kept with the learner
// (`Profile.class12PartB`). Without a choice a learner has Analysis of Financial Statements, which is what the app
// has always taught: then nothing anywhere changes.
//
// The topics of the two choices are all in the Class 12 catalogue; a learner meets those of the choice made, and never
// those of the other. Everything a learner's course lists (Topics, What's inside, Practice, Marathon, the maps, the mock
// papers and worksheets, the exam pack, Go to) asks `topicShown` with the learner's choice, through the outline
// (`outlinesOf(courseId, choice)` and its neighbours in outline.ts) or `useCourse`.
//
// Plain data, which imports nothing: the stores read a choice with it, and the root layout, which may import no course
// catalogue, carries the stores. The topics of each choice are named here by id; a unit test checks them against the
// units of the catalogue (content/courses/cbse12.ts).
// ---------------------------------------------------------------------------------------------------------------

export const PART_B_CHOICES = ['analysis', 'computerised'] as const;
export type PartB = (typeof PART_B_CHOICES)[number];

/** What a learner who has never chosen has: Analysis of Financial Statements. */
export const DEFAULT_PART_B: PartB = 'analysis';

/** What the learner chose of the options of a course. A profile is one; none at all is the default of every option. */
export interface CourseChoice {
  /** Part B of Class 12. Left out: Analysis of Financial Statements. */
  class12PartB?: PartB;
}

export const PART_B_LABEL: Record<PartB, string> = {
  analysis: 'Analysis of Financial Statements',
  computerised: 'Computerised Accounting',
};

/** The course the option belongs to. */
export const PART_B_COURSE = 'cbse-12-accountancy';

/**
 * The topics each choice of Part B brings: those of the units Analysis of Financial Statements and Cash Flow Statement,
 * and those of the unit Computerised Accounting, in the order of the catalogue.
 */
export const PART_B_TOPICS: Record<PartB, readonly string[]> = {
  analysis: ['company-financial-statements', 'financial-statement-analysis', 'accounting-ratios', 'cash-flow-statement'],
  computerised: ['computerised-accounting'],
};

const CHOICE_OF_TOPIC: ReadonlyMap<string, PartB> = new Map(PART_B_CHOICES.flatMap((c) => PART_B_TOPICS[c].map((id) => [id, c] as const)));

/** True for a value that can be kept as a choice of Part B. */
export const isPartB = (value: unknown): value is PartB => typeof value === 'string' && (PART_B_CHOICES as readonly string[]).includes(value);

/** The learner's choice of Part B; the default when there is none (or none that this version knows). */
export function partBOf(choice?: CourseChoice | null): PartB {
  const chosen = choice?.class12PartB;
  return isPartB(chosen) ? chosen : DEFAULT_PART_B;
}

// One value for each choice, so that a choice read from a profile is the same value from one render to the next.
const CHOICES: Record<PartB, CourseChoice> = { analysis: {}, computerised: { class12PartB: 'computerised' } };

/** The choice a learner has made (a profile is one), as one fixed value for each choice: the default is `{}`. */
export const choiceOf = (learner?: CourseChoice | null): CourseChoice => CHOICES[partBOf(learner)];

/** The choice of Part B a topic belongs to, or undefined for a topic every learner of its course meets. */
export const partBOfTopic = (topicId: string): PartB | undefined => CHOICE_OF_TOPIC.get(topicId);

/** True for a topic a learner with this choice meets: every topic but those of the Part B not chosen. */
export function topicShown(topicId: string, choice?: CourseChoice | null): boolean {
  const own = CHOICE_OF_TOPIC.get(topicId);
  return own === undefined || own === partBOf(choice);
}

/**
 * True when one learner can meet both topics: they are not of two different choices of Part B. A topic's Look back
 * draws only on the topics before it that it meets (a topic of Computerised Accounting never looks back on ratios).
 */
export function topicsMeet(a: string, b: string): boolean {
  const ca = CHOICE_OF_TOPIC.get(a), cb = CHOICE_OF_TOPIC.get(b);
  return ca === undefined || cb === undefined || ca === cb;
}

/** The choice that shows every one of these topics, if one does: the choice a worksheet of them was made for. */
export function choiceForTopics(topicIds: Iterable<string>): CourseChoice | null {
  const found = new Set([...topicIds].map((id) => CHOICE_OF_TOPIC.get(id)).filter((c): c is PartB => c !== undefined));
  if (found.size > 1) return null;
  const [only] = found;
  return only === undefined || only === DEFAULT_PART_B ? {} : { class12PartB: only };
}

/** The choice as a key: '' for the default, so that what is cached for the default is what was always cached. */
export const choiceKey = (choice?: CourseChoice | null): string => (partBOf(choice) === DEFAULT_PART_B ? '' : partBOf(choice));
