// The sample topic of Class 12 as a topic of the app, in the test build only (NEXT_PUBLIC_E2E): a browser test
// switches it on (Settings, "Sample Class 12 topic", or the key below in localStorage) to get a Class 12 course with
// something to play, whatever the real Class 12 topics hold. It is installed while the app starts, before any screen
// reads the outline: the topic is added to the end of the Class 12 catalogue, in a unit of its own, and its templates
// and its pack are registered at once (it is never fetched). A normal build never loads this file.
import { COURSE_CATALOGUES } from '@/content/courses';
import { registerPack } from '@/content/loaded';
import { installOutline, type OutlineData } from '@/content/outline';
import { OUTLINE } from '@/content/outline.generated';
import { registerTopicCourse } from '@/content/topicCourses';
import { outlineOf } from '@/content/outlineOf';
import type { Course } from '@/content/types';
import { registerTemplates } from '@/generators/loaded';
import { CLASS12_SAMPLE_META, CLASS12_SAMPLE_TOPIC, class12Pack, class12Templates } from './class12Topic';
import { E2E_CLASS12_KEY } from './e2eSampleRoutes';

/** The unit the sample stands in: one of its own, so that no paper of the course is set from it by its unit. */
export const E2E_SAMPLE_UNIT = 'Sample (tests only)';

/** The course catalogues with the sample topic at the end of Class 12. */
export function cataloguesWithSample(): Course[] {
  return COURSE_CATALOGUES.map((course) => (course.id === CLASS12_SAMPLE_META.courseId ? { ...course, topics: [...course.topics, { ...CLASS12_SAMPLE_META, unit: E2E_SAMPLE_UNIT }] } : course));
}

/** The outline with the sample topic after every other: the last topic of Class 12, which is the last course. */
export function outlineWithSample(base: OutlineData = OUTLINE): OutlineData {
  const templates = class12Templates(CLASS12_SAMPLE_TOPIC);
  registerTemplates(templates);
  const pack = class12Pack(CLASS12_SAMPLE_TOPIC);
  registerPack(pack);
  return { topics: [...base.topics.filter((t) => t.id !== CLASS12_SAMPLE_TOPIC), ...outlineOf([pack], templates, []).topics], stages: base.stages };
}

/** True when this device has the sample switched on. */
export function sampleSwitchedOn(): boolean {
  try {
    return window.localStorage.getItem(E2E_CLASS12_KEY) === '1';
  } catch {
    return false;
  }
}

/** Switches the sample on or off on this device. It takes effect the next time the app starts. */
export function switchSample(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(E2E_CLASS12_KEY, '1');
    else window.localStorage.removeItem(E2E_CLASS12_KEY);
  } catch {
    // No storage: the sample cannot be switched on here.
  }
}

/** Installs the sample when this device has it switched on. Called once, while the app starts. */
export function installSampleCourse(): void {
  if (!sampleSwitchedOn()) return;
  installOutline(outlineWithSample(), cataloguesWithSample());
  // What is done in the sample is kept under Class 12, like the outline says.
  registerTopicCourse(CLASS12_SAMPLE_TOPIC, CLASS12_SAMPLE_META.courseId);
}
