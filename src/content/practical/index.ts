import type { PracticalCourse } from './types';

export type { PracticalCourse, ProjectOption, VivaQuestion } from './types';

// The project work of each course, imported only when it is asked for: no page carries it until "Project and viva"
// or "Go to" needs it.

const PRACTICALS: Record<string, () => Promise<{ default: PracticalCourse }>> = {
  'cbse-11-accountancy': () => import('./cbse11'),
  'cbse-12-accountancy': () => import('./cbse12'),
};

/** The course ids that have project work. */
export const PRACTICAL_COURSES: readonly string[] = Object.keys(PRACTICALS);

/** The project work of a course, or undefined for a course that has none. */
export async function loadPractical(courseId: string): Promise<PracticalCourse | undefined> {
  return Object.hasOwn(PRACTICALS, courseId) ? (await PRACTICALS[courseId]()).default : undefined;
}
