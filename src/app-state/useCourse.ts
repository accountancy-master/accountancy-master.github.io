'use client';

import { choiceOf, topicShown, type CourseChoice } from '@/content/courseOptions';
import { courseOfTopic, outlinesOf, stagesOf, type StageOutline } from '@/content/outline';
import type { TopicOutline } from '@/content/types';
import { useStore } from './StoreProvider';

export interface CourseView {
  /** The course of the selected learner; '' when no learner is selected. */
  courseId: string;
  /**
   * What the learner chose of the options of the course (Part B of Class 12: content/courseOptions.ts), the same
   * value for as long as the choice is the same. Pass it on to whatever lists the course's topics, banks or papers
   * outside this view.
   */
  choice: CourseChoice;
  /** The playable topics of that course the learner meets, in its order. The same list for as long as the course and the choice are the same. */
  packs: TopicOutline[];
  /** The stages of case studies of that course, of the topics the learner meets. */
  stages: StageOutline[];
  /**
   * True for a topic of that course that the learner meets: a learner never plays, practises or reads a topic of
   * another course, nor one of the choice of Part B they have not made.
   */
  has(topicId: string): boolean;
}

/**
 * The course the selected learner is on: every screen lists, practises and counts its topics and no others. A learner
 * who changes course in Settings sees the other course at once, with whatever they had done in it before; one who
 * changes Part B of Class 12 sees the topics of that choice in place of the others, in the same way.
 */
export function useCourse(): CourseView {
  const { profile } = useStore();
  const courseId = profile?.courseId ?? '';
  const choice = choiceOf(profile);
  return {
    courseId,
    choice,
    packs: outlinesOf(courseId, choice),
    stages: stagesOf(courseId, choice),
    has: (topicId) => courseId !== '' && courseOfTopic(topicId) === courseId && topicShown(topicId, choice),
  };
}
