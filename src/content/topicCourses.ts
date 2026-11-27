// Which course a topic belongs to, from ids alone (catalogue.generated.ts). The root layout needs this to keep what a
// learner did in one course apart from what they did in another, and it may import no more than ids: no outline, no
// course catalogue, no pack.
import { CATALOGUE_TOPICS, COURSE_IDS, COURSE_TOPIC_IDS } from './catalogue.generated';

const COURSE_OF = new Map<string, string>(Object.entries(COURSE_TOPIC_IDS).flatMap(([courseId, topicIds]) => topicIds.map((id): [string, string] => [id, courseId])));

/** The course of a topic of the catalogue, playable or not. Undefined for a topic the app does not know. */
export const courseOfTopicId = (topicId: string): string | undefined => COURSE_OF.get(topicId);

/** The courses that have something to play, in the order of the courses. */
export const PLAYABLE_COURSE_IDS: readonly string[] = COURSE_IDS.filter((id) => COURSE_TOPIC_IDS[id].some((topicId) => CATALOGUE_TOPICS.some((t) => t.id === topicId)));

/** What the app is, in a line: the description of every page and of the installed app. */
export const APP_DESCRIPTION = PLAYABLE_COURSE_IDS.length > 1 ? 'Learn Class 11 and Class 12 Accountancy by practice.' : 'Learn Class 11 Accountancy by practice.';

/** For a topic that is in no catalogue: the sample topic of the test build says which course it stands in. */
export function registerTopicCourse(topicId: string, courseId: string): void {
  COURSE_OF.set(topicId, courseId);
}
