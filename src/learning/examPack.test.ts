import { describe, expect, it } from 'vitest';
import { findCourse, outlinesOf, templatesForConcept } from '@/content/outline';
import { genId } from '@/generators/ids';
import {
  READING_MINUTES,
  addDays,
  examPlan,
  finalDaysOf,
  frequentMistakes,
  notStartedTopics,
  paperPattern,
  splitMinutes,
  unitWeights,
  weakestConcepts,
  type Miss,
} from './examPack';
import { blueprintsOf } from './paperBlueprints';
import type { Progress } from './progress';

const C11 = 'cbse-11-accountancy';
const C12 = 'cbse-12-accountancy';

const progressOf = (over: Partial<Progress> = {}): Progress => ({
  xp: 0,
  streak: { count: 0, lastDay: null },
  concepts: {},
  questions: {},
  passedLevelIds: [],
  answered: 0,
  correct: 0,
  xpByDay: {},
  missionDoneDays: [],
  challengeDoneDays: [],
  ...over,
});
const concept = (mastery: number) => ({ mastery, lastAt: 0, review: { intervalDays: 1, dueAt: 0, ease: 2.5, reps: 0 } }) as unknown as Progress['concepts'][string];

describe('the time split of a paper', () => {
  it('shares the minutes in proportion to marks, in whole minutes that add up', () => {
    expect(splitMinutes([12, 44, 24], 180)).toEqual([27, 99, 54]);
    expect(splitMinutes([36, 24, 12, 8], 180)).toEqual([81, 54, 27, 18]);
    // Remainders go to the largest fractions, the earlier first.
    expect(splitMinutes([1, 1, 1], 10)).toEqual([4, 3, 3]);
    expect(splitMinutes([10, 20, 10], 90).reduce((a, b) => a + b)).toBe(90);
    expect(splitMinutes([0, 0], 30)).toEqual([0, 0]);
  });

  it('gives the pattern of the full paper of each course, with the reading time on top', () => {
    const p11 = paperPattern(blueprintsOf(C11).full);
    expect(p11.marks).toBe(80);
    expect(p11.minutes).toBe(180);
    expect(p11.readingMinutes).toBe(READING_MINUTES);
    expect(READING_MINUTES).toBe(15);
    expect(p11.questions).toBe(34);
    expect(p11.sections.map((s) => s.minutes).reduce((a, b) => a + b)).toBe(180);
    expect(p11.sections.reduce((n, s) => n + s.marks, 0)).toBe(80);
    const p12 = paperPattern(blueprintsOf(C12).full);
    expect(p12.byMark).toEqual({ 1: 20, 3: 6, 4: 3, 6: 5 });
    expect(p12.sections[0]).toMatchObject({ part: 'A', title: 'Accounting for Partnership Firms', marks: 36, count: 17, minutes: 81 });
  });
});

describe('the units by weight', () => {
  it('puts the unit with the most marks first, each with its topics and the mastery of them', () => {
    const course = findCourse(C11)!;
    const outlines = outlinesOf(C11);
    const je = outlines.find((o) => o.topicId === 'journal-entries')!;
    const units = unitWeights(blueprintsOf(C11).full, course.topics, outlines, progressOf({ concepts: Object.fromEntries(je.concepts.map((c) => [c.id, concept(80)])) }));
    expect(units.map((u) => u.marks)).toEqual([...units.map((u) => u.marks)].sort((a, b) => b - a));
    expect(units[0].unit).toBe('Accounting Process');
    expect(units[0].share).toBeCloseTo(44 / 80);
    const topic = units[0].topics.find((t) => t.topicId === 'journal-entries')!;
    expect(topic).toMatchObject({ mastery: 80, started: true });
    expect(units[0].topics.find((t) => t.topicId === 'ledger')).toMatchObject({ mastery: 0, started: false });
  });
});

describe('weakest concepts and topics not started', () => {
  const outlines = outlinesOf(C11);
  const course = findCourse(C11)!;
  it('lists the attempted concepts, lowest mastery first, each with where to practise it', () => {
    const [a, b, c] = outlines.find((o) => o.topicId === 'journal-entries')!.concepts;
    const weak = weakestConcepts(outlines, progressOf({ concepts: { [a.id]: concept(60), [b.id]: concept(20), [c.id]: concept(20) } }));
    expect(weak.map((w) => [w.conceptId, w.mastery])).toEqual([[b.id, 20], [c.id, 20], [a.id, 60]]);
    expect(weak[0].href).toMatch(/^\/playground\?topic=journal-entries&pattern=|^\/practice\/topic\/journal-entries$/);
    expect(weakestConcepts(outlines, progressOf())).toEqual([]);
  });
  it('lists the topics with nothing done yet, each from its first level', () => {
    const first = outlines[0];
    const all = notStartedTopics(course.topics, outlines, progressOf());
    expect(all.length).toBe(outlines.length);
    expect(all[0]).toEqual({ topicId: first.topicId, title: course.topics.find((t) => t.id === first.topicId)!.title, href: `/play/${first.levels.find((l) => l.order === 0)!.id}` });
    const after = notStartedTopics(course.topics, outlines, progressOf({ passedLevelIds: [first.levels[0].id] }));
    expect(after.map((t) => t.topicId)).not.toContain(first.topicId);
    const conceptOnly = notStartedTopics(course.topics, outlines, progressOf({ concepts: { [first.concepts[0].id]: concept(5) } }));
    expect(conceptOnly.map((t) => t.topicId)).not.toContain(first.topicId);
  });
});

describe('frequent mistakes', () => {
  const je = outlinesOf(C11).find((o) => o.topicId === 'journal-entries')!;
  const template = templatesForConcept(je.concepts[1].id)[0];
  const miss = (over: Partial<Miss>): Miss => ({ topicId: 'journal-entries', conceptId: je.concepts[0].id, questionId: 'q1', correct: false, at: 1, ...over });
  const attempts: Miss[] = [
    miss({ questionId: 'q1', mistakeCode: 'swapped', at: 1 }),
    miss({ questionId: 'q2', mistakeCode: 'swapped', at: 2 }),
    miss({ questionId: 'q3', at: 3 }),
    miss({ questionId: 'q1', correct: true, at: 4 }),
    miss({ conceptId: je.concepts[1].id, questionId: genId(template, 7), at: 5 }),
    miss({ topicId: 'ledger', conceptId: 'x', questionId: 'l1', at: 6 }),
    miss({ topicId: 'goodwill', conceptId: 'gw-nature', questionId: 'g1', at: 7 }),
  ];
  const progress = { questions: { q2: { attempts: 1, lastCorrect: false, mistakeOpen: true }, q1: { attempts: 2, lastCorrect: true, mistakeOpen: false } } };

  it('groups the misses of the course by topic and by kind, the most frequent first', () => {
    const groups = frequentMistakes(attempts, progress, { topicIds: ['journal-entries', 'ledger'] });
    expect(groups.map((g) => [g.topicId, g.count])).toEqual([['journal-entries', 4], ['ledger', 1]]);
    const [top, ...rest] = groups[0].mistakes;
    expect(top).toMatchObject({ conceptId: je.concepts[0].id, mistakeCode: 'swapped', count: 2, open: 1 });
    expect(rest.map((m) => m.count)).toEqual([1, 1]);
    // The miss of a generated question leads to its own pattern in the Playground.
    expect(rest[0].href).toBe(`/playground?topic=journal-entries&pattern=${template.id}`);
  });
  it('keeps to the limits it is given, and has nothing to say with no misses', () => {
    expect(frequentMistakes(attempts, progress, { topicIds: ['journal-entries', 'ledger'], topics: 1, perTopic: 1 })).toHaveLength(1);
    expect(frequentMistakes(attempts, progress, { topicIds: ['journal-entries'], perTopic: 1 })[0].mistakes).toHaveLength(1);
    expect(frequentMistakes([], progress, { topicIds: ['journal-entries'] })).toEqual([]);
  });
});

describe('the plan to the exam', () => {
  const T = (id: string) => ({ id, title: id.toUpperCase() });
  const today = '2027-01-01';

  it('counts dates across months', () => {
    expect(addDays('2027-01-30', 3)).toBe('2027-02-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('has one day for every day to the exam, the last days for revision and a mock paper every few days', () => {
    const plan = examPlan({ today, examDay: addDays(today, 20), notStarted: [T('a'), T('b')], weak: [T('c')], openMistakes: 3 });
    expect(plan).toHaveLength(20);
    expect(plan[0].date).toBe(today);
    expect(plan[19].date).toBe(addDays(today, 19));
    expect(finalDaysOf(20)).toBe(2);
    expect(plan.slice(-2).map((d) => d.kind)).toEqual(['mistakes', 'sheets']);
    // 18 days before the final ones: a mock every fourth day and on the last of them.
    expect(plan.flatMap((d, i) => (d.kind === 'mock' ? [i] : []))).toEqual([3, 7, 11, 15, 17]);
    // Topics not started first, in order, then the weakest.
    expect(plan.filter((d) => d.topics).map((d) => [d.kind, d.topics!.map((t) => t.id)])).toEqual([
      ['new', ['a']],
      ['new', ['b']],
      ['weak', ['c']],
    ]);
    expect(plan[0]).toMatchObject({ title: 'Start A', href: '/topics/a' });
    expect(plan[2]).toMatchObject({ title: 'Strengthen C', href: '/practice/topic/c' });
    // The rest alternate practice and mistakes.
    expect(plan[4].kind).toBe('practice');
    expect(plan[5].kind).toBe('mistakes');
  });

  it('shares many topics over few days, several to a day', () => {
    const plan = examPlan({ today, examDay: addDays(today, 6), notStarted: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(T), weak: [], openMistakes: 0 });
    // 6 days: 1 final (sheets), 5 before it with mocks on days 3 and 5: 3 working days for 7 topics.
    expect(plan.map((d) => d.kind)).toEqual(['new', 'new', 'mock', 'new', 'mock', 'sheets']);
    expect(plan.filter((d) => d.topics).map((d) => d.topics!.length)).toEqual([3, 2, 2]);
    expect(plan[0]).toMatchObject({ title: 'Start A, B and C', href: '/topics' });
  });

  it('keeps the very last days for revision, with cards in place of mistakes when none are open', () => {
    expect(examPlan({ today, examDay: addDays(today, 1), notStarted: [T('a')], weak: [], openMistakes: 2 }).map((d) => d.kind)).toEqual(['sheets']);
    expect(examPlan({ today, examDay: addDays(today, 2), notStarted: [], weak: [], openMistakes: 2 }).map((d) => d.kind)).toEqual(['mistakes', 'sheets']);
    expect(examPlan({ today, examDay: addDays(today, 2), notStarted: [], weak: [], openMistakes: 0 }).map((d) => d.kind)).toEqual(['cards', 'sheets']);
    expect(examPlan({ today, examDay: addDays(today, 40), notStarted: [], weak: [], openMistakes: 1 }).slice(-3).map((d) => d.kind)).toEqual(['cards', 'mistakes', 'sheets']);
  });

  it('has nothing to suggest on the day or after it', () => {
    expect(examPlan({ today, examDay: today, notStarted: [T('a')], weak: [], openMistakes: 0 })).toEqual([]);
    expect(examPlan({ today, examDay: addDays(today, -3), notStarted: [], weak: [], openMistakes: 0 })).toEqual([]);
  });

  it('with a long time to go, sits a mock paper weekly', () => {
    const plan = examPlan({ today, examDay: addDays(today, 60), notStarted: [], weak: [], openMistakes: 0 });
    expect(plan).toHaveLength(60);
    const mocks = plan.flatMap((d, i) => (d.kind === 'mock' ? [i] : []));
    expect(mocks.slice(0, 3)).toEqual([6, 13, 20]);
    expect(mocks.at(-1)).toBe(56);
  });
});
