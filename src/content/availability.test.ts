import { describe, expect, it } from 'vitest';
import { CATALOGUE_TOPIC_IDS, COURSE_CATALOGUES } from './courses';
import { CBSE11 } from './courses/cbse11';
import { CBSE12 } from './courses/cbse12';
import { ALL_PACKS, COURSES, PACKS, getCourse, getTopicPack, packsOf } from './registry';

describe('which topics are available', () => {
  const topics = getCourse('cbse-11-accountancy').topics;

  it('has a pack file for every real Class 11 topic, and each topic id once', () => {
    const catalogue = CBSE11.topics.map((t) => t.id);
    expect(new Set(catalogue).size).toBe(catalogue.length);
    // Capstone topics (mixed case studies, mock exams) have no pack yet.
    for (const id of catalogue.filter((x) => !['mixed-case-studies', 'mock-exams'].includes(x))) {
      expect(ALL_PACKS.some((p) => p.topicId === id), id).toBe(true);
    }
    expect(new Set(ALL_PACKS.map((p) => p.topicId)).size).toBe(ALL_PACKS.length);
  });

  it('only packs with levels can be played, found or opened', () => {
    expect(PACKS.every((p) => p.levels.length > 0)).toBe(true);
    for (const p of ALL_PACKS) expect(getTopicPack(p.topicId) !== undefined, p.topicId).toBe(p.levels.length > 0);
    expect(PACKS).toHaveLength(ALL_PACKS.filter((p) => p.levels.length > 0).length);
  });

  it('lists the playable packs in course order, which is the order of the catalogues, one course after another', () => {
    const position = (topicId: string) => CATALOGUE_TOPIC_IDS.indexOf(topicId);
    const order = PACKS.map((p) => position(p.topicId));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Course by course they are the playable topics of that course, in its own order, and together they are all.
    for (const course of COURSE_CATALOGUES) {
      expect(packsOf(course.id).map((p) => p.topicId), course.id).toEqual(course.topics.filter((t) => PACKS.some((p) => p.topicId === t.id)).map((t) => t.id));
    }
    expect(COURSE_CATALOGUES.flatMap((c) => packsOf(c.id))).toEqual(PACKS);
  });

  it('has a pack file for every Class 12 topic, playable or not yet', () => {
    for (const t of CBSE12.topics) expect(ALL_PACKS.some((p) => p.topicId === t.id), t.id).toBe(true);
    for (const topic of getCourse('cbse-12-accountancy').topics) {
      expect(topic.status === 'available', topic.id).toBe(PACKS.some((p) => p.topicId === topic.id));
    }
  });

  it('opens a topic as soon as its pack has levels, and otherwise keeps the catalogue status', () => {
    for (const topic of topics) {
      const catalogue = CBSE11.topics.find((t) => t.id === topic.id)!;
      const playable = PACKS.some((p) => p.topicId === topic.id);
      expect(topic.status, topic.id).toBe(playable ? 'available' : catalogue.status);
    }
  });

  it('never shows a topic without a playable pack as available', () => {
    for (const topic of topics) {
      if (!PACKS.some((p) => p.topicId === topic.id)) expect(topic.status, topic.id).not.toBe('available');
    }
  });

  it('leaves the catalogue itself untouched', () => {
    expect(COURSES[0]).not.toBe(CBSE11);
    for (const topic of topics) {
      if (PACKS.some((p) => p.topicId === topic.id)) {
        expect(CBSE11.topics.find((t) => t.id === topic.id), topic.id).not.toBe(topic);
      }
    }
  });
});
