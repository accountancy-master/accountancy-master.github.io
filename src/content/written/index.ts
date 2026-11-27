import type { WrittenQuestion } from './types';

export type { WrittenForm, WrittenPoint, WrittenQuestion } from './types';

// The board-style written answers of each course, imported only when they are asked for: no page carries them until
// the written answers screen, a topic page or the Mistakes screen needs them.

const BANKS: Record<string, () => Promise<{ default: WrittenQuestion[] }>> = {
  'cbse-11-accountancy': () => import('./cbse11'),
  'cbse-12-accountancy': () => import('./cbse12'),
};

/** The written questions of a course: none for a course that has no bank. */
export async function loadWritten(courseId: string): Promise<readonly WrittenQuestion[]> {
  return Object.hasOwn(BANKS, courseId) ? (await BANKS[courseId]()).default : [];
}
