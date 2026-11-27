import { describe, expect, it } from 'vitest';
import { COURSES, outlinesOf } from '@/content/outline';
import { deriveProgress, type Progress } from '@/learning/progress';
import { answeredByTopic, courseSummary, unitBars, weakestIdeas } from './summaries';

const C11 = 'cbse-11-accountancy';
const outlines = outlinesOf(C11);
const course = COURSES.find((c) => c.id === C11)!;
const fresh = deriveProgress([], [], 0);
const review = { intervalDays: 1, dueAt: 0, streak: 0 } as never;

describe('course summaries', () => {
  it('a new learner has started nothing in a course', () => {
    const s = courseSummary(outlines, fresh, new Map());
    expect(s).toEqual({ topics: outlines.length, started: 0, done: 0, levelsPassed: 0, levels: outlines.reduce((n, o) => n + o.levels.length, 0), mastery: 0 });
  });

  it('counts the topics started and the levels passed', () => {
    const [a, b] = outlines;
    const p: Progress = { ...fresh, passedLevelIds: a.levels.map((l) => l.id) };
    const s = courseSummary(outlines, p, answeredByTopic([{ topicId: b.topicId }, { topicId: b.topicId }]));
    expect(s.started).toBe(2);
    expect(s.done).toBe(1);
    expect(s.levelsPassed).toBe(a.levels.length);
  });

  it('puts the topics under their units, in catalogue order', () => {
    const bars = unitBars(course.topics, outlines, fresh, new Map());
    expect(bars.map((b) => b.unit)).toEqual([...new Set(course.topics.filter((t) => outlines.some((o) => o.topicId === t.id)).map((t) => t.unit))]);
    expect(bars.flatMap((b) => b.topics.map((t) => t.topic.id))).toEqual(course.topics.filter((t) => outlines.some((o) => o.topicId === t.id)).map((t) => t.id));
  });

  it('finds the weakest ideas among those practised, lowest first', () => {
    const [x, y, z] = outlines[0].concepts;
    const p: Progress = { ...fresh, concepts: { [x.id]: { mastery: 60, lastAt: 0, review }, [y.id]: { mastery: 12.4, lastAt: 0, review }, [z.id]: { mastery: 60, lastAt: 0, review } } };
    expect(weakestIdeas(outlines, p).map((w) => [w.conceptId, w.mastery])).toEqual([
      [y.id, 12],
      [x.id, 60],
      [z.id, 60],
    ]);
    expect(weakestIdeas(outlines, p, 1)).toHaveLength(1);
    expect(weakestIdeas(outlines, fresh)).toEqual([]);
  });
});
