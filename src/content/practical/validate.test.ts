import { describe, expect, it } from 'vitest';
import COURSE_11 from './cbse11';
import COURSE_12 from './cbse12';
import { PROJECT_TOPIC, type PracticalCourse, type VivaQuestion } from './types';
import { VIVA_MIN, badRupees, practicalCourseOf, validatePractical } from './validate';

const course11 = practicalCourseOf('cbse-11-accountancy')!;
const course12 = practicalCourseOf('cbse-12-accountancy')!;

describe('the project work as written', () => {
  it('passes its checks', () => {
    expect(validatePractical(COURSE_11, course11)).toEqual([]);
    expect(validatePractical(COURSE_12, course12)).toEqual([]);
  });

  it('has the options of the syllabus: three for Class 11, the analysis and the practical file for Class 12', () => {
    expect(COURSE_11.options.map((o) => o.id)).toEqual(['vouchers', 'brs', 'comprehensive']);
    expect(COURSE_12.options.map((o) => o.id)).toEqual(['fsa', 'computerised']);
    expect(COURSE_12.options[0].aspects?.map((a) => a.title)).toEqual(['Comparative and common size statements', 'Accounting ratios', 'Segment reports', 'Cash flow statement']);
    for (const c of [COURSE_11, COURSE_12]) expect(c.marks.map((m) => m.marks)).toEqual([12, 8]);
  });

  it('has a viva bank of at least 200 questions for each class, on every taught topic and the project itself', () => {
    for (const [c, info] of [[COURSE_11, course11], [COURSE_12, course12]] as const) {
      expect(c.viva.length).toBeGreaterThanOrEqual(VIVA_MIN.total);
      const topics = new Set(c.viva.map((q) => q.topicId));
      for (const t of info.taught) expect(topics.has(t), t).toBe(true);
      expect(topics.has(PROJECT_TOPIC)).toBe(true);
      expect(new Set(c.viva.map((q) => q.difficulty))).toEqual(new Set(['easy', 'medium', 'complex']));
    }
  });
});

describe('validatePractical', () => {
  const question = (over: Partial<VivaQuestion>): VivaQuestion => ({
    id: 'v11-001',
    question: 'What is a voucher?',
    answer: 'A document that records a transaction and the accounts it touches.',
    topicId: 'journal-entries',
    options: ['vouchers'],
    difficulty: 'easy',
    ...over,
  });
  const course = (viva: VivaQuestion[], over: Partial<PracticalCourse> = {}): PracticalCourse => ({ ...COURSE_11, viva, ...over });
  const errors = (viva: VivaQuestion[], over: Partial<PracticalCourse> = {}) => validatePractical(course(viva, over), course11);

  it('wants at least 200 questions, on every taught topic and every option', () => {
    const e = errors([question({})]);
    expect(e).toContain('practical cbse-11-accountancy: the viva bank has 1 questions, fewer than 200');
    expect(e.some((m) => /questions on ledger, fewer than 5/.test(m))).toBe(true);
    expect(e.some((m) => /for option brs, fewer than 10/.test(m))).toBe(true);
  });
  it('reports a bad id, a repeated id or question, an answer of more than three sentences and a missing question mark', () => {
    expect(errors([question({ id: 'q1' })]).some((m) => /must be v11-NNN/.test(m))).toBe(true);
    expect(errors([question({}), question({})]).some((m) => /duplicate id/.test(m))).toBe(true);
    expect(errors([question({}), question({ id: 'v11-002' })]).some((m) => /asked twice/.test(m))).toBe(true);
    expect(errors([question({ answer: 'One. Two. Three. Four.' })]).some((m) => /one to three sentences \(it has 4\)/.test(m))).toBe(true);
    expect(errors([question({ question: 'What is a voucher' })]).some((m) => /question mark/.test(m))).toBe(true);
  });
  it('reports a topic of the other course and an option that does not exist', () => {
    expect(errors([question({ topicId: 'goodwill' })]).some((m) => /goodwill is not a topic of cbse-11/.test(m))).toBe(true);
    expect(errors([question({ options: ['fsa'] })]).some((m) => /fsa is not a project option/.test(m))).toBe(true);
    expect(errors([question({ options: [] })]).some((m) => /suits no project option/.test(m))).toBe(true);
  });
  it('holds the house rules: no gendered pronoun, Indian grouping, nothing of interest on drawings in Class 11', () => {
    expect(errors([question({ answer: 'The owner signs it because he is the proprietor.' })]).some((m) => /gendered pronoun/.test(m))).toBe(true);
    expect(errors([question({ answer: 'Rent of ₹125,000 a year.' })]).some((m) => /₹125,000 is not grouped/.test(m))).toBe(true);
    expect(errors([question({ answer: 'Interest on drawings is charged at 6%.' })]).some((m) => /interest on drawings/.test(m))).toBe(true);
    expect(errors([], { marks: [{ part: 'File', marks: 10, what: 'x' }] })).toContain('practical cbse-11-accountancy: the marks add up to 10, not 20');
  });
});

describe('badRupees', () => {
  it('accepts Indian grouping and finds the rest', () => {
    expect(badRupees('₹500, ₹4,500, ₹45,000, ₹1,25,000, ₹10,00,000 and ₹2.5 lakh; ₹1,000.')).toEqual([]);
    expect(badRupees('₹125,000 and ₹4500 and ₹1,000,000')).toEqual(['₹125,000', '₹4500', '₹1,000,000']);
  });
});
