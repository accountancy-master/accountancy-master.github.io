'use client';

import { COURSES, findOutline } from '@/content/outline';
import { Frame } from '@/components/play/PlayFrame';
import { OtherCourse } from './OtherCourse';

/**
 * A level that is not in the learner's course as it stands (one of the other course, or of the Part B of Class 12 not
 * chosen), reached by a shared link: it says where the level is and offers the switch; once switched, the player
 * opens the level itself.
 */
export function LevelOfOtherCourse({ levelId, topicId }: { levelId: string; topicId: string }) {
  const topic = COURSES.flatMap((c) => c.topics).find((t) => t.id === topicId);
  const level = findOutline(topicId)?.levels.find((l) => l.id === levelId);
  if (!topic) return null;
  return (
    <Frame>
      <OtherCourse topic={topic} level={level?.title ?? 'This level'} testId="level-other-course" />
    </Frame>
  );
}
