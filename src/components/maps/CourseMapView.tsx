'use client';

import { useMemo } from 'react';
import { useCourse } from '@/app-state/useCourse';
import { useProgress } from '@/app-state/useProgress';
import { courseName } from '@/components/settings/CoursePicker';
import { choiceKey } from '@/content/courseOptions';
import { findCourse } from '@/content/outline';
import { courseLinks, courseMapTree } from '@/learning/mindMap';
import { MindMap } from './MindMap';

/**
 * The map of the learner's course: its units and topics, each topic with the learner's progress, and the links
 * between topics. It needs nothing but the outline that every page has: no topic is loaded.
 */
export function CourseMapView() {
  const { courseId, choice } = useCourse();
  const course = findCourse(courseId);
  const { progress, status } = useProgress();
  const ready = status === 'ready' ? progress : null;
  const name = course ? courseName(course) : '';
  // The topics the learner meets (Part B of Class 12 as chosen).
  const root = useMemo(() => courseMapTree(courseId, name, ready, choice), [courseId, name, ready, choice]);
  const links = useMemo(() => courseLinks(courseId, choice), [courseId, choice]);
  if (!course) return null;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Mind maps</h1>
        <p className="text-base text-muted">
          {name} at a glance: its units, its topics with how far you have got in each, and how the topics lean on each other. Open a topic for its own map of concepts, rules and
          question types.
        </p>
      </header>
      <MindMap key={`${courseId}|${choiceKey(choice)}`} root={root} title={name} wide="tree" links={links} />
    </div>
  );
}
