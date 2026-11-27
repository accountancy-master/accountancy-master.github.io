import { describe, expect, it } from 'vitest';
import { deriveShared } from '@/app-state/progressLoad';
import { findQuestion, getTopicPack } from '@/content/loaded';
import { OUTLINES, courseOfTopic, findCourse, installOutline, outlinesOf, playableCourses, topicOfLevel, topicTitle } from '@/content/outline';
import { COURSE_CATALOGUES } from '@/content/courses';
import { OUTLINE } from '@/content/outline.generated';
import { courseOfTopicId, registerTopicCourse } from '@/content/topicCourses';
import { generateQuestion } from '@/generators/loaded';
import { bankOf, paperAvailable } from '@/learning/mockPaper';
import { activeTopicIds } from '@/learning/topics';
import { nextLevel } from '@/learning/recommend';
import type { AttemptEvent, LevelResult } from '@/storage/types';
import { CLASS12_SAMPLE_TOPIC, class12Pack, class12Templates } from './class12Topic';
import { E2E_SAMPLE_UNIT, cataloguesWithSample, outlineWithSample } from './e2eCourse';
import { E2E_SAMPLE_ROUTES, E2E_SAMPLE_TOPIC } from './e2eSampleRoutes';

const C11 = 'cbse-11-accountancy';
const C12 = 'cbse-12-accountancy';

// What the test build of the app does when a browser test has switched the sample topic on.
installOutline(outlineWithSample(), cataloguesWithSample());

describe('the sample topic of Class 12 in the test build', () => {
  it('has the pages the route lists were given: its id and the id of every level', () => {
    expect(E2E_SAMPLE_TOPIC).toBe(CLASS12_SAMPLE_TOPIC);
    expect(E2E_SAMPLE_ROUTES).toEqual({ id: CLASS12_SAMPLE_TOPIC, levelIds: getTopicPack(CLASS12_SAMPLE_TOPIC)!.levels.map((l) => l.id) });
  });

  it('is the last topic of Class 12, in a unit of its own, playable and valid', () => {
    const course = findCourse(C12)!;
    expect(course.topics.at(-1)).toMatchObject({ id: CLASS12_SAMPLE_TOPIC, unit: E2E_SAMPLE_UNIT, status: 'available' });
    expect(outlinesOf(C12).at(-1)!.topicId).toBe(CLASS12_SAMPLE_TOPIC);
    expect(OUTLINES.at(-1)!.topicId).toBe(CLASS12_SAMPLE_TOPIC);
    expect(courseOfTopic(CLASS12_SAMPLE_TOPIC)).toBe(C12);
    expect(topicTitle(CLASS12_SAMPLE_TOPIC)).toBe('Sample of Class 12');
    expect(topicOfLevel('class-12-sample-formats-2')).toBe(CLASS12_SAMPLE_TOPIC);
    // Registered at once: nothing of it is fetched.
    const pack = getTopicPack(CLASS12_SAMPLE_TOPIC)!;
    expect(pack.levels.some((l) => l.type === 'look_back')).toBe(false);
    const q = generateQuestion('s12-new-ratio', 2);
    expect(findQuestion(q.id)).toEqual(q);
    expect(findQuestion('s12-q-002')).toMatchObject({ type: 'numeric', unit: 'ratio' });
    // The pack is the one the factory makes (the registry test checks that it is valid).
    expect(pack).toEqual(class12Pack(CLASS12_SAMPLE_TOPIC));
    expect(class12Templates(CLASS12_SAMPLE_TOPIC).map((t) => t.id)).toContain('s12-cash-flow');
  });

  it('makes Class 12 a course a learner can choose, and leaves Class 11 as it was', () => {
    expect(playableCourses().map((c) => c.id)).toEqual([C11, C12]);
    expect(outlinesOf(C11).map((o) => o.topicId)).toEqual(OUTLINE.topics.filter((t) => courseOfTopic(t.id) === C11).map((t) => t.id));
    expect(bankOf(C12).topics.map((t) => t.id)).toContain(CLASS12_SAMPLE_TOPIC);
    expect(paperAvailable('topic', bankOf(C12))).toBe(true);
    // No paper is set from the sample by its unit.
    expect(bankOf(C12).blueprints.full.sections.some((s) => 'unit' in s.topics && s.topics.unit === E2E_SAMPLE_UNIT)).toBe(false);
  });

  it('gives a learner who changes course the other course, and their first course back unchanged', () => {
    const T0 = Date.UTC(2026, 9, 5, 6);
    const attempt = (id: string, courseId: string, topicId: string, at: number): AttemptEvent => ({
      id, profileId: 'p', courseId, topicId, conceptId: 'c', questionId: `q-${id}`, difficulty: 'easy', correct: true, hintsUsed: 0, timeMs: 1, at, sessionId: `s-${id}`,
    });
    const level = (id: string, topicId: string, levelId: string, at: number): LevelResult => ({ id, profileId: 'p', topicId, levelId, score: 1, passed: true, at });
    const first = OUTLINE.topics[0];
    const lists = {
      attempts: [attempt('a', C11, first.id, T0), attempt('b', C12, CLASS12_SAMPLE_TOPIC, T0 + 1000)],
      levelResults: [level('l1', first.id, first.levels[0].id, T0), level('l2', CLASS12_SAMPLE_TOPIC, 'class-12-sample-level-0', T0 + 1000)],
      cardReviews: [],
      sessionResults: [],
    };
    const on12 = deriveShared(lists, T0 + 2000, C12, courseOfTopic);
    const on11 = deriveShared(lists, T0 + 2000, C11, courseOfTopic);
    expect(on12.progress.passedLevelIds).toEqual(['class-12-sample-level-0']);
    expect(on11.progress.passedLevelIds).toEqual([first.levels[0].id]);
    // What each screen then works from: the active topics and the level to carry on with are of the course.
    expect(activeTopicIds(outlinesOf(C12), on12.activity)).toEqual([CLASS12_SAMPLE_TOPIC]);
    expect(activeTopicIds(outlinesOf(C11), on11.activity)).toEqual([first.id]);
    expect(nextLevel(outlinesOf(C12), on12.progress.passedLevelIds, false, on12.activity)?.level.id).toBe('class-12-sample-level-1');
    expect(nextLevel(outlinesOf(C11), on11.progress.passedLevelIds, false, on11.activity)?.level.id).toBe(first.levels[1].id);
    // A learner new to Class 12 starts at its first playable topic, whatever they did in Class 11.
    const fresh = deriveShared({ ...lists, attempts: [lists.attempts[0]], levelResults: [lists.levelResults[0]] }, T0 + 2000, C12, courseOfTopic);
    expect(activeTopicIds(outlinesOf(C12), fresh.activity)).toEqual([outlinesOf(C12)[0].topicId]);
    expect(fresh.progress.answered).toBe(0);
  });

  it('says which course it stands in to the part of the app that knows topics by their ids alone', () => {
    // Every screen has the progress of the course from the root layout, which may import ids and no more.
    for (const course of COURSE_CATALOGUES) for (const t of course.topics) expect(courseOfTopicId(t.id), t.id).toBe(course.id);
    expect(courseOfTopicId('no-such-topic')).toBeUndefined();
    const lists = {
      attempts: [],
      levelResults: [{ id: 'l', profileId: 'p', topicId: CLASS12_SAMPLE_TOPIC, levelId: 'class-12-sample-level-0', score: 1, passed: true, at: 1000 }],
      cardReviews: [],
      sessionResults: [],
    };
    // Until it has said so, the result of a topic nobody knows is kept with the first course.
    expect(deriveShared(lists, 2000, C11).progress.passedLevelIds).toEqual(['class-12-sample-level-0']);
    registerTopicCourse(CLASS12_SAMPLE_TOPIC, C12);
    expect(courseOfTopicId(CLASS12_SAMPLE_TOPIC)).toBe(C12);
    expect(deriveShared(lists, 2000, C12).progress.passedLevelIds).toEqual(['class-12-sample-level-0']);
    expect(deriveShared(lists, 2000, C11).progress.passedLevelIds).toEqual([]);
  });
});
