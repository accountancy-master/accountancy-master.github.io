import { describe, expect, it } from 'vitest';
import { CASE_STAGES } from '@/generators/cases';
import { playableCourses } from '../outline';
import { APP_DESCRIPTION, PLAYABLE_COURSE_IDS, courseOfTopicId } from '../topicCourses';
import { CBSE11 } from './cbse11';
import { CBSE12 } from './cbse12';
import { CATALOGUE_TOPIC_IDS, COURSE_CATALOGUES, DEFAULT_COURSE, accountGroupOf, catalogueCourseOf } from './index';

describe('CBSE12 course', () => {
  it('is Class 12 Accountancy, with its twelve topics in the order of the syllabus, unit by unit, and the option of Part B last', () => {
    expect({ id: CBSE12.id, title: CBSE12.title }).toEqual({ id: 'cbse-12-accountancy', title: 'Class 12 Accountancy (CBSE)' });
    expect(CBSE12.topics.map((t) => [t.unit, t.id, t.kind])).toEqual([
      ['Accounting for Partnership Firms', 'partnership-fundamentals', 'practical'],
      ['Accounting for Partnership Firms', 'goodwill', 'practical'],
      ['Accounting for Partnership Firms', 'change-in-profit-sharing-ratio', 'practical'],
      ['Accounting for Partnership Firms', 'admission-of-a-partner', 'practical'],
      ['Accounting for Partnership Firms', 'retirement-and-death-of-a-partner', 'practical'],
      ['Accounting for Partnership Firms', 'dissolution-of-partnership', 'practical'],
      ['Accounting for Companies', 'share-capital', 'practical'],
      ['Accounting for Companies', 'debentures', 'practical'],
      ['Analysis of Financial Statements', 'company-financial-statements', 'theory'],
      ['Analysis of Financial Statements', 'financial-statement-analysis', 'practical'],
      ['Analysis of Financial Statements', 'accounting-ratios', 'practical'],
      ['Cash Flow Statement', 'cash-flow-statement', 'practical'],
      // Computerised Accounting, which a school may teach as Part B in place of the two units before it
      // (courseOptions.ts): last, so that no topic before it moved.
      ['Computerised Accounting', 'computerised-accounting', 'practical'],
    ]);
  });

  it('says of every topic what it is and why it matters, and files it under its own course', () => {
    for (const t of CBSE12.topics) {
      expect(t.courseId, t.id).toBe('cbse-12-accountancy');
      expect(t.status, t.id).not.toBe('available');
      for (const text of [t.title, t.description, t.whyItMatters]) expect(text.trim().length, t.id).toBeGreaterThan(10);
      expect(t.description.endsWith('.') && t.whyItMatters.endsWith('.'), t.id).toBe(true);
    }
    expect(CBSE12.previews).toEqual([]);
  });

  it('keeps every unit in one run, so headings never repeat', () => {
    const units = CBSE12.topics.map((t) => t.unit);
    expect(units.filter((u, i) => i === 0 || u !== units[i - 1])).toEqual([...new Set(units)]);
  });
});

describe('the courses together', () => {
  it('are Class 11 and then Class 12, and a new learner joins Class 11', () => {
    expect(COURSE_CATALOGUES).toEqual([CBSE11, CBSE12]);
    expect(DEFAULT_COURSE).toBe('cbse-11-accountancy');
  });

  it('never use a topic id twice, so a topic belongs to one course', () => {
    expect(new Set(CATALOGUE_TOPIC_IDS).size).toBe(CATALOGUE_TOPIC_IDS.length);
    expect(CATALOGUE_TOPIC_IDS).toEqual([...CBSE11.topics, ...CBSE12.topics].map((t) => t.id));
    for (const course of COURSE_CATALOGUES) for (const t of course.topics) expect(catalogueCourseOf(t.id), t.id).toBe(course.id);
    expect(catalogueCourseOf('no-such-topic')).toBeUndefined();
  });

  it('write every topic id in lower-case words joined by hyphens, with no dot (a paper is named by one)', () => {
    for (const id of CATALOGUE_TOPIC_IDS) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('give the entries of a topic the chart of accounts of its unit', () => {
    for (const t of CBSE11.topics) expect(accountGroupOf(t.id), t.id).toBe('class11');
    // Computerised Accounting records a sole trader's adjusting, closing and opening entries: the Class 11 chart.
    expect(CBSE12.topics.map((t) => accountGroupOf(t.id))).toEqual([...Array(6).fill('partnership'), ...Array(6).fill('company'), 'class11']);
    // A topic of no course (a fixture of a test) is given what it always was.
    expect(accountGroupOf('no-such-topic')).toBe('class11');
  });

  it('end every stage of case studies on a topic of a course, the Class 12 stages in the order of the plan', () => {
    for (const stage of CASE_STAGES) expect(catalogueCourseOf(stage.topicId), stage.id).toBeDefined();
    const class12 = CASE_STAGES.filter((s) => catalogueCourseOf(s.topicId) === CBSE12.id);
    expect(class12.map((s) => [s.id, s.topicId, s.conceptId])).toEqual([
      ['partnership-accounts', 'partnership-fundamentals', 'pf-case'],
      ['reconstitution', 'retirement-and-death-of-a-partner', 'ret-case'],
      ['dissolution', 'dissolution-of-partnership', 'dis-case'],
      // The integrated stages close a topic that closes a stage already, after it.
      ['firm-life', 'dissolution-of-partnership', 'dis-integrated'],
      ['company-accounts', 'debentures', 'deb-case'],
      ['analysis', 'cash-flow-statement', 'cf-case'],
      ['company-year', 'cash-flow-statement', 'cf-integrated'],
      // The stage of the other choice of Part B.
      ['computerised-accounting-cases', 'computerised-accounting', 'cas-case'],
    ]);
    expect(new Set(CASE_STAGES.map((s) => s.id)).size).toBe(CASE_STAGES.length);
    expect(new Set(CASE_STAGES.map((s) => s.conceptId)).size).toBe(CASE_STAGES.length);
  });

  it('is known by its ids alone where no more may be imported: the course of a topic, and what the app says it teaches', () => {
    for (const course of COURSE_CATALOGUES) for (const t of course.topics) expect(courseOfTopicId(t.id), t.id).toBe(catalogueCourseOf(t.id));
    expect(PLAYABLE_COURSE_IDS).toEqual(playableCourses().map((c) => c.id));
    // The description names Class 12 once it has a topic to play, whichever topics those are.
    expect(APP_DESCRIPTION).toBe(PLAYABLE_COURSE_IDS.includes(CBSE12.id) ? 'Learn Class 11 and Class 12 Accountancy by practice.' : 'Learn Class 11 Accountancy by practice.');
  });
});
