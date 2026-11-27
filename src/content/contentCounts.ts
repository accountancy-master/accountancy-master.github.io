import type { Template } from '@/generators/types';
import type { CourseChoice } from './courseOptions';
import { outlinesOf, stagesOf, templateOutlinesOf } from './outline';
import type { Difficulty, TopicOutline } from './types';

// ---------------------------------------------------------------------------------------------------------------
// How much there is to play in each topic and each course: "What's inside", the topic cards and Home read it. Counted
// from the generated outline alone, so no topic's content is loaded to count it.
// ---------------------------------------------------------------------------------------------------------------

/** The kinds of question type, as a learner tells them apart. */
export const PATTERN_GROUPS = ['entries', 'sets', 'formats', 'choice', 'figures'] as const;
export type PatternGroup = (typeof PATTERN_GROUPS)[number];

export const PATTERN_GROUP_LABEL: Record<PatternGroup, string> = {
  entries: 'Journal entries',
  sets: 'Sets of entries',
  formats: 'Accounts and statements',
  choice: 'Multiple choice',
  figures: 'Calculations',
};

const GROUP_OF_KIND: Record<Template['kind'], PatternGroup> = {
  journal: 'entries',
  journal_set: 'sets',
  account: 'formats',
  statement: 'formats',
  mcq: 'choice',
  numeric: 'figures',
};

export const patternGroupOf = (kind: Template['kind']): PatternGroup => GROUP_OF_KIND[kind];

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'complex'];

export interface ContentCounts {
  levels: number;
  /** Levels that teach (a lesson). */
  lessons: number;
  cards: number;
  /** Questions written by an author (the generated ones are counted as patterns). */
  questions: number;
  /** Question patterns: templates that make a new question every time. */
  patterns: number;
  byGroup: Record<PatternGroup, number>;
  byDifficulty: Record<Difficulty, number>;
  /** Case studies at the end of the topic: those of every stage it closes. */
  cases: number;
}

const zeroGroups = (): Record<PatternGroup, number> => ({ entries: 0, sets: 0, formats: 0, choice: 0, figures: 0 });
const zeroDifficulties = (): Record<Difficulty, number> => ({ easy: 0, medium: 0, complex: 0 });

export const emptyCounts = (): ContentCounts => ({ levels: 0, lessons: 0, cards: 0, questions: 0, patterns: 0, byGroup: zeroGroups(), byDifficulty: zeroDifficulties(), cases: 0 });

/** What one topic holds. */
export function countTopic(
  outline: Pick<TopicOutline, 'levels' | 'cards' | 'questions'>,
  templates: readonly Pick<Template, 'kind' | 'difficulty'>[],
  cases: number,
): ContentCounts {
  const out = emptyCounts();
  out.levels = outline.levels.length;
  out.lessons = outline.levels.filter((l) => l.type === 'concept').length;
  out.cards = outline.cards.length;
  out.questions = outline.questions.length;
  out.patterns = templates.length;
  for (const t of templates) {
    out.byGroup[GROUP_OF_KIND[t.kind]]++;
    out.byDifficulty[t.difficulty]++;
  }
  out.cases = cases;
  return out;
}

/** The sum of several counts. */
export function addCounts(list: readonly ContentCounts[]): ContentCounts {
  const out = emptyCounts();
  for (const c of list) {
    out.levels += c.levels;
    out.lessons += c.lessons;
    out.cards += c.cards;
    out.questions += c.questions;
    out.patterns += c.patterns;
    out.cases += c.cases;
    for (const g of PATTERN_GROUPS) out.byGroup[g] += c.byGroup[g];
    for (const d of DIFFICULTIES) out.byDifficulty[d] += c.byDifficulty[d];
  }
  return out;
}

/**
 * What every playable topic of a course holds, in course order, and the course in all. With a learner's `choice`, the
 * topics that learner meets (Part B of Class 12: courseOptions.ts).
 */
export function courseCounts(courseId: string, choice?: CourseChoice | null): { topics: { topicId: string; counts: ContentCounts }[]; total: ContentCounts } {
  const templates = templateOutlinesOf(courseId, choice);
  const stages = stagesOf(courseId, choice);
  const topics = outlinesOf(courseId, choice).map((o) => ({
    topicId: o.topicId,
    counts: countTopic(
      o,
      templates.filter((t) => t.topicId === o.topicId),
      stages.filter((s) => s.topicId === o.topicId).reduce((n, s) => n + s.cases.length, 0),
    ),
  }));
  return { topics, total: addCounts(topics.map((t) => t.counts)) };
}
