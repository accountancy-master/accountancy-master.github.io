import { partBOf, topicShown, type CourseChoice } from '@/content/courseOptions';
import { blueprintsOf } from '@/learning/paperBlueprints';
import type { ExamTips, GlossaryEntry } from './types';

export type { ExamTips, GlossaryEntry } from './types';

// The glossary and the exam tips of each course, each imported only when it is asked for: no page carries them
// until the glossary, the "Before the exam" page or "Go to" needs them.

const GLOSSARIES: Record<string, () => Promise<{ default: GlossaryEntry[] }>> = {
  'cbse-11-accountancy': () => import('./cbse11'),
  'cbse-12-accountancy': () => import('./cbse12'),
};

const TIPS: Record<string, () => Promise<{ default: ExamTips }>> = {
  'cbse-11-accountancy': () => import('./tips11'),
  'cbse-12-accountancy': () => import('./tips12'),
};

/** The course ids that have a glossary. */
export const GLOSSARY_COURSES: readonly string[] = Object.keys(GLOSSARIES);

/** The glossary of a course (none for a course that has none). */
export async function loadGlossary(courseId: string): Promise<GlossaryEntry[]> {
  return Object.hasOwn(GLOSSARIES, courseId) ? (await GLOSSARIES[courseId]()).default : [];
}

/** The exam tips of a course, or undefined for a course that has none. */
export async function loadTips(courseId: string): Promise<ExamTips | undefined> {
  return Object.hasOwn(TIPS, courseId) ? (await TIPS[courseId]()).default : undefined;
}

/**
 * The exam tips a learner with this choice of Part B of Class 12 is given (content/courseOptions.ts): the sections
 * of their own full paper (and its parts) that are for their choice, and the common mistakes of the topics they meet.
 * With the default choice they are the tips as they always were.
 */
export function tipsFor(tips: ExamTips, courseId: string, choice?: CourseChoice | null): ExamTips {
  const full = blueprintsOf(courseId, choice).full.sections;
  const titles = new Set([...full.map((s) => s.title), ...full.flatMap((s) => (s.part ? [`Part ${s.part}`] : []))]);
  const partB = partBOf(choice);
  return {
    ...tips,
    sections: tips.sections.filter((s) => titles.has(s.title) && (s.partB === undefined || s.partB === partB)),
    mistakes: tips.mistakes.filter((m) => topicShown(m.topicId, choice)),
  };
}

/** The terms of a glossary a learner with this choice meets: those of the topics of the choice of Part B not made are left out. */
export const glossaryFor = (entries: readonly GlossaryEntry[], choice?: CourseChoice | null): GlossaryEntry[] => entries.filter((e) => topicShown(e.topicId, choice));
